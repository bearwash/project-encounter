'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="fixed inset-0 grid place-items-center bg-cream px-6 text-ink">
      <section className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-pop-red text-xl font-black text-cream-soft shadow-[0_6px_0_rgba(59,48,36,0.14)]">
          PE
        </div>
        <h1 className="text-lg font-black tracking-wider">表示エラー</h1>
        <p className="mt-3 break-words text-sm font-bold leading-relaxed text-ink-soft">
          {error.message || error.digest || '画面の読み込み中にエラーが発生しました。'}
        </p>
        <button
          type="button"
          className="game-button mt-6 inline-flex min-h-12 items-center rounded-full px-5 py-3 text-sm font-black"
          onClick={reset}
        >
          もう一度開く
        </button>
      </section>
    </main>
  );
}
