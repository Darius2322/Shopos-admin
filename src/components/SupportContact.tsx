import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Settings {
  support_email: string | null;
  support_whatsapp: string | null;
  support_phone: string | null;
}

export function SupportContact({ label = 'Need help?' }: { label?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('platform_settings').select('support_email, support_whatsapp, support_phone').eq('id', 'default').maybeSingle()
      .then(({ data }) => setSettings(data));
  }, []);

  if (!settings || (!settings.support_email && !settings.support_whatsapp && !settings.support_phone)) return null;

  return (
    <div className="flex flex-col items-center gap-2 mt-6">
      <p className="text-xs text-slate-400">{label}</p>
      <div className="flex items-center gap-3">
        {settings.support_email && (
          <a href={`mailto:${settings.support_email}`} className="w-11 h-11 rounded-full bg-field-600 flex items-center justify-center text-white shadow-sm hover:bg-field-700 transition-colors" aria-label="Email support">
            <Mail className="w-5 h-5" />
          </a>
        )}
        {settings.support_whatsapp && (
          <a href={`https://wa.me/${settings.support_whatsapp}`} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-field-600 flex items-center justify-center text-white shadow-sm hover:bg-field-700 transition-colors" aria-label="WhatsApp support">
            <MessageCircle className="w-5 h-5" />
          </a>
        )}
        {settings.support_phone && (
          <a href={`tel:${settings.support_phone}`} className="w-11 h-11 rounded-full bg-field-600 flex items-center justify-center text-white shadow-sm hover:bg-field-700 transition-colors" aria-label="Call support">
            <Phone className="w-5 h-5" />
          </a>
        )}
      </div>
    </div>
  );
}
