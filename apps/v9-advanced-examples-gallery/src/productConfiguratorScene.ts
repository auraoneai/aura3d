import { createEnvironmentStage, createLightingRig, type CollectedLight } from "@galileo3d/rendering";
import { bool, frame, type GalleryState, type Resources, type SceneFrame } from "./sceneBuilderPrimitives";
import { bounds } from "./math";
import {
  PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
  PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
  PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS
} from "./productConfiguratorVisualCleanup";

export function buildProductConfiguratorScene(r: Resources, time: number, state: GalleryState): SceneFrame {
  void r;
  const turntableEnabled = bool(state.controls.turntable, false);
  const lightingControl = String(state.controls.lighting ?? "studio");
  const lightingPreset = lightingControl === "inspection" ? "product-detail" : "product-shot";
  const lightingIntensity = lightingControl === "inspection"
    ? 1.56
    : lightingControl === "environment"
      ? 1.44
      : 1.68;
  const productLighting = createLightingRig({
    preset: lightingPreset,
    intensityScale: lightingIntensity,
    shadows: false
  });
  const productLights = productConfiguratorCarPaintLights(productLighting.collectedLights);
  const stage = createEnvironmentStage({
    preset: "indoor-studio",
    size: 3.55,
    floorY: -0.88,
    studioTone: "product-premium",
    includeStageShell: true,
    includeGroundGrid: false,
    includeStageAccents: false,
    contactGrounding: {
      casterRadius: 0.82,
      receiverDistance: 0.12,
      softness: 0.56,
      opacity: 0.22,
      layerCount: 3,
      anisotropy: 1.72
    },
    timeSeconds: time
  });
  if (!stage.lighting.proceduralMap) {
    throw new Error("Product Configurator studio stage must provide procedural environment lighting.");
  }
  const productEnvironment: SceneFrame["environment"] = {
    color: [0.075, 0.08, 0.088],
    intensity: Math.min(Math.max(stage.lighting.intensity, 0.82), 0.94),
    proceduralMap: productConfiguratorCarPaintEnvironment(stage.lighting.proceduralMap)
  };
	return frame(stage.items, bounds([-1.52, -0.96, -0.94], [1.52, 0.52, 0.96]), productLights, productEnvironment, {
		toneMapping: { operator: "filmic", exposure: 1.26, whitePoint: 1.18, gamma: 2.2 },
    bloom: { threshold: 0.72, intensity: 0.04, radius: 1.2 },
    colorGrade: { contrast: 1.22, saturation: 1.16, vibrance: 0.08, sharpening: 0.08 },
    fxaa: true
  }, [
    ...PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
    turntableEnabled ? "car-concept turntable enabled" : "car-concept turntable paused",
    "route-owned car-only showroom staging around original car hero",
    "route-owned car paint lighting suppresses white cool-rim outline",
    "route-owned car paint environment suppresses blue-gray specular halo",
    "route-owned Product proof uses only the compact showroom catch plane; grids, rails, walls, and prop clutter remain disabled",
    `reusable ${lightingPreset} LightingRig`,
    ...stage.systems
  ], [
    ...PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS,
    "The Product route attenuates and tints the reusable product LightingRig before car rendering because the current texture-backed GLB clearcoat/glass otherwise produces a white silhouette halo in focused PNG evidence.",
    "The Product route overrides the reusable indoor-studio procedural specular map with a bounded neutral showroom map because the default blue-gray product environment creates pale Fresnel shading around the car silhouette.",
    "The Product route keeps the physical stage shell limited to a compact catch plane plus layered contact grounding; floor geometry must not carry Product acceptance or hide low car material quality.",
    productLighting.diagnostics.claimBoundary,
    ...productLighting.diagnostics.disclosures,
    ...stage.limitations
  ], [
    ...PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
    "Car-only showroom staging",
    "Material controls",
    `LightingRig ${lightingPreset}`
  ], 0);
}

function productConfiguratorCarPaintLights(lights: readonly CollectedLight[]): readonly CollectedLight[] {
  return lights.map((light) => {
    const sourceName = light.source.name;
    if (/cool-edge|rim/i.test(sourceName)) {
      return adjustProductLight(light, [0.42, 0.5, 0.62], 0.32);
    }
			if (/warm-edge/i.test(sourceName)) {
				return adjustProductLight(light, [1, 0.72, 0.5], 0.74);
			}
			if (/key/i.test(sourceName)) {
				return adjustProductLight(light, [1, 0.92, 0.82], 1.34);
			}
    if (/fill/i.test(sourceName)) {
      return adjustProductLight(light, [0.5, 0.56, 0.64], 0.84);
    }
    return light;
  });
}

function productConfiguratorCarPaintEnvironment(
  proceduralMap: SceneFrame["environment"]["proceduralMap"]
): SceneFrame["environment"]["proceduralMap"] {
	  return {
	    ...proceduralMap,
	    skyColor: [0.018, 0.021, 0.026],
	    horizonColor: [0.038, 0.042, 0.048],
	    groundColor: [0.018, 0.018, 0.019],
		    specularColor: [0.36, 0.4, 0.46],
				intensity: Math.min(proceduralMap.intensity, 0.68),
				specularIntensity: 0.22
		};
	}

function adjustProductLight(
  light: CollectedLight,
  color: readonly [number, number, number],
  intensityScale: number
): CollectedLight {
  return {
    ...light,
    color,
    intensity: round3(light.intensity * intensityScale)
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
