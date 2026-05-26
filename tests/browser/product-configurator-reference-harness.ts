import {
  A3DRenderer,
  createCameraFrame,
  createGroundedStage,
  createStudioLighting,
  loadGltfScene,
  loadHdrEnvironment
} from "/packages/engine/src/production-runtime/index.js";
import { createGLTFRenderResourceDiagnostics } from "/packages/assets/src/browser-index.js";

declare global {
  interface Window {
    __A3D_PRODUCT_REFERENCE__?: ProductConfiguratorReferenceReport;
    __A3D_PRODUCT_REFERENCE_PROGRESS__?: readonly string[];
    runProductConfiguratorReferenceHarness?: typeof runProductConfiguratorReferenceHarness;
  }
}

type ProductReferenceStatus = "ready" | "error";

export interface ProductConfiguratorReferenceReport {
  readonly schema: "a3d-product-configurator-reference-harness/v1";
  readonly status: ProductReferenceStatus;
  readonly claim: "same-original-product-glb-reference-outside-advanced-gallery";
  readonly source: "tests/browser/product-configurator-reference-harness.ts";
  readonly galleryUiBypassed: true;
  readonly dpr: {
    readonly windowDevicePixelRatio: number;
    readonly canvasBackingScale: 1;
    readonly viewportCssPixels: { readonly width: number; readonly height: number };
  };
  readonly renderer: {
    readonly backend: "webgl2" | "webgpu";
    readonly realWebGL2?: boolean;
    readonly mockDevice?: boolean;
    readonly canvas2dProof?: boolean;
    readonly fixedLighting: "studio-small-08-hdr-plus-product-directional";
    readonly fixedCameraPreset: "product-hero";
    readonly toneMapping: {
      readonly operator: "filmic";
      readonly exposure: number;
      readonly whitePoint: number;
    };
  };
  readonly assets: readonly ProductReferenceAssetReport[];
  readonly summary: {
    readonly originalAssetIds: readonly string[];
    readonly allOriginalAssetUrlsLoaded: boolean;
    readonly allAssetsRendered: boolean;
    readonly allAssetsTextureBacked: boolean;
    readonly allAssetsMaterialBacked: boolean;
    readonly allAssetsReadyForCapture: boolean;
    readonly totalMaterials: number;
    readonly totalTextures: number;
    readonly totalDrawCalls: number;
    readonly totalNonBlackPixels: number;
    readonly unsupportedExtensions: readonly string[];
    readonly materialVariants: readonly ProductReferenceMaterialVariantSummary[];
  };
  readonly error?: string;
}

interface ProductReferenceAssetReport {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly sourceOfTruth: "advanced-gallery-original-product-asset";
  readonly loaded: boolean;
  readonly rendered: boolean;
  readonly captureReady: boolean;
  readonly materialBacked: boolean;
  readonly textureBacked: boolean;
  readonly diagnostics: {
    readonly meshCount: number;
    readonly primitiveCount: number;
    readonly vertexCount: number;
    readonly indexCount: number;
    readonly materialCount: number;
    readonly textureCount: number;
    readonly imageCount: number;
    readonly animationCount: number;
    readonly drawCalls: number;
    readonly liveTextures: number;
    readonly textureBytes: number;
    readonly lastError: string | null;
  };
  readonly pixels: {
    readonly width: number;
    readonly height: number;
    readonly nonBlackPixels: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
    readonly uniqueColorBuckets: number;
  };
  readonly extensions: {
    readonly used: readonly string[];
    readonly required: readonly string[];
    readonly unsupported: readonly string[];
  };
  readonly materialVariants: readonly string[];
  readonly materials: readonly ProductReferenceMaterialReport[];
  readonly runtimeMaterials: readonly ProductReferenceRuntimeMaterialReport[];
  readonly materialAcceptance: readonly ProductReferenceMaterialAcceptanceReport[];
  readonly carRegionAcceptance: readonly ProductReferenceCarRegionAcceptanceReport[];
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly renderResources: {
    readonly drawItems: number;
    readonly texturedDrawItems: number;
    readonly baseColorTextureDrawItems: number;
    readonly colorBearingTextureDrawItems: number;
    readonly surfaceDetailTextureDrawItems: number;
    readonly effectiveTextureBackedDrawItems: number;
    readonly unsupportedTexCoordDrawItems: number;
    readonly generatedTangentUvMismatchDrawItems: number;
    readonly fallbackWhiteDrawItems: number;
    readonly fallbackWhiteLabels: readonly string[];
    readonly fallbackWhiteMaterialNames: readonly string[];
    readonly missingGeometryDrawItems: number;
    readonly missingMaterialDrawItems: number;
    readonly materialFidelityDiagnostics: readonly unknown[];
  };
  readonly camera: unknown;
}

interface ProductReferenceMaterialReport {
  readonly name: string;
  readonly alphaMode: string;
  readonly unlit: boolean;
  readonly doubleSided: boolean;
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly textureSlots: readonly string[];
  readonly extensionFlags: readonly string[];
}

