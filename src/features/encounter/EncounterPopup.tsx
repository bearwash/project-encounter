'use client';

/**
 * 公園入口での対面挨拶シーン (EncounterGreeting)。
 * spec: docs/specs/encounter-popup.md §4-§5
 *
 * - 全画面、舞台は公園の入口 (ゲート前 + 夕焼け + 桜)
 * - 開幕に「きょうのすれちがい N 人」スタンプでタメを作る
 * - 自分(左) と 相手(右) の斜め内向き 2 ショット構図
 * - 隊列が右奥に小さく並んで待機
 * - 相手登場直後に頭上「!」驚き吹き出し
 * - 2 回目以降 → ハイタッチ + 紙吹雪 + 「あいさつ！」
 * - 1 回目 → 会釈 + 「ぺこっ」
 * - 名札 (PARK PASSPORT 風) + 累計回数スタンプ + 吹き出し
 * - 1 セッション 20 人で区切り、残数あれば「あいにいく」、なければ「広場へはいる」
 * - 「広場へはいる」 → カメラパン + クロスフェードで広場ビューへ遷移
 *
 * 既読化 (§5.8) は隊列から前に出てきた瞬間 = `meet` フェーズ突入時に発火する。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GREETING_TIMINGS,
  SESSION_LIMIT,
  greetFlashWord,
  greetType,
  greetingPrefix,
} from '@/lib/encounter/greeting';
import type { UnreadEncounter } from '@/types/encounter';
import { Avatar } from './Avatar';
import { GreetingBubble } from './GreetingBubble';
import {
  GreetingConfetti,
  GreetingExclaim,
  GreetingOpeningStamp,
} from './GreetingEffects';
import { GreetingQueue } from './GreetingQueue';
import { GreetingSessionEnd } from './GreetingSessionEnd';
import { GreetingStrip } from './GreetingStrip';
import { ParkGate } from './ParkGate';
import { SakuraPetals } from './SakuraPetals';
import { useMarkRead } from './queries';

type Phase =
  /** 開幕「きょうのすれちがい N 人」スタンプ */
  | 'opening'
  /** 隊列の先頭が前に出てくる */
  | 'enter'
  /** 対面で静止 (呼吸 + まばたき) */
  | 'meet'
  /** ハイタッチ or 会釈 */
  | 'greet'
  /** 吹き出し表示 + タップ待ち */
  | 'speak'
  /** 相手が右にハケる */
  | 'leave'
  /** セッション終了パネル */
  | 'session-end'
  /** ゲート通過 → 広場へ */
  | 'gate-pass';

type Props = {
  /** 未読の全件 (popup 起動時の snapshot、§5.9: 表示中の新規はキューに追加しない) */
  items: UnreadEncounter[];
  /** 自分のアバター */
  myAvatarCode: string;
  /** 「あとで広場で見る」 or items が空のとき (未表示分は次回起動で再提示) */
  onClose: () => void;
  /**
   * 「広場へはいる」 → ゲート通過完了後に呼ばれる。
   * これまでに挨拶を済ませた相手の user_id 一覧を渡す
   * (広場側の合流アニメ — encounter-plaza.md §4.4 — の発火用)。
   */
  onEnterPlaza: (greetedUserIds: string[]) => void;
};

