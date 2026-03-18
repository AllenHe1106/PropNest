function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it before running integration tests.`,
    );
  }
  return value;
}

export const SUPABASE_URL = requireEnv('SUPABASE_URL');
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
