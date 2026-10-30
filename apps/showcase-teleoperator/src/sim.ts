/**
 * Grid Dispatch simulation: one fixed step of the player car, the fare loop, traffic, AI rivals, signals and the shift.
 * No DOM, no engine calls: main.ts runs it from `createFixedStepLoop` and draws the result, and the unit tests
 * (tests/unit/teleoperator/sim.test.ts) step it directly. Side effects come back as `SimEvent`s.
 */
import { applyCollisionPenalty, createTrafficRecovery, type PlayerBody, type TrafficBody, type TrafficContacts } from "./collision";
import {
  ASSIST,
  FARES,
  KERB_STOP_X,
  PLAYABLE_FLEET,
  PLAYER_X_LIMIT,
  clamp,
  createShift,
  crossedStopLine,
  emptyCareer,
  fittedSize,
  isWrongWay,
  kerbGate,
  lerp,
  nextStopLineZ,
  resolveLaneFollowing,
  rideOutcome,
  shiftAddFare,
  shiftScore,
  shiftTick,
  signalPhase,
  signalSpeedCap,
  type AutopilotLevel,
  type CareerStats,
  type FareScenario,
  type LaneBody,
  type PlayableCarId,
  type RideLifecycleState,
  type RideOutcome,
  type RideStyle,
  type ShiftState
} from "./rules";

export type CueName = "collision" | "pickup" | "dropoff" | "earn" | "miss" | "warn" | "nearMiss";
export type PopupTone = "good" | "bad" | "nfs";

export type SimEvent =
  | { readonly kind: "popup"; readonly title: string; readonly detail: string; readonly tone: PopupTone }
  | { readonly kind: "cue"; readonly name: CueName; readonly gain?: number }
  | { readonly kind: "fare"; readonly fare: FareScenario; readonly outcome: RideOutcome; readonly style: RideStyle }
  | { readonly kind: "shiftOver"; readonly score: number; readonly best: number; readonly newBest: boolean };

export interface DriveInput {
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly boost: boolean;
}

/** GD-03: deceleration (m/s^2) above which the brake lamps light; coasting down to cruise is 3.2. */
export const BRAKE_LAMP_DECEL = 4;

export const NO_INPUT: DriveInput = { throttle: false, brake: false, left: false, right: false, boost: false };

export interface RivalMeta {
  readonly handle: string;
  readonly carLabel: string;
  readonly piClass: string;
  readonly accent: string;
  readonly asset: "gridRivalCruiser" | "gridCoupe" | "gridInterceptor" | "gridCablecar" | "gridGt";
  readonly maxDim: number;
  readonly bounds: readonly [number, number, number];
  readonly laneX: number;
  readonly direction: 1 | -1;
  readonly z: number;
  readonly cruise: number;
  readonly isCableCar: boolean;
}

/** Five AI rivals that drive the same avenue (scripted, not other players). */
export const RIVALS: readonly RivalMeta[] = [
  { handle: "Devon", carLabel: "Apex Cruiser", piClass: "S 918", accent: "#3fd6c6", asset: "gridRivalCruiser", maxDim: 3.9, bounds: [0.8921, 1.4132, 1.9017], laneX: 7.4, direction: 1, z: -30, cruise: 14.8, isCableCar: false },
  { handle: "Kaya", carLabel: "Cyber Coupe", piClass: "A 742", accent: "#ffb347", asset: "gridCoupe", maxDim: 4.0, bounds: [1.2939, 1.1513, 1.9016], laneX: 3.4, direction: 1, z: -46, cruise: 15.1, isCableCar: false },
  { handle: "Elena", carLabel: "Apex Interceptor", piClass: "X 999", accent: "#c45bff", asset: "gridInterceptor", maxDim: 4.5, bounds: [0.8736, 0.5225, 1.9019], laneX: 3.4, direction: 1, z: -64, cruise: 15.8, isCableCar: false },
  { handle: "Line 59", carLabel: "Cable Car", piClass: "C 104", accent: "#43d17a", asset: "gridCablecar", maxDim: 8.2, bounds: [2.8885, 4.093, 8.3975], laneX: -3.2, direction: -1, z: -40, cruise: 9.5, isCableCar: true },
  { handle: "Marcus", carLabel: "Vortex GT", piClass: "S 990", accent: "#ff5a1f", asset: "gridGt", maxDim: 4.66, bounds: [0.9245, 0.5271, 1.9061], laneX: 7.4, direction: 1, z: -80, cruise: 15.6, isCableCar: false }
];

