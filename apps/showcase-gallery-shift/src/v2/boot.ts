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
import { postPresets } from "@aura3d/engine/contracts";
import { createGame, type Game } from "@aura3d/game";
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

const game: Game = createGame({
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
  qualityRebuild: { flags: [ROUTE_FLAG] }
});
void postPresets["cinematic-film"];

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
type Phase = "playing" | "caught" | "won";

interface FloorRuntime {
  readonly layout: FloorLayout;
  readonly world: FloorWorld;
  readonly thief: ThiefPlayer;
  readonly guards: readonly GuardAgent[];
  liftedIds: string[];
  detection: DetectionMeterState;
  ghostRun: boolean;
  timeInFloor: number;
  laserAlertRemaining: number;
  laserAlertPoint: Vec2 | null;
  floorScore: number;
  lastSeen: Vec2 | null;
}

let floorIndex = 0;
let runtime: FloorRuntime;
let phase: Phase = "playing";
let paused = false;
let totalScore = 0;
let completedBeforeFloor = 0;
let alarmActive = false;
let alarmGraceRemaining = 0;
let sensorEventCount = 0;
// Facing blend (the wave-4 P0): yaw eases toward atan2(moveX, moveZ) so the
// typed rig leads with its face instead of sliding sideways.
let thiefFacingYaw = 0;
let thiefYawErrorDeg = 0;
let footstepEvents = 0;
let losRayCountTotal = 0;
let occlusionCountTotal = 0;
const noiseEvents: NoiseEvent[] = [];
const visionCounters = { losRayCount: 0, occlusionCount: 0 };
let lastCameraSamples: readonly { readonly id: string; readonly yaw: number; readonly seesThief: boolean; readonly occluded: boolean }[] = [];
let lastThreatSamples: readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly seesThief: boolean }[] = [];
let touchEngaged = false;
let autorunActive = false;
let autorunClock = 0;
let autorunPhase: "seek" | "orbit" = "seek";

const GUARD_EYE_HEIGHT = 1.55;
const THIEF_EYE_HEIGHT = 1.1;
const MAX_NOISE_LOG = 48;
const MAX_CUE_LOG = 48;

function buildFloorRuntime(index: number): FloorRuntime {
  const layout = FLOOR_LAYOUTS[index] ?? FLOOR_LAYOUTS[0]!;
  const floorWorld = createFloorWorld(layout);
  const thief = new ThiefPlayer(layout, layoutRects(layout), layoutCircles(layout), floorWorld.thiefBody, layout.thiefSpawn);
  const guards = layout.guards.map((spawn) => new GuardAgent(spawn));
  return {
    layout,
    world: floorWorld,
    thief,
    guards,
    liftedIds: [],
    detection: { value: 0, secondsSinceSeen: 0 },
    ghostRun: true,
    timeInFloor: 0,
    laserAlertRemaining: 0,
    laserAlertPoint: null,
    floorScore: 0,
    lastSeen: null
  };
}

runtime = buildFloorRuntime(0);

// ---- animation controllers ----------------------------------------------------
const thiefAnimation = new AnimationController<string>({
  id: "thief-animation",
  clipRegistry: assets.showcaseRunnerGirl as unknown as AuraAnimationAssetLike,
  requiredClips: [THIEF_CLIPS.idle, THIEF_CLIPS.walk, THIEF_CLIPS.sneak, THIEF_CLIPS.sprint, THIEF_CLIPS.lift, THIEF_CLIPS.carry],
  suppressRootMotion: true
});
const guardAnimations: Array<AnimationController<string> | null> = [
  null,
  new AnimationController<string>({
    id: "guard-2-animation",
    clipRegistry: assets.showcaseExpressiveRobot as unknown as AuraAnimationAssetLike,
    requiredClips: [GUARD_CLIPS.idle, GUARD_CLIPS.walk, GUARD_CLIPS.run],
    suppressRootMotion: true
  })
];
let thiefClipActive: string | null = null;
const guardClipActive = new Map<string, string>();
let animationBound = false;

function playThiefClip(clip: string): void {
  if (thiefClipActive === clip) return;
  thiefClipActive = clip;
  try {
    thiefAnimation.crossFade(clip, 0.12, { loop: "loop" });
  } catch {
    /* diagnostics surface binding issues; never break the frame loop */
  }
}
function playGuardClip(guardId: string, controllerIndex: number, clip: string): void {
  const controller = guardAnimations[controllerIndex];
  if (!controller || guardClipActive.get(guardId) === clip) return;
  guardClipActive.set(guardId, clip);
  try {
    controller.crossFade(clip, 0.12, { loop: "loop" });
  } catch {
    /* as above */
  }
}

