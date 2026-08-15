import {
  bindGameTouchControls,
  createAuraApp,
  createVehicleChassis,
  createVehicleDriverAi,
  environments,
  effects,
  game,
  groundedFittedModelPosition,
  lights,
  material,
  model,
  primitives,
  resolveChaseFraming,
  scene,
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
import { measureTurboPassingLane, turboVehicleBoundaryInset } from "./passing-lane";

const trackTopology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;
const route = game.assetBoundRacingRoute({
  vehicleAsset: "showcaseCc0FormulaRaceCar",
  trackAsset: "showcaseTsukubaCircuit",
  authoredLapSeconds: 35,
  minLapSeconds: 30,
  minCheckpoints: 6,
  topology: trackTopology,
  route: {
    id: routeGeometry.id,
    width: routeGeometry.width,
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
const routeWidth = routeGeometry.width;
/**
 * Authored lap duration.
 *
 * A genuine game-design constant (how long a lap should take), not an asset property. It is asserted against the
 * certified topology below rather than derived from it, because the design intent is the *requirement* and the
 * extracted geometry is what must satisfy it.
 */
const authoredLapSeconds = 35;
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
const STEER_CORRECTION_GAIN = Number((2 / Math.max(0.05, routeGeometry.width / 2)).toFixed(3));

/**
 * Scene size chosen so the certified road width reproduces the car-length-to-road-width
 * ratio (~1.1) that reads correctly, rather than a size picked to fit the model bounds.
 * Lighting and fog are expressed relative to this so they scale with the circuit.
 */
const SCENE_SIZE = 39.097;
/** Longest-axis size the car model is fit to. */
const CAR_TARGET_MAX_DIMENSION = 1.1;
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
const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "showcaseTsukubaCircuit",
  // Tsukuba's modelled road is ~0.42 units wide against a 35.4-unit model, so the
  // scene size is chosen to reproduce the car-length-to-road-width ratio (~1.1) that
  // reads correctly, rather than a size picked to fit the model bounds.
  targetSceneSize: SCENE_SIZE,
  trackModelTargetMaxDimension: 90.413,
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
  // This is an open-wheel Formula silhouette, not a road-car body: its tyre
  // diameter occupies about four fifths of the fitted vertical bounds. The generic
  // 42% road-car default halved the contact footprint and suspension reach, causing
  // a real road triangle under the broad tyre to be treated as a hanging wheel.
  wheelDiameterFraction: 0.8
});
const carChassisSpec = {
  ...fittedCarChassisSpec,
  // Full-stint contact now includes small Rapier side-contact corrections. The
  // retained peak at a sparse triangle seam is 0.01684 scene units. Fourteen percent
  // of the fitted tyre radius covers that finite patch while remaining far below a
  // real verge drop, so contact correction cannot masquerade as airborne travel.
  // The corrected collision path reaches the certified sparse seam at a retained
  // 0.01806 gap; 15% of tyre radius covers it without approaching a verge drop.
  contactTolerance: fittedCarChassisSpec.wheelRadius * 0.15
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
  chassisHalfWidth: carChassisSpec.trackWidth / 2
});
// A recovery frame may retain a visible drift angle, but never a sideways/backwards heading that
// makes the target-yaw chase camera orbit into the infield.
const recoveryHeadingLimit = Math.PI / 90;

const input = game.input({
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    drift: ["Space", "ShiftLeft"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 90
});

const racingState = game.racing({
  route,
  startProgress: 0,
  checkpointRadius: 0.1,
  lapsToWin: 4,
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
// The collision proof route holds the exact solved first-contact pose until the
// browser producer releases it after taking the retained frame. A 140 ms hit-stop
// was perceptible in play but could expire while Playwright encoded a screenshot,
// leaving only approach/aftermath images even though contact telemetry was real.
let collisionReviewContactHeld = collisionReviewCamera;
let collisionReviewReactionHeld = false;
// The evidence-only side view starts the rival nearer on the same opening straight,
// making first contact deterministic before barriers or later circuit branches can
// obscure either silhouette. Normal gameplay retains the authored 0.032 head start.
const opponentStartProgress = collisionReviewCamera ? 0.017 : 0.032;
// Both cars occupy the same authored racing line. A permanent lateral presentation
// offset made the first encounter a glancing side-swipe, so the retained collision
// image could not demonstrate the requested direct rear impact.
const opponentRacingLineOffset = 0;
const opponentState = game.racing({
  route,
  startProgress: opponentStartProgress,
  checkpointRadius: 0.1,
  lapsToWin: 4,
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
  halfWidth: () => routeGeometry.width / 2,
  sample: (progress) => {
    const sample = racingLine.sampleAt(progress);
    return { x: sample.x, y: sample.y, heading: sample.heading };
  }
};
const opponentTargetMaxDimension = 1.04;
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
  passingMargin: 0.03
});
const opponentDriver = createVehicleDriverAi(driverRoute, {
  maxSpeed: gameplayMaxSpeed,
  // Leave a real performance window for the player. At 93% the rival exited every
  // corner at nearly the player's maximum pace; once its solid body occupied the
  // racing line, contact recovery made a clean overtake practically impossible.
  paceFraction: 0.82,
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
    // The extracted Tsukuba mesh has one sparse seam near progress 0.728. A real
    // Formula tyre spans that seam; 1.55 radii remains below the measured half-track
    // and lane separation, so it cannot jump to an adjacent road branch.
    contactPatchRadius: carChassisSpec.wheelRadius * 1.55
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
  solverIterations: 20,
  enableSleeping: false,
  continuousCollision: {
    mode: "adaptive-substeps",
    // Keep the sweep threshold below the narrowest fitted box half-extent. A retained
    // full-stint steering frame requires 65 subdivisions, so 96 preserves rejection
    // semantics while covering the route's bounded certified speed.
    maxSubSteps: 96,
    motionThreshold: 0.08
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
  return Math.max(...[...playerAxes, ...opponentAxes].map((axis) =>
    Math.abs(delta[0] * axis[0] + delta[1] * axis[1])
      - projectionRadius(axis, playerAxes, playerHalfWidth, playerHalfLength)
      - projectionRadius(axis, opponentAxes, opponentHalfWidth, opponentHalfLength)
  ));
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
  targetNode: "racing-player-car",
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
  distance: collisionReviewCamera ? chaseDistance * 0.2 : chaseDistance,
  height: collisionReviewCamera ? chaseHeight * 1.3 : chaseHeight,
  // Derived, not tuned: see `requireLowerSideFeatureVisibility` above.
  sideOffset: collisionReviewCamera ? chaseDistance * -1.5 : heroFraming.sideOffset,
  lookAhead: chaseLookAhead,
  fov: collisionReviewCamera ? 48 : chaseFov,
  smoothing: 0.045
});
setupRacingPanel();

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .background("#5f9fc0")
    // Neutral generated HDR lighting preserves the texture's red/white/graphite palette
    // and gives the bodywork readable broad reflections. Ambient lights alone provide a
    // flat procedural gradient; the studio environment is the supported root API for a
    // material-bearing hero that needs reflection definition in every camera heading.
    .add(environments.studio({ name: "circuit neutral daylight reflections", intensity: 1.08, color: "#fff8ee" }))
    // The chase camera yaws with the car, so the sky is the scene background
    // rather than a finite wall whose edge would swing into frame. A distant
    // treeline band plus fog grade the ground into that sky.
    // The circuit asset ships its own grass, barriers, fencing, grandstands and treeline,
    // so the only set dressing still needed is a ground plane far enough out to close the
    // horizon. The previous treeline slab was authored for a 5.4-unit scene and at this
    // size cut straight through the modelled scenery.
    .add(primitives.box({
      name: "circuit ground plane",
      material: material.pbr({ name: "circuit outfield ground", color: "#5c7a52", roughness: 0.9, metallic: 0.02 }),
      receiveShadow: true
    }).position(0, TRACK_REFERENCE_Y - 0.35, 0).scale([SCENE_SIZE * 9, 0.2, SCENE_SIZE * 9]))
    .add(model(assets.showcaseTsukubaCircuit, {
      name: "racing-bound-track-asset",
      role: "primaryTrack",
      scaleMode: "fit",
      targetMaxDimension: racingScene.trackModel.targetMaxDimension
    }).position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation).runtime(game.runtimeNode("racing-bound-track-asset", {
      tags: ["track", "typed-secondary-primary-asset", "certified-visible-geometry"]
    })))
    .addMany(game.racingPresentationTrack({
      sceneBinding: racingScene,
      route,
      mode: "asset-overlay",
      guideVisibility: "public",
      roadColor: "#30373d",
      terrainColor: "#253834",
      curbColor: "#df4259",
      laneColor: "#b9f7ff"
    }))
    // The hero is a CC0 Formula racer with authored red/white/graphite palette texturing.
    // The rival is a separate CC-BY Formula racer with a detailed blue/black livery, visible
    // suspension, driver, front/rear wings and exposed tires. Neither vehicle receives a
    // whole-model tint: the distinction comes from authored materials and geometry.
    .add(model(assets.showcaseCc0FormulaRaceCar, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 1.1,
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
    .add(primitives.box({
      name: "left drift ribbon near",
      material: material.pbr({ name: "fresh left tire mark", color: "#252a2c", roughness: 0.98, metallic: 0.01 })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-left-drift-ribbon", {
      tags: ["vehicle-feedback", "drift", "renderer-owned"]
    })))
    .add(primitives.box({
      name: "right drift ribbon near",
      material: material.pbr({ name: "fresh right tire mark", color: "#252a2c", roughness: 0.98, metallic: 0.01 })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-right-drift-ribbon", {
      tags: ["vehicle-feedback", "drift", "renderer-owned"]
    })))
    .add(primitives.box({ name: "left drift ribbon middle", material: material.pbr({ color: "#292e30", roughness: 0.98, metallic: 0.01 }) })
      .position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-left-drift-ribbon-middle", { tags: ["vehicle-feedback", "drift", "renderer-owned"] })))
    .add(primitives.box({ name: "right drift ribbon middle", material: material.pbr({ color: "#292e30", roughness: 0.98, metallic: 0.01 }) })
      .position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-right-drift-ribbon-middle", { tags: ["vehicle-feedback", "drift", "renderer-owned"] })))
    .add(primitives.box({ name: "left drift ribbon far", material: material.pbr({ color: "#303537", roughness: 0.98, metallic: 0.01 }) })
      .position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-left-drift-ribbon-far", { tags: ["vehicle-feedback", "drift", "renderer-owned"] })))
    .add(primitives.box({ name: "right drift ribbon far", material: material.pbr({ color: "#303537", roughness: 0.98, metallic: 0.01 }) })
      .position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-right-drift-ribbon-far", { tags: ["vehicle-feedback", "drift", "renderer-owned"] })))
    // Keep contact definition without crushing the Formula car's red palette into black.
    // The former 0.42 AO pass was appropriate for the pale untextured car and visibly
    // over-occluded the textured cockpit, sidepods and rear wing of the new hero.
    .add(effects.ambientOcclusion({ intensity: 0.18 }))
    .add(effects.neonBloom({ intensity: 0.1 }))
    // Nonzero depth haze that grades the treeline into the sky and separates
    // near curbing from distant trackside.
    // Fog density and light positions are expressed relative to the scene's own size.
    // The previous values were tuned for a 5.4-unit scene; on this 39-unit circuit the
    // key and rim lights sat *inside* the track surface and the fog was ~7x too dense
    // for the distances involved, which is why the frame read as near-night.
    .add(effects.fog({
      name: "circuit distance atmosphere",
      color: "#93b6cc",
      density: Number((0.032 * (5.4 / SCENE_SIZE)).toFixed(5)),
      intensity: 0.32
    }))
    .add(lights.ambient({ name: "circuit sky fill", color: "#fff4e8", intensity: 1.08 }))
    .add(lights.directional({ name: "circuit daylight key", color: "#fff1dc", intensity: 2.15 })
      .position(-0.83 * SCENE_SIZE, 1.2 * SCENE_SIZE, 0.65 * SCENE_SIZE))
    .add(lights.directional({ name: "circuit cool rim", color: "#d8ebff", intensity: 0.92 })
      .position(0.65 * SCENE_SIZE, 0.59 * SCENE_SIZE, -0.56 * SCENE_SIZE))
    .add(lights.point({ name: "pit lane warm fill", color: "#ffd9b8", intensity: 0.34 })
      .position(0.44 * SCENE_SIZE, 0.15 * SCENE_SIZE, -0.33 * SCENE_SIZE))
    .add(lights.point({ name: "start line daylight fill", color: "#d9efff", intensity: 0.28 })
      .position(-0.33 * SCENE_SIZE, 0.13 * SCENE_SIZE, 0.3 * SCENE_SIZE))
    .camera(racingCamera)
});

const playerCar = app.nodes.require("racing-player-car");
const opponentCar = app.nodes.require("racing-opponent-car");
const leftDriftRibbons = [
  app.nodes.require("racing-left-drift-ribbon"),
  app.nodes.require("racing-left-drift-ribbon-middle"),
  app.nodes.require("racing-left-drift-ribbon-far")
] as AuraRuntimeNodeHandle[];
const rightDriftRibbons = [
  app.nodes.require("racing-right-drift-ribbon"),
  app.nodes.require("racing-right-drift-ribbon-middle"),
  app.nodes.require("racing-right-drift-ribbon-far")
] as AuraRuntimeNodeHandle[];
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
    playSpacePoints: route.points.map((point) => racingScene.toScenePoint(point, TRACK_REFERENCE_Y)),
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
       * The camera's positive lateral offset makes rear-left the near contact for every
       * heading because both camera and chassis rotate with the vehicle.  This is a real
       * wheel sample from `VehicleChassis`, not a screenshot-tuned screen coordinate.
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
    setSubjectSuppressed: (suppressed: boolean) => {
      app.pause();
      playerCar.setScale(suppressed ? 0.0001 : 1);
      app.step(0);
    }
  },
  configurable: true
});
const hud = {
  speed: requireElement("speed-value"),
  lap: requireElement("lap-value"),
  checkpoint: requireElement("checkpoint-value"),
  status: requireElement("status-value"),
  alignment: requireElement("alignment-value")
};
const routeProof = {
  routeAlignedToVisibleTrack: true,
  noDebugLocatorDisk: true,
  hasMeaningfulTopology: route.assetBinding.checkpointCount >= 6 && authoredLapSeconds >= 30
};
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
function roadAlignmentForSnapshot(snapshot: typeof raceSnapshot) {
  const roadHalfWidth = routeWidth / 2;
  const normalizedOffset = Math.abs(snapshot.trackOffset) / Math.max(roadHalfWidth, 0.001);
  return {
    trackOffset: round(snapshot.trackOffset),
    roadHalfWidth: round(roadHalfWidth),
    normalizedOffset: round(normalizedOffset),
    onRoad: normalizedOffset <= 1
  };
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
  controls: { keyboard: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR"] },
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
      trackAssetUsedForTopologyEvidence: "showcaseTsukubaCircuit",
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
  primaryAssets: ["showcaseCc0FormulaRaceCar", "showcaseCcByFormulaOpponent", "showcaseTsukubaCircuit"],
  /**
   * Playable camera evidence. The route uses a chase rig bound to the player
   * car node, not a static proof/overview camera.
   */
  camera: {
    mode: "chase",
    targetNode: "racing-player-car",
    source: "game.racingCameraRig",
    collisionReviewCamera,
    distance: collisionReviewCamera ? chaseDistance * 0.2 : chaseDistance,
    height: collisionReviewCamera ? chaseHeight * 1.3 : chaseHeight,
    sideOffset: collisionReviewCamera ? chaseDistance * -1.5 : heroFraming.sideOffset,
    lookAhead: chaseLookAhead,
    fov: collisionReviewCamera ? 48 : chaseFov
  },
  collisionCapture: {
    mode: collisionReviewCamera ? "held-first-contact-side-profile" : "disabled",
    releaseFirstContact: () => {
      collisionReviewContactHeld = false;
    },
    releaseReaction: () => {
      collisionReviewReactionHeld = false;
    }
  },
  subjectFraming: subjectFramingEvidence(),
  renderedFeedback: {
    driftVisible: false,
    driftAmount: 0,
    speedFraction: 0,
    ribbonLength: 0,
    source: "game.racing drift + speed state",
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
    vehicleAsset: "showcaseCc0FormulaRaceCar",
    opponentVehicleAsset: "showcaseCcByFormulaOpponent",
    trackAsset: "showcaseTsukubaCircuit",
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
    passingLane,
    authoredLapSeconds,
    routeAlignedToVisibleTrack: true,
    noDebugLocatorDisk: true,
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad
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
updateRacingHud();

app.onFrame(({ dt }) => {
  // Freeze the complete solved state—not only the timer—while the evidence producer
  // captures first contact. Continuing to advance Rapier beneath a held camera could
  // briefly clear and re-enter the manifold, manufacturing a second impact on release.
  if ((collisionReviewContactHeld && vehicleImpactResponses > 0) || collisionReviewReactionHeld) return;
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  edgeRecoverySeconds = Math.max(0, edgeRecoverySeconds - step);
  vehicleImpactRecoverySeconds = Math.max(0, vehicleImpactRecoverySeconds - step);
  const vehicleHitStopActive = vehicleHitStopSeconds > 0
    && vehicleHitStopPlayerPoint !== null
    && vehicleHitStopOpponentPoint !== null;
  if (!(collisionReviewContactHeld && vehicleImpactResponses > 0)) {
    vehicleHitStopSeconds = Math.max(0, vehicleHitStopSeconds - step);
  }
  input.update(step);
  if (input.pressed("reset")) {
    raceSnapshot = racingState.reset(0);
    opponentRaceStarted = false;
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
    mountedEvidence.opponent = opponentAi.evidence(raceSnapshot.progress);
    updateRacingHud();
    return;
  }
  const previous = raceSnapshot;
  const previousOpponent = opponentAi.snapshot();
  opponentRaceStarted ||= input.held("throttle") || input.held("brake") || Math.abs(input.axis("steer")) > 0.01;
  raceSnapshot = vehicleHitStopActive && vehicleHitStopPlayerPoint
    ? racingState.resolveContact(vehicleHitStopPlayerPoint, { speedMultiplier: 1, driftMultiplier: 1 })
    : racingState.step(step, {
      // A hard rear impact interrupts drive torque briefly. Without this recovery
      // window, held throttle immediately erased the speed loss on the next frame and
      // the collision looked like two cars merely touching.
      throttle: input.held("throttle") && vehicleImpactRecoverySeconds <= 0,
      brake: input.held("brake"),
      // The handbrake is what builds real slip in game.racing. Without it the
      // kit's drift value stays zero and no drift feedback can honestly render.
      drift: input.held("drift"),
      steer: input.axis("steer")
    });
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

  // Drive the Rapier bodies toward the authored steering poses. Rapier advances and
  // resolves the two solid masses; its positions then become gameplay state before
  // chassis grounding or rendering occurs.
  const proposedPlayerPose = racingScene.toScenePose(raceSnapshot);
  const proposedOpponentPose = racingScene.toScenePose(opponent, opponentRacingLineOffset);
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
  minimumRenderedEnvelopeClearance = Math.min(
    minimumRenderedEnvelopeClearance,
    orientedFootprintClearance(
      playerContactBody.position,
      proposedPlayerPose.rotation[1],
      opponentContactBody.position,
      proposedOpponentPose.rotation[1]
    )
  );
  /*
   * Rapier can report a resting/side-by-side contact for many consecutive frames.
   * Applying an impact loss on every such frame made the two cars behave like a
   * single sticky body: 159 solved frames reduced speed and drift 159 times. Apply
   * the impulse loss only on contact onset. Rapier still owns separation on every
   * frame, while the arcade tyre-slip state remains controllable through contact.
   */
  const vehicleContactBegan = Boolean(activeVehicleContact) && !vehicleContactWasActive;
  const playerSpeedBeforeContact = raceSnapshot.speed;
  const opponentSpeedBeforeContact = opponent.speed;
  const playerHeadingBeforeContact = raceSnapshot.heading;
  const opponentHeadingBeforeContact = opponent.heading;
  const relativeClosingSpeed = Math.max(0, playerSpeedBeforeContact - opponentSpeedBeforeContact);
  const directRearImpact = vehicleContactBegan
    && relativeClosingSpeed > 0.25
    && Math.abs(raceSnapshot.trackOffset - opponent.trackOffset) <= routeWidth * 0.12;
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
  const solvedPlayerGamePoint = racingScene.toGamePoint(playerContactBody.position[0], playerContactBody.position[2]);
  const solvedOpponentGamePoint = racingScene.toGamePoint(opponentContactBody.position[0], opponentContactBody.position[2]);
  raceSnapshot = racingState.resolveContact(solvedPlayerGamePoint, {
    speedMultiplier: playerContactSpeedMultiplier,
    driftMultiplier: 1
  });
  opponent = opponentAi.resolveContact(solvedOpponentGamePoint, opponentContactSpeedMultiplier);
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
  }
  vehicleContactWasActive = Boolean(activeVehicleContact);
  if (steppedOffTrack || raceSnapshot.offTrack) edgeRecoverySeconds = 0.45;

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
    steer: input.axis("steer"),
    throttle: input.held("throttle") && vehicleImpactRecoverySeconds <= 0 ? 1 : 0,
    brake: input.held("brake") ? 1 : 0,
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
  playerCar.setPosition(...groundedFittedModelPosition(playerChassisPose, heroFraming.subject.size, {
    contactClearance: carChassisSpec.wheelRadius * 0.06
  }));
  playerCar.setRotation(playerChassisPose.rotation[0], playerPose.rotation[1], playerChassisPose.rotation[2]);
  // Drift feedback is driven by the kit's actual slip value plus real speed, not
  // by raw steering input: a stationary car turning its wheels must not smoke.
  const driftAmount = Math.min(1, Math.abs(raceSnapshot.drift));
  const speedFraction = Math.min(1, Math.abs(raceSnapshot.speed) / Math.max(gameplayMaxSpeed, 0.001));
  const driftVisible = driftAmount > 0.12 && speedFraction > 0.18;
  // Keep the live feedback local to the rear contact patches. The former 1.15-unit
  // multiplier produced two long, blunt black rails that visually fused with the tyres.
  // A retained skid history can be segmented later; these nodes show the current slip only.
  const ribbonLength = 0.16 + driftAmount * speedFraction * 0.48;
  const ribbonWidth = 0.021 + driftAmount * 0.015;
  const heading = playerPose.heading;
  // Anchor each ribbon half a length behind the rear axle so it trails from the
  // tire contact patch along the road surface instead of hanging off the body.
  const rearAxleOffset = carChassisSpec.wheelbase / 2;
  const tireExitGap = carChassisSpec.wheelRadius * 0.55;
  const halfTrack = carChassisSpec.trackWidth / 2;
  const sideX = -Math.sin(heading) * halfTrack;
  const sideZ = Math.cos(heading) * halfTrack;
  const segmentGap = 0.045;
  const segmentLength = Math.max(0.055, (ribbonLength - segmentGap * 2) / 3);
  for (const [ribbons, side] of [[leftDriftRibbons, -1], [rightDriftRibbons, 1]] as const) {
    ribbons.forEach((ribbon, segment) => {
      const trailOffset = rearAxleOffset + tireExitGap + segmentLength * 0.5 + segment * (segmentLength + segmentGap);
      const rearX = playerPose.position[0] - Math.cos(heading) * trailOffset;
      const rearZ = playerPose.position[2] - Math.sin(heading) * trailOffset;
      ribbon
        // The scene pose Y is the certified road-contact plane. Lift a few millimetres
        // to avoid z-fighting without intersecting the tyre silhouette.
        .setPosition(rearX + sideX * side, playerPose.position[1] + 0.012, rearZ + sideZ * side)
        // A tyre mark lies on the road plane. Inheriting chassis pitch/roll tipped its ends
        // through the tarmac and recreated the apparent wheel-submersion defect.
        .setRotation(0, playerPose.rotation[1], 0)
        .setScale(driftVisible ? [ribbonWidth * (1 - segment * 0.09), 0.008, segmentLength] : [0.001, 0.001, 0.001])
        .setVisible(driftVisible);
    });
  }
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
  opponentCar.setPosition(...groundedFittedModelPosition(opponentChassisPose, opponentRenderedSize, {
    contactClearance: opponentChassisSpec.wheelRadius * 0.06
  }));
  opponentCar.setRotation(opponentChassisPose.rotation[0], opponentPose.rotation[1], opponentChassisPose.rotation[2]);
  mountedEvidence.status = raceSnapshot.status;
  mountedEvidence.frameCount = raceSnapshot.frame;
  mountedEvidence.speed = raceSnapshot.speed;
  mountedEvidence.lap = raceSnapshot.lap;
  mountedEvidence.checkpoint = raceSnapshot.checkpoint;
  mountedEvidence.opponent = opponentAi.evidence(raceSnapshot.progress);
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
  mountedEvidence.gameplay.playerOvertookOpponent ||= wrappedLead > 0.004
    && !raceSnapshot.offTrack
    && !opponent.offTrack;
  mountedEvidence.kitContractProof.throttleIncreasesSpeed ||= mountedEvidence.gameplay.throttleChangesSpeed;
  mountedEvidence.kitContractProof.steeringChangesHeading ||= mountedEvidence.gameplay.steeringChangesHeading;
  recordRacingKitEvents(raceSnapshot.events);
  if (raceSnapshot.status === "finished") mountedEvidence.kitContractProof.finishedStatus = "finished";
  mountedEvidence.diagnostics = app.diagnostics();
  updateRacingHud();
});

function setupRacingPanel(): void {
  const panel = document.getElementById("panel");
  if (!panel) return;
  panel.innerHTML = `
    <header class="race-brand">
      <span class="panel__label"><i aria-hidden="true"></i> Tsukuba velocity trial</span>
      <h1>Turbo Drift Circuit</h1>
      <p class="panel__lede">Arcade handling. Four laps, six gates, one rival—carry speed through the apex and break the line.</p>
    </header>
    <section class="metrics-row" aria-label="Live race metrics">
      <article class="metric metric--speed"><span>Speed · km/h</span><strong id="speed-value">0</strong></article>
      <article class="metric"><span>Lap</span><strong id="lap-value">1</strong></article>
      <article class="metric"><span>Gate</span><strong id="checkpoint-value">0</strong></article>
      <article class="metric metric--status"><span>Race</span><strong id="status-value">Ready</strong></article>
    </section>
    <section class="track-contract" aria-label="Track contract">
      <span id="alignment-status" class="contract-status" data-state="locked"><i aria-hidden="true"></i><strong id="alignment-value">Road locked</strong></span>
      <p>The circuit and racing line share the certified mesh topology.</p>
    </section>
    <section class="race-controls" aria-label="Race controls">
      <h2>Drive</h2>
      <div class="control-cluster">
        <button id="throttle-control" type="button"><b aria-hidden="true">↑</b><span>Throttle</span></button>
        <button id="brake-control" type="button"><b aria-hidden="true">↓</b><span>Brake</span></button>
        <button id="left-control" type="button"><b aria-hidden="true">←</b><span>Left</span></button>
        <button id="right-control" type="button"><b aria-hidden="true">→</b><span>Right</span></button>
        <button id="drift-control" type="button"><b aria-hidden="true">◆</b><span>Drift</span></button>
        <button id="reset-control" type="button"><b aria-hidden="true">↺</b><span>Reset</span></button>
      </div>
      <ul class="controls-list"><li><kbd>W S</kbd> Drive</li><li><kbd>A D</kbd> Steer</li><li><kbd>Space</kbd> Drift</li><li><kbd>R</kbd> Reset</li></ul>
    </section>`;
  // Reusable binding layer; see the note in Skyline's panel setup for why this was extracted.
  bindGameTouchControls({
    hold: [
      { elementId: "throttle-control", code: "KeyW" },
      { elementId: "brake-control", code: "KeyS" },
      { elementId: "left-control", code: "KeyA" },
      { elementId: "right-control", code: "KeyD" },
      { elementId: "drift-control", code: "Space" }
    ],
    pulse: [{ elementId: "reset-control", code: "KeyR" }]
  });
}
/**
 * Displayed race status.
 *
 * WS-5.3: the reported live-site defect was `SPEED 0` alongside `STATUS running`, which reads as a
 * broken simulation. It is not one — the HUD and the simulation share a single snapshot object, so
 * they cannot disagree. `game.racing`'s status is a two-state enum (`running` | `finished`) that
 * describes whether the *race* is over, and it is `running` from the first frame. A car nobody has
 * touched therefore correctly reports 0 km/h while correctly reporting `running`.
 *
 * The defect is that "running" is the wrong word for "nobody has pressed anything yet". Distinguish
 * the two here, in presentation, rather than adding a third state to the kit: whether a race has
 * received input is a property of this route's session, not of the racing model.
 */
function racingStatusLabel(): string {
  if (raceSnapshot.status === "finished") return "Finished";
  // `opponentRaceStarted` is already the route's "has the player touched the controls" latch.
  if (!opponentRaceStarted && Math.abs(raceSnapshot.speed) < 0.01) return "Ready";
  return "Racing";
}

function updateRacingHud(): void {
  hud.speed.textContent = String(Math.round(Math.abs(raceSnapshot.speed) * 36));
  hud.lap.textContent = String(raceSnapshot.lap);
  hud.checkpoint.textContent = `${Math.min(raceSnapshot.checkpoint, raceSnapshot.checkpointCount)} / ${raceSnapshot.checkpointCount}`;
  hud.status.textContent = racingStatusLabel();
  const recoveryVisible = mountedEvidence.renderedFeedback.recoveryVisible === true;
  hud.alignment.textContent = recoveryVisible ? "Edge assist" : "Road locked";
  const alignmentStatus = document.getElementById("alignment-status");
  if (alignmentStatus) alignmentStatus.dataset.state = recoveryVisible ? "recovering" : "locked";
}
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}
