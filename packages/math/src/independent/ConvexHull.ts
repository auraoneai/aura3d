// Independently derived in this session from the declaration-only contract in
// docs/prds/aura3d-independent-math-api.json. No previous hull implementation
// or comparison fixture was consulted. Geometric predicates and the incremental
// construction below are original derivations from elementary vector algebra.
// Migration note: unlinked raw list, vertex, edge, and face references are
// genuinely null. Their nullable types intentionally differ from the frozen
// legacy declaration inventory. Public cutover requires a versioned type
// migration; this candidate does not alter the legacy contract.
import { HullVector3 } from "./HullPrimitives.js";
import type { HullPoint3, HullRayLike } from "./HullPrimitives.js";

type Point = HullPoint3;
type Triangle = { a: number; b: number; c: number; normal: Point };

// The algorithm is quadratic in the worst case. Fail explicitly instead of
// exposing a partially constructed or unbounded hull.
const MAX_INPUT_POINTS = 100_000;
const MAX_UNIQUE_POINTS = 8_192;
const MAX_FACE_TESTS = 25_000_000;
const MAX_NORMALIZED_RAY_ORIGIN = 2 ** 48;
const RELATIVE_TOLERANCE = 32 * Number.EPSILON;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Point, b: Point): Point => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const magnitude = (p: Point): number => Math.hypot(p.x, p.y, p.z);
const finite = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const addScaled = (p: Point, d: Point, t: number): Point => ({ x: p.x + d.x * t, y: p.y + d.y * t, z: p.z + d.z * t });

function unit(p: Point): Point {
  const length = magnitude(p);
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError("ConvexHull: numerically degenerate face");
  return { x: p.x / length, y: p.y / length, z: p.z / length };
}

// Unlike (a+b)/2, this also works when the interval spans the largest doubles.
function midpoint(a: number, b: number): number {
  const span = b - a;
  return Number.isFinite(span) ? a + span / 2 : a / 2 + b / 2;
}

function mean3(a: number, b: number, c: number): number {
  const size = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (size && size < 2 ** -1022) return ((a / size + b / size + c / size) / 3) * size;
  const ab = b - a, ac = c - a;
  if (Number.isFinite(ab) && Number.isFinite(ac)) return a + ab / 3 + ac / 3;
  return a / 3 + b / 3 + c / 3;
}

function scaledEdge(a: Point, b: Point): { direction: Point; size: number; doubled: boolean } {
  let edge = sub(b, a);
  const doubled = !finite(edge);
  if (doubled) edge = { x: b.x / 2 - a.x / 2, y: b.y / 2 - a.y / 2, z: b.z / 2 - a.z / 2 };
  const size = Math.max(Math.abs(edge.x), Math.abs(edge.y), Math.abs(edge.z));
  return { direction: size ? { x: edge.x / size, y: edge.y / size, z: edge.z / size } : edge, size, doubled };
}

// Multiplication with separated binary exponents avoids an avoidable overflow
// or underflow when two edge lengths differ by many orders of magnitude.
function positiveProduct(values: number[]): number {
  if (values.some((value) => value === 0)) return 0;
  let mantissa = 1, exponent = 0;
  for (const value of values) {
    const part = Math.min(1023, Math.floor(Math.log2(value)));
    mantissa *= value / 2 ** part;
    exponent += part;
    if (mantissa >= 2) { mantissa /= 2; exponent++; }
  }
  if (exponent > 1023) return Infinity;
  if (exponent < -1075) return 0;
  // Round only once: multiplying before halving can round a subnormal twice.
  if (exponent === -1075) return (mantissa / 2) * Number.MIN_VALUE;
  return mantissa * 2 ** exponent;
}

// Preserve the ordinary dot-product path, but rescale finite operands when
// intermediate products or their partial sum overflow before cancellation.
function dotWithOverflowRecovery(a: Point, b: Point): number {
  const direct = dot(a, b);
  if (Number.isFinite(direct) || !finite(a) || !finite(b)) return direct;
  const aScale = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));
  const bScale = Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.z));
  if (!aScale || !bScale) return direct;
  const scaled = dot(
    { x: a.x / aScale, y: a.y / aScale, z: a.z / aScale },
    { x: b.x / bScale, y: b.y / bScale, z: b.z / bScale },
  );
  return Math.sign(scaled) * positiveProduct([aScale, bScale, Math.abs(scaled)]);
}

function triangle(a: number, b: number, c: number, points: Point[], interior: Point): Triangle {
  let normal = unit(cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!)));
  if (dot(normal, sub(interior, points[a]!)) > 0) {
    [b, c] = [c, b];
    normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  }
  return { a, b, c, normal };
}

export class VertexNode {
  prev: VertexNode | null = null;
  next: VertexNode | null = null;
  face: ConvexHullFace | null = null;
  constructor(readonly point: HullPoint3) {}
}

