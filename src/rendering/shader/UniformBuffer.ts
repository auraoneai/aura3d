/**
 * @module UniformBuffer
 * @description Uniform buffer with std140/std430 layout and dirty tracking.
 * Provides type-safe setters and minimal GPU uploads.
 */

import { Logger } from '../../core/Logger';
import { Vector2, Vector3, Vector4, Matrix3, Matrix4, Color } from '../../math';

const logger = Logger.create('UniformBuffer');

/**
 * Uniform buffer layout standard
 */
export enum UniformLayout {
  /** std140 layout (OpenGL) */
  Std140 = 'std140',
  /** std430 layout (OpenGL compute, Vulkan) */
  Std430 = 'std430'
}

/**
 * Uniform data types
 */
export enum UniformType {
  Float = 'float',
  Vec2 = 'vec2',
  Vec3 = 'vec3',
  Vec4 = 'vec4',
  Mat3 = 'mat3',
  Mat4 = 'mat4',
  Int = 'int',
  IVec2 = 'ivec2',
  IVec3 = 'ivec3',
  IVec4 = 'ivec4',
  Uint = 'uint',
  UVec2 = 'uvec2',
  UVec3 = 'uvec3',
  UVec4 = 'uvec4',
  Bool = 'bool'
}

/**
 * Uniform field definition
 */
export interface UniformField {
  /** Field name */
  name: string;
  /** Field type */
  type: UniformType;
  /** Array size (undefined for non-arrays) */
  arraySize?: number;
  /** Byte offset in buffer */
  offset?: number;
  /** Struct fields (for nested structs) */
  fields?: UniformField[];
}

/**
 * Uniform buffer descriptor
 */
export interface UniformBufferDescriptor {
  /** Buffer name */
  name: string;
  /** Buffer binding point */
  binding: number;
  /** Buffer layout standard */
  layout: UniformLayout;
  /** Uniform fields */
  fields: UniformField[];
}

/**
 * Layout calculation result
 */
interface LayoutInfo {
  /** Total buffer size in bytes */
  size: number;
  /** Field offsets */
  offsets: Map<string, number>;
  /** Field sizes */
  sizes: Map<string, number>;
}

/**
 * Uniform buffer with automatic layout calculation and dirty tracking.
 *
 * Features:
 * - std140/std430 layout calculation
 * - Type-safe uniform setters
 * - Dirty range tracking for minimal uploads
 * - Support for arrays and structs
 * - Zero-allocation updates
 *
 * @example
 * ```typescript
 * // Define buffer structure
 * const descriptor: UniformBufferDescriptor = {
 *   name: 'Camera',
 *   binding: 0,
 *   layout: UniformLayout.Std140,
 *   fields: [
 *     { name: 'viewMatrix', type: UniformType.Mat4 },
 *     { name: 'projectionMatrix', type: UniformType.Mat4 },
 *     { name: 'position', type: UniformType.Vec3 },
 *     { name: 'nearFar', type: UniformType.Vec2 }
 *   ]
 * };
 *
 * // Create buffer
 * const buffer = new UniformBuffer(descriptor);
 *
 * // Set uniforms
 * buffer.setMat4('viewMatrix', viewMatrix);
 * buffer.setMat4('projectionMatrix', projMatrix);
 * buffer.setVec3('position', camera.position);
 * buffer.setVec2('nearFar', new Vector2(0.1, 1000));
 *
 * // Upload to GPU
 * if (buffer.isDirty) {
 *   const data = buffer.getData();
 *   gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
 *   buffer.clearDirty();
 * }
 * ```
 */
export class UniformBuffer {
  /** Buffer descriptor */
  readonly descriptor: UniformBufferDescriptor;

  /** Buffer data */
  private data: Float32Array;

  /** Int32 view of buffer data */
  private dataInt: Int32Array;

  /** Uint32 view of buffer data */
  private dataUint: Uint32Array;

  /** Layout information */
  private layout: LayoutInfo;

