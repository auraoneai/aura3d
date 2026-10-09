// apps/showcase-rooftop-buckets/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.6 "golden-hour rooftop league": glass board + open skyline, skinned
// scorer/defender via C-19 crossFadeTo, arc-ribbon ball trail, shoulder rig.
// Gameplay modules (court/hoop-sim/rim/scoring/shot) are unchanged; audio
// plays through the legacy cue map until C-25 game-sfx is real (R-14-10).
import { scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { COURT_SPOTS } from "../gameplay/court";
import { initialHoopState, updateHoop, type HoopState } from "../gameplay/rim";
import {
  createBallAtSpot, calculateLaunchVelocity, stepBall, type BallState
} from "../gameplay/shot";
import {
  initialScoreState, advanceHeat, recordShotOutcome, updateClocks, type GameScoreState
} from "../gameplay/scoring";
import direction from "../../art/direction";
import { BucketsAudioController, type BucketsAudioCue } from "../legacy/buckets-audio";
import { skylineNodes, courtNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createRooftopRig, fallbackCameraNode, type RooftopRigState } from "./scene/camera";
import { wireRooftopFx } from "./scene/fx";
import { publishRooftopEvidence } from "../evidence";
import { applyRooftopScenario } from "../scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_ROOFTOP_BUCKETS" as const;

const target = document.getElementById("app") ?? document.body;

// ------------------------------------------------------------------ scene ----

let scoreState: GameScoreState = initialScoreState(1);
let hoopState: HoopState = initialHoopState(1);
let currentSpotIndex = 1;
const isGold = () => scoreState.heat === 5;
let ballState: BallState = createBallAtSpot(COURT_SPOTS[currentSpotIndex]!, isGold());
const rigState: RooftopRigState = {
  get spot() { return COURT_SPOTS[currentSpotIndex]!; },
  ball: null
};

function buildScene() {
  return scene()
    .background("#26354c")
    .camera(fallbackCameraNode())
    .addMany(skylineNodes())
    .addMany(courtNodes())
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const audio = new BucketsAudioController();
const audioCueLog: string[] = [];
let audioUnlocked = false;
function pushCue(cue: BucketsAudioCue, volume = 0.8): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  audio.playCue(cue, volume);
}
// Autoplay policy: first gesture kicks the ambient loop; playCue already
// swallows play() rejections until then.
const unlockAudio = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  pushCue("ambientRooftop", 0.4);
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-rooftop-buckets",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sports-broadcast",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "heat", kind: "label", anchor: "top", label: "HEAT" },
      { id: "clock", kind: "label", anchor: "top-right", label: "CLOCK" },
      { id: "spot", kind: "label", anchor: "bottom-left", label: "SPOT" },
      { id: "meter", kind: "meter", anchor: "bottom", label: "CHARGE" }
    ]
  },
  touch: {
    preset: "aim-drag",
    bindings: { aim: "aim-drag", spotLeft: "left-tap", spotRight: "right-tap", shoot: "shoot-hold", pause: "menu" }
  },
  sound: {
    cues: {
      "charge-tick": { asset: "rooftopBucketsChargeTickSfx" },
      "rim-clank": { asset: "rooftopBucketsRimClankSfx" },
      "board-thud": { asset: "rooftopBucketsBoardThudSfx" },
      "swish": { asset: "rooftopBucketsSwishSfx" },
      "brick-miss": { asset: "rooftopBucketsBrickMissSfx" },
      "fire-ignite": { asset: "rooftopBucketsFireIgniteSfx" },
      "gold-ball": { asset: "rooftopBucketsGoldBallSfx" },
      "heat-advance": { asset: "rooftopBucketsHeatAdvanceSfx" },
      "buzzer-fail": { asset: "rooftopBucketsBuzzerFailSfx" },
      "ambient": { asset: "rooftopBucketsAmbientRooftopSfx" }
    }
  },
  juice: {
    "swish": { hitStopMs: 30 },
    "fire-ignite": { trauma: 0.15 },
    "buzzer-fail": { trauma: 0.2, hitStopMs: 50 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_rooftop_buckets` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-rooftop-buckets`).
    flags: ["route_rooftop_buckets", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

// ------------------------------------------------------------- shot state ----

const fx = wireRooftopFx(game);
let frame = 0;
let chargePower = 0;
let isCharging = false;
let chargeDirection = 1;
let aimPitch = 0;
let lastResult: "make" | "miss" | null = null;
let elapsedPlayTime = 0;
const bootedAtMs = performance.now();

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------- skinned actors ------

const actorClips = { scorer: "Ready", defender: "Plant" };
function crossFade(actor: "scorer" | "defender", clip: string, seconds = 0.25): void {
  if (actorClips[actor] === clip) return;
  actorClips[actor] = clip;
  const h = handle(actor === "scorer" ? "skinned-scorer" : "skinned-defender");
  (h as { crossFadeTo?: (c: string, s: number) => void } | undefined)?.crossFadeTo?.(clip, seconds);
}

function actorTracksApplied(actor: "scorer" | "defender"): number {
  const h = handle(actor === "scorer" ? "skinned-scorer" : "skinned-defender") as
    { animation?: { animationState?: () => { tracksApplied?: number } | undefined }; animationState?: () => { tracksApplied?: number } | undefined } | undefined;
  return h?.animation?.animationState?.()?.tracksApplied ?? h?.animationState?.()?.tracksApplied ?? 0;
}

// ------------------------------------------------------------ shot flow ------

function resetBallToSpot(): void {
  ballState = createBallAtSpot(COURT_SPOTS[currentSpotIndex]!, isGold());
  isCharging = false;
  chargeDirection = 1;
  fx.stopTrail();
  rigState.ball = null;
  crossFade("scorer", "Ready", 0.3);
}

function fullReset(): void {
  scoreState = initialScoreState(1);
  currentSpotIndex = 0;
  hoopState = initialHoopState(1);
  lastResult = null;
  elapsedPlayTime = 0;
  resetBallToSpot();
}

function releaseShot(power: number, pitch: number): boolean {
  if (ballState.inFlight || scoreState.state !== "playing") return false;
  const spot = COURT_SPOTS[currentSpotIndex]!;
  const vel = calculateLaunchVelocity(spot, power, pitch, hoopState);
  ballState = {
    ...ballState,
    vx: vel.vx, vy: vel.vy, vz: vel.vz,
    inFlight: true, settled: false, flightTimer: 0
  };
  if (ballState.isGold) pushCue("goldBall", 0.9);
  fx.startTrail("ball-live");
  fx.onRelease([ballState.x, ballState.y, ballState.z]);
  crossFade("scorer", "Release", 0.15);
  if (hoopState.defenderActive) crossFade("defender", "Contest", 0.2);
  rigState.ball = [ballState.x, ballState.y, ballState.z];
  return true;
}

function settleBall(): void {
  const isGoldBall = isGold();
  const { state: nextScore, event: scoreEvent } = recordShotOutcome(
    scoreState,
    ballState.result ?? "brick",
    COURT_SPOTS[currentSpotIndex]!.points,
    isGoldBall,
    COURT_SPOTS[currentSpotIndex]!.id
  );
  scoreState = nextScore;
  lastResult = scoreEvent.pointsEarned > 0 ? "make" : "miss";
  if (scoreEvent.isFireIgnited) {
    pushCue("fireIgnite", 0.9);
    fx.onFireStart([COURT_SPOTS[currentSpotIndex]!.x, 1.6, COURT_SPOTS[currentSpotIndex]!.z]);
  } else if (!ballState.hasScored) {
    pushCue("brickMiss", 0.7);
  }
  if (scoreState.state === "playing") {
    resetBallToSpot();
  } else {
    fx.stopTrail();
    rigState.ball = null;
  }
}

// ------------------------------------------------------------- input ---------

const held = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (!e.repeat) held.add(e.code);
  if (e.code === "Space" && !e.repeat && !ballState.inFlight && scoreState.state === "playing") {
    isCharging = true;
    chargePower = 0;
    chargeDirection = 1;
    crossFade("scorer", "Load", 0.2);
  }
  if (e.repeat) return;
  if (e.code === "KeyP" || e.code === "Escape") {
    game.session.paused ? game.session.resume() : game.session.pause();
  } else if (e.code === "KeyR") {
    fullReset();
  } else if (!ballState.inFlight && scoreState.state === "playing") {
    if (e.code === "KeyA" || e.code === "ArrowLeft") {
      currentSpotIndex = (currentSpotIndex - 1 + COURT_SPOTS.length) % COURT_SPOTS.length;
      resetBallToSpot();
      syncStaticNodes();
    } else if (e.code === "KeyD" || e.code === "ArrowRight") {
      currentSpotIndex = (currentSpotIndex + 1) % COURT_SPOTS.length;
      resetBallToSpot();
      syncStaticNodes();
    }
  }
}, { passive: true });
window.addEventListener("keyup", (e) => {
  held.delete(e.code);
  if (e.code === "Space" && isCharging) {
    isCharging = false;
    releaseShot(chargePower, aimPitch);
  }
});
window.addEventListener("keydown", (e) => {
  if (["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) {
    e.preventDefault();
  }
}, { passive: false });

// Touch (§7.2.1 preset "aim-drag"): horizontal drag = pitch, vertical drag =
// spot change; press-and-hold charges, release shoots.
const touch = { downAt: 0, x: 0, y: 0, charging: false };
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  touch.downAt = performance.now();
  touch.x = e.clientX;
  touch.y = e.clientY;
  if (!ballState.inFlight && scoreState.state === "playing") {
    touch.charging = true;
    isCharging = true;
    chargePower = 0;
    chargeDirection = 1;
    crossFade("scorer", "Load", 0.2);
  }
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointermove", (e) => {
  if (!touch.charging) return;
  const dy = (e.clientY - touch.y) / 240;
  const dx = (e.clientX - touch.x) / 240;
  aimPitch = Math.max(-1, Math.min(1, -dy * 1.4));
  if (Math.abs(dx) > 0.5 && Math.abs(dx) > Math.abs(dy)) {
    const delta = dx > 0 ? 1 : -1;
    currentSpotIndex = (currentSpotIndex + delta + COURT_SPOTS.length) % COURT_SPOTS.length;
    touch.x = e.clientX;
    resetBallToSpot();
    syncStaticNodes();
    isCharging = true;
    touch.charging = true;
  }
});
target.addEventListener("pointerup", () => {
  if (touch.charging) {
    touch.charging = false;
    isCharging = false;
    releaseShot(chargePower, aimPitch);
  }
  touch.downAt = 0;
});
target.addEventListener("pointercancel", () => { touch.charging = false; isCharging = false; touch.downAt = 0; });

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ------------------------------------------------------------- frame loop ----

