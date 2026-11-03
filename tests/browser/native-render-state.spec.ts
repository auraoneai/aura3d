import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Backend = "webgl2" | "webgpu";
type Color = number[];
type Result = {
  unsupported?: string;
  backend?: string;
  adapter?: unknown;
  diagnostics?: { drawCalls: number; lastError?: string | null; nativeSubmissions?: number };
  samples?: Record<string, Color>;
  disposed?: boolean;
};

/**
 * The two device implementations draw the same small, independently authored
 * geometry into real color/depth/stencil targets. Each case starts with a fresh
 * target: a stale depth, stencil, color mask or pipeline cannot make a later
 * observation pass. The WebGPU path must use native texture readback.
 * Execution belongs to Phase B, after the global code-complete gate.
 */
test.describe("native draw-state pixels", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`${backend} preserves draw state and separate instance streams`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await openPage(page, server.origin);
      const result = await renderStateCases(page, backend);
      if (result.unsupported) {
        test.skip(true, result.unsupported);
        return;
      }
      await testInfo.attach(`${backend}-draw-state`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
      expect(result.backend).toBe(backend);
      expect(result.diagnostics?.drawCalls).toBeGreaterThan(0);
      expect(result.diagnostics?.lastError ?? null).toBeNull();
      if (backend === "webgpu") expect(result.diagnostics?.nativeSubmissions).toBeGreaterThan(0);
      expect(result.disposed).toBe(true);
      expect(errors).toEqual([]);

      const samples = result.samples;
      if (!samples) throw new Error("Draw-state workload returned no pixel samples");
      const near = (name: string, expected: readonly number[], tolerance = 4): void => {
        const actual = samples[name];
        expect(actual, `missing sample ${name}`).toBeDefined();
        expect(actual).toHaveLength(4);
        expected.forEach((value, index) => expect(Math.abs(actual![index]! - value), `${name} channel ${index}`).toBeLessThanOrEqual(tolerance));
      };
      const black = [0, 0, 0, 255], red = [255, 0, 0, 255], green = [0, 255, 0, 255];
      near("cullNone", red);
      near("cullBack", red);
      near("cullFront", black);
      near("cullOppositeWinding", black);
      near("depthLess", red);
      near("depthGreater", green);
      near("depthEqual", green);
      near("offsetDisabled", red);
      near("offsetNegative", green);
      near("stencilInside", green);
      near("stencilOutside", black);
      near("colorMask", [255, 102, 153, 255]);
      // src * srcAlpha + destination, with an independently specified alpha equation.
      near("customBlend", [153, 128, 204, 128], 5);
      near("instanceLeft", red);
      near("instanceRight", [0, 0, 255, 255]);
      near("instanceLeftAfterUpdate", red);
      near("instanceRightAfterUpdate", green);
      near("instanceBackground", black);
      // Unconverted integer shader input (uint32 instance stream -> uint palette index).
      near("integerLeft", green);
      near("integerRight", [0, 0, 255, 255]);
      near("integerBackground", black);
    });
  }
});

async function openPage(page: Page, origin: string): Promise<void> {
  const url = `${origin}/__native_render_state__.html`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto(url);
}

