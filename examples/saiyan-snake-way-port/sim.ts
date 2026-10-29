/**
 * Serpentine Sky Run on Aura3D: the outbound-run simulation (PRD §7.2 Phase C, R-25).
 *
 * Pure and deterministic: no engine imports, no clock, no randomness. A port of the original's
 * `qB(dt)` run branch (`ca`, `Na`, `aa`, `Po`, `Sa` plus the helpers they call) over the same
 * state object, in the same evaluation order, from the captured module in
 * `tests/fixtures/crayon/saiyan-snake-way/` (untrusted data, read as text only). Names follow
 * the original's state fields so a recorded reference compares field-for-field.
 *
 * Scope: the outbound leg of the "full" route as the runner, `phase === "run"` from the check-in
 * line to the end of the road. When the run leaves `run` (a fall off the road, running out of
 * days, the jump at the end of the road) `stepRun` stops simulating and leaves the phase set,
 * exactly where the original hands over to its hell / leap / Sky King phases (not ported).
 */

// ---- constants (names from the original's top-level `const`s) ---------------------------------

export const SAMPLE_SPACING = 3; // o
export const ROAD_BEHIND = 150; // n
export const ROAD_AHEAD = 960; // s
export const ROAD_HALF_WIDTH = 7.2; // a
export const LANE_WIDTH = 2.3; // i
export const ROAD_LENGTH = 5600; // r
export const KM_TOTAL = 1e6; // c
export const BASE_SPEED = 32; // l
export const GRAVITY = 62; // d
export const JUMP_SPEED = 22; // p
export const FLY_X_LIMIT = 30; // g
export const FLY_Y_MAX = 80; // h
export const FLY_Y_MIN = -26; // u
export const FLY_STEER = 26; // w
export const FLY_CLIMB = 30; // B
export const FLY_TIME = 20; // M
export const LAND_TIME = 1.7; // f
export const FLY_CATCH_X = 13; // m
export const FLY_EDGE_X = 10.5; // E
export const FLY_TOP_Y = 0.55; // y
export const FLY_BOTTOM_Y = -17.4; // Q
export const KI_DRAIN_FLY = 0.085; // V
export const KI_DRAIN_FLY_OFF_ROAD = 0.075; // P
export const START_DAYS = 365; // W
export const DAYS_PER_SECOND = 0.74; // O
export const END_SLOW_ZONE = 130; // L
export const END_NOFLY_ZONE = 190; // H
export const START_S = -46; // Ps
export const ROAD_TAIL = 26; // z
export const DASH_TIME = 0.5; // Xo
export const DRAIN_KI_RATE = 0.55; // Zo
export const POWER_RAMP = 0.42; // Fs
export const POWER_RATE = 0.72; // Ds
export const SPAWN_STEP = 9;
export const SPAWN_LOOKAHEAD = ROAD_AHEAD - 60;
export const ONI_SPEED: Record<string, number> = { oncoming: -5.5, outbound: 4, herd: -3.2 };
export const ORB_KI = 0.075;

export interface AuraRung {
  readonly mult: number;
  readonly strain: number;
  readonly at?: number;
}
export const RUNGS: readonly AuraRung[] = [
  { mult: 1, strain: -0.34 },
  { mult: 2, strain: 0.085, at: 0 },
  { mult: 3, strain: 0.13, at: 2.2 },
  { mult: 4, strain: 0.19, at: 5 },
  { mult: 10, strain: 0.3, at: 9 },
  { mult: 20, strain: 0.46, at: 14 }
];

export interface Stage {
  readonly from: number;
  readonly name: string;
  readonly sub: string;
  readonly curve: number;
  readonly pitch: number;
  readonly gap: number;
  readonly orb: number;
  readonly obst: number;
  readonly spirit: number;
  readonly sweeper: number;
  readonly oni?: number;
  readonly girth: number;
  readonly bank?: number;
  readonly turnRate?: number;
  readonly powers?: readonly string[];
  readonly hospitality?: boolean;
  readonly slow?: number;
  readonly nofly?: boolean;
  readonly corkscrew?: boolean;
  readonly wind?: boolean;
  readonly strainMul?: number;
  readonly drowse?: boolean;
}

export const STAGES: readonly Stage[] = [
  { from: 0, name: "CHECK-IN", sub: "stamped and pointed at the door", curve: 0.0105, pitch: 3e-3, gap: 0, orb: 0.55, obst: 0, spirit: 0.1, sweeper: 0, girth: 1 },
  { from: 260, name: "THE LONG ROAD", sub: "one million kilometres, no railings", curve: 0.015, pitch: 36e-4, gap: 0.14, orb: 0.8, obst: 0.3, spirit: 0.34, sweeper: 0, oni: 0.22, girth: 1, bank: 0.55, turnRate: 0.55, powers: ["surge", "vitalseed", "stamp"] },
  { from: 1600, name: "TRAFFIC", sub: "the dead, and the cart that sweeps them up", curve: 0.0168, pitch: 43e-4, gap: 0.22, orb: 0.85, obst: 0.45, spirit: 0.55, sweeper: 0.42, oni: 0.55, girth: 1, bank: 0.7, turnRate: 1, powers: ["surge", "pole", "stamp", "puff"] },
  { from: 2680, name: "THE SERPENT HALL", sub: "everything here is free and nothing here is", curve: 44e-4, pitch: 16e-4, gap: 0, orb: 0.3, obst: 0.2, spirit: 0.1, sweeper: 0, girth: 1, hospitality: true, slow: 0.86, powers: ["vitalseed"] },
  { from: 3110, name: "THE COILS", sub: "her body doubles back on itself here", curve: 0.018, pitch: 45e-4, gap: 0.18, orb: 1, obst: 0.4, spirit: 0.2, sweeper: 0, oni: 0.5, girth: 1, nofly: true, bank: 1.15, turnRate: 1.5, powers: ["surge", "surge", "vitalseed"] },
  { from: 3670, name: "THE BROKEN SPINE", sub: "the road is a body and bodies twist", curve: 0.019, pitch: 52e-4, gap: 0.42, orb: 0.95, obst: 0.55, spirit: 0.45, sweeper: 0.22, oni: 0.42, girth: 0.72, corkscrew: true, wind: true, strainMul: 2, bank: 0.85, turnRate: 0.55, powers: ["surge", "pole", "puff", "stamp", "weights"] },
  { from: 4850, name: "THE DROWSE", sub: "he fell asleep, and that is how he fell", curve: 9e-3, pitch: 28e-4, gap: 0.24, orb: 0.45, obst: 0.2, spirit: 0.65, sweeper: 0.18, oni: 0.48, girth: 0.85, bank: 0.35, turnRate: 0.3, drowse: true, powers: ["surge", "vitalseed"] },
  { from: 5410, name: "THE END OF THE ROAD", sub: "the tail stops in open air", curve: 26e-4, pitch: 18e-4, gap: 0, orb: 1.2, obst: 0, spirit: 0.1, sweeper: 0, girth: 0.6 }
];