interface ProductReferenceRuntimeMaterialReport {
  readonly key: string;
  readonly name: string;
  readonly renderState: {
    readonly blend: boolean;
    readonly depthWrite: boolean;
    readonly cullMode: string;
  };
  readonly uniforms: {
    readonly metallic?: number;
    readonly roughness?: number;
    readonly normalScale?: number;
    readonly clearcoatFactor?: number;
    readonly clearcoatRoughnessFactor?: number;
    readonly transmissionFactor?: number;
    readonly transmissionFallbackEnergy?: number;
    readonly specularFactor?: number;
  };
}

interface ProductReferenceMaterialAcceptanceReport {
  readonly id: string;
  readonly kind: "paint" | "glass";
  readonly sourceMaterialNamePattern: string;
  readonly runtimeMaterialNames: readonly string[];
  readonly pass: boolean;
  readonly thresholds: Record<string, number>;
  readonly pixels: ProductReferenceMaterialPixelStats;
}

interface ProductReferenceMaterialPixelStats {
  readonly nonBlackPixels: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly uniqueColorBuckets: number;
  readonly redPaintCoverage: number;
  readonly meanRedDominance: number;
  readonly isolatedHighlightRatio: number;
  readonly grayWhiteCoverage: number;
  readonly washedGrayWhiteRatio: number;
}

interface ProductReferenceCarRegionAcceptanceReport {
  readonly id: "hood-paint" | "front-bumper-paint" | "windshield-roof-glass" | "contact-grounding";
  readonly kind: "paint" | "glass" | "grounding";
  readonly selection: "asset-relative-camera-proof";
  readonly screenRegion: ProductReferenceScreenRegion;
  readonly pass: boolean;
  readonly thresholds: Record<string, number>;
  readonly pixels: ProductReferenceRegionPixelStats;
  readonly camera: unknown;
  readonly drawCalls: number;
  readonly lastError: string | null;
}

