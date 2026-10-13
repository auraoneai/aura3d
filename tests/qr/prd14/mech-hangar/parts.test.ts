// tests/qr/prd14/mech-hangar/parts.test.ts — single-path successor to the
// retired v2-shell.test.ts: the rebuilt route has no src/v2 shell, so the
// per-route contract is the fresh parts catalog plus the art direction
// framing/lighting bands the one src/main.ts scene is authored against.
import { describe, expect, it } from "vitest";
import direction from "../../../../apps/showcase-mech-hangar/art/direction";
import { assets } from "../../../../apps/showcase-mech-hangar/src/aura-assets";
import {
  aggregateStats,
  DUMMY_POSITIONS,
  MECH_SLOTS,
  PART_OPTIONS,
  ratingFor
} from "../../../../apps/showcase-mech-hangar/src/parts";

describe("mech-hangar art direction contract", () => {
  it("declares the fighting rig with a 45-55 fov band the scene camera sits in", () => {
    expect(direction.framing.rig).toBe("fighting");
    expect(direction.framing.fovDeg[0]).toBeLessThanOrEqual(50);
    expect(direction.framing.fovDeg[1]).toBeGreaterThanOrEqual(50);
  });

  it("keeps a shadowed 6500K key, ibl fill and 3 practicals", () => {
    expect(direction.lighting.key).toEqual({ type: "directional", colorTemperatureK: 6500, shadow: true });
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.practicals).toBe(3);
  });

  it("names only admitted typed assets as roles and tracks no stand-ins", () => {
    const typed = assets as Readonly<Record<string, unknown>>;
    for (const role of direction.assets) {
      expect(typed[role.assetKey], role.assetKey).toBeTruthy();
    }
    expect(direction.standIns).toEqual([]);
  });
});

describe("mech-hangar fresh parts catalog", () => {
  it("offers three rigged chassis and an optional support drone", () => {
    expect(MECH_SLOTS).toEqual(["chassis", "support"]);
    expect(PART_OPTIONS.chassis).toHaveLength(3);
    expect(PART_OPTIONS.support.map((part) => part.id)).toEqual(["none", "gun-drone"]);
    for (const part of PART_OPTIONS.chassis) expect(part.clips).not.toBeNull();
  });

  it("changes move speed and strike damage when parts change", () => {
    const balanced = aggregateStats({ chassis: 0, support: 0 });
    const heavyWithDrone = aggregateStats({ chassis: 1, support: 1 });
    expect(heavyWithDrone.strikeDamage).toBeGreaterThan(balanced.strikeDamage);
    expect(heavyWithDrone.moveSpeed).toBeLessThan(balanced.moveSpeed);
  });

  it("defines the test-drive checklist targets and rating bands", () => {
    expect(DUMMY_POSITIONS).toHaveLength(3);
    expect(ratingFor(20)).toBe("S");
    expect(ratingFor(35)).toBe("A");
    expect(ratingFor(36)).toBe("B");
  });
});
