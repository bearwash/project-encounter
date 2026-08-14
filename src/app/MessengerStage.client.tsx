'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader, type FontData } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { useAuth } from '@/features/auth/AuthProvider';

type ScreenMode = 'intro' | 'loading' | 'dialog' | 'play';
type StoryArea = 'street' | 'cemetery' | 'falls';
type Vec2 = readonly [number, number];
type Runtime = ReturnType<typeof createRuntime>;

type BoxPlacement = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
};

type DiscPlacement = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
};

type CharacterRig = {
  group: THREE.Group;
  setMotion: (phase: number, speed: number, heading: number) => void;
};

const ink = '#213b3d';
const teal = '#63c2bc';
const titleFont = new FontLoader().parse(helvetikerBold as unknown as FontData);
const staticModelLoader = new GLTFLoader();
const staticModelCache = new Map<string, Promise<THREE.Group>>();

function getReferencePixelRatio(mobile: boolean, adaptiveScale: number) {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const referenceCap =
    devicePixelRatio <= 2 ? Math.min(devicePixelRatio, 1.15) : Math.min(devicePixelRatio, 1.5);
  const mobileCap = mobile ? Math.min(referenceCap, 1.08) : referenceCap;
  return Math.max(0.72, mobileCap * adaptiveScale);
}

