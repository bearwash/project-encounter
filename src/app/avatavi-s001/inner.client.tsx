'use client';

/**
 * AVATAVI S001 — characterimage1 / characterimage2 の "CHARACTER REFERENCE BLUEPRINT v1.2"
 * を完全再現するプレビューページ。
 *
 *   - 3 面図 (FRONT / RIGHT SIDE / BACK) を 3 個の Canvas で並べる
 *   - WALK CYCLE 用に追加 Canvas (mode='walking')
 *   - SPECIFICATIONS / COLOR PALETTE / 略歴を脇に並べる
 *
 * このページは AVATAVI S001 の "公式リファレンス" として機能する。
 * Avatar3D に対しては `avatarCode + colors` 上書きで完全再現する:
 *   - b04: 標準体型・明るい肌 → 上書きで peach skin
 *   - h05: バイカラー (G/P) — 新規追加。color = green, color2 = pink
 *   - o04: 黒トップ → 上書きで真の黒
 *   - f01: スマイル (デフォルト)
 */

import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Avatar3D } from '@/features/encounter/Avatar3D';
import { S001_AVATAR_CODE } from '@/features/encounter/avatavi-s001';
import {
  HAIR_PRIMARY,
  HAIR_SECONDARY,
  OUTFIT_PALETTE,
  SKIN_PALETTE,
} from '@/features/encounter/parts/shared/colors';

const S001_CODE = S001_AVATAR_CODE;

/** ブループリント パレット表示用 — catalog から S001 (b04 + h05 + o04) の色を引き出す。 */
const PALETTE_SWATCHES: Array<{ color: string; label: string; hex: string }> = [
  { color: HAIR_PRIMARY.h05,    label: 'HAIR L (G)', hex: HAIR_PRIMARY.h05 },
  { color: HAIR_SECONDARY.h05,  label: 'HAIR R (P)', hex: HAIR_SECONDARY.h05 },
  { color: SKIN_PALETTE.b04,    label: 'SKIN',       hex: SKIN_PALETTE.b04 },
  { color: OUTFIT_PALETTE.o04.top,        label: 'TOP',       hex: OUTFIT_PALETTE.o04.top },
  { color: OUTFIT_PALETTE.o04.bottom,     label: 'JEANS',     hex: OUTFIT_PALETTE.o04.bottom },
  { color: OUTFIT_PALETTE.o04.shoeUpper,  label: 'SHOE UP',   hex: OUTFIT_PALETTE.o04.shoeUpper },
  { color: OUTFIT_PALETTE.o04.shoeSole,   label: 'SHOE SOLE', hex: OUTFIT_PALETTE.o04.shoeSole },
];

function CameraLook({ at }: { at: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.lookAt(at[0], at[1], at[2]);
    camera.updateProjectionMatrix();
  }, [camera, at]);
  return null;
}

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#FFE9CE', '#B4A595', 0.4]} position={[0, 5, 0]} />
      <directionalLight
        castShadow
        position={[3, 6, 4]}
        intensity={1.0}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#7FB46A" roughness={0.95} />
      </mesh>
      {children}
    </>
  );
}

/**
 * 3 面図の 1 枚。Y 軸 rotation で character の向きを変える。
 *   front: rotY = 0       (顔がカメラ向き)
 *   right: rotY = -PI/2   (キャラ右側面がカメラ向き)
 *   back:  rotY = PI      (背面)
 */
function ViewPanel({
  rotY,
  label,
  dimsLabel,
  testId,
}: {
  rotY: number;
  label: string;
  dimsLabel?: string;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] p-3 shadow-toy"
      data-testid={testId}
    >
      <div className="flex w-full items-baseline justify-between text-[10px] font-mono tracking-widest text-[#7FE0FF]">
        <span>{label}</span>
        {dimsLabel ? <span className="text-[#5FBFE0]">{dimsLabel}</span> : null}
      </div>
      <div className="h-[280px] w-full overflow-hidden rounded-toy border border-[#2B6FB8] bg-gradient-to-b from-[#1E3A66] via-[#2B5AA2] to-[#3A7CC4]">
        <Canvas shadows camera={{ position: [0, 1.4, 5.6], fov: 26 }}>
          <CameraLook at={[0, 1.15, 0]} />
          <Scene>
            <Avatar3D
              avatarCode={S001_CODE}
              userId="s001"
              mode="idle"
              rotation={[0, rotY, 0]}
            />
          </Scene>
        </Canvas>
      </div>
    </div>
  );
}

