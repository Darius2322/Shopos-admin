import { ReactNode } from 'react';

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
