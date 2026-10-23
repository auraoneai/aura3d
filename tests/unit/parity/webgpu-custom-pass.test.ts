import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGPUDevice } from "../../../packages/rendering/src/WebGPUDevice";
import { registerPostPass, type PostPassDescriptor } from "../../../packages/rendering/src/contracts/post";
import { postSkippedReasons, resetPostSkipped } from "../../../packages/rendering/src/renderer/postSkipped";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";

/*
 * SH-03 / L1-06 (R-04): the native WebGPU chain runs registered custom passes
 * through their WGSL fragment. These tests drive the device's two private seams
 * on the prototype with a stubbed `this`, so the anchor → chain-position
 * mapping, the missing-WGSL diagnostic and the WGSL draw contract are asserted
 * without a GPU.
 */

interface Seams {
  webgpuCustomPassPositions(this: unknown, passes: readonly { readonly name: string }[]): Map<number, PostPassDescriptor[]>;
  executeWebGPUCustomPass(this: unknown, pass: PostPassDescriptor, source: RenderTarget): RenderTarget | null;
}
const seams = WebGPUDevice.prototype as unknown as Seams;

const releases: Array<() => void> = [];
afterEach(() => {
  while (releases.length) releases.pop()!();
  resetPostSkipped();
});

const WGSL = "/* @aura3d-bindings */\n@fragment fn fs_custom(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(1.0); }";

function register(id: string, overrides: Partial<PostPassDescriptor> = {}): PostPassDescriptor {
  const insertAt = overrides.insertAt ?? "before-tonemap";
  const descriptor: PostPassDescriptor = {
    id: `test.webgpu.${id}`,
    owner: "prd03",
    flag: "A3D_QR_POST",
    space: insertAt === "after-tonemap" ? "display" : "linear-hdr",
    insertAt,
    inputs: ["color"],
    fragment: { glsl: "void main(){}", wgsl: WGSL },
    gpuOnly: true,
    ...overrides
  } as PostPassDescriptor;
  releases.push(registerPostPass(descriptor));
  return descriptor;
}

const names = (...list: string[]) => list.map((name) => ({ name }));
const positionsOf = (chain: readonly string[]) => {
  const map = seams.webgpuCustomPassPositions.call({}, names(...chain));
  return Object.fromEntries([...map].map(([position, passes]) => [position, passes.map((p) => p.id.replace("test.webgpu.", ""))]));
};

describe("WebGPU custom pass anchors (named slots → chain position)", () => {
  it("bloom → tone-mapping chain: every anchor lands before/after the right stage", () => {
    register("depth", { insertAt: "after-depth" });
    register("pre-taa", { insertAt: "before-taa" });
    register("post-taa", { insertAt: "after-taa" });
    register("pre-tone", { insertAt: "before-tonemap" });
    register("post-tone", { insertAt: "after-tonemap" });
    // Position p runs BEFORE chain[p]; chain = [bloom, tone-mapping].
    // after-taa with no TAA must still precede bloom (before-bloom slot), not follow it.
    expect(positionsOf(["bloom", "tone-mapping"])).toEqual({
      0: ["depth", "pre-taa", "post-taa"],
      1: ["pre-tone"],
      2: ["post-tone"]
    });
  });

  it("taa → bloom → tone-mapping chain: after-taa sits between TAA and bloom", () => {
    register("pre-taa", { insertAt: "before-taa" });
    register("post-taa", { insertAt: "after-taa" });
    register("pre-tone", { insertAt: "before-tonemap" });
    expect(positionsOf(["taa", "bloom", "tone-mapping"])).toEqual({
      0: ["pre-taa"],
      1: ["post-taa"],
      2: ["pre-tone"]
    });
  });

  it("anchors whose stage is absent attach after the last pass instead of dropping", () => {
    register("pre-tone", { insertAt: "before-tonemap" });
    register("post-tone", { insertAt: "after-tonemap" });
    expect(positionsOf(["bloom"])).toEqual({ 1: ["pre-tone", "post-tone"] });
  });

  it("after-bloom (20) runs before before-tonemap (30) at one position when registered in reverse", () => {
    register("slot-before-tonemap", { order: 30 });
    register("slot-numeric", { order: 25 });
    register("slot-after-bloom", { order: 20 });
    expect(positionsOf(["bloom", "tone-mapping"])).toEqual({
      1: ["slot-after-bloom", "slot-numeric", "slot-before-tonemap"]
    });
  });

  it("keeps registration order for passes without an order key", () => {
    register("first");
    register("second");
    register("keyed", { order: 1 });
    expect(positionsOf(["bloom", "tone-mapping"])).toEqual({ 1: ["keyed", "first", "second"] });
  });
});

function nativeTarget(id: string, width = 64, height = 32) {
  return { id, label: id, width, height, nativeView: { view: id }, dispose: vi.fn() };
}

