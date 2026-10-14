import { describe, expect, it } from "vitest";
import { createAuraClashLightingEvidence } from "../../../apps/aura-clash-showcase/src/rendering/GameLighting";
import { createAuraClashPostProcessEvidence } from "../../../apps/aura-clash-showcase/src/rendering/GamePostProcess";

describe("Aura Clash rendering readability evidence", () => {
  /*
   * Defect 59: this asserted `createAuraClashLightingEvidence()` with **no argument** returned
   * `readable: true` for preset `aura-clash-neon-night`. That preset is never rendered -- its only
   * consumer, `createAuraClashLightRig`, has no callers -- and `readable` was computed by comparing the
   * preset's own literals against fixed thresholds, so it could not be false. The evidence now requires
   * the rig actually handed to the renderer, and the no-argument form deliberately reports
   * `readable: false`.
   */
  it("proves the rendered rig has enough key and rim separation for fighters", () => {
    const evidence = createAuraClashLightingEvidence({
      preset: "urban-neon",
      lights: [
        { role: "key", intensity: 1.134, castsShadow: true },
        { role: "accent", intensity: 0.81, castsShadow: false },
        // Per-fighter rim lights the route submits alongside the shared rig.
        { role: "rim", intensity: 1.45, castsShadow: false },
        { role: "rim", intensity: 1.35, castsShadow: false }
      ]
    });

    expect(evidence.contractId).toBe("aura-clash-lighting-review-v1");
    expect(evidence.presetId).toBe("urban-neon");
    expect(evidence.evidenceSource).toBe("rendered-lighting-rig");
    expect(evidence.readable).toBe(true);
    expect(evidence.validatedStates).toEqual(["first", "action", "ko"]);
    expect(evidence.keyIntensity).toBeGreaterThanOrEqual(1);
    expect(evidence.minRimIntensity).toBeGreaterThanOrEqual(1.2);
    expect(evidence.shadowCastingLightCount).toBeGreaterThanOrEqual(1);
  });

  it("refuses to report readability for the declared-but-unrendered preset", () => {
    const evidence = createAuraClashLightingEvidence();
    expect(evidence.evidenceSource).toBe("declared-preset-only");
    expect(evidence.readable).toBe(false);
  });

  it("keeps bloom and fog bounded by gameplay visibility and performance budget evidence", () => {
    const evidence = createAuraClashPostProcessEvidence({ performanceBudgetOk: true });

    expect(evidence.contractId).toBe("aura-clash-material-postprocess-review-v1");
    expect(evidence.presetId).toBe("aura-clash-cinematic-readable");
    expect(evidence.gameplayVisible).toBe(true);
    expect(evidence.bloomWithinGameplayLimit).toBe(true);
    expect(evidence.fogBehindCombatLane).toBe(true);
    expect(evidence.bloomIntensity).toBeLessThanOrEqual(0.65);
    expect(evidence.reducedFlashBloomIntensity).toBeLessThanOrEqual(0.25);
  });

  it("does not claim postprocess gameplay visibility when performance budget is failing", () => {
    const evidence = createAuraClashPostProcessEvidence({ performanceBudgetOk: false });

    expect(evidence.performanceBudgetOk).toBe(false);
    expect(evidence.gameplayVisible).toBe(false);
  });
});
