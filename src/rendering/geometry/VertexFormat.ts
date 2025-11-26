/**
 * Vertex format definitions for GPU buffer layouts.
 * Defines vertex attribute types, sizes, and memory layouts for efficient GPU upload.
 * @module VertexFormat
 */

/**
 * Vertex attribute data types supported by the rendering system.
 * Matches WebGPU/WebGL vertex format types.
 */
export enum VertexAttributeType {
  Float = 'float32',
  Float2 = 'float32x2',
  Float3 = 'float32x3',
  Float4 = 'float32x4',
  UByte4 = 'uint8x4',
  UByte4Norm = 'unorm8x4',
  Byte4 = 'sint8x4',
  Byte4Norm = 'snorm8x4',
  UShort2 = 'uint16x2',
  UShort2Norm = 'unorm16x2',
  Short2 = 'sint16x2',
  Short2Norm = 'snorm16x2',
  UShort4 = 'uint16x4',
  UShort4Norm = 'unorm16x4',
  Short4 = 'sint16x4',
  Short4Norm = 'snorm16x4',
  UInt = 'uint32',
  Int = 'sint32',
}

/**
 * Semantic meaning of a vertex attribute.
 * Used for shader binding and validation.
 */
export enum VertexAttributeSemantic {
  Position = 'POSITION',
  Normal = 'NORMAL',
  Tangent = 'TANGENT',
  Bitangent = 'BITANGENT',
  TexCoord0 = 'TEXCOORD_0',
  TexCoord1 = 'TEXCOORD_1',
  TexCoord2 = 'TEXCOORD_2',
  TexCoord3 = 'TEXCOORD_3',
  Color0 = 'COLOR_0',
  Color1 = 'COLOR_1',
  Joints0 = 'JOINTS_0',
  Weights0 = 'WEIGHTS_0',
  Custom0 = 'CUSTOM_0',
  Custom1 = 'CUSTOM_1',
  Custom2 = 'CUSTOM_2',
  Custom3 = 'CUSTOM_3',
}

/**
 * Single vertex attribute definition.
 */
export interface VertexAttribute {
  /** Semantic meaning of the attribute */
  semantic: VertexAttributeSemantic;
  /** Data type of the attribute */
  type: VertexAttributeType;
  /** Byte offset within the vertex structure */
  offset: number;
  /** Buffer binding index (for separate buffer layouts) */
  bufferIndex?: number;
  /** Whether values should be normalized */
  normalized?: boolean;
}

/**
 * Complete vertex format specification.
 * Defines the memory layout and attributes for vertex data.
 *
 * @example
 * ```typescript
 * // Create a simple position + normal format
 * const format = new VertexFormat([
 *   {
 *     semantic: VertexAttributeSemantic.Position,
 *     type: VertexAttributeType.Float3,
 *     offset: 0
 *   },
 *   {
 *     semantic: VertexAttributeSemantic.Normal,
 *     type: VertexAttributeType.Float3,
 *     offset: 12
 *   }
 * ]);
 * console.log(format.stride); // 24 bytes
 * ```
 */
export class VertexFormat {
  /** Array of vertex attributes */
  readonly attributes: VertexAttribute[];
  /** Total size of one vertex in bytes */
  readonly stride: number;
  /** Whether attributes are interleaved in a single buffer */
  readonly interleaved: boolean;

  /**
   * Creates a new vertex format.
   *
   * @param attributes - Array of vertex attributes
   * @param interleaved - Whether attributes are interleaved (default: true)
   *
   * @example
   * ```typescript
   * const format = new VertexFormat([
   *   { semantic: VertexAttributeSemantic.Position, type: VertexAttributeType.Float3, offset: 0 },
   *   { semantic: VertexAttributeSemantic.Normal, type: VertexAttributeType.Float3, offset: 12 }
   * ]);
   * ```
   */
  constructor(attributes: VertexAttribute[], interleaved: boolean = true) {
    this.attributes = attributes;
    this.interleaved = interleaved;

    if (interleaved) {
      this.stride = this.computeStride();
    } else {
      this.stride = 0;
    }
  }

