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
  shadows,
  text3D,
  ui,
  type AuraAnimationAssetLike,
  type AuraDiagnostics,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";
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
import { createHeistAudio, type HeistAudioCue } from "./heist-audio";
import { createGalleryEnvironment } from "./environment";
import { galleryShiftCutawayMuseumWorld } from "../gameplay/gallery-world-candidate";
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
const visualReviewCapture = /[?&]capture=review(?:&|$)/.test(window.location.search);
// PRD-03 §6.6 / Q-14-1: post v2 (A3D_QR_POST, default-on) composites bloom with no
// hidden gain and a linear-HDR threshold of 1.0, so neon practicals need real HDR
// emissive strength (3-8) to glow. Post-off keeps the legacy authoring untouched.
const postV2 = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
}).on("A3D_QR_POST");
const NEON_GAIN = postV2 ? 0.65 : 0.55;
const DEFAULT_EMISSIVE_STRENGTH = 0.55;
document.body.dataset.capture = visualReviewCapture ? "review" : "default";
const THIEF_FOCUS_MATERIAL = material.emissive({
  name: "thief tactical focus ring",
  color: "#123b3a",
  emissive: "#55f3d1",
  emissiveIntensity: 0.68 * NEON_GAIN,
  opacity: 0.82
});
const LIVE_PLAYER_MATERIAL = material.emissive({
  name: "live player hierarchy material",
  color: "#063b35",
  emissive: "#45ffd7",
  emissiveIntensity: 0.72 * NEON_GAIN,
  opacity: 1
});
const LIVE_GUARD_MATERIAL = material.emissive({
  name: "live guard hierarchy material",
  color: "#4d081d",
  emissive: "#ff3e72",
  emissiveIntensity: 0.72 * NEON_GAIN,
  opacity: 1
});
const LIVE_OBJECTIVE_MATERIAL = material.emissive({
  name: "live objective hierarchy material",
  color: "#5a2d05",
  emissive: "#ffd05a",
  emissiveIntensity: 0.78 * NEON_GAIN,
  opacity: 1
});
const THIEF_DETAIL_MATERIAL = material.metal({
  name: "infiltrator identity harness",
  // A brighter cyan/teal harness gives the typed infiltrator a crisp read
  // against the pale rotunda tile without replacing the authored character
  // materials.  This is renderer-owned identity dressing only.
  color: "#146f6e",
  emissive: "#52f6dc",
  emissiveIntensity: 0.32,
  roughness: 0.28,
  metallic: 0.62
});
const GUARD_DETAIL_MATERIAL = material.metal({
  name: "sentry identity harness",
  color: "#852346",
  emissive: "#ff5b87",
  emissiveIntensity: 0.32,
  roughness: 0.3,
  metallic: 0.62
});
const THIEF_VISOR_MATERIAL = material.emissive({
  name: "infiltrator visor signal",
  color: "#0b4b4d",
  emissive: "#73fff0",
  emissiveIntensity: 0.85 * NEON_GAIN,
  opacity: 0.9
});
const ALERT_WEDGE_GEOMETRY = geometry.define({
  // One flat, camera-facing triangle in local +Z. Runtime guard yaw rotates it
  // with the same authored pose used by the real LOS query.
  // Half-width 1.6m over 4.6m reads the guard's real vision cone instead of a
  // laser line, while staying short of the room-sized carpet that would hide
  // the museum plan. Detection and occlusion remain physics truth in
  // vision.ts; this is feedback scale only.
  positions: [[0, 0, 0], [-1.6, 0, 4.6], [1.6, 0, 4.6]],
  normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
  indices: [0, 1, 2],
  bounds: { min: [-1.6, 0, 0], max: [1.6, 0, 4.6] }
});
const ALERT_BEAM_GEOMETRY = geometry.define({
  // The alert centerline is a narrow vertical scanner rail rather than a
  // single floor triangle.  It is only visible while the same real LOS sample
  // that drives detection is active; it never computes or implies perception.
  // Giving the rail physical height makes observer -> target action staging
  // legible from the oblique gameplay camera without adding another draw call
  // or altering the underlying FloorLayout raycast.
  positions: [
    [-0.11, 0.05, 0], [0.11, 0.05, 0], [0.11, 1.45, 0], [-0.11, 1.45, 0],
    [-0.11, 0.05, 4.6], [0.11, 0.05, 4.6], [0.11, 1.45, 4.6], [-0.11, 1.45, 4.6]
  ],
  normals: [
    [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1],
    [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]
  ],
  indices: [
    1, 0, 3, 1, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 4, 7, 0, 7, 3,
    5, 1, 2, 5, 2, 6,
    3, 7, 6, 3, 6, 2,
    0, 1, 5, 0, 5, 4
  ],
  bounds: { min: [-0.11, 0.05, 0], max: [0.11, 1.45, 4.6] }
});
const ALERT_LINE_GEOMETRY = geometry.define({
  // A shallow ground rail keeps the live LOS action readable from the
  // spectator camera.  Its visibility and length are still written only from
  // the real raycast sample in syncThreatFeedback; this quad never performs
  // perception or collision work.
  positions: [[-0.11, 0.065, 0], [0.11, 0.065, 0], [0.11, 0.065, 4.6], [-0.11, 0.065, 4.6]],
  normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]],
  indices: [0, 1, 2, 0, 2, 3],
  bounds: { min: [-0.11, 0.065, 0], max: [0.11, 0.065, 4.6] }
});

/**
 * Small renderer-owned identity harnesses for the two typed actor families.
 * The human and robot GLBs remain the primary subjects; these authored meshes
 * provide a consistent waist/shoulder/visor silhouette and state colour at the
 * review distance where the source assets' neutral materials otherwise merge
 * into the dark floor. They follow actor transforms only and never stand in
 * for the typed character geometry.
 */
type ActorDetailMesh = {
  readonly positions: Array<readonly [number, number, number]>;
  readonly normals: Array<readonly [number, number, number]>;
  readonly indices: number[];
};

function actorDetailMesh(): ActorDetailMesh {
  return { positions: [], normals: [], indices: [] };
}

