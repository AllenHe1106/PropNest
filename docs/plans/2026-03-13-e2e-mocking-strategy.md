# PropNest E2E Mocking Strategy — Synthesis

## Verdict

No single agent wins outright. Agent 2 (Local Supabase Stack) is correct that RLS correctness is non-negotiable and cannot be simulated — that argument is decisive and closes the debate on that specific point. Agent 1 (MSW) is correct that network-layer interception is the right tool for fast, portable, developer-facing E2E tests across web and mobile — that argument is decisive for the bulk of the test pyramid. Agent 3 (Repository Pattern) is correct that `packages/core` philosophy should extend to data access interfaces, but wrong to position it as a primary E2E strategy, because it tests mocks of mocks and never exercises the actual Supabase client calls. The winning architecture is a three-layer hybrid: **MSW + in-memory store for the E2E fast path, a dedicated local Supabase integration suite specifically and exclusively for RLS policy validation, and repository interfaces for unit-testing business logic in hooks and components**. Each layer tests only what it can test correctly.

---

## The Hybrid Architecture

### New Package: `packages/mocks`

Shared mock infrastructure consumed by Vitest component tests and Playwright E2E tests. Zero Docker dependency.

```
packages/mocks/
├── package.json                        # deps: msw@^2, @faker-js/faker, ws
├── tsconfig.json
└── src/
    ├── store/
    │   └── index.ts                    # MockStore: Maps for users, sessions, properties,
    │                                   #   payments, maintenance, uploads, messages
    ├── fixtures/
    │   ├── user.factory.ts             # buildTenant(), buildLandlord(), buildManager()
    │   ├── property.factory.ts         # buildProperty(), buildUnit(), buildLease()
    │   ├── payment.factory.ts          # buildPaymentIntent(), buildPaymentRecord()
    │   └── maintenance.factory.ts      # buildMaintenanceRequest(), buildAttachment()
    ├── scenarios/
    │   ├── index.ts                    # re-exports all scenarios
    │   ├── landlord-with-two-tenants.ts
    │   ├── overdue-payment.ts
    │   ├── maintenance-pending.ts
    │   └── stripe-onboarding-pending.ts
    ├── handlers/
    │   ├── supabase/
    │   │   ├── auth.ts                 # POST /auth/v1/token, GET /auth/v1/user,
    │   │   │                           #   POST /auth/v1/signup, POST /auth/v1/logout
    │   │   ├── rest.ts                 # GET|POST|PATCH|DELETE /rest/v1/* with
    │   │   │                           #   PostgREST param parsing + RLS simulation
    │   │   └── storage.ts              # POST|GET /storage/v1/object/:bucket/:path
    │   ├── stripe/
    │   │   ├── payment-intents.ts      # POST /v1/payment_intents, confirm, capture
    │   │   ├── accounts.ts             # POST /v1/accounts, /v1/account_links
    │   │   └── webhook-utils.ts        # generateTestHeaderString wrapper
    │   └── edge-functions/
    │       ├── create-payment-intent.ts  # POST /functions/v1/create-payment-intent
    │       └── stripe-webhook.ts         # POST /functions/v1/stripe-webhook
    ├── realtime/
    │   └── ws-server.ts                # MockRealtimeServer (ws package), Phoenix
    │                                   #   protocol subset, broadcast() helper
    ├── server.ts                       # setupServer(...allHandlers) — Node/Vitest
    ├── browser.ts                      # setupWorker(...allHandlers) — Playwright
    └── index.ts                        # re-exports store, fixtures, scenarios, servers
```

### New Package: `packages/test-utils`

Integration test helpers that require a running local Supabase stack. Used **only** by the RLS integration suite. Never imported by application code or the E2E fast-path suite.

