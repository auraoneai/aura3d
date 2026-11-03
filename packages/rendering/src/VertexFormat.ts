export type VertexAttributeSemantic =
  | "position"
  | "normal"
  | "uv"
  | "uv1"
  | "tangent"
  | "color"
  | "joints"
  | "weights"
  /** Second influence set, glTF `JOINTS_1`. Enables eight-influence skinning. */
  | "joints1"
  /** Second influence set, glTF `WEIGHTS_1`. */
  | "weights1"
  /** Screen-space line: world-space start point of the segment this vertex belongs to. */
  | "lineStart"
  /** Screen-space line: world-space end point of the segment. */
  | "lineEnd"
  /**
   * Screen-space line corner selector. `x` is the side (-1 or +1) the vertex expands
   * toward, `y` is the position along the segment (0 at start, 1 at end).
   */
  | "lineCorner"
  /** Accumulated arc length at this vertex, in world units, for dash patterns. */
  | "lineDistance"
  /** R-23: author-named per-vertex attribute (`custom:<glslName>`); see {@link customAttributeSemantic}. */
  | `custom:${string}`;

const CUSTOM_SEMANTIC_PREFIX = "custom:";

/**
 * R-23: shader locations a custom attribute may take, in assignment order.
 * Excludes 0/1/2 (position/normal/uv), 4 (color) and 7 (uv1) because the
 * custom-geometry path emits those and the native WebGPU atlas shader keys on
 * 4 and 7; also every entry is below WebGPU's default `maxVertexAttributes`
 * (16), which a flat "14 and up" scheme would exceed after two attributes.
 */
export const CUSTOM_ATTRIBUTE_LOCATION_POOL: readonly number[] = [3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15];

export function customAttributeSemantic(name: string): `custom:${string}` {
  return `${CUSTOM_SEMANTIC_PREFIX}${name}`;
}

export function isCustomAttributeSemantic(semantic: VertexAttributeSemantic): semantic is `custom:${string}` {
  return semantic.startsWith(CUSTOM_SEMANTIC_PREFIX);
}

/**
 * Stable location assignment: names are sorted ascending (code-unit order) and
 * take the pool in order, so a geometry's layout never depends on the order the
 * author listed its attributes in.
 */
export function assignCustomAttributeLocations(names: readonly string[]): ReadonlyMap<string, number> {
  if (names.length > CUSTOM_ATTRIBUTE_LOCATION_POOL.length) {
    throw new Error(`At most ${CUSTOM_ATTRIBUTE_LOCATION_POOL.length} custom vertex attributes are supported per geometry, got ${names.length}`);
  }
  const sorted = [...new Set(names)].sort();
  return new Map(sorted.map((name, index) => [name, CUSTOM_ATTRIBUTE_LOCATION_POOL[index]!]));
}

/** Storage type in the vertex buffer; offsets and strides are measured in bytes. */
export type VertexAttributeType = "float32" | "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";

export type VertexStepMode = "vertex" | "instance";

/** One independently bound, optionally interleaved vertex-buffer stream. */
export interface VertexStreamDescriptor {
  readonly slot: number;
  readonly stride: number;
  readonly stepMode?: VertexStepMode;
  /** WebGL instance divisor; WebGPU supports only 1 and rejects other values. */
  readonly divisor?: number;
}

export interface VertexStream {
  readonly slot: number;
  readonly stride: number;
  readonly stepMode: VertexStepMode;
  readonly divisor: number;
}

/** Component storage width; input values remain in their original byte representation. */
export function vertexAttributeComponentBytes(type: VertexAttributeType): number {
  switch (type) {
    case "int8":
    case "uint8": return 1;
    case "int16":
    case "uint16": return 2;
    case "float32":
    case "int32":
    case "uint32": return 4;
    default: throw new Error(`Unsupported vertex attribute type: ${String(type)}`);
  }
}

