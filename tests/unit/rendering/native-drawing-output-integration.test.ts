import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, effects, lights, primitives, scene } from "../../../packages/engine/src/public/index";
import type { MaterialExtensionFeature } from "../../../packages/rendering/src/contracts/program";
import { PRD04_MATERIAL_LOBES } from "../../../packages/rendering/src/materials/lobes";
import { indirectFractionFeature } from "../../../packages/rendering/src/post/chunks/indirectFraction.glsl";
import { PRD02_SHADOW_FILTER_FEATURE } from "../../../packages/rendering/src/shadows/Prd02ShadowFilter";
import { PRD02_IBL_SHADER_FEATURE } from "../../../packages/rendering/src/shaders/Prd02IblFeature";
import { admitNativeDeferredFeatures } from "../../../packages/rendering/src/renderer/NativeDeferredAdmission";
import { createTrustedQrFlags, isTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { withCoreOutputOff } from "../../../packages/rendering/src/renderer/coreOutputPostRoute";

describe("native deferred feature admission", () => {
  it("accepts only the actual built-in providers selected by the generated root material", () => {
    const features = [PRD02_IBL_SHADER_FEATURE, indirectFractionFeature, PRD02_SHADOW_FILTER_FEATURE];
    const selected = { "prd02.ibl": true, "prd03.indirectFraction": "indirectFraction", "prd02.shadowFilter": 3 };
    const extensions: MaterialExtensionFeature[] = [
      { lobe: "sheen", maps: [], bits: { colorMap: false, roughnessMap: false } },
      { lobe: "emissive-strength", maps: [], bits: { map: false } }
    ];
    const accepted = admitNativeDeferredFeatures(selected, features, extensions, PRD04_MATERIAL_LOBES);
    expect(accepted).toEqual({ ibl: true, indirectFraction: true });
    expect(admitNativeDeferredFeatures(selected, [{ ...PRD02_IBL_SHADER_FEATURE }, ...features.slice(1)], extensions, PRD04_MATERIAL_LOBES).reason).toContain("prd02.ibl");
    expect(admitNativeDeferredFeatures(selected, features, extensions, PRD04_MATERIAL_LOBES.map(lobe => lobe.id === "sheen" ? { ...lobe } : lobe)).reason).toContain("sheen");
    expect(admitNativeDeferredFeatures({ ...selected, "test.extra": true }, features, extensions, PRD04_MATERIAL_LOBES).reason).toContain("test.extra");
    expect(admitNativeDeferredFeatures(selected, features, [{ lobe: "sheen", maps: ["sheenColor"], bits: {} }], PRD04_MATERIAL_LOBES).reason).toContain("sheen");
    expect(admitNativeDeferredFeatures(selected, features, extensions, []).reason).toContain("sheen");
  });
});

describe("legacy output flag derivation", () => {
  it("keeps trusted snapshots immutable and preserves custom flag callbacks without trusting them", () => {
    const trusted = createTrustedQrFlags({ A3D_QR_CORE_OUTPUT: true, A3D_QR_POST: true });
    const derived = withCoreOutputOff(trusted);
    expect(isTrustedQrFlags(derived)).toBe(true);
    expect(derived.on("A3D_QR_CORE_OUTPUT")).toBe(false);
    expect(derived.on("A3D_QR_POST")).toBe(true);
    expect(withCoreOutputOff(trusted)).toBe(derived);
    const custom: QrFlags = { values: Object.freeze({ A3D_QR_POST: false }), on: name => name === "A3D_QR_POST" };
    const legacy = withCoreOutputOff(custom);
    expect(isTrustedQrFlags(legacy)).toBe(false);
    expect(legacy.on("A3D_QR_POST")).toBe(true);
    expect(legacy.on("A3D_QR_CORE_OUTPUT")).toBe(false);
  });
});

type RootDraw = { readonly pipeline?: string; readonly count: number };

/** Root-app WebGPU mock: records orchestration only; no WGSL is executed. */
function rootDevice() {
  const labels: string[] = [];
  const submissions: unknown[] = [];
  const draws: RootDraw[] = [];
  const makeTexture = () => { const resource = { createView: () => ({ texture: resource }), destroy: vi.fn() }; return resource; };
  const native = {
    features: new Set<string>(),
    queue: { submit(commands: readonly unknown[]) { submissions.push(...commands); }, writeBuffer() {}, writeTexture() {}, onSubmittedWorkDone: async () => {} },
    createBuffer({ size, usage, label }: { size: number; usage: number; label?: string }) {
      const bytes = new ArrayBuffer(size);
      return { size, usage, label, destroy() {}, mapAsync: async () => {}, getMappedRange: () => bytes, unmap() {} };
    },
    createTexture: () => makeTexture(),
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: ({ label }: { label?: string }) => ({ label, getBindGroupLayout: () => ({}) }),
    createComputePipeline: ({ label }: { label?: string }) => ({ label, getBindGroupLayout: () => ({}) }),
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: (descriptor: unknown) => descriptor,
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline(value: { label?: string }) { if (value.label) labels.push(value.label); }, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      beginRenderPass: () => {
        let pipeline: string | undefined;
        return {
          setPipeline(value: { label?: string }) { pipeline = value.label; if (pipeline) labels.push(pipeline); },
          setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
          draw(count: number) { draws.push({ pipeline, count }); }, drawIndexed(count: number) { draws.push({ pipeline, count }); },
          drawIndirect() { draws.push({ pipeline, count: -1 }); }, end() {}
        };
      },
      copyBufferToBuffer() {}, copyTextureToBuffer() {}, copyTextureToTexture() {}, finish: () => ({})
    }),
    destroy() {}
  };
  const canvasContext = { configure() {}, unconfigure() {}, getCurrentTexture: makeTexture };
  class MockCanvas {
    width = 64; height = 64; clientWidth = 64; clientHeight = 64;
    style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
    getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
    hasAttribute() { return true; }
    getContext(kind: string) { return kind === "webgpu" ? canvasContext : null; }
    addEventListener() {} removeEventListener() {}
  }
  vi.stubGlobal("HTMLCanvasElement", MockCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "rgba8unorm" } });
  return { canvas: new MockCanvas() as unknown as HTMLCanvasElement, labels, submissions, draws };
}