export interface TrafficSpec {
  readonly asset: "gridSedan" | "gridTaxi" | "gridHatch" | "gridVan" | "gridPickup" | "gridBoxTruck";
  readonly maxDim: number;
  readonly bounds: readonly [number, number, number];
}

const SEDAN: readonly [number, number, number] = [0.8144, 0.6568, 1.9007];
const HATCH: readonly [number, number, number] = [1.2939, 1.1513, 1.9016];
const VAN: readonly [number, number, number] = [0.895, 1.1164, 1.9004];
const PICKUP: readonly [number, number, number] = [0.7774, 0.7276, 1.9027];
const BOX: readonly [number, number, number] = [0.9023, 1.0833, 1.9004];

/** Ten traffic cars in slot order: 2 sedans, 2 taxis, 2 compact hatches, 1 van, 2 pickups, 1 box truck. */
export const TRAFFIC_SPECS: readonly TrafficSpec[] = [
  { asset: "gridSedan", maxDim: 4.75, bounds: SEDAN },
  { asset: "gridTaxi", maxDim: 4.6, bounds: SEDAN },
  { asset: "gridSedan", maxDim: 4.75, bounds: SEDAN },
  { asset: "gridHatch", maxDim: 3.9, bounds: HATCH },
  { asset: "gridHatch", maxDim: 3.9, bounds: HATCH },
  { asset: "gridTaxi", maxDim: 4.6, bounds: SEDAN },
  { asset: "gridVan", maxDim: 4.7, bounds: VAN },
  { asset: "gridPickup", maxDim: 5.25, bounds: PICKUP },
  { asset: "gridPickup", maxDim: 5.25, bounds: PICKUP },
  { asset: "gridBoxTruck", maxDim: 7.6, bounds: BOX }
];

export const TRAFFIC_COUNT = TRAFFIC_SPECS.length;
/** Road users that collide with the player: traffic slots first, then the rivals. */
export const ROAD_USER_COUNT = TRAFFIC_COUNT + RIVALS.length;

export interface RoadUser extends LaneBody {
  readonly slot: number;
  cruise: number;
  readonly width: number;
  readonly rival: number | null;
}

/** [length, width] collision footprints of every road user, from the fitted model bounds. */
export function roadUserFootprints(): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const t of TRAFFIC_SPECS) { const s = fittedSize(t.bounds, t.maxDim); out.push([s.length, s.width]); }
  for (const r of RIVALS) { const s = fittedSize(r.bounds, r.maxDim); out.push([s.length, s.width]); }
  return out;
}

export function playerShapeOf(car: PlayableCarId): { radius: number; halfLength: number } {
  const s = fittedSize(PLAYABLE_FLEET[car].bounds, PLAYABLE_FLEET[car].maxDim);
  return { radius: s.width / 2, halfLength: s.length / 2 };
}

function createRoadUsers(playerZ: number): RoadUser[] {
  const users: RoadUser[] = [];
  TRAFFIC_SPECS.forEach((t, i) => {
    const s = fittedSize(t.bounds, t.maxDim);
    const oncoming = i < 4;
    const cruise = oncoming ? 13 + (i % 3) * 2.2 : 10.5 + (i % 4) * 1.8;
    users.push({ slot: i, laneX: oncoming ? [-7.6, -3.2][i % 2]! : [3.4, 7.4][i % 2]!, z: playerZ - 22 - i * 24, speed: cruise, cruise, direction: oncoming ? -1 : 1, length: s.length, width: s.width, rival: null });
  });
  RIVALS.forEach((r, k) => {
    const s = fittedSize(r.bounds, r.maxDim);
    users.push({ slot: TRAFFIC_COUNT + k, laneX: r.laneX, z: playerZ + r.z, speed: r.cruise, cruise: r.cruise, direction: r.direction, length: s.length, width: s.width, rival: k });
  });
  resolveLaneFollowing(users);
  return users;
}

