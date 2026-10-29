/**
 * Drift & Deliver port: the city layout, pickups and traffic, as pure data.
 *
 * Constants and generators follow the original's source: a 60 m grid of 43 m blocks centred on multiples of 60
 * (streets are the 17 m gaps centred on 60k + 30), a seeded noise `on(k)`, the district rule, the park-block rule
 * and the pickup generator are the original's. Building footprints and heights are this port's own: the original
 * places roughly 11,000 prop and building instances from GLB prototypes; the port builds one box per slot from
 * the same district table (slot width, buildings per side, floor count) and uses them as the collision solids.
 */
import { WORLD, type Solid } from "./sim";

export const PITCH = WORLD.pitch;
export const STREET_HALF = WORLD.streetHalf;
export const BLOCK_HALF = WORLD.blockHalf;
export const EXTENT = WORLD.extent;
/** Distance from a block centre to the building row on each side (`Ha`). */
export const SETBACK = 16.9;

/** The original's seeded noise. */
export function noise(k: number): number {
  const t = 43758.5453 * Math.sin(127.1 * k + 3.7);
  return t - Math.floor(t);
}

/** Street centre lines: `cs * 60 + 30` for cs -8..7 (`da`). */
export const STREET_LINES: readonly number[] = Array.from({ length: 16 }, (_, k) => (k - 8) * PITCH + 30);

export type District = "core" | "midtown" | "commerce" | "residential" | "outskirts";

export interface DistrictConfig {
  perSide: number;
  slot: number;
  floors: number;
}

/** District table (`Ma`): buildings per side, slot width in metres, floor count. */
export const DISTRICTS: Record<District, DistrictConfig> = {
  core: { perSide: 2, slot: 14.5, floors: 46 },
  midtown: { perSide: 3, slot: 9.6, floors: 19 },
  commerce: { perSide: 3, slot: 9.6, floors: 10 },
  residential: { perSide: 2, slot: 13, floors: 5 },
  outskirts: { perSide: 2, slot: 13, floors: 2 }
};

export function districtOf(i: number, j: number): District {
  return i >= -1 && i <= 0 && j >= -3 && j <= 0
    ? "core"
    : Math.abs(i) > 6 || Math.abs(j) > 6
      ? "outskirts"
      : i >= 3
        ? "commerce"
        : i <= -3
          ? i <= -5
            ? "outskirts"
            : "residential"
          : Math.abs(j) >= 5
            ? "residential"
            : "midtown";
}

const EXTRA_PARKS = new Set(["2,-3", "3,-3", "2,-2", "3,-2", "-4,2", "-3,2"]);
const CIVIC = new Set(["0,0", "2,0", "-2,0", "0,2", "0,-2"]);
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Park-block rule (`ba`). */
export function isPark(i: number, j: number): boolean {
  return !CIVIC.has(`${i},${j}`) && (EXTRA_PARKS.has(`${i},${j}`) || (mod(i + 1, 3) === 0 && mod(j + 1, 3) === 0));
}

/** Blocks the port leaves as open plazas (spawn block, civic plazas, the original's `Un` rule). */
export function isPlaza(i: number, j: number): boolean {
  if ((i === -2 && j === -2) || (i === -4 && j === 0)) return true;
  if (isPark(i, j) || CIVIC.has(`${i},${j}`)) return false;
  return !(Math.max(Math.abs(i), Math.abs(j)) <= 1) && mod(7 * i + 13 * j, 11) === 0;
}

export interface Block {
  i: number;
  j: number;
  x: number;
  z: number;
  district: District;
  park: boolean;
  plaza: boolean;
}

export function buildBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let i = -7; i <= 7; i++) {
    for (let j = -7; j <= 7; j++) {
      blocks.push({ i, j, x: i * PITCH, z: j * PITCH, district: districtOf(i, j), park: isPark(i, j), plaza: isPlaza(i, j) });
    }
  }
  return blocks;
}

export interface Building {
  x: number;
  z: number;
  hw: number;
  hd: number;
  height: number;
  /** 0..5 palette index. */
  tone: number;
}

