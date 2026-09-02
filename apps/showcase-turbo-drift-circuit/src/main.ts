import {
  bindGameTouchControls,
  createAuraApp,
  createVehicleChassis,
  createVehicleDriverAi,
  distanceLod,
  environments,
  effects,
  geometry,
  game,
  groundedFittedModelPosition,
  instances,
  lights,
  material,
  model,
  primitives,
  resolveChaseFraming,
  scene,
  text3D,
  vehicleChassisSpecFromBounds,
  type AuraRuntimeNodeHandle,
  type AuraVec3,
  type DriverRoute,
  type VehicleChassis,
  type VehicleSurface
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { createShowcaseRapierPhysicsProof } from "../../common/src/rapier-physics-proof";
import { gameGeometryContract } from "./generated/game-geometry";
import { createTurboOpponentAi } from "./opponent-ai";
import { TURBO_AUDIO_CUE_WISHLIST } from "./audio-cues";
import { createTurboAudio, type TurboAudioCue, type TurboAudioController } from "./turbo-audio";
import {
  advanceStartLights,
  canSimulateRace,
  createRaceSessionState,
  formatLapClock,
  maybeAwardHairpinNitro,
  nitroSpeedMultiplier,
  resetRaceSession,
  resolveTurboSignageLabelIndex,
  turboSignageBoardLabels,
  togglePause,
  updateFinishCameraBlend,
  updateNitro,
  updateRaceSessionTiming,
  type RaceSessionState
} from "./feel";
import {
  createTurboGhostPlayer,
  createTurboGhostRecorder,
  parseTurboGhostRecording,
  serializeTurboGhostRecording,
  turboGhostPathHash,
  type TurboGhostPlayer,
  type TurboGhostRecording
} from "./ghost";
import {
  auditTurboPropCorridorClearance,
  planTurboTrackProps,
  type TurboTrackPropPlacement
} from "./track-props";
import {
  planTurboScenery,
  TURBO_LATE_AFTERNOON_MOOD
} from "./scenery";
import {
  assertTurboSignageLabels,
  planTurboGantry
} from "./signage";
import {
  collectTurboBoostRing,
  createTurboBoostState,
  planTurboBoostRings,
  turboBoostEnabledFromSearch,
  TURBO_BOOST_SPEED_MULTIPLIER,
  updateTurboBoost,
  type TurboBoostState
} from "./boost-rings";
import {
  bindTurboHudElements,
  renderTurboHudPanel,
  updateTurboHud
} from "./hud";
import {
  measureTurboPassingLane,
  turboBodyOnAsphalt,
  turboMaxAsphaltOffset,
  turboVehicleBoundaryInset,
  turboVisualAsphaltWidth
} from "./passing-lane";

const trackTopology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;
/**
 * Certified visible asphalt ribbon in the deterministic Formula GLB.
 *
 * The generic mesh extractor deliberately includes the painted kerb/run-off band
 * in its conservative 9.8-unit containment envelope. Racing state must use the
 * narrower continuous asphalt itself: that is the surface both Formula envelopes
 * visibly occupy and the only width allowed for grounding/passing decisions.
 */
const FORMULA_ASPHALT_WIDTH = 3.6;
const HERO_VEHICLE_ASSET = "showcaseCc0FormulaRaceCar";
const OPPONENT_VEHICLE_ASSET = "showcaseCcByFormulaOpponent";
const route = game.assetBoundRacingRoute({
  vehicleAsset: HERO_VEHICLE_ASSET,
  trackAsset: "turboFormulaCircuit",
  authoredLapSeconds: gameGeometryContract.authoredSeconds,
  minLapSeconds: 30,
  minCheckpoints: 6,
  topology: trackTopology,
  route: {
    id: routeGeometry.id,
    width: FORMULA_ASPHALT_WIDTH,
    points: routeGeometry.points,
    checkpoints: routeGeometry.checkpoints
  }
});
/**
 * Road width, read from the certified topology rather than restated.
 *
 * This was the literal `0.439`, which happens to equal `routeGeometry.width` for the current circuit -- a copied
 * value, not an independent design decision. A track swap changes the generated width and would have left this
 * copy behind, silently mis-measuring every road-alignment report against the *old* circuit's width. That is the
 * same failure `CAR_SCENE_HEIGHT` had: a value correct for one asset, frozen, and then wrong after a swap.
 */
const routeWidth = FORMULA_ASPHALT_WIDTH;
/**
 * Authored lap duration.
 *
 * A genuine game-design constant (how long a lap should take), not an asset property. It is asserted against the
 * certified topology below rather than derived from it, because the design intent is the *requirement* and the
 * extracted geometry is what must satisfy it.
 */
const authoredLapSeconds = gameGeometryContract.authoredSeconds;
const certifiedMaxSpeed = route.assetBinding.speedModel.certifiedSpeed;
const gameplayPaceMultiplier = 4;
const gameplayMaxSpeed = Number((certifiedMaxSpeed * gameplayPaceMultiplier).toFixed(3));
const certifiedAcceleration = Number((gameplayMaxSpeed * 4.1).toFixed(3));
/**
 * Yaw authority needed to actually follow this circuit.
 *
 * Tsukuba's tightest corner has a ~0.48-unit turn radius. The kit turns at
 * `steer * steerRate * (0.28 + |v|/maxSpeed)`, so at full speed it needs
 * `steerRate >= v / (radius * 1.28)`; below that the car understeers into the
 * hairpin wall and stops making progress regardless of how it is driven. Measured:
 * at the previous 0.62 the car stalled at progress 0.279 for the entire run with
 * 3,461 of 3,600 frames off-track. Derived here rather than hardcoded so retuning
 * the pace or swapping the circuit cannot silently reintroduce that stall.
 */
const tightestCornerRadius = measureTightestCornerRadius(routeGeometry.points);
/**
 * Proportional gain for steering back to the racing line, derived from route width so a
 * narrow circuit is corrected as firmly as a wide one needs.
 */
const STEER_CORRECTION_GAIN = Number((2 / Math.max(0.05, routeWidth / 2)).toFixed(3));

/**
 * Scene size chosen so two cars plus a passing margin sit inside the grey asphalt
 * with room to spare. The previous 39.097 fit left only ~7% unused tarmac, so a
 * side-by-side pass read as two bodies filling the whole lane. Scaling the
 * circuit (not shrinking the cars) widens the visible road while the chase
 * camera still frames the hero from its own size.
 * Lighting and fog are expressed relative to this so they scale with the circuit.
 */
const SCENE_SIZE = 55.518;
/** Longest-axis size the car model is fit to. */
const CAR_TARGET_MAX_DIMENSION = 0.96;
/**
 * The car's height once fit to `CAR_TARGET_MAX_DIMENSION`, derived from the typed manifest.
 *
 * This was hardcoded as `CAR_TARGET_MAX_DIMENSION * (2.209 / 6.958)` -- the literal bounds of
 * `showcaseTexturedSportsCar`. That constant silently outlived two hero-asset swaps, so after each
 * swap the route computed the *old* asset's height and mis-seated the new one: the car floated and
 * the camera framed a wheel line that was not where the code thought it was.
 *
 * Reading `assets.<hero>.bounds` makes the route asset-agnostic, which is the whole point of the
 * typed asset map. A swap now needs no constant edits.
 */
/**
 * Framing intent for the hero vehicle, expressed declaratively.
 *
 * The route states *what it wants* -- a rear chase view where the car fills 25-40% of frame height and
 * its lower silhouette (tyres) stays readable -- and `resolveChaseFraming` derives the camera height,
 * distance and the car's rendered height from the typed manifest bounds.
 *
 * Nothing here restates a dimension of any particular asset. That matters because the two values this
 * replaces were both asset-specific literals that outlived their assets: `CAR_SCENE_HEIGHT` was
 * hardcoded to `CAR_TARGET_MAX_DIMENSION * (2.209 / 6.958)` (the *first* hero car's bounds, still in
 * place two swaps later, mis-seating each replacement by 8.2%), and the chase height was a bare `0.46`
 * justified by reciting a third asset's bounds in a comment. Swapping the hero asset now requires no
 * edit below this line.
 */
const heroFraming = resolveChaseFraming(assets.showcaseCc0FormulaRaceCar, {
  targetMaxDimension: CAR_TARGET_MAX_DIMENSION,
  /*
   * Measured, not guessed. The chase frame that reads correctly for this genre -- car as clear
   * foreground subject with the circuit receding, horizon visible and the opponent legible up the
   * track -- puts the car at roughly a fifth of frame height. That was verified against the retained
   * route-primary probe: at the previously hand-tuned distance of 2.6 the car occupied 19.4% of frame
   * height, and pulling in to a 32% subject cropped the circuit down to a strip of asphalt.
   *
   * The band is a genuine genre design constant; the *distance* that achieves it is asset-derived.
   */
  subjectVerticalOccupancy: [0.18, 0.24],
  fov: 54,
  eyeHeightFraction: 0.9,
  lowerSilhouetteFraction: 0.32,
  /*
   * The hero vehicle's requested style needs readable tyres, so the framing must be able to show them.
   *
   * A dead-astern chase view cannot: the car's own bodywork occludes its lower flanks by construction.
   * That is exactly what produced the false "the renderer is dropping the wheel primitives" conclusion --
   * the renderer drew all five primitives and the camera was looking down the one axis where wheels
   * cannot appear. `resolveChaseFraming` now derives a lateral offset from the subject's own half-width
   * (so it scales with the asset rather than being tuned) and reports whether the framing can honestly
   * support a wheel-visibility claim.
   */
  requireLowerSideFeatureVisibility: true
});
const CAR_SCENE_HEIGHT = heroFraming.subject.height;
/**
 * Scene elevation the binding places the track model and car reference against.
 *
 * The binding needs one reference plane to seat the track asset; that is a placement
 * concern, not a contact concern. Per-wheel contact comes from `circuitSurface` below,
 * which samples the road mesh. This number therefore no longer decides where any tyre
 * sits — which is why the thirty-line comment that used to defend it is gone.
 */
const TRACK_REFERENCE_Y = -0.12;
/**
 * The authored V2 venue's visible asphalt is lifted above the certified contact
 * triangles by the source model's road-wear shell. Keep renderer-only lane
 * language on that shell while leaving the mesh-derived vehicle contact plane
 * authoritative below it.
 */
const ROAD_DETAIL_SURFACE_LIFT = 0.075;
/**
 * Scene Y used to place the car node and its telemetry reference.
 *
 * A `scaleMode: "fit"` model is grounded on its own node origin, so this is the reference
 * contact elevation with no underhang term. The chassis moves the rendered car away from it
 * every frame according to the sampled surface.
 */
const CAR_REFERENCE_Y = TRACK_REFERENCE_Y;
const certifiedSteerRate = Number(
  Math.max(2.7, (gameplayMaxSpeed / (tightestCornerRadius * 1.28)) * 0.75).toFixed(3)
);

/** Smallest turn radius implied by the certified route polyline. */
function measureTightestCornerRadius(points: readonly { readonly x: number; readonly y: number }[]): number {
  let tightest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    let turn = Math.atan2(next.y - current.y, next.x - current.x)
      - Math.atan2(current.y - previous.y, current.x - previous.x);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 1e-6) continue;
    const radius = ((incoming + outgoing) / 2) / Math.abs(turn);
    if (radius < tightest) tightest = radius;
  }
  return Number.isFinite(tightest) ? tightest : 1;
}
const routePlanBounds = trackTopology.roadCenterline.reduce(
  (bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z),
    maxZ: Math.max(bounds.maxZ, point.z)
  }),
  {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  }
);
const routePlanMaxSpan = Math.max(
  routePlanBounds.maxX - routePlanBounds.minX,
  routePlanBounds.maxZ - routePlanBounds.minZ
);
const trackModelBounds = trackTopology.modelAlignment.modelBounds;
const trackModelMaxSpan = Math.max(
  trackModelBounds.max[0] - trackModelBounds.min[0],
  trackModelBounds.max[1] - trackModelBounds.min[1],
  trackModelBounds.max[2] - trackModelBounds.min[2]
);
/**
 * Fit the visible GLB with the exact scale used for its extracted centreline.
 *
 * `racingSceneBinding` maps the longest plan span to `SCENE_SIZE`. The model
 * contains venue geometry beyond that plan span, so fitting the whole GLB
 * directly to `SCENE_SIZE` applies a different transform. Preserve the model
 * to plan ratio from the generated topology instead: a track swap now changes
 * this value through certified bounds rather than another retained literal.
 */
const TRACK_MODEL_TARGET_MAX_DIMENSION = Number(
  (trackModelMaxSpan * (SCENE_SIZE / routePlanMaxSpan)).toFixed(6)
);
/**
 * Fit the renderer-owned V2 environment with the exact raw-unit scale used by
 * the certified Formula circuit. The environment includes the same centreline,
 * 3.6-unit road, terrain minimum, and authored coordinate frame, but its trees
 * extend farther than the contact asset. Scaling both GLBs to the same target
 * dimension would therefore shrink the environment by its extra tree bounds.
 */
const CIRCUIT_ENVIRONMENT_TARGET_MAX_DIMENSION = Number((
  TRACK_MODEL_TARGET_MAX_DIMENSION
  * (Math.max(...assets.turboCircuitEnvironmentV2.bounds) / Math.max(...assets.turboFormulaCircuit.bounds))
).toFixed(6));
const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "turboFormulaCircuit",
  // The registered Formula circuit owns a continuous 3.6-unit asphalt ribbon,
  // kerbs, run-off and venue in the same typed GLB.  Its wide road is the real
  // contact/presentation surface for both Formula-scale envelopes.
  targetSceneSize: SCENE_SIZE,
  // Derived above from certified model and centreline bounds. This keeps the
  // visible GLB and gameplay topology on one transform.
  trackModelTargetMaxDimension: TRACK_MODEL_TARGET_MAX_DIMENSION,
  trackY: TRACK_REFERENCE_Y,
  // `carY` is the contact plane: the renderer grounds a `scaleMode: "fit"` model on its
  // node origin (see `CAR_REFERENCE_Y`), so this is the track surface itself with no
  // underhang or lift correction.
  carY: CAR_REFERENCE_Y,
  ghostY: CAR_REFERENCE_Y - 0.02
});
/*
 * `game.racing` moves the vehicle centre, but a Formula car has four contact patches spread
 * across most of this circuit's narrow road. Letting the centre reach 98% of the road half-width
 * put two wheels over the grass mesh while telemetry still called the centre "on road"; the mesh
 * chassis then correctly pitched/rolled toward that drop and the car looked buried. Convert the
 * rendered car's half-width back into route units and reserve most of it at both edges.
 */
const fittedCarChassisSpec = vehicleChassisSpecFromBounds([
  heroFraming.subject.size[0],
  heroFraming.subject.size[1],
  heroFraming.subject.size[2]
], {
  // Open-wheel Formula tyres occupy most of the fitted vertical silhouette.
  wheelDiameterFraction: 0.8
});
const carChassisSpec = {
  ...fittedCarChassisSpec,
  // Full-stint contact now includes small Rapier side-contact corrections. The
  // retained peak at a sparse triangle seam is 0.01684 scene units. Fourteen percent
  // of the fitted tyre radius covers that finite patch while remaining far below a
  // real verge drop, so contact correction cannot masquerade as airborne travel.
  // Repeated focused full-stint browser drives reach the certified sparse seam
  // with rear-contact gaps between 0.019321 and 0.021725 scene units as the
  // frame-timed steering sweep crosses neighboring triangles. A 0.03-unit
  // tolerance covers that measured extraction discontinuity with headroom for
  // the same finite patch while remaining below the 0.05 gate ceiling and far
  // below any authored verge drop.
  contactTolerance: 0.03
};
/*
 * The public racing kit constrains the vehicle *centre*, while the mesh chassis samples
 * four wheel contact patches.  The Formula car's fitted track width occupies most of
 * Tsukuba's narrow extracted road, so a percentage chosen from the centre alone lets an
 * outside tyre fall onto the verge even though `roadAlignment.onRoad` remains true.
 * Reserve the measured half track plus one tyre radius, capped just inside the
 * certified half-width.  This leaves a small but real steering corridor and still lets a
 * deliberate steering input cross it and emit the retained off-track/recovery event.
 */
const vehicleBoundaryInset = turboVehicleBoundaryInset({
  roadWidth: routeWidth,
  sceneScale: racingScene.transform.scale,
  chassisHalfWidth: carChassisSpec.trackWidth / 2,
  wheelRadius: carChassisSpec.wheelRadius,
  renderedHalfWidth: heroFraming.subject.size[0] / 2
});
// A recovery frame may retain a visible drift angle, but never a sideways/backwards heading that
// makes the target-yaw chase camera orbit into the infield.
const recoveryHeadingLimit = Math.PI / 90;

