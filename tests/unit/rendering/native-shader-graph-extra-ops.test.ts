import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ShaderGraphModel } from "../../../packages/editor-runtime/src/ShaderGraphModel.js";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph.js";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { tsl, type TslNode } from "../../../packages/engine/src/agent-api/nodes/tsl/index.js";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore.js";
import { compileShaderGraph, validateShaderGraph, type ShaderGraphDocument, type ShaderGraphOperation } from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";

type Migration = ReturnType<typeof shaderGraph.fromTsl>;

// Evaluate the serialized graph independently of the compiler's source emitter.
// The fixed expectations below are hand-calculated, including negative modulo.
function graphValue(migration: Migration, id: string): number[] {
  const node = migration.graph.nodes.find((entry) => entry.id === id)!;
  const args = (node.inputs ?? []).map((input) => graphValue(migration, input));
  if (node.op === "constant") return typeof node.value === "number" ? [node.value] : [...node.value as readonly number[]];
  if (node.op === "uniform") {
    const value = migration.uniforms[node.resource!];
    return typeof value === "number" ? [value] : [...value as readonly number[]];
  }
  if (node.op === "construct") return args.flat();
  if (node.op === "distance") return [Math.hypot(...args[0]!.map((value, index) => value - args[1]![index]!))];
  const width = node.type === "f32" ? 1 : Number(node.type.slice(-1));
  return Array.from({ length: width }, (_, index) => {
    const a = args[0]![index]!;
    const b = args[1]?.[index];
    const c = args[2]?.[index];
    switch (node.op) {
      case "tan": return Math.tan(a);
      case "sqrt": return Math.sqrt(a);
      case "exp": return Math.exp(a);
      case "log": return Math.log(a);
      case "fract": return a - Math.floor(a);
      case "floor": return Math.floor(a);
      case "ceil": return Math.ceil(a);
      case "sign": return Math.sign(a);
      case "saturate": return Math.max(0, Math.min(1, a));
      case "oneMinus": return 1 - a;
      case "negate": return -a;
      case "mod": return a - b! * Math.floor(a / b!);
      case "atan2": return Math.atan2(a, b!);
      case "step": return b! < a ? 0 : 1;
      case "smoothstep": {
        const t = Math.max(0, Math.min(1, (c! - a) / (b! - a)));
        return t * t * (3 - 2 * t);
      }
      default: throw new Error(`Unexpected fixture operation ${node.op}`);
    }
  });
}

function expectVector(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 11));
}

const numericCases: readonly { name: string; op: ShaderGraphOperation; make: () => TslNode; expected: readonly number[] }[] = [
  { name: "tan", op: "tan", make: () => tsl.tan(tsl.uniform([0, Math.PI / 4, -Math.PI / 4])), expected: [0, 1, -1] },
  { name: "sqrt", op: "sqrt", make: () => tsl.sqrt(tsl.uniform([0, 0.25, 4])), expected: [0, 0.5, 2] },
  { name: "exp", op: "exp", make: () => tsl.exp(tsl.uniform([0, 1, -1])), expected: [1, Math.E, 1 / Math.E] },
  { name: "log", op: "log", make: () => tsl.log(tsl.uniform([1, Math.E, Math.E ** 2])), expected: [0, 1, 2] },
  { name: "fract", op: "fract", make: () => tsl.fract(tsl.uniform([-1.75, 0.25, 1.75])), expected: [0.25, 0.25, 0.75] },
  { name: "floor", op: "floor", make: () => tsl.floor(tsl.uniform([-1.75, 0.25, 1.75])), expected: [-2, 0, 1] },
  { name: "ceil", op: "ceil", make: () => tsl.ceil(tsl.uniform([-1.75, 0.25, 1.75])), expected: [-1, 1, 2] },
  { name: "sign", op: "sign", make: () => tsl.sign(tsl.uniform([-2, 0, 5])), expected: [-1, 0, 1] },
  { name: "saturate", op: "saturate", make: () => tsl.saturate(tsl.uniform([-1, 0.5, 2])), expected: [0, 0.5, 1] },
  { name: "oneMinus", op: "oneMinus", make: () => tsl.oneMinus(tsl.uniform([0, 0.5, 2])), expected: [1, 0.5, -1] },
  { name: "negate", op: "negate", make: () => tsl.negate(tsl.uniform([-1, 0.5, 2])), expected: [1, -0.5, -2] },
  { name: "mod scalar divisor", op: "mod", make: () => tsl.mod(tsl.uniform([-5, 5, -5]), 3), expected: [1, 2, 1] },
  { name: "mod negative divisors and scalar dividend", op: "mod", make: () => tsl.mod(tsl.uniform(5), [-3, -3, 3]), expected: [-1, -1, 2] },
  { name: "atan2 quadrants", op: "atan2", make: () => tsl.atan2(tsl.uniform([1, -1, 1]), -1), expected: [3 * Math.PI / 4, -3 * Math.PI / 4, 3 * Math.PI / 4] },
  { name: "step boundary", op: "step", make: () => tsl.step(0.5, tsl.uniform([0, 0.5, 1])), expected: [0, 1, 1] },
  { name: "smoothstep scalar edges", op: "smoothstep", make: () => tsl.smoothstep(0, 1, tsl.uniform([-0.2, 0.25, 1.2])), expected: [0, 0.15625, 1] },
  { name: "smoothstep scalar position", op: "smoothstep", make: () => tsl.smoothstep([0, 0.25, 0.5], [1, 0.75, 1.5], tsl.uniform(0.5)), expected: [0.5, 0.5, 0] },
  { name: "distance vector and scalar", op: "distance", make: () => tsl.distance(tsl.uniform([4, 5, 13]), 1), expected: [13] },
  { name: "distance scalars", op: "distance", make: () => tsl.distance(tsl.uniform(-1), 3), expected: [4] }
];

