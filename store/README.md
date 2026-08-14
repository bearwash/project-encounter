# Store submission kit

App Store / Google Play への初回申請で使う、メタデータ・審査説明・プライバシー回答・画像の作業場所。
2026-08-14 時点の Apple / Google 公式要件に照合している。

## そのまま使えるもの

- `metadata/ja-JP/`: 日本語の商品ページ文案
- `privacy/`: App Privacy / Data safety の回答下書き
- `review/`: 審査担当者向け操作説明
- `iap/catalog.md`: 消耗型コインの商品台帳
- `checklists/submission.md`: 提出前チェックリスト
- `assets/`: アイコン、フィーチャーグラフィック、スクリーンショット

## 提出者の入力が必要なもの

次はリポジトリだけでは決められないため、`[TODO]` のままにしている。

1. 正式なアプリ名と運営者の法的名称
2. 公開サイト URL と、実在するサポートメールアドレス
3. Developer / Merchant の契約・税務・銀行情報
4. Apple / Google / Supabase の本番認証設定
5. コインの本番価格と販売地域
6. App Review の連絡先

配布ビルドでは少なくとも次を設定する。

```env
NEXT_PUBLIC_OPERATOR_NAME=
NEXT_PUBLIC_SUPPORT_EMAIL=
NEXT_PUBLIC_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_PURCHASE_API_URL=
NEXT_PUBLIC_ENABLE_TEST_LOGIN=0
NEXT_PUBLIC_ENABLE_TEST_PURCHASES=0
```

## 現在の提出ブロッカー

- StoreKit / Google Play Billing のネイティブ実装とサーバーレシート検証は接続境界まで。実決済は未接続。
- Sign in with Apple capability と Release 用 ATS 設定は、正式な App ID / 本番ドメイン確定後に生成プロジェクトへ適用する必要がある。
- `delete-account` Edge Function と公開Webページを本番へデプロイする必要がある。
- 通報を日常的に確認・対応する運用担当と公開連絡先が未設定。
- BLE、購入、ログイン、退会を iPhone / Android 実機のリリースビルドで再確認する必要がある。
- スクリーンショットは開発版の予備素材。提出時は署名済みリリースビルドから同じ構図で撮り直す。

このブロッカーを解消する前に「本番提出可」とは扱わない。
