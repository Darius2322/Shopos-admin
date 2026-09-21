import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface PlatformContact {
  support_email: string | null;
  support_whatsapp: string | null;
  support_phone: string | null;
}

/** Support details are read from platform_settings (the same source SupportContact
 * uses) — nothing here is hardcoded or invented. Returns null while loading / if unset. */
export function usePlatformContact(): PlatformContact | null {
  const [contact, setContact] = useState<PlatformContact | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.from('platform_settings').select('support_email, support_whatsapp, support_phone').eq('id', 'default').maybeSingle()
      .then(({ data }) => { if (alive) setContact(data); }, () => undefined);
    return () => { alive = false; };
  }, []);
  return contact;
}

export const DMN_URL = 'https://dmn-solutions.vercel.app/';
