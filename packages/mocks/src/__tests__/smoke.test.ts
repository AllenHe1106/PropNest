import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createMockServer } from '../server';
import { landlordWithTwoTenants } from '../scenarios';

describe('E2E smoke test', () => {
  const { server, store } = createMockServer();

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    store.reset();
    server.resetHandlers();
    store.seed(landlordWithTwoTenants());
  });

  it('full rent payment flow: sign in → list leases → create payment intent', async () => {
    const SUPABASE_URL = 'http://localhost:54321';

    // 1. Sign in as tenant
    const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tenant1@propnest-test.com', password: 'test123' }),
    });
    expect(signIn.status).toBe(200);
    const signInBody = (await signIn.json()) as { access_token: string };
    const { access_token } = signInBody;
    expect(access_token).toBeDefined();

    // 2. Get leases visible to this tenant
    const leasesRes = await fetch(`${SUPABASE_URL}/rest/v1/leases?select=*`, {
      headers: { Authorization: `Bearer ${access_token}`, apikey: 'test' },
    });
    expect(leasesRes.status).toBe(200);
    const leases = (await leasesRes.json()) as any[];
    expect(leases.length).toBeGreaterThanOrEqual(1);

    // 3. Create payment intent via edge function
    const lease = leases[0];
    const piRes = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lease_id: lease.id,
        amount: lease.rent_amount,
      }),
    });
    expect(piRes.status).toBe(200);
    const { client_secret, payment_intent_id } = (await piRes.json()) as {
      client_secret: string;
      payment_intent_id: string;
    };
    expect(client_secret).toBeDefined();
    expect(payment_intent_id).toBeDefined();

    // 4. Verify PaymentIntent was created in store
    const intent = store.stripePaymentIntents.get(payment_intent_id);
    expect(intent).toBeDefined();
    expect(intent!.status).toBe('requires_payment_method');

    // 5. Simulate webhook (payment succeeded)
    const webhookRes = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'payment_intent.succeeded',
        data: { object: { id: payment_intent_id } },
      }),
    });
    expect(webhookRes.status).toBe(200);

    // 6. Verify payment record was created
    expect(intent!.status).toBe('succeeded');
    const payments = Array.from(store.payments.values()).filter(
      (p) => p.stripe_payment_intent_id === payment_intent_id,
    );
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe('succeeded');
  });
});
