'use client';

/**
 * A resident in the plaza.
 * Residents are intentionally static to keep the plaza readable and lightweight.
 */

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Object3D,
} from 'three';
import { StylizedPlazaAvatar } from './StylizedPlazaAvatar';

type Vec3 = [number, number, number];

type Props = {
  userId: string;
  avatarCode: string;
  initialX: number;
  initialZ?: number;
  showMarker?: boolean;
  markerName?: string;
  markerMessage?: string;
  onTap?: () => void;
};

export type PlazaResidentPlacement = Props;

export function PlazaResident3D({
  userId,
  avatarCode,
  initialX,
  initialZ = 0,
  showMarker = false,
  markerName = '旅人',
  markerMessage = 'こんにちは！',
  onTap,
}: Props) {
  const baseLookAngle =
    Math.atan2(-initialX, -initialZ || -0.001) + ((hashString(userId) % 17) - 8) * 0.025;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onTap?.();
  };

  return (
    <group
      position={[initialX, 0, initialZ]}
      rotation={[0, baseLookAngle, 0]}
      onClick={handleClick}
      scale={0.78}
    >
      <StylizedPlazaAvatar
        avatarCode={avatarCode}
        userId={userId}
        mode="idle"
        animated={false}
        highDetailHair
        scale={0.78}
      />
      {showMarker && (
        <Html
          center
          distanceFactor={8.5}
          position={[0, 2.82, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <ResidentSpeechBubble name={markerName} message={markerMessage} />
        </Html>
      )}
    </group>
  );
}

export function PlazaResidentCrowd({
  residents,
  joinKey = '',
}: {
  residents: PlazaResidentPlacement[];
  joinKey?: string;
}) {
  const prepared = useMemo(
    () =>
      residents.map((resident) => {
        const seed = hashString(`${resident.userId}:${resident.avatarCode}`);
        return {
          ...resident,
          seed,
          lookAngle:
            Math.atan2(-resident.initialX, -(resident.initialZ ?? 0) || -0.001) +
            ((hashString(resident.userId) % 17) - 8) * 0.025,
          z: resident.initialZ ?? 0,
          colors: {
            skin: pick(seed, ['#F4C9A0', '#D9A77A', '#B07B52', '#F7D4B5']),
            hair: pick(seed >>> 3, ['#402416', '#17191F', '#E6C86D', '#C94743', '#7AC772']),
            top: pick(seed >>> 6, ['#31B8CF', '#F15E4A', '#F4C949', '#70BE63', '#F48EB6']),
            bottom: pick(seed >>> 9, ['#24496E', '#2F2D38', '#5E77A8', '#3A463F']),
            shoe: pick(seed >>> 12, ['#20242A', '#6C493A', '#33494E']),
          },
        };
      }),
    [residents],
  );

  const groupRef = useRef<Group>(null);
  const joinProgressRef = useRef(1);

  useEffect(() => {
    if (joinKey) joinProgressRef.current = 0;
  }, [joinKey]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (joinProgressRef.current < 1) {
      joinProgressRef.current = Math.min(1, joinProgressRef.current + delta / 1.35);
    }

    const progress = joinProgressRef.current;
    const eased = 1 - Math.pow(1 - progress, 3);
    group.position.z = (1 - eased) * 11;
    group.position.y = Math.sin(progress * Math.PI * 4) * (1 - progress) * 0.12;
    const scale = 0.9 + eased * 0.1;
    group.scale.setScalar(scale);
  });

  if (prepared.length === 0) return null;

  return (
    <group ref={groupRef}>
      <ResidentInstancedAvatars residents={prepared} />
      {prepared.map((resident) => (
        <ResidentHitArea
          key={resident.userId}
          resident={resident}
        />
      ))}
    </group>
  );
}

type PreparedResident = PlazaResidentPlacement & {
  seed: number;
  lookAngle: number;
  z: number;
  colors: {
    skin: string;
    hair: string;
    top: string;
    bottom: string;
    shoe: string;
  };
};

