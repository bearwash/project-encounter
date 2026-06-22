'use client';

import { Outlines, useGLTF } from '@react-three/drei';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import {
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshToonMaterial,
  type Material,
  type Object3D,
  Vector3,
} from 'three';
import { makeRng } from '@/lib/avatar/random';
import { parseAvatarCode } from '@/lib/avatar/parse';

type GroupProps = ThreeElements['group'];

type Props = GroupProps & {
  avatarCode: string;
  userId?: string;
  mode?: 'idle' | 'walking' | 'wave' | 'hifive';
  appearanceOverrides?: Partial<PlazaPalette>;
  animated?: boolean;
};

// 手描き風の太い黒インク輪郭（参考アプリ messenger のセル画調に寄せる）。
const INK = '#15151B';
const EYE_WHITE = '#FCFBF7';
const BLUSH = '#EFA3AA';

export type PlazaHairShape = 'bob' | 'topknot' | 'sweep' | 'tentacle' | 'cap';
export type PlazaFaceShape = 'smile' | 'dot' | 'wink' | 'focus';

/** 帽子の種類。'none' は被らない。 */
export type PlazaHatKind = 'none' | 'cap' | 'beanie' | 'straw' | 'ribbon' | 'crown';
/** 小物（フェイス周り）の種類。'none' は付けない。 */
export type PlazaAccessoryKind =
  | 'none'
  | 'glasses'
  | 'round'
  | 'headphones'
  | 'mask'
  | 'blush';

export type PlazaHat = { kind: PlazaHatKind; color: string; accent?: string };
export type PlazaAccessory = { kind: PlazaAccessoryKind; color: string };

const SKINS = ['#F4C9A0', '#D9A77A', '#B07B52', '#F7D4B5', '#EBC09A'];
const HAIRS = ['#402416', '#17191F', '#E6C86D', '#C94743', '#7AC772', '#EFE7C8'];
const ACCENTS = ['#31B8CF', '#F15E4A', '#F4C949', '#70BE63', '#F48EB6', '#1D1B24'];
const BOTTOMS = ['#24496E', '#2F2D38', '#5E77A8', '#3A463F', '#6C493A'];
// 脚を伸ばして頭身を上げた分、接地基準も持ち上げる（チビ寄りから参考アプリ寄りへ）。
const FOOT_TO_GROUND_OFFSET = 0.5;

export type PlazaPalette = {
  skin: string;
  hair: string;
  hairAlt: string;
  top: string;
  bottom: string;
  shoe: string;
  sole: string;
  hairShape: PlazaHairShape;
  face: PlazaFaceShape;
  longTop: boolean;
  detail: 'plain' | 'stripe';
  /** 帽子（任意）。未指定 or kind:'none' で非表示。 */
  hat?: PlazaHat;
  /** 小物（任意）。未指定 or kind:'none' で非表示。 */
  accessory?: PlazaAccessory;
  /** 足元のソフトな称号オーラ色（任意）。 */
  backdrop?: string;
  /** 生成済みの頭部 GLB を使う場合のパス。指定時は手組みの頭/髪/顔を置き換える。 */
  headModelSrc?: string;
  headModelScale?: number;
  headModelPosition?: [number, number, number];
};

