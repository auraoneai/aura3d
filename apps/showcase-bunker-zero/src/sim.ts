/**
 * Bunker Zero simulation — deterministic, renderer-free grid-shooter loop.
 * World coords: cell (cx,cz) centre = ((cx+0.5)*CELL + ox, (cz+0.5)*CELL).
 * Each floor renders at its own x-offset (ox = floorIndex * 300) so all six
 * maps coexist in one scene — the player teleports between floor origins.
 */
import { createCountedRng } from "@aura3d/engine";
import { CELL, WALL_H, SILO_H, isBlocked, isSolid, parseFloor, type FloorDef } from "./maps";

export { CELL, WALL_H };

// ---------------------------------------------------------------- rng
export function mulberry32(seed: number): () => number {
  const rng = createCountedRng(seed);
  return () => rng.next();
}

// ---------------------------------------------------------------- types
export type WeaponId = "knife" | "pistol" | "mg" | "rocket";
export const WEAPONS: Record<WeaponId, {
  name: string; dmg: number; rate: number; range: number;
  magSize: number; ammo: "bullets" | "rockets" | "none";
  spread: number; splash: number; auto: boolean;
}> = {
  knife:  { name: "KNIFE",  dmg: 28,  rate: 0.45, range: 1.7,  magSize: 0,  ammo: "none",    spread: 0,     splash: 0,   auto: false },
  pistol: { name: "PISTOL", dmg: 22,  rate: 0.38, range: 40,   magSize: 8,  ammo: "bullets", spread: 0.015, splash: 0,   auto: false },
  mg:     { name: "MACHINE GUN", dmg: 14, rate: 0.095, range: 40, magSize: 30, ammo: "bullets", spread: 0.035, splash: 0, auto: true },
  rocket: { name: "ROCKET LAUNCHER", dmg: 130, rate: 0.9, range: 60, magSize: 1, ammo: "rockets", spread: 0, splash: 3.2, auto: false }
};

export type EnemyKind = "guard" | "dog" | "gunner" | "boss";
export const ENEMIES: Record<EnemyKind, {
  hp: number; speed: number; pain: number; score: number;
  attackRange: number; sightRange: number; hitDmg: [number, number]; attackTime: number; burst: number;
}> = {
  guard:  { hp: 26,  speed: 1.7, pain: 0.25, score: 100,  attackRange: 10,  sightRange: 11, hitDmg: [6, 14],   attackTime: 0.65, burst: 1 },
  dog:    { hp: 18,  speed: 3.4, pain: 0.18, score: 150,  attackRange: 1.6, sightRange: 9,  hitDmg: [9, 15],   attackTime: 0.5,  burst: 1 },
  gunner: { hp: 70,  speed: 1.2, pain: 0.3,  score: 400,  attackRange: 12,  sightRange: 12, hitDmg: [4, 8],    attackTime: 1.35, burst: 5 },
  boss:   { hp: 480, speed: 1.15, pain: 0.4, score: 2000, attackRange: 14,  sightRange: 14, hitDmg: [18, 30],  attackTime: 2.4,  burst: 3 }
};

export type EnemyState = "idle" | "patrol" | "alert" | "chase" | "attack" | "pain" | "dead";

export interface Enemy {
  id: string; kind: EnemyKind; cx: number; cz: number;
  sx: number; sz: number;          // spawn cell — runtime node id stem
  x: number; z: number;            // world metres (floor-local)
  hp: number; state: EnemyState;
  facing: number;                  // yaw
  stateT: number;                  // time in state
  attackCd: number; burstLeft: number;
  painT: number; pathT: number;    // repath timer
  deathT: number;
  // boss
  phase: number; volleyLeft: number; vulnerableT: number;
  /** Set on guards the Iron Warden summons: index into the pre-built summon node pool (`summon-<i>`). */
  summonSlot?: number;
}

/** Most guards the Iron Warden can summon on one floor (two phases of two). main.ts builds this many summon nodes. */
export const MAX_SUMMONS = 4;
/** Peak player damage from an enemy rocket's blast when it does not hit the player directly (falls off linearly to 0 at the splash radius). */
export const ENEMY_ROCKET_SPLASH = 24;
/** Visual-only record of an enemy hitscan shot: muzzle at (x0,z0), end of the tracer at (x1,z1). */
export interface EnemyShot { x0: number; z0: number; y0: number; x1: number; z1: number; hit: boolean; kind: EnemyKind; t: number; }

export interface Pickup {
  id: string; kind: "treasure" | "treasure-big" | "health" | "plate" | "ammo" | "armor" | "key" | "mg" | "rocket" | "kit" | "medal";
  x: number; z: number; cx: number; cz: number; taken: boolean;
}

export interface Door { cx: number; cz: number; open: number; target: number; }
export interface PushWall {
  cx: number; cz: number; dx: number; dz: number;
  progress: number;                 // 0 closed → 2 (cells slid)
  state: "closed" | "sliding" | "open";
}
export interface Rocket {
  x: number; y: number; z: number;
  dx: number; dz: number;
  vx: number; vz: number;
  speed: number;
  dmg: number;
  splash: number;
  kind: "bullet" | "mg" | "rocket";
  t: number;
  fromEnemy: boolean;
}
export interface Prop { cx: number; cz: number; kind: "barrel" | "crate" | "column"; hp: number; alive: boolean; }

export interface PlayerState {
  x: number; z: number; yaw: number; pitch: number;
  hp: number; armor: number; alive: boolean;
  weapon: WeaponId; weapons: WeaponId[];
  ammo: { bullets: number; rockets: number };
  /** Rounds in the current weapon's magazine. Every weapon keeps its own magazine in `mags`; `mag` mirrors `mags[weapon]`. */
  mag: number; mags: Record<WeaponId, number>; reloading: number;
  key: boolean; hurtT: number; stepT: number; fireT: number; switchT: number;
}

