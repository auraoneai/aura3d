import { describe, expect, it } from "vitest";
import { earcut, triangulateShape, type PolygonPoint } from "../../../packages/math/src/independent/PolygonTriangulation.js";

type Triangle = [number, number, number];
type Ring = PolygonPoint[];

function rectangle(x: number, y: number, width: number, height: number): Ring {
  return [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
  ];
}

function cross(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function ringArea(ring: readonly PolygonPoint[]): number {
  const origin = ring[0];
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return area / 2;
}

function close(ring: readonly PolygonPoint[]): Ring {
  return [...ring, { ...ring[0] }];
}

function open(ring: readonly PolygonPoint[]): Ring {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first.x === last.x && first.y === last.y ? ring.slice(0, -1) : ring.slice();
}

/**
 * Independently check an oriented triangular mesh in linear time. Matching
 * directed boundary edges, oppositely paired internal edges, and positive
 * face orientations certify consistent coverage of the supplied boundaries.
 */
function verifyMesh(
  contour: readonly PolygonPoint[],
  holes: readonly (readonly PolygonPoint[])[],
  triangles: readonly Triangle[],
  expectedArea: number,
  contains: (point: PolygonPoint) => boolean,
  checkCrossings = false,
): void {
  const rings = [open(contour), ...holes.map(open)];
  const points = rings.flat();
  expect(triangles).toHaveLength(points.length + 2 * holes.length - 2);
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const direction = (a: number, b: number) => a < b ? 1 : -1;
  const boundary = new Map<string, number>();
  let offset = 0;
  rings.forEach((ring, ringIndex) => {
    const reverse = ringIndex === 0 ? ringArea(ring) < 0 : ringArea(ring) > 0;
    for (let i = 0; i < ring.length; i++) {
      const current = offset + i;
      const next = offset + (i + 1) % ring.length;
      const a = reverse ? next : current;
      const b = reverse ? current : next;
      boundary.set(key(a, b), direction(a, b));
    }
    offset += ring.length;
  });

  const edges = new Map<string, { count: number; direction: number }>();
  let totalArea = 0;
  for (const triangle of triangles) {
    if (new Set(triangle).size !== 3 || triangle.some((index) => !Number.isInteger(index) || index < 0 || index >= points.length)) {
      throw new Error(`Invalid triangle indices: ${triangle.join(",")}`);
    }
    const [a, b, c] = triangle.map((index) => points[index]);
    const area = cross(a, b, c) / 2;
    if (!(area > 0)) throw new Error(`Non-CCW triangle: ${triangle.join(",")}`);
    totalArea += area;
    if (!contains({ x: a.x + ((b.x - a.x) + (c.x - a.x)) / 3, y: a.y + ((b.y - a.y) + (c.y - a.y)) / 3 })) {
      throw new Error(`Triangle centroid lies outside the domain: ${triangle.join(",")}`);
    }
    for (let i = 0; i < 3; i++) {
      const aIndex = triangle[i], bIndex = triangle[(i + 1) % 3];
      const edge = key(aIndex, bIndex);
      const count = edges.get(edge) ?? { count: 0, direction: 0 };
      count.count++;
      count.direction += direction(aIndex, bIndex);
      edges.set(edge, count);
    }
  }
  expect(totalArea).toBeCloseTo(expectedArea, 8);
  for (const [edge, expectedDirection] of boundary) {
    const actual = edges.get(edge);
    if (!actual || actual.count !== 1 || actual.direction !== expectedDirection) {
      throw new Error(`Boundary edge ${edge} is missing, duplicated, or reversed`);
    }
  }
  for (const [edge, actual] of edges) {
    if (!boundary.has(edge) && (actual.count !== 2 || actual.direction !== 0)) {
      throw new Error(`Interior edge ${edge} is not paired in opposite directions`);
    }
  }

  // Small adversarial inputs get an additional explicit segment-intersection
  // check; large inputs already check the complete oriented edge topology.
  if (checkCrossings) {
    const segments = [...edges.keys()].map((edge) => edge.split(":").map(Number));
    const onSegment = (a: PolygonPoint, b: PolygonPoint, p: PolygonPoint) =>
      cross(a, b, p) === 0 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
      p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const [aIndex, bIndex] = segments[i], [cIndex, dIndex] = segments[j];
      if (aIndex === cIndex || aIndex === dIndex || bIndex === cIndex || bIndex === dIndex) continue;
      const a = points[aIndex], b = points[bIndex], c = points[cIndex], d = points[dIndex];
      const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
      const crossing = (abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) || onSegment(a, b, d) ||
        onSegment(c, d, a) || onSegment(c, d, b);
      if (crossing) throw new Error(`Nonadjacent edges cross or touch: ${aIndex}:${bIndex} and ${cIndex}:${dIndex}`);
    }
  }
}

