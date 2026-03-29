# Phase 6: Property & Lease Management UI — Design

> **Date:** 2026-03-27
> **Status:** Approved
> **Scope:** Landlord-side only (owner/manager). Tenants keep current dashboard.

---

## Decisions

| Question | Answer |
|----------|--------|
| Who is this for? | Owners and managers only |
| Navigation model | Property-centric with tabs (Overview, Units, Leases) |
| Create/edit pattern | Modal dialogs for everything |
| Lease + tenant invite | Combined — tenant emails entered during lease creation |

---

## Routes & Navigation

**Sidebar addition** (visible to owner/manager only):
- Properties (`/properties`)

**Route structure:**
```
(dashboard)/
  properties/
    page.tsx                    — Properties list
    [id]/
      page.tsx                  — Property detail with tabs
```

Property detail page has 3 tabs: Overview, Units, Leases.

---

## UI Flow

### Properties List (`/properties`)
Cards showing property name, address, unit count, active lease count. "Add Property" button opens modal form (name, address fields, notes).

### Property Detail (`/properties/[id]`)

**Overview tab** — Read-only display of property info (name, full address, property type, year built, notes). "Edit" button opens same modal form pre-filled. "Delete" button with confirmation dialog.

**Units tab** — Table: unit number, bedrooms, bathrooms, sqft, rent amount, availability status. "Add Unit" opens modal. Row actions dropdown (edit, delete). Delete blocked if unit has active lease (DB constraint).

**Leases tab** — Table: unit, status badge, tenant email(s), rent amount, start/end dates. "Create Lease" opens multi-section modal:
1. Select unit (dropdown of available units in this property), rent amount, start date, end date
2. Rent due day (1-28), grace period days, late fee type (flat/percentage), late fee amount
3. Tenant email(s) — sends invite via existing `invite-tenant` Edge Function

Lease saves as `draft` status. Tenant invites sent immediately.

Row actions: Edit (draft only), Terminate (active only), Delete (draft only).

---

## Data Fetching

All reads via server components using `createServerClient()`. RLS handles authorization — no new Edge Functions for CRUD.

Mutations via client components using `createBrowserClient()`:
- Property/unit CRUD → direct `.insert()` / `.update()` / `.delete()` on Supabase
- Lease create → direct insert + call `invite-tenant` Edge Function per tenant email
- Lease terminate → `.update({ status: 'terminated' })`

---

## New shadcn/ui Components

- `table` — unit and lease lists
- `dialog` — all create/edit modals
- `select` — unit dropdown, late fee type, property type
- `tabs` — property detail page
- `textarea` — notes fields
- `dropdown-menu` — row actions (edit, delete, terminate)

---

## Validation

Reuse Zod schemas from `packages/validators`:
- `CreatePropertySchema` / `UpdatePropertySchema`
- `CreateUnitSchema` / `UpdateUnitSchema`
- `CreateLeaseSchema` / `UpdateLeaseSchema`

Client-side validation before Supabase calls. Server-side enforced by DB constraints + RLS.

---

## Deletion Rules

- **Property**: Confirmation dialog. Cascades to units via DB constraint.
- **Unit**: Blocked if unit has active lease (`ON DELETE RESTRICT` on leases FK).
- **Lease**: Only `draft` leases deletable. Active leases can be terminated (status change). Expired leases are read-only.
