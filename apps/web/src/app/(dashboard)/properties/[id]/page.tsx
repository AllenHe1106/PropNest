import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OverviewTab } from './overview-tab';
import { UnitsTab } from './units-tab';
import { LeasesTab } from './leases-tab';
import { ArrowLeftIcon } from 'lucide-react';

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // Fetch property
  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single();

  if (!property) {
    notFound();
  }

  // Fetch units for this property
  const { data: units } = await supabase
    .from('units')
    .select('id, unit_number, bedrooms, bathrooms, square_feet, rent_amount, is_available, notes')
    .eq('property_id', id)
    .order('unit_number');

  const unitList = units ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/properties">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{property.name}</h1>
          <p className="text-sm text-muted-foreground">
            {property.address_line1}, {property.city}, {property.state}{' '}
            {property.zip}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="leases">Leases</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab property={property} />
        </TabsContent>

        <TabsContent value="units">
          <UnitsTab propertyId={property.id} units={unitList} />
        </TabsContent>

        <TabsContent value="leases">
          <LeasesTab propertyId={property.id} units={unitList} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
