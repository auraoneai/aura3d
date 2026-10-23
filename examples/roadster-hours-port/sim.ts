// Roadster Hours driving/flight simulation. A pure function of (state, input, dt): no rendering, no clock, no
// randomness. Ported statement-for-statement (same evaluation order) from the captured release
// (tests/fixtures/crayon/roadster-hours/PROVENANCE.md, sim-9N4wEPLA.js: C, R, D, k, A, j, N, L, ...).
// The game steps it at a fixed 1/120 s; `dt` is clamped to 0.04 like the original.

import { LEVELS, PIECE_POINTS, actAt, clamp, levelLayout, medalFor, roadProfile, surfaceAt, trafficPiece } from "./course.js";
import type { FootBox, Level, Medal, PieceInfo, SurfaceHit } from "./course.js";
import type { TrafficSpawn } from "./data.js";

export const SIM_STEP = 1 / 120;
const TAU = Math.PI * 2;

export interface Upgrades { reservoir: number; cooling: number; aero: number }
export interface MedalResult { time: number; score: number; medal: Medal; cells: number }
export interface Career {
  version: 1; unlocked: number; credits: number; upgrades: Upgrades;
  results: Record<string, MedalResult>; awards: string[];
  resume: { route: string; level: number; checkpoint: number; time: number; score: number; cells: number[]; crashes: number } | null;
}

export const UPGRADES = [
  { id: "reservoir", name: "Thrust reservoir", desc: "+20% thrust capacity", cost: [2, 4], max: 2 },
  { id: "cooling", name: "Thermal recovery", desc: "Cool faster. Recharge sooner.", cost: [2, 4], max: 2 },
  { id: "aero", name: "Aero stabilizer", desc: "Sharper grip and air control", cost: [2, 4], max: 2 }
] as const;

export function defaultCareer(): Career {
  return { version: 1, unlocked: 0, credits: 0, upgrades: { reservoir: 0, cooling: 0, aero: 0 }, results: {}, awards: [], resume: null };
}

export function buyUpgrade(career: Career, id: keyof Upgrades): boolean {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return false;
  const level = career.upgrades[id];
  if (level >= def.max || career.credits < def.cost[level]!) return false;
  career.credits -= def.cost[level]!;
  career.upgrades[id]++;
  return true;
}

const TRICK = {
  spin: { max: 5.6, accel: 30, points: [400, 700, 1e3] },
  flip: { max: 4.8, accel: 24, points: [500, 800, 1200] },
  combo: 400,
  landing: { roll: { clean: 0.5, hard: 1.5 }, spin: { clean: 0.45, hard: 1.2 }, flip: { clean: 0.45, hard: 1 } }
};
const STEER = { rate: 3.2, back: 5, grip: 10.8, downforce: 5.5, vlat: 8.5, lowSpeed: 0.45, yawCap: 1.6, drift: 0.42 };
const lateralLimit = (v: number, drifting = false): number => Math.min(STEER.vlat * (drifting ? 1.2 : 1), Math.max(0, v) * STEER.lowSpeed);
const NITRO = {
  accel: [0, 16, 24, 30], top: [0, 84, 92, 100], drain: [0, 11, 13, 40], heat: 6, min: 6,
  window: [0.6, 1] as [number, number], grace: 0.22, doubleTap: 0.32, shockwave: 2.5
};
const REWARD = { trick: 8, roll: 8, nearMiss: 6, overTop: 8, lineup: 10, air: 2 };
const CAR = { halfLen: 2.25, halfWid: 0.92, height: 1.25 };

