/**
 * Thermal Drift art direction (GU47 WP-13 look contract): `defineArtDirection` accepts it, `auditArtDirection` finds no
 * violation on the authored scene of every circuit, and the audit record the `art-direction` game-check reads is
 * written beside `art/direction.ts` (recipe: docs/prds/game-upgrades-47/lanes/ei.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assetManifestLike, auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-heatsink/art/direction";
import { buildThermalDriftScene } from "../../../apps/showcase-heatsink/src/scene";
import { CIRCUIT_ORDER, CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const manifest = assetManifestLike(JSON.parse(readFileSync("aura.assets.json", "utf8")));

function snapshotOf(circuit: (typeof CIRCUIT_ORDER)[number]): ArtDirectionSnapshot {
  const nodes = (buildThermalDriftScene({ circuit: CIRCUITS[circuit] }).toJSON() as unknown as { nodes: unknown[] }).nodes;
  return snapshotForAudit({ scene: { nodes } } as unknown as Parameters<typeof snapshotForAudit>[0], manifest);
}

describe("heatsink art direction", () => {
  it("names the foundry identity: palette, signature effect, primary HDRI", () => {
    expect(direction.id).toBe("showcase-heatsink");
    expect(direction.genre).toBe("racing");
    expect(direction.palette.primary).toEqual(["#14110f", "#3a2a22", "#ff8a1f", "#d2361c"]);
    expect(direction.palette.accent).toBe("#35d6ff");
    expect(direction.signatureEffect).toMatch(/heat haze/i);
    expect(direction.lighting.environment).toEqual({ hdri: "rooftop_night", background: "hdri" });
    expect(direction.lighting.fill).not.toBe("ambient");
  });

  it("lists every mounted model asset in the contract", () => {
    const keys = new Set(direction.assets.map((a) => a.assetKey));
    for (const circuit of CIRCUIT_ORDER) {
      for (const model of snapshotOf(circuit).models) expect(keys.has(model.assetKey), `${circuit}: ${model.assetKey}`).toBe(true);
    }
  });

  it("audits clean on every circuit and writes the art-direction record (default circuit)", () => {
    for (const circuit of CIRCUIT_ORDER) {
      expect(auditArtDirection(direction, snapshotOf(circuit)), circuit).toEqual([]);
    }
    const snapshot = snapshotOf("grand");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-heatsink/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });
});
