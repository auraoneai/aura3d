import { Geometry, type Bounds3 } from "./Geometry";
import { PBRMaterial } from "./PBRMaterial";
import { createProceduralTexture } from "./ProceduralTextureFixtures";
import { Sampler } from "./Sampler";
import { TexturedPBRMaterial } from "./TexturedPBRMaterial";
import { TexturedUnlitMaterial } from "./TexturedUnlitMaterial";
import { UnlitMaterial } from "./UnlitMaterial";
import { createV4EnvironmentLighting } from "./V4RenderPreset";
import { DirectionalLight } from "@aura3d/scene";
import type { RenderItem, RenderMaterial } from "./ForwardPass";
import type { CollectedLight } from "./LightCollector";
import type { RendererPostProcessOptions, RenderSource } from "./Renderer";

export type ProductTurntableDirection = "cw" | "ccw";
export type ProductTurntableLightingPreset = "studio" | "soft" | "inspection" | "dramatic" | "neutral";
export type ProductTurntableCaptureFormat = "png" | "jpeg" | "webp";
export type ProductTurntableBatchTaskKind = "thumbnail" | "screenshot" | "360-spin" | "ar-export";

export interface ProductTurntableFixtureOptions {
  readonly elapsedSeconds?: number;
  readonly interactionCount?: number;
  readonly interactionAgeMs?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly lightingPreset?: ProductTurntableLightingPreset;
  readonly captureRequested?: boolean;
  readonly exportedBytes?: number;
}

export interface ProductTurntableHotspot {
  readonly id: string;
  readonly group: "material" | "controls" | "comfort";
  readonly label: string;
  readonly content: string;
  readonly position: readonly [number, number, number];
  readonly screen: {
    readonly x: number;
    readonly y: number;
    readonly visible: boolean;
    readonly occluded: false;
  };
  readonly visibilityThreshold: number;
}

export interface ProductTurntableLighting {
  readonly source: "origin-master-ecommerce-lighting-preset-manager-adapted";
  readonly presets: readonly ProductTurntableLightingPreset[];
  readonly activePreset: ProductTurntableLightingPreset;
  readonly activeLightCount: number;
  readonly ambientIntensity: number;
  readonly keyIntensity: number;
  readonly fillIntensity: number;
  readonly rimIntensity: number;
  readonly environmentIntensity: number;
  readonly shadowEnabled: boolean;
  readonly shadowSoftness: number;
  readonly transitionSupported: true;
}

export interface ProductTurntableCapturePlan {
  readonly source: "origin-master-ecommerce-capture-batch-export-adapted";
  readonly screenshotFormats: readonly ProductTurntableCaptureFormat[];
  readonly screenshotViews: readonly string[];
  readonly spinFrameCount: number;
  readonly spinDurationSeconds: number;
  readonly batchTasks: readonly ProductTurntableBatchTaskKind[];
  readonly completedBatchTasks: number;
  readonly captureRequested: boolean;
  readonly exportedBytes: number;
  readonly arExportFormats: readonly ["glb"];
  readonly blockedExportClaims: readonly string[];
}

export interface ProductTurntableFixture {
  readonly id: "v4-old-branch-product-turntable-fixture";
  readonly source: "origin-master-ecommerce-turntable-adapted";
  readonly sourceFiles: readonly string[];
  readonly autoRotate: true;
  readonly speedRadiansPerSecond: number;
  readonly direction: ProductTurntableDirection;
  readonly pauseOnInteraction: true;
  readonly resumeDelayMs: number;
  readonly smoothTransition: true;
  readonly transitionDurationSeconds: number;
  readonly currentSpeedRadiansPerSecond: number;
  readonly rotationRadians: number;
  readonly pausedByInteraction: boolean;
  readonly interactionCount: number;
  readonly hotspots: readonly ProductTurntableHotspot[];
  readonly visibleHotspotCount: number;
  readonly lighting: ProductTurntableLighting;
  readonly capture: ProductTurntableCapturePlan;
  readonly manifestHash: string;
  readonly claimBoundary: string;
}

