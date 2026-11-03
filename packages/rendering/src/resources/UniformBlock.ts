/** Byte-accurate std140 uniform buffers and the AuraFrame uniform block. */

import type { RenderDevice, RenderBuffer } from "../RenderDevice";
import { RenderDeviceError } from "../RenderDevice";
import { AURA_FRAME_BLOCK, type FrameUniformsLike } from "../contracts/frameUniforms";
import type { FrameCamera } from "../contracts/frameGraph";
import {
  deriveShaderDataLayout,
  writeShaderData,
  type ShaderDataLayout,
  type ShaderDataScalar,
  type ShaderDataType,
  type ShaderDataValue
} from "../webgpu/ShaderDataLayout";

/** Legacy GLSL names and recursively typed structures/arrays are both accepted. */
export type Std140Field = readonly [name: string, type: string | ShaderDataType];

export interface Std140FieldLayout {
  readonly name: string;
  /** GLSL type label; structured fields expose their full schema through `layout.type`. */
  readonly type: string;
  readonly offset: number;
  /** Field footprint in 4-byte words, including matrix/array padding. */
  readonly floats: number;
  readonly layout: ShaderDataLayout;
}

export interface Std140Layout {
  readonly byteSize: number;
  readonly fields: readonly Std140FieldLayout[];
  readonly offsets: ReadonlyMap<string, number>;
}

const SCALAR_GLSL: Readonly<Record<ShaderDataScalar, string>> = {
  f32: "float", i32: "int", u32: "uint", bool: "bool"
};

/** Convert the legacy GLSL field vocabulary to the common typed schema. */
export function parseStd140Type(type: string | ShaderDataType): ShaderDataType {
  if (typeof type !== "string") return type;
  const match = /^([A-Za-z][A-Za-z0-9]*)(\s*(?:\[\s*\d+\s*\]\s*)*)$/.exec(type);
  if (!match) throw new RenderDeviceError(`Unsupported std140 field type "${type}"`, "UNSUPPORTED_UNIFORM_BLOCK_FIELD", { type });
  const base = match[1];
  let result: ShaderDataType;
  const scalars: Record<string, ShaderDataScalar> = {
    float: "f32", f32: "f32", int: "i32", i32: "i32", uint: "u32", u32: "u32", bool: "bool"
  };
  if (Object.prototype.hasOwnProperty.call(scalars, base)) result = scalars[base];
  else {
    const vector = /^(b|i|u)?vec([234])$/.exec(base);
    const matrix = /^mat([234])(?:x([234]))?$/.exec(base);
    if (vector) {
      const element: ShaderDataScalar = vector[1] === "i" ? "i32" : vector[1] === "u" ? "u32" : vector[1] === "b" ? "bool" : "f32";
      result = { kind: "vector", element, length: Number(vector[2]) as 2 | 3 | 4 };
    } else if (matrix) {
      result = { kind: "matrix", columns: Number(matrix[1]) as 2 | 3 | 4, rows: Number(matrix[2] ?? matrix[1]) as 2 | 3 | 4 };
    } else {
      throw new RenderDeviceError(`Unsupported std140 field type "${type}"`, "UNSUPPORTED_UNIFORM_BLOCK_FIELD", { type });
    }
  }
  const dimensions = [...match[2].matchAll(/\[\s*(\d+)\s*\]/g)].map((entry) => Number(entry[1]));
  for (let i = dimensions.length - 1; i >= 0; i -= 1) result = { kind: "array", element: result, length: dimensions[i] };
  return result;
}

function glslTypeLabel(type: ShaderDataType): string {
  if (typeof type === "string") return SCALAR_GLSL[type];
  switch (type.kind) {
    case "vector": return `${type.element === "f32" ? "" : type.element === "i32" ? "i" : type.element === "u32" ? "u" : "b"}vec${type.length}`;
    case "matrix": return type.columns === type.rows ? `mat${type.columns}` : `mat${type.columns}x${type.rows}`;
    case "array": {
      const dimensions = [type.length];
      let element = type.element;
      while (typeof element !== "string" && element.kind === "array") {
        dimensions.push(element.length);
        element = element.element;
      }
      return `${glslTypeLabel(element)}${dimensions.map((length) => `[${length}]`).join("")}`;
    }
    case "struct": return "struct";
  }
}

