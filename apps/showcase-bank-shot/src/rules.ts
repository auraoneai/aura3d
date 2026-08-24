/**
 * Bank Shot rules engine (PRD BS-07/08): the route-local 8-ball state machine.
 *
 * Pure state, no physics import: the route feed it a ShotRecord (first contact,
 * cushion-after-contact, potted balls) gathered from the table simulation and it
 * owns suit assignment, the three foul kinds, ball-in-hand, three-foul and
 * early-8 losses, the legal-8 win, rack clocks, and combo scoring through
 * racks.ts. Phases per the PRD: aiming -> shooting -> shot-resolved ->
 * aiming | ball-in-hand | rack-won | rack-lost.
 *
 * Unit-tested directly by tests/unit/apps/bank-shot-rules.test.ts.
 */
import {
  comboMultiplierFor,
  nextComboStreak,
  rackConfigFor,
  SCORE_TABLE,
  timeBonusFor,
  RACK_COUNT
} from "./racks";

export type Suit = "solids" | "stripes";
export type RulesPhase = "aiming" | "ball-in-hand" | "shooting" | "shot-resolved" | "rack-won" | "rack-lost";
export type FoulReason = "scratch" | "no-rail" | "wrong-ball-first";

export const FOUL_LIMIT = 3;
export const CUE_BALL = 0;
export const EIGHT_BALL = 8;

/** What the table observed during one shot (physics-owned facts). */
export interface ShotRecord {
  /** Ball number the cue ball first contacted, or null when it hit nothing. */
  readonly firstContact: number | null;
  /** True when any ball reached a cushion after the cue ball's first contact. */
  readonly cushionAfterContact: boolean;
  /** Ball numbers potted this shot in order (0 = cue ball = scratch). */
  readonly potted: readonly number[];
}

export interface ShotOutcome {
  readonly foul: boolean;
  readonly foulReasons: readonly FoulReason[];
  readonly pottedLegal: readonly number[];
  readonly pottedObjects: readonly number[];
  readonly suitAssigned: Suit | null;
  readonly rackWon: boolean;
  readonly rackLost: boolean;
  readonly lossReason: string | null;
  readonly winReason: string | null;
  readonly scored: number;
  readonly combo: number;
  readonly ballInHand: boolean;
  readonly nextPhase: RulesPhase;
}

export interface RulesSnapshot {
  readonly phase: RulesPhase;
  readonly rack: number;
  readonly clockMs: number;
  readonly score: number;
  readonly combo: number;
  readonly comboStreak: number;
  readonly suit: Suit | null;
  readonly fouls: number;
  readonly potted: readonly number[];
  readonly ballsRemaining: number;
  readonly ballsRemainingInSuit: number;
  readonly suitCleared: boolean;
  readonly sessionComplete: boolean;
  readonly shotCount: number;
  readonly banner: string;
}

export function suitOf(ball: number): Suit | null {
  if (ball >= 1 && ball <= 7) return "solids";
  if (ball >= 9 && ball <= 15) return "stripes";
  return null;
}

export function suitBalls(suit: Suit): readonly number[] {
  return suit === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
}

const ACTIVE_PHASES: readonly RulesPhase[] = ["aiming", "ball-in-hand", "shooting", "shot-resolved"];

/**
 * The 8-ball state machine. One instance owns a full session (racks 1..3);
 * score carries across racks, per-rack state resets in startRack().
 */
export class RulesEngine {
  private phaseValue: RulesPhase = "aiming";
  private rackValue: 1 | 2 | 3 = 1;
  private clockMsValue = rackConfigFor(1).clockMs;
  private scoreValue = 0;
  private comboStreakValue = 0;
  private suitValue: Suit | null = null;
  private foulsValue = 0;
  private pottedValue: number[] = [];
  private shotCountValue = 0;
  private sessionCompleteValue = false;
  private pendingNextPhase: RulesPhase = "aiming";
  private lastOutcomeValue: ShotOutcome | null = null;

