import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../lib/theme';

/** Visible Light / Dark control. Persisted by lib/theme.ts (localStorage) and applied via the
 * `dark` class on <html>, which every screen already reads through CSS variables. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  const isDark = preference === 'dark' || (preference === 'system' && document.documentElement.classList.contains('dark'));
  const opts = [['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const;
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex p-0.5 rounded-full bg-slate-100 border border-slate-200">
      {opts.map(([key, label, Icon]) => {
        const active = (key === 'dark') === isDark;
        return (
          <button key={key} type="button" role="radio" aria-checked={active} aria-label={`${label} theme`}
            onClick={() => setPreference(key)}
            className={`min-h-[36px] px-2.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${active ? 'bg-paper-raised text-ink shadow-sm' : 'text-slate-500'}`}>
            <Icon className="w-4 h-4" aria-hidden="true" />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