function StylizedPlazaAvatarImpl({
  avatarCode,
  userId,
  mode = 'idle',
  appearanceOverrides,
  animated = true,
  ...groupProps
}: Props) {
  const parts = useMemo(() => parseAvatarCode(avatarCode), [avatarCode]);
  const basePalette = useMemo(() => makePlazaPalette(parts, avatarCode), [parts, avatarCode]);
  const isSelfPlayer = userId === 'self-player';
  const palette = useMemo(
    () =>
      ({
        ...(isSelfPlayer
          ? {
              ...basePalette,
              hair: '#2B2430',
              hairAlt: '#2B2430',
              top: '#F0EEE2',
              bottom: '#252A33',
              shoe: '#20242A',
              hairShape: 'bob',
              face: 'focus',
              detail: 'plain',
            }
          : basePalette),
        ...appearanceOverrides,
      }) satisfies PlazaPalette,
    [appearanceOverrides, basePalette, isSelfPlayer],
  );

  const bodyRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const armLRef = useRef<Group>(null);
  const armRRef = useRef<Group>(null);
  const legLRef = useRef<Group>(null);
  const legRRef = useRef<Group>(null);

  const ind = useMemo(() => {
    const rng = makeRng(userId ?? avatarCode);
    return {
      height: 0.94 + rng() * 0.1,
      width: 0.94 + rng() * 0.08,
      phase: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.04,
    };
  }, [userId, avatarCode]);

  useFrame((state) => {
    if (!animated) return;
    const body = bodyRef.current;
    if (!body) return;

    const t = state.clock.elapsedTime + ind.phase;
    const walk = mode === 'walking';
    const wave = mode === 'wave';
    const step = Math.sin(t * 8);
    const breath = Math.sin(t * 2.1);

    body.position.y = FOOT_TO_GROUND_OFFSET + (walk ? Math.abs(step) * 0.055 : breath * 0.025);
    body.rotation.z = (walk ? step * 0.055 : breath * 0.018) + ind.tilt;

    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.8) * (walk ? 0.05 : 0.09);
      headRef.current.rotation.z = Math.sin(t * 0.7) * 0.025;
    }
    if (legLRef.current) legLRef.current.rotation.x = walk ? step * 0.78 : 0;
    if (legRRef.current) legRRef.current.rotation.x = walk ? -step * 0.78 : 0;
    if (armLRef.current) {
      armLRef.current.rotation.x = walk ? -step * 0.58 : breath * 0.05;
      armLRef.current.rotation.z = 0.18;
    }
    if (armRRef.current) {
      armRRef.current.rotation.x = wave ? -1.75 : walk ? step * 0.58 : -breath * 0.05;
      armRRef.current.rotation.z = wave ? Math.sin(t * 7) * 0.32 - 0.35 : -0.18;
    }
  });

  return (
    <group {...groupProps}>
      <group
        ref={bodyRef}
        position={[0, FOOT_TO_GROUND_OFFSET, 0]}
        scale={[ind.width, ind.height, ind.width]}
      >
        <group ref={legLRef} position={[-0.13, 0.58, 0.02]}>
          <Limb color={palette.bottom} position={[0, -0.28, 0]} scale={[0.3, 1.12, 0.3]} />
          <Foot color={palette.shoe} sole={palette.sole} position={[0, -0.82, 0.1]} />
        </group>
        <group ref={legRRef} position={[0.13, 0.58, 0.02]}>
          <Limb color={palette.bottom} position={[0, -0.28, 0]} scale={[0.3, 1.12, 0.3]} />
          <Foot color={palette.shoe} sole={palette.sole} position={[0, -0.82, 0.1]} />
        </group>

        <SoftCapsule
          color={palette.top}
          position={[0, 1.03, 0]}
          scale={[0.5, palette.longTop ? 0.98 : 0.84, 0.42]}
        />
        <mesh position={[0, 1.43, 0.24]} scale={[0.18, 0.11, 0.04]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshToonMaterial color="#FFF6E3" />
        </mesh>
        {isSelfPlayer && <Satchel />}
        {palette.detail === 'stripe' && (
          <mesh position={[0, 1.05, 0.255]} scale={[0.28, 0.06, 0.03]}>
            <sphereGeometry args={[1, 16, 8]} />
            <meshToonMaterial color="#FFF8DD" />
          </mesh>
        )}

        <group ref={armLRef} position={[-0.31, 1.15, 0]}>
          <Limb color={palette.top} position={[0, -0.25, 0]} scale={[0.24, 0.86, 0.24]} />
          <Hand color={palette.skin} position={[-0.03, -0.5, 0]} />
        </group>
        <group ref={armRRef} position={[0.31, 1.15, 0]}>
          <Limb color={palette.top} position={[0, -0.25, 0]} scale={[0.24, 0.86, 0.24]} />
          <Hand color={palette.skin} position={[0.03, -0.5, 0]} />
        </group>

        <group ref={headRef}>
          {palette.headModelSrc ? (
            <AvatarHeadModel
              src={palette.headModelSrc}
              scale={palette.headModelScale ?? 1}
              position={palette.headModelPosition ?? [0, 1.17, 0.09]}
              skinColor={palette.skin}
              hairColor={palette.hair}
            />
          ) : (
            <>
              <mesh castShadow position={[0, 1.66, 0.01]} scale={[0.74, 0.76, 0.68]}>
                <sphereGeometry args={[0.52, 28, 18]} />
                <meshToonMaterial color={palette.skin} />
                <Outlines thickness={0.032} color={INK} />
              </mesh>
              <Hair shape={palette.hairShape} primary={palette.hair} secondary={palette.hairAlt} />
            </>
          )}
          <Face shape={palette.face} />
          {palette.accessory && palette.accessory.kind !== 'none' && (
            <Accessory kind={palette.accessory.kind} color={palette.accessory.color} />
          )}
          {palette.hat && palette.hat.kind !== 'none' && (
            <Hat kind={palette.hat.kind} color={palette.hat.color} accent={palette.hat.accent} />
          )}
        </group>
      </group>
      {palette.backdrop && <Backdrop color={palette.backdrop} />}
    </group>
  );
}

