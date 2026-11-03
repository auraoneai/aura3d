import type { ParityMesh } from "./Support";

/** Options for Aura3D's independently designed patch teapot.
 *
 * `segments` subdivides each bicubic patch in both directions. Patches keep
 * separate vertices at their boundaries, so each component has a continuous
 * 0–1 UV seam without forcing unrelated faces to share texture coordinates.
 */
export interface TeapotGeometryOptions {
  /**
   * Positive overall scale. The generated positions must fit finite float32
   * values and every retained triangle must preserve its edges, area and
   * winding after float32 conversion. The accepted range therefore also
   * depends on the selected components and tessellation. The body is
   * approximately 1.56 units wide at size 1.
   */
  readonly size?: number;
  /** Number of subdivisions per side of each patch, from 1 to 64. */
  readonly segments?: number;
  readonly body?: boolean;
  readonly lid?: boolean;
  readonly spout?: boolean;
  readonly handle?: boolean;
}

type Point = readonly [number, number, number];
type ProfilePoint = readonly [number, number];
type CubicProfile = readonly [ProfilePoint, ProfilePoint, ProfilePoint, ProfilePoint];
type CubicPath = readonly [Point, Point, Point, Point];
type Patch = readonly (readonly Point[])[];

// A quarter circle described with cubic Bezier control points. Four rotated
// copies form the circumferential direction of each tensor-product patch.
const QUARTER: readonly (readonly [number, number])[] = [
  [1, 0], [1, 0.5522847498307936], [0.5522847498307936, 1], [0, 1],
];

function rotateQuarter(point: readonly [number, number], quarter: number): readonly [number, number] {
  switch (quarter) {
    case 0: return point;
    case 1: return [-point[1], point[0]];
    case 2: return [-point[0], -point[1]];
    default: return [point[1], -point[0]];
  }
}

function basis(t: number): readonly [number[], number[]] {
  const s = 1 - t;
  return [
    [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t],
    [-3 * s * s, 3 * s * s - 6 * s * t, 6 * s * t - 3 * t * t, 3 * t * t],
  ];
}

function evaluate(patch: Patch, profile: number, around: number): readonly [Point, Point, Point] {
  const [p, dp] = basis(profile);
  const [a, da] = basis(around);
  const point = [0, 0, 0];
  const tangentProfile = [0, 0, 0];
  const tangentAround = [0, 0, 0];
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const control = patch[i]![j]!;
      for (let k = 0; k < 3; k += 1) {
        point[k] = point[k]! + control[k]! * p[i]! * a[j]!;
        tangentProfile[k] = tangentProfile[k]! + control[k]! * dp[i]! * a[j]!;
        tangentAround[k] = tangentAround[k]! + control[k]! * p[i]! * da[j]!;
      }
    }
  }
  return [point as unknown as Point, tangentProfile as unknown as Point, tangentAround as unknown as Point];
}

function cross(a: Point, b: Point): Point {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function revolution(profile: CubicProfile, quarter: number): Patch {
  return profile.map(([radius, y]) => QUARTER.map((corner) => {
    const [x, z] = rotateQuarter(corner, quarter);
    return [radius * x, y, radius * z] as const;
  }));
}

/** Create a patch around an XY-plane cubic path with circular cross-sections. */
function sweep(path: CubicPath, radii: readonly [number, number, number, number], quarter: number): Patch {
  return path.map((center, i) => {
    const previous = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(3, i + 1)]!;
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy);
    // Every predefined path has a non-zero control-polygon tangent.
    const nx = -dy / length;
    const ny = dx / length;
    return QUARTER.map((corner) => {
      const [radial, z] = rotateQuarter(corner, quarter);
      const radius = radii[i]!;
      return [center[0] + nx * radius * radial, center[1] + ny * radius * radial, center[2] + radius * z] as const;
    });
  });
}

/**
 * A recognizable teapot made from authored bicubic Bezier patches. The body,
 * bottom, lid and knob are surfaces of revolution; the spout and handle are
 * swept cubic patches. They are deliberately separate components, with a free
 * spout opening and overlapping attachments rather than a boolean union.
 * Geometry is returned in the same raw indexed format as other Aura3D mesh
 * generators; callers own the returned arrays.
 */
