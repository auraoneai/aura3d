/**
 * Aura Diamond 3D: the pure rules and field layout, kept out of the `boot()` closure so they can be unit tested
 * (`tests/unit/aura-diamond/rules.test.ts`). Nothing in this file touches the engine or the DOM.
 *
 * - Pitch flight, the strike zone and the called-pitch rule.
 * - Swing timing: the error between the bat's arrival and the ball's arrival at the contact plane.
 * - Batted-ball integration (one fixed step shared by the landing prediction and the live flight).
 * - Count, outs, half-inning ends, mercy rule, walk-off, sacrifice fly.
 * - The World Classic bracket.
 * - Set-dressing placement relative to each park's fence.
 */

export type Vec3 = [number, number, number];

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Deterministic 32-bit LCG, the same family as the other showcase routes. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/* ------------------------------------------------------------------ *
 *  Field geometry (metres)                                            *
 * ------------------------------------------------------------------ */

export const MOUND_Z = -16.5;
export const MOUND_TOP = 0.28;
export const RELEASE_PT: Vec3 = [0.42, MOUND_TOP + 1.62, MOUND_Z + 0.6];
export const ZONE_HW = 0.56;
export const ZONE_CY = 1.05;
export const ZONE_HH = 0.55;
export const FOUL_DEG = 45;
/** Pitch progress when the ball reaches the bat's contact plane (z about 0.32). */
export const CONTACT_PLANE_T = 1 - 0.32 / Math.abs(RELEASE_PT[2]);
/** Windup length before the pitch releases into flight. */
export const WINDUP_RELEASE_T = 0.52;
/** A player's swing: seconds from the key press to the bat reaching the contact plane. */
export const PLAYER_SWING_PRE = 0.16;
/** Timing error beyond which a swing misses outright (seconds). */
export const WHIFF_WINDOW = 0.155;
/** Fixed simulation step (seconds). The live flight and the landing prediction use the same step. */
export const SIM_STEP = 1 / 120;

export type ParkId = "sandlot" | "skyline" | "canyon" | "ivy" | "dome" | "lunar";

export interface ParkSpec {
  readonly id: ParkId;
  readonly name: string;
  readonly short: string;
  readonly look: string;
  readonly grass: string;
  readonly grassAlt: string;
  readonly dirt: string;
  readonly wall: string;
  readonly wallTop: string;
  readonly wallH: number;
  readonly fenceCorner: number;
  readonly fenceCenter: number;
  readonly fenceSegments: number;
  readonly gravity: number;
  readonly flood: boolean;
  readonly night: boolean;
  readonly tag: string;
}

export const PARKS: Record<ParkId, ParkSpec> = {
  sandlot: { id: "sandlot", name: "HARBOR SANDLOT", short: "Harbor", look: "golden-hour", grass: "#3e6b3a", grassAlt: "#355f33", dirt: "#a8593a", wall: "#4a5158", wallTop: "#2c3138", wallH: 1.4, fenceCorner: 76, fenceCenter: 96, fenceSegments: 15, gravity: 9.81, flood: false, night: false, tag: "Golden-hour pickup diamond by the water." },
  skyline: { id: "skyline", name: "MIDTOWN SKYLINE", short: "Midtown", look: "night-city", grass: "#274b3a", grassAlt: "#214234", dirt: "#6b4a38", wall: "#1a2130", wallTop: "#35d6ff", wallH: 1.2, fenceCorner: 82, fenceCenter: 102, fenceSegments: 15, gravity: 9.81, flood: true, night: true, tag: "Rooftop park — office windows are live targets." },
  canyon: { id: "canyon", name: "CANYON RIM", short: "Canyon", look: "overcast", grass: "#6b5a3a", grassAlt: "#5f5033", dirt: "#9c5c3d", wall: "#7a4630", wallTop: "#5d3524", wallH: 2.0, fenceCorner: 88, fenceCenter: 118, fenceSegments: 15, gravity: 9.81, flood: false, night: false, tag: "Deep alleys carved into red rock." },
  ivy: { id: "ivy", name: "IVY CLASSIC", short: "Ivy", look: "outdoor-day", grass: "#2e6b3f", grassAlt: "#285f37", dirt: "#a8593a", wall: "#6e3226", wallTop: "#2e6b3f", wallH: 3.1, fenceCorner: 80, fenceCenter: 100, fenceSegments: 15, gravity: 9.81, flood: true, night: false, tag: "Brick walls, green vines, a century of ghosts." },
  dome: { id: "dome", name: "TYPHOON DOME", short: "Dome", look: "interior-industrial", grass: "#2f6ea3", grassAlt: "#2a6494", dirt: "#4d5a68", wall: "#233046", wallTop: "#ffb03a", wallH: 2.4, fenceCorner: 78, fenceCenter: 98, fenceSegments: 15, gravity: 9.81, flood: true, night: true, tag: "Indoor thunder — no weather, no mercy." },
  lunar: { id: "lunar", name: "LUNAR PARK", short: "Lunar", look: "polar-night", grass: "#4a4f63", grassAlt: "#3f4457", dirt: "#5d6378", wall: "#8894a8", wallTop: "#7dfcff", wallH: 1.6, fenceCorner: 110, fenceCenter: 152, fenceSegments: 15, gravity: 1.63, flood: true, night: true, tag: "One-sixth gravity. Every fly ball is a launch window." }
};

