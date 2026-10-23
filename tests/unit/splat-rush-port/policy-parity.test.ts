import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_PARAMS, steerPolicy, type PolicyView } from "../../../tools/crayon-capture/splat-rush-lib";
import { DEFAULT_AUTOPILOT, steerDx } from "../../../examples/splat-rush-port/autopilot";
import { SplatRushSim } from "../../../examples/splat-rush-port/sim";

/** The in-port autopilot and the capture tool's steering policy must pick the same dx for the same view. */
describe("splat-rush-port autopilot equals the capture steering policy", () => {
  it("agrees on every step of a real run, including mistake rows", () => {
    for (const mistakeRows of [[], [1, 3]]) {
      const sim = new SplatRushSim(7);
      for (let i = 0; i < 30; i++) sim.advance();
      sim.advance({ start: true, down: false, up: false, dx: 0 });
      sim.advance({ start: false, down: true, up: false, dx: 0 });
      let rows = 0;
      const seen = new Set<object>();
      let compared = 0;
      for (let step = 0; step < 900; step++) {
        const view: PolicyView = {
          phase: sim.o.phase,
          playerColorIndex: sim.o.playerColorIndex,
          rainbow: sim.o.isRainbowActive,
          laneOffset: sim.o.laneOffset,
          ye: sim.ye,
          gates: sim.gates.map((g) => ({ z: g.z, laneX: g.laneX, colorIndex: g.colorIndex, passed: g.passed })),
          rowsPassed: rows
        };
        const params = { ...DEFAULT_POLICY_PARAMS, mistakeRows };
        const a = steerPolicy(view, params);
        const b = steerDx(sim, { ...DEFAULT_AUTOPILOT, mistakeRows }, rows);
        expect(b).toBe(a);
        compared += a !== 0 ? 1 : 0;
        sim.advance({ start: false, down: false, up: false, dx: a });
        let fresh = false;
        for (const g of sim.gates) if (g.passed && !seen.has(g)) { seen.add(g); fresh = true; }
        if (fresh) rows++;
      }
      expect(compared).toBeGreaterThan(20);
      expect(rows).toBeGreaterThan(5);
    }
  });
});
