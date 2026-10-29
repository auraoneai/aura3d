import { describe, expect, it } from "vitest";
import { CLIP_SECONDS, FOOTFALL_SPACING, STRIDE_SPEED, footstepCell } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { BELLTOWER_FILE_BOUNDS, BELL_PIVOT_IN_FILE, bellModelPose } from "../../../examples/where-the-wind-wanders-port/models";
import { MODEL_BELL_AMPLITUDE, bellSwing } from "../../../examples/where-the-wind-wanders-port/world";
import { createState, stepFrame } from "../../../examples/where-the-wind-wanders-port/sim";

describe("footsteps follow the Walk clip's footfalls (audit WW-12)", () => {
  it("one footfall every half Walk cycle of ground travel, about 1.235 u", () => {
    expect(FOOTFALL_SPACING).toBeCloseTo((STRIDE_SPEED.Walk * CLIP_SECONDS.Walk) / 2, 6);
    expect(FOOTFALL_SPACING).toBeGreaterThan(1.2);
    expect(FOOTFALL_SPACING).toBeLessThan(1.27);
  });
  it("walking 24.7 u in a straight line plays 20 footsteps (it played 22 before)", () => {
    const s = createState();
    s.pos = { x: -40, z: 10 };
    let cell = footstepCell(s.stride), steps = 0, oldCell = Math.floor(s.stride * 2), oldSteps = 0;
    const x0 = s.pos.x;
    while (s.pos.x - x0 < 24.7) {
      stepFrame(s, { keys: "D", act: null });
      const c = footstepCell(s.stride);
      if (c !== cell) { steps++; cell = c; }
      const o = Math.floor(s.stride * 2);
      if (o !== oldCell) { oldSteps++; oldCell = o; }
    }
    const travelled = s.stride * 2.2;
    expect(steps).toBe(Math.floor(travelled / FOOTFALL_SPACING));
    expect(steps).toBe(20);
    expect(oldSteps).toBeGreaterThan(steps);
  });
});

describe("the model bell swings from its yoke inside the placed tower (audit WW-4)", () => {
  it("the bell node sits at the yoke of a 4.6-tall tower placed at the bell placement", () => {
    const tower = { x: 49, y: 1.2, z: 5, h: 4.6 };
    const pose = bellModelPose(tower);
    const b = BELLTOWER_FILE_BOUNDS;
    expect(pose.scale).toBeCloseTo(4.6 / (b.max[1] - b.min[1]), 6);
    // the yoke is 1.573 file units above the tower's base: 3.80 world units up a 4.6 tower
    expect(pose.position[1] - tower.y).toBeCloseTo((BELL_PIVOT_IN_FILE[1] - b.min[1]) * pose.scale, 6);
    expect(pose.position[1] - tower.y).toBeGreaterThan(3.5);
    expect(pose.position[1] - tower.y).toBeLessThan(4.6);
    expect(Math.abs(pose.position[0] - tower.x)).toBeLessThan(0.05);
  });
  it("after the ring the bell swings visibly, before it only sways", () => {
    const rung = Array.from({ length: 600 }, (_, i) => Math.abs(bellSwing(i / 100, true, MODEL_BELL_AMPLITUDE)));
    const idle = Array.from({ length: 600 }, (_, i) => Math.abs(bellSwing(i / 100, false, MODEL_BELL_AMPLITUDE)));
    expect(Math.max(...rung)).toBeGreaterThan(0.08);
    expect(Math.max(...rung)).toBeLessThan(0.13);
    expect(Math.max(...idle)).toBeLessThan(0.01);
  });
  it("reduced motion scales the swing down", () => {
    expect(Math.abs(bellSwing(0.3, true, 1, 0.3))).toBeCloseTo(Math.abs(bellSwing(0.3, true, 1, 1)) * 0.3, 9);
  });
});