function ResidentInstancedAvatars({
  residents,
}: {
  residents: PreparedResident[];
}) {
  const legRef = useRef<InstancedMesh>(null);
  const shoeRef = useRef<InstancedMesh>(null);
  const torsoRef = useRef<InstancedMesh>(null);
  const armRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const hairCapRef = useRef<InstancedMesh>(null);
  const hairExtraRef = useRef<InstancedMesh>(null);
  const eyeRef = useRef<InstancedMesh>(null);
  const mouthRef = useRef<InstancedMesh>(null);
  const root = useMemo(() => new Object3D(), []);
  const part = useMemo(() => new Object3D(), []);
  const matrix = useMemo(() => new Matrix4(), []);
  const color = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const refs = [
      legRef,
      shoeRef,
      torsoRef,
      armRef,
      headRef,
      hairCapRef,
      hairExtraRef,
      eyeRef,
      mouthRef,
    ];

    for (const ref of refs) {
      if (ref.current) {
        ref.current.count = 0;
      }
    }

    let legIndex = 0;
    let shoeIndex = 0;
    let torsoIndex = 0;
    let armIndex = 0;
    let headIndex = 0;
    let hairCapIndex = 0;
    let hairExtraIndex = 0;
    let eyeIndex = 0;
    let mouthIndex = 0;

    residents.forEach((resident) => {
      const scale = 0.78;
      const heightScale = 0.98 + (resident.seed % 5) * 0.012;
      root.position.set(resident.initialX, 0.5, resident.z);
      root.rotation.set(0, resident.lookAngle, 0);
      root.scale.set(0.96 * scale, heightScale * scale, 0.96 * scale);
      root.updateMatrix();

      legIndex = setBodyPart(
        legRef.current,
        legIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.bottom,
        [
          { position: [-0.12, 0.28, 0.02], scale: [0.11, 0.34, 0.11] },
          { position: [0.12, 0.28, 0.02], scale: [0.11, 0.34, 0.11] },
        ],
      );
      shoeIndex = setBodyPart(
        shoeRef.current,
        shoeIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.shoe,
        [
          { position: [-0.12, -0.08, 0.1], scale: [0.13, 0.06, 0.2] },
          { position: [0.12, -0.08, 0.1], scale: [0.13, 0.06, 0.2] },
        ],
      );
      torsoIndex = setBodyPart(
        torsoRef.current,
        torsoIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.top,
        [{ position: [0, 0.78, 0], scale: [0.38, 0.48, 0.32] }],
      );
      armIndex = setBodyPart(
        armRef.current,
        armIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.top,
        [
          { position: [-0.36, 0.78, 0.02], rotation: [0, 0, 0.18], scale: [0.08, 0.34, 0.08] },
          { position: [0.36, 0.78, 0.02], rotation: [0, 0, -0.18], scale: [0.08, 0.34, 0.08] },
        ],
      );
      headIndex = setBodyPart(
        headRef.current,
        headIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.skin,
        [{ position: [0, 1.36, 0.02], scale: [0.39, 0.41, 0.36] }],
      );
      hairCapIndex = setBodyPart(
        hairCapRef.current,
        hairCapIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.hair,
        [{ position: [0, 1.54, -0.03], scale: [0.42, 0.23, 0.36] }],
      );

      const hairShape = resident.seed % 4;
      const hairExtra =
        hairShape === 1
          ? [{ position: [0, 1.78, -0.02] as Vec3, scale: [0.14, 0.14, 0.13] as Vec3 }]
          : hairShape === 2
            ? [{
                position: [0.18, 1.42, 0.12] as Vec3,
                rotation: [0.2, 0, -0.72] as Vec3,
                scale: [0.08, 0.28, 0.07] as Vec3,
              }]
            : hairShape === 3
              ? [{ position: [0, 1.16, -0.16] as Vec3, scale: [0.31, 0.32, 0.18] as Vec3 }]
              : [];
      hairExtraIndex = setBodyPart(
        hairExtraRef.current,
        hairExtraIndex,
        root.matrix,
        part,
        matrix,
        color,
        resident.colors.hair,
        hairExtra,
      );

      eyeIndex = setBodyPart(
        eyeRef.current,
        eyeIndex,
        root.matrix,
        part,
        matrix,
        color,
        '#15151B',
        [
          { position: [-0.12, 1.36, 0.34], scale: [0.035, 0.035, 0.01] },
          { position: [0.12, 1.36, 0.34], scale: [0.035, 0.035, 0.01] },
        ],
      );
      mouthIndex = setBodyPart(
        mouthRef.current,
        mouthIndex,
        root.matrix,
        part,
        matrix,
        color,
        '#EFA3AA',
        [{ position: [0, 1.24, 0.34], scale: [0.1, 0.022, 0.01] }],
      );
    });

    finalizeInstances(legRef.current, legIndex);
    finalizeInstances(shoeRef.current, shoeIndex);
    finalizeInstances(torsoRef.current, torsoIndex);
    finalizeInstances(armRef.current, armIndex);
    finalizeInstances(headRef.current, headIndex);
    finalizeInstances(hairCapRef.current, hairCapIndex);
    finalizeInstances(hairExtraRef.current, hairExtraIndex);
    finalizeInstances(eyeRef.current, eyeIndex);
    finalizeInstances(mouthRef.current, mouthIndex);
  }, [color, matrix, part, residents, root]);

  return (
    <group>
      <instancedMesh ref={legRef} args={[undefined, undefined, residents.length * 2]} frustumCulled castShadow={false} receiveShadow={false}>
        <capsuleGeometry args={[1, 0.9, 3, 6]} />
        <meshBasicMaterial color="#24496E" />
      </instancedMesh>
      <instancedMesh ref={shoeRef} args={[undefined, undefined, residents.length * 2]} frustumCulled castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#20242A" />
      </instancedMesh>
      <instancedMesh ref={torsoRef} args={[undefined, undefined, residents.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <capsuleGeometry args={[1, 0.8, 4, 8]} />
        <meshBasicMaterial color="#31B8CF" />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[undefined, undefined, residents.length * 2]} frustumCulled castShadow={false} receiveShadow={false}>
        <capsuleGeometry args={[1, 0.8, 3, 6]} />
        <meshBasicMaterial color="#31B8CF" />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, residents.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#F4C9A0" />
      </instancedMesh>
      <instancedMesh ref={hairCapRef} args={[undefined, undefined, residents.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#402416" />
      </instancedMesh>
      <instancedMesh ref={hairExtraRef} args={[undefined, undefined, residents.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[1, 10, 7]} />
        <meshBasicMaterial color="#402416" />
      </instancedMesh>
      <instancedMesh ref={eyeRef} args={[undefined, undefined, residents.length * 2]} frustumCulled castShadow={false} receiveShadow={false}>
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial color="#15151B" />
      </instancedMesh>
      <instancedMesh ref={mouthRef} args={[undefined, undefined, residents.length]} frustumCulled castShadow={false} receiveShadow={false}>
        <circleGeometry args={[1, 10]} />
        <meshBasicMaterial color="#EFA3AA" transparent opacity={0.78} />
      </instancedMesh>
    </group>
  );
}

function ResidentHitArea({ resident }: { resident: PreparedResident }) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    resident.onTap?.();
  };

  return (
    <group position={[resident.initialX, 0, resident.z]} rotation={[0, resident.lookAngle, 0]}>
      <mesh
        position={[0, 1.25, 0]}
        onClick={handleClick}
        castShadow={false}
        receiveShadow={false}
      >
        <cylinderGeometry args={[0.56, 0.56, 2.3, 8]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      {resident.showMarker && (
        <Html
          center
          distanceFactor={8.5}
          position={[0, 2.82, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <ResidentSpeechBubble
            name={resident.markerName ?? '旅人'}
            message={resident.markerMessage ?? 'こんにちは！'}
          />
        </Html>
      )}
    </group>
  );
}

function ResidentSpeechBubble({ name, message }: { name: string; message: string }) {
  return (
    <div className="resident-speech-bubble" role="status">
      <strong>{[...name].slice(0, 16).join('')}</strong>
      <span>{[...message].slice(0, 30).join('')}</span>
    </div>
  );
}

type BodyPartPlacement = {
  position: Vec3;
  rotation?: Vec3;
  scale: Vec3;
};

function setBodyPart(
  mesh: InstancedMesh | null,
  index: number,
  rootMatrix: Matrix4,
  part: Object3D,
  matrix: Matrix4,
  color: Color,
  hex: string,
  placements: BodyPartPlacement[],
) {
  if (!mesh) return index + placements.length;
  color.set(hex);
  for (const placement of placements) {
    part.position.set(placement.position[0], placement.position[1], placement.position[2]);
    part.rotation.set(
      placement.rotation?.[0] ?? 0,
      placement.rotation?.[1] ?? 0,
      placement.rotation?.[2] ?? 0,
    );
    part.scale.set(placement.scale[0], placement.scale[1], placement.scale[2]);
    part.updateMatrix();
    matrix.multiplyMatrices(rootMatrix, part.matrix);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color);
    index += 1;
  }
  return index;
}

function finalizeInstances(mesh: InstancedMesh | null, count: number) {
  if (!mesh) return;
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function ResidentLiteAvatar({
  avatarCode,
  userId,
}: {
  avatarCode: string;
  userId: string;
}) {
  const seed = hashString(`${userId}:${avatarCode}`);
  const skin = pick(seed, ['#F4C9A0', '#D9A77A', '#B07B52', '#F7D4B5']);
  const hair = pick(seed >>> 3, ['#402416', '#17191F', '#E6C86D', '#C94743', '#7AC772']);
  const top = pick(seed >>> 6, ['#31B8CF', '#F15E4A', '#F4C949', '#70BE63', '#F48EB6']);
  const bottom = pick(seed >>> 9, ['#24496E', '#2F2D38', '#5E77A8', '#3A463F']);
  const shoe = pick(seed >>> 12, ['#20242A', '#6C493A', '#33494E']);
  const hairShape = seed % 4;

  return (
    <group position={[0, 0.5, 0]} scale={[0.96, 0.98 + (seed % 5) * 0.012, 0.96]}>
      <mesh position={[-0.12, 0.28, 0.02]} scale={[0.11, 0.34, 0.11]} castShadow={false}>
        <capsuleGeometry args={[1, 0.9, 3, 6]} />
        <meshToonMaterial color={bottom} />
      </mesh>
      <mesh position={[0.12, 0.28, 0.02]} scale={[0.11, 0.34, 0.11]} castShadow={false}>
        <capsuleGeometry args={[1, 0.9, 3, 6]} />
        <meshToonMaterial color={bottom} />
      </mesh>
      <mesh position={[-0.12, -0.08, 0.1]} scale={[0.13, 0.06, 0.2]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshToonMaterial color={shoe} />
      </mesh>
      <mesh position={[0.12, -0.08, 0.1]} scale={[0.13, 0.06, 0.2]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshToonMaterial color={shoe} />
      </mesh>
      <mesh position={[0, 0.78, 0]} scale={[0.38, 0.48, 0.32]}>
        <capsuleGeometry args={[1, 0.8, 4, 8]} />
        <meshToonMaterial color={top} />
      </mesh>
      <mesh position={[-0.36, 0.78, 0.02]} rotation={[0, 0, 0.18]} scale={[0.08, 0.34, 0.08]}>
        <capsuleGeometry args={[1, 0.8, 3, 6]} />
        <meshToonMaterial color={top} />
      </mesh>
      <mesh position={[0.36, 0.78, 0.02]} rotation={[0, 0, -0.18]} scale={[0.08, 0.34, 0.08]}>
        <capsuleGeometry args={[1, 0.8, 3, 6]} />
        <meshToonMaterial color={top} />
      </mesh>
      <mesh position={[0, 1.36, 0.02]} scale={[0.39, 0.41, 0.36]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshToonMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.54, -0.03]} scale={[0.42, 0.23, 0.36]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshToonMaterial color={hair} />
      </mesh>
      {hairShape === 1 && (
        <mesh position={[0, 1.78, -0.02]} scale={[0.14, 0.14, 0.13]}>
          <sphereGeometry args={[1, 10, 7]} />
          <meshToonMaterial color={hair} />
        </mesh>
      )}
      {hairShape === 2 && (
        <mesh position={[0.18, 1.42, 0.12]} rotation={[0.2, 0, -0.72]} scale={[0.08, 0.28, 0.07]}>
          <capsuleGeometry args={[1, 0.8, 3, 6]} />
          <meshToonMaterial color={hair} />
        </mesh>
      )}
      {hairShape === 3 && (
        <mesh position={[0, 1.16, -0.16]} scale={[0.31, 0.32, 0.18]}>
          <sphereGeometry args={[1, 10, 7]} />
          <meshToonMaterial color={hair} />
        </mesh>
      )}
      <mesh position={[-0.12, 1.36, 0.34]} scale={[0.035, 0.035, 0.01]}>
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial color="#15151B" />
      </mesh>
      <mesh position={[0.12, 1.36, 0.34]} scale={[0.035, 0.035, 0.01]}>
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial color="#15151B" />
      </mesh>
      <mesh position={[0, 1.24, 0.34]} scale={[0.1, 0.022, 0.01]}>
        <circleGeometry args={[1, 10]} />
        <meshBasicMaterial color="#EFA3AA" transparent opacity={0.78} />
      </mesh>
    </group>
  );
}

function pick(seed: number, values: readonly string[]) {
  return values[Math.abs(seed) % values.length]!;
}

function hashString(value: string) {
  let acc = 0;
  for (let i = 0; i < value.length; i += 1) {
    acc = (acc * 31 + value.charCodeAt(i)) >>> 0;
  }
  return acc;
}
