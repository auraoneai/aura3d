import {
  createProductViewer,
  loadGltfScene,
  loadHdrEnvironment,
  type G3DProductViewer
} from "@galileo3d/engine/v6";

export interface V8FlagshipViewerSceneConfig {
  readonly id: "v8-flagship-viewer";
  readonly assetId: "chronograph-watch";
  readonly assetName: "Chronograph Watch";
  readonly assetUri: string;
  readonly hdrId: "studio-small-08-1k";
  readonly hdrUri: string;
  readonly width: number;
  readonly height: number;
  readonly camera: {
    readonly preset: "product-hero";
    readonly yawRadians: number;
    readonly pitchRadians: number;
    readonly paddingRatio: number;
    readonly fovYRadians: number;
  };
  readonly render: {
    readonly toneMapping: "aces";
    readonly exposure: number;
    readonly iblIntensity: number;
    readonly specularIntensity: number;
    readonly environmentRotation: number;
    readonly shadows: boolean;
    readonly backgroundVisible: boolean;
    readonly backgroundBlur: number;
  };
}

export interface V8FlagshipRenderResult {
  readonly engine: "galileo";
  readonly scene: V8FlagshipViewerSceneConfig;
  readonly status: "ready";
  readonly renderer: {
    readonly backend: "webgl2" | "webgpu";
    readonly sdkSurface: "@galileo3d/engine/v6";
    readonly drawCalls: number;
    readonly triangles: number;
    readonly textures: number;
    readonly textureBytes: number;
    readonly materialCount: number;
    readonly meshCount: number;
    readonly primitiveCount: number;
  };
  readonly asset: {
    readonly id: string;
    readonly uri: string;
    readonly animationCount: number;
    readonly skinCount: number;
    readonly morphTargetCount: number;
  };
  readonly environment: {
    readonly id: string;
    readonly uri: string;
    readonly realRadianceHdr: boolean;
    readonly cubemapPMREM: boolean;
    readonly cubemapFaceSize: number;
    readonly cubemapMipCount: number;
  };
  readonly camera: {
    readonly preset: "product-hero" | "asset-inspection" | "material-inspection";
    readonly yawRadians: number;
    readonly pitchRadians: number;
    readonly paddingRatio: number;
    readonly cameraPosition: readonly [number, number, number];
    readonly targetOffset: readonly [number, number, number];
    readonly zoom: number;
    readonly target: readonly [number, number, number];
  };
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
  };
  readonly dataUrl: string;
}

export const v8FlagshipViewerScene: V8FlagshipViewerSceneConfig = {
  id: "v8-flagship-viewer",
  assetId: "chronograph-watch",
  assetName: "Chronograph Watch",
  assetUri: "/fixtures/v7/assets/flagship/chronograph-watch.glb",
  hdrId: "studio-small-08-1k",
  hdrUri: "/fixtures/v6/environments/hdri/studio_small_08_1k.hdr",
  width: 1280,
  height: 720,
  camera: {
    preset: "product-hero",
    yawRadians: -0.34,
    pitchRadians: -0.08,
    paddingRatio: 0.024,
    fovYRadians: 0.45
  },
  render: {
    toneMapping: "aces",
    exposure: 0.72,
    iblIntensity: 0.82,
    specularIntensity: 0.92,
    environmentRotation: 0.22,
    shadows: true,
    backgroundVisible: true,
    backgroundBlur: 0.025
  }
};

