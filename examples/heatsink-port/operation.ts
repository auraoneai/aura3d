/**
 * Strike layer for the HEATSINK Time Trial: sentry drones and shootable barrels along the course, a bolt gun on the
 * player's existing heat meter, score with a chain multiplier, and medals. This is additive to the ported rules: it
 * only reads the player's state and writes the gun fields (`gunHeat`, `gunCd`, `gunLocked`), `takedowns` and the
 * barrels' `alive`/`respawn`, none of which feed the drone's movement, so the recorded movement replay is unchanged.
 * Pure and deterministic: the same inputs always reproduce the same score.
 */
import { CFG } from "./config";
import { clamp, seededRandom } from "./rng";
import type { Race } from "./race";
import type { Frame, Track } from "./track";
import type { Input } from "./vehicle";

export const STRIKE = {
  perLap: 16,
  seed: 9091,
  hp: { sentry: 3, heavy: 6 },
  radius: { sentry: 2.6, heavy: 3.4 },
  barrelRadius: 1.8,
  /**
   * barrels are hit as a vertical capsule from the road up to this height (m), so a bolt fired at the drone's hover
   * height (CFG.vehicle.hover, 5.3 m above the road) connects; a sphere at the barrel's centre sat ~4 m below every
   * bolt (HP-02)
   */
  barrelHitTop: 6,
  /** extra reach added to every hit sphere (aim assist, the original's `weapons.assist` scaled for a single sphere) */
  assistSlack: 1.5,
  hoverHeight: 5,
  boltPool: 24,
  boltMuzzle: 3,
  boltDamage: CFG.weapons.playerDmg,
  blastRadius: 14,
  blastDamage: 3,
  barrelRespawn: 25,
  /** shortest chain window (s); the window stretches to reach the next target at the current speed (HP-11) */
  comboWindow: 3,
  /** seconds of slack added to the travel time to the next target */
  comboSlack: 1.5,
  comboWindowMax: 9,
  /** speed floor (m/s) used for the travel time, so a near-stop does not hold the chain open forever */
  comboMinSpeed: 30,
  multiplierMax: 5,
  score: { sentry: 100, heavy: 250, barrel: 150, boostPad: 25, checkpoint: 100, pickup: 50, cleanLap: 500 },
  /**
   * kills needed (of `perLap` x laps) to finish with each medal; the race must be finished, not a DNF. Gold also needs
   * the race finished within `goldTime` seconds, so it rewards fast and accurate driving rather than crawling (HP-14).
   */
  medals: { bronze: 16, silver: 30, gold: 36 },
  goldTime: 300
} as const;

export type TargetKind = "sentry" | "heavy";
export type Medal = "none" | "bronze" | "silver" | "gold";

export interface StrikeTarget {
  readonly id: number;
  readonly kind: TargetKind;
  readonly s: number;
  readonly x: number;
  readonly world: { x: number; y: number; z: number };
  readonly maxHp: number;
  hp: number;
  alive: boolean;
}

export interface Bolt {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  life: number;
}

export interface StrikeEvent {
  step: number;
  type: "fire" | "hit" | "kill" | "barrel" | "chain" | "lap" | "medal";
  detail?: number | string;
  world?: { x: number; y: number; z: number };
}

/** first hit parameter (0..1) of the segment a->b against a sphere, or -1 */
export function segmentSphere(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, r: number): number {
  const sx = bx - ax, sy = by - ay, sz = bz - az;
  const len2 = sx * sx + sy * sy + sz * sz;
  const t = len2 > 0 ? clamp(((cx - ax) * sx + (cy - ay) * sy + (cz - az) * sz) / len2, 0, 1) : 0;
  const px = ax + sx * t - cx, py = ay + sy * t - cy, pz = az + sz * t - cz;
  return px * px + py * py + pz * pz <= r * r ? t : -1;
}

