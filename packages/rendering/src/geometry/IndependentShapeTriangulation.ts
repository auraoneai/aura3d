/**
 * Independently authored, bounded triangulation of one simple planar contour
 * and disjoint simple holes. Inputs and outputs contain data only; no renderer
 * resources or third-party geometry implementation are involved.
 */
export interface IndependentShapePoint { readonly x: number; readonly y: number }
type Triangle = [number, number, number];
type Vertex = IndependentShapePoint & { readonly index: number };
type Edge = { readonly a: Vertex; readonly b: Vertex; readonly ring: number; readonly edge: number; readonly count: number };

const MAX_VERTICES = 8_192;
const MAX_WORK = 48_000_000;
// All predicates operate in a common translated, unit-size coordinate system.
// Ambiguous contacts near machine precision fail closed as touching/degenerate.
const EPSILON = 32 * Number.EPSILON;

function fail(message: string): never { throw new RangeError(`Shape triangulation: ${message}`); }
function equal(a: IndependentShapePoint, b: IndependentShapePoint): boolean { return a.x === b.x && a.y === b.y; }

/** Snapshot rings and remove at most one repeated closing point per ring. */
export function normalizeIndependentShapeRings(
  outline: readonly IndependentShapePoint[],
  holes: readonly (readonly IndependentShapePoint[])[] = [],
  ordering: "input" | "mesh" = "input"
): IndependentShapePoint[][] {
  if (!Array.isArray(outline) || !Array.isArray(holes)) return fail("contour and holes must be arrays.");
  if (holes.length > MAX_VERTICES) return fail(`capacity exceeds ${MAX_VERTICES} vertices.`);
  const all = [outline, ...holes];
  let total = 0;
  const rings = all.map((ring, ringIndex) => {
    if (!Array.isArray(ring) || ring.length > MAX_VERTICES + 1) return fail(`capacity exceeds ${MAX_VERTICES} vertices.`);
    let length = ring.length;
    if (length > 2 && ring[0] && ring[length - 1] && equal(ring[0]!, ring[length - 1]!)) length -= 1;
    if (length < 3) return fail(`${ringIndex ? "hole" : "contour"} must have at least three vertices.`);
    total += length;
    if (total > MAX_VERTICES) return fail(`capacity exceeds ${MAX_VERTICES} vertices.`);
    const points: IndependentShapePoint[] = [];
    for (let index = 0; index < length; index += 1) {
      const point = ring[index];
      if (!point || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return fail(`${ringIndex ? "hole" : "contour"} has a non-finite point.`);
      }
      points.push({ x: point.x, y: point.y });
    }
    if (points.some((point, index) => equal(point, points[(index + 1) % points.length]!))) return fail("consecutive duplicate points are unsupported.");
    return points;
  });
  if (ordering === "mesh") {
    const normalized = normalizedCoordinates(rings);
    for (let index = 0; index < rings.length; index += 1) {
      const area = area2(normalized[index]!);
      if (Math.abs(area) <= EPSILON) return fail(`${index ? "hole" : "contour"} has no representable area.`);
      const clockwise = area < 0;
      if (clockwise !== (index === 0)) rings[index]!.reverse();
    }
  }
  return rings;
}

function normalizedCoordinates(rings: readonly (readonly IndependentShapePoint[])[]): Vertex[][] {
  const origin = rings[0]![0]!;
  let scale = 0;
  for (const ring of rings) for (const point of ring) {
    const dx = point.x - origin.x, dy = point.y - origin.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fail("coordinate span is not finite.");
    scale = Math.max(scale, Math.abs(dx), Math.abs(dy));
  }
  if (!(scale > 0) || !Number.isFinite(scale)) return fail("contour has no representable area.");
  let index = 0;
  return rings.map((ring) => ring.map((point) => ({ x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale, index: index++ })));
}