interface ProductReferenceScreenRegion {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface ProductReferenceRegionPixelStats extends ProductReferenceMaterialPixelStats {
  readonly localLumaNoise: number;
  readonly brightSpeckleRatio: number;
  readonly contactDarkPixelRatio: number;
  readonly contactContrast: number;
}

interface ProductReferenceMaterialVariantSummary {
  readonly assetId: string;
  readonly variants: readonly string[];
}

const VIEWPORT = { width: 640, height: 480 } as const;

const PRODUCT_SOURCE_ASSETS = [
  {
    id: "car-concept",
    title: "Car Concept",
    url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb"
  }
] as const;

const PRODUCT_MATERIAL_ACCEPTANCE_TARGETS = {
  "car-concept": [
    {
      id: "car-carmine-paint",
      kind: "paint",
      sourceMaterialName: /^Paint [12] Carmine$/,
      thresholds: {
        minRedPaintCoverage: 0.02,
        minMeanRedDominance: 22,
        maxIsolatedHighlightRatio: 0.035
      }
    },
    {
      id: "car-glass",
      kind: "glass",
      sourceMaterialName: /^Glass$/,
      thresholds: {
        minNonBlackPixels: 1000,
        maxAverageLuma: 130,
        maxWashedGrayWhiteRatio: 0.24
      }
    }
  ]
} as const;

const CAR_REFERENCE_REGIONS = [
  {
    id: "hood-paint",
    kind: "paint",
    selection: "asset-relative-camera-proof",
    screenRegion: { x0: 0.28, y0: 0.22, x1: 0.62, y1: 0.52 },
    thresholds: {
      minRedPaintCoverage: 0.08,
      minMeanRedDominance: 18,
      maxBrightSpeckleRatio: 0.055,
      maxLocalLumaNoise: 48,
      maxWashedGrayWhiteRatio: 0.32
    }
  },
  {
    id: "front-bumper-paint",
    kind: "paint",
    selection: "asset-relative-camera-proof",
    screenRegion: { x0: 0.22, y0: 0.08, x1: 0.66, y1: 0.3 },
    thresholds: {
      minRedPaintCoverage: 0.08,
      minMeanRedDominance: 18,
      maxBrightSpeckleRatio: 0.06,
      maxLocalLumaNoise: 52,
      maxWashedGrayWhiteRatio: 0.34
    }
  },
  {
    id: "windshield-roof-glass",
    kind: "glass",
    selection: "asset-relative-camera-proof",
    screenRegion: { x0: 0.34, y0: 0.42, x1: 0.75, y1: 0.72 },
    thresholds: {
      minNonBlackPixels: 800,
      maxAverageLuma: 145,
      maxWashedGrayWhiteRatio: 0.36,
      maxGrayWhiteCoverage: 0.72
    }
  },
  {
    id: "contact-grounding",
    kind: "grounding",
    selection: "asset-relative-camera-proof",
    screenRegion: { x0: 0.18, y0: 0.02, x1: 0.78, y1: 0.2 },
    thresholds: {
      minNonBlackPixels: 800,
      minContactDarkPixelRatio: 0.045,
      minContactContrast: 8,
      maxAverageLuma: 118
    }
  }
] as const;

export async function runProductConfiguratorReferenceHarness(): Promise<ProductConfiguratorReferenceReport> {
  window.__A3D_PRODUCT_REFERENCE_PROGRESS__ = ["start"];
  const root = document.createElement("main");
  root.id = "product-configurator-reference-root";
  root.style.cssText = "display:grid;grid-template-columns:repeat(2,640px);gap:12px;background:#05070a;padding:12px;";
  document.body.replaceChildren(root);

  let renderer: Awaited<ReturnType<typeof A3DRenderer.create>> | undefined;
  let environment: Awaited<ReturnType<typeof loadHdrEnvironment>> | undefined;

  try {
    const canvas = document.createElement("canvas");
    canvas.id = "product-configurator-reference-canvas";
    canvas.width = VIEWPORT.width;
    canvas.height = VIEWPORT.height;
    canvas.style.width = `${VIEWPORT.width}px`;
    canvas.style.height = `${VIEWPORT.height}px`;
    root.append(canvas);

    renderer = await A3DRenderer.create({
      canvas,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      backend: "webgl2",
      preserveDrawingBuffer: true,
      clearColor: [0.012, 0.014, 0.018, 1],
      requiredFeatures: ["basic-rendering", "pixel-readback", "hdr-image-based-lighting"]
    });
    environment = await loadHdrEnvironment({
      id: "product-reference-studio-small-08",
      label: "Product Reference Studio Small 08",
      url: `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`,
      intensity: 1.12,
      backgroundIntensity: 0.78,
      rotation: 0.18,
      toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
    });

    const assets: ProductReferenceAssetReport[] = [];
    for (const asset of PRODUCT_SOURCE_ASSETS) {
      productReferenceProgress(`asset:${asset.id}:start`);
      assets.push(await renderReferenceAsset(renderer, environment, asset, root, canvas));
      productReferenceProgress(`asset:${asset.id}:done`);
    }

    const unsupportedExtensions = [...new Set(assets.flatMap((asset) => asset.extensions.unsupported))].sort();
    const report: ProductConfiguratorReferenceReport = {
      schema: "a3d-product-configurator-reference-harness/v1",
      status: "ready",
      claim: "same-original-product-glb-reference-outside-advanced-gallery",
      source: "tests/browser/product-configurator-reference-harness.ts",
      galleryUiBypassed: true,
      dpr: {
        windowDevicePixelRatio: window.devicePixelRatio,
        canvasBackingScale: 1,
        viewportCssPixels: VIEWPORT
      },
      renderer: {
        backend: renderer.backend,
        realWebGL2: assets.every((asset) => asset.rendered),
        mockDevice: false,
        canvas2dProof: false,
        fixedLighting: "studio-small-08-hdr-plus-product-directional",
        fixedCameraPreset: "product-hero",
        toneMapping: {
          operator: "filmic",
          exposure: 0.96,
          whitePoint: 11.2
        }
      },
      assets,
      summary: {
        originalAssetIds: PRODUCT_SOURCE_ASSETS.map((asset) => asset.id),
        allOriginalAssetUrlsLoaded: assets.every((asset) => asset.loaded && asset.sourceOfTruth === "advanced-gallery-original-product-asset"),
        allAssetsRendered: assets.every((asset) => asset.rendered),
        allAssetsTextureBacked: assets.every((asset) => asset.textureBacked),
        allAssetsMaterialBacked: assets.every((asset) => asset.materialBacked),
        allAssetsReadyForCapture: assets.every((asset) => asset.captureReady),
        totalMaterials: assets.reduce((total, asset) => total + asset.diagnostics.materialCount, 0),
        totalTextures: assets.reduce((total, asset) => total + asset.diagnostics.textureCount, 0),
        totalDrawCalls: assets.reduce((total, asset) => total + asset.diagnostics.drawCalls, 0),
        totalNonBlackPixels: assets.reduce((total, asset) => total + asset.pixels.nonBlackPixels, 0),
        unsupportedExtensions,
        materialVariants: assets
          .filter((asset) => asset.materialVariants.length > 0)
          .map((asset) => ({ assetId: asset.id, variants: asset.materialVariants }))
      }
    };
    window.__A3D_PRODUCT_REFERENCE__ = report;
    return report;
  } catch (error) {
    const report: ProductConfiguratorReferenceReport = {
      schema: "a3d-product-configurator-reference-harness/v1",
      status: "error",
      claim: "same-original-product-glb-reference-outside-advanced-gallery",
      source: "tests/browser/product-configurator-reference-harness.ts",
      galleryUiBypassed: true,
      dpr: {
        windowDevicePixelRatio: window.devicePixelRatio,
        canvasBackingScale: 1,
        viewportCssPixels: VIEWPORT
      },
      renderer: {
        backend: "webgl2",
        fixedLighting: "studio-small-08-hdr-plus-product-directional",
        fixedCameraPreset: "product-hero",
        toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
      },
      assets: [],
      summary: {
        originalAssetIds: PRODUCT_SOURCE_ASSETS.map((asset) => asset.id),
        allOriginalAssetUrlsLoaded: false,
        allAssetsRendered: false,
        allAssetsTextureBacked: false,
        allAssetsMaterialBacked: false,
        allAssetsReadyForCapture: false,
        totalMaterials: 0,
        totalTextures: 0,
        totalDrawCalls: 0,
        totalNonBlackPixels: 0,
        unsupportedExtensions: [],
        materialVariants: []
      },
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__A3D_PRODUCT_REFERENCE__ = report;
    return report;
  } finally {
    environment?.dispose();
    renderer?.dispose();
  }
}

function productReferenceProgress(step: string): void {
  window.__A3D_PRODUCT_REFERENCE_PROGRESS__ = [...(window.__A3D_PRODUCT_REFERENCE_PROGRESS__ ?? []), step].slice(-32);
}

async function renderReferenceAsset(
  renderer: Awaited<ReturnType<typeof A3DRenderer.create>>,
  environment: Awaited<ReturnType<typeof loadHdrEnvironment>>,
  assetRef: typeof PRODUCT_SOURCE_ASSETS[number],
  root: HTMLElement,
  canvas: HTMLCanvasElement
): Promise<ProductReferenceAssetReport> {
  const scene = await loadGltfScene({
    url: `${location.origin}${assetRef.url}`,
    assetId: assetRef.id,
    assetName: assetRef.title,
    viewport: VIEWPORT
  });
  const stage = createGroundedStage(scene.resources.bounds, {
    labelPrefix: `product-reference-${assetRef.id}`,
    contactShadows: assetRef.id === "car-concept",
    background: true,
    floorColor: [0.04, 0.044, 0.048, 1],
    backdropColor: [0.012, 0.014, 0.018, 1]
  });
  stage.update({ backgroundBlur: 0.08, backgroundVisible: true });

  try {
    const camera = createCameraFrame({
      bounds: scene.resources.bounds,
      viewport: VIEWPORT,
      preset: "product-hero",
      paddingRatio: assetRef.id === "car-concept" ? 0.12 : 0.08
    });
    const proof = renderer.captureProof({
      scene,
      environment,
      environmentLighting: environment.lighting.lighting,
      renderItems: stage.renderItems({ shadows: false, backgroundVisible: true }),
      collectedLights: createStudioLighting({ preset: "product", shadows: false, intensityScale: 1 }),
      camera: camera.camera,
      viewport: VIEWPORT,
      shadow: false,
      postprocess: false
    }).proof;

    const preview = document.createElement("canvas");
    preview.id = `product-reference-${assetRef.id}`;
    preview.width = VIEWPORT.width;
    preview.height = VIEWPORT.height;
    preview.style.width = `${VIEWPORT.width}px`;
    preview.style.height = `${VIEWPORT.height}px`;
    preview.dataset.assetId = assetRef.id;
    root.append(preview);

    const diagnostics = scene.asset.loaderDiagnostics;
    const renderResources = createGLTFRenderResourceDiagnostics(scene.resources, { label: assetRef.id });
    const materialPixels = analyzeMaterialPixels(canvas);
    const runtimeMaterials = summarizeRuntimeMaterials(scene.resources.materialLibrary);
    const carRegionAcceptance = assetRef.id === "car-concept"
      ? collectCarRegionAcceptanceProofs(renderer, environment, scene, stage, canvas)
      : [];
    const liveTextures = proof.diagnostics.textures ?? 0;
    const textureBytes = proof.diagnostics.textureBytes ?? 0;
    const drawCalls = proof.diagnostics.drawCalls ?? 0;
    const materialVariants = scene.asset.materialVariants.map((variant) => variant.name);
    const rendered = proof.realWebGL2 && !proof.mockDevice && !proof.canvas2dProof && drawCalls > 0;
    const captureReady = rendered
      && proof.diagnostics.lastError === null
      && proof.pixels.nonBlackPixels > 1000
      && proof.pixels.uniqueColorBuckets > 8;

    return {
      id: assetRef.id,
      title: assetRef.title,
      url: assetRef.url,
      sourceOfTruth: "advanced-gallery-original-product-asset",
      loaded: true,
      rendered,
      captureReady,
      materialBacked: diagnostics.materialCount > 0,
      textureBacked: diagnostics.textureCount > 0,
      diagnostics: {
        meshCount: diagnostics.meshCount,
        primitiveCount: diagnostics.primitiveCount,
        vertexCount: diagnostics.vertexCount,
        indexCount: diagnostics.indexCount,
        materialCount: diagnostics.materialCount,
        textureCount: diagnostics.textureCount,
        imageCount: diagnostics.imageCount,
        animationCount: diagnostics.animationCount,
        drawCalls,
        liveTextures,
        textureBytes,
        lastError: proof.diagnostics.lastError
      },
      pixels: {
        width: proof.pixels.width,
        height: proof.pixels.height,
        nonBlackPixels: proof.pixels.nonBlackPixels,
        averageLuma: proof.pixels.averageLuma,
        maxLuma: proof.pixels.maxLuma,
        uniqueColorBuckets: proof.pixels.uniqueColorBuckets
      },
      extensions: {
        used: diagnostics.extensionsUsed,
        required: diagnostics.extensionsRequired,
        unsupported: diagnostics.unsupportedExtensions
      },
      materialVariants,
      materials: scene.asset.materials.map(summarizeMaterial),
      runtimeMaterials,
      materialAcceptance: collectMaterialAcceptanceProofs(assetRef.id, runtimeMaterials, materialPixels),
      carRegionAcceptance,
      textureSlots: diagnostics.textureSlots,
      materialFeatures: diagnostics.materialFeatures,
      renderResources: {
        drawItems: renderResources.drawItems,
        texturedDrawItems: renderResources.texturedDrawItems,
        baseColorTextureDrawItems: renderResources.baseColorTextureDrawItems,
        colorBearingTextureDrawItems: renderResources.colorBearingTextureDrawItems,
        surfaceDetailTextureDrawItems: renderResources.surfaceDetailTextureDrawItems,
        effectiveTextureBackedDrawItems: renderResources.effectiveTextureBackedDrawItems,
        unsupportedTexCoordDrawItems: renderResources.unsupportedTexCoordDrawItems,
        generatedTangentUvMismatchDrawItems: renderResources.generatedTangentUvMismatchDrawItems,
        fallbackWhiteDrawItems: renderResources.fallbackWhiteDrawItems,
        fallbackWhiteLabels: renderResources.fallbackWhiteLabels,
        fallbackWhiteMaterialNames: renderResources.fallbackWhiteMaterialNames,
        missingGeometryDrawItems: renderResources.missingGeometryDrawItems,
        missingMaterialDrawItems: renderResources.missingMaterialDrawItems,
        materialFidelityDiagnostics: renderResources.materialFidelityDiagnostics
      },
      camera: camera.diagnostics
    };
  } finally {
    stage.dispose();
    scene.dispose();
  }
}

function collectCarRegionAcceptanceProofs(
  renderer: Awaited<ReturnType<typeof A3DRenderer.create>>,
  environment: Awaited<ReturnType<typeof loadHdrEnvironment>>,
  scene: Awaited<ReturnType<typeof loadGltfScene>>,
  stage: ReturnType<typeof createGroundedStage>,
  canvas: HTMLCanvasElement
): ProductReferenceCarRegionAcceptanceReport[] {
  return carConceptProofRegions(scene.resources.bounds, stage.floorY).map((region) => {
    productReferenceProgress(`region:${region.id}:start`);
    const camera = createCameraFrame({
      bounds: region.bounds,
      viewport: VIEWPORT,
      preset: region.preset,
      paddingRatio: region.paddingRatio,
      ...(region.yawRadians !== undefined ? { yawRadians: region.yawRadians } : {}),
      ...(region.pitchRadians !== undefined ? { pitchRadians: region.pitchRadians } : {}),
      ...(region.zoom !== undefined ? { zoom: region.zoom } : {})
    });
    const proof = renderer.captureProof({
      scene,
      environment,
      environmentLighting: environment.lighting.lighting,
      renderItems: stage.renderItems({ shadows: region.kind === "grounding", backgroundVisible: true }),
      collectedLights: createStudioLighting({ preset: region.kind === "grounding" ? "softbox" : "product", shadows: false, intensityScale: 1 }),
      camera: camera.camera,
      viewport: VIEWPORT,
      shadow: false,
      postprocess: false
    }).proof;
    productReferenceProgress(`region:${region.id}:captured`);
    const pixels = readCanvasPixels(canvas);
    const stats = pixels
      ? analyzeRegionPixels(pixels, canvas.width, canvas.height, { x0: 0, y0: 0, x1: 1, y1: 1 })
      : emptyRegionStats();
    const pass = proof.diagnostics.lastError === null && proof.diagnostics.drawCalls > 0 && (
      region.kind === "paint"
        ? stats.redPaintCoverage >= region.thresholds.minRedPaintCoverage
          && stats.meanRedDominance >= region.thresholds.minMeanRedDominance
          && stats.brightSpeckleRatio <= region.thresholds.maxBrightSpeckleRatio
          && stats.localLumaNoise <= region.thresholds.maxLocalLumaNoise
          && stats.washedGrayWhiteRatio <= region.thresholds.maxWashedGrayWhiteRatio
        : region.kind === "glass"
          ? stats.nonBlackPixels >= region.thresholds.minNonBlackPixels
            && stats.averageLuma <= region.thresholds.maxAverageLuma
            && stats.washedGrayWhiteRatio <= region.thresholds.maxWashedGrayWhiteRatio
            && stats.grayWhiteCoverage <= region.thresholds.maxGrayWhiteCoverage
          : stats.nonBlackPixels >= region.thresholds.minNonBlackPixels
            && stats.contactDarkPixelRatio >= region.thresholds.minContactDarkPixelRatio
            && stats.contactContrast >= region.thresholds.minContactContrast
            && stats.averageLuma <= region.thresholds.maxAverageLuma
    );
    const report = {
      id: region.id,
      kind: region.kind,
      selection: "asset-relative-camera-proof",
      screenRegion: { x0: 0, y0: 0, x1: 1, y1: 1 },
      pass,
      thresholds: region.thresholds,
      pixels: stats,
      camera: camera.diagnostics,
      drawCalls: proof.diagnostics.drawCalls,
      lastError: proof.diagnostics.lastError
    };
    productReferenceProgress(`region:${region.id}:done`);
    return report;
  });
}

interface ProductReferenceCarRegionFrame {
  readonly id: ProductReferenceCarRegionAcceptanceReport["id"];
  readonly kind: ProductReferenceCarRegionAcceptanceReport["kind"];
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly preset: "material-inspection" | "asset-inspection";
  readonly paddingRatio: number;
  readonly yawRadians?: number;
  readonly pitchRadians?: number;
  readonly zoom?: number;
  readonly thresholds: Record<string, number>;
}

function carConceptProofRegions(
  assetBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  },
  floorY: number
): readonly ProductReferenceCarRegionFrame[] {
  return CAR_REFERENCE_REGIONS.map((region) => {
    if (region.id === "hood-paint") {
      return {
        ...region,
        bounds: regionBounds(assetBounds, [0.2, 0.38, 0.42], [0.82, 0.74, 0.86]),
        preset: "material-inspection",
        paddingRatio: 0.05,
        zoom: 0.68
      };
    }
    if (region.id === "front-bumper-paint") {
      return {
        ...region,
        bounds: regionBounds(assetBounds, [0.14, 0.05, 0.1], [0.86, 0.4, 0.46]),
        preset: "material-inspection",
        paddingRatio: 0.06,
        pitchRadians: -0.08,
        zoom: 0.7
      };
    }
    if (region.id === "windshield-roof-glass") {
      return {
        ...region,
        bounds: regionBounds(assetBounds, [0.24, 0.56, 0.34], [0.86, 0.98, 0.82]),
        preset: "material-inspection",
        paddingRatio: 0.08,
        pitchRadians: 0.08,
        zoom: 0.76
      };
    }
    return {
      ...region,
      bounds: {
        min: [assetBounds.min[0], floorY - 0.04, assetBounds.min[2]],
        max: [
          assetBounds.max[0],
          assetBounds.min[1] + (assetBounds.max[1] - assetBounds.min[1]) * 0.3,
          assetBounds.max[2]
        ]
      },
      preset: "asset-inspection",
      paddingRatio: 0.12,
      pitchRadians: -0.16,
      zoom: 0.86
    };
  });
}

function regionBounds(
  bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  },
  minT: readonly [number, number, number],
  maxT: readonly [number, number, number]
): ProductReferenceCarRegionFrame["bounds"] {
  const lerpAxis = (axis: 0 | 1 | 2, t: number): number => bounds.min[axis] + (bounds.max[axis] - bounds.min[axis]) * t;
  return {
    min: [lerpAxis(0, minT[0]), lerpAxis(1, minT[1]), lerpAxis(2, minT[2])],
    max: [lerpAxis(0, maxT[0]), lerpAxis(1, maxT[1]), lerpAxis(2, maxT[2])]
  };
}

