import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Asserts that a user's client can see exactly `expectedCount` rows
 * from `table` matching the given filter.
 */
export async function assertRLSVisible(
  client: SupabaseClient,
  table: string,
  filter: Record<string, unknown>,
  expectedCount: number,
): Promise<void> {
  let query = client.from(table).select('*', { count: 'exact', head: true });

  for (const [column, value] of Object.entries(filter)) {
    query = query.eq(column, value as string);
  }

  const { count, error } = await query;
  if (error) throw new Error(`assertRLSVisible query failed on "${table}": ${error.message}`);

  if (count !== expectedCount) {
    throw new Error(
      `assertRLSVisible: expected ${expectedCount} row(s) in "${table}" ` +
        `matching ${JSON.stringify(filter)}, but got ${count}`,
    );
  }
}

/**
 * Asserts that a user's client sees zero rows from `table` matching the given filter.
 */
export async function assertRLSNotVisible(
  client: SupabaseClient,
  table: string,
  filter: Record<string, unknown>,
): Promise<void> {
  await assertRLSVisible(client, table, filter, 0);
}