export interface VertexAttributeDescriptor {
  readonly semantic: VertexAttributeSemantic;
  readonly components: 1 | 2 | 3 | 4;
  readonly offset: number;
  readonly type?: VertexAttributeType;
  /** Convert integer storage to [-1, 1] or [0, 1] for a float shader input; ignored for float32 for compatibility. */
  readonly normalized?: boolean;
  /** Read integer storage as an integer shader input instead of converting it to float. */
  readonly integer?: boolean;
  /** Buffer slot, default 0. A slot's stride and step mode are shared by its attributes. */
  readonly bufferSlot?: number;
  readonly shaderLocation?: number;
  readonly shaderName?: string;
}

export class VertexAttribute {
  public readonly semantic: VertexAttributeSemantic;
  public readonly components: 1 | 2 | 3 | 4;
  public readonly offset: number;
  public readonly type: VertexAttributeType;
  public readonly normalized: boolean;
  public readonly integer: boolean;
  public readonly bufferSlot: number;
  public readonly shaderLocation: number;
  public readonly shaderName: string;

  constructor(descriptor: VertexAttributeDescriptor) {
    const type = descriptor.type ?? "float32";
    const componentBytes = vertexAttributeComponentBytes(type);
    if (![1, 2, 3, 4].includes(descriptor.components)) throw new Error(`Vertex attribute ${descriptor.semantic} must have 1 to 4 components`);
    if (descriptor.normalized !== undefined && typeof descriptor.normalized !== "boolean") throw new Error(`Vertex attribute ${descriptor.semantic} normalized must be a boolean`);
    if (descriptor.integer !== undefined && typeof descriptor.integer !== "boolean") throw new Error(`Vertex attribute ${descriptor.semantic} integer must be a boolean`);
    if (!Number.isSafeInteger(descriptor.offset) || descriptor.offset < 0 || descriptor.offset % componentBytes !== 0) {
      throw new Error(`Vertex attribute ${descriptor.semantic} offset must be non-negative and ${componentBytes}-byte aligned`);
    }
    if (descriptor.integer === true && (type === "float32" || descriptor.normalized === true)) {
      throw new Error(`Vertex attribute ${descriptor.semantic} integer input requires unnormalized integer storage`);
    }
    const slot = descriptor.bufferSlot ?? 0;
    if (!Number.isSafeInteger(slot) || slot < 0) throw new Error(`Vertex attribute ${descriptor.semantic} bufferSlot must be a non-negative integer`);
    this.semantic = descriptor.semantic;
    this.components = descriptor.components;
    this.offset = descriptor.offset;
    this.type = type;
    this.normalized = descriptor.normalized ?? false;
    this.integer = descriptor.integer ?? false;
    this.bufferSlot = slot;
    this.shaderLocation = descriptor.shaderLocation ?? defaultShaderLocation(descriptor.semantic);
    if (!Number.isSafeInteger(this.shaderLocation) || this.shaderLocation < 0) throw new Error(`Vertex attribute ${descriptor.semantic} shaderLocation must be a non-negative integer`);
    this.shaderName = descriptor.shaderName ?? defaultShaderName(descriptor.semantic);
    if (typeof this.shaderName !== "string" || this.shaderName.length === 0) throw new Error(`Vertex attribute ${descriptor.semantic} shaderName must be a non-empty string`);
  }

  get byteLength(): number {
    return this.components * vertexAttributeComponentBytes(this.type);
  }
}

export class VertexFormat {
  public readonly attributes: readonly VertexAttribute[];
  public readonly streams: readonly VertexStream[];
  /** Stride of slot 0, retained for existing interleaved vertex buffers. */
  public readonly stride: number;

