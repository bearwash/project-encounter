# In-app purchase catalog

コインはアプリ内で消費する仮想通貨。Apple は **Consumable**、Google Play は **One-time product / Consumable** として登録する。

| Product ID | 日本語表示名 | 説明 | 付与 | 本番価格 |
|---|---|---|---:|---|
| `com.projectencounter.coins.120` | コインひとつかみ | 小物や色を試すときに。 | 120 | `[TODO]` |
| `com.projectencounter.coins.650` | 旅のポーチ | 工房でじっくり遊べる量。 | 650 | `[TODO]` |
| `com.projectencounter.coins.1400` | 旅支度のトランク | 季節のアイテムもまとめて。 | 1,400 | `[TODO]` |

## 共通ルール

- Product ID は作成後に変更・再利用できない前提で確定する。
- 本番価格はソースへ固定せず、StoreKit / Play Billing のローカライズ済み価格を表示する。
- 付与はストアレシートをサーバー検証し、transaction ID の一意制約で二重付与を防ぐ。
- Google Play はコイン付与後に purchase token を consume し、再購入可能にする。
- コインは失効させず、換金・譲渡を認めない。
- テスト台帳と本番ウォレットを混在させない。

## Apple

- Reference name: `Coins 120`, `Coins 650`, `Coins 1400`
- Type: Consumable
- Display name: 上表の日本語表示名（30文字以内）
- Description: 上表の説明（45文字以内）
- App Review screenshot: `assets/iap-review/` のショップ画面
- Review note: 商品選択 → StoreKit sheet → サーバー確認 → 残高更新の順を記載
- 初回 Consumable は新しいアプリバージョンと一緒に審査提出する。

## Google Play

- Product type: One-time product / Consumable
- Product icon: `assets/iap-products/google-play-*.png`（512 × 512）
- Billing permission と Play Billing Library をネイティブ Android 側へ追加してから activate する。
- Title は55文字以内（表示安定のため25文字以内）、description は200文字以内。

## Connection contract

フロントの接続点は `src/lib/commerce/purchases.ts`。

- `iap_get_products(productIds)`
- `iap_purchase(productId)`
- `iap_restore()`
- `POST /v1/purchases/verify`
- `POST /v1/purchases/restore`
- `GET /v1/wallet`

ネイティブ層・検証APIが未接続なら本番購入は成功扱いにせず、商品を無効表示する。
購入APIは Supabase access token を `Authorization: Bearer` で受け取り、body や任意ヘッダーの user ID は信用しない。
