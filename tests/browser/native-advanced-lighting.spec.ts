import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame } from "./root-temporal-evidence";

type Backend = "webgl2" | "webgpu";
type Frame = { id: string; pixels: number[] };
type LightingResult = {
  unsupported?: string;
  backend?: string;
  adapter?: unknown;
  execution?: { implementation: string; fallbackReason: string | null };
  size?: number;
  frames?: Frame[];
  diagnostics?: { drawCalls: number; lastError: string | null; nativeSubmissions?: number };
  revisions?: number[];
  coveredTexels?: number;
  voxelSample?: number[];
  disposed?: boolean;
};

/**
 * These optional utilities expose textures for an explicit consumer; they do
 * not automatically attach to a scene. This independently authored consumer
 * draws a real Lambertian calibration card. It evaluates a constant SH probe
 * and samples completed baked irradiance with exact texel loads. Voxel cone
 * tracing is the documented CPU implementation, fed into the real baker; the
 * spec does not claim realtime GPU voxel tracing or built-in scene binding.
 */
test.describe("native advanced lighting resources", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`${backend} renders updated probes and direct/voxel lightmap bakes`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await openPage(page, server.origin);
      const result = await renderLighting(page, backend);
      if (result.unsupported) { test.skip(true, result.unsupported); return; }
      expect(result.backend).toBe(backend);
      expect(result.execution?.implementation).toBe("cpu");
      expect(result.execution?.fallbackReason).toMatch(/CPU/);
      expect(result.diagnostics?.drawCalls).toBeGreaterThan(0);
      expect(result.diagnostics?.lastError).toBeNull();
      if (backend === "webgpu") expect(result.diagnostics?.nativeSubmissions).toBeGreaterThan(0);
      expect(result.revisions).toEqual([0, 1, 2, 3]);
      expect(result.coveredTexels).toBeGreaterThan(0);
      expect(result.voxelSample?.[1]).toBeGreaterThan(0);
      expect(result.disposed).toBe(true);
      expect(errors).toEqual([]);
      const size = result.size;
      if (!size || !result.frames) throw new Error("Advanced-lighting workload returned no frames");
      const frames = new Map(result.frames.map((frame) => [frame.id, frame]));
      const get = (id: string): Frame => {
        const frame = frames.get(id);
        if (!frame) throw new Error(`Missing advanced-lighting frame ${id}`);
        expect(frame.pixels).toHaveLength(size * size * 4);
        return frame;
      };
      for (const frame of result.frames) {
        const artifact = retainTemporalFrame(testInfo.outputPath(`${backend}-${frame.id}.png`), size, size, frame.pixels,
          backend === "webgl2" ? "bottom-left" : "top-left");
        await testInfo.attach(`${backend}-${frame.id}`, { path: artifact.path, contentType: "image/png" });
      }
      const probeDark = get("probe-dark"), probeRed = get("probe-red"), probeGreen = get("probe-green"), probeCleared = get("probe-cleared");
      const bakeDark = get("bake-dark"), bakeDirect = get("bake-direct"), bakeVoxel = get("bake-voxel"), bakeVoxelCleared = get("bake-voxel-cleared");
      const comparisons = { probe: difference(probeDark, probeRed), probeUpdate: difference(probeRed, probeGreen),
        probeClear: difference(probeDark, probeCleared), directBake: difference(bakeDark, bakeDirect),
        voxelBake: difference(bakeDark, bakeVoxel), voxelClear: difference(bakeDark, bakeVoxelCleared) };
      await testInfo.attach(`${backend}-advanced-lighting-report`, { body: JSON.stringify({ backend, adapter: result.adapter,
        consumer: "explicit Lambertian calibration shader", voxelExecution: result.execution, voxelSample: result.voxelSample, comparisons }, null, 2), contentType: "application/json" });
      for (const name of ["probe", "probeUpdate", "directBake", "voxelBake"] as const) {
        expect(comparisons[name].changedPixels, name).toBeGreaterThan(300);
        expect(comparisons[name].cornerDelta, name).toBe(0);
      }
      expect(comparisons.probeClear.changedPixels).toBe(0);
      expect(comparisons.voxelClear.changedPixels).toBe(0);
      expect(center(probeRed, size)[0]!).toBeGreaterThan(center(probeRed, size)[1]! + 10);
      expect(center(probeGreen, size)[1]!).toBeGreaterThan(center(probeGreen, size)[0]! + 10);
      expect(center(bakeDirect, size)[0]!).toBeGreaterThan(center(bakeDark, size)[0]! + 10);
      expect(center(bakeVoxel, size)[1]!).toBeGreaterThan(center(bakeDark, size)[1]! + 3);
    });
  }
});

async function openPage(page: Page, origin: string): Promise<void> {
  const url = `${origin}/__native_advanced_lighting__.html`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto(url);
}

