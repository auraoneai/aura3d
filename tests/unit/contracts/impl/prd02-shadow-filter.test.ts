/**
 * 02-T1945 — ShadowSystemConfig.filter / C-27 tier filter → A3D_SHADOW_FILTER
 * (the `a3d_prd02_shadow_lookup` kernel switch), via the `prd02.shadowFilter`
 * C-02 feature. Flag off: the feature is inactive and emits nothing.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { shaderChunk, shaderFeaturesFor } from "../../../../packages/rendering/src/contracts/program";
import { SHADOW_LOOKUP_CHUNK } from "../../../../packages/rendering/src/contracts/shadows";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import { identityMat4 } from "@aura3d/scene";
import { PRD02_SHADOW_FILTER_FEATURE, prd02ShadowFilterDefines } from "../../../../packages/rendering/src/shadows/Prd02ShadowFilter";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const item = (extra: Partial<RenderItem> = {}): RenderItem => ({ geometry: Geometry.triangle(), modelMatrix: identityMat4(), ...extra }) as RenderItem;

describe("02-T1945 shadow filter → A3D_SHADOW_FILTER", () => {
  it("maps every filter name to the lookup-chunk kernel", () => {
    const high = QUALITY_TIERS.high;
    expect(prd02ShadowFilterDefines("hard", high)).toEqual({ A3D_SHADOW_FILTER: 1 });
    expect(prd02ShadowFilterDefines("castano", high)).toEqual({ A3D_SHADOW_FILTER: 2 });
    expect(prd02ShadowFilterDefines("vogel", high)).toEqual({ A3D_SHADOW_FILTER: 3 });
    expect(prd02ShadowFilterDefines("pcss", high)).toEqual({ A3D_SHADOW_FILTER: 3, A3D_SHADOW_PCSS: 1 });
    expect(prd02ShadowFilterDefines("pcf", QUALITY_TIERS.low)).toEqual({ A3D_SHADOW_FILTER: 1 });
    expect(prd02ShadowFilterDefines("pcf", QUALITY_TIERS.medium)).toEqual({ A3D_SHADOW_FILTER: 2 });
    expect(prd02ShadowFilterDefines("pcf", QUALITY_TIERS.ultra)).toEqual({ A3D_SHADOW_FILTER: 3 });
  });

  it("the lookup chunk switches on exactly these values", () => {
    const glsl = shaderChunk(SHADOW_LOOKUP_CHUNK)?.glsl ?? "";
    expect(glsl).toContain("#if A3D_SHADOW_FILTER == 1");
    expect(glsl).toContain("#elif A3D_SHADOW_FILTER == 2");
  });

  it("prd02.shadowFilter is active only with A3D_QR_LIGHTING and emits the tier kernel for forward receivers", () => {
    expect(shaderFeaturesFor(FLAGS_ON).map((f) => f.id)).toContain("prd02.shadowFilter");
    expect(shaderFeaturesFor(resolveQrFlags({})).map((f) => f.id)).not.toContain("prd02.shadowFilter");
    const select = (tier: keyof typeof QUALITY_TIERS, extra: Partial<RenderItem> = {}, pass: "forward" | "depth" = "forward") =>
      PRD02_SHADOW_FILTER_FEATURE.select({ item: item(extra), pass, tier: QUALITY_TIERS[tier], flags: FLAGS_ON });
    expect(select("medium")).toBe(2);
    expect(PRD02_SHADOW_FILTER_FEATURE.defines(select("medium")!)).toEqual({ A3D_SHADOW_FILTER: 2 });
    expect(select("low")).toBe(1);
    expect(select("ultra")).toBe(3);
    expect(select("high", { receiveShadow: false })).toBeUndefined();
    expect(select("high", {}, "depth")).toBeUndefined();
  });
});