export default function MessengerStage() {
  const { isAuthenticated, requestLogin } = useAuth();
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<ScreenMode>('intro');
  const [dialogIndex, setDialogIndex] = useState(0);
  const [areaTitle, setAreaTitle] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = createRuntime(host, setAreaTitle);
    runtimeRef.current = runtime;
    runtime.setMode(mode);

    return () => {
      runtimeRef.current = null;
      runtime.dispose();
    };
    // Runtime owns the canvas imperatively. React only owns the host node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    runtimeRef.current?.setMode(mode);
    if (mode !== 'play') setAreaTitle('');
  }, [mode]);

  useEffect(
    () => () => {
      if (loadingTimerRef.current !== null) {
        window.clearTimeout(loadingTimerRef.current);
      }
    },
    [],
  );

  const startGame = () => {
    setMode('loading');
    setDialogIndex(0);
    if (loadingTimerRef.current !== null) {
      window.clearTimeout(loadingTimerRef.current);
    }
    loadingTimerRef.current = window.setTimeout(() => {
      setMode('dialog');
      loadingTimerRef.current = null;
    }, 1450);
  };

  const advanceDialog = () => {
    if (dialogIndex < dialogLines.length - 1) {
      setDialogIndex((index) => index + 1);
      return;
    }
    setMode('play');
  };

  return (
    <main className={`messenger-stage messenger-stage--${mode}`} aria-label="Messenger">
      <h1 className="sr-only">Messenger</h1>
      <div ref={hostRef} className="messenger-canvas-host" aria-hidden="true" />

      {mode === 'intro' ? (
        <>
          <button
            className="messenger-begin"
            type="button"
            aria-label="Begin"
            onClick={startGame}
          >
            BEGIN
          </button>
          <nav className="encounter-hub-nav" aria-label="Encounterメニュー">
            <Link href="/tower">タワー</Link>
            <Link href="/workshop">工房</Link>
            <Link href="/shop">コイン</Link>
            <button
              type="button"
              onClick={() =>
                requestLogin({ reason: 'ログインすると、工房とすれ違いタワーの記録を使えます。' })
              }
              disabled={isAuthenticated}
            >
              {isAuthenticated ? 'ログイン中' : 'ログイン'}
            </button>
          </nav>
        </>
      ) : null}

      {mode === 'loading' ? <LoadingOverlay /> : null}

      {mode === 'dialog' ? (
        <StoryHud
          line={dialogLines[dialogIndex]}
          onBack={() => setMode('intro')}
          onContinue={advanceDialog}
        />
      ) : null}

      {mode === 'play' ? (
        <PlayHud onBack={() => setMode('dialog')} />
      ) : null}

      {mode === 'play' && areaTitle ? (
        <div className="area-title" aria-hidden="true">
          {areaTitle.split('\n').map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </main>
  );
}

const dialogLines = [
  "LOOKS LIKE I SLEPT IN... I BETTER START TODAY'S DELIVERIES.",
  "I'VE GOT FIVE ON THE LIST. HOPEFULLY THEY'RE EASY TO FIND.",
  'THE NEIGHBORHOOD IS QUIET, BUT EVERY CORNER HAS A PACKAGE WAITING.',
];

function LoadingOverlay() {
  return (
    <div className="loading-overlay" aria-label="Loading">
      <div className="loading-envelope" aria-hidden="true">
        <span />
      </div>
      <div className="loading-word">LOADING</div>
    </div>
  );
}

function PlayHud({ onBack }: { onBack: () => void }) {
  return (
    <>
      <button className="quest-button" type="button" aria-label="Checklist" onClick={onBack}>
        <span aria-hidden="true" />
      </button>
      <div className="side-buttons" aria-label="Tools">
        <button type="button" aria-label="Music">
          <span className="icon-music" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Clothes">
          <span className="icon-shirt" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Emoji">
          <span className="icon-emoji" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

function StoryHud({
  line,
  onBack,
  onContinue,
}: {
  line: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="story-hud" aria-label="Messenger dialogue">
      <button className="story-back" type="button" onClick={onBack} aria-label="Back">
        <span aria-hidden="true" />
      </button>
      <div className="story-name">MESSENGER</div>
      <div className="story-dialog">
        <p>{line}</p>
        <button type="button" aria-label="Continue" onClick={onContinue}>
          <span aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function createRuntime(host: HTMLDivElement, onAreaTitleChange: (title: string) => void) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowMemoryDevice = (nav.deviceMemory ?? 8) <= 4 || nav.hardwareConcurrency <= 4;
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(new THREE.Color(teal), 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowMemoryDevice ? THREE.BasicShadowMap : THREE.PCFShadowMap;
  renderer.domElement.dataset.renderer = 'raw-three-messenger';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  const gameCamera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);

  const ambient = new THREE.AmbientLight('#ffffff', 0.9);
  const hemi = new THREE.HemisphereLight('#e9fff9', '#60726d', 1.18);
  const key = new THREE.DirectionalLight('#fff3d2', 2.35);
  key.position.set(-4.6, 7.2, 6.8);
  key.castShadow = true;
  key.shadow.mapSize.set(lowMemoryDevice ? 512 : 1024, lowMemoryDevice ? 512 : 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -7.5;
  key.shadow.camera.right = 7.5;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -10.5;
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.04;
  scene.add(ambient, hemi, key);

  const oceanRoot = new THREE.Group();
  const bitsRoot = new THREE.Group();
  const introRoot = new THREE.Group();
  const storyRoot = new THREE.Group();
  scene.add(oceanRoot, bitsRoot, introRoot, storyRoot);

  const floaters = createOcean(oceanRoot, bitsRoot);
  const planet = createIntro(introRoot);
  const game = createStory(storyRoot, gameCamera, onAreaTitleChange);

  let mode: ScreenMode = 'intro';
  let width = 1;
  let height = 1;
  let raf = 0;
  let disposed = false;
  let currentPixelRatio = 1;
  let dprScale = lowMemoryDevice ? 0.86 : 1;
  let lastFrameTime = 0;
  let frameMsTotal = 0;
  let frameMsCount = 0;
  let lastDprTune = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const keys = new Set<string>();
  let activePointerId: number | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) {
      keys.add(event.key.toLowerCase());
      event.preventDefault();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };
  const updatePointerInput = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const nz = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    const length = Math.hypot(nx, nz);
    if (length < 0.12) {
      game.setPointerInput(0, 0, false);
      return;
    }
    game.setPointerInput(nx / length, nz / length, true);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (mode !== 'play') return;
    activePointerId = event.pointerId;
    renderer.domElement.setPointerCapture(event.pointerId);
    updatePointerInput(event);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (mode !== 'play' || activePointerId !== event.pointerId) return;
    updatePointerInput(event);
    event.preventDefault();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    game.setPointerInput(0, 0, false);
    renderer.domElement.releasePointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    game.setPointerInput(0, 0, false);
    renderer.domElement.releasePointerCapture(event.pointerId);
    event.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);

  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    const mobile = aspect < 0.72;
    const worldHeight =
      mode === 'intro'
        ? mobile
          ? 7.35
          : 6.05
        : mode === 'play'
          ? mobile
            ? 7.95
            : 6.35
          : mobile
            ? 7.75
            : 6.05;
    const worldWidth = worldHeight * aspect;

    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    camera.updateProjectionMatrix();
    gameCamera.aspect = aspect;
    gameCamera.fov = mobile ? 45 : 39;
    gameCamera.updateProjectionMatrix();

    const nextPixelRatio = getReferencePixelRatio(mobile, dprScale);
    if (Math.abs(nextPixelRatio - currentPixelRatio) > 0.01) {
      renderer.setPixelRatio(nextPixelRatio);
      currentPixelRatio = nextPixelRatio;
    }
    renderer.setSize(width, height, false);

    introRoot.position.set(0, mobile ? 0.18 : 0.26, 0);
    introRoot.scale.setScalar(mobile ? 1.02 : 1);
    storyRoot.position.set(0, mode === 'play' || mode === 'dialog' ? 0 : mobile ? -0.18 : -0.1, 0);
    game.resize(mobile, mode);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const tick = (time: number) => {
    if (disposed) return;
    const t = time / 1000;
    const frameMs = lastFrameTime === 0 ? 16.7 : Math.min(80, time - lastFrameTime);
    lastFrameTime = time;
    if (!reducedMotion) {
      frameMsTotal += frameMs;
      frameMsCount += 1;
      if (time - lastDprTune > 1700 && frameMsCount > 20) {
        const averageFrameMs = frameMsTotal / frameMsCount;
        const previousScale = dprScale;
        if (averageFrameMs > 22) dprScale = Math.max(0.72, dprScale - 0.08);
        else if (averageFrameMs < 16.4) dprScale = Math.min(1, dprScale + 0.04);
        frameMsTotal = 0;
        frameMsCount = 0;
        lastDprTune = time;
        if (Math.abs(previousScale - dprScale) > 0.01) resize();
      }
    }

    if (!reducedMotion) {
      bitsRoot.rotation.z = Math.sin(t * 0.12) * 0.015;
      bitsRoot.position.y = Math.sin(t * 0.18) * 0.035;
      planet.rotation.z = Math.sin(t * 0.18) * 0.018;
      planet.position.y = Math.sin(t * 0.55) * 0.045;
    }

    if (mode === 'play') {
      game.update(keys, reducedMotion ? 0 : t);
    } else {
      game.idle(reducedMotion ? 0 : t, mode);
    }

    renderer.render(scene, mode === 'dialog' || mode === 'play' ? gameCamera : camera);
    raf = requestAnimationFrame(tick);
  };

  resize();
  raf = requestAnimationFrame(tick);

  return {
    setMode(next: ScreenMode) {
      mode = next;
      introRoot.visible = next === 'intro';
      storyRoot.visible = next === 'dialog' || next === 'play';
      oceanRoot.visible = next === 'intro' || next === 'loading';
      bitsRoot.visible = next === 'intro' || next === 'loading';
      game.setMode(next);
      resize();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      staticModelCache.clear();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry?.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function createOcean(oceanRoot: THREE.Group, bitsRoot: THREE.Group) {
  const blobSpecs = [
    { x: -4.85, y: 2.3, r: 0.42, sx: 1.8, sy: 0.78, seed: 8 },
    { x: -3.0, y: -2.24, r: 0.5, sx: 1.9, sy: 0.78, seed: 4 },
    { x: 3.8, y: -2.58, r: 0.58, sx: 1.7, sy: 0.82, seed: 14 },
    { x: 4.95, y: 1.42, r: 0.38, sx: 1.25, sy: 0.9, seed: 21 },
    { x: 0.08, y: 3.08, r: 0.5, sx: 2.8, sy: 0.38, seed: 31 },
  ];

  for (const spec of blobSpecs) {
    const mesh = makeBlobMesh('#86d7cf', spec.r, 0.2, spec.seed, 0.42);
    mesh.position.set(spec.x, spec.y, -8);
    mesh.scale.set(spec.sx, spec.sy, 1);
    oceanRoot.add(mesh);
  }

  const rand = rng(127);
  const floaters: THREE.Object3D[] = [];
  const dotMat = new THREE.MeshBasicMaterial({ color: '#c5f4ee', transparent: true, opacity: 0.63 });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#2d6f72', transparent: true, opacity: 0.35 });
  const shardMat = new THREE.MeshBasicMaterial({ color: '#b9eee5', transparent: true, opacity: 0.72 });
  const dotGeometry = new THREE.CircleGeometry(0.045, 8);
  const ringGeometry = new THREE.RingGeometry(0.032, 0.045, 10);
  const shardGeometry = new THREE.CircleGeometry(0.045, 5);

  for (let i = 0; i < 58; i += 1) {
    const leftSide = i % 2 === 0;
    const x = (leftSide ? -1 : 1) * (2.12 + rand() * 3.75);
    const y = -3.25 + rand() * 6.65;
    const kind = i % 7;
    const geometry = kind === 0 ? ringGeometry : kind === 1 ? shardGeometry : dotGeometry;
    const material = kind === 0 ? ringMat : kind === 1 ? shardMat : dotMat;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 4);
    mesh.rotation.z = rand() * Math.PI;
    mesh.scale.setScalar(0.68 + rand() * 0.85);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    bitsRoot.add(mesh);
    floaters.push(mesh);
  }

  return floaters;
}

function createIntro(root: THREE.Group) {
  const planetRoot = new THREE.Group();
  planetRoot.position.set(0, 0.34, -1.2);
  planetRoot.scale.setScalar(0.83);
  root.add(planetRoot);

  createPlanet(planetRoot);

  const titleRoot = new THREE.Group();
  titleRoot.position.set(0, 0.46, 2.2);
  titleRoot.scale.setScalar(1.06);
  root.add(titleRoot);
  createTitle(titleRoot);

  return planetRoot;
}

function createPlanet(root: THREE.Group) {
  const water = makeBlobMesh('#9adfd7', 3.0, 0.21, 15, 0.56);
  water.position.set(0.05, -0.1, -1.1);
  water.scale.set(1.04, 0.95, 1);
  root.add(water);

  const landShadow = makeBlobMesh('#2c6062', 2.68, 0.26, 71, 0.48);
  landShadow.position.set(0.08, -0.12, -0.74);
  landShadow.scale.set(1.08, 0.98, 1);
  root.add(landShadow);

  const land = makeBlobMesh('#4f9f70', 2.58, 0.27, 41, 1);
  land.position.set(0, 0, -0.62);
  land.scale.set(1.05, 0.97, 1);
  root.add(land);

  const sand = makeBlobMesh('#d3c9a7', 2.26, 0.2, 99, 1);
  sand.position.set(0.08, 0.08, -0.5);
  sand.scale.set(0.96, 0.91, 1);
  root.add(sand);

  const roads = [
    box(0, 0.02, 0.02, 4.6, 0.28, 0.06, 0.58),
    box(0.1, -0.14, 0.03, 4.35, 0.24, 0.06, -0.55),
    box(-0.02, 0.05, 0.04, 0.28, 3.95, 0.06, 0.05),
    box(-1.28, -0.22, 0.05, 0.2, 2.8, 0.06, -0.35),
    box(1.35, 0.2, 0.06, 0.22, 2.9, 0.06, 0.28),
  ];
  addBoxInstances(root, roads, '#96b7ae', '#28474a');

  const placements = makePlanetPlacements();
  addBoxInstances(root, placements.buildingDark, '#516365', '#1e3638');
  addBoxInstances(root, placements.buildingLight, '#e6ece2', '#263f42');
  addBoxInstances(root, placements.buildingWarm, '#f0b8a4', '#263f42');
  addBoxInstances(root, placements.roofs, '#c65b48', '#263f42');
  addBoxInstances(root, placements.details, '#2c4a4d', '#20383b');
  addDiscInstances(root, placements.trees, '#35a866', '#1f6848', 0.11, 8);
  addDiscInstances(root, placements.treeDark, '#08704c', '#184f3c', 0.1, 8);
  addDiscInstances(root, placements.rocks, '#e0e5dc', '#526669', 0.095, 7);

  addFlatBox(root, box(-2.22, -0.04, 0.5, 0.82, 0.16, 0.08, -0.18), '#2f585b', '#1f383a');
  addFlatBox(root, box(2.35, 0.27, 0.5, 0.74, 0.15, 0.08, 0.72), '#ed8a55', '#653d37');
  addFlatBox(root, box(-1.84, -1.65, 0.5, 0.6, 0.24, 0.08, 0.18), '#f9fbef', '#263f42');
  addFlatBox(root, box(1.98, -1.48, 0.5, 0.46, 0.32, 0.08, -0.35), '#d7ddd6', '#263f42');
}

function createTitle(root: THREE.Group) {
  createTitleLine(root, 'MES', 1.22);
  createTitleLine(root, 'SEN', 0);
  createTitleLine(root, 'GER', -1.22);

  const cuts = [
    [-0.82, 1.47, 0.42, -0.02],
    [0.2, 1.56, 0.5, 0.01],
    [0.95, 1.25, 0.42, -0.02],
    [-0.78, 0.26, 0.44, 0.01],
    [0.14, 0.09, 0.52, -0.015],
    [0.96, -0.1, 0.38, 0.01],
    [-0.9, -1.06, 0.42, -0.015],
    [0.12, -1.24, 0.5, 0.015],
    [0.84, -1.42, 0.34, -0.015],
  ] as const;

  for (const [x, y, width, rotation] of cuts) {
    addFlatBox(root, box(x, y, 1.2, width, 0.045, 0.04, rotation), '#20383b', '#20383b', false);
  }
}

function createTitleLine(root: THREE.Group, text: string, y: number) {
  const geometry = new TextGeometry(text, {
    font: titleFont,
    size: 0.98,
    depth: 0.34,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.06,
    bevelSegments: 1,
  });
  geometry.computeBoundingBox();
  const box3 = geometry.boundingBox;
  if (box3) {
    const centerX = (box3.max.x + box3.min.x) / 2;
    const centerY = (box3.max.y + box3.min.y) / 2;
    geometry.translate(-centerX, -centerY, 0);
  }

  const front = new THREE.MeshToonMaterial({ color: '#edf5eb' });
  const side = new THREE.MeshToonMaterial({ color: '#aebbb2' });
  const inkMat = new THREE.MeshBasicMaterial({ color: ink });
  const sideInkMat = new THREE.MeshBasicMaterial({ color: '#40575b' });

  const outline = new THREE.Mesh(geometry.clone(), inkMat);
  outline.position.set(0, y - 0.02, -0.08);
  outline.scale.set(1.035, 1.035, 1);
  outline.matrixAutoUpdate = false;
  outline.updateMatrix();

  const sideShadow = new THREE.Mesh(geometry.clone(), sideInkMat);
  sideShadow.position.set(0.08, y - 0.08, -0.2);
  sideShadow.matrixAutoUpdate = false;
  sideShadow.updateMatrix();

  const face = new THREE.Mesh(geometry, [front, side]);
  face.position.set(0, y, 0.1);
  face.matrixAutoUpdate = false;
  face.updateMatrix();

  root.add(sideShadow, outline, face);
}

function createStory(
  root: THREE.Group,
  camera: THREE.PerspectiveCamera,
  onAreaTitleChange: (title: string) => void,
) {
  root.visible = false;

  const world = new THREE.Group();
  const playPlayer = new THREE.Group();
  const dialogPlayer = new THREE.Group();
  root.add(world, playPlayer, dialogPlayer);

  const streetArea = new THREE.Group();
  const cemeteryArea = new THREE.Group();
  const fallsArea = new THREE.Group();
  const cemeteryAnchor = { x: 8.55, z: -0.75 };
  const fallsAnchor = { x: -0.15, z: -14.2 };
  cemeteryArea.position.set(cemeteryAnchor.x, 0, cemeteryAnchor.z);
  fallsArea.position.set(fallsAnchor.x, 0, fallsAnchor.z);
  world.add(streetArea, cemeteryArea, fallsArea);
  createStartRoad3D(streetArea);
  createCemetery3D(cemeteryArea);
  createFalls3D(fallsArea);
  createWorldConnectors3D(world, cemeteryAnchor, fallsAnchor);
  const dialogRig = createCharacter(dialogPlayer, 'front');
  const playRig = createCharacter(playPlayer, 'front');
  playPlayer.visible = false;
  dialogPlayer.visible = true;

  let mode: ScreenMode = 'intro';
  let area: StoryArea = 'street';
  let mobileView = false;
  let x = 0;
  let z = 0;
  let targetX = 0;
  let targetZ = 0;
  let pointerX = 0;
  let pointerZ = 0;
  let pointerActive = false;
  let lastT = 0;
  let playerBob = 0;
  let yaw = Math.PI;
  let turnLean = 0;

  const applyAreaVisibility = () => {
    const showAllAreas = mode === 'play';
    streetArea.visible = showAllAreas || area === 'street';
    cemeteryArea.visible = showAllAreas || area === 'cemetery';
    fallsArea.visible = showAllAreas || area === 'falls';
  };

  const areaForPosition = (px: number, pz: number): StoryArea => {
    const inCemetery =
      px > cemeteryAnchor.x - 4.65 &&
      px < cemeteryAnchor.x + 4.6 &&
      pz > cemeteryAnchor.z - 3.45 &&
      pz < cemeteryAnchor.z + 3.05;
    if (inCemetery) return 'cemetery';
    if (pz < fallsAnchor.z + 3.15 && px > -5.45 && px < 4.95) return 'falls';
    return 'street';
  };

  const setArea = (next: StoryArea, resetPlayer = false, initialYaw = 0) => {
    area = next;
    applyAreaVisibility();
    onAreaTitleChange(
      next === 'cemetery' ? 'LUCERO\nGRAVEYARD' : next === 'falls' ? 'SMELLY\nFALLS' : '',
    );
    if (resetPlayer) {
      x = 0;
      z = 0;
      targetX = 0;
      targetZ = 0;
      yaw = initialYaw;
      turnLean = 0;
      playerBob = 0;
    }
  };
  setArea('street');

  const applyPlayPlayerScale = () => {
    playPlayer.scale.set(mobileView ? 0.48 : 0.6, mobileView ? 0.78 : 0.98, mobileView ? 0.54 : 0.68);
  };

  const sync = () => {
    playPlayer.position.set(x, playerBob, z);
    applyPlayPlayerScale();
    updateStoryCamera(mode, camera, x, z, yaw, turnLean, mobileView, area);
  };
  sync();

  return {
    setMode(next: ScreenMode) {
      mode = next;
      playPlayer.visible = next === 'play';
      dialogPlayer.visible = next === 'dialog';
      if (next === 'dialog') {
        setArea('street');
        x = 0;
        z = 0;
        targetX = 0;
        targetZ = 0;
        pointerX = 0;
        pointerZ = 0;
        pointerActive = false;
        playerBob = 0;
        yaw = Math.PI;
        turnLean = 0;
      }
      if (next === 'play') {
        setArea('street', true, Math.PI);
        targetX = x;
        targetZ = z;
        lastT = 0;
      }
      sync();
    },
    resize(mobile: boolean, next: ScreenMode) {
      mobileView = mobile;
      dialogPlayer.position.set(0, 0.02, mobile ? 0.9 : 0.78);
      dialogPlayer.userData.baseY = dialogPlayer.position.y;
      dialogPlayer.rotation.y = Math.PI;
      dialogPlayer.scale.setScalar(mobile ? 0.9 : 1.0);
      applyPlayPlayerScale();
      world.visible = next === 'dialog' || next === 'play';
      sync();
    },
    idle(t: number, next: ScreenMode) {
      if (next === 'dialog') {
        const baseY = typeof dialogPlayer.userData.baseY === 'number' ? dialogPlayer.userData.baseY : dialogPlayer.position.y;
        dialogPlayer.position.y = baseY + Math.sin(t * 1.4) * 0.012;
        dialogRig.setMotion(t, 0, 0);
        updateStoryCamera(next, camera, 0, 0, Math.PI, 0, mobileView, area);
      }
    },
    update(keys: Set<string>, t: number) {
      const dt = lastT === 0 ? 0.016 : Math.min(0.04, t - lastT);
      lastT = t;
      const beforeX = x;
      const beforeZ = z;
      let inputX = 0;
      let inputZ = 0;
      const right = keys.has('arrowright') || keys.has('d');
      const left = keys.has('arrowleft') || keys.has('a');
      const up = keys.has('arrowup') || keys.has('w');
      const down = keys.has('arrowdown') || keys.has('s');
      const keyboardX = (right ? 1 : 0) - (left ? 1 : 0);
      const keyboardZ = (down ? 1 : 0) - (up ? 1 : 0);
      const keyboardManual = keyboardX !== 0 || keyboardZ !== 0;
      const pointerManual = pointerActive && Math.hypot(pointerX, pointerZ) > 0.05;
      const dx = keyboardManual ? keyboardX : pointerManual ? pointerX : 0;
      const dz = keyboardManual ? keyboardZ : pointerManual ? pointerZ : 0;
      const manual = keyboardManual || pointerManual;
      if (manual) {
        const length = Math.max(1, Math.hypot(dx, dz));
        inputX = dx / length;
        inputZ = dz / length;
        x = Math.max(-5.7, Math.min(11.25, x + inputX * dt * 1.95));
        z = Math.max(-17.55, Math.min(2.45, z + inputZ * dt * 1.78));
        targetX = x;
        targetZ = z;
      } else {
        const tx = targetX - x;
        const tz = targetZ - z;
        const distance = Math.hypot(tx, tz);
        if (distance > 0.02) {
          const step = Math.min(distance, dt * 1.68);
          inputX = tx / distance;
          inputZ = tz / distance;
          x += inputX * step;
          z += inputZ * step;
        }
      }
      const moving = manual || Math.hypot(targetX - x, targetZ - z) > 0.02;
      const travelX = x - beforeX;
      const travelZ = z - beforeZ;
      if (moving && Math.hypot(inputX, inputZ) > 0.001) {
        const targetYaw = Math.atan2(inputX, inputZ);
        const delta = angleDelta(yaw, targetYaw);
        yaw += delta * Math.min(1, dt * 10.5);
        turnLean = Math.max(-1, Math.min(1, delta * 1.6));
      } else {
        turnLean += (0 - turnLean) * Math.min(1, dt * 7);
      }
      playPlayer.rotation.y = yaw;
      playerBob = Math.sin(t * 11) * (moving ? 0.028 : 0.006);
      const speed = moving ? Math.min(1, Math.hypot(travelX, travelZ) / Math.max(0.001, dt * 1.7)) : 0;
      playRig.setMotion(t, speed, turnLean);
      const nextArea = areaForPosition(x, z);
      if (nextArea !== area) setArea(nextArea);
      sync();
    },
    setPointerInput(nx: number, nz: number, active: boolean) {
      pointerX = nx;
      pointerZ = nz;
      pointerActive = active;
    },
  };
}

function createWorldConnectors3D(
  root: THREE.Group,
  cemeteryAnchor: { x: number; z: number },
  fallsAnchor: { x: number; z: number },
) {
  addGroundPoly3D(root, [[-1.45, -9.05], [1.38, -8.92], [1.24, -6.2], [-1.42, -6.34]], 0.012, '#6f8580', '#263f42');
  addGroundPoly3D(root, [[-4.25, -9.25], [-1.42, -9.05], [-1.42, -6.34], [-4.1, -6.42]], 0.018, '#c9c2a6', '#263f42');
  addGroundPoly3D(root, [[1.38, -8.92], [4.15, -9.16], [4.05, -6.1], [1.24, -6.2]], 0.018, '#70a461', '#263f42');
  addGroundPoly3D(root, [[-1.24, -12.05], [1.18, -12.0], [1.38, -8.92], [-1.45, -9.05]], 0.012, '#6f8580', '#263f42');
  addGroundPoly3D(root, [[-4.2, -12.15], [-1.24, -12.05], [-1.45, -9.05], [-4.25, -9.25]], 0.018, '#c9c2a6', '#263f42');
  addGroundPoly3D(root, [[1.18, -12.0], [4.05, -12.22], [4.15, -9.16], [1.38, -8.92]], 0.018, '#70a461', '#263f42');
  addRoadCurve3D(root, [[-1.08, -6.15], [-0.92, -7.05], [-0.82, -8.18], [-0.72, -9.18]], '#f4f1df', 0.028);
  addRoadCurve3D(root, [[1.05, -6.02], [1.0, -7.15], [0.86, -8.32], [0.78, -9.18]], '#f4f1df', 0.028);
  addRoadCurve3D(root, [[-0.72, -9.18], [-0.62, -10.0], [-0.52, -11.0], [-0.48, -12.05]], '#f4f1df', 0.028);
  addRoadCurve3D(root, [[0.78, -9.18], [0.72, -10.08], [0.66, -11.1], [0.58, -12.0]], '#f4f1df', 0.028);

  addGroundPoly3D(root, [[3.8, -2.62], [5.0, -2.8], [5.18, 1.72], [3.85, 1.6]], 0.018, '#c9c2a6', '#263f42');
  addGroundPoly3D(
    root,
    [[5.0, -2.8], [cemeteryAnchor.x - 3.85, cemeteryAnchor.z - 2.82], [cemeteryAnchor.x - 3.82, cemeteryAnchor.z + 2.0], [5.18, 1.72]],
    0.012,
    '#5a9f63',
    '#263f42',
  );
  addRoadCurve3D(root, [[3.72, 1.1], [4.52, 0.72], [5.02, 0.25], [5.38, -0.75]], '#f4f1df', 0.024);
  addRoadCurve3D(root, [[3.85, -1.92], [4.58, -1.58], [5.12, -1.05], [5.45, -0.22]], '#f4f1df', 0.024);

  createReferenceGuardrail3D(root, -2.25, 0.06, -7.1, -0.08);
  createReferenceGuardrail3D(root, 2.38, 0.06, -7.55, 0.08);
  createDenseTree3D(root, -3.38, 0.04, -8.02, 0.94);
  createDenseTree3D(root, 3.18, 0.04, -8.25, 0.82);
  createDenseTree3D(root, -3.08, 0.04, -10.68, 0.78);
  createDenseTree3D(root, 3.32, 0.04, -10.92, 0.92);
  createDenseTree3D(root, 4.95, 0.04, 1.5, 0.74);
  createGrassTufts3D(root, 3.25, 0.08, -7.18, 7);
  createGrassTufts3D(root, -3.02, 0.08, -7.92, 6);
  createGrassTufts3D(root, 2.78, 0.08, -10.3, 7);
  createGrassTufts3D(root, -2.82, 0.08, -10.7, 6);
  createRoadSign3D(root, 4.35, 0.05, -0.25, 0.22, '#d8d5c6', '#445052');
  createRockCluster3D(root, -2.72, 0.08, -9.05);
  createRockCluster3D(root, 2.78, 0.08, -9.0);
  addBox3D(root, cemeteryAnchor.x - 4.15, 0.28, cemeteryAnchor.z + 1.9, 0.18, 0.12, 0.96, '#a8b2a8', '#263f42', 0.12);
  addBox3D(root, cemeteryAnchor.x - 4.12, 0.66, cemeteryAnchor.z + 1.86, 0.12, 0.58, 0.12, '#53636a', '#263f42', 0.12);

  addGroundBlob3D(root, fallsAnchor.x - 1.9, 0.075, fallsAnchor.z + 2.88, 1.15, 0.52, '#b9b197', 1510, 0.72);
  addGroundBlob3D(root, fallsAnchor.x + 2.1, 0.075, fallsAnchor.z + 2.55, 0.92, 0.42, '#d8cfad', 1511, 0.7);
}

function updateStoryCamera(
  mode: ScreenMode,
  camera: THREE.PerspectiveCamera,
  x: number,
  z: number,
  yaw: number,
  turnLean: number,
  mobile: boolean,
  area: StoryArea,
) {
  if (mode === 'dialog') {
    camera.position.set(mobile ? 0 : 0.05, mobile ? 1.85 : 2.05, mobile ? 4.7 : 5.45);
    camera.lookAt(0, 1.0, -0.25);
    return;
  }

  const areaOffset = area === 'cemetery' ? -0.12 : area === 'falls' ? 0.12 : 0;
  const lateralFollow = area === 'street' ? 0.7 : 0.96;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const behindX = -forwardX;
  const behindZ = -forwardZ;
  const orbitAmount = area === 'street' ? 0.5 : 0.45;
  const deepStreet = area === 'street' ? Math.max(0, Math.min(1, (-z - 4.9) / 4.6)) : 0;
  const camX =
    x * lateralFollow +
    behindX * (mobile ? 1.05 : 1.24) * orbitAmount +
    turnLean * 0.16 +
    areaOffset;
  const camY =
    area === 'street'
      ? (mobile ? 2.42 : 2.48) - deepStreet * (mobile ? 0.3 : 0.34)
      : mobile ? 2.26 : 2.42;
  const camZ =
    z +
    (area === 'street'
      ? (mobile ? 4.92 : 4.68) -
        deepStreet * (mobile ? 2.35 : 2.7) +
        behindZ * ((mobile ? 0.92 : 1.02) - deepStreet * (mobile ? 0.42 : 0.55))
      : (mobile ? 4.25 : 4.45) + behindZ * (mobile ? 1.05 : 1.18));
  const target = new THREE.Vector3(
    x * lateralFollow + forwardX * (area === 'street' ? 0.7 : 0.15),
    area === 'street' ? (mobile ? 0.78 : 0.86) : mobile ? 0.68 : 0.72,
    z + forwardZ * (area === 'street' ? 1.9 - deepStreet * 0.96 : 1.05),
  );
  camera.position.lerp(new THREE.Vector3(camX, camY, camZ), area === 'street' ? 0.34 : 0.58);
  camera.lookAt(target);
}

function createStartRoad3D(root: THREE.Group) {
  const sky = new THREE.Group();
  sky.position.set(0, 0, -7.8);
  root.add(sky);
  addSkyBlob(sky, [[-7, 1.0], [-4.7, 1.45], [-2.2, 0.95], [0.4, 1.55], [2.6, 1.1], [7, 1.5], [7, 4.8], [-7, 4.8]], '#aeece2', '#6fb8b0');
  addSkyBlob(sky, [[-7, 0.08], [-4.1, 0.52], [-1.2, 0.2], [1.8, 0.58], [7, 0.18], [7, 1.05], [-7, 1.05]], '#68c9c2', '#408180');
  createPaintedBackdrop3D(sky, 'street');

  addGroundPoly3D(root, [[-4.5, -3.5], [-1.65, -3.5], [-2.6, 2.8], [-4.5, 2.8]], 0.02, '#c9c2a6', '#263f42');
  addGroundPoly3D(root, [[1.35, -3.4], [5.95, -3.1], [5.95, 2.7], [2.1, 2.7]], 0.02, '#7ea864', '#263f42');
  addGroundPoly3D(root, [[-1.85, -3.55], [1.75, -3.45], [2.65, 2.6], [-2.45, 2.75]], 0.01, '#6f8580', '#263f42');
  addGroundPoly3D(root, [[-0.42, -3.45], [1.95, -3.25], [2.65, -2.2], [0.25, -2.15]], 0.04, '#c9c0a5', '#263f42');
  addGroundPoly3D(root, [[-1.35, -6.55], [1.18, -6.42], [1.75, -3.28], [-1.85, -3.48]], 0.01, '#6f8580', '#263f42');
  addGroundPoly3D(root, [[-4.15, -6.4], [-1.34, -6.55], [-1.85, -3.48], [-4.5, -3.5]], 0.02, '#c9c2a6', '#263f42');
  addGroundPoly3D(root, [[1.18, -6.42], [5.35, -6.05], [5.95, -3.1], [1.75, -3.28]], 0.02, '#7ea864', '#263f42');
  createStartRoadPaint3D(root);

  addRoadCurve3D(root, [[-1.18, 2.1], [-0.95, 0.95], [-0.65, -0.2], [-0.78, -1.3], [-1.18, -2.8]], '#f4f1df', 0.032);
  addRoadCurve3D(root, [[1.18, 1.8], [1.0, 0.65], [0.84, -0.65], [1.04, -1.8], [1.44, -2.95]], '#f4f1df', 0.032);
  addRoadCurve3D(root, [[2.08, 1.15], [1.82, 0.18], [1.68, -0.9], [1.92, -2.0]], '#a9b4ab', 0.02);
  addRoadCurve3D(root, [[-1.18, -2.8], [-1.08, -3.6], [-1.0, -4.65], [-1.06, -5.8], [-1.18, -6.42]], '#f4f1df', 0.032);
  addRoadCurve3D(root, [[1.44, -2.95], [1.28, -3.75], [1.12, -4.8], [1.16, -5.72], [1.25, -6.28]], '#f4f1df', 0.032);

  addCylinder3D(root, -2.62, 1.64, -0.42, 0.16, 3.25, '#69766e', '#263f42', 10, 0.02);
  addCylinder3D(root, -2.38, 1.4, -0.56, 0.06, 2.4, '#56635f', '#263f42', 8, 0.03);
  addBox3D(root, -2.84, 3.28, -0.34, 0.72, 0.72, 0.2, '#d8d2bd', '#263f42', -0.16);
  addBox3D(root, -2.84, 3.28, -0.22, 0.45, 0.46, 0.08, '#f5cf55', '#8f6431', -0.16);
  addCone3D(root, -2.97, 3.3, -0.14, 0.12, 0.26, '#c8524f', '#8f3434');

  addBox3D(root, -3.1, 0.78, 0.92, 0.78, 1.45, 0.72, '#8d988c', '#263f42', -0.1);
  addBox3D(root, -2.62, 0.62, 1.18, 0.72, 1.16, 0.62, '#818d82', '#263f42', -0.08);
  for (let i = 0; i < 3; i += 1) {
    addBox3D(root, -2.38, 0.78 + i * 0.2, 1.52, 0.06, 0.04, 0.38, '#53636a', '#53636a', -0.08);
  }
  addCylinder3D(root, -2.84, 0.62, -0.05, 0.04, 1.12, '#7b8880', '#263f42', 8);
  addCylinder3D(root, -2.84, 1.2, 0.02, 0.22, 0.04, '#d9d1bd', '#a65c34', 20, Math.PI / 2, 1.05, 0.32);

  createReferenceGuardrail3D(root, 2.25, 0.2, -0.35, -0.2);
  createReferenceGuardrail3D(root, 2.65, 0.1, -1.55, -0.18);
  createDenseTree3D(root, -3.35, 0.03, -0.95, 0.82);
  createDenseTree3D(root, 2.8, 0.03, -1.22, 0.96);
  createDenseTree3D(root, 2.28, 0.03, -2.05, 0.72);
  createDistantTreeLine3D(root, -2.82, -1.9, 5);
  createDistantTreeLine3D(root, -2.95, 1.25, 4);
  createRockCluster3D(root, 2.1, 0.08, 1.35);
  createGrassTufts3D(root, 2.85, 0.08, 0.6, 7);
  createRoadSign3D(root, -1.55, 0.04, -2.05, 0.05, '#d8d5c6', '#445052');
  createStreetFrame3D(root);
  createStartStreetLandmarks3D(root);
  createHarborPocket3D(root);
  createReferenceHarborAlley3D(root);
  createReferenceModelLayer3D(root);
}

function createHarborPocket3D(root: THREE.Group) {
  const dock = new THREE.Group();
  dock.position.set(-0.65, 0, -9.35);
  dock.rotation.y = -0.04;
  dock.scale.setScalar(0.84);
  root.add(dock);

  addGroundPoly3D(dock, [[-3.8, -0.25], [-0.75, -0.5], [-0.35, 1.28], [-3.65, 1.62]], 0.12, '#8b897d', '#263f42');
  addGroundPoly3D(dock, [[1.1, -0.4], [3.7, -0.22], [3.9, 1.42], [1.05, 1.2]], 0.1, '#c3b99d', '#263f42');
  addGroundBlob3D(dock, -1.1, 0.14, 0.56, 0.88, 0.34, '#b1aa94', 1250, 0.62);
  addGroundBlob3D(dock, 2.05, 0.13, 0.26, 0.72, 0.28, '#dfd6b8', 1251, 0.7);

  createFishingBoat3D(dock, -3.45, 0.12, -0.08, 0.1);
  createDockWorker3D(dock, -3.12, 0.15, 0.75, 0.18);
  createCrateStack3D(dock, -1.15, 0.14, 0.75, -0.05);
  createCrateStack3D(dock, -0.35, 0.14, 0.52, 0.08, 0.82);
  createCrateStack3D(dock, 1.85, 0.12, 0.72, 0.12, 0.72);
  addCone3D(dock, 2.9, 0.13, 0.82, 0.17, 0.46, '#f08a42', '#263f42');

  for (let i = 0; i < 5; i += 1) {
    const z = -0.16 + i * 0.36;
    addCylinder3D(dock, 3.18, 0.5, z, 0.032, 0.76, '#68736f', '#263f42', 8);
    addBox3D(dock, 3.2, 0.78, z + 0.14, 0.12, 0.08, 0.56, '#bdc6bc', '#263f42', 0.02);
    addBox3D(dock, 3.18, 0.58, z + 0.12, 0.1, 0.06, 0.5, '#6c7773', '#263f42', 0.02);
  }
}

function createReferenceHarborAlley3D(root: THREE.Group) {
  addGroundPoly3D(root, [[-1.18, -4.85], [1.0, -4.7], [1.78, 1.95], [-1.7, 2.08]], 0.09, '#748985', '#263f42');
  addGroundPoly3D(root, [[-4.45, -4.55], [-1.18, -4.85], [-1.7, 2.08], [-4.55, 2.32]], 0.1, '#a49d91', '#263f42');
  addGroundPoly3D(root, [[1.0, -4.7], [4.78, -4.36], [4.9, 2.2], [1.78, 1.95]], 0.1, '#aea796', '#263f42');
  addRoadCurve3D(root, [[-0.94, 1.52], [-0.78, 0.4], [-0.54, -1.24], [-0.35, -3.78]], '#f0f1e2', 0.026);
  addRoadCurve3D(root, [[0.82, 1.35], [0.74, 0.18], [0.58, -1.48], [0.36, -3.82]], '#f0f1e2', 0.026);

  const bridge = new THREE.Group();
  bridge.position.set(0.08, 3.28, -3.85);
  bridge.rotation.y = -0.16;
  root.add(bridge);
  addBox3D(bridge, 0, 0, 0, 5.8, 0.18, 0.48, '#6b807f', '#263f42', 0);
  addBox3D(bridge, 0, -0.28, 0.12, 5.7, 0.12, 0.2, '#536868', '#263f42', 0);
  for (let i = 0; i < 9; i += 1) {
    addBox3D(bridge, -2.45 + i * 0.62, 0.15, 0.25, 0.08, 0.58, 0.08, '#405458', '#263f42');
  }
  addBox3D(root, -2.7, 1.66, -3.25, 0.18, 3.32, 0.22, '#607371', '#263f42', -0.03);
  addBox3D(root, 2.42, 1.6, -3.2, 0.16, 3.2, 0.22, '#607371', '#263f42', 0.03);

  const rightShip = new THREE.Group();
  rightShip.position.set(4.45, 0.02, 0.7);
  rightShip.rotation.y = -0.28;
  rightShip.scale.set(1.14, 1.18, 1.1);
  root.add(rightShip);
  addPartSphere(rightShip, 0.02, 1.52, 0, 1.9, 0.78, 1.08, '#f5f3e5', '#263f42');
  addBox3D(rightShip, -0.12, 1.7, 0.02, 3.6, 0.92, 1.25, '#f5f3e5', '#263f42', 0.02);
  addBox3D(rightShip, -0.12, 1.03, 0.04, 3.72, 0.74, 1.32, '#1b9fb4', '#263f42', 0.02);
  addBox3D(rightShip, -1.32, 2.25, -0.05, 0.86, 0.58, 0.76, '#e9ead8', '#263f42', -0.03);
  addBox3D(rightShip, -1.32, 2.32, 0.36, 0.52, 0.26, 0.08, '#263f42', '#263f42', -0.03);
  addCylinderRotated3D(rightShip, -1.78, 2.38, -0.48, 0.035, 0.94, '#53615e', '#263f42', 8, 0.48, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    addBox3D(rightShip, -0.48 + i * 0.38, 1.7, 0.72, 0.22, 0.5, 0.08, '#263f42', '#263f42', 0.02);
  }

  const leftShip = new THREE.Group();
  leftShip.position.set(-3.98, 0.0, -0.82);
  leftShip.rotation.y = 0.14;
  leftShip.scale.set(0.84, 0.84, 0.84);
  root.add(leftShip);
  addBox3D(leftShip, 0, 1.3, 0, 2.6, 0.72, 0.78, '#dedccb', '#263f42', 0);
  addBox3D(leftShip, 0, 0.83, 0.02, 2.72, 0.5, 0.82, '#7f8b85', '#263f42', 0);
  addBox3D(leftShip, -0.78, 1.86, -0.02, 0.84, 0.48, 0.56, '#ecebdd', '#263f42', 0);

  const npc = new THREE.Group();
  npc.position.set(-0.18, 0.12, -4.05);
  npc.rotation.y = Math.PI;
  npc.scale.setScalar(0.38);
  root.add(npc);
  createCharacter(npc, 'npc');

  createDockWorker3D(root, 2.26, 0.13, -0.15, -0.52);
  createCrateStack3D(root, -2.58, 0.12, 0.58, -0.04, 0.82);
  createCrateStack3D(root, 2.42, 0.12, 0.9, 0.14, 0.68);
  addBox3D(root, 2.38, 0.36, -0.62, 0.64, 0.72, 0.58, '#73806f', '#263f42', -0.16);
  addCylinder3D(root, 2.1, 0.9, -0.3, 0.04, 1.6, '#596662', '#263f42', 8);
  addCylinder3D(root, -2.22, 0.92, -0.62, 0.04, 1.7, '#596662', '#263f42', 8);
  createReferenceGuardrail3D(root, -2.88, 0.08, -1.9, -0.08);
  createReferenceGuardrail3D(root, 2.88, 0.08, -1.6, 0.14);
  createRoadMirror3D(root, 1.92, 0.08, -1.06, -0.06);
}

function createStreetFrame3D(root: THREE.Group) {
  addBox3D(root, -4.18, 1.82, -1.22, 0.92, 3.64, 3.95, '#8d9184', '#263f42', -0.08);
  addBox3D(root, -3.74, 3.64, -1.42, 0.74, 0.16, 3.5, '#56635f', '#263f42', -0.08);
  addBox3D(root, -3.72, 2.68, -0.28, 0.08, 0.86, 0.58, '#dfe5dc', '#53636a', -0.08);
  addBox3D(root, -3.72, 1.62, -1.1, 0.08, 0.72, 0.52, '#dfe5dc', '#53636a', -0.08);
  addBox3D(root, -3.72, 0.68, -1.9, 0.08, 0.58, 0.46, '#dfe5dc', '#53636a', -0.08);

  addBox3D(root, 4.68, 1.96, -1.46, 1.02, 3.92, 4.35, '#93978d', '#263f42', 0.08);
  addBox3D(root, 4.14, 2.62, -0.1, 0.12, 1.15, 0.72, '#dce4d8', '#53636a', 0.08);
  addBox3D(root, 4.12, 1.34, -1.1, 0.12, 0.96, 0.62, '#dce4d8', '#53636a', 0.08);
  addBox3D(root, 4.1, 0.56, -2.1, 0.12, 0.46, 0.58, '#dce4d8', '#53636a', 0.08);
  for (let i = 0; i < 5; i += 1) {
    addBox3D(root, 4.02, 3.18 - i * 0.48, -1.55 + i * 0.08, 0.1, 0.07, 2.2, '#5f6b69', '#263f42', 0.08);
  }

  const bridge = new THREE.Group();
  bridge.position.set(0.06, 2.82, -9.75);
  bridge.rotation.y = 0.03;
  bridge.scale.set(0.86, 0.86, 0.86);
  root.add(bridge);
  addBox3D(bridge, 0, 0, 0, 5.25, 0.16, 0.36, '#74c7b8', '#263f42');
  addBox3D(bridge, 0, -0.22, 0.04, 5.2, 0.08, 0.18, '#4f8c81', '#263f42');
  for (let i = 0; i < 10; i += 1) {
    addBox3D(bridge, -2.35 + i * 0.52, -0.04, 0.22, 0.06, 0.28, 0.06, '#4b6864', '#263f42');
  }
}

function createStartStreetLandmarks3D(root: THREE.Group) {
  createDetailedVendingMachine3D(root, -3.12, 0.02, 0.32, 0.04);
  createUtilityCabinets3D(root, 5.72, 0.02, 0.72, -0.12);
  createBulletinBoard3D(root, 3.74, 0.12, -0.12, 0.02);
  createRoadMirror3D(root, -2.42, 0.02, -0.72, 0.02);
  addCone3D(root, 2.86, 0.04, 1.42, 0.16, 0.44, '#f08a42', '#263f42');
  addCylinder3D(root, 3.0, 0.54, 1.22, 0.04, 1.08, '#d99d36', '#263f42', 8);
  addBox3D(root, 2.95, 0.16, 0.12, 0.28, 0.12, 1.12, '#e7ece4', '#263f42', 0.16);
}

function createFishingBoat3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const boat = new THREE.Group();
  boat.position.set(x, y, z);
  boat.rotation.y = yaw;
  boat.scale.setScalar(1.05);
  root.add(boat);

  addPartSphere(boat, 0, 1.0, 0, 1.42, 0.42, 0.42, '#1998ad', '#263f42');
  addBox3D(boat, 0, 1.2, 0.06, 2.72, 0.52, 0.56, '#1d9bb0', '#263f42', 0);
  addBox3D(boat, 0, 1.54, 0.1, 2.9, 0.28, 0.62, '#f3f4e8', '#263f42', 0);
  addBox3D(boat, 0.36, 1.96, -0.02, 1.04, 0.56, 0.52, '#f7f8ec', '#263f42', 0);
  addBox3D(boat, 0.34, 2.04, 0.28, 0.76, 0.24, 0.08, '#153f50', '#263f42', 0);
  addBox3D(boat, 0.86, 1.86, 0.26, 0.22, 0.22, 0.08, '#153f50', '#263f42', 0);
  addBox3D(boat, -0.95, 1.78, 0.34, 0.52, 0.08, 0.08, '#263f42', '#263f42', 0);
  addBox3D(boat, 1.22, 1.78, 0.34, 0.58, 0.08, 0.08, '#263f42', '#263f42', 0);
  for (let i = 0; i < 5; i += 1) {
    addCylinder3D(boat, -1.18 + i * 0.58, 1.92, 0.28, 0.018, 0.44, '#263f42', '#263f42', 6);
  }
  addCylinderRotated3D(boat, 1.18, 2.22, -0.18, 0.035, 0.9, '#596662', '#263f42', 8, 0.45, 0, 0);
  addCylinderRotated3D(boat, 1.55, 1.92, -0.34, 0.028, 0.72, '#596662', '#263f42', 8, 0.9, 0, 0);
}

function createDockWorker3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const worker = new THREE.Group();
  worker.position.set(x, y, z);
  worker.rotation.y = yaw;
  worker.scale.setScalar(0.62);
  root.add(worker);

  addPartBox(worker, 0, 0.68, 0, 0.48, 0.58, 0.28, '#d7d0b8', '#263f42', -0.12);
  addPartSphere(worker, 0, 1.14, 0.08, 0.23, 0.22, 0.22, '#d3a592', '#263f42');
  addPartBox(worker, -0.04, 1.26, 0.06, 0.46, 0.12, 0.16, '#2f343a', '#151c22', -0.08);
  addPartBox(worker, -0.35, 0.55, 0.02, 0.14, 0.42, 0.14, '#d3a592', '#8f6762', 0.38);
  addPartBox(worker, 0.35, 0.52, 0.02, 0.14, 0.46, 0.14, '#d3a592', '#8f6762', -0.35);
  addPartBox(worker, -0.18, 0.2, 0.02, 0.18, 0.48, 0.18, '#1f2d31', '#14292b', -0.5);
  addPartBox(worker, 0.2, 0.18, 0.02, 0.18, 0.5, 0.18, '#1f2d31', '#14292b', 0.5);
  addPartBox(worker, -0.06, 0.24, 0.34, 0.62, 0.24, 0.28, '#6a766d', '#263f42', 0.04);
}

function createCrateStack3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale = 1,
) {
  const stack = new THREE.Group();
  stack.position.set(x, y, z);
  stack.rotation.y = yaw;
  stack.scale.setScalar(scale);
  root.add(stack);

  const colors = ['#c7bca2', '#9f9585', '#d8cfb7', '#6c7470'];
  const crates = [
    [-0.22, 0.14, 0, 0.42, 0.28, 0.34],
    [0.22, 0.16, 0.02, 0.38, 0.32, 0.32],
    [0, 0.46, 0.04, 0.48, 0.28, 0.36],
    [-0.34, 0.48, -0.24, 0.28, 0.3, 0.3],
  ] as const;
  crates.forEach(([cx, cy, cz, w, h, d], index) => {
    addBox3D(stack, cx, cy, cz, w, h, d, colors[index % colors.length], '#263f42', index % 2 ? 0.08 : -0.06);
    addBox3D(stack, cx, cy + h * 0.12, cz + d * 0.52, w * 0.72, 0.025, 0.035, '#53636a', '#53636a', index % 2 ? 0.08 : -0.06);
  });
}

function createStartRoadPaint3D(root: THREE.Group) {
  addGroundBlob3D(root, -2.72, 0.055, -0.18, 0.72, 0.42, '#b7b098', 901, 0.78);
  addGroundBlob3D(root, -2.38, 0.056, 0.62, 0.58, 0.34, '#9fa89d', 902, 0.54);
  addGroundBlob3D(root, 2.78, 0.055, -0.8, 0.9, 0.62, '#5d9a59', 903, 0.58);
  addGroundBlob3D(root, 3.18, 0.056, 0.18, 0.56, 0.38, '#3f8650', 904, 0.44);
  addGroundBlob3D(root, -0.28, 0.052, -1.55, 0.64, 0.32, '#5d7470', 905, 0.45);
  addGroundBlob3D(root, 0.92, 0.052, -0.62, 0.7, 0.28, '#82928a', 906, 0.36);
  addGroundCurve3D(root, [[-3.4, 0.92], [-2.82, 0.36], [-2.52, -0.35], [-2.8, -1.25]], '#61716b', 0.012, 0.16);
  addGroundCurve3D(root, [[2.25, 0.42], [2.62, -0.15], [2.98, -0.86], [3.3, -1.6]], '#2e6a4b', 0.012, 0.18);
  addGroundCurve3D(root, [[-1.95, 1.8], [-1.55, 0.7], [-1.62, -0.6], [-1.95, -1.8]], '#4f6864', 0.01, 0.18);
}

function createReferenceGuardrail3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const rail = new THREE.Group();
  rail.position.set(x, y, z);
  rail.rotation.y = yaw;
  root.add(rail);
  for (let i = 0; i < 4; i += 1) {
    addCylinder3D(rail, i * 0.46, 0.34, -i * 0.38, 0.045, 0.68, '#6b7773', '#263f42', 8);
  }
  addBox3D(rail, 0.72, 0.58, -0.58, 1.82, 0.18, 0.18, '#c4c9bc', '#263f42', 0.05);
  addBox3D(rail, 0.72, 0.38, -0.58, 1.76, 0.08, 0.14, '#77817c', '#263f42', 0.05);
}

function createPaintedBackdrop3D(root: THREE.Group, variant: StoryArea) {
  const cloudPalette =
    variant === 'falls'
      ? ['#cff7ef', '#9ee4dd', '#e9fff7']
      : variant === 'cemetery'
        ? ['#c8f0e7', '#94ddd4', '#e2fff7']
        : ['#c8f3eb', '#9be3dc', '#e8fff6'];
  const cloudSpecs = [
    [-5.8, 3.05, 0.62, 2.25, 0.42, 341],
    [-3.35, 2.48, 0.42, 1.72, 0.32, 412],
    [-0.55, 2.98, 0.58, 2.08, 0.4, 129],
    [2.05, 2.45, 0.46, 1.86, 0.34, 222],
    [4.8, 3.08, 0.54, 2.0, 0.38, 541],
  ] as const;
  cloudSpecs.forEach(([x, y, r, sx, sy, seed], index) => {
    const cloud = makeBlobMesh(cloudPalette[index % cloudPalette.length], r, 0.32, seed, 0.72);
    cloud.position.set(x, y, 0.12 + index * 0.012);
    cloud.scale.set(sx, sy, 1);
    cloud.rotation.z = (index % 2 ? -0.04 : 0.03);
    root.add(cloud);
  });

  const ridgeColor = variant === 'cemetery' ? '#4f9a60' : variant === 'falls' ? '#62ad67' : '#79aa70';
  const farRidge = variant === 'falls' ? '#6bc2b7' : '#65bfb6';
  addSkyBlob(root, [[-7, 0.22], [-5.6, 0.54], [-4.2, 0.36], [-2.2, 0.68], [-0.4, 0.34], [1.6, 0.68], [3.1, 0.42], [5.2, 0.7], [7, 0.46], [7, -0.08], [-7, -0.08]], farRidge, '#408180');
  addSkyBlob(root, [[-7, -0.06], [-6.0, 0.16], [-4.8, -0.02], [-3.5, 0.24], [-2.0, 0.02], [-0.8, 0.22], [0.7, -0.02], [2.0, 0.2], [3.7, 0.02], [5.2, 0.22], [7, 0.04], [7, -0.38], [-7, -0.38]], ridgeColor, '#2f665e');

  for (let i = 0; i < 18; i += 1) {
    const x = -6.4 + i * 0.76;
    const y = -0.04 + Math.sin(i * 1.7) * 0.06;
    const tree = makeBlobMesh(i % 3 ? '#357b4d' : '#4d9b5f', 0.18 + (i % 4) * 0.025, 0.34, 700 + i, 0.82);
    tree.position.set(x, y, 0.42 + i * 0.002);
    tree.scale.set(0.8, 1.28 + (i % 2) * 0.3, 1);
    root.add(tree);
  }

  const strokeSets: Vec2[][] =
    variant === 'falls'
      ? [
          [[-5.9, 1.72], [-4.6, 1.48], [-3.5, 1.6], [-2.5, 1.42]],
          [[1.4, 1.78], [2.5, 1.52], [3.7, 1.7], [5.2, 1.45]],
        ]
      : [
          [[-6.2, 1.68], [-4.8, 1.46], [-3.1, 1.58], [-1.8, 1.42]],
          [[0.8, 1.62], [2.3, 1.46], [3.7, 1.56], [5.7, 1.38]],
        ];
  strokeSets.forEach((points) => addBackdropStroke3D(root, points, '#2f6f70', 0.3));
  createBackdropCloudCuts3D(root, variant);
}

function createBackdropCloudCuts3D(root: THREE.Group, variant: StoryArea) {
  const color = variant === 'falls' ? '#dcfff4' : '#d5f7ef';
  const shadow = variant === 'cemetery' ? '#72c6bd' : '#7bd1c8';
  const masses = [
    [-5.2, 1.98, 0.42, 3.15, 0.48, 1140, shadow],
    [-4.8, 2.08, 0.34, 2.35, 0.34, 1141, color],
    [2.85, 1.88, 0.48, 3.4, 0.5, 1142, color],
    [3.35, 1.78, 0.38, 2.65, 0.34, 1143, shadow],
  ] as const;
  masses.forEach(([x, y, r, sx, sy, seed, fill], index) => {
    const cloud = makeBlobMesh(fill, r, 0.36, seed, index % 2 ? 0.58 : 0.46);
    cloud.position.set(x, y, 0.62 + index * 0.015);
    cloud.scale.set(sx, sy, 1);
    cloud.rotation.z = index % 2 ? -0.03 : 0.035;
    root.add(cloud);
  });
}

function addBackdropStroke3D(root: THREE.Group, points: Vec2[], color: string, opacity: number) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0.52))),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  line.castShadow = false;
  line.receiveShadow = false;
  root.add(line);
}

