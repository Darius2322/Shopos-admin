import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { X, Search, ChevronRight, LogOut, Trash2, Activity, MapPin, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { ThemeSwitch } from '../ThemeSwitch';
import { tileColor } from '../../lib/tileColors';

export interface MoreGroup { label?: string; items: { to: string; label: string; icon: LucideIcon; end?: boolean }[] }

interface Props {
  groups: MoreGroup[];
  badges: Record<string, number>;
  businessName: string;
  logoUrl?: string | null;
  userName: string;
  roleLabel: string;
  branchName?: string | null;
  health: { healthy: boolean; offline: boolean; title: string; detail: string };
  syncLabel: string;
  syncTone: string;
  lastSyncAt: string | null;
  onClose: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || 'S';
}

/** Phone "More" screen: a business profile hero, a searchable 2-column grid of colourful tiles,
 * then appearance, account and the system status at the bottom. */
export function MoreMenu({ groups, badges, businessName, logoUrl, userName, roleLabel, branchName, health, syncLabel, syncTone, lastSyncAt, onClose, onSignOut, onDeleteAccount }: Props) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);
  }, [groups, query]);

  const dot = health.healthy ? 'bg-emerald-400' : health.offline ? 'bg-amber-400' : 'bg-rose-400';
  const headline = health.healthy ? 'System is healthy' : health.offline ? 'System is offline' : 'System needs attention';

  return (
    <div className="md:hidden fixed inset-0 z-30 bg-paper flex flex-col">
      <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {/* ── Business profile hero ───────────────────────────────────────── */}
        <div className="relative overflow-hidden px-4 pt-4 pb-6 text-white"
          style={{ backgroundImage: 'linear-gradient(135deg, #071845 0%, #0b3a8c 55%, #0e9f8e 100%)' }}>
          <div aria-hidden="true" className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10" />
          <div aria-hidden="true" className="absolute right-10 -bottom-16 w-40 h-40 rounded-full bg-white/5" />
          <div className="relative flex justify-end">
            <button aria-label="Close menu" onClick={onClose} className="w-10 h-10 -mr-1 rounded-full bg-white/15 flex items-center justify-center active:bg-white/25"><X className="w-5 h-5" /></button>
          </div>
          <div className="relative flex items-center gap-4 mt-1">
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/30 bg-white shrink-0" />
              : <BrandMark className="w-16 h-16 rounded-2xl ring-2 ring-white/30 shrink-0" />}
            <div className="min-w-0">
              <h1 className="font-display font-semibold text-xl leading-tight truncate">{businessName}</h1>
              <div className="text-sm text-white/80 truncate">{userName}</div>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full px-3 py-1.5 capitalize"><ShieldCheck className="w-3.5 h-3.5" /> {roleLabel || 'Team member'}</span>
            {branchName && <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full px-3 py-1.5"><MapPin className="w-3.5 h-3.5" /> {branchName}</span>}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full px-3 py-1.5"><span className={`w-2 h-2 rounded-full ${dot}`} /> {health.healthy ? 'All synced' : health.offline ? 'Offline' : 'Needs attention'}</span>
          </div>
        </div>

        <div className="px-4 -mt-3 relative space-y-5">
          <label className="relative block">
            <span className="sr-only">Search menu</span>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search menu" className="input !pl-10 shadow-md" inputMode="search" />
          </label>

          {shown.length === 0 && <p className="text-sm text-slate-500 text-center py-6">Nothing matches “{query}”.</p>}

          {shown.map((group, gi) => (
            <section key={gi} aria-label={group.label ?? 'Main'}>
              {group.label && <h2 className="px-1 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{group.label}</h2>}
              <div className="grid grid-cols-2 gap-3">
                {group.items.map((item) => {
                  const c = tileColor(item.to);
                  return (
                    <NavLink
                      key={item.to} to={item.to} end={item.end}
                      className={({ isActive }) => `relative rounded-2xl border p-3.5 min-h-[92px] flex flex-col justify-between gap-3 transition-transform active:scale-[0.97] ${isActive ? 'border-field-600 bg-field-50' : 'border-slate-200 bg-paper-raised'}`}
                    >
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.bg, color: c.color }}><item.icon className="w-6 h-6" /></span>
                      <span className="text-[14px] font-semibold leading-tight">{item.label}</span>
                      {!!badges[item.to] && (
                        <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold bg-rust-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{badges[item.to] > 9 ? '9+' : badges[item.to]}</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </section>
          ))}

          {!query && (
            <>
              <section aria-label="Appearance" className="card px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[15px] font-medium">Appearance</span>
                <ThemeSwitch />
              </section>

              <section aria-label="Account" className="grid grid-cols-2 gap-3">
                <button onClick={onSignOut} className="rounded-2xl border border-slate-200 bg-paper-raised p-3.5 min-h-[92px] flex flex-col justify-between gap-3 text-left active:scale-[0.97] transition-transform">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-500/15 text-slate-500"><LogOut className="w-6 h-6" /></span>
                  <span className="text-[14px] font-semibold">Sign out</span>
                </button>
                <button onClick={onDeleteAccount} className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5 min-h-[92px] flex flex-col justify-between gap-3 text-left active:scale-[0.97] transition-transform">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-rose-500/15 text-rose-500"><Trash2 className="w-6 h-6" /></span>
                  <span className="text-[14px] font-semibold text-rose-500">Delete account</span>
                </button>
              </section>

              <NavLink to="/sync" className="card p-4 flex items-center gap-3 min-h-[72px]" aria-label="System status. Open Sync Center">
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${health.healthy ? 'bg-emerald-500/15 text-emerald-500' : health.offline ? 'bg-amber-500/15 text-amber-500' : 'bg-rose-500/15 text-rose-500'}`}><Activity className="w-6 h-6" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{headline}</span>
                  <span className="block text-xs text-slate-500 truncate">{health.detail}</span>
                  <span className={`block text-xs mt-0.5 ${syncTone}`}>{syncLabel}{lastSyncAt ? ` · last synced ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
              </NavLink>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