```
packages/test-utils/
├── package.json                        # deps: @supabase/supabase-js, vitest
├── tsconfig.json
└── src/
    ├── auth-helpers.ts                 # createAuthUser(), signInAsUser(),
    │                                   #   getServiceRoleClient()
    ├── rls-helpers.ts                  # assertRLSVisible(), assertRLSNotVisible()
    ├── seed-helpers.ts                 # createLandlord(), createTenant(),
    │                                   #   createProperty(), createLease()
    ├── reset.ts                        # truncateAll() — FK-safe truncation order
    │                                   #   via service role, called per-suite
    ├── stripe-helpers.ts               # triggerStripeWebhook() using real
    │                                   #   stripe.webhooks.generateTestHeaderString
    └── env.ts                          # asserts SUPABASE_SERVICE_KEY present at import;
                                        #   fails loudly if used outside RLS suite
```

### Repository Interface Layer: `packages/repositories`

Thin typed interfaces enabling fast hook and component unit tests. Real implementations wrap Supabase. Mock implementations are backed by the same MockStore from `packages/mocks`. This is used for unit tests only, not for E2E.

```
packages/repositories/
├── package.json
└── src/
    ├── interfaces.ts                   # IPaymentRepository, IMaintenanceRepository,
    │                                   #   IPropertyRepository, IRealtimeChannel
    ├── supabase/                       # Production implementations
    │   ├── payment.repository.ts
    │   ├── maintenance.repository.ts
    │   └── property.repository.ts
    ├── mock/                           # Test implementations backed by MockStore
    │   ├── payment.repository.ts
    │   ├── maintenance.repository.ts
    │   └── property.repository.ts
    └── index.ts
```

### Test Suite Layout

```
apps/web/
└── e2e/                                # Playwright — MSW, no Docker
    ├── auth.spec.ts
    ├── payments.spec.ts
    ├── maintenance.spec.ts
    ├── realtime.spec.ts                # MSW + WS mock server
    └── stripe-connect.spec.ts

apps/mobile/
└── e2e/                                # Detox/Maestro — MSW Node adapter
    ├── auth.spec.ts
    └── payments.spec.ts

packages/core/
└── src/
    ├── payments/__tests__/             # Pure Vitest — zero mocks
    └── leases/__tests__/

supabase/
└── tests/
    └── rls/                            # RLS Integration Suite — requires supabase start
        ├── payments-rls.test.ts
        ├── maintenance-rls.test.ts
        ├── messages-rls.test.ts
        └── documents-rls.test.ts
```

---

## Test Pyramid for PropNest

```
                    ┌──────────────────────────────┐
                    │         E2E Tests             │  Playwright (web)
                    │      50–100 scenarios          │  Detox/Maestro (mobile)
                    │   Mock: MSW + WS mock server  │  No Docker
                    └──────────────────────────────┘
              ┌──────────────────────────────────────────┐
              │      Component / Hook Unit Tests          │  Vitest + RTL / RNTL
              │      200–500 tests                        │
              │      Mock: MSW Node mode + repo mocks     │  No Docker
              └──────────────────────────────────────────┘
        ┌──────────────────────────────────────────────────────┐
        │            RLS Integration Suite                     │  Vitest + real Postgres
        │            20–50 targeted tests                      │  supabase start required
        │            Mock: NONE — real RLS enforced            │  Nightly + migration PRs
        └──────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────┐
  │                      Unit Tests                                  │  Vitest, zero deps
  │         packages/core — unlimited tests, <5s total               │
  └──────────────────────────────────────────────────────────────────┘
```

| Layer | Mock Strategy | CI Trigger | Speed Target |
|---|---|---|---|
| Unit (`packages/core`) | None | Every commit | <5s |
| Component/Hook | MSW Node mode + repo mocks | Every commit | <60s |
| E2E Web | MSW service worker + WS server | Every PR | <10min |
| E2E Mobile | MSW Node adapter | Every PR | <10min |
| RLS Integration | Real `supabase start` | Nightly + `supabase/migrations/**` | <10min |
| Stripe Integration | Real Stripe test mode | Nightly | <5min |

---

## Key Rulings

- **RLS must be tested against real Postgres, not simulated.** Agent 2 wins this point without qualification. TypeScript simulation of SQL `USING` clauses will drift from reality and miss edge cases. For a multi-tenant financial application, an undetected RLS bypass is a legal and security incident, not a test coverage gap. A dedicated integration suite against `supabase start` is mandatory.

