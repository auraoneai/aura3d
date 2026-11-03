import { describe, expect, it, vi } from "vitest";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerPostPass, type PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import { MockRenderDevice, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type RendererOutputOptions, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import { RendererPostprocessPipeline, postV2ModulesReady } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";
import { registerWebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

const on = createTrustedQrFlags({ A3D_QR_CORE_OUTPUT: true });
const off = createTrustedQrFlags({ A3D_QR_CORE_OUTPUT: false });
const transparentBlack = [0, 0, 0, 0] as const;

function rendererFixture(output: RendererOutputOptions = {}, enabled = true) {
  const device = new MockRenderDevice();
  const renderer = new Renderer(device, {
    width: 1, height: 1, clearColor: transparentBlack, outputClearColor: transparentBlack,
    qrFlags: enabled ? on : off, shaderLibrary: createLeanCoreShaderLibrary(), output
  }, new TemporalHistory());
  return { device, renderer };
}

function postFixture(kind: "mock" | "webgl2" | "webgpu" = "mock") {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: kind });
  const present = vi.fn();
  (device as RenderDevice).presentLdrPostprocess = present;
  (device as RenderDevice).getPresentationAlphaMode = () => "opaque";
  const post = new RendererPostprocessPipeline({ device, width: 1, height: 1, fusedLdrPostprocessScratch: {} } as unknown as RendererHost);
  const source = device.createRenderTarget({ width: 1, height: 1, format: "rgba16f", depth: false });
  const output = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
  return { device, post, source, output, present, dispose: () => { output.dispose(); source.dispose(); device.dispose(); } };
}

const pipeline = (changes: Partial<PostPipelineOptions> = {}): PostPipelineOptions => ({
  antiAliasing: "off", depthRange: { near: 0.1, far: 10, projection: "perspective" },
  exposure: 1, toneMapping: "reinhard", dither: false, ...changes
});

async function invokePost(f: ReturnType<typeof postFixture>, options: RendererPostProcessOptions, asynchronous: boolean, output = f.output): Promise<void> {
  if (asynchronous) await f.post.executePostprocessAsync(options, [f.source], output);
  else f.post.executePostprocess(options, [f.source], output);
}

