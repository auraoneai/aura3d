import {
  Geometry,
  Renderer,
  computePerspectiveCameraFrame,
  type RenderDeviceDiagnostics,
  type RenderItem
} from "/packages/rendering/src/index.js";
import {
  DATA_GALAXY_SHOWCASE_PARTICLES,
  createDataGalaxyBudgetPlan,
  createDataGalaxyCompositionProfile
} from "/apps/advanced-examples-gallery/src/dataGalaxyBudgets.js";
import { getPointCloud } from "/apps/advanced-examples-gallery/src/dataGalaxyScene.js";
import {
  createDataGalaxyEvidence,
  createDataGalaxyGeometryEvidence
} from "/apps/advanced-examples-gallery/src/dataGalaxyEvidence.js";
import {
  applyGalleryRoutePostprocessPolicy
} from "/apps/advanced-examples-gallery/src/galleryRoutePolicies.js";
import {
  createResources,
  env,
  lights,
  mat
} from "/apps/advanced-examples-gallery/src/sceneBuilders.js";
import {
  createAdvancedGalleryShaderLibrary
} from "/apps/advanced-examples-gallery/src/showcaseShaders.js";
import { modelMatrix } from "/apps/advanced-examples-gallery/src/math.js";

declare global {
  interface Window {
    __DATA_GALAXY_REFERENCE__?: DataGalaxyReferenceReport;
  }
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly nonTransparentPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly centerPixel: readonly [number, number, number, number];
}

interface DataGalaxyReferenceReport {
  readonly status: "ready" | "error";
  readonly schema: "a3d-data-galaxy-reference";
  readonly error?: string;
  readonly route: "data-galaxy";
  readonly harness: {
    readonly purpose: string;
    readonly galleryShellUi: false;
    readonly importedRouteModules: readonly string[];
    readonly fixedCamera: true;
    readonly fixedDensity: true;
    readonly fixedBackground: true;
    readonly claimBoundary: string;
  };
  readonly render?: {
    readonly width: number;
    readonly height: number;
    readonly cssWidth: number;
    readonly cssHeight: number;
    readonly devicePixelRatio: number;
    readonly effectiveBackingDprX: number;
    readonly effectiveBackingDprY: number;
    readonly rendererBackend: string;
    readonly cpuGpuMode: "cpu-static-point-buffers-webgl2-render";
    readonly diagnostics: RenderDeviceDiagnostics;
    readonly pixelStats: PixelStats;
  };
  readonly dataGalaxy?: {
    readonly requestedParticles: number;
    readonly effectiveParticles: number;
    readonly mode: string;
    readonly densityTier: string;
    readonly primaryCount: number;
    readonly vortexCount: number;
    readonly networkCount: number;
    readonly waveCount: number;
    readonly nativeGpuComputeDispatches: 0;
    readonly overlayPointCount: number;
    readonly overlayPointDrawBatches: number;
    readonly lineSegmentCount: number;
    readonly lineDrawBatches: number;
    readonly trailSegmentCount: number;
    readonly connectionSegmentCount: number;
    readonly telemetryRingSegmentCount: number;
    readonly totalParticleEvidenceCount: number;
    readonly totalLineEvidenceCount: number;
    readonly attractorCount: number;
    readonly coreSystemLabels: readonly string[];
    readonly systems: readonly string[];
    readonly approximations: readonly string[];
  };
  readonly postprocess?: {
    readonly active: boolean;
    readonly toneMapping: boolean;
    readonly colorGrade: boolean;
    readonly fxaa: boolean;
    readonly passNames: readonly string[];
    readonly passCount: number;
    readonly targetFormat?: string;
    readonly outputColorSpace: "srgb";
    readonly plan?: RenderDeviceDiagnostics["postprocessPlan"];
  };
  readonly dataUrl?: string;
}

const CSS_WIDTH = 960;
const CSS_HEIGHT = 720;
const DPR = 1;
const WIDTH = CSS_WIDTH * DPR;
const HEIGHT = CSS_HEIGHT * DPR;
const TIME_SECONDS = 18.75;
const REQUESTED_PARTICLES = DATA_GALAXY_SHOWCASE_PARTICLES;
const FORMATION = "galaxy";
const SPEED = 1;
const TURBULENCE = 0.7;
const CONNECTIONS = true;
const POINTER = { x: 0.62, y: 0.42 } as const;

