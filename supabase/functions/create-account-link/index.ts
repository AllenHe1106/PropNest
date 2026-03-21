import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, requireOrgOwner, getServiceClient } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse('Unauthorized', 401);

    const { organization_id, return_url, refresh_url } = await req.json();
    if (!organization_id || !return_url || !refresh_url) {
      return errorResponse('organization_id, return_url, and refresh_url are required', 400);
    }

    const isOwner = await requireOrgOwner(user.id, organization_id);
    if (!isOwner) return errorResponse('Forbidden', 403);

    const supabase = getServiceClient();

    const { data: stripeAccount } = await supabase
      .from('stripe_accounts')
      .select('stripe_account_id')
      .eq('organization_id', organization_id)
      .single();

    if (!stripeAccount) {
      return errorResponse('No Stripe account found. Create one first.', 404);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });

    const link = await stripe.accountLinks.create({
      account: stripeAccount.stripe_account_id,
      return_url,
      refresh_url,
      type: 'account_onboarding',
    });

    return jsonResponse({ url: link.url });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
