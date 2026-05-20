import {
  G3DRenderer,
  createCameraFrame,
  createGroundedStage,
  createStudioLighting,
  loadGltfScene,
  loadHdrEnvironment
} from "/packages/engine/src/v6/index.js";

declare global {
  interface Window {
    __G3D_PRODUCT_REFERENCE__?: ProductConfiguratorReferenceReport;
    runProductConfiguratorReferenceHarness?: typeof runProductConfiguratorReferenceHarness;
  }
}

type ProductReferenceStatus = "ready" | "error";

export interface ProductConfiguratorReferenceReport {
  readonly schema: "g3d-product-configurator-reference-harness/v1";
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
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
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

interface ProductReferenceMaterialVariantSummary {
  readonly assetId: string;
  readonly variants: readonly string[];
}

const VIEWPORT = { width: 640, height: 480 } as const;

const PRODUCT_SOURCE_ASSETS = [
  {
    id: "car-concept",
    title: "Car Concept",
    url: "/fixtures/v8/assets/vehicles/car-concept.glb"
  },
  {
    id: "chronograph-watch",
    title: "Chronograph Watch",
    url: "/fixtures/v8/assets/product/chronograph-watch.glb"
  },
  {
    id: "materials-variants-shoe",
    title: "Materials Variants Shoe",
    url: "/fixtures/v8/assets/product/materials-variants-shoe.glb"
  },
  {
    id: "sunglasses-khronos",
    title: "Sunglasses Khronos",
    url: "/fixtures/v8/assets/product/sunglasses-khronos.glb"
  }
] as const;

export async function runProductConfiguratorReferenceHarness(): Promise<ProductConfiguratorReferenceReport> {
  const root = document.createElement("main");
  root.id = "product-configurator-reference-root";
  root.style.cssText = "display:grid;grid-template-columns:repeat(2,640px);gap:12px;background:#05070a;padding:12px;";
  document.body.replaceChildren(root);

  let renderer: Awaited<ReturnType<typeof G3DRenderer.create>> | undefined;
  let environment: Awaited<ReturnType<typeof loadHdrEnvironment>> | undefined;

  try {
    const canvas = document.createElement("canvas");
    canvas.id = "product-configurator-reference-canvas";
    canvas.width = VIEWPORT.width;
    canvas.height = VIEWPORT.height;
    canvas.style.width = `${VIEWPORT.width}px`;
    canvas.style.height = `${VIEWPORT.height}px`;
    root.append(canvas);

    renderer = await G3DRenderer.create({
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
      url: `${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`,
      intensity: 1.12,
      backgroundIntensity: 0.78,
      rotation: 0.18,
      toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
    });

    const assets: ProductReferenceAssetReport[] = [];
    for (const asset of PRODUCT_SOURCE_ASSETS) {
      assets.push(await renderReferenceAsset(renderer, environment, asset, root));
    }

    const unsupportedExtensions = [...new Set(assets.flatMap((asset) => asset.extensions.unsupported))].sort();
    const report: ProductConfiguratorReferenceReport = {
      schema: "g3d-product-configurator-reference-harness/v1",
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
    window.__G3D_PRODUCT_REFERENCE__ = report;
    return report;
  } catch (error) {
    const report: ProductConfiguratorReferenceReport = {
      schema: "g3d-product-configurator-reference-harness/v1",
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
    window.__G3D_PRODUCT_REFERENCE__ = report;
    return report;
  } finally {
    environment?.dispose();
    renderer?.dispose();
  }
}

async function renderReferenceAsset(
  renderer: Awaited<ReturnType<typeof G3DRenderer.create>>,
  environment: Awaited<ReturnType<typeof loadHdrEnvironment>>,
  assetRef: typeof PRODUCT_SOURCE_ASSETS[number],
  root: HTMLElement
): Promise<ProductReferenceAssetReport> {
  const scene = await loadGltfScene({
    url: `${location.origin}${assetRef.url}`,
    assetId: assetRef.id,
    assetName: assetRef.title,
    viewport: VIEWPORT
  });
  const stage = createGroundedStage(scene.resources.bounds, {
    labelPrefix: `product-reference-${assetRef.id}`,
    contactShadows: false,
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
      textureSlots: diagnostics.textureSlots,
      materialFeatures: diagnostics.materialFeatures,
      camera: camera.diagnostics
    };
  } finally {
    stage.dispose();
    scene.dispose();
  }
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
