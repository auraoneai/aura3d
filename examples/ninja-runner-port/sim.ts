/**
 * Ninja Runner simulation: a pure, fixed-step model transcribed from the original game's logic
 * (`uf`/`sS`/`Vs`/`pf` and helpers). Operation order is preserved so a replay of the same action
 * script reproduces the original's state bit for bit. No DOM, no rendering, no wall-clock time.
 *
 * Time model: the original advances `step(state, 1/120)` from an accumulator; actions are applied at
 * step boundaries (a key press lands between two steps). `SIM_STEP` is that 1/120 s.
 */
import { COURSE_LENGTH, GAPS, gapAhead, gapAt, laneOffset, nearGap } from "./course";

export const SIM_STEP = 1 / 120;
export const DEFAULT_SEED = 17;
/** Today's course seed: the UTC date as YYYYMMDD, so every player gets the same course on a given day (`?daily=1`). */
export const dailySeed = (date: Date = new Date()): number => date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

export const TUNING = Object.freeze({
  length: COURSE_LENGTH, laneWidth: 2.35, baseSpeed: 18, maxSpeed: 25, gravity: 25, jumpVelocity: 10.4,
  attackDuration: 0.78, attackCooldown: 0.25, attackCost: 14, attackReach: 4.6, dashCost: 38, dashDuration: 1.2,
  health: 5, hitSpiritCost: 35, stumbleDuration: 1.1, maxSpirit: 300, spiritRegen: 12, hitProtection: 6,
  cloneCost: 60, cloneDuration: 6, cloneCooldown: 10, shurikenCost: 75, shurikenCooldown: 4, shurikenWindup: 0.55
});

export type Form = "base" | "sage" | "beast";
export type Phase = "intro" | "running" | "paused" | "won" | "lost";
export type EnemyKind = "scout" | "swordsman" | "caster" | "heavy";
export type EntityKind = EnemyKind | "barrier" | "beam" | "spirit";
export type Action = "left" | "right" | "jump" | "slide" | "spiralorb" | "dash" | "clones" | "spiralstar" | "cycleForm" | Form;

/** Distance at which each form unlocks. */
export const FORM_UNLOCK: Readonly<Record<Form, number>> = Object.freeze({ base: 0, sage: 600, beast: 1620 });
export const formUnlocked = (state: { s: number }, form: Form): boolean => state.s >= FORM_UNLOCK[form];

export interface EnemySpec { name: string; attack: string; range: number; windup: number; speed: number; height: number; hint: string }

export const ENEMIES: Readonly<Record<EnemyKind, EnemySpec>> = Object.freeze({
  scout: { name: "Fox scout", attack: "dart", range: 32, windup: 0.8, speed: 22, height: 1.2, hint: "Dart · dodge, slide or deflect" },
  swordsman: { name: "Hawk swordsman", attack: "slash", range: 22, windup: 0.68, speed: 16, height: 1.2, hint: "Sword rush · dodge or Spiralorb" },
  caster: { name: "Owl caster", attack: "fire", range: 36, windup: 0.88, speed: 19, height: 1.5, hint: "Fire style · slide or deflect" },
  heavy: { name: "Boar guardian", attack: "wave", range: 33, windup: 0.86, speed: 17, height: 0.32, hint: "Spirit shockwave · jump or dodge" }
});

export const isEnemy = (e: { type: string }): boolean => Object.prototype.hasOwnProperty.call(ENEMIES, e.type);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface Intent { type: string; stage: "windup" | "release" | "recover"; timer: number; duration: number; progress: number; lane: number }

export interface Entity {
  id: number; s: number; lane: number; type: EntityKind; hp: number; alive: boolean; hitBy: number; stagger: number;
  warning: boolean; defeatedAt: number; intent: Intent | null; hasAttacked: boolean; variant: number; approach: boolean;
  dropIn: boolean; dropAge: number; y: number; approachSpeed: number; runSpeed: number;
  value?: number; opening?: boolean; path?: number; passed?: boolean;
}

export interface Projectile {
  id: number; owner: number; type: string; lane: number; s: number; startX: number; x: number; targetX: number;
  flight: number; speed: number; y: number; age: number; alive: boolean;
}

