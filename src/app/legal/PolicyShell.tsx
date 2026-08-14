import Link from 'next/link';
import type { ReactNode } from 'react';

export default function PolicyShell({
  eyebrow,
  title,
  updatedAt,
  children,
}: {
  eyebrow: string;
  title: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <main className="policy-page" data-app-ready="true">
      <header className="policy-page__topbar">
        <Link href="/" className="tower-icon-button" aria-label="ホームへ戻る">‹</Link>
        <div>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
        </div>
      </header>
      <article className="policy-paper">
        {updatedAt && <p className="policy-paper__updated">最終更新：{updatedAt}</p>}
        {children}
      </article>
      <nav className="policy-page__footer" aria-label="法務・サポート">
        <Link href="/legal/privacy">プライバシー</Link>
        <Link href="/legal/terms">利用規約</Link>
        <Link href="/support">サポート</Link>
        <Link href="/account/delete">アカウント削除</Link>
      </nav>
    </main>
  );
}
