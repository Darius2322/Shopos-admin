import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { SiteAnalytics } from '../components/SiteAnalytics';
import { PackageStats } from '../components/PackageStats';
import { PlatformInsights } from '../components/PlatformInsights';

type Sub = 'visitors' | 'businesses' | 'sales' | 'mpesa' | 'packages';
const SUBS: [Sub, string][] = [['visitors', 'Visitors'], ['businesses', 'Businesses'], ['sales', 'Sales'], ['mpesa', 'M-Pesa'], ['packages', 'Packages']];

/** Analytics, in sub-menus: who visits, how businesses grow and stay active, what they sell, M-Pesa money, and package choices. */
export default function Analytics({ supabase }: { supabase: SupabaseClient }) {
  const [sub, setSub] = useState<Sub>(() => { try { return (localStorage.getItem('shopos-admin-analytics') as Sub) || 'visitors'; } catch { return 'visitors'; } });
  const pick = (s: Sub) => { setSub(s); try { localStorage.setItem('shopos-admin-analytics', s); } catch { /* ignore */ } };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg">Analytics</h2>
        <p className="text-xs text-slate-400">Visitors, businesses, sales, M-Pesa and packages. Visitor figures are anonymous: no names, emails or phone numbers are stored.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Analytics sections">
        {SUBS.map(([k, l]) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => pick(k)} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${sub === k ? 'bg-field-600 text-paper' : 'text-slate-400 hover:bg-slate-800'}`}>{l}</button>)}
      </div>
      {sub === 'visitors' && <SiteAnalytics supabase={supabase} />}
      {(sub === 'businesses' || sub === 'sales' || sub === 'mpesa') && <PlatformInsights supabase={supabase} view={sub} />}
      {sub === 'packages' && <PackageStats supabase={supabase} />}
    </div>
  );
}