export interface ProductTurntableRenderKitOptions extends ProductTurntableFixtureOptions {
  readonly includeStage?: boolean;
}

export interface ProductTurntableRenderKit {
  readonly fixture: ProductTurntableFixture;
  readonly source: RenderSource;
  readonly renderItems: readonly RenderItem[];
  readonly geometryLibrary: ReadonlyMap<string, Geometry>;
  readonly materialLibrary: ReadonlyMap<string, RenderMaterial>;
  readonly bounds: Bounds3;
  readonly postprocess: RendererPostProcessOptions;
  dispose(): void;
}

const sourceFiles = [
  "master:src/ecommerce/turntable/TurntableController.ts",
  "master:src/ecommerce/turntable/HotspotManager.ts",
  "master:src/ecommerce/turntable/LightingPresetManager.ts",
  "master:src/ecommerce/turntable/CaptureManager.ts",
  "master:src/ecommerce/turntable/BatchProcessor.ts",
  "master:src/ecommerce/turntable/ARExporter.ts"
] as const;

const lightingPresets: Record<ProductTurntableLightingPreset, Omit<ProductTurntableLighting, "source" | "presets" | "activePreset" | "transitionSupported">> = {
  studio: {
    activeLightCount: 4,
    ambientIntensity: 0.2,
    keyIntensity: 1.5,
    fillIntensity: 0.5,
    rimIntensity: 0.8,
    environmentIntensity: 1,
    shadowEnabled: true,
    shadowSoftness: 0.5
  },
  soft: {
    activeLightCount: 4,
    ambientIntensity: 0.5,
    keyIntensity: 0.8,
    fillIntensity: 0.8,
    rimIntensity: 0.4,
    environmentIntensity: 0.85,
    shadowEnabled: false,
    shadowSoftness: 1
  },
  inspection: {
    activeLightCount: 3,
    ambientIntensity: 0.32,
    keyIntensity: 1.15,
    fillIntensity: 0.65,
    rimIntensity: 0.35,
    environmentIntensity: 1.05,
    shadowEnabled: true,
    shadowSoftness: 0.35
  },
  dramatic: {
    activeLightCount: 3,
    ambientIntensity: 0.05,
    keyIntensity: 2.5,
    fillIntensity: 0.12,
    rimIntensity: 1.2,
    environmentIntensity: 0.7,
    shadowEnabled: true,
    shadowSoftness: 0.1
  },
  neutral: {
    activeLightCount: 4,
    ambientIntensity: 0.3,
    keyIntensity: 1,
    fillIntensity: 0.6,
    rimIntensity: 0.3,
    environmentIntensity: 1,
    shadowEnabled: true,
    shadowSoftness: 0.5
  }
};

