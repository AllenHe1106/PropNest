import { setupServer } from 'msw/node';
import { createMockStore } from './store';
import { createAuthHandlers } from './handlers/supabase/auth';
import { createRestHandlers } from './handlers/supabase/rest';
import { createStorageHandlers } from './handlers/supabase/storage';
import { createPaymentIntentHandlers } from './handlers/stripe/payment-intents';
import { createAccountHandlers } from './handlers/stripe/accounts';
import { createPaymentIntentHandler } from './handlers/edge-functions/create-payment-intent';
import { stripeWebhookHandler } from './handlers/edge-functions/stripe-webhook';
import { inviteMemberHandler } from './handlers/edge-functions/invite-member';
import { inviteTenantHandler } from './handlers/edge-functions/invite-tenant';
import { acceptInviteHandler } from './handlers/edge-functions/accept-invite';
import { createConnectAccountHandler, createAccountLinkHandler } from './handlers/edge-functions/connect-account';

const DEFAULT_SUPABASE_URL = 'http://localhost:54321';

export function createMockServer(supabaseUrl = DEFAULT_SUPABASE_URL) {
  const store = createMockStore();

  const handlers = [
    ...createAuthHandlers(supabaseUrl, store),
    ...createRestHandlers(supabaseUrl, store),
    ...createStorageHandlers(supabaseUrl, store),
    ...createPaymentIntentHandlers(store),
    ...createAccountHandlers(store),
    createPaymentIntentHandler(supabaseUrl, store),
    stripeWebhookHandler(supabaseUrl, store),
    inviteMemberHandler(supabaseUrl, store),
    inviteTenantHandler(supabaseUrl, store),
    acceptInviteHandler(supabaseUrl, store),
    createConnectAccountHandler(supabaseUrl, store),
    createAccountLinkHandler(supabaseUrl, store),
  ];

  const server = setupServer(...handlers);

  return { server, store };
}