function addActorBox(mesh: ActorDetailMesh, center: readonly [number, number, number], size: readonly [number, number, number]): void {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const min: [number, number, number] = [cx - sx / 2, cy - sy / 2, cz - sz / 2];
  const max: [number, number, number] = [cx + sx / 2, cy + sy / 2, cz + sz / 2];
  const faces: readonly {
    readonly normal: readonly [number, number, number];
    readonly vertices: readonly (readonly [number, number, number])[];
  }[] = [
    { normal: [0, 0, 1], vertices: [[min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]] },
    { normal: [0, 0, -1], vertices: [[max[0], min[1], min[2]], [min[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]]] },
    { normal: [-1, 0, 0], vertices: [[min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]]] },
    { normal: [1, 0, 0], vertices: [[max[0], min[1], max[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]]] },
    { normal: [0, 1, 0], vertices: [[min[0], max[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]]] },
    { normal: [0, -1, 0], vertices: [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]]] }
  ];
  for (const face of faces) {
    const base = mesh.positions.length;
    mesh.positions.push(...face.vertices);
    mesh.normals.push(...face.vertices.map(() => face.normal as readonly [number, number, number]));
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function defineActorDetail(mesh: ActorDetailMesh): ReturnType<typeof geometry.define> {
  return geometry.define({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices });
}

const thiefDetailMesh = actorDetailMesh();
// Shoulder mantle, slim pack, belt and visor keep the typed infiltrator's
// readable human outline while leaving the face/body materials visible.
addActorBox(thiefDetailMesh, [0, 1.48, 0], [0.96, 0.1, 0.22]);
addActorBox(thiefDetailMesh, [0, 1.18, -0.29], [0.36, 0.58, 0.1]);
addActorBox(thiefDetailMesh, [0, 0.86, 0], [0.7, 0.08, 0.24]);
addActorBox(thiefDetailMesh, [0, 2.03, 0.14], [0.46, 0.09, 0.06]);
const THIEF_DETAIL_GEOMETRY = defineActorDetail(thiefDetailMesh);

const guardDetailMesh = actorDetailMesh();
// Robot sentries get a broad chest plate and front visor that read red at a
// glance without pretending to replace their typed animated bodies.
addActorBox(guardDetailMesh, [0, 1.38, 0], [0.98, 0.48, 0.16]);
addActorBox(guardDetailMesh, [0, 1.78, 0.17], [0.78, 0.08, 0.06]);
addActorBox(guardDetailMesh, [0, 2.34, 0.24], [0.86, 0.1, 0.08]);
addActorBox(guardDetailMesh, [-0.5, 1.52, 0], [0.08, 0.3, 0.24]);
addActorBox(guardDetailMesh, [0.5, 1.52, 0], [0.08, 0.3, 0.24]);
const GUARD_DETAIL_GEOMETRY = defineActorDetail(guardDetailMesh);
const debugMatch = /[?&]debug=([^&]+)/.exec(window.location.search);
const debugValue = debugMatch ? decodeURIComponent(debugMatch[1]!) : null;
const debugMode = debugValue !== null;
const showDebugOverlay = debugValue === "visual";

const APP_ID = "showcase-gallery-shift";
// The route-primary composition probe isolates the typed museum world only.
// Actor models, identity details, live LOS feedback, and HUD remain visible in
// the suppressed half so the probe cannot pass by hiding the action staging.
const COMPOSITION_SUBJECT_NODE = "museum-interior";
const PRIMARY_ASSET_REFS = [
  galleryShiftCutawayMuseumWorld,
  assets.galleryThief,
  assets.showcaseRunnerGirl,
  assets.showcaseExpressiveRobot,
  assets.robotcand,
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
  <div class="review-brief" id="gs-brief" aria-live="polite">STEALTH LINK // SCANNING</div>
  <div class="mission-rail" id="gs-mission-rail" aria-label="Live heist route">
    <div class="mission-rail-head"><span>HEIST ROUTE</span><b id="gs-route-state">MARBLE HALL / LIVE</b></div>
    <div class="mission-steps" aria-label="Exhibit sequence">
      <span id="gs-step-1" class="mission-step">01 ARCHIVE</span>
      <span id="gs-step-2" class="mission-step">02 TREASURY</span>
      <span id="gs-step-3" class="mission-step">03 SKYLINE</span>
      <span id="gs-step-exit" class="mission-step">EXIT</span>
    </div>
    <div class="mission-legend">
      <span><i class="legend-dot legend-player"></i>PLAYER</span>
      <span><i class="legend-dot legend-patrol"></i>PATROL TRACK</span>
      <span><i class="legend-dot legend-los"></i>LIVE LOS</span>
    </div>
  </div>
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
// T1.12 (§6.9.18 P0): the thief's facing yaw, blended toward the move direction
// (halflife 0.08 s on the fixed 1/60 sim step) — before this the rig never
// turned and the thief slid sideways through every corridor.
let thiefFacingYaw = 0;
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

/// ---------------------------------------------------------------- scene ------
const rootGalleryAssets = assets as unknown as Record<string, typeof assets.galleryMarbleBustExhibitMeshy>;
const pharaohRelicAsset = rootGalleryAssets.galleryPharaohRelicMeshy ?? assets.galleryMarbleBustExhibitMeshy;

function guardCharacterNodes(): AuraSceneNode[] {
  return runtime.layout.guards.flatMap((spawn) => {
    const archivePatrol = spawn.id === "guard-1";
    const nodes: AuraSceneNode[] = [
      model(assets.gallerySecurityGuardMeshy, {
        name: spawn.id,
        role: "primaryCharacter",
        scaleMode: "fit",
        targetMaxDimension: 1.98,
        castShadow: true,
        receiveShadow: true
      })
        .position(spawn.x, 0, spawn.z)
        .runtime(game.runtimeNode(spawn.id, {
          tags: ["typed-asset", "guard", "authored-movement", archivePatrol ? "robotcand-sentry" : "animated-sentry"]
        }))
        .toJSON(),
      shadows.contact({
        name: `${spawn.id} contact shadow`,
        footprint: [0.92, 0.64],
        opacity: 0.55,
        color: "#02040a"
      })
        .runtime(game.runtimeNode(`${spawn.id} contact shadow`, { tags: ["stealth-feedback", "contact-grounding", "renderer-owned"] }))
        .toJSON()
    ];
    if (!archivePatrol) {
      nodes.splice(1, 0,
        geometry.custom(GUARD_DETAIL_GEOMETRY, {
          name: `${spawn.id} sentry identity detail`,
          material: GUARD_DETAIL_MATERIAL
        })
          .position(spawn.x, -20, spawn.z)
          .scale([0.001, 0.001, 0.001])
          .runtime(game.runtimeNode(`${spawn.id} sentry identity detail`, {
            tags: ["typed-set-dressing", "guard-identity", "renderer-owned", "authored-movement"]
          }))
          .toJSON()
      );
    }
    return nodes;
  });
}

function pedestalAndExhibitNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const velvetMat = material.pbr({
    name: "museum pedestal crimson velvet",
    color: "#4c0519",
    roughness: 0.62,
    metallic: 0.12
  });
  const goldTrimMat = material.metal({
    name: "museum pedestal brushed gold",
    color: "#f59e0b",
    emissive: "#b45309",
    emissiveIntensity: 0.24,
    roughness: 0.22,
    metallic: 0.88
  });
  // FloorLayout owns exactly three mission pedestals (p1/p2 on floor 1 and
  // p3 on floor 2). Keep the shared visual slots tight to that contract and
  // crown each pedestal with a gleaming 3D Pharaoh Relic & velvet/gold plinth.
  for (let slot = 0; slot < 3; slot += 1) {
    nodes.push(
      model(assets.galleryShiftPedestal, {
        name: `pedestal-${slot}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.78
      })
        .position(0, -20 - slot, 0)
        .runtime(game.runtimeNode(`pedestal-${slot}`, { tags: ["typed-asset", "pedestal"] }))
        .toJSON(),
      primitives.cylinder({
        name: `pedestal-velvet-plinth-${slot}`,
        material: velvetMat
      })
        .position(0, -20 - slot, 0)
        .scale([0.52, 0.28, 0.52])
        .runtime(game.runtimeNode(`pedestal-velvet-plinth-${slot}`, { tags: ["set-dressing", "pedestal-plinth"] }))
        .toJSON(),
      primitives.torus({
        name: `pedestal-gold-trim-${slot}`,
        material: goldTrimMat
      })
        .position(0, -20 - slot, 0)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.56, 0.56, 0.05])
        .runtime(game.runtimeNode(`pedestal-gold-trim-${slot}`, { tags: ["set-dressing", "pedestal-trim"] }))
        .toJSON(),
      model(pharaohRelicAsset, {
        name: `pedestal-pharaoh-relic-${slot}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.94,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, -20 - slot, 0)
        .runtime(game.runtimeNode(`pedestal-pharaoh-relic-${slot}`, { tags: ["typed-asset", "exhibit", "pharaoh-relic"] }))
        .toJSON()
    );
    const variants = ["galleryShiftExhibitA", "galleryShiftExhibitB", "galleryShiftExhibitC"] as const;
    for (const variant of variants) {
      nodes.push(
        model(assets[variant], {
          name: `exhibit-${slot}-${variant.slice(-1)}`,
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: 0.36
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
      targetMaxDimension: 0.84
    })
      .position(displayCase.x, 0, displayCase.z)
      .runtime(game.runtimeNode(`floor1-case-${displayCase.id}`, {
        tags: ["typed-asset", "display-case", "physics-los-cover"]
      }))
      .toJSON()
  );
}

/**
 * Typed archival displays + 3D Meshy Pharaoh Relics, Marble Busts, and Laser Security Pylons
 * that flesh out the rotunda and four side-room suites.
 */
const GALLERY_SUITE_DISPLAY_SPECS: readonly {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly exhibit: "A" | "B" | "C";
}[] = [
  { id: "archive-gallery", x: -8.88, z: -5.72, exhibit: "A" },
  { id: "archive-conservation", x: -8.88, z: 5.52, exhibit: "B" },
  { id: "treasury-vault", x: 8.88, z: -5.72, exhibit: "C" },
  { id: "treasury-exhibition", x: 8.88, z: 5.52, exhibit: "A" },
  { id: "vault-archive", x: -2.25, z: -5.35, exhibit: "C" }
] as const;
const GALLERY_SUITE_DISPLAY_NODE_NAMES = GALLERY_SUITE_DISPLAY_SPECS.flatMap(({ id }) => [
  `suite-case-${id}`,
  `suite-exhibit-${id}`
]);

function museumDisplaySuiteNodes(): AuraSceneNode[] {
  const velvetPlinthMat = material.pbr({
    name: "rotunda crimson velvet plinth",
    color: "#58081e",
    roughness: 0.54,
    metallic: 0.16
  });
  const goldMedallionMat = material.metal({
    name: "rotunda brushed brass inlay",
    color: "#fbbf24",
    emissive: "#d97706",
    emissiveIntensity: 0.28,
    roughness: 0.24,
    metallic: 0.86
  });
  const marblePlinthMat = material.pbr({
    name: "carrara marble bust plinth",
    color: "#cbd5e1",
    roughness: 0.28,
    metallic: 0.08
  });
  const herringboneFloorMat = material.pbr({
    name: "museum dark walnut herringbone inlay",
    color: "#1e1b18",
    roughness: 0.22,
    metallic: 0.18
  });
  const laserGateBeamMat = material.emissive({
    name: "security gate ruby laser beam",
    color: "#7f1d1d",
    emissive: "#ff2a55",
    emissiveIntensity: 1.15 * NEON_GAIN,
    opacity: 0.78
  });

  return GALLERY_SUITE_DISPLAY_SPECS.flatMap<AuraSceneNode>((display) => [
    model(assets.galleryShiftDisplayCase, {
      name: `suite-case-${display.id}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.64
    })
      .position(display.x, 0, display.z)
      .runtime(game.runtimeNode(`suite-case-${display.id}`, {
        tags: ["typed-asset", "museum-display", "set-dressing", "non-gameplay"]
      }))
      .toJSON(),
    model(assets[`galleryShiftExhibit${display.exhibit}`], {
      name: `suite-exhibit-${display.id}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.3
    })
      .position(display.x, 0.48, display.z)
      .runtime(game.runtimeNode(`suite-exhibit-${display.id}`, {
        tags: ["typed-asset", "museum-exhibit", "set-dressing", "non-gameplay"]
      }))
      .toJSON()
  ]).concat([
    // Rich dark walnut/marble museum gallery floor medallion & corridor runner inlays
    primitives.cylinder({
      name: "gallery-rotunda-floor-medallion",
      material: herringboneFloorMat
    })
      .position(0, 0.005, -0.25)
      .scale([3.4, 0.008, 3.4])
      .toJSON(),
    primitives.torus({
      name: "gallery-rotunda-brass-ring-outer",
      material: goldMedallionMat
    })
      .position(0, 0.012, -0.25)
      .rotate(Math.PI / 2, 0, 0)
      .scale([2.65, 2.65, 0.025])
      .toJSON(),
    primitives.cylinder({
      name: "gallery-rotunda-velvet-plinth",
      material: velvetPlinthMat
    })
      .position(0, 0.22, -0.25)
      .scale([0.78, 0.44, 0.78])
      .toJSON(),
    primitives.torus({
      name: "gallery-rotunda-gold-ring",
      material: goldMedallionMat
    })
      .position(0, 0.44, -0.25)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.82, 0.82, 0.045])
      .toJSON(),
    // 3x High-value 3D Meshy Pharaoh Relics (Rotunda Centerpiece + West Archive + East Treasury)
    model(pharaohRelicAsset, {
      name: "gallery-rotunda-armillary-exhibit",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.58,
      castShadow: true,
      receiveShadow: true
    })
      .scale(1.22)
      .position(0, 0.42, -0.25)
      .runtime(game.runtimeNode("gallery-rotunda-armillary-exhibit", {
        tags: ["typed-asset", "rotunda-centerpiece", "set-dressing", "non-gameplay"]
      }))
      .toJSON(),
    primitives.cylinder({
      name: "gallery-archive-relic-plinth",
      material: velvetPlinthMat
    })
      .position(-6.4, 0.22, -2.1)
      .scale([0.58, 0.44, 0.58])
      .toJSON(),
    model(pharaohRelicAsset, {
      name: "gallery-archive-pharaoh-relic",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.25,
      castShadow: true,
      receiveShadow: true
    })
      .position(-6.4, 0.44, -2.1)
      .runtime(game.runtimeNode("gallery-archive-pharaoh-relic", {
        tags: ["typed-asset", "archive-relic", "set-dressing", "non-gameplay"]
      }))
      .toJSON(),
    primitives.cylinder({
      name: "gallery-treasury-relic-plinth",
      material: velvetPlinthMat
    })
      .position(6.4, 0.22, 1.5)
      .scale([0.58, 0.44, 0.58])
      .toJSON(),
    model(pharaohRelicAsset, {
      name: "gallery-treasury-pharaoh-relic",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.25,
      castShadow: true,
      receiveShadow: true
    })
      .position(6.4, 0.44, 1.5)
      .runtime(game.runtimeNode("gallery-treasury-pharaoh-relic", {
        tags: ["typed-asset", "treasury-relic", "set-dressing", "non-gameplay"]
      }))
      .toJSON(),
    // 4x Classical 3D Meshy Marble Bust Exhibits on Carrara marble plinths along the gallery wings
    ...[
      { id: "west-archive", x: -5.65, z: 2.35, yaw: 0.65 },
      { id: "east-treasury", x: 5.65, z: -2.35, yaw: -0.65 },
      { id: "north-colonade", x: -2.95, z: -3.65, yaw: 0.35 },
      { id: "south-colonade", x: 2.95, z: 3.45, yaw: -2.45 }
    ].flatMap((bust) => [
      primitives.box({
        name: `gallery-bust-plinth-${bust.id}`,
        material: marblePlinthMat
      })
        .position(bust.x, 0.32, bust.z)
        .scale([0.54, 0.64, 0.54])
        .toJSON(),
      model(assets.galleryMarbleBustExhibitMeshy, {
        name: `gallery-marble-bust-${bust.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.28,
        castShadow: true,
        receiveShadow: true
      })
        .position(bust.x, 0.62, bust.z)
        .rotate(0, bust.yaw, 0)
        .runtime(game.runtimeNode(`gallery-marble-bust-${bust.id}`, {
          tags: ["typed-asset", "marble-bust-exhibit", "set-dressing", "non-gameplay"]
        }))
        .toJSON()
    ]),
    // 6x 3D Meshy Laser Security Pylons flanking the rotunda gates and vault corridors
    ...[
      { id: "west-gate", x: -2.05, z: -0.85 },
      { id: "east-gate", x: 2.05, z: -0.85 },
      { id: "north-west", x: -1.85, z: 1.55 },
      { id: "north-east", x: 1.85, z: 1.55 },
      { id: "archive-door", x: -4.25, z: -1.85 },
      { id: "treasury-door", x: 4.25, z: 1.85 }
    ].map((pylon) =>
      model(assets.galleryLaserSecurityPylonMeshy, {
        name: `gallery-laser-pylon-${pylon.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.38,
        castShadow: true,
        receiveShadow: true
      })
        .scale(1.18)
        .position(pylon.x, 0, pylon.z)
        .runtime(game.runtimeNode(`gallery-laser-pylon-${pylon.id}`, {
          tags: ["typed-asset", "laser-security-pylon", "set-dressing", "non-gameplay"]
        }))
        .toJSON()
    ),
    // Crisp ruby security laser gate beams connecting the pylon pairs
    primitives.box({
      name: "gallery-rotunda-laser-beam-north",
      material: laserGateBeamMat
    })
      .position(0, 0.78, -0.85)
      .scale([4.0, 0.028, 0.028])
      .runtime(game.runtimeNode("gallery-rotunda-laser-beam-north", { tags: ["set-dressing", "laser-beam"] }))
      .toJSON(),
    primitives.box({
      name: "gallery-rotunda-laser-beam-south",
      material: laserGateBeamMat
    })
      .position(0, 0.78, 1.55)
      .scale([3.6, 0.028, 0.028])
      .runtime(game.runtimeNode("gallery-rotunda-laser-beam-south", { tags: ["set-dressing", "laser-beam"] }))
      .toJSON()
  ]);
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
        material: material.emissive({ name: `laser ${laser.id} material`, color: "#3d0f14", emissive: "#ff3b4e", emissiveIntensity: DEFAULT_EMISSIVE_STRENGTH * NEON_GAIN, opacity: 0.85 })
      })
        .position(laser.x, 0.9, laser.z)
        .scale([Math.max(0.05, laser.halfX * 2), 0.05, Math.max(0.05, laser.halfZ * 2)])
        .runtime(game.runtimeNode(`laser-${laser.id}`, { tags: ["sensor-laser"] }))
        .toJSON(),
      model(assets.galleryLaserSecurityPylonMeshy, {
        name: `gallery-laser-pylon-${laser.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.35
      })
        .position(laser.x - laser.halfX, 0, laser.z - laser.halfZ)
        .runtime(game.runtimeNode(`gallery-laser-pylon-${laser.id}`, {
          tags: ["typed-asset", "laser-security-pylon", "set-dressing"]
        }))
        .toJSON()
    );
  }
  for (const displayCase of FLOOR_LAYOUTS[1]!.cases) {
    nodes.push(
      model(assets.galleryShiftDisplayCase, {
        name: `case-${displayCase.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.72
      })
        .position(displayCase.x, 0, displayCase.z)
        .runtime(game.runtimeNode(`case-${displayCase.id}`, { tags: ["typed-asset", "display-case"] }))
        .toJSON()
    );
  }
  return nodes;
}

function lightPoolNodes(): AuraSceneNode[] {
  // These are authored gameplay-zone markers, not a physical lighting claim.
  // Keep the same nodes in normal play and review captures so transparency
  // defects remain observable in the exact artifacts under review.
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
            emissiveIntensity: 0.18 + 0.18 * pool.brightness,
            opacity: 0.14 + 0.08 * pool.brightness
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
      material: material.emissive({ name: "exit pad material", color: "#0d2417", emissive: "#3dfc9a", emissiveIntensity: DEFAULT_EMISSIVE_STRENGTH * NEON_GAIN, opacity: 0.85 })
    })
      .position(0, 0.02, -6.3)
      .scale([1.6, 0.03, 1.0])
      .runtime(game.runtimeNode("exit-pad", { tags: ["sensor-exit-marker"] }))
      .toJSON(),
    primitives.box({
      name: "exit-sign",
      material: material.emissive({ name: "exit sign material", color: "#0d2417", emissive: "#58d4dc", emissiveIntensity: 0.25, opacity: 0.85 })
    })
      .position(0, -20, -6.92)
      .scale([0.001, 0.001, 0.001])
      .toJSON()
  ];
}