/** Half depth ceiling: SETBACK + depth must stay inside the 21.5 m block half size so the street stays clear. */
const BUILDING_DEPTH = 4.2;

/** One box per slot on each of a block's four sides, from the district table. */
export function buildBuildings(blocks: readonly Block[]): Building[] {
  const out: Building[] = [];
  let n = 0;
  for (const b of blocks) {
    if (b.park || b.plaza) continue;
    const cfg = DISTRICTS[b.district];
    const gap = cfg.slot + 1.4;
    const offsets: number[] = [];
    const mid = (cfg.perSide - 1) / 2;
    for (let k = 0; k < cfg.perSide; k++) offsets.push((k - mid) * gap);
    for (let side = 0; side < 4; side++) {
      for (const off of offsets) {
        const r = noise(n * 1.37 + 0.11);
        n++;
        const floors = Math.max(1, Math.round(cfg.floors * (0.55 + 0.7 * r)));
        const height = floors * 3.1;
        const hw = (cfg.slot / 2) * (0.84 + 0.14 * noise(n * 2.9));
        const hd = BUILDING_DEPTH * (0.75 + 0.25 * noise(n * 4.3));
        const alongX = side === 0 || side === 2;
        const dir = side === 0 || side === 3 ? -1 : 1;
        const cx = alongX ? b.x + off : b.x + dir * SETBACK;
        const cz = alongX ? b.z + dir * SETBACK : b.z + off;
        out.push({ x: cx, z: cz, hw: alongX ? hw : hd, hd: alongX ? hd : hw, height, tone: Math.floor(noise(n * 7.7) * 6) });
      }
    }
  }
  return out;
}

export function buildingSolids(buildings: readonly Building[]): Solid[] {
  return buildings.map((b) => ({ x: b.x, z: b.z, hw: b.hw, hd: b.hd, kind: "hard" as const }));
}

export type PickupKind = "coin" | "star" | "heart";

export interface Pickup {
  kind: PickupKind;
  x: number;
  z: number;
  taken: boolean;
  spin: number;
  scale: number;
  y: number;
}

/** The original's pickup generator: 150 coins on streets, 14 stars and 10 hearts on block edges. */
export function buildPickups(): Pickup[] {
  const blocks: { x: number; z: number }[] = [];
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) blocks.push({ x: i * PITCH, z: j * PITCH });
  const kinds: { kind: PickupKind; n: number; scale: number }[] = [
    { kind: "coin", n: 150, scale: 0.62 },
    { kind: "star", n: 14, scale: 0.85 },
    { kind: "heart", n: 10, scale: 0.8 }
  ];
  const out: Pickup[] = [];
  let counter = 0;
  for (const k of kinds) {
    for (let d = 0; d < k.n; d++) {
      counter++;
      let x: number;
      let z: number;
      if (k.kind === "coin") {
        const street = Math.floor(noise(3.1 * counter) * STREET_LINES.length);
        const along = noise(5.9 * counter) * EXTENT * 2 - 450;
        if (noise(7.3 * counter) > 0.5) {
          x = STREET_LINES[street] as number;
          z = along;
        } else {
          x = along;
          z = STREET_LINES[street] as number;
        }
      } else {
        const block = blocks[Math.floor(noise(9.1 * counter) * blocks.length)] as { x: number; z: number };
        x = block.x + 8 * (noise(11.7 * counter) - 0.5);
        z = block.z + BLOCK_HALF + STREET_HALF * (noise(13.1 * counter) > 0.5 ? 1 : -1);
      }
      out.push({ kind: k.kind, x, z, taken: false, spin: 6.28 * noise(17.3 * counter), scale: k.scale, y: 0.95 });
    }
  }
  return out;
}

export interface TrafficCar {
  /** Position along the street, wrapped to [-444, 444] (horizontal) or [-444, 434]. */
  along: number;
  fixed: number;
  horiz: boolean;
  dir: 1 | -1;
  /** Cruising speed, m/s (seeded, 7 to 13). */
  speed: number;
  /** Speed this step, m/s: the cruise speed, or less behind a slower car or at a crossing (`stepTraffic`). */
  v: number;
  /** Why the car is held this step: behind a car (`follow`), no room past the box (`room`), crossing traffic (`yield`). */
  wait: "follow" | "room" | "yield" | null;
  hw: number;
  hd: number;
  x: number;
  z: number;
  yaw: number;
  hit: number;
}

