-- =====================================================================
-- Project Encounter — Local SQLite Schema
-- 要件定義 §5 / specs/profile.md / specs/ble-handshake.md 準拠
--
-- 全データは端末ローカルに閉じる。中央サーバーは介在しない。
-- マイグレーションは src-tauri/migrations/ にバージョン付きで配置する。
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- my_profile : 自分自身のプロフィール（常に 1 行のみ）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS my_profile (
    user_id       TEXT    PRIMARY KEY NOT NULL,    -- UUID v4
    display_name  TEXT    NOT NULL,
    avatar_code   TEXT    NOT NULL,
    message       TEXT    NOT NULL DEFAULT '',
    updated_at    INTEGER NOT NULL                  -- Unix epoch (sec)
);

-- ---------------------------------------------------------------------
-- users_cache : すれ違った相手のプロフィール（最新値で上書き）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_cache (
    user_id          TEXT    PRIMARY KEY NOT NULL,
    display_name     TEXT    NOT NULL,
    avatar_code      TEXT    NOT NULL,
    message          TEXT    NOT NULL DEFAULT '',
    encounter_count  INTEGER NOT NULL DEFAULT 0,
    first_seen_at    INTEGER NOT NULL,             -- Unix epoch (sec)
    last_seen_at     INTEGER NOT NULL              -- Unix epoch (sec)
);

CREATE INDEX IF NOT EXISTS idx_users_cache_last_seen
    ON users_cache (last_seen_at DESC);

-- ---------------------------------------------------------------------
-- encounter_logs : すれ違いのトランザクション履歴
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encounter_logs (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    encountered_user_id TEXT    NOT NULL,
    encountered_at      INTEGER NOT NULL,          -- Unix epoch (sec)
    is_read             INTEGER NOT NULL DEFAULT 0,-- 0=未読, 1=既読
    FOREIGN KEY (encountered_user_id)
        REFERENCES users_cache (user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_unread
    ON encounter_logs (is_read, encountered_at);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_user_time
    ON encounter_logs (encountered_user_id, encountered_at DESC);

-- ---------------------------------------------------------------------
-- app_settings : 動作パラメータ（クールダウン秒数など）
--   Key-Value で保持。本番値とテスト値の切替に使用。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY NOT NULL,
    value  TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
    ('cooldown_sec',       '28800'),   -- 8 時間
    ('schema_version',     '1');
