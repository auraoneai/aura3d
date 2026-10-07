import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createJsDelivrMirrorAdapter,
  normalizeLicense,
  scoreAsset,
  SCREENED_HERO_RANK_BONUS,
  type AuraCanonicalAsset,
  type ResolveCandidate,
} from "@aura3d/asset-index";
import {
  createPostDownloadCandidateBlockingWarnings,
  createPreDownloadCandidateBlockingWarnings,
  inferQueryRole,
  rankForProfile,
  resolveAdmissionRole,
  runResolve,
  toResolveConstraints,
} from "../../../packages/aura3d-cli/src/pull-bridge";

/**
 * ASSET-QUALITY BUILD: no-Meshy-key bad-hero gap.
 *
 * A 792-triangle body shell with no wheels modelled (the `showcaseCityVehicle`
 * class) must refuse -- pre-download, post-download, and at role admission --
 * while a measured-good hero still resolves and unproven checks only warn.
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

function stubResolver(candidates: readonly ResolveCandidate[]): { resolve: (query: unknown) => Promise<unknown> } {
  return {
    resolve: async () => ({
      query: { text: "" },
      candidates,
      warnings: [] as string[],
    }),
  };
}

function makeProject(): string {
  const dir = join(tmpdir(), `aura3d-quality-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  return dir;
}

/** A minimal valid single-chunk GLB the addAsset inspector accepts. */
function minimalGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" } }), "utf8");
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

/** Inspection stub for a healthy downloaded hero file. */
function healthyInspection(file: string): Record<string, unknown> {
  return {
    ok: true,
    schema: "aura3d.asset-inspection/1.0",
    file,
    format: "glb",
    sizeBytes: minimalGlb().length,
    bounds: [4.2, 1.4, 1.9],
    boundsMetadata: {
      min: [-2.1, 0.02, -0.95],
      max: [2.1, 1.42, 0.95],
      size: [4.2, 1.4, 1.9],
      center: [0, 0.72, 0],
      maxDimension: 4.2,
      grounded: true,
    },
    materials: ["paint", "glass", "rubber"],
    animations: [],
    textures: ["albedo.png"],
    dependencies: [],
    warnings: [],
    messages: [],
  };
}

describe("resolveAdmissionRole", () => {
  it("maps a vehicle query to hero-vehicle", () => {
    expect(resolveAdmissionRole("low poly race car", "general")).toBe("hero-vehicle");
  });

  it("maps a character query to playable-character", () => {
    expect(resolveAdmissionRole("stylized hero character", "general")).toBe("playable-character");
  });

  it("leaves a non-role query as a general fetch", () => {
    expect(resolveAdmissionRole("pine tree prop", "general")).toBeUndefined();
  });

  it("maps explicit character profiles to playable-character", () => {
    expect(resolveAdmissionRole("fighter", "fighting-character")).toBe("playable-character");
    expect(resolveAdmissionRole("dancer", "animation-character")).toBe("playable-character");
  });

  it("shares one inference with scoring", () => {
    expect(inferQueryRole("race car")).toBe("vehicle");
    expect(inferQueryRole("hero character")).toBe("character");
    expect(inferQueryRole("pine tree")).toBeUndefined();
  });
});

describe("toResolveConstraints with query-role inference", () => {
  it("bounds a vehicle query by the vehicle triangle budget", () => {
    expect(toResolveConstraints({}, true, "low poly race car")).toMatchObject({ maxTriangles: 250_000 });
  });

  it("bounds a character query by the humanoid triangle budget", () => {
    expect(toResolveConstraints({}, true, "stylized hero character")).toMatchObject({ maxTriangles: 150_000 });
  });

  it("leaves a non-role query unfiltered", () => {
    expect(toResolveConstraints({}, true, "pine tree")).toEqual({ redistributableOnly: true });
  });

  it("leaves the no-query call exactly as before", () => {
    expect(toResolveConstraints({}, false)).toEqual({});
  });

  it("lets an explicit caller budget win over the inferred one", () => {
    expect(toResolveConstraints({ maxTriangles: 50_000 }, true, "race car")).toMatchObject({ maxTriangles: 50_000 });
  });

  it("does not touch explicit non-general profiles", () => {
    expect(toResolveConstraints({ profile: "animation-prop" }, true, "race car")).toMatchObject({
      maxTriangles: 100_000,
    });
  });
});

