import {
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  type CameraFrameBounds,
  type EnvironmentLightingCompositionOptions,
  type RendererPostProcessOptions,
  type RenderItem
} from "@aura3d/rendering";
import type { AuthoredAssetRuntimeState } from "./authoredLayer";
import { modelMatrix } from "./math";
import type { ControlValues, SceneFrame } from "./sceneBuilderPrimitives";
import type { DemoDefinition } from "./metadata";

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

  // Flythrough is applied after named hero framing so the default Hero view still moves.
  if (input.demoId === "water-lab" && input.cameraPreset === "hero") {
    yawRadians = 0.22 + Math.sin(input.time * 0.24) * 0.085;
    pitchRadians = -0.22 + Math.cos(input.time * 0.18) * 0.015;
    paddingRatio = 0.048;
  }
  if (input.demoId === "ocean-observatory" && input.cameraPreset === "hero") {
    yawRadians = -0.48 + Math.sin(input.time * 0.2) * 0.075;
    pitchRadians = -0.24 + Math.cos(input.time * 0.15) * 0.014;
    paddingRatio = 0.038;
  }
  if (input.demoId === "reactor-post" && input.cameraPreset === "hero") {
    yawRadians = 2.46 + Math.sin(input.time * 0.28) * 0.09;
    pitchRadians = -0.28 + Math.cos(input.time * 0.2) * 0.02;
    paddingRatio = 0.006;
  }
  if (input.demoId === "product-configurator" && input.cameraPreset === "hero") {
    yawRadians = -0.48 + Math.sin(input.time * 0.18) * 0.003;
    pitchRadians = -0.085 + Math.cos(input.time * 0.16) * 0.002;
    paddingRatio = 0.035;
  }
  if (input.demoId === "data-galaxy" && input.cameraPreset === "hero") {
    yawRadians = -0.22 + Math.sin(input.time * 0.22) * 0.08;
    pitchRadians = -0.12;
    paddingRatio = 0.004;
  }
  if (input.demoId === "smart-city" && input.cameraPreset === "hero") {
    const district = String(input.controls.district ?? "all");
    if (district === "harbor") {
      yawRadians = -0.28;
      pitchRadians = -0.18;
      paddingRatio = 0.04;
    } else if (district === "industrial") {
      yawRadians = -1.15;
      pitchRadians = -0.2;
      paddingRatio = 0.04;
    } else if (district === "north") {
      yawRadians = 0.52;
      pitchRadians = -0.2;
      paddingRatio = 0.04;
    } else if (district === "core") {
      yawRadians = -0.72;
      pitchRadians = -0.34;
      paddingRatio = 0.02;
    } else {
      yawRadians = -0.58;
      pitchRadians = -0.42;
      paddingRatio = 0.035;
    }
  }
  if (input.demoId === "smart-city" && input.controls.fly === true) {
    yawRadians += Math.sin(input.time * 0.22) * 0.34;
    pitchRadians += Math.sin(input.time * 0.17) * 0.08;
    paddingRatio = input.cameraPreset === "wide" ? 0.24 : Math.min(paddingRatio, 0.1);
  }
  if (input.demoId === "product-configurator") {
    const focus = String(input.controls.focusPart ?? "overview");
    if (focus === "wheels") {
      pitchRadians = -0.38;
      paddingRatio = 0.016;
    } else if (focus === "interior") {
      yawRadians = 0.18;
      pitchRadians = -0.02;
      paddingRatio = 0.012;
    } else if (focus === "lights") {
      yawRadians = -0.98;
      pitchRadians = -0.05;
      paddingRatio = 0.018;
    } else if (focus === "body") {
      yawRadians = -0.32;
      pitchRadians = -0.1;
      paddingRatio = 0.026;
    }
  }
  if (input.demoId === "robotics-lab" && input.cameraPreset === "hero") {
    yawRadians = -0.24 + Math.sin(input.time * 0.28) * 0.075;
    pitchRadians = -0.14;
    paddingRatio = 0.006;
  }
  if (input.demoId === "physics-playground" && input.cameraPreset === "hero") {
    yawRadians = -0.28 + Math.sin(input.time * 0.22) * 0.065;
    pitchRadians = -0.31;
    paddingRatio = 0.058;
  }
  if (input.demoId === "digital-twin" && input.cameraPreset === "hero") {
    yawRadians = -0.68 + Math.sin(input.time * 0.2) * 0.065;
    pitchRadians = -0.66;
    paddingRatio = 0.055;
  }

  if (input.demoId === "ocean-observatory" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-6.2, -1.0, -5.2], max: [6.2, 3.1, 3.75] };
  }
  if (input.demoId === "product-configurator" && input.cameraPreset === "hero") {
    bounds = {
      min: [-1.84, -0.96, -0.9],
      max: [1.84, 0.68, 0.92]
    };
  }
  if (input.demoId === "data-galaxy" && input.cameraPreset === "hero") {
    bounds = { min: [-0.2, -0.18, -0.18], max: [0.2, 0.24, 0.2] };
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
  if (input.demoId === "smart-city" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-7.1, -0.56, -6.45], max: [7.1, 5.75, 6.05] };
  }
  if (input.demoId === "robotics-lab" && input.cameraPreset === "hero" && authoredReady) {
    bounds = { min: [-0.98, -0.66, -0.82], max: [2.02, 1.9, 1.26] };
  }
  if (input.demoId === "fog-cathedral" && input.cameraPreset === "hero") {
    yawRadians = -1.88 + Math.sin(input.time * 0.18) * 0.04;
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

export interface GalleryRoutePostProcess4Preset {
  readonly exposure: number;
  readonly bloomThreshold: number;
  readonly bloomIntensity: number;
  readonly bloomRadius: number;
  readonly ssaoRadius: number;
  readonly ssaoIntensity: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly vignette: number;
  readonly sharpening?: number;
}

const GALLERY_ROUTE_POSTPROCESS_PRESETS: Readonly<Record<DemoDefinition["id"], GalleryRoutePostProcess4Preset>> = {
  "water-lab": {
    exposure: 1.14,
    bloomThreshold: 0.74,
    bloomIntensity: 0.22,
    bloomRadius: 3,
    ssaoRadius: 2,
    ssaoIntensity: 0.3,
    contrast: 1.1,
    saturation: 1.08,
    vignette: 0.18,
    sharpening: 0.04
  },
  "ocean-observatory": {
    exposure: 1.15,
    bloomThreshold: 0.7,
    bloomIntensity: 0.24,
    bloomRadius: 4,
    ssaoRadius: 3,
    ssaoIntensity: 0.34,
    contrast: 1.1,
    saturation: 1.08,
    vignette: 0.22,
    sharpening: 0.04
  },
  "reactor-post": {
    exposure: 1.15,
    bloomThreshold: 0.46,
    bloomIntensity: 0.22,
    bloomRadius: 2,
    ssaoRadius: 2,
    ssaoIntensity: 0.35,
    contrast: 1.18,
    saturation: 1.12,
    vignette: 0.28,
    sharpening: 0.04
  },
  "smart-city": {
    exposure: 1.15,
    bloomThreshold: 0.74,
    bloomIntensity: 0.24,
    bloomRadius: 3,
    ssaoRadius: 2,
    ssaoIntensity: 0.35,
    contrast: 1.12,
    saturation: 1.14,
    vignette: 0.22,
    sharpening: 0.04
  },
  "data-galaxy": {
    exposure: 1.16,
    bloomThreshold: 0.82,
    bloomIntensity: 0.18,
    bloomRadius: 2,
    ssaoRadius: 2,
    ssaoIntensity: 0.25,
    contrast: 1.18,
    saturation: 1.08,
    vignette: 0.2,
    sharpening: 0.04
  },
  "product-configurator": {
    exposure: 1.12,
    bloomThreshold: 0.85,
    bloomIntensity: 0.14,
    bloomRadius: 2,
    ssaoRadius: 2,
    ssaoIntensity: 0.32,
    contrast: 1.06,
    saturation: 1.04,
    vignette: 0.16,
    sharpening: 0.05
  },
  "robotics-lab": {
    exposure: 1.14,
    bloomThreshold: 0.76,
    bloomIntensity: 0.2,
    bloomRadius: 3,
    ssaoRadius: 2,
    ssaoIntensity: 0.35,
    contrast: 1.08,
    saturation: 1.05,
    vignette: 0.2,
    sharpening: 0.04
  },
  "physics-playground": {
    exposure: 1.14,
    bloomThreshold: 0.78,
    bloomIntensity: 0.2,
    bloomRadius: 3,
    ssaoRadius: 2,
    ssaoIntensity: 0.35,
    contrast: 1.08,
    saturation: 1.04,
    vignette: 0.2,
    sharpening: 0.04
  },
  "fog-cathedral": {
    exposure: 1.15,
    bloomThreshold: 0.68,
    bloomIntensity: 0.26,
    bloomRadius: 4,
    ssaoRadius: 3,
    ssaoIntensity: 0.38,
    contrast: 1.1,
    saturation: 0.9,
    vignette: 0.24,
    sharpening: 0.03
  },
  "digital-twin": {
    exposure: 1.15,
    bloomThreshold: 0.74,
    bloomIntensity: 0.22,
    bloomRadius: 3,
    ssaoRadius: 2,
    ssaoIntensity: 0.35,
    contrast: 1.1,
    saturation: 1.04,
    vignette: 0.22,
    sharpening: 0.04
  }
};

function clampGallerySsaoRadius(radius: number): number {
  return Math.max(1, Math.min(8, Math.round(radius < 1 ? radius * 8 : radius)));
}

export function applyGalleryRoutePostprocessPolicy(
  demoId: DemoDefinition["id"],
  value: RendererPostProcessOptions | false,
  controls: ControlValues
): RendererPostProcessOptions | false {
  const preset = GALLERY_ROUTE_POSTPROCESS_PRESETS[demoId];
  const ssaoRadius = clampGallerySsaoRadius(preset.ssaoRadius);
  const base = value === false ? {} : value;

  if (demoId === "product-configurator") {
    return {
      targetFormat: "rgba8",
      toneMapping: false,
      bloom: false,
      colorGrade: false,
      fxaa: false
    };
  }

  if (demoId === "smart-city") {
    return false;
  }

  if (demoId === "data-galaxy") {
    if (value === false) return false;
    return {
      ...base,
      toneMapping: base.toneMapping ?? {
        exposure: preset.exposure,
        whitePoint: 1.35,
        gamma: 2.2,
        operator: "filmic"
      },
      bloom: false,
      colorGrade: base.colorGrade ?? {
        contrast: preset.contrast,
        saturation: preset.saturation,
        vignette: preset.vignette,
        sharpening: preset.sharpening ?? 0.04
      },
      fxaa: boundedGalleryFxaa(base.fxaa, { edgeThreshold: 0.11, subpixelBlend: 0.2 })
    };
  }

  if (demoId === "reactor-post") {
    if (value === false) return false;
    const bloomEnabled = controls.bloom === true;
    return {
      ...base,
      ...(bloomEnabled ? {} : { targetFormat: "rgba8" as const }),
      toneMapping: base.toneMapping ?? {
        exposure: preset.exposure,
        whitePoint: 1.34,
        gamma: 2.2,
        operator: "filmic"
      },
      bloom: bloomEnabled
        ? (base.bloom ?? { threshold: preset.bloomThreshold, intensity: preset.bloomIntensity, radius: preset.bloomRadius })
        : false,
      fxaa: boundedGalleryFxaa(base.fxaa, { edgeThreshold: 0.08, subpixelBlend: 0.55 })
    };
  }

  if (value === false) return false;

  const isStormOcean = demoId === "ocean-observatory" && controls.mode === "storm";
  const bloomIntensity = isStormOcean ? 0.34 : preset.bloomIntensity;
  const contrast = isStormOcean ? 1.18 : preset.contrast;
  const saturation = isStormOcean ? 0.9 : preset.saturation;

  return {
    ...base,
    toneMapping: base.toneMapping ?? {
      exposure: preset.exposure,
      whitePoint: 1.35,
      gamma: 2.2,
      operator: "filmic"
    },
    bloom: {
      threshold: preset.bloomThreshold,
      intensity: bloomIntensity,
      radius: preset.bloomRadius
    },
    ssao: {
      radius: ssaoRadius,
      intensity: preset.ssaoIntensity
    },
    colorGrade: {
      contrast,
      saturation,
      vignette: preset.vignette,
      sharpening: preset.sharpening ?? 0.04
    },
    fxaa: boundedGalleryFxaa(base.fxaa, { edgeThreshold: 0.08, subpixelBlend: 0.5 })
  };
}

export const resolveGalleryRoutePostProcessOptions = applyGalleryRoutePostprocessPolicy;

export function rendererEnvironmentLightingCompositionOptionsForRoute(
  demoId: DemoDefinition["id"]
): EnvironmentLightingCompositionOptions {
  if (demoId !== "product-configurator") return {};
  return {
    sampledReplacesProceduralMap: false
  };
}

function boundedGalleryFxaa(
  value: RendererPostProcessOptions["fxaa"],
  fallback: Exclude<RendererPostProcessOptions["fxaa"], boolean | undefined>
): RendererPostProcessOptions["fxaa"] {
  if (value === true || value === undefined) return fallback;
  return value;
}

function isWireframeOrDebugWaterItem(item: RenderItem): boolean {
  if (item.geometry && item.geometry.topology === "lines") return true;
  const label = itemLabel(item);
  if (
    item.geometry
    && (
      label === "wave normal debug"
      || label === "animated foam ripple line"
      || label === "marina cable lights"
      || label === "drone navigation glint"
      || label === "low sun reflection streak"
    )
  ) {
    return true;
  }
  return false;
}

export function visibleProceduralItemsForRoute(
  scene: SceneFrame,
  demoId: DemoDefinition["id"],
  authored: AuthoredAssetRuntimeState
): SceneFrame["items"] {
  if (authored.status !== "ready" || authored.drawItems === 0) {
    if (demoId === "water-lab" || demoId === "ocean-observatory") {
      return scene.items.filter((item) => !isWireframeOrDebugWaterItem(item));
    }
    return scene.items;
  }
  if (demoId === "product-configurator") {
    return filterByLabel(scene.items, productConfiguratorStageLabel);
  }
  if (demoId === "water-lab") {
    return scene.items.filter((item) => {
      if (isWireframeOrDebugWaterItem(item)) return false;
      const label = itemLabel(item);
      return label === "continuous animated water mesh"
        || label === "buoy"
        || label === "dock lights"
        || label === "marina cable lights"
        || label === "small boat hull"
        || label === "boat canopy"
        || label === "small boat mast"
        || label === "small boat sail"
        || label === "shore rocks"
        || label === "measured water foam crest"
        || label === "wave normal debug";
    });
  }
  if (demoId === "ocean-observatory") {
    return scene.items.filter((item) => {
      if (isWireframeOrDebugWaterItem(item)) return false;
      const label = itemLabel(item);
      return label === "continuous multi-frequency ocean mesh"
        || label === "low sun reflection streak"
        || label === "subtle foam crest"
        || label === "patrol drone"
        || label === "drone navigation glint";
    });
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
    return filterByLabel(scene.items, (label) => label === "district load hologram"
      || label === "instanced district tower"
      || label === "district sensor pulse"
      || label === "facade window data pulse"
      || label === "selected district highlight"
      || label === "traffic vehicles"
      || label === "logistics cargo pallets"
      || label === "district light rail trail"
      || label === "district light rail car"
      || label === "aerial transit drone"
      || label === "aerial transit path"
      || label === "debug grid"
      || label.includes("data pulse"));
  }
  return scene.items;
}

interface ProceduralProductHeroResources {
  readonly box: Geometry;
  readonly cylinder: Geometry;
  readonly sphere: Geometry;
  readonly torus: Geometry;
  readonly paintMaterials: Readonly<Record<string, PBRMaterial>>;
  readonly trimMaterials: Readonly<Record<string, PBRMaterial>>;
  readonly carbonMaterial: PBRMaterial;
  readonly glassMaterial: PBRMaterial;
  readonly tireMaterial: PBRMaterial;
  readonly rimMaterial: PBRMaterial;
  readonly caliperMaterial: PBRMaterial;
  readonly copperCoreMaterial: PBRMaterial;
  readonly cyanLedMaterial: UnlitMaterial;
  readonly crimsonLedMaterial: UnlitMaterial;
  readonly amberLedMaterial: UnlitMaterial;
  readonly pedestalMaterial: PBRMaterial;
}

let cachedProductHeroResources: ProceduralProductHeroResources | undefined;

function getProductHeroResources(): ProceduralProductHeroResources {
  if (cachedProductHeroResources) return cachedProductHeroResources;
  cachedProductHeroResources = {
    box: Geometry.litCube(1),
    cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 32 }),
    sphere: Geometry.uvSphere(0.5, 28, 20),
    torus: Geometry.torus({ radius: 0.5, radialSegments: 18, tubularSegments: 48 }),
    paintMaterials: {
      "Carmine Candy": new PBRMaterial({
        name: "hero-paint-carmine",
        baseColor: [0.84, 0.09, 0.16, 1],
        metallic: 0.78,
        roughness: 0.16
      }),
      "Cyber Cyan": new PBRMaterial({
        name: "hero-paint-cyan",
        baseColor: [0.08, 0.68, 0.88, 1],
        metallic: 0.82,
        roughness: 0.15
      }),
      "Solar Gold": new PBRMaterial({
        name: "hero-paint-gold",
        baseColor: [0.92, 0.66, 0.16, 1],
        metallic: 0.86,
        roughness: 0.18
      }),
      "Obsidian Stealth": new PBRMaterial({
        name: "hero-paint-obsidian",
        baseColor: [0.11, 0.14, 0.19, 1],
        metallic: 0.74,
        roughness: 0.22
      })
    },
    trimMaterials: {
      graphite: new PBRMaterial({
        name: "hero-trim-graphite",
        baseColor: [0.22, 0.26, 0.32, 1],
        metallic: 0.78,
        roughness: 0.24
      }),
      alloy: new PBRMaterial({
        name: "hero-trim-alloy",
        baseColor: [0.82, 0.86, 0.9, 1],
        metallic: 0.9,
        roughness: 0.18
      }),
      champagne: new PBRMaterial({
        name: "hero-trim-champagne",
        baseColor: [0.88, 0.72, 0.46, 1],
        metallic: 0.85,
        roughness: 0.2
      }),
      copper: new PBRMaterial({
        name: "hero-trim-copper",
        baseColor: [0.88, 0.44, 0.22, 1],
        metallic: 0.86,
        roughness: 0.2
      })
    },
    carbonMaterial: new PBRMaterial({
      name: "hero-carbon",
      baseColor: [0.08, 0.1, 0.13, 1],
      metallic: 0.45,
      roughness: 0.32
    }),
    glassMaterial: new PBRMaterial({
      name: "hero-canopy-glass",
      baseColor: [0.14, 0.36, 0.54, 1],
      metallic: 0.92,
      roughness: 0.08
    }),
    tireMaterial: new PBRMaterial({
      name: "hero-tire-rubber",
      baseColor: [0.06, 0.07, 0.085, 1],
      metallic: 0.12,
      roughness: 0.68
    }),
    rimMaterial: new PBRMaterial({
      name: "hero-wheel-rim",
      baseColor: [0.84, 0.88, 0.93, 1],
      metallic: 0.92,
      roughness: 0.16
    }),
    caliperMaterial: new PBRMaterial({
      name: "hero-brake-caliper",
      baseColor: [0.92, 0.16, 0.18, 1],
      metallic: 0.68,
      roughness: 0.24
    }),
    copperCoreMaterial: new PBRMaterial({
      name: "hero-powertrain-copper",
      baseColor: [0.92, 0.52, 0.22, 1],
      metallic: 0.88,
      roughness: 0.18
    }),
    cyanLedMaterial: new UnlitMaterial({
      name: "hero-cyan-led",
      color: [0.22, 0.94, 1.0, 1]
    }),
    crimsonLedMaterial: new UnlitMaterial({
      name: "hero-crimson-led",
      color: [1.0, 0.22, 0.28, 1]
    }),
    amberLedMaterial: new UnlitMaterial({
      name: "hero-amber-led",
      color: [1.0, 0.76, 0.24, 1]
    }),
    pedestalMaterial: new PBRMaterial({
      name: "hero-turntable-plinth",
      baseColor: [0.1, 0.13, 0.18, 1],
      metallic: 0.68,
      roughness: 0.26
    })
  };
  return cachedProductHeroResources;
}

