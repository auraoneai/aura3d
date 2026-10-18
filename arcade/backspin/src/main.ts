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
 */
import {
  camera,
  game,
  gameFeel,
  looks,
  material,
  model,
  scene,
  type AuraColor,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
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

// bsRoof's height as a fraction of its max dimension. model() normalises to a
// unit cube, so a roof scaled to max dimension S is ROOF_Y_RATIO × S tall —
// without this, the roofs' tops rise ABOVE the ride line and bury the bike.
const ROOF_Y_RATIO = assets.bsRoof.bounds[1] / Math.max(...assets.bsRoof.bounds);

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

const segmentNodes: AuraRuntimeNodeHandle[] = [];
const gateNodes: AuraRuntimeNodeHandle[] = [];
const towerNodes: AuraRuntimeNodeHandle[] = [];
let bikeNode: AuraRuntimeNodeHandle | undefined;

const segmentX: number[] = [];
const gateX: number[] = [];
const towerX: number[] = [];

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
let hudRoot: HTMLElement | undefined;

function renderHud(): void {
  if (!hudRoot) {
    hudRoot = document.createElement("aside");
    hudRoot.id = "backspin-hud";
    hudRoot.style.cssText = [
      "position:absolute",
      "left:18px",
      "top:16px",
      "z-index:5",
      "min-width:250px",
      "font:600 13px/1.45 Inter, system-ui, sans-serif",
      "color:#eaf6ff",
      "background:rgba(6,9,20,0.74)",
      "border:1px solid rgba(77,232,255,0.32)",
      "border-radius:10px",
      "padding:12px 14px",
      "pointer-events:none"
    ].join(";");
    document.body.append(hudRoot);
    mountVolumeControl();
  }

  const coneDeg = Math.round((currentCone() * 2 * 180) / Math.PI);
  const airPct = Math.round((air / AIR_CAPACITY) * 100);
  const status = gameOver
    ? `<div style="margin-top:6px;color:#ffd166">Crashed — press R or tap to restart</div>`
    : `<div style="margin-top:6px;opacity:0.62">Space / tap to trick · hold to hover</div>`;

  hudRoot.innerHTML = [
    `<div style="font-size:15px;letter-spacing:0.18em;color:#4de8ff">BACKSPIN</div>`,
    `<div style="margin-top:6px">Score <strong>${score.toLocaleString()}</strong></div>`,
    `<div>Link ×${link} · cone ${coneDeg}°</div>`,
    `<div>Air ${airPct}% · ${Math.round(distance)} m</div>`,
    `<div style="color:#8fb4ff">Best ${best.toLocaleString()}</div>`,
    status
  ].join("");
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
  volumePanel.style.cssText = [
    "position:absolute",
    "right:18px",
    "top:16px",
    "z-index:6",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "font:600 12px/1.4 Inter, system-ui, sans-serif",
    "color:#eaf6ff",
    "background:rgba(6,9,20,0.74)",
    "border:1px solid rgba(77,232,255,0.32)",
    "border-radius:10px",
    "padding:8px 12px"
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "VOL";
  label.style.cssText = "letter-spacing:0.14em;color:#4de8ff";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.value = "70";
  slider.setAttribute("aria-label", "Master volume");
  slider.style.cssText = "width:110px;accent-color:#4de8ff";

  const mute = document.createElement("button");
  mute.type = "button";
  mute.textContent = "Mute";
  mute.setAttribute("aria-label", "Mute audio");
  mute.style.cssText = [
    "font:600 11px/1.4 Inter, system-ui, sans-serif",
    "color:#eaf6ff",
    "background:rgba(77,232,255,0.12)",
    "border:1px solid rgba(77,232,255,0.32)",
    "border-radius:6px",
    "padding:4px 8px",
    "cursor:pointer"
  ].join(";");

  const applyVolume = (): void => {
    const v = muted ? 0 : Number(slider.value) / 100;
    backspin.sound?.setBusVolume("master", v);
  };

  slider.addEventListener("input", () => {
    ensureAudioStarted();
    if (muted) {
      muted = false;
      mute.textContent = "Mute";
    }
    applyVolume();
  });
  slider.addEventListener("change", () => slider.blur());
  mute.addEventListener("click", () => {
    ensureAudioStarted();
    muted = !muted;
    mute.textContent = muted ? "Unmute" : "Mute";
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