// ---- audio ---------------------------------------------------------------------
const audio = createHeistAudio();
const audioCueLog: string[] = [];
const lastCueFrame = new Map<string, number>();
function pushCue(cue: HeistAudioCue): void {
  void audio.cue(cue).catch(() => undefined);
  audioCueLog.push(cue);
  if (audioCueLog.length > MAX_CUE_LOG) audioCueLog.shift();
}
function cueReady(name: string, gapFrames: number): boolean {
  const last = lastCueFrame.get(name) ?? -999;
  if (frameCount - last < gapFrames) return false;
  lastCueFrame.set(name, frameCount);
  return true;
}
const unlockAudio = () => {
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
  void audio.unlock().then(() => audio.startAmbient()).catch(() => undefined);
};
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// ---- floor transitions -----------------------------------------------------------
function setBucketVisible(ids: readonly string[], visible: boolean): void {
  for (const id of ids) handle(id)?.setVisible(visible);
}

function syncFloorVisuals(): void {
  const layout = runtime.layout;
  setBucketVisible(world.floor1NodeIds, layout.id === 1);
  setBucketVisible(world.floor2NodeIds, layout.id === 2);
  layout.pedestals.forEach((pedestal, slot) => {
    handle(pedestalNodeId(slot))?.setPosition(pedestal.x, 0, pedestal.z);
    for (const variant of ["A", "B", "C"] as const) {
      const node = handle(exhibitNodeId(slot, variant));
      if (!node) continue;
      const matches = variant === pedestal.exhibit.slice(-1).toUpperCase() && !runtime.liftedIds.includes(pedestal.id);
      node.setVisible(matches);
      node.setPosition(pedestal.x, 1.08, pedestal.z);
    }
  });
  thiefHandle()?.setPosition(layout.thiefSpawn.x, 0, layout.thiefSpawn.z);
  for (const guard of layout.guards) {
    guardHandle(guard.id)?.setPosition(guard.x, 0, guard.z);
  }
  syncCharacterVisuals();
  syncAlarmVisuals();
}

function syncAlarmVisuals(): void {
  handle("alarm-beacon")?.setVisible(alarmActive);
}

function restartFloor(): void {
  runtime = buildFloorRuntime(floorIndex);
  alarmActive = false;
  alarmGraceRemaining = 0;
  lastCameraSamples = [];
  phase = "playing";
  syncFloorVisuals();
  pushCue("floor-clear");
}

function resetMission(): void {
  floorIndex = 0;
  completedBeforeFloor = 0;
  totalScore = 0;
  alarmActive = false;
  alarmGraceRemaining = 0;
  runtime = buildFloorRuntime(0);
  lastCameraSamples = [];
  phase = "playing";
  paused = false;
  syncFloorVisuals();
}

function floorClearAdvance(): void {
  const cleared = runtime;
  const timeBonus = Math.max(0, Math.round(1500 - 6 * cleared.timeInFloor));
  const ghostBonus = cleared.ghostRun ? 1500 : 0;
  totalScore += cleared.floorScore + timeBonus + ghostBonus;
  if (floorIndex >= FLOOR_LAYOUTS.length - 1) {
    phase = "won";
    pushCue("exit-win");
    fx.floorClear([layoutExit().x, 0.4, layoutExit().z]);
  } else {
    pushCue("floor-clear");
    completedBeforeFloor += cleared.liftedIds.length;
    floorIndex += 1;
    runtime = buildFloorRuntime(floorIndex);
    lastCameraSamples = [];
    phase = "playing";
    syncFloorVisuals();
  }
}

function layoutExit(): Vec2 {
  return runtime.layout.exit;
}

// ---- presentation sync -----------------------------------------------------------
const FACING_HALFLIFE = 0.08;