function AvatarHeadModel({
  src,
  scale,
  position,
  skinColor,
  hairColor,
}: {
  src: string;
  scale: number;
  position: [number, number, number];
  skinColor: string;
  hairColor: string;
}) {
  const { scene } = useGLTF(src);
  const cloned = useMemo(() => {
    const root = scene.clone(true) as Group;
    root.traverse((child: Object3D) => {
      const meshLike = child as Mesh & {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
        material?: Material | Material[];
      };
      if (!meshLike.isMesh) return;
      meshLike.castShadow = true;
      meshLike.receiveShadow = true;
      meshLike.geometry = meshLike.geometry.clone();
      trimGeneratedHeadBase(meshLike.geometry);
      applyGeneratedHeadPalette(meshLike.geometry, skinColor, hairColor);
      meshLike.material = new MeshToonMaterial({
        vertexColors: true,
      });
    });
    return root;
  }, [hairColor, scene, skinColor]);

  return (
    <group position={position} scale={scale}>
      <primitive object={cloned} />
    </group>
  );
}

function applyGeneratedHeadPalette(geometry: Mesh['geometry'], skinColor: string, hairColor: string) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const position = geometry.getAttribute('position');
  if (!box || !position) return;

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const minY = box.min.y;
  const faceCenter = new Vector3(
    center.x,
    minY + size.y * 0.43,
    center.z + size.z * 0.02,
  );
  const faceRadius = new Vector3(size.x * 0.29, size.y * 0.27, size.z * 0.28);
  const browLine = minY + size.y * 0.53;
  const neckLine = minY + size.y * 0.16;

  const hair = new Color(hairColor);
  const skin = new Color(skinColor);
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const dx = (x - faceCenter.x) / faceRadius.x;
    const dy = (y - faceCenter.y) / faceRadius.y;
    const dz = (z - faceCenter.z) / faceRadius.z;
    const faceMask = dx * dx + dy * dy + dz * dz <= 1.04;
    const isSkin = y < neckLine || (faceMask && y < browLine);
    const color = isSkin ? skin : hair;

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

