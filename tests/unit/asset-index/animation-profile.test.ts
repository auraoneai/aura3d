import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  animationStarterPack,
  animationStarterPackAssets,
  animationStarterPackSummary,
  evaluateAnimationAssetProfile,
  normalizeLicense,
  type AuraCanonicalAsset,
} from "@aura3d/asset-index";
import { validateAnimationStudioAssets } from "../../../packages/aura3d-cli/src/index";

function asset(partial: Partial<AuraCanonicalAsset> & Pick<AuraCanonicalAsset, "id">): AuraCanonicalAsset {
  return {
    source: partial.source ?? "test",
    title: partial.title ?? "Stylized Animation Asset",
    url: partial.url ?? "https://example.test/animation.glb",
    access: partial.access ?? "direct-download",
    format: partial.format ?? "glb",
    license: partial.license ?? normalizeLicense("CC0"),
    tags: partial.tags ?? ["animation", "stylized"],
    ...partial,
  };
}

describe("evaluateAnimationAssetProfile", () => {
  it("accepts and scores rigged expressive animated animation characters", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({
        id: "test:hero",
        title: "Stylized Animation Humanoid Hero With Facial Morphs",
        tags: ["animation", "character", "humanoid", "rigged", "animated", "mouth", "expression"],
        hasAnimations: true,
        bounds: { size: [1, 1.8, 0.7] },
      }),
      "animation-character",
    );

    expect(evaluation.suitable).toBe(true);
    expect(evaluation.scoreBonus).toBeGreaterThan(60);
    expect(evaluation.rejectionReasons).toEqual([]);
    expect(evaluation.matchedSignals).toEqual(expect.arrayContaining(["animation", "character", "humanoid", "mouth"]));
  });

  it("rejects static photoreal scans for animation-character searches", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({
        id: "test:scan",
        title: "Realistic Scanned Statue",
        tags: ["photogrammetry", "scan", "statue"],
        hasAnimations: false,
      }),
      "animation-character",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("photorealistic");
    expect(evaluation.rejectionReasons.join("\n")).toContain("not character-like");
    expect(evaluation.rejectionReasons.join("\n")).toContain("marked static");
  });

  it("accepts animation props without requiring animation clips", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({
        id: "test:chair",
        title: "Cute Low Poly Animation Chair Prop",
        tags: ["animation", "low-poly", "prop", "chair", "furniture"],
        hasAnimations: false,
        bounds: { size: [0.8, 1.1, 0.8] },
      }),
      "animation-prop",
    );

    expect(evaluation.suitable).toBe(true);
    expect(evaluation.scoreBonus).toBeGreaterThan(40);
    expect(evaluation.rejectionReasons).toEqual([]);
  });

  it("rejects tiny assets as animation sets even when stylized", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({
        id: "test:tiny-room",
        title: "Stylized Animation Room Set",
        tags: ["animation", "set", "room", "walkable"],
        bounds: { size: [0.4, 0.3, 0.5] },
      }),
      "animation-set",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("too small for a walkable animation set");
  });

  it("accepts animation environments and rejects IP-risk metadata", () => {
    const environment = evaluateAnimationAssetProfile(
      asset({
        id: "test:sky",
        title: "Stylized Animation Skybox Backdrop",
        tags: ["animation", "environment", "skybox", "backdrop"],
        bounds: { size: [20, 10, 20] },
      }),
      "animation-environment",
    );
    const ipRisk = evaluateAnimationAssetProfile(
      asset({
        id: "test:fan-sky",
        title: "Disney Animation Skybox Fan Art",
        tags: ["animation", "environment", "skybox", "fanart"],
      }),
      "animation-environment",
    );

    expect(environment.suitable).toBe(true);
    expect(ipRisk.suitable).toBe(false);
    expect(ipRisk.rejectionReasons.join("\n")).toContain("IP-risk");
  });

  it("rejects unverified and deep-link candidates for every animation profile", () => {
    for (const profile of ["animation-character", "animation-prop", "animation-set", "animation-environment"] as const) {
      const evaluation = evaluateAnimationAssetProfile(
        asset({
          id: `test:${profile}`,
          access: "deep-link-only",
          license: normalizeLicense(undefined),
          tags: ["animation", "character", "humanoid", "rigged", "animated", "prop", "set", "environment", "skybox"],
          hasAnimations: true,
        }),
        profile,
      );
      expect(evaluation.suitable).toBe(false);
      expect(evaluation.rejectionReasons.join("\n")).toContain("deep-link only");
      expect(evaluation.rejectionReasons.join("\n")).toContain("not verified redistributable");
    }
  });

  it("exposes a CC0 curated animation starter pack with profile-ready entries", () => {
    const summary = animationStarterPackSummary();
    expect(summary).toEqual({
      characterCount: 7,
      propCount: 10,
      setCount: 6,
      allLicenseVerified: true,
    });

    expect(animationStarterPack.every((entry) => entry.source === "kenney" && entry.license === "CC0" && entry.sourcePage)).toBe(true);
    expect(new Set(animationStarterPack.map((entry) => entry.id)).size).toBe(animationStarterPack.length);

    const assets = animationStarterPackAssets();
    expect(assets.every((entry) => entry.access === "direct-download" && entry.license.verified && entry.license.redistributable)).toBe(true);
    expect(assets.every((entry) => entry.url.startsWith("https://cdn.jsdelivr.net/gh/gchahal1982/aura3d-cc0-assets@main/"))).toBe(true);

    const hero = assets.find((entry) => entry.id === "animation-starter:hero");
    const chair = assets.find((entry) => entry.id === "animation-starter:prop-stool");
    const room = assets.find((entry) => entry.id === "animation-starter:set-indoor-room");
    expect(hero && evaluateAnimationAssetProfile(hero, "animation-character").suitable).toBe(true);
    expect(chair && evaluateAnimationAssetProfile(chair, "animation-prop").suitable).toBe(true);
    expect(room && evaluateAnimationAssetProfile(room, "animation-set").suitable).toBe(true);
  });

  it("passes validate-animation for the curated starter pack manifest", () => {
    const projectDir = join(tmpdir(), `aura3d-animation-starter-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputDir = join(projectDir, "public", "aura-assets");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(projectDir, "src"), { recursive: true });
    const payload = Buffer.from("starter-pack-asset");
    const hash = `sha256-${createHash("sha256").update(payload).digest("hex")}`;

    const assets = animationStarterPack.map((entry, index) => {
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

    const report = validateAnimationStudioAssets({
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
    expect(report.assets.every((entry) => entry.licenseVerified && entry.animationReady)).toBe(true);
  });

  it("passes episode-ready animation validation for two distinct starter characters and one set", () => {
    const projectDir = join(tmpdir(), `aura3d-animation-episode-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputDir = join(projectDir, "public", "aura-assets");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(projectDir, "src"), { recursive: true });

    const selected = [
      animationStarterPack.find((entry) => entry.id === "animation-starter:miko"),
      animationStarterPack.find((entry) => entry.id === "animation-starter:luma"),
      animationStarterPack.find((entry) => entry.id === "animation-starter:set-moon-garden"),
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

    const report = validateAnimationStudioAssets({
      projectDir,
      episode: true,
      noPlaceholders: true,
      requireLicense: true,
    });

    expect(report.ok).toBe(true);
    expect(report.animationEpisode).toMatchObject({
      enabled: true,
      ok: true,
      selectedCharacters: ["animation-starter:miko", "animation-starter:luma"],
      selectedSets: ["animation-starter:set-moon-garden"],
    });
    expect(report.summary).toMatchObject({
      animationCharacters: 2,
      animationSets: 1,
      episodeReadyCharacters: 2,
      mouthReadyCharacters: 2,
      animationReadyCharacters: 2,
    });
  });
});
