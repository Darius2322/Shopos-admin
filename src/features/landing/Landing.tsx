import { Link } from 'react-router-dom';
import {
  ShoppingCart, Wifi, Users, Receipt, Package, BarChart3, ShieldCheck,
  ArrowRight, Store, Smartphone, Building2, CheckCircle2, ExternalLink
} from 'lucide-react';
import { PublicLayout } from '../public/PublicLayout';
import { DMN_URL } from '../public/usePlatformContact';

const FEATURES = [
  { icon: Wifi, title: 'Works offline', body: 'Keep selling through network outages — every sale queues locally and syncs the moment you\'re back online.' },
  { icon: ShoppingCart, title: 'Fast, familiar POS', body: 'Built for a real till: barcode scanning, quick search, and receipts in seconds, not minutes.' },
  { icon: Users, title: 'Staff & permissions', body: 'Add cashiers and managers with exactly the access they need — enforced at the database, not just hidden buttons.' },
  { icon: Receipt, title: 'Modern receipts', body: 'QR codes and shareable digital receipts your customers can reach you from directly.' },
  { icon: Package, title: 'Inventory that stays honest', body: 'Stock levels update automatically with every sale, purchase, and adjustment — with a full history.' },
  { icon: BarChart3, title: 'Real reports', body: 'Profit & loss, sales trends, and staff performance — the numbers you actually need to run the shop.' },
];

const STEPS = [
  { title: 'Register your business', body: 'Tell us about your shop — takes two minutes.' },
  { title: 'Get approved', body: 'We review new signups and approve you, usually the same day.' },
  { title: 'Activate & set up', body: 'Confirm your account, add your products, and invite your staff.' },
  { title: 'Start selling', body: 'Your shop\'s own branded sign-in link is ready to share with your team.' },
];

export function Landing() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="max-w-3xl mx-auto text-center px-5 pt-10 pb-14">
        <h1 className="font-display font-semibold text-3xl sm:text-4xl leading-tight mb-4">
          The point-of-sale built for how your shop actually runs
        </h1>
        <p className="text-slate-500 max-w-xl mx-auto mb-7">
          Offline-ready POS, inventory, staff permissions, and reports — in one app that keeps working
          even when the internet doesn't.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/login?view=register" className="btn-primary px-6 py-3 flex items-center gap-1.5 w-full sm:w-auto justify-center">
            Register your business <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login?view=status" className="btn-secondary px-6 py-3 w-full sm:w-auto text-center">
            Track your application
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="font-display font-semibold text-xl text-center mb-8">Everything a real shop needs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5">
              <div className="w-10 h-10 rounded-xl bg-field-600 flex items-center justify-center text-white mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-medium mb-1">{title}</h3>
              <p className="text-sm text-slate-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-paper-raised py-12">
        <div className="max-w-4xl mx-auto px-5">
          <h2 className="font-display font-semibold text-xl text-center mb-8">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="w-8 h-8 rounded-full bg-field-600 text-white flex items-center justify-center font-display font-semibold text-sm mx-auto mb-3">
                  {i + 1}
                </div>
                <h3 className="font-medium text-sm mb-1">{step.title}</h3>
                <p className="text-xs text-slate-500">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Multi-branch / staff callout */}
      <section className="max-w-4xl mx-auto px-5 py-12">
        <div className="card p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-field-600 flex items-center justify-center text-white shrink-0">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg mb-1">Running more than one shop?</h3>
            <p className="text-sm text-slate-500">
              Multi-branch support lets you assign managers and staff per location, see stock and sales
              broken down by branch or combined, and switch between them instantly from the same login.
            </p>
          </div>
        </div>
      </section>

      {/* Trust points */}
      <section className="max-w-4xl mx-auto px-5 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600"><ShieldCheck className="w-4 h-4 text-field-600 shrink-0" /> Server-enforced permissions, not just hidden buttons</div>
          <div className="flex items-center gap-2 text-slate-600"><Smartphone className="w-4 h-4 text-field-600 shrink-0" /> Works on phone, tablet, or computer</div>
          <div className="flex items-center gap-2 text-slate-600"><CheckCircle2 className="w-4 h-4 text-field-600 shrink-0" /> Your data stays yours — full audit trail included</div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-5 pb-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-field-600 flex items-center justify-center text-white mx-auto mb-4">
          <Store className="w-6 h-6" />
        </div>
        <h2 className="font-display font-semibold text-xl mb-2">Ready to run your shop on ShopOS?</h2>
        <p className="text-sm text-slate-500 mb-5">Registration takes a couple of minutes — most applications are approved the same day.</p>
        <Link to="/login?view=register" className="btn-primary px-6 py-3 inline-flex items-center gap-1.5">
          Register your business <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Developer partner section */}
      <section className="max-w-4xl mx-auto px-5 pb-14">
        <div className="card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <h2 className="font-display font-semibold text-lg mb-1">Need a custom business system?</h2>
            <p className="text-sm text-slate-500 max-w-md">
              ShopOS is built by DMN Solutions, a technology solutions provider focused on practical digital systems for businesses. If ShopOS is not the whole answer, they can build the rest.
            </p>
          </div>
          <a href={DMN_URL} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center justify-center gap-1.5 shrink-0">
            Build With DMN Solutions <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </section>
    </PublicLayout>
  );
}
