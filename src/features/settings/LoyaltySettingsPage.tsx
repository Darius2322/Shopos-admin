import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { getLoyaltySettings, saveLoyaltySettings, LoyaltySettings } from '../../lib/loyalty';

export function LoyaltySettingsPage() {
  const { business, profile } = useAuth();
  const canEdit = profile?.role === 'owner';
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (business) getLoyaltySettings(business.id).then(setSettings);
  }, [business?.id]);

  if (!business || !settings) return null;

  async function save() {
    if (!settings) return;
    setSaving(true); setSaved(false);
    try {
      await saveLoyaltySettings(settings);
      setSaved(true);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-4">Loyalty program</h1>
      {!canEdit && <p className="text-xs text-slate-500 mb-4">Only the owner can edit these settings.</p>}
      <div className="card p-4 space-y-3.5">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Enable loyalty program</span>
          <input type="checkbox" checked={settings.enabled} disabled={!canEdit}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Points earned</span>
            <input className="input tnum" type="number" value={settings.pointsPerAmount} disabled={!canEdit}
              onChange={(e) => setSettings({ ...settings, pointsPerAmount: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Per amount spent ({business.currency})</span>
            <input className="input tnum" type="number" value={settings.amountPerPoint} disabled={!canEdit}
              onChange={(e) => setSettings({ ...settings, amountPerPoint: parseFloat(e.target.value) || 0 })} />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Example: {settings.pointsPerAmount} point{settings.pointsPerAmount !== 1 ? 's' : ''} for every{' '}
          {business.currency} {settings.amountPerPoint.toLocaleString()} spent.
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">Minimum purchase to earn points</span>
          <input className="input tnum" type="number" value={settings.minPurchase} disabled={!canEdit}
            onChange={(e) => setSettings({ ...settings, minPurchase: parseFloat(e.target.value) || 0 })} />
        </label>

        <label className="flex items-center justify-between">
          <span className="text-sm">Count tax toward points</span>
          <input type="checkbox" checked={settings.countTax} disabled={!canEdit}
            onChange={(e) => setSettings({ ...settings, countTax: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">Count discounted amount toward points</span>
          <input type="checkbox" checked={settings.countDiscount} disabled={!canEdit}
            onChange={(e) => setSettings({ ...settings, countDiscount: e.target.checked })} />
        </label>

        {canEdit && (
          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  );
}
