import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AddPropertyDialog } from './add-property-dialog';
import { Building2Icon, HomeIcon } from 'lucide-react';

export default async function PropertiesPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch org membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user!.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single();

  if (!membership) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Building2Icon className="size-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Not a member of any organization</h2>
        <p className="text-muted-foreground">
          You need to be part of an organization to view properties.
        </p>
      </div>
    );
  }

  const organizationId = membership.organization_id;

  // Fetch properties
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address_line1, city, state, zip, property_type')
    .eq('organization_id', organizationId)
    .order('name');

  const propertyList = properties ?? [];

  // Fetch unit counts per property
  const propertyIds = propertyList.map((p) => p.id);
  let unitCountMap: Record<string, number> = {};
  let leaseCountMap: Record<string, number> = {};

  if (propertyIds.length > 0) {
    const { data: units } = await supabase
      .from('units')
      .select('id, property_id')
      .in('property_id', propertyIds);

    if (units) {
      for (const unit of units) {
        unitCountMap[unit.property_id] = (unitCountMap[unit.property_id] ?? 0) + 1;
      }

      const unitIds = units.map((u) => u.id);
      if (unitIds.length > 0) {
        const { data: leases } = await supabase
          .from('leases')
          .select('id, unit_id')
          .in('unit_id', unitIds);

        if (leases) {
          // Map unit_id -> property_id
          const unitPropertyMap: Record<string, string> = {};
          for (const unit of units) {
            unitPropertyMap[unit.id] = unit.property_id;
          }
          for (const lease of leases) {
            const propId = unitPropertyMap[lease.unit_id];
            if (propId) {
              leaseCountMap[propId] = (leaseCountMap[propId] ?? 0) + 1;
            }
          }
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">
            Manage properties in your portfolio.
          </p>
        </div>
        <AddPropertyDialog organizationId={organizationId} />
      </div>

      {propertyList.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-20">
          <HomeIcon className="size-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No properties yet</h2>
          <p className="text-muted-foreground">
            Add your first property to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {propertyList.map((property) => {
            const unitCount = unitCountMap[property.id] ?? 0;
            const leaseCount = leaseCountMap[property.id] ?? 0;

            return (
              <Link key={property.id} href={`/properties/${property.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-start justify-between gap-2 text-base">
                      <span className="line-clamp-1">{property.name}</span>
                      {property.property_type && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {property.property_type}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {property.address_line1}, {property.city}, {property.state} {property.zip}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{unitCount} {unitCount === 1 ? 'unit' : 'units'}</Badge>
                      <Badge variant="outline">{leaseCount} {leaseCount === 1 ? 'lease' : 'leases'}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
