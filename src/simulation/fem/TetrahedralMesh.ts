/**
 * Tetrahedral mesh data structure for FEM simulation.
 * Stores vertices, tetrahedra, and material properties.
 * @module TetrahedralMesh
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix3 } from '../../math/Matrix3';
import { Logger } from '../../core/Logger';

const logger = Logger.get('TetrahedralMesh');

/**
 * Tetrahedron element with four vertex indices.
 */
export interface Tetrahedron {
  vertices: [number, number, number, number];
  volume: number;
  restVolume: number;
}

/**
 * Vertex in the tetrahedral mesh.
 */
export interface TetrahedralVertex {
  position: Vector3;
  restPosition: Vector3;
  velocity: Vector3;
  force: Vector3;
  mass: number;
  isFixed: boolean;
}

/**
 * Material properties for tetrahedral elements.
 */
export interface TetrahedralMaterial {
  youngsModulus: number;
  poissonsRatio: number;
  density: number;
}

/**
 * Tetrahedral mesh for FEM simulation.
 */
export class TetrahedralMesh {
  private readonly vertices: TetrahedralVertex[];
  private readonly tetrahedra: Tetrahedron[];
  private readonly material: TetrahedralMaterial;

  private readonly invRestMatrices: Matrix3[];
  private readonly deformationGradients: Matrix3[];

  /**
   * Creates a new tetrahedral mesh.
   * @param positions - Initial vertex positions
   * @param tetIndices - Tetrahedron indices (4 per tet)
   * @param material - Material properties
   */
  constructor(
    positions: Vector3[],
    tetIndices: number[],
    material: TetrahedralMaterial
  ) {
    if (tetIndices.length % 4 !== 0) {
      throw new Error('Tetrahedron indices must be multiple of 4');
    }

    this.material = material;
    this.vertices = positions.map(pos => ({
      position: pos.clone(),
      restPosition: pos.clone(),
      velocity: Vector3.zero(),
      force: Vector3.zero(),
      mass: 0,
      isFixed: false,
    }));

    this.tetrahedra = [];
    this.invRestMatrices = [];
    this.deformationGradients = [];

    for (let i = 0; i < tetIndices.length; i += 4) {
      const v0 = tetIndices[i];
      const v1 = tetIndices[i + 1];
      const v2 = tetIndices[i + 2];
      const v3 = tetIndices[i + 3];

      const volume = this.computeTetrahedronVolume(
        this.vertices[v0].restPosition,
        this.vertices[v1].restPosition,
        this.vertices[v2].restPosition,
        this.vertices[v3].restPosition
      );

      if (volume <= 0) {
        logger.warn(`Degenerate tetrahedron ${i / 4} with volume ${volume}`);
      }

      const tet: Tetrahedron = {
        vertices: [v0, v1, v2, v3],
        volume: volume,
        restVolume: volume,
      };

      this.tetrahedra.push(tet);

      const invRestMatrix = this.computeInvRestMatrix(
        this.vertices[v0].restPosition,
        this.vertices[v1].restPosition,
        this.vertices[v2].restPosition,
        this.vertices[v3].restPosition
      );

      this.invRestMatrices.push(invRestMatrix);
      this.deformationGradients.push(Matrix3.identity());

      const tetMass = material.density * volume;
      const vertexMass = tetMass / 4.0;

      this.vertices[v0].mass += vertexMass;
      this.vertices[v1].mass += vertexMass;
      this.vertices[v2].mass += vertexMass;
      this.vertices[v3].mass += vertexMass;
    }

    logger.info(
      `Tetrahedral mesh created: ${this.vertices.length} vertices, ${this.tetrahedra.length} tetrahedra`
    );
  }

  /**
   * Computes the volume of a tetrahedron.
   */
  private computeTetrahedronVolume(
    p0: Vector3,
    p1: Vector3,
    p2: Vector3,
    p3: Vector3
  ): number {
    const v1 = p1.sub(p0);
    const v2 = p2.sub(p0);
    const v3 = p3.sub(p0);

    return Math.abs(v1.dot(v2.cross(v3))) / 6.0;
  }

