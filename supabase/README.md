# Supabase Deployment

Project Encounter の MVP サーバーサイドは Supabase 直結で運用する。

## 初回セットアップ

1. Supabase project を作成する。
2. Authentication > Providers > Anonymous Sign-ins を有効化する。
3. SQL Editor で [`../docs/contracts/supabase-schema.sql`](../docs/contracts/supabase-schema.sql) を実行する。
4. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定する。

## ローカル検査

```bash
pnpm server:preflight
```

検査内容:

- Supabase 契約ファイルの静的検査
- Node test による契約テスト
- TypeScript 型チェック
- ESLint

## 実プロジェクト疎通

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... pnpm server:smoke
```

`server:smoke` は次を実行する。

- anonymous sign-in
- 自プロフィール upsert
- 他ユーザーからの公開プロフィール resolve
- 他ユーザー行への upsert が RLS で拒否されること
- 不正プロフィールが DB constraint で拒否されること
- delete 後に resolve から消えること

すれ違い履歴は送信しない。
