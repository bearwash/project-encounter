import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import type { MyProfile } from '@/types/profile';
import { validateProfile, type ProfileInput } from './validation';

const QUERY_KEY = ['profile'] as const;

async function fetchProfile(): Promise<MyProfile | null> {
  try {
    const db = await getDb();
    const rows = await db.select<MyProfile[]>(
      'SELECT user_id, display_name, avatar_code, message, updated_at FROM my_profile LIMIT 1',
    );
    return rows[0] ?? null;
  } catch (e) {
    console.error('[profile.fetch] failed:', e);
    throw asError(e);
  }
}

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  try {
    return new Error(JSON.stringify(e));
  } catch {
    return new Error(String(e));
  }
}

async function saveProfile(input: ProfileInput): Promise<MyProfile> {
  const errors = validateProfile(input);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.field}: ${e.message}`).join('\n'));
  }

  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const existing = await fetchProfile();
    const userId = existing?.user_id ?? crypto.randomUUID();

    await db.execute(
      `INSERT INTO my_profile (user_id, display_name, avatar_code, message, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         avatar_code  = excluded.avatar_code,
         message      = excluded.message,
         updated_at   = excluded.updated_at`,
      [userId, input.display_name, input.avatar_code, input.message, now],
    );

    return {
      user_id: userId,
      display_name: input.display_name,
      avatar_code: input.avatar_code,
      message: input.message,
      updated_at: now,
    };
  } catch (e) {
    console.error('[profile.save] failed:', e);
    throw asError(e);
  }
}

export function useProfile() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProfile,
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveProfile,
    onSuccess: (saved) => {
      qc.setQueryData(QUERY_KEY, saved);
    },
  });
}

async function resetProfile(): Promise<void> {
  try {
    const db = await getDb();
    await db.execute('DELETE FROM my_profile');
  } catch (e) {
    console.error('[profile.reset] failed:', e);
    throw asError(e);
  }
}

export function useResetProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resetProfile,
    onSuccess: () => {
      qc.setQueryData(QUERY_KEY, null);
    },
  });
}