export interface Shuriken { id: number; s: number; x: number; age: number; hits: number[] }

export interface SimEvent { type: string; [key: string]: unknown }

export interface SimState {
  phase: Phase; time: number; s: number; x: number; lane: number; y: number; vy: number; speed: number; health: number;
  spirit: number; attack: number; attackCooldown: number; attackSerial: number; attackStartedAt: number; lastStrikeAt: number;
  shurikenStartedAt: number; shurikenCast: number; dash: number; dashCooldown: number; slide: number; invulnerable: number;
  combo: number; bestCombo: number; comboTimer: number; kills: number; score: number; damageTaken: number; attacksFired: number;
  deflections: number; interrupts: number; projectileSerial: number; projectiles: Projectile[]; entities: Entity[];
  events: SimEvent[]; lastStep: number; form: Form; clones: number; cloneCooldown: number; clonePulse: number;
  cloneStrikes: number; shurikenCooldown: number; shurikens: Shuriken[]; techniqueSerial: number; vaults: number;
  lastVault: number; falling: boolean; stumble: number; announcedUnlocks: string[];
  /** Reworked contact rules (see `RAM`): off reproduces the original bit for bit. */
  ram: boolean; stumbleDrag: number;
}

/** xorshift32 in [0, 1). Original `iS`. */
export function seededRandom(seed: number): () => number {
  let e = seed | 0;
  return () => ((e ^= e << 13), (e ^= e >>> 17), (e ^= e << 5), (e >>> 0) / 4294967296);
}

/** Enemy density ramp along the course. Original `n0`. */
export function difficultyAt(s: number): { progress: number; spacing: number; runSpeed: number; pairChance: number; armorChance: number } {
  const e = clamp((s - 160) / (TUNING.length - 160), 0, 1);
  return { progress: e, spacing: 32 - 12 * e, runSpeed: 3.2 + 4 * e, pairChance: 0.1 + 0.8 * e, armorChance: 0.42 * e };
}

/** Course population: enemies, obstacles and spirit pickups, deterministic in `seed`. Original `sS`. */
export function generateEntities(seed: number = DEFAULT_SEED): Entity[] {
  const rand = seededRandom(seed);
  const list: Entity[] = [];
  let n = 0;
  const add = (s: number, lane: number, type: EntityKind): Entity => {
    const d = difficultyAt(s);
    const hostile = Object.prototype.hasOwnProperty.call(ENEMIES, type);
    const entity: Entity = {
      id: n++, s, lane, type, hp: type === "heavy" ? 2 : 1, alive: true, hitBy: -1, stagger: 0, warning: false, defeatedAt: 0,
      intent: null, hasAttacked: false, variant: n % 2, approach: hostile, dropIn: hostile && s >= 1640 && s < 2100 && n % 3 === 0,
      dropAge: -1, y: 0, approachSpeed: 0, runSpeed: d.runSpeed * (type === "heavy" ? 0.78 : 1)
    };
    list.push(entity);
    return entity;
  };
  const pickups = (s: number, lane: number): void => {
    for (const back of [18, 14, 10]) add(s - back, lane, "spirit").value = 8;
  };
  for (let l = 58, c = 0; l < TUNING.length - 210; c++) {
    const h = difficultyAt(l);
    if (!(l >= 550 && l < 1000) && !nearGap(l, 18)) {
      const d = c === 0 ? 0 : Math.floor(rand() * 3) - 1;
      const kind: EntityKind = c % 7 === 4 ? "barrier" : c % 7 === 6 ? "beam" : rand() < h.armorChance ? "heavy" : (["scout", "swordsman", "caster"] as const)[c % 3]!;
      const f = add(l, d, kind);
      if (c === 0) f.opening = true;
      if (c > 3 && isEnemy(f) && rand() < h.pairChance) add(l, d === 1 ? -1 : d + 1, c % 2 ? "scout" : "swordsman");
      pickups(l, d);
      if (c % 3 === 0) add(l + 12, -d, "spirit");
    }
    l += h.spacing;
  }
  let a = 550;
  let o = 0;
  const rooftopGaps: [number, number][] = [...GAPS.filter(([h]) => h >= 550 && h < 1000).map(([x, y]) => [x, y] as [number, number]), [1000, 1000]];
  for (const [l, c] of rooftopGaps) {
    if (l - a >= 30) {
      const h = (a + l) / 2;
      const d = [0, -1, 1][o % 3]!;
      add(h, d, o >= 4 && o % 3 === 1 ? "heavy" : o % 2 ? "swordsman" : "scout");
      add(h, d === 1 ? -1 : d + 1, o % 2 ? "caster" : "swordsman");
      pickups(h, d);
      o++;
    }
    a = c;
  }
  for (let l = 0; l < 6; l++) {
    const c = TUNING.length - 174 + l * 27;
    const h = [-1, 0, 1, 0, -1, 1][l]!;
    add(c, h, "heavy").path = l + 1;
    add(c, h === 1 ? -1 : h + 1, l % 2 ? "scout" : "swordsman");
    pickups(c, h);
  }
  return list.filter((l) => !nearGap(l.s, 10)).sort((l, c) => l.s - c.s || l.id - c.id);
}

