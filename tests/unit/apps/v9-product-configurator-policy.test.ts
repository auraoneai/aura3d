import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyProductConfiguratorRuntimeMaterialControls,
  explodedProductPartOffset,
  focusPartForProductConfiguratorImportedLabel,
  isGeneratedProductConfiguratorFixtureAssetId,
  isProductConfiguratorOriginalProductAssetId,
  isProductConfiguratorHotspotCandidateLabel,
  isProductConfiguratorProceduralArtifactLabel,
  productConfiguratorImportedMaterialControlPlan,
  productConfiguratorFocusOffset,
  productConfiguratorMaterialOverrideTargetCount
} from "../../../apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy";
import {
  configuredAuthoredAssetIdsForDemo
} from "../../../apps/v9-advanced-examples-gallery/src/authoredLayer";
import {
  getAuthoredAssetCandidate
} from "../../../apps/v9-advanced-examples-gallery/src/authoredAssets";

describe("v9 product configurator policy", () => {
  it("keeps original Product GLB material appearance out of authoredLayer route corrections", () => {
    const authoredLayerSource = readFileSync("apps/v9-advanced-examples-gallery/src/authoredLayer.ts", "utf8");

    expect(authoredLayerSource).not.toContain('assetId === "car-concept"');
    expect(authoredLayerSource).not.toContain('assetId === "chronograph-watch"');
    expect(authoredLayerSource).not.toContain("Paint 2 Carmine");
    expect(authoredLayerSource).not.toContain("Band Carbon Fiber Red");
    expect(authoredLayerSource).not.toContain("Glass Face");
  });

  it("keeps procedural cleanup labels explicit and narrow", () => {
    expect(isProductConfiguratorProceduralArtifactLabel("overhead product strip light")).toBe(true);
    expect(isProductConfiguratorProceduralArtifactLabel("studio reflection streak")).toBe(true);
    expect(isProductConfiguratorProceduralArtifactLabel("body-finish swatch station")).toBe(false);
  });

  it("identifies imported hotspot candidates without accepting arbitrary product labels", () => {
    expect(isProductConfiguratorHotspotCandidateLabel("hotspot target lens-material")).toBe(true);
    expect(isProductConfiguratorHotspotCandidateLabel("material swatch rubber")).toBe(true);
    expect(isProductConfiguratorHotspotCandidateLabel("primary product configurator chassis")).toBe(true);
    expect(isProductConfiguratorHotspotCandidateLabel("floor grid helper")).toBe(false);
  });

  it("maps imported hotspot labels to stable focus parts", () => {
    expect(focusPartForProductConfiguratorImportedLabel("lens-material target")).toBe("lens");
    expect(focusPartForProductConfiguratorImportedLabel("body-finish control")).toBe("body");
    expect(focusPartForProductConfiguratorImportedLabel("sensor-module target")).toBe("sensor");
    expect(focusPartForProductConfiguratorImportedLabel("battery-sled hotspot")).toBe("battery");
    expect(focusPartForProductConfiguratorImportedLabel("ribbed grip shell")).toBe("grip");
    expect(focusPartForProductConfiguratorImportedLabel("mode selector control-dial")).toBe("controls");
    expect(focusPartForProductConfiguratorImportedLabel("unmapped imported node")).toBeUndefined();
  });

  it("pins the active product route to original texture-backed product GLBs", () => {
    const ids = configuredAuthoredAssetIdsForDemo("product-configurator");

    expect(ids).toEqual([
      "chronograph-watch",
      "car-concept",
      "sunglasses-khronos",
      "materials-variants-shoe"
    ]);
    expect(ids.every(isProductConfiguratorOriginalProductAssetId)).toBe(true);
    expect(ids.some(isGeneratedProductConfiguratorFixtureAssetId)).toBe(false);

    expect(getAuthoredAssetCandidate("chronograph-watch").localUrl).toBe("/fixtures/v8/assets/product/chronograph-watch.glb");
    expect(getAuthoredAssetCandidate("car-concept").localUrl).toBe("/fixtures/v8/assets/vehicles/car-concept.glb");
    expect(getAuthoredAssetCandidate("sunglasses-khronos").localUrl).toBe("/fixtures/v8/assets/product/sunglasses-khronos.glb");
    expect(getAuthoredAssetCandidate("materials-variants-shoe").localUrl).toBe("/fixtures/v8/assets/product/materials-variants-shoe.glb");
    expect(getAuthoredAssetCandidate("car-concept").provenance).toMatchObject({
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true
    });
    expect(getAuthoredAssetCandidate("chronograph-watch").provenance).toMatchObject({
      sourceKind: "external-fixture",
      generated: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true
    });
    expect(getAuthoredAssetCandidate("materials-variants-shoe").provenance).toMatchObject({
      sourceKind: "external-fixture",
      generated: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true
    });
    expect(getAuthoredAssetCandidate("sunglasses-khronos").provenance).toMatchObject({
      sourceKind: "external-fixture",
      generated: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true
    });
    expect(isGeneratedProductConfiguratorFixtureAssetId("product-configurator-studio-blender")).toBe(true);
    expect(isGeneratedProductConfiguratorFixtureAssetId("car-concept-batched")).toBe(true);
    expect(getAuthoredAssetCandidate("product-configurator-studio-blender").provenance).toMatchObject({
      sourceKind: "generated-local-fixture",
      manifestPath: "fixtures/v9/assets/product-configurator-studio-blender/manifest.json",
      generated: true,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      generatedNoTexture: true
    });
    expect(getAuthoredAssetCandidate("car-concept-batched").provenance).toMatchObject({
      sourceKind: "generated-derivative",
      manifestPath: "fixtures/v9/assets/product-configurator-car-batched/manifest.json",
      sourceAssetPath: "fixtures/v8/assets/vehicles/car-concept.glb",
      generated: true,
      derivative: true,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: true
    });
  });

  it("keeps product focus offsets route-scoped and predictable", () => {
    expect(productConfiguratorFocusOffset("other-asset", "lens-material target", { focusPart: "lens" })).toEqual([0, 0, 0]);
    expect(productConfiguratorFocusOffset("product-configurator-studio-blender", "lens-material target", { focusPart: "lens" })).toEqual([0, 0.08, -0.16]);
    expect(productConfiguratorFocusOffset("product-configurator-studio-blender", "battery-sled support", { focusPart: "battery" })).toEqual([0.14, -0.04, 0.12]);
    expect(productConfiguratorFocusOffset("car-concept", "BodyHood", { focusPart: "body" })).toEqual([0, 0, 0]);
    expect(productConfiguratorFocusOffset("product-configurator-studio-blender", "unmatched imported node", { focusPart: "controls" })).toEqual([0, 0, 0]);
  });

  it("keeps exploded offsets bounded to asset-specific imported product part names", () => {
    expect(explodedProductPartOffset("product-configurator-studio-blender", "sensor logic board")).toEqual([0, 0.18, 0.28]);
    expect(explodedProductPartOffset("product-configurator-studio-blender", "left ribbed grip")).toEqual([-0.26, 0.06, 0.02]);
    expect(explodedProductPartOffset("product-configurator-studio-blender", "studio floor plinth label")).toEqual([0, 0, 0]);
    expect(explodedProductPartOffset("car-concept", ["BodyDoorLWindow", "BodyDoorLColor1", "BodyUnderside"])).toEqual([-0.1, 0.03, 0.02]);
    expect(explodedProductPartOffset("car-concept", ["BodyHeadlights", "BodyHood", "BodyUnderside"])).toEqual([0, 0.04, -0.1]);
    expect(explodedProductPartOffset("chronograph-watch", "Band Carbon Fiber")).toEqual([0, 0, 0]);
    expect(explodedProductPartOffset("unmatched imported node", "BodyHood")).toEqual([0, 0, 0]);
  });

  it("applies runtime material controls through GLTF render-resource target metadata", () => {
    const carbon = createMaterialTarget("carbon-shell", "deep satin carbon fiber product shell");
    const glass = createMaterialTarget("glass", "smoked sapphire transparent glass");
    const resources = createRenderResources([carbon, glass]);

    expect(productConfiguratorMaterialOverrideTargetCount(resources)).toBe(2);
    applyProductConfiguratorRuntimeMaterialControls("car-concept", resources, { finish: "copper" });
    expect(carbon.material.parameters.get("u_baseColor")).toBeUndefined();

    applyProductConfiguratorRuntimeMaterialControls("product-configurator-studio-blender", resources, { finish: "copper" });

    expect(carbon.material.parameters.get("u_baseColor")).toEqual([0.03, 0.032, 0.032, 1]);
    expect(carbon.material.parameters.get("u_metallic")).toBe(0.22);
    expect(glass.material.parameters.get("u_transmissionFactor")).toBe(0);
    expect(glass.material.parameters.get("u_baseColor")).toEqual([0.055, 0.18, 0.23, 0.34]);
  });

  it("plans imported product material controls from GLTF variant metadata without mutating original asset materials", () => {
    const carPaint = createMaterialTarget("car-paint-carmine", "BodyColor1 Carmine", ["Carmine Candy"]);
    const wheel = createMaterialTarget("car-wheel", "Wheel alloy", []);
    const resources = createRenderResources([carPaint, wheel]);

    const plan = productConfiguratorImportedMaterialControlPlan("car-concept", resources, {
      controlKey: "carVariant",
      selectedVariant: "Carmine Candy"
    });

    expect(plan).toMatchObject({
      assetId: "car-concept",
      controlKey: "carVariant",
      selectedVariant: "Carmine Candy",
      targetCount: 1,
      uniqueMaterialCount: 1,
      usedMetadata: true,
      source: "GLTFRenderResources.materialVariants"
    });
    expect(plan.targetMaterialKeys).toEqual(["car-paint-carmine"]);
    expect(plan.targetSourceMaterials).toEqual(["BodyColor1 Carmine"]);
    expect(carPaint.material.parameters.size).toBe(0);

    const generatedPlan = productConfiguratorImportedMaterialControlPlan("product-configurator-studio-blender", resources, {
      controlKey: "finish",
      selectedVariant: "Carmine Candy"
    });
    expect(generatedPlan).toMatchObject({
      usedMetadata: false,
      source: "not-applicable",
      targetCount: 0
    });
    expect(generatedPlan.limitation).toContain("Generated/support");
  });
});

function createMaterialTarget(
  materialKey: string,
  sourceMaterialName: string,
  variants: readonly string[] = []
) {
  const material = {
    parameters: new Map<string, unknown>(),
    setParameter(name: string, value: unknown): void {
      this.parameters.set(name, value);
    }
  };
  return {
    materialKey,
    sourceMaterialName,
    material,
    materialVariants: variants.map((variant) => ({ variant }))
  };
}

function createRenderResources(targets: ReturnType<typeof createMaterialTarget>[]) {
  return {
    collectMaterialOverrideTargets(options: { readonly sourceMaterialName?: RegExp; readonly variant?: string } = {}) {
      return targets.filter((target) => {
        if (options.sourceMaterialName && !options.sourceMaterialName.test(target.sourceMaterialName)) return false;
        if (options.variant && !target.materialVariants.some((mapping) => mapping.variant === options.variant)) return false;
        return true;
      });
    }
  } as never;
}
