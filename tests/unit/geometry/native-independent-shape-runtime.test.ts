import { describe, expect, it } from "vitest";
import { Vector2, Vector3 } from "@aura3d/math";
import { extrudeParityMesh } from "../../../packages/rendering/src/geometry/Extrude";
import { shapeParityMesh } from "../../../packages/rendering/src/geometry/Shape";
import { Curve3Adapter, earcut, isClockWise, removeDupEndPts, shapeArea, triangulateShape, type ParityMesh } from "../../../packages/rendering/src/geometry/Support";

type Point = { readonly x: number; readonly y: number };
type Vertex = readonly [number, number, number];
type Triangle = readonly [Vertex, Vertex, Vertex];

// Coordinates are constructed for this test: an 8 x 6 rectangle and a 2 x 2 hole.
const outline: readonly Point[] = [
  { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 0 }
];
const hole: readonly Point[] = [
  { x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 2 }
];

function shapeInput(outer: readonly Point[] = outline, inner: readonly Point[] = hole) {
  return shapeInputWithHoles(outer, [inner]);
}

function shapeInputWithHoles(outer: readonly Point[], holes: readonly (readonly Point[])[]) {
  const requestedSegments: number[] = [];
  const shape = {
    extractPoints(segments: number) {
      requestedSegments.push(segments);
      const copy = (ring: readonly Point[]) => ring.map(({ x, y }) => new Vector2(x, y));
      return { shape: copy(outer), holes: holes.map(copy) };
    }
  };
  return { shape, requestedSegments };
}

function triangles(mesh: ParityMesh): Triangle[] {
  const indices = mesh.indices ?? Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
  expect(indices.length % 3).toBe(0);
  const result: Triangle[] = [];
  const vertex = (index: number): Vertex => {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index * 3 + 2).toBeLessThan(mesh.positions.length);
    return [mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!];
  };
  for (let i = 0; i < indices.length; i += 3) {
    result.push([vertex(indices[i]!), vertex(indices[i + 1]!), vertex(indices[i + 2]!)]);
  }
  return result;
}

function cross2(a: Vertex, b: Vertex, c: Vertex): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function covers(triangle: Triangle, x: number, y: number): boolean {
  const point: Vertex = [x, y, 0];
  const signs = [cross2(triangle[0], triangle[1], point), cross2(triangle[1], triangle[2], point), cross2(triangle[2], triangle[0], point)];
  return signs.every((value) => value >= -1e-8) || signs.every((value) => value <= 1e-8);
}

function assertCapArea(faces: readonly Triangle[], expectedWinding: 1 | -1): void {
  expect(faces).toHaveLength(8);
  let total = 0;
  for (const face of faces) {
    const area = cross2(...face) / 2;
    expect(area * expectedWinding).toBeGreaterThan(0);
    total += Math.abs(area);
  }
  expect(total).toBeCloseTo(44);
}

function assertRectangleWithHole(faces: readonly Triangle[], expectedWinding: 1 | -1): void {
  assertCapArea(faces, expectedWinding);
  for (let x = 0; x < 8; x += 1) for (let y = 0; y < 6; y += 1) {
    const covered = faces.some((face) => covers(face, x + 0.37, y + 0.29));
    expect(covered).toBe(!(x >= 2 && x < 4 && y >= 2 && y < 4));
  }
}

function assertClosedSurface(faces: readonly Triangle[]): void {
  const edges = new Map<string, { count: number; direction: number }>();
  const key = (point: Vertex) => point.map((value) => Object.is(value, -0) ? 0 : value).join(",");
  for (const face of faces) for (let i = 0; i < 3; i += 1) {
    const start = key(face[i]!);
    const end = key(face[(i + 1) % 3]!);
    const edge = [start, end].sort().join("|");
    const previous = edges.get(edge) ?? { count: 0, direction: 0 };
    edges.set(edge, { count: previous.count + 1, direction: previous.direction + (start < end ? 1 : -1) });
  }
  expect([...edges.values()].every(({ count, direction }) => count === 2 && direction === 0)).toBe(true);
}

