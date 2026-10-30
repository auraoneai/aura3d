import { describe, expect, it } from "vitest";
import { auditArtDirection, snapshotForAudit } from "@aura3d/game/art";
import type { AuraApp } from "@aura3d/engine";
import direction from "../../../examples/strange-orbit-port/art/direction";
import { LOOKS, SECTORS, lookFromSearch, sectorAt } from "../../../examples/strange-orbit-port/art/look";
import { ORBIT_VFX_PRESETS, orbitVfxFor, registerOrbitVfx } from "../../../examples/strange-orbit-port/art/vfx";
import { buildWorld } from "../../../examples/strange-orbit-port/world";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** GU47 WP-25 (lane g15): the art direction audits clean against the authored gouache scene (E-I compliance recipe). */
describe("strange-orbit-port art direction", () => {
  it("audits clean on the authored scene and writes the audit record", () => {
    const world = buildWorld({ vehicle: "bike", rider: 0, quality: "high" });
    const snapshot = snapshotForAudit({ scene: world.scene.toJSON() } as unknown as AuraApp, { assets: {} });
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/strange-orbit-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("keeps one row per variant, ?look=original selecting today's look", () => {
    expect(Object.keys(LOOKS).sort()).toEqual(["gouache", "original"]);
    expect(lookFromSearch("?look=original")).toBe("original");
    expect(lookFromSearch("")).toBe("gouache");
    expect(LOOKS.gouache.key.elevationDeg).toBe(18);
    expect(LOOKS.gouache.key.cascades).toBe(3);
    expect(LOOKS.gouache.key.filter).toBe("pcss");
  });

  it("maps PALETTE_STOPS to the four painted sectors", () => {
    expect(sectorAt(100)).toBe("warm");
    expect(sectorAt(450)).toBe("violet");
    expect(sectorAt(1190)).toBe("jade");
    expect(sectorAt(1220)).toBe("opal");
    expect(Object.keys(SECTORS).sort()).toEqual(["jade", "opal", "violet", "warm"]);
  });

  it("registers a preset per race event, halving emission under reduced motion", () => {
    const names: string[] = [];
    registerOrbitVfx({ registerPreset: (kind) => { names.push(kind); } });
    expect(names).toEqual(ORBIT_VFX_PRESETS.map((p) => p.name));
    for (const event of ["land", "hit", "dust", "gate", "sling"]) {
      const full = orbitVfxFor(event)!;
      const reduced = orbitVfxFor(event, true)!;
      expect(full.kind).toMatch(/^craterline-/);
      expect(reduced.count).toBeLessThanOrEqual(Math.ceil(full.count / 2));
    }
    expect(orbitVfxFor("tick")).toBeNull();
  });
});