function trimGeneratedHeadBase(geometry: BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  source.computeBoundingBox();
  const box = source.boundingBox;
  const position = source.getAttribute('position');
  if (!box || !position) return;

  const cutY = box.min.y + (box.max.y - box.min.y) * 0.24;
  const normal = source.getAttribute('normal');
  const uv = source.getAttribute('uv');

  const nextPosition: number[] = [];
  const nextNormal: number[] = [];
  const nextUv: number[] = [];

  for (let i = 0; i < position.count; i += 3) {
    const y0 = position.getY(i);
    const y1 = position.getY(i + 1);
    const y2 = position.getY(i + 2);
    if (Math.max(y0, y1, y2) < cutY) continue;

    for (let j = 0; j < 3; j += 1) {
      const idx = i + j;
      nextPosition.push(position.getX(idx), position.getY(idx), position.getZ(idx));
      if (normal) nextNormal.push(normal.getX(idx), normal.getY(idx), normal.getZ(idx));
      if (uv) nextUv.push(uv.getX(idx), uv.getY(idx));
    }
  }

  geometry.setIndex(null);
  geometry.setAttribute('position', new Float32BufferAttribute(nextPosition, 3));
  if (normal && nextNormal.length > 0) {
    geometry.setAttribute('normal', new Float32BufferAttribute(nextNormal, 3));
  }
  if (uv && nextUv.length > 0) {
    geometry.setAttribute('uv', new Float32BufferAttribute(nextUv, 2));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** 足元に敷くソフトな称号オーラ（自分の差別化表現）。 */
function Backdrop({ color }: { color: string }) {
  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.62, 0.92, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.001]}>
        <circleGeometry args={[0.66, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

/** 帽子。頭(headRef)グループ内に置き、頭の動きに追従する。 */
function Hat({ kind, color, accent }: { kind: PlazaHatKind; color: string; accent?: string }) {
  if (kind === 'cap') {
    // キャップ: クラウン + 前ツバ
    return (
      <group position={[0, 1.96, 0]}>
        <mesh castShadow scale={[0.5, 0.3, 0.5]}>
          <sphereGeometry args={[1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.02} color={INK} />
        </mesh>
        <mesh castShadow position={[0, -0.02, 0.46]} rotation={[0.18, 0, 0]} scale={[0.42, 0.06, 0.34]}>
          <sphereGeometry args={[1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial color={accent ?? color} />
          <Outlines thickness={0.018} color={INK} />
        </mesh>
        <mesh position={[0, 0.16, 0]} scale={[0.05, 0.05, 0.05]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshToonMaterial color={accent ?? '#FFF8DD'} />
        </mesh>
      </group>
    );
  }
  if (kind === 'beanie') {
    // ニット帽: 丸いクラウン + 折り返し + ボンボン
    return (
      <group position={[0, 1.92, 0]}>
        <mesh castShadow scale={[0.52, 0.46, 0.52]}>
          <sphereGeometry args={[1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.02} color={INK} />
        </mesh>
        <mesh castShadow position={[0, -0.02, 0]} scale={[0.55, 0.12, 0.55]}>
          <torusGeometry args={[0.78, 0.3, 10, 24]} />
          <meshToonMaterial color={accent ?? color} />
        </mesh>
        <mesh castShadow position={[0, 0.46, 0]} scale={[0.1, 0.1, 0.1]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshToonMaterial color={accent ?? '#FFF8DD'} />
          <Outlines thickness={0.016} color={INK} />
        </mesh>
      </group>
    );
  }
  if (kind === 'straw') {
    // 麦わら帽子: 水平の薄い円盤ツバ + 浅いクラウン + リボン
    return (
      <group position={[0, 1.82, 0]}>
        {/* つば（Y軸の薄い円柱＝水平円盤。回転は不要） */}
        <mesh castShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.46, 0.52, 0.05, 28]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.02} color={INK} />
        </mesh>
        {/* クラウン */}
        <mesh castShadow position={[0, 0.1, 0]} scale={[0.33, 0.22, 0.33]}>
          <sphereGeometry args={[1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.018} color={INK} />
        </mesh>
        {/* リボン */}
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.045, 8, 24]} />
          <meshToonMaterial color={accent ?? '#E86C8B'} />
        </mesh>
      </group>
    );
  }
  if (kind === 'ribbon') {
    // 大きめリボン（サイド）
    return (
      <group position={[0.34, 1.78, 0.06]} rotation={[0, 0, -0.2]}>
        {[-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * 0.14, 0, 0]} scale={[0.16, 0.13, 0.07]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshToonMaterial color={color} />
            <Outlines thickness={0.016} color={INK} />
          </mesh>
        ))}
        <mesh castShadow scale={[0.07, 0.09, 0.08]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshToonMaterial color={accent ?? color} />
          <Outlines thickness={0.014} color={INK} />
        </mesh>
      </group>
    );
  }
  // crown: ぎざぎざの王冠
  return (
    <group position={[0, 1.98, 0]}>
      <mesh castShadow position={[0, -0.02, 0]} scale={[0.46, 0.1, 0.46]}>
        <cylinderGeometry args={[1, 1, 1, 18]} />
        <meshToonMaterial color={color} />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            castShadow
            position={[Math.sin(a) * 0.42, 0.1, Math.cos(a) * 0.42]}
            scale={[0.07, 0.16, 0.07]}
          >
            <coneGeometry args={[1, 1, 8]} />
            <meshToonMaterial color={color} />
            <Outlines thickness={0.014} color={INK} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.14, 0.42]} scale={[0.05, 0.05, 0.05]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshToonMaterial color={accent ?? '#F15E4A'} />
      </mesh>
    </group>
  );
}

/** フェイス周りの小物（メガネ・ヘッドフォン等）。顔と同じ前方平面に置く。 */
function Accessory({ kind, color }: { kind: PlazaAccessoryKind; color: string }) {
  if (kind === 'glasses' || kind === 'round') {
    const round = kind === 'round';
    return (
      <group position={[0, 1.62, 0.47]}>
        {[-0.16, 0.16].map((x) => (
          <mesh key={x} position={[x, 0, 0]} scale={[0.11, round ? 0.11 : 0.085, 0.02]}>
            <torusGeometry args={[1, round ? 0.16 : 0.2, 8, round ? 20 : 4]} />
            <meshToonMaterial color={color} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0]} scale={[0.06, 0.012, 0.012]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial color={color} />
        </mesh>
      </group>
    );
  }
  if (kind === 'headphones') {
    return (
      <group position={[0, 1.66, 0]}>
        <mesh castShadow position={[0, 0.28, 0]} rotation={[0, 0, 0]} scale={[0.6, 0.5, 0.5]}>
          <torusGeometry args={[0.72, 0.05, 8, 20, Math.PI]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.014} color={INK} />
        </mesh>
        {[-0.44, 0.44].map((x) => (
          <mesh key={x} castShadow position={[x, 0, 0]} scale={[0.1, 0.15, 0.12]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshToonMaterial color={color} />
            <Outlines thickness={0.014} color={INK} />
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === 'mask') {
    // 口元マスク
    return (
      <mesh position={[0, 1.4, 0.42]} scale={[0.22, 0.16, 0.14]}>
        <sphereGeometry args={[1, 16, 12, 0, Math.PI * 2, Math.PI / 3, Math.PI / 2]} />
        <meshToonMaterial color={color} />
        <Outlines thickness={0.012} color={INK} />
      </mesh>
    );
  }
  // blush: 頬の赤み
  return (
    <group position={[0, 1.5, 0.46]}>
      {[-0.21, 0.21].map((x) => (
        <mesh key={x} position={[x, 0, 0]} scale={[0.07, 0.045, 0.01]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function SoftCapsule({
  color,
  position,
  rotation,
  scale,
}: {
  color: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <capsuleGeometry args={[0.38, 0.52, 8, 18]} />
      <meshToonMaterial color={color} />
      <Outlines thickness={0.034} color={INK} />
    </mesh>
  );
}

function Satchel() {
  return (
    <group position={[-0.25, 1.0, -0.36]} rotation={[0.05, -0.18, -0.24]}>
      <mesh castShadow scale={[0.26, 0.32, 0.08]}>
        <sphereGeometry args={[1, 18, 10]} />
        <meshToonMaterial color="#9E3942" />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh position={[0, 0.02, -0.065]} rotation={[0, 0, -0.2]} scale={[0.12, 0.018, 0.012]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#F3EFE5" />
      </mesh>
      <mesh position={[0.18, 0.42, 0.08]} rotation={[0.55, 0, -0.58]} scale={[0.018, 0.7, 0.012]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#8B3340" />
      </mesh>
    </group>
  );
}

function Limb({
  color,
  position,
  scale,
}: {
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
}) {
  return (
    <mesh castShadow position={position} scale={scale}>
      <capsuleGeometry args={[0.16, 0.32, 8, 14]} />
      <meshToonMaterial color={color} />
      <Outlines thickness={0.028} color={INK} />
    </mesh>
  );
}

function Hand({ color, position }: { color: string; position: [number, number, number] }) {
  return (
    <mesh castShadow position={position} scale={[0.1, 0.1, 0.1]}>
      <sphereGeometry args={[1, 16, 10]} />
      <meshToonMaterial color={color} />
      <Outlines thickness={0.02} color={INK} />
    </mesh>
  );
}

function Foot({
  color,
  sole,
  position,
}: {
  color: string;
  sole: string;
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      <mesh castShadow scale={[0.16, 0.08, 0.26]}>
        <sphereGeometry args={[1, 16, 10]} />
        <meshToonMaterial color={color} />
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh position={[0, -0.047, 0.02]} scale={[0.17, 0.035, 0.28]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshToonMaterial color={sole} />
      </mesh>
    </group>
  );
}

function Hair({
  shape,
  primary,
  secondary,
}: {
  shape: PlazaHairShape;
  primary: string;
  secondary?: string;
}) {
  const accent = secondary ?? primary;
  const HairBlob = ({
    position,
    scale,
    rotation = [0, 0, 0],
    color = primary,
    thickness = 0.018,
  }: {
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: [number, number, number];
    color?: string;
    thickness?: number;
  }) => (
    <mesh castShadow position={position} rotation={rotation} scale={scale}>
      <sphereGeometry args={[1, 18, 12]} />
      <meshToonMaterial color={color} />
      <Outlines thickness={thickness} color={INK} />
    </mesh>
  );

  const HairStrand = ({
    position,
    scale,
    rotation = [0, 0, 0],
    color = primary,
    thickness = 0.016,
  }: {
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: [number, number, number];
    color?: string;
    thickness?: number;
  }) => (
    <mesh castShadow position={position} rotation={rotation} scale={scale}>
      <capsuleGeometry args={[0.16, 0.42, 8, 12]} />
      <meshToonMaterial color={color} />
      <Outlines thickness={thickness} color={INK} />
    </mesh>
  );

  const HairHighlight = ({
    position,
    scale,
    rotation = [0, 0, 0],
  }: {
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: [number, number, number];
  }) => (
    <mesh castShadow position={position} rotation={rotation} scale={scale}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshToonMaterial color={accent} />
      <Outlines thickness={0.01} color={INK} />
    </mesh>
  );

  if (shape === 'topknot') {
    return (
      <group>
        <HairBlob position={[0, 1.82, -0.06]} scale={[0.52, 0.32, 0.48]} thickness={0.022} />
        <HairBlob position={[0, 1.7, 0.27]} scale={[0.3, 0.11, 0.08]} thickness={0.016} />
        <HairStrand position={[-0.23, 1.57, 0.12]} scale={[0.09, 0.18, 0.08]} rotation={[0.04, 0, 0.08]} />
        <HairStrand position={[0.23, 1.57, 0.12]} scale={[0.09, 0.18, 0.08]} rotation={[0.04, 0, -0.08]} />
        <HairStrand position={[0.01, 1.96, -0.02]} scale={[0.05, 0.1, 0.05]} color={accent} />
        <HairBlob position={[0.01, 2.11, -0.01]} scale={[0.17, 0.17, 0.16]} thickness={0.016} />
        <HairHighlight position={[0.1, 1.83, 0.2]} scale={[0.13, 0.06, 0.05]} rotation={[0.18, 0, -0.2]} />
      </group>
    );
  }

  if (shape === 'sweep') {
    return (
      <group>
        <HairBlob position={[0, 1.82, -0.07]} scale={[0.52, 0.33, 0.49]} thickness={0.022} />
        <HairBlob position={[0, 1.46, -0.14]} scale={[0.36, 0.29, 0.2]} thickness={0.018} />
        <HairStrand
          position={[-0.02, 1.74, 0.24]}
          scale={[0.11, 0.36, 0.08]}
          rotation={[0.12, 0.02, -0.88]}
          thickness={0.016}
        />
        <HairBlob
          position={[0.18, 1.7, 0.22]}
          scale={[0.16, 0.11, 0.08]}
          rotation={[0.08, 0, -0.24]}
          color={accent}
          thickness={0.014}
        />
        <HairStrand position={[-0.26, 1.54, 0.1]} scale={[0.08, 0.2, 0.08]} rotation={[0.04, 0, 0.12]} />
        <HairStrand position={[0.25, 1.5, 0.04]} scale={[0.08, 0.26, 0.08]} rotation={[0.04, 0, -0.08]} />
        <HairHighlight position={[0.22, 1.82, 0.16]} scale={[0.14, 0.06, 0.05]} rotation={[0.14, 0, -0.22]} />
      </group>
    );
  }

  if (shape === 'tentacle') {
    return (
      <group>
        <HairBlob position={[0, 1.82, -0.07]} scale={[0.52, 0.33, 0.49]} thickness={0.022} />
        <HairBlob position={[0, 1.7, 0.27]} scale={[0.28, 0.11, 0.08]} thickness={0.016} />
        <HairBlob position={[0, 1.22, -0.2]} scale={[0.38, 0.62, 0.24]} thickness={0.018} />
        <HairStrand position={[-0.26, 1.15, -0.02]} scale={[0.09, 0.56, 0.09]} rotation={[0.06, 0, 0.08]} />
        <HairStrand position={[0.26, 1.15, -0.02]} scale={[0.09, 0.56, 0.09]} rotation={[0.06, 0, -0.08]} />
        <HairStrand position={[-0.18, 1.47, 0.16]} scale={[0.07, 0.18, 0.07]} rotation={[0.04, 0, 0.12]} color={accent} />
        <HairStrand position={[0.18, 1.47, 0.16]} scale={[0.07, 0.18, 0.07]} rotation={[0.04, 0, -0.12]} color={accent} />
        <HairHighlight position={[0.11, 1.83, 0.18]} scale={[0.12, 0.06, 0.05]} rotation={[0.14, 0, -0.16]} />
      </group>
    );
  }

  if (shape === 'cap') {
    return (
      <group>
        <HairBlob position={[0, 1.82, -0.05]} scale={[0.56, 0.34, 0.5]} thickness={0.022} />
        <HairBlob position={[0, 1.69, 0.27]} scale={[0.34, 0.12, 0.09]} thickness={0.016} />
        <HairBlob position={[-0.22, 1.66, 0.19]} scale={[0.11, 0.12, 0.08]} rotation={[0.08, 0, 0.06]} />
        <HairBlob position={[0.22, 1.66, 0.19]} scale={[0.11, 0.12, 0.08]} rotation={[0.08, 0, -0.06]} />
        <HairStrand position={[-0.24, 1.56, 0.08]} scale={[0.07, 0.13, 0.07]} rotation={[0.02, 0, 0.06]} />
        <HairStrand position={[0.24, 1.56, 0.08]} scale={[0.07, 0.13, 0.07]} rotation={[0.02, 0, -0.06]} />
        <HairHighlight position={[0.06, 1.8, 0.18]} scale={[0.16, 0.07, 0.05]} rotation={[0.12, 0, -0.1]} />
      </group>
    );
  }

  return (
    <group>
      <HairBlob position={[0, 1.81, -0.06]} scale={[0.51, 0.31, 0.47]} thickness={0.022} />
      <HairBlob position={[0, 1.69, 0.27]} scale={[0.34, 0.11, 0.08]} thickness={0.016} />
      <HairStrand position={[-0.24, 1.48, 0.1]} scale={[0.09, 0.28, 0.08]} rotation={[0.04, 0, 0.1]} />
      <HairStrand position={[0.24, 1.48, 0.1]} scale={[0.09, 0.28, 0.08]} rotation={[0.04, 0, -0.1]} />
      <HairBlob position={[0, 1.44, -0.14]} scale={[0.39, 0.34, 0.21]} thickness={0.018} />
      <HairBlob position={[-0.2, 1.35, -0.06]} scale={[0.12, 0.2, 0.11]} rotation={[0.02, 0, 0.08]} />
      <HairBlob position={[0.2, 1.35, -0.06]} scale={[0.12, 0.2, 0.11]} rotation={[0.02, 0, -0.08]} />
      <HairHighlight position={[0.08, 1.81, 0.18]} scale={[0.14, 0.06, 0.05]} rotation={[0.12, 0, -0.12]} />
    </group>
  );
}

function Face({ shape }: { shape: PlazaFaceShape }) {
  const wink = shape === 'wink';
  const surprised = shape === 'dot';
  const happy = shape === 'smile';

  return (
    <group position={[0, 0, 0.45]}>
      <mesh position={[0, 1.54, -0.01]} scale={[0.44, 0.34, 0.01]}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshBasicMaterial color="#F7D6B2" transparent opacity={0.22} />
      </mesh>
      <Brow x={-0.17} tilt={0.14} raised={surprised} />
      <Brow x={0.17} tilt={-0.14} raised={surprised} />
      <Cheek x={-0.22} />
      <Cheek x={0.22} />

      {happy ? (
        <>
          <ClosedEye x={-0.16} />
          <ClosedEye x={0.16} />
        </>
      ) : (
        <>
          <OpenEye x={-0.16} big={surprised} />
          {wink ? <ClosedEye x={0.16} /> : <OpenEye x={0.16} big={surprised} />}
        </>
      )}

      <mesh position={[0, 1.52, 0]} scale={[0.012, 0.02, 0.01]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#6E4B39" />
      </mesh>

      {surprised ? (
        <mesh position={[0, 1.39, 0]} scale={[0.042, 0.054, 0.012]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      ) : happy ? (
        <SmileMouth />
      ) : (
        <MouthBar position={[0.01, 1.39, 0]} rotation={[0, 0, -0.12]} scale={[0.086, 0.012, 0.01]} />
      )}
    </group>
  );
}

/** 眉。短い濃いバー。 */
function Brow({ x, tilt, raised }: { x: number; tilt: number; raised?: boolean }) {
  return (
    <mesh position={[x, raised ? 1.76 : 1.71, 0]} rotation={[0, 0, tilt]} scale={[0.082, 0.018, 0.012]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={INK} />
    </mesh>
  );
}

/** 開き目（アーモンド型）。縦長にしてアニメ寄りに。 */
function OpenEye({ x, big }: { x: number; big?: boolean }) {
  return (
    <group position={[x, 1.6, 0]}>
      <mesh scale={[0.068, big ? 0.1 : 0.088, 0.014]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color={EYE_WHITE} />
      </mesh>
      <mesh position={[0, -0.006, 0.006]} scale={[0.03, big ? 0.052 : 0.044, 0.015]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh position={[0.012, 0.018, 0.012]} scale={[0.008, 0.012, 0.006]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}

/** 閉じ目（にっこり/ウインクのへの字弧）。横長の薄いレンズ。 */
function ClosedEye({ x }: { x: number }) {
  return (
    <mesh position={[x, 1.605, 0]} rotation={[0, 0, x < 0 ? -0.14 : 0.14]} scale={[0.076, 0.022, 0.012]}>
      <sphereGeometry args={[1, 14, 8]} />
      <meshBasicMaterial color={INK} />
    </mesh>
  );
}

function Cheek({ x }: { x: number }) {
  return (
    <mesh position={[x, 1.46, 0]} scale={[0.05, 0.03, 0.01]}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshBasicMaterial color={BLUSH} transparent opacity={0.42} />
    </mesh>
  );
}

function SmileMouth() {
  return (
    <group position={[0, 1.38, 0]}>
      <mesh scale={[0.09, 0.03, 0.01]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh position={[0, 0.012, 0.002]} scale={[0.058, 0.014, 0.01]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#F7D6B2" />
      </mesh>
    </group>
  );
}

function makePlazaPalette(
  parts: ReturnType<typeof parseAvatarCode>,
  seedText: string,
): PlazaPalette {
  const seed = hashString(seedText);
  const baseIndex = idToIndex(parts.base, SKINS.length, seed);
  const hairIndex = idToIndex(parts.hair, HAIRS.length, seed >>> 4);
  const topIndex = idToIndex(parts.outfit, ACCENTS.length, seed >>> 8);
  const bottomIndex = (topIndex + 2 + (seed % BOTTOMS.length)) % BOTTOMS.length;
  const faceIndex = idToIndex(parts.face, 4, seed >>> 12);
  const shapes: PlazaHairShape[] = ['bob', 'topknot', 'sweep', 'tentacle', 'cap'];
  const faces: PlazaFaceShape[] = ['smile', 'dot', 'focus', 'wink'];

  return {
    skin: SKINS[baseIndex]!,
    hair: HAIRS[hairIndex]!,
    // 房ごとの色割れを避け、主色と揃える（参考アプリの単色ヘアに寄せる）。
    hairAlt: HAIRS[hairIndex]!,
    top: ACCENTS[topIndex]!,
    bottom: BOTTOMS[bottomIndex]!,
    shoe: '#17191F',
    sole: '#FFF8DD',
    hairShape: shapes[(hairIndex + seed) % shapes.length]!,
    face: faces[faceIndex]!,
    longTop: topIndex === 4,
    detail: topIndex === 2 ? 'stripe' : 'plain',
  };
}

function idToIndex(id: string | undefined, length: number, fallback: number) {
  const n = id ? Number.parseInt(id, 10) : Number.NaN;
  if (Number.isFinite(n)) return Math.max(0, n - 1) % length;
  return fallback % length;
}

function hashString(value: string) {
  let acc = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    acc ^= value.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  return acc >>> 0;
}

function MouthBar({
  position,
  rotation,
  scale,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshBasicMaterial color={INK} />
    </mesh>
  );
}

export const StylizedPlazaAvatar = memo(StylizedPlazaAvatarImpl);