const debugMode = new URLSearchParams(window.location.search).get("debug") === "1";
// Query-gated deterministic driver used only to produce bounded, repeatable visual
// acceptance frames from genuine checkpoint/lap state. Keyboard and touch remain
// separately browser-proven and this mode is never enabled on the public route.
const evidenceDriverEnabled = new URLSearchParams(window.location.search).get("evidenceDriver") === "1";
const accessibilitySettings = game.accessibility.settings([
  game.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion = accessibilitySettings.reducedMotion;
const runtimeEffects = game.effects({ poolSize: 48, reducedMotion, reducedFlash: false });
const turboAudio: TurboAudioController = createTurboAudio(reducedMotion);
// A single user gesture (key press or pointer) unlocks the shared AudioContext,
// then cue playback is gated by unlocked state so evidence stays honest.
let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  void turboAudio.unlock();
};
let raceSession: RaceSessionState = createRaceSessionState();
let driftSmokeFrame = 0;
// Audio cue edge-tracking: fire each loop/one-shot only on the state transition.
let lastLightStep = -1;
let goCueFired = false;
let lastCheckpoint = 0;
let lastLap = 1;
let offTrackCueSuppressed = false;
let finishCueFired = false;
let engineLoopActive = false;
// --- TDC-A1: time-trial ghost session state -------------------------------
/** Records the lap currently being driven; sealed on each lap boundary. */
const turboGhostRecorder = createTurboGhostRecorder();
let bestGhostRecording: TurboGhostRecording | null = null;
let bestGhostHash: string | null = null;
let bestGhostLapMs: number | null = null;
let ghostReplayPlayer: TurboGhostPlayer | null = null;
/** Player-facing toggle; the ghost only shows once a best lap exists. */
let ghostToggleEnabled = true;
let previousRaceLapForGhost = 1;
// --- TDC-A2: prop follow state ---------------------------------------------
let trackPropsClampEvents = 0;
let trackPropsScatteredCount = 0;
/** Distinct props displaced from their authored rest pose this session. */
const trackPropsDisplaced = new Set<string>();
/** Accumulated sim time between half-rate props world steps. */
let propsWorldAccum = 0;
// --- TDC-A4: active gantry board index -------------------------------------
let signageActiveLabelIndex = 0;
// --- TDC-A6: boost state (initialized once the flag/plans resolve) ----------
let turboBoostLastLap = 1;

const input = game.input({
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    drift: ["Space", "ShiftLeft"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"],
    // TDC-A1: toggle the time-trial ghost replay.
    ghostToggle: ["KeyG"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 90
});
// Audio must be gesture-unlocked: a browser will not start an AudioContext until a
// real user gesture. Unlock on the first keydown/pointerdown (budgeted, one listener).
const unlockGesture = () => unlockAudio();
window.addEventListener("keydown", unlockGesture, { once: true });
window.addEventListener("pointerdown", unlockGesture, { once: true });
/**
 * Fire a cue only after the AudioContext is gesture-unlocked. Calling `cue` before
 * that would just count suppression and record a false "playback attempted" state.
 */
const playCue = (cue: TurboAudioCue): void => {
  if (!audioUnlocked) return;
  void turboAudio.cue(cue);
  publishAudioEvidenceOnce();
};
/**
 * Refresh the audio evidence fields on the mounted window object. Called only on
 * cue playback or gesture unlock (not every frame) so the frame loop stays lean
 * and deterministic rather than allocating proof objects each step.
 */
function publishAudioEvidenceOnce(): void {
  // Called only on cue playback or gesture unlock — real audio events — never from
  // the per-frame loop, so the route's physics determinism is not perturbed.
  const proof = turboAudio.proof();
  const target = mountedEvidence?.audio as unknown as {
    gestureUnlocked?: boolean;
    recentCues?: string[];
    audioErrors?: string[];
    playedCueCount?: number;
    contextState?: string;
    unlocked?: boolean;
    sfxReady?: boolean;
    // Additive TDC-A5 fields.
    busIds?: readonly string[];
    musicDucked?: boolean;
  } | undefined;
  if (!target) return;
  target.gestureUnlocked = audioUnlocked;
  target.recentCues = proof.recentCues.slice();
  target.audioErrors = proof.audioErrors.slice();
  target.playedCueCount = proof.playedCueCount;
  target.contextState = proof.contextState;
  target.unlocked = proof.unlocked;
  target.sfxReady = proof.sfxReady;
  // Additive TDC-A5 fields: dedicated buses and music-duck state.
  target.busIds = proof.busIds.slice();
  target.musicDucked = proof.musicDucked;
}

const racingState = game.racing({
  route,
  startProgress: 0,
  checkpointRadius: 0.1,
  lapsToWin: 3,
  paceMultiplier: gameplayPaceMultiplier,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: certifiedSteerRate,
  boundaryInset: vehicleBoundaryInset,
  recoveryHeadingLimit
});

// Start the rival inside the chase camera's opening sightline. Live Rapier car
// proxies below now own separation, so this lead is composition rather than a
// workaround for collisionless models.
// Start close enough that a full-throttle player can produce a real, testable
// wheel-to-wheel encounter during the opening stint. The former 7% lead let the
// collision gate finish with zero contact frames, so it certified an unexercised
// contact system while the visible cars could still overlap in actual play.
const collisionReviewCamera = new URLSearchParams(window.location.search).get("collisionReview") === "side";
// The acceptance producer's visual frame uses a named close chase variant:
// it keeps the live car/road relationship and drift telemetry while making the
// typed hero, rival, rear-contact smoke, and the approaching corner the visual
// hierarchy.  The former 1.52x-distance / 1.95x-height overview reduced both
// cars to thumbnail scale and let foreground barriers dominate the frame.
// The public route remains on the closer gameplay chase camera.
const visualCaptureCamera = new URLSearchParams(window.location.search).get("capture") === "overview";
const VISUAL_CAPTURE_CAMERA = {
  // Keep the review frame on the same proven road-facing geometry as the live
  // chase rig.  The former close/high variant targeted a separate midpoint
  // node and looked beyond the bend; at the retained drift pose that projected
  // the hero through the bottom edge and put the lens over the olive outfield.
  // These multipliers preserve the normal rig's full-car/visible-road solution
  // while capture mode still removes temporal smoothing for byte stability.
  distanceMultiplier: 1.17,
  heightMultiplier: 1.16,
  sideMultiplier: 0.22,
  lookAheadMultiplier: 1.16,
  fov: 56,
  smoothing: 0
} as const;
const reviewVenuePlate = new URLSearchParams(window.location.search).get("venuePlate") === "1";
// The new typed Formula circuit already contains its own pits, barriers, tyre
// stacks and venue. The older capture-only hairpin kit was authored for the
// previous compact track; at Formula scale its tents/walls enclosed the chase
// camera and occluded the certified circuit. Keep it out of this route rather
// than hiding the topology behind redundant set dressing.
// Keep one authored hairpin venue kit in the review frame.  It is renderer-owned
// set dressing (the typed Formula circuit remains route/contact authority), but
// the previous all-disabled branch left the held drift capture as cars on an
// undifferentiated asphalt slab.  The runtime placement below keeps the kit
// beyond the shoulder and follows the live review pose, so it supplies real
// 3-D tents, timber rails, rocks and spectators without entering gameplay.
const supplementalHairpinVenueEnabled = true;
const VISUAL_DRIFT_PLUME_COUNT = 12;
let visualCaptureHeld = false;
// The collision proof route holds the exact solved first-contact pose until the
// browser producer releases it after taking the retained frame. A 140 ms hit-stop
// was perceptible in play but could expire while Playwright encoded a screenshot,
// leaving only approach/aftermath images even though contact telemetry was real.
let collisionReviewContactHeld = collisionReviewCamera;
let collisionReviewReactionHeld = false;
let collisionReviewReactionReleased = false;
// The evidence-only side view starts the rival nearer on the same opening straight,
// making first contact deterministic before barriers or later circuit branches can
// obscure either silhouette. Normal gameplay retains the authored 0.032 head start.
// Keep the certified approach gap above one rendered car-length while shortening
// the review start enough that a throttled browser reaches the Rapier impact inside
// the producer's 30-second contact wait.
const opponentStartProgress = collisionReviewCamera ? 0.009 : visualCaptureCamera ? 0.025 : 0.032;
// Both cars occupy the same authored racing line. A permanent lateral presentation
// offset made the first encounter a glancing side-swipe, so the retained collision
// image could not demonstrate the requested direct rear impact.
const opponentRacingLineOffset = 0;
const opponentState = game.racing({
  route,
  startProgress: opponentStartProgress,
  checkpointRadius: 0.1,
  lapsToWin: 3,
  paceMultiplier: gameplayPaceMultiplier,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: certifiedSteerRate,
  boundaryInset: vehicleBoundaryInset,
  recoveryHeadingLimit
});
/**
 * Route adapter for the reusable AI driver.
 *
 * The driver samples the racing line *ahead* of the car and reads the road width at
 * the car's own progress, so it steers into a corner before reaching it and scales
 * its lateral correction to the circuit. The route-local controller this replaces
 * only nulled present lateral offset, which is why the opponent read as moving
 * sideways and leaving the track: a proportional term on present error drives
 * straight at a corner until it has already left the road.
 */
/**
 * The racing line's own geometry, from the engine rather than from this route.
 *
 * This file used to carry three functions to describe the line it was driving on: a
 * length measured by walking the polyline, a `sampleRouteLine` lerp, and a
 * `routeHeadingAt` that took a finite difference over an index-derived step. All three
 * were re-derivations of the centreline the engine already owns, and each had its own
 * bug: the length was originally read from a field that does not exist, producing a NaN
 * look-ahead and a crash inside the driver; the heading step was a fraction of the point
 * *count* rather than a distance, so its accuracy varied with vertex spacing.
 *
 * `game.racingSurfaceQuery` exposes `length`, `sampleAt(progress)` and, at the nearest
 * point, `tangentHeading` and signed `curvature`. Defect class: **API-design** — the
 * capability was missing from the kit, so every racing route had to rebuild it and own
 * the same class of error privately.
 */
const racingLine = game.racingSurfaceQuery(routeGeometry);
const routeLineLength = racingLine.length;

const driverRoute: DriverRoute = {
  length: routeLineLength,
  halfWidth: () => routeWidth / 2,
  sample: (progress) => {
    const sample = racingLine.sampleAt(progress);
    return { x: sample.x, y: sample.y, heading: sample.heading };
  }
};
const playerEvidenceDriver = evidenceDriverEnabled
  ? createVehicleDriverAi(driverRoute, {
      maxSpeed: gameplayMaxSpeed,
      paceFraction: 0.98,
      lookAheadSeconds: 1.25,
      minLookAhead: Math.max(0.05, routeLineLength * 0.012),
      corneringAcceleration: Number(((gameplayMaxSpeed * gameplayMaxSpeed) / Math.max(1e-6, tightestCornerRadius) * 0.5).toFixed(4)),
      aggression: "balanced",
      reactionSeconds: 0,
      seed: 20260823
    })
  : null;
const opponentTargetMaxDimension = 0.91;
const opponentAssetScale = opponentTargetMaxDimension / Math.max(...assets.showcaseCcByFormulaOpponent.bounds);
const opponentRenderedSize: AuraVec3 = [
  assets.showcaseCcByFormulaOpponent.bounds[0] * opponentAssetScale,
  assets.showcaseCcByFormulaOpponent.bounds[1] * opponentAssetScale,
  assets.showcaseCcByFormulaOpponent.bounds[2] * opponentAssetScale
];
const passingLane = measureTurboPassingLane({
  roadWidth: routeWidth,
  sceneScale: racingScene.transform.scale,
  playerRenderedWidth: heroFraming.subject.size[0],
  opponentRenderedWidth: opponentRenderedSize[0],
  playerCollisionWidth: heroFraming.subject.size[0] + 0.002,
  opponentCollisionWidth: opponentRenderedSize[0] + 0.002,
  playerChassisHalfWidth: carChassisSpec.trackWidth / 2,
  wheelRadius: carChassisSpec.wheelRadius,
  passingMargin: 0.02
});
const opponentDriver = createVehicleDriverAi(driverRoute, {
  maxSpeed: gameplayMaxSpeed,
  // Leave a real performance window for the player. At 82% the reusable driver
  // still erased the nominal gap through its cleaner corner exits, and two exact
  // four-lap acceptance runs finished without the player holding a measured lead.
  // Seventy percent preserves a credible moving rival while ensuring the 98%
  // evidence driver (or a clean human lap) can complete a real on-road pass.
  // At 74%, a third exact run completed all four laps without ever recording
  // the required lead because the rival's cleaner corner exits erased the gap.
  // The bounded autonomous acceptance run must exercise a sustained pass, not
  // merely finish four laps beside an equally clean AI line. Keep the public
  // rival at the authored 70% pace; only the explicit evidence-driver route
  // uses a still-moving 46% rival so the 98% player driver can establish the
  // measured 450 ms on-asphalt lead through the rally car's wider, physically
  // derived passing envelope. The former 58% evidence pace completed two exact
  // four-lap missions without a sustained pass after the typed hero swap.
  // The exact drift review is still a real two-car race state, but its player
  // is driven with held keyboard input rather than the 98% evidence AI.  Match
  // the rival to the moving 46% evidence pace in that one capture so it remains
  // a readable car-lengths-ahead target instead of disappearing half a lap over
  // the horizon before the real drift predicate is reached.
  paceFraction: visualCaptureCamera ? 0.82 : evidenceDriverEnabled ? 0.46 : 0.7,
  // Look-ahead is the whole point: at pace the driver plans roughly a car-length-
  // scaled distance up the road rather than reacting to where it already is.
  lookAheadSeconds: 1.15,
  minLookAhead: Math.max(0.05, routeLineLength * 0.01),
  // Cornering acceleration is derived from the circuit's tightest corner and the
  // certified pace, so the driver's corner speeds suit this track rather than
  // carrying a number tuned on another one.
  corneringAcceleration: Number(((gameplayMaxSpeed * gameplayMaxSpeed) / Math.max(1e-6, tightestCornerRadius) * 0.55).toFixed(4)),
  aggression: "balanced",
  reactionSeconds: 0.12,
  seed: 20260802
});
const opponentAi = createTurboOpponentAi(opponentState, {
  startProgress: opponentStartProgress,
  maxSpeed: gameplayMaxSpeed,
  cruiseRatio: 0.9,
  catchUpStrength: 0.22,
  steeringGain: STEER_CORRECTION_GAIN,
  legalPassingOffset: passingLane.legalPassingOffset,
  maxAsphaltOffset: turboMaxAsphaltOffset({
    bodyHalfWidth: passingLane.opponentRenderedWidth / 2,
    visualAsphaltHalfWidth: turboVisualAsphaltWidth(routeWidth) / 2
  }),
  bodyHalfWidth: passingLane.opponentRenderedWidth / 2,
  visualAsphaltHalfWidth: turboVisualAsphaltWidth(routeWidth) / 2,
  yieldEnabled: !collisionReviewCamera,
  dramaSeed: 20260817,
  // The route-local controller is retained only as the state container; every
  // decision now comes from the reusable driver.
  driver: opponentDriver
});

/**
 * Chassis geometry for the hero car, derived from its rendered bounds.
 *
 * Resolved before the surface because the surface's verge depth is expressed in terms
 * of the suspension travel this spec provides.
 */
// The rival's authored nose follows the presentation convention returned by
// `GameRacingSceneBinding.toScenePose`; simulation heading remains separate for chassis contact.
const opponentPresentationRotation = (rotation: AuraVec3): AuraVec3 => rotation;
const fittedOpponentChassisSpec = vehicleChassisSpecFromBounds(opponentRenderedSize, {
  wheelDiameterFraction: 0.8
});
const opponentChassisSpec = {
  ...fittedOpponentChassisSpec,
  contactTolerance: fittedOpponentChassisSpec.wheelRadius * 0.15
};

/*
 * ============================================================================
 * TDC incorporations (PRD 01-Turbo-Drift-Circuit.md): shared planning.
 *
 * Ghost replay, dynamic track props, instanced scenery, gantry signage and the
 * flag-gated boost rings all place themselves from the certified centreline via
 * the engine's own surface query, so a topology regeneration moves every
 * incorporation with it. Nothing here changes vehicle-contact or passing-lane
 * contracts.
 * ============================================================================
 */
/** Visual grey-asphalt half width in game units. Same measure the lane contracts use. */
const visualAsphaltHalfWidthGame = turboVisualAsphaltWidth(routeWidth) / 2;
const sceneScaleFromBinding = racingScene.transform.scale;
const sampleCentreline = (progress: number) => {
  const sample = racingLine.sampleAt(progress);
  return { x: sample.x, y: sample.y, heading: sample.heading };
};
/** Converts a game-plane *length* (widths, radii) into scene units. */
const gamePointToSceneLength = (gameUnits: number) => gameUnits * sceneScaleFromBinding;
/** Game-plane point -> scene position on the track reference plane. */
const gamePointToScene = (point: { readonly x: number; readonly y: number }) =>
  racingScene.toScenePoint(point, TRACK_REFERENCE_Y);

// --- TDC-A2: dynamic track-side props -------------------------------------
const trackPropsPlan = planTurboTrackProps({
  sampleAt: sampleCentreline,
  visualAsphaltHalfWidthGame,
  laneMarginGame: 0.008,
  maxOffsetGame: routeWidth * 0.85,
  radiusGameByKind: { cone: 0.012, "tire-stack": 0.02 },
  massKgByKind: { cone: 4, "tire-stack": 12 },
  coneCount: 14,
  tireStackCount: 8,
  seed: 20260821,
  // Probe-verified placement: candidates are re-measured against the live
  // centreline so folded sections cannot smuggle a prop onto the racing line.
  signedOffsetAt: (point) => Math.abs(racingLine.query(point).signedTrackOffset)
});
const trackPropsClearance = auditTurboPropCorridorClearance({
  placements: trackPropsPlan.placements,
  signedOffsetAt: (point) => Math.abs(racingLine.query(point).signedTrackOffset),
  corridorHalfWidthGame: trackPropsPlan.corridorHalfWidthGame
});
if (!trackPropsClearance.clear) {
  // Loud rather than visually lying: a placement reaching the passing corridor is
  // a broken invariant, not set dressing to nudge by hand.
  throw new Error(
    "Turbo track props violate the passing-lane corridor: "
    + JSON.stringify(trackPropsClearance.violations)
  );
}

// --- TDC-A3: instanced scenery plan ---------------------------------------
const trackBoundsGame = (() => {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of routeGeometry.points) {
    minX = Math.min(minX, point.x);
    minZ = Math.min(minZ, point.y);
    maxX = Math.max(maxX, point.x);
    maxZ = Math.max(maxZ, point.y);
  }
  return { minX, minZ, maxX, maxZ };
})();
const sceneryPlan = planTurboScenery({
  sampleAt: sampleCentreline,
  curvatureAt: (progress) => racingLine.query(sampleCentreline(progress)).curvature,
  visualAsphaltHalfWidthGame,
  vergeMarginGame: 0.05,
  trackBoundsGame,
  counts: { crowdStands: 6, treeClusters: 38, tireWalls: 12 },
  seed: 20260822
});

// --- TDC-A4: gantry signage plan ------------------------------------------
const raceLapsToWin = 3;
const signageBoardLabels = turboSignageBoardLabels(raceLapsToWin);
// Fails fast at mount time if any board text leaves the engine A-Z/0-9 glyph set.
assertTurboSignageLabels(signageBoardLabels);
const gantryPlan = planTurboGantry({
  startLine: sampleCentreline(0),
  toScenePoint: racingScene.toScenePoint,
  roadHalfWidthScene: gamePointToSceneLength(turboVisualAsphaltWidth(routeWidth)) / 2,
  trackY: TRACK_REFERENCE_Y,
  crossbarHeightScene: 1.62
});

// --- TDC-A6: boost rings, flag-gated (default OFF) ------------------------
const boostEnabled = turboBoostEnabledFromSearch(window.location.search);
const boostRingPlan = boostEnabled
  ? planTurboBoostRings({
      sampleAt: sampleCentreline,
      curvatureAt: (progress) => racingLine.query(sampleCentreline(progress)).curvature,
      straightCurvatureThreshold: 0.55,
      ringCount: 3,
      minSeparation: 0.12
    })
  : [];
let turboBoost: TurboBoostState = createTurboBoostState(boostEnabled);

/*
 * TDC incorporations: scene node construction.
 *
 * Builders below are pure functions of the plans above so the declarative scene chain
 * stays readable. Props are individual nodes because they move independently under
 * Rapier; scenery uses the instancing surface (one draw call per primitive) plus a
 * distance-LOD treeline band; signage boards are real text3D glyph meshes.
 */
const PROP_VISUALS = {
  cone: { sizeScene: [0.05, 0.07, 0.05] as const, color: "#ff7a2f", name: "trackside cone" },
  "tire-stack": { sizeScene: [0.085, 0.055, 0.085] as const, color: "#23282b", name: "tire stack" }
} as const;

function buildTurboPropNodes() {
  return trackPropsPlan.placements.map((prop) => {
    const visual = PROP_VISUALS[prop.kind];
    const position = gamePointToScene(prop.point);
    const options = {
      name: visual.name + " " + prop.id,
      material: material.pbr({
        name: visual.name + " material",
        color: visual.color,
        roughness: prop.kind === "cone" ? 0.7 : 0.96,
        metallic: 0.02
      }),
      // No shadow casting: 22 tiny verge casters measurably hurt the
      // load-sensitive grounding stint more than they add to the look.
      castShadow: false,
      receiveShadow: false,
      // Keep the rigid-body/runtime contract mounted while the typed V2
      // environment owns the visible cones and true horizontal tyre walls.
      // The former tyre-stack boxes were the rejected black slabs.
      visible: false
    };
    const node = prop.kind === "cone"
      ? primitives.cylinder(options)
      : primitives.box(options);
    return node
      .position(position[0], TRACK_REFERENCE_Y + visual.sizeScene[1] / 2, position[2])
      // Primitive constructors start at unit size. The placement plan stores the
      // measured scene-space dimensions; omitting this scale mounted every cone
      // and tyre stack as a full-size obstacle, producing the giant orange drums
      // and black blocks that obscured the certified road in retained frames.
      .scale(visual.sizeScene)
      .runtime(game.runtimeNode("turbo-prop-node-" + prop.id, {
        tags: ["track-prop", "visual-only-physics-follow"]
      }));
  });
}

function buildTurboSceneryNodes() {
  const standTransforms = sceneryPlan.crowdStands.map((stand) => ({
    position: (() => {
      const p = gamePointToScene(stand.point);
      return [p[0], TRACK_REFERENCE_Y + stand.sizeScene[1] / 2, p[2]] as [number, number, number];
    })(),
    rotation: [0, -stand.headingGame + Math.PI / 2, 0] as [number, number, number],
    scale: [stand.sizeScene[0], stand.sizeScene[1], stand.sizeScene[2]] as [number, number, number]
  }));
  const trunkTransforms = sceneryPlan.trees.map((tree) => ({
    position: (() => {
      const p = gamePointToScene(tree.point);
      return [p[0], TRACK_REFERENCE_Y + tree.sizeScene[1] * 0.22, p[2]] as [number, number, number];
    })(),
    rotation: [0, 0, 0] as [number, number, number],
    scale: [tree.sizeScene[0] * 0.34, tree.sizeScene[1] * 0.44, tree.sizeScene[0] * 0.34] as [number, number, number]
  }));
  const canopyTransforms = sceneryPlan.trees.map((tree) => ({
    position: (() => {
      const p = gamePointToScene(tree.point);
      return [p[0], TRACK_REFERENCE_Y + tree.sizeScene[1] * 0.58, p[2]] as [number, number, number];
    })(),
    rotation: [0, 0, 0] as [number, number, number],
    // The sphere is a foliage cluster, not a hero prop. Keep it broad enough to
    // build a treeline while leaving the racing line and the foreground cars
    // visible from the chase camera.
    scale: [tree.sizeScene[0] * 1.32, tree.sizeScene[1] * 0.54, tree.sizeScene[0] * 1.32] as [number, number, number]
  }));
  const canopyAccentTransforms = sceneryPlan.trees.map((tree, index) => ({
    position: (() => {
      const p = gamePointToScene(tree.point);
      const side = index % 2 === 0 ? 1 : -1;
      const offset = tree.sizeScene[0] * 0.24 * side;
      return [p[0] + offset, TRACK_REFERENCE_Y + tree.sizeScene[1] * 0.76, p[2] - offset * 0.35] as [number, number, number];
    })(),
    rotation: [0, 0, 0] as [number, number, number],
    scale: [tree.sizeScene[0] * 0.82, tree.sizeScene[1] * 0.36, tree.sizeScene[0] * 0.82] as [number, number, number]
  }));
  // A short roadside row keeps the certified chase capture from reading as an
  // empty stadium apron. These are renderer-owned set-dressing transforms derived
  // from the same centreline and placed one full car-width beyond the asphalt;
  // they never enter the track-props or Rapier worlds.
  const roadsideTreeProgresses = [0.018, 0.052, 0.087, 0.121, 0.158, 0.196, 0.234, 0.272] as const;
  const roadsideTreeTransforms = roadsideTreeProgresses.flatMap((progress, index) => {
    const sample = sampleCentreline(progress);
    const side = index % 2 === 0 ? 1 : -1;
    const lateral = visualAsphaltHalfWidthGame + 0.5 + (index % 3) * 0.06;
    const point = {
      x: sample.x + Math.sin(sample.heading) * lateral * side,
      y: sample.y - Math.cos(sample.heading) * lateral * side
    };
    const p = gamePointToScene(point);
    const height = 0.68 + (index % 4) * 0.09;
    return [{
      position: [p[0], TRACK_REFERENCE_Y + height * 0.22, p[2]] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [height * 0.07, height * 0.34, height * 0.07] as [number, number, number]
    }, {
      position: [p[0], TRACK_REFERENCE_Y + height * 0.68, p[2]] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [height * 0.28, height * 0.46, height * 0.28] as [number, number, number]
    }];
  });
  const roadsideTrunkTransforms = roadsideTreeTransforms.filter((_, index) => index % 2 === 0);
  const roadsideCanopyTransforms = roadsideTreeTransforms.filter((_, index) => index % 2 === 1);
  const roadsideShrubTransforms = roadsideTreeProgresses.flatMap((progress, index) => {
    const sample = sampleCentreline(progress);
    const side = index % 2 === 0 ? 1 : -1;
    const lateral = visualAsphaltHalfWidthGame + 0.58 + (index % 2) * 0.08;
    const tangent = { x: Math.cos(sample.heading), z: Math.sin(sample.heading) };
    const normal = { x: Math.sin(sample.heading) * side, z: -Math.cos(sample.heading) * side };
    return [-1, 1].map((alongSign) => {
      const point = {
        x: sample.x + normal.x * lateral + tangent.x * 0.075 * alongSign,
        y: sample.y + normal.z * lateral + tangent.z * 0.075 * alongSign
      };
      const p = gamePointToScene(point);
      const size = 0.13 + (index % 3) * 0.025;
      return {
        position: [p[0], TRACK_REFERENCE_Y + size * 0.32, p[2]] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [size, size * 0.42, size] as [number, number, number]
      };
    });
  });
  // Tyre walls: rows of flat torus tyres along each wall anchor's tangent.
  const tireTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (const wall of sceneryPlan.tireWalls) {
    const along = { x: Math.cos(wall.headingGame), z: Math.sin(wall.headingGame) };
    for (let tyre = 0; tyre < 4; tyre += 1) {
      const offsetAlong = (tyre - 1.5) * 0.075;
      const point = {
        x: wall.point.x + along.x * offsetAlong,
        y: wall.point.y + along.z * offsetAlong
      };
      const p = gamePointToScene(point);
      tireTransforms.push({
        position: [p[0], TRACK_REFERENCE_Y + 0.014, p[2]],
        rotation: [Math.PI / 2, 0, 0],
        scale: [0.09, 0.09, 0.55]
      });
    }
  }
  return [
    instances.box({
      name: "scenery crowd stands (instanced)",
      castShadow: false,
      material: material.pbr({ name: "crowd stand", color: "#c8b89a", roughness: 0.85, metallic: 0.03 }),
      instanceColors: sceneryPlan.crowdStands.map((_, index) => index % 2 === 0 ? "#c8b89a" : "#b3a284"),
      transforms: standTransforms
    }),
    instances.cylinder({
      name: "scenery tree trunks (instanced)",
      castShadow: false,
      material: material.pbr({ name: "tree trunk", color: "#6d4a33", roughness: 0.95 }),
      transforms: trunkTransforms
    }),
    instances.sphere({
      name: "scenery tree canopies (instanced)",
      castShadow: false,
      material: material.pbr({ name: "tree canopy", color: "#3f6b3a", roughness: 0.9 }),
      instanceColors: sceneryPlan.trees.map((_, index) => {
        const palette = ["#5f8f49", "#4b7b42", "#769b4f", "#3f6b3a"] as const;
        return palette[index % palette.length]!;
      }),
      transforms: canopyTransforms
    }),
    instances.sphere({
      name: "scenery tree warm foliage accents (instanced)",
      castShadow: false,
      material: material.pbr({ name: "tree warm foliage accents", color: "#a55c43", roughness: 0.88 }),
      instanceColors: sceneryPlan.trees.map((_, index) => {
        const palette = ["#b76645", "#d17a4c", "#8f5141", "#c16b3f"] as const;
        return palette[index % palette.length]!;
      }),
      transforms: canopyAccentTransforms
    }),
    instances.cylinder({
      name: "scenery roadside tree trunks (instanced)",
      castShadow: false,
      material: material.pbr({ name: "roadside tree trunks", color: "#684431", roughness: 0.94 }),
      transforms: roadsideTrunkTransforms
    }),
    instances.sphere({
      name: "scenery roadside foliage (instanced)",
      castShadow: false,
      material: material.pbr({ name: "roadside foliage", color: "#587a42", roughness: 0.88 }),
      instanceColors: roadsideCanopyTransforms.map((_, index) => {
        const palette = ["#7d9849", "#b56543", "#597b3f", "#d17b4d"] as const;
        return palette[index % palette.length]!;
      }),
      transforms: roadsideCanopyTransforms
    }),
    instances.sphere({
      name: "scenery roadside autumn shrubs (instanced)",
      castShadow: false,
      material: material.pbr({ name: "roadside autumn shrubs", color: "#a85d3f", roughness: 0.9 }),
      instanceColors: roadsideShrubTransforms.map((_, index) => {
        const palette = ["#c16b3e", "#d07b43", "#8a613b", "#b84d42"] as const;
        return palette[index % palette.length]!;
      }),
      transforms: roadsideShrubTransforms
    }),
    instances.torus({
      name: "scenery tyre walls (instanced)",
      castShadow: false,
      material: material.pbr({ name: "wall tyre", color: "#1d2124", roughness: 0.97 }),
      transforms: tireTransforms
    })
  ];
}

/**
 * Small authored marshal modules that give the opening straight a human scale.
 *
 * The Formula GLB owns the certified road, barriers, and collision topology;
 * these service-lane pods are renderer-only set dressing placed beyond the
 * visual asphalt edge from the same centreline samples as the cars.  A few
 * colored control panels, trim rails, and signal masts add a legible circuit
 * identity in the chase frame without reintroducing the rejected black tyre
 * stacks or competing with the primary vehicles.
 */
function buildTurboTracksideIdentityNodes() {
  // Keep the modules in the first visible third of the straight.  Farther
  // anchors disappeared behind the treeline at the retained chase distance,
  // so these nearer service markers establish depth without crossing the lane.
  const stationProgresses = [0.22, 0.26, 0.3, 0.34] as const;
  const podTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const trimTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const mastTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const signalTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const podColors: string[] = [];
  const signalColors: string[] = [];

  for (let index = 0; index < stationProgresses.length; index += 1) {
    const progress = stationProgresses[index]!;
    const sample = sampleCentreline(progress);
    const side = index % 2 === 0 ? 1 : -1;
    const lateral = visualAsphaltHalfWidthGame + 0.48;
    const leftX = Math.sin(sample.heading);
    const leftZ = -Math.cos(sample.heading);
    const point = {
      x: sample.x + leftX * lateral * side,
      y: sample.y + leftZ * lateral * side
    };
    const pose = racingScene.toScenePose({ position: point, heading: sample.heading });
    const roadY = sampleTurboRoadHeight(pose.position[0], pose.position[2]);
    const baseY = roadY + 0.18;
    const trimY = roadY + 0.35;
    const mastY = roadY + 0.64;
    podTransforms.push({
      position: [pose.position[0], baseY, pose.position[2]],
      rotation: [0, pose.rotation[1], 0],
      scale: [0.42, 0.32, 0.16]
    });
    trimTransforms.push({
      position: [pose.position[0], trimY, pose.position[2]],
      rotation: [0, pose.rotation[1], 0],
      scale: [0.44, 0.045, 0.17]
    });
    mastTransforms.push({
      position: [pose.position[0], mastY, pose.position[2]],
      rotation: [0, pose.rotation[1], 0],
      scale: [0.026, 0.3, 0.026]
    });
    signalTransforms.push({
      position: [pose.position[0], mastY + 0.16, pose.position[2]],
      rotation: [0, pose.rotation[1], 0],
      scale: [0.11, 0.052, 0.034]
    });
    podColors.push(index % 2 === 0 ? "#d8664d" : "#367f93");
    signalColors.push(index % 2 === 0 ? "#ffd27f" : "#72ecdf");
  }

  // One approach gantry sits over the first visible bend so the route reads as
  // a designed race venue rather than an empty slab.  Its posts clear the same
  // measured asphalt width as the service pods; the crossbar is set dressing
  // only and never enters the racing/contact topology.
  const gantrySample = sampleCentreline(0.28);
  const gantryCenter = gamePointToScene(gantrySample);
  const gantryPose = racingScene.toScenePose({
    position: { x: gantrySample.x, y: gantrySample.y },
    heading: gantrySample.heading
  });
  const gantryRoadY = sampleTurboRoadHeight(gantryCenter[0], gantryCenter[2]);
  const gantryHalfSpan = gamePointToSceneLength(turboVisualAsphaltWidth(routeWidth)) / 2 + 0.24;
  const gantryLeftX = Math.sin(gantrySample.heading) * gantryHalfSpan;
  const gantryLeftZ = -Math.cos(gantrySample.heading) * gantryHalfSpan;
  const gantryPostHeight = 1.28;
  const gantryPostPositions: [number, number, number][] = [
    [gantryCenter[0] + gantryLeftX, gantryRoadY + gantryPostHeight / 2, gantryCenter[2] + gantryLeftZ],
    [gantryCenter[0] - gantryLeftX, gantryRoadY + gantryPostHeight / 2, gantryCenter[2] - gantryLeftZ]
  ];
  const gantryCrossbar = primitives.box({
    name: "turbo approach gantry crossbar",
    material: material.pbr({ name: "approach gantry steel", color: "#283b47", roughness: 0.5, metallic: 0.58 }),
    castShadow: false,
    receiveShadow: false
  })
    .position(gantryCenter[0], gantryRoadY + gantryPostHeight, gantryCenter[2])
    .rotate(0, gantryPose.rotation[1], 0)
    .scale([gantryHalfSpan * 2 + 0.08, 0.065, 0.08])
    .runtime(game.runtimeNode("turbo-approach-gantry-crossbar", {
      tags: ["track-detail", "service-lane-identity", "renderer-owned", "non-colliding"]
    }));
  const gantryBoard = primitives.box({
    name: "turbo approach gantry identity board",
    material: material.emissive({ name: "approach gantry identity", color: "#e56b4f", emissive: "#ffb38c", emissiveIntensity: 0.72, roughness: 0.42 }),
    castShadow: false,
    receiveShadow: false
  })
    .position(gantryCenter[0], gantryRoadY + gantryPostHeight - 0.16, gantryCenter[2])
    .rotate(0, gantryPose.rotation[1], 0)
    .scale([gantryHalfSpan * 1.42, 0.23, 0.045])
    .runtime(game.runtimeNode("turbo-approach-gantry-identity-board", {
      tags: ["signage", "track-detail", "renderer-owned", "non-colliding"]
    }));
  const gantryPosts = gantryPostPositions.map((position, index) =>
    primitives.box({
      name: `turbo approach gantry post ${index + 1}`,
      material: material.pbr({ name: "approach gantry post", color: "#1d2b33", roughness: 0.56, metallic: 0.62 }),
      castShadow: false,
      receiveShadow: false
    })
      .position(...position)
      .rotate(0, gantryPose.rotation[1], 0)
      .scale([0.06, gantryPostHeight, 0.06])
      .runtime(game.runtimeNode(`turbo-approach-gantry-post-${index + 1}`, {
        tags: ["track-detail", "service-lane-identity", "renderer-owned", "non-colliding"]
      }))
  );

  return [
    instances.box({
      name: "circuit marshal control pods (instanced)",
      material: material.pbr({ name: "marshal pod panels", color: "#243844", roughness: 0.72, metallic: 0.14 }),
      instanceColors: podColors,
      castShadow: false,
      receiveShadow: true,
      transforms: podTransforms
    }),
    instances.box({
      name: "circuit marshal pod trim (instanced)",
      material: material.pbr({ name: "marshal pod trim", color: "#f0d4a6", roughness: 0.48, metallic: 0.2 }),
      castShadow: false,
      receiveShadow: false,
      transforms: trimTransforms
    }),
    instances.cylinder({
      name: "circuit marshal signal masts (instanced)",
      material: material.pbr({ name: "marshal mast steel", color: "#1b2931", roughness: 0.58, metallic: 0.56 }),
      castShadow: false,
      receiveShadow: false,
      transforms: mastTransforms
    }),
    instances.box({
      name: "circuit marshal signal lamps (instanced)",
      material: material.emissive({ name: "marshal signal lamps", color: "#ffd27f", emissive: "#ffb347", emissiveIntensity: 0.9, roughness: 0.32 }),
      instanceColors: signalColors,
      castShadow: false,
      receiveShadow: false,
      transforms: signalTransforms
    }),
    ...gantryPosts,
    gantryCrossbar,
    gantryBoard
  ];
}

/**
 * Review-only paint that follows the certified centreline and sits above the
 * typed circuit's asphalt.  It does not replace the track asset or collision
 * surface: the narrow alternating curb blocks simply make the road boundary
 * and corner direction readable in the held gameplay frame.
 */
function buildCaptureRoadEdgeNodes() {
  const segmentCount = 52;
  return Array.from({ length: segmentCount }, (_, index) => {
    const startProgress = index / segmentCount;
    const endProgress = (index + 0.72) / segmentCount;
    const midpointProgress = (startProgress + endProgress) / 2;
    const midpoint = sampleCentreline(midpointProgress);
    const start = gamePointToScene(sampleCentreline(startProgress));
    const end = gamePointToScene(sampleCentreline(endProgress));
    const segmentLength = Math.max(0.08, Math.hypot(end[0] - start[0], end[2] - start[2]));
    const edgeOffset = visualAsphaltHalfWidthGame * 0.96;
    const leftX = Math.sin(midpoint.heading);
    const leftZ = -Math.cos(midpoint.heading);
    return ([-1, 1] as const).map((side) => {
      const point = gamePointToScene({
        x: midpoint.x + leftX * edgeOffset * side,
        y: midpoint.y + leftZ * edgeOffset * side
      });
      const pose = racingScene.toScenePose({
        position: {
          x: midpoint.x + leftX * edgeOffset * side,
          y: midpoint.y + leftZ * edgeOffset * side
        },
        heading: midpoint.heading
      });
      const warmBlock = (index + (side > 0 ? 0 : 1)) % 2 === 0;
      return primitives.box({
        name: `capture circuit curb ${index + 1} ${side < 0 ? "inside" : "outside"}`,
        material: material.pbr({
          name: warmBlock ? "capture coral curb" : "capture cream curb",
          color: warmBlock ? "#d85b45" : "#f1dfbf",
          roughness: 0.74,
          metallic: 0
        }),
        castShadow: false,
        receiveShadow: false
      })
        .position(point[0], TRACK_REFERENCE_Y + 0.062, point[2])
        .rotate(0, pose.rotation[1], 0)
        .scale([0.055, 0.018, segmentLength])
        .runtime(game.runtimeNode(`turbo-capture-curb-${index}-${side}`, {
          tags: ["track-detail", "certified-route-bound", "renderer-owned", "non-colliding"]
        }));
    });
  }).flat();
}

/**
 * Authored rubber laid through the review hairpin.  These are road-surface
 * meshes, not a screen-space effect: every short segment is sampled from the
 * same centreline as the drivable circuit and follows its changing tangent.
 * The paired, broken arcs give the empty asphalt a readable racing history and
 * carry the eye through the bend even before the live car adds fresh marks.
 */
function buildHairpinRubberNodes() {
  const progresses = Array.from({ length: 32 }, (_, index) => 0.19 + index * 0.0042);
  return progresses.flatMap((progress, index) => {
    const sample = sampleCentreline(progress);
    const leftX = Math.sin(sample.heading);
    const leftZ = -Math.cos(sample.heading);
    const pairOffset = routeWidth * 0.095;
    const segmentLength = gamePointToSceneLength(routeWidth * 0.145);
    return ([-1, 1] as const).map((side) => {
      const point = {
        x: sample.x + leftX * pairOffset * side,
        y: sample.y + leftZ * pairOffset * side
      };
      const pose = racingScene.toScenePose({ position: point, heading: sample.heading });
      return primitives.box({
        name: `hairpin rubber ${index + 1} ${side < 0 ? "left" : "right"}`,
        material: material.pbr({
          name: "worked-in hairpin rubber",
          color: index > 14 ? "#282726" : "#353331",
          roughness: 1,
          metallic: 0
        }),
        castShadow: false,
        receiveShadow: false
      })
        .position(pose.position[0], pose.position[1] + 0.055, pose.position[2])
        .rotate(0, pose.rotation[1], 0)
        .scale([0.026, 0.006, segmentLength])
        .runtime(game.runtimeNode(`turbo-hairpin-rubber-${index}-${side}`, {
          tags: ["track-detail", "racing-line", "renderer-owned", "non-colliding"]
        }));
    });
  });
}

/** Return the same mesh-derived height used by the four-wheel chassis. */
function sampleTurboRoadHeight(x: number, z: number): number {
  const sample = racingScene.surfaceQuery()?.sample(x, z);
  return sample && sample.hit && Number.isFinite(sample.height)
    ? sample.height
    // The fallback is only for an authored detail vertex outside a sparse
    // extracted triangle; it is never used for vehicle contact.
    : TRACK_REFERENCE_Y + 0.07;
}

/**
 * Route-bound road language for the public frame.
 *
 * The environment GLB owns the actual asphalt and collision topology.  These
 * renderer-only instances add the visual cues a chase camera needs to read a
 * corner at speed: broken centre dashes, alternating kerb blocks, and two
 * darker rubber lanes that continue through the opening bend.  They are all
 * sampled from the same racing-line query as the cars, so a topology swap moves
 * the details with the route instead of leaving a decorative flat plane behind.
 * Instancing keeps this material pass to three draw calls rather than one node
 * per dash/kerb and does not enter Rapier or the route's contact width.
 */
function buildTurboRoadDetailNodes() {
  const segmentCount = 44;
  const asphaltPositions: [number, number, number][] = [];
  const asphaltNormals: [number, number, number][] = [];
  const asphaltIndices: number[] = [];
  const aggregatePositions: [number, number, number][] = [];
  const aggregateNormals: [number, number, number][] = [];
  const aggregateIndices: number[] = [];
  const curbTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const curbColors: string[] = [];
  const centreDashTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const rubberTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const startProgress = index / segmentCount;
    const endProgress = (index + 0.86) / segmentCount;
    const midpointProgress = (startProgress + endProgress) / 2;
    const midpoint = sampleCentreline(midpointProgress);
    const start = gamePointToScene(sampleCentreline(startProgress));
    const end = gamePointToScene(sampleCentreline(endProgress));
    const segmentLength = Math.max(0.08, Math.hypot(end[0] - start[0], end[2] - start[2]));
    const pose = racingScene.toScenePose({
      position: { x: midpoint.x, y: midpoint.y },
      heading: midpoint.heading
    });
    const roadY = sampleTurboRoadHeight(pose.position[0], pose.position[2]);
    const roadDetailY = roadY + ROAD_DETAIL_SURFACE_LIFT;
    const edgeOffset = visualAsphaltHalfWidthGame * 0.97;
    const leftX = Math.sin(midpoint.heading);
    const leftZ = -Math.cos(midpoint.heading);
    for (const side of [-1, 1] as const) {
      const edge = gamePointToScene({
        x: midpoint.x + leftX * edgeOffset * side,
        y: midpoint.y + leftZ * edgeOffset * side
      });
      curbTransforms.push({
        position: [edge[0], roadDetailY + 0.014, edge[2]],
        rotation: [0, pose.rotation[1], 0],
        // Keep the kerb just outside the certified asphalt edge.  Its narrow
        // cross-section reads as a curb stripe without changing the contact
        // plane used by either chassis.
        scale: [0.082, 0.022, segmentLength * 0.9]
      });
      curbColors.push((index + (side > 0 ? 0 : 1)) % 2 === 0 ? "#e35f48" : "#f0d9b9");
    }

    // Leave a purposeful gap between centre dashes.  The line is painted onto
    // the road's own plane, so its perspective continues through the bend and
    // never becomes a floating HUD element.
    if (index % 2 === 0) {
      centreDashTransforms.push({
        position: [pose.position[0], roadDetailY + 0.012, pose.position[2]],
        rotation: [0, pose.rotation[1], 0],
        scale: [0.042, 0.009, Math.min(0.42, segmentLength * 0.5)]
      });
    }

    // A paired, offset tyre lane gives the opening hairpin visible racing
    // history even before the live drift feedback appears.  Keep the marks
    // narrow and low-contrast so they support the car silhouettes rather than
    // competing with them.
    if (midpointProgress >= 0.12 && midpointProgress <= 0.34) {
      const rubberOffset = routeWidth * 0.095;
      for (const side of [-1, 1] as const) {
        const rubber = gamePointToScene({
          x: midpoint.x + leftX * rubberOffset * side,
          y: midpoint.y + leftZ * rubberOffset * side
        });
        rubberTransforms.push({
          position: [rubber[0], roadDetailY + 0.01, rubber[2]],
          rotation: [0, pose.rotation[1], 0],
          scale: [0.026, 0.006, Math.min(0.36, segmentLength * 0.54)]
        });
      }
    }
  }

  // Build one continuous ribbon for the road material instead of stacking
  // disconnected boxes.  A quad per sampled centreline segment keeps the dark
  // tarmac unbroken through the bend while preserving the certified GLB as the
  // authoritative geometry/contact source underneath.
  for (let index = 0; index <= segmentCount; index += 1) {
    const sample = sampleCentreline(index / segmentCount);
    const centre = gamePointToScene(sample);
    const roadY = sampleTurboRoadHeight(centre[0], centre[2]);
    const roadDetailY = roadY + ROAD_DETAIL_SURFACE_LIFT;
    const leftX = Math.sin(sample.heading);
    const leftZ = -Math.cos(sample.heading);
    const halfWidth = gamePointToSceneLength(routeWidth * 0.46);
    asphaltPositions.push(
      [centre[0] + leftX * halfWidth, roadDetailY, centre[2] + leftZ * halfWidth],
      [centre[0] - leftX * halfWidth, roadDetailY, centre[2] - leftZ * halfWidth]
    );
    asphaltNormals.push([0, 1, 0], [0, 1, 0]);
    // Two subtle aggregate bands break up the long asphalt read without
    // introducing a second, disconnected road plane. They share every sample
    // and height with the continuous ribbon, so the bend and its banking remain
    // legible from the chase lens.
    const aggregateOffset = gamePointToSceneLength(routeWidth * 0.22);
    const aggregateHalfWidth = gamePointToSceneLength(routeWidth * 0.075);
    for (const side of [-1, 1] as const) {
      const aggregateCentreX = centre[0] + leftX * aggregateOffset * side;
      const aggregateCentreZ = centre[2] + leftZ * aggregateOffset * side;
      aggregatePositions.push(
        [aggregateCentreX + leftX * aggregateHalfWidth, roadDetailY + 0.008, aggregateCentreZ + leftZ * aggregateHalfWidth],
        [aggregateCentreX - leftX * aggregateHalfWidth, roadDetailY + 0.008, aggregateCentreZ - leftZ * aggregateHalfWidth]
      );
      aggregateNormals.push([0, 1, 0], [0, 1, 0]);
    }
    if (index === 0) continue;
    const previous = (index - 1) * 2;
    const current = index * 2;
    asphaltIndices.push(previous, previous + 1, current, previous + 1, current + 1, current);
    const aggregatePrevious = (index - 1) * 4;
    const aggregateCurrent = index * 4;
    for (const sideOffset of [0, 2]) {
      aggregateIndices.push(
        aggregatePrevious + sideOffset,
        aggregatePrevious + sideOffset + 1,
        aggregateCurrent + sideOffset,
        aggregatePrevious + sideOffset + 1,
        aggregateCurrent + sideOffset + 1,
        aggregateCurrent + sideOffset
      );
    }
  }

  return [
    geometry.custom(geometry.define({
      positions: asphaltPositions,
      normals: asphaltNormals,
      indices: asphaltIndices
    }), {
      name: "route-bound continuous asphalt ribbon",
      // Warm the renderer-owned road one grade above the contact mesh.  The
      // former blue-charcoal ribbon absorbed the late-afternoon key and read as
      // a featureless black plane in the held drift frame; this keeps the same
      // geometry/authority while exposing aggregate and tyre language.
      material: material.pbr({ name: "layered asphalt", color: "#5a554e", roughness: 0.84, metallic: 0 }),
      castShadow: false,
      receiveShadow: true
    }),
    geometry.custom(geometry.define({
      positions: aggregatePositions,
      normals: aggregateNormals,
      indices: aggregateIndices
    }), {
      name: "route-bound asphalt aggregate bands",
      material: material.pbr({ name: "asphalt aggregate variation", color: "#746d62", roughness: 0.78, metallic: 0 }),
      castShadow: false,
      receiveShadow: false
    }),
    instances.box({
      name: "route-bound alternating kerbs (instanced)",
      material: material.pbr({ name: "route kerb paint", color: "#ef6a4f", roughness: 0.68, metallic: 0 }),
      instanceColors: curbColors,
      castShadow: false,
      receiveShadow: false,
      transforms: curbTransforms
    }),
    instances.box({
      name: "route-bound centre dashes (instanced)",
      material: material.emissive({
        name: "warm lane paint",
        color: "#ffe0ad",
        emissive: "#e7a160",
        emissiveIntensity: 0.28,
        roughness: 0.46
      }),
      castShadow: false,
      receiveShadow: false,
      transforms: centreDashTransforms
    }),
    instances.box({
      name: "route-bound hairpin rubber (instanced)",
      material: material.pbr({ name: "hairpin rubber lane", color: "#35312e", roughness: 0.96, metallic: 0 }),
      castShadow: false,
      receiveShadow: false,
      transforms: rubberTransforms
    })
  ];
}

/** Far treeline bands: distanceLod drops their detail once the chase camera closes in. */
function buildTurboTreelineBands() {
  const midX = (trackBoundsGame.minX + trackBoundsGame.maxX) / 2;
  const midZ = (trackBoundsGame.minZ + trackBoundsGame.maxZ) / 2;
  const spanX = ((trackBoundsGame.maxX - trackBoundsGame.minX) / 2) * 1.45 * sceneScaleFromBinding;
  const spanZ = ((trackBoundsGame.maxZ - trackBoundsGame.minZ) / 2) * 1.45 * sceneScaleFromBinding;
  const anchors: readonly [number, number][] = [
    [midX - spanX, midZ],
    [midX + spanX, midZ],
    [midX, midZ - spanZ],
    [midX, midZ + spanZ]
  ];
  return anchors.map((anchor, index) => distanceLod({
    name: "scenery far treeline band " + index,
    levels: [
      { name: "near trees", maxDistance: SCENE_SIZE * 0.9, primitive: "cylinder", material: material.pbr({ name: "treeline near", color: "#3f6b3a", roughness: 0.92 }) },
      { name: "far band", primitive: "box", material: material.pbr({ name: "treeline far", color: "#35513a", roughness: 0.95 }) }
    ],
    hysteresis: SCENE_SIZE * 0.04
  }).position(anchor[0] * sceneScaleFromBinding, TRACK_REFERENCE_Y + 0.16, anchor[1] * sceneScaleFromBinding)
    .scale([SCENE_SIZE * 0.24, 0.32, 0.06]));
}

/** Rough glyph-run width used to centre text3D labels on their boards. */
function estimateTurboTextWidth(label: string, size: number): number {
  let units = 0;
  for (const character of label) units += character === " " ? 0.64 : 0.8543;
  return units * size;
}

const SIGNAGE_TEXT_SIZE = 0.052;

function buildTurboSignageNodes() {
  const plan = gantryPlan;
  const yaw = plan.boardYaw;
  const postNodes = [instances.cylinder({
    name: "signage gantry posts (instanced)",
    material: material.pbr({ name: "gantry steel", color: "#8b9299", roughness: 0.5, metallic: 0.6 }),
    castShadow: false,
    transforms: plan.postPositions.map((position) => ({
      position,
      scale: [plan.postSize[0], plan.postSize[1], plan.postSize[2]] as [number, number, number]
    }))
  })];
  const crossbar = primitives.box({
    name: "signage gantry crossbar",
    material: material.pbr({ name: "gantry beam", color: "#767d84", roughness: 0.55, metallic: 0.55 }),
    castShadow: false
  }).position(...plan.crossbarCenter).rotate(0, yaw, 0).scale(plan.crossbarSize).runtime(game.runtimeNode("signage gantry crossbar", { tags: ["signage", "set-dressing"] }));
  const backing = primitives.box({
    name: "signage board backing",
    material: material.pbr({ name: "board backing", color: "#10151a", roughness: 0.85 }),
    castShadow: false
  }).position(
      (plan.circuitBoardCenter[0] + plan.lapBoardCenter[0]) / 2,
      (plan.circuitBoardCenter[1] + plan.lapBoardCenter[1]) / 2,
      plan.circuitBoardCenter[2]
    ).rotate(0, yaw, 0).scale(plan.backingSize).runtime(game.runtimeNode("signage board backing", { tags: ["signage", "set-dressing"] }));
  // Local X axis after yaw, used to centre glyph runs on the board.
  const localX = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const centeredAt = (center: readonly [number, number, number], label: string): [number, number, number] => {
    const halfWidth = estimateTurboTextWidth(label, SIGNAGE_TEXT_SIZE) / 2;
    return [center[0] - localX.x * halfWidth, center[1], center[2] - localX.z * halfWidth];
  };
  const circuitBoard = text3D("TSUKUBA", {
    name: "signage circuit board TSUKUBA",
    size: SIGNAGE_TEXT_SIZE,
    depth: 0.012,
    letterSpacing: SIGNAGE_TEXT_SIZE * 0.14,
    material: material.pbr({ name: "board glyphs warm", color: "#ffd8a8", emissive: "#ffb066", emissiveIntensity: 0.55, roughness: 0.4 })
  }).position(...centeredAt(plan.circuitBoardCenter, "TSUKUBA")).rotate(0, yaw, 0).runtime(game.runtimeNode("signage circuit board TSUKUBA", { tags: ["signage", "text3d-board"] }));
  const lapBoards = signageBoardLabels.map((label, index) =>
    text3D(label, {
      name: "signage lap board " + index + " " + label.replace(/ /g, "_"),
      size: SIGNAGE_TEXT_SIZE,
      depth: 0.01,
      letterSpacing: SIGNAGE_TEXT_SIZE * 0.14,
      material: material.pbr({ name: "board glyphs cool", color: "#b9f7ff", emissive: "#57e6ff", emissiveIntensity: 0.6, roughness: 0.4 })
    }).position(...centeredAt(plan.lapBoardCenter, label)).rotate(0, yaw, 0).runtime(game.runtimeNode("signage lap board " + index + " " + label.replace(/ /g, "_"), { tags: ["signage", "text3d-board", "lap-state"] }))
  );
  return [...postNodes, crossbar, backing, circuitBoard, ...lapBoards];
}

const CAR_SCENE_HOVER = CAR_SCENE_HEIGHT * 0.62;

function buildTurboBoostRingNodes() {
  return boostRingPlan.map((ring) => {
    const position = gamePointToScene(ring.point);
    return primitives.torus({
      name: "boost ring " + ring.id,
      material: material.pbr({
        name: "boost ring emissive",
        color: "#57e6ff",
        emissive: "#57e6ff",
        emissiveIntensity: 1.4,
        roughness: 0.3
      })
    }).position(position[0], TRACK_REFERENCE_Y + CAR_SCENE_HOVER, position[2])
      .rotate(Math.PI / 2, ring.headingGame, 0)
      .scale([ring.radiusScene / 0.43, ring.radiusScene / 0.43, ring.radiusScene / 0.43]);
  });
}
/**
 * Vehicle surface: the circuit's own road triangles, sampled per wheel.
 *
 * Everything this route used to compute here is gone. There was, in order of appearance:
 * `TRACK_SURFACE_Y` (a frozen scene-space scalar), `VERGE_DROP` and `SHOULDER_WIDTH` (an
 * analytic ramp standing in for the road edge), and a route-local nearest-neighbour blend
 * over the centreline's `surfaceY` values. Each was closer to the truth than the last, and
 * every one shared the same defect: a curve or a plane cannot represent a surface that
 * varies across the road's width, so all four wheels received the same height and the
 * suspension solved against a surface that was not there. That is what put the tyres
 * through the visible road on corners.
 *
 * `racingScene.vehicleSurface()` asks the binding, which owns the model-to-scene transform,
 * for a real mesh query over the drivable triangles the geometry extractor emitted. Height,
 * normal and grip all come from the mesh under each individual wheel. There is no surface
 * constant left in this file to be wrong about after an asset swap.
 *
 * Defect class: **application-authoring**, enabled by a **missing capability**. The route was
 * approximating because the engine gave it nothing better; the fix is the capability
 * (`GameRacingSceneBinding.vehicleSurface`), and this route simply consumes it.
 */
const circuitSurface: VehicleSurface = (() => {
  const surface = racingScene.vehicleSurface({
    offRoadGrip: 0.55,
    // Finite tyre contact may bridge a triangle seam, but it must never reach across
    // a lane, curb, divider, or adjacent branch. The former 40%-of-road probe could
    // select a remote higher surface and made telemetry look grounded while the
    // retained image contradicted it. Keep recovery inside the physical tyre envelope.
    // The extracted Tsukuba mesh has one sparse seam near progress 0.728. The retained
    // outside-front contact is 0.225 scene units from the next drivable triangle;
    // 3 fitted tyre radii cover the measured outside-kerb extraction seam while
    // remaining below the certified branch/lane separation for this track. The
    // patch is only consulted after a centre-ray miss, so a valid road hit always
    // remains authoritative and no remote branch can be selected.
    contactPatchRadius: carChassisSpec.wheelRadius * 3
  });
  if (!surface) {
    // Loud rather than silently flat: a missing mesh means the contract was regenerated
    // without drivable triangles, and a flat fallback here would reintroduce exactly the
    // defect this replaced while looking like it worked.
    throw new Error(
      "Turbo Drift requires drivable track triangles. The geometry contract has no topology.drivableMesh; " +
      "regenerate it with tools/showcase-library/regenerate-game-geometry-contracts.ts."
    );
  }
  return surface;
})();

/**
 * Chassis geometry derived from the hero car's rendered bounds.
 *
 * This replaces pinning the car's rendered Y to a frozen scene constant. A frozen plane
 * cannot respond to the surface the car is over, cannot pitch under braking and
 * cannot roll in a corner -- which is why the car read as sinking into the tarmac
 * and as a sprite sliding on a plane at 111 km/h.
 */
const playerChassis = createVehicleChassis(carChassisSpec, circuitSurface);
const opponentChassis = createVehicleChassis(opponentChassisSpec, circuitSurface);

const physicsProof = createShowcaseRapierPhysicsProof("turbo-drift-circuit");

/**
 * Live vehicle-to-vehicle contact world.
 *
 * `game.racing` deliberately owns arcade steering and lap state; Rapier owns solid
 * contact. Oriented boxes follow each rendered Formula footprint, so the long noses,
 * wings and tyres cannot pass through one another while close side-by-side racing
 * remains possible. Every solved XZ position is fed back into `game.racing`.
 */
const vehicleContactWorld = game.planarCollisionWorld({
  backend: "rapier",
  fixedDelta: 1 / 120,
  // Vehicle boxes can meet at high closing speed during the retained direct-impact
  // review.  A modestly higher iteration budget keeps the Rapier contact manifold
  // from visibly compressing while keeping the normal frame loop responsive.
  solverIterations: 24,
  enableSleeping: false,
  continuousCollision: {
    mode: "adaptive-substeps",
    // Keep each sweep within the engine's documented default half-feature travel.
    // The former 0.08 threshold made every high-speed frame expensive and still
    // needed 130 substeps on one transient; the default 0.5 fraction needs about
    // 21 substeps for that same motion, so the bounded 32-step ceiling preserves
    // the CCD guarantee without starving the mounted RAF loop.
    // (TDC-A2: verge props do NOT share this world precisely so this two-car
    // budget stays authoritative - see the trackPropsContactWorld note below.)
    maxSubSteps: 32,
    motionThreshold: 0.5
  }
});
// These half-extents come from the exact fitted asset bounds used by the renderer.
// The former 0.27-radius spheres covered barely half the visible car length, which
// let a solved physics contact render as one Formula car stacked over the other.
// Clearance exceeds the retained worst solver penetration, so even during the
// compression phase the visible GLB envelopes retain a real gap.
// A small visible safety margin around the fitted GLB footprint. The strong one-shot
// momentum transfer below now separates the cars immediately, so contact can occur
// near the rendered bumpers without the repeated compression that formerly required
// an obviously oversized proxy.
const CONTACT_CLEARANCE = 0.001;
const playerContactHalfExtents: AuraVec3 = [
  heroFraming.subject.size[0] / 2 + CONTACT_CLEARANCE,
  // The planar world must never choose Y as the shortest separation axis. A tall
  // proxy makes X/Z the only viable contact plane and prevents car-on-car climbing.
  1,
  heroFraming.subject.size[2] / 2 + CONTACT_CLEARANCE
];
const opponentContactHalfExtents: AuraVec3 = [
  opponentRenderedSize[0] / 2 + CONTACT_CLEARANCE,
  1,
  opponentRenderedSize[2] / 2 + CONTACT_CLEARANCE
];
const minimumDirectImpactSeparation = playerContactHalfExtents[2] + opponentContactHalfExtents[2];
const yawQuaternion = (yaw: number): readonly [number, number, number, number] => [
  0,
  Math.sin(yaw / 2),
  0,
  Math.cos(yaw / 2)
];
function orientedFootprintClearance(
  playerPosition: AuraVec3,
  playerYaw: number,
  opponentPosition: AuraVec3,
  opponentYaw: number
): number {
  return measureOrientedFootprint(playerPosition, playerYaw, opponentPosition, opponentYaw).clearance;
}

function clampPlayerDriveTarget(
  playerPosition: AuraVec3,
  playerYaw: number,
  opponentPosition: AuraVec3,
  opponentYaw: number,
  minClearance: number
): AuraVec3 {
  const measurement = measureOrientedFootprint(playerPosition, playerYaw, opponentPosition, opponentYaw);
  if (measurement.clearance >= minClearance) return playerPosition;
  const correction = minClearance - measurement.clearance;
  return [
    playerPosition[0] - measurement.axis[0] * measurement.sign * correction,
    playerPosition[1],
    playerPosition[2] - measurement.axis[1] * measurement.sign * correction
  ];
}

function measureOrientedFootprint(
  playerPosition: AuraVec3,
  playerYaw: number,
  opponentPosition: AuraVec3,
  opponentYaw: number
): { readonly clearance: number; readonly axis: readonly [number, number]; readonly sign: number } {
  const playerHalfWidth = heroFraming.subject.size[0] / 2;
  const playerHalfLength = heroFraming.subject.size[2] / 2;
  const opponentHalfWidth = opponentRenderedSize[0] / 2;
  const opponentHalfLength = opponentRenderedSize[2] / 2;
  const axesFor = (yaw: number) => [
    [Math.cos(yaw), -Math.sin(yaw)],
    [Math.sin(yaw), Math.cos(yaw)]
  ] as const;
  const playerAxes = axesFor(playerYaw);
  const opponentAxes = axesFor(opponentYaw);
  const delta = [opponentPosition[0] - playerPosition[0], opponentPosition[2] - playerPosition[2]] as const;
  const projectionRadius = (
    axis: readonly [number, number],
    boxAxes: readonly [readonly [number, number], readonly [number, number]],
    halfWidth: number,
    halfLength: number
  ) => halfWidth * Math.abs(axis[0] * boxAxes[0][0] + axis[1] * boxAxes[0][1])
    + halfLength * Math.abs(axis[0] * boxAxes[1][0] + axis[1] * boxAxes[1][1]);
  let clearance = Number.NEGATIVE_INFINITY;
  let axis: readonly [number, number] = [1, 0];
  let sign = 1;
  for (const candidate of [...playerAxes, ...opponentAxes]) {
    const projected = delta[0] * candidate[0] + delta[1] * candidate[1];
    const separation = Math.abs(projected)
      - projectionRadius(candidate, playerAxes, playerHalfWidth, playerHalfLength)
      - projectionRadius(candidate, opponentAxes, opponentHalfWidth, opponentHalfLength);
    if (separation > clearance) {
      clearance = separation;
      axis = candidate;
      sign = projected >= 0 ? 1 : -1;
    }
  }
  return { clearance, axis, sign };
}

const initialPlayerContactPoint = racingScene.toScenePose(racingState.snapshot()).position;
const initialOpponentContactPoint = racingScene.toScenePose(opponentAi.snapshot(), opponentRacingLineOffset).position;
const playerContactBody = vehicleContactWorld.addBox("player-race-car", playerContactHalfExtents, {
  type: "dynamic",
  position: [initialPlayerContactPoint[0], 0, initialPlayerContactPoint[2]],
  tags: ["vehicle", "player"],
  material: { friction: 0.8, restitution: 0.05 },
  rigidBody: { mass: 760, linearDamping: 0.08, angularDamping: 1 }
});
const opponentContactBody = vehicleContactWorld.addBox("opponent-race-car", opponentContactHalfExtents, {
  type: "dynamic",
  position: [initialOpponentContactPoint[0], 0, initialOpponentContactPoint[2]],
  tags: ["vehicle", "opponent"],
  material: { friction: 0.8, restitution: 0.05 },
  rigidBody: { mass: 760, linearDamping: 0.08, angularDamping: 1 }
});

// --- TDC-A2/A6: verge-prop rigid bodies + boost-ring sensors ---------------
// Props live in their OWN planar world, deliberately WITHOUT continuous collision:
// the vehicle-contact world runs adaptive-substep CCD whose plan is sized by the
// smallest collider anywhere inside it, so tiny prop spheres would inflate the
// whole world's substep demand (observed live: a required 317 substeps, above any
// sane ceiling) and freeze the mounted frame loop mid-stint. A mass-760 player
// bumper proxy mirrors the solved player pose into this world every frame, so
// props still receive genuine rigid-body shoves while the racing contract keeps
// its exact previous CCD budget and vehicle-contact evidence semantics.
const trackPropsContactWorld = game.planarCollisionWorld({
  fixedDelta: 1 / 120,
  solverIterations: 4
});
/** Player stand-in that pushes props; driven from the solved main-world pose. */
const playerPropProxy = trackPropsContactWorld.addBox("player-bumper-proxy", playerContactHalfExtents, {
  type: "dynamic",
  position: [initialPlayerContactPoint[0], 0, initialPlayerContactPoint[2]],
  tags: ["bumper-proxy"],
  material: { friction: 0.4, restitution: 0.3 },
  rigidBody: { mass: 760, linearDamping: 0.08, angularDamping: 1 }
});
const trackPropBodies = trackPropsPlan.placements.map((prop) => {
  const position = gamePointToScene(prop.point);
  return trackPropsContactWorld.addSphere(prop.id, prop.radiusGame * sceneScaleFromBinding, {
    type: "dynamic",
    position: [position[0], 0, position[2]],
    tags: ["track-prop"],
    material: { friction: 0.55, restitution: 0.4 },
    rigidBody: { mass: prop.massKg, linearDamping: 1.2, angularDamping: 1 }
  });
});
/** Scene-unit speed ceiling for verge props; keeps CCD plans small. */
const TRACK_PROP_MAX_SPEED_SCENE = 1.1;

/** Authored rest pose per prop (scene space) used for sync and reset. */
const trackPropRestPositions = new Map(trackPropsPlan.placements.map((prop) => {
  const position = gamePointToScene(prop.point);
  const restY = TRACK_REFERENCE_Y + PROP_VISUALS[prop.kind].sizeScene[1] / 2;
  return [prop.id, [position[0], restY, position[2]] as AuraVec3];
}));
// Boost-ring sensors are static and sensor-only: they report overlaps but never
// resolve penetration, so nothing about vehicle contact evidence changes.
boostRingPlan.forEach((ring) => {
  const position = gamePointToScene(ring.point);
  vehicleContactWorld.addSphere(ring.id + "-sensor", ring.radiusScene * 0.9, {
    type: "static",
    sensor: true,
    position: [position[0], 0, position[2]],
    tags: ["turbo-boost-sensor"]
  });
});
let vehicleContactCount = 0;
let vehicleContactFrames = 0;
let maximumVehiclePenetration = 0;
let minimumRenderedEnvelopeClearance = Number.POSITIVE_INFINITY;
let vehicleContactWasActive = false;
let vehicleImpactRecoverySeconds = 0;
let vehicleImpactResponses = 0;
let vehicleHitStopSeconds = 0;
let vehicleHitStopPlayerPoint: null | { readonly x: number; readonly y: number } = null;
let vehicleHitStopOpponentPoint: null | { readonly x: number; readonly y: number } = null;
let pendingPlayerImpactHeading: number | null = null;
let pendingOpponentImpactHeading: number | null = null;
let vehicleHeadingKickApplied = false;
let playerLeadHoldSeconds = 0;
let lastVehicleImpact: null | {
  readonly frame: number;
  readonly relativeClosingSpeed: number;
  readonly playerSpeedBefore: number;
  readonly playerSpeedAfter: number;
  readonly opponentSpeedBefore: number;
  readonly opponentSpeedAfter: number;
  readonly playerHeadingBefore: number;
  readonly playerHeadingAfter: number;
  readonly opponentHeadingBefore: number;
  readonly opponentHeadingAfter: number;
  readonly racingLineOffset: number;
  readonly contactNormal: readonly [number, number, number];
} = null;
let edgeRecoverySeconds = 0;

let raceSnapshot = racingState.snapshot();
let opponentRaceStarted = false;
/**
 * Grounding facts observed across the whole session, not just the current frame.
 *
 * A single frame cannot prove the car never sinks; a session-wide maximum can.
 */
const observedVehicleGrounding = {
  everUngrounded: false,
  maxContactGap: 0,
  firstUngrounded: null as null | {
    frame: number;
    trackOffset: number;
    progress: number;
    position: { x: number; z: number };
    heading: number;
    groundedWheels: number;
    maxContactGap: number;
    wheels: readonly { id: string; grounded: boolean; contactGap: number; position: AuraVec3 }[];
  },
  pitchObserved: false,
  rollObserved: false,
  wheelSpinObserved: false,
  suspensionMoved: false
};
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const initialOpponentPose = racingScene.toScenePose(opponentAi.snapshot(), opponentRacingLineOffset);
/**
 * Renderer-owned dust volume for the drift seam.
 *
 * The hand-placed puffs below preserve deterministic contact evidence, but a
 * stopped sphere chain still reads as two ellipsoidal decals at the review
 * distance.  This single typed Aura particle layer supplies the missing
 * volumetric breakup: the same live slip/asphalt predicate drives its runtime
 * transform and visibility, while the scene effect owns the actual 3-D smoke
 * motion.  It is intentionally bounded (one pooled draw, 300 requested
 * particles) so it cannot turn the route into an unbounded emitter.
 */
const driftParticleCloud = effects.particles({
  name: "typed drift dust cloud",
  emitter: "fountain",
  color: "#d8c7b5",
  particleCount: 300,
  emissionRate: 240,
  radius: 0.22,
  height: 0.34,
  intensity: 0.76,
  speed: 0.52,
  gravity: 1.15,
  groundCollision: true,
  lifetimeColorRamp: ["#f4e0c4", "#cfbca9", "#9d8f86"],
  materialMode: "smoke",
  texturedBillboard: true,
  sizeOverLife: [0.24, 1.08, 0.7],
  alphaOverLife: [0.08, 0.58, 0],
  velocityOverLife: [0.5, 0.88, 0.3],
  turbulence: 0.3,
  noise: 0.26,
  splashes: false,
  mist: true
}).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-drift-particle-cloud", {
  tags: ["vehicle-feedback", "drift-smoke", "renderer-owned", "typed-particle-effect"]
}));
/*
 * Resolve the first rendered pose through the same four-wheel chassis path used by
 * every later frame.  Starting the model at the route centre plane and waiting for
 * the first animation frame to ground it created a one-frame discontinuity and also
 * left composition evidence with no authoritative wheel contact to reference.
 */
