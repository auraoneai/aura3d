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

  it("heavy/special hits use the stronger hurtHeavy clip", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "heavy", false)).toBe("Hit_Head");
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "heavy", false)).toBe("Hit_Knockback_RM");
  });

  it("light and heavy reactions are distinct clips for both fighters", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "light", false)).not.toBe(resolveAuraClashHurtClip(auraClashPlayerClips, "heavy", false));
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "light", false)).not.toBe(resolveAuraClashHurtClip(auraClashRivalClips, "heavy", false));
  });

  it("death overrides the reaction with the KO clip", () => {
    expect(resolveAuraClashHurtClip(auraClashPlayerClips, "heavy", true)).toBe("Death01");
    expect(resolveAuraClashHurtClip(auraClashRivalClips, "light", true)).toBe("LayToIdle");
  });

  it("both hurtHeavy clips are real clips embedded in the rigs (chest/head, knockback variants)", () => {
    expect(auraClashPlayerClips.hurtHeavy).toBe("Hit_Head");
    expect(auraClashRivalClips.hurtHeavy).toBe("Hit_Knockback_RM");
  });
});
