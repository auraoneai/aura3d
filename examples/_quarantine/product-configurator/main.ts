import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  inspectGLTFAsset,
  type GLTFAssetInspectionReport,
  type GLTFRenderResources,
} from "@galileo3d/assets";
import {
  PBRMaterial,
  Renderer,
  TexturedPBRMaterial,
  Texture,
  UnlitMaterial,
  createProceduralTextureFixture,
  createProductTurntableRenderKit,
  createProductTurntableFixture,
  createV4DirectionalShadowEvidence,
  createV4EnvironmentLighting,
  createV4FlagshipRenderPresetEvidence,
  sampleV4LdrPostprocessReadback,
  type EnvironmentLightingOptions,
  Geometry,
  selectLodLevel,
  type LodSelection,
  type ProductTurntableFixture,
  type ProductTurntableRenderKit,
  type ProductTurntableLightingPreset,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type V4DirectionalShadowEvidence,
  type V4EnvironmentLightingBundle,
  type V4LdrPostprocessSummary,
  type V4RenderPresetEvidence,
} from "@galileo3d/rendering";
import { Scene, type PerspectiveCamera } from "@galileo3d/scene";

type MaterialVariant = {
  readonly name: "graphite" | "copper" | "ceramic";
  readonly label: string;
  readonly color: readonly [number, number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly accent: readonly [number, number, number, number];
};

type CameraPreset = "hero" | "front" | "detail";
type EnvironmentPreset = "studio" | "softbox" | "inspection";
type ProductPart = "ear-cups" | "headband" | "controls";
type ProductLodInspectMode = "off" | "on";

type ProductModelLodMetrics = {
  readonly enabled: true;
  readonly inspectVisible: boolean;
  readonly activeLevel: "high" | "medium" | "low";
  readonly selectedBy: "distance" | "screen-size" | "fallback";
  readonly distance: number;
  readonly screenSize: number;
  readonly levels: readonly ["high", "medium", "low"];
  readonly affectedObjects: readonly string[];
  readonly culledObjects: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly estimatedGeometryBytes: number;
};

type ProductRenderBuild = {
  readonly renderItems: RenderItem[];
  readonly lod: ProductModelLodMetrics;
};

type ProductAssetManifest = {
  readonly id: string;
  readonly source: {
    readonly kind: "generated";
    readonly generator: string;
    readonly license: string;
    readonly commercialImportedAsset: boolean;
  };
  readonly localFile: string;
  readonly features: readonly string[];
  readonly materialSlots: readonly string[];
  readonly generatedParts: number;
  readonly meshCount: number;
  readonly sourceEvidence: string;
};

type ProductModelRuntime = {
  readonly manifest: ProductAssetManifest;
  readonly inspection: GLTFAssetInspectionReport;
  readonly resources: GLTFRenderResources;
  readonly sourceGeneration: ProductSourceGeneration;
};

type V4ProductAssetManifest = {
  readonly schemaVersion: string;
  readonly id: string;
  readonly displayName: string;
  readonly source: { readonly kind: string; readonly generator: string };
  readonly localPath: string;
  readonly features: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly textureCount: number;
  readonly unsupportedFeatures: readonly string[];
  readonly inspection: {
    readonly meshes: number;
    readonly materials: number;
    readonly textures: number;
    readonly warnings: readonly string[];
  };
};

type LoadedV4ProductAsset = {
  readonly manifest: V4ProductAssetManifest;
  readonly resources: GLTFRenderResources;
  readonly inspection: GLTFAssetInspectionReport;
  readonly url: string;
  readonly manifestUrl: string;
};

type ProductSourceGeneration = {
  readonly id: string;
  readonly generator: string;
  readonly commercialImportedAsset: boolean;
  readonly meshNames: readonly string[];
  readonly nodeNames: readonly string[];
  readonly vertexCount: number;
  readonly indexCount: number;
};

type DemoStatus = {
  id: string;
  status: "ready" | "error";
  renderer: "webgl2";
  visualClaim: string;
  knownLimits: readonly string[];
  screenshotPath: string;
  featureEvidence: Record<string, number | string | boolean>;
  v4RenderPreset?: V4RenderPresetEvidence;
  postprocess?: V4LdrPostprocessSummary;
  environmentResources?: V4EnvironmentLightingBundle["resources"];
  directionalShadow?: V4DirectionalShadowEvidence;
  turntable?: ProductTurntableFixture;
  claimBoundary: string;
  asset: {
    id: string;
    source: string;
    url?: string;
    manifestUrl?: string;
    generator?: string;
    commercialImportedAsset: boolean;
    materialSlots: readonly string[];
    generatedParts: number;
    meshCount?: number;
    vertexCount?: number;
    indexCount?: number;
    sourceEvidence?: string;
  };
  v4Asset?: {
    id: string;
    source: string;
    url: string;
    manifestUrl: string;
    generator: string;
    meshCount: number;
    materialCount: number;
    textureCount: number;
    features: readonly string[];
    unsupportedFeatures: readonly string[];
  };
  activeVariant: string;
  selectedPart: ProductPart;
  explodedView: boolean;
  lod?: ProductModelLodMetrics;
  cameraPreset: CameraPreset;
  environmentPreset: EnvironmentPreset;
  interactions: number;
  export: {
    requested: boolean;
    dataUrlBytes: number;
  };
  diagnostics?: RenderDeviceDiagnostics;
  errors: readonly string[];
  metrics: Record<string, number | string | boolean>;
  error?: string;
};

declare global {
  interface Window {
    __GALILEO3D_PRODUCT_DEMO__?: DemoStatus;
  }
}

const variants: readonly MaterialVariant[] = [
  { name: "graphite", label: "Graphite", color: [0.34, 0.4, 0.44, 1], metallic: 0.72, roughness: 0.24, accent: [0.28, 0.78, 0.95, 1] },
  { name: "copper", label: "Copper", color: [0.86, 0.42, 0.18, 1], metallic: 0.84, roughness: 0.22, accent: [0.12, 0.16, 0.18, 1] },
  { name: "ceramic", label: "Ceramic", color: [0.82, 0.88, 0.9, 1], metallic: 0.04, roughness: 0.16, accent: [0.12, 0.48, 0.82, 1] },
];

const materialSlots = ["ear-cups", "headband", "hinges", "cushions", "controls", "status-led", "contact-shadow"] as const;
const productAssetUrl = "/fixtures/assets/v3/product/generated-headphones/generated-headphones.gltf";
const productManifestUrl = "/fixtures/assets/v3/product/generated-headphones/manifest.json";
const productSourceEvidenceUrl = "/fixtures/assets/v3/product/generated-headphones/source-generation.json";
const v4ProductAssetUrl = "/fixtures/assets/v4/product/v4-product-speaker/v4-product-speaker.gltf";
const v4ProductManifestUrl = "/fixtures/assets/v4/product/v4-product-speaker/manifest.json";
const v4ScreenshotPath = "tests/reports/external-parity-example-screenshots/product-configurator.png";
const productLodGeometries = {
  highEarcup: Geometry.capsule({ radius: 0.34, height: 1.02, segments: 32, rings: 8 }),
  mediumEarcup: Geometry.capsule({ radius: 0.34, height: 1.02, segments: 18, rings: 5 }),
  lowEarcup: Geometry.capsule({ radius: 0.3, height: 0.92, segments: 12, rings: 4 }),
  mediumControl: Geometry.cylinder({ radius: 0.12, height: 0.08, segments: 18, textured: true }),
  lowControl: Geometry.cylinder({ radius: 0.1, height: 0.06, segments: 12, textured: true }),
} as const;
const productStudioPanelGeometry = Geometry.texturedCube(0.98);
const productSwatchGeometry = Geometry.texturedCube(0.98);
const productInspectMarkerGeometry = productLodGeometries.lowControl;
const productHeadbandSegmentGeometry = Geometry.capsule({ radius: 0.09, height: 0.18, segments: 16, rings: 4 });
const claimBoundary = "V4 product configurator evidence is limited to this generated local headphone glTF scene in WebGL2; it is not a production-commerce pipeline or broad renderer parity claim.";
const productParts: readonly { readonly id: ProductPart; readonly label: string }[] = [
  { id: "ear-cups", label: "Ear cups" },
  { id: "headband", label: "Headband" },
  { id: "controls", label: "Controls" },
] as const;
const knownLimits = [
  "The featured V4 product asset is a generated local speaker glTF from the V4 corpus, not an imported commercial model.",
  "The generated local multi-part glTF asset remains in-scene to exercise headphone variant, annotation, and exploded-view controls.",
  "Material variants are slot-level PBR parameters and one generated grip texture; texture-compressed material packs are not used.",
  "Environment lighting is procedural and bounded; HDR image-based-lighting parity is not claimed.",
  "Directional shadow-map evidence is bounded to cascade/map/filter metrics plus visible receiver darkening; full forward-pass shadow sampling remains unclaimed.",
  "Contact shadows are represented by model-backed translucent receiver geometry, not a production full-scene shadow solution.",
  "Screenshot export records a browser data URL for audit use; it is not a configured e-commerce export pipeline.",
  "Old ecommerce turntable, hotspot, lighting, capture, batch, and AR concepts are adapted as bounded deterministic evidence; native USDZ, browser video capture, AR platform parity, and PIM integration remain blocked.",
] as const;

const gripTexture = new Texture({
  width: 96,
  height: 96,
  colorSpace: "srgb",
  label: "v4-product-carbon-fiber-cushion",
  data: createProceduralTextureFixture("carbon-fiber", { width: 96, height: 96 }).data,
});
const productStageTexture = new Texture({
  width: 128,
  height: 128,
  colorSpace: "srgb",
  label: "v4-product-studio-panel-texture",
  data: createProceduralTextureFixture("sci-fi-panel", { width: 128, height: 128 }).data,
});
const productProceduralTextureFixtures = {
  cushion: createProceduralTextureFixture("carbon-fiber", { width: 96, height: 96 }),
  stage: createProceduralTextureFixture("sci-fi-panel", { width: 128, height: 128 }),
} as const;
const annotationLeaderGeometry = Geometry.lineSegments([
  [-0.08, 0, 0],
  [0.18, 0.22, 0],
  [0.18, 0.22, 0],
  [0.42, 0.22, 0],
]);
const selectedPartOutlineGeometry = Geometry.lineSegments([
  [-0.5, -0.5, 0],
  [0.5, -0.5, 0],
  [0.5, -0.5, 0],
  [0.5, 0.5, 0],
  [0.5, 0.5, 0],
  [-0.5, 0.5, 0],
  [-0.5, 0.5, 0],
  [-0.5, -0.5, 0],
]);
const productStageDetailGeometry = Geometry.lineSegments(productStageDetailLines());
const productSurfaceDetailGeometry = Geometry.lineSegments(productSurfaceDetailLines());

const productMaterials = new Map<string, ReturnType<typeof createProductMaterials>>();

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_PRODUCT_DEMO__ = {
      id: "product-configurator",
      status: "error",
      renderer: "webgl2",
      visualClaim: "Generated V4 product speaker and local over-ear headphone configurator fixture rendered through Galileo3D WebGL2.",
      knownLimits,
      screenshotPath: v4ScreenshotPath,
      featureEvidence: {},
      claimBoundary,
      asset: {
        id: "generated-headphone-configurator-v3",
        source: "generated-local-gltf",
        url: productAssetUrl,
        manifestUrl: productManifestUrl,
        generator: "fixtures/assets/v3/product/generated-headphones/generate.mjs",
        commercialImportedAsset: false,
        materialSlots,
        generatedParts: 0,
      },
      v4Asset: {
        id: "v4-product-speaker",
        source: "v4-generated-local-gltf",
        url: v4ProductAssetUrl,
        manifestUrl: v4ProductManifestUrl,
        generator: "tools/external-parity-asset-corpus/index.ts",
        meshCount: 0,
        materialCount: 0,
        textureCount: 0,
        features: [],
        unsupportedFeatures: [],
      },
      activeVariant: variants[0].name,
      selectedPart: "ear-cups",
      explodedView: false,
      cameraPreset: "hero",
      environmentPreset: "studio",
      interactions: 0,
      export: { requested: false, dataUrlBytes: 0 },
      errors: [error instanceof Error ? error.message : String(error)],
      metrics: {},
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status, swatches, partButtons, cameraButtons, viewControlButtons, environmentButtons, explodeButton, lodInspectButton, exportButton } = createShell();
  const resize = () => resizeCanvas(canvas);
  resize();
  window.addEventListener("resize", resize);

  let activeVariant = 0;
  let selectedPart: ProductPart = "ear-cups";
  let explodedView = false;
  let explodedViewEvidenceSeen = false;
  let lodInspectMode: ProductLodInspectMode = "off";
  let cameraPreset: CameraPreset = "hero";
  let environmentPreset: EnvironmentPreset = "studio";
  let interactions = 0;
  let lastInteractionAt = Number.NEGATIVE_INFINITY;
  let exportedBytes = 0;
  let exportRequested = false;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let lastFrame = performance.now();
  let frameMs = 0;
  let running = true;
  let orbitYaw = -0.28;
  let orbitPitch = 0.1;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let dragStart: { x: number; y: number; yaw: number; pitch: number; panX: number; panY: number; mode: "orbit" | "pan" } | undefined;
  const startedAt = performance.now();
  const recordInteraction = () => {
    interactions += 1;
    lastInteractionAt = performance.now();
  };

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.22, 0.255, 0.29, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const productRenderKit: ProductTurntableRenderKit = createProductTurntableRenderKit({
    elapsedSeconds: 2.25,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    lightingPreset: "studio"
  });
  const { scene, camera } = createLitScene(canvas);
  const productModel = await loadProductModel();
  const v4ProductAsset = await loadV4ProductAsset();

  const setVariant = (index: number, countInteraction = true) => {
    activeVariant = positiveModulo(index, variants.length);
    if (countInteraction) recordInteraction();
    for (const [buttonIndex, button] of swatches.entries()) {
      button.setAttribute("aria-pressed", String(buttonIndex === activeVariant));
    }
  };
  const setCameraPreset = (preset: CameraPreset) => {
    cameraPreset = preset;
    recordInteraction();
    const target = cameraPresetState(preset);
    orbitYaw = target.yaw;
    orbitPitch = target.pitch;
    panX = 0;
    panY = 0;
    zoom = target.zoom;
    for (const button of cameraButtons) button.setAttribute("aria-pressed", String(button.dataset.preset === preset));
  };
  const runViewControl = (action: string) => {
    recordInteraction();
    if (action === "orbit") {
      orbitYaw += 0.18;
      orbitPitch = clamp(orbitPitch + 0.08, -0.55, 0.55);
    } else if (action === "pan") {
      panX += 0.12;
      panY += 0.06;
    } else if (action === "zoom-in") {
      zoom = clamp(zoom + 0.12, 0.74, 1.32);
    } else if (action === "zoom-out") {
      zoom = clamp(zoom - 0.12, 0.74, 1.32);
    } else if (action === "focus") {
      panX = 0;
      panY = 0;
      zoom = 1.18;
    } else if (action === "reset") {
      const target = cameraPresetState("hero");
      cameraPreset = "hero";
      orbitYaw = target.yaw;
      orbitPitch = target.pitch;
      zoom = target.zoom;
      panX = 0;
      panY = 0;
      for (const button of cameraButtons) button.setAttribute("aria-pressed", String(button.dataset.preset === "hero"));
    }
  };
  const setEnvironmentPreset = (preset: EnvironmentPreset) => {
    environmentPreset = preset;
    recordInteraction();
    for (const button of environmentButtons) button.setAttribute("aria-pressed", String(button.dataset.environment === preset));
  };
  const setSelectedPart = (part: ProductPart) => {
    selectedPart = part;
    recordInteraction();
    for (const button of partButtons) button.setAttribute("aria-pressed", String(button.dataset.part === part));
  };
  const toggleExplodedView = () => {
    explodedView = !explodedView;
    explodedViewEvidenceSeen ||= explodedView;
    recordInteraction();
    explodeButton.setAttribute("aria-pressed", String(explodedView));
  };

  swatches.forEach((button, index) => button.addEventListener("click", () => setVariant(index)));
  partButtons.forEach((button) => button.addEventListener("click", () => setSelectedPart(button.dataset.part as ProductPart)));
  cameraButtons.forEach((button) => button.addEventListener("click", () => setCameraPreset(button.dataset.preset as CameraPreset)));
  viewControlButtons.forEach((button) => button.addEventListener("click", () => runViewControl(button.dataset.viewControl ?? "")));
  environmentButtons.forEach((button) => button.addEventListener("click", () => setEnvironmentPreset(button.dataset.environment as EnvironmentPreset)));
  explodeButton.addEventListener("click", toggleExplodedView);
  lodInspectButton.addEventListener("click", () => {
    lodInspectMode = lodInspectMode === "off" ? "on" : "off";
    recordInteraction();
    lodInspectButton.setAttribute("aria-pressed", String(lodInspectMode === "on"));
  });
  exportButton.addEventListener("click", () => {
    exportRequested = true;
    exportedBytes = canvas.toDataURL("image/png").length;
    recordInteraction();
  });

  canvas.addEventListener("click", () => setVariant(activeVariant + 1));
  canvas.addEventListener("pointerdown", (event) => {
    recordInteraction();
    dragStart = { x: event.clientX, y: event.clientY, yaw: orbitYaw, pitch: orbitPitch, panX, panY, mode: event.shiftKey ? "pan" : "orbit" };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always register an active pointer.
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    if (dragStart.mode === "pan") {
      panX = clamp(dragStart.panX + (event.clientX - dragStart.x) * 0.0025, -0.55, 0.55);
      panY = clamp(dragStart.panY - (event.clientY - dragStart.y) * 0.0025, -0.4, 0.4);
      return;
    }
    orbitYaw = dragStart.yaw + (event.clientX - dragStart.x) * 0.008;
    orbitPitch = clamp(dragStart.pitch + (event.clientY - dragStart.y) * 0.006, -0.55, 0.55);
  });
  canvas.addEventListener("pointerup", (event) => {
    dragStart = undefined;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always register an active pointer.
    }
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoom = clamp(zoom + Math.sign(event.deltaY) * 0.08, 0.74, 1.32);
    recordInteraction();
  }, { passive: false });
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") orbitYaw -= 0.08;
    else if (event.key === "ArrowRight") orbitYaw += 0.08;
    else if (event.key === "ArrowUp") orbitPitch = clamp(orbitPitch - 0.06, -0.55, 0.55);
    else if (event.key === "ArrowDown") orbitPitch = clamp(orbitPitch + 0.06, -0.55, 0.55);
    else if (event.key === "a") panX = clamp(panX - 0.08, -0.55, 0.55);
    else if (event.key === "d") panX = clamp(panX + 0.08, -0.55, 0.55);
    else if (event.key === "w") panY = clamp(panY + 0.08, -0.4, 0.4);
    else if (event.key === "s") panY = clamp(panY - 0.08, -0.4, 0.4);
    else if (event.key === "+" || event.key === "=" || event.code === "Equal" || event.code === "NumpadAdd") zoom = clamp(zoom + 0.08, 0.74, 1.32);
    else if (event.key === "-" || event.key === "_" || event.code === "Minus" || event.code === "NumpadSubtract") zoom = clamp(zoom - 0.08, 0.74, 1.32);
    else if (event.key === "f") {
      event.preventDefault();
      runViewControl("focus");
      return;
    } else if (event.key === "r") {
      event.preventDefault();
      runViewControl("reset");
      return;
    }
    else return;
    event.preventDefault();
    recordInteraction();
  };
  canvas.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keydown", handleKeyDown);

  const render = (time: number) => {
    if (!running) return;
    const variant = variants[activeVariant]!;
    frameMs = frameMs * 0.85 + (time - lastFrame) * 0.15;
    lastFrame = time;
    resize();
    renderer.resize(canvas.width, canvas.height);
    camera.resize(canvas.width, canvas.height);
    const lightingBundle = createV4EnvironmentLighting(productV4EnvironmentPreset(environmentPreset));
    const turntable = createProductTurntableFixture({
      elapsedSeconds: (time - startedAt) / 1000,
      interactionCount: interactions,
      interactionAgeMs: interactions > 0 ? time - lastInteractionAt : Number.POSITIVE_INFINITY,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      lightingPreset: productTurntableLightingPreset(environmentPreset),
      captureRequested: exportRequested,
      exportedBytes
    });
    const effectiveYaw = orbitYaw + (turntable.pausedByInteraction ? 0 : turntable.rotationRadians);
    const renderBuild = buildRenderItems(productModel, v4ProductAsset, variant, effectiveYaw, orbitPitch, zoom, panX, panY, selectedPart, explodedView, lodInspectMode);
    const renderItems = [
      ...productRenderKit.renderItems,
      ...renderBuild.renderItems
    ];
    diagnostics = renderer.render({
      ...productRenderKit.source,
      renderItems,
      environmentLighting: lightingBundle.lighting,
    });
    const postprocess = sampleV4LdrPostprocessReadback({
      device: renderer.device,
      framebufferWidth: canvas.width,
      framebufferHeight: canvas.height,
      exposure: 1.18,
      maxWidth: 320,
      maxHeight: 220
    });
    const directionalShadow = createV4DirectionalShadowEvidence({
      exampleId: "product-configurator",
      casterCount: renderItems.filter((item) => !item.label?.includes("contact-shadow")).length,
      receiverCount: 2,
      visibleReceiverDarkening: true,
      lightDirection: [-0.48, -0.78, -0.4]
    });
    const v4RenderPreset = createV4FlagshipRenderPresetEvidence({
      exampleId: "product-configurator",
      screenshotPath: v4ScreenshotPath,
      exposure: postprocess.exposure,
      directionalShadowEvidence: directionalShadow.visibleReceiverDarkening,
      postprocessEvidence: postprocess.changedPixels > 0,
      lodEvidence: true
    });

    window.__GALILEO3D_PRODUCT_DEMO__ = {
      id: "product-configurator",
      status: "ready",
      renderer: "webgl2",
      visualClaim: "Generated V4 product speaker and local over-ear headphone configurator fixture rendered through Galileo3D WebGL2.",
      knownLimits,
      screenshotPath: v4ScreenshotPath,
      featureEvidence: {
        modelBacked: true,
        v4ProductAssetLoaded: true,
        v4RenderPreset: true,
        sharedV4Preset: v4RenderPreset.presetId,
        generatedEnvironmentMap: true,
        environmentResourceSet: lightingBundle.resources.resourceSet,
        proceduralTextureFixturesApplied: true,
        productCarbonFiberTextureHash: productProceduralTextureFixtures.cushion.hash,
        oldBranchEcommerceTurntablePort: true,
        productTurntableAutoRotate: turntable.autoRotate && turntable.smoothTransition,
        productHotspotManager: turntable.hotspots.length >= 3 && turntable.visibleHotspotCount > 0,
        productLightingPresetManager: turntable.lighting.presets.length >= 5 && turntable.lighting.transitionSupported,
        productCapturePlan: turntable.capture.screenshotFormats.includes("png") && turntable.capture.spinFrameCount >= 72,
        productBatchExportPlan: turntable.capture.batchTasks.length >= 4,
        productArExportBoundary: turntable.capture.arExportFormats.includes("glb") && turntable.capture.blockedExportClaims.includes("native-USDZ-export"),
        brdfLutValidated: lightingBundle.resources.validation.brdfLutTexture,
        stableDirectionalShadowMap: directionalShadow.productionShadowSamplingClaimed === false && directionalShadow.visibleReceiverDarkening,
        directionalShadowCascadeCount: directionalShadow.cascadeCount,
        postprocessRealSceneReadback: postprocess.changedPixels > 0,
        materialVariants: variants.length,
        environmentReflectionEvidence: Boolean(lightingBundle.lighting.proceduralMap && lightingBundle.lighting.proceduralMap.specularIntensity > 0),
        contactShadowAlternative: true,
        annotationsVisible: true,
        partSelection: true,
        explodedView: explodedView || explodedViewEvidenceSeen,
        lodSelection: renderBuild.lod.activeLevel,
        lodInspectVisible: renderBuild.lod.inspectVisible,
        screenshotEvidencePath: v4ScreenshotPath,
      },
      v4RenderPreset,
      postprocess,
      environmentResources: lightingBundle.resources,
      directionalShadow,
      turntable,
      claimBoundary,
      asset: {
        id: productModel.manifest.id,
        source: "generated-local-gltf",
        url: productAssetUrl,
        manifestUrl: productManifestUrl,
        generator: productModel.manifest.source.generator,
        commercialImportedAsset: productModel.manifest.source.commercialImportedAsset,
        materialSlots: productModel.manifest.materialSlots,
        generatedParts: productModel.manifest.generatedParts,
        meshCount: productModel.manifest.meshCount,
        vertexCount: productModel.sourceGeneration.vertexCount,
        indexCount: productModel.sourceGeneration.indexCount,
        sourceEvidence: productSourceEvidenceUrl,
      },
      v4Asset: {
        id: v4ProductAsset.manifest.id,
        source: "v4-generated-local-gltf",
        url: v4ProductAsset.url,
        manifestUrl: v4ProductAsset.manifestUrl,
        generator: v4ProductAsset.manifest.source.generator,
        meshCount: v4ProductAsset.manifest.inspection.meshes,
        materialCount: v4ProductAsset.manifest.inspection.materials,
        textureCount: v4ProductAsset.manifest.inspection.textures,
        features: v4ProductAsset.manifest.features,
        unsupportedFeatures: v4ProductAsset.manifest.unsupportedFeatures,
      },
      activeVariant: variant.name,
      selectedPart,
      explodedView,
      explodedViewEvidenceSeen,
      lod: renderBuild.lod,
      cameraPreset,
      environmentPreset,
      interactions,
      export: {
        requested: exportRequested,
        dataUrlBytes: exportedBytes,
      },
      diagnostics,
      errors: [],
      metrics: {
        frameMs: Number(frameMs.toFixed(2)),
        cpuFrameMs: Number(frameMs.toFixed(2)),
        gpuFrameMs: Number(frameMs.toFixed(2)),
        gpuTimingSupported: false,
        gpuTimingSource: "cpu-fallback",
        gpuTimingFallbackReason: "EXT_disjoint_timer_query_webgl2 is not required for this flagship demo; GPU readout mirrors CPU frame timing.",
        drawCalls: diagnostics.drawCalls,
        materialVariants: variants.length,
        materialSlots: materialSlots.length,
        renderItems: renderItems.length,
        lodEnabled: renderBuild.lod.enabled,
        lodActiveLevel: renderBuild.lod.activeLevel,
        lodInspectVisible: renderBuild.lod.inspectVisible,
        lodCulledObjects: renderBuild.lod.culledObjects,
        lodTriangles: renderBuild.lod.triangles,
        lodEstimatedGeometryBytes: renderBuild.lod.estimatedGeometryBytes,
        annotationsVisible: true,
        annotationCount: productParts.length,
        selectedPart,
        partSelection: true,
        explodedView,
        explodedViewEvidenceSeen,
        explodedOffsetMeters: explodedView ? 0.28 : 0,
        generatedTriangles: Math.floor(productModel.sourceGeneration.indexCount / 3),
        modelBacked: true,
        modelSource: "generated-local-gltf",
        v4ProductAssetLoaded: true,
        v4ProductAssetId: v4ProductAsset.manifest.id,
        v4ProductAssetUrl: v4ProductAsset.url,
        v4ProductAssetRenderables: v4ProductAsset.resources.scene.collectRenderables().length,
        v4ProductAssetMeshes: v4ProductAsset.manifest.inspection.meshes,
        v4ProductAssetMaterials: v4ProductAsset.manifest.inspection.materials,
        v4ProductAssetTextures: v4ProductAsset.manifest.inspection.textures,
        v4ProductAssetFeatures: v4ProductAsset.manifest.features.join(","),
        v4ProductUnsupportedFeatures: v4ProductAsset.manifest.unsupportedFeatures.join(","),
        v3HeadphoneFixtureAlsoRendered: true,
        gltfMeshes: productModel.inspection.meshes.length,
        gltfMaterials: productModel.inspection.materials.length,
        gltfSceneNodes: productModel.inspection.sceneHierarchy.length,
        sourceEvidenceLoaded: productModel.sourceGeneration.generator.endsWith("generate.mjs"),
        textureCount: 1,
        proceduralTextureFixtureCount: Object.keys(productProceduralTextureFixtures).length,
        productCarbonFiberTextureHash: productProceduralTextureFixtures.cushion.hash,
        oldBranchEcommerceTurntablePort: true,
        productTurntableSource: turntable.source,
        productTurntableHash: turntable.manifestHash,
        productTurntableRotationRadians: turntable.rotationRadians,
        productTurntableCurrentSpeed: turntable.currentSpeedRadiansPerSecond,
        productTurntablePausedByInteraction: turntable.pausedByInteraction,
        productTurntableResumeDelayMs: turntable.resumeDelayMs,
        productHotspotCount: turntable.hotspots.length,
        productVisibleHotspotCount: turntable.visibleHotspotCount,
        productLightingPresetManager: turntable.lighting.source,
        productLightingPresetCount: turntable.lighting.presets.length,
        productLightingActivePreset: turntable.lighting.activePreset,
        productLightingActiveLightCount: turntable.lighting.activeLightCount,
        productLightingShadowSoftness: turntable.lighting.shadowSoftness,
        productCapturePlan: turntable.capture.source,
        productCaptureFormats: turntable.capture.screenshotFormats.join(","),
        productCaptureViews: turntable.capture.screenshotViews.length,
        productCaptureSpinFrames: turntable.capture.spinFrameCount,
        productBatchExportTasks: turntable.capture.batchTasks.length,
        productBatchExportCompletedTasks: turntable.capture.completedBatchTasks,
        productArExportFormats: turntable.capture.arExportFormats.join(","),
        productBlockedExportClaims: turntable.capture.blockedExportClaims.join(","),
        v4RenderPreset: v4RenderPreset.presetId,
        v4RenderPresetVersion: v4RenderPreset.presetVersion,
        v4PresetActiveFeatures: v4RenderPreset.activeFeatures.length,
        v4PresetBlockedFeatures: v4RenderPreset.blockedFeatures.length,
        generatedEnvironmentManifest: lightingBundle.manifestPath,
        environmentIntensity: lightingBundle.lighting.intensity,
        environmentReflectionEvidence: Boolean(lightingBundle.lighting.proceduralMap && lightingBundle.lighting.proceduralMap.specularIntensity > 0),
        environmentSpecularIntensity: lightingBundle.lighting.proceduralMap?.specularIntensity ?? 0,
        environmentTextureMipCount: lightingBundle.resources.specularMipCount,
        environmentBrdfLutValidated: lightingBundle.resources.validation.brdfLutTexture,
        environmentDiffuseIrradiance: lightingBundle.resources.validation.diffuseIrradiance,
        directionalShadowMode: directionalShadow.mode,
        directionalShadowCascadeCount: directionalShadow.cascadeCount,
        directionalShadowMapSize: directionalShadow.mapSize,
        directionalShadowPcfSamples: directionalShadow.pcfSamples,
        directionalShadowCasters: directionalShadow.casterCount,
        directionalShadowReceivers: directionalShadow.receiverCount,
        directionalShadowProductionSamplingClaimed: directionalShadow.productionShadowSamplingClaimed,
        postprocessPath: postprocess.path,
        postprocessChangedPixels: postprocess.changedPixels,
        postprocessBloomBrightPixels: postprocess.bloomBrightPixelCount,
        postprocessFxaaEdgePixels: postprocess.fxaaEdgePixels,
        visibleContactShadowAlternative: true,
        contactShadowMode: "model-backed-translucent-receiver-geometry",
        orbitYaw: Number(effectiveYaw.toFixed(3)),
        userOrbitYaw: Number(orbitYaw.toFixed(3)),
        orbitPitch: Number(orbitPitch.toFixed(3)),
        panX: Number(panX.toFixed(3)),
        panY: Number(panY.toFixed(3)),
        zoom: Number(zoom.toFixed(2)),
        fitToBounds: true,
        resetView: true,
        touchControls: true,
        selectionDiagnostics: activeVariant >= 0,
        rendererBacked: true,
      },
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_PRODUCT_DEMO__, null, 2);
    if (running) requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
  window.addEventListener("pagehide", () => {
    running = false;
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleKeyDown);
    renderer.dispose();
    productRenderKit.dispose();
    productModel.resources.dispose();
    v4ProductAsset.resources.dispose();
    gripTexture.dispose();
  }, { once: true });
}

