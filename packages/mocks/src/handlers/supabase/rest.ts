import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { decodeTestJwt } from './jwt';
import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Utility: map PostgREST table name to the corresponding MockStore Map
// ---------------------------------------------------------------------------

function getTableMap(store: MockStore, tableName: string): Map<string, any> | null {
  const tableMapping: Record<string, Map<string, any>> = {
    organizations: store.organizations,
    profiles: store.profiles,
    organization_members: store.organizationMembers,
    properties: store.properties,
    units: store.units,
    leases: store.leases,
    lease_tenants: store.leaseTenants,
    rent_charges: store.rentCharges,
    payments: store.payments,
    stripe_accounts: store.stripeAccounts,
    maintenance_requests: store.maintenanceRequests,
    maintenance_comments: store.maintenanceComments,
    maintenance_attachments: store.maintenanceAttachments,
    documents: store.documents,
    conversations: store.conversations,
    conversation_participants: store.conversationParticipants,
    messages: store.messages,
  };
  return tableMapping[tableName] || null;
}

// ---------------------------------------------------------------------------
// PostgREST filter parsing
// ---------------------------------------------------------------------------

interface PostgrestFilter {
  column: string;
  operator: string;
  value: string;
}

function parsePostgrestFilters(searchParams: URLSearchParams): PostgrestFilter[] {
  const filters: PostgrestFilter[] = [];
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);

  for (const [key, value] of searchParams.entries()) {
    if (reserved.has(key)) continue;
    const dotIndex = value.indexOf('.');
    if (dotIndex === -1) continue;
    const operator = value.substring(0, dotIndex);
    const filterValue = value.substring(dotIndex + 1);
    filters.push({ column: key, operator, value: filterValue });
  }
  return filters;
}

// ---------------------------------------------------------------------------
// Apply a single filter to a record
// ---------------------------------------------------------------------------

