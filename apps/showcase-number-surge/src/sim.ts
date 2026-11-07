/**
 * Number Surge — pure simulation (no DOM, no engine renderer imports).
 * Fixed 1/60 s step. Every gameplay RNG draw goes through the counted GameRng
 * stream so `replay(seed, warmup, inputs)` is bit-identical across runs.
 */
import { GameRng, POPUP_LIMIT, type Popup } from "../../../examples/shared/runner-kit/index";

export const CONFIG = {
  START_NUMBER: 10,
  NUMBER_CAP: 999999,
  GATE_LANES: [-1.6, 1.6],
  HIT_WINDOW: 1.6,
  LANE_LIMIT: 1.6,
  SPEED_INIT: 16,
  MAX_SPEED: 29,
  SPEED_RAMP: 0.008,
  ROW_SPACING: 18,
  WALL_SPACING: 400,
  SPAWN_AHEAD: 140,
  RECYCLE_BEHIND: -10,
  MAX_MULT: 5,
  COMBO_PER_MULT: 3,
  MILESTONE: 750,
  MILESTONE_BONUS: 100,
  OP_N_MIN: 5,
  OP_N_MAX: 50,
  POWERUP_CHANCE: 0.25,
  POWERUP_WINDOW: 1.1,
  X2_DURATION: 7,
  BURST_SECONDS: 1.15,
  WALL_CLEARANCE: 24,
  SEGMENTS: 220,
  GATES: 24,
  WALLS: 4,
  POWERUPS: 8,
  PARTICLES: 90,
  SHARDS: 40,
  DT: 1 / 60
} as const;

export type Phase = "splash" | "playing" | "bursting" | "gameOver";
export type OpKind = "add" | "mul2" | "sub" | "div2";
export type PowerupKind = "plus25" | "double" | "shield" | "x2";

export interface Input {
  start: boolean;
  down: boolean;
  up: boolean;
  dx: number;
  tap: boolean;
}

export const IDLE: Input = { start: false, down: false, up: false, dx: 0, tap: false };

export interface Gate {
  active: boolean;
  row: number;
  z: number;
  x: number;
  kind: OpKind;
  n: number;
}

export interface GateRow {
  active: boolean;
  z: number;
  resolved: boolean;
}

export interface BossWall {
  active: boolean;
  z: number;
  hp: number;
}

export interface Powerup {
  active: boolean;
  z: number;
  x: number;
  kind: PowerupKind;
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
  color: string;
}

export interface Shard {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
  maxLife: number;
}

export interface EventCounters {
  pickGood: number;
  pickBad: number;
  smash: number;
  wallFail: number;
  wallBlock: number;
  powerup: number;
  milestone: number;
  gameover: number;
}

export interface GameState {
  phase: Phase;
  time: number;
  distance: number;
  speed: number;
  score: number;
  combo: number;
  bestCombo: number;
  mult: number;
  number: number;
  wallHp: number;
  wallsPassed: number;
  wallsSmashed: number;
  biggestSmash: number;
  shieldActive: boolean;
  scoreX2Timer: number;
  laneOffset: number;
  burstTimer: number;
  goodPicks: number;
  badPicks: number;
  powerupsTaken: number;
  events: EventCounters;
  rows: GateRow[];
  gates: Gate[];
  walls: BossWall[];
  powerups: Powerup[];
  particles: Particle[];
  shards: Shard[];
}

export const TRACE_COLUMNS = [
  "phase",
  "score",
  "distanceMilli",
  "number",
  "combo",
  "mult",
  "wallsSmashed",
  "biggestSmash",
  "shield",
  "laneOffsetMicro",
  "gatesActive",
  "wallsActive",
  "powerupsActive",
  "particlesActive",
  "shardsActive",
  "rngCount"
] as const;

const PHASE_INDEX: Record<Phase, number> = { splash: 0, playing: 1, bursting: 2, gameOver: 3 };
const NON_NEGATIVE: readonly OpKind[] = ["add", "mul2"];
const ALL_OPS: readonly OpKind[] = ["add", "mul2", "sub", "div2"];
const POWERUP_KINDS: readonly PowerupKind[] = ["plus25", "double", "shield", "x2"];
const POWERUP_LANES = [-1.6, 0, 1.6];

