/**
 * assets-lod-transition.ts — PRD-05 Phase-3 browser gate (§15).
 *
 * Drives a real `TypedGLBActor` built from the §6.3-optimized hero vehicle
 * (MSFT_lod chain + meshopt + KTX2) through a 120-frame dolly sweep: per
 * frame the pipeline camera is moved (mutable `pipeline.camera` — the
 * actor-level load camera object; the live per-frame camera channel into
 * `collectRenderItems` is request Q-15-5, recorded in q-issues.md) and
 * `collectRenderItems()` is invoked exactly as the compiler would.
 *
 * Asserts/publishes:
 *   - render-item content switches at the expected coverage (geometry
 *     identity changes when a chain's level changes);
 *   - no frame emits zero render items for an LOD-ed actor;
 *   - per-chain levels reach ≥ 3 distinct levels across the sweep and
 *     transitions happen at the §6.2 coverage bands;
 *   - `lodDither: "pending"` is reported while the dithered cross-fade is
 *     shader-side only pending the C-02 generator.
 *
 * Publishes `window.__QR_READY__` / `__QR_ERROR__`. macos-14 CI only.
 */
import { resolveQrFlags } from "/packages/engine/src/contracts/flags.js";
import { setTypedGLBActorQrFlags } from "/packages/engine/src/production-runtime/actor/extensions.js";
import {
  getTypedGLBActorLod
} from "/packages/engine/src/production-runtime/actor/TypedGLBActorLod.js";
import { createTypedGLBActor } from "/packages/engine/src/production-runtime/TypedGLBActor.js";
import { projectedSphereCoverage } from "/packages/engine/src/production-runtime/LodSelector.js";
import { probeCompressedTextureCapabilities } from "/packages/rendering/src/lanes/prd05.js";
import { createAppAssetDecoders, attachAppAssetDecoders, getAppAssetDecoders } from "/packages/engine/src/lanes/prd05.js";
import { WebGL2RendererBackend } from "/packages/rendering/src/production-runtime/index.js";
import { canvasPixels, CLEAR, maskedDeltaE, subjectMask } from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics.js";

declare global {
  interface Window { __QR_READY__?: unknown; __QR_ERROR__?: unknown }
}

const SEDAN_URL = "/benchmarks/quality-rebuild/scenes/prd05/derived/quaternius-sports-car.0dbac342.glb"; // vehicles/road library hero car (Phase-5 re-point)
const FRAMES = 120;
const FOV = (50 * Math.PI) / 180;
const ASPECT = 16 / 9;
const NEAR = 0.1;
const FAR = 800;

/** column-major perspective projection (matches the engine's LodCamera). */
const perspective = (fovY: number, aspect: number, near: number, far: number): number[] => {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ];
};

/** column-major view matrix (camera looks down -Z in view space). */
const lookAt = (eye: readonly [number, number, number], target: readonly [number, number, number], up: readonly [number, number, number]): number[] => {
  const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as const;
  const norm = (v: readonly number[]) => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return [v[0]! / l, v[1]! / l, v[2]! / l] as const; };
  const cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!] as const;
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [
    x[0]!, y[0]!, z[0]!, 0,
    x[1]!, y[1]!, z[1]!, 0,
    x[2]!, y[2]!, z[2]!, 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ];
};

const mul = (a: readonly number[], b: readonly number[]): number[] => {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      for (let k = 0; k < 4; k += 1) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
    }
  }
  return out;
};

interface FrameRecord {
  readonly frame: number;
  readonly distance: number;
  readonly coverage: number;
  readonly items: number;
  readonly triangles: number;
  readonly chainLevels: readonly number[];
  readonly geometryKeys: readonly string[];
}

interface PopRecord {
  readonly frame: number;
  readonly distance: number;
  readonly coverage: number;
  readonly deltaE2000: number;
}

