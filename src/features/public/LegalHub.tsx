import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, ChevronRight } from 'lucide-react';
import { PublicLayout, PageHeading } from './PublicLayout';

export function LegalHub() {
  const items = [
    { to: '/terms', icon: FileText, title: 'Terms & Conditions', body: 'The rules for using ShopOS, business accounts, offline data and payments.' },
    { to: '/privacy', icon: ShieldCheck, title: 'Privacy Policy', body: 'What information ShopOS handles, why, how it is protected, and your choices.' },
  ];
  return (
    <PublicLayout title="Legal">
      <PageHeading title="Legal" lead="The documents that govern your use of ShopOS." />
      <div className="max-w-3xl mx-auto px-5 pb-14 space-y-3">
        {items.map(({ to, icon: Icon, title, body }) => (
          <Link key={to} to={to} className="card p-4 flex items-center gap-4 hover:border-field-600 transition-colors min-h-[72px]">
            <span className="w-10 h-10 rounded-xl bg-field-50 text-field-700 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block text-sm text-slate-500">{body}</span></span>
            <ChevronRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </PublicLayout>
  );
}
