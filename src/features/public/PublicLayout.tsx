import { BrandLogo } from '../../components/BrandLogo';
import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ExternalLink, ChevronRight, Home, Info, Wrench, Star, Mail, Scale, LogIn, ArrowRight } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { ThemeSwitch } from '../../components/ThemeSwitch';
import { tileColor } from '../../lib/tileColors';
import { usePlatformContact, DMN_URL } from './usePlatformContact';

const NAV: [string, string][] = [
  ['/', 'Home'], ['/about', 'About'], ['/services', 'Services'], ['/reviews', 'Reviews'], ['/contact', 'Contact'], ['/legal', 'Legal'],
];
const NAV_ICON: Record<string, typeof Home> = { '/': Home, '/about': Info, '/services': Wrench, '/reviews': Star, '/contact': Mail, '/legal': Scale };

export function PublicLayout({ title, children }: { title?: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const userId = useAuth((s) => s.userId);
  const [open, setOpen] = useState(false);
  const contact = usePlatformContact();

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  // While the menu is open the page behind it must not scroll.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement, prevHtml = html.style.overflow, prevBody = document.body.style.overflow;
    html.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
    return () => { html.style.overflow = prevHtml; document.body.style.overflow = prevBody; };
  }, [open]);
  useEffect(() => { document.title = title ? `${title} · ShopOS` : 'ShopOS — point of sale for real shops'; }, [title]);

  const linkCls = (to: string) =>
    `px-3 py-2 rounded-lg text-sm font-medium ${pathname === to ? 'text-field-700 bg-field-50' : 'text-slate-600 hover:text-ink hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen bg-paper flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-paper/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="shrink-0" aria-label="ShopOS home"><BrandLogo size="md" /></Link>
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV.map(([to, label]) => <Link key={to} to={to} className={linkCls(to)}>{label}</Link>)}
          </nav>
          <div className="flex items-center gap-2">
            {/* Desktop: theme + sign in + get started live in the bar. Phones: all of it moves into the menu. */}
            <div className="hidden md:block"><ThemeSwitch compact /></div>
            {userId
              ? <Link to="/" className="btn-primary text-sm px-3 py-1.5 hidden md:inline-block">Open app</Link>
              : <>
                  <Link to="/login" className="btn-secondary text-sm px-3 py-1.5 hidden md:inline-block">Sign in</Link>
                  <Link to="/login?view=register" className="btn-primary text-sm px-3 py-1.5 hidden md:inline-block">Get started</Link>
                </>}
            <button className="md:hidden min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 bg-paper-raised flex items-center justify-center" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
              {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {open && (
          /* Full-screen, opaque sheet under the header: the page behind cannot be seen or scrolled. */
          <nav className="md:hidden fixed inset-x-0 top-14 bottom-0 z-40 bg-paper overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" aria-label="Mobile">
            <p className="px-1 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Explore</p>
            <ul className="grid grid-cols-2 gap-3">
              {NAV.map(([to, label]) => {
                const Icon = NAV_ICON[to] ?? Home;
                const active = pathname === to;
                const c = tileColor(to);
                return (
                  <li key={to}>
                    <Link to={to} className={`h-full rounded-2xl border p-3.5 min-h-[100px] flex flex-col justify-between gap-3 transition-transform active:scale-[0.97] ${active ? 'border-field-600 bg-field-50' : 'border-slate-200 bg-paper-raised'}`}>
                      <span className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.bg, color: c.color }}><Icon className="w-6 h-6" aria-hidden="true" /></span>
                      <span className="text-[15px] font-semibold">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="card px-4 py-3 mt-4 flex items-center justify-between gap-3">
              <span className="text-[15px] font-medium">Appearance</span>
              <ThemeSwitch />
            </div>

            <div className="grid gap-2.5 mt-4">
              {userId
                ? <Link to="/" className="btn-primary min-h-[52px] inline-flex items-center justify-center gap-2 text-base">Open app <ArrowRight className="w-5 h-5" /></Link>
                : <>
                    <Link to="/login?view=register" className="btn-primary min-h-[52px] inline-flex items-center justify-center gap-2 text-base">Get started <ArrowRight className="w-5 h-5" /></Link>
                    <Link to="/login" className="btn-secondary min-h-[52px] inline-flex items-center justify-center gap-2 text-base"><LogIn className="w-5 h-5" /> Sign in</Link>
                  </>}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-100 bg-paper-raised">
        <div className="max-w-5xl mx-auto px-5 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2 md:col-span-1">
            <BrandLogo size="md" slogan className="mb-3" />
            <p className="text-slate-500 text-xs leading-relaxed max-w-[230px]">Point of sale, inventory and business management for shops that keep trading when the internet doesn't.</p>
          </div>
          <FooterCol title="Navigation">
            {NAV.map(([to, label]) => <Link key={to} to={to} className="block py-1 text-slate-600 hover:text-ink">{label}</Link>)}
          </FooterCol>
          <FooterCol title="Legal">
            <Link to="/terms" className="block py-1 text-slate-600 hover:text-ink">Terms &amp; Conditions</Link>
            <Link to="/privacy" className="block py-1 text-slate-600 hover:text-ink">Privacy Policy</Link>
          </FooterCol>
          <FooterCol title="Developer">
            <a href={DMN_URL} target="_blank" rel="noreferrer" className="block py-1 text-slate-600 hover:text-ink">DMN Solutions</a>
            <a href={DMN_URL} target="_blank" rel="noreferrer" className="block py-1 text-slate-600 hover:text-ink">Build with DMN Solutions</a>
            {(contact?.support_email || contact?.support_whatsapp || contact?.support_phone) && (
              <div className="pt-3">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Support</div>
                {contact?.support_email && <a href={`mailto:${contact.support_email}`} className="block py-0.5 text-slate-600 hover:text-ink break-all">{contact.support_email}</a>}
                {contact?.support_phone && <a href={`tel:${contact.support_phone}`} className="block py-0.5 text-slate-600 hover:text-ink">{contact.support_phone}</a>}
              </div>
            )}
          </FooterCol>
        </div>
        <div className="border-t border-slate-100 py-4 px-5 text-xs text-slate-400 text-center">
          © {new Date().getFullYear()} ShopOS · Developed and maintained by{' '}
          <a href={DMN_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink inline-flex items-center gap-0.5">DMN Solutions<ExternalLink className="w-3 h-3" aria-hidden="true" /></a>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{title}</h2>
      {children}
    </div>
  );
}

export function PageHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <section className="max-w-3xl mx-auto px-5 pt-10 pb-6">
      <h1 className="font-display font-semibold text-3xl leading-tight mb-3">{title}</h1>
      {lead && <p className="text-slate-500 leading-relaxed">{lead}</p>}
    </section>
  );
}
