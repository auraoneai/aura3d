/**
 * Polygon triangulation based on visibility cuts and ear clipping.
 *
 * The predicates use the exact values represented by the input binary64s when
 * ordinary floating-point arithmetic cannot determine an orientation. A ring
 * must be simple; holes must be disjoint and strictly inside the outer ring.
 * Adjacent duplicate points, a repeated closing point, and points lying between
 * collinear neighbours are accepted. Other touching or crossing edges fail
 * explicitly. Empty and entirely collinear rings contribute no area.
 * Triangulation accepts at most 4,096 holes and has an eight-million-predicate
 * budget; exceeding either limit throws a RangeError instead of returning
 * partial work. Certified visible fans and convex contours use fast paths that
 * can accommodate large rings; exact-coordinate spatial indexes accelerate
 * other contours and holes, but valid complex inputs can still exceed the
 * budget. Index building, traversal, and updates also count against the budget.
 * Area and winding queries do not impose these limits.
 *
 * `triangulateShape` indices address the contour followed by its holes after
 * removing one repeated terminal point from each ring. Other supplied points
 * retain their slots, including redundant or collinear points. `earcut` indices
 * instead address the original flat data. Neither function mutates its input.
 * Triangles are counterclockwise in the xy plane.
 */

export interface PolygonPoint {
  readonly x: number;
  readonly y: number;
}

const MAX_HOLES = 4096;
const MAX_PREDICATES = 8_000_000;
const NORMAL_MIN = 2 ** -1022;
const ROUNDING_BOUND = 8 * Number.EPSILON;

type Dyadic = { mantissa: bigint; exponent: number };
type Vertex = PolygonPoint & { readonly ix: bigint; readonly iy: bigint; readonly index: number };
type Ring = Vertex[];

function decode(value: number, view: DataView): Dyadic {
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = (exponent === 0 ? fraction : (1n << 52n) | fraction) * ((bits >> 63n) === 0n ? 1n : -1n);
  return { mantissa, exponent: exponent === 0 ? -1074 : exponent - 1075 };
}

function verticesOf(rings: readonly (readonly PolygonPoint[])[]): { rings: Ring[]; exponent: number } {
  const view = new DataView(new ArrayBuffer(8));
  const decoded: { point: PolygonPoint; x: Dyadic; y: Dyadic; index: number }[][] = [];
  let commonExponent = Infinity;
  let index = 0;
  for (const ring of rings) {
    const current: { point: PolygonPoint; x: Dyadic; y: Dyadic; index: number }[] = [];
    for (const point of ring) {
      if (!point || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new TypeError("Polygon coordinates must be finite numbers");
      }
      const x = decode(point.x, view);
      const y = decode(point.y, view);
      if (x.mantissa !== 0n) commonExponent = Math.min(commonExponent, x.exponent);
      if (y.mantissa !== 0n) commonExponent = Math.min(commonExponent, y.exponent);
      current.push({ point, x, y, index: index++ });
    }
    decoded.push(current);
  }
  if (commonExponent === Infinity) commonExponent = 0;
  const integer = (number: Dyadic): bigint => number.mantissa === 0n ? 0n : number.mantissa << BigInt(number.exponent - commonExponent);
  return {
    exponent: commonExponent,
    rings: decoded.map((ring) => ring.map(({ point, x, y, index: vertexIndex }) => ({
      x: point.x, y: point.y, ix: integer(x), iy: integer(y), index: vertexIndex,
    }))),
  };
}

function exactCross(a: Vertex, b: Vertex, c: Vertex): bigint {
  return (b.ix - a.ix) * (c.iy - a.iy) - (b.iy - a.iy) * (c.ix - a.ix);
}

class Predicate {
  private operations = 0;

  spend(): void {
    if (++this.operations > MAX_PREDICATES) throw new RangeError("Polygon triangulation exceeded its operation limit");
  }

  orientation(a: Vertex, b: Vertex, c: Vertex): number {
    this.spend();
    const p = (b.x - a.x) * (c.y - a.y);
    const q = (b.y - a.y) * (c.x - a.x);
    const difference = p - q;
    const magnitude = Math.abs(p) + Math.abs(q);
    if (Number.isFinite(magnitude) && magnitude >= NORMAL_MIN && Math.abs(difference) > ROUNDING_BOUND * magnitude) {
      return Math.sign(difference);
    }
    const exact = exactCross(a, b, c);
    return exact > 0n ? 1 : exact < 0n ? -1 : 0;
  }
}

