import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bluetooth, Printer, Star, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { db, enqueueSync } from '../../lib/db';
import {
  connectPrinter, forgetPrinter, isBluetoothSupported, printReceiptThermally,
  reconnectPrinter, setDefaultPrinter, currentPrinterName,
} from '../../lib/thermalPrinter';
import type { Sale, SaleItem } from '../../lib/types';

export function PrinterSettingsPage() {
  const { business, profile } = useAuth();
  const canEdit = profile?.role === 'owner';
  const printers = useLiveQuery(() => db.printers.toArray(), []) ?? [];
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const supported = isBluetoothSupported();

  const [printMode, setPrintMode] = useState<'auto' | 'manual'>(business?.receiptPrintMode ?? 'manual');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (business) setPrintMode(business.receiptPrintMode); }, [business?.id]);

  if (!business) return null;
  const biz = business; // narrowed, stable reference for the closures below

  async function savePrintMode(mode: 'auto' | 'manual') {
    setPrintMode(mode);
    setSaving(true); setSaved(false);
    try {
      await db.businesses.put({ ...biz, receiptPrintMode: mode, updatedAt: new Date().toISOString(), syncStatus: 'pending' } as any);
      await enqueueSync('businesses', biz.id, 'update');
      setSaved(true);
    } finally { setSaving(false); }
  }

  async function connect() {
    setConnecting(true); setConnectError(null);
    try {
      await connectPrinter();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Could not connect to a printer.');
    } finally { setConnecting(false); }
  }

  async function testPrint(deviceId: string) {
    setTestStatus('Connecting…');
    const ok = await reconnectPrinter(deviceId);
    if (!ok) { setTestStatus('Could not reconnect — try "Connect a printer" again.'); return; }
    setTestStatus('Printing test receipt…');
    const now = new Date().toISOString();
    const fakeSale: Sale = {
      id: 'test', businessId: biz.id, branchId: '', userId: '', receiptNumber: 'TEST-0001',
      status: 'completed', subtotal: 100, discount: 0, tax: 0, total: 100, amountPaid: 100, balanceDue: 0,
      paymentMethod: 'cash', createdAt: now, updatedAt: now,
    };
    const fakeItems: SaleItem[] = [{ id: 't1', saleId: 'test', productId: 'p1', productName: 'Test item', quantity: 1, unitPrice: 100, unitCost: 0, discount: 0, lineTotal: 100 }];
    const printed = await printReceiptThermally(biz, fakeSale, fakeItems, profile?.fullName ?? 'Test');
    setTestStatus(printed ? 'Test receipt sent.' : 'Printing failed — check the printer is on and in range.');
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-4">Receipts & printer</h1>
      {!canEdit && <p className="text-xs text-slate-500 mb-4">Only the owner can change these settings.</p>}

      <div className="card p-4 space-y-3 mb-4">
        <h2 className="font-display font-semibold text-sm text-slate-500">Printing</h2>
        <p className="text-xs text-slate-500 -mt-1">Choose whether a receipt prints the instant a sale completes, or only when the cashier taps Print.</p>
        <div className="flex gap-2">
          <button
            disabled={!canEdit || saving}
            onClick={() => savePrintMode('auto')}
            className={`flex-1 rounded-card px-3 py-2 text-sm font-medium border ${printMode === 'auto' ? 'bg-field-600 text-white border-field-600' : 'border-slate-200 text-slate-600'}`}
          >
            Auto-print
          </button>
          <button
            disabled={!canEdit || saving}
            onClick={() => savePrintMode('manual')}
            className={`flex-1 rounded-card px-3 py-2 text-sm font-medium border ${printMode === 'manual' ? 'bg-field-600 text-white border-field-600' : 'border-slate-200 text-slate-600'}`}
          >
            Manual
          </button>
        </div>
        {saved && <p className="text-xs text-field-600">Saved.</p>}
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-display font-semibold text-sm text-slate-500">Devices connected</h2>
        {!supported && (
          <p className="text-xs text-amber-600 bg-amber-500/10 rounded-card p-2.5">
            This browser doesn't support Bluetooth printing (Web Bluetooth needs Chrome or Edge on Android or desktop — it isn't available on iPhone/iPad Safari).
            Receipts will still print through the normal browser print dialog to a USB/network-connected printer.
          </p>
        )}
        {supported && (
          <>
            {printers.length === 0 && <p className="text-sm text-slate-500">No printer paired yet.</p>}
            <div className="space-y-2">
              {printers.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-card px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1.5 truncate">
                      <Bluetooth className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {p.name}
                      {p.isDefault && <span className="text-[11px] font-medium text-field-600 bg-field-600/10 px-1.5 py-0.5 rounded-full">Default</span>}
                    </div>
                    <div className="text-xs text-slate-400">Last connected {new Date(p.lastConnectedAt).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!p.isDefault && (
                      <button title="Set as default" onClick={() => setDefaultPrinter(p.id)} className="p-1.5 text-slate-400 hover:text-amber-500"><Star className="w-4 h-4" /></button>
                    )}
                    <button title="Test print" onClick={() => testPrint(p.id)} className="p-1.5 text-slate-400 hover:text-field-600"><Printer className="w-4 h-4" /></button>
                    <button title="Forget device" onClick={() => forgetPrinter(p.id)} className="p-1.5 text-slate-400 hover:text-rust-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={connect} disabled={connecting} className="btn-secondary w-full flex items-center justify-center gap-1.5 text-sm">
              <Bluetooth className="w-4 h-4" /> {connecting ? 'Opening device picker…' : 'Connect a printer'}
            </button>
            {connectError && <p className="text-xs text-rust-600">{connectError}</p>}
            {testStatus && <p className="text-xs text-slate-500">{testStatus}</p>}
            <p className="text-xs text-slate-400">
              Supports common 58mm/80mm Bluetooth ESC/POS thermal printers. The device picker only shows printers already in pairing mode nearby.
            </p>
          </>
        )}
        {currentPrinterName() && <p className="text-xs text-field-600">Currently connected: {currentPrinterName()}</p>}
      </div>
    </div>
  );
}
