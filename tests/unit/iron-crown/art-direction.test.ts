/**
 * IRON CROWN art direction (GU47 WP-15, PRD §3.2 item 1; E-I compliance recipe in docs/prds/game-upgrades-47/lanes/ei.md).
 *
 * Mounts every venue's authored scene without the DOM (game/arena.ts), snapshots it with `snapshotForAudit` and audits
 * it against art/direction.ts. The boot venue's record is written beside direction.ts as art/direction.audit.json for
 * the `art-direction` game-check; every venue must audit clean (one shadowed key, environment fill only, at most four
 * practicals, every mounted model in the contract, no emissive fill).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assetManifestLike, auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import type { AuraSceneNode } from "@aura3d/engine";
import direction from "../../../apps/showcase-iron-crown/src/art/direction";
import { buildArenaScene } from "../../../apps/showcase-iron-crown/src/game/arena";
import { DEFAULT_STAGE, STAGES, type IronStage } from "../../../apps/showcase-iron-crown/src/game/stages";
import { fighterById, resolveTypedFighterAssets } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { stageLook } from "../../../apps/showcase-iron-crown/src/game/look";
import { IRON_CROWN_VFX_KINDS } from "../../../apps/showcase-iron-crown/src/game/vfx";
import { assets } from "../../../apps/showcase-iron-crown/src/aura-assets";
import { stageAssets } from "../../../apps/showcase-iron-crown/src/game/stage-assets";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const APP = "apps/showcase-iron-crown";
const DIRECTION_FILE = `${APP}/src/art/direction.ts`;

const { typedFighterAssets } = resolveTypedFighterAssets(assets);
const appManifest = JSON.parse(readFileSync(path.resolve(APP, "aura.assets.json"), "utf8")) as { assets: Record<string, unknown>[] };
// The stage props live in the app's slice of the shared catalogue (game/stage-assets.ts); the fighters and the crown in
// the app manifest. Both feed the snapshot's model metadata.
const manifest = assetManifestLike({
  assets: [...appManifest.assets, ...Object.entries(stageAssets).map(([id, ref]) => ({ ...(ref as object), id }))]
});

function venueScene(stage: IronStage): readonly AuraSceneNode[] {
  return buildArenaScene({
    stage,
    p1: fighterById("kenji"),
    cpu: fighterById("volt"),
    typedFighterAssets,
    playerStart: [-2.2, 0, 0],
    rivalStart: [2.2, 0, 0],
    contactShadows: true,
    reducedMotion: false
  }).toJSON().nodes;
}

function venueSnapshot(stage: IronStage): ArtDirectionSnapshot {
  return snapshotForAudit({ scene: { nodes: venueScene(stage) } } as unknown as Parameters<typeof snapshotForAudit>[0], manifest);
}

describe("iron-crown art direction (GU47 WP-15)", () => {
  it("defines the Royal Forge identity: core palette, enclosed warm_bar boot venue, one shadowed spot key", () => {
    expect(direction.id).toBe("showcase-iron-crown");
    expect(direction.genre).toBe("fighting");
    expect(direction.palette.primary).toEqual(["#0e0b0d", "#d9a441", "#9e1b22"]);
    expect(direction.lighting.key).toMatchObject({ type: "spot", shadow: true });
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.environment).toEqual({ hdri: "warm_bar", background: "enclosed" });
    expect(direction.signatureEffect).toMatch(/follow-spot/);
    expect(direction.signatureEffect).toMatch(/letterbox/);
  });

  it("lists a VFX entry for every preset of the pack", () => {
    const kinds = new Set(direction.vfx.map((entry) => entry.kind));
    for (const kind of IRON_CROWN_VFX_KINDS) expect(kinds.has(kind), kind).toBe(true);
  });

  for (const stage of STAGES) {
    it(`${stage.id}: the mounted venue audits clean against the art direction`, () => {
      const snapshot = venueSnapshot(stage);
      const violations = auditArtDirection(direction, snapshot);
      expect(violations).toEqual([]);
      expect(snapshot.hasAmbient).toBe(false);
      expect(snapshot.environment.kind).not.toBe("none");
      expect(snapshot.lights.filter((light) => light.shadow)).toHaveLength(1);
      // The shadowed key is the follow-spot on the Crown, the look's sun elsewhere.
      const key = snapshot.lights.find((light) => light.shadow);
      expect(key?.type).toBe(stageLook(stage.id).key.kind === "follow-spot" ? "spot" : "directional");
    });
  }

  it("writes the boot venue's audit record for the art-direction game-check", () => {
    const boot = STAGES.find((stage) => stage.id === DEFAULT_STAGE);
    expect(boot).toBeDefined();
    const snapshot = venueSnapshot(boot!);
    const violations = auditArtDirection(direction, snapshot);
    const record = writeArtDirectionAudit(DIRECTION_FILE, { direction, snapshot, violations });
    expect(record.violations).toEqual([]);
    expect(record.environment).toEqual({ hdri: "warm_bar", background: "enclosed" });
    expect(record.signatureEffect).toBe(direction.signatureEffect);
  });
});
