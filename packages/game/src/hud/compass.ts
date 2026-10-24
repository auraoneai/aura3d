export interface CompassPoint {
  readonly x: number;
  readonly z: number;
}

/** Signed bearing (radians) from `from` to `to` relative to the heading `yaw`; 0 means dead ahead (-z at yaw 0). */
export function compassBearing(from: CompassPoint, to: CompassPoint, yaw: number): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z)) - yaw;
}

/** CSS rotation (degrees) for a needle drawn pointing up so it points at the target. */
export function compassRotationDeg(bearing: number): number {
  return (-bearing * 180) / Math.PI;
}

export interface CompassNeedle {
  readonly style: Record<string, string> | { transform: string };
}

/** Rotate `needle` toward `to` and return the bearing it used. */
export function updateCompass(needle: CompassNeedle, from: CompassPoint, to: CompassPoint, yaw: number): number {
  const bearing = compassBearing(from, to, yaw);
  (needle.style as { transform: string }).transform = `rotate(${compassRotationDeg(bearing)}deg)`;
  return bearing;
}
