// apps/showcase-aurora-lander/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.12 "night landing on an icy moon under a moving aurora": the authored
// deterministic lander sim (stepLander) drives a real Rapier contact proxy
// over the static heightfield + pad sensors; the BVH surface query grades
// attitude/slope at touchdown. One scene holds all three sites — loadSite
// re-shows node groups instead of swapping scenes (loading.sceneSwaps = 0, a
// §7.2.1 contract). Gameplay modules (lander/terrain/sites/touchdown/
// prediction/ghost) are unchanged; audio plays through the legacy cue
// controller until C-25 lands (standIn R-14-15).
import { game as engineGame, createMeshSurfaceQuery, scene, type AuraCameraPose, type GameInputController, type MeshSurfaceQuery, type SurfaceSample } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { SITES, campaignScore, type LanderSite } from "../gameplay/sites";
import { sampleGridHeight, type TerrainField } from "../gameplay/terrain";
import {
  createLanderState,
  gustForceAt,
  gustTelegraphActive,
  hspeedOf,
  stepLander,
  type Controls,
  type LanderState
} from "../gameplay/lander";
import {
  LANDER_MAX_HULL,
  gradeTouchdown,
  hullAfterTouchdown,
  scoreTouchdown,
  type LandingGrade
} from "../gameplay/touchdown";
import { predictLanding, type LandingPrediction } from "../gameplay/prediction";
import {
  createGhostPlayback,
  exportBestRun,
  importBestRun,
  loadBestRunRaw,
  saveBestRun,
  trajectoryHash,
  type GhostSample
} from "../gameplay/ghost";
import { createLanderAudio, type LanderAudioCue } from "../legacy/lander-audio";
import direction from "../../art/direction";
import { auroraWorldNodes, siteGroupNames, EXTRACTION_INFRASTRUCTURE } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createAuroraRig, fallbackCameraNode } from "./scene/camera";
import { wireAuroraFx } from "./scene/fx";
import { NIGHT_BG } from "./scene/materials";
import { publishAuroraEvidence, type AuroraRunSnapshot } from "./evidence";
import { applyAuroraScenario } from "./scenarios";
import { createAuroraCtx } from "./state";
import { createLanderAudioBlock, wireLanderAudioUnlock } from "./audio";
import { createLanderInput, wireLanderInput } from "./input";
import { wireAuroraRuntime } from "./runtime";
import { wireAuroraRender } from "./render";

const ROUTE_FLAG = "A3D_QR_ROUTE_AURORA_LANDER" as const;
const FIXED_DT = 1 / 60;
const PLAYER_MAX_CATCHUP_SECONDS = 0.5;
const MAX_SUBSTEPS = 40;
const FOOT_DROP = 0.72;
const CONTACT_PROXY_RADIUS = 0.42;
const APPROACH_SCAFFOLD_MIN_AGL = 28;
const RECORDED_BINDINGS = new Set(["KeyW", "ArrowUp", "KeyA", "ArrowLeft", "KeyD", "ArrowRight", "thrust"]);

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";
const approachSpawnRequested = routeParams.get("approach") === "1";

const world = auroraWorldNodes();