function createDistantTreeLine3D(root: THREE.Group, z: number, centerX: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    const x = centerX + (i - count / 2) * 0.42;
    const scale = 0.32 + (i % 3) * 0.08;
    const tree = new THREE.Group();
    tree.position.set(x, 0.04, z - (i % 2) * 0.14);
    tree.scale.setScalar(scale);
    root.add(tree);
    addCylinder3D(tree, 0, 0.32, 0, 0.055, 0.64, '#5d5947', '#263f42', 7);
    addPartSphere(tree, 0, 0.8, 0, 0.34, 0.24, 0.26, i % 2 ? '#4fa260' : '#3e8a55', '#263f42');
    addPartSphere(tree, -0.18, 0.68, 0.04, 0.24, 0.18, 0.2, '#2f7548', '#263f42');
  }
}

function createStreet3D(root: THREE.Group) {
  const sky = new THREE.Group();
  sky.position.set(0, 0, -11.8);
  root.add(sky);
  addSkyBlob(sky, [[-7, 1.15], [-4.6, 1.55], [-2.8, 1.2], [-0.5, 1.45], [2.4, 1.18], [7, 1.5], [7, 4.7], [-7, 4.7]], '#9ce1d8', '#67aaa6');
  addSkyBlob(sky, [[-7, 0.28], [-4.5, 0.68], [-1.7, 0.4], [0.8, 0.7], [3.4, 0.36], [7, 0.56], [7, 1.22], [-7, 1.22]], '#65c7c0', '#408180');
  for (let i = 0; i < 7; i += 1) {
    const cloud = makeBlobMesh(i % 2 ? '#d6f2ee' : '#bfece6', 0.48, 0.28, 300 + i, 0.82);
    cloud.position.set(-5.2 + i * 1.7, 2.25 + (i % 3) * 0.22, 0.05);
    cloud.scale.set(1.7, 0.34, 1);
    sky.add(cloud);
  }

  addGroundPoly3D(root, [[-1.35, -11.2], [1.25, -11.2], [3.25, 3.1], [-3.25, 3.1]], 0, '#708783', '#263f42');
  addGroundPoly3D(root, [[-4.8, -10.8], [-1.36, -11.2], [-3.25, 3.1], [-6.4, 3.2]], 0.02, '#c8c4a9', '#263f42');
  addGroundPoly3D(root, [[1.26, -11.2], [4.8, -10.8], [6.4, 3.2], [3.25, 3.1]], 0.02, '#c9c5ac', '#263f42');

  createLeft3D(root);
  createRight3D(root);
  createSceneDepthDetails3D(root);
  createStreetProps3D(root);
  createReferenceModelLayer3D(root);
}