- **The RLS suite is scoped and separate, not universal.** Agent 2 loses the argument that all E2E tests require the local stack. A 45–90 second Docker boot on every PR across the entire E2E suite is unjustifiable when MSW catches 95% of application bugs in under a minute. The local stack runs only when it is the right tool: testing SQL policies.

- **MSW is the primary mock infrastructure for all non-RLS test layers.** Agent 1 wins for component tests and E2E. Zero Docker dependency, sub-50ms startup, same handlers in Vitest, Playwright, and Expo, covering Supabase Auth, PostgREST, Storage, Stripe, and Edge Functions in one package with one state model.

- **The full Repository Pattern architectural refactor is rejected as an E2E strategy.** Agent 3's proposal requires pervasive application code changes before a single test benefit is realized and never exercises the actual `supabase.from().select()` call chain. The repository interface layer is adopted only for hook and component unit tests, where it belongs.

- **Agent 3's Scenario DSL is adopted wholesale into `packages/mocks`.** Named scenarios (`scenarios.landlordWithOverdueTenant()`) seed both the MSW in-memory store for fast tests and the real database in the RLS suite. One DSL, two consumers. This is Agent 3's most durable contribution.

- **Stripe webhook testing uses `triggerStripeWebhook()` with a real HMAC signature, not stripe-mock Docker.** The `stripe.webhooks.generateTestHeaderString()` approach tests actual signature verification in the webhook handler without adding Docker dependencies to the E2E fast path. stripe-mock is reserved for the dedicated Stripe integration job if one is needed.

- **WebSocket/Realtime mocking uses a bespoke mock WS server in `packages/mocks/src/realtime/ws-server.ts`.** MSW v2's WebSocket support is incomplete for production use. The `ws`-backed server implementing the Phoenix protocol subset is ~200 lines and gives deterministic control over broadcast timing. Skipping Realtime tests in CI is not acceptable.

- **Mobile E2E uses the MSW Node adapter, not the Service Worker.** Expo/React Native cannot use a Service Worker. The `@mswjs/interceptors` Node adapter intercepts at the Node `http` module level and works in Detox/Maestro test environments. Mobile coverage is scoped to auth and payment flows; web Playwright is primary.

- **Per-test isolation uses `db.reset()` in `beforeEach` for the MSW fast path, and per-suite truncation in the RLS suite.** In-memory store reset is microseconds — no reason to share state between tests. In the RLS suite, `reset.ts` truncates in FK-safe order via the service role client once per suite; individual tests within a suite use unique UUIDs and email addresses to avoid cross-test contamination.

- **The RLS CI job is gated on `supabase/migrations/**` path changes plus a nightly schedule.** It is not a required blocking check on every PR — that would impose Docker overhead universally. The fast suite (MSW) is the required blocking check. The RLS suite must pass before any migration merges. This is enforced via branch protection path filters.

---

## Implementation Roadmap

1. **Create `packages/mocks` skeleton.** Add `package.json` with exports for `./server`, `./browser`, `./scenarios`. Implement `MockStore` type and `createEmptyStore()` / `db.reset()` / `db.seed()` API in `src/store/index.ts`. Add to `pnpm-workspace.yaml` and `turbo.json` build graph.

2. **Write fixture factories.** Implement `user.factory.ts`, `property.factory.ts`, `payment.factory.ts`, `maintenance.factory.ts` using `@faker-js/faker` with deterministic seed support (`faker.seed(42)`). All factory return types must match the generated types in `packages/db/src/types.ts` — run `supabase gen types` first if stale.

3. **Implement Supabase Auth handlers.** `POST /auth/v1/token` (password grant + refresh_token grant), `GET /auth/v1/user`, `POST /auth/v1/signup`, `POST /auth/v1/logout`. Mint deterministic JWTs signed with a fixed test secret stored in `SUPABASE_JWT_SECRET` env var. Store sessions in `MockStore.sessions`.

4. **Implement PostgREST REST handlers.** `GET|POST|PATCH|DELETE /rest/v1/*` with JWT validation, PostgREST query parameter parsing (`eq.`, `select=`, `order=`, `limit=`, `offset=`, `Prefer: return=representation`), and role-based filtering in handler logic. Comment every filter block with `// RLS simulation — not a security test`. This is the most complex handler; allocate proportionate time.

