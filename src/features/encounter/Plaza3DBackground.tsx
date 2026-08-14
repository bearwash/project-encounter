'use client';

/**
 * Island plaza scenery built from Three.js primitives.
 * The scene keeps geometry cheap but gives the plaza a dense, walkable feel:
 * water, island base, paved square, shops, ramps, railings, lamps, trees, and
 * paint-like ground marks.
 */

import { Outlines, RoundedBox, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Box3,
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  EdgesGeometry,
  Euler,
  InstancedMesh,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  Object3D,
  Quaternion,
  Shape,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Vec3 = [number, number, number];

type Props = {
  plazaRadius: number;
};

const INK = '#27313A';
const MODEL_ROOT = '/models/';
const HIGH_TREE_MODEL_FILE = 'meshy_high_tree.glb';
const PARK_RADIUS = 30;
const FENCE_RADIUS = 29.35;
const WATER_LEVEL = -0.86;
const MODEL_FILES = {
  roundTopiary: 'round_topiary.glb',
  parkBench: 'park_bench.glb',
  fountain: 'fountain.glb',
  streetLamp: 'street_lamp.glb',
  bush: 'bush.glb',
  storybookHedge: 'storybook_hedge_segment.glb',
  woodFenceA: 'wood_fence_segment_a.glb',
  woodFenceB: 'wood_fence_segment_b.glb',
  woodFenceC: 'wood_fence_segment_c.glb',
  meshyParkEntranceSign: 'meshy_park_entrance_sign.glb',
  meshyWoodRailSegment: 'meshy_wood_rail_segment.glb',
  meshyFlowerClump: 'meshy_flower_clump.glb',
  meshyPathGrassTuft: 'meshy_path_grass_tuft.glb',
  meshyStoneCluster: 'meshy_stone_cluster.glb',
  meshyLowGroveMound: 'meshy_low_grove_mound.glb',
  meshyLowPathTree: 'meshy_low_path_tree.glb',
  meshyParkEntranceGate: 'meshy_park_entrance_gate.glb',
  meshyParkGazebo: 'meshy_park_gazebo.glb',
  meshyPlaygroundSlide: 'meshy_playground_slide.glb',
} as const;

type ModelKey = keyof typeof MODEL_FILES;
const MODEL_KEY_BY_FILE = new Map<string, ModelKey>(
  Object.entries(MODEL_FILES).map(([key, file]) => [file, key as ModelKey]),
);

// The default plaza uses an abstract procedural background, so avoid eager GLB
// preloading. The detailed model path below still lazy-loads assets if reused.
type ModelPlacement = {
  key: string;
  model: ModelKey;
  position: Vec3;
  rotation: Vec3;
  targetHeight: number;
  color: string | string[];
};

const PARK_BENCH_SLOTS = [
  { key: 'bench-north-walk-west', position: [-4.05, 0, 10.8] as Vec3, rotationY: Math.PI / 2 },
  { key: 'bench-south-walk-east', position: [4.15, 0, -10.6] as Vec3, rotationY: -Math.PI / 2 },
  { key: 'bench-east-walk-north', position: [11.85, 0, 3.8] as Vec3, rotationY: Math.PI },
  { key: 'bench-west-walk-south', position: [-11.65, 0, -3.75] as Vec3, rotationY: 0 },
  { key: 'bench-diagonal-grove', position: [9.55, 0, 15.08] as Vec3, rotationY: Math.PI * 0.75 },
] as const;

function isInsideBenchFrontClearance(x: number, z: number) {
  return PARK_BENCH_SLOTS.some((bench) => {
    const frontX = Math.sin(bench.rotationY);
    const frontZ = Math.cos(bench.rotationY);
    const sideX = Math.cos(bench.rotationY);
    const sideZ = -Math.sin(bench.rotationY);
    const dx = x - bench.position[0];
    const dz = z - bench.position[2];
    const frontDistance = dx * frontX + dz * frontZ;
    const sideDistance = Math.abs(dx * sideX + dz * sideZ);

    return frontDistance > -0.25 && frontDistance < 3.55 && sideDistance < 2.15;
  });
}

function isInsideStartingCameraClearance(x: number, z: number) {
  return z > 17.4 && z < 27.8 && Math.abs(x) < 5.8;
}

function isInsideEntranceGateClearance(x: number, z: number) {
  return Math.abs(x) < 7.2 && Math.abs(z) > 21.2;
}

function isInsideMainWalkwayClearance(x: number, z: number) {
  const radial = Math.hypot(x, z);
  if (radial < 6.8) return true;

  const pathHalfWidth = radial > 18 ? 2.35 : 2.05;
  const pathLines = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75];
  return pathLines.some((angle) => {
    const sideDistance = Math.abs(x * -Math.sin(angle) + z * Math.cos(angle));
    const alongDistance = Math.abs(x * Math.cos(angle) + z * Math.sin(angle));
    return alongDistance < 25.8 && sideDistance < pathHalfWidth;
  });
}

const MODEL_COLOR_PALETTES: Record<ModelKey, string[]> = {
  roundTopiary: ['#5FA85A', '#74B76A', '#8BCB73', '#4F9761'],
  parkBench: ['#B96F3C', '#D08B45', '#8B5B37'],
  fountain: ['#8BD7E1', '#C9F3EF', '#F5E9B7'],
  streetLamp: ['#F3D56E', '#38474A', '#FFF5B8'],
  bush: ['#78C96D', '#9DD978', '#65B66C'],
  storybookHedge: ['#5FAE62', '#8DD77A', '#58A95D', '#F6DF7A', '#F0A3B5'],
  woodFenceA: ['#7A4E31', '#A96A3F', '#C98A4A', '#E2B26F'],
  woodFenceB: ['#6E4328', '#9C6338', '#BD7B42', '#D9A45E'],
  woodFenceC: ['#74482C', '#A66B3E', '#C6884B', '#E0B56A'],
  meshyParkEntranceSign: ['#7A4E31', '#F2E5BC', '#67B96A', '#69BFD0'],
  meshyWoodRailSegment: ['#7A4E31', '#A96A3F', '#C98A4A', '#E2B26F'],
  meshyFlowerClump: ['#70BF65', '#F3D35B', '#F49BB8', '#E95B4D', '#69BFD0'],
  meshyPathGrassTuft: ['#5FAE62', '#83CB6F', '#F2D567'],
  meshyStoneCluster: ['#EEE4C7', '#D6C8A2', '#BFAF8B'],
  meshyLowGroveMound: ['#4F9F58', '#6BB765', '#7CC56D', '#3B8754'],
  meshyLowPathTree: ['#7A4E31', '#5DAE62', '#72C66A', '#8AD577'],
  meshyParkEntranceGate: ['#7A4E31', '#A96A3F', '#F2E5BC', '#67B96A', '#69BFD0'],
  meshyParkGazebo: ['#9C6338', '#F2E5BC', '#8FD3BC', '#BFE8D6'],
  meshyPlaygroundSlide: ['#F4C44D', '#64C9B8', '#EEF2EA', '#5F7E8A', '#D99B35'],
};

export function Plaza3DBackground({ plazaRadius }: Props) {
  return <MessengerRoadPlazaScene plazaRadius={plazaRadius} />;
}

function MessengerRoadPlazaScene({ plazaRadius }: Props) {
  const trees = useMemo(makeAbstractTrees, []);
  const lamps = useMemo(makeAbstractLamps, []);
  const benches = useMemo(makeAbstractBenches, []);
  const flowerBeds = useMemo(makeAbstractFlowerBeds, []);
  const hedges = useMemo(makeAbstractHedges, []);
  const pavilions = useMemo(makeAbstractPavilions, []);
  const waterJets = useMemo(makeAbstractWaterJets, []);
  const showModelDetails = useDeferredPlazaModels();
  const plaza = Math.min(plazaRadius, PARK_RADIUS);

  return (
    <group>
      <MessengerSkyLayer />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL - 0.08, 0]}>
        <planeGeometry args={[180, 180]} />
        <meshBasicMaterial color="#61C3BE" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL + 0.02, 0]}>
        <ringGeometry args={[plaza + 1.2, plaza + 10.2, 80]} />
        <meshBasicMaterial color="#9FE8DF" transparent opacity={0.28} />
      </mesh>

      <MessengerIslandBody plaza={plaza} />
      <group position={[0, -0.25, -14.5]} scale={0.62}>
        <MessengerStreetFrame />
      </group>
      <MessengerRoadLayer />
      <MessengerStationPlatform />
      <MessengerNeighborhoodLandmarks />
      <MessengerStreetFurniture lamps={lamps} benches={benches} />
      <AbstractTreeInstances trees={trees} />
      <AbstractFlowerBedInstances beds={flowerBeds} />
      <AbstractHedgeInstances hedges={hedges} />
      {pavilions.map((pavilion) => (
        <AbstractPavilion
          key={pavilion.key}
          position={pavilion.position}
          rotationY={pavilion.rotationY}
          color={pavilion.color}
        />
      ))}
      <MessengerParkFeature waterJets={waterJets} />
      <AbstractPlayground />
      <AbstractGate position={[0, 0, 25.35]} rotationY={Math.PI} />
      <AbstractGate position={[0, 0, -25.35]} rotationY={0} />
      <DeferredExistingModelLayer enabled={showModelDetails} />
    </group>
  );
}

function MessengerSkyLayer() {
  const clouds = [
    { key: 'cloud-l', position: [-34, 14.5, -54] as Vec3, scale: [15, 3.2, 1] as Vec3, rotation: -0.08, opacity: 0.62 },
    { key: 'cloud-c', position: [-2, 18.8, -58] as Vec3, scale: [24, 4.8, 1] as Vec3, rotation: 0.04, opacity: 0.56 },
    { key: 'cloud-r', position: [34, 12.6, -52] as Vec3, scale: [17, 3.4, 1] as Vec3, rotation: 0.1, opacity: 0.52 },
    { key: 'cloud-low', position: [18, 8.6, -46] as Vec3, scale: [28, 2.5, 1] as Vec3, rotation: -0.02, opacity: 0.24 },
  ];

  return (
    <group>
      <mesh position={[0, 2.3, -38]} rotation={[-0.15, 0, 0]} scale={[42, 4.6, 1]}>
        <circleGeometry args={[1, 42]} />
        <meshBasicMaterial color="#9FE4DC" fog={false} transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <mesh position={[24, 1.2, -34]} rotation={[-0.12, 0, 0.08]} scale={[24, 3.4, 1]}>
        <circleGeometry args={[1, 34]} />
        <meshBasicMaterial color="#78D1C9" fog={false} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      {clouds.map((cloud) => (
        <mesh
          key={cloud.key}
          position={cloud.position}
          rotation={[0, 0, cloud.rotation]}
          scale={cloud.scale}
        >
          <circleGeometry args={[1, 34]} />
          <meshBasicMaterial color="#B9F0E6" fog={false} transparent opacity={cloud.opacity} depthWrite={false} />
        </mesh>
      ))}
      <Cloud position={[-22, 12.8, -54]} scale={1.45} />
      <Cloud position={[18, 11.6, -50]} scale={1.08} />
      <Bird position={[-9.2, 11.6, -42]} rotationY={0.18} />
      <Bird position={[13.8, 10.2, -46]} rotationY={-0.14} />
    </group>
  );
}

function MessengerIslandBody({ plaza }: { plaza: number }) {
  return (
    <group>
      <mesh position={[0, -0.34, 0]}>
        <cylinderGeometry args={[plaza, plaza * 0.92, 0.7, 60]} />
        <meshBasicMaterial color="#6CB760" />
      </mesh>
      <mesh position={[0, -0.7, 1.4]} scale={[1, 0.32, 1]}>
        <cylinderGeometry args={[plaza * 0.98, plaza * 0.72, 1.2, 60]} />
        <meshBasicMaterial color="#D9D1AA" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[23.8, 29.4, 88]} />
        <meshBasicMaterial color="#3F8F56" transparent opacity={0.42} />
      </mesh>
    </group>
  );
}

function MessengerRoadLayer() {
  const roadColor = '#6F8D8B';
  const edgeColor = '#F0F0DA';
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[0, 0.044, 7.4]}>
        <planeGeometry args={[10.2, 51.2]} />
        <meshBasicMaterial color="#2D4A4B" transparent opacity={0.28} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[0, 0.052, 7.4]}>
        <planeGeometry args={[9.2, 50]} />
        <meshBasicMaterial color={roadColor} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.55]} position={[-10.5, 0.05, -5.6]}>
        <planeGeometry args={[8.5, 31]} />
        <meshBasicMaterial color="#2D4A4B" transparent opacity={0.22} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.55]} position={[-10.5, 0.058, -5.6]}>
        <planeGeometry args={[7.6, 30]} />
        <meshBasicMaterial color="#789A96" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[-5.26, 0.068, 7.4]}>
        <planeGeometry args={[0.12, 49.4]} />
        <meshBasicMaterial color="#2D4A4B" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[5.26, 0.068, 7.4]}>
        <planeGeometry args={[0.12, 49.4]} />
        <meshBasicMaterial color="#2D4A4B" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[-4.95, 0.07, 7.4]}>
        <planeGeometry args={[0.34, 48]} />
        <meshBasicMaterial color={edgeColor} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[4.95, 0.07, 7.4]}>
        <planeGeometry args={[0.34, 48]} />
        <meshBasicMaterial color={edgeColor} />
      </mesh>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, -0.12]}
          position={[0.2, 0.08, -12 + index * 8.8]}
        >
          <planeGeometry args={[0.22, 3.6]} />
          <meshBasicMaterial color="#E6E9D8" transparent opacity={0.82} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, -0.12]} position={[0, 0.082, 8.4]}>
        <circleGeometry args={[3.4, 5]} />
        <meshBasicMaterial color="#617F7E" transparent opacity={0.42} />
      </mesh>
      {[-7.5, -2.2, 5.4, 12.8].map((z, index) => (
        <mesh
          key={`road-ink-${index}`}
          rotation={[-Math.PI / 2, 0, -0.12 + index * 0.015]}
          position={[-2.7 + (index % 2) * 4.8, 0.09, z]}
        >
          <planeGeometry args={[2.8, 0.06]} />
          <meshBasicMaterial color="#243B3D" transparent opacity={0.26} />
        </mesh>
      ))}
    </group>
  );
}