function buildScene() {
  return scene()
    .background(NIGHT_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ------------------------------------------------------------------ audio ---

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;


// ------------------------------------------------------------------ game -----

const ctx = createAuroraCtx({ autopilotEnabled: autopilotRequested, approachSpawnEnabled: approachSpawnRequested, field: world.fields[0] });
const sceneSwaps = 0;
const bootedAtMs = performance.now();
const audioBlock = createLanderAudioBlock(ctx, reducedMotion);
const { audio, audioCueLog, pushCue, unlockAudio } = audioBlock;
wireLanderAudioUnlock(unlockAudio);

const game = createGame({
  id: "showcase-aurora-lander",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "site", kind: "label", anchor: "top", label: "SITE" },
      { id: "telemetry", kind: "label", anchor: "top-right", label: "TELEMETRY" },
      { id: "fuel", kind: "label", anchor: "top-left", label: "FUEL" },
      { id: "hull", kind: "label", anchor: "bottom-left", label: "HULL" },
      { id: "score", kind: "score", anchor: "bottom-right", label: "SCORE" },
      { id: "message", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "dpad-4btn",
    bindings: { rotate: "dpad", thrust: "btn-a", ghost: "btn-x", restart: "btn-y", pause: "menu" }
  },
  sound: {
    cues: {
      "thrust-loop": { asset: "auroraThrustLoopSfx" },
      "rcs-puff": { asset: "auroraRcsPuffSfx" },
      "pad-lock": { asset: "auroraPadLockSfx" },
      "fuel-low": { asset: "auroraFuelLowSfx" },
      "gust-warn": { asset: "auroraGustWarnSfx" },
      "touch-soft": { asset: "auroraTouchSoftSfx" },
      "touch-hard": { asset: "auroraTouchHardSfx" },
      "crash": { asset: "auroraCrashSfx" },
      "site-clear": { asset: "auroraSiteClearSfx" },
      "ambient-wind": { asset: "auroraAmbientWindSfx" }
    }
  },
  juice: {
    "touch-soft": { hitStopMs: 30, trauma: 0.12 },
    "touch-hard": { hitStopMs: 40, trauma: 0.22 },
    "crash": { hitStopMs: 60, trauma: 0.34 },
    "site-clear": { trauma: 0.18 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_aurora_lander` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-aurora-lander`).
    flags: ["route_aurora_lander", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireAuroraFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

const rigState = {
  x: ctx.state.x,
  y: ctx.state.y,
  z: ctx.state.z,
  agl: ctx.state.y,
  padX: SITES[0]!.pads[0]!.x,
  padY: 0,
  padZ: SITES[0]!.pads[0]!.z
};


// ------------------------------------------------------------ collision -----


const siteQueries = world.fields.map((entry) =>
  createMeshSurfaceQuery({ positions: entry.queryPositions, indices: entry.queryIndices })
);

const collisionWorld = engineGame.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });

function rebuildCollisions(): void {
  if (!ctx.field) throw new Error("Terrain ctx.field missing before collision rebuild.");
  collisionWorld.clear();
  const terrainBody = collisionWorld.add({
    id: "site-terrain-heightfield",
    type: "static",
    shape: ctx.field.colliderShape
  });
  const sensorIds: string[] = [];
  ctx.currentSite.pads.forEach((pad, index) => {
    const padHeight = ctx.field!.padHeights[index] ?? 0;
    const sensor = collisionWorld.add({
      id: `pad-sensor-${index + 1}`,
      type: "static",
      position: [pad.x, padHeight + 1.4, pad.z],
      shape: { kind: "box", halfExtents: [pad.radius, 1.4, pad.radius] },
      sensor: true
    });
    sensorIds.push(sensor.id);
  });
  const proxy = collisionWorld.add({
    id: "lander-contact-proxy",
    type: "dynamic",
    position: [ctx.state.x, ctx.state.y - FOOT_DROP, ctx.state.z],
    shape: { kind: "sphere", radius: CONTACT_PROXY_RADIUS },
    material: { friction: 0.6, restitution: 0.05 }
  });
  ctx.collisions = { terrainId: terrainBody.id, sensorIds, proxyId: proxy.id };
  ctx.contactEventsSeen = 0;
  ctx.contactQueryAgreement = null;
  ctx.padSensorArmed = false;
}

// ------------------------------------------------------------------ input ---

const input = createLanderInput();
const inputWired = wireLanderInput(ctx, { target, game, unlockAudio });
const { syncTimedFlightControls, consumeTimedFlightControl, touchHeld, touchHoldFor, timedControlSeconds } = inputWired;

// ------------------------------------------------------------- site flow ----

const runtime = wireAuroraRuntime(ctx, {
  game, world, handle, collisionWorld, rebuildCollisions, siteQueries, input,
  pushCue, audio, fx, reducedMotion, rigState, consumeTimedFlightControl, touchHeld, timedControlSeconds
});
const { spawnStateFor, setSiteGroupVisible, resetAttempt, loadSite, beginGhostFromBest,
        maybeRecordBestRun, gradeFromContact, spawnCrashDebris, readControls,
        autopilotControls, tick, toggleGhost, togglePause, handleControlEdges } = runtime;

// ------------------------------------------------------------- render -------

const render = wireAuroraRender(ctx, { game, world, handle, fx, reducedMotion, rigState, loadSite });
const { syncHud, renderUpdate } = render;

// -------------------------------------------------------------- evidence ----

function runSnapshot(): AuroraRunSnapshot {
  return {
    siteIndex: ctx.siteIndex,
    phase: ctx.phase,
    paused: ctx.paused,
    lastGrade: ctx.lastGrade,
    crashReason: ctx.crashReason,
    state: {
      x: ctx.state.x,
      y: ctx.state.y,
      z: ctx.state.z,
      vy: ctx.state.vy,
      hspeed: hspeedOf(ctx.state),
      tiltDeg: ctx.state.tiltDeg,
      fuel: ctx.state.fuel / ctx.currentSite.fuelBudget
    },
    altitude: Math.max(0, rigState.agl),
    prediction: ctx.latestPrediction,
    hull: ctx.campaignHull / LANDER_MAX_HULL,
    campaignScore: campaignScore(SITES.map((_, i) => ctx.siteScores[i] ?? 0)),
    completedSites: ctx.siteScores.filter((s) => s > 0).length,
    siteScores: ctx.siteScores
  };
}

function b_pose(): AuraCameraPose | null {
  return game.app.camera?.evidence?.().pose ?? null;
}

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = {
  ...lookManifest(game.lookSource()),
  direction: direction.id,
  rig: "aurora-lander.altitude",
  key: "moonlight 6500K directional (shadowed)",
  fill: "ibl data_galaxy_deep_space_1k @0.35",
  practicals: 2,
  background: NIGHT_BG,
  hdri: "k1-starfield stand-in (data_galaxy_deep_space_1k)",
  exposureEV: -0.2
};

publishAuroraEvidence({
  game,
  run: runSnapshot,
  site: () => ctx.currentSite,
  field: () => ctx.field,
  padWorldY: () => ctx.field?.padHeights[0] ?? 0,
  lastRigPose: () => b_pose(),
  contact: () => ({ seen: ctx.contactEventsSeen, queryAgreement: ctx.contactQueryAgreement, padSensorArmed: ctx.padSensorArmed }),
  ghost: () => ({ active: ctx.ghostActive, replayHash: ctx.ghostReplayHash ?? (ctx.ghostActive ? null : trajectoryHash(ctx.attemptSamples) || null) }),
  sceneSwaps: () => sceneSwaps,
  appliedLook,
  frameCount: () => ctx.frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

// --------------------------------------------------------------- boot -------

const scenario = applyAuroraScenario(routeParams.get("scenario"), {
  loadSite: (index) => {
    ctx.siteIndex = index;
    ctx.currentSite = SITES[index]!;
    ctx.field = world.fields[index]!;
    ctx.surfaceQuery = siteQueries[index];
    rigState.padX = ctx.currentSite.pads[0]!.x;
    rigState.padY = ctx.field.padHeights[0] ?? 0;
    rigState.padZ = ctx.currentSite.pads[0]!.z;
  },
  enableApproachSpawn: () => { ctx.approachSpawnEnabled = true; },
  enableAutopilot: () => { ctx.autopilotEnabled = true; }
});
void scenario;

// Show only the active site's group before the first frame.
SITES.forEach((_, index) => {
  if (index !== ctx.siteIndex) setSiteGroupVisible(index, false);
});
resetAttempt();

game.app.onFrame?.(({ dt: rawDt }) => {
  syncTimedFlightControls(performance.now());
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  ctx.accumulator = Math.min(ctx.accumulator + frameDt, PLAYER_MAX_CATCHUP_SECONDS);
  let substeps = 0;
  while (ctx.accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
    input.update(FIXED_DT);
    handleControlEdges();
    tick(FIXED_DT);
    ctx.accumulator -= FIXED_DT;
    substeps += 1;
  }
  renderUpdate(rawDt);
});

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createAuroraRig(rigState), { blend: 0.4 });
  // C-05 output: night-ops grade; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "space",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get frame() { return ctx.frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
