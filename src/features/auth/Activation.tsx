import { BrandMark } from '../../components/BrandMark';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';

export function Activation() {
  const { business, activateWithCode, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await activateWithCode(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <BrandMark className="w-14 h-14 rounded-2xl mb-3" />
          <h1 className="font-display font-semibold text-2xl text-center">Activate {business?.name ?? 'your business'}</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Your account has been approved. Enter the activation code you were given to finish setting up ShopOS.
          </p>
        </div>

        <form onSubmit={submit} className="card p-5 space-y-3.5">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Activation code</span>
            <input
              className="input tnum text-center text-lg tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoFocus
              required
            />
          </label>
          {error && <p className="text-sm text-rust-600">{error}</p>}
          <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full">
            {loading ? 'Activating…' : 'Activate ShopOS'}
          </button>
        </form>

        <button onClick={() => signOut()} className="text-xs text-slate-400 hover:text-ink mt-4 block mx-auto">
          Sign out
        </button>
      </div>
    </div>
  );
}
