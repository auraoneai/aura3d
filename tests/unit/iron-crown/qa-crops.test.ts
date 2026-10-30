/**
 * IRON CROWN QA crops (GU47 WP-15 IC47-L1 capture hook): fighter, foot and outer-ring crops projected through the
 * presented view-projection (column-major, as `app.camera.evidence().viewProjection`).
 */
import { describe, expect, it } from "vitest";
import { fightCrops, projectToScreen, QA_FIGHTER_BOX } from "../../../apps/showcase-iron-crown/src/game/qaCrops";

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Column-major perspective * lookAt (gl-matrix conventions). */
function viewProjection(eye: V3, target: V3, fovDeg: number, aspect: number): number[] {
  const z = norm(sub(eye, target));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  const view = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const near = 0.1;
  const far = 200;
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += proj[k * 4 + r]! * view[c * 4 + k]!;
  return out;
}

describe("IRON CROWN QA crops", () => {
  const vp = viewProjection([0, 1.4, 5.2], [0, 0.8, 0], 40, 16 / 9);

  it("projects the look-at target to the frame centre and points behind the camera to null", () => {
    const c = projectToScreen(vp, [0, 0.8, 0])!;
    expect(c[0]).toBeCloseTo(0.5, 5);
    expect(c[1]).toBeCloseTo(0.5, 5);
    expect(projectToScreen(vp, [0, 1.4, 9])).toBeNull();
    expect(projectToScreen([], [0, 0, 0])).toBeNull();
  });

  it("publishes a fighter box per side, its foot strip at the bottom, and the two outer-ring bands", () => {
    const crops = fightCrops(vp, [
      { id: "p1", position: [-1.2, 0, 0] },
      { id: "p2", position: [1.2, 0, 0] }
    ]);
    const by = Object.fromEntries(crops.map((c) => [c.name, c]));
    expect(Object.keys(by).sort()).toEqual(["fighter-p1", "fighter-p2", "foot-p1", "foot-p2", "outer-ring-left", "outer-ring-right"]);
    expect(by["fighter-p1"]!.x + by["fighter-p1"]!.w).toBeLessThan(0.5);
    expect(by["fighter-p2"]!.x).toBeGreaterThan(0.5);
    for (const id of ["p1", "p2"]) {
      const body = by[`fighter-${id}`]!;
      const foot = by[`foot-${id}`]!;
      expect(foot.y + foot.h).toBeCloseTo(body.y + body.h, 3);
      expect(foot.h).toBeLessThan(body.h * (QA_FIGHTER_BOX.footShare + 0.1));
    }
    for (const c of crops) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001);
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001);
    }
  });

  it("follows the camera: a closer camera makes the fighter crop taller", () => {
    const near = viewProjection([0, 1.4, 3.6], [0, 0.8, 0], 40, 16 / 9);
    const far = fightCrops(vp, [{ id: "p1", position: [0, 0, 0] }])[0]!;
    const close = fightCrops(near, [{ id: "p1", position: [0, 0, 0] }])[0]!;
    expect(close.name).toBe("fighter-p1");
    expect(close.h).toBeGreaterThan(far.h);
  });
});
