import { describe, expect, it } from "vitest";
import {
  auraClashLightingPreset,
  createAuraClashLightingEvidence
} from "../../../apps/aura-clash-showcase/src/rendering/GameLighting";

/**
 * `lighting.readable` is asserted by `apps/aura-clash-showcase/tests/visual-regression.spec.ts`, so it
 * has to be a claim that can fail.
 *
 * Before this suite it could not. `createAuraClashLightingEvidence` read `auraClashLightingPreset` and
 * compared those literals against fixed thresholds, which made `readable` structurally always `true`.
 * The preset it described was not even the rendered one: the playable route lights itself with
 * `createLightingRig({ preset: "urban-neon" })`, and `createAuraClashLightRig` -- the only consumer of
 * `auraClashLightingPreset` -- has no callers. The evidence therefore reported intensities for a rig
 * the renderer never received.
 *
 * These are negative controls: each one degrades the *rendered* rig and requires the claim to drop.
 */
describe("Aura Clash lighting evidence is derived from the rendered rig", () => {
  const routeRig = {
    preset: "urban-neon",
    lights: [
      { role: "key", intensity: 1.134, castsShadow: true },
      { role: "accent", intensity: 0.81, castsShadow: false },
      { role: "rim", intensity: 0.432, castsShadow: false }
    ]
  } as const;

  it("accepts the rig the route actually submits", () => {
    const evidence = createAuraClashLightingEvidence(routeRig);
    expect(evidence.readable).toBe(true);
    expect(evidence.evidenceSource).toBe("rendered-lighting-rig");
    expect(evidence.presetId).toBe("urban-neon");
    expect(evidence.renderedLightCount).toBe(3);
    expect(evidence.shadowCastingLightCount).toBe(1);
  });

  it("refuses to claim readability without a rendered rig", () => {
    const evidence = createAuraClashLightingEvidence();
    expect(evidence.readable).toBe(false);
    expect(evidence.evidenceSource).toBe("declared-preset-only");
    expect(evidence.shadowCastingLightCount).toBe(0);
    expect(evidence.renderedLightCount).toBe(0);
  });

  it("refuses readability when the rig loses its shadow caster", () => {
    const evidence = createAuraClashLightingEvidence({
      preset: "urban-neon",
      lights: routeRig.lights.map((light) => ({ ...light, castsShadow: false }))
    });
    expect(evidence.shadowCastingLightCount).toBe(0);
    expect(evidence.readable).toBe(false);
  });

  it("refuses readability when the key light falls below the readability floor", () => {
    const evidence = createAuraClashLightingEvidence({
      preset: "urban-neon",
      lights: routeRig.lights.map((light) => (light.role === "key" ? { ...light, intensity: 0.4 } : light))
    });
    expect(evidence.keyIntensity).toBeLessThan(1);
    expect(evidence.readable).toBe(false);
  });

  it("refuses readability when edge separation is removed", () => {
    const evidence = createAuraClashLightingEvidence({
      preset: "urban-neon",
      lights: routeRig.lights.filter((light) => light.role !== "rim")
    });
    expect(evidence.minRimIntensity).toBe(0);
    expect(evidence.readable).toBe(false);
  });

  it("keeps the declared preset available as documented intent, not as rendered proof", () => {
    // The constant is retained for review context; it must not be mistaken for the rendered rig.
    expect(auraClashLightingPreset.id).toBe("aura-clash-neon-night");
    expect(createAuraClashLightingEvidence(routeRig).presetId).not.toBe(auraClashLightingPreset.id);
  });
});
