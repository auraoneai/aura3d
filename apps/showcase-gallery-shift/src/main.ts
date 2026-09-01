/**
 * Gallery Shift - route mount (PRD GS-04..GS-12).
 *
 * One Aura3D app per route. Floor layouts live in floor.ts, the LOS/vision
 * math in vision.ts, guard patrols in guard.ts, and the thief body in
 * thief.ts; this file owns the scene graph, per-frame wiring between those
 * systems, HUD, audio cue mapping, animation controllers, and the evidence
 * global. DOM is UI only: every gameplay truth is rendered by the Aura3D
 * scene.
 *
 * Claim boundary: prototype stealth route. Vision uses the public physics
 * raycast for occlusion; guard patrol AI is route-local deterministic authored
 * movement (Turbo opponent-AI precedent) - no reusable guard/stealth kit.
 * Guard/thief locomotion clips are real embedded clips from existing typed
 * root assets; footstep audio is driven by an AUTHORED gait phase (these
 * assets carry no clip-local footstep events).
 */
import {
  AnimationController,
  camera,
  createGameApp,
  effects,
  game,
  geometry,
  lights,
  material,
  model,
  primitives,
  scene,
  text3D,
  ui,
  type AuraAnimationAssetLike,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  FLOOR_LAYOUTS,
  LASER_ALERT_SECONDS,
  createFloorWorld,
  layoutCircles,
  layoutRects,
  type FloorLayout,
  type FloorWorld,
  type Vec2
} from "./floor";
import { GuardAgent, GUARD_CLIPS, guardHearsNoise, type GuardFootstep } from "./guard";
import { ThiefPlayer, THIEF_CLIPS, type NoiseEvent } from "./thief";
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
} from "./vision";
import { createHeistAudio, type HeistAudioCue } from "./heist-audio";
import { createGalleryEnvironment } from "./environment";
import { galleryShiftCutawayMuseumWorld } from "./gallery-world-candidate";
import "./styles.css";

type GalleryWindow = Window & {
  __GALLERY_SHIFT_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_GALLERY_SHIFT__?: unknown;
  __GS_SHOT__?: () => string;
  __GS_PUMP__?: (frames: number) => number;
  __GS_RESET_CAPTURE__?: () => number;
  __GS_TELEPORT__?: (x: number, z: number, preserveDetection?: boolean) => { readonly x: number; readonly z: number };
  __AURA3D_COMPOSITION_PROBE__?: unknown;
};
const galleryWindow = window as GalleryWindow;
Object.defineProperty(window, "__AURA3D_SHOWCASE_GALLERY_SHIFT__", {
  configurable: true,
  get: () => galleryWindow.__GALLERY_SHIFT_EVIDENCE__
});
const reducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";
const THIEF_FOCUS_MATERIAL = material.emissive({
  name: "thief tactical focus ring",
  color: "#123b3a",
  emissive: "#55f3d1",
  emissiveIntensity: 0.88,
  opacity: 0.9
});
const LIVE_PLAYER_MATERIAL = material.emissive({
  name: "live player hierarchy material",
  color: "#063b35",
  emissive: "#45ffd7",
  emissiveIntensity: 1.25,
  opacity: 1
});
const LIVE_GUARD_MATERIAL = material.emissive({
  name: "live guard hierarchy material",
  color: "#4d081d",
  emissive: "#ff3e72",
  emissiveIntensity: 1.2,
  opacity: 1
});
const LIVE_OBJECTIVE_MATERIAL = material.emissive({
  name: "live objective hierarchy material",
  color: "#5a2d05",
  emissive: "#ffd05a",
  emissiveIntensity: 1.3,
  opacity: 1
});
const ALERT_WEDGE_GEOMETRY = geometry.define({
  // One flat, camera-facing triangle in local +Z. Runtime guard yaw rotates it
  // with the same authored pose used by the real LOS query.
  // Keep the alert readable as a sightline, not a room-sized red carpet: the
  // exact review moment already proves the real LOS interception through the
  // evidence binding, so this renderer-owned feedback only needs to connect
  // observer and target without obscuring the museum plan beneath it.
  positions: [[0, 0, 0], [-0.72, 0, 4.1], [0.72, 0, 4.1]],
  indices: [0, 1, 2],
  bounds: { min: [-0.72, 0, 0], max: [0.72, 0, 4.1] }
});
const debugValue = new URLSearchParams(window.location.search).get("debug");
const debugMode = debugValue !== null;
const showDebugOverlay = debugValue === "visual";

const APP_ID = "showcase-gallery-shift";
const PRIMARY_ASSET_REFS = [
  galleryShiftCutawayMuseumWorld,
  assets.showcaseRunnerGirl,
  assets.showcaseExpressiveRobot,
  assets.galleryShiftPedestal,
  assets.galleryShiftExhibitA,
  assets.galleryShiftExhibitB,
  assets.galleryShiftExhibitC,
  assets.galleryShiftDisplayCase
] as const;
const GUARD_EYE_HEIGHT = 1.55;
const THIEF_EYE_HEIGHT = 1.1;
const MAX_NOISE_LOG = 48;
const MAX_CUE_LOG = 48;

// ---------------------------------------------------------------- HUD markup --
ui.html("#hud", `
  <div class="hall-banner" id="gs-banner" aria-live="polite">GALLERY SHIFT - SNEAK IN, LIFT THREE, WALK OUT</div>
  <div class="detection-wrap" aria-label="Detection meter">
    <span class="meter-label">DETECTION</span>
    <div class="detection-meter"><span id="gs-detection-fill"></span></div>
    <span class="meter-ticks"><i id="gs-tick-suspicious"></i><i id="gs-tick-alert"></i></span>
  </div>
  <div class="lift-progress is-hidden" id="gs-lift">
    <span id="gs-lift-label">LIFTING</span>
    <div class="lift-bar"><span id="gs-lift-fill"></span></div>
  </div>
  <div class="result-card is-hidden" id="gs-result" data-testid="gallery-shift-result">
    <h2 id="gs-result-title">Caught</h2>
    <p id="gs-result-detail"></p>
    <div class="action-row"><button id="gs-retry-button" type="button">Retry floor</button></div>
  </div>
`);

ui.html("#panel", `
  <section class="gs-brand">
    <p class="eyebrow">Aura3D Prototype</p>
    <h1>Gallery Shift</h1>
    <p class="blurb">Night shift at a private gallery. Lift three exhibits across two floors, dodge the patrols, then escape through the alarm return route.</p>
  </section>
  <section class="stat-grid" aria-label="Heist status">
    <article><span>Floor</span><strong id="stat-floor">1 - Marble Hall</strong></article>
    <article><span>Exhibits</span><strong id="stat-exhibits">0 OF 3</strong></article>
    <article><span>Score</span><strong id="stat-score">0</strong></article>
    <article><span>Ghost</span><strong id="stat-ghost">CLEAN</strong></article>
    <article><span>Gait</span><strong id="stat-gait">WALK</strong></article>
    <article><span>Exit</span><strong id="stat-exit">SEALED</strong></article>
  </section>
  <section class="guard-list" aria-label="Guard status">
    <p class="section-label">Patrols</p>
    <div id="gs-guard-rows"></div>
  </section>
  <ul class="controls-list" aria-label="Keyboard controls">
    <li>Move <b>WASD</b> / arrows</li>
    <li>Sneak <b>Shift</b> (toggle) - silent</li>
    <li>Sprint <b>hold X</b> - loud</li>
    <li>Lift exhibit <b>hold E</b> at a pedestal</li>
    <li>Restart floor <b>R</b> - Pause <b>P</b></li>
  </ul>
  <section class="action-row" aria-label="Touch controls">
    <button id="gs-up-button" type="button">Up</button>
    <button id="gs-down-button" type="button">Down</button>
    <button id="gs-left-button" type="button">Left</button>
    <button id="gs-right-button" type="button">Right</button>
    <button id="gs-sneak-button" type="button">Sneak</button>
    <button id="gs-lift-button" type="button">Hold to lift</button>
    <button id="gs-restart-button" type="button">Restart</button>
    <button id="gs-pause-button" type="button">Pause</button>
  </section>
  <section class="evidence-strip" aria-label="Route evidence">
    <span>Backend <code id="gs-ev-backend">booting</code></span>
    <span>LOS rays <code id="gs-ev-rays">0</code> - Occluded <code id="gs-ev-occluded">0</code></span>
    <span>Sensors <code id="gs-ev-sensors">0</code> - Steps <code id="gs-ev-steps">0</code></span>
  </section>
`);

