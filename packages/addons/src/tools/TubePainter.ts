/** A bounded editable tube built from a local-space polyline. */
export type TubePoint = readonly [number, number, number];
export interface TubePainterOptions {
  readonly radius?: number;
  readonly radialSegments?: number;
  readonly capped?: boolean;
  readonly maxPoints?: number;
  readonly maxTriangles?: number;
}
export interface PaintedTubeGeometry {
  readonly kind: "aura-custom-geometry";
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: { readonly min: TubePoint; readonly max: TubePoint };
  readonly dynamic: true;
}

type Vec = [number, number, number];
const HARD_MAX_POINTS = 8192;
const HARD_MAX_TRIANGLES = 1_000_000;
const COORDINATE_LIMIT = 1e9;

/**
 * Add picked local-space points, then pass `geometry()` to `geometry.custom`
 * or a runtime node's `setGeometry`. Rings use parallel-transported frames;
 * caps have separate normals for a crisp edge. Empty paths return null.
 * Snapshots own their arrays and remain valid after edits or disposal.
 */
export class TubePainter {
  private points: Vec[] = [];
  private readonly radius: number;
  private readonly radialSegments: number;
  private readonly capped: boolean;
  private readonly maxPoints: number;
  private readonly maxTriangles: number;
  private disposed = false;

  constructor(options: TubePainterOptions = {}) {
    this.radius = positive(options.radius ?? 0.05, "radius");
    if (this.radius > COORDINATE_LIMIT) throw new RangeError("radius exceeds the supported coordinate limit");
    this.radialSegments = integer(options.radialSegments ?? 8, 3, 128, "radialSegments");
    this.maxPoints = integer(options.maxPoints ?? 2048, 2, HARD_MAX_POINTS, "maxPoints");
    this.maxTriangles = integer(options.maxTriangles ?? 100_000, 1, HARD_MAX_TRIANGLES, "maxTriangles");
    this.capped = options.capped ?? true;
    if (typeof this.capped !== "boolean") throw new Error("capped must be a boolean");
  }

  get pointCount(): number { this.assertAlive(); return this.points.length; }

  addPoint(point: TubePoint): void {
    this.assertAlive();
    validatePoint(point);
    if (this.points.length >= this.maxPoints) throw new RangeError("TubePainter point budget exceeded");
    const nextCount = this.points.length + 1;
    if (nextCount >= 2 && this.triangleCount(nextCount) > this.maxTriangles) throw new RangeError("TubePainter triangle budget exceeded");
    const p: Vec = [point[0], point[1], point[2]];
    if (this.points.length) {
      const previous = this.points[this.points.length - 1]!;
      const nextDirection = normalize(subtract(p, previous), "Consecutive tube points must differ");
      if (this.points.length >= 2) {
        const prior = normalize(subtract(previous, this.points[this.points.length - 2]!), "Consecutive tube points must differ");
        if (dot(prior, nextDirection) < -0.999999) throw new RangeError("A tube path cannot immediately reverse direction");
      }
    }
    this.points.push(p);
  }

  /** Removes and returns the last point, allowing a stroke to participate in undo. */
  removeLastPoint(): TubePoint | null { this.assertAlive(); const p = this.points.pop(); return p ? [...p] as Vec : null; }
  clear(): void { this.assertAlive(); this.points = []; }

