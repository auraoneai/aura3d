import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { convertManagedColor } from "../../../packages/rendering/src/ColorManagement";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import { createOutputWgsl, type OutputWgslOptions } from "../../../packages/rendering/src/output/ToneMappingOperators.wgsl";
import { OUTPUT_VERTEX_GLSL, outputFragmentGlsl } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { cineonToneMapping, linearToneMapping } from "../../../packages/rendering/src/post/ToneOperators";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";

const toneFunctions = {
  none: "a3dToneNone", linear: "a3dToneLinear", reinhard: "a3dToneReinhard", aces: "a3dToneAces",
  agx: "a3dToneAgx", neutral: "a3dToneNeutral", cineon: "a3dToneCineon"
} as const;
const operators = Object.keys(toneFunctions) as (keyof typeof toneFunctions)[];
const base: OutputWgslOptions = { toneMapping: "aces", backgroundCoverage: false, overlay: false };
const mainOf = (source: string): string => source.slice(source.indexOf("@fragment fn fs_main"));

/** Evaluate the actual component-wise WGSL expressions with scalar arithmetic. */
function scalarShaderFunction(source: string, name: string, parameter: string): (value: number) => number {
  const start = source.indexOf(`fn ${name}(`);
  if (start < 0) throw new Error(`Missing WGSL function ${name}`);
  const open = source.indexOf("{", start);
  let depth = 1;
  let end = open + 1;
  for (; end < source.length && depth > 0; end += 1) {
    if (source[end] === "{") depth += 1;
    if (source[end] === "}") depth -= 1;
  }
  if (depth !== 0) throw new Error(`Unclosed WGSL function ${name}`);
  const body = source.slice(open + 1, end - 1)
    .replace(/\blet\s+(\w+)\s*=/g, "const $1 =")
    .replace(/vec3<f32>\(([^()]*)\)/g, "($1)")
    .replace(/\b(max|pow)\s*\(/g, "Math.$1(");
  return new Function(parameter, `const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x)); ${body}`) as (value: number) => number;
}

interface NativeLayout { readonly entries: readonly Record<string, unknown>[]; }
interface NativeEntry { readonly binding: number; readonly resource: unknown; }
interface NativeGroup { readonly entries: readonly NativeEntry[]; readonly bytes?: Uint8Array; }

/** Capture real WebGPUDevice-generated layouts, injected WGSL and submissions. */
async function deviceFixture(canvas = false, presentationAlphaMode: "opaque" | "premultiplied" = "opaque", float32Filterable = false) {
  const modules: { label: string; code: string }[] = [];
  const layouts: NativeLayout[] = [];
  const groups: NativeGroup[] = [];
  const writes = new Map<object, Uint8Array>();
  const submits: unknown[] = [];
  const draws: number[] = [];
  const native = {
    features: new Set(float32Filterable ? ["float32-filterable"] : []),
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.set(buffer, bytes.slice());
      },
      writeTexture() {},
      submit(commands: unknown[]) { submits.push(...commands); },
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
    createTexture: ({ label }: { label?: string }) => {
      const texture = { label, createView: () => ({ texture }), destroy() {} };
      return texture;
    },
    createSampler: () => ({}),
    createShaderModule(descriptor: { label: string; code: string }) { modules.push(descriptor); return descriptor; },
    createBindGroupLayout(descriptor: NativeLayout) { layouts.push(descriptor); return descriptor; },
    createPipelineLayout: (descriptor: { bindGroupLayouts: readonly NativeLayout[] }) => descriptor,
    createRenderPipeline: (descriptor: { layout: "auto" | { bindGroupLayouts: readonly NativeLayout[] } }) => ({
      getBindGroupLayout: (index: number) => descriptor.layout === "auto" ? {} : descriptor.layout.bindGroupLayouts[index]
    }),
    createBindGroup(descriptor: { entries: readonly NativeEntry[] }) {
      const uniform = descriptor.entries.find(entry => entry.binding === 0)?.resource as { buffer?: object } | undefined;
      const bytes = uniform?.buffer && writes.get(uniform.buffer);
      groups.push({ entries: descriptor.entries, ...(bytes ? { bytes: bytes.slice() } : {}) });
      return {};
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw(count: number) { draws.push(count); }, end() {} }),
      finish: () => ({})
    }),
    destroy: vi.fn()
  };
  let configuration: { alphaMode?: "opaque" | "premultiplied" } | undefined;
  const context = {
    configure(value: { alphaMode?: "opaque" | "premultiplied" }) { configuration = value; },
    getConfiguration: () => configuration,
    getCurrentTexture: () => ({ createView: () => ({ canvas: true }) }),
    unconfigure() {}
  };
  const device = await WebGPUDevice.create({
    adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike },
    ...(canvas ? { canvas: { getContext: () => context } as never, presentationAlphaMode } : {})
  });
  return { device, modules, layouts, groups, submits, draws };
}