export const PARK_ORDER: readonly ParkId[] = ["sandlot", "skyline", "canyon", "ivy", "dome", "lunar"];

/** Fence radius at foul-cone angle θ (deg, 0 = dead centre). */
export function fenceRadius(park: ParkSpec, thetaDeg: number): number {
  const f = clamp(Math.abs(thetaDeg) / FOUL_DEG, 0, 1);
  return lerp(park.fenceCenter, park.fenceCorner, Math.pow(f, 0.82));
}

/** Point on the fence arc pushed out by `offset` metres; θ = 0 is dead centre (-Z). */
export function fencePoint(park: ParkSpec, thetaDeg: number, y = 0, offset = 0): Vec3 {
  const r = fenceRadius(park, thetaDeg) + offset;
  const rad = (thetaDeg * Math.PI) / 180;
  return [Math.sin(rad) * r, y, -Math.cos(rad) * r];
}

/** Field angle (deg) and radius of a ground point. */
export function polarOf(x: number, z: number): { theta: number; r: number } {
  return { theta: (Math.atan2(x, -z) * 180) / Math.PI, r: Math.hypot(x, z) };
}

/* ------------------------------------------------------------------ *
 *  Set dressing layout (C3): every outfield node is placed from the  *
 *  fence radius at its own angle plus a positive offset.             *
 * ------------------------------------------------------------------ */

/** Metres behind the wall for each band of set dressing. */
export const DRESSING = {
  crowd: 4.2,
  bleacherFront: 7.5,
  bleacherRowStep: 2.4,
  bleacherRows: 3,
  bleacherDepth: 2.2,
  scoreboard: 18,
  scoreboardScreen: 15.7,
  shellSide: 38,
  shellCentre: 30,
  props: 16
} as const;

export const WAVER_COUNT = 18;

export function crowdPlacements(park: ParkSpec): { x: number; z: number; yaw: number; theta: number }[] {
  return Array.from({ length: WAVER_COUNT }, (_, i) => {
    const theta = -36 + (72 * i) / (WAVER_COUNT - 1);
    const p = fencePoint(park, theta, 0, DRESSING.crowd);
    return { x: p[0], z: p[2], yaw: (theta * Math.PI) / 180 + Math.PI, theta };
  });
}