  /**
   * Computes the stride (total size) of one vertex.
   * For interleaved layouts, finds the maximum (offset + size).
   *
   * @returns Stride in bytes
   */
  private computeStride(): number {
    let maxEnd = 0;
    for (const attr of this.attributes) {
      const size = VertexFormat.getAttributeSize(attr.type);
      const end = attr.offset + size;
      if (end > maxEnd) {
        maxEnd = end;
      }
    }
    return maxEnd;
  }

  /**
   * Gets the size in bytes of a vertex attribute type.
   *
   * @param type - Vertex attribute type
   * @returns Size in bytes
   *
   * @example
   * ```typescript
   * const size = VertexFormat.getAttributeSize(VertexAttributeType.Float3); // 12
   * ```
   */
  static getAttributeSize(type: VertexAttributeType): number {
    switch (type) {
      case VertexAttributeType.Float:
        return 4;
      case VertexAttributeType.Float2:
        return 8;
      case VertexAttributeType.Float3:
        return 12;
      case VertexAttributeType.Float4:
        return 16;
      case VertexAttributeType.UByte4:
      case VertexAttributeType.UByte4Norm:
      case VertexAttributeType.Byte4:
      case VertexAttributeType.Byte4Norm:
        return 4;
      case VertexAttributeType.UShort2:
      case VertexAttributeType.UShort2Norm:
      case VertexAttributeType.Short2:
      case VertexAttributeType.Short2Norm:
        return 4;
      case VertexAttributeType.UShort4:
      case VertexAttributeType.UShort4Norm:
      case VertexAttributeType.Short4:
      case VertexAttributeType.Short4Norm:
        return 8;
      case VertexAttributeType.UInt:
      case VertexAttributeType.Int:
        return 4;
      default:
        return 0;
    }
  }

  /**
   * Gets the number of components in a vertex attribute type.
   *
   * @param type - Vertex attribute type
   * @returns Number of components (1-4)
   *
   * @example
   * ```typescript
   * const count = VertexFormat.getComponentCount(VertexAttributeType.Float3); // 3
   * ```
   */
  static getComponentCount(type: VertexAttributeType): number {
    switch (type) {
      case VertexAttributeType.Float:
      case VertexAttributeType.UInt:
      case VertexAttributeType.Int:
        return 1;
      case VertexAttributeType.Float2:
      case VertexAttributeType.UShort2:
      case VertexAttributeType.UShort2Norm:
      case VertexAttributeType.Short2:
      case VertexAttributeType.Short2Norm:
        return 2;
      case VertexAttributeType.Float3:
        return 3;
      case VertexAttributeType.Float4:
      case VertexAttributeType.UByte4:
      case VertexAttributeType.UByte4Norm:
      case VertexAttributeType.Byte4:
      case VertexAttributeType.Byte4Norm:
      case VertexAttributeType.UShort4:
      case VertexAttributeType.UShort4Norm:
      case VertexAttributeType.Short4:
      case VertexAttributeType.Short4Norm:
        return 4;
      default:
        return 0;
    }
  }

  /**
   * Finds an attribute by semantic.
   *
   * @param semantic - Attribute semantic to find
   * @returns Attribute or undefined if not found
   *
   * @example
   * ```typescript
   * const posAttr = format.getAttribute(VertexAttributeSemantic.Position);
   * if (posAttr) {
   *   console.log('Position offset:', posAttr.offset);
   * }
   * ```
   */
  getAttribute(semantic: VertexAttributeSemantic): VertexAttribute | undefined {
    return this.attributes.find(attr => attr.semantic === semantic);
  }

  /**
   * Checks if the format has a specific attribute.
   *
   * @param semantic - Attribute semantic to check
   * @returns True if attribute exists
   *
   * @example
   * ```typescript
   * if (format.hasAttribute(VertexAttributeSemantic.Tangent)) {
   *   console.log('Format supports tangents');
   * }
   * ```
   */
  hasAttribute(semantic: VertexAttributeSemantic): boolean {
    return this.getAttribute(semantic) !== undefined;
  }

  /**
   * Creates a clone of this vertex format.
   *
   * @returns New vertex format with the same attributes
   */
  clone(): VertexFormat {
    return new VertexFormat([...this.attributes], this.interleaved);
  }

