import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Archive, ArchiveRestore, Search } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import type { Category } from '../../lib/types';

export function CategoriesPage() {
  const { business } = useAuth();
  const categories = useLiveQuery(
    () => (business ? db.categories.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const products = useLiveQuery(
    () => (business ? db.products.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];

  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const productCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.categoryId) continue;
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const visible = categories
    .filter((c) => (showArchived ? c.archived : !c.archived))
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function toggleArchive(cat: Category) {
    await db.categories.update(cat.id, { archived: !cat.archived, updatedAt: new Date().toISOString(), syncStatus: 'pending' } as any);
    await enqueueSync('categories', cat.id, 'update');
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Categories</h1>
        <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> New category
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Search categories…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className={`btn-secondary text-sm whitespace-nowrap ${showArchived ? 'bg-slate-800 text-white' : ''}`}
        >
          {showArchived ? 'Showing archived' : 'Show archived'}
        </button>
      </div>

      <div className="card divide-y divide-slate-100">
        {visible.length === 0 && (
          <p className="text-sm text-slate-500 py-8 text-center">
            {showArchived ? 'No archived categories.' : 'No categories yet — group products so Inventory and reports can filter by them.'}
          </p>
        )}
        {visible.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 p-3.5">
            <button className="text-left min-w-0 flex-1" onClick={() => setEditing(c)}>
              <div className="text-sm font-medium truncate">{c.name}</div>
              <div className="text-xs text-slate-400">{productCount.get(c.id) ?? 0} product{(productCount.get(c.id) ?? 0) === 1 ? '' : 's'}</div>
            </button>
            <button
              onClick={() => toggleArchive(c)}
              title={c.archived ? 'Restore' : 'Archive'}
              className="p-1.5 text-slate-400 hover:text-ink shrink-0"
            >
              {c.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>

      {adding && business && <CategoryModal businessId={business.id} onClose={() => setAdding(false)} />}
      {editing && business && <CategoryModal businessId={business.id} existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryModal({ businessId, existing, onClose }: { businessId: string; existing?: Category; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true); setError(null);
    try {
      // Same case-insensitive uniqueness the database enforces (see
      // schema_part18.sql) — checked here too so the person sees a clear
      // message instead of a raw sync-queue failure later.
      const siblings = await db.categories.where('businessId').equals(businessId).toArray();
      const clash = siblings.find((c) => !c.archived && c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== existing?.id);
      if (clash) { setError('A category with that name already exists.'); setSaving(false); return; }

      if (existing) {
        await db.categories.update(existing.id, { name: trimmed, updatedAt: new Date().toISOString(), syncStatus: 'pending' } as any);
        await enqueueSync('categories', existing.id, 'update');
      } else {
        const record: Category = { ...newRecordBase(), businessId, name: trimmed, archived: false } as Category;
        await db.categories.add(record);
        await enqueueSync('categories', record.id, 'create');
      }
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{existing ? 'Edit category' : 'New category'}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving || !name.trim()} className="btn-primary w-full">
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </div>
  );
}
