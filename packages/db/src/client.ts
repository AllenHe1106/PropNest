import { createClient as supabaseCreateClient } from '@supabase/supabase-js';
import type { Database } from './types.generated';

export type { Database };
export type SupabaseClient = ReturnType<typeof supabaseCreateClient<Database>>;

export function createClient(
  url: string,
  anonKey: string,
  options?: {
    auth?: {
      storage?: any;
      autoRefreshToken?: boolean;
      persistSession?: boolean;
      detectSessionInUrl?: boolean;
    };
  },
): SupabaseClient {
  return supabaseCreateClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      ...options?.auth,
    },
  });
}
