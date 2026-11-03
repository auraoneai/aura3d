import type { ParityMesh } from "./Support";
import type { SurfacePoint } from "./ParametricGeometry";

export type LoftPoint2 = readonly [number, number] | { readonly x: number; readonly y: number };

/** Supply either a planar profile and path, or a set of corresponding 3D sections. */
export type LoftGeometryOptions = {
  readonly closed?: boolean;
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
} & (
  | { readonly profile: readonly LoftPoint2[]; readonly path: readonly SurfacePoint[]; readonly sections?: never }
  | { readonly sections: readonly (readonly SurfacePoint[])[]; readonly profile?: never; readonly path?: never }
);

type V2 = [number, number];
type V3 = [number, number, number];
const EPS = 1e-10;
const LIMIT = 1_048_576;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: V3): number => Math.hypot(...a);
function unit(a: V3, reason: string): V3 {
  const n = length(a);
  if (n <= EPS) throw new RangeError(`loftGeometry: ${reason}`);
  return mul(a, 1 / n);
}
function point3(value: SurfacePoint): V3 {
  const p: V3 = Array.isArray(value) ? [value[0] as number, value[1] as number, value[2] as number]
    : [(value as {x: number}).x, (value as {y: number}).y, (value as {z: number}).z];
  if (!p.every(Number.isFinite)) throw new RangeError("loftGeometry: point coordinates must be finite");
  return p;
}
function point2(value: LoftPoint2): V2 {
  const p: V2 = Array.isArray(value) ? [value[0] as number, value[1] as number] : [(value as {x: number}).x, (value as {y: number}).y];
  if (!p.every(Number.isFinite)) throw new RangeError("loftGeometry: profile coordinates must be finite");
  return p;
}
function centre(points: readonly V3[]): V3 {
  return mul(points.reduce<V3>((sum, point) => add(sum, point), [0, 0, 0]), 1 / points.length);
}
function polygonNormal(points: readonly V3[]): V3 {
  let normal: V3 = [0, 0, 0];
  for (let i = 0; i < points.length; i += 1) normal = add(normal, cross(points[i]!, points[(i + 1) % points.length]!));
  return normal;
}
function toPoints(input: readonly SurfacePoint[], closed: boolean): V3[] {
  const points = input.map(point3);
  if (closed && points.length > 1 && length(sub(points[0]!, points[points.length - 1]!)) <= EPS) points.pop();
  return points;
}
function validateSection(section: V3[], closed: boolean): void {
  if (section.length < (closed ? 3 : 2)) throw new RangeError("loftGeometry: section has too few points");
  const n = closed ? section.length : section.length - 1;
  for (let i = 0; i < n; i += 1) {
    if (length(sub(section[i]!, section[(i + 1) % section.length]!)) <= EPS) {
      throw new RangeError("loftGeometry: section contains a zero-length edge");
    }
  }
  if (closed && length(polygonNormal(section)) <= EPS) throw new RangeError("loftGeometry: section has zero area");
}

/** Minimal-rotation frame transport avoids unwanted twisting at each path segment. */
function sweptSections(profileInput: readonly LoftPoint2[], pathInput: readonly SurfacePoint[], closed: boolean): V3[][] {
  const profile = profileInput.map(point2);
  if (closed && profile.length > 1 && Math.hypot(profile[0]![0] - profile[profile.length - 1]![0], profile[0]![1] - profile[profile.length - 1]![1]) <= EPS) profile.pop();
  if (profile.length < (closed ? 3 : 2)) throw new RangeError("loftGeometry: profile has too few points");
  if (pathInput.length < 2) throw new RangeError("loftGeometry: path must contain at least two points");
  const path = pathInput.map(point3);
  const segments = path.slice(1).map((p, i) => unit(sub(p, path[i]!), "path contains coincident points"));
  const tangents = path.map((_, i) => i === 0 ? segments[0]! : i === path.length - 1 ? segments[segments.length - 1]!
    : unit(add(segments[i - 1]!, segments[i]!), "path has a 180-degree reversal"));
  const first = tangents[0]!;
  const axis: V3 = Math.abs(first[0]) <= Math.abs(first[1]) && Math.abs(first[0]) <= Math.abs(first[2]) ? [1, 0, 0]
    : Math.abs(first[1]) <= Math.abs(first[2]) ? [0, 1, 0] : [0, 0, 1];
  let normal = unit(sub(axis, mul(first, dot(axis, first))), "cannot construct path frame");
  return path.map((p, i) => {
    const tangent = tangents[i]!;
    if (i > 0) {
      const previous = tangents[i - 1]!;
      const rotation = cross(previous, tangent);
      const sin = length(rotation);
      const cos = Math.max(-1, Math.min(1, dot(previous, tangent)));
      if (sin <= EPS && cos < 0) throw new RangeError("loftGeometry: path has a 180-degree frame reversal");
      if (sin > EPS) {
        const k = mul(rotation, 1 / sin);
        normal = add(add(mul(normal, cos), mul(cross(k, normal), sin)), mul(k, dot(k, normal) * (1 - cos)));
      }
      normal = unit(sub(normal, mul(tangent, dot(normal, tangent))), "cannot transport path frame");
    }
    const binormal = cross(tangent, normal);
    return profile.map(([x, y]) => add(p, add(mul(normal, x), mul(binormal, y))));
  });
}