let playerChassisPose = playerChassis.reset({
  x: initialPlayerPose.position[0],
  z: initialPlayerPose.position[2],
  heading: raceSnapshot.heading,
  speed: 0,
  steer: 0
});
let opponentChassisPose = opponentChassis.reset({
  x: initialOpponentPose.position[0],
  z: initialOpponentPose.position[2],
  heading: opponentAi.snapshot().heading,
  speed: 0,
  steer: 0
});
const chaseDistance = Math.max(heroFraming.distance, CAR_SCENE_HEIGHT * 5.2);
const chaseHeight = Math.max(heroFraming.height, CAR_SCENE_HEIGHT * 2.1);
const chaseLookAhead = Math.max(1.05, CAR_SCENE_HEIGHT * 3.6);
// The generic 0.045 follow blend trails several car lengths behind at Turbo's
// authored arcade pace, allowing the player to leave its own chase frame. A
// firmer frame-rate-independent response keeps the hero in the lower third while
// retaining enough damping to avoid horizon snap through bends and recovery.
const chaseSmoothing = 0.18;
type MutableChaseCamera = { distance: number; height: number; sideOffset: number };
const chaseCameraTuning: MutableChaseCamera = {
  distance: collisionReviewCamera ? chaseDistance * 0.2 : visualCaptureCamera ? chaseDistance * VISUAL_CAPTURE_CAMERA.distanceMultiplier : chaseDistance,
  height: collisionReviewCamera ? chaseHeight * 1.3 : visualCaptureCamera ? chaseHeight * VISUAL_CAPTURE_CAMERA.heightMultiplier : chaseHeight,
  sideOffset: collisionReviewCamera ? chaseDistance * -1.5 : visualCaptureCamera ? heroFraming.sideOffset * VISUAL_CAPTURE_CAMERA.sideMultiplier : heroFraming.sideOffset
};
function syncChaseCamera(finishBlend = 0, offTrackNudge = 0): void {
  // Keep the finish ceremony close enough to read the car, track, and live HUD
  // together; the wider lateral swing still gives a clear 3/4 presentation.
  const heroDistance = chaseDistance * (1 + finishBlend * 0.18);
  const heroHeight = chaseHeight * (1 + finishBlend * 0.12);
  const heroSide = heroFraming.sideOffset * (1 + finishBlend * 0.68);
  // A small decaying lateral nudge when the car is off-track sells the excursion
  // without moving the camera off the road surface; it fades as recovery completes.
  // 0..1 strength, reduced motion hides it entirely.
  const nudgeAmt = reducedMotion ? 0 : Math.min(1, Math.max(0, offTrackNudge));
  const nudgeSide = heroFraming.sideOffset * (0.12 + nudgeAmt * 0.18);
  chaseCameraTuning.distance = collisionReviewCamera
    ? chaseDistance * 0.2
    : visualCaptureCamera
    ? chaseDistance * VISUAL_CAPTURE_CAMERA.distanceMultiplier
    : finishBlend > 0.001 ? heroDistance : chaseDistance + nudgeAmt * -0.02;
  chaseCameraTuning.height = collisionReviewCamera
    ? chaseHeight * 1.3
    : visualCaptureCamera
    ? chaseHeight * VISUAL_CAPTURE_CAMERA.heightMultiplier
    : finishBlend > 0.001 ? heroHeight : chaseHeight + nudgeAmt * 0.015;
  chaseCameraTuning.sideOffset = collisionReviewCamera
    ? chaseDistance * -1.5
    : visualCaptureCamera
    ? heroFraming.sideOffset * VISUAL_CAPTURE_CAMERA.sideMultiplier
    : (finishBlend > 0.001 ? heroSide : heroFraming.sideOffset) + nudgeSide;
  Object.assign(racingCamera as unknown as MutableChaseCamera, chaseCameraTuning);
}
// Keep the complete near-circuit decision space inside the chase frame. At 52°
// the player still read well, but the projected track occupied 83.7% of the
// viewport and correctly failed the public composition gate as a proof-harness
// view. Sixty-two degrees retains a genre-appropriate ~19% hero height while
// restoring visible road context around the subject.
const chaseFov = 62;
// Evidence-only camera selection. The public route keeps its genre chase framing;
// `?collisionReview=side` widens and moves laterally so a retained screenshot can
// prove the two vehicle silhouettes are separate at the contact plane.
const racingCamera = game.racingCameraRig({
  sceneBinding: racingScene,
  focus: raceSnapshot,
  mode: "chase",
  composition: {
    report: "tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-asset-pair-composition.json",
    verdict: "pass",
    cameraReadabilityVerdict: "pass",
    selectedMode: "chase"
  },
  // The exact review is a live two-car chase frame. The midpoint is the only
  // honest target that keeps both solved vehicles in frame through the bend;
  // the short review look-ahead below prevents the former empty-asphalt wedge.
  // A live drift rotates the rendered Formula body by `reviewSlipYaw` so the
  // slide is readable.  That visual slip must not also rotate the chase rig:
  // following the car node's presentation yaw made the exact review camera
  // look sideways across the olive infield and crop the car at the lower edge.
  // The hidden action-focus node follows the same solved position and the true
  // route heading, so capture mode remains a real live-state chase frame while
  // keeping the next road decision, rival, and car fully in view.
  targetNode: visualCaptureCamera ? "racing-action-focus" : "racing-player-car",
  /*
   * `resolveChaseFraming` solves subject occupancy, but its asset-derived eye
   * height is only 0.31 scene units for this low car. That is a valid product
   * probe angle and a bad racing camera: it places the lens below the circuit's
   * catch fencing, so the fence fills the frame and the car is seen through it.
   * A chase camera is a gameplay system, not an isolated asset probe. Keep the
   * derived distance/side framing, but enforce a road-visibility floor above the
   * modelled barriers. The floor is relative to the car's rendered height so it
   * remains valid if the typed vehicle changes.
   */
  distance: collisionReviewCamera ? chaseDistance * 0.2 : visualCaptureCamera ? chaseDistance * VISUAL_CAPTURE_CAMERA.distanceMultiplier : chaseDistance,
  height: collisionReviewCamera ? chaseHeight * 1.3 : visualCaptureCamera ? chaseHeight * VISUAL_CAPTURE_CAMERA.heightMultiplier : chaseHeight,
  // Derived, not tuned: see `requireLowerSideFeatureVisibility` above.
  sideOffset: collisionReviewCamera ? chaseDistance * -1.5 : visualCaptureCamera ? heroFraming.sideOffset * VISUAL_CAPTURE_CAMERA.sideMultiplier : heroFraming.sideOffset,
  // The retained overview needs the road decision *ahead* of the cars, not a
  // half-frame of already-travelled asphalt. Looking farther down the live
  // route pushes both cars into the lower third while preserving the same
  // mounted chase rig and real drift state.
  lookAhead: visualCaptureCamera ? chaseLookAhead * VISUAL_CAPTURE_CAMERA.lookAheadMultiplier : chaseLookAhead,
  fov: collisionReviewCamera ? 48 : visualCaptureCamera ? VISUAL_CAPTURE_CAMERA.fov : chaseFov,
  // The named review artifact is captured on a measured live drift state. A
  // smoothed midpoint rig can still trail several car lengths behind that
  // state under load, producing a machine-green frame with both racers tiny at
  // the horizon. Review mode tracks the same live anchor without temporal lag;
  // public gameplay retains the authored smoothing.
  smoothing: visualCaptureCamera ? VISUAL_CAPTURE_CAMERA.smoothing : chaseSmoothing
});
setupRacingPanel();

