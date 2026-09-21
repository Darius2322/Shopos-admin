import { db, enqueueSync } from './db';
import type { DeviceSession } from './types';

const STORAGE_KEY = 'shopos-device-id';

/** One id per browser/device, persisted in localStorage — deliberately NOT
 * regenerated per login, so re-logging in on the same phone updates the
 * same device row instead of piling up a new one every time. */
function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

function detectDeviceType(): DeviceSession['deviceType'] {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ') || 'Unknown device';
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/** Upserts this device's row now, then keeps it fresh every 60s while the
 * tab is visible. Deliberately does NOT heartbeat while the tab is hidden
 * or the app is closed — that's exactly what lets a device naturally age
 * from "online" into "offline" in the UI within a couple of minutes,
 * without needing any explicit sign-out to notice. */
export function startDeviceHeartbeat(businessId: string, profileId: string, branchId: string | null): void {
  stopDeviceHeartbeat();

  const beat = async () => {
    if (document.visibilityState !== 'visible') return;
    const id = getDeviceId();
    const existing = await db.deviceSessions.get(id);
    const record: DeviceSession = {
      id, businessId, profileId,
      branchId: branchId ?? null,
      deviceName: existing?.deviceName ?? detectDeviceName(),
      deviceType: detectDeviceType(),
      userAgent: navigator.userAgent,
      lastActiveAt: new Date().toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      syncStatus: 'pending'
    };
    await db.deviceSessions.put(record);
    await enqueueSync('deviceSessions', id, existing ? 'update' : 'create');
  };

  beat();
  heartbeatInterval = setInterval(beat, 60_000);
  document.addEventListener('visibilitychange', beat);
}

export function stopDeviceHeartbeat(): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

export function thisDeviceId(): string {
  return getDeviceId();
}
