/**
 * Procedural geometry generation for common 3D primitives.
 * All generators produce meshes with proper normals, UVs, and tangents.
 * @module GeometryGenerator
 */

import { Mesh } from './Mesh';
import { MeshBuilder } from './MeshBuilder';
import { VertexFormat } from './VertexFormat';
import { PrimitiveTopology } from './IndexBuffer';

/**
 * Options for UV mapping on generated geometry.
 */
export interface UVOptions {
  /** Scale factor for U coordinate (default: 1) */
  uScale?: number;
  /** Scale factor for V coordinate (default: 1) */
  vScale?: number;
  /** Offset for U coordinate (default: 0) */
  uOffset?: number;
  /** Offset for V coordinate (default: 0) */
  vOffset?: number;
}

/**
 * Procedural geometry generator for common 3D primitives.
 * All methods generate meshes with positions, normals, tangents, and UVs.
 *
 * @example
 * ```typescript
 * // Generate a sphere
 * const sphere = GeometryGenerator.sphere(1.0, 32, 16);
 *
 * // Generate a box
 * const box = GeometryGenerator.box(2, 2, 2);
 *
 * // Generate a cylinder
 * const cylinder = GeometryGenerator.cylinder(1, 2, 32);
 * ```
 */
export class GeometryGenerator {
  /**
   * Generates a box (cube) mesh.
   *
   * @param width - Width along X axis (default: 1)
   * @param height - Height along Y axis (default: 1)
   * @param depth - Depth along Z axis (default: 1)
   * @param widthSegments - Number of segments along width (default: 1)
   * @param heightSegments - Number of segments along height (default: 1)
   * @param depthSegments - Number of segments along depth (default: 1)
   * @param uvOptions - UV mapping options
   * @returns Box mesh
   *
   * @example
   * ```typescript
   * const box = GeometryGenerator.box(2, 2, 2);
   * const detailedBox = GeometryGenerator.box(2, 2, 2, 4, 4, 4);
   * ```
   */
  static box(
    width: number = 1,
    height: number = 1,
    depth: number = 1,
    widthSegments: number = 1,
    heightSegments: number = 1,
    depthSegments: number = 1,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    let indexOffset = 0;

    // Helper function to add a face
    const addFace = (
      normal: [number, number, number],
      tangent: [number, number, number, number],
      corners: [number, number, number][],
      segments: [number, number]
    ) => {
      const [su, sv] = segments;
      const [c0, c1, c2, c3] = corners;

      for (let iv = 0; iv <= sv; iv++) {
        for (let iu = 0; iu <= su; iu++) {
          const u = iu / su;
          const v = iv / sv;

          const x = c0[0] * (1 - u) * (1 - v) + c1[0] * u * (1 - v) + c2[0] * u * v + c3[0] * (1 - u) * v;
          const y = c0[1] * (1 - u) * (1 - v) + c1[1] * u * (1 - v) + c2[1] * u * v + c3[1] * (1 - u) * v;
          const z = c0[2] * (1 - u) * (1 - v) + c1[2] * u * (1 - v) + c2[2] * u * v + c3[2] * (1 - u) * v;

          builder
            .position(x, y, z)
            .normal(normal[0], normal[1], normal[2])
            .tangent(tangent[0], tangent[1], tangent[2], tangent[3])
            .texCoord(u * uScale + uOffset, v * vScale + vOffset)
            .vertex();
        }
      }

      for (let iv = 0; iv < sv; iv++) {
        for (let iu = 0; iu < su; iu++) {
          const i0 = indexOffset + iv * (su + 1) + iu;
          const i1 = i0 + 1;
          const i2 = i0 + (su + 1);
          const i3 = i2 + 1;

          // CCW winding when viewed from normal direction
          // i0=bottom-left, i1=bottom-right, i2=top-left, i3=top-right
          // CCW: bottom-left -> top-left -> top-right -> bottom-right = i0, i2, i3, i1
          builder.quad(i0, i2, i3, i1);
        }
      }

      indexOffset += (su + 1) * (sv + 1);
    };

    // Front face (+Z)
    addFace(
      [0, 0, 1],
      [1, 0, 0, 1],
      [[-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d]],
      [widthSegments, heightSegments]
    );

    // Back face (-Z)
    addFace(
      [0, 0, -1],
      [-1, 0, 0, 1],
      [[w, -h, -d], [-w, -h, -d], [-w, h, -d], [w, h, -d]],
      [widthSegments, heightSegments]
    );

    // Top face (+Y)
    addFace(
      [0, 1, 0],
      [1, 0, 0, 1],
      [[-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d]],
      [widthSegments, depthSegments]
    );

    // Bottom face (-Y)
    addFace(
      [0, -1, 0],
      [1, 0, 0, 1],
      [[-w, -h, d], [w, -h, d], [w, -h, -d], [-w, -h, -d]],
      [widthSegments, depthSegments]
    );

    // Right face (+X)
    addFace(
      [1, 0, 0],
      [0, 0, -1, 1],
      [[w, -h, d], [w, -h, -d], [w, h, -d], [w, h, d]],
      [depthSegments, heightSegments]
    );

    // Left face (-X)
    addFace(
      [-1, 0, 0],
      [0, 0, 1, 1],
      [[-w, -h, -d], [-w, -h, d], [-w, h, d], [-w, h, -d]],
      [depthSegments, heightSegments]
    );

    return builder.build('Box');
  }

