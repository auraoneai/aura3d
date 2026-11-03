import type { RigidBody } from "../RigidBody.js";
import { rotateVec3ByQuat, Shape, validateFiniteVec3, type PhysicsShape, type Vec3 } from "../Shape.js";

/** Local-space symmetric tensor represented by rows. */
export type NativeMassTensor = readonly [Vec3, Vec3, Vec3];

export interface NativeMassProperties {
  readonly mass: number;
  readonly volume: number;
  readonly center: Vec3;
  /** Moment of inertia about center, in collider-local axes. */
  readonly inertia: NativeMassTensor;
  /** Zero for the no-collider locked-rotation case. */
  readonly inverseInertia: NativeMassTensor;
}

type Matrix = [[number, number, number], [number, number, number], [number, number, number]];
type V = [number, number, number];
type Part = { volume: number; center: Vec3; inertia: Matrix };
const zero = (): Matrix => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const add = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (v: Vec3, n: number): V => [v[0] * n, v[1] * n, v[2] * n];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: Vec3): number => Math.hypot(...v);
const registeredMass = new WeakMap<RigidBody, NativeMassProperties>();

/** Associate native-only mass state with a body without changing the public body class. */
export function setNativeMassProperties(body: RigidBody, properties: NativeMassProperties): void {
  if (body.type !== "dynamic") throw new Error("Native mass properties require a dynamic body.");
  if (properties.mass !== body.mass) throw new Error("Native mass properties must match body mass.");
  registeredMass.set(body, properties);
}

export function nativeLocalCenterOfMass(body: RigidBody): Vec3 {
  return registeredMass.get(body)?.center ?? [0, 0, 0];
}

export function nativeCenterOfMass(body: RigidBody): Vec3 {
  return add(body.position, rotateVec3ByQuat(nativeLocalCenterOfMass(body), body.rotation));
}

/** Multiply by the full local tensor after rotating to and from world space. */
export function nativeInverseInertia(body: RigidBody, vector: Vec3): Vec3 {
  validateFiniteVec3(vector, "native inverse inertia input");
  if (body.type !== "dynamic") return [0, 0, 0];
  const properties = registeredMass.get(body);
  return properties ? rotateTensorProduct(properties.inverseInertia, body, vector) : body.multiplyInverseInertiaWorld(vector);
}

