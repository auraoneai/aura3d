import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { TurtleInterpreter, TurtleSegment } from './TurtleInterpreter';

/**
 * Vertex data for mesh generation.
 */
export interface MeshVertex {
  /** Position */
  position: Vector3;
  /** Normal vector */
  normal: Vector3;
  /** UV coordinates */
  uv: Vector2;
  /** Color (optional) */
  color?: number[];
}

/**
 * Simple 2D vector for UV coordinates.
 */
export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Triangle face indices.
 */
export interface MeshFace {
  /** Vertex indices */
  indices: [number, number, number];
}

/**
 * Generated mesh data.
 */
export interface GeneratedMesh {
  /** Vertex array */
  vertices: MeshVertex[];
  /** Index array for triangles */
  indices: number[];
  /** Bounding box min */
  boundsMin: Vector3;
  /** Bounding box max */
  boundsMax: Vector3;
}

/**
 * Configuration for mesh generation.
 */
export interface MeshGeneratorConfig {
  /** Number of radial segments for cylinders */
  radialSegments?: number;
  /** Generate smooth normals */
  smoothNormals?: boolean;
  /** UV scale factor */
  uvScale?: number;
  /** Color palette for different color indices */
  colorPalette?: number[][];
  /** Add leaves at branch ends */
  generateLeaves?: boolean;
  /** Leaf size */
  leafSize?: number;
}

/**
 * L-System Mesh Generator.
 *
 * Generates 3D meshes from L-system turtle graphics output.
 * Creates cylindrical branches with optional leaves.
 *
 * @example
 * ```typescript
 * const generator = new LSystemMeshGenerator({
 *   radialSegments: 8,
 *   smoothNormals: true,
 *   generateLeaves: true
 * });
 *
 * const turtle = new TurtleInterpreter({ stepLength: 1, angle: 25 });
 * const segments = turtle.interpret(lsystemString);
 * const mesh = generator.generateMesh(segments);
 * ```
 */
export class LSystemMeshGenerator {
  private radialSegments: number;
  private smoothNormals: boolean;
  private uvScale: number;
  private colorPalette: number[][];
  private generateLeaves: boolean;
  private leafSize: number;
  private logger: Logger;

  /**
   * Creates a new mesh generator.
   * @param config - Configuration options
   */
  constructor(config: MeshGeneratorConfig = {}) {
    this.logger = new Logger('LSystemMeshGenerator');
    this.radialSegments = config.radialSegments ?? 8;
    this.smoothNormals = config.smoothNormals ?? true;
    this.uvScale = config.uvScale ?? 1.0;
    this.generateLeaves = config.generateLeaves ?? false;
    this.leafSize = config.leafSize ?? 0.5;

    this.colorPalette = config.colorPalette ?? [
      [0.4, 0.3, 0.2], // Brown (bark)
      [0.2, 0.6, 0.2], // Green (leaves)
      [0.6, 0.4, 0.2], // Light brown
      [0.1, 0.4, 0.1]  // Dark green
    ];

    this.logger.info('L-System mesh generator initialized');
  }

  /**
   * Generates a mesh from turtle segments.
   * @param segments - Array of turtle segments
   * @returns Generated mesh data
   */
  public generateMesh(segments: TurtleSegment[]): GeneratedMesh {
    const vertices: MeshVertex[] = [];
    const indices: number[] = [];
    let boundsMin = new Vector3(Infinity, Infinity, Infinity);
    let boundsMax = new Vector3(-Infinity, -Infinity, -Infinity);

    // Generate branch geometry
    for (const segment of segments) {
      if (segment.width > 0) {
        this.generateBranch(segment, vertices, indices);
        this.updateBounds(segment.start, boundsMin, boundsMax);
        this.updateBounds(segment.end, boundsMin, boundsMax);
      }
    }

    // Generate leaves
    if (this.generateLeaves) {
      this.generateLeavesForSegments(segments, vertices, indices);
    }

    // Compute normals if needed
    if (this.smoothNormals) {
      this.computeSmoothNormals(vertices, indices);
    }

    this.logger.debug(`Generated mesh with ${vertices.length} vertices and ${indices.length / 3} faces`);

    return {
      vertices,
      indices,
      boundsMin,
      boundsMax
    };
  }

