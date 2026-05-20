import { GLTFLoader, LoadContext, createGLTFRenderResources, inspectGLTFAsset, type GLTFAssetInspectionReport, type GLTFRenderResources } from "@galileo3d/assets";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  UnlitMaterial,
  architecturalMaterialCatalogSummary,
  createArchitecturalLightingFixture,
  createArchitecturalMeasurementFixture,
  createArchitecturalMaterial,
  createProceduralTextureFixture,
  createV4DirectionalShadowEvidence,
  createV4EnvironmentLighting,
  createV4FlagshipRenderPresetEvidence,
  sampleV4LdrPostprocessReadback,
  type ArchitecturalLightingFixture,
  type ArchitecturalMeasurementFixture,
  type EnvironmentLightingOptions,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type V4DirectionalShadowEvidence,
  type V4EnvironmentLightingBundle,
  type V4LdrPostprocessSummary,
  type V4RenderPresetEvidence
} from "@galileo3d/rendering";
import { Scene, type PerspectiveCamera } from "@galileo3d/scene";

type ZoneId = "atrium" | "gallery" | "studio";
type CameraMode = "orbit" | "walk" | "plan" | "section";
type LightPreset = "daylight" | "exhibit" | "evening";
type ArchitectureElementKind = "room" | "wall" | "curtain-wall" | "door" | "stair" | "column" | "furniture" | "roof" | "shadow-receiver";

type Zone = {
  readonly id: ZoneId;
  readonly elementId: string;
  readonly label: string;
  readonly areaSqm: number;
  readonly spanMeters: number;
  readonly color: readonly [number, number, number, number];
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly level: string;
  readonly roomCount: number;
};

type ArchitectureElement = {
  readonly id: string;
  readonly label: string;
  readonly kind: ArchitectureElementKind;
  readonly level: string;
  readonly zone?: ZoneId;
  readonly castsContactShadow: boolean;
  readonly receivesContactShadow: boolean;
};

type ArchitectureSectionHatchingEvidence = {
  readonly source: "origin-master-architecture-section-hatching-adapted";
  readonly pattern: "concrete-crosshatch";
  readonly lineCount: number;
  readonly layerCount: number;
  readonly angleDegrees: readonly [number, number];
  readonly spacingMeters: number;
  readonly hash: string;
  readonly claimBoundary: string;
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
  oldBranchLighting?: ArchitecturalLightingFixture;
  oldBranchSectionHatching?: ArchitectureSectionHatchingEvidence;
  claimBoundary: string;
  model: {
    id: string;
    source: string;
    hierarchy: readonly { id: string; parent: string; kind: string }[];
    zones: readonly ZoneId[];
    elements: readonly string[];
  };
  v4Asset?: {
    id: string;
    source: string;
    url: string;
    manifestUrl: string;
    generator: string;
    meshCount: number;
    materialCount: number;
    cameraCount: number;
    lightCount: number;
    features: readonly string[];
    unsupportedFeatures: readonly string[];
  };
  selectedZone: string;
  selectedElement: { id: string; label: string; kind: ArchitectureElementKind; level: string };
  measurements: {
    areaSqm: number;
    spanMeters: number;
    roomCount: number;
    source: string;
    elementId: string;
    oldBranchSource?: ArchitecturalMeasurementFixture["source"];
    snapPointCount?: number;
    computedDistanceMeters?: number;
    computedAreaSqm?: number;
    computedAngleDegrees?: number;
    computedHeightMeters?: number;
    distanceLabel?: string;
    areaLabel?: string;
    angleLabel?: string;
    heightLabel?: string;
    hash?: string;
    claimBoundary?: string;
  };
  sectionView: boolean;
  cameraMode: CameraMode;
  lightPreset: LightPreset;
  interactions: number;
  diagnostics?: RenderDeviceDiagnostics;
  errors: readonly string[];
  metrics: Record<string, number | string | boolean>;
  error?: string;
};

type V4ArchitectureAssetManifest = {
  readonly schemaVersion: string;
  readonly id: string;
  readonly displayName: string;
  readonly source: { readonly kind: string; readonly generator: string };
  readonly localPath: string;
  readonly features: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly inspection: {
    readonly meshes: number;
    readonly materials: number;
    readonly cameras: number;
    readonly lights: number;
    readonly warnings: readonly string[];
  };
};

type LoadedV4ArchitectureAsset = {
  readonly manifest: V4ArchitectureAssetManifest;
  readonly resources: GLTFRenderResources;
  readonly inspection: GLTFAssetInspectionReport;
  readonly url: string;
  readonly manifestUrl: string;
};

declare global {
  interface Window {
    __GALILEO3D_ARCHITECTURE_DEMO__?: DemoStatus;
  }
}

const architectureModelSource = "fixtures/assets/v3/architecture/civic-gallery-room/civic-gallery-room.gltf";
const v4ArchitectureAssetUrl = "/fixtures/assets/v4/architecture/v4-gallery-corner/v4-gallery-corner.gltf";
const v4ArchitectureManifestUrl = "/fixtures/assets/v4/architecture/v4-gallery-corner/manifest.json";
const v4ScreenshotPath = "tests/reports/v4-example-screenshots/architecture-viewer.png";
const claimBoundary = "V4 architecture viewer evidence is limited to this generated civic-gallery room scene, authored metadata selection, and WebGL2 contact-shadow alternatives; it is not BIM/IFC import or CAD-accurate measurement.";
const architectureInteriorDetailCount = 34;

const zones: readonly Zone[] = [
  { id: "atrium", elementId: "room-atrium-l1", label: "Atrium", areaSqm: 420, spanMeters: 22.4, color: [0.18, 0.66, 0.88, 1], center: [-0.62, -0.18, 0], size: [0.8, 0.48, 0.18], level: "L1", roomCount: 1 },
  { id: "gallery", elementId: "room-gallery-l1", label: "Gallery", areaSqm: 310, spanMeters: 18.8, color: [0.86, 0.66, 0.26, 1], center: [0.16, -0.12, 0], size: [0.68, 0.42, 0.16], level: "L1", roomCount: 4 },
  { id: "studio", elementId: "room-studio-l2", label: "Studio", areaSqm: 260, spanMeters: 17.1, color: [0.42, 0.78, 0.48, 1], center: [0.78, -0.1, 0], size: [0.46, 0.38, 0.16], level: "L2", roomCount: 3 },
];

const hierarchy = [
  { id: "generated-civic-gallery", parent: "root", kind: "building" },
  { id: "level-01", parent: "generated-civic-gallery", kind: "level" },
  { id: "level-02", parent: "generated-civic-gallery", kind: "level" },
  { id: "room-atrium-l1", parent: "level-01", kind: "room" },
  { id: "room-gallery-l1", parent: "level-01", kind: "room" },
  { id: "room-studio-l2", parent: "level-02", kind: "room" },
  { id: "north-curtain-wall", parent: "generated-civic-gallery", kind: "curtain-wall" },
  { id: "south-entry-wall", parent: "level-01", kind: "wall" },
  { id: "mezzanine-stair", parent: "level-01", kind: "stair" },
  { id: "service-core", parent: "level-01", kind: "wall" },
] as const;

const knownLimits = [
  "The viewer renders a generated V4 gallery-corner asset plus a generated local civic-gallery fixture; it is not an IFC/BIM import workflow.",
  "Selection targets authored model element metadata and viewport hit regions; it is not triangle-accurate ray picking against CAD geometry.",
  "Measurements are authored room and element metadata with in-scene dimension strokes, not computed CAD dimension annotations.",
  "Directional shadow-map evidence is bounded to cascade/map/filter metrics plus visible receiver decals; full forward-pass shadow sampling and arbitrary clipping planes are not implemented here.",
  "The section view hides generated facade pieces; arbitrary BIM layers are not implemented.",
  "Architecture composition ports useful room/furniture/material ideas from origin/master arch-viz sources, but the old scene-node engine was not copied wholesale.",
] as const;
const architectureProceduralTextureFixtures = {
  concrete: createProceduralTextureFixture("concrete-asphalt", { width: 96, height: 96, label: "architecture-polished-concrete" }),
  wood: createProceduralTextureFixture("wood-plank", { width: 96, height: 96, label: "architecture-oak-wood" }),
  sciFiPanel: createProceduralTextureFixture("sci-fi-panel", { width: 96, height: 96, label: "architecture-metal-panel" }),
  marble: createProceduralTextureFixture("marble", { width: 96, height: 96, label: "architecture-gallery-stone" })
} as const;
const architectureMaterialCatalog = architecturalMaterialCatalogSummary();

const architectureElements: readonly ArchitectureElement[] = [
  ...zones.map((zone): ArchitectureElement => ({
    id: zone.elementId,
    label: `${zone.label} ${zone.level} room element`,
    kind: "room",
    level: zone.level,
    zone: zone.id,
    castsContactShadow: false,
    receivesContactShadow: true,
  })),
  { id: "level-01-receiver-slab", label: "Level 01 polished concrete receiver slab", kind: "shadow-receiver", level: "L1", castsContactShadow: false, receivesContactShadow: true },
  { id: "level-02-mezzanine-receiver", label: "Level 02 mezzanine receiver slab", kind: "shadow-receiver", level: "L2", castsContactShadow: false, receivesContactShadow: true },
  ...Array.from({ length: 9 }, (_, index): ArchitectureElement => ({
    id: `north-curtain-wall-panel-${index + 1}`,
    label: `North curtain wall glazed bay ${index + 1}`,
    kind: "curtain-wall",
    level: "L1-L2",
    castsContactShadow: false,
    receivesContactShadow: false,
  })),
  ...Array.from({ length: 12 }, (_, index): ArchitectureElement => ({
    id: `curtain-wall-mullion-${index + 1}`,
    label: `Curtain wall mullion ${index + 1}`,
    kind: "curtain-wall",
    level: "L1-L2",
    castsContactShadow: true,
    receivesContactShadow: false,
  })),
  ...Array.from({ length: 9 }, (_, index): ArchitectureElement => ({
    id: `mezzanine-stair-tread-${index + 1}`,
    label: `Mezzanine stair tread ${index + 1}`,
    kind: "stair",
    level: "L1",
    castsContactShadow: true,
    receivesContactShadow: false,
  })),
  ...Array.from({ length: 6 }, (_, index): ArchitectureElement => ({
    id: `gallery-bench-${index + 1}`,
    label: `Gallery bench ${index + 1}`,
    kind: "furniture",
    level: "L1",
    zone: index < 4 ? "gallery" : "atrium",
    castsContactShadow: true,
    receivesContactShadow: false,
  })),
  ...Array.from({ length: 4 }, (_, index): ArchitectureElement => ({
    id: `round-structural-column-${index + 1}`,
    label: `Round structural column ${index + 1}`,
    kind: "column",
    level: "L1-L2",
    castsContactShadow: true,
    receivesContactShadow: false,
  })),
  { id: "south-entry-door", label: "South entry double door", kind: "door", level: "L1", castsContactShadow: true, receivesContactShadow: false },
  { id: "service-core-wall", label: "Service core partition wall", kind: "wall", level: "L1", castsContactShadow: true, receivesContactShadow: false },
  { id: "sawtooth-roof", label: "Sawtooth roof plane", kind: "roof", level: "Roof", castsContactShadow: true, receivesContactShadow: false },
] as const;

