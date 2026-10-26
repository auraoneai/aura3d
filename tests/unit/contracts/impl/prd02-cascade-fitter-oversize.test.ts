// Shadowstep Gauntlet: a 4000 m sky dome that cast shadows darkened the whole frame, and a scene-spanning instanced
// set inflated every cascade to kilometres. Casters must not widen the ortho footprint, and shells must not cast.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fitDirectionalCascades, isOversizeShadowCaster } from "../../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import { Prd02ShadowSystem } from "../../../../packages/rendering/src/shadows/ShadowSystem";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

// The 4.3.0 fit, oversize skip and instance-attribute depth path are opt-in (default = 4.2.0): these tests exercise them.
beforeAll(() => { (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current"; });
afterAll(() => { delete (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__; });


type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function viewProjection(eye: V3, target: V3, fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = norm(sub(target, eye));
  const s = norm(cross(f, [0, 1, 0]));
  const u = cross(s, f);
  const view = [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
  const t = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const proj = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    out[c * 4 + r] = proj[r]! * view[c * 4]! + proj[4 + r]! * view[c * 4 + 1]! + proj[8 + r]! * view[c * 4 + 2]! + proj[12 + r]! * view[c * 4 + 3]!;
  }
  return out;
}

const box = (center: V3, size: V3, label = "caster"): RenderItem => ({
  geometry: { bounds: { min: [-size[0] / 2, -size[1] / 2, -size[2] / 2], max: [size[0] / 2, size[1] / 2, size[2] / 2] } },
  modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, center[0], center[1], center[2], 1]),
  label
} as never);

const camera = { viewProjectionMatrix: viewProjection([0, 6, 12], [0, 2, -20], 57, 16 / 9, 0.1, 3200), near: 0.1, far: 3200 };
const sun = norm([40, -67, -56]);
const fit = (casters: readonly RenderItem[]) => fitDirectionalCascades({ camera, lightDirection: sun, casters, mapSize: 2048, cascadeCount: 3, maxDistance: 150 });

describe("sun cascade fit with scene-spanning casters", () => {
  const houses = [box([-8, 4, -30], [6, 8, 6], "house"), box([9, 4, -45], [6, 8, 6], "house")];
  const slice = fit([]);

  it("a caster that spans the whole course never inflates a cascade past its own frustum slice", () => {
    const spanning = box([0, 10, -1200], [60, 20, 2400], "instanced-forest");
    const withSpanning = fit([...houses, spanning]);
    for (let i = 0; i < slice.length; i += 1) {
      expect(withSpanning[i]!.radius, `cascade ${i} radius`).toBeCloseTo(slice[i]!.radius, 6);
      expect(withSpanning[i]!.texelWorld, `cascade ${i} texel`).toBeCloseTo(slice[i]!.texelWorld, 9);
    }
  });

  it("a mountain kilometres away changes neither radius nor texel size", () => {
    const mountain = box([900, 200, -2500], [800, 400, 800], "mountain");
    const withMountain = fit([...houses, mountain]);
    for (let i = 0; i < slice.length; i += 1) {
      expect(withMountain[i]!.radius).toBeCloseTo(slice[i]!.radius, 6);
      expect(withMountain[i]!.texelWorld).toBeCloseTo(slice[i]!.texelWorld, 9);
    }
  });

  it("a tall caster toward the light, over the slice, extends the depth range so it still shadows it", () => {
    const last = slice.length - 1;
    const lightward: V3 = [-sun[0], -sun[1], -sun[2]];
    // a tower on the last slice's axis, then lifted toward the light
    const around: V3 = [0, 0, -40];
    const lifted: V3 = [around[0] + lightward[0] * 120, around[1] + lightward[1] * 120, around[2] + lightward[2] * 120];
    const base = fit([box(around, [6, 6, 6], "near")])[last]!;
    const withTall = fit([box(around, [6, 6, 6], "near"), box(lifted, [6, 6, 6], "tall")])[last]!;
    expect(Math.abs(withTall.drawViewProjection[10]!), "depth scale shrinks (range grows) toward the light").toBeLessThan(Math.abs(base.drawViewProjection[10]!));
    expect(withTall.radius).toBeCloseTo(base.radius, 6);
  });
});

describe("clip range taken from the view-projection", () => {
  it("a caller far that disagrees with the VP does not shrink every slice to a sliver", () => {
    const vp = viewProjection([0, 4, 8], [0, 0, 0], 60, 16 / 9, 0.1, 50);
    const base = { lightDirection: sun, casters: [], mapSize: 1024, cascadeCount: 1, maxDistance: 30 } as const;
    const right = fitDirectionalCascades({ ...base, camera: { viewProjectionMatrix: vp, near: 0.1, far: 50 } })[0]!;
    const wrong = fitDirectionalCascades({ ...base, camera: { viewProjectionMatrix: vp, near: 0.1, far: 1000 } })[0]!;
    expect(wrong.radius).toBeCloseTo(right.radius, 3);
    expect(right.radius).toBeGreaterThan(10);
  });
});

describe("oversize shadow casters (sky domes)", () => {
  it("flags a 4000 m dome and ignores houses, instanced sets and bounds-less items", () => {
    expect(isOversizeShadowCaster(box([0, 0, 0], [4000, 4000, 4000], "sky"), 150)).toBe(true);
    expect(isOversizeShadowCaster(box([0, 0, 0], [20, 12, 20], "house"), 150)).toBe(false);
    const instanced = { ...box([0, 0, 0], [3000, 10, 10], "forest"), instanceTransforms: new Float32Array(32) } as RenderItem;
    expect(isOversizeShadowCaster(instanced, 150)).toBe(false);
    expect(isOversizeShadowCaster({ label: "no-bounds" } as never, 150)).toBe(false);
  });

  it("scales with the shadow distance but never drops below 100 m", () => {
    expect(isOversizeShadowCaster(box([0, 0, 0], [90, 5, 90], "wall"), 10)).toBe(false);
    expect(isOversizeShadowCaster(box([0, 0, 0], [700, 400, 700], "shell"), 150)).toBe(true);
    expect(isOversizeShadowCaster(box([0, 0, 0], [700, 400, 700], "shell"), 400)).toBe(false);
  });

  it("a large flat ground plane or court floor is a receiver, never an oversize shell", () => {
    expect(isOversizeShadowCaster(box([0, 0, 0], [700, 5, 700], "plane"), 150)).toBe(false);
    expect(isOversizeShadowCaster(box([0, -0.05, 0], [4000, 0.1, 4000], "court-floor"), 150)).toBe(false);
  });

  it("the shadow system skips an oversize caster and reports it", () => {
    const device = { info: { capabilities: ["render-targets", "depth-textures"] } } as never;
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 1024, cascades: 2, maxDistance: 150, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 });
    const sky = box([0, 0, 0], [4000, 4000, 4000], "sky");
    const house = box([-8, 4, -30], [6, 8, 6], "house");
    try { system.update({ camera, sun: { direction: sun }, casters: [sky, house], localLights: [], flags: undefined as never, tier: undefined as never }); } catch { /* rendering needs a real device; the fit and the drop list are set before it */ }
    expect(system.diagnostics().droppedFeatures).toContain("shadow.caster.oversize:sky");
    expect(system.cascadeFits().length).toBe(2);
  });
});