function rotatePointY(
  x: number,
  y: number,
  z: number,
  yaw: number
): readonly [number, number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, y, -x * s + z * c];
}

function buildHeroPartItem(
  label: string,
  geometry: Geometry,
  material: PBRMaterial | UnlitMaterial,
  localPos: readonly [number, number, number],
  scale: readonly [number, number, number],
  turntableYaw: number,
  localRot: readonly [number, number, number] = [0, 0, 0]
): RenderItem {
  const [wx, wy, wz] = rotatePointY(localPos[0], localPos[1], localPos[2], turntableYaw);
  return {
    label,
    geometry,
    material,
    modelMatrix: modelMatrix([wx, wy, wz], scale, [localRot[0], localRot[1] + turntableYaw, localRot[2]])
  };
}

export function buildProceduralProductConfiguratorHeroItems(
  controls: ControlValues = {},
  time = 0
): RenderItem[] {
  const res = getProductHeroResources();
  const variant = String(controls.carVariant ?? "Carmine Candy");
  const finish = String(controls.finish ?? "graphite");
  const focus = String(controls.focusPart ?? "overview");
  const explodedRaw = typeof controls.exploded === "number" ? controls.exploded : controls.exploded === true ? 1 : 0;
  const explode = Math.max(0, Math.min(1, explodedRaw)) + (focus !== "overview" ? 0.35 : 0);
  const turntableActive = controls.turntable !== false;
  const turntableYaw = turntableActive ? time * 0.32 : 0;

  const paintMat = res.paintMaterials[variant] ?? res.paintMaterials["Carmine Candy"]!;
  const trimMat = res.trimMaterials[finish] ?? res.trimMaterials.graphite!;

  const items: RenderItem[] = [];

  // 1. Turntable Pedestal Plinth + Glowing Cyan Rim Ring
  items.push(
    buildHeroPartItem(
      "product-studio turntable plinth",
      res.cylinder,
      res.pedestalMaterial,
      [0, -0.73, 0],
      [2.85, 0.08, 2.85],
      0
    ),
    buildHeroPartItem(
      "product-studio turntable ring",
      res.torus,
      res.cyanLedMaterial,
      [0, -0.685, 0],
      [2.88, 2.88, 0.45],
      0,
      [Math.PI / 2, 0, 0]
    )
  );

  // 2. Lower Aerodynamic Carbon Splitter & Chassis Floorpan
  items.push(
    buildHeroPartItem(
      "product configurator hotspot body-finish chassis",
      res.box,
      res.carbonMaterial,
      [0, -0.52 - explode * 0.08, 0],
      [1.38, 0.11, 2.82],
      turntableYaw
    ),
    // Sculpted Main Metallic Fuselage
    buildHeroPartItem(
      "product configurator body fuselage",
      res.box,
      paintMat,
      [0, -0.35 + (focus === "body" ? 0.08 : 0), 0.02],
      [1.32, 0.26, 2.64],
      turntableYaw
    ),
    // Front Sculpted Hood Slope
    buildHeroPartItem(
      "product configurator front hood",
      res.box,
      paintMat,
      [0, -0.22 + explode * 0.16, -0.82 - explode * 0.22],
      [1.18, 0.14, 0.98],
      turntableYaw,
      [0.14, 0, 0]
    ),
    // Rear Fastback Deck
    buildHeroPartItem(
      "product configurator rear deck",
      res.box,
      paintMat,
      [0, -0.18 + explode * 0.14, 0.86 + explode * 0.2],
      [1.22, 0.16, 0.92],
      turntableYaw,
      [-0.12, 0, 0]
    )
  );

  // 3. Muscular Wheel Arch Fenders & Side Aero Blades (Left & Right)
  for (const side of [-1, 1] as const) {
    const sideOffset = side * (0.62 + explode * 0.22);
    items.push(
      buildHeroPartItem(
        `product configurator front fender ${side < 0 ? "L" : "R"}`,
        res.box,
        paintMat,
        [sideOffset, -0.28 + explode * 0.06, -0.82],
        [0.24, 0.26, 0.82],
        turntableYaw
      ),
      buildHeroPartItem(
        `product configurator rear fender ${side < 0 ? "L" : "R"}`,
        res.box,
        paintMat,
        [sideOffset * 1.03, -0.25 + explode * 0.06, 0.84],
        [0.26, 0.3, 0.88],
        turntableYaw
      ),
      buildHeroPartItem(
        `product configurator side aero blade ${side < 0 ? "L" : "R"}`,
        res.box,
        trimMat,
        [side * (0.69 + explode * 0.26), -0.46, 0.0],
        [0.1, 0.1, 1.56],
        turntableYaw
      )
    );
  }

  // 4. Aerodynamic Glass Canopy Dome & Structural Bridge + Cockpit Interior
  items.push(
    buildHeroPartItem(
      "product configurator hotspot lens-material canopy",
      res.sphere,
      res.glassMaterial,
      [0, -0.06 + explode * 0.26 + (focus === "lens" || focus === "interior" ? 0.1 : 0), -0.04],
      [1.04, 0.46, 1.54],
      turntableYaw
    ),
    buildHeroPartItem(
      "product configurator structural roof spine",
      res.box,
      trimMat,
      [0, 0.16 + explode * 0.32, 0.04],
      [0.36, 0.05, 1.12],
      turntableYaw
    ),
    buildHeroPartItem(
      "product configurator hotspot control-dial cockpit",
      res.box,
      trimMat,
      [0, -0.18 + explode * 0.12 + (focus === "controls" || focus === "interior" ? 0.08 : 0), -0.12],
      [0.86, 0.18, 0.68],
      turntableYaw
    )
  );

  // 5. Rear Active Wing Spoiler & Twin Pylons
  items.push(
    buildHeroPartItem(
      "product configurator rear wing blade",
      res.box,
      trimMat,
      [0, 0.05 + explode * 0.22, 1.24 + explode * 0.24],
      [1.34, 0.045, 0.28],
      turntableYaw,
      [0.16, 0, 0]
    ),
    buildHeroPartItem(
      "product configurator rear wing pylon L",
      res.box,
      res.carbonMaterial,
      [-0.36, -0.08 + explode * 0.16, 1.18 + explode * 0.18],
      [0.05, 0.24, 0.18],
      turntableYaw
    ),
    buildHeroPartItem(
      "product configurator rear wing pylon R",
      res.box,
      res.carbonMaterial,
      [0.36, -0.08 + explode * 0.16, 1.18 + explode * 0.18],
      [0.05, 0.24, 0.18],
      turntableYaw
    )
  );

  // 6. Copper/Gold Twin-Turbo / High-Voltage Powertrain Core
  items.push(
    buildHeroPartItem(
      "product configurator hotspot battery-sled powertrain",
      res.cylinder,
      res.copperCoreMaterial,
      [0, -0.14 + explode * 0.28 + (focus === "battery" ? 0.12 : 0), 0.64 + explode * 0.18],
      [0.44, 0.62, 0.44],
      turntableYaw,
      [Math.PI / 2, 0, 0]
    ),
    buildHeroPartItem(
      "product configurator powertrain energy ring",
      res.torus,
      res.amberLedMaterial,
      [0, -0.14 + explode * 0.28, 0.64 + explode * 0.18],
      [0.52, 0.52, 0.52],
      turntableYaw
    )
  );

  // 7. Matrix Cyber-Cyan Headlights & Full-Width Crimson Taillight Bar
  items.push(
    buildHeroPartItem(
      "product configurator hotspot sensor-module headlight L",
      res.box,
      res.cyanLedMaterial,
      [-0.44, -0.28 + explode * 0.08, -1.36 - explode * 0.26],
      [0.34, 0.055, 0.08],
      turntableYaw
    ),
    buildHeroPartItem(
      "product configurator headlight R",
      res.box,
      res.cyanLedMaterial,
      [0.44, -0.28 + explode * 0.08, -1.36 - explode * 0.26],
      [0.34, 0.055, 0.08],
      turntableYaw
    ),
    buildHeroPartItem(
      "product configurator front splitter lightbar",
      res.box,
      res.cyanLedMaterial,
      [0, -0.44 - explode * 0.04, -1.42 - explode * 0.26],
      [0.92, 0.03, 0.05],
      turntableYaw
    ),
    buildHeroPartItem(
      "product configurator rear taillight bar",
      res.box,
      res.crimsonLedMaterial,
      [0, -0.22 + explode * 0.08, 1.36 + explode * 0.26],
      [1.18, 0.055, 0.06],
      turntableYaw
    )
  );

  // 8. 4 Multi-Part Sculpted Wheels (Tire + Alloy Rim + Caliper)
  const wheelConfigs: readonly {
    readonly tag: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly radius: number;
  }[] = [
    { tag: "FL", x: -0.68, y: -0.44, z: -0.84, radius: 0.52 },
    { tag: "FR", x: 0.68, y: -0.44, z: -0.84, radius: 0.52 },
    { tag: "RL", x: -0.71, y: -0.42, z: 0.86, radius: 0.56 },
    { tag: "RR", x: 0.71, y: -0.42, z: 0.86, radius: 0.56 }
  ];

  for (let i = 0; i < wheelConfigs.length; i++) {
    const w = wheelConfigs[i]!;
    const sideSign = w.x < 0 ? -1 : 1;
    const wx = w.x + sideSign * explode * 0.28;
    const wy = w.y - (focus === "wheels" || focus === "grip" ? 0.04 : 0);
    const wz = w.z + (w.z < 0 ? -1 : 1) * explode * 0.1;
    const tireLabel = i === 0
      ? "product configurator hotspot ribbed grip tire FL"
      : `product configurator wheel tire ${w.tag}`;
    items.push(
      buildHeroPartItem(
        tireLabel,
        res.cylinder,
        res.tireMaterial,
        [wx, wy, wz],
        [w.radius, 0.26, w.radius],
        turntableYaw,
        [0, 0, Math.PI / 2]
      ),
      buildHeroPartItem(
        `product configurator wheel rim ${w.tag}`,
        res.cylinder,
        res.rimMaterial,
        [wx + sideSign * 0.015, wy, wz],
        [w.radius * 0.68, 0.27, w.radius * 0.68],
        turntableYaw,
        [0, 0, Math.PI / 2]
      ),
      buildHeroPartItem(
        `product configurator brake caliper ${w.tag}`,
        res.box,
        res.caliperMaterial,
        [wx + sideSign * 0.04, wy + 0.08, wz - 0.08],
        [0.12, 0.16, 0.12],
        turntableYaw
      )
    );
  }

  return items;
}

export function composeGalleryRouteRenderItems(
  demoId: DemoDefinition["id"],
  proceduralItems: readonly RenderItem[],
  authoredItems: readonly RenderItem[],
  _controls: ControlValues = {},
  _time = 0
): RenderItem[] {
  if (authoredItems.length === 0) {
    return [...proceduralItems];
  }
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
  if (demoId === "product-configurator") return 3200;
  return demoId === "reactor-post" ? 2160 : 2560;
}

export function minimumCanvasBackingDprForRoute(demoId: DemoDefinition["id"]): number {
  return demoId === "product-configurator" ? 2 : 1;
}

function filterByLabel(items: readonly RenderItem[], predicate: (label: string) => boolean): RenderItem[] {
  return items.filter((item) => predicate(itemLabel(item)));
}

function productConfiguratorStageLabel(label: string): boolean {
  return label === "indoor-studio floor/catch plane"
    || label.startsWith("indoor-studio product grounding contact shadow layer")
    || label === "product-studio floor"
    || label === "product-studio backdrop"
    || label.startsWith("product configurator ");
}

function itemLabel(item: RenderItem): string {
  return typeof item.label === "string" ? item.label : "";
}
