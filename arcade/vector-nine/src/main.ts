/**
 * VECTOR NINE — thruster-assisted stunt driving on a decommissioned tidal
 * barrage at golden hour.
 *
 * The mechanic that is ours: FLUX GRIP. One energy pool feeds both the boost
 * thrusters and the grip field that holds the coupe onto the barrage's
 * quarter-pipe walls. Boosting drains it, riding a wall drains it faster the
 * faster you go, and it only recharges on the flat deck. Speed and geometry
 * compete for the same resource — every wall ride is a decision about speed.
 *
 * Driving model: the coupe lives in track space (s along a closed Catmull-Rom
 * centreline, u lateral). Past |u| = DECK_HALF the deck curves up into a
 * quarter-pipe of radius WALL_R; the surface angle there follows the analytic
 * model θ = asin(d / WALL_R) with d = |u| − DECK_HALF, and the coupe banks to
 * the surface normal. The rendered wall is a 4-facet box approximation of the
 * same arc, so what you drive is what you see to within a chord.
 *
 * Camera: a single scene-authored `camera.follow` rig tracks an invisible
 * anchor node. This engine build culls render items beyond the camera's TARGET
 * PLANE, so the rig's target sits ~120 m ahead of the coupe along its heading
 * (well past the far edge of readable content) and the far plane exceeds that
 * distance. The track ahead never falls off the cull.
 */
import {
  camera,
  game,
  gameFeel,
  instances,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraColor,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
  type AuraTransformSpec,
  type AuraVec3
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";

const LOOK_ID = "golden-hour" as const;

// ── world constants ──────────────────────────────────────────────────────────
const DECK_HALF = 9; // flat deck half-width (m)
const WALL_R = 7; // quarter-pipe radius either side; wall top at y = 7
const LIP = DECK_HALF + WALL_R - 0.55; // hard clamp before the parapet
const DECK_THICK = 1.6;
const WATER_Y = -6.5;
const HOVER_RIDE = 0.42; // the coupe hovers this far above the surface
const MODEL_YAW_TRIM = 0; // flip to Math.PI if the GLB faces backwards on capture

// ── vehicle constants ────────────────────────────────────────────────────────
const V_MAX = 46;
const V_MAX_BOOST = 58;
const ACCEL = 27;
const BOOST_ACCEL = 26;
const BRAKE = 44;
const REVERSE_MAX = 12;
const GRAVITY = 21;
const JUMP_V = 9.2;
const HOVER_LIFT = 26;
const AIR_PITCH_RATE = 2.6;
const AIR_ROLL_RATE = 3.4;
const AIR_YAW_RATE = 2.1;

// ── flux grip ────────────────────────────────────────────────────────────────
const FLUX_MAX = 100;
const FLUX_RECHARGE = 26; // per second, on the deck, not boosting
const FLUX_BOOST_DRAIN = 34;
const FLUX_HOVER_DRAIN = 30;
const FLUX_WALL_BASE = 14;
const FLUX_WALL_SPEED = 22; // extra drain scaled by v / V_MAX

// ── events ───────────────────────────────────────────────────────────────────
const EVENT_NAMES = ["Time Attack", "Free Ride", "Score Attack"] as const;
const SCORE_WINDOW = 90;
const CRASH_PENALTY_S = 5;
const RESPAWN_PENALTY_S = 5;

interface CircuitDef {
  readonly name: string;
  readonly checkpoints: readonly number[]; // gate indices, ascending by s
  readonly finishGate: number;
  readonly medals: readonly [number, number, number]; // gold / silver / bronze seconds
}

const GATE_COUNT = 10;
// Lateral line each gate asks for (m from centreline) — gates force line choice.
const GATE_U: readonly number[] = [0, 4, -4, 3, -3, 4.5, -4.5, 2, -2, 0];

const CIRCUITS: readonly CircuitDef[] = [
  { name: "Ebb Run", checkpoints: [2, 4, 6, 8], finishGate: 0, medals: [27, 34, 43] },
  { name: "Flood Gauge", checkpoints: [1, 3, 5, 7, 9], finishGate: 0, medals: [30, 38, 47] },
  { name: "Spring Tide", checkpoints: [1, 2, 3, 4, 5, 6, 7, 8, 9], finishGate: 0, medals: [33, 41, 52] }
];

// ── track centreline ─────────────────────────────────────────────────────────
// A closed loop over the barrage deck: long start straight, sweeping right,
// an inward esses, and a tight return leg. ~620 m per lap.
const TRACK_CONTROL: readonly (readonly [number, number])[] = [
  [0, -80],
  [60, -78],
  [105, -55],
  [118, 0],
  [100, 55],
  [55, 80],
  [10, 70],
  [-25, 85],
  [-70, 75],
  [-105, 40],
  [-112, -10],
  [-85, -60],
  [-40, -82]
];

const RAW_SAMPLES = 720;
const DECK_TARGET_SEGMENTS = 116; // two pools of 58 — MAX_GPU_INSTANCES is 64
const WALL_FACET_LEN = 16; // instances per wall ring ≈ L/16 ≈ 39 ≤ 64
const WALL_FACETS = 4; // 4 × 22.5° facets model the quarter-pipe arc
const LANE_STEP = 12;
const BARRIER_STEP = 26;
const MAST_SLOTS = 9;
const TOWER_SLOTS = 5;

// ── dressing cadences (all pools sized to stay ≤ MAX_GPU_INSTANCES 64) ───────
const RAIL_STEP = 24; // guardrail segments: ceil(662/24)·2 sides = 56
const SEAM_STEP = 15; // deck expansion seams: ceil(662/15) = 45
const TICK_STEP = 24; // centreline distance ticks: ceil(662/24) = 28
const WET_STEP = 24; // wet-edge glow segments: 28 · 2 sides = 56
const CHEVRONS_PER_GATE = 3; // × 2 strokes × 10 gates = 60
const ARM_CLEARANCE_Y = 9.6; // mast-arm height: ≥ 6 m above any jump apex
// Masts that carry an overhead deck arm (subset of MAST_SLOTS, both sides).
// Declared here — above createGame — because buildScene runs the moment
// createGame is invoked and reads it (the BESTS_KEY TDZ lesson).
const ARM_MASTS: readonly number[] = [0, 2, 3, 5, 6, 8];
// Golden-hour key light: sunPosition(12°, 35°) in the look preset — the low
// sun sits toward +X/+Z. The sea glitter and headland silhouettes key off it.
const SUN_AZ_RAD = (35 * Math.PI) / 180;
const SUN_DIR: readonly [number, number] = [Math.sin(SUN_AZ_RAD), Math.cos(SUN_AZ_RAD)];

// ── evidence ─────────────────────────────────────────────────────────────────
interface VectorNineState {
  readonly frame: number;
  readonly speed: number;
  readonly speedKph: number;
  readonly fluxEnergy: number;
  readonly wallRiding: boolean;
  readonly wallAngleDeg: number;
  readonly airborne: boolean;
  readonly event: string;
  readonly circuit: string;
  readonly checkpointIndex: number;
  readonly checkpointCount: number;
  readonly lapTime: number;
  readonly score: number;
  readonly combo: number;
  readonly bestTime: number | null;
  readonly bestScore: number | null;
  readonly medal: string;
  readonly gameOver: boolean;
  readonly look: { readonly id: string };
  readonly assetIds: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_ARCADE_STATE__?: VectorNineState;
    __AURA3D_VECTOR_NINE__?: VectorNineState;
  }
}

// ── 3×3 row-major rotation helpers ───────────────────────────────────────────
// The engine composes node/instance Euler rotation as Rz(z)·Ry(y)·Rx(x) (see
// sceneMath.rotationXYZ). There is no quaternion setter on the runtime handle,
// so the coupe's yaw-pitch-roll (Ry·Rx·Rz in body axes) is composed here as a
// matrix and EXTRACTED back into the engine's ZYX Euler triple. That keeps
// wall banking exact for every heading instead of only headings near ±Z.
type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number
];

function mul3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out as unknown as Mat3;
}

function rotY(y: number): Mat3 {
  const c = Math.cos(y);
  const s = Math.sin(y);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

function rotX(x: number): Mat3 {
  const c = Math.cos(x);
  const s = Math.sin(x);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}

function rotZ(z: number): Mat3 {
  const c = Math.cos(z);
  const s = Math.sin(z);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/** Inverse of the engine's Rz·Ry·Rx composition: the Euler triple to feed setRotation. */
function engineEulerFromMatrix(m: Mat3): AuraVec3 {
  const cosY = Math.hypot(m[6], m[8]);
  const y = Math.atan2(m[6], cosY);
  if (cosY > 1e-5) {
    const x = Math.atan2(-m[7], m[8]);
    const z = Math.atan2(-m[3], m[0]);
    return [x, y, z];
  }
  // Gimbal proximity (mid-flip): fold X into Z, keep the spin readable.
  return [0, y, Math.atan2(m[1], m[4])];
}

/** Coupe rotation: heading, then pitch about the lateral axis, then roll about the forward axis. */
function coupeEuler(heading: number, pitch: number, roll: number): AuraVec3 {
  const m = mul3(rotY(heading + MODEL_YAW_TRIM), mul3(rotX(pitch), rotZ(roll)));
  return engineEulerFromMatrix(m);
}

/** Static prop rotation: heading, then a bank about the along-track axis (wall facets). */
function propEuler(heading: number, bank: number): AuraVec3 {
  return engineEulerFromMatrix(mul3(rotY(heading), rotZ(bank)));
}

// ── track sampling ───────────────────────────────────────────────────────────
interface TrackSample {
  readonly x: number;
  readonly z: number;
  readonly psi: number; // tangent heading, engine convention forward = (−sin ψ, 0, cos ψ)
}

function catmullPoint(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number
): readonly [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  ];
}

function buildTrackSamples(): { samples: TrackSample[]; length: number; spacing: number } {
  const n = TRACK_CONTROL.length;
  const raw: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = TRACK_CONTROL[(i - 1 + n) % n]!;
    const p1 = TRACK_CONTROL[i]!;
    const p2 = TRACK_CONTROL[(i + 1) % n]!;
    const p3 = TRACK_CONTROL[(i + 2) % n]!;
    for (let k = 0; k < RAW_SAMPLES / n; k += 1) {
      const pt = catmullPoint(p0, p1, p2, p3, k / (RAW_SAMPLES / n));
      raw.push({ x: pt[0], z: pt[1] });
    }
  }
  // Resample by arc length into evenly spaced segments.
  const cumulative: number[] = [0];
  for (let i = 1; i <= raw.length; i += 1) {
    const a = raw[i - 1]!;
    const b = raw[i % raw.length]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cumulative[cumulative.length - 1]!;
  const spacing = length / DECK_TARGET_SEGMENTS;
  const samples: TrackSample[] = [];
  let cursor = 0;
  for (let i = 0; i < DECK_TARGET_SEGMENTS; i += 1) {
    const target = i * spacing;
    while (cursor < cumulative.length - 2 && cumulative[cursor + 1]! < target) cursor += 1;
    const span = cumulative[cursor + 1]! - cumulative[cursor]! || 1;
    const f = Math.min(1, Math.max(0, (target - cumulative[cursor]!) / span));
    const a = raw[cursor % raw.length]!;
    const b = raw[(cursor + 1) % raw.length]!;
    const x = a.x + (b.x - a.x) * f;
    const z = a.z + (b.z - a.z) * f;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    samples.push({ x, z, psi: Math.atan2(-dx, dz) });
  }
  return { samples, length, spacing };
}

const TRACK = buildTrackSamples();
const TRACK_SAMPLES = TRACK.samples;
const TRACK_LENGTH = TRACK.length;
const TRACK_SPACING = TRACK.spacing;

function wrapAngle(a: number): number {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function trackAt(s: number): TrackSample {
  const wrapped = ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  const exact = wrapped / TRACK_SPACING;
  const i0 = Math.floor(exact) % TRACK_SAMPLES.length;
  const i1 = (i0 + 1) % TRACK_SAMPLES.length;
  const f = exact - Math.floor(exact);
  const a = TRACK_SAMPLES[i0]!;
  const b = TRACK_SAMPLES[i1]!;
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    psi: a.psi + wrapAngle(b.psi - a.psi) * f
  };
}

/** Lateral basis: +u is the driver's right when travelling with increasing s. */
function rightOf(psi: number): readonly [number, number] {
  return [-Math.cos(psi), -Math.sin(psi)];
}

function surfaceHeight(absU: number): number {
  if (absU <= DECK_HALF) return 0;
  const k = Math.min(1, (absU - DECK_HALF) / WALL_R);
  return WALL_R * (1 - Math.sqrt(1 - k * k)); // WALL_R · (1 − cos θ), θ = asin(k)
}

function wallAngle(absU: number): number {
  if (absU <= DECK_HALF) return 0;
  return Math.asin(Math.min(1, (absU - DECK_HALF) / WALL_R));
}

// ── game state (declared before createGame — its scene factory runs at once) ─
// lastCarS and BESTS_KEY must also precede the top-level init calls at the
// bottom of this file: loadBests()/resetRun() execute during module evaluation,
// and a `let`/`const` they read still in its temporal dead zone throws
// "Cannot access … before initialization" and kills the boot gate.
const BESTS_KEY = "vector-nine.bests.v1";
let lastCarS = 0;

interface GateDef {
  readonly index: number;
  readonly s: number;
  readonly u: number;
  readonly x: number;
  readonly z: number;
  readonly psi: number;
}

const GATES: GateDef[] = Array.from({ length: GATE_COUNT }, (_, index) => {
  const s = (index * TRACK_LENGTH) / GATE_COUNT;
  const at = trackAt(s);
  const right = rightOf(at.psi);
  return { index, s, u: GATE_U[index]!, x: at.x + right[0] * GATE_U[index]!, z: at.z + right[1] * GATE_U[index]!, psi: at.psi };
});

let eventIndex = 0; // 0 Time Attack · 1 Free Ride · 2 Score Attack
let circuitIndex = 0;
let phase: "countdown" | "racing" | "finished" = "countdown";
let countdownT = 3.4;
let lastCountdownShown = 4;

let carS = 0;
let carU = 0;
let carPsi = TRACK_SAMPLES[0]!.psi;
let carV = 0;
let carY = HOVER_RIDE;
let vy = 0;
let airborne = false;
let pitch = 0;
let roll = 0;
let airYawOffset = 0; // style spin accumulated in the air (display only)
let driftFactor = 0;
let stunT = 0;

let flux = FLUX_MAX;
let wallRiding = false;
let wallTheta = 0;
let wallStyleRun = 0; // style points banked by the current wall ride
let airTime = 0;
let airRotation = 0;

let lapTime = 0;
let checkpointIndex = 0; // next checkpoint ordinal within the circuit
let score = 0;
let combo = 1;
let medal = "";
let crashCount = 0;
let frameCount = 0;
let hudFrame = 0;
let toast = "";
let toastT = 0;

let bestTimePerCircuit: (number | null)[] = [null, null, null];
let bestScore: number | null = null;

let gateNode: AuraRuntimeNodeHandle | undefined;
let coupeNode: AuraRuntimeNodeHandle | undefined;
let anchorNode: AuraRuntimeNodeHandle | undefined;
let markerNode: AuraRuntimeNodeHandle | undefined;
let markerGate: GateDef | null = null;

const gameEvents = game.eventLog({ label: "vector nine events", maxEvents: 24 });

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    boost: ["ShiftLeft", "ShiftRight"],
    jump: ["Space"],
    drift: ["KeyX"],
    spinLeft: ["KeyQ"],
    spinRight: ["KeyE"],
    respawn: ["Enter"],
    restart: ["KeyR"],
    eventTimeAttack: ["Digit1"],
    eventFreeRide: ["Digit2"],
    eventScoreAttack: ["Digit3"],
    circuit: ["KeyN"],
    mute: ["KeyM"]
  },
  bufferMs: { jump: 130 }
} as const;

