// apps/showcase-gallery-shift/src/v2/boot.ts — Gallery Shift v2 shell.
// Night-heist stealth on createGame: authored thief movement + Rapier sensor
// overlaps (exit/lasers), LOS vision cones through the public raycast facade,
// deterministic waypoint patrols with investigate/alert escalation — all
// gameplay modules reused unchanged from the day-0 split. One union scene
// holds floor 1 (typed museum cutaway GLB) and floor 2 (primitive shell);
// switching floors toggles floor-scoped runtime nodes, so
// loading.sceneSwaps stays 0 while loading.sceneId reports the floor.
import {
  AnimationController,
  game as engineGame,
  scene,
  type AuraAnimationAssetLike,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createGame, lookManifest, type Prd09Game } from "@aura3d/game";
import direction from "../../art/direction";
import { assets } from "../../../../src/aura-assets";
import {
  FLOOR_LAYOUTS,
  LASER_ALERT_SECONDS,
  createFloorWorld,
  layoutCircles,
  layoutRects,
  type FloorLayout,
  type FloorWorld,
  type Vec2
} from "../gameplay/floor";
import { GuardAgent, GUARD_CLIPS, guardHearsNoise, type GuardFootstep } from "../gameplay/guard";
import { ThiefPlayer, THIEF_CLIPS, type NoiseEvent } from "../gameplay/thief";
import {
  ALERT_THRESHOLD,
  CAUGHT_THRESHOLD,
  SUSPICIOUS_THRESHOLD,
  advanceDetection,
  brightnessAt,
  cameraYawAt,
  sampleVision,
  worldRaycast,
  type DetectionMeterState,
  type WatcherPose
} from "../gameplay/vision";
import { createHeistAudio, type HeistAudioCue } from "../legacy/heist-audio";
import { publishGalleryEvidence } from "./evidence";
import { createGalleryCtx, type FloorRuntime, type Phase } from "./state";
import { createHeistAudioBlock } from "./audio";
import { createGalleryAnim } from "./anim";
import { buildFloorRuntime, wireGalleryFloors } from "./floors";
import { wireGallerySync } from "./sync";
import { createGalleryInput, wireGalleryTouch } from "./input";
import { wireGalleryHud } from "./hud";
import { wireGalleryUpdate } from "./update";
import { applyGalleryScenario, galleryScenarioLook, parseGalleryScenario, type GalleryScenario } from "./scenarios";
import { createGalleryRig, galleryCameraSpec } from "./scene/camera";
import { wireGalleryFx } from "./scene/fx";
import { galleryLighting } from "./scene/lighting";
import { GALLERY_BG } from "./scene/materials";
import {
  THIEF_ID,
  cameraConeNodeId,
  caseNodeId,
  exhibitNodeId,
  flashlightNodeId,
  galleryWorldNodes,
  pedestalNodeId,
  poolNodeId,
  sightlineNodeId,
  threatNodeIds
} from "./scene/world";

const ROUTE_FLAG = "A3D_QR_ROUTE_GALLERY_SHIFT";
const url = new URL(window.location.href);
const scenarioParam = url.searchParams.get("scenario");
const autorunRequested = url.searchParams.get("autorun") === "1" || scenarioParam === "autorun";
const scenario: GalleryScenario | null = parseGalleryScenario(scenarioParam) ?? (autorunRequested ? "autorun" : null);

const world = galleryWorldNodes();

const buildScene = () =>
  scene()
    .background(GALLERY_BG)
    .camera(galleryCameraSpec())
    .addMany(world.nodes)
    .addMany(galleryLighting());

const target = document.getElementById("app") ?? document.body;

