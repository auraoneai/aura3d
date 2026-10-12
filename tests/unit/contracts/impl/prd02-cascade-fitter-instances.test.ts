// 02-S4 (prd02-16b, prd02-caster-fixtures): the sun cascade fit must cover
// every instance of an instanced caster. The fitter boxed only the base
// geometry, so the caster-rect clamp cropped instances out of the ortho
// (GPU run 38187483876: 16b IoU 0.34; 6 of 16 instance shadows).
import { describe, expect, it } from "vitest";
import { fitDirectionalCascades } from "../../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

type V3 = readonly [number, number, number];
const norm = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

function viewProjection(eye: V3, target: V3, fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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

const apply = (m: Float32Array, p: V3) => [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!);

/** 4×4 grid of 0.5 m cubes, 1.5 m apart, as one instanced item at the origin. */
const positions: V3[] = [];
for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) positions.push([(i - 1.5) * 1.5, 0.25, (j - 1.5) * 1.5]);
const instanceTransforms = new Float32Array(positions.flatMap((p) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1]));
const instanced: RenderItem = {
  geometry: { bounds: { min: [-0.25, -0.25, -0.25], max: [0.25, 0.25, 0.25] } },
  modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  instanceTransforms,
  label: "instances"
} as never;

const sun = norm([-4, -7, -3]);

describe("02-S4 instanced casters in the sun cascade fit", () => {
  it("every instance's top and its ground shadow land inside the map, occluder nearer than receiver", () => {
    const [cascade] = fitDirectionalCascades({
      camera: { viewProjectionMatrix: viewProjection([0, 5, 9], [0, 0, 0], 45, 16 / 9, 0.1, 100), near: 0.1, far: 100 },
      lightDirection: sun,
      casters: [instanced],
      mapSize: 2048,
      cascadeCount: 1,
      maxDistance: 100
    });
    const inside = (p: V3) => {
      const [u, v, z] = apply(cascade!.viewProjection, p);
      return u! >= 0 && u! <= 1 && v! >= 0 && v! <= 1 && z! >= 0 && z! <= 1;
    };
    for (const p of positions) {
      const top: V3 = [p[0], 0.5, p[2]];
      const t = top[1] / -sun[1];
      const ground: V3 = [top[0] + sun[0] * t, 0, top[2] + sun[2] * t];
      expect(inside(top), `instance top ${p}`).toBe(true);
      expect(inside(ground), `instance shadow ${p}`).toBe(true);
      expect(apply(cascade!.viewProjection, ground)[2]!).toBeGreaterThan(apply(cascade!.viewProjection, top)[2]!);
    }
  });
});
