// WebGPU, `output.toneMapping: "none"` (Chroma Roll): the scene draws into a linear HDR target and the native chain runs
// bloom, grade and depth of field behind a linear output conversion, as the WebGL2 v2 graph runs them; a targeted outline
// draws through its WGSL twin instead of recording OUTLINE_TARGETS_WEBGL2_ONLY. Host-side checks only; no GPU execution.
import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type LdrPostprocessPresentationOptions, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { RendererPostprocessPipeline, resolvePostprocessTargetFormat, webgpuLinearHdrWithoutTone } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";
import { OUTLINE_TARGET_WEBGPU_SHADER } from "../../../packages/rendering/src/renderer/OutlineTargets";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection";

function device(kind: "webgpu" | "webgl2") {
  const mock = new MockRenderDevice();
  Object.defineProperty(mock, "kind", { value: kind });
  Object.defineProperty(mock, "info", { value: { ...mock.info, backend: kind, capabilities: [...mock.info.capabilities!, "hdr-render-targets"] } });
  const present = vi.fn((_source: RenderTarget, _options: LdrPostprocessPresentationOptions) => {});
  (mock as RenderDevice).presentLdrPostprocess = present;
  return { mock, present };
}

const noTone = (extra: Partial<RendererPostProcessOptions> = {}): RendererPostProcessOptions => ({
  v2: true, toneMapping: false, targetFormat: "rgba8", pipeline: { toneMapping: "none", exposure: 1 }, ...extra
});

describe("WebGPU post without a tone operator", () => {
  it("draws a v2 toneMapping:none frame into a linear HDR target on WebGPU only", () => {
    const gpu = device("webgpu"), gl = device("webgl2");
    try {
      expect(webgpuLinearHdrWithoutTone(gpu.mock, noTone())).toBe(true);
      expect(resolvePostprocessTargetFormat(gpu.mock, noTone())).toBe("rgba16f");
      expect(resolvePostprocessTargetFormat(gl.mock, noTone())).toBe("rgba8");
      expect(resolvePostprocessTargetFormat(gpu.mock, noTone({ execution: "cpu-deterministic" }))).toBe("rgba8");
      expect(resolvePostprocessTargetFormat(gpu.mock, noTone({ v2: false }))).toBe("rgba8");
      expect(resolvePostprocessTargetFormat(gpu.mock, noTone({ toneMapping: { operator: "aces" } }))).toBe("rgba8");
    } finally { gpu.mock.dispose(); gl.mock.dispose(); }
  });

  it.each([false, true])("puts a linear output conversion after HDR bloom and before the grade (async=%s)", async (asynchronous) => {
    const { mock, present } = device("webgpu");
    const post = new RendererPostprocessPipeline({ device: mock, width: 4, height: 4 } as unknown as RendererHost);
    const target = mock.createRenderTarget({ width: 4, height: 4, format: "rgba16f" });
    const scopeId = {}, token = postDiagnostics.begin(scopeId, "main", 1);
    const options = noTone({
      bloom: { threshold: 0.8, intensity: 0.4, radius: 2 }, colorGrade: { contrast: 1.1, saturation: 1.2 },
      postFrameContext: { source: {}, items: [], scopeId, viewId: "main", frameId: 1, timeSeconds: 0, diagnosticToken: token,
        sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 10, orthographic: false } } } as never
    });
    try {
      if (asynchronous) await post.executePostprocessAsync(options, [target]); else post.executePostprocess(options, [target]);
      expect(present).toHaveBeenCalledOnce();
      const passes = present.mock.calls[0]![1].passes;
      expect(passes.map((pass) => pass.name)).toEqual(["bloom", "tone-mapping", "color-grade"]);
      expect(passes[1]!.options).toMatchObject({ operator: "linear" });
    } finally { postDiagnostics.resetScope(scopeId); target.dispose(); mock.dispose(); }
  });

  it("the targeted-outline WGSL twin reads the bindings its GLSL reflection declares", () => {
    const reflection = reflectShaderSources({ vertex: OUTLINE_TARGET_WEBGPU_SHADER.vertex, fragment: OUTLINE_TARGET_WEBGPU_SHADER.fragment });
    const names = OUTLINE_TARGET_WEBGPU_SHADER.portableBindings!.map((binding) => binding.name);
    for (const name of names) expect(reflection.uniforms.has(name)).toBe(true);
    const wgsl = OUTLINE_TARGET_WEBGPU_SHADER.webgpu!;
    expect(wgsl.vertex).toContain("@location(0) position: vec2<f32>");
    expect(wgsl.fragment).toContain("textureLoad(u_outlineMaskTexture, pixel, 0)");
    expect(wgsl.fragment).toContain("textureLoad(u_outlineSceneTexture, pixel, 0)");
    for (const member of ["u_outlineParams", "u_outlineColor"]) expect(wgsl.fragment).toContain(`aura.${member}`);
    // Reversed depth flips the empty test and the visibility bias.
    expect(wgsl.fragment).toMatch(/reversed && d <= 0\.00001/);
    expect(wgsl.fragment).toContain("d >= scene - aura.u_outlineParams.y");
  });
});
