# Account deletion deployment

## App / web route

`/account/delete` はゲストでも説明を読め、本人確認後に削除を完了する。同じ static export を公開 HTTPS サイトへ配信し、Google Play Data safety の deletion URL に登録する。

## Supabase Edge Function

```bash
supabase functions deploy delete-account
```

Supabase が自動提供する `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` を使う。service role は Edge Function 内だけで使用し、`NEXT_PUBLIC_*` へ置かない。

クライアントは既定で次を呼ぶ。

```text
[NEXT_PUBLIC_SUPABASE_URL]/functions/v1/delete-account
```

別 URL の gateway を使う場合だけ `NEXT_PUBLIC_ACCOUNT_DELETE_URL` を指定する。

## End-to-end check

1. 本番相当アカウントでプロフィールを作成
2. コイン・通報等の関連レコードを用意
3. Web deletion URL をログアウト状態で開けることを確認
4. 同じアカウントで本人確認
5. 「削除」と入力して実行
6. `auth.users` と `profiles` が消えていることを管理側で確認
7. 再ログイン不可、端末履歴・残高・進捗消去を確認
8. 購入サーバー接続後は wallet / entitlement の消去または法定保持への分離も確認
