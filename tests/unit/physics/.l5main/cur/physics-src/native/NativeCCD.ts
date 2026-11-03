import type { Collider } from "../Collider.js";
import type { Quat, RigidBody } from "../RigidBody.js";
import { Shape, addVec3, dotVec3, rotateVec3ByQuat, scaleVec3, subVec3, validateFiniteVec3, type BoxShape, type CapsuleShape, type ConvexHullShape, type PhysicsShape, type SphereShape, type Vec3 } from "../Shape.js";
import { nativeClosestTriangle, nativeConvexHullGeometry, nativeTriangleGeometry } from "./NativeQueries.js";
import { nativeLocalCenterOfMass } from "./NativeMassProperties.js";

/** A single known, linear trajectory over one common time interval. */
export interface NativeCCDMotion {
  readonly collider: Collider;
  readonly body: RigidBody;
  /** World-space translation over the interval, including for a moving target. */
  readonly displacement: Vec3;
  /** Nonzero only for spheres centered on the body's center of mass. */
  readonly angularDisplacement: Vec3;
}

export interface NativeCCDInterval {
  /** First contact, in [0, 1]. An initially intersecting pair starts at zero. */
  readonly fraction: number;
  /** Last contact within the interval, or undefined if contact continues past it. */
  readonly exitFraction: number | undefined;
  /** World witness at a finite exit; absent when contact continues past the step. */
  readonly exitNormal?: Vec3;
  readonly exitPoint?: Vec3;
  readonly initial: "separated" | "touching" | "penetrating";
  /** A tangential contact can be instantaneous or persist while surfaces slide. */
  readonly motion: "entering" | "separating" | "tangent" | "stationary";
  /** Unit normal directed from the first collider toward the second. */
  readonly normal: Vec3;
  /** A world-space witness at the reported time. */
  readonly point: Vec3;
}

export type NativeCCDResult =
  | { readonly kind: "separated" }
  | ({ readonly kind: "contact"; readonly intervals: readonly NativeCCDInterval[] } & NativeCCDInterval);

type Solid = SphereShape | BoxShape | CapsuleShape | ConvexHullShape;
type Plane = Extract<PhysicsShape, { kind: "plane" }>;
type Interval = { readonly enter: number; readonly exit: number };
type Frame = { readonly center: Vec3; readonly axes: readonly Vec3[]; readonly half: Vec3 };
type Witness = { readonly normal: Vec3; readonly point: Vec3 };
type IntervalData = { readonly interval: Interval; readonly initialGap: number; readonly scale: number; readonly witness?: (fraction: number) => Witness; readonly exitWitness?: ((fraction: number) => Witness) | undefined; readonly motionAt?: (fraction: number) => NativeCCDInterval["motion"] };

const BASES: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const MACHINE_TOLERANCE = 64 * Number.EPSILON;

/**
 * Contact intervals for linearly translated, fixed-orientation supported pairs.
 * Convex pairs have one interval; finite surfaces can produce several disjoint
 * intervals. Equal entry times use the first triangle's witness. The top-level
 * fields repeat the first interval for compatibility. No stepping is used.
 *
 * Angular motion is accepted only for a sphere centered on its body's center of
 * mass. Other unsupported pairs throw even when endpoints appear separated.
 * The caller must apply pair filters and supply the actual motions
 * after forces and constraints.
 * This function does not apply impulses, update sensors, or modify body state.
 */
export function nativeCastPair(first: NativeCCDMotion, second: NativeCCDMotion): NativeCCDResult {
  validateMotion(first);
  validateMotion(second);
  if (first.body.id === second.body.id || first.collider.id === second.collider.id) {
    throw new Error("Native CCD requires two distinct bodies and colliders.");
  }
  const a = first.collider.shape, b = second.collider.shape;
  if (!supported(a, b)) throw new Error(`Native CCD does not support '${a.kind}' against '${b.kind}'.`);

  let data: IntervalData | undefined, all: IntervalData[] | undefined;
  if (a.kind === "sphere" && b.kind === "sphere") data = sphereSphere(first, a, second, b);
  else if (a.kind === "sphere" && b.kind === "box") data = sphereBox(first, a, second, b);
  else if (a.kind === "box" && b.kind === "sphere") data = sphereBox(second, b, first, a);
  else if (a.kind === "box" && b.kind === "box") data = boxBox(first, a, second, b);
  else if (b.kind === "plane") data = solidPlane(first, a as Solid, second, b);
  else if (a.kind === "plane") data = solidPlane(second, b as Solid, first, a);
  else all = configurationIntervals(first, second);
  const candidates = (all ?? (data ? [data] : [])).filter((item) => item.interval.exit >= 0 && item.interval.enter <= 1)
    .sort((left, right) => left.interval.enter - right.interval.enter);
  const merged: IntervalData[] = [];
  for (const item of candidates) {
    const previous = merged[merged.length - 1];
    if (!previous || item.interval.enter > previous.interval.exit) merged.push(item);
    else if (item.interval.exit > previous.interval.exit) merged[merged.length - 1] = { ...previous, interval: { enter: previous.interval.enter, exit: item.interval.exit }, exitWitness: item.exitWitness ?? item.witness };
  }
  if (merged.length === 0) return { kind: "separated" };
  const relative = subVec3(second.displacement, first.displacement), relativeLength = Math.hypot(...relative);
  const intervals: NativeCCDInterval[] = merged.map((item) => {
    const fraction = Math.max(0, item.interval.enter);
    const tolerance = MACHINE_TOLERANCE * Math.max(item.scale, Number.MIN_VALUE);
    const initial = fraction > 0 ? "separated" : item.initialGap < -tolerance ? "penetrating" : "touching";
    const { normal, point } = item.witness ? item.witness(fraction) : contactWitness(first, second, fraction);
    const speed = dotVec3(relative, normal), speedTolerance = MACHINE_TOLERANCE * Math.max(relativeLength, Number.MIN_VALUE);
    let motion: NativeCCDInterval["motion"];
    if (relativeLength === 0) motion = "stationary";
    else if (item.motionAt && initial !== "penetrating") motion = item.motionAt(fraction);
    else if (a.kind === "box" && b.kind === "box" && initial !== "penetrating") motion = boxContactMotion(first, a, second, b, fraction);
    else motion = speed < -speedTolerance ? "entering" : speed > speedTolerance ? "separating" : "tangent";
    const exitFraction = item.interval.exit <= 1 ? Math.max(0, item.interval.exit) : undefined;
    const exitSource = item.exitWitness ?? item.witness;
    const exit = exitFraction === undefined ? undefined : exitSource ? exitSource(exitFraction) : contactWitness(first, second, exitFraction);
    return { fraction, exitFraction, initial, motion, normal, point, ...(exit ? { exitNormal: exit.normal, exitPoint: exit.point } : {}) };
  });
  return { kind: "contact", ...intervals[0]!, intervals };
}

