import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, X } from 'lucide-react';
import { useBackClose } from '../lib/backStack';

/** Shown after "Download" is pressed for an app file: an animated tick, and where the file will be on the phone. */
export function ApkSaved() {
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => { const on = (e: Event) => setFile((e as CustomEvent<string>).detail || 'the app'); window.addEventListener('shopos:apk-started', on); return () => window.removeEventListener('shopos:apk-started', on); }, []);
  useBackClose(!!file, () => setFile(null));
  if (!file) return null;
  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={() => setFile(null)} />
      <div className="relative card w-full max-w-sm p-5 space-y-3 text-center">
        <button onClick={() => setFile(null)} aria-label="Close" className="absolute top-3 right-3 p-1 text-slate-400"><X className="w-5 h-5" /></button>
        <style>{`@keyframes soPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}@keyframes soRing{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.8);opacity:0}}`}</style>
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-field-500/30" style={{ animation: 'soRing 1.2s ease-out 2' }} />
          <CheckCircle2 className="w-16 h-16 text-field-600" style={{ animation: 'soPop .6s ease-out both' }} />
        </div>
        <h3 className="font-display font-semibold text-lg">Download started</h3>
        <p className="text-sm text-slate-500">{file} is being saved to your phone. When it finishes you will find it here:</p>
        <div className="rounded-xl bg-field-50 text-field-800 text-sm px-3 py-2.5 flex items-start gap-2 text-left"><FolderOpen className="w-4 h-4 mt-0.5 shrink-0" /><span><b>Files app → Downloads</b>, or pull down the notification bar and tap the finished download.</span></div>
        <p className="text-xs text-slate-500">Tap the file, then tap <b>Install</b>. If Android asks, allow installs from this source. It installs over your current app, so do not uninstall.</p>
        <button onClick={() => setFile(null)} className="btn-primary w-full min-h-[48px]">Got it</button>
      </div>
    </div>
  );
}