export function createProductTurntableFixture(options: ProductTurntableFixtureOptions = {}): ProductTurntableFixture {
  const elapsedSeconds = finiteOrDefault(options.elapsedSeconds, 0, "elapsedSeconds");
  const interactionCount = integerOrDefault(options.interactionCount, 0, "interactionCount");
  const interactionAgeMs = finiteOrDefault(options.interactionAgeMs, Number.POSITIVE_INFINITY, "interactionAgeMs");
  const canvasWidth = Math.max(320, integerOrDefault(options.canvasWidth, 960, "canvasWidth"));
  const canvasHeight = Math.max(240, integerOrDefault(options.canvasHeight, 540, "canvasHeight"));
  const lightingPreset = options.lightingPreset ?? "studio";
  const speedRadiansPerSecond = Math.PI / 8;
  const resumeDelayMs = 2_000;
  const transitionDurationSeconds = 0.5;
  const pausedByInteraction = interactionCount > 0 && interactionAgeMs < resumeDelayMs;
  const resumeBlend = pausedByInteraction ? 0 : Math.min(1, Math.max(0, (interactionAgeMs - resumeDelayMs) / (transitionDurationSeconds * 1000)));
  const currentSpeedRadiansPerSecond = Number((speedRadiansPerSecond * resumeBlend).toFixed(4));
  const rotationRadians = Number(((elapsedSeconds * speedRadiansPerSecond) % (Math.PI * 2)).toFixed(4));
  const hotspots = createHotspots(rotationRadians, canvasWidth, canvasHeight);
  const visibleHotspotCount = hotspots.filter((hotspot) => hotspot.screen.visible).length;
  const capture = createCapturePlan(Boolean(options.captureRequested), Math.max(0, integerOrDefault(options.exportedBytes, 0, "exportedBytes")));
  const lighting = createLighting(lightingPreset);
  const hash = hashProductTurntable([
    rotationRadians,
    currentSpeedRadiansPerSecond,
    visibleHotspotCount,
    lighting.activeLightCount,
    lighting.environmentIntensity,
    capture.completedBatchTasks,
    capture.exportedBytes
  ]);

  return {
    id: "v4-old-branch-product-turntable-fixture",
    source: "origin-master-ecommerce-turntable-adapted",
    sourceFiles,
    autoRotate: true,
    speedRadiansPerSecond,
    direction: "cw",
    pauseOnInteraction: true,
    resumeDelayMs,
    smoothTransition: true,
    transitionDurationSeconds,
    currentSpeedRadiansPerSecond,
    rotationRadians,
    pausedByInteraction,
    interactionCount,
    hotspots,
    visibleHotspotCount,
    lighting,
    capture,
    manifestHash: hash,
    claimBoundary: "This fixture adapts old ecommerce turntable concepts into deterministic V4 product evidence. It does not claim a complete ecommerce pipeline, native USDZ export, video capture, PIM integration, or AR platform parity."
  };
}

