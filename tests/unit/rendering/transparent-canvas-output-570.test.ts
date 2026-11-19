/**
 * 5.7.0 transparent canvas output. `output: { alphaMode: "premultiplied", inputAlphaMode: "premultiplied" }` alone must
 * give a transparent canvas whose colours match the opaque frame:
 *
 * 1. The default clear is transparent (it was the background at alpha 1, so every pixel came out alpha 255).
 * 2. The OutputPass route an alpha request forces runs the device's neutral curve, as the fused LDR present does
 *    (it ran Khronos PBR Neutral, so turning transparency on changed colour).
 * 3. No draw writes the indirect-fraction AO tag into colour alpha (MSAA edges came out opaque and dark on WebGL2, and
 *    WebGPU refused the tagged programs, blanking the frame).
 *
 * Opaque output, the default, must not change: its shader sources, clears and program features are asserted unchanged.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd03";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, OUTPUT_ALPHA_OPAQUE_CLEAR } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import type { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { createHdrTarget } from "../../../packages/rendering/src/output/HdrTarget";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import { outputFragmentGlsl } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { createOutputWgsl } from "../../../packages/rendering/src/output/ToneMappingOperators.wgsl";
import { setNeutralToneCurve } from "../../../packages/rendering/src/output/neutralToneCurve";
import { outputAlphaPreserving, setOutputAlphaPreserving } from "../../../packages/rendering/src/output/outputAlphaPreservation";
import { indirectFractionFeature } from "../../../packages/rendering/src/post/chunks/indirectFraction.glsl";
import { ldrFragmentSource } from "../../../packages/rendering/src/webgl2/LdrPostprocessShader";
import { outputPassNeutralCurve } from "../../../packages/rendering/src/webgl2/LegacyPost";
import { mountClearForOutput, outputClearColor, TRANSPARENT_CLEAR_COLOR } from "../../../packages/engine/src/agent-api/compiler/renderer";

const sha = (source: string): string => createHash("sha256").update(source).digest("hex").slice(0, 16);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("1. alpha-preserving output clears transparent by default", () => {
  it("opaque output keeps the background clear exactly; alpha-preserving output clears to premultiplied transparent black", () => {
    const background = outputClearColor({ background: "#f1f2f2" });
    expect(mountClearForOutput({ alphaMode: "opaque" }, background)).toBe(background);
    expect(mountClearForOutput({ alphaMode: "premultiplied" }, background)).toEqual([0, 0, 0, 0]);
    expect(mountClearForOutput({ alphaMode: "straight" }, [0.2, 0.3, 0.4, 1])).toEqual([0, 0, 0, 0]);
    expect(Object.isFrozen(TRANSPARENT_CLEAR_COLOR)).toBe(true);
  });

  const renderer = (output?: ConstructorParameters<typeof Renderer>[1]["output"]) => new Renderer(
    new MockRenderDevice(),
    { width: 8, height: 8, shaderLibrary: {} as ShaderLibrary, clearColor: [0, 0, 0, 0], outputClearColor: [0, 0, 0, 0], ...(output ? { output } : {}) },
    new TemporalHistory()
  );

  it("setClearColor on alpha-preserving output stores a premultiplied clear on every route and warns once for an opaque clear", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = renderer({ alphaMode: "premultiplied", inputAlphaMode: "premultiplied" });
    try {
      r.setClearColor([0.8, 0.6, 0.4], 0.5);
      expect(r.clearColorValue).toEqual([0.4, 0.3, 0.2, 0.5]);
      expect((r as unknown as { outputClearColor: readonly number[] }).outputClearColor).toEqual([0.4, 0.3, 0.2, 0.5]);
      r.setClearColor([0.9, 0.9, 0.9], 0);
      expect(r.clearColorValue).toEqual([0, 0, 0, 0]);
      expect(warn).not.toHaveBeenCalled();
      r.setClearColor([0.1, 0.2, 0.3]);
      r.setClearColor([0.1, 0.2, 0.3], 1);
      expect(r.clearColorValue).toEqual([0.1, 0.2, 0.3, 1]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain(OUTPUT_ALPHA_OPAQUE_CLEAR);
    } finally {
      r.dispose();
    }
  });

  it("setClearColor on opaque output is unchanged: straight values, no output-clear override, no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = renderer();
    try {
      r.setClearColor([0.2, 0.4, 0.6], 0.5);
      expect(r.clearColorValue).toEqual([0.2, 0.4, 0.6, 0.5]);
      expect((r as unknown as { outputClearColor: readonly number[] }).outputClearColor).toEqual([0, 0, 0, 0]);
      r.setClearColor([0.1, 0.2, 0.3]);
      expect(r.clearColorValue).toEqual([0.1, 0.2, 0.3, 1]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      r.dispose();
    }
  });
});

describe("2. the alpha-preserving OutputPass route runs the device's neutral curve", () => {
  const variant = { toneMapping: "neutral", backgroundCoverage: false, overlay: false, fullCoverage: true } as const;

  it("opaque and default-curve output sources are byte-identical to 5.6 (golden hashes)", () => {
    // Hashes of the 5.6/next-5.7.0 sources before this change: opaque output compiles exactly the same shaders.
    const golden: Record<string, string> = {
      "srgb|false": "831cbf8fdc15bfae:642a4db99daedbc4",
      "srgb|true": "f3a5b71da43a89a0:1587a5824d69ba68",
      "display-p3|false": "7ee4b03def765089:19c809be0fb8a02f"
    };
    for (const [key, hashes] of Object.entries(golden)) {
      const [outputColorSpace, grade] = key.split("|") as ["srgb" | "display-p3", string];
      const options = { ...variant, outputColorSpace, alphaMode: "opaque" as const, colorGrade: grade === "true" };
      expect(`${sha(outputFragmentGlsl(options))}:${sha(createOutputWgsl(options).webgpu.fragment)}`).toBe(hashes);
      // `neutralCurve: "khronos"` is the default, not a new variant.
      const khronos = { ...options, neutralCurve: "khronos" as const };
      expect(outputFragmentGlsl(khronos)).toBe(outputFragmentGlsl(options));
      expect(createOutputWgsl(khronos).webgpu.fragment).toBe(createOutputWgsl(options).webgpu.fragment);
    }
    for (const alphaMode of ["opaque", "premultiplied"] as const) {
      const source = outputFragmentGlsl({ ...variant, alphaMode });
      expect(source).toContain("#define TONE_MAP(c) NeutralToneMapping(c)");
      expect(source).not.toContain("A3dLegacyNeutralToneMapping");
      expect(createOutputWgsl({ ...variant, alphaMode }).webgpu.fragment).not.toContain("a3dToneNeutralLegacy");
    }
  });

  it("neutralCurve \"legacy\" compiles the fused present's per-channel curve in GLSL and WGSL", () => {
    const glsl = outputFragmentGlsl({ ...variant, alphaMode: "premultiplied", neutralCurve: "legacy" });
    expect(glsl).toContain("#define TONE_MAP(c) A3dLegacyNeutralToneMapping(c)");
    expect(glsl).toContain("return min(vec3(1.0), c * (1.0 + c / 7.5) / (1.0 + c));");
    // The fused LDR present's operator 6 is the same curve.
    expect(ldrFragmentSource({ toneMapping: true, operator: 6, inputSrgb: false, outputSrgb: true, grade: false, sharpening: false, fxaa: false }))
      .toContain("return min(1.0, (x * (1.0 + x / 7.5)) / (1.0 + x));");
    for (const outputColorSpace of ["srgb", "display-p3"] as const) {
      const wgsl = createOutputWgsl({ ...variant, outputColorSpace, alphaMode: "premultiplied", neutralCurve: "legacy" }).webgpu.fragment;
      expect(wgsl).toContain("fn a3dToneNeutralLegacy(");
      expect(wgsl).toContain("a3dToneNeutralLegacy(hdr * aura.u_exposure)");
      expect(wgsl).not.toContain("a3dToneNeutral(hdr * aura.u_exposure)");
    }
    // Other operators ignore the curve; an unknown curve is an error.
    expect(outputFragmentGlsl({ ...variant, toneMapping: "aces", neutralCurve: "legacy" })).toBe(outputFragmentGlsl({ ...variant, toneMapping: "aces" }));
    expect(() => outputFragmentGlsl({ ...variant, neutralCurve: "pbr" as never })).toThrow(/OUTPUT_NEUTRAL_CURVE_UNSUPPORTED/);
    expect(() => createOutputWgsl({ ...variant, neutralCurve: "pbr" as never })).toThrow(/OUTPUT_NEUTRAL_CURVE_UNSUPPORTED/);
  });

  it("OutputPass caches the legacy-curve variant under its own key", () => {
    const d = new MockRenderDevice();
    (d.info as unknown as { capabilities: string[] }).capabilities = [...(d.info.capabilities ?? []), "hdr-render-targets"];
    const scene = createHdrTarget(d, { width: 4, height: 4 });
    const output = d.createRenderTarget({ width: 4, height: 4, format: "rgba8", label: "out" });
    const pass = new OutputPass(d);
    const options = { toneMapping: "neutral", exposure: 1, dithering: false, backgroundCoverage: false, fullCoverage: true, alphaMode: "premultiplied", inputAlphaMode: "premultiplied" } as const;
    const labels = () => [...(d as unknown as { shaders: Set<{ label: string }> }).shaders].map((shader) => shader.label);
    try {
      d.beginFrame(4, 4);
      pass.execute(scene, null, options, output);
      expect(labels().some((label) => label.includes("neutral-legacy"))).toBe(false);
      pass.execute(scene, null, { ...options, neutralCurve: "legacy" }, output);
      d.endFrame();
      expect(labels().filter((label) => label.startsWith("prd01-output-neutral|"))).toHaveLength(2);
      expect(labels().some((label) => label.endsWith("|neutral-legacy"))).toBe(true);
    } finally {
      pass.dispose();
      output.dispose();
      scene.dispose();
    }
  });

  it("the v2 OUT stage passes the device curve only when an alpha request moved an sRGB chain off the fused present", () => {
    const legacyDevice = {};
    const khronosDevice = {};
    setNeutralToneCurve(khronosDevice, "khronos");
    const alpha = { toneMapping: "neutral", alphaMode: "premultiplied", outputColorSpace: "srgb" } as const;
    expect(outputPassNeutralCurve(alpha, legacyDevice)).toEqual({ neutralCurve: "legacy" });
    expect(outputPassNeutralCurve({ ...alpha, alphaMode: "straight" }, legacyDevice)).toEqual({ neutralCurve: "legacy" });
    expect(outputPassNeutralCurve(alpha, khronosDevice)).toEqual({ neutralCurve: "khronos" });
    // Opaque output (the default), Display-P3 (already OutputPass when opaque) and other operators keep the OutputPass default.
    expect(outputPassNeutralCurve({ ...alpha, alphaMode: "opaque" }, legacyDevice)).toEqual({});
    expect(outputPassNeutralCurve({ toneMapping: "neutral" }, legacyDevice)).toEqual({});
    expect(outputPassNeutralCurve({ ...alpha, outputColorSpace: "display-p3" }, legacyDevice)).toEqual({});
    expect(outputPassNeutralCurve({ ...alpha, toneMapping: "aces" }, legacyDevice)).toEqual({});
  });
});

describe("3. alpha-preserving output never writes the indirect-fraction tag into colour alpha", () => {
  type FeaturesFor = (material: PBRMaterial, device: MockRenderDevice, item: RenderItem) => ProgramFeatures;
  const flags = () => createTrustedQrFlags(resolveQrFlags({ options: ["post"], env: { A3D_QR_CORE: "v2" } }).values);

  function features(kind: "webgl2" | "webgpu", setup: (device: MockRenderDevice) => void): Readonly<Record<string, unknown>> {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: kind });
    setRendererQrFlags(flags(), device);
    setup(device);
    const geometry = Geometry.triangle();
    const material = new PBRMaterial();
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", label: "scene" });
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      const pass = new ForwardPass({ items: [] } as never);
      return (pass as unknown as { programFeaturesFor: FeaturesFor }).programFeaturesFor(material, device, { geometry, material }).features;
    } finally {
      target.dispose();
      material.dispose();
      geometry.dispose();
    }
  }

  it("opaque output keeps the tag on both backends", () => {
    for (const kind of ["webgl2", "webgpu"] as const) {
      expect(features(kind, () => undefined)).toHaveProperty("prd03.indirectFraction", "indirectFraction");
    }
  });

  it("an alpha-preserving renderer drops the tag on both backends (forward draws and the feature's own select)", () => {
    for (const kind of ["webgl2", "webgpu"] as const) {
      expect(features(kind, (device) => setOutputAlphaPreserving(device, true))).not.toHaveProperty("prd03.indirectFraction");
    }
    const device = new MockRenderDevice();
    const input = { item: {} as RenderItem, pass: "forward" as const, tier: {} as never, flags: flags(), frameContext: { device } as never };
    expect(indirectFractionFeature.select(input)).toBe("indirectFraction");
    setOutputAlphaPreserving(device, true);
    expect(indirectFractionFeature.select(input)).toBeUndefined();
    setOutputAlphaPreserving(device, false);
    expect(indirectFractionFeature.select(input)).toBe("indirectFraction");
  });

  it("a WebGPU canvas that presents alpha drops the tag even without a renderer policy (its validator rejects it); WebGL2 does not", () => {
    const presenting = (device: MockRenderDevice) => Object.defineProperty(device, "getPresentationAlphaMode", { value: () => "premultiplied" });
    expect(features("webgpu", presenting)).not.toHaveProperty("prd03.indirectFraction");
    expect(features("webgl2", presenting)).toHaveProperty("prd03.indirectFraction", "indirectFraction");
  });

  it("the Renderer sets the device policy from its output options", () => {
    const device = new MockRenderDevice();
    const make = (output?: { alphaMode: "opaque" | "premultiplied"; inputAlphaMode?: "premultiplied" }) =>
      new Renderer(device, { width: 4, height: 4, shaderLibrary: {} as ShaderLibrary, ...(output ? { output } : {}) }, new TemporalHistory());
    const alpha = make({ alphaMode: "premultiplied", inputAlphaMode: "premultiplied" });
    expect(outputAlphaPreserving(device)).toBe(true);
    alpha.dispose();
    const opaque = make();
    expect(outputAlphaPreserving(device)).toBe(false);
    opaque.dispose();
  });
});