async function renderLighting(page: Page, backend: Backend): Promise<LightingResult> {
  return page.evaluate(async (selectedBackend) => {
    // These source barrels correspond to the public lighting, rendering and WebGPU entries.
    const paths = ["/packages/rendering/src/lighting/index.ts", "/packages/rendering/src/index.ts", "/packages/rendering/src/webgpu.ts"];
    const [lighting, rendering, gpuModule] = await Promise.all(paths.map((path) => import(path)));
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = canvas.height = size;
    document.body.append(canvas);
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (selectedBackend === "webgpu" && !gpu) { canvas.remove(); return { unsupported: "navigator.gpu is unavailable" }; }
    const adapter = selectedBackend === "webgpu" ? await gpu!.requestAdapter() : null;
    if (selectedBackend === "webgpu" && !adapter) { canvas.remove(); return { unsupported: "WebGPU adapter unavailable" }; }
    if (selectedBackend === "webgl2" && !canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })) {
      canvas.remove(); return { unsupported: "WebGL2 context unavailable" };
    }
    const device = selectedBackend === "webgl2"
      ? rendering.WebGL2Device.create({ canvas, antialias: false, preserveDrawingBuffer: true, errorCheckMode: "strict" })
      : await gpuModule.WebGPUDevice.create({ gpu, adapter, canvas, requireNativeRendering: true });
    const grid = new lighting.NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1], backend: selectedBackend });
    const volume = new lighting.VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [4, 4, 4] }, quality: "low", resolution: 4, backend: selectedBackend });
    const generated = { width: 6, height: 6, gutter: 1, texelDensity: 4, destination: "uv1s",
      charts: [{ contentBounds: { x: 1, y: 1, width: 4, height: 4 }, triangles: [0, 1] }],
      geometry: { positions: [[0, 1.1, 1.1], [0, 1.9, 1.1], [0, 1.9, 1.9], [0, 1.1, 1.9]],
        normals: [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]],
        uv1s: new Float32Array([1 / 6, 1 / 6, 5 / 6, 1 / 6, 5 / 6, 5 / 6, 1 / 6, 5 / 6]), indices: [0, 1, 2, 0, 2, 3] } };
    const textures: Array<{ dispose(): void; disposed: boolean }> = [];
    const bake = (lights: unknown[], indirect?: unknown): { texture: unknown; covered: number } => {
      const task = new lighting.NativeLightmapBake(lighting.bakeOptionsFromUVAtlas(generated, { lights, ...(indirect ? { indirect } : {}) }));
      let steps = 0;
      while (task.status !== "complete") {
        const step = task.step(8);
        if (step.status === "cancelled" || step.status === "failed" || ++steps > 1000) throw new Error(`Lightmap bake failed to complete: ${step.status}`);
      }
      const output = task.createRenderData();
      textures.push(output.texture);
      return { texture: output.texture, covered: Array.from(task.result().coverage as Uint8Array).filter((value) => value === 1).length };
    };
    const shader = new rendering.ShaderModule({ label: "native-lighting-consumer", marker: "native-lighting-consumer",
      vertex: `#version 300 es
// native-lighting-consumer
layout(location=0) in vec3 a_position;
out vec2 uv;
void main() { gl_Position=vec4(a_position,1.0); uv=a_position.xy/1.6+0.5; }`,
      fragment: `#version 300 es
// native-lighting-consumer
precision highp float;
uniform sampler2D u_light;
uniform float u_probe;
in vec2 uv;
out vec4 outColor;
void main() {
 ivec2 coord = u_probe > 0.5 ? ivec2(0,0) : ivec2(clamp(floor(uv*4.0)+1.0,1.0,4.0));
 vec3 value=texelFetch(u_light,coord,0).rgb;
 outColor=vec4(value*(u_probe > 0.5 ? 0.2820947918 : 0.3183098862),1.0);
}`,
      portableBindings: [{ name: "u_light", kind: "texture2d" }, { name: "u_probe", kind: "float" }],
      webgpu: { vertex: `// native-lighting-consumer
/* @aura3d-bindings */
struct Output { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn main(@location(0) position: vec3<f32>) -> Output {
 var out: Output; out.position=vec4<f32>(position.xy,0.5,1.0); out.uv=position.xy/1.6+vec2<f32>(0.5); return out;
}`,
        fragment: `// native-lighting-consumer
/* @aura3d-bindings */
@fragment fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
 var coord=vec2<i32>(clamp(floor(uv*4.0)+vec2<f32>(1.0),vec2<f32>(1.0),vec2<f32>(4.0)));
 var scale=0.3183098862;
 if(aura.u_probe>0.5) { coord=vec2<i32>(0); scale=0.2820947918; }
 return vec4<f32>(textureLoad(u_lightTexture,coord,0).rgb*scale,1.0);
}` }
    });
    const vertices = new rendering.VertexBuffer(rendering.VertexFormat.P3, 6);
    [[-0.8,-0.8,0], [0.8,-0.8,0], [0.8,0.8,0], [-0.8,-0.8,0], [0.8,0.8,0], [-0.8,0.8,0]]
      .forEach((position, i) => vertices.setAttribute(i, "position", position));
    const pipeline = new rendering.RenderPipeline({ shader: shader.compile(device), vertexFormat: rendering.VertexFormat.P3, requiredAttributes: [],
      renderState: { depthTest: false, depthWrite: false, cullMode: "none" } });
    const target = device.createRenderTarget({ width: size, height: size, format: "rgba8", depth: false, label: "native-lighting-consumer" });
    const nearest = new rendering.Sampler({ minFilter: "nearest", magFilter: "nearest" });
    const frames: Frame[] = [];
    const revisions = [grid.revision];
    const capture = async (id: string, texture: unknown, probe: boolean): Promise<void> => {
      device.setRenderTarget(target); device.setViewport(0, 0, size, size); device.clear([0, 0, 0, 1]);
      const binding = new rendering.TextureBinding({ name: "u_light", texture, sampler: nearest, required: true });
      device.draw(pipeline.createDrawCommand({ vertexBuffer: vertices.upload(device), vertexCount: 6,
        uniforms: new Map<string, unknown>([["u_light", binding], ["u_probe", probe ? 1 : 0]]) }));
      const pixels = selectedBackend === "webgpu" ? await device.readPixelsAsync(0, 0, size, size) : device.readPixels(0, 0, size, size);
      frames.push({ id, pixels: Array.from(pixels as Uint8Array) });
    };
    let result: LightingResult | undefined;
    let frameActive = false;
    device.beginFrame(size, size); frameActive = true;
    try {
      await capture("probe-dark", grid.renderData().texture, true);
      grid.setProbeIrradiance(0, 0, 0, [0.6, 0.08, 0.04]); revisions.push(grid.revision);
      await capture("probe-red", grid.renderData().texture, true);
      grid.setProbeIrradiance(0, 0, 0, [0.04, 0.6, 0.08]); revisions.push(grid.revision);
      await capture("probe-green", grid.renderData().texture, true);
      grid.setProbeIrradiance(0, 0, 0, [0, 0, 0]); revisions.push(grid.revision);
      await capture("probe-cleared", grid.renderData().texture, true);
      const dark = bake([]); await capture("bake-dark", dark.texture, false);
      const direct = bake([{ type: "ambient", color: [0.6, 0.2, 0.1], intensity: 1 }]); await capture("bake-direct", direct.texture, false);
      volume.updateVoxel([1, 1, 1], { radiance: [0.02, 0.7, 0.04], opacity: 1 });
      const voxelSample = volume.sampleIndirect([0, 1.5, 1.5], [1, 0, 0]);
      const indirect = bake([], lighting.bakeIndirectFromVoxel(volume)); await capture("bake-voxel", indirect.texture, false);
      volume.clear();
      const indirectCleared = bake([], lighting.bakeIndirectFromVoxel(volume)); await capture("bake-voxel-cleared", indirectCleared.texture, false);
      device.endFrame(); frameActive = false;
      const diagnostics = device.getDiagnostics();
      result = { backend: device.kind, adapter: device.info, execution: volume.execution, size, frames, revisions, coveredTexels: direct.covered,
        voxelSample, diagnostics: { drawCalls: diagnostics.drawCalls, lastError: diagnostics.lastError ?? null, nativeSubmissions: diagnostics.nativeSubmissions }, disposed: false };
    } finally {
      if (frameActive) device.endFrame();
      const probeTexture = grid.renderData().texture;
      pipeline.dispose(); shader.dispose(); vertices.dispose();
      for (const texture of textures) texture.dispose();
      grid.dispose(); volume.dispose(); target.dispose(); device.dispose(); canvas.remove();
      if (result) result.disposed = probeTexture.disposed && textures.every((texture) => texture.disposed) && target.disposed && device.disposed && !canvas.isConnected;
    }
    if (!result) throw new Error("Advanced-lighting workload did not return a result");
    return result;
  }, backend);
}

function difference(a: Frame, b: Frame): { changedPixels: number; cornerDelta: number } {
  expect(a.pixels).toHaveLength(b.pixels.length);
  let changedPixels = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    const delta = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(a.pixels[i + channel]! - b.pixels[i + channel]!), 0);
    if (delta > 4) changedPixels += 1;
  }
  const cornerDelta = [0, 1, 2, 3].reduce((sum, channel) => sum + Math.abs(a.pixels[channel]! - b.pixels[channel]!), 0);
  return { changedPixels, cornerDelta };
}

function center(frame: Frame, size: number): number[] {
  const index = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
  return frame.pixels.slice(index, index + 4);
}
