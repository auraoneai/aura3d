/**
 * IRON CROWN floor detail maps (GU47 WP-15 IC47-M1): four CC0 sets from the repo's ambientCG archives, each file
 * matching its recorded sha256, bound on the plank courses of the four hero floors only (draw delta 0).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { FLOOR_DETAIL, floorDetailFields, floorTextures } from "../../../apps/showcase-iron-crown/src/game/surfaces";
import { STAGE_MAP } from "../../../apps/showcase-iron-crown/src/game/stages";

const TEX_DIR = path.resolve(__dirname, "../../../apps/showcase-iron-crown/src/assets/textures");
const provenance = readFileSync(path.join(TEX_DIR, "PROVENANCE.md"), "utf8");

describe("IRON CROWN floor detail maps (IC47-M1)", () => {
  it("ships every map with its recorded sha256 and size, CC0 from a repo archive", () => {
    for (const ref of Object.values(floorTextures)) {
      const file = path.join(TEX_DIR, path.basename(ref.url));
      const bytes = readFileSync(file);
      const sha = createHash("sha256").update(bytes).digest("hex");
      expect((ref as { sha256?: string }).sha256).toBe(sha);
      expect(bytes.length).toBe((ref as { sizeBytes?: number }).sizeBytes);
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(provenance).toContain(sha);
      expect((ref as { metadata?: { license?: string } }).metadata?.license).toBe("CC0-1.0");
    }
  });

  it("binds the maps on the plank courses of the four hero floors only", () => {
    expect(Object.keys(FLOOR_DETAIL).sort()).toEqual(["colosseum-ruins", "crown-arena", "himalayan-monastery", "neo-tokyo-rooftop"]);
    expect(STAGE_MAP.size).toBe(6);
    for (const [id, stage] of STAGE_MAP) {
      const planks = (stage.dressing as (AuraSceneNode & { material?: { normal?: unknown; roughnessMap?: unknown } })[]).filter((n) =>
        /floor-planks-[ab]$/.test(n.name ?? "")
      );
      expect(planks, id).toHaveLength(2);
      for (const p of planks) {
        expect(Boolean(p.material?.normal), `${id} ${p.name}`).toBe(id in FLOOR_DETAIL);
        expect(Boolean(p.material?.roughnessMap), `${id} ${p.name}`).toBe(id in FLOOR_DETAIL);
      }
    }
    expect(floorDetailFields("crown-arena", false)).toEqual({});
    expect(floorDetailFields("bangkok-dock")).toEqual({});
  });
});
