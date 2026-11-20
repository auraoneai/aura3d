import { describe, expect, it, vi } from "vitest";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import { MockRenderDevice, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

// 5.7.1 bug 1: the sync `render()` route reaches the v2 seam before the deferred `post/v2Entry` import resolves on the
// first frames after mount. An alpha-preserving request used to fall through to the fused present and throw
// POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE ("The active post chain cannot apply the requested output color or alpha
// policy"), which failed the mount whenever the first frame won that race. This file owns a fresh module graph: the
// module-level v2 bag is still unloaded when the first sync frame runs.

const pipeline = (changes: Partial<PostPipelineOptions> = {}): PostPipelineOptions => ({
  antiAliasing: "fxaa", depthRange: { near: 0.1, far: 10, projection: "perspective" },
  exposure: 1, toneMapping: "neutral", dither: false, ...changes
});

async function freshFixture(alphaMode: "premultiplied" | "straight" | "opaque", registerHost = true) {
  vi.resetModules();
  const execution = await import("../../../packages/rendering/src/renderer/PostprocessExecution");
  const { registerWebGL2DeviceHost } = await import("../../../packages/rendering/src/webgl2/Counters");
  const skipped = await import("../../../packages/rendering/src/renderer/postSkipped");
  const { OutputPass } = await import("../../../packages/rendering/src/output/OutputPass");
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgl2" });
  const present = vi.fn();
  (device as RenderDevice).presentLdrPostprocess = present;
  (device as RenderDevice).getPresentationAlphaMode = () => alphaMode;
  if (registerHost) {
    const buffers = new Set<unknown>();
    const createBuffer = device.createBuffer.bind(device);
    vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      const buffer = createBuffer(...args);
      buffers.add(buffer);
      return buffer;
    });
    registerWebGL2DeviceHost({
      device, gl: {}, buffers, resolveMultisampleTarget: vi.fn(), stateCache: { invalidate() {} },
      post: { presentLdrPostprocess: present }
    } as unknown as WebGL2DeviceHost);
  }
  const post = new execution.RendererPostprocessPipeline({ device, width: 1, height: 1, fusedLdrPostprocessScratch: {} } as unknown as RendererHost);
  const source = device.createRenderTarget({ width: 1, height: 1, format: "rgba16f", depth: false });
  const output = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
  const options: RendererPostProcessOptions = alphaMode === "opaque"
    ? { v2: true, pipeline: pipeline() }
    : { v2: true, pipeline: pipeline({ alphaMode, inputAlphaMode: "premultiplied" }) };
  return {
    execution, skipped, OutputPass, device, post, source, output, present, options,
    dispose: () => { output.dispose(); source.dispose(); device.dispose(); }
  };
}

describe("5.7.1 alpha-preserving output before the deferred v2 modules load", () => {
  it.each(["premultiplied", "straight"] as const)("presents a transparent frame instead of failing (%s)", async alphaMode => {
    const f = await freshFixture(alphaMode);
    const execute = vi.spyOn(f.OutputPass.prototype, "execute");
    try {
      expect(f.execution.postV2ModulesAvailable()).toBe(false);
      f.skipped.resetPostSkipped();
      f.device.beginFrame(1, 1);
      f.device.setRenderTarget(f.output);
      f.device.clear([0.9, 0.4, 0.1, 1]);
      f.device.setRenderTarget(f.source);
      f.device.clear([0.5, 0.25, 0, 0.5]);
      expect(() => f.post.executePostprocess(f.options, [f.source], f.output)).not.toThrow();
      // Nothing composed: the output holds premultiplied transparent black, never the fused (alpha-dropping) present.
      f.device.setRenderTarget(f.output);
      expect(Array.from(f.device.readPixels(0, 0, 1, 1))).toEqual([0, 0, 0, 0]);
      expect(f.present).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      expect(f.execution.postGraphV2LastOutcome()).toBe("v2-modules-loading");
      expect(f.skipped.postSkippedReasons()).toContain("POSTPROCESS_ALPHA_OUTPUT_DEFERRED:v2-modules-loading");
      f.device.endFrame();

      // The next frame after the import resolves takes the OutputPass route with the declared alpha policy.
      await f.execution.postV2ModulesReady();
      f.device.beginFrame(1, 1);
      f.device.setRenderTarget(f.source);
      f.device.clear([0.5, 0.25, 0, 0.5]);
      f.post.executePostprocess(f.options, [f.source], f.output);
      expect(execute).toHaveBeenCalledOnce();
      expect(execute.mock.calls[0]![2]).toMatchObject({ inputAlphaMode: "premultiplied" });
      expect(f.execution.postGraphV2LastOutcome()).toBe("v2");
      f.device.endFrame();
    } finally { execute.mockRestore(); f.dispose(); }
  });

  it("leaves opaque output on the unchanged fused present while the modules load", async () => {
    const f = await freshFixture("opaque");
    const execute = vi.spyOn(f.OutputPass.prototype, "execute");
    try {
      expect(f.execution.postV2ModulesAvailable()).toBe(false);
      f.device.beginFrame(1, 1);
      f.device.setRenderTarget(f.source);
      f.post.executePostprocess(f.options, [f.source], f.output);
      expect(f.present).toHaveBeenCalledOnce();
      expect(execute).not.toHaveBeenCalled();
      expect(f.execution.postGraphV2LastOutcome()).toBe("v2-modules-loading");
      f.device.endFrame();
    } finally { execute.mockRestore(); f.dispose(); }
  });

  it("still reports a missing WebGL2 host instead of masking it", async () => {
    const f = await freshFixture("premultiplied", false);
    try {
      expect(() => f.post.executePostprocess(f.options, [f.source], f.output)).toThrow(expect.objectContaining({ code: "POST_GRAPH_V2_UNSUPPORTED" }));
    } finally { f.dispose(); }
  });
});

describe("5.7.1 mount waits for the alpha OutputPass modules", () => {
  it("awaits postV2ModulesReady alongside the scene compile for alpha-preserving WebGL2 output only", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../../packages/engine/src/agent-api/compiler/renderer.ts", import.meta.url), "utf8");
    expect(source).toContain('const alphaPostModules = outputPolicy.alphaMode !== "opaque" && backendSelection.active === "webgl2" && flags.on("A3D_QR_POST")');
    expect(source).toContain("? postV2ModulesReady().catch(() => undefined)");
    const compile = source.indexOf("const compiledScene = await compileScene(snapshot, sceneCompileCtx);");
    const wait = source.indexOf("if (alphaPostModules) await alphaPostModules;");
    expect(compile).toBeGreaterThan(0);
    expect(wait).toBeGreaterThan(compile);
    expect(source.indexOf("const alphaPostModules")).toBeLessThan(compile);
  });
});
