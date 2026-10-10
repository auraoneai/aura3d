// PRD-07 §7.1 wetness landmine (P1 fix): `prd07.wetness` must not select
// when no wetness response is active — an unconditional select would splice
// A3D_WETNESS into every forward program (idle chunk, zero visual effect).

import { describe, expect, it, afterEach } from "vitest";
import "../../../../packages/rendering/src/lanes/prd07";
import { shaderFeaturesFor, type ShaderFeatureSelectInput } from "../../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setPrd07WetnessState } from "../../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

const input = (): ShaderFeatureSelectInput => ({
  item: { geometry: {} as RenderItem["geometry"] },
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