/** 84 cars on the streets, seeded like the original (12 kinds x 7). */
export function buildTraffic(): TrafficCar[] {
  const cars: TrafficCar[] = [];
  for (let n = 0; n < 84; n++) {
    const horiz = noise(3.3 * n) > 0.5;
    const line = STREET_LINES[Math.floor(noise(5.7 * n) * STREET_LINES.length)] as number;
    const wish = noise(7.1 * n) > 0.5 ? 1 : -1;
    const dir = (Math.abs(line) > 449 ? -Math.sign(line) : wish) as 1 | -1;
    // keep right: for travel along +x the driver's right is +z, for travel along +z it is -x (`trafficLaneOffset`)
    const fixed = line + trafficLaneOffset(horiz, dir);
    const along = noise(11.3 * n) * EXTENT * 2 - 450;
    const speed = 7 + 6 * noise(13.7 * n);
    const car: TrafficCar = {
      along,
      fixed,
      horiz,
      dir,
      speed,
      v: speed,
      wait: null,
      hw: 1,
      hd: 2.2,
      x: 0,
      z: 0,
      yaw: horiz ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI,
      hit: 0
    };
    placeTraffic(car);
    cars.push(car);
  }
  return cars;
}

function placeTraffic(car: TrafficCar): void {
  if (car.horiz) {
    car.x = car.along;
    car.z = car.fixed;
  } else {
    car.x = car.fixed;
    car.z = car.along;
  }
}

/**
 * Lane offset from the street centre line for a car moving `dir` along x (`horiz`) or along z. Traffic keeps right on
 * both orientations: moving +x the driver's right is +z; moving +z it is -x.
 */
export function trafficLaneOffset(horiz: boolean, dir: 1 | -1): number {
  return (horiz ? 4.2 : -4.2) * dir;
}

/** Centre-to-centre distance kept to the car ahead in the same lane, metres (car length is 4.4). */
export const FOLLOW_GAP = 6;
/** Half size of an intersection box, metres (the asphalt is 17 m wide). */
const BOX_HALF = WORLD.streetHalf;
/** How far before the box a car looks for crossing traffic, metres. */
const YIELD_LOOK = 7;
/** Extra seconds an east-west car leaves between itself and a north-south car that has the right of way. */
const CROSS_MARGIN = 0.8;
/** Tolerance for "stopped on the box edge", metres. */
const EDGE_EPS = 1e-3;

const laneSpan = (car: TrafficCar): { lo: number; hi: number } => ({ lo: -444, hi: car.horiz ? 444 : 434 });

/** Distance from `car` forward to `ahead` along their shared lane, wrapping at the city edge. */
function gapAhead(car: TrafficCar, ahead: TrafficCar): number {
  const { lo, hi } = laneSpan(car);
  const length = hi - lo;
  const d = (ahead.along - car.along) * car.dir;
  return ((d % length) + length) % length;
}

const laneCache = new WeakMap<readonly TrafficCar[], Map<string, TrafficCar[]>>();
function lanesOf(cars: readonly TrafficCar[]): Map<string, TrafficCar[]> {
  let lanes = laneCache.get(cars);
  if (!lanes) {
    lanes = new Map();
    for (const car of cars) {
      const key = `${car.horiz ? "h" : "v"}:${car.fixed}`;
      const list = lanes.get(key) ?? [];
      list.push(car);
      lanes.set(key, list);
    }
    laneCache.set(cars, lanes);
  }
  return lanes;
}

/** Signed distance from the car's front bumper to the near edge of the next intersection box (negative once inside). */
function toNextBox(car: TrafficCar): { line: number; distance: number } {
  let best = { line: 0, distance: Number.POSITIVE_INFINITY };
  for (const line of STREET_LINES) {
    const rel = (line - car.along) * car.dir; // distance to the box centre ahead
    if (rel < -BOX_HALF - car.hd) continue; // already through this one
    const distance = rel - BOX_HALF - car.hd;
    if (distance < best.distance) best = { line, distance };
  }
  return best;
}

