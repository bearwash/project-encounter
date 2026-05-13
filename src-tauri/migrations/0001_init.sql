-- Initial schema.
-- Canonical specification: docs/contracts/db-schema.sql
-- 仕様変更時は両方を同期すること。

CREATE TABLE IF NOT EXISTS my_profile (
    user_id       TEXT    PRIMARY KEY NOT NULL,
    display_name  TEXT    NOT NULL,
    avatar_code   TEXT    NOT NULL,
    message       TEXT    NOT NULL DEFAULT '',
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users_cache (
    user_id          TEXT    PRIMARY KEY NOT NULL,
    display_name     TEXT    NOT NULL,
    avatar_code      TEXT    NOT NULL,
    message          TEXT    NOT NULL DEFAULT '',
    encounter_count  INTEGER NOT NULL DEFAULT 0,
    first_seen_at    INTEGER NOT NULL,
    last_seen_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_cache_last_seen
    ON users_cache (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS encounter_logs (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    encountered_user_id TEXT    NOT NULL,
    encountered_at      INTEGER NOT NULL,
    is_read             INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (encountered_user_id)
        REFERENCES users_cache (user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_unread
    ON encounter_logs (is_read, encountered_at);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_user_time
    ON encounter_logs (encountered_user_id, encountered_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY NOT NULL,
    value  TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
    ('cooldown_sec', '28800'),
    ('schema_version', '1');
