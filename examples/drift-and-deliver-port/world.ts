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
  speed: number;
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
    const fixed = line + 4.2 * dir;
    const along = noise(11.3 * n) * EXTENT * 2 - 450;
    const speed = 7 + 6 * noise(13.7 * n);
    const car: TrafficCar = {
      along,
      fixed,
      horiz,
      dir,
      speed,
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

/** Advance traffic (`_a` loop): move along the street, wrap at the city edge. */
export function stepTraffic(cars: readonly TrafficCar[], dt: number): void {
  for (const car of cars) {
    car.along += car.dir * car.speed * dt;
    const hi = car.horiz ? 444 : 434;
    const lo = -444;
    if (car.along > hi) car.along = lo;
    if (car.along < lo) car.along = hi;
    placeTraffic(car);
    if (car.hit > 0) car.hit -= dt;
  }
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
    const tvx = t.horiz ? t.dir * t.speed : 0;
    const tvz = t.horiz ? 0 : t.dir * t.speed;
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