export class HalfEdge {
  prev: HalfEdge | null = null;
  next: HalfEdge | null = null;
  twin: HalfEdge | null = null;
  constructor(readonly vertex: VertexNode, readonly face: ConvexHullFace) {}

  head(): VertexNode { return this.vertex; }
  tail(): VertexNode | null { return this.prev?.vertex ?? null; }
  lengthSquared(): number {
    const tail = this.tail();
    if (!tail) return 0;
    const d = sub(this.vertex.point, tail.point);
    return dot(d, d);
  }
  length(): number {
    const tail = this.tail();
    return tail ? magnitude(sub(this.vertex.point, tail.point)) : 0;
  }
  setTwin(edge: HalfEdge): this {
    if (edge === this) throw new RangeError("HalfEdge.setTwin: an edge cannot be its own twin");
    if (this.twin && this.twin.twin === this) this.twin.twin = null;
    if (edge.twin && edge.twin.twin === edge) edge.twin.twin = null;
    this.twin = edge;
    edge.twin = this;
    return this;
  }
}

export class ConvexHullFace {
  normal = new HullVector3();
  midpoint = new HullVector3();
  area = 0;
  constant = 0;
  outside: VertexNode | null = null;
  mark = 0;
  edge: HalfEdge | null = null;

  static create(a: VertexNode, b: VertexNode, c: VertexNode): ConvexHullFace {
    const face = new ConvexHullFace();
    const edges = [new HalfEdge(a, face), new HalfEdge(b, face), new HalfEdge(c, face)];
    for (let i = 0; i < 3; i++) {
      edges[i]!.next = edges[(i + 1) % 3]!;
      edges[i]!.prev = edges[(i + 2) % 3]!;
    }
    face.edge = edges[0]!;
    return face.compute();
  }

  getEdge(i: number): HalfEdge {
    if (!Number.isInteger(i)) throw new RangeError("ConvexHullFace.getEdge: index must be an integer");
    if (!this.edge) throw new Error("ConvexHullFace.getEdge: face has no edge");
    let edge = this.edge;
    // Faces created here are triangular; reducing the index also bounds work.
    const steps = ((i % 3) + 3) % 3;
    for (let j = 0; j < steps; j++) {
      if (!edge.next) throw new Error("ConvexHullFace.getEdge: incomplete edge cycle");
      edge = edge.next;
    }
    return edge;
  }

  compute(): this {
    if (!this.edge?.next?.next) throw new Error("ConvexHullFace.compute: face requires three linked edges");
    const a = this.edge.vertex.point;
    const b = this.edge.next.vertex.point;
    const c = this.edge.next.next.vertex.point;
    if (!finite(a) || !finite(b) || !finite(c)) throw new RangeError("ConvexHullFace: coordinates must be finite");
    const ab = scaledEdge(a, b), ac = scaledEdge(a, c);
    const cp = cross(ab.direction, ac.direction);
    const length = magnitude(cp);
    this.normal = length ? new HullVector3(cp.x / length, cp.y / length, cp.z / length) : new HullVector3();
    this.midpoint = new HullVector3(mean3(a.x, b.x, c.x), mean3(a.y, b.y, c.y), mean3(a.z, b.z, c.z));
    this.area = positiveProduct([length, ab.size, ac.size, ab.doubled ? 2 : 1, ac.doubled ? 2 : 1, .5]);
    this.constant = dotWithOverflowRecovery(this.normal, a);
    return this;
  }

  distanceToPoint(point: HullPoint3): number {
    if (!this.edge) return 0;
    const a = this.edge.vertex.point;
    // Forming the difference first avoids cancellation from a large translation.
    const d = sub(point, a);
    if (finite(d)) return dotWithOverflowRecovery(this.normal, d);
    return 2 * dotWithOverflowRecovery(this.normal, { x: point.x / 2 - a.x / 2, y: point.y / 2 - a.y / 2, z: point.z / 2 - a.z / 2 });
  }
}

// Membership is tracked separately from the publicly inspectable links so
// operations cannot silently detach nodes from an unrelated list.
const vertexOwners = new WeakMap<VertexNode, VertexList>();

function requireMember(list: VertexList, node: VertexNode): void {
  if (vertexOwners.get(node) !== list) throw new RangeError("VertexList: vertex does not belong to this list");
  if (node.prev ? vertexOwners.get(node.prev) !== list || node.prev.next !== node : list.head !== node) {
    throw new RangeError("VertexList: invalid previous link");
  }
  if (node.next ? vertexOwners.get(node.next) !== list || node.next.prev !== node : list.tail !== node) {
    throw new RangeError("VertexList: invalid next link");
  }
}

function requireDetached(node: VertexNode): void {
  if (vertexOwners.has(node) || node.prev || node.next) throw new RangeError("VertexList: vertex is already linked");
}

