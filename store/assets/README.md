# Store assets

## Required outputs

- `icons/app-store-icon-1024.png`: 1024 × 1024, RGB, alphaなし
- `icons/google-play-icon-512.png`: 512 × 512
- `app-store/iphone-6.9/`: 1320 × 2868 portrait PNG, 1〜10枚
- `google-play/feature-graphic-1024x500.png`: 1024 × 500, 24-bit PNG, alphaなし
- `google-play/phone/`: 1080 × 1920 portrait PNG, 推奨4枚以上
- `iap-review/`: 購入画面を明確に示す審査専用 screenshot
- `iap-products/`: Google Play one-time product icon 512 × 512

## Rules

- 画像内に他社の商標、端末フレーム、架空の賞・順位・割引・固定価格を入れない。
- スクリーンショットは実際のアプリUIを中心にし、公開版にない機能を描かない。
- App Store 用 PNG/JPEG は alpha channel を持たせない。
- 現在の画像は開発版の予備。公開直前に署名済みネイティブ build から撮り直す。
- `captures/` の同じ構図を更新後、`pnpm store:screenshots` で提出規格へ変換する。
- `iap-review/DEV-ONLY-*` はテスト購入UIの動作確認用。公開 listing には使用せず、本番決済接続後に審査画像を差し替える。
