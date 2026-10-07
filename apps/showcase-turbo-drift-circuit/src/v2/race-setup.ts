// apps/showcase-turbo-drift-circuit/src/v2/race-setup.ts — certified route setup.
// Extracted from boot.ts (§14.4 caps boot at 400 LOC). Everything here is the
// certified constants block + racing-kit wiring evaluated at import, in the
// same order the inline block ran; only the names boot.ts still references
// are exported.
import {
  createVehicleChassis,
  createVehicleDriverAi,
  game,
  groundedFittedModelPosition,
  resolveChaseFraming,
  vehicleChassisSpecFromBounds,
  type AuraVec3,
  type DriverRoute,
  type VehiclePose,
  type VehicleSurface,
  type VehicleVec3
} from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";
import { gameGeometryContract } from "../generated/game-geometry";
import { createTurboOpponentAi } from "../gameplay/opponent-ai";
import {
  measureTurboPassingLane, turboMaxAsphaltOffset,
  turboVehicleBoundaryInset, turboVisualAsphaltWidth
} from "../gameplay/passing-lane";
import {
  SCENE_SIZE, TRACK_REFERENCE_Y,
  CAR_TARGET_MAX_DIMENSION, OPPONENT_TARGET_MAX_DIMENSION
} from "./scene/world";

// ------------------------------------------------- certified route setup ----
// (port of the certified constants block in legacy/main.ts — derivations
// kept identical so a circuit swap re-derives, never goes stale.)
const trackTopology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;
const FORMULA_ASPHALT_WIDTH = 3.6;
const HERO_VEHICLE_ASSET = "showcaseCc0FormulaRaceCar";
export const route = game.assetBoundRacingRoute({
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
const routeWidth = FORMULA_ASPHALT_WIDTH;
const certifiedMaxSpeed = route.assetBinding.speedModel.certifiedSpeed;
const gameplayPaceMultiplier = 4;
export const gameplayMaxSpeed = Number((certifiedMaxSpeed * gameplayPaceMultiplier).toFixed(3));
const certifiedAcceleration = Number((gameplayMaxSpeed * 4.1).toFixed(3));

function measureTightestCornerRadius(points: readonly { x: number; y: number }[]): number {
  let tightest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const cur = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    let turn = Math.atan2(next.y - cur.y, next.x - cur.x) - Math.atan2(cur.y - prev.y, cur.x - prev.x);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 1e-6) continue;
    const radius = ((inLen + outLen) / 2) / Math.abs(turn);
    if (radius < tightest) tightest = radius;
  }
  return Number.isFinite(tightest) ? tightest : 1;
}
const tightestCornerRadius = measureTightestCornerRadius(routeGeometry.points);
const certifiedSteerRate = Number(
  Math.max(2.7, (gameplayMaxSpeed / (tightestCornerRadius * 1.28)) * 0.75).toFixed(3)
);
const STEER_CORRECTION_GAIN = Number((2 / Math.max(0.05, routeWidth / 2)).toFixed(3));
const recoveryHeadingLimit = Math.PI / 90;

export const heroFraming = resolveChaseFraming(assets.showcaseCc0FormulaRaceCar, {
  targetMaxDimension: CAR_TARGET_MAX_DIMENSION,
  subjectVerticalOccupancy: [0.18, 0.24],
  fov: 54,
  eyeHeightFraction: 0.9,
  lowerSilhouetteFraction: 0.32,
  requireLowerSideFeatureVisibility: true
});
export const CAR_SCENE_HEIGHT = heroFraming.subject.height;
const ROAD_DETAIL_SURFACE_LIFT = 0.075;
const CAR_REFERENCE_Y = TRACK_REFERENCE_Y;

export function seatCarOnVisibleAsphalt(
  pose: Pick<VehiclePose, "groundedPosition" | "rotation">,
  fittedSize: VehicleVec3,
  wheelRadius: number
): VehicleVec3 {
  const seated = groundedFittedModelPosition(pose, fittedSize, {
    contactClearance: wheelRadius * 0.06
  });
  return [seated[0], seated[1] + ROAD_DETAIL_SURFACE_LIFT, seated[2]];
}

