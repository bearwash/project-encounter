import { createClient } from '@supabase/supabase-js';

export const SMOKE_SELECT_COLUMNS = 'id, display_name, avatar_code, message, home_prefecture';

export function createSmokeClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function formatSupabaseError(error) {
  if (!error) return 'unknown error';
  return `${error.code ?? error.name ?? 'error'} ${error.message ?? String(error)}`;
}

export async function expectSupabaseSuccess(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${formatSupabaseError(result.error)}`);
  }
  return result;
}

export async function expectSupabaseFailure(label, promise) {
  const result = await promise;
  if (!result.error) {
    throw new Error(`${label}: expected failure, got success`);
  }
  return result.error;
}

export async function signInAnonymous(label, client) {
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user?.id) {
    throw new Error(`${label}: anonymous sign-in failed: ${formatSupabaseError(error)}`);
  }
  return data.user.id;
}

export function resolveProfiles(client, ids) {
  return client
    .from('profiles')
    .select(SMOKE_SELECT_COLUMNS)
    .in('id', ids);
}

export function missingUserIds(requestedIds, rows) {
  const found = new Set((rows ?? []).map((row) => row.id));
  return [...new Set(requestedIds)].filter((id) => !found.has(id));
}

export function assertResolvedExactly(label, rows, expectedIds) {
  const actual = new Set((rows ?? []).map((row) => row.id));
  const expected = new Set(expectedIds);

  if (actual.size !== expected.size) {
    throw new Error(`${label}: expected ${expected.size} rows, got ${actual.size}`);
  }

  for (const id of expected) {
    if (!actual.has(id)) {
      throw new Error(`${label}: missing expected profile ${id}`);
    }
  }
}

export async function cleanupProfile(client, userId) {
  try {
    await client.from('profiles').delete().eq('id', userId);
  } catch {
    // Best effort cleanup for smoke-created data.
  }
}

export async function runSupabaseSmoke({ url, anonKey, randomUUID = crypto.randomUUID }) {
  const runId = randomUUID();
  const profile = {
    display_name: `Smoke${runId.slice(0, 5)}`,
    avatar_code: 'b01_h01_o01_f01',
    message: 'smoke',
    home_prefecture: null,
  };

  const alice = createSmokeClient(url, anonKey);
  const bob = createSmokeClient(url, anonKey);
  let aliceId;
  let bobId;

  try {
    aliceId = await signInAnonymous('alice', alice);
    bobId = await signInAnonymous('bob', bob);

    await expectSupabaseSuccess(
      'alice profile upsert',
      alice.from('profiles').upsert({
        id: aliceId,
        ...profile,
      }),
    );

    const ownResolve = await expectSupabaseSuccess(
      'alice resolves own profile',
      resolveProfiles(alice, [aliceId]),
    );
    assertResolvedExactly('alice own resolve', ownResolve.data, [aliceId]);

    const missingId = randomUUID();
    const publicResolve = await expectSupabaseSuccess(
      'bob resolves alice public profile',
      resolveProfiles(bob, [aliceId, missingId]),
    );
    assertResolvedExactly('bob public resolve', publicResolve.data, [aliceId]);
    const missing = missingUserIds([aliceId, missingId], publicResolve.data);
    if (missing.length !== 1 || missing[0] !== missingId) {
      throw new Error(`missing id calculation failed: ${JSON.stringify(missing)}`);
    }

    await expectSupabaseFailure(
      'bob cannot upsert alice profile',
      bob.from('profiles').upsert({
        id: aliceId,
        display_name: 'BadActor',
        avatar_code: 'b01_h01_o01_f01',
        message: 'blocked',
        home_prefecture: null,
      }),
    );

    await expectSupabaseFailure(
      'database rejects invalid profile shape',
      alice.from('profiles').upsert({
        id: aliceId,
        display_name: '',
        avatar_code: 'bad avatar code',
        message: 'x'.repeat(31),
        home_prefecture: '99',
      }),
    );

    await expectSupabaseSuccess(
      'alice deletes own profile',
      alice.from('profiles').delete().eq('id', aliceId),
    );

    const afterDelete = await expectSupabaseSuccess(
      'bob resolve after alice delete',
      resolveProfiles(bob, [aliceId]),
    );
    assertResolvedExactly('resolve after delete', afterDelete.data, []);

    return { aliceId, bobId };
  } finally {
    if (aliceId) await cleanupProfile(alice, aliceId);
    if (bobId) await cleanupProfile(bob, bobId);
    try {
      await alice.auth.signOut();
    } catch {}
    try {
      await bob.auth.signOut();
    } catch {}
  }
}
