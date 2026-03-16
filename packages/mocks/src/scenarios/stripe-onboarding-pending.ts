import type { SeedData } from '../store';
import { buildLandlord, buildOrganization, buildOrgMember, buildStripeAccount } from '../fixtures';

export function stripeOnboardingPending(): SeedData {
  const landlord = buildLandlord({ email: 'landlord@propnest-test.com', password: 'test123' });
  const org = buildOrganization({ name: 'New Landlord Org' });
  const member = buildOrgMember({ organization_id: org.id, user_id: landlord.id, role: 'owner' });

  const stripeAcct = buildStripeAccount({
    organization_id: org.id,
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
  });

  return {
    users: [landlord],
    organizations: [org],
    organizationMembers: [member],
    stripeAccounts: [stripeAcct],
    stripeConnectAccounts: [{
      id: stripeAcct.stripe_account_id,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    }],
  };
}
