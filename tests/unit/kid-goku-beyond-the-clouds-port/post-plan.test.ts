import { describe, expect, it } from "vitest";
import { applyCumulusPostPlan, cumulusFocusDistance, cumulusPostPlan, CUMULUS_FLARE_ELEMENTS, needsRefocus } from "../../../examples/kid-goku-beyond-the-clouds-port/art/post";
import { CUMULUS_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { lookNodes, SUN_FLARE_ID } from "../../../examples/kid-goku-beyond-the-clouds-port/world";

describe("CD-09 post plan", () => {
  it("god rays on High and Ultra only, never on a coarse-pointer phone; flare on every tier", () => {
    for (const tier of ["low", "medium", undefined]) expect(cumulusPostPlan({ tier, coarsePointer: false }).godRays).toBe(false);
    for (const tier of ["high", "ultra"]) expect(cumulusPostPlan({ tier, coarsePointer: false }).godRays).toBe(true);
    expect(cumulusPostPlan({ tier: "ultra", coarsePointer: true }).godRays).toBe(false);
    expect(cumulusPostPlan({ tier: "low", coarsePointer: true }).lensFlare).toBe(true);
  });
  it("applies through setEffectEnabled and survives a surface that throws", () => {
    const calls: [string, boolean][] = [];
    const plan = { godRays: true, lensFlare: true, dof: false, motionBlur: false };
    const states = applyCumulusPostPlan({ setEffectEnabled: (n, on) => calls.push([n, on]) }, plan);
    expect(states).toEqual({ volumetricFog: true, depthOfField: false, motionBlur: false });
    expect(calls).toEqual([["volumetricFog", true], ["depthOfField", false], ["motionBlur", false]]);
    // only changed states are written on later frames
    calls.length = 0;
    applyCumulusPostPlan({ setEffectEnabled: (n, on) => calls.push([n, on]) }, { ...plan, dof: true }, states);
    expect(calls).toEqual([["depthOfField", true]]);
    expect(() => applyCumulusPostPlan({ setEffectEnabled: () => { throw new Error("x"); } }, { ...plan, godRays: false })).not.toThrow();
    expect(applyCumulusPostPlan(undefined, { ...plan, godRays: false }).volumetricFog).toBe(false);
  });
  it("CD-11: DOF in the title and finale only, glider motion blur only while riding; High/Ultra, no phone, no blur on reduced motion", () => {
    const ctx = { tier: "high", coarsePointer: false } as const;
    expect(cumulusPostPlan({ ...ctx, moment: "play" }).dof).toBe(false);
    expect(cumulusPostPlan({ ...ctx, moment: "title" }).dof).toBe(true);
    expect(cumulusPostPlan({ ...ctx, moment: "finale" }).dof).toBe(true);
    expect(cumulusPostPlan({ tier: "medium", coarsePointer: false, moment: "finale" }).dof).toBe(false);
    expect(cumulusPostPlan({ tier: "ultra", coarsePointer: true, moment: "finale" }).dof).toBe(false);
    expect(cumulusPostPlan({ ...ctx, moment: "play", riding: true }).motionBlur).toBe(true);
    expect(cumulusPostPlan({ ...ctx, moment: "play", riding: false }).motionBlur).toBe(false);
    expect(cumulusPostPlan({ ...ctx, moment: "play", riding: true, reducedMotion: true }).motionBlur).toBe(false);
    expect(cumulusPostPlan({ tier: "low", coarsePointer: false, moment: "play", riding: true }).motionBlur).toBe(false);
    expect(cumulusFocusDistance([0, 0, 0], [3, 4, 0])).toBe(5);
    expect(cumulusFocusDistance([0, 0, 0], [0, 0, 500])).toBe(80);
    expect(needsRefocus(null, 10)).toBe(true);
    expect(needsRefocus(10, 10.5)).toBe(false);
    expect(needsRefocus(10, 11)).toBe(true);
  });
  it("the storm row authors the god-ray node and the sun flare; the original row neither", () => {
    const json = (rows: unknown[]) => rows.map((n) => (n as { toJSON?: () => Record<string, unknown> }).toJSON?.() ?? (n as Record<string, unknown>));
    const storm = json(lookNodes(CUMULUS_LOOK[0]));
    expect(storm.some((n) => n.effect === "volumetric-fog" && typeof n.godRayDensity === "number")).toBe(true);
    expect(storm.some((n) => n.kind === "lensflare" && n.name === SUN_FLARE_ID)).toBe(true);
    const original = json(lookNodes(CUMULUS_LOOK[1]));
    expect(storm.some((n) => n.effect === "depth-of-field" && n.focusDistance === 14)).toBe(true);
    expect(storm.some((n) => n.effect === "motion-blur" && n.shutter === 0.35)).toBe(true);
    expect(original.some((n) => n.kind === "lensflare" || n.effect === "volumetric-fog" || n.effect === "depth-of-field" || n.effect === "motion-blur")).toBe(false);
    expect(CUMULUS_FLARE_ELEMENTS[0].color).toBe("#ffe2b8");
  });
});