  constructor(firstRack = 1) {
    this.startRack(firstRack);
    this.scoreValue = 0;
    this.sessionCompleteValue = false;
  }

  get phase(): RulesPhase {
    return this.phaseValue;
  }

  get rack(): number {
    return this.rackValue;
  }

  get clockMs(): number {
    return this.clockMsValue;
  }

  get score(): number {
    return this.scoreValue;
  }

  get combo(): number {
    return comboMultiplierFor(this.comboStreakValue);
  }

  get comboStreak(): number {
    return this.comboStreakValue;
  }

  get suit(): Suit | null {
    return this.suitValue;
  }

  get fouls(): number {
    return this.foulsValue;
  }

  get potted(): readonly number[] {
    return this.pottedValue;
  }

  get shotCount(): number {
    return this.shotCountValue;
  }

  get sessionComplete(): boolean {
    return this.sessionCompleteValue;
  }

  get lastOutcome(): ShotOutcome | null {
    return this.lastOutcomeValue;
  }

  /** Object balls (1..15) still on the table this rack. */
  get ballsRemaining(): number {
    return 15 - this.pottedValue.filter((ball) => ball >= 1 && ball <= 15).length;
  }

  /** Balls of the player's suit still on the table (0 when unsuited). */
  get ballsRemainingInSuit(): number {
    if (!this.suitValue) return 0;
    const suit = suitBalls(this.suitValue);
    return suit.filter((ball) => !this.pottedValue.includes(ball)).length;
  }

  /** True when the player's suit is fully cleared and the 8 is the legal target. */
  get suitCleared(): boolean {
    return this.suitValue !== null && this.ballsRemainingInSuit === 0;
  }

  /** Legal first-contact ball numbers for the current state. */
  legalFirstContact(): readonly number[] {
    return this.legalFirstContactList(this.pottedValue);
  }

  private legalFirstContactList(potted: readonly number[]): readonly number[] {
    if (this.suitValue === null) {
      // Open table: any object ball except the 8 is a legal first contact.
      const open: number[] = [];
      for (let ball = 1; ball <= 15; ball += 1) if (ball !== EIGHT_BALL && !potted.includes(ball)) open.push(ball);
      return open;
    }
    const suitClearedNow = suitBalls(this.suitValue).every((ball) => potted.includes(ball));
    if (suitClearedNow) return [EIGHT_BALL];
    return suitBalls(this.suitValue).filter((ball) => !potted.includes(ball));
  }

  /** Begin a shot: aiming -> shooting (ball-in-hand must confirm placement first). */
  beginShot(): boolean {
    if (this.phaseValue !== "aiming") return false;
    this.phaseValue = "shooting";
    return true;
  }

  /** Confirm a ball-in-hand placement: ball-in-hand -> aiming. */
  confirmBallInHand(): boolean {
    if (this.phaseValue !== "ball-in-hand") return false;
    this.phaseValue = "aiming";
    return true;
  }

