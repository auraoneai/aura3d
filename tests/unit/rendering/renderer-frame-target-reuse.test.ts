import { describe, expect, it, vi } from "vitest";
import { DirectionalLight } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { ShadowMap } from "../../../packages/rendering/src/ShadowMap";
import { ShadowPass } from "../../../packages/rendering/src/ShadowPass";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

/**
 * Regression coverage for two per-frame GPU allocations that held an animating route at ~2 FPS.
 *
 * Both were found by counting WebGL calls per rendered frame on the Aura Clash playable route, which
 * renders 91 skinned/shadowed draw calls:
 *
 *  1. `ShadowPass` is constructed fresh by `Renderer` every frame, so `DepthPass`'s instance-field
 *     shader cache was discarded each frame and the depth shader was **recompiled and relinked every
 *     frame** (measured: 1 `compileShader` + 1 `linkProgram` + 1 `createProgram` per frame). WebGL
 *     shader compilation is a synchronous GPU stall.
 *  2. The shadow depth target and the postprocess forward-colour target were both allocated inside
 *     the frame and disposed at end of frame (measured: 3 `createTexture` + 3
 *     `checkFramebufferStatus` per frame).
 *
 * After both fixes the same route reported **0** per-frame shader compiles and **0** per-frame
 * texture/framebuffer allocations.
 */
describe("depth shader module is cached across DepthPass instances", () => {
  it("reuses a library's program across pass instances but separates different libraries", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const library = createLeanCoreShaderLibrary();
    const compile = vi.spyOn(device, "createShaderProgram");
    try {
      device.beginFrame(8, 8);
      const draw = (shaderLibrary: typeof library) => new DepthPass({ casters: [{ geometry }], shaderLibrary }).execute({ device, width: 8, height: 8 });
      draw(library);
      draw(library);
      expect(compile).toHaveBeenCalledTimes(1);
      draw(createLeanCoreShaderLibrary());
      expect(compile).toHaveBeenCalledTimes(2);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });
});

describe("renderer reuses frame render targets", () => {
  it("reallocates the forward target when format, depth mode, samples, or size changes", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const internals = renderer as unknown as { ensureForwardColorTarget(format: "rgba8" | "rgba16f", depth: boolean, samples: number): RenderTarget };
    try {
      const first = internals.ensureForwardColorTarget("rgba8", false, 1);
      expect(internals.ensureForwardColorTarget("rgba8", false, 1)).toBe(first);
      const format = internals.ensureForwardColorTarget("rgba16f", false, 1);
      expect(format).not.toBe(first);
      expect(first.disposed).toBe(true);
      const depth = internals.ensureForwardColorTarget("rgba16f", true, 1);
      expect(depth).not.toBe(format);
      expect(format.disposed).toBe(true);
      const samples = internals.ensureForwardColorTarget("rgba16f", true, 4);
      expect(samples).not.toBe(depth);
      expect(depth.disposed).toBe(true);
      renderer.resize(12, 10);
      const size = internals.ensureForwardColorTarget("rgba16f", true, 4);
      expect(size).not.toBe(samples);
      expect(samples.disposed).toBe(true);
      expect([size.width, size.height]).toEqual([12, 10]);
      renderer.dispose();
      expect(size.disposed).toBe(true);
    } finally { renderer.dispose(); }
  });

  it("reuses both targets across frames and releases them with the renderer", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    setRendererQrFlags(resolveQrFlags({ options: ["none"] }), renderer.device);
    const geometry = Geometry.triangle();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const create = vi.spyOn(renderer.device, "createRenderTarget");
    const source = {
      renderItems: [{ geometry, label: "caster", castShadow: true }],
      cameraPolicy: "identity" as const,
      shadow: { light, size: 8 },
      postprocess: { toneMapping: { exposure: 1, gamma: 1, operator: "reinhard" as const, outputColorSpace: "linear" as const } }
    };
    try {
      renderer.render(source);
      renderer.render(source);
      const targetFor = (label: string) => {
        const indices = create.mock.calls.flatMap(([descriptor], index) => descriptor.label === label ? [index] : []);
        expect(indices).toHaveLength(1);
        return create.mock.results[indices[0]!]!.value;
      };
      const shadow = targetFor("renderer-shadow-depth-color");
      const forward = targetFor("renderer-forward-color");
      expect(shadow.disposed).toBe(false);
      expect(forward.disposed).toBe(false);
      renderer.dispose();
      expect(shadow.disposed).toBe(true);
      expect(forward.disposed).toBe(true);
    } finally { renderer.dispose(); geometry.dispose(); }
  });
});

describe("shadow pass honours a caller-owned render target", () => {
  it("uses a correctly sized external target without disposing it", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const supplied = device.createRenderTarget({ width: 4, height: 4, depth: true });
    const pass = new ShadowPass({ light, casters: [{ geometry }], shadowMap: new ShadowMap({ size: 4 }), renderTarget: supplied });
    try {
      expect(pass.execute({ device, width: 4, height: 4 }).rendered).toBe(true);
      expect(pass.getRenderTarget()).toBe(supplied);
      pass.dispose();
      expect(supplied.disposed).toBe(false);
    } finally { pass.dispose(); supplied.dispose(); geometry.dispose(); device.dispose(); }
  });
});