/** Compute std140 offsets, recursively including arrays and structures. */
export function layoutStd140(fields: readonly Std140Field[]): Std140Layout {
  const offsets = new Map<string, number>();
  for (const [name] of fields) {
    if (offsets.has(name)) throw new RenderDeviceError(`Duplicate uniform block field "${name}"`, "UNIFORM_BLOCK_DUPLICATE_FIELD", { name });
    offsets.set(name, 0);
  }
  if (fields.length === 0) return { byteSize: 0, fields: [], offsets };
  const struct = deriveShaderDataLayout({ kind: "struct", fields: fields.map(([name, type]) => ({ name, type: parseStd140Type(type) })) }, "glsl-std140");
  const laidOut = struct.members!.map((member, index): Std140FieldLayout => {
    offsets.set(member.name, member.offset);
    const suppliedType = fields[index][1];
    return { name: member.name, type: typeof suppliedType === "string" ? suppliedType : glslTypeLabel(member.layout.type), offset: member.offset, floats: member.layout.size / 4, layout: member.layout };
  });
  return { byteSize: struct.size, fields: laidOut, offsets };
}

/**
 * Emit GLSL declarations from exactly the same schema as the std140 layout.
 * GLSL ES 3.00 has no arrays-of-arrays, so each inner array is wrapped in a
 * generated struct. Access an inner element as `field[i].value[j]`.
 */
export function uniformBlockGlsl(name: string, fields: readonly Std140Field[]): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new RenderDeviceError("Invalid uniform block name", "UNIFORM_BLOCK_NAME", { name });
  const layout = layoutStd140(fields);
  const definitions: string[] = [];
  let nextStruct = 0;
  function declaration(type: ShaderDataType, field: string): string {
    if (typeof type !== "string" && type.kind === "array") {
      if (typeof type.element !== "string" && type.element.kind === "array") {
        const wrapper = `${name}_Array${nextStruct++}`;
        const inner = declaration(type.element, "value");
        definitions.push(`struct ${wrapper} {\n  ${inner};\n};`);
        return `${wrapper} ${field}[${type.length}]`;
      }
      return `${declaration(type.element, field)}[${type.length}]`;
    }
    let glsl: string;
    if (typeof type === "string") glsl = SCALAR_GLSL[type];
    else if (type.kind === "vector") {
      const prefix = type.element === "f32" ? "" : type.element === "i32" ? "i" : type.element === "u32" ? "u" : "b";
      glsl = `${prefix}vec${type.length}`;
    } else if (type.kind === "matrix") {
      glsl = type.columns === type.rows ? `mat${type.columns}` : `mat${type.columns}x${type.rows}`;
    } else if (type.kind === "struct") {
      glsl = `${name}_Struct${nextStruct++}`;
      const body = type.fields.map((member) => `  ${declaration(member.type, member.name)};`).join("\n");
      definitions.push(`struct ${glsl} {\n${body}\n};`);
    } else throw new RenderDeviceError("Invalid uniform block field type", "UNSUPPORTED_UNIFORM_BLOCK_FIELD");
    return `${glsl} ${field}`;
  }
  const body = layout.fields.map((field) => `  ${declaration(field.layout.type, field.name)};`).join("\n");
  return `${definitions.length ? `${definitions.join("\n")}\n` : ""}layout(std140) uniform ${name} {\n${body}\n};`;
}

/**
 * std140 uniform buffer with independently owned CPU staging. `data` remains a
 * float view for existing float-only callers; integer/bool fields must be set
 * with `set`, which encodes the corresponding integer bits into the same bytes.
 */
export class UniformBlock {
  public readonly layout: Std140Layout;
  public readonly buffer: RenderBuffer;
  public readonly binding: number;
  public readonly data: Float32Array;
  private readonly bytes: Uint8Array;
  private readonly trackPartialUpdates: boolean;
  private readonly removeLifecycleListeners: (() => void)[] = [];
  private hasLossAndRestoreListeners = false;
  private uploadedBytes: Uint8Array | undefined;
  private uploadedGeneration: number | undefined;
  private uploadEpoch = 0;
  private uploading = false;
  private disposed = false;

