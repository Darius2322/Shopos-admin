import { useEffect, useRef, useState } from 'react';
import { captchaEnabled, mountCaptcha, provideCaptchaToken } from '../lib/captcha';

/** Cloudflare human check shown inline in a form. `onChange(true)` once verified; `resetKey` re-arms it after a failed attempt. */
export function CaptchaBox({ onChange, resetKey }: { onChange: (ok: boolean) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!captchaEnabled || !ref.current) return;
    setState('loading'); provideCaptchaToken(undefined); onChange(false);
    const stop = mountCaptcha(ref.current, {
      onToken: (t) => { provideCaptchaToken(t); setState('ok'); onChange(true); },
      onReset: () => { provideCaptchaToken(undefined); setState('loading'); onChange(false); },
      onError: () => { provideCaptchaToken(undefined); setState('error'); onChange(false); },
    });
    return () => { stop(); provideCaptchaToken(undefined); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, retry]);
  if (!captchaEnabled) return null;
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <div ref={ref} className="min-h-[65px] flex items-center justify-center" />
      {state === 'error' && (
        <p className="text-xs text-red-600">Could not load the human check. <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>
      )}
      {state === 'loading' && <p className="text-xs text-gray-500">Verify you are human to sign in</p>}
    </div>
  );
}