function stubDevice() {
  const created: Array<{ format: string; label: string; target: ReturnType<typeof nativeTarget> }> = [];
  const draws: Array<Record<string, unknown>> = [];
  const self = {
    requireRenderTarget: (target: RenderTarget) => (target as unknown as ReturnType<typeof nativeTarget>),
    createRenderTarget: (options: { format: string; label: string }) => {
      const target = nativeTarget(options.label);
      created.push({ format: options.format, label: options.label, target });
      return target as unknown as RenderTarget;
    },
    webgpuPostBlankTarget: () => nativeTarget("blank") as unknown as RenderTarget,
    runWebGPUFullscreenPass: vi.fn((args: Record<string, unknown>) => { draws.push(args); })
  };
  return { self, created, draws };
}

const source = () => nativeTarget("src") as unknown as RenderTarget;

describe("WebGPU custom pass execution (WGSL contract + diagnostics)", () => {
  it("a pass with no WGSL is skipped with a named WGSL_PROGRAM_MISSING reason — never silent, never a GLSL fallback", () => {
    const pass = register("no-wgsl", { fragment: { glsl: "void main(){}" } });
    const { self, draws } = stubDevice();
    expect(seams.executeWebGPUCustomPass.call(self, pass, source())).toBeNull();
    expect(draws).toHaveLength(0);
    expect(postSkippedReasons()).toContain("WGSL_PROGRAM_MISSING:test.webgpu.no-wgsl");
  });

  it("a blank WGSL string is treated as missing", () => {
    const pass = register("blank-wgsl", { fragment: { glsl: "void main(){}", wgsl: "   " } });
    const { self } = stubDevice();
    expect(seams.executeWebGPUCustomPass.call(self, pass, source())).toBeNull();
    expect(postSkippedReasons()).toContain("WGSL_PROGRAM_MISSING:test.webgpu.blank-wgsl");
  });

  it("enabled:false skips without a diagnostic and without drawing", () => {
    const pass = register("disabled", { enabled: () => false });
    const { self, draws } = stubDevice();
    expect(seams.executeWebGPUCustomPass.call(self, pass, source())).toBeNull();
    expect(draws).toHaveLength(0);
    expect(postSkippedReasons()).toEqual([]);
  });

  it("draws the authored WGSL with its detected entry point and packs uniforms after the texel/time header", () => {
    const pass = register("wgsl", {
      uniforms: () => ({ u_gain: 0.5, u_tint: [1, 2, 3] })
    });
    const { self, created, draws } = stubDevice();
    const out = seams.executeWebGPUCustomPass.call(self, pass, source());
    expect(out).toBe(created[0]!.target);
    expect(created[0]).toMatchObject({ format: "rgba16f", label: "a3d-webgpu-custom-test.webgpu.wgsl" });
    expect(draws).toHaveLength(1);
    const draw = draws[0]!;
    expect(draw).toMatchObject({ label: "webgpu-custom:test.webgpu.wgsl", fragment: WGSL, entryPoint: "fs_custom", target: out });
    const packed = Array.from(draw.uniforms as Float32Array);
    expect(packed.slice(0, 2)).toEqual([1 / 64, 1 / 32]);
    expect(packed[3]).toBe(0);
    expect(packed.slice(4)).toEqual([0.5, 0, 0, 0, 1, 2, 3, 0]);
    expect(draw.views).toHaveLength(1);
    expect(postSkippedReasons()).toEqual([]);
  });

  it("an after-tonemap (display) pass renders into an rgba8 target and falls back to fs_main without an @fragment marker", () => {
    const pass = register("display", {
      insertAt: "after-tonemap",
      fragment: { glsl: "void main(){}", wgsl: "/* @aura3d-bindings */\nfn helper() {}" }
    });
    const { self, created, draws } = stubDevice();
    seams.executeWebGPUCustomPass.call(self, pass, source());
    expect(created[0]!.format).toBe("rgba8");
    expect(draws[0]).toMatchObject({ entryPoint: "fs_main" });
  });

  it("declared depth and velocity inputs bind 1×1 stand-ins after the color view", () => {
    const pass = register("inputs", { inputs: ["color", "depth", "velocity"] });
    const { self, draws } = stubDevice();
    seams.executeWebGPUCustomPass.call(self, pass, source());
    expect(draws[0]!.views).toHaveLength(3);
  });

  it("disposes the allocated target and rethrows when the draw fails", () => {
    const pass = register("throws");
    const { self, created } = stubDevice();
    self.runWebGPUFullscreenPass.mockImplementation(() => { throw new Error("pipeline rejected"); });
    expect(() => seams.executeWebGPUCustomPass.call(self, pass, source())).toThrowError("pipeline rejected");
    expect(created[0]!.target.dispose).toHaveBeenCalledTimes(1);
  });
});
