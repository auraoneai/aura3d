import { Triangle } from "./Triangle.js";
import { Vector3 } from "./Vector3.js";
import type { Ray } from "./Ray.js";

/**
 * The 4.x hull uses the original points and exposes its mutable face graph.
 * Its incremental surface builder starts with a tetrahedron, replaces visible
 * face patches with boundary triangles, and maintains the public conflict
 * lists. Seed selection uses scaled local coordinates; visibility tests and
 * exposed face measurements use the caller's coordinates.
 */
export class ConvexHull {
  /**
   * Historical world-coordinate tolerance. Automatic construction and
   * containment use a smaller local bound when needed; assigning a different
   * finite value overrides the containment bound.
   */
  tolerance = -1;
  faces: ConvexHullFace[] = [];
  newFaces: ConvexHullFace[] = [];
  readonly assigned = new VertexList();
  readonly unassigned = new VertexList();
  vertices: VertexNode[] = [];

  setFromPoints(points: readonly Vector3[]): this {
    // Check before changing the existing hull, including for short inputs.
    for (const point of points) {
      if (!finitePoint(point)) throw new RangeError("ConvexHull coordinates must be finite");
    }
    // A short input has historically left an existing hull unchanged.
    if (points.length < 4) return this;
    this.makeEmpty();
    this.vertices = points.map((point) => new VertexNode(point));
    return this.compute();
  }

  static fromPoints(points: readonly Vector3[]): ConvexHull {
    return new ConvexHull().setFromPoints(points);
  }

  containsPoint(point: Vector3): boolean {
    if (!finitePoint(point)) return false;
    if (!Number.isFinite(this.tolerance)) throw new RangeError("ConvexHull tolerance must be finite");
    const defaults = defaultTolerances.get(this);
    for (const face of this.faces) {
      const anchor = planeAnchors.get(face);
      const tolerance = defaults !== undefined && this.tolerance === defaults.reported &&
        anchor !== undefined && unchangedPlane(face, anchor) ? defaults.effective : this.tolerance;
      if (outsideFace(face, point, tolerance)) return false;
    }
    return true;
  }

  /**
   * Clip the positive ray against the current public supporting planes.
   * A boundary crossing at exactly zero is skipped, as it was in 4.x: a ray
   * starting on the surface and going inward returns the opposite boundary.
   */
  intersectRay(ray: Ray): Vector3 | undefined {
    if (!finitePoint(ray.origin) || !finitePoint(ray.direction)) return undefined;
    let entry = -Infinity;
    let exit = Infinity;
    let entryFace: ConvexHullFace | undefined;
    let exitFace: ConvexHullFace | undefined;
    for (const face of this.faces) {
      const offset = face.distanceToPoint(ray.origin);
      const velocity = face.normal.dot(ray.direction);
      if (offset > 0 && velocity >= 0) return undefined;
      if (velocity === 0) continue;

      const crossing = -offset / velocity;
      if (!(crossing <= 0)) {
        if (velocity > 0) {
          if (crossing < exit) exitFace = face;
          exit = Math.min(exit, crossing);
        } else {
          if (crossing > entry) entryFace = face;
          entry = Math.max(entry, crossing);
        }
        if (entry > exit) return undefined;
      }
    }
    const useExit = entry === -Infinity;
    const parameter = useExit ? exit : entry;
    const boundary = useExit ? exitFace : entryFace;
    const hit = ray.at(parameter);
    if (boundary !== undefined && Number.isFinite(parameter)) {
      // At large distances `origin + direction * parameter` can lose the
      // entire hull-sized remainder. Correct the already-computed point along
      // the ray rather than adding a tiny correction to the large parameter.
      const residual = boundary.distanceToPoint(hit);
      const speed = boundary.normal.dot(ray.direction);
      const correction = -residual / speed;
      if (Number.isFinite(correction)) return hit.addScaled(ray.direction, correction);
    }
    return hit;
  }

  intersectsRay(ray: Ray): boolean {
    return this.intersectRay(ray) !== undefined;
  }

  makeEmpty(): this {
    // Keep tolerance and the public bookkeeping objects exactly as in 4.x.
    this.faces = [];
    this.vertices = [];
    return this;
  }

