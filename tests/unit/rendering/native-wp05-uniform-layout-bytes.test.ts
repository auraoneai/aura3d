import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import {
  deriveUniformDataLayout,
  emitGlslBlock,
  emitWgslStruct,
  std140Offsets,
  writeUniformData,
  type UniformBlockLayout
} from "../../../packages/rendering/src/program/UniformLayout";
import { UniformBlock } from "../../../packages/rendering/src/resources/UniformBlock";
import { deriveShaderDataLayout, writeShaderData, type ShaderDataType } from "../../../packages/rendering/src/webgpu/ShaderDataLayout";

type ReflectedType = {
  readonly kind: "scalar" | "vector" | "matrix" | "array" | "struct";
  readonly alignment: number;
  readonly size: number;
  readonly stride?: number;
  readonly element?: ReflectedType;
  readonly members?: Readonly<Record<string, { readonly offset: number; readonly type: ReflectedType }>>;
};

const roundUp = (value: number, alignment: number): number => Math.ceil(value / alignment) * alignment;

function reflectWgsl(source: string, root: string, addressSpace: "uniform" | "storage"): ReflectedType {
  const definitions = new Map<string, string>();
  for (const match of source.matchAll(/\bstruct\s+(\w+)\s*\{([^}]*)\}\s*;?/gs)) definitions.set(match[1], match[2]);
  const active = new Set<string>();
  const cache = new Map<string, ReflectedType>();

  function resolve(text: string): ReflectedType {
    const type = text.trim();
    if (/^(f32|i32|u32)$/.test(type)) return { kind: "scalar", alignment: 4, size: 4 };
    const vector = /^vec([234])<(f32|i32|u32)>$/.exec(type);
    if (vector) {
      const length = Number(vector[1]);
      return { kind: "vector", alignment: length === 2 ? 8 : 16, size: length * 4 };
    }
    const matrix = /^mat([234])x([234])<f32>$/.exec(type);
    if (matrix) {
      const columns = Number(matrix[1]);
      const rows = Number(matrix[2]);
      const alignment = rows === 2 ? 8 : 16;
      const stride = roundUp(rows * 4, alignment);
      return { kind: "matrix", alignment, stride, size: columns * stride };
    }
    const array = /^array<(.+),\s*(\d+)>$/.exec(type);
    if (array) {
      const element = resolve(array[1]);
      const stride = roundUp(element.size, element.alignment);
      return { kind: "array", alignment: element.alignment, stride, element, size: stride * Number(array[2]) };
    }
    const prior = cache.get(type);
    if (prior) return prior;
    const body = definitions.get(type);
    if (body === undefined || active.has(type)) throw new Error(`Unknown or recursive WGSL type: ${type}`);
    active.add(type);
    let offset = 0;
    let alignment = 1;
    const members: Record<string, { offset: number; type: ReflectedType }> = {};
    for (const line of body.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
      const member = /^((?:@\w+\(\d+\)\s*)*)(\w+)\s*:\s*(.+),$/.exec(line);
      if (!member) throw new Error(`Invalid WGSL struct member: ${line}`);
      const attributes = Object.fromEntries([...member[1].matchAll(/@(align|size)\((\d+)\)/g)].map((entry) => [entry[1], Number(entry[2])]));
      const valueType = resolve(member[3]);
      const memberAlignment = attributes.align ?? valueType.alignment;
      const memberSize = attributes.size ?? valueType.size;
      if (memberAlignment < valueType.alignment || memberSize < valueType.size) throw new Error(`Invalid WGSL member attributes: ${line}`);
      offset = roundUp(offset, memberAlignment);
      members[member[2]] = { offset, type: valueType };
      alignment = Math.max(alignment, memberAlignment);
      offset += memberSize;
    }
    active.delete(type);
    const result: ReflectedType = { kind: "struct", alignment, size: roundUp(offset, alignment), members };
    cache.set(type, result);
    return result;
  }

  function validateUniform(type: ReflectedType): void {
    if (type.kind === "array") {
      if (type.stride! % 16 !== 0) throw new Error(`Invalid uniform array stride: ${type.stride}`);
      validateUniform(type.element!);
    }
    if (type.kind === "struct") {
      let previous: { readonly offset: number; readonly type: ReflectedType } | undefined;
      for (const member of Object.values(type.members!)) {
        const requiredAlignment = member.type.kind === "array" || member.type.kind === "struct"
          ? roundUp(member.type.alignment, 16)
          : member.type.alignment;
        if (member.offset % requiredAlignment !== 0) throw new Error(`Invalid uniform member offset: ${member.offset}`);
        if (previous?.type.kind === "struct" && member.offset < previous.offset + roundUp(previous.type.size, 16)) {
          throw new Error("Invalid spacing after a nested uniform struct");
        }
        validateUniform(member.type);
        previous = member;
      }
    }
  }

  const result = resolve(root);
  if (addressSpace === "uniform") validateUniform(result);
  return result;
}

