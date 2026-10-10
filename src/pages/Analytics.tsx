import { SupabaseClient } from '@supabase/supabase-js';
import { SiteAnalytics } from '../components/SiteAnalytics';
import { PackageStats } from '../components/PackageStats';

/** Full visitor analytics (its own menu item). */
export default function Analytics({ supabase }: { supabase: SupabaseClient }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg">Analytics</h2>
        <p className="text-xs text-slate-400">Who visits ShopOS, where they come from, what they open and which businesses they run. No names, emails or phone numbers are ever stored; visitors who turn on Do Not Track are not counted.</p>
      </div>
      <PackageStats supabase={supabase} />
      <SiteAnalytics supabase={supabase} />
    </div>
  );
}