  compute(): this {
    const range = pointRange(this.vertices);
    const magnitudes = [
      Math.max(Math.abs(range.min[0]), Math.abs(range.max[0])),
      Math.max(Math.abs(range.min[1]), Math.abs(range.max[1])),
      Math.max(Math.abs(range.min[2]), Math.abs(range.max[2]))
    ];
    const total = magnitudes[0]! + magnitudes[1]! + magnitudes[2]!;
    const factor = 3 * Number.EPSILON;
    this.tolerance = Number.isFinite(total)
      ? factor * total
      : magnitudes.reduce((sum, value) => sum + factor * value, 0);
    // compute() is public and historically appends to the current faces;
    // setFromPoints() is the operation that clears first.
    const effective = buildSurface(this.vertices, range, this.faces, this.assigned, this.unassigned);
    this.faces = this.faces.filter((face) => face.mark === 0);
    this.assigned.clear();
    this.unassigned.clear();
    this.newFaces = [];
    defaultTolerances.set(this, { reported: this.tolerance, effective });
    return this;
  }
}

export class ConvexHullFace {
  normal = new Vector3(0, 0, 0);
  midpoint = new Vector3(0, 0, 0);
  area = 0;
  constant = 0;
  outside: VertexNode | null = null;
  mark = 0;
  edge: HalfEdge | null = null;

  static create(a: VertexNode, b: VertexNode, c: VertexNode): ConvexHullFace {
    const face = new ConvexHullFace();
    const loop = [new HalfEdge(a, face), new HalfEdge(b, face), new HalfEdge(c, face)];
    for (let i = 0; i < loop.length; i += 1) {
      loop[i]!.next = loop[(i + 1) % loop.length]!;
      loop[i]!.prev = loop[(i + loop.length - 1) % loop.length]!;
    }
    face.edge = loop[0]!;
    return face.compute();
  }

  getEdge(index: number): HalfEdge {
    let edge = this.edge!;
    while (index > 0) {
      edge = edge.next!;
      index -= 1;
    }
    while (index < 0) {
      edge = edge.prev!;
      index += 1;
    }
    return edge;
  }

  compute(): this {
    const edge = this.edge!;
    const a = edge.tail()!.point;
    const b = edge.head().point;
    const c = edge.next!.head().point;
    if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) {
      throw new RangeError("ConvexHullFace coordinates must be finite");
    }
    const triangle = stableTriangle(a, b, c);
    this.normal = stableNormal(triangle);
    this.midpoint = new Vector3(mean(a.x, b.x, c.x), mean(a.y, b.y, c.y), mean(a.z, b.z, c.z));
    this.area = triangle.getArea();
    this.constant = stableDot(this.normal, this.midpoint);
    planeAnchors.set(this, {
      x: this.normal.x, y: this.normal.y, z: this.normal.z,
      constant: this.constant,
      point: { x: a.x, y: a.y, z: a.z },
      second: { x: b.x, y: b.y, z: b.z },
      third: { x: c.x, y: c.y, z: c.z }
    });
    return this;
  }

  distanceToPoint(point: Vector3): number {
    const distance = stableDot(this.normal, point) - this.constant;
    // Keep the public coefficients authoritative after caller edits. For an
    // intact computed plane, use its vertex when world-coordinate subtraction
    // loses the local distance, or when a plane projection overflows.
    const anchor = planeAnchors.get(this);
    if (anchor !== undefined && unchangedPlane(this, anchor) && finitePoint(point)) {
      const magnitude = Math.abs(this.normal.x * point.x) + Math.abs(this.normal.y * point.y) +
        Math.abs(this.normal.z * point.z) + Math.abs(this.constant);
      const smallPoint = Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) < 2 ** -1022;
      if (Number.isFinite(distance) && !smallPoint && Math.abs(distance) > 16 * Number.EPSILON * magnitude) {
        return distance;
      }
      const relative = difference(point, anchor.point);
      const size = Math.max(Math.abs(relative.x), Math.abs(relative.y), Math.abs(relative.z));
      if (Number.isFinite(size)) {
        if (size > 0 && size < 2 ** -1022) {
          return dot(this.normal, { x: relative.x / size, y: relative.y / size, z: relative.z / size }) * size;
        }
        return stableDot(this.normal, relative);
      }
      return 2 * stableDot(this.normal, {
        x: point.x / 2 - anchor.point.x / 2,
        y: point.y / 2 - anchor.point.y / 2,
        z: point.z / 2 - anchor.point.z / 2
      });
    }
    return distance;
  }
}

export class HalfEdge {
  prev: HalfEdge | null = null;
  next: HalfEdge | null = null;
  twin: HalfEdge | null = null;

  constructor(
    readonly vertex: VertexNode,
    readonly face: ConvexHullFace
  ) {}

  head(): VertexNode {
    return this.vertex;
  }

  tail(): VertexNode | null {
    return this.prev?.vertex ?? null;
  }

  length(): number {
    const tail = this.tail();
    return tail === null ? -1 : tail.point.distanceTo(this.vertex.point);
  }

  lengthSquared(): number {
    const tail = this.tail();
    return tail === null ? -1 : tail.point.distanceToSquared(this.vertex.point);
  }

