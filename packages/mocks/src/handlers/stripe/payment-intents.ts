import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { faker } from '@faker-js/faker';

export function createPaymentIntentHandlers(store: MockStore) {
  return [
    // Create PaymentIntent
    http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
      const body = await request.text();
      const params = new URLSearchParams(body);

      const id = `pi_${faker.string.alphanumeric(24)}`;
      const amount = parseInt(params.get('amount') || '0', 10);
      const currency = params.get('currency') || 'usd';

      const intent: import('../../store').MockPaymentIntent = {
        id,
        amount,
        currency,
        status: 'requires_payment_method',
        client_secret: `${id}_secret_${faker.string.alphanumeric(24)}`,
      };

      // Parse transfer_data if present
      const destination = params.get('transfer_data[destination]');
      if (destination) {
        intent.transfer_data = { destination };
        const transferAmount = params.get('transfer_data[amount]');
        if (transferAmount) intent.transfer_data.amount = parseInt(transferAmount, 10);
      }

      // Parse metadata
      const metadata: Record<string, string> = {};
      for (const [key, value] of params.entries()) {
        const match = key.match(/^metadata\[(.+)\]$/);
        if (match) metadata[match[1]] = value;
      }
      if (Object.keys(metadata).length > 0) intent.metadata = metadata;

      store.stripePaymentIntents.set(id, intent);

      return HttpResponse.json({
        id: intent.id,
        object: 'payment_intent',
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        client_secret: intent.client_secret,
        transfer_data: intent.transfer_data || null,
        metadata: intent.metadata || {},
      });
    }),

    // Retrieve PaymentIntent
    http.get('https://api.stripe.com/v1/payment_intents/:id', ({ params }) => {
      const id = params.id as string;
      const intent = store.stripePaymentIntents.get(id);
      if (!intent) {
        return HttpResponse.json(
          { error: { message: 'No such payment_intent', type: 'invalid_request_error' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({
        id: intent.id,
        object: 'payment_intent',
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        client_secret: intent.client_secret,
        transfer_data: intent.transfer_data || null,
        metadata: intent.metadata || {},
      });
    }),

    // Confirm PaymentIntent
    http.post('https://api.stripe.com/v1/payment_intents/:id/confirm', ({ params }) => {
      const id = params.id as string;
      const intent = store.stripePaymentIntents.get(id);
      if (!intent) {
        return HttpResponse.json(
          { error: { message: 'No such payment_intent', type: 'invalid_request_error' } },
          { status: 404 },
        );
      }
      intent.status = 'succeeded';
      return HttpResponse.json({
        id: intent.id,
        object: 'payment_intent',
        amount: intent.amount,
        currency: intent.currency,
        status: 'succeeded',
        client_secret: intent.client_secret,
        transfer_data: intent.transfer_data || null,
        metadata: intent.metadata || {},
      });
    }),

    // Cancel PaymentIntent
    http.post('https://api.stripe.com/v1/payment_intents/:id/cancel', ({ params }) => {
      const id = params.id as string;
      const intent = store.stripePaymentIntents.get(id);
      if (!intent) {
        return HttpResponse.json(
          { error: { message: 'No such payment_intent', type: 'invalid_request_error' } },
          { status: 404 },
        );
      }
      intent.status = 'canceled';
      return HttpResponse.json({
        id: intent.id,
        object: 'payment_intent',
        amount: intent.amount,
        currency: intent.currency,
        status: 'canceled',
        client_secret: intent.client_secret,
      });
    }),
  ];
}
