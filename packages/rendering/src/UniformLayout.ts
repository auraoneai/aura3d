export type UniformFieldType = "float" | "vec2" | "vec3" | "vec4" | "mat4";

export interface UniformFieldDescriptor {
  readonly name: string;
  readonly type: UniformFieldType;
  readonly arrayLength?: number;
}

export interface UniformFieldLayout extends UniformFieldDescriptor {
  readonly offset: number;
  readonly byteLength: number;
  readonly alignment: number;
}

export class UniformLayout {
  public readonly fields: readonly UniformFieldLayout[];
  public readonly byteLength: number;

  constructor(fields: readonly UniformFieldDescriptor[]) {
    if (fields.length === 0) {
      throw new Error("UniformLayout requires at least one field");
    }
    const seen = new Set<string>();
    const layouts: UniformFieldLayout[] = [];
    let offset = 0;

    for (const field of fields) {
      if (!field.name.trim()) {
        throw new Error("Uniform field name is required");
      }
      if (seen.has(field.name)) {
        throw new Error(`Duplicate uniform field: ${field.name}`);
      }
      seen.add(field.name);
      const arrayLength = field.arrayLength ?? 1;
      if (!Number.isInteger(arrayLength) || arrayLength <= 0) {
        throw new Error(`Uniform field ${field.name} arrayLength must be a positive integer`);
      }
      const alignment = fieldAlignment(field.type, arrayLength);
      offset = alignTo(offset, alignment);
      const byteLength = fieldByteLength(field.type, arrayLength);
      layouts.push({ ...field, arrayLength, offset, byteLength, alignment });
      offset += byteLength;
    }

    this.fields = layouts;
    this.byteLength = alignTo(offset, 16);
  }

  getField(name: string): UniformFieldLayout {
    const field = this.fields.find((candidate) => candidate.name === name);
    if (!field) {
      throw new Error(`Uniform field is not in layout: ${name}`);
    }
    return field;
  }

  pack(values: Readonly<Record<string, number | readonly number[] | Float32Array>>): Float32Array {
    const output = new Float32Array(this.byteLength / 4);
    for (const field of this.fields) {
      const value = values[field.name];
      if (value === undefined) {
        throw new Error(`Missing uniform value for ${field.name}`);
      }
      const numbers = typeof value === "number" ? [value] : Array.from(value);
      const required = scalarCount(field.type) * (field.arrayLength ?? 1);
      if (numbers.length !== required) {
        throw new Error(`Uniform ${field.name} requires ${required} scalar values, got ${numbers.length}`);
      }
      if (!numbers.every(Number.isFinite)) {
        throw new Error(`Uniform ${field.name} must contain finite values`);
      }
      const scalars = scalarCount(field.type);
      if ((field.arrayLength ?? 1) > 1) {
        const stride = fieldArrayStride(field.type);
        for (let index = 0; index < (field.arrayLength ?? 1); index += 1) {
          output.set(numbers.slice(index * scalars, (index + 1) * scalars), (field.offset + index * stride) / 4);
        }
      } else {
        output.set(numbers, field.offset / 4);
      }
    }
    return output;
  }
}

function fieldAlignment(type: UniformFieldType, arrayLength: number): number {
  if (arrayLength > 1) {
    return 16;
  }
  switch (type) {
    case "float":
      return 4;
    case "vec2":
      return 8;
    case "vec3":
    case "vec4":
    case "mat4":
      return 16;
  }
}

function fieldByteLength(type: UniformFieldType, arrayLength: number): number {
  const base = fieldArrayStride(type);
  return arrayLength > 1 ? base * arrayLength : type === "mat4" ? 64 : scalarCount(type) * 4;
}

function fieldArrayStride(type: UniformFieldType): number {
  return alignTo(type === "mat4" ? 64 : scalarCount(type) * 4, 16);
}

function scalarCount(type: UniformFieldType): number {
  switch (type) {
    case "float":
      return 1;
    case "vec2":
      return 2;
    case "vec3":
      return 3;
    case "vec4":
      return 4;
    case "mat4":
      return 16;
  }
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