describe("native OutputPass shader variants", () => {
  it("selects each of the seven actual output curves without falling back", () => {
    for (const operator of operators) {
      const { webgpu } = createOutputWgsl({ ...base, toneMapping: operator });
      expect(webgpu.vertex).toContain("// a3d.output");
      expect(webgpu.fragment).toContain("// a3d.output");
      expect(mainOf(webgpu.fragment)).toContain(`${toneFunctions[operator]}(hdr * aura.u_exposure)`);
    }
    const source = createOutputWgsl(base).webgpu.fragment;
    // Guard the viewing scale, log window and the distinctive operator fits.
    for (const coefficient of ["0.6", "0.59719", "0.0245786", "0.238081", "12.47393", "16.499999", "15.5", "0.76", "6.25", "0.15", "6.2", "0.004", "2.2"]) {
      expect(source).toContain(coefficient);
    }
    expect(source).toContain("if (v < 0.0) { return v; }");
  });

  it("evaluates the actual channel-wise WGSL curves across negative, toe and HDR values", () => {
    const source = createOutputWgsl(base).webgpu.fragment;
    const none = scalarShaderFunction(source, "a3dToneNone", "c");
    const linear = scalarShaderFunction(source, "a3dToneLinear", "c");
    const reinhard = scalarShaderFunction(source, "a3dReinhardChannel", "v");
    const cineon = scalarShaderFunction(source, "a3dToneCineon", "c");
    for (const value of [-2, -1, -0.01, 0, 0.003, 0.004, 0.18, 0.5, 1, 2, 8, 64]) {
      expect(none(value)).toBe(value);
      expect(linear(value)).toBeCloseTo(linearToneMapping([value, 0, 0], 1)[0], 12);
      expect(reinhard(value)).toBeCloseTo(value < 0 ? value : value / (1 + value), 12);
      expect(cineon(value)).toBeCloseTo(cineonToneMapping([value, 0, 0], 1)[0], 12);
    }
  });

  it("covers every combination of coverage, vignette, overlay, output primaries and alpha", () => {
    for (const toneMapping of operators) for (const backgroundCoverage of [false, true]) for (const overlay of [false, true]) {
      for (const vignette of [false, true]) for (const fullCoverage of [false, true]) {
        for (const outputColorSpace of ["srgb", "display-p3"] as const) for (const alphaMode of ["opaque", "straight", "premultiplied"] as const) {
          const { webgpu, portableBindings } = createOutputWgsl({ toneMapping, backgroundCoverage, overlay, vignette, fullCoverage, outputColorSpace, alphaMode });
          const main = mainOf(webgpu.fragment);
          const names = portableBindings.map(binding => binding.name);
          expect(names.includes("u_coverage")).toBe(backgroundCoverage);
          expect(names.includes("u_vignette")).toBe(vignette);
          expect(names.includes("u_vignetteColor")).toBe(vignette);
          expect(names.includes("u_overlayFlash")).toBe(overlay);
          expect(main.includes("hdr = a3dLinearVignette(hdr, uv)")).toBe(vignette);
          expect(main.includes("encoded = a3dApplyOutputOverlay(encoded, uv)")).toBe(overlay);
          expect(webgpu.fragment.includes("0.8224619687143624")).toBe(outputColorSpace === "display-p3");
          const expectedCoverage = backgroundCoverage
            ? "textureSampleLevel(u_coverageTexture, u_coverageSampler, uv, 0.0).r"
            : fullCoverage || alphaMode !== "opaque" ? "1.0" : "clamp(scene.a, 0.0, 1.0)";
          expect(main).toContain(`let coverage = ${expectedCoverage};`);
          expect(main.includes("encoded = encoded * clamp(scene.a, 0.0, 1.0)")).toBe(alphaMode === "premultiplied");
          expect(main).toContain(`return vec4<f32>(encoded, ${alphaMode === "opaque" ? "1.0" : "clamp(scene.a, 0.0, 1.0)"});`);
        }
      }
    }
  });

  it("orders sanitization, linear vignette, tone/coverage, gamut, transfer, dither, overlay and alpha", () => {
    const { webgpu } = createOutputWgsl({ ...base, backgroundCoverage: true, overlay: true, vignette: true, outputColorSpace: "display-p3", alphaMode: "premultiplied" });
    const main = mainOf(webgpu.fragment);
    const marks = ["textureSampleLevel(u_sceneTexture", "let sceneBits", "hdr = a3dLinearVignette", "let coverage =", "let display = mix", "a3dLinearToSrgb(clamp(a3dOutputGamut(display)", "a3dTriangularNoise(glPixel)", "encoded = a3dApplyOutputOverlay", "encoded = encoded * clamp(scene.a", "return vec4<f32>"];
    const positions = marks.map(mark => main.indexOf(mark));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(main).toContain("vec4<u32>(0x7f800000u)");
    expect(main).toContain("vec2<f32>(position.x, aura.u_outputHeight - position.y)");
    expect(webgpu.vertex).toContain("0.5 - position.y * 0.5");
    const overlay = webgpu.fragment.slice(webgpu.fragment.indexOf("fn a3dApplyOutputOverlay"), webgpu.fragment.indexOf("@fragment"));
    expect(overlay.indexOf("a3dSrgbToLinear(encoded)")).toBeLessThan(overlay.indexOf("u_overlayFlash"));
    expect(overlay.indexOf("u_overlayFlash")).toBeLessThan(overlay.indexOf("u_overlayVignette"));
    expect(overlay.indexOf("u_overlayVignette")).toBeLessThan(overlay.indexOf("u_overlayFade"));
    expect(overlay.indexOf("u_overlayFade")).toBeLessThan(overlay.indexOf("a3dLinearToSrgb"));
    expect(overlay).toContain("if (aura.u_overlayShape.w < 0.5) { return encoded; }");
  });

  it("uses the color-management primary transform for P3 and the same transfer for both gamuts", () => {
    const source = createOutputWgsl({ ...base, outputColorSpace: "display-p3" }).webgpu.fragment;
    const rows = [
      [0.8224619687143624, 0.17753803128563794, 0],
      [0.03319419885096169, 0.9668058011490385, 0],
      [0.01708263072112004, 0.07239744066396342, 0.9105199286149166]
    ];
    for (const row of rows) for (const value of row) expect(source).toContain(String(value));
    for (const rgb of [[1, 0, 0], [0, 1, 0], [-0.1, 0.3, 1.2], [0.4, 0.8, 0.1]] as const) {
      const reference = convertManagedColor([...rgb, 1], "linear-srgb", "linear-display-p3");
      rows.forEach((row, index) => expect(row.reduce((sum, value, channel) => sum + value * rgb[channel]!, 0)).toBeCloseTo(reference[index]!, 10));
    }
    const srgb = createOutputWgsl(base).webgpu.fragment;
    for (const fragment of [source, srgb]) for (const value of ["0.0031308", "12.92", "1.055", "2.4"]) expect(fragment).toContain(value);
  });

  it("rejects unsupported tone, alpha, gamut, and malformed boolean variants", () => {
    for (const toneMapping of ["bogus", "__proto__", "toString"]) expect(() => createOutputWgsl({ ...base, toneMapping })).toThrow(/OUTPUT_TONE_MAPPING_UNSUPPORTED/);
    expect(() => createOutputWgsl({ ...base, outputColorSpace: "bogus" as never })).toThrow(/OUTPUT_COLOR_SPACE_UNSUPPORTED/);
    expect(() => createOutputWgsl({ ...base, outputColorSpace: null as never })).toThrow(/OUTPUT_COLOR_SPACE_UNSUPPORTED/);
    expect(() => createOutputWgsl({ ...base, alphaMode: "bogus" as never })).toThrow(/OUTPUT_ALPHA_MODE_UNSUPPORTED/);
    expect(() => createOutputWgsl({ ...base, alphaMode: null as never })).toThrow(/OUTPUT_ALPHA_MODE_UNSUPPORTED/);
    for (const field of ["backgroundCoverage", "overlay", "vignette", "fullCoverage"]) {
      expect(() => createOutputWgsl({ ...base, [field]: null })).toThrow(`OUTPUT_VARIANT_UNSUPPORTED:${field}`);
    }
  });
});

