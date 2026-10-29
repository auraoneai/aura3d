/**
 * Last Train to the Sea: simulation core (pure, deterministic, no engine imports).
 *
 * Ported from the original's state machine (`GM` door/depart actions, `WM` fixed-step update, the
 * economy/comfort/tip bookkeeping and the arrival handler), read from the captured, de-minified module
 * regions in tests/fixtures/crayon/last-train/game-sim.extract.js. The route is the original's own, taken as
 * measured data (position, curvature, grade, vertical curvature, bank every 2 m per leg).
 *
 * Mutating state: `step` and the actions edit the state in place and return it.
 *
 * Not ported (documented in PORTING-NOTES.md): orchard junction, driving gates / boost / bold bonuses, requests
 * and cargo, garage/upgrades/workshop, reaction messages, rear-car roll (the default garage has no rear car).
 *
 * Port-only rules (audit 2026-10-29, not in the original): Gold needs comfort >= 90% and no catches (the original also
 * wanted three requests, which are not ported, so Gold was unreachable); a short service of `goal` legs; at 0 lanterns the
 * service ends at the next station with the grade capped at Bronze; Enter after the results starts a free ride from where
 * the tram stands; a forced new service abandons a running one; `brakeLevel` lets the player's brake ramp in.
 */

export interface RouteLeg { length: number; spacing: number; count: number; position: number[]; physics: number[] }
export interface RouteData { legs: RouteLeg[] }

export interface TownInfo { id: string; name: string; position: [number, number, number]; heading: number; color: string; sky: [string, string]; boarding: number }

export interface PassengerRow { id: string; name: string; town: number; row: number; destination: number; temperament: Temperament }
export type Temperament = "easy" | "sightseer" | "rushed" | "sleeper";

export interface Tables {
  TM: number; EM: number; kM: number; AM: Record<string, number>; RM: number; CM: number;
  seats: number;
  towns: TownInfo[];
  legLengths: number[];
  garage: { motor: number; sway: number; brake: number };
  difficulty: { steering: number; damping: number; instability: number; disturbance: number; maxRate: number };
  temperament: { H: number; V: number; G: number };
  passengerTable: { circuit: number; station: number; passengers: PassengerRow[] }[];
  gates: { id: string; distance: number; min: number; max: number; bonus: number }[][];
}

export interface Journey { frontiers: Record<number, number>; distance: number; comfort: number; weights: Record<number, number> }
export interface Trip { id: string; name: string; temperament: Temperament; seat: number; ride: string; origin: number; destination: number; fareDistance: number; journey: Journey }

export type Phase = "docked" | "opening" | "deploying" | "alighting" | "boarding" | "ready" | "retracting" | "closing" | "enroute";

export interface Attempt {
  id: number; status: "active" | "complete"; startStation: number; lastStation: number; legs: number[];
  /** Legs to complete: the six-town circuit, or 2 for a short service. */
  goal: number;
  /** Why the service ended: the goal was reached, or the lanterns ran out. */
  ended: "goal" | "lanterns" | null;
  fares: number; tips: number; bonuses: number; requests: number; lost: number; catches: number; lanterns: number; streak: number; wobble: number;
  distance: number; comfort: number; frontiers: Record<number, number>; grade: "Gold" | "Silver" | "Bronze" | null;
}

export interface SimState {
  phase: Phase; phaseTime: number; boardingTime: number;
  leg: number; distance: number; speed: number;
  roll: number; rollVelocity: number; trim: number; gust: number; criticalTime: number; catches: number; comfort: number;
  door: number; steps: number; played: number;
  score: number; wallet: number; circuits: number; served: number;
  timeOfDay: "day" | "night";
  lapStops: number[]; visits: number[];
  trips: Trip[]; pendingAlighters: string[]; pendingBoarders: string[]; claimedRides: string[]; deliveredRides: string[];
  passengers: number;
  claims: string[];
  attempt: Attempt;
}

/** `brakeLevel` (0..1, default 1) scales the brake when `brake` is set; the replayed reference always brakes at 1. */
export interface StepInput { accelerate?: boolean; brake?: boolean; brakeLevel?: number; reverse?: boolean; left?: boolean; right?: boolean; cruisePace?: string | null }

export interface SimData { route: RouteData; tables: Tables }

