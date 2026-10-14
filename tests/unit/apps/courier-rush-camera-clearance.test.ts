import { describe, expect, it } from "vitest";
import {
  CHASE_MIN_DISTANCE,
  cameraPointClear,
  clearanceLift,
  chaseClearance,
  createChaseClearance
} from "../../../apps/showcase-courier-rush/src/gameplay/camera-clearance";
import { CHASE_CAMERA } from "../../../apps/showcase-courier-rush/src/gameplay/van";

// Flicker-probe flash fix: the chase eye must never sit inside a solid box.
describe("courier chase camera clearance", () => {
  const trailNorth = { dirX: 0, dirZ: 1 }; // van heading -z, eye trails toward +z

  it("keeps the full chase distance on an open stretch of the main road", () => {
    const c = chaseClearance(0, 16, trailNorth.dirX, trailNorth.dirZ, CHASE_CAMERA.distance, CHASE_CAMERA.height);
    expect(c.distance).toBe(CHASE_CAMERA.distance);
    expect(c.minOffsetY).toBe(0);
  });

  it("lifts the eye over the pressure-gate crossbar instead of passing through it", () => {
    const c = chaseClearance(0, 6.2, trailNorth.dirX, trailNorth.dirZ, CHASE_CAMERA.distance, CHASE_CAMERA.height);
    expect(c.minOffsetY + 0.2).toBeGreaterThan(3.33);
    expect(cameraPointClear(0, 10.6, 3.2)).toBe(false);
    expect(cameraPointClear(0, 10.6, 0.2 + c.minOffsetY)).toBe(true);
  });

  it("pulls in rather than trailing into a kit tower", () => {
    // Van heading +x along the east-west road at z = 4.6, just past the
    // x = -5.7 / z = 7.8 tower: an eye trailing toward -x and +z would enter it.
    const c = chaseClearance(-1.0, 4.6, -0.6, 0.8, 9, CHASE_CAMERA.height);
    expect(c.distance).toBeLessThan(9);
    expect(c.distance).toBeGreaterThanOrEqual(CHASE_MIN_DISTANCE);
  });

  it("lifts the final eye when the minimum distance still ends inside a tower", () => {
    const c = chaseClearance(-1, 4.6, -0.6, 0.8, 9, CHASE_CAMERA.height);
    expect(c.distance).toBe(CHASE_MIN_DISTANCE);
    const eyeX = -1 - 0.6 * c.distance;
    const eyeZ = 4.6 + 0.8 * c.distance;
    const uncorrectedY = 0.2 + CHASE_CAMERA.height + clearanceLift(9, c.distance);
    expect(cameraPointClear(eyeX, eyeZ, uncorrectedY)).toBe(false);
    const eyeY = 0.2 + Math.max(CHASE_CAMERA.height + clearanceLift(9, c.distance), c.minOffsetY);
    expect(cameraPointClear(eyeX, eyeZ, eyeY)).toBe(true);
  });

  it("rises above the roof when the van itself is inside a block", () => {
    const c = chaseClearance(-5.7, 7.8, 0, 1, CHASE_CAMERA.distance, CHASE_CAMERA.height);
    expect(c.distance).toBe(CHASE_MIN_DISTANCE);
    expect(c.minOffsetY).toBeGreaterThan(6);
  });

  it("filter reacts immediately to a block and eases back out", () => {
    const f = createChaseClearance();
    expect(f.update(0, 16, 0, 1, 5.25, 3, 1 / 60).distance).toBe(5.25);
    expect(f.update(-5.7, 7.8, 0, 1, 5.25, 3, 1 / 60).minOffsetY).toBeGreaterThan(6);
    const after = f.update(0, 16, 0, 1, 5.25, 3, 1 / 60);
    expect(after.minOffsetY).toBeGreaterThan(5);
    expect(after.distance).toBeLessThan(5.25);
  });
});
