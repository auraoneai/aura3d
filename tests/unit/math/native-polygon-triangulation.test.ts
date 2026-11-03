import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Vector2 } from "../../../packages/math/src/Vector2.js";
import { earcut, isClockWise, shapeArea, ShapeUtils, triangulateShape, type PolygonPoint } from "../../../packages/math/src/independent/PolygonTriangulation.js";

// Check the candidate against the declaration-only public contract without
// importing or executing the attributed implementation it may replace.
const declarationContract: {
  earcut: (data: ArrayLike<number>, holeIndices: readonly number[] | null, dim?: number) => number[];
  shapeArea: (contour: readonly Vector2[]) => number;
  isClockWise: (points: readonly Vector2[]) => boolean;
  triangulateShape: (contour: readonly Vector2[], holes: readonly (readonly Vector2[])[]) => [number, number, number][];
  ShapeUtils: {
    readonly area: (contour: readonly Vector2[]) => number;
    readonly isClockWise: (points: readonly Vector2[]) => boolean;
    readonly triangulateShape: (contour: readonly Vector2[], holes: readonly (readonly Vector2[])[]) => [number, number, number][];
  };
} = { earcut, shapeArea, isClockWise, triangulateShape, ShapeUtils };

type Triangle = [number, number, number];

function ring(coordinates: readonly (readonly [number, number])[]): PolygonPoint[] {
  return coordinates.map(([x, y]) => ({ x, y }));
}

function cross(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function signedArea(points: readonly PolygonPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - a.y * b.x;
  }
  return area / 2;
}

