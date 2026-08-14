-- =====================================================================
-- Project Encounter — Supabase (Postgres) Schema
-- spec: docs/specs/profile-sync.md §5.1
--
-- 役割:
--   - 公開プロフィール (display_name / avatar_code / message) の名簿
--   - すれ違い履歴は一切持たない (履歴は端末ローカル SQLite)
--   - 認証済みのみ SELECT 可 (RLS でスクレイピング防止)
--   - 自分の行のみ INSERT / UPDATE / DELETE 可
--
-- デプロイ:
--   Supabase Studio の SQL Editor で実行するか、`supabase db push` で適用する。
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name    TEXT    NOT NULL,
    avatar_code     TEXT    NOT NULL,
    message         TEXT,
    home_prefecture TEXT,                                            -- ISO 3166-2:JP 下 2 桁 ("01"〜"47") or NULL=非公開。spec: regional-map.md
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 既存テーブルへの後付け列追加 (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_prefecture TEXT;

-- クライアント validation と同じ公開プロフィール制約。
-- 毎回 DROP → 再追加することで定義ドリフト (例: avatar_code の形式変更) を確実に反映する。
-- NOT VALID で追加して既存の汚れた行によるデプロイ失敗を避けつつ、
-- 直後に VALIDATE を試行する (綺麗なら有効化、汚れた行があれば WARNING を出して継続)。
-- avatar_code は b{NN}_h{NN}_o{NN}_f{NN} 構造 (軸文字+2桁を _ 連結。将来の軸も許容)。
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_valid;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_code_valid;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_message_valid;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_home_prefecture_valid;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_public_text_safe;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_display_name_valid
    CHECK (
        char_length(btrim(display_name)) BETWEEN 1 AND 16
        AND display_name !~ '[[:cntrl:]]'
    ) NOT VALID;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_avatar_code_valid
    CHECK (
        char_length(avatar_code) BETWEEN 1 AND 64
        AND avatar_code ~ '^[a-z][0-9]{2}(_[a-z][0-9]{2})*$'
    ) NOT VALID;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_message_valid
    CHECK (
        message IS NULL
        OR (
            char_length(message) <= 30
            AND message !~ '[[:cntrl:]]'
        )
    ) NOT VALID;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_home_prefecture_valid
    CHECK (
        home_prefecture IS NULL
        OR home_prefecture ~ '^(0[1-9]|[1-3][0-9]|4[0-7])$'
    ) NOT VALID;

-- 公開欄への連絡先・URL・代表的な不適切表現をサーバー側でも拒否する。
-- クライアントの即時フィードバックに加え、改変クライアントからの直接書き込みも防ぐ。
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_public_text_safe
    CHECK (
        lower(display_name || ' ' || COALESCE(message, '')) !~
        '(https?://|www[.]|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|([0-9][[:space:]-]?){9,}|line[[:space:]]*id|discord|fuck|shit|bitch|nigg|死ね|しね|殺す|ころす|レイプ|セックス|ポルノ|きもい|クソ)'
    ) NOT VALID;

-- 既存行を検証して制約を有効化する。汚れた行がある制約は NOT VALID のまま残し
-- WARNING を出す (デプロイは止めない。クリーンアップ後の再実行で有効化される)。
DO $$
DECLARE
    c text;
BEGIN
    FOREACH c IN ARRAY ARRAY[
        'profiles_display_name_valid',
        'profiles_avatar_code_valid',
        'profiles_message_valid',
        'profiles_home_prefecture_valid',
        'profiles_public_text_safe'
    ] LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.profiles VALIDATE CONSTRAINT %I', c);
        EXCEPTION WHEN check_violation THEN
            RAISE WARNING 'constraint % は不正な既存行があるため NOT VALID のまま。クリーンアップ後に再実行してください。', c;
        END;
    END LOOP;
END
$$;

-- 安全策: RLS を有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 参照: 認証済みユーザーは全行参照可 (anon は不可 = スクレイピング防止)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- 作成: 自分のレコードのみ
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- 更新: 自分のレコードのみ
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 削除: 自分のレコードのみ (退会)
DROP POLICY IF EXISTS "profiles_delete_self" ON public.profiles;
CREATE POLICY "profiles_delete_self"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (auth.uid() = id);

-- updated_at 自動更新トリガ (任意)
CREATE OR REPLACE FUNCTION public.profiles_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_touch_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_touch_updated_at();

-- 公開プロフィールの通報。一般クライアントは自分名義で INSERT だけでき、
-- 一覧参照・対応ステータス更新は運営者の service role / moderation tooling に限定する。
CREATE TABLE IF NOT EXISTS public.content_reports (
    id                    UUID PRIMARY KEY,
    reporter_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_user_id      UUID NOT NULL,
    display_name_snapshot TEXT NOT NULL,
    message_snapshot      TEXT NOT NULL DEFAULT '',
    reason                TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'open',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (char_length(display_name_snapshot) BETWEEN 1 AND 16),
    CHECK (char_length(message_snapshot) <= 30),
    CHECK (reason IN ('harassment', 'hate', 'sexual', 'personal_info', 'spam', 'other')),
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed'))
);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_reports_insert_self" ON public.content_reports;
CREATE POLICY "content_reports_insert_self"
    ON public.content_reports
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = reporter_id);