function WalkFrame({ label, testId }: { label: string; testId: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-toy border border-[#2B6FB8] bg-[#0E1B2F] p-2"
      data-testid={testId}
    >
      <div className="h-[180px] w-full overflow-hidden rounded-toy border border-[#2B6FB8] bg-gradient-to-b from-[#1E3A66] via-[#2B5AA2] to-[#3A7CC4]">
        <Canvas shadows camera={{ position: [0, 1.4, 5.2], fov: 24 }}>
          <CameraLook at={[0, 1.15, 0]} />
          <Scene>
            <Avatar3D
              avatarCode={S001_CODE}
              userId={`s001-${label}`}
              mode="walking"
            />
          </Scene>
        </Canvas>
      </div>
      <span className="font-mono text-[9px] tracking-widest text-[#7FE0FF]">{label}</span>
    </div>
  );
}

/** 任意モードを 1 つ表示するパネル (idle / walking / wave / hifive)。 */
function ModeFrame({
  mode,
  label,
  testId,
}: {
  mode: 'idle' | 'walking' | 'wave' | 'hifive';
  label: string;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-toy border border-[#2B6FB8] bg-[#0E1B2F] p-2"
      data-testid={testId}
    >
      <div className="h-[230px] w-full overflow-hidden rounded-toy border border-[#2B6FB8] bg-gradient-to-b from-[#1E3A66] via-[#2B5AA2] to-[#3A7CC4]">
        <Canvas shadows camera={{ position: [0, 1.4, 5.0], fov: 26 }}>
          <CameraLook at={[0, 1.15, 0]} />
          <Scene>
            <Avatar3D avatarCode={S001_CODE} userId={`s001-mode-${mode}`} mode={mode} />
          </Scene>
        </Canvas>
      </div>
      <span className="font-mono text-[10px] tracking-widest text-[#7FE0FF]">{label}</span>
    </div>
  );
}

export default function AvataviS001Page() {
  return (
    <main
      className="min-h-screen bg-[#06101F] p-6 text-[#E8F2FF]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(43, 111, 184, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(43, 111, 184, 0.08) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        {/* タイトルバー */}
        <header
          className="rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] px-5 py-3 shadow-toy-lg"
          data-testid="s001-header"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs tracking-[0.3em] text-[#7FE0FF]">
                ─── CHARACTER REFERENCE BLUEPRINT v1.2 ───
              </span>
            </div>
            <span className="font-mono text-[10px] tracking-widest text-[#5FBFE0]">
              MODEL: AVATAVI PROTOTYPE ALPHA
            </span>
          </div>
        </header>

        {/* 3 面図 */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ViewPanel rotY={0} label="FRONT" dimsLabel="W:300" testId="s001-front" />
          <ViewPanel
            rotY={-Math.PI / 2}
            label="RIGHT SIDE"
            dimsLabel="H:275"
            testId="s001-right"
          />
          <ViewPanel rotY={Math.PI} label="BACK" dimsLabel="D:120" testId="s001-back" />
        </section>

        {/* WALK CYCLE (3 frames of the same walking animation) */}
        <section
          className="rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] p-3 shadow-toy"
          data-testid="s001-walkcycle"
        >
          <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] tracking-widest text-[#7FE0FF]">
            <span>ANIMATION: WALK CYCLE</span>
            <span className="text-[#5FBFE0]">LOOP / FRAME 1-3</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <WalkFrame label="WALK 1" testId="s001-walk-1" />
            <WalkFrame label="WALK 2" testId="s001-walk-2" />
            <WalkFrame label="WALK 3" testId="s001-walk-3" />
          </div>
        </section>

        {/* === ANIMATION GALLERY === (Phase M: 全モードのテスト用) */}
        <section
          className="rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] p-3 shadow-toy"
          data-testid="s001-anim-gallery"
        >
          <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] tracking-widest text-[#7FE0FF]">
            <span>ANIMATION GALLERY</span>
            <span className="text-[#5FBFE0]">idle / walking / wave / hi-five</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ModeFrame mode="idle"    label="IDLE"    testId="s001-mode-idle" />
            <ModeFrame mode="walking" label="WALKING" testId="s001-mode-walking" />
            <ModeFrame mode="wave"    label="WAVE"    testId="s001-mode-wave" />
            <ModeFrame mode="hifive"  label="HI-FIVE" testId="s001-mode-hifive" />
          </div>
        </section>

        {/* SPECIFICATIONS + COLOR PALETTE */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* SPEC */}
          <div
            className="rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] p-4"
            data-testid="s001-spec"
          >
            <h2 className="mb-3 font-mono text-[11px] tracking-widest text-[#7FE0FF]">
              SPECIFICATIONS
            </h2>
            <table className="w-full border-separate border-spacing-y-1 font-mono text-[11px] text-[#C9DEEF]">
              <tbody>
                <tr>
                  <td className="w-40 pr-2 text-[#5FBFE0]">CHARACTER ID:</td>
                  <td>S001</td>
                </tr>
                <tr>
                  <td className="pr-2 text-[#5FBFE0]">HAIR:</td>
                  <td>BICOLOR (G/P)</td>
                </tr>
                <tr>
                  <td className="pr-2 text-[#5FBFE0]">OUTFIT:</td>
                  <td>CASUAL_B1 (BLACK HOODIE + DENIM)</td>
                </tr>
                <tr>
                  <td className="pr-2 text-[#5FBFE0]">AVATAR CODE:</td>
                  <td>{S001_CODE}</td>
                </tr>
                <tr>
                  <td className="pr-2 text-[#5FBFE0]">REFERENCE:</td>
                  <td>characterimage1.png / characterimage2.png</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* COLOR PALETTE */}
          <div
            className="rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] p-4"
            data-testid="s001-palette"
          >
            <h2 className="mb-3 font-mono text-[11px] tracking-widest text-[#7FE0FF]">
              COLOR PALETTE
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {PALETTE_SWATCHES.map((sw) => (
                <div
                  key={sw.label}
                  className="flex items-center gap-2 rounded-toy border border-[#2B6FB8] bg-[#0A1628] p-2"
                  data-testid={`s001-swatch-${sw.label.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div
                    className="h-8 w-8 rounded-sm border border-[#5FBFE0]"
                    style={{ backgroundColor: sw.color }}
                  />
                  <div className="flex flex-col font-mono text-[9px] leading-tight text-[#C9DEEF]">
                    <span className="text-[#5FBFE0]">{sw.label}</span>
                    <span>{sw.hex.toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* フッター */}
        <footer className="rounded-toy border-2 border-[#2B6FB8] bg-[#0E1B2F] px-4 py-2 text-center font-mono text-[10px] tracking-[0.3em] text-[#7FE0FF]">
          ─── AVATAVI AVATAR REFERENCE - COMPLETE MODEL VIEWS ───
        </footer>
      </div>
    </main>
  );
}