export interface SimInput {
  moveX: number; moveZ: number; turn: number; pitchDelta: number;
  fire: boolean; firePressed: boolean; reload: boolean; use: boolean;
  weapon?: WeaponId; weaponDelta?: number;
}

export interface Sim {
  state: {
    floor: FloorDef; ox: number; mode: "descent" | "killhouse";
    player: PlayerState; enemies: Enemy[]; pickups: Pickup[];
    doors: Door[]; pushWalls: PushWall[]; rockets: Rocket[]; props: Prop[];
    grid: string[]; w: number; h: number;
    time: number; score: number; kills: number; totalEnemies: number;
    secrets: number; totalSecrets: number; treasure: number;
    finished: boolean; medal: "gold" | "silver" | "bronze" | "none";
    killhouseLeft: number;
    msg: string; msgT: number;
    /** The last 40 events (oldest first). `eventSeq` counts every event ever emitted, so a consumer drains by sequence, not by index. */
    events: string[]; eventSeq: number;
    enemyShots: EnemyShot[];
    rng: () => number;
    shake: number;
    bossEnraging: boolean;
    muzzle: number;
    projectilesSpawned: number;
    explosions: { x: number; z: number; t: number }[];
    shots: { x: number; z: number; t: number }[];
    summons: string[];
    dtRemainder: number;
  };
  tick(dt: number, input: SimInput): void;
  cellBlocked(cx: number, cz: number): boolean;
  cellSolid(cx: number, cz: number): boolean;
  hasLOS(x0: number, z0: number, x1: number, z1: number): boolean;
  dealDamage(toPlayer: boolean, amount: number, srcX?: number, srcZ?: number): void;
  fireRocket(x: number, z: number, dx: number, dz: number, fromEnemy: boolean): void;
}

const EYE = 1.55;
const PLAYER_R = 0.34;
const NOISE_RANGE = 12;

export function floorOrigin(floorIndex: number) { return floorIndex * 300; }
export const cellCenter = (c: number) => (c + 0.5) * CELL;

/** What a descent run carries from one floor to the next (C14). HP resets to 100 at each elevator; everything else carries. */
export interface Loadout {
  armor: number; weapons: WeaponId[]; weapon: WeaponId;
  ammo: { bullets: number; rockets: number };
  mags: Record<WeaponId, number>; score: number;
}
export function defaultLoadout(): Loadout {
  return { armor: 0, weapons: ["knife", "pistol"], weapon: "pistol", ammo: { bullets: 48, rockets: 0 }, mags: { knife: 0, pistol: WEAPONS.pistol.magSize, mg: 0, rocket: 0 }, score: 0 };
}
/** Snapshot of the player's loadout and score at the end of a floor. */
export function captureLoadout(sim: Sim): Loadout {
  const p = sim.state.player;
  const mags = { ...p.mags, [p.weapon]: p.mag };
  return { armor: p.armor, weapons: [...p.weapons], weapon: p.weapon, ammo: { ...p.ammo }, mags, score: sim.state.score };
}

/**
 * Drain events in order by sequence number (C2). `lastSeq` is the sequence the consumer already handled; returns the new one.
 * Works however many events the sim trimmed: events older than the 40-event window are skipped, never replayed.
 */
export function drainEvents(state: Pick<Sim["state"], "events" | "eventSeq">, lastSeq: number, handle: (ev: string) => void): number {
  const firstSeq = state.eventSeq - state.events.length;
  for (let seq = Math.max(lastSeq, firstSeq); seq < state.eventSeq; seq++) handle(state.events[seq - firstSeq]!);
  return state.eventSeq;
}

