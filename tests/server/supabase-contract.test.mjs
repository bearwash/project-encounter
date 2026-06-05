import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSupabaseContract,
  loadSupabaseContract,
} from '../../scripts/lib/supabase-contract.mjs';
import {
  assertResolvedExactly,
  missingUserIds,
} from '../../scripts/lib/supabase-live-smoke.mjs';

test('Supabase contract keeps profiles as the only cloud data model', () => {
  const contract = loadSupabaseContract();
  const failures = checkSupabaseContract(contract);

  assert.deepEqual(failures, []);
  assert.match(contract.schema, /CREATE TABLE IF NOT EXISTS public\.profiles/i);
  assert.doesNotMatch(
    contract.schema,
    /CREATE TABLE IF NOT EXISTS public\.(encounter|encounter_logs|encounters)\b/i,
  );
});

test('Supabase contract enforces profile validation at the database boundary', () => {
  const { schema } = loadSupabaseContract();

  assert.match(schema, /profiles_display_name_valid/);
  assert.match(schema, /char_length\(btrim\(display_name\)\) BETWEEN 1 AND 16/);
  assert.match(schema, /NOT VALID/);
  assert.match(schema, /conrelid = 'public\.profiles'::regclass/);
  assert.match(schema, /profiles_avatar_code_valid/);
  assert.match(schema, /avatar_code ~ '\^\[A-Za-z0-9_-\]\+\$'/);
  assert.match(schema, /profiles_message_valid/);
  assert.match(schema, /char_length\(message\) <= 30/);
  assert.match(schema, /profiles_home_prefecture_valid/);
  assert.match(schema, /home_prefecture ~ '\^\(0\[1-9\]\|\[1-3\]\[0-9\]\|4\[0-7\]\)\$'/);
});

test('Server API contract does not expose encounter upload endpoints', () => {
  const { api } = loadSupabaseContract();
  const goalsOnly = api.replace(/## 6\. Non-Goals[\s\S]*/u, '');

  assert.match(api, /POST \/v1\/profiles\/resolve/);
  assert.match(api, /PUT \/v1\/me\/profile/);
  assert.match(api, /DELETE \/v1\/me\/profile/);
  assert.doesNotMatch(goalsOnly, /\/encounters?/);
});

test('Live smoke helper computes missing ids without persisting encounter history', () => {
  const requested = ['user-a', 'user-b', 'user-a', 'user-c'];
  const rows = [{ id: 'user-a' }, { id: 'user-c' }];

  assert.deepEqual(missingUserIds(requested, rows), ['user-b']);
});

test('Live smoke helper rejects unexpected profile resolution results', () => {
  assert.doesNotThrow(() => {
    assertResolvedExactly('ok', [{ id: 'user-a' }], ['user-a']);
  });

  assert.throws(() => {
    assertResolvedExactly('missing', [], ['user-a']);
  }, /expected 1 rows, got 0/);

  assert.throws(() => {
    assertResolvedExactly('extra', [{ id: 'user-a' }, { id: 'user-b' }], ['user-a']);
  }, /expected 1 rows, got 2/);
});