function createCemetery3D(root: THREE.Group) {
  const sky = new THREE.Group();
  sky.position.set(0, 0, -7.2);
  root.add(sky);
  addSkyBlob(sky, [[-7, 0.5], [-5.2, 1.2], [-2.2, 0.8], [0.9, 1.15], [3.4, 0.62], [7, 1.1], [7, 4.8], [-7, 4.8]], '#a6e8dc', '#6fb8b0');
  addSkyBlob(sky, [[-7, -0.15], [-4.3, 0.36], [-1.1, 0.05], [1.7, 0.44], [7, 0.18], [7, 0.9], [-7, 0.9]], '#67c8c1', '#408180');
  createPaintedBackdrop3D(sky, 'cemetery');

  addGroundPoly3D(root, [[-4.5, -3.4], [4.6, -3.2], [4.4, 2.6], [-4.6, 2.7]], 0, '#4e9a5e', '#263f42');
  addGroundPoly3D(root, [[-4.4, 1.1], [4.5, 0.85], [4.5, 1.82], [-4.4, 2.1]], 0.018, '#c8c0a2', '#263f42');
  addRoadCurve3D(root, [[-3.2, 1.3], [-1.4, 0.8], [-0.3, 0.1], [0.8, -0.8], [2.4, -2.4]], '#f5f2df', 0.026);
  addRoadCurve3D(root, [[2.8, 1.2], [1.8, 0.25], [0.9, -0.7], [0.3, -1.7], [-0.4, -2.9]], '#f5f2df', 0.026);
  createCemeteryGroundPaint3D(root);

  addBox3D(root, -0.4, 1.45, -2.78, 7.3, 2.65, 0.34, '#96998e', '#263f42', -0.02);
  for (let i = 0; i < 4; i += 1) {
    addBox3D(root, -0.5, 0.65 + i * 0.48, -2.55, 7.0, 0.08, 0.22, '#626b68', '#263f42', -0.02);
  }
  addBox3D(root, -3.85, 1.35, -2.0, 0.5, 2.65, 0.34, '#d5d1ba', '#263f42', 0.22);
  addBox3D(root, 3.65, 1.28, -2.3, 0.42, 2.35, 0.34, '#d5d1ba', '#263f42', -0.2);
  createCemeteryWallDetail3D(root);

  const graves = [
    [-2.7, 0.18, 0.75, 0.86, 'round'],
    [-1.75, 0.18, 0.2, 0.72, 'slab'],
    [-0.65, 0.18, 0.5, 0.84, 'round'],
    [0.5, 0.18, 0.05, 0.9, 'slab'],
    [1.52, 0.18, 0.66, 0.78, 'coin'],
    [2.62, 0.18, -0.04, 0.94, 'slab'],
    [-2.3, 0.18, -0.9, 0.72, 'coin'],
    [-1.12, 0.18, -1.2, 0.94, 'slab'],
    [0.05, 0.18, -1.45, 0.78, 'round'],
    [1.28, 0.18, -1.22, 0.86, 'coin'],
    [2.42, 0.18, -1.72, 0.74, 'slab'],
  ] as const;
  graves.forEach(([x, y, z, scale, variant], index) => {
    createGravestone3D(root, x, y, z, scale, variant, index % 2 ? -0.16 : 0.14);
  });
  createCemeterySketchDetails3D(root);

  createCemeteryVines3D(root, -3.25, -2.42, 0.9);
  createCemeteryVines3D(root, -1.25, -2.38, 0.82);
  createCemeteryVines3D(root, 1.58, -2.46, 0.78);
  createDenseTree3D(root, 3.05, 0.02, -2.55, 1.25);
  createDenseTree3D(root, -3.1, 0.02, -1.4, 0.78);
  createCemeteryIvyColumns3D(root);
  createCemeterySideBoundary3D(root);

  addBox3D(root, -3.6, 0.18, 1.35, 0.28, 0.28, 0.28, '#f2b643', '#8d6232', -0.2);
  addCone3D(root, -3.78, 0.28, 1.18, 0.18, 0.36, '#f2b643', '#8d6232');
  createRoadSign3D(root, -3.05, 0.05, 1.42, -0.15, '#d8d5c6', '#445052');
}

function createCemeterySideBoundary3D(root: THREE.Group) {
  addBox3D(root, 4.76, 1.12, -0.25, 0.34, 2.24, 6.05, '#879083', '#263f42', 0.05);
  for (let i = 0; i < 6; i += 1) {
    addBox3D(root, 4.55, 0.64 + i * 0.26, -2.75 + i * 0.95, 0.16, 0.08, 0.9, '#5f6b68', '#263f42', 0.05);
  }
  createDenseTree3D(root, 4.0, 0.03, -2.2, 0.82);
  createDenseTree3D(root, 4.18, 0.03, -0.82, 1.04);
  createDenseTree3D(root, 3.92, 0.03, 1.35, 0.74);
  createGravestone3D(root, 3.72, 0.18, -1.55, 0.72, 'slab', -0.22);
  createGravestone3D(root, 3.7, 0.18, 0.24, 0.84, 'round', 0.16);
  createGrassTufts3D(root, 3.72, 0.08, -0.6, 8);
}

function createCemeteryGroundPaint3D(root: THREE.Group) {
  for (let i = 0; i < 12; i += 1) {
    addGroundBlob3D(
      root,
      -3.6 + (i % 6) * 1.28,
      0.04,
      1.32 - Math.floor(i / 6) * 2.05 + Math.sin(i) * 0.12,
      0.42 + (i % 3) * 0.16,
      0.28 + (i % 2) * 0.12,
      i % 2 ? '#3e8754' : '#5aa969',
      960 + i,
      0.38,
    );
  }
  addGroundCurve3D(root, [[-3.6, 0.82], [-2.0, 0.28], [-0.5, -0.44], [1.2, -1.5], [3.1, -2.15]], '#ebf0dd', 0.018, 0.62);
  addGroundCurve3D(root, [[2.9, 0.72], [1.4, 0.05], [0.3, -0.92], [-0.3, -2.2]], '#ebf0dd', 0.018, 0.62);
}

function createCemeteryWallDetail3D(root: THREE.Group) {
  for (let i = 0; i < 9; i += 1) {
    const x = -3.72 + i * 0.9;
    addBox3D(root, x, 1.08 + (i % 3) * 0.12, -2.32, 0.035, 1.15 + (i % 2) * 0.32, 0.035, '#347a4b', '#263f42', 0.04);
    addPartSphere(root, x + 0.08, 1.42, -2.25, 0.18, 0.14, 0.05, '#4fa260', '#263f42');
    addPartSphere(root, x - 0.12, 0.92, -2.25, 0.16, 0.12, 0.05, '#3c8b55', '#263f42');
  }
  for (let i = 0; i < 7; i += 1) {
    addBox3D(root, -3.3 + i * 1.12, 2.36, -2.33, 0.08, 0.36, 0.08, '#606b66', '#263f42', -0.02);
  }
}

function createCemeteryIvyColumns3D(root: THREE.Group) {
  const clusters = [
    [-3.4, -2.08, 0.7],
    [-2.72, -2.0, 0.52],
    [0.0, -2.0, 0.62],
    [2.45, -2.08, 0.56],
  ] as const;
  clusters.forEach(([x, z, scale]) => {
    createCemeteryVines3D(root, x, z, scale);
  });
}

function createFalls3D(root: THREE.Group) {
  const sky = new THREE.Group();
  sky.position.set(0, 0, -7.2);
  root.add(sky);
  addSkyBlob(sky, [[-7, 1.15], [-4.5, 1.55], [-2.0, 1.2], [0.3, 1.62], [2.4, 1.22], [7, 1.48], [7, 4.8], [-7, 4.8]], '#aeece2', '#6fb8b0');
  addSkyBlob(sky, [[-7, 0.1], [-3.7, 0.72], [-0.6, 0.24], [2.5, 0.68], [7, 0.2], [7, 1.2], [-7, 1.2]], '#68c9c2', '#408180');
  createPaintedBackdrop3D(sky, 'falls');

  addGroundPoly3D(root, [[-4.7, -3.4], [-1.2, -3.5], [-1.7, 2.7], [-4.7, 2.7]], -0.035, '#7aa05f', '#263f42');
  addGroundPoly3D(root, [[1.3, -3.5], [4.8, -3.2], [4.7, 2.6], [1.65, 2.7]], -0.035, '#58a661', '#263f42');
  addGroundPoly3D(root, [[-1.65, -3.45], [1.62, -3.45], [1.08, 2.6], [-1.35, 2.65]], -0.06, '#16737b', '#263f42');
  addGroundPoly3D(root, [[-1.1, -3.0], [1.05, -2.9], [0.65, 1.8], [-0.9, 1.95]], -0.045, '#2aa6a5', '#20575e');
  createFallsWaterPaint3D(root);

  addBox3D(root, -3.85, 1.65, -1.25, 0.72, 3.3, 4.0, '#918d77', '#263f42', 0.08);
  addBox3D(root, -3.36, 1.55, -1.22, 0.16, 3.1, 3.65, '#78d5cf', '#eaf8ed', 0.08);
  for (let i = 0; i < 7; i += 1) {
    addBox3D(root, -3.25 + (i % 3) * 0.07, 1.45 - i * 0.03, -2.7 + i * 0.55, 0.035, 2.75, 0.36, i % 2 ? '#e7fff7' : '#4fc4c3', '#e7fff7', 0.08);
  }
  createFallsCliffDetail3D(root);
  createFallsSignature3D(root);
  for (let i = 0; i < 9; i += 1) {
    addPartSphere(root, -1.05 + (i % 3) * 0.55, 0.12, -0.2 - Math.floor(i / 3) * 0.52, 0.28, 0.03, 0.15, i % 2 ? '#e8fbf0' : '#9be3dc', '#e8fbf0');
  }

  addRoadCurve3D(root, [[-0.85, 1.7], [-0.25, 0.7], [-0.08, -0.35], [0.18, -1.35], [0.68, -2.65]], '#e6fbf4', 0.024);
  addRoadCurve3D(root, [[0.88, 1.45], [0.72, 0.3], [0.6, -0.88], [0.88, -2.15]], '#e6fbf4', 0.024);

  addBox3D(root, 0.95, 0.72, -2.2, 1.05, 0.86, 0.18, '#dd8060', '#263f42', 0.02);
  addBox3D(root, 0.95, 0.72, -2.1, 0.72, 0.52, 0.12, '#f3eee0', '#263f42', 0.02);
  addBox3D(root, -1.9, 0.58, -1.95, 0.16, 0.12, 1.45, '#a8b2a8', '#263f42', -0.2);
  addBox3D(root, -1.82, 0.92, -1.92, 0.12, 0.54, 0.12, '#53636a', '#263f42', -0.2);
  addBox3D(root, 1.85, 0.52, -0.98, 0.16, 0.1, 1.28, '#a8b2a8', '#263f42', 0.14);

  createDenseTree3D(root, -2.8, 0.04, -1.7, 1.05);
  createDenseTree3D(root, -2.28, 0.04, -2.45, 0.72);
  createDenseTree3D(root, 3.2, 0.04, -2.15, 0.92);
  createGrassTufts3D(root, 2.55, 0.08, -0.25, 9);
  createGrassTufts3D(root, -2.45, 0.08, 0.65, 7);
  createRockCluster3D(root, -3.1, 0.08, 1.35);
  createRockCluster3D(root, 2.75, 0.08, 1.25);
}

function createFallsWaterPaint3D(root: THREE.Group) {
  for (let i = 0; i < 15; i += 1) {
    addGroundBlob3D(
      root,
      -0.85 + (i % 5) * 0.42,
      0.095,
      1.15 - Math.floor(i / 5) * 0.96 + Math.sin(i * 1.4) * 0.08,
      0.34 + (i % 3) * 0.14,
      0.12 + (i % 2) * 0.07,
      i % 3 ? '#e8fff7' : '#0d636c',
      1010 + i,
      i % 3 ? 0.76 : 0.36,
    );
  }
  addGroundCurve3D(root, [[-1.08, 1.9], [-0.62, 0.82], [-0.42, -0.4], [-0.62, -1.65], [-0.92, -2.8]], '#f2fff8', 0.02, 0.82);
  addGroundCurve3D(root, [[0.75, 1.7], [0.38, 0.52], [0.48, -0.8], [0.92, -2.45]], '#f2fff8', 0.018, 0.8);
  addGroundCurve3D(root, [[-0.2, 1.35], [0.15, 0.4], [0.02, -0.95], [0.36, -2.2]], '#67d5d0', 0.018, 0.56);
}

function createFallsCliffDetail3D(root: THREE.Group) {
  for (let i = 0; i < 9; i += 1) {
    addBox3D(root, -3.62 + (i % 2) * 0.12, 0.42 + i * 0.26, -2.68 + i * 0.46, 0.035, 0.18, 0.52, i % 2 ? '#e6f8ee' : '#137a82', '#e6f8ee', 0.08);
  }
  addGroundBlob3D(root, -2.62, 0.08, 1.12, 0.92, 0.5, '#c9c0a4', 1030, 0.68);
  addGroundBlob3D(root, 2.28, 0.08, 1.05, 0.7, 0.42, '#d8cead', 1031, 0.68);
  addGroundCurve3D(root, [[-3.75, 1.6], [-3.5, 0.72], [-3.62, -0.28], [-3.44, -1.4]], '#685f52', 0.012, 0.26);
}

