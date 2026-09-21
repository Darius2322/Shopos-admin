import { useEffect, useRef, useState } from 'react';
import { Star, BadgeCheck, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { PublicLayout, PageHeading } from './PublicLayout';

interface PublicReview {
  id: string; author_name: string; business_name: string | null;
  rating: number; body: string; verified: boolean; created_at: string;
}

function Stars({ value, size = 'w-4 h-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= value ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

const AVATAR_COLORS = ['bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-teal-600', 'bg-indigo-600'];
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}
function Avatar({ name }: { name: string }) {
  const anon = name.trim().toLowerCase() === 'anonymous';
  const color = AVATAR_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];
  return (
    <span aria-hidden="true" className={`w-11 h-11 rounded-full ${anon ? 'bg-slate-500' : color} text-white flex items-center justify-center font-semibold text-sm shrink-0`}>
      {anon ? <UserRound className="w-5 h-5" /> : initialsOf(name)}
    </span>
  );
}

const SLIDE_MS = 3500;

/** One review at a time, advancing every 3.5 seconds. Pauses while touched/hovered/focused and when the
 * tab is hidden; people who prefer reduced motion get manual controls only. */
function ReviewCarousel({ reviews }: { reviews: PublicReview[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = reviews.length;

  useEffect(() => { if (index >= n) setIndex(0); }, [n, index]);
  useEffect(() => {
    if (n < 2 || paused || reduce) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % n); }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [n, paused, reduce, index]); // `index` restarts the 3.5s timer after a manual change

  const go = (i: number) => setIndex(((i % n) + n) % n);

  return (
    <div
      role="region" aria-roledescription="carousel" aria-label="Customer reviews"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { setPaused(true); touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const start = touchX.current; touchX.current = null; setPaused(false);
        if (start == null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="overflow-hidden rounded-2xl">
        <ul className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
          {reviews.map((r, i) => (
            <li key={r.id} className="w-full shrink-0 px-0.5" aria-hidden={i !== index} aria-roledescription="slide" aria-label={`${i + 1} of ${n}`}>
              <article className="card p-5 h-full">
                <div className="flex items-center gap-3">
                  <Avatar name={r.author_name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.author_name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                      {r.business_name && <span className="truncate">{r.business_name}</span>}
                      {r.verified && <span className="inline-flex items-center gap-0.5 text-field-700"><BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" /> Verified</span>}
                    </div>
                  </div>
                  <time className="text-xs text-slate-400 shrink-0" dateTime={r.created_at}>
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </time>
                </div>
                <div className="mt-3"><Stars value={r.rating} /></div>
                <p className="text-sm text-slate-700 leading-relaxed mt-2 break-words whitespace-pre-line min-h-[4.5rem]">{r.body}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
      {n > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3" role="tablist" aria-label="Choose a review">
          {reviews.map((r, i) => (
            <button key={r.id} role="tab" aria-selected={i === index} aria-label={`Review ${i + 1}`} onClick={() => go(i)}
              className="p-2 -m-1"><span className={`block h-2 rounded-full transition-all ${i === index ? 'w-6 bg-field-600' : 'w-2 bg-slate-300'}`} /></button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewsPage() {
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabase) { setReviews([]); return; }
    supabase.rpc('get_public_reviews', { p_limit: 50 }).then(({ data, error }) => {
      if (error) { setFailed(true); setReviews([]); } else setReviews((data ?? []) as PublicReview[]);
    });
  }, []);

  const avg = reviews && reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <PublicLayout title="Reviews">
      <PageHeading title="Reviews" lead="What business owners say about using ShopOS. Anyone can share their experience. Reviews from owners of active ShopOS businesses are marked verified." />
      <div className="max-w-3xl mx-auto px-5 pb-12 space-y-6">
        {reviews === null && <p className="text-sm text-slate-400 py-8 text-center">Loading reviews…</p>}
        {failed && <p className="text-sm text-slate-500 card p-4">Reviews could not be loaded right now. Please try again later.</p>}

        {reviews && reviews.length > 0 && (
          <div className="card p-4 flex items-center gap-4">
            <div className="font-display font-semibold text-3xl tnum">{avg.toFixed(1)}</div>
            <div>
              <Stars value={Math.round(avg)} />
              <div className="text-xs text-slate-500 mt-0.5">{reviews.length} review{reviews.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        )}

        {reviews && reviews.length === 0 && !failed && (
          <div className="card p-6 text-center">
            <p className="font-medium mb-1">No reviews yet</p>
            <p className="text-sm text-slate-500">Be the first to share your experience with ShopOS.</p>
          </div>
        )}

        {reviews && reviews.length > 0 && <ReviewCarousel reviews={reviews} />}

        <ReviewForm />
      </div>
    </PublicLayout>
  );
}

function ReviewForm() {
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.fullName ?? '');
  const [anonymous, setAnonymous] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <div className="card p-5 text-sm text-field-700 bg-field-50">Thank you for your review.</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!anonymous && name.trim().length > 0 && name.trim().length < 2) { setError('Please enter your name, or choose to post anonymously'); return; }
    if (!rating) { setError('Choose a star rating'); return; }
    if (body.trim().length < 10) { setError('Please write at least 10 characters'); return; }
    if (!supabase) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('submit_public_review', { p_name: anonymous ? '' : name, p_rating: rating, p_body: body });
    setBusy(false);
    if (err) setError(err.message); else setDone(true);
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3">
      <h2 className="font-display font-semibold text-lg">Leave a review</h2>
      <label className="block">
        <span className="block text-sm font-medium text-slate-600 mb-1.5">Your name {anonymous ? '' : '(optional)'}</span>
        <input className="input disabled:opacity-50" value={anonymous ? '' : name} maxLength={60} disabled={anonymous} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={anonymous ? 'Anonymous' : 'Leave blank to stay anonymous'} />
      </label>
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none">
        <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span className="text-sm text-slate-600">Post anonymously</span>
      </label>
      <div>
        <span className="block text-sm font-medium text-slate-600 mb-1">Rating</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onClick={() => setRating(n)} className="p-1.5 -m-0.5">
              <Star className={`w-8 h-8 ${n <= rating ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="block text-sm font-medium text-slate-600 mb-1.5">Your review</span>
        <textarea className="input" rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How has ShopOS worked for your business?" />
      </label>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</button>
      <p className="text-xs text-slate-400">Your review is shown publicly with the name you enter, or as Anonymous. Links are not allowed.</p>
    </form>
  );
}
