'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

interface Unit {
  id: string;
  unit_number: string | null;
  rent_amount: number | null;
}

interface CreateLeaseDialogProps {
  propertyId: string;
  units: Unit[];
  activeLeaseUnitIds: Set<string>;
}

export function CreateLeaseDialog({
  propertyId,
  units,
  activeLeaseUnitIds,
}: CreateLeaseDialogProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unitId, setUnitId] = useState<string | null>(null);
  const [lateFeeType, setLateFeeType] = useState<string>('flat');
  const [tenantEmails, setTenantEmails] = useState<string[]>(['']);

  const availableUnits = units.filter((u) => !activeLeaseUnitIds.has(u.id));

  function resetForm() {
    setUnitId(null);
    setLateFeeType('flat');
    setTenantEmails(['']);
    setError(null);
  }

  function addTenantEmail() {
    setTenantEmails((prev) => [...prev, '']);
  }

  function removeTenantEmail(index: number) {
    if (tenantEmails.length <= 1) return;
    setTenantEmails((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTenantEmail(index: number, value: string) {
    setTenantEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
  }

  function formatCurrency(amount: number | null) {
    if (amount == null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    if (!unitId) {
      setError('Please select a unit.');
      setLoading(false);
      return;
    }

    const rentAmount = parseFloat(formData.get('rent_amount') as string);
    const securityDeposit = formData.get('security_deposit') as string;
    const startDate = formData.get('start_date') as string;
    const endDate = formData.get('end_date') as string;
    const rentDueDay = parseInt(formData.get('rent_due_day') as string, 10);
    const gracePeriodDays = parseInt(
      formData.get('grace_period_days') as string,
      10
    );
    const lateFeeAmount = formData.get('late_fee_amount') as string;

    // 1. Insert lease
    const { data: lease, error: leaseError } = await supabase
      .from('leases')
      .insert({
        unit_id: unitId,
        status: 'draft' as const,
        rent_amount: rentAmount,
        security_deposit: securityDeposit ? parseFloat(securityDeposit) : null,
        start_date: startDate,
        end_date: endDate || null,
        rent_due_day: rentDueDay,
        grace_period_days: gracePeriodDays,
        late_fee_type: lateFeeType,
        late_fee_amount: lateFeeAmount ? parseFloat(lateFeeAmount) : null,
      })
      .select('id')
      .single();

    if (leaseError) {
      setError(leaseError.message);
      setLoading(false);
      return;
    }

    // 2. Invite tenants
    const validEmails = tenantEmails.filter((email) => email.trim() !== '');
    const failedInvites: string[] = [];

    if (validEmails.length > 0) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      for (let i = 0; i < validEmails.length; i++) {
        const email = validEmails[i].trim();
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-tenant`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                lease_id: lease.id,
                email,
                is_primary: i === 0,
              }),
            }
          );

          if (!res.ok) {
            const body = await res.json().catch(() => null);
            const msg = body?.error || res.statusText;
            failedInvites.push(`${email}: ${msg}`);
          }
        } catch (err) {
          failedInvites.push(
            `${email}: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }
    }

    setLoading(false);

    if (failedInvites.length > 0) {
      setError(
        `Lease created but tenant invite failed for ${failedInvites.join('; ')}`
      );
      // Still refresh since lease was created
      router.refresh();
      return;
    }

    setOpen(false);
    resetForm();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        Create Lease
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Lease</DialogTitle>
          <DialogDescription>
            Create a new lease and invite tenants.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Section 1: Unit & Rent Terms */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Unit & Rent Terms</h3>

            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                value={unitId}
                onValueChange={(val) => setUnitId(val)}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.unit_number ?? 'Unnamed'}{' '}
                      {unit.rent_amount != null &&
                        `(${formatCurrency(unit.rent_amount)}/mo)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rent_amount">Monthly Rent</Label>
              <Input
                id="rent_amount"
                name="rent_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="security_deposit">Security Deposit</Label>
              <Input
                id="security_deposit"
                name="security_deposit"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">
                  End Date{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input id="end_date" name="end_date" type="date" />
              </div>
            </div>
          </div>

          {/* Section 2: Late Fee Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Late Fee Settings</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rent_due_day">Rent Due Day</Label>
                <Input
                  id="rent_due_day"
                  name="rent_due_day"
                  type="number"
                  min="1"
                  max="28"
                  defaultValue="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grace_period_days">Grace Period (days)</Label>
                <Input
                  id="grace_period_days"
                  name="grace_period_days"
                  type="number"
                  min="0"
                  max="30"
                  defaultValue="5"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="late_fee_amount">Late Fee Amount</Label>
                <Input
                  id="late_fee_amount"
                  name="late_fee_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Late Fee Type</Label>
                <Select
                  value={lateFeeType}
                  onValueChange={(val) => setLateFeeType(val as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat ($)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 3: Tenants */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Tenants</h3>

            {tenantEmails.map((email, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`tenant-email-${index}`}>
                    {index === 0 ? 'Primary tenant' : `Tenant ${index + 1}`}
                  </Label>
                  <Input
                    id={`tenant-email-${index}`}
                    type="email"
                    placeholder="tenant@example.com"
                    value={email}
                    onChange={(e) =>
                      updateTenantEmail(index, e.currentTarget.value)
                    }
                  />
                </div>
                {tenantEmails.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeTenantEmail(index)}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Remove</span>
                  </Button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTenantEmail}
            >
              <Plus className="size-4" />
              Add Another Tenant
            </Button>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
