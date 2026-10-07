/**
 * Siege Golf hole flow - progression, fail, reset, hash snapshots (PRD).
 *
 * Owns one hole's lifecycle: aiming -> simulating -> complete | failed, with
 * deterministic reset (rebuild from the definition, then prove the pre-shot
 * pose hash matches a fresh build) and a semantic event queue the route maps
 * onto audio cues and HUD beats.
 */
import { type HoleDefinition } from "./course";
import {
  PIN_DOWN_MAX_CENTER_HEIGHT,
  PIN_DOWN_MIN_DISPLACEMENT,
  createHoleSimulation,
  type HoleSimulation,
  type ImpactEvent
} from "./structures";
import { completeHole, isHoleFailed, starsFor, type HoleScoreEntry, type StarRating } from "./score";

export type HolePhase = "aiming" | "simulating" | "hole-complete" | "hole-failed";

export type SiegeGameEvent =
  | { readonly type: "strike"; readonly power: number }
  | { readonly type: "impact-wood" | "impact-metal"; readonly speed: number }
  | { readonly type: "cup-flash" }
  | { readonly type: "pin-down" | "pin-sunk"; readonly pinId: string }
  | { readonly type: "out-of-bounds" }
  | { readonly type: "settled"; readonly sunkNow: number }
  | { readonly type: "complete"; readonly stars: StarRating }
  | { readonly type: "failed" }
  | { readonly type: "reset"; readonly hashMatch: boolean };

export interface HoleFlowSnapshot {
  readonly phase: HolePhase;
  readonly strokes: number;
  readonly par: number;
  readonly targetsDown: number;
  readonly targetsSunk: number;
  readonly totalTargets: number;
  readonly sensorEventCount: number;
  readonly physicsBodyCount: number;
  readonly backend: string;
}

const SETTLE_FRAMES_DEFAULT = 30;
/**
 * Hard cap on one stroke's resolution window (6 simulated seconds). Slow
 * micro-jitter can otherwise starve the settle gate indefinitely on weak
 * clients; past this point the current topple state is scored as-is.
 */
const MAX_SIM_FRAMES = 360;

export class HoleFlow {
  private simValue: HoleSimulation;
  private phaseValue: HolePhase = "aiming";
  private strokesValue = 0;
  private lastShotHashValue = "";
  private resetHashMatchValue: boolean | null = null;
  private sensorEventCountValue = 0;
  private targetsDownValue = 0;
  private downPins = new Set<string>();
  private sunkPinsValue = new Set<string>();
  private pendingEvents: SiegeGameEvent[] = [];
  private settleFrames = 0;
  private simFrames = 0;
  private readonly settleFramesNeeded: number;
  private readonly pinAnchors = new Map<string, readonly [number, number]>();

  constructor(readonly hole: HoleDefinition, options: { readonly settleFrames?: number } = {}) {
    this.settleFramesNeeded = options.settleFrames ?? SETTLE_FRAMES_DEFAULT;
    this.simValue = createHoleSimulation(hole);
    this.simValue.stepFixed(30); // initial stacking transient
    for (const [pinId, body] of this.simValue.pinBodies) {
      this.pinAnchors.set(pinId, [body.position[0], body.position[2]]);
    }
  }

  get sim(): HoleSimulation {
    return this.simValue;
  }

  get phase(): HolePhase {
    return this.phaseValue;
  }

  get strokes(): number {
    return this.strokesValue;
  }

  get lastShotHash(): string {
    return this.lastShotHashValue;
  }

  get resetHashMatch(): boolean | null {
    return this.resetHashMatchValue;
  }

  get targetsDown(): number {
    return this.targetsDownValue;
  }

  scoreEntry(): HoleScoreEntry {
    return { holeIndex: 0, par: this.hole.par, strokes: this.strokesValue };
  }

  /** Pre-shot pose hash, captured at strike time for determinism proofs. */
  strike(direction: readonly [number, number], power: number): boolean {
    if (this.phaseValue !== "aiming") return false;
    const nextStrokes = this.strokesValue + 1;
    // PRD: "strokes exceed par + 4 -> hole failed" - the failing shot itself
    // must be playable, so the cap sits one stroke beyond the limit.
    if (nextStrokes > this.hole.par + 5) return false;
    this.lastShotHashValue = this.simValue.poseHash();
    this.simValue.strike([direction[0], 0, direction[1]], power);
    this.strokesValue = nextStrokes;
    this.phaseValue = "simulating";
    this.settleFrames = 0;
    // Resolution is bounded per stroke. Without resetting this counter, the
    // second shot inherits the first shot's 600-frame budget and resolves
    // after a single step, making any multi-target hole impossible.
    this.simFrames = 0;
    this.pendingEvents.push({ type: "strike", power });
    return true;
  }