export const DT = 1 / 60;
export const FARE = 100;
export const TIP_UNIT = 50;
export const STREAK_CAP = 200;
export const MIN_TIP_SPEED = 2.5;

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

/** Legs in a full circuit (six towns) and in a short service. */
export const CIRCUIT_LEGS = 6;
export const SHORT_LEGS = 2;
/** Grade thresholds: Gold comfort >= 90 and 0 catches; Silver comfort >= 75 and at most 1 catch; otherwise Bronze. */
export const GRADES = { gold: { comfort: 90, catches: 0 }, silver: { comfort: 75, catches: 1 } } as const;

export function newAttempt(id: number, station: number, goal = CIRCUIT_LEGS): Attempt {
  return { id, status: "active", startStation: station, lastStation: station, legs: [], goal, ended: null, fares: 0, tips: 0, bonuses: 0, requests: 0, lost: 0, catches: 0, lanterns: 3, streak: 0, wobble: 0, distance: 0, comfort: 0, frontiers: {}, grade: null };
}

export function createState(): SimState {
  return {
    phase: "docked", phaseTime: 0, boardingTime: 0, leg: 0, distance: 0, speed: 0,
    roll: 0, rollVelocity: 0, trim: 0, gust: 0, criticalTime: 0, catches: 0, comfort: 100, door: 0, steps: 0, played: 0,
    score: 0, wallet: 0, circuits: 0, served: 0, timeOfDay: "day", lapStops: [0], visits: [],
    trips: [], pendingAlighters: [], pendingBoarders: [], claimedRides: [], deliveredRides: [], passengers: 0, claims: [],
    attempt: newAttempt(1, 0)
  };
}

export interface RouteSample { x: number; y: number; z: number; curvature: number; grade: number; verticalCurvature: number; bank: number }

export function sampleRoute(route: RouteData, leg: number, distance: number): RouteSample {
  const L = route.legs[leg] as RouteLeg;
  const d = clamp(distance, 0, L.length);
  const i = Math.min(L.count - 2, Math.floor(d / L.spacing));
  const t0 = i * L.spacing, t1 = Math.min(L.length, (i + 1) * L.spacing);
  const k = t1 > t0 ? (d - t0) / (t1 - t0) : 0;
  const p = L.position, q = L.physics;
  const lerp = (a: number, b: number): number => a + (b - a) * k;
  return {
    x: lerp(p[i * 3] as number, p[(i + 1) * 3] as number), y: lerp(p[i * 3 + 1] as number, p[(i + 1) * 3 + 1] as number), z: lerp(p[i * 3 + 2] as number, p[(i + 1) * 3 + 2] as number),
    curvature: lerp(q[i * 4] as number, q[(i + 1) * 4] as number), grade: lerp(q[i * 4 + 1] as number, q[(i + 1) * 4 + 1] as number),
    verticalCurvature: lerp(q[i * 4 + 2] as number, q[(i + 1) * 4 + 2] as number), bank: lerp(q[i * 4 + 3] as number, q[(i + 1) * 4 + 3] as number)
  };
}

/** Boarding and alighting durations: fitted to the reference (the original derives them from walking paths to seats). */
export function alightingDuration(n: number): number { return n === 0 ? 0 : 7.65 + 1.2 * Math.max(0, n - 2); }
export function boardingDuration(n: number): number { return n === 0 ? 0.6 : Math.max(0.6, 9.1 - 0.9 * (4 - n)); }

export function stationPassengers(data: SimData, station: number, circuit: number): PassengerRow[] {
  const row = data.tables.passengerTable.find((r) => r.station === station && r.circuit === circuit % 4);
  return row ? row.passengers : [];
}

export function fareDistance(data: SimData, origin: number, destination: number): number {
  const n = data.tables.legLengths.length;
  let total = 0;
  for (let i = origin, g = 0; g < n && i !== destination; g++, i = (i + 1) % n) total += data.tables.legLengths[i] as number;
  return Math.max(1, total);
}

