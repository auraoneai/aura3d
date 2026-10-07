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
import { postPresets } from "@aura3d/engine/contracts";
import { createGame, type Game } from "@aura3d/game";
import { SIEGE_GOLF_HOLES } from "../gameplay/course";
import { HoleFlow, type SiegeGameEvent } from "../gameplay/hole-flow";
import { ShotController } from "../gameplay/shot";
import { quatToEuler } from "../gameplay/structures";
import { SIEGE_GOLF_CANONICAL_SOLUTIONS } from "../gameplay/solutions";
import { completeHole } from "../gameplay/score";
import { createGolfAudio, type GolfAudioCue } from "../legacy/golf-audio";
import direction from "../../art/direction";
import { siegeWorldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createSiegeRig, fallbackCameraNode } from "./scene/camera";
import { wireSiegeFx } from "./scene/fx";
import { RANGE_BG } from "./scene/materials";
import { publishSiegeEvidence } from "./evidence";
import { applySiegeScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_SIEGE_GOLF" as const;
const AIM_RATE = 0.9; // radians/s while an aim key is held
const AUTOPLAY_DELAY_SECONDS = 0.9;

const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --

let holeIndex = 0;
let flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
const shot = new ShotController();
shot.loadHole(flow.hole.aim);
let lastStrikePower = 0;
let toppledAtStrike = 0;
let toppledThisShot = 0;
let autoplayEnabled = false;
let autoplayWait = AUTOPLAY_DELAY_SECONDS;
let pendingAdvance: "next-hole" | "retry-hole" | "new-round" | null = null;
let frame = 0;
const bootedAtMs = performance.now();

const rigState = { ball: { x: flow.hole.tee[0], z: flow.hole.tee[1] }, ballInFlight: false };
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
  qualityRebuild: { flags: [ROUTE_FLAG] }
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

let currentVisualNames = new Set(flow.sim.visuals.map((v) => v.name));

/** Pose + show the active hole's visuals; hide union names it doesn't own. */
function layoutHole(): void {
  const specs = new Map(flow.sim.visuals.map((v) => [v.name, v]));
  currentVisualNames = new Set(specs.keys());
  for (const name of world.visualNames) {
    const h = handle(name);
    if (!h) continue;
    const spec = specs.get(name);
    if (!spec) {
      h.setVisible(false);
      continue;
    }
    h.setVisible(true)
      .setPosition(spec.position[0], spec.position[1], spec.position[2])
      .setRotation(spec.rotation.x, spec.rotation.y, spec.rotation.z);
  }
}

function loadHole(index: number): void {
  holeIndex = index;
  flow = new HoleFlow(SIEGE_GOLF_HOLES[index]!);
  shot.loadHole(flow.hole.aim);
  lastStrikePower = 0;
  toppledAtStrike = 0;
  toppledThisShot = 0;
  pendingAdvance = null;
  autoplayWait = AUTOPLAY_DELAY_SECONDS;
  layoutHole();
}

function applyStrikeResult(result: NonNullable<ReturnType<ShotController["strike"]>>): void {
  const applied = flow.strike(result.input.vector, result.input.power);
  if (!applied) {
    shot.armNextShot();
    return;
  }
  toppledAtStrike = flow.snapshot().targetsDown;
  lastStrikePower = result.input.power;
  const p = flow.sim.ball.position;
  fx.strike(p[0], p[2], result.input.power);
  pushCue("drive-hit");
}

function consumeEvents(events: readonly SiegeGameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case "strike":
        break;
      case "impact-wood": {
        const p = flow.sim.ball.position;
        pushCue("wood-crack");
        fx.impactWood(p[0], p[1], p[2]);
        break;
      }
      case "impact-metal": {
        const p = flow.sim.ball.position;
        pushCue("metal-clang");
        fx.impactMetal(p[0], p[1], p[2]);
        break;
      }
      case "cup-flash": {
        const p = flow.sim.ball.position;
        fx.cupFlash(p[0], p[2]);
        break;
      }
      case "pin-down": {
        const body = flow.sim.pinBodies.get(event.pinId);
        const p = body?.position ?? [0, 0.4, 0];
        pushCue("target-down");
        fx.pinDown(p[0], p[1], p[2]);
        break;
      }
      case "pin-sunk": {
        const cup = flow.hole.cups[0];
        pushCue("cup-sink");
        if (cup) fx.pinSunk(cup.x, cup.z);
        break;
      }
      case "out-of-bounds":
        break;
      case "settled":
        toppledThisShot = flow.snapshot().targetsDown - toppledAtStrike;
        break;
      case "complete": {
        const entry = completeHole(flow.scoreEntry());
        const cup = flow.hole.cups[0];
        pushCue(entry.stars >= 2 ? "par-chime" : "cup-sink");
        if (cup) fx.complete(cup.x, cup.z);
        pendingAdvance = holeIndex >= SIEGE_GOLF_HOLES.length - 1 ? "new-round" : "next-hole";
        break;
      }
      case "failed":
        pushCue("bogey-sting");
        fx.failed();
        pendingAdvance = "retry-hole";
        break;
      case "reset":
        break;
      default:
        break;
    }
  }
}

