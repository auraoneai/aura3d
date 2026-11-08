import { describe, expect, it } from "vitest";
import { MockRenderBuffer, MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { UniformBlock, layoutStd140, uniformBlockGlsl } from "../../../packages/rendering/src/resources/UniformBlock";
import {
  deriveShaderDataLayout,
  writeShaderData,
  type ShaderDataType
} from "../../../packages/rendering/src/webgpu/ShaderDataLayout";

const mixed: ShaderDataType = {
  kind: "struct",
  fields: [
    { name: "gain", type: "f32" },
    { name: "signed", type: "i32" },
    { name: "enabled", type: "bool" },
    { name: "axis", type: { kind: "vector", element: "f32", length: 3 } },
    { name: "tail", type: "f32" },
    { name: "transform", type: { kind: "matrix", columns: 2, rows: 3 } },
    { name: "weights", type: { kind: "array", element: "f32", length: 2 } },
    { name: "nested", type: { kind: "struct", fields: [
      { name: "index", type: "i32" },
      { name: "values", type: { kind: "vector", element: "u32", length: 2 } }
    ] } }
  ]
};

const mixedValue = {
  gain: 1.5, signed: -2, enabled: true, axis: [1, 2, 3], tail: 4,
  transform: [10, 11, 12, 20, 21, 22], weights: [0.25, 0.75],
  nested: { index: -7, values: [0xffffffff, 17] }
};

function offsets(layout: ReturnType<typeof deriveShaderDataLayout>): number[] {
  return layout.members!.map((member) => member.offset);
}

describe("shader data layouts", () => {
  it("writes std140 mixed integers, booleans, vectors, a non-square matrix, arrays and structs to exact bytes", () => {
    const layout = deriveShaderDataLayout(mixed, "glsl-std140");
    expect(offsets(layout)).toEqual([0, 4, 8, 16, 28, 32, 64, 96]);
    expect(layout.size).toBe(112);
    expect(layout.members![5].layout.stride).toBe(16);
    expect(layout.members![6].layout.stride).toBe(16);
    expect(offsets(layout.members![7].layout)).toEqual([0, 8]);
    const bytes = writeShaderData(layout, mixedValue);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getFloat32(0, true)).toBe(1.5);
    expect(view.getInt32(4, true)).toBe(-2);
    expect(view.getUint32(8, true)).toBe(1);
    expect([16, 20, 24, 28].map((p) => view.getFloat32(p, true))).toEqual([1, 2, 3, 4]);
    expect([32, 36, 40, 48, 52, 56].map((p) => view.getFloat32(p, true))).toEqual([10, 11, 12, 20, 21, 22]);
    expect([44, 60, 68, 72, 76, 84, 88, 92, 100].map((p) => view.getUint32(p, true))).toEqual(Array(9).fill(0));
    expect([64, 80].map((p) => view.getFloat32(p, true))).toEqual([0.25, 0.75]);
    expect(view.getInt32(96, true)).toBe(-7);
    expect(view.getUint32(104, true)).toBe(0xffffffff);
    expect(view.getUint32(108, true)).toBe(17);
  });

  it("distinguishes target-specific matrix, array and nested struct alignment", () => {
    const type: ShaderDataType = { kind: "struct", fields: [
      { name: "matrix", type: { kind: "matrix", columns: 2, rows: 2 } },
      { name: "array", type: { kind: "array", element: "f32", length: 3 } },
      { name: "nested", type: { kind: "struct", fields: [{ name: "word", type: "u32" }] } },
      { name: "after", type: "f32" }
    ] };
    const std140 = deriveShaderDataLayout(type, "glsl-std140");
    const std430 = deriveShaderDataLayout(type, "glsl-std430");
    const wgslUniform = deriveShaderDataLayout(type, "wgsl-uniform");
    const wgslStorage = deriveShaderDataLayout(type, "wgsl-storage");
    expect([offsets(std140), std140.size, std140.members![0].layout.stride, std140.members![1].layout.stride]).toEqual([[0, 32, 80, 96], 112, 16, 16]);
    expect([offsets(std430), std430.size, std430.members![0].layout.stride, std430.members![1].layout.stride]).toEqual([[0, 16, 28, 32], 40, 8, 4]);
    expect([offsets(wgslUniform), wgslUniform.size, wgslUniform.members![0].layout.stride, wgslUniform.members![1].layout.stride]).toEqual([[0, 16, 64, 80], 96, 8, 16]);
    expect([offsets(wgslStorage), wgslStorage.size, wgslStorage.members![0].layout.stride, wgslStorage.members![1].layout.stride]).toEqual([[0, 16, 28, 32], 40, 8, 4]);
    const value = { matrix: [1, 2, 3, 4], array: [5, 6, 7], nested: { word: 9 }, after: 10 };
    const bytes = writeShaderData(wgslUniform, value);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([0, 4, 8, 12, 16, 32, 48, 80].map((p) => view.getFloat32(p, true))).toEqual([1, 2, 3, 4, 5, 6, 7, 10]);
    expect(view.getUint32(64, true)).toBe(9);
    expect(view.getUint32(20, true)).toBe(0);
  });

  it("rejects non-host-shareable WGSL bool, recursive schemas and malformed layouts", () => {
    expect(() => deriveShaderDataLayout("bool", "wgsl-uniform")).toThrow(/not host-shareable/);
    expect(() => deriveShaderDataLayout({ kind: "vector", element: "bool", length: 2 }, "wgsl-storage")).toThrow(/not host-shareable/);
    expect(() => deriveShaderDataLayout({ kind: "array", element: "f32", length: 0 }, "glsl-std140")).toThrow(/positive safe integer/);
    expect(() => deriveShaderDataLayout({ kind: "struct", fields: [{ name: "x", type: "f32" }, { name: "x", type: "u32" }] }, "wgsl-storage")).toThrow(/duplicate field/);
    expect(() => deriveShaderDataLayout({ kind: "struct", fields: [] }, "wgsl-storage")).toThrow(/at least one field/);
    const recursive: { kind: "array"; element?: unknown; length: number } = { kind: "array", length: 2 };
    recursive.element = recursive;
    expect(() => deriveShaderDataLayout(recursive as ShaderDataType, "wgsl-storage")).toThrow(/recursive/);
    expect(() => deriveShaderDataLayout("f32", "bogus" as never)).toThrow(/unknown layout target/);
  });

  it("validates all values and bounds before changing caller-owned staging bytes", () => {
    const layout = deriveShaderDataLayout(mixed, "glsl-std140");
    const target = new Uint8Array(layout.size + 32).fill(0xa5);
    expect(() => writeShaderData(layout, { ...mixedValue, signed: 0.5 }, target, 16)).toThrow(/signed 32-bit integer/);
    expect(() => writeShaderData(layout, { ...mixedValue, nested: { index: 0, values: [-1, 0] } }, target, 16)).toThrow(/unsigned 32-bit integer/);
    expect(() => writeShaderData(layout, { ...mixedValue, transform: [1, 2] }, target, 16)).toThrow(/expected 6 values/);
    expect(() => writeShaderData(layout, { ...mixedValue, enabled: 2 }, target, 16)).toThrow(/true, false, 0, or 1/);
    expect(() => writeShaderData(layout, { ...mixedValue, extra: 1 }, target, 16)).toThrow(/unknown field/);
    expect(() => writeShaderData(layout, mixedValue, target, 1)).toThrow(/multiple of 16/);
    expect(() => writeShaderData(layout, mixedValue, new Uint8Array(10))).toThrow(/too small/);
    expect([...target]).toEqual(Array(target.length).fill(0xa5));
    const result = writeShaderData(layout, mixedValue, target, 16);
    expect(result.byteLength).toBe(112);
    expect([...target.slice(0, 16)]).toEqual(Array(16).fill(0xa5));
    expect([...target.slice(128)]).toEqual(Array(16).fill(0xa5));
  });

  it("rejects f32 vector and matrix values outside the finite f32 range on the typed fast path", () => {
    const layout = deriveShaderDataLayout(mixed, "glsl-std140");
    for (const bad of [{ axis: [1, 1e39, 3] }, { axis: [1, Number.NaN, 3] }, { transform: [10, 11, 12, 20, Infinity, 22] }, { axis: [1, "2", 3] }]) {
      expect(() => writeShaderData(layout, { ...mixedValue, ...bad })).toThrow();
      const target = new Uint8Array(layout.size + 16).fill(7);
      expect(() => writeShaderData(layout, { ...mixedValue, ...bad }, target, 16)).toThrow();
      expect(target.every((byte) => byte === 7)).toBe(true);
    }
    const fresh = writeShaderData(layout, mixedValue);
    const placed = writeShaderData(layout, mixedValue, new Uint8Array(layout.size + 16), 16);
    expect([...fresh]).toEqual([...placed]);
  });

  it("snapshots caller schemas so later edits cannot change a derived layout", () => {
    const schema = { kind: "array" as const, element: "u32" as const, length: 2 };
    const layout = deriveShaderDataLayout(schema, "wgsl-storage");
    schema.length = 3;
    expect(layout.type).toEqual({ kind: "array", element: "u32", length: 2 });
    expect([...new Uint32Array(writeShaderData(layout, [3, 5]).buffer)]).toEqual([3, 5]);
  });
});

