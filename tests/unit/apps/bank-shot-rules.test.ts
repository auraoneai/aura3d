import { describe, expect, it } from "vitest";
import {
  FOUL_LIMIT,
  RulesEngine,
  suitOf
} from "../../../apps/showcase-bank-shot/src/rules";
import {
  COMBO_CAP,
  RACKS,
  SCORE_TABLE,
  comboMultiplierFor,
  nextComboStreak,
  rackConfigFor,
  timeBonusFor
} from "../../../apps/showcase-bank-shot/src/racks";
import {
  CueController,
  MIN_POWER,
  STRIKE_MAX_SPEED,
  STRIKE_MIN_SPEED,
  strikeSpeedFor,
  sweepPreviewGeometric
} from "../../../apps/showcase-bank-shot/src/cue";
import { BALL_RADIUS } from "../../../apps/showcase-bank-shot/src/table";

/**
 * PRD definition-of-done pins for Bank Shot (BS-13): the route-local 8-ball
 * state machine (suit assignment, the three foul kinds, three-foul loss,
 * early-8 loss, legal-8 win), combo math, rack clocks/progression, and the cue
 * controller's charge/strike/sweep laws.
 */

const CLEAN_HIT = { firstContact: 1, cushionAfterContact: true, potted: [1] } as const;

describe("bank shot racks and combo math", () => {
  it("three racks with 4:00 / 3:30 / 3:00 clocks", () => {
    expect(RACKS.map((rack) => rack.clockMs)).toEqual([240_000, 210_000, 180_000]);
    expect(rackConfigFor(2).clockMs).toBe(210_000);
    expect(rackConfigFor(3).label).toBe(RACKS[2]!.label);
  });

  it("combo ladder adds 0.25x per consecutive pot, capped, reset on miss or foul", () => {
    expect(comboMultiplierFor(0)).toBe(1);
    expect(comboMultiplierFor(1)).toBe(1.25);
    expect(comboMultiplierFor(4)).toBe(2);
    expect(comboMultiplierFor(99)).toBe(COMBO_CAP);
    expect(nextComboStreak(2, 1, false)).toBe(3);
    expect(nextComboStreak(2, 0, false)).toBe(0);
    expect(nextComboStreak(2, 3, true)).toBe(0);
  });

  it("time bonus pays per whole second left on the clock", () => {
    expect(timeBonusFor(0)).toBe(0);
    expect(timeBonusFor(61_000)).toBe(61 * SCORE_TABLE.timeBonusPerSecond);
  });
});

