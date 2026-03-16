import { createClient as supabaseCreateClient, type SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient };

/**
 * Factory function — NOT a singleton.
 * Web and mobile pass different storage adapters.
 */
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
  return supabaseCreateClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      ...options?.auth,
    },
  });
}
