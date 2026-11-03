import { describe, expect, it } from "vitest";
import { independentExtrude } from "../../../packages/rendering/src/geometry/IndependentExtrude";
import { extrudeParityMesh, type ExtrudeParityParams } from "../../../packages/rendering/src/index";

type Point = Readonly<{ x: number; y: number }>;
type Vertex = readonly [number, number, number];
type Triangle = readonly [Vertex, Vertex, Vertex];
type Mesh = {
  readonly positions: readonly number[];
  readonly normals?: readonly number[];
  readonly uvs?: readonly number[];
  readonly indices?: readonly number[];
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
};

const point = (x: number, y: number): Point => Object.freeze({ x, y });
const outline = Object.freeze([point(0, 0), point(8, 0), point(8, 6), point(0, 6)]);
const hole = Object.freeze([point(2, 2), point(4, 2), point(4, 4), point(2, 4)]);

function shapeInput(outer: readonly Point[], holes: readonly (readonly Point[])[] = []) {
  const requestedSegments: number[] = [];
  return {
    requestedSegments,
    shape: {
      extractPoints(segments: number) {
        requestedSegments.push(segments);
        return { shape: outer, holes };
      },
    },
  };
}

function vertex(positions: readonly number[], index: number): Vertex {
  return [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!];
}

function subtract(a: Vertex, b: Vertex): Vertex {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vertex, b: Vertex): Vertex {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vertex, b: Vertex): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function faceVector([a, b, c]: Triangle): Vertex {
  return cross(subtract(b, a), subtract(c, a));
}

function triangles(mesh: Mesh): Triangle[] {
  expect(mesh.indices).toBeUndefined();
  expect(mesh.positions.length % 9).toBe(0);
  return Array.from({ length: mesh.positions.length / 9 }, (_, i) => [
    vertex(mesh.positions, i * 3), vertex(mesh.positions, i * 3 + 1), vertex(mesh.positions, i * 3 + 2),
  ] as const);
}

function signedVolume(faces: readonly Triangle[]): number {
  // Translation before the scalar triple product avoids loss of precision for
  // shapes far from the origin. A closed outward surface has positive volume.
  const origin = faces[0]![0];
  return faces.reduce((sum, [a, b, c]) => sum + dot(subtract(a, origin), cross(subtract(b, origin), subtract(c, origin))) / 6, 0);
}

function assertClosedSurface(faces: readonly Triangle[]): void {
  const edges = new Map<string, { uses: number; orientation: number }>();
  const label = (v: Vertex) => v.map((value) => Object.is(value, -0) ? 0 : value).join(",");
  for (const face of faces) {
    for (let i = 0; i < 3; i++) {
      const a = label(face[i]!);
      const b = label(face[(i + 1) % 3]!);
      const forward = a < b;
      const key = forward ? `${a}|${b}` : `${b}|${a}`;
      const prior = edges.get(key) ?? { uses: 0, orientation: 0 };
      edges.set(key, { uses: prior.uses + 1, orientation: prior.orientation + (forward ? 1 : -1) });
    }
  }
  expect([...edges.values()].every((edge) => edge.uses === 2 && edge.orientation === 0)).toBe(true);
}

function assertSolid(mesh: Mesh, depth: number, capArea: number): Triangle[] {
  const faces = triangles(mesh);
  const vertexCount = mesh.positions.length / 3;
  expect(vertexCount).toBeGreaterThan(0);
  expect(mesh.normals).toHaveLength(mesh.positions.length);
  expect(mesh.uvs).toHaveLength(vertexCount * 2);
  expect(mesh.positions.every(Number.isFinite)).toBe(true);
  expect(mesh.normals!.every(Number.isFinite)).toBe(true);
  expect(mesh.uvs!.every(Number.isFinite)).toBe(true);

  const groups = mesh.groups!;
  expect(groups).toHaveLength(2);
  expect(groups.map((group) => group.materialIndex).sort()).toEqual([0, 1]);
  const assignment = new Array<number>(faces.length).fill(-1);
  for (const group of groups) {
    expect(group.start % 3).toBe(0);
    expect(group.count % 3).toBe(0);
    expect(group.start).toBeGreaterThanOrEqual(0);
    expect(group.count).toBeGreaterThan(0);
    expect(group.start + group.count).toBeLessThanOrEqual(vertexCount);
    for (let i = group.start / 3; i < (group.start + group.count) / 3; i++) {
      expect(assignment[i]).toBe(-1);
      assignment[i] = group.materialIndex!;
    }
  }
  expect(assignment.every((material) => material === 0 || material === 1)).toBe(true);

  const low = Math.min(0, depth);
  const high = Math.max(0, depth);
  let lowArea = 0;
  let highArea = 0;
  for (let index = 0; index < faces.length; index++) {
    const face = faces[index]!;
    const vector = faceVector(face);
    const length = Math.hypot(...vector);
    expect(length).toBeGreaterThan(0);
    for (let corner = 0; corner < 3; corner++) {
      const normal = vertex(mesh.normals!, index * 3 + corner);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 6);
      expect(dot(normal, vector) / length).toBeCloseTo(1, 6);
    }
    const lowCap = face.every((v) => v[2] === low);
    const highCap = face.every((v) => v[2] === high);
    if (lowCap || highCap) {
      expect(assignment[index]).toBe(0);
      expect(vector[2] * (lowCap ? -1 : 1)).toBeGreaterThan(0);
      if (lowCap) lowArea += length / 2;
      else highArea += length / 2;
    } else {
      expect(assignment[index]).toBe(1);
    }
  }
  expect(lowArea).toBeCloseTo(capArea, 7);
  expect(highArea).toBeCloseTo(capArea, 7);
  expect(signedVolume(faces)).toBeCloseTo(capArea * Math.abs(depth), 7);
  assertClosedSurface(faces);
  return faces;
}

