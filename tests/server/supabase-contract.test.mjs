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

test('Supabase contract keeps encounter history off the cloud', () => {
  const contract = loadSupabaseContract();
  const failures = checkSupabaseContract(contract);

  assert.deepEqual(failures, []);
  assert.match(contract.schema, /CREATE TABLE IF NOT EXISTS public\.profiles/i);
  assert.match(contract.schema, /CREATE TABLE IF NOT EXISTS public\.content_reports/i);
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
  // 制約は追加後に VALIDATE して有効化される (NOT VALID のまま放置しない)
  assert.match(schema, /VALIDATE CONSTRAINT/);
  assert.match(schema, /profiles_avatar_code_valid/);
  // avatar_code は b{NN}_h{NN}_o{NN}_f{NN} の構造化パターン (将来の軸も許容)
  assert.match(schema, /avatar_code ~ '\^\[a-z\]\[0-9\]\{2\}\(_\[a-z\]\[0-9\]\{2\}\)\*\$'/);
  assert.match(schema, /profiles_message_valid/);
  assert.match(schema, /char_length\(message\) <= 30/);
  assert.match(schema, /profiles_home_prefecture_valid/);
  assert.match(schema, /home_prefecture ~ '\^\(0\[1-9\]\|\[1-3\]\[0-9\]\|4\[0-7\]\)\$'/);
  assert.match(schema, /profiles_public_text_safe/);
  assert.match(schema, /https\?:\/\//);
  assert.match(schema, /content_reports_insert_self/);
});

test('Server API contract does not expose encounter upload endpoints', () => {
  const { api } = loadSupabaseContract();
  const goalsOnly = api.replace(/## 6\. Non-Goals[\s\S]*/u, '');

  assert.match(api, /POST \/v1\/profiles\/resolve/);
  assert.match(api, /PUT \/v1\/me\/profile/);
  assert.match(api, /DELETE \/v1\/me\/profile/);
  assert.match(api, /POST \/v1\/purchases\/verify/);
  assert.match(api, /GET \/v1\/wallet/);
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