export function EncounterPopup({
  items,
  myAvatarCode,
  onClose,
  onEnterPlaza,
}: Props) {
  // セッション開始位置 (20 人ごと進める)
  const [sessionStart, setSessionStart] = useState(0);
  const session = items.slice(sessionStart, sessionStart + SESSION_LIMIT);
  const remainingAfter = Math.max(
    0,
    items.length - (sessionStart + session.length),
  );

  const [index, setIndex] = useState(0);
  // 開幕は opening スタンプから始める (タメ)
  const [phase, setPhase] = useState<Phase>('opening');
  const [showFlash, setShowFlash] = useState<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0); // 紙吹雪を毎ハイタッチで remount
  const [confettiOn, setConfettiOn] = useState(false);

  const markRead = useMarkRead();
  // 既読化を相手ごとに 1 回だけにする (重複呼び出し防止 — §5.9 冪等性)
  const readSetRef = useRef<Set<number>>(new Set());
  // 挨拶した相手の user_id 集合 (広場の合流アニメに渡す)
  const greetedUserIdsRef = useRef<Set<string>>(new Set());
  // タップ連打のデバウンス
  const lastTapRef = useRef(0);

  const current = session[index];
  const isLastInSession = current ? index >= session.length - 1 : true;
  const currentGreet = current ? greetType(current.user.encounter_count) : 'bow';

  // セッションの先頭で開幕スタンプ → enter に移る
  useEffect(() => {
    if (phase !== 'opening') return;
    const t = window.setTimeout(
      () => setPhase('enter'),
      GREETING_TIMINGS.OPENING_MS,
    );
    return () => window.clearTimeout(t);
  }, [phase, sessionStart]);

  // フェーズ駆動:
  //   enter (auto) → meet (タップ待ち) → greet (auto) → speak (タップ待ち) → leave (auto)
  //
  // 仕様 §5.4: 対面状態 (meet) でタップ → ハイタッチが発火する。
  // タップが必要なフェーズを 2 つ (meet / speak) 設けることで「自分が挨拶しにいく」体験にする。
  useEffect(() => {
    if (!current || phase === 'opening') return;

    if (phase === 'enter') {
      // enter → meet (タップ待ちへ)。入場完了時に既読化 (§5.8) +
      // 広場合流アニメの対象として user_id を記録
      const t = window.setTimeout(() => {
        setPhase('meet');
        const id = current.log_id;
        if (!readSetRef.current.has(id)) {
          readSetRef.current.add(id);
          greetedUserIdsRef.current.add(current.user.user_id);
          markRead.mutate(id);
        }
      }, GREETING_TIMINGS.ENTER_MS);
      return () => window.clearTimeout(t);
    }

    if (phase === 'greet') {
      // greet 中: flash + 紙吹雪 (中央接触のタイミング) → speak へ
      const greetMs =
        currentGreet === 'highfive'
          ? GREETING_TIMINGS.HIGHFIVE_MS
          : GREETING_TIMINGS.BOW_MS;
      const flashAt = Math.round(greetMs * 0.5);
      const handles: number[] = [];

      handles.push(
        window.setTimeout(() => {
          setShowFlash(greetFlashWord(currentGreet));
          if (currentGreet === 'highfive') {
            setConfettiKey((k) => k + 1);
            setConfettiOn(true);
            handles.push(
              window.setTimeout(
                () => setConfettiOn(false),
                GREETING_TIMINGS.CONFETTI_MS,
              ),
            );
          }
          handles.push(
            window.setTimeout(
              () => setShowFlash(null),
              GREETING_TIMINGS.TAP_FLASH_MS,
            ),
          );
        }, flashAt),
      );

      handles.push(window.setTimeout(() => setPhase('speak'), greetMs));

      return () => {
        for (const h of handles) window.clearTimeout(h);
      };
    }
    // meet / speak: タップ待ち (副作用なし)
    // markRead は stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.log_id, currentGreet]);

  // タップ ハンドラ
  //   - meet → greet (挨拶発火)
  //   - speak → leave (次の人へ)
  //   - それ以外のフェーズではタップ無効 (デバウンス共通)
  const handleAdvance = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < GREETING_TIMINGS.TAP_DEBOUNCE_MS) return;

    if (phase === 'meet') {
      lastTapRef.current = now;
      // 状態を切り替える前に flash / confetti をリセット
      setShowFlash(null);
      setConfettiOn(false);
      setPhase('greet');
      return;
    }

    if (phase === 'speak') {
      lastTapRef.current = now;
      setPhase('leave');
      window.setTimeout(() => {
        if (isLastInSession) {
          setPhase('session-end');
        } else {
          setIndex((i) => i + 1);
          setPhase('enter');
        }
      }, GREETING_TIMINGS.LEAVE_MS);
      return;
    }
  }, [phase, isLastInSession]);

  // セッション終了 → 「あと N 人にあいにいく」
  const handleSummonNext = () => {
    setSessionStart((s) => s + SESSION_LIMIT);
    setIndex(0);
    // 次セッションの先頭もスタンプから始めて「タメ」を作る
    setPhase('opening');
  };

  // セッション終了 → 「広場へはいる」 → ゲート通過演出 → 広場へ遷移
  const handleEnterPlaza = () => {
    setPhase('gate-pass');
    const ids = Array.from(greetedUserIdsRef.current);
    window.setTimeout(
      () => onEnterPlaza(ids),
      GREETING_TIMINGS.GATE_PASS_MS + GREETING_TIMINGS.CROSSFADE_MS,
    );
  };

  // items が空 (起動時 fetch がブレた等) → 何もせず親に閉じてもらう
  if (!current) {
    return null;
  }

  // ---- 演出: フェーズに応じた相手アバターのアニメクラス ----
  const peerAnimClass =
    phase === 'enter'
      ? 'greeting-peer-entering'
      : phase === 'leave'
        ? 'greeting-peer-leaving'
        : phase === 'greet'
          ? currentGreet === 'highfive'
            ? 'greeting-peer-highfive'
            : 'greeting-bow'
          : '';

  const meAnimClass =
    phase === 'greet'
      ? currentGreet === 'highfive'
        ? 'greeting-me-highfive'
        : 'greeting-bow'
      : '';

  const gatePass = phase === 'gate-pass';
  const showQueue =
    phase !== 'gate-pass' &&
    phase !== 'session-end' &&
    phase !== 'opening';

  return (
    <div
      className="absolute inset-0 z-50 cursor-pointer select-none overflow-hidden focus:outline-none"
      onClick={handleAdvance}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleAdvance();
        }
      }}
      tabIndex={0}
      data-testid="encounter-greeting"
      data-phase={phase}
      role="dialog"
      aria-label="公園の入口で挨拶"
    >
      <ParkGate panning={gatePass} />

      {/* 桜の花びら (背景の上 / アバターの下) */}
      <SakuraPetals count={12} durationRange={[10, 18]} />

      <GreetingStrip
        total={session.length}
        index={Math.min(index, session.length - 1)}
      />

      {/* 隊列 (次以降の相手たち) */}
      {showQueue && <GreetingQueue upcoming={session.slice(index + 1)} />}

      {/* 自分のアバター (左) — 縦向け前提 (size 124, 地面 38% の上に立つ) */}
      <div
        className="absolute bottom-[36%] left-[6%]"
        data-testid="greeting-me"
        style={{
          transition:
            'transform 700ms ease-in-out, opacity 500ms ease-out',
          transform: gatePass
            ? 'translate(56px, -24px) scale(0.7)'
            : phase === 'opening'
              ? 'translate(-24px, 0) scale(1)'
              : 'translate(0, 0) scale(1)',
          opacity: gatePass ? 0 : phase === 'opening' ? 0.55 : 1,
        }}
      >
        <div className={meAnimClass}>
          <Avatar code={myAvatarCode} size={124} mode="idle" />
        </div>
      </div>

      {/* 相手のアバター (右、内向き = scaleX(-1) で flip) */}
      {phase !== 'opening' && (
        <div
          className="absolute bottom-[36%] right-[6%]"
          data-testid="greeting-peer"
          data-greet-type={currentGreet}
          style={{
            transition:
              'transform 700ms ease-in-out, opacity 500ms ease-out',
            transform: gatePass
              ? 'translate(-56px, -24px) scale(0.7)'
              : 'translate(0, 0) scale(1)',
            opacity: gatePass ? 0 : 1,
          }}
        >
          <div className="relative" key={`${current.log_id}-${phase}`}>
            {/* 「!」驚き吹き出し: meet フェーズ突入の最初に表示 */}
            {phase === 'meet' && <GreetingExclaim />}

            <div className={peerAnimClass}>
              <div style={{ transform: 'scaleX(-1)' }}>
                <Avatar
                  code={current.user.avatar_code}
                  size={124}
                  mode={phase === 'enter' ? 'walking' : 'idle'}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 中央フラッシュ文言: 「あいさつ！」/ 「ぺこっ」 */}
      {showFlash && (
        <span
          className="greeting-tap-flash absolute left-1/2 top-[44%] -translate-x-1/2 font-display text-3xl font-black tracking-widest text-pop-red"
          data-testid="greeting-flash-word"
          style={{ textShadow: '0 2px 0 rgba(59,48,36,0.18)' }}
        >
          {showFlash}
        </span>
      )}

      {/* 紙吹雪: ハイタッチ瞬間のみ */}
      {confettiOn && (
        <GreetingConfetti key={confettiKey} origin={{ left: '50%', top: '52%' }} />
      )}

      {/* 名札 + 吹き出し (speak フェーズのみ) */}
      {phase === 'speak' && (
        <div
          className="absolute bottom-[64%] left-1/2 -translate-x-1/2"
          data-testid="greeting-bubble-wrap"
        >
          <GreetingBubble
            prefix={greetingPrefix(current.user.encounter_count)}
            displayName={current.user.display_name}
            encounterCount={current.user.encounter_count}
            message={current.user.message}
            hint="クリック / タップで次へ"
          />
        </div>
      )}

      {/* オープニング: 「きょうのすれちがい N 人」 */}
      {phase === 'opening' && <GreetingOpeningStamp count={session.length} />}

      {/* meet フェーズ: タップを促すヒント (画面下中央で脈動) */}
      {phase === 'meet' && (
        <div
          className="pointer-events-none absolute bottom-8 left-1/2 z-30 -translate-x-1/2"
          data-testid="greeting-tap-hint"
          aria-hidden
        >
          <span className="greeting-tap-hint flex items-center gap-2 rounded-full border-2 border-pop-red bg-cream-soft px-5 py-2.5 text-sm font-black tracking-wider text-pop-red shadow-toy-lg">
            <span className="text-lg">
              {currentGreet === 'highfive' ? '✋' : '🙇'}
            </span>
            {currentGreet === 'highfive'
              ? 'クリック / タップしてハイタッチ！'
              : 'クリック / タップしてあいさつ！'}
          </span>
        </div>
      )}

      {/* セッション終了パネル */}
      {phase === 'session-end' && (
        <GreetingSessionEnd
          remaining={remainingAfter}
          onSummonNext={handleSummonNext}
          onEnterPlaza={handleEnterPlaza}
          onLater={onClose}
        />
      )}

      {/* ゲート通過時のクロスフェード幕 */}
      {gatePass && (
        <div
          className="greeting-gate-fade pointer-events-none absolute inset-0 bg-cream"
          aria-hidden
        />
      )}
    </div>
  );
}
