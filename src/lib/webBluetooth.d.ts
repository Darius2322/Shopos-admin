// TypeScript's bundled DOM lib doesn't include the Web Bluetooth API.
// Only the handful of members thermalPrinter.ts actually uses are declared
// here — this is not a full spec type, just enough for a clean build.
interface BluetoothRemoteGATTCharacteristic {
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
}
interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}
interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
}
interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}
interface Navigator {
  bluetooth?: {
    requestDevice(options: { filters: { services: string[] }[]; optionalServices?: string[] }): Promise<BluetoothDevice>;
    getDevices?(): Promise<BluetoothDevice[]>;
  };
}