// ── procedural music ─────────────────────────────────────────────────────────
// A slow five-voice synth pad (A-minor drone with staggered AM shimmer).
// Original, synthesized in-page through the audio cue `play` hook — nothing
// sampled, nothing ripped. Built once; later triggers are no-ops.
interface PadContext {
  readonly currentTime: number;
  createGain(): GainNode;
  createOscillator?(): OscillatorNode;
}

let musicBuilt = false;
function playMusicPad(context: PadContext, destination: AudioNode): void {
  if (musicBuilt) return;
  musicBuilt = true;
  const createOsc = context.createOscillator?.bind(context);
  if (!createOsc || !context.createGain) return;
  const bus = context.createGain();
  bus.gain.value = 0.09;
  bus.connect(destination);
  const voices: readonly { freq: number; type: OscillatorType; swell: number }[] = [
    { freq: 110.0, type: "sawtooth", swell: 0.05 },
    { freq: 164.81, type: "sawtooth", swell: 0.04 },
    { freq: 220.0, type: "triangle", swell: 0.06 },
    { freq: 261.63, type: "triangle", swell: 0.05 },
    { freq: 329.63, type: "triangle", swell: 0.045 }
  ];
  voices.forEach((voice, i) => {
    const osc = createOsc();
    osc.type = voice.type;
    osc.frequency.value = voice.freq * (1 + (i % 2 === 0 ? 0.0012 : -0.0009));
    const gain = context.createGain();
    gain.gain.value = 0.5;
    osc.connect(gain);
    gain.connect(bus);
    const lfo = createOsc();
    lfo.type = "sine";
    lfo.frequency.value = 0.031 + i * 0.013;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = voice.swell;
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);
    osc.start();
    lfo.start();
  });
}

