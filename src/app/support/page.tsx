import Link from 'next/link';
import PolicyShell from '../legal/PolicyShell';
import { APP_INFO, mailtoUrl } from '@/lib/app-info';

export const metadata = {
  title: `サポート | ${APP_INFO.name}`,
};

export default function SupportPage() {
  const contact = mailtoUrl(`${APP_INFO.name} サポート問い合わせ`);

  return (
    <PolicyShell eyebrow="HELP DESK" title="サポート">
      <p className="policy-paper__lead">
        困ったときの確認場所です。お問い合わせには、端末機種、OS、アプリ版 {APP_INFO.version}、発生した画面を添えてください。
        パスワード、ログインリンク、購入レシート全文は送らないでください。
      </p>

      <h2>よくある質問</h2>
      <details>
        <summary>すれ違いが見つかりません</summary>
        <p>両方の端末でBluetoothが有効か、アプリの「付近のデバイス」またはBluetooth権限が許可されているか確認してください。OSの省電力設定やアプリの強制終了後は、バックグラウンド検出が制限される場合があります。位置情報は使用しません。</p>
      </details>
      <details>
        <summary>同じ人と会ったのに出撃回数が増えません</summary>
        <p>同じ相手との記録にはクールダウンがあります。クールダウン後に記録されたすれ違い1回につき、タワーの出撃権が1回増えます。</p>
      </details>
      <details id="purchases">
        <summary>コインの購入・復元について</summary>
        <p>「¥0 TEST」と表示される開発版では実決済はありません。本番版の価格と支払いはApp StoreまたはGoogle Playが処理します。購入後に反映されない場合は、同じストアアカウントとアプリ内アカウントでログインし、「購入を復元」をお試しください。</p>
      </details>
      <details>
        <summary>ログインメールが届きません</summary>
        <p>迷惑メール、入力したアドレス、受信拒否設定をご確認ください。AppleまたはGoogleログインも利用できます。</p>
      </details>
      <details>
        <summary>名前や一言を非公開にしたいです</summary>
        <p>工房の「すれ違った相手へ公開する」をオフにしてください。アカウントと関連データをすべて消す場合は、<Link href="/account/delete">アカウント削除</Link>へ進んでください。</p>
      </details>

      <h2>お問い合わせ</h2>
      {contact ? (
        <p><a className="policy-contact" href={contact}>{APP_INFO.supportEmail} へメールする</a></p>
      ) : (
        <div className="policy-config-note" role="note">
          <strong>公開前の設定項目</strong>
          <p>サポートメールアドレスはまだ設定されていません。配布ビルドでは <code>NEXT_PUBLIC_SUPPORT_EMAIL</code> を設定してください。</p>
        </div>
      )}
      <p>通常は受信後7営業日以内を目安に返信します。購入の返金可否は各ストアの窓口で決定されます。</p>
    </PolicyShell>
  );
}
