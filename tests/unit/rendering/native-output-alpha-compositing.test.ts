import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { convertManagedColor, transformColorForOutput } from "../../../packages/rendering/src/ColorManagement";
import { MockRenderDevice, type RenderCommandState } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2StateCache } from "../../../packages/rendering/src/WebGL2StateCache";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import { outputFragmentGlsl } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { createOutputWgsl } from "../../../packages/rendering/src/output/ToneMappingOperators.wgsl";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";
import { resolveNativeRenderState } from "../../../packages/rendering/src/webgpu/NativeRenderState";

type Color = readonly [number, number, number, number];
type AlphaMode = "straight" | "premultiplied";
type Gamut = "srgb" | "display-p3";
const state: RenderCommandState = {
  depthTest: true, depthWrite: false, cullMode: "back", depthCompare: "less-equal", blend: true
};
const base = { toneMapping: "reinhard", backgroundCoverage: false, overlay: false } as const;

/** Extract and execute the shader's scalar channel expressions, not a second copy of their equations. */
function shaderFunction(source: string, signature: string, parameter: string): (value: number | { rgb: number; a: number }) => number {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing shader function ${signature}`);
  const open = source.indexOf("{", start);
  let end = open + 1;
  let depth = 1;
  while (end < source.length && depth > 0) {
    if (source[end] === "{") depth += 1;
    if (source[end] === "}") depth -= 1;
    end += 1;
  }
  if (depth !== 0) throw new Error(`Unclosed shader function ${signature}`);
  const body = source.slice(open + 1, end - 1)
    .replace(/vec3(?:<f32>)?\(([^()]*)\)/g, "($1)")
    .replace(/\b(min|max|pow)\s*\(/g, "Math.$1(");
  // mix/step/select are scalar equivalents of their shader vector counterparts.
  return new Function(parameter, `
    const mix = (a, b, t) => a * (1 - t) + b * t;
    const step = (edge, x) => x < edge ? 0 : 1;
    const select = (a, b, condition) => condition ? b : a;
    ${body}
  `) as (value: number | { rgb: number; a: number }) => number;
}

function gamutRows(source: string): number[][] {
  const start = source.indexOf("a3dOutputGamut(");
  const end = source.indexOf("}", start);
  if (start < 0 || end < 0) throw new Error("Missing output gamut function");
  const rows = [...source.slice(start, end).matchAll(/vec3(?:<f32>)?\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g)]
    .map(match => match.slice(1).map(Number));
  if (rows.length !== 3 || rows.some(row => row.length !== 3 || row.some(value => !Number.isFinite(value)))) {
    throw new Error("Missing P3 output matrix");
  }
  return rows;
}

function sourceOver(src: Color, dst: Color, sourceIsPremultiplied = false): Color {
  const factor = sourceIsPremultiplied ? 1 : src[3];
  return [
    src[0] * factor + dst[0] * (1 - src[3]),
    src[1] * factor + dst[1] * (1 - src[3]),
    src[2] * factor + dst[2] * (1 - src[3]),
    src[3] + dst[3] * (1 - src[3])
  ];
}

/** Exercise actual generated unassociation, Reinhard, gamut and transfer shader expressions. */
function evaluatePreservingOutput(backend: "glsl" | "wgsl", scene: Color, mode: AlphaMode, gamut: Gamut, exposure: number, coverage?: number): Color {
  const options = { ...base, alphaMode: mode, outputColorSpace: gamut, backgroundCoverage: coverage !== undefined };
  const source = backend === "glsl" ? outputFragmentGlsl(options) : createOutputWgsl(options).webgpu.fragment;
  const main = source.slice(source.indexOf(backend === "glsl" ? "void main()" : "@fragment fn fs_main"));
  const unassociate = shaderFunction(source, backend === "glsl" ? "vec3 a3dUnassociateScene(" : "fn a3dUnassociateScene(", "scene");
  const tone = shaderFunction(source, backend === "glsl" ? "float a3dReinhardChannel(" : "fn a3dReinhardChannel(", backend === "glsl" ? "value" : "v");
  const transfer = shaderFunction(source, backend === "glsl" ? "vec3 a3dLinearToSRGB(" : "fn a3dLinearToSrgb(", "c");
  expect(main).toContain("a3dUnassociateScene(scene)");
  expect(main.indexOf("a3dUnassociateScene(scene)")).toBeLessThan(main.indexOf("hdr *"));
  expect(main.indexOf("hdr *")).toBeLessThan(main.indexOf("a3dOutputGamut(display)"));
  expect(main).toContain(backend === "glsl" ? "if (scene.a <= 0.0) encoded = vec3(0.0);" : "if (scene.a <= 0.0) { encoded = vec3<f32>(0.0); }");
  if (coverage !== undefined) expect(main).toContain(backend === "glsl" ? "texture(u_coverage, v_uv).r" : "textureSampleLevel(u_coverageTexture, u_coverageSampler, uv, 0.0).r");
  if (mode === "premultiplied") expect(main).toContain(backend === "glsl" ? "encoded *= clamp(scene.a" : "encoded = encoded * clamp(scene.a");

  const alpha = Math.max(0, Math.min(1, scene[3]));
  const straight = scene.slice(0, 3).map(rgb => unassociate({ rgb, a: scene[3] }));
  const toned = straight.map(channel => tone(channel * exposure));
  const display = toned.map((channel, index) => {
    const raw = Math.max(0, Math.min(1, straight[index]!));
    return raw * (1 - (coverage ?? 1)) + channel * (coverage ?? 1);
  });
  const primary = gamut === "srgb" ? display : gamutRows(source).map(row => row.reduce((sum, value, index) => sum + value * display[index]!, 0));
  const encoded = primary.map(channel => transfer(Math.max(0, Math.min(1, channel))));
  const scale = mode === "premultiplied" ? alpha : 1;
  return [alpha === 0 ? 0 : encoded[0]! * scale, alpha === 0 ? 0 : encoded[1]! * scale, alpha === 0 ? 0 : encoded[2]! * scale, alpha];
}

function expectColor(actual: Color, expected: Color): void {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 10));
}

describe("source-over scene alpha and output association", () => {
  it("uses the same separate source-over factors for legacy and named WebGL and WebGPU draws", () => {
    const gl = {
      getExtension: () => null, SRC_ALPHA: 0x302, ONE_MINUS_SRC_ALPHA: 0x303, ONE: 1, FUNC_ADD: 0x8006,
      DEPTH_TEST: 1, SAMPLE_ALPHA_TO_COVERAGE: 2, SCISSOR_TEST: 3, POLYGON_OFFSET_FILL: 4, STENCIL_TEST: 5,
      CULL_FACE: 6, BLEND: 7, LEQUAL: 8, BACK: 9, CCW: 10,
      enable() {}, disable() {}, depthMask() {}, depthFunc() {}, colorMask() {}, cullFace() {}, frontFace() {}, blendColor() {},
      blendEquationSeparate: vi.fn(), blendFuncSeparate: vi.fn()
    };
    const cache = new WebGL2StateCache({ label: "alpha-test" });
    const binder = new WebGL2DrawCallBinder({ gl, stateCache: cache, lifecycle: { effectiveScissor: () => null } } as never);
    binder.applyRenderState(state);
    expect(gl.blendEquationSeparate).toHaveBeenLastCalledWith(gl.FUNC_ADD, gl.FUNC_ADD);
    expect(gl.blendFuncSeparate).toHaveBeenLastCalledWith(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    cache.invalidate();
    binder.applyRenderState({ ...state, blendMode: "alpha" });
    expect(gl.blendFuncSeparate).toHaveBeenLastCalledWith(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    cache.invalidate();
    binder.applyRenderState({ ...state, blendMode: "premultiplied" });
    expect(gl.blendFuncSeparate).toHaveBeenLastCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    for (const [blendMode, rgbSource] of [[undefined, "src-alpha"], ["alpha", "src-alpha"], ["premultiplied", "one"]] as const) {
      const result = resolveNativeRenderState({
        state: { ...state, ...(blendMode ? { blendMode } : {}) }, topology: "triangles", colorFormats: ["rgba16float"],
        sampleCount: 1, targetWidth: 1, targetHeight: 1, deviceGeneration: 1, targetKey: "t", targetGeneration: 1, shaderKey: "s", layoutKey: "l"
      });
      expect(result.colorTargets[0]!.blend).toEqual({
        color: { operation: "add", srcFactor: rgbSource, dstFactor: "one-minus-src-alpha" },
        alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
      });
    }
  });

  it.each(["glsl", "wgsl"] as const)("unassociates %s source-over pixels before tone, gamut and transfer", backend => {
    const red: Color = [2, 0.1, 0.25, 0.5];
    const blue: Color = [0.1, 0.6, 1.2, 0.4];
    const transparent: Color = [0, 0, 0, 0];
    const layered = sourceOver(red, sourceOver(blue, transparent));
    const equivalentPremultipliedRed: Color = [1, 0.05, 0.125, 0.5];
    expectColor(layered, sourceOver(equivalentPremultipliedRed, sourceOver(blue, transparent), true));
    const fixtures: Color[] = [
      sourceOver(red, transparent), layered,
      sourceOver(red, [0.3, 0.5, 0.2, 1]),
      [2e-8, 5e-9, 0, 1e-8],
      [0, 0, 0, 0], [4, 1, 2, 0],
      [2, -1, 0.5, 1]
    ];
    for (const scene of fixtures) for (const gamut of ["srgb", "display-p3"] as const) for (const mode of ["straight", "premultiplied"] as const) {
      const reference = transformColorForOutput(scene, "linear-srgb", gamut, {
        inputAlphaMode: "premultiplied", outputAlphaMode: mode, exposure: 1.3, toneMapping: "reinhard", gamutMapping: "clip"
      });
      expectColor(evaluatePreservingOutput(backend, scene, mode, gamut, 1.3), reference);
    }
    // The former shader tones and encodes the associated value, making the
    // nominally straight red much darker and premultiplied output darker again.
    expect(evaluatePreservingOutput(backend, sourceOver([1, 0, 0, 0.5], transparent), "straight", "srgb", 1)[0])
      .toBeCloseTo(0.7353569830524495, 10);
  });

  it("requires an explicit source-association contract before presenting preserved alpha", () => {
    const device = new MockRenderDevice();
    const input = device.createRenderTarget({ width: 1, height: 1, format: "rgba16f", depth: false });
    const output = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    const options = { toneMapping: "reinhard", exposure: 1, dithering: false, backgroundCoverage: false } as const;
    device.beginFrame(1, 1);
    for (const alphaMode of ["straight", "premultiplied"] as const) {
      const previousDraws = device.drawCommands.length;
      expect(() => pass.execute(input, null, { ...options, alphaMode }, output)).toThrow(/OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE/);
      expect(device.drawCommands).toHaveLength(previousDraws);
      pass.execute(input, null, { ...options, alphaMode, inputAlphaMode: "premultiplied" }, output);
    }
    expect(device.drawCommands).toHaveLength(2);
    expect(() => pass.execute(input, null, { ...options, alphaMode: "straight", inputAlphaMode: "straight" as never }, output))
      .toThrow(/OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED/);
    expect(() => pass.execute(input, null, { ...options, alphaMode: "opaque", inputAlphaMode: "premultiplied" }, output))
      .toThrow(/OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED/);
    input.colorTexture.colorSpace = "srgb";
    expect(() => pass.execute(input, null, { ...options, alphaMode: "straight", inputAlphaMode: "premultiplied" }, output))
      .toThrow(/OUTPUT_INPUT_COLOR_SPACE_UNAVAILABLE/);
    expect(device.drawCommands).toHaveLength(2);
    input.colorTexture.colorSpace = "linear";
    // Opaque output remains the legacy coverage/raw-background contract.
    pass.execute(input, null, options, output);
    expect(device.drawCommands).toHaveLength(3);
    device.endFrame();
    pass.dispose();
    device.dispose();
  });

  it.each(["glsl", "wgsl"] as const)("keeps %s background coverage independent of preserved opacity", backend => {
    const scene: Color = [1, 0.1, 0.05, 0.5];
    const straight = [2, 0.2, 0.1];
    for (const coverage of [0, 0.25, 1]) for (const gamut of ["srgb", "display-p3"] as const) for (const mode of ["straight", "premultiplied"] as const) {
      const mixed = straight.map(value => Math.min(value, 1) * (1 - coverage) + (value / (1 + value)) * coverage);
      const reference = convertManagedColor([mixed[0]!, mixed[1]!, mixed[2]!, scene[3]], "linear-srgb", gamut, {
        outputAlphaMode: mode, gamutMapping: "clip"
      });
      expectColor(evaluatePreservingOutput(backend, scene, mode, gamut, 1, coverage), reference);
    }
  });

  it("zeros transparent pixels after overlay and dither before final association", () => {
    for (const mode of ["straight", "premultiplied"] as const) {
      const options = { ...base, alphaMode: mode, overlay: true, vignette: true };
      for (const [backend, source] of [
        ["glsl", outputFragmentGlsl(options)],
        ["wgsl", createOutputWgsl(options).webgpu.fragment]
      ] as const) {
        const main = source.slice(source.indexOf(backend === "glsl" ? "void main()" : "@fragment fn fs_main"));
        const dither = main.indexOf("a3dTriangularNoise(");
        const overlay = main.indexOf("encoded = a3dApplyOutputOverlay");
        const zero = main.indexOf("if (scene.a <= 0.0)");
        const multiply = main.indexOf(backend === "glsl" ? "encoded *= clamp(scene.a" : "encoded = encoded * clamp(scene.a");
        expect(dither).toBeGreaterThan(0);
        expect(overlay).toBeGreaterThan(dither);
        expect(zero).toBeGreaterThan(overlay);
        if (mode === "premultiplied") expect(multiply).toBeGreaterThan(zero);
      }
    }
  });

  it("keeps opaque raw-background/coverage semantics separate from opacity", () => {
    const glsl = outputFragmentGlsl(base);
    const wgsl = createOutputWgsl(base).webgpu.fragment;
    const glMain = glsl.slice(glsl.indexOf("void main()"));
    const wgMain = wgsl.slice(wgsl.indexOf("@fragment fn fs_main"));
    expect(glMain).toMatch(/#else\s+\/\/ Opaque output[^\n]*\n\s+vec3 hdr = scene\.rgb;\s+#endif/);
    expect(glMain).toContain("float a3dCoverage = clamp(scene.a, 0.0, 1.0);");
    expect(glMain).toContain("vec3 display = mix(clamp(hdr, 0.0, 1.0), TONE_MAP(hdr * u_exposure), a3dCoverage);");
    expect(wgMain).toContain("var hdr = scene.rgb;");
    expect(wgMain).not.toContain("a3dUnassociateScene(scene)");
    expect(wgMain).toContain("let coverage = clamp(scene.a, 0.0, 1.0);");
    const background: Color = [0.2, 0.4, 0.6, 0];
    const transfer = shaderFunction(glsl, "vec3 a3dLinearToSRGB(", "c");
    // Coverage 0 means the nonzero raw background is encoded, not divided by
    // zero or forced to transparent black on an opaque canvas.
    expect(background.slice(0, 3).map(transfer)).toEqual(background.slice(0, 3).map(c => 1.055 * c ** (1 / 2.4) - 0.055));
  });

  const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
  it.runIf(hasGlslang)("compiles GLSL opaque, straight and premultiplied variants offline", () => {
    for (const alphaMode of ["opaque", "straight", "premultiplied"] as const) for (const backgroundCoverage of [false, true]) {
      const shader = outputFragmentGlsl({ ...base, alphaMode, backgroundCoverage, outputColorSpace: "display-p3", overlay: true, vignette: true });
      const result = spawnSync("glslangValidator", ["--stdin", "-S", "frag"], { input: shader, encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }
  });
});
