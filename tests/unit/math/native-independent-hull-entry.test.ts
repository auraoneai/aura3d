// Consumer expectations are derived from the coordinates and types in this
// test; no legacy implementation or comparison fixture is used.
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as entry from "../../../packages/math/src/independent/hull-entry.js";
import { ConvexHull as CandidateHull } from "../../../packages/math/src/independent/ConvexHull.js";

const { ConvexHull, ConvexHullFace, HalfEdge, HullRay: Ray, HullVector3: Vector3, VertexList, VertexNode } = entry;
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe("staged opt-in independent hull source entry", () => {
  it("exposes the candidate and its vector and ray types for a tetrahedron", () => {
    expect(Object.keys(entry).sort()).toEqual(["ConvexHull", "ConvexHullFace", "HalfEdge", "HullRay", "HullVector3", "VertexList", "VertexNode"]);
    expect(ConvexHull).toBe(CandidateHull);
    const points = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)];
    const hull = ConvexHull.fromPoints(points);
    expect(hull.faces).toHaveLength(4);
    expect(hull.containsPoint(v(.2, .2, .2))).toBe(true);
    expect(hull.containsPoint(v(.6, .6, .2))).toBe(false);
    const hit = hull.intersectRay(new Ray(v(-1, .2, .2), v(1, 0, 0)));
    expect(hit).toBeInstanceOf(Vector3);
    expect(hit!.x).toBeCloseTo(0, 12);
    expect(hit!.y).toBeCloseTo(.2, 12);
    expect(hit!.z).toBeCloseTo(.2, 12);
    for (const face of hull.faces) {
      for (let i = 0; i < 3; i++) {
        const edge = face.getEdge(i);
        expect(edge.twin?.twin).toBe(edge);
        expect(edge.twin?.head()).toBe(edge.tail());
      }
    }
  });

  it("uses frozen hull-specific values and accepts structural coordinates and rays", () => {
    const origin = { x: -2, y: .2, z: .2 };
    const direction = { x: 2, y: 0, z: 0 };
    const ray = new Ray(origin, direction);
    origin.x = -20;
    direction.x = 10;
    expect(ray.origin.x).toBe(-2);
    expect(ray.direction.x).toBe(2);
    expect(Object.isFrozen(ray)).toBe(true);
    expect(Object.isFrozen(ray.origin)).toBe(true);
    expect(Object.isFrozen(ray.direction)).toBe(true);
    expect(Reflect.set(ray.origin, "x", 5)).toBe(false);
    expect(Reflect.set(ray, "direction", v(1, 0, 0))).toBe(false);
    expect(new Vector3(3, 4, 0).length()).toBe(5);
    expect(new Vector3(3e200, 4e200, 0).length() / 1e200).toBeCloseTo(5);
    expect(() => new Ray({ x: Infinity, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toThrow(RangeError);
    expect(() => new Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toThrow(RangeError);
    expect(() => new Ray({ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 })).toThrow(RangeError);

    const hull = ConvexHull.fromPoints([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]);
    expect(hull.containsPoint({ x: .1, y: .1, z: .1 })).toBe(true);
    const structuralRay = { origin: { x: -2, y: .2, z: .2 }, direction: { x: 4, y: 0, z: 0 } };
    expect(hull.intersectRay(structuralRay)?.x).toBeCloseTo(hull.intersectRay(ray)!.x, 12);
    expect(hull.intersectRay({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } })).toBeUndefined();
  });

  it("exposes null links and list ownership through the entry", () => {
    const node = new VertexNode(v(0, 0, 0)), face = new ConvexHullFace();
    const edge = new HalfEdge(node, face), first = new VertexList(), second = new VertexList();
    expect([node.prev, node.next, node.face, face.edge, face.outside, edge.prev, edge.next, edge.twin, first.head, first.tail]).toEqual(Array(10).fill(null));
    first.append(node);
    expect(() => second.append(node)).toThrow(RangeError);
    expect(first.first()).toBe(node);
    first.remove(node);
    expect(second.append(node).first()).toBe(node);
  });

  it("applies opt-in tolerance, input bounds, and snapshot rebuild rules", () => {
    const cube = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => v(x, y, z))));
    const hull = ConvexHull.fromPoints(cube);
    const outside = v(1.05, 0, 0);
    expect(hull.containsPoint(outside)).toBe(false);
    hull.tolerance = .1;
    expect(hull.containsPoint(outside)).toBe(true);
    const hit = hull.intersectRay(new Ray(v(2, 0, 0), v(-1, 0, 0)));
    expect(hit!.x).toBeCloseTo(1.1, 12);
    const faces = hull.faces;
    expect(() => hull.setFromPoints(Array.from({ length: 8_193 }, (_, i) => v(i, 0, 0)))).toThrow(RangeError);
    expect(() => hull.setFromPoints(Array(100_001).fill(cube[0]!))).toThrow(RangeError);
    expect(hull.faces).toBe(faces);
    expect(() => hull.intersectRay(new Ray(v(2 ** 49, 0, 0), v(-1, 0, 0)))).toThrow(RangeError);
    hull.faces.pop();
    expect(() => hull.containsPoint(v(0, 0, 0))).toThrow(/faces were modified/);
    hull.compute();
    expect(hull.containsPoint(v(0, 0, 0))).toBe(true);
  });

  it("typechecks a strict consumer and emits nullable hull declarations in memory", () => {
    const consumerPath = resolve("packages/math/src/independent/__hull_entry_consumer__.mts");
    const consumer = `
      import { ConvexHull, ConvexHullFace, HalfEdge, HullRay, HullVector3, VertexList, VertexNode, type HullPoint3, type HullRayLike } from "./hull-entry.js";
      type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      type Assert<T extends true> = T;
      export type NodePrevious = Assert<Equal<VertexNode["prev"], VertexNode | null>>;
      export type NodeNext = Assert<Equal<VertexNode["next"], VertexNode | null>>;
      export type NodeFace = Assert<Equal<VertexNode["face"], ConvexHullFace | null>>;
      export type EdgePrevious = Assert<Equal<HalfEdge["prev"], HalfEdge | null>>;
      export type EdgeNext = Assert<Equal<HalfEdge["next"], HalfEdge | null>>;
      export type EdgeTwin = Assert<Equal<HalfEdge["twin"], HalfEdge | null>>;
      export type FaceEdge = Assert<Equal<ConvexHullFace["edge"], HalfEdge | null>>;
      export type FaceOutside = Assert<Equal<ConvexHullFace["outside"], VertexNode | null>>;
      export type ListHead = Assert<Equal<VertexList["head"], VertexNode | null>>;
      export type ListTail = Assert<Equal<VertexList["tail"], VertexNode | null>>;
      export type TailResult = Assert<Equal<ReturnType<HalfEdge["tail"]>, VertexNode | null>>;
      export type HitResult = Assert<Equal<ReturnType<ConvexHull["intersectRay"]>, HullVector3 | undefined>>;
      export type StoredPoint = Assert<Equal<VertexNode["point"], HullPoint3>>;
      export type RayInput = Assert<Equal<Parameters<ConvexHull["intersectRay"]>[0], HullRayLike>>;
      const point: HullPoint3 = { x: 0, y: 0, z: 0 };
      export const hull = ConvexHull.fromPoints([point]);
      export const hit = hull.intersectRay(new HullRay({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 2 }));
      hull.intersectRay({ origin: point, direction: { x: 1, y: 0, z: 0 } });
      const node = new VertexNode(new HullVector3());
      // @ts-expect-error A nullable link cannot be used without narrowing.
      node.prev.point;
      // @ts-expect-error A nullable link cannot be assigned to a non-null vertex.
      const required: VertexNode = node.next;
      // @ts-expect-error A vertex's point reference is readonly.
      node.point = new HullVector3();
      // @ts-expect-error The hull vector coordinates are readonly.
      new HullVector3().x = 1;
      // @ts-expect-error A structural coordinate lacks the hull vector's length method.
      const output: HullVector3 = point;
      // @ts-expect-error The hull ray needs an origin and direction.
      new HullRay();
    `;
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2022.d.ts"],
      strict: true,
      skipLibCheck: true,
      declaration: true,
      emitDeclarationOnly: true,
      types: [],
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
    const declarations = new Map<string, string>();
    host.writeFile = (fileName, text) => { declarations.set(fileName.replaceAll("\\", "/"), text); };
    const program = ts.createProgram([consumerPath], options, host);
    const mathRoot = resolve("packages/math/src");
    const mathSources = program.getSourceFiles()
      .map((source) => relative(mathRoot, source.fileName).replaceAll("\\", "/"))
      .filter((path) => path && !path.startsWith("../"))
      .sort();
    expect(mathSources).toEqual([
      "independent/ConvexHull.ts",
      "independent/HullPrimitives.ts",
      "independent/__hull_entry_consumer__.mts",
      "independent/hull-entry.ts",
    ].sort());
    const emitted = program.emit();
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    });
    expect(message).toBe("");
    const hullDeclaration = [...declarations].find(([path]) => path.endsWith("/independent/ConvexHull.d.ts"))?.[1];
    const entryDeclaration = [...declarations].find(([path]) => path.endsWith("/independent/hull-entry.d.ts"))?.[1];
    expect(hullDeclaration).toBeDefined();
    expect(entryDeclaration).toBeDefined();
    expect(hullDeclaration).toMatch(/prev: VertexNode \| null;/);
    expect(hullDeclaration).toMatch(/twin: HalfEdge \| null;/);
    expect(hullDeclaration).toMatch(/edge: HalfEdge \| null;/);
    expect(hullDeclaration).toMatch(/outside: VertexNode \| null;/);
    expect(hullDeclaration).toMatch(/head: VertexNode \| null;/);
    expect(entryDeclaration).toContain('from "./ConvexHull.js"');
    expect(entryDeclaration).toContain('from "./HullPrimitives.js"');
  });
});