export interface RunInput {
  throttle?: number; brake?: number; steer?: number; thrust?: boolean | number; drift?: boolean | number;
  nitro?: boolean | number; roll?: number; spin?: number; flip?: number; recover?: boolean;
}
export interface RunEvent { type: string; [key: string]: unknown }
export interface TrafficCar extends PieceInfo {
  s: number; l: number; speed: number; piece: string; v: number; end: number; spawn: number; wake: number;
  active: boolean; moving: boolean; passed: boolean; topped: boolean; rel: number | null;
}
export interface RunResult {
  time: number; score: number; medal: Medal; cells: number; crashes: number; cleanLandings: number; airRolls: number;
  spins: number; flips: number; combos: number; lineups: number; vehicles: number; credits: number;
}
export interface Run {
  levelIndex: number; level: Level; phase: "countdown" | "running" | "paused" | "complete"; countdown: number;
  s: number; l: number; h: number; v: number; vy: number; theta: number; wheel: number; slip: number;
  roll: number; rollVelocity: number; pitch: number; spin: number; flip: number; rollRate: number; spinRate: number; flipRate: number;
  thrust: number; capacity: number; heat: number; overheated: boolean; grounded: boolean; time: number; score: number;
  combo: number; comboTime: number; checkpoint: number; nextGate: number; cells: Set<number>; crashes: number;
  airTime: number; driftTime: number; boostHold: number; rollTravel: number; spinTurns: number; flipTurns: number;
  airTricks: string[]; maxHeight: number; maxSpeed: number; cleanLandings: number; airRolls: number; airSpins: number;
  airFlips: number; combos: number; nearMisses: number; lineupsCleared: number; vehiclesCleared: number; overTops: number;
  trailerRides: number; ridden: string[]; wallDistance: number; shortcuts: number; events: RunEvent[]; toast: string | null;
  toastTime: number; recoverTime: number; boosting: boolean; drifting: boolean; act: string; traffic: TrafficCar[];
  lineups: { over: number[]; done: boolean }[]; lastS: number; lastGrounded: boolean; offroadTime: number; upgrades: Upgrades;
  gateMiss: boolean; saveDirty: boolean; nitro: number; nitroTime: number; nitroHeld: boolean; nitroGrace: number;
  nitroWindow: boolean; lastNitroPress: number; scraping: boolean; result?: RunResult; beforePause?: Run["phase"];
}

function createTraffic(spawn: TrafficSpawn): TrafficCar {
  const piece = spawn.piece || "sedan";
  const v = spawn.v || 0;
  const info = trafficPiece(piece, v);
  const end = spawn.end ?? spawn.s + 300;
  return {
    s: spawn.s, l: spawn.l, speed: spawn.speed, piece, v, end, spawn: spawn.s,
    wake: clamp((30 * (end - spawn.s)) / Math.max(1, spawn.speed), 60, 400),
    active: false, moving: false, passed: false, topped: false, rel: null, ...info
  };
}

export function createRun(levelIndex: number, career: Career, resume: Career["resume"] = null): Run {
  const level = LEVELS[levelIndex];
  if (!level || levelIndex > career.unlocked) throw new Error("Level is locked");
  const checkpoint = resume?.checkpoint ?? -1;
  const start = checkpoint >= 0 ? level.gates[checkpoint]!.s + 12 : 8;
  const capacity = 100 + career.upgrades.reservoir * 20;
  return {
    levelIndex, level, phase: "countdown", countdown: 2.7, s: start, l: 0, h: 0, v: 0, vy: 0, theta: 0, wheel: 0, slip: 0,
    roll: 0, rollVelocity: 0, pitch: 0, spin: 0, flip: 0, rollRate: 0, spinRate: 0, flipRate: 0, thrust: capacity, capacity,
    heat: 0, overheated: false, grounded: true, time: resume?.time || 0, score: resume?.score || 0, combo: 1, comboTime: 0,
    checkpoint, nextGate: checkpoint + 1, cells: new Set(resume?.cells || []), crashes: resume?.crashes || 0, airTime: 0,
    driftTime: 0, boostHold: 0, rollTravel: 0, spinTurns: 0, flipTurns: 0, airTricks: [], maxHeight: 0, maxSpeed: 0,
    cleanLandings: 0, airRolls: 0, airSpins: 0, airFlips: 0, combos: 0, nearMisses: 0, lineupsCleared: 0, vehiclesCleared: 0,
    overTops: 0, trailerRides: 0, ridden: [], wallDistance: 0, shortcuts: 0, events: [], toast: null, toastTime: 0,
    recoverTime: 0, boosting: false, drifting: false, act: actAt(level, start).name, traffic: level.traffic.map(createTraffic),
    lineups: levelLayout(level).lineups.map(() => ({ over: [], done: false })), lastS: start, lastGrounded: true, offroadTime: 0,
    upgrades: { ...career.upgrades }, gateMiss: false, saveDirty: false, nitro: 0, nitroTime: 0, nitroHeld: false, nitroGrace: 0,
    nitroWindow: false, lastNitroPress: -9, scraping: false
  };
}

function pushEvent(run: Run, type: string, data: Record<string, unknown> = {}): void {
  run.events.push({ type, ...data });
}

function reward(run: Run, points: number, label: string): void {
  run.score += Math.round(points * run.combo);
  run.combo = clamp(run.combo + 0.25, 1, 5);
  run.comboTime = 5;
  run.toast = label;
  run.toastTime = 1.7;
  pushEvent(run, "reward", { points, label });
}

