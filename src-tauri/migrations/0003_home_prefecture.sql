-- Migration 0003 — 出身県 (home_prefecture) を任意項目として追加
-- Canonical: docs/contracts/db-schema.sql
-- spec: docs/specs/regional-map.md / docs/specs/profile.md §4.2
--
-- 変更点:
--   1. my_profile に home_prefecture TEXT (NULL 許容) を追加
--   2. users_cache に home_prefecture TEXT (NULL 許容) を追加
--   3. schema_version を 3 に更新
--
-- 既存ユーザーは NULL のまま (= 「未設定」)。日本地図ビューには出ない。

ALTER TABLE my_profile ADD COLUMN home_prefecture TEXT;
ALTER TABLE users_cache ADD COLUMN home_prefecture TEXT;
ALTER TABLE profile_sync_queue ADD COLUMN home_prefecture TEXT;

UPDATE app_settings SET value = '3' WHERE key = 'schema_version';