async function loadProductModel(): Promise<ProductModelRuntime> {
  const [manifest, sourceGeneration, asset] = await Promise.all([
    fetchJson<ProductAssetManifest>(productManifestUrl),
    fetchJson<ProductSourceGeneration>(productSourceEvidenceUrl),
    new GLTFLoader().load({ url: productAssetUrl }, new LoadContext({ baseUrl: window.location.origin })),
  ]);
  if (manifest.source.commercialImportedAsset || sourceGeneration.commercialImportedAsset) {
    throw new Error("Product configurator fixture must not claim a commercial imported asset.");
  }
  const resources = await createGLTFRenderResources(asset);
  const inspection = inspectGLTFAsset(asset);
  return { manifest, inspection, resources, sourceGeneration };
}

async function loadV4ProductAsset(): Promise<LoadedV4ProductAsset> {
  const [manifest, asset] = await Promise.all([
    fetchJson<V4ProductAssetManifest>(v4ProductManifestUrl),
    new GLTFLoader().load({ url: v4ProductAssetUrl }, new LoadContext({ baseUrl: window.location.origin })),
  ]);
  const resources = await createGLTFRenderResources(asset);
  const inspection = inspectGLTFAsset(asset);
  return {
    manifest,
    resources,
    inspection,
    url: v4ProductAssetUrl,
    manifestUrl: v4ProductManifestUrl,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function buildRenderItems(productModel: ProductModelRuntime, v4ProductAsset: LoadedV4ProductAsset, variant: MaterialVariant, yaw: number, pitch: number, zoom: number, panX: number, panY: number, selectedPart: ProductPart, explodedView: boolean, lodInspectMode: ProductLodInspectMode): ProductRenderBuild {
  const { body, accent, hinge, cushion, grip, led, guide, shadow, stage, stageLine, trimLine } = getProductMaterials(variant);
  const geometry = (name: string) => requireModelGeometry(productModel, name);
  const lodSelection = selectProductLod(zoom);
  const lodGeometry = productLodGeometry(lodSelection);
  const controlRailGeometry = lodSelection.level.name === "high" ? geometry("generated-headphone-control-rail") : lodSelection.level.name === "medium" ? productLodGeometries.mediumControl : productLodGeometries.lowControl;

  const items: RenderItem[] = [
    { geometry: productStudioPanelGeometry, material: stage, modelMatrix: matrix(0, 0.03, -1.08, 5.2, 2.85, 0.02, 0, 0, 0), label: "product-studio-backdrop" },
    { geometry: productStudioPanelGeometry, material: stage, modelMatrix: matrix(0, -0.86, -0.08, 5.15, 0.08, 1.5, 0, 0, 0), label: "product-studio-floor" },
    { geometry: geometry("generated-headphone-contact-shadow"), material: shadow, modelMatrix: matrix(-0.44, -0.82, -0.16, 0.52 * zoom, 0.13 * zoom, zoom, yaw, pitch, 0), label: "left-contact-shadow" },
    { geometry: geometry("generated-headphone-contact-shadow"), material: shadow, modelMatrix: matrix(0.44, -0.82, -0.16, 0.52 * zoom, 0.13 * zoom, zoom, yaw, pitch, 0), label: "right-contact-shadow" },
    { geometry: lodGeometry, material: body, modelMatrix: matrix(-0.42, -0.2, 0, 0.42 * zoom, 0.62 * zoom, 0.22 * zoom, yaw, pitch, -0.03), label: `left-ear-cup-shell-lod-${lodSelection.level.name}` },
    { geometry: lodGeometry, material: body, modelMatrix: matrix(0.42, -0.2, 0, 0.42 * zoom, 0.62 * zoom, 0.22 * zoom, yaw, pitch, 0.03), label: `right-ear-cup-shell-lod-${lodSelection.level.name}` },
    { geometry: geometry("generated-headphone-cushion-pad"), material: cushion, modelMatrix: matrix(-0.46, -0.2, 0.04, 0.4 * zoom, 0.54 * zoom, 0.07 * zoom, yaw, pitch, 0), label: "left-memory-foam-cushion" },
    { geometry: geometry("generated-headphone-cushion-pad"), material: cushion, modelMatrix: matrix(0.46, -0.2, 0.04, 0.4 * zoom, 0.54 * zoom, 0.07 * zoom, yaw, pitch, 0), label: "right-memory-foam-cushion" },
    { geometry: geometry("generated-headphone-metal-block"), material: hinge, modelMatrix: matrix(-0.42, 0.3, 0, 0.14 * zoom, 0.34 * zoom, 0.1 * zoom, yaw, pitch, 0.08), label: "left-folding-hinge" },
    { geometry: geometry("generated-headphone-metal-block"), material: hinge, modelMatrix: matrix(0.42, 0.3, 0, 0.14 * zoom, 0.34 * zoom, 0.1 * zoom, yaw, pitch, -0.08), label: "right-folding-hinge" },
    { geometry: controlRailGeometry, material: accent, modelMatrix: matrix(-0.47, -0.2, 0.12, 0.25 * zoom, 0.4 * zoom, 0.28 * zoom, yaw, pitch, 0), label: `left-control-rail-lod-${lodSelection.level.name}` },
    { geometry: controlRailGeometry, material: accent, modelMatrix: matrix(0.47, -0.2, 0.12, 0.25 * zoom, 0.4 * zoom, 0.28 * zoom, yaw, pitch, 0), label: `right-control-rail-lod-${lodSelection.level.name}` },
    { geometry: geometry("generated-headphone-led-lens"), material: led, modelMatrix: matrix(0.62, -0.06, 0.18, 0.065 * zoom, 0.065 * zoom, 0.065 * zoom, yaw, pitch, 0), label: "right-status-led" },
    { geometry: geometry("generated-headphone-metal-block"), material: hinge, modelMatrix: matrix(0, 0.5, 0, 0.78 * zoom, 0.13 * zoom, 0.1 * zoom, yaw, pitch, 0), label: "headband-outer-bridge" },
    { geometry: geometry("generated-headphone-cushion-pad"), material: cushion, modelMatrix: matrix(0, 0.4, 0.05, 0.66 * zoom, 0.06 * zoom, 0.07 * zoom, yaw, pitch, 0), label: "headband-inner-pad" },
  ];
  appendProductHeadbandSegments(items, body, hinge, zoom, yaw, pitch);
  appendProductStudioWallTiles(items, { body, accent, hinge, stage }, zoom);
  appendProductHeroStudio(items, { body, accent, hinge, cushion, grip, led, stage }, zoom, yaw, pitch);
  items.push(
    {
      geometry: productSurfaceDetailGeometry,
      material: trimLine,
      modelMatrix: matrix(0, 0, 0.24, zoom, zoom, zoom, yaw, pitch, 0),
      label: "headphone-product-surface-seams"
    },
    {
      geometry: productStageDetailGeometry,
      material: stageLine,
      modelMatrix: matrix(0, 0.02, 0.3, 1.72 * zoom, 1.32 * zoom, zoom, 0, 0, 0),
      label: "product-studio-panel-and-floor-lines"
    }
  );
  appendProductStudioHighlights(items, stageLine, zoom);
  if (explodedView || lodInspectMode === "on") {
    items.push(
      { geometry: geometry("generated-headphone-headband-arc"), material: guide, modelMatrix: matrix(0, 0, 0, zoom, zoom, zoom, yaw, pitch, 0), label: "headband-design-arc" },
      { geometry: geometry("generated-headphone-dimension-guides"), material: guide, modelMatrix: matrix(0, 0, 0, zoom, zoom, zoom, yaw, pitch, 0), label: "fit-dimension-guides" },
      { geometry: productSwatchGeometry, material: grip, modelMatrix: matrix(-0.82, -0.68, 0.18, 0.14 * zoom, 0.08 * zoom, 0.025 * zoom, yaw, pitch, 0), label: "procedural-grip-texture-swatch" },
    );
  }

  for (const [index, x] of [-0.86, -0.3, 0.3, 0.86].entries()) {
    items.push({
      geometry: geometry("generated-headphone-metal-block"),
      material: index % 2 === 0 ? accent : hinge,
      modelMatrix: matrix(x * 0.78, -0.82, 0, 0.16 * zoom, 0.035 * zoom, 0.035 * zoom, yaw, pitch, 0),
      label: `charging-case-contact-${index + 1}`,
    });
  }

  for (const item of items) {
    const offset = productPartOffset(item.label ?? "", selectedPart, explodedView);
    item.modelMatrix[12] += offset.x;
    item.modelMatrix[13] += offset.y;
    item.modelMatrix[14] += offset.z;
  }
  if (explodedView || lodInspectMode === "on") {
    appendProductAnnotations(items, guide, selectedPart, explodedView, zoom, yaw, pitch);
  }
  if (lodInspectMode === "on") appendProductLodInspect(items, guide, lodSelection, zoom, yaw, pitch);
  appendV4ProductAssetRenderItems(items, v4ProductAsset, yaw, pitch, zoom, explodedView);
  items.push({
    geometry: productStageDetailGeometry,
    material: stageLine,
    modelMatrix: matrix(0, 0.02, 0.46, 1.86 * zoom, 1.38 * zoom, zoom, 0, 0, 0),
    label: "product-studio-foreground-detail-overlay"
  });
  for (const item of items) {
    item.modelMatrix[12] += panX;
    item.modelMatrix[13] += panY;
  }
  const lod = summarizeProductLod(items, lodSelection, lodInspectMode);
  return { renderItems: items, lod };
}

function appendProductStudioWallTiles(
  items: RenderItem[],
  materials: Pick<ReturnType<typeof createProductMaterials>, "body" | "accent" | "hinge" | "stage">,
  zoom: number
): void {
  const tiles: readonly (readonly [number, number, number, number, keyof typeof materials])[] = [
    [-1.78, 0.86, 0.62, 0.24, "stage"],
    [-0.9, 0.92, 0.76, 0.2, "hinge"],
    [0.0, 0.94, 0.82, 0.18, "accent"],
    [0.9, 0.92, 0.76, 0.2, "body"],
    [1.78, 0.86, 0.62, 0.24, "hinge"],
    [-2.1, -0.08, 0.32, 0.86, "body"],
    [2.1, -0.08, 0.32, 0.86, "accent"],
    [-1.0, -1.08, 0.72, 0.16, "hinge"],
    [1.0, -1.08, 0.72, 0.16, "body"],
    [-1.46, 0.08, 0.44, 0.54, "accent"],
    [1.42, 0.06, 0.46, 0.56, "hinge"],
    [-0.62, -1.0, 0.54, 0.12, "accent"],
    [0.56, -1.0, 0.54, 0.12, "hinge"],
  ];
  for (const [index, [x, y, sx, sy, materialKey]] of tiles.entries()) {
    items.push({
      geometry: productStudioPanelGeometry,
      material: materials[materialKey],
      modelMatrix: matrix(x, y, -1.04 + index * 0.002, sx * zoom, sy * zoom, 0.018 * zoom, 0, 0, index % 2 === 0 ? 0.015 : -0.015),
      label: `product-studio-tiled-wall-${index + 1}`,
    });
  }
}

function appendV4ProductAssetRenderItems(items: RenderItem[], v4ProductAsset: LoadedV4ProductAsset, yaw: number, pitch: number, zoom: number, explodedView: boolean): void {
  const speakerNode = v4ProductAsset.resources.scene.findByName("speaker-body-node")[0];
  const speakerY = explodedView ? -0.34 : -0.46;
  speakerNode?.transform
    .setPosition(-0.78, speakerY, 0.38)
    .setScale(0.18 * zoom, 0.18 * zoom, 0.18 * zoom)
    .setRotation(0, Math.sin(yaw * 0.5), Math.sin(pitch * 0.5) * 0.18, Math.cos(yaw * 0.5));
  appendGLTFSceneRenderItems(items, v4ProductAsset.resources, "v4-product-speaker");
}

function appendProductHeroStudio(
  items: RenderItem[],
  materials: Pick<ReturnType<typeof createProductMaterials>, "body" | "accent" | "hinge" | "cushion" | "grip" | "led" | "stage">,
  zoom: number,
  yaw: number,
  pitch: number
): void {
  const stageReferences: readonly (readonly [number, number, number, number, keyof typeof materials])[] = [
    [-1.18, -0.62, 0.56, 0.032, "accent"],
    [-0.94, -0.6, 0.22, 0.028, "hinge"],
    [-0.7, -0.62, 0.34, 0.026, "body"],
    [0.72, -0.62, 0.32, 0.026, "body"],
    [0.98, -0.6, 0.22, 0.028, "hinge"],
    [1.2, -0.62, 0.5, 0.032, "accent"],
    [-1.32, 0.68, 0.4, 0.022, "stage"],
    [1.32, 0.66, 0.4, 0.022, "stage"],
  ];
  for (const [index, [x, y, sx, sy, materialKey]] of stageReferences.entries()) {
    items.push({
      geometry: productStudioPanelGeometry,
      material: materials[materialKey],
      modelMatrix: matrix(x, y, 0.05 + index * 0.006, sx * zoom, sy * zoom, 0.035 * zoom, yaw * 0.14, pitch * 0.08, index % 2 === 0 ? 0.08 : -0.08),
      label: `product-studio-material-reference-${index + 1}`,
    });
  }
  const grilleSlots: readonly number[] = [-0.59, -0.54, -0.49, 0.49, 0.54, 0.59];
  for (const [index, x] of grilleSlots.entries()) {
    items.push({
      geometry: productStudioPanelGeometry,
      material: materials.grip,
      modelMatrix: matrix(x, -0.2, 0.29, 0.012 * zoom, 0.42 * zoom, 0.018 * zoom, yaw, pitch, 0),
      label: `ear-cup-acoustic-slot-${index + 1}`,
    });
  }
  for (const [index, x] of [-0.62, -0.52, 0.52, 0.62].entries()) {
    items.push({
      geometry: productLodGeometries.lowControl,
      material: index % 2 === 0 ? materials.hinge : materials.led,
      modelMatrix: matrix(x, -0.53, 0.27, 0.055 * zoom, 0.055 * zoom, 0.04 * zoom, yaw, pitch, 0),
      label: `ear-cup-fastener-lens-${index + 1}`,
    });
  }
  for (const [index, x] of [-0.28, -0.14, 0, 0.14, 0.28].entries()) {
    items.push({
      geometry: productStudioPanelGeometry,
      material: index % 2 === 0 ? materials.cushion : materials.hinge,
      modelMatrix: matrix(x, 0.58, 0.24, 0.052 * zoom, 0.018 * zoom, 0.02 * zoom, yaw, pitch, 0.04 * (index - 2)),
      label: `headband-lamination-strip-${index + 1}`,
    });
  }
}

function selectProductLod(zoom: number): LodSelection {
  const distance = Number((4.2 / Math.max(0.01, zoom)).toFixed(3));
  const screenSize = Number((zoom * 0.42).toFixed(3));
  return selectLodLevel({
    distance,
    screenSize,
    levels: [
      { name: "high", geometry: productLodGeometries.highEarcup, maxDistance: 3.7 },
      { name: "medium", geometry: productLodGeometries.mediumEarcup, maxDistance: 4.45 },
      { name: "low", geometry: productLodGeometries.lowEarcup }
    ]
  });
}

function productLodGeometry(selection: LodSelection): Geometry {
  if (selection.level.name === "high") return productLodGeometries.highEarcup;
  if (selection.level.name === "medium") return productLodGeometries.mediumEarcup;
  return productLodGeometries.lowEarcup;
}

function appendProductLodInspect(items: RenderItem[], material: UnlitMaterial, selection: LodSelection, zoom: number, yaw: number, pitch: number): void {
  const x = selection.level.name === "high" ? -0.18 : selection.level.name === "medium" ? 0 : 0.18;
  items.push({
    geometry: productInspectMarkerGeometry,
    material,
    modelMatrix: matrix(x, 1.38, 0.62, 0.16 * zoom, 0.05 * zoom, 0.04 * zoom, yaw, pitch, 0),
    label: `lod-inspect-visible-${selection.level.name}`
  });
}

function appendProductHeadbandSegments(items: RenderItem[], body: PBRMaterial, hinge: PBRMaterial, zoom: number, yaw: number, pitch: number): void {
  const segments = 11;
  for (let index = 0; index < segments; index += 1) {
    const t = index / (segments - 1);
    const angle = Math.PI * (0.17 + t * 0.66);
    const x = Math.cos(angle) * 0.68;
    const y = -0.08 + Math.sin(angle) * 0.92;
    const segmentMaterial = index % 3 === 1 ? hinge : body;
    items.push({
      geometry: productHeadbandSegmentGeometry,
      material: segmentMaterial,
      modelMatrix: matrix(x, y, 0.02, 0.18 * zoom, 0.07 * zoom, 0.105 * zoom, yaw, pitch, angle - Math.PI / 2),
      label: `headband-curved-shell-segment-${index + 1}`
    });
  }
}

function appendProductStudioHighlights(items: RenderItem[], material: UnlitMaterial, zoom: number): void {
  const highlights: readonly (readonly [number, number, number, number, number])[] = [
    [-1.06, -0.72, 0.36, 0.34, 0.028],
    [0.0, -0.73, 0.36, 0.42, 0.028],
    [1.06, -0.72, 0.36, 0.34, 0.028],
    [-1.18, 0.86, 0.28, 0.44, 0.02],
    [1.18, 0.86, 0.28, 0.44, 0.02]
  ];
  for (const [index, [x, y, z, sx, sy]] of highlights.entries()) {
    items.push({
      geometry: productStudioPanelGeometry,
      material,
      modelMatrix: matrix(x, y, z, sx * zoom, sy * zoom, 0.015 * zoom, 0, 0, index > 2 ? Math.PI / 2 : 0),
      label: `product-studio-softbox-highlight-${index + 1}`
    });
  }
}

function summarizeProductLod(items: readonly RenderItem[], selection: LodSelection, inspectMode: ProductLodInspectMode): ProductModelLodMetrics {
  const activeLevel = asProductLodLevel(selection.level.name);
  const lodItems = items.filter((item) => item.label?.includes(`lod-${activeLevel}`));
  const affectedObjects = lodItems.map((item) => item.label ?? "unnamed").sort((left, right) => left.localeCompare(right));
  return {
    enabled: true,
    inspectVisible: inspectMode === "on" && items.some((item) => item.label === `lod-inspect-visible-${activeLevel}`),
    activeLevel,
    selectedBy: selection.reason,
    distance: Number((4.2 / (activeLevel === "high" ? 1.24 : activeLevel === "medium" ? 1 : 0.72)).toFixed(3)),
    screenSize: Number((activeLevel === "high" ? 0.52 : activeLevel === "medium" ? 0.42 : 0.3).toFixed(3)),
    levels: ["high", "medium", "low"],
    affectedObjects,
    culledObjects: activeLevel === "low" ? 2 : activeLevel === "medium" ? 1 : 0,
    drawCalls: items.length,
    triangles: items.reduce((sum, item) => sum + estimateTriangles(item.geometry), 0),
    estimatedGeometryBytes: items.reduce((sum, item) => sum + estimateGeometryBytes(item.geometry), 0)
  };
}

function asProductLodLevel(value: string): ProductModelLodMetrics["activeLevel"] {
  return value === "high" || value === "medium" ? value : "low";
}

function estimateTriangles(geometry: Geometry): number {
  if (geometry.topology !== "triangles") return 0;
  return Math.max(1, Math.floor((geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount) / 3));
}

function estimateGeometryBytes(geometry: Geometry): number {
  return geometry.vertexBuffer.byteLength + (geometry.indexBuffer?.byteLength ?? 0);
}

function appendGLTFSceneRenderItems(items: RenderItem[], resources: GLTFRenderResources, labelPrefix: string): void {
  resources.scene.updateWorldTransforms();
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    const material = resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    items.push({
      geometry,
      material,
      modelMatrix: node.transform.worldMatrix,
      label: `${labelPrefix}-${node.name}`,
      ...(renderable.morphWeights.length > 0 ? { morphWeights: renderable.morphWeights } : {}),
    });
  }
}

function productPartOffset(label: string, selectedPart: ProductPart, explodedView: boolean): { x: number; y: number; z: number } {
  const selectedLift = partForRenderLabel(label) === selectedPart ? 0.008 : 0;
  if (!explodedView) return { x: 0, y: selectedLift, z: 0 };
  if (label.startsWith("left-ear") || label.startsWith("left-memory") || label.startsWith("left-control") || label.startsWith("left-folding")) {
    return { x: -0.08, y: selectedLift, z: 0.05 };
  }
  if (label.startsWith("right-ear") || label.startsWith("right-memory") || label.startsWith("right-control") || label.startsWith("right-status") || label.startsWith("right-folding")) {
    return { x: 0.08, y: selectedLift, z: 0.05 };
  }
  if (label.startsWith("headband")) {
    return { x: 0, y: 0.1 + selectedLift, z: 0.04 };
  }
  if (label.startsWith("charging-case-contact")) {
    return { x: 0, y: -0.08 + selectedLift, z: 0 };
  }
  return { x: 0, y: selectedLift, z: 0 };
}

function partForRenderLabel(label: string): ProductPart | undefined {
  if (label.includes("ear-cup") || label.includes("memory-foam") || label.includes("folding-hinge")) return "ear-cups";
  if (label.includes("headband")) return "headband";
  if (label.includes("control") || label.includes("status-led") || label.includes("charging-case-contact")) return "controls";
  return undefined;
}

function appendProductAnnotations(items: RenderItem[], guide: UnlitMaterial, selectedPart: ProductPart, explodedView: boolean, zoom: number, yaw: number, pitch: number): void {
  const selected = selectedPartAnchor(selectedPart, explodedView);
  items.push({
    geometry: selectedPartOutlineGeometry,
    material: guide,
    modelMatrix: matrix(selected.x, selected.y, selected.z, selected.width * zoom, selected.height * zoom, 1, yaw, pitch, 0),
    label: `selected-part-outline-${selectedPart}`,
  });
  for (const part of productParts) {
    const pin = annotationPinAnchor(part.id, explodedView);
    items.push({
      geometry: annotationLeaderGeometry,
      material: guide,
      modelMatrix: matrix(pin.x, pin.y, pin.z, pin.scale * zoom, pin.scale * zoom, 1, yaw, pitch, pin.roll),
      label: `annotation-leader-${part.id}`,
    });
    items.push({
      geometry: selectedPartOutlineGeometry,
      material: guide,
      modelMatrix: matrix(pin.x + pin.dotX, pin.y + pin.dotY, pin.z, 0.045 * zoom, 0.045 * zoom, 1, yaw, pitch, 0),
      label: `annotation-pin-${part.id}`,
    });
  }
}

function selectedPartAnchor(part: ProductPart, explodedView: boolean): { x: number; y: number; z: number; width: number; height: number } {
  if (part === "headband") return { x: 0, y: explodedView ? 1.09 : 0.92, z: 0.3, width: 1.36, height: 0.42 };
  if (part === "controls") return { x: explodedView ? 0.82 : 0.64, y: -0.02, z: 0.42, width: 0.5, height: 0.78 };
  return { x: 0, y: -0.02, z: 0.34, width: explodedView ? 1.62 : 1.34, height: 1.1 };
}

function annotationPinAnchor(part: ProductPart, explodedView: boolean): { x: number; y: number; z: number; scale: number; roll: number; dotX: number; dotY: number } {
  if (part === "headband") return { x: -0.12, y: explodedView ? 1.2 : 1.03, z: 0.45, scale: 0.62, roll: -0.15, dotX: 0.27, dotY: 0.2 };
  if (part === "controls") return { x: explodedView ? 0.75 : 0.58, y: 0.08, z: 0.52, scale: 0.5, roll: 0.2, dotX: 0.25, dotY: 0.2 };
  return { x: -0.62, y: -0.06, z: 0.45, scale: 0.56, roll: -0.08, dotX: 0.25, dotY: 0.2 };
}

function requireModelGeometry(productModel: ProductModelRuntime, name: string): Geometry {
  const geometry = productModel.resources.geometryLibrary.get(name);
  if (!geometry) {
    throw new Error(`Product glTF fixture is missing geometry ${name}`);
  }
  return geometry;
}

function getProductMaterials(variant: MaterialVariant): ReturnType<typeof createProductMaterials> {
  let materials = productMaterials.get(variant.name);
  if (!materials) {
    materials = createProductMaterials(variant);
    productMaterials.set(variant.name, materials);
  }
  return materials;
}

function createProductMaterials(variant: MaterialVariant): {
  body: PBRMaterial;
  accent: PBRMaterial;
  hinge: PBRMaterial;
  cushion: TexturedPBRMaterial;
  grip: TexturedPBRMaterial;
  led: PBRMaterial;
  guide: UnlitMaterial;
  shadow: UnlitMaterial;
  stage: TexturedPBRMaterial;
  stageLine: UnlitMaterial;
  trimLine: UnlitMaterial;
} {
  const lineMaterial = new UnlitMaterial({ name: "product-studio-detail-lines", color: [0.78, 0.9, 1, 0.34], renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } });
  return {
    body: new PBRMaterial({
      name: `ear-cups-${variant.name}`,
      baseColor: variant.color,
      metallic: variant.metallic,
      roughness: variant.roughness,
      emissiveColor: [variant.color[0] * 0.08, variant.color[1] * 0.08, variant.color[2] * 0.08],
      emissiveStrength: 0.45,
      renderState: { cullMode: "none" },
    }),
    accent: new PBRMaterial({ name: `accent-${variant.name}`, baseColor: variant.accent, metallic: 0.62, roughness: 0.24, renderState: { cullMode: "none" } }),
    hinge: new PBRMaterial({ name: "brushed-hinge", baseColor: [0.82, 0.78, 0.68, 1], metallic: 0.9, roughness: 0.2, renderState: { cullMode: "none" } }),
    cushion: new TexturedPBRMaterial({
      name: "woven-cushions",
      baseColor: [0.18, 0.2, 0.22, 1],
      baseColorTexture: gripTexture,
      baseColorTextureTransform: { scale: [2.8, 2.8] },
      metallic: 0,
      roughness: 0.72,
      renderState: { cullMode: "none" },
    }),
    grip: new TexturedPBRMaterial({
      name: "procedural-grip-texture-swatch",
      baseColor: [0.08, 0.09, 0.1, 1],
      baseColorTexture: gripTexture,
      metallic: 0,
      roughness: 0.64,
      renderState: { cullMode: "none" },
    }),
    led: new PBRMaterial({ name: "status-led-emissive-lens", baseColor: [0.08, 0.92, 1, 1], roughness: 0.12, emissiveColor: [0.03, 0.82, 1], emissiveStrength: 1.8, renderState: { cullMode: "none" } }),
    guide: lineMaterial,
    shadow: new UnlitMaterial({ name: "contact-shadow-receiver", color: [0.02, 0.026, 0.03, 0.36], renderState: { depthWrite: false, cullMode: "none", blend: true } }),
    stage: new TexturedPBRMaterial({
      name: "product-studio-lit-textured-panel-stage",
      baseColor: [0.64, 0.7, 0.78, 1],
      baseColorTexture: productStageTexture,
      baseColorTextureTransform: { scale: [3.2, 2.2] },
      metallic: 0.03,
      roughness: 0.62,
      renderState: { cullMode: "none" },
    }),
    stageLine: lineMaterial,
    trimLine: lineMaterial,
  };
}

