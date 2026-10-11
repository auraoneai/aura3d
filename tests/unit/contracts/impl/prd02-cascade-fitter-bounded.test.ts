// #1141: under A3D_QR_LIGHTING the 12-shadows sun cascade covered the whole
// camera frustum (far 100 m) instead of the bounded 14 m set, so shadows came
// out coarse and detached. The fitter must shrink to the caster rectangle.
import { describe, expect, it } from "vitest";
import { casterRectClamp, fitDirectionalCascades, sliceDepthWithinRect } from "../../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

type V3 = readonly [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Column-major perspective × lookAt (GL conventions), like the benchmark camera. */
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

const box = (center: V3, size: V3): RenderItem => ({
  geometry: { bounds: { min: [-size[0] / 2, -size[1] / 2, -size[2] / 2], max: [size[0] / 2, size[1] / 2, size[2] / 2] } },
  modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, center[0], center[1], center[2], 1]),
  label: "caster"
} as never);

const apply = (m: Float32Array, p: V3) => {
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  return [0, 1, 2].map((r) => (m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) / w);
};

// 12-shadows: camera (0,4.2,7.2) → (0,0.4,0), fov 45, far 100; sun from (5,8,4); ground (non-caster) 14 m.
const casters = [
  box([-1.5, 1, 0], [0.8, 2, 0.8]),
  box([0, 0.5, 0.8], [1, 1, 1]),
  box([1.6, 0.6, -0.4], [0.7, 1.2, 0.7]),
  box([0.9, 0.25, 1.6], [0.5, 0.5, 0.5]),
  box([-0.2, 1.6, -1.4], [1.2, 0.1, 1.2])
];
const sunDirection = norm([-5, -8, -4]);
const fit12 = (sceneCasters: readonly RenderItem[] = casters, padding = 0.25) => fitDirectionalCascades({
  camera: { viewProjectionMatrix: viewProjection([0, 4.2, 7.2], [0, 0.4, 0], 45, 16 / 9, 0.1, 100), near: 0.1, far: 100 },
  lightDirection: sunDirection,
  casters: sceneCasters,
  padding,
  mapSize: 2048,
  cascadeCount: 1,
  maxDistance: 100
})[0]!;

describe("#1141 bounded-scene sun cascade (12-shadows)", () => {
  it("fits the caster rectangle, not the 100 m frustum", () => {
    const cascade = fit12();
    // Casters span ~4.5 m; the frustum-sphere fit was > 100 m (texel > 5 cm).
    expect(cascade.texelWorld * 2048).toBeLessThan(8);
    expect(cascade.texelWorld).toBeLessThan(0.004);
  });

  it("keeps every caster corner and the shadowed ground inside the map", () => {
    const cascade = fit12();
    const inside = (p: V3) => {
      const [u, v, z] = apply(cascade.viewProjection, p);
      return u! >= 0 && u! <= 1 && v! >= 0 && v! <= 1 && z! >= 0 && z! <= 1;
    };
    for (const [x, y, z] of [[-1.9, 2, 0.4], [-1.1, 0, -0.4], [0.4, 1.65, -0.8], [1.95, 0, -0.05]] as const) {
      expect(inside([x, y, z])).toBe(true);
    }
    // Ground hit of the shadow ray from the tall box's top corner (cast toward -x/-z).
    const top: V3 = [-1.9, 2, -0.4];
    const t = top[1] / -sunDirection[1];
    expect(inside([top[0] + sunDirection[0] * t, 0, top[2] + sunDirection[2] * t])).toBe(true);
  });
});

describe("sliceDepthWithinRect", () => {
  // Axis-aligned box slice [0,4]³ in light space.
  const cube: V3[] = [];
  for (const x of [0, 4]) for (const y of [0, 4]) cube.push([x, y, 0], [x, y, 4]);

  it("returns the slice depth inside an interior rectangle", () => {
    expect(sliceDepthWithinRect(cube, { minX: 1, maxX: 2, minY: 1, maxY: 2 })).toEqual({ zMin: 0, zMax: 4 });
  });

  it("returns null when the rectangle misses the slice", () => {
    expect(sliceDepthWithinRect(cube, { minX: 10, maxX: 11, minY: 10, maxY: 11 })).toBeNull();
  });
});


describe("bounded cascade fallback guards", () => {
  it("keeps zero-size casters with zero padding on a finite broad fit", () => {
    const cascade = fit12([box([0, 0, 0], [0, 0, 0])], 0);
    expect(cascade.texelWorld).toBeGreaterThan(0);
    expect(cascade.texelWorld * 2048).toBeCloseTo(2 * cascade.radius);
    expect(Array.from(cascade.viewProjection).every(Number.isFinite)).toBe(true);
    expect(Array.from(cascade.drawViewProjection).every(Number.isFinite)).toBe(true);
  });

  it.each(["missing", "nonfinite"])("disables shrinking when a caster has %s bounds", (kind) => {
    const unbounded = kind === "missing"
      ? { ...box([0, 0, 0], [1, 1, 1]), geometry: {} } as unknown as RenderItem
      : box([0, 0, 0], [Infinity, 1, 1]);
    const cascade = fit12([...casters, unbounded]);
    expect(cascade.casterCount).toBe(casters.length + 1);
    expect(cascade.texelWorld * 2048).toBeCloseTo(2 * cascade.radius + 0.5);
    expect(cascade.texelWorld).toBeGreaterThan(fit12().texelWorld * 10);
    expect(Array.from(cascade.viewProjection).every(Number.isFinite)).toBe(true);
  });

  it("rejects nonfinite clamp extents", () => {
    const cube: V3[] = [];
    for (const x of [0, 4]) for (const y of [0, 4]) cube.push([x, y, 0], [x, y, 4]);
    expect(casterRectClamp(cube, [{ min: [1, 1, 1], max: [2, 2, 2] }], {
      right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1]
    }, Infinity)).toBeNull();
  });
});
