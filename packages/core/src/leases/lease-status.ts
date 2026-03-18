import type { LeaseStatus } from '@propnest/db';

export function isActiveLease(status: LeaseStatus): boolean {
  return status === 'active';
}

export function canTerminate(status: LeaseStatus): boolean {
  return status === 'active';
}