  setTwin(edge: HalfEdge): this {
    this.twin = edge;
    edge.twin = this;
    return this;
  }
}

export class VertexNode {
  prev: VertexNode | null = null;
  next: VertexNode | null = null;
  face: ConvexHullFace | null = null;

  constructor(readonly point: Vector3) {}
}

/** Join two neighbours, updating a list endpoint when either is absent. */
function join(list: VertexList, left: VertexNode | null, right: VertexNode | null): void {
  if (left === null) list.head = right;
  else left.next = right;
  if (right === null) list.tail = left;
  else right.prev = left;
}

export class VertexList {
  head: VertexNode | null = null;
  tail: VertexNode | null = null;

  first(): VertexNode | null {
    return this.head;
  }

  last(): VertexNode | null {
    return this.tail;
  }

  clear(): this {
    this.head = null;
    this.tail = null;
    return this;
  }

  insertBefore(target: VertexNode, vertex: VertexNode): this {
    join(this, target.prev, vertex);
    join(this, vertex, target);
    return this;
  }

  insertAfter(target: VertexNode, vertex: VertexNode): this {
    join(this, vertex, target.next);
    join(this, target, vertex);
    return this;
  }

  append(vertex: VertexNode): this {
    join(this, this.tail, vertex);
    vertex.next = null;
    this.tail = vertex;
    return this;
  }

  appendChain(vertex: VertexNode): this {
    join(this, this.tail, vertex);
    let last = vertex;
    while (last.next !== null) last = last.next;
    this.tail = last;
    return this;
  }

  remove(vertex: VertexNode): this {
    join(this, vertex.prev, vertex.next);
    return this;
  }

  removeSubList(first: VertexNode, last: VertexNode): this {
    join(this, first.prev, last.next);
    return this;
  }

  isEmpty(): boolean {
    return this.head === null;
  }
}

type Coordinates = { x: number; y: number; z: number };
type PlaneAnchor = Coordinates & { constant: number; point: Coordinates; second: Coordinates; third: Coordinates };
const planeAnchors = new WeakMap<ConvexHullFace, PlaneAnchor>();
// The reported value retains the 4.x magnitude-based contract. Decisions for
// an unmodified default use local geometry instead; an explicit different
// tolerance supplied by a caller still takes precedence.
const defaultTolerances = new WeakMap<ConvexHull, { reported: number; effective: number }>();
type Range = {
  min: [number, number, number];
  max: [number, number, number];
  minIndex: [number, number, number];
  maxIndex: [number, number, number];
};
type SurfaceTriangle = [number, number, number];

function finitePoint(point: Coordinates): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function samePoint(a: Coordinates, b: Coordinates): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function unchangedPlane(face: ConvexHullFace, anchor: PlaneAnchor): boolean {
  return anchor.constant === face.constant && anchor.x === face.normal.x &&
    anchor.y === face.normal.y && anchor.z === face.normal.z;
}

function pointRange(vertices: VertexNode[]): Range {
  if (vertices.length === 0) throw new TypeError("ConvexHull.compute requires vertices");
  const first = vertices[0]!.point;
  if (!finitePoint(first)) throw new RangeError("ConvexHull coordinates must be finite");
  const min: [number, number, number] = [first.x, first.y, first.z];
  const max: [number, number, number] = [first.x, first.y, first.z];
  const minIndex: [number, number, number] = [0, 0, 0];
  const maxIndex: [number, number, number] = [0, 0, 0];
  for (let i = 1; i < vertices.length; i += 1) {
    const point = vertices[i]!.point;
    if (!finitePoint(point)) throw new RangeError("ConvexHull coordinates must be finite");
    const values = [point.x, point.y, point.z];
    for (let axis = 0; axis < 3; axis += 1) {
      if (values[axis]! < min[axis]!) {
        min[axis] = values[axis]!;
        minIndex[axis] = i;
      }
      if (values[axis]! > max[axis]!) {
        max[axis] = values[axis]!;
        maxIndex[axis] = i;
      }
    }
  }
  return { min, max, minIndex, maxIndex };
}

function middle(a: number, b: number): number {
  const span = b - a;
  return Number.isFinite(span) ? a + span / 2 : a / 2 + b / 2;
}

function difference(a: Coordinates, b: Coordinates): Coordinates {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Coordinates, b: Coordinates): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Triangle's ordinary cross product is formed around its second vertex. Use
 * a cyclic permutation when that vertex is opposite the shortest edge; this
 * avoids subtracting two nearly parallel long edges on a thin triangle.
 * Cyclic permutations retain the same outward orientation.
 */
function stableTriangle(a: Vector3, b: Vector3, c: Vector3): Triangle {
  const ab = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const bc = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z);
  const ca = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
  return ca < ab && ca < bc ? new Triangle(b, c, a) : new Triangle(a, b, c);
}

