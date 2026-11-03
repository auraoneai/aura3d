import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  compileShaderGraph,
  validateShaderGraph,
  type ShaderGraphDocument
} from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph.js";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore.js";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice.js";
import { deriveUniformDataLayout, writeUniformData } from "../../../packages/rendering/src/program/UniformLayout.js";

function graph(): ShaderGraphDocument {
  return {
    version: 1,
    stage: "material",
    alphaTest: 0.4,
    structs: [
      { name: "Surface", fields: [{ name: "position", type: "vec3" }, { name: "paint", type: "struct:Paint" }] },
      { name: "Paint", fields: [{ name: "color", type: "vec3" }, { name: "opacity", type: "f32" }] }
    ],
    functions: [
      {
        name: "coverage",
        parameters: [{ name: "coord", type: "vec2" }],
        returnType: "f32",
        nodes: [
          { id: "coord", op: "parameter", name: "coord", type: "vec2" },
          { id: "value", op: "call", name: "noiseAt", type: "f32", inputs: ["coord"] }
        ],
        output: "value"
      },
      {
        name: "noiseAt",
        parameters: [{ name: "coord", type: "vec2" }],
        returnType: "f32",
        nodes: [
          { id: "coord", op: "parameter", name: "coord", type: "vec2" },
          { id: "value", op: "noise", type: "f32", inputs: ["coord"] }
        ],
        output: "value"
      },
      {
        name: "paint",
        parameters: [{ name: "color", type: "vec3" }, { name: "opacity", type: "f32" }],
        returnType: "struct:Paint",
        nodes: [
          { id: "color", op: "parameter", name: "color", type: "vec3" },
          { id: "opacity", op: "parameter", name: "opacity", type: "f32" },
          { id: "packed", op: "structConstruct", type: "struct:Paint", inputs: ["color", "opacity"] }
        ],
        output: "packed"
      }
    ],
    nodes: [
      { id: "position", op: "input", name: "positionLocal", type: "vec3" },
      { id: "uv", op: "input", name: "uv0", type: "vec2" },
      { id: "color", op: "constant", type: "vec3", value: [0.25, 0.5, 0.75] },
      { id: "coverage", op: "call", name: "coverage", type: "f32", inputs: ["uv"] },
      { id: "paint", op: "call", name: "paint", type: "struct:Paint", inputs: ["color", "coverage"] },
      { id: "surface", op: "structConstruct", type: "struct:Surface", inputs: ["position", "paint"] },
      { id: "surfacePosition", op: "structField", name: "position", type: "vec3", inputs: ["surface"] },
      { id: "surfacePaint", op: "structField", name: "paint", type: "struct:Paint", inputs: ["surface"] },
      { id: "surfaceColor", op: "structField", name: "color", type: "vec3", inputs: ["surfacePaint"] },
      { id: "surfaceOpacity", op: "structField", name: "opacity", type: "f32", inputs: ["surfacePaint"] }
    ],
    outputs: { position: "surfacePosition", color: "surfaceColor", opacity: "surfaceOpacity" }
  };
}

function diagnostics(value: unknown, target: "glsl" | "wgsl" = "wgsl") {
  return validateShaderGraph(value as ShaderGraphDocument, target);
}

