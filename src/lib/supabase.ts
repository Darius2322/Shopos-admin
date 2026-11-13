import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { makeQueueingFetch } from './offlineQueue';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Admin table changes made offline are kept and sent when the phone is online again (rpc calls need the internet).
let client: SupabaseClient | null = null;
const queueing = makeQueueingFetch({
  match: (u) => /\/rest\/v1\/(?!rpc\/)/.test(u),
  token: async () => (await client?.auth.getSession())?.data.session?.access_token,
});
export const supabase: SupabaseClient | null =
  supabaseUrl && anonKey ? (client = createClient(supabaseUrl, anonKey, { global: { fetch: queueing } })) : null;