/**
 * Contact rules for solid obstacles (barrier crates and beams), active only with `createState(seed, { ram: true })`.
 * The original lets a runner hit a crate and pass through the space where it stood at 68% speed; here the hit stops the
 * runner (`stumbleDrag` is the share of speed lost at the instant of impact, recovering as the stumble ends), knocks
 * it back along the course, and reports an impact tier so the renderer can break the crate by how hard it was hit.
 */
export const RAM = Object.freeze({
  /** Impact speed (m/s) from which a hit is a crash instead of a bump. */
  crashSpeed: 21.5,
  bumpKnockback: 0.55, crashKnockback: 0.95,
  bumpDrag: 0.7, crashDrag: 0.88
});

export type RamTier = "bump" | "crash" | "glance";

export interface CreateStateOptions { ram?: boolean }

/** A fresh run, in the intro phase. Original `uf`. */
export function createState(seed: number = DEFAULT_SEED, options: CreateStateOptions = {}): SimState {
  return {
    phase: "intro", time: 0, s: 0, x: 0, lane: 0, y: 0, vy: 0, speed: TUNING.baseSpeed, health: TUNING.health, spirit: TUNING.maxSpirit,
    attack: 0, attackCooldown: 0, attackSerial: 0, attackStartedAt: -100, lastStrikeAt: -100, shurikenStartedAt: -100, shurikenCast: 0,
    dash: 0, dashCooldown: 0, slide: 0, invulnerable: 0, combo: 0, bestCombo: 0, comboTimer: 0, kills: 0, score: 0, damageTaken: 0,
    attacksFired: 0, deflections: 0, interrupts: 0, projectileSerial: 0, projectiles: [], entities: generateEntities(seed), events: [],
    lastStep: 0, form: "base", clones: 0, cloneCooldown: 0, clonePulse: 0, cloneStrikes: 0, shurikenCooldown: 0, shurikens: [],
    techniqueSerial: 0, vaults: 0, lastVault: -1, falling: false, stumble: 0, announcedUnlocks: ["base"],
    ram: options.ram === true, stumbleDrag: 0.32
  };
}

/** Leave the intro: phase -> running, emits `start`. Original `df`. */
export function startRun(state: SimState): boolean {
  if (state.phase !== "intro") return false;
  state.phase = "running";
  state.events.push({ type: "start" });
  return true;
}

