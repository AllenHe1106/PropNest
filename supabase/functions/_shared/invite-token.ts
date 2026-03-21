import { create, verify, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const INVITE_EXPIRY_DAYS = 7;

interface InvitePayload {
  type: 'member_invite' | 'tenant_invite';
  email: string;
  organization_id?: string;
  lease_id?: string;
  role?: string;
}

async function getSigningKey() {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET')!;
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signInviteToken(payload: InvitePayload): Promise<string> {
  const key = await getSigningKey();
  return await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      ...payload,
      exp: getNumericDate(INVITE_EXPIRY_DAYS * 24 * 60 * 60),
      iat: getNumericDate(0),
    },
    key,
  );
}

export async function verifyInviteToken(token: string): Promise<InvitePayload | null> {
  try {
    const key = await getSigningKey();
    const payload = await verify(token, key);
    return payload as unknown as InvitePayload;
  } catch {
    return null;
  }
}
