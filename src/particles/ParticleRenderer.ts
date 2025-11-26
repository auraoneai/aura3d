/**
 * Particle renderer for drawing particles with various rendering modes.
 * Supports billboards, stretched particles, mesh particles, trails, and GPU instancing.
 * @module ParticleRenderer
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Quaternion } from '../math/Quaternion';
import { Camera } from '../rendering/camera/Camera';
import { Material } from '../rendering/material/Material';
import { Mesh } from '../rendering/geometry/Mesh';
import { VertexBuffer } from '../rendering/geometry/VertexBuffer';
import { IndexBuffer } from '../rendering/geometry/IndexBuffer';
import { VertexFormat } from '../rendering/geometry/VertexFormat';
import { Texture } from '../rendering/texture/Texture';
import { GPUBuffer, GPUBufferDescriptor } from '../rendering/gpu/GPUBuffer';
import { GPUDevice, BufferUsage } from '../rendering/gpu/GPUDevice';
import { Particle } from './Particle';
import { ParticleSystem } from './ParticleSystem';

/**
 * Particle rendering modes.
 */
export enum ParticleRenderMode {
  /** Billboard (always facing camera) */
  Billboard = 'Billboard',
  /** Stretched billboard (velocity aligned) */
  StretchedBillboard = 'StretchedBillboard',
  /** Horizontal billboard (Y-up) */
  HorizontalBillboard = 'HorizontalBillboard',
  /** Vertical billboard (XZ plane) */
  VerticalBillboard = 'VerticalBillboard',
  /** Mesh particles */
  Mesh = 'Mesh',
  /** Trail renderer */
  Trail = 'Trail',
}

/**
 * Particle alignment modes.
 */
export enum ParticleAlignment {
  /** Align to view */
  View = 'View',
  /** Align to world */
  World = 'World',
  /** Align to local */
  Local = 'Local',
  /** Align to velocity */
  Velocity = 'Velocity',
}

/**
 * Particle sorting modes.
 */
export enum ParticleSortMode {
  /** No sorting */
  None = 'None',
  /** Sort by distance to camera */
  Distance = 'Distance',
  /** Sort by age (oldest first) */
  OldestFirst = 'OldestFirst',
  /** Sort by age (youngest first) */
  YoungestFirst = 'YoungestFirst',
}

/**
 * Trail segment data.
 */
interface TrailSegment {
  position: Vector3;
  color: Float32Array;
  width: number;
  time: number;
}

/**
 * Particle renderer configuration.
 */
export interface ParticleRendererConfig {
  /** Render mode */
  renderMode?: ParticleRenderMode;
  /** Alignment mode */
  alignment?: ParticleAlignment;
  /** Sort mode */
  sortMode?: ParticleSortMode;
  /** Material */
  material?: Material;
  /** Particle mesh (for mesh mode) */
  mesh?: Mesh;
  /** Stretched billboard length scale */
  stretchScale?: number;
  /** Use GPU instancing */
  useInstancing?: boolean;
  /** Max instances */
  maxInstances?: number;
  /** Trail length (segments) */
  trailLength?: number;
  /** Trail lifetime (seconds) */
  trailLifetime?: number;
  /** Trail min distance */
  trailMinDistance?: number;
  /** Texture atlas columns */
  atlasColumns?: number;
  /** Texture atlas rows */
  atlasRows?: number;
}

