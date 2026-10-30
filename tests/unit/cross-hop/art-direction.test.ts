// GU47 WP-24 (CH47-20): the Cross Hop art direction passes auditArtDirection on the authored diorama scene and
// writes art/direction.audit.json for the `art-direction` game-check (recipe: docs/prds/game-upgrades-47/lanes/ei.md).
import { describe, expect, it } from "vitest";
import direction from "../../../apps/showcase-cross-hop/src/art/direction";
import { auditArtDirection, assetManifestLike, snapshotForAudit } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import manifest from "../../../apps/showcase-cross-hop/aura.assets.json";
import { buildScene, setLookMode } from "../../../apps/showcase-cross-hop/src/game/core";

describe("cross-hop art direction (GU47 CH47-20)", () => {
  it("the authored diorama scene has no art-direction violations", () => {
    setLookMode("diorama");
    const authored = buildScene() as { nodes: unknown[] };
    const snapshot = snapshotForAudit({ scene: { nodes: authored.nodes } } as never, assetManifestLike(manifest));
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-cross-hop/src/art/direction.ts", { direction, snapshot, violations });
    expect(snapshot.hasAmbient).toBe(false);
    expect(snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(violations).toEqual([]);
  });

  it("the signature effect names the tilt-shift diorama and the day clock", () => {
    expect(direction.signatureEffect).toMatch(/tilt-shift diorama \+ day clock/);
    expect(direction.lighting.fill).toBe("ibl");
  });
});
