import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuraApp, AuraCreateAppOptions } from "../../../packages/engine/src/agent-api/index";
import { effects, scene } from "../../../packages/engine/src/agent-api/index";
import { createProductionRuntimeSceneRenderer, outputClearColor } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  authoredPostContextFor, recordAuthoredPostContext, resetAuthoredPostContext
} from "../../../packages/engine/src/agent-api/postBridge";
import { PRD01_OUTPUT_STATE, type Prd01OutputState } from "../../../packages/engine/src/lanes/prd01/diagnostics";
import { createPrd01OutputSurface, disposePrd01OutputSurface } from "../../../packages/engine/src/lanes/prd01/outputSurface";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";

const rendererKey = Symbol.for("a3d.prd01.renderer");
const flags = createTrustedQrFlags({ A3D_QR_CORE_OUTPUT: true, A3D_QR_POST: true });
const clear = [0, 0, 0, 0] as const; // Synthetic source, not the compiler's coverage-tagged background.
const snapshot = scene().background("#336699", { toneMapped: false }).add(effects.antiAlias({ mode: "off" })).toJSON();
const transparentBlackScene = scene().background("#000000", { toneMapped: false }).toJSON();

function appFixture(options: Partial<AuraCreateAppOptions> = {}) {
  const app = {
    canvas: {} as HTMLCanvasElement,
    screenshot: () => ({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 1, height: 1 }),
    diagnostics: () => ({ errors: [], degradations: [] }),
    step: () => 0
  } as unknown as AuraApp;
  const context = { flags, options: options as AuraCreateAppOptions };
  recordAuthoredPostContext(context, app);
  const surface = createPrd01OutputSurface(app, context);
  const state = (surface as unknown as { [PRD01_OUTPUT_STATE]: Prd01OutputState })[PRD01_OUTPUT_STATE];
  const pipeline = () => createProductionRuntimePostprocess(snapshot, [], 1, 1, true, { canvas: app.canvas });
  return { app, surface, state, pipeline, dispose: () => disposePrd01OutputSurface(surface) };
}

function realRenderer() {
  const device = new MockRenderDevice();
  const renderer = new Renderer(device, {
    width: 1, height: 1, clearColor: clear, outputClearColor: clear, qrFlags: flags,
    shaderLibrary: createLeanCoreShaderLibrary()
  }, new TemporalHistory());
  return { device, renderer };
}

function attach(app: AuraApp, renderer: Renderer): void {
  (app as unknown as Record<symbol, unknown>)[rendererKey] = renderer;
}

function executePost(device: MockRenderDevice, postprocess: RendererPostProcessOptions): void {
  const source = device.createRenderTarget({ width: 1, height: 1, format: "rgba16f", depth: false });
  try {
    const post = new RendererPostprocessPipeline({ device, width: 1, height: 1 } as unknown as RendererHost);
    post.executePostprocess(postprocess, [source]);
  } finally { source.dispose(); }
}

/** Stop the mount after running the real renderer's constructor validation. */
function constructionProbe() {
  const stop = new Error("stop at renderer creation");
  const create = vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const device = new MockRenderDevice();
    let renderer: Renderer | undefined;
    try {
      renderer = new Renderer(device, { ...options, canvas: undefined, shaderLibrary: createLeanCoreShaderLibrary() }, new TemporalHistory());
    } finally {
      if (renderer) renderer.dispose();
      else device.dispose();
    }
    throw stop;
  });
  const canvas = { width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement;
  return { create, stop, canvas };
}

/** The options the engine passed to the first `Renderer.create` call. */
function firstCreateOptions(create: ReturnType<typeof constructionProbe>["create"]) {
  const options = create.mock.calls[0]?.[0];
  if (!options) throw new Error("Renderer.create was not called with options");
  return options;
}

afterEach(() => resetAuthoredPostContext());

