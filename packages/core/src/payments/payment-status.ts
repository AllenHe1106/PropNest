import type { PaymentStatus } from '@propnest/db';

const TERMINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  'succeeded',
  'failed',
  'refunded',
]);

export function isTerminalStatus(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canRetry(status: PaymentStatus): boolean {
  return status === 'failed';
}
