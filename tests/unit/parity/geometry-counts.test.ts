/**
 * Independently specified geometry contracts: analytical coordinates, topology,
 * areas and normal directions. These fixtures do not depend on another engine's
 * implementation or its buffer ordering.
 */
import { describe, expect, it } from "vitest";
import {
  circleParityMesh, coneParityMesh, cylinderParityMesh, convexParityMesh,
  edgesParityMesh, extrudeParityMesh, latheParityMesh, polyhedronParityMesh,
  ringParityMesh, roundedBoxParityMesh, shapeParityMesh, torusKnotParityMesh,
  tubeParityMesh, wireframeParityMesh, createPrimitiveGeometry, parityMeshToGeometry,
  polyhedronParityMeshFromBase, boxParityMesh, meshToNonIndexed, earcut, Curve3Adapter,
  type ParityMesh, type PolyhedronVariant
} from "@aura3d/rendering";
import { Vector3 } from "@aura3d/math";
import { geometry } from "../../../packages/engine/src/agent-api/nodes/geometry";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors";
import { normalizeGeometryAttributes } from "../../../packages/engine/src/agent-api/RootGeometry";

function point(values: ArrayLike<number>, i: number): [number, number, number] {
  return [values[3 * i]!, values[3 * i + 1]!, values[3 * i + 2]!];
}
function expectPoint(actual: ArrayLike<number>, expected: readonly number[], precision = 6): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, precision));
}
function checkMesh(mesh: ParityMesh): void {
  expect(mesh.positions.length % 3).toBe(0);
  expect(mesh.positions.every(Number.isFinite)).toBe(true);
  const count = mesh.positions.length / 3;
  if (mesh.normals) {
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.normals.every(Number.isFinite)).toBe(true);
  }
  if (mesh.uvs) {
    expect(mesh.uvs).toHaveLength(count * 2);
    expect(mesh.uvs.every(Number.isFinite)).toBe(true);
  }
  if (mesh.indices) {
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < count)).toBe(true);
  }
}
function bounds(positions: ArrayLike<number>): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c]!, positions[i + c]!);
      max[c] = Math.max(max[c]!, positions[i + c]!);
    }
  }
  return { min, max };
}
function triangleXYArea(mesh: ParityMesh): number {
  const order = mesh.indices ?? Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
  let area = 0;
  for (let i = 0; i < order.length; i += 3) {
    const a = point(mesh.positions, order[i]!);
    const b = point(mesh.positions, order[i + 1]!);
    const c = point(mesh.positions, order[i + 2]!);
    area += ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  return area;
}
function expectUnitNormals(mesh: ParityMesh): void {
  expect(mesh.normals).toBeDefined();
  for (let i = 0; i < mesh.normals!.length; i += 3) {
    expect(Math.hypot(mesh.normals![i]!, mesh.normals![i + 1]!, mesh.normals![i + 2]!)).toBeCloseTo(1, 5);
  }
}
function expectOutwardWinding(mesh: ParityMesh): void {
  const order = mesh.indices ?? Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
  for (let i = 0; i < order.length; i += 3) {
    const a = point(mesh.positions, order[i]!);
    const b = point(mesh.positions, order[i + 1]!);
    const c = point(mesh.positions, order[i + 2]!);
    const ab = b.map((v, k) => v - a[k]!);
    const ac = c.map((v, k) => v - a[k]!);
    const cross = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    // A collapsed edge can be intentional when the rounding radius reaches an axis.
    if (Math.hypot(...cross) < 1e-10) continue;
    const normal = point(mesh.normals!, order[i]!);
    expect(cross[0]! * normal[0] + cross[1]! * normal[1] + cross[2]! * normal[2]).toBeGreaterThan(0);
  }
}
function expectNormalsAwayFrom(mesh: ParityMesh, center: readonly number[]): void {
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const centroid = [0, 1, 2].map((axis) => (mesh.positions[i + axis]! + mesh.positions[i + axis + 3]! + mesh.positions[i + axis + 6]!) / 3);
    const normal = mesh.normals!.slice(i, i + 3);
    expect(centroid.reduce((sum, value, axis) => sum + (value - center[axis]!) * normal[axis]!, 0)).toBeGreaterThan(0);
  }
}

