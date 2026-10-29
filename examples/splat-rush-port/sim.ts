/**
 * Splat Rush simulation: a pure, framework-free port of the original game's per-frame logic
 * (tests/fixtures/crayon/splat-rush/game-module.formatted.js). No DOM, no three.js, no engine imports.
 *
 * Fidelity contract (verified by tests/unit/splat-rush-port against evidence/crayon-capture/splat-rush-reference.json):
 * - fixed step: frame n uses dt = (virtualNow(n) - virtualNow(n - 1)) / 1000 exactly like three's `Clock`
 *   under the capture's virtual `performance.now`; the module-eval frame (n = 0) has dt 0;
 * - the random stream is consumed in the original's order: canvas textures, cloud and streak seeds at init,
 *   then per frame: splatter trail, gate rows and power-ups, particles, popups, camera shake, streak and
 *   cloud respawns. Object pools (20 splatters, 30 gates, 10 power-ups, 90 particles, 220 segments) skip
 *   spawns, and therefore skip random draws, when exhausted, exactly as the original does;
 * - every state field the trace records is reproduced (score, speed, lives, combo, camera, counts, ...).
 */
import { GameRng } from "./rng";

export const CONFIG = {
  BALL_RADIUS: 0.55,
  FORWARD_SPEED_INIT: 16,
  MAX_SPEED: 29,
  SPEED_INCREMENT: 0.26,
  STEER_SPEED: 10,
  LANE_HALF_WIDTH: 3,
  GATE_SPACING: 15,
  SHRINK_FACTOR: 0.8,
  GROW_FACTOR: 1.1,
  MAX_LIVES: 3,
  RAINBOW_DURATION: 5,
  TRAIL_DURATION: 6,
  SCORE_PER_METER: 1,
  SEGMENT_LENGTH: 1,
  CURVE_AMPLITUDE: 3,
  PALETTE: ["#f0433a", "#f9c647", "#5ecaf0", "#b868e8", "#fdf0e0"],
  POINTS_GATE: 40,
  POINTS_PERFECT: 60,
  PERFECT_WINDOW: 0.55,
  MAX_MULT: 5,
  COMBO_PER_MULT: 3,
  SCOREX2_DURATION: 7,
  MILESTONE_SCORE: 750
} as const;

export const COLORS = CONFIG.PALETTE.slice(0, 4) as readonly string[];
export const STEP_MS = 1000 / 60;
export const BASE_MS = 1000;
export const virtualNow = (n: number): number => BASE_MS + n * STEP_MS;

/** Pool sizes of the original (`ie.*` object pools and the particle pool). */
export const POOL = { segments: 220, gates: 30, splatters: 20, powerups: 10, particles: 90 } as const;

export type Phase = "splash" | "playing" | "bursting" | "gameOver";
export const PHASE_CODE: Record<Phase, number> = { splash: 0, playing: 1, bursting: 2, gameOver: 3 };

export interface Input {
  start: boolean;
  down: boolean;
  up: boolean;
  dx: number;
}
export const IDLE: Input = { start: false, down: false, up: false, dx: 0 };

export interface GameState {
  phase: Phase;
  score: number;
  distance: number;
  lives: number;
  speed: number;
  laneOffset: number;
  rainbowTimer: number;
  trailTimer: number;
  scoreX2Timer: number;
  scoreX2Active: boolean;
  shieldActive: boolean;
  milestone: number;
  squashT: number;
  frameCount: number;
  segmentCounter: number;
  lastSegmentZ: number;
  lastGateZ: number;
  playerColorIndex: number;
  ballScale: number;
  shakeTimer: number;
  isRainbowActive: boolean;
  _rainbowVisual: boolean;
  combo: number;
  multiplier: number;
  introT: number;
  burstT: number;
  _fovPunch: number;
  _fovApplied: number;
}

