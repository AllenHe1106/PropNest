import type { MaintenanceStatus } from '@propnest/db';

const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, ReadonlySet<MaintenanceStatus>> = {
  open: new Set<MaintenanceStatus>(['in_progress', 'cancelled']),
  in_progress: new Set<MaintenanceStatus>(['pending_approval', 'cancelled']),
  pending_approval: new Set<MaintenanceStatus>(['completed', 'in_progress']),
  completed: new Set<MaintenanceStatus>([]),
  cancelled: new Set<MaintenanceStatus>([]),
};

export function canTransition(
  from: MaintenanceStatus,
  to: MaintenanceStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}