const vectorNine = createGame({
  id: "vector-nine",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: { theme: "motorsport", widgets: [] },
  touch: {
    preset: "steer-pedals",
    bindings: {
      "steer-left": "left",
      "steer-right": "right",
      throttle: "throttle",
      brake: "brake",
      boost: "boost",
      reset: "restart"
    }
  },
  sound: {
    buses: [
      { id: "master", volume: 0.9 },
      { id: "music", volume: 0.55 },
      { id: "sfx", volume: 1 }
    ],
    cues: {
      music: {
        id: "music",
        bus: "music",
        volume: 0.5,
        // The sound option is not contextually typed, so the callback params
        // are annotated here; at runtime the engine passes its audio context.
        play: (context: PadContext, destination: AudioNode) => playMusicPad(context, destination)
      },
      engine: { id: "engine", bus: "sfx", asset: { url: sfxUrl("vehicle.thruster.layer0.on") }, volume: 0, loop: true },
      engineHigh: { id: "engineHigh", bus: "sfx", asset: { url: sfxUrl("vehicle.thruster.layer2.on") }, volume: 0, loop: true },
      skid: { id: "skid", bus: "sfx", asset: { url: sfxUrl("vehicle.tyre-skid") }, volume: 0, loop: true },
      wall: { id: "wall", bus: "sfx", asset: { url: sfxUrl("whoosh.pass-by-small.00") }, volume: 0, loop: true },
      boost: { id: "boost", bus: "sfx", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.5 },
      jump: { id: "jump", bus: "sfx", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.5 },
      land: { id: "land", bus: "sfx", asset: { url: sfxUrl("impact.stone.medium.00") }, volume: 0.55 },
      crash: { id: "crash", bus: "sfx", asset: { url: sfxUrl("impact.stone.heavy.00") }, volume: 0.85 },
      checkpoint: { id: "checkpoint", bus: "sfx", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.7 },
      win: { id: "win", bus: "sfx", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      lose: { id: "lose", bus: "sfx", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 },
      ui: { id: "ui", bus: "sfx", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 },
      uiAlt: { id: "uiAlt", bus: "sfx", asset: { url: sfxUrl("ui.toggle.01") }, volume: 0.45 },
      tick: { id: "tick", bus: "sfx", asset: { url: sfxUrl("ui.countdown-tick.00") }, volume: 0.6 },
      go: { id: "go", bus: "sfx", asset: { url: sfxUrl("ui.countdown-go.00") }, volume: 0.7 }
    }
  },
  juice: {
    boost: { punch: { fovDeg: 1.1, ms: 210 } },
    jump: { punch: { fovDeg: 1.2, ms: 180 }, shake: 0.08 },
    land: { flash: { color: "#ffd9a0", peak: 0.1, ms: 160 }, shake: 0.14 },
    clean: { flash: { color: "#ffb648", peak: 0.2, ms: 240 }, punch: { fovDeg: 1.8, ms: 220 } },
    crash: { flash: { color: "#ff5d7d", peak: 0.34, ms: 380 }, shake: 0.5, vignette: { amount: 0.55, ms: 800 } },
    checkpoint: { flash: { color: "#7be0ff", peak: 0.18, ms: 220 }, punch: { fovDeg: 1.4, ms: 200 } },
    win: { flash: { color: "#ffd166", peak: 0.3, ms: 420 }, punch: { fovDeg: 2.4, ms: 320 } },
    lose: { flash: { color: "#ff5d7d", peak: 0.26, ms: 360 }, vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { vectorNine: () => window.__AURA3D_ARCADE_STATE__ ?? { status: "unbound" } }
  },
  ...looks.appOptions(LOOK_ID)
});

const app = vectorNine.app;
const input = vectorNine.input;
if (!input) throw new Error("vector-nine failed to create runtime-owned input.");
// Narrowed alias: module-scope const narrowing does not survive into function
// bodies, so every frame handler reads through this non-optional binding.
const keys = input;

// ── boot ─────────────────────────────────────────────────────────────────────
await app.ready();

const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("arcade");

loadBests();
mountNodes();
syncGates();
resetRun(eventIndex, circuitIndex, false);
vectorNine.start();
hideBootGate();

// Pointer input parity: tap = jump, hold = hover (mirrors the touch pedals).
let pointerHeld = false;
let pointerJump = false;
const canvas = app.canvas;
if (canvas) {
  canvas.addEventListener("pointerdown", () => {
    pointerHeld = true;
    pointerJump = true;
    startAudio();
  });
  canvas.addEventListener("pointerup", () => {
    pointerHeld = false;
  });
  canvas.addEventListener("pointercancel", () => {
    pointerHeld = false;
  });
}
// Audio contexts need a user gesture: unlock on the first keypress too.
window.addEventListener("keydown", () => startAudio());

app.onFrame(({ dt }) => {
  const step = Math.min(dt, 0.05);
  feel.update(step * 1000);
  frameCount += 1;
  if (toastT > 0) toastT -= step;

  handleMetaInput();

  if (phase === "countdown") {
    stepCountdown(step);
  } else if (phase === "racing") {
    stepVehicle(step);
    stepEventRules(step);
  }
  render();
  publish();
});

// ── meta input (event select, circuit, mute, restart, respawn) ───────────────
let muted = false;
let volume = 0.9;

function handleMetaInput(): void {
  if (keys.pressed("eventTimeAttack")) switchEvent(0);
  if (keys.pressed("eventFreeRide")) switchEvent(1);
  if (keys.pressed("eventScoreAttack")) switchEvent(2);
  if (eventIndex === 0 && keys.pressed("circuit")) {
    circuitIndex = (circuitIndex + 1) % CIRCUITS.length;
    resetRun(eventIndex, circuitIndex, true);
    showToast(`${CIRCUITS[circuitIndex]!.name}`);
  }
  if (keys.pressed("restart")) resetRun(eventIndex, circuitIndex, true);
  if (keys.pressed("mute")) setMuted(!muted);
  if (keys.pressed("respawn") && phase === "racing" && eventIndex !== 1) respawn(true);
}

function switchEvent(next: number): void {
  if (next === eventIndex) return;
  eventIndex = next;
  circuitIndex = 0;
  resetRun(eventIndex, circuitIndex, true);
}

// ── countdown ────────────────────────────────────────────────────────────────
function stepCountdown(step: number): void {
  pointerJump = false; // no buffered mega-jump the instant GO fires
  countdownT -= step;
  const shown = Math.ceil(countdownT);
  if (shown !== lastCountdownShown && shown > 0) {
    lastCountdownShown = shown;
    void vectorNine.sound?.cue("tick");
  }
  if (countdownT <= 0) {
    phase = "racing";
    lapTime = 0;
    void vectorNine.sound?.cue("go");
    vectorNine.juice.fire("checkpoint");
    gameEvents.push({ type: "start", label: `${EVENT_NAMES[eventIndex]} start`, severity: "success" });
  }
}

// ── vehicle simulation ───────────────────────────────────────────────────────
let audioStarted = false;
let boostActive = false;

function startAudio(): void {
  if (audioStarted) return;
  audioStarted = true;
  const sound = vectorNine.sound;
  if (!sound) return;
  void sound.unlock().then(() => {
    void sound.cue("music");
    void sound.cue("engine");
    void sound.cue("engineHigh");
    void sound.cue("skid");
    void sound.cue("wall");
  });
}

function stepVehicle(dt: number): void {
  startAudio();
  const stunned = stunT > 0;
  if (stunned) stunT -= dt;

  const throttle = !stunned && keys.held("throttle");
  const braking = !stunned && keys.held("brake");
  const steer = stunned ? 0 : (keys.held("right") ? 1 : 0) - (keys.held("left") ? 1 : 0);
  const wantBoost = !stunned && keys.held("boost") && flux > 0 && carV > 2;
  const drifting = !stunned && keys.held("drift") && !airborne && Math.abs(carV) > 8;
  const jumpTapped = pointerJump || keys.pressed("jump");
  const hoverHeld = !stunned && (pointerHeld || keys.held("jump")) && airborne && flux > 0;
  pointerJump = false;

  // Forward speed.
  const accel = wantBoost ? ACCEL + BOOST_ACCEL : ACCEL;
  const topSpeed = wantBoost ? V_MAX_BOOST : V_MAX;
  if (wantBoost && !boostActive) {
    boostActive = true;
    void vectorNine.sound?.cue("boost");
    vectorNine.juice.fire("boost");
  }
  if (!wantBoost) boostActive = false;
  if (throttle) carV += accel * dt;
  else if (braking) carV -= (carV > 0 ? BRAKE : BRAKE * 0.6) * dt;
  else carV -= Math.sign(carV) * Math.min(Math.abs(carV), 5 * dt);
  const drag = 0.011 * carV * carV + (wantBoost ? 0.4 : 1.1);
  if (Math.abs(carV) > 0.2) carV -= drag * dt * Math.sign(carV);
  if (!throttle && !braking && Math.abs(carV) < 0.15) carV = 0;
  if (carV > topSpeed) carV = topSpeed;
  if (carV < -REVERSE_MAX) carV = -REVERSE_MAX;

  // Flux pool: boost, hover and wall grip all draw from the same charge.
  if (wantBoost) flux -= FLUX_BOOST_DRAIN * dt;
  if (hoverHeld) flux -= FLUX_HOVER_DRAIN * dt;

  // Steering in track space: heading offset δ from the local tangent drives u.
  const steerRate = (2.35 / (1 + Math.abs(carV) / 24)) * (drifting ? 1.8 : 1);
  if (!airborne) {
    carPsi += steer * steerRate * dt * Math.min(1, Math.abs(carV) / 5) * Math.sign(carV || 1);
    driftFactor += ((drifting ? 1 : 0) - driftFactor) * Math.min(1, dt * 8);
    if (drifting) carV *= 1 - 0.32 * dt;
  } else {
    driftFactor *= 1 - Math.min(1, dt * 6);
    // Air rotation: W/S pitch, A/D roll, Q/E spin.
    const pitchIn = (braking ? 1 : 0) - (throttle ? 1 : 0);
    const rollIn = (keys.held("left") ? 1 : 0) - (keys.held("right") ? 1 : 0);
    const yawIn = (keys.held("spinLeft") ? 1 : 0) - (keys.held("spinRight") ? 1 : 0);
    pitch += pitchIn * AIR_PITCH_RATE * dt;
    roll += rollIn * AIR_ROLL_RATE * dt;
    airYawOffset += yawIn * AIR_YAW_RATE * dt;
    airRotation += (Math.abs(pitchIn * AIR_PITCH_RATE) + Math.abs(rollIn * AIR_ROLL_RATE) + Math.abs(yawIn * AIR_YAW_RATE)) * dt;
  }

  const sample = trackAt(carS);
  const delta = wrapAngle(carPsi - sample.psi);
  const ds = carV * Math.cos(delta) * dt;
  let du = carV * Math.sin(delta) * dt;

  // Wall model. Past the deck edge the surface angle is θ = asin(d / WALL_R).
  // Gravity pulls the coupe back down the wall; the grip field (paid for from
  // the flux pool) is what cancels that pull. No flux, no grip.
  const absU = Math.abs(carU);
  wallTheta = airborne ? 0 : wallAngle(Math.max(absU, Math.abs(carU + du)));
  wallRiding = !airborne && wallTheta > 0.06;
  if (wallRiding) {
    const sinTheta = Math.sin(wallTheta);
    const grip = flux > 0 ? 0.16 : 1;
    du -= Math.sign(carU) * GRAVITY * sinTheta * grip * dt;
    carV *= 1 - 0.22 * sinTheta * dt;
    const drain = (FLUX_WALL_BASE + FLUX_WALL_SPEED * (Math.abs(carV) / V_MAX)) * sinTheta;
    flux -= drain * dt;
    if (phase === "racing") {
      const gain = 2.4 * Math.abs(carV) * sinTheta * dt * combo;
      wallStyleRun += gain;
      score += Math.round(gain);
    }
  } else if (wallStyleRun > 12) {
    showToast(`Wall ride +${Math.round(wallStyleRun)}`);
    wallStyleRun = 0;
  }

  carS = ((carS + ds) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
  carU = Math.max(-LIP, Math.min(LIP, carU + du));

  // Vertical: jump, hover, land.
  const groundY = surfaceHeight(Math.abs(carU)) + HOVER_RIDE;
  if (!airborne) {
    carY = groundY;
    if (jumpTapped && !stunned) {
      airborne = true;
      vy = JUMP_V + Math.min(3.5, Math.abs(carV) * 0.06) + (wallRiding ? 1.2 : 0);
      if (wallRiding) carU -= Math.sign(carU) * 2.2; // quarter-pipe transfer
      airTime = 0;
      airRotation = 0;
      void vectorNine.sound?.cue("jump");
      vectorNine.juice.fire("jump");
      gameEvents.push({ type: "jump", label: wallRiding ? "wall launch" : "jump" });
    }
  } else {
    vy -= GRAVITY * dt;
    if (hoverHeld) vy += HOVER_LIFT * dt;
    carY += vy * dt;
    airTime += dt;
    if (carY <= groundY && vy <= 0) {
      carY = groundY;
      land();
    }
  }

  // Recharge only on the deck, only when not spending.
  if (!airborne && !wallRiding && !wantBoost && !hoverHeld) {
    flux = Math.min(FLUX_MAX, flux + FLUX_RECHARGE * dt);
  }
  flux = Math.max(0, Math.min(FLUX_MAX, flux));
}

function land(): void {
  const targetRoll = Math.sign(carU) * wallAngle(Math.abs(carU));
  const pitchError = Math.abs(wrapAngle(pitch));
  const rollError = Math.abs(wrapAngle(roll - targetRoll));
  airborne = false;
  vy = 0;

  if (pitchError > 0.75 || rollError > 0.85) {
    crash("botched landing");
    return;
  }

  const perfect = pitchError < 0.22 && rollError < 0.28;
  pitch = 0;
  roll = targetRoll;
  airYawOffset = 0;

  const flips = airRotation / (Math.PI * 2);
  const base = 30 * airTime + 90 * flips;
  if (base > 25 && phase === "racing") {
    combo = Math.min(9, combo + 1);
    const gain = Math.round(base * combo * (perfect ? 1.5 : 1));
    score += gain;
    showToast(perfect ? `Perfect +${gain}` : `${trickName(airRotation)} +${gain}`);
  }
  void vectorNine.sound?.cue("land");
  if (perfect) {
    void vectorNine.sound?.cue("checkpoint");
    vectorNine.juice.fire("clean");
  } else {
    vectorNine.juice.fire("land");
  }
  vectorNine.fx.burst("dust", [worldX(), carY - 0.3, worldZ()], { count: 8, color: "#cbb58e", speed: 3 });
  airTime = 0;
  airRotation = 0;
}

function trickName(rotation: number): string {
  const flips = rotation / (Math.PI * 2);
  if (flips >= 0.85) return "FLIP";
  return "AIR";
}

function crash(reason: string): void {
  crashCount += 1;
  combo = 1;
  pitch = 0;
  roll = 0;
  airYawOffset = 0;
  airTime = 0;
  airRotation = 0;
  wallStyleRun = 0;
  void vectorNine.sound?.cue("crash");
  vectorNine.juice.fire("crash");
  gameEvents.push({ type: "crash", label: reason, severity: "warning" });
  if (eventIndex === 0) {
    lapTime += CRASH_PENALTY_S;
    showToast(`Crash, +${CRASH_PENALTY_S}s penalty`);
    respawn(false);
  } else {
    stunT = 1.2;
    carV *= 0.25;
    showToast("Crash, combo lost");
  }
}

function respawn(withPenalty: boolean): void {
  const circuit = CIRCUITS[circuitIndex]!;
  const lastGate = checkpointIndex > 0 ? circuit.checkpoints[checkpointIndex - 1]! : circuit.finishGate;
  const gate = GATES[lastGate]!;
  carS = gate.s;
  carU = gate.u;
  const at = trackAt(carS);
  carPsi = at.psi;
  carV = 11;
  carY = surfaceHeight(Math.abs(carU)) + HOVER_RIDE;
  vy = 0;
  airborne = false;
  pitch = 0;
  roll = 0;
  stunT = 0.4;
  flux = Math.max(flux, 45);
  if (withPenalty && eventIndex === 0) {
    lapTime += RESPAWN_PENALTY_S;
    showToast(`Respawn +${RESPAWN_PENALTY_S}s`);
  }
  gameEvents.push({ type: "respawn", label: "respawn at gate" });
}

// ── events: checkpoints, timers, medals ──────────────────────────────────────
/** Checkpoint sequence for the active event: Time Attack uses its circuit's
 *  gate subset; Score Attack sweeps gates 1..9 then finishes across the start
 *  line (gate 0), exactly one lap. Free Ride has no order. */
function activeOrder(): number[] {
  if (eventIndex === 0) return [...CIRCUITS[circuitIndex]!.checkpoints];
  if (eventIndex === 2) return GATES.slice(1).map((gate) => gate.index);
  return [];
}

function stepEventRules(dt: number): void {
  lapTime += dt;
  if (eventIndex === 1) {
    // Free Ride: no clock pressure, no fail state.
    return;
  }

  // Gate crossing (works across the s-wrap).
  const circuit = CIRCUITS[circuitIndex]!;
  const isTimeAttack = eventIndex === 0;
  const order = activeOrder();
  const nextGate = checkpointIndex < order.length ? order[checkpointIndex]! : circuit.finishGate;
  const gate = GATES[nextGate]!;
  if (crossedS(carS, gate.s) && Math.abs(carU - gate.u) < 4.4 && !airborne) {
    checkpointIndex += 1;
    score += 150;
    void vectorNine.sound?.cue("checkpoint");
    vectorNine.juice.fire("checkpoint");
    if (checkpointIndex <= order.length) {
      gameEvents.push({ type: "checkpoint", label: `gate ${checkpointIndex}/${order.length}`, severity: "success" });
    }
    if (checkpointIndex > order.length) {
      finish(false);
      return;
    }
  }
  markerGate = checkpointIndex < order.length ? GATES[order[checkpointIndex]!]! : GATES[circuit.finishGate]!;

  if (isTimeAttack) {
    const timeout = circuit.medals[2] * 2.2;
    if (lapTime > timeout) finish(true);
  } else if (lapTime >= SCORE_WINDOW) {
    finish(false);
  }
}

function crossedS(nowS: number, gateS: number): boolean {
  const a = lastCarS;
  const b = nowS;
  if (Math.abs(b - a) > TRACK_LENGTH / 2) return gateS > Math.min(a, b) || gateS <= Math.max(a, b); // wrapped this frame
  if (a <= b) return gateS > a && gateS <= b;
  return gateS > a || gateS <= b;
}

function finish(timedOut: boolean): void {
  phase = "finished";
  const circuit = CIRCUITS[circuitIndex]!;
  if (eventIndex === 0) {
    if (timedOut) {
      medal = "DNF";
      void vectorNine.sound?.cue("lose");
      vectorNine.juice.fire("lose");
    } else {
      medal = lapTime <= circuit.medals[0] ? "GOLD" : lapTime <= circuit.medals[1] ? "SILVER" : lapTime <= circuit.medals[2] ? "BRONZE" : "—";
      const best = bestTimePerCircuit[circuitIndex];
      if (best === null || lapTime < best) {
        bestTimePerCircuit[circuitIndex] = lapTime;
        saveBests();
      }
      void vectorNine.sound?.cue("win");
      vectorNine.juice.fire("win");
    }
  } else if (eventIndex === 2) {
    if (bestScore === null || score > bestScore) {
      bestScore = score;
      saveBests();
    }
    void vectorNine.sound?.cue("win");
    vectorNine.juice.fire("win");
  }
  gameEvents.push({
    type: "finish",
    label: `${EVENT_NAMES[eventIndex]} · ${eventIndex === 0 ? `${lapTime.toFixed(2)}s ${medal}` : `${score} pts`}`,
    severity: timedOut ? "warning" : "success"
  });
}

function resetRun(nextEvent: number, nextCircuit: number, withToast: boolean): void {
  eventIndex = nextEvent;
  circuitIndex = nextCircuit;
  phase = "countdown";
  countdownT = 3.4;
  lastCountdownShown = 4;
  const startGate = GATES[CIRCUITS[nextCircuit]!.finishGate]!;
  carS = startGate.s;
  carU = startGate.u;
  const at = trackAt(carS);
  carPsi = at.psi;
  carV = 0;
  carY = surfaceHeight(Math.abs(carU)) + HOVER_RIDE;
  vy = 0;
  airborne = false;
  pitch = 0;
  roll = 0;
  airYawOffset = 0;
  driftFactor = 0;
  stunT = 0;
  flux = FLUX_MAX;
  wallRiding = false;
  wallTheta = 0;
  wallStyleRun = 0;
  airTime = 0;
  airRotation = 0;
  lapTime = 0;
  checkpointIndex = 0;
  score = 0;
  combo = 1;
  medal = "";
  lastCarS = carS;
  markerGate = nextCircuitGate();
  syncGates();
  if (withToast) void vectorNine.sound?.cue("ui");
  gameEvents.push({ type: "reset", label: `${EVENT_NAMES[nextEvent]} · ${CIRCUITS[nextCircuit]!.name}` });
}

function nextCircuitGate(): GateDef | null {
  if (eventIndex === 1) return null;
  const order = activeOrder();
  return order.length > 0 ? GATES[order[0]!]! : GATES[CIRCUITS[circuitIndex]!.finishGate]!;
}

// ── persistence (local best-run table only) ─────────────────────────────────
// BESTS_KEY is declared with the game state above — see the TDZ note there.

interface BestsShape {
  ta?: (number | null)[];
  sa?: number | null;
}

function loadBests(): void {
  try {
    const raw = window.localStorage.getItem(BESTS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as BestsShape;
    if (Array.isArray(parsed.ta)) {
      bestTimePerCircuit = [parsed.ta[0] ?? null, parsed.ta[1] ?? null, parsed.ta[2] ?? null];
    }
    if (typeof parsed.sa === "number") bestScore = parsed.sa;
  } catch {
    // Capture environments block storage; bests are optional.
  }
}

function saveBests(): void {
  try {
    const payload: BestsShape = { ta: bestTimePerCircuit, sa: bestScore };
    window.localStorage.setItem(BESTS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

// ── scene ────────────────────────────────────────────────────────────────────
function buildScene(): ReturnType<typeof scene> {
  const deckMaterial = material.pbr({ color: "#8d8177", roughness: 0.93, metalness: 0.04 });
  const wallMaterial = material.pbr({ color: "#ffffff", roughness: 0.95, metalness:0.03 }); // instance-tinted
  const laneMaterial = material.pbr({ color: "#e6d6ac", roughness: 0.85 });
  const waterMaterial = material.pbr({
    color: "#2e4a5c",
    roughness: 0.22,
    metalness: 0.6,
    emissive: "#0d1a26",
    emissiveIntensity: 0.12
  });
  const plinthMaterial = material.pbr({ color: "#6f655b", roughness: 0.95 });
  const gateMaterial = material.pbr({
    color: "#ffffff",
    roughness: 0.6,
    metalness: 0.35,
    emissive: "#ffb46b",
    emissiveIntensity: 0.22
  });
  const markerMaterial = material.neon({ color: "#173a4a", emissive: "#59e0ff", emissiveIntensity: 0.85 });
  const steelMaterial = material.pbr({ color: "#33383e", roughness: 0.55, metalness: 0.62 });
  const seamMaterial = material.pbr({ color: "#6e6559", roughness: 0.97 });
  const wetGlowMaterial = material.pbr({
    color: "#33260f",
    roughness: 0.6,
    emissive: "#ffb46b",
    emissiveIntensity: 0.22
  });
  const chevronMaterial = material.pbr({
    color: "#e8a13c",
    roughness: 0.75,
    emissive: "#ff9a2e",
    emissiveIntensity: 0.15
  });
  const lampMaterial = material.pbr({
    color: "#2c2620",
    roughness: 0.5,
    emissive: "#ffc27a",
    emissiveIntensity: 0.3
  });
  const headlandMaterial = material.pbr({ color: "#4a4036", roughness: 1, metalness: 0 });
  const glitterMaterial = material.pbr({
    color: "#8a5a34",
    roughness: 1,
    emissive: "#ffb46b",
    emissiveIntensity: 0.28
  });

  const nodes: AuraNodeInput[] = [
    // Sea — a wide apron so no floor edge ever crosses the frame.
    primitives.plane({
      name: "sea",
      size: 1000,
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, WATER_Y, 0],
      material: waterMaterial,
      receiveShadow: true
    }),

    // Deck: one box per segment, two instanced pools (each ≤ 64). Instance
    // colors add a slow weathered-slab mottle so the big flat read breaks up.
    instances.box({
      name: "barrage deck a",
      size: 1,
      material: deckMaterial,
      receiveShadow: true,
      transforms: deckTransforms(0, Math.ceil(TRACK_SAMPLES.length / 2)),
      colors: deckColors(0, Math.ceil(TRACK_SAMPLES.length / 2))
    }).runtime(game.runtimeNode("vn-deck-a", { tags: ["deck", "static"] })),
    instances.box({
      name: "barrage deck b",
      size: 1,
      material: deckMaterial,
      receiveShadow: true,
      transforms: deckTransforms(Math.ceil(TRACK_SAMPLES.length / 2), TRACK_SAMPLES.length),
      colors: deckColors(Math.ceil(TRACK_SAMPLES.length / 2), TRACK_SAMPLES.length)
    }).runtime(game.runtimeNode("vn-deck-b", { tags: ["deck", "static"] })),

    // Quarter-pipe walls: 4 facets per side, each its own instanced pool.
    ...wallRingNodes(wallMaterial),

    // Centreline dashes.
    instances.box({
      name: "lane dashes",
      size: 1,
      material: laneMaterial,
      transforms: laneTransforms()
    }).runtime(game.runtimeNode("vn-lane", { tags: ["lane", "static"] })),

    // ── deck dressing ────────────────────────────────────────────────────────
    // Expansion seams crossing the flat deck every ~15 m.
    instances.box({
      name: "deck seams",
      size: 1,
      material: seamMaterial,
      transforms: seamTransforms()
    }).runtime(game.runtimeNode("vn-seams", { tags: ["seam", "static"] })),

    // Runway-style distance ticks along the centreline.
    instances.box({
      name: "centreline ticks",
      size: 1,
      material: laneMaterial,
      transforms: tickTransforms()
    }).runtime(game.runtimeNode("vn-ticks", { tags: ["tick", "static"] })),

    // Painted chevrons before every gate: a >>> aiming at the gate line.
    instances.box({
      name: "gate chevrons",
      size: 1,
      material: chevronMaterial,
      transforms: chevronTransforms()
    }).runtime(game.runtimeNode("vn-chevrons", { tags: ["chevron", "static"] })),

    // Wet-edge glow: faint amber strip where the deck meets each wall base.
    instances.box({
      name: "wet edge glow",
      size: 1,
      material: wetGlowMaterial,
      transforms: wetEdgeTransforms()
    }).runtime(game.runtimeNode("vn-wet-edge", { tags: ["wet", "static"] })),

    // ── foreground anchors (near-field speed cues) ───────────────────────────
    // Guardrail: a steel handrail riding both wall lips, breaking the flat
    // deck horizon, plus its posts.
    instances.box({
      name: "guardrails",
      size: 1,
      material: steelMaterial,
      transforms: railTransforms()
    }).runtime(game.runtimeNode("vn-rails", { tags: ["rail", "static"] })),
    instances.box({
      name: "guardrail posts",
      size: 1,
      material: steelMaterial,
      transforms: railPostTransforms()
    }).runtime(game.runtimeNode("vn-rail-posts", { tags: ["rail", "static"] })),

    // Overhead mast arms jutting over the deck with hanging amber lamps —
    // the classic passing-overhead speed cue. Arms sit at ARM_CLEARANCE_Y,
    // far above any jump apex, and cast long low-sun shadows across the deck.
    instances.box({
      name: "mast arms",
      size: 1,
      material: steelMaterial,
      castShadow: true,
      transforms: armTransforms()
    }).runtime(game.runtimeNode("vn-arms", { tags: ["arm", "scenery"] })),
    instances.box({
      name: "arm lamps",
      size: 1,
      material: lampMaterial,
      transforms: lampTransforms()
    }).runtime(game.runtimeNode("vn-lamps", { tags: ["lamp", "scenery"] })),

    // ── far atmosphere ───────────────────────────────────────────────────────
    // Sun-glitter: broken warm strips on the water along the sun azimuth.
    // One instanced pool, so its bounds span the near region and survive the
    // camera's target-plane cull the same way the gate pool does.
    instances.plane({
      name: "sun glitter",
      size: 1,
      material: glitterMaterial,
      transforms: glitterTransforms()
    }).runtime(game.runtimeNode("vn-glitter", { tags: ["glitter", "static"] })),

    // Distant headlands: dark silhouettes in the haze, one instanced pool
    // (pool bounds span the near region — see the cull note above). Kept
    // inside the camera far plane (280 m): beyond it nothing renders at all.
    instances.box({
      name: "headlands",
      size: 1,
      material: headlandMaterial,
      transforms: headlandTransforms()
    }).runtime(game.runtimeNode("vn-headlands", { tags: ["headland", "static"] })),

    // Plinths for masts and towers, rising from the water.
    instances.box({
      name: "service plinths",
      size: 1,
      material: plinthMaterial,
      transforms: plinthTransforms()
    }).runtime(game.runtimeNode("vn-plinths", { tags: ["plinths", "static"] })),

    // Typed GLB scenery — instanced pools.
    instances.model(assets.vnBarrier, {
      name: "parapet barriers",
      targetMaxDimension: 2.7,
      transforms: barrierTransforms(),
      material: material.pbr({ color: "#a89f90", roughness: 0.9 }),
      instancingAware: true
    }).runtime(game.runtimeNode("vn-barriers", { tags: ["barrier", "scenery"] })),
    instances.model(assets.vnMast, {
      name: "light masts",
      targetMaxDimension: 12,
      transforms: mastTransforms(),
      instancingAware: true,
      castShadow: true
    }).runtime(game.runtimeNode("vn-masts", { tags: ["mast", "scenery"] })),
    instances.model(assets.vnTower, {
      name: "control towers",
      targetMaxDimension: 13,
      transforms: towerTransforms(),
      instancingAware: true,
      castShadow: true
    }).runtime(game.runtimeNode("vn-towers", { tags: ["tower", "scenery"] })),

    // Checkpoint gates (pool is recoloured per checkpoint).
    instances.model(assets.vnGate, {
      name: "checkpoint gates",
      targetMaxDimension: 16,
      transforms: gateTransforms(),
      colors: gateColors(),
      material: gateMaterial,
      instancingAware: true,
      castShadow: true
    }).runtime(game.runtimeNode("vn-gates", { tags: ["gate", "runtime"] })),

    // The hero: a real GLB coupe, never primitives.
    model(assets.vnCoupe, {
      name: "flux coupe",
      targetMaxDimension: 4.4,
      position: [GATES[0]!.x, HOVER_RIDE, GATES[0]!.z],
      castShadow: true
    }).runtime(game.runtimeNode("vn-coupe", { tags: ["coupe", "hero"] })),

    // Camera anchor: a 1 cm box riding inside the coupe (primitives carry no
    // `visible` flag; sub-surface scale makes it unworthy of a pixel). The
    // follow rig reads its position/yaw every frame regardless of drawing.
    primitives.box({
      name: "chase anchor",
      size: 0.01,
      position: [GATES[0]!.x, 1, GATES[0]!.z],
      material: material.pbr({ color: "#000000" })
    }).runtime(game.runtimeNode("chase-anchor", { tags: ["anchor", "camera"] })),

    // Next-checkpoint marker ring (authored in XY; yaw faces it down the track).
    primitives.torus({
      name: "checkpoint marker",
      size: 4 / 0.43,
      position: [GATES[1]!.x, 7.6, GATES[1]!.z],
      material: markerMaterial
    }).runtime(game.runtimeNode("vn-marker", { tags: ["marker", "runtime"] }))
  ];

  return scene()
    // fogDensityScale 0.45: the preset's full 30–180 m fog whitewashes the
    // frame to flat grey once the chase view opens up at speed (measured mean
    // luminance 211, neutral RGB). Halve it and pull exposure — the golden
    // haze mood stays, the far deck stays readable.
    .add(looks.preset(LOOK_ID, { exposureEv: -0.25, fogDensityScale: 0.45 }))
    .addMany(nodes)
    // One camera, one frustum. The target plane sits ~120 m AHEAD of the coupe
    // (past the far edge of readable content) because this engine build culls
    // every render item beyond the camera target; the far plane (280) exceeds
    // that distance so the track ahead survives the cull at any speed.
    .camera(
      camera.follow({
        targetNode: "chase-anchor",
        offsetMode: "target-yaw",
        offset: [0, 4.1, -9.6],
        targetOffset: [0, 7.5, 120],
        fov: 60,
        near: 0.1,
        far: 280,
        smoothing: 0.12
      })
    );
}

// ── static instance layouts ──────────────────────────────────────────────────
/** Deterministic per-segment mottle for the deck: warm/cool drift around 1.0. */
function slabTint(i: number): AuraColor {
  const hash = Math.sin(i * 12.9898) * 43758.5453;
  const w = hash - Math.floor(hash); // 0..1
  const r = 0.965 + 0.06 * w;
  const g = 0.955 + 0.05 * (1 - w);
  const b = 0.94 + 0.07 * ((w * 7) % 1);
  const to2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function deckColors(from: number, to: number): AuraColor[] {
  const colors: AuraColor[] = [];
  for (let i = from; i < to; i += 1) colors.push(slabTint(i));
  return colors;
}

function deckTransforms(from: number, to: number): AuraTransformSpec[] {
  const width = 2 * (DECK_HALF + WALL_R);
  const transforms: AuraTransformSpec[] = [];
  for (let i = from; i < to; i += 1) {
    const at = TRACK_SAMPLES[i % TRACK_SAMPLES.length]!;
    // Adjacent slabs overlap 6% to seal curve joints; with per-slab tints the
    // overlap would z-fight between two colours, so alternate a 6 mm drop —
    // the joint resolves to one owner deterministically.
    transforms.push({
      position: [at.x, -DECK_THICK / 2 - (i % 2) * 0.006, at.z],
      rotation: [0, at.psi, 0],
      scale: [width, DECK_THICK, TRACK_SPACING * 1.06]
    });
  }
  return transforms;
}

function wallRingNodes(wallMaterial: ReturnType<typeof material.pbr>): AuraNodeInput[] {
  const chord = 2 * WALL_R * Math.sin(Math.PI / (2 * WALL_FACETS));
  const facetCount = Math.ceil(TRACK_LENGTH / WALL_FACET_LEN);
  const nodes: AuraNodeInput[] = [];
  for (let side = 0; side < 2; side += 1) {
    const sigma = side === 0 ? 1 : -1; // +1: right wall (+u), −1: left wall
    for (let facet = 0; facet < WALL_FACETS; facet += 1) {
      const alpha = (facet + 0.5) * (Math.PI / (2 * WALL_FACETS));
      const lateral = DECK_HALF + WALL_R * Math.sin(alpha);
      const y = WALL_R * (1 - Math.cos(alpha)) - 0.22 * Math.cos(alpha);
      const shade = 0.92 - facet * 0.07;
      const transforms: AuraTransformSpec[] = [];
      const colors: AuraColor[] = [];
      for (let i = 0; i < facetCount; i += 1) {
        const s = i * (TRACK_LENGTH / facetCount);
        const at = trackAt(s);
        const right = rightOf(at.psi);
        transforms.push({
          position: [at.x + right[0] * sigma * lateral, y, at.z + right[1] * sigma * lateral],
          rotation: propEuler(at.psi, sigma * alpha),
          scale: [chord * 1.1, 0.5, WALL_FACET_LEN * 1.04]
        });
        colors.push(shadeTint(shade));
      }
      nodes.push(
        instances.box({
          name: `wall ${sigma > 0 ? "right" : "left"} facet ${facet}`,
          size: 1,
          material: wallMaterial,
          transforms,
          colors,
          receiveShadow: true
        }).runtime(game.runtimeNode(`vn-wall-${side}-${facet}`, { tags: ["wall", "static"] }))
      );
    }
  }
  return nodes;
}

function shadeTint(shade: number): AuraColor {
  const v = Math.round(Math.min(1, Math.max(0, shade)) * 255);
  const hex = v.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function laneTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const count = Math.ceil(TRACK_LENGTH / LANE_STEP);
  for (let i = 0; i < count; i += 1) {
    const at = trackAt(i * LANE_STEP);
    transforms.push({
      position: [at.x, 0.03, at.z],
      rotation: [0, at.psi, 0],
      scale: [0.35, 0.02, LANE_STEP * 0.45]
    });
  }
  return transforms;
}

/** World point (and tangent heading) at track station s, lateral offset u. */
function trackWorld(s: number, u: number): { x: number; z: number; psi: number } {
  const at = trackAt(s);
  const right = rightOf(at.psi);
  return { x: at.x + right[0] * u, z: at.z + right[1] * u, psi: at.psi };
}

/** A flat painted stroke on the deck from track point a to track point b. */
function deckStroke(a: { x: number; z: number }, b: { x: number; z: number }, y: number, width: number): AuraTransformSpec {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return {
    position: [(a.x + b.x) / 2, y, (a.z + b.z) / 2],
    rotation: [0, Math.atan2(-dx, dz), 0],
    scale: [width, 0.02, len * 1.04]
  };
}

/** Expansion seams: thin darker strips crossing the flat deck every ~15 m. */
function seamTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const count = Math.ceil(TRACK_LENGTH / SEAM_STEP);
  for (let i = 0; i < count; i += 1) {
    const at = trackAt(i * SEAM_STEP + SEAM_STEP * 0.5);
    transforms.push({
      position: [at.x, 0.012, at.z],
      rotation: [0, at.psi, 0],
      scale: [2 * DECK_HALF + 0.5, 0.035, 0.16]
    });
  }
  return transforms;
}

/** Runway-style distance ticks beside the centreline, every ~24 m. */
function tickTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const count = Math.ceil(TRACK_LENGTH / TICK_STEP);
  for (let i = 0; i < count; i += 1) {
    const at = trackAt(i * TICK_STEP);
    const major = i % 4 === 0; // hecatometre marks read wider, like runway stripes
    transforms.push({
      position: [at.x, 0.026, at.z],
      rotation: [0, at.psi, 0],
      scale: [major ? 2.6 : 1.5, 0.02, 0.32]
    });
  }
  return transforms;
}

/** Painted >>> chevrons on approach to each gate, apex on the gate line. */
function chevronTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (const gate of GATES) {
    for (let k = 0; k < CHEVRONS_PER_GATE; k += 1) {
      const s = gate.s - 6 - (CHEVRONS_PER_GATE - 1 - k) * 2.6;
      const apex = trackWorld(s, gate.u);
      const backL = trackWorld(s - 0.62, gate.u - 0.85);
      const backR = trackWorld(s - 0.62, gate.u + 0.85);
      transforms.push(deckStroke(backL, apex, 0.032, 0.42));
      transforms.push(deckStroke(apex, backR, 0.032, 0.42));
    }
  }
  return transforms;
}

/** Wet-edge glow: faint amber strips along both deck/wall-base junctions. */
function wetEdgeTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const count = Math.ceil(TRACK_LENGTH / WET_STEP);
  for (let side = 0; side < 2; side += 1) {
    const sigma = side === 0 ? 1 : -1;
    for (let i = 0; i < count; i += 1) {
      const at = trackAt((i * TRACK_LENGTH) / count + (side === 0 ? 0 : WET_STEP / 2));
      const right = rightOf(at.psi);
      transforms.push({
        position: [at.x + right[0] * sigma * (DECK_HALF - 0.1), 0.013, at.z + right[1] * sigma * (DECK_HALF - 0.1)],
        rotation: [0, at.psi, 0],
        scale: [0.15, 0.022, WET_STEP * 1.02]
      });
    }
  }
  return transforms;
}

/** Guardrail handrail: a continuous thin steel strip along both wall lips. */
function railTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const count = Math.ceil(TRACK_LENGTH / RAIL_STEP);
  const lateral = DECK_HALF + WALL_R + 0.15; // just inside the parapet barriers
  for (let side = 0; side < 2; side += 1) {
    const sigma = side === 0 ? 1 : -1;
    for (let i = 0; i < count; i += 1) {
      const at = trackAt((i * TRACK_LENGTH) / count + (side === 0 ? 0 : RAIL_STEP / 2));
      const right = rightOf(at.psi);
      transforms.push({
        position: [at.x + right[0] * sigma * lateral, WALL_R + 0.55, at.z + right[1] * sigma * lateral],
        rotation: [0, at.psi, 0],
        scale: [0.12, 0.14, RAIL_STEP * 1.03]
      });
    }
  }
  return transforms;
}

/** Guardrail posts, staggered against the rail joints. */
function railPostTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const count = Math.ceil(TRACK_LENGTH / RAIL_STEP);
  const lateral = DECK_HALF + WALL_R + 0.15;
  for (let side = 0; side < 2; side += 1) {
    const sigma = side === 0 ? 1 : -1;
    for (let i = 0; i < count; i += 1) {
      const at = trackAt((i * TRACK_LENGTH) / count + (side === 0 ? RAIL_STEP / 2 : 0));
      const right = rightOf(at.psi);
      transforms.push({
        position: [at.x + right[0] * sigma * lateral, WALL_R + 0.28, at.z + right[1] * sigma * lateral],
        rotation: [0, at.psi, 0],
        scale: [0.1, 0.85, 0.1]
      });
    }
  }
  return transforms;
}

/**
 * Overhead mast arms: a horizontal arm reaches over the deck from every other
 * light mast, alternating sides with the masts themselves. Positioned through
 * trackAt/rightOf so they follow the loop.
 */
function armTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const mastLateral = DECK_HALF + WALL_R + 4;
  for (const i of ARM_MASTS) {
    const at = trackAt((i * TRACK_LENGTH) / MAST_SLOTS + 30);
    const right = rightOf(at.psi);
    const sigma = i % 2 === 0 ? 1 : -1; // the mast's own side (see mastTransforms)
    const lateral = mastLateral - 6; // arm of length 12 spans lateral 8..20
    transforms.push({
      position: [at.x + right[0] * sigma * lateral, ARM_CLEARANCE_Y, at.z + right[1] * sigma * lateral],
      rotation: [0, at.psi, 0],
      scale: [12, 0.3, 0.3]
    });
  }
  return transforms;
}