  constructor(
    private readonly device: RenderDevice,
    public readonly name: string,
    fields: readonly Std140Field[],
    options: {
      readonly binding?: number;
      /**
       * Coalesce changed four-byte words into a partial upload. The first upload
       * and any invalidated upload write the entire block. Opt in only while
       * this block exclusively owns writes to `buffer`; after any external
       * device/native write, call `invalidateUploadCache()` before uploading.
       * Direct changes to `data` are detected automatically.
       */
      readonly trackPartialUpdates?: boolean;
    } = {}
  ) {
    this.layout = layoutStd140(fields);
    this.binding = options.binding ?? 0;
    if (!Number.isSafeInteger(this.binding) || this.binding < 0) throw new RenderDeviceError("Invalid uniform block binding", "UNIFORM_BLOCK_BINDING", { binding: this.binding });
    this.bytes = new Uint8Array(this.layout.byteSize);
    this.data = new Float32Array(this.bytes.buffer);
    this.buffer = device.createBuffer("uniform", this.layout.byteSize);
    this.trackPartialUpdates = options.trackPartialUpdates === true;
    if (this.trackPartialUpdates) {
      try {
        const invalidate = (): void => this.forgetUploadedBytes();
        if (device.onDeviceLost) this.removeLifecycleListeners.push(device.onDeviceLost(invalidate));
        if (device.onDeviceRestored) this.removeLifecycleListeners.push(device.onDeviceRestored(invalidate));
        this.hasLossAndRestoreListeners = !!device.onDeviceLost && !!device.onDeviceRestored;
      } catch (error) {
        for (const remove of this.removeLifecycleListeners) {
          try { remove(); } catch { /* Preserve the registration error. */ }
        }
        try { this.buffer.dispose(); } catch { /* Preserve the registration error. */ }
        throw error;
      }
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw new RenderDeviceError(`Uniform block "${this.name}" is disposed`, "UNIFORM_BLOCK_DISPOSED");
  }

  /** Set the complete field: scalar, vector, column-major matrix, array or struct. */
  set(name: string, value: ShaderDataValue): void {
    this.assertAlive();
    const field = this.layout.fields.find((entry) => entry.name === name);
    if (!field) throw new RenderDeviceError(`Unknown uniform block field "${name}"`, "UNIFORM_BLOCK_UNKNOWN_FIELD", { block: this.name, field: name });
    // The original API took ArrayLike<number> even for scalar fields.
    if (typeof field.layout.type === "string" && value != null && typeof value === "object" && "length" in value) {
      const scalarValues = value as ArrayLike<number | boolean>;
      if (scalarValues.length === 1) value = scalarValues[0];
    }
    writeShaderData(field.layout, value, this.bytes, field.offset);
  }

  /** Force the next tracked upload to replace the whole buffer. */
  invalidateUploadCache(): void {
    this.assertAlive();
    this.forgetUploadedBytes();
  }

  private forgetUploadedBytes(): void {
    this.uploadedBytes = undefined;
    this.uploadedGeneration = undefined;
    this.uploadEpoch += 1;
  }

  upload(): void {
    this.assertAlive();
    if (!this.trackPartialUpdates) {
      this.device.updateBuffer(this.buffer, 0, this.bytes);
      return;
    }
    if (this.uploading) throw new RenderDeviceError(`Uniform block "${this.name}" upload is reentrant`, "UNIFORM_BLOCK_UPLOAD_REENTRANT");

    const generation = this.device.generation;
    const hasGeneration = typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 0;
    // A device without either a stable generation or both lifecycle events
    // cannot prove that a previously uploaded buffer survived a context loss.
    if ((!hasGeneration && !this.hasLossAndRestoreListeners)
      || this.uploadedGeneration !== generation
      || this.device.contextLost || this.device.disposed || this.buffer.disposed
      || (this.device as RenderDevice & { isDeviceLost?: () => boolean }).isDeviceLost?.()) {
      this.forgetUploadedBytes();
    }

    let first = 0;
    let end = this.bytes.length;
    if (this.uploadedBytes) {
      while (first < end && this.bytes[first] === this.uploadedBytes[first]) first += 1;
      if (first === end) return;
      while (end > first && this.bytes[end - 1] === this.uploadedBytes[end - 1]) end -= 1;
      // Both WebGL2 and WebGPU accept aligned subranges; std140 sizes are a
      // multiple of four. Include unchanged neighbors instead of padding.
      first = Math.floor(first / 4) * 4;
      end = Math.ceil(end / 4) * 4;
    }
    const sent = this.bytes.slice(first, end);
    const epoch = this.uploadEpoch;
    this.uploading = true;
    try {
      this.device.updateBuffer(this.buffer, first, sent);
      if (this.uploadEpoch !== epoch || this.device.generation !== generation || this.device.contextLost
        || this.device.disposed || this.buffer.disposed) {
        this.forgetUploadedBytes();
      } else {
        if (!this.uploadedBytes) this.uploadedBytes = new Uint8Array(this.bytes.length);
        this.uploadedBytes.set(sent, first);
        this.uploadedGeneration = generation;
      }
    } catch (error) {
      // A failed backend call can already have written some bytes.
      this.forgetUploadedBytes();
      throw error;
    } finally {
      this.uploading = false;
    }
  }

  bind(): void {
    this.assertAlive();
    this.device.bindUniformBuffer?.(this.buffer, this.binding);
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.forgetUploadedBytes();
      let cleanupError: unknown;
      for (const remove of this.removeLifecycleListeners) {
        try { remove(); } catch (error) { cleanupError ??= error; }
      }
      try { this.buffer.dispose(); } catch (error) { cleanupError ??= error; }
      if (cleanupError !== undefined) throw cleanupError;
    }
  }
}

