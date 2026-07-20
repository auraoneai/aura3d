import { describe, expect, it } from "vitest";
import {
  validateShowcaseAssetPairComposition,
  type ShowcaseAssetPairCompositionInput
} from "../../../packages/create-aura3d/src/showcase-spec-asset-pair-composition.js";

const CURRENT_HASH = `sha256-${"a".repeat(64)}`;

function passingInput(category: "racing" | "platformer" = "racing"): ShowcaseAssetPairCompositionInput {
  return {
    routeId: `synthetic-${category}`,
    category,
    screenshot: {
      path: `tests/reports/${category}.png`,
      sha256: `sha256-${"b".repeat(64)}`,
      width: 1440,
      height: 900,
      crop: { x: 10, y: 180, width: 1420, height: 660 },
      foregroundBounds: { x: 160, y: 300, width: 720, height: 480 },
      foregroundClipped: false,
      subjectBounds: { x: 650, y: 390, width: 140, height: 145 },
      subjectClipped: false,
      projectedPlaySpaceBounds: { x: 160, y: 360, width: 570, height: 380 },
      projectedContactPoint: { x: 720, y: 540 },
      ...(category === "platformer" ? { projectedSubjectHeight: 150 } : {})
    },
    assets: [
      { id: "hero", manifestHash: CURRENT_HASH, evidenceHash: CURRENT_HASH },
      { id: "world", manifestHash: CURRENT_HASH, evidenceHash: CURRENT_HASH }
    ],
    geometry: {
      report: `tests/reports/${category}-geometry.json`,
      assetId: "world",
      assetHash: CURRENT_HASH,
      source: "asset-mesh-extracted",
      modelAnchorCount: 3
    },
    sceneBinding: {
      assetHash: CURRENT_HASH,
      geometryBinding: category === "racing" ? "track-topology-to-scene-transform" : "playable-surface-to-scene-transform",
      overlay: `tests/reports/${category}.png`,
      averageBindingError: 0.01,
      modelPresentationOffset: { x: 0, y: 0, z: 0 }
    },
    contact: { proven: true, normalizedOffset: 0.02 },
    camera: { mode: "follow", followsSubject: true },
    scale: category === "platformer"
      ? { characterScaleRatio: 0.42, projectedTargetHeight: 150 }
      : {},
    debugGuidesAbsent: true
  };
}

function withInput(
  input: ShowcaseAssetPairCompositionInput,
  patch: Partial<ShowcaseAssetPairCompositionInput>
): ShowcaseAssetPairCompositionInput {
  return { ...input, ...patch };
}

