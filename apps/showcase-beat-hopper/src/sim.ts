/**
 * Beat Hopper — pure deterministic sim (no DOM, no engine imports; GameRng wraps the counted stream).
 * One fixed 1/60 s step. Obstacles live on a 132 BPM beat grid, seeded per 8-bar (32-beat) phrase.
 * Three lanes: the hopper steers between them (drag `dx` in CSS px, or whole-lane `lane` steps from keys) with a
 * fixed-speed tween and snaps to the nearest lane for judging. Every obstacle blocks a lane mask: gaps/blocks (hop)
 * and bars (duck) may span one to three lanes, walls (dodge) one or two, so every row has an answer. Beat orbs sit
 * in lanes and pay combo + score when the hopper is in their lane on their beat.
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
  /** A hop pressed this long (s) before landing is kept and fires on the landing step. */
  JUMP_BUFFER: 0.12,
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
  POOL_RINGS: 8,
  /** Three lanes, LANE_WIDTH apart, centred on x = 0 (lane -1 left, 0 centre, 1 right). */
  LANE_WIDTH: 2,
  /** Lane tween speed (m/s): one lane in 0.125 s. */
  LANE_SPEED: 16,
  /** Horizontal drag travel (CSS px) that steps one lane; a press that travels past TAP_SLOP_PX is a steer, not a hop/duck. */
  LANE_SWIPE_PX: 48,
  TAP_SLOP_PX: 12,
  POINTS_DODGE: 20,
  POINTS_ORB: 15,
  POOL_ORBS: 24
} as const;

/** Time from jump start to apex — the ideal hop puts the apex exactly on the crossing. */
export const APEX_T = CONFIG.JUMP_VY / CONFIG.GRAVITY;

export type Phase = "splash" | "playing" | "bursting" | "gameOver";
export type Pose = "grounded" | "air" | "duck";
export type ObstacleType = "gap" | "block" | "bar" | "wall";
/** perfect/good: timed hop or duck; dodge: a wall passed in a free lane; clear: a hop/duck row passed in a free lane untimed. */
export type Judgement = "perfect" | "good" | "miss" | "dodge" | "clear";
export const LANES = [-1, 0, 1] as const;
/** Lane mask bits: 1 = left, 2 = centre, 4 = right. */
export const ALL_LANES = 7;
export const laneBit = (lane: number): number => 1 << (lane + 1);
export const laneX = (lane: number): number => lane * CONFIG.LANE_WIDTH;
/** The lane the hopper occupies for judging: nearest lane centre to its x (lane snapping). */
export const laneAt = (x: number): number => Math.max(-1, Math.min(1, Math.round(x / CONFIG.LANE_WIDTH))) || 0;

export interface Input {
  start: boolean;
  down: boolean;
  up: boolean;
  /** Horizontal pointer drag since the last step, CSS px (only counts while pressed). */
  dx: number;
  tap: boolean;
  /** Whole-lane steps (keys / autopilot): -1 left, +1 right. Never cancels a hop or duck press. */
  lane: number;
  /** With `down`: a dedicated duck press (ArrowDown/S) that ducks at once and never hops on release. */
  duck?: boolean;
  /**
   * A dedicated hop press (Space/ArrowUp/W keydown): hops this step when grounded or ducking, never ducks, and needs
   * no release. Pressed in the air it is buffered and fires on landing if the press came within JUMP_BUFFER of it.
   */
  hop?: boolean;
}
export const IDLE: Input = { start: false, down: false, up: false, dx: 0, tap: false, lane: 0 };

export interface ObstacleSlot {
  active: boolean;
  beat: number;
  type: ObstacleType;
  /** Blocked lanes (bit mask, see laneBit). */
  lanes: number;
  crossTime: number;
  resolved: boolean;
  judgement: Judgement | null;
}

export interface OrbSlot {
  active: boolean;
  beat: number;
  lane: number;
  crossTime: number;
  collected: boolean;
  resolved: boolean;
}

export interface PlanCell {
  type: ObstacleType;
  lanes: number;
}

export interface PhrasePlan {
  index: number;
  cells: (PlanCell | null)[];
  /** Orb lane per beat (null = no orb). */
  orbs: (number | null)[];
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
  /** Sim time of a hop press made in the air, waiting for landing (-10 = none). */
  hopQueuedAt: number;
  /** Current x (m), tweening towards laneX(lane). */
  laneOffset: number;
  /** Target lane (-1, 0, 1). */
  lane: number;
  /** Drag travel this press (px, signed accumulator towards the next lane step, and absolute travel). */
  dragAcc: number;
  dragTravel: number;
  /** The current press became a steer gesture: its release does not hop and it never ducks. */
  steering: boolean;
  dodges: number;
  orbs: number;
  perfect: number;
  good: number;
  miss: number;
  milestones: number;
  milestoneTarget: number;
  shakeAt: number;
  burstT: number;
  lastJudge: { kind: Judgement | null; at: number; beat: number };
  obstacles: ObstacleSlot[];
  orbSlots: OrbSlot[];
  plans: PhrasePlan[];
  spawnedThroughBeat: number;
  spawnSkipped: number;
  rngCount: number;
}

