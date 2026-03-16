/**
 * Deterministic JWT minting for test environments.
 * NOT cryptographically secure — test only.
 */

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  aud: string;
  iat: number;
  exp: number;
}

export function mintTestJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + 3600,
  };
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(fullPayload));
  const sig = base64url('test-signature');
  return `${header}.${body}.${sig}`;
}

export function decodeTestJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