describe("renderer OutputPass input-alpha warranty", () => {
  it.each([
    ["straight", false], ["straight", true], ["premultiplied", false], ["premultiplied", true]
  ] as const)("forwards only the declared input to %s output (async=%s)", async (alphaMode, asynchronous) => {
    const { device, renderer } = rendererFixture();
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const execute = vi.spyOn(OutputPass.prototype, "execute");
    const clear = vi.spyOn(device, "clear");
    const compile = vi.spyOn(device, "createShaderProgram");
    try {
      renderer.setOutput({ alphaMode, inputAlphaMode: "premultiplied", toneMapping: "reinhard" });
      if (asynchronous) await renderer.renderAsync({ source: [], target });
      else renderer.render({ source: [], target });
      expect(clear).toHaveBeenCalledWith(transparentBlack);
      expect(execute).toHaveBeenCalledOnce();
      const [scene, , options, destination] = execute.mock.calls[0]!;
      expect(scene.colorTexture.colorSpace).toBe("linear");
      device.setRenderTarget(scene);
      expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([0, 0, 0, 0]);
      expect(options).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied" });
      expect(destination).toBe(target);
      const shader = compile.mock.calls.find(([sources]) => sources.marker === "a3d.output")?.[0].fragment;
      expect(shader).toContain("#define OUTPUT_ALPHA_PRESERVE");
      expect(shader).toContain("a3dUnassociateScene(scene)");
      expect(shader?.includes("#define OUTPUT_ALPHA_PREMULTIPLIED")).toBe(alphaMode === "premultiplied");
    } finally { execute.mockRestore(); target.dispose(); renderer.dispose(); }
  });

  it("keeps opaque output undeclared and rejects invalid or incomplete atomic updates", () => {
    const { device, renderer } = rendererFixture();
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    const execute = vi.spyOn(OutputPass.prototype, "execute");
    try {
      renderer.render({ source: [], target });
      expect(execute.mock.calls[0]![2]).toMatchObject({ alphaMode: "opaque" });
      expect(execute.mock.calls[0]![2]).not.toHaveProperty("inputAlphaMode");
      for (const alphaMode of ["straight", "premultiplied"] as const) {
        expect(() => renderer.setOutput({ alphaMode })).toThrow("OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE");
      }
      for (const inputAlphaMode of ["straight", "opaque", null, false]) {
        expect(() => renderer.setOutput({ alphaMode: "straight", inputAlphaMode: inputAlphaMode as never }))
          .toThrow("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
      }
      expect(() => renderer.setOutput({ alphaMode: "opaque", inputAlphaMode: "premultiplied" })).toThrow("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
      expect(() => renderer.setOutput({ alphaMode: "invalid" as never })).toThrow("OUTPUT_ALPHA_MODE_UNSUPPORTED");
      expect(renderer.output).toEqual({});
      renderer.setOutput({ alphaMode: "straight", inputAlphaMode: "premultiplied" });
      expect(() => renderer.setOutput({ alphaMode: "opaque" })).toThrow("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
      expect(renderer.output).toMatchObject({ alphaMode: "straight", inputAlphaMode: "premultiplied" });
      renderer.setOutput({ alphaMode: "opaque", inputAlphaMode: undefined });
      expect(renderer.output.alphaMode).toBe("opaque");
    } finally { execute.mockRestore(); target.dispose(); renderer.dispose(); }
  });

  it("validates constructor options as well as subsequent changes", () => {
    for (const output of [
      { alphaMode: "straight" },
      { alphaMode: "premultiplied", inputAlphaMode: "straight" },
      { alphaMode: "opaque", inputAlphaMode: "premultiplied" }
    ]) {
      const device = new MockRenderDevice();
      try {
        expect(() => new Renderer(device, { width: 1, height: 1, shaderLibrary: createLeanCoreShaderLibrary(), output: output as never }, new TemporalHistory()))
          .toThrow(/OUTPUT_INPUT_ALPHA_MODE_/);
      } finally { device.dispose(); }
    }
  });

  it.each(["straight", "premultiplied"] as const)("accepts the constructor warranty on a matching %s canvas", alphaMode => {
    const { device, renderer } = rendererFixture({ alphaMode, inputAlphaMode: "premultiplied" });
    (device as RenderDevice).getPresentationAlphaMode = () => alphaMode;
    const execute = vi.spyOn(OutputPass.prototype, "execute");
    try {
      renderer.render([]);
      expect(execute.mock.calls[0]![2]).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied" });
      expect(execute.mock.calls[0]![3]).toBe("canvas");
      (device as RenderDevice).getPresentationAlphaMode = () => "opaque";
      expect(() => renderer.render([])).toThrow("OUTPUT_ALPHA_MODE_UNAVAILABLE");
      expect(() => renderer.setOutput({ alphaMode, inputAlphaMode: "premultiplied" }))
        .toThrowError(expect.objectContaining({ code: "OUTPUT_ALPHA_MODE_UNAVAILABLE" }));
      expect(renderer.output).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied" });
    } finally { execute.mockRestore(); renderer.dispose(); }
  });

  it.each([false, true])("does not lose the renderer-level policy on flag-off or post routes (async=%s)", async asynchronous => {
    const output = { alphaMode: "straight", inputAlphaMode: "premultiplied" } as const;
    const disabled = rendererFixture(output, false);
    const configured = rendererFixture(output);
    const run = async (renderer: Renderer, source: Parameters<Renderer["render"]>[0]): Promise<void> => {
      if (asynchronous) await renderer.renderAsync(source);
      else renderer.render(source);
    };
    try {
      await expect(run(disabled.renderer, [])).rejects.toMatchObject({ code: "OUTPUT_ALPHA_MODE_UNAVAILABLE" });
      await expect(run(configured.renderer, { renderItems: [], postprocess: { toneMapping: false } }))
        .rejects.toMatchObject({ code: "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE" });
      await expect(run(configured.renderer, { renderItems: [], postprocess: { v2: true, pipeline: pipeline({ alphaMode: "premultiplied", inputAlphaMode: "premultiplied" }) } }))
        .rejects.toMatchObject({ code: "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE" });
    } finally { disabled.renderer.dispose(); configured.renderer.dispose(); }
  });

  it.each([false, true])("refuses an unverified multi-view alpha composition before drawing (async=%s)", async asynchronous => {
    const direct = rendererFixture({ alphaMode: "premultiplied", inputAlphaMode: "premultiplied" });
    const post = rendererFixture();
    const view = { camera: {}, viewport: { x: 0, y: 0, width: 1, height: 1 } };
    const postprocess = { v2: true, pipeline: pipeline({ alphaMode: "straight", inputAlphaMode: "premultiplied" }) } as const;
    try {
      const directInput = { source: [], views: [view] };
      const postInput = { source: { renderItems: [], postprocess }, views: [view] };
      const perViewInput = { source: [], views: [{ ...view, postprocess }] };
      const run = async (renderer: Renderer, input: typeof directInput | typeof postInput | typeof perViewInput) =>
        asynchronous ? renderer.renderAsync(input) : renderer.render(input);
      await expect(run(direct.renderer, directInput)).rejects.toMatchObject({ code: "OUTPUT_ALPHA_MODE_UNAVAILABLE" });
      await expect(run(post.renderer, postInput)).rejects.toMatchObject({ code: "OUTPUT_ALPHA_MODE_UNAVAILABLE" });
      await expect(run(post.renderer, perViewInput)).rejects.toMatchObject({ code: "OUTPUT_ALPHA_MODE_UNAVAILABLE" });
      expect(direct.device.drawCommands).toHaveLength(0);
      expect(post.device.drawCommands).toHaveLength(0);
    } finally { direct.renderer.dispose(); post.renderer.dispose(); }
  });
});

describe("postprocess alpha-policy route admission", () => {
  it.each([false, true])("rejects undeclared, invalid and opaque-incompatible input (async=%s)", async asynchronous => {
    const f = postFixture();
    try {
      for (const alphaMode of ["straight", "premultiplied"] as const) {
        await expect(invokePost(f, { v2: true, pipeline: pipeline({ alphaMode }) }, asynchronous))
          .rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" });
      }
      for (const inputAlphaMode of ["straight", null, false]) {
        await expect(invokePost(f, { v2: true, pipeline: pipeline({ alphaMode: "straight", inputAlphaMode: inputAlphaMode as never }) }, asynchronous))
          .rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED" });
      }
      await expect(invokePost(f, { v2: true, pipeline: pipeline({ alphaMode: "opaque", inputAlphaMode: "premultiplied" }) }, asynchronous))
        .rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED" });
      await expect(invokePost(f, { v2: true, pipeline: pipeline({ alphaMode: null as never }) }, asynchronous))
        .rejects.toMatchObject({ code: "OUTPUT_ALPHA_MODE_UNSUPPORTED" });
      expect(f.present).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each([false, true])("rejects WebGPU, deterministic CPU, legacy, nonfused and targeted-outline fallbacks before presenting (async=%s)", async asynchronous => {
    for (const [kind, changes] of [
      ["webgpu", {}],
      ["mock", {}],
      ["webgl2", { execution: "cpu-deterministic" }],
      ["webgl2", { v2: false }],
      ["webgl2", { filmGrain: true }],
      ["webgl2", { outline: { targets: ["cube"] } }]
    ] as const) {
      const f = postFixture(kind);
      try {
        const options: RendererPostProcessOptions = { v2: true, pipeline: pipeline({ alphaMode: "straight", inputAlphaMode: "premultiplied" }), ...changes };
        await expect(invokePost(f, options, asynchronous)).rejects.toMatchObject({ code: "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE" });
        expect(f.present).not.toHaveBeenCalled();
        expect(f.device.drawCommands).toHaveLength(0);
      } finally { f.dispose(); }
    }
  });

  it.each([false, true])("rejects unverified after-tonemap custom passes without affecting other post scopes (async=%s)", async asynchronous => {
    const f = postFixture("webgl2");
    const scope = {}, otherScope = {};
    const descriptor = {
      id: "alpha-custom-display", owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-tonemap", space: "display",
      inputs: ["color"], fragment: { glsl: "void main() {}" }, gpuOnly: true,
      postScopeMatches: (candidate: object | undefined) => candidate === scope
    } as const;
    const unregister = registerPostPass(descriptor);
    const options: RendererPostProcessOptions = {
      v2: true, pipeline: pipeline({ alphaMode: "straight", inputAlphaMode: "premultiplied" }),
      postFrameContext: { source: {}, items: [], scopeId: scope, sceneDepth: {
        texture: null, available: false, linearize: { near: .1, far: 10, orthographic: false }
      } }
    };
    try {
      await expect(invokePost(f, options, asynchronous)).rejects.toMatchObject({
        code: "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE", details: { customDisplay: true }
      });
      // Out-of-scope passes are not used as a blanket alpha rejection. A v2
      // host is deliberately not registered, so this reaches the next seam.
      const scoped = { ...options, postFrameContext: { ...options.postFrameContext!, scopeId: otherScope } };
      await expect(invokePost(f, scoped, asynchronous)).rejects.toMatchObject({ code: "POST_GRAPH_V2_UNSUPPORTED" });
      // A pipeline descriptor with the same ID takes precedence over the
      // registered display descriptor, exactly as it does in the v2 graph.
      const hdrFirst = { ...descriptor, insertAt: "before-tonemap", space: "linear-hdr" } as const;
      const deduped = { ...options, pipeline: pipeline({
        alphaMode: "straight", inputAlphaMode: "premultiplied", customPasses: [hdrFirst]
      }) };
      await expect(invokePost(f, deduped, asynchronous)).rejects.toMatchObject({ code: "POST_GRAPH_V2_UNSUPPORTED" });
      expect(f.present).not.toHaveBeenCalled();
    } finally { unregister(); f.dispose(); }
  });

  it.each([false, true])("keeps the explicitly warranted WebGL2 v2 OutputPass route operational (async=%s)", async asynchronous => {
    const f = postFixture("webgl2");
    const resolveMultisampleTarget = vi.fn();
    const buffers = new Set<unknown>();
    const createBuffer = f.device.createBuffer.bind(f.device);
    vi.spyOn(f.device, "createBuffer").mockImplementation((...args) => {
      const buffer = createBuffer(...args);
      buffers.add(buffer);
      return buffer;
    });
    registerWebGL2DeviceHost({
      device: f.device, gl: {}, buffers, resolveMultisampleTarget, stateCache: { invalidate() {} },
      post: { presentLdrPostprocess: f.present }
    } as unknown as WebGL2DeviceHost);
    const execute = vi.spyOn(OutputPass.prototype, "execute");
    const options: RendererPostProcessOptions = { v2: true, pipeline: pipeline({ alphaMode: "straight", inputAlphaMode: "premultiplied" }) };
    try {
      await postV2ModulesReady();
      f.device.beginFrame(1, 1);
      f.device.setRenderTarget(f.source);
      f.device.clear([0.5, 0, 0, 0.5]);
      await invokePost(f, options, asynchronous);
      expect(resolveMultisampleTarget).toHaveBeenCalled();
      expect(execute).toHaveBeenCalledOnce();
      expect(execute.mock.calls[0]![2]).toMatchObject({ alphaMode: "straight", inputAlphaMode: "premultiplied" });
      expect(execute.mock.calls[0]![3]).toBe(f.output);
      expect(f.device.drawCommands.at(-1)?.label).toBe("prd01-output");
      expect(f.present).not.toHaveBeenCalled();
      f.device.endFrame();
    } finally { execute.mockRestore(); f.dispose(); }
  });

  it.each([false, true])("preserves opaque WebGPU native presentation (async=%s)", async asynchronous => {
    const f = postFixture("webgpu");
    const options: RendererPostProcessOptions = { v2: true, pipeline: pipeline({ alphaMode: "opaque" }) };
    try {
      await invokePost(f, options, asynchronous);
      expect(f.present).toHaveBeenCalledOnce();
      const [, presentation] = f.present.mock.calls[0] as [RenderTarget, { toneMappingDefaults: Record<string, unknown> }];
      expect(presentation.toneMappingDefaults).toMatchObject({ alphaMode: "opaque", outputColorSpace: "srgb" });
      expect(presentation.toneMappingDefaults).not.toHaveProperty("inputAlphaMode");
    } finally { f.dispose(); }
  });

  it.each([
    ["auto", false], ["auto", true], ["cpu-deterministic", false], ["cpu-deterministic", true]
  ] as const)("keeps opaque nonfused %s output compatible (async=%s)", async (execution, asynchronous) => {
    const f = postFixture();
    const options: RendererPostProcessOptions = {
      v2: true, execution, pipeline: pipeline({ alphaMode: "opaque" }),
      toneMapping: { operator: "linear", outputColorSpace: "linear" }, filmGrain: { intensity: 0 }
    };
    try {
      f.device.beginFrame(1, 1);
      f.device.setRenderTarget(f.source);
      f.device.clear([0.2, 0.1, 0, 1]);
      await invokePost(f, options, asynchronous);
      f.device.setRenderTarget(f.output);
      expect(Array.from(f.device.readPixels(0, 0, 1, 1))).toEqual([51, 26, 0, 255]);
      f.device.endFrame();
    } finally { f.dispose(); }
  });
});
