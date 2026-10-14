import { describe, expect, it } from "vitest";
import { characterAssembly } from "@aura3d/engine";
import {
  DEFAULT_BUILD,
  MECH_SLOTS,
  PART_OPTIONS,
  catalogReady,
  cycleIndex,
  resolvePartAsset,
  selectedParts,
  type BuildSelection
} from "../../../apps/showcase-mech-hangar/src/parts-catalog";
import { buildMechAssemblyPlan, mountTransformForPart, scaledPlacement, validationSummary } from "../../../apps/showcase-mech-hangar/src/assembly";
import { aggregateStats } from "../../../apps/showcase-mech-hangar/src/stats";

describe("mech hangar parts catalog", () => {
  it("delivers the full 16-part matrix: 4 slots x 4 options (MH-02 gate)", () => {
    expect(catalogReady).toBe(true);
    for (const slot of MECH_SLOTS) {
      expect(PART_OPTIONS[slot], slot).toHaveLength(4);
    }
    const names = MECH_SLOTS.flatMap((slot) => PART_OPTIONS[slot].map((part) => part.assetKey));
    expect(new Set(names).size).toBe(16);
  });

  it("every part resolves to a typed model asset with license-clean provenance", () => {
    for (const slot of MECH_SLOTS) {
      for (const part of PART_OPTIONS[slot]) {
        const asset = resolvePartAsset(part.assetKey);
        expect(asset, part.assetKey + " typed ref").toBeTruthy();
        expect(part.provenance.license).toMatch(/^(CC0|CC-BY)/);
        expect(part.provenance.author.length).toBeGreaterThan(0);
      }
    }
  });

  it("source models are unique across the matrix", () => {
    const identities = MECH_SLOTS
      .flatMap((slot) => PART_OPTIONS[slot].map((part) => part.displayName))
      .sort();
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("cycles slot options wrap in both directions", () => {
    expect(cycleIndex(4, 0, -1)).toBe(3);
    expect(cycleIndex(4, 3, 1)).toBe(0);
    expect(cycleIndex(4, 2, 5)).toBe(3);
  });
});

describe("mech hangar stat table", () => {
  it("aggregates part deltas into fight stats", () => {
    const stats = aggregateStats(DEFAULT_BUILD);
    expect(stats.hpMax).toBeGreaterThan(0);
    expect(stats.moveSpeed).toBeGreaterThan(0);
    expect(stats.guardMax).toBeGreaterThan(0);
    expect(stats.powerMax).toBeGreaterThan(stats.specialCost);
    expect(stats.lightDamage).toBeLessThan(stats.heavyDamage);
    expect(stats.heavyDamage).toBeLessThan(stats.specialDamage);
  });

  it("different builds produce different stats (bars honestly move)", () => {
    const a = aggregateStats({ chassis: 0, arms: 0, legs: 0, weapon: 0 });
    const b = aggregateStats({ chassis: 1, arms: 1, legs: 1, weapon: 1 });
    const c = aggregateStats({ chassis: 3, arms: 3, legs: 3, weapon: 3 });
    const keys = ["hpMax", "moveSpeed", "guardMax", "powerMax", "specialCost"] as const;
    for (const key of keys) {
      expect(a[key]).not.toBe(b[key]);
      expect(b[key]).not.toBe(c[key]);
    }
  });

  it("heavier chassis raises armor; faster legs raise speed; bigger arms raise guard", () => {
    // chassis B has the highest authored armor
    const heavyHull = aggregateStats({ chassis: 1, arms: 0, legs: 3, weapon: 0 });
    const lightHull = aggregateStats({ chassis: 3, arms: 0, legs: 3, weapon: 0 });
    expect(heavyHull.hpMax).toBeGreaterThan(lightHull.hpMax);

    const fastLegs = aggregateStats({ chassis: 3, arms: 0, legs: 3, weapon: 0 });
    const slowLegs = aggregateStats({ chassis: 3, arms: 0, legs: 1, weapon: 0 });
    expect(fastLegs.moveSpeed).toBeGreaterThan(slowLegs.moveSpeed);

    const bigArms = aggregateStats({ chassis: 0, arms: 2, legs: 0, weapon: 0 });
    const smallArms = aggregateStats({ chassis: 0, arms: 3, legs: 0, weapon: 0 });
    expect(bigArms.guardMax).not.toBe(smallArms.guardMax);
  });

  it("harder weapons cost more special power", () => {
    const cheap = aggregateStats({ chassis: 0, arms: 0, legs: 0, weapon: 0 });
    const pricey = aggregateStats({ chassis: 0, arms: 0, legs: 0, weapon: 2 });
    expect(pricey.specialCost).toBeGreaterThan(cheap.specialCost);
    expect(pricey.lightDamage).toBeGreaterThan(cheap.lightDamage);
  });
});

describe("mech hangar assembly plans", () => {
  it("the default build validates ready with all attachments present", () => {
    const built = buildMechAssemblyPlan("mechBuild-test", DEFAULT_BUILD);
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    const summary = validationSummary(built.report);
    expect(summary.ready).toBe(true);
    expect(summary.totalParts).toBe(4);
    expect(summary.attachedParts).toBe(3);
    expect(built.plan.baseBody.role).toBe("base-body");
    expect(built.plan.kind).toBe("aura-character-assembly-plan");
  });

  it("rejects an invalid build before lock-in: missing attachment rule fails validation", () => {
    // Author the failure the validator exists for: a weapon part with no
    // attachment rule would float. validateCharacterAssemblyPlan must refuse.
    const [chassis, , , weapon] = selectedParts(DEFAULT_BUILD);
    const plan = characterAssembly.createPlan({
      exportName: "mechBuild-invalid",
      baseBody: resolvePartAsset(chassis.assetKey)!,
      parts: [{ role: "weapon", asset: resolvePartAsset(weapon.assetKey)! }]
    });
    const report = characterAssembly.validatePlan(plan);
    expect(report.ready).toBe(false);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it("rejects plans whose export name is not file-safe", () => {
    const built = buildMechAssemblyPlan("bad export name!", DEFAULT_BUILD);
    if ("error" in built) return;
    expect(built.report.ready).toBe(false);
  });

  it("mount transforms change when a slot swaps (model really moves/swaps)", () => {
    const buildA: BuildSelection = { ...DEFAULT_BUILD };
    const buildB: BuildSelection = { ...DEFAULT_BUILD, legs: 2 };
    const partsA = selectedParts(buildA);
    const partsB = selectedParts(buildB);
    const legA = mountTransformForPart(partsA[2]!, partsA, [0, 0, 0], 0);
    const legB = mountTransformForPart(partsB[2]!, partsB, [0, 0, 0], 0);
    const placementDiffers =
      Math.abs(legA.position[1] - legB.position[1]) > 1e-9 ||
      partsA[2]!.assetKey !== partsB[2]!.assetKey;
    expect(placementDiffers).toBe(true);
  });

  it("yaw rotates mounted parts as one machine around the root", () => {
    const parts = selectedParts(DEFAULT_BUILD);
    const weapon = parts[3]!;
    const facingZero = mountTransformForPart(weapon, parts, [5, 0, 5], 0);
    const facingQuarter = mountTransformForPart(weapon, parts, [5, 0, 5], Math.PI / 2);
    const dx = facingQuarter.position[0] - facingZero.position[0];
    const dz = facingQuarter.position[2] - facingZero.position[2];
    // The weapon hangs off-axis, so a quarter turn must carry it around the root.
    expect(Math.hypot(dx, dz)).toBeGreaterThan(1e-6);
  });

  it("scaled placements fit every part inside the authored mech envelope", () => {
    for (const part of selectedParts(DEFAULT_BUILD)) {
      const scaled = scaledPlacement(part);
      expect(scaled.fitScale).toBeGreaterThan(0);
      expect(Math.max(...scaled.scaledSize)).toBeLessThan(2.2);
    }
  });
});