describe("rankForProfile with query-role inference", () => {
  it("ranks the role-matching candidate first for a vehicle query", () => {
    const generic = asset({ id: "a:generic", title: "Race Car Poster", intendedRole: "abstract" });
    const vehicle = asset({ id: "b:vehicle", title: "Race Car Model", intendedRole: "vehicle" });
    const ranked = rankForProfile([candidate(generic, 100), candidate(vehicle, 1)], "general", "race car");
    expect(ranked.map((c) => c.asset.id)).toEqual(["b:vehicle", "a:generic"]);
  });

  it("ranks the role-matching candidate first for a character query", () => {
    const prop = asset({ id: "a:prop", title: "Hero Sword Prop", intendedRole: "weapon" });
    const hero = asset({ id: "b:hero", title: "Hero Character Model", intendedRole: "character" });
    const ranked = rankForProfile([candidate(prop, 100), candidate(hero, 1)], "general", "hero character");
    expect(ranked.map((c) => c.asset.id)).toEqual(["b:hero", "a:prop"]);
  });

  it("preserves catalog order for a non-role query", () => {
    const first = asset({ id: "a:first", title: "Pine" });
    const second = asset({ id: "b:second", title: "Tree" });
    expect(rankForProfile([candidate(first, 100), candidate(second, 1)], "general", "pine tree")).toHaveLength(2);
    expect(rankForProfile([candidate(first, 100), candidate(second, 1)], "general", "pine tree")[0]?.asset.id).toBe(
      "a:first",
    );
  });
});

describe("pre-download provenance quality (Meshy mirror)", () => {
  const shell = () =>
    asset({
      id: "catalog:shell",
      title: "City Vehicle Shell",
      url: "https://example.test/shell.glb",
      license: normalizeLicense("CC0"),
      triangles: 792,
      triangleCount: 792,
      intendedRole: "vehicle",
    });

  it("refuses the 792-triangle vehicle shell class", () => {
    const warnings = createPreDownloadCandidateBlockingWarnings(shell());
    expect(warnings.join("; ")).toContain("792 triangles");
    expect(warnings.join("; ")).toContain("distant-prop shell");
  });

  it("refuses a sub-floor humanoid even when the catalog left the role blank", () => {
    const warnings = createPreDownloadCandidateBlockingWarnings(
      asset({
        id: "catalog:wisp",
        title: "Fighter",
        url: "https://example.test/wisp.glb",
        license: normalizeLicense("CC0"),
        triangles: 500,
      }),
      "fighting-character",
    );
    expect(warnings.join("; ")).toContain("500 triangles");
  });

  it("does not block when the triangle count was never measured", () => {
    expect(createPreDownloadCandidateBlockingWarnings(asset({ id: "catalog:unknown" }))).toEqual([]);
  });

  it("does not block a non-hero role below the hero floor", () => {
    const warnings = createPreDownloadCandidateBlockingWarnings(
      asset({
        id: "catalog:cone",
        title: "Traffic Cone",
        url: "https://example.test/cone.glb",
        license: normalizeLicense("CC0"),
        triangles: 792,
        intendedRole: "prop",
      }),
    );
    expect(warnings).toEqual([]);
  });

  it("refuses degenerate catalog bounds", () => {
    const warnings = createPreDownloadCandidateBlockingWarnings(
      asset({
        id: "catalog:stray",
        title: "Stray Geometry Car",
        url: "https://example.test/stray.glb",
        license: normalizeLicense("CC0"),
        bounds: { size: [2000, 1, 1] },
        intendedRole: "vehicle",
      }),
    );
    expect(warnings.join("; ")).toContain("degenerate");
  });

  it("passes healthy catalog bounds", () => {
    const warnings = createPreDownloadCandidateBlockingWarnings(
      asset({
        id: "catalog:healthy",
        title: "Healthy Car",
        url: "https://example.test/healthy.glb",
        license: normalizeLicense("CC0"),
        triangles: 32000,
        bounds: { size: [4.2, 1.4, 1.9] },
        intendedRole: "vehicle",
      }),
    );
    expect(warnings).toEqual([]);
  });
});

describe("post-download provenance quality (Meshy mirror)", () => {
  it("refuses the 792-triangle shell post-download", () => {
    const warnings = createPostDownloadCandidateBlockingWarnings(
      asset({
        id: "catalog:shell",
        title: "City Vehicle Shell",
        url: "https://example.test/shell.glb",
        license: normalizeLicense("CC0"),
        triangles: 792,
        intendedRole: "vehicle",
      }),
      {
        ok: true,
        schema: "aura3d.asset-inspection/1.0",
        file: "shell.glb",
        format: "glb",
        sizeBytes: 100,
        bounds: [3, 1, 1.5],
        materials: ["body"],
        animations: [],
        textures: [],
        dependencies: [],
        warnings: [],
        messages: [],
      },
      "general",
    );
    expect(warnings.join("; ")).toContain("792 triangles");
  });

  it("refuses degenerate downloaded bounds", () => {
    const warnings = createPostDownloadCandidateBlockingWarnings(
      asset({ id: "catalog:stray", license: normalizeLicense("CC0") }),
      {
        ok: true,
        schema: "aura3d.asset-inspection/1.0",
        file: "stray.glb",
        format: "glb",
        sizeBytes: 100,
        bounds: [2000, 1, 1],
        materials: ["body"],
        animations: [],
        textures: [],
        dependencies: [],
        warnings: [],
        messages: [],
      },
      "general",
    );
    expect(warnings.join("; ")).toContain("degenerate");
  });
});

