export interface TurboPassingLaneInput {
  readonly roadWidth: number;
  readonly sceneScale: number;
  readonly playerRenderedWidth: number;
  readonly opponentRenderedWidth: number;
  readonly playerCollisionWidth: number;
  readonly opponentCollisionWidth: number;
  readonly playerChassisHalfWidth: number;
  readonly wheelRadius?: number;
  readonly passingMargin: number;
}

export interface TurboPassingLaneMetrics {
  readonly roadWidth: number;
  readonly usableRoadWidth: number;
  readonly vehicleBoundaryInset: number;
  readonly vehicleCenterHalfWidth: number;
  readonly playerRenderedWidth: number;
  readonly opponentRenderedWidth: number;
  readonly playerCollisionWidth: number;
  readonly opponentCollisionWidth: number;
  readonly combinedCollisionWidth: number;
  readonly twoCarPlusMarginWidth: number;
  readonly sideBySideFit: boolean;
  readonly legalPassingOffset: number;
}

export interface TurboOpponentYieldInput {
  readonly wrappedPlayerGap: number;
  readonly playerSignedOffset: number;
  readonly opponentSignedOffset: number;
  readonly legalPassingOffset: number;
}

export interface TurboOpponentYieldDecision {
  readonly preferredSignedOffset: number;
  readonly passingSide: "left" | "right";
  readonly yielding: boolean;
  readonly mode: "racing-line" | "defensive" | "side-by-side" | "recovery";
}

export function turboSceneToGame(sceneUnits: number, sceneScale: number): number {
  return sceneUnits / Math.max(1e-6, sceneScale);
}

export function turboVehicleBoundaryInset(input: {
  readonly roadWidth: number;
  readonly sceneScale: number;
  readonly chassisHalfWidth: number;
  readonly wheelRadius?: number;
}): number {
  const chassisInsetGame = turboSceneToGame(input.chassisHalfWidth, input.sceneScale);
  const wheelInsetGame = turboSceneToGame(input.wheelRadius ?? 0, input.sceneScale);
  // Convert the rendered half-track and tyre radius into game units. Mixing those
  // scene-unit lengths into this min() previously collapsed the corridor to a few
  // centimetres and made a pass physically impossible. Keep enough extra reserve
  // that an outside tyre cannot hang over the extracted Tsukuba verge while the
  // vehicle centre is still logically on-road.
  const tyreReserve = chassisInsetGame + wheelInsetGame;
  const meshReserve = input.roadWidth * 0.34;
  return Math.min(input.roadWidth * 0.42, Math.max(tyreReserve, meshReserve));
}

export function measureTurboPassingLane(input: TurboPassingLaneInput): TurboPassingLaneMetrics {
  const inset = turboVehicleBoundaryInset({
    roadWidth: input.roadWidth,
    sceneScale: input.sceneScale,
    chassisHalfWidth: input.playerChassisHalfWidth,
    ...(input.wheelRadius === undefined ? {} : { wheelRadius: input.wheelRadius })
  });
  const halfWidth = input.roadWidth * 0.5;
  const vehicleCenterHalfWidth = Math.max(0, halfWidth - Math.min(inset, halfWidth * 0.95));
  const usableRoadWidth = vehicleCenterHalfWidth * 2;
  const combinedCollisionWidth = turboSceneToGame(
    input.playerCollisionWidth + input.opponentCollisionWidth,
    input.sceneScale
  );
  const requiredCenterSeparation = combinedCollisionWidth * 0.5 + input.passingMargin;
  const twoCarPlusMarginWidth = combinedCollisionWidth + input.passingMargin;
  const legalPassingOffset = Math.max(
    0.02,
    Math.min(vehicleCenterHalfWidth * 0.82, requiredCenterSeparation * 0.5)
  );
  return {
    roadWidth: input.roadWidth,
    usableRoadWidth,
    vehicleBoundaryInset: inset,
    vehicleCenterHalfWidth,
    playerRenderedWidth: turboSceneToGame(input.playerRenderedWidth, input.sceneScale),
    opponentRenderedWidth: turboSceneToGame(input.opponentRenderedWidth, input.sceneScale),
    playerCollisionWidth: turboSceneToGame(input.playerCollisionWidth, input.sceneScale),
    opponentCollisionWidth: turboSceneToGame(input.opponentCollisionWidth, input.sceneScale),
    combinedCollisionWidth,
    twoCarPlusMarginWidth,
    sideBySideFit: input.roadWidth + 1e-6 >= twoCarPlusMarginWidth
      && usableRoadWidth + 1e-6 >= requiredCenterSeparation,
    legalPassingOffset
  };
}

export function decideTurboOpponentYield(input: TurboOpponentYieldInput): TurboOpponentYieldDecision {
  const legal = Math.max(0.02, input.legalPassingOffset);
  const playerSide: "left" | "right" = input.playerSignedOffset >= 0 ? "left" : "right";
  const defensiveSide: "left" | "right" = playerSide === "left" ? "right" : "left";
  const defensiveOffset = defensiveSide === "left" ? legal : -legal;
  const playerClosingFromBehind = input.wrappedPlayerGap > -0.09 && input.wrappedPlayerGap < 0.012;
  const sideBySide = Math.abs(input.wrappedPlayerGap) <= 0.018;
  const playerAhead = input.wrappedPlayerGap > 0.012;
  if (playerClosingFromBehind || sideBySide) {
    return {
      preferredSignedOffset: defensiveOffset,
      passingSide: playerSide,
      yielding: true,
      mode: sideBySide ? "side-by-side" : "defensive"
    };
  }
  if (playerAhead) {
    return {
      preferredSignedOffset: defensiveOffset * 0.35,
      passingSide: playerSide,
      yielding: false,
      mode: "racing-line"
    };
  }
  return {
    preferredSignedOffset: legal * 0.28,
    passingSide: "left",
    yielding: false,
    mode: "racing-line"
  };
}
