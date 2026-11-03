import { describe, expect, it } from "vitest";
import {
  ShaderGraphError,
  type ShaderGraphDocument
} from "@aura3d/rendering/shader-graph";
import {
  deserializeShaderGraph,
  serializeShaderGraph
} from "../../../packages/engine/src/agent-api/nodes/shaderGraph.js";

function sparseArray<T>(length: number, entries: readonly (readonly [number, T])[] = []): T[] {
  const result = new Array<T>(length);
  for (const [index, value] of entries) result[index] = value;
  return result;
}

function expectSerializationFailure(graph: unknown, path: string, message: RegExp): void {
  let failure: unknown;
  try {
    serializeShaderGraph(graph as ShaderGraphDocument);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ShaderGraphError);
  if (!(failure instanceof ShaderGraphError)) throw new Error("expected a ShaderGraphError");
  expect(failure.diagnostics).toEqual([
    expect.objectContaining({ code: "invalid-serialization", path, message: expect.stringMatching(message) })
  ]);
}

describe("shader graph persistence", () => {
  it("serializes equivalent material graphs deterministically without mutating optional fields", () => {
    const graph: ShaderGraphDocument = {
      version: 1,
      stage: "material",
      nodes: [{ value: [0.5, 0.25, 1], inputs: undefined, type: "vec3", id: "color", op: "constant" }],
      outputs: { color: "color" }
    };
    const reordered: ShaderGraphDocument = {
      outputs: { color: "color" },
      nodes: [{ id: "color", op: "constant", type: "vec3", value: [0.5, 0.25, 1] }],
      stage: "material",
      version: 1
    };
    const expected = '{"nodes":[{"id":"color","op":"constant","type":"vec3","value":[0.5,0.25,1]}],"outputs":{"color":"color"},"stage":"material","version":1}';

    const serialized = serializeShaderGraph(graph);
    expect(serialized).toBe(expected);
    expect(serializeShaderGraph(reordered)).toBe(expected);
    expect(JSON.parse(serialized)).toEqual(reordered);
    expect(deserializeShaderGraph(serialized)).toEqual(reordered);
    expect(serializeShaderGraph(deserializeShaderGraph(serialized))).toBe(serialized);
    expect(Object.hasOwn(graph.nodes[0]!, "inputs")).toBe(true);
    expect(graph.nodes[0]!.inputs).toBeUndefined();
  });

  it("round-trips a dense compute graph with nested control flow", () => {
    const graph: ShaderGraphDocument = {
      version: 1,
      stage: "compute",
      workgroupSize: [2, 1, 1],
      nodes: [{ id: "shouldRun", op: "constant", type: "bool", value: true }],
      statements: [{
        op: "if", condition: "shouldRun",
        then: [{ op: "barrier", scope: "workgroup" }],
        otherwise: [{ op: "loop", index: "step", count: 2, body: [{ op: "barrier", scope: "storage" }] }]
      }]
    };
    const serialized = serializeShaderGraph(graph);
    expect(JSON.parse(serialized)).toEqual(graph);
    expect(deserializeShaderGraph(serialized)).toEqual(graph);
    expect(serializeShaderGraph(deserializeShaderGraph(serialized))).toBe(serialized);
  });

  const sparseCases: readonly { name: string; graph: unknown; path: string }[] = [
    {
      name: "a node list",
      graph: { version: 1, stage: "material", nodes: sparseArray(1) },
      path: "$.nodes[0]"
    },
    {
      name: "a resource list with a trailing hole",
      graph: { version: 1, stage: "material", nodes: [], resources: sparseArray(2, [[0, { name: "gain", kind: "uniform", type: "f32" }]]) },
      path: "$.resources[1]"
    },
    {
      name: "node inputs",
      graph: { version: 1, stage: "material", nodes: [{ id: "c", op: "constant", type: "f32", value: 1, inputs: sparseArray(2) }] },
      path: "$.nodes[0].inputs[0]"
    },
    {
      name: "a vector constant with a middle hole",
      graph: { version: 1, stage: "material", nodes: [{ id: "c", op: "constant", type: "vec3", value: sparseArray(3, [[0, 1], [2, 3]]) }] },
      path: "$.nodes[0].value[1]"
    },
    {
      name: "a workgroup size",
      graph: { version: 1, stage: "compute", nodes: [], workgroupSize: sparseArray(3, [[0, 1], [2, 1]]) },
      path: "$.workgroupSize[1]"
    },
    {
      name: "a one-hole statement list",
      graph: { version: 1, stage: "compute", nodes: [], statements: sparseArray(1) },
      path: "$.statements[0]"
    },
    {
      name: "a two-hole statement list",
      graph: { version: 1, stage: "compute", nodes: [], statements: sparseArray(2) },
      path: "$.statements[0]"
    },
    {
      name: "nested conditional statements",
      graph: {
        version: 1, stage: "compute", nodes: [{ id: "ok", op: "constant", type: "bool", value: true }],
        statements: [{ op: "if", condition: "ok", then: sparseArray(3, [[0, { op: "barrier" }], [2, { op: "barrier" }]]) }]
      },
      path: "$.statements[0].then[1]"
    },
    {
      name: "a nested loop body",
      graph: { version: 1, stage: "compute", nodes: [], statements: [{ op: "loop", index: "i", count: 1, body: sparseArray(1) }] },
      path: "$.statements[0].body[0]"
    },
    {
      name: "a loop body nested inside an otherwise branch",
      graph: {
        version: 1, stage: "compute", nodes: [{ id: "ok", op: "constant", type: "bool", value: true }],
        statements: [{
          op: "if", condition: "ok", then: [],
          otherwise: [{ op: "loop", index: "i", count: 1, body: sparseArray(2, [[0, { op: "barrier" }]]) }]
        }]
      },
      path: "$.statements[0].otherwise[0].body[1]"
    }
  ];

  it.each(sparseCases)("rejects $name at the missing index", ({ graph, path }) => {
    expectSerializationFailure(graph, path, /sparse arrays/);
  });

  it("rejects an inherited array element instead of treating it as an owned slot", () => {
    const statements = sparseArray(1);
    const prototype = Object.create(Array.prototype) as object;
    Object.defineProperty(prototype, "0", { value: { op: "barrier" }, configurable: true });
    Object.setPrototypeOf(statements, prototype);
    expect(0 in statements).toBe(true);
    expect(Object.hasOwn(statements, 0)).toBe(false);
    expectSerializationFailure({ version: 1, stage: "compute", nodes: [], statements }, "$.statements[0]", /sparse arrays/);
    expect(Object.hasOwn(statements, 0)).toBe(false);
  });

  it("continues rejecting explicit undefined array entries, non-finite numbers and cycles", () => {
    expectSerializationFailure(
      { version: 1, stage: "material", nodes: [{ id: "c", op: "constant", type: "vec3", value: [1, undefined, 3] }] },
      "$.nodes[0].value[1]", /undefined/
    );
    expectSerializationFailure(
      { version: 1, stage: "material", nodes: [{ id: "c", op: "constant", type: "vec3", value: [1, Infinity, 3] }] },
      "$.nodes[0].value[1]", /non-finite/
    );
    const cyclic = { version: 1, stage: "material", nodes: [] as unknown[] };
    cyclic.nodes.push(cyclic);
    expectSerializationFailure(cyclic, "$.nodes[0]", /cyclic/);
  });

  it("rejects malformed JSON instead of returning a graph", () => {
    expect(() => deserializeShaderGraph('{"version":1,"stage":"compute","nodes":[],"statements":[,]}')).toThrow(ShaderGraphError);
  });
});
