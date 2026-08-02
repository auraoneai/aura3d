import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  FederatedResolver,
  createAuraIndexAdapter,
  evaluateAnimationAssetProfile,
  normalizeLicense,
  type AuraCanonicalAsset,
  type FetchJson,
  type ResolveCandidate,
} from "@aura3d/asset-index";
import {
  buildSearchAdapters,
  defaultDownloadFile,
  scoreResolveCandidate,
  runResolve,
  runSearch,
  selectPullable,
  toResolveConstraints,
} from "../../../packages/aura3d-cli/src/pull-bridge";

/**
 * The exact shape the hosted catalog worker returns (verified against
 * GET https://aura3d-asset-index-cron.newsroom.workers.dev/search). Used to mock
 * `fetchJson` so these tests stay offline-deterministic.
 */
const WORKER_RESPONSE = {
  query: "cute robot mascot character",
  count: 3,
  results: [
    {
      id: "objaverse:07a6bdfcfde44565a259be970000d2a3",
      title: "Cute Little Robot",
      source: "objaverse",
      url: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-000/07a6bdfcfde44565a259be970000d2a3.glb",
      downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-000/07a6bdfcfde44565a259be970000d2a3.glb",
      sourcePage: "https://objaverse.allenai.org/object/07a6bdfcfde44565a259be970000d2a3",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      thumbnail: "https://media.sketchfab.com/x/thumb.jpeg",
      attribution: "Paleo Modelist",
      author: "Paleo Modelist",
      score: 0.84,
      workerScore: 0.73,
      qualityScore: 0.68,
      bounds: { size: [0.8, 1.6, 0.6] },
      triangleCount: 12000,
      meshCount: 4,
      materialCount: 3,
      textureCount: 2,
      animationClipCount: 2,
      skinCount: 1,
      intendedRole: "character",
      roleSuitability: "Readable mascot character candidate with source metadata.",
    },
    {
      id: "sketchfab:6aadb75f596742ada2814ad4593f0032",
      title: "cute robot",
      source: "sketchfab",
      url: "https://api.sketchfab.com/v3/models/6aadb75f596742ada2814ad4593f0032/download",
      downloadUrl: "https://api.sketchfab.com/v3/models/6aadb75f596742ada2814ad4593f0032/download",
      sourcePage: "https://sketchfab.com/3d-models/6aadb75f596742ada2814ad4593f0032",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      thumbnail: "https://media.sketchfab.com/y/thumb.jpeg",
      attribution: "Doink",
      author: "Doink",
      score: 0.82,
      workerScore: 0.71,
      qualityScore: 0.61,
      bounds: { size: [0.7, 1.4, 0.5] },
      triangleCount: 9000,
      meshCount: 3,
      materialCount: 2,
      textureCount: 1,
      intendedRole: "character",
      roleSuitability: "Readable robot character candidate with source metadata.",
    },
  ],
} as const;

function workerFetch(): FetchJson {
  return async (_url: string) => WORKER_RESPONSE;
}

/**
 * These tests pin the license-safety contract of the CLI pull bridge without a
 * full CLI harness: the pure `selectPullable` seam and the resolve flow with
 * injected resolver + downloader, so no network is touched.
 */

function asset(partial: Partial<AuraCanonicalAsset> & Pick<AuraCanonicalAsset, "id">): AuraCanonicalAsset {
  return {
    source: partial.source ?? "test",
    title: partial.title ?? "Test Asset",
    url: partial.url ?? "https://example.test/model.glb",
    access: partial.access ?? "direct-download",
    format: partial.format ?? "glb",
    license: partial.license ?? normalizeLicense("CC0"),
    tags: partial.tags ?? [],
    ...partial,
  };
}

function candidate(a: AuraCanonicalAsset, score = 10): ResolveCandidate {
  return { asset: a, score };
}

/** A tiny resolver stand-in matching the FederatedResolver.resolve shape. */
function stubResolver(candidates: readonly ResolveCandidate[]): { resolve: (query: unknown) => Promise<unknown> } {
  return {
    resolve: async () => ({
      query: { text: "" },
      candidates,
      warnings: [] as string[],
    }),
  };
}