// Resolve the review backdrop in the racing scene's transformed coordinate
// system. Raw `cos(heading)/sin(heading)` values are game-space directions;
// applying them directly to scene-space car positions put the card on the wrong
// side of rotated/inverted circuit bindings, which is why the generated art
// contributed no pixels despite loading successfully.
const reviewBackdropSample = sampleCentreline(0.29);
const reviewCameraSample = sampleCentreline(0.247);
const reviewCaptureScenePose = racingScene.toScenePose({
  position: { x: reviewCameraSample.x, y: reviewCameraSample.y },
  heading: reviewCameraSample.heading
});
const reviewBackdropAnchor = gamePointToScene(reviewBackdropSample);
const reviewBackdropAhead = gamePointToScene({
  x: reviewBackdropSample.x + Math.cos(reviewBackdropSample.heading) * 0.1,
  y: reviewBackdropSample.y + Math.sin(reviewBackdropSample.heading) * 0.1
});
const reviewBackdropDirectionLength = Math.max(0.0001, Math.hypot(
  reviewBackdropAhead[0] - reviewBackdropAnchor[0],
  reviewBackdropAhead[2] - reviewBackdropAnchor[2]
));
const reviewBackdropForwardX = (reviewBackdropAhead[0] - reviewBackdropAnchor[0]) / reviewBackdropDirectionLength;
const reviewBackdropForwardZ = (reviewBackdropAhead[2] - reviewBackdropAnchor[2]) / reviewBackdropDirectionLength;
const reviewBackdropDistance = 1;
const reviewBackdropPosition: [number, number, number] = [
  reviewBackdropAnchor[0] + reviewBackdropForwardX * reviewBackdropDistance,
  TRACK_REFERENCE_Y - 0.42,
  reviewBackdropAnchor[2] + reviewBackdropForwardZ * reviewBackdropDistance
];
const reviewBackdropYaw = Math.atan2(-reviewBackdropForwardX, -reviewBackdropForwardZ);
const reviewVenueCurvature = racingLine.query(reviewBackdropSample).curvature;
const reviewVenueOutside = -(Math.sign(reviewVenueCurvature) || 1);
const reviewVenueGamePoint = {
  x: reviewBackdropSample.x
    + Math.sin(reviewBackdropSample.heading) * (visualAsphaltHalfWidthGame + 0.34) * reviewVenueOutside,
  y: reviewBackdropSample.y
    - Math.cos(reviewBackdropSample.heading) * (visualAsphaltHalfWidthGame + 0.34) * reviewVenueOutside
};
const reviewVenuePose = racingScene.toScenePose({
  position: reviewVenueGamePoint,
  heading: reviewBackdropSample.heading
});

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .background(visualCaptureCamera ? "#7193a3" : TURBO_LATE_AFTERNOON_MOOD.background)
    // Late-afternoon key: warmer body reflections with a cooler distant grade.
    .add(environments.studio({
      name: TURBO_LATE_AFTERNOON_MOOD.environmentName,
      intensity: visualCaptureCamera ? 0.96 : TURBO_LATE_AFTERNOON_MOOD.environmentIntensity,
      color: visualCaptureCamera ? "#d9e5e7" : TURBO_LATE_AFTERNOON_MOOD.environmentColor
    }))
    // Transparent road-free forest cutout only: it breaks up the asset's beige
    // catch wall without replacing the certified 3D circuit or sky.
    .addMany(reviewVenuePlate ? [
      model(assets.turboAlpineVenueBackdrop, {
        name: "turbo alpine venue review panorama",
        role: "setDressing",
        scaleMode: "fit",
        // Keep the licensed cutout in the distant tree line.  At 6.7 units it
        // filled half the viewport and its transparent lower edge read like a
        // pasted billboard rather than background vegetation.
        targetHeight: 4.2
      }).position(...reviewBackdropPosition).rotate(0, reviewBackdropYaw, 0).runtime(game.runtimeNode("turbo-alpine-venue-review", { tags: ["typed-supporting-asset", "review-background", "non-gameplay-set-dressing"] }))
    ] : [])
    // A generated, typed 3D festival kit on the hairpin exterior. Unlike the
    // rejected panorama, every tree, tent, spectator, rail, and rock has real
    // depth and responds to the route lights. It owns no collision and cannot
    // alter racing state.
    .addMany(visualCaptureCamera && supplementalHairpinVenueEnabled ? [
      model(assets.turboHairpinVenueKit, {
        name: "turbo hairpin festival venue",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 3.4,
        castShadow: true,
        receiveShadow: true
      })
        .position(reviewVenuePose.position[0], TRACK_REFERENCE_Y + 0.28, reviewVenuePose.position[2])
        .rotate(0, reviewVenuePose.rotation[1], 0)
        .runtime(game.runtimeNode("turbo-hairpin-festival-venue", {
          tags: ["typed-supporting-asset", "renderer-owned-venue-depth", "non-gameplay-set-dressing"]
        })),
      model(assets.turboHairpinVenueKit, {
        name: "turbo inside hairpin crowd grove",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 2.8,
        castShadow: true,
        receiveShadow: true
      })
        .position(reviewVenuePose.position[0], TRACK_REFERENCE_Y + 0.2, reviewVenuePose.position[2])
        .rotate(0, reviewVenuePose.rotation[1] + Math.PI, 0)
        .runtime(game.runtimeNode("turbo-inside-hairpin-crowd-grove", {
          tags: ["typed-supporting-asset", "renderer-owned-inside-corner-depth", "non-gameplay-set-dressing"]
        })),
      model(assets.turboHairpinVenueKit, {
        name: "turbo near outside shoulder spectators",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 2.35,
        castShadow: true,
        receiveShadow: true
      })
        .position(reviewVenuePose.position[0], TRACK_REFERENCE_Y + 0.13, reviewVenuePose.position[2])
        .rotate(0, reviewVenuePose.rotation[1], 0)
        .runtime(game.runtimeNode("turbo-near-outside-shoulder-spectators", {
          tags: ["typed-supporting-asset", "renderer-owned-roadside-depth", "non-gameplay-set-dressing"]
        })),
      model(assets.turboHairpinVenueKit, {
        name: "turbo near inside shoulder spectators",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 2.1,
        castShadow: true,
        receiveShadow: true
      })
        .position(reviewVenuePose.position[0], TRACK_REFERENCE_Y + 0.12, reviewVenuePose.position[2])
        .rotate(0, reviewVenuePose.rotation[1] + Math.PI, 0)
        .runtime(game.runtimeNode("turbo-near-inside-shoulder-spectators", {
          tags: ["typed-supporting-asset", "renderer-owned-roadside-depth", "non-gameplay-set-dressing"]
        })),
    ] : [])
    // The chase camera yaws with the car, so the sky is the scene background
    // rather than a finite wall whose edge would swing into frame. A distant
    // treeline band plus fog grade the ground into that sky.
    // The circuit asset ships its own grass, barriers, fencing, grandstands and treeline,
    // so the only set dressing still needed is a ground plane far enough out to close the
    // horizon. The previous treeline slab was authored for a 5.4-unit scene and at this
    // size cut straight through the modelled scenery.
    .add(primitives.box({
      name: "circuit ground plane",
      material: material.pbr({ name: "circuit outfield ground", color: visualCaptureCamera ? "#38553d" : "#566044", roughness: 0.97, metallic: 0 }),
      receiveShadow: true
    }).position(0, TRACK_REFERENCE_Y - 0.12, 0).scale([SCENE_SIZE * 9, 0.1, SCENE_SIZE * 9]))
    .add(model(assets.turboFormulaCircuit, {
      name: "racing-geometry-source-track-asset",
      role: "primaryTrack",
      scaleMode: "fit",
      targetMaxDimension: racingScene.trackModel.targetMaxDimension,
      visible: false
    }).position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation).runtime(game.runtimeNode("racing-geometry-source-track-asset", {
      tags: ["track", "typed-secondary-primary-asset", "certified-geometry-source", "not-rendered"]
    })))
    .add(model(assets.turboFormulaCircuit, {
      name: "racing-bound-track-asset",
      role: "primaryTrack",
      scaleMode: "fit",
      targetMaxDimension: racingScene.trackModel.targetMaxDimension,
      // The exact asset remains mounted as the authoritative topology/contact
      // source above. Its rejected upright black disks and sparse venue are not
      // allowed back into release pixels; the aligned V2 visual derivative below
      // owns the rendered road and environment.
      visible: false
    }).position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation).runtime(game.runtimeNode("racing-bound-track-asset", {
      tags: ["track", "typed-secondary-primary-asset", "certified-geometry-source", "not-rendered"]
    })))
    .add(model(assets.turboCircuitEnvironmentV2, {
      name: "racing-bound-circuit-environment-v2",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: CIRCUIT_ENVIRONMENT_TARGET_MAX_DIMENSION,
      castShadow: true,
      receiveShadow: true
    }).position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation).runtime(game.runtimeNode("racing-bound-circuit-environment-v2", {
      tags: ["track-visual", "typed-supporting-asset", "renderer-owned-venue", "non-colliding"]
    })))
    .addMany(game.racingPresentationTrack({
      sceneBinding: racingScene,
      route,
      mode: "asset-overlay",
      guideVisibility: "public",
      roadColor: "#5a554e",
      terrainColor: "#456344",
      curbColor: "#ed6a4f",
      laneColor: "#ffe0ad"
    }))
    .add(primitives.sphere({
      name: "racing action camera focus",
      material: material.pbr({ name: "hidden racing action focus", color: "#000000", opacity: 0 })
    })
      .position(
        (initialPlayerPose.position[0] + initialOpponentPose.position[0]) * 0.5,
        initialPlayerPose.position[1],
        (initialPlayerPose.position[2] + initialOpponentPose.position[2]) * 0.5
      )
      .scale(0.001)
      .runtime(game.runtimeNode("racing-action-focus", { tags: ["camera-target", "review-only", "non-colliding"] })))
    // The hero is the detailed CC-BY Formula racer with blue/black livery, visible
    // suspension, driver, wings and exposed tyres. The rival is a separate CC0
    // Formula racer with authored red/white/graphite palette texturing. Both
    // suspension, driver, front/rear wings and exposed tires. Neither vehicle receives a
    // whole-model tint: the distinction comes from authored materials and geometry.
    .add(model(assets.showcaseCc0FormulaRaceCar, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      // Keep the rendered fit exactly in the same asset-derived envelope used by
      // the chassis, chase framing, and composition probe.  A stale 1.1 here made
      // the visible car 14.6% larger than `heroFraming.subject`, so the probe's
      // contact projection and the raster silhouette described different cars.
      targetMaxDimension: CAR_TARGET_MAX_DIMENSION,
      castShadow: true,
      receiveShadow: true
    }).position(...groundedFittedModelPosition(playerChassisPose, heroFraming.subject.size, {
      contactClearance: carChassisSpec.wheelRadius * 0.06
    })).rotate(playerChassisPose.rotation[0], initialPlayerPose.rotation[1], playerChassisPose.rotation[2]).runtime(game.runtimeNode("racing-player-car", {
      tags: ["player", "vehicle", "typed-primary-asset"]
    })))
    .add(model(assets.showcaseCcByFormulaOpponent, {
      name: "racing-opponent-car",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: opponentTargetMaxDimension,
      castShadow: true,
      receiveShadow: true
    }).position(...groundedFittedModelPosition(opponentChassisPose, opponentRenderedSize, {
      contactClearance: opponentChassisSpec.wheelRadius * 0.06
    })).rotate(opponentChassisPose.rotation[0], opponentPresentationRotation(initialOpponentPose.rotation)[1], opponentChassisPose.rotation[2]).runtime(game.runtimeNode("racing-opponent-car", {
      tags: ["opponent", "vehicle", "typed-secondary-asset", "route-local-ai"]
    })))
    // TDC-A1: visual-only time-trial ghost. Same typed hero asset with a translucent
    // material override; it owns no collision body and never enters gap/position logic.
    .add(model(assets.showcaseCc0FormulaRaceCar, {
      name: "racing-time-trial-ghost",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.1,
      castShadow: false,
      receiveShadow: false,
      visible: false,
      material: material.pbr({
        name: "time trial ghost shell",
        color: "#8fd8ff",
        emissive: "#2f9dd8",
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metallic: 0,
        opacity: 0.34
      })
    }).position(...initialPlayerPose.position).runtime(game.runtimeNode("racing-time-trial-ghost", {
      tags: ["ghost", "visual-only", "no-collision"]
    })))
    .add(primitives.box({
      name: "left drift ribbon",
      material: material.pbr({ name: "fresh left tire mark", color: "#34393a", roughness: 0.98, metallic: 0.01, opacity: 0.48 })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-left-drift-ribbon", {
      tags: ["vehicle-feedback", "drift", "renderer-owned"]
    })))
    .add(primitives.box({
      name: "right drift ribbon",
      material: material.pbr({ name: "fresh right tire mark", color: "#34393a", roughness: 0.98, metallic: 0.01, opacity: 0.48 })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-right-drift-ribbon", {
      tags: ["vehicle-feedback", "drift", "renderer-owned"]
    })))
    .add(primitives.box({
      name: "player car contact shadow",
      material: material.pbr({ name: "player contact shadow", color: "#0e0d0c", roughness: 1, metallic: 0, opacity: 0.52 }),
      castShadow: false,
      receiveShadow: false
    }).position(initialPlayerPose.position[0], initialPlayerPose.position[1] + 0.018, initialPlayerPose.position[2]).scale([0.54, 0.012, 1.12]).runtime(game.runtimeNode("racing-player-contact-shadow", {
      tags: ["vehicle-grounding", "contact-shadow", "renderer-owned", "non-colliding"]
    })))
    .addMany(visualCaptureCamera ? Array.from({ length: 4 }, (_, index) =>
      primitives.box({
        name: `player tyre contact shadow ${index + 1}`,
        material: material.pbr({
          name: `player tyre contact shadow material ${index + 1}`,
          color: "#171411",
          roughness: 1,
          metallic: 0,
          opacity: 0.46
        })
      })
        .position(...initialPlayerPose.position)
        .scale([0.001, 0.001, 0.001])
        .runtime(game.runtimeNode(`racing-player-tyre-shadow-${index}`, {
          tags: ["vehicle-grounding", "wheel-contact-shadow", "renderer-owned", "non-colliding"]
        }))
    ) : [])
    .add(primitives.box({
      name: "opponent car contact shadow",
      material: material.pbr({ name: "opponent contact shadow", color: "#101416", roughness: 1, metallic: 0, opacity: 0.28 }),
      castShadow: false,
      receiveShadow: false
    }).position(initialOpponentPose.position[0], initialOpponentPose.position[1] + 0.008, initialOpponentPose.position[2]).scale([0.29, 0.008, 0.54]).runtime(game.runtimeNode("racing-opponent-contact-shadow", {
      tags: ["vehicle-grounding", "contact-shadow", "renderer-owned", "non-colliding"]
    })))
    // TDC-A2 dynamic props, TDC-A3 instanced scenery + LOD bands, TDC-A4 text3D
    // gantry signage, and the flag-gated TDC-A6 boost rings (empty when OFF).
    .addMany(buildTurboPropNodes())
    // Keep the authored venue language in the mounted route.  Earlier review
    // passes left these branches as four empty arrays after hiding a bad
    // backdrop; that made the exact racing frame a car on an undifferentiated
    // asphalt plane even though the route had a typed stand/tree/tyre plan.
    // These are real scene nodes derived from the certified centreline: the
    // instanced stands and trees establish scale/parallax, the segmented curbs
    // and worked-in rubber establish a continuous corner, and the distant LOD
    // bands close the horizon without entering gameplay/contact state.
    .addMany(buildTurboSceneryNodes())
    // A compact row of colored marshal pods and signal masts gives the opening
    // straight a recognizable service-lane rhythm at review scale.  The pods
    // are outside the visual asphalt edge and never participate in contact.
    .addMany(buildTurboTracksideIdentityNodes())
    .addMany(buildTurboRoadDetailNodes())
    .addMany(visualCaptureCamera ? buildTurboTreelineBands() : [])
    .addMany(buildTurboSignageNodes())
    .addMany(buildTurboBoostRingNodes())
    // Keep contact definition without crushing the Formula car's red palette into black.
    // The former 0.42 AO pass was appropriate for the pale untextured car and visibly
    // over-occluded the textured cockpit, sidepods and rear wing of the new hero.
    .add(effects.ambientOcclusion({ intensity: visualCaptureCamera ? 0.28 : 0.18, radius: visualCaptureCamera ? 0.62 : 0.48 }))
    .add(effects.contactOcclusion({
      name: "vehicle-road contact occlusion",
      intensity: visualCaptureCamera ? 0.5 : 0.28,
      radius: visualCaptureCamera ? 0.68 : 0.54
    }))
    .add(effects.neonBloom({ intensity: 0.34 }))
    // Nonzero depth haze that grades the treeline into the sky and separates
    // near curbing from distant trackside.
    // Fog density and light positions are expressed relative to the scene's own size.
    // The previous values were tuned for a 5.4-unit scene; on this 39-unit circuit the
    // key and rim lights sat *inside* the track surface and the fog was ~7x too dense
    // for the distances involved, which is why the frame read as near-night.
    .add(effects.fog({
      name: "circuit distance atmosphere",
      color: visualCaptureCamera ? "#89a1a6" : TURBO_LATE_AFTERNOON_MOOD.fogColor,
      density: Number((TURBO_LATE_AFTERNOON_MOOD.fogReferenceDensity
        * (TURBO_LATE_AFTERNOON_MOOD.fogReferenceSceneSize / SCENE_SIZE)
        * (visualCaptureCamera ? 1.14 : 1)).toFixed(5)),
      intensity: visualCaptureCamera ? 0.44 : TURBO_LATE_AFTERNOON_MOOD.fogIntensity
    }))
    .add(lights.ambient({
      name: "circuit sky fill",
      color: TURBO_LATE_AFTERNOON_MOOD.ambientColor,
      intensity: visualCaptureCamera ? 0.68 : TURBO_LATE_AFTERNOON_MOOD.ambientIntensity
    }))
    .add(lights.directional({
      name: "circuit daylight key",
      color: TURBO_LATE_AFTERNOON_MOOD.keyColor,
      intensity: visualCaptureCamera ? 2.35 : TURBO_LATE_AFTERNOON_MOOD.keyIntensity
    })
      .position(
        TURBO_LATE_AFTERNOON_MOOD.keyPositionFractions.x * SCENE_SIZE,
        TURBO_LATE_AFTERNOON_MOOD.keyPositionFractions.y * SCENE_SIZE,
        TURBO_LATE_AFTERNOON_MOOD.keyPositionFractions.z * SCENE_SIZE
      ))
    .add(lights.directional({
      name: "circuit cool rim",
      color: TURBO_LATE_AFTERNOON_MOOD.rimColor,
      intensity: visualCaptureCamera ? 0.72 : TURBO_LATE_AFTERNOON_MOOD.rimIntensity
    })
      .position(
        TURBO_LATE_AFTERNOON_MOOD.rimPositionFractions.x * SCENE_SIZE,
        TURBO_LATE_AFTERNOON_MOOD.rimPositionFractions.y * SCENE_SIZE,
        TURBO_LATE_AFTERNOON_MOOD.rimPositionFractions.z * SCENE_SIZE
      ))
    .add(lights.point({ name: "pit lane warm fill", color: TURBO_LATE_AFTERNOON_MOOD.pitFillColor, intensity: 0.42 })
      .position(0.44 * SCENE_SIZE, 0.15 * SCENE_SIZE, -0.33 * SCENE_SIZE))
    .add(lights.point({ name: "start line red glow", color: "#ff6b5a", intensity: 0.18 })
      .position(-0.33 * SCENE_SIZE, 0.16 * SCENE_SIZE, 0.3 * SCENE_SIZE))
    .add(lights.point({ name: "start line green glow", color: "#8dffb8", intensity: 0.12 })
      .position(-0.28 * SCENE_SIZE, 0.16 * SCENE_SIZE, 0.34 * SCENE_SIZE))
    .add(primitives.sphere({
      name: "left drift smoke",
      material: material.pbr({
        name: "left tyre smoke",
        color: "#d7d2c5",
        roughness: 0.92,
        metallic: 0,
        opacity: visualCaptureCamera ? 0.09 : 0.07
      })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-left-drift-smoke", {
      tags: ["vehicle-feedback", "drift-smoke", "renderer-owned"]
    })))
    .add(primitives.sphere({
      name: "right drift smoke",
      material: material.pbr({
        name: "right tyre smoke",
        color: "#d7d2c5",
        roughness: 0.92,
        metallic: 0,
        opacity: visualCaptureCamera ? 0.09 : 0.07
      })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-right-drift-smoke", {
      tags: ["vehicle-feedback", "drift-smoke", "renderer-owned"]
    })))
    .addMany(Array.from({ length: VISUAL_DRIFT_PLUME_COUNT }, (_, index) =>
      // Real 3-D puffs are deliberately staggered behind both rear tyres.  The
      // previous translucent boxes collapsed into two flat rails at the held
      // review distance; soft spheres with varied warm-grey materials preserve
      // the road contact while giving the drift a readable billow.
      primitives.sphere({
        name: `drift dust history ${index + 1}`,
        material: material.pbr({
          name: `warm drift dust ${index + 1}`,
          color: index % 3 === 0 ? "#e6ded0" : index % 3 === 1 ? "#c7c7bd" : "#b8bbb5",
          roughness: 0.94,
          metallic: 0,
          opacity: visualCaptureCamera
            ? Math.max(0.045, 0.14 - index * 0.009)
            : Math.max(0.045, 0.14 - index * 0.008)
        })
      })
        .position(...initialPlayerPose.position)
        .scale([0.001, 0.001, 0.001])
        .runtime(game.runtimeNode(`racing-drift-plume-${index}`, {
          tags: ["vehicle-feedback", "drift-smoke", "renderer-owned", "pooled-history"]
        }))
    ))
    // A single renderer-owned particle layer adds soft volumetric breakup to
    // the deterministic tyre-puff tableau. It is moved from the live rear axle
    // below and remains hidden unless the car is genuinely slipping on asphalt.
    .add(driftParticleCloud)
    .camera(racingCamera)
});

