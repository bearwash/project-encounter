import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'DELETE, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'DELETE') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: '本人確認が必要です。' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[delete-account] missing Supabase environment');
    return json({ error: '削除サービスを利用できません。' }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error: userError } = await authClient.auth.getUser();
  if (userError || !data.user || data.user.is_anonymous) {
    return json({ error: '本人確認の有効期限が切れています。' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error('[delete-account] admin delete failed:', deleteError.message);
    return json({ error: 'アカウントを削除できませんでした。' }, 500);
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});

function json(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}