/**
 * Validate the normal against both input edges. If the ordinary calculation
 * loses perpendicularity on a narrow facet, request Triangle's existing exact
 * arithmetic path by scaling all three inputs by the same power of two. That
 * scaling is exact while finite and preserves the original orientation.
 */
function stableNormal(triangle: Triangle): Vector3 {
  const normal = triangle.getNormal();
  const { a, b, c } = triangle;
  const u = difference(b, a);
  const w = difference(c, a);
  const scale = Math.max(Math.abs(u.x), Math.abs(u.y), Math.abs(u.z), Math.abs(w.x), Math.abs(w.y), Math.abs(w.z));
  // Triangle already uses its exact path outside this range.
  if (!(scale >= 2 ** -128 && scale <= 2 ** 128)) return normal;
  const first = dot(normal, { x: u.x / scale, y: u.y / scale, z: u.z / scale });
  const second = dot(normal, { x: w.x / scale, y: w.y / scale, z: w.z / scale });
  if (Math.max(Math.abs(first), Math.abs(second)) <= 4 * Number.EPSILON) return normal;

  const factor = 2 ** Math.ceil(130 - Math.log2(scale));
  const scaled = [a.multiplyScalar(factor), b.multiplyScalar(factor), c.multiplyScalar(factor)] as const;
  if (!scaled.every((point) => [point.x, point.y, point.z].every(Number.isFinite))) return normal;
  return Triangle.getNormal(scaled[0], scaled[1], scaled[2]);
}

/** Preserve the ordinary mean, but avoid overflow in finite coordinates. */
function mean(a: number, b: number, c: number): number {
  const sum = a + b + c;
  if (Number.isFinite(sum) || ![a, b, c].every(Number.isFinite)) return sum * (1 / 3);
  const ab = b - a;
  const ac = c - a;
  return Number.isFinite(ab) && Number.isFinite(ac)
    ? a + ab / 3 + ac / 3
    : a / 3 + b / 3 + c / 3;
}

/** Recover finite plane projections whose intermediate sum overflows. */
function stableDot(a: Coordinates, b: Coordinates): number {
  const direct = dot(a, b);
  if (Number.isFinite(direct) || ![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) return direct;
  const size = Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.z));
  if (size === 0) return direct;
  return (a.x * (b.x / size) + a.y * (b.y / size) + a.z * (b.z / size)) * size;
}

type Dyadic = { coefficient: bigint; exponent: number };
const floatBits = new DataView(new ArrayBuffer(8));
const fractionMask = (1n << 52n) - 1n;

/** Write a finite binary64 value as an integer times a power of two. */
function dyadic(value: number): Dyadic {
  floatBits.setFloat64(0, value, false);
  const bits = floatBits.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  let coefficient = (bits & fractionMask) | (exponent === 0 ? 0n : 1n << 52n);
  if (bits >> 63n) coefficient = -coefficient;
  return { coefficient, exponent: exponent === 0 ? -1074 : exponent - 1075 };
}

/** Give four coordinates on one axis a common, exact power-of-two unit. */
function exactAxis(a: number, b: number, c: number, p: number): { values: bigint[]; exponent: number } {
  const parts = [a, b, c, p].map(dyadic);
  const minimum = parts.reduce(
    (value, part) => part.coefficient === 0n ? value : Math.min(value, part.exponent),
    Infinity
  );
  const exponent = Number.isFinite(minimum) ? minimum : 0;
  return {
    exponent,
    values: parts.map((part) => part.coefficient === 0n
      ? 0n
      : part.coefficient << BigInt(part.exponent - exponent))
  };
}

type ExactPlane = {
  x: bigint; y: bigint; z: bigint; determinant: bigint;
  ex: number; ey: number; ez: number;
};

/** The scalar triple product and its cross product, without rounded differences. */
function exactPlane(a: Coordinates, b: Coordinates, c: Coordinates, p: Coordinates): ExactPlane {
  const x = exactAxis(a.x, b.x, c.x, p.x);
  const y = exactAxis(a.y, b.y, c.y, p.y);
  const z = exactAxis(a.z, b.z, c.z, p.z);
  const ux = x.values[1]! - x.values[0]!, vx = x.values[2]! - x.values[0]!, wx = x.values[3]! - x.values[0]!;
  const uy = y.values[1]! - y.values[0]!, vy = y.values[2]! - y.values[0]!, wy = y.values[3]! - y.values[0]!;
  const uz = z.values[1]! - z.values[0]!, vz = z.values[2]! - z.values[0]!, wz = z.values[3]! - z.values[0]!;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return {
    x: cx, y: cy, z: cz, determinant: cx * wx + cy * wy + cz * wz,
    ex: x.exponent, ey: y.exponent, ez: z.exponent
  };
}