describe("std140 uniform blocks", () => {
  it("preserves legacy field declarations and transfers integer bits instead of float encodings", () => {
    const device = new MockRenderDevice();
    const block = new UniformBlock(device, "Mixed", [
      ["negative", "int"], ["mask", "uvec2"], ["enabled", "bool"], ["matrix", "mat3x2"], ["weights", "float[2]"]
    ]);
    expect([...block.layout.offsets.values()]).toEqual([0, 8, 16, 32, 80]);
    block.set("negative", [-2]);
    block.set("mask", [0xffffffff, 0x80000000]);
    block.set("enabled", [1]);
    const matrix = [1, 2, 3, 4, 5, 6];
    block.set("matrix", matrix);
    block.set("weights", [0.5, 0.25]);
    matrix[0] = 99;
    block.upload();
    const buffer = block.buffer as MockRenderBuffer;
    const view = new DataView(buffer.bytes.buffer, buffer.bytes.byteOffset, buffer.bytes.byteLength);
    expect(view.getInt32(0, true)).toBe(-2);
    expect([view.getUint32(8, true), view.getUint32(12, true), view.getUint32(16, true)]).toEqual([0xffffffff, 0x80000000, 1]);
    expect([32, 36, 48, 52, 64, 68].map((p) => view.getFloat32(p, true))).toEqual([1, 2, 3, 4, 5, 6]);
    expect([view.getFloat32(80, true), view.getFloat32(96, true)]).toEqual([0.5, 0.25]);
    expect(uniformBlockGlsl("Mixed", [["matrix", "mat3x2"], ["weights", "float[2]"]])).toContain("float weights[2];");
    block.dispose();
    block.dispose();
    expect(buffer.disposed).toBe(true);
    expect(() => block.upload()).toThrow(/disposed/);
  });

  it("lowers nested arrays to GLSL ES-compatible wrapper structs without changing std140 strides", () => {
    const fields = [["values", "float[2][3]"]] as const;
    const declaration = uniformBlockGlsl("Nested", fields);
    expect(declaration).toContain("struct Nested_Array0");
    expect(declaration).toContain("float value[3];");
    expect(declaration).toContain("Nested_Array0 values[2];");
    const block = new UniformBlock(new MockRenderDevice(), "Nested", fields);
    block.set("values", [[1, 2, 3], [4, 5, 6]]);
    block.upload();
    const bytes = (block.buffer as MockRenderBuffer).bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([0, 16, 32, 48, 64, 80].map((offset) => view.getFloat32(offset, true))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("supports structured fields and rejects mismatched data without corrupting an existing upload", () => {
    const nested: ShaderDataType = { kind: "array", length: 2, element: { kind: "struct", fields: [
      { name: "id", type: "u32" }, { name: "color", type: { kind: "vector", element: "f32", length: 3 } }
    ] } };
    const fields = [["items", nested]] as const;
    const layout = layoutStd140(fields);
    expect(layout.byteSize).toBe(64);
    const declaration = uniformBlockGlsl("Objects", fields);
    expect(declaration).toContain("struct Objects_Struct0");
    expect(declaration).toContain("Objects_Struct0 items[2];");
    const block = new UniformBlock(new MockRenderDevice(), "Objects", fields);
    block.set("items", [{ id: 1, color: [1, 2, 3] }, { id: 2, color: [4, 5, 6] }]);
    block.upload();
    const bytes = (block.buffer as MockRenderBuffer).bytes;
    const before = [...bytes];
    expect(() => block.set("items", [{ id: 3, color: [1, 2, 3] }, { id: -1, color: [4, 5, 6] }])).toThrow(/unsigned/);
    block.upload();
    expect([...bytes]).toEqual(before);
  });
});
