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
      license: "CC-BY-4.0",
      thumbnail: "https://media.sketchfab.com/x/thumb.jpeg",
      attribution: "Paleo Modelist",
      score: 0.84,
    },
    {
      id: "sketchfab:6aadb75f596742ada2814ad4593f0032",
      title: "cute robot",
      source: "sketchfab",
      url: "https://api.sketchfab.com/v3/models/6aadb75f596742ada2814ad4593f0032/download",
      license: "CC-BY-4.0",
      thumbnail: "https://media.sketchfab.com/y/thumb.jpeg",
      attribution: "Doink",
      score: 0.82,
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