function validateMotion(motion: NativeCCDMotion): void {
  if (motion.collider.bodyId !== motion.body.id) throw new Error("Native CCD collider does not belong to its body.");
  validateFiniteVec3(motion.body.position, "native CCD body position");
  validateFiniteVec3(motion.displacement, "native CCD displacement");
  validateFiniteVec3(motion.angularDisplacement, "native CCD angular displacement");
  if (motion.angularDisplacement.some((value) => value !== 0)) {
    if (motion.collider.shape.kind !== "sphere") throw new Error("Native CCD does not support angular displacement for this shape.");
    const center = nativeLocalCenterOfMass(motion.body);
    if (center.some((value) => value !== 0)) throw new Error("Native CCD does not support rotating a sphere with an offset center of mass.");
  }
  if (motion.body.rotation.length !== 4 || !motion.body.rotation.every(Number.isFinite)) throw new Error("Native CCD rotation must be finite.");
  const length = Math.hypot(...motion.body.rotation);
  if (!Number.isFinite(length) || length < 1e-9) throw new Error("Native CCD rotation must be non-zero.");
  Shape.validate(motion.collider.shape);
}

function supported(a: PhysicsShape, b: PhysicsShape): boolean {
  const solid = (shape: PhysicsShape) => shape.kind === "sphere" || shape.kind === "box" || shape.kind === "capsule" || shape.kind === "convex-hull";
  const finiteSurface = (shape: PhysicsShape) => shape.kind === "mesh" || shape.kind === "heightfield";
  return (solid(a) && (solid(b) || finiteSurface(b) || b.kind === "plane")) ||
    (solid(b) && (finiteSurface(a) || a.kind === "plane"));
}

function quaternion(body: RigidBody): Quat {
  const length = Math.hypot(...body.rotation);
  return [body.rotation[0] / length, body.rotation[1] / length, body.rotation[2] / length, body.rotation[3] / length];
}

function position(motion: NativeCCDMotion, fraction: number): Vec3 {
  const result = addVec3(motion.body.position, scaleVec3(motion.displacement, fraction));
  validateFiniteVec3(result, "native CCD evaluated position");
  return result;
}

function frame(motion: NativeCCDMotion, shape: BoxShape, fraction = 0): Frame {
  const q = quaternion(motion.body);
  return { center: position(motion, fraction), axes: BASES.map((axis) => rotateVec3ByQuat(axis, q)), half: shape.halfExtents };
}

function toLocal(value: Vec3, box: Frame): Vec3 {
  return [dotVec3(value, box.axes[0]!), dotVec3(value, box.axes[1]!), dotVec3(value, box.axes[2]!)];
}

function toWorld(value: Vec3, box: Frame): Vec3 {
  return addVec3(addVec3(scaleVec3(box.axes[0]!, value[0]), scaleVec3(box.axes[1]!, value[1])), scaleVec3(box.axes[2]!, value[2]));
}

function finite(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Native CCD exceeds its numeric range.");
}

/** Return the full real interval where a*t² + b*t + c <= 0. */
function quadratic(a: number, b: number, c: number): Interval | undefined {
  finite(a, b, c);
  if (a === 0) {
    if (b === 0) return c <= 0 ? { enter: -Infinity, exit: Infinity } : undefined;
    const root = -c / b;
    finite(root);
    return b > 0 ? { enter: -Infinity, exit: root } : { enter: root, exit: Infinity };
  }
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  const aa = a / scale, bb = b / scale, cc = c / scale;
  let discriminant = bb * bb - 4 * aa * cc;
  const error = MACHINE_TOLERANCE * (bb * bb + Math.abs(4 * aa * cc));
  if (discriminant < -error) return undefined;
  discriminant = Math.max(0, discriminant);
  const root = Math.sqrt(discriminant);
  const q = -0.5 * (bb + (bb < 0 ? -root : root));
  const one = q === 0 ? -bb / (2 * aa) : q / aa;
  const two = q === 0 ? one : cc / q;
  finite(one, two);
  return { enter: Math.min(one, two), exit: Math.max(one, two) };
}