function evaluateEmittedNoise(source: string, point: readonly number[]): number {
  expect(source).toContain("cell - floor(cell / 256.0) * 256.0");
  expect(source).toContain("t * t *");
  const coefficients = source.match(/bits\.x \* (\d+)u \^ bits\.y \* (\d+)u \^ bits\.z \* (\d+)u \^ bits\.w \* (\d+)u \^ (\d+)u/);
  const first = source.match(/h = \(h \^ \(h >> (\d+)u\)\) \* (\d+)u;/);
  const second = source.match(/h = \(h \^ \(h >> (\d+)u\)\) \* (\d+)u;/g);
  const last = source.match(/h = h \^ \(h >> (\d+)u\);/);
  const divisor = source.match(/(?:float|f32)\(h & (\d+)u\) \/ ([\d.]+);/);
  expect(coefficients).not.toBeNull();
  expect(first).not.toBeNull();
  expect(second).toHaveLength(2);
  expect(last).not.toBeNull();
  expect(divisor).not.toBeNull();
  const next = second![1]!.match(/>> (\d+)u\)\) \* (\d+)u/)!;
  const p = [...point, ...Array.from({ length: 4 - point.length }, () => 0)];
  const cell = p.map(Math.floor);
  const fade = p.map((value, index) => {
    const t = value - cell[index]!;
    return t * t * (3 - 2 * t);
  });
  const hash = (offset: readonly number[]): number => {
    const bits = cell.map((value, index) => {
      const coordinate = value + offset[index]!;
      return coordinate - Math.floor(coordinate / 256) * 256;
    });
    let value = Number(coefficients![5]) >>> 0;
    for (let i = 0; i < 4; i++) value = (value ^ Math.imul(bits[i]!, Number(coefficients![i + 1]))) >>> 0;
    value = Math.imul(value ^ value >>> Number(first![1]), Number(first![2])) >>> 0;
    value = Math.imul(value ^ value >>> Number(next[1]), Number(next[2])) >>> 0;
    value = (value ^ value >>> Number(last![1])) >>> 0;
    return (value & Number(divisor![1])) / Number(divisor![2]);
  };
  const values = new Map<string, number>();
  const rows = source.matchAll(/(?:let|float) (x[01]{3}) = mix\(auraGraph_noiseHash\(cell \+ vec4(?:<f32>)?\(([^)]*)\)\), auraGraph_noiseHash\(cell \+ vec4(?:<f32>)?\(([^)]*)\)\), fade\.x\);/g);
  for (const row of rows) {
    const a = hash(row[2]!.split(",").map(Number));
    const b = hash(row[3]!.split(",").map(Number));
    values.set(row[1]!, a * (1 - fade[0]!) + b * fade[0]!);
  }
  expect(values.size).toBe(8);
  for (const row of source.matchAll(/(?:let|float) ([yz][01]{1,2}) = mix\((\w+), (\w+), fade\.([yz])\);/g)) {
    const a = values.get(row[2]!);
    const b = values.get(row[3]!);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const weight = fade[row[4] === "y" ? 1 : 2]!;
    values.set(row[1]!, a! * (1 - weight) + b! * weight);
  }
  expect(source).toContain("return mix(z0, z1, fade.w);");
  return values.get("z0")! * (1 - fade[3]!) + values.get("z1")! * fade[3]!;
}

