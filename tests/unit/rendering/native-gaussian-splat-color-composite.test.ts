import { describe, expect, it } from "vitest";
import { MockRenderDevice, type DrawCommand, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { GaussianSplatRenderer } from "../../../packages/rendering/src/GaussianSplatRenderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import {
  GaussianSplatColorComposite,
  transferGaussianSplatColor,
  type GaussianSplatAlphaAssociation,
  type GaussianSplatColorAdapter,
  type GaussianSplatColorScratch,
  type GaussianSplatTransfer
} from "../../../packages/rendering/src/GaussianSplatColorComposite";

type Pixel = [number, number, number, number];
const encode = (c: number): number => Math.sign(c) * (Math.abs(c) <= 0.0031308 ? 12.92 * Math.abs(c) : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055);
const decode = (c: number): number => Math.sign(c) * (Math.abs(c) <= 0.04045 ? Math.abs(c) / 12.92 : ((Math.abs(c) + 0.055) / 1.055) ** 2.4);

function expectPixel(actual: readonly number[], expected: readonly number[], precision = 10): void {
  expect(actual).toHaveLength(4);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, precision));
}

class Scratch implements GaussianSplatColorScratch {
  disposed = false;
  pixels: Pixel[] = [];
  constructor(readonly byteLength: number) {}
  dispose(): void { this.disposed = true; }
}

/** A per-sample software adapter: useful for ordering/depth contracts, not GPU evidence. */
class ColorDevice extends MockRenderDevice {
  generation = 1;
  pixels: Pixel[] = [];
  depths: number[] = [];
  events: string[] = [];
  adapters: Array<{ disposed: boolean; scratches: Scratch[] }> = [];
  activeScratch: Scratch | null = null;
  allocatedBytesAdjustment = 0;

  createGaussianSplatColorAdapter(): GaussianSplatColorAdapter {
    const state = { disposed: false, scratches: [] as Scratch[] };
    this.adapters.push(state);
    return {
      createScratch: (target) => {
        this.events.push("create");
        const scratch = new Scratch(target.width * target.height * (target.sampleCount ?? 1) * 16 + this.allocatedBytesAdjustment);
        state.scratches.push(scratch);
        return scratch;
      },
      transfer: (_target: RenderTarget, base: GaussianSplatColorScratch, toScratch: boolean,
        direction: GaussianSplatTransfer, association: GaussianSplatAlphaAssociation) => {
        const scratch = base as Scratch;
        this.events.push(`${toScratch ? "to-scratch" : "to-target"}:${direction}:${association}`);
        if (toScratch) scratch.pixels = this.pixels.map(pixel => transferGaussianSplatColor(pixel, direction, association));
        else this.pixels = scratch.pixels.map(pixel => transferGaussianSplatColor(pixel, direction, association));
      },
      drawToScratch: (_target, base, draw) => {
        this.events.push("draw");
        this.activeScratch = base as Scratch;
        try { draw(); } finally { this.activeScratch = null; }
      },
      dispose: () => { state.disposed = true; }
    };
  }

  over(color: Pixel, depth: number): void {
    const target = this.activeScratch?.pixels ?? this.pixels;
    for (let sample = 0; sample < target.length; sample++) {
      if (depth > this.depths[sample]!) continue;
      const backdrop = target[sample]!, alpha = color[3];
      target[sample] = [0, 1, 2].map(channel => color[channel]! * alpha + backdrop[channel]! * (1 - alpha)).concat(alpha + backdrop[3] * (1 - alpha)) as Pixel;
    }
  }
}

function setup(samples = 1): { device: ColorDevice; target: RenderTarget; composite: GaussianSplatColorComposite } {
  const device = new ColorDevice();
  const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba32f", depth: "texture", sampleCount: samples });
  device.setRenderTarget(target);
  device.pixels = Array.from({ length: samples }, () => [0.18, 4, -0.1, 1]);
  device.depths = Array(samples).fill(1);
  return { device, target, composite: new GaussianSplatColorComposite(device) };
}

