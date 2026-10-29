/**
 * Thermal Drift race simulation: pure, deterministic (seeded RNG, fixed step), no DOM or engine import.
 *
 * Positions are in track space: `progress` is metres of race distance from the start line (negative on the grid),
 * `x` metres right of the centre line, `y` metres above the road. main.ts draws this state through TrackView.
 *
 * Audit rows fixed here: C1 finish and results, C2 rival fire, damage, wall scrape, bumps and respawn, C3 real ranking
 * with speed rubber-banding (no teleports), C9 mine hit test and a recorded ghost, C10 elimination of the last-placed
 * racer with win and lose states, C14 pickups once per pass, C15 boot values, C16 one full reset, C17 weapons limited to
 * the drawn rivals.
 */
import {
  CIRCUITS,
  DRONE_ORDER,
  DRONE_SPECS,
  PICKUP_ITEMS,
  PICKUP_REACH,
  RIVAL_PILOT_NAMES,
  SCENERY_ANCHORS,
  TOTAL_LAPS,
  WALL_LIMIT,
  type CircuitId,
  type DroneId,
  type ModeId,
  type PickupItem
} from "./data";
import { CURVE_GAIN, curvatureAt } from "./track";

export const STEP = 1 / 60;
export const COUNTDOWN_SECONDS = 3;
/** The game's speed scale: metres per second = km/h / 9.2 (465 km/h is about 50 m/s). */
export const KMH_PER_MS = 9.2;
export const ELIM_INTERVAL = 20;
export const DRAWN_RIVALS = 6;
/** Rivals are drawn from this far behind to this far ahead of the player. */
/** Behind the player a rival is drawn only while it is still clear of the camera, 10 m back (it fills the lens otherwise). */
export const DRAW_BEHIND = 4;
export const DRAW_AHEAD = 220;
export const GHOST_STEP = 10;
export const LASER_BOLTS = 6;
export const RESPAWN_SECONDS = 2;
export const RESPAWN_PENALTY = 30;
export const RIVAL_BASE_KMH = 650;
export const MISSILE_DAMAGE = 30;
export const RIVAL_SPREAD_KMH = 60;
export const RUBBER_RANGE = 150;
export const RUBBER_GAIN = 0.12;
/** Half-width of the explosive barrel's hit zone across the track. */
export const BARREL_REACH = 1.8;

export type Phase = "countdown" | "racing" | "results";
export type Action = "shock" | "roll" | "mine" | "item" | "missile";

export interface SimInput {
  steer: number;
  pitch: number;
  boost: boolean;
  fire: boolean;
}

export interface RivalState {
  readonly index: number;
  readonly name: string;
  droneId: DroneId;
  progress: number;
  x: number;
  y: number;
  targetX: number;
  speedKmh: number;
  readonly baseKmh: number;
  hull: number;
  respawn: number;
  eliminated: boolean;
  readonly phase: number;
  finished: boolean;
  finishTime: number;
  fireCooldown: number;
  bumpCooldown: number;
}

export interface PlayerState {
  progress: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speedKmh: number;
  roll: number;
  pitch: number;
  yaw: number;
  hull: number;
  shield: number;
  heat: number;
  overheated: boolean;
  overheatTimer: number;
  ab: number;
  gun: number;
  shockCooldown: number;
  shockActive: number;
  rollCooldown: number;
  rollTimer: number;
  mineCooldown: number;
  fireCooldown: number;
  item: PickupItem | null;
  hyper: number;
  respawn: number;
  scraping: boolean;
  /** Afterburner lit on the last step. */
  boosting: boolean;
  lastHitTime: number;
  eliminated: boolean;
  finished: boolean;
}

export interface Bolt { active: boolean; progress: number; x: number; y: number; ttl: number; }
export interface Missile { active: boolean; progress: number; x: number; y: number; ttl: number; target: number; }
export interface Incoming { active: boolean; from: number; eta: number; total: number; }
export interface Mine { active: boolean; progress: number; x: number; ttl: number; }

/** Lap time at every GHOST_STEP metres of a lap. */
export interface GhostTrace { readonly lapSeconds: number; readonly samples: readonly number[]; }

export interface RaceResult {
  readonly outcome: "finished" | "won" | "eliminated";
  readonly position: number;
  readonly field: number;
  readonly totalTime: number;
  readonly bestLap: number | null;
  readonly lapTimes: readonly number[];
  readonly takedowns: number;
  readonly newBest: boolean;
}

export type SimEvent =
  | { type: "countdown"; value: number }
  | { type: "go" }
  | { type: "lap"; lap: number; lapSeconds: number; best: boolean; trace: GhostTrace | null }
  | { type: "finish"; result: RaceResult }
  | { type: "takedown"; name: string; by: "laser" | "missile" | "shock" | "mine" }
  | { type: "hit"; name: string }
  | { type: "incoming"; name: string }
  | { type: "evaded" }
  | { type: "damage"; amount: number; source: "missile" | "scrape" | "bump" | "barrel" }
  | { type: "scrape" }
  | { type: "bump"; name: string }
  | { type: "pickup"; kind: "boost" | "coolant" | "shield" | "recharge"; item: PickupItem | null }
  | { type: "barrel" }
  | { type: "destroyed" }
  | { type: "respawn" }
  | { type: "eliminated"; name: string; player: boolean }
  | { type: "overheat" }
  | { type: "shock"; hits: number }
  | { type: "roll" }
  | { type: "mine" }
  | { type: "missile" }
  | { type: "item"; item: PickupItem }
  | { type: "laser" };

