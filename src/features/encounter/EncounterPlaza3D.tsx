'use client';

/**
 * WebGL park view.
 *
 * - Canvas/R3F を主画面にして、円形公園・住人・自分の操作キャラを同じ 3D 空間に置く
 * - 操作は keyboard + virtual stick。カメラは自分を追従する
 * - residents は履歴データから公園内に滞在する住人として配置する
 */

import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Vector3, type Group } from 'three';
import { hapticTap } from '@/lib/haptics';
import type { HistoryItem } from '@/types/encounter';
import { Plaza3DBackground } from './Plaza3DBackground';
import {
  DEFAULT_WARDROBE,
  WARDROBE_CATALOG,
  normalizeWardrobeSelection,
  swatchColors,
  wardrobeToAppearance,
  type WardrobeCategory,
  type WardrobeSelection,
} from './parts/wardrobe';
import { PlazaDetailPanel } from './PlazaDetailPanel';
import { PlazaResident3D } from './PlazaResident3D';
import { StylizedPlazaAvatar, type PlazaPalette } from './StylizedPlazaAvatar';

type Props = {
  residents: HistoryItem[];
  /** 直近で対面挨拶を済ませた住人。 */
  joiningIds?: string[];
  /** 自分の操作キャラクター。未指定時は preview 用の既定値を使う。 */
  myAvatarCode?: string;
};

type MoveVector = {
  x: number;
  z: number;
};

type CircleCollider = {
  x: number;
  z: number;
  radius: number;
};

type PlayerPose = {
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
};

type StickState = {
  active: boolean;
  x: number;
  y: number;
};

type HudPanel = 'checklist' | 'emoji' | 'wear' | null;
type PlayerEmote = {
  id: number;
  mood: string;
} | null;

type WardrobeEditorPage = {
  key: 'appearance' | 'wear';
  rows: readonly WardrobeCategory[];
};

const DEFAULT_MY_AVATAR = 'b01_h01_o01_f01';
const WARDROBE_STORAGE_KEY = 'project-encounter:plaza-wardrobe:v1';
const MAX_VISIBLE_RESIDENTS = 24;
const PARK_RADIUS = 30;
const PLAYER_SPEED = 5.8;
const PLAYER_ACCELERATION = 18;
const PLAYER_DECELERATION = 22;
const PLAYER_COLLIDER_RADIUS = 0.46;
const PLAYER_JUMP_SPEED = 5.4;
const PLAYER_GRAVITY = 13.8;
const CAMERA_YAW = Math.PI * 0.78;
const CAMERA_BACK_DISTANCE = 23.5;
const CAMERA_HEIGHT = 16.8;
const CAMERA_LOOK_AHEAD = 0.95;
const CAMERA_LOOK_Y = 0.62;
const PORTRAIT_CAMERA_BACK_DISTANCE = 23.5;
const PORTRAIT_CAMERA_HEIGHT = 16.8;
const PORTRAIT_CAMERA_LOOK_AHEAD = 0.95;
const PORTRAIT_CAMERA_LOOK_Y = 0.62;
const PORTRAIT_CAMERA_SHOULDER_OFFSET = 0;
const PARK_BENCH_SLOTS = [
  { x: -4.05, z: 10.8, rotationY: Math.PI / 2 },
  { x: 4.15, z: -10.6, rotationY: -Math.PI / 2 },
  { x: 11.85, z: 3.8, rotationY: Math.PI },
  { x: -11.65, z: -3.75, rotationY: 0 },
  { x: 9.55, z: 15.08, rotationY: Math.PI * 0.75 },
] as const;
const RESIDENT_STAND_SPOTS = [
  [-2.0, 9.2],
  [2.1, 10.8],
  [-2.15, 14.2],
  [2.22, 15.7],
  [-4.35, 20.15],
  [4.45, 20.45],
  [-5.2, 7.6],
  [5.35, 7.4],
  [-7.8, -5.1],
  [7.7, -5.2],
  [-10.8, 4.1],
  [10.8, -4.1],
  [-14.8, 10.6],
  [14.8, 10.4],
  [-16.6, -9.2],
  [16.5, -9.0],
  [-20.5, 2.8],
  [20.4, 2.8],
  [-10.2, 18.8],
  [10.2, 18.8],
  [-18.8, -17.3],
  [18.8, -17.3],
  [-6.6, -20.4],
  [6.6, -20.4],
] as const;
const CAMERA_SHOULDER_OFFSET = 0;
const TALK_RADIUS = 5.8;
const STICK_RADIUS = 44;
const WARDROBE_EDITOR_PAGES: readonly WardrobeEditorPage[] = [
  { key: 'appearance', rows: ['hairStyle', 'hairColor', 'face', 'accessory'] },
  { key: 'wear', rows: ['top', 'bottom', 'shoe', 'hat'] },
] as const;
const WARDROBE_CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  hairStyle: '髪型',
  hairColor: '髪色',
  top: 'トップス',
  bottom: 'ボトムス',
  shoe: 'くつ',
  hat: '帽子',
  accessory: '小物',
  face: '表情',
  backdrop: '足元',
};
const PLAYER_START_Z = 8.2;

const CONTROL_KEYS = new Set([
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'a',
  'd',
  'w',
  's',
]);