function autoplayStroke(): void {
  const solution = SIEGE_GOLF_CANONICAL_SOLUTIONS.find((s) => s.holeId === flow.hole.id);
  if (!solution || flow.phase !== "aiming") return;
  const stroke = solution.strokes[Math.min(flow.strokes, solution.strokes.length - 1)]!;
  shot.aimTo(stroke.angle);
  const result = shot.strikeAtPower(stroke.power);
  if (result) applyStrikeResult(result);
}

// ------------------------------------------------------------- frame loop ----

let lastHudSignature = "";
let lastHudWrite = 0;
function syncHud(): void {
  const snap = flow.snapshot();
  const aim = shot.state;
  const signature = [
    holeIndex, snap.phase, snap.strokes, snap.targetsSunk, aim.charge.toFixed(2),
    pendingAdvance ?? ""
  ].join("|");
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("hole", `${flow.hole.name} · PAR ${snap.par}`);
  game.hud.set("score", `${snap.strokes}`);
  game.hud.set("power", aim.phase === "charging" ? `PWR ${Math.round(aim.charge * 100)}%` : "");
  game.hud.set("targets", `${snap.targetsSunk}/${snap.totalTargets} SUNK · ${snap.targetsDown} DOWN`);
  game.hud.set("message",
    pendingAdvance === "new-round" ? "ROUND COMPLETE — ENTER TO RESTART"
      : pendingAdvance === "next-hole" ? "HOLE COMPLETE — ENTER FOR NEXT"
        : pendingAdvance === "retry-hole" ? "HOLE FAILED — ENTER TO RETRY"
          : snap.phase === "simulating" ? ""
            : "A/D AIM · HOLD SPACE TO CHARGE · RELEASE TO DRIVE");
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  const aim = shot.state;
  if (flow.phase === "aiming") {
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
      if (result) applyStrikeResult(result);
    }
    if (pendingDrag) {
      const result = shot.strikeFromDrag(pendingDrag.start, pendingDrag.end);
      pendingDrag = null;
      if (result) applyStrikeResult(result);
    }
    // Deterministic capture path: autorun/scenario plays the canonical
    // solution for the active hole.
    if (autoplayEnabled) {
      autoplayWait -= stepSeconds;
      if (autoplayWait <= 0) {
        autoplayWait = 1.2;
        autoplayStroke();
      }
    }
  } else if (flow.phase === "simulating") {
    pendingDrag = null;
    consumeEvents(flow.update(Math.max(1, Math.round(stepSeconds * 60))));
    toppledThisShot = flow.snapshot().targetsDown - toppledAtStrike;
  }

  if (input.pressed("reset")) {
    flow.resetHole();
    layoutHole();
    pendingAdvance = null;
  }
  if (pendingAdvance && (input.pressed("confirm") || confirmTap)) {
    pushCue("ui-confirm");
    if (pendingAdvance === "next-hole") loadHole(holeIndex + 1);
    else if (pendingAdvance === "retry-hole") loadHole(holeIndex);
    else loadHole(0);
  }
  confirmTap = false;
  if (shot.state.phase === "struck" && flow.phase === "aiming") shot.armNextShot();

  // ---- presentation ----------------------------------------------------------
  const ball = flow.sim.ball.position;
  rigState.ball = { x: ball[0], z: ball[2] };
  rigState.ballInFlight = flow.phase === "simulating";

  for (const pose of flow.sim.poses()) {
    if (!currentVisualNames.has(pose.name)) continue;
    const e = quatToEuler(pose.rotation);
    handle(pose.name)?.setPosition(pose.position[0], pose.position[1], pose.position[2])
      .setRotation(e.x, e.y, e.z);
  }

  // Aim guide + charge ring track the ball while aiming.
  const aiming = flow.phase === "aiming";
  const aimAngle = flow.hole.aim;
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

const appliedLook: Record<string, unknown> = Object.freeze({
  postPreset: "daylight-outdoor",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "siege-golf.altitude"
});

publishSiegeEvidence({
  game,
  run: () => ({
    holeIndex,
    holeName: flow.hole.name,
    holeId: flow.hole.id,
    phase: flow.phase,
    strokes: flow.strokes,
    par: flow.hole.par,
    toppledThisShot,
    lastStrikePower,
    roundComplete: holeIndex >= SIEGE_GOLF_HOLES.length - 1 && flow.phase === "hole-complete"
  }),
  flow: () => flow.snapshot(),
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
  loadHole: (index) => loadHole(index),
  enableAutoplay: () => { autoplayEnabled = true; }
});

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createSiegeRig(rigState), { blend: 0.4 });
  // C-05 output: daylight-outdoor preset; post presets stub {} until the
  // registry ships real output profiles.
  void postPresets["daylight-outdoor"];
  game.app.setOutput?.({ exposure: Math.pow(2, direction.lighting.exposureEV) });
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
