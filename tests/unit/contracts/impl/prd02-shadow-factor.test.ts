/**
 * PRD-02 shadow factor, end to end on the CPU (#1225).
 *
 * GPU runs 38161877948 / 38184948030 showed the bridged prd02 cascade bound
 * to every receiver (enabled 1, strength 1, depth24 NEAREST) and depth
 * written, yet zero darkening inside three's shadow mask. The bound light
 * matrix's z row grew *toward* the sun: the fitter's ortho used -2/depth on a
 * view whose z already runs along the light's travel, so the less-equal depth
 * pass kept the surface farthest from the light and every receiver compared
 * equal to (or nearer than) the stored depth (fixed on main by 53f098c02).
 *
 * This test takes the uniforms the bridge hands the floor's forward draw,
 * rasterises the caster into a CPU depth map with the depth pass's own
 * convention (window z = ndc.z * 0.5 + 0.5, less-equal keeps the minimum), and
 * evaluates a line-for-line port of GLSL `a3dForwardShadowFactor`
 * (ShaderLibraryCore.ts) at a floor point the caster occludes.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
// Installs the C-02 program generator, as every app does via the lanes barrel.
import "../../../../packages/rendering/src/lanes/prd01";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4 } from "@aura3d/scene";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import type { DrawCommand } from "../../../../packages/rendering/src/RenderDevice";

type V3 = [number, number, number];

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const SUN_TRAVEL: V3 = [-0.3, -1, -0.2];
const CASTER_CENTER: V3 = [0, 1.5, 0];
const CASTER_HALF = 0.5;

function translate(x: number, y: number, z: number): Float32Array {
  const m = Float32Array.from(identityMat4());
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function source() {
  const material = new PBRMaterial({ name: "lit" });
  return {
    renderItems: [
      { geometry: Geometry.litCube(1), material, modelMatrix: translate(...CASTER_CENTER), label: "caster", castShadow: true, receiveShadow: true },
      { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([10, 0, 0, 0, 0, 1, 0, 0, 0, 0, 10, 0, 0, 0, 0, 1]), label: "floor", castShadow: false, receiveShadow: true }
    ],
    collectedLights: [
      {
        kind: "directional", color: [1, 1, 1], intensity: 3, position: [3, 10, 2], direction: SUN_TRAVEL,
        range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: { id: "sun", name: "sun" }
      }
    ],
    shadow: {
      enabled: true,
      size: 1024,
      cascadeCount: 1,
      prd02Shadows: { enabled: true, mapSize: 1024, cascades: 1, maxDistance: 30, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 }
    }
  };
}

/** Camera at (0, 4, 8) looking at the origin, as compiled sources pass it. */
function cameraLike() {
  const eye: V3 = [0, 4, 8];
  const len = Math.hypot(...eye);
  const f: V3 = [-eye[0] / len, -eye[1] / len, -eye[2] / len];
  const sRaw: V3 = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
  const sl = Math.hypot(...sRaw);
  const s: V3 = [sRaw[0] / sl, sRaw[1] / sl, sRaw[2] / sl];
  const u: V3 = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const view = [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
  const near = 0.1;
  const far = 50;
  const t = 1 / Math.tan(Math.PI / 6);
  const proj = [t / (16 / 9), 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const vp = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += proj[k * 4 + r]! * view[c * 4 + k]!;
      vp[c * 4 + r] = sum;
    }
  }
  return { viewProjectionMatrix: vp, viewMatrix: Float32Array.from(view) };
}

function transform(m: ArrayLike<number>, p: readonly number[], w = 1): [number, number, number, number] {
  return [0, 1, 2, 3].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]! * w) as [number, number, number, number];
}

/** Gauss-Jordan inverse of a column-major 4×4. */
function invert(m: ArrayLike<number>): number[] {
  const a = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => m[c * 4 + r]!).concat([0, 1, 2, 3].map((k) => (k === r ? 1 : 0))));
  for (let col = 0; col < 4; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 4; r += 1) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const p = a[col]![col]!;
    for (let k = 0; k < 8; k += 1) a[col]![k]! /= p;
    for (let r = 0; r < 4; r += 1) {
      if (r === col) continue;
      const factor = a[r]![col]!;
      for (let k = 0; k < 8; k += 1) a[r]![k]! -= factor * a[col]![k]!;
    }
  }
  const out = new Array<number>(16);
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) out[c * 4 + r] = a[r]![4 + c]!;
  return out;
}