describe("selectPullable", () => {
  it("picks the first auto-pullable candidate (CC0, direct-download)", () => {
    const cc0 = asset({ id: "os3a:a", license: normalizeLicense("CC0") });
    const result = selectPullable([candidate(cc0)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate.asset.id).toBe("os3a:a");
  });

  it("refuses an UNVERIFIED top candidate and explains why", () => {
    const unverified = asset({ id: "khronos:x", license: normalizeLicense(undefined) });
    const result = selectPullable([candidate(unverified)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("UNVERIFIED");
      expect(result.reason).toContain("will not auto-pull");
    }
  });

  it("refuses a deep-link-only candidate even if license is CC0", () => {
    const deepLink = asset({ id: "market:y", access: "deep-link-only", license: normalizeLicense("CC0") });
    const result = selectPullable([candidate(deepLink)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("deep-link");
  });

  it("skips a non-pullable first candidate to reach a pullable one", () => {
    const unverified = asset({ id: "khronos:x", license: normalizeLicense(undefined) });
    const cc0 = asset({ id: "os3a:a", license: normalizeLicense("CC0") });
    const result = selectPullable([candidate(unverified, 20), candidate(cc0, 5)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate.asset.id).toBe("os3a:a");
  });

  it("reports an empty candidate set distinctly", () => {
    const result = selectPullable([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("No candidates matched");
  });

  it("refuses auto-pullable candidates that fail the fighting-character profile", () => {
    const staticAircraft = asset({
      id: "os3a:aircraft",
      title: "Static Aircraft",
      tags: ["aircraft", "vehicle"],
      hasAnimations: false,
    });
    const result = selectPullable([candidate(staticAircraft)], { profile: "fighting-character" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("fighting-character");
      expect(result.reason).toContain("marked static");
      expect(result.reason).toContain("aircraft");
    }
  });
});

describe("toResolveConstraints", () => {
  it("threads license/maxTris/animated and redistributableOnly", () => {
    const c = toResolveConstraints({ license: ["CC0"], maxTriangles: 50000, animated: true }, true);
    expect(c).toEqual({ license: ["CC0"], maxTriangles: 50000, animated: true, redistributableOnly: true });
  });

  it("maps fighting-character profile to animated redistributable GLB constraints", () => {
    const c = toResolveConstraints({ profile: "fighting-character" }, true);
    expect(c).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 200_000,
      animated: true,
      format: "glb",
      redistributableOnly: true,
    });
  });

  it("maps animation profiles to redistributable GLB constraints", () => {
    expect(toResolveConstraints({ profile: "animation-character" }, true)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 160_000,
      animated: true,
      format: "glb",
      redistributableOnly: true,
    });
    expect(toResolveConstraints({ profile: "animation-prop" }, true)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 100_000,
      format: "glb",
      redistributableOnly: true,
    });
    expect(toResolveConstraints({ profile: "animation-set", animated: true }, false)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 350_000,
      animated: true,
      format: "glb",
    });
    expect(toResolveConstraints({ profile: "animation-environment" }, true)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 250_000,
      format: "glb",
      redistributableOnly: true,
    });
  });

  it("omits unset fields and redistributableOnly when false", () => {
    const c = toResolveConstraints({}, false);
    expect(c).toEqual({});
  });
});

describe("runResolve", () => {
  it("downloads the top pullable candidate and runs the add pipeline -> typed ref", async () => {
    const projectDir = makeProject();
    const cc0 = asset({
      id: "os3a:bench",
      title: "Park Bench",
      url: "https://example.test/Bench_01.glb",
      license: normalizeLicense("CC0"),
    });

    const downloaded: string[] = [];
    const report = await runResolve({
      query: "park bench",
      name: "bench",
      projectDir,
      makeResolver: () => stubResolver([candidate(cc0)]) as never,
      download: async (url, dest) => {
        downloaded.push(url);
        writeFileSync(dest, minimalGlb());
      },
    });

    expect(report.ok).toBe(true);
    expect(downloaded).toEqual(["https://example.test/Bench_01.glb"]);
    expect(report.typedRef).toBe("model(assets.bench)");
    const typed = readFileSync(join(projectDir, "src", "aura-assets.ts"), "utf8");
    expect(typed).toContain('"bench"');
    const manifest = JSON.parse(readFileSync(join(projectDir, "aura.assets.json"), "utf8")) as {
      assets: Array<{ id: string; provenance?: { license?: string; sourceUrl?: string; sourceFamily?: string } }>;
    };
    expect(manifest.assets.find((entry) => entry.id === "bench")?.provenance).toMatchObject({
      license: "CC0-1.0",
      sourceUrl: "https://example.test/Bench_01.glb",
      sourceFamily: "test",
    });
  });

  it("captures attribution into messages for CC-BY assets", async () => {
    const projectDir = makeProject();
    const ccby = asset({
      id: "src:knight",
      title: "Knight",
      url: "https://example.test/knight.glb",
      license: normalizeLicense("CC-BY-4.0", "https://example.test/knight"),
      attribution: "Jane Modeler",
      sourcePage: "https://example.test/knight",
    });

    const report = await runResolve({
      query: "knight",
      name: "knight",
      projectDir,
      makeResolver: () => stubResolver([candidate(ccby)]) as never,
      download: async (_url, dest) => writeFileSync(dest, minimalGlb()),
    });

    expect(report.ok).toBe(true);
    expect(report.messages.some((m) => m.includes("Attribution required") && m.includes("Jane Modeler"))).toBe(true);
  });

  it("refuses (throws) when no candidate is auto-pullable, never downloading", async () => {
    const projectDir = makeProject();
    const unverified = asset({ id: "khronos:x", license: normalizeLicense(undefined) });
    let downloads = 0;
    await expect(
      runResolve({
        query: "x",
        name: "x",
        projectDir,
        makeResolver: () => stubResolver([candidate(unverified)]) as never,
        download: async () => {
          downloads += 1;
        },
      }),
    ).rejects.toThrow(/resolve refused/i);
    expect(downloads).toBe(0);
  });

  it("rejects an invalid --name", async () => {
    await expect(
      runResolve({ query: "x", name: "1-bad name", makeResolver: () => stubResolver([]) as never }),
    ).rejects.toThrow(/valid identifier/i);
  });

  it("refuses profile-unsuitable downloads during fighting-character resolve", async () => {
    const projectDir = makeProject();
    const staticProp = asset({
      id: "os3a:prop",
      title: "Static Prop",
      tags: ["prop"],
      hasAnimations: false,
    });
    let downloads = 0;

    await expect(
      runResolve({
        query: "animated humanoid fighter",
        name: "fighter",
        projectDir,
        constraints: { profile: "fighting-character" },
        makeResolver: () => stubResolver([candidate(staticProp)]) as never,
        download: async () => {
          downloads += 1;
        },
      }),
    ).rejects.toThrow(/fighting-character profile/i);
    expect(downloads).toBe(0);
  });
});

describe("asset resolve ranking preservation", () => {
  it("does not choose a weak first candidate when a later candidate has durable provenance", async () => {
    const projectDir = makeProject();
    const weakFirst = asset({
      id: "catalog:weak-car",
      title: "Sports Car",
      url: "https://example.test/weak.glb",
      license: normalizeLicense("CC0"),
    });
    const durableSecond = asset({
      id: "catalog:durable-car",
      title: "Sports Car With Provenance",
      url: "https://example.test/durable.glb",
      downloadUrl: "https://example.test/durable.glb",
      sourcePage: "https://example.test/assets/durable-car",
      license: normalizeLicense("CC0", "https://example.test/assets/durable-car"),
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      attribution: "Catalog Author",
      sourceFamily: "catalog",
      semanticScore: 0.92,
      workerScore: 0.86,
      qualityScore: 0.81,
      intendedRole: "vehicle",
      roleSuitability: "Readable vehicle candidate with source, license, and role metadata.",
    });
    const downloaded: string[] = [];

    await runResolve({
      query: "sports car vehicle",
      name: "car",
      projectDir,
      makeResolver: () => stubResolver([candidate(weakFirst, 100), candidate(durableSecond, 10)]) as never,
      download: async (url, dest) => {
        downloaded.push(url);
        writeFileSync(dest, minimalGlb());
      },
    });

    expect(downloaded).toEqual(["https://example.test/durable.glb"]);
  });

  it("preserves score reasons and candidate quality into manifest provenance", async () => {
    const projectDir = makeProject();
    const car = asset({
      id: "catalog:ranked-car",
      title: "Ranked Sports Car",
      url: "https://example.test/ranked.glb",
      downloadUrl: "https://example.test/ranked.glb",
      sourcePage: "https://example.test/assets/ranked-car",
      license: normalizeLicense("CC0", "https://example.test/assets/ranked-car"),
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      attribution: "Catalog Author",
      sourceFamily: "hosted-catalog",
      retrievedAt: "2026-06-20T20:00:00.000Z",
      semanticScore: 0.8,
      workerScore: 0.7,
      qualityScore: 0.6,
      bounds: { size: [4, 1.4, 2] },
      dimensions: [4, 1.4, 2],
      triangleCount: 32000,
      meshCount: 5,
      materialCount: 2,
      textureCount: 3,
      animationClipCount: 1,
      animationClips: ["idle"],
      skinCount: 1,
      morphTargetCount: 2,
      intendedRole: "vehicle",
      roleSuitability: "Readable vehicle candidate with ranking metadata.",
      qualityWarnings: ["manual review recommended"],
      duplicateHash: "sha256-allowed",
      duplicateOkReason: "same upstream source with corrected metadata",
      rawCatalogMetadata: {
        sourcePage: "https://example.test/assets/ranked-car",
        qualityScore: 0.6,
      },
    });

    const report = await runResolve({
      query: "sports car vehicle",
      name: "rankedCar",
      projectDir,
      makeResolver: () => stubResolver([candidate(car, 10)]) as never,
      download: async (_url, dest) => writeFileSync(dest, minimalGlb()),
      inspectAssetFn: ({ file }) => ({
        ok: true,
        schema: "aura3d.asset-inspection/1.0",
        file,
        format: "glb",
        sizeBytes: minimalGlb().length,
        bounds: [4, 1.4, 2],
        materials: ["paint"],
        animations: ["idle"],
        skeleton: {
          skinCount: 1,
          jointCount: 1,
          skins: [{ index: 0, name: "Armature", jointCount: 1, joints: ["root"] }],
          messages: [],
        },
        morphTargets: {
          targetCount: 2,
          targetNames: ["blink", "smile"],
          meshes: [],
          messages: [],
        },
        textures: ["albedo.png", "normal.png", "roughness.png"],
        dependencies: [],
        warnings: [],
        messages: [],
      }),
    });
    const output = report.messages.join("\n");
    expect(output).toContain("Release validation is still required");
    expect(output).toContain("rendered-probe proof");
    expect(output).not.toMatch(/production-ready|showcase-ready|release-ready/i);

    const manifest = JSON.parse(readFileSync(join(projectDir, "aura.assets.json"), "utf8")) as {
      assets: Array<{
        id: string;
        quality?: string;
        role?: string;
        provenance?: {
          resolveCandidate?: {
            catalogId?: string;
            scoreTotal?: number;
            reasons?: string[];
            penalties?: string[];
            sourcePage?: string;
            downloadUrl?: string;
            license?: string;
            licenseName?: string;
            licenseUrl?: string;
            author?: string;
            attribution?: string;
            sourceFamily?: string;
            retrievedAt?: string;
            semanticScore?: number;
            workerScore?: number;
            qualityScore?: number;
            bounds?: [number, number, number];
            dimensions?: [number, number, number];
            triangleCount?: number;
            meshCount?: number;
            materialCount?: number;
            textureCount?: number;
            animationClipCount?: number;
            animationClips?: string[];
            skinCount?: number;
            morphTargetCount?: number;
            intendedRole?: string;
            roleSuitability?: string;
            qualityWarnings?: string[];
            duplicateHash?: string;
            duplicateOkReason?: string;
            postDownloadInspection?: {
              materialCount: number;
              textureCount: number;
              animationClipCount: number;
              skinCount: number;
              morphTargetCount: number;
              warnings: string[];
            };
            rawCatalogMetadata?: Record<string, unknown>;
          };
        };
      }>;
    };
    const entry = manifest.assets.find((assetEntry) => assetEntry.id === "rankedCar");
    expect(entry?.quality).toBe("candidate");
    expect(entry?.role).toBe("vehicle");
    expect(entry?.provenance?.resolveCandidate).toMatchObject({
      catalogId: "catalog:ranked-car",
    });
    expect(entry?.provenance?.resolveCandidate?.scoreTotal).toBeGreaterThan(0);
    expect(entry?.provenance?.resolveCandidate?.reasons?.join("\n")).toContain("source page preserved");
    expect(entry?.provenance?.resolveCandidate).toMatchObject({
      sourcePage: "https://example.test/assets/ranked-car",
      downloadUrl: "https://example.test/ranked.glb",
      license: "CC0-1.0",
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      attribution: "Catalog Author",
      sourceFamily: "hosted-catalog",
      retrievedAt: "2026-06-20T20:00:00.000Z",
      semanticScore: 0.8,
      workerScore: 0.7,
      qualityScore: 0.6,
      bounds: [4, 1.4, 2],
      dimensions: [4, 1.4, 2],
      triangleCount: 32000,
      meshCount: 5,
      materialCount: 2,
      textureCount: 3,
      animationClipCount: 1,
      animationClips: ["idle"],
      skinCount: 1,
      morphTargetCount: 2,
      intendedRole: "vehicle",
      roleSuitability: "Readable vehicle candidate with ranking metadata.",
      qualityWarnings: ["manual review recommended"],
      duplicateHash: "sha256-allowed",
      duplicateOkReason: "same upstream source with corrected metadata",
      rawCatalogMetadata: {
        sourcePage: "https://example.test/assets/ranked-car",
        qualityScore: 0.6,
      },
    });
    expect(entry?.provenance?.resolveCandidate?.postDownloadInspection).toMatchObject({
      materialCount: 1,
      textureCount: 3,
      animationClipCount: 1,
      skinCount: 1,
      morphTargetCount: 2,
      warnings: [],
    });
  });

  it("falls through when post-download inspection contradicts catalog metadata", async () => {
    const projectDir = makeProject();
    const advertisedGeometry = asset({
      id: "catalog:bad",
      title: "Advertised Textured Car",
      url: "https://example.test/bad.glb",
      sourcePage: "https://example.test/bad",
      license: normalizeLicense("CC0", "https://example.test/bad"),
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      bounds: { size: [4, 1.4, 2] },
      materialCount: 3,
      textureCount: 2,
      intendedRole: "vehicle",
      roleSuitability: "Vehicle candidate that claims geometry and materials.",
    });
    const fallback = asset({
      id: "catalog:fallback",
      title: "Fallback Car",
      url: "https://example.test/fallback.glb",
      sourcePage: "https://example.test/fallback",
      license: normalizeLicense("CC0", "https://example.test/fallback"),
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      intendedRole: "vehicle",
      roleSuitability: "Fallback vehicle candidate with durable provenance.",
    });
    const downloaded: string[] = [];

    const report = await runResolve({
      query: "vehicle car",
      name: "car",
      projectDir,
      makeResolver: () => stubResolver([candidate(advertisedGeometry, 100), candidate(fallback, 1)]) as never,
      download: async (url, dest) => {
        downloaded.push(url);
        writeFileSync(dest, minimalGlb());
      },
    });

    expect(report.ok).toBe(true);
    expect(downloaded).toEqual(["https://example.test/bad.glb", "https://example.test/fallback.glb"]);
    expect(report.messages.join("\n")).toContain("post-download inspection blocked candidate");
  });

  it("requires duplicate hash candidates to carry an allowlist explanation", async () => {
    const projectDir = makeProject();
    const duplicate = asset({
      id: "catalog:duplicate",
      title: "Duplicate Car",
      url: "https://example.test/duplicate.glb",
      sourcePage: "https://example.test/duplicate",
      license: normalizeLicense("CC0", "https://example.test/duplicate"),
      duplicateHash: "sha256-deadbeef",
      intendedRole: "vehicle",
      roleSuitability: "Duplicate candidate without explicit allowlist reason.",
    });
    const clean = asset({
      id: "catalog:clean",
      title: "Clean Car",
      url: "https://example.test/clean.glb",
      sourcePage: "https://example.test/clean",
      license: normalizeLicense("CC0", "https://example.test/clean"),
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      intendedRole: "vehicle",
      roleSuitability: "Clean vehicle candidate with durable provenance.",
    });
    const downloaded: string[] = [];

    await runResolve({
      query: "vehicle car",
      name: "car",
      projectDir,
      makeResolver: () => stubResolver([candidate(duplicate, 100), candidate(clean, 1)]) as never,
      download: async (url, dest) => {
        downloaded.push(url);
        writeFileSync(dest, minimalGlb());
      },
    });

    expect(downloaded).toEqual(["https://example.test/clean.glb"]);
  });

  it("penalizes missing material and texture metadata for non-abstract visual roles", () => {
    const score = scoreResolveCandidate(candidate(asset({
      id: "catalog:bare-product",
      title: "Product Shoe",
      url: "https://example.test/shoe.glb",
      sourcePage: "https://example.test/shoe",
      license: normalizeLicense("CC0", "https://example.test/shoe"),
      intendedRole: "product",
      roleSuitability: "Commerce product candidate.",
    })), { query: "product shoe" });

    expect(score.penalties).toEqual(expect.arrayContaining([
      "missing material metadata for visual model role",
      "missing texture metadata for visual model role",
    ]));
  });

  it("ranks durable role-fit metadata above a weak first result", () => {
    const weak = candidate(asset({
      id: "catalog:weak",
      title: "Asset",
      url: "https://example.test/weak.glb",
      license: normalizeLicense("CC0"),
    }), 100);
    const roleFit = candidate(asset({
      id: "catalog:role-fit",
      title: "Sports Car",
      url: "https://example.test/fit.glb",
      sourcePage: "https://example.test/fit",
      license: normalizeLicense("CC0", "https://example.test/fit"),
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      semanticScore: 0.8,
      workerScore: 0.7,
      qualityScore: 0.6,
      intendedRole: "vehicle",
      roleSuitability: "Vehicle candidate that matches the requested role.",
    }), 1);

    const weakScore = scoreResolveCandidate(weak, { query: "sports car vehicle" });
    const roleFitScore = scoreResolveCandidate(roleFit, { query: "sports car vehicle" });
    expect(roleFitScore.total).toBeGreaterThan(weakScore.total);
  });
});

describe("runSearch", () => {
  it("labels candidates by auto-pullability and reports the manual-check note", async () => {
    const cc0 = asset({ id: "os3a:a", title: "CC0 Thing", license: normalizeLicense("CC0") });
    const unverified = asset({ id: "khronos:b", title: "Unknown", license: normalizeLicense(undefined) });
    const report = await runSearch({
      query: "thing",
      makeResolver: () => stubResolver([candidate(cc0, 20), candidate(unverified, 10)]) as never,
    });
    expect(report.profile).toBe("general");
    expect(report.candidates).toHaveLength(2);
    expect(report.rejectedCandidates).toHaveLength(0);
    expect(report.candidates.find((c) => c.id === "os3a:a")?.autoPullable).toBe(true);
    expect(report.candidates.find((c) => c.id === "khronos:b")?.autoPullable).toBe(false);
  });

  it("annotates fighting-character candidates with suitability and rejection reasons", async () => {
    const fighter = asset({
      id: "os3a:fighter",
      title: "Animated Humanoid Fighter",
      tags: ["animated", "humanoid", "fighter"],
      hasAnimations: true,
    });
    const aircraft = asset({
      id: "os3a:aircraft",
      title: "Static Aircraft",
      tags: ["aircraft", "vehicle"],
      hasAnimations: false,
    });

    const report = await runSearch({
      query: "animated humanoid fighter",
      constraints: { profile: "fighting-character" },
      makeResolver: () => stubResolver([candidate(aircraft, 100), candidate(fighter, 10)]) as never,
    });

    expect(report.candidates[0]?.id).toBe("os3a:fighter");
    expect(report.candidates.find((c) => c.id === "os3a:fighter")?.profile?.suitable).toBe(true);
    expect(report.candidates.find((c) => c.id === "os3a:aircraft")).toBeUndefined();
    const rejected = report.rejectedCandidates.find((c) => c.id === "os3a:aircraft");
    expect(rejected?.profile?.suitable).toBe(false);
    expect(rejected?.profile?.rejectionReasons.join("\n")).toContain("marked static");
  });

  it("does not mark unverified or IP-risk animated characters as fighting-character ready", async () => {
    const unverified = asset({
      id: "src:unverified-fighter",
      title: "Animated Humanoid Fighter",
      tags: ["animated", "humanoid", "fighter"],
      hasAnimations: true,
      license: normalizeLicense(undefined),
    });
    const fanAsset = asset({
      id: "src:mario-fighter",
      title: "Mario Fan Art Fighter",
      tags: ["animated", "humanoid", "fighter", "fanart"],
      hasAnimations: true,
    });

    const report = await runSearch({
      query: "animated humanoid fighter",
      constraints: { profile: "fighting-character" },
      makeResolver: () => stubResolver([candidate(unverified, 100), candidate(fanAsset, 90)]) as never,
    });

    expect(report.messages.join("\n")).toContain("No fighting-character-ready candidate");
    expect(report.candidates).toHaveLength(0);
    expect(report.rejectedCandidates.every((c) => c.profile?.suitable === false)).toBe(true);
    expect(report.rejectedCandidates.find((c) => c.id === "src:unverified-fighter")?.profile?.rejectionReasons.join("\n")).toContain("not verified redistributable");
    expect(report.rejectedCandidates.find((c) => c.id === "src:mario-fighter")?.profile?.rejectionReasons.join("\n")).toContain("IP-risk");
  });

  it("surfaces the manual-license-check message when nothing is auto-pullable", async () => {
    const unverified = asset({ id: "khronos:b", license: normalizeLicense(undefined) });
    const report = await runSearch({
      query: "x",
      makeResolver: () => stubResolver([candidate(unverified)]) as never,
    });
    expect(report.messages.some((m) => m.includes("manual license check"))).toBe(true);
  });

  it("filters and annotates animation-character search results by profile suitability", async () => {
    const hero = asset({
      id: "src:hero",
      title: "Stylized Animation Humanoid Hero With Mouth Shapes",
      tags: ["animation", "character", "humanoid", "rigged", "animated", "mouth", "expression"],
      hasAnimations: true,
    });
    const staticChair = asset({
      id: "src:chair",
      title: "Cute Animation Chair Prop",
      tags: ["animation", "prop", "chair"],
      hasAnimations: false,
    });

    const report = await runSearch({
      query: "animation character",
      constraints: { profile: "animation-character" },
      makeResolver: () => stubResolver([candidate(staticChair, 100), candidate(hero, 10)]) as never,
    });

    expect(report.profile).toBe("animation-character");
    expect(report.candidates.map((c) => c.id)).toEqual(["src:hero"]);
    expect(report.candidates[0]?.profile).toMatchObject({ name: "animation-character", suitable: true });
    const rejected = report.rejectedCandidates.find((c) => c.id === "src:chair");
    expect(rejected?.profile?.suitable).toBe(false);
    expect(rejected?.profile?.rejectionReasons.join("\n")).toContain("not character-like");
  });

  it("returns curated starter-pack animation-character results through the CLI search adapter path", async () => {
    const adapters = buildSearchAdapters({}).filter((adapter) => adapter.id === "animation-starter-pack");
    expect(adapters).toHaveLength(1);

    const report = await runSearch({
      query: "animation character",
      constraints: { profile: "animation-character" },
      makeResolver: () => new FederatedResolver({ adapters, limit: 10 }) as never,
    });

    expect(report.profile).toBe("animation-character");
    expect(report.candidates.length).toBeGreaterThanOrEqual(5);
    expect(report.candidates.slice(0, 5).every((candidate) => candidate.id.startsWith("animation-starter:"))).toBe(true);
    expect(report.candidates.slice(0, 5).every((candidate) => candidate.autoPullable && candidate.profile?.suitable)).toBe(true);
  });

  it("refuses animation-profile resolve when the top pullable candidate is unsuitable", async () => {
    const projectDir = makeProject();
    const staticChair = asset({
      id: "src:chair",
      title: "Cute Animation Chair Prop",
      tags: ["animation", "prop", "chair"],
      hasAnimations: false,
    });
    let downloads = 0;

    await expect(
      runResolve({
        query: "animation character",
        name: "hero",
        projectDir,
        constraints: { profile: "animation-character" },
        makeResolver: () => stubResolver([candidate(staticChair)]) as never,
        download: async () => {
          downloads += 1;
        },
      }),
    ).rejects.toThrow(/animation-character profile/i);
    expect(downloads).toBe(0);
  });
});

describe("hosted catalog surfacing (#24/#18)", () => {
  it("buildSearchAdapters wires the hosted aura-index adapter", () => {
    const adapters = buildSearchAdapters({});
    expect(adapters.some((adapter) => adapter.id === "aura-index")).toBe(true);
  });

  it("default (no --license) search surfaces the worker's CC-BY characters", async () => {
    const adapter = createAuraIndexAdapter();
    const report = await runSearch({
      query: "cute robot mascot character",
      makeResolver: () => new FederatedResolver({ adapters: [adapter], fetchJson: workerFetch(), limit: 10 }) as never,
    });
    expect(report.candidates.length).toBeGreaterThanOrEqual(2);
    expect(report.candidates.every((c) => c.license === "CC-BY-4.0")).toBe(true);
    expect(report.candidates.some((c) => c.id === "objaverse:07a6bdfcfde44565a259be970000d2a3")).toBe(true);
  });

  it("--license cc0 deliberately excludes the worker's CC-BY catalog hits", async () => {
    const adapter = createAuraIndexAdapter();
    const report = await runSearch({
      query: "cute robot mascot character",
      constraints: { license: ["CC0"] },
      makeResolver: () => new FederatedResolver({ adapters: [adapter], fetchJson: workerFetch(), limit: 10 }) as never,
    });
    expect(report.candidates).toHaveLength(0);
  });

  it("animation-character search keeps catalog CC-BY characters via pre-download leniency (#20/#23)", async () => {
    const adapter = createAuraIndexAdapter();
    const report = await runSearch({
      query: "cute robot mascot character",
      constraints: { profile: "animation-character" },
      makeResolver: () => new FederatedResolver({ adapters: [adapter], fetchJson: workerFetch(), limit: 10 }) as never,
    });
    // "robot" is a character term; rig/animation metadata is absent but deferred,
    // so the catalog hit stays suitable instead of being hard-rejected.
    const hit = report.candidates.find((c) => c.id === "objaverse:07a6bdfcfde44565a259be970000d2a3");
    expect(hit?.profile?.suitable).toBe(true);
    expect(hit?.profile?.validationHooks).toContain("animation-clips");
    expect(hit?.profile?.validationHooks).toContain("humanoid-rig");
  });
});

describe("animation profile pre-download leniency (#20/#23)", () => {
  const catalogRobot = (): AuraCanonicalAsset =>
    asset({
      id: "objaverse:robot",
      title: "Cute Little Robot",
      tags: ["cute", "little", "robot"],
      license: normalizeLicense("CC-BY-4.0"),
    });

  it("strict mode (post-download) still hard-rejects absent rig/animation metadata", () => {
    const evaluation = evaluateAnimationAssetProfile(catalogRobot(), "animation-character");
    expect(evaluation.suitable).toBe(false);
    expect(evaluation.validationHooks).toHaveLength(0);
  });

  it("pre-download mode defers unknown metadata to validation hooks instead of rejecting", () => {
    const evaluation = evaluateAnimationAssetProfile(catalogRobot(), "animation-character", { preDownload: true });
    expect(evaluation.suitable).toBe(true);
    expect(evaluation.validationHooks).toEqual(
      expect.arrayContaining(["humanoid-rig", "animation-clips", "facial-blendshapes"]),
    );
  });

  it("pre-download mode still rejects a PROVEN-static asset (hasAnimations === false)", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({ id: "x:static", title: "Robot Statue", tags: ["robot"], hasAnimations: false }),
      "animation-character",
      { preDownload: true },
    );
    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("marked static");
  });

  it("rejects an insanely-scaled asset even pre-download", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({ id: "x:huge", title: "Robot Hero", tags: ["robot"], bounds: { size: [80, 2, 2] }, hasAnimations: true }),
      "animation-character",
      { preDownload: true },
    );
    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("implausible");
  });

  it("rejects a known-oversized payload even pre-download", () => {
    const evaluation = evaluateAnimationAssetProfile(
      asset({ id: "x:big", title: "Robot Hero", tags: ["robot"], fileSizeBytes: 200 * 1024 * 1024, hasAnimations: true }),
      "animation-character",
      { preDownload: true },
    );
    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("exceeds");
  });
});

