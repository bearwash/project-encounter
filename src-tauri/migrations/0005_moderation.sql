-- Migration 0005 — 公開プロフィールの通報・ブロック
-- Canonical: docs/contracts/db-schema.sql

CREATE TABLE IF NOT EXISTS blocked_users (
    user_id    TEXT    PRIMARY KEY NOT NULL,
    blocked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS content_reports (
    report_id             TEXT    PRIMARY KEY NOT NULL,
    reporter_id           TEXT    NOT NULL,
    reported_user_id      TEXT    NOT NULL,
    display_name_snapshot TEXT    NOT NULL,
    message_snapshot      TEXT    NOT NULL DEFAULT '',
    reason                TEXT    NOT NULL,
    status                TEXT    NOT NULL DEFAULT 'pending',
    created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
    ON content_reports (status, created_at);

UPDATE app_settings SET value = '5' WHERE key = 'schema_version';
