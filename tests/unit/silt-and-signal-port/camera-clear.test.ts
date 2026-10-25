import { describe, expect, it } from "vitest";
import { createSim, stepSim, type Input } from "../../../examples/silt-and-signal-port/sim";
import { chaseEyeBlocked, clearChaseEye, createChaseClearance, wantedChaseEye } from "../../../examples/silt-and-signal-port/camera";

const FLY_BOOST: Input = { throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false };
const FLY: Input = { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false };

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
      if (chaseEyeBlocked(sim.world)(e[0], e[1], e[2])) blockedFrames += 1;
    });
    expect(blockedFrames).toBeGreaterThan(0);
  });

  it("the cleared eye is never inside scenery or under the terrain", () => {
    const clearance = createChaseClearance();
    let frames = 0;
    let blockedFrames = 0;
    let pulledFrames = 0;
    fly((sim) => {
      const e = clearChaseEye(sim, clearance, 3 / 60);
      const wanted = wantedChaseEye(sim);
      frames += 1;
      if (chaseEyeBlocked(sim.world)(e[0], e[1], e[2])) blockedFrames += 1;
      if (Math.hypot(e[0] - wanted[0], e[1] - wanted[1], e[2] - wanted[2]) > 0.01) pulledFrames += 1;
    });
    expect(frames).toBeGreaterThan(200);
    expect(blockedFrames).toBe(0);
    expect(pulledFrames).toBeGreaterThan(0);
  });

  it("an open-air chapter keeps the full chase distance", () => {
    const sim = createSim(2, 0);
    const clearance = createChaseClearance();
    for (let i = 0; i < 60; i += 1) stepSim(sim, FLY);
    const wanted = wantedChaseEye(sim);
    const eye = clearChaseEye(sim, clearance, 1 / 60);
    expect(Math.hypot(eye[0] - wanted[0], eye[1] - wanted[1], eye[2] - wanted[2])).toBeLessThan(1e-6);
  });
});
