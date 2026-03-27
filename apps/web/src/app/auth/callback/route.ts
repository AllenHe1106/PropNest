import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const inviteToken = searchParams.get('invite_token');

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Password recovery — redirect to set new password
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      // If there's an invite token, redirect to accept it
      if (inviteToken) {
        return NextResponse.redirect(
          `${origin}/accept-invite?token=${inviteToken}`,
        );
      }
      return NextResponse.redirect(origin);
    }
  }

  // Auth code error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