export function nativeInertia(body: RigidBody, vector: Vec3): Vec3 {
  validateFiniteVec3(vector, "native inertia input");
  if (body.type !== "dynamic") return [0, 0, 0];
  const properties = registeredMass.get(body);
  if (properties) return rotateTensorProduct(properties.inertia, body, vector);
  if (body.inverseInertia.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Native body inverse inertia must be finite and positive.");
  const tensor: NativeMassTensor = [[1 / body.inverseInertia[0], 0, 0], [0, 1 / body.inverseInertia[1], 0], [0, 0, 1 / body.inverseInertia[2]]];
  return rotateTensorProduct(tensor, body, vector);
}

export function nativeApplyAngularImpulse(body: RigidBody, impulse: Vec3): void {
  validateFiniteVec3(impulse, "native angular impulse");
  if (body.type !== "dynamic") return;
  const angularVelocity = add(body.angularVelocity, nativeInverseInertia(body, impulse));
  validateFiniteVec3(angularVelocity, "native angular impulse result");
  body.angularVelocity = angularVelocity;
  body.velocityOverridden = true;
  body.wake();
}

export function nativeApplyImpulseAtPoint(body: RigidBody, impulse: Vec3, point: Vec3): void {
  validateFiniteVec3(impulse, "native impulse");
  validateFiniteVec3(point, "native impulse point");
  if (body.type !== "dynamic") return;
  const velocity = add(body.velocity, mul(impulse, body.inverseMass));
  const angularVelocity = add(body.angularVelocity, nativeInverseInertia(body, cross(sub(point, nativeCenterOfMass(body)), impulse)));
  validateFiniteVec3(velocity, "native impulse result");
  validateFiniteVec3(angularVelocity, "native angular impulse result");
  body.velocity = velocity;
  body.angularVelocity = angularVelocity;
  body.velocityOverridden = true;
  body.wake();
}

function rotateTensorProduct(tensor: NativeMassTensor, body: RigidBody, vector: Vec3): V {
  const [x, y, z, w] = body.rotation;
  const local = rotateVec3ByQuat(vector, [-x, -y, -z, w]);
  const result = rotateVec3ByQuat([dot(tensor[0], local), dot(tensor[1], local), dot(tensor[2], local)], body.rotation);
  validateFiniteVec3(result, "native tensor product");
  return result;
}

/**
 * Isolated native mass-property experiment. Collider shapes are in body-local
 * coordinates and share one density; sensor shapes also contribute, matching
 * the current public physics world. Explicit principal moments override shapes.
 * No public backend consumes this result yet.
 */
export function nativeMassProperties(mass: number, shapes: readonly PhysicsShape[], declaredInertia?: Vec3): NativeMassProperties {
  if (!Number.isFinite(mass) || mass <= 0) throw new Error("Native mass must be finite and positive.");
  if (declaredInertia) {
    if (declaredInertia.length !== 3 || declaredInertia.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Native declared inertia must be finite and positive.");
    const inertia: Matrix = [[declaredInertia[0], 0, 0], [0, declaredInertia[1], 0], [0, 0, declaredInertia[2]]];
    return { mass, volume: 0, center: [0, 0, 0], inertia, inverseInertia: invert(inertia) };
  }
  if (shapes.length === 0) return { mass, volume: 0, center: [0, 0, 0], inertia: zero(), inverseInertia: zero() };
  const parts = shapes.map(shapeProperties);
  const volume = parts.reduce((sum, part) => sum + part.volume, 0);
  if (!Number.isFinite(volume) || volume <= 0) throw new Error("Native collider volume must be finite and positive.");
  let center: V = [0, 0, 0];
  for (const part of parts) center = add(center, mul(part.center, part.volume / volume));
  const inertia = zero();
  for (const part of parts) {
    const density = mass / volume;
    const partMass = density * part.volume;
    const offset = sub(part.center, center);
    const squared = dot(offset, offset);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        inertia[row]![column]! += density * part.inertia[row]![column]! + partMass * ((row === column ? squared : 0) - offset[row]! * offset[column]!);
      }
    }
  }
  if (!center.every(Number.isFinite) || !inertia.every((row) => row.every(Number.isFinite))) throw new Error("Native mass properties overflowed.");
  return { mass, volume, center, inertia, inverseInertia: invert(inertia) };
}

/** Unit-density inertia about the part's own center. */
function shapeProperties(shape: PhysicsShape): Part {
  Shape.validate(shape);
  if (shape.kind === "convex-hull") return convexProperties(shape.vertices);
  if (shape.kind === "plane" || shape.kind === "mesh" || shape.kind === "heightfield") {
    throw new Error(`Native dynamic mass properties do not support ${shape.kind} shapes.`);
  }
  let volume: number;
  let x: number, y: number, z: number;
  if (shape.kind === "sphere") {
    volume = 4 * Math.PI * shape.radius ** 3 / 3;
    x = y = z = volume * 2 * shape.radius ** 2 / 5;
  } else if (shape.kind === "box") {
    const [a, b, c] = shape.halfExtents;
    volume = 8 * a * b * c;
    x = volume * (b * b + c * c) / 3;
    y = volume * (a * a + c * c) / 3;
    z = volume * (a * a + b * b) / 3;
  } else {
    const { radius: r, halfHeight: h } = shape;
    const cylinder = 2 * Math.PI * r * r * h;
    const sphere = 4 * Math.PI * r ** 3 / 3;
    volume = cylinder + sphere;
    x = z = cylinder * (r * r / 4 + h * h / 3) + sphere * (2 * r * r / 5 + 3 * h * r / 4 + h * h);
    y = cylinder * r * r / 2 + sphere * 2 * r * r / 5;
  }
  if (![volume, x, y, z].every(Number.isFinite) || Math.min(volume, x, y, z) <= 0) throw new Error("Native collider mass properties overflowed or underflowed.");
  return { volume, center: [0, 0, 0], inertia: [[x, 0, 0], [0, y, 0], [0, 0, z]] };
}

