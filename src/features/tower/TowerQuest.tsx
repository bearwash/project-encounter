'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { TEST_LOGIN_ENABLED, useAuth } from '@/features/auth/AuthProvider';
import { isTauri } from '@/lib/tauri/env';
import {
  actionDamage,
  makeEnemy,
  phaseMessage,
  type BattleAction,
  type BattlePhase,
  type TowerEnemy,
} from './game';
import {
  addBrowserTestEncounter,
  consumeTowerTicket,
  loadAvailableTowerTickets,
  loadTowerTicketStats,
  recordTowerFloor,
  resetBrowserTowerProgress,
  type TowerTicket,
  type TowerTicketStats,
} from './tower-data';

type BattleOutcome = {
  damage: number;
  defeated: boolean;
};

type SavedProgress = {
  floor: number;
  enemyHp: number;
};

const EMPTY_STATS: TowerTicketStats = { available: 0, used: 0, total: 0 };

function progressKey(userId: string) {
  return `project-encounter:tower-progress:${userId}:v1`;
}

function loadProgress(userId: string): { floor: number; enemy: TowerEnemy } {
  const fallback = { floor: 1, enemy: makeEnemy(1) };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(progressKey(userId));
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<SavedProgress>;
    const floor = Number.isInteger(saved.floor) && Number(saved.floor) > 0 ? Number(saved.floor) : 1;
    const enemy = makeEnemy(floor);
    const hp = Number(saved.enemyHp);
    if (Number.isFinite(hp) && hp > 0 && hp <= enemy.maxHp) enemy.hp = hp;
    return { floor, enemy };
  } catch (error) {
    console.warn('[tower] progress restore failed:', error);
    return fallback;
  }
}