  /**
   * Generates a sphere mesh using UV sphere algorithm.
   *
   * @param radius - Sphere radius (default: 1)
   * @param widthSegments - Number of horizontal segments (default: 32)
   * @param heightSegments - Number of vertical segments (default: 16)
   * @param uvOptions - UV mapping options
   * @returns Sphere mesh
   *
   * @example
   * ```typescript
   * const sphere = GeometryGenerator.sphere(1.0, 32, 16);
   * const lowPolySphere = GeometryGenerator.sphere(1.0, 8, 6);
   * ```
   */
  static sphere(
    radius: number = 1,
    widthSegments: number = 32,
    heightSegments: number = 16,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    for (let lat = 0; lat <= heightSegments; lat++) {
      const theta = (lat * Math.PI) / heightSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= widthSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / widthSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        const u = lon / widthSegments;
        const v = lat / heightSegments;

        builder
          .position(radius * x, radius * y, radius * z)
          .normal(x, y, z)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    for (let lat = 0; lat < heightSegments; lat++) {
      for (let lon = 0; lon < widthSegments; lon++) {
        const first = lat * (widthSegments + 1) + lon;
        const second = first + widthSegments + 1;

        // CCW winding when viewed from outside (normal direction)
        builder.quad(first, second, second + 1, first + 1);
      }
    }

    return builder.build('Sphere');
  }

  /**
   * Generates a cylinder mesh.
   *
   * @param radius - Cylinder radius (default: 1)
   * @param height - Cylinder height (default: 2)
   * @param radialSegments - Number of segments around the cylinder (default: 32)
   * @param heightSegments - Number of segments along height (default: 1)
   * @param openEnded - Whether to leave ends open (default: false)
   * @param uvOptions - UV mapping options
   * @returns Cylinder mesh
   *
   * @example
   * ```typescript
   * const cylinder = GeometryGenerator.cylinder(1, 2, 32);
   * const pipe = GeometryGenerator.cylinder(1, 2, 32, 1, true);
   * ```
   */
  static cylinder(
    radius: number = 1,
    height: number = 2,
    radialSegments: number = 32,
    heightSegments: number = 1,
    openEnded: boolean = false,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    const halfHeight = height / 2;

    // Generate side
    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const yPos = -halfHeight + v * height;

      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * Math.PI * 2;

        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        builder
          .position(radius * cosTheta, yPos, radius * sinTheta)
          .normal(cosTheta, 0, sinTheta)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < radialSegments; x++) {
        const first = y * (radialSegments + 1) + x;
        const second = first + radialSegments + 1;

        // CCW winding when viewed from outside (normal direction)
        builder.quad(first, second, second + 1, first + 1);
      }
    }

    if (!openEnded) {
      const baseIndexOffset = (heightSegments + 1) * (radialSegments + 1);

      // Top cap
      builder.position(0, halfHeight, 0).normal(0, 1, 0).texCoord(0.5, 0.5).vertex();
      const topCenterIndex = baseIndexOffset;

      for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        builder
          .position(radius * cosTheta, halfHeight, radius * sinTheta)
          .normal(0, 1, 0)
          .texCoord(0.5 + 0.5 * cosTheta, 0.5 + 0.5 * sinTheta)
          .vertex();
      }