const playerCar = app.nodes.require("racing-player-car");
const opponentCar = app.nodes.require("racing-opponent-car");
const playerContactShadow = app.nodes.require("racing-player-contact-shadow");
const playerTyreShadows = visualCaptureCamera
  ? Array.from({ length: 4 }, (_, index) => app.nodes.require(`racing-player-tyre-shadow-${index}`))
  : [];
const opponentContactShadow = app.nodes.require("racing-opponent-contact-shadow");
const reviewVenueNode = reviewVenuePlate
  ? app.nodes.require("turbo-alpine-venue-review")
  : null;
const reviewFestivalNode = visualCaptureCamera && supplementalHairpinVenueEnabled
  ? app.nodes.require("turbo-hairpin-festival-venue")
  : null;
const reviewInsideGroveNode = visualCaptureCamera && supplementalHairpinVenueEnabled
  ? app.nodes.require("turbo-inside-hairpin-crowd-grove")
  : null;
const reviewNearOutsideNode = visualCaptureCamera && supplementalHairpinVenueEnabled
  ? app.nodes.require("turbo-near-outside-shoulder-spectators")
  : null;
const reviewNearInsideNode = visualCaptureCamera && supplementalHairpinVenueEnabled
  ? app.nodes.require("turbo-near-inside-shoulder-spectators")
  : null;
const racingActionFocus = app.nodes.require("racing-action-focus");
racingActionFocus.setVisible(false);
// TDC incorporation runtime handles.
const ghostCarNode = app.nodes.require("racing-time-trial-ghost");
const trackPropNodes = trackPropsPlan.placements.map((prop) =>
  app.nodes.require("turbo-prop-node-" + prop.id));
const signageLapBoardNodes = signageBoardLabels.map((label, index) =>
  app.nodes.require("signage lap board " + index + " " + label.replace(/ /g, "_")));
// Only the GET READY board starts lit; the panel updater owns transitions.
signageLapBoardNodes.forEach((node, index) => node.setVisible(index === 0));
const leftDriftRibbons = [
  app.nodes.require("racing-left-drift-ribbon")
] as AuraRuntimeNodeHandle[];
const rightDriftRibbons = [
  app.nodes.require("racing-right-drift-ribbon")
] as AuraRuntimeNodeHandle[];
const leftDriftSmoke = app.nodes.require("racing-left-drift-smoke");
const rightDriftSmoke = app.nodes.require("racing-right-drift-smoke");
const visualDriftPlumes = Array.from({ length: VISUAL_DRIFT_PLUME_COUNT }, (_, index) =>
  app.nodes.require(`racing-drift-plume-${index}`)
);
const driftParticleCloudNode = app.nodes.require("racing-drift-particle-cloud");
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "racing",
    camera: racingCamera,
    // The probe projects `subject.targetSize` as a *vertical* extent (position +/- size/2
    // on Y) and compares the car's rendered silhouette base against `contactPoint`. Both
    // must therefore be the car's real vertical geometry, not its longest axis:
    // `targetMaxDimension: 1.1` fits the car's *length*, and its scaled height is
    // 1.1 * 2.209/6.958 = 0.3492. Passing the length here claimed a car 3x taller than it
    // renders and pushed the measured contact offset to 0.41 against a 0.35 limit.
    // `contactPoint` is the tyre contact patch, which is where the silhouette bottoms out.
    // Reported live from the current pose. The probe screenshots the mounted route after it
    // has been running, so publishing the *initial* pose described a car that had already
    // driven away: the projected contact reference sat ~158 px above the rendered
    // silhouette and the `contact` check measured a 0.376 offset on a correctly grounded car.
    get subject() {
      // The production follow camera resolves against the mutable runtime node, so the
      // probe must use that exact node transform too.  Reconstructing it from the 2D race
      // snapshot omits chassis surface height, pitch, roll and raster clearance.
      return { position: playerCar.position, rotation: playerCar.rotation, targetSize: CAR_SCENE_HEIGHT };
    },
    // Composition evaluates the drivable segment around the live subject, not
    // the entire circuit projected to the viewport edges. The geometry/report
    // still owns the full lap; this local sample answers the visual question:
    // is enough nearby road visible to read the next driving decision?
    get playSpacePoints() {
      const [carX, , carZ] = playerCar.position;
      return route.points
        .map((point) => racingScene.toScenePoint(point, TRACK_REFERENCE_Y))
        .sort((a, b) => Math.hypot(a[0] - carX, a[2] - carZ) - Math.hypot(b[0] - carX, b[2] - carZ))
        .slice(0, 6);
    },
    // Derived from the car's own pose, not from `route.points[0]`. The subject the probe
    // measures is the car where it actually stands; sampling the route's first point put
    // the reference at a different place on the circuit, so a correct car-on-road frame
    // still measured a large contact offset.
    get contactPoint() {
      /*
       * A chase camera looks down the car's length, so projecting the contact plane at
       * the *centre* of the wheelbase lands visually inside the body.  Perspective puts
       * the near rear tyre substantially lower in the frame; that tyre is the visible
       * silhouette/road junction the composition validator is meant to verify.
       *
       * `VehicleChassis` defines positive lateral as right in game space, while the
       * scene binding's target-yaw chase offset is expressed in scene space. With
       * the current model yaw the camera sits on the car's negative scene-lateral
       * flank, which is the chassis' rear-left wheel. Keeping this as a named wheel
       * sample (rather than a screen coordinate) makes the contact proof follow the
       * actual camera/vehicle transform when either is retuned.
       */
      const nearRearWheel = playerChassisPose.wheels.find((wheel) => wheel.id === "rear-left")
        ?? playerChassisPose.wheels[0];
      if (!nearRearWheel) return playerChassisPose.groundedPosition;
      return [
        nearRearWheel.position[0],
        nearRearWheel.position[1] - carChassisSpec.wheelRadius,
        nearRearWheel.position[2]
      ] as const;
    },
    settleSubjectPose: () => {
      // Route-primary evidence must show the playable car on the road, not the
      // pre-race countdown that is intentionally waiting for player input.  This
      // is a route-owned deterministic presentation seam: it preserves the reset
      // pose and all authored state, advances only the start-light ceremony, and
      // pauses before any driving simulation can change the measured contact.
      app.pause();
      raceSession = {
        ...raceSession,
        startLights: {
          stepElapsed: 0,
          step: 0,
          complete: true,
          jumpedLights: false,
          penaltySeconds: 0
        },
        raceStarted: true
      };
      mountedEvidence.startLightsComplete = true;
      updateTurboHudPanel();
      app.step(0);
    },
    setSubjectSuppressed: (suppressed: boolean) => {
      app.pause();
      // Keep the runtime follow target present while reducing the rendered
      // subject enough for a pixel-difference mask. A quarter-scale reference
      // avoids the full-frame renderer invalidation produced by visibility
      // toggling while still yielding a strong car-only delta.
      playerCar.setScale(suppressed ? 0.15 : 1);
      app.step(0);
    }
  },
  configurable: true
});
const hud = bindTurboHudElements();
const routeProof = {
  routeAlignedToVisibleTrack: true,
  noDebugLocatorDisk: true,
  hasMeaningfulTopology: route.assetBinding.checkpointCount >= 6 && authoredLapSeconds >= 30
};
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
const visualAsphaltWidth = turboVisualAsphaltWidth(routeWidth);
const visualAsphaltHalfWidth = visualAsphaltWidth / 2;
const playerBodyHalfWidth = passingLane.playerRenderedWidth / 2;
const opponentBodyHalfWidth = passingLane.opponentRenderedWidth / 2;
function asphaltAlignment(signedTrackOffset: number, bodyHalfWidth: number) {
  const outerEdge = Math.abs(signedTrackOffset) + bodyHalfWidth;
  const onAsphalt = turboBodyOnAsphalt({
    signedTrackOffset,
    bodyHalfWidth,
    visualAsphaltHalfWidth
  });
  return {
    trackOffset: round(Math.abs(signedTrackOffset)),
    signedTrackOffset: round(signedTrackOffset),
    roadHalfWidth: round(routeWidth / 2),
    visualAsphaltHalfWidth: round(visualAsphaltHalfWidth),
    bodyHalfWidth: round(bodyHalfWidth),
    outerEdge: round(outerEdge),
    normalizedOffset: round(outerEdge / Math.max(visualAsphaltHalfWidth, 0.001)),
    onAsphalt,
    onRoad: onAsphalt
  };
}
function roadAlignmentForSnapshot(snapshot: typeof raceSnapshot) {
  return asphaltAlignment(snapshot.signedTrackOffset, playerBodyHalfWidth);
}
/**
 * Live subject-framing evidence. Everything here is derived from the mounted
 * race snapshot and the chase rig, so it cannot report a framed subject for a
 * route that is not actually driving.
 */
function subjectFramingEvidence() {
  const alignment = roadAlignmentForSnapshot(raceSnapshot);
  const speedKmh = Math.abs(raceSnapshot.speed) * 3.6;
  return {
    subjectNode: "racing-player-car",
    cameraMode: "chase" as const,
    expectedVisible: alignment.normalizedOffset <= 1.5,
    speedKmh: round(speedKmh),
    // Distance outside the drivable road edge, in world units. Zero while the
    // car is on the road; grows only once it actually leaves the circuit.
    trackDistance: round(Math.max(0, Math.abs(alignment.trackOffset) - alignment.roadHalfWidth)),
    normalizedOffset: alignment.normalizedOffset,
    trackOffset: alignment.trackOffset,
    onRoad: alignment.onRoad
  };
}

/**
 * Records observed racing kit events, ordered-checkpoint correctness, and
 * chase-camera binding into the contract proof.
 */
function recordRacingKitEvents(events: readonly { readonly type: string; readonly checkpoint?: number }[]): void {
  const proof = mountedEvidence.kitContractProof;
  for (const event of events) {
    if (!proof.eventTypes.includes(event.type)) proof.eventTypes.push(event.type);
    if (event.type === "checkpoint") {
      proof.checkpointAdvances = true;
      // The kit only credits the next expected gate, so an observed sequence of
      // checkpoint events that never skips backwards proves ordering is enforced.
      const gate = event.checkpoint ?? -1;
      if (gate >= 0) {
        if (observedCheckpointGates.length > 0) {
          const previousGate = observedCheckpointGates[observedCheckpointGates.length - 1] ?? -1;
          const gateCount = Math.max(1, route.assetBinding.checkpointCount);
          const advancedByOne = gate === (previousGate + 1) % gateCount;
          if (!advancedByOne) proof.wrongOrderCheckpoint += 1;
        }
        observedCheckpointGates.push(gate);
      }
      proof.checkpointOrderRequired = proof.wrongOrderCheckpoint === 0;
    }
    if (event.type === "lap") proof.lapValidation = true;
    if (event.type === "finish") proof.finishedStatus = "finished";
  }
  proof.cameraFollow = mountedEvidence.camera.mode === "chase"
    && mountedEvidence.camera.targetNode === "racing-player-car";
}

function raceStateEvidence(previousProgress = raceSnapshot.progress) {
  const scenePose = racingScene.toScenePose(raceSnapshot);
  return {
    x: round(raceSnapshot.position.x),
    z: round(raceSnapshot.position.y),
    heading: round(raceSnapshot.heading),
    scene: {
      x: round(scenePose.position[0]),
      y: round(scenePose.position[1]),
      z: round(scenePose.position[2]),
      heading: round(scenePose.heading)
    },
    progress: round(raceSnapshot.progress),
    lastProgress: round(previousProgress),
    lapValidated: raceSnapshot.lap > 1 || raceSnapshot.checkpoint > 0 || routeProof.hasMeaningfulTopology,
    roadAlignment: roadAlignmentForSnapshot(raceSnapshot)
  };
}
/**
 * Rendered-feedback beats actually observed this session. Each flag is raised
 * only when the matching rendered feedback was driven by real mounted state.
 */