async function run() {
  const status = document.getElementById("status");
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  document.body.prepend(canvas);

  const flags = resolveQrFlags({ options: ["assets", "assets.lod"] });
  setTypedGLBActorQrFlags(flags);
  const lodFlagOn = flags.on("A3D_QR_ASSETS_LOD");
  // TypedGLBActorLod self-registers its extension at module import.

  // Caps probe runs on a throwaway canvas — the render canvas needs
  // preserveDrawingBuffer at first-context creation for canvasPixels().
  const probeCanvas = document.createElement("canvas");
  const gl = probeCanvas.getContext("webgl2");
  const caps = gl ? probeCompressedTextureCapabilities(gl) : { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };
  const registry = createAppAssetDecoders({ decoders: { basePath: "/aura-decoders/", workerCount: 2 } }, caps, { maxTextureSize: 4096 });
  attachAppAssetDecoders(canvas, registry);
  void getAppAssetDecoders(canvas);

  const actor = await createTypedGLBActor({
    id: "sedan",
    name: "sedan",
    asset: { url: SEDAN_URL, type: "model", format: "glb" },
    width: 1280,
    height: 720,
    decoders: { basePath: "/aura-decoders/", workerCount: 2 },
    compressedTextureCapabilities: caps
  });

  const handle = getTypedGLBActorLod(actor);
  const mutableCamera = actor.pipeline.camera as {
    viewProjectionMatrix: number[] | Float32Array;
    viewMatrix: number[] | Float32Array;
    projectionMatrix: number[] | Float32Array;
  };
  const proj = perspective(FOV, ASPECT, NEAR, FAR);
  const write = (dst: number[] | Float32Array, src: readonly number[]) => {
    for (let i = 0; i < 16; i += 1) (dst as number[])[i] = src[i]!;
  };

  const bounds = actor.pipeline.resources.bounds;
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const radius = Math.hypot(bounds.max[0] - cx, bounds.max[1] - cy, bounds.max[2] - cz);

  const geometryIds = new WeakMap<object, number>();
  let nextGeometryId = 0;
  const keyFor = (g: unknown): string => {
    const gObj = g as object;
    let id = geometryIds.get(gObj);
    if (id === undefined) { id = nextGeometryId += 1; geometryIds.set(gObj, id); }
    return `g${id}`;
  };

  // S7 (d)/(e): render each frame and measure pop at level changes plus
  // per-frame triangle counts. The renderer draws the exact items
  // collectRenderItems just emitted (a wrapping source), so the pixel delta
  // at a level-change frame is the visible pop a vision judge would call.
  const renderer = await WebGL2RendererBackend.create({
    canvas, width: canvas.width, height: canvas.height,
    preserveDrawingBuffer: true, clearColor: [CLEAR[0]!, CLEAR[1]!, CLEAR[2]!, 1]
  });
  const trianglesOf = (items: readonly { geometry?: { indexCount?: number; vertexCount?: number; instanceCount?: number } }[]): number =>
    items.reduce((sum, item) => {
      const g = item.geometry;
      const per = ((g?.indexCount ?? g?.vertexCount ?? 0) / 3);
      return sum + per * Math.max(1, g?.instanceCount ?? 1);
    }, 0);

  const frames: FrameRecord[] = [];
  const pops: PopRecord[] = [];
  let prevPx: Uint8ClampedArray | null = null;
  let prevMask: Uint8Array | null = null;
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const t = frame / (FRAMES - 1);
    // Dolly: camera approaches from 320 m out to 4 m — coverage sweeps all
    // four coverage bands of the hero-vehicle profile.
    const distance = 320 - t * 316;
    const eye: [number, number, number] = [cx, cy + radius * 0.3, cz + distance];
    const target: [number, number, number] = [cx, cy, cz];
    const view = lookAt(eye, target, [0, 1, 0]);
    write(mutableCamera.viewMatrix, view);
    write(mutableCamera.projectionMatrix, proj);
    write(mutableCamera.viewProjectionMatrix, mul(proj, view));

    const items = actor.collectRenderItems();
    const coverage = projectedSphereCoverage({
      center: [cx, cy, cz],
      radius,
      camera: mutableCamera
    });
    const chainLevels = handle?.chainLevels() ?? [];
    const itemsArr = [...items];
    renderer.renderImportedAsset({
      source: { collectRenderItems: () => itemsArr } as never,
      camera: mutableCamera as never,
      metadata: {} as never,
      viewport: { width: canvas.width, height: canvas.height }
    });
    const px = await canvasPixels(canvas);
    if (prevPx && frames.length > 0) {
      const prev = frames[frames.length - 1]!;
      const levelChanged = chainLevels.some((l, c) => l !== prev.chainLevels[c]);
      if (levelChanged) {
        const currMask = subjectMask(px);
        const mask = currMask.map((v, i) => (v || prevMask?.[i] ? 1 : 0));
        pops.push({
          frame,
          distance: Number(distance.toFixed(2)),
          coverage: Number(coverage.toFixed(4)),
          deltaE2000: Number(maskedDeltaE(px, prevPx, mask).toFixed(3))
        });
      }
    }
    prevPx = px;
    prevMask = subjectMask(px);
    frames.push({
      frame,
      distance: Number(distance.toFixed(2)),
      coverage: Number(coverage.toFixed(4)),
      items: itemsArr.length,
      triangles: Math.round(trianglesOf(itemsArr)),
      chainLevels,
      geometryKeys: itemsArr.map((item) => keyFor(item.geometry))
    });
    if (status) status.textContent = `frame ${frame + 1}/${FRAMES}`;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  window.__QR_READY__ = {
    frames,
    pops,
    chainCount: handle?.chainLevels().length ?? 0,
    lodFlagOn,
    // Standalone asserts the hard switch; the dithered cross-fade is a
    // shader-side feature pending the C-02 generator (§15).
    lodDither: "pending"
  };
}

run().catch((error) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
});