function collectChain(first: VertexNode, last: VertexNode | null, owner: VertexList | null): VertexNode[] {
  const nodes: VertexNode[] = [];
  const seen = new Set<VertexNode>();
  let node: VertexNode | null = first;
  let previous: VertexNode | null = null;
  while (node) {
    if (seen.has(node)) throw new RangeError("VertexList: cyclic chain");
    if (owner ? vertexOwners.get(node) !== owner : vertexOwners.has(node)) {
      throw new RangeError("VertexList: chain belongs to another list");
    }
    if (previous && node.prev !== previous) throw new RangeError("VertexList: inconsistent chain links");
    seen.add(node);
    nodes.push(node);
    if (node === last) return nodes;
    previous = node;
    node = node.next;
  }
  if (last) throw new RangeError("VertexList: sublist endpoint is not reachable");
  return nodes;
}

function nodesForClear(list: VertexList): VertexNode[] {
  if (!list.head) {
    if (list.tail) throw new RangeError("VertexList: invalid empty list");
    return [];
  }
  if (!list.tail) throw new RangeError("VertexList: invalid tail");
  if (list.head.prev || list.tail.next) throw new RangeError("VertexList: invalid endpoints");
  requireMember(list, list.head);
  requireMember(list, list.tail);
  return collectChain(list.head, list.tail, list);
}

function clearOwnedNodes(list: VertexList, nodes: VertexNode[]): void {
  for (const node of nodes) vertexOwners.delete(node);
  list.head = null;
  list.tail = null;
}

/**
 * A list owns its member nodes until remove, removeSubList, or clear. Inserted
 * vertices must be detached; appendChain accepts a detached, consistent chain.
 * Attempts to mutate a different list's nodes throw without changing either
 * list. Public links are observable, but manually changing them can invalidate
 * the list and is rejected by operations that encounter the inconsistency.
 */
export class VertexList {
  head: VertexNode | null = null;
  tail: VertexNode | null = null;
  first(): VertexNode | null { return this.head ?? null; }
  last(): VertexNode | null { return this.tail ?? null; }
  isEmpty(): boolean { return !this.head; }

  clear(): this {
    clearOwnedNodes(this, nodesForClear(this));
    return this;
  }
  insertBefore(target: VertexNode, vertex: VertexNode): this {
    requireMember(this, target);
    requireDetached(vertex);
    vertex.prev = target.prev;
    vertex.next = target;
    if (target.prev) target.prev.next = vertex;
    else this.head = vertex;
    target.prev = vertex;
    vertexOwners.set(vertex, this);
    return this;
  }
  insertAfter(target: VertexNode, vertex: VertexNode): this {
    requireMember(this, target);
    requireDetached(vertex);
    vertex.prev = target;
    vertex.next = target.next;
    if (target.next) target.next.prev = vertex;
    else this.tail = vertex;
    target.next = vertex;
    vertexOwners.set(vertex, this);
    return this;
  }
  append(vertex: VertexNode): this {
    requireDetached(vertex);
    if (this.tail) requireMember(this, this.tail);
    else if (this.head) throw new RangeError("VertexList: invalid empty list");
    vertex.prev = this.tail;
    vertex.next = null;
    if (this.tail) this.tail.next = vertex;
    else this.head = vertex;
    this.tail = vertex;
    vertexOwners.set(vertex, this);
    return this;
  }
  appendChain(vertex: VertexNode): this {
    if (vertex.prev) throw new RangeError("VertexList: chain must begin with a detached head");
    const nodes = collectChain(vertex, null, null);
    const last = nodes[nodes.length - 1]!;
    if (this.tail) requireMember(this, this.tail);
    else if (this.head) throw new RangeError("VertexList: invalid empty list");
    vertex.prev = this.tail;
    if (this.tail) this.tail.next = vertex;
    else this.head = vertex;
    this.tail = last;
    for (const node of nodes) vertexOwners.set(node, this);
    return this;
  }
  remove(vertex: VertexNode): this {
    requireMember(this, vertex);
    if (vertex.prev) vertex.prev.next = vertex.next;
    else this.head = vertex.next;
    if (vertex.next) vertex.next.prev = vertex.prev;
    else this.tail = vertex.prev;
    vertex.prev = null;
    vertex.next = null;
    vertexOwners.delete(vertex);
    return this;
  }
  removeSubList(a: VertexNode, b: VertexNode): this {
    requireMember(this, a);
    requireMember(this, b);
    const nodes = collectChain(a, b, this);
    if (a.prev) a.prev.next = b.next;
    else this.head = b.next;
    if (b.next) b.next.prev = a.prev;
    else this.tail = a.prev;
    a.prev = null;
    b.next = null;
    for (const node of nodes) vertexOwners.delete(node);
    return this;
  }
}

type Built = {
  dimension: -1 | 0 | 1 | 2 | 3;
  center: Point;
  scale: number;
  points: Point[];
  nodes: VertexNode[];
  triangles: Triangle[];
  polygon: number[];
  normal: Point;
  ends: [number, number];
};

