// GU47 WP-16 (G06): the C-35 art direction, validated with defineArtDirection and audited with
// auditArtDirection on every world's authored diorama scene. Writes art/direction.audit.json
// (E-I recipe, docs/prds/game-upgrades-47/lanes/ei.md); commit it with art/direction.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import { assetManifestLike, auditArtDirection, defineArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-pips-big-leap/art/direction";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const DIRECTION_FILE = "apps/showcase-pips-big-leap/art/direction.ts";

function manifest() {
  const read = (p: string) => JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8")) as { assets: unknown[] };
  return assetManifestLike({ assets: [...read("aura.assets.json").assets, ...read("apps/showcase-pips-big-leap/aura.assets.json").assets] });
}

function snapshotOf(id: (typeof WORLD_IDS)[number]): ArtDirectionSnapshot {
  const scene = buildWorld(worldSpec(id)).scene.toJSON();
  return snapshotForAudit({ scene } as unknown as AuraApp, manifest());
}

describe("pips-big-leap art direction (PRD 3.2)", () => {
  it("passes defineArtDirection", () => {
    expect(defineArtDirection(direction)).toBe(direction);
  });

  it("states the identity: moss, toadstool red, birch cream; sun-seed gold reserved; a unique miniature-lens signature", () => {
    expect(direction.palette.primary).toEqual(["#4f7a3a", "#c8432f", "#efe3c8"]);
    expect(direction.palette.reservedObjective).toBe("#ffc23d");
    expect(direction.signatureEffect).toMatch(/miniature lens/i);
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.environment.background).toBe("enclosed");
  });

  it("audits clean on every world's diorama scene and writes the audit record", () => {
    const snapshots: Record<string, ArtDirectionSnapshot> = {};
    const violations: { readonly world: string; readonly rule: string; readonly message: string }[] = [];
    for (const id of WORLD_IDS) {
      const snapshot = snapshotOf(id);
      snapshots[id] = snapshot;
      expect(snapshot.environment.kind, id).toBe("hdri");
      expect(snapshot.lights.filter((l) => l.shadow), id).toHaveLength(1);
      for (const v of auditArtDirection(direction, snapshot)) violations.push({ world: id, rule: v.rule, message: v.message });
    }
    writeArtDirectionAudit(DIRECTION_FILE, { direction, snapshot: { worlds: snapshots }, violations });
    expect(violations).toEqual([]);
  });
});