describe("download flow: ZIP unpack + provenance (#21/#19/#26)", () => {
  it("captures sha256 + injected retrievedAt into provenance", async () => {
    const projectDir = makeProject();
    const cc0 = asset({ id: "os3a:bench", title: "Park Bench", url: "https://example.test/Bench.glb", license: normalizeLicense("CC0") });
    const bytes = minimalGlb();
    const expectedSha = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

    await runResolve({
      query: "park bench",
      name: "bench",
      projectDir,
      retrievedAt: "2026-06-07T00:00:00.000Z",
      makeResolver: () => stubResolver([candidate(cc0)]) as never,
      download: async (_url, dest) => {
        writeFileSync(dest, bytes);
      },
    });

    const manifest = JSON.parse(readFileSync(join(projectDir, "aura.assets.json"), "utf8")) as {
      assets: Array<{ id: string; provenance?: { sha256?: string; retrievedAt?: string; attribution?: string } }>;
    };
    const prov = manifest.assets.find((entry) => entry.id === "bench")?.provenance;
    expect(prov?.sha256).toBe(expectedSha);
    expect(prov?.retrievedAt).toBe("2026-06-07T00:00:00.000Z");
  });

  it("resolve uses the downloader's unpacked-path result for the add pipeline", async () => {
    const projectDir = makeProject();
    const cc0 = asset({ id: "pizza:car", title: "Toy Car", url: "https://poly.pizza/download/car.zip", license: normalizeLicense("CC0") });

    const report = await runResolve({
      query: "toy car",
      name: "car",
      projectDir,
      makeResolver: () => stubResolver([candidate(cc0)]) as never,
      // Simulate a ZIP downloader that unpacks and returns the assembled .glb path.
      download: async (_url, dest) => {
        const assembled = join(dirname(dest), "unpacked.glb");
        writeFileSync(assembled, minimalGlb());
        return { path: assembled };
      },
    });
    expect(report.ok).toBe(true);
    expect(report.typedRef).toBe("model(assets.car)");
  });

  it("defaultDownloadFile unpacks a fetched ZIP to its .glb", async () => {
    const projectDir = makeProject();
    const dest = join(projectDir, "model.glb");
    const zip = makeZip([
      { name: "scene.bin", data: Buffer.from("bindata") },
      { name: "model.glb", data: minimalGlb() },
    ]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(zip), { status: 200, headers: { "content-type": "application/zip" } })) as typeof fetch;
    try {
      const result = await defaultDownloadFile("https://poly.pizza/download/x.zip", dest);
      expect(result?.path?.endsWith("model.glb")).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("defaultDownloadFile surfaces a clear error for an auth-gated JSON envelope", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "Authentication required" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      await expect(
        defaultDownloadFile("https://api.sketchfab.com/v3/models/abc/download", join(tmpdir(), "x.glb")),
      ).rejects.toThrow(/JSON envelope|auth/i);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("re-resolving an asset preserves prior hand-authored provenance (#26)", async () => {
    const projectDir = makeProject();
    // Seed an entry with a hand-authored attribution the resolver won't re-supply.
    const seeded = asset({ id: "src:hero", title: "Hero", url: "https://example.test/hero.glb", license: normalizeLicense("CC-BY-4.0"), attribution: "Original Author" });
    await runResolve({
      query: "hero",
      name: "hero",
      projectDir,
      makeResolver: () => stubResolver([candidate(seeded)]) as never,
      download: async (_url, dest) => writeFileSync(dest, minimalGlb()),
    });

    // Re-resolve the SAME name from a source with NO attribution; the prior one
    // must survive the merge.
    const reseed = asset({ id: "src:hero2", title: "Hero", url: "https://example.test/hero2.glb", license: normalizeLicense("CC0") });
    await runResolve({
      query: "hero",
      name: "hero",
      projectDir,
      makeResolver: () => stubResolver([candidate(reseed)]) as never,
      download: async (_url, dest) => writeFileSync(dest, minimalGlb()),
    });

    const manifest = JSON.parse(readFileSync(join(projectDir, "aura.assets.json"), "utf8")) as {
      assets: Array<{ id: string; provenance?: { attribution?: string; license?: string } }>;
    };
    const prov = manifest.assets.find((entry) => entry.id === "hero")?.provenance;
    // license is explicitly re-supplied by resolve (CC0-1.0), attribution is not -> preserved.
    expect(prov?.attribution).toBe("Original Author");
  });
});

describe("aura-index adapter (#24)", () => {
  it("normalizes worker results into auto-pullable CC-BY canonical assets", async () => {
    const adapter = createAuraIndexAdapter();
    const records = await adapter.search({ text: "robot" }, { fetchJson: workerFetch() });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      source: "objaverse",
      access: "direct-download",
      format: "glb",
      attribution: "Paleo Modelist",
    });
    expect(records[0]?.license.spdx).toBe("CC-BY-4.0");
  });

  it("preserves semantic, worker, and quality scores through canonical assets", async () => {
    const adapter = createAuraIndexAdapter();
    const records = await adapter.search({ text: "robot" }, { fetchJson: workerFetch() });
    expect(records[0]).toMatchObject({
      semanticScore: 0.84,
      workerScore: 0.73,
      qualityScore: 0.68,
    });
  });

  it("preserves license/source/author/download metadata from the hosted catalog", async () => {
    const adapter = createAuraIndexAdapter();
    const records = await adapter.search({ text: "robot" }, { fetchJson: workerFetch() });
    expect(records[0]).toMatchObject({
      downloadUrl: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-000/07a6bdfcfde44565a259be970000d2a3.glb",
      sourcePage: "https://objaverse.allenai.org/object/07a6bdfcfde44565a259be970000d2a3",
      licenseName: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      author: "Paleo Modelist",
      sourceFamily: "objaverse",
    });
  });

  it("preserves inspection and role metadata from the hosted catalog", async () => {
    const adapter = createAuraIndexAdapter();
    const records = await adapter.search({ text: "robot" }, { fetchJson: workerFetch() });
    expect(records[0]).toMatchObject({
      bounds: { size: [0.8, 1.6, 0.6] },
      triangleCount: 12000,
      meshCount: 4,
      materialCount: 3,
      textureCount: 2,
      animationClipCount: 2,
      skinCount: 1,
      intendedRole: "character",
      roleSuitability: "Readable mascot character candidate with source metadata.",
    });
  });

  it("returns [] for an empty query without fetching", async () => {
    let fetched = false;
    const adapter = createAuraIndexAdapter();
    const records = await adapter.search({ text: "  " }, { fetchJson: async () => { fetched = true; return {}; } });
    expect(records).toEqual([]);
    expect(fetched).toBe(false);
  });
});

/** Build a tiny ZIP (deflate or stored) the dependency-free reader can parse. */
function makeZip(files: readonly { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  return Buffer.concat([localBlock, centralBlock, eocd]);
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function makeProject(): string {
  const dir = join(tmpdir(), `aura3d-pull-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  return dir;
}

/** A minimal valid single-chunk GLB the addAsset inspector accepts. */
function minimalGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, images: [{ uri: "data:image/png;base64,AA==" }] }), "utf8");
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "utf8");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + padded.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(padded.length, 0);
  chunkHeader.write("JSON", 4, "utf8");
  return Buffer.concat([header, chunkHeader, padded]);
}

/**
 * Deterministic candidate selection (WS2).
 *
 * ## Why these exist
 *
 * `assets resolve` used to always pull the top-ranked candidate. There was no way to reach the
 * 2nd/3rd/Nth result that `assets search` had reported, which made the whole
 * search -> pull -> screen -> select loop impossible to script: resolving three differently-worded
 * "race car" queries returned byte-identical assets. That is the direct reason three unusable hero
 * vehicles shipped in turn -- each replacement was chosen by re-wording a query and hoping.
 *
 * The measured proof that selection now works: pulling indices 0-3 of "race car" and auditing each
 * gave NO-WHEELS, NO-WHEELS, NO-WHEELS, WHEELS-VISIBLE.
 *
 * These tests use the injected resolver and downloader, so they are offline and deterministic and do
 * not depend on a mutable live provider response.
 */
describe("runResolve deterministic candidate selection", () => {
  /** Four distinguishable pullable candidates in a known rank order. */
  function fourCandidates(): readonly ResolveCandidate[] {
    return [
      candidate(asset({ id: "os3a:first", title: "First", url: "https://example.test/first.glb" }), 40),
      candidate(asset({ id: "os3a:second", title: "Second", url: "https://example.test/second.glb" }), 30),
      candidate(asset({ id: "os3a:third", title: "Third", url: "https://example.test/third.glb" }), 20),
      candidate(asset({ id: "os3a:fourth", title: "Fourth", url: "https://example.test/fourth.glb" }), 10),
    ];
  }

  /** Records which URLs were fetched so "which candidate was actually pulled" is observable. */
  function recordingDownload(downloaded: string[]) {
    return async (url: string, dest: string) => {
      downloaded.push(url);
      writeFileSync(dest, minimalGlb());
    };
  }

  it("selects a different candidate for index 0 than for index 3", async () => {
    const first: string[] = [];
    const firstReport = await runResolve({
      query: "race car",
      name: "carIndex0",
      projectDir: makeProject(),
      candidateIndex: 0,
      makeResolver: () => stubResolver(fourCandidates()) as never,
      download: recordingDownload(first),
    });

    const fourth: string[] = [];
    const fourthReport = await runResolve({
      query: "race car",
      name: "carIndex3",
      projectDir: makeProject(),
      candidateIndex: 3,
      makeResolver: () => stubResolver(fourCandidates()) as never,
      download: recordingDownload(fourth),
    });

    expect(firstReport.ok).toBe(true);
    expect(fourthReport.ok).toBe(true);
    expect(first).toEqual(["https://example.test/first.glb"]);
    expect(fourth).toEqual(["https://example.test/fourth.glb"]);
    // The whole point: the two indices are not the same asset.
    expect(first).not.toEqual(fourth);
    expect(firstReport.asset?.id).toBe("os3a:first");
    expect(fourthReport.asset?.id).toBe("os3a:fourth");
  });

  it("selects the exact candidate by id independent of rank", async () => {
    const downloaded: string[] = [];
    const report = await runResolve({
      query: "race car",
      name: "carById",
      projectDir: makeProject(),
      candidateId: "os3a:third",
      makeResolver: () => stubResolver(fourCandidates()) as never,
      download: recordingDownload(downloaded),
    });
    expect(report.ok).toBe(true);
    expect(report.asset?.id).toBe("os3a:third");
    // Only the requested candidate is fetched; the higher-ranked ones are not touched.
    expect(downloaded).toEqual(["https://example.test/third.glb"]);
  });

  it("resolves the same candidate deterministically across repeated runs", async () => {
    const runOnce = async (name: string) => {
      const downloaded: string[] = [];
      const report = await runResolve({
        query: "race car",
        name,
        projectDir: makeProject(),
        candidateId: "os3a:second",
        retrievedAt: "2026-08-01T00:00:00.000Z",
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: recordingDownload(downloaded),
      });
      return { id: report.asset?.id, downloaded };
    };
    const a = await runOnce("carDetA");
    const b = await runOnce("carDetB");
    expect(a).toEqual(b);
    expect(a.id).toBe("os3a:second");
  });

  it("fails loudly on an out-of-range index, without downloading anything", async () => {
    let downloads = 0;
    await expect(
      runResolve({
        query: "race car",
        name: "carOutOfRange",
        projectDir: makeProject(),
        candidateIndex: 9,
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: async () => {
          downloads += 1;
        },
      }),
    ).rejects.toThrow(/--index 9 is out of range; only 4 pullable candidate\(s\)/);
    // A refusal must not have side effects.
    expect(downloads).toBe(0);
  });

  it("fails loudly on a negative or non-integer index", async () => {
    await expect(
      runResolve({
        query: "race car",
        name: "carNegative",
        projectDir: makeProject(),
        candidateIndex: -1,
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: async () => undefined,
      }),
    ).rejects.toThrow(/--index must be a non-negative integer/);

    await expect(
      runResolve({
        query: "race car",
        name: "carFractional",
        projectDir: makeProject(),
        candidateIndex: 1.5,
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: async () => undefined,
      }),
    ).rejects.toThrow(/--index must be a non-negative integer/);
  });

  it("fails loudly on an unknown explicit candidate id, listing what was available", async () => {
    let downloads = 0;
    await expect(
      runResolve({
        query: "race car",
        name: "carUnknownId",
        projectDir: makeProject(),
        candidateId: "objaverse:does-not-exist",
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: async () => {
          downloads += 1;
        },
      }),
    ).rejects.toThrow(/--candidate-id "objaverse:does-not-exist" is not among the 4 pullable candidate\(s\)/);
    expect(downloads).toBe(0);
  });

  it("never silently substitutes another candidate for an explicit id", async () => {
    // The failure mode this guards: falling back to candidate 0 would make a screening loop believe it
    // had tried N distinct assets when it had really tried the same one N times.
    const downloaded: string[] = [];
    await expect(
      runResolve({
        query: "race car",
        name: "carNoFallback",
        projectDir: makeProject(),
        candidateId: "os3a:missing",
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: recordingDownload(downloaded),
      }),
    ).rejects.toThrow(/is not among/);
    expect(downloaded).toEqual([]);
  });

  it("keeps remaining candidates as fallbacks when an indexed pull fails", async () => {
    // `--index` selects a starting point, not an exclusive choice: a download failure on the requested
    // candidate must degrade to the next one rather than aborting, which is how an auth-gated provider
    // (observed: a Sketchfab 401) falls through to a pullable alternative.
    const attempted: string[] = [];
    const report = await runResolve({
      query: "race car",
      name: "carFallback",
      projectDir: makeProject(),
      candidateIndex: 2,
      makeResolver: () => stubResolver(fourCandidates()) as never,
      download: async (url, dest) => {
        attempted.push(url);
        if (url.includes("third")) throw new Error("HTTP 401 Unauthorized");
        writeFileSync(dest, minimalGlb());
      },
    });
    expect(report.ok).toBe(true);
    // Started at index 2, failed, fell through to index 3 -- and never reached indices 0 or 1.
    expect(attempted).toEqual(["https://example.test/third.glb", "https://example.test/fourth.glb"]);
    expect(report.asset?.id).toBe("os3a:fourth");
    // The skip is reported rather than hidden.
    expect(report.warnings.join(" ")).toContain("os3a:third");
  });

  it("retains full provenance for an explicitly selected candidate", async () => {
    const projectDir = makeProject();
    const report = await runResolve({
      query: "race car",
      name: "carProvenance",
      projectDir,
      candidateId: "src:selected",
      makeResolver: () => stubResolver([
        candidate(asset({ id: "os3a:decoy", url: "https://example.test/decoy.glb" }), 90),
        candidate(asset({
          id: "src:selected",
          title: "Selected Car",
          url: "https://example.test/selected.glb",
          license: normalizeLicense("CC-BY-4.0", "https://example.test/selected"),
          attribution: "DJMaesen",
          sourcePage: "https://example.test/selected",
        }), 10),
      ]) as never,
      download: async (_url, dest) => writeFileSync(dest, minimalGlb()),
    });

    expect(report.ok).toBe(true);
    const manifest = JSON.parse(readFileSync(join(projectDir, "aura.assets.json"), "utf8")) as {
      assets: Array<{ id: string; source?: string; provenance?: Record<string, unknown> }>;
    };
    const entry = manifest.assets.find((asset) => asset.id === "carProvenance");
    // `sourceUrl` records the license/source page the candidate declared, not the download URL.
    expect(entry?.provenance).toMatchObject({
      license: "CC-BY-4.0",
      sourceUrl: "https://example.test/selected",
    });
    // Provenance must not point at a deleted temporary directory.
    expect(String(entry?.source ?? "")).not.toContain(tmpdir());
  });

  it("stages the source durably inside the project and generates deterministic typed bindings", async () => {
    const runOnce = async () => {
      const projectDir = makeProject();
      const report = await runResolve({
        query: "race car",
        name: "carStaged",
        projectDir,
        candidateIndex: 1,
        retrievedAt: "2026-08-01T00:00:00.000Z",
        makeResolver: () => stubResolver(fourCandidates()) as never,
        download: async (_url, dest) => writeFileSync(dest, minimalGlb()),
      });
      expect(report.ok).toBe(true);
      const manifest = JSON.parse(readFileSync(join(projectDir, "aura.assets.json"), "utf8")) as {
        assets: Array<{ id: string; outputPath?: string; hash?: string; url?: string }>;
      };
      const entry = manifest.assets.find((asset) => asset.id === "carStaged");
      // Durable, project-relative staging rather than a temp path.
      expect(entry?.outputPath ?? "").not.toContain(tmpdir());
      expect(entry?.outputPath ?? "").toContain("aura-assets");
      const typed = readFileSync(join(projectDir, "src", "aura-assets.ts"), "utf8");
      expect(typed).toContain('"carStaged"');
      return { hash: entry?.hash, url: entry?.url, typed };
    };

    const first = await runOnce();
    const second = await runOnce();
    // Same candidate and same bytes must produce identical hash, url and typegen output.
    expect(second.hash).toBe(first.hash);
    expect(second.url).toBe(first.url);
    expect(second.typed).toBe(first.typed);
  });

  it("preserves top-candidate behaviour when no explicit selection is given", async () => {
    const downloaded: string[] = [];
    const report = await runResolve({
      query: "race car",
      name: "carDefault",
      projectDir: makeProject(),
      makeResolver: () => stubResolver(fourCandidates()) as never,
      download: recordingDownload(downloaded),
    });
    expect(report.ok).toBe(true);
    expect(report.asset?.id).toBe("os3a:first");
    expect(downloaded).toEqual(["https://example.test/first.glb"]);
  });
});
