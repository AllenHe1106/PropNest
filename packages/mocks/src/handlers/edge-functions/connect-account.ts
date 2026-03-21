import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function createConnectAccountHandler(supabaseUrl: string, store: MockStore) {
  return http.post(
    `${supabaseUrl}/functions/v1/create-connect-account`,
    async ({ request }) => {
      const auth = request.headers.get('Authorization');
      if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const payload = decodeTestJwt(auth.replace('Bearer ', ''));
      if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

      const { organization_id } = (await request.json()) as { organization_id: string };
      if (!organization_id) {
        return HttpResponse.json({ error: 'organization_id required' }, { status: 400 });
      }

      const isOwner = Array.from(store.organizationMembers.values()).some(
        (m) =>
          m.organization_id === organization_id &&
          m.user_id === payload.sub &&
          m.role === 'owner' &&
          m.accepted_at,
      );
      if (!isOwner) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

      const existing = Array.from(store.stripeAccounts.values()).find(
        (sa) => sa.organization_id === organization_id,
      );
      if (existing) {
        return HttpResponse.json({
          stripe_account_id: existing.stripe_account_id,
          existing: true,
        });
      }

      const now = new Date().toISOString();
      const accountId = `acct_${faker.string.alphanumeric(16)}`;
      const recordId = faker.string.uuid();
      store.stripeAccounts.set(recordId, {
        id: recordId,
        organization_id,
        stripe_account_id: accountId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        created_at: now,
        updated_at: now,
      });

      return HttpResponse.json({ stripe_account_id: accountId, existing: false });
    },
  );
}

export function createAccountLinkHandler(supabaseUrl: string, store: MockStore) {
  return http.post(
    `${supabaseUrl}/functions/v1/create-account-link`,
    async ({ request }) => {
      const auth = request.headers.get('Authorization');
      if (!auth) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const payload = decodeTestJwt(auth.replace('Bearer ', ''));
      if (!payload) return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });

      const { organization_id, return_url, refresh_url } = (await request.json()) as {
        organization_id: string;
        return_url: string;
        refresh_url: string;
      };

      if (!organization_id || !return_url || !refresh_url) {
        return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      const isOwner = Array.from(store.organizationMembers.values()).some(
        (m) =>
          m.organization_id === organization_id &&
          m.user_id === payload.sub &&
          m.role === 'owner' &&
          m.accepted_at,
      );
      if (!isOwner) return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });

      const account = Array.from(store.stripeAccounts.values()).find(
        (sa) => sa.organization_id === organization_id,
      );
      if (!account) {
        return HttpResponse.json({ error: 'No Stripe account found' }, { status: 404 });
      }

      return HttpResponse.json({
        url: `https://connect.stripe.com/setup/e/${account.stripe_account_id}`,
      });
    },
  );
}