function same(a: Vertex, b: Vertex): boolean {
  return a.ix === b.ix && a.iy === b.iy;
}

function between(a: bigint, b: bigint, value: bigint): boolean {
  return value >= (a < b ? a : b) && value <= (a > b ? a : b);
}

type Bounds = { minX: bigint; minY: bigint; maxX: bigint; maxY: bigint };
type SpatialEntry<T> = { value: T; bounds: Bounds; node?: SpatialNode<T> };
type SpatialNode<T> = Bounds & {
  parent: SpatialNode<T> | null;
  left: SpatialNode<T> | null;
  right: SpatialNode<T> | null;
  active: boolean;
  value?: T;
};

function pointBounds(a: Vertex, b: Vertex = a): Bounds {
  return {
    minX: a.ix < b.ix ? a.ix : b.ix, minY: a.iy < b.iy ? a.iy : b.iy,
    maxX: a.ix > b.ix ? a.ix : b.ix, maxY: a.iy > b.iy ? a.iy : b.iy,
  };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: a.minX < b.minX ? a.minX : b.minX, minY: a.minY < b.minY ? a.minY : b.minY,
    maxX: a.maxX > b.maxX ? a.maxX : b.maxX, maxY: a.maxY > b.maxY ? a.maxY : b.maxY,
  };
}

function boxesOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * Conservative bounding-volume hierarchy in the exact integer coordinate
 * system. Its tests can only remove disjoint boxes; geometric decisions still
 * use the predicates below. Leaves can be removed or widened as ears clip.
 */
class SpatialIndex<T> {
  private readonly root: SpatialNode<T> | null;

  constructor(entries: SpatialEntry<T>[], private readonly pred: Predicate) {
    const build = (items: SpatialEntry<T>[], parent: SpatialNode<T> | null): SpatialNode<T> | null => {
      if (items.length === 0) return null;
      let bounds = items[0].bounds;
      for (let i = 1; i < items.length; i++) {
        pred.spend();
        bounds = unionBounds(bounds, items[i].bounds);
      }
      const node: SpatialNode<T> = { ...bounds, parent, left: null, right: null, active: true };
      if (items.length === 1) {
        node.value = items[0].value;
        items[0].node = node;
        return node;
      }
      const xAxis = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY;
      items.sort((a, b) => {
        pred.spend();
        const aCenter = xAxis ? a.bounds.minX + a.bounds.maxX : a.bounds.minY + a.bounds.maxY;
        const bCenter = xAxis ? b.bounds.minX + b.bounds.maxX : b.bounds.minY + b.bounds.maxY;
        return aCenter < bCenter ? -1 : aCenter > bCenter ? 1 : 0;
      });
      const middle = Math.floor(items.length / 2);
      node.left = build(items.slice(0, middle), node);
      node.right = build(items.slice(middle), node);
      return node;
    };
    this.root = build(entries.slice(), null);
  }

  update(entry: SpatialEntry<T>, bounds: Bounds | null): void {
    let node = entry.node!;
    node.active = bounds !== null;
    if (bounds) {
      entry.bounds = bounds;
      Object.assign(node, bounds);
    }
    while (node.parent) {
      this.pred.spend();
      node = node.parent;
      const left = node.left!, right = node.right!;
      node.active = left.active || right.active;
      if (left.active && right.active) Object.assign(node, unionBounds(left, right));
      else if (left.active) Object.assign(node, { minX: left.minX, minY: left.minY, maxX: left.maxX, maxY: left.maxY });
      else if (right.active) Object.assign(node, { minX: right.minX, minY: right.minY, maxX: right.maxX, maxY: right.maxY });
    }
  }

  visit(intersects: (bounds: Bounds) => boolean, visitor: (value: T) => boolean): boolean {
    const stack = this.root ? [this.root] : [];
    while (stack.length > 0) {
      const node = stack.pop()!;
      this.pred.spend();
      if (!node.active || !intersects(node)) continue;
      if (node.left && node.right) stack.push(node.left, node.right);
      else if (!visitor(node.value!)) return false;
    }
    return true;
  }
}

function onSegment(a: Vertex, b: Vertex, p: Vertex, pred: Predicate): boolean {
  return between(a.ix, b.ix, p.ix) && between(a.iy, b.iy, p.iy) && pred.orientation(a, b, p) === 0;
}

