/**
 * Shape Shift Sprint simulation: pure per-frame game logic (SplatSiblings PRD §3.1 + §3.2).
 * No DOM, no engine imports except the kit's counted GameRng. Fixed 1/60 s steps.
 *
 * - Every gameplay draw comes from the counted RNG stream; presentation jitter must use its own stream.
 * - Wall rows carry all three shaped holes in a Fisher-Yates-shuffled lane order, so exactly one hole
 *   always matches the player's current shape, even after a morph token (existing walls keep their holes).
 * - Rows resolve exactly once against the nearest hole (audit fix C16); begin() re-centres steering
 *   target AND drag state (audit fix C4); popups keep the last 64 with a monotonic seq.
 */
import { GameRng, POPUP_LIMIT, type Popup } from "../../../examples/shared/runner-kit/index";

export const CONFIG = {
  SHAPES: ["sphere", "cube", "cone"],
  LANES: [-2.3, 0, 2.3],
  BALL_RADIUS: 0.55,
  LANE_HALF_WIDTH: 3,
  SPEED_INIT: 16,
  MAX_SPEED: 29,
  SPEED_INCREMENT: 0.26,
  STEER_SPEED: 10,
  ROW_SPACING: 15,
  ROW_SPACING_MIN: 13,
  ROW_SPACING_DECAY: 7e-3,
  SPAWN_AHEAD: 110,
  FIRST_ROW_Z: -48,
  HIT_WINDOW: 1.2,
  PERFECT_WINDOW: 0.55,
  POINTS_GATE: 40,
  POINTS_PERFECT: 60,
  MAX_MULT: 5,
  COMBO_PER_MULT: 3,
  MAX_LIVES: 3,
  SHRINK: 0.8,
  GROW: 1.1,
  PERFECT_GROW: 1.15,
  SCALE_CAP: 1.6,
  SCALE_FLOOR: 0.4,
  MATCH_SPEED_BONUS: 0.3,
  PERFECT_SPEED_BONUS: 0.45,
  WILDCARD_DURATION: 5,
  X2_DURATION: 7,
  TOKEN_SPAWN_P: 0.2,
  MILESTONE: 750,
  MILESTONE_BONUS: 100,
  BURST_DURATION: 1.15,
  SEGMENT_LENGTH: 2,
  ROAD_AHEAD: 220,
  SHAPE_COLORS: ["#e8453c", "#f7c531", "#2f6fe4"]
} as const;

export const POOL = { segments: 220, rows: 10, tokens: 10, particles: 90 } as const;
export const DT = 1 / 60;

export type Phase = "splash" | "playing" | "bursting" | "gameOver";
export const PHASE_CODE: Record<Phase, number> = { splash: 0, playing: 1, bursting: 2, gameOver: 3 };

export interface Input {
  start: boolean;
  down: boolean;
  up: boolean;
  dx: number;
  tap: boolean;
}
export const IDLE: Input = { start: false, down: false, up: false, dx: 0, tap: false };

export type TokenType = "morph" | "wildcard" | "shield" | "x2";
export const TOKEN_TYPES: readonly TokenType[] = ["morph", "wildcard", "shield", "x2"];

export interface Hole { laneX: number; shapeIndex: number }
export interface WallRow { z: number; row: number; holes: Hole[]; resolved: boolean; matchedLane: number; matchedShape: number }
export interface Token { z: number; laneX: number; baseY: number; y: number; type: TokenType; taken: boolean }
export interface Segment { z: number; index: number }
export interface Particle {
  visible: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; life: number; max: number; scale: number; color: string;
}

export interface GameState {
  phase: Phase;
  score: number;
  distance: number;
  lives: number;
  speed: number;
  laneOffset: number;
  shapeIndex: number;
  wildcardTimer: number;
  shieldActive: boolean;
  scoreX2Timer: number;
  ballScale: number;
  combo: number;
  multiplier: number;
  milestone: number;
  squashT: number;
  shakeTimer: number;
  frameCount: number;
  introT: number;
  burstT: number;
  fovPunch: number;
  matches: number;
  perfects: number;
  morphs: number;
}

export const TRACE_COLUMNS = [
  "n", "score", "distance", "speed", "lives", "combo", "multiplier", "laneOffset", "shapeIndex", "ballScale",
  "wildcardTimer", "shieldActive", "scoreX2Timer", "phase", "squashT", "shakeTimer", "milestone", "rngCount",
  "walls", "tokens", "segments", "particles"
] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const bool = (v: boolean): number => (v ? 1 : 0);

