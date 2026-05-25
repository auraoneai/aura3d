import {
  G3DRenderer,
  createCameraFrame,
  createGroundedStage,
  createStudioLighting,
  loadGltfScene,
  loadHdrEnvironment
} from "/packages/engine/src/production-runtime/index.js";
import {
  applyCarConceptMaterialStability,
  carConceptMaterialVisualRole,
  carConceptMaterialRenderStateOverrides
} from "/packages/assets/src/browser-index.js";
import { createLightingRig, Material, type CollectedLight, type RenderItem, type RenderState, type UniformValue } from "/packages/rendering/src/index.js";
import { createProductConfiguratorShowroomLighting } from "/apps/advanced-examples-gallery/src/productConfiguratorLighting.js";

declare global {
  interface Window {
    __G3D_PRODUCT_MATERIAL_MATRIX__?: ProductConfiguratorMaterialMatrixReport;
    __G3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__?: readonly string[];
    runProductConfiguratorMaterialMatrixHarness?: typeof runProductConfiguratorMaterialMatrixHarness;
  }
}

type MatrixStatus = "ready" | "error";
type MatrixLighting = "fallback" | "hdr";
type MatrixProfile = "none" | "gallery" | "cinematic";
type MatrixRenderState = "raw" | "product";
type MatrixMaterialVariant = "Carmine Candy" | "Pearly Swirly" | "Torched Graphite";
type MatrixEnvironmentMutation = "sampled-specular-off" | "sampled-environment-off";
type MatrixRouteLighting = "matrix-studio" | "product-route-current" | "product-route-balanced" | "product-route-direct-detail" | "product-route-material-rich";
type MatrixPostprocess =
  | "none"
  | "product-route-current"
  | "product-route-balanced"
  | "product-route-material-rich"
  | "product-route-fxaa-only"
  | "product-route-tone-fxaa"
  | "product-route-tone-only"
  | "product-route-soft-tone-only"
  | "product-route-no-tone-soft-fxaa";

interface MatrixVariantConfig {
  readonly id: string;
  readonly label: string;
  readonly lighting: MatrixLighting;
  readonly profile: MatrixProfile;
  readonly renderState: MatrixRenderState;
  readonly materialVariant?: MatrixMaterialVariant;
  readonly mutation?: "paint-texture-on" | "paint-texture-off" | "normal-off" | "clearcoat-off" | "extension-energy-off" | "glass-readable";
  readonly environmentMutation?: MatrixEnvironmentMutation;
  readonly routeLighting?: MatrixRouteLighting;
  readonly postprocess?: MatrixPostprocess;
}

export interface ProductConfiguratorMaterialMatrixReport {
  readonly schema: "g3d-product-configurator-material-matrix/v1";
  readonly status: MatrixStatus;
  readonly source: "tests/browser/product-configurator-material-matrix-harness.ts";
  readonly galleryUiBypassed: true;
  readonly asset: {
    readonly id: "car-concept";
    readonly url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb";
  };
  readonly viewport: typeof VIEWPORT;
  readonly variants: readonly ProductConfiguratorMaterialMatrixVariant[];
  readonly diagnostics: ProductConfiguratorMaterialMatrixDiagnostics;
  readonly ownerConclusion: {
    readonly whiteHaloSpeckleOwner: string;
    readonly materialRichnessOwner: string;
    readonly nextSourceOwner: string;
    readonly nextSourceChange: string;
    readonly routeCaptureAllowed: boolean;
  };
  readonly error?: string;
}

export interface ProductConfiguratorMaterialMatrixVariant {
  readonly id: string;
  readonly label: string;
  readonly lighting: MatrixLighting;
  readonly profile: MatrixProfile;
  readonly renderState: MatrixRenderState;
  readonly materialVariant: MatrixMaterialVariant | "default";
  readonly mutation: MatrixVariantConfig["mutation"] | "none";
  readonly environmentMutation: MatrixEnvironmentMutation | "none";
  readonly routeLighting: MatrixRouteLighting;
  readonly postprocess: MatrixPostprocess;
  readonly captureReady: boolean;
  readonly drawCalls: number;
  readonly lastError: string | null;
  readonly runtimeMaterials: readonly ProductMaterialRuntimeSample[];
  readonly renderableMaterials: readonly ProductRenderableMaterialRuntimeSample[];
  readonly roleDiagnostics: readonly ProductMaterialRoleDiagnostic[];
  readonly metrics: ProductMaterialMatrixPixelStats;
  readonly pngDataUrl: string;
}

interface ProductMaterialRuntimeSample {
  readonly key: string;
  readonly name: string;
  readonly renderState: {
    readonly blend: boolean;
    readonly depthWrite: boolean;
    readonly cullMode: string;
  };
  readonly uniforms: {
    readonly baseColor?: readonly [number, number, number, number];
    readonly baseColorTextureEnabled?: number;
    readonly normalTextureEnabled?: number;
    readonly normalScale?: number;
    readonly metallic?: number;
    readonly metallicRoughnessTextureEnabled?: number;
    readonly occlusionTextureEnabled?: number;
    readonly occlusionStrength?: number;
    readonly roughness?: number;
    readonly specularFactor?: number;
    readonly specularTextureEnabled?: number;
    readonly specularColorTextureEnabled?: number;
    readonly clearcoatFactor?: number;
    readonly clearcoatTextureEnabled?: number;
    readonly clearcoatRoughnessFactor?: number;
    readonly clearcoatNormalTextureEnabled?: number;
    readonly iridescenceFactor?: number;
    readonly iridescenceTextureEnabled?: number;
    readonly transmissionFactor?: number;
    readonly transmissionTextureEnabled?: number;
    readonly materialEnvironmentSpecularScale?: number;
  };
}

const CAR_CONCEPT_RISK_MATERIAL_PATTERN = /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color|Panel Sides|BodyRoofPanel|BodyPillars|Glass|Window|Windshield|Tireside|Tiretread|Rim[12]|Disc|Brake|Hardware|Mirror|Dashboard|Mechanical|Interior|Floormat|material-2/i;

interface ProductRenderableMaterialRuntimeSample extends ProductMaterialRuntimeSample {
  readonly nodeName: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly sourceMaterialName: string;
  readonly visualRole: string;
  readonly drawItems: number;
  readonly nodes: readonly string[];
  readonly sourceMaterials: readonly string[];
  readonly renderStateRisk: boolean;
  readonly textureEscape: boolean;
}

interface ProductMaterialRoleDiagnostic {
  readonly visualRole: string;
  readonly drawItems: number;
  readonly materialKeys: readonly string[];
  readonly sourceMaterials: readonly string[];
  readonly representativeNodes: readonly string[];
  readonly renderStateRiskCount: number;
  readonly textureEscapeCount: number;
  readonly averageEnvironmentSpecularScale: number | null;
  readonly averageSpecularFactor: number | null;
  readonly averageClearcoatFactor: number | null;
}