export const TRACE_COLUMNS = [
  "score", "lives", "combo", "mult", "beatIndex", "phraseIndex", "pose",
  "y", "vy", "dist", "perfect", "good", "miss", "milestones", "rngCount",
  "lane", "laneOffset", "dodges", "orbs"
] as const;

const POSE_CODE: Record<Pose, number> = { grounded: 0, air: 1, duck: 2 };

function emptySlot(): ObstacleSlot {
  return { active: false, beat: -1, type: "gap", lanes: ALL_LANES, crossTime: 0, resolved: false, judgement: null };
}
function emptyOrb(): OrbSlot {
  return { active: false, beat: -1, lane: 0, crossTime: 0, collected: false, resolved: false };
}

/** Ideal action moment (pose-entry time) for an obstacle: apex over hops, engaged duck before bars (walls: the crossing). */
export function idealMoment(type: ObstacleType, crossTime: number): number {
  if (type === "wall") return crossTime;
  return type === "bar" ? crossTime - CONFIG.DUCK_LEAD : crossTime - APEX_T;
}

/** Hop obstacles (gap, block) need airtime; bars need a duck; walls can only be dodged by changing lane. */
export const isHop = (type: ObstacleType): boolean => type === "gap" || type === "block";

export const laneCount = (mask: number): number => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
/** Free lanes of a mask, left to right. */
export function freeLanes(mask: number): number[] {
  return LANES.filter((l) => (mask & laneBit(l)) === 0);
}

