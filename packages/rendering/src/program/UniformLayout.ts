/**
 * PRD 11 Phase 6 groundwork (§7.3, ◦ — may land before the G-WGPU gate):
 * std140 offset computation + GLSL/WGSL block emission for the named uniform
 * blocks (`AuraFrame` binding 0, `AuraLights` binding 1, `AuraMaterial`
 * binding 2, `AuraObject` binding 3). Member lists are read from C-08
 * (`contracts/frameUniforms.ts`), so layouts track lane 01's UBOs.
 *
 * Pure groundwork — nothing consumes these emitters until the Phase-6
 * `WgslAssembler`/device work (conditional on G-WGPU).
 */

import { layoutStd140, parseStd140Type, uniformBlockGlsl, type Std140Field } from "../resources/UniformBlock";
import {
  deriveShaderDataLayout,
  writeShaderData,
  type ShaderDataLayout,
  type ShaderDataTarget,
  type ShaderDataType,
  type ShaderDataValue
} from "../webgpu/ShaderDataLayout";

type LegacyUniformMemberType = "f32" | "vec2" | "vec3" | "vec4" | "mat3" | "mat4" | "i32" | "u32";
export type UniformMemberType =
  | ShaderDataType
  | "float" | "int" | "uint"
  | `${"" | "i" | "u" | "b"}vec${2 | 3 | 4}`
  | `mat${2 | 3 | 4}`
  | `mat${2 | 3 | 4}x${2 | 3 | 4}`;

export type UniformMember = {
  readonly name: string;
  readonly type: UniformMemberType;
  readonly arrayLength?: number;
};

export interface UniformBlockLayout {
  readonly name: string;
  readonly group: number;
  readonly binding: number;
  readonly members: readonly UniformMember[];
}

// std140 base alignments (in multiples of 4-byte words → bytes below).
const ALIGN: Readonly<Record<LegacyUniformMemberType, number>> = {
  f32: 4, i32: 4, u32: 4,
  vec2: 8, vec3: 16, vec4: 16,
  mat3: 16, // column-aligned: 3 columns × vec4 stride
  mat4: 16
};

const SIZE: Readonly<Record<LegacyUniformMemberType, number>> = {
  f32: 4, i32: 4, u32: 4,
  vec2: 8, vec3: 12, vec4: 16,
  mat3: 48, // 3 columns, each padded to 16
  mat4: 64
};

function alignTo(offset: number, alignment: number): number {
  return Math.ceil(offset / alignment) * alignment;
}

/** std140 field layout: scalars/vectors at their base alignment; arrays and
 * matrices stride at 16 bytes; struct size padded to 16. */
export function std140Offsets(layout: UniformBlockLayout): { readonly size: number; readonly offsets: Readonly<Record<string, number>> } {
  const result = layoutStd140(uniformFields(layout));
  for (const field of result.fields) {
    // Arrays and matrices take a 16-byte base alignment in std140.
    const type = field.layout.type;
    if (typeof type !== "string" && (type.kind === "array" || type.kind === "matrix") && field.offset % ALIGN.vec4 !== 0) {
      throw new RangeError(`Invalid std140 alignment for ${field.name}`);
    }
  }
  return { size: alignTo(result.byteSize, SIZE.vec4), offsets: Object.fromEntries(result.offsets) };
}

function uniformFields(layout: UniformBlockLayout): readonly Std140Field[] {
  return layout.members.map((member): Std140Field => {
    let type = parseStd140Type(member.type);
    if (member.arrayLength !== undefined) {
      if (!Number.isSafeInteger(member.arrayLength) || member.arrayLength <= 0) {
        throw new RangeError(`std140 member ${member.name} arrayLength must be a positive integer`);
      }
      type = { kind: "array", element: type, length: member.arrayLength };
    }
    return [member.name, type];
  });
}

function logicalUniformLayout(layout: UniformBlockLayout): ShaderDataLayout {
  const fields = uniformFields(layout).map(([name, type]) => ({ name, type: parseStd140Type(type) }));
  return deriveShaderDataLayout({ kind: "struct", fields }, "glsl-std430");
}