/** Tip of a trip: round(50 * clamp(sum of weights / fare distance, 0, 2.7)). */
export function tipOf(trip: Trip): number {
  let w = 0;
  for (const k of Object.keys(trip.journey.weights)) w += trip.journey.weights[Number(k)] as number;
  return Math.round(TIP_UNIT * clamp(w / trip.fareDistance, 0, 2.7));
}
export function comfortOf(trip: Trip): number { return trip.journey.distance ? clamp((trip.journey.comfort / trip.journey.distance) * 100, 0, 100) : 0; }
export function streakMultiplier(s: SimState): number { return 1 + Math.min(1, s.attempt.streak / STREAK_CAP); }

/** Temperament comfort factor (Z_). */
export function temperamentFactor(t: Temperament, comfort: number, speed: number, roll: number, rollVelocity: number, harsh: boolean, T: Tables["temperament"]): number {
  const v = Math.abs(speed);
  if (t === "sightseer") return comfort * (v <= T.H ? 1.3 : Math.max(0.4, 1 - 0.1 * (v - T.H)));
  if (t === "rushed") return Math.sqrt(comfort) * (v >= T.V ? 1.3 : v < T.G ? 0.7 : 1);
  if (t === "sleeper") {
    const jolt = harsh || Math.abs(roll) > 0.16;
    const smooth = !harsh && Math.abs(roll) < 0.09 && Math.abs(rollVelocity) < 0.2;
    return comfort * (jolt ? 0.15 : smooth ? 1.35 : 1);
  }
  return comfort;
}

function enter(s: SimState, phase: Phase): void { s.phase = phase; s.phaseTime = 0; s.boardingTime = 0; }

export function actionDoors(s: SimState): SimState {
  if (s.attempt.status !== "active") return s;
  if (s.phase === "docked") {
    s.pendingAlighters = s.trips.filter((t) => t.destination === s.leg).map((t) => t.id);
    enter(s, "opening");
  }
  return s;
}

export function actionDepart(s: SimState): SimState {
  if (s.attempt.status !== "active") return s;
  if (s.phase === "ready") { enter(s, "retracting"); s.speed = 0; }
  return s;
}

export function actionTimeOfDay(s: SimState, v: string): SimState { s.timeOfDay = v === "night" ? "night" : "day"; return s; }

/**
 * Start a fresh service: keeps the session score/wallet/time of day, resets the train to the first station with an empty
 * manifest. A running service is left alone unless `force` is set (the player confirmed abandoning it). `goal` picks a
 * full circuit (6 legs) or a short service (2 legs).
 */
export function actionNewService(s: SimState, options: { force?: boolean; goal?: number } = {}): SimState {
  if (s.attempt.status === "active" && !options.force) return s;
  const fresh = createState();
  fresh.score = s.score; fresh.wallet = s.wallet; fresh.timeOfDay = s.timeOfDay;
  fresh.attempt = newAttempt(s.attempt.id + 1, 0, options.goal ?? s.attempt.goal);
  Object.assign(s, fresh);
  return s;
}

/**
 * "Keep riding" after the results: a new attempt that starts where the tram stands, with the riders aboard. The session
 * score carries on; the new attempt is scored on its own and completes after another `goal` legs.
 */
export function actionKeepRiding(s: SimState): SimState {
  if (s.attempt.status !== "complete") return s;
  s.attempt = newAttempt(s.attempt.id + 1, s.leg, s.attempt.goal);
  s.claims = [];
  return s;
}

/** Score of one attempt on its own: fares, tips and line bonuses earned in this service (the results card and the best score). */
export function attemptScore(a: Attempt): number { return a.fares + a.tips + a.bonuses; }

/** Grade from an attempt's comfort and catches (`GRADES`); `capped` (out of lanterns) caps it at Bronze. */
export function gradeOf(comfort: number, catches: number, capped = false): "Gold" | "Silver" | "Bronze" {
  if (capped) return "Bronze";
  if (comfort >= GRADES.gold.comfort && catches <= GRADES.gold.catches) return "Gold";
  if (comfort >= GRADES.silver.comfort && catches <= GRADES.silver.catches) return "Silver";
  return "Bronze";
}

