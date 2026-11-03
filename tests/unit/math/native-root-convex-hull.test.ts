import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConvexHull, ConvexHullFace, HalfEdge, Ray, Vector3, VertexList, VertexNode
} from "../../../packages/math/src/index.js";

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const tetra = (): Vector3[] => [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)];
const cube = (): Vector3[] => [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((y) => [-1, 1].map((z) => v(x, y, z))));

function rotatedThinMap(random: () => number, thickness: number): (x: number, y: number, z: number) => Vector3 {
  const [a, b, c] = [random(), random(), random()].map((value) => 2 * Math.PI * value);
  const sx = Math.sin(a!), cx = Math.cos(a!);
  const sy = Math.sin(b!), cy = Math.cos(b!);
  const sz = Math.sin(c!), cz = Math.cos(c!);
  return (x, y, z) => {
    z *= thickness;
    const first = cy * x + sy * z;
    const second = sx * sy * x + cx * y - sx * cy * z;
    const third = -cx * sy * x + sx * y + cx * cy * z;
    return v(cz * first - sz * second, sz * first + cz * second, third);
  };
}

function close(actual: number, expected: number, error = 1e-10): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(error);
}

function point(actual: Vector3 | undefined, expected: Vector3, error = 1e-10): void {
  expect(actual).toBeInstanceOf(Vector3);
  close(actual!.x, expected.x, error);
  close(actual!.y, expected.y, error);
  close(actual!.z, expected.z, error);
}

function topology(hull: ConvexHull, points: Vector3[], slack = 1e-10): void {
  const nodes = new Set<VertexNode>();
  const edges = new Set<HalfEdge>();
  const allNodes = new Set(hull.vertices);
  for (const face of hull.faces) {
    expect(face).toBeInstanceOf(ConvexHullFace);
    expect(face.normal).toBeInstanceOf(Vector3);
    expect(face.midpoint).toBeInstanceOf(Vector3);
    expect(face.area).toBeGreaterThan(0);
    close(face.normal.length(), 1);
    expect(face.getEdge(3)).toBe(face.edge);
    expect(face.getEdge(-3)).toBe(face.edge);
    for (let i = 0; i < 3; i += 1) {
      const edge = face.getEdge(i);
      expect(edge).toBeInstanceOf(HalfEdge);
      expect(edge.face).toBe(face);
      expect(edge.next!.prev).toBe(edge);
      expect(edge.prev!.next).toBe(edge);
      expect(edge.twin!.twin).toBe(edge);
      expect(edge.twin!.head()).toBe(edge.tail());
      expect(edge.twin!.tail()).toBe(edge.head());
      expect(allNodes.has(edge.head())).toBe(true);
      close(face.distanceToPoint(edge.head().point), 0, slack);
      nodes.add(edge.head());
      edges.add(edge);
    }
    for (const p of points) {
      expect(face.distanceToPoint(p)).toBeLessThanOrEqual(Math.max(slack, 8 * hull.tolerance));
    }
  }
  expect(edges.size % 2).toBe(0);
  expect(nodes.size - edges.size / 2 + hull.faces.length).toBe(2);
}

// These measurements follow from the coordinate bounds and elementary face
// areas. The separate bookkeeping assertions record 4.x public lifecycle.
const analytic = {
  tetraTolerance: 3 * Number.EPSILON * 3,
  tetraArea: 3 * .5 + Math.sqrt(3) / 2,
  cubeArea: 6 * 4,
  planarTolerance: 3 * Number.EPSILON * 2,
  planarArea: 2
} as const;