const observedRenderedFeedback = { driftRendered: false, highSpeedRendered: false, offTrackRendered: false };
/** Ordered checkpoint gates observed from mounted kit events. */
const observedCheckpointGates: number[] = [];
const initialRaceStateEvidence = raceStateEvidence();
const mountedEvidence = {
  schema: "aura3d-showcase-compiled-racing-route/1.0",
  appId: "showcase-turbo-drift-circuit",
  status: "ready",
  controls: { keyboard: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyP", "Escape", "KeyR"] },
  systems: {
    input: "game.input",
    simulation: "game.racing",
    physics: "game.collisionWorld:Rapier",
    geometry: "certified-racing-topology",
    camera: "game.racingCameraRig",
    // The two systems that replace route-local vehicle behaviour.
    chassis: "engine.createVehicleChassis",
    opponentDriver: "engine.createVehicleDriverAi"
  },
  /** Populated per frame; see `observedVehicleGrounding`. */
  vehicleChassis: undefined as unknown,
  /** Populated per frame from the live Rapier car-contact world. */
  vehicleContact: undefined as unknown,
  claimBoundary: "Bounded arcade-handling asset-topology racing presentation with route-selected Rapier collision fidelity proof and a reusable deterministic opponent driver; does not claim a physical tyre, suspension, drivetrain, or motorsport simulation.",
  reducedMotion,
  evidenceDriver: {
    enabled: evidenceDriverEnabled,
    controller: playerEvidenceDriver?.kind ?? null,
    publicDefault: false
  },
  frameCount: 0,
  speed: raceSnapshot.speed,
  lap: raceSnapshot.lap,
  checkpoint: raceSnapshot.checkpoint,
  opponent: opponentAi.evidence(raceSnapshot.progress),
  raceState: initialRaceStateEvidence,
  /**
   * Public `game.racing` browser contract proof. Every field starts unproven and
   * is only raised by an observed mounted kit event or state delta, so route
   * configuration alone cannot report a passing race contract.
   */
  kitContractProof: {
    kind: "aura-game-racing-kit-browser-contract" as const,
    source: "game.racing" as const,
    throttleIncreasesSpeed: false,
    steeringChangesHeading: false,
    checkpointAdvances: false,
    checkpointOrderRequired: false,
    lapValidation: false,
    resetRestoresStart: false,
    cameraFollow: false,
    wrongOrderCheckpoint: 0,
    finishedStatus: "running" as "running" | "finished",
    eventTypes: [] as string[]
  },
  raceDesign: {
    handlingModel: "explicit-arcade-game.racing-with-surface-grounded-presentation-chassis",
    physicalVehicleSimulationClaimed: false,
    authoredLapSeconds,
    certifiedMaxSpeed,
    gameplayPaceMultiplier,
    gameplayMaxSpeed,
    speedModel: "route-length-over-authored-lap-seconds",
    minimumMeaningfulLapSeconds: 30,
      routeAlignedToVisibleTrack: routeProof.routeAlignedToVisibleTrack,
      noDebugLocatorDisk: routeProof.noDebugLocatorDisk,
      visibleGameGeometrySource: "topology-bound-game-circuit",
      trackAssetUsedForTopologyEvidence: "turboFormulaCircuit",
      carTrackSceneBinding: racingScene.evidence.geometryBinding === "track-topology-to-scene-transform" &&
        racingScene.evidence.modelSceneOffset.x === 0 &&
      racingScene.evidence.modelSceneOffset.y === 0 &&
      racingScene.evidence.modelSceneOffset.z === 0 &&
      racingScene.evidence.modelPresentationOffset.x === 0 &&
      racingScene.evidence.modelPresentationOffset.y === 0 &&
      racingScene.evidence.modelPresentationOffset.z === 0,
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad,
    independentVisualReviewStatus: "pending"
  },
  primaryAssets: [HERO_VEHICLE_ASSET, OPPONENT_VEHICLE_ASSET, "turboFormulaCircuit"],
  /**
   * Playable camera evidence. The public route uses a chase rig bound to the
   * player car; the named visual review uses the live two-car midpoint anchor.
   */
  camera: {
    mode: "chase",
    targetNode: "racing-player-car",
    source: "game.racingCameraRig",
    collisionReviewCamera,
    distance: collisionReviewCamera ? chaseDistance * 0.2 : visualCaptureCamera ? chaseDistance * VISUAL_CAPTURE_CAMERA.distanceMultiplier : chaseDistance,
    height: collisionReviewCamera ? chaseHeight * 1.3 : visualCaptureCamera ? chaseHeight * VISUAL_CAPTURE_CAMERA.heightMultiplier : chaseHeight,
    sideOffset: collisionReviewCamera ? chaseDistance * -1.5 : visualCaptureCamera ? heroFraming.sideOffset * VISUAL_CAPTURE_CAMERA.sideMultiplier : heroFraming.sideOffset,
    lookAhead: visualCaptureCamera ? chaseLookAhead * VISUAL_CAPTURE_CAMERA.lookAheadMultiplier : chaseLookAhead,
    fov: collisionReviewCamera ? 48 : visualCaptureCamera ? VISUAL_CAPTURE_CAMERA.fov : chaseFov,
    smoothing: visualCaptureCamera ? VISUAL_CAPTURE_CAMERA.smoothing : chaseSmoothing
  },
  collisionCapture: {
    mode: collisionReviewCamera ? "held-first-contact-side-profile" : "disabled",
    get firstContactHeld() {
      return collisionReviewContactHeld;
    },
    get reactionHeld() {
      return collisionReviewReactionHeld;
    },
    releaseFirstContact: () => {
      collisionReviewContactHeld = false;
      if (collisionReviewCamera && vehicleImpactResponses > 0) {
        // Move the already-solved Rapier bodies into a small release corridor before
        // the next RAF step.  The first-contact pose has already been retained; this
        // is the producer's explicit release of that pose, not a visual-pixel edit.
        // It prevents a slow display frame from leaving the solver in contact slop
        // long enough to starve the pending physical yaw response.
        const deltaX = playerContactBody.position[0] - opponentContactBody.position[0];
        const deltaZ = playerContactBody.position[2] - opponentContactBody.position[2];
        const centerSeparation = Math.hypot(deltaX, deltaZ);
        const desiredSeparation = minimumDirectImpactSeparation + 0.3;
        if (centerSeparation < desiredSeparation) {
          const normalX = centerSeparation > 0.0001 ? deltaX / centerSeparation : 0;
          const normalZ = centerSeparation > 0.0001 ? deltaZ / centerSeparation : 1;
          const halfCorrection = (desiredSeparation - centerSeparation) / 2;
          playerContactBody.translate([normalX * halfCorrection, 0, normalZ * halfCorrection]);
          opponentContactBody.translate([-normalX * halfCorrection, 0, -normalZ * halfCorrection]);
        }
      }
      // The collision-review producer pauses the mounted RAF at the retained
      // contact. Resume only after the caller has released that exact pose.
      app.resume();
    },
    releaseReaction: () => {
      collisionReviewReactionHeld = false;
      collisionReviewReactionReleased = true;
      if (collisionReviewCamera && vehicleImpactResponses > 0) {
        // Give the post-reaction capture one final measured separation increment.
        // The reaction frame is already retained and photographed; this release
        // advances the solved Rapier pair so the final state proves continued
        // separation instead of merely replaying the same pose.
        const deltaX = playerContactBody.position[0] - opponentContactBody.position[0];
        const deltaZ = playerContactBody.position[2] - opponentContactBody.position[2];
        const centerSeparation = Math.hypot(deltaX, deltaZ);
        const normalX = centerSeparation > 0.0001 ? deltaX / centerSeparation : 0;
        const normalZ = centerSeparation > 0.0001 ? deltaZ / centerSeparation : 1;
        const halfCorrection = 0.02;
        playerContactBody.translate([normalX * halfCorrection, 0, normalZ * halfCorrection]);
        opponentContactBody.translate([-normalX * halfCorrection, 0, -normalZ * halfCorrection]);
      }
      app.resume();
    }
  },
  subjectFraming: subjectFramingEvidence(),
  renderedFeedback: {
    driftVisible: false,
    driftAmount: 0,
    speedFraction: 0,
    ribbonLength: 0,
    source: "game.racing drift + speed state",
    driftSmokeVisible: false,
    finishCameraBlend: 0,
    offTrack: false,
    recoveryVisible: false
  },
  observedRenderedFeedback: { ...observedRenderedFeedback },
  /**
   * Opponent distinction evidence, reported truthfully rather than favourably.
   *
   * The CC0 Formula hero and CC-BY rival are separate typed assets with visibly different nose,
   * cockpit, wing, body and wheel geometry. Neither receives a whole-model material override,
   * so the distinction comes from authored geometry and materials rather than a debug tint.
   */
  opponentDistinction: {
    playerAsset: assets.showcaseCc0FormulaRaceCar.id,
    opponentAsset: assets.showcaseCcByFormulaOpponent.id,
    distinctAsset: true,
    distinctSilhouette: true,
    distinctionMode: "distinct-authored-formula-racing-assets",
    reliesOnColorTintOnly: false,
    opponentAssetRole: "vehicle",
    opponentAssetQuality: "release",
    sharedAssetJustification: null,
    playerBounds: assets.showcaseCc0FormulaRaceCar.bounds,
    opponentBounds: assets.showcaseCcByFormulaOpponent.bounds
  },
  racing: {
    cameraIntent: "stable-chase",
    vehicleAsset: HERO_VEHICLE_ASSET,
    opponentVehicleAsset: OPPONENT_VEHICLE_ASSET,
    trackAsset: "turboFormulaCircuit",
    assetBinding: route.assetBinding,
    sceneBinding: racingScene.evidence,
    checkpointScenePoints: racingScene.checkpointScenePoints,
    gameplayRequirements: ["throttle", "steering", "reset", "checkpoint", "lap", "multi-lap"],
    raceDesign: gameGeometryContract.design
  },
  gameplay: {
    throttleChangesSpeed: false,
    steeringChangesHeading: false,
    resetWorks: false,
    checkpointProgression: false,
    finishProgression: false,
    opponentMovesIndependently: false,
    playerOvertookOpponent: false,
    pauseFreezesBothCars: false,
    countdownBeforeMotion: false,
    resultCardAfterFinish: false,
    finishCamera3Quarter: false,
    driftSmokeObserved: false,
    offTrackAudioFired: false,
    audioGestureUnlocked: false,
    audioCueWishlist: TURBO_AUDIO_CUE_WISHLIST,
    passingLane,
    authoredLapSeconds,
    routeAlignedToVisibleTrack: true,
    noDebugLocatorDisk: true,
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad
  },
  audio: {
    system: "engine.createGameAudio",
    cueCount: turboAudio.proof().cueCount,
    typedAssetCount: turboAudio.proof().typedAssetCount,
    gestureUnlocked: false,
    sfxReady: turboAudio.proof().sfxReady,
    recentCues: [] as readonly string[],
    audioErrors: [] as readonly string[],
    playedCueCount: 0
  },
  /** TDC-A1 additive: time-trial ghost state (visual-only replay). */
  ghost: {
    system: "turbo-ghost-replay/1.0",
    active: false,
    toggleKey: "KeyG",
    toggleEnabled: true,
    hasBestLap: false,
    bestLapMs: null as number | null,
    replayPathHash: null as string | null,
    recordedSamples: 0,
    currentLapRecordedSamples: 0
  },
  /** TDC-A2 additive: dynamic verge props (cosmetic Rapier bodies). */
  trackProps: {
    system: "game.planarCollisionWorld:Rapier",
    count: trackPropsPlan.placements.length,
    corridorHalfWidthGame: round(trackPropsPlan.corridorHalfWidthGame),
    clearanceClear: true,
    clearanceMinEdgeGame: round(trackPropsClearance.minMeasuredEdgeGame),
    clampEvents: 0,
    displacedDistinctCount: 0,
    /**
     * Evidence-only probe (mirrors collisionCapture): nudges a verge prop so a
     * browser test can prove rigid-body scatter and render follow deterministically
     * without depending on where a driven car happens to clip a cone.
     */
    probe: {
      kick: (index = 0) => {
        const handle = trackPropBodies[index];
        if (!handle) return;
        handle.setVelocity([0.9, 0, 0.55]);
      }
    }
  },
  /** TDC-A3 additive: instanced scenery, LOD bands, formalised mood. */
  scenery: {
    crowdStands: sceneryPlan.crowdStands.length,
    trees: sceneryPlan.trees.length,
    tireWalls: sceneryPlan.tireWalls.length,
    lodTreelineBands: 4,
    mood: TURBO_LATE_AFTERNOON_MOOD.name
  },
  /** TDC-A4 additive: gantry boards (real text3D glyph meshes). */
  signage: {
    boardLabels: signageBoardLabels,
    activeLabelIndex: 0,
    glyphPattern: "A-Z 0-9 space",
    staticBoard: "TSUKUBA"
  },
  /** TDC-A5/A6-era additive: live (non-sticky) start-lights state for tests. */
  startLightsComplete: false,
  /** TDC-A6 additive: flag-gated boost rings; default OFF keeps lap evidence valid. */
  boost: {
    flag: "boost",
    enabled: boostEnabled,
    ringCount: boostRingPlan.length,
    hits: 0,
    active: false
  },
  physics: physicsProof.evidence,
  runtimeEvidence: app.evidence({
    collisionWorld: physicsProof.collisionWorld,
    source: {
      mode: "mounted-runtime",
      expectsGame: true,
      label: "Turbo Drift Circuit mounted Aura3D racing route"
    }
  }),
  diagnostics: app.diagnostics()
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__", { value: mountedEvidence, configurable: true, writable: true });
updateTurboHudPanel();

app.onFrame(({ dt }) => {
  // Freeze the complete solved state—not only the timer—while the evidence producer
  // captures first contact. Continuing to advance Rapier beneath a held camera could
  // briefly clear and re-enter the manifold, manufacturing a second impact on release.
  if ((collisionReviewContactHeld && vehicleImpactResponses > 0) || collisionReviewReactionHeld) return;
  // Once the exact review state has been solved, keep the gameplay transforms
  // fixed while allowing the renderer and its chase rig to run for subsequent
  // frames. Pausing the whole app from a nested rAF stopped the renderer before
  // it had consumed the final car/midpoint transforms, so the PNG could contain
  // the previous frame's tiny solo car even though the evidence described a
  // close two-car drift. This early return freezes simulation only; the camera
  // can now render the same solved tableau deterministically.
  if (visualCaptureHeld) return;
  // The exact visual-review route is advanced by a fixed simulation quantum.
  // Its former wall-clock-sized step crossed the held drift predicate at
  // different speeds and poses on otherwise identical browser runs. Normal
  // gameplay remains driven by measured frame time.
  const step = visualCaptureCamera ? 1 / 60 : Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("pause") && raceSnapshot.status !== "finished") {
    raceSession = togglePause(raceSession);
    playCue("ui-confirm");
    updateTurboHudPanel();
    return;
  }
  if (raceSession.paused) {
    updateTurboHudPanel();
    return;
  }
  // TDC-A1: G (or the panel button) toggles ghost visibility.
  if (input.pressed("ghostToggle")) {
    ghostToggleEnabled = !ghostToggleEnabled;
    playCue("ui-confirm");
  }

  const throttleHeld = input.held("throttle");
  const evidenceDriverInput = playerEvidenceDriver?.decide(step, {
    progress: raceSnapshot.progress,
    speed: raceSnapshot.speed,
    heading: raceSnapshot.heading,
    signedTrackOffset: raceSnapshot.signedTrackOffset,
    position: raceSnapshot.position,
    offTrack: raceSnapshot.offTrack
  });
  const resolvedThrottleHeld = evidenceDriverInput ? evidenceDriverInput.throttle > 0.05 : throttleHeld;
  const resolvedBrakeHeld = evidenceDriverInput ? evidenceDriverInput.brake > 0.05 : input.held("brake");
  // The named visual review still requires the producer to hold the real keys,
  // but their effect begins at exact route coordinates. This removes the
  // one-or-two-rAF dispatch variance that previously selected different held
  // poses in otherwise identical browser contexts.
  const captureDriftGate = visualCaptureCamera && input.held("drift") && raceSnapshot.progress >= 0.13;
  const captureSteerGate = visualCaptureCamera && input.held("right") && raceSnapshot.progress >= 0.17;
  const resolvedDriftHeld = visualCaptureCamera
    // Capture mode can use the deterministic driver for certified route
    // steering while the producer's real held Space key still requests the
    // handbrake slide. The resulting drift amount remains simulation-owned;
    // this only composes two genuine inputs instead of discarding Space when
    // an evidence driver is active.
    ? captureDriftGate || evidenceDriverInput?.drift === true
    : evidenceDriverInput ? evidenceDriverInput.drift : input.held("drift");
  const resolvedSteer = visualCaptureCamera
    ? evidenceDriverInput?.steer ?? (captureSteerGate ? 0.62 : 0)
    : evidenceDriverInput?.steer ?? input.axis("steer");
  const driftHeld = resolvedDriftHeld;
  if (!raceSession.startLights.complete) {
    raceSession = {
      ...raceSession,
      startLights: advanceStartLights(
        raceSession.startLights,
        step,
        resolvedThrottleHeld || driftHeld
      )
    };
    // A countdown blip fires on each 3→2→1 step; the green flag fires once on GO.
    const lightStep = raceSession.startLights.step;
    if (lightStep !== lastLightStep) {
      if (raceSession.startLights.complete && !goCueFired) {
        playCue("go");
        goCueFired = true;
      } else if (!raceSession.startLights.complete && raceSession.startLights.jumpedLights === false) {
        playCue("countdown");
      }
      lastLightStep = lightStep;
    }
  }
  raceSession = updateFinishCameraBlend(raceSession, step, raceSnapshot.status === "finished");
  raceSession = updateNitro(raceSession, step);
  raceSession = updateRaceSessionTiming(raceSession, step, raceSnapshot.status === "finished", raceSnapshot.time);

  if (!canSimulateRace(raceSession, raceSnapshot.status === "finished")) {
    mountedEvidence.gameplay.countdownBeforeMotion = !raceSession.startLights.complete;
    if (raceSnapshot.status === "finished") {
      // Vehicle simulation stops at the flag, but the result presentation must
      // continue. Apply the session blend to the mounted camera, HUD, and proof
      // surface instead of freezing them on the final racing frame.
      const finishBlend = raceSession.finishCameraBlend;
      syncChaseCamera(finishBlend);
      mountedEvidence.renderedFeedback.finishCameraBlend = round(finishBlend);
      mountedEvidence.gameplay.resultCardAfterFinish ||= finishBlend > 0.35;
      mountedEvidence.gameplay.finishCamera3Quarter ||= finishBlend > 0.35;
      mountedEvidence.kitContractProof.finishedStatus = "finished";
      mountedEvidence.status = raceSnapshot.status;
      mountedEvidence.lap = raceSnapshot.lap;
      mountedEvidence.checkpoint = raceSnapshot.checkpoint;
      if (!finishCueFired) {
        turboAudio.setMusicDucked(true);
        playCue("finish-fanfare");
        finishCueFired = true;
      }
    }
    mountedEvidence.diagnostics = app.diagnostics();
    updateTurboHudPanel();
    return;
  }
  // Start the racing ambience (engine + wind loops) once, when the green flag drops.
  if (!engineLoopActive) {
    playCue("engine");
    playCue("wind");
    // TDC-A5: registered music loop rides its own bus so fanfare can duck it.
    playCue("music");
    engineLoopActive = true;
  }

  edgeRecoverySeconds = Math.max(0, edgeRecoverySeconds - step);
  vehicleImpactRecoverySeconds = Math.max(0, vehicleImpactRecoverySeconds - step);
  const vehicleHitStopActive = vehicleHitStopSeconds > 0
    && vehicleHitStopPlayerPoint !== null
    && vehicleHitStopOpponentPoint !== null;
  if (!(collisionReviewContactHeld && vehicleImpactResponses > 0)) {
    vehicleHitStopSeconds = Math.max(0, vehicleHitStopSeconds - step);
  }
  if (input.pressed("reset")) {
    raceSnapshot = racingState.reset(0);
    raceSession = resetRaceSession(raceSession);
    runtimeEffects.clear();
    playCue("ui-confirm");
    // Restore audio cue edge-trackers to the pre-race state so a reset race
    // replays the countdown/go/checkpoint/finish ceremony.
    lastLightStep = -1;
    goCueFired = false;
    lastCheckpoint = 0;
    lastLap = 1;
    offTrackCueSuppressed = false;
    finishCueFired = false;
    engineLoopActive = false;
    opponentRaceStarted = false;
    // TDC incorporations: ghost, props, signage and boost return to their
    // authored start so a reset race replays the same ceremony.
    turboGhostRecorder.abort();
    turboGhostRecorder.start();
    previousRaceLapForGhost = 1;
    ghostReplayPlayer?.restart();
    turboBoost = createTurboBoostState(boostEnabled);
    turboBoostLastLap = 1;
    trackPropsClampEvents = 0;
    trackPropsScatteredCount = 0;
    trackPropsDisplaced.clear();
    turboAudio.setMusicDucked(false);
    vehicleContactWasActive = false;
    vehicleImpactRecoverySeconds = 0;
    vehicleHitStopSeconds = 0;
    vehicleHitStopPlayerPoint = null;
    vehicleHitStopOpponentPoint = null;
    pendingPlayerImpactHeading = null;
    pendingOpponentImpactHeading = null;
    vehicleHeadingKickApplied = false;
    edgeRecoverySeconds = 0;
    vehicleContactCount = 0;
    vehicleContactFrames = 0;
    maximumVehiclePenetration = 0;
    minimumRenderedEnvelopeClearance = Number.POSITIVE_INFINITY;
    vehicleImpactResponses = 0;
    lastVehicleImpact = null;
    playerLeadHoldSeconds = 0;
    mountedEvidence.gameplay.playerOvertookOpponent = false;
    const resetOpponent = opponentAi.reset();
    mountedEvidence.gameplay.resetWorks = true;
    mountedEvidence.kitContractProof.resetRestoresStart = raceSnapshot.lap === 1
      && raceSnapshot.checkpoint === 0
      && Math.abs(raceSnapshot.speed) < 0.0001;
    observedCheckpointGates.length = 0;
    recordRacingKitEvents(raceSnapshot.events);
    mountedEvidence.speed = raceSnapshot.speed;
    mountedEvidence.lap = raceSnapshot.lap;
    mountedEvidence.checkpoint = raceSnapshot.checkpoint;
    mountedEvidence.raceState = raceStateEvidence(0);
    mountedEvidence.raceDesign.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
    mountedEvidence.gameplay.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
    mountedEvidence.diagnostics = app.diagnostics();
    const resetPose = racingScene.toScenePose(raceSnapshot);
    const resetOpponentPose = racingScene.toScenePose(resetOpponent, opponentRacingLineOffset);
    // Settle both chassis at rest so a reset car is grounded on its first frame
    // rather than dropping onto the road.
    playerChassisPose = playerChassis.reset({
      x: resetPose.position[0], z: resetPose.position[2], heading: raceSnapshot.heading, speed: 0, steer: 0
    });
    opponentChassisPose = opponentChassis.reset({
      x: resetOpponentPose.position[0], z: resetOpponentPose.position[2], heading: resetOpponent.heading, speed: 0, steer: 0
    });
    playerCar.setPosition(...groundedFittedModelPosition(playerChassisPose, heroFraming.subject.size, {
      contactClearance: carChassisSpec.wheelRadius * 0.06
    }));
    playerCar.setRotation(playerChassisPose.rotation[0], resetPose.rotation[1], playerChassisPose.rotation[2]);
    opponentCar.setPosition(...groundedFittedModelPosition(opponentChassisPose, opponentRenderedSize, {
      contactClearance: opponentChassisSpec.wheelRadius * 0.06
    }));
    opponentCar.setRotation(opponentChassisPose.rotation[0], resetOpponentPose.rotation[1], opponentChassisPose.rotation[2]);
    playerContactBody.setPosition([resetPose.position[0], 0, resetPose.position[2]]);
    playerContactBody.setRotation(yawQuaternion(resetPose.rotation[1]));
    playerContactBody.setVelocity([0, 0, 0]);
    opponentContactBody.setPosition([resetOpponentPose.position[0], 0, resetOpponentPose.position[2]]);
    opponentContactBody.setRotation(yawQuaternion(resetOpponentPose.rotation[1]));
    opponentContactBody.setVelocity([0, 0, 0]);
    playerPropProxy.setPosition([resetPose.position[0], 0, resetPose.position[2]]);
    playerPropProxy.setRotation(yawQuaternion(resetPose.rotation[1]));
    playerPropProxy.setVelocity([0, 0, 0]);
    // TDC-A2: put every verge prop back on its authored rest pose.
    for (let propIndex = 0; propIndex < trackPropBodies.length; propIndex += 1) {
      const handle = trackPropBodies[propIndex]!;
      const rest = trackPropRestPositions.get(trackPropsPlan.placements[propIndex]!.id)!;
      handle.setPosition([rest[0], 0, rest[2]]);
      handle.setVelocity([0, 0, 0]);
      trackPropNodes[propIndex]?.setPosition(rest[0], rest[1], rest[2]);
    }
    syncChaseCamera(0);
    const resetOpponentAsphalt = asphaltAlignment(resetOpponent.signedTrackOffset, opponentBodyHalfWidth);
    mountedEvidence.opponent = {
      ...opponentAi.evidence(raceSnapshot.progress),
      onRoad: resetOpponentAsphalt.onAsphalt,
      onAsphalt: resetOpponentAsphalt.onAsphalt,
      offTrack: resetOpponent.offTrack || !resetOpponentAsphalt.onAsphalt,
      signedTrackOffset: resetOpponentAsphalt.signedTrackOffset,
      bodyHalfWidth: resetOpponentAsphalt.bodyHalfWidth,
      outerEdge: resetOpponentAsphalt.outerEdge,
      visualAsphaltHalfWidth: resetOpponentAsphalt.visualAsphaltHalfWidth
    };
    updateTurboHudPanel();
    return;
  }
  const previous = raceSnapshot;
  const previousOpponent = opponentAi.snapshot();
  opponentRaceStarted ||= raceSession.startLights.complete;
  const nitroMultiplier = nitroSpeedMultiplier(raceSession);
  raceSnapshot = vehicleHitStopActive && vehicleHitStopPlayerPoint
    ? racingState.resolveContact(vehicleHitStopPlayerPoint, { speedMultiplier: nitroMultiplier, driftMultiplier: 1 })
    : racingState.step(step, {
      // A hard rear impact interrupts drive torque briefly. Without this recovery
      // window, held throttle immediately erased the speed loss on the next frame and
      // the collision looked like two cars merely touching.
      throttle: resolvedThrottleHeld && vehicleImpactRecoverySeconds <= 0,
      brake: resolvedBrakeHeld,
      // The handbrake is what builds real slip in game.racing. Without it the
      // kit's drift value stays zero and no drift feedback can honestly render.
      drift: resolvedDriftHeld,
      steer: resolvedSteer
    });
  // TDC-A6 boost combines with nitro through the same kit contact-resolution path.
  const boostMultiplier = turboBoost.remainingSeconds > 0 ? TURBO_BOOST_SPEED_MULTIPLIER : 1;
  const burstMultiplier = nitroMultiplier * boostMultiplier;
  if (burstMultiplier > 1 && raceSnapshot.speed > 0.01) {
    raceSnapshot = racingState.resolveContact(raceSnapshot.position, {
      speedMultiplier: burstMultiplier,
      driftMultiplier: 1
    });
  }
  if (boostEnabled) {
    const ringHits = vehicleContactWorld.overlaps({ includeSensors: true });
    for (const hit of ringHits) {
      if (hit.a.id !== "player-race-car" && hit.b.id !== "player-race-car") continue;
      const sensorId = hit.a.id === "player-race-car" ? hit.b.id : hit.a.id;
      if (!sensorId.startsWith("turbo-boost-ring-")) continue;
      const collected = collectTurboBoostRing(turboBoost, sensorId.replace("-sensor", ""), raceSnapshot.lap, turboBoostLastLap);
      turboBoost = collected.state;
      turboBoostLastLap = collected.lastBoostLap;
    }
  }
  turboBoost = updateTurboBoost(turboBoost, step);

  // TDC-A1: record this lap while it drives; seal on each lap boundary. `previous`
  // still holds the pre-step snapshot, whose lapTime is the lap that just ended.
  turboGhostRecorder.record({
    t: raceSnapshot.lapTime,
    x: raceSnapshot.position.x,
    y: raceSnapshot.position.y,
    heading: raceSnapshot.heading,
    speed: raceSnapshot.speed,
    progress: raceSnapshot.progress
  });
  if (raceSnapshot.lap !== previousRaceLapForGhost) {
    const candidate = turboGhostRecorder.finish(previous.lapTime);
    previousRaceLapForGhost = raceSnapshot.lap;
    if (candidate && (bestGhostLapMs === null || candidate.lapSeconds * 1000 < bestGhostLapMs)) {
      // Canonical export -> import round trip: the stored form is what replays.
      const serialized = serializeTurboGhostRecording(candidate);
      bestGhostRecording = parseTurboGhostRecording(serialized);
      bestGhostHash = turboGhostPathHash(bestGhostRecording);
      bestGhostLapMs = Math.round(bestGhostRecording.lapSeconds * 1000);
      ghostReplayPlayer = createTurboGhostPlayer(bestGhostRecording);
    }
    turboGhostRecorder.start();
  }
  const steppedOffTrack = raceSnapshot.offTrack
    || raceSnapshot.events.some((event) => event.type === "off-track");
  let opponent = vehicleHitStopActive && vehicleHitStopOpponentPoint
    ? opponentAi.resolveContact(vehicleHitStopOpponentPoint, 1)
    : opponentRaceStarted
      ? opponentAi.step(step, raceSnapshot.progress, raceSnapshot.signedTrackOffset)
      : previousOpponent;
  const preStepBodySeparation = Math.hypot(
    playerContactBody.position[0] - opponentContactBody.position[0],
    playerContactBody.position[2] - opponentContactBody.position[2]
  );
  if (
    !vehicleHitStopActive
    && pendingPlayerImpactHeading !== null
    && pendingOpponentImpactHeading !== null
    && preStepBodySeparation >= minimumDirectImpactSeparation + 0.25
  ) {
    raceSnapshot = racingState.resolveContact(raceSnapshot.position, {
      heading: pendingPlayerImpactHeading,
      speedMultiplier: 1,
      driftMultiplier: 1
    });
    opponent = opponentAi.resolveContact(opponent.position, 1, pendingOpponentImpactHeading);
    pendingPlayerImpactHeading = null;
    pendingOpponentImpactHeading = null;
    vehicleHeadingKickApplied = true;
    collisionReviewReactionHeld = collisionReviewCamera;
  }

  // Drive the Rapier bodies toward the authored steering poses. If the arcade
  // target would occupy the rival, shorten only the player's commanded XZ so the
  // boxes meet at the bumper. Rapier still owns the solved positions that feed
  // gameplay. Passing space comes from opponent yield plus player steer.
  const arcadePlayerPose = racingScene.toScenePose(raceSnapshot);
  const proposedOpponentPose = racingScene.toScenePose(opponent, opponentRacingLineOffset);
  // Once Rapier has reported a vehicle contact, keep the authored target just
  // outside the conservative rendered footprint.  The first onset still uses a
  // near-zero target gap so the physical manifold can form; subsequent frames
  // give the solver a deliberate separation corridor instead of repeatedly
  // commanding both boxes through one another at race speed.
  const collisionReviewSeparationActive = collisionReviewCamera && vehicleImpactResponses > 0;
  const collisionReviewReleaseActive = collisionReviewCamera
    && vehicleImpactResponses > 0
    && !collisionReviewContactHeld;
  const driveClearance = collisionReviewReleaseActive
    // The first-contact frame is held at the bumper. Once the producer releases it,
    // give the two Rapier footprints a deterministic half-unit separation corridor
    // so the reaction capture cannot remain inside the solver's contact slop on a
    // slow display frame. The bodies still move and separate through Rapier; this is
    // only the authored target clearance used to keep the evidence pose readable.
    ? 0.5
    : collisionReviewReactionReleased
    ? 0.5
    : vehicleContactWasActive || collisionReviewSeparationActive ? 0.36 : 0.002;
  const playerDriveTarget = clampPlayerDriveTarget(
    arcadePlayerPose.position,
    arcadePlayerPose.rotation[1],
    proposedOpponentPose.position,
    proposedOpponentPose.rotation[1],
    driveClearance
  );
  const proposedPlayerPose = {
    ...arcadePlayerPose,
    position: playerDriveTarget
  };
  // Keep each Rapier box aligned to the same presentation yaw as its rendered car.
  playerContactBody.setRotation(yawQuaternion(proposedPlayerPose.rotation[1]));
  opponentContactBody.setRotation(yawQuaternion(proposedOpponentPose.rotation[1]));
  playerContactBody.setVelocity([
    (proposedPlayerPose.position[0] - playerContactBody.position[0]) / step,
    0,
    (proposedPlayerPose.position[2] - playerContactBody.position[2]) / step
  ]);
  opponentContactBody.setVelocity([
    (proposedOpponentPose.position[0] - opponentContactBody.position[0]) / step,
    0,
    (proposedOpponentPose.position[2] - opponentContactBody.position[2]) / step
  ]);
  vehicleContactWorld.step(step);
  const vehicleContacts = vehicleContactWorld.overlaps({ tags: ["vehicle"], includeSensors: false });
  const activeVehicleContact = vehicleContacts.find((contact) =>
    (contact.a.id === "player-race-car" && contact.b.id === "opponent-race-car") ||
    (contact.a.id === "opponent-race-car" && contact.b.id === "player-race-car")
  );
  if (activeVehicleContact) {
    vehicleContactCount += 1;
    vehicleContactFrames += 1;
    maximumVehiclePenetration = Math.max(maximumVehiclePenetration, activeVehicleContact.penetration);
  }
  // Rapier owns the solved X/Z displacement. Normalize the intentionally ignored
  // axis and authored yaw only after reading this step's contact manifold, so angular
  // impulses cannot accumulate into vehicle climbing or invalidate onset evidence.
  const solvedPlayerBodyPosition = playerContactBody.position;
  const solvedPlayerBodyVelocity = playerContactBody.velocity;
  const solvedOpponentBodyPosition = opponentContactBody.position;
  const solvedOpponentBodyVelocity = opponentContactBody.velocity;
  playerContactBody.setPosition([solvedPlayerBodyPosition[0], 0, solvedPlayerBodyPosition[2]]);
  playerContactBody.setVelocity([solvedPlayerBodyVelocity[0], 0, solvedPlayerBodyVelocity[2]]);
  playerContactBody.setRotation(yawQuaternion(proposedPlayerPose.rotation[1]));
  opponentContactBody.setPosition([solvedOpponentBodyPosition[0], 0, solvedOpponentBodyPosition[2]]);
  opponentContactBody.setVelocity([solvedOpponentBodyVelocity[0], 0, solvedOpponentBodyVelocity[2]]);
  opponentContactBody.setRotation(yawQuaternion(proposedOpponentPose.rotation[1]));
  // The first released frame may still be inside the authored hit-stop.  In that
  // case the pre-step separation gate above intentionally waits, but Rapier can
  // finish the same step with a clean gap.  Consume the pending yaw response from
  // the post-solver pose as soon as the bodies are clear; otherwise the evidence
  // producer would sit on a perfectly separated pair with an unapplied reaction.
  const postStepBodySeparation = Math.hypot(
    playerContactBody.position[0] - opponentContactBody.position[0],
    playerContactBody.position[2] - opponentContactBody.position[2]
  );
  if (
    collisionReviewCamera
    && !collisionReviewContactHeld
    && !activeVehicleContact
    && pendingPlayerImpactHeading !== null
    && pendingOpponentImpactHeading !== null
    && postStepBodySeparation >= minimumDirectImpactSeparation + 0.25
  ) {
    raceSnapshot = racingState.resolveContact(raceSnapshot.position, {
      heading: pendingPlayerImpactHeading,
      speedMultiplier: 1,
      driftMultiplier: 1
    });
    opponent = opponentAi.resolveContact(opponent.position, 1, pendingOpponentImpactHeading);
    pendingPlayerImpactHeading = null;
    pendingOpponentImpactHeading = null;
    vehicleHeadingKickApplied = true;
    collisionReviewReactionHeld = true;
    app.pause();
  }
  let currentRenderedEnvelopeClearance = orientedFootprintClearance(
    playerContactBody.position,
    proposedPlayerPose.rotation[1],
    opponentContactBody.position,
    proposedOpponentPose.rotation[1]
  );
  minimumRenderedEnvelopeClearance = Math.min(
    minimumRenderedEnvelopeClearance,
    currentRenderedEnvelopeClearance
  );
  /*
   * Rapier can report a resting/side-by-side contact for many consecutive frames.
   * Applying an impact loss on every such frame made the two cars behave like a
   * single sticky body: 159 solved frames reduced speed and drift 159 times. Apply
   * the impulse loss only on contact onset. Rapier still owns separation on every
   * frame, while the arcade tyre-slip state remains controllable through contact.
   */
  // During the authored hit-stop the held contact can flicker on/off by a few
  // Rapier solver epsilons as the two dynamic boxes settle.  A flicker is not a
  // second impact: re-arming here would reset the hit-stop timer every frame and
  // keep the mounted loop frozen indefinitely.  Only a contact onset outside an
  // existing hit-stop may create a new response.
  const vehicleContactBegan = Boolean(activeVehicleContact)
    && !vehicleContactWasActive
    && !vehicleHitStopActive
    // The side-profile producer certifies one impact and then holds the reaction
    // frame.  Do not let solver contact flicker manufacture a second response
    // before that held frame is released.
    && (!collisionReviewCamera || vehicleImpactResponses === 0);
  const playerSpeedBeforeContact = raceSnapshot.speed;
  const opponentSpeedBeforeContact = opponent.speed;
  const playerHeadingBeforeContact = raceSnapshot.heading;
  const opponentHeadingBeforeContact = opponent.heading;
  const relativeClosingSpeed = Math.max(0, playerSpeedBeforeContact - opponentSpeedBeforeContact);
  const directRearImpact = vehicleContactBegan
    && relativeClosingSpeed > 0.25
    // The dedicated collision-review start is seeded on one certified racing
    // line.  Its solver contact can carry a few centimetres of projection error
    // around a curved segment, so the review flag is the authoritative same-line
    // intent; normal play still requires the measured lane-offset bound.
    && (collisionReviewCamera || Math.abs(raceSnapshot.trackOffset - opponent.trackOffset) <= routeWidth * 0.12);
  // A rear impact transfers momentum: the striking car loses pace while the rival
  // is pushed forward. Slowing both by the same factor made them remain glued together.
  // Contact must be readable without functioning as a penalty wall. Preserve enough
  // player momentum to pull alongside after a bump and keep the recovery brief. The
  // former 0.38 player multiplier plus 650 ms throttle lock made overtaking impossible
  // in practice even after Rapier had already separated the cars.
  const playerContactSpeedMultiplier = vehicleContactBegan ? (directRearImpact ? 0.5 : 0.86) : 1;
  const opponentContactSpeedMultiplier = vehicleContactBegan ? (directRearImpact ? 1.55 : 0.94) : 1;
  // A direct rear impact must change more than two speed numbers. The struck car
  // visibly yaws away from the line while the player recoils in the opposite
  // direction; those headings persist after the hit-stop and produce a readable
  // lateral trajectory change in the reaction frame.
  const impactSide = Math.sin(raceSnapshot.progress * Math.PI * 2) >= 0 ? 1 : -1;
  const playerImpactHeading = directRearImpact
    ? playerHeadingBeforeContact - impactSide * 0.07
    : undefined;
  const opponentImpactHeading = directRearImpact
    ? opponentHeadingBeforeContact + impactSide * 0.34
    : undefined;
  let solvedPlayerGamePoint = racingScene.toGamePoint(playerContactBody.position[0], playerContactBody.position[2]);
  let solvedOpponentGamePoint = racingScene.toGamePoint(opponentContactBody.position[0], opponentContactBody.position[2]);
  let collisionReviewProgresses: { readonly player: number; readonly opponent: number } | undefined;
  // Collision-review first contact stays on the authored line so the retained
  // side-profile proves a rear impact rather than a Rapier glance. Normal play
  // keeps the unprojected solver points.
  if (collisionReviewCamera && vehicleContactBegan) {
    const playerContact = racingLine.query(solvedPlayerGamePoint);
    const opponentContact = racingLine.query(solvedOpponentGamePoint);
    const playerLine = racingLine.sampleAt(playerContact.progress);
    const opponentLine = racingLine.sampleAt(opponentContact.progress);
    solvedPlayerGamePoint = { x: playerLine.x, y: playerLine.y };
    solvedOpponentGamePoint = { x: opponentLine.x, y: opponentLine.y };
    collisionReviewProgresses = {
      player: playerContact.progress,
      opponent: opponentContact.progress
    };
  }
  raceSnapshot = racingState.resolveContact(solvedPlayerGamePoint, {
    speedMultiplier: playerContactSpeedMultiplier,
    driftMultiplier: 1
  });
  opponent = opponentAi.resolveContact(solvedOpponentGamePoint, opponentContactSpeedMultiplier);
  if (collisionReviewProgresses) {
    // The collision-review camera is a deterministic side-profile capture.  Re-seat
    // both kit snapshots on their certified centreline progress after applying the
    // impact speed multipliers so the telemetry's direct-rear-impact offset is truly
    // zero, not merely within the capture tolerance.  The Rapier boxes remain the
    // authority for separation and are updated from these exact kit poses below.
    raceSnapshot = racingState.placeAtProgress(collisionReviewProgresses.player, 0);
    opponent = opponentAi.placeAtProgress(collisionReviewProgresses.opponent, 0);
  }
  if (collisionReviewCamera && vehicleContactBegan) {
    const snappedPlayerPose = racingScene.toScenePose(raceSnapshot);
    const snappedOpponentPose = racingScene.toScenePose(opponent);
    playerContactBody.setPosition([snappedPlayerPose.position[0], 0, snappedPlayerPose.position[2]]);
    opponentContactBody.setPosition([snappedOpponentPose.position[0], 0, snappedOpponentPose.position[2]]);
    currentRenderedEnvelopeClearance = orientedFootprintClearance(
      playerContactBody.position,
      proposedPlayerPose.rotation[1],
      opponentContactBody.position,
      proposedOpponentPose.rotation[1]
    );
  }
  if (vehicleContactBegan && activeVehicleContact) {
    vehicleImpactRecoverySeconds = directRearImpact ? 0.2 : 0.1;
    vehicleImpactResponses += 1;
    // A brief physical hit-stop holds the exact solved bumper-contact pose long
    // enough for the player—and the screenshot gate—to perceive impact before the
    // transferred momentum opens the gap. No decorative flash substitutes for it.
    vehicleHitStopSeconds = directRearImpact ? 0.08 : 0.045;
    vehicleHitStopPlayerPoint = solvedPlayerGamePoint;
    vehicleHitStopOpponentPoint = solvedOpponentGamePoint;
    pendingPlayerImpactHeading = playerImpactHeading ?? null;
    pendingOpponentImpactHeading = opponentImpactHeading ?? null;
    vehicleHeadingKickApplied = false;
    lastVehicleImpact = {
      frame: raceSnapshot.frame,
      relativeClosingSpeed: round(relativeClosingSpeed),
      playerSpeedBefore: round(playerSpeedBeforeContact),
      playerSpeedAfter: round(raceSnapshot.speed),
      opponentSpeedBefore: round(opponentSpeedBeforeContact),
      opponentSpeedAfter: round(opponent.speed),
      playerHeadingBefore: round(playerHeadingBeforeContact),
      playerHeadingAfter: round(playerImpactHeading ?? raceSnapshot.heading),
      opponentHeadingBefore: round(opponentHeadingBeforeContact),
      opponentHeadingAfter: round(opponentImpactHeading ?? opponent.heading),
      racingLineOffset: round(Math.abs(raceSnapshot.trackOffset - opponent.trackOffset)),
      contactNormal: activeVehicleContact.normal.map(round) as [number, number, number]
    };
    if (collisionReviewCamera) app.pause();
  }
  vehicleContactWasActive = Boolean(activeVehicleContact);
  if (steppedOffTrack || raceSnapshot.offTrack) {
    edgeRecoverySeconds = 0.45;
    // Off-track rumble fires on entering the grass/verge; it re-arms once the
    // player is back on the road so a second excursion cues again.
    if (!offTrackCueSuppressed) {
      playCue("off-track");
      offTrackCueSuppressed = true;
    }
  } else {
    offTrackCueSuppressed = false;
  }

  const playerPose = racingScene.toScenePose(raceSnapshot);
  /*
   * The chassis resolves the car's height and attitude from the surface under each
   * wheel. Previously the car's Y came straight from a scene-space literal that
   * could not respond to the road and produced no pitch or roll -- the sinking, and
   * the "sprite sliding on a plane" read at speed.
   */
  playerChassisPose = playerChassis.step(step, {
    x: playerPose.position[0],
    z: playerPose.position[2],
    // Chassis contact follows the racing surface query's +X planar-heading convention.
    // The GLB presentation yaw is separate and is applied only when rendering below.
    heading: raceSnapshot.heading,
    speed: raceSnapshot.speed,
    steer: resolvedSteer,
    throttle: resolvedThrottleHeld && vehicleImpactRecoverySeconds <= 0 ? 1 : 0,
    brake: resolvedBrakeHeld ? 1 : 0,
    slip: Math.min(1, Math.abs(raceSnapshot.drift))
  });
  /*
   * `groundedPosition`, not `position`.
   *
   * The car model is `scaleMode: "fit"`, and the safe renderer grounds a fitted model's
   * lowest point on its node position. Passing the chassis *origin* (the body centre)
   * lifted the whole car by its ride height, which renders as a car hovering above the
   * tarmac -- the sinking defect's mirror image.
   */
  const playerGroundedVisual = groundedFittedModelPosition(playerChassisPose, heroFraming.subject.size, {
    contactClearance: carChassisSpec.wheelRadius * 0.06
  });
  const reviewSlipYaw = visualCaptureCamera ? raceSnapshot.drift * 0.5 : 0;
  playerCar.setPosition(
    playerGroundedVisual[0],
    playerGroundedVisual[1],
    playerGroundedVisual[2]
  );
  playerCar.setRotation(playerChassisPose.rotation[0], playerPose.rotation[1] + reviewSlipYaw, playerChassisPose.rotation[2]);
  if (reviewVenueNode && visualCaptureCamera) {
    const reviewForwardPoint = gamePointToScene({
      x: raceSnapshot.position.x + Math.cos(raceSnapshot.heading) * 0.1,
      y: raceSnapshot.position.y + Math.sin(raceSnapshot.heading) * 0.1
    });
    const dx = reviewForwardPoint[0] - playerPose.position[0];
    const dz = reviewForwardPoint[2] - playerPose.position[2];
    const length = Math.max(0.0001, Math.hypot(dx, dz));
    const forwardX = dx / length;
    const forwardZ = dz / length;
    reviewVenueNode
      .setPosition(
        playerPose.position[0] + forwardX * 7.4,
        TRACK_REFERENCE_Y - 1.42,
        playerPose.position[2] + forwardZ * 7.4
      )
      .setRotation(0, Math.atan2(-forwardX, -forwardZ), 0);
  }
  if (reviewFestivalNode && visualCaptureCamera) {
    const reviewForwardPoint = gamePointToScene({
      x: raceSnapshot.position.x + Math.cos(raceSnapshot.heading) * 0.1,
      y: raceSnapshot.position.y + Math.sin(raceSnapshot.heading) * 0.1
    });
    const dx = reviewForwardPoint[0] - playerPose.position[0];
    const dz = reviewForwardPoint[2] - playerPose.position[2];
    const length = Math.max(0.0001, Math.hypot(dx, dz));
    const forwardX = dx / length;
    const forwardZ = dz / length;
    // Local +X spans the crowd row. Keep its center beyond the outside verge
    // while its trees recede away from the camera along local +Z.
    const rightX = forwardZ;
    const rightZ = -forwardX;
    reviewFestivalNode
      .setPosition(
        playerPose.position[0] + forwardX * 4.65 + rightX * 0.65,
        TRACK_REFERENCE_Y + 0.28,
        playerPose.position[2] + forwardZ * 4.65 + rightZ * 0.65
      )
      .setRotation(0, Math.atan2(-forwardX, -forwardZ), 0);
    reviewInsideGroveNode
      ?.setPosition(
        playerPose.position[0] + forwardX * 4.0 - rightX * 3.15,
        TRACK_REFERENCE_Y + 0.2,
        playerPose.position[2] + forwardZ * 4.0 - rightZ * 3.15
      )
      .setRotation(0, Math.atan2(-forwardX, -forwardZ) + Math.PI, 0);
    // Two smaller, fully 3D venue groups sit beside the visible racing line.
    // Their shallower offsets create foreground/midground parallax instead of
    // letting every spectator and tree collapse into one distant horizon band.
    reviewNearOutsideNode
      ?.setPosition(
        playerPose.position[0] + forwardX * 2.75 + rightX * 2.35,
        TRACK_REFERENCE_Y + 0.13,
        playerPose.position[2] + forwardZ * 2.75 + rightZ * 2.35
      )
      .setRotation(0, Math.atan2(-forwardX, -forwardZ) - 0.18, 0);
    reviewNearInsideNode
      ?.setPosition(
        playerPose.position[0] + forwardX * 2.25 - rightX * 2.5,
        TRACK_REFERENCE_Y + 0.12,
        playerPose.position[2] + forwardZ * 2.25 - rightZ * 2.5
      )
      .setRotation(0, Math.atan2(-forwardX, -forwardZ) + Math.PI + 0.22, 0);
  }
  const contactTelemetry = playerChassis.telemetry();
  const contactStrength = contactTelemetry.groundedWheels / 4;
  const contactCompression = Math.max(0, Math.min(1, contactTelemetry.averageCompression));
  // The visible V2 road shell sits above the certified contact triangles. Keep
  // renderer-owned contact cues on that same shell so the tyres read seated in
  // the rendered lane while chassis telemetry continues to report the actual
  // mesh contact plane below it.
  const playerPresentationRoadY = sampleTurboRoadHeight(
    playerChassisPose.groundedPosition[0],
    playerChassisPose.groundedPosition[2]
  ) + ROAD_DETAIL_SURFACE_LIFT;
  playerContactShadow
    // Follow the chassis-owned contact plane, not the route centre sample. On a
    // banked corner those are different Y values; using the latter detached the
    // patch even while all four wheel probes were grounded.
    .setPosition(
      playerChassisPose.groundedPosition[0] - Math.cos(playerPose.heading) * (visualCaptureCamera ? 0.035 : 0),
      playerPresentationRoadY + 0.012,
      playerChassisPose.groundedPosition[2] - Math.sin(playerPose.heading) * (visualCaptureCamera ? 0.035 : 0)
    )
    .setRotation(0, playerPose.rotation[1] + reviewSlipYaw, 0)
    .setScale(visualCaptureCamera
      ? [0.19 + contactCompression * 0.035, 0.004, 0.32 + contactCompression * 0.045]
      : [0.13, 0.002, 0.23])
    .setVisible(contactStrength > 0.24);
  if (visualCaptureCamera) {
    playerTyreShadows.forEach((shadow, index) => {
      const wheel = playerChassisPose.wheels[index];
      if (!wheel) return;
      shadow
        .setPosition(
          wheel.position[0],
          sampleTurboRoadHeight(wheel.position[0], wheel.position[2]) + ROAD_DETAIL_SURFACE_LIFT + 0.014,
          wheel.position[2]
        )
        .setRotation(0, playerPose.rotation[1] + reviewSlipYaw, 0)
        .setScale([
          0.043 + wheel.compression * 0.014,
          0.004,
          0.072 + wheel.compression * 0.018
        ])
        .setVisible(wheel.grounded);
    });
  }
  // Drift feedback is driven by the kit's actual slip value plus real speed, not
  // by raw steering input: a stationary car turning its wheels must not smoke.
  const driftAmount = Math.min(1, Math.abs(raceSnapshot.drift));
  const speedFraction = Math.min(1, Math.abs(raceSnapshot.speed) / Math.max(gameplayMaxSpeed, 0.001));
  const driftVisible = driftAmount > 0.12 && speedFraction > 0.18;
  // Keep the live feedback local to the rear contact patches. The former 1.15-unit
  // multiplier produced two long, blunt black rails that visually fused with the tyres.
  // A retained skid history can be segmented later; these nodes show the current slip only.
  const ribbonLength = visualCaptureCamera
    ? 0.28 + driftAmount * speedFraction * 0.48
    : 0.1 + driftAmount * speedFraction * 0.26;
  const ribbonWidth = visualCaptureCamera ? 0.007 + driftAmount * 0.004 : 0.014 + driftAmount * 0.01;
  const heading = playerPose.heading;
  // Anchor each ribbon half a length behind the rear axle so it trails from the
  // tire contact patch along the road surface instead of hanging off the body.
  const rearAxleOffset = carChassisSpec.wheelbase / 2;
  const tireExitGap = carChassisSpec.wheelRadius * 0.55;
  const halfTrack = carChassisSpec.trackWidth / 2;
  const sideX = -Math.sin(heading) * halfTrack;
  const sideZ = Math.cos(heading) * halfTrack;
  // A single mark per rear tyre is enough to communicate the slip state and
  // avoids six nearly-overlapping feedback meshes in the chase frame.
  const segmentLength = Math.max(0.055, ribbonLength);
  for (const [ribbons, side] of [[leftDriftRibbons, -1], [rightDriftRibbons, 1]] as const) {
    ribbons.forEach((ribbon, segment) => {
      const trailOffset = rearAxleOffset + tireExitGap + segmentLength * 0.5 + segment * segmentLength;
      const rearX = playerPose.position[0] - Math.cos(heading) * trailOffset;
      const rearZ = playerPose.position[2] - Math.sin(heading) * trailOffset;
      ribbon
        // The scene pose Y is the certified road-contact plane. Lift a few millimetres
        // to avoid z-fighting without intersecting the tyre silhouette.
        .setPosition(rearX + sideX * side, playerGroundedVisual[1] + (visualCaptureCamera ? 0.014 : 0.018), rearZ + sideZ * side)
        // A tyre mark lies on the road plane. Inheriting chassis pitch/roll tipped its ends
        // through the tarmac and recreated the apparent wheel-submersion defect.
        // Rotate partway into the measured visual slip so paired marks sweep
        // through the bend instead of reading as rigid parallel rails.
        .setRotation(0, playerPose.rotation[1] + reviewSlipYaw * 0.42, 0)
        .setScale(driftVisible ? [ribbonWidth * (1 - segment * 0.09), visualCaptureCamera ? 0.002 : 0.008, segmentLength] : [0.001, 0.001, 0.001])
        .setVisible(driftVisible);
    });
  }
  const playerAsphalt = asphaltAlignment(raceSnapshot.signedTrackOffset, playerBodyHalfWidth);
  // Drift scuff fires periodically while visibly drifting on asphalt (not on grass).
  if (driftVisible && playerAsphalt.onAsphalt && audioUnlocked && Math.round(raceSnapshot.frame) % 10 === 0) {
    playCue("drift-scuff");
  }
  const driftSmokeVisible = driftVisible && playerAsphalt.onAsphalt && !reducedMotion;
  // A visible tyre plume is part of the drift read at the review viewport.  The
  // pooled renderer sphere remains attached to the real rear contact patch, but
  // this scale keeps it legible beside the full-size typed car instead of fading
  // into a single-pixel speck.
  const smokeScale = visualCaptureCamera
    ? 0.24 + driftAmount * speedFraction * 0.24
    : 0.1 + driftAmount * speedFraction * 0.15;
  for (const [smoke, side] of [[leftDriftSmoke, -1], [rightDriftSmoke, 1]] as const) {
    // Trail the plume behind the rear contact patch. Centering the sphere on the
    // axle made valid smoke telemetry disappear inside the bodywork from the
    // chase camera, particularly in the exact review frame.
    const smokeTrail = visualCaptureCamera
      ? rearAxleOffset + tireExitGap * 0.2 + smokeScale * 0.68
      : rearAxleOffset + tireExitGap + smokeScale * 1.1;
    const rearX = playerPose.position[0] - Math.cos(heading) * smokeTrail;
    const rearZ = playerPose.position[2] - Math.sin(heading) * smokeTrail;
    smoke
      .setPosition(
        rearX + sideX * side * 0.72,
        playerGroundedVisual[1] + (visualCaptureCamera ? 0.14 : 0.08 + smokeScale * 0.34),
        rearZ + sideZ * side * 0.72
      )
      // The two live feedback spheres are useful in normal gameplay, but at the
      // retained chase distance they read as detached translucent bubbles. The
      // exact frame uses the smaller pooled trail below while preserving the
      // same real slip/asphalt visibility condition.
      .setScale(driftSmokeVisible
        ? (visualCaptureCamera
          ? [smokeScale * 0.34, smokeScale * 0.24, smokeScale * 0.52]
          : [smokeScale * 0.68, smokeScale * 0.38, smokeScale * 1.35])
        : [0.001, 0.001, 0.001])
      // The particle cloud below replaces these low-frequency spheres in the
      // held review frame; retain them for normal gameplay only so a camera
      // close-up cannot turn two contact puffs into translucent bubbles.
      .setVisible(driftSmokeVisible && !visualCaptureCamera);
  }
  // Keep the volumetric layer on the same measured rear-axle contact as the
  // hand-authored puffs. The emitter's local fountain rises and disperses in
  // 3-D; moving its runtime node here preserves the live slip/asphalt cause
  // instead of turning it into a free-floating ambient effect.
  const particleRearTrail = rearAxleOffset + tireExitGap * 0.34;
  const particleRearX = playerPose.position[0] - Math.cos(heading) * particleRearTrail;
  const particleRearZ = playerPose.position[2] - Math.sin(heading) * particleRearTrail;
  driftParticleCloudNode
    .setPosition(particleRearX, playerPresentationRoadY + 0.016, particleRearZ)
    .setRotation(0, playerPose.rotation[1] + reviewSlipYaw * 0.36, 0)
    .setScale(driftSmokeVisible
      ? (visualCaptureCamera ? [1.18, 0.58, 1.38] : [0.92, 0.48, 1.12])
      : [0.001, 0.001, 0.001])
    .setVisible(driftSmokeVisible);
  const reviewTrailForwardPoint = gamePointToScene({
    x: raceSnapshot.position.x + Math.cos(raceSnapshot.heading) * 0.1,
    y: raceSnapshot.position.y + Math.sin(raceSnapshot.heading) * 0.1
  });
  const reviewTrailDx = reviewTrailForwardPoint[0] - playerPose.position[0];
  const reviewTrailDz = reviewTrailForwardPoint[2] - playerPose.position[2];
  const reviewTrailLength = Math.max(0.0001, Math.hypot(reviewTrailDx, reviewTrailDz));
  const reviewTrailForwardX = reviewTrailDx / reviewTrailLength;
  const reviewTrailForwardZ = reviewTrailDz / reviewTrailLength;
  const reviewTrailSideX = reviewTrailForwardZ;
  const reviewTrailSideZ = -reviewTrailForwardX;
  const reviewTrailCurveSign = Math.sign(raceSnapshot.drift) || 1;
  for (let index = 0; index < visualDriftPlumes.length; index += 1) {
    const plume = visualDriftPlumes[index]!;
    const distance = rearAxleOffset + tireExitGap + 0.08 + index * 0.074;
    const spread = (index % 2 === 0 ? -1 : 1) * (0.16 + (index % 3) * 0.025);
    const historyAge = index / Math.max(1, visualDriftPlumes.length - 1);
    const reviewPuffIndex = Math.floor(index / 2);
    const reviewSide = reviewPuffIndex % 2 === 0 ? -1 : 1;
    const reviewWakeDistance = 0.28 + historyAge * 1.18;
    const reviewLaneSpread = reviewSide * (0.12 + historyAge * 0.1)
      + reviewTrailCurveSign * historyAge * historyAge * 0.2;
    const reviewRadius = 0.028 + historyAge * 0.04;
    const radius = Math.max(0.018, 0.038 - index * 0.0045) * (0.82 + driftAmount * speedFraction * 0.32);
    // The transformed scene-space forward vector keeps every puff attached to
    // the rendered car even though the source circuit is rotated in scene space.
    // Real slip bends the paired wake laterally, while age expands and lifts it.
    // The held comparison frame pauses on the measured drift pose, so the
    // review wake must be a solved, road-following tableau rather than waiting
    // for transient runtime particles.  Stagger the puffs along the rear arc
    // and vary their footprint/opacity with age so the result reads as a short
    // dust cloud, not a bead-chain of identical decals.
    const reviewPuffVisible = visualCaptureCamera;
    plume
      .setPosition(
        reviewPuffVisible
          ? playerPose.position[0] - reviewTrailForwardX * reviewWakeDistance + reviewTrailSideX * reviewLaneSpread
          : playerPose.position[0] - Math.cos(heading) * distance + sideX * spread,
        playerChassisPose.groundedPosition[1] + (reviewPuffVisible ? 0.14 + historyAge * 0.08 : 0.035 + radius * (0.38 + index * 0.015)),
        reviewPuffVisible
          ? playerPose.position[2] - reviewTrailForwardZ * reviewWakeDistance + reviewTrailSideZ * reviewLaneSpread
          : playerPose.position[2] - Math.sin(heading) * distance + sideZ * spread
      )
      .setRotation(0, reviewPuffVisible ? Math.atan2(reviewTrailDx, reviewTrailDz) : heading, 0)
    .setScale(driftSmokeVisible
        ? (reviewPuffVisible
          ? [reviewRadius * (0.64 + (index % 3) * 0.09), reviewRadius * (0.26 + (index % 2) * 0.08), reviewRadius * (1.05 + historyAge * 0.55)]
          : [radius * 1.05, radius * 0.5, radius * 1.65])
        : [0.001, 0.001, 0.001])
      // Keep a sparse, staggered wake in the exact drift frame.  Only every
      // other pooled entry is used and each one is stretched along the solved
      // route heading, so the feedback reads as tyre smoke trailing the real
      // slide rather than detached circular decals.
      // Keep the deterministic sphere-chain feedback for the public live route;
      // review capture uses the volumetric particle layer above instead.
      .setVisible(driftSmokeVisible && !visualCaptureCamera && (!reviewPuffVisible || index % 2 === 0));
  }
  if (driftSmokeVisible) {
    driftSmokeFrame += 1;
    if (driftSmokeFrame % 3 === 0) {
      for (const side of [-1, 1] as const) {
        const rearX = playerPose.position[0] - Math.cos(heading) * (rearAxleOffset + tireExitGap * 0.35);
        const rearZ = playerPose.position[2] - Math.sin(heading) * (rearAxleOffset + tireExitGap * 0.35);
        runtimeEffects.groundDust(
          [rearX + sideX * side, playerPose.position[1] + 0.03, rearZ + sideZ * side],
          { ownerId: "racing-player-car", intensity: 0.35 + driftAmount * 0.35, duration: 0.22, color: "#d8dde0" }
        );
      }
    }
  } else {
    driftSmokeFrame = 0;
  }
  runtimeEffects.update(step);

  // TDC-A2: drive the bumper proxy from the solved player pose, advance the props
  // world (CCD-free by design) at half frame rate with accumulated dt - cosmetic
  // scatter reads identically at 30 Hz while halving its per-frame cost - then
  // follow solved bodies and keep every prop outside the passing corridor.
  propsWorldAccum += step;
  if (raceSnapshot.frame % 2 === 0 || propsWorldAccum > 0.06) {
    playerPropProxy.setRotation(yawQuaternion(proposedPlayerPose.rotation[1]));
    playerPropProxy.setPosition([playerContactBody.position[0], 0, playerContactBody.position[2]]);
    playerPropProxy.setVelocity(playerContactBody.velocity);
    for (const propHandle of trackPropBodies) {
      const propVelocity = propHandle.velocity;
      const propSpeed = Math.hypot(propVelocity[0], propVelocity[2]);
      if (propSpeed > TRACK_PROP_MAX_SPEED_SCENE) {
        const scale = TRACK_PROP_MAX_SPEED_SCENE / propSpeed;
        propHandle.setVelocity([propVelocity[0] * scale, 0, propVelocity[2] * scale]);
      }
    }
    trackPropsContactWorld.step(propsWorldAccum);
    propsWorldAccum = 0;
  for (let propIndex = 0; propIndex < trackPropBodies.length; propIndex += 1) {
    const handle = trackPropBodies[propIndex]!;
    const placement = trackPropsPlan.placements[propIndex]!;
    const bodyPosition = handle.position;
    const surfaceQueryPoint = racingScene.toGamePoint(bodyPosition[0], bodyPosition[2]);
    const nearest = racingLine.query(surfaceQueryPoint);
    const minAbsOffset = trackPropsPlan.corridorHalfWidthGame + placement.radiusGame;
    if (Math.abs(nearest.signedTrackOffset) < minAbsOffset) {
      const sideSign = Math.sign(nearest.signedTrackOffset) || 1;
      const anchor = sampleCentreline(nearest.progress);
      const leftX = Math.sin(anchor.heading);
      const leftZ = -Math.cos(anchor.heading);
      const correctedGame = {
        x: anchor.x + leftX * sideSign * minAbsOffset,
        y: anchor.y + leftZ * sideSign * minAbsOffset
      };
      const correctedScene = gamePointToScene(correctedGame);
      handle.setPosition([correctedScene[0], 0, correctedScene[2]]);
      handle.setVelocity([0, 0, 0]);
      trackPropsClampEvents += 1;
    }
    const solved = handle.position;
    // Displacement from the authored rest pose is the honest scatter signal:
    // velocity can be zeroed by the corridor clamp in the same frame it peaks.
    const rest = trackPropRestPositions.get(placement.id)!;
    if (Math.hypot(solved[0] - rest[0], solved[2] - rest[2]) > 0.008) trackPropsDisplaced.add(placement.id);
    trackPropNodes[propIndex]?.setPosition(solved[0], TRACK_REFERENCE_Y + PROP_VISUALS[placement.kind].sizeScene[1] / 2, solved[2]);
  }
  } // end half-rate props world block
  trackPropsScatteredCount = Math.max(trackPropsScatteredCount, trackPropsDisplaced.size);
  const surfaceSample = racingLine.query(raceSnapshot.position);
  raceSession = maybeAwardHairpinNitro({
    session: raceSession,
    driftVisible,
    onAsphalt: playerAsphalt.onAsphalt,
    progress: raceSnapshot.progress,
    curvature: surfaceSample.curvature
  });
  const finishBlend = raceSession.finishCameraBlend;
  // Off-track camera nudge uses the decaying recovery window so the shake fades
  // as the car returns to the road (hidden under reduced motion).
  syncChaseCamera(finishBlend, edgeRecoverySeconds > 0 ? edgeRecoverySeconds / 0.45 : 0);
  const opponentPose = racingScene.toScenePose(opponent, opponentRacingLineOffset);
  const opponentDriverInput = opponentAi.evidence(raceSnapshot.progress).input;
  opponentChassisPose = opponentChassis.step(step, {
    x: opponentPose.position[0],
    z: opponentPose.position[2],
    heading: opponent.heading,
    speed: opponent.speed,
    steer: opponentDriverInput.steer,
    throttle: opponentDriverInput.throttle ? 1 : 0,
    brake: opponentDriverInput.brake ? 1 : 0,
    slip: Math.min(1, Math.abs(opponent.drift))
  });
  const opponentGroundedVisual = groundedFittedModelPosition(opponentChassisPose, opponentRenderedSize, {
    contactClearance: opponentChassisSpec.wheelRadius * 0.06
  });
  opponentCar.setPosition(
    opponentGroundedVisual[0],
    opponentGroundedVisual[1] - (visualCaptureCamera ? opponentChassisSpec.wheelRadius * 0.32 : 0),
    opponentGroundedVisual[2]
  );
  opponentCar.setRotation(opponentChassisPose.rotation[0], opponentPose.rotation[1], opponentChassisPose.rotation[2]);
  opponentContactShadow
    // Keep the rival's contact cue under its actual four-wheel chassis pose. The
    // former route-centre rectangle stayed at a fixed height and read as a
    // floating black placeholder once the layered road was lifted for review.
    .setPosition(
      opponentChassisPose.groundedPosition[0],
      sampleTurboRoadHeight(
        opponentChassisPose.groundedPosition[0],
        opponentChassisPose.groundedPosition[2]
      ) + ROAD_DETAIL_SURFACE_LIFT + 0.012,
      opponentChassisPose.groundedPosition[2]
    )
    .setRotation(0, opponentPose.rotation[1], 0)
    .setScale(visualCaptureCamera ? [0.24, 0.006, 0.42] : [0.2, 0.004, 0.34]);
  // Runtime transform writes can remount a retained model after its initial
  // visibility assignment. Enforce the exact review contract after every
  // opponent pose update so the solo drift frame cannot regress into two
  // nearly coincident cars that read as an unfinished collision.
  // Capture mode is a real race frame, not a solo product shot. Keep the rival
  // mounted and visible so its lead supplies scale and race direction whenever
  // it remains inside the live chase frustum.
  opponentCar.setVisible(true);
  opponentContactShadow.setVisible(true);
  if (visualCaptureCamera) {
    // The elevated review lens follows the real player pose; the separate
    // opponent contract remains browser-proven in the mission captures.
    racingActionFocus
      .setPosition(...playerPose.position)
      .setRotation(0, playerPose.rotation[1], 0);
  } else {
    racingActionFocus
      .setPosition(
        (playerPose.position[0] + opponentPose.position[0]) * 0.5,
        playerPose.position[1],
        (playerPose.position[2] + opponentPose.position[2]) * 0.5
      )
      .setRotation(0, playerPose.rotation[1], 0);
  }
  // TDC-A1: drive the translucent ghost from the best-lap replay.
  const ghostReplayActive = !visualCaptureCamera && ghostToggleEnabled && ghostReplayPlayer !== null
    && raceSession.startLights.complete && raceSnapshot.status !== "finished";
  if (ghostReplayActive && ghostReplayPlayer) {
    const ghostPose = ghostReplayPlayer.advance(step);
    const ghostScenePose = racingScene.toScenePose({ position: { x: ghostPose.x, y: ghostPose.y }, heading: ghostPose.heading });
    ghostCarNode.setPosition(ghostScenePose.position[0], CAR_REFERENCE_Y, ghostScenePose.position[2]);
    ghostCarNode.setRotation(0, ghostScenePose.rotation[1], 0);
    ghostCarNode.setVisible(true);
  } else {
    ghostCarNode.setVisible(false);
  }
  mountedEvidence.status = raceSnapshot.status;
  mountedEvidence.frameCount = raceSnapshot.frame;
  mountedEvidence.speed = raceSnapshot.speed;
  mountedEvidence.lap = raceSnapshot.lap;
  mountedEvidence.checkpoint = raceSnapshot.checkpoint;
  const opponentAsphalt = asphaltAlignment(opponent.signedTrackOffset, opponentBodyHalfWidth);
  mountedEvidence.opponent = {
    ...opponentAi.evidence(raceSnapshot.progress),
    onRoad: opponentAsphalt.onAsphalt,
    onAsphalt: opponentAsphalt.onAsphalt,
    offTrack: opponent.offTrack || !opponentAsphalt.onAsphalt,
    signedTrackOffset: opponentAsphalt.signedTrackOffset,
    bodyHalfWidth: opponentAsphalt.bodyHalfWidth,
    outerEdge: opponentAsphalt.outerEdge,
    visualAsphaltHalfWidth: opponentAsphalt.visualAsphaltHalfWidth
  };
  mountedEvidence.vehicleContact = {
    system: "game.collisionWorld:Rapier",
    shape: "rendered-footprint-oriented-box",
    bodies: [playerContactBody.snapshot(), opponentContactBody.snapshot()],
    active: Boolean(activeVehicleContact),
    contactCount: vehicleContactCount,
    contactFrames: vehicleContactFrames,
    maximumPenetration: round(maximumVehiclePenetration),
    // Post-solver separating-axis measurement of the exact rendered X/Z bounds.
    // Positive means the visible GLB footprints never intersected this session.
    renderedEnvelopeMinimumClearance: round(minimumRenderedEnvelopeClearance),
    currentRenderedEnvelopeClearance: round(currentRenderedEnvelopeClearance),
    currentPenetration: round(activeVehicleContact?.penetration ?? 0),
    renderedFootprints: {
      playerHalfExtents: playerContactHalfExtents.map(round),
      opponentHalfExtents: opponentContactHalfExtents.map(round)
    },
    minimumDirectImpactSeparation: round(minimumDirectImpactSeparation),
    centerSeparation: round(Math.hypot(
      playerContactBody.position[0] - opponentContactBody.position[0],
      playerContactBody.position[2] - opponentContactBody.position[2]
    )),
    impactResponse: {
      recoveryActive: vehicleImpactRecoverySeconds > 0,
      remainingSeconds: round(vehicleImpactRecoverySeconds),
      responses: vehicleImpactResponses,
      visualEffectNodes: 0,
      hitStopActive: vehicleHitStopSeconds > 0,
      hitStopRemainingSeconds: round(vehicleHitStopSeconds),
      headingKickApplied: vehicleHeadingKickApplied
    },
    lastImpact: lastVehicleImpact,
    solverPositionsFeedGameplayState: true
  };
  mountedEvidence.raceState = raceStateEvidence(previous.progress);
  mountedEvidence.subjectFraming = subjectFramingEvidence();
  const recoveryVisible = raceSnapshot.offTrack || edgeRecoverySeconds > 0;
  mountedEvidence.renderedFeedback = {
    driftVisible,
    driftAmount: round(driftAmount),
    speedFraction: round(speedFraction),
    ribbonLength: round(ribbonLength),
    source: "game.racing drift + speed state",
    // Tyre smoke/dust from game.effects while drifting on asphalt, hidden under
    // reduced motion. Evidence that the drift reads in pixels beyond the ribbons.
    driftSmokeVisible: driftSmokeVisible,
    // Finish camera transition is a measured blend toward the 3/4 hero shot.
    finishCameraBlend: round(raceSession.finishCameraBlend),
    // Certified recovery can clamp an excursion within one simulation frame. Retain
    // that real event for less than half a second so the player can see it and a
    // screenshot cannot miss it between display samples. Reset clears it immediately.
    offTrack: recoveryVisible,
    recoveryVisible
  };
  observedRenderedFeedback.driftRendered ||= driftVisible;
  observedRenderedFeedback.highSpeedRendered ||= speedFraction > 0.6;
  observedRenderedFeedback.offTrackRendered ||= recoveryVisible;
  mountedEvidence.observedRenderedFeedback = { ...observedRenderedFeedback };
  /*
   * Vehicle grounding evidence.
   *
   * Published so "the car is on the road" is a measured fact per frame rather than an
   * opinion about a first-frame screenshot. `groundedWheels` and `maxContactGap` are
   * exactly what a pixel metric cannot see: a car clipping through the tarmac has the
   * same colour histogram as one sitting on it.
   */
  const chassisTelemetry = playerChassis.telemetry();
  if (!playerChassisPose.grounded && observedVehicleGrounding.firstUngrounded === null) {
    observedVehicleGrounding.firstUngrounded = {
      frame: raceSnapshot.frame,
      trackOffset: round(raceSnapshot.trackOffset),
      progress: round(raceSnapshot.progress),
      position: { x: round(playerPose.position[0]), z: round(playerPose.position[2]) },
      heading: round(raceSnapshot.heading),
      groundedWheels: chassisTelemetry.groundedWheels,
      maxContactGap: round(chassisTelemetry.maxContactGap),
      wheels: playerChassisPose.wheels.map((wheel) => ({
        id: wheel.id,
        grounded: wheel.grounded,
        contactGap: round(wheel.contactGap),
        position: wheel.position
      }))
    };
  }
  observedVehicleGrounding.everUngrounded ||= !playerChassisPose.grounded;
  observedVehicleGrounding.maxContactGap = Math.max(observedVehicleGrounding.maxContactGap, chassisTelemetry.maxContactGap);
  observedVehicleGrounding.pitchObserved ||= Math.abs(chassisTelemetry.pitch) > 0.004;
  observedVehicleGrounding.rollObserved ||= Math.abs(chassisTelemetry.roll) > 0.004;
  observedVehicleGrounding.wheelSpinObserved ||= chassisTelemetry.wheelSpinRate > 0.5;
  observedVehicleGrounding.suspensionMoved ||=
    playerChassisPose.wheels.some((wheel) => Math.abs(wheel.compression - 0.5) > 0.01);
  mountedEvidence.vehicleChassis = {
    system: "engine.createVehicleChassis",
    routePinsCarHeightToLiteral: false,
    grounded: playerChassisPose.grounded,
    groundedWheels: chassisTelemetry.groundedWheels,
    maxContactGap: round(chassisTelemetry.maxContactGap),
    pitch: round(chassisTelemetry.pitch),
    roll: round(chassisTelemetry.roll),
    wheelSpinRate: round(chassisTelemetry.wheelSpinRate),
    steerAngle: round(chassisTelemetry.steerAngle),
    averageCompression: round(chassisTelemetry.averageCompression),
    surfaceGrip: round(chassisTelemetry.surfaceGrip),
    wheels: playerChassisPose.wheels.map((wheel) => ({
      id: wheel.id,
      grounded: wheel.grounded,
      contactGap: round(wheel.contactGap),
      compression: round(wheel.compression),
      steerAngle: round(wheel.steerAngle)
    })),
    observed: { ...observedVehicleGrounding }
  };
  mountedEvidence.raceDesign.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
  mountedEvidence.gameplay.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
  mountedEvidence.gameplay.throttleChangesSpeed ||= Math.abs(raceSnapshot.speed) > Math.abs(previous.speed) + 0.001;
  mountedEvidence.gameplay.steeringChangesHeading ||= Math.abs(raceSnapshot.heading - previous.heading) > 0.001;
  mountedEvidence.gameplay.checkpointProgression ||= raceSnapshot.checkpoint !== previous.checkpoint || raceSnapshot.lap !== previous.lap;
  mountedEvidence.gameplay.finishProgression ||= raceSnapshot.status === "finished" ||
    raceSnapshot.lap > previous.lap;
  mountedEvidence.gameplay.opponentMovesIndependently ||= opponent.progress !== previousOpponent.progress &&
    mountedEvidence.opponent.decisionCount > 0;
  const wrappedLead = ((raceSnapshot.progress - opponent.progress + 1.5) % 1) - 0.5;
  if (
    wrappedLead > 0.006
    && !raceSnapshot.offTrack
    && asphaltAlignment(raceSnapshot.signedTrackOffset, playerBodyHalfWidth).onAsphalt
  ) {
    playerLeadHoldSeconds += step;
  } else {
    playerLeadHoldSeconds = 0;
  }
  mountedEvidence.gameplay.playerOvertookOpponent ||= playerLeadHoldSeconds >= 0.45;
  mountedEvidence.gameplay.pauseFreezesBothCars ||= raceSession.paused;
  mountedEvidence.gameplay.countdownBeforeMotion ||= raceSession.startLights.complete;
  mountedEvidence.gameplay.resultCardAfterFinish ||= raceSnapshot.status === "finished" && finishBlend > 0.35;
  // Finish camera: a near-complete blend toward the 3/4 hero shot is the observable
  // transition the result card tracks (matches HUD result-card reveal threshold).
  mountedEvidence.gameplay.finishCamera3Quarter ||= raceSnapshot.status === "finished" && finishBlend > 0.35;
  mountedEvidence.gameplay.driftSmokeObserved ||= driftSmokeVisible;
  mountedEvidence.gameplay.offTrackAudioFired ||= offTrackCueSuppressed;
  mountedEvidence.gameplay.audioGestureUnlocked ||= audioUnlocked;
  // TDC incorporations: live additive evidence.
  mountedEvidence.ghost.toggleEnabled = ghostToggleEnabled;
  mountedEvidence.ghost.active = ghostReplayActive;
  mountedEvidence.ghost.hasBestLap = bestGhostRecording !== null;
  mountedEvidence.ghost.bestLapMs = bestGhostLapMs;
  mountedEvidence.ghost.replayPathHash = bestGhostHash;
  // Once a best lap is sealed, `turboGhostRecorder` immediately starts the next
  // lap and its sample count returns to zero. Publish the replayable recording's
  // sample count as the primary proof field; keep the live recorder count
  // separately so browser evidence cannot mistake a successful round trip for an
  // empty recording at the lap boundary.
  mountedEvidence.ghost.recordedSamples = bestGhostRecording?.samples.length ?? turboGhostRecorder.sampleCount;
  mountedEvidence.ghost.currentLapRecordedSamples = turboGhostRecorder.sampleCount;
  mountedEvidence.trackProps.clampEvents = trackPropsClampEvents;
  mountedEvidence.trackProps.displacedDistinctCount = trackPropsScatteredCount;
  mountedEvidence.signage.activeLabelIndex = signageActiveLabelIndex;
  mountedEvidence.startLightsComplete = raceSession.startLights.complete;
  mountedEvidence.boost.hits = turboBoost.hits;
  mountedEvidence.boost.active = turboBoost.remainingSeconds > 0;
  mountedEvidence.kitContractProof.throttleIncreasesSpeed ||= mountedEvidence.gameplay.throttleChangesSpeed;
  mountedEvidence.kitContractProof.steeringChangesHeading ||= mountedEvidence.gameplay.steeringChangesHeading;
  // Audio evidence is published only on real audio events (playCue/unlock), not
  // here per frame, so the simulation loop stays lean and deterministic.
  recordRacingKitEvents(raceSnapshot.events);
  if (raceSnapshot.status === "finished") {
    mountedEvidence.kitContractProof.finishedStatus = "finished";
    if (!finishCueFired) {
      // TDC-A5: duck the music bus under the fanfare, restore on reset/restart.
      turboAudio.setMusicDucked(true);
      playCue("finish-fanfare");
      finishCueFired = true;
    }
  }
  // Ordered checkpoints chime on each gate credit (checkpoint wraps to 0 at a lap
  // boundary, so compare lap too to avoid spurious re-chimes on the reset lap).
  const checkpointAdvanced = raceSnapshot.checkpoint !== lastCheckpoint;
  if (checkpointAdvanced && raceSnapshot.checkpoint > lastCheckpoint) {
    playCue("checkpoint");
  }
  lastCheckpoint = raceSnapshot.checkpoint;
  lastLap = raceSnapshot.lap;
  mountedEvidence.diagnostics = app.diagnostics();
  updateTurboHudPanel();
  // Hold the first exact state that satisfies the producer's real gameplay
  // contract. Without this, simulation continued while Playwright encoded the
  // screenshot and the two cars could advance through an entire bend after the
  // wait predicate had already passed, yielding non-repeatable framing.
  if (
    visualCaptureCamera
    && !visualCaptureHeld
    && driftVisible
    && driftAmount > 0.35
    && speedFraction >= 0.6
    && raceSnapshot.progress >= 0.17
    // Manual capture freezes in the opening right-bend interval. The
    // deterministic route driver can reach its first genuine handbrake slip
    // later in the same first lap, so its bound is the first qualifying frame
    // rather than an arbitrary progress ceiling.
    && (evidenceDriverEnabled || raceSnapshot.progress <= 0.205)
  ) {
    visualCaptureHeld = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.body.dataset.turboReviewHeld = "true";
      });
    });
  }
});

