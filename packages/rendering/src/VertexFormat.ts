export type VertexAttributeSemantic = "position" | "normal" | "uv" | "tangent" | "color" | "joints" | "weights";

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
    case "tangent":
      return "a_tangent";
    case "color":
      return "a_color";
    case "joints":
      return "a_joints";
    case "weights":
      return "a_weights";
  }
}