/** Apply one player action. Returns whether it had an effect. Original `Vs`. */
export function applyAction(state: SimState, action: Action): boolean {
  if (state.phase !== "running" || state.falling) return false;
  let e: Action = action;
  if (e === "cycleForm") {
    const unlocked = (["sage", "beast"] as const).filter((n) => formUnlocked(state, n));
    if (!unlocked.length) return false;
    e = unlocked[(unlocked.indexOf(state.form as "sage" | "beast") + 1) % unlocked.length]!;
  }
  if (e === "base" || e === "sage" || e === "beast") {
    if (state.form === e || !formUnlocked(state, e)) return false;
    state.form = e;
    state.events.push({ type: "form", form: e });
    return true;
  }
  if (e === "clones" && state.cloneCooldown <= 0 && state.spirit >= TUNING.cloneCost) {
    state.spirit -= TUNING.cloneCost;
    state.clones = TUNING.cloneDuration;
    state.cloneCooldown = TUNING.cloneCooldown;
    state.clonePulse = 0;
    state.events.push({ type: "clones" });
    return true;
  }
  if (e === "spiralstar" && state.shurikenCooldown <= 0 && state.attack <= 0 && state.spirit >= TUNING.shurikenCost) {
    state.spirit -= TUNING.shurikenCost;
    state.shurikenCooldown = TUNING.shurikenCooldown;
    state.shurikenCast = TUNING.shurikenWindup;
    state.shurikenStartedAt = state.time;
    state.events.push({ type: "spiralstar" });
    return true;
  }
  if (e === "left") { state.lane = clamp(state.lane - 1, -1, 1); return true; }
  if (e === "right") { state.lane = clamp(state.lane + 1, -1, 1); return true; }
  if (e === "jump" && state.y <= 0.03 && state.vy <= 0 && !gapAt(state.s)) {
    state.slide = 0;
    state.vy = TUNING.jumpVelocity;
    state.events.push({ type: "jump" });
    return true;
  }
  if (e === "slide") {
    state.slide = 0.68;
    if (state.y > 0) state.vy = Math.min(state.vy, -18);
    return true;
  }
  if (e === "spiralorb" && state.attack <= 0 && state.shurikenCast <= 0 && state.attackCooldown <= 0 && state.spirit >= TUNING.attackCost) {
    state.slide = 0;
    state.attack = TUNING.attackDuration;
    state.attackSerial++;
    state.attackStartedAt = state.time;
    state.spirit -= TUNING.attackCost;
    state.events.push({ type: "spiralorb" });
    return true;
  }
  if (e === "dash" && state.dash <= 0 && state.dashCooldown <= 0 && state.spirit >= TUNING.dashCost) {
    state.dash = TUNING.dashDuration;
    state.dashCooldown = 2.2;
    state.spirit -= TUNING.dashCost;
    state.attackSerial++;
    state.slide = 0;
    state.events.push({ type: "dash" });
    return true;
  }
  return false;
}

/** The runner takes a hit (unless protected or dashing). Original `ff`. */
function damage(i: SimState, source: { id: number }, kind = "contact"): void {
  if (i.invulnerable > 0 || i.dash > 0) return;
  i.health--;
  i.damageTaken++;
  i.spirit = Math.max(0, i.spirit - TUNING.hitSpiritCost);
  i.stumble = TUNING.stumbleDuration;
  i.stumbleDrag = 0.32;
  i.invulnerable = TUNING.hitProtection + (i.form === "beast" ? 2 : 0);
  i.combo = 0;
  i.comboTimer = 0;
  i.events.push({ type: "damage", entity: source.id, source: kind });
  if (i.health <= 0) {
    i.phase = "lost";
    i.events.push({ type: "lost" });
  }
}

/** A solid obstacle was hit unavoided (reworked rules only): classify the impact, stop and knock the runner back, report it. A dash or attack breaks a crate before contact (the original's `break` event), so it never reaches here. */
function ram(i: SimState, r: Entity, impactSpeed: number, protectedRun: boolean): void {
  const tier: RamTier = protectedRun ? "glance" : impactSpeed >= RAM.crashSpeed ? "crash" : "bump";
  if (tier !== "glance") {
    const crash = tier === "crash";
    i.s = Math.max(0, i.s - (crash ? RAM.crashKnockback : RAM.bumpKnockback));
    i.stumbleDrag = crash ? RAM.crashDrag : RAM.bumpDrag;
  }
  i.events.push({ type: "ram", entity: r.id, kind: r.type, tier, speed: impactSpeed, lane: r.lane, s: r.s, x: i.x, health: i.health });
}

