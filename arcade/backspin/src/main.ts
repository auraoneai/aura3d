/**
 * BACKSPIN — a one-button trick chainer.
 *
 * Tap to launch a trick, tap again in the air to extend it, hold to hover on a
 * limited air tank. You must land inside an angle cone, and the cone NARROWS as
 * your Link climbs — so the better you get, the tighter the margin. Difficulty
 * scales with skill rather than with elapsed time.
 *
 * The bike stays at x=0 and the world scrolls past it. That keeps the camera
 * fixed, which sidesteps the engine's depth-clipping behaviour around a moving
 * camera entirely.
 *
 * Z PLANE GUARD: the compiled scene culls every render item whose world bounds
 * sit at negative Z (the frustum it culls with does not match the posed
 * camera). ALL visible content here lives at z >= PLAY_Z > 0 — gameplay plane,
 * gates, canyon roofs and skyline towers alike. Nothing is ever placed behind
 * the camera's target plane.
 *
 * SKYLINE PARALLAX: the world scrolls past the bike in four depth planes —
 * roofs (z ≈ 1, full speed), the near tower line (z ≈ 4.2, ×0.35), a denser
 * hazy tower band (z ≈ 6, ×0.28) and far building silhouettes with lit
 * windows (z ≈ 9, ×0.15), with a moon and a low glow band pinned behind them.
 * Every layer wraps like the roofs do; every layer stays wholly at z > 0.
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
  type AuraTransformSpec
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";

const LOOK_ID = "night-city" as const;

const GROUND_Y = 0;
const BIKE_X = 0;
const GRAVITY = -20;
const TAP_LIFT = 7.6;
const AIR_TAP_LIFT = 4.6;
const HOVER_LIFT = 26;
const AIR_CAPACITY = 1.15;
const AIR_DRAIN = 0.62;
const AIR_REFILL = 0.4;

const BASE_CONE = 0.55; // radians
const CONE_PER_LINK = 0.035;
const MIN_CONE = 0.16;
const PERFECT_FRACTION = 0.35;

const SEGMENT_COUNT = 10;
const SEGMENT_WIDTH = 4;
const GATE_COUNT = 4;
const GATE_SPACING = 11;
const TOWER_COUNT = 5;
const TOWER_SPACING = 9;

// Gameplay depth. Everything visible stays at z >= PLAY_Z: the cull frustum
// silently deletes render items whose world bounds reach negative Z, so the
// old tower line at z = -5 was invisible. Roofs, gates, bike, towers and every
// fx burst are placed relative to this plane.
const PLAY_Z = 1.0;
const TOWER_Z = 4.2;

// Rooftop canyon silhouette: deterministic per-segment drops, size factors and
// depth staggers (no RNG — restart must rebuild the exact same skyline), plus
// per-tower heights. The ride line stays at GROUND_Y; roofs step DOWN from it
// so the frame reads as a canyon of varying rooftops, not a flat strip.
const ROOF_DROP: readonly number[] = [0.0, 0.55, 1.15, 0.3, 0.85, 1.45, 0.15, 0.95, 0.5, 1.25];
const ROOF_SIZE: readonly number[] = [1.0, 0.92, 1.08, 0.96, 1.05, 0.9, 1.06, 0.94, 1.02, 0.88];
const ROOF_STAGGER: readonly number[] = [0.0, 0.25, 0.5, 0.15, 0.4, 0.6, 0.1, 0.35, 0.2, 0.45];
const TOWER_HEIGHT: readonly number[] = [6.5, 9.5, 7.5, 11.0, 8.5];
const TOWER_BURY = 3.0; // towers rise from below the frame line, tops vary

// ── skyline depth planes (all masses, never hero props — primitives are legal) ─
// Layer A, far: dark building silhouettes at z ≈ 8.6-9.8 with sparse emissive
// windows. Wraps over its own span like the roofs, scrolling at SKY_A_PARALLAX.
const SKY_A_COUNT = 24;
const SKY_A_SPAN = 60; // wrap width; pops at ±30, far past the visible ±8
const SKY_A_PARALLAX = 0.15;
const SKY_A_Z_BASE = 8.6;
const SKY_A_Z_RANGE = 1.2;
const SKY_A_BURY = 2.6; // silhouette bases hide behind the glow band + roofs
const SKY_A_WARM_MAX = 48; // window pool caps — MAX_GPU_INSTANCES batches at 64
const SKY_A_COOL_MAX = 40;
// Layer B, mid: denser bsTower copies at z ≈ 6, hazier tint than the near line.
const SKY_B_COUNT = 12;
const SKY_B_SPAN = 48;
const SKY_B_PARALLAX = 0.28;
const SKY_B_Z = 5.9;
const SKY_B_Z_STAGGER = 0.35;
const SKY_B_BASE_HEIGHT = 7.5; // per-instance uniform scale varies the height
const SKY_B_BURY = 3.2;
// The glow band and moon are pinned (infinitely far things do not parallax).
const GLOW_BAND_Z = 7.2;
const MOON_POSITION: readonly [number, number, number] = [-4.4, 5.2, 9.6];
const MOON_DIAMETER = 1.05;
// Cone HUD thresholds (display only — the mechanic itself is untouched).
const CONE_WARN_DEG = 40;
const CONE_BASE_DEG = 63;

// bsRoof's height as a fraction of its max dimension. model() normalises to a
// unit cube, so a roof scaled to max dimension S is ROOF_Y_RATIO × S tall —
// without this, the roofs' tops rise ABOVE the ride line and bury the bike.
const ROOF_Y_RATIO = assets.bsRoof.bounds[1] / Math.max(...assets.bsRoof.bounds);
// Roof depth (z extent) as a fraction of its max dimension — seats the edge
// safety strips on the top FRONT lip of each roof. bsTower's footprint ratio
// seats the cyan edge-light strips on the near corner of the front towers.
const ROOF_Z_RATIO = assets.bsRoof.bounds[2] / Math.max(...assets.bsRoof.bounds);
const TOWER_WIDTH_RATIO = assets.bsTower.bounds[0] / Math.max(...assets.bsTower.bounds);

interface BackspinState {
  readonly frame: number;
  readonly score: number;
  readonly best: number;
  readonly multiplier: number;
  readonly link: number;
  readonly comboState: "grounded" | "airborne" | "extended" | "hovering" | "crashed";
  readonly distance: number;
  readonly speed: number;
  readonly airborne: boolean;
  readonly height: number;
  readonly coneDeg: number;
  readonly air: number;
  readonly gameOver: boolean;
  readonly look: { readonly id: string };
  readonly assetIds: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_ARCADE_STATE__?: BackspinState;
  }
}

const inputOptions = {
  actions: {
    trick: ["Space", "ArrowUp", "KeyW"],
    restart: ["KeyR"]
  },
  bufferMs: 120
} as const;

const gameEvents = game.eventLog({ label: "backspin events", maxEvents: 24 });

// ── state (declared above createGame: its scene factory runs immediately) ────
let height = 0;
let velocityY = 0;
let angle = 0;
let angularVelocity = 0;
let airborne = false;
let air = AIR_CAPACITY;
let link = 0;
let runBestLink = 0;
let score = 0;
let best = 0;
let distance = 0;
let speed = 7.2;
let gameOver = false;
let frameCount = 0;
let groundedFor = 0;
let holdActive = false;
let trickUsed = false;
let comboExtended = false;
let crashFlash = 0;
let hoverCued = false;
let lastStreakAt = 0;
let lastMoteAt = 0;

const segmentNodes: AuraRuntimeNodeHandle[] = [];
const gateNodes: AuraRuntimeNodeHandle[] = [];
const towerNodes: AuraRuntimeNodeHandle[] = [];
let bikeNode: AuraRuntimeNodeHandle | undefined;
// Skyline pool handles — updated in place via setInstances, never re-mounted.
let skyBuildingNode: AuraRuntimeNodeHandle | undefined;
let skyWindowWarmNode: AuraRuntimeNodeHandle | undefined;
let skyWindowCoolNode: AuraRuntimeNodeHandle | undefined;
let skyTowerFarNode: AuraRuntimeNodeHandle | undefined;
let roofStripNode: AuraRuntimeNodeHandle | undefined;
let towerEdgeNode: AuraRuntimeNodeHandle | undefined;

const segmentX: number[] = [];
const gateX: number[] = [];
const towerX: number[] = [];
const skyAX: number[] = [];
const skyBX: number[] = [];

const backspin = createGame({
  id: "backspin",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: { theme: "arcade-neon", widgets: [] },
  touch: { preset: "dpad-2btn", bindings: { left: "trick", right: "trick", dash: "trick", jump: "trick", attack: "trick" } },
  // Renderer quality + DPR come from the look, never hand-set in authored code.
  ...looks.appOptions(LOOK_ID),
  sound: {
    buses: [
      { id: "master", volume: 0.7 },
      { id: "music", volume: 0.5 },
      { id: "sfx", volume: 0.9 }
    ],
    cues: {
      // looping night-city bed — the music bus, started on first user gesture
      music: { id: "music", bus: "music", asset: { url: sfxUrl("ambience.city-night") }, volume: 0.5, loop: true },
      trick: { id: "trick", bus: "sfx", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 },
      extend: { id: "extend", bus: "sfx", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.5 },
      hover: { id: "hover", bus: "sfx", asset: { url: sfxUrl("ui.toggle.01") }, volume: 0.3 },
      land: { id: "land", bus: "sfx", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.55 },
      perfect: { id: "perfect", bus: "sfx", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.7 },
      comboUp: { id: "comboUp", bus: "sfx", asset: { url: sfxUrl("pickup.combo-up.00") }, volume: 0.65 },
      crash: { id: "crash", bus: "sfx", asset: { url: sfxUrl("impact.stone.heavy.00") }, volume: 0.85 },
      over: { id: "over", bus: "sfx", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 }
    }
  },
  juice: {
    trick: { punch: { fovDeg: 1.2, ms: 180 }, shake: 0.1 },
    extend: { punch: { fovDeg: 1.6, ms: 200 }, shake: 0.14 },
    land: { flash: { color: "#7be0ff", peak: 0.14, ms: 180 }, shake: 0.16 },
    perfect: { flash: { color: "#ffd166", peak: 0.22, ms: 240 }, punch: { fovDeg: 2, ms: 220 } },
    comboUp: { flash: { color: "#ffd166", peak: 0.2, ms: 240 }, punch: { fovDeg: 1.8, ms: 240 } },
    crash: { flash: { color: "#ff5d7d", peak: 0.32, ms: 320 }, shake: 0.5 },
    over: { vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: { schema: 1, sections: { backspin: () => window.__AURA3D_ARCADE_STATE__ ?? { status: "unbound" } } }
});

const app = backspin.app;
const input = backspin.input;
if (!input) throw new Error("backspin failed to create runtime-owned input.");

await app.ready();
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("arcade");

layoutWorld();
mountNodes();
backspin.start();
hideBootGate();

app.onFrame(({ dt }) => {
  const raw = Math.min(dt, 0.05);
  // feel timers advance on REAL time, otherwise a hit-stop would never end.
  feel.update(raw * 1000);
  frameCount += 1;
  if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - raw * 3);
  // Gameplay routes through the feel time-scale: hit-stop briefly dips it to 0.
  const step = feel.effectiveDt(raw * 1000) / 1000;
  // Restart is read before the game-over early return so a lost run can restart.
  if (input!.pressed("restart")) restartRun();
  if (!gameOver) {
    stepInput(step);
    stepPhysics(step);
    scrollWorld(step);
    emitSpeedLines();
    emitAmbientMotes();
  }
  render();
  publish();
});

// ── input ────────────────────────────────────────────────────────────────────
// Tap-anywhere surface for touch and mouse. The on-screen touch buttons stay
// wired through the createGame touch bindings; this adds the rest of the
// screen (and holds: pointerdown presses the action, pointerup releases it, so
// hold-to-hover works with a finger, not just the space bar).
const canvas = app.canvas;
let pointerTrick = false;
if (canvas) {
  canvas.addEventListener("pointerdown", () => {
    ensureAudioStarted();
    if (gameOver) {
      restartRun();
      return;
    }
    pointerTrick = true;
    input!.press("trick");
  });
}
window.addEventListener("pointerup", () => {
  if (!pointerTrick) return;
  pointerTrick = false;
  input!.release("trick");
});
window.addEventListener("pointercancel", () => {
  if (!pointerTrick) return;
  pointerTrick = false;
  input!.release("trick");
});

function stepInput(step: number): void {
  const pressed = input!.pressed("trick");
  holdActive = input!.held("trick");

  if (pressed) {
    ensureAudioStarted();
    if (!airborne) {
      velocityY = TAP_LIFT;
      airborne = true;
      angularVelocity = 7.0;
      trickUsed = true;
      comboExtended = false;
      void backspin.sound?.cue("trick");
      backspin.juice.fire("trick");
      gameEvents.push({ type: "trick", label: "kickflip" });
    } else if (trickUsed && !comboExtended) {
      velocityY += AIR_TAP_LIFT;
      angularVelocity += 6.0;
      comboExtended = true;
      void backspin.sound?.cue("extend");
      backspin.juice.fire("extend");
      gameEvents.push({ type: "trick", label: "backflip combo" });
    }
  }

  // hold to hover, draining the air tank
  if (airborne && holdActive && air > 0) {
    if (!hoverCued) {
      hoverCued = true;
      void backspin.sound?.cue("hover");
    }
    velocityY += HOVER_LIFT * step;
    air = Math.max(0, air - AIR_DRAIN * step);
  } else {
    hoverCued = false;
  }
}

function stepPhysics(step: number): void {
  if (airborne) {
    velocityY += GRAVITY * step;
    height += velocityY * step;
    angle += angularVelocity * step;

    if (height <= 0) {
      height = 0;
      land();
    }
  } else {
    groundedFor += step;
    if (groundedFor > 1.6 && link > 0) {
      link = 0;
      runBestLink = 0;
      gameEvents.push({ type: "link-lost", label: "link lost", severity: "warning" });
    }
  }
  speed = Math.min(16, 7.2 + distance * 0.012);
  distance += speed * step;
}

// Landing bands: exactly perfect / clean / crash. Inside the cone and within
// PERFECT_FRACTION of it -> perfect; inside the cone otherwise -> clean;
// outside the cone -> crash. There is no fourth band.
function land(): void {
  const normalized = normalizeAngle(angle);
  const cone = currentCone();
  const error = Math.abs(normalized);

  if (error > cone) {
    crash();
    return;
  }

  const perfect = error <= cone * PERFECT_FRACTION;
  link = Math.min(9, link + 1);
  const gain = Math.round(100 * link * (perfect ? 1.5 : 1));
  score += gain;
  air = Math.min(AIR_CAPACITY, air + AIR_REFILL);
  groundedFor = 0;
  airborne = false;
  velocityY = 0;
  angle = 0;
  angularVelocity = 0;
  trickUsed = false;
  comboExtended = false;

  // juice: brief time-scale dip plus a dust burst on the touchdown point
  feel.hitStop(perfect ? 90 : 45);
  backspin.fx.burst("dust", [BIKE_X + 0.3, GROUND_Y + 0.05, PLAY_Z], {
    count: perfect ? 18 : 12,
    speed: perfect ? 3.2 : 2.4,
    color: "#8fa7c8",
    normal: [0, 1, 0],
    seed: frameCount
  });
  if (perfect) {
    backspin.fx.burst("spark", [BIKE_X, GROUND_Y + 0.9, PLAY_Z], {
      count: 10,
      speed: 3.4,
      color: "#ffd166",
      seed: frameCount + 1
    });
  }
  if (link > runBestLink) {
    runBestLink = link;
    if (link >= 2) {
      void backspin.sound?.cue("comboUp");
      backspin.juice.fire("comboUp");
    }
  }
  void backspin.sound?.cue(perfect ? "perfect" : "land");
  backspin.juice.fire(perfect ? "perfect" : "land");
  gameEvents.push({ type: perfect ? "perfect" : "land", label: perfect ? "perfect" : "clean landing", severity: "success", value: gain });
}

function crash(): void {
  gameOver = true;
  best = Math.max(best, score);
  crashFlash = 1;
  feel.hitStop(130);
  backspin.fx.burst("debris", [BIKE_X, GROUND_Y + 0.6, PLAY_Z], {
    count: 20,
    speed: 4.6,
    color: "#ff5d7d",
    seed: frameCount
  });
  void backspin.sound?.cue("crash");
  backspin.juice.fire("crash");
  void backspin.sound?.cue("over");
  backspin.juice.fire("over");
  gameEvents.push({ type: "crash", label: `crashed at ${Math.round((errorOf(angle) * 180) / Math.PI)}deg`, severity: "warning" });
}

// speed lines while airborne or fast: streaks stream past the bike on the
// gameplay plane (z stays positive — the fx pool culls like everything else)
function emitSpeedLines(): void {
  const fast = speed > 10.5;
  if (!airborne && !fast) return;
  const now = performance.now();
  if (now - lastStreakAt < 90) return;
  lastStreakAt = now;
  const x = 2.4 + Math.random() * 2.2;
  const y = GROUND_Y + 0.45 + height + (Math.random() - 0.5) * 1.6;
  backspin.fx.burst("streak", [x, y, PLAY_Z + 0.25], {
    count: 2 + Math.floor(Math.random() * 2),
    speed: 5 + speed * 0.55,
    color: "#7be0ff",
    normal: [-1, 0, 0],
    seed: frameCount
  });
}

// Air motes: slow, sparse "bubble" fx high in frame — the rising preset
// (gravity −2, 0.6–1.2 s life) plus a ~2/s cadence keeps at most a couple of
// faint specks alive at once, so the upper air reads inhabited, not noisy.
function emitAmbientMotes(): void {
  const now = performance.now();
  if (now - lastMoteAt < 420) return;
  lastMoteAt = now;
  backspin.fx.burst("bubble", [-6 + Math.random() * 12, 3.6 + Math.random() * 1.8, PLAY_Z + 0.5], {
    count: 1,
    speed: 0.55,
    color: "#9fd8ff",
    seed: frameCount + 7
  });
}

function errorOf(a: number): number {
  return Math.abs(normalizeAngle(a));
}

function normalizeAngle(a: number): number {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function currentCone(): number {
  return Math.max(MIN_CONE, BASE_CONE - link * CONE_PER_LINK);
}

// Restart mutates state + node handles only. Never setScene(): the stage stays
// mounted, render() re-applies positions/scales through app.nodes.require(...)
// handles on the next frame.
function restartRun(): void {
  ensureAudioStarted();
  height = 0;
  velocityY = 0;
  angle = 0;
  angularVelocity = 0;
  airborne = false;
  air = AIR_CAPACITY;
  link = 0;
  runBestLink = 0;
  score = 0;
  distance = 0;
  speed = 7.2;
  gameOver = false;
  groundedFor = 0;
  crashFlash = 0;
  hoverCued = false;
  lastStreakAt = 0;
  lastMoteAt = 0;
  layoutWorld();
  applyCanyonSilhouette();
  gameEvents.push({ type: "restart", label: "restart" });
}

// ── world ────────────────────────────────────────────────────────────────────
function layoutWorld(): void {
  segmentX.length = 0;
  for (let i = 0; i < SEGMENT_COUNT; i += 1) segmentX.push((i - 2) * SEGMENT_WIDTH);
  gateX.length = 0;
  for (let i = 0; i < GATE_COUNT; i += 1) gateX.push(6 + i * GATE_SPACING);
  towerX.length = 0;
  for (let i = 0; i < TOWER_COUNT; i += 1) towerX.push((i - 1) * TOWER_SPACING);
  // Skyline slots: deterministic (hash-jittered, no RNG) so a restart rebuilds
  // the exact same city. Wrapping happens in scrollWorld per layer.
  skyAX.length = 0;
  for (let i = 0; i < SKY_A_COUNT; i += 1) {
    skyAX.push(-SKY_A_SPAN / 2 + (i + 0.5) * (SKY_A_SPAN / SKY_A_COUNT) + (hash01(i + 260) - 0.5) * 1.1);
  }
  skyBX.length = 0;
  for (let i = 0; i < SKY_B_COUNT; i += 1) {
    skyBX.push(-SKY_B_SPAN / 2 + (i + 0.5) * (SKY_B_SPAN / SKY_B_COUNT) + (hash01(i + 350) - 0.5) * 3.4);
  }
}

function scrollWorld(step: number): void {
  const dx = speed * step;
  const span = SEGMENT_COUNT * SEGMENT_WIDTH;
  for (let i = 0; i < segmentX.length; i += 1) {
    segmentX[i] = segmentX[i]! - dx;
    if (segmentX[i]! < -span / 2) segmentX[i] = segmentX[i]! + span;
  }
  const gateSpan = GATE_COUNT * GATE_SPACING;
  for (let i = 0; i < gateX.length; i += 1) {
    gateX[i] = gateX[i]! - dx;
    if (gateX[i]! < -8) gateX[i] = gateX[i]! + gateSpan;
  }
  const towerSpan = TOWER_COUNT * TOWER_SPACING;
  for (let i = 0; i < towerX.length; i += 1) {
    towerX[i] = towerX[i]! - dx * 0.35;
    if (towerX[i]! < -towerSpan / 2) towerX[i] = towerX[i]! + towerSpan;
  }
  // Far city: slower than the near tower line, and slowest of all — the
  // parallax gradient (1.0 → 0.35 → 0.28 → 0.15) is what sells the depth.
  for (let i = 0; i < skyBX.length; i += 1) {
    skyBX[i] = skyBX[i]! - dx * SKY_B_PARALLAX;
    if (skyBX[i]! < -SKY_B_SPAN / 2) skyBX[i] = skyBX[i]! + SKY_B_SPAN;
  }
  for (let i = 0; i < skyAX.length; i += 1) {
    skyAX[i] = skyAX[i]! - dx * SKY_A_PARALLAX;
    if (skyAX[i]! < -SKY_A_SPAN / 2) skyAX[i] = skyAX[i]! + SKY_A_SPAN;
  }
}

// ── skyline transform builders ───────────────────────────────────────────────
// Deterministic value noise: same city on every restart and every capture.
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function skyABuildingWidth(i: number): number {
  return 1.5 + hash01(i + 40) * 1.7;
}
function skyABuildingHeight(i: number): number {
  return 3.8 + hash01(i + 80) * 4.2;
}
function skyABuildingDepth(i: number): number {
  return 1.6 + hash01(i + 120) * 0.8;
}
function skyABuildingZ(i: number): number {
  return SKY_A_Z_BASE + hash01(i + 160) * SKY_A_Z_RANGE;
}

function skyABuildingTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < SKY_A_COUNT; i += 1) {
    const h = skyABuildingHeight(i);
    transforms.push({
      position: [skyAX[i] ?? 0, h / 2 - SKY_A_BURY, skyABuildingZ(i)],
      scale: [skyABuildingWidth(i), h, skyABuildingDepth(i)]
    });
  }
  return transforms;
}

// Instance colors multiply the BASE color only (never the emissive), so this
// is a per-building shade multiplier: some masses hang back, some step forward.
function skyABuildingColors(): AuraColor[] {
  const colors: AuraColor[] = [];
  for (let i = 0; i < SKY_A_COUNT; i += 1) {
    const shade = Math.min(1, 0.72 + hash01(i + 200) * 0.5);
    const v = Math.round(shade * 255)
      .toString(16)
      .padStart(2, "0");
    colors.push(`#${v}${v}${v}`);
  }
  return colors;
}

// Sparse window lights on the front faces of the far silhouettes — a scatter,
// never a wall of light. Emissive lives on the pool material (amber or cool),
// so tone is chosen by pool; lit cells are picked by the deterministic hash.
function skyAWindowTransforms(tone: "warm" | "cool"): AuraTransformSpec[] {
  const cap = tone === "warm" ? SKY_A_WARM_MAX : SKY_A_COOL_MAX;
  const toneSalt = tone === "warm" ? 0 : 53;
  const perBuilding: AuraTransformSpec[][] = Array.from({ length: SKY_A_COUNT }, () => []);
  for (let i = 0; i < SKY_A_COUNT; i += 1) {
    const w = skyABuildingWidth(i);
    const h = skyABuildingHeight(i);
    const d = skyABuildingDepth(i);
    const frontZ = skyABuildingZ(i) + d / 2 + 0.04;
    const cols = Math.max(2, Math.floor(w / 0.52));
    for (let row = 0; ; row += 1) {
      const y = -SKY_A_BURY + 0.85 + row * 0.64;
      if (y > h - SKY_A_BURY - 0.32) break;
      for (let col = 0; col < cols; col += 1) {
        const v = hash01(i * 97 + row * 13 + col * 7 + toneSalt);
        const lit = tone === "warm" ? v < 0.055 : v >= 0.055 && v < 0.105;
        if (!lit) continue;
        perBuilding[i]!.push({
          position: [(skyAX[i] ?? 0) - w / 2 + ((col + 0.5) * w) / cols, y, frontZ],
          scale: [0.11, 0.14, 0.05]
        });
      }
    }
  }
  // Interleave round-robin across buildings so a pool cap can never hollow out
  // one end of the strip — the skyline stays evenly lit end to end.
  const transforms: AuraTransformSpec[] = [];
  const maxRound = Math.max(0, ...perBuilding.map((list) => list.length));
  for (let round = 0; round < maxRound; round += 1) {
    for (let i = 0; i < SKY_A_COUNT; i += 1) {
      if (transforms.length >= cap) return transforms;
      const t = perBuilding[i]![round];
      if (t) transforms.push(t);
    }
  }
  return transforms;
}

function skyBTowerScale(i: number): number {
  return 0.7 + hash01(i + 300) * 0.58;
}

function skyBTowerTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < SKY_B_COUNT; i += 1) {
    const s = skyBTowerScale(i);
    const h = SKY_B_BASE_HEIGHT * s;
    transforms.push({
      position: [skyBX[i] ?? 0, h / 2 - SKY_B_BURY, SKY_B_Z + (i % 3) * SKY_B_Z_STAGGER],
      scale: s
    });
  }
  return transforms;
}

// Amber safety strips on the top FRONT lip of every roof — the lit edge that
// separates each dark roof mass from the ones behind it.
function roofStripTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const size = SEGMENT_WIDTH * (ROOF_SIZE[i] ?? 1);
    const drop = ROOF_DROP[i] ?? 0;
    const stagger = ROOF_STAGGER[i] ?? 0;
    transforms.push({
      position: [
        segmentX[i] ?? 0,
        GROUND_Y - drop + 0.035,
        PLAY_Z + stagger + (ROOF_Z_RATIO * size) / 2 - 0.14
      ],
      scale: [size * 0.94, 0.05, 0.16]
    });
  }
  return transforms;
}

// Cyan edge-light on the near corner of the two closest towers — a rim-light
// counterpoint to the amber roof strips, riding the towers as they scroll.
function towerEdgeTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < 2; i += 1) {
    const h = TOWER_HEIGHT[i] ?? 7.5;
    const half = (TOWER_WIDTH_RATIO * h) / 2;
    transforms.push({
      position: [(towerX[i] ?? 0) + half - 0.035, h / 2 - TOWER_BURY + 0.35, TOWER_Z + i * 0.15 + half],
      scale: [0.06, h * 0.72, 0.06]
    });
  }
  return transforms;
}

// ── scene ────────────────────────────────────────────────────────────────────
function buildScene() {
  const nodes: AuraNodeInput[] = [
    ...Array.from({ length: SEGMENT_COUNT }, (_, index) =>
      model(assets.bsRoof, {
        name: `roof segment ${index}`,
        targetMaxDimension: SEGMENT_WIDTH,
        // sink so the top surface starts at the ride line; render() re-seats
        // every frame with the canyon drop applied
        position: [0, GROUND_Y - (ROOF_Y_RATIO * SEGMENT_WIDTH) / 2, PLAY_Z],
        // the raw Meshy roof texture is near-white and blows out under the
        // night-city look — tint it into the palette (color multiplies texture)
        material: material.pbr({ color: "#8fa0bd", roughness: 0.74, metalness: 0.3 }),
        castShadow: true,
        receiveShadow: true
      }).runtime(game.runtimeNode(`roof-${index}`, { tags: ["roof", "runtime"] }))
    ),
    ...Array.from({ length: GATE_COUNT }, (_, index) =>
      model(assets.bsGate, {
        name: `roof gate ${index}`,
        targetMaxDimension: 3.2,
        position: [0, GROUND_Y, PLAY_Z + 0.3],
        castShadow: true
      }).runtime(game.runtimeNode(`gate-${index}`, { tags: ["gate", "runtime"] }))
    ),
    ...Array.from({ length: TOWER_COUNT }, (_, index) =>
      model(assets.bsTower, {
        name: `skyline tower ${index}`,
        targetHeight: TOWER_HEIGHT[index] ?? 7.5,
        position: [0, GROUND_Y, TOWER_Z],
        material: material.pbr({ color: "#2a3550", roughness: 0.7, metalness: 0.2, emissive: "#101a33", emissiveIntensity: 0.35 })
      }).runtime(game.runtimeNode(`tower-${index}`, { tags: ["tower", "runtime"] }))
    ),
    // ── far city, layer A: silhouette masses with sparse lit windows ──
    // Instanced primitives are environment masses, not hero props. The pool
    // material carries the faint emissive that lifts the silhouettes out of
    // crushed black; instance colors only vary the base-color shade.
    instances.box({
      name: "far skyline silhouettes",
      size: 1,
      material: material.pbr({
        color: "#1b2540",
        roughness: 0.9,
        metalness: 0.1,
        emissive: "#0c1526",
        emissiveIntensity: 0.3
      }),
      transforms: skyABuildingTransforms(),
      colors: skyABuildingColors()
    }).runtime(game.runtimeNode("sky-a-buildings", { tags: ["skyline", "runtime"] })),
    instances.box({
      name: "far skyline warm windows",
      size: 1,
      material: material.pbr({
        color: "#171207",
        roughness: 0.55,
        metalness: 0,
        emissive: "#ffb35c",
        emissiveIntensity: 0.45
      }),
      transforms: skyAWindowTransforms("warm")
    }).runtime(game.runtimeNode("sky-a-windows-warm", { tags: ["skyline", "runtime"] })),
    instances.box({
      name: "far skyline cool windows",
      size: 1,
      material: material.pbr({
        color: "#0d1420",
        roughness: 0.55,
        metalness: 0,
        emissive: "#9fd8ff",
        emissiveIntensity: 0.4
      }),
      transforms: skyAWindowTransforms("cool")
    }).runtime(game.runtimeNode("sky-a-windows-cool", { tags: ["skyline", "runtime"] })),
    // ── mid city, layer B: dense bsTower copies, hazier than the near line ──
    instances.model(assets.bsTower, {
      name: "mid skyline towers",
      targetHeight: SKY_B_BASE_HEIGHT,
      transforms: skyBTowerTransforms(),
      material: material.pbr({
        color: "#4a5a7d",
        roughness: 0.72,
        metalness: 0.2,
        emissive: "#0e1830",
        emissiveIntensity: 0.22
      }),
      instancingAware: true
    }).runtime(game.runtimeNode("sky-b-towers", { tags: ["skyline", "runtime"] })),
    // ── pinned sky: glow band between the mid and far layers, moon high left ──
    primitives.box({
      name: "low city glow band",
      size: [96, 1.7, 0.24],
      position: [0, 0.85, GLOW_BAND_Z],
      material: material.pbr({
        color: "#16233f",
        roughness: 1,
        metalness: 0,
        emissive: "#122038",
        emissiveIntensity: 0.28
      })
    }),
    primitives.sphere({
      name: "moon",
      size: MOON_DIAMETER,
      position: [...MOON_POSITION],
      material: material.pbr({
        color: "#141c2e",
        roughness: 0.9,
        metalness: 0,
        emissive: "#dfe9ff",
        emissiveIntensity: 0.5
      })
    }),
    // ── light separation: lit edges on the ride line and the near towers ──
    instances.box({
      name: "roof edge safety strips",
      size: 1,
      material: material.pbr({
        color: "#2a1c0c",
        roughness: 0.5,
        metalness: 0.1,
        emissive: "#ffb35c",
        emissiveIntensity: 0.35
      }),
      transforms: roofStripTransforms()
    }).runtime(game.runtimeNode("roof-strips", { tags: ["roof", "runtime"] })),
    instances.box({
      name: "tower edge lights",
      size: 1,
      material: material.pbr({
        color: "#08131c",
        roughness: 0.4,
        metalness: 0.2,
        emissive: "#37d6ff",
        emissiveIntensity: 0.4
      }),
      transforms: towerEdgeTransforms()
    }).runtime(game.runtimeNode("tower-edges", { tags: ["tower", "runtime"] })),
    // bsSpeeder is the wheel-less hover speeder (the first hero generation
    // came back as a wheeled motorcycle — Meshy pulls "bike" toward wheels, so
    // the regenerated prompt describes geometry only and never says motorcycle).
    model(assets.bsSpeeder, {
      name: "hoverbike",
      targetMaxDimension: 1.5,
      position: [BIKE_X, GROUND_Y + 0.45, PLAY_Z],
      material: material.pbr({
        color: "#dfe9ff",
        roughness: 0.25,
        metalness: 0.6,
        emissive: "#37d6ff",
        emissiveIntensity: 0.55
      }),
      castShadow: true
    }).runtime(game.runtimeNode("bike", { tags: ["bike", "runtime"] }))
  ];

  return scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0, exposureEv: -0.1 }))
    .addMany(nodes)
    // Side-on orthographic: no perspective distortion, and it keeps every object
    // well inside the frustum, which avoids the depth clipping that a tilted
    // perspective camera causes in this engine version. Target plane z=0 with
    // all content at z >= PLAY_Z: nothing is ever culled past the target.
    .camera(
      camera.orthographic({
        position: [0, 1.8, 16],
        target: [0, 1.8, 0],
        orthographicSize: 4.2,
        near: 0.1,
        far: 60
      })
    );
}

function mountNodes(): void {
  segmentNodes.length = 0;
  for (let i = 0; i < SEGMENT_COUNT; i += 1) segmentNodes.push(app.nodes.require(`roof-${i}`));
  gateNodes.length = 0;
  for (let i = 0; i < GATE_COUNT; i += 1) gateNodes.push(app.nodes.require(`gate-${i}`));
  towerNodes.length = 0;
  for (let i = 0; i < TOWER_COUNT; i += 1) towerNodes.push(app.nodes.require(`tower-${i}`));
  skyBuildingNode = app.nodes.require("sky-a-buildings");
  skyWindowWarmNode = app.nodes.require("sky-a-windows-warm");
  skyWindowCoolNode = app.nodes.require("sky-a-windows-cool");
  skyTowerFarNode = app.nodes.require("sky-b-towers");
  roofStripNode = app.nodes.require("roof-strips");
  towerEdgeNode = app.nodes.require("tower-edges");
  bikeNode = app.nodes.require("bike");
  applyCanyonSilhouette();
}

// Vary roof scale/depth once per mount/restart; height variation is applied
// per-frame in render() alongside the scroll position.
function applyCanyonSilhouette(): void {
  segmentNodes.forEach((node, index) => {
    node.setScale(SEGMENT_WIDTH * (ROOF_SIZE[index] ?? 1));
  });
}

// ── render ───────────────────────────────────────────────────────────────────
function render(): void {
  segmentNodes.forEach((node, index) => {
    const drop = ROOF_DROP[index] ?? 0;
    const stagger = ROOF_STAGGER[index] ?? 0;
    const size = SEGMENT_WIDTH * (ROOF_SIZE[index] ?? 1);
    // the roof's TOP surface rides at GROUND_Y - drop; the centre sinks by
    // half the scaled height so the bike can never end up inside the mesh
    node.setPosition(segmentX[index] ?? 0, GROUND_Y - drop - (ROOF_Y_RATIO * size) / 2, PLAY_Z + stagger);
  });
  gateNodes.forEach((node, index) => {
    node.setPosition(gateX[index] ?? 0, GROUND_Y, PLAY_Z + 0.3);
  });
  towerNodes.forEach((node, index) => {
    const h = TOWER_HEIGHT[index] ?? 7.5;
    node.setPosition(towerX[index] ?? 0, h / 2 - TOWER_BURY, TOWER_Z + index * 0.15);
  });
  // Skyline pools ride the same frame: windows are recomputed from the wrapped
  // building slots, so every layer stays glued to its own scroll speed.
  skyBuildingNode?.setInstances(skyABuildingTransforms(), skyABuildingColors());
  skyWindowWarmNode?.setInstances(skyAWindowTransforms("warm"));
  skyWindowCoolNode?.setInstances(skyAWindowTransforms("cool"));
  skyTowerFarNode?.setInstances(skyBTowerTransforms());
  roofStripNode?.setInstances(roofStripTransforms());
  towerEdgeNode?.setInstances(towerEdgeTransforms());
  bikeNode
    ?.setVisible(true)
    .setPosition(BIKE_X, GROUND_Y + 0.45 + height, PLAY_Z)
    .setRotation(0, 0, angle);
  renderHud();
}

// ── audio ────────────────────────────────────────────────────────────────────
// Browsers gate audio behind a gesture: the night-city bed starts on the first
// trick tap / pointerdown / restart, then loops for the session.
let audioStarted = false;
function ensureAudioStarted(): void {
  if (audioStarted) return;
  const sound = backspin.sound;
  if (!sound) return;
  audioStarted = true;
  sound
    .unlock()
    .then(() => sound.cue("music"))
    .catch(() => {
      audioStarted = false;
    });
}

// ── HUD ──────────────────────────────────────────────────────────────────────
// Designed night-neon HUD. One glass panel top-left (identity + run readouts),
// a prompt pill bottom-centre, the volume cluster top-right — nothing ever
// enters the bottom-left third where the bike rides. DOM is built once and
// mutated per frame (no innerHTML churn), so meters can animate smoothly.
const HUD_CSS = `
#backspin-hud, #backspin-volume, #backspin-prompt {
  position: absolute; z-index: 5;
  font: 500 12px/1.45 Graphik, system-ui, sans-serif;
  color: #d7e6f7;
  background: rgba(6, 9, 20, 0.66);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(77, 232, 255, 0.26);
  border-radius: 10px;
  pointer-events: none;
  box-shadow: 0 12px 36px rgba(2, 4, 10, 0.5);
  font-variant-numeric: tabular-nums;
}
#backspin-hud { left: 18px; top: 16px; min-width: 252px; padding: 12px 14px 11px; }
#backspin-prompt {
  left: 50%; bottom: 14px; transform: translateX(-50%);
  padding: 7px 14px; display: flex; align-items: center; gap: 7px;
  font-size: 11px; letter-spacing: 0.04em; color: #9db4d4; white-space: nowrap;
}
.bs-title {
  font-size: 14px; font-weight: 700; letter-spacing: 0.42em; color: #eef7ff;
  margin-bottom: 2px;
}
.bs-title-rule {
  display: block; width: 132px; height: 2px; margin-top: 5px; border-radius: 1px;
  background: linear-gradient(to right, #4de8ff, rgba(77, 232, 255, 0));
}
.bs-row { display: flex; align-items: flex-end; justify-content: space-between; }
.bs-headline { margin-top: 10px; }
.bs-label { font-size: 8.5px; letter-spacing: 0.24em; color: #6f88ad; font-weight: 600; }
.bs-score { font-size: 24px; font-weight: 600; color: #f2f8ff; line-height: 1.15; }
#backspin-hud.crashed .bs-score { color: #ff5d7d; }
.bs-link { font-size: 24px; font-weight: 600; color: #ffd166; line-height: 1.15; text-align: right; }
.bs-link.zero { color: #5c7396; }
.bs-meter { margin-top: 9px; }
.bs-label-row {
  display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;
}
.bs-meter-value { font-size: 10.5px; font-weight: 600; color: #ffb35c; }
.bs-meter-value.cool { color: #4de8ff; }
.bs-meter-value.danger { color: #ff5d7d; }
.bs-track {
  position: relative; height: 8px; border-radius: 4px; overflow: hidden;
  background: rgba(148, 178, 216, 0.12);
  box-shadow: inset 0 0 0 1px rgba(148, 178, 216, 0.12);
}
.bs-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; }
.bs-fill.cone { background: linear-gradient(to right, #ffcf7d, #ffb35c); }
.bs-fill.cone.tight { background: linear-gradient(to right, #ff8fa2, #ff5d7d); }
.bs-fill.air { background: linear-gradient(to right, #7deaff, #37d6ff); }
.bs-fill.air.low { background: linear-gradient(to right, #ffb98a, #ff8a5d); }
.bs-ticks::after {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0, transparent calc(25% - 1px),
    rgba(6, 9, 20, 0.9) calc(25% - 1px), rgba(6, 9, 20, 0.9) 25%
  );
}
.bs-meta { margin-top: 10px; font-size: 10px; letter-spacing: 0.08em; color: #6f88ad; }
.bs-kbd {
  display: inline-block; padding: 2px 7px; border-radius: 5px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.1em; color: #bfefff;
  background: rgba(77, 232, 255, 0.1);
  border: 1px solid rgba(77, 232, 255, 0.38);
}
.bs-dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(157, 180, 212, 0.5); }
#backspin-prompt.crash { color: #ff8fa2; border-color: rgba(255, 93, 125, 0.38); }
#backspin-volume {
  right: 18px; top: 16px; z-index: 6; pointer-events: auto;
  display: flex; align-items: center; gap: 9px; padding: 8px 12px;
}
#backspin-volume .bs-label { letter-spacing: 0.2em; color: #4de8ff; }
#backspin-volume input[type="range"] { width: 108px; accent-color: #37d6ff; margin: 0; }
#backspin-volume button {
  font: 600 10px/1.4 Graphik, system-ui, sans-serif; letter-spacing: 0.08em;
  color: #bfefff; background: rgba(77, 232, 255, 0.1);
  border: 1px solid rgba(77, 232, 255, 0.38); border-radius: 6px;
  padding: 4px 9px; cursor: pointer;
}
#backspin-volume button:hover { background: rgba(77, 232, 255, 0.2); }
`;

interface HudRefs {
  readonly root: HTMLElement;
  readonly score: HTMLElement;
  readonly link: HTMLElement;
  readonly coneFill: HTMLElement;
  readonly coneValue: HTMLElement;
  readonly airFill: HTMLElement;
  readonly airValue: HTMLElement;
  readonly meta: HTMLElement;
}

let hud: HudRefs | undefined;
let promptBar: HTMLElement | undefined;
let hudLinkShown = -1;

function mountHud(): void {
  if (hud) return;
  const style = document.createElement("style");
  style.textContent = HUD_CSS;
  document.head.append(style);

  const root = document.createElement("aside");
  root.id = "backspin-hud";
  root.setAttribute("aria-label", "Backspin run status");
  root.innerHTML = [
    `<div class="bs-title">BACKSPIN<span class="bs-title-rule"></span></div>`,
    `<div class="bs-row bs-headline">`,
    `  <div><div class="bs-label">SCORE</div><div class="bs-score">0</div></div>`,
    `  <div><div class="bs-label" style="text-align:right">LINK</div><div class="bs-link zero">×0</div></div>`,
    `</div>`,
    `<div class="bs-meter">`,
    `  <div class="bs-label-row"><span class="bs-label">LANDING CONE</span><span class="bs-meter-value">63°</span></div>`,
    `  <div class="bs-track"><div class="bs-fill cone" style="width:100%"></div></div>`,
    `</div>`,
    `<div class="bs-meter">`,
    `  <div class="bs-label-row"><span class="bs-label">AIR TANK</span><span class="bs-meter-value cool">100</span></div>`,
    `  <div class="bs-track bs-ticks"><div class="bs-fill air" style="width:100%"></div></div>`,
    `</div>`,
    `<div class="bs-meta">0 m · 7.2 m/s · BEST 0</div>`
  ].join("");
  document.body.append(root);

  hud = {
    root,
    score: root.querySelector<HTMLElement>(".bs-score")!,
    link: root.querySelector<HTMLElement>(".bs-link")!,
    coneFill: root.querySelector<HTMLElement>(".bs-fill.cone")!,
    coneValue: root.querySelector<HTMLElement>(".bs-meter-value")!,
    airFill: root.querySelector<HTMLElement>(".bs-fill.air")!,
    airValue: root.querySelectorAll<HTMLElement>(".bs-meter-value")[1]!,
    meta: root.querySelector<HTMLElement>(".bs-meta")!
  };

  promptBar = document.createElement("div");
  promptBar.id = "backspin-prompt";
  promptBar.setAttribute("aria-label", "Controls");
  document.body.append(promptBar);

  hudLinkShown = -1;
  mountVolumeControl();
}

function renderHud(): void {
  if (!hud || !promptBar) mountHud();
  if (!hud || !promptBar) return;

  const coneDeg = Math.round((currentCone() * 2 * 180) / Math.PI);
  const conePct = Math.max(6, Math.min(100, (coneDeg / CONE_BASE_DEG) * 100));
  const airPct = Math.round((air / AIR_CAPACITY) * 100);
  const tight = coneDeg < CONE_WARN_DEG;

  hud.root.classList.toggle("crashed", gameOver);
  hud.score.textContent = score.toLocaleString();
  hud.link.textContent = `×${link}`;
  hud.link.classList.toggle("zero", link === 0);
  if (link > hudLinkShown && link > 0) {
    // glow pulse the moment the Link climbs — retriggerable via WAAPI
    hud.link.animate(
      [
        { textShadow: "0 0 0 rgba(255,209,102,0)", transform: "scale(1)" },
        { textShadow: "0 0 16px rgba(255,209,102,0.85)", transform: "scale(1.16)" },
        { textShadow: "0 0 0 rgba(255,209,102,0)", transform: "scale(1)" }
      ],
      { duration: 460, easing: "ease-out" }
    );
  }
  hudLinkShown = link;

  hud.coneFill.style.width = `${conePct}%`;
  hud.coneFill.classList.toggle("tight", tight);
  hud.coneValue.textContent = `${coneDeg}°`;
  hud.coneValue.classList.toggle("danger", tight);

  hud.airFill.style.width = `${airPct}%`;
  hud.airFill.classList.toggle("low", airPct < 26);
  hud.airValue.textContent = `${airPct}`;
  hud.airValue.classList.toggle("danger", airPct < 26);

  hud.meta.textContent = `${Math.round(distance)} m · ${speed.toFixed(1)} m/s · BEST ${best.toLocaleString()}`;

  if (gameOver) {
    promptBar.classList.add("crash");
    promptBar.innerHTML = `CRASHED&nbsp;&nbsp;<span class="bs-kbd">R</span>&nbsp;or tap to restart`;
  } else {
    promptBar.classList.remove("crash");
    promptBar.innerHTML = [
      `<span class="bs-kbd">SPACE</span> trick`,
      `<span class="bs-dot"></span>`,
      `<span class="bs-kbd">HOLD</span> hover`,
      `<span class="bs-dot"></span>`,
      `<span class="bs-kbd">R</span> restart`
    ].join(" ");
  }
}

// Volume control: a master-bus slider + mute toggle, top-right so it never
// fights the touch buttons. Buttons blur after use so Space/Enter never
// re-trigger a focused control mid-run.
let volumePanel: HTMLElement | undefined;
let muted = false;

function mountVolumeControl(): void {
  if (volumePanel) return;
  volumePanel = document.createElement("div");
  volumePanel.id = "backspin-volume";

  const label = document.createElement("span");
  label.className = "bs-label";
  label.textContent = "VOL";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.value = "70";
  slider.setAttribute("aria-label", "Master volume");

  const mute = document.createElement("button");
  mute.type = "button";
  mute.textContent = "MUTE";
  mute.setAttribute("aria-label", "Mute audio");

  const applyVolume = (): void => {
    const v = muted ? 0 : Number(slider.value) / 100;
    backspin.sound?.setBusVolume("master", v);
  };

  slider.addEventListener("input", () => {
    ensureAudioStarted();
    if (muted) {
      muted = false;
      mute.textContent = "MUTE";
    }
    applyVolume();
  });
  slider.addEventListener("change", () => slider.blur());
  mute.addEventListener("click", () => {
    ensureAudioStarted();
    muted = !muted;
    mute.textContent = muted ? "UNMUTE" : "MUTE";
    applyVolume();
    mute.blur();
  });

  volumePanel.append(label, slider, mute);
  document.body.append(volumePanel);
}

function publish(): void {
  const comboState: BackspinState["comboState"] = gameOver
    ? "crashed"
    : airborne
      ? holdActive && air > 0
        ? "hovering"
        : comboExtended
          ? "extended"
          : "airborne"
      : "grounded";
  window.__AURA3D_ARCADE_STATE__ = {
    frame: frameCount,
    score,
    best,
    multiplier: link,
    link,
    comboState,
    distance: Math.round(distance),
    speed: +speed.toFixed(2),
    airborne,
    height: +height.toFixed(3),
    coneDeg: Math.round((currentCone() * 2 * 180) / Math.PI),
    air: +air.toFixed(2),
    gameOver,
    look: { id: LOOK_ID },
    assetIds: ["bsSpeeder", "bsGate", "bsRoof", "bsTower"]
  };
}

function hideBootGate(): void {
  const gate = document.getElementById("boot-gate");
  if (!gate) return;
  gate.style.opacity = "0";
  gate.style.pointerEvents = "none";
  window.setTimeout(() => gate.remove(), 320);
}

// keep the imported type used so the file stays honest about its dependency
export type { AuraColor };
