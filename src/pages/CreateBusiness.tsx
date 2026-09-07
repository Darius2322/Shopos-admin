import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserPlus } from 'lucide-react';
import { Card, ErrorText } from '../components/ui';
import { OtpDeliveryActions } from '../components/OtpDeliveryActions';
import { DurationSelect } from '../components/DurationSelect';
import { supabaseUrl } from '../lib/supabase';

export default function CreateBusiness({ supabase, onCreated }: { supabase: SupabaseClient; onCreated: (businessId: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [duration, setDuration] = useState<number | null>(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ businessId: string; code: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-business`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ fullName, email, phone: phone || null, businessName, durationMonths: duration })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not create business');
      setResult({ businessId: body.businessId, code: body.activationCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create business — is the admin-create-business Edge Function deployed?');
    } finally { setBusy(false); }
  }

  if (result) {
    return (
      <Card>
        <h2 className="font-display font-semibold text-lg mb-1">{businessName} created</h2>
        <p className="text-xs text-slate-400 mb-4">
          An invite email was sent to {email} so they can set a password. Share this activation code with them
          directly — it is shown only once here and expires in 15 minutes.
        </p>
        <div className="text-3xl font-mono font-semibold tracking-widest text-center py-4 bg-paper rounded-card mb-4">
          {result.code}
        </div>
        <OtpDeliveryActions supabase={supabase} code={result.code} businessName={businessName} phone={phone} email={email} />
        <button onClick={() => onCreated(result.businessId)} className="btn-primary w-full mt-4">View business</button>
      </Card>
    );
  }

  return (
    <div className="max-w-sm">
      <h2 className="font-display font-semibold text-lg mb-3">Create a business</h2>
      <ErrorText>{error}</ErrorText>
      <form onSubmit={submit} className="card p-4 space-y-3 mt-2">
        <label className="block"><span className="block text-xs font-medium text-slate-400 mb-1">Owner's full name</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        </label>
        <label className="block"><span className="block text-xs font-medium text-slate-400 mb-1">Owner's email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block"><span className="block text-xs font-medium text-slate-400 mb-1">Phone (optional)</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block"><span className="block text-xs font-medium text-slate-400 mb-1">Business name</span>
          <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        </label>
        <label className="block"><span className="block text-xs font-medium text-slate-400 mb-1">Access duration</span>
          <DurationSelect value={duration} onChange={setDuration} />
        </label>
        <button disabled={busy} className="btn-primary w-full flex items-center justify-center gap-1.5">
          <UserPlus className="w-4 h-4" /> {busy ? 'Creating…' : 'Create business'}
        </button>
      </form>
    </div>
  );
}