async function run(): Promise<void> {
  try {
    const canvas = document.createElement("canvas");
    canvas.id = "data-galaxy-reference-canvas";
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.width = `${CSS_WIDTH}px`;
    canvas.style.height = `${CSS_HEIGHT}px`;
    canvas.style.display = "block";
    canvas.style.background = "#02040a";
    document.body.style.margin = "0";
    document.body.style.background = "#02040a";
    document.body.append(canvas);

    const resources = createResources();
    const budget = createDataGalaxyBudgetPlan({ requestedParticles: REQUESTED_PARTICLES, connections: CONNECTIONS });
    const composition = createDataGalaxyCompositionProfile(budget);
    const geometry = createDataGalaxyGeometryEvidence({
      time: TIME_SECONDS,
      requestedParticles: REQUESTED_PARTICLES,
      formation: FORMATION,
      speed: SPEED,
      turbulence: TURBULENCE,
      connections: CONNECTIONS,
      pointer: POINTER
    });
    const evidence = createDataGalaxyEvidence({
      time: TIME_SECONDS,
      requestedParticles: REQUESTED_PARTICLES,
      formation: FORMATION,
      speed: SPEED,
      turbulence: TURBULENCE,
      connections: CONNECTIONS,
      pointer: POINTER,
      geometryStats: geometry
    });
    const renderItems = createReferenceRenderItems(resources, budget, composition, geometry);
    const environment = env("space");
    const cameraFrame = computePerspectiveCameraFrame(
      { min: [-1.22, -0.78, -1.0], max: [1.24, 0.88, 1.0] },
      { width: WIDTH, height: HEIGHT },
      {
        yawRadians: -0.22,
        pitchRadians: -0.08,
        paddingRatio: 0.018,
        fovYRadians: 0.55,
        nearPadding: 0.08,
        farPadding: 3.2
      }
    );
    const postprocess = applyGalleryRoutePostprocessPolicy("data-galaxy", {
      bloom: false,
      colorGrade: { contrast: 1.12, saturation: 1.04 },
      fxaa: true
    }, {
      particles: REQUESTED_PARTICLES,
      formation: FORMATION,
      speed: SPEED,
      turbulence: TURBULENCE,
      connections: CONNECTIONS
    });
    const renderer = await Renderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      backend: "webgl2",
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      errorCheckMode: "frame",
      clearColor: [0.005, 0.008, 0.018, 1],
      shaderLibrary: createAdvancedGalleryShaderLibrary(),
      requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"]
    });
    const diagnostics = renderer.render({
      source: {
        renderItems,
        cameraPolicy: "require",
        cameraPosition: cameraFrame.cameraPosition,
        collectedLights: lights("data"),
        environmentLighting: environment,
        environmentBackground: false,
        environmentFog: false,
        postprocess,
        frustumCulling: false,
        staticBatching: true
      },
      camera: {
        viewProjectionMatrix: cameraFrame.viewProjectionMatrix,
        viewMatrix: cameraFrame.viewMatrix,
        projectionMatrix: cameraFrame.projectionMatrix
      }
    });
    const pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
    const pointCloudParticleCount = countPointCloudParticles(renderItems);

    window.__DATA_GALAXY_REFERENCE__ = {
      status: "ready",
      schema: "a3d-data-galaxy-reference",
      route: "data-galaxy",
      harness: {
        purpose: "same-system Data Galaxy reference harness outside the advanced gallery shell",
        galleryShellUi: false,
        importedRouteModules: [
          "apps/advanced-examples-gallery/src/dataGalaxyScene.ts",
          "apps/advanced-examples-gallery/src/dataGalaxyBudgets.ts",
          "apps/advanced-examples-gallery/src/dataGalaxyEvidence.ts",
          "apps/advanced-examples-gallery/src/galleryRoutePolicies.ts",
          "apps/advanced-examples-gallery/src/sceneBuilders.ts"
        ],
        fixedCamera: true,
        fixedDensity: true,
        fixedBackground: true,
        claimBoundary: "This harness renders the same Data Galaxy route systems through A3D WebGL2 without the gallery shell UI. It proves deterministic CPU/static point-buffer density, overlay point/line/core evidence, renderer diagnostics, and postprocess state; it does not prove native GPU-compute particle simulation or Three.js visual parity."
      },
      render: {
        width: WIDTH,
        height: HEIGHT,
        cssWidth: CSS_WIDTH,
        cssHeight: CSS_HEIGHT,
        devicePixelRatio: DPR,
        effectiveBackingDprX: WIDTH / CSS_WIDTH,
        effectiveBackingDprY: HEIGHT / CSS_HEIGHT,
        rendererBackend: renderer.device.kind,
        cpuGpuMode: "cpu-static-point-buffers-webgl2-render",
        diagnostics,
        pixelStats: analyzePixels(pixels)
      },
      dataGalaxy: {
        requestedParticles: budget.requestedParticles,
        effectiveParticles: budget.effectiveParticles,
        mode: budget.mode,
        densityTier: budget.densityTier,
        primaryCount: budget.primaryCount,
        vortexCount: budget.vortexCount,
        networkCount: budget.networkCount,
        waveCount: budget.waveCount,
        nativeGpuComputeDispatches: budget.nativeGpuComputeDispatches,
        overlayPointCount: geometry.pointCount,
        overlayPointDrawBatches: geometry.pointDrawBatches,
        lineSegmentCount: geometry.lineSegmentCount,
        lineDrawBatches: geometry.lineDrawBatches,
        trailSegmentCount: geometry.trailSegmentCount,
        connectionSegmentCount: geometry.connectionSegmentCount,
        telemetryRingSegmentCount: geometry.telemetryRingSegmentCount,
        totalParticleEvidenceCount: pointCloudParticleCount + geometry.pointCount,
        totalLineEvidenceCount: geometry.lineSegmentCount,
        attractorCount: geometry.attractors.length,
        coreSystemLabels: renderItems.map((item) => item.label ?? "").filter((label) => label.includes("core") || label.includes("attractor") || label.includes("telemetry")),
        systems: [
          "separated CPU point-cloud layers",
          "batched inference spark buffers",
          "formation controls",
          "bounded attractor evidence",
          "connection graph",
          ...evidence.animatedSystems
        ],
        approximations: evidence.approximations
      },
      postprocess: {
        active: postprocess !== false,
        toneMapping: diagnostics.postprocessPassNames?.includes("tone-mapping") ?? false,
        colorGrade: diagnostics.postprocessPassNames?.includes("color-grade") ?? false,
        fxaa: diagnostics.postprocessPassNames?.includes("fxaa") ?? false,
        passNames: diagnostics.postprocessPassNames ?? [],
        passCount: diagnostics.postprocessPasses ?? 0,
        targetFormat: diagnostics.postprocessTargetFormat,
        outputColorSpace: "srgb",
        plan: diagnostics.postprocessPlan
      },
      dataUrl: canvas.toDataURL("image/png")
    };
  } catch (error) {
    window.__DATA_GALAXY_REFERENCE__ = {
      status: "error",
      schema: "a3d-data-galaxy-reference",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      route: "data-galaxy",
      harness: {
        purpose: "same-system Data Galaxy reference harness outside the advanced gallery shell",
        galleryShellUi: false,
        importedRouteModules: [
          "apps/advanced-examples-gallery/src/dataGalaxyScene.ts",
          "apps/advanced-examples-gallery/src/dataGalaxyBudgets.ts",
          "apps/advanced-examples-gallery/src/dataGalaxyEvidence.ts"
        ],
        fixedCamera: true,
        fixedDensity: true,
        fixedBackground: true,
        claimBoundary: "Harness failed before a render report could be emitted."
      }
    };
  }
}