function createFallsSignature3D(root: THREE.Group) {
  addBox3D(root, -3.64, 1.74, -1.5, 0.82, 3.55, 0.18, '#9b947d', '#263f42', -0.08);
  addBox3D(root, -3.22, 1.72, -1.38, 0.86, 3.42, 0.12, '#49bbb9', '#0f6268', -0.08);
  addBox3D(root, -3.0, 1.72, -1.32, 0.28, 3.38, 0.08, '#e9fff7', '#e9fff7', -0.08);
  addBox3D(root, -3.48, 1.78, -1.3, 0.12, 3.3, 0.08, '#f6fff8', '#f6fff8', -0.08);
  addBox3D(root, -2.78, 1.55, -1.26, 0.09, 2.72, 0.08, '#0d6f76', '#0d6f76', -0.08);
  for (let i = 0; i < 8; i += 1) {
    addBox3D(
      root,
      -3.46 + (i % 4) * 0.2,
      1.78 - (i % 2) * 0.08,
      -1.18 + i * 0.035,
      0.035,
      2.75 + (i % 3) * 0.32,
      0.035,
      i % 2 ? '#e8fff7' : '#73d9d4',
      i % 2 ? '#e8fff7' : '#73d9d4',
      -0.08,
    );
  }

  for (let i = 0; i < 9; i += 1) {
    addGroundBlob3D(
      root,
      -2.08 + (i % 3) * 0.5,
      0.13,
      0.82 - Math.floor(i / 3) * 0.38,
      0.5,
      0.18,
      i % 2 ? '#eafff8' : '#0e6b73',
      1080 + i,
      i % 2 ? 0.9 : 0.42,
    );
  }

  const bridge = new THREE.Group();
  bridge.position.set(-2.42, 2.28, -2.16);
  bridge.rotation.y = -0.08;
  root.add(bridge);
  addBox3D(bridge, 0, 0, 0, 1.12, 0.14, 0.18, '#c97864', '#263f42');
  addBox3D(bridge, 0, -0.16, 0.06, 1.04, 0.12, 0.14, '#e2b36d', '#8b4938');
  for (let i = 0; i < 5; i += 1) {
    addCylinder3D(bridge, -0.48 + i * 0.24, 0.24, 0.02, 0.025, 0.48, '#53636a', '#263f42', 7);
  }
  addBox3D(bridge, 0, 0.48, 0.02, 1.22, 0.08, 0.08, '#c8d1c7', '#263f42');
  addBox3D(bridge, 0, 0.32, 0.02, 1.22, 0.055, 0.06, '#5e6967', '#263f42');
}

function createGravestone3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  scale: number,
  variant: 'round' | 'slab' | 'coin',
  yaw: number,
) {
  const grave = new THREE.Group();
  grave.position.set(x, y, z);
  grave.rotation.y = yaw;
  grave.scale.setScalar(scale);
  root.add(grave);

  addBox3D(grave, 0, 0.08, 0.03, 0.72, 0.16, 0.36, '#89938d', '#263f42');
  if (variant === 'round') {
    addCylinder3D(grave, 0, 0.68, 0, 0.32, 0.12, '#aeb5ad', '#263f42', 20, Math.PI / 2, 1, 0.28);
    addBox3D(grave, 0, 0.42, 0, 0.62, 0.58, 0.18, '#aeb5ad', '#263f42');
  } else if (variant === 'coin') {
    addCylinder3D(grave, 0, 0.48, 0, 0.34, 0.14, '#b7bbb1', '#263f42', 22, Math.PI / 2, 1, 0.32);
    addCylinder3D(grave, 0, 0.49, 0.09, 0.18, 0.04, '#8e9992', '#53636a', 14, Math.PI / 2, 1, 0.3);
  } else {
    addBox3D(grave, 0, 0.48, 0, 0.58, 0.8, 0.18, '#aeb5ad', '#263f42', 0.02);
  }
  addBox3D(grave, 0, 0.5, 0.12, 0.28, 0.04, 0.035, '#596662', '#596662');
  addBox3D(grave, 0, 0.38, 0.12, 0.22, 0.035, 0.035, '#596662', '#596662');
  addBox3D(grave, -0.12, 0.62, 0.12, 0.035, 0.18, 0.035, '#596662', '#596662');
  addBox3D(grave, -0.12, 0.66, 0.12, 0.16, 0.035, 0.035, '#596662', '#596662');
  addBox3D(grave, 0.14, 0.24, 0.12, 0.16, 0.03, 0.035, '#77817c', '#77817c');
}

function createCemeterySketchDetails3D(root: THREE.Group) {
  for (let i = 0; i < 14; i += 1) {
    const x = -3.72 + i * 0.56;
    const y = 0.68 + (i % 5) * 0.34;
    addBox3D(root, x, y, -2.31, 0.42 + (i % 3) * 0.24, 0.026, 0.035, '#535e5b', '#535e5b', -0.02);
  }
  for (let i = 0; i < 18; i += 1) {
    const x = -3.85 + (i % 6) * 1.34 + Math.sin(i) * 0.08;
    const z = 1.1 - Math.floor(i / 6) * 0.9 + Math.cos(i) * 0.1;
    addPartSphere(root, x, 0.12, z, 0.09 + (i % 3) * 0.035, 0.035, 0.08, i % 2 ? '#2f7548' : '#5cad67', '#263f42');
  }
  const foreground = [
    [-3.95, 0.18, 0.12, 0.52, -0.16],
    [-3.18, 0.18, -0.38, 0.44, 0.12],
    [3.18, 0.18, 0.32, 0.5, -0.1],
    [3.68, 0.18, -0.56, 0.42, 0.18],
  ] as const;
  foreground.forEach(([x, y, z, scale, yaw], index) => {
    createGravestone3D(root, x, y, z, scale, index % 2 ? 'coin' : 'slab', yaw);
  });
}

function createDenseTree3D(root: THREE.Group, x: number, y: number, z: number, scale: number) {
  const tree = new THREE.Group();
  tree.position.set(x, y, z);
  tree.scale.setScalar(scale);
  root.add(tree);
  addCylinder3D(tree, 0, 0.54, 0, 0.085, 1.08, '#5d5947', '#263f42', 7);
  addPartSphere(tree, 0, 1.26, 0, 0.52, 0.36, 0.42, '#3e8a55', '#263f42');
  addPartSphere(tree, -0.35, 1.04, 0.08, 0.42, 0.28, 0.32, '#2f7548', '#263f42');
  addPartSphere(tree, 0.36, 1.02, -0.04, 0.42, 0.3, 0.32, '#5cad67', '#263f42');
  addPartSphere(tree, 0.08, 1.52, -0.08, 0.32, 0.26, 0.26, '#4a985e', '#263f42');
}

function createCemeteryVines3D(root: THREE.Group, x: number, z: number, scale: number) {
  const vine = new THREE.Group();
  vine.position.set(x, 0.18, z);
  vine.scale.setScalar(scale);
  root.add(vine);
  for (let i = 0; i < 6; i += 1) {
    addPartSphere(vine, (i % 2) * 0.2, 0.22 + i * 0.22, 0.08, 0.18, 0.12, 0.08, i % 2 ? '#348451' : '#4fa260', '#263f42');
  }
}

function createRoadSign3D(root: THREE.Group, x: number, y: number, z: number, yaw: number, color: string, edge: string) {
  const sign = new THREE.Group();
  sign.position.set(x, y, z);
  sign.rotation.y = yaw;
  root.add(sign);
  addCylinder3D(sign, 0, 0.44, 0, 0.035, 0.88, '#596662', '#263f42', 8);
  addCylinder3D(sign, 0, 0.96, 0.04, 0.24, 0.08, color, edge, 20, Math.PI / 2, 1, 0.35);
  addBox3D(sign, 0, 0.96, 0.1, 0.22, 0.03, 0.035, edge, edge);
}

function createGrassTufts3D(root: THREE.Group, x: number, y: number, z: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    const gx = x + Math.sin(i * 1.7) * 0.44;
    const gz = z + Math.cos(i * 2.1) * 0.5;
    addCone3D(root, gx, y, gz, 0.05 + (i % 3) * 0.012, 0.22 + (i % 2) * 0.08, i % 2 ? '#2f7548' : '#4fa260', '#263f42');
  }
}

function createRockCluster3D(root: THREE.Group, x: number, y: number, z: number) {
  addPartSphere(root, x, y + 0.05, z, 0.28, 0.12, 0.2, '#c9c0a4', '#263f42');
  addPartSphere(root, x + 0.28, y + 0.04, z - 0.12, 0.2, 0.1, 0.16, '#a9a18d', '#263f42');
  addPartSphere(root, x - 0.24, y + 0.035, z + 0.12, 0.18, 0.09, 0.14, '#ded4b5', '#263f42');
}

function createLeft3D(root: THREE.Group) {
  addBox3D(root, -4.85, 2.1, -2.4, 1.35, 4.2, 10.2, '#929082', '#263f42', -0.06);
  addBox3D(root, -3.25, 0.9, 0.5, 0.92, 1.85, 0.58, '#76d2c0', '#263f42', 0.04);
  addBox3D(root, -3.25, 1.55, 0.22, 0.76, 0.16, 0.08, '#eff4ec', '#263f42', 0.04);
  addBox3D(root, -3.25, 0.08, 0.18, 0.6, 0.13, 0.08, '#143438', '#143438', 0.04);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      addCylinder3D(root, -3.56 + col * 0.15, 0.68 + row * 0.28, 0.16, 0.033, 0.22, col % 2 ? '#eef2ea' : '#5aa5b2', '#263f42', 8);
    }
  }
  addCone3D(root, -2.72, 0.24, 1.25, 0.24, 0.58, '#f08a42', '#263f42');

  const npc = new THREE.Group();
  npc.position.set(-2.95, 0.08, 0.52);
  npc.rotation.y = -0.22;
  npc.scale.setScalar(0.62);
  root.add(npc);
  createCharacter(npc, 'npc');

  createDetailedVendingMachine3D(root, -3.22, 0.02, 0.42, 0.04);
  createKeiVan3D(root, -4.72, 0.02, 1.34, -0.16);
  createKeiVan3D(root, -2.95, 0.02, -2.45, -0.08, 0.62);
  createRoadMirror3D(root, -2.62, 0, -0.94, 0.02);
  createWallPipes3D(root, -3.64, 0.16, -1.95, -0.06);
}

function createRight3D(root: THREE.Group) {
  addBox3D(root, 4.18, 2.05, -3.55, 1.6, 4.1, 9.8, '#8c9186', '#263f42', 0.05);
  for (let i = 0; i < 7; i += 1) {
    addBox3D(root, 3.32, 3.46 - i * 0.46, -3.7 + i * 0.05, 0.12, 0.08, 2.15, '#5d6968', '#263f42', 0.05);
  }
  addBox3D(root, 3.22, 1.18, -0.05, 0.22, 0.82, 1.15, '#46afd0', '#263f42', 0.02);
  addBox3D(root, 3.08, 1.15, -0.05, 0.08, 0.44, 0.82, '#f3f1df', '#263f42', 0.02);
  for (let i = 0; i < 5; i += 1) {
    addBox3D(root, 3.02, 1.45, -0.42 + i * 0.18, 0.08, 0.055, 0.1, '#d6c45f', '#53636a', 0.02);
  }

  addBox3D(root, 4.15, 1.12, 1.05, 0.88, 2.24, 0.62, '#82bb70', '#263f42', -0.12);
  addBox3D(root, 4.84, 1.16, 1.45, 0.86, 2.42, 0.64, '#78ad68', '#263f42', -0.12);
  addCylinder3D(root, 2.48, 0.52, 1.1, 0.08, 0.72, '#d99d36', '#263f42', 10);
  addBox3D(root, 2.45, 0.22, -0.55, 0.2, 0.12, 0.96, '#e9eee8', '#263f42', 0.16);
  addBox3D(root, 2.24, 0.12, 1.38, 0.18, 0.18, 1.45, '#5e6967', '#263f42', 0.18);

  createBulletinBoard3D(root, 3.1, 0.68, -0.08, 0.02);
  createUtilityCabinets3D(root, 4.38, 0.02, 1.14, -0.12);
  createGuardrail3D(root, 2.55, 0.02, -3.55, 0.08);
  createScooter3D(root, 2.28, 0.03, 0.68, 0.18);
  createAirConditioner3D(root, 3.45, 0.72, 0.92, 0.04);
}

function createSceneDepthDetails3D(root: THREE.Group) {
  createFacadeRelief3D(root);
  createBackgroundTrees3D(root);
  createCurvedRoadMarkings3D(root);
  createOverheadCables3D(root);
}

function createFacadeRelief3D(root: THREE.Group) {
  for (let i = 0; i < 5; i += 1) {
    addBox3D(root, -3.98, 0.82 + i * 0.44, -3.85 - i * 0.18, 0.12, 0.1, 1.25, '#6f7d77', '#263f42', -0.04);
    addBox3D(root, -3.9, 0.95 + i * 0.44, -3.85 - i * 0.18, 0.08, 0.08, 0.95, '#dce4d8', '#53636a', -0.04);
  }
  addBox3D(root, -3.86, 2.8, -1.1, 0.1, 1.05, 0.72, '#d7c25b', '#263f42', -0.04);
  addBox3D(root, -3.78, 2.84, -1.1, 0.07, 0.82, 0.52, '#f5f0dc', '#53636a', -0.04);
  for (let i = 0; i < 4; i += 1) {
    addBox3D(root, -3.73, 3.08 - i * 0.16, -1.1, 0.04, 0.035, 0.34, '#53636a', '#53636a', -0.04);
  }

  addBox3D(root, 3.24, 2.9, -6.8, 0.14, 0.24, 1.6, '#6d7b78', '#263f42', 0.06);
  addBox3D(root, 3.15, 2.9, -6.8, 0.08, 0.12, 1.22, '#dfe7dc', '#53636a', 0.06);
  for (let i = 0; i < 5; i += 1) {
    addBox3D(root, 3.18, 0.74 + i * 0.36, -5.9 - i * 0.2, 0.09, 0.07, 0.92, '#d4dccf', '#53636a', 0.06);
  }
}

function createBackgroundTrees3D(root: THREE.Group) {
  const trees = [
    [-1.9, -9.1, 0.72],
    [-2.9, -7.8, 0.58],
    [2.0, -8.55, 0.64],
    [3.05, -7.85, 0.52],
    [0.8, -10.0, 0.78],
  ] as const;
  trees.forEach(([x, z, scale], index) => {
    const tree = new THREE.Group();
    tree.position.set(x, 0.02, z);
    tree.rotation.y = (index % 2 ? -0.25 : 0.22);
    tree.scale.setScalar(scale);
    root.add(tree);
    addCylinder3D(tree, 0, 0.48, 0, 0.07, 0.96, '#6b5f4f', '#263f42', 7);
    addPartSphere(tree, 0.0, 1.08, 0, 0.44, 0.32, 0.36, '#4f8d5c', '#263f42');
    addPartSphere(tree, -0.28, 0.92, 0.08, 0.34, 0.26, 0.28, '#3f7d51', '#263f42');
    addPartSphere(tree, 0.26, 0.92, -0.08, 0.34, 0.26, 0.28, '#5ba96b', '#263f42');
    addPartSphere(tree, 0.05, 1.32, -0.04, 0.3, 0.24, 0.24, '#3f7d51', '#263f42');
  });
}

function createCurvedRoadMarkings3D(root: THREE.Group) {
  addRoadCurve3D(root, [[-1.48, 1.65], [-1.1, -0.4], [-0.9, -2.8], [-1.04, -5.2], [-1.18, -7.8]], '#f7f4e9', 0.032);
  addRoadCurve3D(root, [[1.52, 1.5], [1.22, -0.6], [1.04, -2.9], [1.18, -5.4], [1.34, -7.95]], '#f7f4e9', 0.032);
  addRoadCurve3D(root, [[-2.1, 1.2], [-1.78, -0.55], [-1.9, -2.8], [-2.3, -5.55], [-2.75, -7.95]], '#9fb1a8', 0.026);
  addRoadCurve3D(root, [[2.08, 1.1], [1.78, -0.7], [1.9, -3.05], [2.32, -5.55], [2.8, -7.85]], '#9fb1a8', 0.026);
}

function createOverheadCables3D(root: THREE.Group) {
  addCable3D(root, new THREE.Vector3(-3.62, 3.15, -0.72), new THREE.Vector3(3.32, 2.92, -1.12), 0.22);
  addCable3D(root, new THREE.Vector3(-3.74, 2.72, -2.6), new THREE.Vector3(3.42, 2.56, -3.05), 0.28);
  addCable3D(root, new THREE.Vector3(-3.68, 2.35, -4.72), new THREE.Vector3(3.28, 2.28, -5.05), 0.22);
}

function createStreetProps3D(root: THREE.Group) {
  addBox3D(root, -2.0, 0.04, -0.88, 0.48, 0.04, 0.42, '#f8f6e8', '#263f42', -0.18);
  addBox3D(root, 2.0, 0.05, -0.55, 0.48, 0.05, 0.42, '#f8f6e8', '#263f42', 0.16);
  addCylinder3D(root, 0, 0.48, -6.4, 0.035, 0.86, '#6f7774', '#263f42', 8);
  addCylinder3D(root, 0, 1.0, -6.4, 0.2, 0.05, '#e8ece5', '#a6503d', 18, Math.PI / 2, 1, 0.28);
  addBox3D(root, 0, 1.0, -6.25, 0.06, 0.05, 0.22, '#55b8cf', '#263f42');

  for (let i = 0; i < 4; i += 1) {
    const z = -3.0 - i * 0.95;
    addCylinder3D(root, 2.28 + i * 0.1, 0.36, z, 0.035, 0.62, '#6a7471', '#263f42', 8);
    addBox3D(root, 2.72 + i * 0.15, 0.64, z - 0.12, 0.16, 0.12, 1.2, '#b7bdb5', '#263f42', 0.08);
    addBox3D(root, 2.76 + i * 0.15, 0.47, z - 0.08, 0.12, 0.09, 1.1, '#75817d', '#263f42', 0.08);
  }
  addBox3D(root, 2.15, 0.72, -5.5, 0.32, 1.08, 2.65, '#aeb6b0', '#263f42', 0.18);
  addBox3D(root, -2.18, 0.55, -5.7, 0.28, 0.86, 2.2, '#b8b9a5', '#263f42', -0.18);
  addBox3D(root, -1.9, 0.8, -6.8, 1.4, 0.18, 0.16, '#75817d', '#263f42', -0.1);
  for (let i = 0; i < 7; i += 1) {
    addCylinder3D(root, -2.8 + i * 0.23, 0.42, -6.85, 0.022, 0.72, '#5b6a68', '#263f42', 7);
  }
  createDeliverySet3D(root);
  createInstancedStreetDetails3D(root);
}

type StaticModelPlacement = {
  src: string;
  x: number;
  y: number;
  z: number;
  height: number;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
};

