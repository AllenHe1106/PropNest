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
import type { Database } from '@propnest/db';

type Property = Database['public']['Tables']['properties']['Row'];

export function EditPropertyDialog({
  property,
  open,
  onOpenChange,
}: {
  property: Property;
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

    const yearBuiltRaw = formData.get('year_built') as string;
    const yearBuilt = yearBuiltRaw ? parseInt(yearBuiltRaw, 10) : null;

    const { error: updateError } = await supabase
      .from('properties')
      .update({
        name: formData.get('name') as string,
        address_line1: formData.get('address_line1') as string,
        address_line2: (formData.get('address_line2') as string) || null,
        city: formData.get('city') as string,
        state: formData.get('state') as string,
        zip: formData.get('zip') as string,
        property_type: (formData.get('property_type') as string) || null,
        year_built: yearBuilt,
        notes: (formData.get('notes') as string) || null,
      })
      .eq('id', property.id);

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
          <DialogTitle>Edit Property</DialogTitle>
          <DialogDescription>
            Update the details for this property.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-name">Property Name</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={property.name}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address_line1">Address Line 1</Label>
            <Input
              id="edit-address_line1"
              name="address_line1"
              defaultValue={property.address_line1}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address_line2">Address Line 2</Label>
            <Input
              id="edit-address_line2"
              name="address_line2"
              defaultValue={property.address_line2 ?? ''}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="edit-city">City</Label>
              <Input
                id="edit-city"
                name="city"
                defaultValue={property.city}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-state">State</Label>
              <Input
                id="edit-state"
                name="state"
                defaultValue={property.state}
                maxLength={2}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-zip">ZIP Code</Label>
              <Input
                id="edit-zip"
                name="zip"
                defaultValue={property.zip}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-property_type">Property Type</Label>
              <Input
                id="edit-property_type"
                name="property_type"
                defaultValue={property.property_type ?? ''}
                placeholder="e.g. Residential, Commercial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-year_built">Year Built</Label>
              <Input
                id="edit-year_built"
                name="year_built"
                type="number"
                defaultValue={property.year_built ?? ''}
                placeholder="e.g. 1995"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              name="notes"
              defaultValue={property.notes ?? ''}
              placeholder="Additional notes about this property"
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