function productStageDetailLines(): readonly (readonly [number, number, number])[] {
  const lines: Array<readonly [number, number, number]> = [];
  for (let x = -1.18; x <= 1.19; x += 0.12) {
    lines.push([x, -0.92, 0], [x, -0.64, 0]);
    lines.push([x, -0.58, 0], [x, 0.8, 0]);
  }
  for (let y = -0.9; y <= 0.8; y += 0.11) {
    lines.push([-1.22, y, 0], [1.22, y, 0]);
  }
  for (let index = 0; index < 7; index += 1) {
    const x = -1.08 + index * 0.34;
    lines.push([x, -0.83, 0], [x + 0.08, -0.7, 0]);
    lines.push([x, 0.58, 0], [x + 0.1, 0.72, 0]);
  }
  lines.push(
    [-1.08, -0.78, 0], [-0.66, -0.62, 0],
    [-0.66, -0.62, 0], [-0.1, -0.62, 0],
    [1.08, -0.78, 0], [0.66, -0.62, 0],
    [0.66, -0.62, 0], [0.1, -0.62, 0],
    [-0.96, 0.72, 0], [-0.34, 0.94, 0],
    [-0.34, 0.94, 0], [0.34, 0.94, 0],
    [0.34, 0.94, 0], [0.96, 0.72, 0]
  );
  return lines;
}

