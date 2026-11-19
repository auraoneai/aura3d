/**
 * Idol wow pass regression: the first acceleration must not show a frozen clear-colour (orange) screen.
 * 1. Boot settles programs, the HDRI and every Idol texture upgrade (warmPrograms) before the loop starts and before the
 *    loading screen hides, so no program variant compiles in the first seconds of play.
 * 2. The chase camera never enters the skiff / courier / stern pennant during the first 5 s of a full-throttle start.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, stepSim } from "../../../examples/silt-and-signal-port/sim";
import { INKED_CHASE, ORIGINAL_CHASE, clearChaseEye, createChaseClearance, sceneryColumns } from "../../../examples/silt-and-signal-port/camera";
import { createTerrain } from "../../../examples/silt-and-signal-port/terrain";

describe("Duneglide Idol start", () => {
  it("warms programs, the HDRI and the Idol texture upgrades before the loop starts and the loading screen hides", () => {
    const src = readFileSync("examples/silt-and-signal-port/main.ts", "utf8");
    const boot = src.slice(src.indexOf("async function boot()"));
    const warm = boot.indexOf("await warmPrograms(app");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(0);
    expect(warm).toBeLessThan(boot.indexOf("loop.start()"));
    expect(warm).toBeLessThan(boot.indexOf("hideLoadingWhenSettled(Date.now())"));
    expect(boot.slice(warm, boot.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
  });

  it("keeps the chase eye outside the skiff, courier and stern pennant for the first 5 s of a full-throttle start", () => {
    const scenery = sceneryColumns(createTerrain(0).props());
    for (const framing of [INKED_CHASE, ORIGINAL_CHASE]) {
      for (const objective of [0, 1, 2]) {
        const sim = createSim(0, objective);
        const clearance = createChaseClearance();
        for (let frame = 0; frame < 300; frame++) {
          stepSim(sim, { throttle: 1, steer: frame > 150 ? 0.6 : 0, lift: 0, brake: false, boost: frame > 200, interact: false });
          const eye = clearChaseEye(sim, clearance, 1 / 60, scenery, framing);
          const s = sim.state;
          // the hero at its 1.3x render scale, in the rider's heading frame (metres from the sim position, y from s.y):
          // courier column (0.6 m round, deck y-1.0 to head y+1.4), hull box (+-1.1 m wide, 2.0 m fore/aft, keel y-1.6 to
          // deck y-0.7) and the stern pennant (0.8-2.3 m astern, up to y+0.0)
          const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
          const dx = eye[0] - s.x, dz = eye[2] - s.z, dy = eye[1] - s.y;
          const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
          const inCourier = Math.hypot(along, across) < 0.6 && dy > -1.0 && dy < 1.4;
          const inHull = Math.abs(across) < 1.1 && Math.abs(along) < 2.0 && dy > -1.6 && dy < -0.7;
          const inPennant = Math.abs(across) < 0.5 && along < -0.8 && along > -2.3 && dy > -1.0 && dy < 0.0;
          const inside = inCourier || inHull || inPennant;
          expect(inside, `objective ${objective} frame ${frame}`).toBe(false);
        }
      }
    }
  });
});
