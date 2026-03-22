# Phase 3: Web App Scaffold + Auth UI — Design

**Goal:** Scaffold the Next.js web application with auth pages (login, signup, forgot password, accept invite), Supabase session management via middleware, and a minimal dashboard shell — proving the full auth loop works end-to-end.

**Depends on:** Phase 2: Auth & Invitations (merged). The invite Edge Functions and Stripe Connect onboarding are in place.

---

## 1. Next.js App Scaffold

`apps/web/` — Next.js 15 with App Router, TypeScript, Tailwind CSS v4, shadcn/ui (new-york style).

**Dependencies:**
- `next`, `react`, `react-dom`
- `@supabase/ssr`, `@supabase/supabase-js`
- `tailwindcss`, shadcn/ui components
- Workspace: `@propnest/db` (types), `@propnest/validators` (form validation)

**Extends** `tsconfig.base.json` from monorepo root.

**Route structure:**
```
src/app/
├── (auth)/                    # Public auth pages (centered card layout)
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── forgot-password/page.tsx
│   ├── accept-invite/page.tsx
│   └── layout.tsx
├── (dashboard)/               # Protected pages (sidebar + header layout)
│   ├── page.tsx               # Dashboard home
│   └── layout.tsx
├── auth/
│   └── callback/route.ts     # Supabase auth callback handler
├── layout.tsx                 # Root layout (fonts, providers)
└── middleware.ts              # Session refresh + route protection
```

Route groups `(auth)` and `(dashboard)` give different layouts without nesting URL paths.

## 2. Auth & Session Management

### Middleware (`middleware.ts`)

- Runs on every request
- Creates a Supabase server client, refreshes the session token
- Redirects unauthenticated users away from `(dashboard)` routes to `/login`
- Redirects authenticated users away from `(auth)` routes to `/`
- Passes refreshed cookies to the response

### Supabase Client Utilities

- `createServerClient()` — for Server Components and Route Handlers (reads cookies)
- `createBrowserClient()` — singleton for Client Components

### Auth Pages

| Page | Behavior |
|------|----------|
| `/login` | Email/password form + "Sign in with magic link" option + "Forgot password?" link |
| `/signup` | Name, email, password form. Creates user, redirects to dashboard |
| `/forgot-password` | Email input, sends Supabase password reset email, shows confirmation |
| `/accept-invite` | Reads `token` from URL query param. If authenticated, calls accept-invite Edge Function. If not, redirects to signup with token preserved |

### Auth Callback (`/auth/callback/route.ts`)

Handles the `code` exchange from Supabase magic links, password resets, and invite emails. Exchanges code for session, redirects to dashboard (or back to accept-invite if invite token present).

## 3. Dashboard Shell & Layout

### Dashboard Layout (`(dashboard)/layout.tsx`)

- Responsive sidebar (collapsible on mobile) with navigation links
- Top header bar with user avatar/name and sign-out button
- Sidebar nav: just "Dashboard" for now (more items added in Phase 4+)
- Fetches user profile server-side, passes to client components

### Dashboard Home (`(dashboard)/page.tsx`)

- Fetches user's organization membership
- Shows: "Welcome, {full_name}" heading, org name, role badge (Owner/Manager/Tenant)
- For owners without Stripe Connect: "Set up payments" prompt
- For tenants: active lease summary (unit, rent amount)
- Minimal proof-of-life page, not a full dashboard

### Sign Out

Client-side button calls `supabase.auth.signOut()`, redirects to `/login`.

## 4. Testing & Dev Environment

- Vitest unit tests for utility functions (Supabase client factories, auth helpers)
- Manual testing via `pnpm dev` against local Supabase
- `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Turbo `dev` task wired to run `next dev`

## What's NOT in Phase 3

- No mobile app (deferred to a later phase)
- No `packages/ui` shared components (build web-specific first, extract when mobile starts)
- No `packages/config` shared ESLint/Prettier configs
- No property/unit/lease CRUD pages
- No Stripe onboarding UI
- No real-time features
- No custom email templates