  constructor(attributes: readonly VertexAttributeDescriptor[], stride?: number, streams: readonly VertexStreamDescriptor[] = []) {
    if (attributes.length === 0) {
      throw new Error("VertexFormat requires at least one attribute");
    }

    const seen = new Set<VertexAttributeSemantic>();
    const locations = new Map<number, VertexAttributeSemantic>();
    this.attributes = attributes.map((attribute) => {
      if (seen.has(attribute.semantic)) {
        throw new Error(`Duplicate vertex semantic: ${attribute.semantic}`);
      }
      seen.add(attribute.semantic);
      const built = new VertexAttribute(attribute);
      const owner = locations.get(built.shaderLocation);
      // Retain the legacy behavior for built-in semantics; custom attributes
      // must never alias another declared input location.
      if (owner !== undefined && (isCustomAttributeSemantic(owner) || isCustomAttributeSemantic(built.semantic))) {
        throw new Error(`Vertex semantics ${owner} and ${built.semantic} share shader location ${built.shaderLocation}`);
      }
      locations.set(built.shaderLocation, built.semantic);
      return built;
    });

    const bySlot = new Map<number, VertexStreamDescriptor>();
    for (const stream of streams) {
      if (!Number.isSafeInteger(stream.slot) || stream.slot < 0 || bySlot.has(stream.slot)) {
        throw new Error(`Vertex stream slot must be a unique non-negative integer: ${stream.slot}`);
      }
      bySlot.set(stream.slot, stream);
    }
    const slots = [...new Set(this.attributes.map((attribute) => attribute.bufferSlot))].sort((a, b) => a - b);
    if (!slots.includes(0)) throw new Error("VertexFormat requires at least one slot 0 attribute");
    for (const slot of bySlot.keys()) {
      if (!slots.includes(slot)) throw new Error(`Vertex stream ${slot} has no attributes`);
    }
    this.streams = slots.map((slot) => {
      const members = this.attributes.filter((attribute) => attribute.bufferSlot === slot);
      const minimum = Math.max(...members.map((attribute) => attribute.offset + attribute.byteLength));
      const descriptor = bySlot.get(slot);
      if (slot !== 0 && !descriptor) throw new Error(`Vertex stream ${slot} requires an explicit descriptor`);
      if (slot === 0 && descriptor && stride !== undefined && descriptor.stride !== stride) throw new Error("Vertex stream 0 stride disagrees with vertex stride");
      const alignment = Math.max(...members.map((attribute) => vertexAttributeComponentBytes(attribute.type)));
      const inferredStride = Math.ceil(minimum / alignment) * alignment;
      const streamStride = descriptor?.stride ?? stride ?? inferredStride;
      if (!Number.isSafeInteger(streamStride) || streamStride < minimum) {
        throw new Error(`Vertex stream ${slot} stride ${streamStride} is smaller than minimum required stride ${minimum}`);
      }
      for (const attribute of members) {
        const alignment = vertexAttributeComponentBytes(attribute.type);
        if (streamStride % alignment !== 0) throw new Error(`Vertex stream ${slot} stride must be ${alignment}-byte aligned for ${attribute.semantic}`);
      }
      const stepMode = descriptor?.stepMode ?? "vertex";
      if (stepMode !== "vertex" && stepMode !== "instance") throw new Error(`Invalid vertex stream step mode: ${String(stepMode)}`);
      const divisor = descriptor?.divisor ?? (stepMode === "instance" ? 1 : 0);
      if (!Number.isSafeInteger(divisor) || (stepMode === "instance" ? divisor < 1 : divisor !== 0)) {
        throw new Error(`Invalid divisor ${divisor} for vertex stream ${slot} (${stepMode})`);
      }
      return { slot, stride: streamStride, stepMode, divisor };
    });
    this.stride = this.streams.find((stream) => stream.slot === 0)!.stride;
  }