export interface PlayerState {
  x: number;
  z: number;
  speed: number;
  steer: number;
  yaw: number;
  roll: number;
  pitch: number;
  power: number;
  regen: number;
  /** Lane the L4 lane cruise holds. */
  holdLane: number;
}

export interface RideState {
  state: RideLifecycleState;
  timer: number;
  elapsed: number;
  fareIndex: number;
  beaconZ: number;
  comfort: number;
  bounty: number;
  multiplier: number;
  collisions: number;
  nearMisses: number;
  lastOutcome: RideOutcome | null;
}

export interface SimState {
  time: number;
  steps: number;
  phase: "driving" | "results";
  car: PlayableCarId;
  level: AutopilotLevel;
  style: RideStyle;
  player: PlayerState;
  ride: RideState;
  shift: ShiftState;
  career: CareerStats;
  users: RoadUser[];
  signal: 0 | 1 | 2;
  wrongWay: boolean;
  brakeCue: boolean;
  /**
   * GU47 GD-03: read-only presentation flag, true while the player car decelerates harder than coasting (brake pedal,
   * brake assist, autopilot stop) or holds the brake at a standstill. Written after the drive step; the sim never reads it.
   */
  brakeLamp: boolean;
  collisionCount: number;
  lastPenaltyAt: number;
  lastScore: number | null;
}

const newPlayer = (): PlayerState => ({ x: 3.4, z: 0, speed: 11.5, steer: 0, yaw: 0, roll: 0, pitch: 0, power: 0.44, regen: 0.22, holdLane: 3.4 });
const newRide = (playerZ: number): RideState => ({ state: "offer", timer: 0, elapsed: 0, fareIndex: 0, beaconZ: playerZ - 115, comfort: 100, bounty: 0, multiplier: 3, collisions: 0, nearMisses: 0, lastOutcome: null });

export function createSimState(o: { car?: PlayableCarId; level?: AutopilotLevel; career?: CareerStats } = {}): SimState {
  const player = newPlayer();
  return {
    time: 0, steps: 0, phase: "driving", car: o.car ?? "cruiser", level: o.level ?? "MAN", style: "comfort",
    player, ride: newRide(player.z), shift: createShift(), career: o.career ?? emptyCareer(),
    users: createRoadUsers(player.z), signal: 0, wrongWay: false, brakeCue: false, brakeLamp: false, collisionCount: 0, lastPenaltyAt: -10, lastScore: null
  };
}

export const fareOf = (s: SimState): FareScenario => FARES[s.ride.fareIndex % FARES.length]!;

export interface Sim {
  readonly state: SimState;
  step(dt: number, input: DriveInput): SimEvent[];
  /** Skip the current fare: no pay, the next request arrives. */
  skipFare(): SimEvent[];
  /** Start a new shift (results Retry): keeps the car, assist level and career. */
  restart(): void;
  setCar(car: PlayableCarId): void;
  /** Called after every finished shift with the new best, so the host can persist the career. */
  onCareer?: (career: CareerStats) => void;
}