type RootMode = "deferred" | "meshlet" | "visibility";
function rootApp(fixture: ReturnType<typeof rootDevice>, mode: RootMode, allowFallback: boolean, options: { readonly msaa?: boolean; readonly translucent?: boolean } = {}) {
  const authored = scene().add(lights.ambient({ intensity: 1 }))
    .add(primitives.box({ name: "box", ...(options.translucent ? { material: { color: "#ffffff", opacity: 0.5 } } : {}) }));
  if (!options.msaa) authored.add(effects.antiAlias({ mode: "off" }));
  return createAuraApp(fixture.canvas, {
    scene: authored, renderer: { backend: "webgpu", drawingPath: { mode, allowFallback }, shaderFailures: "throw" },
    autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
  });
}
const drawingPath = (app: object) => (app as Record<symbol, { drawingPathDiagnostics: unknown }>)[Symbol.for("a3d.prd01.renderer")]!.drawingPathDiagnostics;
const NATIVE_LABELS = /^aura-(deferred|meshlet|visibility)-/;
// The geometry/culling pipeline and the resolve that writes the shared HDR target, per requested path.
const ROOT_PATH_LABELS: Record<RootMode, { readonly geometry: RegExp; readonly resolve: RegExp }> = {
  deferred: { geometry: /^aura-deferred-.*geometry/, resolve: /^aura-deferred-(physical|probe)-resolve$/ },
  meshlet: { geometry: /^aura-meshlet-cull$/, resolve: /^aura-deferred-(physical|probe)-resolve$/ },
  visibility: { geometry: /^aura-visibility-physical-geometry$/, resolve: /^aura-visibility-physical-probe-resolve$/ }
};

