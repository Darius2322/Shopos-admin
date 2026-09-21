import { db } from './db';
import type { Business, Branch, Customer, Sale, SaleItem, PrinterDevice } from './types';
import { buildReceiptLines } from './receiptFormat';

// Most inexpensive ESC/POS Bluetooth thermal printers (the kind sold for
// M-Pesa/receipt printing in Kenya) expose this "printer" GATT service —
// it's the de-facto convention used by the majority of generic 58mm/80mm
// units, not an official Bluetooth SIG spec. A printer that uses a
// different service isn't supported by this module; there is no universal
// standard here, only this common convention. Web Bluetooth itself is only
// available in Chromium browsers (Chrome/Edge on Android/desktop) — not
// Safari/iOS, which has no Web Bluetooth support at all.
const PRINTER_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC = '00002af1-0000-1000-8000-00805f9b34fb';

let activeDevice: BluetoothDevice | null = null;
let activeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export function currentPrinterName(): string | null {
  return activeDevice?.name ?? null;
}

/** Opens the browser's native device picker. Resolves once connected and
 * remembers the device locally so it shows up under "Devices connected"
 * next time, even before it's reconnected. */
export async function connectPrinter(): Promise<PrinterDevice> {
  if (!isBluetoothSupported()) throw new Error('This browser has no Bluetooth support — try Chrome on Android.');

  const device = await navigator.bluetooth!.requestDevice({
    filters: [{ services: [PRINTER_SERVICE] }],
    optionalServices: [PRINTER_SERVICE],
  });
  await connectToKnownDevice(device);

  const record: PrinterDevice = {
    id: device.id,
    name: device.name || 'Unnamed printer',
    lastConnectedAt: new Date().toISOString(),
    isDefault: (await db.printers.count()) === 0, // first paired printer becomes the default
  };
  await db.printers.put(record);
  return record;
}

async function connectToKnownDevice(device: BluetoothDevice): Promise<void> {
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE);
  const characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC);
  activeDevice = device;
  activeCharacteristic = characteristic;
}

/** Re-opens a connection to a printer this device has paired with before,
 * without showing the picker again. Only works if the browser still holds
 * permission for that device (Chrome keeps this until the user revokes it
 * in site settings) — if not, the caller should fall back to
 * connectPrinter(). */
export async function reconnectPrinter(deviceId: string): Promise<boolean> {
  if (!isBluetoothSupported() || !navigator.bluetooth!.getDevices) return false;
  try {
    const devices: BluetoothDevice[] = await navigator.bluetooth!.getDevices!();
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return false;
    await connectToKnownDevice(device);
    return true;
  } catch {
    return false;
  }
}

export async function forgetPrinter(deviceId: string): Promise<void> {
  if (activeDevice?.id === deviceId) {
    activeDevice.gatt?.disconnect();
    activeDevice = null;
    activeCharacteristic = null;
  }
  await db.printers.delete(deviceId);
}

export async function setDefaultPrinter(deviceId: string): Promise<void> {
  await db.transaction('rw', db.printers, async () => {
    const all = await db.printers.toArray();
    for (const p of all) await db.printers.update(p.id, { isDefault: p.id === deviceId });
  });
}

// ---------------------------------------------------------------------------
// ESC/POS receipt formatting
// ---------------------------------------------------------------------------

const ESC = 0x1b, GS = 0x1d;
const CHARS_PER_LINE = 32; // standard for 58mm thermal paper at default font

function textToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}
function center(line: string): number[] {
  return [ESC, 0x61, 0x01, ...textToBytes(line + '\n'), ESC, 0x61, 0x00];
}
function bold(line: string): number[] {
  return [ESC, 0x45, 0x01, ...textToBytes(line + '\n'), ESC, 0x45, 0x00];
}
function line(text: string): number[] {
  return textToBytes(text + '\n');
}
function twoColumns(left: string, right: string): number[] {
  const space = Math.max(1, CHARS_PER_LINE - left.length - right.length);
  return line(left + ' '.repeat(space) + right);
}
function threeColumns(a: string, b: string, c: string, widths: [number, number, number]): number[] {
  const pad = (s: string, w: number, right = false) =>
    s.length >= w ? s.slice(0, w) : right ? ' '.repeat(w - s.length) + s : s + ' '.repeat(w - s.length);
  return line(pad(a, widths[0]) + pad(b, widths[1], true) + ' ' + pad(c, widths[2], true));
}
function divider(): number[] {
  return line('-'.repeat(CHARS_PER_LINE));
}
function feedAndCut(): number[] {
  return [0x0a, 0x0a, 0x0a, GS, 0x56, 0x00]; // feed 3 lines, full cut
}
/** Native ESC/POS QR code print command (GS ( k) — supported by most
 * modern ESC/POS firmwares. If the connected printer's firmware doesn't
 * support it, this segment is silently ignored by the printer rather than
 * erroring — the rest of the receipt still prints. */
function qrCode(data: string): number[] {
  const bytes = textToBytes(data);
  const len = bytes.length + 3;
  const pL = len & 0xff, pH = (len >> 8) & 0xff;
  return [
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // model
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06, // module size
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31, // error correction
    GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes, // store data
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, // print
  ];
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ReceiptExtras { branch?: Branch | null; customer?: Customer | null; mpesaRef?: string | null; qrContent?: string | null }

/** Builds the ESC/POS bytes for one receipt from the SAME line layout the on-screen
 * preview uses (lib/receiptFormat.ts), so the printout matches the preview exactly. */
export function buildReceiptBytes(business: Business, sale: Sale, items: SaleItem[], servedBy: string, extra: ReceiptExtras = {}): Uint8Array {
  const bytes: number[] = [ESC, 0x40]; // initialize
  const lines = buildReceiptLines({ business, branch: extra.branch, sale, items, customer: extra.customer, servedBy, mpesaRef: extra.mpesaRef });
  for (const l of lines) bytes.push(...(l.bold ? bold(l.text) : line(l.text)));
  bytes.push(...line(''));
  bytes.push(...[ESC, 0x61, 0x01]);                 // centre the QR
  bytes.push(...qrCode(extra.qrContent ?? `${business.name} | Receipt ${sale.receiptNumber} | ${money(sale.total)}`));
  bytes.push(...[ESC, 0x61, 0x00]);
  bytes.push(...feedAndCut());
  return new Uint8Array(bytes);
}

/** Sends receipt bytes to whichever printer is connected, chunked to stay
 * under typical BLE write sizes (many cheap modules cap around 100-180
 * bytes per write) with a short pause between chunks so the printer's
 * buffer isn't overrun. Throws if nothing is connected — callers should
 * catch this and fall back to the browser print dialog. */
export async function printToThermalPrinter(bytes: Uint8Array): Promise<void> {
  if (!activeCharacteristic) throw new Error('No thermal printer connected.');
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await activeCharacteristic.writeValueWithoutResponse(bytes.slice(i, i + CHUNK));
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Convenience: tries to (re)connect to the default saved printer, prints,
 * and reports whether it actually reached a thermal printer (so the caller
 * knows whether to also/instead offer the browser print dialog). */
export async function printReceiptThermally(business: Business, sale: Sale, items: SaleItem[], servedBy: string, extra: ReceiptExtras = {}): Promise<boolean> {
  if (!activeCharacteristic) {
    const defaultPrinter = (await db.printers.toArray()).find((p) => p.isDefault);
    if (!defaultPrinter) return false;
    const ok = await reconnectPrinter(defaultPrinter.id);
    if (!ok) return false;
  }
  try {
    await printToThermalPrinter(buildReceiptBytes(business, sale, items, servedBy, extra));
    return true;
  } catch {
    return false;
  }
}
