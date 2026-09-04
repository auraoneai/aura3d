import * as THREE from "three";
import { camera, createAuraApp, instances, material, scene } from "@aura3d/engine";

/**
 * PART K1 fresh same-scene head-to-head (muse3jsparity-PRD task 1, lane 1).
 *
 * A NEW capture, not a copy of the D1 shootout: 96 emissive boxes on a
 * deterministic 12 x 4 x 2 grid, identical placement/math both sides, same
 * background, same camera framing, same canvas size. Aura renders through
 * the root `createAuraApp` path only; the opponent is the repository-locked
 * `three@0.185.1` `WebGLRenderer`. No similarity claim is made (different
 * renderers shade differently by construction); the receipt records both
 * captures plus the disclosed per-pixel delta.
 */

const INSTANCE_COUNT = 96;
const COLS = 12;
const ROWS = 4;
const LAYERS = 2;
const SPACING = 0.62;
const BOX_SIZE = 0.44;
const BOX_COLOR = "#e08a3c";
const BACKGROUND = "#0d1520";
const CAMERA_POSITION: readonly [number, number, number] = [0, 2.6, 8.0];
const CAMERA_TARGET: readonly [number, number, number] = [0, 0.8, 0];

interface HeadToHeadPixels {
  readonly nonDarkPixels: number;
  readonly foregroundPixels: number;
  readonly checksum: number;
}

interface GameVisualSuperiorityResult {
  readonly status: "ready" | "error" | "waiting";
  readonly threeRevision?: string;
  readonly instanceCount?: number;
  readonly aura?: {
    readonly errors: readonly string[];
    readonly pixels: HeadToHeadPixels;
  };
  readonly three?: {
    readonly calls: number;
    readonly triangles: number;
    readonly pixels: HeadToHeadPixels;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_GAME_VISUAL_SUPERIORITY__?: GameVisualSuperiorityResult;
  }
}

window.__AURA3D_GAME_VISUAL_SUPERIORITY__ = { status: "waiting" };

function gridPosition(index: number): readonly [number, number, number] {
  const col = index % COLS;
  const row = Math.floor(index / COLS) % ROWS;
  const layer = Math.floor(index / (COLS * ROWS));
  return [
    (col - (COLS - 1) / 2) * SPACING,
    0.3 + row * SPACING,
    (layer - (LAYERS - 1) / 2) * SPACING,
  ];
}

function waitForFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

async function analyzePixels(dataUrl: string): Promise<HeadToHeadPixels> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d pixel analysis context is unavailable.");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonDark = 0;
  let foreground = 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r + g + b > 24) nonDark += 1;
    // Background is #0d1520 (13, 21, 32): boxes must stand far clear of it.
    if (Math.abs(r - 13) + Math.abs(g - 21) + Math.abs(b - 32) > 60) foreground += 1;
    hash ^= data[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return { nonDarkPixels: nonDark, foregroundPixels: foreground, checksum: hash >>> 0 };
}

void runHeadToHead().catch((error: unknown) => {
  window.__AURA3D_GAME_VISUAL_SUPERIORITY__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
});

async function runHeadToHead(): Promise<void> {
  const auraCanvas = document.querySelector<HTMLCanvasElement>("#aura");
  const threeCanvas = document.querySelector<HTMLCanvasElement>("#three");
  if (!auraCanvas || !threeCanvas) throw new Error("Head-to-head canvases are missing.");

  const app = createAuraApp(auraCanvas, {
    scene: scene()
      .background(BACKGROUND)
      .add(
        instances.box({
          name: "k1 head-to-head instanced boxes",
          transforms: Array.from({ length: INSTANCE_COUNT }, (_, index) => {
            const [x, y, z] = gridPosition(index);
            return {
              position: [x, y, z] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [BOX_SIZE, BOX_SIZE, BOX_SIZE] as [number, number, number],
            };
          }),
          material: material.emissive({
            name: "k1 head-to-head boxes",
            color: BOX_COLOR,
            emissive: BOX_COLOR,
            emissiveIntensity: 1,
          }),
        })
      )
      .camera(camera.perspective({ position: [...CAMERA_POSITION], target: [...CAMERA_TARGET], fov: 50 })),
    pixelRatio: 1,
    resize: false,
  });
  await waitForFrames(6);
  const auraDiagnostics = app.diagnostics();
  if (auraDiagnostics.errors.length > 0) throw new Error(auraDiagnostics.errors.join("\n"));
  const auraPixels = await analyzePixels(app.screenshot().dataUrl);

  const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(threeCanvas.width, threeCanvas.height, false);
  renderer.setPixelRatio(1);
  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(BACKGROUND);
  const threeCamera = new THREE.PerspectiveCamera(
    50,
    threeCanvas.width / threeCanvas.height,
    0.1,
    100
  );
  threeCamera.position.set(...CAMERA_POSITION);
  threeCamera.lookAt(...CAMERA_TARGET);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshBasicMaterial({ color: BOX_COLOR });
  for (let index = 0; index < INSTANCE_COUNT; index += 1) {
    const [x, y, z] = gridPosition(index);
    const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(BOX_SIZE, BOX_SIZE, BOX_SIZE)
    );
    threeScene.add(mesh);
  }
  renderer.render(threeScene, threeCamera);
  const calls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  const threePixels = await analyzePixels(threeCanvas.toDataURL("image/png"));

  // Fail-closed framing guard: the root app must not resize the canvas away
  // from the shared 600x380 geometry (a resize would break same-scene framing).
  if (auraCanvas.clientWidth !== 600 || auraCanvas.clientHeight !== 380) {
    throw new Error(
      `Aura canvas resized away from shared framing: client ${auraCanvas.clientWidth}x${auraCanvas.clientHeight}.`
    );
  }
  window.__AURA3D_GAME_VISUAL_SUPERIORITY__ = {
    status: "ready",
    threeRevision: THREE.REVISION,
    instanceCount: INSTANCE_COUNT,
    aura: { errors: [], pixels: auraPixels },
    three: { calls, triangles, pixels: threePixels },
  };
}
