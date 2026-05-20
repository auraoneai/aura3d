import type { CameraFrameBounds, EnvironmentLightingCompositionOptions, RendererPostProcessOptions, RenderItem } from "@galileo3d/rendering";
import type { AuthoredAssetRuntimeState } from "./authoredLayer";
import type { ControlValues, SceneFrame } from "./sceneBuilderPrimitives";
import type { DemoDefinition } from "./metadata";
import { createProductConfiguratorShowcaseLayout } from "./productConfiguratorPolicy";

const PRODUCT_CONFIGURATOR_SHOWCASE_LAYOUT = createProductConfiguratorShowcaseLayout();

export interface GalleryRouteCameraPolicyInput {
  readonly demoId: DemoDefinition["id"];
  readonly cameraPreset: string;
  readonly time: number;
  readonly frameCount: number;
  readonly controls: ControlValues;
  readonly authored: AuthoredAssetRuntimeState;
  readonly sceneBounds: CameraFrameBounds;
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly paddingRatio: number;
}

export interface GalleryRouteCameraPolicy {
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly paddingRatio: number;
  readonly bounds: CameraFrameBounds;
}

export function applyGalleryRouteCameraPolicy(input: GalleryRouteCameraPolicyInput): GalleryRouteCameraPolicy {
  let yawRadians = input.yawRadians;
  let pitchRadians = input.pitchRadians;
  let paddingRatio = input.paddingRatio;
  let bounds = input.sceneBounds;
  const authoredReady = input.authored.status === "ready";

  if (input.demoId === "smart-city" && input.controls.fly === true) {
    yawRadians += Math.sin(input.time * 0.22) * 0.34;
    pitchRadians = -0.3 + Math.sin(input.time * 0.17) * 0.08;
    paddingRatio = input.cameraPreset === "wide" ? 0.24 : 0.1;
  }
  if (input.demoId === "water-lab" && input.cameraPreset === "hero") {
    yawRadians = 0.22 + Math.sin(input.time * 0.18) * 0.025;
    pitchRadians = -0.2;
    paddingRatio = 0.048;
  }
  if (input.demoId === "ocean-observatory" && input.cameraPreset === "hero") {
    yawRadians = -0.48 + Math.sin(input.time * 0.12) * 0.018;
    pitchRadians = -0.24;
    paddingRatio = 0.038;
  }
  if (input.demoId === "reactor-post" && input.cameraPreset === "hero") {
    yawRadians = 2.46 + Math.sin(input.frameCount * 0.08) * 0.018;
    pitchRadians = -0.28 + Math.cos(input.frameCount * 0.06) * 0.008;
    paddingRatio = 0.006;
  }
  if (input.demoId === "product-configurator" && input.cameraPreset === "hero") {
    yawRadians = -0.5 + Math.sin(input.time * 0.18) * 0.006;
    pitchRadians = -0.13 + Math.cos(input.time * 0.16) * 0.004;
    paddingRatio = PRODUCT_CONFIGURATOR_SHOWCASE_LAYOUT.frame.heroPaddingRatio;
  }
  if (input.demoId === "data-galaxy" && input.cameraPreset === "hero") {
    yawRadians = -0.22 + Math.sin(input.time * 0.12) * 0.006;
    pitchRadians = -0.12;
    paddingRatio = 0.014;
  }
  if (input.demoId === "smart-city" && input.cameraPreset === "hero") {
    yawRadians = -0.72;
    pitchRadians = -0.21;
    paddingRatio = 0.045;
  }
  if (input.demoId === "robotics-lab" && input.cameraPreset === "hero") {
    yawRadians = -0.24 + Math.sin(input.time * 0.28) * 0.006;
    pitchRadians = -0.14;
    paddingRatio = 0.006;
  }
  if (input.demoId === "physics-playground" && input.cameraPreset === "hero") {
    yawRadians = -0.28 + Math.sin(input.time * 0.2) * 0.018;
    pitchRadians = -0.31;
    paddingRatio = 0.058;
  }
  if (input.demoId === "digital-twin" && input.cameraPreset === "hero") {
    yawRadians = -0.68 + Math.sin(input.time * 0.16) * 0.012;
    pitchRadians = -0.66;
    paddingRatio = 0.055;
  }

  if (input.demoId === "ocean-observatory" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-6.2, -1.0, -5.2], max: [6.2, 3.1, 3.75] };
  }
  if (input.demoId === "product-configurator" && input.cameraPreset === "hero" && authoredReady) {
    bounds = {
      min: PRODUCT_CONFIGURATOR_SHOWCASE_LAYOUT.frame.boundsMin,
      max: PRODUCT_CONFIGURATOR_SHOWCASE_LAYOUT.frame.boundsMax
    };
  }
  if (input.demoId === "data-galaxy" && input.cameraPreset === "hero") {
    bounds = { min: [-0.32, -0.3, -0.3], max: [0.34, 0.38, 0.34] };
  }
  if (input.demoId === "reactor-post" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-2.82, -0.6, -2.88], max: [2.82, 2.32, 2.16] };
  }
  if (input.demoId === "physics-playground" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-4.2, -0.88, -2.18], max: [4.45, 1.85, 2.12] };
  }
  if (input.demoId === "digital-twin" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-4.85, -0.74, -2.35], max: [4.75, 2.15, 2.45] };
  }
  if (input.demoId === "robotics-lab" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-0.98, -0.66, -0.82], max: [2.02, 1.9, 1.26] };
  }
  if (input.demoId === "fog-cathedral" && input.cameraPreset === "hero") {
    yawRadians = -1.88;
    pitchRadians = -0.32;
    paddingRatio = 0.015;
    if (authoredReady && input.authored.drawItems > 0) {
      yawRadians = -0.72 + Math.sin(input.time * 0.18) * 0.01;
      pitchRadians = -0.24;
      paddingRatio = 0.012;
      bounds = { min: [-2.65, -0.82, -3.35], max: [2.65, 2.42, 1.45] };
    }
  }

  return { yawRadians, pitchRadians, paddingRatio, bounds };
}

