// PRD-07 §7.1 wetness landmine (P1 fix): `prd07.wetness` must not select
// when no wetness response is active — an unconditional select would splice
// A3D_WETNESS into every forward program (idle chunk, zero visual effect).

import { describe, expect, it, afterEach } from "vitest";
import "../../../../packages/rendering/src/lanes/prd07";
import { shaderChunk, shaderFeaturesFor, type ShaderFeatureSelectInput } from "../../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setPrd07WetnessState } from "../../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

// A plain lit PBR forward item (the select is per item since #880: lit
// forward draws only, because the call chunk edits `material`).
const input = (): ShaderFeatureSelectInput => ({
  item: { geometry: {} as RenderItem["geometry"], material: { shaderKey: "pbr" } as unknown as RenderItem["material"] },
  pass: "forward",
  tier: QUALITY_TIERS.high,
  flags: resolveQrFlags({ options: ["vfx"] })
});

const feature = () => {
  const f = shaderFeaturesFor(input().flags).find((f) => f.id === "prd07.wetness");
  if (!f) throw new Error("prd07.wetness not active under vfx");
  return f;
};

describe("prd07.wetness ShaderFeature select (§7.1 landmine)", () => {
  afterEach(() => {
    setPrd07WetnessState({ wetness: 0, snowCover: 0, rainRipples: 0 });
  });

  it("plain PBR item does not select while wetness state is idle", () => {
    expect(feature().select(input())).toBeFalsy();
  });

  it("selects once weather drives a wetness response", () => {
    setPrd07WetnessState({ wetness: 0.7 });
    expect(feature().select(input())).toBe(true);
  });

  it("snow cover alone also selects", () => {
    setPrd07WetnessState({ snowCover: 0.4 });
    expect(feature().select(input())).toBe(true);
  });
});

// #880 / T0-05 — the C-02 generator splices declaration hooks at global
// scope and body hooks inside main(): every body-hook chunk must be a call
// chunk (no uniforms, functions or structs) and require its pars chunk.
describe("prd07 fog/wetness pars + call split (#880)", () => {
  const isCallChunk = (glsl: string) =>
    !/^\s*uniform\s/m.test(glsl) &&
    !/^\s*(?:void|float|int|uint|bool|[iu]?vec[234]|mat[234](?:x[234])?|[A-Z]\w*)\s+\w+\s*\([^;{]*\)\s*\{/m.test(glsl) &&
    !/^\s*struct\s+\w+\s*\{/m.test(glsl);
  const all = shaderFeaturesFor(resolveQrFlags({ options: ["vfx", "vfx.fog"] }));

  for (const id of ["prd07.fog", "prd07.wetness"]) {
    it(`${id}: pars at fragment:pars, statements-only call chunk at the body hook`, () => {
      const f = all.find((x) => x.id === id);
      expect(f, `${id} registered under vfx,vfx.fog`).toBeDefined();
      expect(f!.hooks[0]).toBe("fragment:pars");
      expect(f!.chunks).toHaveLength(2);
      const call = shaderChunk(f!.chunks[1]!);
      expect(call, f!.chunks[1]).toBeDefined();
      expect(isCallChunk(call!.glsl)).toBe(true);
      expect(call!.requires).toEqual([f!.chunks[0]]);
      expect(isCallChunk(shaderChunk(f!.chunks[0]!)!.glsl)).toBe(false);
    });
  }

  it("forward fog programs never define FOG_VOLUMETRIC (undefined a3dSampleFroxel)", () => {
    const f = all.find((x) => x.id === "prd07.fog")!;
    expect(f.defines("volumetric")).not.toHaveProperty("FOG_VOLUMETRIC");
    expect(f.defines("height")).not.toHaveProperty("FOG_VOLUMETRIC");
  });
});
