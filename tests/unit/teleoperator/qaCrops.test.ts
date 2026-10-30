import { describe, expect, it } from "vitest";
import { STATIC_CROPS, carCrop } from "../../../apps/showcase-teleoperator/src/qaCrops";

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
// Orthographic toy projector: 1 m = 100 px, origin at the canvas centre, y up.
const ortho = (p: readonly [number, number, number]) => ({ x: 640 + p[0] * 100, y: 360 - p[1] * 100, visible: p[2] < 0 });

describe("grid dispatch QA crops (E-I crop contract)", () => {
  it("static crops are named per the contract and inside the canvas; at most 16 with the car", () => {
    for (const c of STATIC_CROPS) {
      expect(c.name).toMatch(NAME);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1);
      expect(c.y + c.h).toBeLessThanOrEqual(1);
    }
    expect(STATIC_CROPS.length + 1).toBeLessThanOrEqual(16);
  });
  it("the car crop is the projected box of the car and follows it across lanes", () => {
    const at = (x: number) => carCrop(ortho, 1280, 720, { x, y: 0, z: -3, width: 2, height: 1.5, length: 4 })!;
    const a = at(0);
    expect(a.name).toBe("car");
    expect(a.w).toBeCloseTo(200 / 1280, 5);
    expect(a.h).toBeCloseTo(150 / 720, 5);
    expect(at(2).x).toBeGreaterThan(a.x);
  });
  it("off screen: no car crop", () => {
    expect(carCrop(() => ({ x: 0, y: 0, visible: false }), 1280, 720, { x: 0, y: 0, z: 5, width: 2, height: 1.5, length: 4 })).toBeNull();
  });
});