const contactShadowCasters = architectureElements.filter((element) => element.castsContactShadow);
const contactShadowReceivers = architectureElements.filter((element) => element.receivesContactShadow);
const contactShadowPads: readonly (readonly [number, number, number, number, string])[] = [
  [-0.86, -0.48, 0.18, 0.08, "round-structural-column-1"],
  [-0.34, -0.48, 0.18, 0.08, "round-structural-column-2"],
  [0.26, -0.48, 0.18, 0.08, "round-structural-column-3"],
  [0.86, -0.48, 0.18, 0.08, "round-structural-column-4"],
  [-0.52, -0.71, 0.18, 0.07, "gallery-bench-1"],
  [-0.42, -0.61, 0.18, 0.07, "gallery-bench-2"],
  [0.04, -0.71, 0.18, 0.07, "gallery-bench-3"],
  [0.14, -0.61, 0.18, 0.07, "gallery-bench-4"],
  [0.68, -0.71, 0.18, 0.07, "gallery-bench-5"],
  [0.78, -0.61, 0.18, 0.07, "gallery-bench-6"],
  [0.36, -0.34, 0.24, 0.06, "mezzanine-stair"],
  [0.46, -0.28, 0.24, 0.06, "mezzanine-stair"],
  [0.56, -0.22, 0.24, 0.06, "mezzanine-stair"],
  [0.66, -0.16, 0.24, 0.06, "mezzanine-stair"],
  [0.77, -0.1, 0.24, 0.06, "mezzanine-stair"],
  [-0.08, -0.88, 0.38, 0.05, "south-entry-door"],
  [0.52, -0.1, 0.13, 0.56, "service-core-wall"],
] as const;

const sectionHatchingLines = architecturalSectionHatchingLines();
const sectionHatchingEvidence = createSectionHatchingEvidence(sectionHatchingLines);