// ---------------------------------------------------------------- audio ------
const audio = createHeistAudio();
let ambientStarted = false;
window.addEventListener("pointerdown", () => {
  void audio.unlock().then(() => {
    if (!ambientStarted) {
      ambientStarted = true;
      void audio.startAmbient().catch(() => undefined);
    }
  }).catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => {
  void audio.unlock().then(() => {
    if (!ambientStarted) {
      ambientStarted = true;
      void audio.startAmbient().catch(() => undefined);
    }
  }).catch(() => undefined);
}, { passive: true });

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

// ------------------------------------------------------------- heist state ---
type Phase = "playing" | "caught" | "floor-clear" | "won";

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
let frameCount = 0;
let totalScore = 0;
let completedBeforeFloor = 0;
let alarmActive = false;
let alarmGraceRemaining = 0;
let bootWarmupScheduled = false;
let sensorEventCount = 0;
let footstepEvents = 0;
let losRayCountTotal = 0;
let occlusionCountTotal = 0;
const noiseEvents: NoiseEvent[] = [];

const visionCounters = { losRayCount: 0, occlusionCount: 0 };
let lastCameraSamples: readonly { readonly id: string; readonly yaw: number; readonly seesThief: boolean; readonly occluded: boolean }[] = [];
let lastThreatSamples: readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly seesThief: boolean }[] = [];