export function createProductTurntableRenderKit(options: ProductTurntableRenderKitOptions = {}): ProductTurntableRenderKit {
  const fixture = createProductTurntableFixture(options);
  const environment = createV4EnvironmentLighting(productTurntableEnvironmentPreset(fixture.lighting.activePreset));
  const sampler = new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "repeat" });
  const detailSampler = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "repeat" });
  const textures = [
    createProceduralTexture("metallic-paint", { width: 128, height: 128 }),
    createProceduralTexture("carbon-fiber", { width: 128, height: 128 }),
    createProceduralTexture("metallic-roughness-map", { width: 128, height: 128 }),
    createProceduralTexture("normal-from-height", { width: 128, height: 128 }),
    createProceduralTexture("sci-fi-panel", { width: 128, height: 128 }),
    createProceduralTexture("concrete-asphalt", { width: 128, height: 128 }),
    createProceduralTexture("racing-stripes", { width: 128, height: 128 })
  ];
  const [paint, carbon, metallicRoughness, normal, panel, concrete, accentStripes] = textures;
  const geometryLibrary = new Map<string, Geometry>([
    ["ear-shell", Geometry.capsule({ radius: 0.34, height: 0.9, segments: 64, rings: 16, textured: true })],
    ["ear-pad", Geometry.uvSphere(0.42, 64, 32, { textured: true })],
    ["headband", Geometry.texturedCube(1)],
    ["control", Geometry.texturedCube(1)],
    ["accent", Geometry.uvSphere(0.18, 48, 24, { textured: true })],
    ["stage", Geometry.texturedCube(1)]
  ]);
  const materialLibrary = new Map<string, RenderMaterial>([
    ["painted-shell", new TexturedPBRMaterial({
      name: "turntable-painted-metal-shell",
      baseColor: [0.48, 0.5, 0.52, 1],
      metallic: 0.62,
      roughness: 0.32,
      metallicRoughnessTexture: metallicRoughness,
      metallicRoughnessSampler: sampler,
      normalTexture: normal,
      normalSampler: detailSampler,
      normalScale: 0.12,
      clearcoatFactor: 0.34,
      clearcoatRoughnessFactor: 0.22
    })],
    ["carbon-pad", new TexturedPBRMaterial({
      name: "turntable-carbon-cushion",
      baseColor: [0.08, 0.09, 0.11, 1],
      metallic: 0.08,
      roughness: 0.64,
      baseColorTexture: carbon,
      baseColorSampler: sampler,
      normalTexture: normal,
      normalSampler: detailSampler,
      normalScale: 0.22
    })],
    ["brushed-trim", new PBRMaterial({
      name: "turntable-brushed-trim",
      baseColor: [0.86, 0.82, 0.72, 1],
      metallic: 1,
      roughness: 0.19,
      specularFactor: 1
    })],
    ["control-panel", new TexturedPBRMaterial({
      name: "turntable-control-panel",
      baseColor: [0.16, 0.42, 0.58, 1],
      metallic: 0.18,
      roughness: 0.38,
      baseColorTexture: panel,
      baseColorSampler: sampler,
      normalTexture: normal,
      normalSampler: detailSampler,
      normalScale: 0.16,
      emissiveColor: [0.01, 0.12, 0.16],
      emissiveStrength: 0.18
    })],
    ["status-light", new PBRMaterial({
      name: "turntable-status-light",
      baseColor: [0.18, 0.92, 1, 1],
      metallic: 0,
      roughness: 0.18,
      emissiveColor: [0.06, 0.72, 1],
      emissiveStrength: 1.4
    })],
    ["amber-status-light", new PBRMaterial({
      name: "turntable-amber-status-light",
      baseColor: [1, 0.62, 0.12, 1],
      metallic: 0,
      roughness: 0.2,
      emissiveColor: [1, 0.36, 0.06],
      emissiveStrength: 0.9
    })],
    ["magenta-status-light", new PBRMaterial({
      name: "turntable-magenta-status-light",
      baseColor: [0.94, 0.16, 0.86, 1],
      metallic: 0,
      roughness: 0.2,
      emissiveColor: [0.56, 0.04, 0.5],
      emissiveStrength: 0.82
    })],
    ["studio-stage", new TexturedUnlitMaterial({
      name: "turntable-studio-stage",
      texture: concrete,
      sampler,
      textureTransform: { scale: [7.5, 3.75] },
      color: [0.18, 0.2, 0.22, 1]
    })],
    ["studio-backdrop", new UnlitMaterial({
      name: "turntable-studio-backdrop",
      color: [0.018, 0.023, 0.03, 1]
    })],
    ["studio-accent-stripe", new TexturedUnlitMaterial({
      name: "turntable-studio-accent-stripe",
      texture: accentStripes,
      sampler,
      textureTransform: { scale: [2.8, 0.8] },
      color: [0.72, 0.62, 0.42, 1]
    })],
    ["paint-finish-reference", new TexturedUnlitMaterial({
      name: "turntable-metallic-paint-finish-reference",
      texture: paint,
      sampler,
      textureTransform: { scale: [2.4, 0.8] },
      color: [0.2, 0.12, 0.1, 1]
    })],
    ["studio-softbox", new UnlitMaterial({
      name: "turntable-studio-softbox-panel",
      color: [0.1, 0.12, 0.14, 1]
    })],
    ["dark-detail-line", new UnlitMaterial({
      name: "turntable-dark-detail-line",
      color: [0.018, 0.022, 0.026, 1]
    })],
    ["cyan-detail-line", new UnlitMaterial({
      name: "turntable-cyan-detail-line",
      color: [0.08, 0.34, 0.38, 1]
    })],
    ["warm-detail-line", new UnlitMaterial({
      name: "turntable-warm-detail-line",
      color: [0.52, 0.31, 0.18, 1]
    })]
  ]);
  const angle = fixture.rotationRadians;
  const includeStage = options.includeStage !== false;
  const collectedLights = createProductTurntableCollectedLights();
  const renderItems: RenderItem[] = [
    item(geometryLibrary, materialLibrary, "left-ear-shell", "ear-shell", "painted-shell", -0.56, 0.1, 0, 0.82, 1.08, 0.64, angle),
    item(geometryLibrary, materialLibrary, "right-ear-shell", "ear-shell", "painted-shell", 0.56, 0.1, 0, 0.82, 1.08, 0.64, angle),
    item(geometryLibrary, materialLibrary, "left-ear-pad", "ear-pad", "carbon-pad", -0.56, -0.02, 0.08, 0.56, 0.72, 0.26, angle),
    item(geometryLibrary, materialLibrary, "right-ear-pad", "ear-pad", "carbon-pad", 0.56, -0.02, 0.08, 0.56, 0.72, 0.26, angle),
    item(geometryLibrary, materialLibrary, "outer-headband", "headband", "brushed-trim", 0, 0.75, -0.05, 1.52, 0.14, 0.22, angle),
    item(geometryLibrary, materialLibrary, "inner-headband", "headband", "carbon-pad", 0, 0.56, 0.02, 1.16, 0.1, 0.18, angle),
    item(geometryLibrary, materialLibrary, "left-yoke", "headband", "brushed-trim", -0.54, 0.45, 0, 0.16, 0.64, 0.16, angle),
    item(geometryLibrary, materialLibrary, "right-yoke", "headband", "brushed-trim", 0.54, 0.45, 0, 0.16, 0.64, 0.16, angle),
      item(geometryLibrary, materialLibrary, "control-module", "control", "control-panel", 0.82, 0.04, 0.16, 0.18, 0.34, 0.12, angle),
    item(geometryLibrary, materialLibrary, "status-light", "accent", "status-light", 0.91, 0.08, 0.28, 0.16, 0.16, 0.16, angle),
    item(geometryLibrary, materialLibrary, "left-amber-accent", "accent", "amber-status-light", -0.96, 0.16, 0.24, 0.1, 0.1, 0.1, angle),
    item(geometryLibrary, materialLibrary, "right-magenta-accent", "accent", "magenta-status-light", 0.36, -0.34, 0.3, 0.1, 0.1, 0.1, angle)
  ];
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 5; index += 1) {
      renderItems.push(item(
        geometryLibrary,
        materialLibrary,
        `ear-pad-stitch-${side}-${index}`,
        "headband",
        index % 2 === 0 ? "dark-detail-line" : "cyan-detail-line",
        side * 0.56,
        -0.24 + index * 0.085,
        -0.22,
        0.46,
        0.014,
        0.012,
        angle
      ));
    }
    for (let index = 0; index < 7; index += 1) {
      renderItems.push(item(
        geometryLibrary,
        materialLibrary,
        `ear-pad-vertical-stitch-${side}-${index}`,
        "headband",
        index % 2 === 0 ? "dark-detail-line" : "cyan-detail-line",
        side * (0.34 + index * 0.075),
        -0.04,
        -0.235,
        0.012,
        0.43,
        0.012,
        angle
      ));
    }
    for (let index = 0; index < 4; index += 1) {
      renderItems.push(item(
        geometryLibrary,
        materialLibrary,
        `shell-highlight-strake-${side}-${index}`,
        "headband",
        index % 2 === 0 ? "warm-detail-line" : "dark-detail-line",
        side * (0.56 + index * 0.035),
        0.22 + index * 0.078,
        -0.24,
        0.34 - index * 0.035,
        0.012,
        0.012,
        angle
      ));
    }
    for (let index = 0; index < 7; index += 1) {
      renderItems.push(item(
        geometryLibrary,
        materialLibrary,
        `shell-machined-vertical-${side}-${index}`,
        "headband",
        index % 2 === 0 ? "warm-detail-line" : "dark-detail-line",
        side * (0.31 + index * 0.07),
        0.25,
        -0.245,
        0.012,
        0.58,
        0.012,
        angle
      ));
    }
  }
  for (let index = 0; index < 7; index += 1) {
    renderItems.push(item(
      geometryLibrary,
      materialLibrary,
      `headband-machined-groove-${index}`,
      "headband",
      index % 2 === 0 ? "dark-detail-line" : "cyan-detail-line",
      -0.58 + index * 0.19,
      0.78,
      -0.24,
      0.08,
      0.016,
      0.012,
      angle
    ));
  }
  for (let index = 0; index < 6; index += 1) {
    renderItems.push(item(
      geometryLibrary,
      materialLibrary,
      `control-module-ridge-${index}`,
      "headband",
      index % 2 === 0 ? "cyan-detail-line" : "dark-detail-line",
      0.78,
      -0.08 + index * 0.052,
      -0.26,
      0.16,
      0.01,
      0.01,
      angle
    ));
  }
  for (let index = 0; index < 6; index += 1) {
    renderItems.push(item(
      geometryLibrary,
      materialLibrary,
      `control-module-vertical-grille-${index}`,
      "headband",
      index % 2 === 0 ? "cyan-detail-line" : "dark-detail-line",
      0.72 + index * 0.035,
      0.06,
      -0.275,
      0.01,
      0.34,
      0.01,
      angle
    ));
  }
  if (includeStage) {
    renderItems.push(
      item(geometryLibrary, materialLibrary, "full-studio-backdrop", "stage", "studio-backdrop", 0, 0.18, -1.48, 7.8, 4.35, 0.05, 0),
      item(geometryLibrary, materialLibrary, "studio-stage", "stage", "studio-stage", 0, -0.62, -0.42, 4.4, 0.08, 0.16, 0),
      item(geometryLibrary, materialLibrary, "backdrop", "stage", "studio-backdrop", 0, 0.18, -1.12, 4.4, 2.25, 0.05, 0),
      item(geometryLibrary, materialLibrary, "stage-accent-stripe-left", "stage", "studio-accent-stripe", -1.04, -0.51, -0.34, 1.18, 0.035, 0.035, 0),
      item(geometryLibrary, materialLibrary, "stage-accent-stripe-right", "stage", "studio-accent-stripe", 1.04, -0.51, -0.34, 1.18, 0.035, 0.035, 0),
      item(geometryLibrary, materialLibrary, "left-softbox-panel", "stage", "studio-softbox", -1.78, 0.22, -0.94, 0.12, 1.16, 0.04, 0),
      item(geometryLibrary, materialLibrary, "right-softbox-panel", "stage", "studio-softbox", 1.78, 0.22, -0.94, 0.12, 1.16, 0.04, 0),
      item(geometryLibrary, materialLibrary, "top-softbox-panel", "stage", "studio-softbox", 0, 1.08, -0.94, 1.52, 0.07, 0.04, 0)
    );
    appendTurntableStageDetails(renderItems, geometryLibrary, materialLibrary);
  }
  const postprocess: RendererPostProcessOptions = {
    targetFormat: "rgba16f",
    toneMapping: {
      operator: "filmic",
      exposure: fixture.lighting.activePreset === "dramatic" ? 1.32 : 1.12,
      gamma: 2.2,
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    },
    colorGrade: {
      contrast: 1.1,
      saturation: 1.08,
      vibrance: 0.16,
      vignette: 0.12,
      sharpening: 0.28
    },
    bloom: { threshold: 0.78, intensity: 0.12, radius: 1 },
    fxaa: true
  };
  const source: RenderSource = {
    renderItems,
    cameraPolicy: "auto-frame",
    cameraFrameBounds: { min: [-1.35, -0.52, -0.38], max: [1.35, 1, 0.42] },
    collectedLights,
    environmentLighting: environment.lighting,
    shadow: {
      enabled: true,
      light: collectedLights[0]?.source,
      size: 768,
      strength: 0.42,
      bias: 0.0025,
      slopeBias: 1.2,
      filter: "pcf",
      pcfRadius: 1.25,
      pcfSamples: 9
    },
    postprocess,
    frustumCulling: false
  };
  return {
    fixture,
    source,
    renderItems,
    geometryLibrary,
    materialLibrary,
    bounds: { min: [-2.2, -0.7, -1.18], max: [2.2, 1.13, 0.44] },
    postprocess,
    dispose: () => {
      for (const geometry of geometryLibrary.values()) geometry.dispose();
      for (const texture of textures) texture.dispose();
    }
  };
}