describe("portable graph expression operations", () => {
  it.each(numericCases)("migrates $name with the legacy numerical result", ({ op, make, expected }) => {
    const expression = make();
    expectVector(tsl.evaluate(expression).value, expected);
    const migration = shaderGraph.fromTsl(expression.type === "float" ? { opacityNode: expression } : { colorNode: expression });
    const output = migration.graph.outputs?.[expression.type === "float" ? "opacity" : "color"];
    expect(output).toBeDefined();
    expect(migration.graph.nodes.some((node) => node.op === op)).toBe(true);
    expectVector(graphValue(migration, output!), expected);
    expect(shaderGraph.deserialize(shaderGraph.serialize(migration.graph))).toEqual(migration.graph);
    for (const target of ["glsl", "wgsl"] as const) {
      expect(validateShaderGraph(migration.graph, target)).toEqual([]);
      expect(compileShaderGraph(migration.graph, target).fragment).toBeTruthy();
    }
    const result = migration.graph.nodes.find((node) => node.id === output)!;
    const compute: ShaderGraphDocument = {
      ...migration.graph, stage: "compute", outputs: {},
      resources: [...(migration.graph.resources ?? []), { name: "result", kind: "storage-buffer", type: result.type, access: "read_write" }],
      nodes: [...migration.graph.nodes, { id: "computeIndex", op: "constant", type: "u32", value: 0 }],
      statements: [{ op: "store", resource: "result", index: "computeIndex", value: output! }]
    };
    const compiled = compileShaderGraph(compute, "wgsl");
    expect(compiled.compute).toContain(compiled.nodeSources[output!]!);
    expect(compiled.compute).toContain("auraGraph_resource_result[0u]");
  });

  it("preserves splatted legacy constructors and rejects unrepresentable integer conversions", () => {
    const scalar = tsl.uniform(0.3, { name: "gain" });
    const migration = shaderGraph.fromTsl({ colorNode: tsl.vec3(scalar) });
    const constructor = migration.graph.nodes.find((node) => node.op === "construct")!;
    expect(constructor.inputs).toEqual([constructor.inputs![0], constructor.inputs![0], constructor.inputs![0]]);
    expectVector(graphValue(migration, migration.graph.outputs!.color!), [0.3, 0.3, 0.3]);
    expect(migration.uniforms.gain).toBe(0.3);
    const integer = tsl.uniform(3, { type: "int" });
    expect(() => shaderGraph.fromTsl({ opacityNode: tsl.sqrt(integer) })).toThrow(/legacy-unsupported.*int to f32/);
    expect(() => shaderGraph.fromTsl({ colorNode: tsl.vec3(integer) })).toThrow(/legacy-unsupported.*int to float in a vector constructor/);
    expect(() => shaderGraph.fromTsl({ opacityNode: tsl.lessThanEqual(tsl.time, 1) })).toThrow(/legacy-unsupported.*lessThanEqual/);
  });

  it.each([2, 3, 4] as const)("expands a scalar dividend across a vec%i", (width) => {
    const divisor = tsl.uniform([2, 3, 4, 5].slice(0, width));
    const remainder = tsl.mod(-5, divisor);
    const color = width === 2 ? tsl.vec3(remainder, 0) : remainder;
    const migration = shaderGraph.fromTsl({ colorNode: color });
    const root = migration.graph.nodes.find((node) => node.op === "mod")!;
    const expanded = migration.graph.nodes.find((node) => node.id === root.inputs![0])!;
    expect(expanded.op).toBe("construct");
    expect(expanded.inputs).toHaveLength(width);
    expect(new Set(expanded.inputs).size).toBe(1);
    expectVector(graphValue(migration, root.id), [1, 1, 3, 0].slice(0, width));
    for (const target of ["glsl", "wgsl"] as const) expect(compileShaderGraph(migration.graph, target).nodeSources[root.id]).toContain("floor(");
  });

  it("enforces exact arities and operand types for every added operation", () => {
    const unary = ["tan", "sign", "sqrt", "exp", "log", "fract", "floor", "ceil", "saturate", "oneMinus", "negate"] as const;
    const binary = ["mod", "atan2", "step", "distance"] as const;
    const ops = [...unary.map((op) => [op, 1] as const), ...binary.map((op) => [op, 2] as const), ["smoothstep", 3] as const];
    for (const [op, arity] of ops) {
      const inputs = arity === 1 ? ["flag"] : arity === 2 ? ["scalar", "vector"] : ["vector", "scalar", "vector"];
      const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
        { id: "flag", op: "constant", type: "bool", value: true },
        { id: "scalar", op: "constant", type: "f32", value: 1 },
        { id: "vector", op: "constant", type: "vec3", value: [1, 2, 3] },
        { id: "bad", op, type: arity === 1 ? "bool" : op === "distance" ? "f32" : "vec3", inputs }
      ] };
      expect(validateShaderGraph(graph), op).toEqual(expect.arrayContaining([expect.objectContaining({ code: "type-mismatch", nodeId: "bad" })]));
      const wrongArity = { ...graph, nodes: [...graph.nodes.slice(0, -1), { ...graph.nodes.at(-1)!, inputs: [] }] };
      expect(validateShaderGraph(wrongArity), op).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-arity", nodeId: "bad" })]));
      if (op !== "negate") {
        const integers: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
          { id: "i", op: "constant", type: "i32", value: 1 },
          { id: "bad", op, type: op === "distance" ? "f32" : "i32", inputs: Array.from({ length: arity }, () => "i") }
        ] };
        expect(validateShaderGraph(integers), op).toEqual(expect.arrayContaining([expect.objectContaining({ code: "type-mismatch", nodeId: "bad" })]));
      }
    }
  });

  it("generates floor-based modulo, quadrant-aware atan2, and typed vector bounds", () => {
    const vec = tsl.uniform([-5, 5, -5], { name: "values" });
    const expressions = [tsl.mod(vec, -3), tsl.atan2(vec, -1), tsl.saturate(vec), tsl.oneMinus(vec)];
    const expected = [
      ["(auraGraph_resource_values - vec3(-3.0, -3.0, -3.0) * floor(auraGraph_resource_values / vec3(-3.0, -3.0, -3.0)))", "(aura.u_auraGraph_resource_values - vec3<f32>(-3.0, -3.0, -3.0) * floor(aura.u_auraGraph_resource_values / vec3<f32>(-3.0, -3.0, -3.0)))"],
      ["atan(auraGraph_resource_values, vec3(-1.0, -1.0, -1.0))", "atan2(aura.u_auraGraph_resource_values, vec3<f32>(-1.0, -1.0, -1.0))"],
      ["clamp(auraGraph_resource_values, vec3(0.0), vec3(1.0))", "clamp(aura.u_auraGraph_resource_values, vec3<f32>(0.0), vec3<f32>(1.0))"],
      ["(vec3(1.0) - auraGraph_resource_values)", "(vec3<f32>(1.0) - aura.u_auraGraph_resource_values)"]
    ];
    expressions.forEach((expression, index) => {
      const graph = shaderGraph.fromTsl({ colorNode: expression }).graph;
      const root = graph.outputs!.color!;
      expect(compileShaderGraph(graph, "glsl").nodeSources[root]).toBe(expected[index]![0]);
      expect(compileShaderGraph(graph, "wgsl").nodeSources[root]).toBe(expected[index]![1]);
    });
  });

  it("allows signed integer negation and rejects unsigned negation in compute graphs", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "compute", resources: [
      { name: "data", kind: "storage-buffer", type: "i32", access: "read_write" }
    ], nodes: [
      { id: "index", op: "constant", type: "u32", value: 0 },
      { id: "n", op: "constant", type: "i32", value: 3 },
      { id: "negative", op: "negate", type: "i32", inputs: ["n"] }
    ], statements: [{ op: "store", resource: "data", index: "index", value: "negative" }] };
    expect(compileShaderGraph(graph, "wgsl").compute).toContain("auraGraph_resource_data[0u] = (-3)");
    const unsigned = { ...graph, nodes: [...graph.nodes, { id: "bad", op: "negate", type: "u32", inputs: ["index"] } as const] };
    expect(validateShaderGraph(unsigned).some((entry) => entry.code === "type-mismatch" && entry.nodeId === "bad")).toBe(true);
    expect(() => compileShaderGraph(graph, "glsl")).toThrow(/unsupported-backend/);
  });
});