/**
 * first hit parameter (0..1) of the segment a->b against a vertical capsule (axis from (cx, y0, cz) to (cx, y1, cz),
 * radius r), or -1. The closest approach is taken in the ground plane, which is exact for the level bolts the gun fires.
 */
export function segmentVerticalCapsule(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, y0: number, y1: number, cz: number, r: number): number {
  const sx = bx - ax, sz = bz - az;
  const len2 = sx * sx + sz * sz;
  const t = len2 > 0 ? clamp(((cx - ax) * sx + (cz - az) * sz) / len2, 0, 1) : 0;
  const px = ax + sx * t - cx, pz = az + sz * t - cz;
  const y = ay + (by - ay) * t;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return px * px + pz * pz + dy * dy <= r * r ? t : -1;
}

export class Operation {
  readonly targets: StrikeTarget[] = [];
  readonly bolts: Bolt[] = [];
  readonly events: StrikeEvent[] = [];
  score = 0;
  kills = 0;
  barrelsShot = 0;
  shots = 0;
  hits = 0;
  chain = 0;
  bestChain = 0;
  chainT = 0;
  lapClean = true;
  medal: Medal = "none";
  private seen = 0;
  private step = 0;
  private player: { takedowns: number; s: number; v: number } | null = null;
  private race: Race | null = null;
  private nextBolt = 0;
  private readonly frameScratch: Partial<Frame> = {};
  private readonly worldScratch = { x: 0, y: 0, z: 0 };

  constructor(private readonly track: Track) {
    const rng = seededRandom(STRIKE.seed);
    const spacing = track.length / STRIKE.perLap;
    for (let i = 0; i < STRIKE.perLap; i++) {
      const s = track.wrap(spacing * (i + 0.5) + (rng() - 0.5) * spacing * 0.5);
      const fr = track.frame(s, this.frameScratch) as Frame;
      const x = (rng() * 2 - 1) * fr.hw * 0.55;
      const y = fr.y + track.latY(s, x) + STRIKE.hoverHeight;
      const kind: TargetKind = i % 4 === 3 ? "heavy" : "sentry";
      const maxHp = STRIKE.hp[kind];
      this.targets.push({ id: i, kind, s, x, world: track.toWorld(s, x, y), maxHp, hp: maxHp, alive: true });
    }
    for (let i = 0; i < STRIKE.boltPool; i++) this.bolts.push({ alive: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, life: 0 });
  }

  get multiplier(): number {
    return Math.min(STRIKE.multiplierMax, 1 + Math.floor(this.chain / 2));
  }

  /** total kills available over the whole race */
  get totalTargets(): number {
    return STRIKE.perLap * CFG.track.laps;
  }

  reset(): void {
    for (const t of this.targets) { t.hp = t.maxHp; t.alive = true; }
    for (const b of this.bolts) b.alive = false;
    this.events.length = 0;
    this.score = 0;
    this.kills = 0;
    this.barrelsShot = 0;
    this.shots = 0;
    this.hits = 0;
    this.chain = 0;
    this.bestChain = 0;
    this.chainT = 0;
    this.lapClean = true;
    this.medal = "none";
    this.seen = 0;
    this.step = 0;
    this.nextBolt = 0;
  }

  /** the medal a finished race earns for `kills` in `time` seconds (no time given: the kill thresholds alone) */
  medalFor(kills: number, time = 0): Medal {
    if (kills >= STRIKE.medals.gold && time <= STRIKE.goldTime) return "gold";
    return kills >= STRIKE.medals.silver ? "silver" : kills >= STRIKE.medals.bronze ? "bronze" : "none";
  }

