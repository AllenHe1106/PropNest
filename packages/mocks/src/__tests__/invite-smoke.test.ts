import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createMockServer } from '../server';
import { landlordWithTwoTenants } from '../scenarios';

describe('Invite flow smoke test', () => {
  const { server, store } = createMockServer();

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    store.reset();
    server.resetHandlers();
    store.seed(landlordWithTwoTenants());
  });

  const SUPABASE_URL = 'http://localhost:54321';

  async function signIn(email: string) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test123' }),
    });
    const body = (await res.json()) as { access_token: string };
    return body.access_token;
  }

  it('owner invites manager → manager accepts → gains access', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    // 1. Owner invites a new manager
    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'newmanager@test.com', role: 'manager' }),
    });
    expect(inviteRes.status).toBe(200);
    const { member_id, invite_token } = (await inviteRes.json()) as {
      member_id: string;
      invite_token: string;
    };
    expect(member_id).toBeDefined();
    expect(invite_token).toBeDefined();

    // 2. Verify pending member has accepted_at = null
    const pending = store.organizationMembers.get(member_id);
    expect(pending).toBeDefined();
    expect(pending!.accepted_at).toBeNull();

    // 3. Sign in as the new manager and accept
    const managerToken = await signIn('newmanager@test.com');

    const acceptRes = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(acceptRes.status).toBe(200);
    const acceptBody = (await acceptRes.json()) as { action: string };
    expect(acceptBody.action).toBe('accepted');

    // 4. Verify accepted_at is now set
    const accepted = store.organizationMembers.get(member_id);
    expect(accepted!.accepted_at).not.toBeNull();
  });

  it('owner invites tenant → tenant accepts → gains lease access', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');
    const leaseId = Array.from(store.leases.values())[0].id;

    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-tenant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lease_id: leaseId, email: 'newtenant@test.com', is_primary: true }),
    });
    expect(inviteRes.status).toBe(200);
    const { lease_tenant_id, invite_token } = (await inviteRes.json()) as {
      lease_tenant_id: string;
      invite_token: string;
    };
    expect(lease_tenant_id).toBeDefined();

    // Accept as tenant
    const tenantToken = await signIn('newtenant@test.com');
    const acceptRes = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(acceptRes.status).toBe(200);

    const accepted = store.leaseTenants.get(lease_tenant_id);
    expect(accepted!.accepted_at).not.toBeNull();
  });

  it('tenant cannot invite anyone', async () => {
    const tenantToken = await signIn('tenant1@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'someone@test.com', role: 'manager' }),
    });
    expect(res.status).toBe(403);
  });

  it('owner creates Stripe Connect account → gets onboarding link', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    // Remove any existing stripe account seeded by the scenario
    for (const [key, sa] of store.stripeAccounts.entries()) {
      if (sa.organization_id === orgId) store.stripeAccounts.delete(key);
    }

    // Create account
    const createRes = await fetch(`${SUPABASE_URL}/functions/v1/create-connect-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId }),
    });
    expect(createRes.status).toBe(200);
    const { stripe_account_id, existing } = (await createRes.json()) as {
      stripe_account_id: string;
      existing: boolean;
    };
    expect(stripe_account_id).toBeDefined();
    expect(existing).toBe(false);

    // Get onboarding link
    const linkRes = await fetch(`${SUPABASE_URL}/functions/v1/create-account-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: orgId,
        return_url: 'http://localhost:3000/settings/stripe/return',
        refresh_url: 'http://localhost:3000/settings/stripe/refresh',
      }),
    });
    expect(linkRes.status).toBe(200);
    const { url } = (await linkRes.json()) as { url: string };
    expect(url).toContain('stripe.com');

    // Idempotent: creating again returns existing
    const createAgain = await fetch(`${SUPABASE_URL}/functions/v1/create-connect-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId }),
    });
    const again = (await createAgain.json()) as { existing: boolean };
    expect(again.existing).toBe(true);
  });

  // --- Negative-path and edge-case tests ---

  it('accept-invite with missing token returns 400', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('accept-invite with invalid/expired token is rejected', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: 'invalid-garbage-token' }),
    });
    // Mock returns 404 (no matching invite); real Edge Function returns 401 (invalid token)
    expect(res.ok).toBe(false);
  });

  it('accept-invite without auth returns signup_required', async () => {
    // First create a valid invite token
    const ownerToken = await signIn('landlord@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'noauth@test.com', role: 'manager' }),
    });
    expect(inviteRes.status).toBe(200);
    const { invite_token } = (await inviteRes.json()) as { invite_token: string };

    // Accept without Authorization header
    const res = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { action: string };
    expect(body.action).toBe('signup_required');
  });

  it('accept-invite with wrong user is rejected', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    // Owner invites manager@test.com
    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'manager@test.com', role: 'manager' }),
    });
    expect(inviteRes.status).toBe(200);
    const { invite_token } = (await inviteRes.json()) as { invite_token: string };

    // A different user (tenant1) tries to accept
    const tenantToken = await signIn('tenant1@propnest-test.com');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    // Mock returns 404 (no matching record for wrong user); real Edge Function returns 403 (email mismatch)
    expect(res.ok).toBe(false);
  });

  it('double-accept returns 404', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    // Owner invites manager
    const inviteRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId, email: 'doubleaccept@test.com', role: 'manager' }),
    });
    expect(inviteRes.status).toBe(200);
    const { invite_token } = (await inviteRes.json()) as { invite_token: string };

    // Manager accepts first time
    const managerToken = await signIn('doubleaccept@test.com');
    const firstAccept = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(firstAccept.status).toBe(200);

    // Manager tries to accept again with same token
    const secondAccept = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: invite_token }),
    });
    expect(secondAccept.status).toBe(404);
  });

  it('invite-member with missing fields returns 400', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');
    const orgId = Array.from(store.organizations.values())[0].id;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organization_id: orgId }),
    });
    expect(res.status).toBe(400);
  });

  it('invite-tenant with missing fields returns 400', async () => {
    const ownerToken = await signIn('landlord@propnest-test.com');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-tenant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
