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
  DialogTrigger,
} from '@/components/ui/dialog';
import { PlusIcon } from 'lucide-react';

export function AddUnitDialog({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const { error: insertError } = await supabase.from('units').insert({
      property_id: propertyId,
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
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon className="size-4" />
        Add Unit
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Unit</DialogTitle>
          <DialogDescription>
            Add a new unit to this property.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="unit_number">Unit Number</Label>
            <Input
              id="unit_number"
              name="unit_number"
              placeholder="e.g. 101, A1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input
                id="bedrooms"
                name="bedrooms"
                type="number"
                step="0.5"
                min="0"
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                name="bathrooms"
                type="number"
                step="0.5"
                min="0"
                placeholder="e.g. 1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="square_feet">Square Feet</Label>
              <Input
                id="square_feet"
                name="square_feet"
                type="number"
                min="0"
                placeholder="e.g. 850"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rent_amount">Rent Amount</Label>
              <Input
                id="rent_amount"
                name="rent_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 1500.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Additional notes about this unit"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
