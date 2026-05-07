import { describe, expect, it } from "vitest";
import {
  BloomPass,
  FXAAPass,
  MockRenderDevice,
  RenderGraph,
  ToneMappingPass,
  bloomPixels,
  fxaaPixels,
  toneMapPixels,
  type RenderPass,
  type RenderPassContext,
  type RenderTarget
} from "../../../packages/rendering/src";

describe("RenderGraph", () => {
  it("orders passes by declared resource dependencies", () => {
    const graph = new RenderGraph();
    const order: string[] = [];
    graph.addPass(pass("lighting", ["gbuffer"], ["color"], order));
    graph.addPass(pass("geometry", [], ["gbuffer"], order));

    graph.execute({ device: new MockRenderDevice(), width: 1, height: 1 });

    expect(order).toEqual(["geometry", "lighting"]);
  });

  it("reports deterministic frame resource lifetimes in compile plans", () => {
    const graph = new RenderGraph();
    const order: string[] = [];
    graph.addPass(pass("post", ["lit"], ["present"], order));
    graph.addPass(pass("lighting", ["gbuffer"], ["lit"], order));
    graph.addPass(pass("geometry", [], ["gbuffer"], order));

    const plan = graph.compilePlan();

    expect(plan.passes.map((renderPass) => renderPass.name)).toEqual(["geometry", "lighting", "post"]);
    expect(plan.resources).toEqual([
      { name: "gbuffer", writer: "geometry", readers: ["lighting"], firstPassIndex: 0, lastPassIndex: 1 },
      { name: "lit", writer: "lighting", readers: ["post"], firstPassIndex: 1, lastPassIndex: 2 },
      { name: "present", writer: "post", readers: [], firstPassIndex: 2, lastPassIndex: 2 }
    ]);
  });

  it("rejects missing producers", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("lighting", ["gbuffer"], ["color"], []));

    expect(() => graph.compile()).toThrow(/no pass writes/);
  });

  it("rejects duplicate writers", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("a", [], ["color"], []));
    graph.addPass(pass("b", [], ["color"], []));

    expect(() => graph.compile()).toThrow(/written by both/);
  });

  it("rejects undeclared read-write hazards and malformed resource declarations", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("in-place-color", ["color"], ["color"], []));

    expect(() => graph.compile()).toThrow(/reads and writes color/);

    const duplicateReads = new RenderGraph();
    duplicateReads.addPass(pass("duplicate-read", ["color", "color"], [], []));
    expect(() => duplicateReads.compile()).toThrow(/duplicate reads resource: color/);

    const emptyWrites = new RenderGraph();
    emptyWrites.addPass(pass("empty-write", [], [""], []));
    expect(() => emptyWrites.compile()).toThrow(/writes an empty frame resource/);
  });

  it("allows explicitly declared in-place render graph hazards", () => {
    const graph = new RenderGraph();
    const order: string[] = [];
    graph.addPass(pass("particles", ["color"], ["color"], order, ["color"]));

    graph.execute({ device: new MockRenderDevice(), width: 1, height: 1 });

    expect(order).toEqual(["particles"]);
  });

  it("rejects empty in-place hazard allowances", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("forward", [], ["color"], [], [""]));

    expect(() => graph.compile()).toThrow(/empty in-place hazard resource/);
  });

  it("tone maps source render target pixels into a post-process output target", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 2, height: 1, label: "hdr-color" });
    const output = device.createRenderTarget({ width: 2, height: 1, label: "ldr-color" });
    device.beginFrame(2, 1);
    device.setRenderTarget(source);
    device.clear([1, 0.25, 0, 1]);

    const pass = new ToneMappingPass({ source, target: output, exposure: 2, gamma: 1, operator: "reinhard" });
    pass.execute({ device, width: 2, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([170, 85, 0, 255]);
    expect(Array.from(pass.getLastResult()?.pixels.slice(0, 4) ?? [])).toEqual([170, 85, 0, 255]);
    device.endFrame();
  });

  it("validates tone mapping dimensions and options", () => {
    expect(() => toneMapPixels(new Uint8Array(3), 1, 1)).toThrow(/RGBA/);
    expect(() => toneMapPixels(new Uint8Array(4), 1, 1, { exposure: -1 })).toThrow(/exposure/);
    expect(() => new ToneMappingPass({ source: new MockRenderDevice().createRenderTarget({ width: 1, height: 1 }), gamma: 0 })).toThrow(/gamma/);
  });

  it("blooms bright source pixels into neighboring post-process output pixels", () => {
    const pixels = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    const result = bloomPixels(pixels, 3, 1, { threshold: 0.9, intensity: 1, radius: 1 });

    expect(Array.from(result.brightPixels)).toEqual([
      0, 0, 0, 0,
      255, 255, 255, 255,
      0, 0, 0, 0
    ]);
    expect(Array.from(result.pixels)).toEqual([
      85, 85, 85, 255,
      255, 255, 255, 255,
      85, 85, 85, 255
    ]);
  });

  it("runs bloom as a render graph pass with deterministic readback", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 1, label: "lit-color" }) as RenderTarget & { colorPixels: Uint8Array };
    const output = device.createRenderTarget({ width: 3, height: 1, label: "bloom-color" });
    source.colorPixels.set([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    device.beginFrame(3, 1);
    const pass = new BloomPass({ source, target: output, threshold: 0.9, intensity: 1, radius: 1 });
    pass.execute({ device, width: 3, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 3, 1))).toEqual([
      85, 85, 85, 255,
      255, 255, 255, 255,
      85, 85, 85, 255
    ]);
    expect(Array.from(pass.getLastResult()?.pixels.slice(0, 4) ?? [])).toEqual([85, 85, 85, 255]);
    device.endFrame();
  });

  it("validates bloom dimensions and options", () => {
    expect(() => bloomPixels(new Uint8Array(3), 1, 1)).toThrow(/RGBA/);
    expect(() => bloomPixels(new Uint8Array(4), 1, 1, { threshold: 2 })).toThrow(/threshold/);
    expect(() => bloomPixels(new Uint8Array(4), 1, 1, { intensity: -1 })).toThrow(/intensity/);
    expect(() => bloomPixels(new Uint8Array(4), 1, 1, { radius: 1.5 })).toThrow(/radius/);
  });

  it("smooths high-contrast post-process edges with deterministic FXAA pixels", () => {
    const pixels = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    const result = fxaaPixels(pixels, 3, 1, { edgeThreshold: 0.1, subpixelBlend: 1 });

    expect(Array.from(result.edgeMask)).toEqual([255, 255, 255]);
    expect(Array.from(result.pixels)).toEqual([
      64, 64, 64, 255,
      128, 128, 128, 255,
      64, 64, 64, 255
    ]);
  });

  it("runs FXAA as a render graph pass with deterministic readback", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 1, label: "aliased-color" }) as RenderTarget & { colorPixels: Uint8Array };
    const output = device.createRenderTarget({ width: 3, height: 1, label: "fxaa-color" });
    source.colorPixels.set([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    device.beginFrame(3, 1);
    const pass = new FXAAPass({ source, target: output, edgeThreshold: 0.1, subpixelBlend: 1 });
    pass.execute({ device, width: 3, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 3, 1))).toEqual([
      64, 64, 64, 255,
      128, 128, 128, 255,
      64, 64, 64, 255
    ]);
    expect(Array.from(pass.getLastResult()?.edgeMask ?? [])).toEqual([255, 255, 255]);
    device.endFrame();
  });

  it("validates FXAA dimensions and options", () => {
    expect(() => fxaaPixels(new Uint8Array(3), 1, 1)).toThrow(/RGBA/);
    expect(() => fxaaPixels(new Uint8Array(4), 1, 1, { edgeThreshold: -0.1 })).toThrow(/edgeThreshold/);
    expect(() => fxaaPixels(new Uint8Array(4), 1, 1, { subpixelBlend: 1.1 })).toThrow(/subpixelBlend/);
  });
});

function pass(name: string, reads: readonly string[], writes: readonly string[], order: string[], allowReadWriteHazards: readonly string[] = []): RenderPass {
  return {
    name,
    reads,
    writes,
    allowReadWriteHazards,
    execute(_context: RenderPassContext): void {
      order.push(name);
    }
  };
}
