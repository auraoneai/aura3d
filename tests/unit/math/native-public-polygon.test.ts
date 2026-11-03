import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { Vector2, earcut, isClockWise, shapeArea, ShapeUtils, triangulateShape } from "@aura3d/math";

type Triangle = [number, number, number];

const publicContract: {
  earcut: (data: ArrayLike<number>, holeIndices: readonly number[] | null, dim?: number) => number[];
  shapeArea: (contour: readonly Vector2[]) => number;
  isClockWise: (pts: readonly Vector2[]) => boolean;
  triangulateShape: (contour: readonly Vector2[], holes: readonly (readonly Vector2[])[]) => Triangle[];
  ShapeUtils: {
    readonly area: (contour: readonly Vector2[]) => number;
    readonly isClockWise: (pts: readonly Vector2[]) => boolean;
    readonly triangulateShape: (contour: readonly Vector2[], holes: readonly (readonly Vector2[])[]) => Triangle[];
  };
} = { earcut, shapeArea, isClockWise, triangulateShape, ShapeUtils };

function ring(points: readonly (readonly [number, number])[]): Vector2[] {
  return points.map(([x, y]) => new Vector2(x, y));
}

const outer = () => ring([[0, 0], [12, 0], [12, 12], [0, 12]]);
const hole = () => ring([[3, 3], [3, 9], [9, 9], [9, 3]]);