describe("Aura3D root convex hull: 4.x compatibility", () => {
  it("exports the root Vector3, Ray, face, edge and vertex contracts", () => {
    const points = tetra();
    const hull = ConvexHull.fromPoints(points);
    expectTypeOf(hull.intersectRay(new Ray())).toEqualTypeOf<Vector3 | undefined>();
    expectTypeOf(hull.vertices[0]!.point).toEqualTypeOf<Vector3>();
    expectTypeOf(hull.faces[0]!.normal).toEqualTypeOf<Vector3>();
    expectTypeOf(hull.faces[0]!.edge).toEqualTypeOf<HalfEdge | null>();
    expect(hull.tolerance).toBe(analytic.tetraTolerance);
    expect(hull.faces).toHaveLength(4);
    expect(hull.faces.map((face) => points.indexOf(face.edge!.head().point))).toEqual([0, 3, 3, 3]);
    close(hull.faces.reduce((sum, face) => sum + face.area, 0), analytic.tetraArea);
    expect(hull.vertices.map((node) => node.point)).toEqual(points);
    hull.vertices.forEach((node, index) => expect(node.point).toBe(points[index]));
    topology(hull, points);
    expect(hull.containsPoint(v(.2, .3, .1))).toBe(true);
    expect(hull.containsPoint(v(.2, .3, .6))).toBe(false);
    point(hull.intersectRay(new Ray(v(-1, .2, .2), v(1, 0, 0))), v(0, .2, .2));
    point(hull.intersectRay(new Ray(v(.2, .2, .2), v(1, 0, 0))), v(.6, .2, .2));
  });

  it("typechecks a strict root Vector3/Ray consumer without emitting files", () => {
    const consumerPath = resolve("packages/math/src/__root_hull_consumer__.mts");
    const consumer = `
      import { ConvexHull, ConvexHullFace, HalfEdge, Ray, Vector3, VertexList, VertexNode } from "./index.js";
      type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      type Assert<T extends true> = T;
      type Point = Assert<Equal<VertexNode["point"], Vector3>>;
      type Normal = Assert<Equal<ConvexHullFace["normal"], Vector3>>;
      type Midpoint = Assert<Equal<ConvexHullFace["midpoint"], Vector3>>;
      type FaceEdge = Assert<Equal<ConvexHullFace["edge"], HalfEdge | null>>;
      type EdgeTwin = Assert<Equal<HalfEdge["twin"], HalfEdge | null>>;
      type NodeFace = Assert<Equal<VertexNode["face"], ConvexHullFace | null>>;
      type ListHead = Assert<Equal<VertexList["head"], VertexNode | null>>;
      type RayInput = Assert<Equal<Parameters<ConvexHull["intersectRay"]>[0], Ray>>;
      type RayHit = Assert<Equal<ReturnType<ConvexHull["intersectRay"]>, Vector3 | undefined>>;
      const p = new Vector3(0, 0, 0);
      const points: readonly Vector3[] = [p, new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
      const hull: ConvexHull = ConvexHull.fromPoints(points);
      const hit: Vector3 | undefined = hull.intersectRay(new Ray(p, new Vector3(1, 0, 0)));
      hull.setFromPoints(points).compute().makeEmpty();
      const node = new VertexNode(p);
      // @ts-expect-error Nullable links must be narrowed.
      node.prev.point;
      // @ts-expect-error The stored input point is a readonly reference.
      node.point = p;
      // @ts-expect-error The root hull accepts root vectors, not structural coordinates.
      hull.containsPoint({ x: 0, y: 0, z: 0 });
    `;
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: []
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    host.fileExists = (fileName) => fileName === consumerPath || fileExists(fileName);
    host.readFile = (fileName) => fileName === consumerPath ? consumer : readFile(fileName);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
      fileName === consumerPath
        ? ts.createSourceFile(fileName, consumer, languageVersion, true)
        : getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([consumerPath], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n"
    })).toBe("");
  });

  it("matches analytic cube measurements and retains duplicate and interior inputs", () => {
    const corners = cube();
    const points = [...corners, corners[0]!, v(0, 0, 0), v(1, 0, 0)];
    const hull = new ConvexHull().setFromPoints(points);
    expect(hull.vertices).toHaveLength(11);
    expect(hull.vertices[8]!.point).toBe(corners[0]);
    expect(hull.faces).toHaveLength(12);
    expect(hull.tolerance).toBe(analytic.tetraTolerance);
    close(hull.faces.reduce((sum, face) => sum + face.area, 0), analytic.cubeArea);
    topology(hull, points);
    expect(hull.assigned.isEmpty()).toBe(true);
    expect(hull.unassigned.isEmpty()).toBe(true);
    expect(hull.newFaces).toEqual([]);
  });

  it("preserves the recorded empty and short-input behavior", () => {
    const ray = new Ray(v(-2, 0, 0), v(1, 0, 0));
    const empty = new ConvexHull();
    expect(empty.tolerance).toBe(-1);
    expect(empty.containsPoint(v(123, -20, 40))).toBe(true);
    // 4.x returned ray.at(Infinity) for no supporting planes.
    const emptyHit = empty.intersectRay(ray)!;
    expect(emptyHit).toBeInstanceOf(Vector3);
    expect(emptyHit.x).toBe(Infinity);
    expect(Number.isNaN(emptyHit.y)).toBe(true);
    expect(Number.isNaN(emptyHit.z)).toBe(true);
    expect(empty.intersectsRay(ray)).toBe(true);
    expect(() => empty.compute()).toThrow(TypeError);
    for (let n = 0; n < 4; n += 1) {
      expect(empty.setFromPoints(tetra().slice(0, n))).toBe(empty);
      expect(empty.faces).toHaveLength(0);
    }
    const hull = ConvexHull.fromPoints(cube());
    const beforeFaces = hull.faces;
    const beforeVertices = hull.vertices;
    const beforeTolerance = hull.tolerance;
    hull.setFromPoints(tetra().slice(0, 3));
    expect(hull.faces).toBe(beforeFaces);
    expect(hull.vertices).toBe(beforeVertices);
    expect(hull.tolerance).toBe(beforeTolerance);
  });

  it("preserves collinear failure state and the four-face coplanar contract", () => {
    for (const points of [
      [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0)],
      [v(0, 0, 0), v(1, 1, 1), v(2, 2, 2), v(3, 3, 3)],
      Array.from({ length: 4 }, () => v(1, 1, 1))
    ]) {
      const hull = new ConvexHull();
      expect(() => hull.setFromPoints(points)).toThrow(TypeError);
      expect(hull.faces).toEqual([]);
      expect(hull.vertices).toHaveLength(4);
      expect(hull.tolerance).toBeGreaterThanOrEqual(0);
    }
    const points = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(1, 1, 0)];
    const planar = ConvexHull.fromPoints(points);
    expect(planar.tolerance).toBe(analytic.planarTolerance);
    expect(planar.faces).toHaveLength(4);
    close(planar.faces.reduce((sum, face) => sum + face.area, 0), analytic.planarArea);
    topology(planar, points);
    // The 4.x representation is a pair of supporting planes, not the v5
    // bounded polygon; callers could observe this beyond the square.
    expect(planar.containsPoint(v(4, 4, 0))).toBe(true);
    expect(planar.containsPoint(v(.5, .5, 1))).toBe(false);
    point(planar.intersectRay(new Ray(v(4, 4, 2), v(0, 0, -1))), v(4, 4, 0));

    const repeatedCorner = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(0, 0, 0)];
    const degenerateFaces = ConvexHull.fromPoints(repeatedCorner);
    expect(degenerateFaces.faces.map((face) => face.area).sort((a, b) => a - b)).toEqual([0, 0, .5, .5]);
    for (const face of degenerateFaces.faces) {
      for (let i = 0; i < 3; i += 1) expect(face.getEdge(i).twin!.twin).toBe(face.getEdge(i));
    }
    const extended = ConvexHull.fromPoints([v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(1, 1, 0), v(20, 0, 0)]);
    expect(extended.faces.map((face) => face.area).sort((a, b) => a - b)).toEqual([0, .5, 9.5, 10]);
  });

  it("keeps very thin solids instead of applying the v5 degeneracy threshold", () => {
    const thinTetra = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(0, 0, 1e-15)];
    const hull = ConvexHull.fromPoints(thinTetra);
    expect(hull.faces).toHaveLength(4);
    expect(hull.faces.every((face) => face.area > 0)).toBe(true);
    topology(hull, thinTetra);
    const slab = cube().map((p) => v(p.x, p.y, p.z * 1e-15));
    const slabHull = ConvexHull.fromPoints(slab);
    expect(slabHull.faces).toHaveLength(12);
    close(slabHull.faces.reduce((sum, face) => sum + face.area, 0), 8, 2e-13);
    topology(slabHull, slab);

    const tilted = cube().map((p) => v(p.x, p.y, .3 * p.x + .7 * p.y + 1e-14 * p.z));
    const tiltedHull = ConvexHull.fromPoints(tilted);
    expect(tiltedHull.faces).toHaveLength(12);
    topology(tiltedHull, tilted);
    for (const face of tiltedHull.faces) {
      for (const p of tilted) expect(face.distanceToPoint(p)).toBeLessThanOrEqual(2 * tiltedHull.tolerance);
    }
  });

  it("matches scale-dependent tolerances for small, large and translated inputs", () => {
    for (const scale of [1e-100, 1, 1e100]) {
      const points = tetra().map((p) => p.multiplyScalar(scale));
      const hull = ConvexHull.fromPoints(points);
      expect(hull.faces).toHaveLength(4);
      close(hull.tolerance / scale, analytic.tetraTolerance, 1e-29);
      close(hull.faces.reduce((sum, face) => sum + face.area, 0) / (scale * scale), analytic.tetraArea);
      topology(hull, points, scale * 1e-10);
      expect(hull.containsPoint(v(.1 * scale, .2 * scale, .3 * scale))).toBe(true);
      expect(hull.containsPoint(v(.6 * scale, .6 * scale, .6 * scale))).toBe(false);
    }
    const offset = 1e12;
    const points = cube().map((p) => p.add(v(offset, offset, offset)));
    const hull = ConvexHull.fromPoints(points);
    expect(hull.faces).toHaveLength(12);
    expect(hull.tolerance).toBe(0.00199840144432728);
    topology(hull, points, .002);
    expect(hull.containsPoint(v(offset, offset, offset))).toBe(true);
    expect(hull.containsPoint(v(offset + 2, offset, offset))).toBe(false);
    point(hull.intersectRay(new Ray(v(offset - 3, offset, offset), v(1, 0, 0))), v(offset - 1, offset, offset));
  });

  it("keeps solid geometry when face areas underflow or overflow", () => {
    for (const scale of [1e-200, 1e200]) {
      const points = cube().map((p) => p.multiplyScalar(scale));
      const hull = ConvexHull.fromPoints(points);
      expect(hull.faces).toHaveLength(12);
      for (const face of hull.faces) {
        close(face.normal.length(), 1);
        expect(face.area).toBe(scale < 1 ? 0 : Infinity);
        for (let i = 0; i < 3; i += 1) expect(face.getEdge(i).twin!.twin).toBe(face.getEdge(i));
      }
      expect(hull.containsPoint(v(.5 * scale, 0, 0))).toBe(true);
      expect(hull.containsPoint(v(1.5 * scale, 0, 0))).toBe(false);
      const hit = hull.intersectRay(new Ray(v(-2 * scale, 0, 0), v(1, 0, 0)))!;
      expect(hit).toBeInstanceOf(Vector3);
      close(hit.x / scale, -1, 1e-12);
      expect(hit.y).toBe(0);
      expect(hit.z).toBe(0);
    }
  });

  it("preserves mutable face queries and makeEmpty bookkeeping", () => {
    const hull = ConvexHull.fromPoints(tetra());
    const retainedTolerance = hull.tolerance;
    const assigned = new VertexNode(v(10, 0, 0));
    const unassigned = new VertexNode(v(11, 0, 0));
    const oldFace = hull.faces[0]!;
    hull.assigned.append(assigned);
    hull.unassigned.append(unassigned);
    hull.newFaces.push(oldFace);
    expect(hull.makeEmpty()).toBe(hull);
    expect(hull.faces).toEqual([]);
    expect(hull.vertices).toEqual([]);
    expect(hull.tolerance).toBe(retainedTolerance);
    expect(hull.assigned.first()).toBe(assigned);
    expect(hull.unassigned.first()).toBe(unassigned);
    expect(hull.newFaces).toEqual([oldFace]);
    hull.assigned.clear();
    hull.unassigned.clear();
    hull.setFromPoints(tetra());
    expect(hull.assigned.isEmpty()).toBe(true);
    expect(hull.unassigned.isEmpty()).toBe(true);
    expect(hull.newFaces).toEqual([]);

    const plane = hull.faces.find((face) => face.normal.x > .5)!;
    plane.normal = v(1, 0, 0);
    plane.constant = -.5;
    expect(hull.containsPoint(v(0, 0, 0))).toBe(false);
    plane.constant = 2;
    expect(hull.containsPoint(v(0, 0, 0))).toBe(true);
  });

  it("retains the recorded vertex bookkeeping and partial state on invalid assigned input", () => {
    const points = [...cube(), v(0, 0, 0), v(.5, 0, 0)];
    const hull = ConvexHull.fromPoints(points);
    expect(hull.vertices.map((node) => node.face?.mark ?? null)).toEqual([
      null, null, 1, null, null, 1, 1, 1, null, 1
    ]);
    expect(hull.vertices.map((node) => node.prev === null ? -1 : hull.vertices.indexOf(node.prev))).toEqual([
      -1, -1, -1, -1, -1, -1, -1, 9, -1, -1
    ]);
    expect(hull.vertices.map((node) => node.next === null ? -1 : hull.vertices.indexOf(node.next))).toEqual([
      -1, -1, 5, -1, -1, -1, 2, 5, -1, 5
    ]);
    expect(hull.assigned.isEmpty()).toBe(true);
    expect(hull.unassigned.isEmpty()).toBe(true);

    const malformed = new ConvexHull();
    const orphan = new VertexNode(v(9, 0, 0));
    malformed.assigned.append(orphan);
    expect(() => malformed.setFromPoints(tetra())).toThrow(TypeError);
    expect(malformed.vertices).toHaveLength(4);
    expect(malformed.faces).toHaveLength(4);
    expect(malformed.assigned.first()).toBe(orphan);
  });

  it("keeps compute() public and appends faces until makeEmpty() is called", () => {
    const hull = ConvexHull.fromPoints(tetra());
    const previousArray = hull.faces;
    const previousFaces = [...previousArray];
    expect(hull.compute()).toBe(hull);
    expect(previousArray).toHaveLength(8);
    expect(hull.faces).toHaveLength(8);
    for (const face of previousFaces) expect(hull.faces).toContain(face);
    expect(hull.containsPoint(v(.2, .2, .2))).toBe(true);
    const growing = ConvexHull.fromPoints(tetra());
    growing.vertices.push(new VertexNode(v(2, 0, 0)));
    growing.compute();
    expect(growing.faces).toHaveLength(8);
    expect(growing.containsPoint(v(1.5, 0, 0))).toBe(false);

    const repeatedCube = ConvexHull.fromPoints(cube());
    const cubeFaces = [...repeatedCube.faces];
    repeatedCube.compute();
    // Existing faces are retained and the new four-face seed is appended.
    expect(repeatedCube.faces).toHaveLength(16);
    for (const face of cubeFaces) expect(repeatedCube.faces).toContain(face);

    const extended = ConvexHull.fromPoints(tetra());
    const oldDiagonal = extended.faces.find((face) => face.normal.x > 0 && face.normal.y > 0 && face.normal.z > 0)!;
    for (const p of [v(2, 0, 0), v(0, 2, 0), v(0, 0, 2), v(1, 1, 1)]) {
      extended.vertices.push(new VertexNode(p));
    }
    extended.compute();
    // The point (1,1,1) replaces one original triangle with three while the
    // second seed remains a separate four-face component.
    expect(extended.faces).toHaveLength(10);
    expect(oldDiagonal.mark).toBe(1);
    expect(extended.faces).not.toContain(oldDiagonal);
    for (const face of extended.faces) {
      for (let i = 0; i < 3; i += 1) expect(face.getEdge(i).twin!.twin).toBe(face.getEdge(i));
    }
  });

  it("uses the recorded 4.x face, edge and vertex-list lifecycle", () => {
    const a = new VertexNode(v(0, 0, 0));
    const b = new VertexNode(v(1, 0, 0));
    const c = new VertexNode(v(0, 1, 0));
    const face = ConvexHullFace.create(a, b, c);
    expect(face.edge!.head()).toBe(a);
    expect(face.edge!.tail()).toBe(c);
    expect(face.getEdge(-1)).toBe(face.edge!.prev);
    point(face.normal, v(0, 0, 1));
    point(face.midpoint, v(1 / 3, 1 / 3, 0));
    expect(face.area).toBe(.5);
    expect(face.constant).toBe(0);
    expect(face.distanceToPoint(v(0, 0, 2))).toBe(2);
    expect(face.compute()).toBe(face);
    const detached = new HalfEdge(a, face);
    expect(detached.tail()).toBeNull();
    expect(detached.length()).toBe(-1);
    expect(detached.lengthSquared()).toBe(-1);
    const other = new HalfEdge(b, face);
    const replacement = new HalfEdge(c, face);
    expect(detached.setTwin(other)).toBe(detached);
    detached.setTwin(replacement);
    expect(replacement.twin).toBe(detached);
    // Re-pairing did not detach a previous twin in the legacy class.
    expect(other.twin).toBe(detached);
    expect(detached.setTwin(detached).twin).toBe(detached);

    const list = new VertexList();
    const x = new VertexNode(v(3, 0, 0));
    list.append(a).append(c).insertAfter(a, b).insertBefore(c, x);
    expect([list.first(), a.next, b.next, x.next, list.last()]).toEqual([a, b, x, c, c]);
    expect(list.remove(b)).toBe(list);
    expect(b.prev).toBe(a);
    expect(b.next).toBe(x);
    list.removeSubList(x, c);
    expect(list.first()).toBe(a);
    expect(list.last()).toBe(a);
    expect(x.prev).toBe(a);
    const d = new VertexNode(v(4, 0, 0));
    const e = new VertexNode(v(5, 0, 0));
    d.next = e;
    e.prev = d;
    list.appendChain(d);
    expect(a.next).toBe(d);
    expect(d.prev).toBe(a);
    expect(list.last()).toBe(e);
    expect(list.clear()).toBe(list);
    expect(list.isEmpty()).toBe(true);
    expect(a.next).toBe(d);
    expect(d.prev).toBe(a);
  });
});

