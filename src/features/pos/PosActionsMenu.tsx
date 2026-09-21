import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MoreVertical, X, Search, Calculator, Users, Percent, Pause, FileText,
  ListOrdered, Lock, Coffee, RefreshCw, LogOut, Maximize2, Minimize2, ScanLine, MonitorPlay
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLock } from '../../lib/lock';
import { usePosFocus } from '../../lib/posFocus';
import { runSync } from '../../lib/sync';

interface PosActionsMenuProps {
  onSearch: () => void;
  onScan: () => void;
  onCalculator: () => void;
  onCustomer: () => void;
  onDiscount: () => void;
  onHold: () => void;
  heldCount: number;
}

export function PosActionsMenu(props: PosActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const { business, activeBranchId, userId, signOut } = useAuth();
  const { lock, takeBreak } = useLock();
  const { focused, enter, exit } = usePosFocus();
  const navigate = useNavigate();

  function act(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 flex items-center justify-center rounded-card border border-slate-200 hover:bg-slate-50"
        aria-label="POS actions"
        title="POS actions"
      >
        <MoreVertical className="w-4.5 h-4.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-56 card p-1.5">
            <MenuItem icon={Search} label="Search" onClick={() => act(props.onSearch)} />
            <MenuItem icon={ScanLine} label="Scan barcode" onClick={() => act(props.onScan)} />
            <MenuItem icon={Calculator} label="Calculator" onClick={() => act(props.onCalculator)} />
            <MenuItem icon={Users} label="Customer" onClick={() => act(props.onCustomer)} />
            <MenuItem icon={Percent} label="Discount" onClick={() => act(props.onDiscount)} />
            <MenuItem icon={Pause} label={`Hold sale${props.heldCount > 0 ? ` (${props.heldCount})` : ''}`} onClick={() => act(props.onHold)} />
            <div className="h-px bg-slate-100 my-1" />
            <MenuItem icon={FileText} label="Quotations" onClick={() => act(() => navigate('/quotations'))} />
            <MenuItem icon={ListOrdered} label="Recent sales" onClick={() => act(() => navigate('/sales'))} />
            <MenuItem icon={MonitorPlay} label="Open customer display" onClick={() => act(() => window.open('/customer-display', 'shopos-customer-display', 'width=900,height=700'))} />
            <div className="h-px bg-slate-100 my-1" />
            <MenuItem
              icon={focused ? Minimize2 : Maximize2}
              label={focused ? 'Exit focus' : 'Focus POS'}
              onClick={() => act(focused ? exit : enter)}
            />
            <MenuItem icon={Lock} label="Lock POS" onClick={() => act(() => lock('idle'))} />
            {business && activeBranchId && userId && (
              <MenuItem icon={Coffee} label="Take a break" onClick={() => act(() => takeBreak(business.id, activeBranchId, userId))} />
            )}
            <MenuItem icon={RefreshCw} label="Sync now" onClick={() => act(() => { runSync(); })} />
            <div className="h-px bg-slate-100 my-1" />
            <MenuItem icon={LogOut} label="Logout" onClick={() => act(() => signOut())} danger />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-card text-sm text-left hover:bg-paper ${danger ? 'text-rust-600' : 'text-ink'}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}
