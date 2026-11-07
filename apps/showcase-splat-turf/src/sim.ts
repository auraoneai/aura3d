/**
 * Splat Turf sim — pure fixed-step (1/60 s) game logic. No DOM, no engine imports
 * except the runner-kit GameRng (counted stream) and the Popup type.
 * Finite 1200 m run: paint the road, manage the tank, dodge solvent strips and eraser bots.
 */
import { GameRng, POPUP_LIMIT, type Popup } from "../../../examples/shared/runner-kit/index";

export const CONFIG = {
  RUN_LENGTH: 1200,
  SPEED_INIT: 16,
  MAX_SPEED: 24,
  SPEED_INCREMENT: 0.2,
  GRID_COLS: 6,
  CELL_METERS: 1,
  LANE_LIMIT: 2.5,
  TANK_MAX: 100,
  TANK_DRAIN: 0.06,
  CAN_REFILL: 35,
  SOLVENT_PENALTY: 20,
  SOLVENT_LENGTH: 10,
  ERASER_PENALTY: 15,
  ERASER_WIPE_METERS: 15,
  ERASER_SPEED: 1.8,
  STRETCH_METERS: 25,
  STRETCH_COVERAGE: 0.8,
  MAX_MULT: 5,
  COMBO_PER_MULT: 2,
  MILESTONE: 750,
  BURST_SECONDS: 1.15,
  DT: 1 / 60,
  POOL_SEGMENTS: 220,
  POOL_CANS: 8,
  POOL_STRIPS: 10,
  POOL_BOTS: 3,
  POOL_PARTICLES: 90,
  SEGMENT_BACK: 20,
  GRADE_S: 85,
  GRADE_A: 70,
  GRADE_B: 50
} as const;

export type Phase = "splash" | "playing" | "bursting" | "gameOver" | "finished";
const PHASE_CODES: Record<Phase, number> = { splash: 0, playing: 1, bursting: 2, gameOver: 3, finished: 4 };

export interface Input { start: boolean; down: boolean; up: boolean; dx: number; tap: boolean }
export const IDLE: Input = { start: false, down: false, up: false, dx: 0, tap: false };

export interface Can { active: boolean; row: number; col: number }
export interface Strip { active: boolean; row: number; col: number; hit: boolean }
export interface Bot { active: boolean; row: number; x: number; dir: number; hit: boolean }
export interface Particle { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; kind: number }
export interface Segment { row: number }

export interface GameState {
  phase: Phase;
  time: number;
  distance: number;
  speed: number;
  score: number;
  combo: number;
  mult: number;
  bestCombo: number;
  tank: number;
  paintedCells: number;
  passedCells: number;
  coverage: number;
  stretchProgress: number;
  laneOffset: number;
  cansGrabbed: number;
  solventHits: number;
  eraserHits: number;
  stretches: number;
  milestones: number;
  burstTimer: number;
  wipeFlash: number;
  shake: number;
  grade: "S" | "A" | "B" | "C";
  cans: Can[];
  strips: Strip[];
  bots: Bot[];
  particles: Particle[];
  segments: Segment[];
}

export const TRACE_COLUMNS = [
  "phase", "score", "combo", "mult", "tank", "distance", "paintedCells", "passedCells",
  "laneOffset", "cansActive", "stripsActive", "botsActive", "particlesActive", "segments", "rngCount"
] as const;

const TRACE_LIMIT = 24000;

export function coverageGrade(pct: number): "S" | "A" | "B" | "C" {
  if (pct >= CONFIG.GRADE_S) return "S";
  if (pct >= CONFIG.GRADE_A) return "A";
  if (pct >= CONFIG.GRADE_B) return "B";
  return "C";
}

export class SplatTurfSim {
  readonly grid = new Uint8Array(CONFIG.RUN_LENGTH * CONFIG.GRID_COLS);
  readonly trailCol = new Int8Array(CONFIG.RUN_LENGTH).fill(-1);
  readonly popups: Popup[] = [];
  readonly o: GameState;

