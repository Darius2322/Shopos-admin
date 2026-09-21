import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppShell } from './components/layout/AppShell';
import { Login } from './features/auth/Login';
import { Activation } from './features/auth/Activation';
import { Dashboard } from './features/dashboard/Dashboard';
// recharts is a genuinely heavy dependency (pushed the whole app's initial
// bundle from ~620KB to over 1MB gzipped) for a page most sessions never
// open — lazy-loaded so that weight is only fetched when someone actually
// visits Profit & Loss, not on every login on every device.
const PublicPages = lazy(() => import('./features/public/PublicPages'));
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
import { POS } from './features/pos/POS';
import { CustomerDisplay } from './features/pos/CustomerDisplay';
import { InventoryList } from './features/inventory/InventoryList';
import { CategoriesPage } from './features/inventory/CategoriesPage';
import { CustomersList } from './features/customers/CustomersList';
import { DebtsList } from './features/debts/DebtsList';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { BranchesList } from './features/branches/BranchesList';
import { SuppliersList } from './features/suppliers/SuppliersList';
import { ExpensesList } from './features/expenses/ExpensesList';
import { SyncCenter } from './features/settings/SyncCenter';
import { SalesList } from './features/sales/SalesList';
import { RefundsList } from './features/refunds/RefundsList';
import { UsersList } from './features/users/UsersList';
import { EmployeePayments } from './features/payroll/EmployeePayments';
import { CorrectionsList } from './features/corrections/CorrectionsList';
import { CancellationsList } from './features/cancellations/CancellationsList';
import { QuotationsList } from './features/quotations/QuotationsList';
import { InvoicesList } from './features/invoices/InvoicesList';
import { SupportCenter } from './features/support/SupportCenter';
import { Security } from './features/settings/Security';
import { BusinessProfile } from './features/settings/BusinessProfile';
import { LoyaltySettingsPage } from './features/settings/LoyaltySettingsPage';
import { PrinterSettingsPage } from './features/settings/PrinterSettingsPage';
import { Theme } from './features/settings/Theme';
import { EndOfDay } from './features/closing/EndOfDay';
import { SetupWizard, useWizardVisibility } from './features/onboarding/SetupWizard';
import { NoticeBoard } from './features/notices/NoticeBoard';
import { ResetPassword } from './features/auth/ResetPassword';
import { AuditLog } from './features/audit/AuditLog';
import { PublicReceipt } from './features/pos/PublicReceipt';
import { Landing } from './features/landing/Landing';
import { PUBLIC_PATHS } from './features/public/paths';
import { ErrorBoundary } from './components/ErrorBoundary';

function PageLoadingFallback() {
  return <div className="p-8 text-center text-sm text-slate-400">Loading…</div>;
}

export default function App() {
  const { loading, syncingInitialData, userId, business, bootstrap } = useAuth();
  const wizardDismissed = useWizardVisibility((s) => s.dismissed);
  const location = useLocation();

  useEffect(() => { bootstrap(); }, []);

  // Checked before ANY auth-state branching below — a password-recovery
  // link establishes a real (if temporary) Supabase session the instant
  // the page loads, which would otherwise make the normal userId-based
  // routing treat it as a genuine login and drop the person straight into
  // the app before they've actually set their new password.
  if (location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  // A scanned receipt QR code or a shared link must work for a complete
  // stranger with no ShopOS account at all — checked before any auth
  // branching below, same as /reset-password above, so it's never routed
  // through the login screen.
  if (location.pathname.startsWith('/r/')) {
    return <PublicReceipt />;
  }

  // Marketing + legal pages: open to anyone, signed in or not, and lazy-loaded
  // so they add nothing to the POS bundle.
  if (PUBLIC_PATHS.includes(location.pathname.replace(/\/+$/, ''))) {
    return <Suspense fallback={<PageLoadingFallback />}><PublicPages /></Suspense>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-sm text-slate-500">Loading ShopOS…</div>
      </div>
    );
  }

  if (userId && syncingInitialData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-sm text-slate-500">Setting up your business…</div>
      </div>
    );
  }

  if (userId && !business) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper p-6 text-center">
        <p className="text-sm font-medium mb-1">No business found for this account</p>
        <p className="text-sm text-slate-500 max-w-xs mb-4">
          This can happen if your account was just created and hasn't synced yet, or if you're offline.
        </p>
        <button onClick={() => useAuth.getState().refresh()} className="btn-primary text-sm mb-3">Try again</button>
        <button onClick={() => useAuth.getState().signOut()} className="text-xs text-slate-400 hover:text-ink">Sign out</button>
      </div>
    );
  }

  if (userId && business && business.status === 'pending_activation') {
    return <Activation />;
  }

  if (userId && business && (business.status === 'paused' || business.status === 'suspended')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper p-6 text-center">
        <p className="text-sm font-medium mb-1">This business is {business.status}</p>
        <p className="text-sm text-slate-500 max-w-xs mb-4">Contact ShopOS support if you believe this is a mistake.</p>
        <button onClick={() => useAuth.getState().signOut()} className="text-xs text-slate-400 hover:text-ink">Sign out</button>
      </div>
    );
  }

  if (userId && business && business.status === 'active' && !business.onboardingCompleted && !wizardDismissed) {
    return <SetupWizard onFinish={() => {}} />;
  }

  if (!userId) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/login/:slug" element={<Login />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    );
  }

  // Customer Display is a separate physical/browser window meant to face
  // the customer — it deliberately renders with no sidebar, no nav, and no
  // route back into the rest of the app, so it's pulled out here rather
  // than nested inside <AppShell>.
  if (location.pathname === '/customer-display') {
    return <CustomerDisplay />;
  }

  return (
    <AppShell>
      <ErrorBoundary key={location.pathname}>
        <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analytics" element={<Suspense fallback={<PageLoadingFallback />}><AnalyticsPage /></Suspense>} />
        <Route path="/pos" element={<POS />} />
        <Route path="/sales" element={<SalesList />} />
        <Route path="/inventory" element={<InventoryList />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/customers" element={<CustomersList />} />
        <Route path="/debts" element={<DebtsList />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/refunds" element={<RefundsList />} />
        <Route path="/corrections" element={<CorrectionsList />} />
        <Route path="/cancellations" element={<CancellationsList />} />
        <Route path="/quotations" element={<QuotationsList />} />
        <Route path="/invoices" element={<InvoicesList />} />
        <Route path="/support" element={<SupportCenter />} />
        <Route path="/security" element={<Security />} />
        <Route path="/business-profile" element={<BusinessProfile />} />
        <Route path="/loyalty-settings" element={<LoyaltySettingsPage />} />
        <Route path="/printer-settings" element={<PrinterSettingsPage />} />
        <Route path="/theme" element={<Theme />} />
        <Route path="/end-of-day" element={<EndOfDay />} />
        <Route path="/notices" element={<NoticeBoard />} />
        <Route path="/suppliers" element={<SuppliersList />} />
        <Route path="/expenses" element={<ExpensesList />} />
        <Route path="/employee-payments" element={<EmployeePayments />} />
        <Route path="/users" element={<UsersList />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/branches" element={<BranchesList />} />
        <Route path="/sync" element={<SyncCenter />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
