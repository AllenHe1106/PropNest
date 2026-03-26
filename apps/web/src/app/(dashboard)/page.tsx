import { createServerClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MembershipRow {
  role: string;
  organizations: { name: string; slug: string } | null;
}

interface LeaseTenantRow {
  lease_id: string;
  is_primary: boolean;
  leases: {
    rent_amount: number;
    status: string;
    units: {
      unit_number: string;
      properties: { name: string } | null;
    } | null;
  } | null;
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const userName = user.user_metadata?.full_name || user.email || 'User';

  // Fetch org membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, organizations(name, slug)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single() as { data: MembershipRow | null };

  // Fetch tenant leases
  const { data: leases } = await supabase
    .from('lease_tenants')
    .select('lease_id, is_primary, leases(rent_amount, status, units(unit_number, properties(name)))')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null) as { data: LeaseTenantRow[] | null };

  // Check Stripe Connect status for owners
  let stripeConnected = false;
  if (membership?.role === 'owner') {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', membership.organizations?.slug ?? '')
      .single();

    if (org) {
      const { data: stripe } = await supabase
        .from('stripe_accounts')
        .select('charges_enabled')
        .eq('organization_id', org.id)
        .single();
      stripeConnected = stripe?.charges_enabled ?? false;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {userName}</h1>
        <p className="text-muted-foreground">Here&apos;s your PropNest overview</p>
      </div>

      {membership && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {membership.organizations?.name}
              <Badge variant="secondary" className="capitalize">{membership.role}</Badge>
            </CardTitle>
            <CardDescription>Your organization</CardDescription>
          </CardHeader>
        </Card>
      )}

      {membership?.role === 'owner' && !stripeConnected && (
        <Alert>
          <AlertDescription>
            Set up Stripe Connect to start accepting rent payments from tenants.
          </AlertDescription>
        </Alert>
      )}

      {leases && leases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Leases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leases.map((lt) => (
              <div key={lt.lease_id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {lt.leases?.units?.properties?.name}
                    {lt.leases?.units?.unit_number && ` — Unit ${lt.leases.units.unit_number}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ${lt.leases?.rent_amount}/mo
                    {lt.is_primary && ' (Primary tenant)'}
                  </p>
                </div>
                <Badge variant={lt.leases?.status === 'active' ? 'default' : 'secondary'}>
                  {lt.leases?.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!membership && (!leases || leases.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              You don&apos;t have any organization memberships or active leases yet.
              Ask your landlord or property manager to send you an invite.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
