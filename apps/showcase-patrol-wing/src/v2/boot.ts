// apps/showcase-patrol-wing/src/v2/boot.ts — QR-14 rebuild shell (T2.1-T2.6).
// Runs only under `?a3d-qr=route-patrol-wing` / env A3D_QR_ROUTE_PATROL_WING.
// Full createGame port of the evening coastal patrol: authored six-axis
// FlightModel over the real island heightfield, Rapier sensor layer for the
// six ordered ring gates + pad + return-fire orb pool, drone waves off ring
// milestones, ctx.cannon combat through the shared combatWorld, ghost replay of
// the best graded sortie, the §6.9.11 ctx.flight rig, and dirty-checked HUD.
// Gameplay modules (ctx.flight/patrol/drones/weapons/ghost) are imported, not
// modified; audio plays through the legacy cue controller on admitted sfx
// ids until C-25 lands (stand-in R-14-15).
import { game as engineGame, scene, type AuraCameraPose, type GameInputController } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import type { FlightModel } from "../gameplay/flight";
import type { PatrolGrade } from "../gameplay/patrol";




import { createWingAudio, type WingAudioCue } from "../legacy/wing-audio";
import direction from "../../art/direction";
import { patrolWorldNodes, ORB_POOL_SIZE } from "./scene/world";
import { terrainSurface } from "../legacy/sky";
import { lightingNodes } from "./scene/lighting";
import { createPatrolRig, fallbackCameraNode, pointInRigFrame, type PatrolRigState } from "./scene/camera";
import { wirePatrolFx } from "./scene/fx";
import { SKY_BG } from "./scene/materials";
import { publishPatrolEvidence, type PatrolRouteState, type PatrolRunSnapshot } from "./evidence";
import { createPatrolCtx } from "./state";
import { createPatrolAudioBlock } from "./audio";
import { createPatrolInput, wirePatrolTouch } from "./input";
import { wirePatrolCombat } from "./combat";
import { wirePatrolSync } from "./sync";
import { wirePatrolHud } from "./hud";
import { wirePatrolUpdate } from "./update";
import { applyPatrolScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_PATROL_WING" as const;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";
const scenarioName = routeParams.get("scenario") ?? "";

const ctx = createPatrolCtx(autopilotRequested);
const sceneSwaps = 0;
const bootedAtMs = performance.now();

const world = patrolWorldNodes();

function buildScene() {
  return scene()
    .background(SKY_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

const { audio, audioCueLog, pushCue, cueReady, unlockAudio } = createPatrolAudioBlock(ctx);
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-patrol-wing",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.16,
    widgets: [
      { id: "mission", kind: "label", anchor: "top", label: "MISSION" },
      { id: "patrol", kind: "label", anchor: "top-left", label: "PATROL" },
      { id: "hull", kind: "gauge", anchor: "top-right", label: "HULL" },
      { id: "rings", kind: "label", anchor: "bottom-left", label: "RINGS" },
      { id: "speed", kind: "label", anchor: "bottom", label: "AIRSPEED" },
      { id: "wave", kind: "label", anchor: "bottom-right", label: "COMBAT" }
    ]
  },
  touch: {
    preset: "flight",
    bindings: {
      stick: "drive",
      fire: "tap",
      throttle: "hold-top",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      "engine-loop": { asset: "patrolWingEngineLoopSfx" },
      "ring-chime": { asset: "patrolWingRingChimeSfx" },
      "cannon-fire": { asset: "patrolWingCannonFireSfx" },
      "drone-hit": { asset: "patrolWingDroneHitSfx" },
      "drone-down": { asset: "patrolWingDroneDownSfx" },
      "hull-alarm": { asset: "patrolWingHullAlarmSfx" },
      "shot-down": { asset: "patrolWingShotDownSfx" },
      "crash-thud": { asset: "patrolWingCrashThudSfx" },
      touchdown: { asset: "patrolWingTouchdownSfx" },
      "patrol-clear": { asset: "patrolWingPatrolClearSfx" },
      "ambient-wind": { asset: "patrolWingAmbientWindSfx" }
    }
  },
  juice: {
    "drone-down": { hitStopMs: 45, trauma: 0.2 },
    "orb-impact": { hitStopMs: 30, trauma: 0.14 },
    crash: { hitStopMs: 80, trauma: 0.45 },
    touchdown: { hitStopMs: 40, trauma: 0.1 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_patrol_wing` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-patrol-wing`).
    flags: ["route_patrol_wing", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wirePatrolFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

const input = createPatrolInput();
wirePatrolTouch(ctx, { game, unlockAudio });
const combat = wirePatrolCombat(ctx, { game, handle, fx, pushCue, cueReady, autopilotRequested });
const { collisionWorld, buildCollisions, resetToPad, spawnWave, spawnInterceptLeg, applyHullDamage } = combat;
const sync = wirePatrolSync(ctx, { game, handle, reducedMotion, collisionWorld });
const hudWired = wirePatrolHud(ctx, { game, objectiveComplete: combat.objectiveComplete });
const { syncHud } = hudWired;
const updateWired = wirePatrolUpdate(ctx, { game, input, combat, sync, hud: hudWired, audio, pushCue, cueReady, handle, fx });
const { updateGameplay } = updateWired;
buildCollisions();

// ------------------------------------------------------------ run snapshot --

function runSnapshot(): PatrolRunSnapshot {
  const pos = ctx.flight.position;
  const e = ctx.flight.euler;
  return {
    state: ctx.stateValue,
    paused: ctx.paused,
    patrol: ctx.patrolValue,
    hull: ctx.hullValue,
    timeInPatrol: ctx.timeInPatrol,
    rings: ctx.rings.snapshot(),
    cannon: ctx.cannon.snapshot(),
    hitsThisSortie: ctx.hitsThisSortie,
    dronesDown: ctx.swarm.downCount,
    dronesLive: ctx.swarm.liveCount,
    currentWave: ctx.currentWave,
    spawnedWaves: ctx.spawnedWaves.size,
    sensorEventCount: ctx.sensorEventTotal,
    combatEventCount: ctx.combatEventTotal,
    padSensorLatched: ctx.padSensorLatched,
    ringsInFrame: ctx.ringsInFrameNow,
    orbsActive: ctx.orbs.filter((orb) => orb.active).length,
    ghost: {
      recorded: ctx.ghostRecorder.frameCount > 0,
      frames: ctx.ghostRecorder.frameCount,
      playing: ctx.ghostPlayer?.playing ?? false,
      playbackFrame: ctx.ghostPlayer?.frameIndexValue ?? 0
    },
    flight: {
      position: pos,
      euler: [e.x, e.y, e.z],
      forward: ctx.flight.forward,
      throttle: ctx.flight.throttle,
      speed: ctx.flight.speed,
      altitude: pos[1] - terrainSurface(pos[0], pos[2]),
      stalled: ctx.flight.stalled,
      grounded: ctx.flight.grounded,
      trajectoryHash: ctx.flight.trajectoryFrameCount() > 0 ? ctx.flight.trajectoryHash() : null,
      trajectoryFrames: ctx.flight.trajectoryFrameCount()
    },
    lastGrade: ctx.lastGrade,
    bestGrade: ctx.bestRun?.grade ?? null,
    touchEngaged: ctx.touchEngaged
  };
}

// ------------------------------------------------------------ rig + boot ----

const rigState: PatrolRigState = {
  get position() {
    return ctx.flight.position;
  },
  get forward() {
    return ctx.flight.forward;
  },
  get up() {
    return ctx.flight.up;
  }
} as PatrolRigState;

game.app.onFrame?.(({ dt: rawDt }) => {
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  updateGameplay(Math.min(0.05, Math.max(0.001, frameDt)));
});

game.start();
void game.ready().then(() => {
  const rig = createPatrolRig(rigState);
  const update = rig.update.bind(rig);
  rig.update = (rigCtx) => {
    ctx.lastPose = update(rigCtx);
    return ctx.lastPose;
  };
  game.app.camera?.use?.(rig, { blend: 0.4 });
  // C-05 output: dusk coastal grade; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "cinematic-film",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return ctx.frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});

publishPatrolEvidence({
  game,
  run: runSnapshot,
  lastRigPose: () => ctx.lastPose,
  sceneSwaps: () => sceneSwaps,
  // T2.2-post: appliedLook derives from the C-31 runtime manifest.
  appliedLook: { ...lookManifest(game.lookSource()), preset: "cinematic-film" },
  frameCount: () => ctx.frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog,
  collisionBackend: () => "rapier",
  collisionBodyCount: () => ctx.sensorCountValue + ORB_POOL_SIZE + 1
});

if (scenarioName) {
  applyPatrolScenario(scenarioName, {
    launchSortie: () => {
      ctx.scenarioTakeoff = true;
    },
    spawnWaveLeg: () => {
      if (ctx.stateValue === "preflight") spawnInterceptLeg();
      else spawnWave(0);
    },
    fireOnce: () => {
      ctx.scenarioFireOnce = true;
    },
    applyHullDamage: (fraction) => {
      applyHullDamage(Math.max(0, Math.min(0.99, fraction)) * 100);
    }
  });
}
