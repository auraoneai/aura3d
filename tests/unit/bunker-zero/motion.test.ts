import { describe, expect, it } from "vitest";
import {
  BZ_DESCENT_SECONDS, damageArcDeg, deathFade, deathRoll, descentSeconds, doorOffset, reloadDip, viewmodelSway
} from "../../../apps/showcase-bunker-zero/src/art/motion";

describe("Bunker Zero motion (BZ-15, BZ-16, BZ-17)", () => {
  it("skips the descent bars, the death roll, sway and the reload dip under reduced motion (PRD §6.3)", () => {
    expect(descentSeconds(false)).toBe(BZ_DESCENT_SECONDS);
    expect(descentSeconds(true)).toBe(0);
    expect(deathRoll(2, true)).toBe(0);
    expect(viewmodelSway(3, 1, 1, true)).toEqual([0, 0]);
    expect(reloadDip(0.5, 1, true)).toBe(0);
    expect(deathFade(2, true)).toBe(0.6);
  });

  it("rolls 12 degrees on death and fades after it", () => {
    expect(deathRoll(0, false)).toBe(0);
    expect((deathRoll(5, false) * 180) / Math.PI).toBeCloseTo(12, 6);
    expect(deathFade(0.1, false)).toBe(0);
    expect(deathFade(5, false)).toBeCloseTo(0.85, 6);
    expect(reloadDip(0.5, 1, false)).toBeCloseTo(0.16, 6);
  });

  it("points the damage arc at the attacker within 45 degrees", () => {
    const p = { x: 0, z: 0, yaw: 0 }; // facing -z
    expect(damageArcDeg(p, { x: 0, z: -5 })).toBeCloseTo(0, 6);
    expect(damageArcDeg(p, { x: 5, z: 0 })).toBeCloseTo(90, 6);
    expect(Math.abs(damageArcDeg(p, { x: 0, z: 5 }))).toBeCloseTo(180, 6);
    expect(damageArcDeg({ x: 0, z: 0, yaw: Math.PI / 2 }, { x: 5, z: 0 })).toBeCloseTo(0, 6);
  });

  it("slides doors sideways: y never changes", () => {
    expect(doorOffset(1, true, 3)).toEqual([3 * 0.94, 0]);
    expect(doorOffset(0.5, false, 3)).toEqual([0, 1.41]);
    expect(doorOffset(0, true, 3)).toEqual([0, 0]);
  });
});
