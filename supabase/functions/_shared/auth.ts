import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function getAuthenticatedUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return null;

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;

  return user;
}

export async function requireOrgOwner(userId: string, organizationId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('role', 'owner')
    .not('accepted_at', 'is', null)
    .single();
  return !!data;
}

export async function requireOrgMember(userId: string, organizationId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single();
  return !!data;
}