function wgslType(type: ShaderDataType): ShaderDataType {
  if (typeof type === "string") return type === "bool" ? "u32" : type;
  switch (type.kind) {
    case "vector": return { ...type, element: type.element === "bool" ? "u32" : type.element };
    case "matrix": return type;
    case "array": return { ...type, element: wgslType(type.element) };
    case "struct": return { ...type, fields: type.fields.map((field) => ({ ...field, type: wgslType(field.type) })) };
  }
}

function selectedUniformLayout(logical: ShaderDataLayout, target: ShaderDataTarget): ShaderDataLayout {
  if (target === "glsl-std430") return logical;
  const type = target === "wgsl-uniform" || target === "wgsl-storage" ? wgslType(logical.type) : logical.type;
  return deriveShaderDataLayout(type, target);
}

export function deriveUniformDataLayout(layout: UniformBlockLayout, target: ShaderDataTarget): ShaderDataLayout {
  return selectedUniformLayout(logicalUniformLayout(layout), target);
}

function booleanSequence(value: unknown, length: number): ArrayLike<unknown> | undefined {
  if (!value || typeof value !== "object" || value instanceof DataView || (value as ArrayLike<unknown>).length !== length) return undefined;
  return value as ArrayLike<unknown>;
}

function lowerBooleanValues(type: ShaderDataType, value: unknown, path: string): unknown {
  if (typeof type === "string") {
    if (type !== "bool") return value;
    if (value === true || value === 1) return 1;
    if (value === false || value === 0) return 0;
    throw new TypeError(`${path}: expected true, false, 0, or 1`);
  }
  switch (type.kind) {
    case "vector": {
      if (type.element !== "bool") return value;
      const values = booleanSequence(value, type.length);
      return values ? Array.from({ length: type.length }, (_, index) => lowerBooleanValues("bool", values[index], `${path}[${index}]`)) : value;
    }
    case "matrix": return value;
    case "array": {
      const values = booleanSequence(value, type.length);
      return values ? Array.from({ length: type.length }, (_, index) => lowerBooleanValues(type.element, values[index], `${path}[${index}]`)) : value;
    }
    case "struct": {
      if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)) return value;
      const source = value as Record<string, unknown>;
      const result: Record<string, unknown> = Object.create(null);
      for (const key of Object.keys(source)) {
        const field = type.fields.find((candidate) => candidate.name === key);
        result[key] = field ? lowerBooleanValues(field.type, source[key], `${path}.${key}`) : source[key];
      }
      return result;
    }
  }
}

export function writeUniformData(
  layout: UniformBlockLayout,
  target: ShaderDataTarget,
  value: ShaderDataValue,
  output?: ArrayBuffer | ArrayBufferView,
  byteOffset = 0
): Uint8Array {
  const logical = logicalUniformLayout(layout);
  const selected = selectedUniformLayout(logical, target);
  const data = target === "wgsl-uniform" || target === "wgsl-storage"
    ? lowerBooleanValues(logical.type, value, "$") as ShaderDataValue
    : value;
  return writeShaderData(selected, data, output, byteOffset);
}

/** `layout(std140) uniform <name> { <type> <name>[n]; ... };` */
export function emitGlslBlock(layout: UniformBlockLayout): string {
  return uniformBlockGlsl(layout.name, uniformFields(layout));
}