export function createSim(contacts: TrafficContacts, init: { car?: PlayableCarId; level?: AutopilotLevel; career?: CareerStats } = {}): Sim {
  const state = createSimState(init);
  const recovery = createTrafficRecovery(state.users.map((u) => u.cruise));
  contacts.setPlayerShape(playerShapeOf(state.car));
  let prevRel = state.users.map((u) => u.z - state.player.z);
  const lastHitAt = state.users.map(() => -10);
  let committedLine: number | null = null;

  const penalise = (events: SimEvent[], title: string, comfortLoss: number, multiplierLoss: number, bountyLoss: number): void => {
    const r = state.ride;
    if (state.style === "comfort") {
      r.comfort = Math.max(0, r.comfort - comfortLoss);
      events.push({ kind: "popup", title, detail: `-${comfortLoss}% comfort`, tone: "bad" });
    } else {
      r.multiplier = Math.max(1, r.multiplier - multiplierLoss);
      r.bounty = Math.max(0, r.bounty - bountyLoss);
      events.push({ kind: "popup", title, detail: `Multiplier x${r.multiplier.toFixed(1)}`, tone: "bad" });
    }
    events.push({ kind: "cue", name: "warn" });
  };

  const nextFare = (beaconAhead: number): void => {
    const r = state.ride;
    r.fareIndex = (r.fareIndex + 1) % FARES.length;
    r.state = "offer";
    r.timer = 0;
    r.beaconZ = state.player.z - beaconAhead;
  };

  const startRide = (events: SimEvent[]): void => {
    const r = state.ride;
    r.state = "ride";
    r.elapsed = 0;
    r.comfort = 100;
    r.multiplier = 3;
    r.bounty = 0;
    r.collisions = 0;
    r.nearMisses = 0;
    r.beaconZ = state.player.z - 165;
    const fare = fareOf(state);
    events.push({ kind: "popup", title: `${fare.passenger} aboard`, detail: `Destination: ${fare.dropoffName}`, tone: "good" }, { kind: "cue", name: "pickup" });
  };

  const finishShift = (events: SimEvent[]): void => {
    const score = shiftScore(state.shift);
    const newBest = score > state.career.bestShiftScore;
    if (newBest) state.career.bestShiftScore = score;
    state.lastScore = score;
    state.phase = "results";
    sim.onCareer?.(state.career);
    events.push({ kind: "shiftOver", score, best: state.career.bestShiftScore, newBest });
  };

  const sim: Sim = {
    state,
    setCar(car) {
      state.car = car;
      contacts.setPlayerShape(playerShapeOf(car));
    },
    restart() {
      Object.assign(state.player, newPlayer());
      state.ride = newRide(state.player.z);
      state.shift = createShift();
      state.users = createRoadUsers(state.player.z);
      state.users.forEach((u, i) => recovery.setBaseSpeed(i, u.cruise));
      prevRel = state.users.map((u) => u.z - state.player.z);
      state.phase = "driving";
      state.wrongWay = false;
      state.brakeLamp = false;
      state.lastScore = null;
      contacts.reset();
    },
    skipFare() {
      const events: SimEvent[] = [];
      if (state.phase !== "driving" || state.ride.state === "summary") return events;
      state.shift.skipped += 1;
      const fare = fareOf(state);
      nextFare(115);
      events.push({ kind: "popup", title: "Fare skipped", detail: `${fare.passenger} rebooked · no pay`, tone: "bad" });
      return events;
    },
    step(dt, input) {
      const events: SimEvent[] = [];
      state.steps += 1;
      if (state.phase === "results") return events;
      state.time += dt;
      const p = state.player;
      const r = state.ride;
      const spec = PLAYABLE_FLEET[state.car];
      const assist = ASSIST[state.level];
      const playerDrives = assist.speed === "player";
      if (shiftTick(state.shift, dt)) events.push({ kind: "popup", title: "Shift over", detail: "The shift clock ran out", tone: "nfs" });

      state.signal = signalPhase(state.time);
      const dz = p.z - r.beaconZ;
      const towardKerb = (r.state === "offer" || r.state === "ride") && dz > -2 && dz < 46;
      const atKerb = r.state === "boarding" || r.state === "alighting";

      // ---- assist targets
      let targetLane = assist.steering === "route" ? 3.4 : p.holdLane;
      let targetSpeed = assist.cruiseMps;
      if (assist.steering === "route" && r.state === "ride" && !towardKerb) {
        const want = Math.sin(state.time * 0.35) > 0.35 ? 7.4 : 3.4;
        const current = p.x > 5.4 ? 7.4 : 3.4;
        const free = want === current || !state.users.some((u) => u.direction === 1 && Math.abs(u.laneX - want) < 2 && u.z - p.z < 9 && p.z - u.z < 12);
        targetLane = free ? want : current;
      }
      let leadGap = Infinity;
      let leadSpeed = Infinity;
      for (const u of state.users) {
        if (u.direction !== 1) continue;
        const ahead = p.z - u.z - u.length / 2;
        if (ahead > 0 && ahead < 26 && Math.abs(u.laneX - p.x) < (u.width + 1.8) / 2 + 0.4 && ahead < leadGap) {
          leadGap = ahead;
          leadSpeed = u.speed;
        }
      }
      if (assist.steering === "route" && leadGap < 22 && !towardKerb) {
        const blocked = state.users.find((u) => u.direction === 1 && p.z - u.z > 0 && p.z - u.z < 26 && Math.abs(u.laneX - p.x) < 2.1);
        if (blocked) {
          const other = blocked.laneX > 5 ? 3.4 : 7.4;
          // change lanes only into a gap: nobody in the other lane within 12 m ahead or 9 m behind
          const free = !state.users.some((u) => u.direction === 1 && Math.abs(u.laneX - other) < 2 && u.z - p.z < 9 && p.z - u.z < 12);
          if (free) targetLane = other;
          else targetLane = p.x > 5.4 ? 7.4 : 3.4;
        }
      }
      const laneFree = (x: number): boolean => !state.users.some((u) => u.direction === 1 && Math.abs(u.laneX - x) < 2 && u.z - p.z < 9 && p.z - u.z < 12);
      if (r.state === "summary" && Math.abs(p.x - KERB_STOP_X) < 0.6 && !laneFree(targetLane)) targetLane = KERB_STOP_X;
      if (towardKerb) {
        // pull in towards the kerb only through a gap in the right lane (the kerb stop sits in it)
        if (Math.abs(p.x - KERB_STOP_X) < 1 || laneFree(7.4)) targetLane = KERB_STOP_X;
        if (dz < 24) targetSpeed = clamp(dz * 0.55, 2.2, 12.5);
      }
      if (atKerb) {
        targetLane = KERB_STOP_X;
        targetSpeed = 0;
      }
      if (r.state === "summary") targetSpeed = Math.min(targetSpeed || 13.5, 13.5);
      const lineZ = nextStopLineZ(p.z);
      let signalCap = signalSpeedCap({ phase: state.signal, distToLine: p.z - lineZ, speed: p.speed });
      // a car that decided to go on yellow keeps going through that line, even if it slows afterwards
      if (state.signal === 1 && signalCap === Infinity && p.z - lineZ < 60) committedLine = lineZ;
      if (committedLine === lineZ) signalCap = Infinity;
      else if (state.signal === 0) committedLine = null;
      const followCap = leadGap < 26 ? Math.max(0, Math.min(leadSpeed, (leadGap - 3) * 0.8)) : Infinity;

      // ---- drive
      const xBefore = p.x;
      const speedBefore = p.speed;
      state.brakeCue = false;
      if (playerDrives) {
        const steerInput = atKerb ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
        p.steer = lerp(p.steer, steerInput, dt * 7.5);
        p.x = clamp(p.x + p.steer * Math.max(4, p.speed * 0.55) * dt, -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
        if (atKerb) {
          p.speed = Math.max(0, p.speed - 26 * dt);
        } else if (input.throttle) {
          const top = input.boost ? spec.maxSpeedMps * 1.18 : spec.maxSpeedMps;
          p.speed = Math.min(top, p.speed + spec.accel * dt);
          p.power = clamp(p.speed / spec.maxSpeedMps + (input.boost ? 0.25 : 0.12), 0.15, 1);
          p.regen = input.boost ? 0.92 : 0.08;
        } else if (input.brake) {
          p.speed = Math.max(0, p.speed - 26 * dt);
          p.power = 0.05;
          p.regen = 0.88;
        } else {
          // urban cruise: an EV keeps rolling at 9.5 m/s until the brake is pressed
          p.speed = p.speed > 9.5 ? Math.max(9.5, p.speed - 3.2 * dt) : p.speed > 0.5 ? Math.min(9.5, p.speed + 4 * dt) : p.speed;
          p.power = clamp((p.speed / spec.maxSpeedMps) * 0.6, 0.18, 0.7);
          p.regen = 0.22;
        }
        if (assist.brakeAssist) {
          const cap = Math.min(signalCap, followCap);
          if (p.speed > cap + 0.5) {
            p.speed = Math.max(cap, p.speed - 14 * dt);
            state.brakeCue = true;
            p.regen = 0.9;
          }
        }
        p.holdLane = p.x > 5.4 ? 7.4 : 3.4;
      } else {
        const cap = Math.min(targetSpeed, signalCap, followCap);
        p.steer = clamp((targetLane - p.x) * 0.35, -0.65, 0.65);
        p.x = lerp(p.x, targetLane, dt * 3.1);
        const diff = cap - p.speed;
        p.speed = clamp(p.speed + clamp(diff * 2.6, -16, spec.accel) * dt, 0, spec.maxSpeedMps);
        p.power = clamp((p.speed / spec.maxSpeedMps) * 0.85 + Math.max(0, diff * 0.04), 0.04, 0.96);
        p.regen = diff < -0.6 ? clamp(-diff * 0.16, 0.25, 0.95) : 0.22;
        state.brakeCue = cap < targetSpeed - 1 && p.speed > 1;
      }
      // Stopping for a light: brake with the deceleration that ends 1.5 m before the line (the proportional controller
      // above lags, so on its own it would roll through the line).
      if ((!playerDrives || assist.brakeAssist) && signalCap !== Infinity && p.speed > signalCap - 0.5) {
        const room = Math.max(0.05, p.z - lineZ - 1.5);
        const need = (p.speed * p.speed) / (2 * room) + 0.4;
        p.speed = Math.max(0, p.speed - Math.min(16, need) * dt);
        if (playerDrives) state.brakeCue = true;
      }
      state.brakeLamp = (dt > 0 && (speedBefore - p.speed) / dt > BRAKE_LAMP_DECEL) || (playerDrives && input.brake && p.speed < 0.5);
      const prevZ = p.z;
      p.z -= p.speed * dt;

      // ---- comfort: harsh acceleration or braking during a comfort ride
      if (r.state === "ride" && state.style === "comfort" && Math.abs(p.speed - speedBefore) / dt > 9) r.comfort = Math.max(0, r.comfort - 6 * dt);

      // ---- red lights and wrong way
      const crossed = crossedStopLine(prevZ, p.z);
      if (crossed !== null && state.signal === 2 && p.speed > 2) {
        state.shift.redLights += 1;
        penalise(events, "Ran a red light", 8, 0.5, 200);
      }
      const wrongWay = isWrongWay(p.x);
      if (wrongWay && !state.wrongWay && (r.state === "ride" || r.state === "offer")) penalise(events, "Wrong way", 4, 0.25, 80);
      state.wrongWay = wrongWay;

      // ---- road users: move, respawn off screen, keep their distance in lane
      recovery.update(state.users as unknown as TrafficBody[], state.time, dt);
      for (const u of state.users) {
        if (u.rival !== null) {
          const meta = RIVALS[u.rival]!;
          u.cruise = meta.cruise + Math.sin(state.time * 0.7 + u.rival * 1.4) * 1.5;
          recovery.setBaseSpeed(u.slot, u.cruise);
        }
        if (u.direction === 1) {
          u.z -= u.speed * dt;
          if (u.z > p.z + 18) u.z = p.z - 195 - (u.slot % 3) * 15;
          else if (u.z < p.z - 230) u.z = p.z + 14;
        } else {
          u.z += u.speed * dt;
          if (u.z > p.z + 22) u.z = p.z - 210 - (u.slot % 3) * 18;
        }
      }
      resolveLaneFollowing(state.users, 2.5, { laneX: p.x, z: p.z, speed: p.speed, direction: 1, length: contacts.playerShape.halfLength * 2 });

      // ---- contacts with the player
      const body: PlayerBody = { x: p.x, z: p.z, speed: p.speed, lateral: (p.x - xBefore) / Math.max(dt, 1e-4) };
      const hits = contacts.step(body, state.users as unknown as TrafficBody[], dt);
      p.x = clamp(body.x, -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
      p.z = body.z;
      p.speed = body.speed;
      if (hits.length > 0) p.steer = clamp(body.lateral / Math.max(4, p.speed * 0.55), -1, 1);
      for (const h of hits) {
        state.collisionCount += 1;
        lastHitAt[h.slot] = state.time;
        const u = state.users[h.slot]!;
        if (h.impact.speed >= 1.5 && u.direction === -1) {
          u.speed = 0;
          recovery.onHit(h.slot, state.time);
        }
        if (h.impact.speed >= 1.5 && state.time - state.lastPenaltyAt > 0.5) {
          state.lastPenaltyAt = state.time;
          state.shift.collisions += 1;
          if (r.state === "ride" || r.state === "alighting") r.collisions += 1;
          const pen = { comfortScore: r.comfort, streetBounty: r.bounty, streetMultiplier: r.multiplier };
          const result = applyCollisionPenalty(pen, state.style, h.impact.speed);
          r.comfort = pen.comfortScore;
          r.bounty = pen.streetBounty;
          r.multiplier = pen.streetMultiplier;
          events.push({ kind: "popup", title: result.label, detail: result.detail, tone: "bad" });
        }
      }

      // ---- near misses (street rides): a car passes the player with less than 0.9 m between the bodies and no contact
      const shape = contacts.playerShape;
      state.users.forEach((u, i) => {
        const rel = u.z - p.z;
        if (r.state === "ride" && state.style === "street" && p.speed > 8 && Math.sign(rel) !== Math.sign(prevRel[i]!) && Math.abs(rel) < 6) {
          const gap = Math.abs(u.laneX - p.x) - u.width / 2 - shape.radius;
          if (gap > 0 && gap < 0.9 && state.time - lastHitAt[i]! > 1) {
            r.nearMisses += 1;
            r.multiplier = Math.min(5, r.multiplier + 0.25);
            r.bounty += 60;
            events.push({ kind: "popup", title: "Near miss", detail: `Multiplier x${r.multiplier.toFixed(2)}`, tone: "nfs" }, { kind: "cue", name: "nearMiss" });
          }
        }
        prevRel[i] = rel;
      });

      // ---- fare loop
      const dzNow = p.z - r.beaconZ;
      if (r.state === "offer" || r.state === "ride") {
        const gate = kerbGate({ playerDrives, playerX: p.x, dz: dzNow, speed: p.speed });
        if (gate === "stop") {
          r.state = r.state === "offer" ? "boarding" : "alighting";
          r.timer = 0;
          const fare = fareOf(state);
          if (r.state === "boarding") events.push({ kind: "popup", title: `Picking up ${fare.passenger}`, detail: fare.pickupName, tone: "good" });
        } else if (gate === "missed") {
          state.shift.missed += 1;
          r.beaconZ = p.z - (r.state === "offer" ? 125 : 110);
          penalise(events, r.state === "offer" ? "Missed the pickup" : "Missed the drop-off", 10, 0.5, 150);
          events.push({ kind: "cue", name: "miss" });
        }
      } else if (r.state === "boarding") {
        r.timer += dt;
        if (r.timer >= 1.6) startRide(events);
      } else if (r.state === "alighting") {
        r.timer += dt;
        if (r.timer >= 1.4) {
          const fare = fareOf(state);
          const outcome = rideOutcome({ style: state.style, fareUsd: fare.fareUsd, parSec: fare.parSec, elapsedSec: r.elapsed, comfortScore: r.comfort, collisions: r.collisions, streetMultiplier: r.multiplier });
          r.lastOutcome = outcome;
          state.career.earningsUsd = Math.round((state.career.earningsUsd + outcome.earnedUsd) * 100) / 100;
          state.career.rides += 1;
          state.career.starsSum += outcome.stars;
          shiftAddFare(state.shift, outcome);
          r.state = "summary";
          r.timer = 0;
          events.push({ kind: "fare", fare, outcome, style: state.style }, { kind: "cue", name: "dropoff" }, { kind: "cue", name: "earn" });
        }
      } else if (r.state === "summary") {
        r.timer += dt;
        if (r.timer >= 2.6 && !state.shift.over) nextFare(135);
      }
      if (r.state === "ride") r.elapsed += dt;
      if (state.shift.over && state.phase === "driving" && (r.state !== "summary" || r.timer >= 2.6 || state.shift.reason === "time")) finishShift(events);

      // ---- pose for the presenter
      p.yaw = clamp(-p.steer * 0.16, -0.28, 0.28);
      p.roll = clamp(p.steer * 0.045, -0.08, 0.08);
      p.pitch = clamp((speedBefore - p.speed) / Math.max(dt, 1e-4) * 0.0025, -0.03, 0.03);
      return events;
    }
  };
  return sim;
}