function countPointCloudParticles(items: readonly RenderItem[]): number {
  return items
    .filter((item) => {
      const label = item.label ?? "";
      return label === "primary particle cloud"
        || label === "vortex particle layer"
        || label === "warm agent cluster layer"
        || label === "green wave particle layer";
    })
    .reduce((sum, item) => sum + item.geometry.vertexBuffer.vertexCount, 0);
}

function createReferenceRenderItems(
  resources: ReturnType<typeof createResources>,
  budget: ReturnType<typeof createDataGalaxyBudgetPlan>,
  composition: ReturnType<typeof createDataGalaxyCompositionProfile>,
  geometry: ReturnType<typeof createDataGalaxyGeometryEvidence>
): RenderItem[] {
  const primaryPoints = getPointCloud(resources, FORMATION, budget.primaryCount, TURBULENCE);
  const vortexPoints = getPointCloud(resources, "vortex", budget.vortexCount, TURBULENCE * 0.85 + 0.12);
  const networkPoints = getPointCloud(resources, "network", budget.networkCount, TURBULENCE * 1.2 + 0.08);
  const wavePoints = getPointCloud(resources, "wave", budget.waveCount, TURBULENCE * 0.55 + 0.1);
  const items: RenderItem[] = [
    {
      geometry: primaryPoints,
      material: mat(resources, "particle"),
      modelMatrix: modelMatrix(composition.primary.position, composition.primary.scale, [0.14 * Math.sin(TIME_SECONDS * 0.3), TIME_SECONDS * 0.1 * SPEED, 0]),
      label: "primary particle cloud"
    },
    {
      geometry: vortexPoints,
      material: mat(resources, "particleViolet"),
      modelMatrix: modelMatrix(composition.vortex.position, composition.vortex.scale, [-0.12, -TIME_SECONDS * 0.14 * SPEED, 0.06]),
      label: "vortex particle layer"
    },
    {
      geometry: networkPoints,
      material: mat(resources, "particleWarm"),
      modelMatrix: modelMatrix(composition.network.position, composition.network.scale, [0.08, TIME_SECONDS * 0.06 * SPEED, -0.04]),
      label: "warm agent cluster layer"
    },
    {
      geometry: wavePoints,
      material: mat(resources, "particleGreen"),
      modelMatrix: modelMatrix(composition.wave.position, composition.wave.scale, [TIME_SECONDS * 0.06 * SPEED, 0, 0.12]),
      label: "green wave particle layer"
    },
    {
      geometry: resources.geometry.sphere,
      material: mat(resources, "cyanGlow"),
      modelMatrix: modelMatrix([0, 0.03, 0], [0.12, 0.12, 0.12], [0, TIME_SECONDS * 0.28, 0]),
      label: "reference data galaxy core"
    }
  ];

  for (const group of geometry.pointGroups) {
    if (group.positions.length === 0) continue;
    items.push({ geometry: Geometry.points(group.positions), material: mat(resources, group.material), label: group.label });
  }
  for (const group of geometry.lineGroups) {
    if (group.positions.length < 2) continue;
    items.push({ geometry: Geometry.lineSegments(group.positions), material: mat(resources, group.material), label: group.label });
  }
  for (let i = 0; i < geometry.attractors.length; i += 1) {
    const attractor = geometry.attractors[i]!;
    const scale = 0.042 + (i % 3) * 0.012;
    items.push({
      geometry: resources.geometry.sphere,
      material: mat(resources, i % 3 === 0 ? "amberGlow" : i % 2 === 0 ? "violetGlow" : "cyanGlow"),
      modelMatrix: modelMatrix(attractor, [scale, scale, scale], [0, TIME_SECONDS * (0.22 + i * 0.01) * SPEED, 0]),
      label: "animated attractor solid"
    });
  }
  for (let i = 0; i < 10; i += 1) {
    const lane = i % 2;
    const x = -0.72 + i * 0.14;
    const height = 0.018 + (i % 3) * 0.005 + Math.sin(TIME_SECONDS * 0.72 * SPEED + i * 0.37) * 0.003;
    items.push({
      geometry: resources.geometry.cube,
      material: mat(resources, lane === 0 ? "transparentCyan" : "transparentAmber"),
      modelMatrix: modelMatrix([x, -0.76 + lane * 0.035, 0.96 + lane * 0.06], [0.06, height, 0.018], [0, 0.08, 0]),
      label: "particle batch telemetry bar"
    });
  }
  return items;
}

function analyzePixels(pixels: Uint8Array): PixelStats {
  let nonBlackPixels = 0;
  let nonTransparentPixels = 0;
  let lumaTotal = 0;
  let maxLuma = 0;
  const buckets = new Set<string>();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a > 0) nonTransparentPixels += 1;
    if (luma > 8) nonBlackPixels += 1;
    if (luma > maxLuma) maxLuma = luma;
    lumaTotal += luma;
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}:${a >> 6}`);
  }
  const center = ((Math.floor(HEIGHT / 2) * WIDTH) + Math.floor(WIDTH / 2)) * 4;
  return {
    nonBlackPixels,
    nonTransparentPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / Math.max(1, pixels.length / 4)).toFixed(3)),
    maxLuma: Number(maxLuma.toFixed(3)),
    centerPixel: [
      pixels[center] ?? 0,
      pixels[center + 1] ?? 0,
      pixels[center + 2] ?? 0,
      pixels[center + 3] ?? 0
    ]
  };
}

void run();