interface ProductConfiguratorMaterialMatrixDiagnostics {
  readonly routeCurrentReproducesFailure: boolean;
  readonly routeCurrentDetailLoss: {
    readonly uniqueColorBucketLoss: number;
    readonly localLumaNoiseLoss: number;
    readonly edgeHaloDelta: number;
  };
  readonly noOpComparisons: readonly ProductMaterialMatrixNoOpComparison[];
  readonly requiredRoleCoverage: {
    readonly expectedRoles: readonly string[];
    readonly presentRoles: readonly string[];
    readonly missingRoles: readonly string[];
  };
  readonly riskyRenderableStateCount: number;
  readonly unclassifiedRiskMaterialCount: number;
  readonly unclassifiedRiskyRenderableCount: number;
}

interface ProductMaterialMatrixNoOpComparison {
  readonly id: string;
  readonly leftVariant: string;
  readonly rightVariant: string;
  readonly expectedToDiffer: boolean;
  readonly pixelsDiffer: boolean;
  readonly metricDelta: {
    readonly uniqueColorBuckets: number;
    readonly localLumaNoise: number;
    readonly edgeHaloRatio: number;
    readonly averageLuma: number;
  };
  readonly status: "changed" | "unexpected-no-op" | "expected-no-op";
}

interface ProductRenderableMaterialBinding {
  readonly nodeName: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly sourceMaterialName: string;
}

interface ProductMaterialMatrixPixelStats {
  readonly nonBlackPixels: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly uniqueColorBuckets: number;
  readonly redPaintCoverage: number;
  readonly meanRedDominance: number;
  readonly brightSpeckleRatio: number;
  readonly edgeHaloRatio: number;
  readonly grayWhiteCoverage: number;
  readonly washedGrayWhiteRatio: number;
  readonly localLumaNoise: number;
}

const VIEWPORT = { width: 760, height: 520 } as const;
const CAR_URL = "/fixtures/threejs-parity/assets/vehicles/car-concept.glb" as const;

const MATRIX_VARIANTS: readonly MatrixVariantConfig[] = [
  {
    id: "raw-fallback",
    label: "Raw import, fallback lighting",
    lighting: "fallback",
    profile: "none",
    renderState: "raw"
  },
  {
    id: "raw-hdr",
    label: "Raw import, HDR environment",
    lighting: "hdr",
    profile: "none",
    renderState: "raw"
  },
  {
    id: "gallery-hdr",
    label: "Product gallery stability profile, HDR environment",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product"
  },
  {
    id: "gallery-route-current-hdr",
    label: "Product gallery profile with current route lighting/postprocess",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "product-route-current"
  },
  {
    id: "gallery-route-current-no-postprocess-hdr",
    label: "Product gallery profile with current route lighting and no postprocess",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "none"
  },
  {
    id: "gallery-route-current-tone-only-hdr",
    label: "Product gallery profile with current route lighting and tone mapping only",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "product-route-tone-only"
  },
  {
    id: "gallery-route-current-soft-tone-only-hdr",
    label: "Product gallery profile with current route lighting and softer tone mapping only",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "product-route-soft-tone-only"
  },
  {
    id: "gallery-route-current-no-tone-soft-fxaa-hdr",
    label: "Product gallery profile with current route lighting, no tone mapping, and soft FXAA",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "product-route-no-tone-soft-fxaa"
  },
  {
    id: "gallery-route-no-postprocess-sampled-specular-off-hdr",
    label: "Product gallery profile with current route lighting, no postprocess, sampled specular disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    environmentMutation: "sampled-specular-off",
    postprocess: "none"
  },
  {
    id: "gallery-route-direct-detail-no-postprocess-hdr",
    label: "Product gallery profile with bounded direct-detail route lighting and no postprocess",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-direct-detail",
    environmentMutation: "sampled-specular-off",
    postprocess: "none"
  },
  {
    id: "gallery-route-direct-detail-tone-fxaa-hdr",
    label: "Product gallery profile with bounded direct-detail route lighting, tone mapping, and FXAA",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-direct-detail",
    environmentMutation: "sampled-specular-off",
    postprocess: "product-route-tone-fxaa"
  },
  {
    id: "gallery-route-fxaa-only-hdr",
    label: "Product gallery profile with current route lighting and FXAA only",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "product-route-fxaa-only"
  },
  {
    id: "gallery-route-tone-fxaa-hdr",
    label: "Product gallery profile with current route lighting, tone mapping, and FXAA",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-current",
    postprocess: "product-route-tone-fxaa"
  },
  {
    id: "gallery-route-balanced-hdr",
    label: "Product gallery profile with balanced route lighting/postprocess",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-balanced",
    postprocess: "product-route-balanced"
  },
  {
    id: "gallery-route-material-rich-hdr",
    label: "Product gallery profile with material-rich route lighting/postprocess candidate",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-material-rich",
    postprocess: "product-route-material-rich"
  },
  {
    id: "gallery-route-material-rich-no-postprocess-hdr",
    label: "Product gallery profile with material-rich route lighting and no postprocess",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    routeLighting: "product-route-material-rich",
    postprocess: "none"
  },
  {
    id: "gallery-carmine-variant-hdr",
    label: "Product gallery profile, Carmine Candy variant",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    materialVariant: "Carmine Candy"
  },
  {
    id: "gallery-pearly-variant-hdr",
    label: "Product gallery profile, Pearly Swirly variant",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    materialVariant: "Pearly Swirly"
  },
  {
    id: "gallery-graphite-variant-hdr",
    label: "Product gallery profile, Torched Graphite variant",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    materialVariant: "Torched Graphite"
  },
  {
    id: "gallery-paint-texture-off-hdr",
    label: "Gallery profile with paint base texture disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    mutation: "paint-texture-off"
  },
  {
    id: "gallery-paint-texture-on-hdr",
    label: "Gallery profile with paint base texture restored",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    mutation: "paint-texture-on"
  },
  {
    id: "gallery-sampled-specular-off-hdr",
    label: "Gallery profile with sampled HDR specular disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    environmentMutation: "sampled-specular-off"
  },
  {
    id: "gallery-sampled-environment-off-hdr",
    label: "Gallery profile with sampled HDR diffuse and specular disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    environmentMutation: "sampled-environment-off"
  },
  {
    id: "cinematic-hdr",
    label: "Cinematic stability profile, HDR environment",
    lighting: "hdr",
    profile: "cinematic",
    renderState: "product"
  },
  {
    id: "gallery-normal-off-hdr",
    label: "Gallery profile with paint normals disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    mutation: "normal-off"
  },
  {
    id: "gallery-clearcoat-off-hdr",
    label: "Gallery profile with paint clearcoat disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    mutation: "clearcoat-off"
  },
  {
    id: "gallery-extension-energy-off-hdr",
    label: "Gallery profile with material extension energy disabled",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    mutation: "extension-energy-off"
  },
  {
    id: "gallery-glass-readable-hdr",
    label: "Gallery profile with glass readability fallback",
    lighting: "hdr",
    profile: "gallery",
    renderState: "product",
    mutation: "glass-readable"
  }
];