function cleanRing(input: Ring, pred: Predicate): Ring {
  const ring: Ring = [];
  for (const point of input) if (ring.length === 0 || !same(point, ring[ring.length - 1])) ring.push(point);
  while (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
  let changed = true;
  while (changed && ring.length >= 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length];
      const b = ring[i];
      const c = ring[(i + 1) % ring.length];
      if (!same(a, c) && onSegment(a, c, b, pred)) {
        ring.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return ring;
}

function twiceArea(ring: Ring): bigint {
  let sum = 0n;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.ix * b.iy - b.ix * a.iy;
  }
  return sum;
}

function scaledInteger(value: bigint, exponent: number): number {
  if (value === 0n) return 0;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const highestBit = exponent + magnitude.toString(2).length - 1;
  if (highestBit > 1023) return negative ? -Infinity : Infinity;
  if (highestBit < -1075) return negative ? -0 : 0;

  // Round the exact dyadic number once, to the binary64 spacing at its
  // magnitude. Subnormals all use the same 2^-1074 spacing. Ties choose the
  // even integer significand, including at zero and the overflow boundary.
  const unitExponent = highestBit >= -1022 ? highestBit - 52 : -1074;
  const shift = unitExponent - exponent;
  let significand: bigint;
  if (shift <= 0) {
    significand = magnitude << BigInt(-shift);
  } else {
    const shiftBits = BigInt(shift);
    significand = magnitude >> shiftBits;
    const remainder = magnitude - (significand << shiftBits);
    const halfway = 1n << (shiftBits - 1n);
    if (remainder > halfway || (remainder === halfway && (significand & 1n) !== 0n)) significand++;
  }
  const result = Number(significand) * 2 ** unitExponent;
  return negative ? -result : result;
}

function isCollinear(ring: Ring, pred: Predicate): boolean {
  if (ring.length < 3) return true;
  let second = 1;
  while (second < ring.length && same(ring[0], ring[second])) second++;
  if (second === ring.length) return true;
  for (let i = second + 1; i < ring.length; i++) if (pred.orientation(ring[0], ring[second], ring[i]) !== 0) return false;
  return true;
}

function segmentsMeet(a: Vertex, b: Vertex, c: Vertex, d: Vertex, pred: Predicate): boolean {
  pred.spend();
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
      Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
  const abC = pred.orientation(a, b, c);
  const abD = pred.orientation(a, b, d);
  const cdA = pred.orientation(c, d, a);
  const cdB = pred.orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && onSegment(a, b, c, pred)) || (abD === 0 && onSegment(a, b, d, pred)) ||
    (cdA === 0 && onSegment(c, d, a, pred)) || (cdB === 0 && onSegment(c, d, b, pred));
}

// Coordinates of p are doubled, allowing an exact midpoint without division.
function locate(ring: Ring, px: bigint, py: bigint, pred: Predicate): -1 | 0 | 1 {
  let winding = 0;
  for (let i = 0; i < ring.length; i++) {
    pred.spend();
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ax = 2n * a.ix;
    const ay = 2n * a.iy;
    const bx = 2n * b.ix;
    const by = 2n * b.iy;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0n && between(ax, bx, px) && between(ay, by, py)) return 0;
    if (ay <= py && by > py && cross > 0n) winding++;
    if (ay > py && by <= py && cross < 0n) winding--;
  }
  return winding === 0 ? -1 : 1;
}

type BoundaryEdge = { a: Vertex; b: Vertex; ring: number; position: number; id: number };

// The union of valid disjoint rings uses even-odd containment. A ray query
// visits every edge that could cross the exact doubled-coordinate ray, and
// the final boundary and crossing decisions use integer arithmetic.
function locateIndexed(index: SpatialIndex<BoundaryEdge>, px: bigint, py: bigint): -1 | 0 | 1 {
  let inside = false;
  let boundary = false;
  index.visit((box) => 2n * box.maxX >= px && 2n * box.minY <= py && 2n * box.maxY >= py, (edge) => {
    const ax = 2n * edge.a.ix, ay = 2n * edge.a.iy;
    const bx = 2n * edge.b.ix, by = 2n * edge.b.iy;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0n && between(ax, bx, px) && between(ay, by, py)) {
      boundary = true;
      return false;
    }
    if ((ay <= py && by > py && cross > 0n) || (ay > py && by <= py && cross < 0n)) inside = !inside;
    return true;
  });
  return boundary ? 0 : inside ? 1 : -1;
}

