import { describe, expect, it } from "vitest";
import { applyCumulusPostPlan, cumulusPostPlan, CUMULUS_FLARE_ELEMENTS } from "../../../examples/kid-goku-beyond-the-clouds-port/art/post";
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
    expect(applyCumulusPostPlan({ setEffectEnabled: (n, on) => calls.push([n, on]) }, { godRays: true, lensFlare: true })).toEqual({ volumetricFog: true });
    expect(calls).toEqual([["volumetricFog", true]]);
    expect(() => applyCumulusPostPlan({ setEffectEnabled: () => { throw new Error("x"); } }, { godRays: false, lensFlare: true })).not.toThrow();
    expect(applyCumulusPostPlan(undefined, { godRays: false, lensFlare: true })).toEqual({ volumetricFog: false });
  });
  it("the storm row authors the god-ray node and the sun flare; the original row neither", () => {
    const json = (rows: unknown[]) => rows.map((n) => (n as { toJSON?: () => Record<string, unknown> }).toJSON?.() ?? (n as Record<string, unknown>));
    const storm = json(lookNodes(CUMULUS_LOOK[0]));
    expect(storm.some((n) => n.effect === "volumetric-fog" && typeof n.godRayDensity === "number")).toBe(true);
    expect(storm.some((n) => n.kind === "lensflare" && n.name === SUN_FLARE_ID)).toBe(true);
    const original = json(lookNodes(CUMULUS_LOOK[1]));
    expect(original.some((n) => n.kind === "lensflare" || n.effect === "volumetric-fog")).toBe(false);
    expect(CUMULUS_FLARE_ELEMENTS[0].color).toBe("#ffe2b8");
  });
});
