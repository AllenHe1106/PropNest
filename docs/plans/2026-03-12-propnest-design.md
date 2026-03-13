# PropNest — Design Document

> **A personal property management tool for independent landlords**

## Project Description

PropNest is a cross-platform property management application for independent landlords managing a small portfolio (1–5 properties). It replaces the need for a third-party property management company by giving the landlord, their property manager, and tenants a unified platform to handle rent, maintenance, leases, and communication — accessible on both mobile (iOS/Android) and web.

---

## Status: In Progress (Brainstorming Phase)

---

## Decisions Made

### Name
**PropNest**
- Short, memorable, intuitive (property + home/nest)
- Target domain: `propnest.app`

### Portfolio Scale
- Small: 1–5 properties
- No need for enterprise-scale architecture

### Users & Roles

| Role | Access |
|------|--------|
| **Owner (Landlord)** | Full access — all properties, financials, reports, settings |
| **Property Manager** | Manage properties, tenants, maintenance, leases — no financial settings |
| **Tenant** | Their unit only — pay rent, submit maintenance, view lease/docs, message |

### Payments
- Online payments (tenants pay through app → landlord bank account via Stripe)
- Manual logging (record cash/check/bank transfer payments outside the app)

### Platform
- **Mobile**: Native iOS & Android app via Expo (React Native)
- **Web**: Full dashboard via Next.js
- Both share the same backend/API

### Tech Stack (Option A — Recommended)

| Layer | Technology |
|-------|-----------|
| Mobile App | Expo (React Native) |
| Web App | Next.js |
| Backend / Auth | Supabase (Postgres + Auth + Storage + Realtime) |
| Payments | Stripe |

---

## Core Features (from research)

Drawn from top apps: AppFolio, Buildium, TurboTenant, DoorLoop, Innago.

### Must Have
- [ ] Online rent collection (Stripe)
- [ ] Manual rent logging
- [ ] Automatic late fee tracking
- [ ] Tenant portal (pay rent, submit maintenance, view lease/docs)
- [ ] Maintenance request tracking (photos/videos, vendor assignment, status updates)
- [ ] Lease management & digital signing
- [ ] Document storage (leases, inspection reports, receipts)
- [ ] In-app messaging (landlord ↔ tenant, landlord ↔ property manager)
- [ ] Owner financial reports & accounting
- [ ] Property manager access & permissions

### Nice to Have
- [ ] Tenant screening (background/credit checks via third-party)
- [ ] Rental listing & marketing integration
- [ ] Bank reconciliation
- [ ] Push notifications (mobile)
- [ ] Analytics dashboard

---

## Design Sections — Progress

- [x] User Roles & Permissions
- [ ] Data Model & Architecture
- [ ] Feature Breakdown by Screen/Module
- [ ] Payment Flow
- [ ] Mobile vs Web parity
- [ ] Error handling & edge cases
- [ ] Testing approach

---

## References

- [AppFolio — Best Property Management Software 2026](https://www.appfolio.com/blog/best-property-management-softwares-compared-2026)
- [Landlord Studio — 11 Best Rental Property Management Software](https://www.landlordstudio.com/blog/best-rental-property-management-software)
- [DoorLoop](https://www.doorloop.com/)
- [TurboTenant](https://www.turbotenant.com/)
- [Innago](https://innago.com/)