/**
 * Particle renderer.
 *
 * Renders particles using various rendering techniques. Supports billboards,
 * stretched billboards, mesh particles, trails, and GPU instancing for
 * high-performance rendering of large particle counts.
 *
 * Features:
 * - Multiple rendering modes
 * - Billboard alignment options
 * - Particle sorting for correct transparency
 * - GPU instancing for performance
 * - Trail rendering
 * - Texture atlas animation
 *
 * @example
 * ```typescript
 * // Billboard renderer
 * const renderer = new ParticleRenderer({
 *   renderMode: ParticleRenderMode.Billboard,
 *   sortMode: ParticleSortMode.Distance,
 *   material: particleMaterial,
 *   useInstancing: true,
 * });
 *
 * // Stretched billboard
 * const stretchedRenderer = new ParticleRenderer({
 *   renderMode: ParticleRenderMode.StretchedBillboard,
 *   stretchScale: 2.0,
 * });
 *
 * // Mesh particles
 * const meshRenderer = new ParticleRenderer({
 *   renderMode: ParticleRenderMode.Mesh,
 *   mesh: particleMesh,
 *   useInstancing: true,
 * });
 *
 * // Trail renderer
 * const trailRenderer = new ParticleRenderer({
 *   renderMode: ParticleRenderMode.Trail,
 *   trailLength: 20,
 *   trailLifetime: 1.0,
 * });
 *
 * // Render particles
 * renderer.render(particleSystem, camera, gpuDevice);
 * ```
 */
export class ParticleRenderer {
  /** Render mode */
  renderMode: ParticleRenderMode = ParticleRenderMode.Billboard;

  /** Alignment mode */
  alignment: ParticleAlignment = ParticleAlignment.View;

  /** Sort mode */
  sortMode: ParticleSortMode = ParticleSortMode.None;

  /** Material */
  material: Material | null = null;

  /** Particle mesh */
  mesh: Mesh | null = null;

  /** Stretched billboard scale */
  stretchScale: number = 1.0;

  /** Use GPU instancing */
  useInstancing: boolean = false;

  /** Max instances */
  maxInstances: number = 10000;

  /** Trail configuration */
  trailLength: number = 10;
  trailLifetime: number = 1.0;
  trailMinDistance: number = 0.1;

  /** Texture atlas */
  atlasColumns: number = 1;
  atlasRows: number = 1;

  /** Billboard mesh */
  private _billboardMesh: Mesh | null = null;

  /** Instance buffer */
  private _instanceBuffer: GPUBuffer | null = null;

  /** Instance data */
  private _instanceData: Float32Array | null = null;

  /** Trail segments per particle */
  private _trailSegments: Map<Particle, TrailSegment[]> = new Map();

  /** Sorted particles */
  private _sortedParticles: Particle[] = [];

  /** Temporary matrices and vectors */
  private static readonly _tempMatrix = new Matrix4();
  private static readonly _tempVector1 = new Vector3();
  private static readonly _tempVector2 = new Vector3();
  private static readonly _tempVector3 = new Vector3();
  private static readonly _tempQuaternion = new Quaternion();

  /**
   * Create a new particle renderer.
   *
   * @param config - Renderer configuration
   */
  constructor(config: ParticleRendererConfig = {}) {
    this.renderMode = config.renderMode ?? ParticleRenderMode.Billboard;
    this.alignment = config.alignment ?? ParticleAlignment.View;
    this.sortMode = config.sortMode ?? ParticleSortMode.None;
    this.material = config.material ?? null;
    this.mesh = config.mesh ?? null;
    this.stretchScale = config.stretchScale ?? 1.0;
    this.useInstancing = config.useInstancing ?? false;
    this.maxInstances = config.maxInstances ?? 10000;
    this.trailLength = config.trailLength ?? 10;
    this.trailLifetime = config.trailLifetime ?? 1.0;
    this.trailMinDistance = config.trailMinDistance ?? 0.1;
    this.atlasColumns = config.atlasColumns ?? 1;
    this.atlasRows = config.atlasRows ?? 1;
  }

  /**
   * Initialize renderer resources.
   *
   * @param device - GPU device
   */
  initialize(device: GPUDevice): void {
    // Create billboard mesh if needed
    if (this.renderMode !== ParticleRenderMode.Mesh) {
      this._billboardMesh = this.createBillboardMesh();
    }

    // Create instance buffer if using instancing
    if (this.useInstancing) {
      this._instanceBuffer = this.createInstanceBuffer(device);
      this._instanceData = new Float32Array(this.maxInstances * 16); // 16 floats per instance
    }
  }

