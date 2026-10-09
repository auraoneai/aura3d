/**
 * C-08 (PRD-01 §8.2, Phase 3) — std140 packer + `AuraFrame` UBO.
 *
 * `layoutStd140` computes the std140 offsets of a block field list; `UniformBlock`
 * owns a `BufferUsage:"uniform"` buffer, a Float32Array staging view and
 * `bindBufferBase` wiring through `RenderDevice.bindUniformBuffer`. `FrameUniforms`
 * is the real `FrameUniformsLike`: `AuraFrame` at binding 0 in the frozen C-08
 * order, uploaded once per `update()` via `bufferSubData`.
 *
 * The block's GLSL declaration is emitted from the same field list, so generated
 * sources can never drift from the packed layout.
 */

import type { RenderDevice, RenderBuffer } from "../RenderDevice";
import { RenderDeviceError } from "../RenderDevice";
import { AURA_FRAME_BLOCK, type FrameUniformsLike } from "../contracts/frameUniforms";
import type { FrameCamera } from "../contracts/frameGraph";

export type Std140Field = readonly [name: string, type: string];

interface Std140FieldLayout {
  readonly name: string;
  readonly type: string;
  readonly offset: number;
  /** Element stride in floats; matrices are packed column-major at 16-byte column stride. */
  readonly floats: number;
}

export interface Std140Layout {
  readonly byteSize: number;
  readonly fields: readonly Std140FieldLayout[];
  readonly offsets: ReadonlyMap<string, number>;
}

/** std140 base alignment + footprint (floats) for the block types Aura3D emits. */
function std140Shape(type: string): { align: number; floats: number; columns?: { rows: number; count: number } } {
  switch (type) {
    case "float": case "int": case "uint": case "bool":
      return { align: 4, floats: 1 };
    case "vec2": case "ivec2": case "uvec2": case "bvec2":
      return { align: 8, floats: 2 };
    case "vec3": case "ivec3": case "uvec3": case "bvec3":
      return { align: 16, floats: 3 };
    case "vec4": case "ivec4": case "uvec4": case "bvec4":
      return { align: 16, floats: 4 };
    // Matrices: C columns stored at a vec4 stride (16B) each — mat2: 2×4 floats
    // (32B), mat3: 3×4 (48B), mat4: 4×4 (64B).
    case "mat2":
      return { align: 16, floats: 8, columns: { rows: 2, count: 2 } };
    case "mat3":
      return { align: 16, floats: 12, columns: { rows: 3, count: 3 } };
    case "mat4":
      return { align: 16, floats: 16, columns: { rows: 4, count: 4 } };
    default:
      throw new RenderDeviceError(`Unsupported std140 field type "${type}"`, "UNSUPPORTED_UNIFORM_BLOCK_FIELD", { type });
  }
}

const alignUp = (offset: number, align: number): number => offset + ((align - (offset % align)) % align);

/** Compute the std140 layout of `fields` (block size is 16-aligned). */
export function layoutStd140(fields: readonly Std140Field[]): Std140Layout {
  const laidOut: Std140FieldLayout[] = [];
  const offsets = new Map<string, number>();
  let offset = 0;
  for (const [name, type] of fields) {
    const { align, floats } = std140Shape(type);
    offset = alignUp(offset, align);
    if (offsets.has(name)) {
      throw new RenderDeviceError(`Duplicate uniform block field "${name}"`, "UNIFORM_BLOCK_DUPLICATE_FIELD", { name });
    }
    offsets.set(name, offset);
    laidOut.push({ name, type, offset, floats });
    offset += floats * 4;
  }
  return { byteSize: alignUp(offset, 16), fields: laidOut, offsets };
}

/**
 * Emit `layout(std140) uniform <name> { <type> <field>; ... };` for a block.
 * T0-02: declarations carry no baked `binding=` — the device assigns the named
 * block → binding-point mapping with `gl.uniformBlockBinding` post-link.
 */
export function uniformBlockGlsl(name: string, fields: readonly Std140Field[]): string {
  const body = fields.map(([field, type]) => `  ${type} ${field};`).join("\n");
  return `layout(std140) uniform ${name} {\n${body}\n};`;
}

/**
 * A std140 uniform block: one `BufferUsage:"uniform"` buffer plus a Float32Array
 * staging image. `set*` writes into staging; `upload()` pushes it with a single
 * `bufferSubData` (PRD-01: uploaded once per view).
 */
export class UniformBlock {
  public readonly layout: Std140Layout;
  public readonly buffer: RenderBuffer;
  public readonly binding: number;
  /** CPU staging image of the whole block (float units). */
  public readonly data: Float32Array;

  constructor(
    private readonly device: RenderDevice,
    public readonly name: string,
    fields: readonly Std140Field[],
    options: { readonly binding?: number } = {}
  ) {
    this.layout = layoutStd140(fields);
    this.binding = options.binding ?? 0;
    this.data = new Float32Array(this.layout.byteSize / 4);
    this.buffer = device.createBuffer("uniform", this.layout.byteSize);
  }

  private offsetOf(name: string): number {
    const offset = this.layout.offsets.get(name);
    if (offset === undefined) {
      throw new RenderDeviceError(`Unknown uniform block field "${name}"`, "UNIFORM_BLOCK_UNKNOWN_FIELD", {
        block: this.name,
        field: name
      });
    }
    return offset;
  }

  /** Write a scalar/vector/matrix field (column-major for matrices). */
  set(name: string, value: ArrayLike<number>): void {
    const offset = this.offsetOf(name) / 4;
    const field = this.layout.fields.find((f) => f.name === name)!;
    const shape = std140Shape(field.type);
    if (shape.columns) {
      // Column stride is a vec4 (16 bytes) in std140 even for mat2/mat3.
      for (let c = 0; c < shape.columns.count; c += 1) {
        for (let r = 0; r < shape.columns.rows; r += 1) {
          this.data[offset + c * 4 + r] = value[c * shape.columns.rows + r];
        }
      }
      return;
    }
    for (let i = 0; i < shape.floats; i += 1) {
      this.data[offset + i] = value[i];
    }
  }

  /** Push the staging image to the GPU once (bufferSubData over the whole block). */
  upload(): void {
    this.device.updateBuffer(this.buffer, 0, this.data);
  }

  /** `bindBufferBase(UNIFORM_BUFFER, binding, buffer)`. */
  bind(): void {
    this.device.bindUniformBuffer?.(this.buffer, this.binding);
  }

  dispose(): void {
    this.buffer.dispose();
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