/** Compare the exact signed distance with a finite, non-negative tolerance. */
function exactOutside(plane: ExactPlane, tolerance: number): boolean {
  if (plane.determinant <= 0n) return false;
  if (tolerance === 0) return true;
  const cross = [
    { square: plane.x * plane.x, exponent: 2 * (plane.ey + plane.ez) },
    { square: plane.y * plane.y, exponent: 2 * (plane.ez + plane.ex) },
    { square: plane.z * plane.z, exponent: 2 * (plane.ex + plane.ey) }
  ];
  const exponent = Math.min(...cross.filter((part) => part.square !== 0n).map((part) => part.exponent));
  const crossSquared = cross.reduce(
    (sum, part) => part.square === 0n ? sum : sum + (part.square << BigInt(part.exponent - exponent)),
    0n
  );
  const limit = dyadic(tolerance);
  let left = plane.determinant * plane.determinant;
  let right = crossSquared * limit.coefficient * limit.coefficient;
  const shift = 2 * (plane.ex + plane.ey + plane.ez) - exponent - 2 * limit.exponent;
  if (shift >= 0) left <<= BigInt(shift);
  else right <<= BigInt(-shift);
  return left > right;
}

/** Leading binary digits suffice to choose a scale for the seed tolerance. */
function leading(value: bigint, exponent: number): { fraction: number; power: number } {
  const magnitude = value < 0n ? -value : value;
  if (magnitude === 0n) return { fraction: 0, power: -Infinity };
  const bits = magnitude.toString(2).length;
  const shift = Math.max(0, bits - 53);
  return {
    fraction: Number(magnitude >> BigInt(shift)) / 2 ** (bits - shift - 1),
    power: exponent + bits - 1
  };
}

function scaleByPower(value: number, exponent: number): number {
  if (value === 0) return 0;
  while (value < 1) {
    value *= 2;
    exponent -= 1;
  }
  while (value >= 2) {
    value /= 2;
    exponent += 1;
  }
  if (exponent > 1023) return Infinity;
  if (exponent < -1075) return 0;
  return exponent < -1022
    ? value * 2 ** (exponent + 1022) * 2 ** -1022
    : value * 2 ** exponent;
}

function exactPlaneHeight(plane: ExactPlane): number {
  if (plane.determinant === 0n) return 0;
  const numerator = leading(plane.determinant, plane.ex + plane.ey + plane.ez);
  const cross = [
    leading(plane.x, plane.ey + plane.ez),
    leading(plane.y, plane.ez + plane.ex),
    leading(plane.z, plane.ex + plane.ey)
  ];
  const largest = Math.max(...cross.map((part) => part.power));
  const length = Math.hypot(...cross.map((part) =>
    part.fraction === 0 ? 0 : part.fraction * 2 ** (part.power - largest)));
  return scaleByPower(numerator.fraction / length, numerator.power - largest);
}

type ScaledDifference = { value: Coordinates; scale: number };

function scaledDifference(a: Coordinates, b: Coordinates): ScaledDifference | undefined {
  const delta = difference(a, b);
  if (!finitePoint(delta)) return undefined;
  const scale = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  if (scale === 0) return { value: delta, scale };
  const value = { x: delta.x / scale, y: delta.y / scale, z: delta.z / scale };
  // Avoid certifying a sign if any of the triple products could underflow.
  if ((delta.x !== 0 && Math.abs(value.x) < 2 ** -300) ||
      (delta.y !== 0 && Math.abs(value.y) < 2 ** -300) ||
      (delta.z !== 0 && Math.abs(value.z) < 2 ** -300)) return undefined;
  return { value, scale };
}

/**
 * Filter a plane-side comparison in scaled coordinates. Close comparisons,
 * extreme aspect ratios and overflowing differences use exact dyadic inputs.
 */