interface ShadowUniforms {
  readonly matrix: Float32Array;
  readonly bias: number;
  readonly slopeBias: number;
  readonly normalBias: number;
  readonly strength: number;
  readonly texel: readonly [number, number];
  readonly samples: Float32Array;
  readonly sampleCount: number;
  readonly mapSize: number;
}

async function floorShadowUniforms(): Promise<ShadowUniforms> {
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
  try {
    renderer.render(source() as never, cameraLike() as never);
    const draws = (renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands;
    const floor = draws.filter((d) => (d.label ?? "").includes("floor")).at(-1)!;
    const u = floor.uniforms as ReadonlyMap<string, unknown>;
    // A3D_QR_CORE is default-on: the floor draws on the generated program,
    // which must declare (and so reflect) the forward shadow uniforms or
    // forward/Lighting.ts never binds the map.
    const shader = floor.shader as { label?: string; reflection: { uniforms: ReadonlyMap<string, unknown> } };
    expect(shader.label ?? "").toMatch(/^a3d-program:/);
    expect(shader.reflection.uniforms.has("u_shadowMapMatrix")).toBe(true);
    expect(u.get("u_shadowMapEnabled")).toBe(1);
    const binding = u.get("u_shadowMapTexture") as { texture?: { label?: string; width?: number } };
    expect(binding.texture?.label).toMatch(/^prd02-cascade-0-depth$/);
    const texel = u.get("u_shadowMapTexelSize") as readonly [number, number];
    return {
      matrix: Float32Array.from(u.get("u_shadowMapMatrix") as ArrayLike<number>),
      bias: u.get("u_shadowMapBias") as number,
      slopeBias: u.get("u_shadowMapSlopeBias") as number,
      normalBias: u.get("u_shadowMapNormalBias") as number,
      strength: u.get("u_shadowMapStrength") as number,
      texel: [texel[0], texel[1]],
      samples: u.get("u_shadowPcfSamples") as Float32Array,
      sampleCount: u.get("u_shadowPcfSampleCount") as number,
      mapSize: binding.texture?.width ?? Math.round(1 / texel[0])
    };
  } finally {
    renderer.dispose();
  }
}

/**
 * Stored depth at a NEAREST texel: the depth pass rasterises the caster box
 * with the same matrix and keeps the minimum window depth (cleared to 1).
 */
function storedDepth(u: ShadowUniforms, uv: readonly [number, number]): number {
  const size = u.mapSize;
  const tx = (Math.floor(uv[0] * size) + 0.5) / size;
  const ty = (Math.floor(uv[1] * size) + 0.5) / size;
  const inv = invert(u.matrix);
  const a = transform(inv, [tx * 2 - 1, ty * 2 - 1, 0]);
  const b = transform(inv, [0, 0, 1], 0); // world delta per unit ndc z (affine ortho)
  let zEnter = -1;
  let zExit = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const lo = CASTER_CENTER[axis]! - CASTER_HALF;
    const hi = CASTER_CENTER[axis]! + CASTER_HALF;
    const o = a[axis]!;
    const d = b[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return 1;
      continue;
    }
    const t0 = (lo - o) / d;
    const t1 = (hi - o) / d;
    zEnter = Math.max(zEnter, Math.min(t0, t1));
    zExit = Math.min(zExit, Math.max(t0, t1));
  }
  return zEnter <= zExit ? zEnter * 0.5 + 0.5 : 1;
}

/**
 * Port of GLSL `a3dForwardLightShadow` → `a3dForwardShadowFactor`
 * (program/chunks/shadow_forward.glsl.ts): normal offset, then the legacy factor.
 */
