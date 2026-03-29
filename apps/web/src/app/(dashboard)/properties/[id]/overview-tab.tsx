'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EditPropertyDialog } from './edit-property-dialog';
import { DeletePropertyDialog } from './delete-property-dialog';
import { MapPinIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import type { Database } from '@propnest/db';

type Property = Database['public']['Tables']['properties']['Row'];

export function OverviewTab({ property }: { property: Property }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <PencilIcon className="size-4" />
          Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon className="size-4" />
          Delete
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p>{property.address_line1}</p>
                {property.address_line2 && <p>{property.address_line2}</p>}
                <p>
                  {property.city}, {property.state} {property.zip}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {property.property_type && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{property.property_type}</dd>
                </div>
              )}
              {property.year_built && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Year Built</dt>
                  <dd>{property.year_built}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {property.notes && (
          <Card className="sm:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{property.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <EditPropertyDialog
        property={property}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeletePropertyDialog
        propertyId={property.id}
        propertyName={property.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