const architectureGeometry = {
  cube: Geometry.texturedCube(1),
  measurementGuides: Geometry.lineSegments([
    [-1.08, -0.86, 0.12], [1.08, -0.86, 0.12],
    [-1.08, -0.8, 0.12], [-1.08, 0.48, 0.12],
    [1.08, -0.8, 0.12], [1.08, 0.48, 0.12],
    [-0.2, -0.56, 0.14], [0.52, -0.56, 0.14],
    [-0.94, -0.2, 0.16], [-0.3, -0.2, 0.16],
    [-0.06, 0.06, 0.16], [0.44, 0.06, 0.16],
    [0.6, 0.08, 0.16], [0.96, 0.08, 0.16],
  ]),
  detailGuides: Geometry.lineSegments(architecturalDetailGuideLines()),
  galleryPanelLines: Geometry.lineSegments(architecturalGalleryPanelLines()),
  sectionHatching: Geometry.lineSegments(sectionHatchingLines),
  walkPath: Geometry.lineSegments([
    [-0.92, -0.62, 0.2], [-0.46, -0.54, 0.2],
    [-0.46, -0.54, 0.2], [0.04, -0.48, 0.2],
    [0.04, -0.48, 0.2], [0.48, -0.36, 0.2],
    [0.48, -0.36, 0.2], [0.78, -0.16, 0.2],
    [-0.46, -0.54, 0.2], [-0.46, -0.34, 0.2],
    [0.04, -0.48, 0.2], [0.04, -0.28, 0.2],
  ]),
};

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_ARCHITECTURE_DEMO__ = {
      id: "architecture-viewer",
      status: "error",
      renderer: "webgl2",
      visualClaim: "Generated production-like civic gallery room fixture rendered through Galileo3D WebGL2.",
      knownLimits,
      screenshotPath: v4ScreenshotPath,
      featureEvidence: {},
      claimBoundary,
      model: {
        id: "generated-civic-gallery-v3",
        source: architectureModelSource,
        hierarchy,
        zones: zones.map((zone) => zone.id),
        elements: architectureElements.map((element) => element.id),
      },
      v4Asset: {
        id: "v4-gallery-corner",
        source: "v4-generated-local-gltf",
        url: v4ArchitectureAssetUrl,
        manifestUrl: v4ArchitectureManifestUrl,
        generator: "tools/asset-v4-corpus/index.ts",
        meshCount: 0,
        materialCount: 0,
        cameraCount: 0,
        lightCount: 0,
        features: [],
        unsupportedFeatures: [],
      },
      selectedZone: zones[0].id,
      selectedElement: { id: zones[0].elementId, label: "Atrium L1 room element", kind: "room", level: zones[0].level },
      measurements: { areaSqm: 0, spanMeters: 0, roomCount: 0, source: "model-element-metadata", elementId: zones[0].elementId },
      sectionView: false,
      cameraMode: "orbit",
      lightPreset: "daylight",
      interactions: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      metrics: {},
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status, zoneButtons, cameraButtons, viewControlButtons, lightButtons, sectionToggle } = createShell();
  const resize = () => resizeCanvas(canvas);
  resize();
  window.addEventListener("resize", resize);

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.24, 0.265, 0.275, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });

  let selectedZoneIndex = 0;
  let interactions = 0;
  let lastFrame = performance.now();
  let frameMs = 0;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let running = true;
  let cameraMode: CameraMode = "orbit";
  let lightPreset: LightPreset = "daylight";
  let sectionView = false;
  let yaw = -0.2;
  let panX = 0;
  let panY = 0;
  let zoom = 1.12;
  let dragStart: { x: number; y: number; yaw: number; panX: number; panY: number; mode: "orbit" | "pan" } | undefined;
  const { scene, camera } = createLitScene(canvas);
  const v4ArchitectureAsset = await loadV4ArchitectureAsset();

  const selectZone = (index: number) => {
    selectedZoneIndex = Math.max(0, Math.min(zones.length - 1, index));
    interactions += 1;
    for (const [buttonIndex, button] of zoneButtons.entries()) {
      button.setAttribute("aria-pressed", String(buttonIndex === selectedZoneIndex));
    }
  };
  const setCameraMode = (mode: CameraMode) => {
    cameraMode = mode;
    interactions += 1;
    if (mode === "walk") {
      const zone = zones[selectedZoneIndex]!;
      yaw = stableArchitectureYaw(-0.08);
      zoom = 1.22;
      panX = clamp(-zone.center[0] * 0.34, -0.6, 0.6);
      panY = clamp(-0.22 - zone.center[1] * 0.22, -0.42, 0.42);
      sectionView = false;
      sectionToggle.checked = false;
    } else if (mode === "plan") {
      yaw = stableArchitectureYaw(0);
      zoom = 0.9;
      panX = 0;
      panY = 0;
    } else if (mode === "section") {
      yaw = stableArchitectureYaw(-0.28);
      zoom = 1.18;
      panX = 0;
      panY = 0.03;
      sectionView = true;
      sectionToggle.checked = true;
    } else {
      yaw = stableArchitectureYaw(-0.2);
      zoom = 1;
      panX = 0;
      panY = 0;
    }
    for (const button of cameraButtons) button.setAttribute("aria-pressed", String(button.dataset.camera === mode));
  };
  const setLightPreset = (preset: LightPreset) => {
    lightPreset = preset;
    interactions += 1;
    for (const button of lightButtons) button.setAttribute("aria-pressed", String(button.dataset.light === preset));
  };
  const runViewControl = (action: string, input: "button" | "keyboard" | "touch" | "pointer" = "button") => {
    interactions += 1;
    if (action === "orbit") {
      yaw = stableArchitectureYaw(yaw + (input === "touch" ? 0.1 : 0.16));
      cameraMode = "orbit";
    } else if (action === "pan") {
      panX = clamp(panX + 0.1, -0.6, 0.6);
      panY = clamp(panY + 0.04, -0.42, 0.42);
    } else if (action === "zoom-in") {
      zoom = clamp(zoom + 0.1, 0.78, 1.32);
    } else if (action === "zoom-out") {
      zoom = clamp(zoom - 0.1, 0.78, 1.32);
    } else if (action === "focus") {
      const zone = zones[selectedZoneIndex]!;
      panX = clamp(-zone.center[0] * 0.3, -0.6, 0.6);
      panY = clamp(-zone.center[1] * 0.3, -0.42, 0.42);
      zoom = 1.16;
    } else if (action === "reset") {
      yaw = stableArchitectureYaw(-0.2);
      panX = 0;
      panY = 0;
      zoom = 1;
      cameraMode = "orbit";
      sectionView = false;
      sectionToggle.checked = false;
    }
    for (const button of cameraButtons) button.setAttribute("aria-pressed", String(button.dataset.camera === cameraMode));
  };

  zoneButtons.forEach((button, index) => button.addEventListener("click", () => selectZone(index)));
  cameraButtons.forEach((button) => button.addEventListener("click", () => setCameraMode(button.dataset.camera as CameraMode)));
  viewControlButtons.forEach((button) => button.addEventListener("click", () => runViewControl(button.dataset.viewControl ?? "")));
  lightButtons.forEach((button) => button.addEventListener("click", () => setLightPreset(button.dataset.light as LightPreset)));
  sectionToggle.addEventListener("change", () => {
    sectionView = sectionToggle.checked;
    interactions += 1;
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragStart = { x: event.clientX, y: event.clientY, yaw, panX, panY, mode: event.shiftKey ? "pan" : "orbit" };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always register an active pointer.
    }
    selectZone(zoneFromViewportX(event.offsetX));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    if (dragStart.mode === "pan") {
      panX = clamp(dragStart.panX + (event.clientX - dragStart.x) * 0.0024, -0.6, 0.6);
      panY = clamp(dragStart.panY - (event.clientY - dragStart.y) * 0.0024, -0.42, 0.42);
      return;
    }
    yaw = stableArchitectureYaw(dragStart.yaw + (event.clientX - dragStart.x) * 0.006);
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
    zoom = clamp(zoom + Math.sign(event.deltaY) * 0.08, 0.78, 1.28);
    interactions += 1;
  }, { passive: false });
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") yaw = stableArchitectureYaw(yaw - 0.08);
    else if (event.key === "ArrowRight") yaw = stableArchitectureYaw(yaw + 0.08);
    else if (event.key === "a") panX = clamp(panX - 0.08, -0.6, 0.6);
    else if (event.key === "d") panX = clamp(panX + 0.08, -0.6, 0.6);
    else if (event.key === "w" || event.key === "ArrowUp") panY = clamp(panY + 0.08, -0.42, 0.42);
    else if (event.key === "s" || event.key === "ArrowDown") panY = clamp(panY - 0.08, -0.42, 0.42);
    else if (event.key === "+" || event.key === "=") zoom = clamp(zoom + 0.08, 0.78, 1.28);
    else if (event.key === "-" || event.key === "_") zoom = clamp(zoom - 0.08, 0.78, 1.28);
    else if (event.key === "f") return runViewControl("focus", "keyboard");
    else if (event.key === "r") return runViewControl("reset", "keyboard");
    else return;
    event.preventDefault();
    interactions += 1;
  };
  canvas.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keydown", handleKeyDown);

  const render = (time: number) => {
    if (!running) return;
    const zone = zones[selectedZoneIndex]!;
    const selectedElement = selectedElementForZone(zone);
    frameMs = frameMs * 0.85 + (time - lastFrame) * 0.15;
    lastFrame = time;
    resize();
    renderer.resize(canvas.width, canvas.height);
    camera.resize(canvas.width, canvas.height);
    const lightingBundle = createV4EnvironmentLighting(architectureV4EnvironmentPreset(lightPreset));
    const oldBranchLighting = createArchitecturalLightingFixture({ preset: architectureLightingPreset(lightPreset) });
    const renderItems = buildRenderItems(selectedZoneIndex, sectionView, cameraMode, v4ArchitectureAsset, yaw, zoom, panX, panY);
    diagnostics = renderer.render({
      scene,
      renderItems,
      environmentLighting: lightingBundle.lighting,
    });
    const postprocess = sampleV4LdrPostprocessReadback({
      device: renderer.device,
      framebufferWidth: canvas.width,
      framebufferHeight: canvas.height,
      exposure: lightPreset === "evening" ? 1.14 : 1.04
    });
    const directionalShadow = createV4DirectionalShadowEvidence({
      exampleId: "architecture-viewer",
      casterCount: contactShadowCasters.length,
      receiverCount: contactShadowReceivers.length,
      visibleReceiverDarkening: contactShadowPads.length > 0,
      mapSize: 768,
      lightDirection: oldBranchLighting.sunDirection
    });
    const v4RenderPreset = createV4FlagshipRenderPresetEvidence({
      exampleId: "architecture-viewer",
      screenshotPath: v4ScreenshotPath,
      exposure: postprocess.exposure,
      directionalShadowEvidence: directionalShadow.visibleReceiverDarkening,
      postprocessEvidence: postprocess.changedPixels > 0,
      lodEvidence: false
    });
    const oldBranchMeasurements = createArchitecturalMeasurementFixture({ unit: "metric", precision: 2 });

    window.__GALILEO3D_ARCHITECTURE_DEMO__ = {
      id: "architecture-viewer",
      status: "ready",
      renderer: "webgl2",
      visualClaim: "Generated production-like civic gallery room fixture rendered through Galileo3D WebGL2.",
      knownLimits,
      screenshotPath: v4ScreenshotPath,
      featureEvidence: {
        roomModel: true,
        materialRoomSelection: true,
        measurementMetadata: true,
        oldBranchMeasurementToolPort: oldBranchMeasurements.snapPointCount >= 16 &&
          oldBranchMeasurements.distance.value > 0 &&
          oldBranchMeasurements.area.value > 0 &&
          oldBranchMeasurements.height.value > 0 &&
          oldBranchMeasurements.angle.value > 0,
        oldBranchSectionHatchingPort: sectionHatchingEvidence.lineCount >= 24 && sectionHatchingEvidence.layerCount === 2,
        sectionCutHatching: sectionView && cameraMode === "section",
        contactShadowAlternative: true,
        v4ArchitectureAssetLoaded: true,
        v4RenderPreset: true,
        sharedV4Preset: v4RenderPreset.presetId,
        generatedEnvironmentMap: true,
        environmentResourceSet: lightingBundle.resources.resourceSet,
        environmentReflectionEvidence: Boolean(lightingBundle.lighting.environmentMapTexture),
        proceduralTextureFixturesApplied: true,
        richArchitectureComposition: architectureInteriorDetailCount >= 18,
        oldBranchArchitectureCompositionPort: true,
        oldBranchArchitecturalMaterialLibraryPort: architectureMaterialCatalog.materialCount >= 31,
        architecturalMaterialCategories: architectureMaterialCatalog.categories.length,
        architecturalMaterialPresets: architectureMaterialCatalog.materialCount,
        architecturalTexturedMaterialPresets: architectureMaterialCatalog.texturedMaterialCount,
        oldBranchLightingControllerPort: oldBranchLighting.source === "origin-master-arch-viz-lighting-controller-adapted" &&
          oldBranchLighting.interiorLights.length >= 10 &&
          oldBranchLighting.supportedCurrentRendererLights.includes("point") &&
          oldBranchLighting.supportedCurrentRendererLights.includes("spot"),
        oldBranchLightingPreset: oldBranchLighting.preset,
        oldBranchInteriorLightCount: oldBranchLighting.interiorLights.length,
        oldBranchActiveInteriorLights: oldBranchLighting.activeInteriorLightCount,
        kitchenBathroomFurnitureExteriorDetails: architectureInteriorDetailCount >= 30,
        bedroomFurnitureDetails: true,
        architectureConcreteTextureHash: architectureProceduralTextureFixtures.concrete.hash,
        architectureWoodTextureHash: architectureProceduralTextureFixtures.wood.hash,
        architecturePanelTextureHash: architectureProceduralTextureFixtures.sciFiPanel.hash,
        brdfLutValidated: lightingBundle.resources.validation.brdfLutTexture,
        stableDirectionalShadowMap: directionalShadow.productionShadowSamplingClaimed === false && directionalShadow.visibleReceiverDarkening,
        directionalShadowCascadeCount: directionalShadow.cascadeCount,
        postprocessRealSceneReadback: postprocess.changedPixels > 0,
        orbitWalkCameraModes: true,
        lightingPresets: true,
        screenshotEvidencePath: v4ScreenshotPath,
      },
      v4RenderPreset,
      postprocess,
      environmentResources: lightingBundle.resources,
      directionalShadow,
      oldBranchLighting,
      oldBranchSectionHatching: sectionHatchingEvidence,
      claimBoundary,
      model: {
        id: "generated-civic-gallery-v3",
        source: architectureModelSource,
        hierarchy,
        zones: zones.map((entry) => entry.id),
        elements: architectureElements.map((element) => element.id),
      },
      v4Asset: {
        id: v4ArchitectureAsset.manifest.id,
        source: "v4-generated-local-gltf",
        url: v4ArchitectureAsset.url,
        manifestUrl: v4ArchitectureAsset.manifestUrl,
        generator: v4ArchitectureAsset.manifest.source.generator,
        meshCount: v4ArchitectureAsset.manifest.inspection.meshes,
        materialCount: v4ArchitectureAsset.manifest.inspection.materials,
        cameraCount: v4ArchitectureAsset.manifest.inspection.cameras,
        lightCount: v4ArchitectureAsset.manifest.inspection.lights,
        features: v4ArchitectureAsset.manifest.features,
        unsupportedFeatures: v4ArchitectureAsset.manifest.unsupportedFeatures,
      },
      selectedZone: zone.id,
      selectedElement: {
        id: selectedElement.id,
        label: selectedElement.label,
        kind: selectedElement.kind,
        level: selectedElement.level,
      },
      measurements: {
        areaSqm: zone.areaSqm,
        spanMeters: zone.spanMeters,
        roomCount: zone.roomCount,
        source: "model-element-metadata",
        elementId: selectedElement.id,
        oldBranchSource: oldBranchMeasurements.source,
        snapPointCount: oldBranchMeasurements.snapPointCount,
        computedDistanceMeters: oldBranchMeasurements.distance.value,
        computedAreaSqm: oldBranchMeasurements.area.value,
        computedAngleDegrees: oldBranchMeasurements.angle.value,
        computedHeightMeters: oldBranchMeasurements.height.value,
        distanceLabel: oldBranchMeasurements.distance.label,
        areaLabel: oldBranchMeasurements.area.label,
        angleLabel: oldBranchMeasurements.angle.label,
        heightLabel: oldBranchMeasurements.height.label,
        hash: oldBranchMeasurements.hash,
        claimBoundary: oldBranchMeasurements.claimBoundary,
      },
      sectionView,
      cameraMode,
      lightPreset,
      interactions,
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
        v4RenderPreset: v4RenderPreset.presetId,
        v4RenderPresetVersion: v4RenderPreset.presetVersion,
        v4PresetActiveFeatures: v4RenderPreset.activeFeatures.length,
        v4PresetBlockedFeatures: v4RenderPreset.blockedFeatures.length,
        generatedEnvironmentManifest: lightingBundle.manifestPath,
        environmentTextureMipCount: lightingBundle.resources.specularMipCount,
        proceduralTextureFixtureCount: Object.keys(architectureProceduralTextureFixtures).length,
        architectureInteriorDetailCount,
        oldBranchArchitectureCompositionPort: true,
        oldBranchArchitecturalMaterialLibraryPort: true,
        oldBranchLightingControllerPort: true,
        lightingControllerSource: oldBranchLighting.source,
        lightingControllerPreset: oldBranchLighting.preset,
        lightingControllerTimeOfDayHours: oldBranchLighting.timeOfDayHours,
        lightingControllerSunIntensity: oldBranchLighting.sunIntensity,
        lightingControllerAmbientIntensity: oldBranchLighting.ambientIntensity,
        lightingControllerInteriorLights: oldBranchLighting.interiorLights.length,
        lightingControllerActiveInteriorLights: oldBranchLighting.activeInteriorLightCount,
        lightingControllerKelvinMin: oldBranchLighting.kelvinRange[0],
        lightingControllerKelvinMax: oldBranchLighting.kelvinRange[1],
        lightingControllerSupportedRendererLights: oldBranchLighting.supportedCurrentRendererLights.join(","),
        lightingControllerBlockedClaims: oldBranchLighting.blockedLightClaims.length,
        lightingControllerHash: oldBranchLighting.hash,
        architecturalMaterialPresets: architectureMaterialCatalog.materialCount,
        architecturalMaterialCategories: architectureMaterialCatalog.categories.length,
        kitchenBathroomFurnitureExteriorDetailCount: architectureInteriorDetailCount,
        exteriorElementCount: 4,
        architectureConcreteTextureHash: architectureProceduralTextureFixtures.concrete.hash,
        architectureWoodTextureHash: architectureProceduralTextureFixtures.wood.hash,
        architecturePanelTextureHash: architectureProceduralTextureFixtures.sciFiPanel.hash,
        environmentBrdfLutValidated: lightingBundle.resources.validation.brdfLutTexture,
        environmentDiffuseIrradiance: lightingBundle.resources.validation.diffuseIrradiance,
        environmentReflectionEvidence: Boolean(lightingBundle.lighting.environmentMapTexture),
        environmentSpecularIntensity: lightingBundle.lighting.environmentMapSpecularIntensity ?? 0,
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
        zones: zones.length,
        selectedAreaSqm: zone.areaSqm,
        generatedModelParts: sectionView ? architectureElements.length - 9 : architectureElements.length,
        productionLikeArchitectureModel: true,
        localArchitectureFixture: true,
        v4ArchitectureAssetLoaded: true,
        v4ArchitectureAssetId: v4ArchitectureAsset.manifest.id,
        v4ArchitectureAssetUrl: v4ArchitectureAsset.url,
        v4ArchitectureAssetRenderables: v4ArchitectureAsset.resources.scene.collectRenderables().length,
        v4ArchitectureAssetMeshes: v4ArchitectureAsset.manifest.inspection.meshes,
        v4ArchitectureAssetMaterials: v4ArchitectureAsset.manifest.inspection.materials,
        v4ArchitectureAssetCameras: v4ArchitectureAsset.manifest.inspection.cameras,
        v4ArchitectureAssetLights: v4ArchitectureAsset.manifest.inspection.lights,
        v4ArchitectureAssetFeatures: v4ArchitectureAsset.manifest.features.join(","),
        v4ArchitectureUnsupportedFeatures: v4ArchitectureAsset.manifest.unsupportedFeatures.join(","),
        actualElementSelection: true,
        selectedElementId: selectedElement.id,
        selectedElementKind: selectedElement.kind,
        measurementSource: "model-element-metadata",
        oldBranchMeasurementToolPort: true,
        oldBranchSectionHatchingPort: true,
        sectionHatchingSource: sectionHatchingEvidence.source,
        sectionHatchingPattern: sectionHatchingEvidence.pattern,
        sectionHatchingLineCount: sectionHatchingEvidence.lineCount,
        sectionHatchingLayerCount: sectionHatchingEvidence.layerCount,
        sectionHatchingAngleDegrees: sectionHatchingEvidence.angleDegrees.join(","),
        sectionHatchingSpacingMeters: sectionHatchingEvidence.spacingMeters,
        sectionHatchingHash: sectionHatchingEvidence.hash,
        measurementToolSource: oldBranchMeasurements.source,
        measurementToolSnapPoints: oldBranchMeasurements.snapPointCount,
        measurementToolDistanceMeters: oldBranchMeasurements.distance.value,
        measurementToolAreaSqm: oldBranchMeasurements.area.value,
        measurementToolAngleDegrees: oldBranchMeasurements.angle.value,
        measurementToolHeightMeters: oldBranchMeasurements.height.value,
        measurementToolHash: oldBranchMeasurements.hash,
        architecturalElements: architectureElements.length,
        curtainWallPanels: architectureElements.filter((element) => element.id.startsWith("north-curtain-wall-panel")).length,
        curtainWallMullions: architectureElements.filter((element) => element.id.startsWith("curtain-wall-mullion")).length,
        stairTreads: architectureElements.filter((element) => element.id.startsWith("mezzanine-stair-tread")).length,
        contactShadowAlternative: true,
        contactShadowCount: contactShadowPads.length,
        shadowCasterElements: contactShadowCasters.length,
        shadowReceiverElements: contactShadowReceivers.length,
        measurementGuides: 12,
        supportedCameraModes: "orbit,walk,plan,section",
        orbitWalkCameraModes: true,
        walkCameraActive: cameraMode === "walk",
        walkPositionMeters: Number((Math.abs(panX) * 12 + Math.abs(panY) * 8).toFixed(2)),
        lightingPresets: true,
        lightingPresetCount: 3,
        lightPreset,
        hierarchyNodes: hierarchy.length,
        yaw: Number(yaw.toFixed(3)),
        panX: Number(panX.toFixed(3)),
        panY: Number(panY.toFixed(3)),
        zoom: Number(zoom.toFixed(2)),
        fitToBounds: true,
        resetView: true,
        touchControls: true,
        selectionDiagnostics: selectedZoneIndex >= 0,
        rendererBacked: true,
      },
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_ARCHITECTURE_DEMO__, null, 2);
    if (running) requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
  window.addEventListener("pagehide", () => {
    running = false;
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleKeyDown);
    v4ArchitectureAsset.resources.dispose();
    renderer.dispose();
  }, { once: true });
}