export function createSim(def: FloorDef, opts: { ox: number; mode: "descent" | "killhouse"; seed: number; loadout?: Loadout }): Sim {
  const { w, h, cells, at, spawns } = parseFloor(def);
  const grid = [...cells];
  const rng = mulberry32(opts.seed);
  const start = spawns.find((s) => s.ch === "S")!;

  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  const doors: Door[] = [];
  const pushWalls: PushWall[] = [];
  const props: Prop[] = [];
  let startYaw = Math.PI / 2;
  {
    // Face the widest open neighbor at spawn (E>S>W>N preference is arbitrary;
    // yaw forward = (sin, -cos)).
    const dirs: [number, number, number][] = [[1, 0, Math.PI / 2], [0, 1, Math.PI], [-1, 0, -Math.PI / 2], [0, -1, 0]];
    for (const [dx, dz, yaw] of dirs) {
      if (!isBlocked(at(start.cx + dx, start.cz + dz))) { startYaw = yaw; break; }
    }
  }

  for (const s of spawns) {
    const x = cellCenter(s.cx), z = cellCenter(s.cz);
    switch (s.ch) {
      case "g": enemies.push(mkEnemy("guard", s.cx, s.cz, x, z)); break;
      case "d": enemies.push(mkEnemy("dog", s.cx, s.cz, x, z)); break;
      case "G": enemies.push(mkEnemy("gunner", s.cx, s.cz, x, z)); break;
      case "B": enemies.push(mkEnemy("boss", s.cx, s.cz, x, z)); break;
      case "K": pickups.push(mkPickup("key", s.cx, s.cz, x, z)); break;
      case "t": pickups.push(mkPickup("treasure", s.cx, s.cz, x, z)); break;
      case "T": pickups.push(mkPickup("treasure-big", s.cx, s.cz, x, z)); break;
      case "+": pickups.push(mkPickup("health", s.cx, s.cz, x, z)); break;
      case "*": pickups.push(mkPickup("plate", s.cx, s.cz, x, z)); break;
      case "a": pickups.push(mkPickup("ammo", s.cx, s.cz, x, z)); break;
      case "r": pickups.push(mkPickup("armor", s.cx, s.cz, x, z)); break;
      case "w": pickups.push(mkPickup("mg", s.cx, s.cz, x, z)); break;
      case "W": pickups.push(mkPickup("rocket", s.cx, s.cz, x, z)); break;
      case "!": pickups.push(mkPickup("kit", s.cx, s.cz, x, z)); break;
      case "D": doors.push({ cx: s.cx, cz: s.cz, open: 0, target: 0 }); break;
      case "P": pushWalls.push({ cx: s.cx, cz: s.cz, dx: 0, dz: 0, progress: 0, state: "closed" }); break;
      case "b": props.push({ cx: s.cx, cz: s.cz, kind: "barrel", hp: 10, alive: true }); break;
      case "c": props.push({ cx: s.cx, cz: s.cz, kind: "crate", hp: 35, alive: true }); break;
      case "o": props.push({ cx: s.cx, cz: s.cz, kind: "column", hp: 999, alive: true }); break;
    }
  }

  const events: string[] = [];
  const ev = (s: string) => { events.push(s); state.eventSeq++; if (events.length > 40) events.shift(); };
  const lo = opts.loadout ?? defaultLoadout();

  const state: Sim["state"] = {
    floor: def, ox: opts.ox, mode: opts.mode,
    player: {
      x: cellCenter(start.cx), z: cellCenter(start.cz), yaw: startYaw, pitch: 0,
      hp: 100, armor: lo.armor, alive: true,
      weapon: lo.weapon, weapons: [...lo.weapons],
      ammo: { ...lo.ammo },
      mag: lo.mags[lo.weapon], mags: { ...lo.mags }, reloading: 0,
      key: false, hurtT: 0, stepT: 0, fireT: 0, switchT: 0
    },
    enemies, pickups, doors, pushWalls, rockets: [], props,
    grid, w, h,
    time: 0, score: lo.score, kills: 0, totalEnemies: enemies.length,
    secrets: 0, totalSecrets: pushWalls.length, treasure: 0,
    finished: false, medal: "none",
    killhouseLeft: opts.mode === "killhouse" ? def.par : 0,
    msg: "", msgT: 0, events, eventSeq: 0, enemyShots: [], rng, shake: 0,
    bossEnraging: false, muzzle: 0, projectilesSpawned: 0, explosions: [], shots: [], summons: [], dtRemainder: 0
  };

  // ---------------------------------------------------------------- grid queries
  const gridAt = (cx: number, cz: number) => (cx < 0 || cz < 0 || cx >= w || cz >= h ? " " : grid[cz * w + cx]);
  const cellSolid = (cx: number, cz: number) => isSolid(gridAt(cx, cz));
  const cellBlocked = (cx: number, cz: number) => {
    const ch = gridAt(cx, cz);
    if (ch === "b" || ch === "c") {
      const pr = props.find((pp) => pp.cx === cx && pp.cz === cz);
      if (!pr || !pr.alive) return false;
    }
    if (isBlocked(ch)) return true;
    if (ch === "D") {
      const d = doors.find((dd) => dd.cx === cx && dd.cz === cz);
      if (d && d.open < 0.45) return true;
    }
    return false;
  };

  /**
   * Sight and hitscan stop where projectiles stop (C7): walls, closed push-walls, doors under 45% open, columns, and
   * standing barrels and crates.
   */
  const sightBlocked = (cx: number, cz: number) => {
    if (cellSolid(cx, cz)) return true;
    const ch = gridAt(cx, cz);
    if (ch === "D") { const d = doors.find((dd) => dd.cx === cx && dd.cz === cz); return !!d && d.open < 0.45; }
    if (ch === "o" || ch === "b" || ch === "c") { const pr = props.find((pp) => pp.cx === cx && pp.cz === cz); return !!pr && pr.alive; }
    return false;
  };
  function hasLOS(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (CELL * 0.33)));
    const c0x = Math.floor(x0 / CELL), c0z = Math.floor(z0 / CELL), c1x = Math.floor(x1 / CELL), c1z = Math.floor(z1 / CELL);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor((x0 + dx * t) / CELL), cz = Math.floor((z0 + dz * t) / CELL);
      // the cells the viewer and the target stand in never block (a player standing in an open doorway)
      if ((cx === c0x && cz === c0z) || (cx === c1x && cz === c1z)) continue;
      if (sightBlocked(cx, cz)) return false;
    }
    return true;
  }

  function mkEnemy(kind: EnemyKind, cx: number, cz: number, x: number, z: number): Enemy {
    return {
      id: `${kind}-${cx}-${cz}`, kind, cx, cz, sx: cx, sz: cz, x, z,
      hp: ENEMIES[kind].hp, state: kind === "boss" ? "idle" : "patrol", facing: rng() * Math.PI * 2,
      stateT: 0, attackCd: 0.5 + rng(), burstLeft: 0, painT: 0, pathT: 0,
      deathT: 0, phase: 0, volleyLeft: 0, vulnerableT: 0
    };
  }
  function mkPickup(kind: Pickup["kind"], cx: number, cz: number, x: number, z: number): Pickup {
    return { id: `${kind}-${cx}-${cz}`, kind, x, z, cx, cz, taken: false };
  }

  // ---------------------------------------------------------------- helpers
  const p = state.player;
  const emit = (s: string) => ev(s);
  const say = (s: string, t = 2.2) => { state.msg = s; state.msgT = t; };

  function moveWithCollision(e: { x: number; z: number }, dx: number, dz: number, r: number) {
    // axis-separated slide against walls + props
    const tryMove = (nx: number, nz: number) => {
      const minCx = Math.floor((nx - r) / CELL), maxCx = Math.floor((nx + r) / CELL);
      const minCz = Math.floor((nz - r) / CELL), maxCz = Math.floor((nz + r) / CELL);
      for (let cz = minCz; cz <= maxCz; cz++)
        for (let cx = minCx; cx <= maxCx; cx++) if (cellBlocked(cx, cz)) return false;
      return true;
    };
    if (tryMove(e.x + dx, e.z)) e.x += dx;
    if (tryMove(e.x, e.z + dz)) e.z += dz;
  }

  function bfsNext(fromX: number, fromZ: number, toX: number, toZ: number): [number, number] | null {
    const sx = Math.floor(fromX / CELL), sz = Math.floor(fromZ / CELL);
    const tx = Math.floor(toX / CELL), tz = Math.floor(toZ / CELL);
    if (sx === tx && sz === tz) return null;
    const prev = new Map<number, number>();
    const start = sz * w + sx;
    prev.set(start, -1);
    const q = [start];
    let head = 0;
    while (head < q.length) {
      const idx = q[head++];
      const cx = idx % w, cz = Math.floor(idx / w);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, nz = cz + dz, ni = nz * w + nx;
        if (prev.has(ni) || cellBlocked(nx, nz)) continue;
        prev.set(ni, idx);
        if (nx === tx && nz === tz) {
          // walk back to first step
          let cur = ni;
          while (prev.get(cur) !== start && prev.get(cur) !== -1) cur = prev.get(cur)!;
          const ccx = cur % w, ccz = Math.floor(cur / w);
          return [cellCenter(ccx), cellCenter(ccz)];
        }
        q.push(ni);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- combat
  function hitEnemy(e: Enemy, dmg: number, dx: number, dz: number) {
    if (e.state === "dead") return;
    if (e.kind === "boss" && e.vulnerableT > 0) dmg *= 2;
    e.hp -= dmg;
    emit(`hit:${e.kind}:${Math.round(dmg)}`);
    if (e.hp <= 0) {
      e.state = "dead"; e.deathT = 0;
      state.kills++; state.score += ENEMIES[e.kind].score;
      emit(`kill:${e.kind}`);
      if (e.kind === "boss") { say("IRON WARDEN DESTROYED"); state.score += 2000; }
    } else {
      e.state = "pain"; e.painT = ENEMIES[e.kind].pain; e.stateT = 0;
      // knock toward damage dir a touch
      const n = Math.hypot(dx, dz) || 1;
      moveWithCollision(e, (dx / n) * 0.16, (dz / n) * 0.16, 0.28);
    }
  }

  function splashDamage(x: number, z: number, radius: number, dmg: number, hurtPlayer: boolean) {
    for (const e of enemies) {
      if (e.state === "dead") continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < radius) hitEnemy(e, dmg * (1 - d / radius / 2), e.x - x, e.z - z);
    }
    for (const pr of props) {
      if (!pr.alive || pr.kind !== "barrel") continue;
      const d = Math.hypot(cellCenter(pr.cx) - x, cellCenter(pr.cz) - z);
      if (d < radius + 0.5) igniteBarrel(pr);
    }
    if (hurtPlayer) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) dealDamage(true, dmg * 0.6 * (1 - d / radius));
    }
  }

  function igniteBarrel(pr: Prop) {
    if (!pr.alive) return;
    pr.alive = false;
    grid[pr.cz * w + pr.cx] = ".";
    const x = cellCenter(pr.cx), z = cellCenter(pr.cz);
    emit("barrel:explode");
    splashDamage(x, z, 2.6, 90, true);
    state.explosions.push({ x, z, t: 0 });
  }

  const MAX_ROCKETS = 18;
  function spawnProjectile(opts: {
    x: number; y: number; z: number;
    dx: number; dz: number;
    speed: number; dmg: number; splash: number;
    kind: "bullet" | "mg" | "rocket";
    fromEnemy: boolean;
  }) {
    const n = Math.hypot(opts.dx, opts.dz) || 1;
    const ndx = opts.dx / n, ndz = opts.dz / n;
    if (state.rockets.length >= MAX_ROCKETS) state.rockets.shift();
    state.rockets.push({
      x: opts.x, y: opts.y, z: opts.z,
      dx: ndx, dz: ndz,
      vx: ndx * opts.speed, vz: ndz * opts.speed,
      speed: opts.speed,
      dmg: opts.dmg,
      splash: opts.splash,
      kind: opts.kind,
      t: 0,
      fromEnemy: opts.fromEnemy
    });
    if (!opts.fromEnemy) state.projectilesSpawned++;
  }

  function fireRocketAt(x: number, z: number, dx: number, dz: number, fromEnemy: boolean) {
    spawnProjectile({
      x, y: 1.18, z, dx, dz,
      speed: 12,
      dmg: WEAPONS.rocket.dmg,
      splash: WEAPONS.rocket.splash,
      kind: "rocket",
      fromEnemy
    });
    emit(fromEnemy ? "boss:rocket" : "player:rocket");
  }

  function dealDamage(toPlayer: boolean, amount: number, _srcX = 0, _srcZ = 0) {
    // C16: once the floor is finished the player cannot be hurt during the cleared delay
    if (!toPlayer || !p.alive || state.finished) return;
    const absorbed = Math.min(p.armor, amount * 0.6);
    p.armor -= absorbed;
    p.hp -= amount - absorbed;
    p.hurtT = 0.35;
    state.shake = Math.min(1, state.shake + amount * 0.02);
    emit(`hurt:${Math.round(amount - absorbed)}`);
    if (p.hp <= 0) { p.hp = 0; p.alive = false; emit("player:death"); }
  }

  function tryFire(_input: SimInput) {
    const wpn = WEAPONS[p.weapon];
    if (p.reloading > 0 || p.fireT > 0 || p.switchT > 0) return;
    if (wpn.ammo !== "none" && p.mag <= 0) {
      if (wpn.magSize > 0 && p.ammo[wpn.ammo as "bullets" | "rockets"] > 0) startReload();
      else { emit("fire:dry"); say("OUT OF AMMO", 1.2); p.fireT = 0.3; }
      return;
    }
    p.fireT = wpn.rate;
    state.shake = Math.min(1, state.shake + (p.weapon === "rocket" ? 0.5 : p.weapon === "mg" ? 0.1 : 0.2));
    if (wpn.ammo !== "none") p.mag--;
    emit(`fire:${p.weapon}`);
    if (p.weapon === "knife") {
      // melee arc
      for (const e of enemies) {
        if (e.state === "dead") continue;
        const ex = e.x - p.x, ez = e.z - p.z;
        if (Math.hypot(ex, ez) < wpn.range + 0.3) {
          const ang = Math.atan2(ex, -ez);
          let d = Math.abs(ang - p.yaw); if (d > Math.PI) d = Math.PI * 2 - d;
          if (d < 0.9) hitEnemy(e, wpn.dmg, ex, ez);
        }
      }
      // knife barrels too
      for (const pr of props) {
        if (!pr.alive || pr.kind !== "barrel") continue;
        if (Math.hypot(cellCenter(pr.cx) - p.x, cellCenter(pr.cz) - p.z) < wpn.range + 0.4) igniteBarrel(pr);
      }
      alertEnemies(p.x, p.z, 4);
    } else {
      const spreadYaw = p.yaw + (rng() - 0.5) * 2 * wpn.spread;
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
      const dirX = Math.sin(spreadYaw), dirZ = -Math.cos(spreadYaw);
      const spawnX = p.x + fx * 0.55 + rx * 0.14;
      const spawnY = 1.18 + Math.tan(p.pitch) * 0.3;
      const spawnZ = p.z + fz * 0.55 + rz * 0.14;
      const isRocket = p.weapon === "rocket";
      spawnProjectile({
        x: spawnX,
        y: spawnY,
        z: spawnZ,
        dx: dirX,
        dz: dirZ,
        speed: isRocket ? 12 : 18,
        dmg: wpn.dmg,
        splash: isRocket ? wpn.splash : 0,
        kind: isRocket ? "rocket" : p.weapon === "mg" ? "mg" : "bullet",
        fromEnemy: false
      });
      if (isRocket) emit("player:rocket");
      alertEnemies(p.x, p.z, NOISE_RANGE);
    }
    state.muzzle = 0.06;
  }

  function startReload() {
    const wpn = WEAPONS[p.weapon];
    const pool = p.ammo[wpn.ammo as "bullets" | "rockets"] ?? 0;
    if (wpn.magSize === 0 || pool <= 0 || p.mag >= wpn.magSize) return;
    p.reloading = p.weapon === "rocket" ? 1.4 : 1.1;
    emit(`reload:${p.weapon}`);
  }
  function finishReload() {
    const wpn = WEAPONS[p.weapon];
    const pool = p.ammo[wpn.ammo as "bullets" | "rockets"] ?? 0;
    const need = wpn.magSize - p.mag;
    const take = Math.min(need, pool);
    p.mag += take;
    if (wpn.ammo !== "none") (p.ammo[wpn.ammo as "bullets" | "rockets"] as number) -= take;
  }

  function switchWeapon(id: WeaponId) {
    if (!p.weapons.includes(id) || p.weapon === id) return;
    // C5: every weapon keeps its own magazine
    p.mags[p.weapon] = p.mag;
    p.weapon = id; p.mag = p.mags[id]; p.reloading = 0; p.switchT = 0.4;
    emit(`weapon:${id}`);
  }

  function alertEnemies(x: number, z: number, range: number) {
    for (const e of enemies) {
      if (e.state === "dead" || e.state === "attack" || e.state === "chase") continue;
      if (Math.hypot(e.x - x, e.z - z) < range) {
        e.state = "alert"; e.stateT = 0;
        emit(`alert:${e.kind}`);
      }
    }
  }

  // ---------------------------------------------------------------- interact
  function tryUse() {
    const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
    const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    // open any nearby door
    for (const d of doors) {
      if (Math.hypot(d.cx + 0.5 - p.x / CELL, d.cz + 0.5 - p.z / CELL) < 2.2) {
        d.target = 1;
        d.open = Math.max(d.open, 0.75);
        emit("door:open");
      }
    }
    // push-walls: face the P cell within 1.6 cells
    for (const pw of pushWalls) {
      if (pw.state !== "closed") continue;
      const pcx2 = pw.cx - pcx, pcz2 = pw.cz - pcz;
      const dist = Math.hypot(pcx2, pcz2);
      if (dist > 1.6) continue;
      const dirDot = pcx2 * fx + pcz2 * fz;
      if (dirDot < 0.3) continue;
      // push direction = axis away from player through wall
      const ax = Math.abs(pcx2) > Math.abs(pcz2) ? Math.sign(pcx2) : 0;
      const az = ax === 0 ? Math.sign(pcz2) : 0;
      const b1 = gridAt(pw.cx + ax, pw.cz + az);
      const b2 = gridAt(pw.cx + ax * 2, pw.cz + az * 2);
      if (isBlocked(b1) || isBlocked(b2) || isSolid(b1) || isSolid(b2)) { emit("pushwall:blocked"); continue; }
      pw.dx = ax; pw.dz = az; pw.state = "sliding";
      state.secrets++;
      say("SECRET REVEALED");
      emit(`secret:${pw.cx},${pw.cz}`);
      return;
    }
    emit("use:nothing");
  }

  // ---------------------------------------------------------------- enemy AI
  function tickEnemy(e: Enemy, dt: number) {
    const cfg = ENEMIES[e.kind];
    e.stateT += dt;
    e.attackCd -= dt;
    if (e.state === "dead") { e.deathT += dt; return; }
    const dx = p.x - e.x, dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    const sees = p.alive && dist < cfg.sightRange && hasLOS(e.x, e.z, p.x, p.z);

    if (e.state === "pain") { if (e.painT > 0) { e.painT -= dt; return; } e.state = "chase"; e.stateT = 0; }

    if (e.state === "idle" || e.state === "patrol") {
      if (sees) { e.state = "alert"; e.stateT = 0; emit(`spot:${e.kind}`); return; }
      if (e.kind === "dog" || e.state === "patrol") {
        // light wander
        e.pathT -= dt;
        if (e.pathT <= 0) { e.pathT = 2 + rng() * 2; e.facing = rng() * Math.PI * 2; }
        moveWithCollision(e, Math.sin(e.facing) * cfg.speed * 0.35 * dt, -Math.cos(e.facing) * cfg.speed * 0.35 * dt, 0.3);
      }
      return;
    }
    if (e.state === "alert") { e.facing = Math.atan2(dx, -dz); if (e.stateT > 0.45) { e.state = "chase"; e.stateT = 0; } return; }

    if (e.state === "chase") {
      e.facing = Math.atan2(dx, -dz);
      if (dist > cfg.attackRange * 0.7 || !sees) {
        // BFS repath toward player
        e.pathT -= dt;
        if (e.pathT <= 0) { e.pathT = 0.4; const next = bfsNext(e.x, e.z, p.x, p.z); e.cx = next ? next[0] : p.x; e.cz = next ? next[1] : p.z; }
        const tx = e.cx, tz = e.cz;
        const mx = tx - e.x, mz = tz - e.z;
        const mn = Math.hypot(mx, mz);
        if (mn > 0.05) moveWithCollision(e, (mx / mn) * cfg.speed * dt, (mz / mn) * cfg.speed * dt, 0.3);
      }
      if (sees && dist < cfg.attackRange && e.attackCd <= 0) { e.state = "attack"; e.stateT = 0; e.burstLeft = cfg.burst; }
      return;
    }

    if (e.state === "attack") {
      e.facing = Math.atan2(dx, -dz);
      if (e.kind === "dog") {
        if (e.stateT > cfg.attackTime && dist < cfg.attackRange + 0.4) {
          dealDamage(true, cfg.hitDmg[0] + rng() * (cfg.hitDmg[1] - cfg.hitDmg[0]));
          emit("dog:bite");
          e.state = "chase"; e.attackCd = 0.7; e.stateT = 0;
        } else if (e.stateT > cfg.attackTime) { e.state = "chase"; e.stateT = 0; }
        return;
      }
      // ranged attackers (guard / gunner / boss)
      if (e.kind === "boss") tickBoss(e, dt, dist, sees);
      else {
        const interval = e.kind === "gunner" ? 0.12 : 0.0;
        if (e.stateT > (e.burstLeft === cfg.burst ? 0.2 : interval) && e.burstLeft > 0) {
          e.burstLeft--; e.stateT = 0;
          // hit chance falls with distance + player strafe
          const acc = Math.max(0.2, 0.75 - dist * 0.045);
          const hit = rng() < acc && hasLOS(e.x, e.z, p.x, p.z);
          if (hit) {
            dealDamage(true, cfg.hitDmg[0] + rng() * (cfg.hitDmg[1] - cfg.hitDmg[0]));
            emit(`${e.kind}:shot:hit`);
          } else emit(`${e.kind}:shot:miss`);
          // C8: a visible tracer for every shot, misses included (a miss ends beside the player)
          const n = Math.max(0.001, dist);
          const side = hit ? 0 : (state.enemyShots.length % 2 ? 0.9 : -0.9);
          const muzzleY = e.kind === "gunner" ? 1.35 : 1.3;
          state.enemyShots.push({
            x0: e.x + (dx / n) * 0.5, z0: e.z + (dz / n) * 0.5, y0: muzzleY,
            x1: p.x + (-dz / n) * side, z1: p.z + (dx / n) * side, hit, kind: e.kind, t: 0
          });
          if (state.enemyShots.length > 8) state.enemyShots.shift();
        }
        if (e.burstLeft <= 0) { e.state = "chase"; e.attackCd = cfg.attackTime; e.stateT = 0; }
      }
      return;
    }
  }

  function tickBoss(e: Enemy, dt: number, _dist: number, _sees: boolean) {
    // Iron Warden: volley of 3 rockets → vent (vulnerable 2.5s) → repeat;
    // summons 2 guards at 66% / 33% hp.
    if (e.vulnerableT > 0) {
      e.vulnerableT -= dt;
      if (e.vulnerableT <= 0) { e.state = "chase"; e.stateT = 0; e.attackCd = 0.6; }
      return;
    }
    const hpFrac = e.hp / ENEMIES.boss.hp;
    if ((e.phase === 0 && hpFrac < 0.66) || (e.phase === 1 && hpFrac < 0.33)) {
      e.phase++;
      emit("boss:summon");
      say("THE WARDEN CALLS REINFORCEMENTS");
      for (let i = 0; i < 2; i++) {
        const gx = Math.floor(e.x / CELL) + (i === 0 ? 1 : -1);
        const gz = Math.floor(e.z / CELL);
        if (!cellBlocked(gx, gz) && state.summons.length < MAX_SUMMONS) {
          const g = mkEnemy("guard", gx, gz, cellCenter(gx), cellCenter(gz));
          g.state = "chase";
          g.summonSlot = state.summons.length;
          g.id = `summon-${g.summonSlot}`;
          enemies.push(g);
          state.totalEnemies++;
          state.summons.push(g.id);
        }
      }
    }
    if (e.stateT > 0.3 && e.volleyLeft > 0) {
      e.volleyLeft--; e.stateT = 0;
      const dx = p.x - e.x, dz = p.z - e.z;
      const spread = (e.volleyLeft - 1) * 0.12;
      const ang = Math.atan2(dx, -dz) + spread;
      fireRocketAt(e.x + Math.sin(ang) * 0.9, e.z - Math.cos(ang) * 0.9, Math.sin(ang), -Math.cos(ang), true);
    }
    if (e.volleyLeft <= 0) {
      e.volleyLeft = ENEMIES.boss.burst;
      e.vulnerableT = 2.6;
      emit("boss:vent");
    }
  }

  // ---------------------------------------------------------------- projectiles & rockets
  function tickRockets(dt: number) {
    const subSteps = 3;
    const subDt = dt / subSteps;
    for (const r of state.rockets) {
      r.t += dt;
      let impacted = false;
      let hitEnemyTarget: Enemy | null = null;
      let hitPropTarget: Prop | null = null;
      let hitPlayerTarget = false;

      for (let s = 0; s < subSteps; s++) {
        const nx = r.x + r.vx * subDt;
        const nz = r.z + r.vz * subDt;
        const cx = Math.floor(nx / CELL), cz = Math.floor(nz / CELL);
        const doorInCell = doors.find((dd) => dd.cx === cx && dd.cz === cz);
        const hitDoor = doorInCell ? doorInCell.open < 0.45 : false;
        const colInCell = gridAt(cx, cz) === "o" && props.some((pp) => pp.cx === cx && pp.cz === cz && pp.alive);
        const hitWall = cellSolid(cx, cz) || hitDoor || colInCell;

        if (hitWall) {
          r.x = nx; r.z = nz;
          impacted = true;
          break;
        }
        if (r.fromEnemy) {
          if (Math.hypot(p.x - nx, p.z - nz) < 0.7 && p.alive) {
            r.x = nx; r.z = nz;
            hitPlayerTarget = true;
            impacted = true;
            break;
          }
        } else {
          for (const e of enemies) {
            if (e.state === "dead") continue;
            const hitR = e.kind === "boss" ? 0.95 : 0.72;
            if (Math.hypot(e.x - nx, e.z - nz) < hitR) {
              hitEnemyTarget = e;
              break;
            }
          }
          if (hitEnemyTarget) {
            r.x = nx; r.z = nz;
            impacted = true;
            break;
          }
          for (const pr of props) {
            if (!pr.alive || (pr.kind !== "barrel" && pr.kind !== "crate")) continue;
            if (Math.hypot(cellCenter(pr.cx) - nx, cellCenter(pr.cz) - nz) < 0.75) {
              hitPropTarget = pr;
              break;
            }
          }
          if (hitPropTarget) {
            r.x = nx; r.z = nz;
            impacted = true;
            break;
          }
        }
        r.x = nx; r.z = nz;
      }

      if (impacted || r.t > 4.5) {
        r.t = -1;
        if (r.kind === "rocket" || r.fromEnemy) {
          state.explosions.push({ x: r.x, z: r.z, t: 0 });
          const radius = r.splash || WEAPONS.rocket.splash;
          splashDamage(r.x, r.z, radius, r.dmg || WEAPONS.rocket.dmg, !r.fromEnemy);
          // C6: an enemy rocket deals its direct hit only when it hits the player; otherwise the blast falls off with distance
          if (r.fromEnemy) {
            if (hitPlayerTarget) dealDamage(true, 20 + rng() * 15);
            else {
              const d = Math.hypot(p.x - r.x, p.z - r.z);
              if (d < radius && hasLOS(r.x, r.z, p.x, p.z)) dealDamage(true, ENEMY_ROCKET_SPLASH * (1 - d / radius));
            }
          }
          emit("rocket:boom");
        } else {
          state.shots.push({ x: r.x, z: r.z, t: 0 });
          if (hitPropTarget) {
            if (hitPropTarget.kind === "barrel") {
              igniteBarrel(hitPropTarget);
            } else {
              hitPropTarget.hp -= r.dmg;
              if (hitPropTarget.hp <= 0) {
                hitPropTarget.alive = false;
                grid[hitPropTarget.cz * w + hitPropTarget.cx] = ".";
                state.explosions.push({ x: r.x, z: r.z, t: 0.25 });
              }
            }
          } else if (hitEnemyTarget) {
            hitEnemy(hitEnemyTarget, r.dmg, r.dx, r.dz);
            state.explosions.push({ x: r.x, z: r.z, t: 0.28 });
          }
        }
      }
    }
    state.rockets = state.rockets.filter((r) => r.t >= 0);
  }

  // ---------------------------------------------------------------- pickups
  function tickPickups() {
    for (const pk of pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.x - p.x, pk.z - p.z) > 0.85) continue;
      const take = (s: string) => { pk.taken = true; emit(`pickup:${pk.kind}`); say(s, 1.4); };
      switch (pk.kind) {
        case "treasure": state.score += 100; state.treasure++; take("TREASURE +100"); break;
        case "treasure-big": state.score += 500; state.treasure++; take("BIG TREASURE +500"); break;
        case "health": if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 25); take("MEDKIT +25"); break;
        case "plate": if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 10); take("FIELD PLATE +10"); break;
        case "ammo": p.ammo.bullets = Math.min(200, p.ammo.bullets + 24); p.ammo.rockets = Math.min(10, p.ammo.rockets + 1); take("AMMO"); break;
        case "armor": p.armor = Math.min(100, p.armor + 50); take("ARMOR +50"); break;
        case "key": p.key = true; take("BRASS KEY — the elevator is armed"); break;
        case "mg": if (!p.weapons.includes("mg")) { p.weapons.push("mg"); p.mags.mg = WEAPONS.mg.magSize; p.ammo.bullets = Math.min(200, p.ammo.bullets + 30); take("MACHINE GUN ACQUIRED"); switchWeapon("mg"); } else { p.ammo.bullets = Math.min(200, p.ammo.bullets + 30); take("MG AMMO"); } break;
        case "rocket": if (!p.weapons.includes("rocket")) { p.weapons.push("rocket"); p.mags.rocket = WEAPONS.rocket.magSize; p.ammo.rockets = Math.min(10, p.ammo.rockets + 4); take("ROCKET LAUNCHER ACQUIRED"); } else { p.ammo.rockets = Math.min(10, p.ammo.rockets + 3); take("ROCKETS +3"); } break;
        case "kit": p.hp = 100; p.armor = Math.min(100, p.armor + 50); take("SURPLUS KIT"); break;
      }
    }
  }

  // ---------------------------------------------------------------- doors
  function tickDoors(dt: number, wantsOpen = false) {
    for (const d of doors) {
      const dist = Math.hypot(d.cx + 0.5 - p.x / CELL, d.cz + 0.5 - p.z / CELL);
      const near = dist < 1.85;
      const enemyNear = enemies.some((e) => e.state !== "dead" && Math.hypot(e.x / CELL - d.cx - 0.5, e.z / CELL - d.cz - 0.5) < 1.4);
      d.target = near || enemyNear ? 1 : 0;
      if (near && wantsOpen) d.open = Math.max(d.open, 0.75);
      const prev = d.open;
      d.open += (d.target - d.open) * Math.min(1, dt * 8);
      if (d.open > 0.98) d.open = 1;
      if (prev < 0.05 && d.open >= 0.05) emit("door:open");
    }
  }
  function tickPushWalls(dt: number) {
    for (const pw of pushWalls) {
      if (pw.state !== "sliding") continue;
      pw.progress += dt * 1.4;
      if (pw.progress >= 2) {
        pw.progress = 2; pw.state = "open";
        grid[pw.cz * w + pw.cx] = ".";
        grid[(pw.cz + pw.dz) * w + (pw.cx + pw.dx)] = ".";
        grid[(pw.cz + pw.dz * 2) * w + (pw.cx + pw.dx * 2)] = "%";
      }
    }
  }

  // ---------------------------------------------------------------- elevator / end
  function tickExit() {
    if (state.finished) return;
    const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
    if (gridAt(pcx, pcz) === "E") {
      if (!p.key && state.mode === "descent") { say("LOCKED — FIND THE BRASS KEY", 1.6); return; }
      if (state.mode === "killhouse" && state.kills < state.totalEnemies) { say("CLEAR THE FLOOR FIRST", 1.6); return; }
      // the last floor ends with the Iron Warden: its elevator stays locked while the boss stands
      if (enemies.some((e) => e.kind === "boss" && e.state !== "dead")) { say("THE IRON WARDEN STILL STANDS", 1.6); return; }
      state.finished = true;
      const par = def.par;
      state.medal = state.time <= par ? "gold" : state.time <= par * 1.5 ? "silver" : "bronze";
      emit(`floor:complete:${state.medal}`);
    }
  }

  // ---------------------------------------------------------------- kill house
  function tickKillhouse() {
    if (state.mode !== "killhouse" || state.finished) return;
    state.killhouseLeft -= state.dtRemainder;
    if (state.kills >= state.totalEnemies) { state.finished = true; state.medal = "gold"; emit("killhouse:clear"); return; }
    if (state.killhouseLeft <= 0) { state.finished = true; state.medal = "none"; emit("killhouse:failed"); }
  }

  // ---------------------------------------------------------------- main tick
  function tick(dt: number, input: SimInput) {
    state.dtRemainder = dt;
    state.time += dt;
    state.msgT -= dt;
    if (state.msgT <= 0) state.msg = "";
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.fireT -= dt;
    p.switchT -= dt;
    state.shake = Math.max(0, state.shake - dt * 2.2);
    state.muzzle = Math.max(0, (state.muzzle ?? 0) - dt);

    if (p.reloading > 0) { p.reloading -= dt; if (p.reloading <= 0) finishReload(); }

    const wantsOpenDoor = input.moveZ > 0 || input.fire || input.firePressed || input.use;
    tickDoors(dt, wantsOpenDoor);
    tickPushWalls(dt);

    if (p.alive && !state.finished) {
      // ---- look
      p.yaw += input.turn;
      p.pitch = Math.max(-0.55, Math.min(0.55, p.pitch + input.pitchDelta));
      // ---- weapon
      if (input.weapon) switchWeapon(input.weapon);
      if (input.weaponDelta) {
        const idx = p.weapons.indexOf(p.weapon);
        const next = p.weapons[(idx + input.weaponDelta + p.weapons.length) % p.weapons.length];
        switchWeapon(next);
      }
      if (input.reload) startReload();
      // ---- fire
      const wantsFire = input.fire || input.firePressed;
      if (wantsFire) tryFire(input);
      if (input.use) tryUse();
      // ---- move (forward = (sin(yaw), -cos(yaw)), right = (cos(yaw), sin(yaw)))
      const speed = 5.2;
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
      const mx = (input.moveX * rx + input.moveZ * fx) * speed * dt;
      const mz = (input.moveX * rz + input.moveZ * fz) * speed * dt;
      const px = p.x, pz = p.z;
      moveWithCollision(p, mx, mz, PLAYER_R);
      if (Math.hypot(p.x - px, p.z - pz) > 0.01) {
        p.stepT -= dt;
        if (p.stepT <= 0) { p.stepT = 0.42; emit("step"); }
      }
    }

    tickRockets(dt);
    // C16: enemies stand down once the floor is finished (cleared delay, results)
    if (!state.finished) for (const e of enemies) tickEnemy(e, dt);
    else for (const e of enemies) if (e.state === "dead") e.deathT += dt;
    tickPickups();
    tickExit();
    tickKillhouse();
    for (const ex of state.explosions) ex.t += dt;
    for (const s of state.shots) s.t += dt;
    for (const s of state.enemyShots) s.t += dt;
    if (state.enemyShots.length && state.enemyShots[0]!.t > 0.3) state.enemyShots = state.enemyShots.filter((s) => s.t < 0.3);
    state.explosions = state.explosions.filter((ex) => ex.t < 0.65);
    state.shots = state.shots.filter((s) => s.t < 0.35);
  }

  return { state, tick, cellBlocked, cellSolid, hasLOS, dealDamage, fireRocket: fireRocketAt };
}