export async function runProductConfiguratorMaterialMatrixHarness(): Promise<ProductConfiguratorMaterialMatrixReport> {
  window.__G3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ = ["start"];
  const root = document.createElement("main");
  root.id = "product-configurator-material-matrix-root";
  root.style.cssText = "display:grid;grid-template-columns:repeat(2,760px);gap:12px;background:#05070a;padding:12px;";
  document.body.replaceChildren(root);

  let environment: Awaited<ReturnType<typeof loadHdrEnvironment>> | undefined;
  try {
    environment = await loadHdrEnvironment({
      id: "product-material-matrix-studio-small-08",
      label: "Product Material Matrix Studio Small 08",
      url: `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`,
      intensity: 1.02,
      backgroundIntensity: 0.72,
      rotation: 0.18,
      toneMapping: { operator: "filmic", exposure: 0.94, whitePoint: 11.2 }
    });

    const variants: ProductConfiguratorMaterialMatrixVariant[] = [];
    for (const config of MATRIX_VARIANTS) {
      matrixProgress(`variant:${config.id}:start`);
      variants.push(await renderMatrixVariant(root, environment, config));
      matrixProgress(`variant:${config.id}:done`);
    }

  const gallery = variants.find((variant) => variant.id === "gallery-hdr");
  const routeCurrent = variants.find((variant) => variant.id === "gallery-route-current-hdr");
  const cinematic = variants.find((variant) => variant.id === "cinematic-hdr");
  const rawHdr = variants.find((variant) => variant.id === "raw-hdr");
  const sampledSpecularOff = variants.find((variant) => variant.id === "gallery-sampled-specular-off-hdr");
  const extensionEnergyOff = variants.find((variant) => variant.id === "gallery-extension-energy-off-hdr");
  const materialRichCandidate = variants.find((variant) => variant.id === "gallery-route-material-rich-hdr");
  const routeCurrentCrushesDetail = (routeCurrent?.metrics.uniqueColorBuckets ?? 999) + 16 < (gallery?.metrics.uniqueColorBuckets ?? 0)
    || (routeCurrent?.metrics.localLumaNoise ?? 999) + 1.5 < (gallery?.metrics.localLumaNoise ?? 0);
  const diagnostics = buildMatrixDiagnostics(variants);
  const routeCurrentUnexpectedNoOps = diagnostics.noOpComparisons.filter((comparison) => comparison.status === "unexpected-no-op");
  const routeCaptureAllowed = !diagnostics.routeCurrentReproducesFailure
    && routeCurrentUnexpectedNoOps.length === 0
    && diagnostics.requiredRoleCoverage.missingRoles.length === 0
    && diagnostics.riskyRenderableStateCount === 0
    && diagnostics.unclassifiedRiskyRenderableCount === 0
    && (routeCurrent?.metrics.edgeHaloRatio ?? 1) < 0.0022
    && (routeCurrent?.metrics.brightSpeckleRatio ?? 1) < 0.001;
  const ownerConclusion = {
      whiteHaloSpeckleOwner: (gallery?.metrics.edgeHaloRatio ?? 1) < (rawHdr?.metrics.edgeHaloRatio ?? 0)
        ? "packages/assets/src/CarConceptMaterialStability.ts plus GLTF render-state/HDR clamps reduce raw HDR edge halo."
        : "Raw HDR and gallery profile need further material/HDR isolation before route capture.",
      materialRichnessOwner: (Math.abs((gallery?.metrics.uniqueColorBuckets ?? 0) - (extensionEnergyOff?.metrics.uniqueColorBuckets ?? 0)) < 4)
        ? "Material extension toggles are not the missing richness source; inspect sampled HDR/base material response before route capture."
        : "Material extension energy still changes Product richness and must be bounded in CarConceptMaterialStability or ShaderLibrary.",
      nextSourceOwner: routeCurrentCrushesDetail
        ? "apps/advanced-examples-gallery/src/productConfiguratorScene.ts plus apps/advanced-examples-gallery/src/galleryRoutePolicies.ts"
        : (Math.abs((gallery?.metrics.averageLuma ?? 0) - (sampledSpecularOff?.metrics.averageLuma ?? 0)) > 1.5)
          ? "packages/rendering/src/ShaderLibrary.ts plus sampled HDR composition"
          : "packages/assets/src/CarConceptMaterialStability.ts",
      nextSourceChange: (materialRichCandidate && routeCurrent && materialRichCandidate.metrics.uniqueColorBuckets > routeCurrent.metrics.uniqueColorBuckets + 12 && materialRichCandidate.metrics.edgeHaloRatio < 0.0022)
        ? "Promote the material-rich route lighting/postprocess profile into Product route source, rerun route policy/module tests and this matrix, then qualify one Product focused capture."
        : routeCaptureAllowed
          ? "Run exactly one Product focused capture from the current Product route, inspect the PNG directly, and keep Product failed if the white outline, flat shell, or material-noise defects remain."
          : "Use renderable-bound material audit plus sampled-HDR/extension-off variants to patch the proven source owner, then rerun this matrix before any Product gallery capture.",
      routeCaptureAllowed
    } as const;

    const report: ProductConfiguratorMaterialMatrixReport = {
      schema: "g3d-product-configurator-material-matrix/v1",
      status: "ready",
      source: "tests/browser/product-configurator-material-matrix-harness.ts",
      galleryUiBypassed: true,
      asset: {
        id: "car-concept",
        url: CAR_URL
      },
      viewport: VIEWPORT,
      variants,
      diagnostics,
      ownerConclusion
    };
    window.__G3D_PRODUCT_MATERIAL_MATRIX__ = report;
    return report;
  } catch (error) {
    const report: ProductConfiguratorMaterialMatrixReport = {
      schema: "g3d-product-configurator-material-matrix/v1",
      status: "error",
      source: "tests/browser/product-configurator-material-matrix-harness.ts",
      galleryUiBypassed: true,
      asset: {
        id: "car-concept",
        url: CAR_URL
      },
      viewport: VIEWPORT,
      variants: [],
      diagnostics: emptyMatrixDiagnostics(),
      ownerConclusion: {
        whiteHaloSpeckleOwner: "unresolved",
        materialRichnessOwner: "unresolved",
        nextSourceOwner: "unresolved",
        nextSourceChange: "Fix the harness/runtime error before Product route work.",
        routeCaptureAllowed: false
      },
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__G3D_PRODUCT_MATERIAL_MATRIX__ = report;
    return report;
  } finally {
    environment?.dispose();
  }
}

async function renderMatrixVariant(
  root: HTMLElement,
  environment: Awaited<ReturnType<typeof loadHdrEnvironment>>,
  config: MatrixVariantConfig
): Promise<ProductConfiguratorMaterialMatrixVariant> {
  const canvas = document.createElement("canvas");
  canvas.id = `product-material-matrix-${config.id}`;
  canvas.width = VIEWPORT.width;
  canvas.height = VIEWPORT.height;
  canvas.style.width = `${VIEWPORT.width}px`;
  canvas.style.height = `${VIEWPORT.height}px`;
  canvas.dataset.variantId = config.id;
  root.append(canvas);

  const renderer = await G3DRenderer.create({
    canvas,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.014, 0.018, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "hdr-image-based-lighting"]
  });
  const scene = await loadGltfScene({
    url: `${location.origin}${CAR_URL}`,
    assetId: "car-concept",
    assetName: "Car Concept",
    viewport: VIEWPORT,
    ...(config.materialVariant ? { materialVariant: config.materialVariant } : {}),
    ...(config.renderState === "product" ? { materialRenderStateOverrides: carConceptMaterialRenderStateOverrides("product-configurator") } : {})
  });
  const stage = createGroundedStage(scene.resources.bounds, {
    labelPrefix: `product-material-matrix-${config.id}`,
    contactShadows: true,
    background: true,
    floorColor: [0.04, 0.044, 0.048, 1],
    backdropColor: [0.012, 0.014, 0.018, 1]
  });
  stage.update({ backgroundBlur: 0.08, backgroundVisible: true });

  try {
    applyProfileAndMutation(scene.resources.materialLibrary, config);
    const camera = createCameraFrame({
      bounds: scene.resources.bounds,
      viewport: VIEWPORT,
      preset: "product-hero",
      paddingRatio: 0.12
    });
    const activeEnvironmentLighting = config.lighting === "hdr"
      ? environmentLightingForVariant(environment.lighting.lighting, config)
      : undefined;
    const carRenderItems = clonedRenderableRenderItems(scene, config);
    const stageRenderItems = stage.renderItems({ shadows: false, backgroundVisible: true });
    const proofScene = explicitRenderItemScene(scene);
    const proof = renderer.captureProof({
      scene: proofScene,
      ...(config.lighting === "hdr" ? { environment, environmentLighting: activeEnvironmentLighting } : {}),
      renderItems: [...carRenderItems, ...stageRenderItems],
      collectedLights: collectedLightsForVariant(config),
      camera: camera.camera,
      viewport: VIEWPORT,
      shadow: false,
      postprocess: postprocessForVariant(config)
    }).proof;
    const metrics = analyzeMatrixPixels(canvas);
    const renderableMaterials = summarizeRenderableMaterials(
      scene.resources.renderableBindings,
      scene.resources.materialLibrary,
      config
    );
    return {
      id: config.id,
      label: config.label,
      lighting: config.lighting,
      profile: config.profile,
      renderState: config.renderState,
      materialVariant: config.materialVariant ?? "default",
      mutation: config.mutation ?? "none",
      environmentMutation: config.environmentMutation ?? "none",
      routeLighting: config.routeLighting ?? "matrix-studio",
      postprocess: config.postprocess ?? "none",
      captureReady: proof.realWebGL2 && !proof.mockDevice && !proof.canvas2dProof && proof.diagnostics.drawCalls > 0 && proof.diagnostics.lastError === null,
      drawCalls: proof.diagnostics.drawCalls ?? 0,
      lastError: proof.diagnostics.lastError,
      runtimeMaterials: summarizeMatrixMaterials(scene.resources.materialLibrary),
      renderableMaterials,
      roleDiagnostics: summarizeRoleDiagnostics(renderableMaterials),
      metrics,
      pngDataUrl: canvas.toDataURL("image/png")
    };
  } finally {
    stage.dispose();
    scene.dispose();
    renderer.dispose();
  }
}

