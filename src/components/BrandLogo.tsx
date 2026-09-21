import { BrandMark } from './BrandMark';

export const SLOGAN = 'Run Your Business Smarter.';

/** "Shop" follows the theme's text colour (navy in Light, white in Dark) and "OS" carries the brand
 * blue→green gradient, matching the supplied wordmark on both themes. */
export function Wordmark({ className = 'text-xl' }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight leading-none ${className}`} aria-label="ShopOS">
      <span className="text-ink">Shop</span>
      <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #0ea5e9 0%, #10d9a0 100%)' }}>OS</span>
    </span>
  );
}

/** Emblem + wordmark, optionally with the slogan. `stacked` centres them vertically (login, hero). */
export function BrandLogo({ slogan = false, stacked = false, size = 'md', className = '' }: { slogan?: boolean; stacked?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const mark = { sm: 'w-8 h-8 rounded-lg', md: 'w-10 h-10 rounded-xl', lg: 'w-20 h-20 rounded-3xl' }[size];
  const word = { sm: 'text-lg', md: 'text-xl', lg: 'text-4xl' }[size];
  if (stacked) {
    return (
      <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
        <BrandMark className={`${mark} shadow-lg`} />
        <div>
          <Wordmark className={word} />
          {slogan && <p className="text-sm text-slate-500 mt-1.5">{SLOGAN}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark className={`${mark} shrink-0`} />
      <div className="min-w-0">
        <Wordmark className={word} />
        {slogan && <p className="text-[11px] text-slate-500 mt-1 leading-tight">{SLOGAN}</p>}
      </div>
    </div>
  );
}