/** Strike an enemy (`serial` de-duplicates one swing; `power` is damage). Original `cf`. */
function strike(i: SimState, e: Entity, serial: number = i.attackSerial, power = 1): void {
  if (e.hitBy === serial) return;
  if (serial === i.attackSerial) i.lastStrikeAt = i.time;
  e.hitBy = serial;
  e.hp -= power;
  e.stagger = 0.6;
  if (e.intent?.stage === "windup" || e.intent?.stage === "release") {
    i.interrupts++;
    i.events.push({ type: "interrupt", entity: e.id, lane: e.lane, s: e.s });
  }
  e.intent = null;
  e.hasAttacked = true;
  if (e.hp <= 0) {
    e.alive = false;
    e.defeatedAt = i.time;
    i.kills++;
    i.combo++;
    i.bestCombo = Math.max(i.bestCombo, i.combo);
    i.comboTimer = 4.1;
    i.score += Math.round((e.type === "heavy" ? 250 : e.type === "swordsman" || e.type === "caster" ? 150 : 100) * (1 + Math.min(i.combo - 1, 9) * 0.2));
    i.spirit = clamp(i.spirit + 10, 0, TUNING.maxSpirit);
    i.events.push({ type: "kill", entity: e.id, lane: e.lane, s: e.s, heavy: e.type === "heavy", combo: i.combo });
  } else {
    e.s += 12;
    i.attack = Math.min(i.attack, 0.1);
    i.events.push({ type: "armorBreak", entity: e.id, lane: e.lane, s: e.s - 12 });
  }
}

/** Enemy attack state machine (windup -> release -> recover). Original `rS`. */
function enemyAttack(i: SimState, e: Entity, t: number): void {
  const spec = (ENEMIES as Record<string, EnemySpec | undefined>)[e.type];
  const s = e.s - i.s;
  if (!spec || e.stagger > 0 || s < -2) return;
  const attack = e.opening ? "slash" : spec.attack;
  const range = e.opening ? 9 : spec.range;
  const windup = e.opening ? 0.32 : spec.windup;
  if (!e.intent && !e.hasAttacked && s < range && s > 5) {
    e.intent = { type: attack, stage: "windup", timer: windup, duration: windup, progress: 0, lane: attack === "slash" ? e.lane : i.lane };
    i.events.push({ type: "enemyWindup", entity: e.id, kind: e.type, lane: e.intent.lane, attack, s: e.s });
  }
  if (!e.intent) return;
  const intent = e.intent;
  intent.timer -= t;
  intent.progress = clamp(1 - intent.timer / intent.duration, 0, 1);
  if (intent.stage === "windup" && intent.timer <= 0) {
    e.hasAttacked = true;
    intent.stage = "release";
    intent.duration = 0.48;
    intent.timer = 0.48;
    intent.progress = 0;
    i.attacksFired++;
    i.events.push({ type: "enemyAttack", entity: e.id, kind: e.type, attack, lane: intent.lane, s: e.s });
    if (attack !== "slash") {
      const from = e.lane * laneOffset(e.s);
      const to = intent.lane * laneOffset(i.s);
      i.projectiles.push({
        id: i.projectileSerial++, owner: e.id, type: attack, lane: intent.lane, s: e.s - 0.75, startX: from, x: from, targetX: to,
        flight: Math.max(0.14, (e.s - i.s) / (spec.speed + i.speed)), speed: spec.speed, y: spec.height, age: 0, alive: true
      });
    }
  } else if (intent.stage === "release") {
    if (attack === "slash") {
      e.s -= spec.speed * t;
      const c = e.s - i.s;
      if (c < 2.6 && c > -0.8 && Math.abs(i.x - e.lane * laneOffset(e.s)) < 0.96 && i.y < 1.4) damage(i, e, "slash");
    }
    if (intent.timer <= 0) {
      intent.stage = "recover";
      intent.duration = 0.5;
      intent.timer = 0.5;
    }
  } else if (intent.stage === "recover" && intent.timer <= 0) e.intent = null;
}

