import { describe, expect, it, vi } from "vitest";
import {
  convertColorPrimaries,
  convertColorSpace,
  convertManagedColor,
  convertManagedTextureColor,
  createExternalParityColorManagementPolicy,
  decodeColorTransfer,
  encodeColorTransfer,
  linearToSrgbChannel,
  srgbToLinearChannel,
  transformColorForOutput,
  validateTextureColorSpace
} from "../../../packages/rendering/src/ColorManagement";
import {
  convertProductionColorSpace,
  linearToSrgb,
  srgbToLinear
} from "../../../packages/rendering/src/production-runtime/color/ColorManagement";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import {
  MockRenderDevice,
  type RenderOutputColorSpace,
  type RenderOutputColorSpaceNegotiation,
  type ShaderSources
} from "../../../packages/rendering/src/RenderDevice";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import { createRendererVisualPipelineReport } from "../../../packages/rendering/src/RendererVisualPipelineReport";
import { convertManagedColor as publicConvertManagedColor } from "@aura3d/rendering";
import type { AuraOutputDiagnostics } from "@aura3d/engine";
import type { RendererAppliedOutput } from "../../../packages/rendering/src/Renderer";
import { resolveAppOutputColorPolicy } from "../../../packages/engine/src/agent-api/app/colorManagement";
import type { AuraCreateAppOptions } from "../../../packages/engine/src/agent-api/nodes/types";

function expectChannels(actual: readonly number[], expected: readonly number[], precision = 7): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, precision));
}

function expectDeviceError(action: () => void, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code });
}

