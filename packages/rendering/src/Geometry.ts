import { IndexBuffer } from "./IndexBuffer";
import { type PrimitiveTopology } from "./RenderDevice";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat } from "./VertexFormat";

export interface Bounds3 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface CylinderGeometryOptions {
  /** Legacy shorthand: sets both radii. `radiusTop`/`radiusBottom` win when set. */
  readonly radius?: number;
  readonly radiusTop?: number;
  readonly radiusBottom?: number;
  readonly height?: number;
  readonly segments?: number;
  readonly heightSegments?: number;
  readonly capped?: boolean;
  /** C-07 (PRD-01): `openEnded` is the inverse of `capped`; wins when both are set. */
  readonly openEnded?: boolean;
  readonly textured?: boolean;
}

export interface CapsuleGeometryOptions {
  readonly radius?: number;
  readonly height?: number;
  readonly segments?: number;
  readonly rings?: number;
  /** C-07 (PRD-01 §6.3): x/z radius ratio; 1 = circular cross-section. */
  readonly ellipticity?: number;
  readonly textured?: boolean;
}

/** Torus in the XY plane (axis +Z), engine proportions radius 0.43 / tube 0.045. */
export interface TorusGeometryOptions {
  readonly radius?: number;
  readonly tube?: number;
  /** Divisions around the main ring (legacy `radialSegments`, default 64). */
  readonly radialSegments?: number;
  /** Divisions around the tube cross-section (legacy `tubeSegments`, default 16). */
  readonly tubularSegments?: number;
  readonly textured?: boolean;
}

export interface PlaneGeometryOptions {
  readonly widthSegments?: number;
  readonly heightSegments?: number;
  /** C-07: emit P3N3T4T2 (uv + tangent) instead of P3N3. Default false = legacy. */
  readonly textured?: boolean;
}

export interface BoxGeometryOptions {
  readonly widthSegments?: number;
  readonly heightSegments?: number;
  readonly depthSegments?: number;
  /** Default true for the C-07 path (emits P3N3T4T2). */
  readonly textured?: boolean;
}

export interface WideLineSegment {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly width: number;
}

/** A polyline for screen-space fat-line rendering. */
export interface ScreenSpaceLineSegment {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
}

export interface UVSphereGeometryOptions {
  readonly textured?: boolean;
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

  /**
   * Geometry for true screen-space fat lines.
   *
   * Unlike `wideLineSegments`, which bakes a world-space half-width offset into vertex
   * positions, this carries both endpoints and a corner selector per vertex so the
   * *vertex shader* can project the endpoints and expand the quad in pixel space. That
   * is what makes the rendered width independent of distance, field of view, viewport
   * size, and device pixel ratio — the property world-space quads cannot provide,
   * because a world-space offset shrinks with perspective.
   *
   * `lineDistance` accumulates arc length along the polyline so the fragment stage can
   * apply dash patterns in world units.
   */
  static screenSpaceLineSegments(segments: readonly ScreenSpaceLineSegment[]): Geometry {
    if (segments.length === 0) {
      throw new Error("Screen-space line geometry requires at least one segment");
    }
    const vertices = new VertexBuffer(VertexFormat.SCREEN_SPACE_LINE, segments.length * 4);
    const indices: number[] = [];
    let accumulatedDistance = 0;

    segments.forEach((segment, segmentIndex) => {
      validateScreenSpaceLineSegment(segment, segmentIndex);
      const start = segment.start;
      const end = segment.end;
      const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      const startDistance = accumulatedDistance;
      const endDistance = accumulatedDistance + segmentLength;
      accumulatedDistance = endDistance;

      // Four corners: (side, alongSegment). Position is set to the corresponding
      // endpoint so world-space bounds stay meaningful for culling and framing even
      // though the shader recomputes placement.
      //
      // Order matters: the shader expands along normal = (-dir.y, dir.x), so a
      // (-1, 0), (+1, 0), (+1, 1), (-1, 1) walk winds clockwise on screen and is
      // backface-culled. Starting from the +1 side yields counter-clockwise triangles.
      const corners: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [-1, 1], [1, 1]];
      const base = segmentIndex * 4;
      corners.forEach((corner, cornerIndex) => {
        const atEnd = corner[1] === 1;
        const anchor = atEnd ? end : start;
        const index = base + cornerIndex;
        vertices.setAttribute(index, "position", [anchor[0], anchor[1], anchor[2]]);
        vertices.setAttribute(index, "lineStart", [start[0], start[1], start[2]]);
        vertices.setAttribute(index, "lineEnd", [end[0], end[1], end[2]]);
        vertices.setAttribute(index, "lineCorner", [corner[0], corner[1]]);
        vertices.setAttribute(index, "lineDistance", [atEnd ? endDistance : startDistance]);
      });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });

    return new Geometry(vertices, new IndexBuffer(indices, segments.length * 4), "triangles");
  }

  static wideLineSegments(segments: readonly WideLineSegment[]): Geometry {
    if (segments.length === 0) {
      throw new Error("Wide line geometry requires at least one segment");
    }
    const vertices = new VertexBuffer(VertexFormat.P3, segments.length * 4);
    const indices: number[] = [];
    segments.forEach((segment, segmentIndex) => {
      validateWideLineSegment(segment, segmentIndex);
      const [sx, sy, sz] = segment.start;
      const [ex, ey, ez] = segment.end;
      const dx = ex - sx;
      const dy = ey - sy;
      const dz = ez - sz;
      const length = Math.hypot(dx, dy, dz);
      const up = Math.abs(dz / length) > 0.92 ? [0, 1, 0] as const : [0, 0, 1] as const;
      const nx = dy * up[2] - dz * up[1];
      const ny = dz * up[0] - dx * up[2];
      const nz = dx * up[1] - dy * up[0];
      const normalLength = Math.hypot(nx, ny, nz);
      const halfWidth = segment.width * 0.5;
      const ox = nx / normalLength * halfWidth;
      const oy = ny / normalLength * halfWidth;
      const oz = nz / normalLength * halfWidth;
      const base = segmentIndex * 4;
      vertices.setAttribute(base, "position", [sx - ox, sy - oy, sz - oz]);
      vertices.setAttribute(base + 1, "position", [sx + ox, sy + oy, sz + oz]);
      vertices.setAttribute(base + 2, "position", [ex + ox, ey + oy, ez + oz]);
      vertices.setAttribute(base + 3, "position", [ex - ox, ey - oy, ez - oz]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return new Geometry(vertices, new IndexBuffer(indices, segments.length * 4), "triangles");
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

  /** Unit XZ floor plane with upward-facing normals. */
  static litPlane(options: PlaneGeometryOptions = {}): Geometry {
    const widthSegments = Math.max(1, Math.floor(options.widthSegments ?? 1));
    const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));
    const textured = options.textured === true;
    const vertexCount = (widthSegments + 1) * (heightSegments + 1);
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, vertexCount);
    for (let j = 0; j <= heightSegments; j += 1) {
      for (let i = 0; i <= widthSegments; i += 1) {
        const index = j * (widthSegments + 1) + i;
        vertices.setAttribute(index, "position", [i / widthSegments - 0.5, 0, j / heightSegments - 0.5]);
        vertices.setAttribute(index, "normal", [0, 1, 0]);
        if (textured) {
          vertices.setAttribute(index, "tangent", [1, 0, 0, 1]);
          vertices.setAttribute(index, "uv", [i / widthSegments, j / heightSegments]);
        }
      }
    }
    const indices: number[] = [];
    const stride = widthSegments + 1;
    for (let j = 0; j < heightSegments; j += 1) {
      for (let i = 0; i < widthSegments; i += 1) {
        const a = j * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        // CCW from +Y (legacy litPlane winding 0,2,1 / 0,3,2).
        indices.push(a, d, b, a, c, d);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
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

  static uvSphere(radius = 0.5, segments = 48, rings = 24, options: UVSphereGeometryOptions = {}): Geometry {
    if (radius <= 0) {
      throw new Error("Sphere radius must be positive");
    }
    if (!Number.isInteger(segments) || !Number.isInteger(rings) || segments < 3 || rings < 2) {
      throw new Error("Sphere segments and rings must be integers with segments >= 3 and rings >= 2");
    }
    const textured = options.textured === true;
    const vertexCount = (rings + 1) * (segments + 1);
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, vertexCount);
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
        if (textured) {
          vertices.setAttribute(vertex, "tangent", [-Math.sin(phi), 0, Math.cos(phi), 1]);
          vertices.setAttribute(vertex, "uv", [u, v]);
        }
        vertex += 1;
      }
    }
    const indices: number[] = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * stride + segment;
        const b = a + stride;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
  }

  static cylinder(options: CylinderGeometryOptions = {}): Geometry {
    const radius = options.radius ?? 0.5;
    const radiusTop = options.radiusTop ?? radius;
    const radiusBottom = options.radiusBottom ?? radius;
    const height = options.height ?? 1;
    const segments = options.segments ?? 48;
    const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));
    const capped = options.openEnded !== undefined ? !options.openEnded : (options.capped ?? true);
    validatePositiveFinite(radiusTop, "Cylinder radiusTop");
    validatePositiveFinite(radiusBottom, "Cylinder radiusBottom");
    validatePositiveFinite(height, "Cylinder height");
    validateSegments(segments, "Cylinder segments", 3);
    const half = height / 2;
    const textured = options.textured === true;
    // Side normals tilt by the frustum slope (rB - rT)/height.
    const slope = (radiusBottom - radiusTop) / height;
    const slopeLen = Math.hypot(1, slope);
    const vertices: GeneratedVertex[] = [];
    const indices: number[] = [];
    const rows = heightSegments + 1;

    for (let segment = 0; segment <= segments; segment += 1) {
      const u = segment / segments;
      const angle = u * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const normal: Vec3 = [cos / slopeLen, slope / slopeLen, sin / slopeLen];
      const tangent: Vec4 = [-sin, 0, cos, 1];
      for (let row = 0; row < rows; row += 1) {
        const v = row / heightSegments;
        const r = radiusBottom + (radiusTop - radiusBottom) * v;
        vertices.push(makeGeneratedVertex([cos * r, -half + v * height, sin * r], normal, [u, v], tangent, textured));
      }
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const base = segment * rows;
      for (let row = 0; row < heightSegments; row += 1) {
        const a = base + row;
        const b = a + rows;
        indices.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }

    if (capped) {
      const bottomCenter = vertices.length;
      vertices.push(makeGeneratedVertex([0, -half, 0], [0, -1, 0], [0.5, 0.5], [1, 0, 0, 1], textured));
      const bottomStart = vertices.length;
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(makeGeneratedVertex([cos * radiusBottom, -half, sin * radiusBottom], [0, -1, 0], [0.5 + cos * 0.5, 0.5 + sin * 0.5], [1, 0, 0, 1], textured));
      }
      for (let segment = 0; segment < segments; segment += 1) {
        indices.push(bottomCenter, bottomStart + segment, bottomStart + segment + 1);
      }

      const topCenter = vertices.length;
      vertices.push(makeGeneratedVertex([0, half, 0], [0, 1, 0], [0.5, 0.5], [1, 0, 0, 1], textured));
      const topStart = vertices.length;
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(makeGeneratedVertex([cos * radiusTop, half, sin * radiusTop], [0, 1, 0], [0.5 + cos * 0.5, 0.5 + sin * 0.5], [1, 0, 0, 1], textured));
      }
      for (let segment = 0; segment < segments; segment += 1) {
        indices.push(topCenter, topStart + segment + 1, topStart + segment);
      }
    }

    return generatedGeometry(vertices, indices, textured);
  }

  static capsule(options: CapsuleGeometryOptions = {}): Geometry {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 1.8;
    const segments = options.segments ?? 48;
    const rings = options.rings ?? 12;
    validatePositiveFinite(radius, "Capsule radius");
    validatePositiveFinite(height, "Capsule height");
    if (height < radius * 2) {
      throw new Error("Capsule height must be at least diameter");
    }
    validateSegments(segments, "Capsule segments", 3);
    validateSegments(rings, "Capsule rings", 2);
    const ellipticity = options.ellipticity ?? 1;
    validatePositiveFinite(ellipticity, "Capsule ellipticity");
    const cylinderHalf = height / 2 - radius;
    const textured = options.textured === true;
    const vertices: GeneratedVertex[] = [];
    const indices: number[] = [];
    const ringDescriptors: { readonly theta: number; readonly centerOffset: number }[] = [];

    for (let ring = 0; ring <= rings; ring += 1) {
      ringDescriptors.push({ theta: (ring / rings) * (Math.PI / 2), centerOffset: cylinderHalf });
    }
    for (let ring = 0; ring <= rings; ring += 1) {
      ringDescriptors.push({ theta: Math.PI / 2 + (ring / rings) * (Math.PI / 2), centerOffset: -cylinderHalf });
    }

    ringDescriptors.forEach((descriptor, ringIndex) => {
      const radial = Math.sin(descriptor.theta);
      const yNormal = Math.cos(descriptor.theta);
      const y = descriptor.centerOffset + yNormal * radius;
      const v = ringIndex / Math.max(1, ringDescriptors.length - 1);
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Ellipticity scales x only; normals use the inverse-transpose rule.
        const normal: Vec3 = ellipticity === 1
          ? normalize3([cos * radial, yNormal, sin * radial])
          : normalize3([(cos * radial) / ellipticity, yNormal, sin * radial]);
        const tangent: Vec4 = [-sin, 0, cos, 1];
        vertices.push(makeGeneratedVertex([cos * radial * radius * ellipticity, y, sin * radial * radius], normal, [u, v], tangent, textured));
      }
    });

    const stride = segments + 1;
    for (let ring = 0; ring < ringDescriptors.length - 1; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * stride + segment;
        const b = a + stride;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }

    return generatedGeometry(vertices, indices, textured);
  }

  /**
   * Torus in the XY plane (axis +Z) — same orientation and proportions as the
   * legacy engine generator (`index.ts` createTorusGeometry), with UVs and
   * tangents for the C-07 textured path.
   */
  static torus(options: TorusGeometryOptions = {}): Geometry {
    const radius = options.radius ?? 0.43;
    const tube = options.tube ?? 0.045;
    const radialSegments = options.radialSegments ?? 64;
    const tubularSegments = options.tubularSegments ?? 16;
    validatePositiveFinite(radius, "Torus radius");
    validatePositiveFinite(tube, "Torus tube");
    validateSegments(radialSegments, "Torus radialSegments", 3);
    validateSegments(tubularSegments, "Torus tubularSegments", 3);
    const textured = options.textured !== false;
    const vertexCount = (radialSegments + 1) * (tubularSegments + 1);
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, vertexCount);
    let vertex = 0;
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const u = radial / radialSegments;
      const phi = u * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      for (let tubeIndex = 0; tubeIndex <= tubularSegments; tubeIndex += 1) {
        const v = tubeIndex / tubularSegments;
        const theta = v * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const nx = cosTheta * cosPhi;
        const ny = cosTheta * sinPhi;
        const nz = sinTheta;
        vertices.setAttribute(vertex, "position", [
          cosPhi * (radius + tube * cosTheta),
          sinPhi * (radius + tube * cosTheta),
          tube * sinTheta
        ]);
        vertices.setAttribute(vertex, "normal", [nx, ny, nz]);
        if (textured) {
          vertices.setAttribute(vertex, "tangent", [-sinPhi, cosPhi, 0, 1]);
          vertices.setAttribute(vertex, "uv", [u, v]);
        }
        vertex += 1;
      }
    }
    const indices: number[] = [];
    const stride = tubularSegments + 1;
    for (let radial = 0; radial < radialSegments; radial += 1) {
      for (let tubeIndex = 0; tubeIndex < tubularSegments; tubeIndex += 1) {
        const a = radial * stride + tubeIndex;
        const b = a + stride;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
  }

  /**
   * Unit box (−0.5..0.5) with per-face segment subdivision, UVs and tangents
   * (C-07). Segment counts map per face: ±z use width×height, ±x use
   * depth×height, ±y use width×depth.
   */
  static box(options: BoxGeometryOptions = {}): Geometry {
    const widthSegments = Math.max(1, Math.floor(options.widthSegments ?? 1));
    const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));
    const depthSegments = Math.max(1, Math.floor(options.depthSegments ?? 1));
    const textured = options.textured !== false;
    const half = 0.5;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const tangents: number[] = [];
    const indices: number[] = [];
    const emitFace = (
      normal: readonly [number, number, number],
      tangent: readonly [number, number, number, number],
      origin: readonly [number, number, number],
      uAxis: readonly [number, number, number],
      vAxis: readonly [number, number, number],
      uSegs: number,
      vSegs: number
    ): void => {
      const base = positions.length / 3;
      for (let j = 0; j <= vSegs; j += 1) {
        for (let i = 0; i <= uSegs; i += 1) {
          const u = i / uSegs;
          const v = j / vSegs;
          positions.push(
            origin[0] + uAxis[0] * u + vAxis[0] * v,
            origin[1] + uAxis[1] * u + vAxis[1] * v,
            origin[2] + uAxis[2] * u + vAxis[2] * v
          );
          normals.push(normal[0], normal[1], normal[2]);
          uvs.push(u, v);
          tangents.push(tangent[0], tangent[1], tangent[2], tangent[3]);
        }
      }
      const stride = uSegs + 1;
      for (let j = 0; j < vSegs; j += 1) {
        for (let i = 0; i < uSegs; i += 1) {
          const a = base + j * stride + i;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          indices.push(a, b, d, a, d, c);
        }
      }
    };
    // Corners/tangents mirror texturedCube so a 1×1×1 box renders identically.
    emitFace([0, 0, 1], [1, 0, 0, 1], [-half, -half, half], [1, 0, 0], [0, 1, 0], widthSegments, heightSegments);
    emitFace([0, 0, -1], [-1, 0, 0, 1], [half, -half, -half], [-1, 0, 0], [0, 1, 0], widthSegments, heightSegments);
    emitFace([1, 0, 0], [0, 0, -1, 1], [half, -half, half], [0, 0, -1], [0, 1, 0], depthSegments, heightSegments);
    emitFace([-1, 0, 0], [0, 0, 1, 1], [-half, -half, -half], [0, 0, 1], [0, 1, 0], depthSegments, heightSegments);
    emitFace([0, 1, 0], [1, 0, 0, 1], [-half, half, half], [1, 0, 0], [0, 0, -1], widthSegments, depthSegments);
    emitFace([0, -1, 0], [1, 0, 0, 1], [-half, -half, -half], [1, 0, 0], [0, 0, 1], widthSegments, depthSegments);
    const count = positions.length / 3;
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, count);
    for (let i = 0; i < count; i += 1) {
      vertices.setAttribute(i, "position", [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!]);
      vertices.setAttribute(i, "normal", [normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!]);
      if (textured) {
        vertices.setAttribute(i, "uv", [uvs[i * 2]!, uvs[i * 2 + 1]!]);
        vertices.setAttribute(i, "tangent", [tangents[i * 4]!, tangents[i * 4 + 1]!, tangents[i * 4 + 2]!, tangents[i * 4 + 3]!]);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, count));
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

