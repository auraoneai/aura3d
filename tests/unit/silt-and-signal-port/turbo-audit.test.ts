/**
 * Duneglide full-run audit (2026-11-18), the two Turbo defects the owner saw:
 * 1. Passing roadside trees at Turbo the chase clearance pulled the eye to the 2.5 m minimum (head cropped, view straight
 *    down at the deck). Trees are now soft for the camera (only the trunk blocks; the crown fades, and all but vanishes
 *    when the eye is inside it), so autoplay never brings the eye within 5 m of the rider.
 * 2. At Turbo the balance arms rose to (or above) shoulder height in carves: the rejected arms-wide pose. Both hands now
 *    stay well below the shoulders at every speed, carve and air value, and the arms move smoothly frame to frame.
 * 3. `?autoplay=1` flew straight at each ring through canal piers and trees (27 impacts over the journey on the real GPU
 *    run, the camera in a crown after each) and was restarted by the watchdog twice in chapter 4 (a long U-turn read as
 *    a stall). The pilot now steers around obstacles, slows for U-turns and close obstacles, and the watchdog counts
 *    turning towards the target as progress.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, stepSim, STEP } from "../../../examples/silt-and-signal-port/sim";
import { AVOID_CLEARANCE, autoplayPilot, createAutoplayWatchdog, freeDistance } from "../../../examples/silt-and-signal-port/autopilot";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";
import { CAMERA_MARGIN, INKED_CHASE, TREE_CAMERA_MARGIN, TREE_TRUNK_RADIUS, chaseEyeBlocked, clearChaseEye, createChaseClearance, sceneryColumns } from "../../../examples/silt-and-signal-port/camera";
import { createTerrain } from "../../../examples/silt-and-signal-port/terrain";
import { createOcclusionFade, INSIDE_OPACITY } from "../../../examples/silt-and-signal-port/occlusionFade";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";
import { riderMotionPose, type RiderMotion } from "../../../examples/silt-and-signal-port/art/idolRider";

describe("Duneglide chase eye past roadside trees", () => {
  // the chapters whose autoplay route runs past trees (0 village road, 1 and 3 groves, 5 orchard)
  for (const chapter of [0, 1, 3, 5]) {
    it(`chapter ${chapter}: autoplay never pulls the eye within 5 m of the rider, and the eye never enters a trunk`, () => {
      let sim = createSim(chapter, 0);
      const props = createTerrain(chapter).props();
      const scenery = sceneryColumns(props);
      const clearance = createChaseClearance();
      const watchdog = createAutoplayWatchdog();
      let frames = 0, closest = Infinity, inTrunk = 0;
      for (let step = 0; step < 150 / STEP; step++) {
        if (sim.state.scene) { if (sim.state.pendingChapter !== null) break; sim.state.scene = null; }
        if (sim.state.completed) break;
        if (watchdog.update(sim, STEP)) sim = createSim(sim.state.chapter, sim.state.objective);
        stepSim(sim, autoplayPilot(sim), STEP);
        const e = clearChaseEye(sim, clearance, STEP, scenery, INKED_CHASE);
        frames += 1;
        closest = Math.min(closest, Math.hypot(e[0] - sim.state.x, e[2] - sim.state.z));
        for (const t of props.trees) {
          if (e[1] > t.y + 1.684 * t.scale) continue;
          if (Math.hypot(e[0] - t.x, e[2] - t.z) < TREE_TRUNK_RADIUS * t.scale) inTrunk += 1;
        }
      }
      expect(frames).toBeGreaterThan(1000);
      expect(closest, "closest chase eye to the rider (m)").toBeGreaterThan(5);
      expect(inTrunk).toBe(0);
    }, 60_000);
  }

  it("trees block only around the trunk; rocks, houses and piers keep the full margin", () => {
    const tree = { x: 0, y: 0, z: 0, scale: 5, yaw: 0 };
    const rock = { x: 40, y: 0, z: 0, scale: 2, yaw: 0 };
    const blocked = chaseEyeBlocked({ floor: () => 0 }, sceneryColumns({ trees: [tree], rocks: [rock], stone: [], brass: [] }));
    const trunk = TREE_TRUNK_RADIUS * tree.scale;
    expect(blocked(trunk + TREE_CAMERA_MARGIN - 0.1, 4, 0)).toBe(true);
    expect(blocked(trunk + TREE_CAMERA_MARGIN + 0.1, 4, 0)).toBe(false);
    expect(blocked(40 + 0.5 * rock.scale + CAMERA_MARGIN - 0.1, 1.5, 0)).toBe(true);
  });

  it("a crown around the eye all but vanishes (not a 25% green veil over the frame)", () => {
    const fade = createOcclusionFade([{ x: 0, y: 5, z: 8, r: 3 }]);
    for (let f = 0; f < 30; f++) fade.update([0, 5.5, 9], [0, 3, 0], 1 / 60);
    expect(fade.opacity[0]).toBeCloseTo(INSIDE_OPACITY, 5);
    const world = readFileSync("examples/silt-and-signal-port/world.ts", "utf8");
    expect(world).toMatch(/clearChaseEye\(sim, clearance, dt, scenery, framing\)/);
  });
});

describe("Duneglide rider arms at Turbo", () => {
  const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync("examples/silt-and-signal-port/assets/idol/duneRiderRig.glb"))));
  const r = driver.map.roles;
  /** world.ts's motion values for a speed (0..1), boost and carve. */
  const motion = (speed01: number, boosting: boolean, carve: number, air01: number, time: number): RiderMotion => ({
    crouch: (boosting ? 0.38 : 0.08) + speed01 * 0.1,
    leanFwd: 0.08 + (boosting ? 0.16 : 0) + speed01 * 0.1,
    carve,
    air01,
    celebrate: 0,
    breathe: Math.sin(time * 2.6) * 0.02,
    armWave: Math.sin(time * (3.1 + speed01 * 2.6)) * (0.028 + speed01 * 0.032),
    time,
    motion: 1,
    speed01
  });
  /** Angle (deg) of the shoulder->hand line below horizontal, for the higher of the two arms. */
  const highestArm = (m: RiderMotion): number => {
    const p = driver.modelPositions(riderMotionPose(m));
    let worst = 90;
    for (const [s, h] of [[r.leftUpperArm!, r.leftHand!], [r.rightUpperArm!, r.rightHand!]] as const) {
      const dx = p[h]![0] - p[s]![0], dy = p[h]![1] - p[s]![1], dz = p[h]![2] - p[s]![2];
      worst = Math.min(worst, (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
    }
    return worst;
  };

  it("keeps both hands at least 30 deg below the shoulders at every speed, carve and air (no arms-wide T-pose)", () => {
    for (const [speed01, boosting] of [[0, false], [0.5, false], [1, false], [1, true]] as const) {
      for (const carve of [-0.65, -0.3, 0, 0.3, 0.65]) {
        for (const air01 of [0, 0.6, 1]) {
          for (const time of [0, 0.35, 0.8, 1.3, 1.9, 2.6]) {
            expect(highestArm(motion(speed01, boosting, carve, air01, time)), `speed ${speed01} boost ${boosting} carve ${carve} air ${air01} t ${time}`).toBeGreaterThan(30);
          }
        }
      }
    }
  });

  it("the arms still respond to steering and move smoothly frame to frame at Turbo (no snapping)", () => {
    const hand = (m: RiderMotion) => driver.modelPositions(riderMotionPose(m))[r.leftHand!]!;
    const a = hand(motion(1, true, -0.5, 0, 0)), b = hand(motion(1, true, 0.5, 0, 0));
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.08 * driver.map.hipHeight);
    // a hard S-carve at 60 fps for 2 s: the hand path has no single-frame jump
    let prev = hand(motion(1, true, 0, 0, 0)), worst = 0;
    for (let f = 1; f <= 120; f++) {
      const t = f / 60;
      const p = hand(motion(1, true, 0.65 * Math.sin(t * 3), 0, t));
      worst = Math.max(worst, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
      prev = p;
    }
    expect(worst, "largest per-frame hand move (fraction of hip height)").toBeLessThan(0.04 * driver.map.hipHeight);
  });
});