function createReferenceModelLayer3D(root: THREE.Group) {
  const layer = new THREE.Group();
  layer.name = 'reference-style-static-models';
  root.add(layer);

  const placements: StaticModelPlacement[] = [
    { src: '/models/street_lamp.glb', x: -3.42, y: 0.04, z: 1.18, height: 1.42, rotationY: 0.12 },
    { src: '/models/park_bench.glb', x: -2.58, y: 0.04, z: 0.62, height: 0.38, rotationY: Math.PI / 2 - 0.12 },
    { src: '/models/round_topiary.glb', x: 4.95, y: 0.04, z: 0.9, height: 0.62, rotationY: -0.1 },
    { src: '/models/bush.glb', x: -3.28, y: 0.03, z: -0.72, height: 0.42, rotationY: 0.28 },
    { src: '/models/bush.glb', x: 5.05, y: 0.03, z: -0.52, height: 0.44, rotationY: -0.35 },
    { src: '/models/wood_fence_segment_a.glb', x: 5.12, y: 0.03, z: 0.22, height: 0.32, rotationY: Math.PI + 0.1 },
    { src: '/models/wood_fence_segment_b.glb', x: 5.15, y: 0.03, z: -0.42, height: 0.32, rotationY: Math.PI + 0.1 },
    { src: '/models/fountain.glb', x: 0, y: 0.02, z: -8.65, height: 0.84, rotationY: 0.15 },
    { src: '/models/park_bench.glb', x: -2.35, y: 0.04, z: -5.25, height: 0.42, rotationY: Math.PI / 2 - 0.18 },
    { src: '/models/street_lamp.glb', x: -2.42, y: 0.04, z: -2.15, height: 1.55, rotationY: 0.08 },
    { src: '/models/street_lamp.glb', x: 2.5, y: 0.04, z: -4.8, height: 1.45, rotationY: Math.PI + 0.18 },
    { src: '/models/round_topiary.glb', x: 2.62, y: 0.04, z: -1.9, height: 0.72, rotationY: -0.2 },
    { src: '/models/bush.glb', x: -2.7, y: 0.03, z: -6.35, height: 0.46, rotationY: 0.35 },
    { src: '/models/bush.glb', x: 2.88, y: 0.03, z: -6.75, height: 0.5, rotationY: -0.48 },
    { src: '/models/bush.glb', x: 2.95, y: 0.03, z: -7.55, height: 0.42, rotationY: 0.92 },
    { src: '/models/wood_fence_segment_a.glb', x: -2.72, y: 0.03, z: -6.0, height: 0.34, rotationY: -0.12 },
    { src: '/models/wood_fence_segment_b.glb', x: -2.9, y: 0.03, z: -6.58, height: 0.34, rotationY: -0.12 },
    { src: '/models/wood_fence_segment_c.glb', x: -3.08, y: 0.03, z: -7.15, height: 0.34, rotationY: -0.12 },
    { src: '/models/wood_fence_segment_a.glb', x: 2.94, y: 0.03, z: -5.72, height: 0.34, rotationY: Math.PI + 0.16 },
    { src: '/models/wood_fence_segment_b.glb', x: 3.12, y: 0.03, z: -6.3, height: 0.34, rotationY: Math.PI + 0.16 },
  ];

  placements.forEach((placement) => {
    loadStaticModel(placement.src)
      .then((source) => {
        const model = source.clone(true);
        normalizeStaticModel(model, placement.height);
        prepareStaticModel(model);
        const anchor = new THREE.Group();
        anchor.rotation.set(placement.rotationX ?? 0, placement.rotationY ?? 0, placement.rotationZ ?? 0);
        anchor.position.set(placement.x, placement.y, placement.z);
        anchor.add(model);
        freezeStaticObject(anchor);
        layer.add(anchor);
      })
      .catch(() => {
        // Missing model files should not break the game loop.
      });
  });
}

function loadStaticModel(src: string) {
  const cached = staticModelCache.get(src);
  if (cached) return cached;
  const request = staticModelLoader.loadAsync(src).then((gltf) => {
    const source = gltf.scene;
    prepareStaticModel(source);
    return source;
  });
  staticModelCache.set(src, request);
  return request;
}

function normalizeStaticModel(model: THREE.Group, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y <= 0.001) return;
  model.scale.multiplyScalar(targetHeight / size.y);

  const fittedBox = new THREE.Box3().setFromObject(model);
  const center = fittedBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fittedBox.min.y;
}

function prepareStaticModel(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
    }
    if (object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
}

function freezeStaticObject(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
}

function createInstancedStreetDetails3D(root: THREE.Group) {
  const placements = [
    [-0.62, 0.08, -1.25, 0.1, 0.035, 0.42, -0.05],
    [0.74, 0.08, -1.55, 0.1, 0.035, 0.42, 0.06],
    [-0.72, 0.08, -2.65, 0.1, 0.035, 0.5, -0.08],
    [0.84, 0.08, -2.95, 0.1, 0.035, 0.5, 0.08],
    [-0.86, 0.08, -4.15, 0.1, 0.035, 0.58, -0.08],
    [1.0, 0.08, -4.55, 0.1, 0.035, 0.58, 0.08],
    [-1.02, 0.08, -5.85, 0.1, 0.035, 0.62, -0.08],
    [1.14, 0.08, -6.25, 0.1, 0.035, 0.62, 0.08],
    [-1.16, 0.08, -7.55, 0.1, 0.035, 0.64, -0.08],
    [1.26, 0.08, -7.9, 0.1, 0.035, 0.64, 0.08],
  ] as const;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshToonMaterial({ color: '#f7f4e9' });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  const dummy = new THREE.Object3D();
  placements.forEach(([x, y, z, sx, sy, sz, yaw], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

function addRoadCurve3D(root: THREE.Group, points: Vec2[], color: string, radius: number) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0.085, z)),
    false,
    'catmullrom',
    0.35,
  );
  const geometry = new THREE.TubeGeometry(curve, 42, radius, 5, false);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
}

function addCable3D(root: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, sag: number) {
  const mid = start.clone().lerp(end, 0.5);
  mid.y -= sag;
  const curve = new THREE.CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.45);
  const geometry = new THREE.TubeGeometry(curve, 24, 0.007, 5, false);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: '#263f42', transparent: true, opacity: 0.78 }),
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
}

function createDetailedVendingMachine3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  addBox3D(group, 0, 0.98, 0, 0.92, 1.96, 0.5, '#8f9991', '#263f42');
  addBox3D(group, 0, 1.8, 0.28, 0.74, 0.18, 0.06, '#f2f6ee', '#263f42');
  addBox3D(group, -0.17, 1.0, 0.29, 0.48, 1.02, 0.07, '#e8f2e8', '#263f42');
  addBox3D(group, 0.28, 1.0, 0.3, 0.2, 1.0, 0.07, '#5f8e98', '#263f42');
  addBox3D(group, 0, 0.12, 0.3, 0.58, 0.12, 0.08, '#153538', '#153538');

  for (let row = 0; row < 4; row += 1) {
    addBox3D(group, -0.18, 1.38 - row * 0.24, 0.34, 0.48, 0.035, 0.04, '#263f42', '#263f42');
    for (let col = 0; col < 4; col += 1) {
      const color = ['#e8efe7', '#5aa5b2', '#f2d35f', '#f19a66'][(row + col) % 4];
      addCylinder3D(group, -0.36 + col * 0.12, 1.48 - row * 0.24, 0.36, 0.028, 0.18, color, '#263f42', 8);
    }
  }
  for (let i = 0; i < 5; i += 1) {
    addCylinder3D(group, 0.28, 1.44 - i * 0.14, 0.36, 0.025, 0.025, i % 2 ? '#f2d35f' : '#f7f2dd', '#53636a', 10, Math.PI / 2);
  }
  addBox3D(group, 0.28, 0.52, 0.36, 0.2, 0.08, 0.06, '#f2f6ee', '#263f42');
  addBox3D(group, 0.28, 0.36, 0.36, 0.24, 0.08, 0.06, '#263f42', '#263f42');
}

function createKeiVan3D(root: THREE.Group, x: number, y: number, z: number, yaw: number, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  group.scale.setScalar(scale);
  root.add(group);

  addBox3D(group, 0, 0.55, 0, 1.25, 0.88, 1.18, '#e8eee5', '#263f42');
  addBox3D(group, 0.16, 1.08, -0.12, 0.86, 0.42, 0.78, '#f4f5e9', '#263f42');
  addBox3D(group, 0.16, 1.12, 0.32, 0.62, 0.28, 0.08, '#244754', '#263f42');
  addBox3D(group, -0.34, 0.64, 0.62, 0.22, 0.32, 0.06, '#1e4756', '#263f42');
  addBox3D(group, 0.32, 0.64, 0.62, 0.22, 0.32, 0.06, '#1e4756', '#263f42');
  addBox3D(group, -0.42, 0.4, 0.64, 0.14, 0.1, 0.05, '#f0c85a', '#7a6730');
  addBox3D(group, 0.42, 0.4, 0.64, 0.14, 0.1, 0.05, '#f0c85a', '#7a6730');
  addCylinder3D(group, -0.46, 0.2, 0.42, 0.16, 0.16, '#1f3034', '#263f42', 14, Math.PI / 2, 1, 0.55);
  addCylinder3D(group, 0.46, 0.2, 0.42, 0.16, 0.16, '#1f3034', '#263f42', 14, Math.PI / 2, 1, 0.55);
  addCylinder3D(group, -0.46, 0.2, -0.42, 0.16, 0.16, '#1f3034', '#263f42', 14, Math.PI / 2, 1, 0.55);
  addCylinder3D(group, 0.46, 0.2, -0.42, 0.16, 0.16, '#1f3034', '#263f42', 14, Math.PI / 2, 1, 0.55);
}

function createRoadMirror3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  addCylinder3D(group, 0, 1.05, 0, 0.035, 2.1, '#9aa69c', '#263f42', 8);
  addCylinder3D(group, 0, 2.1, 0.03, 0.34, 0.08, '#d9d1bd', '#a65c34', 24, Math.PI / 2, 1.05, 0.28);
  addCylinder3D(group, 0, 2.1, 0.08, 0.27, 0.035, '#f6edce', '#a65c34', 24, Math.PI / 2, 1.05, 0.28);
  addBox3D(group, 0, 1.2, 0.06, 0.16, 0.44, 0.06, '#e8ede9', '#263f42');
  for (let i = 0; i < 3; i += 1) {
    addBox3D(group, 0, 1.32 - i * 0.12, 0.11, 0.06, 0.035, 0.04, '#55b8cf', '#263f42');
  }
}

function createBulletinBoard3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  addBox3D(group, 0, 0.6, 0, 0.16, 0.86, 1.22, '#45afd0', '#263f42');
  addBox3D(group, -0.09, 0.56, 0, 0.06, 0.48, 0.86, '#f5f1dd', '#263f42');
  for (let i = 0; i < 5; i += 1) {
    addBox3D(group, -0.14, 0.82, -0.42 + i * 0.21, 0.055, 0.06, 0.08, '#f2d35f', '#7a6730');
  }
  for (let i = 0; i < 3; i += 1) {
    addBox3D(group, -0.15, 0.55 - i * 0.12, -0.12, 0.04, 0.035, 0.55 - i * 0.08, '#53636a', '#53636a');
    addCylinder3D(group, -0.16, 0.58 - i * 0.12, -0.42, 0.025, 0.02, '#d48a37', '#8a5a2f', 8, Math.PI / 2);
  }
}

function createUtilityCabinets3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  addBox3D(group, -0.18, 1.05, -0.1, 0.78, 2.1, 0.62, '#8f9a8d', '#263f42');
  addBox3D(group, 0.38, 1.12, 0.38, 0.82, 2.28, 0.64, '#818d82', '#263f42');
  addBox3D(group, -0.58, 1.05, -0.1, 0.04, 1.65, 0.48, '#727f74', '#263f42');
  addBox3D(group, 0.78, 1.12, 0.38, 0.04, 1.8, 0.5, '#69766e', '#263f42');
  addBox3D(group, -0.6, 1.1, -0.38, 0.035, 0.42, 0.06, '#566260', '#263f42');
  addBox3D(group, 0.82, 1.18, 0.1, 0.035, 0.48, 0.06, '#566260', '#263f42');
  addBox3D(group, 0.08, 0.18, 0.7, 1.28, 0.16, 0.22, '#6b7773', '#263f42', 0.08);
}

function createGuardrail3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  for (let i = 0; i < 5; i += 1) {
    addCylinder3D(group, i * 0.34, 0.36, -i * 0.58, 0.035, 0.72, '#64716e', '#263f42', 8);
    addBox3D(group, i * 0.34 + 0.2, 0.64, -i * 0.58 - 0.3, 0.16, 0.12, 0.92, '#b8bdb5', '#263f42', 0.04);
    addBox3D(group, i * 0.34 + 0.2, 0.47, -i * 0.58 - 0.3, 0.12, 0.08, 0.86, '#73807c', '#263f42', 0.04);
  }
}

function createDeliverySet3D(root: THREE.Group) {
  const items = [
    [-2.15, 0.12, 0.88, '#efe7d3', '#c26b46', -0.25],
    [2.05, 0.11, 0.35, '#f3f0e5', '#5ea9b4', 0.18],
    [0.35, 0.08, 1.75, '#447f8a', '#e6d36c', 0.1],
  ] as const;
  for (const [x, y, z, body, stripe, yaw] of items) {
    addBox3D(root, x, y + 0.06, z, 0.58, 0.26, 0.36, body, '#263f42', yaw);
    addBox3D(root, x, y + 0.22, z, 0.44, 0.035, 0.39, stripe, stripe, yaw);
    addBox3D(root, x - 0.12, y + 0.12, z + 0.18, 0.18, 0.04, 0.04, '#263f42', '#263f42', yaw);
  }
}

function createScooter3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  addCylinderRotated3D(group, 0, 0.24, -0.44, 0.18, 0.08, '#243235', '#263f42', 16, 0, 0, Math.PI / 2);
  addCylinderRotated3D(group, 0, 0.24, 0.44, 0.18, 0.08, '#243235', '#263f42', 16, 0, 0, Math.PI / 2);
  addCylinderRotated3D(group, 0, 0.24, -0.44, 0.1, 0.09, '#d9e3db', '#53636a', 12, 0, 0, Math.PI / 2);
  addCylinderRotated3D(group, 0, 0.24, 0.44, 0.1, 0.09, '#d9e3db', '#53636a', 12, 0, 0, Math.PI / 2);
  addBox3D(group, 0, 0.44, 0, 0.18, 0.12, 0.92, '#55b8cf', '#263f42', 0);
  addBox3D(group, 0, 0.58, -0.12, 0.22, 0.12, 0.44, '#f2d35f', '#7a6730', 0);
  addBox3D(group, 0, 0.72, 0.1, 0.28, 0.1, 0.32, '#263f42', '#263f42', 0);
  addCylinderRotated3D(group, 0, 0.82, 0.45, 0.035, 0.5, '#53636a', '#263f42', 8, 0.72, 0, 0);
  addBox3D(group, 0, 1.05, 0.64, 0.48, 0.05, 0.08, '#53636a', '#263f42', 0);
  addBox3D(group, 0, 0.48, 0.62, 0.3, 0.22, 0.08, '#f2f4e8', '#263f42', 0);
  addBox3D(group, 0, 0.52, 0.72, 0.16, 0.08, 0.06, '#f0c85a', '#7a6730', 0);
}

function createAirConditioner3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  addBox3D(group, 0, 0.22, 0, 0.76, 0.44, 0.34, '#eef1e5', '#263f42');
  addCylinderRotated3D(group, -0.18, 0.22, 0.2, 0.14, 0.04, '#d3ded8', '#53636a', 20, Math.PI / 2);
  addCylinderRotated3D(group, -0.18, 0.22, 0.23, 0.08, 0.03, '#53636a', '#53636a', 12, Math.PI / 2);
  for (let i = 0; i < 4; i += 1) {
    addBox3D(group, 0.18, 0.34 - i * 0.08, 0.2, 0.28, 0.025, 0.04, '#6b7773', '#6b7773');
  }
  addBox3D(group, 0, -0.05, -0.08, 0.86, 0.08, 0.18, '#6b7773', '#263f42');
  addCylinderRotated3D(group, 0.42, 0.08, -0.12, 0.025, 0.64, '#d9d1bd', '#8b8172', 8, 0, 0, 0);
  addCylinderRotated3D(group, 0.5, -0.18, -0.12, 0.02, 0.42, '#d9d1bd', '#8b8172', 8, 0, 0, Math.PI / 2);
}

function createWallPipes3D(root: THREE.Group, x: number, y: number, z: number, yaw: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  root.add(group);

  for (let i = 0; i < 3; i += 1) {
    addCylinderRotated3D(group, i * 0.13, 0.78, 0, 0.022, 1.24, '#5f6e6c', '#263f42', 7, 0, 0, 0);
    addBox3D(group, i * 0.13, 1.42, 0.03, 0.08, 0.06, 0.06, '#d9d1bd', '#263f42', 0);
  }
  addBox3D(group, 0.13, 0.24, 0.04, 0.38, 0.32, 0.1, '#dce4dd', '#263f42', 0);
  addBox3D(group, 0.13, 0.25, 0.1, 0.24, 0.18, 0.04, '#55b8cf', '#263f42', 0);
}

function createStreet(parallax: THREE.Group, world: THREE.Group) {
  for (let i = 0; i < 14; i += 1) {
    const cloud = makeBlobMesh(i % 2 ? '#b6e8df' : '#d4f2ed', 0.34 + (i % 3) * 0.08, 0.26, 80 + i, 0.78);
    cloud.position.set(-4.8 + i * 0.78, 2.1 - (i % 4) * 0.25, -6);
    cloud.scale.set(2.6, 0.36, 1);
    parallax.add(cloud);
  }
  addPoly(parallax, [[-5.8, 0.55], [-1.8, 1.05], [1.4, 0.95], [5.8, 1.35], [5.8, -0.2], [-5.8, -0.15]], -5.6, '#75cbc3', '#447b7b', false);
  addPoly(parallax, [[-5.8, -0.4], [-1.8, 0.3], [1.2, 0.14], [5.8, 0.52], [5.8, -0.72], [-5.8, -0.9]], -5.5, '#9edcd4', '#4c8180', false);
  addPoly(parallax, [[-5.8, 1.56], [-3.6, 1.35], [-2.0, 1.72], [0.4, 1.5], [2.2, 1.75], [5.8, 1.48], [5.8, 0.64], [-5.8, 0.62]], -5.4, '#b8eee6', '#6eb3ad', false);

  addPoly(world, [[-1.4, 1.4], [1.15, 1.3], [2.6, -3.2], [-2.65, -3.2]], -1.5, '#718985', '#263f42');
  addPoly(world, [[-2.9, 1.4], [-1.38, 1.4], [-2.72, -3.2], [-5.4, -3.2]], -1.3, '#c3bea4', '#263f42');
  addPoly(world, [[1.18, 1.3], [2.82, 1.4], [5.7, -3.2], [2.58, -3.2]], -1.3, '#c9c5ad', '#263f42');
  addPoly(world, [[-0.9, 0.9], [-0.62, 0.92], [-1.55, -2.25], [-1.78, -2.3]], 0.08, '#f2f1e7', '#f2f1e7', false);
  addPoly(world, [[0.88, 0.8], [1.05, 0.82], [1.62, -2.9], [1.4, -2.92]], 0.08, '#f2f1e7', '#f2f1e7', false);
  addPoly(world, [[-1.08, 0.76], [-0.93, 0.8], [-1.95, -0.66], [-2.38, -2.65], [-2.56, -2.68], [-2.1, -0.58]], 0.1, '#f8f7ed', '#f8f7ed', false);
  addFlatBox(world, box(0.1, 0.66, 0.44, 0.06, 0.46, 0.05, 0.04), '#6c7774', '#263f42', false);
  addDisc(world, 0.1, 0.94, 0.58, 0.13, '#e8ece5', '#9f4d3c', 18);
  addFlatBox(world, box(0.1, 0.94, 0.66, 0.13, 0.055, 0.04, 0), '#55b8cf', '#263f42', false);

  createLeftStreetObjects(world);
  createRightStreetObjects(world);
  createRoadsideNpc(world);
  createDeliveryItems(world);
  createVolumetricStreetObjects(world);
}