  /**
   * Checks if this format is compatible with another format.
   * Two formats are compatible if they have the same attributes in the same order.
   *
   * @param other - Format to compare with
   * @returns True if formats are compatible
   */
  isCompatible(other: VertexFormat): boolean {
    if (this.attributes.length !== other.attributes.length) {
      return false;
    }

    for (let i = 0; i < this.attributes.length; i++) {
      const a = this.attributes[i];
      const b = other.attributes[i];
      if (a.semantic !== b.semantic || a.type !== b.type) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Common Format Presets
  // ============================================================================

  /**
   * Position only (Float3).
   * Stride: 12 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3();
   * ```
   */
  static P3(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
    ]);
  }

  /**
   * Position (Float3) + Normal (Float3).
   * Stride: 24 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3N3();
   * ```
   */
  static P3N3(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
      {
        semantic: VertexAttributeSemantic.Normal,
        type: VertexAttributeType.Float3,
        offset: 12,
      },
    ]);
  }

  /**
   * Position (Float3) + TexCoord (Float2).
   * Stride: 20 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3T2();
   * ```
   */
  static P3T2(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
      {
        semantic: VertexAttributeSemantic.TexCoord0,
        type: VertexAttributeType.Float2,
        offset: 12,
      },
    ]);
  }

  /**
   * Position (Float3) + Normal (Float3) + TexCoord (Float2).
   * Stride: 32 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3N3T2();
   * ```
   */
  static P3N3T2(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
      {
        semantic: VertexAttributeSemantic.Normal,
        type: VertexAttributeType.Float3,
        offset: 12,
      },
      {
        semantic: VertexAttributeSemantic.TexCoord0,
        type: VertexAttributeType.Float2,
        offset: 24,
      },
    ]);
  }

  /**
   * Position (Float3) + Normal (Float3) + Tangent (Float4) + TexCoord (Float2).
   * Stride: 48 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3N3T4T2();
   * ```
   */
  static P3N3T4T2(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
      {
        semantic: VertexAttributeSemantic.Normal,
        type: VertexAttributeType.Float3,
        offset: 12,
      },
      {
        semantic: VertexAttributeSemantic.Tangent,
        type: VertexAttributeType.Float4,
        offset: 24,
      },
      {
        semantic: VertexAttributeSemantic.TexCoord0,
        type: VertexAttributeType.Float2,
        offset: 40,
      },
    ]);
  }

  /**
   * Position (Float3) + Normal (Float3) + TexCoord (Float2) + Color (UByte4Norm).
   * Stride: 36 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3N3T2C4();
   * ```
   */
  static P3N3T2C4(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
      {
        semantic: VertexAttributeSemantic.Normal,
        type: VertexAttributeType.Float3,
        offset: 12,
      },
      {
        semantic: VertexAttributeSemantic.TexCoord0,
        type: VertexAttributeType.Float2,
        offset: 24,
      },
      {
        semantic: VertexAttributeSemantic.Color0,
        type: VertexAttributeType.UByte4Norm,
        offset: 32,
      },
    ]);
  }

  /**
   * Full skinned mesh format:
   * Position (Float3) + Normal (Float3) + Tangent (Float4) + TexCoord (Float2) +
   * Joints (UByte4) + Weights (UByte4Norm).
   * Stride: 56 bytes
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3N3T4T2J4W4();
   * ```
   */
  static P3N3T4T2J4W4(): VertexFormat {
    return new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0,
      },
      {
        semantic: VertexAttributeSemantic.Normal,
        type: VertexAttributeType.Float3,
        offset: 12,
      },
      {
        semantic: VertexAttributeSemantic.Tangent,
        type: VertexAttributeType.Float4,
        offset: 24,
      },
      {
        semantic: VertexAttributeSemantic.TexCoord0,
        type: VertexAttributeType.Float2,
        offset: 40,
      },
      {
        semantic: VertexAttributeSemantic.Joints0,
        type: VertexAttributeType.UByte4,
        offset: 48,
      },
      {
        semantic: VertexAttributeSemantic.Weights0,
        type: VertexAttributeType.UByte4Norm,
        offset: 52,
      },
    ]);
  }
}