describe("splat color conversion", () => {
  it("matches sign-extended sRGB at the piecewise boundary and retains HDR and alpha", () => {
    const input: Pixel = [0.0031308, -0.5, 4, 0.25];
    const converted = transferGaussianSplatColor(input, "linear-to-srgb", "independent");
    expectPixel(converted, [encode(input[0]), encode(input[1]), encode(input[2]), input[3]], 12);
    expect(converted[2]).toBeGreaterThan(1);
    expectPixel(transferGaussianSplatColor(converted, "srgb-to-linear", "independent"), input, 10);
    expect(transferGaussianSplatColor([0.04045, 0, 0, 1], "srgb-to-linear", "independent")[0]).toBeCloseTo(0.04045 / 12.92, 14);
  });

  it("handles premultiplied and independent coverage separately, including tiny or zero alpha", () => {
    const premultiplied: Pixel = [0.1, 1, -0.125, 0.25];
    const expected: Pixel = [encode(0.4) * 0.25, encode(4) * 0.25, encode(-0.5) * 0.25, 0.25];
    const converted = transferGaussianSplatColor(premultiplied, "linear-to-srgb", "premultiplied");
    expectPixel(converted, expected);
    expectPixel(transferGaussianSplatColor(converted, "srgb-to-linear", "premultiplied"), premultiplied);
    expect(transferGaussianSplatColor(premultiplied, "linear-to-srgb", "independent")[0]).not.toBeCloseTo(expected[0], 5);
    const zero: Pixel = [0.3, 4, -0.2, 0];
    expectPixel(transferGaussianSplatColor(transferGaussianSplatColor(zero, "linear-to-srgb", "premultiplied"), "srgb-to-linear", "premultiplied"), zero);
    const tiny: Pixel = [0.5, 2, -0.3, 1e-300];
    const tinyEncoded = transferGaussianSplatColor(tiny, "linear-to-srgb", "premultiplied");
    expect(tinyEncoded.every(Number.isFinite)).toBe(true);
    expectPixel(transferGaussianSplatColor(tinyEncoded, "srgb-to-linear", "premultiplied"), tiny, 10);
  });

  it("composites encoded splats over the encoded backdrop before decoding, preserving depth and each sample", () => {
    const { device, composite } = setup(4);
    device.pixels = device.pixels.map(pixel => [pixel[0], 32, pixel[2], pixel[3]]);
    device.depths = [0.2, 0.7, 0.9, 0.1];
    const original = device.pixels.map(pixel => [...pixel] as Pixel);
    const first: Pixel = [0.7, 0.2, 0.3, 0.4], second: Pixel = [0.3, 0.6, 0.1, 0.5];
    composite.beginFrame();
    composite.draw({ colorSpace: "srgb_rec709_display", draw() { device.over(first, 0.5); device.over(second, 0.5); } }, "lin_rec709_display", "independent");
    expectPixel(device.pixels[0]!, original[0]!);
    expectPixel(device.pixels[3]!, original[3]!);
    const expected = original[1]!.map((channel, i) => i === 3 ? 1 : decode(second[i]! * second[3] + (first[i]! * first[3] + encode(channel) * (1 - first[3])) * (1 - second[3])));
    expectPixel(device.pixels[1]!, expected);
    expectPixel(device.pixels[2]!, expected);
    const wrongPerSplat = decode(second[0]) * second[3] + (decode(first[0]) * first[3] + original[1]![0] * (1 - first[3])) * (1 - second[3]);
    expect(Math.abs(device.pixels[1]![0] - wrongPerSplat)).toBeGreaterThan(0.01);
    expect(device.pixels[1]![1]).toBeGreaterThan(1);
    expect(device.depths).toEqual([0.2, 0.7, 0.9, 0.1]);
  });

  it("converts each run separately around intervening linear transparent draws", () => {
    const { device, composite } = setup();
    const runA: Pixel = [0.8, 0.3, 0.1, 0.3], middle: Pixel = [0.1, 0.2, 0.6, 0.25], runB: Pixel = [0.4, 0.8, 0.2, 0.5];
    composite.beginFrame();
    composite.draw({ colorSpace: "srgb_rec709_display", draw: () => device.over(runA, 0) }, "lin_rec709_display", "independent");
    composite.draw({ colorSpace: "lin_rec709_display", draw: () => device.over(middle, 0) }, "lin_rec709_display", "independent");
    composite.draw({ colorSpace: "srgb_rec709_display", draw: () => device.over(runB, 0) }, "lin_rec709_display", "independent");
    const expected = [0.18, 4, -0.1].map((base, i) => {
      const afterA = decode(runA[i]! * runA[3] + encode(base) * (1 - runA[3]));
      const afterMiddle = middle[i]! * middle[3] + afterA * (1 - middle[3]);
      return decode(runB[i]! * runB[3] + encode(afterMiddle) * (1 - runB[3]));
    });
    expectPixel(device.pixels[0]!, [...expected, 1]);
    expect(device.events).toEqual(["create", "to-scratch:linear-to-srgb:independent", "draw", "to-target:srgb-to-linear:independent", "to-scratch:linear-to-srgb:independent", "draw", "to-target:srgb-to-linear:independent"]);
  });

  it("also crosses from an encoded target into a linear run", () => {
    const { device, composite } = setup();
    device.pixels = [[0.5, 0.4, 0.3, 1]];
    const splat: Pixel = [0.7, 0.1, 0.2, 0.5];
    composite.beginFrame();
    composite.draw({ colorSpace: "lin_rec709_display", draw: () => device.over(splat, 0) }, "srgb_rec709_display", "independent");
    expectPixel(device.pixels[0]!, [encode(0.5 * decode(0.5) + 0.5 * splat[0]), encode(0.5 * decode(0.4) + 0.5 * splat[1]), encode(0.5 * decode(0.3) + 0.5 * splat[2]), 1]);
  });
});