/** True while some part of the car is inside the box centred on `line` along its street. */
const insideBox = (car: TrafficCar, line: number): boolean => Math.abs(car.along - line) < BOX_HALF + car.hd - 1e-3;

/**
 * Advance traffic (`_a` loop): each car moves along its street at its cruise speed, wraps at the city edge, keeps
 * `FOLLOW_GAP` metres behind the car ahead in its lane, and yields at a crossing. The rule is deterministic (fixed car
 * order, no randomness): cars on north-south streets (`horiz` false) have the right of way and wait only for a car
 * already in the box; cars on east-west streets also wait while a north-south car is about to enter.
 */
export function stepTraffic(cars: readonly TrafficCar[], dt: number): void {
  const lanes = lanesOf(cars);
  const wanted = new Float64Array(cars.length);
  cars.forEach((car, i) => {
    let v = car.speed;
    let wait: TrafficCar["wait"] = null;
    // follow: never close the gap below FOLLOW_GAP
    const lane = lanes.get(`${car.horiz ? "h" : "v"}:${car.fixed}`) ?? [];
    let gap = Number.POSITIVE_INFINITY;
    for (const other of lane) if (other !== car) gap = Math.min(gap, gapAhead(car, other));
    if (gap < Number.POSITIVE_INFINITY && (gap - FOLLOW_GAP) / dt < v) {
      v = Math.max(0, (gap - FOLLOW_GAP) / dt);
      wait = "follow";
    }
    // yield at the next crossing
    const box = toNextBox(car);
    // a car stopped on the edge reads a distance of about -1e-14: it has not entered yet
    if (box.distance >= -EDGE_EPS && box.distance < YIELD_LOOK + v * dt) {
      const crossLine = car.fixed - trafficLaneOffset(car.horiz, car.dir);
      // never enter a box without room to clear it (a car stopped inside would block the crossing street)
      const room = gap >= box.distance + 2 * BOX_HALF + 2 * car.hd + FOLLOW_GAP;
      let blocked = !room;
      for (const other of cars) {
        if (blocked) break;
        if (other.horiz === car.horiz) continue;
        const otherLine = other.fixed - trafficLaneOffset(other.horiz, other.dir);
        if (Math.abs(otherLine - box.line) > 1e-6) continue; // not on the crossing street
        if (insideBox(other, crossLine)) { blocked = true; break; }
        if (car.horiz) {
          // wait while a moving north-south car would reach the box before this car is through it (a stopped one waits
          // for this car: it re-checks the box before it enters)
          const ahead = toNextBox(other);
          const through = (box.distance + 2 * BOX_HALF + 2 * car.hd) / Math.max(1, car.speed) + CROSS_MARGIN;
          if (Math.abs(ahead.line - crossLine) < 1e-6 && ahead.distance >= -EDGE_EPS && other.v > 0.05 && ahead.distance / other.v < through) { blocked = true; break; }
        }
      }
      if (blocked && Math.max(0, box.distance) / dt < v) {
        v = Math.max(0, box.distance) / dt;
        wait = room ? "yield" : "room";
      }
    }
    wanted[i] = v;
    car.wait = wait;
  });
  cars.forEach((car, i) => {
    car.v = wanted[i]!;
    const before = car.along;
    car.along += car.dir * car.v * dt;
    const { lo, hi } = laneSpan(car);
    const wrapped = car.along > hi || car.along < lo;
    if (car.along > hi) car.along = lo;
    if (car.along < lo) car.along = hi;
    placeTraffic(car);
    // re-entering at the far edge: wait at the edge while that spot is taken (the edge streets cross there)
    if (wrapped && cars.some((other) => other !== car && footprintsOverlap(car, other))) {
      car.along = before;
      car.v = 0;
      car.wait = "room";
      placeTraffic(car);
    }
    if (car.hit > 0) car.hit -= dt;
  });
}

function footprintsOverlap(a: TrafficCar, b: TrafficCar): boolean {
  const ax = a.horiz ? a.hd : a.hw;
  const az = a.horiz ? a.hw : a.hd;
  const bx = b.horiz ? b.hd : b.hw;
  const bz = b.horiz ? b.hw : b.hd;
  return Math.abs(a.x - b.x) < ax + bx && Math.abs(a.z - b.z) < az + bz;
}

