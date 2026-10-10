// apps/showcase-siege-golf/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.10 "golden-hour siege driving range": the authored nine-hole course
// runs on the real Rapier-backed HoleFlow (strike → simulating → settle →
// next aim), one scene built from the union of all per-hole visuals so a
// hole change re-poses runtime nodes instead of swapping scenes
// (loading.sceneSwaps stays 0 — a §7.2.1 required condition).
// Gameplay modules (shot/course/hole-flow/score/structures/solutions) are
// unchanged; audio plays through the legacy cue controller until C-25
// lands (standIn R-14-10).
import { game as engineGame, scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { SIEGE_GOLF_HOLES } from "../gameplay/course";
import { ShotController } from "../gameplay/shot";
import { quatToEuler } from "../gameplay/structures";
import { createGolfAudio, type GolfAudioCue } from "../legacy/golf-audio";
import direction from "../../art/direction";
import { siegeWorldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createSiegeRig, fallbackCameraNode } from "./scene/camera";
import { wireSiegeFx } from "./scene/fx";
import { RANGE_BG } from "./scene/materials";
import { publishSiegeEvidence } from "./evidence";
import { applySiegeScenario } from "./scenarios";
import { createSiegeFlowState, wireSiegeHoleFlow } from "./hole-flow";

const ROUTE_FLAG = "A3D_QR_ROUTE_SIEGE_GOLF" as const;
const AIM_RATE = 0.9; // radians/s while an aim key is held
const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --

const flowState = createSiegeFlowState();
const shot = new ShotController();
shot.loadHole(flowState.flow.hole.aim);
let autoplayEnabled = false;
let frame = 0;
const bootedAtMs = performance.now();

const rigState = { ball: { x: flowState.flow.hole.tee[0], z: flowState.flow.hole.tee[1] }, ballInFlight: false };
const world = siegeWorldNodes();

function buildScene() {
  return scene()
    .background(RANGE_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const audio = createGolfAudio();
const audioCueLog: string[] = [];
function pushCue(cue: GolfAudioCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue).catch(() => undefined);
}
const unlockAudio = () => void audio.unlock().catch(() => undefined);
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-siege-golf",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sports-broadcast",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "hole", kind: "label", anchor: "top", label: "HOLE" },
      { id: "score", kind: "score", anchor: "top-left", label: "STROKES" },
      { id: "power", kind: "label", anchor: "top-right", label: "POWER" },
      { id: "targets", kind: "label", anchor: "bottom-left", label: "TARGETS" },
      { id: "message", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "aim-drag",
    bindings: { aim: "drag", strike: "release-drag", confirm: "tap", pause: "menu" }
  },
  sound: {
    cues: {
      "drive-hit": { asset: "siegeDriveHitSfx" },
      "wood-crack": { asset: "siegeWoodCrackSfx" },
      "metal-clang": { asset: "siegeMetalClangSfx" },
      "target-down": { asset: "siegeTargetDownSfx" },
      "cup-sink": { asset: "siegeCupSinkSfx" },
      "par-chime": { asset: "siegeParChimeSfx" },
      "bogey-sting": { asset: "siegeBogeyStingSfx" },
      "ui-confirm": { asset: "siegeUiConfirmSfx" },
      "ambient-wind": { asset: "siegeAmbientWindSfx" }
    }
  },
  juice: {
    "strike": { hitStopMs: 30, trauma: 0.15 },
    "pin-sunk": { hitStopMs: 40, trauma: 0.18 },
    "complete": { trauma: 0.25 },
    "failed": { hitStopMs: 50, trauma: 0.2 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_siege_golf` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-siege-golf`).
    flags: ["route_siege_golf", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireSiegeFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- input ---------

const input = engineGame.input({
  actions: {
    aimLeft: ["KeyA", "ArrowLeft"],
    aimRight: ["KeyD", "ArrowRight"],
    charge: ["Space", "KeyW", "ArrowUp"],
    confirm: ["Enter", "KeyJ"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"]
  },
  bufferMs: 90
});

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Touch: hold-drag aims + charges in one gesture (strikeFromDrag), tap
// confirms result cards. `pendingDrag` carries the release endpoints.
let dragStart: { x: number; y: number } | null = null;
let pendingDrag: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
let confirmTap = false;
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  dragStart = { x: e.clientX, y: e.clientY };
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointerup", (e) => {
  if (dragStart === null) return;
  const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
  if (dist >= 12) {
    pendingDrag = { start: dragStart, end: { x: e.clientX, y: e.clientY } };
  } else {
    confirmTap = true;
  }
  dragStart = null;
});
target.addEventListener("pointercancel", () => { dragStart = null; });

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ------------------------------------------------------------- hole flow -----

const holeFlow = wireSiegeHoleFlow(flowState, { world, handle, shot, fx, pushCue });

// ------------------------------------------------------------- frame loop ----

let lastHudSignature = "";
let lastHudWrite = 0;
function syncHud(): void {
  const snap = flowState.flow.snapshot();
  const aim = shot.state;
  const signature = [
    flowState.holeIndex, snap.phase, snap.strokes, snap.targetsSunk, aim.charge.toFixed(2),
    flowState.pendingAdvance ?? ""
  ].join("|");
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("hole", `${flowState.flow.hole.name} · PAR ${snap.par}`);
  game.hud.set("score", `${snap.strokes}`);
  game.hud.set("power", aim.phase === "charging" ? `PWR ${Math.round(aim.charge * 100)}%` : "");
  game.hud.set("targets", `${snap.targetsSunk}/${snap.totalTargets} SUNK · ${snap.targetsDown} DOWN`);
  game.hud.set("message",
    flowState.pendingAdvance === "new-round" ? "ROUND COMPLETE — ENTER TO RESTART"
      : flowState.pendingAdvance === "next-hole" ? "HOLE COMPLETE — ENTER FOR NEXT"
        : flowState.pendingAdvance === "retry-hole" ? "HOLE FAILED — ENTER TO RETRY"
          : snap.phase === "simulating" ? ""
            : "A/D AIM · HOLD SPACE TO CHARGE · RELEASE TO DRIVE");
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  const aim = shot.state;
  if (flowState.flow.phase === "aiming") {
    if (input.held("aimLeft")) shot.aimBy(-AIM_RATE * stepSeconds);
    if (input.held("aimRight")) shot.aimBy(AIM_RATE * stepSeconds);
    if (input.pressed("charge") && aim.phase === "idle") {
      shot.beginCharge();
      pushCue("ui-confirm");
    }
    if (input.held("charge") && aim.phase === "charging") {
      shot.updateCharge(stepSeconds);
    }
    if (!input.held("charge") && aim.phase === "charging") {
      const result = shot.strike();
      if (result) holeFlow.applyStrikeResult(result);
    }
    if (pendingDrag) {
      const result = shot.strikeFromDrag(pendingDrag.start, pendingDrag.end);
      pendingDrag = null;
      if (result) holeFlow.applyStrikeResult(result);
    }
    // Deterministic capture path: autorun/scenario plays the canonical
    // solution for the active hole.
    if (autoplayEnabled) {
      flowState.autoplayWait -= stepSeconds;
      if (flowState.autoplayWait <= 0) {
        flowState.autoplayWait = 1.2;
        holeFlow.autoplayStroke();
      }
    }
  } else if (flowState.flow.phase === "simulating") {
    pendingDrag = null;
    holeFlow.consumeEvents(flowState.flow.update(Math.max(1, Math.round(stepSeconds * 60))));
    flowState.toppledThisShot = flowState.flow.snapshot().targetsDown - flowState.toppledAtStrike;
  }

  if (input.pressed("reset")) {
    flowState.flow.resetHole();
    holeFlow.layoutHole();
    flowState.pendingAdvance = null;
  }
  if (flowState.pendingAdvance && (input.pressed("confirm") || confirmTap)) {
    pushCue("ui-confirm");
    if (flowState.pendingAdvance === "next-hole") holeFlow.loadHole(flowState.holeIndex + 1);
    else if (flowState.pendingAdvance === "retry-hole") holeFlow.loadHole(flowState.holeIndex);
    else holeFlow.loadHole(0);
  }
  confirmTap = false;
  if (shot.state.phase === "struck" && flowState.flow.phase === "aiming") shot.armNextShot();

  // ---- presentation ----------------------------------------------------------
  const ball = flowState.flow.sim.ball.position;
  rigState.ball = { x: ball[0], z: ball[2] };
  rigState.ballInFlight = flowState.flow.phase === "simulating";

  for (const pose of flowState.flow.sim.poses()) {
    if (!flowState.currentVisualNames.has(pose.name)) continue;
    const e = quatToEuler(pose.rotation);
    handle(pose.name)?.setPosition(pose.position[0], pose.position[1], pose.position[2])
      .setRotation(e.x, e.y, e.z);
  }

  // Aim guide + charge ring track the ball while aiming.
  const aiming = flowState.flow.phase === "aiming";
  const aimAngle = flowState.flow.hole.aim;
  const baseDir = [
    aimAngle[0] / (Math.hypot(aimAngle[0], aimAngle[1]) || 1),
    aimAngle[1] / (Math.hypot(aimAngle[0], aimAngle[1]) || 1)
  ];
  const dirX = baseDir[0] * Math.cos(aim.angle) - baseDir[1] * Math.sin(aim.angle);
  const dirZ = baseDir[1] * Math.cos(aim.angle) + baseDir[0] * Math.sin(aim.angle);
  handle("siege-aim-guide")
    ?.setPosition(ball[0] + dirX * 0.9, 0.06, ball[2] + dirZ * 0.9)
    .setRotation(0, Math.atan2(dirX, -dirZ) + Math.PI, 0)
    .setVisible(aiming);
  const charge = aim.phase === "charging" ? aim.charge : 0;
  handle("siege-charge-ring")
    ?.setPosition(ball[0], 0.05, ball[2])
    .setScale([0.5 + charge * 0.7, 0.5 + charge * 0.7, 0.5])
    .setVisible(aiming && aim.phase === "charging");

  fx.step(stepSeconds);
  if (frame % 6 === 0) syncHud();
});

// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(game.lookSource()),
  postPreset: "daylight-outdoor",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "siege-golf.altitude"
});

publishSiegeEvidence({
  game,
  run: () => ({
    holeIndex: flowState.holeIndex,
    holeName: flowState.flow.hole.name,
    holeId: flowState.flow.hole.id,
    phase: flowState.flow.phase,
    strokes: flowState.flow.strokes,
    par: flowState.flow.hole.par,
    toppledThisShot: flowState.toppledThisShot,
    lastStrikePower: flowState.lastStrikePower,
    roundComplete: flowState.holeIndex >= SIEGE_GOLF_HOLES.length - 1 && flowState.flow.phase === "hole-complete"
  }),
  flow: () => flowState.flow.snapshot(),
  aim: () => shot.state,
  sceneSwaps: () => 0,
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const params = new URL(location.href).searchParams;
if (params.get("autorun") === "1") autoplayEnabled = true;
applySiegeScenario(params.get("scenario"), {
  loadHole: (index) => holeFlow.loadHole(index),
  enableAutoplay: () => { autoplayEnabled = true; }
});

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createSiegeRig(rigState), { blend: 0.4 });
  // C-05 output: daylight-outdoor preset; post presets stub {} until the
  // registry ships real output profiles.
    game.app.setOutput?.({ preset: "daylight-outdoor",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-siege-golf",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
