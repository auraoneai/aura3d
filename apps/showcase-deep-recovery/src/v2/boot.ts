// apps/showcase-deep-recovery/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.14 "salvage dive from turquoise shallows into a dark wreck basin":
// the authored 6-DOF hydrodynamic sub model drives a chase rig past typed
// wreck/buoy/crate GLBs; sonar ping/tether/grapple run the legacy mechanics
// verbatim. One scene — mission progress re-poses runtime nodes, never
// swaps scenes (loading.sceneSwaps === 0). Gameplay modules (sub/oxygen/
// salvage/sonar/reef) are unchanged imports; audio plays through the legacy
// cue controller until C-25 lands.
import { game as engineGame, scene, type GameInputController, type AuraCameraPose } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { assets } from "../../../../src/aura-assets";
import { getDepthZone, BUOY_STATION, WRECK_OBSTACLES, type Vec3 } from "../gameplay/reef";
import { DEFAULT_SUB_CONFIG, initialSubmarineState, updateSubmarine, type SubmarineState } from "../gameplay/sub";
import {
  applyCollisionImpact,
  initialOxygenState,
  patchBreach,
  refuelAtSurface,
  updateOxygen,
  type OxygenState
} from "../gameplay/oxygen";
import {
  initialSonarState,
  triggerPing,
  updateSonar,
  type SonarContact,
  type SonarState,
  type SonarTarget
} from "../gameplay/sonar";
import {
  bankSecuredCrates,
  CONTRACTS,
  GRAPPLE_RANGE,
  initialCrateSpawns,
  releaseTethers,
  tryGrappleCrates,
  updateTetherPhysics,
  type SalvageCrate
} from "../gameplay/salvage";
import { DeepAudioController } from "../legacy/deep-audio";
import direction from "../../art/direction";
import { deepWorldNodes, SILT_MOTES, SNOW_COUNT, VENT_COUNT, type DeepWorld } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createDeepRig, fallbackCameraNode } from "./scene/camera";
import { wireDeepFx } from "./scene/fx";
import { WATER_BG } from "./scene/materials";
import { publishDeepEvidence, type DeepRunSnapshot } from "./evidence";
import { applyDeepScenario } from "./scenarios";
import { createDeepCtx } from "./state";
import { createDeepAudioBlock } from "./audio";
import { createDeepInput, wireDeepTouch, touchInputs } from "./input";
import { wireDeepActions } from "./actions";
import { wireDeepSync } from "./sync";
import { wireDeepHud } from "./hud";
import { wireDeepUpdate } from "./update";

const ROUTE_FLAG = "A3D_QR_ROUTE_DEEP_RECOVERY" as const;
const GRAPPLE_LATCH_RANGE = GRAPPLE_RANGE * 0.94;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";

// ------------------------------------------------------------ sim state -----

const ctx = createDeepCtx(autopilotRequested);

const sceneSwaps = 0;
const bootedAtMs = performance.now();

const world: DeepWorld = deepWorldNodes();