function signedArea(points: readonly V2[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice / 2;
}

/** Ear clipping for a simple planar contour; invalid or self-crossing caps fail explicitly. */
function capTriangles(points: readonly V2[]): number[] {
  if (points.length > 4096) throw new RangeError("loftGeometry: caps are limited to 4096 contour vertices");
  const area = signedArea(points);
  if (Math.abs(area) <= EPS) throw new RangeError("loftGeometry: cap has zero area");
  const orientation = Math.sign(area);
  const remaining = points.map((_, i) => i);
  const triangles: number[] = [];
  const turn = (a: V2, b: V2, c: V2): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: V2, b: V2, p: V2): boolean => Math.abs(turn(a, b, p)) <= EPS
    && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
  for (let i = 0; i < points.length; i += 1) {
    const nextI = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j += 1) {
      const nextJ = (j + 1) % points.length;
      if (i === nextJ || nextI === j) continue;
      const a = points[i]!; const b = points[nextI]!; const c = points[j]!; const d = points[nextJ]!;
      const ac = turn(a, b, c); const ad = turn(a, b, d);
      const ca = turn(c, d, a); const cb = turn(c, d, b);
      if (((ac > EPS && ad < -EPS) || (ac < -EPS && ad > EPS))
        && ((ca > EPS && cb < -EPS) || (ca < -EPS && cb > EPS))
        || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) {
        throw new RangeError("loftGeometry: cap must be a simple polygon without overlapping edges");
      }
    }
  }
  while (remaining.length > 3) {
    let removed = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!;
      const b = remaining[i]!;
      const c = remaining[(i + 1) % remaining.length]!;
      if (turn(points[a]!, points[b]!, points[c]!) * orientation <= EPS) continue;
      const occupied = remaining.some((other) => {
        if (other === a || other === b || other === c) return false;
        const p = points[other]!;
        return turn(points[a]!, points[b]!, p) * orientation >= -EPS
          && turn(points[b]!, points[c]!, p) * orientation >= -EPS
          && turn(points[c]!, points[a]!, p) * orientation >= -EPS;
      });
      if (occupied) continue;
      triangles.push(a, b, c);
      remaining.splice(i, 1);
      removed = true;
      break;
    }
    if (!removed) throw new RangeError("loftGeometry: cap must be a simple polygon without overlapping edges");
  }
  triangles.push(remaining[0]!, remaining[1]!, remaining[2]!);
  return triangles;
}

/**
 * Construct a loft with smooth side normals and separately indexed planar caps.
 * Profiles must correspond point-for-point. A closed profile has a duplicate UV
 * seam, while caps use their own vertices and material groups 1 and 2.
 */