describe("Duneglide autoplay flies around obstacles", () => {
  it("flies the whole journey with at most 2 impacts and no watchdog restart, and still boosts on the long clear legs", () => {
    let impacts = 0, restarts = 0, steps = 0, boosting = 0;
    for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
      let sim = createSim(chapter, 0);
      const watchdog = createAutoplayWatchdog();
      let done = false;
      for (let step = 0; step < 150 / STEP && !done; step++) {
        if (sim.state.scene) { if (sim.state.pendingChapter !== null) { done = true; break; } sim.state.scene = null; }
        if (sim.state.completed) { done = true; break; }
        if (watchdog.update(sim, STEP)) { restarts += 1; sim = createSim(sim.state.chapter, sim.state.objective); }
        if (stepSim(sim, autoplayPilot(sim), STEP).some((e) => e.type === "impact")) impacts += 1;
        steps += 1;
        if (sim.flight.boosting) boosting += 1;
      }
      expect(done, `chapter ${chapter} finishes`).toBe(true);
    }
    expect(restarts).toBe(0);
    expect(impacts).toBeLessThanOrEqual(2);
    expect(boosting / steps, "share of the journey flown in Turbo").toBeGreaterThan(0.05);
  }, 120_000);

  it("the free distance stops at a pier on the heading and ignores one beside the corridor or below the flight height", () => {
    const world = { floor: () => 0, colliders: [{ x: 0, z: -40, r: 2.4, bottom: -1, top: 40 }, { x: 30, z: -20, r: 2.4, bottom: -1, top: 40 }, { x: 0, z: -15, r: 1, bottom: 0, top: 3 }] };
    const sim = { state: { x: 0, y: 10, z: 0, yaw: 0 }, world } as unknown as Parameters<typeof freeDistance>[0];
    const free = freeDistance(sim, 0, 70);
    expect(free).toBeGreaterThan(40 - 2.4 - AVOID_CLEARANCE - 0.5);
    expect(free).toBeLessThan(40 - 2.4);
    expect(freeDistance(sim, Math.PI, 70)).toBe(70);
  });
});
