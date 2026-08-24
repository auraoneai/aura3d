import { describe, expect, it } from "vitest";
import { BALLS_PER_GAME, ScoreKeeper, multiplierForBanks, SCORE_TABLE } from "../../../apps/showcase-vault-breakers/src/scoring";
import { MissionTracker, ORBIT_TARGET } from "../../../apps/showcase-vault-breakers/src/missions";
import { MISSION_LINES, SCORE_DIGITS, scoreboardVisibility } from "../../../apps/showcase-vault-breakers/src/scoreboard";
import { BANK_IDS, TARGETS_PER_BANK } from "../../../apps/showcase-vault-breakers/src/table";

/**
 * PRD definition-of-done pins for Vault Breakers scoring/missions (VB-13):
 * multiplier ladder, points math, ball accounting, bank progression to vault,
 * and the score-reel visibility mapping used by the in-world text3D scoreboard.
 */

describe("vault breakers scoring", () => {
  it("scores events at base value times the current multiplier", () => {
    const score = new ScoreKeeper();
    expect(score.add("bumper")).toBe(SCORE_TABLE.bumper * 1);
    expect(score.add("sling")).toBe(SCORE_TABLE.sling * 1);
  });

  it("applies the multiplier ladder: x1, x2 after 2 banks, x4 after 4, x6 at vault", () => {
    expect(multiplierForBanks(0, false)).toBe(1);
    expect(multiplierForBanks(1, false)).toBe(1);
    expect(multiplierForBanks(2, false)).toBe(2);
    expect(multiplierForBanks(3, false)).toBe(2);
    expect(multiplierForBanks(4, false)).toBe(4);
    expect(multiplierForBanks(5, false)).toBe(6);
    expect(multiplierForBanks(5, true)).toBe(6);
  });

  it("advances through three balls then reports game over", () => {
    const score = new ScoreKeeper();
    expect(score.advanceBall()).toBe(true);
    expect(score.advanceBall()).toBe(true);
    expect(score.ball).toBe(BALLS_PER_GAME);
    expect(score.advanceBall()).toBe(false);
    expect(score.ballsRemaining).toBe(0);
  });

  it("reset restores a fresh machine", () => {
    const score = new ScoreKeeper();
    score.add("jackpot");
    score.registerBankClear();
    score.registerBankClear();
    score.advanceBall();
    score.reset();
    const snap = score.snapshot();
    expect(snap.score).toBe(0);
    expect(snap.banksDown).toBe(0);
    expect(snap.ball).toBe(1);
    expect(snap.multiplier).toBe(1);
    expect(snap.vaultOpen).toBe(false);
  });
});

describe("vault breakers missions", () => {
  it("clears a bank only when all three standups are down, then the vault at five banks", () => {
    const missions = new MissionTracker();
    const bank = BANK_IDS[0]!;
    const partial = missions.registerTargetDown(`${bank}:t0`);
    expect(partial.some((event) => event.type === "bank-clear")).toBe(false);
    missions.registerTargetDown(`${bank}:t1`);
    const cleared = missions.registerTargetDown(`${bank}:t2`);
    expect(cleared.some((event) => event.type === "bank-clear")).toBe(true);
    expect(missions.banksDown).toBe(1);

    // Repeat hits on a cleared bank do not double-count.
    missions.registerTargetDown(`${bank}:t0`);
    expect(missions.banksDown).toBe(1);

    for (const other of BANK_IDS.slice(1)) {
      for (let t = 0; t < TARGETS_PER_BANK; t += 1) {
        const events = missions.registerTargetDown(`${other}:t${t}`);
        if (other === BANK_IDS[BANK_IDS.length - 1] && t === TARGETS_PER_BANK - 1) {
          expect(events.some((event) => event.type === "all-banks-clear")).toBe(true);
        }
      }
    }
    expect(missions.banksDown).toBe(5);
    expect(missions.vaultOpen).toBe(true);
  });

  it("orbit loops complete at three and reset per ball, not per game", () => {
    const missions = new MissionTracker();
    for (let loop = 1; loop <= ORBIT_TARGET; loop += 1) {
      const events = missions.registerOrbitLoop();
      expect(events.some((event) => event.type === "orbit-loop" && event.loops === loop)).toBe(true);
    }
    expect(missions.registerOrbitLoop().some((event) => event.type === "orbit-complete")).toBe(false);
    missions.newBall();
    expect(missions.orbitLoops).toBe(0);
  });
});

describe("vault breakers scoreboard mapping", () => {
  it("every mission line the tracker can emit has a prebuilt text3D node", () => {
    const missions = new MissionTracker();
    expect(MISSION_LINES).toContain(missions.missionLine());
    missions.registerTargetDown(`${BANK_IDS[0]!}:t0`);
    missions.registerTargetDown(`${BANK_IDS[0]!}:t1`);
    missions.registerTargetDown(`${BANK_IDS[0]!}:t2`);
    expect(MISSION_LINES).toContain(missions.missionLine());
    for (let loop = 1; loop <= ORBIT_TARGET; loop += 1) missions.registerOrbitLoop();
    expect(MISSION_LINES).toContain(missions.missionLine());
    expect(MISSION_LINES).toContain("VAULT IS OPEN");
  });

  it("shows exactly one digit per reel slot and one mission line", () => {
    const visibility = scoreboardVisibility({
      score: 12345,
      ball: 2,
      multiplier: 2,
      banksDown: 1,
      missionLine: MISSION_LINES[1]!
    });
    for (let slot = 0; slot < SCORE_DIGITS; slot += 1) {
      const shown = [...visibility.entries()].filter(([id, visible]) => id.startsWith(`sb-score-${slot}-`) && visible);
      expect(shown).toHaveLength(1);
    }
    const scoreShown = [...visibility.entries()]
      .filter(([id, visible]) => /^sb-score-\d-\d$/.test(id) && visible)
      .map(([id]) => id.split("-")[3]!)
      .join("");
    expect(scoreShown).toBe("012345");
    expect(visibility.get("sb-ball-2")).toBe(true);
    expect(visibility.get("sb-mult-2")).toBe(true);
    expect(visibility.get("sb-banks-1")).toBe(true);
    const missionsShown = [...visibility.keys()].filter((id) => id.startsWith("sb-mission-") && visibility.get(id));
    expect(missionsShown).toHaveLength(1);
  });
});