  geometry(): PaintedTubeGeometry | null {
    this.assertAlive();
    if (this.points.length < 2) return null;
    const n = this.points.length, sides = this.radialSegments;
    const tangents: Vec[] = [];
    const distances = [0];
    for (let i = 0; i < n; i += 1) {
      const incoming = i > 0 ? normalize(subtract(this.points[i]!, this.points[i - 1]!), "invalid tube segment") : undefined;
      const outgoing = i + 1 < n ? normalize(subtract(this.points[i + 1]!, this.points[i]!), "invalid tube segment") : undefined;
      tangents.push(incoming && outgoing ? normalize(add(incoming, outgoing), "tube path cannot reverse direction") : (incoming ?? outgoing)!);
      if (incoming) distances.push(distances[i - 1]! + distance(this.points[i]!, this.points[i - 1]!));
    }
    const first = tangents[0]!;
    const axis: Vec = Math.abs(first[0]) <= Math.abs(first[1]) && Math.abs(first[0]) <= Math.abs(first[2]) ? [1, 0, 0] : Math.abs(first[1]) <= Math.abs(first[2]) ? [0, 1, 0] : [0, 0, 1];
    const frames: Vec[] = [normalize(cross(first, axis), "tube frame is degenerate")];
    for (let i = 1; i < n; i += 1) {
      const previous = tangents[i - 1]!, current = tangents[i]!;
      const rotation = cross(previous, current), sine = Math.hypot(...rotation), cosine = Math.max(-1, Math.min(1, dot(previous, current)));
      if (sine < 1e-12) {
        if (cosine < 0) throw new RangeError("Tube frame cannot rotate through 180 degrees");
        frames.push([...frames[i - 1]!] as Vec);
      } else {
        const axisOfRotation = scale(rotation, 1 / sine), f = frames[i - 1]!;
        const rotated = add(add(scale(f, cosine), scale(cross(axisOfRotation, f), sine)), scale(axisOfRotation, dot(axisOfRotation, f) * (1 - cosine)));
        // Remove accumulated roundoff along the tangent to keep rings circular.
        frames.push(normalize(subtract(rotated, scale(current, dot(rotated, current))), "tube frame is degenerate"));
      }
    }
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const totalLength = distances[n - 1]!;
    const put = (p: Vec, normal: Vec, u: number, v: number): number => {
      const index = positions.length / 3;
      positions.push(...p); normals.push(...normal); uvs.push(u, v); return index;
    };
    for (let i = 0; i < n; i += 1) {
      const u = frames[i]!, v = cross(tangents[i]!, u), point = this.points[i]!;
      for (let j = 0; j <= sides; j += 1) {
        const angle = j * 2 * Math.PI / sides;
        const normal = add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle)));
        put(add(point, scale(normal, this.radius)), normal, distances[i]! / totalLength, j / sides);
      }
    }
    for (let i = 0; i < n - 1; i += 1) for (let j = 0; j < sides; j += 1) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    if (this.capped) {
      for (const end of [0, n - 1]) {
        const sign = end === 0 ? -1 : 1, normal = scale(tangents[end]!, sign), point = this.points[end]!;
        const center = put(point, normal, 0.5, 0.5);
        const u = frames[end]!, v = cross(tangents[end]!, u);
        for (let j = 0; j <= sides; j += 1) {
          const angle = j * 2 * Math.PI / sides, c = Math.cos(angle), s = Math.sin(angle);
          put(add(point, scale(add(scale(u, c), scale(v, s)), this.radius)), normal, 0.5 + c * 0.5, 0.5 + s * 0.5);
        }
        for (let j = 0; j < sides; j += 1) {
          if (sign < 0) indices.push(center, center + j + 2, center + j + 1);
          else indices.push(center, center + j + 1, center + j + 2);
        }
      }
    }
    const vertices = Float32Array.from(positions);
    const vertexNormals = Float32Array.from(normals);
    if (vertices.some((value) => !Number.isFinite(value))) throw new RangeError("Tube positions exceed the supported numeric range");
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
      const ab: Vec = [vertices[b]! - vertices[a]!, vertices[b + 1]! - vertices[a + 1]!, vertices[b + 2]! - vertices[a + 2]!];
      const ac: Vec = [vertices[c]! - vertices[a]!, vertices[c + 1]! - vertices[a + 1]!, vertices[c + 2]! - vertices[a + 2]!];
      const face = cross(ab, ac);
      const outward = face[0] * vertexNormals[a]! + face[1] * vertexNormals[a + 1]! + face[2] * vertexNormals[a + 2]!;
      if (!(outward > 0)) throw new RangeError("Tube contains a collapsed or inverted triangle; increase point spacing, use a smaller radius, or move closer to the origin");
    }
    return { kind: "aura-custom-geometry", positions: vertices, normals: vertexNormals, uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices), bounds: bounds(vertices), dynamic: true };
  }

  dispose(): void { if (!this.disposed) { this.points = []; this.disposed = true; } }
  private triangleCount(points: number): number { return 2 * (points - 1) * this.radialSegments + (this.capped ? 2 * this.radialSegments : 0); }
  private assertAlive(): void { if (this.disposed) throw new Error("TubePainter is disposed"); }
}

function bounds(data: Float32Array): { min: TubePoint; max: TubePoint } {
  const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.length; i += 3) for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis]!, data[i + axis]!); max[axis] = Math.max(max[axis]!, data[i + axis]!); }
  return { min, max };
}
function positive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive`); return value; }
function integer(value: number, min: number, max: number, label: string): number { if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer from ${min} to ${max}`); return value; }
function validatePoint(p: TubePoint): void { if (!p || p.length !== 3 || p.some((value) => !Number.isFinite(value) || Math.abs(value) > COORDINATE_LIMIT)) throw new RangeError("Tube point must be a finite vec3 within the coordinate limit"); }
function subtract(a: TubePoint, b: TubePoint): Vec { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a: TubePoint, b: TubePoint): Vec { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a: TubePoint, n: number): Vec { return [a[0] * n, a[1] * n, a[2] * n]; }
function dot(a: TubePoint, b: TubePoint): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: TubePoint, b: TubePoint): Vec { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function distance(a: TubePoint, b: TubePoint): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function normalize(a: TubePoint, error: string): Vec { const length = Math.hypot(...a); if (length < 1e-10 || !Number.isFinite(length)) throw new RangeError(error); return scale(a, 1 / length); }
