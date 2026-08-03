import { describe, expect, it } from "vitest";
import {
  combatFrameAdvantage,
  createCombatAi,
  solveCombatFrameData,
  validateCombatFrameData,
  type CombatFrameData
} from "../../../packages/engine/src/agent-api/CombatFrameData";

/**
 * Regression cases for the reported Aura Clash defects: unrealistic attacks, weak
 * spacing, limited momentum, and animations that do not correspond to hits.
 *
 * Converting Aura Clash's shipped move table to frames at 60fps shows the cause. Its
 * active windows run 12-32 frames and its recoveries 4-5. Real frame data is the
 * opposite shape: 2-5 active frames and 10-30 recovery frames. With a 32-frame active
 * window the hitbox is live for over half a second, so damage cannot correspond to the
 * moment of contact; with a 4-frame recovery a whiff costs nothing, so there is no
 * spacing game and no punish window.
 *
 * Nothing validated frame data as frame data, so any split passed.
 */

/** Aura Clash's shipped table, converted from seconds to frames at 60fps. */
const SHIPPED_MOVES: readonly CombatFrameData[] = [
  // light: duration 0.34, active 0.07-0.27
  { id: "light", startup: 4, active: 12, recovery: 4, hitstun: 10, blockstun: 6, range: 1.38, damage: 6, knockback: 0.52, hitstop: 0 },
  // heavy: duration 0.46, active 0.10-0.38
  { id: "heavy", startup: 6, active: 17, recovery: 5, hitstun: 16, blockstun: 8, range: 1.62, damage: 10, knockback: 0.64, hitstop: 0 },
  // special: duration 0.68, active 0.08-0.62
  { id: "special", startup: 5, active: 32, recovery: 4, hitstun: 28, blockstun: 12, range: 2.28, damage: 56, knockback: 1.28, hitstop: 0 }
];

describe("combatFrameAdvantage", () => {
  it("shows every shipped Aura Clash move as heavily plus on block", () => {
    // This is the arithmetic behind "weak spacing": nothing is punishable.
    for (const move of SHIPPED_MOVES) {
      expect(combatFrameAdvantage(move).onBlock).toBeGreaterThan(0);
    }
  });

  it("computes advantage as stun minus recovery", () => {
    const advantage = combatFrameAdvantage({
      id: "poke", startup: 5, active: 3, recovery: 12, hitstun: 15, blockstun: 9, range: 1, damage: 5, knockback: 0.2, hitstop: 3
    });
    expect(advantage.onHit).toBe(3);
    expect(advantage.onBlock).toBe(-3);
    expect(advantage.whiffPunishWindow).toBe(12);
    expect(advantage.totalFrames).toBe(20);
  });
});

describe("validateCombatFrameData", () => {
  it("rejects Aura Clash's shipped frame data", () => {
    const report = validateCombatFrameData(SHIPPED_MOVES);
    expect(report.passes).toBe(false);
    const failed = report.checks.filter((check) => !check.passes).map((check) => check.id);
    // Every one of the four structural problems is caught.
    expect(new Set(failed)).toContain("active-window-readable");
    expect(new Set(failed)).toContain("recovery-creates-risk");
    expect(new Set(failed)).toContain("not-safe-on-block");
    expect(new Set(failed)).toContain("hitstop-sells-impact");
  });

  it("names the special's half-second active window specifically", () => {
    const report = validateCombatFrameData(SHIPPED_MOVES);
    const special = report.checks.find((check) => check.moveId === "special" && check.id === "active-window-readable");
    expect(special?.passes).toBe(false);
    expect(special?.detail).toContain("32");
  });

  it("accepts frame data derived from move roles", () => {
    const moves = [
      solveCombatFrameData({ id: "light", role: "light", range: 1.38, damage: 6 }),
      solveCombatFrameData({ id: "heavy", role: "heavy", range: 1.62, damage: 10 }),
      solveCombatFrameData({ id: "special", role: "special", range: 2.28, damage: 56 })
    ];
    const report = validateCombatFrameData(moves);
    expect(report.passes, JSON.stringify(report.checks.filter((check) => !check.passes))).toBe(true);
  });

  it("rejects a move with no startup, which would hit before it telegraphs", () => {
    const report = validateCombatFrameData([
      { id: "instant", startup: 0, active: 3, recovery: 12, hitstun: 14, blockstun: 8, range: 1, damage: 5, knockback: 0.2, hitstop: 3 }
    ]);
    expect(report.checks.find((check) => check.id === "startup-before-active")?.passes).toBe(false);
  });

  it("requires a stronger move to cost speed or safety", () => {
    const report = validateCombatFrameData([
      { id: "jab", startup: 8, active: 3, recovery: 14, hitstun: 14, blockstun: 9, range: 1, damage: 5, knockback: 0.2, hitstop: 3 },
      // Same startup, safer on block, more damage: strictly better, so no reason to jab.
      { id: "super", startup: 3, active: 3, recovery: 6, hitstun: 20, blockstun: 14, range: 1, damage: 40, knockback: 0.6, hitstop: 5 }
    ]);
    expect(report.checks.find((check) => check.id === "damage-costs-speed")?.passes).toBe(false);
  });
});