function appendTurntableStageDetails(
  renderItems: RenderItem[],
  geometryLibrary: ReadonlyMap<string, Geometry>,
  materialLibrary: ReadonlyMap<string, RenderMaterial>
): void {
  for (let index = 0; index < 5; index += 1) {
    renderItems.push(item(
      geometryLibrary,
      materialLibrary,
      `studio-floor-perspective-line-${index}`,
      "stage",
      "dark-detail-line",
      -1.2 + index * 0.6,
      -0.62,
      -0.305,
      0.006,
      0.58,
      0.009,
      0
    ));
  }
  for (let index = 0; index < 3; index += 1) {
    renderItems.push(item(
      geometryLibrary,
      materialLibrary,
      `studio-floor-cross-reference-${index}`,
      "stage",
      "dark-detail-line",
      0,
      -0.74 + index * 0.14,
      -0.295,
      1.42,
      0.007,
      0.009,
      0
    ));
  }
}

function createProductTurntableCollectedLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("turntable-key-shadow");
  const fill = new DirectionalLight("turntable-fill");
  const rim = new DirectionalLight("turntable-rim");
  key.castsShadow = true;
  key.color = [1, 0.92, 0.78];
  key.intensity = 2.35;
  fill.color = [0.5, 0.64, 0.95];
  fill.intensity = 0.52;
  rim.color = [0.85, 0.92, 1];
  rim.intensity = 0.92;
  return [
    {
      kind: "directional",
      color: [1, 0.92, 0.78],
      intensity: 2.35,
      position: [0, 0, 0],
      direction: [0.42, -0.64, -0.64],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: true,
      layerMask: 0xffffffff,
      source: key
    },
    {
      kind: "directional",
      color: [0.5, 0.64, 0.95],
      intensity: 0.52,
      position: [0, 0, 0],
      direction: [-0.5, -0.3, -0.82],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: fill
    },
    {
      kind: "directional",
      color: [0.85, 0.92, 1],
      intensity: 0.92,
      position: [0, 0, 0],
      direction: [-0.15, -0.12, 0.98],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: rim
    }
  ];
}

