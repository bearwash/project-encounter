'use client';

/**
 * 広場ビュー (3D) の背景: 地面 + 街灯 + ベンチ + 桜の木。
 * spec: docs/specs/encounter-plaza.md §4.1.1 / docs/specs/avatar.md §10.6
 *
 * - 地面: 緑芝生の plane (receiveShadow)
 * - 街灯: 細い cylinder (柱) + emissive sphere (灯り)
 * - ベンチ: 茶色 box (座面) + 細 box × 2 (脚)
 * - 桜: 茶色 cylinder (幹) + ピンク sphere の塊 (花)
 *
 * 配置はステージ幅に合わせて自動的にスケール。
 * 街灯の emissive はバッテリー懸念で控えめに (要件 §3.3 「派手な発光は避ける」)。
 */

type Props = {
  /** 3D unit のステージ幅 (例: 16)。横スクロール時はもっと広くなる。 */
  stageWidth: number;
  /** 1 unit ≈ 80px 換算で、奥行きは 3〜4 unit を想定。 */
  depth?: number;
};

export function Plaza3DBackground({ stageWidth, depth = 4 }: Props) {
  return (
    <group>
      {/* 地面 (芝生) */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <planeGeometry args={[stageWidth + 8, depth * 4]} />
        <meshStandardMaterial color="#7BB35E" roughness={0.95} />
      </mesh>

      {/* 散歩道 (中央に細長い土色の plane) */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
      >
        <planeGeometry args={[stageWidth + 8, 0.8]} />
        <meshStandardMaterial color="#C2A36B" roughness={0.95} />
      </mesh>

      {/* 街灯 3 本 — ステージ幅に比例して配置 */}
      <Lamp position={[-stageWidth * 0.38, 0, -depth * 0.5]} />
      <Lamp position={[0, 0, -depth * 0.5]} />
      <Lamp position={[stageWidth * 0.42, 0, -depth * 0.5]} />

      {/* ベンチ 2 つ */}
      <Bench position={[-stageWidth * 0.15, 0, depth * 0.35]} rotationY={0.1} />
      <Bench position={[stageWidth * 0.28, 0, depth * 0.4]} rotationY={-0.2} />

      {/* 桜の木 2 本 */}
      <SakuraTree position={[-stageWidth * 0.28, 0, -depth * 0.7]} scale={1.1} />
      <SakuraTree position={[stageWidth * 0.18, 0, -depth * 0.75]} scale={0.95} />
    </group>
  );
}

// =============================================================
// 街灯: 柱 (細 cylinder) + 笠 (cone) + 灯り (sphere 黄色)
// =============================================================
function Lamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* 柱 */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.04, 0.05, 2.4, 12]} />
        <meshStandardMaterial color="#3B2A1E" roughness={0.7} />
      </mesh>
      {/* 笠 */}
      <mesh position={[0, 2.42, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.18, 0.18, 16]} />
        <meshStandardMaterial color="#3B2A1E" roughness={0.7} />
      </mesh>
      {/* 灯り (emissive を控えめに、要件 §3.3 派手発光禁止) */}
      <mesh position={[0, 2.28, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial
          color="#FFE17A"
          emissive="#FFD23F"
          emissiveIntensity={0.6}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

// =============================================================
// ベンチ: 座面 box + 脚 box × 2
// =============================================================
function Bench({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 座面 */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.08, 0.32]} />
        <meshStandardMaterial color="#9C6B45" roughness={0.7} />
      </mesh>
      {/* 背もたれ */}
      <mesh position={[0, 0.5, -0.12]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.32, 0.06]} />
        <meshStandardMaterial color="#9C6B45" roughness={0.7} />
      </mesh>
      {/* 脚 (左右) */}
      <mesh position={[-0.42, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.06, 0.3, 0.3]} />
        <meshStandardMaterial color="#5B4A3B" roughness={0.7} />
      </mesh>
      <mesh position={[0.42, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.06, 0.3, 0.3]} />
        <meshStandardMaterial color="#5B4A3B" roughness={0.7} />
      </mesh>
    </group>
  );
}

// =============================================================
// 桜の木: 幹 (cylinder) + 花のかたまり (pink sphere 群)
// =============================================================
function SakuraTree({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const branches: Array<[number, number, number, number]> = [
    // x, y, z, radius
    [0, 2.2, 0, 0.7],
    [-0.5, 2.0, 0.2, 0.55],
    [0.55, 1.9, -0.1, 0.5],
    [0.05, 2.6, 0.0, 0.45],
    [-0.2, 1.8, -0.3, 0.42],
  ];
  return (
    <group position={position} scale={scale}>
      {/* 幹 */}
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.18, 2.0, 12]} />
        <meshStandardMaterial color="#5B4A3B" roughness={0.85} />
      </mesh>
      {/* 花のかたまり (重ね球) */}
      {branches.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <sphereGeometry args={[r, 16, 12]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#FFC0CB' : '#FFD3D9'}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}