describe("OutputPass native device submission", () => {
  it("binds scene and separate coverage textures, aligned uniforms, and the actual WGSL variant", async () => {
    const f = await deviceFixture();
    const input = f.device.createRenderTarget({ width: 4, height: 2, format: "rgba16f", depth: false, label: "hdr" });
    const coverage = f.device.createRenderTarget({ width: 4, height: 2, format: "rgba8", depth: false, label: "coverage" });
    const output = f.device.createRenderTarget({ width: 8, height: 6, format: "rgba8", depth: false, label: "output" });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(8, 6);
    pass.execute(input, coverage, {
      toneMapping: "neutral", exposure: 1.5, dithering: true, backgroundCoverage: true, outputColorSpace: "srgb", alphaMode: "premultiplied", inputAlphaMode: "premultiplied",
      vignette: { intensity: 0.7, smoothness: 2, roundness: 0.8, color: [0.2, 0.3, 0.4] },
      overlay: { flash: [1, 0, 0, 0.2], vignette: [0, 0, 1, 0.3], shape: [0.4, 0.6], fade: [0.3, 0.2, 0.1, 0.4] }
    }, output);
    const source = f.modules.find(module => module.label.endsWith("-fragment"))?.code;
    expect(source).toContain("@group(0) @binding(0) var<uniform> aura");
    expect(source).toContain("@group(0) @binding(1) var u_sceneSampler: sampler;");
    expect(source).toContain("@group(0) @binding(2) var u_sceneTexture: texture_2d<f32>;");
    expect(source).toContain("@group(0) @binding(3) var u_coverageSampler: sampler;");
    expect(source).toContain("@group(0) @binding(4) var u_coverageTexture: texture_2d<f32>;");
    expect(source).toContain("a3dToneNeutral(hdr * aura.u_exposure)");
    expect(source).not.toContain("0.8224619687143624");
    expect(source).not.toContain("/* @aura3d-bindings */");
    const layout = f.layouts.at(-1)!;
    expect(layout.entries.map(entry => entry.binding)).toEqual([0, 1, 2, 3, 4]);
    expect(layout.entries[1]).toMatchObject({ sampler: { type: "filtering" } });
    expect(layout.entries[2]).toMatchObject({ texture: { sampleType: "float", viewDimension: "2d" } });
    const group = f.groups.at(-1)!;
    expect(group.entries.map(entry => entry.binding)).toEqual([0, 1, 2, 3, 4]);
    expect(group.entries[2]!.resource).toMatchObject({ texture: { label: "hdr" } });
    expect(group.entries[4]!.resource).toMatchObject({ texture: { label: "coverage" } });
    const uniforms = new DataView(group.bytes!.buffer, group.bytes!.byteOffset, group.bytes!.byteLength);
    expect(uniforms.getFloat32(0, true)).toBeCloseTo(1.5);
    expect(uniforms.getFloat32(4, true)).toBe(1);
    expect(uniforms.getFloat32(8, true)).toBe(6);
    expect(uniforms.getFloat32(16, true)).toBeCloseTo(0.7);
    expect(uniforms.getFloat32(28, true)).toBeCloseTo(2);
    expect(uniforms.getFloat32(32, true)).toBeCloseTo(0.2);
    expect(uniforms.getFloat32(48, true)).toBeCloseTo(1);
    expect(uniforms.getFloat32(92, true)).toBe(1);
    expect(f.draws).toEqual([3]);
    expect(f.submits.length).toBeGreaterThan(0);
    expect(f.device.getRenderTarget()).toBeNull();
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("rejects P3 render-target output before compiling or changing device state", async () => {
    const f = await deviceFixture();
    const input = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const output = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const previous = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pass = new OutputPass(f.device);
    const negotiate = vi.spyOn(f.device, "negotiateOutputColorSpace");
    f.device.beginFrame(2, 2);
    f.device.setRenderTarget(previous);
    let failure: unknown;
    try {
      pass.execute(input, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false, outputColorSpace: "display-p3" }, output);
    } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "OUTPUT_COLOR_SPACE_UNAVAILABLE", details: { requested: "display-p3", destination: "render-target" } });
    expect(output.colorTexture.colorSpace).toBe("linear");
    expect(f.device.getRenderTarget()).toBe(previous);
    expect(negotiate).not.toHaveBeenCalled();
    expect(f.modules).toEqual([]);
    expect(f.draws).toEqual([]);
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("rejects unrepresentable P3 render-target output on non-WebGPU devices too", () => {
    const device = new MockRenderDevice();
    const input = device.createRenderTarget({ width: 1, height: 1, format: "rgba16f", depth: false });
    const output = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    let failure: unknown;
    try {
      pass.execute(input, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false, outputColorSpace: "display-p3" }, output);
    } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "OUTPUT_COLOR_SPACE_UNAVAILABLE" });
    expect(device.drawCommands).toEqual([]);
    pass.dispose(); device.dispose();
  });

  it("accepts rgba32f linear filtering when the device enables float32-filterable", async () => {
    const f = await deviceFixture(false, "opaque", true);
    const input = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba32f", depth: false });
    const output = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(2, 2);
    pass.execute(input, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, output);
    expect(f.layouts.at(-1)!.entries[2]).toMatchObject({ texture: { sampleType: "float" } });
    expect(f.draws).toEqual([3]);
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("rejects unsupported rgba32f linear filtering instead of sampling an incompatible texture", async () => {
    const f = await deviceFixture();
    const input = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba32f", depth: false });
    const output = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(2, 2);
    expect(() => pass.execute(input, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, output))
      .toThrow(/Unfilterable float32 textures require a nearest/);
    expect(f.draws).toEqual([]);
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("rejects sampling either attachment while writing to the same native output", async () => {
    const f = await deviceFixture();
    const scene = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const coverage = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const previous = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(2, 2);
    f.device.setRenderTarget(previous);
    for (const invoke of [
      () => pass.execute(scene, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, scene),
      () => pass.execute(scene, coverage, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: true }, coverage)
    ]) {
      let failure: unknown;
      try { invoke(); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "WEBGPU_ATTACHMENT_FEEDBACK" });
      expect(f.device.getRenderTarget()).toBe(previous);
    }
    expect(f.draws).toEqual([]);
    expect(f.modules).toEqual([]);
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("rejects an unknown native tone operator before compiling or drawing", async () => {
    const f = await deviceFixture();
    const input = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const output = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(2, 2);
    expect(() => pass.execute(input, null, { toneMapping: "bogus" as never, exposure: 1, dithering: false, backgroundCoverage: false }, output))
      .toThrow("OUTPUT_TONE_MAPPING_UNSUPPORTED");
    expect(f.modules).toEqual([]);
    expect(f.draws).toEqual([]);
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("fails before drawing when a dithered canvas has no verifiable destination height", async () => {
    const f = await deviceFixture(true);
    const input = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(4, 4);
    const capture = vi.spyOn(f.device, "captureState");
    for (const height of [undefined, 0, -1, NaN, Infinity]) {
      capture.mockReturnValue(new Map(height === undefined ? [] : [["viewportHeight", height]]));
      expect(() => pass.execute(input, null, { toneMapping: "aces", exposure: 1, dithering: true, backgroundCoverage: false }, "canvas"))
        .toThrow("OUTPUT_HEIGHT_UNAVAILABLE");
      expect(f.draws).toEqual([]);
    }
    capture.mockRestore();
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });

  it("presents to the canvas with negotiated sRGB, premultiplied alpha and full destination height", async () => {
    const f = await deviceFixture(true, "premultiplied");
    const input = f.device.createRenderTarget({ width: 3, height: 2, format: "rgba16f", depth: false, label: "canvas-source" });
    const pass = new OutputPass(f.device);
    f.device.beginFrame(12, 10);
    pass.execute(input, null, { toneMapping: "agx", exposure: 0.75, dithering: true, backgroundCoverage: false, outputColorSpace: "display-p3", alphaMode: "premultiplied", inputAlphaMode: "premultiplied" }, "canvas");
    const source = f.modules.find(module => module.label.endsWith("-fragment"))!.code;
    expect(source).toContain("a3dToneAgx(hdr * aura.u_exposure)");
    expect(source).not.toContain("0.8224619687143624");
    expect(source).toContain("encoded = encoded * clamp(scene.a, 0.0, 1.0)");
    expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
    expect(f.layouts.at(-1)!.entries.map(entry => entry.binding)).toEqual([0, 1, 2]);
    const group = f.groups.at(-1)!;
    expect(group.entries[2]!.resource).toMatchObject({ texture: { label: "canvas-source" } });
    const uniforms = new DataView(group.bytes!.buffer, group.bytes!.byteOffset, group.bytes!.byteLength);
    expect(uniforms.getFloat32(8, true)).toBe(10);
    expect(f.draws).toEqual([3]);
    expect(() => pass.execute(input, null, { toneMapping: "agx", exposure: 1, dithering: false, backgroundCoverage: false, alphaMode: "straight" }, "canvas")).toThrow(/OUTPUT_ALPHA_MODE_UNAVAILABLE/);
    expect(f.draws).toEqual([3]);
    f.device.endFrame(); pass.dispose(); f.device.dispose();
  });
});

describe("offline OutputPass WGSL compiler", () => {
  const hasNaga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga when the source gate requests it", () => {
    expect(hasNaga, "naga is required to validate native output WGSL").toBe(true);
  });
  it.runIf(hasNaga)("compiles actual device-injected operator and resource variants", async () => {
    const f = await deviceFixture();
    const dir = mkdtempSync(join(tmpdir(), "aura-output-wgsl-"));
    try {
      const variants: OutputWgslOptions[] = operators.map(toneMapping => ({ ...base, toneMapping }));
      for (const backgroundCoverage of [false, true]) for (const overlay of [false, true]) for (const vignette of [false, true]) {
        variants.push({ ...base, backgroundCoverage, overlay, vignette, fullCoverage: !backgroundCoverage, outputColorSpace: "display-p3", alphaMode: "premultiplied" });
      }
      for (const [index, options] of variants.entries()) {
        const shader = f.device.createShaderProgram({ label: `output-${index}`, marker: "a3d.output", vertex: OUTPUT_VERTEX_GLSL, fragment: outputFragmentGlsl(options), ...createOutputWgsl(options) });
        for (const stage of f.modules.slice(-2)) {
          const file = join(dir, `${index}-${stage.label.endsWith("-vertex") ? "vertex" : "fragment"}.wgsl`);
          writeFileSync(file, stage.code);
          expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
        }
        shader.dispose();
      }
    } finally { f.device.dispose(); rmSync(dir, { recursive: true, force: true }); }
  });
});