/** Overlapping traffic pairs (box test on the cars' footprints), for tests and the QA surface. */
export function trafficOverlaps(cars: readonly TrafficCar[]): number {
  let n = 0;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) if (footprintsOverlap(cars[i]!, cars[j]!)) n++;
  return n;
}

/**
 * Pushes pickups out of building footprints so none is drawn inside a wall: any pickup closer than `margin` metres to a
 * solid's edge moves straight out along the shallower axis until it is `margin` metres clear.
 */
export function clearPickups(pickups: Pickup[], solids: readonly Solid[], margin = 1.5): number {
  let moved = 0;
  for (const p of pickups) {
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (const s of solids) {
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        const w = s.hw + margin;
        const d = s.hd + margin;
        if (Math.abs(dx) >= w || Math.abs(dz) >= d) continue;
        if (w - Math.abs(dx) < d - Math.abs(dz)) p.x = s.x + (dx < 0 ? -w : w);
        else p.z = s.z + (dz < 0 ? -d : d);
        hit = true;
      }
      if (!hit) break;
      if (pass === 0) moved++;
    }
  }
  return moved;
}

export interface PickupEvent {
  kind: PickupKind;
  index: number;
  score: number;
}

export interface PickupState {
  collected: number;
  score: number;
  combo: number;
  comboTimer: number;
  boost: number;
}

/** The loop's pickup rule: within sqrt(13) m, combo up to x20, star refills the tank, heart adds 0.45. */
export function collectPickups(pickups: Pickup[], car: { x: number; z: number }, state: PickupState): PickupEvent[] {
  const events: PickupEvent[] = [];
  pickups.forEach((p, index) => {
    if (p.taken) return;
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    if (dx * dx + dz * dz >= 13) return;
    p.taken = true;
    state.collected++;
    state.combo = Math.min(20, state.combo + 1);
    state.comboTimer = 4.2;
    const base = p.kind === "coin" ? 10 : p.kind === "star" ? 120 : 60;
    const score = base * Math.max(1, state.combo);
    state.score += score;
    if (p.kind === "star") state.boost = 1;
    if (p.kind === "heart") state.boost = Math.min(1, state.boost + 0.45);
    events.push({ kind: p.kind, index, score });
  });
  return events;
}

/** Combo timer (loop): drops the streak when it runs out. */
export function tickCombo(state: PickupState, dt: number): void {
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }
}

/** The original's traffic-collision response against the player (`_a` loop). Returns true on a fresh hit. */
export function trafficContact(
  cars: readonly TrafficCar[],
  car: { x: number; z: number; vx: number; vz: number; shake: number; combo: number }
): boolean {
  let fresh = false;
  for (const t of cars) {
    const dx = car.x - t.x;
    const dz = car.z - t.z;
    const w = t.hw + 1.5;
    const d = t.hd + 1.5;
    if (!(dx > -w && dx < w && dz > -d && dz < d)) continue;
    const ox = w - Math.abs(dx);
    const oz = d - Math.abs(dz);
    const first = !(t.hit > 0);
    const tvx = t.horiz ? t.dir * t.v : 0;
    const tvz = t.horiz ? 0 : t.dir * t.v;
    if (ox < oz) {
      const s = dx < 0 ? -1 : 1;
      car.x += s * ox * 0.6;
      const rel = (car.vx - tvx) * s;
      if (rel < 0) car.vx -= rel * s * 1.5;
      car.vx += 2.4 * s;
      car.vz *= 0.92;
    } else {
      const s = dz < 0 ? -1 : 1;
      car.z += s * oz * 0.6;
      const rel = (car.vz - tvz) * s;
      if (rel < 0) car.vz -= rel * s * 1.5;
      car.vz += 2.4 * s;
      car.vx *= 0.92;
    }
    t.hit = 0.8;
    car.shake = Math.min(1, car.shake + 0.22);
    car.combo = 0;
    if (first) fresh = true;
  }
  return fresh;
}