describe("independent rendering polygon contracts", () => {
  it("removes one repeated final point only when the ring has at least three points", () => {
    const pair = [{ x: 1, y: 1 }, { x: 1, y: 1 }];
    removeDupEndPts(pair);
    expect(pair).toHaveLength(2);
    const ring = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: -0, y: 0 }];
    removeDupEndPts(ring);
    expect(ring).toHaveLength(3);
    const distinct = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    removeDupEndPts(distinct);
    expect(distinct).toHaveLength(3);
    const nonFinite = [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: NaN, y: 0 }];
    removeDupEndPts(nonFinite);
    expect(nonFinite).toHaveLength(3);
  });

  it("retains structural points, closed-ring indexing, input data and counterclockwise caps", () => {
    const before = JSON.stringify([outline, hole]);
    expect(shapeArea(outline)).toBe(48);
    expect(isClockWise(outline)).toBe(false);
    expect(isClockWise([...outline].reverse())).toBe(true);
    const points = [...outline.slice(0, -1), ...hole.slice(0, -1)];
    const indices = triangulateShape(outline, [hole]);
    const faces = indices.map((face) => face.map((index) => {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(points.length);
      const point = points[index]!;
      return [point.x, point.y, 0] as Vertex;
    }) as unknown as Triangle);
    assertRectangleWithHole(faces, 1);
    expect(JSON.stringify([outline, hole])).toBe(before);
  });

  it("accepts undefined and null hole lists and keeps flat indices with stride and closing points", () => {
    const call: (data: ArrayLike<number>, holes: readonly number[] | null | undefined, dim?: number) => number[] = earcut;
    const triangle = [0, 0, 3, 0, 0, 2];
    expect(call(triangle, undefined)).toHaveLength(3);
    expect(call(triangle, null)).toEqual(call(triangle, undefined));
    const points = [...outline, ...hole];
    const data = Float64Array.from(points.flatMap(({ x, y }, index) => [x, y, index + 10]));
    const original = Array.from(data);
    const indices = call(data, [outline.length], 3);
    expect(indices).toHaveLength(24);
    expect(indices).not.toContain(outline.length - 1);
    expect(indices).not.toContain(points.length - 1);
    expect(indices.some((index) => index >= outline.length)).toBe(true);
    const mesh: ParityMesh = { positions: points.flatMap(({ x, y }) => [x, y, 0]), indices };
    assertRectangleWithHole(triangles(mesh), 1);
    expect(Array.from(data)).toEqual(original);
  });

  it("builds planar shape caps with closed rings in either winding", () => {
    for (const reverse of [false, true]) {
      const source = shapeInput(reverse ? [...outline].reverse() : outline, reverse ? [...hole].reverse() : hole);
      const mesh = shapeParityMesh({ shape: source.shape, curveSegments: 5 });
      expect(source.requestedSegments).toEqual([5]);
      expect(mesh.positions).toHaveLength(8 * 3);
      expect(mesh.normals).toHaveLength(8 * 3);
      expect(mesh.uvs).toHaveLength(8 * 2);
      for (let i = 0; i < 8; i += 1) {
        expect(mesh.positions[i * 3 + 2]).toBe(0);
        expect(mesh.normals!.slice(i * 3, i * 3 + 3)).toEqual([0, 0, 1]);
        expect(mesh.uvs!.slice(i * 2, i * 2 + 2)).toEqual(mesh.positions.slice(i * 3, i * 3 + 2));
      }
      assertRectangleWithHole(triangles(mesh), 1);
    }
  });

  it("preserves cap indices for a concave outline with two independently wound holes", () => {
    const contour = [
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 5, y: 8 },
      { x: 5, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 0 }
    ];
    const holes = [
      [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }],
      [{ x: 6, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 2 }].reverse()
    ];
    const source = shapeInputWithHoles(contour, holes);
    const surface = triangles(shapeParityMesh({ shape: source.shape }));
    expect(surface).toHaveLength(18);
    expect(surface.every((face) => cross2(...face) > 0)).toBe(true);
    expect(surface.reduce((sum, face) => sum + cross2(...face) / 2, 0)).toBeCloseTo(55);
    for (let x = 0; x < 8; x += 1) for (let y = 0; y < 8; y += 1) {
      const notch = x >= 3 && x < 5 && y >= 5;
      const inFirstHole = x === 1 && y === 1;
      const inSecondHole = x === 6 && y >= 2 && y < 4;
      expect(surface.some((face) => covers(face, x + 0.37, y + 0.29))).toBe(!(notch || inFirstHole || inSecondHole));
    }
    const solid = triangles(extrudeParityMesh({ shape: source.shape, depth: 2, bevelEnabled: false }));
    const start = solid.filter((face) => face.every((point) => point[2] === 0));
    const end = solid.filter((face) => face.every((point) => point[2] === 2));
    expect(start).toHaveLength(18);
    expect(end).toHaveLength(18);
    expect(start.reduce((sum, face) => sum + cross2(...face) / 2, 0)).toBeCloseTo(-55);
    expect(end.reduce((sum, face) => sum + cross2(...face) / 2, 0)).toBeCloseTo(55);
    assertClosedSurface(solid);
  });

  it("routes a 5,120-point outline through both planar and extrusion caps", () => {
    const count = 5_120;
    const outer = Array.from({ length: count }, (_, index) => {
      const angle = 2 * Math.PI * index / count;
      return { x: 10 * Math.cos(angle), y: 10 * Math.sin(angle) };
    });
    const source = shapeInputWithHoles([...outer, outer[0]!], []);
    const planar = shapeParityMesh({ shape: source.shape });
    expect(planar.positions).toHaveLength(count * 3);
    expect(planar.indices).toHaveLength((count - 2) * 3);
    expect(planar.indices!.every((index) => index >= 0 && index < count)).toBe(true);

    const solid = extrudeParityMesh({ shape: source.shape, depth: 2, bevelEnabled: false });
    expect(solid.groups?.[0]).toEqual({ start: 0, count: (count - 2) * 6, materialIndex: 0 });
    expect(solid.positions.length).toBeGreaterThan(count * 3);
    expect(solid.positions.every(Number.isFinite)).toBe(true);
    expect(solid.normals?.every(Number.isFinite)).toBe(true);
  });

  it.each([3, -3])("builds a closed, consistently wound straight extrusion at depth %i", (depth) => {
    const source = shapeInput([...outline].reverse(), hole);
    const mesh = extrudeParityMesh({ shape: source.shape, depth, steps: 3, bevelEnabled: false });
    const faces = triangles(mesh);
    const atStart = faces.filter((face) => face.every((point) => point[2] === 0));
    const atEnd = faces.filter((face) => face.every((point) => point[2] === depth));
    assertRectangleWithHole(atStart, depth > 0 ? -1 : 1);
    assertRectangleWithHole(atEnd, depth > 0 ? 1 : -1);
    assertClosedSurface(faces);
    expect(mesh.groups).toEqual([
      { start: 0, count: 48, materialIndex: 0 },
      { start: 48, count: mesh.positions.length / 3 - 48, materialIndex: 1 }
    ]);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length / 3 * 2);
    expect([...mesh.positions, ...mesh.normals!, ...mesh.uvs!].every(Number.isFinite)).toBe(true);
  });

  it("keeps the hole open on a straight path extrusion and finite beveled geometry", () => {
    const source = shapeInput();
    const path = new Curve3Adapter((t) => new Vector3(0, 0, 3 * t));
    const onPath = extrudeParityMesh({ shape: source.shape, extrudePath: path, steps: 2, bevelEnabled: false });
    const pathFaces = triangles(onPath);
    assertCapArea(pathFaces.filter((face) => face.every((point) => Math.abs(point[2]) < 1e-8)), -1);
    assertCapArea(pathFaces.filter((face) => face.every((point) => Math.abs(point[2] - 3) < 1e-8)), 1);
    assertClosedSurface(pathFaces);

    const beveled = extrudeParityMesh({ shape: source.shape, depth: 3, steps: 2, bevelEnabled: true, bevelSegments: 2, bevelThickness: 0.25, bevelSize: 0.2 });
    expect(beveled.positions.length).toBeGreaterThan(onPath.positions.length);
    expect([...beveled.positions, ...beveled.normals!, ...beveled.uvs!].every(Number.isFinite)).toBe(true);
    const capVertices = beveled.groups![0]!.count;
    const capFaces = triangles(beveled).slice(0, capVertices / 3);
    expect(capFaces.some((face) => covers(face, 3, 3))).toBe(false);
  });
});