function shadowFactor(u: ShadowUniforms, receiver: V3, normal: V3, lightDirection: V3): number {
  const nn = Math.hypot(...normal);
  const worldPosition: V3 = [0, 1, 2].map((k) => receiver[k]! + (normal[k]! / nn) * u.normalBias) as V3;
  const lp = transform(u.matrix, worldPosition);
  const w = Math.max(lp[3], 0.0001);
  const projected = [lp[0] / w, lp[1] / w, lp[2] / w];
  const uv: [number, number] = [projected[0]! * 0.5 + 0.5, projected[1]! * 0.5 + 0.5];
  if (uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) return 1;
  const nl = Math.hypot(...normal);
  const ll = Math.max(Math.hypot(...lightDirection), 0.0001);
  const ndl = Math.min(1, Math.abs((normal[0] * lightDirection[0] + normal[1] * lightDirection[1] + normal[2] * lightDirection[2]) / (nl * ll)));
  const slopeTangent = Math.min(Math.sqrt(Math.max(1 - ndl * ndl, 0)) / Math.max(ndl, 0.05), 8);
  const slopeTexelBias = slopeTangent * u.slopeBias * Math.max(u.texel[0], u.texel[1]);
  const projectedDepth = projected[2]! * 0.5 + 0.5;
  let shadowed = 0;
  let totalWeight = 0;
  const count = Math.min(Math.max(Math.trunc(u.sampleCount), 1), 32);
  for (let i = 0; i < count; i += 1) {
    const sx = u.samples[i * 4]!;
    const sy = u.samples[i * 4 + 1]!;
    const weight = Math.max(u.samples[i * 4 + 2]!, 0);
    const stored = storedDepth(u, [uv[0] + sx * u.texel[0], uv[1] + sy * u.texel[1]]);
    const receiverDepth = projectedDepth - u.bias - slopeTexelBias * Math.max(1, Math.hypot(sx, sy));
    shadowed += (receiverDepth > stored ? 1 : 0) * weight;
    totalWeight += weight;
  }
  const occlusion = totalWeight > 0 ? shadowed / totalWeight : 0;
  const strength = Math.min(Math.max(u.strength, 0), 1);
  return 1 + ((1 - occlusion) - 1) * strength;
}

const travelLength = Math.hypot(...SUN_TRAVEL);
const TRAVEL: V3 = [SUN_TRAVEL[0] / travelLength, SUN_TRAVEL[1] / travelLength, SUN_TRAVEL[2] / travelLength];
const TO_LIGHT: V3 = [-TRAVEL[0], -TRAVEL[1], -TRAVEL[2]];
const UP: V3 = [0, 1, 0];

/** Where the sun ray through the caster's centre lands on the floor. */
function shadowedFloorPoint(): V3 {
  const t = CASTER_CENTER[1] / -TRAVEL[1];
  return [CASTER_CENTER[0] + TRAVEL[0] * t, 0, CASTER_CENTER[2] + TRAVEL[2] * t];
}

describe("prd02 bridged sun shadow: shader factor for a known shadowed point", () => {
  it("the bound light matrix orders depth nearest-to-light first", async () => {
    const u = await floorShadowUniforms();
    const ground = shadowedFloorPoint();
    const top: V3 = [CASTER_CENTER[0], CASTER_CENTER[1] + CASTER_HALF, CASTER_CENTER[2]];
    // Moving along the light's travel increases NDC depth.
    const zTop = transform(u.matrix, top)[2];
    const zBelow = transform(u.matrix, [top[0] + TRAVEL[0], top[1] + TRAVEL[1], top[2] + TRAVEL[2]])[2];
    expect(zBelow).toBeGreaterThan(zTop);
    expect(transform(u.matrix, ground)[2]).toBeGreaterThan(zTop);
  });

  it("a floor point behind the caster is fully shadowed; open floor and the lit caster top are not", async () => {
    const u = await floorShadowUniforms();
    expect(u.strength).toBe(1);
    // C-11 normalBias 1.5 texels → a small positive world offset.
    expect(u.normalBias).toBeGreaterThan(0);
    expect(u.normalBias).toBeLessThan(0.1);
    expect(shadowFactor(u, shadowedFloorPoint(), UP, TO_LIGHT)).toBeLessThan(0.05);
    expect(shadowFactor(u, [3, 0, 3], UP, TO_LIGHT)).toBeGreaterThan(0.95);
    const top: V3 = [CASTER_CENTER[0], CASTER_CENTER[1] + CASTER_HALF, CASTER_CENTER[2]];
    expect(shadowFactor(u, top, UP, TO_LIGHT)).toBeGreaterThan(0.95);
  });
});