function readCanvasPixels(canvas: HTMLCanvasElement): Uint8Array | undefined {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) return undefined;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function summarizeRuntimeMaterials(materialLibrary: ReadonlyMap<string, {
  readonly name: string;
  readonly renderState: { readonly blend: boolean; readonly depthWrite: boolean; readonly cullMode: string };
  getParameter(name: string): unknown;
}>): ProductReferenceRuntimeMaterialReport[] {
  return [...materialLibrary.entries()].map(([key, material]) => ({
    key,
    name: material.name,
    renderState: {
      blend: material.renderState.blend,
      depthWrite: material.renderState.depthWrite,
      cullMode: material.renderState.cullMode
    },
    uniforms: {
      metallic: numberUniform(material.getParameter("u_metallic")),
      roughness: numberUniform(material.getParameter("u_roughness")),
      normalScale: numberUniform(material.getParameter("u_normalScale")),
      clearcoatFactor: numberUniform(material.getParameter("u_clearcoatFactor")),
      clearcoatRoughnessFactor: numberUniform(material.getParameter("u_clearcoatRoughnessFactor")),
      transmissionFactor: numberUniform(material.getParameter("u_transmissionFactor")),
      transmissionFallbackEnergy: numberUniform(material.getParameter("u_transmissionFallbackEnergy")),
      specularFactor: numberUniform(material.getParameter("u_specularFactor"))
    }
  }));
}

