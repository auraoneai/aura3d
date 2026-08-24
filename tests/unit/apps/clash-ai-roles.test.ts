import { describe, expect, it } from "vitest";
import {
  CLASH_AI_ROLE_SEEDS,
  DEFAULT_CLASH_AI_ROLE,
  clashAiRolePresets,
  decideClashAiRole,
  nearestClashAiRole,
  type ClashAiRoleObservation
} from "../../../apps/aura-clash-showcase/src/playable/combat/clashAiRoles";

type PresetId = keyof typeof clashAiRolePresets;
const IDS: PresetId[] = ["rushdown", "balanced", "keep-away"];

function neutralObservation(distance: number): ClashAiRoleObservation {
  return {
    distance,
    playerAttacking: false,
    playerMoveId: null,
    playerAttackElapsed: 0,
    stunned: false
  };
}

/** Run a scripted observation loop against a preset, resetting its seeded stream first. */
function runScript(presetId: PresetId, observations: readonly ClashAiRoleObservation[]): string[] {
  const preset = clashAiRolePresets[presetId];
  preset.ai.reset();
  const reasons: string[] = [];
  for (const observation of observations) {
    reasons.push(decideClashAiRole(preset, observation).reason);
  }
  return reasons;
}

const NEUTRAL_SCRIPT: Readonly<ClashAiRoleObservation[]> = Array.from({ length: 240 }, (_, index) =>
  neutralObservation(1.9 + Math.sin(index * 0.7) * 0.35)
);

/** Count how often the engine AI committed to a strike during a script. */
function strikeCount(reasons: readonly string[]): number {
  return reasons.filter((reason) => reason === "attack-in-range" || reason === "poke-at-range" || reason === "punish-recovery").length;
}

describe("AC-A7 createCombatAi rival role presets", () => {
  it("exposes the three PRD-named presets with exact aggression weights", () => {
    expect(clashAiRolePresets.rushdown.aggressionWeight).toBe(0.8);
    expect(clashAiRolePresets.balanced.aggressionWeight).toBe(0.55);
    expect(clashAiRolePresets["keep-away"].aggressionWeight).toBe(0.35);
    expect(clashAiRolePresets.rushdown.aggression).toBe("aggressive");
    expect(clashAiRolePresets.balanced.aggression).toBe("balanced");
    expect(clashAiRolePresets["keep-away"].aggression).toBe("defensive");
    // Engine provenance is real, not just labels.
    for (const id of IDS) {
      expect(clashAiRolePresets[id].ai.kind).toBe("aura-combat-ai");
      const telemetry = clashAiRolePresets[id].ai.telemetry();
      expect(telemetry.aggression).toBe(clashAiRolePresets[id].aggression);
      expect(CLASH_AI_ROLE_SEEDS[id]).toBeGreaterThan(0);
    }
    expect(DEFAULT_CLASH_AI_ROLE).toBe("balanced");
  });

  it("is seeded and deterministic: identical scripts reproduce identical decision sequences", () => {
    for (const id of IDS) {
      const first = runScript(id, NEUTRAL_SCRIPT);
      const second = runScript(id, NEUTRAL_SCRIPT);
      expect(first.length).toBe(NEUTRAL_SCRIPT.length);
      expect(first).toEqual(second);
    }
  });

  it("makes role differences measurable: rushdown attacks strictly more than keep-away", () => {
    const rushdown = strikeCount(runScript("rushdown", NEUTRAL_SCRIPT));
    const balanced = strikeCount(runScript("balanced", NEUTRAL_SCRIPT));
    const keepAway = strikeCount(runScript("keep-away", NEUTRAL_SCRIPT));
    expect(rushdown).toBeGreaterThan(0);
    expect(rushdown).toBeGreaterThan(balanced);
    expect(balanced).toBeGreaterThanOrEqual(keepAway);
  });

  it("punishes a whiffed heavy far more eagerly at rushdown than keep-away", () => {
    // The player's heavy sits in recovery (startup+active ≈ 16 frames) at close range.
    const punishWindow: ClashAiRoleObservation[] = Array.from({ length: 60 }, () => ({
      distance: 1.2,
      playerAttacking: true,
      playerMoveId: "heavy",
      playerAttackElapsed: 0.42,
      stunned: false
    }));
    const rushdownStrikes = strikeCount(runScript("rushdown", punishWindow));
    const keepAwayStrikes = strikeCount(runScript("keep-away", punishWindow));
    expect(rushdownStrikes).toBeGreaterThan(keepAwayStrikes);
  });

  it("holds a block-biased response once an incoming attack has been visible long enough", () => {
    /*
     * The engine AI only blocks what it has had time to *see*: reaction frames must elapse while
     * the same move id stays visible AND the move must still be threatening (before startup+active).
     * The route's special has the longest threat window, so a repeating special at close range is
     * the scripted case where the aggressive preset's block branch can legitimately fire.
     */
    const preset = clashAiRolePresets.rushdown;
    preset.ai.reset();
    let blocks = 0;
    for (let index = 0; index < 200; index += 1) {
      const decision = decideClashAiRole(preset, {
        distance: 1.0,
        playerAttacking: true,
        playerMoveId: "special",
        // Repeating specials: each cycle re-enters the threat window (startup+active ≈ 23f).
        playerAttackElapsed: (index % 40) / 60,
        stunned: false
      });
      if (decision.reason === "block-incoming") blocks += 1;
    }
    expect(blocks, "the preset must block a visible incoming special at least once across cycles").toBeGreaterThan(0);
    expect(preset.ai.telemetry().blockAttempts).toBe(blocks);
  });

  it("resolves the nearest preset by aggression weight", () => {
    expect(nearestClashAiRole(0.95).id).toBe("rushdown");
    expect(nearestClashAiRole(0.55).id).toBe("balanced");
    expect(nearestClashAiRole(0.05).id).toBe("keep-away");
    expect(nearestClashAiRole(Number.NaN).id).toBe(DEFAULT_CLASH_AI_ROLE);
  });
});