function MessengerStationPlatform() {
  return (
    <group position={[-11.6, 0.1, -12.2]} rotation={[0, -0.18, 0]}>
      <mesh position={[0, 0.34, 0]} scale={[7.2, 0.32, 4.4]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#B9B69A" />
      </mesh>
      <mesh position={[-1.4, 1.52, -0.6]} scale={[1.0, 2.7, 0.34]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#98CF9A" />
      </mesh>
      <mesh position={[0.02, 1.48, -0.68]} scale={[0.72, 2.3, 0.28]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#82B982" />
      </mesh>
      <mesh position={[1.7, 2.45, -0.52]} scale={[0.16, 4.7, 0.16]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#596E67" />
      </mesh>
      <mesh position={[0.7, 0.95, 2.18]} scale={[5.2, 0.1, 0.12]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#F0F2DF" />
      </mesh>
      {[-2.1, -0.8, 0.5, 1.8].map((x) => (
        <mesh key={x} position={[x, 0.62, 2.18]} scale={[0.08, 1.0, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#536762" />
        </mesh>
      ))}
    </group>
  );
}

function MessengerNeighborhoodLandmarks() {
  return (
    <group>
      <group position={[13.2, 0.12, -12.4]} rotation={[0, -0.36, 0]}>
        <mesh position={[0, 0.72, 0]} scale={[2.2, 1.3, 1.25]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#D85A4F" />
        </mesh>
        <mesh position={[0, 1.48, 0]} rotation={[0, 0, Math.PI / 4]} scale={[1.72, 0.18, 1.72]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#F1F0DF" />
        </mesh>
        <mesh position={[0.62, 0.72, -0.64]} scale={[0.45, 0.44, 0.06]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#31505A" />
        </mesh>
        <mesh position={[-0.68, 0.62, -0.64]} scale={[0.34, 0.54, 0.06]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#F0EAD4" />
        </mesh>
      </group>

      <group position={[9.6, 0.52, -1.8]} rotation={[0, -0.24, 0]}>
        {Array.from({ length: 6 }).map((_, index) => (
          <mesh key={`rail-post-${index}`} position={[index * 1.15, 0.26, 0]}>
            <boxGeometry args={[0.08, 0.52, 0.1]} />
            <meshBasicMaterial color="#F1F2E6" />
          </mesh>
        ))}
        <mesh position={[2.86, 0.58, 0]} scale={[6.3, 0.12, 0.12]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#F1F2E6" />
        </mesh>
        <mesh position={[2.86, 0.32, 0.05]} scale={[6.2, 0.06, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#4B6561" />
        </mesh>
      </group>

      <group position={[11.4, 0.2, 2.8]} rotation={[0, -0.18, 0]}>
        <mesh position={[0, 0.85, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 1.7, 6]} />
          <meshBasicMaterial color="#6C493A" />
        </mesh>
        <mesh position={[0, 1.66, 0]} rotation={[0.08, 0, 0.18]} scale={[0.72, 0.72, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#EBEFE5" />
        </mesh>
        <mesh position={[0, 1.66, -0.055]} rotation={[0.08, 0, 0.18]} scale={[0.44, 0.08, 0.04]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#506970" />
        </mesh>
      </group>

      {[
        [-17.5, 0, -9.5, 1.0],
        [-20.8, 0, -3.8, 0.82],
        [18.5, 0, -7.4, 0.96],
        [21.8, 0, -3.2, 0.76],
      ].map(([x, y, z, scale], index) => (
        <group key={`lumpy-tree-${index}`} position={[x, y, z]} scale={scale}>
          <mesh position={[0, 0.82, 0]}>
            <cylinderGeometry args={[0.12, 0.18, 1.65, 6]} />
            <meshBasicMaterial color="#6C493A" />
          </mesh>
          <mesh position={[0, 1.78, 0]} scale={[0.88, 0.78, 0.72]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial color="#3F8F56" />
          </mesh>
          <mesh position={[0.42, 1.62, 0.16]} scale={[0.58, 0.48, 0.46]}>
            <sphereGeometry args={[1, 10, 7]} />
            <meshBasicMaterial color="#4EA064" />
          </mesh>
          <mesh position={[-0.36, 1.56, -0.08]} scale={[0.54, 0.44, 0.42]}>
            <sphereGeometry args={[1, 10, 7]} />
            <meshBasicMaterial color="#367D50" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MessengerStreetFurniture({
  lamps,
  benches,
}: {
  lamps: ReturnType<typeof makeAbstractLamps>;
  benches: ReturnType<typeof makeAbstractBenches>;
}) {
  return (
    <group>
      <AbstractLampInstances lamps={lamps} />
      <AbstractBenchInstances benches={benches} />
      <mesh position={[9.2, 2.5, -11]} rotation={[0, -0.16, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 5.0, 7]} />
        <meshBasicMaterial color="#526963" />
      </mesh>
      <mesh position={[8.8, 4.6, -11.6]} rotation={[0, -0.16, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 2.1, 6]} />
        <meshBasicMaterial color="#526963" />
      </mesh>
      <mesh position={[14.6, 1.8, -8.2]} rotation={[0, 0.28, -0.18]}>
        <cylinderGeometry args={[0.08, 0.1, 3.4, 7]} />
        <meshBasicMaterial color="#6C7A72" />
      </mesh>
      <mesh position={[14.2, 3.45, -8.5]} rotation={[0, 0.28, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 1.3, 6]} />
        <meshBasicMaterial color="#6C7A72" />
      </mesh>
    </group>
  );
}

function MessengerParkFeature({ waterJets }: { waterJets: ReturnType<typeof makeAbstractWaterJets> }) {
  void waterJets;

  return (
    <group position={[0, 0, 0]}>
      <StorybookFountain />
    </group>
  );
}

function AbstractParkPlazaScene({ plazaRadius }: Props) {
  const trees = useMemo(makeAbstractTrees, []);
  const skyline = useMemo(makeAbstractSkyline, []);
  const lamps = useMemo(makeAbstractLamps, []);
  const benches = useMemo(makeAbstractBenches, []);
  const pathMarks = useMemo(makeAbstractPathMarks, []);
  const flowerBeds = useMemo(makeAbstractFlowerBeds, []);
  const hedges = useMemo(makeAbstractHedges, []);
  const pavilions = useMemo(makeAbstractPavilions, []);
  const waterJets = useMemo(makeAbstractWaterJets, []);
  const showModelDetails = useDeferredPlazaModels();
  const plaza = Math.min(plazaRadius, PARK_RADIUS);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]}>
        <planeGeometry args={[150, 150]} />
        <meshBasicMaterial color="#5CBFBA" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL + 0.025, 0]}>
        <ringGeometry args={[plaza + 2.4, plaza + 8.4, 72]} />
        <meshBasicMaterial color="#8BDED7" transparent opacity={0.34} />
      </mesh>

      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[plaza, plaza, 0.44, 72]} />
        <meshToonMaterial color="#77C96A" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[25.4, 29.15, 96]} />
        <meshBasicMaterial color="#5FAE62" transparent opacity={0.42} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[5.15, 6.2, 56]} />
        <meshToonMaterial color="#E1CE95" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[18.4, 19.75, 72]} />
        <meshToonMaterial color="#E1CE95" />
      </mesh>
      {[0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75].map((angle) => (
        <mesh key={angle} rotation={[-Math.PI / 2, 0, angle]} position={[0, 0.026, 0]}>
          <planeGeometry args={[2.65, 50.8]} />
          <meshToonMaterial color="#E1CE95" />
        </mesh>
      ))}
      {[Math.PI / 8, Math.PI * 0.625, Math.PI * 1.125, Math.PI * 1.625].map((angle) => (
        <mesh key={`garden-ribbon-${angle}`} rotation={[-Math.PI / 2, 0, angle]} position={[0, 0.031, 0]}>
          <planeGeometry args={[1.05, 45.5]} />
          <meshBasicMaterial color="#F2D567" transparent opacity={0.42} />
        </mesh>
      ))}

      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[3.05, 3.36, 0.32, 48]} />
        <meshToonMaterial color="#D8CDAE" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <circleGeometry args={[2.5, 44]} />
        <meshBasicMaterial color="#88D7E1" transparent opacity={0.86} />
      </mesh>
      <mesh position={[0, 0.46, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.55, 0.16, 10, 48]} />
        <meshToonMaterial color="#EFE2B8" />
      </mesh>
      <ProceduralFountainTop />
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.34, 16, 10]} />
        <meshBasicMaterial color="#DDF8F3" transparent opacity={0.9} />
      </mesh>
      {waterJets.map((jet) => (
        <mesh key={jet.key} position={jet.position} rotation={jet.rotation}>
          <cylinderGeometry args={[0.025, 0.014, jet.height, 6]} />
          <meshBasicMaterial color="#BFF2F0" transparent opacity={0.72} />
        </mesh>
      ))}

      {pathMarks.map((mark) => (
        <mesh
          key={mark.key}
          rotation={[-Math.PI / 2, 0, mark.rotation]}
          position={mark.position}
          scale={mark.scale}
        >
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial color={mark.color} transparent opacity={mark.opacity} />
        </mesh>
      ))}
      <AbstractFlowerBedInstances beds={flowerBeds} />

      <group position={[0, 0, -34]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[58, 8]} />
          <meshBasicMaterial color="#AEB9A9" />
        </mesh>
        {skyline.map((block) => (
          <mesh
            key={block.key}
            position={block.position}
            rotation={[0, block.rotationY, 0]}
          >
            <boxGeometry args={block.args} />
            <meshToonMaterial color={block.color} />
          </mesh>
        ))}
      </group>

      <AbstractTreeInstances trees={trees} />
      <AbstractHedgeInstances hedges={hedges} />
      {pavilions.map((pavilion) => (
        <AbstractPavilion
          key={pavilion.key}
          position={pavilion.position}
          rotationY={pavilion.rotationY}
          color={pavilion.color}
        />
      ))}
      <AbstractLampInstances lamps={lamps} />
      <AbstractBenchInstances benches={benches} />
      <AbstractPlayground />
      <AbstractGate position={[0, 0, 25.35]} rotationY={Math.PI} />
      <AbstractGate position={[0, 0, -25.35]} rotationY={0} />
      <DeferredExistingModelLayer enabled={showModelDetails} />
    </group>
  );
}

function useDeferredPlazaModels() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (enabled) return;
    let cancelled = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleHandle: number | null = null;

    const timer = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(
          () => {
            if (!cancelled) setEnabled(true);
          },
          { timeout: 2600 },
        );
        return;
      }
      if (!cancelled) setEnabled(true);
    }, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, [enabled]);

  return enabled;
}

function DeferredExistingModelLayer({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <ModelAsset
        file={MODEL_FILES.fountain}
        position={[0, 0.36, 0]}
        rotation={[0, 0, 0]}
        targetHeight={1.48}
        color={MODEL_COLOR_PALETTES.fountain}
        includeOutline={false}
        castShadow={false}
        receiveShadow={false}
      />
      <ModelAsset
        file={MODEL_FILES.meshyParkGazebo}
        position={[21.2, 0, 10.4]}
        rotation={[0, -0.9, 0]}
        targetHeight={3.0}
        color={MODEL_COLOR_PALETTES.meshyParkGazebo}
        includeOutline={false}
        castShadow={false}
        receiveShadow={false}
      />
      <ModelAsset
        file={MODEL_FILES.meshyPlaygroundSlide}
        position={[-23.46, 0.06, 17.18]}
        rotation={[0, 0.4, 0]}
        targetHeight={1.12}
        color={MODEL_COLOR_PALETTES.meshyPlaygroundSlide}
        preserveMaterial
        includeOutline={false}
        castShadow={false}
        receiveShadow={false}
      />
      <ModelAsset
        file={MODEL_FILES.meshyLowPathTree}
        position={[-18.4, 0, -8.7]}
        rotation={[0, 0.18, 0]}
        targetHeight={3.55}
        color={MODEL_COLOR_PALETTES.meshyLowPathTree}
        includeOutline={false}
        castShadow={false}
        receiveShadow={false}
      />
      <ModelAsset
        file={MODEL_FILES.meshyLowPathTree}
        position={[18.2, 0, -9.8]}
        rotation={[0, -0.24, 0]}
        targetHeight={3.35}
        color={MODEL_COLOR_PALETTES.meshyLowPathTree}
        includeOutline={false}
        castShadow={false}
        receiveShadow={false}
      />
    </Suspense>
  );
}

function AbstractTree({
  position,
  scale,
  color,
}: {
  position: Vec3;
  scale: number;
  color: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.4, 6]} />
        <meshToonMaterial color="#8B5B37" />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <coneGeometry args={[0.78, 1.55, 7]} />
        <meshToonMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.28, 0]}>
        <coneGeometry args={[0.58, 1.25, 7]} />
        <meshToonMaterial color="#82C86C" />
      </mesh>
    </group>
  );
}

function AbstractTreeInstances({
  trees,
}: {
  trees: ReturnType<typeof makeAbstractTrees>;
}) {
  const trunkRef = useRef<InstancedMesh>(null);
  const lowerRef = useRef<InstancedMesh>(null);
  const upperRef = useRef<InstancedMesh>(null);
  const temp = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    trees.forEach((tree, index) => {
      setTreeInstance(trunkRef.current, index, temp, tree.position, [0, 0.7, 0], tree.scale);
      setTreeColor(trunkRef.current, index, color, '#8B5B37');
      setTreeInstance(lowerRef.current, index, temp, tree.position, [0, 1.62, 0], tree.scale);
      setTreeColor(lowerRef.current, index, color, tree.color);
      setTreeInstance(upperRef.current, index, temp, tree.position, [0, 2.28, 0], tree.scale);
      setTreeColor(upperRef.current, index, color, '#82C86C');
    });

    finalizeTreeInstances(trunkRef.current, trees.length);
    finalizeTreeInstances(lowerRef.current, trees.length);
    finalizeTreeInstances(upperRef.current, trees.length);
  }, [color, temp, trees]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <cylinderGeometry args={[0.12, 0.18, 1.4, 6]} />
        <meshBasicMaterial color="#7A4E31" />
      </instancedMesh>
      <instancedMesh ref={lowerRef} args={[undefined, undefined, trees.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <coneGeometry args={[0.78, 1.55, 7]} />
        <meshBasicMaterial color="#4F9F58" />
      </instancedMesh>
      <instancedMesh ref={upperRef} args={[undefined, undefined, trees.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <coneGeometry args={[0.58, 1.25, 7]} />
        <meshBasicMaterial color="#82C86C" />
      </instancedMesh>
    </group>
  );
}

function setTreeInstance(
  mesh: InstancedMesh | null,
  index: number,
  temp: Object3D,
  rootPosition: Vec3,
  localPosition: Vec3,
  scale: number,
) {
  if (!mesh) return;
  temp.position.set(
    rootPosition[0] + localPosition[0] * scale,
    rootPosition[1] + localPosition[1] * scale,
    rootPosition[2] + localPosition[2] * scale,
  );
  temp.rotation.set(0, 0, 0);
  temp.scale.setScalar(scale);
  temp.updateMatrix();
  mesh.setMatrixAt(index, temp.matrix);
}

function setTreeColor(
  mesh: InstancedMesh | null,
  index: number,
  color: Color,
  hex: string,
) {
  if (!mesh) return;
  color.set(hex);
  mesh.setColorAt(index, color);
}

function finalizeTreeInstances(mesh: InstancedMesh | null, count: number) {
  if (!mesh) return;
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function ProceduralFountainTop() {
  return (
    <group position={[0, 0.36, 0]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[1.08, 1.26, 0.22, 24]} />
        <meshToonMaterial color="#F5E9B7" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.36, 0.46, 0.56, 18]} />
        <meshToonMaterial color="#C9F3EF" />
      </mesh>
      <mesh position={[0, 0.88, 0]}>
        <sphereGeometry args={[0.28, 14, 10]} />
        <meshBasicMaterial color="#DDF8F3" transparent opacity={0.88} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 0.74, 0.4, Math.sin(angle) * 0.74]}
          scale={[1, 0.55, 1]}
        >
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshBasicMaterial color="#8BD7E1" transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function AbstractFlowerBedInstances({
  beds,
}: {
  beds: ReturnType<typeof makeAbstractFlowerBeds>;
}) {
  return (
    <group>
      {beds.map((bed) => (
        <group
          key={bed.key}
          position={bed.position}
          rotation={[0, bed.rotation, 0]}
          scale={bed.scale}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1, 18]} />
            <meshBasicMaterial color="#5FAE62" transparent opacity={0.42} />
          </mesh>
          {[-0.56, -0.24, 0.08, 0.4, 0.64].map((x, index) => (
            <mesh key={index} position={[x, 0.12 + (index % 2) * 0.035, index % 2 ? 0.28 : -0.22]}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshBasicMaterial color={bed.colors[index % bed.colors.length]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function AbstractHedgeInstances({
  hedges,
}: {
  hedges: ReturnType<typeof makeAbstractHedges>;
}) {
  return (
    <group>
      {hedges.map((hedge) => (
        <group key={hedge.key} position={hedge.position} rotation={[0, hedge.rotationY, 0]}>
          <mesh position={[0, 0.35, 0]} scale={[hedge.length, 0.52, 0.42]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#5FAE62" />
          </mesh>
          <mesh position={[0, 0.7, 0]} scale={[hedge.length * 0.92, 0.2, 0.34]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#8DD77A" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AbstractLampInstances({
  lamps,
}: {
  lamps: ReturnType<typeof makeAbstractLamps>;
}) {
  return (
    <group>
      {lamps.map((lamp) => (
        <group key={lamp.key} position={lamp.position} rotation={[0, lamp.rotationY, 0]}>
          <mesh position={[0, 1.08, 0]}>
            <cylinderGeometry args={[0.045, 0.06, 2.12, 6]} />
            <meshBasicMaterial color="#38474A" />
          </mesh>
          <mesh position={[0, 2.25, 0]}>
            <sphereGeometry args={[0.22, 10, 8]} />
            <meshBasicMaterial color="#FFF5B8" />
          </mesh>
          <mesh position={[0, 2.43, 0]}>
            <coneGeometry args={[0.3, 0.22, 6]} />
            <meshBasicMaterial color="#F3D56E" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AbstractBenchInstances({
  benches,
}: {
  benches: ReturnType<typeof makeAbstractBenches>;
}) {
  return (
    <group>
      {benches.map((bench) => (
        <group key={bench.key} position={bench.position} rotation={[0, bench.rotationY, 0]}>
          <mesh position={[0, 0.48, 0]} scale={[1.35, 0.14, 0.34]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#B96F3C" />
          </mesh>
          <mesh position={[0, 0.84, -0.2]} rotation={[0.24, 0, 0]} scale={[1.35, 0.12, 0.32]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#D08B45" />
          </mesh>
          {[-0.52, 0.52].map((x) => (
            <mesh key={x} position={[x, 0.22, 0.05]} scale={[0.08, 0.42, 0.08]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#8B5B37" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function AbstractLamp({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <Suspense fallback={null}>
      <ModelAsset
        file={MODEL_FILES.streetLamp}
        position={position}
        rotation={[0, rotationY, 0]}
        targetHeight={2.65}
        color={MODEL_COLOR_PALETTES.streetLamp}
      />
    </Suspense>
  );
}

function AbstractBench({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <Suspense fallback={null}>
      <ModelAsset
        file={MODEL_FILES.parkBench}
        position={position}
        rotation={[0, rotationY, 0]}
        targetHeight={1.18}
        color={MODEL_COLOR_PALETTES.parkBench}
      />
    </Suspense>
  );
}

function AbstractPlayground() {
  return (
    <group position={[-22.4, 0.04, 17.8]} rotation={[0, 0.78, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3.65, 28]} />
        <meshBasicMaterial color="#E3D4A1" />
      </mesh>
      <PlaygroundSlideFallback position={[-1.42, 0.02, -0.78]} rotationY={-0.2} />
      <mesh position={[1.65, 1.08, -0.36]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 2.1, 6]} />
        <meshBasicMaterial color="#A96A3F" />
      </mesh>
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[1.65 + x, 0.82, -0.36]} rotation={[0, 0, 0.24 * Math.sign(x)]}>
          <cylinderGeometry args={[0.045, 0.045, 1.5, 6]} />
          <meshBasicMaterial color="#7A4E31" />
        </mesh>
      ))}
    </group>
  );
}

function AbstractFlowerBed({
  position,
  rotation,
  scale,
}: {
  position: Vec3;
  rotation: number;
  scale: Vec3;
  colors: readonly string[];
}) {
  return (
    <Suspense fallback={null}>
      <ModelAsset
        file={MODEL_FILES.meshyFlowerClump}
        position={[position[0], Math.max(0, position[1] - 0.05), position[2]]}
        rotation={[0, rotation, 0]}
        targetHeight={Math.max(0.4, scale[0] * 0.32)}
        color={MODEL_COLOR_PALETTES.meshyFlowerClump}
      />
    </Suspense>
  );
}

function AbstractTopiary({
  position,
  scale,
}: {
  position: Vec3;
  scale: number;
}) {
  return (
    <Suspense fallback={null}>
      <ModelAsset
        file={MODEL_FILES.roundTopiary}
        position={position}
        rotation={[0, 0, 0]}
        targetHeight={2.05 * scale}
        color={MODEL_COLOR_PALETTES.roundTopiary}
      />
    </Suspense>
  );
}

function AbstractHedge({
  position,
  rotationY,
  length,
}: {
  position: Vec3;
  rotationY: number;
  length: number;
}) {
  void length;
  return (
    <Suspense fallback={null}>
      <ModelAsset
        file={MODEL_FILES.storybookHedge}
        position={position}
        rotation={[0, rotationY, 0]}
        targetHeight={0.84}
        color={MODEL_COLOR_PALETTES.storybookHedge}
      />
    </Suspense>
  );
}

function AbstractPavilion({
  position,
  rotationY,
  color,
}: {
  position: Vec3;
  rotationY: number;
  color: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.45, 6]} />
        <meshBasicMaterial color="#BFE8D6" />
      </mesh>
      {Array.from({ length: 6 }).map((_, index) => {
        const angle = (index / 6) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 1.12, 0.92, Math.sin(angle) * 1.12]}>
            <cylinderGeometry args={[0.05, 0.07, 1.75, 6]} />
            <meshBasicMaterial color="#9C6338" />
          </mesh>
        );
      })}
      <mesh position={[0, 1.9, 0]} rotation={[0, Math.PI / 6, 0]}>
        <coneGeometry args={[1.68, 0.72, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function AbstractGate({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[-1.45, 1.45].map((x) => (
        <mesh key={x} position={[x, 1.3, 0]}>
          <cylinderGeometry args={[0.13, 0.18, 2.6, 6]} />
          <meshBasicMaterial color="#7A4E31" />
        </mesh>
      ))}
      <mesh position={[0, 2.62, 0]} scale={[3.25, 0.22, 0.28]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#A96A3F" />
      </mesh>
      <mesh position={[0, 2.12, -0.03]} scale={[1.66, 0.42, 0.08]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#F2E5BC" />
      </mesh>
    </group>
  );
}

function makeAbstractTrees() {
  const positions = [
    [-22, -17, 1.18],
    [-18, 10, 1.02],
    [-14, -22, 0.92],
    [-7, 22, 0.86],
    [9, 22, 0.92],
    [15, -18, 1.06],
    [22, -10, 1.18],
    [21, 12, 0.96],
    [-24, 5, 0.9],
    [6, -24, 0.84],
    [-27, -2, 0.82],
    [27, 3, 0.86],
    [-21, 20, 0.78],
    [20, 20, 0.82],
    [-9, -27, 0.74],
    [13, -26, 0.8],
    [-28, -14, 0.88],
    [28, -14, 0.9],
    [-3, 26, 0.72],
    [3, 26, 0.72],
  ] as const;
  return positions.map(([x, z, scale], index) => ({
    key: `abstract-tree-${index}`,
    position: [x, 0, z] as Vec3,
    scale,
    color: index % 3 === 0 ? '#5FAE62' : '#72C66A',
  }));
}

function makeAbstractSkyline() {
  return [-24, -16, -8, 4, 13, 23].map((x, index) => ({
    key: `abstract-skyline-${index}`,
    position: [x, 1.8 + (index % 3) * 0.36, 0] as Vec3,
    rotationY: (index - 2) * 0.05,
    args: [4.4 + (index % 2) * 0.8, 3.6 + (index % 3) * 0.8, 2.2] as [number, number, number],
    color: ['#DCE2D6', '#BFC9BC', '#E4E7D9', '#D5DDD0', '#AAB7AA', '#EEF0E1'][index]!,
  }));
}

function makeAbstractLamps() {
  return Array.from({ length: 4 }, (_, index) => {
    const theta = (index / 4) * Math.PI * 2 + Math.PI / 8;
    const radius = 19.4;
    return {
      key: `abstract-lamp-${index}`,
      position: [radius * Math.cos(theta), 0, radius * Math.sin(theta)] as Vec3,
      rotationY: -theta + Math.PI,
    };
  });
}

function makeAbstractBenches() {
  const ringBenches = Array.from({ length: 2 }, (_, index) => {
    const theta = (index / 2) * Math.PI * 2 + Math.PI / 6;
    const radius = 14.4;
    return {
      key: `abstract-ring-bench-${index}`,
      position: [radius * Math.cos(theta), 0, radius * Math.sin(theta)] as Vec3,
      rotationY: -theta + Math.PI,
    };
  });
  return [
    ...PARK_BENCH_SLOTS.slice(0, 2).map((bench) => ({
      key: `abstract-${bench.key}`,
      position: bench.position,
      rotationY: bench.rotationY,
    })),
    ...ringBenches,
  ];
}

function makeAbstractFlowerBeds() {
  const palette = [
    ['#F49BB8', '#F3D35B', '#69BFD0'],
    ['#E95B4D', '#F4C44D', '#EEF2EA'],
    ['#8FD3BC', '#F49BB8', '#F3D35B'],
    ['#69BFD0', '#EEF2EA', '#E95B4D'],
  ] as const;
  const radial = Array.from({ length: 4 }, (_, index) => {
    const theta = (index / 4) * Math.PI * 2 + Math.PI / 16;
    const radius = index % 2 === 0 ? 9.8 : 15.8;
    return {
      key: `abstract-flower-radial-${index}`,
      position: [radius * Math.cos(theta), 0.064, radius * Math.sin(theta)] as Vec3,
      rotation: theta,
      scale: [1.35 + (index % 3) * 0.2, 0.46, 1] as Vec3,
      colors: palette[index % palette.length],
    };
  });
  const corners = [
    [-18.7, -10.2, 0.35],
    [18.4, -9.8, -0.35],
  ] as const;
  return [
    ...radial,
    ...corners.map(([x, z, rotation], index) => ({
      key: `abstract-flower-grove-${index}`,
      position: [x, 0.068, z] as Vec3,
      rotation,
      scale: [2.0, 0.72, 1] as Vec3,
      colors: palette[(index + 1) % palette.length],
    })),
  ];
}

function makeAbstractTopiaries() {
  return Array.from({ length: 12 }, (_, index) => {
    const theta = (index / 12) * Math.PI * 2;
    const radius = index % 2 === 0 ? 22.4 : 6.8;
    return {
      key: `abstract-topiary-${index}`,
      position: [radius * Math.cos(theta), 0, radius * Math.sin(theta)] as Vec3,
      scale: index % 2 === 0 ? 1.08 : 0.78,
    };
  });
}

function makeAbstractHedges() {
  return [
    { key: 'abstract-hedge-west', position: [-23.8, 0, -2.6] as Vec3, rotationY: Math.PI / 2, length: 4.2 },
    { key: 'abstract-hedge-east', position: [23.8, 0, -2.6] as Vec3, rotationY: Math.PI / 2, length: 4.2 },
  ];
}

function makeAbstractPavilions() {
  return [
    { key: 'abstract-pavilion-east', position: [21.2, 0, 10.4] as Vec3, rotationY: -0.9, color: '#F3D56E' },
  ];
}

function makeAbstractWaterJets() {
  return [
    { key: 'water-jet-center', position: [0, 1.04, 0] as Vec3, rotation: [0, 0, 0] as Vec3, height: 1.42 },
    { key: 'water-jet-n', position: [0, 0.84, -0.9] as Vec3, rotation: [0.28, 0, 0] as Vec3, height: 0.92 },
    { key: 'water-jet-s', position: [0, 0.84, 0.9] as Vec3, rotation: [-0.28, 0, 0] as Vec3, height: 0.92 },
    { key: 'water-jet-e', position: [0.9, 0.84, 0] as Vec3, rotation: [0, 0, 0.28] as Vec3, height: 0.92 },
    { key: 'water-jet-w', position: [-0.9, 0.84, 0] as Vec3, rotation: [0, 0, -0.28] as Vec3, height: 0.92 },
  ];
}

function makeAbstractPathMarks() {
  const marks: Array<{
    key: string;
    position: Vec3;
    rotation: number;
    scale: Vec3;
    color: string;
    opacity: number;
  }> = [];
  for (let i = 0; i < 18; i += 1) {
    const theta = (i / 18) * Math.PI * 2;
    const radius = 8 + (i % 5) * 3.7;
    marks.push({
      key: `abstract-ground-mark-${i}`,
      position: [radius * Math.cos(theta), 0.045, radius * Math.sin(theta)] as Vec3,
      rotation: theta,
      scale: [0.8 + (i % 3) * 0.35, 0.18, 1],
      color: i % 2 === 0 ? '#5FAE62' : '#EADAA8',
      opacity: i % 2 === 0 ? 0.22 : 0.48,
    });
  }
  return marks;
}

function ParkPlazaScene() {
  const polarPlacements = useMemo(makePolarPlacements, []);
  const woodFencePlacements = useMemo(makeWoodFencePlacements, []);

  return (
    <group>
      <WaterPlane />
      <SkyBackdropLayer />
      <TownSkyline />
      <DistantParkBackdrop />
      <IslandRim />
      <CircularParkGround />
      <ParkGroundDetailLayer />
      <MainPromenadeLayer />
      <PathEdgeDetailLayer />
      <GroundInkMarks />
      <SketchHatchLayer />
      <PlazaCityRim />
      <ForegroundDepthLayer />
      <NearPathDetailLayer />
      <WoodFenceLayer placements={woodFencePlacements} />
      <ParkPlantingLayer />
      <Suspense fallback={null}>
        <HighTreeLandmark />
      </Suspense>
      <PlaygroundZone />
      <StorybookFountain />
      {/* Meshy 生成の低ポリ・ガゼボ（公園のランドマーク）。開けた芝に 1 棟。 */}
      <ModelAsset
        file={MODEL_FILES.meshyParkGazebo}
        position={[6.6, 0.02, 12.6]}
        rotation={[0, -2.3, 0]}
        targetHeight={3.7}
        color={MODEL_COLOR_PALETTES.meshyParkGazebo}
      />
      <MeshyPlazaLandmarkLayer />
      {polarPlacements.map((placement) => (
        <ModelAsset
          key={placement.key}
          file={MODEL_FILES[placement.model]}
          position={placement.position}
          rotation={placement.rotation}
          targetHeight={placement.targetHeight}
          color={placement.color}
        />
      ))}
    </group>
  );
}

function WaterPlane() {
  const waterPatches = [
    [-35, 0, -18, 7.6, 0.22],
    [38, 0, 14, 9.4, 0.18],
    [-18, 0, 34, 5.2, 0.2],
    [22, 0, -36, 6.4, 0.16],
    [0, 0, 41, 4.4, 0.18],
  ] as const;
  const waterDoodles = useMemo(makeWaterDoodles, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]}>
        <planeGeometry args={[180, 180]} />
        <meshToonMaterial color="#58B9B4" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL + 0.045, 0]} receiveShadow>
        <ringGeometry args={[32.75, 43.5, 128]} />
        <meshToonMaterial color="#65C7C1" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL + 0.07, 0]}>
        <ringGeometry args={[34.2, 42.15, 128]} />
        <meshBasicMaterial color="#A7E8E1" transparent opacity={0.22} />
      </mesh>
      {waterPatches.map(([x, y, z, radius, opacity], index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, WATER_LEVEL + 0.035 + y, z]}
          scale={[1.55, 0.56, 1]}
        >
          <circleGeometry args={[radius, 28]} />
          <meshBasicMaterial color="#A8EAE4" transparent opacity={opacity * 0.86} />
        </mesh>
      ))}
      {waterDoodles.map((doodle) => (
        <group key={doodle.key} position={doodle.position} rotation={[-Math.PI / 2, 0, doodle.rotation]}>
          {doodle.kind === 'ring' ? (
            <mesh scale={[doodle.scale, doodle.scale, 1]}>
              <ringGeometry args={[0.34, 0.42, 18]} />
              <meshBasicMaterial color="#C7F1EC" transparent opacity={0.36} />
            </mesh>
          ) : (
            <mesh>
              <planeGeometry args={[doodle.scale * 1.15, 0.045]} />
              <meshBasicMaterial color="#C7F1EC" transparent opacity={0.3} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function makeWaterDoodles() {
  const rng = createSeededRandom(20260626);
  const doodles: Array<{
    key: string;
    kind: 'ring' | 'dash';
    position: Vec3;
    rotation: number;
    scale: number;
  }> = [];

  for (let i = 0; i < 42; i += 1) {
    const theta = rng() * Math.PI * 2;
    const radius = 33 + rng() * 42;
    doodles.push({
      key: `water-doodle-${i}`,
      kind: rng() > 0.45 ? 'ring' : 'dash',
      position: [
        radius * Math.cos(theta),
        WATER_LEVEL + 0.06,
        radius * Math.sin(theta),
      ],
      rotation: rng() * Math.PI * 2,
      scale: 0.38 + rng() * 0.86,
    });
  }

  return doodles;
}

function SkyBackdropLayer() {
  const islands = [
    { key: 'sky-island-left', position: [-37, 17.5, -76] as Vec3, scale: [18, 4.6, 1] as Vec3, rotation: -0.06, color: '#9FE4DC', opacity: 0.54 },
    { key: 'sky-island-mid', position: [-2, 20.8, -78] as Vec3, scale: [26, 5.4, 1] as Vec3, rotation: 0.03, color: '#B7F0E8', opacity: 0.5 },
    { key: 'sky-island-right', position: [35, 16.6, -76] as Vec3, scale: [20, 4.9, 1] as Vec3, rotation: 0.08, color: '#92D9D2', opacity: 0.46 },
    { key: 'sky-shelf-low', position: [15, 10.7, -74] as Vec3, scale: [34, 3.1, 1] as Vec3, rotation: -0.02, color: '#7DCBC8', opacity: 0.24 },
  ];
  const dashes = [
    [-28, 13.6, -72, 2.1, -0.16],
    [-11, 18.2, -72, 1.5, 0.26],
    [14, 15.9, -72, 2.4, -0.08],
    [31, 21.6, -72, 1.2, 0.34],
    [42, 12.4, -72, 1.8, -0.2],
  ] as const;

  return (
    <group>
      {islands.map((island) => (
        <mesh
          key={island.key}
          position={island.position}
          rotation={[0, 0, island.rotation]}
          scale={island.scale}
        >
          <circleGeometry args={[1, 42]} />
          <meshBasicMaterial
            color={island.color}
            fog={false}
            transparent
            opacity={island.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
      {dashes.map(([x, y, z, width, rotation], index) => (
        <mesh
          key={`sky-ink-dash-${index}`}
          position={[x, y, z]}
          rotation={[0, 0, rotation]}
        >
          <planeGeometry args={[width, 0.07]} />
          <meshBasicMaterial color="#3B6C6C" fog={false} transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function DistantParkBackdrop() {
  const groves = [
    { position: [-24.5, 0.02, -25.8] as Vec3, scale: 1.1, rotation: -0.16 },
    { position: [-16.2, 0.02, -27.4] as Vec3, scale: 0.9, rotation: 0.12 },
    { position: [18.8, 0.02, -26.8] as Vec3, scale: 1.0, rotation: 0.18 },
    { position: [25.8, 0.02, -24.2] as Vec3, scale: 0.82, rotation: -0.08 },
  ] as const;
  const rocks = [
    [-28.4, -23.4, 0.85, '#D9D0A9'],
    [27.2, -22.2, 0.72, '#EEE5C6'],
    [21.9, -28.7, 0.54, '#C9BE99'],
  ] as const;

  return (
    <group>
      {groves.map((grove, index) => (
        <ModelAsset
          key={index}
          file={MODEL_FILES.meshyLowGroveMound}
          position={grove.position}
          rotation={[0, grove.rotation, 0]}
          targetHeight={1.12 * grove.scale}
          color={MODEL_COLOR_PALETTES.meshyLowGroveMound}
        />
      ))}
      {rocks.map(([x, z, scale, color], index) => (
        <ModelAsset
          key={index}
          file={MODEL_FILES.meshyStoneCluster}
          position={[x, 0, z]}
          rotation={[0, index * 0.46, 0]}
          targetHeight={0.18 * scale}
          color={color}
        />
      ))}
    </group>
  );
}

function LowGroveMound({
  position,
  rotationY,
  scale,
}: {
  position: Vec3;
  rotationY: number;
  scale: number;
}) {
  const crowns = [
    [-1.75, 0.72, 0.08, 1.02, '#3B8754'],
    [-0.92, 1.02, -0.05, 1.18, '#4F9F58'],
    [0.18, 0.92, 0.05, 1.08, '#6BB765'],
    [1.18, 0.78, -0.08, 0.95, '#438F54'],
    [2.02, 0.62, 0.06, 0.74, '#7CC56D'],
  ] as const;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {crowns.map(([x, y, z, radius, color], index) => (
        <mesh key={index} castShadow receiveShadow position={[x, y, z]} scale={[1.25, 0.78, 0.72]}>
          <sphereGeometry args={[radius, 18, 10]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.02} color={INK} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0.06]} position={[0.16, 0.04, 0.16]} scale={[2.9, 0.68, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial color="#2D6F48" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

function IslandRim() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.14, 0]} receiveShadow>
        <ringGeometry args={[29.2, 30.25, 96]} />
        <meshToonMaterial color="#B6C8B7" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
        <ringGeometry args={[29.7, 32.4, 96]} />
        <meshToonMaterial color="#CDBB99" />
        <Outlines thickness={0.025} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <ringGeometry args={[30.45, 32.95, 96]} />
        <meshToonMaterial color="#A89B7F" />
      </mesh>
      <mesh position={[0, -0.46, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <torusGeometry args={[30.25, 0.16, 10, 144]} />
        <meshToonMaterial color="#8F9E86" />
        <Outlines thickness={0.012} color={INK} />
      </mesh>
      <mesh position={[0, WATER_LEVEL + 0.13, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <torusGeometry args={[32.62, 0.22, 10, 144]} />
        <meshToonMaterial color="#BFAF8B" />
      </mesh>
    </group>
  );
}

function CircularParkGround() {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.25, 0]}>
        <cylinderGeometry args={[PARK_RADIUS, PARK_RADIUS, 0.5, 64]} />
        <meshToonMaterial color="#73C96F" />
        <Outlines thickness={0.035} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <ringGeometry args={[5.2, 6.25, 72]} />
        <meshToonMaterial color="#E0D0A4" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]} receiveShadow>
        <ringGeometry args={[18.5, 20.0, 96]} />
        <meshToonMaterial color="#D9C99B" />
      </mesh>
      {[0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75].map((angle) => (
        <mesh
          key={angle}
          rotation={[-Math.PI / 2, 0, angle]}
          position={[0, 0.026, 0]}
          receiveShadow
        >
          <planeGeometry args={[2.86, 51]} />
          <meshToonMaterial color="#D7C696" />
        </mesh>
      ))}
    </group>
  );
}

function ParkGroundDetailLayer() {
  const grassPatches = useMemo(makeGrassPatches, []);
  const wornEdges = useMemo(makeWornPathEdges, []);
  const shadePatches = [
    [-18.4, 9.6, 5.8, 2.55, -0.22, '#4E9B5E', 0.24],
    [17.7, -11.1, 6.4, 2.9, 0.18, '#4A945B', 0.22],
    [10.6, 17.8, 4.7, 2.2, -0.58, '#5BAA61', 0.18],
    [-20.4, -15.8, 5.3, 2.35, 0.44, '#4F9A58', 0.2],
  ] as const;
  const mowingBands = [9.2, 14.4, 23.2] as const;

  return (
    <group>
      {grassPatches.map((patch) => (
        <mesh
          key={patch.key}
          rotation={[-Math.PI / 2, 0, patch.rotation]}
          position={patch.position}
          scale={patch.scale}
          receiveShadow
        >
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color={patch.color} transparent opacity={patch.opacity} />
        </mesh>
      ))}
      {shadePatches.map(([x, z, sx, sz, rotation, color, opacity], index) => (
        <mesh
          key={`shade-patch-${index}`}
          rotation={[-Math.PI / 2, 0, rotation]}
          position={[x, 0.032 + index * 0.001, z]}
          scale={[sx, sz, 1]}
        >
          <circleGeometry args={[1, 34]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
      ))}
      {mowingBands.map((radius, index) => (
        <mesh key={`mowing-band-${radius}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04 + index * 0.001, 0]}>
          <ringGeometry args={[radius, radius + 0.18, 96]} />
          <meshBasicMaterial color={index === 1 ? '#8BD878' : '#61B968'} transparent opacity={0.16} />
        </mesh>
      ))}
      {wornEdges.map((edge) => (
        <mesh
          key={edge.key}
          rotation={[-Math.PI / 2, 0, edge.rotation]}
          position={edge.position}
          scale={edge.scale}
        >
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color="#CDB98A" transparent opacity={edge.opacity} />
        </mesh>
      ))}
    </group>
  );
}

function makeGrassPatches() {
  const rng = createSeededRandom(20260629);
  const patches: Array<{
    key: string;
    position: Vec3;
    rotation: number;
    scale: Vec3;
    color: string;
    opacity: number;
  }> = [];
  const colors = ['#7DD074', '#68BD68', '#8BD878', '#5FAE62'];

  for (let i = 0; i < 26; i += 1) {
    const theta = rng() * Math.PI * 2;
    const radius = 7.4 + rng() * 20.2;
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    if (
      isInsideBenchFrontClearance(x, z) ||
      isInsideStartingCameraClearance(x, z) ||
      isInsideEntranceGateClearance(x, z) ||
      isInsideMainWalkwayClearance(x, z)
    ) continue;

    patches.push({
      key: `grass-patch-${i}`,
      position: [x, 0.028 + (i % 4) * 0.001, z],
      rotation: rng() * Math.PI * 2,
      scale: [1.55 + rng() * 2.9, 0.72 + rng() * 1.65, 1],
      color: colors[i % colors.length]!,
      opacity: 0.16 + rng() * 0.13,
    });
  }

  return patches;
}

function makeWornPathEdges() {
  const rng = createSeededRandom(20260630);
  const edges: Array<{
    key: string;
    position: Vec3;
    rotation: number;
    scale: Vec3;
    opacity: number;
  }> = [];
  const pathLines = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75];
  const radii = [9.6, 15.2, 22.8];
  let index = 0;

  pathLines.forEach((lineAngle) => {
    [lineAngle, lineAngle + Math.PI].forEach((theta) => {
      const forward: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const right: Vec3 = [-Math.sin(theta), 0, Math.cos(theta)];
      radii.forEach((radius) => {
        if (rng() < 0.3) return;
        [-1, 1].forEach((side) => {
          const sideOffset = 2.55 + rng() * 0.36;
          edges.push({
            key: `worn-path-edge-${index}`,
            position: [
              forward[0] * radius + right[0] * side * sideOffset,
              0.058 + (index % 5) * 0.001,
              forward[2] * radius + right[2] * side * sideOffset,
            ],
            rotation: theta + (rng() - 0.5) * 0.32,
            scale: [0.72 + rng() * 0.7, 0.18 + rng() * 0.16, 1],
            opacity: 0.2 + rng() * 0.16,
          });
          index += 1;
        });
      });
    });
  });

  return edges;
}

function MainPromenadeLayer() {
  const pathShape = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-4.25, -26.6);
    shape.bezierCurveTo(-4.82, -22.6, -4.38, -17.0, -3.62, -12.7);
    shape.bezierCurveTo(-3.02, -9.15, -2.45, -6.62, -1.56, -4.92);
    shape.lineTo(1.78, -5.12);
    shape.bezierCurveTo(2.72, -7.95, 3.85, -13.08, 4.34, -18.15);
    shape.bezierCurveTo(4.78, -22.0, 4.58, -24.68, 3.86, -26.68);
    shape.lineTo(-4.25, -26.6);
    return shape;
  }, []);
  const leftLine = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-3.32, 0.1, 24.4),
        new Vector3(-3.35, 0.1, 18.5),
        new Vector3(-2.78, 0.1, 11.4),
        new Vector3(-1.72, 0.1, 5.8),
      ]),
    [],
  );
  const rightLine = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(3.28, 0.101, 24.4),
        new Vector3(3.4, 0.101, 18.5),
        new Vector3(2.86, 0.101, 11.4),
        new Vector3(1.78, 0.101, 5.8),
      ]),
    [],
  );
  const pathPebbles = [
    [-0.8, 22.5, -0.12, 0.72, 0.28],
    [1.15, 19.2, 0.18, 0.62, 0.24],
    [-1.28, 15.8, -0.2, 0.55, 0.22],
    [0.82, 12.1, 0.16, 0.5, 0.2],
    [-0.42, 8.65, -0.1, 0.42, 0.18],
  ] as const;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.046, 0]} receiveShadow>
        <shapeGeometry args={[pathShape]} />
        <meshToonMaterial color="#D7C196" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      {[leftLine, rightLine].map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 42, 0.052, 8, false]} />
          <meshBasicMaterial color="#F2E4BD" transparent opacity={0.74} />
        </mesh>
      ))}
      {pathPebbles.map(([x, z, yaw, width, height], index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, yaw]}
          position={[x, 0.104 + index * 0.001, z]}
          scale={[width, height, 1]}
        >
          <circleGeometry args={[1, 18]} />
          <meshBasicMaterial color="#EEE1BA" transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function PathEdgeDetailLayer() {
  const edgeTufts = useMemo(makePathEdgeTufts, []);

  return (
    <group>
      {edgeTufts.map((tuft) => (
        <ModelAsset
          key={tuft.key}
          file={MODEL_FILES.meshyPathGrassTuft}
          position={tuft.position}
          rotation={[0, tuft.rotationY, 0]}
          targetHeight={0.32 * tuft.scale}
          color={MODEL_COLOR_PALETTES.meshyPathGrassTuft}
        />
      ))}
    </group>
  );
}

function makePathEdgeTufts() {
  const rng = createSeededRandom(20260628);
  const tufts: Array<{
    key: string;
    position: Vec3;
    rotationY: number;
    scale: number;
    color: string;
  }> = [];
  const zPoints = [21.6, 16.2, 10.8];

  zPoints.forEach((z, zi) => {
    const width = 2.0 + ((z - 7) / 17) * 1.25;
    [-1, 1].forEach((side) => {
      const clusterCount = zi === 0 ? 2 : 1;
      for (let i = 0; i < clusterCount; i += 1) {
        const x = side * (width + 1.15 + rng() * 0.7);
        const localZ = z + (rng() - 0.5) * 1.0;
        if (isInsideMainWalkwayClearance(x, localZ)) continue;
        tufts.push({
          key: `path-edge-tuft-${zi}-${side}-${i}`,
          position: [x, 0.09 + i * 0.004, localZ],
          rotationY: side * 0.2 + (rng() - 0.5) * 0.7,
          scale: 0.72 + rng() * 0.35,
          color: rng() > 0.5 ? '#66B95F' : '#83CB6F',
        });
      }
    });
  });

  return tufts;
}

function PathEdgeTuft({
  position,
  rotationY,
  scale,
  color,
}: {
  position: Vec3;
  rotationY: number;
  scale: number;
  color: string;
}) {
  const leaves = [
    [-0.18, 0, 0.0, 0.32, 0.12, -0.28],
    [0.06, 0, 0.1, 0.42, 0.13, 0.1],
    [0.28, 0, -0.05, 0.27, 0.1, 0.42],
  ] as const;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {leaves.map(([x, y, z, sx, sz, yaw], index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, yaw]}
          position={[x, y + index * 0.003, z]}
          scale={[sx, sz, 1]}
        >
          <circleGeometry args={[1, 14]} />
          <meshBasicMaterial color={index === 1 ? color : '#5EAA59'} transparent opacity={0.9} />
        </mesh>
      ))}
      {position[2] > 17 && (
        <mesh position={[0.22, 0.08, 0.08]} scale={[0.045, 0.045, 0.025]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color="#F2D567" />
        </mesh>
      )}
    </group>
  );
}

function GroundInkMarks() {
  const marks = [
    [-19, -7.2, 2.8, 0.18],
    [-12.4, 6.2, 1.8, -0.32],
    [-5.2, -17.1, 2.4, 0.52],
    [7.2, 14.7, 2.1, -0.72],
    [13.6, -8.8, 1.6, 0.2],
    [21.4, 2.6, 2.7, -0.18],
    [-23.2, 12.1, 2.0, 0.66],
    [2.1, -22.8, 1.7, -0.54],
    [15.2, 21.4, 1.6, 0.28],
    [-16.2, -19.3, 2.2, -0.12],
  ] as const;

  return (
    <group>
      {marks.map(([x, z, length, yaw], index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, yaw]}
          position={[x, 0.065, z]}
        >
          <planeGeometry args={[length, 0.045]} />
          <meshBasicMaterial color={INK} transparent opacity={0.34} />
        </mesh>
      ))}
    </group>
  );
}

function SketchHatchLayer() {
  const hatches = useMemo(makeSketchHatches, []);

  return (
    <group>
      {hatches.map((hatch) => (
        <mesh
          key={hatch.key}
          rotation={[-Math.PI / 2, 0, hatch.rotation]}
          position={hatch.position}
        >
          <planeGeometry args={[hatch.length, hatch.width]} />
          <meshBasicMaterial color={INK} transparent opacity={hatch.opacity} />
        </mesh>
      ))}
    </group>
  );
}

function makeSketchHatches() {
  const rng = createSeededRandom(20260627);
  const hatches: Array<{
    key: string;
    position: Vec3;
    rotation: number;
    length: number;
    width: number;
    opacity: number;
  }> = [];

  for (let i = 0; i < 115; i += 1) {
    const theta = rng() * Math.PI * 2;
    const radius = 5.8 + rng() * 23.2;
    if (Math.abs(Math.sin(theta * 2)) < 0.03 && radius < 24) continue;
    hatches.push({
      key: `ground-hatch-${i}`,
      position: [
        radius * Math.cos(theta),
        0.074 + (i % 5) * 0.0008,
        radius * Math.sin(theta),
      ],
      rotation: theta + Math.PI / 2 + (rng() - 0.5) * 1.1,
      length: 0.72 + rng() * 1.9,
      width: 0.025 + rng() * 0.03,
      opacity: 0.16 + rng() * 0.16,
    });
  }

  return hatches;
}

function ForegroundDepthLayer() {
  return (
    <group>
      <ParkEntranceGate position={[0, 0, 25.65]} rotationY={Math.PI} targetHeight={4.18} />
      <ParkEntranceGate position={[0, 0, -25.65]} rotationY={0} targetHeight={4.18} />
      <ModelAsset
        file={MODEL_FILES.meshyWoodRailSegment}
        position={[-7.28, 0, 20.82]}
        rotation={[0, -0.18, 0]}
        targetHeight={0.92}
        color={MODEL_COLOR_PALETTES.meshyWoodRailSegment}
      />
      <ModelAsset
        file={MODEL_FILES.meshyWoodRailSegment}
        position={[7.12, 0, 19.5]}
        rotation={[0, 0.18, 0]}
        targetHeight={0.9}
        color={MODEL_COLOR_PALETTES.meshyWoodRailSegment}
      />
      <mesh rotation={[-Math.PI / 2, 0, -0.08]} position={[-1.18, 0.079, 18.6]} scale={[1.7, 0.48, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial color="#3B8E55" transparent opacity={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.12]} position={[1.62, 0.08, 13.55]} scale={[1.06, 0.32, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#3B8E55" transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

function ParkEntranceGate({
  position,
  rotationY,
  targetHeight,
}: {
  position: Vec3;
  rotationY: number;
  targetHeight: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <ModelAsset
        file={MODEL_FILES.meshyParkEntranceGate}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        targetHeight={targetHeight}
        color={MODEL_COLOR_PALETTES.meshyParkEntranceGate}
      />
      <ModelAsset
        file={MODEL_FILES.meshyFlowerClump}
        position={[-3.14, 0, -0.32]}
        rotation={[0, -0.24, 0]}
        targetHeight={0.42}
        color={MODEL_COLOR_PALETTES.meshyFlowerClump}
      />
      <ModelAsset
        file={MODEL_FILES.meshyFlowerClump}
        position={[3.14, 0, -0.32]}
        rotation={[0, 0.24, 0]}
        targetHeight={0.42}
        color={MODEL_COLOR_PALETTES.meshyFlowerClump}
      />
    </group>
  );
}

function NearPathDetailLayer() {
  return (
    <group>
      <ModelAsset
        file={MODEL_FILES.meshyParkEntranceSign}
        position={[-3.18, 0, 14.35]}
        rotation={[0, 0.25, 0]}
        targetHeight={1.48}
        color={MODEL_COLOR_PALETTES.meshyParkEntranceSign}
      />
      <ModelAsset
        file={MODEL_FILES.meshyFlowerClump}
        position={[2.92, 0, 13.42]}
        rotation={[0, -0.18, 0]}
        targetHeight={0.52}
        color={MODEL_COLOR_PALETTES.meshyFlowerClump}
      />
      <ModelAsset
        file={MODEL_FILES.meshyFlowerClump}
        position={[-3.95, 0, 17.05]}
        rotation={[0, 0.22, 0]}
        targetHeight={0.48}
        color={MODEL_COLOR_PALETTES.meshyFlowerClump}
      />
      <ModelAsset
        file={MODEL_FILES.meshyStoneCluster}
        position={[2.95, 0, 17.1]}
        rotation={[0, -0.2, 0]}
        targetHeight={0.2}
        color={MODEL_COLOR_PALETTES.meshyStoneCluster}
      />
      <ModelAsset
        file={MODEL_FILES.meshyStoneCluster}
        position={[-2.92, 0, 18.0]}
        rotation={[0, 0.18, 0]}
        targetHeight={0.18}
        color={MODEL_COLOR_PALETTES.meshyStoneCluster}
      />
    </group>
  );
}

function PlazaCityRim() {
  const blocks = [
    { position: [-25.5, 1.7, -34.8] as Vec3, rotationY: 0.34, args: [4.2, 3.4, 2.8] as [number, number, number], color: '#DCE2D6' },
    { position: [-18.8, 2.34, -36.2] as Vec3, rotationY: 0.2, args: [4.8, 4.7, 3.0] as [number, number, number], color: '#BFC9BC' },
    { position: [-11.7, 1.82, -37.4] as Vec3, rotationY: 0.08, args: [3.8, 3.6, 2.6] as [number, number, number], color: '#E4E7D9' },
    { position: [11.8, 2.02, -37.2] as Vec3, rotationY: -0.12, args: [4.4, 4.05, 2.8] as [number, number, number], color: '#D5DDD0' },
    { position: [19.3, 2.48, -35.8] as Vec3, rotationY: -0.26, args: [4.9, 4.95, 3.1] as [number, number, number], color: '#AAB7AA' },
    { position: [25.8, 1.68, -33.8] as Vec3, rotationY: -0.38, args: [3.8, 3.35, 2.55] as [number, number, number], color: '#EEF0E1' },
  ] as const;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0.02]} position={[0, -0.08, -35.4]} receiveShadow>
        <planeGeometry args={[58, 10.2]} />
        <meshToonMaterial color="#AEB9A9" />
        <Outlines thickness={0.026} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.02]} position={[0, -0.055, -30.6]}>
        <planeGeometry args={[54, 0.42]} />
        <meshBasicMaterial color="#DCE7DC" transparent opacity={0.82} />
      </mesh>
      {blocks.map((block, index) => (
        <group key={index}>
          <BuildingBlock
            position={block.position}
            rotationY={block.rotationY}
            args={block.args}
            color={block.color}
          />
          <mesh
            rotation={[-Math.PI / 2, 0, block.rotationY * 0.35]}
            position={[block.position[0], 0.08, block.position[2] + 1.8]}
            scale={[block.args[0] * 0.72, 0.48, 1]}
          >
            <circleGeometry args={[1, 24]} />
            <meshBasicMaterial color="#33464A" transparent opacity={0.12} />
          </mesh>
        </group>
      ))}
      <OutlinedBox args={[48.5, 0.22, 0.32]} color="#43585A" position={[0, 0.58, -30.9]} rotation={[0, 0.02, 0]} />
      <OutlinedBox args={[44.5, 0.18, 0.26]} color="#EAF0E6" position={[0, 1.02, -30.75]} rotation={[0, 0.02, 0]} />
      <MessengerPosterBoard position={[-10.8, 1.1, -30.2]} rotationY={0.04} />
      <MessengerArrowSign position={[10.6, 1.55, -30.05]} rotationY={-0.08} />
      <VendingMachine position={[-16.4, 0.86, -30.0]} rotationY={0.18} />
      <MiniTruck position={[16.6, 0.58, -30.05]} rotationY={-0.32} />
      <TrafficCone position={[-6.9, 0.22, -29.55]} />
      <TrafficCone position={[6.6, 0.22, -29.5]} />
    </group>
  );
}

function MeshyPlazaLandmarkLayer() {
  const flowerColor = MODEL_COLOR_PALETTES.meshyFlowerClump;
  const stoneColor = MODEL_COLOR_PALETTES.meshyStoneCluster;

  return (
    <group>
      <ModelAsset
        file={MODEL_FILES.meshyParkGazebo}
        position={[-10.35, 0.02, -12.7]}
        rotation={[0, 0.84, 0]}
        targetHeight={3.25}
        color={MODEL_COLOR_PALETTES.meshyParkGazebo}
      />
      <ModelAsset
        file={MODEL_FILES.meshyParkEntranceSign}
        position={[12.7, 0, -9.85]}
        rotation={[0, -0.72, 0]}
        targetHeight={1.58}
        color={MODEL_COLOR_PALETTES.meshyParkEntranceSign}
      />
      <ModelAsset
        file={MODEL_FILES.meshyParkEntranceSign}
        position={[-13.4, 0, 8.65]}
        rotation={[0, 0.94, 0]}
        targetHeight={1.42}
        color={MODEL_COLOR_PALETTES.meshyParkEntranceSign}
      />
      <ModelAsset
        file={MODEL_FILES.meshyWoodRailSegment}
        position={[-8.75, 0, -9.65]}
        rotation={[0, 0.28, 0]}
        targetHeight={0.9}
        color={MODEL_COLOR_PALETTES.meshyWoodRailSegment}
      />
      <ModelAsset
        file={MODEL_FILES.meshyWoodRailSegment}
        position={[-12.45, 0, -10.7]}
        rotation={[0, -0.34, 0]}
        targetHeight={0.88}
        color={MODEL_COLOR_PALETTES.meshyWoodRailSegment}
      />
      {[
        [-12.25, -14.35, 0.5],
        [-8.35, -15.1, -0.28],
        [10.6, -7.75, 0.48],
        [14.25, -11.7, -0.18],
        [-15.25, 6.7, 0.72],
        [15.4, 8.2, -0.5],
      ].map(([x, z, rotationY], index) => (
        <ModelAsset
          key={`meshy-feature-flower-${index}`}
          file={MODEL_FILES.meshyFlowerClump}
          position={[x, 0, z]}
          rotation={[0, rotationY, 0]}
          targetHeight={0.5 + (index % 2) * 0.08}
          color={flowerColor}
        />
      ))}
      {[
        [-6.7, -12.2, 0.18],
        [-14.8, -12.5, -0.34],
        [9.1, -12.1, 0.54],
        [15.9, -7.45, 0.22],
        [-16.8, 10.4, -0.5],
      ].map(([x, z, rotationY], index) => (
        <ModelAsset
          key={`meshy-feature-stone-${index}`}
          file={MODEL_FILES.meshyStoneCluster}
          position={[x, 0.01, z]}
          rotation={[0, rotationY, 0]}
          targetHeight={0.19 + (index % 2) * 0.05}
          color={stoneColor}
        />
      ))}
    </group>
  );
}

function WoodRailRun({
  position,
  rotationY,
  length,
}: {
  position: Vec3;
  rotationY: number;
  length: number;
}) {
  const postXs = [-0.5, -0.16, 0.18, 0.5].map((n) => n * length);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {postXs.map((x, index) => (
        <OutlinedBox
          key={index}
          args={[0.22, 0.9, 0.22]}
          color={index % 2 === 0 ? '#D7B778' : '#B98A4F'}
          position={[x, 0.42, 0]}
        />
      ))}
      <OutlinedBox args={[length, 0.16, 0.18]} color="#D7B778" position={[0, 0.72, 0.06]} />
      <OutlinedBox args={[length * 0.94, 0.14, 0.16]} color="#A97845" position={[0.04, 0.42, 0.1]} />
    </group>
  );
}

function ParkEntranceBoard({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[0.16, 1.25, 0.16]} color="#7A4E31" position={[-0.48, -0.05, 0]} />
      <OutlinedBox args={[0.16, 1.25, 0.16]} color="#7A4E31" position={[0.48, -0.05, 0]} />
      <OutlinedBox args={[1.25, 0.82, 0.14]} color="#F2E5BC" position={[0, 0.34, 0.03]} />
      <mesh position={[-0.26, 0.48, 0.13]} scale={[0.14, 0.14, 0.02]}>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color="#67B96A" />
      </mesh>
      <mesh position={[0.16, 0.2, 0.13]} scale={[0.22, 0.06, 0.02]}>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color="#69BFD0" />
      </mesh>
      {[-0.18, 0.08, 0.32].map((y, index) => (
        <OutlinedBox
          key={index}
          args={[0.55 - index * 0.08, 0.055, 0.035]}
          color="#5C6A54"
          position={[0.16, y + 0.46, 0.14]}
        />
      ))}
    </group>
  );
}

function FlowerClump({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  const flowers = [
    [-0.28, 0.04, '#F3D35B'],
    [0.0, -0.04, '#F49BB8'],
    [0.26, 0.06, '#E95B4D'],
  ] as const;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.18, 0]} scale={[0.56, 0.22, 0.38]} castShadow receiveShadow>
        <sphereGeometry args={[1, 16, 10]} />
        <meshToonMaterial color="#70BF65" />
        <Outlines thickness={0.014} color={INK} />
      </mesh>
      {flowers.map(([x, z, color], index) => (
        <mesh key={index} position={[x, 0.4, z]} scale={[0.06, 0.06, 0.025]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function PathStoneCluster({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  const stones = [
    [-0.38, 0.04, 0.5, 0.18],
    [0.1, -0.08, 0.42, 0.16],
    [0.48, 0.06, 0.32, 0.14],
  ] as const;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {stones.map(([x, z, sx, sz], index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, index * 0.24]} position={[x, 0, z]} scale={[sx, sz, 1]}>
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial color={index % 2 === 0 ? '#EEE4C7' : '#CDBF97'} transparent opacity={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function ForegroundStreetWings() {
  return (
    <group>
      <group position={[-8.75, 0, 16.2]} rotation={[0, 0.24, 0]}>
        <BuildingBlock
          position={[-0.55, 2.35, 0.1]}
          rotationY={0.06}
          args={[3.4, 4.7, 2.2]}
          color="#A7A99A"
        />
        <BuildingBlock
          position={[1.1, 1.75, 4.65]}
          rotationY={-0.12}
          args={[2.8, 3.5, 2.0]}
          color="#8F9F91"
        />
        <OutlinedBox args={[3.9, 0.22, 5.9]} color="#D8D7C4" position={[2.05, 0.18, 2.38]} rotation={[0, -0.04, 0]} />
        <OutlinedBox args={[0.58, 1.12, 5.4]} color="#8E9D95" position={[3.95, 0.74, 2.05]} rotation={[0, -0.08, 0]} />
        <VendingMachine position={[2.9, 0.8, -1.48]} rotationY={-0.06} />
        <RoadMirror position={[4.12, 1.92, -0.72]} rotationY={-0.24} />
        <TrafficCone position={[3.2, 0.23, 4.9]} />
      </group>

      <group position={[8.45, 0, 15.3]} rotation={[0, -0.28, 0]}>
        <BuildingBlock
          position={[0.34, 2.55, -0.22]}
          rotationY={-0.08}
          args={[3.55, 5.1, 2.35]}
          color="#B4B7A8"
        />
        <BuildingBlock
          position={[-1.25, 1.95, 4.82]}
          rotationY={0.12}
          args={[2.75, 3.9, 2.0]}
          color="#879B88"
        />
        <OutlinedBox args={[3.7, 0.24, 5.6]} color="#D2CFB8" position={[-2.08, 0.18, 2.68]} rotation={[0, 0.04, 0]} />
        <OutlinedBox args={[0.62, 1.2, 5.2]} color="#748D82" position={[-4.02, 0.78, 2.48]} rotation={[0, 0.08, 0]} />
        <MessengerArrowSign position={[-2.95, 1.58, -1.15]} rotationY={0.12} />
        <MessengerPosterBoard position={[-3.38, 1.02, 2.18]} rotationY={0.08} />
      </group>
    </group>
  );
}

function MessengerArrowSign({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.24, 1.58, 0.12]} color="#DFA650" position={[0, 0, 0]} />
      <OutlinedBox args={[0.62, 0.12, 0.08]} color="#8D3942" position={[-0.12, -0.12, 0.1]} />
      <mesh position={[0.32, -0.12, 0.12]} rotation={[0, 0, -Math.PI / 2]} scale={[0.22, 0.28, 0.05]}>
        <coneGeometry args={[1, 1, 3]} />
        <meshToonMaterial color="#8D3942" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      {[-0.36, -0.1, 0.16].map((y, index) => (
        <OutlinedBox
          key={index}
          args={[0.58, 0.06, 0.06]}
          color="#F4E8C3"
          position={[0.02, 0.52 + y, 0.1]}
        />
      ))}
    </group>
  );
}

function MessengerPosterBoard({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.72, 1.18, 0.12]} color="#E9EFE7" position={[0, 0, 0]} />
      <OutlinedBox args={[1.34, 0.72, 0.06]} color="#58B6C7" position={[0, 0.04, 0.1]} />
      {[-0.22, 0.02, 0.26].map((y, index) => (
        <OutlinedBox
          key={index}
          args={[0.78 - index * 0.08, 0.06, 0.04]}
          color="#33494E"
          position={[0.12, y, 0.15]}
        />
      ))}
      {[-0.45, -0.24, -0.03].map((x, index) => (
        <mesh key={index} position={[x, 0.26 - index * 0.22, 0.16]} scale={[0.045, 0.045, 0.02]}>
          <circleGeometry args={[1, 12]} />
          <meshBasicMaterial color="#D99B38" />
        </mesh>
      ))}
    </group>
  );
}

function StorybookFountain() {
  return (
    <group position={[0, 0.02, 0]} scale={1.18}>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[2.25, 2.45, 0.32, 48]} />
        <meshToonMaterial color="#D8CDAE" />
        <Outlines thickness={0.025} color={INK} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[1.58, 0.18, 12, 48]} />
        <meshToonMaterial color="#E6D9B5" />
        <Outlines thickness={0.016} color={INK} />
      </mesh>
      <mesh position={[0, 0.46, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.52, 48]} />
        <meshToonMaterial color="#8BD7E1" transparent opacity={0.88} />
      </mesh>
      <mesh castShadow position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.36, 0.48, 0.86, 24]} />
        <meshToonMaterial color="#CFC7B1" />
        <Outlines thickness={0.014} color={INK} />
      </mesh>
      <mesh position={[0, 1.36, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.58, 0.1, 10, 32]} />
        <meshToonMaterial color="#E6D9B5" />
      </mesh>
      <mesh position={[0, 1.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshToonMaterial color="#C9F3EF" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <cylinderGeometry args={[0.035, 0.025, 1.06, 8]} />
        <meshToonMaterial color="#83D6E5" transparent opacity={0.72} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
        <mesh
          key={angle}
          position={[0.42 * Math.cos(angle), 1.42, 0.42 * Math.sin(angle)]}
          rotation={[Math.PI * 0.18, 0, -angle]}
        >
          <cylinderGeometry args={[0.024, 0.018, 0.82, 8]} />
          <meshToonMaterial color="#9FE6EC" transparent opacity={0.68} />
        </mesh>
      ))}
      {[0, Math.PI * 0.4, Math.PI * 0.85, Math.PI * 1.25, Math.PI * 1.7].map((angle) => (
        <mesh
          key={angle}
          position={[1.1 * Math.cos(angle), 0.58, 1.1 * Math.sin(angle)]}
        >
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshBasicMaterial color="#DDF8F3" transparent opacity={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function PlaygroundZone() {
  return (
    <group position={[-12.9, 0.04, 8.6]} rotation={[0, 0.34, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, -0.08]} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[4.4, 42]} />
        <meshToonMaterial color="#D8CFA6" />
        <Outlines thickness={0.022} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.08]} position={[0.12, 0.024, -0.1]} scale={[1.18, 0.72, 1]}>
        <circleGeometry args={[3.18, 34]} />
        <meshBasicMaterial color="#E9D9A9" transparent opacity={0.68} />
      </mesh>
      <Suspense fallback={<PlaygroundSlideFallback position={[-1.42, 0.02, -0.78]} rotationY={-0.2} />}>
        <ModelAsset
          file={MODEL_FILES.meshyPlaygroundSlide}
          position={[-1.42, 0.02, -0.78]}
          rotation={[0, -0.2, 0]}
          targetHeight={1.62}
          color={MODEL_COLOR_PALETTES.meshyPlaygroundSlide}
          preserveMaterial
          includeOutline={false}
          castShadow={false}
          receiveShadow={false}
        />
      </Suspense>
      <PlaygroundSwing position={[1.85, 0.08, -0.36]} rotationY={0.18} />
      <Sandbox position={[0.9, 0.04, 2.35]} rotationY={-0.08} />
      <ModelAsset
        file={MODEL_FILES.meshyFlowerClump}
        position={[-3.58, 0, 2.42]}
        rotation={[0, -0.42, 0]}
        targetHeight={0.46}
        color={MODEL_COLOR_PALETTES.meshyFlowerClump}
      />
      <ModelAsset
        file={MODEL_FILES.meshyStoneCluster}
        position={[3.52, 0, 2.05]}
        rotation={[0, 0.35, 0]}
        targetHeight={0.18}
        color={MODEL_COLOR_PALETTES.meshyStoneCluster}
      />
    </group>
  );
}

function HighTreeLandmark() {
  return (
    <ModelAsset
      file={HIGH_TREE_MODEL_FILE}
      position={[22.8, 0.02, -16.8]}
      rotation={[0, -0.18, 0]}
      targetHeight={7.2}
      color="#FFFFFF"
      preserveMaterial
      includeOutline={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

function PlaygroundSlideFallback({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.12, 0.14, 0.82]} color="#E8F8F6" position={[0, 1.0, -0.54]} />
      <OutlinedBox args={[0.13, 1.05, 0.13]} color="#5F7E8A" position={[-0.46, 0.46, -0.78]} />
      <OutlinedBox args={[0.13, 1.05, 0.13]} color="#5F7E8A" position={[0.46, 0.46, -0.78]} />
      <mesh position={[0, 0.54, 0.45]} rotation={[-0.52, 0, 0]}>
        <boxGeometry args={[1.0, 0.12, 2.0]} />
        <meshToonMaterial color="#AEEBFA" />
        <Outlines thickness={0.02} color={INK} />
      </mesh>
      <OutlinedBox args={[0.16, 0.78, 0.12]} color="#F7EDCE" position={[0.6, 0.68, -1.05]} rotation={[0, 0, -0.18]} />
      <OutlinedBox args={[0.16, 0.78, 0.12]} color="#F7EDCE" position={[-0.6, 0.68, -1.05]} rotation={[0, 0, 0.18]} />
    </group>
  );
}

function PlaygroundSwing({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow position={[-0.92, 0.82, 0]} rotation={[0, 0, 0.26]}>
        <cylinderGeometry args={[0.055, 0.065, 1.82, 10]} />
        <meshToonMaterial color="#7A4E31" />
        <Outlines thickness={0.012} color={INK} />
      </mesh>
      <mesh castShadow position={[0.92, 0.82, 0]} rotation={[0, 0, -0.26]}>
        <cylinderGeometry args={[0.055, 0.065, 1.82, 10]} />
        <meshToonMaterial color="#7A4E31" />
      </mesh>
      <mesh castShadow position={[0, 1.72, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 2.14, 10]} />
        <meshToonMaterial color="#A96A3F" />
        <Outlines thickness={0.012} color={INK} />
      </mesh>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 1.04, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 1.0, 6]} />
          <meshBasicMaterial color="#34434A" />
        </mesh>
      ))}
      <OutlinedBox args={[0.86, 0.14, 0.42]} color="#64C9B8" position={[0, 0.46, 0]} />
    </group>
  );
}

function Sandbox({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[2.35, 0.18, 1.48]} color="#B98A4F" position={[0, 0.12, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.22, 0]} scale={[1.02, 0.6, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#EBD49A" />
      </mesh>
      <mesh position={[-0.52, 0.3, 0.14]} scale={[0.16, 0.08, 0.16]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#F3E0AA" />
      </mesh>
      <mesh position={[0.44, 0.3, -0.18]} scale={[0.2, 0.07, 0.13]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#DDBB78" />
      </mesh>
    </group>
  );
}

function ContinuousPerimeterFence() {
  return (
    <group>
      <mesh position={[0, 0.64, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[FENCE_RADIUS, 0.07, 8, 160]} />
        <meshToonMaterial color="#C98A4A" />
        <Outlines thickness={0.012} color={INK} />
      </mesh>
      <mesh position={[0, 1.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[FENCE_RADIUS, 0.055, 8, 160]} />
        <meshToonMaterial color="#A96A3F" />
      </mesh>
    </group>
  );
}

function makePolarPlacements(): ModelPlacement[] {
  const placements: ModelPlacement[] = [];

  Array.from({ length: 8 }, (_, index) => {
    const theta = (index / 8) * Math.PI * 2 + Math.PI / 8;
    const radius = 20.8 + (index % 2) * 1.2;
    placements.push({
      key: `lamp-ring-${index}`,
      model: 'streetLamp',
      position: [radius * Math.cos(theta), 0, radius * Math.sin(theta)],
      rotation: [0, -theta + Math.PI, 0],
      targetHeight: 3.25,
      color: MODEL_COLOR_PALETTES.streetLamp,
    });
  });

  PARK_BENCH_SLOTS.forEach((bench) => {
    placements.push({
      key: bench.key,
      model: 'parkBench',
      position: bench.position,
      rotation: [0, bench.rotationY, 0],
      targetHeight: 1.22,
      color: MODEL_COLOR_PALETTES.parkBench,
    });
  });

  return placements;
}

function WoodFenceLayer({ placements }: { placements: ModelPlacement[] }) {
  // 柵 48 本を (A/B/C × 配色) ごとに結合 → 3 ドローコールに集約。
  const merged = useMemo<MergePlacement[]>(
    () =>
      placements.map((p) => ({
        file: MODEL_FILES[p.model],
        color: p.color,
        position: p.position,
        rotation: p.rotation,
        targetHeight: p.targetHeight,
      })),
    [placements],
  );
  return <MergedModelGroups placements={merged} />;
}

function makeWoodFencePlacements(): ModelPlacement[] {
  const fenceModels: ModelKey[] = ['woodFenceA', 'woodFenceB', 'woodFenceC'];
  const count = 48;
  const radius = FENCE_RADIUS - 0.25;
  const placements: ModelPlacement[] = [];

  Array.from({ length: count }, (_, index) => {
    const theta = (index / count) * Math.PI * 2;
    const model = fenceModels[index % fenceModels.length]!;
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    if (isInsideEntranceGateClearance(x, z)) return;
    placements.push({
      key: `wood-fence-${index}`,
      model,
      position: [x, 0, z] as Vec3,
      rotation: [0, -theta + Math.PI / 2, 0] as Vec3,
      targetHeight: 0.8 + (index % 3) * 0.05,
      color: MODEL_COLOR_PALETTES[model],
    });
  });

  return placements;
}

function ParkPlantingLayer() {
  const hedges = useMemo(makeHedgePlacements, []);
  const lowTrees = useMemo(makePathLowTreePlacements, []);
  const shrubs = useMemo(makeShrubPlacements, []);

  // 影なし（生垣・茂み）と 影あり（低木＝ヒーロー扱い・輪郭あり）でグループを分ける。
  const groundPlacements = useMemo<MergePlacement[]>(
    () => [
      ...hedges.map((h) => ({
        file: MODEL_FILES.storybookHedge,
        color: MODEL_COLOR_PALETTES.storybookHedge,
        position: h.position,
        rotation: [0, h.rotationY, 0] as Vec3,
        targetHeight: 0.78 * h.scale,
      })),
      ...shrubs.map((s) => ({
        file: MODEL_FILES[s.model],
        color: s.color,
        position: s.position,
        rotation: s.rotation,
        targetHeight: s.targetHeight,
      })),
    ],
    [hedges, shrubs],
  );

  const treePlacements = useMemo<MergePlacement[]>(
    () =>
      lowTrees.map((t) => ({
        file: MODEL_FILES.meshyLowPathTree,
        color: MODEL_COLOR_PALETTES.meshyLowPathTree,
        position: t.position,
        rotation: [0, t.rotationY, 0] as Vec3,
        targetHeight: 1.18 * t.scale,
      })),
    [lowTrees],
  );

  return (
    <group>
      <MergedModelGroups placements={groundPlacements} />
      <MergedModelGroups placements={treePlacements} castShadow />
    </group>
  );
}

function makeHedgePlacements() {
  const placements: Array<{
    key: string;
    position: Vec3;
    rotationY: number;
    length: number;
    scale: number;
  }> = [];
  const add = (
    key: string,
    x: number,
    z: number,
    rotationY: number,
    length: number,
    scale = 1,
  ) => {
    if (
      isInsideBenchFrontClearance(x, z) ||
      isInsideStartingCameraClearance(x, z) ||
      isInsideEntranceGateClearance(x, z) ||
      isInsideMainWalkwayClearance(x, z)
    ) return;
    placements.push({
      key,
      position: [x, 0, z],
      rotationY,
      length,
      scale,
    });
  };

  Array.from({ length: 8 }, (_, index) => {
    const theta = (index / 8) * Math.PI * 2 + 0.08;
    const radius = 5.95;
    add(
      `fountain-hedge-${index}`,
      radius * Math.cos(theta),
      radius * Math.sin(theta),
      theta - Math.PI / 2,
      1.55,
      index % 2 === 0 ? 0.9 : 0.98,
    );
  });

  Array.from({ length: 12 }, (_, index) => {
    const theta = (index / 12) * Math.PI * 2 + 0.04;
    const radius = 24.35 + (index % 2) * 0.58;
    add(
      `outer-hedge-${index}`,
      radius * Math.cos(theta),
      radius * Math.sin(theta),
      theta - Math.PI / 2,
      1.75,
      1.04,
    );
  });

  return placements;
}

function makeShrubPlacements(): ModelPlacement[] {
  const rng = createSeededRandom(20260625);
  const placements: ModelPlacement[] = [];
  const pathLines = [Math.PI / 4, Math.PI * 0.75];
  const radii = [13.1, 21.2];
  let index = 0;

  Array.from({ length: 6 }, (_, ringIndex) => {
    const theta = (ringIndex / 6) * Math.PI * 2 + 0.14;
    const radius = 6.9 + (ringIndex % 2) * 0.55;
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    const rotationY = -theta + rng() * 0.4;
    const targetHeight = 0.84 + rng() * 0.18;
    if (
      isInsideBenchFrontClearance(x, z) ||
      isInsideStartingCameraClearance(x, z) ||
      isInsideEntranceGateClearance(x, z) ||
      isInsideMainWalkwayClearance(x, z)
    ) return;

    placements.push({
      key: `fountain-shrub-${ringIndex}`,
      model: 'bush',
      position: [x, 0, z],
      rotation: [0, rotationY, 0],
      targetHeight,
      color: MODEL_COLOR_PALETTES.bush,
    });
  });

  pathLines.forEach((lineAngle) => {
    [lineAngle, lineAngle + Math.PI].forEach((theta) => {
      const forward: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const right: Vec3 = [-Math.sin(theta), 0, Math.cos(theta)];
      radii.forEach((radius) => {
        [-1, 1].forEach((side) => {
          if (rng() < 0.45) return;
          const sideOffset = 4.8 + rng() * 0.85;
          const wobble = (rng() - 0.5) * 0.9;
          const x = forward[0] * (radius + wobble) + right[0] * side * sideOffset;
          const z = forward[2] * (radius + wobble) + right[2] * side * sideOffset;
          const rotationY = theta + rng() * Math.PI * 2;
          const targetHeight = 0.74 + rng() * 0.22;
          if (
            isInsideBenchFrontClearance(x, z) ||
            isInsideStartingCameraClearance(x, z) ||
            isInsideEntranceGateClearance(x, z) ||
            isInsideMainWalkwayClearance(x, z)
          ) return;

          placements.push({
            key: `path-shrub-${index}`,
            model: 'bush',
            position: [x, 0, z],
            rotation: [0, rotationY, 0],
            targetHeight,
            color: MODEL_COLOR_PALETTES.bush,
          });
          index += 1;
        });
      });
    });
  });

  return placements;
}

function makePathLowTreePlacements() {
  const rng = createSeededRandom(20260624);
  const placements: Array<{
    key: string;
    position: Vec3;
    rotationY: number;
    scale: number;
  }> = [];
  const pathLines = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75];
  const radii = [9.8, 14.4, 19.0, 23.3];
  let index = 0;

  pathLines.forEach((lineAngle, lineIndex) => {
    [lineAngle, lineAngle + Math.PI].forEach((theta) => {
      const forward: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const right: Vec3 = [-Math.sin(theta), 0, Math.cos(theta)];
      radii.forEach((radius, radiusIndex) => {
        [-1, 1].forEach((side) => {
          if ((lineIndex + radiusIndex + (side > 0 ? 1 : 0)) % 4 === 0) return;
          if (rng() < 0.24) return;

          const sideOffset = 3.75 + rng() * 1.05;
          const wobble = (rng() - 0.5) * 0.5;
          const x = forward[0] * (radius + wobble) + right[0] * side * sideOffset;
          const z = forward[2] * (radius + wobble) + right[2] * side * sideOffset;
          const rotationY = theta + side * 0.35 + (rng() - 0.5) * 0.3;
          const scale = 0.9 + rng() * 0.36;
          if (
            isInsideBenchFrontClearance(x, z) ||
            isInsideStartingCameraClearance(x, z) ||
            isInsideEntranceGateClearance(x, z) ||
            isInsideMainWalkwayClearance(x, z)
          ) return;

          placements.push({
            key: `path-low-tree-${index}`,
            position: [x, 0, z],
            rotationY,
            scale,
          });
          index += 1;
        });
      });
    });
  });

  return placements;
}

function LowPathTree({
  position,
  rotationY,
  scale,
}: {
  position: Vec3;
  rotationY: number;
  scale: number;
}) {
  const crowns: Array<[number, number, number, number, string]> = [
    [0, 0.58, 0, 0.38, '#72C66A'],
    [-0.28, 0.46, 0.04, 0.28, '#8AD577'],
    [0.28, 0.46, -0.02, 0.26, '#5DAE62'],
  ];

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.07, 0.44, 8]} />
        <meshToonMaterial color="#7A4E31" />
      </mesh>
      {crowns.map(([x, y, z, radius, color], index) => (
        <mesh key={index} position={[x, y, z]} castShadow receiveShadow>
          <sphereGeometry args={[radius, 14, 10]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.018} color={INK} />
        </mesh>
      ))}
    </group>
  );
}

function addPolarGroup(
  placements: ModelPlacement[],
  rng: () => number,
  model: ModelKey,
  count: number,
  minRadius: number,
  maxRadius: number,
  minHeight: number,
  maxHeight: number,
) {
  const palette = MODEL_COLOR_PALETTES[model];
  for (let i = 0; i < count; i += 1) {
    const theta = rng() * Math.PI * 2;
    const radius = minRadius + rng() * (maxRadius - minRadius);
    placements.push({
      key: `${model}-${i}`,
      model,
      position: [radius * Math.cos(theta), 0, radius * Math.sin(theta)],
      rotation: [0, rng() * Math.PI * 2, 0],
      targetHeight: minHeight + rng() * (maxHeight - minHeight),
      color: palette[Math.floor(rng() * palette.length)]!,
    });
  }
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function ParkGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -2.8]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <meshToonMaterial color="#78A96E" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.4]} receiveShadow>
        <circleGeometry args={[3.35, 72]} />
        <meshToonMaterial color="#C9B980" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.02]} position={[0, 0.026, -2.7]} receiveShadow>
        <planeGeometry args={[2.05, 11.2]} />
        <meshToonMaterial color="#829994" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.46]} position={[-2.25, 0.035, -1.0]}>
        <planeGeometry args={[1.0, 4.6]} />
        <meshToonMaterial color="#E7DFC2" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.5]} position={[2.38, 0.036, -1.05]}>
        <planeGeometry args={[1.0, 4.8]} />
        <meshToonMaterial color="#E7DFC2" />
      </mesh>
      {[-0.72, 0, 0.72].map((x, i) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0.03]} position={[x, 0.052, 1.45 - i * 1.36]}>
          <planeGeometry args={[0.18, 0.8]} />
          <meshBasicMaterial color="#F4F1E6" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, -0.18]} position={[1.42, 0.055, 0.85]} scale={[0.82, 0.28, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#B8D8D2" transparent opacity={0.58} />
      </mesh>
    </group>
  );
}

function ParkModelLayer() {
  return (
    <group>
      <ModelAsset
        file={MODEL_FILES.woodFenceA}
        position={[-3.08, 0.03, -1.38]}
        rotation={[0, 0.66, 0]}
        targetHeight={0.72}
        color={MODEL_COLOR_PALETTES.woodFenceA}
      />
      <ModelAsset
        file={MODEL_FILES.woodFenceB}
        position={[3.05, 0.03, -1.28]}
        rotation={[0, -0.78, 0]}
        targetHeight={0.72}
        color={MODEL_COLOR_PALETTES.woodFenceB}
      />
      <ModelAsset
        file={MODEL_FILES.woodFenceC}
        position={[3.25, 0.03, 1.5]}
        rotation={[0, -1.1, 0]}
        targetHeight={0.72}
        color={MODEL_COLOR_PALETTES.woodFenceC}
      />
      <ModelAsset
        file={MODEL_FILES.parkBench}
        position={[-1.52, 0.045, 1.98]}
        rotation={[0, 0.32, 0]}
        targetHeight={0.86}
        color="#B57A45"
      />
      <ModelAsset
        file={MODEL_FILES.roundTopiary}
        position={[2.45, 0.03, -4.3]}
        rotation={[0, -0.5, 0]}
        targetHeight={2.4}
        color="#9AC06F"
      />
      <ModelAsset
        file={MODEL_FILES.streetLamp}
        position={[-2.52, 0.03, -4.65]}
        rotation={[0, 0.45, 0]}
        targetHeight={2.2}
        color="#A9B4A5"
      />
      <ModelAsset
        file={MODEL_FILES.bush}
        position={[-5.6, 0.04, -2.55]}
        rotation={[0, 0.82, 0]}
        targetHeight={0.82}
        color="#D8DED0"
      />
      <ModelAsset
        file={MODEL_FILES.fountain}
        position={[4.9, 0.04, -2.85]}
        rotation={[0, -1.0, 0]}
        targetHeight={0.9}
        color="#D1E2DE"
      />
    </group>
  );
}

function ParkStreetFurniture() {
  return (
    <group>
      <VendingMachine position={[-4.45, 0.78, 0.28]} rotationY={0.18} />
      <MiniTruck position={[-5.35, 0.52, 2.1]} rotationY={0.18} />
      <RoadMirror position={[-2.7, 1.86, 1.16]} rotationY={0.1} />
      <RoundStreetSign position={[2.12, 1.28, -3.32]} />
      <TrashCan position={[-2.3, 0.36, 0.95]} />
      <TrafficCone position={[-2.04, 0.2, 0.55]} />
      <Tree position={[-4.9, 0, -1.95]} scale={0.8} />
      <Tree position={[4.82, 0, -2.15]} scale={0.86} />
      <Tree position={[-4.7, 0, 3.12]} scale={0.72} />
      <Tree position={[4.66, 0, 2.92]} scale={0.76} />
    </group>
  );
}

/**
 * 同一 (モデル × 配色) のベイク済みテンプレートをキャッシュする。
 *
 * マウント時の重さの主因は、配置 1 つごとに paintModelGeometry（頂点カラー焼き）と
 * EdgesGeometry（輪郭線）を再計算していたこと（柵 48・生垣・低木・木で計 200+ 個）。
 * テンプレートは geometry / material / 輪郭を 1 度だけ生成して共有し、各配置は
 * 軽量な clone(true)（geometry・material は参照共有）で複製する。見た目は不変。
 */
const modelTemplateCache = new Map<string, { template: Object3D; unitScale: number }>();

// 影を落とすのは存在感のある大型オブジェのみ。小さな植栽（茂み・生垣・草・花・石）は
// castShadow=false にして影マップのドローコールを大幅削減する（見た目はほぼ不変）。
const SHADOW_CASTER_MODELS = new Set<ModelKey>();

function getModelTemplate(
  file: string,
  color: string | string[],
  source: Object3D,
  preserveMaterial = false,
  includeOutline = true,
  castShadowOverride?: boolean,
  receiveShadowOverride?: boolean,
): { template: Object3D; unitScale: number } {
  const palette = Array.isArray(color) ? color : [color];
  const cacheKey = [
    file,
    palette.join(','),
    preserveMaterial ? 'material' : 'painted',
    includeOutline ? 'outline' : 'flat',
    castShadowOverride ?? 'auto-cast',
    receiveShadowOverride ?? 'auto-receive',
  ].join('|');
  const cached = modelTemplateCache.get(cacheKey);
  if (cached) return cached;

  const cloned = source.clone(true);
  const modelKey = MODEL_KEY_BY_FILE.get(file);
  let meshIndex = 0;
  const edgeMaterial = new LineBasicMaterial({
    color: INK,
    transparent: true,
    opacity: 0.74,
  });

  cloned.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.castShadow = castShadowOverride ?? (modelKey ? SHADOW_CASTER_MODELS.has(modelKey) : true);
    mesh.receiveShadow = receiveShadowOverride ?? true;
    mesh.geometry = preserveMaterial
      ? mesh.geometry.clone()
      : paintModelGeometry(mesh.geometry, modelKey, palette, meshIndex);
    mesh.material = preserveMaterial
      ? cloneMaterial(mesh.material)
      : new MeshToonMaterial({ color: '#FFFFFF', vertexColors: true });
    meshIndex += 1;
    mesh.geometry.computeVertexNormals();
    // 輪郭線はヒーローオブジェのみ。小さな植栽は省略してドローコールを半減する。
    if (includeOutline && (!modelKey || SHADOW_CASTER_MODELS.has(modelKey))) {
      const outline = new LineSegments(new EdgesGeometry(mesh.geometry, 32), edgeMaterial);
      outline.renderOrder = 2;
      mesh.add(outline);
    }
  });

  const box = new Box3().setFromObject(cloned);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  cloned.position.sub(center);
  cloned.position.y += size.y / 2;

  const result = { template: cloned, unitScale: 1 / Math.max(size.y, 0.001) };
  modelTemplateCache.set(cacheKey, result);
  return result;
}

function ModelAsset({
  file,
  position,
  rotation,
  targetHeight,
  color,
  preserveMaterial = false,
  includeOutline = true,
  castShadow,
  receiveShadow,
}: {
  file: string;
  position: Vec3;
  rotation: Vec3;
  targetHeight: number;
  color: string | string[];
  preserveMaterial?: boolean;
  includeOutline?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const gltf = useGLTF(`${MODEL_ROOT}${file}`) as { scene: Object3D };
  const { object, scale } = useMemo(() => {
    const { template, unitScale } = getModelTemplate(
      file,
      color,
      gltf.scene,
      preserveMaterial,
      includeOutline,
      castShadow,
      receiveShadow,
    );
    // clone(true) は geometry/material を参照共有するため軽量（重い焼きは発生しない）。
    return { object: template.clone(true), scale: targetHeight * unitScale };
  }, [castShadow, color, file, gltf.scene, includeOutline, preserveMaterial, receiveShadow, targetHeight]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={object} />
    </group>
  );
}

function cloneMaterial(material: Mesh['material']) {
  if (Array.isArray(material)) return material.map((m) => optimizeMaterialTextures(m.clone()));
  return optimizeMaterialTextures(material.clone());
}

function optimizeMaterialTextures<T extends Material>(material: T) {
  const record = material as T & Record<string, unknown>;
  ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].forEach((key) => {
    const texture = record[key] as Texture | undefined;
    if (!texture?.isTexture) return;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
  });
  return material;
}

type MergeItem = { position: Vec3; rotation: Vec3; targetHeight: number };
type MergePlacement = MergeItem & { file: string; color: string | string[] };

/**
 * 静的な植栽・柵を (モデル × 配色) ごとに 1 つのジオメトリへ結合する。
 *
 * 配置 1 つ = 1 ドローコールだったものを、グループ全体で 1 ドローに集約する
 * （茂み 100 / 生垣 32 / 柵 48 ≒ 180 個 → 数個）。動かない背景なので結合が最適。
 * 輪郭線(LineSegments)もテンプレートに含まれていれば同様に 1 つへ結合する。
 */
function buildMergedGeometry(
  file: string,
  color: string | string[],
  source: Object3D,
  items: MergeItem[],
): {
  fillGeometry: BufferGeometry | null;
  fillMaterial: Material | null;
  edgeGeometry: BufferGeometry | null;
  edgeMaterial: Material | null;
} {
  const { template, unitScale } = getModelTemplate(file, color, source);
  template.updateMatrixWorld(true);

  const fillParts: { geometry: BufferGeometry; local: Matrix4 }[] = [];
  const edgeParts: { geometry: BufferGeometry; local: Matrix4 }[] = [];
  let fillMaterial: Material | null = null;
  let edgeMaterial: Material | null = null;

  template.traverse((child) => {
    const obj = child as Mesh & { isLineSegments?: boolean };
    if (obj.isLineSegments && obj.geometry) {
      edgeParts.push({ geometry: obj.geometry, local: obj.matrixWorld.clone() });
      edgeMaterial = (obj as unknown as LineSegments).material as Material;
    } else if (obj.isMesh && obj.geometry) {
      fillParts.push({ geometry: obj.geometry, local: obj.matrixWorld.clone() });
      fillMaterial = obj.material as Material;
    }
  });

  const fillGeometries: BufferGeometry[] = [];
  const edgeGeometries: BufferGeometry[] = [];
  const placementMatrix = new Matrix4();
  const composed = new Matrix4();
  const quat = new Quaternion();
  const euler = new Euler();
  const scaleVec = new Vector3();
  const posVec = new Vector3();

  for (const item of items) {
    const scale = item.targetHeight * unitScale;
    euler.set(item.rotation[0], item.rotation[1], item.rotation[2]);
    quat.setFromEuler(euler);
    posVec.set(item.position[0], item.position[1], item.position[2]);
    scaleVec.set(scale, scale, scale);
    placementMatrix.compose(posVec, quat, scaleVec);

    for (const part of fillParts) {
      const g = part.geometry.clone();
      composed.multiplyMatrices(placementMatrix, part.local);
      g.applyMatrix4(composed);
      fillGeometries.push(g);
    }
    for (const part of edgeParts) {
      const g = part.geometry.clone();
      composed.multiplyMatrices(placementMatrix, part.local);
      g.applyMatrix4(composed);
      edgeGeometries.push(g);
    }
  }

  return {
    fillGeometry: fillGeometries.length ? mergeGeometries(fillGeometries, false) : null,
    fillMaterial,
    edgeGeometry: edgeGeometries.length ? mergeGeometries(edgeGeometries, false) : null,
    edgeMaterial,
  };
}

function MergedModels({
  file,
  color,
  items,
  castShadow,
}: {
  file: string;
  color: string | string[];
  items: MergeItem[];
  castShadow: boolean;
}) {
  const gltf = useGLTF(`${MODEL_ROOT}${file}`) as { scene: Object3D };
  const { fillGeometry, fillMaterial, edgeGeometry, edgeMaterial } = useMemo(
    () => buildMergedGeometry(file, color, gltf.scene, items),
    [file, color, gltf.scene, items],
  );

  if (!fillGeometry || !fillMaterial) return null;
  return (
    <group>
      <mesh
        geometry={fillGeometry}
        material={fillMaterial}
        castShadow={castShadow}
        receiveShadow
      />
      {edgeGeometry && edgeMaterial && (
        <lineSegments geometry={edgeGeometry} material={edgeMaterial} renderOrder={2} />
      )}
    </group>
  );
}

/** MergePlacement[] を (モデル × 配色) でグルーピングし、各グループを結合描画する。 */
function MergedModelGroups({
  placements,
  castShadow = false,
}: {
  placements: MergePlacement[];
  castShadow?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { file: string; color: string | string[]; items: MergeItem[] }
    >();
    for (const p of placements) {
      const colorKey = Array.isArray(p.color) ? p.color.join(',') : p.color;
      const key = `${p.file}|${colorKey}`;
      let group = map.get(key);
      if (!group) {
        group = { file: p.file, color: p.color, items: [] };
        map.set(key, group);
      }
      group.items.push({
        position: p.position,
        rotation: p.rotation,
        targetHeight: p.targetHeight,
      });
    }
    return [...map.values()];
  }, [placements]);

  return (
    <group>
      {groups.map((group, index) => (
        <MergedModels
          key={`${group.file}-${index}`}
          file={group.file}
          color={group.color}
          items={group.items}
          castShadow={castShadow}
        />
      ))}
    </group>
  );
}

function paintModelGeometry(
  sourceGeometry: Mesh['geometry'],
  model: ModelKey | undefined,
  fallbackPalette: string[],
  meshIndex: number,
) {
  const geometry = sourceGeometry.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const color = new Color();

  if (!box) {
    color.set(fallbackPalette[meshIndex % fallbackPalette.length] ?? '#FFFFFF');
    for (let i = 0; i < position.count; i += 1) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    return geometry;
  }

  const width = Math.max(box.max.x - box.min.x, 0.001);
  const height = Math.max(box.max.y - box.min.y, 0.001);
  const depth = Math.max(box.max.z - box.min.z, 0.001);

  for (let i = 0; i < position.count; i += 1) {
    const x01 = (position.getX(i) - box.min.x) / width;
    const y01 = (position.getY(i) - box.min.y) / height;
    const z01 = (position.getZ(i) - box.min.z) / depth;
    const radial = Math.hypot(x01 - 0.5, z01 - 0.5);
    color.set(
      selectModelColor(
        model,
        fallbackPalette,
        x01,
        y01,
        z01,
        radial,
        i,
      ),
    );
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function selectModelColor(
  model: ModelKey | undefined,
  fallbackPalette: string[],
  x01: number,
  y01: number,
  z01: number,
  radial: number,
  index: number,
) {
  switch (model) {
    case 'roundTopiary':
      if (y01 < 0.18) return '#8B6A3E';
      if (radial < 0.22 && y01 > 0.3) return '#3F8F4F';
      if (y01 > 0.72 || radial > 0.34) return index % 5 === 0 ? '#9EDC79' : '#65B95F';
      return '#4E9D58';
    case 'bush':
      if (y01 < 0.2) return '#5DAE62';
      return radial > 0.38 || index % 7 === 0 ? '#A6DF83' : '#74C96B';
    case 'storybookHedge':
      if (y01 < 0.16) return '#4F9355';
      if (y01 > 0.7 && index % 41 === 0) return '#F0A3B5';
      if (y01 > 0.62 && index % 29 === 0) return '#F6DF7A';
      if (radial > 0.42) return index % 5 === 0 ? '#8DD77A' : '#6FBE64';
      return index % 7 === 0 ? '#58A95D' : '#79CA6E';
    case 'parkBench':
      if (y01 < 0.24 || radial > 0.48) return '#7A4E31';
      return index % 3 === 0 ? '#D6954A' : '#B96F3C';
    case 'fountain':
      if (y01 < 0.24) return '#CFC7B1';
      if (radial < 0.24 || (y01 > 0.38 && y01 < 0.68)) return '#83D6E5';
      if (y01 > 0.78) return '#DDF8F3';
      return '#E6D9B5';
    case 'streetLamp':
      if (y01 > 0.74 && radial < 0.28) return '#FFF1A8';
      if (y01 < 0.18) return '#59666A';
      return '#303D41';
    case 'woodFenceA':
    case 'woodFenceB':
    case 'woodFenceC':
    case 'meshyWoodRailSegment':
      if (y01 < 0.12 || radial > 0.5) return '#6E4328';
      if (x01 < 0.08 || x01 > 0.92) return '#7A4E31';
      if (z01 < 0.18 || z01 > 0.82) return '#9C6338';
      if (index % 9 === 0) return '#E0B56A';
      return index % 3 === 0 ? '#C98A4A' : '#A96A3F';
    case 'meshyParkEntranceSign':
      if (y01 < 0.18 || x01 < 0.18 || x01 > 0.82) return '#7A4E31';
      if (y01 > 0.46 && radial < 0.18) return '#67B96A';
      if (z01 > 0.78 && y01 > 0.22 && y01 < 0.52) return '#69BFD0';
      return '#F2E5BC';
    case 'meshyParkEntranceGate':
      if (y01 < 0.24 || x01 < 0.18 || x01 > 0.82) return '#7A4E31';
      if (y01 > 0.68 && radial < 0.3) return '#F2E5BC';
      if (y01 > 0.46 && index % 31 === 0) return '#67B96A';
      if (z01 > 0.74 && y01 > 0.28 && y01 < 0.58) return '#69BFD0';
      return index % 5 === 0 ? '#C98A4A' : '#A96A3F';
    case 'meshyParkGazebo':
      // 上部=ミントのドーム屋根 / 下部=木の土台・段 / 中間=生成り色の柱・手すり
      if (y01 > 0.64) return index % 6 === 0 ? '#BFE8D6' : '#8FD3BC';
      if (y01 < 0.14) return index % 3 === 0 ? '#7A4E31' : '#9C6338';
      if (radial > 0.36) return index % 7 === 0 ? '#E7DABA' : '#F2E5BC';
      return '#F2E5BC';
    case 'meshyPathGrassTuft':
      if (y01 > 0.66 && index % 17 === 0) return '#F2D567';
      if (radial > 0.36 || y01 > 0.58) return '#83CB6F';
      return '#5FAE62';
    case 'meshyFlowerClump':
      if (y01 > 0.62 && index % 23 === 0) return '#E95B4D';
      if (y01 > 0.6 && index % 17 === 0) return '#F49BB8';
      if (y01 > 0.58 && index % 11 === 0) return '#F3D35B';
      if (radial > 0.35 || y01 > 0.5) return '#83CB6F';
      return '#70BF65';
    case 'meshyStoneCluster':
      if (y01 > 0.62) return '#F5EBCF';
      return index % 2 === 0 ? '#EEE4C7' : '#CDBF97';
    case 'meshyLowGroveMound':
      if (y01 < 0.12) return '#3B8754';
      if (radial > 0.42) return '#6BB765';
      return index % 4 === 0 ? '#7CC56D' : '#4F9F58';
    case 'meshyLowPathTree':
      if (y01 < 0.34 && radial < 0.24) return '#7A4E31';
      if (y01 < 0.56 && radial < 0.16) return '#8B5B37';
      return index % 5 === 0 ? '#8AD577' : '#62B761';
    default:
      return fallbackPalette[index % fallbackPalette.length] ?? '#FFFFFF';
  }
}

function TownStreetScene() {
  return (
    <group>
      <TownSkyline />
      <RoadSurface />
      <Sidewalks />
      <StreetBuildings />
      <StreetProps />
    </group>
  );
}

function MessengerStreetFrame() {
  return (
    <group>
      <group position={[0, 0.02, -35.5]} rotation={[0, 0.01, 0]} scale={2.65}>
        <RoadSurface />
        <Sidewalks />
        <StreetBuildings />
        <StreetProps />
      </group>

      <ElevatedOverpass position={[0, 7.25, -31.5]} rotationY={0.03} />
      <RetainingWall position={[0, 1.72, -29.9]} rotationY={0.02} />
      <SideStreetStack side="left" />
      <SideStreetStack side="right" />
      <BackAlleyDetails />
    </group>
  );
}

function ElevatedOverpass({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  const ribs = Array.from({ length: 12 }, (_, i) => -20.5 + i * 3.72);

  return (
    <group position={position} rotation={[0.02, rotationY, -0.025]}>
      <OutlinedBox args={[48, 0.72, 4.4]} color="#74BCAF" position={[0, 0, 0]} />
      <OutlinedBox args={[48.8, 0.22, 0.32]} color="#3C5052" position={[0, -0.48, -2.24]} />
      <OutlinedBox args={[48.8, 0.22, 0.32]} color="#3C5052" position={[0, -0.48, 2.24]} />
      {ribs.map((x, index) => (
        <OutlinedBox
          key={x}
          args={[0.24, 0.28, 4.9]}
          color={index % 2 === 0 ? '#95CEC2' : '#5FAFA6'}
          position={[x, -0.62, 0]}
          rotation={[0, 0, 0.08]}
        />
      ))}
      {[-16, 0, 16].map((x) => (
        <group key={x} position={[x, -3.72, 1.4]}>
          <mesh castShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.36, 0.48, 7.1, 12]} />
            <meshToonMaterial color="#53655F" />
            <Outlines thickness={0.018} color={INK} />
          </mesh>
          <OutlinedBox args={[1.32, 0.34, 1.0]} color="#435357" position={[0, -3.74, 0]} />
        </group>
      ))}
    </group>
  );
}

function RetainingWall({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  const bricks = Array.from({ length: 22 }, (_, i) => ({
    x: -20.8 + i * 1.98,
    y: 0.18 + (i % 3) * 0.38,
    width: 0.72 + (i % 4) * 0.22,
  }));

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[45, 3.35, 1.0]} color="#9DAA9F" position={[0, 0, 0]} />
      <OutlinedBox args={[45.4, 0.28, 1.2]} color="#52605E" position={[0, 1.9, 0.02]} />
      {bricks.map((brick, index) => (
        <OutlinedBox
          key={index}
          args={[brick.width, 0.18, 0.05]}
          color={index % 2 === 0 ? '#B6C0B8' : '#838F88'}
          position={[brick.x, brick.y, 0.56]}
        />
      ))}
    </group>
  );
}

function SideStreetStack({ side }: { side: 'left' | 'right' }) {
  const sign = side === 'left' ? -1 : 1;
  const rotation = sign > 0 ? -0.36 : 0.36;

  return (
    <group position={[sign * 31.8, 0, -17.5]} rotation={[0, rotation, 0]}>
      <BuildingBlock
        position={[sign * 1.1, 3.0, -5.6]}
        rotationY={-rotation * 0.5}
        args={[6.1, 6.0, 3.2]}
        color={side === 'left' ? '#8E978E' : '#A3A79D'}
      />
      <BuildingBlock
        position={[sign * 3.7, 2.18, -0.3]}
        rotationY={-rotation * 0.42}
        args={[4.8, 4.35, 2.7]}
        color={side === 'left' ? '#B7BEAF' : '#8D9A91'}
      />
      <StairRun direction={sign} position={[sign * -2.2, 0.12, -2.1]} />
      <GuardRail position={[sign * -3.4, 1.18, -0.35]} direction={sign} />
      <PipeRun position={[sign * 3.4, 2.05, -3.85]} direction={sign} />
      <OutdoorAcUnit position={[sign * -1.2, 1.08, 1.32]} rotationY={-rotation * 0.8} />
      <VendingMachine position={[sign * -3.1, 0.78, 2.25]} rotationY={-rotation * 0.4} />
      <RoundStreetSign position={[sign * -4.1, 1.68, -4.2]} />
    </group>
  );
}

function StairRun({
  position,
  direction,
}: {
  position: Vec3;
  direction: number;
}) {
  return (
    <group position={position} rotation={[0, direction * 0.12, 0]}>
      {Array.from({ length: 11 }, (_, index) => (
        <OutlinedBox
          key={index}
          args={[2.9, 0.16, 0.54]}
          color={index % 2 === 0 ? '#D5D8C9' : '#B8C0B4'}
          position={[
            direction * index * 0.27,
            index * 0.14,
            -index * 0.42,
          ]}
        />
      ))}
      <GuardRail position={[direction * 1.92, 1.08, -2.35]} direction={direction} compact />
    </group>
  );
}

function GuardRail({
  position,
  direction,
  compact = false,
}: {
  position: Vec3;
  direction: number;
  compact?: boolean;
}) {
  const count = compact ? 5 : 7;
  const spacing = compact ? 0.72 : 0.92;

  return (
    <group position={position} rotation={[0, direction * 0.1, 0]}>
      {Array.from({ length: count }, (_, index) => (
        <group key={index} position={[direction * index * spacing, 0, -index * spacing * 0.22]}>
          <OutlinedBox args={[0.08, 1.02, 0.08]} color="#E9EEE6" position={[0, 0, 0]} />
          <OutlinedBox args={[0.62, 0.1, 0.1]} color="#E9EEE6" position={[direction * 0.28, 0.48, -0.06]} />
        </group>
      ))}
    </group>
  );
}

function PipeRun({
  position,
  direction,
}: {
  position: Vec3;
  direction: number;
}) {
  return (
    <group position={position} rotation={[0, direction * 0.2, 0]}>
      <mesh castShadow position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 4.2, 10]} />
        <meshToonMaterial color="#435357" />
        <Outlines thickness={0.01} color={INK} />
      </mesh>
      <mesh castShadow position={[direction * 2.18, -0.42, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 10]} />
        <meshToonMaterial color="#435357" />
      </mesh>
      <OutlinedBox args={[0.5, 0.72, 0.18]} color="#E2E5D8" position={[direction * 2.18, -1.1, 0.05]} />
    </group>
  );
}

function OutdoorAcUnit({
  position,
  rotationY,
}: {
  position: Vec3;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.24, 0.82, 0.55]} color="#E8E9DD" position={[0, 0, 0]} />
      <mesh position={[0, 0.03, 0.3]} scale={[0.28, 0.28, 0.03]}>
        <ringGeometry args={[0.62, 0.88, 24]} />
        <meshToonMaterial color="#455456" />
      </mesh>
      <mesh position={[0, 0.03, 0.32]} scale={[0.17, 0.17, 0.02]}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial color="#AAB5AF" />
      </mesh>
      <OutlinedBox args={[0.34, 0.1, 0.04]} color="#C66A3D" position={[0.38, 0.22, 0.32]} />
    </group>
  );
}

function BackAlleyDetails() {
  return (
    <group>
      <RoadMirror position={[-27.2, 2.05, -20.5]} rotationY={0.28} />
      <TrafficCone position={[26.2, 0.24, -20.8]} />
      <TrashCan position={[24.8, 0.4, -21.7]} />
      <MiniTruck position={[-23.5, 0.62, -23.6]} rotationY={0.55} />
      <ShopSign position={[26.4, 2.35, -19.4]} rotationY={-0.46} />
    </group>
  );
}

function TownSkyline() {
  return (
    <group>
      {[
        [-7.2, 1.45, -13.3, 4.4, 0.5, 0.08],
        [-1.7, 1.28, -13.28, 5.6, 0.44, -0.08],
        [4.8, 1.54, -13.26, 5.8, 0.52, 0.05],
      ].map(([x, y, z, sx, sy, r], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, r]} scale={[sx, sy, 1]}>
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color={i === 1 ? '#B7E9E5' : '#C6F0EC'} transparent opacity={0.28} />
        </mesh>
      ))}
      <Cloud position={[-5.8, 2.85, -8.8]} scale={0.78} />
      <Cloud position={[4.9, 2.62, -8.2]} scale={0.58} />
      <Bird position={[-2.2, 3.1, -7.8]} rotationY={0.2} />
    </group>
  );
}

function RoadSurface() {
  const stripes: Vec3[] = [
    [-1.05, 0.041, 2.6],
    [-0.72, 0.042, 0.72],
    [-0.32, 0.043, -1.22],
    [0.16, 0.044, -3.18],
    [0.62, 0.045, -5.14],
  ];

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0.02]} position={[0, 0, -2.52]} receiveShadow>
        <planeGeometry args={[4.95, 16.4]} />
        <meshToonMaterial color="#759392" />
        <Outlines thickness={0.02} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.04]} position={[-1.92, 0.032, -2.6]}>
        <planeGeometry args={[0.09, 15.6]} />
        <meshBasicMaterial color="#EEF2E7" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.05]} position={[2.02, 0.033, -2.4]}>
        <planeGeometry args={[0.08, 14.8]} />
        <meshBasicMaterial color="#EEF2E7" />
      </mesh>
      {stripes.map((position, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, -0.2 + i * 0.035]}
          position={position}
          scale={[0.14, 1.0, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#F4F5E9" />
        </mesh>
      ))}
      <Drain position={[1.25, 0.055, -2.75]} />
      <Drain position={[-0.18, 0.055, -5.8]} />
    </group>
  );
}

function Sidewalks() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0.04]} position={[-3.24, 0.08, -2.28]} receiveShadow>
        <planeGeometry args={[1.8, 15.8]} />
        <meshToonMaterial color="#AEB8AA" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.04]} position={[3.32, 0.08, -2.24]} receiveShadow>
        <planeGeometry args={[1.92, 15.5]} />
        <meshToonMaterial color="#A8B2A6" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.06]} position={[3.12, 0.1, 2.85]}>
        <planeGeometry args={[1.7, 0.22]} />
        <meshBasicMaterial color="#F3F4E8" />
      </mesh>
    </group>
  );
}

function StreetBuildings() {
  return (
    <group>
      <BuildingBlock
        position={[-4.9, 1.55, 0.82]}
        rotationY={0.1}
        args={[2.8, 3.1, 2.0]}
        color="#9E9B8D"
      />
      <BuildingBlock
        position={[-4.32, 2.12, -2.38]}
        rotationY={0.12}
        args={[2.2, 4.2, 2.1]}
        color="#BFC7B8"
      />
      <BuildingBlock
        position={[-3.85, 1.62, -5.46]}
        rotationY={0.18}
        args={[2.0, 3.2, 1.9]}
        color="#7EA279"
      />
      <BuildingBlock
        position={[4.55, 1.6, 1.5]}
        rotationY={-0.18}
        args={[2.25, 3.2, 2.1]}
        color="#B0B1A5"
      />
      <BuildingBlock
        position={[4.0, 1.35, -2.18]}
        rotationY={-0.22}
        args={[2.4, 2.7, 1.95]}
        color="#9DA59C"
      />
      <BuildingBlock
        position={[3.72, 1.25, -5.28]}
        rotationY={-0.28}
        args={[2.2, 2.5, 1.7]}
        color="#A6AEA7"
      />
      <ShopSign position={[4.05, 1.42, 0.72]} rotationY={-0.22} />
      <VendingMachine position={[-3.16, 0.78, 0.22]} rotationY={0.08} />
      <MiniTruck position={[-5.1, 0.52, 1.86]} rotationY={0.12} />
    </group>
  );
}

function StreetProps() {
  return (
    <group>
      <TrashCan position={[-2.64, 0.36, 0.6]} />
      <TrafficCone position={[-2.35, 0.22, 0.12]} />
      <TrafficCone position={[-2.12, 0.2, -0.22]} />
      <RoadMirror position={[-2.62, 1.86, -0.52]} rotationY={0.06} />
      <RoundStreetSign position={[1.62, 1.26, -4.1]} />
      <RoundStreetSign position={[-1.9, 1.1, -6.1]} />
      <PaintSplash position={[1.2, 0.07, 2.24]} color="#9BD0D0" scale={0.42} />
      <PaintSplash position={[-1.4, 0.07, -0.85]} color="#D8E4DD" scale={0.32} />
    </group>
  );
}

function BuildingBlock({
  position,
  rotationY,
  args,
  color,
}: {
  position: Vec3;
  rotationY: number;
  args: [number, number, number];
  color: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={args} color={color} position={[0, 0, 0]} />
      <OutlinedBox
        args={[args[0] * 0.58, 0.18, 0.08]}
        color="#4A575A"
        position={[0.18, -args[1] * 0.16, args[2] * 0.52]}
      />
      <OutlinedBox
        args={[args[0] * 0.4, 0.52, 0.07]}
        color="#C7DBD9"
        position={[-args[0] * 0.18, args[1] * 0.08, args[2] * 0.53]}
      />
      <OutlinedBox
        args={[0.24, 0.58, 0.08]}
        color="#E8ECE6"
        position={[args[0] * 0.27, args[1] * 0.18, args[2] * 0.54]}
      />
    </group>
  );
}

function VendingMachine({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[0.86, 1.55, 0.28]} color="#64C9B8" position={[0, 0, 0]} />
      <OutlinedBox args={[0.66, 1.08, 0.04]} color="#EAF5EE" position={[0, 0.16, 0.17]} />
      {Array.from({ length: 18 }, (_, i) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        const x = -0.28 + col * 0.112;
        const y = 0.56 - row * 0.28;
        return (
          <mesh key={i} position={[x, y, 0.205]} scale={[0.035, 0.11, 0.018]}>
            <capsuleGeometry args={[1, 0.2, 6, 8]} />
            <meshToonMaterial color={['#55A8D8', '#F1F4EA', '#2E6C7A'][i % 3]!} />
            <Outlines thickness={0.006} color={INK} />
          </mesh>
        );
      })}
      <OutlinedBox args={[0.44, 0.14, 0.04]} color="#28444C" position={[0, -0.62, 0.18]} />
    </group>
  );
}

function MiniTruck({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.28, 0.82, 1.5]} color="#DDD8C9" position={[0, 0.2, 0]} />
      <OutlinedBox args={[0.82, 0.56, 0.42]} color="#EEECE2" position={[0, 0.62, 0.42]} />
      <OutlinedBox args={[0.3, 0.25, 0.05]} color="#6CAFB8" position={[-0.28, 0.72, 0.65]} />
      <OutlinedBox args={[0.3, 0.25, 0.05]} color="#6CAFB8" position={[0.28, 0.72, 0.65]} />
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, -0.24, 0.54]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 0.18, 0.08]}>
          <cylinderGeometry args={[1, 1, 1, 18]} />
          <meshToonMaterial color="#253138" />
          <Outlines thickness={0.025} color={INK} />
        </mesh>
      ))}
    </group>
  );
}

function ShopSign({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.0, 1.22, 0.1]} color="#EAF2EC" position={[0, 0, 0]} />
      <OutlinedBox args={[0.72, 0.78, 0.05]} color="#58B6C7" position={[0, 0.03, 0.08]} />
      <mesh position={[0.02, 0.04, 0.12]} scale={[0.32, 0.32, 0.02]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#F4F1E8" />
      </mesh>
    </group>
  );
}

function TrashCan({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.2, 0.56, 16]} />
        <meshToonMaterial color="#3B9AAA" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh castShadow position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.2, 0.18, 0.08, 16]} />
        <meshToonMaterial color="#2F7D8A" />
        <Outlines thickness={0.014} color={INK} />
      </mesh>
    </group>
  );
}

function TrafficCone({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.22, 0]}>
        <coneGeometry args={[0.14, 0.44, 18]} />
        <meshToonMaterial color="#C86A35" />
        <Outlines thickness={0.014} color={INK} />
      </mesh>
      <OutlinedBox args={[0.34, 0.04, 0.34]} color="#EEF0E6" position={[0, 0.02, 0]} />
    </group>
  );
}

function RoadMirror({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, -0.76, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 1.52, 10]} />
        <meshToonMaterial color="#A24F2C" />
      </mesh>
      <mesh position={[0, 0.08, 0]} scale={[0.38, 0.38, 0.04]}>
        <torusGeometry args={[1, 0.08, 10, 28]} />
        <meshToonMaterial color="#B45B2D" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh position={[0, 0.08, 0.01]} scale={[0.34, 0.34, 0.01]}>
        <circleGeometry args={[1, 28]} />
        <meshToonMaterial color="#CADCD8" />
      </mesh>
    </group>
  );
}

function RoundStreetSign({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.55, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.024, 1.1, 8]} />
        <meshToonMaterial color="#38474A" />
      </mesh>
      <mesh position={[0, 0.08, 0]} scale={[0.2, 0.2, 0.02]}>
        <circleGeometry args={[1, 22]} />
        <meshToonMaterial color="#E7F0EA" />
        <Outlines thickness={0.014} color={INK} />
      </mesh>
    </group>
  );
}

function Drain({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, 0.2, 0]}>
      <OutlinedBox args={[0.42, 0.03, 0.28]} color="#4B5C5C" position={[0, 0, 0]} />
      {[-0.12, 0, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.028, 0.22]} />
          <meshBasicMaterial color="#9FB0AD" />
        </mesh>
      ))}
    </group>
  );
}

function OldIslandPlaza({ plazaRadius }: Props) {
  return (
    <group>
      <Water />
      <FloatingClouds />
      <IslandBase radius={plazaRadius + 1.08} />
      <CliffDecorations radius={plazaRadius + 1.02} />
      <CentralPlaza radius={plazaRadius} />

      <Walkway position={[0, 0.025, 2.9]} size={[2.1, 4.4]} color="#EEDFAE" />
      <Walkway position={[0, 0.028, -2.7]} size={[2.25, 3.4]} color="#D8E7E4" />
      <Walkway position={[-2.85, 0.03, 0]} size={[3.3, 1.75]} color="#E7D7A9" />
      <Walkway position={[2.86, 0.031, 0]} size={[3.4, 1.75]} color="#D8E7E4" />

      <PaintSplash position={[-1.5, 0.055, 0.9]} color="#E55A4C" scale={0.92} />
      <PaintSplash position={[1.45, 0.058, -0.95]} color="#5DA9E9" scale={0.78} />
      <PaintSplash position={[0.7, 0.061, 1.75]} color="#FFD23F" scale={0.48} />
      <PaintSplash position={[-2.25, 0.056, -1.4]} color="#76C25B" scale={0.58} />

      <ShopBlock
        position={[-3.8, 0, -3.15]}
        rotationY={0.24}
        body="#F7F1DF"
        accent="#5DA9E9"
      />
      <ShopBlock
        position={[3.35, 0, -3.4]}
        rotationY={-0.3}
        body="#E8F4F0"
        accent="#E55A4C"
      />
      <Tower position={[-4.65, 0, 0.9]} rotationY={-0.15} />
      <Kiosk position={[4.28, 0, 1.45]} rotationY={0.38} />
      <Gate position={[0, 0, 5.1]} />

      <Bench position={[-2.8, 0, 2.65]} rotationY={0.42} />
      <Bench position={[2.55, 0, 2.92]} rotationY={-0.5} />

      <Lamp position={[-4.55, 0, -1.75]} />
      <Lamp position={[4.45, 0, -1.5]} />
      <Lamp position={[-3.75, 0, 3.35]} />
      <Lamp position={[3.85, 0, 3.18]} />

      <Tree position={[-5.25, 0, -3.25]} scale={0.88} />
      <Tree position={[5.25, 0, -2.65]} scale={0.76} />
      <Tree position={[-5.18, 0, 2.7]} scale={0.72} />
      <Tree position={[5.28, 0, 2.55]} scale={0.82} />

      <RailArc radius={plazaRadius + 0.55} />
    </group>
  );
}

function Water() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.28, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshToonMaterial color="#4EB5B1" />
      </mesh>
      {[
        [-8.5, -0.265, -4.4, 1.4, 0.18, 0.2],
        [7.8, -0.264, 2.8, 1.8, 0.22, -0.12],
        [-5.7, -0.263, 5.9, 1.2, 0.16, -0.28],
        [5.4, -0.262, -6.2, 1.0, 0.14, 0.34],
        [-1.8, -0.261, -7.2, 2.2, 0.18, 0.04],
        [2.2, -0.26, 6.8, 1.7, 0.16, -0.28],
      ].map(([x, y, z, sx, sz, r], i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, r]}
          position={[x, y, z]}
          scale={[sx, sz, 1]}
        >
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color="#B8F0E8" transparent opacity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function IslandBase({ radius }: { radius: number }) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.9, 0]} scale={[1, 0.24, 0.86]}>
        <sphereGeometry args={[radius + 0.32, 72, 24]} />
        <meshToonMaterial color="#C6AA73" />
        <Outlines thickness={0.035} color={INK} />
      </mesh>
      <mesh receiveShadow position={[0, -0.16, 0]}>
        <cylinderGeometry args={[radius * 0.96, radius + 0.16, 0.22, 72]} />
        <meshToonMaterial color="#B9965D" />
        <Outlines thickness={0.026} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[radius, 72]} />
        <meshToonMaterial color="#76B871" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]} receiveShadow>
        <ringGeometry args={[radius - 0.42, radius - 0.18, 72]} />
        <meshToonMaterial color="#EEDFAE" />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2 + 0.14;
        const x = Math.cos(angle) * (radius - 0.12);
        const z = Math.sin(angle) * (radius - 0.12);
        return (
          <mesh
            key={i}
            castShadow
            position={[x, -0.04, z]}
            rotation={[0, -angle, 0]}
            scale={[0.26 + (i % 3) * 0.06, 0.18, 0.2]}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color={i % 2 === 0 ? '#F7F0DA' : '#D7C083'} />
            <Outlines thickness={0.018} color={INK} />
          </mesh>
        );
      })}
    </group>
  );
}

function CentralPlaza({ radius }: { radius: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <circleGeometry args={[radius - 0.72, 72]} />
        <meshToonMaterial color="#C9D2C9" />
        <Outlines thickness={0.025} color={INK} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.044, 0]}>
        <planeGeometry args={[5.9, 5.9]} />
        <meshToonMaterial color="#DDE4D6" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.052, 0]}>
        <ringGeometry args={[0.88, 1.05, 36]} />
        <meshToonMaterial color="#FFF5D6" />
      </mesh>
    </group>
  );
}

function Walkway({
  position,
  size,
  color,
}: {
  position: Vec3;
  size: [number, number];
  color: string;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <planeGeometry args={size} />
      <meshToonMaterial color={color} />
    </mesh>
  );
}

function PaintSplash({
  position,
  color,
  scale,
}: {
  position: Vec3;
  color: string;
  scale: number;
}) {
  return (
    <group position={position} scale={scale}>
      {[
        [0, 0, 0, 0.8, 0.34, 0.15],
        [0.48, 0.003, 0.2, 0.32, 0.22, -0.2],
        [-0.42, 0.004, -0.16, 0.28, 0.18, 0.42],
        [0.1, 0.005, -0.36, 0.38, 0.16, -0.1],
      ].map(([x, y, z, sx, sz, r], i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, r]}
          position={[x, y, z]}
          scale={[sx, sz, 1]}
        >
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.74} />
        </mesh>
      ))}
    </group>
  );
}

function ShopBlock({
  position,
  rotationY,
  body,
  accent,
}: {
  position: Vec3;
  rotationY: number;
  body: string;
  accent: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.75, 1.08, 1.18]} color={body} position={[0, 0.56, 0]} />
      <OutlinedBox args={[1.95, 0.26, 1.34]} color={accent} position={[0, 1.23, 0]} />
      <OutlinedBox args={[0.5, 0.54, 0.08]} color="#382F28" position={[-0.38, 0.32, 0.63]} />
      <OutlinedBox args={[0.54, 0.3, 0.08]} color="#FFF8DD" position={[0.45, 0.63, 0.64]} />
      <Awning color={accent} />
    </group>
  );
}

function Awning({ color }: { color: string }) {
  return (
    <group position={[0, 0.95, 0.74]}>
      {[-0.54, -0.18, 0.18, 0.54].map((x, i) => (
        <OutlinedBox
          key={x}
          args={[0.32, 0.16, 0.2]}
          color={i % 2 === 0 ? color : '#FFF8DD'}
          position={[x, 0, 0]}
        />
      ))}
    </group>
  );
}

function Tower({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.0, 1.95, 1.0]} color="#F6E6C6" position={[0, 1.0, 0]} />
      <OutlinedBox args={[1.22, 0.34, 1.22]} color="#27313A" position={[0, 2.18, 0]} />
      <OutlinedBox args={[0.7, 0.35, 0.08]} color="#FFD23F" position={[0, 1.42, 0.54]} />
      <OutlinedBox args={[0.35, 0.56, 0.08]} color="#5DA9E9" position={[-0.2, 0.62, 0.55]} />
      <OutlinedBox args={[0.35, 0.56, 0.08]} color="#E55A4C" position={[0.24, 0.62, 0.55]} />
    </group>
  );
}

function Kiosk({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.1, 0.78, 0.86]} color="#FFF4C9" position={[0, 0.42, 0]} />
      <mesh position={[0, 0.95, 0]} castShadow>
        <coneGeometry args={[0.82, 0.48, 4]} />
        <meshToonMaterial color="#76C25B" />
        <Outlines thickness={0.035} color={INK} />
      </mesh>
      <OutlinedBox args={[0.64, 0.28, 0.08]} color="#E55A4C" position={[0, 0.48, 0.48]} />
    </group>
  );
}

function Gate({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <OutlinedBox args={[1.7, 0.22, 0.42]} color="#27313A" position={[0, 0.14, 0]} />
      <OutlinedBox args={[0.18, 1.18, 0.18]} color="#27313A" position={[-0.72, 0.62, 0]} />
      <OutlinedBox args={[0.18, 1.18, 0.18]} color="#27313A" position={[0.72, 0.62, 0]} />
      <OutlinedBox args={[1.65, 0.22, 0.22]} color="#FFD23F" position={[0, 1.22, 0]} />
      {[-0.42, 0, 0.42].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.06, -0.42]}>
          <circleGeometry args={[0.18, 18]} />
          <meshBasicMaterial color="#FFF8DD" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Bench({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <OutlinedBox args={[1.05, 0.08, 0.32]} color="#9C6B45" position={[0, 0.34, 0]} />
      <OutlinedBox args={[1.05, 0.32, 0.08]} color="#9C6B45" position={[0, 0.56, -0.16]} />
      <OutlinedBox args={[0.08, 0.3, 0.24]} color="#5B4A3B" position={[-0.42, 0.18, 0.04]} />
      <OutlinedBox args={[0.08, 0.3, 0.24]} color="#5B4A3B" position={[0.42, 0.18, 0.04]} />
    </group>
  );
}

function Lamp({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.06, 1.64, 10]} />
        <meshToonMaterial color="#27313A" />
      </mesh>
      <mesh position={[0, 1.72, 0]} castShadow>
        <sphereGeometry args={[0.16, 16, 10]} />
        <meshToonMaterial color="#FFF2A4" />
        <Outlines thickness={0.02} color={INK} />
      </mesh>
      <mesh position={[0, 1.94, 0]} castShadow>
        <coneGeometry args={[0.24, 0.2, 16]} />
        <meshToonMaterial color="#27313A" />
      </mesh>
    </group>
  );
}

function Tree({ position, scale }: { position: Vec3; scale: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1.2, 10]} />
        <meshToonMaterial color="#715038" />
      </mesh>
      {[
        [0, 1.34, 0, 0.64],
        [-0.38, 1.1, 0.08, 0.45],
        [0.42, 1.08, -0.05, 0.42],
        [0.05, 1.68, 0.02, 0.38],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <sphereGeometry args={[r, 16, 12]} />
          <meshToonMaterial color={i % 2 === 0 ? '#559E63' : '#76C25B'} />
          <Outlines thickness={0.025} color={INK} />
        </mesh>
      ))}
    </group>
  );
}

function RailArc({ radius }: { radius: number }) {
  const posts = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2;
    if (angle > 0.48 && angle < 2.66) return null;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return { x, z, angle };
  }).filter(Boolean) as Array<{ x: number; z: number; angle: number }>;

  return (
    <group>
      {posts.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, -p.angle, 0]}>
          <OutlinedBox args={[0.08, 0.58, 0.08]} color="#FFF8DD" position={[0, 0.32, 0]} />
          <OutlinedBox args={[0.42, 0.08, 0.08]} color="#FFF8DD" position={[0, 0.58, 0]} />
        </group>
      ))}
    </group>
  );
}

function FloatingClouds() {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.035;
  });

  return (
    <group ref={groupRef}>
      <Cloud position={[-6.9, 1.1, -5.8]} scale={0.58} />
      <Cloud position={[6.6, 0.92, -4.6]} scale={0.44} />
      <Cloud position={[-5.5, 0.78, 5.4]} scale={0.4} />
      <Cloud position={[5.8, 1.04, 5.2]} scale={0.52} />
      <Bird position={[-4.3, 2.35, -6.1]} rotationY={0.4} />
      <Bird position={[5.1, 2.0, -5.3]} rotationY={-0.5} />
      <Bird position={[0.9, 2.7, 6.5]} rotationY={-0.1} />
    </group>
  );
}

function Cloud({ position, scale }: { position: Vec3; scale: number }) {
  return (
    <group position={position} scale={scale}>
      {[
        [-0.45, 0, 0, 0.36],
        [-0.08, 0.1, 0.02, 0.46],
        [0.38, 0.02, 0.03, 0.34],
        [0.08, -0.06, 0, 0.32],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 16, 10]} />
          <meshBasicMaterial color="#FFF8EE" transparent opacity={0.88} />
        </mesh>
      ))}
    </group>
  );
}

function Bird({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-0.08, 0, 0]} rotation={[0, 0, 0.55]} scale={[0.16, 0.024, 0.018]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#2C3B3E" />
      </mesh>
      <mesh position={[0.08, 0, 0]} rotation={[0, 0, -0.55]} scale={[0.16, 0.024, 0.018]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#2C3B3E" />
      </mesh>
    </group>
  );
}

function CliffDecorations({ radius }: { radius: number }) {
  return (
    <group>
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + 0.08;
        const r = radius + (i % 2) * 0.2;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r * 0.94;
        const color = i % 3 === 0 ? '#D6C08E' : i % 3 === 1 ? '#F8F2DF' : '#8ABC69';
        return (
          <mesh
            key={i}
            castShadow
            position={[x, -0.18 - (i % 3) * 0.04, z]}
            rotation={[0.2, -angle, 0.1]}
            scale={[0.18 + (i % 4) * 0.05, 0.16 + (i % 2) * 0.05, 0.14]}
          >
            <dodecahedronGeometry args={[1, 0]} />
            <meshToonMaterial color={color} />
            <Outlines thickness={0.016} color={INK} />
          </mesh>
        );
      })}
      <Waterfall position={[5.65, -0.08, -0.25]} rotationY={-1.48} />
      <Waterfall position={[-4.2, -0.08, 4.08]} rotationY={2.5} />
    </group>
  );
}

function Waterfall({ position, rotationY }: { position: Vec3; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, -0.1, 0]} rotation={[0.1, 0, 0]} scale={[0.22, 0.78, 0.02]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#B9F0EC" transparent opacity={0.58} />
      </mesh>
      <mesh position={[0, -0.58, 0.04]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.34, 0.12, 1]}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial color="#D7FFF8" transparent opacity={0.36} />
      </mesh>
    </group>
  );
}

function OutlinedBox({
  args,
  color,
  position,
  rotation,
}: {
  args: [number, number, number];
  color: string;
  position: Vec3;
  rotation?: Vec3;
}) {
  return (
    <RoundedBox
      args={args}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
      radius={Math.min(args[0], args[1], args[2]) * 0.08}
      smoothness={4}
      bevelSegments={2}
    >
      <meshToonMaterial color={color} />
      <Outlines thickness={0.038} color={INK} />
    </RoundedBox>
  );
}
