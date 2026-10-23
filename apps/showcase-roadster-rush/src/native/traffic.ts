import {
  ALL_VEHICLE_TYPES,
  CAR_TYPES,
  CAR_WEIGHTS,
  LANE_COUNT,
  PICKUP_VALUES,
  PLAYER_BOX,
  POWERUP_KINDS,
  POWERUP_WEIGHTS,
  SKY_PAINT_COUNT,
  SKY_SPEC,
  VEHICLE_SPECS,
  laneX,
  type PickupKind,
  type VehicleType
} from "./constants";
import { clamp, clamp01, lerp, smoothstep01, Vector3 } from "./math";
import { createRng, pickWeighted, type Rng } from "./rng";
import type { FreewayWorld } from "./world";
import type { Player } from "./player";

// Spacing, flow and spawn tuning.
const SUPPORT_TOLERANCE = 0.7;
const NEAR_MISS_VERTICAL = 1.2;
const NEAR_MISS_SKY_SIDE = 1.7;
const SHIFT_LOOKAHEAD = 56;
const MIN_GAP = 1.6;
const FLOW_MIN = 11;
const FLOW_MAX = 21;
const LANE_FACTORS = [1.18, 1.08, 0.98, 0.9, 0.82];
const FLOW_CAP_OF_PLAYER = 0.75;
const LANE_ACCEL = 3.5;
const LANE_DECEL = 8;
const VEHICLE_ACCEL = 6;
const VEHICLE_DECEL = 14;
const EARLY_DIFFICULTY_METRES = 150;
const FIRST_SKY_METRES = 8;
const SKY_SPAWN_AHEAD = 245;
const SKY_BAND_LOW = [3.3, 4.4] as const;
const SKY_BAND_MID = [8.3, 11.5] as const;
const SKY_BAND_HIGH = [13, 19.5] as const;
const CRUISER_ALTITUDE = 6.6;
const SKY_SPEED_MIN = 20;
const SKY_SPEED_MAX = 32;
const SKY_INCOMING_ETA = 2.5;
const BOLT_CAP = 420;
const HONK_COOLDOWN = 1.3;

export interface Changer {
  state: number;
  from: number;
  to: number;
  dir: number;
  t: number;
  trigT: number;
  blink: number;
  dur: number;
  cut: boolean;
  cutIn?: boolean;
}
export interface Braker {
  state: number;
  t: number;
  trigT: number;
  hold: number;
  depth: number;
}
export interface VehicleRec {
  id: string;
  type: VehicleType;
  variant: number;
  colorIdx: number;
  w: number;
  h: number;
  l: number;
  roof: number;
  ramp: { length: number; height: number } | null;
  active: boolean;
  gen: number;
  lane: number;
  flowLane: number;
  x: number;
  z: number;
  yaw: number;
  nearMiss: boolean;
  honked: boolean;
  scrapeCD: number;
  honkT: number;
  phase: number;
  changer: Changer | null;
  braker: Braker | null;
  spd: number;
  dv: number;
  occ2: number;
  honkPos: Vector3;
}
export interface SkyRec {
  id: string;
  paintIdx: number;
  w: number;
  h: number;
  l: number;
  active: boolean;
  gen: number;
  x: number;
  y: number;
  baseY: number;
  z: number;
  lane: number;
  dir: number;
  phase: number;
  rx: number;
  ry: number;
  rz: number;
  vz: number;
  mode: number;
  bx: number;
  amp: number;
  wf: number;
  wp: number;
  yHi: number;
  yLo: number;
  diveEnd: number;
  diveLen: number;
  low: boolean;
  nearMiss: boolean;
  hit: boolean;
  prevX?: number;
  prevY?: number;
  prevZ?: number;
}
export interface PickupRec {
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
  ox: number;
  oy: number;
  oz: number;
  anchor: VehicleRec | null;
  anchorGen: number;
  phase: number;
  magnet: boolean;
  flowLane: number;
}
export interface TrafficEvent {
  type: "crash" | "scrape" | "nearMiss" | "pickup";
  what?: string;
  kind?: PickupKind;
  value?: number;
  fromLane?: number;
  position: { x: number; y: number; z: number };
}
interface Formation {
  lead: SkyRec;
  gen: number;
  pattern: string;
  gapLane: number;
  band: number;
  id: number;
}
interface SkyOptions {
  weave?: number;
  wf?: number;
  wp?: number;
  swoop?: boolean;
  yLo?: number;
  diveEnd?: number;
  diveLen?: number;
}

/** Roof height of `v` over the span [z0,z1]: ramped carriers rise from the rear, other vehicles are flat. */
function surfaceHeight(v: VehicleRec, z0: number, _z1: number): number {
  if (!v.ramp) return v.roof;
  const onRamp = v.z + v.l / 2 - Math.max(z0, v.z - v.l / 2);
  return onRamp >= v.ramp.length ? v.roof : (v.ramp.height * Math.max(0, onRamp)) / v.ramp.length;
}

function effectiveDifficulty(requested: number, metres: number): number {
  let curve: number;
  if (metres <= EARLY_DIFFICULTY_METRES) curve = (0.06 * Math.max(0, metres)) / EARLY_DIFFICULTY_METRES;
  else if (metres <= 1500) {
    const k = (metres - EARLY_DIFFICULTY_METRES) / 1350;
    curve = 0.06 + 0.84 * (k * (2 - k));
  } else curve = 0.9 + 0.1 * Math.min(1, (metres - 1500) / 1500);
  return clamp01(Math.max(requested, curve));
}

/** Freeway traffic: lane-flow vehicles, lane changers and brakers, sky-lane roadsters, pickups, collisions and honks. */
export class Traffic {
  onEvent: (name: string, payload?: unknown) => void = () => {};
  world: FreewayWorld | null = null;
  readonly vehicles: VehicleRec[] = [];
  readonly skyCars: SkyRec[] = [];
  readonly pickups: PickupRec[] = [];
  readonly laneFree = new Float64Array(5);
  readonly _laneSpeed = new Float64Array(5);
  readonly _laneBrake = new Float64Array(5);
  readonly counters: Record<string, number> = { skyFormations: 0, skyOncoming: 0, changers: 0, cutIns: 0, brakers: 0, changeAborts: 0, changeNoGap: 0, armed: 0, changeLate: 0 };
  activePreset: string | null = null;
  seed = 42;
  time = 0;
  difficulty = 0;

  private rng!: Rng;
  private skyRng!: Rng;
  private fxRng!: Rng;
  private waveRng!: Rng;
  private hazRng!: Rng;
  private vpool = new Map<VehicleType, VehicleRec[]>();
  private spool: SkyRec[][] = Array.from({ length: SKY_PAINT_COUNT }, () => []);
  private pickupRecPool: PickupRec[] = [];
  private laneOff = new Float64Array(5);
  private laneFactor = new Float64Array(5);
  private laneCruise = new Float64Array(5);
  private waveT = new Float64Array(5);
  private wavePhase = new Uint8Array(5);
  private waveDepth = new Float64Array(5);
  private reserved = new Uint8Array(5);
  private rowCars: VehicleRec[] = [];
  private laneLists: VehicleRec[][] = Array.from({ length: LANE_COUNT }, () => []);
  private forms: Formation[] = [];
  private formSerial = 0;
  private playerSpeed = 26;
  private player: Player | null = null;
  private events: TrafficEvent[] = [];
  private evPos: Vector3[] = Array.from({ length: 48 }, () => new Vector3());
  private evPosIdx = 0;
  private recSerial = 0;
  private pz = 0;
  private lastDt = 0.016;
  private corridor = 2;
  private pendingShift = -1;
  private pendingWait = 0;
  private rowsToShift = 3;
  private rowsSinceCObs = 0;
  private rowCursor = 0;
  private nextSkyDist = 0;
  private nextSkyPickDist = 0;
  private nextCruiserDist = 0;
  private nextPowerDist = 0;
  private honkCD = 0;
  private pickupSeq = 0;
  private hazCands: VehicleRec[] = [];