/** Integrate tetrahedra from an interior point to each independently built hull face. */
function convexProperties(vertices: readonly Vec3[]): Part {
  let reference: V = [0, 0, 0];
  for (const vertex of vertices) reference = add(reference, mul(vertex, 1 / vertices.length));
  const offsets = vertices.map((v) => sub(v, reference));
  let scale = 0;
  for (const offset of offsets) scale = Math.max(scale, Math.abs(offset[0]), Math.abs(offset[1]), Math.abs(offset[2]));
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Native convex mass geometry is degenerate.");
  const points = offsets.map((v) => mul(v, 1 / scale));
  const faces = buildConvexFaces(points);
  let volume = 0;
  let first: V = [0, 0, 0];
  const second = zero();
  for (const face of faces) {
    const a = points[face[0]]!, b = points[face[1]]!, c = points[face[2]]!;
    const tetraVolume = dot(a, cross(b, c)) / 6;
    if (tetraVolume < -1e-12) throw new Error("Native convex hull face orientation is invalid.");
    if (tetraVolume <= 0) continue;
    volume += tetraVolume;
    const sum = add(add(a, b), c);
    first = add(first, mul(sum, tetraVolume / 4));
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
      second[row]![column]! += tetraVolume / 20 * (sum[row]! * sum[column]! + a[row]! * a[column]! + b[row]! * b[column]! + c[row]! * c[column]!);
    }
  }
  if (!Number.isFinite(volume) || volume <= 1e-15) throw new Error("Native convex hull volume is degenerate.");
  const localCenter = mul(first, 1 / volume);
  const central = zero();
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) central[row]![column]! = second[row]![column]! - volume * localCenter[row]! * localCenter[column]!;
  const trace = central[0][0] + central[1][1] + central[2][2];
  const inertia = zero();
  const scaleFifth = scale ** 5;
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) inertia[row]![column]! = ((row === column ? trace : 0) - central[row]![column]!) * scaleFifth;
  const realVolume = volume * scale ** 3;
  const center = add(reference, mul(localCenter, scale));
  if (!Number.isFinite(realVolume) || realVolume <= 0 || !center.every(Number.isFinite) || !inertia.every((row) => row.every(Number.isFinite))) {
    throw new Error("Native convex mass properties overflowed or underflowed.");
  }
  return { volume: realVolume, center, inertia };
}