describe("runResolve role admission (refusal with fallback)", () => {
  function shellCandidate(): AuraCanonicalAsset {
    return asset({
      id: "catalog:shell-792",
      title: "City Vehicle Shell",
      url: "https://example.test/shell.glb",
      downloadUrl: "https://example.test/shell.glb",
      sourcePage: "https://example.test/shell",
      license: normalizeLicense("CC0", "https://example.test/shell"),
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      sourceFamily: "catalog",
      triangles: 792,
      triangleCount: 792,
      bounds: { size: [3, 1, 1.5] },
      meshCount: 1,
      materialCount: 1,
      textureCount: 1,
      intendedRole: "vehicle",
      roleSuitability: "Vehicle candidate with measured shell geometry.",
    });
  }

  function heroCandidate(): AuraCanonicalAsset {
    return asset({
      id: "catalog:hero-car",
      title: "Road Race Car Hero",
      url: "https://example.test/hero.glb",
      downloadUrl: "https://example.test/hero.glb",
      sourcePage: "https://example.test/hero",
      license: normalizeLicense("CC0", "https://example.test/hero"),
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      sourceFamily: "catalog",
      triangles: 32000,
      triangleCount: 32000,
      bounds: { size: [4.2, 1.4, 1.9] },
      meshCount: 6,
      materialCount: 3,
      textureCount: 1,
      intendedRole: "vehicle",
      roleSuitability: "Readable hero vehicle candidate with modeled structure.",
    });
  }

  it("refuses the 792-triangle shell and falls through to the screened hero", async () => {
    const projectDir = makeProject();
    const downloaded: string[] = [];
    const report = await runResolve({
      query: "low poly race car hero",
      name: "heroCar",
      projectDir,
      makeResolver: () => stubResolver([candidate(shellCandidate(), 100), candidate(heroCandidate(), 1)]) as never,
      download: async (url, dest) => {
        downloaded.push(url);
        writeFileSync(dest, minimalGlb());
      },
      inspectAssetFn: (({ file }: { file: string }) => healthyInspection(file)) as never,
    });

    expect(report.ok).toBe(true);
    expect(report.asset?.id).toBe("catalog:hero-car");
    expect(downloaded).toEqual(["https://example.test/hero.glb"]);
    // The refusal reason is retained, not silently discarded.
    expect(report.messages.join("\n")).toContain("catalog:shell-792");
    expect(report.messages.join("\n")).toMatch(/distant-prop shell|triangle-floor|structural floor/);
  });

  it("warns (not blocks) on unproven checks for an otherwise fit hero", async () => {
    const projectDir = makeProject();
    const report = await runResolve({
      query: "road race car",
      name: "heroCar",
      projectDir,
      makeResolver: () => stubResolver([candidate(heroCandidate(), 10)]) as never,
      download: async (_url, dest) => {
        writeFileSync(dest, minimalGlb());
      },
      inspectAssetFn: (({ file }: { file: string }) => healthyInspection(file)) as never,
    });

    expect(report.ok).toBe(true);
    expect(report.asset?.id).toBe("catalog:hero-car");
    // No browser probe ran, so silhouette/rendered checks stay unproven --
    // recorded as warnings on the successful resolve.
    expect(report.warnings.join("\n")).toContain("Admission unproven");
  });

  it("refuses every candidate when all are shells, retaining every reason", async () => {
    const projectDir = makeProject();
    await expect(
      runResolve({
        query: "race car",
        name: "heroCar",
        projectDir,
        makeResolver: () => stubResolver([candidate(shellCandidate(), 100)]) as never,
        download: async (_url, dest) => {
          writeFileSync(dest, minimalGlb());
        },
        inspectAssetFn: (({ file }: { file: string }) => healthyInspection(file)) as never,
      }),
    ).rejects.toThrow(/every auto-pullable candidate failed/);
  });
});