function createHotspots(rotationRadians: number, canvasWidth: number, canvasHeight: number): readonly ProductTurntableHotspot[] {
  const anchors = [
    {
      id: "material-finish",
      group: "material" as const,
      label: "Metallic shell",
      content: "Product finish, carbon accent, and procedural roughness maps are bound through the current renderer.",
      position: [-0.3, 0.24, 0.18] as const,
      threshold: -0.15
    },
    {
      id: "comfort-band",
      group: "comfort" as const,
      label: "Comfort band",
      content: "Generated multi-part glTF geometry keeps headband and cushion slots independently selectable.",
      position: [0, 0.52, 0.1] as const,
      threshold: -0.05
    },
    {
      id: "control-module",
      group: "controls" as const,
      label: "Control module",
      content: "The selected controls part is exposed in runtime state for ecommerce hotspot evidence.",
      position: [0.38, 0.06, 0.2] as const,
      threshold: -0.1
    }
  ];

  return anchors.map((anchor, index) => {
    const projected = projectHotspot(anchor.position, rotationRadians, canvasWidth, canvasHeight, index);
    return {
      id: anchor.id,
      group: anchor.group,
      label: anchor.label,
      content: anchor.content,
      position: anchor.position,
      screen: projected,
      visibilityThreshold: anchor.threshold
    };
  });
}

