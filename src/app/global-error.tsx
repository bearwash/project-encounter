'use client';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="ja">
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: '#FAF1E0',
            color: '#3B3024',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <section style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>PE</div>
            <h1 style={{ fontSize: 18 }}>起動エラー</h1>
            <p style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>
              {error.message || error.digest || 'アプリの起動中にエラーが発生しました。'}
            </p>
          </section>
        </main>
      </body>
    </html>
  );
}
