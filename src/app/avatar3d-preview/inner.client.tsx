'use client';

/**
 * Avatar3D の dev 検証ページ。
 * spec: docs/specs/avatar.md §10
 *
 * - 単体: avatar_code 入力 + mode 切替 + OrbitControls
 * - グリッド: 4 軸の表情・髪の代表組み合わせを 8 種並べる
 * - 群衆: 30 体を 1 Canvas で動かしてフレームレートを実感
 *
 * 本番ビルドでは layout.tsx で notFound 扱い。
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { Avatar3D, type Avatar3DMode } from '@/features/encounter/Avatar3D';

/**
 * 静止カメラの Canvas で、明示的に `target` を見るように lookAt を呼ぶヘルパー。
 * `camera={{ position: [...] }}` だけだと forward が `(0,0,-1)` 固定なので、
 * アバターが target より高い位置にあるとフレームから外れる。
 */
function CameraLook({ at }: { at: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.lookAt(at[0], at[1], at[2]);
    camera.updateProjectionMatrix();
  }, [camera, at]);
  return null;
}

const SAMPLES = [
  'b01_h01_o01_f01',
  'b02_h02_o02_f02',
  'b03_h03_o03_f03',
  'b04_h04_o04_f04',
  'b01_h02_o03',
  'b02_h01_o04',
  'b03_h04_o01',
  'b04_h03_o02',
];

const FACE_SAMPLES = [
  { code: 'b01_h02_o01_f01', label: 'f01 スマイル' },
  { code: 'b01_h02_o01_f02', label: 'f02 驚き' },
  { code: 'b01_h02_o01_f03', label: 'f03 どや' },
  { code: 'b01_h02_o01_f04', label: 'f04 ウインク' },
];

