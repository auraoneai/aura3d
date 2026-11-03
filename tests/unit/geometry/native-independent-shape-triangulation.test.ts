import { describe, expect, it } from "vitest";
import { shapeParityMesh } from "../../../packages/rendering/src/geometry/Shape";
import { triangulateIndependentShape } from "../../../packages/rendering/src/geometry/IndependentShapeTriangulation";

type Point = { readonly x: number; readonly y: number };
type Face = readonly [Point, Point, Point];
const point = (x: number, y: number): Point => ({ x, y });
const lShape: readonly Point[] = [point(0, 0), point(6, 0), point(6, 2), point(2, 2), point(2, 6), point(0, 6)];
const rectangle: readonly Point[] = [point(0, 0), point(10, 0), point(10, 8), point(0, 8)];
const rectangularHole: readonly Point[] = [point(3, 2), point(7, 2), point(7, 5), point(3, 5)];

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function faces(outline: readonly Point[], holes: readonly (readonly Point[])[]): Face[] {
  const vertices = [...outline, ...holes.flat()];
  return triangulateIndependentShape(outline, holes).map((triangle) => {
    expect(triangle).toHaveLength(3);
    for (const index of triangle) expect(Number.isInteger(index) && index >= 0 && index < vertices.length).toBe(true);
    return [vertices[triangle[0]]!, vertices[triangle[1]]!, vertices[triangle[2]]!] as const;
  });
}
function assertArea(faces: readonly Face[], expected: number): void {
  let area = 0;
  for (const triangle of faces) {
    const signed = cross(...triangle) / 2;
    expect(signed).toBeGreaterThan(0);
    area += signed;
  }
  expect(area).toBeCloseTo(expected, 7);
}
function insideRing(ring: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function assertGridCoverage(triangles: readonly Face[], outline: readonly Point[], holes: readonly (readonly Point[])[], width: number, height: number): void {
  // Non-round offsets avoid the axis-aligned fixture boundaries. Points that
  // land on a triangulation edge are skipped when counting coverage.
  for (let x = 0; x < width * 2; x++) for (let y = 0; y < height * 2; y++) {
    const p = point(x / 2 + 0.173, y / 2 + 0.291);
    const signs = triangles.map((triangle) => [cross(triangle[0], triangle[1], p), cross(triangle[1], triangle[2], p), cross(triangle[2], triangle[0], p)]);
    if (signs.some((values) => values.some((v) => Math.abs(v) < 1e-10))) continue;
    const count = signs.filter((values) => values.every((v) => v > 0)).length;
    const expected = insideRing(outline, p) && !holes.some((hole) => insideRing(hole, p));
    expect(count, `coverage at (${p.x}, ${p.y})`).toBe(expected ? 1 : 0);
  }
}

describe("independently authored planar shape triangulation", () => {
  it("covers a concave outline once without filling its missing corner", () => {
    const output = faces(lShape, []);
    assertArea(output, 20);
    assertGridCoverage(output, lShape, [], 6, 6);
  });

  it("leaves a rectangular hole empty and produces positive winding under either input orientation", () => {
    for (const outer of [rectangle, [...rectangle].reverse()]) for (const inner of [rectangularHole, [...rectangularHole].reverse()]) {
      const before = JSON.stringify([outer, inner]);
      const output = faces(outer, [inner]);
      assertArea(output, 68);
      assertGridCoverage(output, outer, [inner], 10, 8);
      expect(JSON.stringify([outer, inner])).toBe(before);
    }
  });

  it("preserves two holes within a concave outline without overlap or coverage outside", () => {
    const outer = [point(0, 0), point(10, 0), point(10, 8), point(6, 8), point(6, 5), point(4, 5), point(4, 8), point(0, 8)];
    const holes = [
      [point(1, 1), point(2, 1), point(2, 3), point(1, 3)],
      [point(7, 1), point(9, 1), point(9, 2), point(7, 2)].reverse()
    ];
    const output = faces(outer, holes);
    assertArea(output, 70);
    assertGridCoverage(output, outer, holes, 10, 8);
  });

  it("keeps the public shape builder's closed-ring, UV, normal and segment contracts", () => {
    const outer = Object.freeze([...rectangle, rectangle[0]!]);
    const hole = Object.freeze([...rectangularHole, rectangularHole[0]!]);
    const segments: number[] = [];
    const source = Object.freeze({ extractPoints(value: number) { segments.push(value); return { shape: outer, holes: [hole] }; } });
    const before = JSON.stringify([outer, hole]);
    const mesh = shapeParityMesh({ shape: source, curveSegments: 7 });
    expect(segments).toEqual([7]);
    expect(mesh.positions).toHaveLength(24);
    expect(mesh.normals).toHaveLength(24);
    expect(mesh.uvs).toHaveLength(16);
    expect(JSON.stringify([outer, hole])).toBe(before);
    const vertices = Array.from({ length: mesh.positions.length / 3 }, (_, i) => point(mesh.positions[3 * i]!, mesh.positions[3 * i + 1]!));
    const indices = mesh.indices!;
    expect(indices.length % 3).toBe(0);
    const output: Face[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!, b = indices[i + 1]!, c = indices[i + 2]!;
      expect([a, b, c].every((index) => Number.isInteger(index) && index >= 0 && index < vertices.length)).toBe(true);
      output.push([vertices[a]!, vertices[b]!, vertices[c]!]);
    }
    for (let i = 0; i < vertices.length; i++) {
      expect(mesh.positions[3 * i + 2]).toBe(0);
      expect(mesh.normals!.slice(3 * i, 3 * i + 3)).toEqual([0, 0, 1]);
      expect(mesh.uvs!.slice(2 * i, 2 * i + 2)).toEqual([vertices[i]!.x, vertices[i]!.y]);
    }
    assertArea(output, 68);
    assertGridCoverage(output, rectangle, [rectangularHole], 10, 8);
  });

  it("accepts a simple polygon with a collinear boundary vertex", () => {
    const outer = [point(0, 0), point(3, 0), point(6, 0), point(6, 4), point(0, 4)];
    const output = faces(outer, []);
    assertArea(output, 24);
    assertGridCoverage(output, outer, [], 6, 4);
  });

  it("rejects a valid double-precision square that would collapse in Float32 output", () => {
    const base = 100_000_000;
    const square = [point(base, base), point(base + 1, base), point(base + 1, base + 1), point(base, base + 1)];
    const shape = { extractPoints: () => ({ shape: square, holes: [] }) };
    expect(() => shapeParityMesh({ shape })).toThrow(/float32|precision/i);
  });

  it("preserves positive Float32 triangle area for a representable large-coordinate square", () => {
    const base = 100_000_000;
    const square = [point(base, base), point(base + 16, base), point(base + 16, base + 16), point(base, base + 16)];
    const shape = { extractPoints: () => ({ shape: square, holes: [] }) };
    const mesh = shapeParityMesh({ shape });
    const floatPositions = Float32Array.from(mesh.positions);
    const vertices = Array.from({ length: mesh.positions.length / 3 }, (_, i) =>
      point(floatPositions[3 * i]!, floatPositions[3 * i + 1]!));
    const indices = mesh.indices!;
    expect(indices.length).toBeGreaterThan(0);
    const output: Face[] = [];
    for (let i = 0; i < indices.length; i += 3) output.push([vertices[indices[i]!]!, vertices[indices[i + 1]!]!, vertices[indices[i + 2]!]!]);
    assertArea(output, 256);
  });

  it("rejects non-collapsed Float32 output when its area is materially distorted", () => {
    const base = 100_000_000;
    const strip = [point(base, 0), point(base + 11, 0), point(base + 11, 1), point(base, 1)];
    expect(Math.fround(base + 11)).not.toBe(Math.fround(base));
    expect(() => shapeParityMesh({ shape: strip })).toThrow(/float32.*area|precision.*area/i);
  });

  it.each([
    ["self-intersecting outline", [point(0, 0), point(4, 4), point(0, 4), point(4, 0)], []],
    ["outside hole", rectangle, [[point(9, 1), point(11, 1), point(11, 2), point(9, 2)]]],
    ["touching hole", rectangle, [[point(0, 1), point(2, 1), point(2, 3), point(0, 3)]]],
    ["hole touching at a corner", rectangle, [[point(0, 0), point(2, 1), point(1, 2)]]],
    ["overlapping holes", rectangle, [[point(1, 1), point(4, 1), point(4, 4), point(1, 4)], [point(3, 2), point(6, 2), point(6, 5), point(3, 5)]]],
    ["nested holes", rectangle, [[point(1, 1), point(6, 1), point(6, 6), point(1, 6)], [point(2, 2), point(3, 2), point(3, 3), point(2, 3)]]],
    ["self-touching outline", [point(0, 0), point(4, 0), point(4, 3), point(0, 0), point(0, 3)], []],
    ["non-finite coordinate", [point(0, 0), point(Infinity, 0), point(0, 1)], []],
    ["zero-area ring", [point(0, 0), point(1, 0), point(2, 0)], []]
  ] as const)("rejects an unsupported %s instead of producing corrupt triangles", (_label, outline, holes) => {
    expect(() => triangulateIndependentShape(outline, holes)).toThrow();
  });

  it("rejects more than 8,192 contour vertices before unbounded geometric work", () => {
    const outline = Array.from({ length: 8_193 }, (_, i) => {
      const angle = 2 * Math.PI * i / 8_193;
      return point(Math.cos(angle), Math.sin(angle));
    });
    expect(() => triangulateIndependentShape(outline, [])).toThrow(/capacity|limit|8192|8,192/i);
  });

  it("preflights the aggregate ring limit before reading excess-ring interior coordinates", () => {
    const circle = (radius: number): Point[] => Array.from({ length: 4_096 }, (_, i) => {
      const angle = 2 * Math.PI * i / 4_096;
      return point(radius * Math.cos(angle), radius * Math.sin(angle));
    });
    const reads: string[] = [];
    const tracked = (name: string, x: number, y: number): Point => ({
      get x() { reads.push(`${name}.x`); return x; },
      get y() { reads.push(`${name}.y`); return y; }
    });
    const excess = [tracked("first", 1, 1), tracked("interior", 3, 1), tracked("last", 1, 3)];
    const shape = { extractPoints: () => ({ shape: circle(100), holes: [circle(50), excess] }) };
    expect(() => shapeParityMesh({ shape })).toThrow(/capacity|limit|8192|8,192/i);
    // Reading just the endpoints is permitted when checking for a duplicate
    // closing vertex; traversing the excess ring's interior is not.
    expect(reads.every((entry) => entry.startsWith("first.") || entry.startsWith("last."))).toBe(true);
  });
});
