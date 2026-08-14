# Google Play Data safety 回答下書き

2026-08-14 時点。Play Console の質問文と本番 SDK を照合してから確定する。

## Overview

- Does the app collect or share required user data types? **Yes**
- Is all user data encrypted in transit? **Yes**（HTTPS/TLS。BLE payload は仮名 user ID のみ）
- Can users request deletion? **Yes**
- Deletion URL: `[PUBLIC_SITE_URL]/account/delete`
- Data sold or shared for advertising: **No**

## Collected data

| Category / type | Collected | Required? | Purpose | Processing |
|---|---:|---|---|---|
| Personal info → Name | Yes | Optional | App functionality | 表示名 |
| Personal info → Email address | Yes | Loginを選ぶと必要 | Account management | 認証 |
| App info and performance → User IDs | Yes | Login機能では必要 | App functionality / Fraud prevention | Auth UUID |
| Messages → Other in-app messages | Yes | Optional | App functionality / Safety | 一言、通報スナップショット |
| Financial info → Purchase history | 本番IAP接続後 Yes | 購入時のみ | Purchase / Fraud prevention | 商品・取引・付与記録 |
| App activity → Other user-generated content | Yes | Optional | App functionality / Safety | アバター設定、通報理由 |

Google Play が「Purchase history」を Financial info ではなく別項目として提示する場合は、Console 表示に合わせて選ぶ。

## Not collected

- Approximate or precise location
- Contacts, photos, videos, audio, files
- Health and fitness
- Web browsing or search history
- Device advertising ID

OS またはネットワーク事業者が IP から概算地域を推定し、それをアプリ運営者が保存・利用する構成へ変更した場合は Location 回答を更新する。

## Sharing

Supabase、Apple、Googleへの処理委託は、Google Play の service-provider exception に該当するかを契約と実装に基づき最終確認する。広告、データブローカー、第三者マーケティングへの共有はない。

## Security / deletion

- [x] アプリ内のアカウント削除導線
- [x] アプリ外から使えるWeb削除導線
- [x] ローカル履歴を同時消去
- [ ] `delete-account` Edge Function を本番へデプロイ
- [ ] 購入サーバー接続後、ウォレットと法定保持データの削除処理を結合
- [ ] 公開URLを Play Console から到達確認
