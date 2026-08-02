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
  | "lineDistance";

export type VertexAttributeType = "float32";

export interface VertexAttributeDescriptor {
  readonly semantic: VertexAttributeSemantic;
  readonly components: 1 | 2 | 3 | 4;
  readonly offset: number;
  readonly type?: VertexAttributeType;
  readonly normalized?: boolean;
  readonly shaderLocation?: number;
  readonly shaderName?: string;
}

export class VertexAttribute {
  public readonly semantic: VertexAttributeSemantic;
  public readonly components: 1 | 2 | 3 | 4;
  public readonly offset: number;
  public readonly type: VertexAttributeType;
  public readonly normalized: boolean;
  public readonly shaderLocation: number;
  public readonly shaderName: string;

  constructor(descriptor: VertexAttributeDescriptor) {
    if (descriptor.offset < 0 || descriptor.offset % 4 !== 0) {
      throw new Error(`Vertex attribute ${descriptor.semantic} offset must be non-negative and 4-byte aligned`);
    }
    this.semantic = descriptor.semantic;
    this.components = descriptor.components;
    this.offset = descriptor.offset;
    this.type = descriptor.type ?? "float32";
    this.normalized = descriptor.normalized ?? false;
    this.shaderLocation = descriptor.shaderLocation ?? defaultShaderLocation(descriptor.semantic);
    this.shaderName = descriptor.shaderName ?? defaultShaderName(descriptor.semantic);
  }

  get byteLength(): number {
    return this.components * 4;
  }
}

export class VertexFormat {
  public readonly attributes: readonly VertexAttribute[];
  public readonly stride: number;

  constructor(attributes: readonly VertexAttributeDescriptor[], stride?: number) {
    if (attributes.length === 0) {
      throw new Error("VertexFormat requires at least one attribute");
    }

    const seen = new Set<VertexAttributeSemantic>();
    this.attributes = attributes.map((attribute) => {
      if (seen.has(attribute.semantic)) {
        throw new Error(`Duplicate vertex semantic: ${attribute.semantic}`);
      }
      seen.add(attribute.semantic);
      return new VertexAttribute(attribute);
    });

    const minimumStride = Math.max(...this.attributes.map((attribute) => attribute.offset + attribute.byteLength));
    this.stride = stride ?? minimumStride;
    if (this.stride < minimumStride) {
      throw new Error(`Vertex stride ${this.stride} is smaller than minimum required stride ${minimumStride}`);
    }
    if (this.stride % 4 !== 0) {
      throw new Error("Vertex stride must be 4-byte aligned");
    }
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
      { semantic: "lineDistance", components: 1, offset: 44 }
    ],
    48
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
