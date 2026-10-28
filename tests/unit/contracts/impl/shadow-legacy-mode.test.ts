// Hotfix 4.3.2: real GPUs rendered Aura Slam dark with dense stripes after the 4.3.0 shadow changes, so the 4.2.0 behaviour
// (cascade fit, caster rules, uniform-array instanced depth draws) is the default; `__A3D_SHADOW_FIT__ = "current"` opts in.
import { afterEach, describe, expect, it } from "vitest";
import { fitDirectionalCascades, isOversizeShadowCaster } from "../../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import { shadowFitMode } from "../../../../packages/rendering/src/shadows/shadowLegacy";
import { depthUsesInstanceAttributes, resolvePrd02ShadowCasterVariant, prd02DepthFeatures } from "../../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function viewProjection(eye: V3, target: V3, fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = norm(sub(target, eye)); const s = norm(cross(f, [0, 1, 0])); const u = cross(s, f);
  const view = [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
  const t = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const proj = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) out[c * 4 + r] = proj[r]! * view[c * 4]! + proj[4 + r]! * view[c * 4 + 1]! + proj[8 + r]! * view[c * 4 + 2]! + proj[12 + r]! * view[c * 4 + 3]!;
  return out;
}
const box = (center: V3, size: V3, label = "caster"): RenderItem => ({
  geometry: { bounds: { min: [-size[0] / 2, -size[1] / 2, -size[2] / 2], max: [size[0] / 2, size[1] / 2, size[2] / 2] } },
  modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, center[0], center[1], center[2], 1]),
  label
} as never);

// Aura Slam's fixed camera: eye [0, 25.5, 37.1], fov 15, near 0.1, far 180.
const camera = { viewProjectionMatrix: viewProjection([0, 25.5, 37.1], [0, 0, 0.7], 15, 16 / 9, 0.1, 180), near: 0.1, far: 180 };
const sun = norm([-14, -24, -12]);
const scene = [box([-20, 3, 0], [8, 6, 60], "stand"), box([20, 3, 0], [8, 6, 60], "stand"), box([0, 3, -30], [50, 6, 6], "back")];