function validateRings(rings: Ring[], pred: Predicate): SpatialIndex<BoundaryEdge> {
  const edges: BoundaryEdge[] = [];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
      if (pred.orientation(a, b, c) === 0) throw new RangeError("Polygon ring backtracks or touches itself");
      edges.push({ a, b, ring: r, position: i, id: edges.length });
    }
  }
  const entries = edges.map((edge) => ({ value: edge, bounds: pointBounds(edge.a, edge.b) }));
  const index = new SpatialIndex(entries, pred);
  for (const edge of edges) {
    const bounds = pointBounds(edge.a, edge.b);
    index.visit((box) => boxesOverlap(box, bounds), (other) => {
      if (other.id <= edge.id) return true;
      if (other.ring === edge.ring) {
        const length = rings[edge.ring].length;
        if ((edge.position + 1) % length === other.position || (other.position + 1) % length === edge.position) return true;
      }
      if (segmentsMeet(edge.a, edge.b, other.a, other.b, pred)) {
        throw new RangeError(other.ring === edge.ring ? "Polygon ring self-intersects or touches itself" : "Polygon rings must not cross or touch");
      }
      return true;
    });
  }

  const outer = new SpatialIndex(edges.filter((edge) => edge.ring === 0).map((edge) => ({
    value: edge, bounds: pointBounds(edge.a, edge.b),
  })), pred);
  const holes = rings.slice(1).map((ring, index) => {
    let bounds = pointBounds(ring[0]);
    for (let i = 1; i < ring.length; i++) {
      pred.spend();
      bounds = unionBounds(bounds, pointBounds(ring[i]));
    }
    return { value: { ring, index: index + 1 }, bounds };
  });
  const holeIndex = new SpatialIndex(holes, pred);
  for (let i = 1; i < rings.length; i++) {
    const point = rings[i][0];
    if (locateIndexed(outer, 2n * point.ix, 2n * point.iy) !== 1) throw new RangeError("A hole must lie strictly inside the contour");
    const bounds = pointBounds(point);
    holeIndex.visit((box) => boxesOverlap(box, bounds), (other) => {
      if (other.index !== i && locate(other.ring, 2n * point.ix, 2n * point.iy, pred) !== -1) {
        throw new RangeError("Polygon holes must not overlap or contain each other");
      }
      return true;
    });
  }
  return index;
}

function endpointIntersectionOnly(a: Vertex, b: Vertex, c: Vertex, d: Vertex, pred: Predicate, allowIdentical: boolean): boolean {
  if (!segmentsMeet(a, b, c, d, pred)) return true;
  const shared = same(a, c) || same(a, d) || same(b, c) || same(b, d);
  if (!shared) return false;
  if ((same(a, c) && same(b, d)) || (same(a, d) && same(b, c))) return allowIdentical;
  if (pred.orientation(a, b, c) !== 0 || pred.orientation(a, b, d) !== 0) return true;
  return !(onSegment(a, b, c, pred) && !same(c, a) && !same(c, b)) &&
    !(onSegment(a, b, d, pred) && !same(d, a) && !same(d, b)) &&
    !(onSegment(c, d, a, pred) && !same(a, c) && !same(a, d)) &&
    !(onSegment(c, d, b, pred) && !same(b, c) && !same(b, d));
}

function clearSegment(a: Vertex, b: Vertex, index: SpatialIndex<BoundaryEdge>, pred: Predicate, allowIdentical: boolean): boolean {
  const bounds = pointBounds(a, b);
  return index.visit((box) => boxesOverlap(box, bounds), (edge) => endpointIntersectionOnly(a, b, edge.a, edge.b, pred, allowIdentical));
}

function insideDomain(a: Vertex, b: Vertex, index: SpatialIndex<BoundaryEdge>): boolean {
  return locateIndexed(index, a.ix + b.ix, a.iy + b.iy) === 1;
}

// A bridge can meet a boundary vertex more than once after prior cuts. The
// occurrence matters: choose the one whose interior angle contains the bridge.
function insideWedge(ring: Ring, index: number, point: Vertex, pred: Predicate): boolean {
  const previous = ring[(index + ring.length - 1) % ring.length];
  const vertex = ring[index];
  const next = ring[(index + 1) % ring.length];
  const turn = pred.orientation(previous, vertex, next);
  const before = pred.orientation(previous, vertex, point);
  const after = pred.orientation(vertex, next, point);
  return turn < 0 ? before > 0 || after > 0 : before > 0 && after > 0;
}