describe("bank shot rules state machine", () => {
  it("a legal pot on the open table assigns the suit and returns to aiming", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 3, cushionAfterContact: true, potted: [3] });
    expect(outcome.foul).toBe(false);
    expect(outcome.suitAssigned).toBe("solids");
    expect(rules.suit).toBe("solids");
    rules.finishResolution();
    expect(rules.phase).toBe("aiming");
    // Stripes stay legal for the other assignments.
    expect(suitOf(11)).toBe("stripes");
  });

  it("pots score at the climbing combo multiplier within one shot", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 1, cushionAfterContact: true, potted: [1, 2] });
    // First pot at x1.25, second at x1.5.
    expect(outcome.scored).toBe(SCORE_TABLE.ballPot * 1.25 + SCORE_TABLE.ballPot * 1.5);
    expect(outcome.combo).toBe(1.5);
  });

  it("a clean miss resets the combo streak", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    rules.resolveShot(CLEAN_HIT);
    rules.finishResolution();
    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 5, cushionAfterContact: true, potted: [] });
    rules.finishResolution();
    expect(outcome.scored).toBe(0);
    expect(rules.combo).toBe(1);
  });

  it("scratch (cue potted) is a foul with ball in hand; potted balls stay down but score nothing", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 1, cushionAfterContact: true, potted: [0, 1] });
    expect(outcome.foul).toBe(true);
    expect(outcome.foulReasons).toContain("scratch");
    expect(outcome.scored).toBe(0);
    expect(rules.potted).toContain(1);
    expect(rules.fouls).toBe(1);
    rules.finishResolution();
    expect(rules.phase).toBe("ball-in-hand");
    expect(rules.confirmBallInHand()).toBe(true);
    expect(rules.phase).toBe("aiming");
  });

  it("no cushion after contact is a foul (and a total miss fouls too)", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    const noRail = rules.resolveShot({ firstContact: 2, cushionAfterContact: false, potted: [] });
    expect(noRail.foul).toBe(true);
    expect(noRail.foulReasons).toContain("no-rail");
    rules.finishResolution();

    rules.confirmBallInHand();
    rules.beginShot();
    const airBall = rules.resolveShot({ firstContact: null, cushionAfterContact: false, potted: [] });
    expect(airBall.foul).toBe(true);
    expect(airBall.foulReasons).toContain("no-rail");
    rules.finishResolution();
    expect(rules.fouls).toBe(2);
  });

  it("wrong-suit first contact is a foul once suited; the 8 is illegal on an open table", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    rules.resolveShot({ firstContact: 1, cushionAfterContact: true, potted: [1] });
    rules.finishResolution();
    expect(rules.suit).toBe("solids");

    rules.beginShot();
    const wrongSuit = rules.resolveShot({ firstContact: 12, cushionAfterContact: true, potted: [] });
    expect(wrongSuit.foul).toBe(true);
    expect(wrongSuit.foulReasons).toContain("wrong-ball-first");
    rules.finishResolution();

    // Open-table route: first contact with the 8 is a foul.
    const open = new RulesEngine(1);
    open.beginShot();
    const eightFirst = open.resolveShot({ firstContact: 8, cushionAfterContact: true, potted: [] });
    expect(eightFirst.foul).toBe(true);
    expect(eightFirst.foulReasons).toContain("wrong-ball-first");
  });

  it("three fouls lose the rack", () => {
    const rules = new RulesEngine(1);
    for (let foul = 1; foul <= FOUL_LIMIT; foul += 1) {
      rules.beginShot();
      const outcome = rules.resolveShot({ firstContact: null, cushionAfterContact: false, potted: [] });
      rules.finishResolution();
      if (foul < FOUL_LIMIT) {
        expect(outcome.rackLost).toBe(false);
        expect(rules.phase).toBe("ball-in-hand");
        rules.confirmBallInHand();
      } else {
        expect(outcome.rackLost).toBe(true);
        expect(outcome.lossReason).toBe("three fouls");
        expect(rules.phase).toBe("rack-lost");
      }
    }
    expect(rules.fouls).toBe(FOUL_LIMIT);
  });

  it("potting the 8 early loses the rack even on an otherwise clean shot", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 8, cushionAfterContact: true, potted: [8] });
    expect(outcome.rackLost).toBe(true);
    expect(outcome.lossReason).toBe("8-ball potted early");
    rules.finishResolution();
    expect(rules.phase).toBe("rack-lost");
  });

  it("clearing the suit then potting the 8 clean wins the rack with time bonus", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    rules.resolveShot({ firstContact: 1, cushionAfterContact: true, potted: [1, 2, 3, 4, 5, 6, 7] });
    rules.finishResolution();
    expect(rules.suit).toBe("solids");
    expect(rules.suitCleared).toBe(true);
    expect(rules.legalFirstContact()).toEqual([8]);

    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 8, cushionAfterContact: true, potted: [8] });
    expect(outcome.rackWon).toBe(true);
    rules.finishResolution();
    expect(rules.phase).toBe("rack-won");
    // 1500 win bonus plus 2 points per remaining second of the 4:00 rack clock.
    const expected = SCORE_TABLE.eightBallWin + timeBonusFor(rackConfigFor(1).clockMs);
    expect(outcome.scored).toBe(expected);
  });

  it("scratching on the 8-ball loses the rack", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    rules.resolveShot({ firstContact: 9, cushionAfterContact: true, potted: [9, 10, 11, 12, 13, 14, 15] });
    rules.finishResolution();
    expect(rules.suit).toBe("stripes");
    rules.beginShot();
    const outcome = rules.resolveShot({ firstContact: 8, cushionAfterContact: true, potted: [8, 0] });
    expect(outcome.rackLost).toBe(true);
    expect(outcome.lossReason).toBe("scratch on the 8-ball");
  });

  it("the rack clock ticks down only while the rack is live and expiry loses it", () => {
    const rules = new RulesEngine(1);
    for (let tick = 0; tick < 100; tick += 1) rules.tickClock(1000);
    expect(rules.clockMs).toBe(rackConfigFor(1).clockMs - 100_000);
    // 139 more seconds fit on the clock; the 140th expires it.
    for (let tick = 0; tick < 139; tick += 1) expect(rules.tickClock(1000)).toBe(false);
    expect(rules.tickClock(1000)).toBe(true);
    expect(rules.phase).toBe("rack-lost");
    // A resolved rack no longer ticks.
    const before = rules.clockMs;
    rules.tickClock(5000);
    expect(rules.clockMs).toBe(before);
  });

  it("rack progression advances 1 -> 2 -> 3 -> session complete, score carrying", () => {
    const rules = new RulesEngine(1);
    const winRack = (): void => {
      rules.beginShot();
      rules.resolveShot({ firstContact: 1, cushionAfterContact: true, potted: [1, 2, 3, 4, 5, 6, 7] });
      rules.finishResolution();
      rules.beginShot();
      const eight = rules.resolveShot({ firstContact: 8, cushionAfterContact: true, potted: [8] });
      rules.finishResolution();
      expect(eight.rackWon).toBe(true);
    };
    winRack();
    const scoreAfterRack1 = rules.score;
    expect(rules.advanceRack()).toBe(2);
    expect(rules.rack).toBe(2);
    expect(rules.clockMs).toBe(rackConfigFor(2).clockMs);
    expect(rules.score).toBe(scoreAfterRack1);
    expect(rules.suit).toBeNull();
    expect(rules.potted).toHaveLength(0);

    winRack();
    expect(rules.advanceRack()).toBe(3);
    winRack();
    expect(rules.sessionComplete).toBe(true);
    expect(rules.advanceRack()).toBeNull();
    expect(rules.sessionComplete).toBe(true);
  });

  it("rerack restores rack 1 with zero score", () => {
    const rules = new RulesEngine(1);
    rules.beginShot();
    rules.resolveShot(CLEAN_HIT);
    rules.finishResolution();
    expect(rules.score).toBeGreaterThan(0);
    rules.rerack();
    expect(rules.rack).toBe(1);
    expect(rules.score).toBe(0);
    expect(rules.phase).toBe("aiming");
    expect(rules.potted).toHaveLength(0);
    expect(rules.sessionComplete).toBe(false);
  });
});