/** Incrementally construct an oriented, closed hull; refuse uncertain geometry. */
function buildConvexFaces(points: readonly Vec3[]): Array<readonly [number, number, number]> {
  const tolerance = 1e-11;
  const certificationTolerance = 512 * Number.EPSILON;
  const first = 0;
  let second = -1, greatest = 0;
  for (let i = 1; i < points.length; i += 1) {
    const distance = length(sub(points[i]!, points[first]!));
    if (distance > greatest) { greatest = distance; second = i; }
  }
  if (second < 0 || greatest <= tolerance) throw new Error("Native convex mass geometry is degenerate.");
  const edge = sub(points[second]!, points[first]!);
  let third = -1, area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const candidate = length(cross(edge, sub(points[i]!, points[first]!)));
    if (candidate > area) { area = candidate; third = i; }
  }
  if (third < 0 || area <= tolerance) throw new Error("Native convex mass geometry is degenerate.");
  const baseNormal = mul(cross(edge, sub(points[third]!, points[first]!)), 1 / area);
  let fourth = -1, depth = 0;
  for (let i = 0; i < points.length; i += 1) {
    const candidate = Math.abs(dot(baseNormal, sub(points[i]!, points[first]!)));
    if (candidate > depth) { depth = candidate; fourth = i; }
  }
  if (fourth < 0 || depth <= tolerance) throw new Error("Native convex mass geometry is ill-conditioned.");
  const interior = mul(add(add(points[first]!, points[second]!), add(points[third]!, points[fourth]!)), 0.25);
  type Face = { readonly vertices: readonly [number, number, number]; readonly normal: Vec3 };
  const face = (a: number, b: number, c: number): Face => {
    let normal = cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!));
    const magnitude = length(normal);
    if (!Number.isFinite(magnitude) || magnitude <= tolerance * tolerance) throw new Error("Native convex mass hull has a degenerate face.");
    normal = mul(normal, 1 / magnitude);
    const inside = dot(normal, sub(interior, points[a]!));
    if (Math.abs(inside) <= tolerance * tolerance) throw new Error("Native convex mass hull has an ambiguous face orientation.");
    if (inside > 0) return { vertices: [a, c, b], normal: mul(normal, -1) };
    return { vertices: [a, b, c], normal };
  };
  let faces = [face(first, second, third), face(first, fourth, second), face(second, fourth, third), face(third, fourth, first)];
  const initial = new Set([first, second, third, fourth]);
  for (let index = 0; index < points.length; index += 1) {
    if (initial.has(index)) continue;
    const visible = new Set(faces.filter((candidate) => dot(candidate.normal, sub(points[index]!, points[candidate.vertices[0]]!)) > tolerance));
    if (!visible.size) continue;
    const edges = new Map<string, { a: number; b: number; count: number }>();
    for (const candidate of visible) {
      const [a, b, c] = candidate.vertices;
      for (const [start, end] of [[a, b], [b, c], [c, a]] as const) {
        const key = start < end ? `${start}:${end}` : `${end}:${start}`;
        const existing = edges.get(key);
        if (existing) { existing.count += 1; if (existing.count > 2 || existing.a !== end || existing.b !== start) throw new Error("Native convex mass hull has a nonmanifold edge."); }
        else edges.set(key, { a: start, b: end, count: 1 });
      }
    }
    faces = faces.filter((candidate) => !visible.has(candidate));
    for (const boundary of edges.values()) if (boundary.count === 1) faces.push(face(boundary.a, boundary.b, index));
  }
  const edgeCounts = new Map<string, { count: number; orientation: number }>();
  for (const candidate of faces) {
    const [a, b, c] = candidate.vertices;
    for (const [start, end] of [[a, b], [b, c], [c, a]] as const) {
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const edge = edgeCounts.get(key) ?? { count: 0, orientation: 0 };
      edge.count += 1;
      edge.orientation += start < end ? 1 : -1;
      edgeCounts.set(key, edge);
    }
    if (points.some((point) => dot(candidate.normal, sub(point, points[a]!)) > certificationTolerance)) {
      throw new Error("Native convex mass hull cannot certify all vertices.");
    }
  }
  if ([...edgeCounts.values()].some((edge) => edge.count !== 2 || edge.orientation !== 0)) throw new Error("Native convex mass hull is not closed and consistently oriented.");
  return faces.map((candidate) => candidate.vertices);
}

function invert(m: Matrix): Matrix {
  const [a, b, c] = m[0], d = m[1][1], e = m[1][2], f = m[2][2];
  const aa = d * f - e * e, ab = c * e - b * f, ac = b * e - c * d;
  const dd = a * f - c * c, de = b * c - a * e, ff = a * d - b * b;
  const determinant = a * aa + b * ab + c * ac;
  if (![a, d, f, determinant].every(Number.isFinite) || a <= 0 || a * d - b * b <= 0 || determinant <= 0) throw new Error("Native inertia tensor must be finite and positive definite.");
  const result: Matrix = [[aa / determinant, ab / determinant, ac / determinant], [ab / determinant, dd / determinant, de / determinant], [ac / determinant, de / determinant, ff / determinant]];
  if (!result.every((row) => row.every(Number.isFinite))) throw new Error("Native inverse inertia tensor overflowed.");
  return result;
}