function initialState(): GameState {
  return {
    phase: "splash", score: 0, distance: 0, lives: CONFIG.MAX_LIVES, speed: CONFIG.SPEED_INIT,
    laneOffset: 0, shapeIndex: 0, wildcardTimer: 0, shieldActive: false, scoreX2Timer: 0, ballScale: 1,
    combo: 0, multiplier: 1, milestone: 0, squashT: 0, shakeTimer: 0, frameCount: 0,
    introT: 0, burstT: 0, fovPunch: 0, matches: 0, perfects: 0, morphs: 0
  };
}

export class ShapeShiftSim {
  readonly rng: GameRng;
  readonly o: GameState = initialState();
  readonly popups: Popup[] = [];

  rows: WallRow[] = [];
  tokens: Token[] = [];
  segments: Segment[] = [];
  readonly particles: Particle[] = [];

  player = { x: 0, y: CONFIG.BALL_RADIUS, z: 0, rotX: 0, scale: 1, visible: true };
  /** Private steering target and pointer drag state (reset by begin(), audit fix C4). */
  ye = 0;
  dragging = false;
  /** Monotonic popup sequence; never reset, list keeps the last POPUP_LIMIT entries. */
  popupSeq = 0;
  /** Total road scroll since construction; a road entity's z minus scroll is constant for its life. Never reset. */
  scroll = 0;
  /** Sim seconds since construction (popup timestamps). */
  elapsed = 0;
  shieldPulse = 0;

  private rowCounter = 0;
  private segmentCounter = 0;
  private lastRowZ = 0;
  private lastSegmentZ = 0;

  constructor(seed: number) {
    this.rng = new GameRng(seed);
    for (let i = 0; i < POOL.particles; i++) {
      this.particles.push({ visible: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, scale: 0, color: "#ffffff" });
    }
  }

  /** Start or restart: full state reset, steering target AND drag state re-centred (C4). */
  begin(): void {
    const fresh = initialState();
    Object.assign(this.o, fresh);
    this.o.phase = "playing";
    this.rows = [];
    this.tokens = [];
    this.segments = [];
    for (const p of this.particles) p.visible = false;
    this.ye = 0;
    this.dragging = false;
    this.player.x = 0;
    this.player.y = CONFIG.BALL_RADIUS;
    this.player.rotX = 0;
    this.player.scale = 1;
    this.player.visible = true;
    this.shieldPulse = 0;
    this.lastRowZ = CONFIG.FIRST_ROW_Z + this.rowSpacing();
    this.lastSegmentZ = 20;
    this.fillRoad();
    this.fillRows();
  }

  private rowSpacing(): number {
    return Math.max(CONFIG.ROW_SPACING_MIN, CONFIG.ROW_SPACING - CONFIG.ROW_SPACING_DECAY * this.o.distance);
  }

  private fillRoad(): void {
    while (this.lastSegmentZ > -CONFIG.ROAD_AHEAD) {
      if (this.segments.length >= POOL.segments) break; // pool exhaustion: skip spawn (and its draws)
      this.lastSegmentZ -= CONFIG.SEGMENT_LENGTH;
      this.segments.push({ z: this.lastSegmentZ, index: this.segmentCounter++ });
    }
  }

  private fillRows(): void {
    while (this.lastRowZ > -CONFIG.SPAWN_AHEAD) {
      if (this.rows.length >= POOL.rows) break; // pool exhaustion: skip spawn (and its draws)
      const spacing = this.rowSpacing();
      this.lastRowZ -= spacing;
      this.spawnRow(this.lastRowZ, spacing);
    }
  }

  private spawnRow(z: number, spacing: number): void {
    // All three shapes, Fisher-Yates-shuffled lane order: exactly one hole matches any shape by construction.
    const shapes = [0, 1, 2];
    for (let i = shapes.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const tmp = shapes[i] as number;
      shapes[i] = shapes[j] as number;
      shapes[j] = tmp;
    }
    const holes: Hole[] = CONFIG.LANES.map((laneX, i) => ({ laneX, shapeIndex: shapes[i] as number }));
    this.rows.push({ z, row: this.rowCounter++, holes, resolved: false, matchedLane: -1, matchedShape: -1 });
    if (this.rng.next() < CONFIG.TOKEN_SPAWN_P && this.tokens.length < POOL.tokens) {
      const type = TOKEN_TYPES[Math.floor(this.rng.next() * TOKEN_TYPES.length)] as TokenType;
      const laneX = CONFIG.LANES[Math.floor(this.rng.next() * CONFIG.LANES.length)] as number;
      this.tokens.push({ z: z + spacing * 0.5, laneX, baseY: 0.9, y: 0.9, type, taken: false });
    }
  }

  private popup(text: string, color: string, size: number): void {
    this.popups.push({ n: this.o.frameCount, seq: this.popupSeq++, text, color, size, at: this.elapsed });
    if (this.popups.length > POPUP_LIMIT) this.popups.splice(0, this.popups.length - POPUP_LIMIT);
  }

