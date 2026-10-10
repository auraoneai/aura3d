import { describe, expect, it } from "vitest";
import {
  THREE_BROKEN_CONTROL_IDS,
  isThreeVariant,
  variantDprScale,
  variantAntialias,
  variantToneMapped,
  applyVariantSpec
} from "../../../../benchmarks/quality-rebuild/three/lib/variants";
import {
  AURA_EXPRESSIBLE_VARIANTS,
  auraVariantExpressible,
  applyVariantSpec as applyAuraVariantSpec,
  NotExpressibleVariantError
} from "../../../../benchmarks/quality-rebuild/aura3d/lib/variants";
import { REF_SCENES } from "../../../../benchmarks/quality-rebuild/scenes/prd12/ref-scenes";
import { REGISTRY } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { readFileSync } from "node:fs";
import type { SceneSpec } from "../../../../benchmarks/quality-rebuild/shared/types";

const spec = REF_SCENES[0];

describe("prd12 variants", () => {
  it("three engine marks every broken control as a variant; aura marks only expressible ones", () => {
    for (const id of THREE_BROKEN_CONTROL_IDS) {
      expect(isThreeVariant(id), id).toBe(true);
    }
    for (const expressible of AURA_EXPRESSIBLE_VARIANTS) {
      expect(auraVariantExpressible(expressible), expressible).toBe(true);
    }
  });

  it("spec-level variants transform the spec; unexpressible ones throw on aura", () => {
    const noShadows = applyVariantSpec(spec, "no-shadows") as SceneSpec;
    for (const light of noShadows.lights) {
      if ("castShadow" in light) expect((light as { castShadow?: boolean }).castShadow).toBe(false);
    }
    const noIbl = applyVariantSpec(spec, "no-ibl") as SceneSpec;
    expect(noIbl.environment?.intensity ?? 0).toBe(0);
    const flatSky = applyVariantSpec(spec, "flat-sky") as SceneSpec;
    expect(flatSky.background.kind).toBe("color");
    expect(() => applyAuraVariantSpec(spec, "no-aa")).toThrow(NotExpressibleVariantError);
    expect(() => applyAuraVariantSpec(spec, "albedo-only")).toThrow(NotExpressibleVariantError);
    expect(applyAuraVariantSpec(spec, "no-shadows").lights).toBeDefined();
  });

  it("variant helpers map to capture-level knobs", () => {
    expect(variantDprScale("dpr-half")).toBeCloseTo(0.5);
    expect(variantDprScale("base")).toBe(1);
    expect(variantAntialias("no-aa")).toBe(false);
    expect(variantAntialias("base")).toBe(true);
    expect(variantToneMapped("no-tonemap")).toBe(false);
    expect(variantToneMapped("base")).toBe(true);
  });
});

describe("prd12 ref scenes", () => {
  it("registers all six ref scenes active so calibration can capture them", () => {
    expect(REF_SCENES).toHaveLength(6);
    for (const spec of REF_SCENES) {
      expect(spec.owner).toBe("prd12");
      expect(spec.referenceProfile).toBe("showcase");
      expect(spec.brokenControls).toHaveLength(7);
      expect(spec.showcase?.assetTier).toBe("stand-in");
      const entry = REGISTRY.find((r) => r.id === spec.id);
      expect(entry, spec.id).toBeDefined();
      expect(entry!.status ?? "active").toBe("active");
    }
  });

  it("showcase scenes require masks and a primary criterion", () => {
    for (const spec of REF_SCENES) {
      expect(spec.masks, spec.id).toBeDefined();
      expect(spec.masks!.length).toBeGreaterThanOrEqual(4);
      expect(spec.primaryCriterion).toBeTruthy();
      expect(spec.primaryRegion).toBeTruthy();
    }
  });
});

describe("prd12 games overlay", () => {
  const overlay = JSON.parse(readFileSync("tools/quality-rebuild-capture/games.prd12.json", "utf8"));
  const games = JSON.parse(readFileSync("tools/quality-rebuild-capture/games.json", "utf8"));
  it("covers every game with scenarios + hud selectors", () => {
    expect(overlay.games).toHaveLength(games.games.length);
    for (const entry of overlay.games) {
      expect(entry.scenarios.length, entry.id).toBeGreaterThanOrEqual(3);
      expect(entry.hudSelectors.length, entry.id).toBeGreaterThanOrEqual(3);
      expect(entry.titleDeterministic).toBeNull();
    }
  });
});