export function bleacherPlacements(park: ParkSpec): { sec: number; row: number; x: number; z: number; yaw: number; theta: number; r: number; tierH: number; bench: Vec3 }[] {
  const out: { sec: number; row: number; x: number; z: number; yaw: number; theta: number; r: number; tierH: number; bench: Vec3 }[] = [];
  for (let sec = 0; sec < 7; sec++) {
    const theta = -38 + (76 * sec) / 6;
    const rad = (theta * Math.PI) / 180;
    const baseR = fenceRadius(park, theta) + DRESSING.bleacherFront;
    for (let row = 0; row < DRESSING.bleacherRows; row++) {
      const r = baseR + row * DRESSING.bleacherRowStep;
      const tierH = 1.1 + row * 0.95;
      out.push({
        sec,
        row,
        x: Math.sin(rad) * r,
        z: -Math.cos(rad) * r,
        yaw: rad + Math.PI,
        theta,
        r,
        tierH,
        bench: [Math.sin(rad) * (r - 0.35), tierH + 0.11, -Math.cos(rad) * (r - 0.35)]
      });
    }
  }
  return out;
}

/** The three stadium shells, at the angles the original art used, pushed behind each park's own fence. */
export function shellPlacements(park: ParkSpec): { name: string; x: number; z: number; yaw: number }[] {
  const side = 31.3;
  const l = fencePoint(park, -side, 0, DRESSING.shellSide);
  const c = fencePoint(park, 0, 0, DRESSING.shellCentre);
  const r = fencePoint(park, side, 0, DRESSING.shellSide);
  return [
    { name: "stadium-shell-l", x: l[0], z: l[2], yaw: Math.PI * 0.26 },
    { name: "stadium-shell-c", x: c[0], z: c[2], yaw: Math.PI },
    { name: "stadium-shell-r", x: r[0], z: r[2], yaw: -Math.PI * 0.26 }
  ];
}

export function scoreboardPlacement(park: ParkSpec): { rig: Vec3; screen: Vec3 } {
  const rig = fencePoint(park, 0, park.wallH + 0.2, DRESSING.scoreboard);
  const screen = fencePoint(park, 0, park.wallH + 7.4, DRESSING.scoreboardScreen);
  return { rig, screen };
}

/** A prop at field angle θ, `offset` metres behind the wall. */
export const propAt = (park: ParkSpec, thetaDeg: number, offset: number = DRESSING.props): Vec3 => fencePoint(park, thetaDeg, 0, offset);

/**
 * Push a ground point that lies in fair territory (plus a 4 degree margin) out to at least `minOffset` metres behind the fence at
 * its own angle. Points already far enough out, and points in foul territory, are returned unchanged.
 */
export function clearOfFence(park: ParkSpec, x: number, z: number, minOffset: number): [number, number] {
  const { theta, r } = polarOf(x, z);
  if (Math.abs(theta) > FOUL_DEG + 4) return [x, z];
  const need = fenceRadius(park, theta) + minOffset;
  if (r >= need) return [x, z];
  const k = need / Math.max(r, 1e-6);
  return [x * k, z * k];
}

/** Authored ground spots of the outfield props per park (the art's original positions) and how far behind the fence each must stay. */
export const PROP_SPOTS: Record<ParkId, readonly { readonly name: string; readonly x: number; readonly z: number; readonly min: number }[]> = {
  sandlot: [
    { name: "harbor-pier", x: 75, z: -122, min: 16 },
    { name: "sandlot-windmill", x: -42, z: -72, min: 16 },
    { name: "sandlot-tower", x: 48, z: -58, min: 16 },
    { name: "pine-a", x: -34, z: -82, min: 18 },
    { name: "pine-b", x: 38, z: -84, min: 18 },
    { name: "sandlot-lamp", x: -28, z: -4, min: 6 }
  ],
  skyline: [
    { name: "skyline-bldg-0", x: -72, z: -95, min: 16 },
    { name: "skyline-bldg-1", x: 74, z: -100, min: 16 },
    { name: "skyline-bldg-2", x: -95, z: -40, min: 16 },
    { name: "skyline-bldg-3", x: 95, z: -34, min: 16 },
    { name: "skyline-bldg-4", x: 0, z: -150, min: 16 }
  ],
  canyon: [
    { name: "canyon-rock-0", x: -60, z: -96, min: 16 },
    { name: "canyon-rock-1", x: 56, z: -100, min: 16 },
    { name: "canyon-rock-2", x: -92, z: -58, min: 16 },
    { name: "canyon-rock-3", x: 94, z: -54, min: 16 },
    { name: "canyon-rock-4", x: 0, z: -142, min: 16 }
  ],
  ivy: [],
  dome: [],
  lunar: [
    ...Array.from({ length: 6 }, (_, i) => ({ name: `regolith-${i}`, x: -90 + i * 38, z: -120 - (i % 2) * 30, min: 8 })),
    { name: "lunar-comms", x: 60, z: -70, min: 16 }
  ]
};

