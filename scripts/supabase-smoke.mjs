import { runSupabaseSmoke } from './lib/supabase-live-smoke.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!url || !anonKey) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.',
  );
  process.exit(1);
}

try {
  const { aliceId, bobId } = await runSupabaseSmoke({ url, anonKey });
  console.log(`Supabase smoke passed for users ${aliceId} and ${bobId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