export function loftGeometry(options: LoftGeometryOptions): ParityMesh {
  if (!options || typeof options !== "object") throw new TypeError("loftGeometry: options are required");
  const closed = options.closed ?? true;
  if (!closed && (options.capStart || options.capEnd)) throw new RangeError("loftGeometry: caps require a closed section");
  let sections: V3[][];
  if (options.sections) {
    if (options.sections.length < 2) throw new RangeError("loftGeometry: at least two sections are required");
    if (options.sections.length * (options.sections[0]!.length + (closed ? 1 : 0)) > LIMIT) {
      throw new RangeError("loftGeometry: vertex limit exceeded");
    }
    sections = options.sections.map((section) => toPoints(section, closed));
  } else {
    if (!options.profile || !options.path) throw new TypeError("loftGeometry: provide sections or a profile and path");
    if (options.path.length * (options.profile.length + (closed ? 1 : 0)) > LIMIT) {
      throw new RangeError("loftGeometry: vertex limit exceeded");
    }
    sections = sweptSections(options.profile, options.path, closed);
  }
  for (const section of sections) validateSection(section, closed);
  const count = sections[0]!.length;
  if (sections.some((s) => s.length !== count)) throw new RangeError("loftGeometry: sections must have matching point counts");
  const stride = count + (closed ? 1 : 0);
  if (stride * sections.length + (options.capStart ? count : 0) + (options.capEnd ? count : 0) > LIMIT) {
    throw new RangeError("loftGeometry: vertex limit exceeded");
  }
  const centers = sections.map(centre);
  const distances = [0];
  for (let i = 1; i < centers.length; i += 1) {
    // A loft can expand or rotate about a fixed center. Measure corresponding
    // point travel rather than requiring the section centers to move.
    const d = sections[i]!.reduce((sum, p, j) => sum + length(sub(p, sections[i - 1]![j]!)), 0) / count;
    if (d <= EPS) throw new RangeError("loftGeometry: consecutive sections coincide");
    distances.push(distances[i - 1]! + d);
  }
  const totalLength = distances[distances.length - 1]!;
  const sectionDirection = (first: number, second: number): V3 => {
    const delta = sub(centers[second]!, centers[first]!);
    if (length(delta) > EPS) return unit(delta, "section direction");
    let largest: V3 = [0, 0, 0];
    for (let i = 0; i < count; i += 1) {
      const candidate = sub(sections[second]![i]!, sections[first]![i]!);
      if (length(candidate) > length(largest)) largest = candidate;
    }
    return unit(largest, "section direction");
  };
  const forward = sectionDirection(0, 1);
  const reverse = closed && dot(polygonNormal(sections[0]!), forward) < 0;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]!;
    const edgeLengths = [0];
    for (let j = 1; j < stride; j += 1) edgeLengths.push(edgeLengths[j - 1]! + length(sub(section[j % count]!, section[j - 1]!)));
    const perimeter = edgeLengths[edgeLengths.length - 1]!;
    for (let j = 0; j < stride; j += 1) {
      positions.push(...section[j % count]!);
      normals.push(0, 0, 0);
      uvs.push(edgeLengths[j]! / perimeter, distances[i]! / totalLength);
    }
  }
  const triangle = (a: number, b: number, c: number): void => {
    const pa: V3 = [positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!];
    const pb: V3 = [positions[b * 3]!, positions[b * 3 + 1]!, positions[b * 3 + 2]!];
    const pc: V3 = [positions[c * 3]!, positions[c * 3 + 1]!, positions[c * 3 + 2]!];
    const n = cross(sub(pb, pa), sub(pc, pa));
    if (length(n) <= EPS) throw new RangeError("loftGeometry: neighboring sections form a degenerate triangle");
    indices.push(a, b, c);
    for (const p of [a, b, c]) for (let k = 0; k < 3; k += 1) normals[p * 3 + k] = normals[p * 3 + k]! + n[k]!;
  };
  for (let i = 0; i < sections.length - 1; i += 1) for (let j = 0; j < stride - 1; j += 1) {
    const a = i * stride + j; const b = a + 1; const c = b + stride; const d = a + stride;
    if (reverse) { triangle(a, c, b); triangle(a, d, c); }
    else { triangle(a, b, c); triangle(a, c, d); }
  }
  groups.push({ start: 0, count: indices.length, materialIndex: 0 });
  if (closed) for (let i = 0; i < sections.length; i += 1) {
    const a = i * stride * 3; const b = (i * stride + count) * 3;
    for (let k = 0; k < 3; k += 1) normals[a + k] = normals[b + k] = normals[a + k]! + normals[b + k]!;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = unit([normals[i]!, normals[i + 1]!, normals[i + 2]!], "undefined side normal");
    normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
  }
  const cap = (section: V3[], end: boolean): void => {
    const center = centre(section);
    const planeNormal = unit(polygonNormal(section), "cap has zero area");
    const axis = unit(sub(section[1]!, section[0]!), "cap has zero-length edge");
    const secondAxis = cross(planeNormal, axis);
    const projected = section.map((p) => {
      const relative = sub(p, center);
      if (Math.abs(dot(relative, planeNormal)) > EPS * Math.max(1, length(relative))) throw new RangeError("loftGeometry: caps must be planar");
      return [dot(relative, axis), dot(relative, secondAxis)] as V2;
    });
    const faces = capTriangles(projected);
    const travel = end ? sectionDirection(centers.length - 2, centers.length - 1) : forward;
    const desired = end ? travel : mul(travel, -1);
    if (Math.abs(dot(planeNormal, desired)) < EPS) throw new RangeError("loftGeometry: cap is parallel to loft direction");
    const capNormal = dot(planeNormal, desired) > 0 ? planeNormal : mul(planeNormal, -1);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const [x, y] of projected) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const offset = positions.length / 3;
    for (let i = 0; i < section.length; i += 1) {
      positions.push(...section[i]!); normals.push(...capNormal);
      uvs.push((projected[i]![0] - minX) / (maxX - minX), (projected[i]![1] - minY) / (maxY - minY));
    }
    const start = indices.length;
    const flip = dot(planeNormal, capNormal) < 0;
    for (let i = 0; i < faces.length; i += 3) {
      const a = offset + faces[i]!; const b = offset + faces[i + 1]!; const c = offset + faces[i + 2]!;
      if (flip) indices.push(a, c, b); else indices.push(a, b, c);
    }
    groups.push({ start, count: indices.length - start, materialIndex: end ? 2 : 1 });
  };
  if (options.capStart) cap(sections[0]!, false);
  if (options.capEnd) cap(sections[sections.length - 1]!, true);
  return { positions, normals, uvs, indices, groups };
}