/** Ground position of a named prop in a park, pushed clear of the fence. */
export function propSpot(park: ParkSpec, name: string): [number, number] {
  const s = PROP_SPOTS[park.id].find((p) => p.name === name);
  if (!s) throw new Error(`PROP_SPOT_UNKNOWN: ${park.id}/${name}`);
  return clearOfFence(park, s.x, s.z, s.min);
}

/** Field grass plane height and the harbor water plane (C13: the water sits above the grass, past the right-field stands). */
export const GRASS_Y = -0.02;
export const HARBOR_WATER = { x: 150, y: 0.12, z: -160, w: 220, d: 80 } as const;

/* ------------------------------------------------------------------ *
 *  Pitch flight and the strike zone                                  *
 * ------------------------------------------------------------------ */

export type PitchId = "fourseam" | "curve" | "slider" | "changeup";

export interface PitchSpec {
  readonly id: PitchId;
  readonly name: string;
  readonly short: string;
  readonly mph: readonly [number, number];
  readonly breakX: number;
  readonly breakY: number;
  readonly breakPow: number;
}

export const PITCHES: Record<PitchId, PitchSpec> = {
  fourseam: { id: "fourseam", name: "4-SEAM", short: "4FB", mph: [91, 97], breakX: 0.06, breakY: -0.18, breakPow: 1.15 },
  curve: { id: "curve", name: "CURVE", short: "CB", mph: [73, 80], breakX: -0.16, breakY: -0.92, breakPow: 2.4 },
  slider: { id: "slider", name: "SLIDER", short: "SL", mph: [82, 88], breakX: 0.52, breakY: -0.4, breakPow: 2.1 },
  changeup: { id: "changeup", name: "CHANGE", short: "CH", mph: [77, 83], breakX: -0.1, breakY: -0.52, breakPow: 1.7 }
};

export const PITCH_KEYS: readonly PitchId[] = ["fourseam", "curve", "slider", "changeup"];

export interface PitchPath {
  readonly spec: PitchSpec;
  readonly start: Vec3;
  readonly target: Vec3;
  readonly breakX: number;
  readonly breakY: number;
}

export function pitchPosAt(p: PitchPath, t: number): Vec3 {
  const tt = clamp(t, 0, 1);
  const s = Math.pow(tt, p.spec.breakPow);
  const x = lerp(p.start[0], p.target[0], tt) + p.breakX * s;
  const y = Math.max(0.05, lerp(p.start[1], p.target[1], tt) + p.breakY * s - 0.18 * tt * tt);
  const z = lerp(p.start[2], 0, tt);
  if (t <= 1) return [x, y, z];
  const ex = t - 1;
  return [x + p.breakX * ex * 2.4, Math.max(0.35, y - ex * 1.6), ex * 8.5];
}

export function zoneCoords(p: Vec3): [number, number] {
  return [p[0] / ZONE_HW, (p[1] - ZONE_CY) / ZONE_HH];
}

export function inZone(p: Vec3): boolean {
  const [zx, zy] = zoneCoords(p);
  return Math.abs(zx) <= 1 && Math.abs(zy) <= 1;
}

/** A pitch the batter does not swing at: a called strike when it crosses the zone, otherwise a ball. */
export function calledPitch(p: PitchPath): "strike" | "ball" {
  return inZone(pitchPosAt(p, 1)) ? "strike" : "ball";
}