5. **Implement Storage handlers.** `POST /storage/v1/object/:bucket/:path` storing references in `MockStore.uploads`, `GET /storage/v1/object/sign/:bucket/:path` returning fake presigned URLs, `GET` of stored objects returning a 1x1 PNG placeholder.

6. **Implement Stripe handlers.** `POST /v1/payment_intents`, `POST /v1/payment_intents/:id/confirm`, `POST /v1/accounts`, `POST /v1/account_links`. Implement `simulateStripeWebhook()` helper in `stripe/webhook-utils.ts` using `stripe.webhooks.generateTestHeaderString()`.

7. **Implement Edge Function handlers.** `POST /functions/v1/create-payment-intent` and `POST /functions/v1/stripe-webhook`. These delegate to the Stripe handler internals and mutate `MockStore.payments` to complete the full payment roundtrip without a real Edge Function invocation.

8. **Build the Realtime WebSocket server.** `MockRealtimeServer` in `packages/mocks/src/realtime/ws-server.ts` using the `ws` package. Implement Phoenix protocol subset: `phx_join`, `phx_leave`, `heartbeat`, data broadcasts. Expose `broadcast(topic, event, payload)`. Default port `4001`; support port override via env var to avoid CI worker conflicts.

9. **Define canonical Scenario DSL.** Implement six scenarios in `packages/mocks/src/scenarios/`: `landlordWithTwoTenants`, `overduePayment`, `maintenanceWithAttachment`, `stripeOnboardingPending`, `realtimeMessaging`, `multiTenantIsolation`. Each returns a `Scenario` that seeds `MockStore` for MSW and can seed a real database for the RLS suite.

10. **Wire MSW into Vitest.** `vitest.setup.ts` in `apps/web` and `apps/mobile`: `server.listen({ onUnhandledRequest: 'error' })` before tests, `server.resetHandlers()` in `afterEach`, `server.close()` in `afterAll`. Add `db.reset()` to global `beforeEach`.

11. **Wire MSW into Playwright.** Run `msw init apps/web/public --save`. Configure Next.js `_app.tsx` (or root layout) to register the service worker when `NEXT_PUBLIC_MSW_ENABLED=true`. Pass scenario via `?scenario=` query param read in layout. Configure `playwright.config.ts` `globalSetup` to start the WS mock server; `globalTeardown` to stop it.

12. **Wire MSW into Expo.** Install `msw/native` in `apps/mobile`. Override fetch polyfill in `apps/mobile/src/test-setup.ts`. Pin to a confirmed-compatible version and document in `CONTRIBUTING.md`.

13. **Create `packages/test-utils`.** Implement `auth-helpers.ts`, `rls-helpers.ts`, `seed-helpers.ts`, `reset.ts`, `stripe-helpers.ts`, `env.ts`. The `env.ts` module must `throw` at import time if `SUPABASE_SERVICE_KEY` is absent — this prevents accidental use outside the RLS suite.

14. **Write the RLS integration suite.** Create `supabase/tests/rls/`. Minimum required tests: cross-tenant payment isolation, manager-scoped property access, storage bucket policy enforcement, Realtime channel authorization, webhook handler write permissions. Each test creates its own data via `seed-helpers.ts`, runs the query as the target user via the anon client, and asserts result shape with `assertRLSVisible`/`assertRLSNotVisible`.

15. **Configure CI pipeline.** Two test gates: (a) **Fast suite** — every PR, required blocking check, `pnpm test:unit && pnpm test:components && pnpm test:e2e`, no Docker, target <15 minutes total; (b) **RLS suite** — path trigger on `supabase/migrations/**` plus nightly cron, `supabase start && pnpm test:rls && supabase stop`, required check before any migration PR merges.

16. **Create `packages/repositories`.** Define `IPaymentRepository`, `IMaintenanceRepository`, `IPropertyRepository`, `IRealtimeChannel` interfaces. Implement Supabase and mock versions. Wire into React Context for hook unit tests. This step is lower priority than steps 1–15 and can be done incrementally as each feature's hooks are written.

