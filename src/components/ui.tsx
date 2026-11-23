import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center p-4">{children}</div>;
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`card p-4 ${className}`}>{children}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-400 py-6 text-center">{message}</p>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="h-3.5 w-1/3 bg-slate-800 rounded mb-2" />
          <div className="h-3 w-2/3 bg-slate-800 rounded" />
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-field-600/20 text-field-600',
  approved: 'bg-field-600/20 text-field-600',
  resolved: 'bg-field-600/20 text-field-600',
  pending: 'bg-amber-500/20 text-amber-500',
  pending_activation: 'bg-amber-500/20 text-amber-500',
  in_progress: 'bg-amber-500/20 text-amber-500',
  waiting_for_user: 'bg-amber-500/20 text-amber-500',
  info_requested: 'bg-amber-500/20 text-amber-500',
  paused: 'bg-slate-700 text-slate-400',
  closed: 'bg-slate-700 text-slate-400',
  suspended: 'bg-rust-500/20 text-rust-500',
  rejected: 'bg-rust-500/20 text-rust-500',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-800 text-slate-400';
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${style}`}>{status.replace(/_/g, ' ')}</span>;
}

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-display font-semibold tnum">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-rust-500">{children}</p>;
}

/** A pop-up page over the current screen. Closes on the dark background, the X, or Escape. */
export function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'} max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
          <div className="min-w-0"><p className="font-medium">{title}</p>{subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200 p-1 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