function orient(a: IndependentShapePoint, b: IndependentShapePoint, c: IndependentShapePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function sign(value: number): number { return value > EPSILON ? 1 : value < -EPSILON ? -1 : 0; }
function area2(ring: readonly IndependentShapePoint[]): number {
  let sum = 0, correction = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const term = a.x * b.y - a.y * b.x - correction;
    const next = sum + term;
    correction = (next - sum) - term;
    sum = next;
  }
  return sum;
}
function onSegment(a: IndependentShapePoint, b: IndependentShapePoint, p: IndependentShapePoint): boolean {
  return sign(orient(a, b, p)) === 0 && p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON
    && p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON;
}
function overlapsBounds(a: IndependentShapePoint, b: IndependentShapePoint, c: IndependentShapePoint, d: IndependentShapePoint): boolean {
  return Math.max(a.x, b.x) + EPSILON >= Math.min(c.x, d.x) && Math.max(c.x, d.x) + EPSILON >= Math.min(a.x, b.x)
    && Math.max(a.y, b.y) + EPSILON >= Math.min(c.y, d.y) && Math.max(c.y, d.y) + EPSILON >= Math.min(a.y, b.y);
}
function intersects(a: IndependentShapePoint, b: IndependentShapePoint, c: IndependentShapePoint, d: IndependentShapePoint): boolean {
  if (!overlapsBounds(a, b, c, d)) return false;
  const abC = sign(orient(a, b, c)), abD = sign(orient(a, b, d));
  const cdA = sign(orient(c, d, a)), cdB = sign(orient(c, d, b));
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}

/** Returns 1 inside, 0 outside, and -1 on a boundary. */
function inRing(point: IndependentShapePoint, ring: readonly IndependentShapePoint[], consume: () => void): number {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    consume();
    const a = ring[j]!, b = ring[i]!;
    if (onSegment(a, b, point)) return -1;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside ? 1 : 0;
}

function matchingEndpoint(a: Vertex, b: Vertex): boolean { return a.index === b.index || equal(a, b); }
function blocksBridge(a: Vertex, b: Vertex, c: Vertex, d: Vertex): boolean {
  if (!intersects(a, b, c, d)) return false;
  const shared = matchingEndpoint(a, c) || matchingEndpoint(a, d) || matchingEndpoint(b, c) || matchingEndpoint(b, d);
  if (!shared) return true;
  // Merely sharing a vertex is safe; following any positive length of an
  // existing boundary or bridge is not.
  if (sign(orient(a, b, c)) === 0 && sign(orient(a, b, d)) === 0) {
    return (!matchingEndpoint(c, a) && !matchingEndpoint(c, b) && onSegment(a, b, c))
      || (!matchingEndpoint(d, a) && !matchingEndpoint(d, b) && onSegment(a, b, d))
      || (!matchingEndpoint(a, c) && !matchingEndpoint(a, d) && onSegment(c, d, a))
      || (!matchingEndpoint(b, c) && !matchingEndpoint(b, d) && onSegment(c, d, b))
      || ((matchingEndpoint(a, c) && matchingEndpoint(b, d)) || (matchingEndpoint(a, d) && matchingEndpoint(b, c)));
  }
  return false;
}

/**
 * Triangulate a finite simple contour and strictly interior, disjoint holes.
 * Indices address the input rings concatenated after one optional closing
 * duplicate per ring is removed. Returned triangles face +Z. Inputs are not
 * mutated. Self-intersections, touching or nested holes, ambiguous precision,
 * and work above the documented limits fail explicitly.
 */
