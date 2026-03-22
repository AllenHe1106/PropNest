# Phase 3: Web App Scaffold + Auth UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the Next.js 15 web application with Supabase auth (email/password + magic link), session middleware, auth pages, and a minimal dashboard shell.

**Architecture:** Next.js 15 App Router with route groups for auth vs dashboard layouts. Supabase SSR middleware refreshes tokens on every request and gates protected routes. shadcn/ui provides the component library on top of Tailwind CSS.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, @supabase/ssr, @supabase/supabase-js, Zod

---

## Task 1: Scaffold Next.js App

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/.env.local.example`

**Step 1: Initialize Next.js in apps/web**

Run from repo root:
```bash
cd /Users/allenhe/Documents/propnest
pnpm dlx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

When prompted, accept defaults. This creates the full Next.js scaffold.

**Step 2: Add workspace dependencies**

Update `apps/web/package.json` to add workspace deps:
```bash
cd apps/web
pnpm add @propnest/db@workspace:* @propnest/validators@workspace:*
```

**Step 3: Update tsconfig.json to extend base**

`apps/web/tsconfig.json` should extend the monorepo base:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create .env.local.example**

`apps/web/.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Step 5: Verify dev server starts**

```bash
cd /Users/allenhe/Documents/propnest/apps/web
pnpm dev
```

Visit http://localhost:3000 — should see Next.js welcome page.

**Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat: scaffold Next.js 15 app with App Router and Tailwind"
```

---

## Task 2: Initialize shadcn/ui

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/utils.ts`
- Modify: `apps/web/src/app/globals.css`

**Step 1: Initialize shadcn**

```bash
cd /Users/allenhe/Documents/propnest/apps/web
pnpm dlx shadcn@latest init
```

When prompted:
- Style: New York
- Base color: Neutral
- CSS variables: Yes

This creates `components.json` and updates `globals.css` with CSS variables.

**Step 2: Install core components needed for auth**

```bash
pnpm dlx shadcn@latest add button input label card form separator alert badge
```

**Step 3: Verify build**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: initialize shadcn/ui with core components"
```

---

## Task 3: Supabase Client Utilities

**Files:**
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/client.ts`

**Step 1: Install Supabase SSR**

```bash
cd /Users/allenhe/Documents/propnest/apps/web
pnpm add @supabase/ssr @supabase/supabase-js
```

**Step 2: Create server client utility**

`apps/web/src/lib/supabase/server.ts`:
```typescript
import { createServerClient as _createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();

  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    },
  );
}
```

**Step 3: Create browser client utility**

`apps/web/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return client;
}
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/supabase/
git commit -m "feat: add Supabase server and browser client utilities"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `apps/web/src/middleware.ts`

**Step 1: Create middleware**

`apps/web/src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/login', '/signup', '/forgot-password', '/accept-invite', '/auth/callback'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — IMPORTANT: don't remove this
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isPublicPath && pathname !== '/accept-invite') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**Step 2: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat: add Supabase auth middleware with route protection"
```

---

## Task 5: Auth Layout + Login Page

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/(auth)/login/page.tsx`

**Step 1: Create auth layout**

`apps/web/src/app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

**Step 2: Create login page**

`apps/web/src/app/(auth)/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email first');
      return;
    }
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  if (magicLinkSent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a sign-in link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="ghost" className="w-full" onClick={() => setMagicLinkSent(false)}>
            Back to login
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to PropNest</CardTitle>
        <CardDescription>Manage your properties, tenants, and payments</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="relative my-4">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <Button variant="outline" className="w-full" onClick={handleMagicLink} disabled={loading}>
          Sign in with magic link
        </Button>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Link href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
          Forgot your password?
        </Link>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/\(auth\)/
git commit -m "feat: add auth layout and login page with password + magic link"
```

---

## Task 6: Signup Page

**Files:**
- Create: `apps/web/src/app/(auth)/signup/page.tsx`

**Step 1: Create signup page**

`apps/web/src/app/(auth)/signup/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite_token');
  const supabase = getSupabaseBrowserClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: inviteToken
          ? `${window.location.origin}/auth/callback?invite_token=${inviteToken}`
          : `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If there's an invite token, redirect to accept it
    if (inviteToken) {
      router.push(`/accept-invite?token=${inviteToken}`);
    } else {
      router.push('/');
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          {inviteToken ? 'Complete your account to accept the invitation' : 'Get started with PropNest'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(auth\)/signup/
git commit -m "feat: add signup page with invite token preservation"
```

---

## Task 7: Forgot Password Page

**Files:**
- Create: `apps/web/src/app/(auth)/forgot-password/page.tsx`

**Step 1: Create forgot password page**

`apps/web/src/app/(auth)/forgot-password/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ForgotPasswordPage() {
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a password reset link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="w-full">
            <Button variant="ghost" className="w-full">Back to login</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Link href="/login" className="text-sm text-muted-foreground hover:underline">
          Back to login
        </Link>
      </CardFooter>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(auth\)/forgot-password/
git commit -m "feat: add forgot password page"
```

---

## Task 8: Accept Invite Page

**Files:**
- Create: `apps/web/src/app/(auth)/accept-invite/page.tsx`

**Step 1: Create accept invite page**

`apps/web/src/app/(auth)/accept-invite/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const supabase = getSupabaseBrowserClient();
  const [status, setStatus] = useState<'loading' | 'accepted' | 'signup_required' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No invite token provided');
      return;
    }

    async function acceptInvite() {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/accept-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ token }),
        },
      );

      const body = await res.json();

      if (!res.ok) {
        setError(body.error || 'Failed to accept invite');
        setStatus('error');
        return;
      }

      if (body.action === 'signup_required') {
        setStatus('signup_required');
        return;
      }

      if (body.action === 'accepted') {
        setStatus('accepted');
        // Refresh session to pick up new permissions
        await supabase.auth.refreshSession();
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 2000);
      }
    }

    acceptInvite();
  }, [token, supabase, router]);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invite</CardTitle>
          <CardDescription>No invite token was provided.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accepting invite...</CardTitle>
          <CardDescription>Please wait while we process your invitation.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'signup_required') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create an account first</CardTitle>
          <CardDescription>You need to sign up before accepting this invite.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/signup?invite_token=${token}`}>
            <Button className="w-full">Create account</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (status === 'accepted') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite accepted!</CardTitle>
          <CardDescription>Redirecting you to the dashboard...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link href="/login" className="mt-4 block">
          <Button variant="ghost" className="w-full">Go to login</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(auth\)/accept-invite/
git commit -m "feat: add accept-invite page with Edge Function integration"
```