function outsideTriangle(a: Coordinates, b: Coordinates, c: Coordinates, point: Coordinates, tolerance: number): boolean {
  if (samePoint(point, a) || samePoint(point, b) || samePoint(point, c)) return false;
  const u = scaledDifference(b, a), v = scaledDifference(c, a), w = scaledDifference(point, a);
  if (u !== undefined && v !== undefined && w !== undefined) {
    if (u.scale === 0 || v.scale === 0 || w.scale === 0) return false;
    const [ux, uy, uz] = [u.value.x, u.value.y, u.value.z];
    const [vx, vy, vz] = [v.value.x, v.value.y, v.value.z];
    const [wx, wy, wz] = [w.value.x, w.value.y, w.value.z];
    const cx = uy! * vz! - uz! * vy!, cy = uz! * vx! - ux! * vz!, cz = ux! * vy! - uy! * vx!;
    const px = Math.abs(uy! * vz!) + Math.abs(uz! * vy!);
    const py = Math.abs(uz! * vx!) + Math.abs(ux! * vz!);
    const pz = Math.abs(ux! * vy!) + Math.abs(uy! * vx!);
    const determinant = cx * wx! + cy * wy! + cz * wz!;
    const permanent = px * Math.abs(wx!) + py * Math.abs(wy!) + pz * Math.abs(wz!);
    if (permanent === 0) return false;
    const error = 64 * Number.EPSILON * permanent;
    if (determinant < -error) return false;
    const scaledTolerance = tolerance / w.scale;
    // A unit-normal projection cannot reach twice the largest component.
    if (scaledTolerance >= 2) return false;
    if (scaledTolerance === 0 || scaledTolerance >= 2 ** -900) {
      const length = Math.hypot(cx, cy, cz);
      const normalError = 32 * Number.EPSILON * Math.hypot(px, py, pz);
      const upper = scaledTolerance * (length + normalError) * (1 + 8 * Number.EPSILON);
      const lower = scaledTolerance * Math.max(0, length - normalError) * (1 - 8 * Number.EPSILON);
      if (determinant - error > upper) return true;
      if (determinant + error <= lower) return false;
    }
  }
  return exactOutside(exactPlane(a, b, c, point), tolerance);
}

function outsideFace(face: ConvexHullFace, point: Vector3, tolerance: number): boolean {
  const anchor = planeAnchors.get(face);
  if (anchor !== undefined && unchangedPlane(face, anchor) && tolerance >= 0 && Number.isFinite(tolerance)) {
    return outsideTriangle(anchor.point, anchor.second, anchor.third, point, tolerance);
  }
  return face.distanceToPoint(point) > tolerance;
}

/**
 * Build a closed triangular surface without an input-count or face-test cap.
 * All input nodes and point references remain in the public vertices array.
 */
