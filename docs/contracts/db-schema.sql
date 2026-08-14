-- =====================================================================
-- Project Encounter — Local SQLite Schema
-- 要件定義 §5 / specs/profile.md / specs/ble-handshake.md / specs/profile-sync.md 準拠
--
-- 役割分担:
--   - すれ違い履歴 (誰といつ会ったか) は端末ローカルに閉じる。クラウドへ送信しない。
--   - 公開プロフィール (display_name / avatar_code / message) は Supabase の `profiles` テーブルに置き、
--     起動時に未取得 user_id を一括 fetch して users_cache に UPSERT する。
--   - したがって users_cache は「Supabase profiles から fetch したプロフィールキャッシュ」、
--     encounter_logs は「ID と時刻の事実」のみを保持する独立したテーブル。
--
-- マイグレーションは src-tauri/migrations/ にバージョン付きで配置する。
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- my_profile : 自分自身のプロフィール（常に 1 行のみ）
--   user_id は Supabase Auth で発行された UUID をそのまま採用し、不変。
--   BLE Advertise の Service Data には この UUID をバイナリ 16 byte で送出する。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS my_profile (
    user_id          TEXT    PRIMARY KEY NOT NULL, -- Supabase Auth UUID (36 文字 文字列形式)
    display_name     TEXT    NOT NULL,
    avatar_code      TEXT    NOT NULL,             -- b{NN}_h{NN}_o{NN}_f{NN} (15 文字)
    message          TEXT    NOT NULL DEFAULT '',
    home_prefecture  TEXT,                         -- ISO 3166-2:JP 下 2 桁 ("01"〜"47")。NULL=未設定。spec: regional-map.md
    updated_at       INTEGER NOT NULL              -- Unix epoch (sec)
);

-- ---------------------------------------------------------------------
-- users_cache : Supabase profiles から fetch した相手プロフィールのキャッシュ
--   - BLE 受信時には書き込まない（BLE は user_id しか知らない）。
--   - profile-sync.md §5.4 の一括 fetch 完了時に UPSERT する。
--   - encounter_logs と FK 関係は持たない（fetch 未完了の user_id が encounter_logs に存在し得る）。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_cache (
    user_id          TEXT    PRIMARY KEY NOT NULL,  -- Supabase Auth UUID (相手の)
    display_name     TEXT    NOT NULL,
    avatar_code      TEXT    NOT NULL,              -- b{NN}_h{NN}_o{NN}_f{NN}
    message          TEXT    NOT NULL DEFAULT '',
    home_prefecture  TEXT,                          -- "01"〜"47" or NULL=未設定。spec: regional-map.md
    encounter_count  INTEGER NOT NULL DEFAULT 0,    -- encounter_logs を集計した結果（fetch 時に再計算）
    first_seen_at    INTEGER NOT NULL,              -- Unix epoch (sec)
    last_seen_at     INTEGER NOT NULL               -- Unix epoch (sec)
);

CREATE INDEX IF NOT EXISTS idx_users_cache_last_seen
    ON users_cache (last_seen_at DESC);

-- ---------------------------------------------------------------------
-- encounter_logs : すれ違いのトランザクション履歴
--   - BLE で user_id を受信した瞬間に 1 行 insert される（クールダウン制御の上で）。
--   - users_cache への FK は持たない（fetch 未完了でも履歴は事実として残す）。
--   - is_read = 0 かつ users_cache に対応行が存在するものだけ、対面挨拶ポップアップに表示される
--     （encounter-popup.md §5.1 の「未取得は表示しない」ポリシー）。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encounter_logs (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    encountered_user_id TEXT    NOT NULL,           -- 相手の Supabase Auth UUID
    encountered_at      INTEGER NOT NULL,           -- Unix epoch (sec)
    is_read             INTEGER NOT NULL DEFAULT 0  -- 0=未読, 1=既読
);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_unread
    ON encounter_logs (is_read, encountered_at);

CREATE INDEX IF NOT EXISTS idx_encounter_logs_user_time
    ON encounter_logs (encountered_user_id, encountered_at DESC);

-- ---------------------------------------------------------------------
-- tower_dispatches : タワーで消費済みのすれ違いログ
--   - encounter_logs の 1 行 = 出撃権 1 回。PRIMARY KEY で二重消費を防ぐ。
--   - 同じ相手と複数回会った場合も log_id が別なので、それぞれ 1 回使える。
--   - すれ違い履歴をテスト用に削除した場合は、対応する消費記録も削除する。
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- dev_wallet_ledger : 開発・審査検証専用の 0 円コイン台帳
--   本番 IAP の残高はサーバー側を正とし、このテーブルへ混在させない。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dev_wallet_ledger (
    entry_id   TEXT    PRIMARY KEY NOT NULL,
    user_id    TEXT    NOT NULL,
    amount     INTEGER NOT NULL,
    reason     TEXT    NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dev_wallet_ledger_user
    ON dev_wallet_ledger (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- blocked_users / content_reports : 公開プロフィールの安全機能
--   ブロックは端末内で即時反映し、相手を挨拶・広場・タワーから除外する。
--   通報はまずローカルへ記録し、認証・通信可能なら moderation backend へ送る。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_users (
    user_id    TEXT    PRIMARY KEY NOT NULL,
    blocked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS content_reports (
    report_id            TEXT    PRIMARY KEY NOT NULL,
    reporter_id          TEXT    NOT NULL,
    reported_user_id     TEXT    NOT NULL,
    display_name_snapshot TEXT   NOT NULL,
    message_snapshot     TEXT    NOT NULL DEFAULT '',
    reason               TEXT    NOT NULL,
    status               TEXT    NOT NULL DEFAULT 'pending',
    created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
    ON content_reports (status, created_at);

-- ---------------------------------------------------------------------
-- profile_sync_queue : Supabase へ未送信のプロフィール変更（オフライン時の保留）
--   - 自プロフィール保存ボタン押下時、ネットワーク不可なら 1 行 enqueue する。
--   - オンライン復帰時に最新行 1 件だけ送信し、それ以前のキューは破棄する。
--   - 設計詳細: profile-sync.md §5.3
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile_sync_queue (
    queue_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name     TEXT    NOT NULL,
    avatar_code      TEXT    NOT NULL,
    message          TEXT    NOT NULL DEFAULT '',
    home_prefecture  TEXT,                              -- "01"〜"47" or NULL=未設定
    enqueued_at      INTEGER NOT NULL                   -- Unix epoch (sec)
);

-- ---------------------------------------------------------------------
-- app_settings : 動作パラメータ（Key-Value）
--   - cooldown_sec: クールダウン秒数（本番値 / テスト値の切替）
--   - schema_version: マイグレーション管理
--   - cloud_profile_consent_at: 公開同意ダイアログを承認した時刻（profile-sync.md §5.7）。
--     未設定なら BLE / Supabase 機能はオフ。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY NOT NULL,
    value  TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
    ('cooldown_sec',       '28800'),   -- 8 時間
    ('schema_version',     '5');
-- last_session_opened_at: 直近のアプリ起動時刻 (Unix epoch sec)。spec: encounter-popup.md §4.3
-- cloud_profile_consent_at は同意時に Tauri 側から動的に INSERT する（デフォルトなし）。
-- profile_fetch_retry_after / profile_fetch_retry_attempt:
--   未取得 user_id のプロフィール fetch バックオフ状態。spec: profile-sync.md §5.5