export function teapotGeometry(options: TeapotGeometryOptions = {}): ParityMesh {
  const size = options.size ?? 1;
  const segments = options.segments ?? 8;
  if (!Number.isFinite(size) || size < 1e-100 || size > 1e100) {
    throw new RangeError("teapotGeometry: size must be between 1e-100 and 1e100");
  }
  const floatSize = Math.fround(size);
  if (!(floatSize > 0) || !Number.isFinite(floatSize)) {
    throw new RangeError("teapotGeometry: size must be representable as a positive finite float32 value");
  }
  if (!Number.isInteger(segments) || segments < 1 || segments > 64) {
    throw new RangeError("teapotGeometry: segments must be an integer between 1 and 64");
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  const emit = (patch: Patch, section: number, sections: number, quarter: number, reverse: boolean): void => {
    const first = positions.length / 3;
    // Mesh consumers upload float32 positions. Check that conversion while
    // the patch is available, so subnormal scales cannot silently collapse
    // its triangles and large scales cannot create infinite GPU attributes.
    // Only one patch's temporary positions are retained at a time.
    const floatPositions = new Float32Array((segments + 1) * (segments + 1) * 3);
    for (let row = 0; row <= segments; row += 1) {
      const v = row / segments;
      for (let column = 0; column <= segments; column += 1) {
        const u = column / segments;
        const [point, along, around] = evaluate(patch, v, u);
        let normal = reverse ? cross(around, along) : cross(along, around);
        let length = Math.hypot(...normal);
        if (length < 1e-12) {
          // A collapsed patch edge is a valid pole. Evaluate just inside the
          // patch to recover its limiting direction instead of emitting NaNs.
          const [, insideAlong, insideAround] = evaluate(patch, Math.max(1e-6, Math.min(1 - 1e-6, v)), u);
          normal = reverse ? cross(insideAround, insideAlong) : cross(insideAlong, insideAround);
          length = Math.hypot(...normal);
        }
        if (length < 1e-12) throw new Error("teapotGeometry: degenerate patch cannot provide a normal");
        const x = point[0] * size;
        const y = point[1] * size;
        const z = point[2] * size;
        const offset = (row * (segments + 1) + column) * 3;
        floatPositions[offset] = x;
        floatPositions[offset + 1] = y;
        floatPositions[offset + 2] = z;
        if (!Number.isFinite(floatPositions[offset]) || !Number.isFinite(floatPositions[offset + 1]) || !Number.isFinite(floatPositions[offset + 2])) {
          throw new RangeError("teapotGeometry: generated position exceeds the finite float32 range");
        }
        positions.push(x, y, z);
        normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
        uvs.push((quarter + u) / 4, (section + v) / sections);
      }
    }
    const appendTriangle = (a: number, b: number, c: number): void => {
      const pointAt = (i: number): Point => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
      const pa = pointAt(a);
      const pb = pointAt(b);
      const pc = pointAt(c);
      const ab: Point = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const ac: Point = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const area = cross(ab, ac);
      const areaLength = Math.hypot(...area);
      if (areaLength <= 1e-12 * size * size) return;

      const floatPointAt = (i: number): Point => {
        const offset = (i - first) * 3;
        return [floatPositions[offset]!, floatPositions[offset + 1]!, floatPositions[offset + 2]!];
      };
      const qa = floatPointAt(a);
      const qb = floatPointAt(b);
      const qc = floatPointAt(c);
      const qab: Point = [qb[0] - qa[0], qb[1] - qa[1], qb[2] - qa[2]];
      const qac: Point = [qc[0] - qa[0], qc[1] - qa[1], qc[2] - qa[2]];
      const bc: Point = [pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]];
      const qbc: Point = [qc[0] - qb[0], qc[1] - qb[1], qc[2] - qb[2]];
      const floatArea = cross(qab, qac);
      const floatAreaLength = Math.hypot(...floatArea);
      const accurate = (actual: number, expected: number): boolean =>
        actual > 0 && Math.abs(actual / expected - 1) <= 0.01;
      // Ratios are calculated in JS double precision; the full float32 range
      // keeps these edge and area products finite and above double underflow.
      if (!accurate(Math.hypot(...qab), Math.hypot(...ab))
        || !accurate(Math.hypot(...qac), Math.hypot(...ac))
        || !accurate(Math.hypot(...qbc), Math.hypot(...bc))
        || !accurate(floatAreaLength, areaLength)
        || area[0] * floatArea[0] + area[1] * floatArea[1] + area[2] * floatArea[2] <= 0) {
        throw new RangeError("teapotGeometry: float32 positions cannot preserve triangle edges, area and winding within 1%; adjust size or segments");
      }
      if (reverse) indices.push(a, c, b);
      else indices.push(a, b, c);
    };
    for (let row = 0; row < segments; row += 1) {
      for (let column = 0; column < segments; column += 1) {
        const a = first + row * (segments + 1) + column;
        const b = a + segments + 1;
        appendTriangle(a, b, a + 1);
        appendTriangle(b, b + 1, a + 1);
      }
    }
  };

  const component = (materialIndex: number, profiles: readonly CubicProfile[]): void => {
    const start = indices.length;
    profiles.forEach((profile, section) => {
      for (let quarter = 0; quarter < 4; quarter += 1) emit(revolution(profile, quarter), section, profiles.length, quarter, false);
    });
    groups.push({ start, count: indices.length - start, materialIndex });
  };
  const tube = (materialIndex: number, path: CubicPath, radii: readonly [number, number, number, number]): void => {
    const start = indices.length;
    for (let quarter = 0; quarter < 4; quarter += 1) emit(sweep(path, radii, quarter), 0, 1, quarter, true);
    groups.push({ start, count: indices.length - start, materialIndex });
  };

  if (options.body ?? true) component(0, [
    [[0, -0.65], [0.02, -0.65], [0.06, -0.65], [0.08, -0.65]],
    [[0.08, -0.65], [0.58, -0.65], [0.78, -0.42], [0.78, -0.1]],
    [[0.78, -0.1], [0.78, 0.22], [0.6, 0.44], [0.48, 0.46]],
    [[0.48, 0.46], [0.48, 0.5], [0.52, 0.52], [0.52, 0.54]],
  ]);
  if (options.lid ?? true) component(1, [
    [[0.52, 0.54], [0.46, 0.58], [0.34, 0.59], [0.2, 0.59]],
    [[0.2, 0.59], [0.16, 0.6], [0.16, 0.69], [0.12, 0.7]],
    [[0.12, 0.7], [0.12, 0.75], [0.07, 0.76], [0, 0.76]],
  ]);
  if (options.spout ?? true) tube(2,
    [[0.55, 0.16, 0], [0.82, 0.14, 0], [1.08, 0.45, 0], [1.28, 0.51, 0]],
    [0.22, 0.2, 0.14, 0.12]);
  if (options.handle ?? true) tube(3,
    [[-0.52, 0.36, 0], [-1.45, 0.7, 0], [-1.45, -0.7, 0], [-0.52, -0.38, 0]],
    [0.12, 0.095, 0.095, 0.12]);
  return { positions, normals, uvs, indices, groups };
}
