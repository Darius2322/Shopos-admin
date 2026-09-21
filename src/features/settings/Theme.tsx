import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, ThemePreference } from '../../lib/theme';

const OPTIONS: { key: ThemePreference; label: string; icon: any }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor }
];

export function Theme() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-4">Theme</h1>
      <div className="card p-4 space-y-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setPreference(opt.key)}
            className={`w-full flex items-center gap-3 p-3 rounded-card border transition-colors ${
              preference === opt.key ? 'border-field-500 bg-field-50' : 'border-slate-200'
            }`}
          >
            <opt.icon className="w-4.5 h-4.5" />
            <span className="text-sm font-medium">{opt.label}</span>
            {preference === opt.key && <span className="ml-auto w-2 h-2 rounded-full bg-field-600" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-3">System follows your device's light/dark setting automatically.</p>
    </div>
  );
}
