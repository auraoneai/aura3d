import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, PBRMaterial, Renderer, createLightingDefault, type RenderItem } from "/packages/rendering/src/index.ts";
import { rotationYQuat, simpleBounds } from "/apps/wow-common/src/simple-showcase.ts";
import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

const cube = Geometry.litCube(0.42);
const lighting = createLightingDefault("studioProduct");
const materials = [
  new PBRMaterial({ name: "webgpu-instance-blue", baseColor: [0.12, 0.48, 1, 1], metallic: 0.05, roughness: 0.28 }),
  new PBRMaterial({ name: "webgpu-instance-gold", baseColor: [1, 0.78, 0.24, 1], metallic: 0.62, roughness: 0.24 }),
  new PBRMaterial({ name: "webgpu-instance-teal", baseColor: [0.02, 0.92, 0.78, 1], metallic: 0.12, roughness: 0.24 }),
  new PBRMaterial({ name: "webgpu-instance-ceramic", baseColor: [0.92, 0.95, 0.9, 1], metallic: 0, roughness: 0.18 })
];
const instanceCount = 160;

void startWebGPUShowcase({
  appId: "wow-webgpu-instancing",
  title: "A3D WebGPU Instancing",
  subtitle: "Repeated geometry workload for WebGPU diagnostics, native submissions, draw calls, and deterministic route-health screenshots.",
  labels: {
    concept: "batched workload",
    workload: `${instanceCount} native WebGPU cubes`,
    api: "Renderer + repeated RenderItem submission"
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
        const items: RenderItem[] = [];
        const columns = 20;
        for (let index = 0; index < instanceCount; index += 1) {
          const x = (index % columns) - (columns - 1) / 2;
          const y = Math.floor(index / columns) - 3.5;
          const wave = Math.sin(timeSeconds * 1.5 + index * 0.33) * 0.28;
          const depth = Math.cos(timeSeconds * 0.7 + index * 0.19) * 0.16;
          items.push({
            label: `webgpu-instance-${index}`,
            geometry: cube,
            material: materials[index % materials.length]!,
            modelMatrix: composeMat4([x * 0.34, y * 0.34, wave + depth], rotationYQuat(timeSeconds + index * 0.08), [1, 1, 1])
          });
        }
        const diagnostics = await renderer.renderAsync({
          renderItems: items,
          cameraPolicy: "auto-frame",
          cameraFrameBounds: simpleBounds(2.35),
          cameraFrameOptions: { paddingRatio: 0.02, yawRadians: -0.24, pitchRadians: -0.06 },
          environmentLighting: lighting.environmentLighting,
          shadow: false,
          postprocess: false
        });
        return {
          diagnostics,
          comparison: "WebGL2 comparison metrics pending visual-parity report",
          fields: {
            "Instance count": instanceCount,
            "Workload": "deterministic repeated geometry"
          }
        };
      }
    };
  }
});
