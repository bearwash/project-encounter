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
    id           UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT    NOT NULL,
    avatar_code  TEXT    NOT NULL,
    message      TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
