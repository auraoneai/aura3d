import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { group, material, primitives } from "@aura3d/engine";
import type { AuraCliAssetEntry, AuraCliAssetManifest } from "../../../packages/aura3d-cli/src/asset-core-types.js";
import type { ResolveReport } from "../../../packages/aura3d-cli/src/pull-bridge.js";
import type { SearchCandidateLine, SearchReport } from "../../../packages/aura3d-cli/src/pull-bridge/search.js";
import {
  PROCEDURAL_RECIPES,
  describeCandidate,
  headNoun,
  mentionsNoun,
  pickRecipe,
  proceduralRecipe,
  runResolveLadder,
} from "../../../packages/aura3d-cli/src/resolve-ladder.js";

function manifest(assets: Partial<AuraCliAssetEntry>[] = []): AuraCliAssetManifest {
  return {
    schema: "aura3d.assets/1.1",
    assetBasePath: "/aura-assets",
    outputDir: "public/aura-assets",
    typegen: "src/aura-assets.ts",
    assets: assets.map((asset) => ({
      id: "x",
      type: "model",
      format: "glb",
      source: "assets/x.glb",
      outputPath: "public/aura-assets/x.glb",
      url: "/aura-assets/x.glb",
      hash: "sha256-abc",
      sizeBytes: 2048,
      materials: [],
      animations: [],
      textures: [],
      ...asset,
    })) as AuraCliAssetEntry[],
  };
}

function line(partial: Partial<SearchCandidateLine> & { id: string; title: string }): SearchCandidateLine {
  return { source: "poly-haven", license: "CC0-1.0", autoPullable: true, access: "direct-download", format: "glb", ...partial } as SearchCandidateLine;
}

function searchReturning(candidates: SearchCandidateLine[]): (options: { query: string }) => Promise<SearchReport> {
  return async ({ query }) => ({ ok: true, query, profile: "general", candidates, rejectedCandidates: [], deepLinks: [], warnings: [], messages: [] }) as unknown as SearchReport;
}

const okResolve = async (): Promise<ResolveReport> => ({ ok: true, profile: "general", messages: ["Added streetLamp"], warnings: [] }) as unknown as ResolveReport;
const noSearch = searchReturning([]);

describe("head noun matching", () => {
  it("takes the last content word and singularises it", () => {
    expect(headNoun("wooden bridge")).toBe("bridge");
    expect(headNoun("a low poly street lamp")).toBe("lamp");
    expect(headNoun("oak trees")).toBe("tree");
    expect(headNoun("sports car")).toBe("car");
    expect(headNoun("  ")).toBeUndefined();
  });

  it("does not match an unrelated title", () => {
    expect(mentionsNoun("Carved Elephant Statue", "bridge")).toBe(false);
    expect(mentionsNoun("Old Wooden Bridge 02", "bridge")).toBe(true);
    expect(mentionsNoun("street_lamp_01", "lamp")).toBe(true);
  });
});

describe("rung 1: project assets", () => {
  it("uses an admitted asset that matches the noun", async () => {
    const report = await runResolveLadder({
      need: "street lamp",
      readManifest: () => manifest([{ id: "streetLamp", source: "assets/street_lamp_01.glb" }]),
      searchFn: async () => {
        throw new Error("search must not run when the project already has it");
      },
    });
    expect(report.chosen).toBe("project");
    expect(report.projectAsset?.id).toBe("streetLamp");
  });

  it("ignores an admitted texture when a model is needed", async () => {
    const report = await runResolveLadder({
      need: "brick wall",
      readManifest: () => manifest([{ id: "brickWall", type: "texture" }]),
      searchFn: noSearch,
    });
    expect(report.chosen).not.toBe("project");
  });
});

