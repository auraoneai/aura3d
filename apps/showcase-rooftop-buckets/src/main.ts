/**
 * Rooftop Buckets — sports-ballistic charge–release precision against a composed rim collider.
 */
import {
  createGameApp,
  scene,
  camera,
  lights,
  primitives,
  material,
  model,
  game,
  effects,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  COURT_SPOTS,
  COURT_BOUNDS,
  HOOP_BASE_POSITION,
  BACKBOARD_POSITION,
  type ShotSpot
} from "./court";
import {
  initialHoopState,
  updateHoop,
  type HoopState
} from "./rim";
import {
  createBallAtSpot,
  calculateLaunchVelocity,
  predictFirstFlight,
  stepBall,
  type BallState
} from "./shot";
import {
  initialScoreState,
  advanceHeat,
  heatConfig,
  recordShotOutcome,
  updateClocks,
  type GameScoreState
} from "./scoring";
import { createRooftopDressing } from "./environment";
import { BucketsAudioController } from "./buckets-audio";

const visualReviewCapture =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("capture") === "review";
if (typeof document !== "undefined") document.body.dataset.capture = visualReviewCapture ? "review" : "default";

export interface RooftopBucketsEvidence {
  status: string;
  mounted: boolean;
  heat: number;
  state: string;
  currentSpotId: number;
  score: number;
  target: number;
  streak: number;
  onFire: boolean;
  possession: number;
  makes: number;
  misses: number;
  shotClockMs: number;
  heatTimerMs: number;
  lastShotResult: string | null;
  goldBall: boolean;
  goldAttempted: boolean;
  goldMade: boolean;
  madeSpotIds: readonly number[];
  fireAchieved: boolean;
  aimPitch: number;
  chargePower: number;
  charging: boolean;
  ballInFlight: boolean;
  reducedMotion: boolean;
  hoopMode: string;
  defenderTelegraph: string;
  shooterAnimation: string;
  defenderAnimation: string;
  shooterMotionPhase: string;
  defenderMotionPhase: string;
  shooterBodyCompression: number;
  defenderReach: number;
  contactFxKind: string;
  contactFxActive: boolean;
  contestReactionActive: boolean;
  shooterClips: readonly string[];
  defenderClips: readonly string[];
  contestAimOffset: number;
  sensorEventCount: number;
  physicsBodyCount: number;
  simulationOwner: string;
  predictionPointCount: number;
  primaryAssets: readonly string[];
  systems: Readonly<Record<string, string>>;
  controls: readonly string[];
  claimBoundary: string;
  renderer: { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly backend: string };
  audioCues: readonly string[];
  ballPos?: { x: number; y: number; z: number };
  hoopPos?: { x: number; y: number; z: number };
}

const APP_ID = "showcase-rooftop-buckets";
const ROUTE_SYSTEMS = {
  flight: "route-local deterministic authored ballistic integrator shared by preview and actual first flight",
  scoring: "route-local five-heat objective, sensor-sequence, streak, gold, clock, and shot-lock rules",
  contest: "visible deterministic defender telegraph creates a documented pre-launch aim offset",
  presentation: "typed court, backboard, rim, ball, and defender with renderer-owned trajectory markers",
  audio: "typed synthesized cues driven by charge, contact, score, heat, fire, gold, and buzzer events"
} as const;
const ROUTE_CONTROLS = ["A/D change spot", "W/S aim arc", "hold/release Space shoot", "P pause", "R reset", "touch aim/spot/shoot/pause/reset"] as const;

// ---------------- Game State ----------------
const audio = new BucketsAudioController();

let scoreState: GameScoreState = initialScoreState(1);
let currentSpotIndex = 0;
let hoopState: HoopState = initialHoopState(1);

function isCurrentPossessionGold(possession: number): boolean {
  void possession;
  return scoreState.heat === 5;
}

let ballState: BallState = createBallAtSpot(
  COURT_SPOTS[currentSpotIndex]!,
  isCurrentPossessionGold(scoreState.possession)
);

let aimPitch = 0.0; // [-1.0, 1.0]
let chargePower = 0.0;
let isCharging = false;
let chargeDirection = 1;
let sensorEventCount = 0;
let elapsedPlayTime = 0;
let chargeTickAccumulator = 0;
let touchAimDirection = 0;
let touchShootHeld = false;
let shooterAnimationState = "bind";
let defenderAnimationState = "hidden";
let shooterMotionPhase = "ready";
let defenderMotionPhase = "hidden";
let shooterBodyCompression = 0;
let defenderReach = 0;
let contactFxTimer = 0;
let contactFxKind: "none" | "rim" | "board" | "swish" | "block" = "none";
let contactFxPosition = { x: 0, y: -20, z: 0 };
let contestReactionActive = false;

// ---------------- DOM Elements ----------------
const elHeatBadge = document.getElementById("rb-heat-badge")!;
const elFireBadge = document.getElementById("rb-fire-badge")!;
const elScoreVal = document.getElementById("rb-score-val")!;
const elTargetVal = document.getElementById("rb-target-val")!;
const elStreakVal = document.getElementById("rb-streak-val")!;
const elHeatTimer = document.getElementById("rb-heat-timer")!;
const elSpotDesc = document.getElementById("rb-spot-desc")!;
const elShotType = document.getElementById("rb-shot-type")!;
const elSweetZone = document.getElementById("rb-sweet-zone")!;
const elMeterFill = document.getElementById("rb-meter-fill")!;
const elLastResult = document.getElementById("rb-last-result")!;
const elShotClock = document.getElementById("rb-shot-clock")!;
const elModal = document.getElementById("rb-modal")!;
const elModalTitle = document.getElementById("rb-modal-title")!;
const elModalDesc = document.getElementById("rb-modal-desc")!;
const elModalBtn = document.getElementById("rb-modal-btn")!;

elModalBtn.addEventListener("click", () => {
  if (scoreState.state === "heat-cleared") {
    scoreState = advanceHeat(scoreState);
    currentSpotIndex = scoreState.heat === 2 ? 0 : currentSpotIndex;
    hoopState = initialHoopState(scoreState.heat);
    audio.playCue("heatAdvance", 0.9);
    resetBallToSpot();
    updateHUD();
  } else if (scoreState.state === "game-over" || scoreState.state === "victory") {
    fullReset();
  }
  elModal.classList.add("hidden");
});