  private readonly seed: number;
  private rng: GameRng;
  private ye = 0;
  private dragging = false;
  private passedRows = 0;
  private stretchEnd = CONFIG.STRETCH_METERS;
  private nextCanRow = 40;
  private nextStripRow = 80;
  private nextMilestone = CONFIG.MILESTONE;
  private popupSeq = 0;
  private readonly history: number[][] = [];

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new GameRng(seed);
    this.o = {
      phase: "splash", time: 0, distance: 0, speed: CONFIG.SPEED_INIT, score: 0,
      combo: 0, mult: 1, bestCombo: 0, tank: CONFIG.TANK_MAX,
      paintedCells: 0, passedCells: 0, coverage: 0, stretchProgress: 0, laneOffset: 0,
      cansGrabbed: 0, solventHits: 0, eraserHits: 0, stretches: 0, milestones: 0,
      burstTimer: 0, wipeFlash: 0, shake: 0, grade: "C",
      cans: Array.from({ length: CONFIG.POOL_CANS }, () => ({ active: false, row: 0, col: 0 })),
      strips: Array.from({ length: CONFIG.POOL_STRIPS }, () => ({ active: false, row: 0, col: 0, hit: false })),
      bots: Array.from({ length: CONFIG.POOL_BOTS }, () => ({ active: false, row: 0, x: 0, dir: 1, hit: false })),
      particles: Array.from({ length: CONFIG.POOL_PARTICLES }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, kind: 0 })),
      segments: Array.from({ length: CONFIG.POOL_SEGMENTS }, (_, i) => ({ row: i - CONFIG.SEGMENT_BACK }))
    };
  }

  /** Start/restart: full reset; re-centres steering target AND drag state (C4). RNG stream restarts from the seed. */
  begin(): void {
    this.rng = new GameRng(this.seed);
    this.ye = 0;
    this.dragging = false;
    this.passedRows = 0;
    this.stretchEnd = CONFIG.STRETCH_METERS;
    this.nextCanRow = 40;
    this.nextStripRow = 80;
    this.nextMilestone = CONFIG.MILESTONE;
    this.grid.fill(0);
    this.trailCol.fill(-1);
    const o = this.o;
    o.phase = "playing"; o.time = 0; o.distance = 0; o.speed = CONFIG.SPEED_INIT; o.score = 0;
    o.combo = 0; o.mult = 1; o.bestCombo = 0; o.tank = CONFIG.TANK_MAX;
    o.paintedCells = 0; o.passedCells = 0; o.coverage = 0; o.stretchProgress = 0; o.laneOffset = 0;
    o.cansGrabbed = 0; o.solventHits = 0; o.eraserHits = 0; o.stretches = 0; o.milestones = 0;
    o.burstTimer = 0; o.wipeFlash = 0; o.shake = 0; o.grade = "C";
    for (const c of o.cans) { c.active = false; c.row = 0; c.col = 0; }
    for (const s of o.strips) { s.active = false; s.row = 0; s.col = 0; s.hit = false; }
    for (let i = 0; i < o.bots.length; i++) {
      const b = o.bots[i] as Bot;
      b.active = true; b.row = 150 + i * 300; b.hit = false;
      b.x = (this.rng.next() * 2 - 1) * CONFIG.LANE_LIMIT;
      b.dir = this.rng.next() < 0.5 ? -1 : 1;
    }
    for (const p of o.particles) p.active = false;
    for (let i = 0; i < o.segments.length; i++) (o.segments[i] as Segment).row = i - CONFIG.SEGMENT_BACK;
  }

  advance(input: Input = IDLE): void {
    const o = this.o;
    const dt = CONFIG.DT;
    if (input.start && (o.phase === "splash" || o.phase === "gameOver" || o.phase === "finished")) this.begin();
    o.time += dt;
    o.wipeFlash = Math.max(0, o.wipeFlash - dt);
    o.shake = Math.max(0, o.shake - dt * 2.5);
    this.updateParticles(dt);

    if (o.phase === "bursting") {
      o.burstTimer -= dt;
      if (o.burstTimer <= 0) { o.phase = "gameOver"; o.grade = coverageGrade(o.coverage * 100); }
      this.record();
      return;
    }
    if (o.phase !== "playing") { this.record(); return; }

    // Steering: drag dx moves the private target; keyboard dx synthesized by the shell (C4 on begin).
    if (input.down) this.dragging = true;
    if (input.up) this.dragging = false;
    if (input.dx !== 0) this.ye = clamp(this.ye + input.dx, -CONFIG.LANE_LIMIT, CONFIG.LANE_LIMIT);
    o.laneOffset += (this.ye - o.laneOffset) * Math.min(1, 10 * dt);

    o.distance = Math.min(CONFIG.RUN_LENGTH, o.distance + o.speed * dt);
    o.tank = Math.max(0, o.tank - o.speed * dt * CONFIG.TANK_DRAIN);

    this.spawnAhead();
    this.moveBots(dt);
    this.resolveRows();
    this.resolveBotContacts();
    this.recycle();
    this.resolveStretches();

    while (o.score >= this.nextMilestone) {
      this.nextMilestone += CONFIG.MILESTONE;
      o.score += 100;
      o.milestones++;
      this.popup("+100", "#ffb400", 30, 100);
      this.burst(o.laneOffset, 1.2, o.distance, 14, 2);
    }

    o.coverage = o.passedCells > 0 ? o.paintedCells / o.passedCells : 0;
    o.stretchProgress = this.passedRows - (this.stretchEnd - CONFIG.STRETCH_METERS);

    if (o.tank <= 0) {
      o.phase = "bursting";
      o.burstTimer = CONFIG.BURST_SECONDS;
      o.shake = 1;
      this.popup("OUT OF PAINT!", "#d92626", 30, 0);
      this.burst(o.laneOffset, 1, o.distance, 30, 1);
    } else if (o.distance >= CONFIG.RUN_LENGTH) {
      o.phase = "finished";
      o.grade = coverageGrade(o.coverage * 100);
      this.popup("FINISH!", "#ffb400", 30, 0);
      this.burst(o.laneOffset, 1.5, o.distance, 30, 2);
    }
    this.record();
  }

  traceRow(index: number): number[] {
    return this.history[index] ?? [];
  }

  /** The private steering target (read-only; the autopilot aims relative to it). */
  get steerTarget(): number { return this.ye; }

  /** Counted gameplay RNG draws so far (QA snapshot). */
  get rngCount(): number { return this.rng.count; }

  get traceLength(): number { return this.history.length; }

  // ---- internals ----

  private record(): void {
    if (this.history.length >= TRACE_LIMIT) return;
    const o = this.o;
    this.history.push([
      PHASE_CODES[o.phase], o.score, o.combo, o.mult, o.tank, o.distance, o.paintedCells, o.passedCells,
      o.laneOffset, countActive(o.cans), countActive(o.strips), countActive(o.bots), countActive(o.particles),
      o.segments.length, this.rng.count
    ]);
  }

  private spawnAhead(): void {
    const o = this.o;
    // Cans: spawn cursor ahead of the player; skip when the pool is exhausted.
    while (this.nextCanRow < o.distance + 70 && this.nextCanRow < CONFIG.RUN_LENGTH - 5) {
      const slot = o.cans.find((c) => !c.active);
      if (!slot) break;
      slot.active = true;
      slot.row = Math.floor(this.nextCanRow);
      slot.col = Math.floor(this.rng.next() * CONFIG.GRID_COLS);
      this.nextCanRow += 35 + this.rng.next() * 25;
    }
    // Solvent strips: 1 lane x 10 m.
    while (this.nextStripRow < o.distance + 90 && this.nextStripRow < CONFIG.RUN_LENGTH - 20) {
      const slot = o.strips.find((s) => !s.active);
      if (!slot) break;
      slot.active = true;
      slot.hit = false;
      slot.row = Math.floor(this.nextStripRow);
      slot.col = Math.floor(this.rng.next() * CONFIG.GRID_COLS);
      this.nextStripRow += 60 + this.rng.next() * 50;
    }
  }

  private moveBots(dt: number): void {
    for (const b of this.o.bots) {
      if (!b.active) continue;
      b.x += b.dir * CONFIG.ERASER_SPEED * dt;
      if (b.x > CONFIG.LANE_LIMIT) { b.x = CONFIG.LANE_LIMIT; b.dir = -1; }
      else if (b.x < -CONFIG.LANE_LIMIT) { b.x = -CONFIG.LANE_LIMIT; b.dir = 1; }
    }
  }

  /** Each 1 m row resolves exactly once, in order, against the current ball column (C16). */
  private resolveRows(): void {
    const o = this.o;
    const target = Math.min(CONFIG.RUN_LENGTH, Math.floor(o.distance));
    while (this.passedRows < target) {
      const r = this.passedRows;
      const col = clamp(Math.floor(o.laneOffset + CONFIG.LANE_LIMIT + 0.5), 0, CONFIG.GRID_COLS - 1);
      this.trailCol[r] = col;
      o.passedCells++;

      // Solvent contact: once per strip, when the trail enters it on its lane.
      let dissolved = false;
      for (const s of o.strips) {
        if (!s.active || s.col !== col || r < s.row || r >= s.row + CONFIG.SOLVENT_LENGTH) continue;
        dissolved = true;
        if (!s.hit) {
          s.hit = true;
          o.tank = Math.max(0, o.tank - CONFIG.SOLVENT_PENALTY);
          o.solventHits++;
          o.combo = 0; o.mult = 1;
          o.shake = 0.8;
          o.wipeFlash = 0.6;
          this.wipeCells(s.row, s.row + CONFIG.SOLVENT_LENGTH, s.col, s.col);
          this.popup("SOLVENT! -20", "#14c9c9", 26, -CONFIG.SOLVENT_PENALTY);
          this.burst(o.laneOffset, 0.6, r, 12, 3);
        }
      }

      if (!dissolved && o.tank > 0) {
        this.grid[r * CONFIG.GRID_COLS + col] = 1;
        o.paintedCells++;
        o.score += 5 * 1 * o.mult;
      }

      // Paint can pickup on row resolution.
      for (const c of o.cans) {
        if (!c.active || c.row !== r) continue;
        if (c.col === col) {
          c.active = false;
          o.tank = Math.min(CONFIG.TANK_MAX, o.tank + CONFIG.CAN_REFILL);
          o.cansGrabbed++;
          this.popup("+35 PAINT", "#ff3d8b", 24, CONFIG.CAN_REFILL);
          this.burst(o.laneOffset, 0.8, r, 10, 1);
        }
      }
      this.passedRows++;
    }
  }

  private resolveBotContacts(): void {
    const o = this.o;
    for (const b of o.bots) {
      if (!b.active || b.hit) continue;
      if (o.distance >= b.row && o.distance - b.row < 0.7 && Math.abs(o.laneOffset - b.x) < 0.9) {
        b.hit = true;
        o.tank = Math.max(0, o.tank - CONFIG.ERASER_PENALTY);
        o.eraserHits++;
        o.combo = 0; o.mult = 1;
        o.shake = 0.9;
        o.wipeFlash = 0.6;
        const end = Math.min(CONFIG.RUN_LENGTH, Math.floor(o.distance));
        this.wipeCells(Math.max(0, end - CONFIG.ERASER_WIPE_METERS), end, 0, CONFIG.GRID_COLS - 1);
        this.popup("ERASED! -15", "#8a8a99", 26, -CONFIG.ERASER_PENALTY);
        this.burst(o.laneOffset, 0.8, o.distance, 12, 4);
      }
    }
  }

  /** Clear grid cells in [rowStart, rowEnd) x [colStart, colEnd]; only passed painted trail cells reduce coverage. */
  private wipeCells(rowStart: number, rowEnd: number, colStart: number, colEnd: number): void {
    const o = this.o;
    for (let r = Math.max(0, rowStart); r < Math.min(CONFIG.RUN_LENGTH, rowEnd); r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const idx = r * CONFIG.GRID_COLS + c;
        if (this.grid[idx] === 0) continue;
        this.grid[idx] = 0;
        if (r < this.passedRows && this.trailCol[r] === c) o.paintedCells--;
      }
    }
  }

  private recycle(): void {
    const o = this.o;
    for (const c of o.cans) if (c.active && c.row < this.passedRows) c.active = false;
    for (const s of o.strips) if (s.active && s.row + CONFIG.SOLVENT_LENGTH < o.distance - 2) s.active = false;
    for (const b of o.bots) {
      if (b.active && b.row < o.distance - 10) {
        const next = b.row + 300;
        if (next < CONFIG.RUN_LENGTH - 30) {
          b.row = next; b.hit = false;
          b.x = (this.rng.next() * 2 - 1) * CONFIG.LANE_LIMIT;
          b.dir = this.rng.next() < 0.5 ? -1 : 1;
        } else b.active = false;
      }
    }
    for (const seg of o.segments) {
      while (seg.row < o.distance - CONFIG.SEGMENT_BACK) seg.row += CONFIG.POOL_SEGMENTS;
    }
  }

  private resolveStretches(): void {
    const o = this.o;
    while (this.passedRows >= this.stretchEnd && this.stretchEnd <= CONFIG.RUN_LENGTH) {
      const start = this.stretchEnd - CONFIG.STRETCH_METERS;
      let painted = 0;
      for (let r = start; r < this.stretchEnd; r++) {
        const c = this.trailCol[r];
        if (c >= 0 && this.grid[r * CONFIG.GRID_COLS + c] === 1) painted++;
      }
      if (painted / CONFIG.STRETCH_METERS >= CONFIG.STRETCH_COVERAGE) {
        o.combo++;
        o.stretches++;
        o.bestCombo = Math.max(o.bestCombo, o.combo);
        o.mult = Math.min(CONFIG.MAX_MULT, 1 + Math.floor(o.combo / CONFIG.COMBO_PER_MULT));
        o.speed = Math.min(CONFIG.MAX_SPEED, o.speed + CONFIG.SPEED_INCREMENT);
        this.popup(`STRETCH! x${o.mult}`, "#ffb400", 26, o.combo);
        this.burst(o.laneOffset, 1, o.distance, 8, 2);
      } else {
        o.combo = 0;
        o.mult = 1;
      }
      this.stretchEnd += CONFIG.STRETCH_METERS;
    }
  }

  private burst(x: number, y: number, z: number, count: number, kind: number): void {
    let spawned = 0;
    for (const p of this.o.particles) {
      if (p.active) continue;
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = (this.rng.next() * 2 - 1) * 4;
      p.vy = 2 + this.rng.next() * 4;
      p.vz = (this.rng.next() * 2 - 1) * 4;
      p.life = 0.5 + this.rng.next() * 0.4;
      p.kind = kind;
      if (++spawned >= count) break;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.o.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 12 * dt;
      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.3; }
    }
  }

  private popup(text: string, color: string, size: number, n: number): void {
    this.popups.push({ n, seq: this.popupSeq++, text, color, size, at: this.o.time });
    if (this.popups.length > POPUP_LIMIT) this.popups.splice(0, this.popups.length - POPUP_LIMIT);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function countActive(list: readonly { active: boolean }[]): number {
  let n = 0;
  for (const e of list) if (e.active) n++;
  return n;
}

/** Script segment: `steps` frames of one input (comma-free text format, see `parseScript`). */
export interface ScriptSegment { steps: number; input: Input }

/** Parse `"12xS dx=0"` lines: repeat x flags (`S` start, `D` down, `U` up, `T` tap) x `dx=-1..1`. */
export function parseScript(text: string): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const m = /^(\d+)x([SDUT]*|-)\s+dx=(-?\d+)$/.exec(line);
    if (!m) throw new Error(`splat-turf script line ${i + 1}: cannot parse "${line}"`);
    const flags = m[2] === "-" ? "" : (m[2] as string);
    out.push({
      steps: Number(m[1]),
      input: { start: flags.includes("S"), down: flags.includes("D"), up: flags.includes("U"), tap: flags.includes("T"), dx: Number(m[3]) }
    });
  }
  return out;
}

export function expandScript(segments: readonly ScriptSegment[]): Input[] {
  const out: Input[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) out.push({ ...seg.input });
  return out;
}

/** Deterministic replay: `warmup` idle steps, then one input per step; returns the sim and its full trace. */
export function replay(seed: number, warmup: number, inputs: readonly Input[]): { sim: SplatTurfSim; trace: number[][] } {
  const sim = new SplatTurfSim(seed);
  for (let i = 0; i < warmup; i++) sim.advance(IDLE);
  for (const input of inputs) sim.advance(input);
  const trace: number[][] = [];
  for (let i = 0; i < sim.traceLength; i++) trace.push(sim.traceRow(i));
  return { sim, trace };
}