describe("scene-referred color management", () => {
  it("preserves extended linear RGB exactly, independently of normalized legacy helpers", () => {
    const scene = [4, -0.25, 1.125, 0.4] as const;
    expect(convertManagedColor(scene, "linear-srgb", "linear-srgb")).toEqual(scene);
    expect(convertManagedColor(scene, "linear-display-p3", "linear-display-p3")).toEqual(scene);
    expect(convertColorSpace(scene, "linear", "linear")).toEqual([1, 0, 1, 0.4]);
    expect(srgbToLinearChannel(-0.5)).toBe(0);
    expect(linearToSrgbChannel(4)).toBeCloseTo(1, 12);
  });

  it("keeps extreme finite linear channels and signed zero unchanged", () => {
    const scene = [Number.MAX_VALUE, -Number.MIN_VALUE, -0, 0.5] as const;
    for (const space of ["linear-srgb", "linear-display-p3"] as const) {
      const output = convertManagedColor(scene, space, space);
      expect(output[0]).toBe(Number.MAX_VALUE);
      expect(output[1]).toBe(-Number.MIN_VALUE);
      expect(Object.is(output[2], -0)).toBe(true);
      expect(output[3]).toBe(0.5);
    }
  });

  it("keeps identical encoded and premultiplied representations bit-exact without overflow", () => {
    const sample = [Number.MAX_VALUE, -Number.MAX_VALUE, -0, 0.25] as const;
    for (const space of ["linear-srgb", "srgb", "linear-display-p3", "display-p3"] as const) {
      for (const mode of ["straight", "premultiplied"] as const) {
        const actual = convertManagedColor(sample, space, space, { inputAlphaMode: mode, outputAlphaMode: mode });
        expect(actual).toEqual(sample);
        expect(Object.is(actual[2], -0)).toBe(true);
      }
    }
    expect(convertProductionColorSpace(sample, "linear", "linear", {
      inputAlphaMode: "premultiplied", outputAlphaMode: "premultiplied"
    })).toEqual(sample);
    expect(convertManagedColor([0.8, 0.2, 0.1, 0], "linear-srgb", "linear-srgb", {
      inputAlphaMode: "premultiplied", outputAlphaMode: "premultiplied"
    })).toEqual([0, 0, 0, 0]);
    expect(convertManagedColor([2, -0.5, 0.5, 0.5], "linear-srgb", "linear-srgb", {
      gamutMapping: "clip"
    })).toEqual([1, 0, 0.5, 0.5]);
  });

  it("derives the D65 primary conversion and retains out-of-gamut values", () => {
    // Reference values computed from the CSS Color 4 D65 XYZ matrices.
    const srgbRedInP3 = convertColorPrimaries([1, 0, 0], "srgb", "display-p3");
    expectChannels(srgbRedInP3, [0.82246197, 0.03319420, 0.01708263], 7);
    const p3RedInSrgb = convertColorPrimaries([1, 0, 0], "display-p3", "srgb");
    expectChannels(p3RedInSrgb, [1.22494018, -0.04205695, -0.01963755], 7);
    expectChannels(convertColorPrimaries([1, 1, 1], "display-p3", "srgb"), [1, 1, 1], 12);

    const extended = [2.5, -0.4, 0.3, 0.75] as const;
    const p3 = convertManagedColor(extended, "linear-srgb", "linear-display-p3");
    expectChannels(convertManagedColor(p3, "linear-display-p3", "linear-srgb"), extended, 11);
    expect(convertManagedColor([1, 0, 0, 1], "linear-display-p3", "linear-srgb")[0]).toBeGreaterThan(1);
    expect(convertManagedColor([1, 0, 0, 1], "linear-display-p3", "linear-srgb")[1]).toBeLessThan(0);
  });

  it("round-trips the sign-extended sRGB transfer across SDR and HDR", () => {
    expect(decodeColorTransfer(0.5, "srgb")).toBeCloseTo(0.21404114048223255, 12);
    expect(decodeColorTransfer(-0.5, "srgb")).toBeCloseTo(-0.21404114048223255, 12);
    for (const value of [-4, -1, -0.18, -0.003, 0, 0.003, 0.18, 1, 4]) {
      expect(decodeColorTransfer(encodeColorTransfer(value, "srgb"), "srgb")).toBeCloseTo(value, 11);
      expect(encodeColorTransfer(decodeColorTransfer(value, "srgb"), "srgb")).toBeCloseTo(value, 11);
    }
    expect(decodeColorTransfer(3, "linear")).toBe(3);
    expect(encodeColorTransfer(-2, "linear")).toBe(-2);
  });

  it("unassociates and re-associates alpha without applying a transfer to alpha", () => {
    const encodedPremultiplied = [0.5, 0.25, 0, 0.5] as const;
    const linear = convertManagedColor(encodedPremultiplied, "srgb", "linear-srgb", {
      inputAlphaMode: "premultiplied"
    });
    expectChannels(linear, [1, 0.21404114048223255, 0, 0.5], 12);
    expectChannels(convertManagedColor(linear, "linear-srgb", "srgb", {
      outputAlphaMode: "premultiplied"
    }), encodedPremultiplied, 12);
    expect(convertManagedColor([0, 0, 0, 0], "srgb", "linear-srgb", {
      inputAlphaMode: "premultiplied", outputAlphaMode: "premultiplied"
    })).toEqual([0, 0, 0, 0]);
  });

  it("converts premultiplied linear compositing results before display encoding", () => {
    const blended = [0.5, 0, 0, 0.5] as const;
    const straight = transformColorForOutput(blended, "linear-srgb", "srgb", {
      inputAlphaMode: "premultiplied", outputAlphaMode: "straight"
    });
    const premultiplied = transformColorForOutput(blended, "linear-srgb", "srgb", {
      inputAlphaMode: "premultiplied", outputAlphaMode: "premultiplied"
    });
    expectChannels(straight, [1, 0, 0, 0.5], 12);
    expectChannels(premultiplied, [0.5, 0, 0, 0.5], 12);
    expect(transformColorForOutput([0, 0, 0, 0], "linear-srgb", "srgb", {
      inputAlphaMode: "premultiplied", outputAlphaMode: "premultiplied"
    })).toEqual([0, 0, 0, 0]);
  });

  it("treats data channels as numbers and converts color and environment maps", () => {
    const sample = [-0.3, 0.5, 2, 4] as const;
    for (const semantic of ["normal", "roughness", "metallic-roughness", "occlusion", "height", "transmission", "specular", "anisotropy", "iridescence"] as const) {
      expect(convertManagedTextureColor(sample, semantic, "srgb", "linear-display-p3")).toEqual(sample);
    }
    const colorSample = [0.5, 0.5, 0.5, 0.3] as const;
    expectChannels(convertManagedTextureColor(colorSample, "base-color", "srgb", "linear-srgb"), [0.21404114048223255, 0.21404114048223255, 0.21404114048223255, 0.3], 12);
    expectChannels(convertManagedTextureColor([1, 0, 0, 1], "environment", "linear-display-p3", "linear-srgb"), [1.22494018, -0.04205695, -0.01963755, 1], 7);
    expect(() => convertManagedTextureColor(sample, "normal", "srgb", "linear-srgb", { gamutMapping: "clip" })).toThrow(/Data textures/);
  });

  it("applies exposure, tone, destination gamut and output transfer in order", () => {
    const scene = [2, 0.5, -0.25, 0.4] as const;
    const output = transformColorForOutput(scene, "linear-srgb", "srgb", { exposure: 2, toneMapping: "reinhard" });
    expectChannels(output, [encodeColorTransfer(0.8, "srgb"), encodeColorTransfer(0.5, "srgb"), 0, 0.4], 12);
    expectChannels(transformColorForOutput(scene, "linear-srgb", "linear-srgb", { exposure: 2, toneMapping: "reinhard", gamutMapping: "preserve" }), [0.8, 0.5, -0.5, 0.4], 12);
    expectChannels(transformColorForOutput([1, 0, 0, 1], "linear-display-p3", "linear-srgb"), [1, 0, 0, 1], 12);
  });

  it("routes the production API through the same shared implementation", () => {
    expect(srgbToLinear(-0.5)).toBe(decodeColorTransfer(-0.5, "srgb"));
    expect(linearToSrgb(4)).toBe(encodeColorTransfer(4, "srgb"));
    const input = [1.4, 0.2, -0.1, 0.8] as const;
    expectChannels(convertProductionColorSpace(input, "linear", "display-p3"), convertManagedColor(input, "linear-srgb", "display-p3"), 12);
    expectChannels(convertProductionColorSpace(input, "display-p3", "linear"), convertManagedColor(input, "display-p3", "linear-srgb"), 12);
  });

  it("exports the scene-referred conversion through the rendering package entrypoint", () => {
    expect(publicConvertManagedColor([4, -1, 0.5, 1], "linear-srgb", "linear-srgb")).toEqual([4, -1, 0.5, 1]);
  });

  it("rejects invalid spaces, channels, alpha and stage options", () => {
    expect(() => convertManagedColor([NaN, 0, 0, 1], "linear-srgb", "srgb")).toThrow(/finite/);
    expect(() => convertManagedColor([0, 0, 0, Infinity], "linear-srgb", "srgb")).toThrow(/finite/);
    expect(() => convertManagedColor([0, 0, 0, 1.1], "linear-srgb", "srgb")).toThrow(/Alpha/);
    expect(() => convertManagedColor([0, 0, 0, 1], "bad" as never, "srgb")).toThrow(/space/);
    expect(() => convertColorPrimaries([0, 0, 0], "bad" as never, "srgb")).toThrow(/primaries/);
    expect(() => decodeColorTransfer(0, "bad" as never)).toThrow(/transfer/);
    expect(() => convertManagedColor([0, 0, 0, 1], "srgb", "srgb", { inputAlphaMode: "bad" as never })).toThrow(/alpha mode/);
    expect(() => convertManagedColor([0, 0, 0, 1], "srgb", "srgb", { gamutMapping: "bad" as never })).toThrow(/gamut/);
    expect(() => transformColorForOutput([0, 0, 0, 1], "linear-srgb", "srgb", { exposure: -1 })).toThrow(/Exposure/);
    expect(() => transformColorForOutput([0, 0, 0, 1], "linear-srgb", "srgb", { toneMapping: "bad" as never })).toThrow(/tone mapping/);
    expect(() => convertManagedTextureColor([0, 0, 0, 1], "bad" as never, "srgb", "srgb")).toThrow(/semantic/);
  });

  it.each([
    ["inputAlphaMode", /alpha mode/i],
    ["outputAlphaMode", /alpha mode/i],
    ["gamutMapping", /gamut mapping/i]
  ])("rejects explicit null %s instead of silently selecting a default", (field, error) => {
    const options = { [field]: null } as never;
    expect(() => convertManagedColor([0, 0, 0, 1], "linear-srgb", "srgb", options)).toThrow(error);
    expect(() => convertManagedTextureColor([0, 0, 0, 1], "normal", "linear-srgb", "srgb", options)).toThrow(error);
    expect(() => transformColorForOutput([0, 0, 0, 1], "linear-srgb", "srgb", options)).toThrow(error);
  });

  it.each([
    ["toneMapping", /tone mapping/i],
    ["exposure", /Exposure/]
  ])("rejects explicit null output %s", (field, error) => {
    expect(() => transformColorForOutput([0, 0, 0, 1], "linear-srgb", "srgb", { [field]: null } as never)).toThrow(error);
  });

  it("rejects invalid legacy spaces and texture policies without changing normalized conversion", () => {
    expect(() => convertColorSpace([0, 0, 0, 1], "not-a-space" as never, "linear")).toThrow(/color space/i);
    expect(() => convertColorSpace([0, 0, 0, 1], "linear", "not-a-space" as never)).toThrow(/color space/i);
    expect(() => createExternalParityColorManagementPolicy({ outputColorSpace: null as never })).toThrow(/color space/i);
    expect(() => createExternalParityColorManagementPolicy({ allowLdrFallback: "yes" as never })).toThrow(/fallback/i);
    expect(() => validateTextureColorSpace("unknown" as never, "linear")).toThrow(/semantic/i);
    expect(() => validateTextureColorSpace("normal", "unknown" as never)).toThrow(/color space/i);
    expect(convertColorSpace([4, -0.25, 0.5, 1], "linear", "linear")).toEqual([1, 0, 0.5, 1]);
  });
});

