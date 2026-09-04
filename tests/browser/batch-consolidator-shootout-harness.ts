import * as THREE from "three";
import { camera, createAuraApp, instances, material, scene } from "@aura3d/engine";
import { Geometry } from "@aura3d/rendering";
import { UnlitMaterial } from "@aura3d/rendering";
import { consolidateBatchedMeshes } from "@aura3d/rendering";

/**
 * PART D1 same-scene shootout: the batch consolidator vs `three.BatchedMesh`.
 *
 * Same scene both sides: 360 static boxes (one shared unit-box geometry, one
 * material) on a deterministic 15 x 8 x 3 grid. Aura consolidates through
 * `consolidateBatchedMeshes` (draws + shared/instance memory telemetry) and
 * renders through `createAuraApp` + `instances.box`; three renders the same
 * grid through one `BatchedMesh` (plus a naive 360-`Mesh` scene for the
 * unbatched cost baseline). Draws come from the consolidator telemetry vs
 * `renderer.info.render.calls`; memory is single-upload geometry bytes plus
 * one mat4 per instance on both sides.
 */

const INSTANCE_COUNT = 360;
const COLS = 15;
const ROWS = 8;
const LAYERS = 3;
const SPACING = 0.55;
const BOX_SIZE = 0.4;
const BOX_COLOR = "#3fb6c9";
const BACKGROUND = "#0a1420";
const CAMERA_POSITION: readonly [number, number, number] = [0, 3.4, 9.2];
const CAMERA_TARGET: readonly [number, number, number] = [0, 0.9, 0];

interface ShootoutPixels {
  readonly nonDarkPixels: number;
  /** Pixels far from the scene background: proves boxes drew, not just bg. */
  readonly foregroundPixels: number;
  readonly checksum: number;
}

interface BatchShootoutResult {
  readonly status: "ready" | "error" | "waiting";
  readonly threeRevision?: string;
  readonly instanceCount?: number;
  readonly aura?: {
    readonly consolidatedDraws: number;
    readonly drawsSaved: number;
    readonly naiveBytes: number;
    readonly consolidatedBytes: number;
    readonly sharedBytes: number;
    readonly instanceTransformBytes: number;
    readonly mountedDrawCalls: number;
    readonly pixels: ShootoutPixels;
  };
  readonly three?: {
    readonly multiDraw: boolean;
    readonly batchedCalls: number;
    readonly batchedTriangles: number;
    readonly naiveCalls: number;
    readonly naiveTriangles: number;
    readonly geometryBytes: number;
    readonly instanceMatrixBytes: number;
    readonly totalBytes: number;
    readonly pixels: ShootoutPixels;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_BATCH_SHOOTOUT__?: BatchShootoutResult;
  }
}

window.__AURA3D_BATCH_SHOOTOUT__ = { status: "waiting" };

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