/**
 * Seconds until the ball reaches the contact plane, from either the windup (`phase = "windup"`, `phaseT` seconds in) or the
 * flight (`t` = pitch progress 0..1).
 */
export function timeToContactPlane(phase: "windup" | "pitch", phaseT: number, t: number, flightSec: number): number {
  if (phase === "windup") return Math.max(0, WINDUP_RELEASE_T - phaseT) + CONTACT_PLANE_T * flightSec;
  return (CONTACT_PLANE_T - t) * flightSec;
}

/**
 * Timing error of a swing pressed now: positive when the bat reaches the plane after the ball (late), negative when it is
 * early. The bat reaches the plane `swingPre` seconds after the press.
 */
export function swingTimingError(timeToPlane: number, swingPre = PLAYER_SWING_PRE): number {
  return swingPre - timeToPlane;
}

export type SwingGrade = "WHIFF" | "PERFECT" | "GOOD" | "EARLY" | "LATE";

/** Contact quality from the PCI distance and the timing error (same thresholds the game always used). */
export function gradeSwing(timingErr: number, dist: number, radius: number): { grade: SwingGrade; q: number } {
  const q = 1 - clamp(dist / (radius * 1.15), 0, 1);
  const timingAbs = Math.abs(timingErr);
  if (timingAbs > WHIFF_WINDOW || dist > radius * 1.5) return { grade: "WHIFF", q };
  let grade: SwingGrade = "GOOD";
  if (q > 0.78 && timingAbs < 0.05) grade = "PERFECT";
  else if (timingErr < -0.07 || (q < 0.4 && timingErr < 0)) grade = "EARLY";
  else if (timingErr > 0.07 || (q < 0.4 && timingErr > 0)) grade = "LATE";
  return { grade, q };
}

/* ------------------------------------------------------------------ *
 *  Batted ball                                                        *
 * ------------------------------------------------------------------ */

export interface FlightState {
  pos: Vec3;
  vel: Vec3;
  crossedFence: boolean;
  hrCrossed: boolean;
  wallHit: boolean;
}

/** One fixed integration step of a batted ball, including the wall rebound. Returns the radius and field angle after it. */
export function stepFlight(s: FlightState, park: ParkSpec, dt: number): { r: number; theta: number; fenceR: number } {
  const g = park.gravity;
  const k = park.id === "lunar" ? 0.0022 : 0.0042;
  const sp = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  s.vel[0] -= k * sp * s.vel[0] * dt;
  s.vel[1] -= (g + k * sp * s.vel[1]) * dt;
  s.vel[2] -= k * sp * s.vel[2] * dt;
  s.pos[0] += s.vel[0] * dt;
  s.pos[1] += s.vel[1] * dt;
  s.pos[2] += s.vel[2] * dt;
  const r = Math.hypot(s.pos[0], s.pos[2]);
  const theta = (Math.atan2(s.pos[0], -s.pos[2]) * 180) / Math.PI;
  const fenceR = Math.abs(theta) <= FOUL_DEG + 4 ? fenceRadius(park, theta) : Infinity;
  if (!s.crossedFence && r >= fenceR) {
    s.crossedFence = true;
    if (s.pos[1] > park.wallH && Math.abs(theta) <= FOUL_DEG) {
      s.hrCrossed = true;
    } else {
      s.wallHit = true;
      const nx = s.pos[0] / r;
      const nz = s.pos[2] / r;
      const dot = s.vel[0] * nx + s.vel[2] * nz;
      s.vel[0] = (s.vel[0] - 2 * dot * nx) * 0.42;
      s.vel[2] = (s.vel[2] - 2 * dot * nz) * 0.42;
      s.vel[1] *= 0.6;
      s.pos[0] = nx * fenceR * 0.985;
      s.pos[2] = nz * fenceR * 0.985;
    }
  }
  return { r, theta, fenceR };
}

export interface LandingPrediction {
  hangT: number;
  landPos: Vec3;
  landDist: number;
  landTheta: number;
  maxY: number;
  crossedFence: boolean;
  hrCrossed: boolean;
  wallHit: boolean;
}