export function EncounterPlaza3D({
  residents,
  myAvatarCode = DEFAULT_MY_AVATAR,
}: Props) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [activePanel, setActivePanel] = useState<HudPanel>(null);
  const [musicOn, setMusicOn] = useState(false);
  const [mood, setMood] = useState('●');
  const [wardrobe, setWardrobe] = useState<WardrobeSelection>(DEFAULT_WARDROBE);
  const [wardrobeLoaded, setWardrobeLoaded] = useState(false);
  const [playerEmote, setPlayerEmote] = useState<PlayerEmote>(null);
  const [playerPose, setPlayerPose] = useState<PlayerPose>({
    x: 0,
    z: PLAYER_START_Z,
    facingX: 0,
    facingZ: -1,
  });
  const residentCollidersRef = useRef<Map<string, CircleCollider>>(new Map());
  const controls = useMovementInput(activePanel !== 'wear');
  // 着せ替え選択 → 自分の見た目(appearanceOverrides) をその場で反映。
  const wearAppearance = useMemo<Partial<PlazaPalette>>(
    () => wardrobeToAppearance(wardrobe),
    [wardrobe],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WARDROBE_STORAGE_KEY);
      if (raw) setWardrobe(normalizeWardrobeSelection(JSON.parse(raw)));
    } catch (error) {
      console.warn('[plaza] wardrobe restore failed:', error);
    } finally {
      setWardrobeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!wardrobeLoaded) return;
    try {
      window.localStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify(wardrobe));
    } catch (error) {
      console.warn('[plaza] wardrobe save failed:', error);
    }
  }, [wardrobe, wardrobeLoaded]);

  const visibleResidents = useMemo(
    () => residents.slice(0, MAX_VISIBLE_RESIDENTS),
    [residents],
  );
  const hiddenCount = Math.max(0, residents.length - visibleResidents.length);
  const staticColliders = useMemo(makeParkColliders, []);

  const placed = useMemo(() => {
    return visibleResidents.map((item, i) => {
      const seed = hashString(item.user_id);
      const anchor = makeResidentStandPoint(i, seed);
      const openPoint = resolveCircleCollisions(
        anchor.x,
        anchor.z,
        0.54,
        PARK_RADIUS - 3.2,
        staticColliders,
      );
      return {
        item,
        x: openPoint.x,
        z: openPoint.z,
      };
    });
  }, [visibleResidents, staticColliders]);
  useEffect(() => {
    const colliders = residentCollidersRef.current;
    colliders.clear();
    for (const resident of placed) {
      colliders.set(resident.item.user_id, {
        x: resident.x,
        z: resident.z,
        radius: 0.62,
      });
    }
  }, [placed]);

  const nearbyResident = useMemo(() => {
    let nearest: (typeof placed)[number] | null = null;
    let nearestScore = TALK_RADIUS;

    for (const resident of placed) {
      const dx = resident.x - playerPose.x;
      const dz = resident.z - playerPose.z;
      const distance = Math.hypot(
        dx,
        dz,
      );
      if (distance > TALK_RADIUS) continue;

      const facingDot =
        distance < 0.0001
          ? 1
          : (dx / distance) * playerPose.facingX +
            (dz / distance) * playerPose.facingZ;
      if (facingDot < 0.08 && distance > 2.2) continue;

      const centeredScore = distance + (1 - Math.max(0, facingDot)) * 1.25;
      if (centeredScore < nearestScore) {
        nearest = resident;
        nearestScore = centeredScore;
      }
    }

    return nearest;
  }, [placed, playerPose]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid="encounter-plaza-3d"
      style={{
        background:
          'linear-gradient(180deg, #92D9D0 0%, #75C8C7 48%, #5BA9B2 100%)',
      }}
    >
      <Canvas
        shadows={false}
        fallback={<CanvasFallback />}
        camera={{ position: [0, 8.8, 16.5], fov: 45, near: 0.1, far: 160 }}
        dpr={[0.75, 1]}
        gl={{ antialias: false, alpha: false, preserveDrawingBuffer: false }}
      >
        <color attach="background" args={['#E0F7FA']} />
        <fog attach="fog" args={['#E0F7FA', 42, 108]} />
        <SceneLights />
        <GameCameraRig pose={playerPose} />
        <Plaza3DBackground plazaRadius={PARK_RADIUS} />
        {placed.map((p) => (
          <PlazaResident3D
            key={p.item.user_id}
            userId={p.item.user_id}
            avatarCode={p.item.avatar_code}
            initialX={p.x}
            initialZ={p.z}
            showMarker={
              activePanel !== 'wear' &&
              nearbyResident?.item.user_id === p.item.user_id
            }
            markerText={p.item.message || p.item.display_name || '...'}
            onTap={() => {
              hapticTap();
              setSelected(p.item);
            }}
          />
        ))}

        {activePanel !== 'wear' && (
          <PlayerRig
            avatarCode={myAvatarCode}
            appearanceOverrides={wearAppearance}
            moveRef={controls.moveRef}
            jumpRef={controls.jumpRef}
            parkRadius={PARK_RADIUS}
            colliders={staticColliders}
            residentCollidersRef={residentCollidersRef}
            emote={playerEmote}
            onPoseChange={setPlayerPose}
          />
        )}
      </Canvas>

      <PlazaAtmosphere />
      {activePanel !== 'wear' && (
        <TownHud
          activePanel={activePanel}
          musicOn={musicOn}
          mood={mood}
          onToggleMusic={() => setMusicOn((value) => !value)}
          onTogglePanel={(panel) =>
            setActivePanel((current) => (current === panel ? null : panel))
          }
        />
      )}
      <MessengerFloatingPanels
        activePanel={activePanel}
        avatarCode={myAvatarCode}
        appearanceOverrides={wearAppearance}
        residentCount={visibleResidents.length}
        hiddenCount={hiddenCount}
        musicOn={musicOn}
        mood={mood}
        wardrobe={wardrobe}
        onSelectMood={(nextMood) => {
          setMood(nextMood);
          setPlayerEmote({ id: Date.now(), mood: nextMood });
          setActivePanel(null);
        }}
        onChangeWardrobe={(category, id) =>
          setWardrobe((prev) => ({ ...prev, [category]: id }))
        }
        onCloseWardrobe={() => setActivePanel(null)}
      />
      {activePanel !== 'wear' && (
        <>
          <DialogButton
            active={Boolean(nearbyResident)}
            disabled={!nearbyResident}
            onClick={() => {
              if (!nearbyResident) return;
              hapticTap();
              setSelected(nearbyResident.item);
              setActivePanel(null);
            }}
          />
          <JumpButton onJump={controls.triggerJump} />
          <MovePad stick={controls.stick} {...controls.stickHandlers} />
          <PlazaMessagePanel
            activeResidentName={
              nearbyResident?.item.display_name ||
              nearbyResident?.item.user_id ||
              null
            }
            activeMessage={nearbyResident?.item.message || null}
            residentCount={visibleResidents.length}
          />
        </>
      )}

      {hiddenCount > 0 && (
        <div className="pointer-events-none absolute right-3 top-16 z-20 rounded-full border border-white/45 bg-ink/50 px-3 py-1 text-[11px] font-black tracking-wider text-cream-soft shadow-[0_10px_28px_rgba(0,0,0,0.18)] backdrop-blur">
          +{hiddenCount}
        </div>
      )}

      {residents.length === 0 && <EmptyOverlay />}

      <PlazaDetailPanel resident={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.72} />
      <hemisphereLight
        args={['#FFF0C8', '#2D736E', 0.78]}
        position={[0, 8, 0]}
      />
      <directionalLight
        castShadow
        position={[16, 28, 18]}
        intensity={1.25}
        color="#FFF0C8"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
    </>
  );
}

