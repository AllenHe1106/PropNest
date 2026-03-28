'use client';

import { useState } from 'react';
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
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { AddUnitDialog } from './add-unit-dialog';
import { EditUnitDialog } from './edit-unit-dialog';

interface Unit {
  id: string;
  unit_number: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  rent_amount: number | null;
  is_available: boolean;
  notes: string | null;
}

export function UnitsTab({
  propertyId,
  units,
}: {
  propertyId: string;
  units: Unit[];
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  async function handleDelete(unitId: string) {
    setError(null);

    const { error: deleteError } = await supabase
      .from('units')
      .delete()
      .eq('id', unitId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.refresh();
  }

  function formatCurrency(amount: number | null) {
    if (amount == null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  function formatBedBath(bedrooms: number | null, bathrooms: number | null) {
    const bed = bedrooms != null ? `${bedrooms} bd` : '—';
    const bath = bathrooms != null ? `${bathrooms} ba` : '—';
    return `${bed} / ${bath}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Units</h2>
        <AddUnitDialog propertyId={propertyId} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {units.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No units yet. Add your first unit to get started.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit Number</TableHead>
              <TableHead>Bed / Bath</TableHead>
              <TableHead>Sq Ft</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-medium">
                  {unit.unit_number ?? '—'}
                </TableCell>
                <TableCell>
                  {formatBedBath(unit.bedrooms, unit.bathrooms)}
                </TableCell>
                <TableCell>
                  {unit.square_feet != null
                    ? unit.square_feet.toLocaleString()
                    : '—'}
                </TableCell>
                <TableCell>{formatCurrency(unit.rent_amount)}</TableCell>
                <TableCell>
                  {unit.is_available ? (
                    <Badge variant="secondary">Available</Badge>
                  ) : (
                    <Badge variant="default">Occupied</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" />
                      }
                    >
                      <MoreHorizontalIcon className="size-4" />
                      <span className="sr-only">Actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditingUnit(unit)}
                      >
                        <PencilIcon />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleDelete(unit.id)}
                      >
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editingUnit && (
        <EditUnitDialog
          unit={editingUnit}
          open={!!editingUnit}
          onOpenChange={(open) => {
            if (!open) setEditingUnit(null);
          }}
        />
      )}
    </div>
  );
}