/** Integrate a batted ball to its landing with the fixed step. The caller's vectors are not modified. */
export function predictLanding(pos0: Vec3, vel0: Vec3, park: ParkSpec): LandingPrediction {
  const s: FlightState = { pos: [...pos0], vel: [...vel0], crossedFence: false, hrCrossed: false, wallHit: false };
  let t = 0;
  let landPos: Vec3 = [...pos0];
  let landTheta = 0;
  let landDist = 0;
  let maxY = pos0[1];
  while (t < 14) {
    const { r, theta } = stepFlight(s, park, SIM_STEP);
    t += SIM_STEP;
    if (s.pos[1] > maxY) maxY = s.pos[1];
    if (s.pos[2] > 5 && s.pos[1] < 3) {
      landPos = [s.pos[0], Math.max(0.045, s.pos[1]), s.pos[2]];
      landTheta = theta;
      landDist = r;
      break;
    }
    if (s.pos[1] <= 0.045) {
      landPos = [s.pos[0], 0.045, s.pos[2]];
      landTheta = theta;
      landDist = r;
      break;
    }
  }
  return { hangT: t, landPos, landDist, landTheta, maxY, crossedFence: s.crossedFence, hrCrossed: s.hrCrossed, wallHit: s.wallHit };
}

/* ------------------------------------------------------------------ *
 *  Game rules                                                         *
 * ------------------------------------------------------------------ */

/** Score as away (the player, who bats in the top) and home (the CPU, who bats in the bottom). */
export interface Scoreline {
  readonly away: number;
  readonly home: number;
}

export const MERCY_RUNS = 10;

/**
 * What happens when a half-inning ends with three outs.
 * - After the top: the game ends only if the home team already leads in the last scheduled inning or later, or the HOME team
 *   leads by the mercy margin from the 2nd inning on (a visiting lead never ends the game before the home team bats).
 * - After the bottom: mercy for either side (the game always had it from the bottom of the 1st), a decided game after the last
 *   scheduled inning, else the next inning.
 */
export function halfEndDecision(half: "top" | "bottom", inning: number, inningsTotal: number, s: Scoreline): "bottom" | "next-inning" | "final" | "mercy" {
  const lead = s.home - s.away;
  if (half === "top") {
    if (inning >= inningsTotal && lead > 0) return "final";
    if (inning >= 2 && lead >= MERCY_RUNS) return "mercy";
    return "bottom";
  }
  if (Math.abs(lead) >= MERCY_RUNS) return "mercy";
  if (inning >= inningsTotal && lead !== 0) return "final";
  return "next-inning";
}

/** The home team takes the lead in the bottom of the last scheduled inning (or an extra inning): the game is over. */
export function isWalkoff(half: "top" | "bottom", inning: number, inningsTotal: number, s: Scoreline): boolean {
  return half === "bottom" && inning >= inningsTotal && s.home > s.away;
}

/** A mid-inning home lead of the mercy margin in the bottom half ends the game at once (the visitors have batted). */
export function isMidInningMercy(half: "top" | "bottom", s: Scoreline): boolean {
  return half === "bottom" && s.home - s.away >= MERCY_RUNS;
}

/** Tag-up on a caught fly: the runner on third scores on a deep fly only when the catch was not the third out. */
export function sacFlyScores(runnerOnThird: boolean, landDist: number, outsBeforeCatch: number): boolean {
  return runnerOnThird && landDist > 62 && outsBeforeCatch + 1 < 3;
}

/* ------------------------------------------------------------------ *
 *  World Classic bracket                                              *
 * ------------------------------------------------------------------ */

export interface BracketGame {
  a: number;
  b: number;
  scoreA: number;
  scoreB: number;
  winner: number;
  me: boolean;
  played: boolean;
}

export interface BracketState {
  player: number;
  rounds: BracketGame[][];
  round: number;
  alive: boolean;
  champion: number | null;
  /** Set when the player won a round and the next fixture is waiting; the next World Classic start resumes it. */
  pendingFixture: boolean;
}