describe("graph editor integration", () => {
  it("exposes operation arities and constrains distance to equal operand types", () => {
    const arities: readonly [ShaderGraphOperation, number][] = [
      ...(["tan", "sign", "sqrt", "exp", "log", "fract", "floor", "ceil", "saturate", "oneMinus", "negate"] as const).map((op) => [op, 1] as [ShaderGraphOperation, number]),
      ...(["mod", "atan2", "step", "distance"] as const).map((op) => [op, 2] as [ShaderGraphOperation, number]), ["smoothstep", 3]
    ];
    const model = new ShaderGraphModel({ version: 1, stage: "material", nodes: [
      { id: "scalar", op: "constant", type: "f32", value: 1 },
      { id: "flag", op: "constant", type: "bool", value: true },
      { id: "vecA", op: "constant", type: "vec3", value: [4, 5, 13] },
      { id: "vecB", op: "constant", type: "vec3", value: [1, 1, 1] },
      { id: "invalidSqrt", op: "sqrt", type: "bool", inputs: [] },
      ...arities.map(([op]) => ({ id: `op_${op}`, op, type: "f32" as const, inputs: [] }))
    ], outputs: { roughness: "op_distance" } });
    for (const [op, arity] of arities) expect(model.inputPorts(`op_${op}`), op).toHaveLength(arity);
    expect(model.inputPorts("invalidSqrt")[0]?.acceptedTypes).toEqual([]);
    expect(model.canConnect("flag", "invalidSqrt", 0)).toBe(false);
    expect(model.canConnect("vecA", "op_distance", 0)).toBe(true);
    model.connect("vecA", "op_distance", 0);
    expect(model.canConnect("scalar", "op_distance", 1)).toBe(false);
    model.connect("vecB", "op_distance", 1);
    // Remove unused incomplete nodes so the entire document validates.
    for (const [op] of arities) if (op !== "distance") model.removeNode(`op_${op}`);
    model.removeNode("invalidSqrt");
    expect(model.validate()).toEqual([]);
    expect(model.compile("wgsl").fragment).toContain("distance(");
    expect(model.compile("glsl").fragment).toContain("distance(");
  });
});