/** Hostile enemies close in on the runner (and drop in from above in the forest). Original `aS`. */
function approach(i: SimState, e: Entity, t: number): void {
  const n = e.s - i.s;
  e.approachSpeed = 0;
  if (e.dropIn && e.dropAge < 0 && n < 80 && n > 40) {
    e.dropAge = 0;
    e.y = 9;
    i.events.push({ type: "dropWarning", entity: e.id, s: e.s, lane: e.lane });
  }
  if (e.dropAge >= 0 && e.dropAge < 1) {
    e.dropAge = Math.min(1, e.dropAge + t);
    e.y = 9 * (1 - e.dropAge) ** 2;
    if (e.dropAge === 1) {
      e.y = 0;
      i.events.push({ type: "enemyLand", entity: e.id, s: e.s, lane: e.lane });
    }
    return;
  }
  if (e.dropIn && e.dropAge < 0) return;
  const s = e.runSpeed ?? (e.type === "heavy" ? 2.5 : 3.2);
  if (n < 48 && n > 0 && e.stagger <= 0 && !nearGap(e.s - s * t, 14)) {
    e.approachSpeed = s;
    e.s -= s * t;
  }
}

/** Enemy projectiles fly in, are deflected, dodged or hit. Original `oS`. */
function updateProjectiles(i: SimState, prevS: number, t: number): void {
  let n = 0;
  for (const p of i.projectiles) {
    if (!p.alive) continue;
    const r = p.s - prevS;
    p.s -= p.speed * t;
    p.age += t;
    p.x = p.startX + (p.targetX - p.startX) * clamp(p.age / p.flight, 0, 1);
    const a = p.s - i.s;
    const o = Math.abs(i.x - p.x);
    if (a >= -0.7 && a < 3.1 && o < 1.05 && (i.attack > 0 || i.dash > 0) && i.y < 1.65) {
      p.alive = false;
      i.deflections++;
      i.score += 30;
      i.spirit = clamp(i.spirit + 5, 0, TUNING.maxSpirit);
      i.events.push({ type: "deflect", entity: p.id, lane: p.lane, s: p.s, attack: p.type });
    } else if (r >= -0.55 && a <= 0.55) {
      const avoided = p.type === "wave" ? i.y > 0.63 : p.type === "fire" ? i.slide > 0 || i.y > 1.65 : i.slide > 0 || i.y > 1.27;
      if (o < (p.type === "wave" ? 1.13 : 0.78) && !avoided) damage(i, p, p.type);
      p.alive = false;
    }
    if (p.age > 4 || a < -5) p.alive = false;
    if (p.alive) i.projectiles[n++] = p;
  }
  i.projectiles.length = n;
}

/** Clone strikes and Spiralstar. Original `lS`. */
function updateTechnique(i: SimState, t: number): void {
  if (i.shurikenCast > 0) {
    i.shurikenCast = Math.max(0, i.shurikenCast - t);
    if (i.shurikenCast === 0) {
      i.shurikens.push({ id: ++i.techniqueSerial, s: i.s + 1, x: i.x, age: 0, hits: [] });
      i.events.push({ type: "shurikenRelease" });
    }
  }
  if (i.clones > 0 && ((i.clonePulse -= t), i.clonePulse <= 0)) {
    i.clonePulse = 0.7;
    const targets = i.entities.filter((s) => s.alive && isEnemy(s) && s.s - i.s > 0 && s.s - i.s < 15).slice(0, 4);
    for (const target of targets) {
      strike(i, target, -1e5 - ++i.techniqueSerial);
      i.cloneStrikes++;
      i.events.push({ type: "cloneStrike", s: target.s, lane: target.lane });
    }
  }
  for (const n of i.shurikens) {
    const from = n.s;
    n.s += 58 * t;
    n.age += t;
    for (const r of i.entities) {
      if (!r.alive || !isEnemy(r) || n.hits.includes(r.id)) continue;
      if (r.s >= from - 3 && r.s <= n.s + 3 && Math.abs(r.lane * laneOffset(r.s) - n.x) < 4.8) {
        n.hits.push(r.id);
        strike(i, r, -2e5 - n.id, 3);
        i.events.push({ type: "windImpact", s: r.s, lane: r.lane });
      }
    }
    for (const r of i.projectiles) {
      if (r.alive && r.s >= from - 3 && r.s <= n.s + 3 && Math.abs(r.x - n.x) < 4.8) {
        r.alive = false;
        i.deflections++;
      }
    }
  }
  i.shurikens = i.shurikens.filter((n) => n.age < 2.2 && n.s - i.s < 110);
}