/** Amber lamps hanging from the mast arms, three per arm. */
function lampTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const mastLateral = DECK_HALF + WALL_R + 4;
  for (const i of ARM_MASTS) {
    const at = trackAt((i * TRACK_LENGTH) / MAST_SLOTS + 30);
    const right = rightOf(at.psi);
    const sigma = i % 2 === 0 ? 1 : -1;
    for (const inward of [5, 8, 11]) {
      const lateral = mastLateral - inward;
      transforms.push({
        position: [at.x + right[0] * sigma * lateral, ARM_CLEARANCE_Y - 0.29, at.z + right[1] * sigma * lateral],
        rotation: [0, at.psi, 0],
        scale: [0.26, 0.54, 0.26]
      });
    }
  }
  return transforms;
}

/**
 * Sun glitter: broken warm strips lying on the water along the sun azimuth
 * (the low sun's reflection path). Laid as instances.plane so one pool's
 * bounds span the near region and survive the target-plane cull.
 */
function glitterTransforms(): AuraTransformSpec[] {
  const yaw = SUN_AZ_RAD - Math.PI / 2; // long axis along the sun direction
  const perpendicular: readonly [number, number] = [Math.cos(SUN_AZ_RAD), -Math.sin(SUN_AZ_RAD)];
  const strips: readonly { readonly offset: number; readonly dist: number; readonly len: number; readonly width: number }[] = [
    { offset: -36, dist: 95, len: 240, width: 10 },
    { offset: -14, dist: 70, len: 300, width: 14 },
    { offset: 10, dist: 105, len: 260, width: 9 },
    { offset: 30, dist: 60, len: 200, width: 7 },
    { offset: -52, dist: 140, len: 160, width: 6 },
    { offset: 0, dist: 150, len: 190, width: 5 }
  ];
  return strips.map((strip, i) => ({
    position: [
      SUN_DIR[0] * strip.dist + perpendicular[0] * strip.offset,
      WATER_Y + 0.07 + i * 0.005,
      SUN_DIR[1] * strip.dist + perpendicular[1] * strip.offset
    ],
    rotation: [-Math.PI / 2, yaw, 0],
    scale: [strip.len, strip.width, 1]
  }));
}

