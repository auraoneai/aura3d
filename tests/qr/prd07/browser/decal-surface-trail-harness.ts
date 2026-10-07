// PRD-07 P6-T3 — `orientation:"surface"` trails render in the decal phase
// with polygon offset. A surface strip coplanar with the ground at a 50 m
// camera distance must not z-fight: two consecutive identical frames differ
// by at most 1/255 in the mark region.

import { LeanWebGL2Device } from "/packages/rendering/src/LeanWebGL2Device.js";
import { VertexFormat } from "/packages/rendering/src/VertexFormat.js";
import { RibbonBatch, RIBBON_VERTEX_FLOATS } from "/packages/rendering/src/vfx/RibbonBatch.js";
import { DecalBatch, ribbonStripToDecalGeometry } from "/packages/rendering/src/vfx/DecalBatch.js";
import { DecalPass } from "/packages/rendering/src/vfx/DecalPass.js";
import type { FrameContributorContext } from "/packages/rendering/src/contracts/frameGraph.js";

interface DecalTrailResult {
  readonly status: "ready" | "error";
  readonly maxDiff?: number;
  readonly markCoverage?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_DECAL_TRAIL__?: DecalTrailResult;
  }
}

const W = 96;
const H = 96;
const CAM_DIST = 50;

// --- minimal column-major mat4 helpers ---
function perspective(fovYDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovYDeg * Math.PI / 180) / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye: readonly [number, number, number], target: readonly [number, number, number], up: readonly [number, number, number]): Float32Array {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz);
  const z = [zx / zl, zy / zl, zz / zl] as const;
  const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / xl, xy / xl, xz / xl] as const;
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0]
  ] as const;
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1
  ]);
}

function mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r]! * b[c * 4 + 0]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** Coplanar ground quad at y=0, depth-writing, no polygon offset. */
function drawGround(device: LeanWebGL2Device, vp: Float32Array): void {
  const vertexBuffer = device.createBuffer(
    "vertex",
    6 * 3 * 4,
    new Float32Array([-20, 0, -20, 20, 0, -20, 20, 0, 20, -20, 0, -20, 20, 0, 20, -20, 0, 20])
  );
  const shader = device.createShaderProgram({
    label: "prd07-decal-ground",
    vertex: `uniform mat4 u_vp;
in vec3 a_position;
void main() { gl_Position = u_vp * vec4(a_position, 1.0); }`,
    fragment: `uniform vec4 u_color;
out vec4 o_color;
void main() { o_color = u_color; }`
  });
  device.draw({
    label: "prd07.ground",
    topology: "triangles",
    vertexBuffer,
    vertexFormat: VertexFormat.P3,
    vertexCount: 6,
    shader,
    uniforms: new Map<string, unknown>([
      ["u_vp", vp],
      ["u_color", [0.35, 0.36, 0.38, 1]]
    ]) as never,
    renderState: { depthTest: true, depthWrite: true, cullMode: "none", depthCompare: "less-equal" }
  });
}

/** A surface trail: 5 points along X, 0.6 wide, dark — coplanar with y=0. */
function buildTrailBatch(): DecalBatch {
  const ribbons = new RibbonBatch();
  const trail = ribbons.upsertTrail({ id: "t", orientation: "surface", surfaceNormal: [0, 1, 0], maxPoints: 8 });
  for (let i = 0; i < 5; i += 1) {
    trail.push([-4 + i * 2, 0, 0], i / 60, 0.6, [0.08, 0.08, 0.09, 1]);
  }
  const strip = ribbons.buildGeometry(trail, [0, 0, 0]);
  const batch = new DecalBatch(8);
  if (strip) {
    batch.upsert({
      id: "surface-trail.t",
      pageKey: "surface-trails",
      blend: "alpha",
      geometry: ribbonStripToDecalGeometry(strip),
      polygonOffset: { factor: -2, units: -2 },
      life: Number.POSITIVE_INFINITY
    }, 0);
  }
  return batch;
}

function renderFrame(device: LeanWebGL2Device, pass: DecalPass, batch: DecalBatch, vp: Float32Array, rt: ReturnType<LeanWebGL2Device["createRenderTarget"]>): Uint8Array {
  const ctx = {
    device,
    width: W,
    height: H,
    frameIndex: 0,
    timeSeconds: 0,
    camera: {
      viewMatrix: new Float32Array(16),
      projectionMatrix: new Float32Array(16),
      viewProjectionMatrix: vp,
      previousViewProjectionMatrix: null,
      near: 0.1,
      far: 200,
      projection: "perspective",
      position: [0, 3, CAM_DIST]
    },
    source: { id: "prd07-decal-trail-harness" },
    items: [],
    tier: {},
    flags: {},
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 200, orthographic: false }, available: false },
    blackboard: new Map<string, unknown>()
  } as unknown as FrameContributorContext;

  device.setRenderTarget(rt);
  device.beginFrame(W, H);
  device.clear([0.2, 0.22, 0.25, 1]);
  drawGround(device, vp);
  pass.draw(batch, ctx, 0);
  const pixels = device.readPixels(0, 0, W, H);
  device.endFrame();
  return pixels;
}

function main(): void {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  let device: LeanWebGL2Device;
  try {
    device = LeanWebGL2Device.create({ canvas, alpha: false, preserveDrawingBuffer: true });
  } catch (error) {
    window.__QR_PRD07_DECAL_TRAIL__ = { status: "error", error: String(error) };
    return;
  }
  try {
    const rt = device.createRenderTarget({ width: W, height: H, label: "prd07-decal-trail", format: "rgba8", depth: true });
    const vp = mul(perspective(50, W / H, 0.1, 200), lookAt([0, 3, CAM_DIST], [0, 0, 0], [0, 1, 0]));
    const pass = new DecalPass(device);
    const batch = buildTrailBatch();
    const a = renderFrame(device, pass, batch, vp, rt);
    const b = renderFrame(device, pass, batch, vp, rt);
    let maxDiff = 0;
    let covered = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
      if (d > maxDiff) maxDiff = d;
      // mark coverage: pixels meaningfully darker than the ground/clear colour
      if (a[i]! < 40 && a[i + 1]! < 40) covered += 1;
    }
    window.__QR_PRD07_DECAL_TRAIL__ = {
      status: "ready",
      maxDiff,
      markCoverage: covered / (W * H)
    };
  } catch (error) {
    window.__QR_PRD07_DECAL_TRAIL__ = { status: "error", error: String(error) };
  }
}

void RIBBON_VERTEX_FLOATS;
main();