describe("bank shot cue controller", () => {
  it("charge is monotonic and release maps to the power/speed law", () => {
    const cue = new CueController();
    expect(cue.strike()).toBeNull();
    cue.beginCharge();
    cue.updateCharge(10);
    const full = cue.strike()!;
    expect(full.power).toBe(1);
    expect(strikeSpeedFor(full.power)).toBe(STRIKE_MAX_SPEED);
    expect(strikeSpeedFor(MIN_POWER)).toBe(STRIKE_MIN_SPEED);
    // A sub-frame tap still strikes at minimum power.
    cue.beginCharge();
    cue.updateCharge(0.01);
    const tap = cue.strike()!;
    expect(tap.power).toBeGreaterThanOrEqual(MIN_POWER);
    // Out-of-range powers clamp.
    expect(strikeSpeedFor(5)).toBe(STRIKE_MAX_SPEED);
    expect(strikeSpeedFor(-1)).toBe(STRIKE_MIN_SPEED);
  });

  it("aim rotates the full circle and spin clamps to [-1, 1]", () => {
    const cue = new CueController();
    for (let index = 0; index < 400; index += 1) cue.aimBy(0.028);
    expect(Math.abs(cue.aimAngle)).toBeLessThanOrEqual(Math.PI);
    for (let index = 0; index < 200; index += 1) cue.spinBy(0.02);
    expect(cue.spin).toBe(1);
    for (let index = 0; index < 400; index += 1) cue.spinBy(-0.02);
    expect(cue.spin).toBe(-1);
  });

  it("the geometric sweep finds the ghost ball, object direction, and bank reflection", () => {
    const balls = [
      { number: 1, x: 0.5, z: 0, live: true },
      { number: 5, x: -0.4, z: -0.5, live: true }
    ];
    const bounds = { halfX: 1.3, halfZ: 0.7 };
    // Straight at ball 1 from the cue spot: ghost sits 2r short of its center.
    const hit = sweepPreviewGeometric(-0.7, 0, 0, balls, BALL_RADIUS, bounds);
    expect(hit.kind).toBe("ball");
    expect(hit.ballNumber).toBe(1);
    expect(hit.ghostX).toBeCloseTo(0.5 - 2 * BALL_RADIUS, 4);
    expect(hit.objectDirX).toBeGreaterThan(0.9);

    // Aim away from every ball: the cushion wins and the bank line reflects.
    const rail = sweepPreviewGeometric(-0.7, 0, Math.PI, balls, BALL_RADIUS, bounds);
    expect(rail.kind).toBe("cushion");
    expect(rail.bankDirX).toBeGreaterThan(0); // reflected off the west rail, back into the table
    expect(Math.hypot(rail.bankDirX, rail.bankDirZ)).toBeCloseTo(1, 4);

    // Dead shots at potted balls pass through them.
    const potted = sweepPreviewGeometric(-0.7, 0, 0, [{ ...balls[0]!, live: false }], BALL_RADIUS, bounds);
    expect(potted.kind).toBe("cushion");
  });
});
