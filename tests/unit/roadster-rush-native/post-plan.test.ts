import { describe, expect, it } from "vitest";
import { apexFlash, apexFlashAlpha, apexPostPlan, applyApexPostPlan } from "../../../apps/showcase-roadster-rush/src/art/post";

describe("Apex Overdrive post plan (GU47 AO-P3, AO-P4, AO-PF1)", () => {
  it("runs motion blur and god rays on High and Ultra desktop only", () => {
    for (const tier of ["high", "ultra"]) {
      const plan = apexPostPlan({ tier, reducedMotion: false, coarsePointer: false });
      expect(plan.motionBlur).toBe(true);
      expect(plan.godRays).toBe(true);
    }
    for (const tier of ["low", "medium", undefined]) {
      const plan = apexPostPlan({ tier, reducedMotion: false, coarsePointer: false });
      expect(plan.motionBlur).toBe(false);
      expect(plan.godRays).toBe(false);
    }
  });

  it("never runs S4 or S7 on a phone, even when the tier says High", () => {
    const plan = apexPostPlan({ tier: "high", reducedMotion: false, coarsePointer: true });
    expect(plan.motionBlur).toBe(false);
    expect(plan.godRays).toBe(false);
  });

  it("reduced motion: no motion blur, no lens flare, no chromatic aberration; DOF always off", () => {
    const plan = apexPostPlan({ tier: "ultra", reducedMotion: true, coarsePointer: false });
    expect(plan.motionBlur).toBe(false);
    expect(plan.lensFlare).toBe(false);
    expect(plan.chromaticAberration).toBe(false);
    expect(plan.depthOfField).toBe(false);
    expect(apexPostPlan({ tier: "high", reducedMotion: false, coarsePointer: false }).depthOfField).toBe(false);
  });

  it("applies the plan through setEffectEnabled and survives a surface that throws", () => {
    const calls: [string, boolean][] = [];
    const states = applyApexPostPlan({ setEffectEnabled: (name, on) => calls.push([name, on]) }, apexPostPlan({ tier: "high", reducedMotion: false, coarsePointer: false }));
    expect(calls).toEqual([["motionBlur", true], ["volumetricFog", true], ["depthOfField", false], ["chromaticAberration", true]]);
    expect(states.depthOfField).toBe(false);
    expect(() => applyApexPostPlan({ setEffectEnabled: () => { throw new Error("POST_FIELD_UNSUPPORTED"); } }, apexPostPlan({ tier: "low", reducedMotion: true, coarsePointer: true }))).not.toThrow();
    expect(applyApexPostPlan(undefined, apexPostPlan({ tier: "low", reducedMotion: false, coarsePointer: false })).motionBlur).toBe(false);
  });

  it("caps output-overlay flashes at 0.3 for at most 200 ms and skips them under reduced flash", () => {
    for (const kind of ["crash", "rocket"] as const) {
      const f = apexFlash(kind);
      expect(f.peak).toBeLessThanOrEqual(0.3);
      expect(f.ms).toBeLessThanOrEqual(200);
      expect(apexFlashAlpha(kind, 0, false)).toBeCloseTo(f.peak, 6);
      expect(apexFlashAlpha(kind, f.ms, false)).toBe(0);
      expect(apexFlashAlpha(kind, 0, true)).toBe(0);
      expect(apexFlashAlpha(kind, Number.NaN, false)).toBe(0);
    }
    // warm crash, cyan rocket
    const crash = apexFlash("crash").rgb;
    const rocket = apexFlash("rocket").rgb;
    expect(crash[0]).toBeGreaterThan(crash[2]);
    expect(rocket[2]).toBeGreaterThan(rocket[0]);
  });
});