function finishAlighting(s: SimState, data: SimData): void {
  const arriving = s.trips.filter((t) => s.pendingAlighters.includes(t.id) && !s.deliveredRides.includes(t.ride));
  const tips = arriving.reduce((n, t) => n + tipOf(t), 0);
  const fares = arriving.length * FARE;
  s.score += fares + tips; s.wallet += fares + tips;
  s.attempt.fares += fares; s.attempt.tips += tips;
  for (const t of arriving) s.deliveredRides.push(t.ride);
  s.trips = s.trips.filter((t) => !s.pendingAlighters.includes(t.id));
  s.passengers = s.trips.length;
  s.pendingAlighters = [];
  const seats = data.tables.seats;
  s.pendingBoarders = stationPassengers(data, s.leg, s.circuits)
    .filter((p) => !s.trips.some((t) => t.id === p.id) && !s.claimedRides.includes(`${s.circuits}:${p.id}`))
    .slice(0, seats - s.trips.length).map((p) => p.id);
  enter(s, "boarding");
}

function finishBoarding(s: SimState, data: SimData): void {
  const taken = new Set(s.trips.map((t) => t.seat));
  const free: number[] = [];
  for (let i = 0; i < data.tables.seats; i++) if (!taken.has(i)) free.push(i);
  const rows = stationPassengers(data, s.leg, s.circuits);
  s.pendingBoarders.forEach((id, k) => {
    const row = rows.find((r) => r.id === id);
    const ride = `${s.circuits}:${id}`;
    if (!row || s.claimedRides.includes(ride) || s.trips.some((t) => t.id === id) || s.trips.length >= data.tables.seats) return;
    s.trips.push({ id, name: row.name, temperament: row.temperament, seat: free[k] ?? k, ride, origin: s.leg, destination: row.destination,
      fareDistance: fareDistance(data, s.leg, row.destination), journey: { frontiers: {}, distance: 0, comfort: 0, weights: {} } });
    s.claimedRides.push(ride);
  });
  s.pendingBoarders = [];
  s.passengers = s.trips.length;
  s.served++;
  if (!s.visits.includes(s.leg)) s.visits.push(s.leg);
  enter(s, "ready");
  const a = s.attempt;
  const n = data.tables.towns.length;
  const goalReached = a.goal >= n ? a.legs.length >= n && s.leg === a.startStation : a.legs.length >= a.goal;
  const outOfLanterns = a.lanterns <= 0 && a.legs.length > 0;
  if (a.status === "active" && (goalReached || outOfLanterns)) {
    const c = a.distance ? (a.comfort / a.distance) * 100 : 0;
    a.status = "complete";
    a.ended = goalReached ? "goal" : "lanterns";
    a.grade = gradeOf(c, a.catches, !goalReached);
  }
}

function arrive(s: SimState, data: SimData): void {
  const n = data.tables.towns.length;
  const next = (s.leg + 1) % n;
  const a = s.attempt;
  a.lastStation = next;
  if (a.status === "active" && !a.legs.includes(s.leg)) a.legs.push(s.leg);
  if (next === 0 && s.lapStops.length === n) { s.circuits++; s.lapStops = []; }
  if (!s.lapStops.includes(next)) s.lapStops.push(next);
  s.leg = next; s.distance = 0; s.speed = 0; s.roll = 0; s.rollVelocity = 0; s.criticalTime = 0;
  enter(s, "docked");
}

