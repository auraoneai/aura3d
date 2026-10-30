import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import { auditArtDirection, defineArtDirection, GAME_GENRES, snapshotForAudit } from "@aura3d/game/art";
import direction from "../../../apps/showcase-dot-dash-3d/src/art/direction";
import { buildScene } from "../../../apps/showcase-dot-dash-3d/src/game/world";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * GU47 look contract (PRD §3.2, recipe in docs/prds/game-upgrades-47/lanes/ei.md): the art direction validates, the
 * authored scene passes auditArtDirection, and the audit record the `art-direction` game-check reads is rewritten.
 */
describe("dot-dash-3d art direction (WP-23)", () => {
  it("is a valid maze-arcade direction with a desk-lamp spot key and IBL fill", () => {
    expect(() => defineArtDirection(direction)).not.toThrow();
    expect(GAME_GENRES).toContain(direction.genre);
    expect(direction.genre).toBe("maze-arcade");
    expect(direction.lighting.key.type).toBe("spot");
    expect(direction.lighting.fill).not.toBe("ambient");
    expect(direction.lighting.environment).toEqual({ hdri: "indoor-workshop", background: "enclosed" });
    expect(direction.palette.primary).toEqual(["#1f4a38", "#c8743a", "#c9ced6"]);
    expect(direction.palette.accent).toBe("#5ff3ff");
  });

  it("passes auditArtDirection on the authored scene and writes art/direction.audit.json", () => {
    const scene = buildScene() as AuraApp["scene"];
    const snapshot = snapshotForAudit({ scene } as unknown as AuraApp, { assets: {} });
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-dot-dash-3d/src/art/direction.ts", { direction, snapshot, violations });
    expect(snapshot.hasAmbient).toBe(false);
    expect(snapshot.environment.kind).toBe("hdri");
    expect(snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.lights.length - 1).toBeLessThanOrEqual(direction.lighting.practicals);
    expect(violations).toEqual([]);
  });
});