/** A context-shaped test double; it performs no browser or GPU work. */
function createColorContext(mode: "absent" | "accept" | "reject" | "mismatch", floatTarget = false) {
  let selected = "srgb";
  const setCalls: string[] = [];
  const constants = new Map<string, number>();
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, constants.size + 0x10000);
    return constants.get(name)!;
  };
  const glValues: Record<string, unknown> = {
    NO_ERROR: 0,
    getError: () => 0,
    getParameter: () => 8,
    getExtension: (name: string) => (name === "EXT_color_buffer_float" && floatTarget ? {} : null)
  };
  if (mode !== "absent") {
    Object.defineProperty(glValues, "drawingBufferColorSpace", {
      configurable: true,
      get: () => selected,
      set: (value: string) => {
        setCalls.push(value);
        if (mode === "reject" && value === "display-p3") throw new Error("Unsupported color space");
        if (mode === "mismatch" && value === "display-p3") return;
        selected = value;
      }
    });
  }
  const gl = new Proxy(glValues, {
    get(target, property) {
      const name = String(property);
      if (Reflect.has(target, property)) return Reflect.get(target, property);
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      if (name.startsWith("create")) return () => ({});
      return () => undefined;
    }
  }) as unknown as WebGL2RenderingContext;
  let added = 0;
  let removed = 0;
  const canvas = {
    getContext: (type: string) => type === "webgl2" ? gl : null,
    addEventListener: () => { added++; },
    removeEventListener: () => { removed++; }
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  return { device, setCalls, selected: () => selected, listeners: () => ({ added, removed }) };
}