function collectMaterialAcceptanceProofs(
  assetId: string,
  runtimeMaterials: readonly ProductReferenceRuntimeMaterialReport[],
  pixels: ProductReferenceMaterialPixelStats
): ProductReferenceMaterialAcceptanceReport[] {
  const targets = PRODUCT_MATERIAL_ACCEPTANCE_TARGETS[assetId as keyof typeof PRODUCT_MATERIAL_ACCEPTANCE_TARGETS] ?? [];
  return targets.flatMap((target) => {
    const runtimeMaterialNames = runtimeMaterials
      .filter((material) => target.sourceMaterialName.test(material.name))
      .map((material) => material.name)
      .sort();
    if (runtimeMaterialNames.length === 0) return [];
    const pass = target.kind === "paint"
      ? pixels.redPaintCoverage >= target.thresholds.minRedPaintCoverage
        && pixels.meanRedDominance >= target.thresholds.minMeanRedDominance
        && pixels.isolatedHighlightRatio <= target.thresholds.maxIsolatedHighlightRatio
      : pixels.nonBlackPixels >= target.thresholds.minNonBlackPixels
        && pixels.averageLuma <= target.thresholds.maxAverageLuma
        && pixels.washedGrayWhiteRatio <= target.thresholds.maxWashedGrayWhiteRatio;
    return [{
      id: target.id,
      kind: target.kind,
      sourceMaterialNamePattern: String(target.sourceMaterialName),
      runtimeMaterialNames,
      pass,
      thresholds: target.thresholds,
      pixels
    }];
  });
}