describe("native disk, ring, cylinder and lathe contracts", () => {
  it("constructs circular sectors with the requested endpoints, winding and UVs", () => {
    for (const segments of [3, 8, 32]) {
      const mesh = circleParityMesh({ radius: 2, segments, thetaStart: 0, thetaLength: Math.PI / 2 });
      checkMesh(mesh);
      expect(mesh.positions.length / 3).toBe(segments + 2);
      expect(mesh.indices).toHaveLength(3 * segments);
      expectPoint(point(mesh.positions, 1), [2, 0, 0]);
      expectPoint(point(mesh.positions, segments + 1), [0, 2, 0]);
      expectPoint(mesh.uvs!.slice(0, 2), [0.5, 0.5]);
      expect(triangleXYArea(mesh)).toBeGreaterThan(0);
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
    }
    const offset = circleParityMesh({ radius: 2.5, segments: 8, thetaStart: 0.3, thetaLength: 4 });
    expectPoint(point(offset.positions, 1), [2.5 * Math.cos(0.3), 2.5 * Math.sin(0.3), 0]);
    expectPoint(point(offset.positions, 9), [2.5 * Math.cos(4.3), 2.5 * Math.sin(4.3), 0]);
    checkMesh(circleParityMesh({ radius: 0 }));
  });

  it("constructs annular sectors with radial subdivision and positive winding", () => {
    for (const [thetaSegments, phiSegments] of [[4, 1], [8, 3], [16, 2]] as const) {
      const mesh = ringParityMesh({ innerRadius: 1, outerRadius: 2, thetaSegments, phiSegments, thetaLength: Math.PI / 2 });
      checkMesh(mesh);
      expect(mesh.positions.length / 3).toBe((thetaSegments + 1) * (phiSegments + 1));
      expect(mesh.indices).toHaveLength(thetaSegments * phiSegments * 6);
      expectPoint(point(mesh.positions, 0), [1, 0, 0]);
      expectPoint(point(mesh.positions, thetaSegments), [0, 1, 0]);
      expect(triangleXYArea(mesh)).toBeGreaterThan(0);
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
    }
    const offset = ringParityMesh({ innerRadius: 0.2, outerRadius: 2, thetaSegments: 16, phiSegments: 3, thetaStart: 0.4, thetaLength: 5 });
    expectPoint(point(offset.positions, 0), [0.2 * Math.cos(0.4), 0.2 * Math.sin(0.4), 0]);
    expectPoint(point(offset.positions, 16), [0.2 * Math.cos(5.4), 0.2 * Math.sin(5.4), 0]);
  });

  it("emits correctly grouped cylinder sides and caps, including open and tapered cases", () => {
    for (const radialSegments of [3, 8, 17]) {
      const mesh = cylinderParityMesh({ radiusTop: 1, radiusBottom: 1, height: 2, radialSegments, heightSegments: 2 });
      checkMesh(mesh);
      expect(mesh.groups?.map((g) => g.count)).toEqual([radialSegments * 12, radialSegments * 3, radialSegments * 3]);
      expect(mesh.indices).toHaveLength(radialSegments * 18);
      expect(mesh.groups!.map((g) => g.start)).toEqual([0, radialSegments * 12, radialSegments * 15]);
      expect(parityMeshToGeometry(mesh).groups).toEqual(mesh.groups);
      expect(bounds(mesh.positions).min[1]).toBeCloseTo(-1);
      expect(bounds(mesh.positions).max[1]).toBeCloseTo(1);
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
      const open = cylinderParityMesh({ radialSegments, openEnded: true });
      expect(open.groups).toHaveLength(1);
      expect(open.indices).toHaveLength(radialSegments * 6);
      const cone = coneParityMesh({ radius: 2, height: 3, radialSegments });
      expect(cone.groups?.map((g) => g.count)).toEqual([radialSegments * 3, radialSegments * 3]);
      checkMesh(cone);
      expectUnitNormals(cone);
      expectOutwardWinding(cone);
    }
    const partial = cylinderParityMesh({ radiusTop: 0.5, radiusBottom: 1, radialSegments: 5, heightSegments: 4, thetaStart: 0.5, thetaLength: 4, openEnded: true });
    expectPoint(point(partial.positions, 0), [0.5 * Math.sin(0.5), 0.5, 0.5 * Math.cos(0.5)]);
    expectPoint(point(partial.positions, 5), [0.5 * Math.sin(4.5), 0.5, 0.5 * Math.cos(4.5)]);
    expect(partial.groups!.map((g) => g.count)).toEqual([5 * 4 * 6]);
    expect(coneParityMesh({ radialSegments: 5, heightSegments: 4, openEnded: true }).indices).toHaveLength(5 * (4 * 2 - 1) * 3);
  });

  it("revolves a profile with matching seam positions and outward normals", () => {
    for (const segments of [4, 12, 24]) {
      const mesh = latheParityMesh({ points: [[1, 0], [1, 2]], segments });
      checkMesh(mesh);
      expect(mesh.positions.length / 3).toBe((segments + 1) * 2);
      expect(mesh.indices).toHaveLength(segments * 6);
      expectPoint(point(mesh.positions, 0), point(mesh.positions, segments * 2));
      expectPoint(point(mesh.positions, 1), point(mesh.positions, segments * 2 + 1));
      for (let i = 0; i < mesh.positions.length / 3; i += 1) {
        const [x, , z] = point(mesh.positions, i);
        const [nx, ny, nz] = point(mesh.normals!, i);
        expect(nx * x + nz * z).toBeCloseTo(1, 6);
        expect(ny).toBeCloseTo(0, 6);
      }
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
    }
    const partial = latheParityMesh({ points: [[0.5, 0], [0.5, 2]], segments: 4, phiStart: Math.PI / 2, phiLength: Math.PI });
    expectPoint(point(partial.positions, 0), [0.5, 0, 0]);
    expectPoint(point(partial.positions, 8), [-0.5, 0, 0]);
    expect(() => latheParityMesh({ points: [[1, 0]] })).toThrow();
  });
});