function polygonIndices(points: Point[], normal: Point): number[] {
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const project = (p: Point): [number, number] => axis === 0 ? [p.y, p.z] : axis === 1 ? [p.z, p.x] : [p.x, p.y];
  const sorted = points.map((p, i) => ({ i, q: project(p) })).sort((a, b) => a.q[0] - b.q[0] || a.q[1] - b.q[1]);
  const turn = (a: typeof sorted[number], b: typeof sorted[number], c: typeof sorted[number]): number =>
    (b.q[0] - a.q[0]) * (c.q[1] - a.q[1]) - (b.q[1] - a.q[1]) * (c.q[0] - a.q[0]);
  const chain = (values: typeof sorted): typeof sorted => {
    const result: typeof sorted = [];
    for (const p of values) {
      while (result.length >= 2) {
        const a = result[result.length - 2]!, b = result[result.length - 1]!;
        const edgeLength = Math.hypot(b.q[0] - a.q[0], b.q[1] - a.q[1]);
        if (turn(a, b, p) > RELATIVE_TOLERANCE * edgeLength) break;
        result.pop();
      }
      result.push(p);
    }
    return result;
  };
  const lower = chain(sorted), upper = chain([...sorted].reverse());
  lower.pop(); upper.pop();
  const result = lower.concat(upper).map((v) => v.i);
  const component = axis === 0 ? normal.x : axis === 1 ? normal.y : normal.z;
  if (component < 0) result.reverse();
  return result;
}

