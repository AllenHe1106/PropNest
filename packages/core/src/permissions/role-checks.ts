export type AppRole = 'owner' | 'manager' | 'tenant';

export function canManageFinancials(role: AppRole): boolean {
  return role === 'owner';
}

export function canSubmitMaintenance(role: AppRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'tenant';
}

export function canViewAllProperties(role: AppRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canInviteUsers(role: AppRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canDeleteProperty(role: AppRole): boolean {
  return role === 'owner';
}