  /**
   * Computes the inverse of the rest configuration matrix.
   * Used for computing deformation gradients.
   */
  private computeInvRestMatrix(
    p0: Vector3,
    p1: Vector3,
    p2: Vector3,
    p3: Vector3
  ): Matrix3 {
    const e1 = p1.sub(p0);
    const e2 = p2.sub(p0);
    const e3 = p3.sub(p0);

    const restMatrix = new Matrix3(
      e1.x, e2.x, e3.x,
      e1.y, e2.y, e3.y,
      e1.z, e2.z, e3.z
    );

    return restMatrix.invert();
  }

  /**
   * Updates deformation gradients for all tetrahedra.
   */
  public updateDeformationGradients(): void {
    for (let i = 0; i < this.tetrahedra.length; i++) {
      const tet = this.tetrahedra[i];
      const [v0, v1, v2, v3] = tet.vertices;

      const p0 = this.vertices[v0].position;
      const p1 = this.vertices[v1].position;
      const p2 = this.vertices[v2].position;
      const p3 = this.vertices[v3].position;

      const e1 = p1.sub(p0);
      const e2 = p2.sub(p0);
      const e3 = p3.sub(p0);

      const deformedMatrix = new Matrix3(
        e1.x, e2.x, e3.x,
        e1.y, e2.y, e3.y,
        e1.z, e2.z, e3.z
      );

      this.deformationGradients[i] = deformedMatrix.multiply(this.invRestMatrices[i]);

      tet.volume = this.computeTetrahedronVolume(p0, p1, p2, p3);
    }
  }

  /**
   * Gets the number of vertices.
   */
  public getVertexCount(): number {
    return this.vertices.length;
  }

  /**
   * Gets the number of tetrahedra.
   */
  public getTetrahedronCount(): number {
    return this.tetrahedra.length;
  }

  /**
   * Gets a vertex.
   */
  public getVertex(index: number): TetrahedralVertex {
    return this.vertices[index];
  }

  /**
   * Gets a tetrahedron.
   */
  public getTetrahedron(index: number): Tetrahedron {
    return this.tetrahedra[index];
  }

  /**
   * Gets the deformation gradient for a tetrahedron.
   */
  public getDeformationGradient(tetIndex: number): Matrix3 {
    return this.deformationGradients[tetIndex];
  }

  /**
   * Gets the inverse rest matrix for a tetrahedron.
   */
  public getInvRestMatrix(tetIndex: number): Matrix3 {
    return this.invRestMatrices[tetIndex];
  }

  /**
   * Gets the material properties.
   */
  public getMaterial(): TetrahedralMaterial {
    return this.material;
  }

  /**
   * Sets a vertex as fixed (doesn't move).
   */
  public setVertexFixed(index: number, fixed: boolean): void {
    if (index >= 0 && index < this.vertices.length) {
      this.vertices[index].isFixed = fixed;
    }
  }

  /**
   * Fixes vertices in a region.
   */
  public fixVerticesInRegion(center: Vector3, radius: number): void {
    for (const vertex of this.vertices) {
      const distance = vertex.position.sub(center).length();
      if (distance < radius) {
        vertex.isFixed = true;
      }
    }
  }

  /**
   * Applies a force to a vertex.
   */
  public applyForceToVertex(index: number, force: Vector3): void {
    if (index >= 0 && index < this.vertices.length && !this.vertices[index].isFixed) {
      this.vertices[index].force = this.vertices[index].force.add(force);
    }
  }

  /**
   * Clears all vertex forces.
   */
  public clearForces(): void {
    for (const vertex of this.vertices) {
      vertex.force = Vector3.zero();
    }
  }

  /**
   * Gets all vertex positions.
   */
  public getPositions(): Vector3[] {
    return this.vertices.map(v => v.position.clone());
  }

  /**
   * Gets all vertex velocities.
   */
  public getVelocities(): Vector3[] {
    return this.vertices.map(v => v.velocity.clone());
  }

