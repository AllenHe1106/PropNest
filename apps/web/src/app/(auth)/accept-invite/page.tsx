'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

function AcceptInviteContent() {
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
      try {
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
      } catch {
        setError('Unable to process invite. Please try again later.');
        setStatus('error');
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

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
        </Card>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
