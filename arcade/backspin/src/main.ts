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

interface BackspinState {
  readonly frame: number;
  readonly score: number;
  readonly best: number;
  readonly link: number;
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
    trick: ["Space"],
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
  sound: {
    cues: {
      trick: { id: "trick", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 },
      land: { id: "land", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.55 },
      perfect: { id: "perfect", asset: { url: sfxUrl("ui.toggle.01") }, volume: 0.7 },
      crash: { id: "crash", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.85 },
      over: { id: "over", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 }
    }
  },
  juice: {
    trick: { punch: { fovDeg: 1.2, ms: 180 }, shake: 0.1 },
    land: { flash: { color: "#7be0ff", peak: 0.14, ms: 180 }, shake: 0.16 },
    perfect: { flash: { color: "#ffd166", peak: 0.22, ms: 240 }, punch: { fovDeg: 2, ms: 220 } },
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
  const step = Math.min(dt, 0.05);
  feel.update(step * 1000);
  frameCount += 1;
  if (input!.pressed("restart")) restartRun();
  if (!gameOver) {
    stepInput(step);
    stepPhysics(step);
    scrollWorld(step);
  }
  render();
  publish();
});

// ── input ────────────────────────────────────────────────────────────────────
function stepInput(step: number): void {
  const pressed = input!.pressed("trick");
  holdActive = input!.down("trick") ?? false;

  if (pressed) {
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
      void backspin.sound?.cue("trick");
      backspin.juice.fire("trick");
      gameEvents.push({ type: "trick", label: "backflip combo" });
    }
  }

  // hold to hover, draining the air tank
  if (airborne && holdActive && air > 0) {
    velocityY += HOVER_LIFT * step;
    air = Math.max(0, air - AIR_DRAIN * step);
  }

  if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - step * 3);
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
      gameEvents.push({ type: "link-lost", label: "link lost", severity: "warning" });
    }
  }
  speed = Math.min(16, 7.2 + distance * 0.012);
  distance += speed * step;
}

function land(): void {
  const normalized = normalizeAngle(angle);
  const cone = currentCone();
  const error = Math.abs(normalized);

  if (error <= cone) {
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
    void backspin.sound?.cue(perfect ? "perfect" : "land");
    backspin.juice.fire(perfect ? "perfect" : "land");
    gameEvents.push({ type: perfect ? "perfect" : "land", label: perfect ? "perfect" : "land", severity: "success" });
  } else {
    crash();
  }
}

function crash(): void {
  gameOver = true;
  best = Math.max(best, score);
  crashFlash = 1;
  void backspin.sound?.cue("crash");
  backspin.juice.fire("crash");
  void backspin.sound?.cue("over");
  backspin.juice.fire("over");
  gameEvents.push({ type: "crash", label: `crashed at ${Math.round((errorOf(angle) * 180) / Math.PI)}deg`, severity: "warning" });
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

function restartRun(): void {
  height = 0;
  velocityY = 0;
  angle = 0;
  angularVelocity = 0;
  airborne = false;
  air = AIR_CAPACITY;
  link = 0;
  score = 0;
  distance = 0;
  speed = 7.2;
  gameOver = false;
  groundedFor = 0;
  crashFlash = 0;
  layoutWorld();
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
        position: [0, GROUND_Y - 0.5, 0],
        castShadow: true
      }).runtime(game.runtimeNode(`roof-${index}`, { tags: ["roof", "runtime"] }))
    ),
    ...Array.from({ length: GATE_COUNT }, (_, index) =>
      model(assets.bsGate, {
        name: `roof gate ${index}`,
        targetMaxDimension: 3.2,
        position: [0, GROUND_Y, 0],
        castShadow: true
      }).runtime(game.runtimeNode(`gate-${index}`, { tags: ["gate", "runtime"] }))
    ),
    ...Array.from({ length: TOWER_COUNT }, (_, index) =>
      model(assets.bsTower, {
        name: `skyline tower ${index}`,
        targetHeight: 7 + (index % 3),
        position: [0, GROUND_Y, -5],
        material: material.pbr({ color: "#2a3550", roughness: 0.7, metalness: 0.2, emissive: "#101a33", emissiveIntensity: 0.35 })
      }).runtime(game.runtimeNode(`tower-${index}`, { tags: ["tower", "runtime"] }))
    ),
    model(assets.bsBike, {
      name: "hoverbike",
      targetMaxDimension: 1.5,
      position: [BIKE_X, GROUND_Y + 0.45, 0],
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
    // perspective camera causes in this engine version.
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
}

// ── render ───────────────────────────────────────────────────────────────────
function render(): void {
  segmentNodes.forEach((node, index) => {
    node.setPosition(segmentX[index] ?? 0, GROUND_Y - 0.5, 0);
  });
  gateNodes.forEach((node, index) => {
    node.setPosition(gateX[index] ?? 0, GROUND_Y, 0);
  });
  towerNodes.forEach((node, index) => {
    node.setPosition(towerX[index] ?? 0, GROUND_Y, -5);
  });
  bikeNode
    ?.setVisible(true)
    .setPosition(BIKE_X, GROUND_Y + 0.45 + height, 0)
    .setRotation(0, 0, angle);
  renderHud();
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
  }

  const coneDeg = Math.round((currentCone() * 2 * 180) / Math.PI);
  const airPct = Math.round((air / AIR_CAPACITY) * 100);
  const status = gameOver
    ? `<div style="margin-top:6px;color:#ffd166">Crashed — press R</div>`
    : `<div style="margin-top:6px;opacity:0.62">Space to trick · hold to hover</div>`;

  hudRoot.innerHTML = [
    `<div style="font-size:15px;letter-spacing:0.18em;color:#4de8ff">BACKSPIN</div>`,
    `<div style="margin-top:6px">Score <strong>${score.toLocaleString()}</strong></div>`,
    `<div>Link ×${link} · cone ${coneDeg}°</div>`,
    `<div>Air ${airPct}% · ${Math.round(distance)} m</div>`,
    `<div style="color:#8fb4ff">Best ${best.toLocaleString()}</div>`,
    status
  ].join("");
}

function publish(): void {
  window.__AURA3D_ARCADE_STATE__ = {
    frame: frameCount,
    score,
    best,
    link,
    distance: Math.round(distance),
    speed: +speed.toFixed(2),
    airborne,
    height: +height.toFixed(3),
    coneDeg: Math.round((currentCone() * 2 * 180) / Math.PI),
    air: +air.toFixed(2),
    gameOver,
    look: { id: LOOK_ID },
    assetIds: ["bsBike", "bsGate", "bsRoof", "bsTower"]
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
