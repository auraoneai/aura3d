import { IndexBuffer } from "./IndexBuffer";
import { type PrimitiveTopology } from "./RenderDevice";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat } from "./VertexFormat";

export interface Bounds3 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export class Geometry {
  constructor(
    public readonly vertexBuffer: VertexBuffer,
    public readonly indexBuffer: IndexBuffer | null = null,
    public readonly topology: PrimitiveTopology = "triangles",
    public readonly bounds: Bounds3 = computeBounds(vertexBuffer)
  ) {}

  static triangle(): Geometry {
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
  }

  static lineSegments(positions: readonly (readonly [number, number, number])[]): Geometry {
    if (positions.length === 0 || positions.length % 2 !== 0) {
      throw new Error("Line segment geometry requires one or more pairs of positions");
    }
    const vertices = new VertexBuffer(VertexFormat.P3, positions.length);
    positions.forEach((position, index) => {
      if (position.length !== 3 || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || !Number.isFinite(position[2])) {
        throw new Error(`Line segment position ${index} must be a finite vec3`);
      }
      vertices.setAttribute(index, "position", position);
    });
    return new Geometry(vertices, null, "lines");
  }

  static points(positions: readonly (readonly [number, number, number])[]): Geometry {
    if (positions.length === 0) {
      throw new Error("Point geometry requires at least one position");
    }
    const vertices = new VertexBuffer(VertexFormat.P3, positions.length);
    positions.forEach((position, index) => {
      if (position.length !== 3 || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || !Number.isFinite(position[2])) {
        throw new Error(`Point position ${index} must be a finite vec3`);
      }
      vertices.setAttribute(index, "position", position);
    });
    return new Geometry(vertices, null, "points");
  }