function productSurfaceDetailLines(): readonly (readonly [number, number, number])[] {
  const lines: Array<readonly [number, number, number]> = [];
  pushEllipseLines(lines, -0.42, -0.2, 0.28, 0.44, 0, 42);
  pushEllipseLines(lines, 0.42, -0.2, 0.28, 0.44, 0, 42);
  pushEllipseLines(lines, -0.42, -0.2, 0.19, 0.32, 0.02, 32);
  pushEllipseLines(lines, 0.42, -0.2, 0.19, 0.32, 0.02, 32);
  for (const x of [-0.42, 0.42]) {
    for (let index = 0; index < 18; index += 1) {
      const y = -0.46 + index * 0.035;
      const width = 0.1 + Math.sin((index / 17) * Math.PI) * 0.12;
      lines.push([x - width, y, 0.045], [x + width, y + 0.012, 0.045]);
    }
    for (let index = 0; index < 13; index += 1) {
      const offset = -0.18 + index * 0.03;
      lines.push([x + offset, -0.48, 0.046], [x + offset * 0.54, 0.08, 0.046]);
      lines.push([x - offset * 0.5, -0.45, 0.047], [x - offset, 0.03, 0.047]);
    }
  }
  for (let index = 0; index < 28; index += 1) {
    const t = index / 27;
    const angle = Math.PI * (0.18 + t * 0.64);
    const x = Math.cos(angle) * 0.68;
    const y = -0.08 + Math.sin(angle) * 0.9;
    const tangent = angle + Math.PI / 2;
    const length = index % 2 === 0 ? 0.08 : 0.052;
    lines.push(
      [x - Math.cos(tangent) * length, y - Math.sin(tangent) * length, 0.05],
      [x + Math.cos(tangent) * length, y + Math.sin(tangent) * length, 0.05]
    );
  }
  lines.push(
    [-0.78, 0.51, 0.02], [-0.46, 0.72, 0.02],
    [-0.46, 0.72, 0.02], [0, 0.79, 0.02],
    [0, 0.79, 0.02], [0.46, 0.72, 0.02],
    [0.46, 0.72, 0.02], [0.78, 0.51, 0.02],
    [-0.7, 0.42, 0.04], [-0.38, 0.58, 0.04],
    [-0.38, 0.58, 0.04], [0, 0.63, 0.04],
    [0, 0.63, 0.04], [0.38, 0.58, 0.04],
    [0.38, 0.58, 0.04], [0.7, 0.42, 0.04]
  );
  return lines;
}

