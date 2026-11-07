/**
 * Polarity Orbs — pure simulation (PRD §3.1 + §3.5).
 * No DOM, no engine rendering imports; the only engine-backed import is the kit's
 * counted GameRng so every gameplay draw is reproducible under `replay()`.
 */
import { GameRng, POPUP_LIMIT, type Popup } from "../../../examples/shared/runner-kit/index";

export const CONFIG = {
  DT: 1 / 60,
  POLARITIES: [+1, -1] as const,
  LANES: [-2.3, 0, 2.3] as const,
  LANE_LIMIT: 2.3,
  DRAG_SCALE: 0.02,
  STEER_RATE: 10,
  SPEED_INIT: 14,
  MAX_SPEED: 26,
  SPEED_PER_COLLECT: 0.3,
  ROW_SPACING: 12,
  SPAWN_AHEAD: 120,
  DESPAWN_BEHIND: 8,
  ORBS_PER_ROW: 3,
  MIXED_CHANCE: 0.7,
  COLLECT_RADIUS: 1.2,
  POINTS_ORB: 20,
  MAX_LIVES: 3,
  GROW: 1.02,
  SCALE_CAP: 1.6,
  SHRINK: 0.85,
  MAX_MULT: 5,
  COMBO_PER_MULT: 3,
  RAINBOW_DURATION: 5,
  X2_DURATION: 7,
  MAGNET_DURATION: 6,
  MAGNET_RADIUS: 3.5,
  MAGNET_PULL: 6,
  POWERUP_CHANCE: 0.2,
  BURST_SECONDS: 1.15,
  MILESTONE: 750,
  MILESTONE_BONUS: 100,
  POOL_ORBS: 36,
  POOL_POWERUPS: 10,
  POOL_PARTICLES: 90,
  POOL_SEGMENTS: 220
} as const;

export type Phase = "splash" | "playing" | "bursting" | "gameOver";
export type Polarity = 1 | -1;
export type PowerupKind = "rainbow" | "shield" | "x2" | "magnet";

export interface Input {
  start: boolean;
  down: boolean;
  up: boolean;
  dx: number;
  tap: boolean;
}

export const IDLE: Input = { start: false, down: false, up: false, dx: 0, tap: false };

export interface Orb {
  active: boolean;
  row: number;
  x: number;
  z: number;
  polarity: Polarity;
}

export interface Powerup {
  active: boolean;
  kind: PowerupKind;
  x: number;
  z: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: number;
}

export interface RowState {
  id: number;
  z: number;
  resolved: boolean;
  uniform: boolean;
}

export interface GameState {
  phase: Phase;
  tick: number;
  score: number;
  combo: number;
  bestCombo: number;
  mult: number;
  lives: number;
  distance: number;
  speed: number;
  laneOffset: number;
  polarity: Polarity;
  ballScale: number;
  rainbowTimer: number;
  magnetTimer: number;
  shieldActive: boolean;
  scoreX2Timer: number;
  burstTimer: number;
  orbsCollected: number;
  flips: number;
  wrongs: number;
  shieldBlocks: number;
  powerupsTaken: number;
  milestones: number;
  rowsPassed: number;
  shake: number;
  rngCount: number;
}

export const TRACE_COLUMNS = [
  "phase", "score", "combo", "mult", "lives", "distance", "speed", "laneOffset",
  "polarity", "ballScale", "rainbowTimer", "magnetTimer", "shield", "x2",
  "orbsCollected", "flips", "wrongs", "powerupsTaken", "milestones", "rowsPassed",
  "activeOrbs", "activePowerups", "activeParticles", "rngCount"
] as const;

const PHASE_INDEX: Record<Phase, number> = { splash: 0, playing: 1, bursting: 2, gameOver: 3 };
const POWERUP_KINDS: readonly PowerupKind[] = ["rainbow", "shield", "x2", "magnet"];
const PARTICLE_COLORS = [0xff5a4e, 0x4ea8ff, 0xffd24e, 0xffffff];

export class PolarityOrbsSim {
  readonly o: GameState;
  readonly popups: Popup[] = [];
  readonly orbs: Orb[] = [];
  readonly powerups: Powerup[] = [];
  readonly particles: Particle[] = [];
  readonly rows: RowState[] = [];