function expectSquareWithHole(points: readonly Vector2[], triangles: readonly Triangle[]): void {
  expect(triangles).toHaveLength(8);
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const boundary = new Set<string>();
  for (const offset of [0, 4]) for (let i = 0; i < 4; i++) {
    boundary.add(key(offset + i, offset + (i + 1) % 4));
  }
  const edges = new Map<string, number>();
  let totalArea = 0;
  for (const triangle of triangles) {
    expect(new Set(triangle).size).toBe(3);
    for (const index of triangle) expect(Number.isInteger(index) && index >= 0 && index < 8).toBe(true);
    const [a, b, c] = triangle.map((index) => points[index]);
    const twiceArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    expect(twiceArea).toBeGreaterThan(0);
    totalArea += twiceArea / 2;
    const x = (a.x + b.x + c.x) / 3;
    const y = (a.y + b.y + c.y) / 3;
    expect(x > 0 && x < 12 && y > 0 && y < 12).toBe(true);
    expect(x > 3 && x < 9 && y > 3 && y < 9).toBe(false);
    for (let i = 0; i < 3; i++) {
      const edge = key(triangle[i], triangle[(i + 1) % 3]);
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  expect(totalArea).toBe(108);
  for (const edge of boundary) expect(edges.get(edge)).toBe(1);
  for (const [edge, count] of edges) expect(count).toBe(boundary.has(edge) ? 1 : 2);
}

describe("public math polygon utilities", () => {
  it("preserves the frozen function declarations and named ShapeUtils members", () => {
    const contract = JSON.parse(readFileSync(new URL("../../../docs/prds/aura3d-independent-math-api.json", import.meta.url), "utf8")) as {
      groups: { native: { name: string; functions: { name: string; signature: string }[] }[] };
    };
    const expected = contract.groups.native.find((unit) => unit.name === "ShapeUtils")!.functions;
    const path = new URL("../../../packages/math/src/ShapeUtils.ts", import.meta.url);
    const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declarations = source.statements.filter((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && !!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
    const actual = declarations.map((declaration) => ({
      name: declaration.name!.getText(source),
      signature: `(${declaration.parameters.map((parameter) =>
        `${parameter.name.getText(source)}${parameter.questionToken || parameter.initializer ? "?" : ""}: ${parameter.type!.getText(source)}`).join(", ")}): ${declaration.type!.getText(source)}`,
    }));
    expect(actual).toEqual(expected);
    expect(publicContract.ShapeUtils.area).toBe(publicContract.shapeArea);
    expect(publicContract.ShapeUtils.isClockWise).toBe(publicContract.isClockWise);
    expect(publicContract.ShapeUtils.triangulateShape).toBe(publicContract.triangulateShape);
    expect(Object.keys(ShapeUtils).sort()).toEqual(["area", "isClockWise", "triangulateShape"]);
  });

  it("reports signed area and winding through the public entry", () => {
    const contour = outer();
    expect(shapeArea(contour)).toBe(144);
    expect(ShapeUtils.area(contour.slice().reverse())).toBe(-144);
    expect(isClockWise(contour)).toBe(false);
    expect(ShapeUtils.isClockWise(contour.slice().reverse())).toBe(true);
  });

  it("triangulates holes in either winding with closure-normalized indices", () => {
    for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) {
      const contour = reverseOuter ? outer().reverse() : outer();
      const inner = reverseHole ? hole().reverse() : hole();
      const points = [...contour, ...inner];
      for (let mask = 0; mask < 4; mask++) {
        const closedContour = mask & 1 ? [...contour, contour[0]] : contour.slice();
        const closedHole = mask & 2 ? [...inner, inner[0]] : inner.slice();
        Object.freeze(closedContour);
        Object.freeze(closedHole);
        const holes = Object.freeze([closedHole]);
        expectSquareWithHole(points, ShapeUtils.triangulateShape(closedContour, holes));
      }
    }
  });

  it("retains original flat-data offsets, the default dimension, and extra dimensions", () => {
    expect(earcut([0, 0, 3, 0, 0, 4], null)).toHaveLength(3);
    const contour = outer();
    const inner = hole();
    const closedContour = [...contour, contour[0]];
    const closedHole = [...inner, inner[0]];
    const data = Float64Array.from([...closedContour, ...closedHole].flatMap(({ x, y }) => [x, y, 42]));
    const before = data.slice();
    const indices = earcut(data, [closedContour.length], 3);
    expect(data).toEqual(before);
    expect(indices).not.toContain(4);
    expect(indices).not.toContain(9);
    const normalized = indices.map((index) => index >= closedContour.length ? index - 1 : index);
    const triangles = Array.from({ length: normalized.length / 3 }, (_, i) => normalized.slice(i * 3, i * 3 + 3) as Triangle);
    expectSquareWithHole([...contour, ...inner], triangles);
  });

  it("accepts a large simple recessed contour through both public entry points", () => {
    const count = 5120;
    const contour = Array.from({ length: count }, (_, i) => {
      const angle = 2 * Math.PI * i / count;
      const radius = i === count / 2 ? 8 : 10;
      return new Vector2(radius * Math.cos(angle), radius * Math.sin(angle));
    });
    const indices = earcut(Float64Array.from(contour.flatMap(({ x, y }) => [x, y])), null);
    const faces = triangulateShape(contour, []);
    expect(indices).toHaveLength((count - 2) * 3);
    expect(faces).toHaveLength(count - 2);
    let ringArea = 0;
    for (let i = 0; i < count; i++) {
      const a = contour[i], b = contour[(i + 1) % count];
      ringArea += (a.x * b.y - b.x * a.y) / 2;
    }
    let triangleArea = 0;
    for (const [i, j, k] of faces) {
      const a = contour[i], b = contour[j], c = contour[k];
      const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
      expect(area).toBeGreaterThan(0);
      triangleArea += area;
    }
    expect(triangleArea).toBeCloseTo(ringArea, 7);
  });

  it("handles zero-area rings and reports unsupported touching geometry", () => {
    expect(triangulateShape([], [])).toEqual([]);
    expect(triangulateShape(ring([[0, 0], [1, 0], [2, 0]]), [])).toEqual([]);
    expect(triangulateShape(outer(), [ring([[2, 2], [3, 2], [4, 2]])])).toHaveLength(2);
    expect(earcut([], null)).toEqual([]);
    expect(() => triangulateShape(outer(), [ring([[0, 2], [2, 2], [2, 4], [0, 4]])])).toThrow(/touch|cross/i);
  });
});
