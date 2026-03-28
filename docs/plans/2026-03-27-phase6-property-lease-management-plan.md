# Phase 6: Property & Lease Management UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build landlord-side UI for managing properties, units, and leases with modal-based CRUD and tenant invite integration.

**Architecture:** Server components for data fetching (RLS handles auth), client components for mutations via `createBrowserClient()`. Property-centric navigation with tabbed detail view. No new Edge Functions — direct Supabase queries for CRUD, existing `invite-tenant` function for tenant invites.

**Tech Stack:** Next.js 16, React 19, Supabase SSR, shadcn/ui (base-nova style), Zod validators from `@propnest/validators`, Lucide icons, Tailwind CSS.

**IMPORTANT — Next.js 16 breaking changes:** Read `node_modules/next/dist/docs/` before modifying middleware/proxy. The file is `proxy.ts` with `export function proxy()`, NOT `middleware.ts`.

---

### Task 1: Install shadcn/ui Components

We need table, dialog, select, tabs, textarea, and dropdown-menu components that don't exist yet.

**Files:**
- Create: `apps/web/src/components/ui/table.tsx`
- Create: `apps/web/src/components/ui/dialog.tsx`
- Create: `apps/web/src/components/ui/select.tsx`
- Create: `apps/web/src/components/ui/tabs.tsx`
- Create: `apps/web/src/components/ui/textarea.tsx`
- Create: `apps/web/src/components/ui/dropdown-menu.tsx`

**Step 1: Install all 6 components**

```bash
cd apps/web
npx shadcn@latest add table dialog select tabs textarea dropdown-menu
```

When prompted, accept defaults. This reads `components.json` (style: base-nova) and generates the files.

**Step 2: Verify all files were created**

```bash
ls apps/web/src/components/ui/{table,dialog,select,tabs,textarea,dropdown-menu}.tsx
```

Expected: All 6 files listed.

**Step 3: Typecheck**

```bash
pnpm turbo typecheck
```

Expected: All packages pass.

**Step 4: Commit**

```bash
git add apps/web/src/components/ui/ apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add shadcn/ui table, dialog, select, tabs, textarea, dropdown-menu"
```

---

### Task 2: Add Properties Link to Sidebar

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`

**Step 1: Add the Building2 icon import and Properties nav item**

In `apps/web/src/components/sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Building2 } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/properties', label: 'Properties', icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 border-r bg-muted/30 md:block">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-semibold">
          PropNest
        </Link>
      </div>
      <nav className="space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

Note: The `isActive` check now also matches sub-routes (`/properties/[id]`). The Dashboard item still only matches exact `/` because `'/' + '/'` won't match sub-routes — but we need to special-case it. Update the isActive logic:

```tsx
const isActive = item.href === '/'
  ? pathname === '/'
  : pathname === item.href || pathname.startsWith(item.href + '/');
```

**Step 2: Verify build**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add apps/web/src/components/sidebar.tsx
git commit -m "feat: add Properties link to sidebar navigation"
```

---

### Task 3: Properties List Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/properties/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/property-card.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/add-property-dialog.tsx`

**Context:**
- `createServerClient` is imported from `@/lib/supabase/server` (async function, returns typed Supabase client)
- `getSupabaseBrowserClient` is imported from `@/lib/supabase/client` (singleton browser client)
- The dashboard layout already verifies auth and redirects to `/login` if not authenticated
- The layout fetches `organization_members` with role — but does NOT pass org_id to children. The properties page must fetch the user's org_id itself.
- RLS on `properties` table: org members (owner|manager) can SELECT properties in their org. So a simple `.select()` returns only the user's org's properties.
- Zod validators: `CreatePropertySchema` from `@propnest/validators` requires `organization_id`, `name`, `address_line1`, `city`, `state`, `zip`. Optional: `address_line2`, `country`, `property_type`, `year_built`, `notes`.

**Step 1: Create the properties list page (server component)**

Create `apps/web/src/app/(dashboard)/properties/page.tsx`:

