import { getServiceRoleClient } from './auth-helpers';

/**
 * Truncates all application tables in FK-safe order using the service role client.
 * This ensures a clean slate between integration test runs.
 */
export async function truncateAll(): Promise<void> {
  const client = getServiceRoleClient();

  // Order matters: children before parents to respect foreign key constraints.
  const tables = [
    'maintenance_attachments',
    'maintenance_comments',
    'maintenance_requests',
    'messages',
    'conversation_participants',
    'conversations',
    'documents',
    'payments',
    'rent_charges',
    'lease_tenants',
    'leases',
    'units',
    'properties',
    'stripe_accounts',
    'organization_members',
    'organizations',
    'profiles',
  ];

  for (const table of tables) {
    const { error } = await client.rpc('truncate_table', { table_name: table });
    if (error) {
      // Fallback: delete all rows if the RPC doesn't exist
      const { error: deleteError } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (deleteError) {
        throw new Error(`truncateAll failed on "${table}": ${deleteError.message}`);
      }
    }
  }
}
