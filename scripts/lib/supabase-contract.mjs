import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadSupabaseContract(root = process.cwd()) {
  return {
    schema: readFileSync(resolve(root, 'docs/contracts/supabase-schema.sql'), 'utf8'),
    api: readFileSync(resolve(root, 'docs/contracts/server-api.md'), 'utf8'),
    spec: readFileSync(resolve(root, 'docs/specs/server-side.md'), 'utf8'),
    envExample: readFileSync(resolve(root, '.env.example'), 'utf8'),
  };
}

export function checkSupabaseContract(contract) {
  const { schema, api, spec, envExample } = contract;
  const failures = [];

  function must(name, ok) {
    if (!ok) failures.push(name);
  }

  function includesAll(source, values) {
    return values.every((value) => source.includes(value));
  }

  must('profiles table exists', /CREATE TABLE IF NOT EXISTS public\.profiles/i.test(schema));
  must('profiles references auth.users with cascade delete', /REFERENCES auth\.users\(id\) ON DELETE CASCADE/i.test(schema));
  must('RLS is enabled', /ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/i.test(schema));

  must(
    'RLS policies exist',
    includesAll(schema, [
      'profiles_select_authenticated',
      'profiles_insert_self',
      'profiles_update_self',
      'profiles_delete_self',
    ]),
  );

  must(
    'self-write policies use auth.uid() = id',
    (schema.match(/auth\.uid\(\) = id/g) ?? []).length >= 4,
  );

  must(
    'profile validation constraints exist',
    includesAll(schema, [
      'profiles_display_name_valid',
      'profiles_avatar_code_valid',
      'profiles_message_valid',
      'profiles_home_prefecture_valid',
    ]),
  );

  must('display_name max matches client', /BETWEEN 1 AND 16/.test(schema));
  must('avatar_code max matches client', /BETWEEN 1 AND 64/.test(schema));
  must(
    'avatar_code uses structured axis pattern',
    /\^\[a-z\]\[0-9\]\{2\}\(_\[a-z\]\[0-9\]\{2\}\)\*\$/.test(schema),
  );
  must('message max matches client', /char_length\(message\) <= 30/.test(schema));
  must('home_prefecture allows 01-47', /\^\(0\[1-9\]\|\[1-3\]\[0-9\]\|4\[0-7\]\)\$/.test(schema));

  must('validation constraints are validated, not left NOT VALID', /VALIDATE CONSTRAINT/.test(schema));

  must(
    'schema does not define encounter storage',
    !/CREATE TABLE IF NOT EXISTS public\.(encounter|encounter_logs|encounters)\b/i.test(schema),
  );

  must(
    'server API avoids encounter endpoints',
    includesAll(api, ['POST /v1/profiles/resolve', 'PUT /v1/me/profile', 'DELETE /v1/me/profile'])
      && !/POST \/encounters|GET \/encounters/.test(api.replace(/## 6\. Non-Goals[\s\S]*/u, '')),
  );

  must(
    'server spec states encounter history is not uploaded',
    includesAll(spec, ['すれ違い履歴はアップロードしない', '保存しないデータ']),
  );

  must(
    '.env.example documents Supabase public env vars',
    includesAll(envExample, ['NEXT_PUBLIC_SUPABASE_URL=', 'NEXT_PUBLIC_SUPABASE_ANON_KEY=']),
  );

  return failures;
}