  /**
   * Generates a cylindrical branch for a segment.
   * @param segment - The turtle segment
   * @param vertices - Vertex array to append to
   * @param indices - Index array to append to
   */
  private generateBranch(
    segment: TurtleSegment,
    vertices: MeshVertex[],
    indices: number[]
  ): void {
    const direction = segment.end.clone().sub(segment.start).normalize();
    const radius = segment.width / 2;

    // Find perpendicular vectors
    let perpendicular: Vector3;
    if (Math.abs(direction.y) < 0.99) {
      perpendicular = new Vector3(0, 1, 0).cross(direction).normalize();
    } else {
      perpendicular = new Vector3(1, 0, 0).cross(direction).normalize();
    }
    const binormal = direction.clone().cross(perpendicular).normalize();

    const baseIndex = vertices.length;
    const color = this.colorPalette[segment.color % this.colorPalette.length];

    // Generate vertices for start and end circles
    for (let ring = 0; ring < 2; ring++) {
      const center = ring === 0 ? segment.start : segment.end;
      const v = ring / 1.0;

      for (let i = 0; i <= this.radialSegments; i++) {
        const theta = (i / this.radialSegments) * Math.PI * 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);

        const offset = perpendicular.clone().multiplyScalar(cos * radius)
          .add(binormal.clone().multiplyScalar(sin * radius));
        const position = center.clone().add(offset);

        const normal = offset.clone().normalize();

        vertices.push({
          position,
          normal,
          uv: { x: i / this.radialSegments, y: v * this.uvScale },
          color
        });
      }
    }

    // Generate indices for cylinder
    const segments = this.radialSegments;
    for (let i = 0; i < segments; i++) {
      const a = baseIndex + i;
      const b = baseIndex + i + 1;
      const c = baseIndex + i + segments + 1;
      const d = baseIndex + i + segments + 2;

      // Two triangles per quad
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  /**
   * Generates leaves for branch endpoints.
   * @param segments - Array of segments
   * @param vertices - Vertex array to append to
   * @param indices - Index array to append to
   */
  private generateLeavesForSegments(
    segments: TurtleSegment[],
    vertices: MeshVertex[],
    indices: number[]
  ): void {
    const endpoints = new Map<string, Vector3>();

    // Find unique endpoints
    for (const segment of segments) {
      const key = this.vectorKey(segment.end);
      endpoints.set(key, segment.end);
    }

    // Generate leaf at each endpoint
    endpoints.forEach(position => {
      this.generateLeaf(position, vertices, indices);
    });
  }

  /**
   * Generates a simple quad leaf.
   * @param position - Leaf position
   * @param vertices - Vertex array to append to
   * @param indices - Index array to append to
   */
  private generateLeaf(
    position: Vector3,
    vertices: MeshVertex[],
    indices: number[]
  ): void {
    const baseIndex = vertices.length;
    const size = this.leafSize;
    const leafColor = this.colorPalette[1]; // Green

    // Simple billboard quad
    const positions = [
      position.clone().add(new Vector3(-size, 0, 0)),
      position.clone().add(new Vector3(size, 0, 0)),
      position.clone().add(new Vector3(size, size * 2, 0)),
      position.clone().add(new Vector3(-size, size * 2, 0))
    ];

    const normal = new Vector3(0, 0, 1);

    for (let i = 0; i < 4; i++) {
      vertices.push({
        position: positions[i],
        normal,
        uv: {
          x: i % 2,
          y: Math.floor(i / 2)
        },
        color: leafColor
      });
    }

    // Two triangles for quad
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }

  /**
   * Computes smooth normals by averaging face normals.
   * @param vertices - Vertex array
   * @param indices - Index array
   */
  private computeSmoothNormals(vertices: MeshVertex[], indices: number[]): void {
    // Reset normals
    for (const vertex of vertices) {
      vertex.normal = new Vector3(0, 0, 0);
    }

    // Accumulate face normals
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const v0 = vertices[i0].position;
      const v1 = vertices[i1].position;
      const v2 = vertices[i2].position;

      const edge1 = v1.clone().sub(v0);
      const edge2 = v2.clone().sub(v0);
      const faceNormal = edge1.cross(edge2);

      vertices[i0].normal.add(faceNormal);
      vertices[i1].normal.add(faceNormal);
      vertices[i2].normal.add(faceNormal);
    }

    // Normalize
    for (const vertex of vertices) {
      vertex.normal.normalize();
    }
  }

  /**
   * Updates bounding box.
   * @param point - Point to include
   * @param min - Current min bounds
   * @param max - Current max bounds
   */
  private updateBounds(point: Vector3, min: Vector3, max: Vector3): void {
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }

  /**
   * Generates a unique key for a vector (for deduplication).
   * @param v - Vector
   * @returns String key
   */
  private vectorKey(v: Vector3): string {
    return `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
  }

  /**
   * Gets the radial segments count.
   * @returns Number of radial segments
   */
  public getRadialSegments(): number {
    return this.radialSegments;
  }

  /**
   * Sets the radial segments count.
   * @param segments - Number of segments
   */
  public setRadialSegments(segments: number): void {
    this.radialSegments = Math.max(3, segments);
  }

  /**
   * Gets whether smooth normals are enabled.
   * @returns True if smooth normals enabled
   */
  public getSmoothNormals(): boolean {
    return this.smoothNormals;
  }

  /**
   * Sets whether to generate smooth normals.
   * @param smooth - Enable smooth normals
   */
  public setSmoothNormals(smooth: boolean): void {
    this.smoothNormals = smooth;
  }
}