/** Countdown timers decremented every step (hoisted so the 1/120 s step allocates no array). */
const TIMER_KEYS = ["attackCooldown", "dashCooldown", "slide", "invulnerable", "comboTimer", "cloneCooldown", "shurikenCooldown", "clones", "stumble"] as const;

/** Advance the run by `dt` seconds (clamped to 0.05). Original `pf`. */
export function stepSim(i: SimState, dtRaw: number): void {
  if (i.phase !== "running") return;
  const e = clamp(dtRaw, 0, 0.05);
  const prevS = i.s;
  i.time += e;
  for (const key of TIMER_KEYS) {
    i[key] = Math.max(0, i[key] - e);
  }
  if (i.comboTimer === 0) i.combo = 0;
  if (i.attack > 0) {
    i.attack = Math.max(0, i.attack - e);
    if (i.attack === 0) i.attackCooldown = TUNING.attackCooldown;
  }
  i.dash = Math.max(0, i.dash - e);
  i.spirit = clamp(i.spirit + (i.form === "beast" ? -4 : i.stumble > 0 ? 0 : i.form === "sage" ? 16 : TUNING.spiritRegen) * e, 0, TUNING.maxSpirit);
  if (i.form === "beast" && i.spirit <= 0) {
    i.form = "base";
    i.events.push({ type: "form", form: "base" });
  }
  i.speed = Math.min(TUNING.maxSpeed, TUNING.baseSpeed + i.time * 0.11) * (i.dash > 0 ? 1.65 : i.form === "beast" ? 1.12 : 1) * (1 - (i.stumbleDrag * i.stumble) / TUNING.stumbleDuration);
  i.s += i.speed * e;
  for (const form of ["sage", "beast"] as const) {
    if (formUnlocked(i, form) && !i.announcedUnlocks.includes(form)) {
      i.announcedUnlocks.push(form);
      i.events.push({ type: "unlock", form });
    }
  }
  i.x += (i.lane * laneOffset(i.s) - i.x) * (1 - Math.exp(-16 * e));
  const gapNow = gapAt(i.s);
  const gapBefore = gapAt(prevS);
  if (gapNow && i.y <= 0 && i.vy <= 0) i.falling = true;
  if (i.y > 0 || i.vy > 0 || i.falling) {
    i.vy -= TUNING.gravity * e;
    i.y += i.vy * e;
    if (i.y <= 0 && !i.falling) {
      if (gapNow) i.falling = true;
      else {
        i.y = 0;
        i.vy = 0;
        i.events.push({ type: "land" });
      }
    }
  }
  if (gapBefore && !gapNow && !i.falling && i.y > 0 && i.lastVault !== gapBefore[0]) {
    i.lastVault = gapBefore[0];
    i.vaults++;
    i.events.push({ type: "gapClear" });
  }
  if (i.falling) {
    if (i.y < -3) {
      i.phase = "lost";
      i.health = 0;
      i.events.push({ type: "lost", source: "gap" });
    }
    return;
  }
  updateTechnique(i, e);
  for (const r of i.entities) {
    if (!r.alive) continue;
    if (r.approach && isEnemy(r)) approach(i, r, e);
    r.stagger = Math.max(0, r.stagger - e);
    const a = r.s - i.s;
    const o = Math.abs(i.x - r.lane * laneOffset(r.s));
    if (a > 48 || a < -5) continue;
    if (r.type === "spirit") {
      if (o < 0.85 && Math.abs(a) < 1.4 && i.y < 2.8) {
        r.alive = false;
        i.spirit = clamp(i.spirit + (r.value || 15), 0, TUNING.maxSpirit);
        i.score += 15;
        i.events.push({ type: "pickup", entity: r.id, value: r.value || 15 });
      }
      continue;
    }
    if (o < 1.12 && a <= TUNING.attackReach + (i.form === "sage" ? 1.5 : 0) && a >= -0.4 && (i.attack > 0 || i.dash > 0) && i.y < 1.7 && r.type !== "beam") {
      if (r.type === "barrier") {
        r.alive = false;
        i.events.push({ type: "break", lane: r.lane, s: r.s });
      } else strike(i, r, i.attackSerial, i.form === "sage" ? 2 : 1);
    }
    if (r.alive) {
      if (!r.approach) enemyAttack(i, r, e);
      if ((r.y || 0) < 0.7 && o < 0.88 && r.s >= prevS - 0.85 && r.s <= i.s + 0.65) {
        const avoided = r.type === "beam" ? i.slide > 0 : r.type === "barrier" ? i.y > 0.85 : i.y > 1.4 || (r.approach && i.slide > 0);
        if (!avoided) {
          const protectedRun = i.invulnerable > 0 || i.dash > 0;
          const impactSpeed = i.speed;
          damage(i, r);
          if (i.ram && (r.type === "barrier" || r.type === "beam")) ram(i, r, impactSpeed, protectedRun);
        }
        r.alive = false;
        r.passed = true;
        r.intent = null;
      }
    }
  }
  if (i.phase === "running") updateProjectiles(i, prevS, e);
  if (i.s >= TUNING.length && i.phase === "running") {
    i.s = TUNING.length;
    i.phase = "won";
    i.events.push({ type: "won" });
  }
}

