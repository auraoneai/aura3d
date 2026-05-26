export type ArchitecturalMeasurementType = "distance" | "area" | "angle" | "height";
export type ArchitecturalMeasurementUnit = "metric" | "imperial";
export type ArchitecturalPoint3 = readonly [number, number, number];

export interface ArchitecturalMeasurementOptions {
  readonly unit?: ArchitecturalMeasurementUnit;
  readonly precision?: number;
  readonly snapTolerance?: number;
}

export interface ArchitecturalMeasurementResult {
  readonly type: ArchitecturalMeasurementType;
  readonly value: number;
  readonly unit: string;
  readonly label: string;
  readonly points: readonly ArchitecturalPoint3[];
}

export interface ArchitecturalMeasurementFixture {
  readonly id: "external-parity-old-branch-architectural-measurement-fixture";
  readonly source: "origin-master-arch-viz-measurement-tool-adapted";
  readonly snapEnabled: boolean;
  readonly snapTolerance: number;
  readonly snapPointCount: number;
  readonly distance: ArchitecturalMeasurementResult;
  readonly area: ArchitecturalMeasurementResult;
  readonly angle: ArchitecturalMeasurementResult;
  readonly height: ArchitecturalMeasurementResult;
  readonly hash: string;
  readonly claimBoundary: string;
}

const defaultSnapPoints: readonly ArchitecturalPoint3[] = [
  [-6, 0, -6], [6, 0, -6], [6, 0, 6], [-6, 0, 6],
  [-6, 3, -6], [6, 3, -6], [6, 3, 6], [-6, 3, 6],
  [0, 0, -6], [0, 0, 6], [-6, 0, 0], [6, 0, 0],
  [0, 0, 0],
  [-3, 0, -6], [-3, 2.1, -6], [3, 1, 6], [3, 2.5, 6]
] as const;

export function createArchitecturalMeasurementFixture(options: ArchitecturalMeasurementOptions = {}): ArchitecturalMeasurementFixture {
  const unit = options.unit ?? "metric";
  const precision = Math.max(0, Math.min(4, Math.floor(options.precision ?? 2)));
  const snapTolerance = finiteNonNegative(options.snapTolerance ?? 0.12, "snapTolerance");
  const distancePoints = snapPoints([[-6.04, 0, -6.03], [6.02, 0, -6.01]], snapTolerance);
  const areaPoints = snapPoints([[-6, 0, -6], [6, 0, -6], [6, 0, 6], [-6, 0, 6]], snapTolerance);
  const anglePoints = snapPoints([[6, 0, -6], [0.02, 0, -5.98], [0.01, 0, 0.03]], snapTolerance);
  const heightPoints = snapPoints([[-3.02, 0.01, -6], [-3.01, 2.09, -6.01]], snapTolerance);
  const distance = measurement("distance", distancePoints, unit, precision);
  const area = measurement("area", areaPoints, unit, precision);
  const angle = measurement("angle", anglePoints, unit, precision);
  const height = measurement("height", heightPoints, unit, precision);
  return {
    id: "external-parity-old-branch-architectural-measurement-fixture",
    source: "origin-master-arch-viz-measurement-tool-adapted",
    snapEnabled: true,
    snapTolerance,
    snapPointCount: defaultSnapPoints.length,
    distance,
    area,
    angle,
    height,
    hash: hashMeasurements([distance, area, angle, height]),
    claimBoundary: "Deterministic snap-point distance, area, angle, and height measurement math adapted from the old arch-viz measurement tool; this is architectural workflow evidence, not CAD/BIM dimensioning, IFC import, triangle picking, or legal measurement accuracy."
  };
}

function measurement(type: ArchitecturalMeasurementType, points: readonly ArchitecturalPoint3[], unit: ArchitecturalMeasurementUnit, precision: number): ArchitecturalMeasurementResult {
  const value = type === "distance"
    ? distance(points[0]!, points[1]!)
    : type === "area"
      ? polygonAreaXZ(points)
      : type === "angle"
        ? angleDegrees(points[0]!, points[1]!, points[2]!)
        : Math.abs((points[1]?.[1] ?? 0) - (points[0]?.[1] ?? 0));
  return {
    type,
    value: Number(value.toFixed(4)),
    unit: type === "angle" ? "deg" : unit === "metric" ? type === "area" ? "m2" : "m" : type === "area" ? "ft2" : "ft",
    label: type === "angle" ? `${value.toFixed(precision)} deg` : type === "area" ? formatArea(value, unit, precision) : formatDistance(value, unit, precision),
    points
  };
}

function snapPoints(points: readonly ArchitecturalPoint3[], tolerance: number): readonly ArchitecturalPoint3[] {
  return points.map((point) => {
    let nearest = point;
    let nearestDistance = tolerance;
    for (const snap of defaultSnapPoints) {
      const d = distance(point, snap);
      if (d < nearestDistance) {
        nearest = snap;
        nearestDistance = d;
      }
    }
    return nearest;
  });
}

function distance(left: ArchitecturalPoint3, right: ArchitecturalPoint3): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
}

function polygonAreaXZ(points: readonly ArchitecturalPoint3[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current[0] * next[2] - next[0] * current[2];
  }
  return Math.abs(area) / 2;
}

function angleDegrees(left: ArchitecturalPoint3, vertex: ArchitecturalPoint3, right: ArchitecturalPoint3): number {
  const a = normalize([left[0] - vertex[0], left[1] - vertex[1], left[2] - vertex[2]]);
  const b = normalize([right[0] - vertex[0], right[1] - vertex[1], right[2] - vertex[2]]);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) * 180 / Math.PI;
}

function normalize(value: ArchitecturalPoint3): ArchitecturalPoint3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function formatDistance(meters: number, unit: ArchitecturalMeasurementUnit, precision: number): string {
  if (unit === "metric") return meters < 1 ? `${(meters * 100).toFixed(precision)} cm` : `${meters.toFixed(precision)} m`;
  const feet = meters * 3.28084;
  const wholeFeet = Math.floor(feet);
  const inches = (feet % 1) * 12;
  return wholeFeet === 0 ? `${inches.toFixed(precision)} in` : `${wholeFeet} ft ${inches.toFixed(precision)} in`;
}

function formatArea(squareMeters: number, unit: ArchitecturalMeasurementUnit, precision: number): string {
  return unit === "metric" ? `${squareMeters.toFixed(precision)} m2` : `${(squareMeters * 10.7639).toFixed(precision)} ft2`;
}

function hashMeasurements(measurements: readonly ArchitecturalMeasurementResult[]): string {
  let hash = 0x811c9dc5;
  for (const result of measurements) {
    const scaled = Math.round(result.value * 10_000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= result.type.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Architectural measurement ${label} must be finite and non-negative.`);
  return value;
}