type IndexedTriangle = readonly [number, number, number];
type CorePiece = { readonly vertices: readonly Vec3[]; readonly radius: number };
type Configuration = {
  readonly vertices: readonly Vec3[];
  readonly firstVertices: readonly Vec3[];
  readonly secondVertices: readonly Vec3[];
  readonly dimension: 0 | 1 | 2 | 3;
  readonly faces: readonly IndexedTriangle[];
  readonly edges: readonly (readonly [number, number])[];
};

function corePieces(motion: NativeCCDMotion): readonly CorePiece[] {
  const shape = motion.collider.shape, q = quaternion(motion.body);
  const rotate = (p: Vec3) => rotateVec3ByQuat(p, q);
  if (shape.kind === "sphere") return [{ vertices: [[0, 0, 0]], radius: shape.radius }];
  if (shape.kind === "capsule") return [{ vertices: [rotate([0, -shape.halfHeight, 0]), rotate([0, shape.halfHeight, 0])], radius: shape.radius }];
  if (shape.kind === "box") {
    const vertices: Vec3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push(rotate([x * shape.halfExtents[0], y * shape.halfExtents[1], z * shape.halfExtents[2]]));
    return [{ vertices, radius: 0 }];
  }
  if (shape.kind === "convex-hull") return [{ vertices: shape.vertices.map(rotate), radius: 0 }];
  if (shape.kind === "mesh" || shape.kind === "heightfield") return nativeTriangleGeometry(shape).map((triangle) => ({ vertices: triangle.map(rotate), radius: 0 }));
  throw new Error(`Native CCD does not support core geometry for '${shape.kind}'.`);
}

function configuration(first: CorePiece, second: CorePiece): Configuration {
  const vertices: Vec3[] = [], firstVertices: Vec3[] = [], secondVertices: Vec3[] = [];
  for (const a of first.vertices) for (const b of second.vertices) {
    vertices.push(subVec3(b, a)); firstVertices.push(a); secondVertices.push(b);
  }
  const base = vertices[0]!;
  let farthest = 0, squared = 0, scale = 0;
  for (let i = 0; i < vertices.length; i++) {
    const delta = subVec3(vertices[i]!, base), distance = dotVec3(delta, delta);
    finite(distance);
    if (distance > squared) { squared = distance; farthest = i; }
    scale = Math.max(scale, Math.hypot(...vertices[i]!));
  }
  const tolerance = 8 * Number.EPSILON * Math.max(scale, Number.MIN_VALUE);
  if (squared <= tolerance * tolerance) {
    if (first.vertices.length !== 1 || second.vertices.length !== 1) throw new Error("Native CCD cannot resolve a configuration at this numeric scale.");
    return { vertices, firstVertices, secondVertices, dimension: 0, faces: [], edges: [] };
  }
  const axis = scaleVec3(subVec3(vertices[farthest]!, base), 1 / Math.sqrt(squared));
  let widest = -1, width = 0;
  for (let i = 0; i < vertices.length; i++) {
    const area = Math.hypot(...cross(axis, subVec3(vertices[i]!, base)));
    if (area > width) { width = area; widest = i; }
  }
  if (width <= tolerance) {
    let lo = 0, hi = 0, low = 0, high = 0;
    for (let i = 1; i < vertices.length; i++) {
      const value = dotVec3(axis, subVec3(vertices[i]!, base));
      if (value < low) { low = value; lo = i; }
      if (value > high) { high = value; hi = i; }
    }
    return { vertices, firstVertices, secondVertices, dimension: 1, faces: [], edges: [[lo, hi]] };
  }
  const normal = normalize(cross(axis, subVec3(vertices[widest]!, base))), transverse = cross(normal, axis);
  let depth = 0;
  for (const vertex of vertices) depth = Math.max(depth, Math.abs(dotVec3(normal, subVec3(vertex, base))));
  if (depth <= tolerance) {
    const projected = vertices.map((p, index) => ({ x: dotVec3(subVec3(p, base), axis), y: dotVec3(subVec3(p, base), transverse), index }))
      .sort((a, b) => a.x - b.x || a.y - b.y || a.index - b.index)
      .filter((point, index, all) => index === 0 || point.x !== all[index - 1]!.x || point.y !== all[index - 1]!.y);
    const turn = (a: typeof projected[number], b: typeof projected[number], c: typeof projected[number]) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const lower: typeof projected = [], upper: typeof projected = [];
    for (const point of projected) { while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop(); lower.push(point); }
    for (const point of [...projected].reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop(); upper.push(point); }
    const polygon = [...lower.slice(0, -1), ...upper.slice(0, -1)].map((p) => p.index);
    if (polygon.length < 3) throw new Error("Native CCD could not establish a planar configuration hull.");
    const faces: IndexedTriangle[] = [], edges: (readonly [number, number])[] = [];
    for (let i = 1; i + 1 < polygon.length; i++) faces.push([polygon[0]!, polygon[i]!, polygon[i + 1]!]);
    for (let i = 0; i < polygon.length; i++) edges.push([polygon[i]!, polygon[(i + 1) % polygon.length]!]);
    return { vertices, firstVertices, secondVertices, dimension: 2, faces, edges };
  }
  const hull = nativeConvexHullGeometry({ kind: "convex-hull", vertices, indices: [] });
  // The shared query hull uses a looser construction tolerance. Do not let it
  // silently omit a configuration vertex that matters to CCD timing.
  for (const vertex of vertices) for (const face of hull.faces) {
    if (dotVec3(face.normal, vertex) - face.constant > 256 * Number.EPSILON * scale) {
      throw new Error("Native CCD configuration hull is too ill-conditioned for exact intervals.");
    }
  }
  const edges = new Map<string, readonly [number, number]>(), faces: IndexedTriangle[] = [];
  for (const face of hull.faces) {
    faces.push([face.a, face.b, face.c]);
    for (const [a, b] of [[face.a, face.b], [face.b, face.c], [face.c, face.a]] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edges.has(key)) edges.set(key, [a, b]);
    }
  }
  return { vertices, firstVertices, secondVertices, dimension: 3, faces, edges: [...edges.values()] };
}

