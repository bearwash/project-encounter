'use client';

/**
 * 画面下部のトースト表示。HomePage に置く想定。
 * spec: docs/specs/profile-sync.md §5.5
 */
import { useToast } from '@/lib/ui/toast';

export function Toaster() {
  const toast = useToast();
  if (!toast) return null;

  const color =
    toast.kind === 'warn'
      ? 'game-button-danger text-cream-soft'
      : 'text-ink';

  return (
    <div
      className="pointer-events-none fixed bottom-20 left-1/2 z-[55] -translate-x-1/2"
      data-testid="toaster"
      aria-live="polite"
    >
      <div
        key={toast.id}
        className={`game-hud animate-bounce-in rounded-full px-4 py-2 text-xs font-black tracking-wider ${color}`}
      >
        {toast.message}
      </div>
    </div>
  );
}