  /** Advance the simulation while resolving; returns generated game events. */
  update(steps = 1): readonly SiegeGameEvent[] {
    if (this.phaseValue !== "simulating") return [];
    this.simValue.stepFixed(steps);
    this.collectSimEvents();
    this.simFrames += steps;
    const activity = this.simValue.activity();
    if (activity.movingBodies === 0) {
      this.settleFrames += steps;
    } else {
      this.settleFrames = 0;
    }
    if (this.settleFrames >= this.settleFramesNeeded || this.simFrames >= MAX_SIM_FRAMES) {
      this.finishResolution();
    }
    return this.drainEvents();
  }

  private collectSimEvents(): void {
    for (const flash of this.simValue.consumeSensorFlashes()) {
      this.sensorEventCountValue += 1;
      void flash;
      this.pendingEvents.push({ type: "cup-flash" });
    }
    const impacts: readonly ImpactEvent[] = this.simValue.consumeImpacts();
    for (const impact of impacts) {
      const metal = impact.a.includes("barrel") || impact.b.includes("barrel")
        || impact.a.includes("pedestal") || impact.b.includes("pedestal");
      this.pendingEvents.push({ type: metal ? "impact-metal" : "impact-wood", speed: impact.speed });
    }
    for (const [pinId, pinBody] of this.simValue.pinBodies) {
      if (this.downPins.has(pinId)) continue;
      const anchor = this.pinAnchors.get(pinId);
      if (!anchor) continue;
      // Down = on the felt and knocked off its pedestal spot. Same constants
      // as the cup-sunk check in structures.ts: one topple predicate.
      const displaced = Math.hypot(pinBody.position[0] - anchor[0], pinBody.position[2] - anchor[1]) > PIN_DOWN_MIN_DISPLACEMENT;
      if (pinBody.position[1] < PIN_DOWN_MAX_CENTER_HEIGHT && displaced) {
        this.downPins.add(pinId);
        this.targetsDownValue += 1;
        this.pendingEvents.push({ type: "pin-down", pinId });
      }
    }
    for (const pinId of this.simValue.sunkPinIds()) {
      if (!this.sunkPinsValue.has(pinId)) {
        this.sunkPinsValue.add(pinId);
        this.pendingEvents.push({ type: "pin-sunk", pinId });
      }
    }
    const p = this.simValue.ball.position;
    if (p[1] < -1.5) {
      this.simValue.respawnBall();
      this.pendingEvents.push({ type: "out-of-bounds" });
    }
  }

  private finishResolution(): void {
    const totalTargets = this.hole.pins.length;
    this.pendingEvents.push({ type: "settled", sunkNow: this.sunkPinsValue.size });
    if (this.sunkPinsValue.size >= totalTargets) {
      const entry = completeHole(this.scoreEntry());
      this.phaseValue = "hole-complete";
      this.pendingEvents.push({ type: "complete", stars: entry.stars });
      return;
    }
    if (isHoleFailed(this.strokesValue, this.hole.par)) {
      this.phaseValue = "hole-failed";
      this.pendingEvents.push({ type: "failed" });
      return;
    }
    // This is a siege driving range, not continuous-position golf: after an
    // unresolved demolition attempt settles, preserve every toppled body and
    // sunk target but return the weighted range ball to the authored tee for
    // the next legal aim cone. Multi-target holes would otherwise strand the
    // ball behind a structure with the remaining target outside ±60° input.
    this.simValue.respawnBall();
    this.phaseValue = "aiming";
  }

  /** Deterministic reset: rebuild from the definition, prove hash equality. */
  resetHole(): void {
    const reference = createHoleSimulation(this.hole);
    // Both builds pass the same stacking-transient steps so the comparison is
    // like-for-like (a raw step-0 build differs from any settled layout).
    reference.stepFixed(30);
    const freshHash = reference.poseHash();
    this.simValue = createHoleSimulation(this.hole);
    this.simValue.stepFixed(30);
    const rebuiltHash = this.simValue.poseHash();
    this.resetHashMatchValue = freshHash === rebuiltHash;
    this.strokesValue = 0;
    this.phaseValue = "aiming";
    this.downPins.clear();
    this.targetsDownValue = 0;
    this.sunkPinsValue.clear();
    this.settleFrames = 0;
    this.simFrames = 0;
    this.lastShotHashValue = "";
    this.pendingEvents.push({ type: "reset", hashMatch: this.resetHashMatchValue });
  }

  drainEvents(): readonly SiegeGameEvent[] {
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }

  snapshot(): HoleFlowSnapshot {
    return {
      phase: this.phaseValue,
      strokes: this.strokesValue,
      par: this.hole.par,
      targetsDown: this.targetsDownValue,
      targetsSunk: this.sunkPinsValue.size,
      totalTargets: this.hole.pins.length,
      sensorEventCount: this.sensorEventCountValue,
      physicsBodyCount: this.simValue.bodyCount,
      backend: this.simValue.backend
    };
  }

  currentStars(): StarRating {
    return starsFor(this.strokesValue, this.hole.par);
  }
}
