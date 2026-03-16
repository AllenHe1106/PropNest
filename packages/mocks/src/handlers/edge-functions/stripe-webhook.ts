import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { faker } from '@faker-js/faker';

export function stripeWebhookHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/stripe-webhook`, async ({ request }) => {
    const body = (await request.json()) as {
      type: string;
      data: { object: { id: string; status?: string; metadata?: Record<string, string> } };
    };

    const { type, data } = body;

    if (type === 'payment_intent.succeeded') {
      const piId = data.object.id;
      const intent = store.stripePaymentIntents.get(piId);
      if (intent) {
        intent.status = 'succeeded';

        // Create a payment record if metadata has lease info
        const leaseId = intent.metadata?.lease_id;
        const tenantId = intent.metadata?.tenant_id;
        if (leaseId && tenantId) {
          const paymentId = faker.string.uuid();
          store.payments.set(paymentId, {
            id: paymentId,
            lease_id: leaseId,
            rent_charge_id: null,
            paid_by: tenantId,
            recorded_by: null,
            method: 'stripe',
            status: 'succeeded',
            amount: intent.amount / 100, // Convert back from cents
            payment_date: new Date().toISOString().split('T')[0],
            stripe_payment_intent_id: piId,
            stripe_charge_id: null,
            receipt_url: null,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      return HttpResponse.json({ received: true });
    }

    if (type === 'payment_intent.payment_failed') {
      const piId = data.object.id;
      const intent = store.stripePaymentIntents.get(piId);
      if (intent) {
        intent.status = 'requires_payment_method';
      }
      return HttpResponse.json({ received: true });
    }

    if (type === 'account.updated') {
      const accountId = data.object.id;
      const account = store.stripeConnectAccounts.get(accountId);
      if (account) {
        account.charges_enabled = true;
        account.payouts_enabled = true;
        account.details_submitted = true;
      }
      return HttpResponse.json({ received: true });
    }

    return HttpResponse.json({ received: true });
  });
}