function analyzeMaterialPixels(canvas: HTMLCanvasElement): ProductReferenceMaterialPixelStats {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) {
    return {
      nonBlackPixels: 0,
      averageLuma: 0,
      maxLuma: 0,
      uniqueColorBuckets: 0,
      redPaintCoverage: 0,
      meanRedDominance: 0,
      isolatedHighlightRatio: 1,
      grayWhiteCoverage: 1,
      washedGrayWhiteRatio: 1
    };
  }
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let maxLuma = 0;
  let redPaintPixels = 0;
  let redDominanceTotal = 0;
  let redLumaTotal = 0;
  let redLumaSquaredTotal = 0;
  let isolatedHighlights = 0;
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
      maxLuma = Math.max(maxLuma, luma);
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      if (red > 36 && redDominance > 16) {
        redPaintPixels += 1;
        redDominanceTotal += redDominance;
        redLumaTotal += luma;
        redLumaSquaredTotal += luma * luma;
        if (luma > 150 && isIsolatedHighlight(luma, x, y, lumaAt)) isolatedHighlights += 1;
      }
      if (luma > 92 && chroma < 28) grayWhitePixels += 1;
      if (luma > 132 && chroma < 22) washedGrayWhitePixels += 1;
    }
  }

  const samplePixels = Math.max(1, (width - 2) * (height - 2));
  return {
    nonBlackPixels,
    averageLuma: Number((lumaTotal / samplePixels).toFixed(6)),
    maxLuma: Number(maxLuma.toFixed(6)),
    uniqueColorBuckets: buckets.size,
    redPaintCoverage: Number((redPaintPixels / samplePixels).toFixed(6)),
    meanRedDominance: Number((redPaintPixels > 0 ? redDominanceTotal / redPaintPixels : 0).toFixed(6)),
    isolatedHighlightRatio: Number((isolatedHighlights / Math.max(1, redPaintPixels)).toFixed(6)),
    grayWhiteCoverage: Number((grayWhitePixels / samplePixels).toFixed(6)),
    washedGrayWhiteRatio: Number((washedGrayWhitePixels / Math.max(1, nonBlackPixels)).toFixed(6))
  };
}

function analyzeRegionPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  region: ProductReferenceScreenRegion
): ProductReferenceRegionPixelStats {
  const x0 = Math.max(1, Math.min(width - 2, Math.floor(region.x0 * width)));
  const x1 = Math.max(x0 + 1, Math.min(width - 1, Math.ceil(region.x1 * width)));
  const y0 = Math.max(1, Math.min(height - 2, Math.floor(region.y0 * height)));
  const y1 = Math.max(y0 + 1, Math.min(height - 1, Math.ceil(region.y1 * height)));
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  let maxLuma = 0;
  let redPaintPixels = 0;
  let redDominanceTotal = 0;
  let redLumaTotal = 0;
  let redLumaSquaredTotal = 0;
  let isolatedHighlights = 0;
  let grayWhitePixels = 0;
  let washedGrayWhitePixels = 0;
  let brightSpeckles = 0;
  let contactDarkPixels = 0;
  let lowerBandLuma = 0;
  let upperBandLuma = 0;
  let lowerBandCount = 0;
  let upperBandCount = 0;
  const buckets = new Set<number>();
  const lumaAt = (x: number, y: number): number => {
    const index = (y * width + x) * 4;
    return 0.2126 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.0722 * (pixels[index + 2] ?? 0);
  };

  for (let y = y0; y < y1; y += 1) {
    const band = (y - y0) / Math.max(1, y1 - y0);
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const redDominance = red - Math.max(green, blue);
      if (red + green + blue > 12) {
        nonBlackPixels += 1;
        if (luma < 44) contactDarkPixels += 1;
      }
      lumaTotal += luma;
      lumaSquaredTotal += luma * luma;
      maxLuma = Math.max(maxLuma, luma);
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      if (red > 36 && redDominance > 16) {
        redPaintPixels += 1;
        redDominanceTotal += redDominance;
        redLumaTotal += luma;
        redLumaSquaredTotal += luma * luma;
        if (luma > 150 && isIsolatedHighlight(luma, x, y, lumaAt)) isolatedHighlights += 1;
      }
      if (luma > 138 && isIsolatedHighlight(luma, x, y, lumaAt)) brightSpeckles += 1;
      if (luma > 92 && chroma < 28) grayWhitePixels += 1;
      if (luma > 132 && chroma < 22) washedGrayWhitePixels += 1;
      if (band < 0.42) {
        lowerBandLuma += luma;
        lowerBandCount += 1;
      } else if (band > 0.58) {
        upperBandLuma += luma;
        upperBandCount += 1;
      }
    }
  }

  const samplePixels = Math.max(1, (x1 - x0) * (y1 - y0));
  const averageLuma = lumaTotal / samplePixels;
  const variance = Math.max(0, lumaSquaredTotal / samplePixels - averageLuma * averageLuma);
  const redAverageLuma = redPaintPixels > 0 ? redLumaTotal / redPaintPixels : averageLuma;
  const redVariance = redPaintPixels > 0 ? Math.max(0, redLumaSquaredTotal / redPaintPixels - redAverageLuma * redAverageLuma) : variance;
  const lowerAverage = lowerBandLuma / Math.max(1, lowerBandCount);
  const upperAverage = upperBandLuma / Math.max(1, upperBandCount);
  return {
    nonBlackPixels,
    averageLuma: Number(averageLuma.toFixed(6)),
    maxLuma: Number(maxLuma.toFixed(6)),
    uniqueColorBuckets: buckets.size,
    redPaintCoverage: Number((redPaintPixels / samplePixels).toFixed(6)),
    meanRedDominance: Number((redPaintPixels > 0 ? redDominanceTotal / redPaintPixels : 0).toFixed(6)),
    isolatedHighlightRatio: Number((isolatedHighlights / Math.max(1, redPaintPixels)).toFixed(6)),
    grayWhiteCoverage: Number((grayWhitePixels / samplePixels).toFixed(6)),
    washedGrayWhiteRatio: Number((washedGrayWhitePixels / Math.max(1, nonBlackPixels)).toFixed(6)),
    localLumaNoise: Number(Math.sqrt(redPaintPixels > 100 ? redVariance : variance).toFixed(6)),
    brightSpeckleRatio: Number((brightSpeckles / Math.max(1, nonBlackPixels)).toFixed(6)),
    contactDarkPixelRatio: Number((contactDarkPixels / Math.max(1, nonBlackPixels)).toFixed(6)),
    contactContrast: Number(Math.abs(upperAverage - lowerAverage).toFixed(6))
  };
}