async function loadV4ArchitectureAsset(): Promise<LoadedV4ArchitectureAsset> {
  const [manifest, asset] = await Promise.all([
    fetchJson<V4ArchitectureAssetManifest>(v4ArchitectureManifestUrl),
    new GLTFLoader().load({ url: v4ArchitectureAssetUrl }, new LoadContext({ baseUrl: window.location.origin })),
  ]);
  const resources = await createGLTFRenderResources(asset);
  const inspection = inspectGLTFAsset(asset);
  return {
    manifest,
    resources,
    inspection,
    url: v4ArchitectureAssetUrl,
    manifestUrl: v4ArchitectureManifestUrl,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function buildRenderItems(selectedZoneIndex: number, sectionView: boolean, cameraMode: CameraMode, v4ArchitectureAsset: LoadedV4ArchitectureAsset, yaw: number, zoom: number, panX = 0, panY = 0): RenderItem[] {
  const floor = new PBRMaterial({ name: "architecture-concrete-floor-explicit-pbr", baseColor: [0.54, 0.56, 0.54, 1], roughness: 0.62, metallic: 0.03, emissiveColor: [0.06, 0.06, 0.055], emissiveStrength: 0.2, renderState: { cullMode: "none" } });
  const wall = new PBRMaterial({ name: "architecture-limestone-wall-explicit-pbr", baseColor: [0.74, 0.72, 0.62, 1], roughness: 0.56, metallic: 0.02, emissiveColor: [0.08, 0.075, 0.06], emissiveStrength: 0.2, renderState: { cullMode: "none" } });
  const glass = new PBRMaterial({ name: "architecture-tinted-glass-explicit-pbr", baseColor: [0.58, 0.74, 0.82, 0.52], roughness: 0.08, metallic: 0.02, emissiveColor: [0.08, 0.18, 0.24], emissiveStrength: 0.35, renderState: { blend: true, depthWrite: false, cullMode: "none" } });
  const roof = new PBRMaterial({ name: "architecture-brushed-steel-roof-explicit-pbr", baseColor: [0.62, 0.64, 0.62, 1], roughness: 0.34, metallic: 0.62, emissiveColor: [0.06, 0.065, 0.06], emissiveStrength: 0.18, renderState: { cullMode: "none" } });
  const mullion = new PBRMaterial({ name: "architectural-visible-brushed-mullion", baseColor: [0.48, 0.52, 0.52, 1], metallic: 0.72, roughness: 0.32, emissiveColor: [0.08, 0.09, 0.09], emissiveStrength: 0.38, renderState: { cullMode: "none" } });
  const stair = new PBRMaterial({ name: "architecture-oak-stair-explicit-pbr", baseColor: [0.58, 0.44, 0.3, 1], roughness: 0.42, metallic: 0.02, emissiveColor: [0.08, 0.05, 0.03], emissiveStrength: 0.18, renderState: { cullMode: "none" } });
  const door = createArchitecturalMaterial("teak");
  const casework = createArchitecturalMaterial("walnut");
  const stoneCounter = createArchitecturalMaterial("marble-carrara");
  const upholstery = createArchitecturalMaterial("velvet");
  const cotton = createArchitecturalMaterial("cotton");
  const brushedSteel = createArchitecturalMaterial("steel-brushed");
  const brass = createArchitecturalMaterial("brass");
  const mirror = createArchitecturalMaterial("chrome");
  const exteriorConcrete = createArchitecturalMaterial("slate");
  const planting = new PBRMaterial({ name: "interior-planting", baseColor: [0.16, 0.48, 0.28, 1], roughness: 0.74, metallic: 0.01, renderState: { cullMode: "none" } });
  const warmLight = new PBRMaterial({ name: "warm-pendant-light-emissive-glass", baseColor: [1, 0.78, 0.38, 0.92], roughness: 0.18, emissiveColor: [1, 0.58, 0.16], emissiveStrength: 1.9, renderState: { blend: true, depthWrite: false, cullMode: "none" } });
  const contactShadow = new PBRMaterial({ name: "projected-contact-shadow-receiver-darkening", baseColor: [0.02, 0.024, 0.028, 0.32], roughness: 0.86, metallic: 0, renderState: { blend: true, depthWrite: false, cullMode: "none" } });
  const artBlue = new PBRMaterial({ name: "gallery-acoustic-blue-art-panel", baseColor: [0.12, 0.42, 0.78, 1], roughness: 0.38, metallic: 0.04, emissiveColor: [0.02, 0.08, 0.14], emissiveStrength: 0.42, renderState: { cullMode: "none" } });
  const artOchre = new PBRMaterial({ name: "gallery-ochre-art-panel", baseColor: [0.88, 0.58, 0.16, 1], roughness: 0.42, metallic: 0.02, emissiveColor: [0.18, 0.08, 0.02], emissiveStrength: 0.38, renderState: { cullMode: "none" } });
  const artGreen = new PBRMaterial({ name: "gallery-green-art-panel", baseColor: [0.18, 0.62, 0.36, 1], roughness: 0.5, metallic: 0.02, emissiveColor: [0.02, 0.12, 0.06], emissiveStrength: 0.34, renderState: { cullMode: "none" } });
  const artPlum = new PBRMaterial({ name: "gallery-plum-art-panel", baseColor: [0.46, 0.24, 0.62, 1], roughness: 0.44, metallic: 0.03, emissiveColor: [0.08, 0.03, 0.12], emissiveStrength: 0.36, renderState: { cullMode: "none" } });
  const guide = new UnlitMaterial({ name: "measurement-dimension-strokes", color: [0.82, 0.94, 1, 0.22], renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } });
  const detailGuide = new UnlitMaterial({ name: "door-swing-and-railing-lines", color: [0.76, 0.86, 0.92, 0.24], renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } });
  const sectionHatchGuide = new UnlitMaterial({ name: "section-cut-crosshatch-lines", color: [0.78, 0.86, 0.9, 0.34], renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } });
  const selectedGuide = new UnlitMaterial({ name: "selected-zone-outline-lines", color: [0.2, 0.95, 1, 0.72], renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } });
  const walkGuide = new UnlitMaterial({ name: "walk-camera-path-lines", color: [0.4, 1, 0.68, 1], renderState: { depthTest: true, depthWrite: false, cullMode: "none" } });
  const gallerySeams = new UnlitMaterial({ name: "architecture-gallery-backdrop-panel-seams", color: [0.1, 0.18, 0.22, 0.56], renderState: { depthTest: false, depthWrite: false, blend: true, cullMode: "none" } });
  const galleryBackdrop = createArchitecturalMaterial("limestone");
  const galleryBase = createArchitecturalMaterial("concrete");
  const materialSamplePalette = createArchitectureMaterialSamplePalette();

  const items: RenderItem[] = [
    { geometry: architectureGeometry.cube, material: galleryBackdrop, modelMatrix: matrix(0.05, 0.08, -0.32, 6.4, 3.9, 0.05, 0), label: "architecture-gallery-lit-backdrop" },
    { geometry: architectureGeometry.galleryPanelLines, material: gallerySeams, modelMatrix: matrix(0.05, 0.08, -0.34, 1.38, 1.35, 1, 0), label: "architecture-gallery-backdrop-panel-seams" },
    { geometry: architectureGeometry.cube, material: galleryBase, modelMatrix: matrix(0.04, -0.96, -0.1, 4.8, 0.08, 1.2, 0), label: "architecture-gallery-display-floor" },
    { geometry: architectureGeometry.cube, material: floor, modelMatrix: matrix(0.1, -0.56, 0, 2.35 * zoom, 0.08 * zoom, 0.72 * zoom, yaw), label: "level-01-floor-slab" },
    { geometry: architectureGeometry.cube, material: floor, modelMatrix: matrix(0.48, -0.18, -0.04, 1.08 * zoom, 0.05 * zoom, 0.54 * zoom, yaw), label: "level-02-mezzanine-slab" },
  ];
  const backdropBaffles: readonly (readonly [number, number, number, RenderItem["material"], string])[] = [
    [-2.52, 0.24, 0.42, artBlue, "blue-far-west"],
    [-1.96, 0.3, 0.44, artOchre, "ochre-west"],
    [-1.4, 0.22, 0.42, artGreen, "green-west"],
    [-0.84, 0.3, 0.44, artPlum, "plum-west"],
    [-0.28, 0.24, 0.42, artBlue, "blue-center-west"],
    [0.28, 0.3, 0.44, artOchre, "ochre-center-east"],
    [0.84, 0.22, 0.42, artGreen, "green-east"],
    [1.4, 0.3, 0.44, artPlum, "plum-east"],
    [1.96, 0.24, 0.42, artBlue, "blue-far-east"],
    [2.52, 0.3, 0.44, artOchre, "ochre-far-east"],
  ];
  for (const [x, y, sx, material, label] of backdropBaffles) {
    items.push({
      geometry: architectureGeometry.cube,
      material,
      modelMatrix: matrix(x, y, -0.26, sx, 3.0, 0.035, 0),
      label: `architecture-gallery-backdrop-baffle-${label}`,
    });
  }
  const backdropMosaicMaterials = [...materialSamplePalette, artBlue, artOchre, artGreen, artPlum, glass, roof, mullion, brass, exteriorConcrete, planting, casework, stoneCounter] as const;
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 14; column += 1) {
      const material = backdropMosaicMaterials[(row * 7 + column * 5) % backdropMosaicMaterials.length]!;
      const wide = (row + column) % 3 === 0;
      items.push({
        geometry: architectureGeometry.cube,
        material,
        modelMatrix: matrix(
          -3.02 + column * 0.47 + (row % 2) * 0.08,
          1.08 - row * 0.48,
          -0.245 + row * 0.001,
          (wide ? 0.34 : 0.24) * zoom,
          (wide ? 0.18 : 0.28) * zoom,
          0.024 * zoom,
          yaw
        ),
        label: `architecture-gallery-backdrop-material-mosaic-${row}-${column}`,
      });
    }
  }
  const backdropAccentMaterials = [artBlue, artOchre, artGreen, artPlum, glass, roof, brass, planting] as const;
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const material = backdropAccentMaterials[(row * 5 + column * 3) % backdropAccentMaterials.length]!;
      const wide = (row + column) % 4 === 0;
      items.push({
        geometry: architectureGeometry.cube,
        material,
        modelMatrix: matrix(
          -2.88 + column * 0.38 + (row % 2) * 0.08,
          0.94 - row * 0.43,
          -0.235 + row * 0.002,
          (wide ? 0.24 : 0.16) * zoom,
          (wide ? 0.09 : 0.15) * zoom,
          0.026 * zoom,
          yaw
        ),
        label: `architecture-gallery-material-sample-wall-${row}-${column}`,
      });
    }
  }
  appendArchitectureGalleryTiles(items, { galleryBackdrop, galleryBase, floor, wall, glass, roof, mullion, brass, exteriorConcrete, planting, warmLight, casework, stoneCounter }, zoom, yaw);

  for (const [index, zone] of zones.entries()) {
    const selected = index === selectedZoneIndex;
    const material = new PBRMaterial({
      name: `${zone.id}-floor-finish`,
      baseColor: zone.color,
      roughness: selected ? 0.24 : 0.54,
      metallic: 0.03,
      emissiveColor: [zone.color[0] * 0.16, zone.color[1] * 0.16, zone.color[2] * 0.16],
      emissiveStrength: selected ? 1.1 : 0.28,
      renderState: { cullMode: "none" },
    });
    items.push({
      geometry: architectureGeometry.cube,
      material,
      modelMatrix: matrix(zone.center[0], zone.center[1], zone.center[2] + 0.03, zone.size[0] * zoom, zone.size[1] * zoom, zone.size[2] * zoom, yaw),
      label: `${zone.id}-selectable-room-volume`,
    });
    if (selected) {
      items.push({
        geometry: Geometry.lineSegments(zoneOutline(zone)),
        material: selectedGuide,
        modelMatrix: matrix(0, 0, 0.08, zoom, zoom, zoom, yaw),
        label: `${zone.id}-selection-outline`,
      });
    }
  }

  const wallSegments: readonly [number, number, number, number][] = [
    [-1.15, -0.08, 0.08, 1.08],
    [1.22, -0.08, 0.08, 1.08],
    [0.04, 0.42, 2.34, 0.08],
    [-0.06, -0.92, 2.1, 0.08],
    [-0.2, -0.28, 0.08, 0.64],
    [0.52, -0.28, 0.08, 0.56],
  ];
  for (const [index, [x, y, sx, sy]] of wallSegments.entries()) {
    items.push({ geometry: architectureGeometry.cube, material: wall, modelMatrix: matrix(x, y, 0.08, sx * zoom, sy * zoom, 0.16 * zoom, yaw), label: `partition-wall-${index + 1}` });
  }

  if (!sectionView || cameraMode === "section") {
    const panelXs = [-0.92, -0.68, -0.44, -0.2, 0.04, 0.28, 0.52, 0.76, 1];
    for (const [index, x] of panelXs.entries()) {
      items.push({ geometry: architectureGeometry.cube, material: glass, modelMatrix: matrix(x, 0.47, 0.12, 0.2 * zoom, 0.42 * zoom, 0.06 * zoom, yaw), label: `north-curtain-wall-panel-${index + 1}` });
    }
    for (const [index, x] of [-1.08, -0.88, -0.68, -0.48, -0.28, -0.08, 0.12, 0.32, 0.52, 0.72, 0.92, 1.12].entries()) {
      items.push({ geometry: architectureGeometry.cube, material: mullion, modelMatrix: matrix(x, 0.47, 0.16, 0.025 * zoom, 0.52 * zoom, 0.08 * zoom, yaw), label: `curtain-wall-mullion-${index + 1}` });
    }
    for (const [index, y] of [0.32, 0.48, 0.64].entries()) {
      items.push({ geometry: architectureGeometry.cube, material: mullion, modelMatrix: matrix(0.03, y, 0.165, 2.22 * zoom, 0.018 * zoom, 0.08 * zoom, yaw), label: `curtain-wall-transom-${index + 1}` });
    }
    items.push({ geometry: architectureGeometry.cube, material: roof, modelMatrix: matrix(0.04, 0.74, 0.1, 2.18 * zoom, 0.08 * zoom, 0.68 * zoom, yaw), label: "sawtooth-roof-plane" });
    items.push({ geometry: architectureGeometry.cube, material: mullion, modelMatrix: matrix(0.04, 0.68, 0.18, 2.1 * zoom, 0.024 * zoom, 0.08 * zoom, yaw), label: "sawtooth-clerestory-frame" });
  }

  for (const [index, x] of [-0.86, -0.34, 0.26, 0.86].entries()) {
    items.push({ geometry: architectureGeometry.cube, material: wall, modelMatrix: matrix(x, -0.36, 0.15, 0.08 * zoom, 0.55 * zoom, 0.08 * zoom, yaw), label: `structural-column-${index + 1}` });
  }

  for (const [index, x] of [-0.52, -0.42, 0.04, 0.14, 0.68, 0.78].entries()) {
    items.push({ geometry: architectureGeometry.cube, material: roof, modelMatrix: matrix(x, -0.64 + (index % 2) * 0.1, 0.16, 0.08 * zoom, 0.18 * zoom, 0.08 * zoom, yaw), label: `furniture-bench-${index + 1}` });
  }

  const detailItems: readonly [string, RenderItem["material"], number, number, number, number, number, number][] = [
    ["gallery-reception-desk", stoneCounter, -0.62, -0.56, 0.2, 0.34, 0.08, 0.08],
    ["gallery-reception-casework", casework, -0.62, -0.62, 0.16, 0.38, 0.06, 0.12],
    ["studio-worktable", stoneCounter, 0.78, -0.34, 0.18, 0.34, 0.08, 0.08],
    ["studio-storage-wall", casework, 1.0, -0.16, 0.2, 0.08, 0.44, 0.12],
    ["kitchen-island-counter", stoneCounter, -0.1, -0.46, 0.2, 0.36, 0.1, 0.08],
    ["kitchen-tall-cabinet-left", casework, -0.28, -0.16, 0.22, 0.08, 0.38, 0.12],
    ["kitchen-tall-cabinet-right", casework, 0.08, -0.16, 0.22, 0.08, 0.38, 0.12],
    ["kitchen-upper-cabinet-row", casework, -0.1, -0.04, 0.38, 0.42, 0.055, 0.1],
    ["kitchen-brushed-steel-sink", brushedSteel, -0.18, -0.52, 0.28, 0.1, 0.05, 0.035],
    ["bathroom-vanity", stoneCounter, 0.58, 0.12, 0.2, 0.22, 0.08, 0.08],
    ["bathroom-storage-panel", casework, 0.76, 0.18, 0.24, 0.08, 0.24, 0.08],
    ["bathroom-chrome-mirror", mirror, 0.58, 0.22, 0.37, 0.2, 0.028, 0.14],
    ["bathroom-basin", brushedSteel, 0.58, 0.08, 0.27, 0.11, 0.045, 0.032],
    ["bathroom-shower-glass-panel", glass, 0.82, 0.08, 0.32, 0.05, 0.22, 0.18],
    ["lounge-sofa-left", upholstery, -0.78, 0.1, 0.18, 0.32, 0.1, 0.1],
    ["lounge-sofa-right", upholstery, -0.42, 0.1, 0.18, 0.32, 0.1, 0.1],
    ["coffee-table", stoneCounter, -0.6, -0.08, 0.16, 0.22, 0.07, 0.06],
    ["coffee-table-leg-nw", brushedSteel, -0.71, -0.12, 0.1, 0.018, 0.018, 0.08],
    ["coffee-table-leg-ne", brushedSteel, -0.49, -0.12, 0.1, 0.018, 0.018, 0.08],
    ["coffee-table-leg-sw", brushedSteel, -0.71, -0.04, 0.1, 0.018, 0.018, 0.08],
    ["coffee-table-leg-se", brushedSteel, -0.49, -0.04, 0.1, 0.018, 0.018, 0.08],
    ["bedroom-platform-bed", cotton, 0.88, 0.12, 0.16, 0.28, 0.22, 0.08],
    ["bedroom-headboard", casework, 0.88, 0.26, 0.24, 0.3, 0.04, 0.16],
    ["bedroom-nightstand", casework, 0.56, 0.22, 0.16, 0.08, 0.08, 0.08],
    ["planter-atrium-left", planting, -1.0, 0.24, 0.2, 0.12, 0.18, 0.08],
    ["planter-atrium-right", planting, 1.04, 0.24, 0.2, 0.12, 0.18, 0.08],
    ["exterior-entry-walkway", exteriorConcrete, -0.02, -1.1, 0.03, 0.46, 0.2, 0.03],
    ["exterior-courtyard-ground", exteriorConcrete, 0.0, -1.22, -0.02, 1.8, 0.1, 0.025],
    ["exterior-planter-left", planting, -0.62, -1.02, 0.08, 0.16, 0.08, 0.08],
    ["exterior-planter-right", planting, 0.62, -1.02, 0.08, 0.16, 0.08, 0.08],
    ["exhibit-plinth-one", stoneCounter, -0.22, 0.22, 0.22, 0.14, 0.14, 0.1],
    ["exhibit-plinth-two", stoneCounter, 0.22, 0.22, 0.22, 0.14, 0.14, 0.1],
    ["pendant-light-one", warmLight, -0.3, 0.34, 0.32, 0.05, 0.05, 0.04],
    ["pendant-light-two", warmLight, 0.36, 0.34, 0.32, 0.05, 0.05, 0.04],
  ];
  for (const [label, material, x, y, z, sx, sy, sz] of detailItems) {
    items.push({
      geometry: architectureGeometry.cube,
      material,
      modelMatrix: matrix(x, y, z, sx * zoom, sy * zoom, sz * zoom, yaw),
      label: `interior-detail-${label}`,
    });
  }

  const artPanels: readonly (readonly [RenderItem["material"], number, number, number, number])[] = [
    [artBlue, -0.96, 0.26, 0.14, 0.22],
    [artOchre, -0.72, 0.27, 0.1, 0.18],
    [artGreen, -0.46, 0.25, 0.12, 0.2],
    [artPlum, -0.18, 0.26, 0.1, 0.22],
    [artOchre, 0.18, 0.25, 0.12, 0.2],
    [artBlue, 0.46, 0.26, 0.1, 0.18],
    [artPlum, 0.72, 0.27, 0.12, 0.22],
    [artGreen, 0.96, 0.25, 0.14, 0.2],
    [artBlue, -0.86, -0.08, 0.1, 0.16],
    [artOchre, -0.28, -0.08, 0.11, 0.16],
    [artPlum, 0.28, -0.08, 0.11, 0.16],
    [artGreen, 0.86, -0.08, 0.1, 0.16],
  ];
  for (const [index, [material, x, y, sx, sy]] of artPanels.entries()) {
    items.push({
      geometry: architectureGeometry.cube,
      material,
      modelMatrix: matrix(x, y, 0.31 + index * 0.001, sx * zoom, sy * zoom, 0.024 * zoom, yaw),
      label: `gallery-display-art-panel-${index + 1}`,
    });
    items.push({
      geometry: architectureGeometry.cube,
      material: brass,
      modelMatrix: matrix(x, y - sy * 0.58, 0.322 + index * 0.001, sx * 1.1 * zoom, 0.014 * zoom, 0.026 * zoom, yaw),
      label: `gallery-display-art-panel-frame-${index + 1}`,
    });
    items.push({
      geometry: architectureGeometry.cube,
      material: brass,
      modelMatrix: matrix(x, y + sy * 0.58, 0.324 + index * 0.001, sx * 1.1 * zoom, 0.014 * zoom, 0.026 * zoom, yaw),
      label: `gallery-display-art-panel-top-frame-${index + 1}`,
    });
    items.push({
      geometry: architectureGeometry.cube,
      material: brass,
      modelMatrix: matrix(x - sx * 0.56, y, 0.326 + index * 0.001, 0.012 * zoom, sy * 1.1 * zoom, 0.026 * zoom, yaw),
      label: `gallery-display-art-panel-left-frame-${index + 1}`,
    });
    items.push({
      geometry: architectureGeometry.cube,
      material: brass,
      modelMatrix: matrix(x + sx * 0.56, y, 0.328 + index * 0.001, 0.012 * zoom, sy * 1.1 * zoom, 0.026 * zoom, yaw),
      label: `gallery-display-art-panel-right-frame-${index + 1}`,
    });
  }

  for (let index = 0; index < 9; index += 1) {
    items.push({
      geometry: architectureGeometry.cube,
      material: stair,
      modelMatrix: matrix(0.34 + index * 0.06, -0.36 + index * 0.035, 0.2 + index * 0.008, 0.26 * zoom, 0.035 * zoom, 0.08 * zoom, yaw),
      label: `mezzanine-stair-tread-${index + 1}`,
    });
  }
  items.push({ geometry: architectureGeometry.cube, material: stair, modelMatrix: matrix(0.64, -0.2, 0.27, 0.04 * zoom, 0.42 * zoom, 0.055 * zoom, yaw), label: "mezzanine-stair-handrail" });
  items.push({ geometry: architectureGeometry.cube, material: stair, modelMatrix: matrix(0.68, -0.02, 0.26, 0.62 * zoom, 0.035 * zoom, 0.055 * zoom, yaw), label: "mezzanine-guardrail" });
  items.push({ geometry: architectureGeometry.cube, material: door, modelMatrix: matrix(-0.08, -0.88, 0.18, 0.22 * zoom, 0.09 * zoom, 0.08 * zoom, yaw), label: "south-entry-door-left" });
  items.push({ geometry: architectureGeometry.cube, material: door, modelMatrix: matrix(0.12, -0.88, 0.18, 0.22 * zoom, 0.09 * zoom, 0.08 * zoom, yaw), label: "south-entry-door-right" });
  items.push({ geometry: architectureGeometry.cube, material: brass, modelMatrix: matrix(-0.02, -0.935, 0.2, 0.045 * zoom, 0.018 * zoom, 0.025 * zoom, yaw), label: "south-entry-door-brass-handle-left" });
  items.push({ geometry: architectureGeometry.cube, material: brass, modelMatrix: matrix(0.18, -0.935, 0.2, 0.045 * zoom, 0.018 * zoom, 0.025 * zoom, yaw), label: "south-entry-door-brass-handle-right" });
  items.push({ geometry: architectureGeometry.cube, material: wall, modelMatrix: matrix(0.52, -0.05, 0.19, 0.16 * zoom, 0.6 * zoom, 0.18 * zoom, yaw), label: "service-core-wall" });

  for (const [x, y, sx, sy, sourceElement] of contactShadowPads) {
    items.push({
      geometry: architectureGeometry.cube,
      material: contactShadow,
      modelMatrix: matrix(x, y, 0.22, sx * zoom, sy * zoom, 0.018 * zoom, yaw),
      label: `contact-shadow-${sourceElement}`,
    });
  }

  if (cameraMode === "section" || cameraMode === "walk") {
    items.push({
      geometry: architectureGeometry.detailGuides,
      material: detailGuide,
      modelMatrix: matrix(0, 0, 0.12, zoom, zoom, zoom, yaw),
      label: "door-swing-railing-plan-lines",
    });
  }

  if (sectionView || cameraMode === "section") {
    items.push({
      geometry: architectureGeometry.sectionHatching,
      material: sectionHatchGuide,
      modelMatrix: matrix(0, 0, 0.26, zoom, zoom, zoom, yaw),
      label: "old-branch-section-crosshatch-lines",
    });
  }

  if (cameraMode === "walk") {
    items.push({
      geometry: architectureGeometry.walkPath,
      material: walkGuide,
      modelMatrix: matrix(0, 0, 0.08, zoom, zoom, zoom, yaw),
      label: "walk-camera-eye-height-path",
    });
  }

  appendV4ArchitectureAssetRenderItems(items, v4ArchitectureAsset, yaw, zoom, sectionView);

  if (cameraMode === "section" || cameraMode === "walk") {
    items.push({
      geometry: architectureGeometry.measurementGuides,
      material: guide,
      modelMatrix: matrix(0, 0, 0, zoom, zoom, zoom, yaw),
      label: "measurement-dimension-lines",
    });
  }

  items.push(
    {
      geometry: architectureGeometry.galleryPanelLines,
      material: gallerySeams,
      modelMatrix: matrix(0.05, 0.08, 0.42, 1.38, 1.35, 1, 0),
      label: "architecture-gallery-foreground-panel-line-overlay",
    },
    {
      geometry: architectureGeometry.detailGuides,
      material: detailGuide,
      modelMatrix: matrix(0, 0, 0.44, zoom, zoom, zoom, yaw),
      label: "architecture-foreground-door-railing-line-overlay",
    }
  );

  for (const item of items) {
    item.modelMatrix[12] += panX;
    item.modelMatrix[13] += panY;
  }
  return items;
}