export interface Segment { z: number; x: number; index: number }
/** `row` groups the three gates spawned together (presentation and nearest-gate resolution only; not in the trace). */
export interface Gate { z: number; x: number; laneX: number; colorIndex: number; passed: boolean; row: number }
export interface Powerup { z: number; x: number; y: number; laneX: number; baseY: number; type: "rainbow" | "shield" | "x2" | "switch" }
export interface Splatter { x: number; y: number; z: number; rotY: number; scale: number; targetScale: number; laneX: number; colorIndex: number }
export interface Particle { visible: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s0: number; scale: number; color: string }
export interface Cloud { x: number; y: number; z: number; s: number; r: number }
export interface Streak { x: number; y: number; z: number; speed: number }
/** `seq` counts every popup ever created on this sim (monotonic, never reset, not in the trace); the HUD drains by it. */
export interface Popup { n: number; seq: number; text: string; color: string; size: number; at: number }

/** Values drawn for the two canvas textures, in draw order, so the renderer can paint identical canvases. */
export interface TexturePaint {
  /** 60 ellipses: x, y, rx, ry, rotation, as fractions of one draw each (already scaled like the original). */
  ball: number[][];
  speckles: number[][];
  blobs: { x: number; y: number; r: number; colorIndex: number; lobes: number[][] }[];
}

/** Column order of every trace row; identical to `TRACE_FIELDS` in tools/crayon-capture/splat-rush-lib.ts (a test asserts it). */
export const TRACE_COLUMNS = [
  "n", "score", "distance", "speed", "lives", "combo", "multiplier", "laneOffset", "playerColorIndex", "ballScale", "rainbowTimer",
  "shieldActive", "scoreX2Timer", "phase", "squashT", "shakeTimer", "milestone", "rngCount", "px", "py", "pz", "camx", "camy", "camz",
  "gates", "powerups", "splatters", "segments"
] as const;