/** Scroll-space z of an obstacle relative to the player (negative = behind). Deterministic per §3.6. */
export function obstacleZ(o: GameState, slot: { readonly crossTime: number }): number {
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
  private genLastWall = -10;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new GameRng(seed);
    this.o = this.freshState("splash");
  }

  private freshState(phase: Phase): GameState {
    const obstacles: ObstacleSlot[] = [];
    for (let i = 0; i < CONFIG.POOL_OBSTACLES; i++) obstacles.push(emptySlot());
    const orbSlots: OrbSlot[] = [];
    for (let i = 0; i < CONFIG.POOL_ORBS; i++) orbSlots.push(emptyOrb());
    return {
      phase, t: 0, dist: 0, speed: CONFIG.SPEED_INIT, beatIndex: 0, phraseIndex: 0,
      score: 0, lives: CONFIG.MAX_LIVES, combo: 0, maxCombo: 0, mult: 1,
      pose: "grounded", y: 0, vy: 0, holding: false, holdT: 0, airStart: -10, duckStart: -10, hopQueuedAt: -10,
      laneOffset: 0, lane: 0, dragAcc: 0, dragTravel: 0, steering: false, dodges: 0, orbs: 0,
      perfect: 0, good: 0, miss: 0, milestones: 0,
      milestoneTarget: CONFIG.MILESTONE, shakeAt: -10, burstT: 0,
      lastJudge: { kind: null, at: -10, beat: -1 },
      obstacles, orbSlots, plans: [], spawnedThroughBeat: -1, spawnSkipped: 0, rngCount: 0
    };
  }

  /** Start/restart: resets pose, hold/drag state and the counted stream (C4). Popup seq stays monotonic (C2). */
  begin(): void {
    const next = this.freshState("playing");
    Object.assign(this.o, next);
    this.rng = new GameRng(this.seed);
    this.genLastBeat = -10;
    this.genLastType = "bar";
    this.genLastWall = -10;
  }

  private popup(text: string, color: string, size: number): void {
    this.popups.push({ n: this.popups.length, seq: this.seq++, text, color, size, at: this.o.t });
    if (this.popups.length > POPUP_LIMIT) this.popups.splice(0, this.popups.length - POPUP_LIMIT);
  }

  /**
   * Seeded 32-beat phrase: density ramps one-per-2-beats → one-per-beat; hop→hop keeps ≥2 beats (airtime).
   * Lanes ramp too: phrase 0 is mostly full-width hops/ducks plus single-lane walls; later phrases narrow the
   * hop/duck rows and widen walls to two lanes. Walls never span all three lanes and keep ≥2 beats between them.
   * Orbs ride free lanes of walls and empty beats so moving pays.
   */
  private generatePlan(index: number): PhrasePlan {
    const cells: (PlanCell | null)[] = new Array(CONFIG.BEATS_PER_PHRASE).fill(null);
    const orbs: (number | null)[] = new Array(CONFIG.BEATS_PER_PHRASE).fill(null);
    const base = index * CONFIG.BEATS_PER_PHRASE;
    const rng = this.rng;
    const pickLane = (): number => (LANES[Math.min(2, Math.floor(rng.next() * 3))] as number);
    let b = index === 0 ? CONFIG.FIRST_OBSTACLE_BEAT : 0;
    while (b < CONFIG.BEATS_PER_PHRASE) {
      const absBeat = base + b;
      if (absBeat - this.genLastBeat >= 1) {
        const r = rng.next();
        const wallChance = index === 0 ? 0.22 : 0.3;
        let type: ObstacleType = r < wallChance ? "wall" : r < wallChance + (1 - wallChance) * 0.38 ? "gap" : r < wallChance + (1 - wallChance) * 0.68 ? "block" : "bar";
        if (type === "wall" && absBeat - this.genLastWall < 2) type = "bar";
        const hop = isHop(this.genLastType);
        if (hop && isHop(type) && absBeat - this.genLastBeat < 2) type = "bar";
        let lanes: number;
        if (type === "wall") {
          const two = index >= 1 && rng.next() < Math.min(0.6, 0.2 + 0.1 * index);
          const free = pickLane();
          lanes = two ? ALL_LANES & ~laneBit(free) : laneBit(pickLane());
          this.genLastWall = absBeat;
          const open = freeLanes(lanes);
          if (rng.next() < 0.6) orbs[b] = open[Math.min(open.length - 1, Math.floor(rng.next() * open.length))] as number;
        } else {
          const full = rng.next() < Math.max(0.35, 0.8 - 0.1 * index);
          if (full) lanes = ALL_LANES;
          else lanes = rng.next() < 0.5 ? ALL_LANES & ~laneBit(pickLane()) : laneBit(pickLane());
        }
        cells[b] = { type, lanes };
        this.genLastBeat = absBeat;
        this.genLastType = type;
      }
      let step = 2;
      if (index >= 4) step = 1;
      else if (index >= 2) step = rng.next() < 0.5 ? 1 : 2;
      // An empty off-beat between two rows may carry an orb.
      if (step === 2 && b + 1 < CONFIG.BEATS_PER_PHRASE && rng.next() < 0.45) orbs[b + 1] = pickLane();
      b += step;
    }
    return { index, cells, orbs };
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
      const cell = plan.cells[b % CONFIG.BEATS_PER_PHRASE];
      if (cell) {
        const slot = o.obstacles.find((s) => !s.active);
        if (slot) {
          slot.active = true;
          slot.beat = b;
          slot.type = cell.type;
          slot.lanes = cell.lanes;
          slot.crossTime = b * CONFIG.BEAT;
          slot.resolved = false;
          slot.judgement = null;
        } else {
          o.spawnSkipped++;
        }
      }
      const orbLane = plan.orbs[b % CONFIG.BEATS_PER_PHRASE];
      if (orbLane !== null && orbLane !== undefined) {
        const orb = o.orbSlots.find((s) => !s.active);
        if (orb) {
          orb.active = true;
          orb.beat = b;
          orb.lane = orbLane;
          orb.crossTime = b * CONFIG.BEAT;
          orb.collected = false;
          orb.resolved = false;
        }
      }
      o.spawnedThroughBeat = b;
    }
  }

  private collect(orb: OrbSlot): void {
    const o = this.o;
    orb.resolved = true;
    if (laneAt(o.laneOffset) !== orb.lane) return;
    orb.collected = true;
    o.orbs++;
    o.combo++;
    o.maxCombo = Math.max(o.maxCombo, o.combo);
    o.mult = Math.min(CONFIG.MAX_MULT, 1 + Math.floor(o.combo / CONFIG.COMBO_PER_MULT));
    const pts = CONFIG.POINTS_ORB * o.mult;
    o.score += pts;
    this.popup(`+${pts}`, "#b4f8ff", 0.85);
    this.milestoneCheck();
  }

  private milestoneCheck(): void {
    const o = this.o;
    while (o.score >= o.milestoneTarget) {
      o.score += CONFIG.MILESTONE_BONUS;
      o.milestoneTarget += CONFIG.MILESTONE;
      o.milestones++;
      this.popup(`+${CONFIG.MILESTONE_BONUS} BONUS`, "#ffd166", 1.35);
    }
  }

  private judge(slot: ObstacleSlot): void {
    const o = this.o;
    slot.resolved = true;
    const blocked = (slot.lanes & laneBit(laneAt(o.laneOffset))) !== 0;
    let kind: Judgement = "miss";
    if (slot.type === "wall") {
      kind = blocked ? "miss" : "dodge";
    } else {
      const ideal = idealMoment(slot.type, slot.crossTime);
      const poseOk = slot.type === "bar" ? o.pose === "duck" : o.pose === "air";
      const actionStart = slot.type === "bar" ? o.duckStart : o.airStart;
      const delta = Math.abs(actionStart - ideal);
      if (poseOk && delta <= CONFIG.GOOD_WINDOW) {
        kind = delta <= CONFIG.PERFECT_WINDOW ? "perfect" : "good";
      } else if (!blocked) {
        kind = "clear";
      }
    }
    slot.judgement = kind;
    if (kind === "clear") return;
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
      const base = kind === "perfect" ? CONFIG.POINTS_PERFECT : kind === "good" ? CONFIG.POINTS_GOOD : CONFIG.POINTS_DODGE;
      const pts = base * o.mult;
      o.score += pts;
      if (kind === "perfect") {
        o.perfect++;
        this.popup(`PERFECT +${pts}`, "#ffd166", 1.25);
      } else if (kind === "good") {
        o.good++;
        this.popup(`GOOD +${pts}`, "#5eead4", 1);
      } else {
        o.dodges++;
        this.popup(`DODGE +${pts}`, "#c9a7ff", 1);
      }
      this.milestoneCheck();
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

    // Steering: whole-lane steps (keys) and drag travel while pressed. A press whose drag travel passes the tap slop
    // becomes a steer gesture: it stops counting as a tap (no hop on release) or a hold (no duck). The step's drag
    // belongs to whichever press is live: the one being released this step, else the one starting this step (a fast
    // flick's first movement often lands in the same frame as its press and must still steer).
    if (input.lane !== 0) o.lane = Math.max(-1, Math.min(1, o.lane + Math.round(input.lane)));
    let dragDone = false;
    const drag = (): void => {
      dragDone = true;
      if (input.dx === 0 || !o.holding) return;
      o.dragTravel += Math.abs(input.dx);
      o.dragAcc += input.dx;
      if (o.dragTravel > CONFIG.TAP_SLOP_PX && !o.steering) {
        o.steering = true;
        if (o.pose !== "duck") o.holdT = 0;
      }
      while (Math.abs(o.dragAcc) >= CONFIG.LANE_SWIPE_PX) {
        const dir = Math.sign(o.dragAcc);
        o.lane = Math.max(-1, Math.min(1, o.lane + dir));
        o.dragAcc -= dir * CONFIG.LANE_SWIPE_PX;
      }
    };

    const hop = (): void => {
      o.pose = "air";
      o.vy = CONFIG.JUMP_VY;
      o.airStart = o.t;
      o.hopQueuedAt = -10;
    };

    // Input: release first so a duck can end and a fresh tap can start in the same frame.
    if (input.up) {
      if (o.holding) drag();
      const wasTap = o.holding && !o.steering && o.holdT < CONFIG.DUCK_HOLD;
      o.holding = false;
      o.steering = false;
      o.dragAcc = 0;
      o.dragTravel = 0;
      if (o.pose === "duck") {
        o.pose = "grounded";
      } else if (wasTap && o.pose === "grounded") {
        hop();
      } else if (wasTap && o.pose === "air") {
        o.hopQueuedAt = o.t;
      }
      o.holdT = 0;
    }
    if (input.down && !o.holding) {
      o.holding = true;
      // A dedicated duck key skips the tap/hold discrimination: it ducks this step and its release never hops.
      o.holdT = input.duck ? CONFIG.DUCK_HOLD : 0;
    }
    if (input.hop) {
      if (o.pose === "air") o.hopQueuedAt = o.t;
      else hop();
    }
    if (!dragDone) drag();
    if (o.holding && !o.steering) o.holdT += CONFIG.DT;
    const targetX = laneX(o.lane);
    const step = CONFIG.LANE_SPEED * CONFIG.DT;
    o.laneOffset = Math.abs(targetX - o.laneOffset) <= step ? targetX : o.laneOffset + Math.sign(targetX - o.laneOffset) * step;

    // Pose physics.
    if (o.pose === "air") {
      o.vy -= CONFIG.GRAVITY * CONFIG.DT;
      o.y += o.vy * CONFIG.DT;
      if (o.y <= 0) {
        o.y = 0;
        o.vy = 0;
        if (o.t - o.hopQueuedAt <= CONFIG.JUMP_BUFFER + 1e-9) {
          // A buffered press: hop again on the landing step (judged from this actual hop start).
          hop();
        } else if (o.holding && o.holdT >= CONFIG.DUCK_HOLD) {
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
    for (const orb of o.orbSlots) {
      if (!orb.active) continue;
      if (!orb.resolved && o.t + 1e-9 >= orb.crossTime) this.collect(orb);
      if (o.t > orb.crossTime + 2 * CONFIG.BEAT) orb.active = false;
    }
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
      o.y, o.vy, o.dist, o.perfect, o.good, o.miss, o.milestones, o.rngCount,
      o.lane, o.laneOffset, o.dodges, o.orbs
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