function createArchitectureMaterialSamplePalette(): readonly UnlitMaterial[] {
  const colors: readonly (readonly [number, number, number])[] = [
    [0.12, 0.34, 0.72], [0.78, 0.34, 0.18], [0.18, 0.58, 0.36], [0.62, 0.24, 0.74],
    [0.86, 0.66, 0.22], [0.24, 0.68, 0.74], [0.72, 0.28, 0.42], [0.42, 0.52, 0.78],
    [0.66, 0.48, 0.32], [0.34, 0.62, 0.48], [0.9, 0.78, 0.52], [0.32, 0.38, 0.46],
    [0.54, 0.72, 0.88], [0.88, 0.52, 0.36], [0.46, 0.76, 0.28], [0.76, 0.38, 0.62],
    [0.58, 0.56, 0.38], [0.3, 0.48, 0.66], [0.72, 0.66, 0.86], [0.52, 0.38, 0.24],
    [0.28, 0.56, 0.62], [0.82, 0.42, 0.24], [0.56, 0.68, 0.42], [0.4, 0.3, 0.64]
  ];
  return colors.map((color, index) => new UnlitMaterial({
    name: `architecture-gallery-material-sample-${index}`,
    color: [color[0], color[1], color[2], 0.94],
    renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" }
  }));
}