  /** Dirty range start (in bytes) */
  private dirtyStart: number;

  /** Dirty range end (in bytes) */
  private dirtyEnd: number;

  /** Field name to offset map for quick lookup */
  private fieldOffsets: Map<string, number>;

  /**
   * Creates a new uniform buffer
   *
   * @param descriptor - Buffer descriptor
   */
  constructor(descriptor: UniformBufferDescriptor) {
    this.descriptor = descriptor;

    // Calculate layout
    this.layout = this.calculateLayout(descriptor.fields, descriptor.layout);
    this.fieldOffsets = this.layout.offsets;

    // Allocate buffer
    const byteSize = this.layout.size;
    const floatSize = Math.ceil(byteSize / 4);
    const buffer = new ArrayBuffer(floatSize * 4);

    this.data = new Float32Array(buffer);
    this.dataInt = new Int32Array(buffer);
    this.dataUint = new Uint32Array(buffer);

    // Initialize dirty range (nothing dirty)
    this.dirtyStart = Number.MAX_SAFE_INTEGER;
    this.dirtyEnd = 0;

    logger.debug(`Created uniform buffer: ${descriptor.name}, size: ${byteSize} bytes`);
  }

  /**
   * Calculate buffer layout according to std140/std430 rules
   *
   * @param fields - Uniform fields
   * @param layout - Layout standard
   * @returns Layout information
   */
  private calculateLayout(fields: UniformField[], layout: UniformLayout): LayoutInfo {
    const offsets = new Map<string, number>();
    const sizes = new Map<string, number>();
    let currentOffset = 0;

    for (const field of fields) {
      // Get base alignment and size
      const { alignment, size } = this.getTypeInfo(field.type, layout);

      // Align current offset
      currentOffset = this.align(currentOffset, alignment);

      // Handle arrays
      if (field.arraySize !== undefined) {
        const stride = layout === UniformLayout.Std140
          ? this.align(size, 16) // std140 array stride is always aligned to vec4
          : this.align(size, alignment); // std430 uses base alignment

        offsets.set(field.name, currentOffset);
        sizes.set(field.name, stride * field.arraySize);
        currentOffset += stride * field.arraySize;
      } else {
        offsets.set(field.name, currentOffset);
        sizes.set(field.name, size);
        currentOffset += size;
      }
    }

    // Align total size to vec4
    const totalSize = this.align(currentOffset, 16);

    return { size: totalSize, offsets, sizes };
  }

  /**
   * Get type alignment and size
   *
   * @param type - Uniform type
   * @param layout - Layout standard
   * @returns Alignment and size in bytes
   */
  private getTypeInfo(type: UniformType, layout: UniformLayout): { alignment: number; size: number } {
    switch (type) {
      case UniformType.Float:
      case UniformType.Int:
      case UniformType.Uint:
      case UniformType.Bool:
        return { alignment: 4, size: 4 };

      case UniformType.Vec2:
      case UniformType.IVec2:
      case UniformType.UVec2:
        return { alignment: 8, size: 8 };

      case UniformType.Vec3:
      case UniformType.IVec3:
      case UniformType.UVec3:
        return layout === UniformLayout.Std140
          ? { alignment: 16, size: 12 } // std140: vec3 has vec4 alignment
          : { alignment: 16, size: 12 }; // std430: vec3 still has vec4 alignment

      case UniformType.Vec4:
      case UniformType.IVec4:
      case UniformType.UVec4:
        return { alignment: 16, size: 16 };

      case UniformType.Mat3:
        return layout === UniformLayout.Std140
          ? { alignment: 16, size: 48 } // 3 vec4s
          : { alignment: 16, size: 48 }; // Same for std430

      case UniformType.Mat4:
        return { alignment: 16, size: 64 }; // 4 vec4s

      default:
        throw new Error(`Unknown uniform type: ${type}`);
    }
  }

