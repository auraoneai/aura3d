import { describe, expect, it } from "vitest";
import {
  FederatedResolver,
  scoreAsset,
  type AuraCanonicalAsset,
  type SourceAdapter,
} from "@aura3d/asset-index";
import {
  buildSearchAdapters,
  meshOnlyAdapter,
  queryWantsNonMesh,
} from "../../../packages/aura3d-cli/src/pull-bridge/adapters.js";

function asset(partial: Partial<AuraCanonicalAsset> & { id: string; title: string }): AuraCanonicalAsset {
  return {
    source: "test",
    format: "glb",
    tags: [],
    license: "CC0-1.0",
    ...partial,
  } as unknown as AuraCanonicalAsset;
}

describe("search resilience over open sources", () => {
  it("runs only the open zero-auth sources, once each, and no hosted catalog", () => {
    const ids = buildSearchAdapters({}, process.cwd(), "chair").map((a) => a.id);
    expect(ids).not.toContain("aura-index");
    for (const open of ["animation-starter-pack", "khronos", "os3a", "poly-haven", "ambientcg", "jsdelivr-mirror"]) {
      expect(ids.filter((id) => id === open)).toHaveLength(1);
    }
  });

  it("keeps resolving from the other sources when one source throws", async () => {
    const down: SourceAdapter = {
      id: "os3a",
      label: "down",
      async search() {
        throw new Error("asset-index fetch failed 404");
      },
    };
    const up: SourceAdapter = {
      id: "poly-haven",
      label: "up",
      async search() {
        return [asset({ id: "poly-haven:street_lamp_01", title: "Street Lamp 01", tags: ["street", "lamp"] })];
      },
    };
    const result = await new FederatedResolver({ adapters: [down, up] }).resolve({ text: "street lamp" });
    expect(result.candidates.map((c) => c.asset.id)).toEqual(["poly-haven:street_lamp_01"]);
    expect(result.warnings.join("\n")).toContain("os3a: asset-index fetch failed 404");
  });
});

describe("model searches do not return surface maps", () => {
  const textureSource: SourceAdapter = {
    id: "ambientcg",
    label: "maps",
    async search() {
      return [
        asset({ id: "ambientcg:Bricks105", title: "Bricks 105", format: "texture-set" }),
        asset({ id: "ambientcg:Sky01", title: "Sky 01", format: "hdr" }),
        asset({ id: "mesh:sword", title: "Sword", format: "glb" }),
      ];
    },
  };

  it("filters texture sets, HDRIs and images from a model query", async () => {
    const results = await meshOnlyAdapter(textureSource).search({ text: "sword" }, { fetchJson: async () => ({}) });
    expect(results.map((r) => r.id)).toEqual(["mesh:sword"]);
  });

  it("recognises queries that really want a surface or an environment", () => {
    for (const q of ["brick texture", "pbr asphalt", "tileable concrete", "sunset hdri", "mossy ground"]) {
      expect(queryWantsNonMesh(q)).toBe(true);
    }
    for (const q of ["sword", "chair", "human character with rig", "sports car"]) {
      expect(queryWantsNonMesh(q)).toBe(false);
    }
  });

  it("buildSearchAdapters leaves texture sources unfiltered for a texture query", async () => {
    const adapters = buildSearchAdapters({}, process.cwd(), "brick texture");
    expect(adapters.map((a) => a.id)).toContain("ambientcg");
  });
});

describe("ranking only orders assets that match the query", () => {
  const popular = asset({
    id: "kenney:garbage-truck",
    title: "Garbage Truck",
    tags: ["truck", "vehicle"],
    workerScore: 90,
    qualityScore: 90,
    rawCatalogMetadata: { heroCandidate: true },
  });

  it("scores a popular, screened but unrelated asset at zero", () => {
    expect(scoreAsset(popular, "sword")).toBe(0);
    expect(scoreAsset(popular, "campfire")).toBe(0);
  });

  it("still ranks the same asset for a query it matches", () => {
    expect(scoreAsset(popular, "garbage truck")).toBeGreaterThan(0);
  });

  it("keeps a hosted semantic match that shares no keyword with the query", () => {
    const semantic = asset({ id: "objaverse:x", title: "Automobile", semanticScore: 0.8 });
    expect(scoreAsset(semantic, "car")).toBeGreaterThan(0);
  });
});