describe("native swept and polyhedral geometry contracts", () => {
  it("sweeps a constant radius around a line with independent arc-length positions", () => {
    // Quadratic parameter speed catches an implementation using raw t instead of arc length.
    const path = { getPoint: (t: number) => ({ x: 0, y: 0, z: 4 * t * t }) };
    for (const [segments, radial] of [[8, 4], [16, 8], [32, 12]] as const) {
      const mesh = tubeParityMesh({ path, tubularSegments: segments, radialSegments: radial, radius: 0.25 });
      checkMesh(mesh);
      expect(mesh.indices).toHaveLength(segments * radial * 6);
      expect(mesh.positions.length / 3).toBe((segments + 1) * (radial + 1));
      for (let row = 0; row <= segments; row += 1) {
        const first = point(mesh.positions, row * (radial + 1));
        const last = point(mesh.positions, row * (radial + 1) + radial);
        expectPoint(first, last);
        expect(Math.hypot(first[0], first[1])).toBeCloseTo(0.25, 5);
        expect(first[2]).toBeCloseTo(4 * row / segments, 3);
      }
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
    }
    const closedPath = { getPoint: (t: number) => ({ x: Math.cos(t * Math.PI * 2), y: Math.sin(t * Math.PI * 2), z: 0 }) };
    const closed = tubeParityMesh({ path: closedPath, tubularSegments: 24, radialSegments: 8, radius: 0.1, closed: true });
    expectPoint(point(closed.positions, 0), point(closed.positions, 24 * 9));
    expectUnitNormals(closed);
  });

  it("sweeps the requested tube around a closed torus-knot centerline", () => {
    const tube = 0.2;
    const radius = 1.3;
    const p = 2;
    const q = 3;
    for (const [segments, radial] of [[24, 6], [48, 8], [64, 12]] as const) {
      const mesh = torusKnotParityMesh({ radius, tube, p, q, tubularSegments: segments, radialSegments: radial });
      checkMesh(mesh);
      expect(mesh.indices).toHaveLength(segments * radial * 6);
      for (let row = 0; row <= segments; row += 1) {
        const t = row / segments;
        const a = 2 * Math.PI * p * t;
        const b = 2 * Math.PI * q * t;
        const center = [radius * (1 + 0.5 * Math.cos(b)) * Math.cos(a), radius * (1 + 0.5 * Math.cos(b)) * Math.sin(a), radius * 0.5 * Math.sin(b)];
        for (let col = 0; col <= radial; col += 1) {
          const v = point(mesh.positions, row * (radial + 1) + col);
          expect(Math.hypot(v[0] - center[0]!, v[1] - center[1]!, v[2] - center[2]!)).toBeCloseTo(tube, 5);
        }
        expectPoint(point(mesh.positions, row * (radial + 1)), point(mesh.positions, row * (radial + 1) + radial));
      }
      expectPoint(point(mesh.positions, 0), point(mesh.positions, segments * (radial + 1)));
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
    }
    for (const [p, q] of [[3, 4], [4, 5]] as const) {
      const mesh = torusKnotParityMesh({ radius: 0.7, tube: 0.2, tubularSegments: 48, radialSegments: 6, p, q });
      expectPoint(point(mesh.positions, 0), point(mesh.positions, 48 * 7));
      expectUnitNormals(mesh);
    }
  });

  it.each([['tetrahedron', 4], ['octahedron', 8], ['icosahedron', 20], ['dodecahedron', 36]] as const)("subdivides %s faces on the requested sphere", (variant: PolyhedronVariant, faces) => {
    for (const detail of [0, 1, 2]) {
      const radius = 2;
      const mesh = polyhedronParityMesh({ variant, detail, radius });
      checkMesh(mesh);
      expect(mesh.positions.length / 9).toBe(faces * (detail + 1) ** 2);
      for (let i = 0; i < mesh.positions.length; i += 3) {
        expect(Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!)).toBeCloseTo(radius, 5);
      }
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
      for (let i = 0; i < mesh.uvs!.length; i += 6) {
        const u = [mesh.uvs![i]!, mesh.uvs![i + 2]!, mesh.uvs![i + 4]!];
        expect(Math.max(...u) - Math.min(...u)).toBeLessThanOrEqual(0.75);
      }
    }
  });

  it("preserves rounded box extents, unit normals, groups and tessellation", () => {
    for (const segments of [1, 2, 3]) {
      const mesh = roundedBoxParityMesh({ width: 2, height: 1.5, depth: 1, radius: 0.2, segments });
      checkMesh(mesh);
      expectPoint(bounds(mesh.positions).min, [-1, -0.75, -0.5]);
      expectPoint(bounds(mesh.positions).max, [1, 0.75, 0.5]);
      expect(mesh.positions.length / 3).toBe(36 * (2 * segments + 1) ** 2);
      expect(mesh.groups).toHaveLength(6);
      expectUnitNormals(mesh);
      expectOutwardWinding(mesh);
    }
    checkMesh(roundedBoxParityMesh({ segments: 0 }));
    const zero = roundedBoxParityMesh({ width: 2, height: 1, depth: 1, radius: 0, segments: 2 });
    expectPoint(bounds(zero.positions).min, [-1, -0.5, -0.5]);
    expectUnitNormals(zero);
    const clamped = roundedBoxParityMesh({ width: 2, height: 1, depth: 1, radius: 10, segments: 2 });
    expectPoint(bounds(clamped.positions).max, [1, 0.5, 0.5]);
    expectOutwardWinding(clamped);
    expect(() => roundedBoxParityMesh({ radius: -1 })).toThrow();
    expect(() => polyhedronParityMeshFromBase([0, 0, 0], [1, 2, 3])).toThrow();
  });

  it("retains all box triangles, face groups and attributes when deindexing", () => {
    const box = boxParityMesh(2, 1, 3, 2, 1, 1);
    checkMesh(box);
    expect(box.groups).toHaveLength(6);
    expect(box.indices!.length).toBe(60);
    expect(box.groups!.map((g) => g.materialIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    const expanded = meshToNonIndexed(box);
    checkMesh(expanded);
    expect(expanded.indices).toBeUndefined();
    expect(expanded.groups).toEqual(box.groups);
    expect(expanded.positions).toEqual(box.indices!.flatMap((i) => box.positions.slice(i * 3, i * 3 + 3)));
    expect(expanded.normals).toEqual(box.indices!.flatMap((i) => box.normals!.slice(i * 3, i * 3 + 3)));
    expect(expanded.uvs).toEqual(box.indices!.flatMap((i) => box.uvs!.slice(i * 2, i * 2 + 2)));
    expectOutwardWinding(expanded);
  });
});

describe("native shapes, extrusion and topology contracts", () => {
  const outer = [[0, 0], [4, 0], [4, 3], [0, 3]] as const;
  const hole = [[1, 1], [3, 1], [3, 2], [1, 2]] as const;
  const shape = { points: outer, holes: [hole] };
  it("triangulates concave contours and holes with positive winding and exact area", () => {
    const shapes = [
      { shape: outer, area: 12 },
      { shape, area: 10 },
      { shape: [[0, 0], [2, 0], [2, 1], [1, 0.5], [0, 1]], area: 1.5 }
    ];
    for (const fixture of shapes) {
      const mesh = shapeParityMesh({ shape: fixture.shape });
      checkMesh(mesh);
      expect(triangleXYArea(mesh)).toBeCloseTo(fixture.area, 6);
      expectUnitNormals(mesh);
    }
    const multi = shapeParityMesh({ shape: { points: [[0,0], [8,0], [8,6], [5,6], [5,4], [3,4], [3,6], [0,6]], holes: [[[1,1], [2,1], [2,2], [1,2]], [[6,1], [7,1], [7,3], [6,3]]] } });
    expect(triangleXYArea(multi)).toBeCloseTo(41, 6);
    checkMesh(multi);
    const coords = [0,0,9, 4,0,9, 4,3,9, 0,3,9, 1,1,9, 3,1,9, 3,2,9, 1,2,9];
    const triangles = earcut(coords, [4], 3);
    expect(triangles.length).toBeGreaterThan(0);
    expect(triangles.every((i) => Number.isInteger(i) && i >= 0 && i < 8)).toBe(true);
    const fromStride: ParityMesh = { positions: Array.from({ length: 8 }, (_, i) => [coords[3*i]!, coords[3*i+1]!, 0]).flat(), indices: triangles };
    expect(triangleXYArea(fromStride)).toBeCloseTo(10, 6);
    expect(() => shapeParityMesh({ shape: { points: outer, holes: [[[6,6], [7,6], [7,7], [6,7]]] } })).toThrow(/inside|hole/i);
  });

  it("transports orthonormal curve frames and handles a zero-length curve safely", () => {
    const curve = new Curve3Adapter((t) => new Vector3(Math.cos(t), Math.sin(t), t));
    const frames = curve.computeFrenetFrames(12, false);
    for (let i = 0; i <= 12; i += 1) {
      const tangent = frames.tangents[i]!;
      const normal = frames.normals[i]!;
      const binormal = frames.binormals[i]!;
      expect(tangent.length()).toBeCloseTo(1, 6);
      expect(normal.length()).toBeCloseTo(1, 6);
      expect(binormal.length()).toBeCloseTo(1, 6);
      expect(tangent.dot(normal)).toBeCloseTo(0, 6);
      expect(tangent.dot(binormal)).toBeCloseTo(0, 6);
      expect(normal.dot(binormal)).toBeCloseTo(0, 6);
    }
    const fixed = new Curve3Adapter(() => new Vector3(1, 2, 3));
    expect(fixed.getLength()).toBe(0);
    expect(fixed.getPointAt(0.5).toArray()).toEqual([1, 2, 3]);
    const stationary = tubeParityMesh({ path: fixed, tubularSegments: 4, radialSegments: 4 });
    checkMesh(stationary);
    expectPoint(point(stationary.positions, 0), point(stationary.positions, 4 * 5));
    expectUnitNormals(stationary);
    const loop = new Curve3Adapter((t) => new Vector3(Math.cos(2 * Math.PI * t), Math.sin(2 * Math.PI * t), 0.2 * Math.sin(4 * Math.PI * t)));
    const loopFrames = loop.computeFrenetFrames(32, true);
    expectPoint(loopFrames.normals[0]!.toArray(), loopFrames.normals[32]!.toArray(), 5);
    expectPoint(loopFrames.binormals[0]!.toArray(), loopFrames.binormals[32]!.toArray(), 5);
  });

  it("builds caps and sidewalls, including bevels on straight and path extrusions", () => {
    const square = [[0, 0], [2, 0], [2, 1], [0, 1]] as const;
    const flat = extrudeParityMesh({ shape: square, depth: 2, steps: 1, bevelEnabled: false });
    checkMesh(flat);
    expect(flat.positions.length / 3).toBe(36);
    expectPoint(bounds(flat.positions).min, [0, 0, 0]);
    expectPoint(bounds(flat.positions).max, [2, 1, 2]);
    expect(flat.groups).toHaveLength(2);
    expect(flat.groups!.reduce((sum, g) => sum + g.count, 0)).toBe(36);
    expect(parityMeshToGeometry(flat).groups).toEqual(flat.groups);
    expect(flat.normals!.some((n, i) => i % 3 === 2 && n < -0.99)).toBe(true);
    expect(flat.normals!.some((n, i) => i % 3 === 2 && n > 0.99)).toBe(true);
    expectUnitNormals(flat);
    expectNormalsAwayFrom(flat, [1, 0.5, 1]);
    const bevel = extrudeParityMesh({ shape: square, depth: 2, steps: 1, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 2 });
    checkMesh(bevel);
    expect(bevel.positions.length).toBeGreaterThan(flat.positions.length);
    expect(bounds(bevel.positions).min[2]).toBeCloseTo(-0.2);
    expect(bounds(bevel.positions).max[2]).toBeCloseTo(2.2);
    const holed = extrudeParityMesh({ shape, depth: 1, bevelEnabled: false });
    checkMesh(holed);
    expect(holed.positions.length).toBeGreaterThan(flat.positions.length);
    const capCount = holed.groups![0]!.count;
    const capHalf = capCount / 2;
    const cap1: ParityMesh = { positions: holed.positions.slice(0, capHalf * 3) };
    const cap2: ParityMesh = { positions: holed.positions.slice(capHalf * 3, capCount * 3) };
    expect(Math.abs(triangleXYArea(cap1))).toBeCloseTo(10, 6);
    expect(Math.abs(triangleXYArea(cap2))).toBeCloseTo(10, 6);
    const path = { getPoint: (t: number) => ({ x: 0, y: 0, z: 2 * t }) };
    const sweep = extrudeParityMesh({ shape: square, extrudePath: path, steps: 4, bevelEnabled: false });
    checkMesh(sweep);
    expect(sweep.positions.length).toBeGreaterThan(flat.positions.length);
    const bevelSweep = extrudeParityMesh({ shape: square, extrudePath: path, steps: 4, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.2, bevelSegments: 2 });
    checkMesh(bevelSweep);
    expect(bounds(bevelSweep.positions).min[2]).toBeCloseTo(-0.2);
    expect(bounds(bevelSweep.positions).max[2]).toBeCloseTo(2.2);
    expect(bevelSweep.positions.length).toBeGreaterThan(sweep.positions.length);
    const negative = extrudeParityMesh({ shape: square, depth: -2, steps: 1, bevelEnabled: false });
    expectPoint(bounds(negative.positions).min, [0, 0, -2]);
    expectPoint(bounds(negative.positions).max, [2, 1, 0]);
    expectUnitNormals(negative);
    expectOutwardWinding(negative);
    expectNormalsAwayFrom(negative, [1, 0.5, -1]);
    expect(() => extrudeParityMesh({ shape: [[0,0], [1,0], [2,0]], bevelEnabled: false })).toThrow(/area|ring/i);
  });

  it("finds only boundary and creased edges while retaining all unique wireframe edges", () => {
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
    const indices = [0, 1, 2, 0, 2, 3];
    const expanded = indices.flatMap((i) => positions.slice(i * 3, i * 3 + 3));
    for (const input of [{ positions, indices }, { positions: expanded }]) {
      expect(edgesParityMesh(input, 1).positions).toHaveLength(4 * 6);
      expect(wireframeParityMesh(input).positions).toHaveLength(5 * 6);
    }
    expect(wireframeParityMesh({ positions, indices, groups: [{ start: 0, count: 3 }] }).positions).toHaveLength(3 * 6);
    const corner = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 1, 0, 3] };
    expect(edgesParityMesh(corner, 45).positions).toHaveLength(5 * 6);
    expect(edgesParityMesh(corner, 120).positions).toHaveLength(4 * 6);
  });

  it("constructs a closed convex hull, discarding duplicate/interior points and orienting faces outward", () => {
    const corners = [[-1,-1,-1], [1,-1,-1], [-1,1,-1], [1,1,-1], [-1,-1,1], [1,-1,1], [-1,1,1], [1,1,1]] as const;
    const mesh = convexParityMesh({ points: [...corners, [0, 0, 0], corners[0]] });
    checkMesh(mesh);
    expect(mesh.indices).toBeUndefined();
    expect(mesh.positions.length / 9).toBe(12);
    expectPoint(bounds(mesh.positions).min, [-1, -1, -1]);
    expectPoint(bounds(mesh.positions).max, [1, 1, 1]);
    expectUnitNormals(mesh);
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const c = [0, 1, 2].map((axis) => (mesh.positions[i + axis]! + mesh.positions[i + axis + 3]! + mesh.positions[i + axis + 6]!) / 3);
      expect(c[0]! * mesh.normals![i]! + c[1]! * mesh.normals![i + 1]! + c[2]! * mesh.normals![i + 2]!).toBeGreaterThan(0);
    }
    const spec = geometry.convex(corners);
    expect(spec.kind).toBe("aura-custom-geometry");
    expect(normalizeGeometryAttributes(spec).positions).toHaveLength(mesh.positions.length);
    expect(() => geometry.convex([[0,0,0], [1,0,0], [0,1,0]])).toThrow(/at least four/);
    expect(() => geometry.convex([[0,0,0], [1,0,0], [2,0,0], [3,0,0]])).toThrow();
    const tetra = convexParityMesh({ points: [[0,0,0], [1,0,0], [0,1,0], [0,0,1]] });
    expect(tetra.positions.length / 9).toBe(4);
    expectUnitNormals(tetra);
  });

  it.each([[0x1c0de, 1000, 10], [0xbeef, 64, 3], [0x5eed, 300, 25]] as const)("encloses a seeded %i cloud with %i points in a closed manifold", (seed, count, scale) => {
    let state: number = seed;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const points = Array.from({ length: count }, () => [(random() * 2 - 1) * scale, (random() * 2 - 1) * scale, (random() * 2 - 1) * scale] as const);
    const hull = convexParityMesh({ points });
    checkMesh(hull);
    expect(hull.positions.length).toBeGreaterThan(0);
    expectUnitNormals(hull);
    const edgeCounts = new Map<string, number>();
    const key = (p: readonly number[]): string => p.join(",");
    for (let i = 0; i < hull.positions.length; i += 9) {
      const a = hull.positions.slice(i, i + 3);
      const b = hull.positions.slice(i + 3, i + 6);
      const c = hull.positions.slice(i + 6, i + 9);
      const n = hull.normals!.slice(i, i + 3);
      for (const input of points) {
        const distance = (input[0] - a[0]!) * n[0]! + (input[1] - a[1]!) * n[1]! + (input[2] - a[2]!) * n[2]!;
        expect(distance).toBeLessThanOrEqual(1e-7 * scale);
      }
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const edge = [key(u!), key(v!)].sort().join("|");
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
      }
    }
    expect([...edgeCounts.values()].every((uses) => uses === 2)).toBe(true);
  });
});

