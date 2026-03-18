import { setupWorker } from 'msw/browser';
import { createMockStore } from './store';
import { createAuthHandlers } from './handlers/supabase/auth';
import { createRestHandlers } from './handlers/supabase/rest';
import { createStorageHandlers } from './handlers/supabase/storage';
import { createPaymentIntentHandlers } from './handlers/stripe/payment-intents';
import { createAccountHandlers } from './handlers/stripe/accounts';

const DEFAULT_SUPABASE_URL = 'http://localhost:54321';

export function createMockWorker(supabaseUrl = DEFAULT_SUPABASE_URL) {
  const store = createMockStore();

  const handlers = [
    ...createAuthHandlers(supabaseUrl, store),
    ...createRestHandlers(supabaseUrl, store),
    ...createStorageHandlers(supabaseUrl, store),
    ...createPaymentIntentHandlers(store),
    ...createAccountHandlers(store),
  ];

  const worker = setupWorker(...handlers);

  return { worker, store };
}
