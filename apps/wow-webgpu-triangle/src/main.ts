import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, Renderer, UnlitMaterial } from "/packages/rendering/src/index.ts";
import { rotationZQuat, simpleBounds } from "/apps/wow-common/src/simple-showcase.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

const triangle = Geometry.triangle();
const material = new UnlitMaterial({ name: "webgpu-triangle", color: [0.18, 0.86, 1, 1] });

void startWebGPUShowcase({
  appId: "wow-webgpu-triangle",
  title: "A3D WebGPU Triangle",
  subtitle: "Smallest native WebGPU route using Aura3D Renderer APIs, explicit backend='webgpu', and structured unsupported diagnostics.",
  labels: {
    concept: "first WebGPU draw",
    workload: "single triangle",
    api: "Renderer.create({ backend: 'webgpu' })"
  },
  async setup({ canvas, renderSize }) {
    const renderer = await Renderer.create({
      backend: "webgpu",
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      clearColor: [0.01, 0.014, 0.022, 1],
      antialias: true
    });
    return {
      requestedBackend: "webgpu",
      selectedBackend: "webgpu",
      adapterName: renderer.device.info.renderer,
      capabilities: renderer.device.info.capabilities ?? [],
      resize: (width, height) => renderer.resize(width, height),
      dispose: () => renderer.dispose(),
      async render(timeSeconds) {
        const diagnostics = await renderer.renderAsync({
          renderItems: [{
            label: "webgpu-triangle",
            geometry: triangle,
            material,
            modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.8), [1.25, 1.25, 1.25])
          }],
          cameraPolicy: "auto-frame",
          cameraFrameBounds: simpleBounds(1.35),
          cameraFrameOptions: { paddingRatio: 0.26, yawRadians: 0, pitchRadians: 0 },
          environmentLighting: false,
          shadow: false,
          postprocess: false
        });
        return { diagnostics };
      }
    };
  }
});