function explicitRenderItemScene(
  scene: Awaited<ReturnType<typeof loadGltfScene>>
): Parameters<G3DRenderer["captureProof"]>[0]["scene"] {
  return {
    metadata: scene.metadata,
    createRendererInput(options) {
      return {
        source: {
          renderItems: options.renderItems ?? [],
          ...(options.environmentLighting !== undefined ? { environmentLighting: options.environmentLighting } : {}),
          ...(options.collectedLights ? { collectedLights: options.collectedLights } : {}),
          ...(options.shadow !== undefined ? { shadow: options.shadow } : {}),
          ...(options.postprocess !== undefined ? { postprocess: options.postprocess } : {}),
          cameraPolicy: "require",
          cameraFrameBounds: scene.resources.bounds
        },
        camera: {
          viewProjectionMatrix: scene.resources.createCameraFrame(options.viewport).viewProjectionMatrix,
          viewMatrix: scene.resources.createCameraFrame(options.viewport).viewMatrix,
          projectionMatrix: scene.resources.createCameraFrame(options.viewport).projectionMatrix
        },
        bounds: scene.resources.bounds
      };
    }
  } as Parameters<G3DRenderer["captureProof"]>[0]["scene"];
}

function clonedRenderableRenderItems(
  scene: Awaited<ReturnType<typeof loadGltfScene>>,
  config: MatrixVariantConfig
): readonly RenderItem[] {
  const items: RenderItem[] = [];
  scene.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of scene.resources.scene.collectRenderables()) {
    const geometry = scene.resources.geometryLibrary.get(renderable.geometry);
    const sourceMaterial = scene.resources.materialLibrary.get(renderable.material);
    if (!geometry || !sourceMaterial) continue;
    const sourceMaterialName = sourceMaterialNameForRenderable(
      scene.resources.renderableBindings,
      node.name,
      renderable.geometry,
      renderable.material
    ) ?? sourceMaterial.name ?? renderable.material;
    const binding = {
      nodeName: node.name,
      geometryKey: renderable.geometry,
      materialKey: renderable.material,
      sourceMaterialName
    };
    const visualRole = carConceptMaterialVisualRole({
      materialKey: binding.materialKey,
      sourceMaterialName: binding.sourceMaterialName,
      nodeName: binding.nodeName
    });
    const material = materialForRenderableSample(sourceMaterial, binding, visualRole, config);
    const morphTargets = scene.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: node.name,
      geometry,
      material,
      modelMatrix: node.transform.worldMatrix,
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function sourceMaterialNameForRenderable(
  bindings: readonly ProductRenderableMaterialBinding[],
  nodeName: string,
  geometryKey: string,
  materialKey: string
): string | undefined {
  return bindings.find((binding) => binding.nodeName === nodeName
    && binding.geometryKey === geometryKey
    && binding.materialKey === materialKey)?.sourceMaterialName;
}

function applyProfileAndMutation(
  materialLibrary: ReadonlyMap<string, Material>,
  config: MatrixVariantConfig
): void {
  for (const [key, material] of materialLibrary) {
    if (config.profile !== "none") {
      applyCarConceptMaterialStability(material, { materialKey: key, profile: config.profile });
    }
    const name = `${key} ${material.name}`;
    applyMatrixMutation(material, name, config);
  }
}

function applyMatrixMutation(
  material: Material,
  name: string,
  config: MatrixVariantConfig
): void {
    if (config.mutation === "normal-off" && /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name)) {
      material.setParameter("u_normalTextureEnabled", 0);
      material.setParameter("u_normalScale", 0);
    }
    if (config.mutation === "paint-texture-off" && /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name)) {
      material.setParameter("u_baseColorTextureEnabled", 0);
    }
    if (config.mutation === "paint-texture-on" && /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name)) {
      material.setParameter("u_baseColorTextureEnabled", 1);
    }
    if (config.mutation === "clearcoat-off" && /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name)) {
      material.setParameter("u_clearcoatFactor", 0);
      material.setParameter("u_clearcoatRoughnessFactor", 1);
    }
    if (config.mutation === "extension-energy-off") {
      material.setParameter("u_specularTextureEnabled", 0);
      material.setParameter("u_specularColorTextureEnabled", 0);
      material.setParameter("u_specularFactor", 0);
      material.setParameter("u_clearcoatTextureEnabled", 0);
      material.setParameter("u_clearcoatRoughnessTextureEnabled", 0);
      material.setParameter("u_clearcoatNormalTextureEnabled", 0);
      material.setParameter("u_clearcoatFactor", 0);
      material.setParameter("u_clearcoatRoughnessFactor", 1);
      material.setParameter("u_transmissionTextureEnabled", 0);
      material.setParameter("u_transmissionFactor", 0);
      material.setParameter("u_diffuseTransmissionFactor", 0);
      material.setParameter("u_iridescenceTextureEnabled", 0);
      material.setParameter("u_iridescenceThicknessTextureEnabled", 0);
      material.setParameter("u_iridescenceFactor", 0);
      material.setParameter("u_materialEnvironmentSpecularScale", 0);
    }
    if (config.mutation === "glass-readable" && /Glass|Window|Windshield/i.test(name)) {
      material.setParameter("u_baseColor", [0.018, 0.03, 0.04, 1]);
      material.setParameter("u_roughness", 0.36);
      material.setParameter("u_specularFactor", 0.045);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.014);
    }
}

