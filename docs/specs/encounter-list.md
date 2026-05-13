# Encounter List — ホーム画面（すれ違い履歴）

> 関連: [要件定義 §3.2 B](../要件定義.md) / [encounter-popup.md](encounter-popup.md)

## 1. ゴール (What & Why)
過去にすれ違った相手を一覧で振り返れる、アプリの「住所」となる画面。
ポップアップの一過性に対し、リストは永続的なコレクション体験を提供する。

## 2. ユーザーストーリー
- ユーザーとして、これまで何人と、誰と、いつすれ違ったかを一覧で確認したい。
- ユーザーとして、同じ相手と何度すれ違っているかを知りたい。

## 3. スコープ
### In Scope
- 既読のすれ違い相手をリスト表示
- ソート（最終すれ違い日時の降順）
- 表示項目: アバターアイコン / 名前 / 最終すれ違い日時 / 累計回数
- リスト項目タップで詳細画面（最小限の表示）

### Out of Scope
- 検索・フィルタ機能（Phase 2 以降）
- リストからの削除・ブロック（要件次第）
- 詳細画面でのアバター巨大表示・装飾（後フェーズ）

## 4. 仕様詳細

### 4.1 データソース
`users_cache` テーブル全件を `encounter_logs` の最大 `encountered_at` で降順ソート。

```sql
SELECT
  u.user_id,
  u.display_name,
  u.avatar_code,
  u.message,
  u.encounter_count,
  MAX(l.encountered_at) AS last_encountered_at
FROM users_cache u
JOIN encounter_logs l ON l.encountered_user_id = u.user_id
GROUP BY u.user_id
ORDER BY last_encountered_at DESC;
```

### 4.2 表示要素

| 要素 | データ | 備考 |
| --- | --- | --- |
| アイコン | `avatar_code` | 縮小サムネイル |
| 名前 | `display_name` | 1 行省略 |
| 最終日時 | `last_encountered_at` | 相対表記（「3 分前」「昨日」） |
| 回数 | `encounter_count` | 1 のときは非表示でも可 |

### 4.3 空状態
すれ違い 0 件のときは、誘導テキスト（例: 「歩き出すと、ここに記録が増えていきます」）とウォークモードへの導線を表示。

### 4.4 リアルタイム更新
ポップアップを閉じた直後にリストに戻った場合、最新状態を反映している必要がある（再フェッチ or store 同期）。

## 5. 受入基準
- [ ] 履歴 0 件のとき、空状態 UI が表示される
- [ ] 複数件あるとき、最終すれ違い日時の降順で並ぶ
- [ ] ポップアップ閉じた直後、新規エンカウント分がリスト先頭に反映される
- [ ] 累計回数 1 のときと 2 以上のときで表示が破綻しない
- [ ] 100 件以上でもスクロールが詰まらない

## 6. 依存・関連
- 上流: [ble-handshake.md](ble-handshake.md), [encounter-popup.md](encounter-popup.md)
- 関連: [contracts/db-schema.sql](../contracts/db-schema.sql)

## 7. オープン課題
- [ ] 詳細画面の有無と内容
- [ ] 日時の相対表記ルール（i18n 含む）
- [ ] リスト件数の上限とアーカイブ方針