function GameCameraRig({ pose }: { pose: PlayerPose }) {
  const { camera, size } = useThree();
  const poseRef = useRef(pose);
  const cameraLookAtRef = useRef(new Vector3(0, CAMERA_LOOK_Y, PLAYER_START_Z));
  const desiredCameraRef = useRef(new Vector3());
  const desiredLookAtRef = useRef(new Vector3());
  poseRef.current = pose;

  useLayoutEffect(() => {
    setCameraTargets(poseRef.current, size, desiredCameraRef.current, desiredLookAtRef.current);
    camera.position.copy(desiredCameraRef.current);
    cameraLookAtRef.current.copy(desiredLookAtRef.current);
    camera.lookAt(cameraLookAtRef.current);
  }, [camera, size]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    setCameraTargets(pose, size, desiredCameraRef.current, desiredLookAtRef.current);
    camera.position.lerp(desiredCameraRef.current, 1 - Math.exp(-11.5 * dt));
    cameraLookAtRef.current.lerp(desiredLookAtRef.current, 1 - Math.exp(-13 * dt));
    camera.lookAt(cameraLookAtRef.current);
  });

  return null;
}

function setCameraTargets(
  pose: PlayerPose,
  size: { width: number; height: number },
  desiredCamera: Vector3,
  desiredLookAt: Vector3,
) {
  const facingX = Math.sin(CAMERA_YAW);
  const facingZ = Math.cos(CAMERA_YAW);
  const rightX = -facingZ;
  const rightZ = facingX;
  const isPortraitView = size.height > size.width * 1.08;
  const cameraBackDistance = isPortraitView
    ? PORTRAIT_CAMERA_BACK_DISTANCE
    : CAMERA_BACK_DISTANCE;
  const cameraHeight = isPortraitView ? PORTRAIT_CAMERA_HEIGHT : CAMERA_HEIGHT;
  const cameraLookAhead = isPortraitView
    ? PORTRAIT_CAMERA_LOOK_AHEAD
    : CAMERA_LOOK_AHEAD;
  const cameraLookY = isPortraitView ? PORTRAIT_CAMERA_LOOK_Y : CAMERA_LOOK_Y;
  const cameraShoulderOffset = isPortraitView
    ? PORTRAIT_CAMERA_SHOULDER_OFFSET
    : CAMERA_SHOULDER_OFFSET;

  desiredCamera.set(
    pose.x - facingX * cameraBackDistance + rightX * cameraShoulderOffset,
    cameraHeight,
    pose.z - facingZ * cameraBackDistance + rightZ * cameraShoulderOffset,
  );
  desiredLookAt.set(
    pose.x + facingX * cameraLookAhead,
    cameraLookY,
    pose.z + facingZ * cameraLookAhead,
  );
}

