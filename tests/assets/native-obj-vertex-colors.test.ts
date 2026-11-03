import { describe, expect, it } from "vitest";
import { exportOBJ } from "../../packages/assets/src/exporters/OBJExporter";
import type { AuraExportPrimitive, AuraExportScene } from "../../packages/assets/src/exporters/ExportContext";

const triangle: AuraExportPrimitive = {
  attributes: { POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] } },
  indices: [0, 1, 2]
};

const coloredTriangle: AuraExportPrimitive = {
  attributes: {
    POSITION: { itemSize: 3, values: [2, 0, 0, 3, 0, 0, 2, 1, 0] },
    COLOR_0: { itemSize: 4, normalized: true, values: new Uint8Array([255, 0, 128, 64, 0, 255, 0, 255, 0, 0, 255, 0]) }
  },
  indices: [2, 1, 0]
};

function scene(primitives: readonly AuraExportPrimitive[]): AuraExportScene {
  return { nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives }] };
}

function textOf(data: Blob | Uint8Array): string {
  if (!(data instanceof Uint8Array)) throw new Error("Expected OBJ bytes");
  return new TextDecoder().decode(data);
}

function vertices(text: string): number[][] {
  return text.split("\n").filter((line) => line.startsWith("v ")).map((line) => line.slice(2).split(" ").map(Number));
}

describe("OBJ vertex-color export", () => {
  it("retains normalized RGB on indexed vertices and fills missing colors throughout a mixed scene", () => {
    const output = exportOBJ(scene([triangle, coloredTriangle, triangle]));
    const text = textOf(output.data);
    const rows = vertices(text);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual([0, 0, 0, 1, 1, 1]);
    expect(rows[3]).toEqual([2, 0, 0, 1, 0, 128 / 255]);
    expect(rows[4]).toEqual([3, 0, 0, 0, 1, 0]);
    expect(rows[5]).toEqual([2, 1, 0, 0, 0, 1]);
    expect(rows[8]).toEqual([0, 1, 0, 1, 1, 1]);
    expect(text).toMatch(/^f 6 5 4$/m);
    expect(output.warnings).toContainEqual(expect.objectContaining({ code: "VERTEX_ALPHA_LOST", path: "meshes[0].primitives[1].attributes.COLOR_0" }));
    expect(output.warnings).toContainEqual(expect.objectContaining({ code: "VERTEX_COLOR_EXTENSION" }));
    expect(output.warnings.filter((warning) => warning.code === "VERTEX_COLOR_DEFAULTED").map((warning) => warning.path)).toEqual([
      "meshes[0].primitives[0].attributes.COLOR_0",
      "meshes[0].primitives[2].attributes.COLOR_0"
    ]);
    expect(output.warnings.some((warning) => warning.code === "ATTRIBUTE_LOST" && warning.path?.endsWith("COLOR_0"))).toBe(false);
  });

  it("leaves uncolored scenes on the standard vertex layout without color warnings", () => {
    const output = exportOBJ(scene([triangle]));
    expect(vertices(textOf(output.data))).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    expect(output.warnings.some((warning) => warning.code.startsWith("VERTEX_COLOR_"))).toBe(false);
  });

  it("preserves out-of-range RGB, reports the reader limitation and retains point index order", () => {
    const output = exportOBJ(scene([{
      mode: "points",
      attributes: {
        POSITION: { itemSize: 3, values: [0, 0, 0, 1, 2, 3] },
        COLOR_0: { itemSize: 3, values: [2, -0.5, 0.25, 0, 0.5, 1] }
      },
      indices: [1, 0]
    }]));
    const text = textOf(output.data);
    expect(vertices(text)).toEqual([[0, 0, 0, 2, -0.5, 0.25], [1, 2, 3, 0, 0.5, 1]]);
    expect(text).toMatch(/^p 2\np 1$/m);
    expect(output.warnings.filter((warning) => warning.code === "VERTEX_COLOR_RANGE")).toHaveLength(1);
    expect(output.warnings.some((warning) => warning.code === "VERTEX_ALPHA_LOST")).toBe(false);
  });

  it("counts white defaults against the byte limit even when the colored primitive is later", () => {
    const input = scene([triangle, coloredTriangle]);
    const baseline = exportOBJ(input);
    const baselineBytes = baseline.data;
    if (!(baselineBytes instanceof Uint8Array)) throw new Error("Expected OBJ bytes");
    expect(exportOBJ(input, { maxOutputBytes: baselineBytes.length }).data).toEqual(baselineBytes);
    expect(() => exportOBJ(input, { maxOutputBytes: baselineBytes.length - 1 })).toThrow(/maxOutputBytes/);
  });

  it("rejects malformed color layouts instead of writing incomplete RGB values", () => {
    const invalidSize: AuraExportPrimitive = { ...triangle, attributes: { ...triangle.attributes, COLOR_0: { itemSize: 2, values: [1, 0, 1, 0, 1, 0] } } };
    const invalidCount: AuraExportPrimitive = { ...triangle, attributes: { ...triangle.attributes, COLOR_0: { itemSize: 3, values: [1, 0, 0] } } };
    expect(() => exportOBJ(scene([invalidSize]))).toThrow(/RGB or RGBA/);
    expect(() => exportOBJ(scene([invalidCount]))).toThrow(/count differs from POSITION/);
  });
});
