import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { PublicLayout, PageHeading } from './PublicLayout';
import { DMN_URL } from './usePlatformContact';

const AREAS: [string, string][] = [
  ['Point of sale', 'A fast till with barcode scanning, quick search, held sales, discounts and digital receipts with QR codes.'],
  ['Inventory', 'Stock updates automatically with every sale, purchase and adjustment, with a history of every movement and low-stock alerts.'],
  ['Sales & reports', 'Sales history, refunds, cancellations, expenses and profit and loss, so you can see how the shop is really doing.'],
  ['Debts & customers', 'Track who owes you, record part-payments, and keep customer records, including debts owed by people who are not registered customers.'],
  ['Business management', 'Staff accounts with permissions, several branches under one login, suppliers, quotations, invoices and an audit trail.'],
  ['Offline capability', 'Sales are saved on the device first and synchronised when the connection returns, so a network outage does not stop trading.'],
];

export function AboutPage() {
  return (
    <PublicLayout title="About">
      <PageHeading
        title="About ShopOS"
        lead="ShopOS is a point-of-sale and business management system for retail shops and small businesses, built to keep working in places where the internet often does not."
      />
      <div className="max-w-3xl mx-auto px-5 pb-12 space-y-10">
        <section>
          <h2 className="font-display font-semibold text-xl mb-2">Who it is for</h2>
          <p className="text-slate-600 leading-relaxed">
            Shop owners, managers and cashiers who run day-to-day trading on paper, spreadsheets or a POS that stops when the network does.
            One shop or several, ShopOS gives each business its own private workspace, its own staff and its own data.
          </p>
        </section>

        <section>
          <h2 className="font-display font-semibold text-xl mb-2">The problems it solves</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600 leading-relaxed">
            <li>Lost sales and confusion when the internet drops.</li>
            <li>Stock counts that never match what is on the shelf.</li>
            <li>Credit given to people and forgotten, or tracked in a notebook.</li>
            <li>Not knowing what each cashier sold, or whether the day's cash adds up.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display font-semibold text-xl mb-4">What is inside</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {AREAS.map(([t, b]) => (
              <div key={t} className="card p-4">
                <h3 className="font-medium mb-1">{t}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-display font-semibold text-lg mb-1">Who builds it</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-3">
            ShopOS is developed and maintained by DMN Solutions, a technology solutions provider focused on practical digital systems for businesses.
          </p>
          <a href={DMN_URL} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-1.5 text-sm">
            Visit DMN Solutions <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        </section>

        <div className="text-center">
          <Link to="/login?view=register" className="btn-primary px-6 py-3 inline-flex items-center gap-1.5">Register your business <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </PublicLayout>
  );
}
