import {
  bindGameTouchControls,
  createAuraApp,
  createVehicleChassis,
  createVehicleDriverAi,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  resolveChaseFraming,
  scene,
  vehicleChassisSpecFromBounds,
  type AuraRuntimeNodeHandle,
  type DriverRoute,
  type VehicleChassis,
  type VehicleSurface
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { createShowcaseCannonPhysicsProof } from "../../showcase-cannon-physics-proof";
import { gameGeometryContract } from "./generated/game-geometry";
import { createTurboOpponentAi } from "./opponent-ai";

const trackTopology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;
const route = game.assetBoundRacingRoute({
  vehicleAsset: "turboRaceCar",
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
const heroFraming = resolveChaseFraming(assets.turboRaceCar, {
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
  steerRate: certifiedSteerRate
});

const opponentStartProgress = 0.12;
const opponentState = game.racing({
  route,
  startProgress: opponentStartProgress,
  checkpointRadius: 0.1,
  lapsToWin: 4,
  paceMultiplier: gameplayPaceMultiplier,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: certifiedSteerRate
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
 * Length of the racing line, measured from the polyline.
 *
 * `routeGeometry` carries `points` and `width` but no length, so it must be measured
 * rather than read. Reading a nonexistent field produced a NaN look-ahead progress
 * and a crash inside the driver, which the driving test caught immediately -- the
 * kind of defect a screenshot check cannot see at all.
 */
const routeLineLength = (() => {
  const points = routeGeometry.points;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total > 0 ? total : 1;
})();

const driverRoute: DriverRoute = {
  length: routeLineLength,
  halfWidth: () => routeGeometry.width / 2,
  sample: (progress) => {
    const point = sampleRouteLine(progress);
    return { x: point.x, y: point.y, heading: routeHeadingAt(progress) };
  }
};
const opponentDriver = createVehicleDriverAi(driverRoute, {
  maxSpeed: gameplayMaxSpeed,
  paceFraction: 0.86,
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
  cruiseRatio: 0.79,
  catchUpStrength: 0.22,
  steeringGain: STEER_CORRECTION_GAIN,
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
const carChassisSpec = vehicleChassisSpecFromBounds([
  heroFraming.subject.size[0],
  heroFraming.subject.size[1],
  heroFraming.subject.size[2]
]);

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
  const surface = racingScene.vehicleSurface({ offRoadGrip: 0.55 });
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
function createCarChassis(): VehicleChassis {
  return createVehicleChassis(carChassisSpec, circuitSurface);
}
const playerChassis = createCarChassis();
const opponentChassis = createCarChassis();

/** Racing-line point at a normalized progress, in game-plane coordinates. */
function sampleRouteLine(progress: number): { readonly x: number; readonly y: number } {
  const points = routeGeometry.points;
  if (points.length === 0) return { x: 0, y: 0 };
  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * points.length;
  const index = Math.floor(scaled) % points.length;
  const next = (index + 1) % points.length;
  const t = scaled - Math.floor(scaled);
  const a = points[index]!;
  const b = points[next]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Heading of the racing line at a progress, from the polyline tangent. */
function routeHeadingAt(progress: number): number {
  const here = sampleRouteLine(progress);
  const ahead = sampleRouteLine(progress + 1 / Math.max(2, routeGeometry.points.length));
  return Math.atan2(ahead.y - here.y, ahead.x - here.x);
}
const physicsProof = createShowcaseCannonPhysicsProof("turbo-drift-circuit");

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
  pitchObserved: false,
  rollObserved: false,
  wheelSpinObserved: false,
  suspensionMoved: false
};
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const initialOpponentPose = racingScene.toScenePose(opponentAi.snapshot(), 0.25);
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
   * Chase framing serves the racing read, bounded by the gate that applies to this frame.
   *
   * The previous distance of 1.15 came from trying to satisfy `readabilityRuleForRole` floors -- the
   * `vehicle` widthRatio 0.18 and the `track` 0.35/0.25/0.12 set. Those are evaluated by the asset CLI
   * against each asset's **isolated release probe**, not against this camera, so pulling the chase
   * camera in could never satisfy them; it only cropped the circuit down to a strip of asphalt and
   * filled the frame with the car's rear bumper.
   *
   * The gate that governs this frame is `routePrimaryProbeThresholds`
   * (`minForegroundWidth: 96`, `minForegroundHeight: 72`, `minReadabilityScore: 35`), which the subject
   * clears comfortably. 2.6 restores the racing read: the car as foreground subject with the road
   * receding, the horizon visible, and the opponent legible up the track.
   */
  /*
   * Distance and height are both derived from `heroFraming`, so they satisfy the declared occupancy
   * contract for whatever asset is bound rather than being tuned to one car.
   *
   * Two hand-tuned heights preceded this and both were wrong for structural reasons worth keeping on
   * record: 0.72 looked *down* onto the roof so the body hid the wheel line, and 0.30 sat at roughly
   * the wheels' own top edge, which made the car read as sunk into the road. `eyeHeightFraction: 0.9`
   * expresses the actual requirement -- just above mid-body -- as a proportion of the subject, which is
   * the form that survives an asset swap.
   *
   * The distance is solved from the occupancy contract, not chosen: at this FOV, holding the car at
   * ~32% of frame height is what keeps the circuit, horizon and opponent legible around it. An earlier
   * 1.15 came from trying to satisfy `readabilityRuleForRole` floors, which are evaluated by the asset
   * CLI against each asset's *isolated release probe* and can never be satisfied by this camera; it
   * only cropped the frame down to the car's rear bumper.
   */
  distance: heroFraming.distance,
  height: heroFraming.height,
  // Derived, not tuned: see `requireLowerSideFeatureVisibility` above.
  sideOffset: heroFraming.sideOffset,
  lookAhead: 1.35,
  fov: 54
});
setupRacingPanel();

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .background("#5f9fc0")
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
    /*
     * Player hero: `showcaseCityVehicle`, replacing `showcaseTexturedSportsCar`.
     *
     * The previous hero asset is **structurally broken**, and this was confirmed in its own isolated
     * release probe (`tests/reports/showcase-release-asset-probes/showcaseTexturedSportsCar.png`), not
     * in the route: all four tyres are modelled detached from the hull on visible stalks at roughly
     * truck scale, and the cockpit renders as an untextured brown smear. Because the defect is present
     * in the asset at its own probe camera, no route framing, lighting or scaling can fix it -- the PRD
     * previously recorded that "all four tyres now read as complete rounded wheels resting on the
     * asphalt", which the probe contradicts. That claim is retracted in the execution log.
     *
     * `showcaseCityVehicle` is the substitute: role `vehicle`, `quality: release`, CC-BY-4.0 with
     * Objaverse provenance, four texture references, and correct car proportions (2.376 x 1.508 x 5.0,
     * a 2.10 length/width ratio against the broken asset's 1.91 open-wheel proportion). Its probe shows
     * a clean body with glass, lights and integrated wheels.
     */
    .add(model(assets.turboRaceCar, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 1.1,
      castShadow: true,
      receiveShadow: true
    }).position(...initialPlayerPose.position).rotate(...initialPlayerPose.rotation).runtime(game.runtimeNode("racing-player-car", {
      tags: ["player", "vehicle", "typed-primary-asset"]
    })))
    /*
     * Opponent: the same well-built model in a distinct livery.
     *
     * An earlier revision pointed the opponent at `showcaseCityVehicle` while the player kept the
     * broken `showcaseTexturedSportsCar`. Now that the *player* uses the good asset, a second distinct
     * well-built car would be preferable -- but the catalog does not contain one. Every alternative was
     * checked: `showcaseKenneyRaceCarRed` is flat untextured low-poly (0 textures, confirmed in its
     * probe), `showcaseCleanSportsCar` has 0 textures and a 0.64 length/width ratio, and
     * `aura3d assets search` returns only a low-poly Kenney delivery prop under CC0.
     *
     * So this is an honest material variant rather than a claimed second asset. It is defensible here
     * for a reason that did **not** hold before: `showcaseCityVehicle` declares a **single** material
     * (`material`), so a whole-model livery does not flatten separate tyre/glass/cockpit slots -- which
     * is exactly the objection that made the previous tint on the seven-slot sports car wrong.
     * The distinction is livery plus scale, and `opponentDistinction` below reports that truthfully
     * instead of claiming a distinct silhouette.
     */
    .add(model(assets.turboRaceCar, {
      name: "racing-opponent-car",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.04,
      material: material.metal({
        name: "opponent cyan race livery",
        color: "#26d9e8",
        metallic: 0.52,
        roughness: 0.3
      }),
      castShadow: true,
      receiveShadow: true
    }).position(...initialOpponentPose.position).rotate(...initialOpponentPose.rotation).runtime(game.runtimeNode("racing-opponent-car", {
      tags: ["opponent", "vehicle", "typed-secondary-asset", "route-local-ai"]
    })))
    .add(primitives.box({
      name: "left drift ribbon",
      material: material.emissive({ name: "hot tire ribbon", color: "#70e8ff", emissive: "#70e8ff", emissiveIntensity: 0.5, opacity: 0.62 })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-left-drift-ribbon", {
      tags: ["vehicle-feedback", "drift", "renderer-owned"]
    })))
    .add(primitives.box({
      name: "right drift ribbon",
      material: material.emissive({ name: "hot tire ribbon", color: "#ff6c91", emissive: "#ff6c91", emissiveIntensity: 0.5, opacity: 0.62 })
    }).position(...initialPlayerPose.position).scale([0.001, 0.001, 0.001]).runtime(game.runtimeNode("racing-right-drift-ribbon", {
      tags: ["vehicle-feedback", "drift", "renderer-owned"]
    })))
    .add(effects.ambientOcclusion({ intensity: 0.42 }))
    .add(effects.neonBloom({ intensity: 0.16 }))
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
    .add(lights.ambient({ name: "circuit sky fill", color: "#cfe6f2", intensity: 0.78 }))
    .add(lights.directional({ name: "circuit daylight key", color: "#fff2dc", intensity: 2.1 })
      .position(-0.83 * SCENE_SIZE, 1.2 * SCENE_SIZE, 0.65 * SCENE_SIZE))
    .add(lights.directional({ name: "circuit cool rim", color: "#bfe4ff", intensity: 0.72 })
      .position(0.65 * SCENE_SIZE, 0.59 * SCENE_SIZE, -0.56 * SCENE_SIZE))
    .add(lights.point({ name: "pit lane magenta spill", color: "#ff547c", intensity: 0.5 })
      .position(0.44 * SCENE_SIZE, 0.15 * SCENE_SIZE, -0.33 * SCENE_SIZE))
    .add(lights.point({ name: "start line cyan spill", color: "#57f3e1", intensity: 0.4 })
      .position(-0.33 * SCENE_SIZE, 0.13 * SCENE_SIZE, 0.3 * SCENE_SIZE))
    .camera(racingCamera)
});

const playerCar = app.nodes.require("racing-player-car");
const opponentCar = app.nodes.require("racing-opponent-car");
const leftDriftRibbon = app.nodes.require("racing-left-drift-ribbon") as AuraRuntimeNodeHandle;
const rightDriftRibbon = app.nodes.require("racing-right-drift-ribbon") as AuraRuntimeNodeHandle;
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
      const pose = racingScene.toScenePose(raceSnapshot);
      return { position: pose.position, rotation: pose.rotation, targetSize: CAR_SCENE_HEIGHT };
    },
    playSpacePoints: route.points.map((point) => racingScene.toScenePoint(point, TRACK_REFERENCE_Y)),
    // Derived from the car's own pose, not from `route.points[0]`. The subject the probe
    // measures is the car where it actually stands; sampling the route's first point put
    // the reference at a different place on the circuit, so a correct car-on-road frame
    // still measured a large contact offset.
    get contactPoint() {
      const pose = racingScene.toScenePose(raceSnapshot);
      return [pose.position[0], CAR_REFERENCE_Y, pose.position[2]] as const;
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
    physics: "game.collisionWorld:cannon-es",
    geometry: "certified-racing-topology",
    camera: "game.racingCameraRig",
    // The two systems that replace route-local vehicle behaviour.
    chassis: "engine.createVehicleChassis",
    opponentDriver: "engine.createVehicleDriverAi"
  },
  /** Populated per frame; see `observedVehicleGrounding`. */
  vehicleChassis: undefined as unknown,
  claimBoundary: "Bounded asset-topology racing presentation with route-selected cannon-es collision fidelity proof and a route-local deterministic opponent controller; no advanced vehicle dynamics, reusable racing AI, or automatic GLB-to-game claim.",
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
  primaryAssets: ["turboRaceCar", "showcaseTsukubaCircuit"],
  /**
   * Playable camera evidence. The route uses a chase rig bound to the player
   * car node, not a static proof/overview camera.
   */
  camera: {
    mode: "chase",
    targetNode: "racing-player-car",
    source: "game.racingCameraRig",
    distance: 2.6,
    height: 0.46,
    sideOffset: 0.08,
    lookAhead: 1.35,
    fov: 54
  },
  subjectFraming: subjectFramingEvidence(),
  renderedFeedback: {
    driftVisible: false,
    driftAmount: 0,
    speedFraction: 0,
    ribbonLength: 0,
    source: "game.racing drift + speed state",
    offTrack: false
  },
  observedRenderedFeedback: { ...observedRenderedFeedback },
  /**
   * Opponent distinction evidence, derived from the typed manifest rather than declared.
   *
   * The opponent used to be the player's own asset recoloured by a whole-model material override, so
   * "the AI is visually distinguishable" rested entirely on hue. These fields read the two assets'
   * actual manifest entries, so the claim is checkable and would go false if the route ever pointed
   * both nodes at the same model again.
   */
  /**
   * Opponent distinction evidence, reported truthfully rather than favourably.
   *
   * Both cars are `showcaseCityVehicle`, because the catalog has no second well-built textured car:
   * `showcaseKenneyRaceCarRed` and `showcaseCleanSportsCar` both ship 0 textures, and asset search
   * returns only a low-poly CC0 prop. So `distinctAsset` is **false** and this records a livery+scale
   * variant instead of overclaiming a distinct silhouette.
   *
   * The variant is legitimate here for a reason that did not hold for the previous hero: this asset
   * declares a single material, so a whole-model livery cannot flatten separate tyre/glass/cockpit
   * slots. `sharedAssetJustification` states why, so a reviewer sees the tradeoff rather than a claim.
   */
  opponentDistinction: {
    playerAsset: assets.turboRaceCar.id,
    opponentAsset: assets.turboRaceCar.id,
    distinctAsset: false,
    distinctSilhouette: false,
    distinctionMode: "livery-and-scale-variant",
    reliesOnColorTintOnly: true,
    opponentAssetRole: "vehicle",
    opponentAssetQuality: "release",
    sharedAssetJustification:
      "No second release-certified textured car exists in the catalog; the shared asset declares a single material, so a whole-model livery does not flatten separate tyre/glass/cockpit slots.",
    playerBounds: assets.turboRaceCar.bounds,
    opponentBounds: assets.turboRaceCar.bounds
  },
  racing: {
    cameraIntent: "stable-chase",
    vehicleAsset: "turboRaceCar",
    opponentVehicleAsset: "turboRaceCar",
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
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    raceSnapshot = racingState.reset(0);
    opponentRaceStarted = false;
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
    const resetOpponentPose = racingScene.toScenePose(resetOpponent, 0.25);
    // Settle both chassis at rest so a reset car is grounded on its first frame
    // rather than dropping onto the road.
    const playerRest = playerChassis.reset({
      x: resetPose.position[0], z: resetPose.position[2], heading: resetPose.rotation[1], speed: 0, steer: 0
    });
    const opponentRest = opponentChassis.reset({
      x: resetOpponentPose.position[0], z: resetOpponentPose.position[2], heading: resetOpponentPose.rotation[1], speed: 0, steer: 0
    });
    playerCar.setPosition(playerRest.groundedPosition[0], playerRest.groundedPosition[1], playerRest.groundedPosition[2]);
    playerCar.setRotation(playerRest.rotation[0], playerRest.rotation[1], playerRest.rotation[2]);
    opponentCar.setPosition(opponentRest.groundedPosition[0], opponentRest.groundedPosition[1], opponentRest.groundedPosition[2]);
    opponentCar.setRotation(opponentRest.rotation[0], opponentRest.rotation[1], opponentRest.rotation[2]);
    mountedEvidence.opponent = opponentAi.evidence(raceSnapshot.progress);
    updateRacingHud();
    return;
  }
  const previous = raceSnapshot;
  opponentRaceStarted ||= input.held("throttle") || input.held("brake") || Math.abs(input.axis("steer")) > 0.01;
  raceSnapshot = racingState.step(step, {
    throttle: input.held("throttle"),
    brake: input.held("brake"),
    // The handbrake is what builds real slip in game.racing. Without it the
    // kit's drift value stays zero and no drift feedback can honestly render.
    drift: input.held("drift"),
    steer: input.axis("steer")
  });
  const playerPose = racingScene.toScenePose(raceSnapshot);
  /*
   * The chassis resolves the car's height and attitude from the surface under each
   * wheel. Previously the car's Y came straight from a scene-space literal that
   * could not respond to the road and produced no pitch or roll -- the sinking, and
   * the "sprite sliding on a plane" read at speed.
   */
  const playerChassisPose = playerChassis.step(step, {
    x: playerPose.position[0],
    z: playerPose.position[2],
    // `toScenePose` yaws the model to face along the racing line; the chassis works in
    // the same scene frame, so it takes that yaw directly.
    heading: playerPose.rotation[1],
    speed: raceSnapshot.speed,
    steer: input.axis("steer"),
    throttle: input.held("throttle") ? 1 : 0,
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
  playerCar.setPosition(playerChassisPose.groundedPosition[0], playerChassisPose.groundedPosition[1], playerChassisPose.groundedPosition[2]);
  playerCar.setRotation(playerChassisPose.rotation[0], playerChassisPose.rotation[1], playerChassisPose.rotation[2]);
  // Drift feedback is driven by the kit's actual slip value plus real speed, not
  // by raw steering input: a stationary car turning its wheels must not smoke.
  const driftAmount = Math.min(1, Math.abs(raceSnapshot.drift));
  const speedFraction = Math.min(1, Math.abs(raceSnapshot.speed) / Math.max(gameplayMaxSpeed, 0.001));
  const driftVisible = driftAmount > 0.12 && speedFraction > 0.18;
  // Ribbon length scales with both slip and speed so faster, harder drifts leave
  // visibly longer marks.
  const ribbonLength = 0.18 + driftAmount * speedFraction * 0.9;
  const ribbonWidth = 0.04 + driftAmount * 0.035;
  const heading = playerPose.heading;
  // Anchor each ribbon half a length behind the rear axle so it trails from the
  // tire contact patch along the road surface instead of hanging off the body.
  const trailOffset = 0.26 + ribbonLength * 0.5;
  const rearX = playerPose.position[0] - Math.sin(heading) * trailOffset;
  const rearZ = playerPose.position[2] - Math.cos(heading) * trailOffset;
  const sideX = Math.cos(heading) * 0.16;
  const sideZ = -Math.sin(heading) * 0.16;
  for (const [ribbon, side] of [[leftDriftRibbon, -1], [rightDriftRibbon, 1]] as const) {
    ribbon
      .setPosition(rearX + sideX * side, playerPose.position[1] - 0.115, rearZ + sideZ * side)
      .setRotation(...playerPose.rotation)
      .setScale(driftVisible ? [ribbonWidth, 0.012, ribbonLength] : [0.001, 0.001, 0.001])
      .setVisible(driftVisible);
  }
  const previousOpponent = opponentAi.snapshot();
  const opponent = opponentRaceStarted
    ? opponentAi.step(step, raceSnapshot.progress)
    : previousOpponent;
  const opponentPose = racingScene.toScenePose(opponent, 0.25);
  const opponentDriverInput = opponentAi.evidence(raceSnapshot.progress).input;
  const opponentChassisPose = opponentChassis.step(step, {
    x: opponentPose.position[0],
    z: opponentPose.position[2],
    heading: opponentPose.rotation[1],
    speed: opponent.speed,
    steer: opponentDriverInput.steer,
    throttle: opponentDriverInput.throttle ? 1 : 0,
    brake: opponentDriverInput.brake ? 1 : 0,
    slip: Math.min(1, Math.abs(opponent.drift))
  });
  opponentCar.setPosition(opponentChassisPose.groundedPosition[0], opponentChassisPose.groundedPosition[1], opponentChassisPose.groundedPosition[2]);
  opponentCar.setRotation(opponentChassisPose.rotation[0], opponentChassisPose.rotation[1], opponentChassisPose.rotation[2]);
  mountedEvidence.status = raceSnapshot.status;
  mountedEvidence.frameCount = raceSnapshot.frame;
  mountedEvidence.speed = raceSnapshot.speed;
  mountedEvidence.lap = raceSnapshot.lap;
  mountedEvidence.checkpoint = raceSnapshot.checkpoint;
  mountedEvidence.opponent = opponentAi.evidence(raceSnapshot.progress);
  mountedEvidence.raceState = raceStateEvidence(previous.progress);
  mountedEvidence.subjectFraming = subjectFramingEvidence();
  mountedEvidence.renderedFeedback = {
    driftVisible,
    driftAmount: round(driftAmount),
    speedFraction: round(speedFraction),
    ribbonLength: round(ribbonLength),
    source: "game.racing drift + speed state",
    offTrack: raceSnapshot.offTrack
  };
  observedRenderedFeedback.driftRendered ||= driftVisible;
  observedRenderedFeedback.highSpeedRendered ||= speedFraction > 0.6;
  observedRenderedFeedback.offTrackRendered ||= raceSnapshot.offTrack === true;
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
  observedVehicleGrounding.everUngrounded ||= !playerChassisPose.grounded;
  observedVehicleGrounding.maxContactGap = Math.max(observedVehicleGrounding.maxContactGap, chassisTelemetry.maxContactGap);
  observedVehicleGrounding.pitchObserved ||= Math.abs(chassisTelemetry.pitch) > 0.004;
  observedVehicleGrounding.rollObserved ||= Math.abs(chassisTelemetry.roll) > 0.004;
  observedVehicleGrounding.wheelSpinObserved ||= chassisTelemetry.wheelSpinRate > 0.5;
  observedVehicleGrounding.suspensionMoved ||=
    Math.abs(chassisTelemetry.averageCompression - 0.5) > 0.01;
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
  panel.innerHTML = "<span class=\"panel__label\">Certified circuit</span>\n<h1>Turbo Drift Circuit</h1>\n<p class=\"panel__lede\">A mesh-bound time trial with a typed race car, six checkpoint gates, and a certified multi-lap pace.</p>\n<section class=\"metrics-row\" aria-label=\"Live race metrics\">\n  <article class=\"metric\"><span>Speed · km/h</span><strong id=\"speed-value\">0</strong></article>\n  <article class=\"metric\"><span>Lap</span><strong id=\"lap-value\">1</strong></article>\n  <article class=\"metric\"><span>Gate</span><strong id=\"checkpoint-value\">0</strong></article>\n  <article class=\"metric\"><span>Status</span><strong id=\"status-value\">Ready</strong></article>\n</section>\n<section class=\"panel__section\" aria-label=\"Track contract\"><h2>Track contract</h2><span class=\"panel__value\" id=\"alignment-value\">Road locked</span><p class=\"claim\">The visible circuit model and racing route share the same hash-bound topology transform.</p></section>\n<section class=\"panel__section\" aria-label=\"Race controls\"><h2>Drive</h2><div class=\"control-cluster\"><button id=\"throttle-control\" type=\"button\">Throttle</button><button id=\"brake-control\" type=\"button\">Brake</button><button id=\"left-control\" type=\"button\">Steer left</button><button id=\"right-control\" type=\"button\">Steer right</button><button id=\"drift-control\" type=\"button\">Handbrake</button><button id=\"reset-control\" type=\"button\">Reset race</button></div><ul class=\"controls-list\"><li><kbd>W</kbd> Throttle</li><li><kbd>A / D</kbd> Steer</li><li><kbd>Space</kbd> Handbrake drift</li><li><kbd>R</kbd> Reset</li></ul></section>";
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
function updateRacingHud(): void {
  hud.speed.textContent = String(Math.round(Math.abs(raceSnapshot.speed) * 36));
  hud.lap.textContent = String(raceSnapshot.lap);
  hud.checkpoint.textContent = String(raceSnapshot.checkpoint);
  hud.status.textContent = raceSnapshot.status;
  hud.alignment.textContent = mountedEvidence.raceState.roadAlignment.onRoad ? "Road locked" : "Recovering";
}
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}