/** AuraFrame binding point (C-08 frozen). */
export const AURA_FRAME_BINDING = 0;
/** AuraLights binding point; layout owned by PRD 02 inside the C-08 name. */
export const AURA_LIGHTS_BINDING = 1;

/**
 * C-08 real `FrameUniformsLike`: the `AuraFrame` block at binding 0. `update()`
 * packs the frozen field order and uploads once; `viewport` must be refreshed by
 * the caller per view so `u_resolutionFarTime.xy` reports render pixels.
 */
export class FrameUniforms implements FrameUniformsLike {
  public readonly block: UniformBlock;
  /** Render-target pixels for `u_resolutionFarTime.xy`; caller sets per view. */
  public viewport: { width: number; height: number } = { width: 0, height: 0 };

  constructor(device: RenderDevice, options: { readonly binding?: number } = {}) {
    this.block = new UniformBlock(device, "AuraFrame", AURA_FRAME_BLOCK, {
      binding: options.binding ?? AURA_FRAME_BINDING
    });
  }

  get buffer(): RenderBuffer | null {
    return this.block.buffer;
  }

  get byteSize(): number {
    return this.block.layout.byteSize;
  }

  /** GLSL declaration for generated programs (`layout(std140)`; bound at link). */
  glsl(): string {
    return uniformBlockGlsl("AuraFrame", AURA_FRAME_BLOCK);
  }

  update(camera: FrameCamera, timeSeconds: number, exposure: number, flags: number): void {
    this.block.set("u_view", camera.viewMatrix);
    this.block.set("u_projection", camera.projectionMatrix);
    this.block.set("u_viewProjection", camera.viewProjectionMatrix);
    this.block.set("u_prevViewProjection", camera.previousViewProjectionMatrix ?? camera.viewProjectionMatrix);
    this.block.set("u_cameraPositionNear", [camera.position[0], camera.position[1], camera.position[2], camera.near]);
    this.block.set("u_resolutionFarTime", [this.viewport.width, this.viewport.height, camera.far, timeSeconds]);
    const orthoBit = camera.projection === "orthographic" ? 1 : 0;
    this.block.set("u_exposureFlags", [exposure, flags | orthoBit, 0, 0]);
    this.block.upload();
  }

  bind(): void {
    this.block.bind();
  }

  dispose(): void {
    this.block.dispose();
  }
}