describe("WebGL2 output color negotiation", () => {
  it("leaves the context unnegotiated until requested and defaults to sRGB", () => {
    const { device, selected, setCalls, listeners } = createColorContext("accept");
    expect(device.getOutputColorSpaceNegotiation()).toBeUndefined();
    expect(device.negotiateOutputColorSpace()).toEqual({ requested: "srgb", active: "srgb", supported: ["srgb"] });
    expect(selected()).toBe("srgb");
    expect(setCalls).toEqual(["srgb"]);
    device.dispose();
    expect(listeners().removed).toBe(listeners().added);
    expect(() => device.negotiateOutputColorSpace("display-p3")).toThrow(/disposed/i);
  });

  it("selects Display-P3 only after the context confirms the value", () => {
    const { device, selected } = createColorContext("accept");
    expect(device.negotiateOutputColorSpace("display-p3")).toEqual({
      requested: "display-p3", active: "display-p3", supported: ["srgb", "display-p3"]
    });
    expect(selected()).toBe("display-p3");
    expect(device.getOutputColorSpaceNegotiation()?.active).toBe("display-p3");
    expect(device.negotiateOutputColorSpace("srgb")).toEqual({
      requested: "srgb", active: "srgb", supported: ["srgb", "display-p3"]
    });
    device.dispose();
  });

  it.each(["absent", "reject", "mismatch"] as const)("reports an sRGB fallback for %s contexts", (mode) => {
    const { device, selected } = createColorContext(mode);
    const result = device.negotiateOutputColorSpace("display-p3");
    expect(result).toMatchObject({ requested: "display-p3", active: "srgb", supported: ["srgb"] });
    expect(result.fallbackReason).toMatch(/unavailable|did not accept/i);
    expect(selected()).toBe("srgb");
    expect(device.getOutputColorSpaceNegotiation()).toEqual(result);
    device.dispose();
  });

  it("keeps negotiation and cleanup independent for two contexts", () => {
    const first = createColorContext("accept");
    const second = createColorContext("mismatch");
    first.device.negotiateOutputColorSpace("display-p3");
    second.device.negotiateOutputColorSpace("display-p3");
    expect(first.selected()).toBe("display-p3");
    expect(second.selected()).toBe("srgb");
    expect(first.device.getOutputColorSpaceNegotiation()?.active).toBe("display-p3");
    expect(second.device.getOutputColorSpaceNegotiation()?.active).toBe("srgb");
    first.device.dispose();
    expect(second.device.negotiateOutputColorSpace("srgb").active).toBe("srgb");
    second.device.dispose();
    expect(first.listeners().removed).toBe(first.listeners().added);
    expect(second.listeners().removed).toBe(second.listeners().added);
  });
});

/** MockRenderDevice records shader sources and emulates one negotiated context. */
class OutputTestDevice extends MockRenderDevice {
  readonly shaderSources: ShaderSources[] = [];
  private negotiation?: RenderOutputColorSpaceNegotiation;
  presentationAlphaMode: "opaque" | "straight" | "premultiplied" = "opaque";

  constructor(private readonly acceptsP3: boolean) {
    super();
  }

  override negotiateOutputColorSpace(requested: RenderOutputColorSpace = "srgb"): RenderOutputColorSpaceNegotiation {
    const active = requested === "display-p3" && this.acceptsP3 ? "display-p3" : "srgb";
    this.negotiation = {
      requested,
      active,
      supported: this.acceptsP3 && requested === "display-p3" ? ["srgb", "display-p3"] : ["srgb"],
      ...(requested !== active ? { fallbackReason: "Display-P3 unavailable" } : {})
    };
    return this.negotiation;
  }

  override getOutputColorSpaceNegotiation(): RenderOutputColorSpaceNegotiation | undefined {
    return this.negotiation;
  }

  getPresentationAlphaMode(): "opaque" | "straight" | "premultiplied" {
    return this.presentationAlphaMode;
  }

  override createShaderProgram(sources: ShaderSources) {
    this.shaderSources.push(sources);
    return super.createShaderProgram(sources);
  }
}

const baseOutputOptions = { toneMapping: "reinhard", exposure: 1, dithering: false, backgroundCoverage: false } as const;

