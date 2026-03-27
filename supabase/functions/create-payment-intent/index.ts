import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsResponse, jsonResponse, errorResponse, methodNotAllowed } from '../_shared/cors.ts';
import { getAuthenticatedUser, getServiceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse(req);
  }

  if (req.method !== 'POST') {
    return methodNotAllowed();
  }

  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse(req, 'Unauthorized', 401);
    }

    const { lease_id, rent_charge_id, amount_cents } = await req.json();

    if (!lease_id || !amount_cents || !Number.isInteger(amount_cents) || amount_cents <= 0) {
      return errorResponse(req, 'lease_id and a positive integer amount_cents are required', 400);
    }

    const supabase = getServiceClient();

    // 2. Verify user is an active tenant on this lease
    const { data: tenantCheck } = await supabase
      .from('lease_tenants')
      .select('id')
      .eq('lease_id', lease_id)
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single();

    if (!tenantCheck) {
      return errorResponse(req, 'Forbidden', 403);
    }

    // 3. Fetch landlord's Stripe Connect account
    const { data: lease } = await supabase
      .from('leases')
      .select(`
        unit_id,
        units!inner(
          property_id,
          properties!inner(
            organization_id,
            organizations!inner(
              stripe_accounts(stripe_account_id)
            )
          )
        )
      `)
      .eq('id', lease_id)
      .single();

    const stripeAccountId = (lease as any)
      ?.units?.properties?.organizations?.stripe_accounts?.[0]?.stripe_account_id;

    if (!stripeAccountId) {
      return errorResponse(req, 'Landlord not set up for payments', 422);
    }

    // 4. Create Stripe PaymentIntent
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const intent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      transfer_data: { destination: stripeAccountId },
      metadata: {
        lease_id,
        tenant_id: user.id,
        rent_charge_id: rent_charge_id || '',
      },
    });

    // 5. Insert pending payment record
    await supabase.from('payments').insert({
      lease_id,
      rent_charge_id: rent_charge_id || null,
      paid_by: user.id,
      method: 'stripe',
      status: 'pending',
      amount: amount_cents / 100,
      payment_date: new Date().toISOString().split('T')[0],
      stripe_payment_intent_id: intent.id,
    });

    return jsonResponse(req, { client_secret: intent.client_secret });
  } catch (err) {
    return errorResponse(req, (err as Error).message, 500);
  }
});