function applyFilter(record: Record<string, any>, filter: PostgrestFilter): boolean {
  const fieldValue = record[filter.column];

  switch (filter.operator) {
    case 'eq':
      return String(fieldValue) === filter.value;
    case 'neq':
      return String(fieldValue) !== filter.value;
    case 'gt':
      return Number(fieldValue) > Number(filter.value);
    case 'lt':
      return Number(fieldValue) < Number(filter.value);
    case 'gte':
      return Number(fieldValue) >= Number(filter.value);
    case 'lte':
      return Number(fieldValue) <= Number(filter.value);
    case 'like':
      return new RegExp(filter.value.replace(/%/g, '.*')).test(String(fieldValue));
    case 'ilike':
      return new RegExp(filter.value.replace(/%/g, '.*'), 'i').test(String(fieldValue));
    case 'in': {
      const vals = filter.value.replace(/^\(/, '').replace(/\)$/, '').split(',');
      return vals.includes(String(fieldValue));
    }
    case 'is': {
      if (filter.value === 'null') return fieldValue === null || fieldValue === undefined;
      if (filter.value === 'true') return fieldValue === true;
      if (filter.value === 'false') return fieldValue === false;
      return false;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Apply all filters to a list of records
// ---------------------------------------------------------------------------

function applyFilters(records: Record<string, any>[], filters: PostgrestFilter[]): Record<string, any>[] {
  return records.filter((record) => filters.every((f) => applyFilter(record, f)));
}

// ---------------------------------------------------------------------------
// Lightweight RLS simulation (NOT a security test)
// ---------------------------------------------------------------------------

function applyRlsFilter(
  store: MockStore,
  tableName: string,
  records: Record<string, any>[],
  userId: string,
): Record<string, any>[] {
  // Get user's org memberships
  const userOrgIds = new Set(
    Array.from(store.organizationMembers.values())
      .filter((m: any) => m.user_id === userId)
      .map((m: any) => m.organization_id),
  );

  // Get user's lease IDs (as tenant)
  const userLeaseIds = new Set(
    Array.from(store.leaseTenants.values())
      .filter((lt: any) => lt.user_id === userId)
      .map((lt: any) => lt.lease_id),
  );

  // Get unit IDs from user's leases
  const userUnitIds = new Set(
    Array.from(store.leases.values())
      .filter((l: any) => userLeaseIds.has(l.id))
      .map((l: any) => l.unit_id),
  );

  switch (tableName) {
    case 'organizations':
      return records.filter((r) => userOrgIds.has(r.id));

    case 'properties':
      return records.filter((r) => userOrgIds.has(r.organization_id));

    case 'units': {
      const orgPropertyIds = new Set(
        Array.from(store.properties.values())
          .filter((p: any) => userOrgIds.has(p.organization_id))
          .map((p: any) => p.id),
      );
      return records.filter((r) => orgPropertyIds.has(r.property_id) || userUnitIds.has(r.id));
    }

    case 'leases': {
      // Visible if user is a tenant on the lease or is an org member who owns the unit
      const orgPropertyIds = new Set(
        Array.from(store.properties.values())
          .filter((p: any) => userOrgIds.has(p.organization_id))
          .map((p: any) => p.id),
      );
      const orgUnitIds = new Set(
        Array.from(store.units.values())
          .filter((u: any) => orgPropertyIds.has(u.property_id))
          .map((u: any) => u.id),
      );
      return records.filter((r) => userLeaseIds.has(r.id) || orgUnitIds.has(r.unit_id));
    }

    case 'lease_tenants':
      return records.filter((r) => userLeaseIds.has(r.lease_id) || r.user_id === userId);

    case 'rent_charges':
      return records.filter((r) => userLeaseIds.has(r.lease_id));

    case 'payments':
      return records.filter((r) => userLeaseIds.has(r.lease_id) || r.paid_by === userId);

    case 'maintenance_requests':
      return records.filter((r) => r.submitted_by === userId || userUnitIds.has(r.unit_id));

    case 'maintenance_comments':
      return records.filter((r) => {
        const req = Array.from(store.maintenanceRequests.values()).find((mr: any) => mr.id === r.request_id);
        if (!req) return false;
        return (req as any).submitted_by === userId || userUnitIds.has((req as any).unit_id);
      });

    case 'maintenance_attachments':
      return records.filter((r) => {
        const req = Array.from(store.maintenanceRequests.values()).find((mr: any) => mr.id === r.request_id);
        if (!req) return false;
        return (req as any).submitted_by === userId || userUnitIds.has((req as any).unit_id);
      });

    case 'profiles':
      return records; // profiles are generally readable

    case 'organization_members':
      return records.filter((r) => userOrgIds.has(r.organization_id));

    case 'stripe_accounts':
      return records.filter((r) => userOrgIds.has(r.organization_id));

    case 'documents':
      return records.filter((r) => userOrgIds.has(r.organization_id) || r.uploaded_by === userId);

    case 'conversations':
      return records.filter((r) => {
        return Array.from(store.conversationParticipants.values()).some(
          (cp: any) => cp.conversation_id === r.id && cp.user_id === userId,
        );
      });

    case 'conversation_participants':
      return records.filter((r) => {
        return Array.from(store.conversationParticipants.values()).some(
          (cp: any) => cp.conversation_id === r.conversation_id && cp.user_id === userId,
        );
      });

    case 'messages':
      return records.filter((r) => {
        return Array.from(store.conversationParticipants.values()).some(
          (cp: any) => cp.conversation_id === r.conversation_id && cp.user_id === userId,
        );
      });

    default:
      return records;
  }
}

// ---------------------------------------------------------------------------
// Apply select columns (PostgREST ?select=col1,col2)
// ---------------------------------------------------------------------------

function applySelect(records: Record<string, any>[], selectParam: string | null): Record<string, any>[] {
  if (!selectParam || selectParam === '*') return records;

  // Strip any embedded resource hints (e.g. "id,name,units(id,name)") — keep only top-level columns
  const columns = selectParam
    .replace(/\([^)]*\)/g, '') // remove parenthesised sub-selects
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (columns.length === 0) return records;

  return records.map((record) => {
    const picked: Record<string, any> = {};
    for (const col of columns) {
      if (col in record) {
        picked[col] = record[col];
      }
    }
    return picked;
  });
}

// ---------------------------------------------------------------------------
// Apply ordering (PostgREST ?order=col.asc, col2.desc)
// ---------------------------------------------------------------------------

function applyOrdering(records: Record<string, any>[], orderParam: string | null): Record<string, any>[] {
  if (!orderParam) return records;

  const orderings = orderParam.split(',').map((part) => {
    const segments = part.trim().split('.');
    const column = segments[0];
    const direction = segments[1] === 'desc' ? 'desc' : 'asc';
    return { column, direction };
  });

  return [...records].sort((a, b) => {
    for (const { column, direction } of orderings) {
      const aVal = a[column];
      const bVal = b[column];
      if (aVal === bVal) continue;
      if (aVal == null) return direction === 'asc' ? -1 : 1;
      if (bVal == null) return direction === 'asc' ? 1 : -1;
      const cmp = aVal < bVal ? -1 : 1;
      return direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Extract bearer token and decode JWT
// ---------------------------------------------------------------------------

function extractUserId(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const payload = decodeTestJwt(token);
  return payload?.sub ?? null;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createRestHandlers(supabaseUrl: string, store: MockStore) {
  return [
    // -----------------------------------------------------------------------
    // GET — read rows
    // -----------------------------------------------------------------------
    http.get(`${supabaseUrl}/rest/v1/:table`, ({ request, params }) => {
      const tableName = params.table as string;
      const tableMap = getTableMap(store, tableName);
      if (!tableMap) {
        return HttpResponse.json(
          { message: `relation "public.${tableName}" does not exist`, code: '42P01' },
          { status: 404 },
        );
      }

      const userId = extractUserId(request);
      if (!userId) {
        return HttpResponse.json({ message: 'No authorization token provided' }, { status: 401 });
      }

      const url = new URL(request.url);
      const filters = parsePostgrestFilters(url.searchParams);
      const selectParam = url.searchParams.get('select');
      const orderParam = url.searchParams.get('order');
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      // Collect all records from the map
      let records = Array.from(tableMap.values()).map((r) => ({ ...r }));

      // Apply PostgREST filters
      records = applyFilters(records, filters);

      // Apply RLS
      records = applyRlsFilter(store, tableName, records, userId);

      // Apply ordering
      records = applyOrdering(records, orderParam);

      // Apply offset
      if (offsetParam) {
        const offset = parseInt(offsetParam, 10);
        if (!isNaN(offset)) {
          records = records.slice(offset);
        }
      }

      // Apply limit
      if (limitParam) {
        const limit = parseInt(limitParam, 10);
        if (!isNaN(limit)) {
          records = records.slice(0, limit);
        }
      }

      // Apply select
      records = applySelect(records, selectParam);

      // Check for single-row request via Accept header
      const accept = request.headers.get('Accept') || '';
      if (accept.includes('vnd.pgrst.object+json')) {
        if (records.length === 0) {
          return HttpResponse.json(
            { message: 'JSON object requested, multiple (or no) rows returned', details: 'Results contain 0 rows' },
            { status: 406 },
          );
        }
        return HttpResponse.json(records[0]);
      }

      return HttpResponse.json(records);
    }),

    // -----------------------------------------------------------------------
    // POST — insert row(s)
    // -----------------------------------------------------------------------
    http.post(`${supabaseUrl}/rest/v1/:table`, async ({ request, params }) => {
      const tableName = params.table as string;
      const tableMap = getTableMap(store, tableName);
      if (!tableMap) {
        return HttpResponse.json(
          { message: `relation "public.${tableName}" does not exist`, code: '42P01' },
          { status: 404 },
        );
      }

      const userId = extractUserId(request);
      if (!userId) {
        return HttpResponse.json({ message: 'No authorization token provided' }, { status: 401 });
      }

      const body = await request.json();
      const rows: Record<string, any>[] = Array.isArray(body) ? body : [body];
      const now = new Date().toISOString();
      const inserted: Record<string, any>[] = [];

      for (const row of rows) {
        // Auto-generate id and timestamps when missing
        if (!row.id) {
          row.id = faker.string.uuid();
        }
        if (!row.created_at) {
          row.created_at = now;
        }
        if (!row.updated_at) {
          row.updated_at = now;
        }

        // For conversation_participants the store key is composite
        if (tableName === 'conversation_participants' && row.conversation_id && row.user_id) {
          tableMap.set(`${row.conversation_id}:${row.user_id}`, { ...row });
        } else {
          tableMap.set(row.id, { ...row });
        }
        inserted.push({ ...row });
      }

      const prefer = request.headers.get('Prefer') || '';
      const returnRepresentation = prefer.includes('return=representation');

      if (returnRepresentation) {
        const result = Array.isArray(body) ? inserted : inserted[0];
        return HttpResponse.json(result, { status: 201 });
      }

      return new HttpResponse(null, { status: 201 });
    }),

    // -----------------------------------------------------------------------
    // PATCH — update rows matching filters
    // -----------------------------------------------------------------------
    http.patch(`${supabaseUrl}/rest/v1/:table`, async ({ request, params }) => {
      const tableName = params.table as string;
      const tableMap = getTableMap(store, tableName);
      if (!tableMap) {
        return HttpResponse.json(
          { message: `relation "public.${tableName}" does not exist`, code: '42P01' },
          { status: 404 },
        );
      }

      const userId = extractUserId(request);
      if (!userId) {
        return HttpResponse.json({ message: 'No authorization token provided' }, { status: 401 });
      }

      const url = new URL(request.url);
      const filters = parsePostgrestFilters(url.searchParams);
      const updates = (await request.json()) as Record<string, any>;
      const now = new Date().toISOString();

      let records = Array.from(tableMap.values()).map((r) => ({ ...r }));
      records = applyFilters(records, filters);
      records = applyRlsFilter(store, tableName, records, userId);

      const updated: Record<string, any>[] = [];

      for (const record of records) {
        const merged = { ...record, ...updates, updated_at: now };

        // Re-insert using the correct key
        if (tableName === 'conversation_participants' && merged.conversation_id && merged.user_id) {
          tableMap.set(`${merged.conversation_id}:${merged.user_id}`, merged);
        } else {
          tableMap.set(merged.id, merged);
        }
        updated.push({ ...merged });
      }

      const prefer = request.headers.get('Prefer') || '';
      const returnRepresentation = prefer.includes('return=representation');

      if (returnRepresentation) {
        // Check for single-row request via Accept header
        const accept = request.headers.get('Accept') || '';
        if (accept.includes('vnd.pgrst.object+json') && updated.length > 0) {
          return HttpResponse.json(updated[0]);
        }
        return HttpResponse.json(updated);
      }

      return new HttpResponse(null, { status: 204 });
    }),

    // -----------------------------------------------------------------------
    // DELETE — delete rows matching filters
    // -----------------------------------------------------------------------
    http.delete(`${supabaseUrl}/rest/v1/:table`, ({ request, params }) => {
      const tableName = params.table as string;
      const tableMap = getTableMap(store, tableName);
      if (!tableMap) {
        return HttpResponse.json(
          { message: `relation "public.${tableName}" does not exist`, code: '42P01' },
          { status: 404 },
        );
      }

      const userId = extractUserId(request);
      if (!userId) {
        return HttpResponse.json({ message: 'No authorization token provided' }, { status: 401 });
      }

      const url = new URL(request.url);
      const filters = parsePostgrestFilters(url.searchParams);

      let records = Array.from(tableMap.values()).map((r) => ({ ...r }));
      records = applyFilters(records, filters);
      records = applyRlsFilter(store, tableName, records, userId);

      const deleted: Record<string, any>[] = [];

      for (const record of records) {
        if (tableName === 'conversation_participants' && record.conversation_id && record.user_id) {
          tableMap.delete(`${record.conversation_id}:${record.user_id}`);
        } else {
          tableMap.delete(record.id);
        }
        deleted.push(record);
      }

      const prefer = request.headers.get('Prefer') || '';
      const returnRepresentation = prefer.includes('return=representation');

      if (returnRepresentation) {
        return HttpResponse.json(deleted);
      }

      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
