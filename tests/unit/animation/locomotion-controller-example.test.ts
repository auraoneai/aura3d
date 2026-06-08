import { describe, expect, it } from "vitest";
import { LocomotionController, createRootMotionWalkClip } from "../../../packages/animation/src";

// Public usage example for the path-follow LocomotionController: a procedural root-motion walk clip
// drives a character along a curved path, producing world position + heading + stride samples.
describe("LocomotionController path-follow example", () => {
  const makeController = () =>
    new LocomotionController({ clip: createRootMotionWalkClip({ name: "walk", duration: 1, distance: 4 }), speed: 1, pathRadius: 5, strideAmplitude: 0.3 });

  it("advances the character along the path over time (position + root-motion distance grow)", () => {
    const c = makeController();
    const start = c.sample(0);
    const mid = c.sample(0.5);
    const end = c.sample(1);
    expect(end.rootMotionDistance).toBeGreaterThan(start.rootMotionDistance);
    // moved somewhere on the XZ plane
    const moved = Math.hypot(end.worldX - start.worldX, end.worldZ - start.worldZ);
    expect(moved).toBeGreaterThan(0.1);
    expect(mid.clipName).toBe("walk");
  });

  it("curves the heading when a finite path radius is set", () => {
    const c = makeController();
    const a = c.sample(0);
    const b = c.sample(1);
    expect(Math.abs(b.heading - a.heading)).toBeGreaterThan(0.001);
  });

  it("is deterministic for identical sample times", () => {
    const run = () => {
      const c = makeController();
      return [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const s = c.sample(t);
        return [Number(s.worldX.toFixed(5)), Number(s.worldZ.toFixed(5)), Number(s.heading.toFixed(5))];
      });
    };
    expect(run()).toEqual(run());
  });

  it("stays in place when inPlace is set (no world translation)", () => {
    const c = new LocomotionController({ clip: createRootMotionWalkClip({ name: "walk", duration: 1, distance: 4 }), speed: 1, inPlace: true });
    const a = c.sample(0);
    const b = c.sample(1);
    expect(Math.hypot(b.worldX - a.worldX, b.worldZ - a.worldZ)).toBeLessThan(1e-6);
  });
});