function arrayElement(type: ReflectedType, index: number): { readonly offset: number; readonly type: ReflectedType } {
  if (type.kind !== "array" || !type.element || type.stride === undefined) throw new Error("Expected an array");
  let offset = index * type.stride;
  let element = type.element;
  if (element.kind === "struct" && Object.keys(element.members!).length === 1 && element.members!.value) {
    offset += element.members!.value.offset;
    element = element.members!.value.type;
  }
  return { offset, type: element };
}

function readView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const objectArray: ShaderDataType = {
  kind: "array",
  length: 2,
  element: {
    kind: "struct",
    fields: [
      { name: "signed", type: "i32" },
      { name: "enabled", type: "bool" },
      { name: "bias", type: { kind: "vector", element: "f32", length: 2 } }
    ]
  }
};
const matrices: ShaderDataType = {
  kind: "array",
  length: 2,
  element: { kind: "matrix", columns: 3, rows: 2 }
};
const complexLayout: UniformBlockLayout = {
  name: "AuraMaterial",
  group: 2,
  binding: 0,
  members: [
    { name: "prefix", type: "i32" },
    { name: "items", type: objectArray },
    { name: "matrices", type: matrices },
    { name: "weights", type: "f32", arrayLength: 2 },
    { name: "tail", type: "u32" }
  ]
};
const complexValue = {
  prefix: -7,
  items: [
    { signed: -1, enabled: true, bias: [1.25, 2.5] },
    { signed: -0x80000000, enabled: false, bias: [3.5, 4.75] }
  ],
  matrices: [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
  weights: [0.25, 0.75],
  tail: 0xfedcba98
};

describe("WP-05 uniform and shader-buffer bytes", () => {
  it("uploads exact std140 bytes for mixed signed, unsigned, bool, struct arrays and non-square matrix arrays", () => {
    const device = new MockRenderDevice();
    const block = new UniformBlock(device, "MixedBytes", [
      ["prefix", "int"],
      ["items", objectArray],
      ["matrices", matrices],
      ["weights", "float[2]"],
      ["tail", "uint"]
    ]);
    for (const [name, value] of Object.entries(complexValue)) block.set(name, value);
    block.upload();
    const expected = new Uint8Array(192);
    const view = readView(expected);
    view.setInt32(0, -7, true);
    view.setInt32(16, -1, true);
    view.setUint32(20, 1, true);
    view.setFloat32(24, 1.25, true);
    view.setFloat32(28, 2.5, true);
    view.setInt32(32, -0x80000000, true);
    view.setUint32(36, 0, true);
    view.setFloat32(40, 3.5, true);
    view.setFloat32(44, 4.75, true);
    for (let matrix = 0; matrix < 2; matrix += 1) {
      for (let column = 0; column < 3; column += 1) {
        for (let row = 0; row < 2; row += 1) {
          view.setFloat32(48 + matrix * 48 + column * 16 + row * 4, matrix * 6 + column * 2 + row + 1, true);
        }
      }
    }
    view.setFloat32(144, 0.25, true);
    view.setFloat32(160, 0.75, true);
    view.setUint32(176, 0xfedcba98, true);
    expect([...block.layout.offsets]).toEqual([["prefix", 0], ["items", 16], ["matrices", 48], ["weights", 144], ["tail", 176]]);
    expect(device.readBuffer(block.buffer)).toEqual(expected);
    expect(std140Offsets(complexLayout)).toEqual({ size: 192, offsets: { prefix: 0, items: 16, matrices: 48, weights: 144, tail: 176 } });
    expect(writeUniformData(complexLayout, "glsl-std140", complexValue)).toEqual(expected);
    const before = new Uint8Array(block.data.buffer).slice();
    expect(() => block.set("items", [{ signed: 1, enabled: true, bias: [1, 2] }, { signed: 2, enabled: 2, bias: [3, 4] }])).toThrow();
    expect(new Uint8Array(block.data.buffer)).toEqual(before);
    block.dispose();
  });

  it("treats a one-element array as an array in offsets, declarations and uploaded bytes", () => {
    const layout: UniformBlockLayout = {
      name: "AuraObject", group: 3, binding: 0,
      members: [
        { name: "prefix", type: "f32" },
        { name: "single", type: "f32", arrayLength: 1 },
        { name: "tail", type: "u32" }
      ]
    };
    const device = new MockRenderDevice();
    const block = new UniformBlock(device, layout.name, [["prefix", "float"], ["single", "float[1]"], ["tail", "uint"]]);
    block.set("prefix", 7);
    block.set("single", [2.5]);
    block.set("tail", 0x12345678);
    block.upload();
    const offsets = std140Offsets(layout);
    const view = readView(device.readBuffer(block.buffer));
    expect(view.getFloat32(offsets.offsets.single, true)).toBe(2.5);
    expect(view.getUint32(offsets.offsets.tail, true)).toBe(0x12345678);
    expect(offsets).toEqual({ size: 48, offsets: { prefix: 0, single: 16, tail: 32 } });
    expect(emitGlslBlock(layout)).toContain("float single[1];");
    for (const kind of ["uniform", "storage"] as const) {
      const reflected = reflectWgsl(emitWgslStruct(layout, kind), layout.name, kind);
      const bytes = writeUniformData(layout, `wgsl-${kind}`, { prefix: 7, single: [2.5], tail: 0x12345678 });
      const element = arrayElement(reflected.members!.single.type, 0);
      expect(readView(bytes).getFloat32(reflected.members!.single.offset + element.offset, true)).toBe(2.5);
      expect(readView(bytes).getUint32(reflected.members!.tail.offset, true)).toBe(0x12345678);
    }
    block.dispose();
  });

  it("uses the full std140 matrix footprint as the stride of matrix arrays", () => {
    const layout: UniformBlockLayout = {
      name: "AuraObject", group: 3, binding: 0,
      members: [
        { name: "prefix", type: "f32" },
        { name: "matrices", type: "mat3", arrayLength: 2 },
        { name: "transforms", type: "mat4", arrayLength: 2 },
        { name: "tail", type: "u32" }
      ]
    };
    const device = new MockRenderDevice();
    const block = new UniformBlock(device, layout.name, [
      ["prefix", "float"], ["matrices", "mat3[2]"], ["transforms", "mat4[2]"], ["tail", "uint"]
    ]);
    block.set("prefix", 1);
    block.set("matrices", [Array.from({ length: 9 }, (_, index) => index + 1), Array.from({ length: 9 }, (_, index) => index + 11)]);
    block.set("transforms", [Array.from({ length: 16 }, (_, index) => index + 21), Array.from({ length: 16 }, (_, index) => index + 41)]);
    block.set("tail", 0x89abcdef);
    block.upload();
    const offsets = std140Offsets(layout);
    const view = readView(device.readBuffer(block.buffer));
    expect(view.getUint32(offsets.offsets.tail, true)).toBe(0x89abcdef);
    expect(offsets).toEqual({ size: 256, offsets: { prefix: 0, matrices: 16, transforms: 112, tail: 240 } });
    expect(view.getFloat32(64, true)).toBe(11);
    expect(view.getFloat32(176, true)).toBe(41);
    block.dispose();
  });

  it.each(["uniform", "storage"] as const)("matches emitted WGSL %s array addressing to actual host bytes", (kind) => {
    const layout: UniformBlockLayout = {
      name: "AuraMaterial", group: 2, binding: 0,
      members: [
        { name: "prefix", type: "f32" },
        { name: "weights", type: "f32", arrayLength: 2 },
        { name: "tail", type: "u32" }
      ]
    };
    const type: ShaderDataType = { kind: "struct", fields: [
      { name: "prefix", type: "f32" },
      { name: "weights", type: { kind: "array", length: 2, element: "f32" } },
      { name: "tail", type: "u32" }
    ] };
    const hostLayout = deriveShaderDataLayout(type, kind === "uniform" ? "wgsl-uniform" : "wgsl-storage");
    const bytes = writeShaderData(hostLayout, { prefix: 6, weights: [1.5, 2.5], tail: 0x80000001 });
    const reflected = reflectWgsl(emitWgslStruct(layout, kind), layout.name, kind);
    const members = reflected.members!;
    const first = arrayElement(members.weights.type, 0);
    const second = arrayElement(members.weights.type, 1);
    const view = readView(bytes);
    expect(view.getFloat32(members.prefix.offset, true)).toBe(6);
    expect(view.getFloat32(members.weights.offset + first.offset, true)).toBe(1.5);
    expect(view.getFloat32(members.weights.offset + second.offset, true)).toBe(2.5);
    expect(view.getUint32(members.tail.offset, true)).toBe(0x80000001);
    expect([members.prefix.offset, members.weights.offset, members.tail.offset]).toEqual(kind === "uniform" ? [0, 16, 48] : [0, 4, 12]);
  });

  it.each(["uniform", "storage"] as const)("packs nested booleans, structs and matrix arrays to the emitted WGSL %s layout", (kind) => {
    const target = kind === "uniform" ? "wgsl-uniform" : "wgsl-storage";
    const bytes = writeUniformData(complexLayout, target, complexValue);
    const reflected = reflectWgsl(emitWgslStruct(complexLayout, kind), complexLayout.name, kind);
    const members = reflected.members!;
    const items0 = arrayElement(members.items.type, 0);
    const items1 = arrayElement(members.items.type, 1);
    const item0 = members.items.offset + items0.offset;
    const item1 = members.items.offset + items1.offset;
    const objectMembers = items0.type.members!;
    const firstMatrix = arrayElement(members.matrices.type, 0);
    const secondMatrix = arrayElement(members.matrices.type, 1);
    const firstWeight = arrayElement(members.weights.type, 0);
    const secondWeight = arrayElement(members.weights.type, 1);
    const view = readView(bytes);
    expect(view.getInt32(members.prefix.offset, true)).toBe(-7);
    expect(view.getInt32(item0 + objectMembers.signed.offset, true)).toBe(-1);
    expect(view.getUint32(item0 + objectMembers.enabled.offset, true)).toBe(1);
    expect(view.getInt32(item1 + objectMembers.signed.offset, true)).toBe(-0x80000000);
    expect(view.getUint32(item1 + objectMembers.enabled.offset, true)).toBe(0);
    expect(view.getFloat32(item1 + objectMembers.bias.offset, true)).toBe(3.5);
    expect(view.getFloat32(members.matrices.offset + firstMatrix.offset + 2 * firstMatrix.type.stride!, true)).toBe(5);
    expect(view.getFloat32(members.matrices.offset + secondMatrix.offset + 2 * secondMatrix.type.stride! + 4, true)).toBe(12);
    expect(view.getFloat32(members.weights.offset + firstWeight.offset, true)).toBe(0.25);
    expect(view.getFloat32(members.weights.offset + secondWeight.offset, true)).toBe(0.75);
    expect(view.getUint32(members.tail.offset, true)).toBe(0xfedcba98);
    expect([members.prefix.offset, members.items.offset, members.matrices.offset, members.weights.offset, members.tail.offset])
      .toEqual(kind === "uniform" ? [0, 16, 48, 112, 144] : [0, 8, 40, 88, 96]);
  });

  it("rejects invalid boolean values without touching the caller's WGSL staging bytes", () => {
    const target = new Uint8Array(160).fill(0xa5);
    const invalid = { ...complexValue, items: [complexValue.items[0], { ...complexValue.items[1], enabled: 2 }] };
    expect(() => writeUniformData(complexLayout, "wgsl-uniform", invalid, target)).toThrow(/true, false, 0, or 1/);
    expect([...target]).toEqual(Array(160).fill(0xa5));
  });

  it.each(["uniform", "storage"] as const)("preserves nested boolean arrays and vector bits in WGSL %s", (kind) => {
    const layout: UniformBlockLayout = {
      name: "AuraObject", group: 3, binding: 0,
      members: [
        { name: "prefix", type: "i32" },
        { name: "flags", type: { kind: "array", length: 2, element: { kind: "array", length: 2, element: "bool" } } },
        { name: "vector", type: { kind: "vector", length: 3, element: "bool" } },
        { name: "tail", type: "u32" }
      ]
    };
    const bytes = writeUniformData(layout, `wgsl-${kind}`, {
      prefix: -9,
      flags: [[true, false], [0, 1]],
      vector: [true, false, true],
      tail: 0xffffffff
    });
    const reflected = reflectWgsl(emitWgslStruct(layout, kind), layout.name, kind);
    const members = reflected.members!;
    const view = readView(bytes);
    const values = [[1, 0], [0, 1]];
    for (let row = 0; row < 2; row += 1) {
      const outer = arrayElement(members.flags.type, row);
      for (let column = 0; column < 2; column += 1) {
        const inner = arrayElement(outer.type, column);
        expect(view.getUint32(members.flags.offset + outer.offset + inner.offset, true)).toBe(values[row][column]);
      }
    }
    expect([0, 4, 8].map((offset) => view.getUint32(members.vector.offset + offset, true))).toEqual([1, 0, 1]);
    expect(view.getInt32(members.prefix.offset, true)).toBe(-9);
    expect(view.getUint32(members.tail.offset, true)).toBe(0xffffffff);
    expect(members.flags.type.stride).toBe(kind === "uniform" ? 32 : 8);
  });

  it.each(
    (["uniform", "storage"] as const).flatMap((kind) =>
      ([2, 3, 4] as const).flatMap((columns) => ([2, 3, 4] as const).map((rows) => ({ kind, columns, rows })))))
  ("uses correct $kind WGSL strides for arrays of mat$columns x $rows", ({ kind, columns, rows }) => {
    const layout: UniformBlockLayout = {
      name: "AuraMaterial", group: 2, binding: 0,
      members: [
        { name: "prefix", type: "f32" },
        { name: "matrices", type: { kind: "matrix", columns, rows }, arrayLength: 2 },
        { name: "tail", type: "u32" }
      ]
    };
    const values = Array.from({ length: 2 }, (_, matrix) =>
      Array.from({ length: columns * rows }, (_, index) => matrix * 20 + index + 1));
    const bytes = writeUniformData(layout, `wgsl-${kind}`, { prefix: 0.5, matrices: values, tail: 0x87654321 });
    const reflected = reflectWgsl(emitWgslStruct(layout, kind), layout.name, kind);
    const members = reflected.members!;
    const columnAlignment = rows === 2 ? 8 : 16;
    const columnStride = roundUp(rows * 4, columnAlignment);
    const arrayAlignment = kind === "uniform" ? 16 : columnAlignment;
    const arrayStride = roundUp(columns * columnStride, arrayAlignment);
    expect(members.matrices.offset).toBe(roundUp(4, arrayAlignment));
    expect(members.matrices.type.stride).toBe(arrayStride);
    expect(members.tail.offset).toBe(members.matrices.offset + 2 * arrayStride);
    const view = readView(bytes);
    for (let matrix = 0; matrix < 2; matrix += 1) {
      const element = arrayElement(members.matrices.type, matrix);
      expect(element.type.stride).toBe(columnStride);
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
          const offset = members.matrices.offset + element.offset + column * element.type.stride! + row * 4;
          expect(view.getFloat32(offset, true)).toBe(values[matrix][column * rows + row]);
        }
      }
    }
    expect(view.getUint32(members.tail.offset, true)).toBe(0x87654321);
  });

  it("keeps caller-owned staging boundaries and rejects malformed writes atomically", () => {
    const target = new Uint8Array(224).fill(0xa5);
    const image = writeUniformData(complexLayout, "glsl-std140", complexValue, target, 16);
    expect(image).toHaveLength(192);
    expect([...target.subarray(0, 16)]).toEqual(Array(16).fill(0xa5));
    expect([...target.subarray(208)]).toEqual(Array(16).fill(0xa5));
    expect(readView(target).getUint32(16 + 176, true)).toBe(0xfedcba98);
    const before = target.slice();
    expect(() => writeUniformData(complexLayout, "glsl-std140", { ...complexValue, weights: [0.5] }, target, 16)).toThrow(/expected 2 values/);
    expect(() => writeUniformData(complexLayout, "glsl-std140", { ...complexValue, tail: -1 }, target, 16)).toThrow(/unsigned 32-bit integer/);
    expect(target).toEqual(before);
  });

  it("rejects duplicate names and invalid or oversized array lengths in every declaration path", () => {
    const duplicate: UniformBlockLayout = {
      name: "AuraObject", group: 3, binding: 0,
      members: [{ name: "same", type: "f32" }, { name: "same", type: "u32" }]
    };
    expect(() => std140Offsets(duplicate)).toThrow(/duplicate/i);
    expect(() => emitGlslBlock(duplicate)).toThrow(/duplicate/i);
    expect(() => emitWgslStruct(duplicate, "uniform")).toThrow(/duplicate/i);
    for (const length of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const invalid: UniformBlockLayout = {
        name: "AuraObject", group: 3, binding: 0,
        members: [{ name: "array", type: "f32", arrayLength: length }]
      };
      expect(() => std140Offsets(invalid)).toThrow();
      expect(() => emitGlslBlock(invalid)).toThrow();
      expect(() => emitWgslStruct(invalid, "uniform")).toThrow();
    }
  });

  it("derives a valid WGSL storage layout even when the same schema exceeds the std140 byte limit", () => {
    const layout: UniformBlockLayout = {
      name: "AuraObject", group: 3, binding: 0,
      members: [{ name: "values", type: "f32", arrayLength: 300_000_000 }]
    };
    expect(deriveUniformDataLayout(layout, "wgsl-storage").size).toBe(1_200_000_000);
    expect(() => std140Offsets(layout)).toThrow(/byte-size limit/);
    expect(() => deriveUniformDataLayout(layout, "wgsl-uniform")).toThrow(/byte-size limit/);
  });

  it("supports the portable material struct and its existing aura instance name", () => {
    const layout: UniformBlockLayout = {
      name: "Aura3DPortableUniforms", group: 0, binding: 0,
      members: [{ name: "enabled", type: "bool" }, { name: "weights", type: "f32", arrayLength: 2 }]
    };
    const source = emitWgslStruct(layout, "uniform", { variableName: "aura" });
    expect(source).toContain("@group(0) @binding(0) var<uniform> aura: Aura3DPortableUniforms;");
    const reflected = reflectWgsl(source, layout.name, "uniform");
    const bytes = writeUniformData(layout, "wgsl-uniform", { enabled: true, weights: [0.5, 0.75] });
    const second = arrayElement(reflected.members!.weights.type, 1);
    expect(readView(bytes).getUint32(reflected.members!.enabled.offset, true)).toBe(1);
    expect(readView(bytes).getFloat32(reflected.members!.weights.offset + second.offset, true)).toBe(0.75);
  });

  it("round-trips nested array field types without reversing their dimensions or byte addressing", () => {
    const schema: ShaderDataType = { kind: "array", length: 2, element: { kind: "array", length: 3, element: "u32" } };
    const device = new MockRenderDevice();
    const original = new UniformBlock(device, "Original", [["values", schema]]);
    const restored = new UniformBlock(device, "Restored", [["values", original.layout.fields[0].type]]);
    const values = [[1, 2, 3], [4, 5, 0xffffffff]];
    original.set("values", values);
    restored.set("values", values);
    original.upload();
    restored.upload();
    expect(original.layout.fields[0].type).toBe("uint[2][3]");
    expect(device.readBuffer(restored.buffer)).toEqual(device.readBuffer(original.buffer));
    expect(readView(device.readBuffer(restored.buffer)).getUint32(80, true)).toBe(0xffffffff);
    original.dispose();
    restored.dispose();
  });
});