function syncCharacterVisuals(): void {
  const snap = runtime.thief.snapshot();
  // Facing-yaw blend toward atan2(moveX, moveZ) — the wave-4 P0.
  const moveMagnitude = Math.hypot(snap.moveX, snap.moveZ);
  if (moveMagnitude > 0.05) {
    const targetYaw = Math.atan2(snap.moveX, snap.moveZ);
    const shortest = ((targetYaw - thiefFacingYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const blend = 1 - Math.exp(-Math.LN2 * (1 / 60) / FACING_HALFLIFE);
    thiefFacingYaw += shortest * blend;
    thiefYawErrorDeg = Math.abs(shortest) * (180 / Math.PI);
  } else {
    thiefYawErrorDeg = 0;
  }
  thiefHandle()?.setPosition(snap.x, 0, snap.z);
  thiefHandle()?.setRotation(0, thiefFacingYaw, 0);
  handle("infiltrator-identity-detail")?.setPosition(snap.x, 0, snap.z).setRotation(0, thiefFacingYaw, 0);
  handle("infiltrator-visor-signal")
    ?.setPosition(snap.x + Math.sin(thiefFacingYaw) * 0.19, 1.99, snap.z + Math.cos(thiefFacingYaw) * 0.19)
    .setRotation(0, thiefFacingYaw, 0);
  handle("thief-focus")?.setPosition(snap.x, 0.07, snap.z);
  handle("thief-contact-shadow")?.setPosition(snap.x, 0.018, snap.z);
  handle("v2-thief-practical")?.setPosition(snap.x, 1.25, snap.z);
  for (const guard of runtime.guards) {
    const h = guardHandle(guard.id);
    if (!h) continue;
    h.setPosition(guard.x, 0, guard.z);
    h.setRotation(0, guard.yaw + Math.PI, 0);
    handle(`${guard.id}-sentry-detail`)?.setPosition(guard.x, 1.1, guard.z).setRotation(0, guard.yaw + Math.PI, 0);
    handle(`${guard.id}-contact-shadow`)?.setPosition(guard.x, 0.018, guard.z);
    const ids = threatNodeIds(guard.id);
    handle(ids.ring)?.setPosition(guard.x, 0.11, guard.z);
    // Flashlight marker + its practical light ride ahead of the facing, with
    // the flashlight sway gated by reduced-motion.
    const sway = reducedMotion ? 0 : Math.sin(frameCount / 34 + (guard.id === "guard-1" ? 0 : 2)) * 0.18;
    const fx_ = guard.x + Math.sin(guard.yaw + sway) * 1.4;
    const fz = guard.z + Math.cos(guard.yaw + sway) * 1.4;
    handle(flashlightNodeId(guard.id))?.setPosition(fx_, 1.5, fz).setRotation(0, guard.yaw + sway, 0);
    handle(`v2-${guard.id}-flashlight`)?.setPosition(fx_, 1.8, fz);
    const preview = handle(sightlineNodeId(guard.id));
    preview?.setPosition(guard.x, 0.062, guard.z);
    preview?.setRotation(0, guard.yaw, 0);
    preview?.setScale([1.58, 1, 1]);
  }
}

function syncThreatFeedback(): void {
  const thief = runtime.thief.snapshot();
  const primarySeeingGuard = lastThreatSamples
    .filter((sample) => sample.seesThief)
    .reduce<(typeof lastThreatSamples)[number] | undefined>((nearest, sample) => {
      if (!nearest) return sample;
      return Math.hypot(sample.x - thief.x, sample.z - thief.z) < Math.hypot(nearest.x - thief.x, nearest.z - thief.z) ? sample : nearest;
    }, undefined);
  for (const sample of lastThreatSamples) {
    const ids = threatNodeIds(sample.id);
    const primarySighting = sample.seesThief && sample.id === primarySeeingGuard?.id;
    handle(ids.wedge)?.setVisible(primarySighting);
    handle(ids.beam)?.setVisible(primarySighting);
    handle(ids.line)?.setVisible(primarySighting);
    handle(ids.highlight)?.setVisible(primarySighting);
    handle(ids.source)?.setVisible(primarySighting);
    if (primarySighting) {
      const dx = thief.x - sample.x;
      const dz = thief.z - sample.z;
      const distance = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const stretch = Math.min(1, Math.max(0.18, (distance - 0.42) / 4.6));
      handle(ids.wedge)?.setPosition(sample.x, 0.075, sample.z).setRotation(0, yaw, 0).setScale([1.5, 1, stretch]);
      handle(ids.beam)?.setPosition(sample.x, 0.19, sample.z).setRotation(0, yaw, 0).setScale([1.58, 1, stretch]);
      handle(ids.line)?.setPosition(sample.x, 0.08, sample.z).setRotation(0, yaw, 0).setScale([1.38, 1, stretch]);
      handle(ids.source)?.setPosition(sample.x, 0.17, sample.z).setScale([0.78, 0.78, 0.09]);
      handle(ids.highlight)?.setPosition(thief.x, 0.07, thief.z).setScale([1.18, 1.18, 0.09]);
    }
    // The passive cone hides while that guard holds a true sighting (the
    // alert wedge replaces it) — same rule as the legacy route.
    handle(sightlineNodeId(sample.id))?.setVisible(runtime.layout.id === 1 && !sample.seesThief);
  }
}

function syncObjective(): void {
  const thief = runtime.thief.snapshot();
  const unlifted = runtime.layout.pedestals.filter((pedestal) => !runtime.liftedIds.includes(pedestal.id));
  const objective = unlifted.length > 0
    ? unlifted.reduce((best, pedestal) =>
        Math.hypot(pedestal.x - thief.x, pedestal.z - thief.z) < Math.hypot(best.x - thief.x, best.z - thief.z) ? pedestal : best)
    : runtime.layout.exit;
  handle("live-objective-ring")?.setPosition(objective.x, 0.13, objective.z);
  handle("v2-objective-practical")?.setPosition(objective.x, 1.55, objective.z);
  const exiting = unlifted.length === 0;
  handle("live-lift-label")?.setVisible(!exiting);
  handle("live-exit-label")?.setVisible(exiting);
}

function syncCameraCones(): void {
  for (const cam of runtime.layout.cameras) {
    const yaw = cameraYawAt(cam, runtime.timeInFloor);
    handle(cameraConeNodeId(cam.id))?.setRotation(0, yaw, 0);
  }
}

// ---- input ------------------------------------------------------------------------
const input = engineGame.input({
  actions: {
    moveUp: ["KeyW", "ArrowUp"],
    moveDown: ["KeyS", "ArrowDown"],
    moveLeft: ["KeyA", "ArrowLeft"],
    moveRight: ["KeyD", "ArrowRight"],
    sneak: ["ShiftLeft", "ShiftRight"],
    sprint: ["KeyX"],
    lift: ["KeyE"],
    pause: ["KeyP", "Escape"],
    restart: ["KeyR"]
  },
  axes: {
    moveX: { negative: "moveLeft", positive: "moveRight" },
    moveZ: { negative: "moveUp", positive: "moveDown" }
  },
  bufferMs: 80
});

// Touch zones on the canvas: left half = move stick (drag direction), right
// half hold = lift, right-half quick tap toggles sneak, right-half flick = sprint
// while held. Same contract the lane-swipe preset promises.
let touchMoveX = 0;
let touchMoveZ = 0;
let touchLiftHeld = false;
let touchSprint = false;
let touchSneak = false;
let activePointer: { id: number; startX: number; startY: number; x: number; y: number; lift: boolean; moved: boolean } | null = null;

const canvasEl = (): HTMLElement | null => target.querySelector("canvas");
function wireTouch() {
  const canvas = canvasEl();
  if (!canvas) return;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    touchEngaged = true;
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    activePointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, lift: nx > 0.5, moved: false };
    if (nx > 0.5) touchLiftHeld = true;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!activePointer || event.pointerId !== activePointer.id) return;
    const dx = event.clientX - activePointer.startX;
    const dy = event.clientY - activePointer.startY;
    activePointer.x = event.clientX;
    activePointer.y = event.clientY;
    if (Math.hypot(dx, dy) > 12) activePointer.moved = true;
    const rect = canvas.getBoundingClientRect();
    const nx = (activePointer.startX - rect.left) / Math.max(1, rect.width);
    if (nx <= 0.5) {
      const mag = Math.hypot(dx, dy);
      if (mag > 18) {
        touchMoveX = Math.max(-1, Math.min(1, dx / 64));
        touchMoveZ = Math.max(-1, Math.min(1, dy / 64));
      }
    } else if (dx > 56) {
      touchSprint = true;
    }
  });
  const release = (event: PointerEvent) => {
    if (!activePointer || event.pointerId !== activePointer.id) return;
    const wasLift = activePointer.lift;
    const moved = activePointer.moved;
    activePointer = null;
    touchMoveX = 0;
    touchMoveZ = 0;
    touchSprint = false;
    if (wasLift) {
      touchLiftHeld = false;
      if (!moved) touchSneak = !touchSneak;
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}
wireTouch();

// ---- autorun ----------------------------------------------------------------------
// Scripted inputs through the same ThiefPlayer.update path: seek phase sprints
// toward guard-1's live position until a real alert lands (filling detection
// through the real LOS chain), then orbit phase sneak-walks around the foyer so
// the meter drains while the rig keeps proving facing + tracks.
function autorunInputs(): { moveX: number; moveZ: number; gait: "walk" | "sneak" | "sprint"; liftHeld: boolean } {
  autorunClock += 1 / 60;
  const thief = runtime.thief.snapshot();
  if (autorunPhase === "seek") {
    const guard = runtime.guards[0]!;
    const dx = guard.x - thief.x;
    const dz = guard.z - thief.z;
    const mag = Math.hypot(dx, dz) || 1;
    if (runtime.guards.some((candidate) => candidate.state === "alert")) autorunPhase = "orbit";
    return { moveX: dx / mag, moveZ: dz / mag, gait: "sprint", liftHeld: false };
  }
  // Orbit the foyer lane: keeps the rig moving silently (sneak) so the meter
  // drains and the round never reaches caught before the shots are taken.
  const t = autorunClock * 0.9;
  const cx = Math.cos(t) * 2.4;
  const cz = 4.55 + Math.sin(t) * 0.8;
  const dx = cx - thief.x;
  const dz = cz - thief.z;
  const mag = Math.hypot(dx, dz) || 1;
  return { moveX: dx / mag, moveZ: dz / mag, gait: "sneak", liftHeld: false };
}

// ---- HUD ---------------------------------------------------------------------------
let hudCache = "";
function syncHud(): void {
  const snap = runtime.thief.snapshot();
  const guardState = runtime.guards.reduce<string>(
    (worst, guard) => {
      const order = { idle: 0, investigate: 1, alert: 2 } as const;
      return order[guard.state] > order[worst as keyof typeof order] ? guard.state : worst;
    },
    "idle"
  );
  const key = [
    runtime.layout.id, runtime.liftedIds.length, completedBeforeFloor, totalScore + runtime.floorScore,
    runtime.ghostRun, snap.gait, alarmActive, phase, paused, guardState,
    Math.round(runtime.detection.value * 100), snap.liftingPedestalId ?? "", Math.round(snap.liftProgress * 100)
  ].join("|");
  if (key === hudCache) return;
  hudCache = key;
  const totalLifted = completedBeforeFloor + runtime.liftedIds.length;
  game.hud.set("floor", `FLOOR ${runtime.layout.id} — ${runtime.layout.name.toUpperCase()}`);
  game.hud.set("exhibits", `EXHIBITS ${totalLifted} OF 3`);
  game.hud.set("score", `SCORE ${totalScore + runtime.floorScore}`);
  game.hud.set("detection", Math.min(1, runtime.detection.value));
  game.hud.set("guardState", `PATROL ${guardState.toUpperCase()}${snap.gait === "sneak" ? " · SNEAK" : ""}`);
  game.hud.set(
    "phase",
    paused
      ? "PAUSED — P TO RESUME"
      : phase === "caught"
        ? "CAUGHT — R TO RESTART"
        : phase === "won"
          ? "HEIST COMPLETE — R FOR ANOTHER RUN"
          : runtime.laserAlertRemaining > 0
            ? "LASER TRIP — FLOOR-WIDE ALERT"
            : runtime.liftedIds.length >= runtime.layout.pedestals.length
              ? alarmActive
                ? "ALARM RUN — REACH THE EXIT"
                : "FLOOR CLEAR — REACH THE EXIT"
              : snap.liftingPedestalId
                ? `LIFTING ${snap.liftingPedestalId.toUpperCase()}`
                : `LIFT ${totalLifted + 1} OF 3 — AVOID THE CONES`
  );
}

// ---- evidence -----------------------------------------------------------------------
let frameCount = 0;
let firstFrameAt: number | null = null;

const evidence = publishGalleryEvidence({
  sceneId: () => (runtime.layout.id === 1 ? "floor-1" : "floor-2"),
  mission: () => ({
    floor: runtime.layout.id,
    phase: paused ? "paused" : phase,
    lifted: runtime.liftedIds.length,
    totalLifted: completedBeforeFloor + runtime.liftedIds.length,
    score: totalScore + runtime.floorScore,
    ghost: runtime.ghostRun,
    alarmActive
  }),
  thief: () => {
    const snap = runtime.thief.snapshot();
    return {
      x: snap.x,
      z: snap.z,
      gait: snap.gait,
      clip: snap.clip,
      carrying: snap.carrying,
      facingYaw: thiefFacingYaw,
      yawErrorDeg: thiefYawErrorDeg
    };
  },
  guard: () => {
    const states = runtime.guards.map((guard) => ({ id: guard.id, state: guard.state, x: guard.x, z: guard.z }));
    const order = { idle: 0, investigate: 1, alert: 2 } as const;
    const state = states.reduce<string>((worst, s) => (order[s.state as keyof typeof order] > order[worst as keyof typeof order] ? s.state : worst), "idle");
    return { state, states };
  },
  characters: () => {
    const bindings = thiefAnimation.snapshot().runtimeNodeBindings ?? [];
    return {
      thiefTracksApplied: bindings.filter((binding) => binding.appliedClipId || binding.activeClipId).length,
      thiefYawErrorDeg,
      thiefClip: thiefClipActive,
      guardClips: runtime.guards.map((guard) => guardClipActive.get(guard.id) ?? null)
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
    value: runtime.detection.value,
    seen: lastThreatSamples.some((sample) => sample.seesThief),
    lastSeen: runtime.lastSeen
  }),
  audio: () => ({ lastCue: audioCueLog.at(-1) ?? null, cueLog: audioCueLog.slice() }),
  run: () => ({ paused, touchEngaged, replayActive: autorunActive }),
  appliedLook: () => galleryScenarioLook(scenario),
  rig: () => ({ id: "gallery-shift.chase", fov: 52 }),
  scenario: () => scenario,
  render: () => ({ frame: frameCount, firstFrameAt })
});


// ---- scenarios ----------------------------------------------------------------------
const hooks = {
  advanceToFloor2() {
    floorIndex = 1;
    runtime = buildFloorRuntime(1);
    lastCameraSamples = [];
    phase = "playing";
    syncFloorVisuals();
  },
  stageAlert() {
    // Real path: teleport puts the thief inside guard-1's live patrol lane —
    // insideCone + unobstructed LOS then fill the meter for a genuine alert.
    const guard = runtime.guards[0]!;
    runtime.thief.teleport(guard.x, guard.z + 4.2);
  },
  startAutorun() {
    autorunActive = true;
    autorunPhase = "seek";
  }
};

// ---- rig ----------------------------------------------------------------------------
const rigState = {
  get thiefX() { return runtime.thief.snapshot().x; },
  get thiefZ() { return runtime.thief.snapshot().z; },
  get facingYaw() { return thiefFacingYaw; },
  get moving() { return runtime.thief.snapshot().moving; }
};
const rig = createGalleryRig(rigState, 0);

// ---- frame loop ----------------------------------------------------------------------
function consumeFootsteps(footsteps: readonly GuardFootstep[]): void {
  for (const step of footsteps) {
    footstepEvents += 1;
    if (cueReady(`guard-step-${step.id}`, 14)) {
      pushCue("walk-step");
      fx.footDust([step.x, 0.05, step.z]);
    }
  }
}

game.app.onFrame(({ dt }) => {
  const stepDt = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  const dtFixed = 1 / 60;
  frameCount += 1;
  if (firstFrameAt === null) firstFrameAt = performance.now();
  input.update(stepDt);

  if (input.pressed("pause") && phase === "playing") {
    game.session.paused ? game.session.resume() : game.session.pause();
    return;
  }
  if (paused) {
    syncHud();
    return;
  }
  if (input.pressed("restart")) {
    phase === "won" ? resetMission() : restartFloor();
    syncHud();
    return;
  }
  if (phase !== "playing") {
    syncHud();
    return;
  }

  runtime.timeInFloor += dtFixed;

  // Thief input: keyboard axes, touch stick, or the autorun script.
  let moveX = input.axis("moveX") + touchMoveX;
  let moveZ = input.axis("moveZ") + touchMoveZ;
  let gait: "walk" | "sneak" | "sprint" = input.held("sprint") || touchSprint ? "sprint" : input.held("sneak") || touchSneak ? "sneak" : "walk";
  let liftHeld = input.held("lift") || touchLiftHeld;
  if (autorunActive) {
    const scripted = autorunInputs();
    moveX = scripted.moveX;
    moveZ = scripted.moveZ;
    gait = scripted.gait;
    liftHeld = scripted.liftHeld;
  }

  const unlifted = runtime.layout.pedestals.filter((pedestal) => !runtime.liftedIds.includes(pedestal.id));
  const noises = runtime.thief.update(dtFixed, { moveX, moveZ, gait, liftHeld }, unlifted);
  for (const noise of noises) {
    noiseEvents.push({ ...noise });
    if (noiseEvents.length > MAX_NOISE_LOG) noiseEvents.shift();
    for (const guard of runtime.guards) {
      if (guardHearsNoise(guard, noise)) guard.hearNoise({ x: noise.x, z: noise.z });
    }
  }

  // Physics step: exit/laser sensors fire through engine sensor events.
  const sensors = runtime.world.stepFixed(1);
  for (const sensor of sensors) {
    sensorEventCount += 1;
    if (sensor.kind === "laser") {
      runtime.laserAlertRemaining = LASER_ALERT_SECONDS;
      const laser = runtime.layout.lasers.find((entry) => entry.id === sensor.id);
      runtime.laserAlertPoint = laser ? { x: laser.x, z: laser.z } : runtime.laserAlertPoint;
      pushCue("laser-trip");
      fx.laserTrip(laser ? [laser.x, 0.9, laser.z] : [runtime.thief.x, 0.4, runtime.thief.z]);
    } else if (sensor.kind === "exit" && runtime.liftedIds.length >= runtime.layout.pedestals.length) {
      floorClearAdvance();
      return;
    }
  }

  // Vision: FOV cones + LOS raycasts through the public physics query.
  const thiefSnap = runtime.thief.snapshot();
  const brightness = brightnessAt(runtime.layout.lightPools, thiefSnap.x, thiefSnap.z);
  const watchers: WatcherPose[] = runtime.guards.map((guard) => ({
    kind: "guard" as const,
    id: guard.id,
    x: guard.x,
    z: guard.z,
    eyeY: GUARD_EYE_HEIGHT,
    yaw: guard.yaw,
    halfFov: Math.PI / 4,
    range: 12
  }));
  for (const cam of runtime.layout.cameras) {
    watchers.push({
      kind: "camera" as const,
      id: cam.id,
      x: cam.x,
      z: cam.z,
      eyeY: cam.height,
      yaw: cameraYawAt(cam, runtime.timeInFloor),
      halfFov: Math.PI / 6,
      range: 10
    });
  }
  const vision = sampleVision(
    worldRaycast(runtime.world.world),
    watchers,
    thiefSnap.x,
    thiefSnap.z,
    THIEF_EYE_HEIGHT,
    brightness,
    [runtime.world.thiefBodyId],
    visionCounters,
    runtime.laserAlertRemaining > 0
  );
  losRayCountTotal += vision.losRayCount;
  occlusionCountTotal += vision.occlusionCount;
  lastCameraSamples = vision.watchers
    .filter((sample) => sample.kind === "camera")
    .map((sample) => ({ id: sample.id, yaw: sample.yaw, seesThief: sample.seesThief, occluded: sample.occluded }));
  lastThreatSamples = vision.watchers
    .filter((sample) => sample.kind === "guard")
    .map((sample) => ({ id: sample.id, x: sample.x, z: sample.z, yaw: sample.yaw, seesThief: sample.seesThief }));
  const seenGuard = vision.watchers.find((sample) => sample.kind === "guard" && sample.seesThief);

  const previousValue = runtime.detection.value;
  const effectiveVisionFill = alarmGraceRemaining > 0 ? 0 : vision.totalFillPerSecond;
  runtime.detection = advanceDetection(runtime.detection, effectiveVisionFill, dtFixed);
  if (alarmGraceRemaining > 0) alarmGraceRemaining = Math.max(0, alarmGraceRemaining - dtFixed);
  if (runtime.detection.value > SUSPICIOUS_THRESHOLD) runtime.ghostRun = false;
  runtime.lastSeen = vision.thiefSeen ? { x: thiefSnap.x, z: thiefSnap.z } : runtime.lastSeen;
  if (vision.thiefSeen && seenGuard) {
    const seen = { x: thiefSnap.x, z: thiefSnap.z };
    const seeingGuard = runtime.guards.find((guard) => guard.id === seenGuard.id);
    if (runtime.detection.value >= ALERT_THRESHOLD || runtime.laserAlertRemaining > 0) {
      if (seeingGuard && seeingGuard.state !== "alert" && cueReady("guard-alert", 30)) pushCue("guard-alert");
      for (const guard of runtime.guards) {
        if (guard.id === seenGuard.id) guard.reportAlert(seen);
      }
    } else if (runtime.detection.value >= SUSPICIOUS_THRESHOLD || previousValue < SUSPICIOUS_THRESHOLD) {
      if (cueReady("alert-rise", 45)) pushCue("alert-rise");
      for (const guard of runtime.guards) {
        if (guard.id === seenGuard.id) guard.reportSuspicious(seen);
      }
    }
  }
  if (runtime.detection.value >= CAUGHT_THRESHOLD) {
    phase = "caught";
    pushCue("caught-sting");
    fx.caughtPulse([thiefSnap.x, 0.6, thiefSnap.z]);
    return;
  }

  // Guards advance (authored deterministic patrols).
  for (const guard of runtime.guards) {
    const footsteps = guard.update({
      dt: dtFixed,
      detection: runtime.detection.value,
      suspiciousThreshold: SUSPICIOUS_THRESHOLD,
      alertThreshold: ALERT_THRESHOLD,
      lastSeen: runtime.lastSeen,
      laserAlertPoint: runtime.laserAlertRemaining > 0 ? runtime.laserAlertPoint : null
    });
    consumeFootsteps(footsteps);
  }

  // Completed lifts: score, escalation, exhibit visuals, audio + sparkle.
  const lifted = runtime.thief.takeCompletedLift();
  if (lifted) {
    runtime.liftedIds.push(lifted.id);
    runtime.floorScore += lifted.value;
    pushCue("exhibit-lift");
    fx.liftSparkle([lifted.x, 1.4, lifted.z]);
    for (const guard of runtime.guards) guard.registerLift(runtime.liftedIds);
    if (completedBeforeFloor + runtime.liftedIds.length >= 3) {
      alarmActive = true;
      alarmGraceRemaining = 2;
      runtime.detection = { value: 0, secondsSinceSeen: 0 };
      runtime.laserAlertRemaining = 999;
      runtime.laserAlertPoint = { x: runtime.thief.x, z: runtime.thief.z };
      pushCue("alert-rise");
      pushCue("guard-alert");
      fx.alarmStrobe([0, 3.2, -5.8]);
      for (const guard of runtime.guards) guard.reportAlert(runtime.laserAlertPoint);
      syncAlarmVisuals();
    }
    runtime.layout.pedestals.forEach((pedestal, slot) => {
      if (pedestal.id !== lifted.id) return;
      for (const variant of ["A", "B", "C"] as const) {
        handle(exhibitNodeId(slot, variant))?.setVisible(false);
      }
    });
  }

  if (runtime.laserAlertRemaining > 0) {
    runtime.laserAlertRemaining = Math.max(0, runtime.laserAlertRemaining - dtFixed);
  } else if (runtime.layout.cameras.length > 0 && cueReady("camera-whir", 240)) {
    const nearCam = runtime.layout.cameras.some((cam) => Math.hypot(cam.x - thiefSnap.x, cam.z - thiefSnap.z) < 6);
    if (nearCam) pushCue("camera-whir");
  }

  // Animation controllers: real embedded clips switched by gameplay state.
  thiefAnimation.update(dtFixed);
  playThiefClip(THIEF_CLIPS[thiefSnap.clip]);
  guardAnimations.forEach((controller) => controller?.update(dtFixed));
  runtime.guards.forEach((guard, index) => {
    const clip = guard.snapshot().state === "alert" ? GUARD_CLIPS.run : GUARD_CLIPS.walk;
    playGuardClip(guard.id, index, clip);
  });

  syncCharacterVisuals();
  syncThreatFeedback();
  syncObjective();
  syncCameraCones();
  syncHud();
});

// ---- pause / visibility ---------------------------------------------------------------
game.session.on("pause", () => { paused = true; });
game.session.on("resume", () => { paused = false; });
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
if (autorunRequested && !autorunActive) hooks.startAutorun();

game.start();
void game.ready().then(() => {
  // Bind the animation controllers once the runtime nodes exist.
  const thiefNode = thiefHandle();
  if (thiefNode && !animationBound) {
    animationBound = true;
    thiefAnimation.bindRuntimeNode(thiefNode, { id: "thief-runtime-animation", defaultClipId: THIEF_CLIPS.idle });
    const guard2 = guardHandle("guard-2");
    const controller = guardAnimations[1];
    if (guard2 && controller) {
      controller.bindRuntimeNode(guard2, { id: "guard-2-runtime-animation", defaultClipId: GUARD_CLIPS.idle });
    }
  }
  game.app.camera?.use?.(rig as never, { blend: 0.12 });
  game.app.setOutput?.({ exposure: Math.pow(2, direction.lighting.exposureEV) });
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frameCount; },
    firstFrameAt,
    sessionStartedAt: performance.now()
  };
});
void evidence;