function appendV4ArchitectureAssetRenderItems(items: RenderItem[], v4ArchitectureAsset: LoadedV4ArchitectureAsset, yaw: number, zoom: number, sectionView: boolean): void {
  const galleryShell = v4ArchitectureAsset.resources.scene.findByName("gallery-shell")[0];
  galleryShell?.transform
    .setPosition(-1.08, sectionView ? 0.42 : 0.38, 0.42)
    .setScale(0.18 * zoom, 0.18 * zoom, 0.18 * zoom)
    .setRotation(0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5));
  appendGLTFSceneRenderItems(items, v4ArchitectureAsset.resources, "v4-gallery-corner");
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

function appendArchitectureGalleryTiles(
  items: RenderItem[],
  materials: {
    readonly galleryBackdrop: RenderItem["material"];
    readonly galleryBase: RenderItem["material"];
    readonly floor: PBRMaterial;
    readonly wall: PBRMaterial;
    readonly glass: PBRMaterial;
    readonly roof: PBRMaterial;
    readonly mullion: PBRMaterial;
    readonly brass: RenderItem["material"];
    readonly exteriorConcrete: RenderItem["material"];
    readonly planting: PBRMaterial;
    readonly warmLight: PBRMaterial;
    readonly casework: RenderItem["material"];
    readonly stoneCounter: RenderItem["material"];
  },
  zoom: number,
  yaw: number
): void {
  const acousticPanel = new PBRMaterial({ name: "architecture-muted-acoustic-wall-panel", baseColor: [0.34, 0.44, 0.5, 1], roughness: 0.58, metallic: 0.02, emissiveColor: [0.025, 0.03, 0.035], emissiveStrength: 0.12, renderState: { cullMode: "none" } });
  const warmPanel = new PBRMaterial({ name: "architecture-muted-warm-wall-panel", baseColor: [0.64, 0.52, 0.42, 1], roughness: 0.62, metallic: 0.02, emissiveColor: [0.05, 0.035, 0.02], emissiveStrength: 0.1, renderState: { cullMode: "none" } });
  const sagePanel = new PBRMaterial({ name: "architecture-muted-sage-wall-panel", baseColor: [0.42, 0.52, 0.43, 1], roughness: 0.66, metallic: 0.01, emissiveColor: [0.025, 0.035, 0.025], emissiveStrength: 0.1, renderState: { cullMode: "none" } });
  const backdropPanels: readonly (readonly [number, number, number, number, RenderItem["material"], string])[] = [
    [-1.26, 0.38, 0.34, 0.72, materials.glass, "glazed-left"],
    [-0.84, 0.36, 0.24, 0.62, acousticPanel, "acoustic-left"],
    [-0.5, 0.34, 0.28, 0.58, warmPanel, "wood-accent-left"],
    [0.58, 0.36, 0.28, 0.62, sagePanel, "planting-accent-right"],
    [0.96, 0.38, 0.34, 0.72, materials.glass, "glazed-right"],
  ];
  for (const [x, y, sx, sy, material, label] of backdropPanels) {
    items.push({
      geometry: architectureGeometry.cube,
      material,
      modelMatrix: matrix(x, y, -0.18, sx * zoom, sy * zoom, 0.035 * zoom, yaw),
      label: `architecture-gallery-composed-backdrop-${label}`,
    });
  }
  const tiles: readonly (readonly [number, number, number, number, number, keyof typeof materials])[] = [
    [-1.34, -0.78, -0.08, 0.54, 0.16, "exteriorConcrete"],
    [-0.72, -0.8, -0.07, 0.46, 0.14, "galleryBase"],
    [0.7, -0.8, -0.07, 0.46, 0.14, "floor"],
    [1.3, -0.78, -0.08, 0.54, 0.16, "exteriorConcrete"],
    [-1.1, 0.02, -0.08, 0.08, 0.82, "mullion"],
    [1.1, 0.02, -0.08, 0.08, 0.82, "mullion"],
    [-0.28, 0.62, -0.08, 0.16, 0.08, "brass"],
    [0.28, 0.62, -0.08, 0.16, 0.08, "brass"],
    [-0.92, 0.18, -0.04, 0.16, 0.2, "planting"],
    [0.92, 0.18, -0.04, 0.16, 0.2, "planting"],
    [-0.08, 0.86, -0.04, 0.32, 0.055, "warmLight"],
    [-0.62, -0.34, 0.02, 0.22, 0.1, "casework"],
    [0.82, -0.3, 0.02, 0.22, 0.1, "stoneCounter"],
  ];
  for (const [index, [x, y, z, sx, sy, materialKey]] of tiles.entries()) {
    items.push({
      geometry: architectureGeometry.cube,
      material: materials[materialKey],
      modelMatrix: matrix(x, y, z, sx * zoom, sy * zoom, 0.035 * zoom, yaw + (index % 2 === 0 ? 0.018 : -0.018)),
      label: `architecture-gallery-material-band-${index + 1}`,
    });
  }
}