function intersection(a: Interval | undefined, b: Interval | undefined): Interval | undefined {
  if (!a || !b) return undefined;
  const enter = Math.max(a.enter, b.enter), exit = Math.min(a.exit, b.exit);
  return enter <= exit ? { enter, exit } : undefined;
}

function slab(value: number, speed: number, low: number, high: number): Interval | undefined {
  finite(value, speed);
  if (speed === 0) return value >= low && value <= high ? { enter: -Infinity, exit: Infinity } : undefined;
  const first = (low - value) / speed, second = (high - value) / speed;
  return { enter: Math.min(first, second), exit: Math.max(first, second) };
}

function lineSphere(origin: Vec3, velocity: Vec3, center: Vec3, radius: number): Interval | undefined {
  const offset = subVec3(origin, center);
  return quadratic(dotVec3(velocity, velocity), 2 * dotVec3(offset, velocity), dotVec3(offset, offset) - radius * radius);
}

function lineCapsule(origin: Vec3, velocity: Vec3, a: Vec3, b: Vec3, radius: number): Interval | undefined {
  const edge = subVec3(b, a), squared = dotVec3(edge, edge);
  if (squared === 0) return lineSphere(origin, velocity, a, radius);
  const offset = subVec3(origin, a), start = dotVec3(offset, edge) / squared, speed = dotVec3(velocity, edge) / squared;
  const perpendicular = subVec3(offset, scaleVec3(edge, start)), perpendicularVelocity = subVec3(velocity, scaleVec3(edge, speed));
  const cylinder = intersection(slab(start, speed, 0, 1), quadratic(dotVec3(perpendicularVelocity, perpendicularVelocity), 2 * dotVec3(perpendicular, perpendicularVelocity), dotVec3(perpendicular, perpendicular) - radius * radius));
  const parts = [cylinder, lineSphere(origin, velocity, a, radius), lineSphere(origin, velocity, b, radius)].filter((value): value is Interval => value !== undefined);
  return parts.length ? { enter: Math.min(...parts.map((part) => part.enter)), exit: Math.max(...parts.map((part) => part.exit)) } : undefined;
}

/** Intersect the line with the triangle extruded by radius along its normal. */
function lineTrianglePrism(origin: Vec3, velocity: Vec3, triangle: readonly [Vec3, Vec3, Vec3], radius: number): Interval | undefined {
  const raw = cross(subVec3(triangle[1], triangle[0]), subVec3(triangle[2], triangle[0])), magnitude = Math.hypot(...raw);
  if (magnitude === 0) throw new Error("Native CCD has a degenerate configuration face.");
  const normal = scaleVec3(raw, 1 / magnitude);
  let result = slab(dotVec3(normal, subVec3(origin, triangle[0])), dotVec3(normal, velocity), -radius, radius);
  for (let i = 0; i < 3 && result; i++) {
    const start = triangle[i]!, end = triangle[(i + 1) % 3]!, inward = cross(normal, subVec3(end, start));
    result = intersection(result, slab(dotVec3(inward, subVec3(origin, start)), dotVec3(inward, velocity), 0, Infinity));
  }
  return result;
}

function lineConfiguration(origin: Vec3, velocity: Vec3, config: Configuration, radius: number): Interval | undefined {
  if (config.dimension === 0) return lineSphere(origin, velocity, config.vertices[0]!, radius);
  if (config.dimension === 1) {
    const [a, b] = config.edges[0]!;
    return lineCapsule(origin, velocity, config.vertices[a]!, config.vertices[b]!, radius);
  }
  const parts: Interval[] = [];
  if (config.dimension === 3) {
    let inside: Interval | undefined = { enter: -Infinity, exit: Infinity };
    for (const [i, j, k] of config.faces) {
      const a = config.vertices[i]!, normal = normalize(cross(subVec3(config.vertices[j]!, a), subVec3(config.vertices[k]!, a)));
      inside = intersection(inside, slab(dotVec3(normal, subVec3(origin, a)), dotVec3(normal, velocity), -Infinity, 0));
      if (!inside) break;
    }
    if (inside) parts.push(inside);
  }
  for (const [i, j, k] of config.faces) {
    const interval = lineTrianglePrism(origin, velocity, [config.vertices[i]!, config.vertices[j]!, config.vertices[k]!], radius);
    if (interval) parts.push(interval);
  }
  for (const [i, j] of config.edges) {
    const interval = lineCapsule(origin, velocity, config.vertices[i]!, config.vertices[j]!, radius);
    if (interval) parts.push(interval);
  }
  if (parts.length === 0) return undefined;
  // Every part lies in the radius-neighborhood of the same convex core. Its
  // intersection with a line is one interval, including exact grazing touches.
  let enter = Infinity, exit = -Infinity;
  for (const part of parts) { enter = Math.min(enter, part.enter); exit = Math.max(exit, part.exit); }
  return { enter, exit };
}