function joinHoles(rings: Ring[], domain: SpatialIndex<BoundaryEdge>, pred: Predicate): Ring {
  let boundary = rings[0].slice();
  if (twiceArea(boundary) < 0n) boundary.reverse();
  const holes = rings.slice(1).map((ring) => {
    const hole = ring.slice();
    if (twiceArea(hole) > 0n) hole.reverse();
    return hole;
  });
  const rightmostX = (ring: Ring): number => ring.reduce((rightmost, point) => Math.max(rightmost, point.x), -Infinity);
  holes.sort((a, b) => { pred.spend(); return rightmostX(b) - rightmostX(a); });
  const bridges: { a: Vertex; b: Vertex }[] = [];
  for (const hole of holes) {
    const sources = hole.map((point, index) => ({ point, index })).sort((a, b) => {
      pred.spend();
      return b.point.x - a.point.x || a.point.y - b.point.y;
    });
    let source = -1;
    let target = -1;
    for (const candidate of sources) {
      const destinations = boundary.map((point, index) => {
        pred.spend();
        return { point, index, distance: Math.hypot(point.x - candidate.point.x, point.y - candidate.point.y) };
      });
      destinations.sort((a, b) => { pred.spend(); return a.distance - b.distance || a.index - b.index; });
      for (const destination of destinations) {
        if (same(candidate.point, destination.point)) continue;
        if (insideWedge(boundary, destination.index, candidate.point, pred) &&
            insideWedge(hole, candidate.index, destination.point, pred) &&
            insideDomain(candidate.point, destination.point, domain) &&
            clearSegment(candidate.point, destination.point, domain, pred, false) &&
            bridges.every((bridge) => endpointIntersectionOnly(candidate.point, destination.point, bridge.a, bridge.b, pred, false))) {
          source = candidate.index;
          target = destination.index;
          break;
        }
      }
      if (source !== -1) break;
    }
    if (source === -1) throw new RangeError("No visible connection to a polygon hole was found");
    const path = [...hole.slice(source), ...hole.slice(0, source)];
    bridges.push({ a: path[0], b: boundary[target] });
    boundary = [...boundary.slice(0, target + 1), ...path, path[0], boundary[target], ...boundary.slice(target + 1)];
  }
  return boundary;
}

function inTriangle(a: Vertex, b: Vertex, c: Vertex, p: Vertex, pred: Predicate): boolean {
  return pred.orientation(a, b, p) >= 0 && pred.orientation(b, c, p) >= 0 && pred.orientation(c, a, p) >= 0;
}

