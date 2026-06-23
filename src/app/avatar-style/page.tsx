'use client';

/**
 * StylizedPlazaAvatar の正面確認用 dev ページ。
 * 顔(眉/目/口)・帽子・小物・髪型を正面からまとめて目視できる。
 */
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { GENERATED_HEAD_PRESETS } from '@/features/encounter/generatedHeadPresets';
import { StylizedPlazaAvatar, type PlazaPalette } from '@/features/encounter/StylizedPlazaAvatar';

/** カメラを明示的に正面・全身が映る位置へ。 */
function CameraSetup() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, 1.0, 7.4);
    camera.lookAt(0, 1.0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

type Demo = { code: string; userId: string; overrides?: Partial<PlazaPalette> };

const ROW: Demo[] = [
  {
    code: 'b01_h01_o01_f01',
    userId: 'debug-bob',
    overrides: {
      hairShape: 'bob',
      hair: '#2A232B',
      hairAlt: '#43384A',
      ...GENERATED_HEAD_PRESETS.bob,
      face: 'focus',
      top: '#F2EFE3',
      bottom: '#252A33',
      shoe: '#20242A',
      sole: '#F1E8D8',
    },
  },
  {
    code: 'b01_h03_o02_f01',
    userId: 'debug-topknot',
    overrides: {
      hairShape: 'topknot',
      hair: '#6A4630',
      hairAlt: '#8A6247',
      ...GENERATED_HEAD_PRESETS.topknot,
      face: 'smile',
      top: '#E86A58',
      bottom: '#5D78A8',
      shoe: '#1F232A',
      sole: '#F4E7CA',
    },
  },
  {
    code: 'b02_h02_o03_f01',
    userId: 'debug-sweep',
    overrides: {
      hairShape: 'sweep',
      hair: '#17181F',
      hairAlt: '#333743',
      ...GENERATED_HEAD_PRESETS.sweep,
      face: 'focus',
      accessory: { kind: 'glasses', color: '#2C313C' },
      top: '#E0C34D',
      bottom: '#22222E',
      shoe: '#20242A',
      sole: '#F1E8D8',
    },
  },
  {
    code: 'b03_h04_o04_f01',
    userId: 'debug-tentacle',
    overrides: {
      hairShape: 'tentacle',
      hair: '#202028',
      hairAlt: '#393B46',
      ...GENERATED_HEAD_PRESETS.tentacle,
      face: 'wink',
      top: '#7BC46D',
      bottom: '#5E77A8',
      shoe: '#20242A',
      sole: '#F1E8D8',
    },
  },
  {
    code: 'b03_h05_o04_f01',
    userId: 'debug-cap',
    overrides: {
      hairShape: 'cap',
      hair: '#B58453',
      hairAlt: '#D7B17E',
      ...GENERATED_HEAD_PRESETS.cap,
      face: 'wink',
      hat: { kind: 'cap', color: '#E0584C', accent: '#F3EFE2' },
      top: '#5DB45A',
      bottom: '#5E77A8',
      shoe: '#20242A',
      sole: '#F1E8D8',
      backdrop: '#7FD3E0',
    },
  },
];

export default function AvatarStylePage() {
  return (
    <main className="fixed inset-0 bg-[#E0F7FA]" data-app-ready="true">
      <Canvas shadows camera={{ position: [0, 1.0, 7.4], fov: 34 }} dpr={[1, 2]}>
        <CameraSetup />
        <color attach="background" args={['#E6F6F4']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 8, 6]} intensity={1.5} castShadow />
        <directionalLight position={[-4, 3, -2]} intensity={0.4} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshToonMaterial color="#BFE3B6" />
        </mesh>
        {ROW.map((d, i) => (
          <StylizedPlazaAvatar
            key={d.userId}
            avatarCode={d.code}
            userId={d.userId}
            mode="idle"
            appearanceOverrides={d.overrides}
            position={[(i - (ROW.length - 1) / 2) * 1.5, 0, 0]}
          />
        ))}
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/30 px-3 py-1 text-xs font-black text-white">
        avatar-style — 正面確認（bob / topknot / sweep / tentacle / cap）
      </div>
    </main>
  );
}
