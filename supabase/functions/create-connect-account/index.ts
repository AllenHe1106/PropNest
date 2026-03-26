import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse(req, 'Unauthorized', 401);

    const { organization_id } = await req.json();
    if (!organization_id) return errorResponse(req, 'organization_id is required', 400);

    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse(req, 'Forbidden', 403);

    const supabase = getServiceClient();

    // Check for existing account (idempotent)
    const { data: existing } = await supabase
      .from('stripe_accounts')
      .select('stripe_account_id')
      .eq('organization_id', organization_id)
      .single();

    if (existing) {
      return jsonResponse(req, { stripe_account_id: existing.stripe_account_id, existing: true });
    }

    // Create Stripe Connect Express account
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { organization_id },
    });

    // Insert record
    const { error: insertError } = await supabase
      .from('stripe_accounts')
      .insert({
        organization_id,
        stripe_account_id: account.id,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });

    if (insertError) return errorResponse(req, insertError.message, 500);

    return jsonResponse(req, { stripe_account_id: account.id, existing: false });
  } catch (err) {
    return errorResponse(req, (err as Error).message, 500);
  }
});