afterEach(() => { delete (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__; });

describe("shadow fit mode", () => {
  it("defaults to the 4.2.0 behaviour and opts in with the global", () => {
    expect(shadowFitMode()).toBe("legacy");
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
    expect(shadowFitMode()).toBe("current");
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "bogus";
    expect(shadowFitMode()).toBe("legacy");
  });

  it("legacy fit lets casters widen the ortho (4.2.0), the current fit does not", () => {
    const legacy = fitDirectionalCascades({ camera, lightDirection: sun, casters: scene, mapSize: 2048, cascadeCount: 1, maxDistance: 150 });
    const current = fitDirectionalCascades({ camera, lightDirection: sun, casters: scene, mapSize: 2048, cascadeCount: 1, maxDistance: 150, legacy: false });
    const none = fitDirectionalCascades({ camera, lightDirection: sun, casters: [], mapSize: 2048, cascadeCount: 1, maxDistance: 150, legacy: true });
    expect(legacy[0]!.radius).toBeGreaterThan(none[0]!.radius);
    expect(current[0]!.radius).toBeCloseTo(none[0]!.radius, 6);
    expect(legacy[0]!.texelWorld).toBeGreaterThan(current[0]!.texelWorld);
  });

  it("legacy takes near/far from the camera exactly as given", () => {
    const wrongRange = { ...camera, near: 1, far: 50 };
    const legacy = fitDirectionalCascades({ camera: wrongRange, lightDirection: sun, casters: [], mapSize: 2048, cascadeCount: 1 });
    const current = fitDirectionalCascades({ camera: wrongRange, lightDirection: sun, casters: [], mapSize: 2048, cascadeCount: 1, legacy: false });
    expect(legacy[0]!.splitFar).toBe(50);
    expect(current[0]!.splitFar).toBeGreaterThan(50);
  });
});

describe("oversize casters", () => {
  it("a 4000 m dome is oversize but a large flat floor never is", () => {
    expect(isOversizeShadowCaster(box([0, 0, 0], [4000, 2000, 4000], "dome"), 150)).toBe(true);
    expect(isOversizeShadowCaster(box([0, -0.05, 0], [600, 0.1, 600], "court-floor"), 150)).toBe(false);
    expect(isOversizeShadowCaster(box([0, 0, 0], [40, 6, 40], "stand"), 150)).toBe(false);
  });
});

describe("instanced depth draws", () => {
  const instanced = (n: number, shadowGeometry?: unknown, drawRange?: unknown) => ({ instanceTransforms: new Float32Array(16 * n), ...(shadowGeometry ? { shadowGeometry } : {}), ...(drawRange ? { drawRange } : {}) }) as never;
  const proxy = { proxy: true };
  it("use the uniform array (4.2.0) by default below the dense threshold and the attribute buffer in current mode", () => {
    expect(depthUsesInstanceAttributes(instanced(500))).toBe(false);
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
    expect(depthUsesInstanceAttributes(instanced(500))).toBe(true);
    expect(depthUsesInstanceAttributes(instanced(40))).toBe(false);
  });

  it("dense nodes with a shadow proxy (1,024+ instances) use the attribute buffer in the default fit too, unless switched off", () => {
    const g = globalThis as { __A3D_DENSE_DEPTH_DRAWS__?: string };
    try {
      expect(depthUsesInstanceAttributes(instanced(1023, proxy))).toBe(false);
      expect(depthUsesInstanceAttributes(instanced(1024, proxy))).toBe(true);
      expect(depthUsesInstanceAttributes(instanced(8000, proxy))).toBe(true);
      g.__A3D_DENSE_DEPTH_DRAWS__ = "off";
      expect(depthUsesInstanceAttributes(instanced(8000, proxy))).toBe(false);
    } finally {
      delete g.__A3D_DENSE_DEPTH_DRAWS__;
    }
  });

  it("dense casters WITHOUT a shadow proxy (GLB or model instancing, custom geometry, boxes, non-core paths) or with a draw range keep the 4.2.0 uniform array", () => {
    expect(depthUsesInstanceAttributes(instanced(2000))).toBe(false);
    expect(depthUsesInstanceAttributes(instanced(8000))).toBe(false);
    expect(depthUsesInstanceAttributes(instanced(2000, proxy, { start: 0, count: 6 }))).toBe(false);
    // current mode is unchanged: every node above 64 instances
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
    expect(depthUsesInstanceAttributes(instanced(2000))).toBe(true);
  });

  it("the legacy caster variant of a sub-dense node carries no instance-attribute feature, so its program key and source equal 4.2.0's", () => {
    const features = prd02DepthFeatures();
    const item = { ...box([0, 0, 0], [1, 1, 1]), instanceTransforms: new Float32Array(16 * 500) } as never;
    const legacy = resolvePrd02ShadowCasterVariant(item, {} as never, {} as never, features);
    expect(legacy.features["prd02.depthInstanceAttr"]).toBeUndefined();
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
    const current = resolvePrd02ShadowCasterVariant(item, {} as never, {} as never, features);
    expect(current.features["prd02.depthInstanceAttr"]).toBe(1);
  });

  it("a dense caster's variant carries the instance-attribute feature in the default fit only when it has a shadow proxy", () => {
    const features = prd02DepthFeatures();
    const dense = { ...box([0, 0, 0], [1, 1, 1]), instanceTransforms: new Float32Array(16 * 2000) };
    expect(resolvePrd02ShadowCasterVariant({ ...dense, shadowGeometry: {} } as never, {} as never, {} as never, features).features["prd02.depthInstanceAttr"]).toBe(1);
    expect(resolvePrd02ShadowCasterVariant(dense as never, {} as never, {} as never, features).features["prd02.depthInstanceAttr"]).toBeUndefined();
  });
});