function productTurntableEnvironmentPreset(preset: ProductTurntableLightingPreset): "studio" | "softbox" | "inspection" | "exhibit" {
  if (preset === "soft" || preset === "neutral") return "softbox";
  if (preset === "inspection") return "inspection";
  if (preset === "dramatic") return "exhibit";
  return "studio";
}

function item(
  geometryLibrary: ReadonlyMap<string, Geometry>,
  materialLibrary: ReadonlyMap<string, RenderMaterial>,
  label: string,
  geometryId: string,
  materialId: string,
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  yawRadians: number
): RenderItem {
  const geometry = geometryLibrary.get(geometryId);
  const material = materialLibrary.get(materialId);
  if (!geometry) throw new Error(`Missing product turntable geometry: ${geometryId}`);
  if (!material) throw new Error(`Missing product turntable material: ${materialId}`);
  return {
    geometry,
    material,
    label,
    modelMatrix: modelMatrix(tx, ty, tz, sx, sy, sz, yawRadians)
  };
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, yawRadians: number): Float32Array {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return new Float32Array([
    cos * sx, 0, -sin * sx, 0,
    0, sy, 0, 0,
    sin * sz, 0, cos * sz, 0,
    tx, ty, tz, 1
  ]);
}

function projectHotspot(
  position: readonly [number, number, number],
  rotationRadians: number,
  canvasWidth: number,
  canvasHeight: number,
  index: number
): ProductTurntableHotspot["screen"] {
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const x = position[0] * cos - position[2] * sin;
  const z = position[0] * sin + position[2] * cos;
  const screenX = Math.round(canvasWidth * (0.5 + x * 0.36));
  const screenY = Math.round(canvasHeight * (0.5 - position[1] * 0.42 + index * 0.018));
  return {
    x: screenX,
    y: screenY,
    visible: z > -0.38 && screenX >= 0 && screenX <= canvasWidth && screenY >= 0 && screenY <= canvasHeight,
    occluded: false
  };
}

