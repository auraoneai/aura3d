/**
 * Beat Hopper — pure deterministic sim (no DOM, no engine imports; GameRng wraps the counted stream).
 * One fixed 1/60 s step. Obstacles live on a 132 BPM beat grid, seeded per 8-bar (32-beat) phrase.
 * Judgement happens once per obstacle at its crossing step (C16); popups drain by monotonic seq (C2);
 * begin() re-centres all input/drag state (C4).
 */
import { GameRng, POPUP_LIMIT, type Popup } from "../../../examples/shared/runner-kit/index";

export const CONFIG = {
  DT: 1 / 60,
  BPM: 132,
  BEAT: 60 / 132,
  BEATS_PER_PHRASE: 32,
  SPEED_INIT: 16,
  MAX_SPEED: 24,
  PERFECT_WINDOW: 0.09,
  GOOD_WINDOW: 0.16,
  POINTS_PERFECT: 60,
  POINTS_GOOD: 30,
  MAX_LIVES: 3,
  MAX_MULT: 5,
  COMBO_PER_MULT: 4,
  JUMP_VY: 8.5,
  GRAVITY: 22,
  DUCK_HOLD: 0.18,
  /** Duck should engage this long before the bar crossing. */
  DUCK_LEAD: 0.12,
  MILESTONE: 750,
  MILESTONE_BONUS: 100,
  BURST_SECONDS: 0.9,
  SPAWN_AHEAD_BEATS: 6,
  FIRST_OBSTACLE_BEAT: 4,
  POOL_SEGMENTS: 220,
  POOL_OBSTACLES: 24,
  POOL_PARTICLES: 90,
  POOL_RINGS: 8
} as const;

/** Time from jump start to apex — the ideal hop puts the apex exactly on the crossing. */
export const APEX_T = CONFIG.JUMP_VY / CONFIG.GRAVITY;

export type Phase = "splash" | "playing" | "bursting" | "gameOver";
export type Pose = "grounded" | "air" | "duck";
export type ObstacleType = "gap" | "block" | "bar";
export type Judgement = "perfect" | "good" | "miss";

export interface Input {
  start: boolean;
  down: boolean;
  up: boolean;
  dx: number;
  tap: boolean;
}
export const IDLE: Input = { start: false, down: false, up: false, dx: 0, tap: false };

export interface ObstacleSlot {
  active: boolean;
  beat: number;
  type: ObstacleType;
  crossTime: number;
  resolved: boolean;
  judgement: Judgement | null;
}

export interface PhrasePlan {
  index: number;
  cells: (ObstacleType | null)[];
}

export interface GameState {
  phase: Phase;
  t: number;
  dist: number;
  speed: number;
  beatIndex: number;
  phraseIndex: number;
  score: number;
  lives: number;
  combo: number;
  maxCombo: number;
  mult: number;
  pose: Pose;
  y: number;
  vy: number;
  holding: boolean;
  holdT: number;
  airStart: number;
  duckStart: number;
  laneOffset: number;
  perfect: number;
  good: number;
  miss: number;
  milestones: number;
  milestoneTarget: number;
  shakeAt: number;
  burstT: number;
  lastJudge: { kind: Judgement | null; at: number; beat: number };
  obstacles: ObstacleSlot[];
  plans: PhrasePlan[];
  spawnedThroughBeat: number;
  spawnSkipped: number;
  rngCount: number;
}

export const TRACE_COLUMNS = [
  "score", "lives", "combo", "mult", "beatIndex", "phraseIndex", "pose",
  "y", "vy", "dist", "perfect", "good", "miss", "milestones", "rngCount"
] as const;

const POSE_CODE: Record<Pose, number> = { grounded: 0, air: 1, duck: 2 };

function emptySlot(): ObstacleSlot {
  return { active: false, beat: -1, type: "gap", crossTime: 0, resolved: false, judgement: null };
}

/** Ideal action moment (pose-entry time) for an obstacle: apex over hops, engaged duck before bars. */
export function idealMoment(type: ObstacleType, crossTime: number): number {
  return type === "bar" ? crossTime - CONFIG.DUCK_LEAD : crossTime - APEX_T;
}

/** Scroll-space z of an obstacle relative to the player (negative = behind). Deterministic per §3.6. */
export function obstacleZ(o: GameState, slot: ObstacleSlot): number {
  return (slot.crossTime - o.t) * o.speed;
}