const game: Prd09Game<string, string> = createGame({
  id: "showcase-gallery-shift",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    widgets: [
      { id: "floor", kind: "label", anchor: "top-left", label: "FLOOR" },
      { id: "exhibits", kind: "label", anchor: "top", label: "EXHIBITS" },
      { id: "score", kind: "label", anchor: "top-right", label: "SCORE" },
      { id: "detection", kind: "gauge", anchor: "bottom", label: "DETECTION" },
      { id: "guardState", kind: "label", anchor: "bottom-left", label: "PATROL" },
      { id: "phase", kind: "label", anchor: "bottom-right", label: "STATUS" }
    ]
  },
  touch: {
    preset: "lane-swipe",
    bindings: { stick: "moveX", tap: "lift", swipeUp: "sprint", swipeDown: "sneak", pause: "menu" }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_gallery_shift` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-gallery-shift`).
    flags: ["route_gallery_shift", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireGalleryFx(game.fx);

const reducedMotion = engineGame.accessibility
  .settings([engineGame.accessibility.reducedMotion({ enabled: matchMedia("(prefers-reduced-motion: reduce)").matches })])
  .reducedMotion;

// ---- runtime handles ---------------------------------------------------------
const nodeMap = new Map<string, AuraRuntimeNodeHandle | null>();
function handle(id: string): AuraRuntimeNodeHandle | null {
  if (!nodeMap.has(id)) nodeMap.set(id, game.app.nodes.get(id) ?? null);
  return nodeMap.get(id) ?? null;
}
const thiefHandle = () => handle(THIEF_ID);
const guardHandle = (id: string) => handle(id);

// ---- heist runtime ------------------------------------------------------------
const GUARD_EYE_HEIGHT = 1.55;
const THIEF_EYE_HEIGHT = 1.1;
const MAX_NOISE_LOG = 48;
const MAX_CUE_LOG = 48;

const ctx = createGalleryCtx(buildFloorRuntime(0));
const audioBlock = createHeistAudioBlock(ctx);
const { audio, audioCueLog, pushCue, cueReady, unlockAudio } = audioBlock;
const floors = wireGalleryFloors(ctx, { game, handle, pushCue, fx, world, thiefHandle, guardHandle, syncCharacterVisuals: () => syncCharacterVisuals() });
const { setBucketVisible, syncFloorVisuals, syncAlarmVisuals,
        restartFloor, resetMission, floorClearAdvance, layoutExit } = floors;
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);
const anim = createGalleryAnim(ctx);
const { thiefAnimation, guardAnimations, playThiefClip, playGuardClip } = anim;
const sync = wireGallerySync(ctx, { game, handle, fx, thiefHandle, guardHandle, reducedMotion });
const { syncCharacterVisuals, syncThreatFeedback, syncObjective, syncCameraCones } = sync;
const input = createGalleryInput();
const touch = wireGalleryTouch(ctx, { target, unlockAudio });
const { autorunInputs } = touch;

const hud = wireGalleryHud(ctx, { game });
const { syncHud } = hud;

// ---- evidence -----------------------------------------------------------------------

const evidence = publishGalleryEvidence({
  sceneId: () => (ctx.runtime.layout.id === 1 ? "floor-1" : "floor-2"),
  mission: () => ({
    floor: ctx.runtime.layout.id,
    phase: ctx.paused ? "paused" : ctx.phase,
    lifted: ctx.runtime.liftedIds.length,
    totalLifted: ctx.completedBeforeFloor + ctx.runtime.liftedIds.length,
    score: ctx.totalScore + ctx.runtime.floorScore,
    ghost: ctx.runtime.ghostRun,
    alarmActive: ctx.alarmActive
  }),
  thief: () => {
    const snap = ctx.runtime.thief.snapshot();
    return {
      x: snap.x,
      z: snap.z,
      gait: snap.gait,
      clip: snap.clip,
      carrying: snap.carrying,
      facingYaw: ctx.thiefFacingYaw,
      yawErrorDeg: ctx.thiefYawErrorDeg
    };
  },
  guard: () => {
    const states = ctx.runtime.guards.map((guard) => ({ id: guard.id, state: guard.state, x: guard.x, z: guard.z }));
    const order = { idle: 0, investigate: 1, alert: 2 } as const;
    const state = states.reduce<string>((worst, s) => (order[s.state as keyof typeof order] > order[worst as keyof typeof order] ? s.state : worst), "idle");
    return { state, states };
  },
  characters: () => {
    const bindings = thiefAnimation.snapshot().runtimeNodeBindings ?? [];
    return {
      thiefTracksApplied: bindings.filter((binding) => binding.appliedClipId || binding.activeClipId).length,
      thiefYawErrorDeg: ctx.thiefYawErrorDeg,
      thiefClip: ctx.thiefClipActive,
      guardClips: ctx.runtime.guards.map((guard) => ctx.guardClipActive.get(guard.id) ?? null)
    };
  },
  fx: () => ({
    conesVisible: world.coneNodeIds.filter((id) => {
      const node = handle(id);
      return Boolean(node && node.visible !== false);
    }).length,
    liveCount: game.fx.liveCount,
    backend: game.fx.backend
  }),
  detection: () => ({
    value: ctx.runtime.detection.value,
    seen: ctx.lastThreatSamples.some((sample) => sample.seesThief),
    lastSeen: ctx.runtime.lastSeen
  }),
  audio: () => ({ lastCue: audioCueLog.at(-1) ?? null, cueLog: audioCueLog.slice() }),
  run: () => ({ paused: ctx.paused, touchEngaged: ctx.touchEngaged, replayActive: ctx.autorunActive }),
  appliedLook: () => ({ ...lookManifest(game.lookSource()), ...galleryScenarioLook(scenario) }),
  rig: () => ({ id: "gallery-shift.chase", fov: 52 }),
  scenario: () => scenario,
  render: () => ({ frame: ctx.frameCount, firstFrameAt: ctx.firstFrameAt })
});


// ---- scenarios ----------------------------------------------------------------------
const hooks = {
  advanceToFloor2() {
    ctx.floorIndex = 1;
    ctx.runtime = buildFloorRuntime(1);
    ctx.lastCameraSamples = [];
    ctx.phase = "playing";
    syncFloorVisuals();
  },
  stageAlert() {
    // Real path: teleport puts the thief inside guard-1's live patrol lane —
    // insideCone + unobstructed LOS then fill the meter for a genuine alert.
    const guard = ctx.runtime.guards[0]!;
    ctx.runtime.thief.teleport(guard.x, guard.z + 4.2);
  },
  startAutorun() {
    ctx.autorunActive = true;
    ctx.autorunPhase = "seek";
  }
};

// ---- rig ----------------------------------------------------------------------------
const rigState = {
  get thiefX() { return ctx.runtime.thief.snapshot().x; },
  get thiefZ() { return ctx.runtime.thief.snapshot().z; },
  get facingYaw() { return ctx.thiefFacingYaw; },
  get moving() { return ctx.runtime.thief.snapshot().moving; }
};
const rig = createGalleryRig(rigState, 0);

// ---- frame loop ----------------------------------------------------------------------
const update = wireGalleryUpdate(ctx, {
  game, handle, input, fx, pushCue, cueReady, autorunInputs,
  floors, sync, anim, syncHud
});
const { consumeFootsteps, updateGameplay } = update;
game.app.onFrame(({ dt }) => updateGameplay(dt));

// ---- pause / visibility ---------------------------------------------------------------
game.session.on("pause", () => { ctx.paused = true; });
game.session.on("resume", () => { ctx.paused = false; });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.session.pause();
  } else {
    game.session.resume();
  }
});

// ---- boot ----------------------------------------------------------------------------
syncFloorVisuals();
syncHud();
if (scenario) applyGalleryScenario(scenario, hooks);
if (autorunRequested && !ctx.autorunActive) hooks.startAutorun();

game.start();
void game.ready().then(() => {
  // Bind the animation controllers once the runtime nodes exist.
  const thiefNode = thiefHandle();
  if (thiefNode && !ctx.animationBound) {
    ctx.animationBound = true;
    thiefAnimation.bindRuntimeNode(thiefNode, { id: "thief-ctx.runtime-animation", defaultClipId: THIEF_CLIPS.idle });
    const guard2 = guardHandle("guard-2");
    const controller = guardAnimations[1];
    if (guard2 && controller) {
      controller.bindRuntimeNode(guard2, { id: "guard-2-ctx.runtime-animation", defaultClipId: GUARD_CLIPS.idle });
    }
  }
  game.app.camera?.use?.(rig as never, { blend: 0.12 });
  game.app.setOutput?.({ preset: "cinematic-film", exposure: Math.pow(2, direction.lighting.exposureEV) });
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return ctx.frameCount; },
    firstFrameAt: ctx.firstFrameAt,
    sessionStartedAt: performance.now()
  };
});
void evidence;