function PlayerRig({
  avatarCode,
  appearanceOverrides,
  moveRef,
  jumpRef,
  parkRadius,
  colliders,
  residentCollidersRef,
  emote,
  onPoseChange,
}: {
  avatarCode: string;
  appearanceOverrides: Partial<PlazaPalette>;
  moveRef: MutableRefObject<MoveVector>;
  jumpRef: MutableRefObject<number>;
  parkRadius: number;
  colliders: CircleCollider[];
  residentCollidersRef: MutableRefObject<Map<string, CircleCollider>>;
  emote: PlayerEmote;
  onPoseChange: (pose: PlayerPose) => void;
}) {
  const groupRef = useRef<Group>(null);
  const visualRef = useRef<Group>(null);
  const targetRef = useRef(new Vector3(0, 0, PLAYER_START_Z));
  const velocityRef = useRef<MoveVector>({ x: 0, z: 0 });
  const reportTimerRef = useRef(0);
  const jumpSeenRef = useRef(0);
  const jumpHeightRef = useRef(0);
  const jumpVelocityRef = useRef(0);
  const [moving, setMoving] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [visibleEmote, setVisibleEmote] = useState<PlayerEmote>(null);
  const movingRef = useRef(false);
  const jumpingRef = useRef(false);

  useEffect(() => {
    if (!emote) return;
    setVisibleEmote(emote);
    const timer = window.setTimeout(() => setVisibleEmote(null), 2800);
    return () => window.clearTimeout(timer);
  }, [emote]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const dt = Math.min(delta, 0.05);
    const input = moveRef.current;
    const inputLength = Math.hypot(input.x, input.z);
    const hasInput = inputLength > 0.04;
    const visual = visualRef.current;

    if (jumpRef.current !== jumpSeenRef.current && !jumpingRef.current) {
      jumpSeenRef.current = jumpRef.current;
      jumpVelocityRef.current = PLAYER_JUMP_SPEED;
      jumpingRef.current = true;
      setJumping(true);
    } else if (jumpRef.current !== jumpSeenRef.current) {
      jumpSeenRef.current = jumpRef.current;
    }

    const controlFacingX = Math.sin(CAMERA_YAW);
    const controlFacingZ = Math.cos(CAMERA_YAW);
    const controlRightX = -controlFacingZ;
    const controlRightZ = controlFacingX;
    const velocity = velocityRef.current;
    let desiredVelocityX = 0;
    let desiredVelocityZ = 0;

    if (hasInput) {
      const axisX = input.x / inputLength;
      const axisZ = input.z / inputLength;
      const moveX = controlRightX * axisX - controlFacingX * axisZ;
      const moveZ = controlRightZ * axisX - controlFacingZ * axisZ;
      const moveLength = Math.hypot(moveX, moveZ) || 1;
      desiredVelocityX = (moveX / moveLength) * PLAYER_SPEED;
      desiredVelocityZ = (moveZ / moveLength) * PLAYER_SPEED;
    }

    const velocityBlend = 1 - Math.exp(-(hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION) * dt);
    velocity.x += (desiredVelocityX - velocity.x) * velocityBlend;
    velocity.z += (desiredVelocityZ - velocity.z) * velocityBlend;
    const velocityLength = Math.hypot(velocity.x, velocity.z);
    const isWalking = velocityLength > 0.08 || hasInput;

    if (velocityLength > 0.01) {
      const next = resolveCircleCollisions(
        targetRef.current.x + velocity.x * dt,
        targetRef.current.z + velocity.z * dt,
        PLAYER_COLLIDER_RADIUS,
        parkRadius - 3.2,
        colliders,
        residentCollidersRef.current,
      );
      targetRef.current.x = next.x;
      targetRef.current.z = next.z;

      const targetAngle = Math.atan2(velocity.x, velocity.z);
      group.rotation.y = dampAngle(group.rotation.y, targetAngle, 13, dt);
    }

    if (movingRef.current !== isWalking) {
      movingRef.current = isWalking;
      setMoving(isWalking);
    }

    if (jumpingRef.current) {
      jumpHeightRef.current += jumpVelocityRef.current * dt;
      jumpVelocityRef.current -= PLAYER_GRAVITY * dt;
      if (jumpHeightRef.current <= 0) {
        jumpHeightRef.current = 0;
        jumpVelocityRef.current = 0;
        jumpingRef.current = false;
        setJumping(false);
      }
    }
    if (visual) {
      visual.position.y = jumpHeightRef.current;
      visual.rotation.x = jumpingRef.current ? Math.sin(jumpHeightRef.current * 2.8) * 0.08 : 0;
    }

    group.position.lerp(targetRef.current, 1 - Math.exp(-30 * dt));
    reportTimerRef.current += dt;
    if (reportTimerRef.current > 0.04) {
      reportTimerRef.current = 0;
      onPoseChange({
        x: group.position.x,
        z: group.position.z,
        facingX: Math.sin(group.rotation.y),
        facingZ: Math.cos(group.rotation.y),
      });
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, PLAYER_START_Z]} rotation={[0, Math.PI, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.76, 1.02, 40]} />
        <meshBasicMaterial
          color="#fffaf0"
          transparent
          opacity={0.46}
          depthWrite={false}
        />
      </mesh>
      <group ref={visualRef}>
        <StylizedPlazaAvatar
          avatarCode={avatarCode}
          userId="self-player"
          mode={moving || jumping ? 'walking' : visibleEmote ? 'wave' : 'idle'}
          appearanceOverrides={appearanceOverrides}
          scale={0.9}
        />
        {visibleEmote && (
          <Html
            center
            distanceFactor={8}
            position={[0, 2.44, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="player-emote-bubble">
              {visibleEmote.mood}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function TownHud({
  activePanel,
  musicOn,
  mood,
  onToggleMusic,
  onTogglePanel,
}: {
  activePanel: HudPanel;
  musicOn: boolean;
  mood: string;
  onToggleMusic: () => void;
  onTogglePanel: (panel: Exclude<HudPanel, null>) => void;
}) {
  return (
    <>
      <div className="pointer-events-auto absolute right-4 top-12 z-30">
        <button
          type="button"
          aria-label="menu"
          className="messenger-side-button"
          data-active={activePanel === 'checklist'}
          onClick={() => onTogglePanel('checklist')}
        >
          <span className="messenger-ui-icon messenger-ui-icon-list" aria-hidden />
        </button>
      </div>
      <div className="pointer-events-auto absolute bottom-9 right-4 z-30 flex flex-col gap-3">
        <button
          type="button"
          aria-label="music"
          className="messenger-side-button"
          data-active={musicOn}
          onClick={onToggleMusic}
        >
          <span
            className="messenger-ui-icon messenger-ui-icon-sound"
            data-muted={!musicOn}
            aria-hidden
          />
        </button>
        <button
          type="button"
          aria-label="wear"
          className="messenger-side-button"
          data-active={activePanel === 'wear'}
          onClick={() => onTogglePanel('wear')}
        >
          <span className="messenger-ui-icon messenger-ui-icon-shirt" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="mood"
          className="messenger-side-button"
          data-active={activePanel === 'emoji'}
          onClick={() => onTogglePanel('emoji')}
        >
          <span className="messenger-ui-icon messenger-ui-icon-face" data-mood={mood} aria-hidden />
        </button>
      </div>
    </>
  );
}

function DialogButton({
  active,
  disabled,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-12 right-[5.75rem] z-30">
      <button
        type="button"
        aria-label="dialog"
        className="messenger-side-button"
        data-active={active}
        data-disabled={disabled}
        disabled={disabled}
        onClick={onClick}
      >
        <span className="messenger-ui-icon messenger-ui-icon-dialog" aria-hidden />
      </button>
    </div>
  );
}

function PlazaMessagePanel({
  activeResidentName,
  activeMessage,
  residentCount,
}: {
  activeResidentName: string | null;
  activeMessage: string | null;
  residentCount: number;
}) {
  const speaker = activeResidentName || 'PLAZA';
  const message = activeResidentName
    ? activeMessage || 'ちかくにいるよ。話しかけてみよう。'
    : residentCount > 0
      ? `${residentCount}人が広場を散歩中。気になる人の近くへ歩こう。`
      : '広場はまだ静かです。';

  return (
    <div className="plaza-message-panel pointer-events-none absolute inset-x-4 z-20">
      <div className="plaza-message-name">{speaker.slice(0, 14)}</div>
      <div className="plaza-message-body">
        <span>{message.slice(0, 46)}</span>
      </div>
    </div>
  );
}

function MessengerFloatingPanels({
  activePanel,
  avatarCode,
  appearanceOverrides,
  residentCount,
  hiddenCount,
  musicOn,
  mood,
  wardrobe,
  onSelectMood,
  onChangeWardrobe,
  onCloseWardrobe,
}: {
  activePanel: HudPanel;
  avatarCode: string;
  appearanceOverrides: Partial<PlazaPalette>;
  residentCount: number;
  hiddenCount: number;
  musicOn: boolean;
  mood: string;
  wardrobe: WardrobeSelection;
  onSelectMood: (mood: string) => void;
  onChangeWardrobe: (category: WardrobeCategory, id: string) => void;
  onCloseWardrobe: () => void;
}) {
  if (!activePanel) return null;

  if (activePanel === 'emoji') {
    const moods = ['●', '♪', '★', '!', '?', '♥', '☁', '…', '✓', '○'];
    return (
      <div className="messenger-emoji-panel pointer-events-auto absolute bottom-12 right-[6.25rem] z-30 grid grid-cols-5 gap-3 p-4">
        {moods.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={`mood-${item}`}
            className="messenger-emoji-cell"
            data-active={mood === item}
            onClick={() => onSelectMood(item)}
          >
            {item}
          </button>
        ))}
      </div>
    );
  }

  if (activePanel === 'wear') {
    return (
      <WardrobeEditorOverlay
        avatarCode={avatarCode}
        appearanceOverrides={appearanceOverrides}
        wardrobe={wardrobe}
        onChange={onChangeWardrobe}
        onClose={onCloseWardrobe}
      />
    );
  }

  const rows = [
    { fill: 1, done: true },
    { fill: residentCount > 0 ? 0.72 : 0.25, done: residentCount > 0 },
    { fill: hiddenCount > 0 ? 0.92 : 0.5, done: hiddenCount > 0 },
    { fill: musicOn ? 0.82 : 0.38, done: musicOn },
  ];

  return (
    <div className="messenger-panel pointer-events-auto absolute right-[5.8rem] top-12 z-30 w-[min(395px,calc(100vw-7rem))] p-4">
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-3">
        <div className="messenger-ticket" />
        <div className="messenger-stamp">{residentCount}</div>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={index} className="messenger-check-row">
            <span data-done={row.done}>{row.done ? '✓' : ''}</span>
            <div>
              <i style={{ width: `${row.fill * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WardrobeEditorOverlay({
  avatarCode,
  appearanceOverrides,
  wardrobe,
  onChange,
  onClose,
}: {
  avatarCode: string;
  appearanceOverrides: Partial<PlazaPalette>;
  wardrobe: WardrobeSelection;
  onChange: (category: WardrobeCategory, id: string) => void;
  onClose: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = WARDROBE_EDITOR_PAGES[pageIndex] ?? WARDROBE_EDITOR_PAGES[0];
  const backdropItems = WARDROBE_CATALOG.backdrop;
  const previewIsAppearance = page.key === 'appearance';
  const selectedRows = page.rows.map((category) => {
    const fallback = WARDROBE_CATALOG[category][0]!;
    const item = WARDROBE_CATALOG[category].find((entry) => entry.id === wardrobe[category]) ?? fallback;
    return {
      category,
      item,
      swatch: swatchColors(category, item.id),
    };
  });

  const cycleItem = (category: WardrobeCategory, direction: -1 | 1) => {
    const items = WARDROBE_CATALOG[category];
    const currentId = wardrobe[category];
    const index = items.findIndex((item) => item.id === currentId);
    const nextIndex = (index + direction + items.length) % items.length;
    const nextItem = items[nextIndex];
    if (nextItem) onChange(category, nextItem.id);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.04)_36%,rgba(0,0,0,0.06)_100%)]" />
      <div className="absolute inset-x-0 top-5 z-[1] flex justify-center px-4 sm:top-7">
        <button
          type="button"
          aria-label="close-wardrobe"
          onClick={onClose}
          className="messenger-side-button grid h-[52px] w-[52px] place-items-center"
        >
          <span className="messenger-ui-icon messenger-ui-icon-close" aria-hidden />
        </button>
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="relative h-full w-full max-w-[760px]">
          <div className="absolute left-1/2 top-[15%] h-[58vh] w-[min(72vw,360px)] -translate-x-1/2 sm:top-[12%] sm:h-[66vh] sm:w-[420px]">
            <Canvas
              camera={
                previewIsAppearance
                  ? { position: [0, 1.06, 6.8], fov: 25 }
                  : { position: [0, 1.0, 7.4], fov: 24 }
              }
              dpr={[1, 1.5]}
            >
              <ambientLight intensity={0.98} />
              <directionalLight position={[2.6, 4.8, 3.4]} intensity={1.18} />
              <group
                position={previewIsAppearance ? [0, -1.04, 0] : [0, -1.36, 0]}
                rotation={[0, 0, 0]}
              >
                <StylizedPlazaAvatar
                  avatarCode={avatarCode}
                  userId="self-preview"
                  appearanceOverrides={appearanceOverrides}
                  scale={previewIsAppearance ? 0.86 : 0.8}
                />
              </group>
            </Canvas>
          </div>

          {selectedRows.map(({ category }, index) => {
            return (
              <div
                key={category}
                className="pointer-events-none absolute left-1/2 flex w-[min(90vw,560px)] -translate-x-1/2 items-center justify-between"
                style={{ top: `calc(15% + ${index * 11.5}%)` }}
              >
                <button
                  type="button"
                  aria-label={`${category}-prev`}
                  className="messenger-side-button pointer-events-auto grid h-[50px] w-[50px] place-items-center"
                  onClick={() => cycleItem(category, -1)}
                >
                  <span className="messenger-ui-icon messenger-ui-icon-arrow" data-dir="left" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`${category}-next`}
                  className="messenger-side-button pointer-events-auto grid h-[50px] w-[50px] place-items-center"
                  onClick={() => cycleItem(category, 1)}
                >
                  <span className="messenger-ui-icon messenger-ui-icon-arrow" data-dir="right" aria-hidden />
                </button>
              </div>
            );
          })}

          <div className="absolute inset-x-0 bottom-[8.8rem] z-[2] flex justify-center px-4 sm:bottom-[9.25rem]">
            <div className="grid w-[min(92vw,540px)] grid-cols-2 gap-2 sm:grid-cols-4">
              {selectedRows.map(({ category, item, swatch }) => (
                <div
                  key={category}
                  className="min-w-0 rounded-[8px] border-2 border-[rgba(39,49,58,0.36)] bg-[rgba(248,247,239,0.9)] px-2.5 py-2 shadow-[2px_3px_0_rgba(39,49,58,0.16)] backdrop-blur-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-[rgba(39,49,58,0.26)]"
                      style={{
                        background: swatch.secondary
                          ? `linear-gradient(110deg, ${swatch.primary} 0 52%, ${swatch.secondary} 52% 100%)`
                          : swatch.primary,
                      }}
                    />
                    <span className="min-w-0 truncate text-[10px] font-black leading-none tracking-wide text-ink-muted">
                      {WARDROBE_CATEGORY_LABELS[category]}
                    </span>
                    <span className="min-w-0 truncate text-[11px] font-black leading-none tracking-wide text-ink-soft">
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-[6.7rem] flex justify-center gap-2">
            {WARDROBE_EDITOR_PAGES.map((entry, index) => (
              <button
                key={entry.key}
                type="button"
                aria-label={`wear-page-${entry.key}`}
                onClick={() => setPageIndex(index)}
                className={`h-3.5 w-3.5 rounded-full border-2 ${
                  pageIndex === index
                    ? 'border-[rgba(39,49,58,0.6)] bg-[#ffd23f]'
                    : 'border-[rgba(39,49,58,0.28)] bg-[rgba(248,247,239,0.92)]'
                }`}
              />
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-[5.15rem] flex justify-center gap-2 px-4">
            {backdropItems.map((item) => {
              const swatch = swatchColors('backdrop', item.id);
              const selected = wardrobe.backdrop === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`backdrop-${item.id}`}
                  onClick={() => onChange('backdrop', item.id)}
                  className={`h-8 w-8 rounded-full border-2 shadow-[2px_3px_0_rgba(39,49,58,0.16)] ${
                    selected
                      ? 'border-[rgba(39,49,58,0.66)]'
                      : 'border-[rgba(39,49,58,0.26)]'
                  }`}
                  style={{ background: swatch.primary }}
                />
              );
            })}
          </div>

          <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
            <button
              type="button"
              onClick={onClose}
              className="plaza-begin-button min-w-[min(15rem,58vw)]"
            >
              CONTINUE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JumpButton({ onJump }: { onJump: () => void }) {
  return (
    <button
      type="button"
      aria-label="jump"
      className="messenger-jump-button pointer-events-auto absolute bottom-24 left-36 z-30"
      onClick={onJump}
    >
      <span className="messenger-ui-icon messenger-ui-icon-jump" aria-hidden />
    </button>
  );
}

function MovePad({
  stick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  stick: StickState;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="application"
      aria-label="移動"
      className="pointer-events-auto absolute bottom-24 left-4 z-30 grid h-28 w-28 touch-none place-items-center rounded-full border border-white/50 bg-ink/25 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-md"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="h-[74px] w-[74px] rounded-full border border-white/35 bg-white/10" />
      <div
        className="absolute h-10 w-10 rounded-full border border-white/70 bg-cream-soft/90 shadow-[0_8px_22px_rgba(0,0,0,0.22)] transition-[opacity] duration-150"
        style={{
          opacity: stick.active ? 1 : 0.82,
          transform: `translate(${stick.x}px, ${stick.y}px)`,
        }}
      />
    </div>
  );
}

function EmptyOverlay() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-20 z-20 w-[min(88vw,360px)] -translate-x-1/2">
      <div className="game-hud pointer-events-auto flex items-center justify-between gap-3 rounded-full px-3 py-2">
        <span className="min-w-0 truncate text-[12px] font-black tracking-wider text-ink">
          広場は静かです
        </span>
        <Link
          href="/walk"
          prefetch={false}
          className="shrink-0 rounded-full bg-pop-blue px-3 py-1.5 text-[11px] font-black tracking-wider text-cream-soft"
        >
          WALK
        </Link>
      </div>
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-cream px-6 text-center text-ink">
      <div className="game-panel rounded-toy p-5">
        <p className="text-sm font-black">3D広場を読み込めませんでした</p>
        <p className="mt-2 text-xs font-bold text-ink-soft">
          WebGL が有効な環境で再度お試しください。
        </p>
      </div>
    </div>
  );
}

function PlazaAtmosphere() {
  const [specks, setSpecks] = useState<
    Array<{ x: number; y: number; size: number; delay: number; duration: number }>
  >([]);

  useEffect(() => {
    setSpecks(
      Array.from({ length: 34 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 7,
        delay: Math.random() * 8,
        duration: 8 + Math.random() * 9,
      })),
    );
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {specks.map((s, i) => (
        <span
          key={i}
          className="plaza-speck absolute rounded-full bg-cream-soft/45"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `-${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function useMovementInput(enabled: boolean) {
  const moveRef = useRef<MoveVector>({ x: 0, z: 0 });
  const jumpRef = useRef(0);
  const keysRef = useRef(new Set<string>());
  const joystickPointerRef = useRef<number | null>(null);
  const [stick, setStick] = useState<StickState>({ active: false, x: 0, y: 0 });

  const setMove = useCallback((x: number, z: number) => {
    const len = Math.hypot(x, z);
    if (len > 1) {
      moveRef.current = { x: x / len, z: z / len };
    } else {
      moveRef.current = { x, z };
    }
  }, []);

  const syncKeys = useCallback(() => {
    if (joystickPointerRef.current !== null) return;
    const keys = keysRef.current;
    const x =
      (keys.has('arrowright') || keys.has('d') ? 1 : 0) -
      (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    const z =
      (keys.has('arrowdown') || keys.has('s') ? 1 : 0) -
      (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    setMove(x, z);
  }, [setMove]);

  const triggerJump = useCallback(() => {
    if (!enabled) return;
    jumpRef.current += 1;
    hapticTap();
  }, [enabled]);

  useEffect(() => {
    if (enabled) return;
    keysRef.current.clear();
    joystickPointerRef.current = null;
    setMove(0, 0);
    setStick({ active: false, x: 0, y: 0 });
  }, [enabled, setMove]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!enabled) return;
      if (event.code === 'Space' && !isEditableTarget(event.target)) {
        event.preventDefault();
        if (event.type === 'keydown' && !event.repeat) {
          triggerJump();
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (!CONTROL_KEYS.has(key) || isEditableTarget(event.target)) return;
      event.preventDefault();
      if (event.type === 'keydown') {
        keysRef.current.add(key);
      } else {
        keysRef.current.delete(key);
      }
      syncKeys();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      setMove(0, 0);
    };
  }, [enabled, setMove, syncKeys, triggerJump]);

  const updateStick = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy);
      const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
      const sx = dx * scale;
      const sy = dy * scale;
      setStick({ active: true, x: sx, y: sy });
      setMove(sx / STICK_RADIUS, sy / STICK_RADIUS);
    },
    [setMove],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      joystickPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateStick(event);
    },
    [enabled, updateStick],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (joystickPointerRef.current !== event.pointerId) return;
      updateStick(event);
    },
    [enabled, updateStick],
  );

  const releaseStick = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (joystickPointerRef.current !== event.pointerId) return;
      joystickPointerRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setStick({ active: false, x: 0, y: 0 });
      syncKeys();
    },
    [syncKeys],
  );

  return {
    moveRef,
    jumpRef,
    triggerJump,
    stick,
    stickHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: releaseStick,
      onPointerCancel: releaseStick,
    },
  };
}

function clampXZToRadius(v: Vector3, radius: number) {
  const len = Math.hypot(v.x, v.z);
  if (len <= radius) return;
  v.x = (v.x / len) * radius;
  v.z = (v.z / len) * radius;
}

function resolveCircleCollisions(
  x: number,
  z: number,
  selfRadius: number,
  boundsRadius: number,
  colliders: CircleCollider[],
  dynamicColliders?: Map<string, CircleCollider>,
) {
  let resolved = clampPointToRadius(x, z, boundsRadius);

  for (let pass = 0; pass < 3; pass += 1) {
    for (const collider of colliders) {
      let dx = resolved.x - collider.x;
      let dz = resolved.z - collider.z;
      let distance = Math.hypot(dx, dz);
      const minDistance = selfRadius + collider.radius;

      if (distance >= minDistance) continue;
      if (distance < 0.0001) {
        dx = 1;
        dz = 0;
        distance = 1;
      }

      const push = minDistance - distance;
      resolved = {
        x: resolved.x + (dx / distance) * push,
        z: resolved.z + (dz / distance) * push,
      };
    }
    if (dynamicColliders) {
      for (const collider of dynamicColliders.values()) {
        let dx = resolved.x - collider.x;
        let dz = resolved.z - collider.z;
        let distance = Math.hypot(dx, dz);
        const minDistance = selfRadius + collider.radius;

        if (distance >= minDistance) continue;
        if (distance < 0.0001) {
          dx = 1;
          dz = 0;
          distance = 1;
        }

        const push = minDistance - distance;
        resolved = {
          x: resolved.x + (dx / distance) * push,
          z: resolved.z + (dz / distance) * push,
        };
      }
    }
    resolved = clampPointToRadius(resolved.x, resolved.z, boundsRadius);
  }

  return resolved;
}

function clampPointToRadius(x: number, z: number, radius: number) {
  const length = Math.hypot(x, z);
  if (length <= radius) return { x, z };
  return {
    x: (x / length) * radius,
    z: (z / length) * radius,
  };
}

function makeResidentStandPoint(index: number, seed: number) {
  const base = RESIDENT_STAND_SPOTS[index % RESIDENT_STAND_SPOTS.length];
  const repeatRow = Math.floor(index / RESIDENT_STAND_SPOTS.length);
  const jitterAngle = ((seed >>> 4) % 360) * (Math.PI / 180);
  const jitterRadius = repeatRow === 0
    ? 0.16 + ((seed >>> 12) % 100) * 0.0028
    : 0.42 + Math.min(repeatRow, 2) * 0.2;

  return {
    x: base[0] + Math.cos(jitterAngle) * jitterRadius,
    z: base[1] + Math.sin(jitterAngle) * jitterRadius,
  };
}

function isInsideBenchFrontClearance(x: number, z: number) {
  return PARK_BENCH_SLOTS.some((bench) => {
    const frontX = Math.sin(bench.rotationY);
    const frontZ = Math.cos(bench.rotationY);
    const sideX = Math.cos(bench.rotationY);
    const sideZ = -Math.sin(bench.rotationY);
    const dx = x - bench.x;
    const dz = z - bench.z;
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

function makeParkColliders(): CircleCollider[] {
  const colliders: CircleCollider[] = [
    { x: 0, z: 0, radius: 3.35 },
    // 見た目で実体が大きいものだけを止める。植栽や小物は歩行を邪魔しない。
    { x: 6.6, z: 12.6, radius: 1.55 },
    { x: -10.35, z: -12.7, radius: 1.42 },
    { x: 22.8, z: -16.8, radius: 0.82 },
    { x: -14.05, z: 7.5, radius: 1.02 },
    { x: -11.15, z: 8.9, radius: 0.95 },
    { x: -12.85, z: 11.0, radius: 0.88 },
  ];

  PARK_BENCH_SLOTS.forEach((bench) => {
    colliders.push({
      x: bench.x,
      z: bench.z,
      radius: 1.08,
    });
  });

  [
    { x: -2.55, z: 25.65, radius: 0.56 },
    { x: 2.55, z: 25.65, radius: 0.56 },
    { x: -2.55, z: -25.65, radius: 0.56 },
    { x: 2.55, z: -25.65, radius: 0.56 },
  ].forEach((collider) => colliders.push(collider));

  return colliders;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * delta));
}

function hashString(value: string) {
  let acc = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    acc ^= value.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  return acc >>> 0;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}
