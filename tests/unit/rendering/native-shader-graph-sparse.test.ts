import { describe, expect, it } from "vitest";
import {
  ShaderGraphError,
  compileShaderGraph,
  validateShaderGraph,
  type ShaderGraphDiagnostic,
  type ShaderGraphDocument,
  type ShaderGraphNode,
  type ShaderGraphStatement,
  type ShaderGraphTarget
} from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";

type InvalidSlot = "hole" | "undefined";
type ExpectedDiagnostic = Pick<ShaderGraphDiagnostic, "code"> & Partial<Pick<ShaderGraphDiagnostic, "path" | "nodeId">>;

/** Preserve the difference between a missing array property and an own undefined value. */
function invalidateSlot<T>(values: readonly T[], index: number, kind: InvalidSlot): T[] {
  const result = values.slice();
  if (kind === "hole") delete result[index];
  else result[index] = undefined as unknown as T;
  return result;
}

/** Put a valid-looking slot on this array's private prototype, leaving no own slot. */
function inheritSlot<T>(values: readonly T[], index: number): T[] {
  const result = values.slice();
  const prototype = Object.create(Object.getPrototypeOf(result)) as object;
  Object.defineProperty(prototype, index, { value: result[index], configurable: true, writable: true });
  delete result[index];
  Object.setPrototypeOf(result, prototype);
  expect(Object.hasOwn(result, index)).toBe(false);
  expect(result[index]).toBe(values[index]);
  return result;
}

function materialGraph(): ShaderGraphDocument {
  return {
    version: 1,
    stage: "material",
    resources: [{ name: "gain", kind: "uniform", type: "f32" }],
    nodes: [
      { id: "color", op: "constant", type: "vec3", value: [0.2, 0.4, 0.6] },
      { id: "left", op: "constant", type: "f32", value: 0.25 },
      { id: "right", op: "uniform", type: "f32", resource: "gain" },
      { id: "sum", op: "add", type: "f32", inputs: ["left", "right"] }
    ],
    outputs: { color: "color", opacity: "sum" }
  };
}

const validIf: Extract<ShaderGraphStatement, { op: "if" }> = {
  op: "if",
  condition: "condition",
  then: [{ op: "store", resource: "data", index: "index", value: "payload" }],
  otherwise: [{ op: "barrier", scope: "workgroup" }]
};
const validLoop: Extract<ShaderGraphStatement, { op: "loop" }> = {
  op: "loop", index: "iteration", count: 2, body: [{ op: "barrier", scope: "storage" }]
};

function computeGraph(): ShaderGraphDocument {
  return {
    version: 1,
    stage: "compute",
    workgroupSize: [4, 1, 1],
    resources: [{ name: "data", kind: "storage-buffer", type: "uvec3", access: "read_write", binding: 0 }],
    nodes: [
      { id: "index", op: "constant", type: "u32", value: 0 },
      { id: "payload", op: "constant", type: "uvec3", value: [1, 2, 3] },
      { id: "condition", op: "constant", type: "bool", value: true }
    ],
    statements: [validIf, validLoop]
  };
}

/** Both public entry points must reject malformed graphs in the same structured way. */
function expectInvalid(graph: ShaderGraphDocument, target: ShaderGraphTarget, expected: ExpectedDiagnostic): void {
  let diagnostics: readonly ShaderGraphDiagnostic[] = [];
  expect(() => { diagnostics = validateShaderGraph(graph, target); }).not.toThrow();
  expect(diagnostics).toContainEqual(expect.objectContaining(expected));

  let thrown: unknown;
  try {
    compileShaderGraph(graph, target);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ShaderGraphError);
  if (thrown instanceof ShaderGraphError) {
    expect(thrown.diagnostics).toContainEqual(expect.objectContaining(expected));
  }
}

describe("shader graph dense controls", () => {
  it.each(["glsl", "wgsl"] as const)("validates and compiles a dense material graph for %s", (target) => {
    const graph = materialGraph();
    expect(validateShaderGraph(graph, target)).toEqual([]);
    const result = compileShaderGraph(graph, target);
    expect(result.stage).toBe("material");
    expect(result.target).toBe(target);
    expect(result.vertex).toBeTruthy();
    expect(result.fragment).toBeTruthy();
  });

  it("validates and compiles a dense compute graph with nested control flow", () => {
    const graph = computeGraph();
    expect(validateShaderGraph(graph, "wgsl")).toEqual([]);
    const result = compileShaderGraph(graph, "wgsl");
    expect(result.stage).toBe("compute");
    expect(result.compute).toContain("@compute");
  });
});