type ClosestCore = { readonly point: Vec3; readonly indices: readonly number[]; readonly weights: readonly number[]; readonly inside: boolean; readonly faceNormal?: Vec3; readonly signed: number };

function closestCore(point: Vec3, config: Configuration): ClosestCore {
  if (config.dimension === 0) return { point: config.vertices[0]!, indices: [0], weights: [1], inside: false, signed: Math.hypot(...subVec3(point, config.vertices[0]!)) };
  if (config.dimension === 1) {
    const [i, j] = config.edges[0]!, a = config.vertices[i]!, edge = subVec3(config.vertices[j]!, a);
    const fraction = Math.max(0, Math.min(1, dotVec3(subVec3(point, a), edge) / dotVec3(edge, edge)));
    const closest = addVec3(a, scaleVec3(edge, fraction));
    return { point: closest, indices: [i, j], weights: [1 - fraction, fraction], inside: false, signed: Math.hypot(...subVec3(point, closest)) };
  }
  let bestDistance = Infinity, bestFace: IndexedTriangle | undefined, bestPoint: Vec3 | undefined, bestNormal: Vec3 | undefined, maxSigned = -Infinity;
  for (const face of config.faces) {
    const a = config.vertices[face[0]]!, b = config.vertices[face[1]]!, c = config.vertices[face[2]]!;
    const normal = normalize(cross(subVec3(b, a), subVec3(c, a)));
    maxSigned = Math.max(maxSigned, dotVec3(normal, subVec3(point, a)));
    const closest = nativeClosestTriangle(point, [a, b, c]), distance = Math.hypot(...subVec3(point, closest));
    if (distance < bestDistance) { bestDistance = distance; bestFace = face; bestPoint = closest; bestNormal = normal; }
  }
  if (!bestFace || !bestPoint || !bestNormal) throw new Error("Native CCD configuration has no usable faces.");
  const a = config.vertices[bestFace[0]]!, ab = subVec3(config.vertices[bestFace[1]]!, a), ac = subVec3(config.vertices[bestFace[2]]!, a), ap = subVec3(bestPoint, a);
  const aa = dotVec3(ab, ab), bb = dotVec3(ac, ac), abac = dotVec3(ab, ac), denominator = aa * bb - abac * abac;
  if (!(denominator > 16 * Number.EPSILON * aa * bb)) throw new Error("Native CCD cannot determine stable contact coordinates.");
  const u = (bb * dotVec3(ap, ab) - abac * dotVec3(ap, ac)) / denominator;
  const v = (aa * dotVec3(ap, ac) - abac * dotVec3(ap, ab)) / denominator;
  const inside = config.dimension === 3 && maxSigned <= 0;
  return { point: bestPoint, indices: bestFace, weights: [1 - u - v, u, v], inside, faceNormal: bestNormal, signed: inside ? maxSigned : bestDistance };
}

function weightedSource(vertices: readonly Vec3[], indices: readonly number[], weights: readonly number[]): Vec3 {
  return indices.reduce((sum, index, i) => addVec3(sum, scaleVec3(vertices[index]!, weights[i]!)), [0, 0, 0] as Vec3);
}

function configurationMotion(config: Configuration, point: Vec3, velocity: Vec3): NativeCCDInterval["motion"] {
  const speedTolerance = MACHINE_TOLERANCE * Math.max(Math.hypot(...velocity), Number.MIN_VALUE);
  let touching = 0, entering = 0;
  for (const [i, j, k] of config.faces) {
    const a = config.vertices[i]!, normal = normalize(cross(subVec3(config.vertices[j]!, a), subVec3(config.vertices[k]!, a)));
    const signed = dotVec3(normal, subVec3(point, a));
    const tolerance = MACHINE_TOLERANCE * Math.max(Math.hypot(...point), Math.hypot(...a), Number.MIN_VALUE);
    if (Math.abs(signed) > tolerance) continue;
    touching++;
    const speed = dotVec3(normal, velocity);
    if (speed > speedTolerance) return "separating";
    if (speed < -speedTolerance) entering++;
  }
  return touching > 0 && entering === touching ? "entering" : "tangent";
}

function configurationIntervals(first: NativeCCDMotion, second: NativeCCDMotion): IntervalData[] {
  const origin = subVec3(first.body.position, second.body.position), velocity = subVec3(first.displacement, second.displacement);
  const result: IntervalData[] = [];
  for (const a of corePieces(first)) for (const b of corePieces(second)) {
    const config = configuration(a, b), radius = a.radius + b.radius, interval = lineConfiguration(origin, velocity, config, radius);
    if (!interval || interval.exit < 0 || interval.enter > 1) continue;
    const initialCore = closestCore(origin, config), initialGap = initialCore.signed - radius;
    let scale = Math.max(radius, Math.hypot(...origin), Number.MIN_VALUE);
    for (const vertex of config.vertices) scale = Math.max(scale, Math.hypot(...vertex));
    const witness = (fraction: number): Witness => {
      const center = addVec3(origin, scaleVec3(velocity, fraction)), closest = closestCore(center, config), separation = subVec3(center, closest.point), magnitude = Math.hypot(...separation);
      let normal: Vec3;
      if (closest.inside) normal = scaleVec3(closest.faceNormal!, -1);
      else if (magnitude > 0) normal = scaleVec3(separation, -1 / magnitude);
      else throw new Error("Native CCD cannot determine a unique contact normal for overlapping cores.");
      const localA = weightedSource(config.firstVertices, closest.indices, closest.weights), localB = weightedSource(config.secondVertices, closest.indices, closest.weights);
      const pointA = addVec3(addVec3(position(first, fraction), localA), scaleVec3(normal, a.radius));
      const pointB = subVec3(addVec3(position(second, fraction), localB), scaleVec3(normal, b.radius));
      return { normal, point: scaleVec3(addVec3(pointA, pointB), 0.5) };
    };
    result.push({ interval, initialGap, scale, witness, ...(radius === 0 && config.dimension === 3 ? { motionAt: (fraction: number) => configurationMotion(config, addVec3(origin, scaleVec3(velocity, fraction)), velocity) } : {}) });
  }
  return result;
}