describe("showcase asset-pair composition", () => {
  it("passes a hash-current, visibly bound racing pair", () => {
    const report = validateShowcaseAssetPairComposition(passingInput());
    expect(report.pass).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.checks.map((check) => check.verdict)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
  });

  it("fails a synthetic car that is visibly off road", () => {
    const input = passingInput("racing");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      screenshot: {
        ...input.screenshot,
        subjectBounds: { x: 1100, y: 200, width: 120, height: 100 },
        projectedContactPoint: { x: 720, y: 540 }
      },
      contact: { proven: false, normalizedOffset: 1.8 }
    }));
    expect(report.pass).toBe(false);
    expect(report.blockers).toContain("asset-pair:car-route-not-visibly-bound-to-road-surface");
    expect(report.checks.find((check) => check.id === "binding-overlap")?.verdict).toBe("fail");
    expect(report.checks.find((check) => check.id === "contact")?.verdict).toBe("fail");
  });

  it("accepts a grounded platformer subject whose feet meet a projected surface band", () => {
    const input = passingInput("platformer");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      screenshot: {
        ...input.screenshot,
        subjectBounds: { x: 240, y: 321, width: 109, height: 210 },
        projectedPlaySpaceBounds: { x: 170, y: 548, width: 938, height: 296 },
        projectedContactPoint: { x: 285.264, y: 554.301 },
        projectedSubjectHeight: 210
      },
      scale: { characterScaleRatio: 0.42, projectedTargetHeight: 210 }
    }));
    expect(report.checks.find((check) => check.id === "binding-overlap")?.verdict).toBe("pass");
    expect(report.checks.find((check) => check.id === "contact")?.verdict).toBe("pass");
    expect(report.checks.find((check) => check.id === "scale-contract")?.verdict).toBe("pass");
  });

  it("fails a platformer whose rendered height does not match the projected target", () => {
    const input = passingInput("platformer");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      scale: { characterScaleRatio: 0.42, projectedTargetHeight: 260 }
    }));
    expect(report.checks.find((check) => check.id === "scale-contract")?.verdict).toBe("fail");
    expect(report.blockers).toContain("asset-pair:character-world-scale-and-art-direction-not-public-quality");
  });

  it("fails a synthetic floating platformer character", () => {
    const input = passingInput("platformer");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      screenshot: {
        ...input.screenshot,
        subjectBounds: { x: 650, y: 210, width: 140, height: 145 },
        projectedContactPoint: { x: 720, y: 540 }
      },
      contact: { proven: false, normalizedOffset: 0.8 }
    }));
    expect(report.pass).toBe(false);
    expect(report.blockers).toContain("asset-pair:character-foot-contact-not-visibly-bound-to-platform-surface");
    expect(report.checks.find((check) => check.id === "contact")?.verdict).toBe("fail");
  });

  it("selects a readable top-down racing camera from composition evidence", () => {
    const input = passingInput("racing");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      camera: { mode: "overview", followsSubject: false }
    }));
    const cameraCheck = report.checks.find((check) => check.id === "camera-readability");
    expect(report.pass).toBe(true);
    expect(cameraCheck).toMatchObject({ verdict: "pass", measured: { selectedMode: "top-down" } });
  });

  it("fails a clipped proof-harness camera", () => {
    const input = passingInput("racing");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      screenshot: {
        ...input.screenshot,
        foregroundClipped: true,
        projectedPlaySpaceBounds: { x: 10, y: 180, width: 1410, height: 650 }
      },
      camera: { mode: "perspective", followsSubject: false }
    }));
    expect(report.pass).toBe(false);
    expect(report.blockers).toContain("asset-pair:track-camera-composition-reads-as-proof-harness");
    expect(report.checks.find((check) => check.id === "camera-readability")?.verdict).toBe("fail");
  });


  it("accepts mesh-extracted bindings without a separately authored overlay", () => {
    const input = passingInput("racing");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      sceneBinding: { ...input.sceneBinding, overlay: "" }
    }));
    expect(report.pass).toBe(true);
    expect(report.checks.find((check) => check.id === "binding-overlap")?.measured.overlayMatches).toBe(true);
  });

  it("requires an exact screenshot overlay for non-mesh geometry", () => {
    const input = passingInput("racing");
    const report = validateShowcaseAssetPairComposition(withInput(input, {
      geometry: { ...input.geometry, source: "manifest-authored-overlay-validated" },
      sceneBinding: { ...input.sceneBinding, overlay: "" }
    }));
    expect(report.pass).toBe(false);
    expect(report.blockers).toContain("asset-pair:car-route-not-visibly-bound-to-road-surface");
  });

  it("fails a stale screenshot hash with a specific blocker", () => {
    const report = validateShowcaseAssetPairComposition(withInput(passingInput(), {
      freshnessFailures: ["asset-pair:stale-screenshot-hash"]
    }));
    expect(report.pass).toBe(false);
    expect(report.blockers).toContain("asset-pair:stale-screenshot-hash");
  });

  it("fails a stale manifest hash with a specific blocker", () => {
    const report = validateShowcaseAssetPairComposition(withInput(passingInput(), {
      freshnessFailures: ["asset-pair:stale-manifest-hash:world"]
    }));
    expect(report.pass).toBe(false);
    expect(report.blockers).toContain("asset-pair:stale-manifest-hash:world");
  });
});