// ---------------- Runtime Nodes & Scene ----------------
const ballHandle = game.runtimeNode("ball-hero", { tags: ["basketball"] });
const rimHandle = game.runtimeNode("rim-assembly", { tags: ["hoop-rim"] });
const backboardHandle = game.runtimeNode("backboard-assembly", { tags: ["backboard"] });
const defenderHandle = game.runtimeNode("defender-cutout", { tags: ["defender"] });
const shooterHandle = game.runtimeNode("shooter-player", { tags: ["shooter", "primary-character"] });
const fireHaloHandle = game.runtimeNode("fire-halo", { tags: ["outcome-feedback", "fire"] });
const outcomeHaloHandle = game.runtimeNode("outcome-halo", { tags: ["outcome-feedback", "result"] });
const flightHaloHandle = game.runtimeNode("flight-halo", { tags: ["basketball", "flight-feedback"] });
const flightEchoHandles = [1, 2].map((index) => game.runtimeNode(`flight-echo-${index}`, { tags: ["basketball", "velocity-feedback"] }));
const contactBurstHandle = game.runtimeNode("contact-burst", { tags: ["contact-feedback", "renderer-owned"] });
const CONTACT_RAY_COUNT = 8;
const contactRayHandles = Array.from({ length: CONTACT_RAY_COUNT }, (_, index) =>
  game.runtimeNode(`contact-ray-${index}`, { tags: ["contact-feedback", "renderer-owned", "event-driven"] })
);
const RELEASE_RAY_COUNT = 6;
const releaseRayHandles = Array.from({ length: RELEASE_RAY_COUNT }, (_, index) =>
  game.runtimeNode(`release-ray-${index}`, { tags: ["release-feedback", "renderer-owned", "flight-driven"] })
);
const contestLinkHandle = game.runtimeNode("contest-reach-link", { tags: ["contest-feedback", "renderer-owned", "ball-driven"] });
const contestReactionHandles = [0, 1].map((index) =>
  game.runtimeNode(`contest-reaction-${index}`, { tags: ["contest-feedback", "renderer-owned", "telegraph-driven"] })
);
const AIM_POINT_COUNT = 25;
const AIM_SEGMENT_COUNT = AIM_POINT_COUNT - 1;
const aimMaterial = material.emissive({ name: "predicted-first-flight", color: "#38bdf8", emissive: "#0284c7" });
const flightMaterial = material.emissive({ name: "live-flight-guide", color: "#ffe08a", emissive: "#ff7a1a", emissiveIntensity: visualReviewCapture ? 2.0 : 1.4 });
const goldMaterial = material.emissive({ name: "gold-ball-live", color: "#fbbf24", emissive: "#d97706" });
const orangeMaterial = material.pbr({ name: "orange-ball-live", color: "#ea580c", roughness: 0.55, metallic: 0.05 });
const backboardMaterial = material.pbr({
  name: "rooftop tempered backboard",
  color: "#d7eef4",
  roughness: 0.2,
  metallic: 0.08,
  clearcoat: 0.72,
  opacity: 0.92
});
const rimMaterial = material.emissive({ name: "readable-rim", color: "#fb923c", emissive: "#ea580c" });
const fireHaloMaterial = material.emissive({ name: "fire-streak-halo", color: "#fbbf24", emissive: "#f97316" });
const victoryHaloMaterial = material.emissive({ name: "gold-victory-halo", color: "#fde68a", emissive: "#f59e0b" });
const failureHaloMaterial = material.emissive({ name: "buzzer-failure-halo", color: "#fb7185", emissive: "#e11d48" });
const netMaterial = material.emissive({ name: "rim net strands", color: "#dbeafe", emissive: "#93c5fd", emissiveIntensity: 0.56, opacity: 0.84 });
const contactShadowMaterial = material.pbr({ name: "player contact shadow", color: "#120f1f", roughness: 1, metallic: 0, opacity: 0.5 });
const pressureAuraMaterial = material.emissive({ name: "defender pressure floor ring", color: "#a21caf", emissive: "#f472d0", emissiveIntensity: 1.08, opacity: 0.68 });
const contactMakeMaterial = material.emissive({ name: "swish contact burst", color: "#fef08a", emissive: "#f97316", emissiveIntensity: 2.2, opacity: 0.82 });
const contactMissMaterial = material.emissive({ name: "miss contact burst", color: "#fda4af", emissive: "#e11d48", emissiveIntensity: 1.8, opacity: 0.76 });
const blockContactMaterial = material.emissive({ name: "defender block burst", color: "#f0abfc", emissive: "#c026d3", emissiveIntensity: 2.35, opacity: 0.88 });
const releaseBurstMaterial = material.emissive({ name: "ball release burst", color: "#fde68a", emissive: "#fb923c", emissiveIntensity: 2.15, opacity: 0.82 });
const contestReactionMaterial = material.emissive({ name: "live contest reaction", color: "#e879f9", emissive: "#a21caf", emissiveIntensity: 1.9, opacity: 0.76 });
const reviewCourtMaterial = material.pbr({
  name: "rooftop league sealed court",
  color: "#26324f",
  roughness: 0.5,
  metallic: 0.08,
  clearcoat: 0.42
});

