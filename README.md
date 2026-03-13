# PropNest

> A cross-platform property management app for independent landlords — replacing the need for a third-party property management company.

## What it does

PropNest gives landlords, property managers, and tenants a unified platform to handle rent collection, maintenance, leases, and communication — accessible on both iOS/Android and web.

**Three roles:**
- **Owner (Landlord)** — full access: properties, financials, reports, settings
- **Property Manager** — manage properties, tenants, maintenance, leases
- **Tenant** — pay rent, submit maintenance requests, view lease and documents

## Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo (React Native) |
| Web | Next.js (App Router) |
| Backend / Auth | Supabase (Postgres + Auth + Storage + Realtime) |
| Payments | Stripe Connect Express |

## V1 Scope (7 weeks)

- Online rent collection (Stripe) + manual payment logging
- Lease management with `leases → payments` FK from day one
- Maintenance request tracking (photos, status lifecycle)
- In-app messaging (landlord ↔ tenant, landlord ↔ PM)
- Document storage
- Audit log (immutable, from day one)
- Role-based access with Supabase RLS on every table

**Deferred to v2:** digital lease signing, tenant screening, financial reports, push notifications, analytics, bank reconciliation.

## Repo Structure

```
propnest/
├── apps/
│   ├── mobile/          # Expo (React Native)
│   └── web/             # Next.js
├── packages/
│   ├── core/            # Shared business logic (zero platform dependencies)
│   ├── ui/              # Shared component library
│   ├── validators/      # Zod schemas
│   └── supabase-client/ # Typed Supabase client + generated types
├── supabase/
│   ├── migrations/      # Versioned SQL schema changes
│   └── functions/       # Edge Functions (Stripe webhook, invites, cron)
└── docs/plans/          # Architecture decisions and design docs
```

## Architecture Decisions

See [`docs/plans/`](./docs/plans/) for the full design docs including:
- [`2026-03-13-v1-plan.md`](./docs/plans/2026-03-13-v1-plan.md) — v1 feature set, 9-table schema, build phases
- [`2026-03-13-technical-architecture.md`](./docs/plans/2026-03-13-technical-architecture.md) — deep schema, RLS policies, Stripe flow

## Non-Negotiable Rules

1. Stripe Connect Express — never holds money in the platform
2. RLS enabled on every Supabase table before real user data lands
3. `leases → payments` FK exists from day one
4. Payment status is an enum (`pending/processing/paid/failed/disputed`)
5. Audit log is append-only and written from day one
6. `idempotency_key` on all payment records
7. `packages/core` has zero platform dependencies (no React, no Supabase client)
8. All schema changes are versioned SQL migration files — no dashboard edits