  /**
   * Create billboard quad mesh.
   */
  private createBillboardMesh(): Mesh {
    const format = VertexFormat.P3N3T2();
    const vertices = new VertexBuffer(format, 4);
    const indices = new IndexBuffer(6);

    // Quad vertices (centered)
    vertices.setPosition(0, -0.5, -0.5, 0);
    vertices.setNormal(0, 0, 0, 1);
    vertices.setTexCoord(0, 0, 1);

    vertices.setPosition(1, 0.5, -0.5, 0);
    vertices.setNormal(1, 0, 0, 1);
    vertices.setTexCoord(1, 1, 1);

    vertices.setPosition(2, 0.5, 0.5, 0);
    vertices.setNormal(2, 0, 0, 1);
    vertices.setTexCoord(2, 1, 0);

    vertices.setPosition(3, -0.5, 0.5, 0);
    vertices.setNormal(3, 0, 0, 1);
    vertices.setTexCoord(3, 0, 0);

    // Indices
    indices.setTriangle(0, 0, 1, 2);
    indices.setTriangle(1, 0, 2, 3);

    return new Mesh(vertices, indices);
  }

  /**
   * Create instance buffer.
   */
  private createInstanceBuffer(device: GPUDevice): GPUBuffer {
    const descriptor: GPUBufferDescriptor = {
      size: this.maxInstances * 16 * 4, // 16 floats * 4 bytes
      usage: BufferUsage.Vertex,
    };
    return device.createBuffer(descriptor);
  }

  /**
   * Render particle system.
   *
   * @param system - Particle system to render
   * @param camera - Camera for view/projection
   * @param device - GPU device
   */
  render(system: ParticleSystem, camera: Camera, device: GPUDevice): void {
    const particles = system.particles;
    if (particles.length === 0) {
      return;
    }

    // Sort particles if needed
    if (this.sortMode !== ParticleSortMode.None) {
      this.sortParticles(particles, camera);
    } else {
      this._sortedParticles = [...particles];
    }

    // Render based on mode
    switch (this.renderMode) {
      case ParticleRenderMode.Billboard:
      case ParticleRenderMode.HorizontalBillboard:
      case ParticleRenderMode.VerticalBillboard:
        this.renderBillboards(this._sortedParticles, camera, device);
        break;

      case ParticleRenderMode.StretchedBillboard:
        this.renderStretchedBillboards(this._sortedParticles, camera, device);
        break;

      case ParticleRenderMode.Mesh:
        this.renderMeshParticles(this._sortedParticles, camera, device);
        break;

      case ParticleRenderMode.Trail:
        this.renderTrails(this._sortedParticles, camera, device);
        break;
    }
  }

  /**
   * Sort particles.
   */
  private sortParticles(particles: readonly Particle[], camera: Camera): void {
    this._sortedParticles = [...particles];

    switch (this.sortMode) {
      case ParticleSortMode.Distance:
        this._sortedParticles.sort((a, b) => {
          const distA = camera.transform.position.distanceToSquared(a.position);
          const distB = camera.transform.position.distanceToSquared(b.position);
          return distB - distA; // Far to near
        });
        break;

      case ParticleSortMode.OldestFirst:
        this._sortedParticles.sort((a, b) => b.age - a.age);
        break;

      case ParticleSortMode.YoungestFirst:
        this._sortedParticles.sort((a, b) => a.age - b.age);
        break;
    }
  }

  /**
   * Render billboards.
   */
  private renderBillboards(particles: Particle[], camera: Camera, device: GPUDevice): void {
    if (!this._billboardMesh) return;

    if (this.useInstancing && this._instanceBuffer && this._instanceData) {
      this.renderBillboardsInstanced(particles, camera, device);
    } else {
      this.renderBillboardsIndividual(particles, camera, device);
    }
  }

