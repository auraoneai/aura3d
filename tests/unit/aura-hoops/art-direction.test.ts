import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { model, type AuraApp, type AuraSceneNode } from "@aura3d/engine";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-aura-hoops-3d/art/direction";
import { assets } from "../../../apps/showcase-aura-hoops-3d/src/aura-assets.route";
import {
  COURT_IDS,
  COURT_RIGS,
  courtLampNodes,
  courtLensFlareNodes,
  courtLookNodes,
  courtPracticalNodes,
  courtSkyNodes,
  courtWeatherNodes,
  type CourtId
} from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * GU47 WP-17 look contract: `auditArtDirection` on every court. The snapshot is `snapshotForAudit` over the nodes the
 * court mounts: the court rig exactly as `buildScene` adds it (look nodes, practicals, lamp heads, lens flares, sky,
 * weather) plus one model node per asset key the route's scene code references (main.ts and the src modules it builds
 * the scene from), so a new model key that is missing from the direction fails here.
 */
const ROOT = path.resolve(__dirname, "../../..");
const APP_SRC = path.join(ROOT, "apps/showcase-aura-hoops-3d/src");
const SCENE_SOURCES = ["main.ts", "courtRigs.ts", "fxPack.ts"];
const manifest = JSON.parse(readFileSync(path.join(ROOT, "aura.assets.json"), "utf8")) as unknown;

const assetTable = assets as unknown as Readonly<Record<string, { readonly type?: string }>>;

/** Model asset keys the scene code mounts (`assets.<key>` with a model entry in the route asset table). */
function mountedModelKeys(): string[] {
  const keys = new Set<string>();
  for (const file of SCENE_SOURCES) {
    let text = "";
    try { text = readFileSync(path.join(APP_SRC, file), "utf8"); } catch { continue; }
    for (const match of text.matchAll(/\bassets\.([A-Za-z0-9_]+)/g)) {
      const key = match[1]!;
      if (assetTable[key]?.type === "model") keys.add(key);
    }
  }
  return [...keys].sort();
}

const toJson = (node: { toJSON(): unknown } | AuraSceneNode): AuraSceneNode =>
  (typeof (node as { toJSON?: unknown }).toJSON === "function" ? (node as { toJSON(): unknown }).toJSON() : node) as AuraSceneNode;

function courtNodes(id: CourtId): AuraSceneNode[] {
  const rig = COURT_RIGS[id];
  return [
    ...courtLookNodes(rig).map(toJson),
    ...courtPracticalNodes(rig).map(toJson),
    ...courtLampNodes(rig).map(toJson),
    ...courtLensFlareNodes(rig).map(toJson),
    ...courtSkyNodes(rig).map(toJson),
    ...courtWeatherNodes(rig, false)
  ];
}

function courtSnapshot(id: CourtId): ArtDirectionSnapshot {
  const models = mountedModelKeys().map((key) => model((assets as unknown as Record<string, Parameters<typeof model>[0]>)[key]!, { name: `audit-${key}` }).toJSON() as AuraSceneNode);
  const app = { scene: { nodes: [...courtNodes(id), ...models] } } as unknown as AuraApp;
  return snapshotForAudit(app, manifest as Parameters<typeof snapshotForAudit>[1]);
}

describe("Aura Hoops 3D art direction (GU47 WP-17)", () => {
  it("is a valid C-35 direction with a unique spray-tag signature and the WP palette", () => {
    expect(direction.id).toBe("showcase-aura-hoops-3d");
    expect(direction.genre).toBe("basketball");
    expect(direction.palette.primary).toEqual(["#23262b", "#ffb347", "#8a9199"]);
    expect(direction.signatureEffect).toMatch(/spray-tag/i);
    expect(direction.lighting.environment).toEqual({ hdri: "belfast_sunset_puresky", background: "hdri" });
  });

  it("mounts only contracted models (every scene model key is in the direction)", () => {
    const contracted = new Set(direction.assets.map((asset) => asset.assetKey));
    const keys = mountedModelKeys();
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((key) => !contracted.has(key))).toEqual([]);
  });

  for (const id of COURT_IDS) {
    it(`audits clean on the ${id} court (one shadowed key, <= 6 practicals, IBL fill, no ambient light)`, () => {
      const snapshot = courtSnapshot(id);
      expect(snapshot.environment.kind).toBe("hdri");
      expect(snapshot.hasAmbient).toBe(false);
      expect(snapshot.lights.filter((light) => light.shadow)).toHaveLength(1);
      expect(auditArtDirection(direction, snapshot)).toEqual([]);
    });
  }

  it("writes art/direction.audit.json for the boot court (Rucker)", () => {
    const snapshot = courtSnapshot("rucker");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-aura-hoops-3d/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });
});