export default function Avatar3DPreviewPage() {
  const [code, setCode] = useState('b01_h02_o03_f01');
  const [mode, setMode] = useState<Avatar3DMode>('idle');

  // 群衆プレビュー: 30 体ぶんの座標と avatar_code をシード固定で生成
  const crowd = useMemo(() => generateCrowd(30), []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black tracking-wide text-pop-red">
          AVATAR 3D PREVIEW
        </h1>
        <code className="font-mono text-xs text-ink-muted" data-testid="avatar3d-code-top">
          {code}
        </code>
      </header>

      {/* 単体プレビュー */}
      <section className="rounded-toy border border-cream-deep bg-cream-soft p-4 shadow-toy">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold tracking-widest text-ink-soft">
            avatar_code
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 rounded-toy border border-cream-deep bg-cream-soft px-3 py-1.5 font-mono text-xs text-ink shadow-toy focus:border-pop-red focus:outline-none"
          />
          <div className="flex gap-1">
            {(['idle', 'walking'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-toy border-2 px-3 py-1 text-xs font-black tracking-widest shadow-toy transition active:translate-y-[3px] active:shadow-none ${
                  mode === m
                    ? 'border-pop-red bg-pop-red text-cream-soft'
                    : 'border-cream-deep bg-cream-soft text-ink-soft'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[360px] overflow-hidden rounded-toy border-2 border-ink bg-gradient-to-b from-[#FFB07A] via-[#FFC9B0] to-[#FAF1E0]">
          <Canvas shadows camera={{ position: [0, 1.4, 5.5], fov: 32 }}>
            <CameraLook at={[0, 1.0, 0]} />
            <PreviewScene>
              <Avatar3D avatarCode={code} userId={code} mode={mode} />
            </PreviewScene>
            <OrbitControls
              enablePan={false}
              target={[0, 1.0, 0]}
              minDistance={3}
              maxDistance={10}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2 + 0.1}
            />
          </Canvas>
        </div>
      </section>

      {/* リファレンス再現: characterimage.jpeg の AVATAVI STORE の女の子 */}
      <section className="rounded-toy border-2 border-pop-red bg-cream-soft p-4 shadow-toy-lg">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-black tracking-widest text-pop-red">
            REFERENCE GIRL (characterimage.jpeg)
          </h2>
          <code className="font-mono text-[10px] text-ink-muted">
            b04_h02_o04_f01 + override
          </code>
        </div>
        <div className="h-[300px] overflow-hidden rounded-toy border-2 border-ink bg-gradient-to-b from-[#FFB07A] via-[#FFC9B0] to-[#FAF1E0]">
          <Canvas shadows camera={{ position: [0, 1.3, 4.6], fov: 32 }}>
            <CameraLook at={[0, 1.0, 0]} />
            <PreviewScene>
              <Avatar3D
                avatarCode="b04_h05_o04_f01"
                userId="reference-girl"
              />
            </PreviewScene>
            <OrbitControls
              enablePan={false}
              target={[0, 1.0, 0]}
              minDistance={3}
              maxDistance={10}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2 + 0.1}
            />
          </Canvas>
        </div>
        <p className="mt-2 text-[10px] tracking-widest text-ink-muted">
          ピンクブラウンの髪 + 黒長袖 + デニム + 白スニーカーで再現。avatar_code
          の既定パレットを `colors` prop で個別上書き。
        </p>
      </section>

      {/* 表情 (face) 軸 — 1 Canvas に 4 体並べる (WebGL context 上限対策) */}
      <section className="rounded-toy border border-cream-deep bg-cream-soft p-4 shadow-toy">
        <h2 className="mb-3 text-sm font-black tracking-widest text-ink">
          FACE 軸 (f01-f04)
        </h2>
        <div className="h-[260px] overflow-hidden rounded-toy border border-cream-deep bg-gradient-to-b from-[#FFC9B0] to-[#FAF1E0]">
          <Canvas shadows camera={{ position: [0, 1.4, 5.0], fov: 30 }}>
            <CameraLook at={[0, 1.0, 0]} />
            <PreviewScene wide>
              {FACE_SAMPLES.map((s, i) => (
                <Avatar3D
                  key={s.code}
                  avatarCode={s.code}
                  userId={s.code}
                  position={[(i - 1.5) * 1.3, 0, 0]}
                />
              ))}
            </PreviewScene>
          </Canvas>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-3">
          {FACE_SAMPLES.map((s) => (
            <div
              key={s.code}
              data-testid={`face-${s.code}`}
              className="flex justify-center"
            >
              <span className="text-[10px] font-bold tracking-widest text-ink-soft">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 8 種一括 — 1 Canvas に 4×2 で並べる (z で前後 2 段) */}
      <section className="rounded-toy border border-cream-deep bg-cream-soft p-4 shadow-toy">
        <h2 className="mb-3 text-sm font-black tracking-widest text-ink">
          SAMPLES (8 codes)
        </h2>
        <div className="h-[300px] overflow-hidden rounded-toy border border-cream-deep bg-gradient-to-b from-[#FFC9B0] to-[#FAF1E0]">
          <Canvas shadows camera={{ position: [0, 1.8, 7.5], fov: 32 }}>
            <CameraLook at={[0, 1.0, 0]} />
            <PreviewScene wide>
              {SAMPLES.map((c, i) => {
                const col = i % 4;
                const row = Math.floor(i / 4);
                return (
                  <Avatar3D
                    key={c}
                    avatarCode={c}
                    userId={c}
                    position={[(col - 1.5) * 1.4, 0, row === 0 ? 0.9 : -0.9]}
                  />
                );
              })}
            </PreviewScene>
          </Canvas>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-3">
          {SAMPLES.map((c) => (
            <div
              key={c}
              data-testid={`sample-${c}`}
              className="flex justify-center"
            >
              <code className="font-mono text-[10px] text-ink-muted">{c}</code>
            </div>
          ))}
        </div>
      </section>

      {/* 30 体群衆 — 1 Canvas、フレームレートを実機で確認する用 */}
      <section className="rounded-toy border border-cream-deep bg-cream-soft p-4 shadow-toy">
        <h2 className="mb-3 text-sm font-black tracking-widest text-ink">
          CROWD ({crowd.length} 体 / 1 Canvas)
        </h2>
        <div className="h-[300px] overflow-hidden rounded-toy border-2 border-ink bg-gradient-to-b from-[#FFB07A] via-[#FFC9B0] to-[#FAF1E0]">
          <Canvas shadows camera={{ position: [0, 2.4, 9], fov: 38 }}>
            <CameraLook at={[0, 0.9, 0]} />
            <PreviewScene wide>
              {crowd.map((c) => (
                <Avatar3D
                  key={c.userId}
                  avatarCode={c.code}
                  userId={c.userId}
                  mode={c.mode}
                  position={[c.x, 0, c.z]}
                  rotation={[0, c.rotY, 0]}
                />
              ))}
            </PreviewScene>
            <OrbitControls
              enablePan={false}
              target={[0, 0.9, 0]}
              minDistance={3}
              maxDistance={14}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2 + 0.1}
            />
          </Canvas>
        </div>
        <p className="mt-2 text-[10px] tracking-widest text-ink-muted">
          ドラッグで視点回転 / スクロールでズーム。
          実機の中位 Android で 30fps 以上が広場 3D 化の最低ライン。
        </p>
      </section>

      {/* フォールバック確認 — 1 Canvas に 4 体並べる */}
      <section className="rounded-toy border border-dashed border-cream-deep p-3">
        <span className="text-[10px] tracking-widest text-ink-muted">
          フォールバック確認: 不正コードでも b01/h01/o01 にフォールバック
        </span>
        <div className="mt-2 h-[230px] overflow-hidden rounded-toy border border-cream-deep bg-gradient-to-b from-[#FFC9B0] to-[#FAF1E0]">
          <Canvas shadows camera={{ position: [0, 1.4, 5.0], fov: 30 }}>
            <CameraLook at={[0, 1.0, 0]} />
            <PreviewScene wide>
              {['', 'xyz', 'b99_h99_o99', 'b02_h05'].map((c, i) => (
                <Avatar3D
                  key={c || 'empty'}
                  avatarCode={c}
                  userId={c || 'empty'}
                  position={[(i - 1.5) * 1.3, 0, 0]}
                />
              ))}
            </PreviewScene>
          </Canvas>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-3">
          {['', 'xyz', 'b99_h99_o99', 'b02_h05'].map((c) => (
            <div
              key={c || 'empty'}
              data-testid={`fallback-${c || 'empty'}`}
              className="flex justify-center"
            >
              <code className="font-mono text-[10px] text-ink-muted">
                {c || '(empty)'}
              </code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/**
 * 30 体の座標 / avatarCode を決定論的に生成。
 * 実装は群衆プレビュー専用。実際の `EncounterPlaza` では `users_cache` から来る。
 */
function generateCrowd(n: number) {
  const out: Array<{
    userId: string;
    code: string;
    x: number;
    z: number;
    rotY: number;
    mode: Avatar3DMode;
  }> = [];
  // 簡易 LCG (頁内で seed 固定)
  let seed = 0xa5f3c19b;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < n; i++) {
    const b = ((next() * 4) | 0) + 1;
    const h = ((next() * 4) | 0) + 1;
    const o = ((next() * 4) | 0) + 1;
    const f = ((next() * 4) | 0) + 1;
    const code = `b0${b}_h0${h}_o0${o}_f0${f}`;
    // 横 -4..4、奥行き -2..2 にランダム散布
    const x = (next() - 0.5) * 8;
    const z = (next() - 0.5) * 3;
    const rotY = (next() - 0.5) * Math.PI;
    const mode: Avatar3DMode = next() < 0.4 ? 'walking' : 'idle';
    out.push({ userId: `crowd-${i}`, code, x, z, rotY, mode });
  }
  return out;
}

/**
 * ライト + 地面 (影を受ける plane) を共通化する。
 * `wide=true` で群衆ビュー用に shadow camera を広げる。
 */
function PreviewScene({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const span = wide ? 10 : 3;
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight
        args={['#FFE9CE', '#9C8D7A', 0.35]}
        position={[0, 5, 0]}
      />
      <directionalLight
        castShadow
        position={[3, 6, 4]}
        intensity={1.1}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-1}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      />
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#9FCB7A" roughness={0.95} />
      </mesh>
      {children}
    </>
  );
}