function buildScene() {
  return scene()
    .background(WATER_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ------------------------------------------------------------------ audio ---

const audioBlock = createDeepAudioBlock();
const { audio, audioCueLog, pushCue, unlockAudio } = audioBlock;

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-deep-recovery",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.16,
    widgets: [
      { id: "objective", kind: "label", anchor: "top", label: "OBJECTIVE" },
      { id: "depth", kind: "gauge", anchor: "top-left", label: "DEPTH" },
      { id: "oxygen", kind: "gauge", anchor: "top-right", label: "O2" },
      { id: "hull", kind: "gauge", anchor: "left", label: "HULL" },
      { id: "salvage", kind: "score", anchor: "bottom-left", label: "SALVAGE" },
      { id: "sonar", kind: "label", anchor: "bottom-right", label: "SONAR" },
      { id: "message", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "twin-stick",
    bindings: {
      drive: "stick-left",
      heave: "stick-right",
      grapple: "btn-a",
      sonar: "btn-b",
      repair: "btn-x",
      sprint: "btn-y",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      "sonar-ping": { asset: "deepRecoverySonarPingSfx" },
      "sonar-return": { asset: "deepRecoverySonarReturnSfx" },
      "hull-creak": { asset: "deepRecoveryHullCreakSfx" },
      "breach-alarm": { asset: "deepRecoveryBreachAlarmSfx" },
      "patch-seal": { asset: "deepRecoveryPatchSealSfx" },
      "grapple-latch": { asset: "deepRecoveryGrappleLatchSfx" },
      "crate-bank": { asset: "deepRecoveryCrateBankSfx" },
      "oxygen-warn": { asset: "deepRecoveryOxygenWarnSfx" },
      "blackout": { asset: "deepRecoveryBlackoutSfx" },
      "surface-break": { asset: "deepRecoverySurfaceBreakSfx" },
      "ambient-deep": { asset: "deepRecoveryAmbientDeepSfx" }
    }
  },
  juice: {
    "breach": { hitStopMs: 50, trauma: 0.3 },
    "grapple": { trauma: 0.1 },
    "bank": { trauma: 0.14 },
    "impact": { trauma: 0.2 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_deep_recovery` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-deep-recovery`).
    flags: ["route_deep_recovery", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireDeepFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- input ---------

const input = createDeepInput();

// ------------------------------------------------------------- actions -------

const sync = wireDeepSync(ctx, { handle, world, fx, audio, reducedMotion });
const { syncVisualNodes } = sync;

const actions = wireDeepActions(ctx, { game, audio, pushCue, syncHud: () => syncHud(), syncVisualNodes, fx, touchInputs });
const { sonarTargets, handlePing, handleGrappleToggle, atBuoyServiceZone,
  handleRepair, togglePause, resetGame, autopilotControls } = actions;
wireDeepTouch({ target, game, handlePing, handleGrappleToggle });

// ------------------------------------------------------------ sim tick -------

// ------------------------------------------------------------ visuals --------


// ---------------------------------------------------------------- HUD --------

const hud = wireDeepHud(ctx, { audio, game });
const { missionStage, syncHud } = hud;
const update = wireDeepUpdate(ctx, {
  game, input, touchInputs, autopilotControls, audio, pushCue, fx, syncVisualNodes, syncHud
});
const { updateGameplay } = update;

// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = {
  ...lookManifest(game.lookSource()),
  id: direction.id,
  genre: direction.genre,
  rig: "deep-recovery.chase",
  fov: 62,
  background: WATER_BG,
  palette: direction.palette,
  signatureEffect: direction.signatureEffect
};

const rigState = { x: ctx.subState.x, y: ctx.subState.y, z: ctx.subState.z, yaw: ctx.subState.yaw };

const runSnapshot = (): DeepRunSnapshot => {
  const tethered = ctx.crates.filter((c) => c.tethered);
  return {
    phase: ctx.phase,
    missionStage: missionStage(),
    sub: {
      x: ctx.subState.x,
      y: ctx.subState.y,
      z: ctx.subState.z,
      yaw: ctx.subState.yaw,
      speed: ctx.subState.speed,
      throttle: ctx.subState.throttle,
      depth: Math.max(0, -ctx.subState.y),
      sprint: ctx.subState.sprint
    },
    oxygen: {
      oxygen: ctx.oxygenState.oxygen,
      hull: ctx.oxygenState.hull,
      breached: ctx.oxygenState.breached,
      warningActive: ctx.oxygenState.warningActive,
      blackout: ctx.oxygenState.blackout,
      breachCount: ctx.breachCount,
      repairCount: ctx.repairCount
    },
    salvage: {
      grappled: ctx.grappleLatchCount,
      tethered: tethered.length,
      banked: ctx.bankedCountTotal,
      bankedValue: ctx.bankedTotal,
      cratesTotal: ctx.crates.length,
      towMassKg: Math.round(tethered.reduce((sum, c) => sum + c.mass, 0)),
      standardBanked: ctx.standardBanked,
      heavyBanked: ctx.heavyBanked
    },
    sonar: {
      pings: ctx.sonarState.pingCount,
      returns: ctx.sonarState.returnCount,
      liveContacts: ctx.sonarState.contacts.length,
      cooldown: ctx.sonarState.pingCooldownRemaining
    },
    contracts: {
      active: ctx.phase === "won" ? 3 : ctx.heavyBanked ? 2 : ctx.standardBanked || ctx.repairCount > 0 ? 1 : 0,
      title: CONTRACTS[Math.min(2, ctx.standardBanked || ctx.repairCount > 0 ? (ctx.heavyBanked ? 2 : 1) : 0)]!.title,
      quotaValue: CONTRACTS[Math.min(2, ctx.standardBanked || ctx.repairCount > 0 ? (ctx.heavyBanked ? 2 : 1) : 0)]!.quotaValue,
      complete: ctx.phase === "won"
    },
    sensorEventCount: ctx.sensorEventCount,
    grappleLineLive: tethered.length > 0
  };
};

publishDeepEvidence({
  game,
  snapshot: runSnapshot,
  appliedLook: () => appliedLook,
  audioCueLog: () => audioCueLog,
  bootedAtMs: () => bootedAtMs,
  frameCount: () => ctx.frame
});

const scenarioParam = routeParams.get("scenario");
if (scenarioParam) {
  applyDeepScenario(scenarioParam, {
    poseSub: (x, y, z, yaw) => {
      ctx.subState = { ...ctx.subState, x, y, z, yaw, vx: 0, vy: 0, vz: 0 };
      rigState.x = x;
      rigState.y = y;
      rigState.z = z;
      rigState.yaw = yaw;
      syncVisualNodes(0);
    },
    setOxygen: (v) => { ctx.oxygenState = { ...ctx.oxygenState, oxygen: v }; },
    setHull: (v) => { ctx.oxygenState = { ...ctx.oxygenState, hull: v }; },
    firePing: () => handlePing(),
    reset: () => resetGame()
  });
}

// ------------------------------------------------------------------- boot ----

game.app.onFrame?.(({ dt: rawDt }) => {
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  const dt = Math.min(0.05, Math.max(0.001, frameDt));
  input.update(dt);
  if (input.pressed("ping")) handlePing();
  if (input.pressed("grapple")) handleGrappleToggle();
  if (input.pressed("repair")) handleRepair();
  if (input.pressed("pause")) togglePause();
  if (input.pressed("reset")) resetGame();
  rigState.x = ctx.subState.x;
  rigState.y = ctx.subState.y;
  rigState.z = ctx.subState.z;
  rigState.yaw = ctx.subState.yaw;
  updateGameplay(dt);
});

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createDeepRig(rigState), { blend: 0.4 });
  // C-05 output: underwater grade; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "underwater",  exposure: Math.pow(2, direction.lighting.exposureEV) });
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
