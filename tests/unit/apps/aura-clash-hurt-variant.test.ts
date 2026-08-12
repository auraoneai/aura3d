import { describe, expect, it } from "vitest";
import {
  auraClashPlayerClips,
  auraClashRivalClips,
  resolveAuraClashHurtClip,
  selectAuraClashHurtVariant
} from "../../../apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps";

describe("selectAuraClashHurtVariant (light/heavy + grounded/airborne)", () => {
  it("grounded light hits are light reactions", () => {
    expect(selectAuraClashHurtVariant(6, true)).toBe("light");
  });
  it("grounded heavy/special hits are heavy reactions", () => {
    expect(selectAuraClashHurtVariant(10, true)).toBe("heavy");
    expect(selectAuraClashHurtVariant(56, true)).toBe("heavy");
  });
  it("airborne hits are heavy reactions regardless of damage", () => {
    expect(selectAuraClashHurtVariant(6, false)).toBe("heavy");
    expect(selectAuraClashHurtVariant(10, false)).toBe("heavy");
  });
});

describe("resolveAuraClashHurtClip (varied hit reactions)", () => {
  it("light hits use the base hurt clip", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "light", false)).toBe("Hit_Chest");
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "light", false)).toBe("Hit_Knockback");
  });

  it("heavy/special hits use the strongest reaction actually embedded in each rig", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "heavy", false)).toBe("Hit_Head");
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "heavy", false)).toBe("Hit_Knockback");
  });

  it("uses distinct reactions when the source rig provides them and a truthful fallback otherwise", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "light", false)).not.toBe(resolveAuraClashHurtClip(auraClashPlayerClips, "heavy", false));
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "light", false)).toBe(resolveAuraClashHurtClip(auraClashRivalClips, "heavy", false));
  });

  it("death overrides the reaction with the KO clip", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "heavy", true)).toBe("Death01");
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "light", true)).toBe("LayToIdle");
  });

  it("never names a reaction clip that is absent from the generated rig metadata", () => {
    expect(auraClashPlayerClips.hurtHeavy).toBe("Hit_Head");
    expect(auraClashRivalClips.hurtHeavy).toBe("Hit_Knockback");
  });
});