describe("solveCombatFrameData", () => {
  it("gives every role a short active window and a long recovery", () => {
    for (const role of ["jab", "light", "medium", "heavy", "launcher", "special"] as const) {
      const move = solveCombatFrameData({ id: role, role, range: 1.4, damage: 10 });
      expect(move.active).toBeLessThanOrEqual(6);
      expect(move.recovery).toBeGreaterThanOrEqual(move.active * 2);
      expect(move.hitstop).toBeGreaterThan(0);
    }
  });

  it("makes a longer-reaching move slower to start", () => {
    const short = solveCombatFrameData({ id: "a", role: "medium", range: 1, damage: 10 });
    const long = solveCombatFrameData({ id: "b", role: "medium", range: 2.6, damage: 10 });
    expect(long.startup).toBeGreaterThan(short.startup);
  });

  it("makes a higher-damage move recover longer", () => {
    const light = solveCombatFrameData({ id: "a", role: "heavy", range: 1.4, damage: 10 });
    const nuke = solveCombatFrameData({ id: "b", role: "heavy", range: 1.4, damage: 60 });
    expect(nuke.recovery).toBeGreaterThan(light.recovery);
  });

  it("keeps a jab nearly neutral on block and a special clearly minus", () => {
    const jab = combatFrameAdvantage(solveCombatFrameData({ id: "jab", role: "jab", range: 1, damage: 4 }));
    const special = combatFrameAdvantage(solveCombatFrameData({ id: "special", role: "special", range: 2.2, damage: 50 }));
    expect(jab.onBlock).toBeGreaterThan(special.onBlock);
    expect(special.onBlock).toBeLessThan(-5);
  });
});

describe("createCombatAi", () => {
  const moves = [
    solveCombatFrameData({ id: "light", role: "light", range: 1.38, damage: 6 }),
    solveCombatFrameData({ id: "heavy", role: "heavy", range: 1.62, damage: 10 })
  ];

  it("does not react before its reaction delay has elapsed", () => {
    const ai = createCombatAi({ moves, reactionFrames: 14, seed: 7, aggression: "defensive" });
    // An attack appears; within the delay the AI cannot be blocking because of it.
    const early: string[] = [];
    for (let frame = 0; frame < 10; frame += 1) {
      early.push(ai.decide({ distance: 1.2, opponentMoveId: "heavy", opponentMoveFrame: frame }).reason);
    }
    expect(early.every((reason) => reason !== "block-incoming")).toBe(true);
  });

  it("blocks a telegraphed attack once it has had time to see it", () => {
    const ai = createCombatAi({ moves, reactionFrames: 4, seed: 7, aggression: "defensive" });
    const reasons: string[] = [];
    for (let frame = 0; frame < 12; frame += 1) {
      reasons.push(ai.decide({ distance: 1.2, opponentMoveId: "heavy", opponentMoveFrame: Math.min(frame, 10) }).reason);
    }
    expect(reasons).toContain("block-incoming");
  });

  it("punishes a move caught in its recovery", () => {
    const heavy = moves[1]!;
    const ai = createCombatAi({ moves, reactionFrames: 2, seed: 7, aggression: "balanced", cooldownFrames: 0 });
    // Hold the opponent deep in heavy's recovery, within the AI's fastest move's range.
    const recoveryFrame = heavy.startup + heavy.active + 2;
    const reasons: string[] = [];
    for (let frame = 0; frame < 8; frame += 1) {
      reasons.push(ai.decide({ distance: 1.0, opponentMoveId: "heavy", opponentMoveFrame: recoveryFrame }).reason);
    }
    expect(reasons).toContain("punish-recovery");
    expect(ai.telemetry().punishAttempts).toBeGreaterThan(0);
  });

  it("holds a preferred range rather than charging", () => {
    const ai = createCombatAi({ moves, seed: 7, aggression: "defensive" });
    // Far away: it must close.
    expect(ai.decide({ distance: 6 }).approach).toBe(1);
    ai.reset();
    // Crowded: it must create space.
    expect(ai.decide({ distance: 0.2 }).approach).toBe(-1);
  });

  it("does not act while stunned or recovering", () => {
    const ai = createCombatAi({ moves, seed: 7 });
    expect(ai.decide({ distance: 1.2, stunned: true }).moveId).toBeUndefined();
    expect(ai.decide({ distance: 1.2, ownRecoveryFrames: 5 }).moveId).toBeUndefined();
  });

  it("is deterministic for a given seed", () => {
    const run = () => {
      const ai = createCombatAi({ moves, seed: 4242, aggression: "aggressive" });
      const decisions = [];
      for (let frame = 0; frame < 120; frame += 1) {
        decisions.push(ai.decide({
          distance: 1.2 + Math.sin(frame / 9) * 0.6,
          opponentMoveId: frame % 30 < 12 ? "light" : undefined,
          opponentMoveFrame: frame % 30
        }));
      }
      return JSON.stringify(decisions);
    };
    expect(run()).toBe(run());
  });

  it("attacks more often when aggressive than when defensive", () => {
    const count = (aggression: "defensive" | "aggressive") => {
      const ai = createCombatAi({ moves, seed: 99, aggression, cooldownFrames: 2 });
      // Observe at the AI's own preferred range. At any other distance the AI correctly
      // spends its decisions on spacing rather than attacking, which would measure the
      // spacing behaviour instead of the aggression profile.
      const distance = ai.telemetry().preferredRange;
      let attacks = 0;
      for (let frame = 0; frame < 300; frame += 1) {
        if (ai.decide({ distance }).moveId !== undefined) attacks += 1;
      }
      return attacks;
    };
    expect(count("aggressive")).toBeGreaterThan(count("defensive"));
  });
});