function buildSurface(
  vertices: VertexNode[],
  range: Range,
  faces: ConvexHullFace[],
  assigned: VertexList,
  unassigned: VertexList
): number {
  if (vertices.length < 4) throw new TypeError("ConvexHull.compute requires at least four vertices");
  const center: Coordinates = {
    x: middle(range.min[0], range.max[0]),
    y: middle(range.min[1], range.max[1]),
    z: middle(range.min[2], range.max[2])
  };
  const extents = [
    Math.max(Math.abs(range.min[0] - center.x), Math.abs(range.max[0] - center.x)),
    Math.max(Math.abs(range.min[1] - center.y), Math.abs(range.max[1] - center.y)),
    Math.max(Math.abs(range.min[2] - center.z), Math.abs(range.max[2] - center.z))
  ];
  const scale = Math.max(...extents);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new TypeError("ConvexHull.compute requires non-collinear finite vertices");
  }
  const points = vertices.map(({ point }) => ({
    x: (point.x - center.x) / scale,
    y: (point.y - center.y) / scale,
    z: (point.z - center.z) / scale
  }));

  let axis = 0;
  for (let i = 1; i < 3; i += 1) {
    if (range.max[i]! - range.min[i]! > range.max[axis]! - range.min[axis]!) axis = i;
  }
  const a = range.minIndex[axis]!;
  const b = range.maxIndex[axis]!;
  const direction = difference(points[b]!, points[a]!);
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!(length > 0)) throw new TypeError("ConvexHull.compute requires non-collinear vertices");
  let c = -1;
  let farthest = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i === a || i === b) continue;
    const relative = difference(points[i]!, points[a]!);
    const projection = dot(relative, direction) / dot(direction, direction);
    let distance: number;
    if (projection <= 0) {
      distance = Math.hypot(relative.x, relative.y, relative.z);
    } else if (projection >= 1) {
      const toEnd = difference(points[i]!, points[b]!);
      distance = Math.hypot(toEnd.x, toEnd.y, toEnd.z);
    } else {
      // The cross product avoids a spurious perpendicular residual from
      // subtracting a rounded projection of an exactly collinear point.
      distance = Math.hypot(
        relative.y * direction.z - relative.z * direction.y,
        relative.z * direction.x - relative.x * direction.z,
        relative.x * direction.y - relative.y * direction.x
      ) / length;
    }
    if (distance > farthest) {
      farthest = distance;
      c = i;
    }
  }
  let baseNormal = c < 0
    ? new Vector3(0, 0, 0)
    : stableNormal(stableTriangle(vertices[a]!.point, vertices[b]!.point, vertices[c]!.point));
  if (!(Math.hypot(baseNormal.x, baseNormal.y, baseNormal.z) > 0)) {
    // Normalizing by the longest extent can erase a much smaller, but still
    // representable, perpendicular component, or make an exact line appear
    // non-collinear. Check the original inputs.
    c = -1;
    for (let i = 0; i < vertices.length; i += 1) {
      if (i === a || i === b) continue;
      const normal = stableNormal(stableTriangle(vertices[a]!.point, vertices[b]!.point, vertices[i]!.point));
      if (Math.hypot(normal.x, normal.y, normal.z) > 0) {
        c = i;
        baseNormal = normal;
        break;
      }
    }
  }
  if (c < 0) throw new TypeError("ConvexHull.compute requires non-collinear vertices");

  let d = -1;
  farthest = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (i === a || i === b || i === c) continue;
    const distance = Math.abs(dot(baseNormal, difference(points[i]!, points[a]!)));
    if (distance > farthest) {
      farthest = distance;
      d = i;
    }
  }
  if (d < 0) throw new TypeError("ConvexHull.compute requires at least four vertices");

  let seedPlane = exactPlane(vertices[a]!.point, vertices[b]!.point, vertices[c]!.point, vertices[d]!.point);
  if (seedPlane.determinant === 0n) {
    // A rounded projection can prefer a coplanar point over a real but very
    // small height. Retain the historic planar seed only if all candidates
    // are exactly coplanar with the selected base.
    for (let i = 0; i < vertices.length; i += 1) {
      if (i === a || i === b || i === c || i === d) continue;
      const candidate = exactPlane(vertices[a]!.point, vertices[b]!.point, vertices[c]!.point, vertices[i]!.point);
      if (candidate.determinant !== 0n) {
        d = i;
        seedPlane = candidate;
        break;
      }
    }
  }
  const extentSum = extents[0]! + extents[1]! + extents[2]!;
  const factor = 3 * Number.EPSILON;
  const localTolerance = Number.isFinite(extentSum)
    ? factor * extentSum
    : extents.reduce((sum, extent) => sum + factor * extent, 0);
  // A single world-space error bound can be wider than a thin solid. Cap
  // the local tolerance by the smallest seed altitude, whichever face was
  // chosen as the base. Preserve the two-sided behavior for planar input.
  const first = vertices[a]!.point, second = vertices[b]!.point;
  const third = vertices[c]!.point, fourth = vertices[d]!.point;
  const seedHeight = seedPlane.determinant === 0n ? 0 : Math.min(
    exactPlaneHeight(seedPlane),
    exactPlaneHeight(exactPlane(first, second, fourth, third)),
    exactPlaneHeight(exactPlane(first, third, fourth, second)),
    exactPlaneHeight(exactPlane(second, third, fourth, first))
  );
  const tolerance = seedPlane.determinant === 0n
    ? localTolerance
    : Math.min(localTolerance, 16 * Number.EPSILON * seedHeight);

  // These four oriented boundary cycles share each edge in opposite
  // directions. Reversing all four together keeps that property even for the
  // historic coplanar four-vertex case. Each side's loop starts at the apex.
  const seed: [number, number, number][] = [
    [a, b, c], [d, b, a], [d, c, b], [d, a, c]
  ];
  const reverse = seedPlane.determinant > 0n ||
    (seedPlane.determinant === 0n && dot(baseNormal, difference(points[d]!, points[a]!)) >= 0);
  const surface: SurfaceTriangle[] = seed.map(([x, y, z]) => reverse ? [x, z, y] : [x, y, z]);
  // Publishing the seed before processing the worklist also preserves the
  // observable partial state if a caller-supplied bookkeeping graph is invalid.
  for (const face of materializeSurface(surface, vertices)) faces.push(face);
  extendSurface(faces, vertices, new Set([a, b, c, d]), tolerance, assigned, unassigned);
  return tolerance;
}

function materializeSurface(surface: SurfaceTriangle[], vertices: VertexNode[]): ConvexHullFace[] {
  const faces: ConvexHullFace[] = [];
  const pending = new Map<string, HalfEdge>();
  for (const facet of surface) {
    const indices = facet;
    const face = ConvexHullFace.create(vertices[facet[0]]!, vertices[facet[1]]!, vertices[facet[2]]!);
    faces.push(face);
    for (let i = 0; i < 3; i += 1) {
      const start = indices[(i + 2) % 3]!;
      const end = indices[i]!;
      const opposite = `${end}:${start}`;
      const twin = pending.get(opposite);
      if (twin) {
        face.getEdge(i).setTwin(twin);
        pending.delete(opposite);
      } else {
        pending.set(`${start}:${end}`, face.getEdge(i));
      }
    }
  }
  if (pending.size) throw new RangeError("ConvexHull.compute could not close the surface");
  return faces;
}