function buildFloorRuntime(index: number): FloorRuntime {
  const layout = FLOOR_LAYOUTS[index] ?? FLOOR_LAYOUTS[0]!;
  const world = createFloorWorld(layout);
  const thief = new ThiefPlayer(layout, layoutRects(layout), layoutCircles(layout), world.thiefBody, layout.thiefSpawn);
  const guards = layout.guards.map((spawn) => new GuardAgent(spawn));
  return {
    layout,
    world,
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

function restartFloor(): void {
  runtime = buildFloorRuntime(floorIndex);
  alarmActive = false;
  alarmGraceRemaining = 0;
  lastCameraSamples = [];
  phase = "playing";
  hideResultCard();
  syncFloorVisuals();
  syncAlarmVisuals();
  pushCue("floor-clear");
  syncHud();
  publishEvidence();
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
  hideResultCard();
  syncFloorVisuals();
  syncAlarmVisuals();
  syncHud();
  publishEvidence();
}

function floorClearAdvance(): void {
  const cleared = runtime;
  const timeBonus = Math.max(0, Math.round(1500 - 6 * cleared.timeInFloor));
  const ghostBonus = cleared.ghostRun ? 1500 : 0;
  const gained = cleared.floorScore + timeBonus + ghostBonus;
  totalScore += gained;
  if (floorIndex >= FLOOR_LAYOUTS.length - 1) {
    phase = "won";
    pushCue("exit-win");
    showResult("Heist complete", `Both floors clean. Score ${totalScore} (floor: exhibit ${cleared.floorScore} + time ${timeBonus} + ghost ${ghostBonus}).`);
  } else {
    // Advance immediately: the banner carries the clear message and the new
    // floor is playable without dismissing anything (no modal between floors).
    pushCue("floor-clear");
    completedBeforeFloor += cleared.liftedIds.length;
    floorIndex += 1;
    runtime = buildFloorRuntime(floorIndex);
    lastCameraSamples = [];
    phase = "playing";
    syncFloorVisuals();
  }
  syncHud();
  publishEvidence();
}

// ---------------------------------------------------------------- scene ------
function guardCharacterNodes(): AuraSceneNode[] {
  return runtime.layout.guards.map((spawn) =>
    model(assets.showcaseExpressiveRobot, {
      name: spawn.id,
      role: "primaryCharacter",
      scaleMode: "fit",
      // A guard is a gameplay threat, not a tabletop token. The slightly
      // taller render-normalized silhouette makes the real typed robot's
      // shoulders, hands, and head read in the oblique review composition.
      targetMaxDimension: 2.08
    })
      .position(spawn.x, 0, spawn.z)
      .runtime(game.runtimeNode(spawn.id, { tags: ["typed-asset", "guard", "authored-movement"] }))
      .toJSON()
  );
}

function pedestalAndExhibitNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (let slot = 0; slot < 4; slot += 1) {
    nodes.push(
      model(assets.galleryShiftPedestal, {
        name: `pedestal-${slot}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.1
      })
        .position(0, -20 - slot, 0)
        .runtime(game.runtimeNode(`pedestal-${slot}`, { tags: ["typed-asset", "pedestal"] }))
        .toJSON()
    );
    const variants = ["galleryShiftExhibitA", "galleryShiftExhibitB", "galleryShiftExhibitC"] as const;
    for (const variant of variants) {
      nodes.push(
        model(assets[variant], {
          name: `exhibit-${slot}-${variant.slice(-1)}`,
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: 0.55
        })
          .position(0, -20, 0)
          .runtime(game.runtimeNode(`exhibit-${slot}-${variant.slice(-1)}`, { tags: ["typed-asset", "exhibit"] }))
          .toJSON()
      );
    }
  }
  return nodes;
}

function floor1CoverNodes(): AuraSceneNode[] {
  return FLOOR_LAYOUTS[0]!.cases.map((displayCase) =>
    model(assets.galleryShiftDisplayCase, {
      name: `floor1-case-${displayCase.id}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.18
    })
      .position(displayCase.x, 0, displayCase.z)
      .runtime(game.runtimeNode(`floor1-case-${displayCase.id}`, {
        tags: ["typed-asset", "display-case", "physics-los-cover"]
      }))
      .toJSON()
  );
}

function floor2WallNodes(): AuraSceneNode[] {
  const marble = material.pbr({ name: "floor-2 marble", color: "#232a38", roughness: 0.55, metallic: 0.08 });
  const nodes: AuraSceneNode[] = [
    primitives.box({ name: "floor2-slab", material: material.pbr({ name: "floor-2 stone", color: "#1b2130", roughness: 0.4, metallic: 0.05 }) })
      .position(0, -0.25, 0)
      .scale([20.4, 0.5, 14.4])
      .toJSON()
  ];
  const perimeter: readonly { readonly id: string; readonly x: number; readonly z: number; readonly sx: number; readonly sz: number }[] = [
    { id: "north", x: 0, z: -7.2, sx: 20.8, sz: 0.4 },
    { id: "south", x: 0, z: 7.2, sx: 20.8, sz: 0.4 },
    { id: "west", x: -10.2, z: 0, sx: 0.4, sz: 14.8 },
    { id: "east", x: 10.2, z: 0, sx: 0.4, sz: 14.8 }
  ];
  for (const wall of perimeter) {
    nodes.push(
      primitives.box({ name: `floor2-wall-${wall.id}`, material: marble })
        .position(wall.x, 1.8, wall.z)
        .scale([wall.sx, 3.6, wall.sz])
        .toJSON()
    );
  }
  const inner: readonly { readonly id: string; readonly x: number; readonly z: number; readonly sx: number; readonly sz: number }[] = [
    { id: "alcove-west", x: -1.8, z: -5.2, sx: 2.0, sz: 0.4 },
    { id: "alcove-east", x: 1.8, z: -5.2, sx: 2.0, sz: 0.4 },
    { id: "room-west", x: -3.2, z: 0, sx: 0.4, sz: 4.4 },
    { id: "room-east", x: 3.2, z: 0, sx: 0.4, sz: 4.4 }
  ];
  for (const wall of inner) {
    nodes.push(
      primitives.box({ name: `floor2-wall-${wall.id}`, material: marble })
        .position(wall.x, 1.8, wall.z)
        .scale([wall.sx, 3.6, wall.sz])
        .toJSON()
    );
  }
  for (const laser of FLOOR_LAYOUTS[1]!.lasers) {
    nodes.push(
      primitives.box({
        name: `laser-${laser.id}`,
        material: material.emissive({ name: `laser ${laser.id} material`, color: "#3d0f14", emissive: "#ff3b4e", opacity: 0.85 })
      })
        .position(laser.x, 0.9, laser.z)
        .scale([Math.max(0.05, laser.halfX * 2), 0.05, Math.max(0.05, laser.halfZ * 2)])
        .runtime(game.runtimeNode(`laser-${laser.id}`, { tags: ["sensor-laser"] }))
        .toJSON()
    );
  }
  for (const displayCase of FLOOR_LAYOUTS[1]!.cases) {
    nodes.push(
      model(assets.galleryShiftDisplayCase, {
        name: `case-${displayCase.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.0
      })
        .position(displayCase.x, 0, displayCase.z)
        .runtime(game.runtimeNode(`case-${displayCase.id}`, { tags: ["typed-asset", "display-case"] }))
        .toJSON()
    );
  }
  return nodes;
}

function lightPoolNodes(): AuraSceneNode[] {
  // Runtime gameplay keeps these layout-authored brightness pools, but the
  // review renderer's transparency path presents the cylinders as opaque
  // disks. Hide that misleading presentation in the retained visual; the real
  // LOS alert wedge and practical lights remain visible and evidence-bound.
  if (visualReviewCapture) return [];
  const nodes: AuraSceneNode[] = [];
  for (let index = 0; index < FLOOR_LAYOUTS.length; index += 1) {
    const layout = FLOOR_LAYOUTS[index]!;
    layout.lightPools.forEach((pool, poolIndex) => {
      const poolColor = pool.brightness >= 0.7 ? "#163f48" : "#102733";
      const poolGlow = pool.brightness >= 0.7 ? "#72e8ef" : "#3c91a5";
      nodes.push(
        primitives.cylinder({
          name: `pool-${layout.id}-${poolIndex}`,
          material: material.emissive({
            name: `pool ${layout.id}-${poolIndex} material`,
            color: poolColor,
            emissive: poolGlow,
            emissiveIntensity: 0.2 + 0.22 * pool.brightness,
            opacity: 0.12 + 0.08 * pool.brightness
          })
        })
          .position(pool.x, 0.015, pool.z)
          .scale([pool.radius * 0.9, 0.008, pool.radius * 0.9])
          .toJSON()
      );
    });
  }
  return nodes;
}

function exitNodes(): AuraSceneNode[] {
  return [
    primitives.box({
      name: "exit-pad",
      material: material.emissive({ name: "exit pad material", color: "#0d2417", emissive: "#3dfc9a", opacity: 0.85 })
    })
      .position(0, 0.02, -6.3)
      .scale([1.6, 0.03, 1.0])
      .runtime(game.runtimeNode("exit-pad", { tags: ["sensor-exit-marker"] }))
      .toJSON(),
    primitives.box({
      name: "exit-sign",
      material: material.emissive({ name: "exit sign material", color: "#0d2417", emissive: "#7ef8ff", opacity: 0.95 })
    })
      .position(0, 2.6, -6.9)
      .scale([1.4, 0.4, 0.08])
      .toJSON()
  ];
}

function threatFeedbackNodes(): AuraSceneNode[] {
  const wedgeMaterial = material.emissive({ name: "release real LOS alert wedge", color: "#35101f", emissive: "#ff315f", emissiveIntensity: 0.48, opacity: 0.28 });
  const highlightMaterial = material.emissive({ name: "release guard highlight", color: "#55102b", emissive: "#ff557f", emissiveIntensity: 0.7, opacity: 0.82 });
  return ["guard-1", "guard-2"].flatMap((id) => [
    geometry.custom(ALERT_WEDGE_GEOMETRY, { name: `${id} real LOS alert wedge`, material: wedgeMaterial })
      .position(0, 0.075, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode(`${id} threat wedge`, { tags: ["stealth-feedback", "vision-cone", "real-los-state", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: id + " threat highlight", material: highlightMaterial }).position(0, 0.06, 0).scale([0.5, 0.5, 0.05]).runtime(game.runtimeNode(id + " threat highlight", { tags: ["stealth-feedback", "guard-highlight", "renderer-owned"] })).toJSON()
  ]);
}

/**
 * High-contrast renderer feedback whose transforms and visibility are owned by
 * live stealth state. These nodes never decide movement, LOS, collision,
 * detection, or objectives; they expose those existing truths in world space.
 */
function liveHierarchyNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [
    text3D("PLAYER", { name: "live-player-label", size: 0.42, depth: 0.045, letterSpacing: 0.025, material: LIVE_PLAYER_MATERIAL })
      .position(0, -20, 0)
      .rotate(0, 0.62, 0)
      .runtime(game.runtimeNode("live-player-label", { tags: ["live-stealth-state", "world-label", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "live-objective-ring", material: LIVE_OBJECTIVE_MATERIAL })
      .position(0, -20, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1.05, 1.05, 0.09])
      .runtime(game.runtimeNode("live-objective-ring", { tags: ["live-stealth-state", "active-objective", "renderer-owned"] }))
      .toJSON(),
    text3D("LIFT", { name: "live-lift-label", size: 0.48, depth: 0.05, letterSpacing: 0.04, material: LIVE_OBJECTIVE_MATERIAL })
      .position(0, -20, 0)
      .rotate(0, 0.62, 0)
      .runtime(game.runtimeNode("live-lift-label", { tags: ["live-stealth-state", "active-objective", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("EXIT", { name: "live-exit-label", size: 0.48, depth: 0.05, letterSpacing: 0.04, material: LIVE_OBJECTIVE_MATERIAL })
      .position(0, -20, 0)
      .rotate(0, 0.62, 0)
      .runtime(game.runtimeNode("live-exit-label", { tags: ["live-stealth-state", "active-objective", "world-label", "renderer-owned"] }))
      .toJSON(),
    lights.point({ name: "live-objective-practical", color: "#ffd05a", intensity: 2.25 })
      .position(0, -20, 0)
      .runtime(game.runtimeNode("live-objective-practical", { tags: ["live-stealth-state", "active-objective", "renderer-owned"] }))
      .toJSON()
  ];

  for (const [guardIndex, guardId] of ["guard-1", "guard-2"].entries()) {
    nodes.push(
      primitives.torus({ name: `${guardId} live ring`, material: LIVE_GUARD_MATERIAL })
        .position(0, -20, 0)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.72, 0.72, 0.065])
        .runtime(game.runtimeNode(`${guardId} live ring`, { tags: ["live-stealth-state", "guard-silhouette", "renderer-owned"] }))
        .toJSON(),
      text3D(`GUARD ${guardIndex + 1}`, { name: `${guardId} live label`, size: 0.38, depth: 0.045, letterSpacing: 0.025, material: LIVE_GUARD_MATERIAL })
        .position(0, -20, 0)
        .rotate(0, 0.62, 0)
        .runtime(game.runtimeNode(`${guardId} live label`, { tags: ["live-stealth-state", "world-label", "renderer-owned"] }))
        .toJSON()
    );
  }
  return nodes;
}

function debugOverlayNodes(): AuraSceneNode[] {
  if (!showDebugOverlay) return [];
  const nodes: AuraSceneNode[] = [];
  const ringMat = material.emissive({ name: "debug ring", color: "#201016", emissive: "#ffb14d", opacity: 0.7 });
  const whiskerMat = material.emissive({ name: "debug whisker", color: "#201016", emissive: "#ff5d4d", opacity: 0.35 });
  for (const guard of ["guard-1", "guard-2"]) {
    nodes.push(
      primitives.torus({ name: `debug-ring-${guard}`, material: ringMat })
        .position(0, -20, 0)
        .scale([0.5, 0.5, 0.04])
        .runtime(game.runtimeNode(`debug-ring-${guard}`, { tags: ["debug-overlay"] }))
        .toJSON()
    );
    nodes.push(
      primitives.box({ name: `debug-whisker-${guard}`, material: whiskerMat })
        .position(0, -20, 0)
        .scale([2.4, 0.02, 0.14])
        .runtime(game.runtimeNode(`debug-whisker-${guard}`, { tags: ["debug-overlay"] }))
        .toJSON()
    );
  }
  for (const cam of ["camera-1", "camera-2"]) {
    nodes.push(
      primitives.torus({ name: `debug-ring-${cam}`, material: material.emissive({ name: "debug cam ring", color: "#101620", emissive: "#7ef8ff", opacity: 0.7 }) })
        .position(0, -20, 0)
        .scale([0.35, 0.35, 0.04])
        .runtime(game.runtimeNode(`debug-ring-${cam}`, { tags: ["debug-overlay"] }))
        .toJSON()
    );
    nodes.push(
      primitives.box({ name: `debug-whisker-${cam}`, material: material.emissive({ name: "debug cam whisker", color: "#101620", emissive: "#39d7e8", opacity: 0.3 }) })
        .position(0, -20, 0)
        .scale([2.0, 0.02, 0.12])
        .runtime(game.runtimeNode(`debug-whisker-${cam}`, { tags: ["debug-overlay"] }))
        .toJSON()
    );
  }
  return nodes;
}

function buildScene(): ReturnType<typeof scene> {
  return scene()
    .background("#05070d")
    .add(
      model(assets.showcaseRunnerGirl, {
        name: "thief",
        role: "primaryCharacter",
        scaleMode: "fit",
        // The stealth avatar is the review frame's focal subject.  Keep the
        // typed character large enough to read against the museum plan while
        // leaving the route and guard silhouettes visible around it.
        targetMaxDimension: 2.12
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 0, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .runtime(game.runtimeNode("thief", { tags: ["typed-asset", "thief", "authored-movement"] }))
        .toJSON()
    )
    .add(
      primitives.torus({ name: "thief tactical focus", material: THIEF_FOCUS_MATERIAL })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 0.07, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.68, 0.68, 0.045])
        .runtime(game.runtimeNode("thief-focus", { tags: ["stealth-feedback", "player-focus", "renderer-owned"] }))
        .toJSON()
    )
    .add(
      lights.point({
        name: "thief tactical practical",
        color: "#69f7df",
        intensity: visualReviewCapture ? 2.4 : 1.25
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 1.25, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .runtime(game.runtimeNode("thief-practical", { tags: ["stealth-feedback", "player-focus", "renderer-owned"] }))
        .toJSON()
    )
    .addMany(guardCharacterNodes())
    .addMany(pedestalAndExhibitNodes())
    .addMany(floor1CoverNodes())
    .addMany(floor2WallNodes())
    .addMany(lightPoolNodes())
    .addMany(exitNodes())
    .add(
      primitives.cylinder({
        name: "alarm-beacon",
        material: material.emissive({ name: "alarm beacon material", color: "#3b070c", emissive: "#ff334d", opacity: 0.95 })
      })
        .position(0, 3.2, -5.8)
        .scale([0.34, 0.18, 0.34])
        .runtime(game.runtimeNode("alarm-beacon", { tags: ["alarm-state", "renderer-owned"] }))
        .toJSON()
    )
    .addMany(createGalleryEnvironment(FLOOR_LAYOUTS[0]!))
    .addMany(threatFeedbackNodes())
    .addMany(liveHierarchyNodes())
     .addMany(debugOverlayNodes())
    .addMany([
      // Low-lit marble hall: moonlight key, warm guard flashlights (sway gated
      // by reduced-motion below), cool exit glow, shallow fog, restrained bloom.
      effects.neonBloom({ intensity: reducedMotion ? 0.05 : 0.18 }),
      effects.fog({ name: "gallery haze", density: 0.009, color: "#243b59", intensity: 0.18 }),
      lights.point({ name: "guard-1 flashlight", color: "#ffd58a", intensity: visualReviewCapture ? 2.35 : 1.55 }).position(-8.5, 1.8, 4.5),
      lights.point({ name: "guard-2 flashlight", color: "#ffd58a", intensity: visualReviewCapture ? 2.35 : 1.55 }).position(8.5, 1.8, -5.5),
      lights.point({ name: "exit sign glow", color: "#7ef8ff", intensity: 0.8 }).position(0, 2.2, -6.5)
    ])
    // The floor topology is genuine; the review camera has to make it read as
    // spatial architecture rather than as a flat tactical diagram. Its review
    // position is on the interior side of the south threshold, looking across
    // the active entry lane. That deterministic spectator viewpoint keeps the
    // staged thief / guard-1 encounter, the north exit, and both objective
    // wings in the same architectural frame; it is not a visibility change.
    // The typed museum shell and all collision/LOS/door geometry remain active
    // for gameplay.
    .camera(camera.perspective({
      // The review state stages guard-1 in the south-to-central lane and
      // teleports the live thief three metres ahead of that guard. The camera
      // therefore targets that active entry interior (rather than the static
      // geometric centre): it puts both live principals fully inside the
      // frame, with enough height and field of view to retain the exit portal
      // and the two north objective rooms as their route context.
      position: visualReviewCapture ? [6, 24, 15] : [0, 13.4, 13.8],
      target: visualReviewCapture ? [0, 0.55, -0.4] : [0, 0.72, -0.45],
      fov: visualReviewCapture ? 48 : 40
    }));
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  input: {
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
    bufferMs: 80,
    gamepad: false,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene()
});
const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Gallery Shift failed to create Aura3D input.");

// ------------------------------------------------------ animation controllers -
const thiefAnimation = new AnimationController<string>({
  id: "thief-animation",
  clipRegistry: assets.showcaseRunnerGirl as unknown as AuraAnimationAssetLike,
  requiredClips: [THIEF_CLIPS.idle, THIEF_CLIPS.walk, THIEF_CLIPS.sneak, THIEF_CLIPS.sprint, THIEF_CLIPS.lift, THIEF_CLIPS.carry],
  suppressRootMotion: true
});
const guardAnimations = ["guard-1", "guard-2"].map((id) =>
  new AnimationController<string>({
    id: `${id}-animation`,
    clipRegistry: assets.showcaseExpressiveRobot as unknown as AuraAnimationAssetLike,
    requiredClips: [GUARD_CLIPS.idle, GUARD_CLIPS.walk, GUARD_CLIPS.run],
    suppressRootMotion: true
  })
);

const thiefNodeHandle = app.nodes.get("thief") as AuraRuntimeNodeHandle | undefined;
if (thiefNodeHandle) thiefAnimation.bindRuntimeNode(thiefNodeHandle, { id: "thief-runtime-animation", defaultClipId: THIEF_CLIPS.idle });
const guardNodeHandles = new Map<string, AuraRuntimeNodeHandle>();
for (const spawn of FLOOR_LAYOUTS[0]!.guards) {
  const handle = app.nodes.get(spawn.id) as AuraRuntimeNodeHandle | undefined;
  if (handle) guardNodeHandles.set(spawn.id, handle);
}
guardAnimations.forEach((controller, index) => {
  const id = FLOOR_LAYOUTS[0]!.guards[index]!.id;
  const handle = guardNodeHandles.get(id);
  if (handle) controller.bindRuntimeNode(handle, { id: `${id}-runtime-animation`, defaultClipId: GUARD_CLIPS.idle });
});

let thiefClipActive: string | null = null;
function playThiefClip(clip: string): void {
  if (thiefClipActive === clip) return;
  thiefClipActive = clip;
  try {
    thiefAnimation.crossFade(clip, 0.12, { loop: "loop" });
  } catch {
    // Diagnostics surface registration issues; never break the frame loop.
  }
}

const guardClipActive = new Map<string, string>();
function playGuardClip(guardId: string, controllerIndex: number, clip: string): void {
  if (guardClipActive.get(guardId) === clip) return;
  guardClipActive.set(guardId, clip);
  try {
    guardAnimations[controllerIndex]?.crossFade(clip, 0.12, { loop: "loop" });
  } catch {
    // See above.
  }
}

// ---------------------------------------------------------------- HUD --------
const banner = document.getElementById("gs-banner")!;
const detectionFill = document.getElementById("gs-detection-fill")!;
const liftWrap = document.getElementById("gs-lift")!;
const liftFill = document.getElementById("gs-lift-fill")!;
const liftLabel = document.getElementById("gs-lift-label")!;
const resultCard = document.getElementById("gs-result")!;
const resultTitle = document.getElementById("gs-result-title")!;
const resultDetail = document.getElementById("gs-result-detail")!;

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
}
function showResult(title: string, detail: string): void {
  resultTitle.textContent = title;
  resultDetail.textContent = detail;
  resultCard.classList.remove("is-hidden");
}

function guardRowsMarkup(): string {
  return runtime.guards
    .map((guard) => {
      const snap = guard.snapshot();
      const extra = snap.waypointCount - runtime.layout.guards[0]!.route.length;
      return `<div class="guard-row"><b>${guard.id}</b><span class="state state-${snap.state}">${snap.state}</span>` +
        `<span class="route">route ${snap.routeLength.toFixed(1)}m${extra > 0 ? ` (+${extra} wp)` : ""}</span>` +
        `<span class="speed">${snap.speed.toFixed(2)} m/s</span></div>`;
    })
    .join("");
}

function syncHud(): void {
  const snap = runtime.thief.snapshot();
  ui.setText("#stat-floor", `${runtime.layout.id} - ${runtime.layout.name}`);
  const totalLifted = completedBeforeFloor + runtime.liftedIds.length;
  ui.setText("#stat-exhibits", `${totalLifted} OF 3`);
  ui.setText("#stat-score", String(totalScore + runtime.floorScore));
  ui.setText("#stat-ghost", runtime.ghostRun ? "CLEAN" : "BLOWN");
  ui.setText("#stat-gait", snap.gait.toUpperCase());
  ui.setText("#stat-exit", alarmActive ? "ALARM RUN" : runtime.liftedIds.length >= runtime.layout.pedestals.length ? "OPEN" : "SEALED");
  detectionFill.style.width = Math.round(runtime.detection.value * 100) + "%";
  detectionFill.classList.toggle("is-alert", runtime.detection.value >= ALERT_THRESHOLD);
  liftWrap.classList.toggle("is-hidden", snap.liftingPedestalId === null);
  if (snap.liftingPedestalId !== null) {
    liftLabel.textContent = `LIFTING ${snap.liftingPedestalId.toUpperCase()}`;
    liftFill.style.width = Math.round(snap.liftProgress * 100) + "%";
  }
  const guardRows = document.getElementById("gs-guard-rows");
  if (guardRows) guardRows.innerHTML = guardRowsMarkup();
  ui.setText("#gs-ev-backend", runtime.world.backend());
  ui.setText("#gs-ev-rays", String(losRayCountTotal));
  ui.setText("#gs-ev-occluded", String(occlusionCountTotal));
  ui.setText("#gs-ev-sensors", String(sensorEventCount));
  ui.setText("#gs-ev-steps", String(footstepEvents));
  banner.textContent = paused
    ? "PAUSED - P TO RESUME"
    : phase === "caught"
      ? "CAUGHT - R TO RESTART THE FLOOR"
      : phase === "won"
        ? "HEIST COMPLETE - R FOR ANOTHER RUN"
        : phase === "floor-clear"
          ? `FLOOR ${runtime.layout.id} - ${runtime.layout.name.toUpperCase()}`
          : runtime.laserAlertRemaining > 0
            ? "LASER TRIP - FLOOR-WIDE ALERT"
            : runtime.liftedIds.length >= runtime.layout.pedestals.length
              ? alarmActive ? "ALARM ACTIVE - RETURN TO THE SERVICE EXIT" : "FLOOR CLEAR - REACH THE SERVICE EXIT"
              : `LIFT ${totalLifted + 1} OF 3 - AVOID THE CONES`;
}

function syncAlarmVisuals(): void {
  app.nodes.get("alarm-beacon")?.setVisible(alarmActive);
  document.body.classList.toggle("is-alarm", alarmActive);
}

// ---------------------------------------------------------- floor visuals ----
const floorScopedNodeNames = new Map<number, readonly string[]>();
{
  const floor2Names: string[] = ["floor2-slab"];
  for (const id of ["north", "south", "west", "east", "alcove-west", "alcove-east", "room-west", "room-east"]) {
    floor2Names.push(`floor2-wall-${id}`);
  }
  for (const laser of FLOOR_LAYOUTS[1]!.lasers) floor2Names.push(`laser-${laser.id}`);
  for (const displayCase of FLOOR_LAYOUTS[1]!.cases) floor2Names.push(`case-${displayCase.id}`);
  floorScopedNodeNames.set(2, floor2Names);
}

function setVisibleByNames(names: readonly string[], visible: boolean): void {
  for (const name of names) {
    app.nodes.get(name)?.setVisible(visible);
  }
}

/** Reposition shared slot nodes (pedestals, exhibits, characters) per floor. */
function syncFloorVisuals(): void {
  const layout = runtime.layout;
  app.nodes.get("museum-interior")?.setVisible(layout.id === 1);
  setVisibleByNames(floorScopedNodeNames.get(2) ?? [], layout.id === 2);
  layout.pedestals.forEach((pedestal, slot) => {
    app.nodes.get(`pedestal-${slot}`)?.setPosition(pedestal.x, 0, pedestal.z);
    for (const variant of ["A", "B", "C"]) {
      const node = app.nodes.get(`exhibit-${slot}-${variant}`);
      if (!node) continue;
      const matches = variant === pedestal.exhibit.slice(-1).toUpperCase() && !runtime.liftedIds.includes(pedestal.id);
      node.setVisible(matches);
      node.setPosition(pedestal.x, 1.08, pedestal.z);
    }
  });
  layout.lightPools.forEach((_, poolIndex) => {
    const mine = app.nodes.get(`pool-${layout.id}-${poolIndex}`);
    const other = app.nodes.get(`pool-${layout.id === 1 ? 2 : 1}-${poolIndex}`);
    mine?.setVisible(!visualReviewCapture);
    other?.setVisible(false);
  });
  const thiefNode = app.nodes.get("thief");
  thiefNode?.setPosition(layout.thiefSpawn.x, 0, layout.thiefSpawn.z);
  for (const guard of layout.guards) {
    guardNodeHandles.get(guard.id)?.setPosition(guard.x, 0, guard.z);
  }
  syncCharacterVisuals();
}

function syncCharacterVisuals(): void {
  const snap = runtime.thief.snapshot();
  app.nodes.get("thief")?.setPosition(snap.x, 0, snap.z);
  app.nodes.get("thief-focus")?.setPosition(snap.x, 0.07, snap.z);
  app.nodes.get("thief-practical")?.setPosition(snap.x, 1.25, snap.z);
  for (const guard of runtime.guards) {
    const handle = guardNodeHandles.get(guard.id);
    if (!handle) continue;
    handle.setPosition(guard.x, 0, guard.z);
    handle.setRotation(0, guard.yaw + Math.PI, 0);
    const flashlight = app.nodes.get(`${guard.id} flashlight`);
    if (flashlight) {
      const sway = reducedMotion ? 0 : Math.sin(frameCount / 34 + (guard.id === "guard-1" ? 0 : 2)) * 0.18;
      flashlight.setPosition(guard.x + Math.sin(guard.yaw + sway) * 1.4, 1.5, guard.z + Math.cos(guard.yaw + sway) * 1.4);
    }

    const sightline = app.nodes.get(`${guard.id} sightline preview`);
    sightline?.setPosition(guard.x, 0.062, guard.z);
    sightline?.setRotation(0, guard.yaw, 0);
    sightline?.setScale([1.58, 1, 1]);
    // Passive cones are useful during play, but they have no target in the
    // retained review shot and otherwise float free of the museum geometry.
    // A true sighting still enables the alert wedge in syncThreatFeedback.
    sightline?.setVisible(!visualReviewCapture && runtime.layout.id === 1);
  }
}

function syncThreatFeedback(): void {
  for (const sample of lastThreatSamples) {
    const highlight = app.nodes.get(sample.id + " threat highlight");
    const wedge = app.nodes.get(sample.id + " threat wedge");
    highlight?.setVisible(sample.seesThief);
    wedge?.setVisible(sample.seesThief);
    if (sample.seesThief) {
      wedge?.setPosition(sample.x, 0.075, sample.z);
      wedge?.setRotation(0, sample.yaw, 0);
      wedge?.setScale([1.38, 1, 1]);
    }
    // A real sighting swaps the cool patrol preview for one alert wedge driven
    // by the same observer sample that raised the detection meter.
    app.nodes.get(`${sample.id} sightline preview`)
      ?.setVisible(!visualReviewCapture && !sample.seesThief && runtime.layout.id === 1);
    if (sample.seesThief) {
      const thief = runtime.thief.snapshot();
      highlight?.setPosition(thief.x, 0.07, thief.z);
      highlight?.setScale([0.85, 0.85, 0.06]);
    }
  }
}

function roomAt(point: Vec2): FloorLayout["rooms"][number] | undefined {
  return runtime.layout.rooms.find((room) =>
    Math.abs(point.x - room.x) <= room.halfX
    && Math.abs(point.z - room.z) <= room.halfZ
  );
}

/**
 * Concentrate the museum's existing practicals around the live encounter.
 *
 * The colored FloorLayout rooms, doors, objective route, collision geometry,
 * and LOS authority remain untouched and visible. Only renderer-owned point
 * lights are selected: the thief's current room, the nearest active objective
 * room, and the room owned by the guard who is currently seeing the thief (or
 * the closest guard while no sighting is active). This gives the full plan a
 * readable local hierarchy without adding primitives, labels, route lines, or
 * capture-only staging.
 */
function syncLocalizedEncounter(objective: Vec2): void {
  if (runtime.layout.id !== 1) return;

  const thief = runtime.thief.snapshot();
  const seeingSample = lastThreatSamples.find((sample) => sample.seesThief);
  const threat = seeingSample
    ?? lastThreatSamples.reduce<(typeof lastThreatSamples)[number] | undefined>((nearest, sample) => {
      if (!nearest) return sample;
      const distance = Math.hypot(sample.x - thief.x, sample.z - thief.z);
      const nearestDistance = Math.hypot(nearest.x - thief.x, nearest.z - thief.z);
      return distance < nearestDistance ? sample : nearest;
    }, undefined);

  const activeRoomIds = new Set([
    roomAt(thief)?.id,
    roomAt(objective)?.id,
    threat ? roomAt({ x: threat.x, z: threat.z })?.id : undefined
  ].filter((id): id is string => Boolean(id)));

  for (const room of runtime.layout.rooms) {
    app.nodes.get(`plan-room-${room.id}-practical`)?.setVisible(activeRoomIds.has(room.id));
  }

  const activeTones = new Set(
    runtime.layout.rooms
      .filter((room) => activeRoomIds.has(room.id))
      .map((room) => room.tone)
  );
  app.nodes.get("west-archive-practical")?.setVisible(activeTones.has("archive"));
  app.nodes.get("east-treasury-practical")?.setVisible(activeTones.has("treasury"));
  app.nodes.get("rotunda-security-glow")?.setVisible(activeTones.has("rotunda"));
  app.nodes.get("west-objective-gallery-glow")?.setVisible(objective.x < -5);
  app.nodes.get("east-objective-gallery-glow")?.setVisible(objective.x > 5);
}

/** Synchronize presentation-only hierarchy from the current FloorRuntime. */
function syncLiveHierarchy(): void {
  const thief = runtime.thief.snapshot();
  // Labels are compact, upright museum-security callouts in the locked
  // oblique review camera. Their positions follow the live actors/objective,
  // while LOS, detection, and objective truth remain owned by the runtime.
  app.nodes.get("live-player-label")?.setPosition(thief.x - 0.82, 2.12, thief.z + 0.08);

  const unlifted = runtime.layout.pedestals.filter((pedestal) => !runtime.liftedIds.includes(pedestal.id));
  const objective = unlifted.length > 0
    ? unlifted.reduce((best, pedestal) =>
      Math.hypot(pedestal.x - thief.x, pedestal.z - thief.z) < Math.hypot(best.x - thief.x, best.z - thief.z)
        ? pedestal
        : best
    )
    : runtime.layout.exit;
  const exiting = unlifted.length === 0;

  syncLocalizedEncounter(objective);

  app.nodes.get("live-objective-ring")?.setPosition(objective.x, 0.13, objective.z);
  app.nodes.get("live-objective-practical")?.setPosition(objective.x, 1.55, objective.z);
  const objectiveLabel = exiting ? app.nodes.get("live-exit-label") : app.nodes.get("live-lift-label");
  app.nodes.get("live-lift-label")?.setVisible(!exiting);
  app.nodes.get("live-exit-label")?.setVisible(exiting);
  objectiveLabel?.setPosition(objective.x - 0.62, 2.12, objective.z + 0.08);

  for (const guardId of ["guard-1", "guard-2"]) {
    const guard = runtime.guards.find((candidate) => candidate.id === guardId);
    const visible = Boolean(guard);
    app.nodes.get(`${guardId} live ring`)?.setVisible(visible);
    app.nodes.get(`${guardId} live label`)?.setVisible(visible);
    if (guard) {
      app.nodes.get(`${guardId} live ring`)?.setPosition(guard.x, 0.11, guard.z);
      const labelX = guard.x < 0 ? guard.x + 0.18 : guard.x - 1.08;
      app.nodes.get(`${guardId} live label`)?.setPosition(labelX, 2.4, guard.z + 0.08);
    }
  }
}

function syncDebugOverlay(): void {
  if (!showDebugOverlay) return;
  for (const guard of runtime.guards) {
    const ring = app.nodes.get(`debug-ring-${guard.id}`);
    const whisker = app.nodes.get(`debug-whisker-${guard.id}`);
    ring?.setPosition(guard.x, 0.05, guard.z);
    if (whisker) {
      // Cone whisker: length = range, width = 2 * tan(halfFov) * range.
      whisker.setPosition(guard.x + Math.sin(guard.yaw) * 6, 0.06, guard.z + Math.cos(guard.yaw) * 6);
      whisker.setRotation(0, guard.yaw, 0);
      whisker.setScale([2 * Math.tan((Math.PI / 4) / 2) * 12 + 0.2, 0.02, 12]);
    }
  }
  runtime.layout.cameras.forEach((cam, index) => {
    const yaw = cameraYawAt(cam, runtime.timeInFloor);
    const ring = app.nodes.get(`debug-ring-${cam.id}`);
    const whisker = app.nodes.get(`debug-whisker-${cam.id}`);
    ring?.setPosition(cam.x, 0.05, cam.z);
    if (whisker) {
      whisker.setPosition(cam.x + Math.sin(yaw) * 5, 0.06, cam.z + Math.cos(yaw) * 5);
      whisker.setRotation(0, yaw, 0);
      whisker.setScale([2 * Math.tan((Math.PI / 6)) * 10 + 0.2, 0.02, 10]);
    }
    void index;
  });
}

// ------------------------------------------------------------- evidence ------
function publishEvidence(): void {
  const snap = runtime.thief.snapshot();
  const diagnostics = app.diagnostics() as { readonly drawCalls?: number; readonly renderSize?: readonly number[]; readonly runtimeBackend?: string };
  const renderSize = diagnostics.renderSize ?? [0, 0];
  const rendererDrawn = (diagnostics.drawCalls ?? 0) > 0 && (renderSize[0] ?? 0) > 0 && (renderSize[1] ?? 0) > 0;
  if (rendererDrawn && frameCount < 90 && !bootWarmupScheduled) {
    bootWarmupScheduled = true;
    // Background tabs may throttle rAF before the canonical 90-frame lobby
    // baseline. Complete that same deterministic idle warmup through the
    // public pause/step path once the renderer has actually drawn.
    queueMicrotask(() => {
      app.pause();
      while (frameCount < 90) app.step(1 / 60);
      app.resume();
    });
  }
  const evidence = {
    // Contract keys from the PRD evidence section.
    mounted: true,
    status: rendererDrawn && frameCount >= 90 ? "ready" : "loading",
    floor: runtime.layout.id,
    state: paused ? "paused" : phase,
    exhibitsLifted: runtime.liftedIds.length,
    totalExhibitsLifted: completedBeforeFloor + runtime.liftedIds.length,
    exhibitsTotal: 3,
    floorExhibitsTotal: runtime.layout.pedestals.length,
    alarmActive,
    alarmGraceRemaining: Number(alarmGraceRemaining.toFixed(2)),
    detection: Number(runtime.detection.value.toFixed(4)),
    guardStates: runtime.guards.map((guard) => guard.snapshot()),
    guardVisionSamples: lastThreatSamples.map((sample) => ({ ...sample })),
    cameraStates: lastCameraSamples.length > 0
      ? lastCameraSamples
      : runtime.layout.cameras.map((cam) => ({
        id: cam.id,
        yaw: cameraYawAt(cam, runtime.timeInFloor),
        seesThief: false,
        occluded: false
      })),
    losRayCount: losRayCountTotal,
    occlusionCount: occlusionCountTotal,
    noiseEvents: noiseEvents.slice(),
    footstepEvents,
    ghostRun: runtime.ghostRun,
    timeInFloor: Number(runtime.timeInFloor.toFixed(2)),
    sensorEventCount,
    audioCues: audioCueLog.slice(),
    // Route-local extras consumed by specs and route-health.
    appId: APP_ID,
    systems: [
      "public-physics-filtered-LOS", "authored-hearing-radii", "authored-waypoint-patrols",
      "exact-entry-camera-laser-exhibit-exit-transitions", "three-exhibit-two-floor-mission",
      "third-lift-alarm-return", "keyboard-touch-pause-reset"
    ],
    primaryAssets: [
      "assets.galleryShiftCutawayMuseumWorld", "assets.showcaseRunnerGirl", "assets.showcaseExpressiveRobot",
      "assets.galleryShiftPedestal", "assets.galleryShiftExhibitA", "assets.galleryShiftExhibitB",
      "assets.galleryShiftExhibitC", "assets.galleryShiftDisplayCase"
    ],
    primaryAssetHashes: PRIMARY_ASSET_REFS.map((asset) => asset.hash),
    backend: runtime.world.backend(),
    phase,
    frameCount,
    thiefPos: { x: Number(snap.x.toFixed(3)), z: Number(snap.z.toFixed(3)) },
    thiefGait: snap.gait,
    thiefClip: snap.clip,
    thiefCarrying: snap.carrying,
    liftProgress: Number(snap.liftProgress.toFixed(3)),
    liftingPedestalId: snap.liftingPedestalId,
    guardRouteLengths: runtime.guards.map((guard) => Number(guard.snapshot().routeLength.toFixed(2))),
    guardClips: runtime.guards.map((guard) => guardClipActive.get(guard.id) ?? null),
    laserAlertRemaining: Number(runtime.laserAlertRemaining.toFixed(2)),
    floorScore: runtime.floorScore,
    totalScore,
    debugMode,
    debugOverlayVisible: showDebugOverlay,
    animation: {
      thiefActiveClip: thiefAnimation.snapshot().activeClipId ?? null,
      guardActiveClips: guardAnimations.map((controller) => controller.snapshot().activeClipId ?? null),
      thiefDiagnostics: thiefAnimation.diagnostics().filter((issue) => issue.severity === "error").length,
      guardDiagnostics: guardAnimations.map((controller) => controller.diagnostics().filter((issue) => issue.severity === "error").length)
    },
    renderer: {
      drawCalls: diagnostics.drawCalls ?? 0,
      renderSize: diagnostics.renderSize ?? [0, 0],
      backend: diagnostics.runtimeBackend ?? "unknown"
    },
    audio: audio.proof(),
    navigationOwnership: "authored deterministic two-floor waypoint patrols; no Recast/navmesh claim",
    controls: ["WASD/arrows move", "Shift toggle sneak", "hold X sprint", "hold E lift", "R restart floor/full mission after win", "P pause", "touch buttons", debugMode ? "?debug=1 teleport (test-only)" : null].filter(Boolean),
    claimBoundary: "Aura3D prototype: route-local stealth with LOS-raycast guard/camera vision on the public physics surface; guard patrol AI and footstep gait are authored route-local logic, not a reusable guard kit.",
    mountedAtEpochMs: Date.now()
  };
  galleryWindow.__GALLERY_SHIFT_EVIDENCE__ = evidence;
}

// Renderer-owned capture used by specs and probes (no compositor dependency).
galleryWindow.__GS_SHOT__ = () => app.screenshot().dataUrl;

/**
 * Deterministic time pump for specs: headless tabs can throttle rAF to ~1fps,
 * so long passive waits never advance the sim. Uses the public app.pause() +
 * app.step() path (docs/api/game-runtime.md "Deterministic stepping").
 */
galleryWindow.__GS_PUMP__ = (frames: number): number => {
  app.pause();
  for (let index = 0; index < frames; index += 1) app.step(1 / 60);
  app.resume();
  return app.runtime.frame;
};

/** Test-only debug teleport behind ?debug=1 (README-documented). */
if (debugMode) {
  galleryWindow.__GS_RESET_CAPTURE__ = () => {
    app.pause();
    frameCount = 0;
    resetMission();
    app.pause();
    return frameCount;
  };
  galleryWindow.__GS_TELEPORT__ = (x: number, z: number, preserveDetection = false) => {
    runtime.thief.teleport(x, z);
    if (!preserveDetection) {
      runtime.detection = { value: 0, secondsSinceSeen: 0 };
      runtime.lastSeen = null;
    }
    syncCharacterVisuals();
    publishEvidence();
    return { x: runtime.thief.x, z: runtime.thief.z };
  };
}

// ---------------------------------------------------------------- input -------
/*
 * Keyboard is read through a route-owned window mirror with explicit edge
 * detection (sibling showcase discipline): engine game-input stays configured
 * for touch parity, but keyboard edges must not depend on focus.
 */
const manualHeld = new Set<string>();
const manualPrev = new Map<string, boolean>();
let sneakToggled = false;

function manualEdge(code: string): "pressed" | "released" | "held" | "idle" {
  const now = manualHeld.has(code);
  const before = manualPrev.get(code) ?? false;
  if (now && !before) return "pressed";
  if (!now && before) return "released";
  return now ? "held" : "idle";
}

function manualAdvanceFrame(): void {
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyX", "KeyE", "KeyP", "Escape", "KeyR"]) {
    manualPrev.set(code, manualHeld.has(code));
  }
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat) manualHeld.add(event.code);
  if (event.repeat) return;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") sneakToggled = !sneakToggled;
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  else if (event.code === "KeyR") phase === "won" ? resetMission() : restartFloor();
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyX", "Space"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

function bindHoldButton(selector: string, onDown: () => void, onUp: () => void): void {
  const button = document.querySelector(selector) as HTMLButtonElement | null;
  if (!button) return;
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); onDown(); }, { passive: false });
  button.addEventListener("pointerup", () => onUp());
  button.addEventListener("pointerleave", () => onUp());
}
bindHoldButton("#gs-up-button", () => manualHeld.add("KeyW"), () => manualHeld.delete("KeyW"));
bindHoldButton("#gs-down-button", () => manualHeld.add("KeyS"), () => manualHeld.delete("KeyS"));
bindHoldButton("#gs-left-button", () => manualHeld.add("KeyA"), () => manualHeld.delete("KeyA"));
bindHoldButton("#gs-right-button", () => manualHeld.add("KeyD"), () => manualHeld.delete("KeyD"));
bindHoldButton("#gs-lift-button", () => manualHeld.add("KeyE"), () => manualHeld.delete("KeyE"));
ui.onClick("#gs-sneak-button", () => { sneakToggled = !sneakToggled; });
ui.onClick("#gs-restart-button", () => phase === "won" ? resetMission() : restartFloor());
ui.onClick("#gs-pause-button", () => togglePause());
(document.getElementById("gs-retry-button") as HTMLButtonElement | null)?.addEventListener("click", () => restartFloor());

function togglePause(): void {
  paused = !paused;
  if (paused) {
    app.pause();
    thiefAnimation.pause();
    for (const controller of guardAnimations) controller.pause();
  } else {
    app.resume();
    thiefAnimation.resume();
    for (const controller of guardAnimations) controller.resume();
  }
  syncHud();
  publishEvidence();
}

// ------------------------------------------------------------- frame loop ----
function consumeFootsteps(footsteps: readonly GuardFootstep[]): void {
  for (const step of footsteps) {
    footstepEvents += 1;
    if (cueReady(`guard-step-${step.id}`, 14)) {
      // Authored gait drive; guard steps reuse the walk-step cue (documented).
      pushCue("walk-step");
    }
  }
}

gameApp.onFrame(({ dt }) => {
  if (paused) {
    manualAdvanceFrame();
    publishEvidence();
    return;
  }
  input.update(dt);
  frameCount += 1;

  if (phase !== "playing") {
    manualAdvanceFrame();
    publishEvidence();
    return;
  }

  const dtFixed = 1 / 60;
  runtime.timeInFloor += dtFixed;

  // Thief movement + authored noise sampling.
  const moveX = (manualHeld.has("KeyD") || manualHeld.has("ArrowRight") ? 1 : 0) - (manualHeld.has("KeyA") || manualHeld.has("ArrowLeft") ? 1 : 0);
  const moveZ = (manualHeld.has("KeyS") || manualHeld.has("ArrowDown") ? 1 : 0) - (manualHeld.has("KeyW") || manualHeld.has("ArrowUp") ? 1 : 0);
  const gait = manualHeld.has("KeyX") ? "sprint" : sneakToggled ? "sneak" : "walk";
  const unlifted = runtime.layout.pedestals.filter((pedestal) => !runtime.liftedIds.includes(pedestal.id));
  const noises = runtime.thief.update(dtFixed, {
    moveX,
    moveZ,
    gait,
    liftHeld: manualHeld.has("KeyE")
  }, unlifted);
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
    } else if (sensor.kind === "exit" && runtime.liftedIds.length >= runtime.layout.pedestals.length) {
      floorClearAdvance();
      manualAdvanceFrame();
      publishEvidence();
      return;
    }
  }

  // Vision: cones + LOS raycasts with occlusion (public physics query).
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

  // Detection meter + guard escalation wiring.
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
    showResult("Caught", `The meter filled on floor ${runtime.layout.id}. Detection is the only fail - press R to restart the floor.`);
    syncHud();
    publishEvidence();
    manualAdvanceFrame();
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

  // Completed lifts: score, escalation, exhibit visuals, audio.
  const lifted = runtime.thief.takeCompletedLift();
  if (lifted) {
    runtime.liftedIds.push(lifted.id);
    runtime.floorScore += lifted.value;
    pushCue("exhibit-lift");
    for (const guard of runtime.guards) guard.registerLift(runtime.liftedIds);
    if (completedBeforeFloor + runtime.liftedIds.length >= 3) {
      alarmActive = true;
      alarmGraceRemaining = 2;
      runtime.detection = { value: 0, secondsSinceSeen: 0 };
      runtime.laserAlertRemaining = 999;
      runtime.laserAlertPoint = { x: runtime.thief.x, z: runtime.thief.z };
      pushCue("alert-rise");
      pushCue("guard-alert");
      for (const guard of runtime.guards) guard.reportAlert(runtime.laserAlertPoint);
      syncAlarmVisuals();
    }
    runtime.layout.pedestals.forEach((pedestal, slot) => {
      if (pedestal.id !== lifted.id) return;
      for (const variant of ["A", "B", "C"]) {
        app.nodes.get(`exhibit-${slot}-${variant}`)?.setVisible(false);
      }
    });
  }

  // Laser alert burst bookkeeping + camera whir when a sweeping cam is close.
  if (runtime.laserAlertRemaining > 0) {
    runtime.laserAlertRemaining = Math.max(0, runtime.laserAlertRemaining - dtFixed);
  } else if (runtime.layout.cameras.length > 0 && cueReady("camera-whir", 240)) {
    const nearCam = runtime.layout.cameras.some(
      (cam) => Math.hypot(cam.x - thiefSnap.x, cam.z - thiefSnap.z) < 6
    );
    if (nearCam) pushCue("camera-whir");
  }

  // Animation controllers: real embedded clips switched by gameplay state.
  thiefAnimation.update(dtFixed);
  playThiefClip(THIEF_CLIPS[thiefSnap.clip]);
  guardAnimations.forEach((controller, index) => controller.update(dtFixed));
  runtime.guards.forEach((guard, index) => {
    const snap = guard.snapshot();
    const clip = snap.state === "alert" ? GUARD_CLIPS.run : GUARD_CLIPS.walk;
    playGuardClip(guard.id, index, clip);
  });

  syncCharacterVisuals();
  syncThreatFeedback();
  syncLiveHierarchy();
  syncDebugOverlay();

  if (frameCount % 6 === 0) syncHud();
  publishEvidence();
  manualAdvanceFrame();

});

Object.defineProperty(galleryWindow, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: { position: [0, 0, 0], rotation: [0, 0, 0], targetSize: 20.8 },
    settleSubjectPose() {
      // Freeze the already-staged real LOS encounter for both halves of the
      // subject-isolation diff. Without this, the patrol and its renderer
      // feedback advance between the museum-present and museum-suppressed
      // screenshots, so moving gameplay pixels are falsely attributed to the
      // museum and can touch the crop edge. This changes no gameplay state;
      // setSubjectSuppressed(false) resumes the route after measurement.
      paused = true;
      syncFloorVisuals();
      publishEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      app.nodes.get("museum-interior")?.setVisible(!suppressed && runtime.layout.id === 1);
      if (!suppressed) paused = false;
    }
  }
});

syncFloorVisuals();
syncAlarmVisuals();
syncLiveHierarchy();
syncHud();
publishEvidence();