/**
 * Distant headlands: dark silhouettes fading into the golden haze. Radius is
 * bounded by the camera far plane (280 m) — anything farther never renders.
 */
function headlandTransforms(): AuraTransformSpec[] {
  const headlands: readonly { readonly bearing: number; readonly radius: number; readonly width: number; readonly height: number; readonly depth: number }[] = [
    { bearing: 0.52, radius: 236, width: 150, height: 40, depth: 55 }, // backs the sun-glitter path
    { bearing: 1.25, radius: 226, width: 95, height: 28, depth: 45 },
    { bearing: 2.05, radius: 248, width: 180, height: 46, depth: 70 },
    { bearing: 2.95, radius: 224, width: 110, height: 30, depth: 48 },
    { bearing: 4.02, radius: 244, width: 160, height: 38, depth: 60 },
    { bearing: 5.05, radius: 232, width: 120, height: 32, depth: 50 }
  ];
  return headlands.map((hill) => ({
    position: [Math.sin(hill.bearing) * hill.radius, WATER_Y + hill.height / 2 - 1.5, Math.cos(hill.bearing) * hill.radius],
    rotation: [0, hill.bearing, 0],
    scale: [hill.width, hill.height, hill.depth]
  }));
}


function plinthTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const radius = DECK_HALF + WALL_R + 8.5;
  for (let i = 0; i < MAST_SLOTS; i += 1) {
    const at = trackAt((i * TRACK_LENGTH) / MAST_SLOTS + 30);
    const right = rightOf(at.psi);
    const sigma = i % 2 === 0 ? 1 : -1;
    const height = WALL_R - WATER_Y; // plinth rises out of the sea to the mast base
    transforms.push({
      position: [at.x + right[0] * sigma * (radius - 4.5), WATER_Y + height / 2, at.z + right[1] * sigma * (radius - 4.5)],
      rotation: [0, at.psi, 0],
      scale: [2.2, height, 2.2]
    });
  }
  for (let i = 0; i < TOWER_SLOTS; i += 1) {
    const at = trackAt((i * TRACK_LENGTH) / TOWER_SLOTS + 90);
    const right = rightOf(at.psi);
    const sigma = i % 2 === 0 ? -1 : 1;
    const x = at.x + right[0] * sigma * radius;
    const z = at.z + right[1] * sigma * radius;
    const height = WALL_R + 6 - WATER_Y;
    transforms.push({
      position: [x, WATER_Y + height / 2, z],
      rotation: [0, at.psi, 0],
      scale: [9, height, 9]
    });
  }
  return transforms;
}

function barrierTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const perSide = Math.ceil(TRACK_LENGTH / BARRIER_STEP);
  for (let side = 0; side < 2; side += 1) {
    const sigma = side === 0 ? 1 : -1;
    for (let i = 0; i < perSide; i += 1) {
      const at = trackAt((i * TRACK_LENGTH) / perSide + (side === 0 ? 0 : BARRIER_STEP / 2));
      const right = rightOf(at.psi);
      const lateral = DECK_HALF + WALL_R + 0.7;
      transforms.push({
        position: [at.x + right[0] * sigma * lateral, WALL_R + 0.35, at.z + right[1] * sigma * lateral],
        rotation: [0, at.psi, 0]
      });
    }
  }
  return transforms;
}

function mastTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const radius = DECK_HALF + WALL_R + 4;
  for (let i = 0; i < MAST_SLOTS; i += 1) {
    const at = trackAt((i * TRACK_LENGTH) / MAST_SLOTS + 30);
    const right = rightOf(at.psi);
    const sigma = i % 2 === 0 ? 1 : -1;
    transforms.push({
      position: [at.x + right[0] * sigma * radius, WALL_R, at.z + right[1] * sigma * radius],
      rotation: [0, at.psi, 0]
    });
  }
  return transforms;
}

function towerTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const radius = DECK_HALF + WALL_R + 8.5;
  for (let i = 0; i < TOWER_SLOTS; i += 1) {
    const at = trackAt((i * TRACK_LENGTH) / TOWER_SLOTS + 90);
    const right = rightOf(at.psi);
    const sigma = i % 2 === 0 ? -1 : 1;
    transforms.push({
      position: [at.x + right[0] * sigma * radius, WALL_R + 6, at.z + right[1] * sigma * radius],
      rotation: [0, at.psi + Math.PI / 2, 0]
    });
  }
  return transforms;
}

function gateTransforms(): AuraTransformSpec[] {
  return GATES.map((gate) => ({
    position: [gate.x, 0, gate.z],
    rotation: [0, gate.psi, 0]
  }));
}

function gateColors(): AuraColor[] {
  const circuit = CIRCUITS[circuitIndex]!;
  const order = activeOrder();
  const nextGate = checkpointIndex < order.length ? order[checkpointIndex]! : circuit.finishGate;
  return GATES.map((gate) => {
    if (eventIndex === 1) return "#8d8578"; // Free Ride: all lit low
    if (gate.index === nextGate) return "#ffd9a0";
    if (order.includes(gate.index) || gate.index === circuit.finishGate) return "#5b6a75";
    return "#3a3f45";
  });
}

function syncGates(): void {
  if (!gateNode) return;
  gateNode.setInstances(gateTransforms(), gateColors());
}

// ── node mounts ──────────────────────────────────────────────────────────────
function mountNodes(): void {
  gateNode = app.nodes.require("vn-gates");
  coupeNode = app.nodes.require("vn-coupe");
  anchorNode = app.nodes.require("chase-anchor");
  markerNode = app.nodes.require("vn-marker");
}

// ── render ───────────────────────────────────────────────────────────────────
function worldX(): number {
  const at = trackAt(carS);
  const right = rightOf(at.psi);
  return at.x + right[0] * carU;
}

function worldZ(): number {
  const at = trackAt(carS);
  const right = rightOf(at.psi);
  return at.z + right[1] * carU;
}

let lastGateSignature = "";

function render(): void {
  const x = worldX();
  const z = worldZ();

  // Banking: surface angle on the wall + drift lean, damped for readability.
  const surfaceRoll = Math.sign(carU) * wallAngle(Math.abs(carU));
  const leanRoll = airborne ? roll : surfaceRoll - driftFactor * 0.16 * Math.sign(carV);
  const displayRoll = airborne ? roll : leanRoll;
  const displayPitch = airborne ? pitch : -Math.min(0.06, Math.max(-0.06, carV * 0.001));

  const at = trackAt(carS);
  const heading = at.psi + wrapAngle(carPsi - at.psi) + (airborne ? airYawOffset * 0.35 : 0);

  coupeNode?.setPosition(x, carY, z).setRotation(...coupeEuler(heading, displayPitch, displayRoll));

  // Camera anchor: yaw uses the camera convention (mirror of the model yaw),
  // which is what target-yaw offset rotation expects.
  anchorNode?.setPosition(x, carY + 1.1, z).setRotation(0, -heading, 0);

  // Checkpoint marker.
  if (markerNode) {
    if (markerGate && eventIndex !== 1 && phase !== "finished") {
      const bob = Math.sin(frameCount * 0.05) * 0.35;
      markerNode.setVisible(true).setPosition(markerGate.x, 7.4 + bob, markerGate.z).setRotation(0, markerGate.psi, 0);
    } else {
      markerNode.setVisible(false);
    }
  }

  // Gate pool recolour only when the checkpoint signature changes.
  const signature = `${eventIndex}:${circuitIndex}:${checkpointIndex}:${phase}`;
  if (signature !== lastGateSignature) {
    lastGateSignature = signature;
    syncGates();
  }

  lastCarS = carS;
  updateAudioLevels();
  renderHud();
}

// ── audio mixing ─────────────────────────────────────────────────────────────
function updateAudioLevels(): void {
  if (!audioStarted) return;
  const sound = vectorNine.sound;
  if (!sound) return;
  const speedRatio = Math.min(1, Math.abs(carV) / V_MAX_BOOST);
  sound.setCueLevel("engine", { volume: 0.18 + 0.5 * speedRatio, rate: 0.75 + 0.85 * speedRatio });
  sound.setCueLevel("engineHigh", { volume: Math.max(0, (speedRatio - 0.55) / 0.45) * 0.55 });
  sound.setCueLevel("wall", { volume: wallRiding ? Math.min(0.8, Math.sin(wallTheta) * 0.85) : 0 });
  sound.setCueLevel("skid", { volume: driftFactor > 0.4 && !airborne ? 0.45 * driftFactor : 0 });
}

function setMuted(next: boolean): void {
  muted = next;
  vectorNine.sound?.setMuted(next);
  showToast(next ? "Sound off" : "Sound on");
}

function setVolume(next: number): void {
  volume = next;
  vectorNine.sound?.setBusVolume("master", next);
}

// ── HUD (motorsport-grade, system fonts only) ────────────────────────────────
let hudRoot: HTMLElement | undefined;
let controlsRoot: HTMLElement | undefined;
let tlEventEl: HTMLElement | undefined;
let tlTimeEl: HTMLElement | undefined;
let tlGateEl: HTMLElement | undefined;
let tlPipsEl: HTMLElement | undefined;
let tlStatusEl: HTMLElement | undefined;
let paceEl: HTMLElement | undefined;
let speedNumEl: HTMLElement | undefined;
let rpmFillEl: HTMLElement | undefined;
let speedoStateEl: HTMLElement | undefined;
let fluxFillEl: HTMLElement | undefined;
let fluxBarEl: HTMLElement | undefined;
let fluxPctEl: HTMLElement | undefined;
let fluxTagEl: HTMLElement | undefined;
let centerStatusEl: HTMLElement | undefined;
let promptEl: HTMLElement | undefined;
let lastPipSignature = "";
let lastPaceSignature = "";

const HUD_FONT = `-apple-system, "SF Pro Display", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif`;
const HUD_MONO = `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;

function hudStyles(): string {
  return `
#vn-tl,#vn-tr,#vn-speedo,#vn-flux-wrap,#vn-prompt{position:absolute;z-index:6;pointer-events:none;
  font-family:${HUD_FONT};color:#e9e4d8;letter-spacing:.01em;
  -webkit-user-select:none;user-select:none}