export function applyGalleryRoutePostprocessPolicy(
  demoId: DemoDefinition["id"],
  value: RendererPostProcessOptions | false,
  controls: ControlValues
): RendererPostProcessOptions | false {
  if (value === false) return false;
  if (demoId === "product-configurator") {
    return {
      ...value,
      bloom: false,
      fxaa: boundedGalleryFxaa(value.fxaa, { edgeThreshold: 0.1, subpixelBlend: 0.24 })
    };
  }
  if (demoId === "data-galaxy") {
    return {
      ...value,
      bloom: false,
      fxaa: boundedGalleryFxaa(value.fxaa, { edgeThreshold: 0.11, subpixelBlend: 0.2 })
    };
  }
  if (demoId !== "reactor-post") return false;
  if (controls.bloom !== true) return { ...value, targetFormat: "rgba8", bloom: false };
  return { ...value, bloom: value.bloom };
}

export function rendererEnvironmentLightingCompositionOptionsForRoute(
  demoId: DemoDefinition["id"]
): EnvironmentLightingCompositionOptions {
  if (demoId !== "product-configurator") return {};
  return {
    minimumEnvironmentMapIntensity: 0.78,
    minimumEnvironmentMapSpecularIntensity: 0.76
  };
}

function boundedGalleryFxaa(
  value: RendererPostProcessOptions["fxaa"],
  fallback: Exclude<RendererPostProcessOptions["fxaa"], boolean | undefined>
): RendererPostProcessOptions["fxaa"] {
  return value === true || value === undefined ? fallback : value;
}

