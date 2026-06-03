import {
  createCurrentRoutesInteractiveRenderer,
  type CurrentRoutesInteractiveRenderer
} from "/packages/rendering/src/threejs-example-parity/index.ts";
import {
  createCameraFrame,
  createGroundedStage,
  createStudioLighting,
  loadGltfScene,
  loadHdrEnvironment
} from "/packages/engine/src/threejs-example-parity/FlagshipFoundation.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

const requestedBackend = new URLSearchParams(location.search).get("backend") === "auto" ? "auto" : "webgpu";
const PUBLIC_ASSET_ORIGIN = "https://cdn.jsdelivr.net/gh/auraoneai/aura3d@main";

function publicAssetUrl(path: string): string {
  const configured = (window as unknown as { AURA3D_PUBLIC_ASSET_ORIGIN?: string }).AURA3D_PUBLIC_ASSET_ORIGIN;
  const origin = configured ?? PUBLIC_ASSET_ORIGIN;
  return new URL(path, origin).href;
}

void startWebGPUShowcase({
  appId: "wow-webgpu-product-viewer",
  title: "A3D WebGPU Product Viewer",
  subtitle: "ProductionRuntimeRenderer-backed product route using Duck GLB, studio HDR lighting, and explicit WebGPU or backend=auto diagnostics.",
  labels: {
    concept: "production product viewer",
    workload: "Duck GLB",
    api: "ProductionRuntimeRenderer"
  },
  async setup({ canvas, renderSize }) {
    const viewport = { width: renderSize.width, height: renderSize.height };
    const [scene, environment] = await Promise.all([
      loadGltfScene({
        url: publicAssetUrl("/fixtures/asset-corpus/duck.glb"),
        assetId: "duck",
        assetName: "Duck",
        viewport
      }),
      loadHdrEnvironment({
        id: "studio-small-08-webgpu-product",
        label: "Studio Small 08 WebGPU Product",
        url: publicAssetUrl("/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"),
        quality: "interactive",
        intensity: 1.15,
        backgroundIntensity: 0.85,
        rotation: 0.15,
        toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
      })
    ]);
    for (const material of scene.resources.materialLibrary.values()) {
      const roughness = material.getParameter("u_roughness");
      const metallic = material.getParameter("u_metallic");
      const clearcoat = material.getParameter("u_clearcoatFactor");
      if (typeof roughness === "number") material.setParameter("u_roughness", Math.min(1, Math.max(0.88, roughness * 1.12)));
      if (typeof metallic === "number") material.setParameter("u_metallic", Math.min(0.04, Math.max(0, metallic * 0.12)));
      if (typeof clearcoat === "number") material.setParameter("u_clearcoatFactor", Math.min(0.08, Math.max(0, clearcoat * 0.2)));
      material.setParameter("u_materialEnvironmentSpecularScale", 0.08);
      material.setParameter("u_productColorSmoothing", 1);
      material.setParameter("u_transmissionTextureEnabled", 0);
      material.setParameter("u_transmissionFactor", 0);
      material.setParameter("u_diffuseTransmissionFactor", 0);
      material.setParameter("u_transmissionFallbackEnergy", 0);
      material.setParameter("u_transmissionParallaxStrength", 0);
      material.setParameter("u_transmissionBounceCount", 0);
      material.setParameter("u_transmissionCausticStrength", 0);
    }
    const assetPresentationScale = 1.0;
    scene.resources.scene.root.transform
      .setScale(assetPresentationScale, assetPresentationScale, assetPresentationScale)
      .setPosition(0, scene.resources.bounds.min[1] * (1 - assetPresentationScale), 0);
    const stage = createGroundedStage(scene.resources.bounds, {
      labelPrefix: "webgpu-product-viewer",
      floorColor: [0.025, 0.028, 0.033, 1],
      backdropColor: [0.012, 0.014, 0.018, 1],
      shadowLightDirection: [-0.42, -0.82, -0.38]
    });
    stage.update({ backgroundBlur: 0.18, backgroundVisible: true });
    let renderer: CurrentRoutesInteractiveRenderer = await createCurrentRoutesInteractiveRenderer({
      backend: requestedBackend,
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      preserveDrawingBuffer: true,
      clearColor: [0.01, 0.014, 0.022, 1]
    });
    let currentViewport = viewport;
    return {
      requestedBackend,
      selectedBackend: renderer.backend,
      adapterName: renderer.getDiagnostics().lastError ?? renderer.backendSelection.reason,
      capabilities: [],
      resize(width, height) {
        currentViewport = { width, height };
        renderer.resize(width, height);
      },
      dispose() {
        renderer.dispose();
        stage.dispose();
        environment.dispose();
        scene.dispose();
      },
      async render(timeSeconds) {
        const camera = createCameraFrame({
          bounds: scene.resources.bounds,
          viewport: currentViewport,
          preset: "product-hero",
          yawRadians: 0.34 + timeSeconds * -0.42,
          pitchRadians: -0.08,
          zoom: 0.82,
          paddingRatio: 0.18
        });
        const input = scene.createRendererInput({
          viewport: currentViewport,
          environment,
          environmentLighting: environment.environmentLighting,
          renderItems: stage.renderItems({ shadows: true, backgroundVisible: true }),
          collectedLights: createStudioLighting({ preset: "product", shadows: false }),
          shadow: false,
          postprocess: false
        });
        const result = await renderer.renderFrame({
          source: input.source,
          camera: camera.camera,
          metadata: {
            assetId: scene.metadata.assetId,
            assetName: scene.metadata.assetName,
            assetUri: scene.metadata.assetUri,
            meshCount: scene.metadata.meshCount,
            primitiveCount: scene.metadata.primitiveCount,
            materialCount: scene.metadata.materialCount,
            textureCount: scene.metadata.textureCount,
            imageCount: scene.metadata.imageCount,
            animationCount: scene.metadata.animationCount,
            skinCount: scene.metadata.skinCount,
            morphTargetCount: scene.metadata.morphTargetCount,
            extensionsUsed: scene.metadata.extensionsUsed,
            environmentId: environment.id,
            hdrEnvironmentUri: environment.url
          }
        });
        return {
          diagnostics: result.diagnostics,
          comparison: "Native WebGPU product screenshot quality gate",
          fields: {
            Asset: scene.metadata.assetName,
            "Requested backend": requestedBackend,
            "Selected backend": renderer.backend,
            "Selection": renderer.backendSelection.reason
          }
        };
      }
    };
  }
});
