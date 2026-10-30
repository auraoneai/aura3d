import { describe, expect, it } from "vitest";
import { apexSpeedLines, apexVfxEvents, countSkyDodges, LANDING_MIN_AIR_SECONDS, type ApexVfxFrame } from "../../../apps/showcase-roadster-rush/src/render/vfxDirector";

const base: ApexVfxFrame = { mode: "playing", bolts: 0, grounded: true, airSeconds: 0, rocketActive: false, skyDodges: 0 };

describe("Apex Overdrive VFX director (GU47 AO-V1, AO-V2)", () => {
  it("fires each preset on its state transition, once", () => {
    expect(apexVfxEvents(null, base)).toEqual([]);
    expect(apexVfxEvents(base, { ...base, mode: "crashed" })).toEqual(["apex-crash"]);
    expect(apexVfxEvents(base, { ...base, bolts: 3 })).toEqual(["apex-bolt"]);
    expect(apexVfxEvents({ ...base, grounded: false, airSeconds: LANDING_MIN_AIR_SECONDS }, base)).toEqual(["apex-land"]);
    expect(apexVfxEvents({ ...base, grounded: false, airSeconds: 0.05 }, base)).toEqual([]); // a hover bob is not a landing
    expect(apexVfxEvents(base, { ...base, rocketActive: true })).toEqual(["apex-rocket"]);
    expect(apexVfxEvents({ ...base, rocketActive: true }, { ...base, rocketActive: true })).toEqual([]);
    expect(apexVfxEvents(base, { ...base, skyDodges: 1 })).toEqual(["apex-skykill"]);
    expect(apexVfxEvents({ ...base, mode: "title" }, { ...base, mode: "title", bolts: 9 })).toEqual([]);
  });

  it("asks for speed lines at >= 50 m/s, on boost and on a rocket; never under reduced motion", () => {
    expect(apexSpeedLines(40, false, false, false)).toBe(0);
    expect(apexSpeedLines(50, false, false, false)).toBeGreaterThan(0);
    expect(apexSpeedLines(64, false, false, false)).toBeCloseTo(0.6, 6);
    expect(apexSpeedLines(30, true, false, false)).toBeGreaterThanOrEqual(0.55);
    expect(apexSpeedLines(30, false, true, false)).toBeGreaterThanOrEqual(0.85);
    expect(apexSpeedLines(64, true, true, true)).toBe(0);
    for (const s of [0, 30, 50, 64, 90]) {
      const v = apexSpeedLines(s, true, true, false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("counts a sky-lane rival passing close to the player once, and forgets recycled ids", () => {
    const gaps = new Map<string, number>();
    const player = { x: 0, y: 14, z: -500 };
    expect(countSkyDodges(player, [{ id: "s1", x: 1, y: 14.5, z: -510 }], gaps)).toBe(0);
    expect(countSkyDodges(player, [{ id: "s1", x: 1, y: 14.5, z: -499 }], gaps)).toBe(1);
    expect(countSkyDodges(player, [{ id: "s1", x: 1, y: 14.5, z: -490 }], gaps)).toBe(0);
    // far lateral pass is not a dodge; ground-level player never counts
    expect(countSkyDodges(player, [{ id: "s2", x: 9, y: 14, z: -505 }], gaps)).toBe(0);
    expect(countSkyDodges(player, [{ id: "s2", x: 9, y: 14, z: -495 }], gaps)).toBe(0);
    const low = new Map<string, number>();
    countSkyDodges({ x: 0, y: 1, z: -500 }, [{ id: "s3", x: 0, y: 1, z: -505 }], low);
    expect(countSkyDodges({ x: 0, y: 1, z: -500 }, [{ id: "s3", x: 0, y: 1, z: -495 }], low)).toBe(0);
    countSkyDodges(player, [], gaps);
    expect(gaps.size).toBe(0);
  });
});