---

## Task 9: Auth Callback Route Handler

**Files:**
- Create: `apps/web/src/app/auth/callback/route.ts`

**Step 1: Create callback handler**

`apps/web/src/app/auth/callback/route.ts`:
```typescript
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const inviteToken = searchParams.get('invite_token');

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // If there's an invite token, redirect to accept it
      if (inviteToken) {
        return NextResponse.redirect(`${origin}/accept-invite?token=${inviteToken}`);
      }
      return NextResponse.redirect(origin);
    }
  }

  // Auth code error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/auth/
git commit -m "feat: add auth callback route handler for code exchange"
```

---

## Task 10: Dashboard Layout with Sidebar

**Files:**
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/components/sidebar.tsx`
- Create: `apps/web/src/components/header.tsx`

**Step 1: Create sidebar component**

`apps/web/src/components/sidebar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
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
          const isActive = pathname === item.href;
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

**Step 2: Create header component**

`apps/web/src/components/header.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  userName: string;
  userRole?: string;
}

export function Header({ userName, userRole }: HeaderProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-lg font-semibold">PropNest</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{userName}</span>
        {userRole && (
          <Badge variant="secondary" className="capitalize">
            {userRole}
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
```

**Step 3: Install lucide-react**

```bash
cd /Users/allenhe/Documents/propnest/apps/web
pnpm add lucide-react
```

**Step 4: Create dashboard layout**

`apps/web/src/app/(dashboard)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch org membership for role display
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, organizations(name)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single();

  const userName = user.user_metadata?.full_name || user.email || 'User';
  const userRole = membership?.role;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header userName={userName} userRole={userRole} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/ apps/web/src/components/
git commit -m "feat: add dashboard layout with sidebar and header"
```

---

## Task 11: Dashboard Home Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/page.tsx`
- Remove: `apps/web/src/app/page.tsx` (the default Next.js welcome page)

**Step 1: Remove default page**

Delete `apps/web/src/app/page.tsx` (the Next.js default welcome page). The `(dashboard)/page.tsx` will serve as the root page.

**Step 2: Create dashboard home**

`apps/web/src/app/(dashboard)/page.tsx`:
```tsx
import { createServerClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    .single();

  // Fetch tenant leases
  const { data: leases } = await supabase
    .from('lease_tenants')
    .select('lease_id, is_primary, leases(rent_amount, status, units(unit_number, properties(name)))')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null);

  // Check Stripe Connect status for owners
  let stripeConnected = false;
  if (membership?.role === 'owner') {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', (membership.organizations as any)?.slug)
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
              {(membership.organizations as any)?.name}
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
            {leases.map((lt: any) => (
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
```

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/ && git rm apps/web/src/app/page.tsx 2>/dev/null; git add -A apps/web/src/app/
git commit -m "feat: add dashboard home page with org and lease overview"
```

---

## Task 12: Verify Full Build & Manual Test

**Step 1: Typecheck**

```bash
cd /Users/allenhe/Documents/propnest/apps/web
pnpm build
```

Fix any type errors.

**Step 2: Create .env.local for local testing**

```bash
cd /Users/allenhe/Documents/propnest/apps/web
cp .env.local.example .env.local
# Edit .env.local with actual local Supabase values from `supabase status`
```

**Step 3: Start dev server and verify pages**

```bash
pnpm dev
```

- Visit http://localhost:3000 — should redirect to /login
- Visit http://localhost:3000/login — should show login form
- Visit http://localhost:3000/signup — should show signup form
- Visit http://localhost:3000/forgot-password — should show reset form

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build issues from full verification"
```

---

## Dependency Graph

```
Task 1 (Next.js scaffold)
  → Task 2 (shadcn/ui)
    → Task 3 (Supabase clients)
      → Task 4 (Middleware)
      → Task 5 (Login page)
      → Task 6 (Signup page)
      → Task 7 (Forgot password)
      → Task 8 (Accept invite)
      → Task 9 (Auth callback)
    → Task 10 (Dashboard layout)
      → Task 11 (Dashboard home)
        → Task 12 (Verify build)
```

**Sequential execution required** — each task builds on the previous.