export const CLASSIC_ROUND_NAMES = ["ROUND OF 32", "ROUND OF 16", "QUARTER-FINAL", "SEMI-FINAL", "FINAL"];

export function createBracket(teamCount: number, rng: () => number): BracketState {
  const order = Array.from({ length: teamCount }, (_, i) => i).filter((i) => i !== 0);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  order.unshift(0);
  return {
    player: 0,
    rounds: [
      Array.from({ length: teamCount / 2 }, (_, g) => ({
        a: order[g * 2]!,
        b: order[g * 2 + 1]!,
        scoreA: -1,
        scoreB: -1,
        winner: -1,
        me: order[g * 2] === 0 || order[g * 2 + 1] === 0,
        played: false
      }))
    ],
    round: 0,
    alive: true,
    champion: null,
    pendingFixture: false
  };
}

export function simOtherGames(b: BracketState, ratings: readonly number[], rng: () => number): void {
  const round = b.rounds[b.round];
  if (!round) return;
  for (const gm of round) {
    if (gm.me || gm.played) continue;
    const ra = ratings[gm.a]!;
    const rb = ratings[gm.b]!;
    const aWins = rng() < ra / (ra + rb);
    const hi = 2 + Math.floor(rng() * 4);
    const lo = Math.floor(rng() * 2.4);
    gm.scoreA = aWins ? hi : lo;
    gm.scoreB = aWins ? lo : hi;
    gm.winner = aWins ? gm.a : gm.b;
    gm.played = true;
  }
}

/** Record the player's result, sim the rest of the round, and build the next round (or finish the bracket). */
export function advanceBracket(b: BracketState, playerWon: boolean, playerScore: number, cpuScore: number, ratings: readonly number[], rng: () => number): void {
  const round = b.rounds[b.round]!;
  const meGame = round.find((g) => g.me);
  if (meGame) {
    if (meGame.a === b.player) {
      meGame.scoreA = playerScore;
      meGame.scoreB = cpuScore;
    } else {
      meGame.scoreA = cpuScore;
      meGame.scoreB = playerScore;
    }
    meGame.winner = playerWon ? b.player : meGame.a === b.player ? meGame.b : meGame.a;
    meGame.played = true;
  }
  simOtherGames(b, ratings, rng);
  b.pendingFixture = false;
  if (b.round >= CLASSIC_ROUND_NAMES.length - 1) {
    b.champion = playerWon ? b.player : (meGame?.winner ?? -1);
    b.alive = playerWon;
    return;
  }
  const nextRound = (winners: number[], mine: boolean): BracketGame[] => {
    const nr: BracketGame[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      const a = winners[i]!;
      const bb = winners[i + 1]!;
      nr.push({ a, b: bb, scoreA: -1, scoreB: -1, winner: -1, me: mine && (a === b.player || bb === b.player), played: false });
    }
    return nr;
  };
  b.rounds.push(nextRound(round.map((g) => g.winner), true));
  b.round += 1;
  b.alive = playerWon;
  if (playerWon) {
    b.pendingFixture = true;
    return;
  }
  while (b.round <= CLASSIC_ROUND_NAMES.length - 1) {
    simOtherGames(b, ratings, rng);
    const w2 = b.rounds[b.round]!.map((g) => g.winner);
    if (b.round === CLASSIC_ROUND_NAMES.length - 1) {
      b.champion = w2[0] ?? -1;
      break;
    }
    b.rounds.push(nextRound(w2, false));
    b.round += 1;
  }
}

/** Whether a World Classic start continues the current bracket instead of drawing a new one. */
export function shouldResumeClassic(b: BracketState | null): boolean {
  return b !== null && b.alive && b.champion === null && b.pendingFixture;
}

/** The player's next unplayed fixture and the opponent index, if any. */
export function currentFixture(b: BracketState): { game: BracketGame; opponent: number } | null {
  const game = b.rounds[b.round]?.find((g) => g.me && !g.played);
  if (!game) return null;
  return { game, opponent: game.a === b.player ? game.b : game.a };
}
