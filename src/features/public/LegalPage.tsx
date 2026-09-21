import { ReactNode } from 'react';
import { PublicLayout, PageHeading } from './PublicLayout';

export const LEGAL_UPDATED = '19 September 2026';

export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <PublicLayout title={title}>
      <PageHeading title={title} lead={intro} />
      <article className="max-w-3xl mx-auto px-5 pb-14 text-sm text-slate-600 leading-relaxed space-y-6 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-base [&_h2]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-field-700 [&_a]:underline">
        <p className="text-xs text-slate-400">Last updated: {LEGAL_UPDATED}</p>
        {children}
      </article>
    </PublicLayout>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2>{title}</h2>{children}</section>;
}
