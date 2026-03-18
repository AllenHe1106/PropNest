import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { faker } from '@faker-js/faker';

export function createAccountHandlers(store: MockStore) {
  return [
    // Create Connect account
    http.post('https://api.stripe.com/v1/accounts', async ({ request }) => {
      const id = `acct_${faker.string.alphanumeric(16)}`;
      const account = {
        id,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      };
      store.stripeConnectAccounts.set(id, account);

      return HttpResponse.json({
        id,
        object: 'account',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }),

    // Retrieve account
    http.get('https://api.stripe.com/v1/accounts/:id', ({ params }) => {
      const id = params.id as string;
      const account = store.stripeConnectAccounts.get(id);
      if (!account) {
        return HttpResponse.json(
          { error: { message: 'No such account', type: 'invalid_request_error' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({
        id: account.id,
        object: 'account',
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
    }),

    // Create account link (for onboarding)
    http.post('https://api.stripe.com/v1/account_links', async ({ request }) => {
      const body = await request.text();
      const params = new URLSearchParams(body);
      const accountId = params.get('account') || '';

      return HttpResponse.json({
        object: 'account_link',
        url: `https://connect.stripe.com/setup/s/${faker.string.alphanumeric(24)}`,
        created: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    }),
  ];
}