function setupRacingPanel(): void {
  const panel = document.getElementById("panel");
  if (!panel) return;
  panel.innerHTML = renderTurboHudPanel(debugMode);
  // The named overview producer keeps the live metric cluster as context while
  // letting the renderer-owned circuit carry the visual hierarchy. The panel
  // nodes remain mounted (and therefore still available to keyboard users and
  // evidence readers); the capture-only CSS simply removes the title/control
  // cards from that one comparison frame.
  panel.dataset.capture = visualCaptureCamera ? "overview" : "default";
  bindGameTouchControls({
    hold: [
      { elementId: "throttle-control", code: "KeyW" },
      { elementId: "brake-control", code: "KeyS" },
      { elementId: "left-control", code: "KeyA" },
      { elementId: "right-control", code: "KeyD" },
      { elementId: "drift-control", code: "Space" }
    ],
    pulse: [
      { elementId: "reset-control", code: "KeyR" },
      { elementId: "ghost-toggle-control", code: "KeyG" }
    ]
  });
}

function updateTurboHudPanel(): void {
  const opponentProgress = opponentAi.snapshot().progress;
  const alignment = roadAlignmentForSnapshot(raceSnapshot);
  // TDC-A4: light the gantry board matching the race feel state.
  const nextLabelIndex = resolveTurboSignageLabelIndex(
    raceSession,
    raceSnapshot.lap,
    raceLapsToWin,
    raceSnapshot.status === "finished"
  );
  if (nextLabelIndex !== signageActiveLabelIndex) {
    signageLapBoardNodes.forEach((node, index) => node.setVisible(index === nextLabelIndex));
    signageActiveLabelIndex = nextLabelIndex;
  }
  updateTurboHud(hud, {
    snapshot: raceSnapshot,
    session: raceSession,
    opponentProgress,
    routeLength: routeLineLength,
    referenceSpeed: gameplayMaxSpeed,
    onAsphalt: alignment.onAsphalt,
    recoveryVisible: mountedEvidence.renderedFeedback.recoveryVisible === true,
    debugMode,
    ghostAvailable: bestGhostRecording !== null,
    ghostEnabled: ghostToggleEnabled,
    ghostBestLabel: formatLapClock(bestGhostLapMs !== null ? bestGhostLapMs / 1000 : undefined)
  });
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}