function clip(boundary: Ring, domain: SpatialIndex<BoundaryEdge>, pred: Predicate, simple: boolean): [number, number, number][] {
  const vertices = boundary.map((point, index) => ({
    point,
    previous: (index + boundary.length - 1) % boundary.length,
    next: (index + 1) % boundary.length,
    active: true,
  }));
  const points: SpatialEntry<(typeof vertices)[number]>[] = vertices.map((vertex) => ({
    value: vertex, bounds: pointBounds(vertex.point),
  }));
  const edges: SpatialEntry<BoundaryEdge>[] = vertices.map((vertex, position) => ({
    value: { a: vertex.point, b: vertices[vertex.next].point, ring: 0, position, id: position },
    bounds: pointBounds(vertex.point, vertices[vertex.next].point),
  }));
  const pointIndex = new SpatialIndex(points, pred);
  const edgeIndex = simple ? null : new SpatialIndex(edges, pred);
  const triangles: [number, number, number][] = [];
  let remaining = vertices.length;
  let cursor = 0;

  const remove = (position: number): void => {
    const vertex = vertices[position];
    const previous = vertex.previous, next = vertex.next;
    pointIndex.update(points[position], null);
    if (edgeIndex) {
      edgeIndex.update(edges[position], null);
      edges[previous].value.b = vertices[next].point;
      edgeIndex.update(edges[previous], pointBounds(vertices[previous].point, vertices[next].point));
    }
    vertices[previous].next = next;
    vertices[next].previous = previous;
    vertex.active = false;
    remaining--;
    // On a simple boundary, visit the following corner before returning to the
    // new diagonal. This tends to keep ears local on long serrated contours.
    cursor = simple ? vertices[next].next : next;
  };

  while (remaining > 3) {
    let found = false;
    let position = cursor;
    for (let i = 0; i < remaining; i++) {
      const vertex = vertices[position];
      const a = vertices[vertex.previous].point, b = vertex.point, c = vertices[vertex.next].point;
      if (pred.orientation(a, b, c) > 0) {
        const triangleBounds = unionBounds(pointBounds(a, b), pointBounds(c));
        const unoccupied = pointIndex.visit((box) => boxesOverlap(box, triangleBounds), (other) => {
          const p = other.point;
          return same(p, a) || same(p, b) || same(p, c) || !inTriangle(a, b, c, p, pred);
        });
        // For an already validated simple ring, a convex corner whose closed
        // triangle contains no other boundary vertex is an ear: any boundary
        // edge entering it would otherwise cross one of its two existing sides.
        // Holed boundaries contain repeated bridge vertices and retain the
        // explicit midpoint and edge-intersection checks.
        if (unoccupied && (simple || (insideDomain(a, c, domain) && clearSegment(a, c, edgeIndex!, pred, true)))) {
          triangles.push([a.index, b.index, c.index]);
          remove(position);
          found = true;
          break;
        }
      }
      position = vertex.next;
    }
    if (!found) {
      let removed = false;
      position = cursor;
      for (let i = 0; i < remaining; i++) {
        const vertex = vertices[position];
        const a = vertices[vertex.previous].point, b = vertex.point, c = vertices[vertex.next].point;
        if (!same(a, c) && onSegment(a, c, b, pred)) {
          let occurrences = 0;
          let scan = cursor;
          for (let j = 0; j < remaining; j++) {
            pred.spend();
            if (same(vertices[scan].point, b)) occurrences++;
            scan = vertices[scan].next;
          }
          if (occurrences === 1) {
            remove(position);
            removed = true;
            break;
          }
        }
        position = vertex.next;
      }
      if (!removed) throw new RangeError("Polygon could not be triangulated within the supported topology");
    }
  }
  const a = vertices[cursor].point, b = vertices[vertices[cursor].next].point;
  const c = vertices[vertices[vertices[cursor].next].next].point;
  if (pred.orientation(a, b, c) > 0) {
    triangles.push([a.index, b.index, c.index]);
  } else {
    throw new RangeError("Polygon could not be triangulated within the supported topology");
  }
  return triangles;
}

// A vertex sees the entire boundary when all rays from it stay in the wedge
// between its neighbours and advance strictly through that wedge. The wedge
// must be narrower than a half-turn, so its triangular sectors cannot overlap.
// This certifies a fan for some concave rings as well as convex ones without
// assuming that a merely consistent set of local turns implies simplicity.
function visibleFan(ring: Ring, pred: Predicate): [number, number, number][] | null {
  const boundary = twiceArea(ring) < 0n ? ring.slice().reverse() : ring;
  const origin = boundary[0];
  const first = boundary[1];
  const last = boundary[boundary.length - 1];
  if (pred.orientation(origin, first, last) <= 0) return null;
  const triangles: [number, number, number][] = [];
  for (let i = 1; i < boundary.length - 1; i++) {
    const current = boundary[i];
    const next = boundary[i + 1];
    if (pred.orientation(origin, first, current) < 0 || pred.orientation(origin, current, last) < 0 ||
        pred.orientation(origin, current, next) <= 0) return null;
    triangles.push([origin.index, current.index, next.index]);
  }
  return triangles;
}

// A hull certificate proves both strict convexity and boundary order before
// using a linear fan. Checking local turns alone would admit star polygons.
function convexFan(ring: Ring, pred: Predicate): [number, number, number][] | null {
  const ordered = ring.slice().sort((a, b) => a.x < b.x ? -1 : a.x > b.x ? 1 : a.y < b.y ? -1 : a.y > b.y ? 1 : 0);
  for (let i = 1; i < ordered.length; i++) if (same(ordered[i - 1], ordered[i])) return null;
  const half = (points: Ring): Ring => {
    const boundary: Ring = [];
    for (const point of points) {
      while (boundary.length >= 2 && pred.orientation(boundary[boundary.length - 2], boundary[boundary.length - 1], point) <= 0) boundary.pop();
      boundary.push(point);
    }
    return boundary;
  };
  const lower = half(ordered);
  const upper = half(ordered.slice().reverse());
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length !== ring.length) return null;
  const start = hull.findIndex((point) => point.index === ring[0].index);
  if (start < 0) return null;
  let forward = true;
  let reverse = true;
  for (let i = 0; i < ring.length; i++) {
    if (hull[(start + i) % hull.length].index !== ring[i].index) forward = false;
    if (hull[(start - i + hull.length) % hull.length].index !== ring[i].index) reverse = false;
  }
  if (!forward && !reverse) return null;
  const boundary = forward ? ring : ring.slice().reverse();
  const triangles: [number, number, number][] = [];
  for (let i = 1; i < boundary.length - 1; i++) triangles.push([boundary[0].index, boundary[i].index, boundary[i + 1].index]);
  return triangles;
}

