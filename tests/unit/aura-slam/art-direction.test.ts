/**
 * GU47 TT-H3: the Aura Slam art direction passes `defineArtDirection` and `auditArtDirection` against the authored World
 * Tour scene, and the audit record the `art-direction` game-check reads (`examples/aura-slam/art/direction.audit.json`)
 * is rewritten from this run (E-I compliance recipe). Every venue's scene is audited; the boot venue (hard court) is the
 * record.
 */
import { describe, expect, it } from "vitest";
import direction from "../../../examples/aura-slam/art/direction";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { buildTennisScene } from "../../../examples/aura-slam/view/scene";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { VENUE_LOOK_ORDER, VENUE_LOOKS } from "../../../examples/aura-slam/view/look";

/** Asset metadata the audit reads (triangle counts are measured in phase 2; 0 = not judged). */
const MANIFEST = { assets: { showcaseStadiumSeats: { role: "set-dressing" }, rooftopScoreboardRigMeshy: { role: "prop" }, rooftopFloodlightTowerMeshy: { role: "prop" } } };

function snapshotFor(venue: string): ArtDirectionSnapshot {
  const nodes = (buildTennisScene(createPoseRig(), { venue }).toJSON() as unknown as { nodes: unknown[] }).nodes;
  const app = { scene: { nodes }, diagnostics: () => ({ drawCalls: 0 }) };
  return snapshotForAudit(app as never, MANIFEST);
}

describe("GU47 TT-H3: Aura Slam art direction", () => {
  it("is a valid C-35 art direction with a one-shadowed-key IBL lighting design", () => {
    expect(direction.id).toBe("showcase-top-tennis");
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.key.shadow).toBe(true);
    expect(direction.lighting.environment).toEqual({ hdri: "cobblestone_street_night", background: "hdri" });
    expect(direction.palette.primary.length).toBeGreaterThanOrEqual(3);
    expect(direction.references.length).toBeGreaterThanOrEqual(3);
    expect(direction.signatureEffect).toMatch(/ball marks/);
    expect(direction.signatureEffect).toMatch(/crowd/);
  });

  it("names the boot venue's HDRI as the primary visible environment", () => {
    expect(direction.lighting.environment.hdri).toBe(VENUE_LOOKS.hard.hdri);
  });

  for (const venue of VENUE_LOOK_ORDER) {
    it(`auditArtDirection reports no violation on the ${venue} scene`, () => {
      const snapshot = snapshotFor(venue);
      expect(snapshot.hasAmbient).toBe(false);
      expect(snapshot.environment.kind).toBe("hdri");
      expect(auditArtDirection(direction, snapshot)).toEqual([]);
    });
  }

  it("writes the audit record for the boot venue (hard court) beside art/direction.ts", () => {
    const snapshot = snapshotFor("hard");
    const violations = auditArtDirection(direction, snapshot);
    const record = writeArtDirectionAudit("examples/aura-slam/art/direction.ts", { direction, snapshot, violations });
    expect(record.violations).toEqual([]);
    expect(record.signatureEffect).toBe(direction.signatureEffect);
    expect(violations).toEqual([]);
  });
});