function createLeftStreetObjects(root: THREE.Group) {
  addPoly(root, [[-5.6, 2.65], [-3.4, 2.55], [-3.7, -3.15], [-5.8, -3.2]], 0.1, '#908d7c', '#263f42');
  addPoly(root, [[-6.2, -0.15], [-5.35, -0.05], [-5.56, -2.5], [-6.25, -2.58]], 0.52, '#e5ece4', '#263f42');
  addFlatBox(root, box(-5.66, -1.1, 0.78, 0.54, 0.24, 0.1, -0.08), '#244754', '#263f42');
  addDisc(root, -5.46, -2.08, 0.84, 0.16, '#1f3034', '#263f42', 14);
  addDisc(root, -5.94, -2.0, 0.84, 0.16, '#1f3034', '#263f42', 14);
  addFlatBox(root, box(-4.35, -0.65, 0.6, 1.1, 2.08, 0.12, 0.03), '#79cfc1', '#263f42');
  addFlatBox(root, box(-4.35, 0.34, 0.78, 0.94, 0.16, 0.08, 0.03), '#e9f5ee', '#263f42', false);
  addFlatBox(root, box(-4.35, -1.54, 0.78, 0.66, 0.12, 0.08, 0.03), '#153538', '#153538', false);
  const bottles: BoxPlacement[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      bottles.push(box(-4.76 + col * 0.14, 0.05 - row * 0.35, 0.92, 0.055, 0.22, 0.05, 0.02));
    }
  }
  addBoxInstances(root, bottles, '#eaf0e7', '#263f42', true);
  addFlatBox(root, box(-3.82, 1.03, 0.7, 0.12, 2.2, 0.08, -0.04), '#9aa69c', '#263f42');
  addDisc(root, -3.84, 1.86, 0.88, 0.34, '#d8d0bd', '#a75b2f', 24);
  addFlatBox(root, box(-3.78, 0.94, 0.9, 0.24, 0.56, 0.08, -0.04), '#e8ede9', '#263f42');
  addFlatBox(root, box(-3.64, -0.18, 0.9, 0.06, 1.4, 0.05, -0.03), '#b56034', '#263f42', false);
  addFlatBox(root, box(-3.72, 0.05, 0.7, 0.16, 0.42, 0.08, -0.04), '#e47742', '#7b3f2e');
  addFlatBox(root, box(-3.92, -0.34, 0.75, 0.18, 0.16, 0.08, -0.04), '#2b8faa', '#263f42');
  addPoly(root, [[-3.35, -0.92], [-3.12, -0.92], [-3.04, -1.32], [-3.44, -1.32]], 0.9, '#f18a42', '#263f42');
  addFlatBox(root, box(-3.24, -1.34, 0.92, 0.46, 0.08, 0.06, 0.02), '#e8ede4', '#263f42', false);
  addFlatBox(root, box(-5.28, -0.6, 0.7, 0.7, 1.22, 0.12, -0.12), '#d7ded8', '#263f42');
  addFlatBox(root, box(-5.58, -0.62, 0.78, 0.16, 0.5, 0.08, -0.12), '#194457', '#263f42');
}

function createRightStreetObjects(root: THREE.Group) {
  addPoly(root, [[2.1, 2.55], [4.8, 2.7], [4.9, -1.1], [2.02, -1.0]], 0.06, '#8d9184', '#263f42');
  for (let i = 0; i < 5; i += 1) {
    addFlatBox(root, box(3.46, 1.95 - i * 0.42, 0.36, 2.35, 0.08, 0.08, 0.03), '#5d6968', '#263f42', false);
  }
  addFlatBox(root, box(3.28, -0.02, 0.62, 1.2, 0.85, 0.1, 0.02), '#46afd0', '#263f42');
  addFlatBox(root, box(3.28, -0.12, 0.72, 0.88, 0.43, 0.08, 0.02), '#e9eee8', '#263f42', false);
  for (let i = 0; i < 4; i += 1) {
    addFlatBox(root, box(3.08 + i * 0.18, 0.18, 0.82, 0.1, 0.06, 0.06, 0.02), '#d6c45f', '#53636a', false);
  }
  addFlatBox(root, box(2.92, -0.12, 0.82, 0.08, 0.04, 0.04, 0.02), '#c98c37', '#c98c37', false);
  addFlatBox(root, box(3.1, -0.26, 0.82, 0.54, 0.035, 0.04, 0.02), '#53636a', '#53636a', false);
  addFlatBox(root, box(3.16, -0.38, 0.82, 0.64, 0.035, 0.04, 0.02), '#53636a', '#53636a', false);
  addFlatBox(root, box(4.4, -0.85, 0.78, 0.72, 2.0, 0.14, -0.1), '#79b06e', '#263f42');
  addFlatBox(root, box(4.96, -1.1, 0.82, 0.82, 2.4, 0.14, -0.1), '#74a865', '#263f42');
  addFlatBox(root, box(3.92, -1.85, 0.82, 0.18, 0.72, 0.08, -0.05), '#d99d36', '#263f42');
  addPoly(root, [[-0.05, 1.02], [2.15, 0.88], [2.48, 0.55], [-0.02, 0.72]], 0.42, '#c7ccc4', '#263f42');
  addFlatBox(root, box(1.4, 0.78, 0.58, 2.0, 0.08, 0.08, -0.02), '#7b8582', '#263f42', false);
  addFlatBox(root, box(1.45, 0.46, 0.58, 1.9, 0.08, 0.08, -0.02), '#7b8582', '#263f42', false);
  addPoly(root, [[2.18, -1.1], [3.16, -0.92], [3.05, -1.42], [2.08, -1.62]], 0.68, '#aeb6b0', '#263f42');
  addFlatBox(root, box(2.62, -1.26, 0.9, 0.86, 0.12, 0.08, 0.1), '#e9eee8', '#263f42', false);
  addFlatBox(root, box(2.56, -1.46, 0.9, 0.78, 0.08, 0.08, 0.1), '#e9eee8', '#263f42', false);
  addPoly(root, [[1.98, -2.0], [3.34, -1.68], [3.12, -2.92], [1.88, -3.18]], 0.5, '#bbbaa0', '#263f42');
  addFlatBox(root, box(2.56, -2.08, 0.78, 1.22, 0.13, 0.08, 0.15), '#5e6967', '#263f42', false);
}

function createRoadsideNpc(root: THREE.Group) {
  const npc = new THREE.Group();
  npc.position.set(-4.02, -0.3, 1.72);
  npc.scale.setScalar(0.54);
  root.add(npc);
  createCharacter(npc, 'npc');
  addFlatBox(root, box(-3.72, -0.58, 1.5, 0.18, 0.32, 0.08, -0.06), '#2b8faa', '#263f42');
}

function createDeliveryItems(root: THREE.Group) {
  addFlatBox(root, box(-1.18, -1.55, 1.0, 0.62, 0.34, 0.1, -0.22), '#efe7d3', '#263f42');
  addFlatBox(root, box(-1.16, -1.54, 1.12, 0.5, 0.035, 0.04, -0.22), '#c26b46', '#c26b46', false);
  addFlatBox(root, box(1.42, -1.2, 1.0, 0.5, 0.26, 0.1, 0.18), '#f3f0e5', '#263f42');
  addFlatBox(root, box(1.42, -1.18, 1.12, 0.42, 0.035, 0.04, 0.18), '#5ea9b4', '#5ea9b4', false);
  addPoly(root, [[-2.55, -0.4], [-2.05, -0.48], [-1.96, -0.66], [-2.42, -0.75]], 0.92, '#f7f7ee', '#263f42');
  addFlatBox(root, box(-2.26, -0.58, 1.0, 0.38, 0.035, 0.04, -0.12), '#d65b49', '#d65b49', false);
  addFlatBox(root, box(2.42, -0.66, 1.02, 0.48, 0.28, 0.1, -0.18), '#d5d8cb', '#263f42');
  addFlatBox(root, box(2.36, -0.52, 1.12, 0.22, 0.06, 0.05, -0.18), '#6b8e72', '#6b8e72', false);
  addPoly(root, [[0.2, -2.08], [0.82, -2.03], [0.65, -2.36], [0.04, -2.3]], 1.02, '#447f8a', '#263f42');
  addFlatBox(root, box(0.44, -2.18, 1.12, 0.48, 0.04, 0.05, 0.08), '#e6d36c', '#e6d36c', false);
  addDisc(root, 2.68, -1.78, 1.02, 0.16, '#f0c64f', '#263f42', 10);
  addFlatBox(root, box(2.7, -1.96, 1.0, 0.1, 0.3, 0.05, 0.06), '#5f6f6b', '#263f42', false);
}

function createVolumetricStreetObjects(root: THREE.Group) {
  addPartBox(root, -5.72, -1.16, 0.95, 0.9, 1.98, 0.56, '#e8eee5', '#263f42', -0.12, 0.28);
  addPartBox(root, -5.48, -1.08, 1.25, 0.52, 0.28, 0.08, '#244754', '#263f42', -0.08, 0.18);
  addSolidCylinder(root, -5.44, -2.02, 1.3, 0.16, 0.16, 0.15, '#1f3034', '#263f42', 12, Math.PI / 2, 1.0, 0.5);
  addSolidCylinder(root, -5.96, -1.94, 1.3, 0.16, 0.16, 0.15, '#1f3034', '#263f42', 12, Math.PI / 2, 1.0, 0.5);

  addPartBox(root, -4.34, -0.65, 1.06, 1.08, 2.08, 0.48, '#7bd5c5', '#263f42', 0.03, -0.22);
  addPartBox(root, -4.35, 0.35, 1.36, 0.86, 0.2, 0.08, '#f2f6ee', '#263f42', 0.03, -0.16);
  addPartBox(root, -4.35, -1.55, 1.38, 0.7, 0.14, 0.08, '#153538', '#153538', 0.03, -0.16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      addSolidCylinder(
        root,
        -4.7 + col * 0.17,
        0.05 - row * 0.35,
        1.42,
        0.035,
        0.045,
        0.23,
        col % 2 ? '#e8efe7' : '#6ca8b1',
        '#263f42',
        8,
        0,
        0.72,
        0.72,
      );
    }
  }

  addSolidCylinder(root, -3.82, 1.06, 1.08, 0.05, 0.05, 2.05, '#9aa69c', '#263f42', 8, 0, 0.72, 0.72);
  addSolidCylinder(root, -3.84, 1.85, 1.36, 0.34, 0.34, 0.08, '#d8d0bd', '#a75b2f', 24, Math.PI / 2, 1.0, 0.22);
  addSolidCylinder(root, -3.23, -1.12, 1.22, 0.18, 0.28, 0.44, '#f18a42', '#263f42', 4, 0, 0.92, 0.92);
  addPartBox(root, -3.23, -1.36, 1.22, 0.46, 0.08, 0.12, '#e8ede4', '#263f42', 0.02, -0.1);

  addPartBox(root, 3.42, 0.74, 0.94, 2.58, 3.64, 0.62, '#8e9388', '#263f42', 0.02, -0.18);
  for (let i = 0; i < 5; i += 1) {
    addPartBox(root, 3.45, 1.94 - i * 0.42, 1.34, 2.2, 0.08, 0.08, '#5d6968', '#263f42', 0.03, -0.12);
  }
  addPartBox(root, 3.27, -0.04, 1.5, 1.2, 0.86, 0.18, '#46afd0', '#263f42', 0.02, -0.12);
  addPartBox(root, 3.27, -0.12, 1.62, 0.85, 0.44, 0.08, '#f3f1df', '#263f42', 0.02, -0.08);
  for (let i = 0; i < 5; i += 1) {
    addPartBox(root, 3.0 + i * 0.18, 0.2, 1.7, 0.1, 0.06, 0.04, '#d6c45f', '#53636a', 0.02, -0.05);
  }
  addPartBox(root, 3.12, -0.25, 1.7, 0.56, 0.04, 0.04, '#53636a', '#53636a', 0.02, -0.05);
  addPartBox(root, 3.2, -0.38, 1.7, 0.7, 0.04, 0.04, '#53636a', '#53636a', 0.02, -0.05);
  addPartBox(root, 4.44, -0.84, 1.24, 0.78, 2.02, 0.58, '#82bb70', '#263f42', -0.1, -0.24);
  addPartBox(root, 4.98, -1.1, 1.22, 0.88, 2.46, 0.62, '#78ad68', '#263f42', -0.1, -0.24);
  addSolidCylinder(root, 3.94, -1.78, 1.28, 0.08, 0.09, 0.76, '#d99d36', '#263f42', 10, 0, 0.85, 0.85);

  addPartBox(root, 2.62, -1.22, 1.22, 0.9, 0.16, 0.3, '#e9eee8', '#263f42', 0.1, -0.24);
  addPartBox(root, 2.6, -1.48, 1.22, 0.82, 0.1, 0.26, '#e9eee8', '#263f42', 0.1, -0.24);
  addPartBox(root, 2.55, -2.1, 1.08, 1.22, 0.16, 0.34, '#5e6967', '#263f42', 0.15, -0.2);

  addPartBox(root, -1.18, -1.56, 1.36, 0.62, 0.36, 0.32, '#efe7d3', '#263f42', -0.22, 0.18);
  addPartBox(root, 1.42, -1.2, 1.34, 0.5, 0.28, 0.3, '#f3f0e5', '#263f42', 0.18, -0.18);
  addPartBox(root, 0.42, -2.18, 1.34, 0.66, 0.12, 0.22, '#447f8a', '#263f42', 0.08, -0.16);
}