async function analyzePixels(dataUrl: string): Promise<ShootoutPixels> {
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
    // Background is #0a1420 (10, 20, 32): boxes must stand far clear of it.
    if (Math.abs(r - 10) + Math.abs(g - 20) + Math.abs(b - 32) > 60) foreground += 1;
    hash ^= data[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return { nonDarkPixels: nonDark, foregroundPixels: foreground, checksum: hash >>> 0 };
}

void runShootout().catch((error: unknown) => {
  window.__AURA3D_BATCH_SHOOTOUT__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
});

async function runShootout(): Promise<void> {
  const auraCanvas = document.querySelector<HTMLCanvasElement>("#aura");
  const threeCanvas = document.querySelector<HTMLCanvasElement>("#three");
  if (!auraCanvas || !threeCanvas) throw new Error("Shootout canvases are missing.");

  // --- Aura side: consolidator telemetry over the shared grid. ---
  const cube = Geometry.cube(1);
  const batchMaterial = new UnlitMaterial({ name: "shootout-box" });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const consolidated = consolidateBatchedMeshes(
    Array.from({ length: INSTANCE_COUNT }, (_, index) => ({
      geometry: cube,
      material: batchMaterial,
      modelMatrix: identity,
      batchKey: "shootout-box",
      label: `shootout-box-${index}`,
    }))
  );

  const app = createAuraApp(auraCanvas, {
    scene: scene()
      .background(BACKGROUND)
      .add(
        instances.box({
          name: "shootout instanced boxes",
          transforms: Array.from({ length: INSTANCE_COUNT }, (_, index) => {
            const [x, y, z] = gridPosition(index);
            return {
              position: [x, y, z] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [BOX_SIZE, BOX_SIZE, BOX_SIZE] as [number, number, number],
            };
          }),
          material: material.emissive({
            name: "shootout boxes",
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

  // --- three.js side: naive 360-Mesh baseline, then one BatchedMesh. ---
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
  const composePlacement = (index: number): THREE.Matrix4 => {
    const [x, y, z] = gridPosition(index);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(BOX_SIZE, BOX_SIZE, BOX_SIZE)
    );
  };

  const naive = new THREE.Group();
  for (let index = 0; index < INSTANCE_COUNT; index += 1) {
    const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(composePlacement(index));
    naive.add(mesh);
  }
  threeScene.add(naive);
  renderer.render(threeScene, threeCamera);
  const naiveCalls = renderer.info.render.calls;
  const naiveTriangles = renderer.info.render.triangles;
  threeScene.remove(naive);

  const batched = new THREE.BatchedMesh(INSTANCE_COUNT, 24, 36, boxMaterial);
  const geometryId = batched.addGeometry(boxGeometry);
  for (let index = 0; index < INSTANCE_COUNT; index += 1) {
    const instanceId = batched.addInstance(geometryId);
    batched.setMatrixAt(instanceId, composePlacement(index));
  }
  // NOTE (r185): per-instance matrices live in a DataTexture
  // (`_matricesTexture`); `setMatrixAt` already flags it for upload, so the
  // batching-relevant memory is still exactly 360 x 16 x 4 bytes.
  batched.computeBoundingSphere();
  batched.frustumCulled = false;
  threeScene.add(batched);
  renderer.render(threeScene, threeCamera);
  const batchedCalls = renderer.info.render.calls;
  const batchedTriangles = renderer.info.render.triangles;
  const multiDraw = renderer.extensions.has("WEBGL_multi_draw");
  const threePixels = await analyzePixels(threeCanvas.toDataURL("image/png"));

  const position = boxGeometry.getAttribute("position");
  const normal = boxGeometry.getAttribute("normal");
  const uv = boxGeometry.getAttribute("uv");
  const index = boxGeometry.getIndex();
  const geometryBytes =
    position.count * position.itemSize * 4 +
    normal.count * normal.itemSize * 4 +
    uv.count * uv.itemSize * 4 +
    (index?.count ?? 0) * ((index?.array as Uint16Array)?.BYTES_PER_ELEMENT ?? 2);

  const result: BatchShootoutResult = {
    status: "ready",
    threeRevision: THREE.REVISION,
    instanceCount: INSTANCE_COUNT,
    aura: {
      consolidatedDraws: consolidated.draws,
      drawsSaved: consolidated.telemetry.drawsSaved,
      naiveBytes: consolidated.telemetry.indexBytes + consolidated.telemetry.vertexBytes,
      consolidatedBytes: consolidated.telemetry.consolidatedBytes,
      sharedBytes: consolidated.telemetry.sharedIndexBytes + consolidated.telemetry.sharedVertexBytes,
      instanceTransformBytes: consolidated.telemetry.instanceTransformBytes,
      mountedDrawCalls: auraDiagnostics.drawCalls,
      pixels: auraPixels,
    },
    three: {
      multiDraw,
      batchedCalls,
      batchedTriangles,
      naiveCalls,
      naiveTriangles,
      geometryBytes,
      instanceMatrixBytes: INSTANCE_COUNT * 16 * 4,
      totalBytes: geometryBytes + INSTANCE_COUNT * 16 * 4,
      pixels: threePixels,
    },
  };
  window.__AURA3D_BATCH_SHOOTOUT__ = result;
  app.dispose();
  boxGeometry.dispose();
  boxMaterial.dispose();
  renderer.dispose();
}