export async function renderG3DFlagshipViewer(
  canvas: HTMLCanvasElement,
  scene: V8FlagshipViewerSceneConfig = v8FlagshipViewerScene
): Promise<V8FlagshipRenderResult> {
  canvas.width = scene.width;
  canvas.height = scene.height;
  const assetUri = absoluteUrl(scene.assetUri);
  const hdrUri = absoluteUrl(scene.hdrUri);
  const [asset, environment] = await Promise.all([
    loadGltfScene({
      url: assetUri,
      assetId: scene.assetId,
      assetName: scene.assetName,
      viewport: { width: scene.width, height: scene.height },
      rendererInput: {
        qualityPreset: "hdr-studio-preview",
        cameraPolicy: "require"
      }
    }),
    loadHdrEnvironment({
      url: hdrUri,
      id: scene.hdrId,
      label: "Studio Small 08 1K",
      intensity: scene.render.iblIntensity,
      backgroundIntensity: 1,
      rotation: scene.render.environmentRotation,
      toneMapping: {
        operator: "filmic",
        exposure: scene.render.exposure,
        whitePoint: 11.2
      }
    })
  ]);
  let viewer: G3DProductViewer | undefined;
  try {
    viewer = await createProductViewer({
      canvas,
      asset,
      environment,
      backend: "webgl2",
      width: scene.width,
      height: scene.height,
      camera: { preset: scene.camera.preset, orbit: true },
      lighting: { ibl: true, shadows: scene.render.shadows },
      postprocess: {
        toneMapping: scene.render.toneMapping,
        exposure: scene.render.exposure,
        bloom: false,
        ssao: false,
        fxaa: true,
        colorGrade: false
      }
    });
    viewer.setSettings({
      exposure: scene.render.exposure,
      iblIntensity: scene.render.iblIntensity,
      specularIntensity: scene.render.specularIntensity,
      environmentRotation: scene.render.environmentRotation,
      backgroundVisible: scene.render.backgroundVisible,
      backgroundBlur: scene.render.backgroundBlur,
      shadows: scene.render.shadows
    });
    const result = viewer.render();
    const diagnostics = viewer.diagnostics();
    const pixels = result.proof.pixels;
    const bounds = asset.resources.bounds;
    const camera = diagnostics.camera;
    if (!camera) throw new Error("G3D flagship viewer did not publish camera diagnostics.");
    const target = [
      (bounds.min[0] + bounds.max[0]) / 2 + camera.targetOffset[0],
      (bounds.min[1] + bounds.max[1]) / 2 + camera.targetOffset[1],
      (bounds.min[2] + bounds.max[2]) / 2 + camera.targetOffset[2]
    ] as const;
    return {
      engine: "galileo",
      scene,
      status: "ready",
      renderer: {
        backend: viewer.renderer.backend,
        sdkSurface: "@galileo3d/engine/v6",
        drawCalls: result.proof.diagnostics.drawCalls,
        triangles: Math.max(0, Math.floor(asset.metadata.indexCount / 3)),
        textures: result.proof.diagnostics.textures ?? 0,
        textureBytes: result.proof.diagnostics.textureBytes ?? 0,
        materialCount: asset.metadata.materialCount,
        meshCount: asset.metadata.meshCount,
        primitiveCount: asset.metadata.primitiveCount
      },
      asset: {
        id: scene.assetId,
        uri: scene.assetUri,
        animationCount: asset.metadata.animationCount,
        skinCount: asset.metadata.skinCount,
        morphTargetCount: asset.metadata.morphTargetCount
      },
      environment: {
        id: environment.id,
        uri: scene.hdrUri,
        realRadianceHdr: diagnostics.environment.realRadianceHdr,
        cubemapPMREM: diagnostics.environment.cubemapPMREM,
        cubemapFaceSize: diagnostics.environment.cubemapFaceSize,
        cubemapMipCount: diagnostics.environment.cubemapMipCount
      },
      camera: { ...camera, target },
      bounds,
      pixels: {
        nonBlackPixels: pixels.nonBlackPixels,
        uniqueColorBuckets: pixels.uniqueColorBuckets,
        averageLuma: pixels.averageLuma,
        maxLuma: pixels.maxLuma
      },
      dataUrl: canvas.toDataURL("image/png")
    };
  } finally {
    viewer?.dispose();
    environment.dispose();
    asset.dispose();
  }
}

function absoluteUrl(path: string): string {
  return new URL(path, globalThis.location?.origin ?? "http://localhost").toString();
}
