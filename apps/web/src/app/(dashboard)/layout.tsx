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
