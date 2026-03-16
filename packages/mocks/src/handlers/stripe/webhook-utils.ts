import type { MockStore } from '../../store';

export type StripeEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'account.updated';

export interface MockStripeEvent {
  id: string;
  type: StripeEventType;
  data: { object: Record<string, unknown> };
  created: number;
}

export function simulateStripeWebhook(
  store: MockStore,
  eventType: StripeEventType,
  resourceId: string,
): MockStripeEvent {
  const event: MockStripeEvent = {
    id: `evt_${Date.now()}`,
    type: eventType,
    data: { object: {} },
    created: Math.floor(Date.now() / 1000),
  };

  if (eventType === 'payment_intent.succeeded') {
    const intent = store.stripePaymentIntents.get(resourceId);
    if (intent) {
      intent.status = 'succeeded';
      event.data.object = { ...intent };
    }
  } else if (eventType === 'payment_intent.payment_failed') {
    const intent = store.stripePaymentIntents.get(resourceId);
    if (intent) {
      intent.status = 'requires_payment_method';
      event.data.object = { ...intent };
    }
  } else if (eventType === 'account.updated') {
    const account = store.stripeConnectAccounts.get(resourceId);
    if (account) {
      account.charges_enabled = true;
      account.payouts_enabled = true;
      account.details_submitted = true;
      event.data.object = { ...account };
    }
  }

  return event;
}