function addThrust(run: Run, amount: number): void {
  run.thrust = Math.min(run.capacity, run.thrust + amount);
}

function clearAir(run: Run): void {
  run.roll = 0; run.spin = 0; run.flip = 0; run.rollRate = 0; run.spinRate = 0; run.flipRate = 0;
  run.rollTravel = 0; run.spinTurns = 0; run.flipTurns = 0; run.airTricks = [];
}

export function recoverRun(run: Run, reason = "RECOVERED"): void {
  if (run.phase === "complete") return;
  run.crashes++;
  run.score = Math.max(0, run.score - 150);
  run.combo = 1; run.comboTime = 0;
  run.s = run.checkpoint >= 0 ? run.level.gates[run.checkpoint]!.s + 12 : 8;
  run.l = 0; run.h = 0; run.v = 8; run.vy = 0; run.theta = 0; run.wheel = 0; run.slip = 0; run.nitro = 0;
  clearAir(run);
  run.heat = 10; run.thrust = run.capacity; run.overheated = false; run.grounded = true; run.recoverTime = 0.75;
  run.airTime = 0; run.gateMiss = false; run.offroadTime = 0;
  for (const car of run.traffic || []) {
    car.rel = null;
    if (car.spawn > run.s - 20) { car.s = car.spawn; car.active = false; car.moving = false; car.passed = false; car.topped = false; }
  }
  if (run.lineups) {
    levelLayout(run.level).lineups.forEach((lineup, i) => {
      if (lineup.s1 > run.s - 5) run.lineups[i] = { over: [], done: false };
    });
  }
  run.toast = reason; run.toastTime = 2;
  pushEvent(run, "recover", { reason });
  run.saveDirty = true;
}

export function resumeOf(run: Run): Career["resume"] {
  return run.checkpoint < 0 ? null : {
    route: run.level.id, level: run.levelIndex, checkpoint: run.checkpoint, time: run.time, score: run.score,
    cells: [...run.cells], crashes: run.crashes
  };
}

function finishRun(run: Run, career: Career): boolean {
  if (run.phase === "complete" || run.nextGate < run.level.gates.length) return false;
  run.phase = "complete";
  const medal = medalFor(run.level, run.time, run.score, run.cells.size);
  const previous = career.results[run.level.id];
  const stats = {
    time: run.time, score: run.score, medal, cells: run.cells.size, crashes: run.crashes, cleanLandings: run.cleanLandings,
    airRolls: run.airRolls, spins: run.airSpins, flips: run.airFlips, combos: run.combos, lineups: run.lineupsCleared,
    vehicles: run.vehiclesCleared
  };
  const rank: Record<string, number> = { bronze: 1, silver: 2, gold: 3 };
  const previousRank = (previous && rank[previous.medal]) || 0;
  career.results[run.level.id] = {
    time: Math.min(previous?.time ?? Infinity, run.time), score: Math.max(previous?.score ?? 0, run.score),
    medal: previousRank > rank[medal]! ? previous!.medal : medal, cells: Math.max(previous?.cells ?? 0, run.cells.size)
  };
  let credits = 0;
  for (const [kind, value] of [["clear", 2], ["silver", 1], ["gold", 1], ["cells", 1]] as const) {
    const earned = kind === "clear" || (kind === "silver" && rank[medal]! >= 2) || (kind === "gold" && medal === "gold")
      || (kind === "cells" && run.cells.size >= Math.ceil(run.level.cells.length * 0.6));
    const key = `${run.level.id}:${kind}`;
    if (earned && !career.awards.includes(key)) { career.awards.push(key); credits += value; }
  }
  career.credits += credits;
  career.unlocked = Math.max(career.unlocked, run.level.unlocks ?? 0);
  career.resume = null;
  run.result = { ...stats, credits };
  pushEvent(run, "finish", { ...run.result });
  return true;
}

function surfaceUnder(run: Run, s: number, l: number, h: number = run.h): SurfaceHit | null {
  let hit = surfaceAt(run.level, s, l);
  const check = (roofs: FootBox[], ds: number, dl: number, roof: string): void => {
    for (const c of roofs) {
      if (s > c.s0 + ds - 0.4 && s < c.s1 + ds + 0.4 && l > c.l0 + dl - 0.6 && l < c.l1 + dl + 0.6 && h >= c.y1 - 0.6 && (!hit || c.y1 > hit.height)) {
        hit = { height: c.y1, shortcut: false, roof };
      }
    }
  };
  for (const vehicle of levelLayout(run.level).vehicles) {
    if (vehicle.roofs.length && s > vehicle.s0 - 1 && s < vehicle.s1 + 1) check(vehicle.roofs, 0, 0, "p" + vehicle.index);
  }
  if (run.traffic) {
    run.traffic.forEach((car, i) => {
      if (car.roofs.length && Math.abs(s - car.s) < car.halfLen + 1) check(car.roofs, car.s, car.l, "t" + i);
    });
  }
  return hit;
}