const ATHLETE_FLOOR_OFFSET = 1.016 * 1.18;

function syncStaticNodes(): void {
  const spot = COURT_SPOTS[currentSpotIndex]!;
  const yaw = Math.atan2(-(0 - spot.x), -(0 - spot.z));
  handle("skinned-scorer")?.setPosition(spot.x, ATHLETE_FLOOR_OFFSET, spot.z).setRotation(0, yaw, 0);
}

let lastHudSignature = "";
let lastHudWrite = 0;
function syncHud(): void {
  const spot = COURT_SPOTS[currentSpotIndex]!;
  const signature = `${scoreState.score}|${scoreState.heat}|${currentSpotIndex}|${Math.round(chargePower * 100)}|${scoreState.state}|${scoreState.shotClock}`;
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("score", `${scoreState.score}`);
  game.hud.set("heat", `HEAT ${scoreState.heat}`);
  game.hud.set("clock", `${Math.max(0, Math.ceil(scoreState.shotClock))}`);
  game.hud.set("spot", spot.name);
  game.hud.set("meter", isCharging ? `${Math.round(chargePower * 100)}` : "");
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const dt = game.session.scaledDt(rawDt);
  frame += 1;
  if (dt <= 0 || game.session.paused) return;
  elapsedPlayTime += dt;

  // Charge meter ping-pong (0→1→0) while held.
  if (isCharging) {
    chargePower += chargeDirection * dt * 1.6;
    if (chargePower >= 1) { chargePower = 1; chargeDirection = -1; }
    else if (chargePower <= 0) { chargePower = 0; chargeDirection = 1; pushCue("chargeTick", 0.35); }
  }
  if (held.has("KeyW") || held.has("ArrowUp")) aimPitch = Math.min(1, aimPitch + dt * 1.4);
  if (held.has("KeyS") || held.has("ArrowDown")) aimPitch = Math.max(-1, aimPitch - dt * 1.4);

  // Heat-clear advance (same rule as legacy: on state transition).
  if (scoreState.state === "heat-cleared") {
    scoreState = advanceHeat(scoreState);
    if (scoreState.heat === 2) currentSpotIndex = 0;
    hoopState = initialHoopState(scoreState.heat);
    pushCue("heatAdvance", 0.9);
    resetBallToSpot();
  }

  // Moving hoop + defender telegraph.
  hoopState = updateHoop(hoopState, scoreState.heat, elapsedPlayTime, COURT_SPOTS[currentSpotIndex]!.x);
  if (hoopState.defenderTelegraph === "windup") crossFade("defender", "Telegraph", 0.2);
  else if (hoopState.defenderTelegraph === "contest") crossFade("defender", "Contest", 0.15);
  else if (hoopState.defenderTelegraph === "inactive" && !ballState.inFlight) crossFade("defender", "Plant", 0.3);

  // Ball flight: solver step + contact fx + scoring settle.
  const hadHitDefender = ballState.hitDefender;
  const hadScored = ballState.hasScored;
  if (ballState.inFlight) {
    const { ball: next, events } = stepBall(ballState, hoopState, dt);
    ballState = next;
    if (events.clankedRim) { pushCue("rimClank", 0.7); fx.onContact("rim", [ballState.x, ballState.y, ballState.z]); }
    if (events.thuddedBoard) { pushCue("boardThud", 0.7); fx.onContact("board", [ballState.x, ballState.y, ballState.z]); }
    if (events.swishedNet && !hadScored && ballState.hasScored) {
      pushCue("swish", 0.95);
      fx.onContact("swish", [hoopState.x, hoopState.y - 0.18, hoopState.z]);
    }
    if (!hadHitDefender && ballState.hitDefender) {
      fx.onContact("block", [ballState.x, ballState.y, ballState.z]);
    }
    rigState.ball = [ballState.x, ballState.y, ballState.z];
    if (events.settled) settleBall();
  } else {
    rigState.ball = null;
  }

  // Shot clock / heat clocks.
  const { state: clockNext, event: clockEvent } = updateClocks(scoreState, dt, ballState.inFlight);
  scoreState = clockNext;
  if (clockEvent.isClockViolation) {
    pushCue("buzzerFail", 0.7);
    fx.onBuzzer();
    resetBallToSpot();
  }
  if (clockEvent.isGameOver) pushCue("buzzerFail", 0.95);

  // Visual sync: ball pose (solver-owned), hoop sway, defender root.
  const ballH = handle("ball-live");
  if (ballH) {
    ballH.setPosition(ballState.x, ballState.y, ballState.z);
    if (ballState.inFlight) ballH.setRotation(0, 0, 0);
  }
  handle("rim-assembly")?.setPosition(hoopState.x, hoopState.y, hoopState.z);
  handle("backboard-assembly")?.setPosition(hoopState.x, hoopState.y + 0.3, hoopState.z - 0.35);
  const defH = handle("skinned-defender");
  if (defH && hoopState.defenderActive) {
    defH.setPosition(hoopState.defenderX, ATHLETE_FLOOR_OFFSET + Math.max(0, hoopState.defenderY - 0.9), hoopState.defenderZ).setVisible(true);
  }
  // Aim dot: first predicted point while not in flight.
  const aim = handle("aim-preview-dot");
  if (aim && !ballState.inFlight) {
    const vel = calculateLaunchVelocity(COURT_SPOTS[currentSpotIndex]!, chargePower, aimPitch, hoopState);
    aim.setPosition(ballState.x + vel.vx * 0.5, ballState.y + vel.vy * 0.5, ballState.z + vel.vz * 0.5).setVisible(true);
  } else {
    aim?.setVisible(false);
  }
  fx.syncBurst(dt);
  if (frame % 6 === 0) syncHud();
});

// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(game.lookSource()),
  postPreset: "daylight-outdoor",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "rooftop-buckets.shoulder"
});

publishRooftopEvidence({
  game,
  ball: () => ballState,
  score: () => scoreState,
  hoop: () => hoopState,
  chargePower: () => chargePower,
  spotIndex: () => currentSpotIndex,
  lastResult: () => lastResult,
  skinnedActors: () => [
    { id: "skinned-scorer", tracksApplied: actorTracksApplied("scorer") },
    { id: "skinned-defender", tracksApplied: actorTracksApplied("defender") }
  ],
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const scenario = new URL(location.href).searchParams.get("scenario");
if (scenario) {
  applyRooftopScenario(scenario, {
    releaseAt: (power, pitch) => releaseShot(power, pitch),
    chargeTo: (p) => { chargePower = p; isCharging = true; crossFade("scorer", "Load", 0.2); },
    sync: () => { syncStaticNodes(); syncHud(); }
  });
}

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createRooftopRig(rigState), { blend: 0.4 });
  // C-05 output: daylight-outdoor preset; post presets stub {} until the
  // registry ships real output profiles.
    game.app.setOutput?.({ preset: "daylight-outdoor",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  syncStaticNodes();
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-rooftop-buckets",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
