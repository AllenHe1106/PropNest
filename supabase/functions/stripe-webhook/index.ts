import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { getServiceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const sig = req.headers.get('stripe-signature');
    if (!sig) {
      return new Response('Missing stripe-signature', { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      );
    } catch {
      return new Response('Bad signature', { status: 400 });
    }

    const supabase = getServiceClient();

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const { error: succErr } = await supabase
          .from('payments')
          .update({
            status: 'succeeded',
            stripe_charge_id: intent.latest_charge as string,
          })
          .eq('stripe_payment_intent_id', intent.id);
        if (succErr) console.error('Failed to update payment to succeeded:', succErr);
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const { error: failErr } = await supabase
          .from('payments')
          .update({ status: 'failed' })
          .eq('stripe_payment_intent_id', intent.id);
        if (failErr) console.error('Failed to update payment to failed:', failErr);
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const { error: acctErr } = await supabase
          .from('stripe_accounts')
          .update({
            charges_enabled: account.charges_enabled ?? false,
            payouts_enabled: account.payouts_enabled ?? false,
            details_submitted: account.details_submitted ?? false,
          })
          .eq('stripe_account_id', account.id);
        if (acctErr) console.error('Failed to update stripe account:', acctErr);
        break;
      }
    }

    return new Response('ok');
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }
});
