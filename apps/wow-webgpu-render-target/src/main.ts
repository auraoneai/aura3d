import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, Renderer, UnlitMaterial, type RenderItem, type RenderTarget } from "/packages/rendering/src/index.ts";
import { rotationZQuat, simpleBounds } from "/apps/wow-common/src/simple-showcase.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

const triangle = Geometry.triangle();
const cyan = new UnlitMaterial({ name: "webgpu-rt-cyan", color: [0.08, 0.95, 0.8, 1] });
const magenta = new UnlitMaterial({ name: "webgpu-rt-magenta", color: [1, 0.18, 0.52, 1] });

function createTargetProofItems(timeSeconds: number): readonly RenderItem[] {
  return [
    {
      label: "webgpu-rt-a",
      geometry: triangle,
      material: cyan,
      modelMatrix: composeMat4([-0.34, 0, 0], rotationZQuat(timeSeconds), [1, 1, 1])
    },
    {
      label: "webgpu-rt-b",
      geometry: triangle,
      material: magenta,
      modelMatrix: composeMat4([0.38, 0.08, 0], rotationZQuat(-timeSeconds * 0.7), [0.72, 0.72, 0.72])
    }
  ];
}

void startWebGPUShowcase({
  appId: "wow-webgpu-render-target",
  title: "A3D WebGPU Render Target",
  subtitle: "Explicit WebGPU route rendering into an offscreen render target, presenting it, and reporting native texture readback availability.",
  labels: {
    concept: "render target",
    workload: "offscreen color target",
    api: "createRenderTarget + readPixelsAsync"
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
    let target = createTarget(renderSize.width, renderSize.height);
    function createTarget(width: number, height: number): RenderTarget {
      return renderer.device.createRenderTarget({
        width,
        height,
        label: "webgpu-route-offscreen-target",
        format: "rgba8",
        depth: true
      });
    }
    return {
      requestedBackend: "webgpu",
      selectedBackend: "webgpu",
      adapterName: renderer.device.info.renderer,
      capabilities: renderer.device.info.capabilities ?? [],
      resize(width, height) {
        renderer.resize(width, height);
        target.dispose();
        target = createTarget(width, height);
      },
      dispose() {
        target.dispose();
        renderer.dispose();
      },
      async render(timeSeconds, size) {
        const renderItems = createTargetProofItems(timeSeconds);
        await renderer.renderAsync({
          renderItems,
          renderTarget: target,
          cameraPolicy: "auto-frame",
          cameraFrameBounds: simpleBounds(1.45),
          cameraFrameOptions: { paddingRatio: 0.24, yawRadians: 0, pitchRadians: 0 },
          environmentLighting: false,
          shadow: false,
          postprocess: false
        });
        let readbackMode = "native-texture-readback: blocked";
        if (typeof renderer.device.readPixelsAsync === "function") {
          renderer.device.setRenderTarget(target);
          try {
            await renderer.device.readPixelsAsync(0, 0, Math.min(8, size.width), Math.min(8, size.height));
            readbackMode = "native-texture-readback: supported";
          } catch (error) {
            readbackMode = `native-texture-readback: ${error instanceof Error ? "partial" : "blocked"}`;
          } finally {
            renderer.device.setRenderTarget(null);
          }
        }
        const diagnostics = await renderer.renderAsync({
          renderItems,
          cameraPolicy: "auto-frame",
          cameraFrameBounds: simpleBounds(1.45),
          cameraFrameOptions: { paddingRatio: 0.24, yawRadians: 0, pitchRadians: 0 },
          environmentLighting: false,
          shadow: false,
          postprocess: false
        });
        return {
          diagnostics,
          readbackMode,
          fields: {
            "Target": `${target.width}x${target.height}`,
            "Readback": readbackMode
          }
        };
      }
    };
  }
});