export function triangulateIndependentShape(
  outline: readonly IndependentShapePoint[], holes: readonly (readonly IndependentShapePoint[])[] = []
): Triangle[] {
  const rings = normalizedCoordinates(normalizeIndependentShapeRings(outline, holes));
  let work = 0;
  const consume = (): void => { if (++work > MAX_WORK) fail(`work budget of ${MAX_WORK} geometric checks exceeded.`); };
  const signedAreas = rings.map(area2);
  if (signedAreas.some((area) => Math.abs(area) <= EPSILON)) return fail("contour or hole has no representable area.");
  const edges: Edge[] = [];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex]!;
    for (let index = 0; index < ring.length; index += 1) {
      const previous = ring[(index + ring.length - 1) % ring.length]!, point = ring[index]!, next = ring[(index + 1) % ring.length]!;
      if (sign(orient(previous, point, next)) === 0 && (previous.x - point.x) * (next.x - point.x) + (previous.y - point.y) * (next.y - point.y) > EPSILON) {
        return fail("contour backtracks over an edge.");
      }
      edges.push({ a: point, b: next, ring: ringIndex, edge: index, count: ring.length });
    }
  }
  for (let i = 0; i < edges.length; i += 1) for (let j = i + 1; j < edges.length; j += 1) {
    consume();
    const a = edges[i]!, b = edges[j]!;
    if (a.ring === b.ring && (a.edge === b.edge || (a.edge + 1) % a.count === b.edge || (b.edge + 1) % b.count === a.edge)) continue;
    if (intersects(a.a, a.b, b.a, b.b)) return fail("contours or holes intersect or touch.");
  }
  const outer = rings[0]!;
  for (let i = 1; i < rings.length; i += 1) {
    if (inRing(rings[i]![0]!, outer, consume) !== 1) return fail("each hole must be strictly inside the contour.");
    for (let j = 1; j < i; j += 1) {
      if (inRing(rings[i]![0]!, rings[j]!, consume) !== 0 || inRing(rings[j]![0]!, rings[i]!, consume) !== 0) {
        return fail("holes must be disjoint and may not be nested.");
      }
    }
  }
  const expectedArea = Math.abs(signedAreas[0]!) - signedAreas.slice(1).reduce((sum, value) => sum + Math.abs(value), 0);
  if (!(expectedArea > EPSILON)) return fail("holes leave no representable surface area.");
  const oriented = rings.map((ring, index) => (signedAreas[index]! > 0) === (index === 0) ? [...ring] : [...ring].reverse());
  if (oriented.length === 1 && oriented[0]!.every((vertex, index, ring) => sign(orient(ring[(index + ring.length - 1) % ring.length]!, vertex, ring[(index + 1) % ring.length]!)) > 0)) {
    const ring = oriented[0]!, triangles: Triangle[] = [];
    for (let i = 1; i + 1 < ring.length; i += 1) triangles.push([ring[0]!.index, ring[i]!.index, ring[i + 1]!.index]);
    return triangles;
  }
  const holesByRightmost = oriented.slice(1).map((ring) => {
    let index = 0;
    for (let i = 1; i < ring.length; i += 1) if (ring[i]!.x > ring[index]!.x || (ring[i]!.x === ring[index]!.x && ring[i]!.y < ring[index]!.y)) index = i;
    return { ring, index, point: ring[index]! };
  }).sort((a, b) => b.point.x - a.point.x || a.point.y - b.point.y || a.point.index - b.point.index);
  let polygon = oriented[0]!;
  const bridges: { readonly a: Vertex; readonly b: Vertex }[] = [];
  for (const hole of holesByRightmost) {
    let chosen = -1, best = Infinity;
    for (let i = 0; i < polygon.length; i += 1) {
      consume();
      const candidate = polygon[i]!;
      if (matchingEndpoint(hole.point, candidate)) continue;
      const dx = candidate.x - hole.point.x, dy = candidate.y - hole.point.y, distance = dx * dx + dy * dy;
      if (distance >= best) continue;
      const midpoint = { x: (candidate.x + hole.point.x) / 2, y: (candidate.y + hole.point.y) / 2 };
      if (inRing(midpoint, outer, consume) !== 1 || rings.slice(1).some((ring) => inRing(midpoint, ring, consume) !== 0)) continue;
      let blocked = false;
      for (const edge of edges) { consume(); if (blocksBridge(hole.point, candidate, edge.a, edge.b)) { blocked = true; break; } }
      if (!blocked) for (const bridge of bridges) { consume(); if (blocksBridge(hole.point, candidate, bridge.a, bridge.b)) { blocked = true; break; } }
      if (!blocked) { chosen = i; best = distance; }
    }
    if (chosen < 0) return fail("could not connect a hole without crossing a boundary.");
    const join = polygon[chosen]!;
    const around = Array.from({ length: hole.ring.length + 1 }, (_, index) => hole.ring[(hole.index + index) % hole.ring.length]!);
    polygon = [...polygon.slice(0, chosen + 1), ...around, ...polygon.slice(chosen)];
    bridges.push({ a: hole.point, b: join });
  }
  return clipEars(polygon, expectedArea, consume);
}

