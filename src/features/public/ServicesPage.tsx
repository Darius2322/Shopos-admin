import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { PublicLayout, PageHeading } from './PublicLayout';
import { DMN_URL } from './usePlatformContact';

const SERVICES: [string, string][] = [
  ['POS setup', 'Getting the till running: products, prices, receipts, printers and staff accounts.'],
  ['Business system setup', 'Setting up your shop, branches and roles so the system matches how you actually work.'],
  ['Inventory management systems', 'Loading your stock, organising categories and suppliers, and setting sensible low-stock levels.'],
  ['Custom business software', 'Purpose-built tools for needs a standard product does not cover.'],
  ['Website development', 'A clear, fast website for your business.'],
  ['System customisation', 'Adjusting ShopOS workflows, receipts and reports to fit your business.'],
  ['Business automation', 'Removing repeated manual work between your sales, stock and records.'],
  ['Technical support', 'Help when something does not work, or when you are not sure how to do something.'],
];

export function ServicesPage() {
  return (
    <PublicLayout title="Services">
      <PageHeading title="Services" lead="Practical help around ShopOS, from getting started to systems built specifically for your business." />
      <div className="max-w-3xl mx-auto px-5 pb-12">
        <div className="grid sm:grid-cols-2 gap-4">
          {SERVICES.map(([t, b]) => (
            <div key={t} className="card p-4">
              <h2 className="font-medium mb-1">{t}</h2>
              <p className="text-sm text-slate-500 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
        <div className="card p-5 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-slate-600">Services are provided by DMN Solutions, the developer of ShopOS.</p>
          <div className="flex gap-2 shrink-0">
            <Link to="/contact" className="btn-secondary text-sm">Contact us</Link>
            <a href={DMN_URL} target="_blank" rel="noreferrer" className="btn-primary text-sm inline-flex items-center gap-1.5">DMN Solutions <ExternalLink className="w-4 h-4" aria-hidden="true" /></a>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