export const curve = (z: number): number => Math.sin(0.04 * z) * CONFIG.CURVE_AMPLITUDE;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export class SplatRushSim {
  readonly rng: GameRng;
  readonly o: GameState;
  readonly popups: Popup[] = [];
  readonly paint: TexturePaint = { ball: [], speckles: [], blobs: [] };

  segments: Segment[] = [];
  gates: Gate[] = [];
  powerups: Powerup[] = [];
  splatters: Splatter[] = [];
  readonly particles: Particle[] = [];
  readonly clouds: Cloud[] = []; // 30 high, then 26 low
  readonly streaks: Streak[] = [];

  /** player ball: position, rotation.x, and render scale. */
  player: { x: number; y: number; z: number; rotX: number; scale: number; visible: boolean } = { x: 0, y: CONFIG.BALL_RADIUS, z: 0, rotX: 0, scale: 1, visible: true };
  camera = { x: 0, y: 15, z: 18, lookX: 0, lookY: 0, lookZ: 0 };
  /** shield bubble pulse timer (`ne` in the original). */
  shieldPulse = 0;
  /** private steering target `ye` and pointer drag state. */
  ye = 0;
  dragging = false;
  /** Popups created so far (the `seq` of the next one). The list keeps the last 64; consumers read by `seq`, never by index. */
  popupSeq = 0;
  /** Gate rows spawned so far (the `row` id of the next row). */
  private gateRows = 0;
  /** Total cloud drift since construction: every cloud moves by the same amount per frame, so a cloud's z minus this is constant until it respawns. */
  cloudDrift = 0;
  /** Total road scroll since construction (the sum of every step's `move`): a road entity's z minus this is constant for
   * its whole life, so the renderer can keep it in a scrolling frame and upload it once. Never reset, not in the trace. */
  scroll = 0;
  /** virtual frame index n of the frame that ran last (0 = the module-eval frame). */
  n = 0;
  /** three.Clock emulation. */
  elapsed = 0;
  private oldTime = BASE_MS;
  private vignette = 0;

  constructor(seed: number) {
    this.rng = new GameRng(seed);
    this.o = {
      phase: "splash", score: 0, distance: 0, lives: 3, speed: CONFIG.FORWARD_SPEED_INIT, laneOffset: 0, rainbowTimer: 0, trailTimer: 0,
      scoreX2Timer: 0, scoreX2Active: false, shieldActive: false, milestone: CONFIG.MILESTONE_SCORE, squashT: 0, frameCount: 0, segmentCounter: 0,
      lastSegmentZ: 0, lastGateZ: -30, playerColorIndex: 0, ballScale: 1, shakeTimer: 0, isRainbowActive: false, _rainbowVisual: false,
      combo: 0, multiplier: 1, introT: 2, burstT: 0, _fovPunch: 0, _fovApplied: 0
    };
    for (let i = 0; i < POOL.particles; i++) this.particles.push({ visible: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, scale: 1, color: "#ffffff" });
    this.initDraws();
    // the module-eval frame: three's Clock starts and returns 0, so dt = 0 and elapsed = 0
    this.frame(0, 0);
  }

  /* ---------------------------------------------------------------- init draws */

  /** Consume the stream exactly like the module's top-level code (ball texture, clouds, streaks, ramp texture). */
  private initDraws(): void {
    const r = this.rng;
    // i(): paint-ball canvas texture, 60 ellipses
    for (let i = 0; i < 60; i++) this.paint.ball.push([256 * r.next(), 256 * r.next(), 30 * r.next() + 10, 10 * r.next() + 5, r.next() * Math.PI]);
    // cloud seeds Ie(true) x30 then Ie(false) x26
    for (let i = 0; i < 30; i++) this.clouds.push(this.cloud(true));
    for (let i = 0; i < 26; i++) this.clouds.push(this.cloud(false));
    // rain streak seeds
    for (let i = 0; i < 50; i++) this.streaks.push({ x: 40 * (r.next() - 0.5), y: 0.5 + 15 * r.next(), z: -20 - 80 * r.next(), speed: 40 + 30 * r.next() });
    // r(): ramp canvas texture: 120 speckles then 10 blobs of 6 lobes
    for (let i = 0; i < 120; i++) this.paint.speckles.push([512 * r.next(), 512 * r.next()]);
    for (let i = 0; i < 10; i++) {
      const x = 512 * r.next(), y = 512 * r.next(), rad = 6 + 14 * r.next();
      const colorIndex = Math.floor(r.next() * 4);
      const lobes: number[][] = [];
      for (let k = 0; k < 6; k++) lobes.push([rad * (0.7 + 0.6 * r.next()), rad * (0.7 + 0.6 * r.next())]);
      this.paint.blobs.push({ x, y, r: rad, colorIndex, lobes });
    }
  }

  private cloud(high: boolean): Cloud {
    const r = this.rng;
    if (high) {
      const x = (r.next() < 0.5 ? -1 : 1) * (26 + 70 * r.next());
      return { x, y: 6 + 26 * r.next(), z: 170 * r.next() - 140, s: 1.1 + 1.6 * r.next(), r: r.next() * Math.PI };
    }
    return { x: 130 * (r.next() - 0.5), y: -8 - 24 * r.next(), z: 170 * r.next() - 140, s: 1.4 + 2.2 * r.next(), r: r.next() * Math.PI };
  }

  /* ---------------------------------------------------------------- visual-state helpers that draw */

  private popup(text: string, color: string, size: number): void {
    const jitter = this.rng.next(); // popup x position: 0.42 + 0.16 * random
    this.popups.push({ n: this.n, seq: this.popupSeq++, text, color, size, at: 0.42 + 0.16 * jitter });
    if (this.popups.length > 64) this.popups.shift();
  }

  private fovPunch(v: number): void {
    this.o._fovPunch = Math.max(this.o._fovPunch || 0, v);
  }

  /** `ce`: spawn up to `count` particles into free pool slots (6 draws each). */
  private burst(x: number, y: number, z: number, color: string, count: number, power: number): void {
    const r = this.rng;
    let made = 0;
    for (let i = 0; i < this.particles.length && made < count; i++) {
      const p = this.particles[i] as Particle;
      if (p.visible) continue;
      made++;
      p.color = color;
      p.visible = true;
      p.x = x;
      p.y = y + 0.3;
      p.z = z;
      const angle = r.next() * Math.PI * 2;
      p.vx = Math.cos(angle) * power * (0.6 + r.next());
      p.vy = (2 + 3.5 * r.next()) * (0.6 + 0.25 * power);
      p.vz = Math.sin(angle) * power * (0.6 + r.next()) - 1.5;
      p.life = p.max = 0.55 + 0.35 * r.next();
      p.s0 = 0.7 + 0.9 * r.next();
      p.scale = p.s0;
    }
  }

  /* ---------------------------------------------------------------- spawners */

  private spawnSegment(z: number): void {
    if (this.segments.length >= POOL.segments) return;
    this.segments.push({ z, x: 0, index: this.o.segmentCounter++ });
  }

  /** `$e`: one row of three gates; exactly one matches the ball colour. */
  private spawnGateRow(z: number): void {
    const r = this.rng;
    const match = Math.floor(3 * r.next());
    const lanes = [-2.3, 0, 2.3];
    const row = this.gateRows++;
    for (let a = 0; a < 3; a++) {
      if (this.gates.length >= POOL.gates) continue;
      let colorIndex = this.o.playerColorIndex;
      if (a !== match) {
        do colorIndex = Math.floor(4 * r.next());
        while (colorIndex === this.o.playerColorIndex);
      }
      this.gates.push({ z, x: 0, laneX: lanes[a] as number, colorIndex, passed: false, row });
    }
  }

  /** `je`: a power-up (type then lane draw). */
  private spawnPowerup(z: number): void {
    if (this.powerups.length >= POOL.powerups) return;
    const r = this.rng;
    const t = r.next();
    const type: Powerup["type"] = t < 0.3 ? "rainbow" : t < 0.54 ? "shield" : t < 0.77 ? "x2" : "switch";
    const laneX = 4 * (r.next() - 0.5);
    this.powerups.push({ z, x: laneX + curve(-this.o.distance + z), y: 0.5, laneX, baseY: 0.5, type });
  }

  /** `Ke`: a paint splatter (rotation then target scale draw). */
  private spawnSplatter(x: number, z: number, colorIndex: number): void {
    if (this.splatters.length >= POOL.splatters) return;
    const r = this.rng;
    const rotY = r.next() * Math.PI * 2;
    const targetScale = 1 + 0.5 * r.next();
    this.splatters.push({ x, y: 0.05, z, rotY, scale: 0.1, targetScale, laneX: x - curve(-this.o.distance + z), colorIndex: Math.max(0, colorIndex) });
  }

  /* ---------------------------------------------------------------- input events (between frames) */

  /** Apply a step's pointer events, in the order the harness dispatches them (down, move, up). */
  applyInput(inp: Input): void {
    const o = this.o;
    if (inp.start || inp.down) {
      if (o.phase === "splash") this.begin();
      else if (o.phase !== "gameOver") this.dragging = true;
    }
    if (inp.dx && this.dragging && o.phase === "playing") {
      this.ye = clamp(this.ye + 0.012 * inp.dx * (CONFIG.STEER_SPEED / 6), -CONFIG.LANE_HALF_WIDTH, CONFIG.LANE_HALF_WIDTH);
    }
    if (inp.up) this.dragging = false;
  }

  /** `Ye`: start / restart a run. */
  begin(): void {
    const o = this.o;
    this.player.visible = true;
    this.shieldPulse = 0;
    o.score = 0; o.distance = 0; o.lives = CONFIG.MAX_LIVES; o.speed = CONFIG.FORWARD_SPEED_INIT; o.laneOffset = 0; o.rainbowTimer = 0;
    o.trailTimer = 0; o.scoreX2Timer = 0; o.scoreX2Active = false; o.shieldActive = false; o.milestone = CONFIG.MILESTONE_SCORE; o.squashT = 0;
    o.ballScale = 1; o.playerColorIndex = 0; o.shakeTimer = 0; o.combo = 0; o.multiplier = 1; o._rainbowVisual = false;
    this.player.scale = 1;
    // C4: a restart starts centred and not dragging (the original keeps the previous run's steering target; a run started
    // from the splash already has both at their initial values, so replays of the reference are unchanged)
    this.ye = 0;
    this.dragging = false;
    this.segments = []; this.gates = []; this.splatters = []; this.powerups = [];
    o.segmentCounter = 0;
    o.lastSegmentZ = 20;
    for (let i = 0; i < 200; i++) { this.spawnSegment(o.lastSegmentZ); o.lastSegmentZ -= CONFIG.SEGMENT_LENGTH; }
    o.lastGateZ = -40;
    for (let i = 0; i < 5; i++) { this.spawnGateRow(o.lastGateZ); o.lastGateZ -= Math.max(13, CONFIG.GATE_SPACING - 7e-3 * o.distance); }
    o.phase = "playing";
  }

  /* ---------------------------------------------------------------- frame */

  /** Advance one virtual 1/60 s step: apply `input`, then run the game frame. */
  advance(input: Input = IDLE): void {
    this.applyInput(input);
    this.n++;
    const now = virtualNow(this.n);
    const diff = (now - this.oldTime) / 1000;
    this.oldTime = now;
    this.elapsed += diff;
    this.frame(Math.min(diff, 1 / 30), this.elapsed);
  }

  private frame(dt: number, s: number): void {
    const o = this.o, a = CONFIG, r = this.rng, ge = this.player;
    if (o.phase === "playing") {
      o.frameCount++;
      o.distance += o.speed * dt;
      o.score += o.speed * dt * a.SCORE_PER_METER * o.multiplier * (o.scoreX2Active ? 2 : 1);
      o.speed = Math.min(a.MAX_SPEED, o.speed + a.SPEED_INCREMENT * dt);
      if (o.rainbowTimer > 0) { o.rainbowTimer -= dt; o.isRainbowActive = !(o.rainbowTimer <= 0); }
      if (o.scoreX2Timer > 0) { o.scoreX2Timer -= dt; o.scoreX2Active = o.scoreX2Timer > 0; } else o.scoreX2Active = false;
      if (o.squashT > 0) o.squashT -= dt;
      if (o.score >= o.milestone) {
        o.milestone += a.MILESTONE_SCORE;
        o.score += 100;
        this.popup("MILESTONE! +100", "#f9c647", 2.5);
        this.fovPunch(7);
        this.burst(ge.x, ge.y, ge.z, "#f9c647", 26, 2.6);
      }
      const every = Math.max(1, Math.floor(3 / (o.speed / a.FORWARD_SPEED_INIT)));
      if (o.frameCount % every === 0) this.spawnSplatter(ge.x, ge.z - a.BALL_RADIUS * o.ballScale, o.playerColorIndex);
      if (o.trailTimer > 0) o.trailTimer -= dt;
      if (o.isRainbowActive) o._rainbowVisual = true;
      else if (o._rainbowVisual) o._rainbowVisual = false;
      if (o.shieldActive) {
        this.shieldPulse -= dt;
        if (this.shieldPulse <= 0) { this.shieldPulse = 0.22; this.burst(ge.x, ge.y, ge.z, "#8fe3ff", 4, 1.2); }
      }
      const move = o.speed * dt;
      this.scroll += move;
      o.lastSegmentZ += move;
      o.lastGateZ += move;
      for (let i = this.segments.length - 1; i >= 0; i--) {
        const seg = this.segments[i] as Segment;
        seg.z += move;
        seg.x = curve(-o.distance + seg.z);
        if (seg.z > 20) { this.segments.splice(i, 1); this.spawnSegment(o.lastSegmentZ); o.lastSegmentZ -= a.SEGMENT_LENGTH; }
      }
      for (let i = this.gates.length - 1; i >= 0; i--) {
        const g = this.gates[i] as Gate;
        g.z += move;
        g.x = g.laneX + curve(-o.distance + g.z);
        if (!g.passed && g.z > -0.5 && g.z < 1) {
          g.passed = true;
          // C16: resolve a row once, against its nearest gate. The hit windows (|off| < 1.2, lanes 2.3 apart) overlap within
          // 0.05 of a lane boundary, where the original applied both a match and an OUCH in one frame. Outside the overlap
          // at most one gate is in reach, and it is the nearest, so the result and the random draws are unchanged.
          let nearest = g;
          for (const mate of this.gates) {
            if (mate === g || mate.row !== g.row || mate.passed) continue;
            mate.passed = true;
            if (Math.abs(o.laneOffset - mate.laneX) < Math.abs(o.laneOffset - nearest.laneX)) nearest = mate;
          }
          const off = Math.abs(o.laneOffset - nearest.laneX);
          const target = nearest;
          if (off < 1.2) {
            if (o.isRainbowActive || target.colorIndex === o.playerColorIndex) {
              o.combo++;
              o.multiplier = Math.min(a.MAX_MULT, 1 + Math.floor(o.combo / a.COMBO_PER_MULT));
              const perfect = off < a.PERFECT_WINDOW;
              let pts = a.POINTS_GATE + (perfect ? a.POINTS_PERFECT : 0);
              pts = Math.round(pts * o.multiplier * (o.scoreX2Active ? 2 : 1));
              o.score += pts;
              o.ballScale = Math.min(1.6, o.ballScale * (perfect ? 1.15 * a.GROW_FACTOR : a.GROW_FACTOR));
              o.speed = Math.min(a.MAX_SPEED, o.speed + (perfect ? 0.45 : 0.3));
              o.squashT = 0.28;
              const color = COLORS[target.colorIndex] ?? "#ffffff";
              this.burst(ge.x, ge.y, ge.z, color, perfect ? 22 : 12, perfect ? 2.4 : 1.6);
              if (perfect) { o.squashT = 0.34; this.fovPunch(4); this.popup(`PERFECT! +${pts}`, "#b868e8", 1.9); }
              if (o.combo >= a.COMBO_PER_MULT && o.combo % a.COMBO_PER_MULT === 0) { this.popup(`COMBO x${o.multiplier}`, "#f9c647", 2.7); this.fovPunch(5); }
            } else if (o.shieldActive) {
              o.shieldActive = false;
              o.squashT = 0.22;
              o.shakeTimer = 0.2;
              this.burst(ge.x, ge.y, ge.z, "#5ecaf0", 14, 1.8);
              this.popup("BLOCKED!", "#5ecaf0", 1.8);
            } else {
              o.combo = 0;
              o.multiplier = 1;
              o.lives--;
              o.ballScale = Math.max(0.4, o.ballScale * a.SHRINK_FACTOR);
              o.shakeTimer = 0.4;
              this.fovPunch(2.5);
              this.popup("OUCH!", "#f0433a", 1.6);
              this.spawnSplatter(ge.x, ge.z, o.playerColorIndex);
              if (o.lives <= 0) {
                const color = COLORS[o.playerColorIndex] ?? "#f0433a";
                o.phase = "bursting";
                o.burstT = 1.15;
                this.burst(ge.x, ge.y, ge.z, color, 46, 3.8);
                this.burst(ge.x, ge.y, ge.z, "#ffffff", 16, 2.6);
                o.shakeTimer = 0.7;
                this.fovPunch(10);
                ge.visible = false;
              }
            }
            ge.scale = o.ballScale;
          }
        }
        if (g.z > 10) {
          this.gates.splice(i, 1);
          if (i === 0) {
            this.spawnGateRow(o.lastGateZ);
            o.lastGateZ -= Math.max(13, a.GATE_SPACING - 7e-3 * o.distance);
            if (r.next() < 0.2) this.spawnPowerup(o.lastGateZ + a.GATE_SPACING / 2);
          }
        }
      }
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i] as Powerup;
        p.z += move;
        p.x = p.laneX + curve(-o.distance + p.z);
        p.y = p.baseY + 0.2 * Math.sin(3 * s);
        if (p.z > -1.2 && p.z < 1.2 && Math.abs(ge.x - p.x) < 1.5) {
          if (p.type === "rainbow") { o.rainbowTimer = a.RAINBOW_DURATION; this.popup("RAINBOW!", "#b868e8", 2); }
          else if (p.type === "shield") { o.shieldActive = true; this.popup("SHIELD!", "#5ecaf0", 2); }
          else if (p.type === "switch") {
            const before = o.playerColorIndex;
            let next = before;
            while (next === before) next = Math.floor(r.next() * COLORS.length);
            o.playerColorIndex = next;
            for (const g of this.gates) if (g.colorIndex === before) g.colorIndex = next;
            this.popup("COLOR SWITCH!", COLORS[next] as string, 2);
          } else { o.scoreX2Timer = a.SCOREX2_DURATION; this.popup("2x SCORE!", "#f9c647", 2); }
          const color = p.type === "rainbow" ? "#b868e8" : p.type === "shield" ? "#5ecaf0" : p.type === "switch" ? (COLORS[o.playerColorIndex] as string) : "#f9c647";
          this.burst(p.x, p.y, p.z, color, 20, 2.2);
          this.fovPunch(4);
          this.powerups.splice(i, 1);
        } else if (p.z > 10) this.powerups.splice(i, 1);
      }
      for (let i = this.splatters.length - 1; i >= 0; i--) {
        const sp = this.splatters[i] as Splatter;
        sp.z += move;
        sp.x = sp.laneX + curve(-o.distance + sp.z);
        if (sp.scale < sp.targetScale) sp.scale += 5 * dt;
        if (sp.z > 15) this.splatters.splice(i, 1);
      }
      o.laneOffset += (this.ye - o.laneOffset) * Math.min(1, 10 * dt);
      ge.x = o.laneOffset + curve(-o.distance);
      ge.y = a.BALL_RADIUS * o.ballScale;
      ge.rotX -= (o.speed * dt) / (a.BALL_RADIUS * o.ballScale);
      const squash = o.squashT > 0 ? 0.22 * Math.sin((1 - o.squashT / 0.28) * Math.PI) : 0;
      ge.scale = o.ballScale * (1 + squash);
    }
    if (o.phase === "splash") {
      ge.rotX -= 1.8 * dt;
      ge.y = a.BALL_RADIUS * o.ballScale + 0.12 * Math.sin(2 * s);
    }
    if (o.phase === "bursting") {
      o.burstT -= dt;
      if (o.burstT <= 0) o.phase = "gameOver";
    }
    let intro = 0, introZ = 0;
    if (o.introT > 0) {
      o.introT -= dt;
      const e = Math.max(0, o.introT / 2);
      const e2 = e * e;
      intro = 9 * e2;
      introZ = 8 * e2;
    }
    const cam = this.camera;
    const tx = 0.5 * ge.x, ty = ge.y + 5 + intro, tz = ge.z + 9 + introZ;
    cam.x += 0.1 * (tx - cam.x);
    cam.y += 0.1 * (ty - cam.y);
    cam.z += 0.1 * (tz - cam.z);
    cam.lookX = ge.x; cam.lookY = ge.y; cam.lookZ = ge.z - 10;
    if (o.shakeTimer > 0) {
      cam.x += (r.next() - 0.5) * o.shakeTimer;
      cam.y += (r.next() - 0.5) * o.shakeTimer;
      o.shakeTimer -= dt;
    }
    const d2 = o.phase === "playing" ? o.speed : 0.5 * a.FORWARD_SPEED_INIT;
    for (let i = 0; i < 50; i++) {
      const st = this.streaks[i] as Streak;
      st.z += (st.speed + d2) * dt;
      if (st.z > 20) { st.z = -60 - 40 * r.next(); st.x = 40 * (r.next() - 0.5); st.y = 0.5 + 15 * r.next(); }
    }
    const drift = (0.35 * d2 + 4) * dt;
    this.cloudDrift += drift;
    for (let i = 0; i < 56; i++) {
      const c = this.clouds[i] as Cloud;
      c.z += drift;
      if (c.z > 45) { Object.assign(c, this.cloud(i < 30)); c.z = -150; }
    }
    for (const p of this.particles) {
      if (!p.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.visible = false; continue; }
      p.vy -= 11 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.scale = Math.max(0.02, (p.life / p.max) * p.s0);
    }
    this.vignette = o.phase === "playing" ? o.multiplier : 1;
    const applied = o._fovApplied || 0, punch = o._fovPunch || 0;
    if (punch !== applied) o._fovApplied = punch;
    o._fovPunch = punch > 0.05 ? punch * (1 - Math.min(1, 5 * dt)) : 0;
  }

  /** Streak opacity target and multiplier-driven vignette strength the renderer reads. */
  get speedRatio(): number {
    const o = this.o;
    const d2 = o.phase === "playing" ? o.speed : 0.5 * CONFIG.FORWARD_SPEED_INIT;
    return Math.min(1, Math.max(0, (d2 - CONFIG.FORWARD_SPEED_INIT) / (CONFIG.MAX_SPEED - CONFIG.FORWARD_SPEED_INIT)) + 0.04 * (o.combo || 0));
  }

  get vignetteMultiplier(): number {
    return this.vignette;
  }

  /** One trace row, columns in `TRACE_FIELDS` order of tools/crayon-capture/splat-rush-lib.ts. */
  traceRow(index: number): number[] {
    const o = this.o, p = this.player, c = this.camera;
    return [
      index, o.score, o.distance, o.speed, o.lives, o.combo, o.multiplier, o.laneOffset, o.playerColorIndex, o.ballScale, o.rainbowTimer,
      o.shieldActive ? 1 : 0, o.scoreX2Timer, PHASE_CODE[o.phase], o.squashT, o.shakeTimer, o.milestone, this.rng.count,
      p.x, p.y, p.z, c.x, c.y, c.z, this.gates.length, this.powerups.length, this.splatters.length, this.segments.length
    ];
  }
}