function build(nodes: VertexNode[]): Built {
  if (nodes.length > MAX_INPUT_POINTS) throw new RangeError(`ConvexHull: at most ${MAX_INPUT_POINTS} input points are supported`);
  const unique: VertexNode[] = [];
  const keys = new Set<string>();
  for (const node of nodes) {
    const p = node.point;
    if (!finite(p)) throw new RangeError("ConvexHull: coordinates must be finite");
    const key = `${p.x},${p.y},${p.z}`;
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(node);
      if (unique.length > MAX_UNIQUE_POINTS) throw new RangeError(`ConvexHull: at most ${MAX_UNIQUE_POINTS} unique points are supported`);
    }
  }
  const empty: Built = { dimension: -1, center: { x: 0, y: 0, z: 0 }, scale: 1, points: [], nodes: unique, triangles: [], polygon: [], normal: { x: 0, y: 0, z: 0 }, ends: [0, 0] };
  if (!unique.length) return empty;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const { point: p } of unique) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
  }
  const center = { x: midpoint(minX, maxX), y: midpoint(minY, maxY), z: midpoint(minZ, maxZ) };
  let scale = 0;
  for (const { point: p } of unique) scale = Math.max(scale, Math.abs(p.x - center.x), Math.abs(p.y - center.y), Math.abs(p.z - center.z));
  if (!Number.isFinite(scale)) throw new RangeError("ConvexHull: coordinate range exceeds numerical limits");
  if (!scale) return { ...empty, dimension: 0, center, scale: 1, points: [{ x: 0, y: 0, z: 0 }], nodes: unique };
  const points = unique.map(({ point: p }) => ({ x: (p.x - center.x) / scale, y: (p.y - center.y) / scale, z: (p.z - center.z) / scale }));
  const result: Built = { ...empty, center, scale, points, nodes: unique };
  let a = 0, b = 0, best = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dot(sub(points[i]!, points[a]!), sub(points[i]!, points[a]!));
    if (d > best) { best = d; b = i; }
  }
  a = b; best = 0;
  for (let i = 0; i < points.length; i++) {
    const d = dot(sub(points[i]!, points[a]!), sub(points[i]!, points[a]!));
    if (d > best) { best = d; b = i; }
  }
  const line = sub(points[b]!, points[a]!);
  const lineLength = magnitude(line);
  if (!(lineLength > RELATIVE_TOLERANCE)) return { ...result, dimension: 0 };
  let c = a; best = 0;
  for (let i = 0; i < points.length; i++) {
    const d = magnitude(cross(line, sub(points[i]!, points[a]!))) / lineLength;
    if (d > best) { best = d; c = i; }
  }
  if (!(best > RELATIVE_TOLERANCE)) {
    let lo = 0, hi = 0, low = Infinity, high = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const projection = dot(line, sub(points[i]!, points[a]!));
      if (projection < low) { low = projection; lo = i; }
      if (projection > high) { high = projection; hi = i; }
    }
    return { ...result, dimension: 1, ends: [lo, hi] };
  }
  const normal = unit(cross(line, sub(points[c]!, points[a]!)));
  let dIndex = a; best = 0;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(dot(normal, sub(points[i]!, points[a]!)));
    if (d > best) { best = d; dIndex = i; }
  }
  if (!(best > RELATIVE_TOLERANCE)) {
    const polygon = polygonIndices(points, normal);
    if (polygon.length < 3) throw new RangeError("ConvexHull: planar polygon is numerically degenerate");
    const triangles: Triangle[] = [];
    for (let i = 1; i + 1 < polygon.length; i++) {
      triangles.push({ a: polygon[0]!, b: polygon[i]!, c: polygon[i + 1]!, normal });
      // Use a different fan root on the reverse side. Reusing the front fan
      // would make each interior diagonal incident to four faces.
      triangles.push({ a: polygon[1]!, b: polygon[(1 - i + polygon.length) % polygon.length]!, c: polygon[(polygon.length - i) % polygon.length]!, normal: { x: -normal.x, y: -normal.y, z: -normal.z } });
    }
    return { ...result, dimension: 2, normal, polygon, triangles };
  }
  const interior = {
    x: (points[a]!.x + points[b]!.x + points[c]!.x + points[dIndex]!.x) / 4,
    y: (points[a]!.y + points[b]!.y + points[c]!.y + points[dIndex]!.y) / 4,
    z: (points[a]!.z + points[b]!.z + points[c]!.z + points[dIndex]!.z) / 4,
  };
  let faces = [triangle(a, b, c, points, interior), triangle(a, dIndex, b, points, interior), triangle(b, dIndex, c, points, interior), triangle(c, dIndex, a, points, interior)];
  const seed = new Set([a, b, c, dIndex]);
  let tests = 0;
  for (let i = 0; i < points.length; i++) {
    if (seed.has(i)) continue;
    tests += faces.length;
    if (tests > MAX_FACE_TESTS) throw new RangeError(`ConvexHull: exceeds ${MAX_FACE_TESTS} face tests`);
    const visible = faces.map((face) => dot(face.normal, sub(points[i]!, points[face.a]!)) > RELATIVE_TOLERANCE);
    if (!visible.some(Boolean)) continue;
    const boundary = new Map<string, [number, number]>();
    const kept: Triangle[] = [];
    for (let f = 0; f < faces.length; f++) {
      const face = faces[f]!;
      if (!visible[f]) { kept.push(face); continue; }
      for (const [u, v] of [[face.a, face.b], [face.b, face.c], [face.c, face.a]] as [number, number][]) {
        const reverse = `${v}:${u}`;
        if (boundary.has(reverse)) boundary.delete(reverse);
        else {
          const key = `${u}:${v}`;
          if (boundary.has(key)) throw new RangeError("ConvexHull: non-manifold visible faces");
          boundary.set(key, [u, v]);
        }
      }
    }
    if (boundary.size < 3) throw new RangeError("ConvexHull: invalid horizon");
    for (const [u, v] of boundary.values()) kept.push(triangle(u, v, i, points, interior));
    faces = kept;
  }
  tests += faces.length * points.length;
  if (tests > MAX_FACE_TESTS) throw new RangeError(`ConvexHull: exceeds ${MAX_FACE_TESTS} face tests`);
  // Validate supporting planes before publishing the new state.
  for (const face of faces) for (const p of points) {
    if (dot(face.normal, sub(p, points[face.a]!)) > RELATIVE_TOLERANCE * 4) {
      throw new RangeError("ConvexHull: numerical precision prevents a valid hull");
    }
  }
  return { ...result, dimension: 3, triangles: faces };
}

const hullStates = new WeakMap<ConvexHull, Built>();

type EdgeSnapshot = {
  edge: HalfEdge;
  prev: HalfEdge | null;
  next: HalfEdge | null;
  twin: HalfEdge | null;
  vertex: VertexNode;
  point: HullPoint3;
  coordinates: [number, number, number];
};
type FaceSnapshot = {
  face: ConvexHullFace;
  edge: HalfEdge;
  normal: [number, number, number];
  midpoint: [number, number, number];
  area: number;
  constant: number;
  edges: EdgeSnapshot[];
};
const hullFaceSnapshots = new WeakMap<ConvexHull, FaceSnapshot[]>();

function coordinates(point: Point): [number, number, number] { return [point.x, point.y, point.z]; }
function sameCoordinates(point: Point | null | undefined, saved: [number, number, number]): boolean {
  return !!point && Object.is(point.x, saved[0]) && Object.is(point.y, saved[1]) && Object.is(point.z, saved[2]);
}

function snapshotFaces(faces: ConvexHullFace[]): FaceSnapshot[] {
  return faces.map((face) => {
    if (!face.edge) throw new RangeError("ConvexHull: face has no edge");
    const edges = [face.getEdge(0), face.getEdge(1), face.getEdge(2)].map((edge) => ({
      edge, prev: edge.prev, next: edge.next, twin: edge.twin,
      vertex: edge.vertex, point: edge.vertex.point, coordinates: coordinates(edge.vertex.point),
    }));
    return { face, edge: face.edge, normal: coordinates(face.normal), midpoint: coordinates(face.midpoint), area: face.area, constant: face.constant, edges };
  });
}

