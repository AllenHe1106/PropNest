import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST, OPTIONS' } });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Authenticate user
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lease_id, rent_charge_id, amount_cents } = await req.json();

    if (!lease_id || !amount_cents || !Number.isInteger(amount_cents) || amount_cents <= 0) {
      return new Response(JSON.stringify({ error: 'lease_id and a positive integer amount_cents are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify user is an active tenant on this lease
    const { data: tenantCheck } = await supabase
      .from('lease_tenants')
      .select('id')
      .eq('lease_id', lease_id)
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single();

    if (!tenantCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Landlord not set up for payments' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    return new Response(
      JSON.stringify({ client_secret: intent.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