function createCharacter(root: THREE.Group, facing: 'front' | 'back' | 'npc'): CharacterRig {
  const group = new THREE.Group();
  root.add(group);

  const isBack = facing === 'back';
  const shirt = facing === 'npc' ? '#c75c43' : '#203638';
  const pants = facing === 'npc' ? '#1f2d31' : '#202d2e';
  const hair = '#262a34';
  const skin = '#f1c4b3';
  const shadow = makeBlobMesh('#415f60', 0.42, 0.18, facing === 'npc' ? 156 : 154, 0.38);
  shadow.position.set(0.03, -0.56, -0.2);
  shadow.scale.set(1.42, 0.34, 1);
  group.add(shadow);

  const torso = addPartBox(group, 0, 0.83, 0, 0.6, 0.92, 0.36, shirt, '#14292b', 0, isBack ? 0.08 : -0.04);
  const trim = addPartBox(group, 0, 0.38, 0.22, 0.58, 0.06, 0.04, '#f3c544', '#7a6730');
  const sash = addPartBox(group, 0.22, 0.94, 0.24, 0.12, 0.92, 0.06, '#3c4747', '#14292b', -0.45);
  addPartBox(group, 0, 1.26, 0.23, 0.5, 0.055, 0.045, '#f3c544', '#7a6730');
  addPartBox(group, -0.34, 1.08, 0.21, 0.08, 0.42, 0.045, '#f3c544', '#7a6730', -0.05);
  addPartBox(group, 0.34, 1.08, 0.21, 0.08, 0.42, 0.045, '#f3c544', '#7a6730', 0.05);
  addPartBox(group, 0.16, 1.04, 0.25, 0.09, 0.12, 0.04, '#f3c544', '#7a6730', -0.2);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-0.47, 1.12, 0.03);
  rightArm.position.set(0.47, 1.12, 0.03);
  group.add(leftArm, rightArm);
  addPartBox(leftArm, 0.01, -0.1, 0.02, 0.18, 0.19, 0.14, shirt, '#14292b', -0.12);
  addPartBox(rightArm, -0.01, -0.1, 0.02, 0.18, 0.19, 0.14, shirt, '#14292b', 0.12);
  addPartBox(leftArm, 0, -0.17, 0.1, 0.16, 0.045, 0.035, '#f3c544', '#7a6730', -0.12);
  addPartBox(rightArm, 0, -0.17, 0.1, 0.16, 0.045, 0.035, '#f3c544', '#7a6730', 0.12);
  addPartLimb(leftArm, 0, -0.36, 0, 0.072, 0.088, 0.68, 0.94, skin, '#9d6f66', -0.04);
  addPartLimb(rightArm, 0, -0.36, 0, 0.072, 0.088, 0.68, 0.94, skin, '#9d6f66', 0.04);
  addPartSphere(leftArm, 0, -0.74, 0.01, 0.09, 0.1, 0.08, skin, '#9d6f66');
  addPartSphere(rightArm, 0, -0.74, 0.01, 0.09, 0.1, 0.08, skin, '#9d6f66');

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.18, 0.38, -0.02);
  rightLeg.position.set(0.18, 0.38, -0.02);
  group.add(leftLeg, rightLeg);
  addPartLimb(leftLeg, 0, -0.39, 0, 0.1, 0.12, 0.78, 0.92, pants, '#14292b');
  addPartLimb(rightLeg, 0, -0.39, 0, 0.1, 0.12, 0.78, 0.92, pants, '#14292b');
  if (isBack) {
    addPartBox(leftLeg, 0, -0.72, 0.04, 0.18, 0.2, 0.07, '#f0efe7', '#263f42');
    addPartBox(rightLeg, 0, -0.72, 0.04, 0.18, 0.2, 0.07, '#f0efe7', '#263f42');
  }
  const leftShoe = addPartBox(leftLeg, -0.02, -0.86, 0.08, 0.34, 0.16, 0.32, '#cf5748', '#633632', -0.08);
  const rightShoe = addPartBox(rightLeg, 0.02, -0.86, 0.08, 0.34, 0.16, 0.32, '#cf5748', '#633632', 0.08);
  addPartBox(leftLeg, -0.03, -0.82, 0.27, 0.18, 0.035, 0.035, '#f6f4e8', '#f6f4e8', -0.42);
  addPartBox(leftLeg, 0.02, -0.83, 0.27, 0.18, 0.035, 0.035, '#f6f4e8', '#f6f4e8', 0.42);
  addPartBox(rightLeg, -0.02, -0.82, 0.27, 0.18, 0.035, 0.035, '#f6f4e8', '#f6f4e8', -0.42);
  addPartBox(rightLeg, 0.03, -0.83, 0.27, 0.18, 0.035, 0.035, '#f6f4e8', '#f6f4e8', 0.42);

  const head = addPartSphere(group, 0, 1.45, 0.08, 0.29, 0.28, 0.28, skin, ink);
  const hairCap = addPartBox(group, -0.05, 1.6, 0.17, 0.54, 0.22, 0.16, hair, '#151c22', -0.18, -0.08);
  const hairSide = addPartBox(group, -0.25, 1.47, 0.18, 0.19, 0.3, 0.12, hair, '#151c22', 0.2, -0.1);
  const hairSideRight = addPartBox(group, 0.25, 1.47, 0.18, 0.18, 0.28, 0.12, hair, '#151c22', -0.16, 0.08);
  const hairBangA = addPartBox(group, -0.12, 1.58, 0.34, 0.2, 0.075, 0.055, hair, '#151c22', -0.28, -0.08);
  const hairBangB = addPartBox(group, 0.06, 1.57, 0.34, 0.16, 0.065, 0.055, hair, '#151c22', 0.18, -0.08);
  const hairNape = addPartBox(group, -0.02, 1.35, -0.18, 0.46, 0.24, 0.16, hair, '#151c22', 0.08, 0.04);
  const hairBack = addPartSphere(group, 0, 1.48, -0.12, 0.32, 0.32, 0.2, hair, '#151c22');
  const nose = addPartBox(group, 0.01, 1.39, 0.36, 0.048, 0.04, 0.04, skin, '#9d6f66', 0.05);
  const leftPad = addPartSphere(group, -0.31, 1.48, 0.16, 0.12, 0.16, 0.085, '#f8f9ed', ink);
  const rightPad = addPartSphere(group, 0.31, 1.48, 0.16, 0.12, 0.16, 0.085, '#f8f9ed', ink);
  addPartBox(group, 0, 1.66, 0.08, 0.48, 0.045, 0.045, ink, ink, 0.02);
  const sideEyeLeft = addPartBox(group, -0.29, 1.43, 0.08, 0.025, 0.034, 0.05, '#121719', '#121719', -0.02, -0.12);
  const sideEyeRight = addPartBox(group, 0.29, 1.43, 0.08, 0.025, 0.034, 0.05, '#121719', '#121719', 0.02, 0.12);
  const sideNoseLeft = addPartBox(group, -0.31, 1.39, 0.13, 0.04, 0.036, 0.055, skin, '#9d6f66', 0.02, -0.2);
  const sideNoseRight = addPartBox(group, 0.31, 1.39, 0.13, 0.04, 0.036, 0.055, skin, '#9d6f66', -0.02, 0.2);
  const sideMouthLeft = addPartBox(group, -0.28, 1.32, 0.11, 0.02, 0.02, 0.07, '#9a5f59', '#9a5f59', 0.02, -0.12);
  const sideMouthRight = addPartBox(group, 0.28, 1.32, 0.11, 0.02, 0.02, 0.07, '#9a5f59', '#9a5f59', -0.02, 0.12);

  if (!isBack) {
    addPartBox(group, -0.09, 1.43, 0.34, 0.048, 0.028, 0.022, '#121719', '#121719', -0.06);
    addPartBox(group, 0.09, 1.43, 0.34, 0.048, 0.028, 0.022, '#121719', '#121719', 0.06);
    addPartBox(group, 0, 1.32, 0.34, 0.12, 0.022, 0.022, '#9a5f59', '#9a5f59', -0.02);
  } else {
    addPartBox(group, -0.09, 1.43, -0.2, 0.048, 0.028, 0.022, '#121719', '#121719', -0.06);
    addPartBox(group, 0.09, 1.43, -0.2, 0.048, 0.028, 0.022, '#121719', '#121719', 0.06);
    addPartBox(group, 0, 1.32, -0.2, 0.12, 0.022, 0.022, '#9a5f59', '#9a5f59', -0.02);
    addPartBox(group, -0.02, 1.6, -0.17, 0.42, 0.16, 0.1, hair, '#151c22', 0.12, 0.05);
  }

  let bag: THREE.Mesh | null = null;
  if (facing !== 'npc') {
    bag = addPartSphere(group, -0.13, 0.78, -0.24, 0.28, 0.4, 0.17, '#56635f', '#263f42');
    addPartBox(group, -0.08, 1.02, -0.12, 0.11, 0.64, 0.06, '#56635f', '#263f42', -0.42);
  }
  if (isBack) {
    addPartBox(group, -0.04, 0.98, 0.34, 0.1, 0.62, 0.06, '#4a5551', '#263f42', -0.43);
  }

  const baseHeadY = head.position.y;
  const baseHairY = hairCap.position.y;
  const baseLeftPadY = leftPad.position.y;
  const baseRightPadY = rightPad.position.y;
  const baseSideEyeLeftY = sideEyeLeft.position.y;
  const baseSideEyeRightY = sideEyeRight.position.y;
  const baseSideNoseLeftY = sideNoseLeft.position.y;
  const baseSideNoseRightY = sideNoseRight.position.y;
  const baseSideMouthLeftY = sideMouthLeft.position.y;
  const baseSideMouthRightY = sideMouthRight.position.y;
  const baseHairSideY = hairSide.position.y;
  const baseHairSideRightY = hairSideRight.position.y;
  const baseHairBangAY = hairBangA.position.y;
  const baseHairBangBY = hairBangB.position.y;
  const baseHairNapeY = hairNape.position.y;
  const baseHairBackY = hairBack.position.y;
  const baseNoseY = nose.position.y;
  const baseLeftShoeY = leftShoe.position.y;
  const baseRightShoeY = rightShoe.position.y;
  const baseLeftShoeZ = leftShoe.position.z;
  const baseRightShoeZ = rightShoe.position.z;

  return {
    group,
    setMotion(phase: number, speed: number, heading: number) {
      const stride = Math.sin(phase * 9.8) * speed;
      const lift = Math.abs(Math.cos(phase * 9.8)) * speed;
      const leftStep = Math.max(0, stride);
      const rightStep = Math.max(0, -stride);
      const lean = Math.max(-1, Math.min(1, heading));
      group.position.y = lift * 0.028;
      group.rotation.x = -speed * 0.025;
      group.rotation.y = lean * -0.12;
      group.rotation.z = lean * -0.045;
      torso.rotation.z = lean * -0.05 + Math.sin(phase * 19.6) * speed * 0.016;
      trim.rotation.z = torso.rotation.z;
      sash.rotation.z = -0.45 + torso.rotation.z * 0.4;
      leftLeg.rotation.x = stride * 0.52;
      rightLeg.rotation.x = -stride * 0.52;
      leftLeg.rotation.z = stride * 0.1 + lean * -0.025;
      rightLeg.rotation.z = -stride * 0.1 + lean * -0.025;
      leftLeg.position.y = 0.38 + leftStep * 0.05;
      rightLeg.position.y = 0.38 + rightStep * 0.05;
      leftLeg.position.z = -0.02 - stride * 0.13;
      rightLeg.position.z = -0.02 + stride * 0.13;
      leftArm.rotation.x = -stride * 0.42;
      rightArm.rotation.x = stride * 0.42;
      leftArm.rotation.z = -stride * 0.25 - 0.06 + lean * -0.04;
      rightArm.rotation.z = stride * 0.25 + 0.06 + lean * -0.04;
      leftShoe.position.y = baseLeftShoeY + leftStep * 0.035;
      rightShoe.position.y = baseRightShoeY + rightStep * 0.035;
      leftShoe.position.z = baseLeftShoeZ - stride * 0.04;
      rightShoe.position.z = baseRightShoeZ + stride * 0.04;
      leftShoe.rotation.x = leftStep * -0.22;
      rightShoe.rotation.x = rightStep * -0.22;
      leftShoe.rotation.z = -0.08 - stride * 0.065;
      rightShoe.rotation.z = 0.08 + stride * 0.065;
      head.rotation.y = lean * 0.14;
      head.position.y = baseHeadY + lift * 0.032;
      hairCap.position.y = baseHairY + lift * 0.032;
      hairSide.position.y = baseHairSideY + lift * 0.032;
      hairSideRight.position.y = baseHairSideRightY + lift * 0.032;
      leftPad.position.y = baseLeftPadY + lift * 0.032;
      rightPad.position.y = baseRightPadY + lift * 0.032;
      sideEyeLeft.position.y = baseSideEyeLeftY + lift * 0.032;
      sideEyeRight.position.y = baseSideEyeRightY + lift * 0.032;
      sideNoseLeft.position.y = baseSideNoseLeftY + lift * 0.032;
      sideNoseRight.position.y = baseSideNoseRightY + lift * 0.032;
      sideMouthLeft.position.y = baseSideMouthLeftY + lift * 0.032;
      sideMouthRight.position.y = baseSideMouthRightY + lift * 0.032;
      hairBangA.position.y = baseHairBangAY + lift * 0.032;
      hairBangB.position.y = baseHairBangBY + lift * 0.032;
      hairNape.position.y = baseHairNapeY + lift * 0.032;
      hairBack.position.y = baseHairBackY + lift * 0.032;
      nose.position.y = baseNoseY + lift * 0.032;
      if (bag) {
        bag.rotation.z = -0.18 + Math.sin(phase * 9.8 + 1.2) * speed * 0.18 + lean * 0.08;
      }
    },
  };
}

function addPartBox(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: string,
  edge: string,
  rotationZ = 0,
  rotationY = 0,
) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.set(0, rotationY, rotationZ);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const silhouette = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshBasicMaterial({ color: edge, side: THREE.BackSide }),
  );
  silhouette.castShadow = false;
  silhouette.receiveShadow = false;
  silhouette.scale.setScalar(1.035);
  mesh.add(silhouette);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.scale.setScalar(1.008);
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addPartSphere(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  color: string,
  edge: string,
) {
  const geometry = new THREE.SphereGeometry(1, 12, 8);
  const outline = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshBasicMaterial({ color: edge, side: THREE.BackSide }),
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.scale.set(radiusX, radiusY, radiusZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  outline.position.set(0, 0, -0.01);
  outline.scale.setScalar(1.055);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addPartLimb(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  depthScale: number,
  color: string,
  edge: string,
  rotationZ = 0,
) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotationZ;
  mesh.scale.z = depthScale;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const outline = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshBasicMaterial({ color: edge, side: THREE.BackSide }),
  );
  outline.scale.set(1.08, 1.03, 1.08);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addSolidCylinder(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: string,
  edge: string,
  radialSegments = 10,
  rotationX = 0,
  scaleX = 1,
  scaleZ = 1,
) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotationX, 0, 0);
  mesh.scale.set(scaleX, 1, scaleZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.scale.set(1.01, 1.01, 1.01);
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addBox3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: string,
  edge: string,
  yaw = 0,
) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  mesh.scale.set(width, height, depth);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  const silhouette = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshBasicMaterial({ color: edge, side: THREE.BackSide }),
  );
  silhouette.castShadow = false;
  silhouette.receiveShadow = false;
  silhouette.scale.setScalar(1.035);
  mesh.add(silhouette);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.scale.setScalar(1.008);
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addGroundBox(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: string,
  edge: string,
  yaw = 0,
) {
  const mesh = addBox3D(root, x, y, z, width, height, depth, color, edge, yaw);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function addCylinder3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  color: string,
  edge: string,
  radialSegments = 10,
  rotationX = 0,
  scaleX = 1,
  scaleZ = 1,
) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.x = rotationX;
  mesh.scale.set(scaleX, 1, scaleZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.scale.setScalar(1.01);
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addCylinderRotated3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  color: string,
  edge: string,
  radialSegments = 10,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  scaleX = 1,
  scaleZ = 1,
) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotationX, rotationY, rotationZ);
  mesh.scale.set(scaleX, 1, scaleZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.scale.setScalar(1.01);
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addCone3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  color: string,
  edge: string,
) {
  const geometry = new THREE.ConeGeometry(radius, height, 4);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.set(x, y + height / 2, z);
  mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.scale.setScalar(1.01);
  mesh.add(outline);
  root.add(mesh);
  return mesh;
}

function addGroundPoly3D(
  root: THREE.Group,
  points: Vec2[],
  y: number,
  color: string,
  edge: string,
) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color }));
  mesh.position.y = y;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);

  const linePoints = [...points, points[0]].map(([x, z]) => new THREE.Vector3(x, y + 0.015, z));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  line.castShadow = false;
  line.receiveShadow = false;
  root.add(line);
}

function addGroundBlob3D(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  color: string,
  seed: number,
  opacity = 1,
) {
  const rand = rng(seed);
  const shape = new THREE.Shape();
  const points = 18;
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const radius = 0.5 * (0.72 + rand() * 0.4);
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.7,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, 1, depth);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
  return mesh;
}

function addGroundCurve3D(
  root: THREE.Group,
  points: Vec2[],
  color: string,
  radius: number,
  opacity = 1,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0.112, z)),
    false,
    'catmullrom',
    0.35,
  );
  const geometry = new THREE.TubeGeometry(curve, 22, radius, 5, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  root.add(mesh);
  return mesh;
}

function addSkyBlob(root: THREE.Group, points: Vec2[], color: string, edge: string) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color }),
  );
  root.add(mesh);

  const linePoints = [...points, points[0]].map(([x, y]) => new THREE.Vector3(x, y, 0.03));
  root.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.45 }),
  ));
}

function addDisc(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  color: string,
  edge: string,
  sides: number,
) {
  addDiscInstances(root, [{ x, y, z, rotation: 0, scale: 1 }], color, edge, radius, sides);
}

function addPoly(
  root: THREE.Group,
  points: Vec2[],
  z: number,
  color: string,
  edge: string,
  shadow = true,
) {
  if (shadow) {
    const shadowPoints = points.map(([x, y]) => [x + 0.035, y - 0.045] as Vec2);
    addPoly(root, shadowPoints, z - 0.05, edge, edge, false);
  }
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.z = z;
  root.add(mesh);

  const linePoints = [...points, points[0]].map(([x, y]) => new THREE.Vector3(x, y, z + 0.02));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({ color: edge }),
  );
  root.add(line);
}

function addFlatBox(root: THREE.Group, placement: BoxPlacement, color: string, edge: string, shadow = true) {
  if (shadow) {
    const shadowPlacement = {
      ...placement,
      x: placement.x + 0.035,
      y: placement.y - 0.045,
      z: placement.z - 0.05,
      width: placement.width * 1.05,
      height: placement.height * 1.07,
    };
    addBoxInstances(root, [shadowPlacement], edge, edge, false);
  }
  addBoxInstances(root, [placement], color, edge, false);
}

function addBoxInstances(
  root: THREE.Group,
  placements: BoxPlacement[],
  color: string,
  shadowColor: string,
  addShadow = true,
) {
  if (placements.length === 0) return;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshToonMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();

  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, p.rotation);
    dummy.scale.set(p.width, p.height, p.depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  root.add(mesh);

  if (!addShadow) return;
  const shadow = new THREE.InstancedMesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: shadowColor }), placements.length);
  placements.forEach((p, i) => {
    dummy.position.set(p.x + 0.035, p.y - 0.045, p.z - 0.05);
    dummy.rotation.set(0, 0, p.rotation);
    dummy.scale.set(p.width * 1.05, p.height * 1.07, p.depth);
    dummy.updateMatrix();
    shadow.setMatrixAt(i, dummy.matrix);
  });
  shadow.instanceMatrix.needsUpdate = true;
  shadow.computeBoundingSphere();
  shadow.frustumCulled = true;
  shadow.matrixAutoUpdate = false;
  root.add(shadow);
}

function addDiscInstances(
  root: THREE.Group,
  placements: DiscPlacement[],
  color: string,
  shadowColor: string,
  radius: number,
  sides: number,
) {
  if (placements.length === 0) return;
  const geometry = new THREE.CircleGeometry(radius, sides);
  const material = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();

  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, p.rotation);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;

  const shadow = new THREE.InstancedMesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: shadowColor }), placements.length);
  placements.forEach((p, i) => {
    dummy.position.set(p.x + 0.025, p.y - 0.025, p.z - 0.04);
    dummy.rotation.set(0, 0, p.rotation);
    dummy.scale.setScalar(p.scale * 1.05);
    dummy.updateMatrix();
    shadow.setMatrixAt(i, dummy.matrix);
  });
  shadow.instanceMatrix.needsUpdate = true;
  shadow.computeBoundingSphere();
  shadow.frustumCulled = true;
  shadow.matrixAutoUpdate = false;

  root.add(shadow, mesh);
}

function makeBlobMesh(color: string, radius: number, wobble: number, seed: number, opacity = 1) {
  const rand = rng(seed);
  const shape = new THREE.Shape();
  const points = 26;
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (1 - wobble / 2 + rand() * wobble);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

function makePlanetPlacements() {
  const rand = rng(48);
  const groups = {
    buildingLight: [] as BoxPlacement[],
    buildingWarm: [] as BoxPlacement[],
    buildingDark: [] as BoxPlacement[],
    roofs: [] as BoxPlacement[],
    details: [] as BoxPlacement[],
    trees: [] as DiscPlacement[],
    treeDark: [] as DiscPlacement[],
    rocks: [] as DiscPlacement[],
  };

  for (let i = 0; i < 112; i += 1) {
    const [x, y] = pointInDisc(rand, 2.22, 0.28);
    const rotation = rand() * Math.PI;
    const width = 0.12 + rand() * 0.38;
    const height = 0.1 + rand() * 0.34;
    const depth = 0.08 + rand() * 0.12;
    const z = 0.05 + rand() * 0.34;
    const p = box(x, y, z, width, height, depth, rotation);

    if (i % 17 === 0) groups.buildingDark.push(p);
    else if (i % 9 === 0) groups.roofs.push(p);
    else if (i % 7 === 0) groups.buildingWarm.push(p);
    else groups.buildingLight.push(p);

    if (i % 2 === 0) {
      groups.details.push(
        box(
          x + (rand() - 0.5) * width * 0.7,
          y + (rand() - 0.5) * height * 0.4,
          z + 0.12,
          width * (0.45 + rand() * 0.25),
          0.022,
          0.035,
          rotation,
        ),
      );
    }
  }

  for (let i = 0; i < 108; i += 1) {
    const edgeBias = i < 68 ? 1.82 + rand() * 0.62 : 0.75 + rand() * 1.45;
    const angle = rand() * Math.PI * 2;
    const p = {
      x: Math.cos(angle) * edgeBias,
      y: Math.sin(angle) * edgeBias * 0.92,
      z: 0.36 + rand() * 0.24,
      rotation: rand() * Math.PI,
      scale: 0.75 + rand() * 1.25,
    };
    if (i % 3 === 0) groups.treeDark.push(p);
    else groups.trees.push(p);
  }

  for (let i = 0; i < 32; i += 1) {
    const [x, y] = pointInDisc(rand, 2.58, 1.68);
    groups.rocks.push({
      x,
      y,
      z: 0.32 + rand() * 0.14,
      rotation: rand() * Math.PI,
      scale: 0.7 + rand() * 1.4,
    });
  }

  return groups;
}

function pointInDisc(rand: () => number, radius: number, minRadius = 0): Vec2 {
  const angle = rand() * Math.PI * 2;
  const r = minRadius + Math.sqrt(rand()) * (radius - minRadius);
  return [Math.cos(angle) * r, Math.sin(angle) * r * 0.94];
}

function box(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  rotation: number,
): BoxPlacement {
  return { x, y, z, width, height, depth, rotation };
}

function angleDelta(current: number, target: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
