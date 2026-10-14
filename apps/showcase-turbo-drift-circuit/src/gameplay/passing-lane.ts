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

/**
 * Certified topology width includes kerb primitives. The visible grey tarmac is
 * the inner fraction; using the full certified half-width reports on-road while
 * a Formula body already sits on grass.
 */
export const TURBO_VISUAL_ASPHALT_FRACTION = 0.76;

export function turboVisualAsphaltWidth(roadWidth: number): number {
  return roadWidth * TURBO_VISUAL_ASPHALT_FRACTION;
}

export function turboBodyOnAsphalt(input: {
  readonly signedTrackOffset: number;
  readonly bodyHalfWidth: number;
  readonly visualAsphaltHalfWidth: number;
}): boolean {
  return Math.abs(input.signedTrackOffset) + input.bodyHalfWidth
    <= input.visualAsphaltHalfWidth + 1e-4;
}

export function turboMaxAsphaltOffset(input: {
  readonly bodyHalfWidth: number;
  readonly visualAsphaltHalfWidth: number;
  readonly edgeMargin?: number;
}): number {
  return Math.max(0.01, input.visualAsphaltHalfWidth - input.bodyHalfWidth - (input.edgeMargin ?? 0.006));
}

export function turboVehicleBoundaryInset(input: {
  readonly roadWidth: number;
  readonly sceneScale: number;
  readonly chassisHalfWidth: number;
  readonly wheelRadius?: number;
  readonly renderedHalfWidth?: number;
}): number {
  const roadHalf = input.roadWidth * 0.5;
  const renderedHalfGame = input.renderedHalfWidth === undefined
    ? undefined
    : turboSceneToGame(input.renderedHalfWidth, input.sceneScale);
  // Keep the vehicle *centre* inside the grey tarmac by the rendered half-width.
  // Adding chassis + tyre again in mixed units used to collapse the corridor so
  // two cars could not sit side by side without a body hanging over the verge.
  const bodyReserve = renderedHalfGame
    ?? turboSceneToGame(input.chassisHalfWidth, input.sceneScale);
  const visualHalf = turboVisualAsphaltWidth(input.roadWidth) * 0.5;
  return Math.min(roadHalf * 0.9, Math.max(0.02, roadHalf - (visualHalf - 0.006 - bodyReserve)));
}

export function measureTurboPassingLane(input: TurboPassingLaneInput): TurboPassingLaneMetrics {
  const playerRenderedWidth = turboSceneToGame(input.playerRenderedWidth, input.sceneScale);
  const opponentRenderedWidth = turboSceneToGame(input.opponentRenderedWidth, input.sceneScale);
  const inset = turboVehicleBoundaryInset({
    roadWidth: input.roadWidth,
    sceneScale: input.sceneScale,
    chassisHalfWidth: input.playerChassisHalfWidth,
    renderedHalfWidth: input.playerRenderedWidth / 2,
    ...(input.wheelRadius === undefined ? {} : { wheelRadius: input.wheelRadius })
  });
  const visualAsphaltWidth = turboVisualAsphaltWidth(input.roadWidth);
  const visualAsphaltHalfWidth = visualAsphaltWidth * 0.5;
  const halfWidth = input.roadWidth * 0.5;
  const vehicleCenterHalfWidth = Math.max(0, halfWidth - Math.min(inset, halfWidth * 0.95));
  const usableRoadWidth = vehicleCenterHalfWidth * 2;
  const combinedCollisionWidth = turboSceneToGame(
    input.playerCollisionWidth + input.opponentCollisionWidth,
    input.sceneScale
  );
  const requiredCenterSeparation = combinedCollisionWidth * 0.5 + input.passingMargin;
  const twoCarPlusMarginWidth = combinedCollisionWidth + input.passingMargin;
  const playerMaxOffset = turboMaxAsphaltOffset({
    bodyHalfWidth: playerRenderedWidth / 2,
    visualAsphaltHalfWidth
  });
  const opponentMaxOffset = turboMaxAsphaltOffset({
    bodyHalfWidth: opponentRenderedWidth / 2,
    visualAsphaltHalfWidth
  });
  const legalPassingOffset = Math.max(
    0.02,
    Math.min(playerMaxOffset, opponentMaxOffset, requiredCenterSeparation * 0.5)
  );
  return {
    roadWidth: input.roadWidth,
    usableRoadWidth,
    vehicleBoundaryInset: inset,
    vehicleCenterHalfWidth,
    playerRenderedWidth,
    opponentRenderedWidth,
    playerCollisionWidth: turboSceneToGame(input.playerCollisionWidth, input.sceneScale),
    opponentCollisionWidth: turboSceneToGame(input.opponentCollisionWidth, input.sceneScale),
    combinedCollisionWidth,
    twoCarPlusMarginWidth,
    sideBySideFit: visualAsphaltWidth + 1e-6 >= twoCarPlusMarginWidth
      && usableRoadWidth + 1e-6 >= requiredCenterSeparation
      && playerMaxOffset + opponentMaxOffset + 1e-6 >= requiredCenterSeparation,
    legalPassingOffset
  };
}

export function decideTurboOpponentYield(input: TurboOpponentYieldInput & {
  readonly maxAsphaltOffset?: number;
}): TurboOpponentYieldDecision {
  const legal = Math.max(0.02, input.legalPassingOffset);
  const asphaltCap = Math.max(0.02, input.maxAsphaltOffset ?? legal);
  const capped = Math.min(legal, asphaltCap);
  // An on-line closer is treated as taking the right-hand passing lane so the
  // rival vacates left instead of mirroring a D-key pass onto the same verge.
  const playerSide: "left" | "right" = input.playerSignedOffset > 0.008 ? "left" : "right";
  const defensiveSide: "left" | "right" = playerSide === "left" ? "right" : "left";
  const defensiveOffset = defensiveSide === "left" ? capped : -capped;
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
    preferredSignedOffset: Math.min(capped, legal * 0.28),
    passingSide: "left",
    yielding: false,
    mode: "racing-line"
  };
}