function requireUnchangedFaces(hull: ConvexHull): void {
  const snapshots = hullFaceSnapshots.get(hull)!;
  const changed = (): never => { throw new RangeError("ConvexHull: faces were modified; rebuild with compute() or setFromPoints()"); };
  if (hull.faces.length !== snapshots.length) changed();
  for (let i = 0; i < snapshots.length; i++) {
    const saved = snapshots[i]!, face = hull.faces[i];
    if (face !== saved.face || face.edge !== saved.edge || !sameCoordinates(face.normal, saved.normal) ||
        !sameCoordinates(face.midpoint, saved.midpoint) || !Object.is(face.area, saved.area) || !Object.is(face.constant, saved.constant)) changed();
    for (const expected of saved.edges) {
      const edge = expected.edge;
      if (edge.face !== face || edge.prev !== expected.prev || edge.next !== expected.next || edge.twin !== expected.twin ||
          edge.vertex !== expected.vertex || edge.vertex.point !== expected.point || !sameCoordinates(edge.vertex.point, expected.coordinates)) changed();
    }
  }
}

function queryTolerance(hull: ConvexHull, built: Built): number {
  if (!Number.isFinite(hull.tolerance) || hull.tolerance < 0) throw new RangeError("ConvexHull: tolerance must be finite and non-negative");
  const normalized = hull.tolerance / built.scale;
  if (!Number.isFinite(normalized)) throw new RangeError("ConvexHull: tolerance exceeds the numerical query limit");
  return Math.max(RELATIVE_TOLERANCE * 4, normalized);
}

function rebuildHull(hull: ConvexHull, nodes: VertexNode[]): void {
  const built = build(nodes);
  const faces: ConvexHullFace[] = [];
  const edges = new Map<string, HalfEdge>();
  const paired = new Set<string>();
  const usedVertices = new Set<VertexNode>();
  for (const t of built.triangles) {
    const face = ConvexHullFace.create(built.nodes[t.a]!, built.nodes[t.b]!, built.nodes[t.c]!);
    faces.push(face);
    usedVertices.add(built.nodes[t.a]!);
    usedVertices.add(built.nodes[t.b]!);
    usedVertices.add(built.nodes[t.c]!);
    const indices = [t.a, t.b, t.c];
    // An edge's head is its vertex and its tail is its previous vertex.
    for (let k = 0; k < 3; k++) {
      const edge = face.getEdge(k);
      const u = indices[(k + 2) % 3]!, v = indices[k]!;
      const reverse = `${v}:${u}`;
      const pairKey = u < v ? `${u}:${v}` : `${v}:${u}`;
      if (paired.has(pairKey)) throw new RangeError("ConvexHull: more than two faces share an edge");
      const other = edges.get(reverse);
      if (other) { edge.setTwin(other); edges.delete(reverse); paired.add(pairKey); }
      else {
        const key = `${u}:${v}`;
        if (edges.has(key)) throw new RangeError("ConvexHull: non-manifold edge orientation");
        edges.set(key, edge);
      }
    }
  }
  if (edges.size) throw new RangeError("ConvexHull: unpaired boundary edge");
  if (faces.length) {
    if (usedVertices.size - paired.size + faces.length !== 2) throw new RangeError("ConvexHull: invalid surface topology");
    const visited = new Set<ConvexHullFace>();
    const pending = [faces[0]!];
    while (pending.length) {
      const face = pending.pop()!;
      if (visited.has(face)) continue;
      visited.add(face);
      for (let i = 0; i < 3; i++) {
        const twin = face.getEdge(i).twin;
        if (!twin) throw new RangeError("ConvexHull: unpaired boundary edge");
        pending.push(twin.face);
      }
    }
    if (visited.size !== faces.length) throw new RangeError("ConvexHull: disconnected surface");
  }
  const snapshots = snapshotFaces(faces);
  // Validate both public bookkeeping lists before changing either one or
  // publishing a replacement hull. A damaged list must not leave half of a
  // failed rebuild visible to subsequent queries.
  const assignedNodes = nodesForClear(hull.assigned);
  const unassignedNodes = nodesForClear(hull.unassigned);
  clearOwnedNodes(hull.assigned, assignedNodes);
  clearOwnedNodes(hull.unassigned, unassignedNodes);
  hull.vertices = nodes;
  hullStates.set(hull, built);
  hull.faces = faces;
  hullFaceSnapshots.set(hull, snapshots);
  hull.newFaces = [];
  hull.tolerance = built.dimension <= 0 ? 0 : RELATIVE_TOLERANCE * built.scale;
}

