import { Renderer } from "/packages/rendering/src/index.ts";
import {
  createCameraFrame,
  createGroundedStage,
  createStudioLighting,
  loadGltfScene,
  loadHdrEnvironment
} from "/packages/engine/src/threejs-example-parity/FlagshipFoundation.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

interface BoundsLike {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

function boundsExtent(bounds: BoundsLike): number {
  return Math.max(
    0.001,
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
}

void startWebGPUShowcase({
  appId: "wow-webgpu-pbr-asset",
  title: "A3D WebGPU PBR Asset",
  subtitle: "Clear Coat Test GLB loaded through the current Aura3D glTF pipeline and rendered through explicit WebGPU PBR material paths with visible albedo color.",
  labels: {
    concept: "imported PBR asset",
    workload: "Clear Coat Test GLB",
    api: "loadGltfScene + Renderer WebGPU"
  },
  async setup({ canvas, renderSize }) {
    const viewport = { width: renderSize.width, height: renderSize.height };
    const [scene, environment] = await Promise.all([
      loadGltfScene({
        url: `${location.origin}/fixtures/asset-corpus/clear-coat-test.glb`,
        assetId: "clear-coat-test",
        assetName: "Clear Coat Test",
        viewport
      }),
      loadHdrEnvironment({
        id: "studio-small-08-webgpu-pbr",
        label: "Studio Small 08 WebGPU PBR",
        url: `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`,
        quality: "interactive",
        intensity: 1.08,
        backgroundIntensity: 0.74,
        rotation: 0.2,
        toneMapping: { operator: "filmic", exposure: 0.92, whitePoint: 11.2 }
      })
    ]);
    const extent = boundsExtent(scene.resources.bounds);
    for (const material of scene.resources.materialLibrary.values()) {
      material.setParameter("u_baseColor", [0.95, 0.14, 0.55, 1]);
      material.setParameter("u_baseColorTextureEnabled", 0);
      material.setParameter("u_metallic", 0);
      material.setParameter("u_roughness", 0.7);
      material.setParameter("u_environmentMapTextureIntensity", 0.55);
      material.setParameter("u_environmentMapTextureSpecularIntensity", 0.18);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.16);
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
      labelPrefix: "webgpu-pbr-asset",
      floorColor: [0.018, 0.02, 0.024, 1],
      backdropColor: [0.006, 0.008, 0.012, 1],
      minWidth: extent * 1.95,
      minHeight: extent * 1.75,
      minDepth: extent * 2.35,
      widthScale: 2.05,
      heightScale: 1.85,
      depthScale: 2.25,
      depthPadding: extent * 0.34,
      floorOffset: extent * 0.032,
      floorThickness: extent * 0.015,
      backdropWidthScale: 1.15,
      backdropHeightScale: 2.15,
      backdropDepthOffsetScale: 0.34,
      shadowLightDirection: [-0.42, -0.82, -0.38]
    });
    stage.update({ backgroundBlur: 0.08, backgroundVisible: false });
    const renderer = await Renderer.create({
      backend: "webgpu",
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      clearColor: [0.01, 0.014, 0.022, 1],
      antialias: true
    });
    let currentViewport = viewport;
    return {
      requestedBackend: "webgpu",
      selectedBackend: "webgpu",
      adapterName: renderer.device.info.renderer,
      capabilities: renderer.device.info.capabilities ?? [],
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
      async render() {
        const camera = createCameraFrame({
          bounds: scene.resources.bounds,
          viewport: currentViewport,
          preset: "asset-inspection",
          yawRadians: 0.42,
          pitchRadians: -0.08,
          paddingRatio: 0.34
        });
        const input = scene.createRendererInput({
          viewport: currentViewport,
          environment,
          environmentLighting: environment.environmentLighting,
          renderItems: stage.renderItems({ shadows: true, backgroundVisible: false }),
          collectedLights: createStudioLighting({ preset: "inspection", intensityScale: 1.15, shadows: false }),
          shadow: false,
          postprocess: false
        });
        const diagnostics = await renderer.renderAsync(input.source, camera.camera);
        return {
          diagnostics,
          comparison: "Native WebGPU PBR screenshot quality gate",
          fields: {
            Asset: scene.metadata.assetName,
            Materials: scene.metadata.materialCount,
            Textures: scene.metadata.textureCount,
            "PBR textures": scene.metadata.pbrTextureCount
          }
        };
      }
    };
  }
});
