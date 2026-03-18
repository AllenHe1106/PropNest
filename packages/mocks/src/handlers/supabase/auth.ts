import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { mintTestJwt, decodeTestJwt } from './jwt';
import { faker } from '@faker-js/faker';

export function createAuthHandlers(supabaseUrl: string, store: MockStore) {
  return [
    // Sign up
    http.post(`${supabaseUrl}/auth/v1/signup`, async ({ request }) => {
      const { email, password, data: userMetadata } = (await request.json()) as {
        email: string;
        password: string;
        data?: Record<string, unknown>;
      };

      const existing = Array.from(store.users.values()).find((u) => u.email === email);
      if (existing) {
        return HttpResponse.json({ error: 'User already registered' }, { status: 400 });
      }

      const id = faker.string.uuid();
      store.users.set(id, { id, email, password, role: 'tenant', user_metadata: userMetadata });

      const access_token = mintTestJwt({ sub: id, email, role: 'authenticated', aud: 'authenticated' });
      const refresh_token = faker.string.alphanumeric(32);
      store.sessions.set(access_token, {
        access_token,
        refresh_token,
        user_id: id,
        expires_at: Date.now() + 3600_000,
      });

      return HttpResponse.json({
        user: { id, email, role: 'authenticated', user_metadata: userMetadata ?? {} },
        session: { access_token, refresh_token, expires_in: 3600, token_type: 'bearer' },
      });
    }),

    // Sign in (password grant)
    http.post(`${supabaseUrl}/auth/v1/token`, async ({ request }) => {
      const url = new URL(request.url);
      const grantType = url.searchParams.get('grant_type');
      const body = (await request.json()) as { email?: string; password?: string; refresh_token?: string };

      if (grantType === 'password') {
        const user = Array.from(store.users.values()).find(
          (u) => u.email === body.email && u.password === body.password,
        );
        if (!user) {
          return HttpResponse.json({ error: 'Invalid login credentials' }, { status: 400 });
        }

        const access_token = mintTestJwt({
          sub: user.id,
          email: user.email,
          role: 'authenticated',
          aud: 'authenticated',
        });
        const refresh_token = faker.string.alphanumeric(32);
        store.sessions.set(access_token, {
          access_token,
          refresh_token,
          user_id: user.id,
          expires_at: Date.now() + 3600_000,
        });

        return HttpResponse.json({
          access_token,
          refresh_token,
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: user.id, email: user.email, role: 'authenticated', user_metadata: user.user_metadata ?? {} },
        });
      }

      if (grantType === 'refresh_token') {
        const session = Array.from(store.sessions.values()).find((s) => s.refresh_token === body.refresh_token);
        if (!session) {
          return HttpResponse.json({ error: 'Invalid refresh token' }, { status: 400 });
        }
        const user = store.users.get(session.user_id);
        if (!user) {
          return HttpResponse.json({ error: 'User not found' }, { status: 400 });
        }

        store.sessions.delete(session.access_token);
        const access_token = mintTestJwt({
          sub: user.id,
          email: user.email,
          role: 'authenticated',
          aud: 'authenticated',
        });
        const refresh_token = faker.string.alphanumeric(32);
        store.sessions.set(access_token, {
          access_token,
          refresh_token,
          user_id: user.id,
          expires_at: Date.now() + 3600_000,
        });

        return HttpResponse.json({
          access_token,
          refresh_token,
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: user.id, email: user.email, role: 'authenticated', user_metadata: user.user_metadata ?? {} },
        });
      }

      return HttpResponse.json({ error: 'Unsupported grant type' }, { status: 400 });
    }),

    // Get current user
    http.get(`${supabaseUrl}/auth/v1/user`, ({ request }) => {
      const auth = request.headers.get('Authorization');
      if (!auth) return HttpResponse.json({ error: 'No token' }, { status: 401 });

      const token = auth.replace('Bearer ', '');
      const session = store.sessions.get(token);
      if (!session) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

      const user = store.users.get(session.user_id);
      if (!user) return HttpResponse.json({ error: 'User not found' }, { status: 401 });

      return HttpResponse.json({
        id: user.id,
        email: user.email,
        role: 'authenticated',
        user_metadata: user.user_metadata ?? {},
      });
    }),

    // Logout
    http.post(`${supabaseUrl}/auth/v1/logout`, ({ request }) => {
      const auth = request.headers.get('Authorization');
      if (auth) {
        const token = auth.replace('Bearer ', '');
        store.sessions.delete(token);
      }
      return HttpResponse.json({});
    }),
  ];
}