  /**
   * Creates a cube mesh subdivided into tetrahedra.
   */
  public static createCube(
    center: Vector3,
    size: number,
    subdivisions: number,
    material: TetrahedralMaterial
  ): TetrahedralMesh {
    const positions: Vector3[] = [];
    const tetIndices: number[] = [];

    const step = size / subdivisions;
    const halfSize = size / 2;

    const vertexMap = new Map<string, number>();

    const getOrAddVertex = (x: number, y: number, z: number): number => {
      const key = `${x},${y},${z}`;
      if (vertexMap.has(key)) {
        return vertexMap.get(key)!;
      }

      const index = positions.length;
      positions.push(
        new Vector3(
          center.x + x - halfSize,
          center.y + y - halfSize,
          center.z + z - halfSize
        )
      );
      vertexMap.set(key, index);
      return index;
    };

    for (let k = 0; k < subdivisions; k++) {
      for (let j = 0; j < subdivisions; j++) {
        for (let i = 0; i < subdivisions; i++) {
          const x0 = i * step;
          const y0 = j * step;
          const z0 = k * step;
          const x1 = (i + 1) * step;
          const y1 = (j + 1) * step;
          const z1 = (k + 1) * step;

          const v000 = getOrAddVertex(x0, y0, z0);
          const v100 = getOrAddVertex(x1, y0, z0);
          const v010 = getOrAddVertex(x0, y1, z0);
          const v110 = getOrAddVertex(x1, y1, z0);
          const v001 = getOrAddVertex(x0, y0, z1);
          const v101 = getOrAddVertex(x1, y0, z1);
          const v011 = getOrAddVertex(x0, y1, z1);
          const v111 = getOrAddVertex(x1, y1, z1);

          tetIndices.push(v000, v100, v010, v101);
          tetIndices.push(v000, v010, v001, v101);
          tetIndices.push(v010, v001, v011, v101);
          tetIndices.push(v010, v110, v100, v101);
          tetIndices.push(v010, v011, v110, v101);
          tetIndices.push(v110, v011, v111, v101);
        }
      }
    }

    return new TetrahedralMesh(positions, tetIndices, material);
  }

  /**
   * Creates a beam mesh.
   */
  public static createBeam(
    start: Vector3,
    end: Vector3,
    width: number,
    height: number,
    lengthSubdivisions: number,
    widthSubdivisions: number,
    heightSubdivisions: number,
    material: TetrahedralMaterial
  ): TetrahedralMesh {
    const length = end.sub(start).length();
    const direction = end.sub(start).normalize();

    const up = Math.abs(direction.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const right = direction.cross(up).normalize();
    const actualUp = right.cross(direction).normalize();

    const positions: Vector3[] = [];
    const tetIndices: number[] = [];

    const stepL = length / lengthSubdivisions;
    const stepW = width / widthSubdivisions;
    const stepH = height / heightSubdivisions;

    const vertexMap = new Map<string, number>();

    const getOrAddVertex = (l: number, w: number, h: number): number => {
      const key = `${l},${w},${h}`;
      if (vertexMap.has(key)) {
        return vertexMap.get(key)!;
      }

      const pos = start
        .add(direction.scale(l))
        .add(right.scale(w - width / 2))
        .add(actualUp.scale(h - height / 2));

      const index = positions.length;
      positions.push(pos);
      vertexMap.set(key, index);
      return index;
    };

    for (let li = 0; li < lengthSubdivisions; li++) {
      for (let wi = 0; wi < widthSubdivisions; wi++) {
        for (let hi = 0; hi < heightSubdivisions; hi++) {
          const l0 = li * stepL;
          const w0 = wi * stepW;
          const h0 = hi * stepH;
          const l1 = (li + 1) * stepL;
          const w1 = (wi + 1) * stepW;
          const h1 = (hi + 1) * stepH;

          const v000 = getOrAddVertex(l0, w0, h0);
          const v100 = getOrAddVertex(l1, w0, h0);
          const v010 = getOrAddVertex(l0, w1, h0);
          const v110 = getOrAddVertex(l1, w1, h0);
          const v001 = getOrAddVertex(l0, w0, h1);
          const v101 = getOrAddVertex(l1, w0, h1);
          const v011 = getOrAddVertex(l0, w1, h1);
          const v111 = getOrAddVertex(l1, w1, h1);

          tetIndices.push(v000, v100, v010, v101);
          tetIndices.push(v000, v010, v001, v101);
          tetIndices.push(v010, v001, v011, v101);
          tetIndices.push(v010, v110, v100, v101);
          tetIndices.push(v010, v011, v110, v101);
          tetIndices.push(v110, v011, v111, v101);
        }
      }
    }

    return new TetrahedralMesh(positions, tetIndices, material);
  }
}
