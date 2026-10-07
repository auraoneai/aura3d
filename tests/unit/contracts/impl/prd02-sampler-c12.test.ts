// PRD-02 Phase 3 — C-12 real sampler mapping in `webgl2/Samplers.ts`
// (device-mock test): compare → COMPARE_REF_TO_TEXTURE + LEQUAL/GEQUAL with
// LINEAR; mirror → MIRRORED_REPEAT; addressW → TEXTURE_WRAP_R; `*-mipmap-*`
// downgraded to the non-mip filter on exactly-1-level textures. Flag-off
// mapping byte-identical (the C-12 fields are inert, keys unchanged).

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Sampler } from "../../../../packages/rendering/src/Sampler";
import { WebGL2SamplerRegistry } from "../../../../packages/rendering/src/webgl2/Samplers";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";

// WebGL2 enum constants used by the registry.
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

function mockHost() {
  const calls: { readonly parameter: number; readonly value: number }[] = [];
  const gl = {
    ...GL,
    createSampler: () => ({ __sampler: calls }),
    samplerParameteri: (_h: unknown, parameter: number, value: number) => {
      calls.push({ parameter, value });
    },
    samplerParameterf: (_h: unknown, parameter: number, value: number) => {
      calls.push({ parameter, value });
    }
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
  return { host, calls };
}

const paramsOf = (calls: { parameter: number; value: number }[]) => new Map(calls.map((c) => [c.parameter, c.value]));

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const FLAGS_OFF = resolveQrFlags({});

describe("prd02 C-12 WebGL2SamplerRegistry (device mock)", () => {
  beforeEach(() => setRendererQrFlags(FLAGS_ON));
  afterEach(() => setRendererQrFlags(FLAGS_OFF));

  it("compare sampler → COMPARE_REF_TO_TEXTURE + LEQUAL, filters forced LINEAR", () => {
    const { host, calls } = mockHost();
    const reg = new WebGL2SamplerRegistry(host);
    const sampler = new Sampler({ compare: "less-equal", minFilter: "nearest-mipmap-nearest", magFilter: "nearest" });
    reg.getSamplerHandle(sampler, GL.TEXTURE_2D);
    const p = paramsOf(calls);
    expect(p.get(GL.TEXTURE_COMPARE_MODE)).toBe(GL.COMPARE_REF_TO_TEXTURE);
    expect(p.get(GL.TEXTURE_COMPARE_FUNC)).toBe(GL.LEQUAL);
    expect(p.get(GL.TEXTURE_MIN_FILTER)).toBe(GL.LINEAR);
    expect(p.get(GL.TEXTURE_MAG_FILTER)).toBe(GL.LINEAR);
  });

  it("compare 'greater-equal' → GEQUAL", () => {
    const { host, calls } = mockHost();
    new WebGL2SamplerRegistry(host).getSamplerHandle(new Sampler({ compare: "greater-equal" }), GL.TEXTURE_2D);
    expect(paramsOf(calls).get(GL.TEXTURE_COMPARE_FUNC)).toBe(GL.GEQUAL);
  });

  it("mirror → MIRRORED_REPEAT on S/T/R", () => {
    const { host, calls } = mockHost();
    new WebGL2SamplerRegistry(host).getSamplerHandle(new Sampler({ mirror: true }), GL.TEXTURE_CUBE_MAP);
    const p = paramsOf(calls);
    expect(p.get(GL.TEXTURE_WRAP_S)).toBe(GL.MIRRORED_REPEAT);
    expect(p.get(GL.TEXTURE_WRAP_T)).toBe(GL.MIRRORED_REPEAT);
    expect(p.get(GL.TEXTURE_WRAP_R)).toBe(GL.MIRRORED_REPEAT);
  });

  it("addressW → TEXTURE_WRAP_R on cube samplers (was addressV)", () => {
    const { host, calls } = mockHost();
    new WebGL2SamplerRegistry(host).getSamplerHandle(
      new Sampler({ addressV: "repeat", addressW: "clamp-to-edge" }),
      GL.TEXTURE_CUBE_MAP
    );
    expect(paramsOf(calls).get(GL.TEXTURE_WRAP_R)).toBe(GL.CLAMP_TO_EDGE);
  });

  it("1-level texture downgrades *-mipmap-* to the non-mip filter", () => {
    const { host, calls } = mockHost();
    const texture = new Texture({
      width: 4,
      height: 4,
      format: "rgba16f",
      mipLevels: [{ width: 4, height: 4, data: new Uint16Array(4 * 4 * 4) }]
    });
    const reg = new WebGL2SamplerRegistry(host);
    reg.getSamplerHandle(new Sampler({ minFilter: "linear-mipmap-linear" }), GL.TEXTURE_2D, texture);
    expect(paramsOf(calls).get(GL.TEXTURE_MIN_FILTER)).toBe(GL.LINEAR);
    reg.getSamplerHandle(new Sampler({ minFilter: "nearest-mipmap-linear" }), GL.TEXTURE_2D, texture);
    // second handle (different key)
    const last = calls.filter((c) => c.parameter === GL.TEXTURE_MIN_FILTER).at(-1)!;
    expect(last.value).toBe(GL.NEAREST);
  });

  it("multi-level texture keeps mipmap filtering", () => {
    const { host, calls } = mockHost();
    const texture = new Texture({
      width: 4,
      height: 4,
      mipLevels: [
        { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) },
        { width: 2, height: 2, data: new Uint8Array(2 * 2 * 4) }
      ]
    });
    new WebGL2SamplerRegistry(host).getSamplerHandle(new Sampler({ minFilter: "linear-mipmap-linear" }), GL.TEXTURE_2D, texture);
    expect(paramsOf(calls).get(GL.TEXTURE_MIN_FILTER)).toBe(GL.LINEAR_MIPMAP_LINEAR);
  });

  it("rgba16f data texture (pinned 1 level) downgrades too", () => {
    const { host, calls } = mockHost();
    const texture = new Texture({ width: 2, height: 2, format: "rgba16f", data: new Uint16Array(2 * 2 * 4) });
    new WebGL2SamplerRegistry(host).getSamplerHandle(new Sampler({ minFilter: "linear-mipmap-linear" }), GL.TEXTURE_2D, texture);
    expect(paramsOf(calls).get(GL.TEXTURE_MIN_FILTER)).toBe(GL.LINEAR);
  });

  it("flag off: C-12 fields inert, legacy mapping byte-identical", () => {
    setRendererQrFlags(FLAGS_OFF);
    const { host, calls } = mockHost();
    const texture = new Texture({
      width: 4,
      height: 4,
      format: "rgba16f",
      mipLevels: [{ width: 4, height: 4, data: new Uint16Array(4 * 4 * 4) }]
    });
    const reg = new WebGL2SamplerRegistry(host);
    reg.getSamplerHandle(
      new Sampler({ compare: "less-equal", mirror: true, addressW: "repeat", minFilter: "linear-mipmap-linear" }),
      GL.TEXTURE_CUBE_MAP,
      texture
    );
    const p = paramsOf(calls);
    expect(p.has(GL.TEXTURE_COMPARE_MODE)).toBe(false);
    expect(p.get(GL.TEXTURE_WRAP_S)).toBe(GL.CLAMP_TO_EDGE); // mirror inert
    expect(p.get(GL.TEXTURE_WRAP_R)).toBe(GL.CLAMP_TO_EDGE); // falls back to addressV
    expect(p.get(GL.TEXTURE_MIN_FILTER)).toBe(GL.LINEAR_MIPMAP_LINEAR); // no downgrade
    // legacy key shape unchanged (6 fields)
    expect(reg.samplerKey(new Sampler({ compare: "less-equal" }), GL.TEXTURE_2D).split("|")).toHaveLength(6);
  });
});