function isCarConceptRiskMaterial(name: string): boolean {
  return CAR_CONCEPT_RISK_MATERIAL_PATTERN.test(name);
}

function environmentLightingForVariant(
  lighting: Awaited<ReturnType<typeof loadHdrEnvironment>>["lighting"]["lighting"],
  config: MatrixVariantConfig
): Awaited<ReturnType<typeof loadHdrEnvironment>>["lighting"]["lighting"] {
  let next = lighting;
  if (config.routeLighting === "product-route-current") {
    next = {
      ...lighting
    };
  }
  if (config.routeLighting === "product-route-balanced" || config.routeLighting === "product-route-direct-detail") {
    next = {
      ...lighting,
      environmentMapIntensity: 0.14,
      environmentMapSpecularIntensity: 0.006
    };
  }
  if (config.routeLighting === "product-route-material-rich") {
    next = {
      ...lighting,
      environmentMapIntensity: 0.18,
      environmentMapSpecularIntensity: 0.006
    };
  }
  const mutation = config.environmentMutation;
  if (mutation === "sampled-specular-off") {
    return {
      ...next,
      environmentMapSpecularIntensity: 0
    };
  }
  if (mutation === "sampled-environment-off") {
    return {
      ...next,
      environmentMapIntensity: 0,
      environmentMapSpecularIntensity: 0
    };
  }
  return next;
}

function collectedLightsForVariant(config: MatrixVariantConfig): readonly CollectedLight[] {
  const routeLighting = config.routeLighting;
  if (routeLighting === "product-route-current") {
    return createProductConfiguratorShowroomLighting("studio").collectedLights;
  }
  if (routeLighting === "product-route-balanced" || routeLighting === "product-route-direct-detail" || routeLighting === "product-route-material-rich") {
    const lighting = createLightingRig({
      preset: "product-shot",
      intensityScale: 1.54,
      shadows: false
    });
    return lighting.collectedLights.map((light) => adjustRouteLight(light, routeLighting));
  }
  return createStudioLighting({ preset: "product", shadows: false, intensityScale: 1 });
}

function adjustRouteLight(light: CollectedLight, mode: MatrixRouteLighting): CollectedLight {
  const sourceName = light.source.name;
  if (mode === "product-route-current") {
    if (/cool-edge|rim/i.test(sourceName)) return adjustLight(light, [0.72, 0.68, 0.6], 0.82);
    if (/warm-edge/i.test(sourceName)) return adjustLight(light, [1, 0.62, 0.42], 0.48);
    if (/key/i.test(sourceName)) return adjustLight(light, [1, 0.95, 0.86], 1.12);
    if (/fill/i.test(sourceName)) return adjustLight(light, [0.55, 0.62, 0.72], 1.05);
    return light;
  }
  if (mode === "product-route-direct-detail") {
    if (/cool-edge|rim/i.test(sourceName)) return adjustLight(light, [0.48, 0.5, 0.48], 0.42);
    if (/warm-edge/i.test(sourceName)) return adjustLight(light, [0.9, 0.45, 0.32], 0.35);
    if (/key/i.test(sourceName)) return adjustLight(light, [1, 0.86, 0.74], 1.38);
    if (/fill/i.test(sourceName)) return adjustLight(light, [0.42, 0.5, 0.62], 0.82);
    return light;
  }
  if (mode === "product-route-material-rich") {
    if (/cool-edge|rim/i.test(sourceName)) return adjustLight(light, [0.54, 0.56, 0.52], 0.34);
    if (/warm-edge/i.test(sourceName)) return adjustLight(light, [1, 0.56, 0.34], 0.52);
    if (/key/i.test(sourceName)) return adjustLight(light, [1, 0.9, 0.78], 1.46);
    if (/fill/i.test(sourceName)) return adjustLight(light, [0.52, 0.58, 0.66], 0.62);
    return light;
  }
  if (/cool-edge|rim/i.test(sourceName)) return adjustLight(light, [0.42, 0.46, 0.48], 0.3);
  if (/warm-edge/i.test(sourceName)) return adjustLight(light, [1, 0.62, 0.42], 0.54);
  if (/key/i.test(sourceName)) return adjustLight(light, [1, 0.9, 0.8], 1.08);
  if (/fill/i.test(sourceName)) return adjustLight(light, [0.52, 0.5, 0.48], 0.78);
  return light;
}

function adjustLight(
  light: CollectedLight,
  color: readonly [number, number, number],
  intensityScale: number
): CollectedLight {
  return {
    ...light,
    color,
    intensity: Math.round(light.intensity * intensityScale * 1000) / 1000
  };
}