function createLighting(activePreset: ProductTurntableLightingPreset): ProductTurntableLighting {
  const descriptor = lightingPresets[activePreset];
  return {
    source: "origin-master-ecommerce-lighting-preset-manager-adapted",
    presets: ["studio", "soft", "inspection", "dramatic", "neutral"],
    activePreset,
    transitionSupported: true,
    ...descriptor
  };
}

function createCapturePlan(captureRequested: boolean, exportedBytes: number): ProductTurntableCapturePlan {
  const completedBatchTasks = captureRequested && exportedBytes > 0 ? 3 : 2;
  return {
    source: "origin-master-ecommerce-capture-batch-export-adapted",
    screenshotFormats: ["png", "jpeg", "webp"],
    screenshotViews: ["hero", "front", "detail", "exploded"],
    spinFrameCount: 72,
    spinDurationSeconds: 4,
    batchTasks: ["thumbnail", "screenshot", "360-spin", "ar-export"],
    completedBatchTasks,
    captureRequested,
    exportedBytes,
    arExportFormats: ["glb"],
    blockedExportClaims: [
      "native-USDZ-export",
      "browser-video-recording-pipeline",
      "AR-Quick-Look-and-Scene-Viewer-platform-parity",
      "ecommerce-PIM-or-commerce-platform-integration"
    ]
  };
}

function finiteOrDefault(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) && value !== Number.POSITIVE_INFINITY) throw new RangeError(`${name} must be finite.`);
  return value;
}

function integerOrDefault(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer.`);
  return value;
}

function hashProductTurntable(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const scaled = Math.round(value * 1000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