  /**
   * Resolve a finished shot against the record. Sets phase "shot-resolved";
   * finishResolution() then applies the outcome's next phase (the route consumes
   * the outcome in between for audio/HUD).
   */
  resolveShot(record: ShotRecord): ShotOutcome {
    if (this.phaseValue !== "shooting") {
      return {
        foul: false, foulReasons: [], pottedLegal: [], pottedObjects: [],
        suitAssigned: null, rackWon: false, rackLost: false, lossReason: null, winReason: null,
        scored: 0, combo: this.combo, ballInHand: false, nextPhase: this.phaseValue
      };
    }
    this.shotCountValue += 1;
    const pottedObjects = record.potted.filter((ball) => ball >= 1 && ball <= 15);

    // Legality is judged against the table AS THE SHOT BEGAN: snapshot the
    // pre-shot state before recording this shot's pots.
    const pottedBefore = [...this.pottedValue];
    const suitClearedBeforeShot = this.suitValue !== null
      && suitBalls(this.suitValue).every((ball) => pottedBefore.includes(ball));
    const legalFirst = this.legalFirstContactList(pottedBefore);

    // Potted object balls stay down regardless of fouls (standard 8-ball table state).
    for (const ball of pottedObjects) {
      if (!this.pottedValue.includes(ball)) this.pottedValue.push(ball);
    }

    const cuePotted = record.potted.includes(CUE_BALL);
    const eightPotted = record.potted.includes(EIGHT_BALL);

    const foulReasons: FoulReason[] = [];
    if (cuePotted) foulReasons.push("scratch");
    if (record.firstContact === null || !record.cushionAfterContact) {
      // A shot that contacts nothing also fails the rail requirement.
      foulReasons.push("no-rail");
    }
    if (record.firstContact !== null && !legalFirst.includes(record.firstContact)) {
      foulReasons.push("wrong-ball-first");
    }
    const foul = foulReasons.length > 0;

    // ---- 8-ball outcomes dominate --------------------------------------------
    if (eightPotted) {
      if (!suitClearedBeforeShot) {
        return this.finish({
          foul, foulReasons, pottedLegal: [], pottedObjects, suitAssigned: null,
          rackWon: false, rackLost: true, lossReason: "8-ball potted early", winReason: null,
          scored: 0, combo: 1, ballInHand: false, nextPhase: "rack-lost"
        });
      }
      if (foul) {
        return this.finish({
          foul, foulReasons, pottedLegal: [], pottedObjects, suitAssigned: null,
          rackWon: false, rackLost: true,
          lossReason: cuePotted ? "scratch on the 8-ball" : "foul on the 8-ball shot",
          winReason: null, scored: 0, combo: 1, ballInHand: false, nextPhase: "rack-lost"
        });
      }
      const bonus = SCORE_TABLE.eightBallWin + timeBonusFor(this.clockMsValue);
      this.scoreValue += bonus;
      if (this.rackValue === RACK_COUNT) this.sessionCompleteValue = true;
      return this.finish({
        foul: false, foulReasons: [], pottedLegal: [EIGHT_BALL], pottedObjects, suitAssigned: null,
        rackWon: true, rackLost: false, lossReason: null,
        winReason: "cleared suit and potted the 8-ball",
        scored: bonus, combo: this.combo, ballInHand: false, nextPhase: "rack-won"
      });
    }

    // ---- foul path -------------------------------------------------------------
    if (foul) {
      this.foulsValue += 1;
      this.comboStreakValue = 0;
      if (this.foulsValue >= FOUL_LIMIT) {
        return this.finish({
          foul, foulReasons, pottedLegal: [], pottedObjects, suitAssigned: null,
          rackWon: false, rackLost: true, lossReason: "three fouls", winReason: null,
          scored: 0, combo: 1, ballInHand: false, nextPhase: "rack-lost"
        });
      }
      return this.finish({
        foul, foulReasons, pottedLegal: [], pottedObjects, suitAssigned: null,
        rackWon: false, rackLost: false, lossReason: null, winReason: null,
        scored: 0, combo: 1, ballInHand: true, nextPhase: "ball-in-hand"
      });
    }

    // ---- clean shot ------------------------------------------------------------
    let suitAssigned: Suit | null = null;
    if (this.suitValue === null && pottedObjects.length > 0) {
      const assigned = suitOf(pottedObjects[0]!);
      if (assigned) {
        this.suitValue = assigned;
        suitAssigned = assigned;
      }
    }
    let scored = 0;
    for (let index = 0; index < pottedObjects.length; index += 1) {
      this.comboStreakValue = nextComboStreak(this.comboStreakValue, 1, false);
      scored += SCORE_TABLE.ballPot * comboMultiplierFor(this.comboStreakValue);
    }
    if (pottedObjects.length === 0) this.comboStreakValue = nextComboStreak(this.comboStreakValue, 0, false);
    this.scoreValue += scored;
    return this.finish({
      foul: false, foulReasons: [], pottedLegal: pottedObjects, pottedObjects, suitAssigned,
      rackWon: false, rackLost: false, lossReason: null, winReason: null,
      scored, combo: this.combo, ballInHand: false, nextPhase: "aiming"
    });
  }

