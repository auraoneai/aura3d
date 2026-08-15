import { describe, expect, it } from "vitest";
import {
  applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections,
  productConfiguratorFocusOffset
} from "../../../apps/advanced-examples-gallery/src/productConfiguratorPolicy";
import { createProductConfiguratorShowroomLighting } from "../../../apps/advanced-examples-gallery/src/productConfiguratorLighting";
import { applyGalleryRouteCameraPolicy } from "../../../apps/advanced-examples-gallery/src/galleryRoutePolicies";
import { DEMOS } from "../../../apps/advanced-examples-gallery/src/metadata";
import { resolveCarConceptPaintVariant } from "../../../packages/assets/src/CarConceptMaterialStability";

function createMaterial(name: string) {
  const parameters = new Map<string, unknown>();
  return {
    name,
    parameters,
    setParameter(key: string, value: unknown) {
      parameters.set(key, value);
    },
    getParameter(key: string) {
      return parameters.get(key);
    }
  };
}

function paintColor(materialName: string, nodeName: string): readonly number[] {
  const material = createMaterial(materialName);
  applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(material as never, {
    nodeName,
    geometryKey: nodeName,
    materialKey: materialName,
    sourceMaterialName: materialName
  });
  return material.parameters.get("u_baseColor") as readonly number[];
}

function cameraInput(focusPart: string) {
  return {
    demoId: "product-configurator" as const,
    cameraPreset: "hero",
    time: 10,
    frameCount: 0,
    controls: { focusPart },
    authored: { status: "ready", drawItems: 8 } as never,
    sceneBounds: { min: [-1, -1, -1] as const, max: [1, 1, 1] as const },
    yawRadians: 0.4,
    pitchRadians: -0.2,
    paddingRatio: 0.1
  };
}

describe("product configurator variant and control bindings", () => {
  it("resolves Carmine, Pearly, and Graphite as distinct paint variants", () => {
    expect(resolveCarConceptPaintVariant("Paint 1 Carmine BodyHood")).toBe("carmine");
    expect(resolveCarConceptPaintVariant("Paint 1 Pearly Swirly")).toBe("pearly");
    expect(resolveCarConceptPaintVariant("Paint 1 Graphite")).toBe("graphite");
  });

  it("renders clearly distinguishable body-paint colors for each car variant", () => {
    const carmine = paintColor("Paint 1 Carmine", "BodyHood");
    const pearly = paintColor("Paint 1 Pearly", "BodyHood");
    const graphite = paintColor("Paint 1 Graphite", "BodyHood");
    expect(carmine[0]).toBeGreaterThan(0.5);
    expect(carmine[1]!).toBeLessThan(0.05);
    expect(pearly[0]).toBeGreaterThan(0.7);
    expect(pearly[1]!).toBeGreaterThan(0.6);
    expect(graphite[0]).toBeLessThan(0.2);
    expect(graphite[1]!).toBeGreaterThan(0.08);
    expect(carmine).not.toEqual(pearly);
    expect(carmine).not.toEqual(graphite);
    expect(pearly).not.toEqual(graphite);
  });

  it("creates three distinct lighting presets from the shipped lighting control", () => {
    const studio = createProductConfiguratorShowroomLighting("studio");
    const environment = createProductConfiguratorShowroomLighting("environment");
    const inspection = createProductConfiguratorShowroomLighting("inspection");
    expect(studio.preset).toBe("production-runtime-product-studio");
    expect(environment.preset).toBe("production-runtime-environment-studio");
    expect(inspection.preset).toBe("production-runtime-inspection-studio");
    expect(studio.collectedLights[0]?.color).not.toEqual(environment.collectedLights[0]?.color);
    expect(studio.collectedLights[0]?.intensity).not.toBe(inspection.collectedLights[0]?.intensity);
  });

  it("moves authored car parts when a hotspot is selected", () => {
    expect(productConfiguratorFocusOffset("car-concept", "BodyHood", { focusPart: "overview" })).toEqual([0, 0, 0]);
    expect(productConfiguratorFocusOffset("car-concept", "BodyHood", { focusPart: "body" })).toEqual([0, 0.08, 0]);
    expect(productConfiguratorFocusOffset("car-concept", "WheelFrontL", { focusPart: "wheels" })[0]).toBeLessThan(0);
    expect(productConfiguratorFocusOffset("car-concept", "Dashboard", { focusPart: "interior" })[1]).toBeGreaterThan(0);
    expect(productConfiguratorFocusOffset("car-concept", "BodyHeadlights", { focusPart: "lights" })[2]).toBeLessThan(0);
  });

  it("changes camera framing when the hotspot selector changes", () => {
    const overview = applyGalleryRouteCameraPolicy(cameraInput("overview"));
    const wheels = applyGalleryRouteCameraPolicy(cameraInput("wheels"));
    const interior = applyGalleryRouteCameraPolicy(cameraInput("interior"));
    expect(wheels.pitchRadians).not.toBeCloseTo(overview.pitchRadians, 6);
    expect(interior.yawRadians).not.toBeCloseTo(overview.yawRadians, 6);
  });

  it("keeps public dropdown options synchronized with the shipped variant names", () => {
    const product = DEMOS.find((demo) => demo.id === "product-configurator");
    expect(product).toBeDefined();
    const variant = product!.controls.find((control) => control.key === "carVariant");
    const hotspot = product!.controls.find((control) => control.key === "focusPart");
    const lighting = product!.controls.find((control) => control.key === "lighting");
    expect(variant?.options).toEqual(["Carmine Candy", "Pearly Swirly", "Torched Graphite"]);
    expect(hotspot?.options).toEqual(["overview", "body", "wheels", "interior", "lights"]);
    expect(lighting?.options).toEqual(["studio", "environment", "inspection"]);
  });
});
