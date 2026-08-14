-- Migration 0004 — タワー出撃権と開発用コイン台帳
-- Canonical: docs/contracts/db-schema.sql
-- specs: tower-quest.md / access-and-commerce.md

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tower_dispatches (
    encounter_log_id INTEGER PRIMARY KEY NOT NULL,
    user_id           TEXT    NOT NULL,
    dispatched_at     INTEGER NOT NULL,
    highest_floor     INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (encounter_log_id)
        REFERENCES encounter_logs (log_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tower_dispatches_user
    ON tower_dispatches (user_id, dispatched_at DESC);

CREATE TABLE IF NOT EXISTS dev_wallet_ledger (
    entry_id   TEXT    PRIMARY KEY NOT NULL,
    user_id    TEXT    NOT NULL,
    amount     INTEGER NOT NULL,
    reason     TEXT    NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dev_wallet_ledger_user
    ON dev_wallet_ledger (user_id, created_at DESC);

UPDATE app_settings SET value = '4' WHERE key = 'schema_version';
