import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { RefreshCw, HardDrive } from 'lucide-react';
import AppReleases from './AppReleases';
import Installers from './Installers';
import { BadgeDot, type Badges } from '../lib/badges';

type Sub = 'updates' | 'installers';

/** Apps & Updates: the app release notes (App Updates) and the installer library (Windows, Mac, Linux, Android APK, iPhone link)
 * in one menu, each a sub-menu. */
export default function AppsAndUpdates({ supabase, start = 'updates', badges }: { supabase: SupabaseClient; start?: Sub; badges: Badges }) {
  const [sub, setSub] = useState<Sub>(start);
  const items: [Sub, string, typeof RefreshCw, number][] = [['updates', 'App Updates', RefreshCw, 0], ['installers', 'Installers (desktop, Android, iPhone)', HardDrive, badges.installers]];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Apps and updates" className="flex gap-1 border-b border-slate-700 overflow-x-auto">
        {items.map(([id, label, Icon, n]) => (
          <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${sub === id ? 'border-field-500 text-ink' : 'border-transparent text-slate-400 hover:text-ink'}`}>
            <Icon className="w-4 h-4" /> {label} <BadgeDot n={n} />
          </button>
        ))}
      </div>
      {sub === 'updates' ? <AppReleases supabase={supabase} /> : <Installers supabase={supabase} />}
    </div>
  );
}
