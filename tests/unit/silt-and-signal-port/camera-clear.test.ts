import { describe, expect, it } from "vitest";
import { createSim, stepSim, type Input } from "../../../examples/silt-and-signal-port/sim";
import { CAMERA_MARGIN, chaseEyeBlocked, clearChaseEye, createChaseClearance, sceneryColumns, wantedChaseEye } from "../../../examples/silt-and-signal-port/camera";
import { createTerrain } from "../../../examples/silt-and-signal-port/terrain";
import { pushOut } from "../../../examples/silt-and-signal-port/collide";

const FLY_BOOST: Input = { throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false };
const FLY: Input = { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false };
const SCENERY = sceneryColumns(createTerrain(0).props());

/** The flight the screenshot lane used: objective 2 of chapter 0, boosting and steering, then straight. */
function fly(onFrame: (sim: ReturnType<typeof createSim>) => void): void {
  const sim = createSim(0, 2);
  for (let i = 0; i < 900; i += 1) {
    stepSim(sim, i < 300 ? FLY_BOOST : FLY);
    if (i % 3 === 0) onFrame(sim);
  }
}

describe("Duneglide chase camera clearance", () => {
  it("the unobstructed chase eye does sit inside scenery during chapter-0 flight (the defect)", () => {
    let blockedFrames = 0;
    fly((sim) => {
      const e = wantedChaseEye(sim);
      if (chaseEyeBlocked(sim.world, SCENERY)(e[0], e[1], e[2])) blockedFrames += 1;
    });
    expect(blockedFrames).toBeGreaterThan(0);
  });

  it("the cleared eye leaves almost no frame inside scenery, and what remains is at the minimum distance", () => {
    const clearance = createChaseClearance();
    const blocked = chaseEyeBlocked;
    let frames = 0, unclearedBlocked = 0, clearedBlocked = 0, remainingFarFromRider = 0;
    fly((sim) => {
      const wanted = wantedChaseEye(sim);
      const e = clearChaseEye(sim, clearance, 3 / 60, SCENERY);
      frames += 1;
      if (blocked(sim.world, SCENERY)(wanted[0], wanted[1], wanted[2])) unclearedBlocked += 1;
      if (blocked(sim.world, SCENERY)(e[0], e[1], e[2])) {
        clearedBlocked += 1;
        // the only frames left are ones where even the minimum distance behind the rider is inside scenery
        if (Math.hypot(e[0] - sim.state.x, e[1] - (sim.state.y + 2.2), e[2] - sim.state.z) > 2.6) remainingFarFromRider += 1;
      }
    });
    expect(frames).toBeGreaterThan(200);
    expect(unclearedBlocked).toBeGreaterThan(0);
    expect(clearedBlocked).toBeLessThanOrEqual(Math.max(1, Math.floor(unclearedBlocked * 0.15)));
    expect(remainingFarFromRider).toBe(0);
  });

  it("keeps the margin to every collider while flying, so a wall never fills the view", () => {
    const clearance = createChaseClearance();
    let worst = Infinity;
    fly((sim) => {
      const e = clearChaseEye(sim, clearance, 3 / 60, SCENERY);
      for (const c of sim.world.colliders ?? []) {
        // distance from the eye to the collider's footprint edge, only where the eye is inside its height band
        if (e[1] < c.bottom - 0.6 || e[1] > c.top + 0.6) continue;
        const inside = pushOut({ x: e[0], y: e[1], z: e[2] }, c, CAMERA_MARGIN - 0.05, 0.6) !== null;
        if (inside) worst = Math.min(worst, 0);
      }
    });
    expect(worst).toBe(Infinity);
  });

  it("an open-air chapter keeps the full chase distance", () => {
    const sim = createSim(2, 0);
    const clearance = createChaseClearance();
    for (let i = 0; i < 60; i += 1) stepSim(sim, FLY);
    const wanted = wantedChaseEye(sim);
    const eye = clearChaseEye(sim, clearance, 1 / 60, SCENERY);
    expect(Math.hypot(eye[0] - wanted[0], eye[1] - wanted[1], eye[2] - wanted[2])).toBeLessThan(1e-6);
  });
});
