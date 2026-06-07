import { describe, expect, it } from "vitest";
import { createAuraClashLightingEvidence } from "../../../apps/aura-clash-showcase/src/rendering/GameLighting";
import { createAuraClashPostProcessEvidence } from "../../../apps/aura-clash-showcase/src/rendering/GamePostProcess";

describe("Aura Clash rendering readability evidence", () => {
  it("proves the lighting preset has enough key and rim separation for fighters", () => {
    const evidence = createAuraClashLightingEvidence();

    expect(evidence.contractId).toBe("aura-clash-lighting-review-v1");
    expect(evidence.presetId).toBe("aura-clash-neon-night");
    expect(evidence.readable).toBe(true);
    expect(evidence.validatedStates).toEqual(["first", "action", "ko"]);
    expect(evidence.keyIntensity).toBeGreaterThanOrEqual(1);
    expect(evidence.minRimIntensity).toBeGreaterThanOrEqual(1.2);
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
