/**
 * #1083 GPU frame-graph: the after-opaque depth copy sampled 0 at center and
 * corner. Two defects in `SceneDepthCopyPass`:
 *  - `u_depth` was bound with the default (LINEAR) sampler; a depth texture
 *    with compare mode NONE is incomplete under LINEAR (GLES 3.0 §3.8.13) and
 *    samples 0. The pass now binds `DEPTH_TEXTURE_SAMPLER` (NEAREST, no compare).
 *  - the copy wrote `gl_FragDepth` under `less-equal` against a never-cleared
 *    target, so every fragment failed; the copy now tests `always`.
 */

import { describe, expect, it, afterEach } from "vitest";
import { MockRenderDevice, type DrawCommand, type RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import { DEPTH_COPY_RENDER_STATE, DEPTH_TEXTURE_SAMPLER, SceneDepthCopyPass, ensureSceneDepthCopyTarget } from "../../../../packages/rendering/src/renderer/SceneDepthCopyPass";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { WebGL2SamplerRegistry } from "../../../../packages/rendering/src/webgl2/Samplers";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";

const GL = {
  TEXTURE_2D: 0x0de1,
  TEXTURE_CUBE_MAP: 0x8513,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  TEXTURE_WRAP_R: 0x8072,
  TEXTURE_COMPARE_MODE: 0x884c,
  TEXTURE_COMPARE_FUNC: 0x884d,
  COMPARE_REF_TO_TEXTURE: 0x884e,
  LEQUAL: 0x0203,
  GEQUAL: 0x0206,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  NEAREST_MIPMAP_NEAREST: 0x2700,
  LINEAR_MIPMAP_NEAREST: 0x2701,
  NEAREST_MIPMAP_LINEAR: 0x2702,
  LINEAR_MIPMAP_LINEAR: 0x2703,
  REPEAT: 0x2901,
  CLAMP_TO_EDGE: 0x812f,
  MIRRORED_REPEAT: 0x8370
};

function samplerParams(): { registry: WebGL2SamplerRegistry; params: Map<number, number> } {
  const params = new Map<number, number>();
  const gl = {
    ...GL,
    createSampler: () => ({}),
    samplerParameteri: (_h: unknown, parameter: number, value: number) => params.set(parameter, value),
    samplerParameterf: (_h: unknown, parameter: number, value: number) => params.set(parameter, value)
  };
  const host = {
    gl,
    counters: { samplerParameterUploadCount: 0, samplerAnisotropyUploadCount: 0 },
    stateCache: {},
    anisotropicFilteringExtension: null,
    maxTextureAnisotropy: 1,
    textureRegistry: {},
    lifecycle: {}
  } as unknown as import("../../../../packages/rendering/src/webgl2/DeviceHost").WebGL2DeviceHost;
  return { registry: new WebGL2SamplerRegistry(host), params };
}

const depthTexture = (): Texture => new Texture({ width: 4, height: 4, format: "depth24", renderAttachment: true } as ConstructorParameters<typeof Texture>[0]);

describe("after-opaque scene depth copy (#1083 frame-graph depth = 0)", () => {
  afterEach(() => setRendererQrFlags(resolveQrFlags({ options: ["none"] })));

  it("copy draw binds u_depth with a NEAREST sampler and tests depth `always`", () => {
    const device = new MockRenderDevice();
    const input: RenderTarget = device.createRenderTarget({ label: "hdr", width: 4, height: 4, depth: "texture" });
    expect(input.depthTexture).toBeTruthy();
    const copy = ensureSceneDepthCopyTarget(device, null, 4, 4);
    device.beginFrame(4, 4);
    new SceneDepthCopyPass(input, copy).execute({ device, width: 4, height: 4 });
    device.endFrame();
    const draw = device.drawCommands.at(-1) as DrawCommand & { uniforms?: ReadonlyMap<string, unknown> };
    expect(draw).toBeTruthy();
    expect(draw.renderState?.depthCompare).toBe("always");
    expect(draw.renderState?.depthWrite).toBe(true);
    const binding = draw.uniforms?.get("u_depth") as TextureBinding;
    expect(binding).toBeInstanceOf(TextureBinding);
    expect(binding.sampler.minFilter).toBe("nearest");
    expect(binding.sampler.magFilter).toBe("nearest");
    expect(binding.sampler.compare).toBeUndefined();
    expect(DEPTH_COPY_RENDER_STATE.depthCompare).toBe("always");
  });

  it.each([
    ["flag-off", resolveQrFlags({ options: ["none"] })],
    ["A3D_QR_LIGHTING (C-12 sampler path)", resolveQrFlags({ options: { A3D_QR_LIGHTING: true } })]
  ])("DEPTH_TEXTURE_SAMPLER maps to NEAREST/NEAREST, no compare mode (%s)", (_label, flags) => {
    setRendererQrFlags(flags);
    const { registry, params } = samplerParams();
    registry.getSamplerHandle(DEPTH_TEXTURE_SAMPLER, GL.TEXTURE_2D, depthTexture());
    expect(params.get(GL.TEXTURE_MIN_FILTER)).toBe(GL.NEAREST);
    expect(params.get(GL.TEXTURE_MAG_FILTER)).toBe(GL.NEAREST);
    expect(params.get(GL.TEXTURE_WRAP_S)).toBe(GL.CLAMP_TO_EDGE);
    expect(params.has(GL.TEXTURE_COMPARE_MODE)).toBe(false);
  });
});