describe("independent polygon spatial queries", () => {
  it("triangulates a simple 1,050-notch comb larger than the former quadratic validation budget", () => {
    const teeth = 1050, height = 30, width = 4 * teeth + 4;
    const contour: Ring = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }];
    for (let tooth = teeth - 1; tooth >= 0; tooth--) {
      const x = 2 + 4 * tooth;
      contour.push({ x: x + 3, y: height }, { x: x + 3, y: 10 }, { x: x + 1, y: 10 }, { x: x + 1, y: height });
    }
    contour.push({ x: 0, y: height });
    const supplied = close(contour.slice().reverse());
    Object.freeze(supplied);
    const triangles = triangulateShape(supplied, []);
    verifyMesh(supplied, [], triangles, 84_120, ({ x, y }) => {
      if (x < 0 || x > width || y < 0 || y > height) return false;
      const tooth = Math.floor((x - 2) / 4);
      return !(tooth >= 0 && tooth < teeth && x > 3 + 4 * tooth && x < 5 + 4 * tooth && y > 10);
    });
  }, 30_000);

  it("triangulates a perforated slab with 324 disjoint holes and mixed winding and closure", () => {
    const outer = close(rectangle(0, 0, 400, 400).reverse());
    const holes: Ring[] = [];
    for (let row = 0; row < 18; row++) for (let column = 0; column < 18; column++) {
      const index = row * 18 + column;
      let hole = rectangle(10 + column * 20, 10 + row * 20, 8, 8);
      if (index % 2 === 0) hole = hole.reverse();
      holes.push(index % 3 === 0 ? close(hole) : hole);
    }
    Object.freeze(outer);
    holes.forEach((ring) => Object.freeze(ring));
    Object.freeze(holes);
    const triangles = triangulateShape(outer, holes);
    verifyMesh(outer, holes, triangles, 139_264, ({ x, y }) => {
      if (x < 0 || x > 400 || y < 0 || y > 400) return false;
      const column = Math.floor((x - 10) / 20), row = Math.floor((y - 10) / 20);
      if (column < 0 || column >= 18 || row < 0 || row >= 18) return true;
      const left = 10 + column * 20, bottom = 10 + row * 20;
      return !(x > left && x < left + 8 && y > bottom && y < bottom + 8);
    });
  }, 30_000);

  it("preserves long thin concavities and flat offsets across closed rings", () => {
    const contour = close([
      { x: -200, y: -5 }, { x: 200, y: -5 }, { x: 200, y: 5 }, { x: 2, y: 5 },
      { x: 2, y: -4 }, { x: -2, y: -4 }, { x: -2, y: 5 }, { x: -200, y: 5 },
    ].reverse());
    const hole = close(rectangle(-150, -2, 10, 2));
    const points = [...contour, ...hole];
    const data = Float64Array.from(points.flatMap(({ x, y }) => [x, y, 7]));
    const raw = earcut(data, [contour.length], 3);
    expect(raw).not.toContain(contour.length - 1);
    expect(raw).not.toContain(points.length - 1);
    const indices = raw.map((index) => index >= contour.length ? index - 1 : index);
    const triangles = Array.from({ length: indices.length / 3 }, (_, i) => indices.slice(3 * i, 3 * i + 3) as Triangle);
    verifyMesh(contour, [hole], triangles, 3944, ({ x, y }) =>
      x >= -200 && x <= 200 && y >= -5 && y <= 5 &&
      !(x > -2 && x < 2 && y > -4) && !(x > -150 && x < -140 && y > -2 && y < 0), true);
  });

  it("distinguishes a representable gap from touching edges at a large translation", () => {
    const base = 2 ** 52;
    const outer = rectangle(base, base, 64, 64);
    const holes = [rectangle(base + 8, base + 8, 16, 16), rectangle(base + 25, base + 8, 16, 16)];
    const triangles = triangulateShape(outer, holes);
    verifyMesh(outer, holes, triangles, 3584, ({ x, y }) =>
      x >= base && x <= base + 64 && y >= base && y <= base + 64 &&
      !holes.some((ring) => x > ring[0].x && x < ring[1].x && y > ring[0].y && y < ring[2].y), true);
    const touching = [holes[0], rectangle(base + 24, base + 8, 16, 16)];
    expect(() => triangulateShape(outer, touching)).toThrow(/touch|cross/i);
  });

  it("does not lose a narrow gap, an exact touch, crossing edges, or containment", () => {
    const outer = rectangle(-10, -6, 20, 12);
    const delta = 2 ** -20;
    const holes = [rectangle(-6, -2, 4, 4), rectangle(-2 + delta, -2, 4 - delta, 4)];
    verifyMesh(outer, holes, triangulateShape(outer, holes), 208 + 4 * delta, ({ x, y }) =>
      x >= -10 && x <= 10 && y >= -6 && y <= 6 &&
      !holes.some((ring) => x > ring[0].x && x < ring[1].x && y > ring[0].y && y < ring[2].y), true);
    expect(() => triangulateShape(outer, [holes[0], rectangle(-2, -2, 4, 4)])).toThrow(/touch|cross/i);
    const circular = Array.from({ length: 128 }, (_, i) => {
      const theta = 2 * Math.PI * i / 128;
      return { x: 9 * Math.cos(theta), y: 5 * Math.sin(theta) };
    });
    const crossing = [...circular.slice(0, 29), ...circular.slice(29, 100).reverse(), ...circular.slice(100)];
    expect(() => triangulateShape(crossing, [])).toThrow(/self-intersect|touch/i);
    expect(() => triangulateShape(outer, [rectangle(-7, -4, 14, 8), rectangle(-1, -1, 2, 2)])).toThrow(/contain|overlap/i);
  });
});