function threatFeedbackNodes(): AuraSceneNode[] {
  const wedgeMaterial = material.emissive({ name: "release real LOS alert wedge", color: "#7d173c", emissive: "#ff477b", emissiveIntensity: 1.18 * NEON_GAIN, opacity: 0.68 });
  const beamMaterial = material.emissive({ name: "release real LOS center beam", color: "#c43765", emissive: "#ffd0dc", emissiveIntensity: 1.35 * NEON_GAIN, opacity: 0.92 });
  const lineMaterial = material.emissive({ name: "release real LOS floor rail", color: "#8d234a", emissive: "#ff5e8e", emissiveIntensity: 1.25 * NEON_GAIN, opacity: 0.84 });
  const targetMaterial = material.emissive({ name: "release real LOS target reticle", color: "#54132f", emissive: "#ff78a4", emissiveIntensity: 1.2 * NEON_GAIN, opacity: 0.88 });
  const empShockwaveMat = material.emissive({ name: "emp decoy shockwave ring", color: "#0c4a6e", emissive: "#38bdf8", emissiveIntensity: 1.35 * NEON_GAIN, opacity: 0.88 });
  const shadowCloakMat = material.emissive({ name: "shadow cloak aura ring", color: "#1e1b4b", emissive: "#818cf8", emissiveIntensity: 0.95 * NEON_GAIN, opacity: 0.72 });
  return ["guard-1", "guard-2"].flatMap((id) => [
    geometry.custom(ALERT_WEDGE_GEOMETRY, { name: `${id} real LOS alert wedge`, material: wedgeMaterial })
      .position(0, 0.072, 0)
      .scale([1.35, 1, 0.86])
      .runtime(game.runtimeNode(`${id} threat wedge`, { tags: ["stealth-feedback", "vision-cone", "real-los-state", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(ALERT_BEAM_GEOMETRY, { name: `${id} real LOS center beam`, material: beamMaterial })
      .position(0, 0.19, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode(`${id} threat beam`, { tags: ["stealth-feedback", "vision-centerline", "real-los-state", "renderer-owned"] }))
      .toJSON(),
    geometry.custom(ALERT_LINE_GEOMETRY, { name: `${id} real LOS floor rail`, material: lineMaterial })
      .position(0, 0.08, 0)
      .scale([1.2, 1, 0.86])
      .runtime(game.runtimeNode(`${id} threat line`, { tags: ["stealth-feedback", "vision-floor-rail", "real-los-state", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: `${id} threat highlight`, material: targetMaterial })
      .position(0, 0.08, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.001, 0.001, 0.06])
      .runtime(game.runtimeNode(`${id} threat highlight`, { tags: ["stealth-feedback", "vision-target", "real-los-state", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: `${id} threat source`, material: targetMaterial })
      .position(0, 0.12, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.66, 0.66, 0.06])
      .runtime(game.runtimeNode(`${id} threat source`, { tags: ["stealth-feedback", "vision-source", "real-los-state", "renderer-owned"] }))
      .toJSON()
  ]).concat([
    primitives.torus({ name: "gallery-emp-pulse-ring", material: empShockwaveMat })
      .position(0, -20, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("gallery-emp-pulse-ring", { tags: ["stealth-feedback", "emp-pulse", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "gallery-shadow-cloak-aura", material: shadowCloakMat })
      .position(0, -20, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("gallery-shadow-cloak-aura", { tags: ["stealth-feedback", "shadow-cloak", "renderer-owned"] }))
      .toJSON()
  ]);
}

/**
 * High-contrast renderer feedback whose transforms and visibility are owned by
 * live stealth state. These nodes never decide movement, LOS, collision,
 * detection, or objectives; they expose those existing truths in world space.
 */
function liveHierarchyNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [
    text3D("PLAYER", { name: "live-player-label", size: 0.42, depth: 0.05, letterSpacing: 0.03, material: LIVE_PLAYER_MATERIAL, backend: "sdf" })
      .position(0, -20, 0)
      .runtime(game.runtimeNode("live-player-label", { tags: ["live-stealth-state", "world-label", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "live-objective-ring", material: LIVE_OBJECTIVE_MATERIAL })
      .position(0, -20, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.95, 0.95, 0.08])
      .runtime(game.runtimeNode("live-objective-ring", { tags: ["live-stealth-state", "active-objective", "renderer-owned"] }))
      .toJSON(),
    text3D("LIFT", { name: "live-lift-label", size: 0.46, depth: 0.05, letterSpacing: 0.04, material: LIVE_OBJECTIVE_MATERIAL, backend: "sdf" })
      .position(0, -20, 0)
      .runtime(game.runtimeNode("live-lift-label", { tags: ["live-stealth-state", "active-objective", "world-label", "renderer-owned"] }))
      .toJSON(),
    text3D("EXIT", { name: "live-exit-label", size: 0.46, depth: 0.05, letterSpacing: 0.04, material: LIVE_OBJECTIVE_MATERIAL, backend: "sdf" })
      .position(0, -20, 0)
      .runtime(game.runtimeNode("live-exit-label", { tags: ["live-stealth-state", "active-objective", "world-label", "renderer-owned"] }))
      .toJSON(),
    lights.point({ name: "live-objective-practical", color: "#ffd05a", intensity: 1.55 })
      .position(0, -20, 0)
      .runtime(game.runtimeNode("live-objective-practical", { tags: ["live-stealth-state", "active-objective", "renderer-owned"] }))
      .toJSON()
  ];

  for (const [guardIndex, guardId] of ["guard-1", "guard-2"].entries()) {
    nodes.push(
      primitives.torus({ name: `${guardId} live ring`, material: LIVE_GUARD_MATERIAL })
        .position(0, -20, 0)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.62, 0.62, 0.052])
        .runtime(game.runtimeNode(`${guardId} live ring`, { tags: ["live-stealth-state", "guard-silhouette", "renderer-owned"] }))
        .toJSON(),
      text3D(`GUARD ${guardIndex + 1}`, { name: `${guardId} live label`, size: 0.42, depth: 0.05, letterSpacing: 0.03, material: LIVE_GUARD_MATERIAL, backend: "sdf" })
        .position(0, -20, 0)
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

function meshyThiefCandidateNodes(): AuraSceneNode[] {
  return [
    model(assets.galleryThief, {
      name: "Meshy museum thief candidate",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.68,
      visible: false
    })
      .position(0, -25, 0)
      .scale([0.001, 0.001, 0.001])
      .rotate(0, 2.35, 0)
      .runtime(game.runtimeNode("gallery-meshy-thief-candidate", {
        tags: ["typed-asset", "thief-identity", "meshy-candidate", "review-set-dressing", "non-colliding"]
      }))
      .toJSON(),
    model(assets.robotcand, {
      name: "gallery-rotunda-guard-3d",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.78,
      visible: false
    })
      .position(0, -25, 0)
      .scale([0.001, 0.001, 0.001])
      .rotate(0, -0.75, 0)
      .runtime(game.runtimeNode("gallery-rotunda-guard-3d", {
        tags: ["typed-asset", "guard-identity", "rotunda-sentry", "non-colliding"]
      }))
      .toJSON()
  ];
}

function tuneGalleryEnvironmentNodes(rawNodes: AuraSceneNode[]): AuraSceneNode[] {
  return rawNodes.map((raw) => {
    const node = { ...(raw as unknown as Record<string, unknown>) };
    const name = typeof node.name === "string" ? node.name : "";
    if (name === "service exit room label") {
      node.visible = false;
      node.position = [0, -20, 0];
      node.scale = [0.001, 0.001, 0.001];
    } else if (name === "treasury room label") {
      // Shift TREASURY 3D label slightly inward from the east wall so the trailing Y is never clipped
      node.position = [4.25, 2.78, -6.83];
      node.scale = [0.85, 0.85, 0.85];
    } else if (name === "archive room label") {
      node.position = [-8.95, 2.78, -6.83];
      node.scale = [0.85, 0.85, 0.85];
    }
    if (node.material && typeof node.material === "object") {
      const mat = { ...(node.material as Record<string, unknown>) };
      if (name.includes("room label") || name === "museum authored practical fixtures") {
        mat.color = "#fde68a";
        mat.emissive = "#f59e0b";
        mat.emissiveIntensity = 0.42;
      } else if (name.includes("sightline preview")) {
        mat.color = "#9f1239";
        mat.emissive = "#ff4d6d";
        mat.emissiveIntensity = 0.68;
        mat.opacity = 0.42;
      } else if (typeof mat.emissiveIntensity === "number") {
        mat.emissiveIntensity = Number((mat.emissiveIntensity * 0.72).toFixed(3));
      }
      node.material = mat;
    }
    if (typeof node.intensity === "number") {
      node.intensity = Number((node.intensity * 1.12).toFixed(3));
    }
    return node as unknown as AuraSceneNode;
  });
}

function buildScene(): ReturnType<typeof scene> {
  return scene()
    .background("#080c16")
    .add(
      model(assets.galleryStealthThiefMeshy, {
        name: "thief",
        role: "primaryCharacter",
        scaleMode: "fit",
        targetMaxDimension: visualReviewCapture ? 1.82 : 1.96,
        castShadow: true,
        receiveShadow: true
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 0, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .runtime(game.runtimeNode("thief", { tags: ["typed-asset", "thief", "authored-movement"] }))
        .toJSON()
    )
    .add(
      geometry.custom(THIEF_DETAIL_GEOMETRY, {
        name: "infiltrator identity detail",
        material: THIEF_DETAIL_MATERIAL
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, -20, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .scale([0.001, 0.001, 0.001])
        .runtime(game.runtimeNode("infiltrator identity detail", {
          tags: ["typed-set-dressing", "thief-identity", "renderer-owned", "authored-movement"]
        }))
        .toJSON()
    )
    .add(
      primitives.box({ name: "infiltrator visor signal", material: THIEF_VISOR_MATERIAL })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, -20, FLOOR_LAYOUTS[0]!.thiefSpawn.z + 0.1)
        .scale([0.001, 0.001, 0.001])
        .runtime(game.runtimeNode("infiltrator visor signal", {
          tags: ["typed-set-dressing", "thief-identity", "renderer-owned", "authored-movement"]
        }))
        .toJSON()
    )
    .add(
      primitives.torus({ name: "thief tactical focus", material: THIEF_FOCUS_MATERIAL })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 0.07, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.58, 0.58, 0.04])
        .runtime(game.runtimeNode("thief-focus", { tags: ["stealth-feedback", "player-focus", "renderer-owned"] }))
        .toJSON()
    )
    .add(
      shadows.contact({
        name: "thief contact shadow",
        footprint: [0.64, 0.46],
        opacity: 0.52,
        color: "#02040a"
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 0.018, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .runtime(game.runtimeNode("thief contact shadow", { tags: ["stealth-feedback", "contact-grounding", "renderer-owned"] }))
        .toJSON()
    )
    .add(
      lights.point({
        name: "thief tactical practical",
        color: "#69f7df",
        intensity: visualReviewCapture ? 1.55 : 1.48
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x, 1.15, FLOOR_LAYOUTS[0]!.thiefSpawn.z)
        .runtime(game.runtimeNode("thief-practical", { tags: ["stealth-feedback", "player-focus", "renderer-owned"] }))
        .toJSON()
    )
    .add(
      lights.point({
        name: "thief cyan rim fill",
        color: "#8fffee",
        intensity: visualReviewCapture ? 1.35 : 1.28
      })
        .position(FLOOR_LAYOUTS[0]!.thiefSpawn.x - 0.45, 1.65, FLOOR_LAYOUTS[0]!.thiefSpawn.z + 0.35)
        .runtime(game.runtimeNode("thief-rim-fill", { tags: ["stealth-feedback", "player-focus", "renderer-owned"] }))
        .toJSON()
    )
    .addMany(guardCharacterNodes())
    .addMany(pedestalAndExhibitNodes())
    .addMany(floor1CoverNodes())
    .addMany(museumDisplaySuiteNodes())
    .addMany(floor2WallNodes())
    .addMany(lightPoolNodes())
    .addMany(meshyThiefCandidateNodes())
    .addMany(exitNodes())
    .add(
      primitives.cylinder({
        name: "alarm-beacon",
        material: material.emissive({ name: "alarm beacon material", color: "#3b070c", emissive: "#ff334d", emissiveIntensity: DEFAULT_EMISSIVE_STRENGTH * NEON_GAIN, opacity: 0.9 })
      })
        .position(0, 3.2, -5.8)
        .scale([0.28, 0.14, 0.28])
        .runtime(game.runtimeNode("alarm-beacon", { tags: ["alarm-state", "renderer-owned"] }))
        .toJSON()
    )
    .addMany(tuneGalleryEnvironmentNodes(createGalleryEnvironment(FLOOR_LAYOUTS[0]!)))
    .addMany(threatFeedbackNodes())
    .addMany(liveHierarchyNodes())
    .addMany(debugOverlayNodes())
    .addMany([
      // Warm museum gallery illumination + crisp moonlight key + spotlighting on 3D Pharaoh relics & busts
      effects.neonBloom({ intensity: reducedMotion ? 0.05 : 0.12, threshold: 0.86, radius: 0.32, maxIntensity: 0.44, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.fog({ name: "gallery haze", density: 0.006, color: "#1e293b", intensity: 0.14 }),
      effects.colorGrade({ exposure: 1.06, contrast: 1.07, saturation: 1.08 }),
      effects.antiAlias({ mode: "fxaa" }),
      lights.ambient({ name: "museum ambient fill", color: "#d6eef5", intensity: visualReviewCapture ? 0.22 : 0.64 }),
      lights.directional({ name: "museum moon key", position: [4.8, 9.2, 5.4], color: "#fff4e0", intensity: visualReviewCapture ? 0.72 : 1.32 }),
      lights.directional({ name: "museum cyan rim", position: [-5.5, 5.8, -4.6], color: "#76dff1", intensity: visualReviewCapture ? 0.78 : 0.75 }),
      lights.spot({ name: "rotunda guard spotlight", position: [-8.5, 2.8, 4.5], target: [-4, 0, 1], angle: 0.55, penumbra: 0.6, distance: 18, decay: 2, intensity: 1.65, color: "#ffd58a", shadow: true }),
      lights.spot({ name: "rotunda bust exhibit spotlight", position: [0, 4.4, 1.4], target: [0, 0.6, -0.25], angle: 0.68, penumbra: 0.5, distance: 16, decay: 1.4, intensity: 2.85, color: "#ffe6b3", shadow: false }),
      lights.point({ name: "rotunda centerpiece warm fill", color: "#ffdd9e", intensity: 2.35 }).position(0, 2.45, -0.25),
      lights.point({ name: "west archive relic spotlight", color: "#fde68a", intensity: 1.85 }).position(-6.4, 2.4, -2.1),
      lights.point({ name: "east treasury relic spotlight", color: "#fde68a", intensity: 1.85 }).position(6.4, 2.4, 1.5),
      lights.point({ name: "rotunda laser pylon cyan fill west", color: "#5ef2ff", intensity: 1.65 }).position(-2.15, 1.65, 0.25),
      lights.point({ name: "rotunda laser pylon cyan fill east", color: "#5ef2ff", intensity: 1.65 }).position(2.15, 1.65, 0.25),
      lights.point({ name: "guard-1 flashlight", color: "#ffd58a", intensity: visualReviewCapture ? 1.45 : 1.35 }).position(-8.5, 1.8, 4.5),
      lights.point({ name: "guard-2 flashlight", color: "#ffd58a", intensity: visualReviewCapture ? 1.45 : 1.35 }).position(8.5, 1.8, -5.5),
      lights.point({ name: "exit sign glow", color: "#7ef8ff", intensity: 0.45 }).position(0, 2.2, -6.5)
    ])
    .camera(camera.perspective({
      position: visualReviewCapture ? [0, 26.0, 2.5] : [0, 13.1, 13.4],
      target: visualReviewCapture ? [0, 0.92, 0.35] : [0, 0.45, -0.8],
      fov: visualReviewCapture ? 38 : 40
    }));
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  physics: {
    seed: 20260916,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
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
    gamepad: true,
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
// Guard-1 is the typed Robotcand security shell and carries no embedded
// locomotion clips; its patrol is the route-local authored transform. Guard-2
// is the expressive humanoid sentry and owns the real Idle/Walking/Running
// clips. Keep the controller slot so guard IDs stay stable in evidence without
// claiming animation metadata that Robotcand does not contain.
const guardAnimations: Array<AnimationController<string> | null> = [
  null,
  new AnimationController<string>({
    id: "guard-2-animation",
    clipRegistry: assets.showcaseExpressiveRobot as unknown as AuraAnimationAssetLike,
    requiredClips: [GUARD_CLIPS.idle, GUARD_CLIPS.walk, GUARD_CLIPS.run],
    suppressRootMotion: true
  })
];

const thiefNodeHandle = app.nodes.get("thief") as AuraRuntimeNodeHandle | undefined;
if (thiefNodeHandle) thiefAnimation.bindRuntimeNode(thiefNodeHandle, { id: "thief-runtime-animation", defaultClipId: THIEF_CLIPS.idle });
const guardNodeHandles = new Map<string, AuraRuntimeNodeHandle>();
for (const spawn of FLOOR_LAYOUTS[0]!.guards) {
  const handle = app.nodes.get(spawn.id) as AuraRuntimeNodeHandle | undefined;
  if (handle) guardNodeHandles.set(spawn.id, handle);
}
guardAnimations.forEach((controller, index) => {
  if (!controller) return;
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
  const controller = guardAnimations[controllerIndex];
  if (!controller) return;
  if (guardClipActive.get(guardId) === clip) return;
  guardClipActive.set(guardId, clip);
  try {
    controller.crossFade(clip, 0.12, { loop: "loop" });
  } catch {
    // See above.
  }
}

// ---------------------------------------------------------------- HUD --------
const banner = document.getElementById("gs-banner")!;
const reviewBrief = document.getElementById("gs-brief")!;
const routeState = document.getElementById("gs-route-state")!;
const missionStepNodes = [
  document.getElementById("gs-step-1"),
  document.getElementById("gs-step-2"),
  document.getElementById("gs-step-3"),
  document.getElementById("gs-step-exit")
].filter((node): node is HTMLElement => node instanceof HTMLElement);
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
  const seeingGuard = lastThreatSamples.find((sample) => sample.seesThief);
  const objective = runtime.layout.pedestals.find((pedestal) => !runtime.liftedIds.includes(pedestal.id));
  const objectiveLabel = objective ? `OBJECTIVE ${runtime.liftedIds.length + completedBeforeFloor + 1}/3` : "SERVICE EXIT";
  const missionProgress = Math.min(3, completedBeforeFloor + runtime.liftedIds.length);
  missionStepNodes.forEach((node, index) => {
    node.classList.toggle("is-complete", index < missionProgress);
    node.classList.toggle("is-active", index === missionProgress);
  });
  if (objective) {
    const room = roomAt(objective);
    const roomName = room?.id.replaceAll("-", " ").toUpperCase() ?? runtime.layout.name.toUpperCase();
    routeState.textContent = `${roomName} / ${objectiveLabel}`;
  } else {
    routeState.textContent = `${runtime.layout.name.toUpperCase()} / SERVICE EXIT ARMED`;
    missionStepNodes.at(-1)?.classList.add("is-active");
  }
  reviewBrief.textContent = seeingGuard
    ? `LIVE CONTACT // ${seeingGuard.id.toUpperCase()} HAS LOS // ${objectiveLabel}`
    : `STEALTH LINK // ${objectiveLabel} // ${runtime.ghostRun ? "CLEAN" : "SUSPICIOUS"}`;
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
  for (const laser of FLOOR_LAYOUTS[1]!.lasers) {
    floor2Names.push(`laser-${laser.id}`, `gallery-laser-pylon-${laser.id}`);
  }
  for (const displayCase of FLOOR_LAYOUTS[1]!.cases) floor2Names.push(`case-${displayCase.id}`);
  floorScopedNodeNames.set(2, floor2Names);
}

function setVisibleByNames(names: readonly string[], visible: boolean): void {
  for (const name of names) {
    app.nodes.get(name)?.setVisible(visible);
  }
}

let empPulseTimer = 0;
let empCooldownRemaining = 0;
let empPulseOrigin: Vec2 = { x: 0, z: 0 };

/** Reposition shared slot nodes (pedestals, exhibits, characters) per floor. */
function syncFloorVisuals(): void {
  const layout = runtime.layout;
  app.nodes.get("museum-interior")?.setVisible(layout.id === 1);
  app.nodes.get("service exit room label")?.setVisible(false);
  app.nodes.get("gallery-meshy-thief-candidate")?.setVisible(false);
  app.nodes.get("gallery-rotunda-guard-3d")?.setVisible(false);
  setVisibleByNames(floorScopedNodeNames.get(2) ?? [], layout.id === 2);
  setVisibleByNames(GALLERY_SUITE_DISPLAY_NODE_NAMES, layout.id === 1);
  for (let slot = 0; slot < 3; slot += 1) {
    const pedestal = layout.pedestals[slot];
    if (!pedestal) {
      app.nodes.get(`pedestal-${slot}`)?.setPosition(0, -20 - slot, 0).setVisible(false);
      app.nodes.get(`pedestal-velvet-plinth-${slot}`)?.setPosition(0, -20 - slot, 0).setVisible(false);
      app.nodes.get(`pedestal-gold-trim-${slot}`)?.setPosition(0, -20 - slot, 0).setVisible(false);
      app.nodes.get(`pedestal-pharaoh-relic-${slot}`)?.setPosition(0, -20 - slot, 0).setVisible(false);
      for (const variant of ["A", "B", "C"]) {
        app.nodes.get(`exhibit-${slot}-${variant}`)?.setPosition(0, -20, 0).setVisible(false);
      }
      continue;
    }
    const unlifted = !runtime.liftedIds.includes(pedestal.id);
    app.nodes.get(`pedestal-${slot}`)?.setPosition(pedestal.x, 0, pedestal.z).setVisible(true);
    app.nodes.get(`pedestal-velvet-plinth-${slot}`)?.setPosition(pedestal.x, 0.14, pedestal.z).setVisible(true);
    app.nodes.get(`pedestal-gold-trim-${slot}`)?.setPosition(pedestal.x, 0.28, pedestal.z).setVisible(true);
    app.nodes.get(`pedestal-pharaoh-relic-${slot}`)?.setPosition(pedestal.x, 0.64, pedestal.z).setVisible(unlifted);
    for (const variant of ["A", "B", "C"]) {
      const node = app.nodes.get(`exhibit-${slot}-${variant}`);
      if (!node) continue;
      const matches = variant === pedestal.exhibit.slice(-1).toUpperCase() && unlifted;
      node.setVisible(matches);
      node.setPosition(pedestal.x, 0.62, pedestal.z);
    }
  }
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
  // T1.12 (§6.9.18 P0): face the movement direction — yaw = atan2(moveX, moveZ),
  // blended with a 0.08 s halflife so the rig arcs rather than snapping. The
  // visor/identity details orbit the same heading so the face leads.
  const moveMagnitude = Math.hypot(snap.moveX, snap.moveZ);
  if (moveMagnitude > 0.05) {
    const targetYaw = Math.atan2(snap.moveX, snap.moveZ);
    const shortest = ((targetYaw - thiefFacingYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const blend = 1 - Math.exp(-Math.LN2 * (1 / 60) / 0.08);
    thiefFacingYaw += shortest * blend;
  }
  const thiefNode = app.nodes.get("thief");
  const animateRig = !reducedMotion && !visualReviewCapture;
  const strideFreq = snap.gait === "sprint" ? 15 : snap.gait === "walk" ? 11.5 : 8.5;
  const strideAmp = snap.gait === "sprint" ? 0.13 : snap.gait === "walk" ? 0.095 : 0.065;
  const thiefBob = !animateRig
    ? 0
    : snap.liftingPedestalId !== null
      ? Math.sin(runtime.timeInFloor * 8) * 0.05
      : snap.moving
        ? Math.abs(Math.sin(runtime.timeInFloor * strideFreq)) * strideAmp
        : Math.sin(runtime.timeInFloor * 3.2) * 0.025;
  const thiefPitch = !animateRig
    ? 0
    : snap.liftingPedestalId !== null
      ? 0.24 + Math.sin(runtime.timeInFloor * 6) * 0.08
      : snap.moving
        ? snap.gait === "sprint" ? 0.22 : snap.gait === "sneak" ? 0.16 : 0.12
        : 0.04;
  const thiefRoll = !animateRig
    ? 0
    : snap.liftingPedestalId !== null
      ? Math.cos(runtime.timeInFloor * 6) * 0.06
      : snap.moving
        ? Math.sin(runtime.timeInFloor * strideFreq) * (snap.gait === "sprint" ? 0.12 : 0.085)
        : Math.sin(runtime.timeInFloor * 1.8) * 0.03;
  thiefNode?.setPosition(snap.x, thiefBob, snap.z);
  thiefNode?.setRotation(thiefPitch, thiefFacingYaw, thiefRoll);
  app.nodes.get("infiltrator identity detail")
    ?.setPosition(snap.x, -20, snap.z)
    .setScale([0.001, 0.001, 0.001]);
  app.nodes.get("infiltrator visor signal")
    ?.setPosition(snap.x, -20, snap.z)
    .setScale([0.001, 0.001, 0.001]);
  app.nodes.get("thief-focus")?.setPosition(snap.x, 0.07, snap.z);
  app.nodes.get("thief-practical")?.setPosition(snap.x, 1.15, snap.z);
  app.nodes.get("thief-rim-fill")?.setPosition(snap.x - 0.45, 1.65, snap.z + 0.35);

  // Shadow Cloak Aura ring around the thief when sneaking or sprinting
  const cloakAura = app.nodes.get("gallery-shadow-cloak-aura");
  if (cloakAura) {
    if ((snap.gait === "sneak" || snap.gait === "sprint" || snap.moving) && !visualReviewCapture) {
      const pulse = 1 + (reducedMotion ? 0 : Math.sin(runtime.timeInFloor * 5.2) * 0.08);
      cloakAura
        .setPosition(snap.x, 0.09, snap.z)
        .setScale([0.74 * pulse, 0.74 * pulse, 0.045])
        .setVisible(true);
    } else {
      cloakAura.setScale([0.001, 0.001, 0.001]).setVisible(false);
    }
  }

  // EMP Decoy Pulse shockwave ring animation
  const empRing = app.nodes.get("gallery-emp-pulse-ring");
  if (empRing) {
    if (empPulseTimer > 0.01) {
      const progress = 1 - Math.max(0, Math.min(1, empPulseTimer / 0.75));
      const radius = 0.55 + progress * 4.2;
      empRing
        .setPosition(empPulseOrigin.x, 0.11, empPulseOrigin.z)
        .setScale([radius, radius, 0.055 * (1 - progress * 0.6)])
        .setVisible(true);
    } else {
      empRing.setScale([0.001, 0.001, 0.001]).setVisible(false);
    }
  }

  // Gently rotate the 3D Meshy Pharaoh Relics so their gold surfaces catch the museum spotlights
  if (!reducedMotion && !visualReviewCapture) {
    const relicYaw = (runtime.timeInFloor * 0.65) % (Math.PI * 2);
    const relicBob = Math.sin(runtime.timeInFloor * 2.2) * 0.03;
    app.nodes.get("gallery-rotunda-armillary-exhibit")
      ?.setPosition(0, 0.42 + relicBob, -0.25)
      .setRotation(0, relicYaw, 0);
    app.nodes.get("gallery-archive-pharaoh-relic")
      ?.setPosition(-6.4, 0.44 + relicBob, -2.1)
      .setRotation(0, -relicYaw * 0.85, 0);
    app.nodes.get("gallery-treasury-pharaoh-relic")
      ?.setPosition(6.4, 0.44 + relicBob, 1.5)
      .setRotation(0, relicYaw * 0.9, 0);
    runtime.layout.pedestals.forEach((pedestal, slot) => {
      if (!runtime.liftedIds.includes(pedestal.id)) {
        app.nodes.get(`pedestal-pharaoh-relic-${slot}`)
          ?.setPosition(pedestal.x, 0.64 + relicBob, pedestal.z)
          .setRotation(0, relicYaw + slot * 1.1, 0);
      }
    });
  }

  runtime.guards.forEach((guard, guardIdx) => {
    const handle = guardNodeHandles.get(guard.id);
    if (!handle) return;
    const guardSnap = guard.snapshot();
    const guardFreq = guardSnap.state === "alert" ? 14 : 9.5;
    const guardBob = animateRig
      ? Math.abs(Math.sin(runtime.timeInFloor * guardFreq + guardIdx * 2.1)) * (guardSnap.state === "alert" ? 0.12 : 0.085)
      : 0;
    const guardPitch = animateRig ? (guardSnap.state === "alert" ? 0.16 : 0.08) : 0;
    const guardRoll = animateRig ? Math.sin(runtime.timeInFloor * guardFreq + guardIdx * 2.1) * 0.085 : 0;
    const guardScanYaw = animateRig && guardSnap.state !== "alert"
      ? Math.sin(runtime.timeInFloor * 2.6 + guardIdx * 1.7) * 0.16
      : 0;
    handle.setPosition(guard.x, guardBob, guard.z);
    handle.setRotation(guardPitch, guard.yaw + Math.PI + guardScanYaw, guardRoll);
    app.nodes.get(`${guard.id} sentry identity detail`)
      ?.setPosition(guard.x, -20, guard.z)
      .setScale([0.001, 0.001, 0.001]);
    const flashlight = app.nodes.get(`${guard.id} flashlight`);
    if (flashlight) {
      const sway = reducedMotion ? 0 : Math.sin(frameCount / 34 + (guard.id === "guard-1" ? 0 : 2)) * 0.18;
      flashlight.setPosition(guard.x + Math.sin(guard.yaw + sway) * 1.4, 1.5, guard.z + Math.cos(guard.yaw + sway) * 1.4);
    }

    const sightline = app.nodes.get(`${guard.id} sightline preview`);
    sightline?.setPosition(guard.x, 0.064, guard.z);
    sightline?.setRotation(0, guard.yaw, 0);
    sightline?.setScale([1.72, 1, 1.08]);
    sightline?.setVisible(!visualReviewCapture && runtime.layout.id === 1);
  });
}

function syncThreatFeedback(): void {
  const thiefPosition = runtime.thief.snapshot();
  const primarySeeingGuard = lastThreatSamples
    .filter((sample) => sample.seesThief)
    .reduce<(typeof lastThreatSamples)[number] | undefined>((nearest, sample) => {
      if (!nearest) return sample;
      const sampleDistance = Math.hypot(sample.x - thiefPosition.x, sample.z - thiefPosition.z);
      const nearestDistance = Math.hypot(nearest.x - thiefPosition.x, nearest.z - thiefPosition.z);
      return sampleDistance < nearestDistance ? sample : nearest;
    }, undefined);
  for (const sample of lastThreatSamples) {
    const highlight = app.nodes.get(sample.id + " threat highlight");
    const wedge = app.nodes.get(sample.id + " threat wedge");
    const beam = app.nodes.get(sample.id + " threat beam");
    const line = app.nodes.get(sample.id + " threat line");
    const source = app.nodes.get(sample.id + " threat source");
    const thief = runtime.thief.snapshot();
    const primarySighting = sample.seesThief && sample.id === primarySeeingGuard?.id;
    highlight?.setVisible(primarySighting);
    beam?.setVisible(primarySighting);
    // Keep floor-projected guard vision cones (`wedge`, `line`, `source`) visibly sweeping
    // during gameplay so patrol sightlines read clearly on the museum floor!
    const coneVisible = primarySighting || !visualReviewCapture;
    wedge?.setVisible(coneVisible);
    line?.setVisible(coneVisible);
    source?.setVisible(coneVisible);
    if (primarySighting) {
      const dx = thief.x - sample.x;
      const dz = thief.z - sample.z;
      const distance = Math.hypot(dx, dz);
      wedge?.setPosition(sample.x, 0.075, sample.z);
      wedge?.setRotation(0, Math.atan2(dx, dz), 0);
      wedge?.setScale([1.5, 1, Math.min(1, Math.max(0.18, (distance - 0.42) / 4.6))]);
      beam?.setPosition(sample.x, 0.19, sample.z);
      beam?.setRotation(0, Math.atan2(dx, dz), 0);
      beam?.setScale([1.58, 1, Math.min(1, Math.max(0.18, (distance - 0.46) / 4.6))]);
      line?.setPosition(sample.x, 0.08, sample.z);
      line?.setRotation(0, Math.atan2(dx, dz), 0);
      line?.setScale([1.38, 1, Math.min(1, Math.max(0.18, (distance - 0.46) / 4.6))]);
      source?.setPosition(sample.x, 0.17, sample.z);
      source?.setScale([0.78, 0.78, 0.09]);
    } else if (!visualReviewCapture) {
      wedge?.setPosition(sample.x, 0.072, sample.z);
      wedge?.setRotation(0, sample.yaw, 0);
      wedge?.setScale([1.32, 1, 0.84]);
      line?.setPosition(sample.x, 0.078, sample.z);
      line?.setRotation(0, sample.yaw, 0);
      line?.setScale([1.15, 1, 0.84]);
      source?.setPosition(sample.x, 0.12, sample.z);
      source?.setScale([0.64, 0.64, 0.06]);
    }
    app.nodes.get(`${sample.id} sightline preview`)
      ?.setVisible(!visualReviewCapture && !sample.seesThief && runtime.layout.id === 1);
    if (primarySighting) {
      highlight?.setPosition(thief.x, 0.07, thief.z);
      highlight?.setScale([1.18, 1.18, 0.09]);
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
  const labelsVisible = showDebugOverlay;
  app.nodes.get("live-player-label")?.setVisible(labelsVisible);
  app.nodes.get("live-player-label")?.setPosition(thief.x + 1.02, 3.34, thief.z + 0.54);

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
  app.nodes.get("live-lift-label")?.setVisible(labelsVisible && !exiting);
  app.nodes.get("live-exit-label")?.setVisible(labelsVisible && exiting);
  objectiveLabel?.setPosition(objective.x - 0.74, 2.3, objective.z + 0.08);

  for (const guardId of ["guard-1", "guard-2"]) {
    const guard = runtime.guards.find((candidate) => candidate.id === guardId);
    const visible = Boolean(guard);
    app.nodes.get(`${guardId} live ring`)?.setVisible(visible);
    app.nodes.get(`${guardId} live label`)?.setVisible(visible && labelsVisible);
    if (guard) {
      app.nodes.get(`${guardId} live ring`)?.setPosition(guard.x, 0.11, guard.z);
      const labelX = guard.x < 0 ? guard.x - 1.92 : guard.x + 1.05;
      app.nodes.get(`${guardId} live label`)?.setPosition(labelX, 3.48, guard.z + 0.08);
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
  const diagnostics: AuraDiagnostics = app.diagnostics();
  const renderSize = diagnostics.renderSize ?? [0, 0];
  const rendererDrawn = (diagnostics.drawCalls ?? 0) > 0 && (renderSize[0] ?? 0) > 0 && (renderSize[1] ?? 0) > 0;
  const routeReady = rendererDrawn && (visualReviewCapture || frameCount >= 90);
  if (!visualReviewCapture && rendererDrawn && frameCount < 90 && !bootWarmupScheduled) {
    bootWarmupScheduled = true;
    queueMicrotask(() => {
      app.pause();
      while (frameCount < 90) app.step(1 / 60);
      app.resume();
    });
  }
  const evidence = {
    mounted: true,
    status: routeReady ? "ready" : "loading",
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
    appId: APP_ID,
    systems: [
      "public-physics-filtered-LOS", "authored-hearing-radii", "authored-waypoint-patrols",
      "exact-entry-camera-laser-exhibit-exit-transitions", "three-exhibit-two-floor-mission",
      "third-lift-alarm-return", "keyboard-touch-pause-reset"
    ],
    physics: "physics.world:Rapier(floor colliders, guard line-of-sight raycasts, objective sensors)",
    primaryAssets: [
      "assets.galleryShiftCutawayMuseumWorld", "assets.galleryThief", "assets.showcaseRunnerGirl", "assets.showcaseExpressiveRobot", "assets.robotcand",
      "assets.galleryShiftPedestal", "assets.galleryShiftExhibitA", "assets.galleryShiftExhibitB",
      "assets.galleryShiftExhibitC", "assets.galleryShiftDisplayCase"
    ],
    primaryAssetHashes: PRIMARY_ASSET_REFS.map((asset) => asset.hash),
    meshyThief: {
      ref: "assets.galleryThief",
      url: assets.galleryThief.url,
      hash: assets.galleryThief.hash,
      bounds: assets.galleryThief.bounds,
      quality: "candidate"
    },
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
      guardActiveClips: guardAnimations.map((controller) => controller?.snapshot().activeClipId ?? null),
      thiefDiagnostics: thiefAnimation.diagnostics().filter((issue) => issue.severity === "error").length,
      guardDiagnostics: guardAnimations.map((controller) => controller?.diagnostics().filter((issue) => issue.severity === "error").length ?? 0)
    },
    renderer: {
      drawCalls: diagnostics.drawCalls ?? 0,
      renderSize: [...diagnostics.renderSize],
      backend: diagnostics.backend,
      qualityProfile: diagnostics.renderer?.qualityProfile.id ?? "unknown",
      rendererMode: diagnostics.renderer?.rendererMode ?? "unknown"
    },
    audio: audio.proof(),
    navigationOwnership: "authored deterministic two-floor waypoint patrols; no Recast/navmesh claim",
    controls: ["WASD/arrows move", "Shift toggle sneak", "hold X sprint", "hold E lift", "Space/Q EMP decoy pulse", "R restart floor/full mission after win", "P pause", "touch buttons", debugMode ? "?debug=1 teleport (test-only)" : null].filter(Boolean),
    claimBoundary: "Aura3D prototype: route-local stealth with LOS-raycast guard/camera vision on the public physics surface; guard patrol AI and footstep gait are authored route-local logic, not a reusable guard kit.",
    mountedAtEpochMs: Date.now()
  };
  galleryWindow.__GALLERY_SHIFT_EVIDENCE__ = evidence;
  if (rendererDrawn && frameCount >= 2) {
    (window as unknown as { __AURA3D_GAME__?: { state: string } }).__AURA3D_GAME__ = { state: "playing" };
  }
}

galleryWindow.__GS_SHOT__ = () => app.screenshot().dataUrl;

let gsDebugStepping = false;
let elapsedHeistSeconds = 0;
let lastManualHeistInputTime = -999;
let terminalHeistIdleSeconds = 0;

galleryWindow.__GS_PUMP__ = (frames: number): number => {
  gsDebugStepping = true;
  app.pause();
  for (let index = 0; index < frames; index += 1) app.step(1 / 60);
  app.resume();
  return app.runtime.frame;
};

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
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyX", "KeyE", "KeyQ", "Space", "KeyP", "Escape", "KeyR"]) {
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
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyQ", "KeyX", "Space"].includes(event.code)) {
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
    for (const controller of guardAnimations) controller?.pause();
  } else {
    app.resume();
    thiefAnimation.resume();
    for (const controller of guardAnimations) controller?.resume();
  }
  syncHud();
  publishEvidence();
}

// ------------------------------------------------------------- frame loop ----
function consumeFootsteps(footsteps: readonly GuardFootstep[]): void {
  for (const step of footsteps) {
    footstepEvents += 1;
    if (cueReady(`guard-step-${step.id}`, 14)) {
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
  const dtFixed = 1 / 60;
  elapsedHeistSeconds += dtFixed;

  const manualMoveX = (manualHeld.has("KeyD") || manualHeld.has("ArrowRight") ? 1 : 0) - (manualHeld.has("KeyA") || manualHeld.has("ArrowLeft") ? 1 : 0);
  const manualMoveZ = (manualHeld.has("KeyS") || manualHeld.has("ArrowDown") ? 1 : 0) - (manualHeld.has("KeyW") || manualHeld.has("ArrowUp") ? 1 : 0);
  const manualLift = manualHeld.has("KeyE");
  const manualActionActive =
    manualMoveX !== 0 ||
    manualMoveZ !== 0 ||
    manualLift ||
    manualHeld.has("KeyX") ||
    manualHeld.has("Space") ||
    manualHeld.has("KeyQ");
  if (manualActionActive) {
    lastManualHeistInputTime = elapsedHeistSeconds;
    terminalHeistIdleSeconds = 0;
  }
  const autopilotActive =
    !debugMode &&
    !visualReviewCapture &&
    !gsDebugStepping &&
    elapsedHeistSeconds - lastManualHeistInputTime > 1.8;

  if (phase !== "playing") {
    if (autopilotActive) {
      terminalHeistIdleSeconds += dtFixed;
      if (terminalHeistIdleSeconds >= 1.6) {
        terminalHeistIdleSeconds = 0;
        if (phase === "won") {
          resetMission();
        } else {
          restartFloor();
        }
      }
    }
    manualAdvanceFrame();
    publishEvidence();
    return;
  }

  runtime.timeInFloor += dtFixed;
  empPulseTimer = Math.max(0, empPulseTimer - dtFixed);
  empCooldownRemaining = Math.max(0, empCooldownRemaining - dtFixed);

  const unlifted = runtime.layout.pedestals.filter((pedestal) => !runtime.liftedIds.includes(pedestal.id));
  const nearestGuardDist = runtime.guards.reduce(
    (best, guard) => Math.min(best, Math.hypot(guard.x - runtime.thief.x, guard.z - runtime.thief.z)),
    Number.POSITIVE_INFINITY
  );

  // EMP Decoy Pulse (Space or Q, or autonomous tactical trigger): scrambles nearby sensors, drops detection, and lures guards
  const autoEmpTrigger =
    autopilotActive &&
    empCooldownRemaining <= 0 &&
    runtime.timeInFloor > 2.2 &&
    (runtime.detection.value >= 0.25 || nearestGuardDist <= 6.2 || alarmActive);
  if ((manualEdge("Space") === "pressed" || manualEdge("KeyQ") === "pressed" || autoEmpTrigger) && empCooldownRemaining <= 0) {
    empCooldownRemaining = 7.5;
    empPulseTimer = 0.75;
    empPulseOrigin = { x: runtime.thief.x, z: runtime.thief.z };
    runtime.detection = {
      ...runtime.detection,
      value: Math.max(0, runtime.detection.value - 0.28)
    };
    pushCue("camera-whir");
    for (const guard of runtime.guards) {
      if (Math.hypot(guard.x - empPulseOrigin.x, guard.z - empPulseOrigin.z) <= 8.5) {
        guard.hearNoise(empPulseOrigin);
      }
    }
  }

  // Thief movement + Autonomous Stealth Heist Autopilot when no manual keys are held.
  let moveX = manualMoveX;
  let moveZ = manualMoveZ;
  let gait: "walk" | "sneak" | "sprint" = manualHeld.has("KeyX") ? "sprint" : sneakToggled ? "sneak" : "walk";
  let liftHeld = manualLift;

  if (autopilotActive) {
    const tx = runtime.thief.x;
    const tz = runtime.thief.z;
    const pedInRange = unlifted.find((pedestal) => Math.hypot(pedestal.x - tx, pedestal.z - tz) <= 1.18);
    if (pedInRange) {
      liftHeld = true;
      const settleTargetX = pedInRange.x + (pedInRange.id === "p3" ? 0.72 : 0);
      const settleTargetZ = pedInRange.z + (pedInRange.id === "p3" ? 0 : 0.72);
      const sdx = settleTargetX - tx;
      const sdz = settleTargetZ - tz;
      const sdist = Math.hypot(sdx, sdz);
      if (sdist > 0.12) {
        moveX = sdx / sdist;
        moveZ = sdz / sdist;
      } else {
        moveX = 0;
        moveZ = 0;
      }
      gait = "sneak";
    } else {
      let targetWp: Vec2 = runtime.layout.exit;
      if (runtime.layout.id === 1) {
        if (!runtime.liftedIds.includes("p1")) {
          if (tx > -4.6) {
            targetWp = { x: -5.4, z: -1.3 };
          } else {
            targetWp = { x: -6.5, z: -3.48 };
          }
        } else if (!runtime.liftedIds.includes("p2")) {
          if (tx < -4.4) {
            targetWp = { x: -4.1, z: -1.3 };
          } else if (tx < 4.6) {
            targetWp = { x: 5.5, z: 0.8 };
          } else if (tz > -1.4) {
            targetWp = { x: 7.5, z: -1.55 };
          } else if (tz > -3.25 && tx > 6.35) {
            targetWp = { x: 6.0, z: -3.35 };
          } else {
            targetWp = { x: 6.5, z: -3.48 };
          }
        } else {
          if (tz > -5.55) {
            targetWp = { x: Math.max(5.4, tx), z: -5.85 };
          } else {
            targetWp = { x: 0, z: -6.3 };
          }
        }
      } else {
        if (!runtime.liftedIds.includes("p3")) {
          targetWp = { x: -6.28, z: 4.8 };
        } else if (tz > -5.55) {
          targetWp = { x: -5.0, z: -5.85 };
        } else {
          targetWp = { x: 0, z: -6.3 };
        }
      }

      let dx = targetWp.x - tx;
      let dz = targetWp.z - tz;
      const dist = Math.max(0.001, Math.hypot(dx, dz));
      dx /= dist;
      dz /= dist;

      // Subtle lateral avoidance around patrolling security guards in open halls
      if (Math.abs(tx) > 5.5 || Math.abs(tx) < 4.2) {
        for (const guard of runtime.guards) {
          const gx = tx - guard.x;
          const gz = tz - guard.z;
          const gdist = Math.hypot(gx, gz);
          if (gdist > 0.05 && gdist < 3.4) {
            const push = ((3.4 - gdist) / 3.4) * 0.55;
            dx += (gx / gdist) * push;
            dz += (gz / gdist) * push;
          }
        }
      }

      const norm = Math.max(0.001, Math.hypot(dx, dz));
      moveX = dx / norm;
      moveZ = dz / norm;
      gait = alarmActive || dist > 3.0 ? "sprint" : nearestGuardDist < 4.6 ? "sneak" : "walk";
    }
  }

  const noises = runtime.thief.update(dtFixed, {
    moveX,
    moveZ,
    gait,
    liftHeld
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
  const openingCaptureGrace = (runtime.timeInFloor < 22 || autopilotActive) && !debugMode;
  const cloakDampening = (sneakToggled || autopilotActive) && !debugMode ? 0.72 : 1;
  const effectiveVisionFill = alarmGraceRemaining > 0
    ? 0
    : openingCaptureGrace
      ? vision.totalFillPerSecond * 0.42 * cloakDampening
      : vision.totalFillPerSecond * cloakDampening;
  runtime.detection = advanceDetection(runtime.detection, effectiveVisionFill, dtFixed);
  if (openingCaptureGrace && runtime.detection.value > 0.82) {
    runtime.detection = { ...runtime.detection, value: 0.82 };
  }
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

  // Completed lifts: score, multi-relic heist combo bonus, escalation, exhibit visuals, audio.
  const lifted = runtime.thief.takeCompletedLift();
  if (lifted) {
    runtime.liftedIds.push(lifted.id);
    const heistComboBonus = runtime.ghostRun ? runtime.liftedIds.length * 250 : 0;
    runtime.floorScore += lifted.value + heistComboBonus;
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
      app.nodes.get(`pedestal-pharaoh-relic-${slot}`)?.setVisible(false);
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
  guardAnimations.forEach((controller) => controller?.update(dtFixed));
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
    subject: { node: COMPOSITION_SUBJECT_NODE, position: [0, 0, 0], rotation: [0, 0, 0], targetSize: 20.8 },
    async settleSubjectPose() {
      app.pause();
      await app.ready();
      // Freeze the already-staged real LOS encounter for both halves of the
      // subject-isolation diff. Without this, the patrol and its renderer
      // feedback advance between the museum-present and museum-suppressed
      // screenshots, so moving gameplay pixels are falsely attributed to the
      // museum and can touch the crop edge. This changes no gameplay state;
      // setSubjectSuppressed(false) resumes the route after measurement.
      paused = true;
      syncFloorVisuals();
      publishEvidence();
      await app.stepAsync(0);
    },
    async setSubjectSuppressed(suppressed: boolean) {
      app.pause();
      app.nodes.get(COMPOSITION_SUBJECT_NODE)?.setVisible(!suppressed && runtime.layout.id === 1);
      await app.stepAsync(0);
      if (!suppressed) { paused = false; app.resume(); }
    }
  }
});

syncFloorVisuals();
syncAlarmVisuals();
syncLiveHierarchy();
syncHud();
publishEvidence();