function buildScene() {
  return scene()
    .background("#20183f")
    .addMany([
      // Atmospheric & Lighting Setup
      effects.fog({ name: "dusk haze", density: 0.005, color: "#24173f", intensity: 0.14 }),
      effects.neonBloom({ intensity: 0.34 }),
      // A restrained arena rig leaves real surface gradients on the court and
      // typed characters instead of flattening every material into emissive UI.
      lights.ambient({ color: "#8098c8", intensity: visualReviewCapture ? 0.72 : 1.32 }),
      lights.directional({ color: "#fff3d6", intensity: visualReviewCapture ? 2.75 : 3.6 }).position(8, 20, 10),
      lights.point({ name: "scorer warm key", color: "#ffd6a0", intensity: visualReviewCapture ? 4.15 : 4.4 }).position(-4.0, 4.6, 5.4),
      lights.point({ name: "defender cool rim", color: "#79dcff", intensity: visualReviewCapture ? 3.45 : 3.4 }).position(1.5, 4.4, 3.3),
      lights.point({ name: "hoop amber practical", color: "#ffad58", intensity: visualReviewCapture ? 2.55 : 3.4 }).position(0.8, 4.8, -0.1),
      lights.point({ name: "pavilion warm bay practical", color: "#ffd39a", intensity: visualReviewCapture ? 1.35 : 2.0 }).position(-4.4, 4.8, -4.8),
      lights.directional({ color: "#4aa8d8", intensity: visualReviewCapture ? 0.52 : 1.45 }).position(-12, 14, -8),
      lights.directional({ color: "#f59e0b", intensity: visualReviewCapture ? 1.05 : 1.2 }).position(0, 8, -20),

      // 10/10 Surrounding Skyscraper Skyline, Court Lines & Stanchion
      ...createRooftopDressing({ reviewCapture: visualReviewCapture }),

      model(assets.rooftopCourt, {
        name: "typed-rooftop-court",
        role: "primaryWorld",
        scaleMode: "world",
        receiveShadow: true,
        material: visualReviewCapture ? reviewCourtMaterial : undefined
      }).position(0, -0.1, 4),

      // Hoop Backboard
      model(assets.rooftopBackboard, {
        name: "hoop-backboard-mesh",
        role: "primaryWorld",
        scaleMode: "world",
        castShadow: true,
        receiveShadow: true
      })
        .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z)
        .runtime(backboardHandle),

      // Hoop Rim Ring
      model(assets.rooftopRim, {
        name: "hoop-rim-mesh",
        role: "primaryWorld",
        scaleMode: "world",
        castShadow: true
      })
        .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y, HOOP_BASE_POSITION.z)
        .runtime(rimHandle),
      // The authored venue owns the target box and open net assembly. Keep a
      // single lower gather ring here so the goal reads as one constructed
      // object rather than two overlapping sets of decorative strands.
      primitives.torus({ name: "rim net lower ring", material: netMaterial })
        .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y - 0.48, HOOP_BASE_POSITION.z)
        .rotate(-Math.PI / 2, 0, 0)
        .scale([0.19, 0.19, 0.024]),

      // Ball-free verified CC-BY number-24 layup scorer. Gameplay still owns
      // root motion and the separate typed route ball; this static authored
      // pose contributes athlete identity, not animation or ball authority.
      model(assets.rooftopLayupScorer, {
        name: "shooter-player-mesh",
        role: "primaryCharacter",
        castShadow: true,
        receiveShadow: true
      })
        .position(COURT_SPOTS[0]!.x, 0, COURT_SPOTS[0]!.z)
        .scale(visualReviewCapture ? [1.08, 1.08, 1.08] : [0.96, 0.96, 0.96])
        .runtime(shooterHandle),

      // Ball-free CC-BY adaptation of the same verified source. Its static high
      // reach reads as a contest while route-local telegraph/collision/root
      // transforms remain the only gameplay authority.
      model(assets.rooftopDefender, {
        name: "contest-defender-mesh",
        role: "primaryCharacter",
        castShadow: true,
        receiveShadow: true
      })
        .position(0, -10, 0) // Hidden initially
        .scale(visualReviewCapture ? [1.08, 1.08, 1.08] : [0.96, 0.96, 0.96])
        .runtime(defenderHandle),
      primitives.sphere({ name: "shooter contact shadow", material: contactShadowMaterial })
        .position(COURT_SPOTS[0]!.x, 0.026, COURT_SPOTS[0]!.z)
        .scale([0.7, 0.035, 0.38])
        .runtime(game.runtimeNode("shooter-contact-shadow", { tags: ["grounding"] })),
      primitives.sphere({ name: "defender contact shadow", material: contactShadowMaterial })
        .position(0, 0.026, 0)
        .scale([0.72, 0.035, 0.42])
        .runtime(game.runtimeNode("defender-contact-shadow", { tags: ["grounding"] })),
      primitives.torus({ name: "defender pressure aura", material: pressureAuraMaterial })
        .position(0, -20, 0)
        .rotate(-Math.PI / 2, 0, 0)
        .scale([0.78, 0.78, 0.045])
        .runtime(game.runtimeNode("defender-pressure-aura", { tags: ["pressure-feedback", "renderer-owned"] })),

      // Ball
      model(assets.rooftopBall, {
        name: "basketball-hero-mesh",
        role: "primaryCharacter",
        scaleMode: "world",
        castShadow: true
      })
        .position(ballState.x, ballState.y, ballState.z)
        // The generated sphere has unit diameter, so 0.24 is the authored
        // regulation-scale ball documented by this route.
        .scale(visualReviewCapture ? [0.31, 0.31, 0.31] : [0.24, 0.24, 0.24])
        .runtime(ballHandle),

      // Spot Markers on Court
      // Gameplay view retains selectable spots. The named action frame omits
      // them because the real athletes, ball, and flight ribbon already show
      // the active spot and the extra discs read as unrelated floor clutter.
      ...COURT_SPOTS.filter(() => !visualReviewCapture).map((s) =>
        primitives
          .cylinder({
            name: `spot-marker-${s.id}`,
            material: material.emissive({
              name: `spot-mat-${s.id}`,
              color: s.points === 3 ? "#f59e0b" : "#38bdf8",
              emissive: s.points === 3 ? "#b45309" : "#0284c7"
            })
          })
          .position(s.x, 0.05, s.z)
          .scale(visualReviewCapture ? [0.38, 0.018, 0.38] : [0.7, 0.02, 0.7])
      ),
      ...Array.from({ length: visualReviewCapture ? AIM_POINT_COUNT - 4 : AIM_POINT_COUNT }, (_, index) =>
        primitives.sphere({ name: `aim-point-${index}`, material: aimMaterial })
          .position(0, -20, 0)
          .scale(visualReviewCapture ? [0.145, 0.145, 0.145] : [0.095, 0.095, 0.095])
          .runtime(game.runtimeNode(`aim-point-${index}`, { tags: ["aim-guide", "bounded-first-flight"] }))
      ),
      // Closely connected renderer-owned segments turn the same bounded
      // first-flight samples into a readable shot ribbon. The samples remain
      // the source of truth; this is visual interpolation, not simulated motion.
      ...Array.from({ length: AIM_SEGMENT_COUNT }, (_, index) =>
        primitives.box({ name: `aim-segment-${index}`, material: flightMaterial })
          .position(0, -20, 0)
          .scale([0.055, 0.055, 0.001])
          .runtime(game.runtimeNode(`aim-segment-${index}`, { tags: ["aim-guide", "flight-ribbon"] }))
      ),
      // A small renderer-owned halo travels with the ball during a live shot;
      // it makes the authored flight state legible without faking motion in UI.
      primitives.torus({ name: "live ball flight halo", material: flightMaterial })
        .position(0, -20, 0)
        .rotate(-Math.PI / 2, 0, 0)
        .scale(visualReviewCapture ? [0.22, 0.22, 0.03] : [0.28, 0.28, 0.035])
        .runtime(flightHaloHandle),
      ...flightEchoHandles.map((handle, index) =>
        primitives.torus({ name: `ball velocity echo ${index + 1}`, material: flightMaterial })
          .position(0, -20, 0)
          .rotate(-Math.PI / 2, 0, 0)
          .scale([0.17 - index * 0.035, 0.17 - index * 0.035, 0.02])
          .runtime(handle)
      ),
      primitives.torus({ name: "rim contact burst", material: contactMakeMaterial })
        .position(0, -20, 0)
        .scale([0.64, 0.64, 0.05])
        .runtime(contactBurstHandle),
      // Event-driven scene effects. These nodes are hidden until the actual
      // route integrator reports a rim, board, swish, or defender contact.
      // Their origin is the live ball/contact position rather than a DOM cue.
      ...contactRayHandles.map((handle, index) =>
        primitives.box({ name: `contact impact ray ${index + 1}`, material: contactMakeMaterial })
          .position(0, -20, 0)
          .scale([0.24, 0.025, 0.025])
          .runtime(handle)
      ),
      // Release rays are keyed from the genuine first 0.38 seconds of the
      // route-owned flight and originate at the shooter release point.
      ...releaseRayHandles.map((handle, index) =>
        primitives.box({ name: `release energy ray ${index + 1}`, material: releaseBurstMaterial })
          .position(0, -20, 0)
          .scale([0.2, 0.02, 0.02])
          .runtime(handle)
      ),
      // A short 3D segment and concentric hand rings bind the visible contest
      // reaction to the live defender telegraph and real ball position.
      primitives.box({ name: "defender live reach link", material: contestReactionMaterial })
        .position(0, -20, 0)
        .scale([0.035, 0.035, 0.1])
        .runtime(contestLinkHandle),
      ...contestReactionHandles.map((handle, index) =>
        primitives.torus({ name: `defender reaction ring ${index + 1}`, material: contestReactionMaterial })
          .position(0, -20, 0)
          .scale([0.18 + index * 0.08, 0.18 + index * 0.08, 0.025])
          .runtime(handle)
      ),
      // Renderer-owned outcome language. DOM mirrors the state accessibly, but
      // these live scene nodes keep fire, success, and failure inside Aura3D.
      primitives.torus({ name: "fire streak backboard halo", material: fireHaloMaterial })
        .position(0, -20, 0)
        .scale([0.72, 0.72, 0.055])
        .runtime(fireHaloHandle),
      primitives.torus({ name: "terminal outcome backboard halo", material: victoryHaloMaterial })
        .position(0, -20, 0)
        .scale([1.05, 1.05, 0.075])
        .runtime(outcomeHaloHandle)
    ])
    .camera(
      camera.perspective({
        // The review lens is a sideline action camera: shooter, live arc,
        // airborne defender, and rim share one readable diagonal. It is close
        // enough for the verified athletes to read as characters while still
        // retaining court grounding and the complete ballistic chain.
        position: visualReviewCapture ? [5.55, 3.62, 7.55] : [0, 4.95, 10.55],
        target: visualReviewCapture ? [-0.52, 2.24, 1.32] : [0, 2.45, 1.1],
        fov: visualReviewCapture ? 41 : 47
      })
    );
}

