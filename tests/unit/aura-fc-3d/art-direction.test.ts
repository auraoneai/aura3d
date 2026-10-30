import { describe, expect, it } from "vitest";
import direction from "../../../apps/showcase-aura-fc-3d/art/direction";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { buildFcScene } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { VENUE_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";
import type { VenueId } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/**
 * GU47 WP-19 look contract (lane g09): the art direction is audited against the authored scene of every venue
 * (snapshotForAudit on the scene graph: lights, environment, models, materials), and the Munich record (the default
 * venue) is written to apps/showcase-aura-fc-3d/art/direction.audit.json for the `art-direction` and `look-identity`
 * game-checks (docs/prds/game-upgrades-47/lanes/ei.md). Draw calls are a phase-2 measurement (0 here: no renderer).
 */
function venueSnapshot(venue: VenueId): ArtDirectionSnapshot {
  const nodes = (buildFcScene(venue).toJSON() as unknown as { nodes: unknown[] }).nodes;
  return snapshotForAudit({ scene: { nodes } } as never, { assets: {} });
}

describe("aura-fc-3d art direction (GU47 look contract)", () => {
  it("every venue's authored scene passes auditArtDirection", () => {
    for (const venue of VENUE_ORDER) {
      const violations = auditArtDirection(direction, venueSnapshot(venue));
      expect({ venue, violations }).toEqual({ venue, violations: [] });
    }
  });

  it("writes the Munich audit record (art/direction.audit.json)", () => {
    const snapshot = venueSnapshot("munich");
    const violations = auditArtDirection(direction, snapshot);
    const record = writeArtDirectionAudit("apps/showcase-aura-fc-3d/art/direction.ts", { direction, snapshot, violations });
    expect(record.violations).toEqual([]);
    expect(record.signatureEffect).toMatch(/floodlight shafts/);
    // the primary environment is the night venues' sky colour plus a lights-only IBL, never a drawn HDRI
    expect(record.environment).toMatchObject({ background: "sky" });
  });

  it("night venues mount exactly one shadowed light, the main-stand flood spot", () => {
    for (const venue of ["munich", "kyoto", "favela", "glacier"] as const) {
      const shadowed = venueSnapshot(venue).lights.filter((light) => light.shadow);
      expect({ venue, shadowed: shadowed.map((l) => l.type) }).toEqual({ venue, shadowed: ["spot"] });
    }
    for (const venue of ["lagos", "uyuni"] as const) {
      const shadowed = venueSnapshot(venue).lights.filter((light) => light.shadow);
      expect({ venue, shadowed: shadowed.map((l) => l.type) }).toEqual({ venue, shadowed: ["directional"] });
    }
  });

  it("no ambient light and every venue has an environment", () => {
    for (const venue of VENUE_ORDER) {
      const snap = venueSnapshot(venue);
      expect(snap.hasAmbient).toBe(false);
      expect(snap.environment.kind).not.toBe("none");
    }
  });
});