describe.each(["hole", "undefined"] as const)("shader graph arrays containing %s", (kind) => {
  it.each([0, 1, 3])("diagnoses a missing node at nodes[%i]", (index) => {
    const graph = materialGraph();
    expectInvalid({ ...graph, nodes: invalidateSlot(graph.nodes, index, kind) }, "glsl", {
      code: "invalid-node-id", path: `nodes[${index}]`
    });
  });

  it("diagnoses a missing resource at its array position", () => {
    const graph = materialGraph();
    expectInvalid({ ...graph, resources: invalidateSlot(graph.resources!, 0, kind) }, "wgsl", {
      code: "invalid-resource", path: "resources[0]"
    });
  });

  it.each([0, 1])("diagnoses a missing operand in a reachable node at inputs[%i]", (index) => {
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[3] = { ...nodes[3]!, inputs: invalidateSlot(nodes[3]!.inputs!, index, kind) };
    expectInvalid({ ...graph, nodes }, "glsl", {
      code: "invalid-inputs", nodeId: "sum", path: `nodes[3].inputs[${index}]`
    });
  });

  it.each([0, 1, 2])("diagnoses missing vec3 constant component %i", (index) => {
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[0] = { ...nodes[0]!, value: invalidateSlot([0.2, 0.4, 0.6], index, kind) };
    expectInvalid({ ...graph, nodes }, "wgsl", {
      code: "type-mismatch", nodeId: "color", path: `nodes[0].value[${index}]`
    });
  });

  it.each([0, 1, 2])("diagnoses missing uvec3 constant component %i", (index) => {
    const graph = computeGraph();
    const nodes = graph.nodes.slice();
    nodes[1] = { ...nodes[1]!, value: invalidateSlot([1, 2, 3], index, kind) };
    expectInvalid({ ...graph, nodes }, "wgsl", {
      code: "type-mismatch", nodeId: "payload", path: `nodes[1].value[${index}]`
    });
  });

  it.each([0, 1, 2])("diagnoses a missing workgroup size component %i", (index) => {
    const graph = computeGraph();
    const workgroupSize = invalidateSlot(graph.workgroupSize!, index, kind) as unknown as ShaderGraphDocument["workgroupSize"];
    expectInvalid({ ...graph, workgroupSize }, "wgsl", {
      code: "invalid-workgroup-size", path: `workgroupSize[${index}]`
    });
  });

  it("diagnoses a missing root statement", () => {
    const graph = computeGraph();
    expectInvalid({ ...graph, statements: invalidateSlot(graph.statements!, 0, kind) }, "wgsl", {
      code: "invalid-statement", path: "statements[0]"
    });
  });

  it("diagnoses a missing if.then statement", () => {
    const graph = computeGraph();
    const statements: ShaderGraphStatement[] = [{ ...validIf, then: invalidateSlot(validIf.then, 0, kind) }, validLoop];
    expectInvalid({ ...graph, statements }, "wgsl", {
      code: "invalid-statement", path: "statements[0].then[0]"
    });
  });

  it("diagnoses a missing if.otherwise statement", () => {
    const graph = computeGraph();
    const statements: ShaderGraphStatement[] = [{ ...validIf, otherwise: invalidateSlot(validIf.otherwise!, 0, kind) }, validLoop];
    expectInvalid({ ...graph, statements }, "wgsl", {
      code: "invalid-statement", path: "statements[0].otherwise[0]"
    });
  });

  it("diagnoses a missing loop.body statement", () => {
    const graph = computeGraph();
    const statements: ShaderGraphStatement[] = [validIf, { ...validLoop, body: invalidateSlot(validLoop.body, 0, kind) }];
    expectInvalid({ ...graph, statements }, "wgsl", {
      code: "invalid-statement", path: "statements[1].body[0]"
    });
  });
});

describe("shader graph arrays with inherited slots", () => {
  it("does not accept an inherited node input", () => {
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[3] = { ...nodes[3]!, inputs: inheritSlot(nodes[3]!.inputs!, 0) };
    expectInvalid({ ...graph, nodes }, "glsl", {
      code: "invalid-inputs", nodeId: "sum", path: "nodes[3].inputs[0]"
    });
  });

  it("does not accept an inherited vector constant component", () => {
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[0] = { ...nodes[0]!, value: inheritSlot([0.2, 0.4, 0.6], 1) };
    expectInvalid({ ...graph, nodes }, "wgsl", {
      code: "type-mismatch", nodeId: "color", path: "nodes[0].value[1]"
    });
  });

  it("does not accept an inherited workgroup size component", () => {
    const graph = computeGraph();
    const workgroupSize = inheritSlot(graph.workgroupSize!, 1) as unknown as ShaderGraphDocument["workgroupSize"];
    expectInvalid({ ...graph, workgroupSize }, "wgsl", {
      code: "invalid-workgroup-size", path: "workgroupSize[1]"
    });
  });

  it("does not accept an inherited nested statement", () => {
    const graph = computeGraph();
    const statements: ShaderGraphStatement[] = [{ ...validIf, then: inheritSlot(validIf.then, 0) }, validLoop];
    expectInvalid({ ...graph, statements }, "wgsl", {
      code: "invalid-statement", path: "statements[0].then[0]"
    });
  });
});

describe("malformed reachable shader graph nodes", () => {
  it.each([null, { first: "left", second: "right" }])("reports non-array inputs without throwing: %s", (badInputs) => {
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[3] = { ...nodes[3]!, inputs: badInputs as unknown as ShaderGraphNode["inputs"] };
    expectInvalid({ ...graph, nodes }, "wgsl", {
      code: "invalid-inputs", nodeId: "sum", path: "nodes[3].inputs"
    });
  });

  it.each([null, undefined, false, 5, Symbol("bad-operation"), {}])("rejects a non-string operation", (badOperation) => {
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[3] = { ...nodes[3]!, op: badOperation as unknown as ShaderGraphNode["op"] };
    expectInvalid({ ...graph, nodes }, "wgsl", { code: "unsupported-operation", nodeId: "sum" });
  });

  it("never coerces an operation object while reporting it", () => {
    let conversions = 0;
    const rejectConversion = (): never => { conversions += 1; throw new Error("operation was coerced"); };
    const operation = { [Symbol.toPrimitive]: rejectConversion, toString: rejectConversion, valueOf: rejectConversion };
    const graph = materialGraph();
    const nodes = graph.nodes.slice();
    nodes[3] = { ...nodes[3]!, op: operation as unknown as ShaderGraphNode["op"] };
    expectInvalid({ ...graph, nodes }, "wgsl", { code: "unsupported-operation", nodeId: "sum" });
    expect(conversions).toBe(0);
  });
});
