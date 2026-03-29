'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Ban, Trash2 } from 'lucide-react';
import { CreateLeaseDialog } from './create-lease-dialog';

interface Unit {
  id: string;
  unit_number: string | null;
  rent_amount: number | null;
}

interface LeaseTenant {
  id: string;
  accepted_at: string | null;
}

interface Lease {
  id: string;
  unit_id: string;
  status: 'draft' | 'active' | 'expired' | 'terminated';
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  lease_tenants: LeaseTenant[];
}

interface FlattenedLease extends Lease {
  unit_number: string | null;
}

const statusBadgeVariant: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  draft: 'secondary',
  expired: 'outline',
  terminated: 'destructive',
};

export function LeasesTab({
  propertyId,
  units,
}: {
  propertyId: string;
  units: Unit[];
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [leases, setLeases] = useState<FlattenedLease[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchLeases() {
      const unitIds = units.map((u) => u.id);
      if (unitIds.length === 0) {
        setLeases([]);
        setLoaded(true);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('leases')
        .select('id, unit_id, status, start_date, end_date, rent_amount')
        .in('unit_id', unitIds)
        .order('start_date', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setLoaded(true);
        return;
      }

      const leaseIds = (data ?? []).map((l) => l.id);

      // Fetch lease_tenants separately since relationship isn't in generated types
      let tenantsByLease: Record<string, LeaseTenant[]> = {};
      if (leaseIds.length > 0) {
        const { data: tenants } = await supabase
          .from('lease_tenants')
          .select('id, lease_id, accepted_at')
          .in('lease_id', leaseIds);

        for (const t of tenants ?? []) {
          if (!tenantsByLease[t.lease_id]) {
            tenantsByLease[t.lease_id] = [];
          }
          tenantsByLease[t.lease_id].push({
            id: t.id,
            accepted_at: t.accepted_at,
          });
        }
      }

      const unitMap = new Map(units.map((u) => [u.id, u]));
      const flattened: FlattenedLease[] = (data ?? []).map((lease) => ({
        ...lease,
        status: lease.status as Lease['status'],
        lease_tenants: tenantsByLease[lease.id] ?? [],
        unit_number: unitMap.get(lease.unit_id)?.unit_number ?? null,
      }));

      setLeases(flattened);
      setLoaded(true);
    }

    fetchLeases();
  }, [units, supabase]);

  const activeLeaseUnitIds = new Set(
    leases.filter((l) => l.status === 'active').map((l) => l.unit_id)
  );

  async function handleTerminate(leaseId: string) {
    setError(null);
    const { error: updateError } = await supabase
      .from('leases')
      .update({ status: 'terminated' as const })
      .eq('id', leaseId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.refresh();
    // Also update local state
    setLeases((prev) =>
      prev.map((l) =>
        l.id === leaseId ? { ...l, status: 'terminated' as const } : l
      )
    );
  }

  async function handleDelete(leaseId: string) {
    setError(null);
    const { error: deleteError } = await supabase
      .from('leases')
      .delete()
      .eq('id', leaseId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.refresh();
    setLeases((prev) => prev.filter((l) => l.id !== leaseId));
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Leases</h2>
        </div>
        <p className="text-muted-foreground">Loading leases...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Leases</h2>
        <CreateLeaseDialog
          propertyId={propertyId}
          units={units}
          activeLeaseUnitIds={activeLeaseUnitIds}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {leases.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No leases yet. Create your first lease to get started.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Tenants</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leases.map((lease) => {
              const tenantCount = lease.lease_tenants.length;
              const pendingCount = lease.lease_tenants.filter(
                (t) => !t.accepted_at
              ).length;

              return (
                <TableRow key={lease.id}>
                  <TableCell className="font-medium">
                    {lease.unit_number ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[lease.status] ?? 'outline'}>
                      {lease.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(lease.rent_amount)}/mo</TableCell>
                  <TableCell>{formatDate(lease.start_date)}</TableCell>
                  <TableCell>
                    {lease.end_date
                      ? formatDate(lease.end_date)
                      : 'Month-to-month'}
                  </TableCell>
                  <TableCell>
                    {tenantCount}
                    {pendingCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({pendingCount} pending)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Actions</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {lease.status === 'active' && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleTerminate(lease.id)}
                          >
                            <Ban />
                            Terminate
                          </DropdownMenuItem>
                        )}
                        {lease.status === 'draft' && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(lease.id)}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
