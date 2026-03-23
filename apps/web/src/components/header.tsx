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
