import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, primitives, renderer, scene } from "../../../packages/engine/src/public/index";
import { readActiveOutputColorSpace } from "../../../packages/engine/src/agent-api/app/outputColorDiagnostics";
import { createRendererDiagnosticReport } from "../../../packages/engine/src/agent-api/rendererDiagnostics";
import type { AuraRendererRuntimeObservation } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderDevice, type RenderOutputColorSpaceNegotiation } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGPUDevice, type WebGPUCanvasConfigurationLike, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

const p3: RenderOutputColorSpaceNegotiation = {
  requested: "display-p3", active: "display-p3", supported: ["srgb", "display-p3"]
};
const fallback: RenderOutputColorSpaceNegotiation = {
  requested: "display-p3", active: "srgb", supported: ["srgb"], fallbackReason: "P3 unavailable"
};
const postprocess: AuraRendererRuntimeObservation["postprocess"] = {
  renderPass: false, outputPass: false, bloomPass: false, ambientOcclusionPass: false,
  contactOcclusionReceiver: false, pixelBacked: false, actualPasses: [], fallbackPasses: [], executionMode: "unknown"
};
const context = (value: unknown) => value as WebGL2RenderingContext;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public output color-space diagnostics", () => {
  it("keeps scene plans and headless apps unknown, even for an authored P3 request", () => {
    const input = scene().add(primitives.box());
    const plan = renderer.diagnostics(input, { output: { outputColorSpace: "display-p3" } });
    expect(plan.outputColorSpace).toBe("unknown");
    expect(plan.colorManagement.outputColorSpace).toBe("srgb"); // the default preset, not the active surface
    expect(plan.colorManagement.notes.join(" ")).toContain("mounted output is reported separately");
    const app = createAuraApp(null, { scene: input, autoStart: false, output: { outputColorSpace: "display-p3" } });
    try { expect(app.diagnostics().renderer?.outputColorSpace).toBe("unknown"); }
    finally { app.dispose(); }
  });

  it("publishes a mounted observation, never a scene-plan or missing observation", () => {
    const snapshot = scene().toJSON();
    const observation: AuraRendererRuntimeObservation = { mounted: true, backend: "production-runtime", postprocess };
    expect(createRendererDiagnosticReport(snapshot, observation).outputColorSpace).toBe("unknown");
    expect(createRendererDiagnosticReport(snapshot, { ...observation, mounted: false, outputColorSpace: "display-p3" }).outputColorSpace).toBe("unknown");
    expect(createRendererDiagnosticReport(snapshot, { ...observation, outputColorSpace: "display-p3" }).outputColorSpace).toBe("display-p3");
    expect(createRendererDiagnosticReport(snapshot, { ...observation, outputColorSpace: "srgb" }).outputColorSpace).toBe("srgb");
  });

  it("reads a verified WebGL2 device negotiation without changing the drawing buffer", () => {
    // A context-shaped double: this exercises source negotiation, not a browser or GPU.
    let selected = "srgb";
    let writes = 0;
    const values = {
      NO_ERROR: 0, getError: () => 0, getParameter: () => 8, getExtension: () => null,
      get drawingBufferColorSpace() { return selected; },
      set drawingBufferColorSpace(value: string) { selected = value; writes += 1; }
    };
    const gl = new Proxy(values, { get(target, property) {
      if (Reflect.has(target, property)) return Reflect.get(target, property);
      if (/^[A-Z0-9_]+$/.test(String(property))) return 1;
      if (String(property).startsWith("create")) return () => ({});
      return () => undefined;
    } });
    const canvas = {
      getContext: () => gl, addEventListener() {}, removeEventListener() {}
    } as unknown as HTMLCanvasElement;
    const device = WebGL2Device.create({ canvas });
    try {
      expect(readActiveOutputColorSpace(device, () => context(gl))).toBe("unknown");
      device.negotiateOutputColorSpace("display-p3");
      const afterNegotiation = writes;
      expect(readActiveOutputColorSpace(device, () => context(gl))).toBe("display-p3");
      expect(writes).toBe(afterNegotiation);
      selected = "srgb"; // another owner changed the context after the negotiation
      expect(readActiveOutputColorSpace(device, () => context(gl))).toBe("unknown");
      device.negotiateSrgbOutputFallback("display-p3", "tail requires sRGB");
      expect(readActiveOutputColorSpace(device, () => context(gl))).toBe("srgb");
      expect(readActiveOutputColorSpace(device, () => context({}))).toBe("unknown");
    } finally { device.dispose(); }
  });

  it("rejects missing, inconsistent, throwing, lost, and disposed observations", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    const inspect = vi.spyOn(device, "getOutputColorSpaceNegotiation");
    const negotiate = vi.spyOn(device, "negotiateOutputColorSpace");
    const gl = () => context({ drawingBufferColorSpace: "display-p3" });
    expect(readActiveOutputColorSpace(device, gl)).toBe("unknown");
    for (const invalid of [
      { ...p3, supported: ["srgb"] },
      { ...p3, requested: "invalid" },
      { ...p3, active: "invalid" },
      { ...fallback, fallbackReason: undefined },
      { ...fallback, fallbackReason: " " },
      { ...p3, supported: null }
    ]) {
      inspect.mockReturnValue(invalid as unknown as RenderOutputColorSpaceNegotiation);
      expect(readActiveOutputColorSpace(device, gl)).toBe("unknown");
    }
    inspect.mockReturnValue(p3);
    expect(readActiveOutputColorSpace(device, () => { throw new Error("unavailable"); })).toBe("unknown");
    device.contextLost = true;
    expect(readActiveOutputColorSpace(device, gl)).toBe("unknown");
    device.contextLost = false;
    inspect.mockImplementation(() => { throw new Error("superseded"); });
    expect(readActiveOutputColorSpace(device, gl)).toBe("unknown");
    inspect.mockReturnValue(p3);
    device.dispose();
    expect(readActiveOutputColorSpace(device, gl)).toBe("unknown");
    expect(negotiate).not.toHaveBeenCalled();
  });

  it("uses the WebGPU device's own inspection without asking for a WebGL context", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const inspect = vi.spyOn(device, "getOutputColorSpaceNegotiation").mockReturnValue(p3);
    const webgl = vi.fn(() => { throw new Error("not a WebGL surface"); });
    expect(readActiveOutputColorSpace(device, webgl)).toBe("unknown");
    Object.defineProperty(device, "info", { value: {
      ...device.info, capabilities: [...(device.info.capabilities ?? []), "canvas-surface"]
    } });
    expect(readActiveOutputColorSpace(device, webgl)).toBe("display-p3");
    inspect.mockReturnValue(fallback);
    expect(readActiveOutputColorSpace(device, webgl)).toBe("srgb");
    inspect.mockImplementation(() => { throw new Error("canvas configuration changed"); });
    expect(readActiveOutputColorSpace(device, webgl)).toBe("unknown");
    expect(webgl).not.toHaveBeenCalled();
    device.dispose();
  });

  it("follows a WebGPU device's synthetic canvas configuration and fallback without configuring it", async () => {
    // This is a configuration recorder, not an actual browser, adapter, or GPU.
    const native = {
      features: new Set<string>(),
      limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
      queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} },
      createBuffer: () => ({ destroy() {} }), createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: () => ({}), createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}),
      createCommandEncoder: () => ({ finish: () => ({}) }), destroy() {}
    } as unknown as WebGPUDeviceLike;
    const state: { configuration: WebGPUCanvasConfigurationLike | null; rejectP3: boolean; writes: number } = {
      configuration: null, rejectP3: false, writes: 0
    };
    const canvasContext = {
      configure(configuration: WebGPUCanvasConfigurationLike) {
        state.writes += 1;
        if (state.rejectP3 && configuration.colorSpace === "display-p3") throw new Error("unavailable");
        state.configuration = configuration;
      },
      getConfiguration: () => state.configuration,
      getCurrentTexture: () => ({ createView: () => ({}) }),
      unconfigure() { state.configuration = null; }
    };
    const device = await WebGPUDevice.create({
      adapter: { requestDevice: async () => native }, device: native,
      canvas: { getContext: () => canvasContext } as unknown as HTMLCanvasElement
    });
    const webgl = vi.fn(() => null);
    try {
      expect(readActiveOutputColorSpace(device, webgl)).toBe("srgb");
      expect(device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      let writes = state.writes;
      expect(readActiveOutputColorSpace(device, webgl)).toBe("display-p3");
      expect(state.writes).toBe(writes);
      device.negotiateOutputColorSpace("srgb");
      state.rejectP3 = true;
      expect(device.negotiateOutputColorSpace("display-p3")).toMatchObject({ active: "srgb", fallbackReason: expect.any(String) });
      writes = state.writes;
      expect(readActiveOutputColorSpace(device, webgl)).toBe("srgb");
      expect(state.writes).toBe(writes);
      state.rejectP3 = false;
      device.negotiateOutputColorSpace("display-p3");
      state.configuration = { ...state.configuration!, colorSpace: "srgb" };
      expect(readActiveOutputColorSpace(device, webgl)).toBe("unknown");
      expect(webgl).not.toHaveBeenCalled();
    } finally { device.dispose(); }
  });
});

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  negotiation: RenderOutputColorSpaceNegotiation | undefined;
  readonly gl = { drawingBufferColorSpace: "srgb", getParameter: () => 4096 };
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext(kind: string) { return kind === "webgl2" ? this.gl : null; }
  addEventListener() {}
  removeEventListener() {}
}