/**
 * Extend the exposed graph without replacing retained faces. Candidate points
 * are grouped in the public list by their visible face; an iterative traversal
 * identifies the connected surface patch and its boundary. This also keeps
 * VertexNode.face and the linked-list lifecycle observable as in 4.x.
 */
function extendSurface(
  faces: ConvexHullFace[],
  vertices: VertexNode[],
  seedIndices: Set<number>,
  tolerance: number,
  assigned: VertexList,
  unassigned: VertexList
): void {
  const initial = faces.slice(0, 4);
  const enroll = (vertex: VertexNode, face: ConvexHullFace): void => {
    vertex.face = face;
    if (face.outside === null) assigned.append(vertex);
    else assigned.insertBefore(face.outside, vertex);
    face.outside = vertex;
  };
  const detach = (vertex: VertexNode, face: ConvexHullFace): void => {
    if (face.outside === vertex) {
      const successor = vertex.next;
      face.outside = successor !== null && successor.face === face ? successor : null;
    }
    assigned.remove(vertex);
  };

  for (let i = 0; i < vertices.length; i += 1) {
    if (seedIndices.has(i)) continue;
    const vertex = vertices[i]!;
    let best = -Infinity;
    let owner: ConvexHullFace | null = null;
    for (const face of initial) {
      if (!outsideFace(face, vertex.point, tolerance)) continue;
      const distance = face.distanceToPoint(vertex.point);
      if (owner === null || distance > best) {
        best = distance;
        owner = face;
      }
    }
    if (owner !== null) enroll(vertex, owner);
  }

  while (!assigned.isEmpty()) {
    const owner = assigned.first()!.face;
    if (owner === null || owner.outside === null) {
      throw new TypeError("ConvexHull.compute requires assigned vertices to reference a face");
    }
    let selected: VertexNode | null = null;
    let distance = -Infinity;
    let cursor: VertexNode | null = owner.outside;
    while (cursor !== null && cursor.face === owner) {
      const value = owner.distanceToPoint(cursor.point);
      if (selected === null || value > distance) {
        distance = value;
        selected = cursor;
      }
      cursor = cursor.next;
    }
    if (selected === null) break;
    const vertex = selected;
    unassigned.clear();
    detach(vertex, owner);
    const visible = new Set<ConvexHullFace>();
    const stack = [owner];
    while (stack.length > 0) {
      const face = stack.pop()!;
      if (visible.has(face) || face.mark !== 0 || !outsideFace(face, vertex.point, tolerance)) continue;
      visible.add(face);
      for (let i = 0; i < 3; i += 1) {
        const twin = face.getEdge(i).twin;
        if (twin === null) throw new TypeError("ConvexHull.compute requires connected face edges");
        stack.push(twin.face);
      }
    }
    if (visible.size === 0) continue;

    const border: HalfEdge[] = [];
    const displaced: VertexNode[] = [];
    for (const face of visible) {
      for (let i = 0; i < 3; i += 1) {
        const edge = face.getEdge(i);
        if (edge.twin === null) throw new TypeError("ConvexHull.compute requires connected face edges");
        if (!visible.has(edge.twin.face)) border.push(edge);
      }
      while (face.outside !== null) {
        const displacedVertex = face.outside;
        detach(displacedVertex, face);
        unassigned.append(displacedVertex);
        displaced.push(displacedVertex);
      }
      face.mark = 1;
    }

    const replacement: ConvexHullFace[] = [];
    const sides = new Map<VertexNode, HalfEdge>();
    const pairSide = (endpoint: VertexNode, edge: HalfEdge): void => {
      const other = sides.get(endpoint);
      if (other) {
        edge.setTwin(other);
        sides.delete(endpoint);
      } else {
        sides.set(endpoint, edge);
      }
    };
    for (const edge of border) {
      const tail = edge.tail();
      if (tail === null || edge.twin === null) throw new TypeError("ConvexHull.compute requires connected face edges");
      const face = ConvexHullFace.create(tail, edge.head(), vertex);
      face.getEdge(1).setTwin(edge.twin);
      pairSide(tail, face.getEdge(0));
      pairSide(edge.head(), face.getEdge(2));
      replacement.push(face);
      faces.push(face);
    }
    if (sides.size || border.length === 0) throw new RangeError("ConvexHull.compute could not close the surface");

    for (const candidate of displaced) {
      let best = -Infinity;
      let next: ConvexHullFace | null = null;
      for (const face of replacement) {
        if (!outsideFace(face, candidate.point, tolerance)) continue;
        const value = face.distanceToPoint(candidate.point);
        if (next === null || value > best) {
          best = value;
          next = face;
        }
      }
      if (next !== null) enroll(candidate, next);
    }
  }
}
