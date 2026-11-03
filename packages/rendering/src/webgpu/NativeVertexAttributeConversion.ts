import { vertexAttributeComponentBytes, type VertexAttribute } from "../VertexFormat";

/** The CPU path is deliberately limited so a sparse index cannot force unbounded work. */
export const NATIVE_VERTEX_CONVERSION_MAX_BYTES = 16 * 1024 * 1024;
export const NATIVE_VERTEX_CONVERSION_MAX_OPERATIONS = 1_000_000;
export const NATIVE_VERTEX_CONVERSION_MAX_INDICES = 1_000_000;

export interface NativeConvertedAttribute {
  readonly shaderLocation: number;
  readonly offset: number;
  readonly format: string;
}
interface Field {
  readonly source: VertexAttribute;
  readonly offset: number;
  readonly convert: boolean;
}
export interface NativeVertexConversionPlan {
  readonly arrayStride: number;
  readonly attributes: readonly NativeConvertedAttribute[];
  readonly fields: readonly Field[];
  readonly sourceStride: number;
  readonly sourceEnd: number;
  readonly key: string;
}

export function needsNativeVertexConversion(attribute: VertexAttribute): boolean {
  return attribute.type !== "float32" &&
    ((!attribute.integer && !attribute.normalized) ||
      (attribute.components === 3 && ["int8", "uint8", "int16", "uint16"].includes(attribute.type)));
}

/** Build a packed native layout without changing the original record indices. */
export function planNativeVertexConversion(
  attributes: readonly VertexAttribute[], sourceStride: number,
  directFormat: (attribute: VertexAttribute) => string,
  nativeSize: (format: string) => number
): NativeVertexConversionPlan {
  let offset = 0, sourceEnd = 0;
  const fields: Field[] = [];
  const output: NativeConvertedAttribute[] = [];
  for (const attribute of attributes) {
    const width = vertexAttributeComponentBytes(attribute.type);
    if (!Number.isSafeInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % width !== 0 ||
      ![1, 2, 3, 4].includes(attribute.components) || (attribute.integer && (attribute.normalized || attribute.type === "float32"))) {
      throw new Error("WEBGPU_VERTEX_LAYOUT_INVALID: invalid source attribute");
    }
    sourceEnd = Math.max(sourceEnd, attribute.offset + width * attribute.components);
    const convert = needsNativeVertexConversion(attribute);
    const base = attribute.integer ? (attribute.type.startsWith("uint") ? "uint32" : "sint32") : "float32";
    const format = convert ? (attribute.components === 1 ? base : `${base}x${attribute.components}`) : directFormat(attribute);
    const size = nativeSize(format), alignment = Math.min(4, size);
    offset = Math.ceil(offset / alignment) * alignment;
    fields.push({ source: attribute, offset, convert });
    output.push({ shaderLocation: attribute.shaderLocation, offset, format });
    offset += size;
  }
  if (!Number.isSafeInteger(sourceStride) || sourceStride <= 0 || !Number.isSafeInteger(sourceEnd) || sourceEnd > sourceStride) {
    throw new Error("WEBGPU_VERTEX_LAYOUT_INVALID: invalid source stride");
  }
  const arrayStride = Math.ceil(offset / 4) * 4;
  return { arrayStride, attributes: output, fields, sourceStride, sourceEnd,
    key: JSON.stringify([sourceStride, attributes.map(a => [a.shaderLocation, a.offset, a.type, a.components, a.normalized, a.integer])]) };
}

/** Bounds must be checked by the caller before allocating or visiting source records. */
export function convertNativeVertexRecords(plan: NativeVertexConversionPlan, source: Uint8Array, count: number): Uint8Array {
  const size = plan.arrayStride * count;
  if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(size) || size > NATIVE_VERTEX_CONVERSION_MAX_BYTES ||
    count * plan.fields.length > NATIVE_VERTEX_CONVERSION_MAX_OPERATIONS ||
    (count - 1) * plan.sourceStride + plan.sourceEnd > source.byteLength) {
    throw new Error("WEBGPU_VERTEX_CONVERSION_LIMIT: conversion exceeds bounds or work limits");
  }
  const bytes = new Uint8Array(size);
  const input = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const output = new DataView(bytes.buffer);
  for (let record = 0; record < count; record += 1) {
    const from = record * plan.sourceStride, to = record * plan.arrayStride;
    for (const field of plan.fields) {
      const a = field.source, width = vertexAttributeComponentBytes(a.type);
      const start = from + a.offset, dest = to + field.offset;
      if (!field.convert) {
        bytes.set(source.subarray(start, start + width * a.components), dest);
        continue;
      }
      for (let component = 0; component < a.components; component += 1) {
        const at = start + component * width;
        let value: number;
        switch (a.type) {
          case "int8": value = input.getInt8(at); break;
          case "uint8": value = input.getUint8(at); break;
          case "int16": value = input.getInt16(at, true); break;
          case "uint16": value = input.getUint16(at, true); break;
          case "int32": value = input.getInt32(at, true); break;
          case "uint32": value = input.getUint32(at, true); break;
          default: throw new Error("WEBGPU_VERTEX_FORMAT_UNSUPPORTED: unsupported conversion source");
        }
        if (a.integer) {
          if (a.type.startsWith("uint")) output.setUint32(dest + component * 4, value, true);
          else output.setInt32(dest + component * 4, value, true);
        } else {
          if (a.normalized) {
            const max = a.type === "int8" ? 127 : a.type === "uint8" ? 255 : a.type === "int16" ? 32767 : 65535;
            value = Math.max(-1, value / max);
          }
          output.setFloat32(dest + component * 4, value, true);
        }
      }
    }
  }
  return bytes;
}