17. **Add handler maintenance enforcement.** Document in `CONTRIBUTING.md`: any PR adding a Supabase table, Edge Function, or Stripe API call must include a corresponding handler in `packages/mocks`. Add a CI lint step that fails if new SQL migrations reference tables not covered by handlers in `packages/mocks/src/handlers/supabase/rest.ts`.

---

## Architecture Doc Additions

The following text should be added to `/Users/allenhe/Documents/propnest/docs/plans/2026-03-13-technical-architecture.md` as a new section after **Section 1 (Monorepo Structure)**:

---

### Testing Infrastructure [LOCKED]

**Decision: Three-layer hybrid. MSW for E2E and component tests, local Supabase for RLS, repository interfaces for hook unit tests.**

This is not a preference — it is derived from two hard constraints: (1) RLS correctness is a legal requirement that cannot be satisfied by JavaScript simulation, and (2) E2E test speed directly determines whether developers run tests at all.

#### The Three Layers

**Layer 1 — Unit tests** (`packages/core`, hooks, components via `packages/repositories/mock/`)
- Tool: Vitest
- Mock strategy: None for `packages/core`. Repository interface mocks for hooks and components.
- Trigger: Every commit, watch mode in development.
- Speed target: <5s for `packages/core`, <60s for components.

**Layer 2 — RLS Integration Suite** (`supabase/tests/rls/`)
- Tool: Vitest against a live `supabase start` instance
- Mock strategy: None. Real Postgres, real GoTrue JWTs, real PostgREST, real RLS evaluation.
- Trigger: Every PR that touches `supabase/migrations/**`, plus nightly cron.
- Speed target: <10 minutes including Docker startup.
- Non-negotiable: A broken RLS policy must fail this suite before it reaches `main`. This suite is the sole authoritative source for access-control correctness.

**Layer 3 — E2E Tests** (`apps/web/e2e/`, `apps/mobile/e2e/`)
- Tool: Playwright (web), Detox/Maestro (mobile)
- Mock strategy: MSW v2 (`packages/mocks`) — network interception with in-memory store and simulated RLS filtering.
- Trigger: Every PR, required blocking check.
- Speed target: <10 minutes for web suite, no Docker dependency.
- What it does NOT test: Actual RLS policies. That belongs to Layer 2.

#### New Packages

**`packages/mocks`** — MSW v2 handlers, in-memory `MockStore`, faker-based fixture factories with deterministic seed support, Scenario DSL, and a WebSocket mock server for Realtime. Exported as `./server` (Vitest/Node), `./browser` (Playwright), `./scenarios`. Every new Supabase table, Edge Function, or Stripe API call requires a corresponding handler update before the PR merges.

**`packages/test-utils`** — Helpers for the RLS Integration Suite exclusively: `createLandlord()`, `createTenant()`, `createLease()`, `reset()`, `assertRLSVisible()`, `assertRLSNotVisible()`. Requires a running local Supabase stack. Throws at import time if `SUPABASE_SERVICE_KEY` is absent. Never imported by application code or the fast test suite.

**`packages/repositories`** — TypeScript interfaces (`IPaymentRepository`, `IMaintenanceRepository`, `IPropertyRepository`, `IRealtimeChannel`) with real Supabase implementations and in-memory mock implementations backed by `MockStore`. Used by hook and component unit tests. Not used by E2E tests.

#### CI Pipeline

Two test gates:
- **Fast suite** (every PR, blocking): `pnpm test:unit && pnpm test:components && pnpm test:e2e`. No Docker. Target: <15 minutes total.
- **RLS suite** (path-triggered + nightly, required before migration merges): `supabase start && pnpm test:rls && supabase stop`. Target: <10 minutes including startup.

#### RLS Policy Process

All new RLS policies require a corresponding test in `supabase/tests/rls/` before the migration PR merges. The TypeScript RLS simulation in `packages/mocks/src/handlers/supabase/rest.ts` must mirror policy changes, but is explicitly not authoritative. Every handler block that simulates access control must include the comment `// RLS simulation — not a security test`. The SQL migration is the source of truth; the nightly RLS suite is the enforcer.
