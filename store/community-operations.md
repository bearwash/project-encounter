# Community moderation operations

名前と一言は UGC として扱う。機能を置くだけでなく、次の運用をリリース前から継続する。

## Intake

- Supabase `content_reports` を moderation inbox の正とする。
- 通報には reporter / reported user ID、表示名・一言のスナップショット、理由、時刻だけを含める。
- すれ違った場所・履歴はアップロードしない。
- service role だけが通報一覧を読めるようにする。

## Response target

- 緊急（脅迫、搾取、自傷他害、個人情報）: 24時間以内に一次対応
- 通常（暴言、差別、性的表現、スパム）: 2営業日以内に確認
- すべての判断、対応者、日時、根拠を記録

## Actions

1. 内容と対象プロフィールの現況を確認
2. 明確な違反は公開プロフィールを非表示化
3. 再発・重大事案はアカウント停止または削除
4. 必要に応じて reporter へ完了連絡
5. 誤通報や証拠不足は理由を記録して dismissed

## Required tooling before launch

- [ ] service-role をクライアントへ露出しない管理画面または運用 SQL
- [ ] open reports の通知
- [ ] profile hide / account suspend / account delete 操作
- [ ] 監査ログ
- [ ] 公開サポート連絡先
- [ ] ブロック解除画面（初回リリースまでに推奨）