/** Barrel-roll sections of the road; `jump` places a missing-plate gap inside the section. */
export const ROLL_SECTIONS: readonly { from: number; len: number; dir: number; jump: number }[] = [
  { from: 1120, len: 180, dir: 1, jump: 0 },
  { from: 2220, len: 190, dir: -1, jump: 0.61 },
  { from: 3290, len: 195, dir: 1, jump: 0.58 },
  { from: 3920, len: 220, dir: -1, jump: 0.64 }
];

// ---- math helpers -------------------------------------------------------------------------

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Exponential damping toward `target` (the original's `q`). */
export const damp = (a: number, target: number, rate: number, dt: number): number => lerp(a, target, 1 - Math.exp(-rate * dt));
export const TWO_PI = 2 * Math.PI;
/** The original's position hash `_`. */
export function hash(x: number): number {
  const t = 43758.5453 * Math.sin(127.1 * x);
  return t - Math.floor(t);
}

export function stageAt(s: number): Stage {
  let found = STAGES[0] as Stage;
  for (const stage of STAGES) {
    if (!(s >= stage.from)) break;
    found = stage;
  }
  return found;
}

export const roadFraction = (s: number): number => clamp(s / ROAD_LENGTH, 0, 1);

interface RollResult {
  active: boolean;
  gap: boolean;
}

/** The original's `To`: whether `s` lies inside a roll section and, if so, whether its jump gap is here. */
export function rollAt(s: number): RollResult {
  const out: RollResult = { active: false, gap: false };
  for (const section of ROLL_SECTIONS) {
    if (s < section.from || s > section.from + section.len) continue;
    out.active = true;
    if (section.jump) {
      const at = section.from + section.len * section.jump;
      out.gap = Math.abs(s - at) < 3.8;
    }
    break;
  }
  return out;
}

/** The original's `Yo`: stage-driven random missing plates, one candidate per 56 m of road. */
export function stageGap(s: number, chance: number): boolean {
  if (chance <= 0) return false;
  const cell = Math.floor(s / 56);
  if (hash(13.7 * cell) > chance) return false;
  const local = s - 56 * cell;
  const start = 14 + 16 * hash(5.1 * cell);
  const len = 4.5 + 3 * hash(9.3 * cell);
  return local > start && local < start + len;
}

/** `profileAt(s).gap` for the outbound leg: the flag stored on the road sample at `s`. */
export function sampleGap(s: number): boolean {
  const roll = rollAt(s);
  return roll.active ? roll.gap : stageGap(s, stageAt(s).gap);
}

/** The original's `At(s).gap`: nearest-lower road sample, upper sample past the midpoint. Samples sit on a 3 m grid from -150. */
export function roadGapAt(s: number): boolean {
  const lowerIndex = Math.floor((s - -ROAD_BEHIND) / SAMPLE_SPACING);
  const lower = -ROAD_BEHIND + lowerIndex * SAMPLE_SPACING;
  const t = clamp((s - lower) / SAMPLE_SPACING, 0, 1);
  return t < 0.5 ? sampleGap(lower) : sampleGap(lower + SAMPLE_SPACING);
}

export const laneTilt = (x: number): number => {
  const t = clamp(Math.abs(x) / (ROAD_HALF_WIDTH / 2), 0, 1);
  return 0.48 - 0.18 * t * t;
};

// ---- state ------------------------------------------------------------------------------------

export interface Entity {
  type: string;
  s: number;
  lane: number;
  kind?: string;
  dead: boolean;
  hit?: boolean;
  t: number;
  drift: number;
  swerve: boolean;
  sweepDir: number;
  rel: number;
  spin: number;
  brute: boolean;
  punt?: { t: number; x: number; y: number; vy: number; dir: number; spin: number };
}

export interface RunState {
  phase: string;
  leg: "out" | "back";
  s: number;
  sPrev: number | undefined;
  lane: number;
  laneTarget: number;
  laneX: number;
  laneVel: number;
  y: number;
  vy: number;
  grounded: boolean;
  sliding: number;
  speed: number;
  speedMul: number;
  aura: boolean;
  auraHeld: number;
  auraRung: number;
  auraLatch: boolean;
  auraVis: number;
  surge: "off" | "power" | "on";
  mo: number;
  powerT: number;
  strain: number;
  lockout: number;
  ki: number;
  kiMax: number;
  days: number;
  score: number;
  kiBanked: number;
  stumble: number;
  invuln: number;
  vitalseed: number;
  poleCharges: number;
  puff: number;
  flyX: number;
  flyY: number;
  flyGrace: number;
  flySide: number;
  kiWarn: number;
  weightsOff: boolean;
  checkpointS: number;
  flyFree: boolean;
  canFly: boolean;
  atEnd: boolean;
  endT: number;
  wind: number;
  drowse: number;
  stage: Stage | null;
  stageIndex: number;
  dive: boolean;
  diveHold: number;
  time: number;
  dashT: number;
  dashDir: number;
  saibaToast: boolean;
  drainToast: boolean;
  kiPulse: number;
  kiFlash: number;
  kiCalloutT: number;
  kiChain: number;
  kiChainT: number;
  milestoneIndex: number;
  milestoneT: number;
  milestoneText: string;
  banner: string;
  bannerSub: string;
  bannerT: number;
  toast: string;
  toastT: number;
  shake: number;
  ended: string;
  fallWhy: string;
  fallT: number;
  fallFrom: number;
  wantJump: boolean;
  jumpBuf: number;
  peach: boolean;
  /** Spawn cursor (`Ho`) and spawn counter (`Vo`). */
  spawnS: number;
  spawnN: number;
  ents: Entity[];
}

export function createRun(): RunState {
  return {
    phase: "run", leg: "out", s: START_S, sPrev: undefined, lane: 0, laneTarget: 0, laneX: 0, laneVel: 0, y: 0, vy: 0, grounded: true, sliding: 0,
    speed: BASE_SPEED, speedMul: 1, aura: false, auraHeld: 0, auraRung: 0, auraLatch: false, auraVis: 0, surge: "off", mo: 0.15, powerT: 0, strain: 0,
    lockout: 0, ki: 0.35, kiMax: 1, days: START_DAYS, score: 0, kiBanked: 0, stumble: 0, invuln: 0, vitalseed: 0, poleCharges: 0, puff: 0, flyX: 0,
    flyY: 0, flyGrace: 0, flySide: 1, kiWarn: 0, weightsOff: false, checkpointS: 0, flyFree: false, canFly: false, atEnd: false, endT: 0, wind: 0,
    drowse: 0, stage: null, stageIndex: -1, dive: false, diveHold: 0, time: 0, dashT: 0, dashDir: 0, saibaToast: false, drainToast: false,
    kiPulse: 0, kiFlash: 0, kiCalloutT: 0, kiChain: 0, kiChainT: 0, milestoneIndex: 0, milestoneT: 0, milestoneText: "", banner: "", bannerSub: "",
    bannerT: 0, toast: "", toastT: 0, shake: 0, ended: "", fallWhy: "", fallT: 0, fallFrom: 0, wantJump: false, jumpBuf: 0, peach: false,
    spawnS: 0, spawnN: 0, ents: []
  };
}

/** Keys pressed this step: `taps` are key edges (the original's `Zs`), `held` the keys down (`Xs`). */
export interface RunInput {
  readonly taps?: readonly string[];
  readonly held?: readonly string[];
}

const NO_KEYS: readonly string[] = [];

// ---- original helpers ---------------------------------------------------------------------

const toast = (S: RunState, text: string): void => {
  S.toast = text;
  S.toastT = 2;
};
const banner = (S: RunState, title: string, sub?: string): void => {
  S.banner = title;
  S.bannerSub = sub ?? "";
  S.bannerT = 3.4;
};
const multiplier = (S: RunState): number => (RUNGS[S.auraRung] as AuraRung).mult;

function spendDays(S: RunState, days: number, why?: string): void {
  S.days -= days;
  if (why) toast(S, `${why}   −${days.toFixed(0)} DAYS`);
  if (S.days <= 0) {
    S.days = 0;
    gameOver(S, "TOO LATE");
  }
}

function gameOver(S: RunState, why: string): void {
  if (S.phase !== "over") {
    S.phase = "over";
    S.ended = why;
  }
}

/** The original's `ra`: take a hit (a Vitalseed bean saves it, otherwise stumble and lose days). */
function damage(S: RunState, days: number, why: string): void {
  if (S.invuln > 0) return;
  if (S.vitalseed > 0) {
    S.vitalseed--;
    S.invuln = 1.2;
    toast(S, "VITAL SEED  —  saved");
  } else {
    S.stumble = 0.75;
    S.invuln = 1;
    S.mo = 0.12;
    S.surge = "off";
    S.aura = false;
    S.auraHeld = 0;
    S.shake = Math.min(1, S.shake + 0.7);
    spendDays(S, days, why);
  }
}

/** The original's `va`: fall off the road (a Grapple Staff hooks the edge once). The fall phase itself is not ported. */
function fallOffRoad(S: RunState, why?: string): void {
  if (S.phase !== "run") return;
  if (S.poleCharges > 0) {
    S.poleCharges--;
    S.laneTarget = 0;
    S.laneX = damp(S.laneX, 0, 30, 0.2);
    S.invuln = 1;
    toast(S, "GRAPPLE STAFF  —  hooked the edge");
  } else {
    S.flyFree = false;
    S.phase = "fall";
    S.fallT = 0;
    S.fallFrom = S.s;
    S.aura = false;
    S.auraHeld = 0;
    S.dive = false;
    S.fallWhy = why ?? "OFF THE ROAD";
    S.shake = 1;
  }
}

/** The original's `Ta`: drop through the cloud layer while flying. */
function fallThroughCloud(S: RunState, why?: string): void {
  if (S.phase !== "run") return;
  S.phase = "fall";
  S.fallT = 0;
  S.fallFrom = S.s;
  S.fallWhy = why ?? "THROUGH THE CLOUD";
  S.dive = true;
  S.puff = 0;
  S.flyFree = false;
  S.canFly = false;
  S.vy = -18;
  S.shake = 0.45;
  toast(S, S.fallWhy);
}

function leap(S: RunState): void {
  if (S.phase === "leap") return;
  S.phase = "leap";
  S.atEnd = false;
  S.aura = false;
  S.auraHeld = 0;
  S.auraLatch = false;
  S.surge = "off";
  S.auraRung = 0;
  S.puff = 0;
  banner(S, "THE END OF THE ROAD", "and a jump at the end of it");
}

function endOfRoad(S: RunState): void {
  if (S.atEnd) return;
  S.atEnd = true;
  S.s = ROAD_LENGTH;
  S.y = 0;
  S.vy = 0;
  S.grounded = true;
  S.sliding = 0;
  S.stumble = 0;
  S.wind = 0;
  S.endT = 0;
  S.puff = 0;
  S.flyFree = false;
  S.canFly = false;
  S.auraLatch = false;
  S.aura = false;
  S.auraHeld = 0;
  S.surge = "off";
  S.auraRung = 0;
  S.powerT = 0;
  S.laneTarget = 0;
  banner(S, "ONE MILLION KILOMETRES", "the tail stops here");
}

function laneChange(S: RunState, dir: number): void {
  if (S.phase !== "run") return;
  const before = S.laneTarget;
  S.laneTarget = clamp(S.laneTarget + dir, -1, 1);
  if (S.laneTarget !== before) {
    S.dashT = DASH_TIME;
    S.dashDir = dir > 0 ? 1 : -1;
  }
}

function jump(S: RunState): void {
  if (S.phase === "menu" || S.phase === "over") return;
  if (S.atEnd) {
    leap(S);
    return;
  }
  if (S.grounded && !S.stumble) {
    S.vy = JUMP_SPEED * (S.weightsOff ? 1.06 : 1);
    S.grounded = false;
    S.sliding = 0;
  }
}

function slide(S: RunState): void {
  if (S.atEnd) return;
  if (S.grounded) S.sliding = 0.55;
  else S.vy = Math.min(S.vy, -8);
}

// ---- pickups ----------------------------------------------------------------------------

function pickup(S: RunState, e: Entity): void {
  switch (e.kind || e.type) {
    case "orb":
      S.ki = clamp(S.ki + ORB_KI, 0, S.kiMax);
      S.kiBanked++;
      S.score += 14 * multiplier(S);
      S.kiPulse = 1;
      S.kiFlash = 1;
      S.kiChain = S.kiChainT > 0 ? S.kiChain + 1 : 1;
      S.kiChainT = 1.1;
      S.kiCalloutT = 1.15;
      break;
    case "feast":
      S.score += 60;
      spendDays(S, 2.4, "HOSPITALITY");
      break;
    case "surge":
      S.ki = S.kiMax;
      S.strain = Math.max(0, S.strain - 0.45);
      toast(S, "SPARK RESTORED");
      break;
    case "vitalseed":
      S.vitalseed = Math.min(2, S.vitalseed + 1);
      toast(S, "VITAL SEED");
      break;
    case "puff":
      if (S.puff <= 0) {
        S.flyX = S.laneX;
        S.flyY = Math.max(S.y, 4.6);
      }
      S.puff = Math.max(S.puff, 6);
      S.invuln = Math.max(S.invuln, S.puff + 0.3);
      toast(S, "FLIGHT AURA  —  multiplier reset");
      S.auraHeld = 0;
      break;
    case "pole":
      S.poleCharges = Math.min(2, S.poleCharges + 1);
      toast(S, "GRAPPLE STAFF");
      break;
    case "stamp":
      S.checkpointS = e.s;
      toast(S, "WAYPOINT STAMPED");
      break;
    case "weights":
      if (!S.weightsOff) {
        S.weightsOff = true;
        toast(S, "WEIGHTS OFF  —  +15% speed, no bonus spark");
      }
  }
}

// ---- spawning (`Po` / `Wo`) -----------------------------------------------------------

function spawn(S: RunState, type: string, s: number, lane: number, kind?: string): Entity {
  const e: Entity = { type, s, lane, kind, dead: false, t: 0, drift: 0, swerve: false, sweepDir: 0, rel: 0, spin: hash(s) * TWO_PI, brute: false };
  if (type === "power" || type === "feast") e.kind = type === "feast" ? "feast" : kind;
  S.ents.push(e);
  return e;
}

/** the runner's hazard pair (`bs.hazards`). */
const HAZARDS: readonly [string, string] = ["barrier", "arch"];

function spawnAhead(S: RunState, at: number): void {
  const horizon = at + ROAD_AHEAD - 60;
  while (S.spawnS < horizon) {
    S.spawnS += SPAWN_STEP;
    const n = S.spawnN++;
    const back = S.leg === "back";
    const t3 = back ? ROAD_LENGTH - S.spawnS : S.spawnS;
    if (t3 < 60 || t3 > ROAD_LENGTH - 40) continue;
    const stage = stageAt(t3);
    const h = (k: number): number => hash(7.13 * n + 2.71 * k);
    const scale = 0.62 + 0.72 * roadFraction(t3);
    const lane = (k: number): number => Math.round(2 * h(k)) - 1;
    const roll = rollAt(t3);
    const gap = roll.active ? roll.gap : stageGap(t3, stage.gap);
    if (gap) continue;
    if (!back && stage.hospitality && h(1) < 0.72) {
      spawn(S, "feast", S.spawnS, lane(2));
      continue;
    }
    if (h(3) < stage.orb * (back ? 0.62 : 0.42)) {
      const orbLane = lane(4);
      const count = 4 + Math.floor(4 * h(5));
      for (let k = 0; k < count; k++) spawn(S, "orb", S.spawnS + 5.2 * k, orbLane);
      S.spawnS += 5.2 * count;
      continue;
    }
    if (h(6) < 0.3 * stage.obst * scale) {
      spawn(S, h(7) < 0.5 ? HAZARDS[0] : HAZARDS[1], S.spawnS, lane(8));
      continue;
    }
    if (h(9) < 0.22 * stage.spirit * scale) {
      const soul = spawn(S, "soul", S.spawnS, lane(10));
      soul.drift = 2.4 * (h(11) - 0.5);
      continue;
    }
    if (stage.oni && !back && h(21) < 0.055 * stage.oni * scale) {
      const side = h(22) < 0.5 ? 1 : -1;
      const herd = spawn(S, "oni", S.spawnS, -side, "herd");
      herd.rel = 0;
      for (let k = 0; k < 6; k++) {
        const soul = spawn(S, "soul", S.spawnS + 2.4 * k - 6, -side * (0.85 + 0.55 * h(23 + k)));
        soul.sweepDir = side;
        soul.rel = 0;
      }
      continue;
    }
    if (stage.oni && h(18) < 0.15 * stage.oni * scale) {
      spawn(S, "oni", S.spawnS, lane(19), h(20) < 0.42 ? "outbound" : "oncoming");
      continue;
    }
    if (stage.sweeper && h(12) < 0.1 * stage.sweeper * scale) {
      const sweeper = spawn(S, "sweeper", S.spawnS, lane(13));
      sweeper.swerve = h(14) > 0.45;
      sweeper.rel = -34;
      continue;
    }
    if (!back && stage.powers && h(15) < 0.03) {
      spawn(S, "power", S.spawnS, lane(16), stage.powers[Math.floor(h(17) * stage.powers.length)]);
    }
  }
}

// ---- entities (`Sa`) ------------------------------------------------------------------

const moves = (e: Entity): boolean => e.type === "sweeper" || e.type === "soul" || e.type === "oni";
const effectiveS = (e: Entity): number => (moves(e) ? e.s + e.rel : e.s);

function updateEntities(S: RunState, dt: number): void {
  const powered = S.auraRung > 0 || S.puff > 0;
  const ghost = S.puff > 0 && (Math.abs(S.laneX) > ROAD_HALF_WIDTH / 2 + 0.6 || S.y > 5.2 || S.y < -0.6);
  const ents = S.ents;
  for (let idx = ents.length - 1; idx >= 0; idx--) {
    const e = ents[idx] as Entity;
    const before = effectiveS(e);
    if (e.dead || before < S.s - 40) {
      ents.splice(idx, 1);
      continue;
    }
    e.t += dt;
    let laneX = e.lane * LANE_WIDTH;
    if (e.type === "soul") {
      if (e.sweepDir) {
        e.rel -= 3.5 * dt;
        laneX = clamp(e.lane * LANE_WIDTH + e.sweepDir * e.t * 2.5, -ROAD_HALF_WIDTH / 2 + 0.4, ROAD_HALF_WIDTH / 2 - 0.4);
      } else {
        e.rel -= 16 * dt;
        laneX += 0.85 * Math.sin(1.15 * e.t + e.spin);
      }
    } else if (e.type === "oni") {
      if (e.punt) {
        const p = e.punt;
        p.t += dt;
        p.x += 30 * p.dir * dt;
        p.vy -= 0.5 * GRAVITY * dt;
        p.y += p.vy * dt;
        laneX += p.x;
        if (p.t > 2.4) e.dead = true;
      } else {
        e.rel += dt * (ONI_SPEED[e.kind as string] ?? 0);
      }
      if (e.kind === "oncoming") laneX += 0.35 * Math.sin(0.9 * e.t + e.spin);
    } else if (e.type === "sweeper") {
      e.rel += dt * (14 + (e.swerve ? 4 : 0));
      if (e.swerve && e.rel > 8) laneX += 3 * Math.sin(0.09 * (e.rel - 8));
    }
    const at = effectiveS(e);
    const rel = at - S.s;
    const reach = 1.7 + Math.max(0, S.s - (S.sPrev === undefined ? S.s : S.sPrev));
    if (!(rel < reach && rel > -reach && !e.hit && !ghost)) continue;
    if (!(Math.abs(laneX - S.laneX) < 1.2)) continue;
    const collectible = e.type === "orb" || e.type === "power" || e.type === "feast";
    if (collectible) {
      if (e.type === "orb" && S.y > 4.9) continue;
      e.hit = true;
      e.dead = true;
      pickup(S, e);
    } else if (e.type === "arch") {
      if (S.sliding <= 0 && S.y < 1.4) {
        if (powered) {
          e.dead = true;
          S.score += 90 * multiplier(S);
        } else {
          e.hit = true;
          damage(S, 6, "HIT A RIB");
        }
      }
    } else if (e.type === "spike") {
      if (S.y < 2) {
        if (powered) {
          e.dead = true;
          S.score += 90 * multiplier(S);
        } else {
          e.hit = true;
          damage(S, 6, "CAUGHT A SPIKE");
        }
      }
    } else if (e.type === "drain") {
      if (S.y < 1.6) {
        S.ki = Math.max(0, S.ki - dt * DRAIN_KI_RATE);
        if (!S.drainToast) {
          S.drainToast = true;
          toast(S, "ENERGY DRAIN — GET OFF IT");
        }
      }
    } else if (e.type === "barrier") {
      if (S.y < 1.9) {
        if (powered) {
          e.dead = true;
          S.score += 90 * multiplier(S);
        } else {
          e.hit = true;
          damage(S, 6, "HIT A PLATE");
        }
      }
    } else if (e.type === "soul") {
      if (S.y < 2.6) {
        if (powered) {
          e.dead = true;
          S.score += 40 * multiplier(S);
        } else {
          e.hit = true;
          S.speedMul *= 0.55;
          damage(S, 3, "WALKED THROUGH A SOUL");
        }
      }
    } else if (e.type === "oni") {
      if (S.y < 2.6) {
        if (e.brute && !e.punt && (S.dashT || 0) > 0) {
          e.hit = true;
          e.punt = { t: 0, x: 0, y: 0, vy: 7.5, dir: S.dashDir || (S.laneX < laneX ? 1 : -1), spin: 4 + 4 * hash(e.s) };
          S.score += 170 * multiplier(S);
          if (!S.saibaToast) {
            S.saibaToast = true;
            toast(S, "OFF THE ROAD WITH YOU");
          }
        } else if (powered) {
          e.dead = true;
          S.score += 130 * multiplier(S);
        } else {
          e.hit = true;
          damage(S, 6, e.brute ? "RAN INTO A BRUTE" : e.kind === "herd" ? "BARGED THROUGH THE QUEUE" : "WALKED INTO THE ROAD CREW");
        }
      }
    } else if (e.type === "sweeper" && S.y < 2.4) {
      e.hit = true;
      if (Math.abs(S.laneTarget) >= 1 && Math.abs(S.laneX) > 2.4) fallOffRoad(S, "THE SWEEPER");
      else {
        S.laneTarget = clamp(S.laneTarget + (S.laneX < laneX ? -1 : 1), -1, 1);
        damage(S, 6, "THE SWEEPER");
      }
    }
  }
}

// ---- Surge, ki and strain (`ca`) ---------------------------------------------------

function updateAura(S: RunState, dt: number, keys: { taps: ReadonlySet<string> }): void {
  if (keys.taps.has("ShiftLeft") || keys.taps.has("ShiftRight")) S.auraLatch = !S.auraLatch;
  if (S.lockout > 0 || (S.ki <= 0 && S.leg !== "back")) S.auraLatch = false;
  const latched = S.auraLatch && S.lockout <= 0 && !S.stumble;
  const back = S.leg === "back";
  S.powerT = Math.max(0, S.powerT - dt);
  const inRun = S.phase === "run";
  if (latched && S.surge === "off" && (S.ki > 0.25 || back) && inRun && S.grounded) {
    S.surge = "power";
    S.powerT = (1.07 - POWER_RAMP) / POWER_RATE;
    S.shake = Math.min(1, S.shake + 0.5);
    toast(S, "SURGE");
  }
  if (S.surge === "power" && S.powerT <= 0) {
    S.surge = "on";
    S.mo = 1;
    S.canFly = true;
    toast(S, "FLIGHT UNLOCKED  —  E");
  }
  if (!latched || S.lockout > 0 || (S.ki <= 0 && !back)) S.surge = "off";
  if (latched && (S.ki > 0.02 || back) && inRun && S.surge === "on") {
    if (!S.aura) S.aura = true;
    S.auraHeld += dt;
    S.ki = Math.max(0, S.ki - 0.115 * dt * (back ? 0.15 : 1));
    if (S.ki <= 0) {
      S.aura = false;
      S.auraHeld = 0;
      toast(S, "OUT OF SPARK");
    }
  } else {
    S.aura = false;
    S.auraHeld = 0;
  }
  if (S.ki >= 0.98 * S.kiMax) S.canFly = true;
  let rung = 0;
  if (S.aura) for (let k = 1; k < RUNGS.length; k++) if (S.auraHeld >= ((RUNGS[k] as AuraRung).at as number)) rung = k;
  if (rung !== S.auraRung && rung > 0 && rung > S.auraRung) toast(S, `SURGE ×${(RUNGS[rung] as AuraRung).mult}`);
  S.auraRung = rung;
  const peach = S.peach ? 0.5 : 1;
  const strainScale = peach * ((stageAt(back ? ROAD_LENGTH - S.s : S.s).strainMul || 1) * (back ? 0.13 : 1));
  S.strain = clamp(S.strain + (RUNGS[rung] as AuraRung).strain * dt * strainScale, 0, 1);
  if (S.strain >= 1) {
    S.lockout = 4;
    S.strain = 0.55;
    damage(S, 4, "STRAIN");
  }
  S.lockout = Math.max(0, S.lockout - dt);
  const flying = S.puff > 0;
  const lowFlyOnBack = back && S.surge === "off" && S.phase === "run";
  const visible = S.surge === "power" || S.surge === "on" || flying || lowFlyOnBack ? 1 : 0;
  S.auraVis = damp(S.auraVis === undefined ? 0 : S.auraVis, visible, S.surge === "power" ? 9 : 5, dt);
}

// ---- movement (`Na`) -------------------------------------------------------------------

function movePlayer(S: RunState, dt: number, taps: ReadonlySet<string>, held: ReadonlySet<string>): void {
  if (S.atEnd) {
    S.speed = damp(S.speed, 0, 3.2, dt);
    S.laneX = damp(S.laneX, 0, 6, dt);
    S.y = 0;
    S.vy = 0;
    S.grounded = true;
    S.mo = 0.15;
    S.endT += dt;
    if (taps.has("Space") || taps.has("ArrowUp") || taps.has("KeyW")) jump(S);
    return;
  }
  const flying = S.puff > 0;
  if (!flying) {
    if (taps.has("ArrowLeft") || taps.has("KeyA")) laneChange(S, -1);
    if (taps.has("ArrowRight") || taps.has("KeyD")) laneChange(S, 1);
    if (taps.has("Space") || taps.has("ArrowUp") || taps.has("KeyW")) jump(S);
    if (taps.has("ArrowDown") || taps.has("KeyS")) slide(S);
  }
  const back = S.leg === "back";
  const stage = stageAt(back ? ROAD_LENGTH - S.s : S.s);
  const nearEnd = S.leg === "out" && S.s > ROAD_LENGTH - END_NOFLY_ZONE;
  const noFly = !!stage.nofly || nearEnd;
  if (noFly && S.puff > LAND_TIME) {
    S.flyFree = false;
    S.puff = LAND_TIME;
    toast(S, nearEnd ? "THE ROAD ENDS AHEAD" : "TOO TIGHT TO FLY");
  }
  if (taps.has("KeyE") && noFly) toast(S, nearEnd ? "THE ROAD ENDS AHEAD" : "TOO TIGHT TO FLY");
  if (back) S.canFly = true;
  if (taps.has("KeyE") && !noFly && S.canFly && S.puff <= 0 && S.phase === "run" && S.ki > 0.28) {
    S.puff = FLY_TIME;
    S.flyFree = back;
    S.invuln = FLY_TIME + 0.3;
    S.canFly = back;
    S.ki = Math.max(0, S.ki - 0.12);
    S.flyX = S.laneX;
    S.flyY = Math.max(S.y, 4.6);
    S.flySide = 1;
    toast(S, back ? "FLIGHT  —  E TO LAND" : "FLIGHT");
  } else if (taps.has("KeyE") && S.puff > LAND_TIME) {
    S.flyFree = false;
    S.puff = LAND_TIME;
  }
  const along = back ? ROAD_LENGTH - S.s : S.s;
  const here = stageAt(along);
  const fraction = roadFraction(along);
  S.mo = S.surge === "on" ? 1 : damp(S.mo, 1, 0.17, dt);
  const rungSpeed = (RUNGS[S.auraRung] as AuraRung).mult;
  let target = back
    ? BASE_SPEED * 1.5 * rungSpeed * (here.slow || 1)
    : BASE_SPEED * (0.62 + 0.38 * S.mo) * (1 + 0.52 * fraction) * rungSpeed * (here.slow || 1);
  if (S.weightsOff) target *= 1.15;
  if (S.leg === "out" && ROAD_LENGTH - S.s < END_SLOW_ZONE) target = Math.max(0.34 * BASE_SPEED, target * smooth(clamp((ROAD_LENGTH - S.s) / END_SLOW_ZONE, 0, 1)));
  if (S.puff > 0) target *= Math.abs(S.laneX) > ROAD_HALF_WIDTH ? 0.88 : 1.1;
  if (S.stumble > 0) target *= 0.34;
  if (S.surge === "power") target = 0;
  S.sPrev = S.s;
  S.speed = damp(S.speed, target * (S.speedMul as number), S.surge === "power" ? 9 : 3.4, dt);
  S.speedMul = damp(S.speedMul, 1, 2.2, dt);
  S.s += S.speed * dt;
  if (S.leg === "out" && S.s >= ROAD_LENGTH - 1.2) {
    endOfRoad(S);
    return;
  }
  const laneRate = 13 - 8.5 * S.drowse;
  if (flying) {
    const steer = (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) - (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0);
    S.flyX = clamp(S.flyX + steer * FLY_STEER * dt, -FLY_X_LIMIT, FLY_X_LIMIT);
    S.laneX = damp(S.laneX, S.flyX, 4.5, dt);
  } else {
    const prev = S.laneX;
    S.laneX = damp(S.laneX, S.laneTarget * LANE_WIDTH, S.stumble > 0 ? 4 : laneRate, dt);
    S.laneVel = dt > 0 ? (S.laneX - prev) / dt : 0;
    S.dashT = Math.max(0, (S.dashT || 0) - dt);
  }
  const gravity = flying ? 0 : GRAVITY;
  if (flying) {
    const climb = (held.has("Space") || held.has("ArrowUp") || held.has("KeyW") ? 1 : 0) - (held.has("ArrowDown") || held.has("KeyS") ? 1 : 0);
    S.flyY = clamp(S.flyY + climb * FLY_CLIMB * dt, FLY_Y_MIN, FLY_Y_MAX);
    if (S.puff < LAND_TIME) {
      if (Math.abs(S.flyX) <= FLY_CATCH_X) {
        const k = 1 - S.puff / LAND_TIME;
        S.laneTarget = clamp(Math.round(S.flyX / LANE_WIDTH), -1, 1);
        S.flyX = damp(S.flyX, S.laneTarget * LANE_WIDTH, 2.5 + 11 * k, dt);
        S.flyY = damp(S.flyY, 0.8, 2.5 + 11 * k, dt);
      } else if (S.puff <= 0.1) {
        fallThroughCloud(S, "NOTHING UNDER YOU");
        return;
      }
    }
    if (S.flyY <= FLY_Y_MIN + 0.9 && Math.abs(S.flyX) > FLY_EDGE_X + 2 && (held.has("ArrowDown") || held.has("KeyS"))) {
      S.diveHold += dt;
      if (S.diveHold > 0.3 && S.diveHold < 0.36) toast(S, "HOLD IT  —  GOING THROUGH");
      if (S.diveHold > 0.95) {
        fallThroughCloud(S, "THROUGH THE CLOUD");
        return;
      }
    } else S.diveHold = 0;
    if (Math.abs(S.flyX) >= FLY_EDGE_X) S.flySide = 0;
    else if (S.flyY >= FLY_TOP_Y) S.flySide = 1;
    else if (S.flyY <= FLY_BOTTOM_Y) S.flySide = -1;
    if (Math.abs(S.flyX) < FLY_EDGE_X) {
      if (S.flySide === 1) S.flyY = Math.max(S.flyY, FLY_TOP_Y);
      else if (S.flySide === -1) S.flyY = Math.min(S.flyY, FLY_BOTTOM_Y);
      else S.flySide = S.flyY >= FLY_TOP_Y ? 1 : -1;
    }
    const off = clamp((Math.abs(S.laneX) - ROAD_HALF_WIDTH / 2) / FLY_X_LIMIT, 0, 1);
    S.ki = Math.max(0, S.ki - dt * (KI_DRAIN_FLY + off * KI_DRAIN_FLY_OFF_ROAD) * (back ? 0.16 : 1));
    if (S.ki < 0.26 && S.kiWarn <= 0 && S.puff > LAND_TIME) {
      S.kiWarn = 3;
      toast(S, "SPARK RUNNING LOW  —  GET BACK TO THE ROAD");
    }
    if (S.ki <= 0 && S.puff > LAND_TIME) {
      S.flyFree = false;
      S.puff = LAND_TIME;
      toast(S, "RESERVE EMPTY");
    }
    if (S.flyFree) S.invuln = Math.max(S.invuln, 0.4);
    S.y = damp(S.y, S.flyY, 3.4, dt);
    S.vy = 0;
    S.grounded = false;
    S.flyGrace = 0.6;
  } else {
    S.vy -= gravity * dt;
    S.y += S.vy * dt;
    if (S.y <= 0) {
      S.y = 0;
      S.vy = 0;
      S.grounded = true;
    } else S.grounded = false;
  }
  S.sliding = Math.max(0, S.sliding - dt);
  S.stumble = Math.max(0, S.stumble - dt);
  S.invuln = Math.max(0, S.invuln - dt);
  S.puff = Math.max(0, S.puff - (S.flyFree ? 0 : dt));
  if (S.puff <= 0) S.flyFree = false;
  S.flyGrace = Math.max(0, S.flyGrace - dt);
  S.kiWarn = Math.max(0, S.kiWarn - dt);
  const onGap = roadGapAt(S.s);
  if (S.puff <= 0 && S.flyGrace > 0) {
    S.laneX = damp(S.laneX, S.laneTarget * LANE_WIDTH, 10, dt);
    S.y = damp(S.y, 0.4, 10, dt);
  }
  if (S.grounded && onGap && S.puff <= 0 && S.flyGrace <= 0) fallOffRoad(S, "THE PLATES WERE GONE");
  if (Math.abs(S.laneX) > ROAD_HALF_WIDTH / 2 + 0.9 && S.puff <= 0 && S.flyGrace <= 0) fallOffRoad(S, "OVER THE EDGE");
  spendDays(S, DAYS_PER_SECOND * (here.hospitality ? 2 : 1) * dt);
  S.score += S.speed * dt * multiplier(S) * 0.55;
  S.wind = damp(S.wind, here.wind ? 1 : 0, 1.6, dt);
  if (S.wind > 0.05) {
    const gust = Math.sin(0.9 * S.time) * Math.sin(2.3 * S.time + 1.1);
    S.laneX += gust * S.wind * 2.6 * dt;
  }
  if (here.drowse) S.drowse = clamp(S.drowse + 0.115 * dt, 0, 1);
  else S.drowse = Math.max(0, S.drowse - 0.5 * dt);
  if (S.drowse >= 1) {
    S.drowse = 0.4;
    fallOffRoad(S, "YOU FELL ASLEEP");
  }
  if (S.leg === "out" && here !== S.stage) {
    S.stage = here;
    banner(S, here.name, here.sub);
  }
}

/** Distance milestones (`aa`): only the counters, not the effects. */
function milestones(S: RunState): void {
  const index = Math.floor(10 * clamp(S.s / ROAD_LENGTH, 0, 0.9999));
  if (index <= S.milestoneIndex || index < 1) return;
  S.milestoneIndex = index;
  S.milestoneT = 2.8;
  S.shake = Math.max(S.shake, 0.16);
}

/**
 * One fixed step of the outbound run (the original's `qB`, `run` branch). Does nothing once
 * `phase` is no longer `run`, except the per-step clocks.
 */
export function stepRun(S: RunState, input: RunInput, dt: number): void {
  const taps = new Set(input.taps ?? NO_KEYS);
  const held = new Set(input.held ?? NO_KEYS);
  S.time += dt;
  S.bannerT = Math.max(0, S.bannerT - dt);
  S.toastT = Math.max(0, S.toastT - dt);
  S.milestoneT = Math.max(0, S.milestoneT - dt);
  if (S.phase === "run") {
    updateAura(S, dt, { taps });
    movePlayer(S, dt, taps, held);
    milestones(S);
    spawnAhead(S, S.s);
    updateEntities(S, dt);
    if (S.atEnd && S.bannerT <= 0) {
      S.banner = "PRESS SPACE TO JUMP";
      S.bannerSub = "the world below is waiting";
      S.bannerT = 0.35;
    }
  }
  S.kiPulse = Math.max(0, S.kiPulse - 2.1 * dt);
  S.kiFlash = Math.max(0, S.kiFlash - 3.3 * dt);
  S.kiCalloutT = Math.max(0, S.kiCalloutT - dt);
  S.kiChainT = Math.max(0, S.kiChainT - dt);
}

export const STEP = 1 / 60;

/** The recorded-script segments of the reference tool (`tools/crayon-capture/saiyan-snake-way.ts`). */
export interface InputSegment {
  readonly kind: "idle" | "tap" | "hold";
  readonly frames: number;
  readonly key?: string;
  readonly keys?: readonly string[];
}

/** Expands run-length segments to one `RunInput` per step. */
export function expandScript(segments: readonly InputSegment[]): RunInput[] {
  const out: RunInput[] = [];
  for (const seg of segments) {
    for (let k = 0; k < seg.frames; k++) {
      if (seg.kind === "tap") out.push({ taps: [seg.key as string] });
      else if (seg.kind === "hold") out.push({ held: seg.keys ?? [] });
      else out.push({});
    }
  }
  return out;
}

/** Runs `inputs` from a fresh run, stopping early when the run leaves `run`. Returns the final state and steps taken. */
export function runScript(inputs: readonly RunInput[], dt: number = STEP): { state: RunState; steps: number } {
  const state = createRun();
  let steps = 0;
  for (const input of inputs) {
    stepRun(state, input, dt);
    steps++;
    if (state.phase !== "run" || state.atEnd) break;
  }
  return { state, steps };
}

/** Per-frame snapshot of the fields the reference records (same names, same order as the capture tool). */
export const SNAPSHOT_FIELDS = [
  "phase", "leg", "s", "lane", "laneTarget", "laneX", "laneVel", "y", "vy", "grounded", "sliding", "speed", "speedMul",
  "aura", "auraHeld", "auraRung", "auraLatch", "surge", "mo", "powerT", "strain", "lockout", "ki", "kiMax", "days", "score",
  "stumble", "invuln", "puff", "flyFree", "canFly", "atEnd", "endT", "time", "drowse", "wind", "stageIndex", "kiChain",
  "jumpBuf", "dashT", "peach", "vitalseed", "poleCharges", "checkpointS", "milestoneIndex", "ended"
] as const;

export function snapshot(S: RunState, frame: number): Record<string, unknown> {
  const out: Record<string, unknown> = { frame };
  const src = S as unknown as Record<string, unknown>;
  for (const key of SNAPSHOT_FIELDS) {
    const v = src[key];
    out[key] = typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v;
  }
  out.stage = S.stage ? S.stage.name : null;
  out.ents = S.ents.length;
  return out;
}

/**
 * The QA hook's state: `snapshot` without `lane`. The original never assigned `lane` (it stays 0 while `laneTarget`
 * and `laneX` move), so the recorded reference keeps it for the field-for-field replay, but a live probe should read
 * `laneTarget` (P-1).
 */
export function qaSnapshot(S: RunState, frame: number): Record<string, unknown> {
  const out = snapshot(S, frame);
  delete out.lane;
  return out;
}

/** Lateral position (world units across the road) of an entity at the end of the current step, as `updateEntities` computes it. */
export function entityLateral(e: Entity): number {
  let x = e.lane * LANE_WIDTH;
  if (e.type === "soul") {
    if (e.sweepDir) x = clamp(e.lane * LANE_WIDTH + e.sweepDir * e.t * 2.5, -ROAD_HALF_WIDTH / 2 + 0.4, ROAD_HALF_WIDTH / 2 - 0.4);
    else x += 0.85 * Math.sin(1.15 * e.t + e.spin);
  } else if (e.type === "oni") {
    if (e.punt) x += e.punt.x;
    if (e.kind === "oncoming") x += 0.35 * Math.sin(0.9 * e.t + e.spin);
  } else if (e.type === "sweeper" && e.swerve && e.rel > 8) x += 3 * Math.sin(0.09 * (e.rel - 8));
  return x;
}

/** Float height above the road surface of an entity (orbs and souls bob; hazards sit on the road). */
export function entityHeight(e: Entity): number {
  if (e.type === "orb") return 2.15 + 0.22 * Math.sin(2.2 * e.t + e.spin);
  if (e.type === "soul") return (e.sweepDir ? 1.3 + 0.2 * Math.sin(2.6 * e.t + e.spin) : 1.3 + 0.3 * Math.sin(2.1 * e.t + e.spin));
  if (e.type === "power") return 2 + 0.28 * Math.sin(1.7 * e.t + e.spin);
  if (e.type === "feast") return 1.75 + 0.28 * Math.sin(1.7 * e.t + e.spin);
  if (e.type === "oni" && e.punt) return e.punt.y;
  return 0;
}