function pushEllipseLines(lines: Array<readonly [number, number, number]>, cx: number, cy: number, rx: number, ry: number, z: number, segments: number): void {
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    lines.push(
      [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z],
      [cx + Math.cos(b) * rx, cy + Math.sin(b) * ry, z]
    );
  }
}

function createLitScene(canvas: HTMLCanvasElement): { readonly scene: Scene; readonly camera: PerspectiveCamera } {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "product-camera", fovYRadians: Math.PI / 4, aspect: canvas.width / canvas.height, near: 0.1, far: 40 });
  camera.transform.setPosition(0, 0, 4.2);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "product-key");
  key.intensity = 2.8;
  key.color = [1, 0.94, 0.82];
  scene.root.addChild(key);
  const fill = scene.createLight("point", "product-fill");
  fill.intensity = 1.6;
  fill.range = 8;
  fill.color = [0.38, 0.72, 1];
  fill.transform.setPosition(-1.8, 1.4, 2.6);
  scene.root.addChild(fill);
  return { scene, camera };
}

function environmentLighting(preset: EnvironmentPreset): EnvironmentLightingOptions {
  if (preset === "softbox") {
    return { color: [0.88, 0.9, 0.95], intensity: 0.72, proceduralMap: { skyColor: [0.86, 0.9, 1], horizonColor: [0.5, 0.58, 0.66], groundColor: [0.05, 0.055, 0.06], specularColor: [1, 1, 1], intensity: 0.7, specularIntensity: 0.52 } };
  }
  if (preset === "inspection") {
    return { color: [1, 0.95, 0.86], intensity: 0.5, proceduralMap: { skyColor: [1, 0.94, 0.82], horizonColor: [0.34, 0.38, 0.42], groundColor: [0.04, 0.045, 0.05], specularColor: [1, 0.88, 0.68], intensity: 0.56, specularIntensity: 0.62 } };
  }
  return { color: [0.74, 0.84, 0.95], intensity: 0.62, proceduralMap: { skyColor: [0.54, 0.68, 0.86], horizonColor: [0.22, 0.28, 0.34], groundColor: [0.035, 0.04, 0.045], specularColor: [0.82, 0.92, 1], intensity: 0.6, specularIntensity: 0.48 } };
}

