export interface FightFloorBounds {
  laneMinX: number;
  laneMaxX: number;
  floorY: number;
  softWallPadding: number;
  cameraSafeMinX: number;
  cameraSafeMaxX: number;
}

export const neonDowntownFightFloorBounds: FightFloorBounds = {
  laneMinX: -3.2,
  laneMaxX: 3.2,
  floorY: 0,
  softWallPadding: 0.24,
  cameraSafeMinX: -2.75,
  cameraSafeMaxX: 2.75,
};

export function clampToFightFloor(x: number, bounds: FightFloorBounds = neonDowntownFightFloorBounds): number {
  return Math.max(bounds.laneMinX, Math.min(bounds.laneMaxX, x));
}

export function getSoftWallPressure(x: number, bounds: FightFloorBounds = neonDowntownFightFloorBounds): number {
  if (x < bounds.laneMinX + bounds.softWallPadding) {
    return (bounds.laneMinX + bounds.softWallPadding - x) / bounds.softWallPadding;
  }

  if (x > bounds.laneMaxX - bounds.softWallPadding) {
    return (x - (bounds.laneMaxX - bounds.softWallPadding)) / bounds.softWallPadding;
  }

  return 0;
}
