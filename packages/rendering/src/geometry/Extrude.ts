/**
 * Native contour extrusion.
 *
 * Provenance (reviewed 2026-11-02, WP-13/WP-29): this file replaced an
 * earlier geometry port and contains no code carried over from it. It is
 * built from the following documented methods and public contracts:
 * - corner offsets use the miter bisector (n_a + n_b) / (1 + n_a . n_b) of the
 *   two edge normals, clamped to length sqrt(2) so acute corners stay bounded;
 * - bevel layers follow a quarter-ellipse profile (thickness cos(a),
 *   offset + size sin(a)) for a in [0, pi/2);
 * - path sweeps place the ring in the curve's rotation-minimizing frame
 *   (`Curve3Adapter.computeFrenetFrames`);
 * - the public option defaults (curveSegments 12, steps 1, depth 1, bevel on,
 *   thickness 0.2, size thickness - 0.1, offset 0, 3 bevel segments), the
 *   two material groups (caps 0, walls 1) and the planar wall UV rule (use x
 *   or y along the dominant edge axis, 1 - z across it) are the documented 4.x
 *   compatibility contract that existing scenes rely on.
 * Equivalent-contract coverage: tests/unit/parity/geometry-counts.test.ts,
 * tests/unit/geometry/native-independent-extrusion.test.ts and
 * tests/unit/agent-api/native-independent-extrusion-scene.test.ts. Record:
 * docs/prds/aura3d-native-provenance-record.json.
 */
import { Vector3 } from "@aura3d/math";
import { independentExtrude } from "./IndependentExtrude";
import { computeVertexNormals, isClockWise, removeDupEndPts, resolveCurve3, resolveShape2D, shapeArea, triangulateShape } from "./Support";
import type { ParityMesh } from "./Support";

export interface ExtrudeParityParams {
  readonly shape: unknown;
  /** Select bounded, straight extrusion with no bevel or path sweep. */
  readonly extrusionMode?: "linear";
  readonly curveSegments?: number;
  readonly steps?: number;
  readonly depth?: number;
  readonly bevelEnabled?: boolean;
  readonly bevelThickness?: number;
  readonly bevelSize?: number;
  readonly bevelOffset?: number;
  readonly bevelSegments?: number;
  readonly extrudePath?: unknown;
}
interface Point2 { readonly x: number; readonly y: number }
interface Layer { readonly points: readonly Vector3[] }

/** Offset direction at a corner, bounded to avoid arbitrarily long miters. */
function cornerOffset(previous: Point2, current: Point2, next: Point2): Point2 {
  const ax = current.x - previous.x, ay = current.y - previous.y;
  const bx = next.x - current.x, by = next.y - current.y;
  const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
  if (al === 0 || bl === 0) return { x: 0, y: 0 };
  const na = { x: -ay / al, y: ax / al }, nb = { x: -by / bl, y: bx / bl };
  const denominator = 1 + na.x * nb.x + na.y * nb.y;
  if (denominator < 1e-8) return na;
  const x = (na.x + nb.x) / denominator, y = (na.y + nb.y) / denominator;
  const length = Math.hypot(x, y);
  const scale = length > Math.SQRT2 ? Math.SQRT2 / length : 1;
  return { x: x * scale, y: y * scale };
}

function normalizedRing(points: readonly Point2[], clockwise: boolean): Point2[] {
  const ring = points.map((p) => ({ x: p.x, y: p.y }));
  removeDupEndPts(ring);
  for (let i = ring.length - 1; i > 0; i -= 1) {
    if (ring[i]!.x === ring[i - 1]!.x && ring[i]!.y === ring[i - 1]!.y) ring.splice(i, 1);
  }
  if (ring.length < 3 || shapeArea(ring) === 0) throw new RangeError("Extrusion rings must enclose a nonzero area.");
  if (isClockWise(ring) !== clockwise) ring.reverse();
  return ring;
}

/**
 * Make cap triangles share every ring edge with the walls.
 *
 * The polygon triangulator omits ring vertices that lie between collinear
 * neighbours, while the walls and bevel layers emit one quad per ring edge.
 * A cap edge A-C would then meet wall edges A-B and B-C in a T-junction that
 * rasterizes as hairline cracks. Each cap triangle whose edge spans omitted
 * ring vertices is split at those vertices. The inserted points lie on the
 * edge, so the covered area, winding and silhouette are unchanged and no
 * vertex is added beyond the ring itself.
 */
