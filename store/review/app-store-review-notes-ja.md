# App Review notes — draft

> `[TODO]` を埋め、テスト購入を無効化した署名済みリリースビルドで手順を再確認してから貼り付ける。

Project Encounter は、Bluetooth Low Energy により近くの同アプリ利用者の仮名 user ID を検出し、端末内だけにすれ違い履歴を保存するアバターアプリです。GPSや位置情報 API は使用しません。

## Review flow

1. 初回起動ではログインせず「BEGIN」を選べます。
2. タワーまたは工房を選ぶとログイン案内が表示されます。
3. Appleでサインイン、Google、またはメールリンクでログインできます。
4. 工房ではコミュニティルールへ同意後、名前・一言・見た目を保存できます。
5. タワーでは、すれ違いログ1件につき仲間を1回出撃させられます。
6. 広場で住人カードを開くと、独立した「通報」と「ブロック」があります。ブロック後は挨拶・広場・タワーから除外されます。
7. Settings / Support 相当の公開ページからアカウント削除へ進み、「削除」と入力すると認証アカウントと関連データを削除します。

## BLE testing

BLE は2台の実機が必要です。1台だけでも、審査用アカウントには事前投入したサンプルすれ違いが表示されます。

- Review account: `[TODO: password-auth enabled reviewer account]`
- Password: `[TODO]`

## In-App Purchase

コインは Consumable IAP です。ショップで商品を選ぶと StoreKit の購入シートが開き、成功したレシートをサーバーで検証してから残高を更新します。

- IAP review screenshot: `store/assets/iap-review/`
- First IAP products are included with this app version.
- 0円の `TEST` 表示は開発環境専用であり、この提出ビルドでは無効です。

## Permissions

- Bluetooth: 近くの同アプリ利用者の仮名 ID を送受信するため
- Notifications: Android の継続動作表示、および許可時の検出通知
- Location: requested / collected しません

Contact: `[TODO NAME / PHONE / EMAIL]`