function normalize(built: Built, p: Point): Point {
  return { x: (p.x - built.center.x) / built.scale, y: (p.y - built.center.y) / built.scale, z: (p.z - built.center.z) / built.scale };
}
function containsNormalized(b: Built, p: Point, eps: number): boolean {
  // Account for rounding while evaluating a point on a tolerance boundary.
  eps += RELATIVE_TOLERANCE;
  if (!finite(p) || b.dimension < 0) return false;
  if (b.dimension === 0) return magnitude(sub(p, b.points[0]!)) <= eps;
  if (b.dimension === 1) {
    const a = b.points[b.ends[0]]!, e = sub(b.points[b.ends[1]]!, a), q = sub(p, a);
    const length = magnitude(e), projection = dot(q, e) / length;
    return projection >= -eps && projection <= length + eps && magnitude(cross(e, q)) / length <= eps;
  }
  if (b.dimension === 2) {
    const origin = b.points[b.polygon[0]!]!;
    if (Math.abs(dot(b.normal, sub(p, origin))) > eps) return false;
    for (let i = 0; i < b.polygon.length; i++) {
      const a = b.points[b.polygon[i]!]!, c = b.points[b.polygon[(i + 1) % b.polygon.length]!]!;
      const edge = sub(c, a);
      if (dot(cross(edge, sub(p, a)), b.normal) < -eps * magnitude(edge)) return false;
    }
    return true;
  }
  return b.triangles.every((f) => dot(f.normal, sub(p, b.points[f.a]!)) <= eps);
}

/**
 * Triangular convex surface built from finite points. Empty, point, segment,
 * and planar inputs are supported; a planar polygon has two triangulated
 * sides. Point containment is exact for a singleton when tolerance is zero.
 * Other dimensions use the public, finite non-negative tolerance in coordinate
 * units, with a small scale-relative numerical floor. For solids, containment
 * and ray intersection use the supporting planes expanded by that tolerance;
 * ray intersection returns the first boundary hit (the exit when the origin
 * is inside). For lower dimensions it returns the first point on the hull,
 * allowing the tolerance for proximity and parallelism tests.
 *
 * Inputs are limited to 100,000 points, 8,192 distinct points, and 25 million
 * face tests. Invalid coordinates, exceeded limits, and detected numerical or
 * topology failures throw RangeError without replacing the preceding hull.
 * Construction treats separations no larger than 32 machine epsilons of the
 * hull's coordinate scale as degenerate; it does not use exact predicates.
 * Rays whose origins are more than 2^48 hull scales from its center are
 * rejected because ordinary floating-point clipping cannot reliably resolve
 * intersections at those distances.
 * Face area or plane constants outside the number range can be infinite.
 *
 * The faces and edge graph are snapshots of the last successful build. They
 * may be inspected but not edited in place: queries reject changes rather than
 * silently use stale geometry. Modify vertices and call compute(), or call
 * setFromPoints(), to replace the snapshot. Changes to vertices take effect on
 * the next compute(); newFaces, assigned, and unassigned are bookkeeping and
 * do not affect queries.
 */
export class ConvexHull {
  tolerance = 0;
  faces: ConvexHullFace[] = [];
  newFaces: ConvexHullFace[] = [];
  readonly assigned = new VertexList();
  readonly unassigned = new VertexList();
  vertices: VertexNode[] = [];
  constructor() { hullStates.set(this, build([])); hullFaceSnapshots.set(this, []); }

  static fromPoints(points: readonly HullPoint3[]): ConvexHull { return new ConvexHull().setFromPoints(points); }
  setFromPoints(points: readonly HullPoint3[]): this {
    if (points.length > MAX_INPUT_POINTS) throw new RangeError(`ConvexHull: at most ${MAX_INPUT_POINTS} input points are supported`);
    const nodes = points.map((point) => new VertexNode(point));
    rebuildHull(this, nodes);
    return this;
  }
  compute(): this { rebuildHull(this, this.vertices); return this; }
  makeEmpty(): this {
    const assignedNodes = nodesForClear(this.assigned);
    const unassignedNodes = nodesForClear(this.unassigned);
    clearOwnedNodes(this.assigned, assignedNodes);
    clearOwnedNodes(this.unassigned, unassignedNodes);
    this.vertices = [];
    this.faces = [];
    this.newFaces = [];
    hullStates.set(this, build([]));
    hullFaceSnapshots.set(this, []);
    this.tolerance = 0;
    return this;
  }

  containsPoint(point: HullPoint3): boolean {
    if (!finite(point)) return false;
    const built = hullStates.get(this)!;
    requireUnchangedFaces(this);
    const eps = queryTolerance(this, built);
    if (built.dimension === 0) {
      return magnitude(sub(point, built.center)) <= this.tolerance;
    }
    return containsNormalized(built, normalize(built, point), eps);
  }