function conformCapToRings(faces: readonly (readonly number[])[], rings: readonly (readonly Point2[])[]): number[][] {
  const used = new Set<number>();
  for (const face of faces) for (const index of face) used.add(index);
  // Omitted ring vertices keyed by the directed ring edge ("from,to") they lie on.
  const omitted = new Map<string, number[]>();
  let base = 0;
  for (const ring of rings) {
    const count = ring.length;
    const first = ring.findIndex((_, i) => used.has(base + i));
    for (let step = 0; first >= 0 && step < count;) {
      const from = (first + step) % count;
      let span = 1;
      while (span < count && !used.has(base + (from + span) % count)) span += 1;
      const to = (from + span) % count;
      const a = ring[from]!, b = ring[to]!, dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
      const between: number[] = [];
      for (let k = 1; k < span; k += 1) {
        const p = ring[(from + k) % count]!, along = (p.x - a.x) * dx + (p.y - a.y) * dy;
        const across = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx);
        // Only vertices strictly inside the spanned edge are inserted.
        if (along > 0 && along < squared && across <= 1e-9 * squared) between.push(base + (from + k) % count);
      }
      if (between.length > 0) omitted.set(`${base + from},${base + to}`, between);
      step += span;
    }
    base += count;
  }
  if (omitted.size === 0) return faces.map((face) => [...face]);
  const along = (from: number, to: number): number[] => {
    const forward = omitted.get(`${from},${to}`);
    if (forward) return forward;
    const backward = omitted.get(`${to},${from}`);
    return backward ? [...backward].reverse() : [];
  };
  const output: number[][] = [];
  // Triangle (a, b, c) with the omitted points on each of its directed edges.
  const split = (a: number, b: number, c: number, ab: number[], bc: number[], ca: number[]): void => {
    if (ab.length === 0 && bc.length === 0 && ca.length === 0) { output.push([a, b, c]); return; }
    if (ab.length === 0) { split(b, c, a, bc, ca, ab); return; }
    const middle = ab.length >> 1, m = ab[middle]!;
    split(a, m, c, ab.slice(0, middle), [], ca);
    split(m, b, c, ab.slice(middle + 1), bc, []);
  };
  for (const face of faces) {
    const [a, b, c] = face as [number, number, number];
    split(a, b, c, along(a, b), along(b, c), along(c, a));
  }
  return output;
}

/**
 * Emit a non-indexed mesh with cap material group 0 and wall material group 1.
 * Bevel end rings extend along path tangents when an extrusion path is given.
 */
