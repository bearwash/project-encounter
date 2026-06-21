import HomePage from './HomePage.client';

export default function Page() {
  return (
    <>
      <main
        id="server-startup-screen"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          overflow: 'auto',
          background: '#FAF1E0',
          color: '#3B3024',
          padding: '72px 20px 28px',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <section style={{ maxWidth: 420, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-block',
              borderRadius: 999,
              background: '#5DA9E9',
              color: '#FFFAF0',
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '.08em',
            }}
          >
            STATIC STARTUP
          </div>
          <h1 style={{ margin: '18px 0 8px', fontSize: 26, fontWeight: 900 }}>
            Project Encounter
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, fontWeight: 700 }}>
            画面の土台は読み込めています。数秒後に BLE 確認画面へ切り替わります。
          </p>
        </section>
      </main>
      <HomePage />
    </>
  );
}
