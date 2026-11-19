/** Idol wow pass (MOVING-PARTS.md): rotor-blur discs spin inside every Idol drone's four lift-fan ducts. */
import { describe, expect, it } from "vitest";
import { fanSpinAngle, IDOL_FANS, IDOL_NOZZLES } from "../../../apps/showcase-heatsink/src/art/idolModels";
import { DRONE_ORDER, DRONE_SPECS } from "../../../apps/showcase-heatsink/src/data";

describe("Thermal Drift Idol drone moving parts", () => {
  it("seats the four fans inside each hull's footprint, ahead of the tail nozzles", () => {
    for (const id of DRONE_ORDER) {
      const f = IDOL_FANS[id], half = DRONE_SPECS[id].maxDim / 2;
      expect(f.lateral + f.radius, id).toBeLessThanOrEqual(half + 0.05);
      expect(Math.max(f.fore, f.aft) + f.radius, id).toBeLessThanOrEqual(half + 0.1);
      expect(f.aft, id).toBeLessThan(IDOL_NOZZLES[id].back);
      expect(f.radius, id).toBeGreaterThan(0.2);
    }
  });

  it("spins every fan over a few frames, neighbours counter-rotating", () => {
    for (let corner = 0; corner < 4; corner++) {
      const a = fanSpinAngle(1, corner), b = fanSpinAngle(1 + 3 / 60, corner);
      expect(Math.abs(b - a), `corner ${corner}`).toBeGreaterThan(1);
      expect(Math.sign(b - a)).toBe(corner % 2 === 0 ? 1 : -1);
    }
  });
});
