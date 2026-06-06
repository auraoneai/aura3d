import { describe, expect, it } from "vitest";
import { evaluateGameAssetProfile, normalizeLicense, type AuraCanonicalAsset } from "@aura3d/asset-index";

function asset(partial: Partial<AuraCanonicalAsset> & Pick<AuraCanonicalAsset, "id">): AuraCanonicalAsset {
  return {
    source: partial.source ?? "test",
    title: partial.title ?? "Animated Humanoid Fighter",
    url: partial.url ?? "https://example.test/fighter.glb",
    access: partial.access ?? "direct-download",
    format: partial.format ?? "glb",
    license: partial.license ?? normalizeLicense("CC0"),
    tags: partial.tags ?? ["animated", "humanoid", "fighter"],
    hasAnimations: "hasAnimations" in partial ? partial.hasAnimations : true,
    ...partial,
  };
}

describe("evaluateGameAssetProfile", () => {
  it("accepts animated humanoid GLB candidates for fighting-character", () => {
    const evaluation = evaluateGameAssetProfile(asset({ id: "test:fighter" }), "fighting-character");
    expect(evaluation.suitable).toBe(true);
    expect(evaluation.rejectionReasons).toEqual([]);
    expect(evaluation.scoreBonus).toBeGreaterThan(0);
  });

  it("rejects static non-character candidates with concrete reasons", () => {
    const evaluation = evaluateGameAssetProfile(
      asset({
        id: "test:aircraft",
        title: "Static Sci Fi Aircraft",
        tags: ["aircraft", "vehicle"],
        hasAnimations: false,
      }),
      "fighting-character",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("marked static");
    expect(evaluation.rejectionReasons.join("\n")).toContain("not character-like");
    expect(evaluation.rejectionReasons.join("\n")).toContain("aircraft");
  });

  it("rejects candidates with missing animation metadata instead of treating them as proven fighters", () => {
    const evaluation = evaluateGameAssetProfile(
      asset({ id: "test:unknown-animation", hasAnimations: undefined }),
      "fighting-character",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("missing animation metadata");
  });

  it("rejects unverified or deep-link-only candidates before they look profile-ready", () => {
    const unverified = evaluateGameAssetProfile(
      asset({
        id: "test:license-risk",
        license: normalizeLicense(undefined),
      }),
      "fighting-character",
    );
    const deepLink = evaluateGameAssetProfile(
      asset({
        id: "test:deep-link",
        access: "deep-link-only",
      }),
      "fighting-character",
    );

    expect(unverified.suitable).toBe(false);
    expect(unverified.rejectionReasons.join("\n")).toContain("not verified redistributable");
    expect(deepLink.suitable).toBe(false);
    expect(deepLink.rejectionReasons.join("\n")).toContain("deep-link only");
  });

  it("rejects sculpt and IP-risk metadata for fighting-character searches", () => {
    const sculpt = evaluateGameAssetProfile(
      asset({
        id: "test:sculpt",
        title: "Animated Warrior Sculpture",
        tags: ["animated", "warrior", "sculpture"],
      }),
      "fighting-character",
    );
    const fanAsset = evaluateGameAssetProfile(
      asset({
        id: "test:fan",
        title: "Mario Fan Art Fighter",
        tags: ["animated", "humanoid", "fighter", "fanart"],
      }),
      "fighting-character",
    );

    expect(sculpt.suitable).toBe(false);
    expect(sculpt.rejectionReasons.join("\n")).toContain("sculpt");
    expect(fanAsset.suitable).toBe(false);
    expect(fanAsset.rejectionReasons.join("\n")).toContain("IP-risk");
  });

  it("rejects non-humanoid creature characters even when they are animated", () => {
    const evaluation = evaluateGameAssetProfile(
      asset({
        id: "test:spider-character",
        title: "Spider Animated Character",
        tags: ["animated", "character", "spider"],
        hasAnimations: true,
      }),
      "fighting-character",
    );

    expect(evaluation.suitable).toBe(false);
    expect(evaluation.rejectionReasons.join("\n")).toContain("spider");
  });
});