describe("app output color policy", () => {
  it("exposes every renderer output degradation through the public diagnostic contract", () => {
    const degradations: readonly NonNullable<RendererAppliedOutput["degraded"]>[] = [
      "rgba8-no-float-target", "hdr-msaa-mrt-unsupported", "hdr-msaa-depth-unsupported"
    ];
    for (const degraded of degradations) {
      const actual: RendererAppliedOutput = {
        toneMapping: "aces", exposure: { applied: 1, source: "output" },
        dithering: false, targetFormat: "rgba16f", degraded
      };
      const publicDiagnostics: AuraOutputDiagnostics = actual;
      expect(publicDiagnostics.degraded).toBe(degraded);
    }
  });

  it("accepts both public app output option locations", () => {
    const topLevel = { output: { outputColorSpace: "display-p3", alphaMode: "straight" } } satisfies Pick<AuraCreateAppOptions, "output">;
    const renderer = { renderer: { output: { outputColorSpace: "srgb", alphaMode: "premultiplied" } } } satisfies Pick<AuraCreateAppOptions, "renderer">;
    expect(resolveAppOutputColorPolicy(topLevel.output)).toEqual({ outputColorSpace: "display-p3", alphaMode: "straight" });
    expect(resolveAppOutputColorPolicy(renderer.renderer.output)).toEqual({ outputColorSpace: "srgb", alphaMode: "premultiplied" });
  });

  it("resolves defaults and explicit choices per app without shared mutable state", () => {
    const defaults = resolveAppOutputColorPolicy();
    const wide = resolveAppOutputColorPolicy({ outputColorSpace: "display-p3", alphaMode: "premultiplied" });
    const narrow = resolveAppOutputColorPolicy({ outputColorSpace: "srgb", alphaMode: "straight" });
    expect(defaults).toEqual({ outputColorSpace: "srgb", alphaMode: "opaque" });
    expect(wide).toEqual({ outputColorSpace: "display-p3", alphaMode: "premultiplied" });
    expect(narrow).toEqual({ outputColorSpace: "srgb", alphaMode: "straight" });
    expect(wide).not.toBe(narrow);
    expect(resolveAppOutputColorPolicy()).toEqual(defaults);
  });

  it("rejects unrecognized output color space and alpha options at runtime", () => {
    expect(() => resolveAppOutputColorPolicy({ outputColorSpace: "unknown" as never })).toThrow(/color space/i);
    expect(() => resolveAppOutputColorPolicy({ alphaMode: "unknown" as never })).toThrow(/alpha mode/i);
    expect(() => resolveAppOutputColorPolicy({ outputColorSpace: null as never })).toThrow(/color space/i);
    expect(() => resolveAppOutputColorPolicy({ alphaMode: null as never })).toThrow(/alpha mode/i);
    for (const value of [null, [], 0, "srgb"]) {
      expect(() => resolveAppOutputColorPolicy(value as never)).toThrow(/output.*policy/i);
    }
  });
});