  private burst(x: number, y: number, z: number, count: number, colors: readonly string[], power: number): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.visible) continue; // pool exhaustion: skip spawn (and its draws)
      p.visible = true;
      p.x = x; p.y = y; p.z = z;
      const a = this.rng.next() * Math.PI * 2;
      const r = (0.4 + this.rng.next() * 0.6) * power;
      p.vx = Math.cos(a) * r;
      p.vz = Math.sin(a) * r * 0.6;
      p.vy = (0.8 + this.rng.next() * 1.4) * power;
      p.max = 0.5 + this.rng.next() * 0.5;
      p.life = p.max;
      p.scale = 0.08 + this.rng.next() * 0.14;
      p.color = colors[Math.floor(this.rng.next() * colors.length)] as string;
      spawned++;
    }
  }

  advance(input: Input = IDLE): void {
    const o = this.o;
    o.frameCount++;
    this.elapsed += DT;
    if (input.start && (o.phase === "splash" || o.phase === "gameOver")) this.begin();

    if (o.phase === "playing") {
      // Steering: drag dx moves the private target; keyboard synthesizes dx upstream (C4 model).
      if (input.down) this.dragging = true;
      if (input.up) this.dragging = false;
      if (input.dx !== 0) this.ye = clamp(this.ye + input.dx, -CONFIG.LANE_HALF_WIDTH, CONFIG.LANE_HALF_WIDTH);
      o.laneOffset += (this.ye - o.laneOffset) * Math.min(1, CONFIG.STEER_SPEED * DT);

      o.speed = Math.min(CONFIG.MAX_SPEED, o.speed + CONFIG.SPEED_INCREMENT * DT);
      const move = o.speed * DT;
      o.distance += move;
      this.scroll += move;
      o.introT = Math.min(2, o.introT + DT);
      o.wildcardTimer = Math.max(0, o.wildcardTimer - DT);
      o.scoreX2Timer = Math.max(0, o.scoreX2Timer - DT);
      o.squashT = Math.max(0, o.squashT - DT);
      o.shakeTimer = Math.max(0, o.shakeTimer - DT);
      o.fovPunch = Math.max(0, o.fovPunch - DT * 2);
      this.shieldPulse += DT;

      this.lastRowZ += move;
      this.lastSegmentZ += move;
      for (const row of this.rows) row.z += move;
      for (const t of this.tokens) {
        t.z += move;
        t.y = t.baseY + Math.sin(this.elapsed * 3 + t.laneX) * 0.12;
      }
      for (const s of this.segments) s.z += move;
      this.rows = this.rows.filter((r) => r.z < 14);
      this.tokens = this.tokens.filter((t) => t.z < 14 && !t.taken);
      this.segments = this.segments.filter((s) => s.z < 22);

      this.resolveTokens();
      this.resolveRows();
      this.fillRoad();
      this.fillRows();
      this.checkMilestone();

      this.player.x = o.laneOffset;
      this.player.rotX -= move / (CONFIG.BALL_RADIUS * o.ballScale);
      this.player.scale = o.ballScale * (1 - 0.25 * Math.sin(Math.min(1, o.squashT / 0.25) * Math.PI));
    } else if (o.phase === "bursting") {
      o.burstT -= DT;
      o.shakeTimer = Math.max(0, o.shakeTimer - DT);
      if (o.burstT <= 0) {
        o.phase = "gameOver";
        this.player.visible = false;
      }
    }

    this.updateParticles();
  }

  private resolveTokens(): void {
    const o = this.o;
    for (const t of this.tokens) {
      if (t.taken || t.z < 0) continue;
      t.taken = true;
      if (Math.abs(o.laneOffset - t.laneX) >= CONFIG.HIT_WINDOW) continue;
      if (t.type === "morph") {
        const delta = 1 + Math.floor(this.rng.next() * (CONFIG.SHAPES.length - 1));
        o.shapeIndex = (o.shapeIndex + delta) % CONFIG.SHAPES.length;
        o.morphs++;
        this.popup("MORPH!", CONFIG.SHAPE_COLORS[o.shapeIndex] as string, 1.2);
        this.burst(this.player.x, this.player.y, 0, 16, CONFIG.SHAPE_COLORS, 3.2);
      } else if (t.type === "wildcard") {
        o.wildcardTimer = CONFIG.WILDCARD_DURATION;
        this.popup("ANY SHAPE!", "#b45ae8", 1.15);
      } else if (t.type === "shield") {
        o.shieldActive = true;
        this.popup("SHIELD", "#39c6a5", 1.1);
      } else {
        o.scoreX2Timer = CONFIG.X2_DURATION;
        this.popup("x2 SCORE!", "#f2a516", 1.15);
      }
    }
  }

  /** Nearest-hole, resolve-once-per-row judgement (C16). */
  private resolveRows(): void {
    const o = this.o;
    for (const row of this.rows) {
      if (row.resolved || row.z < 0) continue;
      row.resolved = true;
      let nearest = row.holes[0] as Hole;
      for (const h of row.holes) {
        if (Math.abs(o.laneOffset - h.laneX) < Math.abs(o.laneOffset - nearest.laneX)) nearest = h;
      }
      const offset = Math.abs(o.laneOffset - nearest.laneX);
      const fits = nearest.shapeIndex === o.shapeIndex || o.wildcardTimer > 0;
      if (offset < CONFIG.HIT_WINDOW && fits) {
        const perfect = offset < CONFIG.PERFECT_WINDOW;
        const x2 = o.scoreX2Timer > 0 ? 2 : 1;
        const points = (perfect ? CONFIG.POINTS_PERFECT : CONFIG.POINTS_GATE) * o.multiplier * x2;
        o.score += points;
        o.combo++;
        o.multiplier = Math.min(CONFIG.MAX_MULT, 1 + Math.floor(o.combo / CONFIG.COMBO_PER_MULT));
        o.matches++;
        if (perfect) o.perfects++;
        o.ballScale = Math.min(CONFIG.SCALE_CAP, o.ballScale * (perfect ? CONFIG.PERFECT_GROW : CONFIG.GROW));
        o.speed = Math.min(CONFIG.MAX_SPEED, o.speed + (perfect ? CONFIG.PERFECT_SPEED_BONUS : CONFIG.MATCH_SPEED_BONUS));
        o.squashT = 0.25;
        row.matchedLane = CONFIG.LANES.indexOf(nearest.laneX as (typeof CONFIG.LANES)[number]);
        row.matchedShape = o.shapeIndex;
        this.popup(perfect ? `PERFECT +${points}` : `+${points}`, perfect ? "#f2a516" : "#39c6a5", perfect ? 1.25 : 1);
        this.burst(nearest.laneX, 1, row.z, perfect ? 12 : 7, CONFIG.SHAPE_COLORS, perfect ? 2.6 : 1.9);
      } else if (o.shieldActive) {
        o.shieldActive = false;
        this.popup("BLOCKED", "#39c6a5", 1.1);
        o.squashT = 0.25;
      } else {
        o.lives--;
        o.ballScale = Math.max(CONFIG.SCALE_FLOOR, o.ballScale * CONFIG.SHRINK);
        o.combo = 0;
        o.multiplier = 1;
        o.shakeTimer = 0.4;
        this.popup("OUCH!", "#e8453c", 1.2);
        if (o.lives <= 0) {
          o.phase = "bursting";
          o.burstT = CONFIG.BURST_DURATION;
          this.burst(this.player.x, this.player.y, 0, 28, CONFIG.SHAPE_COLORS, 4);
        }
      }
    }
  }

  private checkMilestone(): void {
    const o = this.o;
    while (o.score >= (o.milestone + 1) * CONFIG.MILESTONE) {
      o.milestone++;
      o.score += CONFIG.MILESTONE_BONUS;
      o.fovPunch = 1;
      this.popup(`MILESTONE +${CONFIG.MILESTONE_BONUS}`, "#f2a516", 1.35);
      this.burst(this.player.x, this.player.y + 0.5, 0, 20, ["#f2a516", "#ffe9a8", "#ffffff"], 3.4);
    }
  }

  private updateParticles(): void {
    for (const p of this.particles) {
      if (!p.visible) continue;
      p.life -= DT;
      if (p.life <= 0) {
        p.visible = false;
        continue;
      }
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.z += p.vz * DT;
      p.vy -= 9 * DT;
    }
  }

  traceRow(index: number): number[] {
    const o = this.o;
    return [
      index, o.score, o.distance, o.speed, o.lives, o.combo, o.multiplier, o.laneOffset, o.shapeIndex, o.ballScale,
      o.wildcardTimer, bool(o.shieldActive), o.scoreX2Timer, PHASE_CODE[o.phase], o.squashT, o.shakeTimer, o.milestone,
      this.rng.count, this.rows.length * 3, this.tokens.length, this.segments.length,
      this.particles.reduce((n, p) => n + (p.visible ? 1 : 0), 0)
    ];
  }
}

/** Deterministic scripted replay: `warmup` idle steps, then one step per input; trace covers every step. */
export function replay(seed: number, warmup: number, inputs: readonly Input[]): { sim: ShapeShiftSim; trace: number[][] } {
  const sim = new ShapeShiftSim(seed);
  const trace: number[][] = [];
  const total = warmup + inputs.length;
  for (let i = 0; i < total; i++) {
    sim.advance(i < warmup ? IDLE : (inputs[i - warmup] as Input));
    trace.push(sim.traceRow(i));
  }
  return { sim, trace };
}