describe("root-app native drawing output integration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["deferred", "meshlet", "visibility"] as const)("routes an eligible root through the %s path and integrates its output before tone mapping and presentation", async (mode) => {
    const fixture = rootDevice();
    const app = rootApp(fixture, mode, false);
    try {
      await app.ready();
      expect(app.diagnostics().errors.join(" ")).toBe("");
      fixture.labels.length = 0; fixture.draws.length = 0; fixture.submissions.length = 0;
      await app.stepAsync(0);
      expect(drawingPath(app)).toMatchObject({ requested: mode, active: mode, triangles: 12 });
      expect(drawingPath(app)).not.toHaveProperty("fallbackReason");
      const geometry = fixture.labels.findIndex(label => ROOT_PATH_LABELS[mode].geometry.test(label));
      const resolve = fixture.labels.findIndex(label => ROOT_PATH_LABELS[mode].resolve.test(label));
      expect(geometry).toBeGreaterThanOrEqual(0);
      expect(resolve).toBeGreaterThan(geometry);
      // The native output is the HDR input of the ordinary post chain.
      const tone = fixture.labels.lastIndexOf("webgpu-tone-pipeline");
      const present = fixture.labels.lastIndexOf("webgpu-post-present-pipeline");
      expect(tone).toBeGreaterThan(resolve);
      expect(present).toBeGreaterThan(tone);
      expect(fixture.draws.some(draw => draw.pipeline === fixture.labels[resolve] && draw.count === 3)).toBe(true);
      // No forward opaque draw duplicates the native output.
      expect(fixture.labels.some(label => /^aura-native-forward/.test(label))).toBe(false);
      expect(fixture.submissions.length).toBeGreaterThan(0);
    } finally { app.dispose(); }
  });

  it.each(["meshlet", "visibility"] as const)("falls back explicitly from %s for translucent content and refuses it with a stable code when fallback is disabled", async (mode) => {
    const allowed = rootDevice();
    const fallback = rootApp(allowed, mode, true, { translucent: true });
    try {
      await fallback.ready(); allowed.labels.length = 0;
      await fallback.stepAsync(0);
      expect(drawingPath(fallback)).toMatchObject({ requested: mode, active: "forward", fallbackReason: expect.any(String) });
      expect(allowed.labels.some(label => NATIVE_LABELS.test(label))).toBe(false);
      expect(allowed.labels.lastIndexOf("webgpu-post-present-pipeline")).toBeGreaterThan(0);
    } finally { fallback.dispose(); }
    vi.unstubAllGlobals();
    const strict = rootDevice();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = rootApp(strict, mode, false, { translucent: true });
    try {
      await refused.ready();
      const mountError = refused.diagnostics().errors.join(" ");
      const step = refused.stepAsync(0);
      if (mountError) {
        expect(mountError).toMatch(new RegExp(`Renderer ${mode} path cannot render this frame`));
        await expect(step).rejects.toThrow();
      } else {
        await expect(step).rejects.toMatchObject({ code: "NATIVE_DRAW_INCOMPATIBLE", details: { requested: mode } });
      }
      expect(strict.labels.some(label => NATIVE_LABELS.test(label))).toBe(false);
    } finally { refused.dispose(); log.mockRestore(); }
  });

  it("falls back explicitly from visibility for a multisampled root target and refuses it with a stable code otherwise", async () => {
    const allowed = rootDevice();
    const fallback = rootApp(allowed, "visibility", true, { msaa: true });
    try {
      await fallback.ready(); allowed.labels.length = 0;
      await fallback.stepAsync(0);
      expect(drawingPath(fallback)).toMatchObject({ requested: "visibility", active: "forward", fallbackReason: "physical visibility requires a single-sample rgba16f target" });
      expect(allowed.labels.some(label => NATIVE_LABELS.test(label))).toBe(false);
      expect(allowed.labels.lastIndexOf("webgpu-post-present-pipeline")).toBeGreaterThan(0);
    } finally { fallback.dispose(); }
    vi.unstubAllGlobals();
    const strict = rootDevice();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = rootApp(strict, "visibility", false, { msaa: true });
    try {
      await refused.ready();
      const mountError = refused.diagnostics().errors.join(" ");
      if (mountError) {
        expect(mountError).toMatch(/Renderer visibility path cannot render this frame: physical visibility requires a single-sample rgba16f target/);
        await expect(refused.stepAsync(0)).rejects.toThrow();
      } else {
        await expect(refused.stepAsync(0)).rejects.toMatchObject({ code: "NATIVE_DRAW_INCOMPATIBLE", details: { requested: "visibility", reason: "physical visibility requires a single-sample rgba16f target" } });
      }
      expect(strict.labels.some(label => NATIVE_LABELS.test(label))).toBe(false);
    } finally { refused.dispose(); log.mockRestore(); }
  });
});