  static litTriangle(): Geometry {
    const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(0, "normal", [0, 0, 1]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(1, "normal", [0, 0, 1]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    vertices.setAttribute(2, "normal", [0, 0, 1]);
    return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
  }

  static litCube(size = 1): Geometry {
    if (size <= 0) {
      throw new Error("Lit cube size must be positive");
    }
    const half = size / 2;
    const faces: readonly {
      readonly normal: readonly [number, number, number];
      readonly corners: readonly (readonly [number, number, number])[];
    }[] = [
      { normal: [0, 0, 1], corners: [[-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half]] },
      { normal: [0, 0, -1], corners: [[half, -half, -half], [-half, -half, -half], [-half, half, -half], [half, half, -half]] },
      { normal: [1, 0, 0], corners: [[half, -half, half], [half, -half, -half], [half, half, -half], [half, half, half]] },
      { normal: [-1, 0, 0], corners: [[-half, -half, -half], [-half, -half, half], [-half, half, half], [-half, half, -half]] },
      { normal: [0, 1, 0], corners: [[-half, half, half], [half, half, half], [half, half, -half], [-half, half, -half]] },
      { normal: [0, -1, 0], corners: [[-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half]] }
    ];
    const vertices = new VertexBuffer(VertexFormat.P3N3, faces.length * 4);
    const indices: number[] = [];
    faces.forEach((face, faceIndex) => {
      const offset = faceIndex * 4;
      face.corners.forEach((position, cornerIndex) => {
        vertices.setAttribute(offset + cornerIndex, "position", position);
        vertices.setAttribute(offset + cornerIndex, "normal", face.normal);
      });
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    });
    return new Geometry(vertices, new IndexBuffer(indices, faces.length * 4));
  }

  static texturedCube(size = 1): Geometry {
    if (size <= 0) {
      throw new Error("Textured cube size must be positive");
    }
    const half = size / 2;
    const uv: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const faces: readonly {
      readonly normal: readonly [number, number, number];
      readonly tangent: readonly [number, number, number, number];
      readonly corners: readonly (readonly [number, number, number])[];
    }[] = [
      { normal: [0, 0, 1], tangent: [1, 0, 0, 1], corners: [[-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half]] },
      { normal: [0, 0, -1], tangent: [-1, 0, 0, 1], corners: [[half, -half, -half], [-half, -half, -half], [-half, half, -half], [half, half, -half]] },
      { normal: [1, 0, 0], tangent: [0, 0, -1, 1], corners: [[half, -half, half], [half, -half, -half], [half, half, -half], [half, half, half]] },
      { normal: [-1, 0, 0], tangent: [0, 0, 1, 1], corners: [[-half, -half, -half], [-half, -half, half], [-half, half, half], [-half, half, -half]] },
      { normal: [0, 1, 0], tangent: [1, 0, 0, 1], corners: [[-half, half, half], [half, half, half], [half, half, -half], [-half, half, -half]] },
      { normal: [0, -1, 0], tangent: [1, 0, 0, 1], corners: [[-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half]] }
    ];
    const vertices = new VertexBuffer(VertexFormat.P3N3T4T2, faces.length * 4);
    const indices: number[] = [];
    faces.forEach((face, faceIndex) => {
      const offset = faceIndex * 4;
      face.corners.forEach((position, cornerIndex) => {
        vertices.setAttribute(offset + cornerIndex, "position", position);
        vertices.setAttribute(offset + cornerIndex, "normal", face.normal);
        vertices.setAttribute(offset + cornerIndex, "tangent", face.tangent);
        vertices.setAttribute(offset + cornerIndex, "uv", uv[cornerIndex]!);
      });
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    });
    return new Geometry(vertices, new IndexBuffer(indices, faces.length * 4));
  }

  static uvSphere(radius = 0.5, segments = 24, rings = 12): Geometry {
    if (radius <= 0) {
      throw new Error("Sphere radius must be positive");
    }
    if (!Number.isInteger(segments) || !Number.isInteger(rings) || segments < 3 || rings < 2) {
      throw new Error("Sphere segments and rings must be integers with segments >= 3 and rings >= 2");
    }
    const vertexCount = (rings + 1) * (segments + 1);
    const vertices = new VertexBuffer(VertexFormat.P3N3, vertexCount);
    let vertex = 0;
    for (let ring = 0; ring <= rings; ring += 1) {
      const v = ring / rings;
      const theta = v * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const phi = u * Math.PI * 2;
        const nx = Math.cos(phi) * sinTheta;
        const ny = cosTheta;
        const nz = Math.sin(phi) * sinTheta;
        vertices.setAttribute(vertex, "position", [nx * radius, ny * radius, nz * radius]);
        vertices.setAttribute(vertex, "normal", [nx, ny, nz]);
        vertex += 1;
      }
    }
    const indices: number[] = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * stride + segment;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
  }

  static cube(size = 1): Geometry {
    if (size <= 0) {
      throw new Error("Cube size must be positive");
    }
    const half = size / 2;
    const positions: readonly (readonly [number, number, number])[] = [
      [-half, -half, -half],
      [half, -half, -half],
      [half, half, -half],
      [-half, half, -half],
      [-half, -half, half],
      [half, -half, half],
      [half, half, half],
      [-half, half, half]
    ];
    const vertices = new VertexBuffer(VertexFormat.P3, positions.length);
    positions.forEach((position, index) => vertices.setAttribute(index, "position", position));
    const indices = [
      0, 1, 2, 0, 2, 3,
      4, 6, 5, 4, 7, 6,
      0, 4, 5, 0, 5, 1,
      1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3,
      3, 7, 4, 3, 4, 0
    ];
    return new Geometry(vertices, new IndexBuffer(indices, positions.length));
  }

  dispose(): void {
    this.vertexBuffer.dispose();
    this.indexBuffer?.dispose();
  }
}

export function computeBounds(vertexBuffer: VertexBuffer): Bounds3 {
  if (!vertexBuffer.format.hasAttribute("position")) {
    throw new Error("Cannot compute geometry bounds without position attribute");
  }
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < vertexBuffer.vertexCount; i += 1) {
    const [x = 0, y = 0, z = 0] = vertexBuffer.getAttribute(i, "position");
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  return { min, max };
}
