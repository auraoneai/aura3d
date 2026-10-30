/**
 * IRON CROWN flares and K.O. scorch (GU47 WP-15 IC47-V3): flares only where the key can sit in frame (the Crown's
 * follow-spot rig, the low Dock and Airstrip suns), none on Low; one parked scorch decal per venue with the typed
 * texture, landing on the floor under the loser.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../apps/showcase-iron-crown/src/aura-assets";
import {
  KO_SCORCH_ID,
  koScorchNode,
  SCORCH,
  SCORCH_PARKED,
  scorchAt,
  stageFlareNodes,
  sunFlarePosition
} from "../../../apps/showcase-iron-crown/src/game/flareScorch";
import { STAGE_LOOKS, STAGE_ORDER } from "../../../apps/showcase-iron-crown/src/game/look";

describe("IRON CROWN flares (IC47-V3)", () => {
  it("flares the Crown follow-spot and the two low suns only, and none on Low", () => {
    const flared = STAGE_ORDER.filter((id) => stageFlareNodes(STAGE_LOOKS[id]).length > 0).sort();
    expect(flared).toEqual(["bangkok-dock", "crown-arena", "desert-airbase"]);
    for (const id of STAGE_ORDER) expect(stageFlareNodes(STAGE_LOOKS[id], true)).toEqual([]);
    for (const id of flared) {
      const [node] = stageFlareNodes(STAGE_LOOKS[id]) as (AuraSceneNode & { occlusion?: string })[];
      expect(node!.kind).toBe("lensflare");
    }
  });

  it("places the sun flare on the look's sun direction", () => {
    const [x, y, z] = sunFlarePosition(10, 255, 60);
    expect(Math.hypot(x, y, z)).toBeCloseTo(60, 6);
    expect(y).toBeCloseTo(60 * Math.sin((10 * Math.PI) / 180), 6);
    expect(x).toBeLessThan(0);
    expect(z).toBeLessThan(0);
  });
});

describe("IRON CROWN K.O. scorch (IC47-V3)", () => {
  it("is one parked decal with the typed scorch texture and a runtime id", () => {
    const node = koScorchNode() as AuraSceneNode & { runtime?: { id?: string }; position?: number[]; material?: { texture?: { url?: string } } };
    expect(node.runtime?.id).toBe(KO_SCORCH_ID);
    expect(node.position).toEqual([...SCORCH_PARKED]);
    expect(node.material?.texture?.url).toBe(assets.ironcrownKoScorch.url);
    const file = path.resolve(__dirname, "../../../apps/showcase-iron-crown/public", assets.ironcrownKoScorch.url.replace(/^\//, ""));
    expect(readFileSync(file).subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("lands under the loser on the floor plane", () => {
    expect(scorchAt([1.3, 0.4, -0.2])).toEqual([1.3, SCORCH.lift, -0.2]);
  });
});