/** One fixed-step update (the original's `WM`). */
export function step(s: SimState, dtIn: number, input: StepInput, data: SimData): SimState {
  const T = data.tables;
  const dt = clamp(dtIn, 0, 0.1);
  s.played += dt;
  s.phaseTime += dt;
  const accelerate = !!input.accelerate, brake = !!input.brake, reverse = !!input.reverse;

  if (s.phase !== "enroute") {
    s.speed = 0;
    s.roll *= Math.exp(-4 * dt); s.rollVelocity = 0; s.trim *= Math.exp(-4 * dt);
    switch (s.phase) {
      case "opening": s.door = clamp(s.phaseTime, 0, 1); if (s.phaseTime >= 1) { s.door = 1; enter(s, "deploying"); } break;
      case "deploying": s.steps = clamp(s.phaseTime / 1.2, 0, 1); if (s.phaseTime >= 1.2) { s.steps = 1; enter(s, "alighting"); } break;
      case "alighting": s.boardingTime = s.phaseTime; if (s.phaseTime >= alightingDuration(s.pendingAlighters.length)) finishAlighting(s, data); break;
      case "boarding": s.boardingTime = s.phaseTime; if (s.phaseTime >= boardingDuration(s.pendingBoarders.length)) finishBoarding(s, data); break;
      case "retracting": s.steps = 1 - clamp(s.phaseTime / 1.3, 0, 1); if (s.phaseTime >= 1.3) { s.steps = 0; enter(s, "closing"); } break;
      case "closing": s.door = 1 - clamp(s.phaseTime, 0, 1); if (s.phaseTime >= 1) { s.door = 0; enter(s, "enroute"); } break;
      default: break;
    }
    return s;
  }
  if (s.door > 0 || s.steps > 0) { s.speed = 0; return s; }

  const p2 = s.speed, h2 = s.leg, u2 = s.distance;
  const here = sampleRoute(data.route, s.leg, s.distance);
  const m2 = s.passengers / 12;
  const g2 = -3.4 * here.grade;
  const v = T.garage;

  const brakeLevel = clamp(input.brakeLevel ?? 1, 0, 1);
  if (brake) { s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - 5 * v.brake * brakeLevel * dt); }
  else if (reverse) { s.speed = Math.max(0, s.speed - 4.5 * v.brake * dt); }
  else if (accelerate) {
    const pace = input.cruisePace ? T.AM[input.cruisePace] : undefined;
    if (s.speed < 0) s.speed = Math.min(0, s.speed + 4.5 * dt);
    else if (pace !== undefined) {
      const target = pace * (1 - 0.1 * m2);
      const a = clamp(0.9 * (target - s.speed), -1.6, (input.cruisePace === "fast" ? 3.2 : 2.2) * v.motor * (1 - 0.22 * m2));
      s.speed = clamp(s.speed + (a + g2) * dt, 0, T.TM);
    } else s.speed = clamp(s.speed + (3.2 * v.motor * (1 - 0.22 * m2) + g2 - 0.16 - 0.013 * s.speed * s.speed) * dt, 0, T.TM);
  } else s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - T.RM * dt);
  if (Math.abs(s.speed) < 1e-8) s.speed = 0;

  const len = (leg: number): number => (data.route.legs[leg] as RouteLeg).length;
  const remaining = len(s.leg) - s.distance;
  if (s.speed > 0 && s.distance > 20) s.speed = Math.min(s.speed, Math.sqrt(3.6 * Math.max(0, remaining)));
  s.distance = s.distance + s.speed * dt;
  const w2 = s.distance;
  const arrived = s.speed >= 0 && s.distance > 20 && len(s.leg) - s.distance < 0.1;
  if (s.distance < 0) { s.leg = (s.leg + T.towns.length - 1) % T.towns.length; s.distance += len(s.leg); }
  if (!arrived && s.distance > len(s.leg)) { s.distance -= len(s.leg); s.leg = (s.leg + 1) % T.towns.length; }

  const M = sampleRoute(data.route, s.leg, s.distance);
  const S2 = clamp(Math.min(s.distance, len(s.leg) - s.distance) / 75, 0, 1);
  s.gust = (0.3 * Math.sin(0.62 * s.played + 0.007 * s.distance + s.leg) + 0.16 * Math.sin(0.21 * s.played + s.leg)) * S2;
  const T2 = Math.abs(s.speed) / T.kM;
  const E2 = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const k2 = clamp(1 + (M.verticalCurvature * s.speed * s.speed) / 9.81, 0.68, 1.35);
  const A2 = (M.curvature * s.speed * s.speed * 0.85 + s.gust * T2) / k2 + (0.09 * Math.sin(1.3 * s.played) + 0.085 * Math.cos(0.43 * s.played + s.leg) + 0.07) * Math.min(1, T2);

  const d = T.difficulty;
  const o3 = E2 === 0 ? 14 : E2 * s.trim < 0 ? 11 : 5;
  s.trim += (E2 - s.trim) * (1 - Math.exp(-dt * o3));
  const damp = d.damping + 0.28 * m2 + (E2 === 0 ? 0.7 : 0);
  const drive = A2 * v.sway * d.disturbance + s.trim * d.steering + s.roll * d.instability;
  s.rollVelocity += ((drive - s.rollVelocity * damp) * dt) / (1 + 0.35 * m2);
  s.rollVelocity = Math.max(-d.maxRate, Math.min(d.maxRate, s.rollVelocity));
  s.roll = Math.max(-0.49, Math.min(0.49, s.roll + s.rollVelocity * dt));

  const critical = Math.abs(s.roll) > 0.34;
  s.criticalTime = critical ? s.criticalTime + dt : Math.max(0, s.criticalTime - dt * 2);
  const harsh = (!accelerate || brake || reverse) && p2 > 4 && (p2 - s.speed) / Math.max(dt, 1e-4) > 3.8;
  const a = s.attempt;
  const fresh = Math.max(0, Math.min(w2, len(h2)) - Math.max(u2, a.frontiers[h2] ?? 0));
  s.comfort = clamp(s.comfort + (Math.abs(s.roll) > 0.22 ? -4 * dt : accelerate ? 0.018 * fresh : 0) - (harsh ? 18 * dt : 0), 0, 100);

  // driving gates ("Perfect line!"): pass a gate steadily inside its speed window for a bonus, otherwise it is spent
  if (a.status === "active") {
    const steadyGate = Math.abs(s.roll) < 0.13 && Math.abs(s.rollVelocity) < 0.24 && !harsh;
    const powered = accelerate && !brake && !reverse;
    for (const g of data.tables.gates[h2] ?? []) {
      if (u2 < g.distance && w2 >= g.distance && fresh > 0 && !s.claims.includes(g.id)) {
        s.claims.push(g.id);
        if (powered && steadyGate && s.speed >= g.min && s.speed <= g.max) { s.score += g.bonus; s.wallet += g.bonus; a.bonuses += g.bonus; }
      }
    }
  }

  // economy progress: streak, comfort, per-trip weights
  if (a.status === "active") {
    const toD = clamp(w2, 0, len(h2)), fromD = clamp(u2, 0, len(h2));
    const h3 = Math.max(0, toD - Math.max(fromD, a.frontiers[h2] ?? 0));
    a.frontiers[h2] = Math.max(a.frontiers[h2] ?? 0, toD);
    if (Math.abs(s.roll) > 0.22 && Math.abs(s.speed) > 0.2) { a.wobble += dt; if (a.wobble >= 0.65) a.streak = 0; } else a.wobble = Math.max(0, a.wobble - 2 * dt);
    const steady = Math.abs(s.roll) < 0.13 && Math.abs(s.rollVelocity) < 0.24 && !harsh;
    const powered = accelerate && !brake && !reverse;
    if (powered && h3 > 0 && s.speed >= MIN_TIP_SPEED && steady) a.streak = Math.min(STREAK_CAP, a.streak + h3);
    const mult = streakMultiplier(s), m3 = clamp(s.comfort / 100, 0, 1);
    a.distance += h3; a.comfort += h3 * m3;
    for (const t of s.trips) {
      const j = t.journey;
      const r4 = Math.max(0, toD - Math.max(fromD, j.frontiers[h2] ?? 0));
      j.frontiers[h2] = Math.max(j.frontiers[h2] ?? 0, toD);
      j.distance += r4;
      const factor = t.seat >= 12 ? m3 : m3;
      const z = temperamentFactor(t.temperament, factor, s.speed, s.roll, s.rollVelocity, harsh, T.temperament);
      j.comfort += r4 * Math.min(1, z);
      j.weights[h2] = (j.weights[h2] ?? 0) + r4 * z * mult * (powered && s.speed >= MIN_TIP_SPEED ? 1 : 0);
    }
  }

  if (s.criticalTime > 1.5) {
    s.speed = Math.max(0, s.speed) * T.CM; s.catches++; s.comfort = Math.max(0, s.comfort - 12);
    let lost = 0;
    for (const t of s.trips) { const before = tipOf(t); t.journey.weights[s.leg] = 0; lost += before - tipOf(t); }
    a.lanterns = Math.max(0, a.lanterns - 1); a.catches++; a.streak = 0; a.wobble = 0; a.lost += lost;
    s.roll *= 0.25; s.rollVelocity = 0; s.criticalTime = 0;
  } else if (arrived) arrive(s, data);
  if (p2 === 0 && s.speed === 0) { s.roll *= Math.exp(-3 * dt); s.rollVelocity *= Math.exp(-3 * dt); }
  return s;
}