describe("splat color resource and capability contracts", () => {
  it("reuses bounded scratch, recreates it on target or generation changes and disposes ownership", () => {
    const { device, target, composite } = setup();
    const run = { colorSpace: "srgb_rec709_display" as const, draw() {} };
    composite.beginFrame();
    composite.draw(run, "lin_rec709_display", "independent");
    composite.draw(run, "lin_rec709_display", "independent");
    const firstAdapter = device.adapters[0]!, first = firstAdapter.scratches[0]!;
    expect(firstAdapter.scratches).toHaveLength(1);
    const replacement = device.createRenderTarget({ width: 2, height: 1, format: "rgba32f", depth: "texture" });
    device.setRenderTarget(replacement);
    composite.draw(run, "lin_rec709_display", "independent");
    expect(first.disposed).toBe(true);
    const second = firstAdapter.scratches[1]!;
    device.generation++;
    composite.draw(run, "lin_rec709_display", "independent");
    expect(second.disposed).toBe(true);
    expect(firstAdapter.disposed).toBe(true);
    const newest = device.adapters[1]!;
    composite.dispose(); composite.dispose();
    expect(newest.disposed).toBe(true);
    expect(newest.scratches[0]!.disposed).toBe(true);
    expect(target.disposed).toBe(false);
    expect(replacement.disposed).toBe(false);
  });

  it("fails before drawing when no compatible adapter or scratch budget exists", () => {
    const device = new MockRenderDevice();
    device.setRenderTarget(device.createRenderTarget({ width: 1, height: 1, format: "rgba16f", depth: "texture" }));
    const draw = { colorSpace: "srgb_rec709_display" as const, draw: () => { throw new Error("must not draw"); } };
    expect(() => new GaussianSplatColorComposite(device).draw(draw, "lin_rec709_display", "independent")).toThrowError(expect.objectContaining({ code: "GAUSSIAN_SPLAT_COLOR_COMPOSITE_UNSUPPORTED" }));
    const own = setup();
    expect(() => new GaussianSplatColorComposite(own.device, { maxScratchBytes: 15 }).draw(draw, "lin_rec709_display", "independent")).toThrowError(expect.objectContaining({ code: "GAUSSIAN_SPLAT_COLOR_MEMORY_LIMIT" }));
    expect(own.device.adapters).toHaveLength(0);
    own.device.allocatedBytesAdjustment = 2;
    expect(() => new GaussianSplatColorComposite(own.device, { maxScratchBytes: 16 }).draw(draw, "lin_rec709_display", "independent")).toThrowError(expect.objectContaining({ code: "GAUSSIAN_SPLAT_COLOR_MEMORY_LIMIT" }));
    expect(own.device.adapters[0]!.scratches[0]!.disposed).toBe(true);
  });

  it("leaves the original color, target and usable scratch intact after a draw failure", () => {
    const { device, target, composite } = setup();
    const before = [...device.pixels[0]!] as Pixel;
    const broken = { colorSpace: "srgb_rec709_display" as const, draw: () => { device.over([1, 0, 0, 0.5], 0); throw new Error("draw failed"); } };
    expect(() => composite.draw(broken, "lin_rec709_display", "independent")).toThrow("draw failed");
    expectPixel(device.pixels[0]!, before);
    expect(device.getRenderTarget()).toBe(target);
    expect(device.activeScratch).toBeNull();
    expect(device.events.some(event => event.startsWith("to-target"))).toBe(false);
    composite.draw({ colorSpace: "srgb_rec709_display", draw() {} }, "lin_rec709_display", "independent");
    expectPixel(device.pixels[0]!, before);
  });

  it("bounds conversions per frame and rejects nested use", () => {
    const { device } = setup();
    const composite = new GaussianSplatColorComposite(device, { maxConvertedRuns: 1 });
    const run = { colorSpace: "srgb_rec709_display" as const, draw() {} };
    composite.beginFrame();
    composite.draw(run, "lin_rec709_display", "independent");
    expect(() => composite.draw(run, "lin_rec709_display", "independent")).toThrowError(expect.objectContaining({ code: "GAUSSIAN_SPLAT_COLOR_RUN_LIMIT" }));
    composite.beginFrame();
    expect(() => composite.draw({ colorSpace: "srgb_rec709_display", draw: () => composite.beginFrame() }, "lin_rec709_display", "independent")).toThrowError(expect.objectContaining({ code: "GAUSSIAN_SPLAT_COLOR_REENTRANT" }));
  });
});