function clipEars(polygon: readonly Vertex[], expectedArea: number, consume: () => void): Triangle[] {
  const count = polygon.length;
  const previous = Array.from({ length: count }, (_, index) => (index + count - 1) % count);
  const next = Array.from({ length: count }, (_, index) => (index + 1) % count);
  const active = new Uint8Array(count).fill(1);
  const triangles: Triangle[] = [];
  let remaining = count, cursor = 0, failed = 0, emittedArea = 0;
  while (remaining > 3) {
    const p = previous[cursor]!, n = next[cursor]!;
    const a = polygon[p]!, b = polygon[cursor]!, c = polygon[n]!;
    const turn = orient(a, b, c);
    let ear = sign(turn) > 0 && a.index !== b.index && b.index !== c.index && c.index !== a.index;
    if (ear) {
      for (let index = next[n]!; index !== p; index = next[index]!) {
        if (!active[index]) continue;
        const point = polygon[index]!;
        if (matchingEndpoint(point, a) || matchingEndpoint(point, b) || matchingEndpoint(point, c)) continue;
        consume();
        if (sign(orient(a, b, point)) >= 0 && sign(orient(b, c, point)) >= 0 && sign(orient(c, a, point)) >= 0) { ear = false; break; }
      }
    }
    if (ear) {
      for (let index = n; index !== p; index = next[index]!) {
        const end = next[index]!, edgeStart = polygon[index]!, edgeEnd = polygon[end]!;
        if (index === cursor || end === cursor) continue;
        consume();
        if (blocksBridge(a, c, edgeStart, edgeEnd)) { ear = false; break; }
      }
    }
    if (ear) {
      triangles.push([a.index, b.index, c.index]);
      emittedArea += turn;
      next[p] = n; previous[n] = p; active[cursor] = 0; remaining -= 1; cursor = n; failed = 0;
      continue;
    }
    cursor = n;
    if (++failed >= remaining) {
      let removed = false, candidate = cursor;
      do {
        const left = previous[candidate]!, right = next[candidate]!, a = polygon[left]!, b = polygon[candidate]!, c = polygon[right]!;
        if (!matchingEndpoint(a, c) && sign(orient(a, b, c)) === 0 && onSegment(a, c, b)) {
          next[left] = right; previous[right] = left; active[candidate] = 0; remaining -= 1; cursor = right; failed = 0; removed = true; break;
        }
        candidate = next[candidate]!;
      } while (candidate !== cursor);
      if (!removed) return fail("unable to triangulate this contour without crossing a boundary.");
    }
  }
  const a = polygon[cursor]!, b = polygon[next[cursor]!]!, c = polygon[next[next[cursor]!]!]!;
  const final = orient(a, b, c);
  if (sign(final) <= 0 || a.index === b.index || b.index === c.index || c.index === a.index) return fail("final triangle is degenerate.");
  triangles.push([a.index, b.index, c.index]); emittedArea += final;
  if (Math.abs(emittedArea - expectedArea) > Math.max(EPSILON * count * 8, expectedArea * 1e-10)) return fail("triangulation did not preserve surface area.");
  return triangles;
}