describe("Aura3D root convex hull: independent geometry regressions", () => {
  it("preserves the hull and ray intersections through affine transforms and reflections", () => {
    const basis = [v(2, 1, .5), v(-.5, 2, 1), v(.3, -.4, 1.3)];
    for (const scale of [1e-100, 1, 1e100]) {
      for (const reflection of [-1, 1]) {
        const origin = v(100 * scale, -200 * scale, 300 * scale);
        const map = (x: number, y: number, z: number): Vector3 => origin
          .add(basis[0]!.multiplyScalar(reflection * scale * x))
          .add(basis[1]!.multiplyScalar(scale * y))
          .add(basis[2]!.multiplyScalar(scale * z));
        const points = [-1, 1].flatMap((x) =>
          [-1, 1].flatMap((y) => [-1, 1].map((z) => map(x, y, z))));
        const hull = ConvexHull.fromPoints(points);
        expect(hull.faces).toHaveLength(12);
        topology(hull, points, 1e-10 * scale);
        for (const p of points) expect(hull.containsPoint(p)).toBe(true);
        expect(hull.containsPoint(map(.2, -.3, .4))).toBe(true);
        expect(hull.containsPoint(map(1.5, 0, 0))).toBe(false);

        const ray = new Ray(map(-3, .25, -.25), basis[0]!.multiplyScalar(reflection));
        point(hull.intersectRay(ray), map(-1, .25, -.25), 1e-10 * scale);
      }
    }
  });

  it("keeps every supporting plane accurate on rotated thin solids", () => {
    let state = 0x9e3779b9;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    for (let run = 0; run < 12; run += 1) {
      const map = rotatedThinMap(random, 1e-8);
      const points = [-1, 1].flatMap((x) =>
        [-1, 1].flatMap((y) => [-1, 1].map((z) => map(x, y, z))));
      const hull = ConvexHull.fromPoints(points);
      expect(hull.faces).toHaveLength(12);
      topology(hull, points, 4 * hull.tolerance);
      for (const p of points) expect(hull.containsPoint(p)).toBe(true);
    }
  });

  it("keeps narrow irregular facets on their own supporting planes", () => {
    let state = (0x9e3779b9 ^ 15) >>> 0;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const map = rotatedThinMap(random, 1e-6);
    const points = Array.from({ length: 75 }, () => map(2 * random() - 1, 2 * random() - 1, 2 * random() - 1));
    const hull = ConvexHull.fromPoints(points);
    topology(hull, points, 4 * hull.tolerance);
    for (const p of points) expect(hull.containsPoint(p)).toBe(true);
  });

  it("constructs finite supporting planes when intermediate sums overflow", () => {
    for (const scale of [6e307, 1e308]) {
      const points = cube().map((p) => p.multiplyScalar(scale));
      const hull = ConvexHull.fromPoints(points);
      expect(hull.tolerance / scale).toBeCloseTo(9 * Number.EPSILON, 28);
      expect(hull.faces).toHaveLength(12);
      for (const face of hull.faces) {
        expect([face.normal.x, face.normal.y, face.normal.z, face.constant,
          face.midpoint.x, face.midpoint.y, face.midpoint.z].every(Number.isFinite)).toBe(true);
      }
      topology(hull, points, 1e-12 * scale);
      expect(hull.containsPoint(v(0, 0, 0))).toBe(true);
      expect(hull.containsPoint(v(1.5 * scale, 0, 0))).toBe(false);
      const hit = hull.intersectRay(new Ray(v(-1.5 * scale, 0, 0), v(1, 0, 0)));
      expect(hit).toBeInstanceOf(Vector3);
      close(hit!.x / scale, -1, 1e-12);
    }

    const face = ConvexHullFace.create(
      new VertexNode(v(1e308, 0, 0)),
      new VertexNode(v(1e308, 2e307, 0)),
      new VertexNode(v(1e308, 0, 2e307))
    );
    expect(Number.isFinite(face.midpoint.x)).toBe(true);
    close(face.midpoint.x / 1e308, 1, 1e-15);
    close(face.constant / 1e308, 1, 1e-15);

    // The intermediate dot-product sum overflows, but the signed projection
    // and the differences from the plane are both representable.
    const center = 1.65e308;
    const step = 1e303;
    const cancellation = ConvexHullFace.create(
      new VertexNode(v(center, center, center)),
      new VertexNode(v(center + step, center, center + step)),
      new VertexNode(v(center + step, center - step, center))
    );
    expect(Number.isFinite(cancellation.constant)).toBe(true);
    close(cancellation.constant / center, 1 / Math.sqrt(3), 1e-15);
    expect(Math.abs(cancellation.distanceToPoint(v(center, center, center)))).toBeLessThan(step * 1e-9);

    // The mathematical plane constant itself can exceed binary64's range.
    // Signed distances are still meaningful while the computed plane is intact.
    const distantPlane = ConvexHullFace.create(
      new VertexNode(v(center, center, center)),
      new VertexNode(v(center + step, center - step, center)),
      new VertexNode(v(center, center + step, center - step))
    );
    expect(distantPlane.constant).toBe(Infinity);
    expect(Math.abs(distantPlane.distanceToPoint(v(center, center, center)))).toBeLessThan(step * 1e-9);
    close(distantPlane.distanceToPoint(v(center + step, center + step, center + step)) / step,
      Math.sqrt(3), 1e-9);
    distantPlane.normal = v(1, 0, 0);
    distantPlane.constant = center;
    close(distantPlane.distanceToPoint(v(center + step, center, center)) / step, 1, 1e-9);

    const shifted = cube().map((p) => p.multiplyScalar(step).add(v(center, center, center)));
    const shiftedHull = ConvexHull.fromPoints(shifted);
    expect(shiftedHull.faces).toHaveLength(12);
    topology(shiftedHull, shifted, step * 1e-9);
    for (const p of shifted) expect(shiftedHull.containsPoint(p)).toBe(true);
    expect(shiftedHull.containsPoint(v(center + 2 * step, center, center))).toBe(false);
  });

  it("retains the near boundary when a distant ray parameter loses low bits", () => {
    const hull = ConvexHull.fromPoints(cube());
    for (const distance of [2 ** 54, 1e100, 1e300]) {
      const hit = hull.intersectRay(new Ray(v(distance, 0, 0), v(-1, 0, 0)));
      point(hit, v(1, 0, 0));
    }
  });

  it("retains closed cube geometry at representable subnormal scales", () => {
    for (const scale of [Number.MIN_VALUE, 1e-323, 1e-320]) {
      const points = cube().map((p) => p.multiplyScalar(scale));
      const hull = ConvexHull.fromPoints(points);
      expect(hull.faces).toHaveLength(12);
      for (const face of hull.faces) {
        close(face.normal.length(), 1);
        for (let i = 0; i < 3; i += 1) {
          expect(face.getEdge(i).twin!.twin).toBe(face.getEdge(i));
        }
      }
      for (const p of points) expect(hull.containsPoint(p)).toBe(true);
      expect(hull.containsPoint(v(2 * scale, 0, 0))).toBe(false);
      expect(hull.intersectRay(new Ray(v(-2 * scale, 0, 0), v(1, 0, 0)))!.x).toBe(-scale);
    }
  });

  it("has a closed outward surface for deterministic random and lattice clouds", () => {
    let state = 0xcafe1234;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    for (let run = 0; run < 12; run += 1) {
      const points = Array.from({ length: 40 }, () => v(2 * random() - 1, 2 * random() - 1, 2 * random() - 1));
      const hull = ConvexHull.fromPoints(points);
      topology(hull, points);
      for (let i = 0; i < 10; i += 1) {
        const a = points[Math.floor(random() * points.length)]!;
        const b = points[Math.floor(random() * points.length)]!;
        const t = random();
        expect(hull.containsPoint(a.multiplyScalar(t).add(b.multiplyScalar(1 - t)))).toBe(true);
      }
    }
    const lattice = [-1, 0, 1].flatMap((x) =>
      [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => v(x, y, z))));
    for (let run = 0; run < 16; run += 1) {
      const points = [...lattice];
      for (let i = points.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [points[i], points[j]] = [points[j]!, points[i]!];
      }
      const hull = ConvexHull.fromPoints(points);
      topology(hull, points);
      expect(hull.containsPoint(v(0, 0, 0))).toBe(true);
      expect(hull.containsPoint(v(1.01, 0, 0))).toBe(false);
    }
  }, 30_000);

  it("accepts more than the v5 input and distinct-point limits", () => {
    const corners = cube();
    const interior = Array.from({ length: 8_200 }, (_, i) => v(i / 20_000 - .25, 0, 0));
    const duplicate = v(0, .1, 0);
    const points = [...corners, ...interior, ...Array.from({ length: 92_000 }, () => duplicate)];
    const hull = ConvexHull.fromPoints(points);
    expect(points.length).toBeGreaterThan(100_000);
    expect(hull.vertices).toHaveLength(points.length);
    expect(hull.vertices.at(-1)!.point).toBe(duplicate);
    expect(hull.faces).toHaveLength(12);
    topology(hull, corners);
  });

  it("constructs an uncapped many-vertex closed surface", () => {
    // Points on a sphere are all extreme. This exceeds both the v5 distinct
    // point limit and its cumulative face-test budget, without invoking it.
    const count = 8_200;
    const angle = Math.PI * (3 - Math.sqrt(5));
    const points = Array.from({ length: count }, (_, i) => {
      const y = 1 - 2 * (i + .5) / count;
      const r = Math.sqrt(1 - y * y);
      return v(r * Math.cos(i * angle), y, r * Math.sin(i * angle));
    });
    const hull = ConvexHull.fromPoints(points);
    expect(hull.faces).toHaveLength(2 * count - 4);
    const used = new Set<VertexNode>();
    for (const face of hull.faces) {
      for (let i = 0; i < 3; i += 1) {
        const edge = face.getEdge(i);
        expect(edge.twin!.twin).toBe(edge);
        used.add(edge.head());
      }
    }
    expect(used.size).toBe(count);
  }, 30_000);

  it("matches tetrahedron half-space equations for seeded ray queries", () => {
    let state = 0x1234abcd;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const hull = ConvexHull.fromPoints(tetra());
    for (let i = 0; i < 250; i += 1) {
      const origin = v(4 * random() - 1.5, 4 * random() - 1.5, 4 * random() - 1.5);
      const direction = i % 2
        ? v(random() - .5, random() - .5, random() - .5)
        : v(.2 - origin.x, .2 - origin.y, .2 - origin.z);
      const ray = new Ray(origin, direction);
      let entry = -Infinity;
      let exit = Infinity;
      for (const [offset, slope] of [
        [-origin.x, -ray.direction.x],
        [-origin.y, -ray.direction.y],
        [-origin.z, -ray.direction.z],
        [origin.x + origin.y + origin.z - 1, ray.direction.x + ray.direction.y + ray.direction.z]
      ]) {
        const t = -offset! / slope!;
        if (slope! < 0) entry = Math.max(entry, t);
        else exit = Math.min(exit, t);
      }
      const actual = hull.intersectRay(ray);
      if (exit < 0 || entry > exit) {
        expect(actual).toBeUndefined();
        expect(hull.intersectsRay(ray)).toBe(false);
      } else {
        point(actual, ray.at(entry > 0 ? entry : exit), 1e-9);
        expect(hull.intersectsRay(ray)).toBe(true);
      }
    }
  });

  it("retains boundary, parallel, missed and very distant ray behavior", () => {
    const hull = ConvexHull.fromPoints(cube());
    point(hull.intersectRay(new Ray(v(-2, 0, 0), v(1, 0, 0))), v(-1, 0, 0));
    point(hull.intersectRay(new Ray(v(0, 0, 0), v(1, 0, 0))), v(1, 0, 0));
    point(hull.intersectRay(new Ray(v(1, 0, 0), v(-1, 0, 0))), v(-1, 0, 0));
    point(hull.intersectRay(new Ray(v(1, 0, 0), v(0, 1, 0))), v(1, 1, 0));
    const outward = hull.intersectRay(new Ray(v(1, 0, 0), v(1, 0, 0)))!;
    expect(outward.x).toBe(Infinity);
    expect(Number.isNaN(outward.y)).toBe(true);
    expect(Number.isNaN(outward.z)).toBe(true);
    expect(hull.intersectRay(new Ray(v(-2, 2, 0), v(1, 0, 0)))).toBeUndefined();
    expect(hull.intersectRay(new Ray(v(-2, 0, 0), v(-1, 0, 0)))).toBeUndefined();
    point(hull.intersectRay(new Ray(v(2 ** 49, 0, 0), v(-1, 0, 0))), v(1, 0, 0));
    hull.tolerance = 100;
    // Unlike the v5 query, the 4.x ray clips against the actual planes.
    point(hull.intersectRay(new Ray(v(-2, 0, 0), v(1, 0, 0))), v(-1, 0, 0));
  });
});