describe("production app diagnostic wiring (mock devices, no browser or GPU)", () => {
  it("reads each mounted device, exposes fallback, and masks stale in-flight and disposed values", async () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("WebGL2RenderingContext", class { static MAX_TEXTURE_SIZE = 0x0d33; });
    vi.stubGlobal("window", {
      innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" },
      addEventListener() {}, removeEventListener() {}
    });
    const actualCreate = Renderer.create.bind(Renderer);
    const mounted = new Map<FakeCanvas, Renderer>();
    vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
      if (!options) throw new Error("The app must pass renderer options");
      const instance = await actualCreate({ ...options, backend: "mock", requiredFeatures: [] });
      const canvas = options.canvas as unknown as FakeCanvas;
      Object.defineProperty(instance.device, "kind", { value: options.backend });
      Object.defineProperty(instance.device, "info", { value: {
        ...instance.device.info,
        capabilities: [...(instance.device.info.capabilities ?? []), "hdr-render-targets", "native-render-pipeline", "canvas-surface"]
      } });
      const device = instance.device;
      if (!(device instanceof MockRenderDevice)) throw new Error("Expected the mock render device");
      vi.spyOn(device, "getOutputColorSpaceNegotiation").mockImplementation(() => canvas.negotiation);
      vi.spyOn(instance, "render").mockImplementation(() => instance.device.getDiagnostics());
      mounted.set(canvas, instance);
      return instance;
    });
    const a = new FakeCanvas(), b = new FakeCanvas();
    const options = {
      scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
      output: { outputColorSpace: "display-p3" as const },
      qualityRebuild: { flags: { A3D_QR_COMPILER: false, A3D_QR_ASSETS: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    };
    const appA = createAuraApp(a as unknown as HTMLCanvasElement, { ...options, renderer: { backend: "webgl2" } });
    const appB = createAuraApp(b as unknown as HTMLCanvasElement, { ...options, renderer: { backend: "webgpu" } });
    try {
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("unknown");
      await Promise.all([appA.readyStrict(), appB.readyStrict()]);
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("unknown");
      a.negotiation = p3; a.gl.drawingBufferColorSpace = "display-p3";
      b.negotiation = fallback;
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("display-p3");
      expect(appB.diagnostics().renderer?.outputColorSpace).toBe("srgb");
      a.gl.drawingBufferColorSpace = "srgb";
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("unknown");
      expect(appB.diagnostics().renderer?.outputColorSpace).toBe("srgb");
      a.gl.drawingBufferColorSpace = "display-p3";

      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const instance = mounted.get(a)!;
      vi.spyOn(instance, "renderAsync").mockImplementation(async () => { await gate; return instance.device.getDiagnostics(); });
      const pending = appA.stepAsync(0.016);
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("unknown");
      release();
      await pending;
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("display-p3");
      (instance.device as MockRenderDevice).contextLost = true;
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("unknown");
      (instance.device as MockRenderDevice).contextLost = false;
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("display-p3");
      appA.dispose();
      expect(appA.diagnostics().renderer?.outputColorSpace).toBe("unknown");
    } finally {
      appA.dispose();
      appB.dispose();
    }
  });
});