/** WGSL struct + `@group(g) @binding(b) var<uniform|storage,read>` declaration. */
export function emitWgslStruct(layout: UniformBlockLayout, kind: "uniform" | "storage", options: { readonly variableName?: string } = {}): string {
  if (kind !== "uniform" && kind !== "storage") throw new RangeError(`Unknown WGSL address space: ${String(kind)}`);
  if (!Number.isSafeInteger(layout.group) || layout.group < 0 || !Number.isSafeInteger(layout.binding) || layout.binding < 0) {
    throw new RangeError("WGSL group and binding must be nonnegative safe integers");
  }
  const variableName = options.variableName ?? layout.name.charAt(0).toLowerCase() + layout.name.slice(1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(layout.name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variableName)
    || layout.name.startsWith("__") || variableName.startsWith("__")) {
    throw new RangeError("WGSL struct and variable names must be shader identifiers");
  }
  const data = deriveUniformDataLayout(layout, kind === "uniform" ? "wgsl-uniform" : "wgsl-storage");
  const definitions: string[] = [];
  let nextType = 0;
  type EmittedType = { readonly text: string; readonly alignment: number; readonly size: number };

  function emit(typeLayout: ShaderDataLayout, name?: string): EmittedType {
    const type = typeLayout.type;
    if (typeof type === "string") return { text: type, alignment: typeLayout.alignment, size: typeLayout.size };
    if (type.kind === "vector") {
      return { text: `vec${type.length}<${type.element}>`, alignment: typeLayout.alignment, size: typeLayout.size };
    }
    if (type.kind === "matrix") {
      return { text: `mat${type.columns}x${type.rows}<f32>`, alignment: typeLayout.alignment, size: typeLayout.size };
    }
    if (type.kind === "array") {
      const element = emit(typeLayout.element!);
      let elementName = element.text;
      let stride = alignTo(element.size, element.alignment);
      if (stride !== typeLayout.stride) {
        if (typeLayout.stride! < element.size) throw new Error("WGSL array stride is smaller than its element");
        const wrapper = `${layout.name}_ArrayElement${nextType++}`;
        definitions.push(`struct ${wrapper} {\n  @size(${typeLayout.stride}) value: ${elementName},\n};`);
        elementName = wrapper;
        stride = alignTo(typeLayout.stride!, element.alignment);
      }
      if (stride !== typeLayout.stride) throw new Error("Cannot represent the requested WGSL array stride");
      return { text: `array<${elementName}, ${type.length}>`, alignment: element.alignment, size: stride * type.length };
    }

    const structName = name ?? `${layout.name}_Struct${nextType++}`;
    const members = typeLayout.members!.map((member) => ({ member, emitted: emit(member.layout) }));
    const alignments = members.map(({ member, emitted }) => Math.max(member.layout.alignment, emitted.alignment));
    if (Math.max(...alignments) < typeLayout.alignment) alignments[0] = typeLayout.alignment;
    let offset = 0;
    let alignment = 1;
    const lines = members.map(({ member, emitted }, index) => {
      const memberAlignment = alignments[index];
      offset = alignTo(offset, memberAlignment);
      if (offset !== member.offset || emitted.size !== member.layout.size) throw new Error(`Cannot represent WGSL layout for ${member.name}`);
      offset += emitted.size;
      alignment = Math.max(alignment, memberAlignment);
      const attribute = memberAlignment > emitted.alignment ? `@align(${memberAlignment}) ` : "";
      return `  ${attribute}${member.name}: ${emitted.text},`;
    });
    const size = alignTo(offset, alignment);
    if (size !== typeLayout.size || (kind === "uniform" && alignment < ALIGN.vec4)) {
      throw new Error(`Cannot represent WGSL struct layout for ${structName}`);
    }
    definitions.push(`struct ${structName} {\n${lines.join("\n")}\n};`);
    return { text: structName, alignment, size };
  }

  emit(data, layout.name);
  const decl = kind === "uniform"
    ? `var<uniform> ${variableName}: ${layout.name};`
    : `var<storage, read> ${variableName}: ${layout.name};`;
  return `${definitions.join("\n")}\n@group(${layout.group}) @binding(${layout.binding}) ${decl}`;
}

/* ------------------------------------------------------------------ */
/* Named block layouts (C-08 member lists).                             */
/* ------------------------------------------------------------------ */

import { AURA_FRAME_BLOCK } from "../contracts/frameUniforms";

/** AuraFrame, binding 0 — field order frozen by C-08. */
export const AURA_FRAME_LAYOUT: UniformBlockLayout = {
  name: "AuraFrame",
  group: 0,
  binding: 0,
  members: AURA_FRAME_BLOCK.map(([name, type]) => ({ name, type: type as UniformMember["type"] }))
};

/**
 * AuraLights, binding 1 — layout owned by PRD 02 inside the C-10 light UBO;
 * mirrors `LightUniforms.layout` (lane 02): `u_lightCount` then
 * `u_lightData[96]` (16 lights × 6 vec4, 24 floats/light).
 */
export const AURA_LIGHTS_LAYOUT: UniformBlockLayout = {
  name: "AuraLights",
  group: 1,
  binding: 0,
  members: [
    { name: "u_lightCount", type: "f32" },
    { name: "u_lightData", type: "vec4", arrayLength: 16 * 6 }
  ]
};