function postprocessForVariant(config: MatrixVariantConfig) {
  if (config.postprocess === "product-route-current") {
    return false;
  }
  if (config.postprocess === "product-route-fxaa-only") {
    return {
      bloom: false,
      fxaa: { edgeThreshold: 0.16, subpixelBlend: 0.16 }
    };
  }
  if (config.postprocess === "product-route-tone-only") {
    return {
      toneMapping: { operator: "filmic" as const, exposure: 1.18, whitePoint: 1.24, gamma: 2.2 },
      bloom: false,
      colorGrade: false,
      fxaa: false
    };
  }
  if (config.postprocess === "product-route-soft-tone-only") {
    return {
      toneMapping: { operator: "filmic" as const, exposure: 1.08, whitePoint: 2.2, gamma: 2.2 },
      bloom: false,
      colorGrade: false,
      fxaa: false
    };
  }
  if (config.postprocess === "product-route-no-tone-soft-fxaa") {
    return {
      toneMapping: false,
      bloom: false,
      colorGrade: false,
      fxaa: { edgeThreshold: 0.32, subpixelBlend: 0.04 }
    };
  }
  if (config.postprocess === "product-route-tone-fxaa") {
    return {
      toneMapping: { operator: "filmic" as const, exposure: 1.18, whitePoint: 1.24, gamma: 2.2 },
      bloom: false,
      colorGrade: false,
      fxaa: { edgeThreshold: 0.16, subpixelBlend: 0.16 }
    };
  }
  if (config.postprocess === "product-route-balanced") {
    return {
      toneMapping: { operator: "filmic" as const, exposure: 1.22, whitePoint: 1.42, gamma: 2.2 },
      bloom: false,
      colorGrade: { contrast: 1.08, saturation: 1.1, vibrance: 0.06, sharpening: 0.08 },
      fxaa: { edgeThreshold: 0.12, subpixelBlend: 0.22 }
    };
  }
  if (config.postprocess === "product-route-material-rich") {
    return {
      toneMapping: { operator: "filmic" as const, exposure: 1.04, whitePoint: 1.72, gamma: 2.2 },
      bloom: false,
      colorGrade: { contrast: 1.08, saturation: 1.08, vibrance: 0.04, sharpening: 0.06 },
      fxaa: { edgeThreshold: 0.22, subpixelBlend: 0.08 }
    };
  }
  return false;
}

function summarizeMatrixMaterials(materialLibrary: ReadonlyMap<string, Material>): ProductMaterialRuntimeSample[] {
  return [...materialLibrary.entries()]
    .filter(([key, material]) => isCarConceptRiskMaterial(`${key} ${material.name}`))
    .map(([key, material]) => summarizeMaterial(key, material));
}

function summarizeRenderableMaterials(
  bindings: readonly ProductRenderableMaterialBinding[],
  materialLibrary: ReadonlyMap<string, Material>,
  config: MatrixVariantConfig
): ProductRenderableMaterialRuntimeSample[] {
  const samples: ProductRenderableMaterialRuntimeSample[] = [];
  for (const binding of bindings) {
    const sourceMaterial = materialLibrary.get(binding.materialKey);
    if (!sourceMaterial) continue;
    const visualRole = carConceptMaterialVisualRole({
      materialKey: binding.materialKey,
      sourceMaterialName: binding.sourceMaterialName,
      nodeName: binding.nodeName
    });
    const material = materialForRenderableSample(sourceMaterial, binding, visualRole, config);
    const summary = summarizeMaterial(binding.materialKey, material);
    const renderStateRisk = summary.renderState.blend || !summary.renderState.depthWrite || summary.renderState.cullMode !== "back";
    const textureEscape = hasRiskTextureEscape(summary);
    samples.push({
      ...summary,
      nodeName: binding.nodeName,
      geometryKey: binding.geometryKey,
      materialKey: binding.materialKey,
      sourceMaterialName: binding.sourceMaterialName,
      visualRole,
      drawItems: 1,
      nodes: [binding.nodeName],
      sourceMaterials: [binding.sourceMaterialName],
      renderStateRisk,
      textureEscape
    });
  }
  return samples.sort((left, right) => `${left.visualRole}:${left.materialKey}:${left.nodeName}:${left.geometryKey}`.localeCompare(`${right.visualRole}:${right.materialKey}:${right.nodeName}:${right.geometryKey}`));
}