export interface RaceConfig {
  readonly circuit: CircuitId;
  readonly mode: ModeId;
  readonly drone: DroneId;
  readonly seed?: number;
  /** Stored best lap for this circuit and drone. */
  readonly bestLap?: number | null;
  readonly ghost?: GhostTrace | null;
}

export interface RaceState {
  readonly circuit: CircuitId;
  readonly mode: ModeId;
  readonly drone: DroneId;
  rng: number;
  phase: Phase;
  countdown: number;
  time: number;
  steps: number;
  lapsDone: number;
  lapStartTime: number;
  lapTimes: number[];
  bestLap: number | null;
  /** The stored best when the race began (for the results' "new best"). */
  readonly startBestLap: number | null;
  ghost: GhostTrace | null;
  trace: number[];
  player: PlayerState;
  readonly rivals: RivalState[];
  readonly bolts: Bolt[];
  readonly missile: Missile;
  readonly incoming: Incoming;
  readonly mine: Mine;
  /** Pass index of the last collected copy, per anchor id. */
  readonly collected: Record<string, number>;
  elimTimer: number;
  lastEliminated: string;
  /** Rival indices drawn this step (at most DRAWN_RIVALS, nearest first). Weapons only touch these. */
  readonly drawn: number[];
  locked: number;
  position: number;
  field: number;
  takedowns: number;
  fireCooldown: number;
  readonly events: SimEvent[];
  result: RaceResult | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** mulberry32 on the state's own seed: the stream depends only on the seed and the steps taken. */
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function playerTopKmh(drone: DroneId): number {
  return 415 + DRONE_SPECS[drone].speed * 19;
}

export function createRace(config: RaceConfig): RaceState {
  const rngState = { rng: (config.seed ?? 20261029) >>> 0 };
  const rivalPool = DRONE_ORDER.filter((d) => d !== config.drone);
  // Grid: 12 slots 7 m apart behind the start line, two abreast. The player starts sixth.
  const playerSlot = 5;
  const slotProgress = (slot: number) => -4 - slot * 7;
  const slotX = (slot: number) => (slot % 2 === 0 ? -2.6 : 2.6);
  const rivals: RivalState[] = config.mode === "trial" ? [] : RIVAL_PILOT_NAMES.map((name, index) => {
    const slot = index < playerSlot ? index : index + 1;
    return {
      index,
      name,
      droneId: rivalPool[index % rivalPool.length] ?? "volt",
      progress: slotProgress(slot),
      x: slotX(slot),
      y: 1.5 + (index % 3) * 0.4,
      targetX: slotX(slot),
      speedKmh: 0,
      baseKmh: RIVAL_BASE_KMH + nextRandom(rngState) * RIVAL_SPREAD_KMH,
      hull: 100,
      respawn: 0,
      eliminated: false,
      phase: index * 1.17,
      finished: false,
      finishTime: 0,
      fireCooldown: 6 + nextRandom(rngState) * 6,
      bumpCooldown: 0
    };
  });
  const state: RaceState = {
    circuit: config.circuit,
    mode: config.mode,
    drone: config.drone,
    rng: rngState.rng,
    phase: "countdown",
    countdown: COUNTDOWN_SECONDS,
    time: 0,
    steps: 0,
    lapsDone: 0,
    lapStartTime: 0,
    lapTimes: [],
    bestLap: config.bestLap ?? null,
    startBestLap: config.bestLap ?? null,
    ghost: config.ghost ?? null,
    trace: [],
    player: {
      progress: slotProgress(playerSlot),
      x: slotX(playerSlot),
      y: 1.55,
      vx: 0,
      vy: 0,
      speedKmh: 0,
      roll: 0,
      pitch: -0.04,
      yaw: 0,
      hull: 100,
      shield: 78,
      heat: 24,
      overheated: false,
      overheatTimer: 0,
      ab: 88,
      gun: 92,
      shockCooldown: 0,
      shockActive: 0,
      rollCooldown: 0,
      rollTimer: 0,
      mineCooldown: 0,
      fireCooldown: 0,
      item: null,
      hyper: 0,
      respawn: 0,
      scraping: false,
      boosting: false,
      lastHitTime: -99,
      eliminated: false,
      finished: false
    },
    rivals,
    bolts: Array.from({ length: LASER_BOLTS }, () => ({ active: false, progress: 0, x: 0, y: 0, ttl: 0 })),
    missile: { active: false, progress: 0, x: 0, y: 0, ttl: 0, target: -1 },
    incoming: { active: false, from: -1, eta: 0, total: 0 },
    mine: { active: false, progress: 0, x: 0, ttl: 0 },
    collected: {},
    elimTimer: ELIM_INTERVAL,
    lastEliminated: "—",
    drawn: [],
    locked: -1,
    position: 1,
    field: rivals.length + 1,
    takedowns: 0,
    fireCooldown: 5,
    events: [],
    result: null
  };
  updateStandings(state);
  updateDrawn(state);
  return state;
}

// ------------------------------------------------------------------------------------------ standings

/** Racers ahead of the player by real progress (finished racers by finish time). */
function racersAhead(state: RaceState): number {
  const p = state.player;
  let ahead = 0;
  for (const r of state.rivals) {
    if (r.eliminated) continue;
    if (r.finished) {
      if (!p.finished || r.finishTime < state.time) ahead += 1;
    } else if (!p.finished && r.progress > p.progress) {
      ahead += 1;
    }
  }
  return ahead;
}

export function activeField(state: RaceState): number {
  let n = state.player.eliminated ? 0 : 1;
  for (const r of state.rivals) if (!r.eliminated) n += 1;
  return n;
}

function updateStandings(state: RaceState): void {
  state.field = activeField(state);
  state.position = state.player.eliminated ? state.field + 1 : 1 + racersAhead(state);
}

/** Every racer by place (the player is index -1): eliminated last, finished by finish time, then by progress. */
export function standings(state: RaceState): { index: number; name: string; progress: number; finished: boolean }[] {
  const p = state.player;
  const rows = [
    { index: -1, name: "YOU", progress: p.progress, finished: p.finished, finishTime: p.finished ? state.time : Infinity, out: p.eliminated },
    ...state.rivals.map((r) => ({ index: r.index, name: r.name, progress: r.progress, finished: r.finished, finishTime: r.finished ? r.finishTime : Infinity, out: r.eliminated }))
  ];
  rows.sort((a, b) => {
    if (a.out !== b.out) return a.out ? 1 : -1;
    if (a.finished || b.finished) return a.finishTime - b.finishTime || a.index - b.index;
    return b.progress - a.progress || a.index - b.index;
  });
  return rows.map(({ index, name, progress, finished }) => ({ index, name, progress, finished }));
}

/** The drawn set: up to six rivals in view range, nearest first; stable tie-break by index. */
function updateDrawn(state: RaceState): void {
  const drawn = state.drawn;
  drawn.length = 0;
  const p = state.player.progress;
  for (const r of state.rivals) {
    if (r.eliminated || r.respawn > 0) continue;
    const d = r.progress - p;
    if (d < -DRAW_BEHIND || d > DRAW_AHEAD) continue;
    drawn.push(r.index);
  }
  drawn.sort((a, b) => Math.abs(state.rivals[a]!.progress - p) - Math.abs(state.rivals[b]!.progress - p) || a - b);
  if (drawn.length > DRAWN_RIVALS) drawn.length = DRAWN_RIVALS;
  // Lock: the nearest drawn rival 6 to 68 m ahead.
  let locked = -1, best = Infinity;
  for (const i of drawn) {
    const d = state.rivals[i]!.progress - p;
    if (d >= 6 && d <= 68 && d < best) { best = d; locked = i; }
  }
  state.locked = locked;
}

function isDrawn(state: RaceState, index: number): boolean {
  return state.drawn.includes(index);
}

// ------------------------------------------------------------------------------------------ damage

function armourFactor(drone: DroneId): number {
  return 1.25 - DRONE_SPECS[drone].armour * 0.06;
}

/** Shield first, then hull (scaled by armour). Hull 0 destroys the drone. */
export function damagePlayer(state: RaceState, amount: number, source: "missile" | "scrape" | "bump" | "barrel"): void {
  const p = state.player;
  if (p.respawn > 0 || state.phase !== "racing") return;
  const absorbed = Math.min(p.shield, amount);
  p.shield -= absorbed;
  p.hull -= (amount - absorbed) * armourFactor(state.drone);
  p.lastHitTime = state.time;
  if (source !== "scrape") state.events.push({ type: "damage", amount, source });
  if (p.hull <= 0) {
    p.hull = 0;
    p.respawn = RESPAWN_SECONDS;
    p.speedKmh = 0;
    p.item = null;
    state.incoming.active = false;
    state.events.push({ type: "destroyed" });
  }
}

function damageRival(state: RaceState, rival: RivalState, amount: number, by: "laser" | "missile" | "shock" | "mine"): void {
  rival.hull -= amount;
  if (rival.hull > 0) {
    if (by === "laser") state.events.push({ type: "hit", name: rival.name });
    return;
  }
  rival.hull = 100;
  rival.respawn = 2.4;
  rival.speedKmh = 0;
  state.takedowns += 1;
  state.events.push({ type: "takedown", name: rival.name, by });
}

// ------------------------------------------------------------------------------------------ actions

function triggerShockwave(state: RaceState): void {
  const p = state.player;
  if (p.shockCooldown > 0) return;
  p.shockCooldown = 8;
  p.shockActive = 0.65;
  let hits = 0;
  for (const i of state.drawn) {
    const r = state.rivals[i]!;
    if (Math.abs(r.progress - p.progress) < 26 && Math.abs(r.x - p.x) < 7.5) {
      hits += 1;
      r.speedKmh *= 0.68;
      damageRival(state, r, 35, "shock");
    }
  }
  state.events.push({ type: "shock", hits });
}

function triggerRoll(state: RaceState): void {
  const p = state.player;
  if (p.rollCooldown > 0) return;
  p.rollCooldown = 4;
  p.rollTimer = 0.58;
  if (state.incoming.active) {
    state.incoming.active = false;
    state.events.push({ type: "evaded" });
  }
  state.events.push({ type: "roll" });
}

function dropMine(state: RaceState): void {
  const p = state.player;
  if (p.mineCooldown > 0) return;
  p.mineCooldown = 6;
  Object.assign(state.mine, { active: true, progress: p.progress - 4, x: p.x, ttl: 20 });
  state.events.push({ type: "mine" });
}

function fireMissile(state: RaceState): void {
  const p = state.player;
  const m = state.missile;
  if (m.active) return;
  let target = state.locked;
  if (target < 0) {
    let best = 95;
    for (const i of state.drawn) {
      const d = state.rivals[i]!.progress - p.progress;
      if (d > 4 && d < best) { best = d; target = i; }
    }
  }
  Object.assign(m, { active: true, progress: p.progress + 2.2, x: p.x, y: p.y - 0.2, ttl: 1.8, target });
  state.events.push({ type: "missile" });
}

function useItem(state: RaceState): void {
  const p = state.player;
  const item = p.item;
  if (!item) return;
  p.item = null;
  if (item === "TURBO CELL") { p.ab = 100; p.speedKmh = Math.min(760, p.speedKmh + 140); }
  else if (item === "CRYO FLUSH") { p.heat = 0; p.overheated = false; }
  else if (item === "EMP SURGE") { p.shockCooldown = 0; triggerShockwave(state); }
  else if (item === "AEGIS MATRIX") { p.shield = 100; p.hull = Math.min(100, p.hull + 35); }
  else if (item === "SEEKER SALVO") { state.missile.active = false; fireMissile(state); }
  else if (item === "HYPERDRIVE") { p.hyper = 4.5; p.heat = Math.max(0, p.heat - 30); }
  state.events.push({ type: "item", item });
}

function fireLasers(state: RaceState): void {
  const p = state.player;
  if (p.overheated || p.gun < 6 || p.fireCooldown > 0) return;
  p.fireCooldown = 0.11;
  p.heat = Math.min(100, p.heat + Math.max(1.8, 4.2 - DRONE_SPECS[state.drone].laser * 0.22));
  p.gun = Math.max(0, p.gun - 7);
  if (p.heat >= 99.5) { p.overheated = true; p.overheatTimer = 2.2; state.events.push({ type: "overheat" }); }
  let spawned = 0;
  for (const b of state.bolts) {
    if (b.active) continue;
    Object.assign(b, { active: true, progress: p.progress + 1.8, x: p.x + (spawned === 0 ? -0.85 : 0.85), y: p.y - 0.08, ttl: 0.72 });
    spawned += 1;
    if (spawned >= 2) break;
  }
  state.events.push({ type: "laser" });
}

// ------------------------------------------------------------------------------------------ step

export function stepRace(state: RaceState, input: SimInput, actions: readonly Action[] = [], dt = STEP): void {
  state.events.length = 0;
  state.steps += 1;
  if (state.phase === "countdown") {
    const before = Math.ceil(state.countdown);
    state.countdown -= dt;
    const after = Math.ceil(state.countdown);
    if (state.countdown <= 0) {
      state.phase = "racing";
      state.countdown = 0;
      state.events.push({ type: "go" });
    } else if (after !== before || state.steps === 1) {
      state.events.push({ type: "countdown", value: after });
    }
    return;
  }
  if (state.phase === "results") return;

  const p = state.player;
  const circuit = CIRCUITS[state.circuit];
  const spec = DRONE_SPECS[state.drone];
  state.time += dt;

  // Timers
  p.shockCooldown = Math.max(0, p.shockCooldown - dt);
  p.shockActive = Math.max(0, p.shockActive - dt);
  p.rollCooldown = Math.max(0, p.rollCooldown - dt);
  p.rollTimer = Math.max(0, p.rollTimer - dt);
  p.mineCooldown = Math.max(0, p.mineCooldown - dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.hyper = Math.max(0, p.hyper - dt);
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);

  if (p.respawn > 0) {
    p.respawn -= dt;
    if (p.respawn <= 0) {
      p.respawn = 0;
      p.hull = 100;
      p.shield = 50;
      p.heat = 24;
      p.overheated = false;
      p.speedKmh = 300;
      p.x = 0;
      p.vx = 0;
      // Position penalty: set back RESPAWN_PENALTY metres, never behind the last line crossed.
      p.progress = Math.max(state.lapsDone > 0 ? state.lapsDone * circuit.length : -Infinity, p.progress - RESPAWN_PENALTY);
      state.events.push({ type: "respawn" });
    }
  } else {
    for (const action of actions) {
      if (action === "shock") triggerShockwave(state);
      else if (action === "roll") triggerRoll(state);
      else if (action === "mine") dropMine(state);
      else if (action === "item") useItem(state);
      else if (action === "missile") fireMissile(state);
    }
  }
  const alive = p.respawn <= 0;

  if (p.overheated) {
    p.overheatTimer -= dt;
    p.heat = Math.max(0, p.heat - 36 * dt);
    if (p.overheatTimer <= 0 || p.heat <= 18) p.overheated = false;
  }

  // Speed, afterburner and heat
  const boosting = alive && input.boost && !p.overheated && p.ab > 2;
  p.boosting = boosting;
  if (alive) {
    const target = playerTopKmh(state.drone) + (boosting ? 135 + spec.boost * 8 : 0) + (p.hyper > 0 ? 185 : 0);
    p.speedKmh = lerp(p.speedKmh, target, clamp(dt * (p.speedKmh < 300 ? 1.6 : 4.2), 0, 1));
  }
  if (boosting) {
    p.ab = Math.max(0, p.ab - 22 * dt);
    p.heat = Math.min(100, p.heat + 14.5 * dt);
    if (p.heat >= 99.5) { p.overheated = true; p.overheatTimer = 2.2; state.events.push({ type: "overheat" }); }
  } else {
    p.ab = Math.min(100, p.ab + 16 * dt);
    p.heat = Math.max(10, p.heat - 15 * dt);
  }
  p.gun = Math.min(100, p.gun + (14 + spec.laser * 1.4) * dt);
  if (state.time - p.lastHitTime > 3) p.shield = Math.min(100, p.shield + 2 * dt);
  if (state.time - p.lastHitTime > 5) p.hull = Math.min(100, p.hull + 0.5 * dt);
  if (alive && input.fire) fireLasers(state);

  // Progress, laps and the ghost trace
  const prevProgress = p.progress;
  p.progress += (p.speedKmh / KMH_PER_MS) * dt;
  // Lap times run line to line: lap 1 starts when the drone crosses the line from the grid, not at GO.
  if (state.lapsDone === 0 && prevProgress < 0 && p.progress >= 0) {
    state.lapStartTime = state.time - (p.progress / Math.max(1e-6, p.progress - prevProgress)) * dt;
    state.trace = [];
  }
  const lapStart = state.lapsDone * circuit.length;
  while (state.trace.length * GHOST_STEP <= p.progress - lapStart && state.trace.length * GHOST_STEP <= circuit.length) {
    state.trace.push(state.time - state.lapStartTime);
  }
  if (p.progress >= (state.lapsDone + 1) * circuit.length) completeLap(state);
  if (state.phase !== "racing") return;

  // Lateral and vertical flight, walls
  const curvature = curvatureAt(circuit, p.progress) / CURVE_GAIN;
  const centring = Math.abs(input.steer) < 0.05 ? -p.x * 0.65 : 0;
  p.vx = lerp(p.vx, (alive ? input.steer * 15.5 : 0) - curvature * 1.5 + centring, clamp(dt * 7.5, 0, 1));
  p.vy = lerp(p.vy, alive ? input.pitch * 6.5 : 0, clamp(dt * 7.5, 0, 1));
  p.x += p.vx * dt;
  p.y = clamp(p.y + p.vy * dt, 0.95, 3.6);
  const scraping = alive && Math.abs(p.x) >= WALL_LIMIT;
  if (scraping) {
    p.x = Math.sign(p.x) * WALL_LIMIT;
    if (Math.sign(p.vx) === Math.sign(p.x)) p.vx = 0;
    p.speedKmh *= 1 - 0.9 * dt;
    p.heat = Math.min(100, p.heat + 22 * dt);
    damagePlayer(state, 3 * dt, "scrape");
    if (!p.scraping) state.events.push({ type: "scrape" });
  }
  p.scraping = scraping;
  const steerVisual = alive ? input.steer : 0;
  p.roll = lerp(p.roll, -steerVisual * 0.46, clamp(dt * 9, 0, 1));
  p.pitch = lerp(p.pitch, input.pitch * 0.18 - 0.04, clamp(dt * 8, 0, 1));
  p.yaw = lerp(p.yaw, -steerVisual * 0.14, clamp(dt * 8, 0, 1));

  if (alive) touchAnchors(state, prevProgress);
  stepRivals(state, dt);
  updateDrawn(state);
  if (alive) bumpRivals(state);
  stepWeapons(state, dt);
  stepRivalFire(state, dt);
  if (state.mode === "elim") stepElimination(state, dt);
  updateStandings(state);
}

/** Visual barrel-roll angle (radians) on top of the bank. */
export function rollAngle(state: RaceState): number {
  const p = state.player;
  return p.rollTimer > 0 ? (1 - p.rollTimer / 0.58) * Math.PI * 2 : 0;
}

function completeLap(state: RaceState): void {
  const lapSeconds = state.time - state.lapStartTime;
  state.lapTimes.push(lapSeconds);
  const best = state.bestLap === null || lapSeconds < state.bestLap;
  let trace: GhostTrace | null = null;
  if (best) state.bestLap = lapSeconds;
  if (state.ghost === null || lapSeconds < state.ghost.lapSeconds) {
    trace = { lapSeconds, samples: state.trace.slice() };
    state.ghost = trace;
  }
  state.lapsDone += 1;
  state.lapStartTime = state.time;
  state.trace = [];
  state.events.push({ type: "lap", lap: state.lapsDone, lapSeconds, best, trace });
  if (state.mode !== "elim" && state.lapsDone >= TOTAL_LAPS) finishRace(state, "finished");
}

function finishRace(state: RaceState, outcome: RaceResult["outcome"]): void {
  const p = state.player;
  if (outcome === "finished") p.finished = true;
  updateStandings(state);
  const newBest = state.bestLap !== null && (state.startBestLap === null || state.bestLap < state.startBestLap);
  state.result = {
    outcome,
    position: outcome === "eliminated" ? activeField(state) + 1 : state.position,
    field: state.mode === "trial" ? 1 : state.rivals.length + 1,
    totalTime: state.time,
    bestLap: state.lapTimes.length ? Math.min(...state.lapTimes) : null,
    lapTimes: state.lapTimes.slice(),
    takedowns: state.takedowns,
    newBest
  };
  state.phase = "results";
  state.incoming.active = false;
  state.events.push({ type: "finish", result: state.result });
}

/** Ghost delta for the current lap: seconds behind (+) or ahead (-) of the stored best lap, or null with no ghost. */
export function ghostDelta(state: RaceState): number | null {
  const g = state.ghost;
  if (!g || state.phase !== "racing") return null;
  const length = CIRCUITS[state.circuit].length;
  const d = state.player.progress - state.lapsDone * length;
  if (d < 0) return null;
  const f = d / GHOST_STEP;
  const i = Math.floor(f);
  const a = g.samples[i], b = g.samples[i + 1];
  if (a === undefined) return null;
  const ghostTime = b === undefined ? a : a + (b - a) * (f - i);
  return state.time - state.lapStartTime - ghostTime;
}

// ------------------------------------------------------------------------------------------ anchors

function touchAnchors(state: RaceState, prevProgress: number): void {
  const p = state.player;
  for (const anchor of SCENERY_ANCHORS) {
    if (anchor.kind === "decor") continue;
    // Copies sit at anchor.s + k·period of race progress.
    const k = Math.floor((p.progress - anchor.s) / anchor.period);
    const copy = anchor.s + k * anchor.period;
    if (anchor.kind === "water" || anchor.kind === "lava") {
      const near = Math.abs(p.progress - copy) < 8 || Math.abs(p.progress - (copy + anchor.period)) < 8;
      if (anchor.kind === "water" && near && p.x < -2.5) p.heat = Math.max(0, p.heat - 28 * STEP);
      if (anchor.kind === "lava" && near && p.x > 3.5) p.heat = Math.min(100, p.heat + 18 * STEP);
      continue;
    }
    // A pickup applies once per pass: on the step the drone crosses the copy, and never again for that copy.
    if (!(prevProgress < copy && p.progress >= copy)) continue;
    if (Math.abs(p.x - anchor.lateralX) >= (anchor.kind === "barrel" ? BARREL_REACH : PICKUP_REACH)) continue;
    if (state.collected[anchor.id] === k) continue;
    state.collected[anchor.id] = k;
    if (anchor.kind === "boost") {
      p.speedKmh = Math.min(760, p.speedKmh + 85);
      p.ab = Math.min(100, p.ab + 18);
      state.events.push({ type: "pickup", kind: "boost", item: null });
    } else if (anchor.kind === "coolant" || anchor.kind === "shield") {
      if (anchor.kind === "coolant") { p.heat = Math.max(0, p.heat - 38); p.overheated = false; }
      else p.shield = Math.min(100, p.shield + 32);
      let item: PickupItem | null = null;
      if (!p.item) {
        item = PICKUP_ITEMS[Math.floor(nextRandom(state) * PICKUP_ITEMS.length)] ?? "TURBO CELL";
        p.item = item;
      }
      state.events.push({ type: "pickup", kind: anchor.kind, item });
    } else if (anchor.kind === "recharge") {
      p.shockCooldown = 0;
      state.events.push({ type: "pickup", kind: "recharge", item: null });
    } else if (anchor.kind === "barrel") {
      p.speedKmh *= 0.88;
      state.events.push({ type: "barrel" });
      damagePlayer(state, 16, "barrel");
    }
  }
}

/** Pass index of the copy of `anchorId` collected last (-Infinity when never). main.ts hides that copy. */
export function collectedPass(state: RaceState, anchorId: string): number {
  return state.collected[anchorId] ?? -Infinity;
}

// ------------------------------------------------------------------------------------------ rivals

function stepRivals(state: RaceState, dt: number): void {
  const p = state.player;
  const L = CIRCUITS[state.circuit].length;
  const finishLine = TOTAL_LAPS * L;
  for (const r of state.rivals) {
    if (r.eliminated) continue;
    r.fireCooldown = Math.max(0, r.fireCooldown - dt);
    r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
    if (r.respawn > 0) {
      r.respawn = Math.max(0, r.respawn - dt);
      continue;
    }
    // Rubber band on speed only (no teleports): a rival RUBBER_RANGE m behind the player runs up to RUBBER_GAIN faster,
    // one that far ahead up to RUBBER_GAIN slower.
    const gap = clamp((p.progress - r.progress) / RUBBER_RANGE, -1, 1);
    const target = r.baseKmh * (1 + gap * RUBBER_GAIN) + Math.sin(state.time * 1.1 + r.phase) * 14;
    r.speedKmh = lerp(r.speedKmh, target, clamp(dt * (r.speedKmh < 300 ? 1.6 : 2.5), 0, 1));
    r.progress += (r.speedKmh / KMH_PER_MS) * dt;
    if (!r.finished && state.mode !== "elim" && r.progress >= finishLine) {
      r.finished = true;
      r.finishTime = state.time;
    }
    r.targetX = Math.sin(state.time * 0.9 + r.phase) * 6.2;
    r.x = lerp(r.x, r.targetX, clamp(dt * 3.2, 0, 1));
    r.y = lerp(r.y, 1.45 + (r.index % 3) * 0.45 + Math.cos(state.time * 1.4 + r.phase) * 0.32, clamp(dt * 3.2, 0, 1));
  }
  separateRivals(state, dt);
}

/** Lateral room a rival keeps from the player and from other rivals while they are side by side. */
export const SEPARATION_X = 2.6;
const SEPARATION_PROGRESS = 5;

/**
 * Rivals side by side with the player or with each other drift apart sideways, so drone models never sit inside one
 * another on screen (they did on the base and in the first rebuild, card-2x frame of run g03w3-after2). The player is
 * not moved: steering into a rival faster than it yields still gives a bump.
 */
function separateRivals(state: RaceState, dt: number): void {
  const p = state.player;
  const k = clamp(dt * 15, 0, 1);
  const push = (r: RivalState, otherX: number, otherProgress: number): void => {
    if (Math.abs(r.progress - otherProgress) >= SEPARATION_PROGRESS) return;
    const dx = r.x - otherX;
    const gap = SEPARATION_X - Math.abs(dx);
    if (gap <= 0) return;
    const side = dx !== 0 ? Math.sign(dx) : r.index % 2 === 0 ? 1 : -1;
    r.x = clamp(r.x + side * gap * k, -WALL_LIMIT, WALL_LIMIT);
  };
  const rivals = state.rivals;
  for (const r of rivals) {
    if (r.eliminated || r.respawn > 0) continue;
    if (p.respawn <= 0 && !p.eliminated) push(r, p.x, p.progress);
    for (const o of rivals) {
      if (o.index >= r.index || o.eliminated || o.respawn > 0) continue;
      push(r, o.x, o.progress);
    }
  }
}

function bumpRivals(state: RaceState): void {
  const p = state.player;
  for (const i of state.drawn) {
    const r = state.rivals[i]!;
    if (r.bumpCooldown > 0) continue;
    if (Math.abs(r.progress - p.progress) < 3.4 && Math.abs(r.x - p.x) < 2.2 && Math.abs(r.y - p.y) < 1.3) {
      const side = p.x >= r.x ? 1 : -1;
      p.vx += side * 9;
      r.x -= side * 1.2;
      p.speedKmh *= 0.95;
      r.speedKmh *= 0.95;
      r.hull = Math.max(1, r.hull - 8);
      r.bumpCooldown = 0.8;
      state.events.push({ type: "bump", name: r.name });
      damagePlayer(state, 5, "bump");
    }
  }
}

function stepWeapons(state: RaceState, dt: number): void {
  const p = state.player;
  const playerMs = p.speedKmh / KMH_PER_MS;
  // Lasers: drawn rivals only.
  for (const b of state.bolts) {
    if (!b.active) continue;
    b.ttl -= dt;
    b.progress += (playerMs + 165) * dt;
    if (b.ttl <= 0 || b.progress - p.progress > 130) { b.active = false; continue; }
    for (const i of state.drawn) {
      const r = state.rivals[i]!;
      if (r.respawn > 0) continue;
      if (Math.abs(b.progress - r.progress) < 3.4 && Math.abs(b.x - r.x) < 2.2 && Math.abs(b.y - r.y) < 1.8) {
        b.active = false;
        damageRival(state, r, 14 + DRONE_SPECS[state.drone].laser * 1.2, "laser");
        break;
      }
    }
  }
  // Homing missile: drawn target only.
  const m = state.missile;
  if (m.active) {
    m.ttl -= dt;
    m.progress += (playerMs + 95) * dt;
    const t = m.target >= 0 && isDrawn(state, m.target) ? state.rivals[m.target]! : null;
    if (t && t.respawn <= 0) {
      m.x = lerp(m.x, t.x, clamp(dt * 9, 0, 1));
      m.y = lerp(m.y, t.y, clamp(dt * 9, 0, 1));
      if (Math.abs(m.progress - t.progress) < 4) {
        m.active = false;
        damageRival(state, t, 999, "missile");
      }
    }
    if (m.ttl <= 0 || m.progress - p.progress > 140) m.active = false;
  }
  // Proximity mine: a rival crossing it takes 45 damage and loses half its speed. The mine is the one rear weapon: it
  // lies behind the camera by design, so it checks every active rival rather than the drawn (in-front) set.
  const mine = state.mine;
  if (mine.active) {
    mine.ttl -= dt;
    if (mine.ttl <= 0 || p.progress - mine.progress > 400) mine.active = false;
    else {
      for (const r of state.rivals) {
        if (r.eliminated || r.respawn > 0) continue;
        const prev = r.progress - (r.speedKmh / KMH_PER_MS) * dt;
        if (prev < mine.progress && r.progress >= mine.progress && Math.abs(r.x - mine.x) < 2.6) {
          mine.active = false;
          r.speedKmh *= 0.5;
          damageRival(state, r, 45, "mine");
          break;
        }
      }
    }
  }
}

function stepRivalFire(state: RaceState, dt: number): void {
  const p = state.player;
  const inc = state.incoming;
  if (inc.active) {
    inc.eta -= dt;
    if (inc.eta <= 0) {
      inc.active = false;
      damagePlayer(state, MISSILE_DAMAGE, "missile");
    }
    return;
  }
  if (state.fireCooldown > 0 || p.respawn > 0) return;
  const candidates: number[] = [];
  for (const i of state.drawn) {
    const r = state.rivals[i]!;
    const d = Math.abs(r.progress - p.progress);
    if (r.respawn <= 0 && r.fireCooldown <= 0 && d >= 8 && d <= 80) candidates.push(i);
  }
  if (candidates.length === 0) return;
  const shooter = state.rivals[candidates[Math.floor(nextRandom(state) * candidates.length)]!]!;
  inc.active = true;
  inc.from = shooter.index;
  inc.total = 1.5 + Math.abs(shooter.progress - p.progress) / 120;
  inc.eta = inc.total;
  shooter.fireCooldown = 9 + nextRandom(state) * 5;
  state.fireCooldown = 4.5 + nextRandom(state) * 3;
  state.events.push({ type: "incoming", name: shooter.name });
}

function stepElimination(state: RaceState, dt: number): void {
  state.elimTimer -= dt;
  if (state.elimTimer > 0) return;
  state.elimTimer = ELIM_INTERVAL;
  // The last-placed racer goes out, the player included.
  let lastRival: RivalState | null = null;
  for (const r of state.rivals) {
    if (r.eliminated) continue;
    if (!lastRival || r.progress < lastRival.progress) lastRival = r;
  }
  const p = state.player;
  if (!lastRival || p.progress < lastRival.progress) {
    p.eliminated = true;
    state.lastEliminated = "YOU";
    state.events.push({ type: "eliminated", name: "YOU", player: true });
    finishRace(state, "eliminated");
    return;
  }
  lastRival.eliminated = true;
  state.lastEliminated = lastRival.name.toUpperCase();
  state.events.push({ type: "eliminated", name: lastRival.name, player: false });
  if (activeField(state) <= 1) finishRace(state, "won");
}

// ------------------------------------------------------------------------------------------ autopilot

const autoInput: SimInput = { steer: 0, pitch: 0, boost: false, fire: false };
const autoActions: Action[] = [];

/** Demo pilot: a deterministic function of the state (no RNG draws), so autopilot runs replay exactly. */
export function autopilot(state: RaceState): { input: SimInput; actions: readonly Action[] } {
  const p = state.player;
  const t = state.time;
  autoActions.length = 0;
  const curvature = curvatureAt(CIRCUITS[state.circuit], p.progress) / CURVE_GAIN;
  let idealX = Math.sin(t * 0.85) * 4.2 - curvature * 5.2;
  // Line up on a pickup copy ahead (coolant when hot, shield when low), dodge the barrel.
  for (const anchor of SCENERY_ANCHORS) {
    if (anchor.kind === "decor" || anchor.kind === "water" || anchor.kind === "lava") continue;
    const k = Math.ceil((p.progress - anchor.s) / anchor.period);
    const d = anchor.s + k * anchor.period - p.progress;
    if (d < 0 || d > 45) continue;
    if (anchor.kind === "barrel") { if (Math.abs(p.x - anchor.lateralX) < 3) idealX = anchor.lateralX + (p.x > anchor.lateralX ? 3.5 : -3.5); }
    else if ((anchor.kind === "coolant" && p.heat > 55) || (anchor.kind === "shield" && p.shield < 60) || anchor.kind === "boost") idealX = anchor.lateralX;
  }
  idealX = clamp(idealX, -WALL_LIMIT + 1.5, WALL_LIMIT - 1.5);
  autoInput.steer = clamp((idealX - p.x) * 0.42, -1, 1);
  autoInput.pitch = clamp((1.65 + Math.sin(t * 1.35) * 0.48 - p.y) * 0.65, -1, 1);
  autoInput.boost = !p.overheated && p.ab > 32 && p.heat < 82 && Math.sin(t * 0.9) > -0.25;
  autoInput.fire = !p.overheated && p.gun > 24 && p.heat < 78 && state.locked >= 0;
  // The demo pilot reacts to about seven warnings in ten (a fixed pattern on the warning's rival), so it takes hits too.
  if (state.incoming.active && state.incoming.eta < 0.7 && p.rollCooldown <= 0 && (state.incoming.from * 7 + state.lapsDone) % 10 < 7) autoActions.push("roll");
  const nearRivals = state.drawn.filter((i) => { const r = state.rivals[i]!; return Math.abs(r.progress - p.progress) < 20 && Math.abs(r.x - p.x) < 6; }).length;
  if (p.shockCooldown <= 0 && nearRivals >= 2) autoActions.push("shock");
  if (!state.missile.active && state.locked >= 0 && Math.sin(t * 0.53) > 0.9) autoActions.push("missile");
  if (p.item && (p.item !== "CRYO FLUSH" || p.heat > 70) && (p.item !== "AEGIS MATRIX" || p.shield < 50)) autoActions.push("item");
  if (p.mineCooldown <= 0 && Math.sin(t * 0.37) > 0.8 && state.drawn.some((i) => { const d = state.rivals[i]!.progress - p.progress; return d < -4 && d > -20; })) autoActions.push("mine");
  return { input: autoInput, actions: autoActions };
}
