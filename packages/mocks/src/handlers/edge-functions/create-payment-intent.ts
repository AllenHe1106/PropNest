import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from '../supabase/jwt';
import { faker } from '@faker-js/faker';

export function createPaymentIntentHandler(supabaseUrl: string, store: MockStore) {
  return http.post(`${supabaseUrl}/functions/v1/create-payment-intent`, async ({ request }) => {
    // Validate JWT
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return HttpResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    const token = auth.replace('Bearer ', '');
    const payload = decodeTestJwt(token);
    if (!payload) {
      return HttpResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json()) as { lease_id: string; amount: number };
    const { lease_id, amount } = body;

    if (!lease_id || !amount) {
      return HttpResponse.json({ error: 'lease_id and amount are required' }, { status: 400 });
    }

    // Verify user is a tenant on this lease
    const isTenant = Array.from(store.leaseTenants.values()).some(
      (lt) => lt.lease_id === lease_id && lt.user_id === payload.sub,
    );
    if (!isTenant) {
      return HttpResponse.json({ error: 'Not authorized for this lease' }, { status: 403 });
    }

    // Find the org's Stripe Connect account via lease -> unit -> property -> org -> stripe_account
    const lease = store.leases.get(lease_id);
    if (!lease) {
      return HttpResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    const unit = store.units.get(lease.unit_id);
    if (!unit) {
      return HttpResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const property = Array.from(store.properties.values()).find((p) => p.id === unit.property_id);
    if (!property) {
      return HttpResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const stripeAccount = Array.from(store.stripeAccounts.values()).find(
      (sa) => sa.organization_id === property.organization_id,
    );

    // Create PaymentIntent in store
    const id = `pi_${faker.string.alphanumeric(24)}`;
    const intent = {
      id,
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      status: 'requires_payment_method' as const,
      client_secret: `${id}_secret_${faker.string.alphanumeric(24)}`,
      transfer_data: stripeAccount
        ? { destination: stripeAccount.stripe_account_id }
        : undefined,
      metadata: {
        lease_id,
        tenant_id: payload.sub,
      },
    };

    store.stripePaymentIntents.set(id, intent);

    return HttpResponse.json({
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      amount: intent.amount,
    });
  });
}