function hitsBox(run: Run, box: FootBox, ds = 0, dl = 0): boolean {
  return run.s + CAR.halfLen - 0.3 > box.s0 + ds && run.s - CAR.halfLen + 0.3 < box.s1 + ds
    && run.l + CAR.halfWid - 0.15 > box.l0 + dl && run.l - CAR.halfWid + 0.15 < box.l1 + dl
    && run.h < box.y1 - 0.35 && run.h + CAR.height > box.y0;
}

function noteTrick(run: Run, name: string): void {
  if (!run.airTricks.includes(name)) run.airTricks.push(name);
}

type RotationAxis = "spin" | "flip";
function rotateAxis(run: Run, axis: RotationAxis, input: number, dt: number, params: { max: number; accel: number }, aero: number): void {
  const rateKey = `${axis}Rate` as "spinRate" | "flipRate";
  const angle = run[axis];
  let rate = run[rateKey];
  if (input) rate += clamp(input * params.max - rate, -params.accel * dt, params.accel * dt);
  else {
    const target = Math.round((angle + rate * 0.08) / TAU) * TAU;
    rate += ((target - angle) * (3 + aero) - rate) * Math.min(1, dt * 10);
  }
  run[axis] = angle + rate * dt;
  run[rateKey] = rate;
}

const spinLabel = (turns: number): string => `${turns * 360} SPIN`;
const flipLabel = (turns: number, front: boolean): string =>
  `${["", "", "DOUBLE ", "TRIPLE "][turns] ?? turns + "× "}${front ? "FRONT" : "BACK"} FLIP`;

function launch(run: Run, kicker: SurfaceHit["kicker"] | null): void {
  run.airTime = 0; run.rollTravel = 0; run.spin = 0; run.flip = 0; run.spinRate = 0; run.flipRate = 0;
  run.spinTurns = 0; run.flipTurns = 0; run.airTricks = [];
  const lineup = kicker ? levelLayout(run.level).lineups.find((l) => l.kicker === kicker) : null;
  pushEvent(run, "launch", lineup ? { kicker: true, lineup: lineup.index, big: lineup.big, count: lineup.count } : {});
}

function nitroStep(run: Run, held: boolean, dt: number): void {
  const pressed = held && !run.nitroHeld;
  const released = !held && run.nitroHeld;
  run.nitroHeld = held;
  run.nitroTime += dt;
  if (pressed) {
    if (run.time - run.lastNitroPress < NITRO.doubleTap && run.thrust >= run.capacity * 0.97 && run.nitro < 3) {
      run.nitro = 3; run.nitroTime = 0; run.toast = "SHOCKWAVE"; run.toastTime = 1.2;
      pushEvent(run, "nitro", { level: 3 });
    } else if (run.nitro === 1 && run.nitroTime >= NITRO.window[0] && run.nitroTime <= NITRO.window[1]) {
      run.nitro = 2;
      pushEvent(run, "nitro", { level: 2 });
      reward(run, 150, "PERFECT NITRO");
    } else if (!run.nitro && run.thrust > NITRO.min && !run.overheated) {
      run.nitro = 1; run.nitroTime = 0;
      pushEvent(run, "nitro", { level: 1 });
    }
    run.lastNitroPress = run.time;
  }
  if (released && run.nitro && run.nitro < 3) run.nitroGrace = NITRO.grace;
  if (!held && run.nitro && run.nitro < 3) {
    run.nitroGrace -= dt;
    if (run.nitroGrace <= 0) run.nitro = 0;
  }
  if (run.nitro === 3 && run.nitroTime > NITRO.shockwave) run.nitro = 0;
  if (run.nitro) {
    run.thrust = Math.max(0, run.thrust - dt * NITRO.drain[run.nitro]!);
    run.heat = clamp(run.heat + dt * NITRO.heat, 0, 100);
    if (run.thrust <= 0 || run.overheated) run.nitro = 0;
  }
  run.nitroWindow = run.nitro === 1 && run.nitroTime >= NITRO.window[0] && run.nitroTime <= NITRO.window[1];
}