  private readonly seed: number;
  private rng: GameRng;
  private ye = 0;
  private dragging = false;
  private popupSeq = 0;
  private nextRowId = 0;
  private nextMilestone = CONFIG.MILESTONE;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new GameRng(seed);
    this.o = {
      phase: "splash", tick: 0, score: 0, combo: 0, bestCombo: 0, mult: 1,
      lives: CONFIG.MAX_LIVES, distance: 0, speed: CONFIG.SPEED_INIT, laneOffset: 0,
      polarity: 1, ballScale: 1, rainbowTimer: 0, magnetTimer: 0, shieldActive: false,
      scoreX2Timer: 0, burstTimer: 0, orbsCollected: 0, flips: 0, wrongs: 0,
      shieldBlocks: 0, powerupsTaken: 0, milestones: 0, rowsPassed: 0, shake: 0, rngCount: 0
    };
    for (let i = 0; i < CONFIG.POOL_ORBS; i++) this.orbs.push({ active: false, row: -1, x: 0, z: 0, polarity: 1 });
    for (let i = 0; i < CONFIG.POOL_POWERUPS; i++) this.powerups.push({ active: false, kind: "shield", x: 0, z: 0 });
    for (let i = 0; i < CONFIG.POOL_PARTICLES; i++) {
      this.particles.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, color: 0xffffff });
    }
  }

  /** Start / restart: re-seeds the counted stream and re-centres steering AND drag state (audit fix C4). */
  begin(): void {
    this.rng = new GameRng(this.seed);
    this.ye = 0;
    this.dragging = false;
    this.nextRowId = 0;
    this.nextMilestone = CONFIG.MILESTONE;
    Object.assign(this.o, {
      phase: "playing", tick: 0, score: 0, combo: 0, bestCombo: 0, mult: 1,
      lives: CONFIG.MAX_LIVES, distance: 0, speed: CONFIG.SPEED_INIT, laneOffset: 0,
      polarity: 1, ballScale: 1, rainbowTimer: 0, magnetTimer: 0, shieldActive: false,
      scoreX2Timer: 0, burstTimer: 0, orbsCollected: 0, flips: 0, wrongs: 0,
      shieldBlocks: 0, powerupsTaken: 0, milestones: 0, rowsPassed: 0, shake: 0, rngCount: 0
    });
    for (const orb of this.orbs) orb.active = false;
    for (const p of this.powerups) p.active = false;
    for (const p of this.particles) p.active = false;
    this.rows.length = 0;
    let z = -CONFIG.ROW_SPACING * 2;
    while (z > -CONFIG.SPAWN_AHEAD) {
      this.spawnRow(z);
      z -= CONFIG.ROW_SPACING;
    }
  }

  advance(input: Input = IDLE): void {
    const o = this.o;
    if (o.phase === "splash" || o.phase === "gameOver") {
      if (input.start) this.begin();
      return;
    }
    o.tick++;
    if (o.phase === "bursting") {
      this.updateParticles();
      o.burstTimer -= CONFIG.DT;
      o.shake = Math.max(0, o.shake - CONFIG.DT * 2);
      if (o.burstTimer <= 0) {
        o.burstTimer = 0;
        o.phase = "gameOver";
      }
      o.rngCount = this.rng.count;
      return;
    }

    // Flip: no cooldown, no RNG draw (§3.5).
    if (input.tap) {
      o.polarity = (o.polarity === 1 ? -1 : 1) as Polarity;
      o.flips++;
      this.burst(o.laneOffset, 0.9, 0, 8, o.polarity === 1 ? 0 : 1);
    }

    // Steering: drag dx moves a private target; restart re-centres it (C4).
    if (input.down) this.dragging = true;
    if (input.up) this.dragging = false;
    if (this.dragging && input.dx !== 0) {
      this.ye = clamp(this.ye + input.dx * CONFIG.DRAG_SCALE, -CONFIG.LANE_LIMIT, CONFIG.LANE_LIMIT);
    }
    o.laneOffset += (this.ye - o.laneOffset) * Math.min(1, CONFIG.STEER_RATE * CONFIG.DT);

    const step = o.speed * CONFIG.DT;
    o.distance += step;
    o.shake = Math.max(0, o.shake - CONFIG.DT * 2);
    o.rainbowTimer = Math.max(0, o.rainbowTimer - CONFIG.DT);
    o.magnetTimer = Math.max(0, o.magnetTimer - CONFIG.DT);
    o.scoreX2Timer = Math.max(0, o.scoreX2Timer - CONFIG.DT);

    // Scroll rows + orbs; resolve each row exactly once at the player plane (C16).
    for (const row of this.rows) {
      row.z += step;
      if (!row.resolved && row.z >= 0) {
        row.resolved = true;
        o.rowsPassed++;
        this.resolveRow(row);
      }
    }
    for (const orb of this.orbs) {
      if (!orb.active) continue;
      orb.z += step;
      if (o.magnetTimer > 0 && orb.z < 0 && orb.polarity === o.polarity) {
        const dx = o.laneOffset - orb.x;
        if (dx * dx + orb.z * orb.z <= CONFIG.MAGNET_RADIUS * CONFIG.MAGNET_RADIUS) {
          orb.x += dx * Math.min(1, CONFIG.MAGNET_PULL * CONFIG.DT);
        }
      }
      if (orb.z > CONFIG.DESPAWN_BEHIND) orb.active = false;
    }
    while (this.rows.length > 0 && (this.rows[0] as RowState).z > CONFIG.DESPAWN_BEHIND) {
      this.rows.shift();
    }

    // Powerups scroll and collect on plane crossing within the collect radius.
    for (const p of this.powerups) {
      if (!p.active) continue;
      const prevZ = p.z;
      p.z += step;
      if (prevZ < 0 && p.z >= 0 && Math.abs(p.x - o.laneOffset) < CONFIG.COLLECT_RADIUS) {
        this.takePowerup(p);
      }
      if (p.z > CONFIG.DESPAWN_BEHIND) p.active = false;
    }

    // Keep the horizon stocked; pool exhaustion simply skips the spawn.
    let farthest = 0;
    for (const row of this.rows) farthest = Math.min(farthest, row.z);
    while (farthest > -CONFIG.SPAWN_AHEAD) {
      const spawned = this.spawnRow(farthest - CONFIG.ROW_SPACING);
      if (!spawned) break;
      farthest -= CONFIG.ROW_SPACING;
    }

    this.updateParticles();
    this.checkMilestone();
    o.rngCount = this.rng.count;
  }

  /** Fixed-column numeric trace for determinism tests and QA replays. */
  traceRow(_index: number): number[] {
    const o = this.o;
    let activeOrbs = 0;
    let activePowerups = 0;
    let activeParticles = 0;
    for (const orb of this.orbs) if (orb.active) activeOrbs++;
    for (const p of this.powerups) if (p.active) activePowerups++;
    for (const p of this.particles) if (p.active) activeParticles++;
    return [
      PHASE_INDEX[o.phase], o.score, o.combo, o.mult, o.lives, o.distance, o.speed, o.laneOffset,
      o.polarity, o.ballScale, o.rainbowTimer, o.magnetTimer, o.shieldActive ? 1 : 0, o.scoreX2Timer,
      o.orbsCollected, o.flips, o.wrongs, o.powerupsTaken, o.milestones, o.rowsPassed,
      activeOrbs, activePowerups, activeParticles, o.rngCount
    ];
  }

  private spawnRow(z: number): boolean {
    const slots: Orb[] = [];
    for (const orb of this.orbs) {
      if (!orb.active) {
        slots.push(orb);
        if (slots.length === CONFIG.ORBS_PER_ROW) break;
      }
    }
    if (slots.length < CONFIG.ORBS_PER_ROW) return false;
    const id = this.nextRowId++;
    const uniform = this.rng.next() >= CONFIG.MIXED_CHANCE;
    const polarities: Polarity[] = [];
    if (uniform) {
      const opposite = (this.o.polarity === 1 ? -1 : 1) as Polarity;
      polarities.push(opposite, opposite, opposite);
    } else {
      const plusCount = 1 + Math.floor(this.rng.next() * 2);
      for (let i = 0; i < CONFIG.ORBS_PER_ROW; i++) polarities.push(i < plusCount ? 1 : -1);
      for (let i = polarities.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        const tmp = polarities[i] as Polarity;
        polarities[i] = polarities[j] as Polarity;
        polarities[j] = tmp;
      }
    }
    for (let i = 0; i < CONFIG.ORBS_PER_ROW; i++) {
      const orb = slots[i] as Orb;
      orb.active = true;
      orb.row = id;
      orb.x = CONFIG.LANES[i] as number;
      orb.z = z;
      orb.polarity = polarities[i] as Polarity;
    }
    this.rows.push({ id, z, resolved: false, uniform });

    if (this.rng.next() < CONFIG.POWERUP_CHANCE) {
      const free = this.powerups.find((p) => !p.active);
      if (free) {
        free.active = true;
        free.kind = POWERUP_KINDS[Math.floor(this.rng.next() * POWERUP_KINDS.length)] as PowerupKind;
        free.x = CONFIG.LANES[Math.floor(this.rng.next() * CONFIG.LANES.length)] as number;
        free.z = z - CONFIG.ROW_SPACING / 2;
      }
    }
    return true;
  }

  /** C16: the row resolves once, against the nearest orb to the player. */
  private resolveRow(row: RowState): void {
    const o = this.o;
    let nearest: Orb | null = null;
    let nearestDx = Infinity;
    for (const orb of this.orbs) {
      if (!orb.active || orb.row !== row.id) continue;
      const dx = Math.abs(orb.x - o.laneOffset);
      if (dx < nearestDx) {
        nearestDx = dx;
        nearest = orb;
      }
    }
    if (!nearest || nearestDx >= CONFIG.COLLECT_RADIUS) return;
    nearest.active = false;
    const matches = nearest.polarity === o.polarity || o.rainbowTimer > 0;
    if (matches) {
      o.combo++;
      o.bestCombo = Math.max(o.bestCombo, o.combo);
      o.mult = Math.min(CONFIG.MAX_MULT, 1 + Math.floor(o.combo / CONFIG.COMBO_PER_MULT));
      const points = CONFIG.POINTS_ORB * o.mult * (o.scoreX2Timer > 0 ? 2 : 1);
      o.score += points;
      o.orbsCollected++;
      o.ballScale = Math.min(CONFIG.SCALE_CAP, o.ballScale * CONFIG.GROW);
      o.speed = Math.min(CONFIG.MAX_SPEED, o.speed + CONFIG.SPEED_PER_COLLECT);
      this.popup(`+${points}`, nearest.polarity === 1 ? "#ff5a4e" : "#4ea8ff", 1);
      this.burst(nearest.x, 0.9, 0, 10, nearest.polarity === 1 ? 0 : 1);
    } else if (o.shieldActive) {
      o.shieldActive = false;
      o.shieldBlocks++;
      this.popup("BLOCKED", "#7ef0c8", 1);
      this.burst(nearest.x, 0.9, 0, 8, 3);
    } else {
      o.lives--;
      o.wrongs++;
      o.combo = 0;
      o.mult = 1;
      o.ballScale *= CONFIG.SHRINK;
      o.shake = 1;
      this.popup("WRONG", "#ff3b30", 1.2);
      this.burst(nearest.x, 0.9, 0, 12, 0);
      if (o.lives <= 0) {
        o.lives = 0;
        o.phase = "bursting";
        o.burstTimer = CONFIG.BURST_SECONDS;
        this.burst(o.laneOffset, 0.9, 0, 24, o.polarity === 1 ? 0 : 1);
      }
    }
  }

  private takePowerup(p: Powerup): void {
    const o = this.o;
    p.active = false;
    o.powerupsTaken++;
    switch (p.kind) {
      case "rainbow":
        o.rainbowTimer = CONFIG.RAINBOW_DURATION;
        this.popup("RAINBOW", "#ffd24e", 1.1);
        break;
      case "shield":
        o.shieldActive = true;
        this.popup("SHIELD", "#7ef0c8", 1.1);
        break;
      case "x2":
        o.scoreX2Timer = CONFIG.X2_DURATION;
        this.popup("x2", "#ffd24e", 1.1);
        break;
      case "magnet":
        o.magnetTimer = CONFIG.MAGNET_DURATION;
        this.popup("MAGNET", "#c79bff", 1.1);
        break;
    }
    this.burst(p.x, 0.9, p.z, 10, 2);
  }

  private checkMilestone(): void {
    const o = this.o;
    while (o.score >= this.nextMilestone) {
      this.nextMilestone += CONFIG.MILESTONE;
      o.score += CONFIG.MILESTONE_BONUS;
      o.milestones++;
      this.popup(`+${CONFIG.MILESTONE_BONUS} MILESTONE`, "#ffd24e", 1.3);
      this.burst(o.laneOffset, 1.1, 0, 18, 2);
    }
  }

  private burst(x: number, y: number, z: number, count: number, colorIndex: number): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = (this.rng.next() - 0.5) * 6;
      p.vy = this.rng.next() * 5 + 1;
      p.vz = (this.rng.next() - 0.5) * 4;
      p.maxLife = 0.5 + this.rng.next() * 0.4;
      p.life = p.maxLife;
      p.color = PARTICLE_COLORS[colorIndex] as number;
      if (++spawned >= count) break;
    }
  }

  private updateParticles(): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= CONFIG.DT;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy -= 12 * CONFIG.DT;
      p.x += p.vx * CONFIG.DT;
      p.y += p.vy * CONFIG.DT;
      p.z += p.vz * CONFIG.DT + this.o.speed * CONFIG.DT;
    }
  }

  private popup(text: string, color: string, size: number): void {
    this.popups.push({ n: this.o.score, seq: this.popupSeq++, text, color, size, at: this.o.tick });
    if (this.popups.length > POPUP_LIMIT) this.popups.splice(0, this.popups.length - POPUP_LIMIT);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic scripted replay: identical seed + warmup + inputs ⇒ identical traces. */
export function replay(seed: number, warmup: number, inputs: readonly Input[]): { sim: PolarityOrbsSim; trace: number[][] } {
  const sim = new PolarityOrbsSim(seed);
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