function sphereSphere(a: NativeCCDMotion, shapeA: SphereShape, b: NativeCCDMotion, shapeB: SphereShape): IntervalData | undefined {
  const offset = subVec3(b.body.position, a.body.position), velocity = subVec3(b.displacement, a.displacement);
  const radius = shapeA.radius + shapeB.radius;
  const distance = Math.hypot(...offset);
  const interval = quadratic(dotVec3(velocity, velocity), 2 * dotVec3(offset, velocity), dotVec3(offset, offset) - radius * radius);
  return interval ? { interval, initialGap: distance - radius, scale: radius + distance } : undefined;
}

/** Distance to a fixed oriented box is piecewise quadratic along a line. */
function sphereBox(sphere: NativeCCDMotion, sphereShape: SphereShape, box: NativeCCDMotion, boxShape: BoxShape): IntervalData | undefined {
  const boxFrame = frame(box, boxShape);
  const origin = toLocal(subVec3(sphere.body.position, box.body.position), boxFrame);
  const velocity = toLocal(subVec3(sphere.displacement, box.displacement), boxFrame);
  const breaks = [0, 1];
  for (let axis = 0; axis < 3; axis++) {
    if (velocity[axis] === 0) continue;
    for (const side of [-boxShape.halfExtents[axis]!, boxShape.halfExtents[axis]!]) {
      const crossing = (side - origin[axis]!) / velocity[axis]!;
      if (crossing > 0 && crossing < 1) breaks.push(crossing);
    }
  }
  breaks.sort((a, b) => a - b);
  let enter = Infinity, exit = -Infinity;
  for (let i = 0; i < breaks.length - 1; i++) {
    const lo = breaks[i]!, hi = breaks[i + 1]!, middle = lo + (hi - lo) * 0.5;
    let qa = 0, qb = 0, qc = -(sphereShape.radius ** 2);
    for (let axis = 0; axis < 3; axis++) {
      const value = origin[axis]! + velocity[axis]! * middle, half = boxShape.halfExtents[axis]!;
      if (value >= -half && value <= half) continue;
      const offset = origin[axis]! - (value < 0 ? -half : half), v = velocity[axis]!;
      qa += v * v; qb += 2 * offset * v; qc += offset * offset;
    }
    const interval = quadratic(qa, qb, qc);
    if (!interval) continue;
    const begin = Math.max(lo, interval.enter), end = Math.min(hi, interval.exit);
    if (begin <= end) { enter = Math.min(enter, begin); exit = Math.max(exit, end); }
  }
  if (enter === Infinity) return undefined;
  const closest: Vec3 = origin.map((value, axis) => Math.max(-boxShape.halfExtents[axis]!, Math.min(boxShape.halfExtents[axis]!, value))) as unknown as Vec3;
  const distance = Math.hypot(...subVec3(origin, closest));
  // A closed overlap at t=1 remains active, unless the pair is exactly exiting
  // there. Determine the endpoint direction from the actual closest point.
  if (exit === 1) {
    const end: Vec3 = addVec3(origin, velocity);
    const nearest: Vec3 = end.map((value, axis) => Math.max(-boxShape.halfExtents[axis]!, Math.min(boxShape.halfExtents[axis]!, value))) as unknown as Vec3;
    const offset = subVec3(end, nearest), endGap = Math.hypot(...offset) - sphereShape.radius;
    const direction = dotVec3(offset, velocity);
    const tolerance = MACHINE_TOLERANCE * Math.max(sphereShape.radius, Math.hypot(...offset), Number.MIN_VALUE);
    if (endGap < -tolerance || direction < 0 || (direction === 0 && enter < 1)) exit = Infinity;
  }
  return { interval: { enter, exit }, initialGap: distance - sphereShape.radius, scale: sphereShape.radius + distance };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function boxAxes(a: Frame, b: Frame): Vec3[] {
  const axes = [...a.axes, ...b.axes];
  for (const one of a.axes) for (const two of b.axes) {
    const value = cross(one, two), length = Math.hypot(...value);
    if (length > 1e-12) axes.push(scaleVec3(value, 1 / length));
  }
  return axes;
}

function projectedRadius(box: Frame, axis: Vec3): number {
  return box.axes.reduce((sum, basis, index) => sum + box.half[index]! * Math.abs(dotVec3(basis, axis)), 0);
}

function boxBox(a: NativeCCDMotion, shapeA: BoxShape, b: NativeCCDMotion, shapeB: BoxShape): IntervalData | undefined {
  const fa = frame(a, shapeA), fb = frame(b, shapeB), offset = subVec3(fb.center, fa.center), velocity = subVec3(b.displacement, a.displacement);
  let enter = -Infinity, exit = Infinity, gap = -Infinity, scale = 0;
  for (const axis of boxAxes(fa, fb)) {
    const radius = projectedRadius(fa, axis) + projectedRadius(fb, axis);
    const center = dotVec3(offset, axis), speed = dotVec3(velocity, axis);
    finite(radius, center, speed);
    gap = Math.max(gap, Math.abs(center) - radius);
    scale = Math.max(scale, radius, Math.abs(center));
    if (speed === 0) { if (Math.abs(center) > radius) return undefined; continue; }
    const first = (-radius - center) / speed, last = (radius - center) / speed;
    finite(first, last);
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return undefined;
  }
  return { interval: { enter, exit }, initialGap: gap, scale };
}

function solidPlane(solid: NativeCCDMotion, shape: Solid, plane: NativeCCDMotion, planeShape: Plane): IntervalData | undefined {
  const normal = rotateVec3ByQuat(planeShape.normal, quaternion(plane.body));
  let minimum: number;
  if (shape.kind === "sphere") minimum = -shape.radius;
  else if (shape.kind === "capsule") minimum = -shape.radius - shape.halfHeight * Math.abs(dotVec3(normal, rotateVec3ByQuat([0, 1, 0], quaternion(solid.body))));
  else if (shape.kind === "box") minimum = -projectedRadius(frame(solid, shape), normal);
  else {
    const q = quaternion(solid.body);
    minimum = Infinity;
    for (const vertex of shape.vertices) minimum = Math.min(minimum, dotVec3(normal, rotateVec3ByQuat(vertex, q)));
  }
  const gap = dotVec3(normal, subVec3(solid.body.position, plane.body.position)) - planeShape.constant + minimum;
  const speed = dotVec3(normal, subVec3(solid.displacement, plane.displacement));
  const interval = quadratic(0, speed, gap);
  return interval ? { interval, initialGap: gap, scale: Math.abs(gap) + Math.abs(minimum) } : undefined;
}

function normalize(value: Vec3, fallback: Vec3 = [1, 0, 0]): Vec3 {
  const length = Math.hypot(...value);
  finite(length);
  return length > 0 ? scaleVec3(value, 1 / length) : fallback;
}

function contactWitness(a: NativeCCDMotion, b: NativeCCDMotion, t: number): { normal: Vec3; point: Vec3 } {
  const first = a.collider.shape, second = b.collider.shape;
  if (first.kind === "sphere" && second.kind === "sphere") {
    const pa = position(a, t), pb = position(b, t), normal = normalize(subVec3(pb, pa));
    const fromA = addVec3(pa, scaleVec3(normal, first.radius)), fromB = subVec3(pb, scaleVec3(normal, second.radius));
    return { normal, point: scaleVec3(addVec3(fromA, fromB), 0.5) };
  }
  if (first.kind === "sphere" && second.kind === "box") return sphereBoxWitness(a, first, b, second, t);
  if (first.kind === "box" && second.kind === "sphere") {
    const result = sphereBoxWitness(b, second, a, first, t);
    return { normal: scaleVec3(result.normal, -1), point: result.point };
  }
  if (first.kind === "box" && second.kind === "box") return boxBoxWitness(a, first, b, second, t);
  if (second.kind === "plane") return planeWitness(a, first as Solid, b, second, t);
  const result = planeWitness(b, second as Solid, a, first as Plane, t);
  return { normal: scaleVec3(result.normal, -1), point: result.point };
}

function sphereBoxWitness(sphere: NativeCCDMotion, shape: SphereShape, box: NativeCCDMotion, boxShape: BoxShape, t: number): { normal: Vec3; point: Vec3 } {
  const f = frame(box, boxShape, t), center = position(sphere, t), local = toLocal(subVec3(center, f.center), f);
  const closest: [number, number, number] = local.map((value, axis) => Math.max(-f.half[axis]!, Math.min(f.half[axis]!, value))) as [number, number, number];
  let direction = subVec3(closest, local);
  if (Math.hypot(...direction) === 0) {
    let index = 0;
    for (let axis = 1; axis < 3; axis++) if (f.half[axis]! - Math.abs(local[axis]!) < f.half[index]! - Math.abs(local[index]!)) index = axis;
    const sign = local[index]! < 0 ? -1 : 1;
    closest[index] = sign * f.half[index]!;
    const toward: [number, number, number] = [0, 0, 0];
    toward[index] = -sign;
    direction = toward;
  }
  const normal = normalize(toWorld(direction, f));
  const spherePoint = addVec3(center, scaleVec3(normal, shape.radius)), boxPoint = addVec3(f.center, toWorld(closest, f));
  return { normal, point: scaleVec3(addVec3(spherePoint, boxPoint), 0.5) };
}

function planeWitness(solid: NativeCCDMotion, shape: Solid, plane: NativeCCDMotion, planeShape: Plane, t: number): { normal: Vec3; point: Vec3 } {
  const n = rotateVec3ByQuat(planeShape.normal, quaternion(plane.body)), center = position(solid, t), planeCenter = position(plane, t);
  let support: Vec3;
  if (shape.kind === "sphere") support = subVec3(center, scaleVec3(n, shape.radius));
  else if (shape.kind === "capsule") {
    const axis = rotateVec3ByQuat([0, 1, 0], quaternion(solid.body)), projection = dotVec3(n, axis);
    support = subVec3(subVec3(center, scaleVec3(n, shape.radius)), scaleVec3(axis, Math.sign(projection) * shape.halfHeight));
  } else if (shape.kind === "convex-hull") {
    const q = quaternion(solid.body);
    let best: Vec3 | undefined, projection = Infinity;
    for (const vertex of shape.vertices) {
      const rotated = rotateVec3ByQuat(vertex, q), value = dotVec3(n, rotated);
      if (value < projection) { projection = value; best = rotated; }
    }
    if (!best) throw new Error("Native CCD convex hull has no support vertex.");
    support = addVec3(center, best);
  } else {
    const f = frame(solid, shape, t);
    support = f.axes.reduce((point, axis, index) => {
      const projection = dotVec3(axis, n);
      return addVec3(point, scaleVec3(axis, projection > 0 ? -f.half[index]! : projection < 0 ? f.half[index]! : 0));
    }, center);
  }
  const gap = dotVec3(n, subVec3(support, planeCenter)) - planeShape.constant;
  return { normal: scaleVec3(n, -1), point: subVec3(support, scaleVec3(n, gap * 0.5)) };
}

function boxContactMotion(a: NativeCCDMotion, shapeA: BoxShape, b: NativeCCDMotion, shapeB: BoxShape, t: number): "entering" | "separating" | "tangent" {
  const fa = frame(a, shapeA, t), fb = frame(b, shapeB, t), offset = subVec3(fb.center, fa.center), velocity = subVec3(b.displacement, a.displacement);
  let touching = 0, entering = 0;
  for (const axis of boxAxes(fa, fb)) {
    const radius = projectedRadius(fa, axis) + projectedRadius(fb, axis), center = dotVec3(offset, axis);
    const tolerance = MACHINE_TOLERANCE * Math.max(radius, Math.abs(center), Number.MIN_VALUE);
    if (Math.abs(Math.abs(center) - radius) > tolerance) continue;
    touching++;
    const rate = Math.sign(center) * dotVec3(velocity, axis);
    const speedTolerance = MACHINE_TOLERANCE * Math.max(Math.hypot(...velocity), Number.MIN_VALUE);
    if (rate > speedTolerance) return "separating";
    if (rate < -speedTolerance) entering++;
  }
  return touching > 0 && entering === touching ? "entering" : "tangent";
}

function boxBoxWitness(a: NativeCCDMotion, shapeA: BoxShape, b: NativeCCDMotion, shapeB: BoxShape, t: number): { normal: Vec3; point: Vec3 } {
  const fa = frame(a, shapeA, t), fb = frame(b, shapeB, t), offset = subVec3(fb.center, fa.center);
  let best = Infinity, normal: Vec3 = [1, 0, 0];
  for (const axis of boxAxes(fa, fb)) {
    const projection = dotVec3(offset, axis), depth = projectedRadius(fa, axis) + projectedRadius(fb, axis) - Math.abs(projection);
    if (depth < best) { best = depth; normal = scaleVec3(axis, projection < 0 ? -1 : 1); }
  }
  const points = [...insideVertices(fa, fb), ...insideVertices(fb, fa), ...edgeIntersections(fa, fb), ...edgeIntersections(fb, fa)];
  if (points.length === 0) throw new Error("Native CCD could not establish a box contact witness.");
  return { normal, point: scaleVec3(points.reduce((sum, point) => addVec3(sum, point), [0, 0, 0] as Vec3), 1 / points.length) };
}

function vertices(box: Frame): Vec3[] {
  return [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) =>
    addVec3(box.center, toWorld([x * box.half[0], y * box.half[1], z * box.half[2]], box)))));
}

