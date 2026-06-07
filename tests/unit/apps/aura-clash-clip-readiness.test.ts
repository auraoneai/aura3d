import { describe, expect, it } from "vitest";
import {
  AURA_CLASH_REQUIRED_CLIP_KEYS,
  assertAuraClashClipReadiness,
  auraClashPlayerClips,
  auraClashRivalClips,
  validateAuraClashClipMapReadiness,
  validateAuraClashClipReadiness,
  type AuraClashFighterClipMap
} from "../../../apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps";

describe("Aura Clash clip readiness", () => {
  it("accepts complete player and rival maps only when embedded GLB clips are present", () => {
    const readiness = validateAuraClashClipReadiness({
      playerAvailableClips: Object.values(auraClashPlayerClips),
      rivalAvailableClips: Object.values(auraClashRivalClips)
    });

    expect(readiness.ok).toBe(true);
    expect(readiness.diagnostics).toEqual([]);
    expect(readiness.fighters).toHaveLength(2);
    expect(auraClashPlayerClips.down).toBe("Crouch_Idle_Loop");
    expect(auraClashPlayerClips.guard).not.toBe(auraClashPlayerClips.down);
    for (const fighter of readiness.fighters) {
      expect(fighter.requiredKeys).toEqual(AURA_CLASH_REQUIRED_CLIP_KEYS);
      expect(fighter.missingKeys).toEqual([]);
      expect(fighter.missingClips).toEqual([]);
      expect(fighter.mappedClips).toHaveLength(AURA_CLASH_REQUIRED_CLIP_KEYS.length);
    }
  });

  it("fails readiness when a required action key is absent", () => {
    const incompleteMap = { ...auraClashPlayerClips };
    delete (incompleteMap as Partial<AuraClashFighterClipMap>).guard;

    const readiness = validateAuraClashClipMapReadiness({
      fighterId: "player",
      clipMap: incompleteMap,
      availableClips: Object.values(auraClashPlayerClips)
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.missingKeys).toEqual(["guard"]);
    expect(readiness.diagnostics).toContain('player missing required clip key "guard".');
  });

  it("throws before route readiness when a mapped embedded clip is unavailable", () => {
    expect(() =>
      assertAuraClashClipReadiness({
        playerAvailableClips: Object.values(auraClashPlayerClips).filter((clip) => clip !== auraClashPlayerClips.special),
        rivalAvailableClips: Object.values(auraClashRivalClips)
      })
    ).toThrow(/player maps "special" to missing embedded clip "Sword_Attack"/);
  });
});
