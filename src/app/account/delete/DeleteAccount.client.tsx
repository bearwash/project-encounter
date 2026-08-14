'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteAccountAndLocalData } from '@/lib/account/delete-account';
import { APP_INFO, mailtoUrl } from '@/lib/app-info';

export default function DeleteAccount() {
  const { state, user, isAuthenticated, requestLogin, signOut } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const support = mailtoUrl(`${APP_INFO.name} アカウント削除依頼`);

  const remove = async () => {
    if (!user || confirmation !== '削除') return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccountAndLocalData(user);
      await signOut();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'アカウントを削除できませんでした。');
      setBusy(false);
    }
  };

  return (
    <main className="policy-page account-delete" data-app-ready="true">
      <header className="policy-page__topbar">
        <Link href="/" className="tower-icon-button" aria-label="ホームへ戻る">‹</Link>
        <div><span>DELETE ACCOUNT</span><h1>アカウント削除</h1></div>
      </header>

      <article className="policy-paper">
        <p className="policy-paper__lead">
          {APP_INFO.name} のアカウントと、アカウントに結び付く公開プロフィールを完全に削除できます。
          アプリをアンインストール済みでも、このWebページから手続きできます。
        </p>

        <h2>削除されるもの</h2>
        <ul>
          <li>ログインアカウントと公開プロフィール</li>
          <li>サーバーに保存されたコイン残高と購入に結び付くアプリ内記録</li>
          <li>この端末のプロフィール、すれ違い履歴、タワー進捗、テスト残高</li>
        </ul>
        <p>
          法令、返金、不正利用防止のため保存義務がある取引記録は、目的に必要な期間だけ分離して保持する場合があります。
          他の利用者の端末にすでに保存された過去のすれ違い記録までは遠隔削除できませんが、公開プロフィールは取得できなくなります。
        </p>

        {state === 'loading' ? (
          <p className="account-delete__status">アカウントを確認しています…</p>
        ) : !isAuthenticated || !user ? (
          <section className="account-delete__action" aria-labelledby="delete-login-title">
            <h2 id="delete-login-title">本人確認をして削除する</h2>
            <p>削除するアカウントと同じApple、Google、またはメールアドレスでログインしてください。</p>
            <button
              type="button"
              className="paper-action paper-action--yellow"
              onClick={() => requestLogin({
                returnTo: '/account/delete',
                reason: '削除するアカウントの本人確認が必要です。',
              })}
            >
              ログインして削除へ進む
            </button>
          </section>
        ) : (
          <section className="account-delete__action account-delete__action--danger" aria-labelledby="delete-confirm-title">
            <h2 id="delete-confirm-title">この操作は取り消せません</h2>
            <p>{user.email ?? '現在のアカウント'} を削除します。確認のため「削除」と入力してください。</p>
            <label>
              <span>確認入力</span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                placeholder="削除"
                disabled={busy}
              />
            </label>
            {error && <p className="account-delete__error" role="alert">{error}</p>}
            <button
              type="button"
              className="account-delete__button"
              disabled={busy || confirmation !== '削除'}
              onClick={remove}
              data-testid="delete-account"
            >
              {busy ? '削除しています…' : 'アカウントとデータを削除'}
            </button>
          </section>
        )}

        <h2>ログインできない場合</h2>
        <p>
          {support
            ? <><a href={support}>サポート窓口へ削除を依頼</a>してください</>
            : <>公開前はサポート連絡先を準備中です。<Link href="/support">サポートページ</Link>をご確認ください</>}
          。本人確認後に処理し、完了をご案内します。
        </p>
      </article>
    </main>
  );
}