export class BeatHopperSim {
  readonly o: GameState;
  readonly popups: Popup[] = [];
  private readonly seed: number;
  private rng: GameRng;
  private seq = 0;
  private genLastBeat = -10;
  private genLastType: ObstacleType = "bar";

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new GameRng(seed);
    this.o = this.freshState("splash");
  }

  private freshState(phase: Phase): GameState {
    const obstacles: ObstacleSlot[] = [];
    for (let i = 0; i < CONFIG.POOL_OBSTACLES; i++) obstacles.push(emptySlot());
    return {
      phase, t: 0, dist: 0, speed: CONFIG.SPEED_INIT, beatIndex: 0, phraseIndex: 0,
      score: 0, lives: CONFIG.MAX_LIVES, combo: 0, maxCombo: 0, mult: 1,
      pose: "grounded", y: 0, vy: 0, holding: false, holdT: 0, airStart: -10, duckStart: -10,
      laneOffset: 0, perfect: 0, good: 0, miss: 0, milestones: 0,
      milestoneTarget: CONFIG.MILESTONE, shakeAt: -10, burstT: 0,
      lastJudge: { kind: null, at: -10, beat: -1 },
      obstacles, plans: [], spawnedThroughBeat: -1, spawnSkipped: 0, rngCount: 0
    };
  }

  /** Start/restart: resets pose, hold/drag state and the counted stream (C4). Popup seq stays monotonic (C2). */
  begin(): void {
    const next = this.freshState("playing");
    Object.assign(this.o, next);
    this.rng = new GameRng(this.seed);
    this.genLastBeat = -10;
    this.genLastType = "bar";
  }

  private popup(text: string, color: string, size: number): void {
    this.popups.push({ n: this.popups.length, seq: this.seq++, text, color, size, at: this.o.t });
    if (this.popups.length > POPUP_LIMIT) this.popups.splice(0, this.popups.length - POPUP_LIMIT);
  }

  /** Seeded 32-beat phrase: density ramps one-per-2-beats → one-per-beat; hop→hop keeps ≥2 beats (airtime). */
  private generatePlan(index: number): PhrasePlan {
    const cells: (ObstacleType | null)[] = new Array(CONFIG.BEATS_PER_PHRASE).fill(null);
    const base = index * CONFIG.BEATS_PER_PHRASE;
    let b = index === 0 ? CONFIG.FIRST_OBSTACLE_BEAT : 0;
    while (b < CONFIG.BEATS_PER_PHRASE) {
      const absBeat = base + b;
      if (absBeat - this.genLastBeat >= 1) {
        const r = this.rng.next();
        let type: ObstacleType = r < 0.4 ? "gap" : r < 0.7 ? "block" : "bar";
        const hop = this.genLastType !== "bar";
        if (hop && type !== "bar" && absBeat - this.genLastBeat < 2) type = "bar";
        cells[b] = type;
        this.genLastBeat = absBeat;
        this.genLastType = type;
      }
      let step = 2;
      if (index >= 4) step = 1;
      else if (index >= 2) step = this.rng.next() < 0.5 ? 1 : 2;
      b += step;
    }
    return { index, cells };
  }

  private planFor(index: number): PhrasePlan {
    let plan = this.o.plans.find((p) => p.index === index);
    if (!plan) {
      plan = this.generatePlan(index);
      this.o.plans.push(plan);
      this.o.plans.sort((a, c) => a.index - c.index);
      while (this.o.plans.length > 3) this.o.plans.shift();
    }
    return plan;
  }

  private spawnUpTo(beat: number): void {
    const o = this.o;
    for (let b = Math.max(0, o.spawnedThroughBeat + 1); b <= beat; b++) {
      const plan = this.planFor(Math.floor(b / CONFIG.BEATS_PER_PHRASE));
      const type = plan.cells[b % CONFIG.BEATS_PER_PHRASE];
      if (type) {
        const slot = o.obstacles.find((s) => !s.active);
        if (slot) {
          slot.active = true;
          slot.beat = b;
          slot.type = type;
          slot.crossTime = b * CONFIG.BEAT;
          slot.resolved = false;
          slot.judgement = null;
        } else {
          o.spawnSkipped++;
        }
      }
      o.spawnedThroughBeat = b;
    }
  }

  private judge(slot: ObstacleSlot): void {
    const o = this.o;
    slot.resolved = true;
    const ideal = idealMoment(slot.type, slot.crossTime);
    const poseOk = slot.type === "bar" ? o.pose === "duck" : o.pose === "air";
    const actionStart = slot.type === "bar" ? o.duckStart : o.airStart;
    const delta = Math.abs(actionStart - ideal);
    let kind: Judgement = "miss";
    if (poseOk && delta <= CONFIG.GOOD_WINDOW) {
      kind = delta <= CONFIG.PERFECT_WINDOW ? "perfect" : "good";
    }
    slot.judgement = kind;
    o.lastJudge = { kind, at: o.t, beat: slot.beat };
    if (kind === "miss") {
      o.miss++;
      o.lives--;
      o.combo = 0;
      o.mult = 1;
      o.shakeAt = o.t;
      this.popup("MISS", "#ff4d6d", 1.2);
      if (o.lives <= 0) {
        o.phase = "bursting";
        o.burstT = 0;
      }
    } else {
      o.combo++;
      o.maxCombo = Math.max(o.maxCombo, o.combo);
      o.mult = Math.min(CONFIG.MAX_MULT, 1 + Math.floor(o.combo / CONFIG.COMBO_PER_MULT));
      const pts = (kind === "perfect" ? CONFIG.POINTS_PERFECT : CONFIG.POINTS_GOOD) * o.mult;
      o.score += pts;
      if (kind === "perfect") {
        o.perfect++;
        this.popup(`PERFECT +${pts}`, "#ffd166", 1.25);
      } else {
        o.good++;
        this.popup(`GOOD +${pts}`, "#5eead4", 1);
      }
      while (o.score >= o.milestoneTarget) {
        o.score += CONFIG.MILESTONE_BONUS;
        o.milestoneTarget += CONFIG.MILESTONE;
        o.milestones++;
        this.popup(`+${CONFIG.MILESTONE_BONUS} BONUS`, "#ffd166", 1.35);
      }
    }
  }

  advance(input: Input = IDLE): void {
    const o = this.o;
    if (o.phase === "splash" || o.phase === "gameOver") {
      if (input.start) this.begin();
      return;
    }
    if (o.phase === "bursting") {
      o.burstT += CONFIG.DT;
      if (o.burstT >= CONFIG.BURST_SECONDS) o.phase = "gameOver";
      return;
    }

    o.t += CONFIG.DT;
    o.dist += o.speed * CONFIG.DT;
    const beat = Math.floor(o.t / CONFIG.BEAT + 1e-9);
    o.beatIndex = beat;
    const phrase = Math.floor(beat / CONFIG.BEATS_PER_PHRASE);
    if (phrase !== o.phraseIndex) {
      o.phraseIndex = phrase;
      o.speed = Math.min(CONFIG.MAX_SPEED, CONFIG.SPEED_INIT + phrase);
    }

    // Input: release first so a duck can end and a fresh tap can start in the same frame.
    if (input.up) {
      const wasTap = o.holding && o.holdT < CONFIG.DUCK_HOLD;
      o.holding = false;
      if (o.pose === "duck") {
        o.pose = "grounded";
      } else if (wasTap && o.pose === "grounded") {
        o.pose = "air";
        o.vy = CONFIG.JUMP_VY;
        o.airStart = o.t;
      }
      o.holdT = 0;
    }
    if (input.down && !o.holding) {
      o.holding = true;
      o.holdT = 0;
    }
    if (o.holding) o.holdT += CONFIG.DT;

    // Pose physics.
    if (o.pose === "air") {
      o.vy -= CONFIG.GRAVITY * CONFIG.DT;
      o.y += o.vy * CONFIG.DT;
      if (o.y <= 0) {
        o.y = 0;
        o.vy = 0;
        if (o.holding && o.holdT >= CONFIG.DUCK_HOLD) {
          o.pose = "duck";
          o.duckStart = o.t;
        } else {
          o.pose = "grounded";
        }
      }
    } else if (o.pose === "grounded") {
      if (o.holding && o.holdT >= CONFIG.DUCK_HOLD) {
        o.pose = "duck";
        o.duckStart = o.t;
      }
    } else if (!o.holding) {
      o.pose = "grounded";
    }

    this.spawnUpTo(beat + CONFIG.SPAWN_AHEAD_BEATS);
    for (const slot of o.obstacles) {
      if (!slot.active) continue;
      if (!slot.resolved && o.t + 1e-9 >= slot.crossTime) this.judge(slot);
      if (o.t > slot.crossTime + 2 * CONFIG.BEAT) slot.active = false;
      if (o.phase !== "playing") break;
    }
    o.rngCount = this.rng.count;
  }

  traceRow(_index: number): number[] {
    const o = this.o;
    return [
      o.score, o.lives, o.combo, o.mult, o.beatIndex, o.phraseIndex, POSE_CODE[o.pose],
      o.y, o.vy, o.dist, o.perfect, o.good, o.miss, o.milestones, o.rngCount
    ];
  }
}

export function replay(seed: number, warmup: number, inputs: readonly Input[]): {
  sim: BeatHopperSim;
  trace: number[][];
} {
  const sim = new BeatHopperSim(seed);
  const trace: number[][] = [];
  for (let i = 0; i < warmup; i++) {
    sim.advance(IDLE);
    trace.push(sim.traceRow(i));
  }
  for (let i = 0; i < inputs.length; i++) {
    sim.advance(inputs[i] as Input);
    trace.push(sim.traceRow(warmup + i));
  }
  return { sim, trace };
}