async function renderStateCases(page: Page, backend: Backend): Promise<Result> {
  return page.evaluate(async (selectedBackend) => {
    // These source barrels correspond to the public rendering and WebGPU entries.
    const paths = ["/packages/rendering/src/index.ts", "/packages/rendering/src/webgpu.ts"];
    const [rendering, gpuModule] = await Promise.all(paths.map((path) => import(path)));
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
    const { VertexBuffer, VertexFormat } = rendering;
    const marker = "native-state-fixture";
    const solid = new rendering.ShaderModule({ label: marker, marker,
      vertex: `#version 300 es
// native-state-fixture
layout(location=0) in vec3 a_position;
uniform float u_z;
void main() { gl_Position=vec4(a_position.xy,u_z,1.0); }`,
      fragment: `#version 300 es
// native-state-fixture
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor=u_color; }`,
      portableBindings: [{ name: "u_z", kind: "float" }, { name: "u_color", kind: "vec4" }],
      webgpu: { vertex: `// native-state-fixture
/* @aura3d-bindings */
@vertex fn main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
 return vec4<f32>(position.xy,(aura.u_z+1.0)*0.5,1.0);
}`,
        fragment: `// native-state-fixture
/* @aura3d-bindings */
@fragment fn main() -> @location(0) vec4<f32> { return aura.u_color; }` }
    });
    const instanceFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0, shaderLocation: 0 },
      { semantic: "custom:offset", shaderName: "a_offset", components: 2, offset: 0, bufferSlot: 1, shaderLocation: 1 },
      { semantic: "custom:instanceColor", shaderName: "a_instanceColor", components: 4, offset: 8, type: "uint8", normalized: true, bufferSlot: 1, shaderLocation: 2 }
    ], 12, [{ slot: 1, stride: 12, stepMode: "instance" }]);
    const instanced = new rendering.ShaderModule({ label: "native-state-instances", marker: "native-state-instances",
      vertex: `#version 300 es
// native-state-instances
layout(location=0) in vec3 a_position;
layout(location=1) in vec2 a_offset;
layout(location=2) in vec4 a_instanceColor;
out vec4 color;
void main() { gl_Position=vec4(a_position.xy+a_offset,0.0,1.0); color=a_instanceColor; }`,
      fragment: `#version 300 es
// native-state-instances
precision highp float;
in vec4 color;
out vec4 outColor;
void main() { outColor=color; }`,
      webgpu: { vertex: `// native-state-instances
struct Output { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32> };
@vertex fn main(@location(0) position: vec3<f32>, @location(1) offset: vec2<f32>, @location(2) color: vec4<f32>) -> Output {
 var out: Output; out.position=vec4<f32>(position.xy+offset,0.5,1.0); out.color=color; return out;
}`,
        fragment: `// native-state-instances
@fragment fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> { return color; }` }
    });
    // An integer instance stream read as `uint` (WebGL2 vertexAttribIPointer,
    // WebGPU `uint32`): a float conversion would select the wrong palette entry.
    const integerFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0, shaderLocation: 0 },
      { semantic: "custom:paletteId", shaderName: "a_paletteId", components: 1, offset: 0, type: "uint32", integer: true, bufferSlot: 1, shaderLocation: 1 }
    ], 12, [{ slot: 1, stride: 4, stepMode: "instance" }]);
    const integerShader = new rendering.ShaderModule({ label: "native-state-integer", marker: "native-state-integer",
      vertex: `#version 300 es
// native-state-integer
layout(location=0) in vec3 a_position;
layout(location=1) in uint a_paletteId;
flat out uint paletteId;
void main() { gl_Position=vec4(a_position.xy+vec2(gl_InstanceID==0?-0.5:0.5,0.0),0.0,1.0); paletteId=a_paletteId; }`,
      fragment: `#version 300 es
// native-state-integer
precision highp float;
flat in uint paletteId;
out vec4 outColor;
void main() {
  vec4 palette[4]=vec4[4](vec4(1,0,1,1),vec4(1,0,0,1),vec4(0,1,0,1),vec4(0,0,1,1));
  outColor=paletteId<4u?palette[paletteId]:vec4(1,1,1,1);
}`,
      webgpu: { vertex: `// native-state-integer
struct Output { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) paletteId: u32 };
@vertex fn main(@builtin(instance_index) instance: u32, @location(0) position: vec3<f32>, @location(1) paletteId: u32) -> Output {
 var out: Output; out.position=vec4<f32>(position.xy+vec2<f32>(select(0.5,-0.5,instance==0u),0.0),0.5,1.0); out.paletteId=paletteId; return out;
}`,
        fragment: `// native-state-integer
@fragment fn main(@location(0) @interpolate(flat) paletteId: u32) -> @location(0) vec4<f32> {
 var palette=array<vec4<f32>,4>(vec4<f32>(1.0,0.0,1.0,1.0),vec4<f32>(1.0,0.0,0.0,1.0),vec4<f32>(0.0,1.0,0.0,1.0),vec4<f32>(0.0,0.0,1.0,1.0));
 if (paletteId<4u) { return palette[paletteId]; }
 return vec4<f32>(1.0);
}` }
    });
    const integerTriangle = new VertexBuffer(integerFormat, 3);
    [[-0.2, -0.3, 0], [0.2, -0.3, 0], [0, 0.3, 0]].forEach((value, i) => integerTriangle.setAttribute(i, "position", value));
    const paletteIds = new VertexBuffer(integerFormat, 2, 1);
    paletteIds.setAttribute(0, "custom:paletteId", [2]);
    paletteIds.setAttribute(1, "custom:paletteId", [3]);
    const triangle = new VertexBuffer(VertexFormat.P3, 3);
    [[-1, -1, 0], [3, -1, 0], [-1, 3, 0]].forEach((value, i) => triangle.setAttribute(i, "position", value));
    const smallTriangle = new VertexBuffer(instanceFormat, 3);
    [[-0.2, -0.3, 0], [0.2, -0.3, 0], [0, 0.3, 0]].forEach((value, i) => smallTriangle.setAttribute(i, "position", value));
    const instances = new VertexBuffer(instanceFormat, 2, 1);
    instances.setAttribute(0, "custom:offset", [-0.5, 0]);
    instances.setAttribute(1, "custom:offset", [0.5, 0]);
    instances.setAttribute(0, "custom:instanceColor", [255, 0, 0, 255]);
    instances.setAttribute(1, "custom:instanceColor", [0, 0, 255, 255]);
    const pipelines: Array<{ dispose(): void }> = [];
    const targets: Array<{ dispose(): void; disposed: boolean }> = [];
    const samples: Record<string, number[]> = {};
    const base = { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "none", blend: false, colorWrite: [true, true, true, true] };
    const draw = (state: Record<string, unknown>, color: number[], z = 0): void => {
      const pipeline = new rendering.RenderPipeline({ shader: solid.compile(device), vertexFormat: VertexFormat.P3, requiredAttributes: [] });
      pipelines.push(pipeline);
      device.draw({ ...pipeline.createDrawCommand({ vertexBuffer: triangle.upload(device), vertexCount: 3,
        uniforms: new Map<string, number | number[]>([["u_z", z], ["u_color", color]]) }), renderState: { ...base, ...state } });
    };
    const target = (): void => {
      const next = device.createRenderTarget({ width: size, height: size, format: "rgba8", depth: true, label: "native-state-case" });
      targets.push(next);
      device.setRenderTarget(next);
      device.setViewport(0, 0, size, size);
      // Clear honors the current GL color mask. Restore the complete draw state
      // before clearing so this case does not inherit the previous case's mask.
      draw({ stencil: null, scissor: null }, [0, 0, 0, 1]);
      device.clear([0, 0, 0, 1]);
    };
    const read = async (name: string, x = 32, y = 32): Promise<void> => {
      const pixels = selectedBackend === "webgpu" ? await device.readPixelsAsync(x, y, 1, 1) : device.readPixels(x, y, 1, 1);
      samples[name] = Array.from(pixels as Uint8Array);
    };
    const red = [1, 0, 0, 1], green = [0, 1, 0, 1];
    let frameActive = false;
    let result: Result | undefined;
    device.beginFrame(size, size);
    frameActive = true;
    try {
      for (const [name, state] of [
        ["cullNone", { cullMode: "none" }], ["cullBack", { cullMode: "back", frontFace: "ccw" }],
        ["cullFront", { cullMode: "front", frontFace: "ccw" }], ["cullOppositeWinding", { cullMode: "back", frontFace: "cw" }]
      ] as const) { target(); draw(state, red); await read(name); }
      for (const [name, compare, z] of [["depthLess", "less", 0.5], ["depthGreater", "greater", 0.5], ["depthEqual", "equal", -0.5]] as const) {
        target(); draw({}, red, -0.5); draw({ depthCompareV2: compare }, green, z); await read(name);
      }
      target(); draw({}, red); draw({ depthCompareV2: "less" }, green); await read("offsetDisabled");
      target(); draw({}, red); draw({ depthCompareV2: "less", polygonOffset: { factor: 0, units: -1024 } }, green); await read("offsetNegative");
      target();
      draw({ depthTest: false, depthWrite: false, colorWrite: [false, false, false, false], scissor: { x: 0, y: 0, width: 32, height: 64 },
        stencil: { compare: "always", reference: 3, depthPass: "replace" } }, red);
      draw({ depthTest: false, depthWrite: false, stencil: { compare: "equal", reference: 3, depthPass: "keep" } }, green);
      await read("stencilInside", 16, 32); await read("stencilOutside", 48, 32);
      target(); device.clear([0.2, 0.4, 0.6, 1]);
      draw({ depthTest: false, depthWrite: false, colorWrite: [true, false, false, false] }, [1, 0, 0, 0.25]); await read("colorMask");
      target(); device.clear([0.2, 0.4, 0.6, 1]);
      draw({ depthTest: false, depthWrite: false, blendMode: { kind: "custom",
        color: { equation: "add", src: "src-alpha", dst: "one" }, alpha: { equation: "add", src: "one", dst: "zero" } } }, [0.8, 0.2, 0.4, 0.5]);
      await read("customBlend");
      const instancePipeline = new rendering.RenderPipeline({ shader: instanced.compile(device), vertexFormat: instanceFormat,
        requiredAttributes: [], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } });
      pipelines.push(instancePipeline);
      const drawInstances = (): void => device.draw(instancePipeline.createDrawCommand({ vertexBuffer: smallTriangle.upload(device),
        vertexBuffers: [smallTriangle.upload(device), instances.upload(device)], vertexCount: 3, instanceCount: 2 }));
      target(); drawInstances(); await read("instanceLeft", 16, 32); await read("instanceRight", 48, 32); await read("instanceBackground", 32, 32);
      instances.setAttribute(1, "custom:instanceColor", [0, 255, 0, 255]);
      target(); drawInstances(); await read("instanceLeftAfterUpdate", 16, 32); await read("instanceRightAfterUpdate", 48, 32);
      const integerPipeline = new rendering.RenderPipeline({ shader: integerShader.compile(device), vertexFormat: integerFormat,
        requiredAttributes: [], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } });
      pipelines.push(integerPipeline);
      target();
      device.draw(integerPipeline.createDrawCommand({ vertexBuffer: integerTriangle.upload(device),
        vertexBuffers: [integerTriangle.upload(device), paletteIds.upload(device)], vertexCount: 3, instanceCount: 2 }));
      await read("integerLeft", 16, 32); await read("integerRight", 48, 32); await read("integerBackground", 32, 32);
      device.endFrame();
      frameActive = false;
      const diagnostics = device.getDiagnostics();
      result = { backend: device.kind, adapter: device.info, diagnostics: { drawCalls: diagnostics.drawCalls, lastError: diagnostics.lastError ?? null,
        nativeSubmissions: diagnostics.nativeSubmissions }, samples, disposed: false };
    } finally {
      // Readback has completed before retiring borrowed resources.
      if (frameActive) device.endFrame();
      for (const pipeline of pipelines) pipeline.dispose();
      solid.dispose(); instanced.dispose(); triangle.dispose(); smallTriangle.dispose(); instances.dispose();
      integerShader.dispose(); integerTriangle.dispose(); paletteIds.dispose();
      for (const item of targets) item.dispose();
      device.dispose(); canvas.remove();
      if (result) result.disposed = device.disposed && targets.every((item) => item.disposed) && !canvas.isConnected;
    }
    if (!result) throw new Error("Draw-state workload did not return a result");
    return result;
  }, backend);
}