function emptyRegionStats(): ProductReferenceRegionPixelStats {
  return {
    nonBlackPixels: 0,
    averageLuma: 0,
    maxLuma: 0,
    uniqueColorBuckets: 0,
    redPaintCoverage: 0,
    meanRedDominance: 0,
    isolatedHighlightRatio: 1,
    grayWhiteCoverage: 1,
    washedGrayWhiteRatio: 1,
    localLumaNoise: 0,
    brightSpeckleRatio: 1,
    contactDarkPixelRatio: 0,
    contactContrast: 0
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
  return brightNeighbors <= 1 && luma - neighborTotal / 8 > 46;
}

function numberUniform(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeMaterial(material: {
  readonly name: string;
  readonly alphaMode: string;
  readonly unlit: boolean;
  readonly doubleSided: boolean;
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly baseColorTexture?: unknown;
  readonly metallicRoughnessTexture?: unknown;
  readonly normalTexture?: unknown;
  readonly occlusionTexture?: unknown;
  readonly emissiveTexture?: unknown;
  readonly clearcoat?: unknown;
  readonly transmission?: unknown;
  readonly diffuseTransmission?: unknown;
  readonly volume?: unknown;
  readonly ior?: unknown;
  readonly specular?: unknown;
  readonly pbrSpecularGlossiness?: unknown;
  readonly sheen?: unknown;
  readonly anisotropy?: unknown;
  readonly iridescence?: unknown;
  readonly dispersion?: unknown;
}): ProductReferenceMaterialReport {
  return {
    name: material.name,
    alphaMode: material.alphaMode,
    unlit: material.unlit,
    doubleSided: material.doubleSided,
    metallicFactor: material.metallicFactor,
    roughnessFactor: material.roughnessFactor,
    textureSlots: [
      material.baseColorTexture ? "baseColor" : undefined,
      material.metallicRoughnessTexture ? "metallicRoughness" : undefined,
      material.normalTexture ? "normal" : undefined,
      material.occlusionTexture ? "occlusion" : undefined,
      material.emissiveTexture ? "emissive" : undefined
    ].filter((slot): slot is string => Boolean(slot)),
    extensionFlags: [
      material.clearcoat ? "KHR_materials_clearcoat" : undefined,
      material.transmission ? "KHR_materials_transmission" : undefined,
      material.diffuseTransmission ? "KHR_materials_diffuse_transmission" : undefined,
      material.volume ? "KHR_materials_volume" : undefined,
      material.ior !== undefined ? "KHR_materials_ior" : undefined,
      material.specular ? "KHR_materials_specular" : undefined,
      material.pbrSpecularGlossiness ? "KHR_materials_pbrSpecularGlossiness" : undefined,
      material.sheen ? "KHR_materials_sheen" : undefined,
      material.anisotropy ? "KHR_materials_anisotropy" : undefined,
      material.iridescence ? "KHR_materials_iridescence" : undefined,
      material.dispersion !== undefined ? "KHR_materials_dispersion" : undefined
    ].filter((extension): extension is string => Boolean(extension))
  };
}

window.runProductConfiguratorReferenceHarness = runProductConfiguratorReferenceHarness;