describe("screened-hero ranking (mirror curation)", () => {
  it("boosts a pre-screened hero above an unscreened near match", () => {
    const unscreened = asset({
      id: "mirror:kenney:car-kit:sedan",
      title: "Sedan Car",
      tags: ["sedan", "car", "vehicle"],
    });
    const hero = asset({
      id: "mirror:kenney:car-kit:race-car",
      title: "Race Car",
      tags: ["car"],
      qualityScore: 0.9,
      rawCatalogMetadata: { heroCandidate: true, qualityScore: 0.9 },
    });
    expect(SCREENED_HERO_RANK_BONUS).toBe(12);
    expect(scoreAsset(hero, "race car")).toBeGreaterThan(scoreAsset(unscreened, "race car"));
  });

  it("maps manifest heroCandidates into canonical quality + rawCatalogMetadata", async () => {
    const adapter = createJsDelivrMirrorAdapter({ manifestUrl: "https://example.test/manifest.json" });
    const manifest = {
      schema: "aura3d-cc0-mirror/1",
      cdnBase: "https://cdn.jsdelivr.net/gh/org/repo@main",
      heroCandidates: ["kenney:car-kit:race-car"],
      assets: [
        {
          id: "kenney:car-kit:race-car",
          source: "kenney",
          pack: "car-kit",
          title: "Race Car",
          path: "kenney/car-kit/race-car.glb",
          license: "CC0",
          tags: ["car"],
          triangles: 12000,
        },
        {
          id: "kenney:car-kit:sedan",
          source: "kenney",
          pack: "car-kit",
          title: "Sedan",
          path: "kenney/car-kit/sedan.glb",
          license: "CC0",
          tags: ["car"],
          triangles: 400,
        },
      ],
    };
    const found = await adapter.search(
      { text: "race car", constraints: {} },
      { fetchJson: async () => manifest },
    );
    const hero = found.find((a) => a.id === "kenney:car-kit:race-car");
    const plain = found.find((a) => a.id === "kenney:car-kit:sedan");
    expect(hero?.qualityScore).toBe(0.9);
    expect((hero?.rawCatalogMetadata as Record<string, unknown>)?.["heroCandidate"]).toBe(true);
    expect(plain?.qualityScore).toBeUndefined();
    expect(scoreAsset(hero!, "race car")).toBeGreaterThan(scoreAsset(plain!, "race car"));
  });

  it("resolves to the shortlisted hero over an unscreened keyword match", async () => {
    const projectDir = makeProject();
    const keywordMatch = asset({
      id: "catalog:keyword-sedan",
      title: "Race Car Sedan Exact",
      url: "https://example.test/sedan.glb",
      downloadUrl: "https://example.test/sedan.glb",
      sourcePage: "https://example.test/sedan",
      license: normalizeLicense("CC0", "https://example.test/sedan"),
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Catalog Author",
      sourceFamily: "catalog",
      triangles: 8000,
      triangleCount: 8000,
      bounds: { size: [4, 1.3, 1.8] },
      meshCount: 2,
      materialCount: 1,
      textureCount: 1,
      tags: ["race", "car", "sedan", "vehicle"],
    });
    const shortlisted = asset({
      id: "mirror:kenney:car-kit:race-car",
      title: "Race Car",
      url: "https://example.test/race-car.glb",
      downloadUrl: "https://example.test/race-car.glb",
      sourcePage: "https://example.test/race-car",
      license: normalizeLicense("CC0", "https://example.test/race-car"),
      licenseName: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "kenney",
      sourceFamily: "kenney",
      triangles: 12000,
      triangleCount: 12000,
      bounds: { size: [4.2, 1.4, 1.9] },
      meshCount: 6,
      materialCount: 3,
      textureCount: 1,
      intendedRole: "vehicle",
      roleSuitability: "Screen-admitted hero vehicle with readable structure.",
      qualityScore: 0.9,
      semanticScore: 0.7,
      workerScore: 0.6,
      tags: ["race", "car"],
      rawCatalogMetadata: { heroCandidate: true, qualityScore: 0.9 },
    });
    const downloaded: string[] = [];
    const report = await runResolve({
      query: "race car",
      name: "heroCar",
      projectDir,
      makeResolver: () => stubResolver([candidate(keywordMatch, 50), candidate(shortlisted, 5)]) as never,
      download: async (url, dest) => {
        downloaded.push(url);
        writeFileSync(dest, minimalGlb());
      },
      inspectAssetFn: (({ file }: { file: string }) => healthyInspection(file)) as never,
    });

    expect(report.ok).toBe(true);
    expect(report.asset?.id).toBe("mirror:kenney:car-kit:race-car");
    expect(downloaded).toEqual(["https://example.test/race-car.glb"]);
  });
});