describe("engine input-alpha warranty", () => {
  it.each(["straight", "premultiplied"] as const)(
    "forwards the initial %s declaration to the production Renderer constructor",
    async alphaMode => {
      const { stop, create, canvas } = constructionProbe();
      try {
        await expect(createProductionRuntimeSceneRenderer(canvas, transparentBlackScene, { backend: "webgl2" }, undefined, flags, undefined, {
          output: { alphaMode, inputAlphaMode: "premultiplied", outputColorSpace: "srgb" }
        })).rejects.toBe(stop);
        expect(create).toHaveBeenCalledOnce();
        expect(firstCreateOptions(create).output).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied" });
        expect(firstCreateOptions(create).presentationAlphaMode).toBe(alphaMode);
      } finally { create.mockRestore(); }
    }
  );

  it("rejects missing initial input at the real renderer constructor", async () => {
    const { create, canvas } = constructionProbe();
    try {
      await expect(createProductionRuntimeSceneRenderer(canvas, transparentBlackScene, { backend: "webgl2" }, undefined, flags, undefined, {
        output: { alphaMode: "straight" }
      })).rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" });
      expect(firstCreateOptions(create).output).not.toHaveProperty("inputAlphaMode");
    } finally { create.mockRestore(); }
  });

  it("rejects an invalid initial opaque warranty at the real renderer constructor", async () => {
    const { create, canvas } = constructionProbe();
    try {
      await expect(createProductionRuntimeSceneRenderer(canvas, transparentBlackScene, { backend: "webgl2" }, undefined, flags, undefined, {
        output: { alphaMode: "opaque", inputAlphaMode: "premultiplied" }
      })).rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED" });
      expect(firstCreateOptions(create).output).toMatchObject({ alphaMode: "opaque", inputAlphaMode: "premultiplied" });
    } finally { create.mockRestore(); }
  });

  it("leaves an initial opaque output undeclared at the real renderer constructor", async () => {
    const { stop, create, canvas } = constructionProbe();
    try {
      await expect(createProductionRuntimeSceneRenderer(canvas, transparentBlackScene, { backend: "webgl2" }, undefined, flags, undefined, {
        output: { alphaMode: "opaque" }
      })).rejects.toBe(stop);
      expect(firstCreateOptions(create).output).toMatchObject({ alphaMode: "opaque" });
      expect(firstCreateOptions(create).output).not.toHaveProperty("inputAlphaMode");
    } finally { create.mockRestore(); }
  });

  it.each(["straight", "premultiplied"] as const)(
    "carries explicit %s output through app.setOutput, the real renderer and post compilation",
    alphaMode => {
      const f = appFixture({
        renderer: { output: { alphaMode, inputAlphaMode: "premultiplied", exposure: 1 } },
        output: { outputColorSpace: "srgb" }
      });
      const { device, renderer } = realRenderer();
      const setOutput = vi.spyOn(renderer, "setOutput");
      const execute = vi.spyOn(OutputPass.prototype, "execute");
      const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
      try {
        attach(f.app, renderer);
        expect(f.app.setOutput).toBeTypeOf("function");
        f.app.setOutput!({ exposure: 2 });
        expect(setOutput).toHaveBeenCalledWith({
          alphaMode, inputAlphaMode: "premultiplied", outputColorSpace: "srgb", exposure: 2
        });
        renderer.render({ source: [], target });
        expect(execute.mock.calls[0]![2]).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied", exposure: 2 });

        const post = f.pipeline();
        expect(post.v2).toBe(true);
        expect(post.pipeline).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied", exposure: 2 });
        // The renderer accepted the matching policy, then this mock backend
        // failed its independent HDR admission. At the post boundary itself,
        // the mock backend is rejected for alpha preservation.
        expect(() => renderer.render({ renderItems: [], postprocess: post }))
          .toThrowError(expect.objectContaining({ code: "HDR_POSTPROCESS_UNSUPPORTED" }));
        expect(() => executePost(device, post))
          .toThrowError(expect.objectContaining({ code: "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE" }));

        f.app.setOutput!({ inputAlphaMode: undefined, alphaMode: undefined, dither: false });
        expect(renderer.output).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied", exposure: 2, dithering: false });
        expect(f.pipeline().pipeline).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied", exposure: 2 });
        expect(f.state.snapshot().requested).toMatchObject({ alphaMode, inputAlphaMode: "premultiplied", exposure: 2 });
        f.app.setOutput!({ inputAlphaMode: "premultiplied" });
        expect(setOutput).toHaveBeenLastCalledWith({ inputAlphaMode: "premultiplied" });
      } finally {
        setOutput.mockRestore();
        execute.mockRestore();
        target.dispose();
        renderer.dispose();
        f.dispose();
      }
    }
  );

  it("keeps the pending initial policy and latest updates when the renderer attaches between calls", () => {
    const f = appFixture({ output: { alphaMode: "straight", inputAlphaMode: "premultiplied" } });
    const { renderer } = realRenderer();
    const setOutput = vi.spyOn(renderer, "setOutput");
    try {
      f.app.setOutput!({ exposure: 1.5 });
      attach(f.app, renderer);
      f.app.setOutput!({ exposure: 2 });
      expect(setOutput).toHaveBeenCalledOnce();
      expect(setOutput).toHaveBeenLastCalledWith({ alphaMode: "straight", inputAlphaMode: "premultiplied", exposure: 2 });
      f.app.setOutput!({ dither: false });
      expect(setOutput).toHaveBeenLastCalledWith({ dithering: false });
      expect(renderer.output).toMatchObject({ alphaMode: "straight", inputAlphaMode: "premultiplied", exposure: 2 });
    } finally { setOutput.mockRestore(); renderer.dispose(); f.dispose(); }
  });

  it("rejects malformed partial updates atomically, with or without a live renderer", () => {
    const f = appFixture({ output: { alphaMode: "straight", inputAlphaMode: "premultiplied", exposure: 1 } });
    const { renderer } = realRenderer();
    const setOutput = vi.spyOn(renderer, "setOutput");
    try {
      for (const attached of [false, true]) {
        if (attached) attach(f.app, renderer);
        for (const invalid of ["straight", "opaque", null, false, 0]) {
          expect(() => f.app.setOutput!({ exposure: 9, inputAlphaMode: invalid as never }))
            .toThrowError(expect.objectContaining({ code: "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED" }));
          expect(f.state.snapshot().requested).toMatchObject({ exposure: 1, inputAlphaMode: "premultiplied" });
          expect(f.pipeline().pipeline).toMatchObject({ exposure: 1, inputAlphaMode: "premultiplied" });
        }
      }
      expect(setOutput).not.toHaveBeenCalled();
      expect(() => f.app.setOutput!({ alphaMode: "opaque" })).toThrow(/OUTPUT_ALPHA_MODE_UNAVAILABLE/);
    } finally { setOutput.mockRestore(); renderer.dispose(); f.dispose(); }
  });

  it("keeps pending policy and post state intact when the live renderer rejects an update", () => {
    const f = appFixture({ output: { alphaMode: "straight", inputAlphaMode: "premultiplied", exposure: 1 } });
    const { renderer } = realRenderer();
    const setOutput = vi.spyOn(renderer, "setOutput").mockImplementationOnce(() => { throw new Error("renderer-rejected"); });
    try {
      attach(f.app, renderer);
      expect(() => f.app.setOutput!({ exposure: 2 })).toThrow("renderer-rejected");
      expect(f.state.snapshot().requested).toMatchObject({ exposure: 1, inputAlphaMode: "premultiplied" });
      expect(f.pipeline().pipeline).toMatchObject({ exposure: 1, inputAlphaMode: "premultiplied" });
      f.app.setOutput!({ exposure: 3 });
      expect(setOutput).toHaveBeenLastCalledWith({ alphaMode: "straight", inputAlphaMode: "premultiplied", exposure: 3 });
      expect(f.pipeline().pipeline).toMatchObject({ exposure: 3, inputAlphaMode: "premultiplied" });
    } finally { setOutput.mockRestore(); renderer.dispose(); f.dispose(); }
  });

  it.each(["straight", "premultiplied"] as const)(
    "does not infer the %s warranty from output mode or background coverage",
    async alphaMode => {
      const f = appFixture({ output: { alphaMode, backgroundPassthrough: true } });
      const { device, renderer } = realRenderer();
      try {
        const compilerClear = outputClearColor(snapshot);
        expect(compilerClear[3]).toBe(0);
        expect(compilerClear.slice(0, 3).some(value => value > 0)).toBe(true);
        const post = f.pipeline();
        expect(post.pipeline).toMatchObject({ alphaMode, backgroundPassthrough: true });
        expect(post.pipeline).not.toHaveProperty("inputAlphaMode");
        expect(() => executePost(device, post))
          .toThrowError(expect.objectContaining({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" }));
        expect(device.drawCommands).toHaveLength(0);
        expect(() => f.app.setOutput!({ exposure: 2 }))
          .toThrowError(expect.objectContaining({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" }));
        attach(f.app, renderer);
        await expect(f.surface.capture({ type: "png-blob" })).rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" });
      } finally { renderer.dispose(); f.dispose(); }
    }
  );

  it.each([
    { alphaMode: "straight", inputAlphaMode: "straight" },
    { alphaMode: "straight", inputAlphaMode: null },
    { alphaMode: "straight", inputAlphaMode: false },
    { alphaMode: "opaque", inputAlphaMode: "premultiplied" }
  ])("forwards invalid authored initial input for renderer rejection: %o", async output => {
    const f = appFixture({ output: output as never });
    const { device, renderer } = realRenderer();
    try {
      const post = f.pipeline();
      expect(post.pipeline).toHaveProperty("inputAlphaMode", output.inputAlphaMode);
      attach(f.app, renderer);
      await expect(f.surface.capture({ type: "png-blob" })).rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED" });
      expect(device.drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); f.dispose(); }
  });

  it("preserves opaque legacy defaults without inventing an input declaration", () => {
    const f = appFixture();
    const { device, renderer } = realRenderer();
    const execute = vi.spyOn(OutputPass.prototype, "execute");
    const target = device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
    try {
      attach(f.app, renderer);
      f.app.setOutput!({ exposure: 2, backgroundPassthrough: true });
      renderer.render({ source: [], target });
      expect(execute.mock.calls[0]![2]).toMatchObject({ alphaMode: "opaque", exposure: 2 });
      expect(execute.mock.calls[0]![2]).not.toHaveProperty("inputAlphaMode");
      expect(f.pipeline().pipeline).toMatchObject({ alphaMode: "opaque", exposure: 2 });
      expect(f.pipeline().pipeline).not.toHaveProperty("inputAlphaMode");
      expect(() => f.app.setOutput!({ inputAlphaMode: "premultiplied" }))
        .toThrowError(expect.objectContaining({ code: "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED" }));
    } finally { execute.mockRestore(); target.dispose(); renderer.dispose(); f.dispose(); }
  });

  it("retains and scopes policy updates to their own canvas", () => {
    const a = appFixture({ output: { alphaMode: "straight", inputAlphaMode: "premultiplied" } });
    const b = appFixture({ output: { alphaMode: "opaque" } });
    try {
      a.app.setOutput!({ exposure: 1.7 });
      expect(a.pipeline().pipeline).toMatchObject({ alphaMode: "straight", inputAlphaMode: "premultiplied", exposure: 1.7 });
      expect(b.pipeline().pipeline).toMatchObject({ alphaMode: "opaque" });
      expect(b.pipeline().pipeline).not.toHaveProperty("inputAlphaMode");
      expect(authoredPostContextFor(b.app.canvas)?.output).not.toHaveProperty("inputAlphaMode");
    } finally { a.dispose(); b.dispose(); }
  });
});