describe("rung 2: open sources", () => {
  it("rejects a candidate that does not mention the noun (wooden bridge is not an elephant)", async () => {
    const report = await runResolveLadder({
      need: "wooden bridge",
      dryRun: true,
      readManifest: () => manifest(),
      searchFn: searchReturning([line({ id: "os3a:elephant", title: "Carved Elephant" })]),
    });
    expect(report.chosen).toBe("procedural");
    expect(report.skipped.find((skip) => skip.rung === "open-source")?.reason).toContain("does not mention \"bridge\"");
  });

  it("rejects a title that only mentions the noun (Bridge Pillar is a pillar; a truck from a car kit is a truck)", async () => {
    const bridge = await runResolveLadder({
      need: "wooden bridge",
      dryRun: true,
      readManifest: () => manifest(),
      searchFn: searchReturning([line({ id: "kenney:city-kit-roads:bridge-pillar", title: "Bridge Pillar" })]),
    });
    expect(bridge.chosen).toBe("procedural");
    expect(bridge.skipped.find((skip) => skip.rung === "open-source")?.reason).toContain("is a pillar, not a bridge");
    const car = await runResolveLadder({
      need: "sports car",
      role: "hero",
      dryRun: true,
      readManifest: () => manifest(),
      searchFn: searchReturning([line({ id: "kenney:car-kit:garbage-truck", title: "Garbage Truck" }), line({ id: "kenney:car-kit:sedan-sports", title: "Sports Car" })]),
    });
    expect(car.candidate?.title).toBe("Sports Car");
  });

  it("accepts size and variant words after the noun, and a qualifier in parentheses", async () => {
    const tree = await runResolveLadder({ need: "oak tree", dryRun: true, readManifest: () => manifest(), searchFn: searchReturning([line({ id: "k:tree-large", title: "Tree Large" })]) });
    expect(tree.chosen).toBe("open-source");
    const sky = await runResolveLadder({ need: "sunset sky", role: "hdri", dryRun: true, readManifest: () => manifest(), searchFn: searchReturning([line({ id: "poly-haven:belfast_sunset_puresky", title: "Belfast Sunset (Pure Sky)", format: "hdr" })]) });
    expect(sky.chosen).toBe("open-source");
  });

  it("picks the first matching licence-clear candidate and admits it", async () => {
    const calls: { candidateId?: string; name?: string }[] = [];
    const report = await runResolveLadder({
      need: "street lamp",
      readManifest: () => manifest(),
      searchFn: searchReturning([
        line({ id: "x:bench", title: "Park Bench" }),
        line({ id: "poly-haven:street_lamp_01", title: "Street Lamp 01", triangles: 2340, sizeBytes: 1_200_000 }),
      ]),
      resolveFn: async (options) => {
        calls.push({ candidateId: options.candidateId, name: options.name });
        return okResolve();
      },
    });
    expect(report.chosen).toBe("open-source");
    expect(calls).toEqual([{ candidateId: "poly-haven:street_lamp_01", name: "streetLamp" }]);
    expect(describeCandidate(report.candidate!)).toContain("2,340 triangles");
    expect(describeCandidate(report.candidate!)).toContain("1.1 MB");
  });

  it("skips models over the role triangle budget and non-model formats", async () => {
    const report = await runResolveLadder({
      need: "rock",
      role: "prop",
      dryRun: true,
      readManifest: () => manifest(),
      searchFn: searchReturning([
        line({ id: "a:rock-huge", title: "Rock Huge", triangles: 250_000 }),
        line({ id: "b:rock-tex", title: "Rock Texture", format: "texture-set" }),
      ]),
    });
    expect(report.chosen).toBe("procedural");
    const reason = report.skipped.find((skip) => skip.rung === "open-source")?.reason ?? "";
    expect(reason).toContain("exceeds the prop budget");
    expect(reason).toContain("not a model");
  });

  it("does not pull a candidate that is not auto-pullable", async () => {
    const report = await runResolveLadder({
      need: "sword",
      dryRun: true,
      readManifest: () => manifest(),
      searchFn: searchReturning([line({ id: "sketchfab:sword", title: "Sword", autoPullable: false })]),
    });
    expect(report.chosen).toBe("procedural");
  });
});

describe("removed rungs", () => {
  it("has no generation rung: an unmatched prop goes straight to procedural", async () => {
    const report = await runResolveLadder({ need: "dragon statue", readManifest: () => manifest(), searchFn: noSearch });
    expect(report.skipped.map((skip) => skip.rung)).toEqual(["project", "open-source"]);
    expect(report.chosen).toBe("procedural");
  });
});

describe("rung 3: procedural recipes", () => {
  it("maps nouns and aliases to recipes", () => {
    expect(pickRecipe("wooden barrel")).toBe("barrel");
    expect(pickRecipe("street light")).toBe("lamp");
    expect(pickRecipe("delivery van")).toBe("car");
    expect(pickRecipe("mysterious artifact")).toBe("crate");
  });

  it("every recipe snippet builds a real scene group with the engine", () => {
    for (const recipe of Object.keys(PROCEDURAL_RECIPES)) {
      const { snippet } = proceduralRecipe(recipe, "thing");
      const body = snippet.replace(/^import .*$/m, "").replace("export const thing =", "return");
      const build = new Function("group", "material", "primitives", body) as (...args: unknown[]) => { toJSON(): { kind: string; children: unknown[] } };
      const node = build(group, material, primitives).toJSON();
      expect(node.kind).toBe("group");
      expect(node.children.length).toBe(PROCEDURAL_RECIPES[recipe]!.length);
    }
  });

  it("is always available as the last rung", async () => {
    const report = await runResolveLadder({ need: "garden fence", name: "gardenFence", readManifest: () => manifest(), searchFn: noSearch });
    expect(report.chosen).toBe("procedural");
    expect(report.procedural?.recipe).toBe("fence");
    expect(report.procedural?.snippet).toContain("export const gardenFence = group(\"gardenFence\"");
    expect(existsSync("/definitely/not/created")).toBe(false);
  });

  it("returns none for a character with no match instead of a box", async () => {
    const report = await runResolveLadder({ need: "knight", role: "character", readManifest: () => manifest(), searchFn: noSearch });
    expect(report.ok).toBe(false);
    expect(report.chosen).toBe("none");
    expect(report.messages.join("\n")).toContain("aura3d assets add");
  });

  it("marks an unmatched prop recipe as a placeholder", () => {
    expect(proceduralRecipe("mysterious artifact", "artifact").snippet).toContain("PLACEHOLDER");
    expect(proceduralRecipe("garden fence", "fence").snippet).not.toContain("PLACEHOLDER");
  });

  it("refuses an invalid --name", async () => {
    await expect(runResolveLadder({ need: "crate", name: "1bad", readManifest: () => manifest(), searchFn: noSearch })).rejects.toThrow(/valid identifier/);
  });
});
