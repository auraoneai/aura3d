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

describe("the epilogue camera clears the trees (found while capturing the ending reached by play)", () => {
  it("from the bell to the jetty and 40 s out to sea, no tree top is above the camera within its crown radius", async () => {
    const { buildScenery } = await import("../../../examples/where-the-wind-wanders-port/scenery");
    const { SEA_LEVEL } = await import("../../../examples/where-the-wind-wanders-port/terrain");
    const { EPILOGUE_CAMERA_RISE } = await import("../../../examples/where-the-wind-wanders-port/world");
    const sc = buildScenery(4242, { bell: true, cottage: true, trees: true, stones: true, shrubs: true });
    const trees = [
      ...sc.placements.oaks.map((p) => ({ x: p.x, z: p.z, top: p.y + (p.h ?? 6), r: 0.5 * (p.h ?? 6) })),
      ...sc.placements.pines.map((p) => ({ x: p.x, z: p.z, top: p.y + (p.h ?? 6), r: 0.3 * (p.h ?? 6) }))
    ];
    const boat = (e: number) => {
      const u = Math.min(1, Math.max(0, e - 4) / 80), ease = u * u * (3 - 2 * u);
      return { x: sc.boatMoor.x + (-22 - sc.boatMoor.x) * ease + 6 * Math.sin(ease * Math.PI), y: SEA_LEVEL + 0.02, z: sc.boatMoor.z + (-108 - sc.boatMoor.z) * ease };
    };
    const look = { x: 48.6, y: 4, z: 0.8 };
    let worst = Infinity;
    for (let e = 0; e < 40; e += 0.05) {
      const b = boat(e), k = Math.min(1, e / 6), a = 1 - Math.exp(-1.5 * 0.05);
      look.x += (b.x - 4 * (1 - k) - look.x) * a; look.y += (b.y + 2.2 - look.y) * a; look.z += (b.z - 2 - look.z) * a;
      const cam = { x: look.x - 9, y: look.y + EPILOGUE_CAMERA_RISE, z: look.z + 14 };
      for (const t of trees) if (t.top >= cam.y - 0.3) worst = Math.min(worst, Math.hypot(t.x - cam.x, t.z - cam.z) - t.r);
    }
    expect(worst).toBeGreaterThan(2);
  });
});
