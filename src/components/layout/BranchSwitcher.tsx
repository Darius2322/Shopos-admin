import { useState } from 'react';
import { ChevronDown, Check, MapPin, Layers, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';

/**
 * Mobile branch switching gets equal weight to desktop (spec §6): the
 * active branch is always visible in the header, tapping it opens a
 * bottom sheet (drawer on desktop widths) listing only branches the
 * signed-in user is authorized for. Selecting one is enforced through
 * useAuth().setActiveBranch, which itself re-validates authorization —
 * this component never trusts its own list as the source of truth.
 *
 * Owners and managers also see an "All Branches" option (spec §9-11) —
 * activeBranchId === null means that's selected. Other roles never see
 * it; setActiveBranch(null) would reject them anyway, but hiding it here
 * avoids offering a control that will just error.
 */
export function BranchSwitcher() {
  const { branches, activeBranchId, setActiveBranch, canViewAllBranches } = useAuth();
  const [open, setOpen] = useState(false);
  const viewingAll = activeBranchId === null && canViewAllBranches;
  const active = viewingAll ? null : branches.find((b) => b.id === activeBranchId);

  if (branches.length === 0) {
    return <span className="text-sm text-slate-500">No branch assigned</span>;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-card px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-medium truncate max-w-[140px]">{viewingAll ? 'All Branches' : active?.name ?? 'Select branch'}</span>
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-1 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-lg">Select branch</h3>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {canViewAllBranches && (
              <button
                onClick={async () => { await setActiveBranch(null); setOpen(false); }}
                className="w-full flex items-center justify-between py-3 px-2.5 rounded-card hover:bg-paper text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${viewingAll ? 'bg-field-50 text-field-600' : 'bg-slate-50 text-slate-400'}`}>
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">All Branches</div>
                    <div className="text-xs text-slate-500">Consolidated view across every branch</div>
                  </div>
                </div>
                {viewingAll && <Check className="w-4 h-4 text-field-600 shrink-0" />}
              </button>
            )}

            {branches.map((b) => (
              <button
                key={b.id}
                onClick={async () => { await setActiveBranch(b.id); setOpen(false); }}
                className="w-full flex items-center justify-between py-3 px-2.5 rounded-card hover:bg-paper text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${b.id === activeBranchId ? 'bg-field-50 text-field-600' : 'bg-slate-50 text-slate-400'}`}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {b.location ?? 'No location set'}
                      {b.status === 'paused' && <span className="text-amber-600"> · Paused</span>}
                    </div>
                  </div>
                </div>
                {b.id === activeBranchId && <Check className="w-4 h-4 text-field-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