function cross2(a: Vertex, b: Vertex, x: number, y: number): number {
  return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
}

function assertConcaveCapCoverage(faces: readonly Triangle[], z: number): void {
  const caps = faces.filter((face) => face.every((v) => v[2] === z));
  for (let x = 0; x < 12; x++) for (let y = 0; y < 9; y++) {
    const px = x + 0.317;
    const py = y + 0.223;
    const signs = caps.map(([a, b, c]) => [cross2(a, b, px, py), cross2(b, c, px, py), cross2(c, a, px, py)]);
    if (signs.some((edges) => edges.some((value) => Math.abs(value) < 1e-10))) continue;
    const covered = signs.filter((edges) => edges.every((value) => value > 0) || edges.every((value) => value < 0)).length;
    const insideOutline = px < 5 || py < 4;
    const insideHole = (px > 1 && px < 2 && py > 1 && py < 3) || (px > 7 && px < 10 && py > 1 && py < 2);
    expect(covered, `coverage at (${px}, ${py}, ${z})`).toBe(insideOutline && !insideHole ? 1 : 0);
  }
}

describe("independent straight extrusion", () => {
  it("builds outward faces, accurate caps, and complete material groups for both depth signs and contour orientations", () => {
    for (const outer of [outline, [...outline].reverse()]) for (const inner of [hole, [...hole].reverse()]) {
      for (const depth of [3, -2]) {
        const input = shapeInput(outer, [inner]);
        const before = JSON.stringify([outer, inner]);
        const mesh = independentExtrude(input.shape, { depth, steps: 3, curveSegments: 7 });
        const faces = assertSolid(mesh, depth, 44);
        expect(input.requestedSegments).toEqual([7]);
        expect(JSON.stringify([outer, inner])).toBe(before);
        expect(Math.min(...mesh.positions.filter((_, i) => i % 3 === 0))).toBe(0);
        expect(Math.max(...mesh.positions.filter((_, i) => i % 3 === 0))).toBe(8);
        expect(Math.min(...mesh.positions.filter((_, i) => i % 3 === 1))).toBe(0);
        expect(Math.max(...mesh.positions.filter((_, i) => i % 3 === 1))).toBe(6);
        expect(Math.min(...mesh.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(Math.min(0, depth));
        expect(Math.max(...mesh.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(Math.max(0, depth));

        for (const face of faces) {
          const normal = faceVector(face);
          if (normal[2] !== 0) continue;
          const sameX = face.every((v) => v[0] === face[0][0]);
          const coordinate = sameX ? face[0][0] : face[0][1];
          const direction = sameX ? normal[0] : normal[1];
          const expected = coordinate === 0 ? -1 : coordinate === (sameX ? 8 : 6) ? 1 : coordinate === 2 ? 1 : -1;
          expect(direction * expected).toBeGreaterThan(0);
        }
      }
    }
  });

  it("covers a concave shape once on each cap while keeping two holes open", () => {
    const concave = Object.freeze([point(0, 0), point(12, 0), point(12, 4), point(5, 4), point(5, 9), point(0, 9)]);
    const holes = Object.freeze([
      Object.freeze([point(1, 1), point(2, 1), point(2, 3), point(1, 3)]),
      Object.freeze([point(7, 1), point(10, 1), point(10, 2), point(7, 2)]),
    ]);
    const before = JSON.stringify([concave, holes]);
    const faces = assertSolid(independentExtrude(shapeInput(concave, holes).shape, { depth: 2, steps: 2 }), 2, 68);
    assertConcaveCapCoverage(faces, 0);
    assertConcaveCapCoverage(faces, 2);
    expect(JSON.stringify([concave, holes])).toBe(before);
  });

  it("retains small dimensions and correct orientation when coordinates are far from the origin", () => {
    const translated = [point(1_000_000, -1_000_000), point(1_000_000.75, -1_000_000), point(1_000_000.75, -999_998.75), point(1_000_000, -999_998.75)];
    const mesh = independentExtrude(shapeInput(translated).shape, { depth: 0.125 });
    assertSolid(mesh, 0.125, 0.9375);
    expect(Math.min(...mesh.positions.filter((_, i) => i % 3 === 0))).toBe(1_000_000);
    expect(Math.max(...mesh.positions.filter((_, i) => i % 3 === 0))).toBe(1_000_000.75);
    const packed = Float32Array.from(mesh.positions);
    for (let i = 0; i < packed.length; i += 9) {
      const face: Triangle = [
        [packed[i]!, packed[i + 1]!, packed[i + 2]!],
        [packed[i + 3]!, packed[i + 4]!, packed[i + 5]!],
        [packed[i + 6]!, packed[i + 7]!, packed[i + 8]!],
      ];
      expect(face.flat().every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...faceVector(face))).toBeGreaterThan(0);
    }
  });

  it("exposes the straight mode through the public builder and rejects unsupported path and bevel requests", () => {
    const shape = shapeInput(outline, [hole]).shape;
    const settings: ExtrudeParityParams = { shape, extrusionMode: "linear", depth: 2 };
    assertSolid(extrudeParityMesh(settings), 2, 44);
    expect(() => extrudeParityMesh({ shape, extrusionMode: "linear", depth: 2, bevelEnabled: true })).toThrow(/bevel/i);
    expect(() => extrudeParityMesh({ shape, extrusionMode: "linear", depth: 2, bevelThickness: 0.1 })).toThrow(/bevel/i);
    expect(() => extrudeParityMesh({ shape, extrusionMode: "linear", depth: 2, extrudePath: {} as never })).toThrow(/path/i);
  });

  it.each([0, -0, NaN, Infinity, -Infinity])("rejects invalid depth %s", (depth) => {
    expect(() => independentExtrude(shapeInput(outline).shape, { depth })).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 1025])("rejects invalid or excessive steps %s", (steps) => {
    expect(() => independentExtrude(shapeInput(outline).shape, { steps })).toThrow(RangeError);
  });

  it("rejects output that would overflow or collapse when packed as Float32", () => {
    const origin = 100_000_000;
    const collapsed = [point(origin, origin), point(origin + 1, origin), point(origin + 1, origin + 1), point(origin, origin + 1)];
    const distorted = [point(origin, 0), point(origin + 11, 0), point(origin + 11, 1), point(origin, 1)];
    expect(() => independentExtrude(shapeInput(collapsed).shape, { depth: 1 })).toThrow(/float32|precision/i);
    expect(() => independentExtrude(shapeInput(distorted).shape, { depth: 1 })).toThrow(/float32|precision/i);
    expect(() => independentExtrude(shapeInput(outline).shape, { depth: 1e39 })).toThrow(/float32|precision/i);
    expect(() => independentExtrude(shapeInput(outline).shape, { depth: 1e-45, steps: 4 })).toThrow(/float32|precision/i);
  });

  it("preflights the combined contour-and-steps output budget", () => {
    const manyEdges = Array.from({ length: 256 }, (_, i) => {
      const angle = 2 * Math.PI * i / 256;
      return point(10 * Math.cos(angle), 10 * Math.sin(angle));
    });
    expect(() => independentExtrude(shapeInput(manyEdges).shape, { depth: 2, steps: 1024 })).toThrow(/budget|capacity|limit/i);
  });

  it("rejects non-finite coordinates and malformed rings before producing a mesh", () => {
    const nonFinite = [point(0, 0), point(Infinity, 0), point(0, 1)];
    const flat = [point(0, 0), point(1, 0), point(2, 0)];
    expect(() => independentExtrude(shapeInput(nonFinite).shape, { depth: 1 })).toThrow();
    expect(() => independentExtrude(shapeInput(flat).shape, { depth: 1 })).toThrow();
  });
});