describe("Renderer ordered splat color integration", () => {
  it("wraps each display-space run around an intervening linear run", () => {
    class RendererDevice extends ColorDevice {
      override draw(command: DrawCommand): void {
        super.draw(command);
        if (command.label !== "gaussian-splat") return;
        const bytes = this.readBuffer(command.instanceAttributes![0]!.buffer);
        const packed = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        for (let index = 0; index < (command.instanceCount ?? 1); index++) {
          const offset = index * 11;
          this.events.push(`splat:${packed[offset + 2]!.toFixed(1)}`);
          this.over([packed[offset + 7]!, packed[offset + 8]!, packed[offset + 9]!, packed[offset + 10]!], 0.5);
        }
      }
    }
    const device = new RendererDevice();
    device.pixels = [[0.18, 4, 0.1, 1]]; device.depths = [1];
    const cloud = (positions: number[], colorSpace: "srgb_rec709_display" | "lin_rec709_display") => ({
      count: positions.length, positions: new Float32Array(positions.flatMap(z => [0, 0, z])),
      scales: new Float32Array(positions.flatMap(() => [0.1, 0.1, 0.1])),
      rotations: new Float32Array(positions.flatMap(() => [0, 0, 0, 1])),
      colors: new Float32Array(positions.flatMap(() => [0.6, 0.4, 0.2])),
      opacities: new Float32Array(positions.map(() => 0.5)), shDegree: 0 as const,
      metadata: { colorSpace }
    });
    const display = new GaussianSplatRenderer(device, cloud([-0.8, -0.2], "srgb_rec709_display"));
    const linear = new GaussianSplatRenderer(device, cloud([-0.5], "lin_rec709_display"));
    const renderer = new Renderer(device, { backend: "mock", width: 1, height: 1, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const source = { renderItems: [], postprocess: { sampleCount: 1 }, gaussianSplats: [
      { renderer: display, modelMatrix: identity, colorSpace: "srgb_rec709_display" },
      { renderer: linear, modelMatrix: identity, colorSpace: "lin_rec709_display" }
    ] };
    try {
      renderer.render(source, { viewMatrix: identity, projectionMatrix: identity });
      expect(device.events).toEqual([
        "create", "to-scratch:linear-to-srgb:independent", "draw", "splat:-0.8", "to-target:srgb-to-linear:independent",
        "splat:-0.5",
        "to-scratch:linear-to-srgb:independent", "draw", "splat:-0.2", "to-target:srgb-to-linear:independent"
      ]);
      const expected = [0.18, 4, 0.1].map((base, channel) => {
        const color = [0.6, 0.4, 0.2][channel]!;
        const a = decode((encode(base) + color) / 2);
        const middle = (a + color) / 2;
        return decode((encode(middle) + color) / 2);
      });
      expectPixel(device.pixels[0]!, [...expected, 1], 6);
      const scratch = device.adapters[0]!.scratches[0]!;
      renderer.dispose();
      expect(scratch.disposed).toBe(true);
      expect(device.adapters[0]!.disposed).toBe(true);
    } finally { display.dispose(); linear.dispose(); renderer.dispose(); }
  });
});