/** Drain the pending event list. Original `mf`. */
export function drainEvents(state: SimState): SimEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}

/** The QA autopilot the original ships (`__lanternhold.simulate(t, true)` -> `JS()`), as an action list. */
export function qaAutopilotActions(z: SimState): Action[] {
  const actions: Action[] = [];
  if (gapAhead(z.s, z.speed * 0.24) && z.y === 0) actions.push("jump");
  const next = z.entities.filter((t) => t.alive && t.type !== "spirit" && t.s > z.s - 1).sort((a, b) => a.s - b.s)[0];
  if (!next) return actions;
  const e = next.s - z.s;
  if (e < 26 && e > 5) {
    if (z.lane < next.lane) actions.push("right");
    else if (z.lane > next.lane) actions.push("left");
  }
  if (e < 12) {
    if (next.type === "beam") actions.push("slide");
    else if (next.type === "barrier") actions.push("jump");
    else if (e < 10) actions.push("spiralorb");
  }
  return actions;
}
/** Compact HUD snapshot. Original `gf`. */
export function snapshot(i: SimState): Record<string, unknown> {
  return {
    phase: i.phase, form: i.form, clones: i.clones, cloneStrikes: i.cloneStrikes, shurikens: i.shurikens.length, vaults: i.vaults,
    falling: i.falling, stumble: i.stumble, time: i.time, distance: i.s, lane: i.lane, x: i.x, y: i.y, health: i.health, spirit: i.spirit,
    maxSpirit: TUNING.maxSpirit, invulnerable: i.invulnerable, kills: i.kills, combo: i.combo, bestCombo: i.bestCombo, attack: i.attack,
    dash: i.dash, slide: i.slide, score: i.score, damageTaken: i.damageTaken, attacksFired: i.attacksFired, deflections: i.deflections,
    interrupts: i.interrupts,
    projectiles: i.projectiles.map((p) => ({ id: p.id, type: p.type, distance: p.s - i.s, lane: p.lane, x: p.x })),
    remaining: i.entities.filter((e) => e.alive && e.type !== "spirit").map((e) => ({ id: e.id, type: e.type, distance: e.s - i.s, lane: e.lane, hp: e.hp, attack: e.intent?.stage ?? null })).filter((e) => e.distance >= -3 && e.distance < 60)
  };
}

/** Next hostile ahead in the runner's lane (crosshair target). Original `i0`. */
export function crosshairTarget(i: SimState, range = 26): Entity | null {
  let target: Entity | null = null;
  let best = range;
  for (const s of i.entities) {
    const r = s.s - i.s;
    if (s.alive && isEnemy(s) && r >= -0.2 && r <= best && Math.abs(s.lane * laneOffset(s.s) - i.x) < 1.15) { target = s; best = r; }
  }
  return target;
}