export function applyOp(value: number, kind: OpKind, n: number): number {
  let out: number;
  switch (kind) {
    case "add":
      out = value + n;
      break;
    case "mul2":
      out = value * 2;
      break;
    case "sub":
      out = value - n;
      break;
    case "div2":
      out = Math.ceil(value / 2);
      break;
  }
  return Math.min(CONFIG.NUMBER_CAP, Math.max(1, out));
}

export function opLabel(kind: OpKind, n: number): string {
  switch (kind) {
    case "add":
      return `+${n}`;
    case "mul2":
      return "×2";
    case "sub":
      return `−${n}`;
    case "div2":
      return "÷2";
  }
}

export class NumberSurgeSim {
  readonly o: GameState;
  readonly popups: Popup[] = [];
  private readonly rng: GameRng;
  private ye = 0;
  private dragging = false;
  private prevDown = false;
  private popupSeq = 0;
  private nextMilestone = CONFIG.MILESTONE;
  private nextWallAt = CONFIG.WALL_SPACING;
  private rowGapAcc = 0;
  private readonly traces: number[][] = [];

  constructor(seed: number) {
    this.rng = new GameRng(seed);
    this.o = {
      phase: "splash",
      time: 0,
      distance: 0,
      speed: CONFIG.SPEED_INIT,
      score: 0,
      combo: 0,
      bestCombo: 0,
      mult: 1,
      number: CONFIG.START_NUMBER,
      wallHp: 0,
      wallsPassed: 0,
      wallsSmashed: 0,
      biggestSmash: 0,
      shieldActive: false,
      scoreX2Timer: 0,
      laneOffset: 0,
      burstTimer: 0,
      goodPicks: 0,
      badPicks: 0,
      powerupsTaken: 0,
      events: {
        pickGood: 0,
        pickBad: 0,
        smash: 0,
        wallFail: 0,
        wallBlock: 0,
        powerup: 0,
        milestone: 0,
        gameover: 0
      },
      rows: Array.from({ length: CONFIG.GATES / 2 }, () => ({ active: false, z: 0, resolved: false })),
      gates: Array.from({ length: CONFIG.GATES }, (_, i) => ({
        active: false,
        row: Math.floor(i / 2),
        z: 0,
        x: CONFIG.GATE_LANES[i % 2] ?? 0,
        kind: "add" as OpKind,
        n: 0
      })),
      walls: Array.from({ length: CONFIG.WALLS }, () => ({ active: false, z: 0, hp: 0 })),
      powerups: Array.from({ length: CONFIG.POWERUPS }, () => ({
        active: false,
        z: 0,
        x: 0,
        kind: "plus25" as PowerupKind
      })),
      particles: Array.from({ length: CONFIG.PARTICLES }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        color: "#3ef2ff"
      })),
      shards: Array.from({ length: CONFIG.SHARDS }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        spin: 0,
        life: 0,
        maxLife: 1
      }))
    };
  }

  /** Number of counted gameplay RNG draws (presentation must never touch this stream). */
  get rngCount(): number {
    return this.rng.count;
  }

  /** Start / restart. Resets steering target AND drag state (C4); popup seq stays monotonic (C2). */
  begin(): void {
    const o = this.o;
    o.phase = "playing";
    o.time = 0;
    o.distance = 0;
    o.speed = CONFIG.SPEED_INIT;
    o.score = 0;
    o.combo = 0;
    o.bestCombo = 0;
    o.mult = 1;
    o.number = CONFIG.START_NUMBER;
    o.wallHp = 0;
    o.wallsPassed = 0;
    o.wallsSmashed = 0;
    o.shieldActive = false;
    o.scoreX2Timer = 0;
    o.laneOffset = 0;
    o.burstTimer = 0;
    o.goodPicks = 0;
    o.badPicks = 0;
    o.powerupsTaken = 0;
    this.ye = 0;
    this.dragging = false;
    this.prevDown = false;
    this.nextMilestone = CONFIG.MILESTONE;
    this.nextWallAt = CONFIG.WALL_SPACING;
    this.rowGapAcc = 0;
    for (const row of o.rows) {
      row.active = false;
      row.resolved = false;
    }
    for (const gate of o.gates) gate.active = false;
    for (const wall of o.walls) wall.active = false;
    for (const p of o.powerups) p.active = false;
    for (const p of o.particles) p.active = false;
    for (const s of o.shards) s.active = false;
    // Note: biggestSmash and events are run-lifetime records; biggestSmash is persisted by the shell.
    for (let z = CONFIG.SPAWN_AHEAD; z >= 40; z -= CONFIG.ROW_SPACING) this.spawnRow(z);
    this.pushPopup("GO!", "#3ef2ff", 1.2);
  }

  advance(input: Input = IDLE): void {
    const o = this.o;
    const dt = CONFIG.DT;
    o.time += dt;

    if (input.start && (o.phase === "splash" || o.phase === "gameOver")) this.begin();

    // Steering (drag target + eased lane offset), active while playing.
    if (input.down && !this.prevDown) this.dragging = true;
    if (input.up) this.dragging = false;
    this.prevDown = input.down;
    if (o.phase === "playing") {
      if (this.dragging || input.dx !== 0) {
        this.ye = clamp(this.ye + input.dx, -CONFIG.LANE_LIMIT, CONFIG.LANE_LIMIT);
      }
      o.laneOffset += (this.ye - o.laneOffset) * Math.min(1, 10 * dt);
    }

    if (o.phase === "playing") {
      o.speed = Math.min(CONFIG.MAX_SPEED, CONFIG.SPEED_INIT + o.distance * CONFIG.SPEED_RAMP);
      const dz = o.speed * dt;
      o.distance += dz;
      if (o.scoreX2Timer > 0) o.scoreX2Timer = Math.max(0, o.scoreX2Timer - dt);
      this.scrollEntities(dz);
      this.spawnRows(dz);
      this.spawnWalls();
      this.resolveRows();
      this.resolvePowerups();
      this.resolveWalls();
      this.updateWallHp();
    } else if (o.phase === "bursting") {
      o.burstTimer -= dt;
      if (o.burstTimer <= 0) {
        o.phase = "gameOver";
        o.events.gameover += 1;
      }
    }

    this.updateParticles(dt);
    this.recordTrace();
  }

  traceRow(index: number): number[] {
    return this.traces[index] ?? [];
  }

  // ---- internals ----

  private scrollEntities(dz: number): void {
    const o = this.o;
    for (const row of o.rows) {
      if (!row.active) continue;
      row.z -= dz;
      if (row.z < CONFIG.RECYCLE_BEHIND) row.active = false;
    }
    for (const gate of o.gates) {
      if (!gate.active) continue;
      gate.z -= dz;
      if (!o.rows[gate.row]?.active) gate.active = false;
    }
    for (const wall of o.walls) {
      if (wall.active) wall.z -= dz;
    }
    for (const p of o.powerups) {
      if (!p.active) continue;
      p.z -= dz;
      if (p.z < CONFIG.RECYCLE_BEHIND) p.active = false;
    }
  }

  private spawnRows(dz: number): void {
    this.rowGapAcc += dz;
    while (this.rowGapAcc >= CONFIG.ROW_SPACING) {
      this.rowGapAcc -= CONFIG.ROW_SPACING;
      this.spawnRow(CONFIG.SPAWN_AHEAD);
    }
  }

  private drawOp(): { kind: OpKind; n: number } {
    const tier = Math.floor(this.o.distance / CONFIG.WALL_SPACING);
    const nMax = Math.min(CONFIG.OP_N_MAX, 15 + tier * 10);
    const kind = ALL_OPS[Math.floor(this.rng.next() * ALL_OPS.length)] ?? "add";
    const n = kind === "add" || kind === "sub" ? CONFIG.OP_N_MIN + Math.floor(this.rng.next() * (nMax - CONFIG.OP_N_MIN + 1)) : 0;
    return { kind, n };
  }

  private spawnRow(z: number): void {
    const o = this.o;
    // Keep the approach to a boss wall clear of gate rows.
    for (const wall of o.walls) {
      if (wall.active && Math.abs(wall.z - z) < CONFIG.WALL_CLEARANCE) return;
    }
    const rowIndex = o.rows.findIndex((r) => !r.active);
    if (rowIndex < 0) return; // pool exhausted: skip spawn (never grow pools)
    const gateA = o.gates[rowIndex * 2];
    const gateB = o.gates[rowIndex * 2 + 1];
    if (!gateA || !gateB) return;
    const row = o.rows[rowIndex];
    if (!row) return;
    row.active = true;
    row.z = z;
    row.resolved = false;
    const a = this.drawOp();
    let b = this.drawOp();
    // Guarantee at least one non-negative-op gate per row.
    if (isNegative(a.kind) && isNegative(b.kind)) {
      const kind = NON_NEGATIVE[Math.floor(this.rng.next() * NON_NEGATIVE.length)] ?? "add";
      const tier = Math.floor(o.distance / CONFIG.WALL_SPACING);
      const nMax = Math.min(CONFIG.OP_N_MAX, 15 + tier * 10);
      b = { kind, n: kind === "add" ? CONFIG.OP_N_MIN + Math.floor(this.rng.next() * (nMax - CONFIG.OP_N_MIN + 1)) : 0 };
    }
    gateA.active = true;
    gateA.z = z;
    gateA.x = CONFIG.GATE_LANES[0];
    gateA.kind = a.kind;
    gateA.n = a.n;
    gateB.active = true;
    gateB.z = z;
    gateB.x = CONFIG.GATE_LANES[1];
    gateB.kind = b.kind;
    gateB.n = b.n;

    if (this.rng.next() < CONFIG.POWERUP_CHANCE) this.spawnPowerup(z - CONFIG.ROW_SPACING / 2);
  }

  private spawnPowerup(z: number): void {
    const o = this.o;
    for (const wall of o.walls) {
      if (wall.active && Math.abs(wall.z - z) < CONFIG.WALL_CLEARANCE) return;
    }
    const slot = o.powerups.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.z = z;
    slot.x = POWERUP_LANES[Math.floor(this.rng.next() * POWERUP_LANES.length)] ?? 0;
    slot.kind = POWERUP_KINDS[Math.floor(this.rng.next() * POWERUP_KINDS.length)] ?? "plus25";
  }

  private spawnWalls(): void {
    const o = this.o;
    while (this.nextWallAt - o.distance <= CONFIG.SPAWN_AHEAD) {
      const slot = o.walls.find((w) => !w.active);
      if (slot) {
        slot.active = true;
        slot.z = this.nextWallAt - o.distance;
        slot.hp = 40 + 30 * o.wallsPassed + Math.floor(this.rng.next() * 20);
        // Clear gate rows and powerups on the wall approach.
        for (const row of o.rows) {
          if (row.active && Math.abs(row.z - slot.z) < CONFIG.WALL_CLEARANCE) row.active = false;
        }
        for (const gate of o.gates) {
          if (gate.active && Math.abs(gate.z - slot.z) < CONFIG.WALL_CLEARANCE) gate.active = false;
        }
        for (const p of o.powerups) {
          if (p.active && Math.abs(p.z - slot.z) < CONFIG.WALL_CLEARANCE) p.active = false;
        }
      }
      this.nextWallAt += CONFIG.WALL_SPACING;
    }
  }

  private resolveRows(): void {
    const o = this.o;
    for (let rowIndex = 0; rowIndex < o.rows.length; rowIndex += 1) {
      const row = o.rows[rowIndex];
      if (!row || !row.active || row.resolved || row.z > 0) continue;
      row.resolved = true; // C16: exactly one resolution per row
      const gateA = o.gates[rowIndex * 2];
      const gateB = o.gates[rowIndex * 2 + 1];
      if (!gateA || !gateB || !gateA.active || !gateB.active) continue;
      const distA = Math.abs(o.laneOffset - gateA.x);
      const distB = Math.abs(o.laneOffset - gateB.x);
      const chosen = distA <= distB ? gateA : gateB;
      const other = chosen === gateA ? gateB : gateA;
      if (Math.abs(o.laneOffset - chosen.x) > CONFIG.HIT_WINDOW) {
        o.combo = 0;
        o.mult = 1;
        continue;
      }
      const before = o.number;
      const chosenResult = applyOp(before, chosen.kind, chosen.n);
      const alternativeResult = applyOp(before, other.kind, other.n);
      o.number = chosenResult;
      if (chosenResult >= alternativeResult) {
        o.combo += 1;
        o.bestCombo = Math.max(o.bestCombo, o.combo);
        o.mult = Math.min(CONFIG.MAX_MULT, 1 + Math.floor(o.combo / CONFIG.COMBO_PER_MULT));
        o.goodPicks += 1;
        o.events.pickGood += 1;
        const delta = Math.max(0, chosenResult - before);
        this.addScore(delta * o.mult);
        this.pushPopup(opLabel(chosen.kind, chosen.n), "#3ef2ff", 1);
        this.burstParticles(chosen.x, 1.2, 2, 8, "#3ef2ff");
      } else {
        o.combo = 0;
        o.mult = 1;
        o.badPicks += 1;
        o.events.pickBad += 1;
        this.pushPopup(opLabel(chosen.kind, chosen.n), "#ff4fd8", 1);
      }
    }
  }

  private resolvePowerups(): void {
    const o = this.o;
    for (const p of o.powerups) {
      if (!p.active || p.z > 0) continue;
      if (Math.abs(o.laneOffset - p.x) <= CONFIG.POWERUP_WINDOW) {
        p.active = false;
        o.powerupsTaken += 1;
        o.events.powerup += 1;
        switch (p.kind) {
          case "plus25":
            o.number = Math.min(CONFIG.NUMBER_CAP, o.number + 25);
            this.pushPopup("+25", "#ffd84d", 1);
            break;
          case "double":
            o.number = Math.min(CONFIG.NUMBER_CAP, o.number * 2);
            this.pushPopup("×2 NUMBER", "#ffd84d", 1.1);
            break;
          case "shield":
            o.shieldActive = true;
            this.pushPopup("SHIELD", "#7dff9e", 1.1);
            break;
          case "x2":
            o.scoreX2Timer = CONFIG.X2_DURATION;
            this.pushPopup("×2 SCORE", "#ffd84d", 1.1);
            break;
        }
        this.burstParticles(p.x, 1, 1, 10, "#ffd84d");
      } else if (p.z < CONFIG.RECYCLE_BEHIND) {
        p.active = false;
      }
    }
  }

  private resolveWalls(): void {
    const o = this.o;
    for (const wall of o.walls) {
      if (!wall.active || wall.z > 0) continue;
      if (o.number > wall.hp) {
        o.number = Math.max(1, o.number - wall.hp);
        this.addScore(wall.hp * 10 * o.mult);
        o.wallsSmashed += 1;
        o.wallsPassed += 1;
        o.biggestSmash = Math.max(o.biggestSmash, wall.hp);
        o.events.smash += 1;
        this.pushPopup(`SMASH ${wall.hp}!`, "#ffd84d", 1.4);
        this.burstShards(wall.z);
        this.burstParticles(0, 2, wall.z, 26, "#ffd84d");
        wall.active = false;
      } else if (o.shieldActive) {
        o.shieldActive = false;
        o.wallsPassed += 1;
        o.events.wallBlock += 1;
        this.pushPopup("BLOCKED", "#7dff9e", 1.2);
        this.burstShards(wall.z);
        wall.active = false;
      } else {
        o.wallsPassed += 1;
        o.events.wallFail += 1;
        o.phase = "bursting";
        o.burstTimer = CONFIG.BURST_SECONDS;
        this.pushPopup("TOO SMALL!", "#ff4f6d", 1.4);
        this.burstParticles(0, 1, 0, 24, "#ff4f6d");
      }
    }
  }

  private updateWallHp(): void {
    const o = this.o;
    let best = 0;
    let bestZ = Number.POSITIVE_INFINITY;
    for (const wall of o.walls) {
      if (wall.active && wall.z >= 0 && wall.z < bestZ) {
        bestZ = wall.z;
        best = wall.hp;
      }
    }
    o.wallHp = best;
  }

  private addScore(base: number): void {
    const o = this.o;
    if (base <= 0) {
      this.checkMilestone();
      return;
    }
    o.score += Math.round(base * (o.scoreX2Timer > 0 ? 2 : 1));
    this.checkMilestone();
  }

  private checkMilestone(): void {
    const o = this.o;
    while (o.score >= this.nextMilestone) {
      o.score += CONFIG.MILESTONE_BONUS;
      this.nextMilestone += CONFIG.MILESTONE;
      o.events.milestone += 1;
      this.pushPopup(`+${CONFIG.MILESTONE_BONUS} BONUS`, "#ffd84d", 1.3);
      this.burstParticles(o.laneOffset, 1.4, 0, 16, "#ffd84d");
    }
  }

  private burstParticles(x: number, y: number, z: number, count: number, color: string): void {
    let spawned = 0;
    for (const p of this.o.particles) {
      if (spawned >= count) break;
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = (this.rng.next() - 0.5) * 6;
      p.vy = 2 + this.rng.next() * 6;
      p.vz = (this.rng.next() - 0.5) * 6;
      p.maxLife = 0.5 + this.rng.next() * 0.5;
      p.life = p.maxLife;
      p.color = color;
      spawned += 1;
    }
  }

  private burstShards(z: number): void {
    let spawned = 0;
    for (const s of this.o.shards) {
      if (spawned >= 24) break;
      if (s.active) continue;
      s.active = true;
      s.x = (this.rng.next() - 0.5) * 6;
      s.y = this.rng.next() * 3.4;
      s.z = z;
      s.vx = (this.rng.next() - 0.5) * 10;
      s.vy = 2 + this.rng.next() * 8;
      s.vz = 2 + this.rng.next() * 8;
      s.spin = (this.rng.next() - 0.5) * 12;
      s.maxLife = 0.7 + this.rng.next() * 0.6;
      s.life = s.maxLife;
      spawned += 1;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.o.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 14 * dt;
    }
    for (const s of this.o.shards) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= 16 * dt;
    }
  }

  private pushPopup(text: string, color: string, size: number): void {
    this.popupSeq += 1;
    this.popups.push({ n: this.popupSeq, seq: this.popupSeq, text, color, size, at: this.o.time });
    if (this.popups.length > POPUP_LIMIT) this.popups.splice(0, this.popups.length - POPUP_LIMIT);
  }

  private recordTrace(): void {
    const o = this.o;
    this.traces.push([
      PHASE_INDEX[o.phase],
      o.score,
      Math.round(o.distance * 1000),
      o.number,
      o.combo,
      o.mult,
      o.wallsSmashed,
      o.biggestSmash,
      o.shieldActive ? 1 : 0,
      Math.round(o.laneOffset * 1e6),
      o.gates.filter((g) => g.active).length,
      o.walls.filter((w) => w.active).length,
      o.powerups.filter((p) => p.active).length,
      o.particles.filter((p) => p.active).length,
      o.shards.filter((s) => s.active).length,
      this.rng.count
    ]);
  }
}

function isNegative(kind: OpKind): boolean {
  return kind === "sub" || kind === "div2";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function replay(
  seed: number,
  warmup: number,
  inputs: readonly Input[]
): { sim: NumberSurgeSim; trace: number[][] } {
  const sim = new NumberSurgeSim(seed);
  for (let i = 0; i < warmup; i += 1) sim.advance(IDLE);
  const trace: number[][] = [];
  for (const input of inputs) {
    sim.advance(input);
    trace.push(sim.traceRow(trace.length + warmup));
  }
  return { sim, trace };
}