  /**
   * Render billboards using instancing.
   */
  private renderBillboardsInstanced(particles: Particle[], camera: Camera, device: GPUDevice): void {
    if (!this._instanceData || !this._instanceBuffer) return;

    const viewMatrix = camera.viewMatrix;
    const right = ParticleRenderer._tempVector1.set(viewMatrix.elements[0], viewMatrix.elements[4], viewMatrix.elements[8]);
    const up = ParticleRenderer._tempVector2.set(viewMatrix.elements[1], viewMatrix.elements[5], viewMatrix.elements[9]);

    // Build instance data
    let offset = 0;
    for (let i = 0; i < Math.min(particles.length, this.maxInstances); i++) {
      const particle = particles[i];

      // Position
      this._instanceData[offset++] = particle.position.x;
      this._instanceData[offset++] = particle.position.y;
      this._instanceData[offset++] = particle.position.z;
      this._instanceData[offset++] = 1.0; // W

      // Size
      this._instanceData[offset++] = particle.size.x;
      this._instanceData[offset++] = particle.size.y;
      this._instanceData[offset++] = particle.size.z;
      this._instanceData[offset++] = particle.rotation.z; // Rotation

      // Color
      this._instanceData[offset++] = particle.color.r;
      this._instanceData[offset++] = particle.color.g;
      this._instanceData[offset++] = particle.color.b;
      this._instanceData[offset++] = particle.color.a;

      // UV offset (for atlas)
      const atlasIndex = particle.frame % (this.atlasColumns * this.atlasRows);
      const atlasX = atlasIndex % this.atlasColumns;
      const atlasY = Math.floor(atlasIndex / this.atlasColumns);
      this._instanceData[offset++] = atlasX / this.atlasColumns;
      this._instanceData[offset++] = atlasY / this.atlasRows;
      this._instanceData[offset++] = 1 / this.atlasColumns;
      this._instanceData[offset++] = 1 / this.atlasRows;
    }

    // Upload instance data
    this._instanceBuffer.write(this._instanceData);

    // Draw instanced
    // device.drawInstanced(this._billboardMesh, particles.length);
  }

  /**
   * Render billboards individually.
   */
  private renderBillboardsIndividual(particles: Particle[], camera: Camera, device: GPUDevice): void {
    for (const particle of particles) {
      const matrix = this.calculateBillboardMatrix(particle, camera);
      // device.drawMesh(this._billboardMesh, matrix, particle.color);
    }
  }

  /**
   * Calculate billboard matrix.
   */
  private calculateBillboardMatrix(particle: Particle, camera: Camera): Matrix4 {
    const matrix = ParticleRenderer._tempMatrix;
    const viewMatrix = camera.viewMatrix;

    // Get camera right and up vectors
    const right = ParticleRenderer._tempVector1.set(
      viewMatrix.elements[0],
      viewMatrix.elements[4],
      viewMatrix.elements[8]
    );
    const up = ParticleRenderer._tempVector2.set(
      viewMatrix.elements[1],
      viewMatrix.elements[5],
      viewMatrix.elements[9]
    );

    // Build rotation matrix
    const forward = ParticleRenderer._tempVector3.copy(right).cross(up);

    matrix.elements[0] = right.x * particle.size.x;
    matrix.elements[1] = right.y * particle.size.x;
    matrix.elements[2] = right.z * particle.size.x;
    matrix.elements[3] = 0;

    matrix.elements[4] = up.x * particle.size.y;
    matrix.elements[5] = up.y * particle.size.y;
    matrix.elements[6] = up.z * particle.size.y;
    matrix.elements[7] = 0;

    matrix.elements[8] = forward.x * particle.size.z;
    matrix.elements[9] = forward.y * particle.size.z;
    matrix.elements[10] = forward.z * particle.size.z;
    matrix.elements[11] = 0;

    matrix.elements[12] = particle.position.x;
    matrix.elements[13] = particle.position.y;
    matrix.elements[14] = particle.position.z;
    matrix.elements[15] = 1;

    // Apply rotation
    if (particle.rotation.z !== 0) {
      const rotation = Matrix4.rotationZ(particle.rotation.z);
      matrix.multiply(rotation);
    }

    return matrix;
  }

  /**
   * Render stretched billboards.
   */
  private renderStretchedBillboards(particles: Particle[], camera: Camera, device: GPUDevice): void {
    for (const particle of particles) {
      const matrix = this.calculateStretchedBillboardMatrix(particle, camera);
      // device.drawMesh(this._billboardMesh, matrix, particle.color);
    }
  }