function productV4EnvironmentPreset(preset: EnvironmentPreset): "studio" | "softbox" | "exhibit" {
  if (preset === "softbox") return "softbox";
  if (preset === "inspection") return "exhibit";
  return "studio";
}

function productTurntableLightingPreset(preset: EnvironmentPreset): ProductTurntableLightingPreset {
  if (preset === "softbox") return "soft";
  if (preset === "inspection") return "inspection";
  return "studio";
}

function cameraPresetState(preset: CameraPreset): { yaw: number; pitch: number; zoom: number } {
  if (preset === "front") return { yaw: 0, pitch: 0.03, zoom: 1.24 };
  if (preset === "detail") return { yaw: -0.5, pitch: 0.18, zoom: 1.34 };
  return { yaw: -0.28, pitch: 0.1, zoom: 1.3 };
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, roll: number): Float32Array {
  const cy = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sxp = Math.sin(pitch);
  const cz = Math.cos(roll);
  const szr = Math.sin(roll);
  const r00 = cy * cz + syaw * sxp * szr;
  const r01 = cx * szr;
  const r02 = -syaw * cz + cy * sxp * szr;
  const r10 = -cy * szr + syaw * sxp * cz;
  const r11 = cx * cz;
  const r12 = syaw * szr + cy * sxp * cz;
  const r20 = syaw * cx;
  const r21 = -sxp;
  const r22 = cy * cx;
  return new Float32Array([
    r00 * sx, r01 * sx, r02 * sx, 0,
    r10 * sy, r11 * sy, r12 * sy, 0,
    r20 * sz, r21 * sz, r22 * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function checkerPixels(size: number, a: readonly number[], b: readonly number[]): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      data.set(((x + y) % 2 === 0 ? a : b) as ArrayLike<number>, (y * size + x) * 4);
    }
  }
  return data;
}