function validateScreenSpaceLineSegment(segment: ScreenSpaceLineSegment, index: number): void {
  for (const [label, point] of [["start", segment.start], ["end", segment.end]] as const) {
    if (point.length !== 3 || point.some((component) => !Number.isFinite(component))) {
      throw new Error(`Screen-space line segment ${index} ${label} must contain three finite components`);
    }
  }
  const length = Math.hypot(
    segment.end[0] - segment.start[0],
    segment.end[1] - segment.start[1],
    segment.end[2] - segment.start[2]
  );
  // A zero-length segment has no direction, so the shader cannot derive a perpendicular
  // to expand along and would emit a degenerate quad.
  if (length <= 1e-6) {
    throw new Error(`Screen-space line segment ${index} must have non-zero length`);
  }
}

function validateWideLineSegment(segment: WideLineSegment, index: number): void {
  if (segment.start.length !== 3 || segment.end.length !== 3) {
    throw new Error(`Wide line segment ${index} endpoints must be vec3 values`);
  }
  if ([...segment.start, ...segment.end].some((value) => !Number.isFinite(value))) {
    throw new Error(`Wide line segment ${index} endpoints must be finite`);
  }
  if (!Number.isFinite(segment.width) || segment.width <= 0) {
    throw new Error(`Wide line segment ${index} width must be finite and positive`);
  }
  if (Math.hypot(
    segment.end[0] - segment.start[0],
    segment.end[1] - segment.start[1],
    segment.end[2] - segment.start[2]
  ) <= 1e-8) {
    throw new Error(`Wide line segment ${index} must have non-zero length`);
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

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];

interface GeneratedVertex {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly uv?: Vec2;
  readonly tangent?: Vec4;
}

function generatedGeometry(vertices: readonly GeneratedVertex[], indices: readonly number[], textured: boolean): Geometry {
  const format = textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3;
  const buffer = new VertexBuffer(format, vertices.length);
  vertices.forEach((vertex, index) => {
    buffer.setAttribute(index, "position", vertex.position);
    buffer.setAttribute(index, "normal", vertex.normal);
    if (textured) {
      buffer.setAttribute(index, "tangent", vertex.tangent ?? [1, 0, 0, 1]);
      buffer.setAttribute(index, "uv", vertex.uv ?? [0, 0]);
    }
  });
  return new Geometry(buffer, new IndexBuffer([...indices], vertices.length));
}

function makeGeneratedVertex(position: Vec3, normal: Vec3, uv: Vec2, tangent: Vec4, textured: boolean): GeneratedVertex {
  return textured ? { position, normal, uv, tangent } : { position, normal };
}

function validatePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive`);
  }
}

function validateSegments(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
}

function normalize3(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}
