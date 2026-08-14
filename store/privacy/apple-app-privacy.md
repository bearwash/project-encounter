# Apple App Privacy 回答下書き

2026-08-14 時点。実際に配布する SDK、ログ、購入サーバーを最終監査してから App Store Connect へ回答する。

## Tracking

- Tracking: **No**
- Third-party advertising: **No**
- Advertising identifier: **Not collected**

## Data linked to the user

| Apple data type | Collected | Purpose | Notes |
|---|---:|---|---|
| Contact Info → Email Address | Yes | App Functionality / Account Management | Apple・Google・メールログイン。Appleの非公開メールを含む |
| Identifiers → User ID | Yes | App Functionality / Account Management | Supabase Auth UUID |
| User Content → Other User Content | Yes | App Functionality | 表示名、一言、アバターコード、任意の都道府県。公開同意時のみ |
| Purchases → Purchase History | Yes（本番IAP接続後） | App Functionality / Fraud Prevention | 商品ID、取引ID、付与記録 |
| Other Data → Customer Support | 問い合わせ時のみ | Customer Support | 利用者が任意に送る問い合わせ内容・通報内容 |

## Not collected by the developer

- Precise / coarse location
- Contacts, photos, microphone, camera
- Payment card or bank details（Appleが処理し、運営者はアクセスしない）
- Advertising data
- Browsing or search history
- Health, fitness, sensitive or protected classification data

## Local-only data

Apple の「収集」は端末外へ送信されるデータを指す。次は端末内だけであり、通常は App Privacy の collection へ含めない。

- すれ違った相手の仮名 user ID と時刻
- すれ違い履歴、既読状態、タワー出撃消費
- 端末内ブロック一覧

通報した場合だけ、対象 user ID・表示名・一言のスナップショット・理由を moderation backend へ送る。

## Required URLs

- Privacy Policy: `[PUBLIC_SITE_URL]/legal/privacy`
- Privacy Choices / deletion: `[PUBLIC_SITE_URL]/account/delete`

## Final audit

- [ ] Supabase SDK の最新 privacy guidance を確認
- [ ] native IAP / crash reporting SDK を追加したら回答を更新
- [ ] サーバーログに保存する IP / diagnostics の期間と目的を確認
- [ ] 全プラットフォーム中、最も包括的な取り扱いを回答