  intersectRay(ray: HullRayLike): HullVector3 | undefined {
    const b = hullStates.get(this)!;
    requireUnchangedFaces(this);
    if (b.dimension < 0 || !finite(ray.origin) || !finite(ray.direction)) return undefined;
    const p = normalize(b, ray.origin);
    const maxDirection = Math.max(Math.abs(ray.direction.x), Math.abs(ray.direction.y), Math.abs(ray.direction.z));
    if (!maxDirection) return undefined;
    if (!finite(p) || Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) > MAX_NORMALIZED_RAY_ORIGIN) {
      throw new RangeError("ConvexHull: ray origin is beyond the numerical query limit");
    }
    const d = { x: ray.direction.x / maxDirection, y: ray.direction.y / maxDirection, z: ray.direction.z / maxDirection };
    const eps = queryTolerance(this, b);
    let s = Infinity;
    let hitPoint: Point | undefined;
    if (b.dimension === 3) {
      let near = -Infinity, far = Infinity;
      let nearFace: Triangle | undefined, farFace: Triangle | undefined;
      for (const face of b.triangles) {
        const offset = dot(face.normal, sub(p, b.points[face.a]!));
        const slope = dot(face.normal, d);
        if (slope === 0) { if (offset > eps) return undefined; continue; }
        const hit = (eps - offset) / slope;
        if (slope < 0 && hit > near) { near = hit; nearFace = face; }
        else if (slope > 0 && hit < far) { far = hit; farFace = face; }
        if (near > far) return undefined;
      }
      if (far < 0) return undefined;
      s = near >= 0 ? near : far;
      const hitFace = near >= 0 ? nearFace : farFace;
      if (hitFace && Number.isFinite(s)) {
        const provisional = addScaled(p, d, s);
        const error = dot(hitFace.normal, sub(provisional, b.points[hitFace.a]!));
        const slope = dot(hitFace.normal, d);
        hitPoint = addScaled(provisional, d, (eps - error) / slope);
        if (!containsNormalized(b, hitPoint, eps)) throw new RangeError("ConvexHull: ray intersection exceeds numerical precision");
      }
    } else if (b.dimension === 2) {
      const offset = dot(b.normal, sub(p, b.points[b.polygon[0]!]!)), slope = dot(b.normal, d);
      if (slope !== 0) {
        s = -offset / slope;
        if (s < -eps || !containsNormalized(b, addScaled(p, d, Math.max(0, s)), eps)) return undefined;
        s = Math.max(0, s);
      } else {
        if (Math.abs(offset) > eps) return undefined;
        let near = 0, far = Infinity;
        for (let i = 0; i < b.polygon.length; i++) {
          const a = b.points[b.polygon[i]!]!, z = b.points[b.polygon[(i + 1) % b.polygon.length]!]!;
          const edge = sub(z, a), value = dot(cross(edge, sub(p, a)), b.normal), change = dot(cross(edge, d), b.normal);
          if (change === 0) {
            if (value < -eps * magnitude(edge)) return undefined;
          } else if (change > 0) near = Math.max(near, -value / change);
          else far = Math.min(far, -value / change);
          if (near > far + eps) return undefined;
        }
        s = near;
      }
    } else {
      const a = b.points[b.dimension === 0 ? 0 : b.ends[0]]!;
      const e = b.dimension === 0 ? { x: 0, y: 0, z: 0 } : sub(b.points[b.ends[1]]!, a);
      const q = sub(a, p), dd = dot(d, d), ee = dot(e, e), axis = cross(d, e), det = dot(axis, axis);
      if (!ee) {
        s = dot(q, d) / dd;
        if (s < -eps || magnitude(sub(addScaled(p, d, Math.max(0, s)), a)) > eps) return undefined;
        s = Math.max(0, s);
        hitPoint = a;
      } else if (det > 0) {
        s = dot(cross(q, e), axis) / det;
        const u = dot(cross(q, d), axis) / det;
        if (s < -eps || u < -eps || u > 1 + eps || magnitude(sub(addScaled(p, d, Math.max(0, s)), addScaled(a, e, u))) > eps) return undefined;
        s = Math.max(0, s);
        hitPoint = addScaled(a, e, Math.max(0, Math.min(1, u)));
      } else {
        if (magnitude(cross(q, d)) / Math.sqrt(dd) > eps) return undefined;
        const s1 = dot(q, d) / dd, s2 = dot(sub(addScaled(a, e, 1), p), d) / dd;
        if (Math.max(s1, s2) < -eps) return undefined;
        s = Math.max(0, Math.min(s1, s2));
      }
    }
    if (!Number.isFinite(s)) return undefined;
    // Reconstruct from the normalized hull coordinates; this avoids overflowing
    // an intermediate ray parameter when the caller's direction is tiny.
    const hit = hitPoint ?? addScaled(p, d, s);
    return new HullVector3(b.center.x + hit.x * b.scale, b.center.y + hit.y * b.scale, b.center.z + hit.z * b.scale);
  }
  intersectsRay(ray: HullRayLike): boolean { return this.intersectRay(ray) !== undefined; }
}
