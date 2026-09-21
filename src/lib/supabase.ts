import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl = url;

// The app must keep working offline (and in local dev without a project
// configured yet), so we don't throw here — we just report "no backend".
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export function backendConfigured(): boolean {
  return supabase !== null;
}