export function extrudeParityMesh(params: ExtrudeParityParams): ParityMesh {
  if (params.extrusionMode !== undefined) {
    if (params.extrusionMode !== "linear") throw new RangeError("Unsupported extrusion mode.");
    if (params.extrudePath != null || (params.bevelEnabled !== undefined && params.bevelEnabled !== false) || params.bevelThickness !== undefined ||
      params.bevelSize !== undefined || params.bevelOffset !== undefined || params.bevelSegments !== undefined) {
      throw new RangeError("Linear extrusion does not support path sweeps or bevel settings.");
    }
    return independentExtrude(params.shape, {
      depth: params.depth,
      steps: params.steps,
      curveSegments: params.curveSegments,
    });
  }
  const steps = params.steps ?? 1, bevelSegments = params.bevelSegments ?? 3;
  const depth = params.depth ?? 1, thickness = params.bevelThickness ?? 0.2;
  const size = params.bevelSize ?? thickness - 0.1, offset = params.bevelOffset ?? 0;
  const bevel = params.bevelEnabled ?? true;
  if (!Number.isInteger(steps) || steps < 1 || !Number.isInteger(bevelSegments) || bevelSegments < 0) throw new RangeError("Extrusion steps must be positive and bevel segments nonnegative integers.");
  if (![depth, thickness, size, offset].every(Number.isFinite) || thickness < 0) throw new RangeError("Extrusion depth and bevel values must be finite, with nonnegative bevel thickness.");

  const shape = resolveShape2D(params.shape, params.curveSegments ?? 12);
  const rings = [normalizedRing(shape.shape, true), ...shape.holes.map((ring) => normalizedRing(ring, false))];
  const directions = rings.map((ring) => ring.map((point, i) => cornerOffset(ring[(i + ring.length - 1) % ring.length]!, point, ring[(i + 1) % ring.length]!)));
  const vertices = rings.flat(), offsets = directions.flat();
  const capShift = bevel && bevelSegments > 0 ? offset : 0;
  const capRings = rings.map((ring, r) => ring.map((point, i) => ({
    x: point.x + directions[r]![i]!.x * capShift,
    y: point.y + directions[r]![i]!.y * capShift
  })));
  const faceIndices = conformCapToRings(triangulateShape(capRings[0]!, capRings.slice(1)), capRings);
  const path = params.extrudePath == null ? undefined : resolveCurve3(params.extrudePath);
  const samples = path?.getSpacedPoints(steps);
  const closed = (path as { closed?: boolean } | undefined)?.closed === true;
  const frames = path?.computeFrenetFrames(steps, closed);
  if (path && (!frames || !samples || samples.length !== steps + 1 || frames.tangents.length !== steps + 1 || frames.normals.length !== steps + 1 || frames.binormals.length !== steps + 1)) throw new RangeError("Extrusion path did not provide a frame for each step.");
  if (frames && samples) for (let i = 0; i <= steps; i += 1) {
    const point = samples[i]!, tangent = frames.tangents[i]!, normal = frames.normals[i]!, binormal = frames.binormals[i]!;
    if (![point.x, point.y, point.z, tangent.x, tangent.y, tangent.z, normal.x, normal.y, normal.z, binormal.x, binormal.y, binormal.z].every(Number.isFinite) ||
        Math.hypot(tangent.x, tangent.y, tangent.z) === 0 || Math.hypot(normal.x, normal.y, normal.z) === 0 || Math.hypot(binormal.x, binormal.y, binormal.z) === 0) {
      throw new RangeError("Extrusion path requires finite positions and nonzero frame vectors.");
    }
  }

  const layers: Layer[] = [];
  const appendLayer = (step: number, shift: number, positionOffset: number): void => {
    const point = samples?.[step];
    const normal = frames?.normals[step], binormal = frames?.binormals[step], tangent = frames?.tangents[step];
    const points = vertices.map((p, i) => {
      const x = p.x + offsets[i]!.x * shift, y = p.y + offsets[i]!.y * shift;
      if (!point || !normal || !binormal || !tangent) return new Vector3(x, y, positionOffset);
      return new Vector3(
        point.x + normal.x * x + binormal.x * y + tangent.x * positionOffset,
        point.y + normal.y * x + binormal.y * y + tangent.y * positionOffset,
        point.z + normal.z * x + binormal.z * y + tangent.z * positionOffset
      );
    });
    layers.push({ points });
  };
  const segments = bevel ? bevelSegments : 0;
  const depthDirection = path || depth >= 0 ? 1 : -1;
  if (segments > 0) {
    for (let i = 0; i < segments; i += 1) {
      const angle = i / segments * Math.PI / 2;
      appendLayer(0, offset + size * Math.sin(angle), -depthDirection * thickness * Math.cos(angle));
    }
  }
  const bodyShift = bevel && segments > 0 ? offset + size : 0;
  for (let i = 0; i <= steps; i += 1) appendLayer(i, bodyShift, path ? 0 : depth * i / steps);
  if (segments > 0) {
    for (let i = segments - 1; i >= 0; i -= 1) {
      const angle = i / segments * Math.PI / 2;
      appendLayer(steps, offset + size * Math.sin(angle), path ? thickness * Math.cos(angle) : depth + depthDirection * thickness * Math.cos(angle));
    }
  }

  const positions: number[] = [], uvs: number[] = [];
  const emit = (a: Vector3, b: Vector3, c: Vector3, uvA: Point2, uvB: Point2, uvC: Point2): void => {
    const corners = depthDirection < 0 ? [a, c, b] : [a, b, c];
    const coordinates = depthDirection < 0 ? [uvA, uvC, uvB] : [uvA, uvB, uvC];
    for (const p of corners) positions.push(p.x, p.y, p.z);
    for (const uv of coordinates) uvs.push(uv.x, uv.y);
  };
  const capPoints = capRings.flat();
  const capUV = (point: Vector3, index: number): Point2 => path ? capPoints[index]! : { x: point.x, y: point.y };
  const bottom = layers[0]!.points, top = layers[layers.length - 1]!.points;
  for (const face of faceIndices) {
    const a = bottom[face[2]!]!, b = bottom[face[1]!]!, c = bottom[face[0]!]!;
    emit(a, b, c, capUV(a, face[2]!), capUV(b, face[1]!), capUV(c, face[0]!));
  }
  for (const face of faceIndices) {
    const a = top[face[0]!]!, b = top[face[1]!]!, c = top[face[2]!]!;
    emit(a, b, c, capUV(a, face[0]!), capUV(b, face[1]!), capUV(c, face[2]!));
  }
  const capCount = positions.length / 3;
  let base = 0;
  for (const ring of rings) {
    const distances = [0];
    for (let edge = 0; edge < ring.length; edge += 1) {
      const a = ring[edge]!, b = ring[(edge + 1) % ring.length]!;
      distances.push(distances[edge]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    for (let edge = 0; edge < ring.length; edge += 1) {
      const current = base + edge, next = base + (edge + 1) % ring.length;
      for (let layer = 0; layer < layers.length - 1; layer += 1) {
        const a = layers[layer]!.points[next]!, b = layers[layer]!.points[current]!;
        const c = layers[layer + 1]!.points[current]!, d = layers[layer + 1]!.points[next]!;
        const alongX = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y);
        const wallUV = (p: Vector3): Point2 => ({ x: alongX ? p.x : p.y, y: 1 - p.z });
        const u0 = distances[edge]!, u1 = distances[edge + 1]!;
        const v0 = layer / (layers.length - 1), v1 = (layer + 1) / (layers.length - 1);
        const uvA = path ? { x: u1, y: v0 } : wallUV(a);
        const uvB = path ? { x: u0, y: v0 } : wallUV(b);
        const uvC = path ? { x: u0, y: v1 } : wallUV(c);
        const uvD = path ? { x: u1, y: v1 } : wallUV(d);
        emit(a, b, c, uvA, uvB, uvC);
        emit(a, c, d, uvA, uvC, uvD);
      }
    }
    base += ring.length;
  }
  return {
    positions,
    normals: computeVertexNormals(positions),
    uvs,
    groups: [
      { start: 0, count: capCount, materialIndex: 0 },
      { start: capCount, count: positions.length / 3 - capCount, materialIndex: 1 }
    ]
  };
}
