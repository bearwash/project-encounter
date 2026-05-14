'use client';

/**
 * Avatar / AvatarEditor の dev 検証ページ。
 *
 * 純ブラウザ (Tauri 外) で Avatar + AvatarEditor の挙動を確認するために設置。
 * 本番ビルドでは layout.tsx で notFound 扱い。
 */
import { useState } from 'react';
import { Avatar, type AvatarMode } from '@/features/encounter/Avatar';
import { AvatarEditor } from '@/features/profile/AvatarEditor';
import { DEFAULT_AVATAR_CODE } from '@/types/profile';

const MODES: AvatarMode[] = ['idle', 'walking', 'popup'];

export default function AvatarPreviewPage() {
  const [code, setCode] = useState(DEFAULT_AVATAR_CODE);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black tracking-wide text-pop-red">AVATAR PREVIEW</h1>
        <code className="font-mono text-xs text-ink-muted" data-testid="avatar-code-top">
          {code}
        </code>
      </header>

      <section
        className="grid grid-cols-3 gap-4 rounded-toy border border-cream-deep bg-cream-soft p-5 shadow-toy"
        data-testid="modes-row"
      >
        {MODES.map((mode) => (
          <div
            key={mode}
            className="flex flex-col items-center gap-2"
            data-testid={`mode-${mode}`}
          >
            <Avatar code={code} mode={mode} size={120} />
            <span className="text-xs font-bold tracking-widest text-ink-soft">{mode}</span>
          </div>
        ))}
      </section>

      <section className="rounded-toy border border-cream-deep bg-cream-soft p-4 shadow-toy">
        <AvatarEditor value={code} onChange={setCode} />
      </section>

      <section className="rounded-toy border border-dashed border-cream-deep p-3">
        <span className="text-[10px] tracking-widest text-ink-muted">
          フォールバック確認: 不正コードでもクラッシュせずデフォルトに置換
        </span>
        <div className="mt-2 flex gap-4">
          {['', 'xyz', 'b01_h99_o03_f01', 'b01_h02_o03'].map((c) => (
            <div
              key={c || 'empty'}
              className="flex flex-col items-center gap-1"
              data-testid={`fallback-${c || 'empty'}`}
            >
              <Avatar code={c} mode="idle" size={64} />
              <code className="font-mono text-[10px] text-ink-muted">{c || '(empty)'}</code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