  /** Apply the stored outcome's next phase after the route consumed the outcome. */
  finishResolution(): RulesPhase {
    if (this.phaseValue !== "shot-resolved") return this.phaseValue;
    this.phaseValue = this.pendingNextPhase;
    return this.phaseValue;
  }

  /**
   * Advance the rack clock while the rack is live. Returns true when the clock
   * expired (the rack is lost).
   */
  tickClock(deltaMs: number): boolean {
    if (!ACTIVE_PHASES.includes(this.phaseValue)) return false;
    if (this.sessionCompleteValue) return false;
    this.clockMsValue = Math.max(0, this.clockMsValue - Math.max(0, deltaMs));
    if (this.clockMsValue <= 0) {
      this.phaseValue = "rack-lost";
      this.pendingNextPhase = "rack-lost";
      return true;
    }
    return false;
  }

  /** Start a rack: fresh clock, suit, fouls, potted list. Score carries over. */
  startRack(rack: number): void {
    const config = rackConfigFor(rack);
    this.rackValue = config.id;
    this.clockMsValue = config.clockMs;
    this.suitValue = null;
    this.foulsValue = 0;
    this.pottedValue = [];
    this.comboStreakValue = 0;
    this.phaseValue = "aiming";
    this.pendingNextPhase = "aiming";
    this.lastOutcomeValue = null;
  }

  /** After a rack win: advance to the next rack, or complete the session. */
  advanceRack(): number | null {
    if (this.phaseValue !== "rack-won") return null;
    if (this.rackValue >= RACK_COUNT) {
      this.sessionCompleteValue = true;
      return null;
    }
    const next = (this.rackValue + 1) as 1 | 2 | 3;
    this.startRack(next);
    return next;
  }

  /** Full session reset (the R key): rack 1, zero score. */
  rerack(): void {
    this.sessionCompleteValue = false;
    this.scoreValue = 0;
    this.shotCountValue = 0;
    this.startRack(1);
  }

  snapshot(): RulesSnapshot {
    return {
      phase: this.phaseValue,
      rack: this.rackValue,
      clockMs: this.clockMsValue,
      score: this.scoreValue,
      combo: this.combo,
      comboStreak: this.comboStreakValue,
      suit: this.suitValue,
      fouls: this.foulsValue,
      potted: [...this.pottedValue],
      ballsRemaining: this.ballsRemaining,
      ballsRemainingInSuit: this.ballsRemainingInSuit,
      suitCleared: this.suitCleared,
      sessionComplete: this.sessionCompleteValue,
      shotCount: this.shotCountValue,
      banner: this.bannerLine()
    };
  }

  bannerLine(): string {
    if (this.phaseValue === "rack-won") {
      return this.sessionCompleteValue ? "SESSION CLEAR" : "RACK CLEAR - SPACE FOR THE NEXT RACK";
    }
    if (this.phaseValue === "rack-lost") return "RACK LOST - R TO RE-RACK";
    if (this.phaseValue === "ball-in-hand") return "BALL IN HAND - MOVE WITH A/D/W/S, SPACE TO PLACE";
    if (this.phaseValue === "shooting") return "...";
    if (this.suitValue === null) return "OPEN TABLE - AIM WITH A/D, HOLD SPACE TO CHARGE";
    if (this.suitCleared) return "SUIT CLEAR - THE 8-BALL WINS THE RACK";
    return `${this.suitValue.toUpperCase()} - CLEAR YOUR SUIT`;
  }

  private finish(outcome: ShotOutcome): ShotOutcome {
    this.phaseValue = "shot-resolved";
    this.pendingNextPhase = outcome.nextPhase;
    this.lastOutcomeValue = outcome;
    return outcome;
  }
}