```tsx
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin } from 'lucide-react';
import { AddPropertyDialog } from './add-property-dialog';

export default async function PropertiesPage() {
  const supabase = await createServerClient();

  // Get user's org
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user!.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single();

  if (!membership) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Properties</h1>
        <p className="text-muted-foreground">You are not a member of any organization.</p>
      </div>
    );
  }

  // Fetch properties with unit and active lease counts
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address_line1, city, state, zip, property_type, units(id, leases(id))')
    .eq('organization_id', membership.organization_id)
    .order('name');

  // Compute counts
  const propertiesWithCounts = (properties ?? []).map((p: any) => ({
    ...p,
    unitCount: p.units?.length ?? 0,
    activeLeaseCount: p.units?.reduce(
      (sum: number, u: any) => sum + (u.leases?.length ?? 0),
      0,
    ) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Properties</h1>
        <AddPropertyDialog organizationId={membership.organization_id} />
      </div>

      {propertiesWithCounts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No properties yet. Add your first property to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {propertiesWithCounts.map((property: any) => (
            <Link key={property.id} href={`/properties/${property.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {property.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {property.address_line1}, {property.city}, {property.state} {property.zip}
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{property.unitCount} unit{property.unitCount !== 1 ? 's' : ''}</Badge>
                    <Badge variant="secondary">{property.activeLeaseCount} active lease{property.activeLeaseCount !== 1 ? 's' : ''}</Badge>
                  </div>
                  {property.property_type && (
                    <p className="text-xs text-muted-foreground capitalize">{property.property_type}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: The nested select `units(id, leases(id))` works because RLS allows org members to read both. The leases sub-query returns all leases for the unit (not filtered by status). To only count active leases, we'd need to filter — but the Supabase `.select()` nested filter syntax is `leases!inner(id)` with `.eq()` which doesn't work for counts. For now, show total lease count. This can be refined later.

**Step 2: Create the AddPropertyDialog client component**

Create `apps/web/src/app/(dashboard)/properties/add-property-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus } from 'lucide-react';

interface AddPropertyDialogProps {
  organizationId: string;
}

export function AddPropertyDialog({ organizationId }: AddPropertyDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const { error: insertError } = await supabase.from('properties').insert({
      organization_id: organizationId,
      name: form.get('name') as string,
      address_line1: form.get('address_line1') as string,
      address_line2: (form.get('address_line2') as string) || null,
      city: form.get('city') as string,
      state: form.get('state') as string,
      zip: form.get('zip') as string,
      property_type: (form.get('property_type') as string) || null,
      notes: (form.get('notes') as string) || null,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Property
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Property</DialogTitle>
          <DialogDescription>Enter the property details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Property Name</Label>
            <Input id="name" name="name" placeholder="e.g. Sunset Apartments" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_line1">Address</Label>
            <Input id="address_line1" name="address_line1" placeholder="123 Main St" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_line2">Address Line 2</Label>
            <Input id="address_line2" name="address_line2" placeholder="Suite 100" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" maxLength={2} placeholder="CA" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP</Label>
              <Input id="zip" name="zip" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="property_type">Property Type</Label>
            <Input id="property_type" name="property_type" placeholder="e.g. apartment, single-family" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Add Property'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Verify build**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/properties/
git commit -m "feat: add properties list page with add property dialog"
```

---

### Task 4: Property Detail Page with Tabs

**Files:**
- Create: `apps/web/src/app/(dashboard)/properties/[id]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/overview-tab.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/edit-property-dialog.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/delete-property-dialog.tsx`

**Context:**
- Route param is `id` (property UUID). Access via `params.id` in Next.js 16 (note: `params` is a Promise in Next.js 16 — must `await params`).
- Property detail fetches the property with all its units and leases via a nested select.
- Tabs: Overview, Units, Leases. Units and Leases tabs are separate tasks.

**Step 1: Create the property detail page (server component)**

Create `apps/web/src/app/(dashboard)/properties/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from './overview-tab';
import { UnitsTab } from './units-tab';
import { LeasesTab } from './leases-tab';

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: property } = await supabase
    .from('properties')
    .select(`
      *,
      units(
        id, unit_number, bedrooms, bathrooms, square_feet, rent_amount, is_available, notes,
        leases(id, status, start_date, end_date, rent_amount, rent_due_day, grace_period_days, late_fee_type, late_fee_amount, notes,
          lease_tenants(id, user_id, is_primary, accepted_at)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!property) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{property.name}</h1>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="units">Units ({property.units?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="leases">Leases</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab property={property} />
        </TabsContent>
        <TabsContent value="units" className="mt-4">
          <UnitsTab propertyId={property.id} units={property.units ?? []} />
        </TabsContent>
        <TabsContent value="leases" className="mt-4">
          <LeasesTab propertyId={property.id} units={property.units ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Step 2: Create the OverviewTab (client component for edit/delete)**

Create `apps/web/src/app/(dashboard)/properties/[id]/overview-tab.tsx`:

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { EditPropertyDialog } from './edit-property-dialog';
import { DeletePropertyDialog } from './delete-property-dialog';

interface OverviewTabProps {
  property: {
    id: string;
    name: string;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
    property_type?: string | null;
    year_built?: number | null;
    notes?: string | null;
    organization_id: string;
  };
}

export function OverviewTab({ property }: OverviewTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Property Details</CardTitle>
        <div className="flex gap-2">
          <EditPropertyDialog property={property} />
          <DeletePropertyDialog propertyId={property.id} propertyName={property.name} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p>{property.address_line1}</p>
            {property.address_line2 && <p>{property.address_line2}</p>}
            <p>{property.city}, {property.state} {property.zip}</p>
          </div>
        </div>
        {property.property_type && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Type</p>
            <p className="capitalize">{property.property_type}</p>
          </div>
        )}
        {property.year_built && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Year Built</p>
            <p>{property.year_built}</p>
          </div>
        )}
        {property.notes && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap">{property.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create the EditPropertyDialog**

Create `apps/web/src/app/(dashboard)/properties/[id]/edit-property-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Pencil } from 'lucide-react';

interface EditPropertyDialogProps {
  property: {
    id: string;
    name: string;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    zip: string;
    property_type?: string | null;
    year_built?: number | null;
    notes?: string | null;
  };
}

export function EditPropertyDialog({ property }: EditPropertyDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const yearBuilt = form.get('year_built') as string;

    const { error: updateError } = await supabase
      .from('properties')
      .update({
        name: form.get('name') as string,
        address_line1: form.get('address_line1') as string,
        address_line2: (form.get('address_line2') as string) || null,
        city: form.get('city') as string,
        state: form.get('state') as string,
        zip: form.get('zip') as string,
        property_type: (form.get('property_type') as string) || null,
        year_built: yearBuilt ? parseInt(yearBuilt, 10) : null,
        notes: (form.get('notes') as string) || null,
      })
      .eq('id', property.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-2 h-3 w-3" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Property</DialogTitle>
          <DialogDescription>Update the property details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Property Name</Label>
            <Input id="edit-name" name="name" defaultValue={property.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-address">Address</Label>
            <Input id="edit-address" name="address_line1" defaultValue={property.address_line1} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-address2">Address Line 2</Label>
            <Input id="edit-address2" name="address_line2" defaultValue={property.address_line2 ?? ''} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-city">City</Label>
              <Input id="edit-city" name="city" defaultValue={property.city} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-state">State</Label>
              <Input id="edit-state" name="state" defaultValue={property.state} maxLength={2} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-zip">ZIP</Label>
              <Input id="edit-zip" name="zip" defaultValue={property.zip} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-type">Property Type</Label>
              <Input id="edit-type" name="property_type" defaultValue={property.property_type ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-year">Year Built</Label>
              <Input id="edit-year" name="year_built" type="number" defaultValue={property.year_built ?? ''} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea id="edit-notes" name="notes" rows={2} defaultValue={property.notes ?? ''} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 4: Create the DeletePropertyDialog**

Create `apps/web/src/app/(dashboard)/properties/[id]/delete-property-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2 } from 'lucide-react';

interface DeletePropertyDialogProps {
  propertyId: string;
  propertyName: string;
}

export function DeletePropertyDialog({ propertyId, propertyName }: DeletePropertyDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setLoading(true);

    const { error: deleteError } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyId);

    setLoading(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push('/properties');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="mr-2 h-3 w-3" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Property</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{propertyName}</strong>? This will also delete all units within this property. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete Property'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 5: Verify build**

```bash
cd apps/web && pnpm build
```

Note: Build will fail because `UnitsTab` and `LeasesTab` are imported but don't exist yet. Create stub files first:

Create `apps/web/src/app/(dashboard)/properties/[id]/units-tab.tsx`:

```tsx
'use client';

export function UnitsTab({ propertyId, units }: { propertyId: string; units: any[] }) {
  return <p className="text-muted-foreground">Units tab — coming next.</p>;
}
```

Create `apps/web/src/app/(dashboard)/properties/[id]/leases-tab.tsx`:

```tsx
'use client';

export function LeasesTab({ propertyId, units }: { propertyId: string; units: any[] }) {
  return <p className="text-muted-foreground">Leases tab — coming next.</p>;
}
```

Then build:

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/properties/\[id\]/
git commit -m "feat: add property detail page with overview, edit, and delete"
```

---

### Task 5: Units Tab — List, Add, Edit, Delete

**Files:**
- Modify: `apps/web/src/app/(dashboard)/properties/[id]/units-tab.tsx` (replace stub)
- Create: `apps/web/src/app/(dashboard)/properties/[id]/add-unit-dialog.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/edit-unit-dialog.tsx`

**Context:**
- Units table has: `unit_number`, `bedrooms`, `bathrooms`, `square_feet`, `rent_amount`, `is_available`, `notes`
- Units are displayed in a table with row action dropdowns (edit, delete)
- Delete is inline (no separate dialog — use a confirm in the dropdown or a small dialog)
- Unit delete will fail with a DB error if the unit has leases (ON DELETE RESTRICT). Show the error message.

**Step 1: Create AddUnitDialog**

Create `apps/web/src/app/(dashboard)/properties/[id]/add-unit-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus } from 'lucide-react';

interface AddUnitDialogProps {
  propertyId: string;
}

export function AddUnitDialog({ propertyId }: AddUnitDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const bedrooms = form.get('bedrooms') as string;
    const bathrooms = form.get('bathrooms') as string;
    const sqft = form.get('square_feet') as string;
    const rent = form.get('rent_amount') as string;

    const { error: insertError } = await supabase.from('units').insert({
      property_id: propertyId,
      unit_number: (form.get('unit_number') as string) || null,
      bedrooms: bedrooms ? parseFloat(bedrooms) : null,
      bathrooms: bathrooms ? parseFloat(bathrooms) : null,
      square_feet: sqft ? parseInt(sqft, 10) : null,
      rent_amount: rent ? parseFloat(rent) : null,
      is_available: true,
      notes: (form.get('notes') as string) || null,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Unit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Unit</DialogTitle>
          <DialogDescription>Add a new unit to this property.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="unit_number">Unit Number</Label>
            <Input id="unit_number" name="unit_number" placeholder="e.g. 101, A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input id="bedrooms" name="bedrooms" type="number" step="0.5" min="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input id="bathrooms" name="bathrooms" type="number" step="0.5" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="square_feet">Sq Ft</Label>
              <Input id="square_feet" name="square_feet" type="number" min="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rent_amount">Asking Rent ($)</Label>
              <Input id="rent_amount" name="rent_amount" type="number" step="0.01" min="0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-notes">Notes</Label>
            <Textarea id="unit-notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Add Unit'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Create EditUnitDialog**

Create `apps/web/src/app/(dashboard)/properties/[id]/edit-unit-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EditUnitDialogProps {
  unit: {
    id: string;
    unit_number?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    square_feet?: number | null;
    rent_amount?: number | null;
    notes?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUnitDialog({ unit, open, onOpenChange }: EditUnitDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const bedrooms = form.get('bedrooms') as string;
    const bathrooms = form.get('bathrooms') as string;
    const sqft = form.get('square_feet') as string;
    const rent = form.get('rent_amount') as string;

    const { error: updateError } = await supabase
      .from('units')
      .update({
        unit_number: (form.get('unit_number') as string) || null,
        bedrooms: bedrooms ? parseFloat(bedrooms) : null,
        bathrooms: bathrooms ? parseFloat(bathrooms) : null,
        square_feet: sqft ? parseInt(sqft, 10) : null,
        rent_amount: rent ? parseFloat(rent) : null,
        notes: (form.get('notes') as string) || null,
      })
      .eq('id', unit.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Unit {unit.unit_number ?? ''}</DialogTitle>
          <DialogDescription>Update unit details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="eu-unit_number">Unit Number</Label>
            <Input id="eu-unit_number" name="unit_number" defaultValue={unit.unit_number ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="eu-bedrooms">Bedrooms</Label>
              <Input id="eu-bedrooms" name="bedrooms" type="number" step="0.5" min="0" defaultValue={unit.bedrooms ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eu-bathrooms">Bathrooms</Label>
              <Input id="eu-bathrooms" name="bathrooms" type="number" step="0.5" min="0" defaultValue={unit.bathrooms ?? ''} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="eu-sqft">Sq Ft</Label>
              <Input id="eu-sqft" name="square_feet" type="number" min="0" defaultValue={unit.square_feet ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eu-rent">Asking Rent ($)</Label>
              <Input id="eu-rent" name="rent_amount" type="number" step="0.01" min="0" defaultValue={unit.rent_amount ?? ''} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eu-notes">Notes</Label>
            <Textarea id="eu-notes" name="notes" rows={2} defaultValue={unit.notes ?? ''} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Replace the UnitsTab stub**

Replace `apps/web/src/app/(dashboard)/properties/[id]/units-tab.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { AddUnitDialog } from './add-unit-dialog';
import { EditUnitDialog } from './edit-unit-dialog';

interface Unit {
  id: string;
  unit_number?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;
  rent_amount?: number | null;
  is_available?: boolean;
  notes?: string | null;
  leases?: { id: string; status: string }[];
}

interface UnitsTabProps {
  propertyId: string;
  units: Unit[];
}

export function UnitsTab({ propertyId, units }: UnitsTabProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddUnitDialog propertyId={propertyId} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {units.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No units yet. Add your first unit.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Bed / Bath</TableHead>
              <TableHead>Sq Ft</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => {
              const hasActiveLease = unit.leases?.some((l) => l.status === 'active');
              return (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">{unit.unit_number ?? '—'}</TableCell>
                  <TableCell>
                    {unit.bedrooms ?? '—'} / {unit.bathrooms ?? '—'}
                  </TableCell>
                  <TableCell>{unit.square_feet?.toLocaleString() ?? '—'}</TableCell>
                  <TableCell>{unit.rent_amount ? `$${unit.rent_amount.toLocaleString()}` : '—'}</TableCell>
                  <TableCell>
                    {hasActiveLease ? (
                      <Badge>Occupied</Badge>
                    ) : (
                      <Badge variant="secondary">Available</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingUnit(unit)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(unit.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editingUnit && (
        <EditUnitDialog
          unit={editingUnit}
          open={!!editingUnit}
          onOpenChange={(open) => { if (!open) setEditingUnit(null); }}
        />
      )}
    </div>
  );
}
```

**Step 4: Verify build**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/properties/\[id\]/
git commit -m "feat: add units tab with CRUD (add, edit, delete via table + modals)"
```

---

### Task 6: Leases Tab — List, Create with Tenant Invite, Terminate

**Files:**
- Modify: `apps/web/src/app/(dashboard)/properties/[id]/leases-tab.tsx` (replace stub)
- Create: `apps/web/src/app/(dashboard)/properties/[id]/create-lease-dialog.tsx`

**Context:**
- Lease creation modal has 3 sections: unit + rent terms, late fee config, tenant email(s)
- Saves lease as `draft`, then calls `invite-tenant` Edge Function for each tenant email
- The `invite-tenant` Edge Function URL: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-tenant`
- It requires a Bearer token (user's access token) and body: `{ lease_id, email, is_primary }`
- Lease list shows unit, status, rent, dates, and tenant info
- Row actions: Terminate (for active leases), Delete (for draft leases)

**Step 1: Create the CreateLeaseDialog**

Create `apps/web/src/app/(dashboard)/properties/[id]/create-lease-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, X } from 'lucide-react';

interface Unit {
  id: string;
  unit_number?: string | null;
  rent_amount?: number | null;
  leases?: { id: string; status: string }[];
}

interface CreateLeaseDialogProps {
  units: Unit[];
}

export function CreateLeaseDialog({ units }: CreateLeaseDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitId, setUnitId] = useState('');
  const [lateFeeType, setLateFeeType] = useState('flat');
  const [tenantEmails, setTenantEmails] = useState<string[]>(['']);

  // Only show units without active leases
  const availableUnits = units.filter(
    (u) => !u.leases?.some((l) => l.status === 'active'),
  );

  function addTenantField() {
    setTenantEmails([...tenantEmails, '']);
  }

  function removeTenantField(index: number) {
    setTenantEmails(tenantEmails.filter((_, i) => i !== index));
  }

  function updateTenantEmail(index: number, value: string) {
    const updated = [...tenantEmails];
    updated[index] = value;
    setTenantEmails(updated);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const lateFeeAmount = form.get('late_fee_amount') as string;
    const securityDeposit = form.get('security_deposit') as string;

    // 1. Create the lease
    const { data: lease, error: leaseError } = await supabase
      .from('leases')
      .insert({
        unit_id: unitId,
        status: 'draft',
        start_date: form.get('start_date') as string,
        end_date: (form.get('end_date') as string) || null,
        rent_amount: parseFloat(form.get('rent_amount') as string),
        security_deposit: securityDeposit ? parseFloat(securityDeposit) : null,
        rent_due_day: parseInt(form.get('rent_due_day') as string, 10),
        grace_period_days: parseInt(form.get('grace_period_days') as string, 10),
        late_fee_type: lateFeeType as 'flat' | 'percentage',
        late_fee_amount: lateFeeAmount ? parseFloat(lateFeeAmount) : null,
        notes: (form.get('notes') as string) || null,
      })
      .select('id')
      .single();

    if (leaseError) {
      setError(leaseError.message);
      setLoading(false);
      return;
    }

    // 2. Invite tenants via Edge Function
    const validEmails = tenantEmails.filter((e) => e.trim());
    const { data: { session } } = await supabase.auth.getSession();

    for (let i = 0; i < validEmails.length; i++) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-tenant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            lease_id: lease!.id,
            email: validEmails[i].trim(),
            is_primary: i === 0,
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to invite tenant' }));
        setError(`Lease created but tenant invite failed for ${validEmails[i]}: ${errData.error}`);
        setLoading(false);
        router.refresh();
        return;
      }
    }

    setLoading(false);
    setOpen(false);
    setUnitId('');
    setTenantEmails(['']);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setUnitId(''); setTenantEmails(['']); } }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Lease
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Lease</DialogTitle>
          <DialogDescription>Set up a new lease and invite tenants.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Section 1: Unit & Rent Terms */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Unit & Rent</h3>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unitId} onValueChange={setUnitId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unit_number ?? 'Unit'}{u.rent_amount ? ` — $${u.rent_amount}/mo` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableUnits.length === 0 && (
                <p className="text-xs text-muted-foreground">No available units. All units have active leases.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rent_amount">Monthly Rent ($)</Label>
                <Input id="rent_amount" name="rent_amount" type="number" step="0.01" min="0.01" required
                  defaultValue={availableUnits.find((u) => u.id === unitId)?.rent_amount ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="security_deposit">Security Deposit ($)</Label>
                <Input id="security_deposit" name="security_deposit" type="number" step="0.01" min="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input id="start_date" name="start_date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input id="end_date" name="end_date" type="date" />
              </div>
            </div>
          </div>

          {/* Section 2: Late Fee Config */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Late Fee Settings</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rent_due_day">Due Day (1-28)</Label>
                <Input id="rent_due_day" name="rent_due_day" type="number" min="1" max="28" defaultValue="1" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grace_period_days">Grace Days</Label>
                <Input id="grace_period_days" name="grace_period_days" type="number" min="0" max="30" defaultValue="5" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="late_fee_amount">Late Fee</Label>
                <Input id="late_fee_amount" name="late_fee_amount" type="number" step="0.01" min="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Late Fee Type</Label>
              <Select value={lateFeeType} onValueChange={setLateFeeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat ($)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Section 3: Tenants */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Tenants</h3>
            {tenantEmails.map((email, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    type="email"
                    placeholder="tenant@example.com"
                    value={email}
                    onChange={(e) => updateTenantEmail(i, e.target.value)}
                  />
                  {i === 0 && <p className="text-xs text-muted-foreground">Primary tenant</p>}
                </div>
                {tenantEmails.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeTenantField(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addTenantField}>
              <Plus className="mr-2 h-3 w-3" />
              Add Another Tenant
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lease-notes">Notes</Label>
            <Textarea id="lease-notes" name="notes" rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !unitId}>
              {loading ? 'Creating...' : 'Create Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Replace the LeasesTab stub**

Replace `apps/web/src/app/(dashboard)/properties/[id]/leases-tab.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoreHorizontal, Ban, Trash2 } from 'lucide-react';
import { CreateLeaseDialog } from './create-lease-dialog';

interface LeaseTenant {
  id: string;
  user_id: string;
  is_primary: boolean;
  accepted_at?: string | null;
}

interface Lease {
  id: string;
  status: string;
  start_date: string;
  end_date?: string | null;
  rent_amount: number;
  rent_due_day: number;
  lease_tenants?: LeaseTenant[];
}

interface Unit {
  id: string;
  unit_number?: string | null;
  rent_amount?: number | null;
  leases?: Lease[];
}

interface LeasesTabProps {
  propertyId: string;
  units: Unit[];
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  draft: 'secondary',
  expired: 'outline',
  terminated: 'destructive',
};

export function LeasesTab({ propertyId, units }: LeasesTabProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);

  // Flatten leases from all units, attaching unit info
  const allLeases = units.flatMap((unit) =>
    (unit.leases ?? []).map((lease) => ({
      ...lease,
      unitNumber: unit.unit_number,
      unitId: unit.id,
    })),
  );

  async function handleTerminate(leaseId: string) {
    setError(null);
    const { error: updateError } = await supabase
      .from('leases')
      .update({ status: 'terminated' })
      .eq('id', leaseId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
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
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateLeaseDialog units={units} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {allLeases.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No leases yet. Create your first lease.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Tenants</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {allLeases.map((lease) => (
              <TableRow key={lease.id}>
                <TableCell className="font-medium">{lease.unitNumber ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[lease.status] ?? 'secondary'} className="capitalize">
                    {lease.status}
                  </Badge>
                </TableCell>
                <TableCell>${lease.rent_amount.toLocaleString()}/mo</TableCell>
                <TableCell>{lease.start_date}</TableCell>
                <TableCell>{lease.end_date ?? 'Month-to-month'}</TableCell>
                <TableCell>
                  {(lease.lease_tenants?.length ?? 0) === 0 ? (
                    <span className="text-muted-foreground">None</span>
                  ) : (
                    <span>
                      {lease.lease_tenants!.length} tenant{lease.lease_tenants!.length !== 1 ? 's' : ''}
                      {lease.lease_tenants!.some((t) => !t.accepted_at) && (
                        <span className="ml-1 text-xs text-muted-foreground">(pending)</span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {lease.status === 'active' && (
                        <DropdownMenuItem
                          onClick={() => handleTerminate(lease.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Terminate
                        </DropdownMenuItem>
                      )}
                      {lease.status === 'draft' && (
                        <DropdownMenuItem
                          onClick={() => handleDelete(lease.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

**Step 3: Verify build**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/properties/\[id\]/
git commit -m "feat: add leases tab with create (+ tenant invite) and terminate/delete"
```

---

### Task 7: Final Verification

**Step 1: Full typecheck**

```bash
pnpm turbo typecheck
```

Expected: All packages pass.

**Step 2: Full build**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds.

**Step 3: Run existing tests**

```bash
pnpm turbo test:unit
```

Expected: All tests pass (no regressions).

**Step 4: Final commit if any adjustments were needed**

Fix any issues, commit, push, and create PR.