describe("negotiated output pass and diagnostics", () => {
  it.each([
    ["toneMapping", "bogus", /OUTPUT_TONE_MAPPING_UNSUPPORTED/],
    ["toneMapping", null, /OUTPUT_TONE_MAPPING_UNSUPPORTED/],
    ["outputColorSpace", null, /OUTPUT_COLOR_SPACE_UNSUPPORTED/],
    ["alphaMode", null, /OUTPUT_ALPHA_MODE_UNSUPPORTED/],
    ["exposure", -1, /OUTPUT_EXPOSURE_UNSUPPORTED/],
    ["exposure", Infinity, /OUTPUT_EXPOSURE_UNSUPPORTED/],
    ["exposure", NaN, /OUTPUT_EXPOSURE_UNSUPPORTED/]
  ])("rejects unsupported %s=%s before negotiating or drawing", (field, value, error) => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    try {
      expect(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3", [field]: value } as never, "canvas")).toThrow(error);
      expect(device.getOutputColorSpaceNegotiation()).toBeUndefined();
      expect(device.drawCommands).toHaveLength(0);
      expect(device.shaderSources).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("rejects an unverified alpha mode before altering an already configured gamut", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.negotiateOutputColorSpace("srgb");
    device.beginFrame(1, 1);
    try {
      expect(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3", alphaMode: "straight" }, "canvas")).toThrow(/OUTPUT_ALPHA_MODE_UNAVAILABLE/);
      expect(device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "srgb", active: "srgb" });
      expect(device.shaderSources).toHaveLength(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("rejects an unverified source association before negotiating the canvas gamut", () => {
    const device = new OutputTestDevice(true);
    device.presentationAlphaMode = "straight";
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.negotiateOutputColorSpace("srgb");
    device.beginFrame(1, 1);
    try {
      expectDeviceError(() => pass.execute(target, null, {
        ...baseOutputOptions, outputColorSpace: "display-p3", alphaMode: "straight"
      }, "canvas"), "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE");
      expect(device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "srgb", active: "srgb" });
      expect(device.shaderSources).toHaveLength(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("rejects missing requested coverage instead of sampling scene color or ignoring the policy", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    try {
      for (const coverage of [null, target]) {
        expectDeviceError(() => pass.execute(target, coverage, { ...baseOutputOptions, backgroundCoverage: true, outputColorSpace: "display-p3" }, "canvas"), "OUTPUT_COVERAGE_UNAVAILABLE");
      }
      expect(device.getOutputColorSpaceNegotiation()).toBeUndefined();
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("samples the first attachment of a separate coverage target", () => {
    const device = new OutputTestDevice(true);
    const scene = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const coverage = device.createRenderTarget({
      width: 1, height: 1, depth: false, colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }]
    });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    try {
      pass.execute(scene, coverage, { ...baseOutputOptions, backgroundCoverage: true }, "canvas");
      const binding = device.drawCommands.at(-1)?.uniforms?.get("u_coverage") as { readonly texture?: unknown };
      expect(binding.texture).toBe(coverage.colorTexture);
    } finally {
      device.endFrame();
      pass.dispose();
      scene.dispose();
      coverage.dispose();
      device.dispose();
    }
  });

  it("uses an already negotiated gamut when a device can inspect but not renegotiate", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.negotiateOutputColorSpace("display-p3");
    Object.defineProperty(device, "negotiateOutputColorSpace", { value: undefined, configurable: true });
    device.beginFrame(1, 1);
    try {
      pass.execute(target, null, baseOutputOptions, "canvas");
      expect(device.shaderSources[0]?.fragment).toMatch(/^#define OUTPUT_DISPLAY_P3$/m);
      expectDeviceError(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "srgb" }, "canvas"), "OUTPUT_COLOR_SPACE_UNAVAILABLE");
      expect(device.drawCommands).toHaveLength(1);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("does not silently claim an unrepresentable Display-P3 fallback", () => {
    const device = new OutputTestDevice(false);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    Object.defineProperty(device, "negotiateOutputColorSpace", { value: undefined, configurable: true });
    device.beginFrame(1, 1);
    try {
      expectDeviceError(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3" }, "canvas"), "OUTPUT_COLOR_SPACE_UNAVAILABLE");
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("rejects inconsistent or unexplained color negotiation results", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    const negotiate = vi.spyOn(device, "negotiateOutputColorSpace");
    device.beginFrame(1, 1);
    try {
      for (const result of [
        { requested: "srgb", active: "display-p3", supported: ["srgb", "display-p3"] },
        { requested: "display-p3", active: "display-p3", supported: ["srgb"] },
        { requested: "display-p3", active: "srgb", supported: ["srgb"] },
        { requested: "display-p3", active: "display-p3", supported: ["srgb", "display-p3", "rec2020"] }
      ]) {
        negotiate.mockReturnValue(result as never);
        expectDeviceError(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3" }, "canvas"), "OUTPUT_COLOR_SPACE_UNVERIFIED");
      }
      expect(device.drawCommands).toHaveLength(0);
      expect(device.shaderSources).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it("rejects a returned gamut that disagrees with the device's active snapshot", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.negotiateOutputColorSpace("srgb");
    vi.spyOn(device, "negotiateOutputColorSpace").mockReturnValue({
      requested: "display-p3", active: "display-p3", supported: ["srgb", "display-p3"]
    });
    device.beginFrame(1, 1);
    try {
      expectDeviceError(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3" }, "canvas"), "OUTPUT_COLOR_SPACE_UNVERIFIED");
      expect(device.drawCommands).toHaveLength(0);
      expect(device.shaderSources).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
      vi.restoreAllMocks();
    }
  });

  it("rejects a fallback result when the current snapshot loses the original P3 request", () => {
    const device = new OutputTestDevice(false);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.negotiateOutputColorSpace("srgb");
    vi.spyOn(device, "negotiateOutputColorSpace").mockReturnValue({
      requested: "display-p3", active: "srgb", supported: ["srgb"], fallbackReason: "Display-P3 unavailable"
    });
    device.beginFrame(1, 1);
    try {
      expectDeviceError(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3" }, "canvas"), "OUTPUT_COLOR_SPACE_UNVERIFIED");
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
      vi.restoreAllMocks();
    }
  });

  it("does not accept a stale P3 fallback snapshot as an unscoped sRGB request", () => {
    const device = new OutputTestDevice(false);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.negotiateOutputColorSpace("display-p3");
    vi.spyOn(device, "negotiateOutputColorSpace").mockReturnValue({
      requested: "srgb", active: "srgb", supported: ["srgb"]
    });
    device.beginFrame(1, 1);
    try {
      expectDeviceError(() => pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "srgb" }, "canvas"), "OUTPUT_COLOR_SPACE_UNVERIFIED");
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      target.dispose();
      device.dispose();
      vi.restoreAllMocks();
    }
  });

  it("rechecks the canvas gamut and alpha immediately before drawing", () => {
    for (const changed of ["gamut", "alpha"] as const) {
      const device = new OutputTestDevice(true);
      device.presentationAlphaMode = "straight";
      const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
      const previous = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
      const pass = new OutputPass(device);
      device.beginFrame(1, 1);
      device.setRenderTarget(previous);
      const setRenderTarget = device.setRenderTarget.bind(device);
      const bind = vi.spyOn(device, "setRenderTarget").mockImplementation((next) => {
        setRenderTarget(next);
        if (next === null) {
          if (changed === "gamut") device.negotiateOutputColorSpace("srgb");
          else device.presentationAlphaMode = "premultiplied";
        }
      });
      try {
        const action = () => pass.execute(target, null, {
          ...baseOutputOptions, outputColorSpace: "display-p3", alphaMode: "straight", inputAlphaMode: "premultiplied"
        }, "canvas");
        if (changed === "gamut") expectDeviceError(action, "OUTPUT_COLOR_SPACE_UNVERIFIED");
        else expect(action).toThrow(/OUTPUT_ALPHA_MODE_UNAVAILABLE/);
        expect(device.getRenderTarget()).toBe(previous);
        expect(device.drawCommands).toHaveLength(0);
      } finally {
        bind.mockRestore();
        device.endFrame();
        pass.dispose();
        target.dispose();
        previous.dispose();
        device.dispose();
      }
    }
  });

  it("rejects ordinary offscreen attachment feedback before compiling", () => {
    const device = new OutputTestDevice(true);
    const scene = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const coverage = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    try {
      expectDeviceError(() => pass.execute(scene, null, baseOutputOptions, scene), "OUTPUT_ATTACHMENT_FEEDBACK");
      expectDeviceError(() => pass.execute(scene, coverage, { ...baseOutputOptions, backgroundCoverage: true }, coverage), "OUTPUT_ATTACHMENT_FEEDBACK");
      expect(device.drawCommands).toHaveLength(0);
      expect(device.shaderSources).toHaveLength(0);
    } finally {
      device.endFrame();
      pass.dispose();
      scene.dispose();
      coverage.dispose();
      device.dispose();
    }
  });

  it("selects shader variants by active canvas gamut and explicit alpha mode", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    device.presentationAlphaMode = "straight";
    pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3", alphaMode: "straight", inputAlphaMode: "premultiplied" }, "canvas");
    expect(device.getOutputColorSpaceNegotiation()?.active).toBe("display-p3");
    expect(device.shaderSources[0]?.fragment).toMatch(/^#define OUTPUT_DISPLAY_P3$/m);
    expect(device.shaderSources[0]?.fragment).toMatch(/^#define OUTPUT_ALPHA_PRESERVE$/m);
    expect(device.shaderSources[0]?.fragment).not.toMatch(/^#define OUTPUT_ALPHA_PREMULTIPLIED$/m);

    pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3", alphaMode: "straight", inputAlphaMode: "premultiplied" }, "canvas");
    expect(device.shaderSources).toHaveLength(1);
    // Omitted output policy retains the app's already negotiated destination.
    pass.execute(target, null, { ...baseOutputOptions, alphaMode: "straight", inputAlphaMode: "premultiplied" }, "canvas");
    expect(device.getOutputColorSpaceNegotiation()?.active).toBe("display-p3");
    expect(device.shaderSources).toHaveLength(1);
    device.presentationAlphaMode = "premultiplied";
    pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3", alphaMode: "premultiplied", inputAlphaMode: "premultiplied" }, "canvas");
    expect(device.shaderSources).toHaveLength(2);
    expect(device.shaderSources[1]?.fragment).toMatch(/^#define OUTPUT_ALPHA_PREMULTIPLIED$/m);
    pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "srgb" }, "canvas");
    expect(device.shaderSources).toHaveLength(3);
    expect(device.shaderSources[2]?.fragment).not.toMatch(/^#define OUTPUT_DISPLAY_P3$/m);
    expect(device.shaderSources[2]?.fragment).not.toMatch(/^#define OUTPUT_ALPHA_PRESERVE$/m);
    device.endFrame();
    pass.dispose();
    expect(device.getDiagnostics().shaders).toBe(0);
    target.dispose();
    device.dispose();
  });

  it("rejects canvas alpha modes not verified by the presentation surface", () => {
    const device = new OutputTestDevice(true);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    expect(() => pass.execute(target, null, { ...baseOutputOptions, alphaMode: "straight" }, "canvas")).toThrow(/OUTPUT_ALPHA_MODE_UNAVAILABLE/);
    expect(device.shaderSources).toHaveLength(0);
    device.endFrame();
    pass.dispose();
    target.dispose();
    device.dispose();
  });

  it("uses the sRGB shader when Display-P3 negotiation falls back", () => {
    const device = new OutputTestDevice(false);
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const pass = new OutputPass(device);
    device.beginFrame(1, 1);
    pass.execute(target, null, { ...baseOutputOptions, outputColorSpace: "display-p3" }, "canvas");
    expect(device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb", fallbackReason: "Display-P3 unavailable" });
    expect(device.shaderSources[0]?.fragment).not.toMatch(/^#define OUTPUT_DISPLAY_P3$/m);
    device.endFrame();
    pass.dispose();
    target.dispose();
    device.dispose();
  });

  it("distinguishes float intermediates, verified wide gamut and unverified HDR display", () => {
    const unnegotiated = createColorContext("accept", true);
    let report = createRendererVisualPipelineReport({ device: unnegotiated.device, width: 1, height: 1, postprocess: { targetFormat: "rgba16f", toneMapping: {} } });
    expect(report.hdrTarget).toMatchObject({ requested: true, supportedByBackend: true, targetFormat: "rgba16f" });
    expect(report.color).toMatchObject({
      activeOutputColorSpace: null,
      negotiationVerified: false,
      wideGamutOutput: false,
      floatIntermediateSupported: true,
      floatIntermediateRendering: null,
      physicalHdrDisplay: "unverified"
    });
    unnegotiated.device.negotiateOutputColorSpace("display-p3");
    report = createRendererVisualPipelineReport({
      device: unnegotiated.device, width: 1, height: 1,
      postprocess: { targetFormat: "rgba16f", toneMapping: {} },
      screenshot: { width: 1, height: 1, byteLength: 4 }
    });
    expect(report.color).toMatchObject({
      requestedOutputColorSpace: "display-p3",
      activeOutputColorSpace: "display-p3",
      outputColorSpace: "display-p3",
      negotiationVerified: true,
      wideGamutOutput: true,
      physicalHdrDisplay: "unverified"
    });
    expect(report.color.supportedOutputColorSpaces).toContain("display-p3");
    expect(report.color.unsupportedOutputColorSpaces).not.toContain("display-p3");
    expect(report.screenshot?.colorSpace).toBe("display-p3");
    expect(report.postprocess.presentationColorSpace).toBe("display-p3");
    unnegotiated.device.dispose();
  });

  it("reports requested P3 separately from the active fallback", () => {
    const { device } = createColorContext("reject", true);
    device.negotiateOutputColorSpace("display-p3");
    const report = createRendererVisualPipelineReport({ device, width: 1, height: 1 });
    expect(report.color).toMatchObject({
      requestedOutputColorSpace: "display-p3",
      activeOutputColorSpace: "srgb",
      outputColorSpace: "srgb",
      negotiationVerified: true,
      wideGamutOutput: false,
      physicalHdrDisplay: "unverified"
    });
    expect(report.color.fallbackReason).toMatch(/did not accept/i);
    expect(report.color.supportedOutputColorSpaces).not.toContain("display-p3");
    device.dispose();
  });

  it("does not report a previously supported P3 route as usable after an active P3 fallback", () => {
    const device = new OutputTestDevice(true);
    vi.spyOn(device, "getOutputColorSpaceNegotiation").mockReturnValue({
      requested: "display-p3",
      active: "srgb",
      supported: ["srgb", "display-p3"],
      fallbackReason: "The current canvas cannot present Display-P3"
    });
    const report = createRendererVisualPipelineReport({ device, width: 1, height: 1 });
    expect(report.color.activeOutputColorSpace).toBe("srgb");
    expect(report.color.supportedOutputColorSpaces).not.toContain("display-p3");
    expect(report.color.unsupportedOutputColorSpaces).toContain("display-p3");
    expect(report.unsupportedCapabilities["display-p3-output"]).toMatch(/current canvas/i);
    device.dispose();
    vi.restoreAllMocks();
  });

  it("rejects malformed color-space capability and fallback metadata in reports", () => {
    const device = new OutputTestDevice(true);
    const inspect = vi.spyOn(device, "getOutputColorSpaceNegotiation");
    for (const result of [
      { requested: "srgb", active: "srgb", supported: ["srgb", "rec2020"] },
      { requested: "srgb", active: "srgb", supported: ["srgb"], fallbackReason: 42 },
      { requested: "display-p3", active: "srgb", supported: ["srgb"], fallbackReason: " " }
    ]) {
      inspect.mockReturnValue(result as never);
      expect(() => createRendererVisualPipelineReport({ device, width: 1, height: 1 })).toThrow(/Invalid output color-space negotiation/);
    }
    inspect.mockRestore();
    device.dispose();
  });

  it("prefers the device's current fallback over a stale caller snapshot", () => {
    const device = new OutputTestDevice(false);
    const stale: RenderOutputColorSpaceNegotiation = {
      requested: "display-p3", active: "display-p3", supported: ["srgb", "display-p3"]
    };
    device.negotiateOutputColorSpace("display-p3");
    const report = createRendererVisualPipelineReport({ device, width: 1, height: 1, outputNegotiation: stale });
    expect(report.color).toMatchObject({
      requestedOutputColorSpace: "display-p3", activeOutputColorSpace: "srgb",
      wideGamutOutput: false, fallbackReason: "Display-P3 unavailable"
    });
    device.dispose();
  });

  it("does not treat a stale snapshot as active when an authoritative device has no negotiation", () => {
    const device = new OutputTestDevice(true);
    const report = createRendererVisualPipelineReport({
      device, width: 1, height: 1,
      outputNegotiation: { requested: "display-p3", active: "display-p3", supported: ["srgb", "display-p3"] }
    });
    expect(report.color).toMatchObject({ activeOutputColorSpace: null, negotiationVerified: false, wideGamutOutput: false });
    device.dispose();
  });

  it("separates requested float targets from an observed rendering state", () => {
    const { device } = createColorContext("accept", true);
    const options = { device, width: 1, height: 1, postprocess: { targetFormat: "rgba16f" as const, toneMapping: {} } };
    expect(createRendererVisualPipelineReport(options).color.floatIntermediateRendering).toBeNull();
    expect(createRendererVisualPipelineReport({ ...options, observedFloatIntermediateRendering: true }).color.floatIntermediateRendering).toBe(true);
    expect(createRendererVisualPipelineReport({ ...options, observedFloatIntermediateRendering: false }).color.floatIntermediateRendering).toBe(false);
    expect(() => createRendererVisualPipelineReport({ device, width: 1, height: 1, observedFloatIntermediateRendering: true })).toThrow(/float intermediate/i);
    device.dispose();
  });
});