export function visibleProceduralItemsForRoute(
  scene: SceneFrame,
  demoId: DemoDefinition["id"],
  authored: AuthoredAssetRuntimeState
): SceneFrame["items"] {
  if (authored.status !== "ready" || authored.drawItems === 0) return scene.items;
  if (demoId === "product-configurator") {
    return filterByLabel(scene.items, productConfiguratorStageLabel);
  }
  if (demoId === "water-lab") {
    return filterByLabel(scene.items, (label) => label === "continuous animated water mesh"
      || label === "buoy"
      || label === "dock lights"
      || label === "marina cable lights"
      || label === "small boat hull"
      || label === "boat canopy"
      || label === "small boat mast"
      || label === "small boat sail"
      || label === "shore rocks"
      || label === "measured water foam crest"
      || label === "wave normal debug");
  }
  if (demoId === "ocean-observatory") {
    return filterByLabel(scene.items, (label) => label === "continuous multi-frequency ocean mesh"
      || label === "low sun reflection streak"
      || label === "subtle foam crest"
      || label === "patrol drone"
      || label === "drone navigation glint");
  }
  if (demoId === "reactor-post") {
    return filterByLabel(scene.items, (label) => label === "energy ring"
      || label === "reactor core"
      || label === "reactor strut"
      || label === "rear holographic panel"
      || label === "reactor luminous command wall"
      || label === "reactor visible sweep arm"
      || label === "reactor visible pulse marker"
      || label === "etched command floor circuit"
      || label === "reactor purposeful floor etch batch"
      || label === "reactor postprocess evidence line batch"
      || label === "reactor scanline shard"
      || label === "reactor crown telemetry marker"
      || label === "particle halo"
      || label === "reactor telemetry mote");
  }
  if (demoId === "digital-twin") {
    return scene.items.filter((item, index) => {
      const label = itemLabel(item);
      return label.includes("floor")
        || label.includes("sensor")
        || label.includes("heatmap")
        || label.includes("package")
        || label.includes("safety")
        || label.includes("mobile robot")
        || label.includes("enterprise")
        || label.includes("zone health")
        || label.includes("amr")
        || label.includes("operator status")
        || label.includes("robot cell health")
        || label.includes("robot takt")
        || label.includes("digital twin timeline")
        || label.includes("factory event log")
        || label.includes("qa inspection")
        || label.includes("robot inspection")
        || (index % 6 === 0 && !label.includes("package"));
    });
  }
  if (demoId === "robotics-lab") {
    const authoredReady = authored.status === "ready" && authored.drawItems > 0;
    return filterByLabel(scene.items, (label) => label === "lab floor"
      || (!authoredReady && label === "workstation")
      || (!authoredReady && label === "monitor glass")
      || (!authoredReady && label === "lab monitor")
      || label === "safety zone"
      || label === "character stage pad"
      || label.includes("animation stage")
      || label === "animation state gate"
      || label === "animation state token"
      || label === "character tracking beacon"
      || label === "animated training scanline"
      || label.includes("floor fine detail")
      || label.includes("stage bolt detail")
      || label.includes("workstation waveform")
      || label.includes("workstation status pixel")
      || label.includes("grounding reticle")
      || label.includes("entity label")
      || label.includes("timeline console")
      || label.includes("control indicator")
      || label.includes("foot contact")
      || label.includes("clip switch")
      || label.includes("follow camera")
      || (!authoredReady && label === "workstation cable trace")
      || label.includes("robotics")
      || label.includes("timeline")
      || label.includes("clip-state")
      || label.includes("motion trail")
      || label.includes("pose delta")
      || label.includes("selected actor")
      || label.includes("selected robot")
      || label.includes("calibration beacon")
      || label.includes("skeleton"));
  }
  if (demoId === "physics-playground") {
    return filterByLabel(scene.items, (label) => label === "testbed floor"
      || label === "ramp"
      || label === "conveyor belt"
      || label === "conveyor lane rail"
      || label === "conveyor tick"
      || label === "target bin sidewall"
      || label === "target bin backwall"
      || label === "target scoring zone"
      || label === "live bin load meter"
      || label === "bin measurement rail"
      || label === "physics object"
      || label === "tracked object velocity vector"
      || label === "active contact normal marker"
      || label === "runtime primitive ramp proxy"
      || label === "deterministic reset fingerprint bar"
      || label === "physics kinematic pusher collider"
      || label === "pusher sweep lane"
      || label === "pusher contact face"
      || label === "actual pusher contact spark"
      || label === "live physics contact meter"
      || label === "live pusher contact meter"
      || label.includes("pusher robot"));
  }
  if (demoId === "fog-cathedral") {
    return scene.items.filter((item, index) => {
      const label = itemLabel(item);
      return label === "atmospheric depth haze"
        || label === "layered atmospheric depth haze"
        || label === "foreground midground background haze lobes"
        || label === "foreground crop mask columns"
        || label === "aperture-local shaft proxy"
        || label === "cathedral floor seam detail"
        || label === "cathedral rib tracery detail"
        || label === "stained glass color shard"
        || label === "cathedral apse shadow relief"
        || label === "fog edge occlusion"
        || label === "fog edge occlusion columns"
        || label === "soft light shaft"
        || label === "batched dust mote"
        || label === "batched dust evidence field"
        || label === "distant aperture glow"
        || label === "depth-readable capital glint"
        || label === "cathedral exposure guide"
        || (label === "particle mote" && index % 7 === 0);
    });
  }
  if (demoId === "smart-city") {
    return filterByLabel(scene.items, (label) => label === "instanced district tower"
      || label === "selected district highlight"
      || label === "traffic vehicles"
      || label === "district light rail trail"
      || label === "district light rail car"
      || label === "aerial transit drone"
      || label === "aerial transit path"
      || label.includes("data pulse"));
  }
  return scene.items;
}

export function composeGalleryRouteRenderItems(
  demoId: DemoDefinition["id"],
  proceduralItems: readonly RenderItem[],
  authoredItems: readonly RenderItem[]
): RenderItem[] {
  if (authoredItems.length === 0) return [...proceduralItems];
  if (demoId === "digital-twin") return [...authoredItems, ...proceduralItems];
  return [...proceduralItems, ...authoredItems];
}

export function usesProductConfiguratorHotspotPicking(demoId: DemoDefinition["id"]): boolean {
  return demoId === "product-configurator";
}

export function routeReceivesWaterRipples(demoId: DemoDefinition["id"]): boolean {
  return demoId === "water-lab" || demoId === "ocean-observatory";
}

export function maxCanvasBackingEdgeForRoute(demoId: DemoDefinition["id"]): number {
  return demoId === "reactor-post" ? 2160 : 2560;
}

function filterByLabel(items: readonly RenderItem[], predicate: (label: string) => boolean): RenderItem[] {
  return items.filter((item) => predicate(itemLabel(item)));
}

function productConfiguratorStageLabel(label: string): boolean {
  return label.startsWith("indoor-studio ")
    || label === "product-studio floor"
    || label === "product-studio backdrop";
}

function itemLabel(item: RenderItem): string {
  return typeof item.label === "string" ? item.label : "";
}
