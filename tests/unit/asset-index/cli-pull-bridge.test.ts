import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FederatedResolver, normalizeLicense, type AuraCanonicalAsset, type ResolveCandidate } from "@aura3d/asset-index";
import {
  buildSearchAdapters,
  runResolve,
  runSearch,
  selectPullable,
  toResolveConstraints,
} from "../../../packages/aura3d-cli/src/pull-bridge";

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

  it("maps cartoon profiles to redistributable GLB constraints", () => {
    expect(toResolveConstraints({ profile: "cartoon-character" }, true)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 160_000,
      animated: true,
      format: "glb",
      redistributableOnly: true,
    });
    expect(toResolveConstraints({ profile: "cartoon-prop" }, true)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 100_000,
      format: "glb",
      redistributableOnly: true,
    });
    expect(toResolveConstraints({ profile: "cartoon-set", animated: true }, false)).toEqual({
      license: ["CC0", "CC-BY"],
      maxTriangles: 350_000,
      animated: true,
      format: "glb",
    });
    expect(toResolveConstraints({ profile: "cartoon-environment" }, true)).toEqual({
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

  it("filters and annotates cartoon-character search results by profile suitability", async () => {
    const hero = asset({
      id: "src:hero",
      title: "Stylized Cartoon Humanoid Hero With Mouth Shapes",
      tags: ["cartoon", "character", "humanoid", "rigged", "animated", "mouth", "expression"],
      hasAnimations: true,
    });
    const staticChair = asset({
      id: "src:chair",
      title: "Cute Cartoon Chair Prop",
      tags: ["cartoon", "prop", "chair"],
      hasAnimations: false,
    });

    const report = await runSearch({
      query: "cartoon character",
      constraints: { profile: "cartoon-character" },
      makeResolver: () => stubResolver([candidate(staticChair, 100), candidate(hero, 10)]) as never,
    });

    expect(report.profile).toBe("cartoon-character");
    expect(report.candidates.map((c) => c.id)).toEqual(["src:hero"]);
    expect(report.candidates[0]?.profile).toMatchObject({ name: "cartoon-character", suitable: true });
    const rejected = report.rejectedCandidates.find((c) => c.id === "src:chair");
    expect(rejected?.profile?.suitable).toBe(false);
    expect(rejected?.profile?.rejectionReasons.join("\n")).toContain("not character-like");
  });

  it("returns curated starter-pack cartoon-character results through the CLI search adapter path", async () => {
    const adapters = buildSearchAdapters({}).filter((adapter) => adapter.id === "cartoon-starter-pack");
    expect(adapters).toHaveLength(1);

    const report = await runSearch({
      query: "cartoon character",
      constraints: { profile: "cartoon-character" },
      makeResolver: () => new FederatedResolver({ adapters, limit: 10 }) as never,
    });

    expect(report.profile).toBe("cartoon-character");
    expect(report.candidates.length).toBeGreaterThanOrEqual(5);
    expect(report.candidates.slice(0, 5).every((candidate) => candidate.id.startsWith("cartoon-starter:"))).toBe(true);
    expect(report.candidates.slice(0, 5).every((candidate) => candidate.autoPullable && candidate.profile?.suitable)).toBe(true);
  });

  it("refuses cartoon-profile resolve when the top pullable candidate is unsuitable", async () => {
    const projectDir = makeProject();
    const staticChair = asset({
      id: "src:chair",
      title: "Cute Cartoon Chair Prop",
      tags: ["cartoon", "prop", "chair"],
      hasAnimations: false,
    });
    let downloads = 0;

    await expect(
      runResolve({
        query: "cartoon character",
        name: "hero",
        projectDir,
        constraints: { profile: "cartoon-character" },
        makeResolver: () => stubResolver([candidate(staticChair)]) as never,
        download: async () => {
          downloads += 1;
        },
      }),
    ).rejects.toThrow(/cartoon-character profile/i);
    expect(downloads).toBe(0);
  });
});

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
