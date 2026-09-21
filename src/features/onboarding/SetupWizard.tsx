import { useState } from 'react';
import { create } from 'zustand';
import { Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { db, enqueueSync } from '../../lib/db';
import { BusinessProfile } from '../settings/BusinessProfile';
import { BranchesList } from '../branches/BranchesList';
import { UsersList } from '../users/UsersList';
import { InventoryList } from '../inventory/InventoryList';
import { LoyaltySettingsPage } from '../settings/LoyaltySettingsPage';
import { Theme } from '../settings/Theme';

/** Tracks only whether the wizard was dismissed for THIS session (not
 * persisted to the business) — separate from onboardingCompleted, which
 * is the durable "the owner is genuinely done" flag. This lets "Skip
 * setup, I'll finish later" actually mean later, not never — the wizard
 * can be reopened from the dashboard banner without losing progress. */
export const useWizardVisibility = create<{ dismissed: boolean; dismiss: () => void; show: () => void }>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  show: () => set({ dismissed: false })
}));

const STEPS = [
  { key: 'business', label: 'Business profile', component: BusinessProfile },
  { key: 'branches', label: 'Branches', component: BranchesList },
  { key: 'team', label: 'Team', component: UsersList },
  { key: 'products', label: 'Products', component: InventoryList },
  { key: 'loyalty', label: 'Loyalty', component: LoyaltySettingsPage },
  { key: 'theme', label: 'Theme', component: Theme }
];

/**
 * Setup wizard shown once, right after a new business is activated —
 * replaces the manual SQL inserts that were previously the only way to get
 * a business/branch/profile properly configured. Every step here reuses
 * the real, already-working page component rather than a duplicate
 * simplified form, so what you configure here is exactly what you'd see
 * later in Business Profile / Branches / Users etc. — no separate code
 * path to drift out of sync.
 *
 * Progress is saved to businesses.onboardingStep after every "Next", so
 * closing the tab and coming back resumes where you left off, per the
 * spec's "allow leave and continue later" requirement. Every step can
 * also be skipped — this is guidance, not a hard gate; skipping just means
 * configuring it later from its normal settings page.
 */
export function SetupWizard({ onFinish }: { onFinish: () => void }) {
  const { business } = useAuth();
  const [stepIndex, setStepIndex] = useState(Math.min(business?.onboardingStep ?? 0, STEPS.length - 1));

  if (!business) return null;
  const Step = STEPS[stepIndex].component;
  const isLast = stepIndex === STEPS.length - 1;

  async function persistStep(next: number) {
    if (!business) return;
    await db.businesses.put({ ...business, onboardingStep: next, updatedAt: new Date().toISOString(), syncStatus: 'pending' } as any);
    await enqueueSync('businesses', business.id, 'update');
  }

  async function goNext() {
    if (isLast) {
      await finish();
      return;
    }
    const next = stepIndex + 1;
    await persistStep(next);
    setStepIndex(next);
  }

  async function goBack() {
    if (stepIndex === 0) return;
    const prev = stepIndex - 1;
    await persistStep(prev);
    setStepIndex(prev);
  }

  async function finish() {
    if (!business) return;
    await db.businesses.put({ ...business, onboardingCompleted: true, onboardingStep: STEPS.length - 1, updatedAt: new Date().toISOString(), syncStatus: 'pending' } as any);
    await enqueueSync('businesses', business.id, 'update');
    // Writing to Dexie directly doesn't update the reactive `business`
    // object already held in the auth store — refresh() re-reads it so
    // the parent's onboardingCompleted check picks up the change.
    await useAuth.getState().refresh();
    onFinish();
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="border-b border-slate-200 bg-paper-raised px-4 md:px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display font-semibold text-lg">Set up ShopOS</h1>
            <button onClick={() => { useWizardVisibility.getState().dismiss(); onFinish(); }} className="text-xs text-slate-500 hover:text-ink">
              Skip setup, I'll finish later
            </button>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex-1 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                  i < stepIndex ? 'bg-field-600 text-white' : i === stepIndex ? 'bg-field-50 text-field-700 border border-field-500' : 'bg-slate-100 text-slate-400'
                }`}>
                  {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < stepIndex ? 'bg-field-600' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 mt-2">Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <Step />
      </div>

      <div className="border-t border-slate-200 bg-paper-raised px-4 md:px-8 py-3 flex items-center justify-between sticky bottom-0">
        <button onClick={goBack} disabled={stepIndex === 0} className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">
          {isLast ? 'Finish setup' : 'Next'} {!isLast && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