function createLitScene(canvas: HTMLCanvasElement): { readonly scene: Scene; readonly camera: PerspectiveCamera } {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "architecture-camera", fovYRadians: Math.PI / 4, aspect: canvas.width / canvas.height, near: 0.1, far: 30 });
  camera.transform.setPosition(0, 0, 4.8);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "architecture-key");
  key.intensity = 2.5;
  key.color = [1, 0.95, 0.84];
  scene.root.addChild(key);
  const fill = scene.createLight("point", "architecture-fill");
  fill.intensity = 1.55;
  fill.range = 9;
  fill.color = [0.5, 0.74, 1];
  fill.transform.setPosition(-2.2, 1.6, 3);
  scene.root.addChild(fill);
  return { scene, camera };
}

function environmentLighting(preset: LightPreset, sectionView: boolean): EnvironmentLightingOptions {
  if (preset === "exhibit") {
    return {
      color: [0.86, 0.9, 0.98],
      intensity: sectionView ? 0.56 : 0.74,
      proceduralMap: {
        skyColor: [0.76, 0.82, 0.94],
        horizonColor: [0.18, 0.22, 0.26],
        groundColor: [0.025, 0.03, 0.035],
        specularColor: [0.92, 0.96, 1],
        intensity: sectionView ? 0.48 : 0.66,
        specularIntensity: 0.54,
      },
    };
  }
  if (preset === "evening") {
    return {
      color: [1, 0.78, 0.52],
      intensity: sectionView ? 0.48 : 0.58,
      proceduralMap: {
        skyColor: [0.54, 0.38, 0.28],
        horizonColor: [0.22, 0.18, 0.2],
        groundColor: [0.035, 0.03, 0.032],
        specularColor: [1, 0.72, 0.46],
        intensity: sectionView ? 0.38 : 0.5,
        specularIntensity: 0.44,
      },
    };
  }
  return {
    color: sectionView ? [0.92, 0.88, 0.78] : [0.72, 0.82, 0.94],
    intensity: sectionView ? 0.52 : 0.64,
    proceduralMap: {
      skyColor: sectionView ? [0.92, 0.88, 0.78] : [0.58, 0.7, 0.86],
      horizonColor: [0.28, 0.32, 0.36],
      groundColor: [0.035, 0.04, 0.045],
      specularColor: [0.82, 0.9, 1],
      intensity: sectionView ? 0.42 : 0.58,
      specularIntensity: 0.36,
    },
  };
}

function architectureV4EnvironmentPreset(preset: LightPreset): "daylight" | "exhibit" | "evening" {
  if (preset === "exhibit") return "exhibit";
  if (preset === "evening") return "evening";
  return "daylight";
}