  /**
   * Align offset to alignment boundary
   *
   * @param offset - Current offset
   * @param alignment - Alignment requirement
   * @returns Aligned offset
   */
  private align(offset: number, alignment: number): number {
    return Math.ceil(offset / alignment) * alignment;
  }

  /**
   * Mark a range as dirty
   *
   * @param offset - Start offset in bytes
   * @param size - Size in bytes
   */
  private markDirty(offset: number, size: number): void {
    this.dirtyStart = Math.min(this.dirtyStart, offset);
    this.dirtyEnd = Math.max(this.dirtyEnd, offset + size);
  }

  /**
   * Get field offset
   *
   * @param name - Field name
   * @returns Offset in bytes
   */
  private getOffset(name: string): number {
    const offset = this.fieldOffsets.get(name);
    if (offset === undefined) {
      throw new Error(`Uniform field not found: ${name}`);
    }
    return offset;
  }

  /**
   * Set a float uniform
   *
   * @param name - Field name
   * @param value - Float value
   */
  setFloat(name: string, value: number): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    this.data[index] = value;
    this.markDirty(offset, 4);
  }

  /**
   * Set a vec2 uniform
   *
   * @param name - Field name
   * @param value - Vector2 value
   */
  setVec2(name: string, value: Vector2): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    this.data[index] = value.x;
    this.data[index + 1] = value.y;
    this.markDirty(offset, 8);
  }

  /**
   * Set a vec3 uniform
   *
   * @param name - Field name
   * @param value - Vector3 value
   */
  setVec3(name: string, value: Vector3): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    this.data[index] = value.x;
    this.data[index + 1] = value.y;
    this.data[index + 2] = value.z;
    this.markDirty(offset, 12);
  }

  /**
   * Set a vec4 uniform
   *
   * @param name - Field name
   * @param value - Vector4 or Color value
   */
  setVec4(name: string, value: Vector4 | Color): void {
    const offset = this.getOffset(name);
    const index = offset / 4;

    if (value instanceof Vector4) {
      this.data[index] = value.x;
      this.data[index + 1] = value.y;
      this.data[index + 2] = value.z;
      this.data[index + 3] = value.w;
    } else if (value instanceof Color) {
      this.data[index] = value.r;
      this.data[index + 1] = value.g;
      this.data[index + 2] = value.b;
      this.data[index + 3] = value.a;
    }

    this.markDirty(offset, 16);
  }

  /**
   * Set a mat3 uniform
   *
   * @param name - Field name
   * @param value - Matrix3 value
   */
  setMat3(name: string, value: Matrix3): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    const elements = value.elements;

    // mat3 is stored as 3 vec4s (column-major)
    // Column 0
    this.data[index] = elements[0];
    this.data[index + 1] = elements[1];
    this.data[index + 2] = elements[2];
    // Padding

    // Column 1
    this.data[index + 4] = elements[3];
    this.data[index + 5] = elements[4];
    this.data[index + 6] = elements[5];
    // Padding

    // Column 2
    this.data[index + 8] = elements[6];
    this.data[index + 9] = elements[7];
    this.data[index + 10] = elements[8];
    // Padding

    this.markDirty(offset, 48);
  }

  /**
   * Set a mat4 uniform
   *
   * @param name - Field name
   * @param value - Matrix4 value
   */
  setMat4(name: string, value: Matrix4): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    const elements = value.elements;

    // mat4 is stored as 4 vec4s (column-major)
    for (let i = 0; i < 16; i++) {
      this.data[index + i] = elements[i];
    }

    this.markDirty(offset, 64);
  }

  /**
   * Set an int uniform
   *
   * @param name - Field name
   * @param value - Integer value
   */
  setInt(name: string, value: number): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    this.dataInt[index] = value;
    this.markDirty(offset, 4);
  }

  /**
   * Set a uint uniform
   *
   * @param name - Field name
   * @param value - Unsigned integer value
   */
  setUint(name: string, value: number): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    this.dataUint[index] = value;
    this.markDirty(offset, 4);
  }

  /**
   * Set a bool uniform
   *
   * @param name - Field name
   * @param value - Boolean value
   */
  setBool(name: string, value: boolean): void {
    const offset = this.getOffset(name);
    const index = offset / 4;
    this.dataInt[index] = value ? 1 : 0;
    this.markDirty(offset, 4);
  }

  /**
   * Set a float array uniform
   *
   * @param name - Field name
   * @param values - Array of float values
   */
  setFloatArray(name: string, values: number[]): void {
    const offset = this.getOffset(name);
    const size = this.layout.sizes.get(name);

    if (!size) {
      throw new Error(`Cannot get size for field: ${name}`);
    }

    const stride = this.descriptor.layout === UniformLayout.Std140 ? 16 : 4;
    const index = offset / 4;
    const strideFloats = stride / 4;

    for (let i = 0; i < values.length; i++) {
      this.data[index + i * strideFloats] = values[i];
    }

    this.markDirty(offset, size);
  }

  /**
   * Set a vec3 array uniform
   *
   * @param name - Field name
   * @param values - Array of Vector3 values
   */
  setVec3Array(name: string, values: Vector3[]): void {
    const offset = this.getOffset(name);
    const size = this.layout.sizes.get(name);

    if (!size) {
      throw new Error(`Cannot get size for field: ${name}`);
    }

    const stride = this.descriptor.layout === UniformLayout.Std140 ? 16 : 12;
    const index = offset / 4;
    const strideFloats = stride / 4;

    for (let i = 0; i < values.length; i++) {
      const vec = values[i];
      const baseIndex = index + i * strideFloats;
      this.data[baseIndex] = vec.x;
      this.data[baseIndex + 1] = vec.y;
      this.data[baseIndex + 2] = vec.z;
    }

    this.markDirty(offset, size);
  }

  /**
   * Set a vec4 array uniform
   *
   * @param name - Field name
   * @param values - Array of Vector4 values
   */
  setVec4Array(name: string, values: Vector4[]): void {
    const offset = this.getOffset(name);
    const size = this.layout.sizes.get(name);

    if (!size) {
      throw new Error(`Cannot get size for field: ${name}`);
    }

    const stride = 16; // vec4 is always 16 bytes
    const index = offset / 4;

    for (let i = 0; i < values.length; i++) {
      const vec = values[i];
      const baseIndex = index + i * 4;
      this.data[baseIndex] = vec.x;
      this.data[baseIndex + 1] = vec.y;
      this.data[baseIndex + 2] = vec.z;
      this.data[baseIndex + 3] = vec.w;
    }

    this.markDirty(offset, size);
  }

  /**
   * Get the buffer data
   *
   * @returns Float32Array view of buffer data
   */
  getData(): Float32Array {
    return this.data;
  }

  /**
   * Get the dirty range data
   *
   * @returns Subarray containing only dirty data, or null if not dirty
   */
  getDirtyData(): { offset: number; data: Float32Array } | null {
    if (!this.isDirty) return null;

    const startIndex = Math.floor(this.dirtyStart / 4);
    const endIndex = Math.ceil(this.dirtyEnd / 4);

    return {
      offset: this.dirtyStart,
      data: this.data.subarray(startIndex, endIndex)
    };
  }

  /**
   * Check if buffer has dirty data
   */
  get isDirty(): boolean {
    return this.dirtyStart < this.dirtyEnd;
  }

  /**
   * Clear dirty flag
   */
  clearDirty(): void {
    this.dirtyStart = Number.MAX_SAFE_INTEGER;
    this.dirtyEnd = 0;
  }

  /**
   * Get buffer size in bytes
   */
  get size(): number {
    return this.layout.size;
  }

  /**
   * Get buffer binding point
   */
  get binding(): number {
    return this.descriptor.binding;
  }

  /**
   * Get buffer name
   */
  get name(): string {
    return this.descriptor.name;
  }
}