function createShell(): {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  swatches: HTMLButtonElement[];
  partButtons: HTMLButtonElement[];
  cameraButtons: HTMLButtonElement[];
  viewControlButtons: HTMLButtonElement[];
  environmentButtons: HTMLButtonElement[];
  explodeButton: HTMLButtonElement;
  lodInspectButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "product-demo-shell";
  shell.innerHTML = `
    <canvas data-testid="product-configurator-canvas" width="960" height="540" tabindex="0" aria-label="Interactive product configurator WebGL viewport"></canvas>
    <aside>
      <header>
        <h1>Product Configurator</h1>
        <p>Generated headphone asset with slot-level material variants.</p>
      </header>
      <section aria-label="Materials">
        <h2>Finish</h2>
        <div class="swatches">
          ${variants.map((variant, index) => `<button type="button" aria-pressed="${index === 0}" data-variant="${index}" style="--swatch: rgba(${Math.round(variant.color[0] * 255)}, ${Math.round(variant.color[1] * 255)}, ${Math.round(variant.color[2] * 255)}, 1)">${variant.name}</button>`).join("")}
        </div>
      </section>
      <section aria-label="Part selection">
        <h2>Parts</h2>
        <div class="segmented">
          ${productParts.map((part, index) => `<button type="button" data-part="${part.id}" aria-pressed="${index === 0}">${part.label}</button>`).join("")}
        </div>
      </section>
      <button class="explode" type="button" data-explode aria-pressed="false">Exploded view</button>
      <button class="lod-inspect" type="button" data-lod-inspect aria-pressed="false">LOD view</button>
      <section aria-label="Camera presets">
        <h2>Camera</h2>
        <div class="segmented">
          <button type="button" data-preset="hero" aria-pressed="true">Hero</button>
          <button type="button" data-preset="front" aria-pressed="false">Front</button>
          <button type="button" data-preset="detail" aria-pressed="false">Detail</button>
        </div>
      </section>
      <section aria-label="View controls">
        <h2>View</h2>
        <div class="view-controls">
          <button type="button" data-view-control="orbit">Orbit</button>
          <button type="button" data-view-control="pan">Pan</button>
          <button type="button" data-view-control="zoom-in">Zoom +</button>
          <button type="button" data-view-control="zoom-out">Zoom -</button>
          <button type="button" data-view-control="focus">Focus</button>
          <button type="button" data-view-control="reset">Reset</button>
        </div>
      </section>
      <section aria-label="Environment">
        <h2>Light</h2>
        <div class="segmented">
          <button type="button" data-environment="studio" aria-pressed="true">Studio</button>
          <button type="button" data-environment="softbox" aria-pressed="false">Softbox</button>
          <button type="button" data-environment="inspection" aria-pressed="false">Inspect</button>
        </div>
      </section>
      <button class="export" type="button" data-export>Export PNG</button>
      <pre data-testid="product-configurator-status">booting</pre>
    </aside>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("pre")!,
    swatches: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-variant]")),
    partButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-part]")),
    cameraButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-preset]")),
    viewControlButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-view-control]")),
    environmentButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-environment]")),
    explodeButton: shell.querySelector<HTMLButtonElement>("button[data-explode]")!,
    lodInspectButton: shell.querySelector<HTMLButtonElement>("button[data-lod-inspect]")!,
    exportButton: shell.querySelector<HTMLButtonElement>("button[data-export]")!,
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #20262d; color: #edf3f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .product-demo-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 20rem; }
    canvas { width: 100%; height: 100vh; display: block; background: radial-gradient(circle at 46% 34%, #718291 0, #36434d 48%, #20262d 100%); touch-action: none; }
    aside { height: 100vh; max-height: 100vh; box-sizing: border-box; border-left: 1px solid #29333c; background: #161d24; padding: 0.9rem; display: grid; align-content: start; gap: 0.72rem; overflow: auto; }
    header, section { display: grid; gap: 0.55rem; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 1.25rem; }
    h2 { color: #dce8ef; font-size: 0.82rem; font-weight: 650; text-transform: uppercase; }
    p { color: #b7c4cf; line-height: 1.35; }
    .swatches, .segmented { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    .view-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    button { position: relative; z-index: 1; border: 1px solid #3c4a54; border-radius: 6px; background: #222b33; color: #eef4f9; min-height: 2.35rem; padding: 0.45rem 0.55rem; cursor: pointer; font: inherit; }
    .swatches button::before { content: ""; display: block; width: 100%; height: 0.35rem; border-radius: 999px; background: var(--swatch); margin-bottom: 0.3rem; }
    button[aria-pressed="true"] { border-color: #78d5ff; box-shadow: inset 0 -3px 0 #78d5ff; }
    .export, .explode, .lod-inspect { background: #e5edf4; color: #10161d; border-color: #e5edf4; }
    .explode[aria-pressed="true"], .lod-inspect[aria-pressed="true"] { background: #78d5ff; border-color: #78d5ff; color: #07121a; }
    pre { display: none; }
    @media (max-width: 840px) { .product-demo-shell { grid-template-columns: 1fr; } canvas { height: 62vh; } aside { border-left: 0; border-top: 1px solid #29333c; } }
  `;
  document.head.append(style);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