export function shapeArea(contour: readonly PolygonPoint[]): number {
  const result = verticesOf([contour]);
  return scaledInteger(twiceArea(result.rings[0]), 2 * result.exponent - 1);
}

export function isClockWise(pts: readonly PolygonPoint[]): boolean {
  return twiceArea(verticesOf([pts]).rings[0]) < 0n;
}

function triangulateRings(input: readonly (readonly PolygonPoint[])[]): [number, number, number][] {
  const pred = new Predicate();
  const original = verticesOf(input).rings;
  const all = original.map((ring) => cleanRing(ring, pred));
  if (isCollinear(all[0], pred)) return [];
  const rings = [all[0], ...all.slice(1).filter((ring) => !isCollinear(ring, pred))];
  let triangles = rings.length === 1 ? visibleFan(rings[0], pred) ?? convexFan(rings[0], pred) : null;
  if (triangles === null) {
    const domain = validateRings(rings, pred);
    if (rings.some((ring) => twiceArea(ring) === 0n)) throw new RangeError("Polygon rings must have nonzero area");
    triangles = clip(joinHoles(rings, domain, pred), domain, pred, rings.length === 1);
  }
  const points = original.flat();
  const area = rings.map(twiceArea).map((value) => value < 0n ? -value : value);
  const expected = area[0] - area.slice(1).reduce((sum, value) => sum + value, 0n);
  const actual = triangles.reduce((sum, [a, b, c]) => sum + exactCross(points[a], points[b], points[c]), 0n);
  if (actual !== expected) throw new RangeError("Triangulation does not cover the polygon area");
  return triangles;
}

function withoutClosingPoint(ring: readonly PolygonPoint[]): readonly PolygonPoint[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && first.x === last.x && first.y === last.y ? ring.slice(0, -1) : ring;
}

export function triangulateShape(contour: readonly PolygonPoint[], holes: readonly (readonly PolygonPoint[])[]): [number, number, number][] {
  if (holes.length > MAX_HOLES) throw new RangeError(`Polygon exceeds the ${MAX_HOLES}-hole limit`);
  const input = [contour, ...holes];
  return triangulateRings(input.map(withoutClosingPoint));
}

export function earcut(data: ArrayLike<number>, holeIndices: readonly number[] | null, dim = 2): number[] {
  if (!Number.isInteger(dim) || dim < 2) throw new RangeError("Polygon dimension must be an integer of at least 2");
  if (!data || !Number.isSafeInteger(data.length) || data.length < 0 || data.length % dim !== 0) throw new RangeError("Polygon data length must be divisible by its dimension");
  const count = data.length / dim;
  if (holeIndices && holeIndices.length > MAX_HOLES) throw new RangeError(`Polygon exceeds the ${MAX_HOLES}-hole limit`);
  const offsets = [0, ...(holeIndices ?? []), count];
  for (let i = 1; i < offsets.length; i++) {
    if (!Number.isInteger(offsets[i]) || offsets[i] < offsets[i - 1] || offsets[i] > count ||
        (i < offsets.length - 1 && (offsets[i] === offsets[i - 1] || offsets[i] === count))) {
      throw new RangeError("Hole indices must be increasing vertex offsets inside the data");
    }
  }
  const rings: PolygonPoint[][] = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    const ring: PolygonPoint[] = [];
    for (let j = offsets[i]; j < offsets[i + 1]; j++) ring.push({ x: data[j * dim], y: data[j * dim + 1] });
    rings.push(ring);
  }
  return triangulateRings(rings).flat();
}

export const ShapeUtils = { area: shapeArea, isClockWise, triangulateShape } as const;