describe("portable graph structs, noise, and functions", () => {
  it("compiles nested array/struct uniform paths with the actual WGSL uniform layout", () => {
    const value = {
      version: 1, stage: "compute",
      // Deliberately declare the parent before the element type.
      structs: [
        { name: "Settings", fields: [{ name: "layers", type: "array:2:struct:Layer" }, { name: "weights", type: "array:2:f32" }, { name: "tail", type: "u32" }] },
        { name: "Layer", fields: [{ name: "weight", type: "f32" }, { name: "enabled", type: "bool" }, { name: "color", type: "vec3" }] }
      ],
      resources: [
        { name: "settings", kind: "uniform", type: "struct:Settings" },
        { name: "result", kind: "storage-buffer", type: "f32", access: "read_write" }
      ],
      nodes: [
        { id: "settings", op: "uniform", resource: "settings", type: "struct:Settings" },
        { id: "layers", op: "structField", name: "layers", type: "array:2:struct:Layer", inputs: ["settings"] },
        { id: "one", op: "constant", type: "u32", value: 1 },
        { id: "layer", op: "arrayIndex", type: "struct:Layer", inputs: ["layers", "one"] },
        { id: "enabled", op: "structField", name: "enabled", type: "bool", inputs: ["layer"] },
        { id: "weight", op: "structField", name: "weight", type: "f32", inputs: ["layer"] },
        { id: "weights", op: "structField", name: "weights", type: "array:2:f32", inputs: ["settings"] },
        { id: "scalar", op: "arrayIndex", type: "f32", inputs: ["weights", "one"] },
        { id: "sum", op: "add", type: "f32", inputs: ["weight", "scalar"] },
        { id: "zero", op: "constant", type: "f32", value: 0 },
        { id: "selected", op: "select", type: "f32", inputs: ["enabled", "sum", "zero"] }
      ],
      statements: [{ op: "store", resource: "result", index: "one", value: "selected" }]
    } as unknown as ShaderGraphDocument;
    expect(validateShaderGraph(value, "wgsl")).toEqual([]);
    const compiled = compileShaderGraph(value, "wgsl");
    const schema = compiled.bindings.find((binding) => binding.name === "settings")?.dataType;
    expect(schema).toEqual({ kind: "struct", fields: [
      { name: "layers", type: { kind: "array", length: 2, element: { kind: "struct", fields: [
        { name: "weight", type: "f32" }, { name: "enabled", type: "bool" },
        { name: "color", type: { kind: "vector", element: "f32", length: 3 } }
      ] } } },
      { name: "weights", type: { kind: "array", length: 2, element: "f32" } },
      { name: "tail", type: "u32" }
    ] });
    expect(compiled.compute).toMatch(/@size\(16\)\s+value:\s*f32/);
    expect(compiled.compute).toContain(".layers[1u].enabled != 0u");
    expect(compiled.compute).toContain(".weights[1u].value");
    expect(compiled.compute).toContain("auraGraph_resource_result[1u] =");
    const layout = { name: "GraphDataTest", group: 0, binding: 0, members: [{ name: "value", type: schema! }] };
    const logicalValue = { value: {
      layers: [
        { weight: 1.25, enabled: true, color: [1, 2, 3] },
        { weight: 2.5, enabled: false, color: [4, 5, 6] }
      ],
      weights: [3.5, 4.75], tail: 0xfedcba98
    } };
    for (const target of ["glsl-std140", "wgsl-uniform"] as const) {
      const selected = deriveUniformDataLayout(layout, target);
      expect(selected.size).toBe(112);
      const bytes = writeUniformData(layout, target, logicalValue);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect([0, 32, 64, 80].map((offset) => view.getFloat32(offset, true))).toEqual([1.25, 2.5, 3.5, 4.75]);
      expect([4, 36, 96].map((offset) => view.getUint32(offset, true))).toEqual([1, 0, 0xfedcba98]);
      expect([16, 20, 24, 48, 52, 56].map((offset) => view.getFloat32(offset, true))).toEqual([1, 2, 3, 4, 5, 6]);
    }
    expect(() => compileShaderGraph(value, "glsl")).toThrow(/unsupported-backend/);
  });

  it("rejects malformed aggregate types, indices, and unsafe whole-uniform escapes", () => {
    const base = {
      version: 1, stage: "material",
      structs: [{ name: "Data", fields: [{ name: "weights", type: "array:2:f32" }] }],
      resources: [{ name: "data", kind: "uniform", type: "struct:Data" }],
      nodes: [
        { id: "data", op: "uniform", resource: "data", type: "struct:Data" },
        { id: "weights", op: "structField", name: "weights", type: "array:2:f32", inputs: ["data"] },
        { id: "index", op: "constant", type: "u32", value: 1 },
        { id: "weight", op: "arrayIndex", type: "f32", inputs: ["weights", "index"] }
      ],
      outputs: { opacity: "weight" }
    } as unknown as ShaderGraphDocument;
    expect(validateShaderGraph(base, "wgsl")).toEqual([]);
    const mutate = (fn: (copy: any) => void) => {
      const copy = structuredClone(base) as any;
      fn(copy);
      return validateShaderGraph(copy, "wgsl");
    };
    expect(mutate((g) => { g.structs[0].fields[0].type = "array:0:f32"; }).map((d) => d.code)).toContain("invalid-type");
    expect(mutate((g) => { g.nodes[2] = { id: "index", op: "constant", type: "f32", value: 1 }; }).map((d) => d.code)).toContain("type-mismatch");
    expect(mutate((g) => { g.nodes[2].value = 2; }).map((d) => d.code)).toContain("index-out-of-bounds");
    expect(mutate((g) => { g.nodes[3].type = "vec2"; }).map((d) => d.code)).toContain("type-mismatch");
    expect(mutate((g) => {
      g.functions = [{ name: "consume", parameters: [{ name: "v", type: "struct:Data" }], returnType: "f32", nodes: [
        { id: "zero", op: "constant", type: "f32", value: 0 }
      ], output: "zero" }];
      g.nodes.push({ id: "call", op: "call", name: "consume", type: "f32", inputs: ["data"] });
      g.outputs.opacity = "call";
    }).map((d) => d.code)).toContain("unsupported-uniform-access");
    expect(mutate((g) => { g.structs[0].fields[0].name = "alias"; }).map((d) => d.code)).toContain("invalid-resource");
    expect(mutate((g) => { g.structs[0].fields[0].type = "array:2:struct:Data"; }).map((d) => d.code)).toContain("struct-cycle");
  });

  it("rejects storing a physical uniform struct into a nominal storage struct", () => {
    const value: ShaderGraphDocument = {
      version: 1, stage: "compute",
      structs: [{ name: "Record", fields: [{ name: "amount", type: "f32" }] }],
      resources: [
        { name: "source", kind: "uniform", type: "struct:Record" },
        { name: "destination", kind: "storage-buffer", type: "struct:Record", access: "read_write" }
      ],
      nodes: [
        { id: "source", op: "uniform", type: "struct:Record", resource: "source" },
        { id: "index", op: "constant", type: "u32", value: 0 }
      ],
      statements: [{ op: "store", resource: "destination", index: "index", value: "source" }]
    };
    expect(validateShaderGraph(value, "wgsl")).toContainEqual(expect.objectContaining({
      code: "unsupported-uniform-access", nodeId: "source", path: "statements[0].value"
    }));
    expect(() => compileShaderGraph(value, "wgsl")).toThrow(/unsupported-uniform-access/);
  });

  it("bounds expanded uniform schemas before duplicating shared struct definitions", () => {
    const structs: NonNullable<ShaderGraphDocument["structs"]>[number][] = [
      { name: "Level0", fields: [{ name: "value", type: "f32" }] }
    ];
    for (let index = 1; index <= 13; index++) {
      structs.push({
        name: `Level${index}`,
        fields: [
          { name: "left", type: `struct:Level${index - 1}` },
          { name: "right", type: `struct:Level${index - 1}` }
        ]
      });
    }
    const value: ShaderGraphDocument = {
      version: 1, stage: "material", structs,
      resources: [{ name: "data", kind: "uniform", type: "struct:Level13" }],
      nodes: [], outputs: {}
    };
    expect(validateShaderGraph(value, "wgsl")).toContainEqual(expect.objectContaining({
      code: "graph-limit", message: expect.stringMatching(/uniform.*schema/i)
    }));
    expect(() => compileShaderGraph(value, "wgsl")).toThrow(/graph-limit/);
  });

  it("bounds the combined array and struct nesting of uniform schemas", () => {
    const structs: NonNullable<ShaderGraphDocument["structs"]>[number][] = [
      { name: "Level0", fields: [{ name: "value", type: "f32" }] }
    ];
    for (let index = 1; index <= 10; index++) {
      structs.push({
        name: `Level${index}`,
        fields: [{ name: "value", type: `${"array:1:".repeat(16)}struct:Level${index - 1}` as ShaderGraphDocument["nodes"][number]["type"] }]
      });
    }
    const value: ShaderGraphDocument = {
      version: 1, stage: "compute", structs,
      resources: [{ name: "data", kind: "uniform", type: "struct:Level10" }],
      nodes: [], statements: []
    };
    expect(validateShaderGraph(value, "wgsl")).toContainEqual(expect.objectContaining({
      code: "graph-limit", message: expect.stringMatching(/uniform.*schema/i)
    }));
    expect(() => compileShaderGraph(value, "wgsl")).toThrow(/graph-limit/);
  });

  it("supports nested WGSL uniform arrays but rejects the ESSL 3.00 array-of-arrays boundary", () => {
    const graph = {
      version: 1, stage: "material",
      resources: [{ name: "flags", kind: "uniform", type: "array:2:array:2:bool" }],
      nodes: [
        { id: "flags", op: "uniform", resource: "flags", type: "array:2:array:2:bool" },
        { id: "index", op: "constant", type: "u32", value: 1 },
        { id: "row", op: "arrayIndex", type: "array:2:bool", inputs: ["flags", "index"] },
        { id: "flag", op: "arrayIndex", type: "bool", inputs: ["row", "index"] },
        { id: "yes", op: "constant", type: "f32", value: 1 },
        { id: "no", op: "constant", type: "f32", value: 0 },
        { id: "opacity", op: "select", type: "f32", inputs: ["flag", "yes", "no"] }
      ], outputs: { opacity: "opacity" }
    } as unknown as ShaderGraphDocument;
    const wgsl = compileShaderGraph(graph, "wgsl");
    expect(wgsl.nodeSources.flag).toContain("aura.u_auraGraph_resource_flags[1u][1u] != 0u");
    expect(wgsl.bindings[0]!.dataType).toEqual({ kind: "array", length: 2, element: { kind: "array", length: 2, element: "bool" } });
    expect(() => compileShaderGraph(graph, "glsl")).toThrow(/unsupported-backend.*nested array/);
    // A paired graph material also needs a valid GLSL reflection stage.
    expect(() => shaderGraph.material({ graph, backend: "wgsl", uniforms: { flags: [[true, false], [false, true]] } })).toThrow(/unsupported-backend.*nested array/);
  });

  it("uses padded nested boolean arrays and dynamic indices in WGSL compute", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "compute",
      resources: [
        { name: "flags", kind: "uniform", type: "array:2:array:2:bool" },
        { name: "result", kind: "storage-buffer", type: "u32", access: "read_write" }
      ],
      nodes: [
        { id: "flags", op: "uniform", type: "array:2:array:2:bool", resource: "flags" },
        { id: "invocation", op: "input", type: "uvec3", name: "globalInvocationId" },
        { id: "index", op: "swizzle", type: "u32", components: "x", inputs: ["invocation"] },
        { id: "row", op: "arrayIndex", type: "array:2:bool", inputs: ["flags", "index"] },
        { id: "flag", op: "arrayIndex", type: "bool", inputs: ["row", "index"] },
        { id: "one", op: "constant", type: "u32", value: 1 },
        { id: "zero", op: "constant", type: "u32", value: 0 },
        { id: "selected", op: "select", type: "u32", inputs: ["flag", "one", "zero"] }
      ],
      statements: [{ op: "store", resource: "result", index: "index", value: "selected" }]
    };
    const result = compileShaderGraph(graph, "wgsl");
    expect(result.compute).toContain("@size(16) value: u32");
    expect(result.nodeSources.flag).toContain(".value != 0u");
    expect(result.nodeSources.flag).toContain("(auraGraph_globalInvocationId).x");
    const layout = { name: "Flags", group: 0, binding: 0, members: [{ name: "flags", type: result.bindings[0]!.dataType! }] };
    const bytes = writeUniformData(layout, "wgsl-uniform", { flags: [[true, false], [false, true]] });
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([0, 16, 32, 48].map((offset) => data.getUint32(offset, true))).toEqual([1, 0, 0, 1]);
  });

  it.runIf(spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0)(
    "validates nested graph struct/array GLSL stages with an actual ESSL compiler", () => {
      const graph = {
        version: 1, stage: "material",
        structs: [
          { name: "Settings", fields: [{ name: "layers", type: "array:2:struct:Layer" }, { name: "weights", type: "array:2:f32" }] },
          { name: "Layer", fields: [{ name: "color", type: "vec3" }, { name: "enabled", type: "bool" }] }
        ],
        resources: [{ name: "settings", kind: "uniform", type: "struct:Settings" }],
        nodes: [
          { id: "settings", op: "uniform", type: "struct:Settings", resource: "settings" },
          { id: "layers", op: "structField", name: "layers", type: "array:2:struct:Layer", inputs: ["settings"] },
          { id: "index", op: "constant", type: "u32", value: 1 },
          { id: "layer", op: "arrayIndex", type: "struct:Layer", inputs: ["layers", "index"] },
          { id: "color", op: "structField", name: "color", type: "vec3", inputs: ["layer"] },
          { id: "weights", op: "structField", name: "weights", type: "array:2:f32", inputs: ["settings"] },
          { id: "weight", op: "arrayIndex", type: "f32", inputs: ["weights", "index"] }
        ],
        outputs: { color: "color", opacity: "weight" }
      } as unknown as ShaderGraphDocument;
      const glsl = compileShaderGraph(graph, "glsl");
      const header = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
      const prelude = "uniform mat4 modelViewProjectionMatrix;\nuniform mat4 modelMatrix;\nin vec3 position;\n";
      for (const [stage, source] of [["vert", header + prelude + glsl.vertex], ["frag", header + glsl.fragment]] as const) {
        const result = spawnSync("glslangValidator", ["--stdin", "-S", stage], { input: source, encoding: "utf8" });
        expect(result.status, `${stage}: ${result.stdout}\n${result.stderr}`).toBe(0);
      }
    }
  );
  it.each(["glsl", "wgsl"] as const)("compiles nested typed structs and functions in %s material and shadow stages", (target) => {
    const value = graph();
    expect(diagnostics(value, target)).toEqual([]);
    const compiled = compileShaderGraph(value, target);
    const declarations = compiled.material?.fragment.declarations?.join("\n");
    expect(declarations).toContain("auraGraph_struct_vPaint");
    expect(declarations).toContain("auraGraph_struct_vSurface");
    expect(declarations).toContain("auraGraph_fn_vnoiseAt");
    expect(declarations).toContain("auraGraph_fn_vcoverage");
    expect(declarations!.indexOf("auraGraph_struct_vPaint")).toBeLessThan(declarations!.indexOf("auraGraph_struct_vSurface"));
    expect(declarations!.indexOf("auraGraph_fn_vnoiseAt")).toBeLessThan(declarations!.indexOf("auraGraph_fn_vcoverage"));
    expect(compiled.nodeSources.surface).toContain("auraGraph_struct_vSurface(");
    expect(compiled.nodeSources.surfaceColor).toContain("auraGraph_field_vcolor");
    expect(compiled.nodeSources.coverage).toContain("auraGraph_fn_vcoverage(");
    for (const source of [compiled.vertex, compiled.fragment, compiled.depth?.vertex, compiled.depth?.fragment]) {
      expect(source).toContain("auraGraph_struct_vSurface");
      expect(source).toContain("auraGraph_fn_vcoverage");
      expect(source).toContain("auraGraph_noise");
      expect(source).toContain("auraGraph_fn_vcoverage(auraGraph_uv0)");
    }
    expect(compiled.depth?.fragment).toContain("< 0.4");
    expect(shaderGraph.deserialize(shaderGraph.serialize(value))).toEqual(value);
  });

  it("reaches the actual portable material and its alpha-tested shadow sources", () => {
    const spec = shaderGraph.material({ graph: graph() }).custom!;
    const runtime = createCustomShaderMaterial(spec);
    const device = new MockRenderDevice();
    try {
      expect(runtime.compile(device).ok).toBe(true);
      const forward = globalShaderSource(runtime.shaderKey)!;
      const depth = globalShaderSource(runtime.customDepthShaderKey!)!;
      for (const source of [forward.vertex, forward.fragment, depth.vertex, depth.fragment]) {
        expect(source).toContain("auraGraph_struct_vSurface");
        expect(source).toContain("auraGraph_fn_vcoverage");
      }
      for (const source of [forward.webgpu?.vertex, forward.webgpu?.fragment, depth.webgpu?.vertex, depth.webgpu?.fragment]) {
        expect(source).toContain("auraGraph_struct_vSurface");
        expect(source).toContain("auraGraph_fn_vcoverage");
      }
    } finally {
      runtime.dispose();
      device.dispose();
    }
  });

  it.each(["f32", "vec2", "vec3", "vec4"] as const)("lowers %s-coordinate noise into WGSL compute storage", (type) => {
    const value = type === "f32" ? -0.25 : Array.from({ length: Number(type.slice(-1)) }, (_, index) => index - 0.25);
    const compute: ShaderGraphDocument = {
      version: 1, stage: "compute",
      resources: [{ name: "result", kind: "storage-buffer", type: "f32", access: "read_write" }],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "coord", op: "constant", type, value },
        { id: "sample", op: "noise", type: "f32", inputs: ["coord"] }
      ],
      statements: [{ op: "store", resource: "result", index: "index", value: "sample" }]
    };
    expect(diagnostics(compute)).toEqual([]);
    const compiled = compileShaderGraph(compute, "wgsl");
    expect(compiled.nodeSources.sample).toContain("auraGraph_noise");
    expect(compiled.compute).toContain(compiled.nodeSources.sample);
    expect(compiled.compute).toContain("auraGraph_resource_result[0u] =");
    expect(compiled.compute).toContain("floor(");
    expect(compiled.compute).toContain("mix(");
    expect(() => compileShaderGraph(compute, "glsl")).toThrow(/unsupported-backend/);
  });

  it.each(["glsl", "wgsl"] as const)("matches independent periodic value-noise expectations in emitted %s helpers", (target) => {
    const source = compileShaderGraph(graph(), target).material!.fragment.declarations!.join("\n");
    const cases = [
      { point: [0], expected: 0.2017426611031688 },
      { point: [-0.25], expected: 0.26569991093575424 },
      { point: [1.5, 2.25], expected: 0.6788239119991012 },
      { point: [-0.25, 3.75, -2.5], expected: 0.44915831842448783 },
      { point: [4.25, -3.5, 2.125, 0.75], expected: 0.7885091003653155 },
      { point: [260.25, -3.5, 2.125, 0.75], expected: 0.7885091003653155 }
    ];
    for (const { point, expected } of cases) expect(evaluateEmittedNoise(source, point)).toBeCloseTo(expected, 11);
    const changed = source.replace("1664525u", "1664526u");
    expect(Math.abs(evaluateEmittedNoise(changed, cases[4]!.point) - cases[4]!.expected)).toBeGreaterThan(0.001);
  });

  it("supports host-shareable struct storage buffers in compute and rejects boolean storage fields", () => {
    const compute: ShaderGraphDocument = {
      version: 1, stage: "compute",
      structs: [{ name: "Pair", fields: [{ name: "x", type: "f32" }, { name: "y", type: "u32" }] }],
      resources: [{ name: "result", kind: "storage-buffer", type: "struct:Pair", access: "read_write" }],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "x", op: "constant", type: "f32", value: 0.5 },
        { id: "y", op: "constant", type: "u32", value: 7 },
        { id: "pair", op: "structConstruct", type: "struct:Pair", inputs: ["x", "y"] },
        { id: "loaded", op: "storageLoad", type: "struct:Pair", resource: "result", inputs: ["index"] },
        { id: "field", op: "structField", name: "y", type: "u32", inputs: ["loaded"] }
      ],
      statements: [{ op: "store", resource: "result", index: "index", value: "pair" }]
    };
    expect(diagnostics(compute)).toEqual([]);
    const source = compileShaderGraph(compute, "wgsl").compute!;
    expect(source).toContain("array<auraGraph_struct_vPair>");
    expect(source).toContain("auraGraph_struct_vPair(0.5, 7u)");
    const invalid = structuredClone(compute) as unknown as { structs: { fields: { type: string }[] }[] };
    invalid.structs[0]!.fields[1]!.type = "bool";
    expect(diagnostics(invalid).map((entry) => entry.code)).toContain("invalid-resource");
  });

  it("composes nested authored functions, noise, and a typed struct store in compute", () => {
    const fixture = graph();
    const compute: ShaderGraphDocument = {
      version: 1, stage: "compute", structs: fixture.structs, functions: fixture.functions,
      resources: [{ name: "result", kind: "storage-buffer", type: "struct:Paint", access: "read_write" }],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "uv", op: "constant", type: "vec2", value: [-1.5, 2.25] },
        { id: "color", op: "constant", type: "vec3", value: [0.25, 0.5, 0.75] },
        { id: "coverage", op: "call", name: "coverage", type: "f32", inputs: ["uv"] },
        { id: "paint", op: "call", name: "paint", type: "struct:Paint", inputs: ["color", "coverage"] }
      ],
      statements: [{ op: "store", resource: "result", index: "index", value: "paint" }]
    };
    expect(diagnostics(compute)).toEqual([]);
    const compiled = compileShaderGraph(compute, "wgsl");
    expect(compiled.compute).toContain("array<auraGraph_struct_vPaint>");
    expect(compiled.compute).toContain("auraGraph_fn_vpaint(vec3<f32>(0.25, 0.5, 0.75), auraGraph_fn_vcoverage(vec2<f32>(-1.5, 2.25)))");
    expect(compiled.compute).toContain("auraGraph_resource_result[0u] =");
    expect(shaderGraph.deserialize(shaderGraph.serialize(compute))).toEqual(compute);
  });

  it("rejects unknown, malformed, duplicate, and recursively defined struct types", () => {
    const base = graph() as unknown as { structs: unknown[] };
    const cases = [
      { structs: [{ name: "Missing", fields: [{ name: "x", type: "struct:NoSuchType" }] }], code: "invalid-type" },
      { structs: [{ name: "Empty", fields: [] }], code: "invalid-struct" },
      { structs: [{ name: "Bad", fields: [{ name: "x", type: "f32" }, { name: "x", type: "u32" }] }], code: "duplicate-field" },
      { structs: [{ name: "Loop", fields: [{ name: "next", type: "struct:Loop" }] }], code: "struct-cycle" },
      { structs: [{ name: "Inject) {}", fields: [{ name: "x", type: "f32" }] }], code: "invalid-struct" }
    ];
    for (const entry of cases) {
      expect(diagnostics({ ...base, structs: entry.structs }).map((item) => item.code), entry.code).toContain(entry.code);
    }
  });

  it("checks struct construction, field names, nominal field types, and noise operands", () => {
    const base = graph() as unknown as { nodes: Record<string, unknown>[] };
    const mutate = (id: string, patch: Record<string, unknown>) => ({
      ...base,
      nodes: base.nodes.map((node) => node.id === id ? { ...node, ...patch } : node)
    });
    const cases = [
      { id: "surface", patch: { inputs: ["position"] }, code: "invalid-arity" },
      { id: "surface", patch: { inputs: ["color", "position"] }, code: "type-mismatch" },
      { id: "surfacePaint", patch: { name: "unknown" }, code: "invalid-field" },
      { id: "surfaceColor", patch: { type: "f32" }, code: "type-mismatch" },
      { id: "coverage", patch: { op: "noise", inputs: ["surface"] }, code: "type-mismatch" },
      { id: "coverage", patch: { op: "noise", type: "vec2" }, code: "type-mismatch" }
    ];
    for (const entry of cases) {
      expect(diagnostics(mutate(entry.id, entry.patch)), entry.id).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: entry.code, nodeId: entry.id })
      ]));
    }
  });

  it("rejects invalid function signatures, scope escapes, type mismatches, and recursion", () => {
    const base = graph() as unknown as { functions: Record<string, unknown>[]; nodes: Record<string, unknown>[] };
    const wrongCall = { ...base, nodes: base.nodes.map((node) => node.id === "coverage" ? { ...node, inputs: ["color"] } : node) };
    expect(diagnostics(wrongCall)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "type-mismatch", nodeId: "coverage" })]));
    const recursive = structuredClone(base);
    const noiseAt = recursive.functions.find((item) => item.name === "noiseAt")!;
    (noiseAt.nodes as Record<string, unknown>[])[1] = { id: "value", op: "call", name: "coverage", type: "f32", inputs: ["coord"] };
    expect(diagnostics(recursive).map((entry) => entry.code)).toContain("function-cycle");
    const badParameter = structuredClone(base);
    const fn = badParameter.functions.find((item) => item.name === "coverage")!;
    (fn.nodes as Record<string, unknown>[])[0] = { id: "coord", op: "parameter", name: "missing", type: "vec2" };
    expect(diagnostics(badParameter).map((entry) => entry.code)).toContain("invalid-scope");
    const badReturn = structuredClone(base);
    badReturn.functions[0]!.returnType = "vec3";
    expect(diagnostics(badReturn).map((entry) => entry.code)).toContain("type-mismatch");
    const outside = { ...base, nodes: [...base.nodes, { id: "parameterOutside", op: "parameter", name: "coord", type: "vec2" }] };
    expect(diagnostics(outside)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-scope", nodeId: "parameterOutside" })]));
  });

  it("checks unused definitions, dense fields and parameters, call arities, and function-local references", () => {
    const original = graph();
    const unknownFunction = structuredClone(original);
    const call = unknownFunction.nodes.find((node) => node.id === "coverage")!;
    Object.assign(call, { name: "absent" });
    expect(diagnostics(unknownFunction)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing-function", nodeId: "coverage" })]));
    const badArity = structuredClone(original);
    Object.assign(badArity.nodes.find((node) => node.id === "coverage")!, { inputs: [] });
    expect(diagnostics(badArity)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-arity", nodeId: "coverage" })]));
    const sparseField = structuredClone(original);
    delete (sparseField.structs![0]!.fields as (unknown | undefined)[])[0];
    expect(diagnostics(sparseField)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-field", path: "structs[0].fields[0]" })]));
    const duplicateParameter = structuredClone(original);
    (duplicateParameter.functions![2]!.parameters as unknown[]).push({ name: "color", type: "vec3" });
    expect(diagnostics(duplicateParameter).map((entry) => entry.code)).toContain("duplicate-parameter");
    const unusedCapture = structuredClone(original);
    (unusedCapture.functions as unknown[]).push({
      name: "unused", parameters: [], returnType: "f32",
      nodes: [{ id: "time", op: "input", name: "time", type: "f32" }], output: "time"
    });
    expect(diagnostics(unusedCapture)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-scope", nodeId: "time", path: "functions[3].nodes[0]" })]));
    const escapedNode = structuredClone(original);
    Object.assign(escapedNode.functions![0]!.nodes[1]!, { inputs: ["uv"] });
    expect(diagnostics(escapedNode)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing-node", nodeId: "value", path: "functions[0].nodes[1].inputs[0]" })]));
    const shaderSource = structuredClone(original);
    Object.assign(shaderSource.functions![0]!, { name: "bad); discard; //" });
    expect(diagnostics(shaderSource).map((entry) => entry.code)).toContain("invalid-function");
  });

  it.each(["glsl", "wgsl"] as const)("uses collision-free shader identifiers and supports selecting typed structs in %s", (target) => {
    const value: ShaderGraphDocument = {
      version: 1, stage: "material",
      structs: [
        { name: "__proto__", fields: [{ name: "__value", type: "f32" }] },
        { name: "v_0proto_0", fields: [{ name: "__value", type: "f32" }] }
      ],
      nodes: [
        { id: "one", op: "constant", type: "f32", value: 0.25 },
        { id: "two", op: "constant", type: "f32", value: 0.75 },
        { id: "flag", op: "constant", type: "bool", value: true },
        { id: "a", op: "structConstruct", type: "struct:__proto__", inputs: ["one"] },
        { id: "b", op: "structConstruct", type: "struct:__proto__", inputs: ["two"] },
        { id: "pick", op: "select", type: "struct:__proto__", inputs: ["flag", "a", "b"] },
        { id: "opacity", op: "structField", name: "__value", type: "f32", inputs: ["pick"] }
      ],
      outputs: { opacity: "opacity" }
    };
    expect(diagnostics(value, target)).toEqual([]);
    const compiled = compileShaderGraph(value, target);
    const declarations = compiled.material!.fragment.declarations!.join("\n");
    expect(declarations).toContain("auraGraph_struct_v_0_0proto_0_0");
    expect(declarations).toContain("auraGraph_struct_vv_00proto_00");
    expect(declarations).not.toMatch(/\bauraGraph_\w*__\w*\b/);
    expect(compiled.nodeSources.pick).toContain("auraGraph_select_v_0_0proto_0_0(");
    expect(compiled.nodeSources.opacity).toContain("auraGraph_field_v_0_0value");
  });
});