describe("forward and shadow shader generation", () => {
  const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;

  it.runIf(hasGlslang)("links real forward and alpha-tested shadow GLSL, including skinning variants", () => {
    const tex = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 200]) });
    const sample = tsl.texture(tex, tsl.uv(), { name: "image" });
    const p = tsl.positionLocal;
    const positive = tsl.abs(p).add(1);
    const terms = [tsl.tan(p), tsl.sqrt(positive), tsl.exp(p), tsl.log(positive), tsl.fract(p), tsl.floor(p),
      tsl.ceil(p), tsl.sign(p), tsl.saturate(p), tsl.oneMinus(p), tsl.negate(p), tsl.mod(p, 3),
      tsl.atan2(p, 3), tsl.step(0, p), tsl.smoothstep(0, 1, p)];
    const total = terms.reduce((sum, term) => sum.add(term), p).add(tsl.vec3(tsl.distance(p, 1), 0, 0));
    const migration = shaderGraph.fromTsl({ colorNode: sample, opacityNode: tsl.smoothstep(0, 1, tsl.mod(sample.a, 0.9)),
      positionNode: total.mul(0.001), alphaTest: 0.4 });
    for (const target of ["glsl", "wgsl"] as const) {
      const compiled = compileShaderGraph(migration.graph, target);
      expect(compiled.vertex).toContain("atan");
      expect(compiled.fragment).toContain("floor(");
      expect(compiled.depth?.vertex).toContain("atan");
      expect(compiled.depth?.fragment).toContain("floor(");
      expect(compiled.depth?.fragment).toContain("< 0.4");
      expect(compiled.bindings.some((binding) => binding.name === "image")).toBe(true);
    }
    const runtime = createCustomShaderMaterial(shaderGraph.material({ graph: migration.graph, uniforms: migration.uniforms }).custom!);
    const dir = mkdtempSync(join(tmpdir(), "aura3d-extra-ops-"));
    try {
      for (const key of [runtime.shaderKey, runtime.customDepthShaderKey!, ...Object.values(runtime.graphSkinningDepthShaderKeys!)]) {
        const pair = globalShaderSource(key)!;
        const vertex = join(dir, "graph.vert"), fragment = join(dir, "graph.frag");
        writeFileSync(vertex, pair.vertex);
        writeFileSync(fragment, pair.fragment);
        execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); runtime.dispose(); }
  });
});