export function TowerQuest({ onOpenPlaza }: { onOpenPlaza: () => void }) {
  const { user } = useAuth();
  const initialProgress = useMemo(() => loadProgress(user?.id ?? 'guest'), [user?.id]);
  const [tickets, setTickets] = useState<TowerTicket[]>([]);
  const [stats, setStats] = useState<TowerTicketStats>(EMPTY_STATS);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [hero, setHero] = useState<TowerTicket | null>(null);
  const [phase, setPhase] = useState<BattlePhase>('ready');
  const [floor, setFloor] = useState(initialProgress.floor);
  const [enemy, setEnemy] = useState<TowerEnemy>(initialProgress.enemy);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTickets = useCallback(async () => {
    try {
      const [nextTickets, nextStats] = await Promise.all([
        loadAvailableTowerTickets(),
        loadTowerTicketStats(),
      ]);
      setTickets(nextTickets);
      setStats(nextStats);
      setSelectedTicketId((current) => {
        if (current !== null && nextTickets.some((ticket) => ticket.encounterLogId === current)) {
          return current;
        }
        return nextTickets[0]?.encounterLogId ?? null;
      });
      setError(null);
    } catch (nextError) {
      console.error('[tower] ticket load failed:', nextError);
      setError('出撃記録を読み込めませんでした。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTickets().catch(() => {});
  }, [refreshTickets]);

  useEffect(() => {
    if (!user || enemy.hp <= 0) return;
    const saved: SavedProgress = { floor, enemyHp: enemy.hp };
    window.localStorage.setItem(progressKey(user.id), JSON.stringify(saved));
  }, [enemy.hp, floor, user]);

  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = window.setTimeout(() => setPhase('command'), 1450);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'attacking' && phase !== 'casting') return;
    const timer = window.setTimeout(() => {
      setPhase(outcome?.defeated ? 'enemy-defeated' : 'tired-return');
    }, phase === 'attacking' ? 820 : 980);
    return () => window.clearTimeout(timer);
  }, [outcome?.defeated, phase]);

  useEffect(() => {
    if (phase !== 'enemy-defeated' || !hero) return;
    const timer = window.setTimeout(() => {
      const nextFloor = floor + 1;
      setFloor(nextFloor);
      setEnemy(makeEnemy(nextFloor));
      setOutcome(null);
      setPhase('floor-transition');
      recordTowerFloor(hero.encounterLogId, nextFloor).catch((recordError) => {
        console.warn('[tower] floor record failed:', recordError);
      });
    }, 1250);
    return () => window.clearTimeout(timer);
  }, [floor, hero, phase]);

  useEffect(() => {
    if (phase !== 'floor-transition') return;
    const timer = window.setTimeout(() => setPhase('command'), 850);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'tired-return') return;
    const timer = window.setTimeout(() => {
      setHero(null);
      setOutcome(null);
      setPhase('ready');
      refreshTickets().catch(() => {});
    }, 2650);
    return () => window.clearTimeout(timer);
  }, [phase, refreshTickets]);

  const selectedTicket =
    tickets.find((ticket) => ticket.encounterLogId === selectedTicketId) ?? tickets[0] ?? null;

  const dispatchHero = async () => {
    if (!selectedTicket || phase !== 'ready') return;
    setError(null);
    const consumed = await consumeTowerTicket(selectedTicket);
    if (!consumed) {
      setError('この出撃権はすでに使われました。残り回数を更新します。');
      await refreshTickets();
      return;
    }

    setTickets((current) =>
      current.filter((ticket) => ticket.encounterLogId !== selectedTicket.encounterLogId),
    );
    setStats((current) => ({
      total: current.total,
      used: Math.min(current.total, current.used + 1),
      available: Math.max(0, current.available - 1),
    }));
    setHero(selectedTicket);
    setOutcome(null);
    setPhase('entering');
  };

  const act = (action: BattleAction) => {
    // command 以外では受け付けない。連打と入場状態への巻き戻りを防止。
    if (phase !== 'command' || !hero) return;
    const damage = actionDamage(action, hero, floor);
    const remainingHp = Math.max(0, enemy.hp - damage);
    setEnemy((current) => ({ ...current, hp: remainingHp }));
    setOutcome({ damage, defeated: remainingHp === 0 });
    setPhase(action === 'fight' ? 'attacking' : 'casting');
  };

  const addTestEncounter = async () => {
    await addBrowserTestEncounter();
    await refreshTickets();
  };

  const resetTestProgress = async () => {
    if (user) window.localStorage.removeItem(progressKey(user.id));
    await resetBrowserTowerProgress();
    const reset = makeEnemy(1);
    setFloor(1);
    setEnemy(reset);
    setHero(null);
    setPhase('ready');
    setOutcome(null);
    await refreshTickets();
  };

  const message = phaseMessage(phase, hero, enemy, outcome?.damage ?? null);
  const commandEnabled = phase === 'command';

  return (
    <main className="tower-quest" data-app-ready="true" data-battle-phase={phase}>
      <header className="tower-quest__topbar">
        <Link href="/" className="tower-icon-button" aria-label="Messengerへ戻る">‹</Link>
        <div className="tower-floor-badge" aria-label={`${floor}階`}>
          <small>FLOOR</small><strong>{floor}</strong>
        </div>
        <div className="tower-quest__title">
          <span>ENCOUNTER</span>
          <strong>すれ違いタワー</strong>
        </div>
        <Link href="/shop" className="tower-coin-link" aria-label="コインショップ">
          <span aria-hidden>◆</span> SHOP
        </Link>
      </header>

      <section className="tower-battle" aria-label={`${floor}階の戦闘`}>
        <div className="tower-battle__sky" aria-hidden>
          <span /><span /><span />
        </div>
        <div className="tower-battle__shaft" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
        </div>
        <div className="tower-floor-ribbon" aria-hidden>
          <span>{Math.max(1, floor - 1)}F</span>
          <strong>{floor}F</strong>
          <span>{floor + 1}F</span>
        </div>

        <EnemySprite enemy={enemy} phase={phase} outcome={outcome} />
        {hero && <HeroSprite key={hero.encounterLogId} hero={hero} phase={phase} />}

        <div className="tower-battle__ground" aria-hidden>
          <span /><span /><span /><span />
        </div>

        <div className="tower-enemy-card">
          <div>
            <span>{floor}F</span>
            <strong>{enemy.name}</strong>
          </div>
          <div
            className="tower-hp"
            role="progressbar"
            aria-label={`${enemy.name}の体力`}
            aria-valuemin={0}
            aria-valuemax={enemy.maxHp}
            aria-valuenow={enemy.hp}
            data-testid="enemy-hp"
          >
            <span style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
          </div>
          <small>HP {enemy.hp} / {enemy.maxHp}</small>
        </div>

        <div className="tower-message" role="status" data-testid="battle-message">
          <span className="tower-message__pin" aria-hidden />
          <p>{message}</p>
        </div>

        {hero && (
          <div className="tower-command-panel" aria-label="戦闘コマンド">
            <div className="tower-active-hero">
              <span>{hero.encounterSequence}回目の出会い</span>
              <strong>{hero.displayName}</strong>
            </div>
            <button
              type="button"
              className="tower-command tower-command--fight"
              onClick={() => act('fight')}
              disabled={!commandEnabled}
            >
              <span className="tower-command__icon" aria-hidden>⚒</span>
              <span><strong>戦う</strong><small>ハンマー</small></span>
            </button>
            <button
              type="button"
              className="tower-command tower-command--magic"
              onClick={() => act('magic')}
              disabled={!commandEnabled}
            >
              <span className="tower-command__icon" aria-hidden>✦</span>
              <span><strong>魔法</strong><small>色のちから</small></span>
            </button>
          </div>
        )}
      </section>

      {!hero && phase === 'ready' && (
        <section className="tower-roster" aria-labelledby="tower-roster-title">
          <div className="tower-roster__heading">
            <div>
              <p>ENCOUNTER LOG</p>
              <h2 id="tower-roster-title">次の勇者</h2>
            </div>
            <div className="tower-ticket-counter" aria-label={`残り${stats.available}回`}>
              <span>出撃できる回数</span>
              <strong>{loading ? '–' : stats.available}</strong>
              <small>/ {stats.total}回のすれ違い</small>
            </div>
          </div>

          {tickets.length > 0 ? (
            <div className="tower-roster__rail" role="listbox" aria-label="出撃する勇者">
              {tickets.map((ticket) => {
                const selected = ticket.encounterLogId === selectedTicket?.encounterLogId;
                return (
                  <button
                    key={ticket.encounterLogId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className="tower-roster-card"
                    onClick={() => setSelectedTicketId(ticket.encounterLogId)}
                  >
                    <MiniHeroPortrait hero={ticket} />
                    <span className="tower-roster-card__copy">
                      <strong>{ticket.displayName}</strong>
                      <small>{ticket.message || 'いっしょに上へ！'}</small>
                    </span>
                    <span className="tower-roster-card__count">{ticket.encounterSequence}回目</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="tower-roster__empty">
              <strong>出撃できる勇者がいません</strong>
              <p>次に誰かとすれ違うと、その1回が新しい出撃権になります。</p>
              <button type="button" onClick={onOpenPlaza}>広場を見る</button>
            </div>
          )}

          {error && <p className="tower-roster__error" role="alert">{error}</p>}

          <div className="tower-roster__actions">
            <button
              type="button"
              className="paper-action paper-action--yellow"
              onClick={dispatchHero}
              disabled={!selectedTicket || loading}
              data-testid="dispatch-hero"
            >
              {selectedTicket ? `${selectedTicket.displayName}を出撃させる` : 'すれ違いを待つ'}
            </button>
            <button type="button" className="paper-action paper-action--paper" onClick={onOpenPlaza}>
              広場へ
            </button>
          </div>

          {!isTauri() && TEST_LOGIN_ENABLED && (
            <details className="tower-test-tools">
              <summary>検証ツール</summary>
              <div>
                <button type="button" onClick={addTestEncounter}>テストすれ違い +1</button>
                <button type="button" onClick={resetTestProgress}>出撃・階層をリセット</button>
              </div>
              <p>ここでは実際のBLE通信やクレジット決済は発生しません。</p>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

function EnemySprite({
  enemy,
  phase,
  outcome,
}: {
  enemy: TowerEnemy;
  phase: BattlePhase;
  outcome: BattleOutcome | null;
}) {
  const style = {
    '--enemy-body': enemy.bodyColor,
    '--enemy-accent': enemy.accentColor,
  } as CSSProperties;
  return (
    <div
      className={`tower-enemy tower-enemy--${enemy.kind} tower-enemy--${phase}`}
      style={style}
      aria-label={enemy.name}
      key={enemy.key}
    >
      <span className="tower-enemy__shadow" aria-hidden />
      <div className="tower-enemy__body" aria-hidden>
        <i className="tower-enemy__eye tower-enemy__eye--left" />
        <i className="tower-enemy__eye tower-enemy__eye--right" />
        <i className="tower-enemy__mouth" />
        <i className="tower-enemy__accent" />
      </div>
      {outcome && (phase === 'attacking' || phase === 'casting') && (
        <strong className="tower-damage" aria-label={`${outcome.damage}ダメージ`}>
          -{outcome.damage}
        </strong>
      )}
    </div>
  );
}

function HeroSprite({ hero, phase }: { hero: TowerTicket; phase: BattlePhase }) {
  const palette = heroPalette(hero.userId);
  const style = {
    '--hero-skin': palette.skin,
    '--hero-hair': palette.hair,
    '--hero-top': palette.top,
    '--hero-bottom': palette.bottom,
  } as CSSProperties;

  return (
    <div
      className={`tower-hero tower-hero--${phase}`}
      style={style}
      data-testid="tower-hero"
      data-hero-id={hero.encounterLogId}
    >
      <span className="tower-hero__shadow" aria-hidden />
      <div className="tower-hero__puppet" aria-hidden>
        <span className="tower-hero__leg tower-hero__leg--left"><i /></span>
        <span className="tower-hero__leg tower-hero__leg--right"><i /></span>
        <span className="tower-hero__torso" />
        <span className="tower-hero__arm tower-hero__arm--back" />
        <span className="tower-hero__head">
          <i className="tower-hero__hair" />
          <i className="tower-hero__eye" />
          <i className="tower-hero__mouth" />
        </span>
        <span className="tower-hero__arm tower-hero__arm--tool" />
        <span className="tower-hammer">
          <i className="tower-hammer__handle" />
          <i className="tower-hammer__head" />
          <i className="tower-hammer__grip" />
        </span>
      </div>
      {phase === 'casting' && <span className="tower-magic-burst" aria-hidden>✦</span>}
    </div>
  );
}

function MiniHeroPortrait({ hero }: { hero: TowerTicket }) {
  const palette = heroPalette(hero.userId);
  const style = {
    '--hero-skin': palette.skin,
    '--hero-hair': palette.hair,
    '--hero-top': palette.top,
  } as CSSProperties;
  return (
    <span className="mini-hero" style={style} aria-hidden>
      <i className="mini-hero__body" />
      <i className="mini-hero__head" />
      <i className="mini-hero__hair" />
    </span>
  );
}

function heroPalette(seedText: string) {
  let seed = 0;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) >>> 0;
  }
  const pick = (values: readonly string[], shift: number) => values[(seed >>> shift) % values.length]!;
  return {
    skin: pick(['#F4C9A0', '#D9A77A', '#B07B52', '#F7D4B5'], 0),
    hair: pick(['#30241E', '#17191F', '#E6C86D', '#C94743', '#7AC772'], 3),
    top: pick(['#31B8CF', '#F15E4A', '#F4C949', '#70BE63', '#F48EB6'], 6),
    bottom: pick(['#24496E', '#2F2D38', '#5E77A8', '#3A463F'], 9),
  };
}
