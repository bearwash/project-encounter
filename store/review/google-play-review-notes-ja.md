# Google Play review access instructions — draft

## Restricted functionality

初回画面と商品閲覧はゲストで利用できます。タワー、工房、購入確定、アカウント削除はログインが必要です。

- Login method: `[TODO: reviewer email/password account]`
- Username: `[TODO]`
- Password: `[TODO]`
- Other instructions: 2段階認証やメールリンクを要求しない固定審査アカウントを用意する。

## Key paths

1. Home → BEGIN: ゲスト体験
2. Home → タワー: ログイン後、すれ違いログと戦闘
3. タワー → 広場 → 住人カード: 通報 / ブロック
4. Home → 工房: アバター、名前、一言、公開同意
5. Home → コイン: Google Play Billing の消耗型商品
6. `/account/delete`: アプリ内・公開Webのアカウント削除

## Permissions declaration

Bluetooth / Nearby devices は、近くの同アプリ端末と仮名 user ID を交換するコア機能に使います。位置情報は取得せず、Android manifest の Bluetooth Scan には `neverForLocation` を設定します。

Foreground service は、利用者が開始したウォークモード中の BLE 検出を継続し、常時通知で動作中であることを表示するために使います。

## Purchases

コインは Google Play Billing の consumable one-time product です。購入 token をサーバー検証して付与し、同じ transaction の二重付与を防ぎます。`¥0 TEST` は開発環境専用で、この提出ビルドには表示されません。