function pointInside(p: PolygonPoint, points: readonly PolygonPoint[]): boolean {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function verifyMesh(outer: PolygonPoint[], holes: PolygonPoint[][], triangles: Triangle[]): void {
  const points = [outer, ...holes].flat();
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const edges = new Map<string, number>();
  let area = 0;
  for (const triangle of triangles) {
    expect(new Set(triangle).size).toBe(3);
    for (const index of triangle) expect(Number.isInteger(index) && index >= 0 && index < points.length).toBe(true);
    const [a, b, c] = triangle.map((index) => points[index]);
    const twice = cross(a, b, c);
    expect(twice).toBeGreaterThan(0);
    area += twice / 2;
    const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    expect(pointInside(center, outer)).toBe(true);
    for (const hole of holes) expect(pointInside(center, hole)).toBe(false);
    for (let i = 0; i < 3; i++) {
      const edge = key(triangle[i], triangle[(i + 1) % 3]);
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  let offset = 0;
  const boundary = new Set<string>();
  for (const pointsInRing of [outer, ...holes]) {
    for (let i = 0; i < pointsInRing.length; i++) boundary.add(key(offset + i, offset + (i + 1) % pointsInRing.length));
    offset += pointsInRing.length;
  }
  for (const edge of boundary) expect(edges.get(edge), `boundary edge ${edge}`).toBe(1);
  for (const [edge, count] of edges) expect(count, `edge ${edge}`).toBe(boundary.has(edge) ? 1 : 2);
  const segments = [...edges.keys()].map((edge) => edge.split(":").map(Number));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const [a, b] = segments[i];
    const [c, d] = segments[j];
    if (a === c || a === d || b === c || b === d) continue;
    const abC = cross(points[a], points[b], points[c]);
    const abD = cross(points[a], points[b], points[d]);
    const cdA = cross(points[c], points[d], points[a]);
    const cdB = cross(points[c], points[d], points[b]);
    expect(abC * abD < 0 && cdA * cdB < 0, `crossing edges ${a}:${b} and ${c}:${d}`).toBe(false);
  }
  const expectedArea = Math.abs(signedArea(outer)) - holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
  expect(area).toBeCloseTo(expectedArea, 9);
  expect(triangles.length).toBe(points.length + 2 * holes.length - 2);
}

const square = () => ring([[0, 0], [12, 0], [12, 12], [0, 12]]);

describe("independent polygon geometry", () => {
  it("records both public math routes and the source barrel targeted by a cutover", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const barrel = read("../../../packages/math/src/index.ts");
    const standalone = JSON.parse(read("../../../packages/math/package.json"));
    const engine = JSON.parse(read("../../../package.json"));
    const registry = JSON.parse(read("../../../aura.exports.json"));
    expect(barrel).toMatch(/^export \* from ["']\.\/ShapeUtils\.js["'];/m);
    expect(standalone.exports["."].import).toBe("./dist/index.js");
    expect(standalone.exports["."].types).toBe("./dist/index.d.ts");
    expect(engine.exports["./math"].import).toBe("./dist/math/index.js");
    expect(engine.exports["./math"].require).toBe("./dist/math/index.cjs");
    expect(registry.entries["./math"].source).toBe("packages/math/src/index.ts");
  });

  it("provides the declared named functions and the corresponding ShapeUtils members", () => {
    expect(Object.keys(declarationContract).sort()).toEqual(["ShapeUtils", "earcut", "isClockWise", "shapeArea", "triangulateShape"]);
    expect(ShapeUtils.area).toBe(shapeArea);
    expect(ShapeUtils.isClockWise).toBe(isClockWise);
    expect(ShapeUtils.triangulateShape).toBe(triangulateShape);
    expect(Object.keys(ShapeUtils).sort()).toEqual(["area", "isClockWise", "triangulateShape"]);
    expect(earcut([0, 0, 3, 0, 0, 4], null)).toHaveLength(3);
    expect(earcut([], null)).toEqual([]);
  });

  it("computes signed area, treats clockwise and counterclockwise input correctly, and handles short rings", () => {
    const shape = ring([[0, 0], [5, 0], [5, 5], [3, 5], [3, 2], [2, 2], [2, 5], [0, 5]]);
    expect(shapeArea(shape)).toBe(22);
    expect(shapeArea(shape.slice().reverse())).toBe(-22);
    expect(isClockWise(shape)).toBe(false);
    expect(isClockWise(shape.slice().reverse())).toBe(true);
    expect(shapeArea([])).toBe(0);
    expect(isClockWise(ring([[0, 0], [1, 1]]))).toBe(false);
    verifyMesh(shape, [], triangulateShape(shape, []));
  });

  it("rounds exact polygon area to nearest binary64, including ties and subnormals", () => {
    // This L-shaped polygon has integer area 2^54 + extension. At 2^54 the
    // binary64 spacing is 4, so the expected results can be derived directly.
    const extended = (extension: number) => ring([
      [0, 0], [2 ** 53, 0], [2 ** 53, 2], [extension, 2], [extension, 3], [0, 3],
    ]);
    expect(shapeArea(extended(3))).toBe(2 ** 54 + 4);
    expect(shapeArea(extended(2))).toBe(2 ** 54); // halfway, lower significand is even
    expect(shapeArea(extended(6))).toBe(2 ** 54 + 8); // halfway, upper significand is even
    expect(shapeArea(extended(3).reverse())).toBe(-(2 ** 54 + 4));

    // Triangle area is base * height / 2. The first is exactly half of the
    // smallest subnormal, and the second is one and a half subnormal units.
    const half = ring([[0, 0], [Number.MIN_VALUE, 0], [0, 1]]);
    const oneAndHalf = ring([[0, 0], [3 * Number.MIN_VALUE, 0], [0, 1]]);
    expect(shapeArea(half)).toBe(0);
    expect(Object.is(shapeArea(half.slice().reverse()), -0)).toBe(true);
    expect(isClockWise(half.slice().reverse())).toBe(true);
    expect(shapeArea(oneAndHalf)).toBe(2 * Number.MIN_VALUE);
  });

  it("supports large rings in area and winding queries", () => {
    const contour = [...Array.from({ length: 4097 }, () => ({ x: 0, y: 0 })), ...square().slice(1)];
    expect(shapeArea(contour)).toBe(144);
    expect(isClockWise(contour)).toBe(false);
    expect(shapeArea(contour.slice().reverse())).toBe(-144);
    expect(isClockWise(contour.slice().reverse())).toBe(true);
  });

  it("triangulates two holes with either ring winding and preserves the boundary topology", () => {
    const outer = square();
    const holes = [ring([[2, 2], [4, 2], [4, 4], [2, 4]]), ring([[7, 6], [10, 6], [10, 9], [7, 9]])];
    for (const reverseOuter of [false, true]) for (const reverseHoles of [false, true]) {
      const contour = reverseOuter ? outer.slice().reverse() : outer.slice();
      const selected = holes.map((hole) => reverseHoles ? hole.slice().reverse() : hole.slice());
      verifyMesh(contour, selected, triangulateShape(contour, selected));
    }
  });

  it("handles a concave contour with holes separated by a deep notch", () => {
    const contour = ring([[0, 0], [12, 0], [12, 12], [8, 12], [8, 4], [4, 4], [4, 12], [0, 12]]);
    const holes = [ring([[1, 6], [3, 6], [3, 9], [1, 9]]), ring([[9, 6], [11, 6], [11, 9], [9, 9]])];
    verifyMesh(contour, holes, triangulateShape(contour, holes));
  });

  it("handles a concave hole and another disjoint hole", () => {
    const contour = ring([[0, 0], [20, 0], [20, 20], [0, 20]]);
    const holes = [ring([[2, 2], [7, 2], [7, 3], [4, 3], [4, 7], [2, 7]]), ring([[11, 10], [15, 10], [15, 16], [11, 16]])];
    verifyMesh(contour, holes, triangulateShape(contour, holes));
  });

  it("keeps duplicate and collinear index slots after removing each closing point", () => {
    const contour = ring([[0, 0], [0, 0], [6, 0], [12, 0], [12, 12], [0, 12], [0, 0]]);
    const hole = ring([[3, 3], [3, 8], [8, 8], [8, 3], [3, 3]]);
    const snapshot = structuredClone([contour, hole]);
    const triangles = triangulateShape(contour, [hole]);
    expect([contour, hole]).toEqual(snapshot);
    const removedIndices = new Set([1, 2]);
    expect(triangles.flat().some((index) => removedIndices.has(index))).toBe(false);
    const vertices = [...contour.slice(0, -1), ...hole.slice(0, -1)];
    const area = triangles.reduce((sum, triangle) => sum + cross(vertices[triangle[0]], vertices[triangle[1]], vertices[triangle[2]]) / 2, 0);
    expect(area).toBe(119);
    expect(triangles.flat().some((index) => index >= contour.length - 1)).toBe(true);
  });

  it("uses closure-normalized offsets for any combination of closed outer and hole rings", () => {
    const outer = ring([[-9, -6], [9, -6], [9, 6], [-9, 6]]);
    const holes = [ring([[-6, -2], [-4, -2], [-4, 1], [-6, 1]]), ring([[3, -1], [6, -1], [6, 2], [3, 2]])];
    for (let mask = 0; mask < 8; mask++) {
      const close = (points: PolygonPoint[], bit: number) => mask & bit ? [...points, { ...points[0] }] : points.slice();
      const contour = close(outer, 1);
      const selected = [close(holes[0], 2), close(holes[1], 4)];
      const snapshot = structuredClone([contour, selected]);
      const triangles = triangulateShape(contour, selected);
      expect([contour, selected]).toEqual(snapshot);
      verifyMesh(outer, holes, triangles);
    }
  });

  it("keeps flat earcut offsets relative to the original data when rings are closed", () => {
    const outer = ring([[-7, -5], [7, -5], [7, 5], [-7, 5]]);
    const hole = ring([[-2, -2], [-2, 2], [2, 2], [2, -2]]);
    const closedOuter = [...outer, { ...outer[0] }];
    const closedHole = [...hole, { ...hole[0] }];
    const flat = [...closedOuter, ...closedHole].flatMap(({ x, y }) => [x, y]);
    const indices = earcut(flat, [closedOuter.length]);
    expect(indices).not.toContain(outer.length);
    expect(indices).not.toContain(closedOuter.length + hole.length);
    expect(indices.some((index) => index >= closedOuter.length)).toBe(true);
    const normalized = indices.map((index) => index >= closedOuter.length ? index - 1 : index);
    const triangles = Array.from({ length: normalized.length / 3 }, (_, i) => normalized.slice(i * 3, i * 3 + 3) as Triangle);
    verifyMesh(outer, [hole], triangles);
  });

  it("accepts frozen contours, holes, point records and flat inputs without modifying them", () => {
    const outer = square().map((point) => Object.freeze(point));
    const hole = ring([[3, 3], [3, 9], [9, 9], [9, 3]]).map((point) => Object.freeze(point));
    Object.freeze(outer);
    Object.freeze(hole);
    const holes = Object.freeze([hole]);
    const flat = Object.freeze([...outer, ...hole].flatMap(({ x, y }) => [x, y]));
    const offsets = Object.freeze([outer.length]);
    verifyMesh(outer, [hole], triangulateShape(outer, holes));
    expect(earcut(flat, offsets)).toHaveLength(24);
    expect(shapeArea(outer)).toBe(144);
    expect(isClockWise(outer)).toBe(false);
  });

  it("supports flat typed data, vertex-based hole offsets, and extra dimensions", () => {
    const outer = square();
    const hole = ring([[3, 3], [3, 9], [9, 9], [9, 3]]);
    const flat = Float64Array.from([...outer, ...hole].flatMap(({ x, y }) => [x, y, 42]));
    const before = flat.slice();
    const result = earcut(flat, [outer.length], 3);
    expect(flat).toEqual(before);
    expect(result.length % 3).toBe(0);
    const triangles = Array.from({ length: result.length / 3 }, (_, i) => result.slice(i * 3, i * 3 + 3) as Triangle);
    verifyMesh(outer, [hole], triangles);
  });

  it("distinguishes a representable near-collinear triangle whose floating determinant cancels", () => {
    const n = 10_000_000_000_000_000;
    const triangle = ring([[0, 0], [n, n + 2], [n + 2, n + 4]]);
    expect(cross(...triangle as [PolygonPoint, PolygonPoint, PolygonPoint])).toBe(0);
    expect(shapeArea(triangle)).toBe(-2);
    expect(isClockWise(triangle)).toBe(true);
    const output = triangulateShape(triangle, []);
    expect(output).toHaveLength(1);
    const [a, b, c] = output[0].map((i) => triangle[i]);
    const exact = (BigInt(b.x) - BigInt(a.x)) * (BigInt(c.y) - BigInt(a.y)) - (BigInt(b.y) - BigInt(a.y)) * (BigInt(c.x) - BigInt(a.x));
    expect(exact).toBeGreaterThan(0n);
  });

  it("uses exact orientation across overflow and subnormal-coordinate cases", () => {
    const huge = ring([[-1e308, -1e308], [1e308, -1e308], [1e308, 1e308], [-1e308, 1e308]]);
    expect(shapeArea(huge)).toBe(Infinity);
    expect(triangulateShape(huge, [])).toHaveLength(2);
    const tiny = ring([[0, 0], [Number.MIN_VALUE, 0], [0, Number.MIN_VALUE]]);
    expect(isClockWise(tiny)).toBe(false);
    expect(triangulateShape(tiny, [])).toHaveLength(1);
  });

  it("triangulates a high-resolution convex ring beyond 4,096 vertices", () => {
    const count = 6143;
    const contour = Array.from({ length: count }, (_, i) => {
      const angle = 2 * Math.PI * i / count;
      return { x: 10 * Math.cos(angle), y: 10 * Math.sin(angle) };
    });
    const closed = [...contour, { ...contour[0] }];
    const triangles = triangulateShape(closed, []);
    expect(triangles).toHaveLength(contour.length - 2);
    let area = 0;
    for (const [a, b, c] of triangles) {
      expect(a >= 0 && b >= 0 && c >= 0 && a < contour.length && b < contour.length && c < contour.length).toBe(true);
      const twice = cross(contour[a], contour[b], contour[c]);
      expect(twice).toBeGreaterThan(0);
      area += twice / 2;
    }
    expect(area).toBeCloseTo(Math.abs(signedArea(contour)), 8);
    expect(closed).toHaveLength(count + 1);
  });

  it("triangulates a large simple contour with a recessed vertex in both public data forms", () => {
    const count = 6144;
    const contour = Array.from({ length: count }, (_, i) => {
      const angle = 2 * Math.PI * i / count;
      const radius = i === count / 2 ? 8 : 10;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    expect(cross(contour[count / 2 - 1], contour[count / 2], contour[count / 2 + 1])).toBeLessThan(0);
    const flat = Float64Array.from(contour.flatMap(({ x, y }) => [x, y]));
    const flatIndices = earcut(flat, null);
    const fromFlat = Array.from({ length: flatIndices.length / 3 }, (_, i) => flatIndices.slice(i * 3, i * 3 + 3) as Triangle);
    for (const triangles of [triangulateShape(contour, []), fromFlat]) {
      expect(triangles).toHaveLength(count - 2);
      let total = 0;
      let smallestCross = Infinity;
      for (const [a, b, c] of triangles) {
        expect(a >= 0 && b >= 0 && c >= 0 && a < count && b < count && c < count).toBe(true);
        const twice = cross(contour[a], contour[b], contour[c]);
        smallestCross = Math.min(smallestCross, twice);
        total += twice / 2;
      }
      expect(smallestCross).toBeGreaterThan(0);
      expect(total).toBeCloseTo(Math.abs(signedArea(contour)), 8);
    }
  });

  it("does not mistake a consistently turning star for a simple convex ring", () => {
    const points = Array.from({ length: 11 }, (_, i) => {
      const angle = 2 * Math.PI * ((i * 4) % 11) / 11;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    });
    expect(() => triangulateShape(points, [])).toThrow(/self-intersect|touch/i);
  });

  it("returns no faces for empty or collinear contours and ignores degenerate holes", () => {
    expect(triangulateShape([], [])).toEqual([]);
    expect(triangulateShape(ring([[0, 0], [1, 0], [2, 0]]), [])).toEqual([]);
    expect(triangulateShape(square(), [ring([[2, 2], [3, 2], [4, 2]])])).toHaveLength(2);
  });

  it("rejects self-intersections, touching boundaries, outside holes, and nested holes", () => {
    const bow = ring([[0, 0], [4, 4], [0, 4], [4, 0]]);
    expect(() => triangulateShape(bow, [])).toThrow(/self-intersect|touch/i);
    expect(() => triangulateShape(square(), [ring([[0, 2], [2, 2], [2, 4], [0, 4]])])).toThrow(/touch|cross/i);
    expect(() => triangulateShape(square(), [ring([[14, 2], [16, 2], [16, 4], [14, 4]])])).toThrow(/inside/i);
    expect(() => triangulateShape(square(), [ring([[2, 2], [10, 2], [10, 10], [2, 10]]), ring([[4, 4], [6, 4], [6, 6], [4, 6]])])).toThrow(/contain|overlap/i);
  });

  it("rejects malformed flat input, non-finite xy coordinates, and too many holes", () => {
    expect(() => earcut([0, 0, 1], null)).toThrow(/length/i);
    expect(() => earcut([0, 0, 1, 0, 0, 1], null, 1)).toThrow(/dimension/i);
    expect(() => earcut([0, 0, 1, 0, 0, 1], [4])).toThrow(/indices/i);
    expect(() => earcut([0, 0, 1, 0, 0, 1], [3])).toThrow(/indices/i);
    expect(() => earcut([0, 0, 1, 0, 0, 1], [1, 1])).toThrow(/indices/i);
    expect(() => triangulateShape(ring([[0, 0], [1, 0], [0, Number.NaN]]), [])).toThrow(/finite/i);
    expect(triangulateShape(Array.from({ length: 4097 }, () => ({ x: 0, y: 0 })), [])).toEqual([]);
    expect(() => triangulateShape(square(), Array.from({ length: 4097 }, () => []))).toThrow(/limit/i);
    expect(() => earcut([], Array.from({ length: 4097 }, () => 0))).toThrow(/limit/i);
  });

  it("preserves area and planar edge topology for deterministic irregular rings and holes", () => {
    let state = 0x91e10da5;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let trial = 0; trial < 32; trial++) {
      const count = 8 + Math.floor(random() * 17);
      const angle = random() * Math.PI * 2;
      const outer = Array.from({ length: count }, (_, i) => {
        const theta = angle + 2 * Math.PI * i / count;
        const radius = 8 + 3 * random();
        return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
      });
      if (trial % 2) outer.reverse();
      const holes = Array.from({ length: trial % 4 }, (_, i) => {
        const x = (i - 1) * 2;
        const size = 0.3 + random() * 0.2;
        const hole = ring([[x - size, -size], [x + size, -size], [x + size, size], [x - size, size]]);
        return (trial + i) % 2 ? hole.reverse() : hole;
      });
      verifyMesh(outer, holes, triangulateShape(outer, holes));
    }
  });

  it("selects the correct boundary angle when several hole cuts meet a vertex", () => {
    let state = 0x13579bdf;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let trial = 0; trial < 80; trial++) {
      const count = 6 + Math.floor(random() * 32);
      const angle = random() * Math.PI * 2;
      const outer = Array.from({ length: count }, (_, i) => {
        const theta = angle + 2 * Math.PI * i / count;
        const radius = 5 + 10 * random();
        return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
      });
      if (trial % 2) outer.reverse();
      const holeCount = trial % 5;
      const holes = Array.from({ length: holeCount }, (_, i) => {
        const theta = 2 * Math.PI * i / holeCount;
        const x = 0.3 * Math.cos(theta);
        const y = 0.3 * Math.sin(theta);
        const size = 0.045 + 0.02 * random();
        return ring([[x - size, y - size], [x + size, y - size], [x + size, y + size], [x - size, y + size]]);
      });
      verifyMesh(outer, holes, triangulateShape(outer, holes));
    }
  });
});