.vn-panel{background:rgba(10,14,24,0.60);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  border:1px solid rgba(255,182,72,0.26);border-radius:10px}
#vn-tl{left:16px;top:14px;padding:10px 14px 9px;min-width:196px}
#vn-tr{right:16px;top:14px;width:236px;display:flex;flex-direction:column;gap:8px;pointer-events:auto}
.vn-eyebrow{font-size:10px;font-weight:700;letter-spacing:.32em;color:#ffb648}
.vn-event{margin-top:3px;font-size:12px;font-weight:600;color:#f2ead9}
.vn-clock{margin-top:4px;font:700 24px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#ffffff}
.vn-clock small{font:600 10px/1 ${HUD_FONT};letter-spacing:.22em;color:#9aa4b2;margin-left:6px}
.vn-gate{margin-top:3px;font:600 10px/1.4 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#9aa4b2}
.vn-pips{display:flex;gap:5px;margin-top:7px;align-items:center}
.vn-pip{width:7px;height:7px;border-radius:50%;background:rgba(233,228,216,0.16)}
.vn-pip.done{background:#ffb648;box-shadow:0 0 6px rgba(255,182,72,0.55)}
.vn-pip.next{background:transparent;border:1.5px solid #59e0ff;box-shadow:0 0 7px rgba(89,224,255,0.6);animation:vnpulse 1.1s ease-in-out infinite}
.vn-pip.fin{border-radius:2px}
@keyframes vnpulse{50%{opacity:.35}}
.vn-tl-status{margin-top:7px;font-size:11px;color:#c9c2b2;min-height:14px}
.vn-tr-panel{padding:9px 11px}
.vn-btnrow{display:flex;gap:5px;flex-wrap:wrap}
.vn-btn{font:600 10px/1 ${HUD_FONT};letter-spacing:.06em;color:#e9e4d8;cursor:pointer;
  background:rgba(233,228,216,0.07);border:1px solid rgba(233,228,216,0.18);border-radius:6px;
  padding:5px 8px;transition:background .15s,border-color .15s}
.vn-btn:hover{background:rgba(255,182,72,0.14);border-color:rgba(255,182,72,0.5)}
.vn-btn.on{background:rgba(255,182,72,0.22);border-color:rgba(255,182,72,0.65);color:#ffd9a0}
.vn-keys{margin-top:7px;font-size:9.5px;line-height:1.7;color:#8b93a1}
.vn-vol{display:flex;align-items:center;gap:7px;margin-top:8px}
.vn-vol label{font:600 9px/1 ${HUD_FONT};letter-spacing:.18em;color:#9aa4b2}
.vn-vol input{flex:1;accent-color:#ffb648;height:3px;cursor:pointer}
.vn-pace-head{display:flex;justify-content:space-between;align-items:baseline}
.vn-pace-title{font-size:10px;font-weight:700;letter-spacing:.26em;color:#9aa4b2}
.vn-pace-proj{font:700 13px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#ffffff}
.vn-pace-rows{margin-top:6px;display:flex;flex-direction:column;gap:2px}
.vn-pace-row{display:flex;justify-content:space-between;font:600 10.5px/1.5 ${HUD_MONO};
  font-variant-numeric:tabular-nums;opacity:.34;transition:opacity .2s}
.vn-pace-row.live{opacity:1}
.vn-pace-row .medal{letter-spacing:.14em}
.vn-pace-best{margin-top:6px;font:600 10px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#8b93a1}
.vn-score-big{font:700 26px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#ffffff}
.vn-score-sub{margin-top:3px;font:600 10.5px/1.5 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#9aa4b2}
#vn-speedo{right:16px;bottom:16px;padding:10px 16px 12px;text-align:right}
.vn-speed-row{display:flex;align-items:baseline;justify-content:flex-end;gap:7px}
#vn-speed-num{font:700 46px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#ffffff;
  text-shadow:0 0 18px rgba(255,214,150,0.25)}
.vn-speed-unit{font:600 11px/1 ${HUD_FONT};letter-spacing:.2em;color:#9aa4b2}
#vn-rpm{position:relative;width:176px;height:7px;margin-top:8px;border-radius:4px;
  background:rgba(233,228,216,0.10);overflow:hidden}
#vn-rpm-fill{height:100%;width:0%;border-radius:4px;
  background:linear-gradient(90deg,#3ec2e8 0%,#ffd166 62%,#ff5d7d 100%);transition:width .08s linear}
#vn-rpm::after{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,transparent 0 20.5px,rgba(10,14,24,0.85) 20.5px 22px)}
#vn-speedo.boosting #vn-rpm-fill{box-shadow:0 0 12px rgba(255,182,72,0.8)}
.vn-speed-state{margin-top:6px;display:flex;justify-content:flex-end;gap:6px}
.vn-chip{font:700 9px/1 ${HUD_FONT};letter-spacing:.22em;padding:3px 7px;border-radius:4px;
  color:#ffd9a0;background:rgba(255,182,72,0.16);border:1px solid rgba(255,182,72,0.4);
  opacity:0;transition:opacity .15s}
.vn-chip.on{opacity:1}
.vn-chip.air{color:#9ceeff;background:rgba(89,224,255,0.13);border-color:rgba(89,224,255,0.4)}
#vn-flux-wrap{left:50%;bottom:16px;transform:translateX(-50%);width:min(58vw,620px);text-align:center}
.vn-flux-label{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
#vn-flux-tag{font:700 10px/1 ${HUD_FONT};letter-spacing:.3em;color:#8fd8ef}
#vn-flux-wrap.wall #vn-flux-tag{color:#ffb648}
#vn-flux-wrap.low #vn-flux-tag{color:#ff8ba0}
#vn-flux-pct{font:700 13px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;color:#e9e4d8}
#vn-flux-bar{position:relative;height:15px;border-radius:7px;background:rgba(10,14,24,0.72);
  border:1px solid rgba(233,228,216,0.14);overflow:hidden}
#vn-flux-fill{height:100%;width:100%;border-radius:6px;
  background:linear-gradient(90deg,#2fb9dd,#59e0ff);transition:width .1s linear}
#vn-flux-wrap.wall #vn-flux-fill{background:linear-gradient(90deg,#59e0ff,#ffb648);
  box-shadow:0 0 16px rgba(255,182,72,0.55)}
#vn-flux-wrap.low #vn-flux-fill{background:linear-gradient(90deg,#ff5d7d,#be123c);
  box-shadow:0 0 16px rgba(255,93,125,0.55);animation:vnlow .5s ease-in-out infinite alternate}
@keyframes vnlow{to{filter:brightness(1.45)}}
#vn-flux-segs{position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(90deg,transparent 0 calc(100%/24 - 2px),rgba(7,11,20,0.92) calc(100%/24 - 2px) calc(100%/24))}
#vn-center-status{margin-bottom:8px;min-height:22px;font:700 15px/1.3 ${HUD_FONT};color:#ffd9a0;
  text-shadow:0 0 14px rgba(255,182,72,0.4)}
#vn-center-status .count{font:800 54px/1 ${HUD_MONO};font-variant-numeric:tabular-nums;
  color:#ffb648;text-shadow:0 0 28px rgba(255,182,72,0.65);animation:vnpulse 1s ease-in-out infinite}
#vn-center-status .dim{font-weight:600;font-size:11.5px;color:#9aa4b2;text-shadow:none;letter-spacing:.04em}
#vn-center-status .go{font:800 40px/1 ${HUD_FONT};letter-spacing:.14em;color:#7be0ff;
  text-shadow:0 0 30px rgba(89,224,255,0.7)}
#vn-prompt{left:50%;bottom:104px;transform:translateX(-50%);padding:8px 14px;
  display:flex;gap:14px;align-items:center;white-space:nowrap;opacity:0;visibility:hidden;
  transition:opacity .25s,visibility .25s}
#vn-prompt.show{opacity:1;visibility:visible}
.vn-kbd-row{display:flex;gap:6px;align-items:center;font-size:10.5px;color:#c9c2b2}
.vn-kbd{font:700 9.5px/1 ${HUD_MONO};color:#ffd9a0;background:rgba(255,182,72,0.10);
  border:1px solid rgba(255,182,72,0.45);border-bottom-width:2px;border-radius:5px;padding:3px 6px}
.vn-kbd.cy{color:#9ceeff;background:rgba(89,224,255,0.10);border-color:rgba(89,224,255,0.45)}
@media (max-width:820px){#vn-prompt{display:none}#vn-tr{width:188px}#vn-speedo{padding:8px 12px 10px}}
`;
}

function buildHud(): void {
  if (hudRoot) return;

  const style = document.createElement("style");
  style.textContent = hudStyles();
  document.head.append(style);

  // Top-left: identity, event, lap clock, checkpoint pips.
  hudRoot = document.createElement("aside");
  hudRoot.id = "vn-tl";
  hudRoot.className = "vn-panel";
  hudRoot.innerHTML = [
    `<div class="vn-eyebrow">VECTOR NINE</div>`,
    `<div class="vn-event" id="vn-tl-event">TIME ATTACK · EBB RUN</div>`,
    `<div class="vn-clock"><span id="vn-tl-time">0:00.00</span><small>LAP</small></div>`,
    `<div class="vn-gate" id="vn-tl-gate">gate 1/5</div>`,
    `<div class="vn-pips" id="vn-tl-pips"></div>`,
    `<div class="vn-tl-status" id="vn-tl-status"></div>`
  ].join("");
  document.body.append(hudRoot);
  tlEventEl = hudRoot.querySelector<HTMLElement>("#vn-tl-event") ?? undefined;
  tlTimeEl = hudRoot.querySelector<HTMLElement>("#vn-tl-time") ?? undefined;
  tlGateEl = hudRoot.querySelector<HTMLElement>("#vn-tl-gate") ?? undefined;
  tlPipsEl = hudRoot.querySelector<HTMLElement>("#vn-tl-pips") ?? undefined;
  tlStatusEl = hudRoot.querySelector<HTMLElement>("#vn-tl-status") ?? undefined;

  // Top-right: event controls, sound, then the pace / score panel.
  controlsRoot = document.createElement("aside");
  controlsRoot.id = "vn-tr";
  const controlsPanel = document.createElement("div");
  controlsPanel.className = "vn-panel vn-tr-panel";
  controlsPanel.innerHTML = [
    `<div class="vn-btnrow">`,
    `<button type="button" class="vn-btn" data-event="0">TIME ATTACK</button>`,
    `<button type="button" class="vn-btn" data-event="1">FREE RIDE</button>`,
    `<button type="button" class="vn-btn" data-event="2">SCORE ATTACK</button>`,
    `</div>`,
    `<div class="vn-btnrow" style="margin-top:6px">`,
    `<button type="button" class="vn-btn" data-action="circuit" style="flex:1">CIRCUIT · EBB RUN</button>`,
    `<button type="button" class="vn-btn" data-action="mute">SOUND</button>`,
    `<button type="button" class="vn-btn" data-action="restart">RESTART</button>`,
    `</div>`,
    `<div class="vn-vol"><label>VOL</label><input id="vn-volume" type="range" min="0" max="100" value="90" /></div>`,
    `<div class="vn-keys">N circuit · R restart · M sound<br />Enter respawn · 1/2/3 event</div>`
  ].join("");
  controlsRoot.append(controlsPanel);
  const pacePanel = document.createElement("div");
  pacePanel.className = "vn-panel vn-tr-panel";
  pacePanel.innerHTML = `<div id="vn-pace"></div>`;
  controlsRoot.append(pacePanel);
  document.body.append(controlsRoot);
  paceEl = pacePanel.querySelector<HTMLElement>("#vn-pace") ?? undefined;

  controlsRoot.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const event = button.getAttribute("data-event");
      const action = button.getAttribute("data-action");
      if (event !== null) switchEvent(Number(event));
      else if (action === "circuit") {
        circuitIndex = (circuitIndex + 1) % CIRCUITS.length;
        resetRun(eventIndex, circuitIndex, true);
      } else if (action === "mute") setMuted(!muted);
      else if (action === "restart") resetRun(eventIndex, circuitIndex, true);
      startAudio();
      button.blur();
    });
  });
  const volumeInput = controlsRoot.querySelector<HTMLInputElement>("#vn-volume");
  volumeInput?.addEventListener("input", () => {
    setVolume(Number(volumeInput.value) / 100);
  });
  volumeInput?.addEventListener("change", () => volumeInput.blur());

  // Bottom-right: the speedo with rpm-style sweep.
  const speedo = document.createElement("div");
  speedo.id = "vn-speedo";
  speedo.className = "vn-panel";
  speedo.innerHTML = [
    `<div class="vn-speed-row"><span id="vn-speed-num">0</span><span class="vn-speed-unit">KM/H</span></div>`,
    `<div id="vn-rpm"><div id="vn-rpm-fill"></div></div>`,
    `<div class="vn-speed-state">`,
    `<span class="vn-chip" id="vn-chip-boost">BOOST</span>`,
    `<span class="vn-chip air" id="vn-chip-air">AIR</span>`,
    `<span class="vn-chip" id="vn-chip-wall">WALL</span>`,
    `</div>`
  ].join("");
  document.body.append(speedo);
  speedNumEl = speedo.querySelector<HTMLElement>("#vn-speed-num") ?? undefined;
  rpmFillEl = speedo.querySelector<HTMLElement>("#vn-rpm-fill") ?? undefined;
  speedoStateEl = speedo;

  // Bottom-centre: the FLUX GRIP bar — the visual star.
  const fluxWrap = document.createElement("div");
  fluxWrap.id = "vn-flux-wrap";
  fluxWrap.innerHTML = [
    `<div id="vn-center-status"></div>`,
    `<div class="vn-flux-label"><span id="vn-flux-tag">FLUX GRIP</span><span id="vn-flux-pct">100%</span></div>`,
    `<div id="vn-flux-bar"><div id="vn-flux-fill"></div><div id="vn-flux-segs"></div></div>`
  ].join("");
  document.body.append(fluxWrap);
  fluxFillEl = fluxWrap.querySelector<HTMLElement>("#vn-flux-fill") ?? undefined;
  fluxBarEl = fluxWrap;
  fluxPctEl = fluxWrap.querySelector<HTMLElement>("#vn-flux-pct") ?? undefined;
  fluxTagEl = fluxWrap.querySelector<HTMLElement>("#vn-flux-tag") ?? undefined;
  centerStatusEl = fluxWrap.querySelector<HTMLElement>("#vn-center-status") ?? undefined;

  // Bottom-centre prompt bar (idle/countdown), with kbd chips.
  const prompt = document.createElement("div");
  prompt.id = "vn-prompt";
  prompt.className = "vn-panel";
  prompt.innerHTML = [
    `<span class="vn-kbd-row"><span class="vn-kbd">W</span> throttle</span>`,
    `<span class="vn-kbd-row"><span class="vn-kbd">SHIFT</span> boost</span>`,
    `<span class="vn-kbd-row"><span class="vn-kbd cy">SPACE</span> jump · hold hover</span>`,
    `<span class="vn-kbd-row"><span class="vn-kbd">X</span> drift</span>`
  ].join("");
  document.body.append(prompt);
  promptEl = prompt;
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function pipRowHtml(): string {
  if (eventIndex === 1) return `<span class="vn-gate" style="margin:0">free run · no gates</span>`;
  const total = activeOrder().length + 1;
  const pips: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const cls = i < checkpointIndex ? "vn-pip done" : i === checkpointIndex ? "vn-pip next" : "vn-pip";
    pips.push(`<span class="${cls}${i === total - 1 ? " fin" : ""}"></span>`);
  }
  return pips.join("");
}

function paceHtml(): string {
  if (eventIndex === 0) {
    const circuit = CIRCUITS[circuitIndex]!;
    const startS = GATES[circuit.finishGate]!.s;
    const frac = (((carS - startS) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH / TRACK_LENGTH;
    const projected = phase === "racing" && frac > 0.03 ? lapTime / frac : null;
    const names = ["GOLD", "SILVER", "BRONZE"] as const;
    const colors = ["#ffd166", "#ccd5df", "#d29a6a"] as const;
    const bestAchievable = projected === null
      ? 2
      : projected <= circuit.medals[0] ? 0 : projected <= circuit.medals[1] ? 1 : 2;
    const rows = circuit.medals
      .map((target, i) => {
        const live = projected !== null && i === bestAchievable && projected <= circuit.medals[2]!;
        return `<div class="vn-pace-row${live ? " live" : ""}">` +
          `<span class="medal" style="color:${colors[i]}">${live ? "▸ " : ""}${names[i]}</span>` +
          `<span>${formatClock(target)}</span></div>`;
      })
      .join("");
    const best = bestTimePerCircuit[circuitIndex];
    return [
      `<div class="vn-pace-head"><span class="vn-pace-title">MEDAL PACE</span>` +
        `<span class="vn-pace-proj">${projected === null ? "—" : formatClock(projected)}</span></div>`,
      `<div class="vn-pace-rows">${rows}</div>`,
      `<div class="vn-pace-best">BEST ${best !== null ? formatClock(best) : "—"}</div>`
    ].join("");
  }
  if (eventIndex === 2) {
    return [
      `<div class="vn-pace-head"><span class="vn-pace-title">SCORE ATTACK</span>` +
        `<span class="vn-pace-proj">${Math.max(0, SCORE_WINDOW - lapTime).toFixed(1)}s</span></div>`,
      `<div class="vn-score-big" style="margin-top:4px">${score.toLocaleString()}</div>`,
      `<div class="vn-score-sub">combo ×${combo} · best ${bestScore !== null ? bestScore.toLocaleString() : "—"}</div>`
    ].join("");
  }
  return [
    `<div class="vn-pace-head"><span class="vn-pace-title">FREE RIDE</span></div>`,
    `<div class="vn-score-big" style="margin-top:4px">${score.toLocaleString()}</div>`,
    `<div class="vn-score-sub">combo ×${combo} · no clock, no fail</div>`
  ].join("");
}

function renderHud(): void {
  buildHud();
  if (frameCount - hudFrame < 4 && frameCount > 1) return;
  hudFrame = frameCount;

  const circuit = CIRCUITS[circuitIndex]!;

  // Speedo: tabular readout + rpm-style sweep + state chips.
  if (speedNumEl) speedNumEl.textContent = String(Math.round(Math.abs(carV) * 3.6));
  if (rpmFillEl) rpmFillEl.style.width = `${Math.min(100, (Math.abs(carV) / V_MAX_BOOST) * 100)}%`;
  if (speedoStateEl) {
    speedoStateEl.classList.toggle("boosting", boostActive);
    const boostChip = speedoStateEl.querySelector<HTMLElement>("#vn-chip-boost");
    const airChip = speedoStateEl.querySelector<HTMLElement>("#vn-chip-air");
    const wallChip = speedoStateEl.querySelector<HTMLElement>("#vn-chip-wall");
    if (boostChip) boostChip.classList.toggle("on", boostActive);
    if (airChip) airChip.classList.toggle("on", airborne);
    if (wallChip) wallChip.classList.toggle("on", wallRiding);
  }

  // Flux grip bar: segmented, cyan → amber on the wall, red under 18%.
  const fluxPct = Math.round((flux / FLUX_MAX) * 100);
  if (fluxFillEl) fluxFillEl.style.width = `${fluxPct}%`;
  if (fluxPctEl) fluxPctEl.textContent = `${fluxPct}%${wallRiding ? " GRIP" : ""}`;
  if (fluxTagEl) fluxTagEl.textContent = wallRiding ? "FLUX · WALL GRIP" : fluxPct < 18 ? "FLUX LOW" : "FLUX GRIP";
  if (fluxBarEl) {
    fluxBarEl.classList.toggle("wall", wallRiding);
    fluxBarEl.classList.toggle("low", fluxPct < 18 && !wallRiding);
  }

  // Top-left: event, clock, gate line, pips.
  if (tlEventEl) {
    tlEventEl.textContent =
      eventIndex === 0 ? `TIME ATTACK · ${circuit.name.toUpperCase()}` : EVENT_NAMES[eventIndex]!.toUpperCase();
  }
  if (tlTimeEl) tlTimeEl.textContent = eventIndex === 1 ? "—" : formatClock(lapTime);
  if (tlGateEl) {
    if (eventIndex === 0) {
      const total = circuit.checkpoints.length + 1;
      tlGateEl.textContent = `GATE ${Math.min(checkpointIndex + 1, total)}/${total}`;
    } else if (eventIndex === 2) {
      tlGateEl.textContent = `GATE ${Math.min(checkpointIndex + 1, GATE_COUNT)}/${GATE_COUNT}`;
    } else {
      tlGateEl.textContent = "OPEN DECK";
    }
  }
  if (tlPipsEl) {
    const pipSignature = `${eventIndex}:${circuitIndex}:${checkpointIndex}`;
    if (pipSignature !== lastPipSignature) {
      lastPipSignature = pipSignature;
      tlPipsEl.innerHTML = pipRowHtml();
    }
  }
  if (tlStatusEl) {
    tlStatusEl.textContent =
      airborne && phase === "racing" ? "air · W/S pitch · A/D roll · Q/E spin" : "";
  }

  // Top-right: medal pace / event stats, then control states.
  if (paceEl) {
    const paceSignature = `${eventIndex}:${circuitIndex}:${phase}:${Math.floor(lapTime * 2)}:${score >> 3}:${combo}`;
    if (paceSignature !== lastPaceSignature) {
      lastPaceSignature = paceSignature;
      paceEl.innerHTML = paceHtml();
    }
  }
  if (controlsRoot) {
    const circuitButton = controlsRoot.querySelector<HTMLButtonElement>('[data-action="circuit"]');
    if (circuitButton) circuitButton.textContent = `CIRCUIT · ${circuit.name.toUpperCase()}`;
    controlsRoot.querySelectorAll<HTMLButtonElement>("button[data-event]").forEach((button) => {
      button.classList.toggle("on", Number(button.getAttribute("data-event")) === eventIndex);
    });
    const muteButton = controlsRoot.querySelector<HTMLButtonElement>('[data-action="mute"]');
    if (muteButton) muteButton.textContent = muted ? "MUTED" : "SOUND";
  }

  // Centre status: countdown > GO > toast > finish > wall grip > idle hint.
  if (centerStatusEl) {
    if (phase === "countdown") {
      centerStatusEl.innerHTML = `<span class="count">${Math.min(3, Math.max(1, Math.ceil(countdownT)))}</span>`;
    } else if (phase === "finished") {
      centerStatusEl.innerHTML = `<span style="color:#ffd166">${finishedLine().toUpperCase()}</span>`;
    } else if (lapTime < 0.9) {
      centerStatusEl.innerHTML = `<span class="go">GO</span>`;
    } else if (toastT > 0 && toast) {
      centerStatusEl.innerHTML = `<span style="color:#ffd9a0">${toast}</span>`;
    } else if (wallRiding) {
      centerStatusEl.innerHTML = `<span style="color:#ffb648">WALL GRIP · ${Math.round((wallTheta * 180) / Math.PI)}°</span>`;
    } else {
      centerStatusEl.innerHTML = `<span class="dim">BOOST AND WALL GRIP SHARE ONE POOL</span>`;
    }
  }

  // Prompt bar: countdown and idle only.
  if (promptEl) {
    const idle = phase === "countdown" || (phase === "racing" && Math.abs(carV) < 2 && lapTime > 1);
    promptEl.classList.toggle("show", idle);
  }
}

function finishedLine(): string {
  if (eventIndex === 0) {
    return medal === "DNF" ? `Timed out, press R` : `Finish ${lapTime.toFixed(2)}s (${medal}), press R`;
  }
  if (eventIndex === 2) return `Time ${score.toLocaleString()} pts, press R`;
  return "Session ended — press R";
}

function showToast(text: string): void {
  toast = text;
  toastT = 2.2;
}

// ── evidence beacon ──────────────────────────────────────────────────────────
function publish(): void {
  const circuit = CIRCUITS[circuitIndex]!;
  const state: VectorNineState = {
    frame: frameCount,
    speed: +Math.abs(carV).toFixed(2),
    speedKph: Math.round(Math.abs(carV) * 3.6),
    fluxEnergy: +flux.toFixed(1),
    wallRiding,
    wallAngleDeg: Math.round((wallTheta * 180) / Math.PI),
    airborne,
    event: EVENT_NAMES[eventIndex],
    circuit: eventIndex === 0 ? circuit.name : "—",
    checkpointIndex,
    checkpointCount: eventIndex === 0 ? circuit.checkpoints.length + 1 : GATE_COUNT,
    lapTime: +lapTime.toFixed(2),
    score,
    combo,
    bestTime: bestTimePerCircuit[circuitIndex],
    bestScore,
    medal: phase === "finished" ? medal : "",
    gameOver: phase === "finished",
    look: { id: LOOK_ID },
    assetIds: ["vnCoupe", "vnGate", "vnBarrier", "vnMast", "vnTower"]
  };
  window.__AURA3D_ARCADE_STATE__ = state;
  window.__AURA3D_VECTOR_NINE__ = state;
}

function hideBootGate(): void {
  const gate = document.getElementById("boot-gate");
  if (!gate) return;
  gate.style.opacity = "0";
  gate.style.pointerEvents = "none";
  window.setTimeout(() => gate.remove(), 320);
}