function summarizeRoleDiagnostics(
  materials: readonly ProductRenderableMaterialRuntimeSample[]
): readonly ProductMaterialRoleDiagnostic[] {
  const grouped = new Map<string, {
    drawItems: number;
    readonly materialKeys: Set<string>;
    readonly sourceMaterials: Set<string>;
    readonly representativeNodes: Set<string>;
    renderStateRiskCount: number;
    textureEscapeCount: number;
    environmentSpecularScaleTotal: number;
    environmentSpecularScaleCount: number;
    specularFactorTotal: number;
    specularFactorCount: number;
    clearcoatFactorTotal: number;
    clearcoatFactorCount: number;
  }>();
  for (const material of materials) {
    const group = grouped.get(material.visualRole) ?? {
      drawItems: 0,
      materialKeys: new Set<string>(),
      sourceMaterials: new Set<string>(),
      representativeNodes: new Set<string>(),
      renderStateRiskCount: 0,
      textureEscapeCount: 0,
      environmentSpecularScaleTotal: 0,
      environmentSpecularScaleCount: 0,
      specularFactorTotal: 0,
      specularFactorCount: 0,
      clearcoatFactorTotal: 0,
      clearcoatFactorCount: 0
    };
    group.drawItems += material.drawItems;
    group.materialKeys.add(material.key);
    for (const source of material.sourceMaterials) group.sourceMaterials.add(source);
    for (const node of material.nodes.slice(0, 8)) group.representativeNodes.add(node);
    if (material.renderState.blend || !material.renderState.depthWrite || material.renderState.cullMode !== "back") {
      group.renderStateRiskCount += material.drawItems;
    }
    if (material.textureEscape) {
      group.textureEscapeCount += material.drawItems;
    }
    if (material.uniforms.materialEnvironmentSpecularScale !== undefined) {
      group.environmentSpecularScaleTotal += material.uniforms.materialEnvironmentSpecularScale;
      group.environmentSpecularScaleCount += 1;
    }
    if (material.uniforms.specularFactor !== undefined) {
      group.specularFactorTotal += material.uniforms.specularFactor;
      group.specularFactorCount += 1;
    }
    if (material.uniforms.clearcoatFactor !== undefined) {
      group.clearcoatFactorTotal += material.uniforms.clearcoatFactor;
      group.clearcoatFactorCount += 1;
    }
    grouped.set(material.visualRole, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([visualRole, group]) => ({
      visualRole,
      drawItems: group.drawItems,
      materialKeys: [...group.materialKeys].sort(),
      sourceMaterials: [...group.sourceMaterials].sort(),
      representativeNodes: [...group.representativeNodes].sort().slice(0, 12),
      renderStateRiskCount: group.renderStateRiskCount,
      textureEscapeCount: group.textureEscapeCount,
      averageEnvironmentSpecularScale: averageOrNull(group.environmentSpecularScaleTotal, group.environmentSpecularScaleCount),
      averageSpecularFactor: averageOrNull(group.specularFactorTotal, group.specularFactorCount),
      averageClearcoatFactor: averageOrNull(group.clearcoatFactorTotal, group.clearcoatFactorCount)
    }));
}

function buildMatrixDiagnostics(
  variants: readonly ProductConfiguratorMaterialMatrixVariant[]
): ProductConfiguratorMaterialMatrixDiagnostics {
  const gallery = requiredVariant(variants, "gallery-hdr");
  const routeCurrent = requiredVariant(variants, "gallery-route-current-hdr");
  const presentRoles = [...new Set(gallery.renderableMaterials.map((material) => material.visualRole))].sort();
  const expectedRoles = [
    "body-primary-paint",
    "body-secondary-paint",
    "brake",
    "dark-trim",
    "glass",
    "interior",
    "roof-panel",
    "tire",
    "wheel-metal"
  ];
  const uniqueColorBucketLoss = gallery.metrics.uniqueColorBuckets - routeCurrent.metrics.uniqueColorBuckets;
  const localLumaNoiseLoss = round6(gallery.metrics.localLumaNoise - routeCurrent.metrics.localLumaNoise);
  const routeCurrentHasMaterialEvidence = routeCurrent.metrics.uniqueColorBuckets >= 220
    && routeCurrent.metrics.localLumaNoise >= 18
    && routeCurrent.metrics.edgeHaloRatio < 0.0022
    && routeCurrent.metrics.brightSpeckleRatio < 0.001;
  const noOpComparisons = [
    compareVariants(variants, "direct-detail-no-postprocess", "gallery-route-direct-detail-no-postprocess-hdr", "gallery-route-current-no-postprocess-hdr", true),
    compareVariants(variants, "direct-detail-tone-fxaa", "gallery-route-direct-detail-tone-fxaa-hdr", "gallery-route-tone-fxaa-hdr", true),
    compareVariants(variants, "sampled-specular-off-gallery", "gallery-sampled-specular-off-hdr", "gallery-hdr", true),
    compareVariants(variants, "sampled-environment-off-gallery", "gallery-sampled-environment-off-hdr", "gallery-hdr", true),
    compareVariants(variants, "extension-energy-off-gallery", "gallery-extension-energy-off-hdr", "gallery-hdr", true),
    compareVariants(variants, "normal-off-gallery", "gallery-normal-off-hdr", "gallery-hdr", false),
    compareVariants(variants, "clearcoat-off-gallery", "gallery-clearcoat-off-hdr", "gallery-hdr", false)
  ];
  return {
    routeCurrentReproducesFailure: !routeCurrentHasMaterialEvidence && (uniqueColorBucketLoss > 16 || localLumaNoiseLoss > 1.5),
    routeCurrentDetailLoss: {
      uniqueColorBucketLoss,
      localLumaNoiseLoss,
      edgeHaloDelta: round6(routeCurrent.metrics.edgeHaloRatio - gallery.metrics.edgeHaloRatio)
    },
    noOpComparisons,
    requiredRoleCoverage: {
      expectedRoles,
      presentRoles,
      missingRoles: expectedRoles.filter((role) => !presentRoles.includes(role))
    },
    riskyRenderableStateCount: gallery.renderableMaterials.reduce(
      (count, material) => count + (material.renderStateRisk ? material.drawItems : 0),
      0
    ),
    unclassifiedRiskMaterialCount: gallery.renderableMaterials.reduce(
      (count, material) => count + (material.visualRole === "unclassified" ? material.drawItems : 0),
      0
    ),
    unclassifiedRiskyRenderableCount: gallery.renderableMaterials.reduce(
      (count, material) => count + (material.visualRole === "unclassified" && (material.renderStateRisk || material.textureEscape) ? material.drawItems : 0),
      0
    )
  };
}

function hasRiskTextureEscape(material: ProductMaterialRuntimeSample): boolean {
  return (material.uniforms.specularTextureEnabled ?? 0) > 0
    || (material.uniforms.specularColorTextureEnabled ?? 0) > 0
    || (material.uniforms.transmissionTextureEnabled ?? 0) > 0
    || (material.uniforms.iridescenceTextureEnabled ?? 0) > 0
    || (material.uniforms.clearcoatTextureEnabled ?? 0) > 0
    || (material.uniforms.clearcoatNormalTextureEnabled ?? 0) > 0;
}

function compareVariants(
  variants: readonly ProductConfiguratorMaterialMatrixVariant[],
  id: string,
  leftVariant: string,
  rightVariant: string,
  expectedToDiffer: boolean
): ProductMaterialMatrixNoOpComparison {
  const left = requiredVariant(variants, leftVariant);
  const right = requiredVariant(variants, rightVariant);
  const metricDelta = {
    uniqueColorBuckets: Math.abs(left.metrics.uniqueColorBuckets - right.metrics.uniqueColorBuckets),
    localLumaNoise: round6(Math.abs(left.metrics.localLumaNoise - right.metrics.localLumaNoise)),
    edgeHaloRatio: round6(Math.abs(left.metrics.edgeHaloRatio - right.metrics.edgeHaloRatio)),
    averageLuma: round6(Math.abs(left.metrics.averageLuma - right.metrics.averageLuma))
  };
  const pixelsDiffer = left.pngDataUrl !== right.pngDataUrl
    || metricDelta.uniqueColorBuckets > 0
    || metricDelta.localLumaNoise > 0.000001
    || metricDelta.edgeHaloRatio > 0.000001
    || metricDelta.averageLuma > 0.000001;
  return {
    id,
    leftVariant,
    rightVariant,
    expectedToDiffer,
    pixelsDiffer,
    metricDelta,
    status: pixelsDiffer
      ? "changed"
      : expectedToDiffer
        ? "unexpected-no-op"
        : "expected-no-op"
  };
}

function requiredVariant(
  variants: readonly ProductConfiguratorMaterialMatrixVariant[],
  id: string
): ProductConfiguratorMaterialMatrixVariant {
  const variant = variants.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Missing material matrix variant: ${id}`);
  return variant;
}

function materialForRenderableSample(
  source: Material,
  binding: ProductRenderableMaterialBinding,
  visualRole: string,
  config: MatrixVariantConfig
): Material {
  const material = cloneMaterialForSample(
    source,
    `${source.name}:${binding.nodeName}`,
    renderStateForRenderableSample(source.renderState, visualRole, config)
  );
  if (config.profile !== "none") {
    applyCarConceptMaterialStability(material, {
      materialKey: binding.materialKey,
      sourceMaterialName: binding.sourceMaterialName,
      nodeName: binding.nodeName,
      profile: config.profile
    });
  }
  applyMatrixMutation(material, `${binding.materialKey} ${binding.sourceMaterialName} ${material.name}`, config);
  return material;
}

function cloneMaterialForSample(source: Material, name: string, renderState: RenderState): Material {
  const parameters: Record<string, UniformValue> = {};
  for (const [key, value] of source.getParameters()) {
    parameters[key] = value;
  }
  return new Material({
    name,
    shaderKey: source.shaderKey,
    ...(source.shaderVariant ? { shaderVariant: source.shaderVariant } : {}),
    renderState,
    parameters,
    requiredAttributes: source.requiredAttributes,
    requiredUniforms: source.requiredUniforms,
    uniformSchema: source.uniformSchema
  });
}

function renderStateForRenderableSample(
  source: RenderState,
  visualRole: string,
  config: MatrixVariantConfig
): RenderState {
  if (config.renderState !== "product" || visualRole === "unclassified") return source;
  return {
    ...source,
    cullMode: "back",
    blend: false,
    depthWrite: true
  };
}

function summarizeMaterial(key: string, material: Material): ProductMaterialRuntimeSample {
  return {
    key,
    name: material.name,
    renderState: {
      blend: material.renderState.blend,
      depthWrite: material.renderState.depthWrite,
      cullMode: material.renderState.cullMode
    },
    uniforms: {
      baseColor: rgbaUniform(material.getParameter("u_baseColor")),
      baseColorTextureEnabled: numberUniform(material.getParameter("u_baseColorTextureEnabled")),
      normalTextureEnabled: numberUniform(material.getParameter("u_normalTextureEnabled")),
      normalScale: numberUniform(material.getParameter("u_normalScale")),
      metallic: numberUniform(material.getParameter("u_metallic")),
      metallicRoughnessTextureEnabled: numberUniform(material.getParameter("u_metallicRoughnessTextureEnabled")),
      occlusionTextureEnabled: numberUniform(material.getParameter("u_occlusionTextureEnabled")),
      occlusionStrength: numberUniform(material.getParameter("u_occlusionStrength")),
      roughness: numberUniform(material.getParameter("u_roughness")),
      specularFactor: numberUniform(material.getParameter("u_specularFactor")),
      specularTextureEnabled: numberUniform(material.getParameter("u_specularTextureEnabled")),
      specularColorTextureEnabled: numberUniform(material.getParameter("u_specularColorTextureEnabled")),
      clearcoatFactor: numberUniform(material.getParameter("u_clearcoatFactor")),
      clearcoatTextureEnabled: numberUniform(material.getParameter("u_clearcoatTextureEnabled")),
      clearcoatRoughnessFactor: numberUniform(material.getParameter("u_clearcoatRoughnessFactor")),
      clearcoatNormalTextureEnabled: numberUniform(material.getParameter("u_clearcoatNormalTextureEnabled")),
      iridescenceFactor: numberUniform(material.getParameter("u_iridescenceFactor")),
      iridescenceTextureEnabled: numberUniform(material.getParameter("u_iridescenceTextureEnabled")),
      transmissionFactor: numberUniform(material.getParameter("u_transmissionFactor")),
      transmissionTextureEnabled: numberUniform(material.getParameter("u_transmissionTextureEnabled")),
      materialEnvironmentSpecularScale: numberUniform(material.getParameter("u_materialEnvironmentSpecularScale"))
    }
  };
}

function analyzeMatrixPixels(canvas: HTMLCanvasElement): ProductMaterialMatrixPixelStats {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) return emptyStats();
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  let maxLuma = 0;
  let redPaintPixels = 0;
  let redDominanceTotal = 0;
  let brightSpeckles = 0;
  let edgeHaloPixels = 0;
  let grayWhitePixels = 0;
  let washedGrayWhitePixels = 0;
  const buckets = new Set<number>();
  const lumaAt = (x: number, y: number): number => {
    const index = (y * width + x) * 4;
    return 0.2126 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.0722 * (pixels[index + 2] ?? 0);
  };

  for (let y = 1; y + 1 < height; y += 1) {
    for (let x = 1; x + 1 < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const redDominance = red - Math.max(green, blue);
      if (red + green + blue > 12) nonBlackPixels += 1;
      lumaTotal += luma;
      lumaSquaredTotal += luma * luma;
      maxLuma = Math.max(maxLuma, luma);
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      if (red > 36 && redDominance > 16) {
        redPaintPixels += 1;
        redDominanceTotal += redDominance;
      }
      if (luma > 138 && isIsolatedHighlight(luma, x, y, lumaAt)) brightSpeckles += 1;
      if (luma > 128 && chroma < 34 && touchesDarkNeighbor(x, y, lumaAt)) edgeHaloPixels += 1;
      if (luma > 92 && chroma < 28) grayWhitePixels += 1;
      if (luma > 132 && chroma < 22) washedGrayWhitePixels += 1;
    }
  }

  const samplePixels = Math.max(1, (width - 2) * (height - 2));
  const averageLuma = lumaTotal / samplePixels;
  const variance = Math.max(0, lumaSquaredTotal / samplePixels - averageLuma * averageLuma);
  return {
    nonBlackPixels,
    averageLuma: round6(averageLuma),
    maxLuma: round6(maxLuma),
    uniqueColorBuckets: buckets.size,
    redPaintCoverage: round6(redPaintPixels / samplePixels),
    meanRedDominance: round6(redPaintPixels > 0 ? redDominanceTotal / redPaintPixels : 0),
    brightSpeckleRatio: round6(brightSpeckles / Math.max(1, nonBlackPixels)),
    edgeHaloRatio: round6(edgeHaloPixels / Math.max(1, nonBlackPixels)),
    grayWhiteCoverage: round6(grayWhitePixels / samplePixels),
    washedGrayWhiteRatio: round6(washedGrayWhitePixels / Math.max(1, nonBlackPixels)),
    localLumaNoise: round6(Math.sqrt(variance))
  };
}

function isIsolatedHighlight(luma: number, x: number, y: number, lumaAt: (x: number, y: number) => number): boolean {
  let brightNeighbors = 0;
  let neighborTotal = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighborLuma = lumaAt(x + dx, y + dy);
      neighborTotal += neighborLuma;
      if (neighborLuma > 130) brightNeighbors += 1;
    }
  }
  return brightNeighbors <= 1 && luma - neighborTotal / 8 > 42;
}

function touchesDarkNeighbor(x: number, y: number, lumaAt: (x: number, y: number) => number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (lumaAt(x + dx, y + dy) < 32) return true;
    }
  }
  return false;
}

function numberUniform(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rgbaUniform(value: unknown): readonly [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  return value as unknown as readonly [number, number, number, number];
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function averageOrNull(total: number, count: number): number | null {
  return count > 0 ? round6(total / count) : null;
}

function emptyMatrixDiagnostics(): ProductConfiguratorMaterialMatrixDiagnostics {
  return {
    routeCurrentReproducesFailure: false,
    routeCurrentDetailLoss: {
      uniqueColorBucketLoss: 0,
      localLumaNoiseLoss: 0,
      edgeHaloDelta: 0
    },
    noOpComparisons: [],
    requiredRoleCoverage: {
      expectedRoles: [],
      presentRoles: [],
      missingRoles: []
    },
    riskyRenderableStateCount: 0,
    unclassifiedRiskMaterialCount: 0,
    unclassifiedRiskyRenderableCount: 0
  };
}

function emptyStats(): ProductMaterialMatrixPixelStats {
  return {
    nonBlackPixels: 0,
    averageLuma: 0,
    maxLuma: 0,
    uniqueColorBuckets: 0,
    redPaintCoverage: 0,
    meanRedDominance: 0,
    brightSpeckleRatio: 1,
    edgeHaloRatio: 1,
    grayWhiteCoverage: 1,
    washedGrayWhiteRatio: 1,
    localLumaNoise: 0
  };
}

function matrixProgress(step: string): void {
  window.__G3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ = [...(window.__G3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ ?? []), step].slice(-64);
}

window.runProductConfiguratorMaterialMatrixHarness = runProductConfiguratorMaterialMatrixHarness;