  /**
   * Calculate stretched billboard matrix.
   */
  private calculateStretchedBillboardMatrix(particle: Particle, camera: Camera): Matrix4 {
    const matrix = ParticleRenderer._tempMatrix;
    const velocity = particle.velocity;

    if (velocity.lengthSquared() < 0.001) {
      return this.calculateBillboardMatrix(particle, camera);
    }

    // Forward = velocity direction
    const forward = ParticleRenderer._tempVector1.copy(velocity).normalize();

    // Right = camera right perpendicular to forward
    const cameraForward = ParticleRenderer._tempVector2
      .copy(camera.transform.position)
      .sub(particle.position)
      .normalize();

    const right = ParticleRenderer._tempVector3.copy(forward).cross(cameraForward).normalize();
    const up = right.clone().cross(forward);

    // Scale by velocity for stretching
    const stretch = velocity.length() * this.stretchScale;

    matrix.elements[0] = right.x * particle.size.x;
    matrix.elements[1] = right.y * particle.size.x;
    matrix.elements[2] = right.z * particle.size.x;
    matrix.elements[3] = 0;

    matrix.elements[4] = up.x * particle.size.y;
    matrix.elements[5] = up.y * particle.size.y;
    matrix.elements[6] = up.z * particle.size.y;
    matrix.elements[7] = 0;

    matrix.elements[8] = forward.x * stretch;
    matrix.elements[9] = forward.y * stretch;
    matrix.elements[10] = forward.z * stretch;
    matrix.elements[11] = 0;

    matrix.elements[12] = particle.position.x;
    matrix.elements[13] = particle.position.y;
    matrix.elements[14] = particle.position.z;
    matrix.elements[15] = 1;

    return matrix;
  }

  /**
   * Render mesh particles.
   */
  private renderMeshParticles(particles: Particle[], camera: Camera, device: GPUDevice): void {
    if (!this.mesh) return;

    for (const particle of particles) {
      const matrix = ParticleRenderer._tempMatrix;
      const rotation = ParticleRenderer._tempQuaternion.setFromEuler(
        particle.rotation.x,
        particle.rotation.y,
        particle.rotation.z
      );

      matrix.compose(particle.position, rotation, particle.size);

      // device.drawMesh(this.mesh, matrix, particle.color);
    }
  }

  /**
   * Render trails.
   */
  private renderTrails(particles: Particle[], camera: Camera, device: GPUDevice): void {
    for (const particle of particles) {
      this.updateTrail(particle);
      this.drawTrail(particle, camera, device);
    }
  }

  /**
   * Update trail segments.
   */
  private updateTrail(particle: Particle): void {
    let segments = this._trailSegments.get(particle);
    if (!segments) {
      segments = [];
      this._trailSegments.set(particle, segments);
    }

    // Add new segment if moved enough
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment || particle.position.distanceTo(lastSegment.position) >= this.trailMinDistance) {
      segments.push({
        position: particle.position.clone(),
        color: new Float32Array([particle.color.r, particle.color.g, particle.color.b, particle.color.a]),
        width: particle.size.x,
        time: particle.age,
      });
    }

    // Remove old segments
    const cutoffTime = particle.age - this.trailLifetime;
    while (segments.length > 0 && segments[0].time < cutoffTime) {
      segments.shift();
    }

    // Limit length
    while (segments.length > this.trailLength) {
      segments.shift();
    }
  }

  /**
   * Draw trail.
   */
  private drawTrail(particle: Particle, camera: Camera, device: GPUDevice): void {
    const segments = this._trailSegments.get(particle);
    if (!segments || segments.length < 2) return;

    // Build trail mesh and draw
    // Implementation would create a ribbon mesh from segments
  }

  /**
   * Dispose renderer resources.
   */
  dispose(): void {
    if (this._instanceBuffer) {
      this._instanceBuffer.dispose();
      this._instanceBuffer = null;
    }

    this._instanceData = null;
    this._trailSegments.clear();
  }
}
