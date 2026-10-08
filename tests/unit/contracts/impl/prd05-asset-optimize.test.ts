/**
 * PRD-05 Phase 2 — §6.3 pipeline invariants run under the repo vitest suite.
 * The toolchain lives in tools/asset-optimize/ with its own npm deps
 * (CONTRACTS §4.4); every test skips when those deps are absent so lanes that
 * never run `npm ci --prefix tools/asset-optimize` stay green.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const toolDir = join(repoRoot, "tools", "asset-optimize");
const hasToolDeps = existsSync(join(toolDir, "node_modules", "@gltf-transform", "core"));

describe.runIf(hasToolDeps)("prd05 asset-optimize tool", () => {
  it("profile table: floor <= target <= ceiling and normal maps are UASTC", async () => {
    const { ASSET_OPTIMIZE_PROFILES } = await import("../../../../tools/asset-optimize/profiles.js");
    for (const [id, profile] of Object.entries(ASSET_OPTIMIZE_PROFILES)) {
      expect(profile.id, id).toBe(id);
      expect(profile.triangles.floor, id).toBeLessThanOrEqual(profile.triangles.target);
      expect(profile.triangles.target, id).toBeLessThanOrEqual(profile.triangles.ceiling);
      // PBR profiles compress normals UASTC; texture-less slots (hdri) skip them.
      const expectNormal = profile.textures.baseColor === "none" ? "none" : "uastc";
      expect(profile.textures.normal, id).toBe(expectNormal);
      const ratios = profile.lodRatios;
      for (let i = 1; i < ratios.length; i += 1) expect(ratios[i]!, id).toBeLessThan(ratios[i - 1]!);
    }
    // Palette only on world-chunk/prop-small per §6.2.
    for (const [id, profile] of Object.entries(ASSET_OPTIMIZE_PROFILES)) {
      expect(profile.paletteAllowed, id).toBe(id === "world-chunk" || id === "prop-small");
    }
  });

  it("profileForRole maps roles to the §6.2 table", async () => {
    const { profileForRole } = await import("../../../../tools/asset-optimize/profiles.js");
    expect(profileForRole("prop", [0.4, 0.4, 0.4])?.id).toBe("prop-small");
    expect(profileForRole("prop", [4, 4, 4])?.id).toBe("prop-large");
    expect(profileForRole("hero")?.id).toBe("hero-character");
    expect(profileForRole("character")?.id).toBe("hero-character");
    expect(profileForRole("enemy")?.id).toBe("npc-character");
    expect(profileForRole("vehicle")?.id).toBe("hero-vehicle");
    expect(profileForRole("world")?.id).toBe("world-chunk");
    expect(profileForRole("backdrop")?.id).toBe("backdrop");
    expect(profileForRole("hdri")?.id).toBe("hdri");
  });

  it("MSFT_lod extension round-trips ids + MSFT_screencoverage extras", async () => {
    // Vite resolves bare specifiers against this file's tree (root
    // node_modules); the tool's deps live in tools/asset-optimize — resolve
    // through its own package.json instead.
    const toolRequire = createRequire(join(toolDir, "package.json"));
    const { Document, Format, NodeIO } = await import(toolRequire.resolve("@gltf-transform/core"));
    const { MSFTLod, MSFT_LOD_EXTENSION_NAME, MSFT_SCREENCOVERAGE_EXTRA } = await import("../../../../tools/asset-optimize/extensions/msft-lod.js");
    const doc = new Document();
    const scene = doc.createScene("s");
    const lod0 = doc.createNode("lod0");
    const lod1 = doc.createNode("lod1");
    const lod2 = doc.createNode("lod2");
    scene.addChild(lod0).addChild(lod1).addChild(lod2);
    const prop = doc.createExtension(MSFTLod).createLodNode();
    prop.addLod(lod1).addLod(lod2);
    lod0.setExtension(MSFT_LOD_EXTENSION_NAME, prop);
    lod0.setExtras({ [MSFT_SCREENCOVERAGE_EXTRA]: [0.25, 0.08, 0.02] });
    const io = new NodeIO().registerExtensions([MSFTLod]);
    const json = await io.writeJSON(doc, { format: Format.GLTF });
    const nodes = (json.json as { nodes?: { extensions?: Record<string, { ids?: number[] }> }[] }).nodes!;
    expect(nodes[0].extensions?.[MSFT_LOD_EXTENSION_NAME]?.ids).toEqual([1, 2]);
    const roundTrip = await io.readJSON(json);
    const [n0] = roundTrip.getRoot().listNodes();
    const lods = (n0!.getExtension(MSFT_LOD_EXTENSION_NAME) as { listLods(): unknown[] }).listLods();
    expect(lods.length).toBe(2);
    expect(roundTrip.getRoot().listExtensionsUsed().map((e: { extensionName: string }) => e.extensionName)).toContain(MSFT_LOD_EXTENSION_NAME);
  });

  it("determinism: damaged-helmet optimizes twice to identical sha256", async () => {
    const { optimizeGLB } = await import("../../../../tools/asset-optimize/pipeline.js");
    const { ASSET_OPTIMIZE_PROFILES } = await import("../../../../tools/asset-optimize/profiles.js");
    const source = readFileSync(join(repoRoot, "fixtures", "asset-corpus", "damaged-helmet.glb"));
    const profile = ASSET_OPTIMIZE_PROFILES["prop-large"]!;
    const opts = { profile, geometry: "none" as const, mobileCap: 0, log: () => undefined };
    const a = await optimizeGLB(new Uint8Array(source), opts);
    const b = await optimizeGLB(new Uint8Array(source), opts);
    expect(createHash("sha256").update(a.glb).digest("hex")).toBe(createHash("sha256").update(b.glb).digest("hex"));
    expect(a.steps.map((s) => s.step)).toEqual(b.steps.map((s) => s.step));
  }, 180_000);
});