/* ---------------------------------------------------------------- scripts */

export interface Segment2 { steps: number; input: Input }

/** Parse the capture's run-length script text (`<steps>x[SDU-] dx=<n>`). Mirrors tools/crayon-capture/splat-rush-lib.ts. */
export function parseScript(text: string): Segment2[] {
  const out: Segment2[] = [];
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const m = /^(\d+)x([SDU]*|-)\s+dx=(-?\d+)$/.exec(line);
    if (!m) throw new Error(`splat-rush script line ${i + 1}: cannot parse "${line}"`);
    const flags = m[2] === "-" ? "" : (m[2] as string);
    out.push({ steps: Number(m[1]), input: { start: flags.includes("S"), down: flags.includes("D"), up: flags.includes("U"), dx: Number(m[3]) } });
  }
  return out;
}

export function expandScript(segments: readonly Segment2[]): Input[] {
  const out: Input[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) out.push({ ...seg.input });
  return out;
}

/**
 * Replay a script exactly like the capture harness: `warmup` idle frames, trace row 0 (pre-start state),
 * then one row after every scripted step.
 */
export function replay(seed: number, warmup: number, inputs: readonly Input[]): { sim: SplatRushSim; trace: number[][] } {
  const sim = new SplatRushSim(seed);
  for (let i = 0; i < warmup; i++) sim.advance(IDLE);
  const trace = [sim.traceRow(0)];
  for (let i = 0; i < inputs.length; i++) {
    sim.advance(inputs[i] as Input);
    trace.push(sim.traceRow(i + 1));
  }
  return { sim, trace };
}
