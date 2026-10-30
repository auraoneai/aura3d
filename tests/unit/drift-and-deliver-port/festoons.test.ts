import { describe, expect, it } from "vitest";
import { buildBlocks } from "../../../examples/drift-and-deliver-port/world";
import { SIDEWALK_MID, buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { FESTOON, festoonBulbs, festoonIntensity } from "../../../examples/drift-and-deliver-port/festoons";
import { DRIZZLE, drizzleAt, drizzleSpawn } from "../../../examples/drift-and-deliver-port/fx";
import { phaseAt } from "../../../examples/drift-and-deliver-port/phases";

describe("gridlock courier festoons (GU47 WP-28 GC-V3)", () => {
  const lamps = buildFurniture(buildBlocks()).lamps;
  const bulbs = festoonBulbs(lamps, SIDEWALK_MID);

  it("strings about 600 bulbs, harbour side first, between facing lamps", () => {
    expect(bulbs.length).toBeGreaterThanOrEqual(500);
    expect(bulbs.length).toBeLessThanOrEqual(FESTOON.bulbs);
    expect(bulbs.length % FESTOON.perString).toBe(0);
    const maxLampZ = Math.max(...lamps.map((l) => l.z));
    expect(bulbs[0]!.z).toBeGreaterThan(maxLampZ - 2 * SIDEWALK_MID - 1);
  });

  it("sags below the lamp heads and stays above the traffic", () => {
    for (const b of bulbs) {
      expect(b.y).toBeGreaterThan(4.2);
      expect(b.y).toBeLessThan(5.1);
    }
  });

  it("is dim by day and lit from sunset, quantised", () => {
    expect(festoonIntensity(phaseAt(10).festoon)).toBeCloseTo(0.3, 6);
    expect(festoonIntensity(phaseAt(170).festoon)).toBeGreaterThan(2.4);
    expect(festoonIntensity(0.5001)).toBe(festoonIntensity(0.5003));
  });
});

describe("gridlock courier intro drizzle (GU47 WP-28 GC-V3)", () => {
  it("falls from the start and stops at 0:20", () => {
    expect(drizzleAt(0)).toBe(1);
    expect(drizzleAt(DRIZZLE.until - DRIZZLE.fade / 2)).toBeCloseTo(0.5, 6);
    expect(drizzleAt(DRIZZLE.until)).toBe(0);
    expect(drizzleAt(90)).toBe(0);
  });
  it("spawns deterministically above the road ahead of the car", () => {
    const a = drizzleSpawn({ x: 0, z: 0, heading: 0 }, 5);
    expect(drizzleSpawn({ x: 0, z: 0, heading: 0 }, 5)).toEqual(a);
    expect(a[1]).toBe(DRIZZLE.top);
    expect(a[2]).toBeGreaterThan(3);
  });
});