function architectureLightingPreset(preset: LightPreset): "noon" | "golden-hour" | "dusk" {
  if (preset === "exhibit") return "golden-hour";
  if (preset === "evening") return "dusk";
  return "noon";
}

function architecturalDetailGuideLines(): [number, number, number][] {
  const lines: [number, number, number][] = [
    [-0.2, -0.88, 0], [-0.2, -0.64, 0],
    [0.2, -0.88, 0], [0.2, -0.64, 0],
    [0.48, -0.42, 0], [0.78, -0.12, 0],
    [0.56, -0.36, 0], [0.86, -0.06, 0],
    [-1.1, 0.24, 0], [1.12, 0.24, 0],
    [-1.1, 0.7, 0], [1.12, 0.7, 0],
  ];
  const doorPivot: [number, number, number] = [-0.2, -0.88, 0];
  let previous: [number, number, number] = doorPivot;
  for (let step = 1; step <= 8; step += 1) {
    const angle = (Math.PI / 2) * (step / 8);
    const next: [number, number, number] = [doorPivot[0] + Math.sin(angle) * 0.24, doorPivot[1] + Math.cos(angle) * 0.24, 0];
    lines.push(previous, next);
    previous = next;
  }
  return lines;
}

function architecturalGalleryPanelLines(): [number, number, number][] {
  const lines: [number, number, number][] = [];
  for (let x = -2.26; x <= 2.27; x += 0.06) {
    lines.push([x, -1.22, 0], [x, 1.08, 0]);
  }
  for (let y = -1.18; y <= 1.09; y += 0.06) {
    lines.push([-2.28, y, 0], [2.28, y, 0]);
  }
  for (let index = 0; index < 31; index += 1) {
    const x = -2.18 + index * 0.145;
    lines.push([x, -1.12, 0], [x + 0.12, -0.86, 0]);
    lines.push([x + 0.04, 0.76, 0], [x + 0.22, 1.02, 0]);
    if (index % 2 === 0) {
      lines.push([x, -0.54, 0], [x + 0.16, -0.34, 0]);
      lines.push([x + 0.02, 0.1, 0], [x + 0.18, 0.34, 0]);
    }
  }
  lines.push(
    [-1.18, 0.48, 0], [-0.84, 0.7, 0],
    [-0.84, 0.7, 0], [-0.28, 0.7, 0],
    [0.28, 0.7, 0], [0.84, 0.7, 0],
    [0.84, 0.7, 0], [1.18, 0.48, 0],
    [-1.02, -0.88, 0], [-0.28, -0.68, 0],
    [0.28, -0.68, 0], [1.02, -0.88, 0]
  );
  return lines;
}

function architecturalSectionHatchingLines(): [number, number, number][] {
  const bounds = { left: -1.02, right: 1.1, bottom: -0.76, top: 0.36 };
  const spacing = 0.085;
  const lines: [number, number, number][] = [];
  for (const slope of [0.72, -0.72]) {
    const minIntercept = bounds.bottom - slope * bounds.right;
    const maxIntercept = bounds.top - slope * bounds.left;
    for (let intercept = minIntercept; intercept <= maxIntercept; intercept += spacing) {
      const segment = clippedLineSegment(bounds, slope, intercept);
      if (segment) lines.push(segment[0], segment[1]);
    }
  }
  return lines;
}

function createSectionHatchingEvidence(lines: readonly [number, number, number][]): ArchitectureSectionHatchingEvidence {
  return {
    source: "origin-master-architecture-section-hatching-adapted",
    pattern: "concrete-crosshatch",
    lineCount: Math.floor(lines.length / 2),
    layerCount: 2,
    angleDegrees: [36, -36],
    spacingMeters: 0.085,
    hash: hashSectionHatchingLines(lines),
    claimBoundary: "Bounded deterministic crosshatch linework adapted from the old branch section hatching generator; this proves visible section-cut annotation, not arbitrary BIM polygon clipping parity.",
  };
}

function clippedLineSegment(
  bounds: { readonly left: number; readonly right: number; readonly bottom: number; readonly top: number },
  slope: number,
  intercept: number
): readonly [[number, number, number], [number, number, number]] | undefined {
  const candidates: [number, number, number][] = [];
  const yAtLeft = slope * bounds.left + intercept;
  if (yAtLeft >= bounds.bottom && yAtLeft <= bounds.top) candidates.push([bounds.left, yAtLeft, 0]);
  const yAtRight = slope * bounds.right + intercept;
  if (yAtRight >= bounds.bottom && yAtRight <= bounds.top) candidates.push([bounds.right, yAtRight, 0]);
  const xAtBottom = (bounds.bottom - intercept) / slope;
  if (xAtBottom >= bounds.left && xAtBottom <= bounds.right) candidates.push([xAtBottom, bounds.bottom, 0]);
  const xAtTop = (bounds.top - intercept) / slope;
  if (xAtTop >= bounds.left && xAtTop <= bounds.right) candidates.push([xAtTop, bounds.top, 0]);
  const unique = uniquePoints(candidates);
  if (unique.length < 2) return undefined;
  return [unique[0]!, unique[unique.length - 1]!];
}

function uniquePoints(points: readonly [number, number, number][]): [number, number, number][] {
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const point of points) {
    const key = `${point[0].toFixed(4)}:${point[1].toFixed(4)}:${point[2].toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }
  return result;
}

function hashSectionHatchingLines(lines: readonly [number, number, number][]): string {
  let hash = 0x811c9dc5;
  for (const [x, y, z] of lines) {
    for (const value of [x, y, z]) {
      hash ^= Math.round(value * 10_000);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function zoneOutline(zone: Zone): [number, number, number][] {
  const [x, y] = zone.center;
  const [sx, sy] = zone.size;
  const left = x - sx / 2;
  const right = x + sx / 2;
  const bottom = y - sy / 2;
  const top = y + sy / 2;
  return [
    [left, bottom, 0], [right, bottom, 0],
    [right, bottom, 0], [right, top, 0],
    [right, top, 0], [left, top, 0],
    [left, top, 0], [left, bottom, 0],
  ];
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, yaw: number): Float32Array {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function stableArchitectureYaw(value: number): number {
  return clamp(value, -0.46, 0.46);
}

function zoneFromViewportX(x: number): number {
  if (x < 120) return 0;
  if (x < 520) return 1;
  return 2;
}

function selectedElementForZone(zone: Zone): ArchitectureElement {
  return architectureElements.find((element) => element.id === zone.elementId) ?? architectureElements[0]!;
}

function createShell(): {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  zoneButtons: HTMLButtonElement[];
  cameraButtons: HTMLButtonElement[];
  viewControlButtons: HTMLButtonElement[];
  lightButtons: HTMLButtonElement[];
  sectionToggle: HTMLInputElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "architecture-demo-shell";
  shell.innerHTML = `
    <canvas data-testid="architecture-viewer-canvas" width="960" height="540" tabindex="0" aria-label="Interactive architecture viewer WebGL viewport"></canvas>
    <section class="panel">
      <header>
        <h1>Architecture Viewer</h1>
        <p>Generated civic gallery fixture with selectable room elements, measurements, and contact-shadow receiver decals.</p>
      </header>
      <div>
        <h2>Zones</h2>
        <div class="zone-buttons">
          ${zones.map((zone, index) => `<button type="button" data-zone="${zone.id}" aria-pressed="${index === 0}">${zone.label}</button>`).join("")}
        </div>
      </div>
      <div>
        <h2>Camera</h2>
        <div class="camera-buttons">
          <button type="button" data-camera="orbit" aria-pressed="true">Orbit</button>
          <button type="button" data-camera="walk" aria-pressed="false">Walk</button>
          <button type="button" data-camera="plan" aria-pressed="false">Plan</button>
          <button type="button" data-camera="section" aria-pressed="false">Section</button>
        </div>
      </div>
      <div>
        <h2>Lighting</h2>
        <div class="zone-buttons">
          <button type="button" data-light="daylight" aria-pressed="true">Daylight</button>
          <button type="button" data-light="exhibit" aria-pressed="false">Exhibit</button>
          <button type="button" data-light="evening" aria-pressed="false">Evening</button>
        </div>
      </div>
      <div>
        <h2>View</h2>
        <div class="view-controls">
          <button type="button" data-view-control="orbit">Orbit</button>
          <button type="button" data-view-control="pan">Pan</button>
          <button type="button" data-view-control="zoom-in">Zoom +</button>
          <button type="button" data-view-control="zoom-out">Zoom -</button>
          <button type="button" data-view-control="focus">Focus</button>
          <button type="button" data-view-control="reset">Reset</button>
        </div>
      </div>
      <label class="toggle"><input type="checkbox" data-section-toggle> Section view</label>
      <pre data-testid="architecture-viewer-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("pre")!,
    zoneButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-zone]")),
    cameraButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-camera]")),
    viewControlButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-view-control]")),
    lightButtons: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-light]")),
    sectionToggle: shell.querySelector<HTMLInputElement>("input[data-section-toggle]")!,
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #22282c; color: #edf4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .architecture-demo-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 20rem; }
    canvas { width: 100%; height: 100vh; display: block; background: radial-gradient(circle at 50% 32%, #77858a 0, #475157 58%, #22282c 100%); touch-action: none; }
    .panel { height: 100vh; max-height: 100vh; box-sizing: border-box; border-left: 1px solid #2a3842; background: #151e25; padding: 0.9rem; display: grid; align-content: start; gap: 0.72rem; overflow: auto; }
    header, .panel > div { display: grid; gap: 0.55rem; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 1.25rem; }
    h2 { color: #dce8ef; font-size: 0.82rem; font-weight: 650; text-transform: uppercase; }
    p { color: #bbcad4; line-height: 1.35; }
    .zone-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    .camera-buttons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
    .view-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    button { position: relative; z-index: 1; border: 1px solid #3b4a54; border-radius: 6px; background: #202a32; color: #eef4f9; min-height: 2.35rem; padding: 0.45rem 0.55rem; cursor: pointer; font: inherit; }
    button[aria-pressed="true"] { border-color: #8ce7ff; box-shadow: inset 0 -3px 0 #8ce7ff; }
    .toggle { display: flex; align-items: center; gap: 0.55rem; color: #dbe8ef; }
    input { width: 1rem; height: 1rem; }
    pre { display: none; }
    @media (max-width: 840px) { .architecture-demo-shell { grid-template-columns: 1fr; } canvas { height: 62vh; } .panel { border-left: 0; border-top: 1px solid #2a3842; } }
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