// ---------------- Game App Mount ----------------
const gameApp = createGameApp("#canvas-host", {
  diagnostics: { overlay: false, performancePanel: false },
  input: {
    actions: {
      spotLeft: ["KeyA", "ArrowLeft"],
      spotRight: ["KeyD", "ArrowRight"],
      aimUp: ["KeyW", "ArrowUp"],
      aimDown: ["KeyS", "ArrowDown"],
      shoot: ["Space"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    bufferMs: 50,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene()
});

const app = gameApp.app;
const input = gameApp.input!;
audio.startAmbience();

function togglePause(): void {
  if (scoreState.state === "playing") scoreState = { ...scoreState, state: "paused" };
  else if (scoreState.state === "paused") scoreState = { ...scoreState, state: "playing" };
  updateHUD();
  publishEvidence();
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat && (event.code === "KeyP" || event.code === "Escape")) {
    event.preventDefault();
    togglePause();
  } else if (!event.repeat && (event.code === "KeyA" || event.code === "ArrowLeft")) {
    event.preventDefault();
    changeSpot(-1);
  } else if (!event.repeat && (event.code === "KeyD" || event.code === "ArrowRight")) {
    event.preventDefault();
    changeSpot(1);
  } else if (!event.repeat && event.code === "KeyR") {
    event.preventDefault();
    fullReset();
  }
});

function changeSpot(delta: number): void {
  if (ballState.inFlight || scoreState.state !== "playing") return;
  currentSpotIndex = (currentSpotIndex + delta + COURT_SPOTS.length) % COURT_SPOTS.length;
  resetBallToSpot();
  updateHUD();
  syncTransforms();
  publishEvidence();
}

document.getElementById("rb-touch-spot-left")?.addEventListener("click", () => changeSpot(-1));
document.getElementById("rb-touch-spot-right")?.addEventListener("click", () => changeSpot(1));
for (const [id, direction] of [["rb-touch-aim-down", -1], ["rb-touch-aim-up", 1]] as const) {
  const button = document.getElementById(id);
  button?.addEventListener("pointerdown", () => { touchAimDirection = direction; });
  button?.addEventListener("pointerup", () => { touchAimDirection = 0; });
  button?.addEventListener("pointercancel", () => { touchAimDirection = 0; });
}
const touchShoot = document.getElementById("rb-touch-shoot");
touchShoot?.addEventListener("pointerdown", () => { touchShootHeld = true; });
touchShoot?.addEventListener("pointerup", () => { touchShootHeld = false; });
touchShoot?.addEventListener("pointercancel", () => { touchShootHeld = false; });
document.getElementById("rb-touch-pause")?.addEventListener("click", togglePause);
document.getElementById("rb-touch-reset")?.addEventListener("click", fullReset);

function resetBallToSpot(): void {
  const spot = COURT_SPOTS[currentSpotIndex]!;
  const isGold = isCurrentPossessionGold(scoreState.possession);
  ballState = createBallAtSpot(spot, isGold);
  chargePower = 0.0;
  isCharging = false;
  chargeDirection = 1;
}

function fullReset(): void {
  scoreState = initialScoreState(1);
  currentSpotIndex = 0;
  hoopState = initialHoopState(1);
  resetBallToSpot();
  updateHUD();
  publishEvidence();
}

function releaseShot(powerOverride?: number, pitchOverride?: number): void {
  if (ballState.inFlight || scoreState.state !== "playing") return;

  const power = powerOverride !== undefined ? powerOverride : chargePower;
  const pitch = pitchOverride !== undefined ? pitchOverride : aimPitch;
  const spot = COURT_SPOTS[currentSpotIndex]!;

  const vel = calculateLaunchVelocity(spot, power, pitch, hoopState);
  ballState = {
    ...ballState,
    vx: vel.vx,
    vy: vel.vy,
    vz: vel.vz,
    inFlight: true,
    settled: false,
    flightTimer: 0
  };

  if (ballState.isGold) {
    audio.playCue("goldBall", 0.9);
  }
}

function updateHUD(): void {
  const currentSpot = COURT_SPOTS[currentSpotIndex]!;
  const config = heatConfig(scoreState.heat);
  elHeatBadge.textContent = `Heat ${scoreState.heat} · ${config.name}`;
  elScoreVal.textContent = String(scoreState.score);
  elTargetVal.textContent = scoreState.heat === 2
    ? `${scoreState.madeSpotIds.length}/3 SPOTS`
    : scoreState.heat === 4
      ? `${Math.min(3, scoreState.streak)}/3 SWISHES`
      : scoreState.heat === 5 ? "GOLD MAKE" : String(scoreState.target);
  elStreakVal.textContent = String(scoreState.streak);
  elHeatTimer.textContent = `${Math.ceil(scoreState.heatTimer)}s`;
  elShotClock.textContent = scoreState.shotClock.toFixed(1);

  if (scoreState.shotClock < 3.0) {
    elShotClock.classList.add("critical");
  } else {
    elShotClock.classList.remove("critical");
  }

  if (scoreState.onFire) {
    elFireBadge.classList.remove("hidden");
  } else {
    elFireBadge.classList.add("hidden");
  }

  const isGold = isCurrentPossessionGold(scoreState.possession);
  elSpotDesc.textContent = `${currentSpot.name}`;
  elShotType.textContent = isGold ? "GOLD BALL ×2" : "Standard Ball";
  if (isGold) {
    elShotType.style.color = "var(--accent-gold)";
  } else {
    elShotType.style.color = "var(--text-muted)";
  }

  // Update Sweet Zone on meter track
  const sweetLeft = Math.max(0, (currentSpot.sweetPower - 0.08) * 100);
  const sweetWidth = 16;
  elSweetZone.style.left = `${sweetLeft}%`;
  elSweetZone.style.width = `${sweetWidth}%`;

  elMeterFill.style.width = `${chargePower * 100}%`;
  if (ballState.result) {
    elLastResult.textContent = ballState.result.toUpperCase();
  }

  // Modal display for heat-cleared / game-over
  if (scoreState.state === "heat-cleared") {
    elModalTitle.textContent = `Heat ${scoreState.heat} Cleared!`;
    elModalDesc.textContent = `${config.objective} complete. The next heat changes the visible court contract.`;
    elModalBtn.textContent = "Advance to Next Heat";
    elModal.classList.remove("hidden");
  } else if (scoreState.state === "game-over") {
    elModalTitle.textContent = "Buzzer - Game Over";
    elModalDesc.textContent = `Final Score: ${scoreState.score} (Target was ${scoreState.target}). Press [R] to retry Heat 1.`;
    elModalBtn.textContent = "Play Again";
    elModal.classList.remove("hidden");
  } else if (scoreState.state === "victory") {
    elModalTitle.textContent = "Rooftop Legend - Victory!";
    elModalDesc.textContent = `All 5 heats cleared. The gold-ball finish is locked.`;
    elModalBtn.textContent = "Play Again";
    elModal.classList.remove("hidden");
  }
}

// ---------------- Frame Simulation Loop ----------------
function triggerContactFx(
  kind: Exclude<typeof contactFxKind, "none">,
  position: { x: number; y: number; z: number }
): void {
  contactFxKind = kind;
  contactFxTimer = 0.46;
  contactFxPosition = { ...position };
}

function stepGame(dt: number): void {
  input.update(dt);
  if (contactFxTimer > 0) {
    contactFxTimer = Math.max(0, contactFxTimer - dt);
    if (contactFxTimer === 0) contactFxKind = "none";
  }

  if (scoreState.state !== "playing") {
    publishEvidence();
    return;
  }

  elapsedPlayTime += dt;

  // 1. Update Hoop position (sway & defender)
  const currentSpot = COURT_SPOTS[currentSpotIndex]!;
  hoopState = updateHoop(hoopState, scoreState.heat, elapsedPlayTime, currentSpot.x);

  // 2. Handle Inputs
  if (!ballState.inFlight) {
    if (input.held("aimUp") || touchAimDirection > 0) {
      aimPitch = Math.min(1.0, aimPitch + dt * 1.5);
    } else if (input.held("aimDown") || touchAimDirection < 0) {
      aimPitch = Math.max(-1.0, aimPitch - dt * 1.5);
    }

    // Charge & Shoot
    if (input.held("shoot") || touchShootHeld) {
      isCharging = true;
      chargePower += chargeDirection * dt * 1.4;
      if (chargePower >= 1.0) {
        chargePower = 1.0;
        chargeDirection = -1;
      } else if (chargePower <= 0.0) {
        chargePower = 0.0;
        chargeDirection = 1;
      }

      chargeTickAccumulator += dt;
      if (chargeTickAccumulator >= 0.08) {
        chargeTickAccumulator = 0;
        audio.playCue("chargeTick", 0.4);
      }
    } else if (isCharging || input.released("shoot")) {
      // Released Space
      isCharging = false;
      releaseShot();
    }
  }

  // 3. Step Ball Physics
  if (ballState.inFlight) {
    const hadHitDefender = ballState.hitDefender;
    const { ball: nextBall, events } = stepBall(ballState, hoopState, dt);
    ballState = nextBall;

    if (events.clankedRim) {
      audio.playCue("rimClank", 0.85);
      sensorEventCount += 1;
      triggerContactFx("rim", { x: ballState.x, y: ballState.y, z: ballState.z });
    }
    if (events.thuddedBoard) {
      audio.playCue("boardThud", 0.9);
      sensorEventCount += 1;
      triggerContactFx("board", { x: ballState.x, y: ballState.y, z: ballState.z });
    }
    if (events.swishedNet) {
      audio.playCue("swish", 0.95);
      sensorEventCount += 1;
      triggerContactFx("swish", { x: hoopState.x, y: hoopState.y - 0.18, z: hoopState.z });
    }
    if (!hadHitDefender && ballState.hitDefender) {
      sensorEventCount += 1;
      triggerContactFx("block", { x: ballState.x, y: ballState.y, z: ballState.z });
    }

    if (events.settled) {
      sensorEventCount += 1;
      const isGold = isCurrentPossessionGold(scoreState.possession);
      const { state: nextScore, event: scoreEvent } = recordShotOutcome(
        scoreState,
        ballState.result ?? "brick",
        currentSpot.points,
        isGold,
        currentSpot.id
      );
      scoreState = nextScore;

      if (scoreEvent.isFireIgnited) {
        audio.playCue("fireIgnite", 0.9);
      } else if (!ballState.hasScored) {
        audio.playCue("brickMiss", 0.7);
      }

      if (scoreState.state === "playing") {
        resetBallToSpot();
      }
    }
  }

  // 4. Update Clocks
  const { state: clockNextState, event: clockEvent } = updateClocks(scoreState, dt, ballState.inFlight);
  scoreState = clockNextState;

  if (clockEvent.isClockViolation) {
    sensorEventCount += 1;
    audio.playCue("buzzerFail", 0.7);
    resetBallToSpot();
  }

  if (clockEvent.isGameOver) {
    audio.playCue("buzzerFail", 0.95);
  }

  // 5. Sync Visual Node Transforms
  syncTransforms();
  updateHUD();
  publishEvidence();
}

function syncTransforms(): void {
  const currentSpot = COURT_SPOTS[currentSpotIndex]!;
  const shooterNode = app.nodes.get("shooter-player") as AuraRuntimeNodeHandle | undefined;
  const flightMotionPhase = ballState.inFlight ? Math.min(1, ballState.flightTimer / 0.58) : 0;
  const releaseExtension = ballState.inFlight ? Math.sin(flightMotionPhase * Math.PI) : 0;
  shooterBodyCompression = isCharging ? Math.min(1, chargePower) : 0;
  shooterMotionPhase = ballState.inFlight
    ? flightMotionPhase < 0.24
      ? "release"
      : flightMotionPhase < 0.78
        ? "follow-through"
        : "landing"
    : isCharging
      ? "compression"
      : "ready";
  const shooterLift = visualReviewCapture
    ? releaseExtension * 0.46 - shooterBodyCompression * 0.12
    : 0;
  const hoopDx = hoopState.x - currentSpot.x;
  const hoopDz = hoopState.z - currentSpot.z;
  const hoopDistance = Math.max(0.001, Math.hypot(hoopDx, hoopDz));
  // The root drive is continuous with the authored flight state: the athlete
  // compresses behind the spot, rises through release, and lands slightly
  // toward the hoop. It complements the typed multi-joint clips rather than
  // presenting each clip as a disconnected mannequin pose.
  const releaseDrive = visualReviewCapture
    ? Math.min(0.34, ballState.flightTimer * 0.9) - shooterBodyCompression * 0.08
    : 0;
  const shooterX = currentSpot.x + (hoopDx / hoopDistance) * releaseDrive;
  const shooterZ = currentSpot.z + (hoopDz / hoopDistance) * releaseDrive;
  shooterNode?.setPosition(shooterX, shooterLift, shooterZ);
  if (visualReviewCapture) {
    const nextShooterAnimation = isCharging
      ? "Load"
      : ballState.inFlight
        ? ballState.flightTimer < 0.28 ? "Release" : "FollowThrough"
        : "bind";
    if (nextShooterAnimation !== shooterAnimationState) {
      shooterAnimationState = nextShooterAnimation;
    }
    // The reviewed shooter is static. Placement, squash, lean, and facing are
    // route-authored root transforms keyed from the real ballistic state.
    const followLean = ballState.inFlight ? Math.sin(Math.min(1, flightMotionPhase / 0.72) * Math.PI / 2) : 0;
    const landingSettle = flightMotionPhase > 0.78 ? (flightMotionPhase - 0.78) / 0.22 : 0;
    shooterNode
      ?.setRotation(-0.2 * followLean + 0.08 * landingSettle, -0.74, -0.11 * releaseExtension)
      .setScale([
        1.24 - releaseExtension * 0.055 + shooterBodyCompression * 0.045,
        1.24 + releaseExtension * 0.105 - shooterBodyCompression * 0.11,
        1.24 + shooterBodyCompression * 0.035
      ]);
  }
  const shooterShadow = app.nodes.get("shooter-contact-shadow") as AuraRuntimeNodeHandle | undefined;
  shooterShadow?.setPosition(shooterX, 0.026, shooterZ);
  if (visualReviewCapture) {
    shooterShadow?.setScale([
      0.68 - releaseExtension * 0.16 + shooterBodyCompression * 0.08,
      0.03,
      0.38 - releaseExtension * 0.1 + shooterBodyCompression * 0.06
    ]);
  }

  const ballNode = app.nodes.get("ball-hero") as AuraRuntimeNodeHandle | undefined;
  ballNode?.setPosition(ballState.x, ballState.y, ballState.z);
  ballNode?.setMaterial(ballState.isGold ? goldMaterial : orangeMaterial);
  if (ballState.inFlight) {
    // Visible spin is derived from flight time and velocity, preserving the
    // route-local ballistic integrator as the sole translation owner.
    ballNode?.setRotation(ballState.flightTimer * 9.5, ballState.flightTimer * 2.4, -ballState.flightTimer * 4.2);
  } else {
    ballNode?.setRotation(0, 0, 0);
  }

  const flightHalo = app.nodes.get("flight-halo") as AuraRuntimeNodeHandle | undefined;
  flightHalo?.setVisible(ballState.inFlight);
  if (ballState.inFlight) {
    flightHalo?.setPosition(ballState.x, ballState.y, ballState.z);
    const speed = Math.min(0.32, Math.hypot(ballState.vx, ballState.vy, ballState.vz) * 0.012);
    flightHalo?.setScale([0.18 + speed, 0.18 + speed, 0.025]);
  }
  const velocityMagnitude = Math.max(0.001, Math.hypot(ballState.vx, ballState.vy, ballState.vz));
  for (let index = 0; index < flightEchoHandles.length; index += 1) {
    const echo = app.nodes.get(`flight-echo-${index + 1}`) as AuraRuntimeNodeHandle | undefined;
    echo?.setVisible(ballState.inFlight);
    if (!ballState.inFlight) continue;
    const lag = 0.22 + index * 0.22;
    echo?.setPosition(
      ballState.x - (ballState.vx / velocityMagnitude) * lag,
      ballState.y - (ballState.vy / velocityMagnitude) * lag,
      ballState.z - (ballState.vz / velocityMagnitude) * lag
    );
    const echoScale = Math.max(0.075, 0.17 - index * 0.045);
    echo?.setScale([echoScale, echoScale, 0.018]);
  }

  const rimNode = app.nodes.get("rim-assembly") as AuraRuntimeNodeHandle | undefined;
  rimNode?.setPosition(hoopState.x, hoopState.y, hoopState.z);
  rimNode?.setMaterial(rimMaterial);

  const backboardNode = app.nodes.get("backboard-assembly") as AuraRuntimeNodeHandle | undefined;
  backboardNode?.setPosition(hoopState.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z);
  backboardNode?.setMaterial(backboardMaterial);

  const defenderNode = app.nodes.get("defender-cutout") as AuraRuntimeNodeHandle | undefined;
  if (defenderNode) {
    defenderNode.setVisible(hoopState.defenderActive);
    if (hoopState.defenderActive) {
      // Hoop state tracks the defender's collision/torso center. Its authored
      // jump height now directly drives the typed athlete's airborne root.
      const contestLift = Math.max(0, hoopState.defenderY - 0.9);
      const airborne = Math.min(1, contestLift / 1.2);
      const ballReachActive = visualReviewCapture && ballState.inFlight && hoopState.defenderTelegraph === "contest";
      const ballDx = ballState.x - hoopState.defenderX;
      const ballDz = ballState.z - hoopState.defenderZ;
      const ballPlanarDistance = Math.max(0.001, Math.hypot(ballDx, ballDz));
      defenderReach = ballReachActive ? Math.min(0.68, ballPlanarDistance * 0.24) * airborne : 0;
      const defenderX = hoopState.defenderX + (ballDx / ballPlanarDistance) * defenderReach;
      const defenderZ = hoopState.defenderZ + (ballDz / ballPlanarDistance) * defenderReach;
      defenderNode.setPosition(defenderX, contestLift, defenderZ);
      if (visualReviewCapture) {
        const nextDefenderAnimation = hoopState.defenderTelegraph === "windup"
          ? "Telegraph"
          : hoopState.defenderTelegraph === "contest"
            ? contestLift > 0.28 ? "Contest" : "Jump"
            : "Plant";
        if (nextDefenderAnimation !== defenderAnimationState) {
          defenderAnimationState = nextDefenderAnimation;
        }
        defenderMotionPhase = hoopState.defenderTelegraph === "windup"
          ? "compression"
          : hoopState.defenderTelegraph === "contest"
            ? airborne > 0.42 ? "airborne-reach" : "takeoff"
            : "landing";
        const reachSide = Math.max(-1, Math.min(1, ballDx / 1.6));
        defenderNode
          .setRotation(-0.24 * airborne, 0.58 + reachSide * 0.12, -reachSide * 0.42 * airborne)
          .setScale([
            1.18 - airborne * 0.065,
            1.18 + airborne * 0.15,
            1.18 - airborne * 0.025
          ]);
      }
    } else if (visualReviewCapture && defenderAnimationState !== "hidden") {
      defenderAnimationState = "hidden";
      defenderMotionPhase = "hidden";
      defenderReach = 0;
    }
  }
  const defenderShadow = app.nodes.get("defender-contact-shadow") as AuraRuntimeNodeHandle | undefined;
  defenderShadow?.setVisible(hoopState.defenderActive);
  if (hoopState.defenderActive) {
    const ballDx = ballState.x - hoopState.defenderX;
    const ballDz = ballState.z - hoopState.defenderZ;
    const ballPlanarDistance = Math.max(0.001, Math.hypot(ballDx, ballDz));
    defenderShadow?.setPosition(
      hoopState.defenderX + (ballDx / ballPlanarDistance) * defenderReach,
      0.026,
      hoopState.defenderZ + (ballDz / ballPlanarDistance) * defenderReach
    );
    if (visualReviewCapture) {
      const contestLift = Math.max(0, hoopState.defenderY - 0.9);
      defenderShadow?.setScale([0.7 + contestLift * 0.12, 0.03, 0.38 + contestLift * 0.08]);
    }
  }
  const defenderPressureVisible = hoopState.defenderActive && hoopState.mode === "pressure";
  const pressureAura = app.nodes.get("defender-pressure-aura") as AuraRuntimeNodeHandle | undefined;
  pressureAura?.setVisible(defenderPressureVisible);
  if (defenderPressureVisible) {
    const ballDx = ballState.x - hoopState.defenderX;
    const ballDz = ballState.z - hoopState.defenderZ;
    const ballPlanarDistance = Math.max(0.001, Math.hypot(ballDx, ballDz));
    pressureAura
      ?.setPosition(
        hoopState.defenderX + (ballDx / ballPlanarDistance) * defenderReach,
        0.045,
        hoopState.defenderZ + (ballDz / ballPlanarDistance) * defenderReach
      )
      .setScale([0.78 + defenderReach * 0.5, 0.78 - defenderReach * 0.16, 0.045]);
  }

  const fireHalo = app.nodes.get("fire-halo") as AuraRuntimeNodeHandle | undefined;
  fireHalo?.setVisible(scoreState.onFire || scoreState.fireAchieved);
  if (scoreState.onFire || scoreState.fireAchieved) {
    fireHalo?.setPosition(hoopState.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z + 0.03);
  }

  const outcomeHalo = app.nodes.get("outcome-halo") as AuraRuntimeNodeHandle | undefined;
  const terminal = scoreState.state === "game-over" || scoreState.state === "victory";
  outcomeHalo?.setVisible(terminal);
  if (terminal) {
    outcomeHalo?.setPosition(hoopState.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z + 0.02);
    outcomeHalo?.setMaterial(scoreState.state === "victory" ? victoryHaloMaterial : failureHaloMaterial);
  }
  const contactBurst = app.nodes.get("contact-burst") as AuraRuntimeNodeHandle | undefined;
  const contactFxActive = contactFxTimer > 0 && contactFxKind !== "none";
  const contactProgress = contactFxActive ? 1 - contactFxTimer / 0.46 : 1;
  const contactMaterial = contactFxKind === "block"
    ? blockContactMaterial
    : contactFxKind === "rim" || contactFxKind === "board"
      ? contactMissMaterial
      : contactMakeMaterial;
  contactBurst?.setVisible(contactFxActive);
  if (contactFxActive) {
    const ringScale = 0.24 + contactProgress * 0.68;
    contactBurst
      ?.setPosition(contactFxPosition.x, contactFxPosition.y, contactFxPosition.z)
      .setMaterial(contactMaterial)
      .setScale([ringScale, ringScale, 0.045]);
  }
  for (let index = 0; index < contactRayHandles.length; index += 1) {
    const ray = app.nodes.get(`contact-ray-${index}`) as AuraRuntimeNodeHandle | undefined;
    ray?.setVisible(contactFxActive);
    if (!contactFxActive) continue;
    const angle = (index / contactRayHandles.length) * Math.PI * 2 + contactProgress * 0.26;
    const radius = 0.18 + contactProgress * 0.52;
    const length = 0.16 + (1 - contactProgress) * 0.22;
    ray
      ?.setPosition(
        contactFxPosition.x + Math.cos(angle) * radius,
        contactFxPosition.y + Math.sin(angle) * radius,
        contactFxPosition.z + 0.015
      )
      .setRotation(0, 0, angle)
      .setScale([length, 0.022, 0.022])
      .setMaterial(contactMaterial);
  }

  const releaseFxActive = ballState.inFlight && ballState.flightTimer <= 0.38;
  const releaseProgress = releaseFxActive ? Math.min(1, ballState.flightTimer / 0.38) : 1;
  for (let index = 0; index < releaseRayHandles.length; index += 1) {
    const ray = app.nodes.get(`release-ray-${index}`) as AuraRuntimeNodeHandle | undefined;
    ray?.setVisible(releaseFxActive);
    if (!releaseFxActive) continue;
    const angle = (index / releaseRayHandles.length) * Math.PI * 2 - 0.18;
    const radius = 0.12 + releaseProgress * 0.38;
    ray
      ?.setPosition(
        currentSpot.x + Math.cos(angle) * radius,
        1.8 + Math.sin(angle) * radius,
        currentSpot.z - 0.03
      )
      .setRotation(0, 0, angle)
      .setScale([0.18 + (1 - releaseProgress) * 0.15, 0.02, 0.02]);
  }

  const contestLift = Math.max(0, hoopState.defenderY - 0.9);
  const defenderHand = {
    x: hoopState.defenderX,
    y: contestLift + 1.62,
    z: hoopState.defenderZ
  };
  const contestDx = ballState.x - defenderHand.x;
  const contestDy = ballState.y - defenderHand.y;
  const contestDz = ballState.z - defenderHand.z;
  const contestDistance = Math.max(0.001, Math.hypot(contestDx, contestDy, contestDz));
  contestReactionActive = Boolean(
    visualReviewCapture &&
    hoopState.defenderActive &&
    hoopState.defenderTelegraph === "contest" &&
    ballState.inFlight &&
    contestDistance < 2.8
  );
  const contestLink = app.nodes.get("contest-reach-link") as AuraRuntimeNodeHandle | undefined;
  contestLink?.setVisible(contestReactionActive);
  if (contestReactionActive) {
    contestLink
      ?.setPosition(
        (defenderHand.x + ballState.x) / 2,
        (defenderHand.y + ballState.y) / 2,
        (defenderHand.z + ballState.z) / 2
      )
      .setRotation(-Math.asin(contestDy / contestDistance), Math.atan2(contestDx, contestDz), 0)
      .setScale([0.028, 0.028, contestDistance * 0.48]);
  }
  for (let index = 0; index < contestReactionHandles.length; index += 1) {
    const ring = app.nodes.get(`contest-reaction-${index}`) as AuraRuntimeNodeHandle | undefined;
    ring?.setVisible(contestReactionActive);
    if (!contestReactionActive) continue;
    const pulse = 0.16 + index * 0.1 + Math.min(0.12, defenderReach * 0.18);
    ring
      ?.setPosition(defenderHand.x, defenderHand.y, defenderHand.z)
      .setRotation(0.12, 0.62, 0)
      .setScale([pulse, pulse, 0.025]);
  }

  const previewPower = Math.max(0.05, isCharging ? chargePower : currentSpot.sweetPower);
  const preview = predictFirstFlight(currentSpot, previewPower, aimPitch, hoopState, 96, 4);
  for (let index = 0; index < AIM_POINT_COUNT; index += 1) {
    const point = app.nodes.get(`aim-point-${index}`) as AuraRuntimeNodeHandle | undefined;
    const sample = preview[index];
    // Keep the bounded flight guide visible during the shot so the active evidence frame communicates the ball-to-hoop intent.
    point?.setVisible(Boolean(sample) && !ballState.inFlight);
    point?.setMaterial(ballState.inFlight ? flightMaterial : aimMaterial);
    if (sample) point?.setPosition(sample.x, sample.y, sample.z);
  }
  for (let index = 0; index < AIM_SEGMENT_COUNT; index += 1) {
    const segment = app.nodes.get(`aim-segment-${index}`) as AuraRuntimeNodeHandle | undefined;
    const start = preview[index];
    const end = preview[index + 1];
    // During live flight, retain the complete route-owned prediction. The
    // moving typed ball sits on that same curve, so one continuous ribbon now
    // communicates release -> current ball -> rim rather than stopping before
    // the causal target becomes legible.
    const visible = ballState.inFlight && Boolean(start && end);
    segment?.setVisible(visible);
    if (!segment || !start || !end) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.max(0.001, Math.hypot(dx, dy, dz));
    segment
      .setPosition((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2)
      .setRotation(-Math.asin(dy / length), Math.atan2(dx, dz), 0)
      // The review route uses a separated broadcast-style tracer. Small gaps
      // preserve the full truthful prediction while avoiding a thick tube that
      // visually competes with the typed ball and athlete silhouettes.
      .setScale([
        visualReviewCapture ? 0.022 : 0.055,
        visualReviewCapture ? 0.022 : 0.055,
        length * (visualReviewCapture ? 0.78 : 1.02)
      ]);
  }
}

// Attach app frame loop
app.onFrame((frame) => {
  const dt = typeof frame === "number" ? frame : (frame?.dt ?? 1 / 60);
  stepGame(Math.min(dt, 0.05));
  publishEvidence();
});

// ---------------- Evidence & Deterministic Hooks ----------------
function publishEvidence(): RooftopBucketsEvidence {
  const isGold = isCurrentPossessionGold(scoreState.possession);
  const diagnostics = app.diagnostics() as { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly runtimeBackend?: string };
  const ev: RooftopBucketsEvidence = {
    status: "ready",
    mounted: true,
    heat: scoreState.heat,
    state: scoreState.state,
    currentSpotId: COURT_SPOTS[currentSpotIndex]!.id,
    score: scoreState.score,
    target: scoreState.target,
    streak: scoreState.streak,
    onFire: scoreState.onFire,
    possession: scoreState.possession,
    makes: scoreState.makes,
    misses: scoreState.misses,
    shotClockMs: Math.round(scoreState.shotClock * 1000),
    heatTimerMs: Math.round(scoreState.heatTimer * 1000),
    lastShotResult: scoreState.lastShotResult,
    goldBall: isGold,
    goldAttempted: scoreState.goldAttempted,
    goldMade: scoreState.goldMade,
    madeSpotIds: [...scoreState.madeSpotIds],
    fireAchieved: scoreState.fireAchieved,
    aimPitch,
    chargePower,
    charging: isCharging,
    ballInFlight: ballState.inFlight,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hoopMode: hoopState.mode,
    defenderTelegraph: hoopState.defenderTelegraph,
    shooterAnimation: shooterAnimationState,
    defenderAnimation: defenderAnimationState,
    shooterMotionPhase,
    defenderMotionPhase,
    shooterBodyCompression,
    defenderReach,
    contactFxKind,
    contactFxActive: contactFxTimer > 0 && contactFxKind !== "none",
    contestReactionActive,
    shooterClips: [],
    defenderClips: [],
    contestAimOffset: hoopState.contestAimOffset,
    sensorEventCount,
    physicsBodyCount: 0,
    simulationOwner: "route-local authored deterministic ballistic integrator; composed rim/board/defender regions are not Rapier bodies",
    predictionPointCount: AIM_POINT_COUNT,
    primaryAssets: ["assets.rooftopCourt", "assets.rooftopBackboard", "assets.rooftopRim", "assets.rooftopBall", "assets.rooftopLayupScorer", "assets.rooftopDefender"],
    systems: ROUTE_SYSTEMS,
    controls: ROUTE_CONTROLS,
    claimBoundary: "Root-safe prototype with route-local authored basketball flight, composed sensor/region contacts, and five-heat scoring; no reusable sports, physics, rim, or defender kit claimed.",
    renderer: { drawCalls: diagnostics.drawCalls, renderSize: diagnostics.renderSize, backend: diagnostics.runtimeBackend ?? "unknown" },
    audioCues: [...audio.audioCuesHeard],
    ballPos: { x: ballState.x, y: ballState.y, z: ballState.z },
    hoopPos: { x: hoopState.x, y: hoopState.y, z: hoopState.z }
  };
  (window as unknown as { __ROOFTOP_BUCKETS_EVIDENCE__?: RooftopBucketsEvidence }).__ROOFTOP_BUCKETS_EVIDENCE__ = ev;
  Object.defineProperty(window, "__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__", { value: ev, configurable: true, writable: true });
  return ev;
}

(window as unknown as {
  __RB_PUMP__?: (frames: number) => number;
  __RB_SHOOT__?: (power: number, pitch?: number) => void;
  __RB_SET_SPOT__?: (index: number) => void;
}).__RB_PUMP__ = (frames: number) => {
  for (let i = 0; i < frames; i++) {
    stepGame(1 / 60);
  }
  return frames;
};

(window as unknown as {
  __RB_SHOOT__?: (power: number, pitch?: number) => void;
}).__RB_SHOOT__ = (power: number, pitch = 0) => {
  releaseShot(power, pitch);
};

// Deterministic visual proof pose: a live pressure heat keeps the typed defender
// in frame while the authored ball flight and trajectory guide are visible.
(window as unknown as { __RB_ACTIVE_SHOT__?: () => void }).__RB_ACTIVE_SHOT__ = () => {
  scoreState = initialScoreState(3);
  // Use a real mid-range spot for the retained pressure shot. This keeps the
  // shooter, live ball, pressure athlete, and regulation hoop in one readable
  // causal diagonal instead of letting an oversized arc separate the actors.
  currentSpotIndex = 0;
  // Bind the retained action to the apex of the real 1.6 s telegraph cycle.
  // The hook advances the same route-owned hoop and ball functions and then
  // pauses that exact beat. Browser rendering cadence can no longer move the
  // defender out of the contest pose between assertion and screenshot.
  elapsedPlayTime = 0.85;
  hoopState = updateHoop(initialHoopState(3), 3, 0.85, COURT_SPOTS[currentSpotIndex]!.x);
  const activeSpot = COURT_SPOTS[currentSpotIndex]!;
  scoreState = recordShotOutcome(scoreState, "swish", activeSpot.points, false, activeSpot.id).state;
  resetBallToSpot();
  releaseShot(0.56, 0.02);
  // Progress the genuine flight to the ball-between-players-and-rim beat.
  // Every step uses the same authored integrator as player input.
  for (let frame = 0; frame < 20; frame += 1) {
    ballState = stepBall(ballState, hoopState, 1 / 60).ball;
  }
  scoreState = { ...scoreState, state: "paused" };
  syncTransforms();
  updateHUD();
  publishEvidence();
};

(window as unknown as {
  __RB_SCENARIO__?: (scenario: "open-clear" | "spot-clear" | "pressure" | "pressure-clear" | "fire" | "miss" | "buzzer" | "gold-miss" | "gold-win") => string;
}).__RB_SCENARIO__ = (scenario) => {
  const apply = (outcome: "swish" | "brick", spotIndex: number, gold = false) => {
    const spot = COURT_SPOTS[spotIndex]!;
    scoreState = recordShotOutcome(scoreState, outcome, spot.points, gold, spot.id).state;
    if (outcome === "swish") audio.playCue("swish", 0.8);
    else audio.playCue("brickMiss", 0.7);
  };
  elModal.classList.add("hidden");
  if (scenario === "open-clear") {
    scoreState = initialScoreState(1);
    apply("swish", 4);
    apply("swish", 4);
  } else if (scenario === "spot-clear") {
    scoreState = initialScoreState(2);
    apply("swish", 0);
    apply("swish", 1);
    apply("swish", 2);
  } else if (scenario === "pressure" || scenario === "pressure-clear") {
    scoreState = initialScoreState(3);
    currentSpotIndex = 2;
    hoopState = updateHoop(initialHoopState(3), 3, 0.85, COURT_SPOTS[currentSpotIndex]!.x);
    if (scenario === "pressure-clear") {
      apply("swish", 4);
      apply("swish", 4);
    } else {
      // Freeze the authored contest beat after advancing the real integrator a
      // few fixed steps, so the review artifact is a live ball-to-hoop moment
      // rather than a static charge pose. Gameplay remains paused for capture.
      resetBallToSpot();
      releaseShot(0.72, 0.12);
      for (let frame = 0; frame < 8; frame += 1) {
        ballState = stepBall(ballState, hoopState, 1 / 60).ball;
      }
      scoreState = { ...scoreState, state: "paused" };
    }
  } else if (scenario === "fire") {
    scoreState = initialScoreState(4);
    apply("swish", 1);
    apply("swish", 1);
    apply("swish", 1);
    audio.playCue("fireIgnite", 0.9);
  } else if (scenario === "miss") {
    scoreState = initialScoreState(1);
    apply("brick", 1);
  } else if (scenario === "buzzer") {
    scoreState = updateClocks(initialScoreState(5), 13, false).state;
    audio.playCue("buzzerFail", 0.9);
  } else if (scenario === "gold-miss") {
    scoreState = initialScoreState(5);
    apply("brick", 1, true);
    audio.playCue("buzzerFail", 0.9);
  } else {
    scoreState = initialScoreState(5);
    apply("swish", 1, true);
    audio.playCue("goldBall", 0.9);
  }
  if (scenario !== "pressure" && scenario !== "pressure-clear") hoopState = initialHoopState(scoreState.heat);
  resetBallToSpot();
  syncTransforms();
  updateHUD();
  publishEvidence();
  return `${scoreState.heat}:${scoreState.state}:${scoreState.lastShotResult ?? "none"}`;
};

(window as unknown as {
  __RB_SET_SPOT__?: (index: number) => void;
}).__RB_SET_SPOT__ = (index: number) => {
  currentSpotIndex = Math.max(0, Math.min(COURT_SPOTS.length - 1, index));
  resetBallToSpot();
  updateHUD();
};

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: {
      position: [BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z],
      rotation: [0, 0, 0],
      targetSize: BACKBOARD_POSITION.width
    },
    settleSubjectPose() {
      scoreState = { ...scoreState, state: "paused" };
      elapsedPlayTime = 0;
      hoopState = initialHoopState(scoreState.heat);
      resetBallToSpot();
      syncTransforms();
      publishEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      const node = app.nodes.get("backboard-assembly") as AuraRuntimeNodeHandle | undefined;
      node?.setVisible(!suppressed);
    }
  }
});

publishEvidence();