  static readonly P3 = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }], 12);

  static readonly P3N3 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 }
    ],
    24
  );

  static readonly P3N3T2 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "uv", components: 2, offset: 24 }
    ],
    32
  );

  static readonly P3N3T4T2 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "tangent", components: 4, offset: 24 },
      { semantic: "uv", components: 2, offset: 40 }
    ],
    48
  );

  /**
   * Dual-UV production primitive format with analytic tangents
   * (muse3jsparity-PRD C1): the second set drives the native texCoord
   * selector, tangents satisfy the normal-mapped material contract.
   */
  static readonly P3N3T4T2T2 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "tangent", components: 4, offset: 24 },
      { semantic: "uv", components: 2, offset: 40 },
      { semantic: "uv1", components: 2, offset: 48 }
    ],
    56
  );

  static readonly P3J4W4 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12 },
      { semantic: "weights", components: 4, offset: 28 }
    ],
    44
  );

  static readonly P3N3J4W4 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24 },
      { semantic: "weights", components: 4, offset: 40 }
    ],
    56
  );

  /**
   * Eight-influence skinning, position only. glTF permits `JOINTS_1`/`WEIGHTS_1` for
   * vertices bound to more than four joints; without a second influence set those
   * extra bindings are silently dropped and the mesh deforms incorrectly at joints
   * with dense weighting (shoulders, hips, face rigs).
   */
  static readonly P3J8W8 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12 },
      { semantic: "weights", components: 4, offset: 28 },
      { semantic: "joints1", components: 4, offset: 44 },
      { semantic: "weights1", components: 4, offset: 60 }
    ],
    76
  );

  /** Eight-influence skinning with normals, for lit skinned meshes. */
  static readonly P3N3J8W8 = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24 },
      { semantic: "weights", components: 4, offset: 40 },
      { semantic: "joints1", components: 4, offset: 56 },
      { semantic: "weights1", components: 4, offset: 72 }
    ],
    88
  );

  /**
   * Screen-space fat-line format.
   *
   * `position` is unused by the shader for placement: both endpoints travel as
   * `lineStart`/`lineEnd` so the vertex stage can project them independently and
   * expand the quad in *pixel* space. It is retained so bounds computation and
   * frustum culling see real world-space geometry.
   */
  static readonly SCREEN_SPACE_LINE = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "lineStart", components: 3, offset: 12 },
      { semantic: "lineEnd", components: 3, offset: 24 },
      { semantic: "lineCorner", components: 2, offset: 36 },
      { semantic: "lineDistance", components: 1, offset: 44 },
      { semantic: "color", components: 4, offset: 48 },
      // Both endpoint values are needed to interpolate accurately if a segment
      // crosses the near plane. The normal color/distance remain per-corner.
      { semantic: "custom:lineOtherColor", components: 4, offset: 64, shaderLocation: 14, shaderName: "a_lineOtherColor" },
      { semantic: "custom:lineOtherDistance", components: 1, offset: 80, shaderLocation: 15, shaderName: "a_lineOtherDistance" }
    ],
    84
  );

  getAttribute(semantic: VertexAttributeSemantic): VertexAttribute {
    const attribute = this.attributes.find((candidate) => candidate.semantic === semantic);
    if (!attribute) {
      throw new Error(`Vertex format does not contain semantic ${semantic}`);
    }
    return attribute;
  }

  hasAttribute(semantic: VertexAttributeSemantic): boolean {
    return this.attributes.some((attribute) => attribute.semantic === semantic);
  }
}

function defaultShaderLocation(semantic: VertexAttributeSemantic): number {
  if (isCustomAttributeSemantic(semantic)) {
    throw new Error(`Custom vertex attribute ${semantic} requires an explicit shaderLocation (use assignCustomAttributeLocations)`);
  }
  switch (semantic) {
    case "position":
      return 0;
    case "normal":
      return 1;
    case "uv":
      return 2;
    case "tangent":
      return 3;
    case "color":
      return 4;
    case "joints":
      return 5;
    case "weights":
      return 6;
    case "uv1":
      return 7;
    case "joints1":
      return 8;
    case "weights1":
      return 9;
    case "lineStart":
      return 10;
    case "lineEnd":
      return 11;
    case "lineCorner":
      return 12;
    case "lineDistance":
      return 13;
  }
}

function defaultShaderName(semantic: VertexAttributeSemantic): string {
  if (isCustomAttributeSemantic(semantic)) return semantic.slice(CUSTOM_SEMANTIC_PREFIX.length);
  switch (semantic) {
    case "position":
      return "a_position";
    case "normal":
      return "a_normal";
    case "uv":
      return "a_uv";
    case "uv1":
      return "a_uv1";
    case "tangent":
      return "a_tangent";
    case "color":
      return "a_color";
    case "joints":
      return "a_joints";
    case "weights":
      return "a_weights";
    case "joints1":
      return "a_joints1";
    case "weights1":
      return "a_weights1";
    case "lineStart":
      return "a_lineStart";
    case "lineEnd":
      return "a_lineEnd";
    case "lineCorner":
      return "a_lineCorner";
    case "lineDistance":
      return "a_lineDistance";
  }
}
