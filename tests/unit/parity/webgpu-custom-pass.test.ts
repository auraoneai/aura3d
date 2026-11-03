import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGPUDevice } from "../../../packages/rendering/src/WebGPUDevice";
import { registerPostPass, type PostPassDescriptor } from "../../../packages/rendering/src/contracts/post";
import { beginPostStageTrace, postSkippedReasons, postStagesRan, resetPostSkipped } from "../../../packages/rendering/src/renderer/postSkipped";
import { postDiagnostics, type PostDiagnosticToken } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
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
  executeWebGPUCustomPass(this: unknown, pass: PostPassDescriptor, source: RenderTarget, token: PostDiagnosticToken | undefined,
    frame: { readonly timeSeconds: number; readonly frameIndex: number; readonly postScopeId?: object; readonly blackboard: Map<string, unknown> }): RenderTarget | null;
}
const seams = WebGPUDevice.prototype as unknown as Seams;
const execute = (self: unknown, pass: PostPassDescriptor, input: RenderTarget, token?: PostDiagnosticToken) =>
  seams.executeWebGPUCustomPass.call(self, pass, input, token, { timeSeconds: 0, frameIndex: 0, blackboard: new Map() });

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
    requireRenderTarget: vi.fn((target: RenderTarget) => (target as unknown as ReturnType<typeof nativeTarget>)),
    flushNativeRenderTargetClear: vi.fn(),
    createRenderTarget: (options: { format: string; label: string }) => {
      const target = nativeTarget(options.label);
      created.push({ format: options.format, label: options.label, target });
      return target as unknown as RenderTarget;
    },
    runWebGPUFullscreenPass: vi.fn((args: Record<string, unknown>) => { draws.push(args); })
  };
  return { self, created, draws };
}

const source = () => nativeTarget("src") as unknown as RenderTarget;

describe("WebGPU custom pass execution (WGSL contract + diagnostics)", () => {
  it("a pass with no WGSL is skipped with a named WGSL_PROGRAM_MISSING reason — never silent, never a GLSL fallback", () => {
    const pass = register("no-wgsl", { fragment: { glsl: "void main(){}" } });
    const { self, draws } = stubDevice();
    expect(execute(self, pass, source())).toBeNull();
    expect(draws).toHaveLength(0);
    expect(postSkippedReasons()).toContain("WGSL_PROGRAM_MISSING:test.webgpu.no-wgsl");
  });

  it("a blank WGSL string is treated as missing", () => {
    const pass = register("blank-wgsl", { fragment: { glsl: "void main(){}", wgsl: "   " } });
    const { self } = stubDevice();
    expect(execute(self, pass, source())).toBeNull();
    expect(postSkippedReasons()).toContain("WGSL_PROGRAM_MISSING:test.webgpu.blank-wgsl");
  });

  it("enabled:false skips without a diagnostic and without drawing", () => {
    const pass = register("disabled", { enabled: () => false, inputs: ["color", "depth"] });
    const { self, draws } = stubDevice();
    expect(execute(self, pass, source())).toBeNull();
    expect(draws).toHaveLength(0);
    expect(postSkippedReasons()).toEqual([]);
  });

  it("draws the authored WGSL with its detected entry point and packs uniforms after the texel/time header", () => {
    const pass = register("wgsl", {
      uniforms: () => ({ u_gain: 0.5, u_tint: [1, 2, 3] })
    });
    const { self, created, draws } = stubDevice();
    const out = execute(self, pass, source());
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
    execute(self, pass, source());
    expect(created[0]!.format).toBe("rgba8");
    expect(draws[0]).toMatchObject({ entryPoint: "fs_main" });
  });

  it.each(["depth", "velocity", "normal", "reactive"] as const)("reports an unavailable %s input before allocating or drawing", (input) => {
    beginPostStageTrace();
    const uniforms = vi.fn(() => ({ u_gain: 1 }));
    const pass = register(`needs-${input}`, { inputs: ["color", input], uniforms });
    const { self, created, draws } = stubDevice();
    expect(execute(self, pass, source())).toBeNull();
    expect(postSkippedReasons()).toEqual([`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:${input}`]);
    expect(postStagesRan()).toEqual([]);
    expect(self.requireRenderTarget).not.toHaveBeenCalled();
    expect(self.flushNativeRenderTargetClear).not.toHaveBeenCalled();
    expect(uniforms).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(draws).toHaveLength(0);
  });

  it("records every missing declared input and the missing shader without claiming a draw", () => {
    const pass = register("several-missing", { inputs: ["color", "depth", "velocity", "normal", "reactive"],
      fragment: { glsl: "void main(){}" } });
    const { self, created, draws } = stubDevice();
    expect(execute(self, pass, source())).toBeNull();
    expect(postSkippedReasons()).toEqual([
      `POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:depth`, `POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:velocity`,
      `POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:normal`, `POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:reactive`,
      `WGSL_PROGRAM_MISSING:${pass.id}`
    ]);
    expect(created).toHaveLength(0);
    expect(draws).toHaveLength(0);
  });

  it("records unavailable inputs only for the supplied renderer and view token", () => {
    const scope = {};
    const first = postDiagnostics.begin(scope, "left", 1);
    const second = postDiagnostics.begin(scope, "right", 1);
    const pass = register("scoped-depth", { inputs: ["color", "depth"] });
    const { self } = stubDevice();
    try {
      expect(execute(self, pass, source(), first)).toBeNull();
      expect(postSkippedReasons(first)).toEqual([`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:depth`]);
      expect(postSkippedReasons(second)).toEqual([]);
      expect(postSkippedReasons()).toEqual([]);
    } finally { postDiagnostics.resetScope(scope); }
  });

  it("clears a prior unavailable-input diagnostic when the pass is replaced with a color-only pass", () => {
    const pass = register("replaced", { inputs: ["color", "depth"] });
    const { self, created, draws } = stubDevice();
    expect(execute(self, pass, source())).toBeNull();
    expect(postSkippedReasons()).toContain(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:depth`);
    const replacement: PostPassDescriptor = { ...pass, inputs: ["color"] };
    expect(execute(self, replacement, source())).toBe(created[0]!.target);
    expect(draws).toHaveLength(1);
    expect(postSkippedReasons()).not.toContain(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:depth`);
  });

  it("disposes the allocated target and rethrows when the draw fails", () => {
    const pass = register("throws");
    const { self, created } = stubDevice();
    self.runWebGPUFullscreenPass.mockImplementation(() => { throw new Error("pipeline rejected"); });
    expect(() => execute(self, pass, source())).toThrowError("pipeline rejected");
    expect(created[0]!.target.dispose).toHaveBeenCalledTimes(1);
  });
});
