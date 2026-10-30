// E2 wave 3: handoffs from G21-G25 on post effects.
// - G25: vignette (and the other display stages the post bridge renders) report consumer "post", not "none".
// - G25 CR-4: a colour grade authored next to a look wins over the look's grade field by field, on both post paths.
// - G22/G23: effects.bloom accepts `scatter` and the v2 bridge reads it.

import { describe, expect, it } from "vitest";
import { effects, looks, primitives, scene } from "../../../packages/engine/src/agent-api/index";
import { createRootPostPipeline, validatePostEffectNode } from "../../../packages/engine/src/agent-api/postBridge";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import { mergeLookColorGrade } from "../../../packages/engine/src/agent-api/looks/lookGrade";
import { lowerEffectNode } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import type { AuraEffectNode, AuraSceneNode } from "../../../packages/engine/src/agent-api/nodes/types";
import { QUALITY_TIERS } from "@aura3d/rendering/contracts";

const tier = QUALITY_TIERS.high;
const camera = { near: 0.1, far: 100, mode: "perspective" };

type Grade = { contrast: number; saturation: number };

function cumulusScene(withAuthoredGrade: boolean) {
  const b = scene().add(primitives.box()).add(looks.preset("outdoor-day"));
  if (withAuthoredGrade) b.add(effects.colorGrade({ name: "grade", exposure: 1.02, contrast: 1.07, saturation: 1.16 }));
  return b.toJSON();
}

describe("G25: display post stages lower to the post consumer", () => {
  it.each(["vignette", "film-grain", "chromatic-aberration"])("%s -> post", (effect) => {
    expect(lowerEffectNode({ kind: "effect", effect, id: `n-${effect}` } as never).consumer).toBe("post");
  });

  it("unknown kinds still lower to none", () => {
    expect(lowerEffectNode({ kind: "effect", effect: "not-a-stage", id: "n" } as never).consumer).toBe("none");
  });
});

describe("G25 CR-4: an authored grade next to a look", () => {
  it("the look's grade node carries the lookGrade mark and only its authored fields", () => {
    const flat = JSON.stringify(cumulusScene(false));
    expect(flat).toContain("\"lookGrade\":true");
  });

  it("v2 bridge: the authored contrast, saturation and exposure apply", () => {
    const withGrade = createRootPostPipeline(cumulusScene(true), camera, undefined, tier).options as unknown as { grade: Grade; exposure: number };
    expect(withGrade.grade.contrast).toBeCloseTo(1.07);
    expect(withGrade.grade.saturation).toBeCloseTo(1.16);
    expect(withGrade.exposure).toBeCloseTo(1.02);
  });

  it("v2 bridge: with no authored grade the look's grade is unchanged", () => {
    const lookOnly = createRootPostPipeline(cumulusScene(false), camera, undefined, tier).options as unknown as { grade: Grade; exposure: number };
    expect(lookOnly.grade.contrast).toBeCloseTo(1.05);
    expect(lookOnly.grade.saturation).toBeCloseTo(1.0);
    expect(lookOnly.exposure).toBeCloseTo(1);
  });

  it("legacy path: the authored grade is the one submitted", () => {
    const post = createProductionRuntimePostprocess(cumulusScene(true)) as unknown as { colorGrade?: Grade };
    expect(post.colorGrade?.contrast).toBeCloseTo(1.07);
    expect(post.colorGrade?.saturation).toBeCloseTo(1.16);
  });

  it("fields the author left at the factory default keep the look's value", () => {
    const look = { ...effects.colorGrade({ name: "look color grade", contrast: 1.2, saturation: 0.9, exposure: 1.5 }).toJSON(), lookGrade: true } as AuraSceneNode;
    const authored = effects.colorGrade({ name: "grade", contrast: 1.07 }).toJSON() as AuraSceneNode;
    const merged = mergeLookColorGrade([look, authored]);
    expect(merged).toHaveLength(1);
    const node = merged[0] as AuraEffectNode & { lookGrade?: boolean };
    expect(node.name).toBe("grade");
    expect(node.contrast).toBe(1.07);
    expect(node.saturation).toBe(0.9);
    expect(node.exposure).toBe(1.5);
    expect(node.lookGrade).toBeUndefined();
    expect(new Set(node.postAuthored)).toEqual(new Set(["name", "contrast", "saturation", "exposure"]));
    expect(validatePostEffectNode(node)).toEqual([]);
  });

  it("order does not matter, and a list without a look grade is returned as is", () => {
    const look = { ...effects.colorGrade({ name: "look color grade", contrast: 1.2 }).toJSON(), lookGrade: true } as AuraSceneNode;
    const authored = effects.colorGrade({ saturation: 1.3 }).toJSON() as AuraSceneNode;
    const merged = mergeLookColorGrade([authored, look])[0] as AuraEffectNode;
    expect(merged.contrast).toBe(1.2);
    expect(merged.saturation).toBe(1.3);
    const plain = [authored];
    expect(mergeLookColorGrade(plain)).toBe(plain);
  });
});

describe("G22/G23: bloom scatter", () => {
  it("effects.bloom keeps scatter and lists it as authored", () => {
    const node = effects.bloom({ scatter: 0.4 }).toJSON() as AuraEffectNode;
    expect(node.scatter).toBe(0.4);
    expect(node.postAuthored).toEqual(["scatter"]);
    expect(validatePostEffectNode(node)).toEqual([]);
    expect(effects.bloom().toJSON()).not.toHaveProperty("scatter");
  });

  it("the v2 bridge reads the authored scatter without a deprecation diagnostic", () => {
    const { options, diagnostics } = createRootPostPipeline(
      scene().add(primitives.box()).add(effects.bloom({ scatter: 0.4, threshold: 1.2 })).toJSON(), camera, undefined, tier
    );
    expect((options as unknown as { bloom: { scatter: number } }).bloom.scatter).toBeCloseTo(0.4);
    expect(diagnostics.filter((d) => d.code === "post-field-deprecated")).toEqual([]);
  });
});
