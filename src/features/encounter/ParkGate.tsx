'use client';

/**
 * 公園の入口の背景 (夕方のマジックアワー)。
 * spec: docs/specs/encounter-popup.md §4.2
 *
 * レイヤ構成 (奥 → 手前):
 *   1. 空のグラデ (オレンジ→ピンク→クリーム)
 *   2. 遠景の木立 (地平線)
 *   3. 地面 (芝 + ゲート向こうの小道)
 *   4. ゲート (柱 2 本 + 横木 + 看板、地面に接地)
 *   5. ゲートの両脇の茂み + 街灯 (孤立感の解消)
 *
 * カメラパン (panning) は spec §5.7 のゲート通過演出。
 * 地面と接続した縦長レイアウト前提 (スマホ portrait)。
 */

type Props = {
  /** 'true' = ゲート通過の演出中 (カメラがゲートに寄る) */
  panning?: boolean;
};

/** 地面の上端 (画面下から % 表記) */
const GROUND_TOP_PCT = 38;

export function ParkGate({ panning = false }: Props) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-testid="park-gate"
      style={{
        transition: 'transform 800ms ease-in-out',
        transform: panning ? 'scale(1.2) translateY(-4%)' : 'scale(1)',
      }}
    >
      {/* 1. 空 — マジックアワーのグラデーション */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #FFA66B 0%, #FFC09C 30%, #FFD9BC 50%, #FFE9CE 72%, #FFF2DD 100%)',
        }}
      />

      {/* 2. 遠景の木立 (地平線の少し上、地面と接続) */}
      <svg
        className="absolute left-0 right-0 w-full"
        style={{ bottom: `${GROUND_TOP_PCT - 2}%`, height: '14%' }}
        viewBox="0 0 240 40"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0 40 L8 24 L18 30 L30 14 L46 28 L60 18 L74 28 L92 10 L110 26 L126 18 L144 28 L162 14 L180 26 L196 16 L214 28 L228 20 L240 26 L240 40 Z"
          fill="#7A5A8C"
          opacity="0.5"
        />
      </svg>

      {/* 3. 地面 — 芝 + ゲート向こうの小道 */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: `${GROUND_TOP_PCT}%`,
          background:
            'linear-gradient(to bottom, #9FCB7A 0%, #84BD63 60%, #6CA84C 100%)',
        }}
      >
        {/* 小道 (ゲートの中央から手前に広がる台形) */}
        <svg
          className="absolute inset-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M44 0 L56 0 L78 100 L22 100 Z"
            fill="#D8B889"
            opacity="0.85"
          />
          <path
            d="M44 0 L56 0 L78 100 L22 100 Z"
            fill="url(#path-shade)"
            opacity="0.4"
          />
          <defs>
            <linearGradient id="path-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity="0.18" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* 4. ゲート — 地面に接地。両脇に茂み・街灯を配置して背景に溶ける */}
      <div
        className="absolute left-1/2"
        style={{ bottom: `${GROUND_TOP_PCT - 2}%`, transform: 'translateX(-50%)' }}
        aria-hidden
      >
        <svg width="220" height="260" viewBox="0 0 220 260">
          {/* ゲートの足元の影 (地面に落ちる) */}
          <ellipse cx="110" cy="252" rx="92" ry="6" fill="#000" opacity="0.18" />

          {/* 左の茂み */}
          <g>
            <ellipse cx="20" cy="246" rx="28" ry="14" fill="#5D9F45" />
            <ellipse cx="28" cy="238" rx="22" ry="14" fill="#76B25C" />
            <ellipse cx="14" cy="240" rx="18" ry="12" fill="#84BD63" />
          </g>
          {/* 右の茂み */}
          <g>
            <ellipse cx="200" cy="246" rx="28" ry="14" fill="#5D9F45" />
            <ellipse cx="192" cy="238" rx="22" ry="14" fill="#76B25C" />
            <ellipse cx="206" cy="240" rx="18" ry="12" fill="#84BD63" />
          </g>

          {/* ゲート柱 (左) — 地面に少し埋まる感じで bottom 256 まで */}
          <rect x="36" y="58" width="22" height="200" rx="4" fill="#9C6B45" />
          <rect x="36" y="58" width="6" height="200" fill="#B6855E" />
          <rect x="32" y="56" width="30" height="8" rx="3" fill="#7A4E2F" />

          {/* ゲート柱 (右) */}
          <rect x="162" y="58" width="22" height="200" rx="4" fill="#9C6B45" />
          <rect x="162" y="58" width="6" height="200" fill="#B6855E" />
          <rect x="158" y="56" width="30" height="8" rx="3" fill="#7A4E2F" />

          {/* 横木 */}
          <rect x="28" y="46" width="164" height="22" rx="6" fill="#9C6B45" />
          <rect x="28" y="46" width="164" height="6" rx="3" fill="#B6855E" />

          {/* 看板 */}
          <rect x="78" y="14" width="64" height="34" rx="6" fill="#FFF2DD" />
          <rect
            x="78"
            y="14"
            width="64"
            height="34"
            rx="6"
            fill="none"
            stroke="#7A4E2F"
            strokeWidth="2.5"
          />
          <text
            x="110"
            y="36"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontSize="13"
            fontWeight="900"
            fill="#3B3024"
            letterSpacing="2"
          >
            PARK
          </text>
          {/* 看板を支える紐 */}
          <line x1="78" y1="20" x2="64" y2="50" stroke="#7A4E2F" strokeWidth="1.5" />
          <line
            x1="142"
            y1="20"
            x2="156"
            y2="50"
            stroke="#7A4E2F"
            strokeWidth="1.5"
          />

          {/* ゲート内の「向こう側」を少し明るく — 入口の奥行き */}
          <rect x="58" y="68" width="104" height="186" fill="#FFE9CE" opacity="0.45" />

          {/* 街灯 (左、ゲート脇) */}
          <g>
            <rect x="6" y="160" width="3" height="86" fill="#5B4A3B" />
            <path d="M0 158 L14 158 L11 148 L3 148 Z" fill="#5B4A3B" />
            <circle cx="7" cy="158" r="10" fill="#FFE17A" opacity="0.35" />
            <circle cx="7" cy="155" r="5" fill="#FFE17A" />
          </g>
          {/* 街灯 (右、ゲート脇) */}
          <g>
            <rect x="211" y="160" width="3" height="86" fill="#5B4A3B" />
            <path d="M206 158 L220 158 L217 148 L209 148 Z" fill="#5B4A3B" />
            <circle cx="213" cy="158" r="10" fill="#FFE17A" opacity="0.35" />
            <circle cx="213" cy="155" r="5" fill="#FFE17A" />
          </g>
        </svg>
      </div>
    </div>
  );
}