  /**
   * seconds the chain stays open after a kill: the travel time to the next live target or barrel ahead at the current
   * speed plus slack, never under `comboWindow` (targets sit 350 to 460 m apart, 3 s or more at top speed)
   */
  chainWindow(): number {
    const race = this.race;
    const p = this.player;
    if (!race || !p) return STRIKE.comboWindow;
    let gap = Infinity;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const d = -this.track.wrapDelta(p.s, t.s);
      if (d > 1 && d < gap) gap = d;
    }
    for (const b of race.barrels) {
      if (!b.alive) continue;
      const d = -this.track.wrapDelta(p.s, b.s);
      if (d > 1 && d < gap) gap = d;
    }
    if (!Number.isFinite(gap)) return STRIKE.comboWindow;
    const travel = gap / Math.max(STRIKE.comboMinSpeed, p.v) + STRIKE.comboSlack;
    return Math.min(STRIKE.comboWindowMax, Math.max(STRIKE.comboWindow, travel));
  }

  nextMedal(): { medal: Exclude<Medal, "none">; needed: number } | null {
    const k = this.kills;
    if (k < STRIKE.medals.bronze) return { medal: "bronze", needed: STRIKE.medals.bronze };
    if (k < STRIKE.medals.silver) return { medal: "silver", needed: STRIKE.medals.silver };
    if (k < STRIKE.medals.gold) return { medal: "gold", needed: STRIKE.medals.gold };
    return null;
  }

  /** one simulation substep, called by `Race` after the props update so the race state is current */
  advance(e: number, input: Input, race: Race): void {
    this.step++;
    const p = race.player;
    this.player = p;
    this.race = race;
    this.consumeRaceEvents(race);
    this.chainT -= e;
    if (this.chainT <= 0) this.chain = 0;

    if (input.fire && race.state === "race" && !p.crashed && !p.finished && p.gunCd <= 0 && !p.gunLocked) this.fire(p, race);

    for (const b of this.bolts) if (b.alive) this.moveBolt(b, e, race);

    if (race.state === "finished" && this.medal === "none") {
      this.medal = this.medalFor(this.kills, race.player.finishTime);
      this.events.push({ step: this.step, type: "medal", detail: this.medal });
    }
  }

  private consumeRaceEvents(race: Race): void {
    if (this.seen > race.events.length) this.seen = 0;
    for (; this.seen < race.events.length; this.seen++) {
      const ev = race.events[this.seen] as { type: string };
      if (ev.type === "boostPad") this.score += STRIKE.score.boostPad;
      else if (ev.type === "checkpoint") this.score += STRIKE.score.checkpoint;
      else if (ev.type === "pickup") this.score += STRIKE.score.pickup;
      else if (ev.type === "crash") { this.chain = 0; this.chainT = 0; this.lapClean = false; }
      else if (ev.type === "lap") {
        if (this.lapClean) this.score += STRIKE.score.cleanLap;
        this.lapClean = true;
        for (const t of this.targets) { t.hp = t.maxHp; t.alive = true; }
        this.events.push({ step: this.step, type: "lap" });
      }
    }
  }

  private fire(p: Race["player"], race: Race): void {
    const W = CFG.weapons;
    const fr = this.track.frame(p.s, this.frameScratch) as Frame;
    const hd = Math.cos(p.theta), hs = Math.sin(p.theta);
    const dx = fr.tx * hd + fr.rx * hs, dz = fr.tz * hd + fr.rz * hs;
    const len = Math.hypot(dx, dz) || 1;
    const b = this.bolts[this.nextBolt % this.bolts.length] as Bolt;
    this.nextBolt++;
    b.alive = true;
    b.dx = dx / len; b.dy = 0; b.dz = dz / len;
    b.x = p.position.x + b.dx * STRIKE.boltMuzzle;
    b.y = p.position.y;
    b.z = p.position.z + b.dz * STRIKE.boltMuzzle;
    b.life = W.life;
    p.gunCd = W.rate;
    p.gunHeat += W.heatPerShot;
    if (p.gunHeat >= 1) { p.gunHeat = 1; p.gunLocked = true; }
    this.shots++;
    this.events.push({ step: this.step, type: "fire" });
    void race;
  }

  private moveBolt(b: Bolt, e: number, race: Race): void {
    const W = CFG.weapons;
    const nx = b.x + b.dx * W.speed * e, ny = b.y + b.dy * W.speed * e, nz = b.z + b.dz * W.speed * e;
    let bestT = 2;
    let hitTarget: StrikeTarget | null = null;
    let hitBarrel = -1;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const r = STRIKE.radius[t.kind] + STRIKE.assistSlack;
      const k = segmentSphere(b.x, b.y, b.z, nx, ny, nz, t.world.x, t.world.y, t.world.z, r);
      if (k >= 0 && k < bestT) { bestT = k; hitTarget = t; hitBarrel = -1; }
    }
    for (let i = 0; i < race.barrels.length; i++) {
      const bar = race.barrels[i] as Race["barrels"][number];
      if (!bar.alive) continue;
      const w = this.track.toWorld(bar.s, bar.x, bar.y, this.worldScratch);
      const k = segmentVerticalCapsule(b.x, b.y, b.z, nx, ny, nz, w.x, bar.y, bar.y + STRIKE.barrelHitTop, w.z, STRIKE.barrelRadius + STRIKE.assistSlack);
      if (k >= 0 && k < bestT) { bestT = k; hitTarget = null; hitBarrel = i; }
    }
    if (hitTarget) {
      b.alive = false;
      this.hits++;
      this.damage(hitTarget, STRIKE.boltDamage);
      return;
    }
    if (hitBarrel >= 0) {
      b.alive = false;
      this.hits++;
      this.shootBarrel(hitBarrel, race);
      return;
    }
    b.x = nx; b.y = ny; b.z = nz;
    b.life -= e;
    if (b.life <= 0) b.alive = false;
  }

  private damage(t: StrikeTarget, amount: number): void {
    t.hp -= amount;
    if (t.hp > 0) {
      this.events.push({ step: this.step, type: "hit", detail: t.id, world: t.world });
      return;
    }
    t.alive = false;
    t.hp = 0;
    this.kills++;
    if (this.player) this.player.takedowns++;
    this.chain++;
    if (this.chain > this.bestChain) this.bestChain = this.chain;
    this.chainT = this.chainWindow();
    this.score += STRIKE.score[t.kind] * this.multiplier;
    this.events.push({ step: this.step, type: "kill", detail: t.id, world: t.world });
    if (this.chain >= 2) this.events.push({ step: this.step, type: "chain", detail: this.multiplier });
  }

  private shootBarrel(index: number, race: Race): void {
    const bar = race.barrels[index] as Race["barrels"][number];
    bar.alive = false;
    bar.respawn = STRIKE.barrelRespawn;
    this.barrelsShot++;
    this.chain++;
    if (this.chain > this.bestChain) this.bestChain = this.chain;
    this.chainT = this.chainWindow();
    this.score += STRIKE.score.barrel * this.multiplier;
    const w = this.track.toWorld(bar.s, bar.x, bar.y + 1.1);
    this.events.push({ step: this.step, type: "barrel", detail: index, world: w });
    for (const t of this.targets) {
      if (!t.alive) continue;
      const dx = t.world.x - w.x, dy = t.world.y - w.y, dz = t.world.z - w.z;
      if (dx * dx + dy * dy + dz * dz <= STRIKE.blastRadius * STRIKE.blastRadius) this.damage(t, STRIKE.blastDamage);
    }
  }

  /** FNV-1a over the score, counts and event list: the strike replay's determinism fingerprint */
  hash(): string {
    let h = 0x811c9dc5;
    const mix = (n: number): void => {
      h ^= n | 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    };
    mix(this.score); mix(this.kills); mix(this.barrelsShot); mix(this.shots); mix(this.hits); mix(this.bestChain);
    for (const ev of this.events) {
      mix(ev.step);
      mix(ev.type.length * 31 + (ev.type.charCodeAt(0) | 0));
      if (typeof ev.detail === "number") mix(ev.detail);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
}