      for (let i = 0; i < radialSegments; i++) {
        builder.triangle(topCenterIndex, topCenterIndex + i + 1, topCenterIndex + i + 2);
      }

      // Bottom cap
      const bottomCenterIndex = topCenterIndex + radialSegments + 2;
      builder.position(0, -halfHeight, 0).normal(0, -1, 0).texCoord(0.5, 0.5).vertex();

      for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        builder
          .position(radius * cosTheta, -halfHeight, radius * sinTheta)
          .normal(0, -1, 0)
          .texCoord(0.5 + 0.5 * cosTheta, 0.5 - 0.5 * sinTheta)
          .vertex();
      }

      for (let i = 0; i < radialSegments; i++) {
        builder.triangle(bottomCenterIndex, bottomCenterIndex + i + 2, bottomCenterIndex + i + 1);
      }
    }

    return builder.build('Cylinder');
  }

  /**
   * Generates a cone mesh.
   *
   * @param radius - Base radius (default: 1)
   * @param height - Cone height (default: 2)
   * @param radialSegments - Number of segments around the cone (default: 32)
   * @param heightSegments - Number of segments along height (default: 1)
   * @param openEnded - Whether to leave base open (default: false)
   * @param uvOptions - UV mapping options
   * @returns Cone mesh
   *
   * @example
   * ```typescript
   * const cone = GeometryGenerator.cone(1, 2, 32);
   * ```
   */
  static cone(
    radius: number = 1,
    height: number = 2,
    radialSegments: number = 32,
    heightSegments: number = 1,
    openEnded: boolean = false,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    const halfHeight = height / 2;
    const slope = Math.atan(radius / height);
    const cosSlope = Math.cos(slope);
    const sinSlope = Math.sin(slope);

    // Generate side
    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const yPos = -halfHeight + v * height;
      const currentRadius = radius * (1 - v);

      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * Math.PI * 2;

        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        const nx = cosTheta * sinSlope;
        const ny = cosSlope;
        const nz = sinTheta * sinSlope;

        builder
          .position(currentRadius * cosTheta, yPos, currentRadius * sinTheta)
          .normal(nx, ny, nz)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < radialSegments; x++) {
        const first = y * (radialSegments + 1) + x;
        const second = first + radialSegments + 1;

        // CCW winding when viewed from outside (normal direction)
        builder.quad(first, second, second + 1, first + 1);
      }
    }

    if (!openEnded) {
      // Bottom cap
      const baseIndexOffset = (heightSegments + 1) * (radialSegments + 1);
      builder.position(0, -halfHeight, 0).normal(0, -1, 0).texCoord(0.5, 0.5).vertex();
      const centerIndex = baseIndexOffset;

      for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        builder
          .position(radius * cosTheta, -halfHeight, radius * sinTheta)
          .normal(0, -1, 0)
          .texCoord(0.5 + 0.5 * cosTheta, 0.5 - 0.5 * sinTheta)
          .vertex();
      }

      for (let i = 0; i < radialSegments; i++) {
        builder.triangle(centerIndex, centerIndex + i + 2, centerIndex + i + 1);
      }
    }

    return builder.build('Cone');
  }

  /**
   * Generates a torus (donut) mesh.
   *
   * @param radius - Major radius (distance from center to tube center, default: 1)
   * @param tubeRadius - Minor radius (tube thickness, default: 0.4)
   * @param radialSegments - Number of segments around the tube (default: 16)
   * @param tubularSegments - Number of segments around the torus (default: 32)
   * @param uvOptions - UV mapping options
   * @returns Torus mesh
   *
   * @example
   * ```typescript
   * const torus = GeometryGenerator.torus(1, 0.4, 16, 32);
   * ```
   */
  static torus(
    radius: number = 1,
    tubeRadius: number = 0.4,
    radialSegments: number = 16,
    tubularSegments: number = 32,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const phi = v * Math.PI * 2;

      for (let i = 0; i <= tubularSegments; i++) {
        const u = i / tubularSegments;
        const theta = u * Math.PI * 2;

        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        const x = (radius + tubeRadius * cosPhi) * cosTheta;
        const y = tubeRadius * sinPhi;
        const z = (radius + tubeRadius * cosPhi) * sinTheta;

        const nx = cosPhi * cosTheta;
        const ny = sinPhi;
        const nz = cosPhi * sinTheta;

        builder
          .position(x, y, z)
          .normal(nx, ny, nz)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    for (let j = 0; j < radialSegments; j++) {
      for (let i = 0; i < tubularSegments; i++) {
        const first = j * (tubularSegments + 1) + i;
        const second = first + tubularSegments + 1;

        // CCW winding when viewed from outside (normal direction)
        builder.quad(first, second, second + 1, first + 1);
      }
    }

    return builder.build('Torus');
  }

  /**
   * Generates a plane mesh.
   *
   * @param width - Width along X axis (default: 1)
   * @param height - Height along Z axis (default: 1)
   * @param widthSegments - Number of segments along width (default: 1)
   * @param heightSegments - Number of segments along height (default: 1)
   * @param uvOptions - UV mapping options
   * @returns Plane mesh
   *
   * @example
   * ```typescript
   * const plane = GeometryGenerator.plane(10, 10, 1, 1);
   * const detailedPlane = GeometryGenerator.plane(10, 10, 10, 10);
   * ```
   */
  static plane(
    width: number = 1,
    height: number = 1,
    widthSegments: number = 1,
    heightSegments: number = 1,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    for (let iz = 0; iz <= heightSegments; iz++) {
      const v = iz / heightSegments;
      const z = -halfHeight + v * height;

      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;
        const x = -halfWidth + u * width;

        builder
          .position(x, 0, z)
          .normal(0, 1, 0)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    for (let iz = 0; iz < heightSegments; iz++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const first = iz * (widthSegments + 1) + ix;
        const second = first + widthSegments + 1;

        // Winding order: CCW when viewed from above (positive Y)
        // first=far-left (0), first+1=far-right (1), second=near-left (2), second+1=near-right (3)
        // CCW from +Y: need to go counter-clockwise = far-left -> near-left -> near-right -> far-right
        builder.quad(first, second, second + 1, first + 1);
      }
    }

    return builder.build('Plane');
  }

  /**
   * Generates a grid mesh (same as plane but returns wireframe).
   *
   * @param width - Grid width (default: 10)
   * @param height - Grid height (default: 10)
   * @param divisions - Number of divisions (default: 10)
   * @returns Grid mesh with line topology
   *
   * @example
   * ```typescript
   * const grid = GeometryGenerator.grid(10, 10, 10);
   * ```
   */
  static grid(width: number = 10, height: number = 10, divisions: number = 10): Mesh {
    const builder = new MeshBuilder(VertexFormat.P3()).begin(PrimitiveTopology.LineList);

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const step = width / divisions;

    // Horizontal lines
    for (let i = 0; i <= divisions; i++) {
      const z = -halfHeight + (i / divisions) * height;
      const v0 = builder.position(-halfWidth, 0, z).vertex();
      const v1 = builder.position(halfWidth, 0, z).vertex();
      builder.indices([v0, v1]);
    }

    // Vertical lines
    for (let i = 0; i <= divisions; i++) {
      const x = -halfWidth + (i / divisions) * width;
      const v0 = builder.position(x, 0, -halfHeight).vertex();
      const v1 = builder.position(x, 0, halfHeight).vertex();
      builder.indices([v0, v1]);
    }

    return builder.build('Grid');
  }

  /**
   * Generates a quad mesh (2 triangles).
   *
   * @param width - Quad width (default: 1)
   * @param height - Quad height (default: 1)
   * @param uvOptions - UV mapping options
   * @returns Quad mesh
   *
   * @example
   * ```typescript
   * const quad = GeometryGenerator.quad(2, 2);
   * ```
   */
  static quad(width: number = 1, height: number = 1, uvOptions: UVOptions = {}): Mesh {
    return this.plane(width, height, 1, 1, uvOptions);
  }

  /**
   * Generates a capsule mesh (cylinder with hemisphere caps).
   *
   * @param radius - Capsule radius (default: 0.5)
   * @param height - Height of cylindrical section (default: 1)
   * @param radialSegments - Number of radial segments (default: 16)
   * @param heightSegments - Number of height segments (default: 1)
   * @param uvOptions - UV mapping options
   * @returns Capsule mesh
   *
   * @example
   * ```typescript
   * const capsule = GeometryGenerator.capsule(0.5, 1, 16);
   * ```
   */
  static capsule(
    radius: number = 0.5,
    height: number = 1,
    radialSegments: number = 16,
    heightSegments: number = 1,
    uvOptions: UVOptions = {}
  ): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateTangents(true);

    const halfHeight = height / 2;
    const hemisphereSegments = Math.floor(radialSegments / 2);

    // Top hemisphere
    for (let lat = 0; lat <= hemisphereSegments; lat++) {
      const theta = (lat * Math.PI) / (2 * hemisphereSegments);
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= radialSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / radialSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        const u = lon / radialSegments;
        const v = lat / (hemisphereSegments * 2 + heightSegments);

        builder
          .position(radius * x, halfHeight + radius * y, radius * z)
          .normal(x, y, z)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    // Cylindrical section
    const cylinderStartIndex = (hemisphereSegments + 1) * (radialSegments + 1);
    for (let y = 0; y <= heightSegments; y++) {
      const v = (hemisphereSegments + y) / (hemisphereSegments * 2 + heightSegments);
      const yPos = halfHeight - (y / heightSegments) * height;

      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * Math.PI * 2;

        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        builder
          .position(radius * cosTheta, yPos, radius * sinTheta)
          .normal(cosTheta, 0, sinTheta)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    // Bottom hemisphere
    for (let lat = 0; lat <= hemisphereSegments; lat++) {
      const theta = Math.PI / 2 + (lat * Math.PI) / (2 * hemisphereSegments);
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= radialSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / radialSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        const u = lon / radialSegments;
        const v = (hemisphereSegments + heightSegments + lat) / (hemisphereSegments * 2 + heightSegments);

        builder
          .position(radius * x, -halfHeight + radius * y, radius * z)
          .normal(x, y, z)
          .texCoord(u * uScale + uOffset, v * vScale + vOffset)
          .vertex();
      }
    }

    // Generate indices
    const totalRings = hemisphereSegments * 2 + heightSegments + 2;
    for (let lat = 0; lat < totalRings - 1; lat++) {
      for (let lon = 0; lon < radialSegments; lon++) {
        const first = lat * (radialSegments + 1) + lon;
        const second = first + radialSegments + 1;

        // CCW winding when viewed from outside (normal direction)
        builder.quad(first, second, second + 1, first + 1);
      }
    }

    return builder.build('Capsule');
  }

  /**
   * Generates a pyramid mesh (square base).
   *
   * @param size - Base size (default: 1)
   * @param height - Pyramid height (default: 1)
   * @param uvOptions - UV mapping options
   * @returns Pyramid mesh
   *
   * @example
   * ```typescript
   * const pyramid = GeometryGenerator.pyramid(2, 2);
   * ```
   */
  static pyramid(size: number = 1, height: number = 1, uvOptions: UVOptions = {}): Mesh {
    const { uScale = 1, vScale = 1, uOffset = 0, vOffset = 0 } = uvOptions;
    const builder = new MeshBuilder(VertexFormat.P3N3T4T2())
      .begin(PrimitiveTopology.TriangleList)
      .setGenerateNormals(true)
      .setGenerateTangents(true);

    const half = size / 2;

    // Base vertices
    const v0 = builder.position(-half, 0, -half).texCoord(0, 0).vertex();
    const v1 = builder.position(half, 0, -half).texCoord(1, 0).vertex();
    const v2 = builder.position(half, 0, half).texCoord(1, 1).vertex();
    const v3 = builder.position(-half, 0, half).texCoord(0, 1).vertex();

    // Apex
    const apex = builder.position(0, height, 0).texCoord(0.5, 0.5).vertex();

    // Base
    builder.quad(v0, v3, v2, v1);

    // Sides
    builder.triangle(v0, v1, apex);
    builder.triangle(v1, v2, apex);
    builder.triangle(v2, v3, apex);
    builder.triangle(v3, v0, apex);

    return builder.build('Pyramid');
  }

  // ============================================
  // Aliases for common naming conventions
  // ============================================

  /** Alias for box() */
  static createBox = GeometryGenerator.box;
  /** Alias for sphere() */
  static createSphere = GeometryGenerator.sphere;
  /** Alias for cylinder() */
  static createCylinder = GeometryGenerator.cylinder;
  /** Alias for cone() */
  static createCone = GeometryGenerator.cone;
  /** Alias for plane() */
  static createPlane = GeometryGenerator.plane;
  /** Alias for torus() */
  static createTorus = GeometryGenerator.torus;
  /** Alias for capsule() */
  static createCapsule = GeometryGenerator.capsule;
}