  constructor() {
    for (const type of ALL_VEHICLE_TYPES) this.vpool.set(type, []);
    this.reset(42);
  }

  reset(seed = 42): void {
    this.clearAll();
    this.seedAll(seed);
    this.resetCursors(0, 2);
    this.activePreset = null;
    const rng = this.rng;
    for (let lane = 0; lane < 5; lane++) {
      let cursor = lane === 2 ? 15 : 14 + rng.range(0, 6);
      const count = lane === 2 ? 1 : rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const type = this.pickCar(rng);
        const len = VEHICLE_SPECS[type].l;
        if (cursor - len < PLAYER_BOX.l / 2 + 2.5) break;
        const rec = this._placeVehicle(type, lane, cursor);
        if (!rec) break;
        if (rec.z - rec.l / 2 < PLAYER_BOX.l / 2 + 2) {
          this._recycleVehicleAt(this.vehicles.length - 1);
          break;
        }
        cursor = rec.z - rec.l / 2 - rng.range(1.8, 3);
        if (lane === 2) break;
      }
    }
  }

  update(dt: number, player: Player | null, difficulty = 0): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.lastDt = dt;
    const pz = player && player.position ? player.position.z : this.pz;
    this.pz = pz;
    const metres = -pz;
    const d = effectiveDifficulty(clamp01(difficulty), metres);
    this.difficulty = d;
    this.time += dt;
    const speed = player && player.alive !== false && +player.speed > 0 ? +player.speed : this.playerSpeed;
    this.playerSpeed = Math.max(speed, 18);
    this.player = player || null;
    this.updateFlow(dt, d);
    this.moveVehicles(dt, pz);
    let guard = 0;
    while (this.rowCursor > pz - 280 && guard++ < 64) this.spawnRow(d);
    this.updateSkySpawns(d, pz, metres);
    this.moveSky(dt, d, pz);
    this.updatePickups(dt, player, pz);
    this.honkCheck(dt, player);
  }

  /** Highest drivable surface under the player's footprint at (x,z) that is reachable from height y. */
  supportHeight(x: number, z: number, y: number): number {
    const half = PLAYER_BOX.l / 2;
    const z0 = z - half;
    const z1 = z + half;
    const reach = y + SUPPORT_TOLERANCE;
    let best = 0;
    for (const v of this.vehicles) {
      if (Math.abs(v.x - x) > v.w / 2 + 0.35 || v.z - v.l / 2 >= z1 || v.z + v.l / 2 <= z0) continue;
      const h = surfaceHeight(v, z0, z1);
      if (h <= reach && h > best) best = h;
    }
    return best;
  }

  checkCollisions(player: Player | null): TrafficEvent[] {
    const out = this.events;
    out.length = 0;
    if (!player || player.alive === false) return out;
    const b = player.bounds();
    const invulnerable = !!player.invulnerable;
    const lane = player.lane == null ? 2 : player.lane;
    const targetLane = player.targetLane == null ? lane : player.targetLane;
    const px = player.position ? player.position.x : (b.minX + b.maxX) / 2;
    const changing = lane !== targetLane || Math.abs(px - laneX(targetLane)) > 0.35;
    const steerDir = Math.sign(laneX(targetLane) - px) || 0;
    for (const v of this.vehicles) {
      const zFront = v.z - v.l / 2;
      const zBack = v.z + v.l / 2;
      if (zFront > b.maxZ + 1.5 || zBack < b.minZ - 1.5) continue;
      const xLeft = v.x - v.w / 2;
      const xRight = v.x + v.w / 2;
      const overlapX = b.minX < xRight && b.maxX > xLeft;
      if (!(b.minZ < zBack && b.maxZ > zFront)) continue;
      const top = surfaceHeight(v, b.minZ, b.maxZ);
      if (overlapX && b.minY < top - SUPPORT_TOLERANCE) {
        if (v.scrapeCD > 0) continue;
        const sideOverlap = Math.min(b.maxX - xLeft, xRight - b.minX);
        const depthOverlap = Math.min(b.maxZ - zFront, zBack - b.minZ);
        v.nearMiss = true;
        if ((changing && sideOverlap < depthOverlap) || (sideOverlap < 0.6 && depthOverlap > 1.2)) {
          let from = lane;
          if (changing && (lane === v.lane || lane === targetLane)) from = player.prevLane != null && player.prevLane !== v.lane ? player.prevLane : clamp(v.lane - steerDir, 0, 4);
          if (from === v.lane) from = clamp(v.lane - (steerDir || 1), 0, 4);
          v.scrapeCD = 0.6;
          out.push({ type: "scrape", fromLane: from, what: v.type, position: this.evPoint(px, b.minY + 0.5, b.minZ) });
        } else if (!invulnerable) {
          out.push({ type: "crash", what: v.type, position: this.evPoint(px, b.minY + 0.5, b.minZ) });
          return out;
        }
        continue;
      }
      if (v.nearMiss) continue;
      const gapX = Math.max(xLeft - b.maxX, b.minX - xRight);
      const gapY = b.minY - top;
      if (gapX > 0 && gapX < NEAR_MISS_VERTICAL && b.minY < top) {
        v.nearMiss = true;
        out.push({ type: "nearMiss", what: v.type, position: this.evPoint(v.x, top * 0.6, v.z) });
      } else if (overlapX && gapY > 0.05 && gapY < NEAR_MISS_VERTICAL && v.h >= 2.6 && !player.grounded) {
        v.nearMiss = true;
        out.push({ type: "nearMiss", what: v.type, position: this.evPoint(v.x, top, v.z) });
      }
    }
    const onRoad = !!player.grounded && (player.supportY || 0) < 0.5;
    const sweep = (this.playerSpeed || 30) * (this.lastDt || 0.016) * 0.65;
    for (const s of this.skyCars) {
      if (onRoad) break;
      if (s.nearMiss && s.hit) continue;
      const halfLen = s.l / 2;
      const prevZ = s.prevZ == null ? s.z : s.prevZ;
      const zLo = Math.min(s.z, prevZ) - halfLen - 0.35;
      const zHi = Math.max(s.z, prevZ) + halfLen + 0.35 + sweep;
      if (zLo > b.maxZ + 1 || zHi < b.minZ - 1) continue;
      const halfW = s.w / 2;
      const prevX = s.prevX == null ? s.x : s.prevX;
      const prevY = s.prevY == null ? s.y : s.prevY;
      const xLo = Math.min(s.x, prevX) - halfW * 1.08;
      const xHi = Math.max(s.x, prevX) + halfW * 1.08;
      const yLo = Math.min(s.y, prevY) - 0.85;
      const yHi = Math.max(s.y, prevY) + s.h + 1.15;
      const overlapX = b.minX < xHi && b.maxX > xLo;
      const overlapY = b.minY < yHi && b.maxY > yLo;
      if (!(b.minZ < zHi && b.maxZ > zLo)) continue;
      if (overlapX && overlapY) {
        s.nearMiss = true;
        if (!invulnerable && !s.hit) {
          s.hit = true;
          out.push({ type: "crash", what: "skyRoadster", position: this.evPoint(s.x, s.y + 0.5, s.z) });
          return out;
        }
        continue;
      }
      if (s.nearMiss) continue;
      const gapX = Math.max(s.x - halfW - b.maxX, b.minX - (s.x + halfW));
      const gapY = Math.max(s.y - b.maxY, b.minY - (s.y + s.h));
      if ((overlapY && gapX > 0 && gapX < NEAR_MISS_SKY_SIDE) || (overlapX && gapY > 0 && gapY < NEAR_MISS_VERTICAL)) {
        s.nearMiss = true;
        out.push({ type: "nearMiss", what: "skyRoadster", position: this.evPoint(s.x, s.y + 0.5, s.z) });
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      const r = p.kind === "bolt" ? 0.85 : 1.05;
      if (p.z < b.minZ - r || p.z > b.maxZ + r || p.x < b.minX - r || p.x > b.maxX + r || p.y < b.minY - r || p.y > b.maxY + r) continue;
      out.push({ type: "pickup", kind: p.kind, value: PICKUP_VALUES[p.kind], position: this.evPoint(p.x, p.y, p.z) });
      this._recyclePickupAt(i);
    }
    return out;
  }

  stats(): { vehicles: number; skyCars: number; pickups: number } {
    return { vehicles: this.vehicles.length, skyCars: this.skyCars.length, pickups: this.pickups.length };
  }

  // ---- seeding -------------------------------------------------------------------------------------------------

  private seedAll(seed: number): void {
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.skyRng = createRng((this.seed * 7 + 3) >>> 0);
    this.fxRng = createRng((this.seed ^ 2654435769) >>> 0);
    this.waveRng = createRng((this.seed * 13 + 101) >>> 0);
    this.hazRng = createRng((this.seed * 31 + 7) >>> 0);
    for (let lane = 0; lane < 5; lane++) {
      this.laneOff[lane] = this.rng.range(-0.3, 0.3);
      this.laneFactor[lane] = LANE_FACTORS[lane]! + this.rng.range(-0.04, 0.04);
    }
  }

  private resetCursors(pz: number, corridor: number): void {
    this.time = 0;
    this.difficulty = 0;
    this.pz = pz;
    this.laneFree.fill(Infinity);
    this._laneBrake.fill(1);
    for (let lane = 0; lane < 5; lane++) {
      const cruise = FLOW_MIN * this.laneFactor[lane]!;
      this.laneCruise[lane] = cruise;
      this._laneSpeed[lane] = cruise;
      this.wavePhase[lane] = 0;
      this.waveDepth[lane] = 1;
      this.waveT[lane] = 2.5 + lane * 1.3 + this.waveRng.range(0, 3);
    }
    this.forms.length = 0;
    for (const key of Object.keys(this.counters)) this.counters[key] = 0;
    this.corridor = corridor;
    this.pendingShift = -1;
    this.pendingWait = 0;
    this.rowsToShift = 3;
    this.rowsSinceCObs = 0;
    this.rowCursor = pz - 38;
    this.nextSkyDist = -pz + FIRST_SKY_METRES;
    this.nextSkyPickDist = -pz + 160;
    this.nextCruiserDist = -pz + 380;
    this.nextPowerDist = -pz + 330 + this.rng.range(0, 90);
    this.honkCD = 0;
    this.pickupSeq = 0;
  }

  private clearAll(): void {
    while (this.vehicles.length) this._recycleVehicleAt(this.vehicles.length - 1);
    while (this.skyCars.length) this._recycleSkyAt(this.skyCars.length - 1);
    while (this.pickups.length) this._recyclePickupAt(this.pickups.length - 1);
  }

  // ---- records -------------------------------------------------------------------------------------------------

  private newVehicleRec(type: VehicleType, variant: number): VehicleRec {
    const spec = VEHICLE_SPECS[type];
    const ramp = type === "carrier" && spec.ramp ? { length: clamp(+spec.ramp.length || spec.l * 0.35, 2, spec.l * 0.7), height: +spec.ramp.height || spec.h } : null;
    const serial = this.recSerial++;
    return {
      id: `${type}:${serial}`,
      type,
      variant,
      colorIdx: (variant + serial * 5) % 14,
      w: spec.w,
      h: spec.h,
      l: spec.l,
      roof: ramp ? ramp.height : spec.h,
      ramp,
      active: false,
      gen: 0,
      lane: 0,
      flowLane: 0,
      x: 0,
      z: 0,
      yaw: 0,
      nearMiss: false,
      honked: false,
      scrapeCD: 0,
      honkT: 0,
      phase: 0,
      changer: null,
      braker: null,
      spd: 0,
      dv: 0,
      occ2: -1,
      honkPos: new Vector3()
    };
  }

  private newSkyRec(paintIdx: number): SkyRec {
    return {
      id: `sky:${this.recSerial++}`,
      paintIdx,
      w: SKY_SPEC.w,
      h: SKY_SPEC.h,
      l: SKY_SPEC.l,
      active: false,
      gen: 0,
      x: 0,
      y: 0,
      baseY: 0,
      z: 0,
      lane: 0,
      dir: 1,
      phase: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      vz: 0,
      mode: 0,
      bx: 0,
      amp: 0,
      wf: 0,
      wp: 0,
      yHi: 0,
      yLo: 0,
      diveEnd: 0,
      diveLen: 1,
      low: false,
      nearMiss: false,
      hit: false
    };
  }

  private acquireVehicle(type: VehicleType): VehicleRec {
    const pool = this.vpool.get(type) ?? [];
    this.vpool.set(type, pool);
    let rec: VehicleRec;
    if (pool.length) {
      const idx = Math.floor(this.fxRng.next() * pool.length);
      rec = pool[idx]!;
      pool[idx] = pool[pool.length - 1]!;
      pool.pop();
    } else rec = this.newVehicleRec(type, Math.floor(this.fxRng.next() * 8));
    rec.gen++;
    rec.active = true;
    rec.nearMiss = false;
    rec.honked = false;
    rec.scrapeCD = 0;
    rec.honkT = 0;
    rec.yaw = 0;
    rec.changer = null;
    rec.braker = null;
    rec.dv = 0;
    rec.occ2 = -1;
    rec.phase = this.fxRng.next() * 6.283;
    return rec;
  }

  private releaseVehicle(rec: VehicleRec): void {
    rec.active = false;
    rec.gen++;
    rec.changer = null;
    rec.braker = null;
    this.vpool.get(rec.type)!.push(rec);
  }

  _recycleVehicleAt(index: number): void {
    const list = this.vehicles;
    const rec = list[index]!;
    list[index] = list[list.length - 1]!;
    list.pop();
    this.releaseVehicle(rec);
  }

  _recycleSkyAt(index: number): void {
    const list = this.skyCars;
    const rec = list[index]!;
    list[index] = list[list.length - 1]!;
    list.pop();
    rec.active = false;
    this.spool[rec.paintIdx]!.push(rec);
  }

  _recyclePickupAt(index: number): void {
    const list = this.pickups;
    const rec = list[index]!;
    list[index] = list[list.length - 1]!;
    list.pop();
    rec.anchor = null;
    this.pickupRecPool.push(rec);
  }

  private pickCar(rng: Rng): VehicleType {
    return pickWeighted(rng, CAR_TYPES, CAR_WEIGHTS);
  }

  _placeVehicle(type: VehicleType, lane: number, front: number, gap = MIN_GAP): VehicleRec {
    const rec = this.acquireVehicle(type);
    rec.lane = rec.flowLane = lane;
    rec.x = laneX(lane);
    rec.z = front - rec.l / 2;
    rec.spd = this._laneSpeed[lane]!;
    this.vehicles.push(rec);
    const rear = front - rec.l;
    this.laneFree[lane] = Math.min(this.laneFree[lane]!, rear - gap);
    this.rowCars.push(rec);
    return rec;
  }

  _addPickup(kind: PickupKind, x: number, y: number, z: number, anchor: VehicleRec | null = null, flowLane = -1): PickupRec | null {
    if (kind === "bolt") {
      let bolts = 0;
      for (const p of this.pickups) if (p.kind === "bolt") bolts++;
      if (bolts >= BOLT_CAP) return null;
    }
    const rec: PickupRec = this.pickupRecPool.pop() || { kind: "bolt", x: 0, y: 0, z: 0, ox: 0, oy: 0, oz: 0, anchor: null, anchorGen: 0, phase: 0, magnet: false, flowLane: -1 };
    rec.kind = kind;
    rec.x = x;
    rec.y = y;
    rec.z = z;
    rec.oy = y;
    rec.magnet = false;
    rec.flowLane = anchor ? -1 : flowLane;
    rec.phase = ((this.pickupSeq++ * 0.55) % 6.283);
    if (anchor) {
      rec.anchor = anchor;
      rec.anchorGen = anchor.gen;
      rec.ox = x - anchor.x;
      rec.oz = z - anchor.z;
    } else rec.anchor = null;
    this.pickups.push(rec);
    return rec;
  }

  private boltLine(x: number, y: number, from: number, to: number, step = 3.2, anchor: VehicleRec | null = null, flowLane = -1): void {
    for (let z = from; z >= to; z -= step) this._addPickup("bolt", x, y, z, anchor, flowLane);
  }

  private boltArc(v: VehicleRec): void {
    const half = v.l / 2 + 4.5;
    for (let i = 0; i < 7; i++) {
      const dz = half - (2 * half * i) / 6;
      const k = dz / half;
      const y = 1 + (v.roof + 0.4) * (1 - k * k);
      this._addPickup("bolt", v.x, y, v.z + dz, v);
    }
  }

  _roofLine(v: VehicleRec): void {
    for (let dz = v.l / 2 - 1.2; dz >= -v.l / 2 + 1; dz -= 3.2) this._addPickup("bolt", v.x, v.roof + 1, v.z + dz, v);
  }

  _rampLine(v: VehicleRec): void {
    if (!v.ramp) {
      this._roofLine(v);
      return;
    }
    const rear = v.z + v.l / 2;
    const ramp = v.ramp;
    for (let d = 1; d < ramp.length; d += 2) this._addPickup("bolt", v.x, (ramp.height * d) / ramp.length + 1, rear - d, v);
    for (let d = ramp.length + 1.2; d < v.l - 0.8; d += 3.2) this._addPickup("bolt", v.x, v.roof + 1, rear - d, v);
  }

  private boltRing(x: number, y: number, z: number): void {
    const radius = 1.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this._addPickup("bolt", x + Math.cos(a) * radius, y + Math.sin(a) * radius, z);
    }
  }

  _spawnSky(paint: number, lane: number, altitude: number, z: number, dir: number, options: SkyOptions | null = null): SkyRec {
    const rec = this.spool[paint]!.pop() || this.newSkyRec(paint);
    rec.active = true;
    rec.gen++;
    rec.lane = lane;
    rec.bx = rec.x = laneX(lane);
    rec.baseY = rec.y = Math.min(altitude, 22.5);
    rec.z = z;
    rec.prevX = rec.x;
    rec.prevY = rec.y;
    rec.prevZ = rec.z;
    rec.dir = dir;
    rec.vz = 0;
    rec.mode = 0;
    rec.amp = 0;
    rec.wf = 0;
    rec.wp = 0;
    rec.yHi = rec.yLo = rec.baseY;
    rec.diveEnd = 0;
    rec.diveLen = 1;
    rec.phase = this.fxRng.next() * 6.283;
    rec.nearMiss = false;
    rec.hit = false;
    rec.rx = rec.rz = 0;
    rec.ry = dir > 0 ? Math.PI : 0;
    if (options) {
      if (options.weave) {
        rec.amp = options.weave;
        rec.wf = options.wf || 2;
        rec.wp = options.wp || 0;
        const lo = laneX(0) + rec.amp;
        const hi = laneX(4) - rec.amp;
        rec.bx = clamp(rec.bx, Math.min(lo, 0), Math.max(hi, 0));
        rec.x = rec.bx + rec.amp * Math.sin(rec.wp);
      }
      if (options.swoop) {
        rec.mode = 2;
        rec.yHi = rec.baseY;
        rec.yLo = options.yLo ?? rec.baseY;
        rec.diveEnd = options.diveEnd ?? 0;
        rec.diveLen = options.diveLen ?? 1;
      }
    }
    rec.low = rec.y < 6.2;
    if (dir > 0) this.counters.skyOncoming!++;
    this.skyCars.push(rec);
    return rec;
  }

  // ---- ground traffic ------------------------------------------------------------------------------------------

  private laneClear(lane: number, front: number, rear: number, ignore: VehicleRec | null = null): boolean {
    for (const v of this.vehicles) {
      if (v === ignore || v.lane !== lane) continue;
      const hi = v.z + v.l / 2 + MIN_GAP;
      const lo = v.z - v.l / 2 - MIN_GAP;
      if (rear < hi && front > lo) return false;
    }
    return true;
  }

  private spawnRow(difficulty: number): void {
    const rng = this.rng;
    const cursor = this.rowCursor;
    const metres = -cursor;
    const density = metres < 140 ? 0.55 : metres < 300 ? 0.8 : 1;
    const rowGap = lerp(24, 12.5, difficulty) + rng.range(0, 5);
    this.rowCars.length = 0;
    const corridorBefore = this.corridor;
    let corridor = corridorBefore;
    if (this.pendingShift < 0 && --this.rowsToShift <= 0) {
      const step = corridorBefore === 0 ? 1 : corridorBefore === 4 ? -1 : rng.chance(0.5) ? 1 : -1;
      this.pendingShift = corridorBefore + step;
      this.pendingWait = 0;
    }
    if (this.pendingShift >= 0) {
      const target = this.pendingShift;
      if (cursor + SHIFT_LOOKAHEAD <= this.laneFree[target]!) {
        corridor = target;
        this.pendingShift = -1;
        this.rowsToShift = rng.int(2, 5);
      } else if (++this.pendingWait > 6) {
        this.pendingShift = -1;
        this.rowsToShift = 1;
      }
    }
    this.corridor = corridor;
    const reserved = this.reserved;
    reserved.fill(0);
    reserved[corridorBefore] = 1;
    reserved[corridor] = 1;
    if (this.pendingShift >= 0) reserved[this.pendingShift] = 1;
    this.rowsSinceCObs++;
    let obstacle = false;
    if (corridor === corridorBefore && cursor <= this.laneFree[corridor]! && this.rowsSinceCObs >= 3 && metres > 140) {
      if (difficulty > 0.06 && rng.chance(0.07 + 0.1 * difficulty)) {
        const carrier = this._placeVehicle("carrier", corridor, cursor, 7);
        if (rng.chance(0.8)) this._rampLine(carrier);
        obstacle = true;
      } else if (difficulty > 0.15 && rng.chance(0.12 + 0.3 * difficulty)) {
        const options: VehicleType[] = ["sedan", "hatch", "taxi", "suv", "pickup"];
        const savedFree = this.laneFree[corridor]!;
        const car = this._placeVehicle(rng.pick(options), corridor, cursor - 4.5, 6.5);
        if (car.h > 2) {
          this._recycleVehicleAt(this.vehicles.length - 1);
          this.laneFree[corridor] = savedFree;
        } else {
          this.boltArc(car);
          obstacle = true;
        }
      }
      if (obstacle) this.rowsSinceCObs = 0;
    }
    if (!obstacle) {
      const lead = Math.min(cursor, this.laneFree[corridor]!) - 1.5;
      if (metres >= this.nextPowerDist) {
        this._addPickup(pickWeighted(rng, POWERUP_KINDS, POWERUP_WEIGHTS), laneX(corridor), 1.2, lead - 4, null, corridor);
        this.nextPowerDist = metres + rng.range(480, 820);
      } else if (rng.chance(0.45)) this.boltLine(laneX(corridor), 1, lead, cursor - rowGap + 3.5, 3.2, null, corridor);
      else if (rng.chance(0.07)) this._addPickup("air", laneX(corridor), 1.1, lead - 3, null, corridor);
    }
    const fill = lerp(0.5, 0.88, difficulty) * density;
    if (metres > 220 && rng.chance(lerp(0, 0.24, difficulty))) {
      const lane = rng.int(0, 3);
      if (!reserved[lane] && !reserved[lane + 1] && cursor <= this.laneFree[lane]! && cursor <= this.laneFree[lane + 1]!) {
        const front = cursor - rng.range(0, 1.5);
        for (const l of [lane, lane + 1]) {
          const type: VehicleType = rng.chance(0.6) ? "boxtruck" : "bus";
          this._placeVehicle(type, l, front - rng.range(0, 2));
          reserved[l] = 1;
        }
      }
    }
    for (let lane = 0; lane < 5; lane++) {
      if (reserved[lane] || cursor > this.laneFree[lane]! || !rng.chance(fill)) continue;
      const roll = rng.next();
      const convoyP = lerp(0.05, 0.14, difficulty) * +(metres > 200);
      const carrierP = 0.06;
      const truckP = 0.12;
      const front = cursor - rng.range(0, 2.5);
      if (roll < convoyP) this.spawnConvoy(lane, front, difficulty);
      else if (roll < convoyP + carrierP) {
        const carrier = this._placeVehicle("carrier", lane, front, 4);
        if (rng.chance(0.5)) this._rampLine(carrier);
      } else if (roll < convoyP + carrierP + truckP) {
        const truck = this._placeVehicle("boxtruck", lane, front);
        if (rng.chance(0.25)) this._roofLine(truck);
      } else if (roll < convoyP + carrierP + truckP + 0.05) this._placeVehicle("bus", lane, front);
      else {
        let count = 1 + +!!rng.chance(0.45 + 0.35 * difficulty) + +!!rng.chance(0.12 + 0.3 * difficulty);
        let at = front;
        while (count-- > 0) {
          const car = this._placeVehicle(this.pickCar(rng), lane, at);
          at = car.z - car.l / 2 - rng.range(1.7, 3.2);
          if (at < cursor - rowGap + 2) break;
        }
      }
    }
    if (metres > 190) {
      const haz = this.hazRng;
      const candidates = this.hazCands;
      candidates.length = 0;
      for (const car of this.rowCars) if (car.h <= 2 && (CAR_TYPES as readonly string[]).includes(car.type)) candidates.push(car);
      const changers = +!!haz.chance(lerp(0.3, 0.8, difficulty)) + +!!haz.chance(lerp(0.05, 0.4, difficulty));
      for (let i = 0; i < changers && candidates.length; i++) {
        const pickIdx = haz.int(0, candidates.length - 1);
        const car = candidates[pickIdx]!;
        candidates[pickIdx] = candidates[candidates.length - 1]!;
        candidates.pop();
        car.changer = {
          state: 0,
          from: car.lane,
          to: -1,
          dir: 0,
          t: 0,
          trigT: haz.range(2.3, 3.6),
          blink: haz.range(0.7, 1),
          dur: haz.range(1.05, 1.45),
          cut: haz.chance(lerp(0.5, 0.85, difficulty))
        };
        this.counters.armed!++;
      }
      if (candidates.length && haz.chance(lerp(0.1, 0.45, difficulty))) {
        const car = candidates[haz.int(0, candidates.length - 1)]!;
        car.braker = { state: 0, t: 0, trigT: haz.range(1.9, 2.8), hold: haz.range(0.7, 1.4), depth: haz.range(7, 12) };
      }
    }
    this.rowCursor = cursor - rowGap;
  }

  private spawnConvoy(lane: number, front: number, difficulty: number): void {
    const rng = this.rng;
    const count = rng.int(2, difficulty > 0.5 ? 4 : 3);
    const roofBolts = rng.chance(0.65);
    let at = front;
    let last: VehicleRec | null = null;
    for (let i = 0; i < count; i++) {
      const type: VehicleType = i === 0 ? (rng.chance(0.45) ? "carrier" : "boxtruck") : rng.chance(0.8) ? "boxtruck" : "bus";
      last = this._placeVehicle(type, lane, at);
      if (roofBolts) {
        if (last.ramp) this._rampLine(last);
        else this._roofLine(last);
      }
      at = last.z - last.l / 2 - rng.range(1.3, 2.2);
    }
    if (last) this.laneFree[lane] = Math.min(this.laneFree[lane]!, last.z - last.l / 2 - 3);
  }

  private updateFlow(dt: number, difficulty: number): void {
    const base = lerp(FLOW_MIN, FLOW_MAX, difficulty);
    const cap = Math.max(8, this.playerSpeed * FLOW_CAP_OF_PLAYER);
    const wave = this.waveRng;
    let total = 0;
    for (let lane = 0; lane < 5; lane++) {
      const cruise = Math.min(cap, base * this.laneFactor[lane]! + this.laneOff[lane]!);
      this.laneCruise[lane] = cruise;
      this.waveT[lane]! -= dt;
      if (this.waveT[lane]! <= 0) {
        if (this.wavePhase[lane] === 0) {
          this.wavePhase[lane] = 1;
          this.waveDepth[lane] = wave.range(lerp(0.4, 0.2, difficulty), lerp(0.6, 0.45, difficulty));
          this.waveT[lane] = wave.range(0.9, 2.2);
        } else {
          this.wavePhase[lane] = 0;
          this.waveDepth[lane] = 1;
          this.waveT[lane] = wave.range(lerp(8, 3.5, difficulty), lerp(14, 7.5, difficulty));
        }
      }
      const targetSpeed = cruise * this.waveDepth[lane]!;
      const current = this._laneSpeed[lane]!;
      let next = current;
      next = targetSpeed > next ? Math.min(targetSpeed, next + LANE_ACCEL * dt) : Math.max(targetSpeed, next - LANE_DECEL * dt);
      const braking = next < current - 1e-4 || next < cruise * 0.72 ? 1 : 0.05;
      this._laneBrake[lane]! += (braking - this._laneBrake[lane]!) * (1 - Math.exp(-10 * dt));
      this._laneSpeed[lane] = next;
      this.laneFree[lane]! -= next * dt;
      total += next;
    }
    this.rowCursor -= (total / 5) * dt;
  }

  private moveVehicles(dt: number, pz: number): void {
    const list = this.vehicles;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      if (v.changer && v.changer.state < 3) this.updateChanger(v, v.changer, dt, pz);
      if (v.braker && v.braker.state < 3) this.updateBraker(v, v.braker, dt, pz);
      let target = this._laneSpeed[v.flowLane]!;
      const ch = v.changer;
      if (ch && ch.state === 2) {
        const k = smoothstep01(Math.min(1, ch.t / ch.dur));
        target = lerp(this._laneSpeed[ch.from]!, this._laneSpeed[ch.to]!, k);
      }
      target = Math.max(0, target + v.dv);
      v.spd = target > v.spd ? Math.min(target, v.spd + VEHICLE_ACCEL * dt) : Math.max(target, v.spd - VEHICLE_DECEL * dt);
      v.z -= v.spd * dt;
      if (v.scrapeCD > 0) v.scrapeCD -= dt;
      if (v.honkT > 0) v.honkT -= dt;
      if (v.z - v.l / 2 > pz + 40) this._recycleVehicleAt(i);
    }
    this.enforceSpacing();
  }

  private enforceSpacing(): void {
    const lanes = this.laneLists;
    for (let l = 0; l < 5; l++) lanes[l]!.length = 0;
    for (const v of this.vehicles) {
      lanes[v.lane]!.push(v);
      v.occ2 = -1;
      const ch = v.changer;
      if (ch && ch.state === 2) {
        const other = ch.from === v.lane ? ch.to : ch.from;
        v.occ2 = other;
        lanes[other]!.push(v);
      }
    }
    const gap = MIN_GAP * 0.8;
    for (let pass = 0; pass < 2; pass++) {
      for (let l = 0; l < 5; l++) {
        const list = lanes[l]!;
        for (let i = 1; i < list.length; i++) {
          const item = list[i]!;
          let j = i - 1;
          while (j >= 0 && list[j]!.z > item.z) {
            list[j + 1] = list[j]!;
            j--;
          }
          list[j + 1] = item;
        }
        for (let i = 1; i < list.length; i++) {
          const ahead = list[i - 1]!;
          const behind = list[i]!;
          const minZ = ahead.z + ahead.l / 2 + gap + behind.l / 2;
          if (behind.z < minZ) {
            behind.z = minZ;
            if (behind.spd > ahead.spd) behind.spd = ahead.spd;
          }
        }
      }
    }
  }

  private aheadOf(v: VehicleRec, pz: number): number {
    return pz - PLAYER_BOX.l / 2 - (v.z + v.l / 2);
  }

  private gapFree(v: VehicleRec, lane: number, margin: number): boolean {
    const hi = v.z + v.l / 2 + margin;
    const lo = v.z - v.l / 2 - margin;
    for (const o of this.vehicles) {
      if (o === v) continue;
      let inLane = o.lane === lane || o.occ2 === lane;
      const ch = o.changer;
      if (!inLane && ch && (ch.state === 1 || ch.state === 2) && ch.to === lane) inLane = true;
      if (inLane && o.z - o.l / 2 < hi && o.z + o.l / 2 > lo) return false;
    }
    return true;
  }

  private playerInLaneBand(lane: number): boolean {
    const p = this.player;
    return !p || !p.position ? false : p.targetLane === lane || p.lane === lane || Math.abs(p.position.x - laneX(lane)) < 2.9;
  }

  private updateChanger(v: VehicleRec, ch: Changer, dt: number, pz: number): void {
    const speed = this.playerSpeed;
    if (ch.state === 0) {
      const ahead = this.aheadOf(v, pz);
      if (ahead < 0) {
        v.changer = null;
        return;
      }
      const eta = ahead / Math.max(1, speed - v.spd);
      if (eta > ch.trigT) return;
      if (eta < 1.6 || this.activePreset) {
        v.changer = null;
        this.counters.changeLate!++;
        return;
      }
      const p = this.player;
      const playerLane = p && p.lane != null ? p.lane : -9;
      const options = Math.abs(playerLane - v.lane) === 1 && ch.cut ? [playerLane - v.lane] : this.hazRng.chance(0.5) ? [1, -1] : [-1, 1];
      for (const dir of options) {
        const lane = v.lane + dir;
        if (lane < 0 || lane >= 5) continue;
        const speedDiff = Math.abs(this._laneSpeed[v.lane]! - this._laneSpeed[lane]!);
        if (this.gapFree(v, lane, 3.6 + speedDiff * (ch.blink + 0.4))) {
          ch.to = lane;
          ch.dir = dir;
          ch.state = 1;
          ch.t = 0;
          ch.cutIn = lane === playerLane;
          return;
        }
      }
      if (eta < 1.6) {
        v.changer = null;
        this.counters.changeNoGap!++;
      }
    } else if (ch.state === 1) {
      ch.t += dt;
      const speedDiff = Math.abs(this._laneSpeed[v.lane]! - this._laneSpeed[ch.to]!);
      const remaining = Math.max(0, ch.blink - ch.t);
      if (!this.gapFree(v, ch.to, 2.6 + speedDiff * (remaining + 0.3))) {
        this.cancelChange(v, ch);
        return;
      }
      if (ch.t < ch.blink) return;
      if (this.playerInLaneBand(ch.to) && this.aheadOf(v, pz) < Math.max(1, speed - Math.min(v.spd, this._laneSpeed[ch.to]!)) * 1.25 + 6) {
        this.cancelChange(v, ch);
        return;
      }
      ch.state = 2;
      ch.t = 0;
      v.flowLane = ch.to;
      this.counters.changers!++;
      if (ch.cutIn) this.counters.cutIns!++;
    } else if (ch.state === 2) {
      ch.t += dt;
      const k = smoothstep01(Math.min(1, ch.t / ch.dur));
      v.x = lerp(laneX(ch.from), laneX(ch.to), k);
      v.yaw = -ch.dir * 0.12 * Math.sin(Math.PI * k);
      if (k > 0.5) v.lane = ch.to;
      if (ch.t >= ch.dur) {
        ch.state = 3;
        v.yaw = 0;
        v.lane = ch.to;
        v.x = laneX(ch.to);
      }
    }
  }

  private cancelChange(v: VehicleRec, ch: Changer): void {
    ch.state = 3;
    v.flowLane = v.lane;
    this.counters.changeAborts!++;
  }

  private updateBraker(v: VehicleRec, br: Braker, dt: number, pz: number): void {
    if (br.state === 0) {
      const ahead = this.aheadOf(v, pz);
      if (ahead < 0) {
        v.braker = null;
        return;
      }
      const eta = ahead / Math.max(1, this.playerSpeed - v.spd);
      if (eta > br.trigT) return;
      const p = this.player;
      const playerLane = p && p.lane != null ? p.lane : v.lane;
      if (eta < 1.7 || Math.abs(playerLane - v.lane) > 1 || this.activePreset || (v.changer && v.changer.state > 0 && v.changer.state < 3)) {
        v.braker = null;
        return;
      }
      br.state = 1;
      br.t = 0;
      this.counters.brakers!++;
    } else if (br.state === 1) {
      br.t += dt;
      v.dv = -Math.min(br.depth, this._laneSpeed[v.flowLane]! * 0.85);
      if (br.t >= br.hold) {
        br.state = 2;
        br.t = 0;
      }
    } else if (br.state === 2) {
      br.t += dt;
      v.dv = 0;
      if (br.t > 1.2) br.state = 3;
    }
  }

  // ---- sky lanes -----------------------------------------------------------------------------------------------

  private skySpeed(difficulty: number): number {
    return lerp(SKY_SPEED_MIN, SKY_SPEED_MAX, difficulty);
  }

  private updateSkySpawns(difficulty: number, pz: number, metres: number): void {
    const sky = this.skyRng;
    let guard = 0;
    while (metres >= this.nextSkyDist && guard++ < 8) {
      const extent = this.spawnFormation(pz - SKY_SPAWN_AHEAD, difficulty, pz);
      const ps = this.playerSpeed;
      const ss = this.skySpeed(difficulty);
      const clearGap = ((extent + 30) * ps) / (ps + ss);
      const wanted = lerp(185, 80, difficulty) * sky.range(0.85, 1.2);
      this.nextSkyDist += Math.max(wanted, clearGap);
    }
    for (guard = 0; metres >= this.nextSkyPickDist && guard++ < 8; ) {
      this.spawnSkyPickups(pz - 280);
      this.nextSkyPickDist += sky.range(110, 170);
    }
    for (guard = 0; metres >= this.nextCruiserDist && guard++ < 8; ) {
      const lane = sky.int(0, 4);
      this._spawnSky(sky.int(0, 3), lane, CRUISER_ALTITUDE, pz - 280, -1);
      if (sky.chance(0.4)) {
        const neighbour = lane < 4 ? lane + 1 : lane - 1;
        this._spawnSky(sky.int(0, 3), neighbour, 6.8, pz - 280 - 5, -1);
      }
      this.nextCruiserDist += sky.range(170, 300) * lerp(1.2, 0.75, difficulty);
    }
  }

  private bandAltitude(band: number): number {
    const range = band === 0 ? SKY_BAND_LOW : band === 1 ? SKY_BAND_MID : SKY_BAND_HIGH;
    return this.skyRng.range(range[0], range[1]);
  }

  private cruiserInLane(lane: number, z: number): boolean {
    for (const s of this.skyCars) if (s.dir < 0 && s.lane === lane && s.z < z + 10) return true;
    return false;
  }

  private spawnFormation(z: number, difficulty: number, pz: number): number {
    const sky = this.skyRng;
    const index = this.counters.skyFormations!++;
    const paintLane = sky.int(0, 3);
    const paint = (): number => (sky.chance(0.6) ? paintLane : sky.int(0, 3));
    const p = this.player;
    const playerLane = p && p.lane != null ? clamp(p.lane | 0, 0, 4) : 2;
    let pattern: string;
    if (index === 0) pattern = "v";
    else if (index === 1) pattern = "single";
    else {
      const names = ["single", "pair", "v", "wall", "slalom", "swoop", "lowpair", "doublewall"];
      const weights = [lerp(0.22, 0.1, difficulty), lerp(0.18, 0.1, difficulty), 0.14, lerp(0.08, 0.16, difficulty), lerp(0.1, 0.15, difficulty), lerp(0.1, 0.16, difficulty), difficulty > 0.2 ? lerp(0.04, 0.12, difficulty) : 0, difficulty > 0.55 ? 0.1 : 0];
      let sum = 0;
      for (const w of weights) sum += w;
      for (let i = 0; i < weights.length; i++) weights[i]! /= sum;
      pattern = pickWeighted(sky, names, weights);
    }
    const lowChance = index === 1 ? 1 : lerp(0.18, 0.36, difficulty);
    const pickBand = (): number => {
      const r = sky.next();
      return r < lowChance ? 0 : r < lowChance + (1 - lowChance) * 0.55 ? 1 : 2;
    };
    let extent = 6;
    let gapLane = -1;
    let band = 1;
    let lead: SkyRec | null = null;
    const spawn = (lane: number, altitude: number, at: number, options?: SkyOptions): SkyRec => {
      const rec = this._spawnSky(paint(), lane, altitude, at, 1, options ?? null);
      if (!lead || rec.z > lead.z) lead = rec;
      return rec;
    };
    switch (pattern) {
      case "single": {
        band = pickBand();
        const lane = index === 1 ? playerLane : sky.int(0, 4);
        const weave = sky.range(0.55, 1) * 3.6;
        spawn(lane, this.bandAltitude(band), z, { weave, wf: sky.range(1.6, 2.6), wp: sky.range(0, 6.283) });
        break;
      }
      case "pair": {
        band = pickBand();
        const lane = sky.int(0, 3);
        const altitude = this.bandAltitude(band);
        spawn(lane, altitude, z);
        spawn(lane + 1, altitude + 0.15, z - 1.5);
        gapLane = lane >= 2 ? lane - 2 : lane + 3;
        break;
      }
      case "lowpair": {
        band = 0;
        const lane = sky.int(0, 2);
        spawn(lane, this.bandAltitude(0), z);
        spawn(lane + 2, this.bandAltitude(0), z - sky.range(4, 14));
        extent = 16;
        break;
      }
      case "v": {
        band = index === 0 ? 1 : pickBand() || 1;
        const lane = index === 0 ? clamp(playerLane, 1, 3) : sky.int(1, 3);
        const altitude = index === 0 ? 9.2 : this.bandAltitude(band);
        spawn(lane, altitude, z);
        spawn(lane - 1, altitude + 0.3, z - 7);
        spawn(lane + 1, altitude + 0.3, z - 7);
        extent = 12;
        if (difficulty > 0.5 && lane - 2 >= 0 && lane + 2 < 5) {
          spawn(lane - 2, altitude + 0.6, z - 14);
          spawn(lane + 2, altitude + 0.6, z - 14);
          extent = 20;
        }
        gapLane = lane >= 2 ? 0 : 4;
        if (extent === 20) gapLane = -1;
        break;
      }
      case "wall": {
        band = sky.chance(0.55) ? 1 : 2;
        const altitude = this.bandAltitude(band);
        gapLane = sky.int(0, 4);
        for (let lane = 0; lane < 5; lane++) if (lane !== gapLane) spawn(lane, altitude + sky.range(-0.2, 0.2), z - sky.range(0, 2));
        break;
      }
      case "slalom": {
        band = 0;
        const count = sky.int(4, 6);
        const lanes = sky.chance(0.5) ? [1, 3] : [0, 2, 4, 2];
        const offset = sky.int(0, lanes.length - 1);
        const flip = sky.chance(0.5);
        for (let i = 0; i < count; i++) {
          const b = (i % 2 === 0) === flip ? 0 : 1;
          spawn(lanes[(i + offset) % lanes.length]!, this.bandAltitude(b), z - i * 15);
        }
        extent = (count - 1) * 15 + 5;
        break;
      }
      case "swoop": {
        band = 0;
        const closing = this.playerSpeed + this.skySpeed(difficulty);
        const count = difficulty > 0.35 && sky.chance(0.5) ? 2 : 1;
        let first = sky.int(0, 4);
        for (let i = 0; i < 6 && this.cruiserInLane(first, pz); i++) first = (first + 2) % 5;
        for (let i = 0; i < count; i++) {
          const lane = i === 0 ? first : (first + 2 + sky.int(0, 1)) % 5;
          if (i > 0 && this.cruiserInLane(lane, pz)) continue;
          spawn(lane, sky.range(15, 18.5), z - i * 9, { swoop: true, yLo: this.bandAltitude(0), diveEnd: closing * 1.4, diveLen: sky.range(70, 100) });
        }
        extent = 14;
        break;
      }
      case "doublewall": {
        band = 2;
        gapLane = sky.int(0, 4);
        let gap2 = sky.int(0, 4);
        if (gap2 === gapLane) gap2 = (gap2 + 2) % 5;
        const altA = this.bandAltitude(1);
        const altB = this.bandAltitude(2);
        for (let lane = 0; lane < 5; lane++) {
          if (lane !== gapLane) spawn(lane, altA, z);
          if (lane !== gap2) spawn(lane, altB, z - 30);
        }
        extent = 34;
        break;
      }
    }
    const leadRec = lead as SkyRec | null;
    if (leadRec) this.forms.push({ lead: leadRec, gen: leadRec.gen, pattern, gapLane, band, id: this.formSerial++ });
    if (gapLane >= 0 && leadRec && sky.chance(0.6)) {
      const gx = laneX(gapLane);
      const gy = leadRec.baseY;
      if (sky.chance(0.55)) this._addPickup("air", gx, gy + 0.5, z + 25);
      else this.boltLine(gx, gy + 0.5, z + 32, z + 14, 3);
    }
    return extent;
  }

  private spawnSkyPickups(z: number): void {
    const sky = this.skyRng;
    const x = laneX(sky.int(0, 4));
    const y = sky.range(9.5, 17);
    const roll = sky.next();
    if (roll < 0.42) this.boltLine(x, y, z, z - 22, 3.2);
    else if (roll < 0.75) this.boltRing(x, y, z);
    else
      for (let i = 0; i < 9; i++) {
        const k = i / 8;
        this._addPickup("bolt", x, lerp(5.6, y, smoothstep01(k)), z - i * 3.4);
      }
    if (sky.chance(0.55)) this._addPickup("air", x, y, z - 32);
  }

  private moveSky(dt: number, difficulty: number, pz: number): void {
    const skySpeed = this.skySpeed(difficulty);
    const playerSpeed = this.playerSpeed;
    const t = this.time;
    const list = this.skyCars;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      s.prevX = s.x;
      s.prevY = s.y;
      s.prevZ = s.z;
      const oncoming = s.dir > 0;
      s.z += oncoming ? (s.vz > 0 ? s.vz : skySpeed) * dt : -12 * dt;
      const x0 = s.x;
      if (s.amp > 0) {
        s.x = clamp(s.bx + s.amp * Math.sin(s.wp + t * s.wf), laneX(0), laneX(4));
        s.lane = clamp(Math.round(s.x / 3.6 + 2), 0, 4);
      }
      const vx = dt > 0 ? (s.x - x0) / dt : 0;
      let targetY = s.baseY;
      if (s.mode === 2) {
        const k = clamp((pz - s.z - s.diveEnd) / s.diveLen, 0, 1);
        targetY = lerp(s.yLo, s.yHi, smoothstep01(k));
      }
      const y0 = s.y;
      targetY += Math.sin(t * 1.7 + s.phase) * 0.18;
      if (targetY < 6) {
        const roof = this.roofUnder(s.x, s.z, s.l / 2 + 1.5);
        if (roof > 0 && targetY < roof + 0.45) targetY = roof + 0.45;
      }
      if (targetY > 5.6 && targetY < 11.4 && this.world && this.world.gantries) {
        for (const g of this.world.gantries) {
          const dz = Math.abs(s.z - g.position.z);
          if (dz < 14) {
            const k = smoothstep01(1 - dz / 14);
            targetY = targetY < 7.8 ? lerp(targetY, 5.4, k) : lerp(targetY, 11.5, k);
          }
        }
      }
      s.y = Math.min(targetY, 22.8);
      s.low = s.y < 6.2;
      const vy = dt > 0 ? (s.y - y0) / dt : 0;
      s.rz = clamp(-vx * 0.05, -0.45, 0.45) * (oncoming ? -1 : 1) + Math.sin(t * 1.3 + s.phase) * 0.05;
      s.rx = clamp(vy * 0.03, -0.35, 0.35) * (oncoming ? -1 : 1);
      if (s.z - s.l / 2 > pz + 40 || s.z < pz - 280 - 420) this._recycleSkyAt(i);
    }
    const forms = this.forms;
    for (let i = forms.length - 1; i >= 0; i--) {
      const f = forms[i]!;
      const lead = f.lead;
      if (!lead.active || lead.gen !== f.gen) {
        forms.splice(i, 1);
        continue;
      }
      const distance = pz - lead.z;
      const eta = distance / (playerSpeed + skySpeed);
      if (!(eta > SKY_INCOMING_ETA)) {
        forms.splice(i, 1);
        if (!(distance < 0 || this.activePreset)) {
          try {
            this.onEvent("skyIncoming", { lane: lead.lane, y: lead.y, x: lead.x, z: lead.z, eta, pattern: f.pattern, gapLane: f.gapLane, band: f.band });
          } catch (error) {
            console.warn("[traffic] onEvent skyIncoming failed", error);
          }
        }
      }
    }
  }

  private roofUnder(x: number, z: number, margin: number): number {
    let best = 0;
    for (const v of this.vehicles) {
      if (Math.abs(v.x - x) > v.w / 2 + 1 || Math.abs(v.z - z) > v.l / 2 + margin) continue;
      const top = v.ramp ? v.roof : Math.max(v.roof, v.h);
      if (top > best) best = top;
    }
    return best;
  }

  // ---- pickups, honks ------------------------------------------------------------------------------------------

  private updatePickups(dt: number, player: Player | null, pz: number): void {
    const magnet = !!(player && player.magnetTimer > 0);
    const pos = player && player.position;
    const px = pos ? pos.x : 0;
    const py = pos ? pos.y + PLAYER_BOX.h * 0.5 : 0;
    const pzz = pos ? pos.z : pz;
    const pull = 1 - Math.exp(-16 * dt);
    const list = this.pickups;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      if (p.anchor && !p.magnet) {
        if (p.anchor.gen !== p.anchorGen) {
          this._recyclePickupAt(i);
          continue;
        }
        p.x = p.anchor.x + p.ox;
        p.z = p.anchor.z + p.oz;
        p.y = p.oy;
      } else if (p.flowLane >= 0 && !p.magnet) p.z -= this._laneSpeed[p.flowLane]! * dt;
      if (magnet && p.kind === "bolt" && !p.magnet) {
        const dx = p.x - px;
        const dy = p.y - py;
        const dz = p.z - pzz;
        if (dx * dx + dy * dy + dz * dz < 81) {
          p.magnet = true;
          p.anchor = null;
        }
      }
      if (p.magnet && pos) {
        p.x += (px - p.x) * pull;
        p.y += (py - p.y) * pull;
        p.z += (pzz - p.z) * pull;
      }
      if (p.z > pz + 14) this._recyclePickupAt(i);
    }
  }

  private honkCheck(dt: number, player: Player | null): void {
    if (this.honkCD > 0) this.honkCD -= dt;
    if (!player || !player.position || player.grounded || player.alive === false) return;
    const pos = player.position;
    for (const v of this.vehicles) {
      if (v.honked || Math.abs(v.z - pos.z) > v.l / 2 || Math.abs(v.x - pos.x) > v.w / 2 + 0.6) continue;
      const clearance = pos.y - v.roof;
      if (clearance < 0.15 || clearance > 4.5) continue;
      v.honked = true;
      if (this.honkCD > 0 || !this.fxRng.chance(0.6)) continue;
      this.honkCD = HONK_COOLDOWN;
      v.honkT = 0.4;
      v.honkPos.set(v.x, v.roof + 0.8, v.z);
      try {
        this.onEvent("honk", { position: v.honkPos, what: v.type });
      } catch (error) {
        console.warn("[traffic] onEvent honk failed", error);
      }
    }
  }

  private evPoint(x: number, y: number, z: number): Vector3 {
    const v = this.evPos[this.evPosIdx]!;
    this.evPosIdx = (this.evPosIdx + 1) % this.evPos.length;
    return v.set(x, y, z);
  }
}