function insideVertices(source: Frame, target: Frame): Vec3[] {
  const tolerance = MACHINE_TOLERANCE * Math.max(...source.half, ...target.half, Math.hypot(...subVec3(source.center, target.center)));
  return vertices(source).filter((point) => {
    const local = toLocal(subVec3(point, target.center), target);
    return local.every((value, axis) => Math.abs(value) <= target.half[axis]! + tolerance);
  });
}

function edgeIntersections(source: Frame, target: Frame): Vec3[] {
  const points = vertices(source), result: Vec3[] = [];
  const tolerance = MACHINE_TOLERANCE * Math.max(...source.half, ...target.half, Math.hypot(...subVec3(source.center, target.center)));
  for (let index = 0; index < points.length; index++) for (const bit of [1, 2, 4]) {
    const other = index ^ bit;
    if (other < index) continue;
    const start = points[index]!, delta = subVec3(points[other]!, start);
    const local = toLocal(subVec3(start, target.center), target), velocity = toLocal(delta, target);
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 3; axis++) {
      const half = target.half[axis]! + tolerance, p = local[axis]!, v = velocity[axis]!;
      if (v === 0) { if (Math.abs(p) > half) { lo = 1; hi = 0; break; } continue; }
      const first = (-half - p) / v, last = (half - p) / v;
      lo = Math.max(lo, Math.min(first, last)); hi = Math.min(hi, Math.max(first, last));
      if (lo > hi) break;
    }
    if (lo <= hi) {
      result.push(addVec3(start, scaleVec3(delta, lo)));
      if (hi > lo) result.push(addVec3(start, scaleVec3(delta, hi)));
    }
  }
  return result;
}
