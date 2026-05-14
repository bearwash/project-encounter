-- Migration 0002 — Profile Sync (Supabase 連携) 対応
-- Canonical: docs/contracts/db-schema.sql
-- spec: docs/specs/profile-sync.md
--
-- 変更点:
--   1. profile_sync_queue を新設 (オフライン時の自プロフィール送信キュー §5.3)
--   2. encounter_logs の users_cache への FK 削除
--      (fetch 未完了の user_id が encounter_logs に存在しうるため §4 / §5.5)
--   3. schema_version を 2 に更新
--   4. cloud_profile_consent_at は同意時に動的 INSERT する想定でデフォルト無し
--
-- SQLite は ALTER で FK を消せないので、テーブル再作成 (rename → recreate → copy → drop)。

PRAGMA foreign_keys = OFF;

-- 1) encounter_logs を FK 無しで作り直す
ALTER TABLE encounter_logs RENAME TO encounter_logs_old;

CREATE TABLE encounter_logs (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    encountered_user_id TEXT    NOT NULL,
    encountered_at      INTEGER NOT NULL,
    is_read             INTEGER NOT NULL DEFAULT 0
);

INSERT INTO encounter_logs (log_id, encountered_user_id, encountered_at, is_read)
SELECT log_id, encountered_user_id, encountered_at, is_read
FROM encounter_logs_old;

DROP TABLE encounter_logs_old;

CREATE INDEX IF NOT EXISTS idx_encounter_logs_unread
    ON encounter_logs (is_read, encountered_at);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_user_time
    ON encounter_logs (encountered_user_id, encountered_at DESC);

-- 2) profile_sync_queue を新設
CREATE TABLE IF NOT EXISTS profile_sync_queue (
    queue_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT    NOT NULL,
    avatar_code  TEXT    NOT NULL,
    message      TEXT    NOT NULL DEFAULT '',
    enqueued_at  INTEGER NOT NULL
);

-- 3) schema_version を 2 へ
UPDATE app_settings SET value = '2' WHERE key = 'schema_version';

PRAGMA foreign_keys = ON;