const routePlanBounds = trackTopology.roadCenterline.reduce(
  (b, p) => ({
    minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
    minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z)
  }),
  { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minZ: Number.POSITIVE_INFINITY, maxZ: Number.NEGATIVE_INFINITY }
);
const routePlanMaxSpan = Math.max(routePlanBounds.maxX - routePlanBounds.minX, routePlanBounds.maxZ - routePlanBounds.minZ);
const trackModelBounds = trackTopology.modelAlignment.modelBounds;
const trackModelMaxSpan = Math.max(
  trackModelBounds.max[0] - trackModelBounds.min[0],
  trackModelBounds.max[1] - trackModelBounds.min[1],
  trackModelBounds.max[2] - trackModelBounds.min[2]
);
const TRACK_MODEL_TARGET_MAX_DIMENSION = Number(
  (trackModelMaxSpan * (SCENE_SIZE / routePlanMaxSpan)).toFixed(6)
);
export const CIRCUIT_ENVIRONMENT_TARGET_MAX_DIMENSION = Number((
  TRACK_MODEL_TARGET_MAX_DIMENSION
  * (Math.max(...assets.turboCircuitEnvironmentV2.bounds) / Math.max(...assets.turboFormulaCircuit.bounds))
).toFixed(6));

export const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "turboFormulaCircuit",
  targetSceneSize: SCENE_SIZE,
  trackModelTargetMaxDimension: TRACK_MODEL_TARGET_MAX_DIMENSION,
  trackY: TRACK_REFERENCE_Y,
  carY: CAR_REFERENCE_Y,
  ghostY: CAR_REFERENCE_Y - 0.02
});

const fittedCarChassisSpec = vehicleChassisSpecFromBounds([
  heroFraming.subject.size[0], heroFraming.subject.size[1], heroFraming.subject.size[2]
], { wheelDiameterFraction: 0.8 });
export const carChassisSpec = { ...fittedCarChassisSpec, contactTolerance: 0.03 };
const vehicleBoundaryInset = turboVehicleBoundaryInset({
  roadWidth: routeWidth,
  sceneScale: racingScene.transform.scale,
  chassisHalfWidth: carChassisSpec.trackWidth / 2,
  wheelRadius: carChassisSpec.wheelRadius,
  renderedHalfWidth: heroFraming.subject.size[0] / 2
});

export const racingState = game.racing({
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
const opponentStartProgress = 0.032;
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

export const racingLine = game.racingSurfaceQuery(routeGeometry);
const driverRoute: DriverRoute = {
  length: racingLine.length,
  halfWidth: () => routeWidth / 2,
  sample: (progress) => {
    const s = racingLine.sampleAt(progress);
    return { x: s.x, y: s.y, heading: s.heading };
  }
};
const opponentTargetMaxDimension = OPPONENT_TARGET_MAX_DIMENSION;
const opponentAssetScale = opponentTargetMaxDimension / Math.max(...assets.showcaseCcByFormulaOpponent.bounds);
export const opponentRenderedSize: AuraVec3 = [
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
  paceFraction: 0.7,
  lookAheadSeconds: 1.15,
  minLookAhead: Math.max(0.05, racingLine.length * 0.01),
  corneringAcceleration: Number(((gameplayMaxSpeed * gameplayMaxSpeed) / Math.max(1e-6, tightestCornerRadius) * 0.55).toFixed(4)),
  aggression: "balanced",
  reactionSeconds: 0.12,
  seed: 20260802
});
export const opponentAi = createTurboOpponentAi(opponentState, {
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
  yieldEnabled: true,
  dramaSeed: 20260817,
  driver: opponentDriver
});

const fittedOpponentChassisSpec = vehicleChassisSpecFromBounds(opponentRenderedSize, {
  wheelDiameterFraction: 0.8
});
export const opponentChassisSpec = {
  ...fittedOpponentChassisSpec,
  contactTolerance: fittedOpponentChassisSpec.wheelRadius * 0.15
};
const circuitSurface: VehicleSurface = (() => {
  const surface = racingScene.vehicleSurface({
    offRoadGrip: 0.55,
    contactPatchRadius: carChassisSpec.wheelRadius * 3
  });
  if (!surface) {
    throw new Error("Turbo Drift requires drivable track triangles (topology.drivableMesh missing).");
  }
  return surface;
})();
export const playerChassis = createVehicleChassis(carChassisSpec, circuitSurface);
export const opponentChassis = createVehicleChassis(opponentChassisSpec, circuitSurface);