/** Advance one simulation step. Mirrors the original `R(state, input, dt, career)`. */
export function stepRun(run: Run, input: RunInput, dtIn: number, career: Career): void {
  const dt = clamp(dtIn, 0, 0.04);
  run.events = [];
  if (run.phase === "paused" || run.phase === "complete") return;
  if (run.phase === "countdown") {
    run.countdown -= dt;
    if (run.countdown <= 0) { run.phase = "running"; pushEvent(run, "go"); }
    return;
  }
  run.time += dt;
  run.toastTime = Math.max(0, run.toastTime - dt);
  run.recoverTime = Math.max(0, run.recoverTime - dt);
  if (input.recover) { recoverRun(run); return; }
  run.comboTime -= dt;
  if (run.comboTime <= 0) run.combo = Math.max(1, run.combo - dt * 0.8);
  const level = run.level;
  const prevS = run.s;
  const prevL = run.l;
  const prevH = run.h;
  const wasGrounded = run.grounded;
  const profile = roadProfile(level, run.s);
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  nitroStep(run, !!input.nitro, dt);
  const thrusting = !!input.thrust && run.thrust > 0.15 && !run.overheated;
  run.boosting = thrusting;
  if (thrusting) {
    run.thrust = Math.max(0, run.thrust - dt * (run.grounded ? 14 : 19));
    run.heat = clamp(run.heat + dt * (run.grounded ? 20 : 25), 0, 100);
  } else {
    run.heat = Math.max(0, run.heat - dt * (run.grounded ? 27 : 11) * (1 + run.upgrades.cooling * 0.3) * (run.nitro ? 0.4 : 1));
    if (run.grounded && !run.nitro) run.thrust = Math.min(run.capacity, run.thrust + dt * (12 + run.upgrades.cooling * 4));
  }
  if (!run.grounded) addThrust(run, dt * REWARD.air);
  if (run.heat >= 100) { run.overheated = true; run.boosting = false; pushEvent(run, "overheat"); }
  if (run.overheated && run.heat < 38) run.overheated = false;
  run.boostHold = run.boosting && run.grounded ? run.boostHold + dt : 0;
  const boosting = run.boosting;
  const aeroGrip = 1 + run.upgrades.aero * 0.12;
  run.drifting = !!input.drift && run.grounded && run.v > 14 && Math.abs(steer) > 0.1;
  let accel = (run.grounded ? 17 : 7) * throttle - (run.grounded ? 30 : 11) * brake - 1.3 - run.v * run.v * 24e-4;
  if (boosting) accel += run.grounded ? 20 : 9;
  if (input.drift) accel -= run.grounded ? 2 : 9;
  if (run.nitro) accel += NITRO.accel[run.nitro]! * (run.grounded ? 1 : 0.5);
  run.v = clamp(run.v + accel * dt, 0, Math.max(boosting ? 74 : 61, NITRO.top[run.nitro]!));
  const wheelRate = Math.abs(steer) < Math.abs(run.wheel) || steer * run.wheel < 0 ? STEER.back : STEER.rate;
  run.wheel += clamp(steer - run.wheel, -wheelRate * dt, wheelRate * dt);
  if (run.grounded) {
    const speed = Math.max(run.v, 1);
    const grip = (STEER.grip + STEER.downforce * (run.v / 74) ** 2) * aeroGrip * (run.drifting ? 0.85 : 1);
    const target = Math.asin(clamp((run.wheel * lateralLimit(run.v, run.drifting)) / speed, -0.9, 0.9));
    const yawRate = Math.min(STEER.yawCap, grip / speed);
    run.theta += clamp(target - run.theta, -yawRate * dt, yawRate * dt);
    run.slip += ((run.drifting ? run.wheel * STEER.drift : 0) - run.slip) * Math.min(1, dt * 3.5);
  } else {
    run.slip += (0 - run.slip) * Math.min(1, dt * 3);
    const side = Math.sign(run.l);
    if (!level.shortcuts.some((sc) => run.s > sc.start - 80 && run.s < sc.end && Math.abs(run.l - sc.l) < 10)
      && Math.abs(run.l) > level.width - 2.5 && run.theta * side > -0.04) {
      run.theta -= side * Math.min(0.9 * dt, run.theta * side + 0.04);
    }
  }
  run.s += (run.v * Math.cos(run.theta) * dt) / Math.sqrt(1 + profile.dx * profile.dx);
  run.l += Math.sin(run.theta) * run.v * dt;
  if (run.grounded) {
    const edge = level.width - 1.15;
    if (!level.shortcuts.some((sc) => run.s >= sc.start && run.s <= sc.end && Math.abs(run.l - sc.l) < 5.5)
      && Math.abs(run.l) > edge && Math.abs(prevL) <= edge + 0.05 && !level.gaps.some(([a, b]) => run.s > a - 3 && run.s < b + 1)) {
      const side = Math.sign(run.l);
      run.l = side * edge;
      if (run.theta * side > 0) run.theta *= 0.25;
      run.wheel *= 0.5;
      run.v = Math.max(8, run.v - dt * (10 + run.v * 0.25));
      if (!run.scraping) pushEvent(run, "scrape");
      run.scraping = true;
    } else run.scraping = false;
  }
  if (!run.grounded) run.l += Math.sin(run.time * 0.8 + run.s * 3e-3) * level.wind * dt;
  const before = surfaceUnder(run, prevS, prevL, prevH);
  const under = surfaceUnder(run, run.s, run.l, prevH);
  const here = roadProfile(level, run.s);
  if (wasGrounded && (!under || under.height < run.h - 0.2)) {
    const kicker = before?.kicker;
    const offKicker = !!kicker && run.s >= kicker.s + kicker.len;
    run.grounded = false;
    run.vy = offKicker
      ? (boosting ? 4.5 + run.v * kicker!.lift * 1.1 : 2.8 + run.v * kicker!.lift)
      : 2.8 + (profile.ramp > 0 ? run.v * 0.13 : 0);
    if (offKicker) run.boostHold = 0;
    launch(run, offKicker ? kicker : null);
  }
  if (run.grounded && under) {
    run.h = under.height; run.vy = 0; run.airTime = 0;
    if (boosting && !under.kicker && Math.abs(here.bank) < 0.6 && (profile.ramp > 1 || run.boostHold > 0.34)) {
      run.grounded = false;
      run.vy = profile.ramp > 1 ? 8 + run.v * 0.09 : 7;
      run.boostHold = 0;
      launch(run, null);
    }
    if (Math.abs(here.bank) > 0.7) run.wallDistance += run.v * dt;
    if (run.drifting) {
      run.driftTime += dt;
      run.score += dt * run.v * 0.9 * run.combo;
      if (run.driftTime > 0.8) { run.toast = "DRIFT CHARGE"; run.toastTime = 0.3; run.thrust = Math.min(run.capacity, run.thrust + dt * 8); }
    } else run.driftTime = 0;
  } else {
    run.airTime += dt;
    run.vy += (-16 + (boosting ? 24 : 0) - brake * 12) * dt;
    run.vy = clamp(run.vy, -28, 18);
    run.h += run.vy * dt - (here.y - profile.y);
    run.maxHeight = Math.max(run.maxHeight, run.h);
    if (under && run.h <= under.height && prevH >= under.height - 1.2 && run.vy <= 2) {
      const angDist = (a: number): number => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      const land = TRICK.landing;
      const rollOff = angDist(run.roll);
      const spinOff = angDist(run.spin);
      const flipOff = angDist(run.flip);
      if (run.vy < -18 && run.thrust > 10 && !run.overheated) { run.thrust -= 10; run.vy *= 0.55; pushEvent(run, "landingFlare"); }
      if (run.vy < -23 || rollOff > land.roll.hard || spinOff > land.spin.hard || flipOff > land.flip.hard) {
        recoverRun(run, "HARD LANDING");
        return;
      }
      run.grounded = true; run.h = under.height; run.vy = 0; run.roll = 0; run.spin = 0; run.flip = 0;
      if (run.airTime > 0.5) {
        const clean = rollOff < land.roll.clean && spinOff < land.spin.clean && flipOff < land.flip.clean;
        reward(run, clean ? 260 : 100, clean ? "CLEAN LANDING" : "LANDED");
        run.cleanLandings += +!!clean;
        run.thrust = Math.min(run.capacity, run.thrust + (clean ? 16 : 4));
        if (clean) run.v = Math.min(run.v + 4, 74);
        pushEvent(run, "land", { clean, strength: clamp(run.airTime / 3, 0.2, 1), roof: !!under.roof });
        if (under.shortcut) { run.shortcuts++; reward(run, 220, "ROOFLINE CUT"); }
        if (under.roof && !run.ridden.includes(under.roof)) {
          run.ridden.push(under.roof); run.trailerRides++;
          reward(run, 300, "TRAILER RIDE");
          pushEvent(run, "trailer");
        }
        if (run.airTricks.length >= 2) {
          const n = run.airTricks.length;
          run.combos++;
          reward(run, (TRICK.combo * n * (n - 1)) / 2, "COMBO · " + run.airTricks.map((t) => t.toUpperCase()).join(" + "));
          pushEvent(run, "combo", { count: n, tricks: [...run.airTricks] });
        }
      }
      run.airTime = 0; run.airTricks = [];
    } else if (under?.kicker && run.h < under.height) run.h = under.height;
  }
  if (run.grounded) {
    run.roll = 0; run.spin = 0; run.flip = 0; run.rollRate = 0; run.spinRate = 0; run.flipRate = 0;
  } else {
    const rollInput = clamp(input.roll || 0, -1, 1);
    const rollBefore = run.roll;
    if (rollInput) {
      const delta = rollInput * 3.4 * dt;
      run.roll += delta;
      run.rollTravel += Math.abs(delta);
      if (run.rollTravel >= TAU) {
        run.rollTravel -= TAU; run.airRolls++;
        reward(run, 450, "AIR ROLL");
        addThrust(run, REWARD.roll);
        pushEvent(run, "roll");
        noteTrick(run, "roll");
      }
    } else {
      const target = Math.round(run.roll / TAU) * TAU;
      run.roll += (target - run.roll) * Math.min(1, dt * (2.5 + run.upgrades.aero));
    }
    run.rollRate = dt > 0 ? (run.roll - rollBefore) / dt : 0;
    rotateAxis(run, "spin", clamp(input.spin || 0, -1, 1), dt, TRICK.spin, run.upgrades.aero);
    rotateAxis(run, "flip", clamp(input.flip || 0, -1, 1), dt, TRICK.flip, run.upgrades.aero);
    const spinTurns = Math.floor((Math.abs(run.spin) + 0.3) / TAU);
    if (spinTurns > run.spinTurns) {
      run.spinTurns = spinTurns; run.airSpins++;
      reward(run, TRICK.spin.points[Math.min(spinTurns, 3) - 1]! + Math.max(0, spinTurns - 3) * 300, spinLabel(spinTurns));
      addThrust(run, REWARD.trick);
      pushEvent(run, "trick", { kind: "spin", turns: spinTurns, dir: Math.sign(run.spin) });
      noteTrick(run, "spin");
    }
    const flipTurns = Math.floor((Math.abs(run.flip) + 0.3) / TAU);
    if (flipTurns > run.flipTurns) {
      run.flipTurns = flipTurns; run.airFlips++;
      reward(run, TRICK.flip.points[Math.min(flipTurns, 3) - 1]! + Math.max(0, flipTurns - 3) * 400, flipLabel(flipTurns, run.flip > 0));
      addThrust(run, REWARD.trick);
      pushEvent(run, "trick", { kind: "flip", turns: flipTurns, dir: Math.sign(run.flip) });
      noteTrick(run, "flip");
    }
  }
  if (run.h < -38 || Math.abs(run.l) > 68 || (Math.abs(run.l) > level.width + 1 && run.h < -3)) {
    recoverRun(run, "RETURN TO RELAY");
    return;
  }
  if (!under && run.grounded) run.grounded = false;
  for (let i = 0; i < level.cells.length; i++) {
    const cell = level.cells[i]!;
    if (!run.cells.has(i) && Math.abs(run.s - cell.s) < 3.5 && Math.abs(run.l - cell.l) < 2.4 && Math.abs(run.h - cell.h) < 2.7) {
      run.cells.add(i);
      reward(run, 200, "DATA CELL");
      run.thrust = Math.min(run.capacity, run.thrust + 12);
      pushEvent(run, "cell", { index: i });
      run.saveDirty = true;
    }
  }
  for (const car of run.traffic) {
    if (!car.active && run.s > car.spawn - car.wake) car.active = true;
    car.moving = car.active && car.s < car.end;
    if (car.moving) car.s = Math.min(car.end, car.s + car.speed * dt);
    if (run.v > (car.moving ? car.speed : 0) + 5 && Math.abs(run.s - car.s) < car.halfLen + 3 && car.boxes.some((b) => hitsBox(run, b, car.s, car.l))) {
      recoverRun(run, "TRAFFIC IMPACT");
      return;
    }
    const rel = run.s - car.s;
    const previousRel = car.rel;
    car.rel = rel;
    if (previousRel == null || !(previousRel < 0 && rel >= 0)) continue;
    const lateral = Math.abs(car.l - run.l);
    const clear = lateral - car.halfWid - CAR.halfWid;
    if (!car.topped && lateral < car.halfWid + 0.5 && run.h >= car.hgt - 0.35) {
      car.topped = true; run.overTops++;
      reward(run, 200 + (PIECE_POINTS[car.piece] || 100), "OVER THE TOP");
      addThrust(run, REWARD.overTop);
      pushEvent(run, "hop", { piece: car.piece });
    } else if (!car.passed && clear >= 0 && clear < 2.7 && run.h < 2) {
      car.passed = true; run.nearMisses++;
      reward(run, 120, "CLOSE PASS");
      addThrust(run, REWARD.nearMiss);
      pushEvent(run, "closePass", { clear });
    }
  }
  const layout = levelLayout(level);
  for (const vehicle of layout.vehicles) {
    if (run.s > vehicle.s0 - 3 && run.s < vehicle.s1 + 3 && Math.abs(run.l - (vehicle.l0 + vehicle.l1) / 2) < (vehicle.l1 - vehicle.l0) / 2 + 2
      && vehicle.boxes.some((b) => hitsBox(run, b))) {
      recoverRun(run, "VEHICLE IMPACT");
      return;
    }
  }
  layout.lineups.forEach((lineup, index) => {
    const progress = run.lineups[index];
    if (!progress || progress.done || run.s < lineup.s0 - 3) return;
    lineup.rows.forEach((row, rowIndex) => {
      if (!progress.over.includes(rowIndex) && run.s > row.s0 - 0.5 && run.s < row.s1 + 0.5 && run.l > row.l0 - 0.6 && run.l < row.l1 + 0.6 && run.h >= row.top - 0.35) {
        progress.over.push(rowIndex);
      }
    });
    if (run.s <= lineup.s1 + 1.5) return;
    progress.done = true;
    const cleared = progress.over.map((i) => lineup.rows[i]!);
    const count = cleared.reduce((sum, r) => sum + r.count, 0);
    if (!count) return;
    const all = progress.over.length === lineup.rows.length;
    const points = Math.round(cleared.reduce((sum, r) => sum + r.points, 0) * (all ? 1.25 : 1));
    run.vehiclesCleared += count;
    if (all) run.lineupsCleared++;
    reward(run, points, all && lineup.label ? lineup.label : "LINEUP CLEAR · " + count);
    addThrust(run, REWARD.lineup);
    pushEvent(run, "lineup", { index, count, all, big: lineup.big });
  });
  for (const hazard of level.hazards) {
    if ((hazard.type !== "vent" || Math.sin(run.time * 1.6 + hazard.s) > -0.35) && Math.abs(run.s - hazard.s) < 2.5
      && Math.abs(run.l - hazard.l) < hazard.r + 1 && run.h < (hazard.type === "vent" ? 5 : 1.5)) {
      run.v = Math.max(5, run.v - 15);
      run.l += run.l > hazard.l ? 1.8 : -1.8;
      run.heat = Math.min(98, run.heat + 15);
      run.combo = 1;
      run.toast = hazard.type === "vent" ? "VENT TURBULENCE" : "BARRIER HIT";
      run.toastTime = 1.4;
      pushEvent(run, "impact");
    }
  }
  const gate = level.gates[run.nextGate];
  if (gate && prevS < gate.s && run.s >= gate.s) {
    if (Math.abs(run.l - gate.l) < level.width - 1 && run.h >= -0.5 && run.h < (gate.ceiling ?? 60)) {
      run.checkpoint = run.nextGate++;
      reward(run, 350, "RELAY " + run.nextGate + " / " + level.gates.length);
      run.saveDirty = true;
      pushEvent(run, "checkpoint", { index: run.checkpoint });
    } else {
      run.gateMiss = true;
      run.toast = "MISSED RELAY · R TO RECOVER";
      run.toastTime = 5;
    }
  }
  if (gate && run.s > gate.s + 55 && run.nextGate === run.checkpoint + 1) {
    recoverRun(run, "MISSED RELAY");
    return;
  }
  if (run.s >= level.length) {
    if (run.nextGate >= level.gates.length) { reward(run, 500, "ROUTE COMPLETE"); finishRun(run, career); }
    else recoverRun(run, "RELAYS REQUIRED");
  }
  run.maxSpeed = Math.max(run.maxSpeed, run.v);
  run.lastS = prevS;
  run.lastGrounded = wasGrounded;
  run.act = actAt(level, run.s).name;
}