describe("geometry.toNonIndexed", () => {
  it("expands positions, normals and UVs in index order without mutating the source", () => {
    const positions = [0,0,0, 1,0,0, 1,1,0, 0,1,0];
    const normals = [0,0,1, 0,0,1, 0,0,1, 0,0,1];
    const uvs = [0,0, 1,0, 1,1, 0,1];
    const indices = [0,1,2, 0,2,3];
    const spec = geometry.define({ positions, normals, uvs, indices });
    const result = normalizeGeometryAttributes(geometry.toNonIndexed(spec));
    expect(Array.from(result.positions)).toEqual(indices.flatMap((i) => positions.slice(3*i, 3*i+3)));
    expect(Array.from(result.normals!)).toEqual(indices.flatMap((i) => normals.slice(3*i, 3*i+3)));
    expect(Array.from(result.uvs!)).toEqual(indices.flatMap((i) => uvs.slice(2*i, 2*i+2)));
    expect(result.indices?.length ?? 0).toBe(0);
    expect(indices).toEqual([0,1,2, 0,2,3]);
  });
  it("returns the existing spec when already non-indexed", () => {
    const spec = geometry.define({ positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], indices: [] });
    expect(geometry.toNonIndexed(spec)).toBe(spec);
  });
});

describe("primitives.box/sphere/plane/cylinder/capsule/torus params are never silently ignored", () => {
  const tier = { primitiveSegments: "full" } as const;
  const count = (kind: "sphere" | "cylinder" | "capsule" | "torus" | "box" | "plane", params?: object): number =>
    createPrimitiveGeometry(kind, params, tier).vertexBuffer.vertexCount;

  it("supported tessellation params change the generated geometry", () => {
    expect(count("sphere", { widthSegments: 8, heightSegments: 4 })).toBe((8 + 1) * (4 + 1));
    expect(count("sphere", { widthSegments: 16, heightSegments: 8 })).toBeGreaterThan(count("sphere", { widthSegments: 8, heightSegments: 4 }));
    expect(count("cylinder", { radialSegments: 8 })).toBeLessThan(count("cylinder", { radialSegments: 24 }));
    expect(count("capsule", { radialSegments: 8, capSegments: 2 })).toBeLessThan(count("capsule", { radialSegments: 24, capSegments: 6 }));
    expect(count("torus", { radialSegments: 8, tubularSegments: 4 })).toBeLessThan(count("torus", { radialSegments: 24, tubularSegments: 12 }));
    expect(count("box", { widthSegments: 3 })).toBeGreaterThan(count("box"));
    expect(count("plane", { widthSegments: 4, heightSegments: 4 })).toBe(25);
    const tapered = Array.from(createPrimitiveGeometry("cylinder", { radiusTop: 0 }, tier).vertexBuffer.floats);
    const straight = Array.from(createPrimitiveGeometry("cylinder", {}, tier).vertexBuffer.floats);
    expect(tapered).not.toEqual(straight);
  });

  it("params that cannot take effect throw a named error that points at `size`", () => {
    for (const [kind, factory] of [
      ["sphere", primitives.sphere],
      ["cylinder", primitives.cylinder],
      ["capsule", primitives.capsule]
    ] as const) {
      let error: unknown;
      try {
        factory({ params: { radius: 0.15 } });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(AuraRuntimeError);
      expect((error as AuraRuntimeError).code).toBe("invalid-primitive-params");
      expect((error as AuraRuntimeError).message).toContain(`primitives.${kind}`);
      expect((error as AuraRuntimeError).message).toContain('"radius"');
      expect((error as AuraRuntimeError).message).toContain("size:");
    }
    expect(() => primitives.box({ params: { depth: 2, height: 3 } })).toThrowError(/"depth", "height" have no effect/);
    expect(() => primitives.torus({ params: { radius: 1 } })).toThrowError(AuraRuntimeError);
  });

  it("supported params, no params, and the SG-03 kinds still build", () => {
    expect(() => primitives.sphere({ params: { widthSegments: 12, heightSegments: 6 } })).not.toThrow();
    expect(() => primitives.cylinder({ params: { radiusTop: 0.5, radiusBottom: 0.25, openEnded: true } })).not.toThrow();
    expect(() => primitives.capsule()).not.toThrow();
    expect(() => primitives.cone({ params: { radius: 2, height: 3 } })).not.toThrow();
    expect(() => primitives.ring({ params: { innerRadius: 0.2, outerRadius: 1 } })).not.toThrow();
  });
});
