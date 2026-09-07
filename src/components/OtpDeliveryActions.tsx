import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Copy, Check, MessageCircle, Mail } from 'lucide-react';
import { supabaseUrl } from '../lib/supabase';

interface OtpDeliveryActionsProps {
  supabase: SupabaseClient;
  code: string;
  businessName: string;
  phone?: string | null;
  email?: string | null;
}

export function OtpDeliveryActions({ supabase, code, businessName, phone, email }: OtpDeliveryActionsProps) {
  const [copied, setCopied] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — code is still visible on screen */ }
  }

  function whatsapp() {
    if (!phone) return;
    const message = encodeURIComponent(`Your ShopOS activation code for ${businessName} is: ${code}\n\nIt expires in 15 minutes.`);
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${message}`, '_blank');
  }

  async function sendEmail() {
    if (!email) return;
    setEmailBusy(true); setEmailError(null); setEmailSent(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/send-activation-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ toEmail: email, businessName, code })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not send email');
      setEmailSent(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not send email');
    } finally { setEmailBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={copy} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
          {copied ? <Check className="w-3.5 h-3.5 text-field-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy code'}
        </button>
        {phone && (
          <button onClick={whatsapp} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> Send via WhatsApp
          </button>
        )}
        {email && (
          <button onClick={sendEmail} disabled={emailBusy} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> {emailBusy ? 'Sending…' : emailSent ? 'Sent!' : 'Send via email'}
          </button>
        )}
      </div>
      {emailError && <p className="text-xs text-rust-500 mt-1.5">{emailError}</p>}
    </div>
  );
}
