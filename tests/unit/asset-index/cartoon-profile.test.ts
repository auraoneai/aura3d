import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cartoonStarterPack,
  cartoonStarterPackAssets,
  cartoonStarterPackSummary,
  evaluateCartoonAssetProfile,
  normalizeLicense,
  type AuraCanonicalAsset,
} from "@aura3d/asset-index";
import { validateCartoonAssets } from "../../../packages/aura3d-cli/src/index";

function asset(partial: Partial<AuraCanonicalAsset> & Pick<AuraCanonicalAsset, "id">): AuraCanonicalAsset {
  return {
    source: partial.source ?? "test",
    title: partial.title ?? "Stylized Cartoon Asset",
    url: partial.url ?? "https://example.test/cartoon.glb",
    access: partial.access ?? "direct-download",
    format: partial.format ?? "glb",
    license: partial.license ?? normalizeLicense("CC0"),
    tags: partial.tags ?? ["cartoon", "stylized"],
    ...partial,
  };
}

describe("evaluateCartoonAssetProfile", () => {
  it("accepts and scores rigged expressive animated cartoon characters", () => {
    const evaluation = evaluateCartoonAssetProfile(
      asset({
        id: "test:hero",
        title: "Stylized Cartoon Humanoid Hero With Facial Morphs",
        tags: ["cartoon", "character", "humanoid", "rigged", "animated", "mouth", "expression"],
        hasAnimations: true,
        bounds: { size: [1, 1.8, 0.7] },
      }),
      "cartoon-character",
    );

    expect(evaluation.suitable).toBe(true);
    expect(evaluation.scoreBonus).toBeGreaterThan(60);
    expect(evaluation.rejectionReasons).toEqual([]);
    expect(evaluation.matchedSignals).toEqual(expect.arrayContaining(["cartoon", "character", "humanoid", "mouth"]));
  });

  it("rejects static photoreal scans for cartoon-character searches", () => {
    const evaluation = evaluateCartoonAssetProfile(
      asset({
        id: "test:scan",
        title: "Realistic Scanned Statue",
        tags: ["photogrammetry", "scan", "statue"],
        hasAnimations: false,
      }),
      "cartoon-character",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("photorealistic");
    expect(evaluation.rejectionReasons.join("\n")).toContain("not character-like");
    expect(evaluation.rejectionReasons.join("\n")).toContain("marked static");
  });

  it("accepts cartoon props without requiring animation clips", () => {
    const evaluation = evaluateCartoonAssetProfile(
      asset({
        id: "test:chair",
        title: "Cute Low Poly Cartoon Chair Prop",
        tags: ["cartoon", "low-poly", "prop", "chair", "furniture"],
        hasAnimations: false,
        bounds: { size: [0.8, 1.1, 0.8] },
      }),
      "cartoon-prop",
    );

    expect(evaluation.suitable).toBe(true);
    expect(evaluation.scoreBonus).toBeGreaterThan(40);
    expect(evaluation.rejectionReasons).toEqual([]);
  });

  it("rejects tiny assets as cartoon sets even when stylized", () => {
    const evaluation = evaluateCartoonAssetProfile(
      asset({
        id: "test:tiny-room",
        title: "Stylized Cartoon Room Set",
        tags: ["cartoon", "set", "room", "walkable"],
        bounds: { size: [0.4, 0.3, 0.5] },
      }),
      "cartoon-set",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("too small for a walkable cartoon set");
  });

  it("accepts cartoon environments and rejects IP-risk metadata", () => {
    const environment = evaluateCartoonAssetProfile(
      asset({
        id: "test:sky",
        title: "Stylized Cartoon Skybox Backdrop",
        tags: ["cartoon", "environment", "skybox", "backdrop"],
        bounds: { size: [20, 10, 20] },
      }),
      "cartoon-environment",
    );
    const ipRisk = evaluateCartoonAssetProfile(
      asset({
        id: "test:fan-sky",
        title: "Disney Cartoon Skybox Fan Art",
        tags: ["cartoon", "environment", "skybox", "fanart"],
      }),
      "cartoon-environment",
    );

    expect(environment.suitable).toBe(true);
    expect(ipRisk.suitable).toBe(false);
    expect(ipRisk.rejectionReasons.join("\n")).toContain("IP-risk");
  });

  it("rejects unverified and deep-link candidates for every cartoon profile", () => {
    for (const profile of ["cartoon-character", "cartoon-prop", "cartoon-set", "cartoon-environment"] as const) {
      const evaluation = evaluateCartoonAssetProfile(
        asset({
          id: `test:${profile}`,
          access: "deep-link-only",
          license: normalizeLicense(undefined),
          tags: ["cartoon", "character", "humanoid", "rigged", "animated", "prop", "set", "environment", "skybox"],
          hasAnimations: true,
        }),
        profile,
      );
      expect(evaluation.suitable).toBe(false);
      expect(evaluation.rejectionReasons.join("\n")).toContain("deep-link only");
      expect(evaluation.rejectionReasons.join("\n")).toContain("not verified redistributable");
    }
  });

  it("exposes a CC0 curated cartoon starter pack with profile-ready entries", () => {
    const summary = cartoonStarterPackSummary();
    expect(summary).toEqual({
      characterCount: 7,
      propCount: 10,
      setCount: 6,
      allLicenseVerified: true,
    });

    expect(cartoonStarterPack.every((entry) => entry.source === "kenney" && entry.license === "CC0" && entry.sourcePage)).toBe(true);
    expect(new Set(cartoonStarterPack.map((entry) => entry.id)).size).toBe(cartoonStarterPack.length);

    const assets = cartoonStarterPackAssets();
    expect(assets.every((entry) => entry.access === "direct-download" && entry.license.verified && entry.license.redistributable)).toBe(true);
    expect(assets.every((entry) => entry.url.startsWith("https://cdn.jsdelivr.net/gh/gchahal1982/aura3d-cc0-assets@main/"))).toBe(true);

    const hero = assets.find((entry) => entry.id === "cartoon-starter:hero");
    const chair = assets.find((entry) => entry.id === "cartoon-starter:prop-stool");
    const room = assets.find((entry) => entry.id === "cartoon-starter:set-indoor-room");
    expect(hero && evaluateCartoonAssetProfile(hero, "cartoon-character").suitable).toBe(true);
    expect(chair && evaluateCartoonAssetProfile(chair, "cartoon-prop").suitable).toBe(true);
    expect(room && evaluateCartoonAssetProfile(room, "cartoon-set").suitable).toBe(true);
  });

  it("passes validate-cartoon for the curated starter pack manifest", () => {
    const projectDir = join(tmpdir(), `aura3d-cartoon-starter-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputDir = join(projectDir, "public", "aura-assets");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(projectDir, "src"), { recursive: true });
    const payload = Buffer.from("starter-pack-asset");
    const hash = `sha256-${createHash("sha256").update(payload).digest("hex")}`;

    const assets = cartoonStarterPack.map((entry, index) => {
      const fileName = `${entry.id.replace(/[^a-z0-9]+/gi, "-")}.glb`;
      const outputPath = `public/aura-assets/${fileName}`;
      writeFileSync(join(projectDir, outputPath), payload);
      return {
        id: entry.id,
        type: "model",
        format: "glb",
        source: `starter/${fileName}`,
        outputPath,
        url: `/aura-assets/${fileName}`,
        hash,
        sizeBytes: payload.length,
        bounds: entry.bounds,
        materials: ["toonBase"],
        animations: entry.hasAnimations ? ["Idle", "Talk"] : [],
        provenance: {
          sourcePath: `starter/${fileName}`,
          sourceUrl: entry.sourcePage,
          license: entry.license,
          author: "Kenney",
          sourceFamily: entry.source,
          attribution: "Kenney",
          checkedAt: "2026-06-06T00:00:00.000Z"
        },
        textures: [],
        dependencies: [],
        thumbnailUrl: `/aura-assets/${entry.id.replace(/[^a-z0-9]+/gi, "-")}.thumb.svg`,
        warnings: index === 0 ? ["starter pack validation fixture"] : []
      };
    });

    writeFileSync(join(projectDir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0",
      assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets",
      typegen: "src/aura-assets.ts",
      assets
    }, null, 2));
    writeFileSync(join(projectDir, "src", "aura-assets.ts"), "export const assets = {} as const;\n");

    const report = validateCartoonAssets({
      projectDir,
      noPlaceholders: true,
      requireLicense: true,
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      totalAssets: 23,
      modelAssets: 23,
      animatedModels: 7
    });
    expect(report.assets.every((entry) => entry.licenseVerified && entry.cartoonReady)).toBe(true);
  });

  it("passes episode-ready cartoon validation for two distinct starter characters and one set", () => {
    const projectDir = join(tmpdir(), `aura3d-cartoon-episode-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputDir = join(projectDir, "public", "aura-assets");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(projectDir, "src"), { recursive: true });

    const selected = [
      cartoonStarterPack.find((entry) => entry.id === "cartoon-starter:miko"),
      cartoonStarterPack.find((entry) => entry.id === "cartoon-starter:luma"),
      cartoonStarterPack.find((entry) => entry.id === "cartoon-starter:set-moon-garden"),
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const assets = selected.map((entry, index) => {
      const fileName = `${entry.id.replace(/[^a-z0-9]+/gi, "-")}.glb`;
      const outputPath = `public/aura-assets/${fileName}`;
      const payload = Buffer.from(`starter-pack-episode-${entry.id}`);
      const hash = `sha256-${createHash("sha256").update(payload).digest("hex")}`;
      writeFileSync(join(projectDir, outputPath), payload);
      return {
        id: entry.id,
        type: "model",
        format: "glb",
        source: `starter/${fileName}`,
        outputPath,
        url: `/aura-assets/${fileName}`,
        hash,
        sizeBytes: payload.length,
        bounds: entry.bounds,
        boundsMetadata: {
          min: [-entry.bounds[0] / 2, 0, -entry.bounds[2] / 2],
          max: [entry.bounds[0] / 2, entry.bounds[1], entry.bounds[2] / 2],
          size: entry.bounds,
          center: [0, entry.bounds[1] / 2, 0],
          maxDimension: Math.max(...entry.bounds),
          grounded: true
        },
        materials: ["toonBase"],
        animations: entry.hasAnimations ? ["Idle", "Talk", "Wave"] : [],
        morphTargets: entry.kind === "character"
          ? { targetCount: 2, targetNames: ["AA", "Smile"], meshes: [], messages: [] }
          : { targetCount: 0, targetNames: [], meshes: [], messages: [] },
        provenance: {
          sourcePath: `starter/${fileName}`,
          sourceUrl: entry.sourcePage,
          license: entry.license,
          author: "Kenney",
          sourceFamily: entry.source,
          attribution: "Kenney",
          checkedAt: "2026-06-06T00:00:00.000Z"
        },
        textures: [],
        dependencies: [],
        thumbnailUrl: `/aura-assets/${entry.id.replace(/[^a-z0-9]+/gi, "-")}.thumb.svg`,
        warnings: []
      };
    });

    writeFileSync(join(projectDir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0",
      assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets",
      typegen: "src/aura-assets.ts",
      assets
    }, null, 2));
    writeFileSync(join(projectDir, "src", "aura-assets.ts"), "export const assets = {} as const;\n");

    const report = validateCartoonAssets({
      projectDir,
      episode: true,
      noPlaceholders: true,
      requireLicense: true,
    });

    expect(report.ok).toBe(true);
    expect(report.cartoonEpisode).toMatchObject({
      enabled: true,
      ok: true,
      selectedCharacters: ["cartoon-starter:miko", "cartoon-starter:luma"],
      selectedSets: ["cartoon-starter:set-moon-garden"],
    });
    expect(report.summary).toMatchObject({
      cartoonCharacters: 2,
      cartoonSets: 1,
      episodeReadyCharacters: 2,
      mouthReadyCharacters: 2,
      animationReadyCharacters: 2,
    });
  });
});
