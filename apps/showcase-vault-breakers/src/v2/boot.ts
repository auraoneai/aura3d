// apps/showcase-vault-breakers/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.5 "pinball cabinet in a dark arcade": admitted cabinet + FlipperReal +
// mechanism GLBs, chrome ball, lit inserts, one shadowed key. Gameplay modules
// (table/ball-flow/flippers/plunger/missions/scoring) are unchanged; audio
// plays through the legacy cue map until C-25 game-sfx is real (standIn R-14-10).
import { scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { createTableSimulation, quatToEuler } from "../gameplay/table";
import { VaultFlow } from "../gameplay/ball-flow";
import { FlipperController } from "../gameplay/flippers";
import { PlungerController } from "../gameplay/plunger";
import direction from "../../art/direction";
import { createVaultAudio } from "../legacy/pinball-audio";
import { scoreboardVisibility } from "../legacy/scoreboard";
import { arcadeRoom, insertBezels, playfieldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createVaultRig, fallbackCameraNode, type VaultRigState } from "./scene/camera";
import { wireVaultFx } from "./scene/fx";
import { createEventConsumer } from "./flow-events";
import { publishVaultEvidence } from "./evidence";
import { applyVaultScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_VAULT_BREAKERS" as const;

const target = document.getElementById("app") ?? document.body;

// ------------------------------------------------------------------ scene ----

const sim = createTableSimulation();
const flippers = new FlipperController(sim.flippers);
const flow = new VaultFlow(flippers, sim);
const plunger = new PlungerController();
const rigState: VaultRigState = { ball: null };

function buildScene() {
  return scene()
    .background("#050408")
    .camera(fallbackCameraNode())
    .addMany(arcadeRoom())
    .add(insertBezels())
    .addMany(playfieldNodes(sim))
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const audio = createVaultAudio();
const audioCueLog: string[] = [];
let audioUnlocked = false;
function pushCue(cue: Parameters<typeof audio.cue>[0]): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue).catch(() => undefined);
}
const unlockAudio = () => {
  if (audioUnlocked) return;
  void audio.unlock().then(() => { audioUnlocked = true; }).catch(() => undefined);
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-vault-breakers",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "arcade-neon",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "score", kind: "score", anchor: "top", label: "SCORE" },
      { id: "ball", kind: "label", anchor: "top-left", label: "BALL" },
      { id: "mission", kind: "label", anchor: "bottom", label: "MISSION" },
      { id: "power", kind: "meter", anchor: "right", label: "PLUNGER" }
    ]
  },
  touch: {
    preset: "flippers",
    bindings: { left: "left-zone", right: "right-zone", plunger: "plunger-hold", nudge: "edge-swipe", pause: "menu" }
  },
  sound: {
    cues: {
      "flipper-snap": { asset: "vaultFlipperSnapSfx" },
      "bumper-hit": { asset: "vaultBumperHitSfx" },
      "sling-pop": { asset: "vaultSlingPopSfx" },
      "target-down": { asset: "vaultTargetDownSfx" },
      "bank-clear": { asset: "vaultBankClearSfx" },
      "vault-open": { asset: "vaultVaultOpenSfx" },
      "multiball": { asset: "vaultMultiballSfx" },
      "ball-drain": { asset: "vaultBallDrainSfx" },
      "tilt-warn": { asset: "vaultTiltWarnSfx" },
      "plunger-release": { asset: "vaultPlungerReleaseSfx" },
      "ramp-roll": { asset: "vaultRampRollSfx" }
    }
  },
  juice: {
    "vault-open": { trauma: 0.2, hitStopMs: 40 },
    "multiball": { slowMo: { scale: 0.6, ms: 500 } },
    "ball-drain": { hitStopMs: 40 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_vault_breakers` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-vault-breakers`).
    flags: ["route_vault_breakers", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

// ------------------------------------------------------------- shot state ----

const fx = wireVaultFx(game);
let frame = 0;
let bumperHitsThisBall = 0;
let nudgeFlip = false;
const bootedAtMs = performance.now();

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
const bankLampHandles = new Map<number, NodeHandle>();
const scoreboardHandles = new Map<string, NodeHandle>();

function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

function resolveHandles(): void {
  for (let index = 0; index < 5; index += 1) {
    if (!bankLampHandles.has(index)) {
      const h = handle(`bank-status-${index}`);
      if (h) bankLampHandles.set(index, h);
    }
  }
  if (scoreboardHandles.size === 0) {
    for (const h of game.app.nodes.all()) {
      if (/^sb-/.test(h.id)) scoreboardHandles.set(h.id, h);
    }
  }
}

// ------------------------------------------------------------ flow events ----

const consumeEvents = createEventConsumer({
  pushCue,
  fx,
  hudBanner: (text, options) => game.hud.banner(text, options),
  onServe: () => { bumperHitsThisBall = 0; },
});

// ------------------------------------------------------------- input ---------

const held = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (!e.repeat) held.add(e.code);
  if (e.code === "Space" && !plunger.charging && !e.repeat &&
      (flow.phase === "attract" || flow.phase === "await-serve")) {
    plunger.beginCharge();
  }
  if (e.repeat) return;
  if (e.code === "KeyP" || e.code === "Escape") {
    game.session.paused ? game.session.resume() : game.session.pause();
  } else if (e.code === "KeyR") {
    flow.reset();
    bumperHitsThisBall = 0;
  } else if (e.code === "KeyS") {
    nudgeFlip = !nudgeFlip;
    flow.nudge(nudgeFlip ? -1 : 1);
  }
}, { passive: true });
window.addEventListener("keyup", (e) => {
  held.delete(e.code);
  if (e.code === "Space" && plunger.charging) {
    const charge = plunger.release();
    if (charge !== null) doServe(charge);
  }
});
window.addEventListener("keydown", (e) => {
  if (["Space", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyS"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Touch (§7.2.1 preset "flippers"): left/right halves raise flippers; a bottom
// hold on the right charges and releases the plunger; edge swipe nudges.
const touch = { left: false, right: false, plungeAt: 0 };
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  const x = e.clientX / Math.max(1, target.clientWidth);
  const y = e.clientY / Math.max(1, target.clientHeight);
  if (y > 0.78 && x > 0.6) touch.plungeAt = performance.now();
  else if (x < 0.5) touch.left = true;
  else touch.right = true;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointerup", (e) => {
  const x = e.clientX / Math.max(1, target.clientWidth);
  if (touch.plungeAt > 0) {
    const charge = Math.min(1, (performance.now() - touch.plungeAt) / 900);
    touch.plungeAt = 0;
    doServe(charge);
  } else if (x < 0.5) touch.left = false;
  else touch.right = false;
});
target.addEventListener("pointercancel", () => { touch.left = touch.right = false; touch.plungeAt = 0; });

function doServe(charge: number): void {
  if (flow.serve(charge)) consumeEvents([{ type: "serve", charge }]);
}

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ------------------------------------------------------------- frame loop ----

const VISUAL_Y_OFFSET = 0.28;
const prevVisible = new Set<string>();

function syncVisuals(): void {
  const live = new Set<string>();
  for (const pose of sim.poses()) {
    const h = handle(pose.name);
    if (!h) continue;
    live.add(pose.name);
    const e = quatToEuler(pose.rotation);
    h.setPosition(pose.position[0], pose.position[1] + VISUAL_Y_OFFSET, pose.position[2])
      .setRotation(e.x, e.y, e.z)
      .setVisible(true);
  }
  for (const name of prevVisible) {
    if (!live.has(name) && name.startsWith("ball-")) handle(name)?.setVisible(false);
  }
  prevVisible.clear();
  for (const n of live) prevVisible.add(n);
  // Rig ball-track: follow the fastest ball in play.
  let fastest: readonly [number, number, number] | null = null;
  let fastestSpeed = -1;
  for (const k of sim.kinematics()) {
    if (k.state === "play" && k.speed > fastestSpeed) { fastestSpeed = k.speed; fastest = k.position; }
  }
  rigState.ball = fastest;
}

let lastHudWrite = 0;
let lastHudSignature = "";
function syncLampsAndBoard(): void {
  const snap = flow.snapshot();
  for (const [index, h] of bankLampHandles) {
    const on = index < snap.banksDown;
    h.setMaterial(on
      ? { name: "bank lamp on", color: "#087d77", emissive: "#28f5cc", emissiveIntensity: 2.2 }
      : { name: "bank lamp off", color: "#1e1824", emissive: "#805030", emissiveIntensity: 0.22 });
  }
  const visibility = scoreboardVisibility({
    score: snap.score,
    ball: snap.ball,
    multiplier: snap.multiplier,
    banksDown: snap.banksDown,
    missionLine: snap.missionLine
  });
  for (const [id, h] of scoreboardHandles) {
    const want = visibility.get(id);
    if (want !== undefined) h.setVisible(want);
  }
  const signature = `${snap.score}|${snap.ball}|${snap.missionLine}|${plunger.charging}`;
  if (signature !== lastHudSignature || frame - lastHudWrite > 300) {
    lastHudSignature = signature;
    lastHudWrite = frame;
    game.hud.set("score", `${snap.score}`);
    game.hud.set("ball", `BALL ${snap.ball}`);
    game.hud.set("mission", snap.missionLine);
    game.hud.set("power", plunger.charging ? "CHARGING" : "HOLD SPACE");
  }
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const dt = game.session.scaledDt(rawDt);
  frame += 1;
  resolveHandles();
  if (dt <= 0 || game.session.paused) return;

  plunger.update(dt);
  const activationsBefore = flippers.snapshot().activationCount;
  flippers.update({
    leftHeld: held.has("KeyA") || held.has("ArrowLeft") || touch.left,
    rightHeld: held.has("KeyD") || held.has("ArrowRight") || touch.right
  });
  if (flippers.snapshot().activationCount > activationsBefore) pushCue("flipper-snap");

  const events = flow.update(1);
  consumeEvents(events);

  syncVisuals();
  fx.syncImpact(dt);
  if (frame % 6 === 0 || events.length > 0) syncLampsAndBoard();
});

// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(game.lookSource()),
  postPreset: "neon-night",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "vault-breakers.static-table"
});

publishVaultEvidence({
  game,
  flow,
  ballInPlay: () => flow.phase === "play",
  bumperHitsThisBall: () => bumperHitsThisBall,
  liveBallPositions: () => sim.kinematics().filter((k) => k.state === "play").map((k) => k.position),
  appliedLook,
  fxLiveCount: () => game.fx.liveCount,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const scenario = new URL(location.href).searchParams.get("scenario");
if (scenario) {
  applyVaultScenario(scenario, { flow, sync: () => { syncVisuals(); syncLampsAndBoard(); } });
}

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createVaultRig(rigState), { blend: 0.4 });
  // C-05 output: exposureEV −0.2 → linear ≈ 0.87; post presets stub {} until
  // the registry ships real output profiles.
    game.app.setOutput?.({ preset: "neon-night",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-vault-breakers",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
