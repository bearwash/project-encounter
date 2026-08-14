# Submission checklist

Verified against official requirements on 2026-08-14.

## Shared release gate

- [ ] 正式名称、法的運営者名、著作権、商標検索を確定
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` と公開サイトを実在する値で設定
- [ ] `/legal/privacy`、`/legal/terms`、`/support`、`/account/delete` を HTTPS 公開
- [ ] Supabase Apple / Google / Email providers と redirect URL を本番設定
- [ ] `delete-account` Edge Function を deploy し、実アカウントで削除確認
- [ ] 通報 inbox、担当者、対応記録、緊急エスカレーションを運用開始
- [ ] StoreKit / Play Billing とサーバーレシート検証を接続
- [ ] `NEXT_PUBLIC_ENABLE_TEST_LOGIN=0`、`NEXT_PUBLIC_ENABLE_TEST_PURCHASES=0`
- [ ] 本番依存関係を含めた privacy / Data safety 最終監査
- [ ] iPhone 2台 / Android 2台 / OS最新版で BLE 相互検出
- [ ] ログイン、購入、復元、返金後残高、退会、オフラインを実機確認
- [ ] `pnpm build`, `pnpm server:preflight`, `cargo check` が成功

## App Store Connect

- [ ] Apple Developer Program enrollment / Agreements, Tax, Banking
- [ ] App record: name, bundle ID, SKU, primary language
- [ ] iOS build is made with iOS 26 SDK or later（2026-04-28以降の要件）
- [ ] App name / subtitle 30文字以内、description 4,000文字以内、keywords 100 bytes以内
- [ ] Privacy policy URL、App Privacy answers、age rating、category
- [ ] Support URL、copyright、review contact、review notes
- [ ] Sign in with Apple capability / entitlement / redirect を実機確認
- [ ] Release Info.plist から `NSAllowsArbitraryLoads` と開発用 Local Network 文言を除去
- [ ] 6.9-inch screenshot 1〜10枚、PNG/JPEG、alphaなし
- [ ] 1024 × 1024 app icon、alphaなし
- [ ] Consumable IAP metadata、availability、price、review screenshot / notes
- [ ] 初回 Consumable をアプリバージョンと一緒に Add for Review
- [ ] アプリ内 account deletion と UGC filter/report/block を審査手順に記載
- [ ] Accessibility Nutrition Labels は実測した項目だけ回答
- [ ] Export compliance / encryption 質問を実装に即して回答

Official references:

- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/
- https://developer.apple.com/app-store/submitting/

## Google Play Console

- [ ] Developer account verification / merchant profile / tax settings
- [ ] App record, app or game, free/paid declaration, category, contact details
- [ ] App name 30文字、short description 80文字、full description 4,000文字以内
- [ ] 512 × 512 icon、1024 × 500 feature graphic
- [ ] 最低2枚のphone screenshot。推奨要件として 1080 × 1920 を4枚以上
- [ ] Privacy policy URL と Data safety form
- [ ] Account deletion web URL（アプリを再インストールせず依頼可能）
- [ ] Ads declaration, content rating, target audience, news / health等の該当性
- [ ] App access に固定審査アカウントと手順を登録
- [ ] UGC規約同意、投稿前フィルタ、通報、ブロックを実機確認
- [ ] targetSdk が最新 major Android release から1年以内（現在 app targetSdk 36）
- [ ] Foreground service / Nearby devices / notification permissions declarations
- [ ] `com.android.vending.BILLING` と Play Billing 接続後、3商品を activate
- [ ] Android project 再生成後も canonical Manifest snippet（BLE / FGS / Billing）が入っていることを確認
- [ ] Android App Bundle (AAB)、Play App Signing、release integrity checks
- [ ] 個人開発者アカウントが 2023-11-13 以降作成なら、12人・連続14日以上の closed test

Official references:

- https://support.google.com/googleplay/android-developer/answer/9859152
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://support.google.com/googleplay/android-developer/answer/12923286
- https://support.google.com/googleplay/android-developer/answer/16561298
- https://support.google.com/googleplay/android-developer/answer/14151465
