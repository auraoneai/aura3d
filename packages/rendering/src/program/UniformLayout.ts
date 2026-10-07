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

export type UniformMember = {
  readonly name: string;
  readonly type: "f32" | "vec2" | "vec3" | "vec4" | "mat3" | "mat4" | "i32" | "u32";
  readonly arrayLength?: number;
};

export interface UniformBlockLayout {
  readonly name: "AuraFrame" | "AuraLights" | "AuraMaterial" | "AuraObject";
  readonly group: 0 | 1 | 2 | 3;
  readonly binding: number;
  readonly members: readonly UniformMember[];
}

// std140 base alignments (in multiples of 4-byte words → bytes below).
const ALIGN: Readonly<Record<UniformMember["type"], number>> = {
  f32: 4, i32: 4, u32: 4,
  vec2: 8, vec3: 16, vec4: 16,
  mat3: 16, // column-aligned: 3 columns × vec4 stride
  mat4: 16
};

const SIZE: Readonly<Record<UniformMember["type"], number>> = {
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
  const offsets: Record<string, number> = {};
  let offset = 0;
  for (const member of layout.members) {
    const n = member.arrayLength ?? 1;
    if (!Number.isInteger(n) || n <= 0) {
      throw new RangeError(`std140 member ${member.name} arrayLength must be a positive integer`);
    }
    const isArray = n > 1;
    // Arrays and matrices take a 16-byte base alignment in std140.
    const alignment = isArray || member.type === "mat3" || member.type === "mat4"
      ? 16
      : ALIGN[member.type];
    const stride = isArray ? 16 : SIZE[member.type];
    offset = alignTo(offset, alignment);
    offsets[member.name] = offset;
    offset += stride * n;
  }
  return { size: alignTo(offset, 16), offsets };
}

const GLSL_TYPE: Readonly<Record<UniformMember["type"], string>> = {
  f32: "float", i32: "int", u32: "uint",
  vec2: "vec2", vec3: "vec3", vec4: "vec4",
  mat3: "mat3", mat4: "mat4"
};

const WGSL_TYPE: Readonly<Record<UniformMember["type"], string>> = {
  f32: "f32", i32: "i32", u32: "u32",
  vec2: "vec2<f32>", vec3: "vec3<f32>", vec4: "vec4<f32>",
  mat3: "mat3x3<f32>", mat4: "mat4x4<f32>"
};

/** `layout(std140) uniform <name> { <type> <name>[n]; ... };` */
export function emitGlslBlock(layout: UniformBlockLayout): string {
  const lines = layout.members.map((member) => {
    const array = member.arrayLength && member.arrayLength > 1 ? `[${member.arrayLength}]` : "";
    return `  ${GLSL_TYPE[member.type]} ${member.name}${array};`;
  });
  return `layout(std140) uniform ${layout.name} {\n${lines.join("\n")}\n};`;
}

/** WGSL struct + `@group(g) @binding(b) var<uniform|storage,read>` declaration. */
export function emitWgslStruct(layout: UniformBlockLayout, kind: "uniform" | "storage"): string {
  const lines = layout.members.map((member) => {
    const type = member.arrayLength && member.arrayLength > 1
      ? `array<${WGSL_TYPE[member.type]}, ${member.arrayLength}>`
      : WGSL_TYPE[member.type];
    return `  ${member.name}: ${type},`;
  });
  const decl = kind === "uniform"
    ? `var<uniform> ${layout.name.charAt(0).toLowerCase() + layout.name.slice(1)}: ${layout.name};`
    : `var<storage, read> ${layout.name.charAt(0).toLowerCase() + layout.name.slice(1)}: ${layout.name};`;
  return `struct ${layout.name} {\n${lines.join("\n")}\n};\n@group(${layout.group}) @binding(${layout.binding}) ${decl}`;
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
