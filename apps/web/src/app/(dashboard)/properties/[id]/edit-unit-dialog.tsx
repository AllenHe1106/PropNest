'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Unit {
  id: string;
  unit_number: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  rent_amount: number | null;
  notes: string | null;
}

export function EditUnitDialog({
  unit,
  open,
  onOpenChange,
}: {
  unit: Unit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const { error: updateError } = await supabase
      .from('units')
      .update({
        unit_number: (formData.get('unit_number') as string) || null,
        bedrooms: formData.get('bedrooms')
          ? Number(formData.get('bedrooms'))
          : null,
        bathrooms: formData.get('bathrooms')
          ? Number(formData.get('bathrooms'))
          : null,
        square_feet: formData.get('square_feet')
          ? Number(formData.get('square_feet'))
          : null,
        rent_amount: formData.get('rent_amount')
          ? Number(formData.get('rent_amount'))
          : null,
        notes: (formData.get('notes') as string) || null,
      })
      .eq('id', unit.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Unit</DialogTitle>
          <DialogDescription>
            Update the details for this unit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit_unit_number">Unit Number</Label>
            <Input
              id="edit_unit_number"
              name="unit_number"
              defaultValue={unit.unit_number ?? ''}
              placeholder="e.g. 101, A1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_bedrooms">Bedrooms</Label>
              <Input
                id="edit_bedrooms"
                name="bedrooms"
                type="number"
                step="0.5"
                min="0"
                defaultValue={unit.bedrooms ?? ''}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_bathrooms">Bathrooms</Label>
              <Input
                id="edit_bathrooms"
                name="bathrooms"
                type="number"
                step="0.5"
                min="0"
                defaultValue={unit.bathrooms ?? ''}
                placeholder="e.g. 1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_square_feet">Square Feet</Label>
              <Input
                id="edit_square_feet"
                name="square_feet"
                type="number"
                min="0"
                defaultValue={unit.square_feet ?? ''}
                placeholder="e.g. 850"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_rent_amount">Rent Amount</Label>
              <Input
                id="edit_rent_amount"
                name="rent_amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={unit.rent_amount ?? ''}
                placeholder="e.g. 1500.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_notes">Notes</Label>
            <Textarea
              id="edit_notes"
              name="notes"
              defaultValue={unit.notes ?? ''}
              placeholder="Additional notes about this unit"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
