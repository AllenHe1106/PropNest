import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } from './env';

/**
 * Returns a Supabase client authenticated with the service role key.
 * This client bypasses RLS entirely.
 */
export function getServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Returns a Supabase client authenticated with the anon key.
 * RLS policies are enforced.
 */
export function getAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a confirmed auth user via the admin API (service role).
 * Returns the created user object.
 */
export async function createAuthUser(email: string, password: string) {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createAuthUser failed: ${error.message}`);
  return data.user;
}

/**
 * Signs in as an existing user and returns the authenticated client,
 * user object, and session.
 */
export async function signInAsUser(email: string, password: string) {
  const client = getAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(`signInAsUser failed: ${error.message}`);
  return {
    client,
    user: data.user,
    session: data.session,
  };
}
