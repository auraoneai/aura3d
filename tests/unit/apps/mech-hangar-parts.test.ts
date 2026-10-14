import { describe, expect, it } from "vitest";
import { assets } from "../../../apps/showcase-mech-hangar/src/aura-assets";
import {
  aggregateStats,
  cycleIndex,
  DEFAULT_BUILD,
  DUMMY_ASSET_KEY,
  DUMMY_POSITIONS,
  MECH_SLOTS,
  PART_OPTIONS,
  partFor,
  ratingFor,
  selectedParts,
  strikesToDown
} from "../../../apps/showcase-mech-hangar/src/parts";

describe("mech hangar fresh parts catalog", () => {
  it("ships only slots backed by a real typed asset (plus the empty support option)", () => {
    expect(MECH_SLOTS).toEqual(["chassis", "support"]);
    for (const part of selectedParts(DEFAULT_BUILD)) expect(part).toBeDefined();
    for (const slot of MECH_SLOTS) {
      for (const part of PART_OPTIONS[slot]) {
        if (part.assetKey === null) {
          expect(part.id).toBe("none");
          continue;
        }
        const asset = (assets as Readonly<Record<string, { readonly url?: string }>>)[part.assetKey];
        expect(asset, `${part.assetKey} typed ref`).toBeTruthy();
        expect(asset?.url).toMatch(/^\/aura-assets\/.+\.glb$/);
      }
    }
    expect((assets as Readonly<Record<string, unknown>>)[DUMMY_ASSET_KEY]).toBeTruthy();
  });

  it("never rebinds the trashed MH-2M part family", () => {
    const keys = MECH_SLOTS.flatMap((slot) => PART_OPTIONS[slot].map((part) => part.assetKey ?? ""));
    expect(keys.some((key) => /^mech(Chassis|Arms|Legs|Weapon)/.test(key))).toBe(false);
  });

  it("attaching a different chassis changes the aggregated stats", () => {
    const base = aggregateStats(DEFAULT_BUILD);
    const heavy = aggregateStats({ chassis: 1, support: 0 });
    const light = aggregateStats({ chassis: 2, support: 0 });
    expect(heavy.power).toBeGreaterThan(base.power);
    expect(heavy.moveSpeed).toBeLessThan(base.moveSpeed);
    expect(light.moveSpeed).toBeGreaterThan(base.moveSpeed);
    expect(partFor({ chassis: 1, support: 0 }, "chassis").id).toBe("robot-large");
  });

  it("attaching the support drone raises strike damage and cuts strikes to down a dummy", () => {
    const bare = aggregateStats({ chassis: 2, support: 0 });
    const droned = aggregateStats({ chassis: 2, support: 1 });
    expect(droned.strikeDamage).toBeGreaterThan(bare.strikeDamage);
    expect(strikesToDown({ chassis: 2, support: 1 })).toBeLessThanOrEqual(strikesToDown({ chassis: 2, support: 0 }));
  });

  it("cycles indices within a slot and rates completed drives by time", () => {
    expect(cycleIndex(2, 1, 3)).toBe(0);
    expect(cycleIndex(0, -1, 3)).toBe(2);
    expect(DUMMY_POSITIONS).toHaveLength(3);
    expect(ratingFor(12)).toBe("S");
    expect(ratingFor(30)).toBe("A");
    expect(ratingFor(60)).toBe("B");
  });
});
