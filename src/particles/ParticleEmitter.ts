/**
 * Particle emitter for controlling particle emission patterns and rates.
 * Supports various emission shapes, burst modes, and emitter spaces.
 * @module ParticleEmitter
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Quaternion } from '../math/Quaternion';
import { Random } from '../core/Random';
import { Mesh } from '../rendering/geometry/Mesh';
import { Particle } from './Particle';
import { VertexAttributeSemantic } from '../rendering/geometry/VertexFormat';

/**
 * Emission shape types.
 */
export enum EmissionShape {
  /** Emit from a single point */
  Point = 'Point',
  /** Emit from the surface of a sphere */
  Sphere = 'Sphere',
  /** Emit from within a sphere volume */
  SphereVolume = 'SphereVolume',
  /** Emit from a cone */
  Cone = 'Cone',
  /** Emit from a box surface */
  Box = 'Box',
  /** Emit from within a box volume */
  BoxVolume = 'BoxVolume',
  /** Emit from a circle edge */
  Circle = 'Circle',
  /** Emit from within a circle */
  CircleVolume = 'CircleVolume',
  /** Emit from mesh vertices */
  MeshVertices = 'MeshVertices',
  /** Emit from mesh surface */
  MeshSurface = 'MeshSurface',
  /** Emit from mesh edges */
  MeshEdges = 'MeshEdges',
}

/**
 * Emitter coordinate space.
 */
export enum EmitterSpace {
  /** Particles move with emitter */
  Local = 'Local',
  /** Particles independent of emitter */
  World = 'World',
}

/**
 * Sphere emission parameters.
 */
export interface SphereEmissionParams {
  /** Sphere radius */
  radius: number;
  /** Minimum radius for shell emission */
  radiusThickness: number;
  /** Arc angle in degrees [0-360] */
  arc: number;
}

/**
 * Cone emission parameters.
 */
export interface ConeEmissionParams {
  /** Cone angle in degrees */
  angle: number;
  /** Cone radius at base */
  radius: number;
  /** Cone height/length */
  length: number;
  /** Emit from volume or surface */
  emitFromVolume: boolean;
  /** Random direction scatter */
  randomDirection: number;
}

/**
 * Box emission parameters.
 */
export interface BoxEmissionParams {
  /** Box size on each axis */
  size: Vector3;
  /** Emit from shell or volume */
  emitFromShell: boolean;
}

/**
 * Circle emission parameters.
 */
export interface CircleEmissionParams {
  /** Circle radius */
  radius: number;
  /** Arc angle in degrees [0-360] */
  arc: number;
  /** Radius thickness for ring */
  radiusThickness: number;
}

/**
 * Mesh emission parameters.
 */
export interface MeshEmissionParams {
  /** Mesh to emit from */
  mesh: Mesh | null;
  /** Use vertex normals for direction */
  useNormals: boolean;
  /** Normal influence factor [0-1] */
  normalInfluence: number;
}

/**
 * Burst emission configuration.
 */
export interface ParticleBurst {
  /** Time to emit burst */
  time: number;
  /** Number of particles to emit */
  count: number;
  /** Repeat count (0 = infinite) */
  cycles: number;
  /** Interval between cycles */
  interval: number;
  /** Probability [0-1] of burst happening */
  probability: number;
}

/**
 * Sub-emitter configuration.
 */
export interface SubEmitter {
  /** Emitter to spawn */
  emitter: ParticleEmitter;
  /** Emit on particle birth */
  emitOnBirth: boolean;
  /** Emit on particle death */
  emitOnDeath: boolean;
  /** Emit on particle collision */
  emitOnCollision: boolean;
  /** Number of particles to emit */
  count: number;
  /** Inherit particle velocity */
  inheritVelocity: boolean;
  /** Velocity inheritance factor */
  inheritFactor: number;
}

/**
 * Particle emitter configuration.
 */
export interface ParticleEmitterConfig {
  /** Emission shape */
  shape?: EmissionShape;
  /** Emission rate (particles per second) */
  rate?: number;
  /** Coordinate space */
  space?: EmitterSpace;
  /** Random seed */
  randomSeed?: number;
  /** Shape-specific parameters */
  sphereParams?: Partial<SphereEmissionParams>;
  coneParams?: Partial<ConeEmissionParams>;
  boxParams?: Partial<BoxEmissionParams>;
  circleParams?: Partial<CircleEmissionParams>;
  meshParams?: Partial<MeshEmissionParams>;
}

/**
 * Particle emitter.
 *
 * Controls how and where particles are emitted. Supports various emission shapes,
 * rates, bursts, and sub-emitters. Can operate in local or world space.
 *
 * Features:
 * - Multiple emission shapes (point, sphere, cone, box, circle, mesh)
 * - Continuous emission with configurable rate
 * - Burst emission with cycles and probability
 * - Sub-emitters for particle effects chains
 * - Local and world space emission
 * - Velocity inheritance from moving emitters
 *
 * @example
 * ```typescript
 * // Create a cone emitter
 * const emitter = new ParticleEmitter({
 *   shape: EmissionShape.Cone,
 *   rate: 100,
 *   space: EmitterSpace.World,
 *   coneParams: {
 *     angle: 30,
 *     radius: 0.5,
 *     length: 2.0,
 *   },
 * });
 *
 * // Add a burst
 * emitter.addBurst({
 *   time: 0,
 *   count: 50,
 *   cycles: 1,
 *   interval: 0,
 *   probability: 1.0,
 * });
 *
 * // Update emitter transform
 * emitter.setPosition(0, 5, 0);
 * emitter.setRotation(0, 0, Math.PI / 4);
 *
 * // Emit particles
 * const count = emitter.computeEmissionCount(deltaTime);
 * for (let i = 0; i < count; i++) {
 *   const particle = pool.acquire();
 *   emitter.emitParticle(particle);
 * }
 * ```
 */
export class ParticleEmitter {
  /** Emission shape */
  shape: EmissionShape = EmissionShape.Point;

  /** Emission rate (particles per second) */
  rate: number = 10;

  /** Coordinate space */
  space: EmitterSpace = EmitterSpace.World;

  /** Random number generator */
  readonly random: Random;

  /** Emitter position */
  readonly position: Vector3 = new Vector3();

  /** Emitter rotation */
  readonly rotation: Quaternion = new Quaternion();

  /** Emitter scale */
  readonly scale: Vector3 = new Vector3(1, 1, 1);

  /** Emitter transform matrix */
  readonly transform: Matrix4 = new Matrix4();

  /** Previous position (for velocity calculation) */
  readonly previousPosition: Vector3 = new Vector3();

  /** Emitter velocity */
  readonly velocity: Vector3 = new Vector3();

  /** Shape parameters */
  readonly sphereParams: SphereEmissionParams = {
    radius: 1.0,
    radiusThickness: 1.0,
    arc: 360,
  };

  readonly coneParams: ConeEmissionParams = {
    angle: 25,
    radius: 1.0,
    length: 1.0,
    emitFromVolume: false,
    randomDirection: 0,
  };

  readonly boxParams: BoxEmissionParams = {
    size: new Vector3(1, 1, 1),
    emitFromShell: false,
  };

  readonly circleParams: CircleEmissionParams = {
    radius: 1.0,
    arc: 360,
    radiusThickness: 1.0,
  };

  readonly meshParams: MeshEmissionParams = {
    mesh: null,
    useNormals: true,
    normalInfluence: 1.0,
  };

  /** Burst configurations */
  readonly bursts: ParticleBurst[] = [];

  /** Sub-emitters */
  readonly subEmitters: SubEmitter[] = [];

  /** Accumulated emission time */
  private _emissionAccumulator: number = 0;

  /** Burst states (cycle tracking) */
  private _burstStates: Map<ParticleBurst, { cycleCount: number; nextTime: number }> = new Map();

  /** Temporary vectors */
  private static readonly _tempVector1 = new Vector3();
  private static readonly _tempVector2 = new Vector3();
  private static readonly _tempVector3 = new Vector3();

  /**
   * Create a new particle emitter.
   *
   * @param config - Emitter configuration
   */
  constructor(config: ParticleEmitterConfig = {}) {
    this.shape = config.shape ?? EmissionShape.Point;
    this.rate = config.rate ?? 10;
    this.space = config.space ?? EmitterSpace.World;
    this.random = new Random(config.randomSeed);

    // Apply shape parameters
    if (config.sphereParams) {
      Object.assign(this.sphereParams, config.sphereParams);
    }
    if (config.coneParams) {
      Object.assign(this.coneParams, config.coneParams);
    }
    if (config.boxParams) {
      Object.assign(this.boxParams, config.boxParams);
    }
    if (config.circleParams) {
      Object.assign(this.circleParams, config.circleParams);
    }
    if (config.meshParams) {
      Object.assign(this.meshParams, config.meshParams);
    }

    this.updateTransform();
  }

  /**
   * Set emitter position.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setPosition(x: number, y: number, z: number): void {
    this.previousPosition.copy(this.position);
    this.position.set(x, y, z);
    this.updateTransform();
  }

  /**
   * Set emitter rotation from euler angles.
   *
   * @param x - X rotation in radians
   * @param y - Y rotation in radians
   * @param z - Z rotation in radians
   */
  setRotation(x: number, y: number, z: number): void {
    this.rotation.setFromEuler(x, y, z);
    this.updateTransform();
  }

  /**
   * Set emitter scale.
   *
   * @param x - X scale
   * @param y - Y scale
   * @param z - Z scale
   */
  setScale(x: number, y: number, z: number): void {
    this.scale.set(x, y, z);
    this.updateTransform();
  }

  /**
   * Update transform matrix from position, rotation, and scale.
   */
  updateTransform(): void {
    this.transform.compose(this.position, this.rotation, this.scale);
  }

  /**
   * Update emitter velocity from position delta.
   *
   * @param deltaTime - Time step in seconds
   */
  updateVelocity(deltaTime: number): void {
    if (deltaTime > 0) {
      this.velocity.copy(this.position).sub(this.previousPosition).multiplyScalar(1 / deltaTime);
      this.previousPosition.copy(this.position);
    }
  }

  /**
   * Add a burst configuration.
   *
   * @param burst - Burst configuration
   */
  addBurst(burst: ParticleBurst): void {
    this.bursts.push(burst);
    this._burstStates.set(burst, { cycleCount: 0, nextTime: burst.time });
  }

  /**
   * Remove a burst configuration.
   *
   * @param burst - Burst to remove
   */
  removeBurst(burst: ParticleBurst): void {
    const index = this.bursts.indexOf(burst);
    if (index >= 0) {
      this.bursts.splice(index, 1);
      this._burstStates.delete(burst);
    }
  }

  /**
   * Add a sub-emitter.
   *
   * @param subEmitter - Sub-emitter configuration
   */
  addSubEmitter(subEmitter: SubEmitter): void {
    this.subEmitters.push(subEmitter);
  }

  /**
   * Compute number of particles to emit this frame.
   *
   * @param deltaTime - Time step in seconds
   * @param currentTime - Current system time
   * @returns Number of particles to emit
   */
  computeEmissionCount(deltaTime: number, currentTime: number = 0): number {
    let count = 0;

    // Continuous emission
    this._emissionAccumulator += this.rate * deltaTime;
    count += Math.floor(this._emissionAccumulator);
    this._emissionAccumulator -= Math.floor(this._emissionAccumulator);

    // Burst emission
    for (const burst of this.bursts) {
      const state = this._burstStates.get(burst);
      if (!state) continue;

      if (currentTime >= state.nextTime) {
        // Check probability
        if (this.random.next() <= burst.probability) {
          count += burst.count;
        }

        // Update cycle
        state.cycleCount++;
        if (burst.cycles === 0 || state.cycleCount < burst.cycles) {
          state.nextTime = currentTime + burst.interval;
        } else {
          state.nextTime = Infinity;
        }
      }
    }

    return count;
  }

  /**
   * Emit a particle with position and velocity based on emitter shape.
   *
   * @param particle - Particle to initialize
   */
  emitParticle(particle: Particle): void {
    const position = ParticleEmitter._tempVector1;
    const direction = ParticleEmitter._tempVector2;

    // Generate position and direction based on shape
    switch (this.shape) {
      case EmissionShape.Point:
        this.emitFromPoint(position, direction);
        break;
      case EmissionShape.Sphere:
        this.emitFromSphere(position, direction, false);
        break;
      case EmissionShape.SphereVolume:
        this.emitFromSphere(position, direction, true);
        break;
      case EmissionShape.Cone:
        this.emitFromCone(position, direction);
        break;
      case EmissionShape.Box:
        this.emitFromBox(position, direction, false);
        break;
      case EmissionShape.BoxVolume:
        this.emitFromBox(position, direction, true);
        break;
      case EmissionShape.Circle:
        this.emitFromCircle(position, direction, false);
        break;
      case EmissionShape.CircleVolume:
        this.emitFromCircle(position, direction, true);
        break;
      case EmissionShape.MeshVertices:
        this.emitFromMesh(position, direction, 'vertices');
        break;
      case EmissionShape.MeshSurface:
        this.emitFromMesh(position, direction, 'surface');
        break;
      case EmissionShape.MeshEdges:
        this.emitFromMesh(position, direction, 'edges');
        break;
    }

    // Transform to world space if needed
    if (this.space === EmitterSpace.World) {
      position.applyMatrix4(this.transform);
      // Transform direction (ignore translation)
      const m = this.transform.elements;
      const dx = direction.x * m[0] + direction.y * m[4] + direction.z * m[8];
      const dy = direction.x * m[1] + direction.y * m[5] + direction.z * m[9];
      const dz = direction.x * m[2] + direction.y * m[6] + direction.z * m[10];
      direction.set(dx, dy, dz);
    }

    // Store in particle
    particle.position.copy(position);
    particle.startPosition.copy(position);

    // Direction becomes initial velocity direction (magnitude applied by velocity module)
    direction.normalize();
    particle.velocity.copy(direction);
    particle.startVelocity.copy(direction);
  }

  /**
   * Emit from point.
   */
  private emitFromPoint(position: Vector3, direction: Vector3): void {
    position.set(0, 0, 0);
    direction.set(0, 1, 0); // Default up
  }

  /**
   * Emit from sphere.
   */
  private emitFromSphere(position: Vector3, direction: Vector3, volume: boolean): void {
    const { radius, radiusThickness, arc } = this.sphereParams;

    // Random direction
    const theta = this.random.nextRange(0, Math.PI * 2 * (arc / 360));
    const phi = Math.acos(this.random.nextRange(-1, 1));

    direction.set(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    );

    // Random radius
    const minRadius = volume ? 0 : radius * (1 - radiusThickness);
    const r = this.random.nextRange(minRadius, radius);

    position.copy(direction).multiplyScalar(r);
  }

  /**
   * Emit from cone.
   */
  private emitFromCone(position: Vector3, direction: Vector3): void {
    const { angle, radius, length, emitFromVolume, randomDirection } = this.coneParams;

    const angleRad = (angle * Math.PI) / 180;
    const theta = this.random.nextRange(0, Math.PI * 2);
    const t = emitFromVolume ? this.random.next() : 1;

    // Position along cone
    const h = t * length;
    const r = t * radius;
    const randomR = this.random.nextRange(0, r);

    position.set(
      randomR * Math.cos(theta),
      randomR * Math.sin(theta),
      h
    );

    // Direction within cone angle
    const dirAngle = this.random.nextRange(-angleRad, angleRad);
    const dirTheta = this.random.nextRange(0, Math.PI * 2);

    direction.set(
      Math.sin(dirAngle) * Math.cos(dirTheta),
      Math.sin(dirAngle) * Math.sin(dirTheta),
      Math.cos(dirAngle)
    );

    // Apply random direction scatter
    if (randomDirection > 0) {
      const scatter = ParticleEmitter._tempVector3;
      scatter.set(
        this.random.nextRange(-1, 1),
        this.random.nextRange(-1, 1),
        this.random.nextRange(-1, 1)
      ).normalize().multiplyScalar(randomDirection);
      direction.addInPlace(scatter).normalizeInPlace();
    }
  }

  /**
   * Emit from box.
   */
  private emitFromBox(position: Vector3, direction: Vector3, volume: boolean): void {
    const { size, emitFromShell } = this.boxParams;

    if (volume && !emitFromShell) {
      // Random point inside box
      position.set(
        this.random.nextRange(-size.x / 2, size.x / 2),
        this.random.nextRange(-size.y / 2, size.y / 2),
        this.random.nextRange(-size.z / 2, size.z / 2)
      );
      direction.set(0, 1, 0);
    } else {
      // Random point on box surface
      const face = Math.floor(this.random.next() * 6);
      switch (face) {
        case 0: // +X
          position.set(size.x / 2, this.random.nextRange(-size.y / 2, size.y / 2), this.random.nextRange(-size.z / 2, size.z / 2));
          direction.set(1, 0, 0);
          break;
        case 1: // -X
          position.set(-size.x / 2, this.random.nextRange(-size.y / 2, size.y / 2), this.random.nextRange(-size.z / 2, size.z / 2));
          direction.set(-1, 0, 0);
          break;
        case 2: // +Y
          position.set(this.random.nextRange(-size.x / 2, size.x / 2), size.y / 2, this.random.nextRange(-size.z / 2, size.z / 2));
          direction.set(0, 1, 0);
          break;
        case 3: // -Y
          position.set(this.random.nextRange(-size.x / 2, size.x / 2), -size.y / 2, this.random.nextRange(-size.z / 2, size.z / 2));
          direction.set(0, -1, 0);
          break;
        case 4: // +Z
          position.set(this.random.nextRange(-size.x / 2, size.x / 2), this.random.nextRange(-size.y / 2, size.y / 2), size.z / 2);
          direction.set(0, 0, 1);
          break;
        case 5: // -Z
          position.set(this.random.nextRange(-size.x / 2, size.x / 2), this.random.nextRange(-size.y / 2, size.y / 2), -size.z / 2);
          direction.set(0, 0, -1);
          break;
      }
    }
  }

  /**
   * Emit from circle.
   */
  private emitFromCircle(position: Vector3, direction: Vector3, volume: boolean): void {
    const { radius, arc, radiusThickness } = this.circleParams;

    const theta = this.random.nextRange(0, Math.PI * 2 * (arc / 360));
    const minRadius = volume ? 0 : radius * (1 - radiusThickness);
    const r = this.random.nextRange(minRadius, radius);

    position.set(r * Math.cos(theta), 0, r * Math.sin(theta));
    direction.set(0, 1, 0);
  }

  /**
   * Emit from mesh.
   */
  private emitFromMesh(position: Vector3, direction: Vector3, mode: 'vertices' | 'surface' | 'edges'): void {
    const { mesh, useNormals, normalInfluence } = this.meshParams;

    if (!mesh) {
      this.emitFromPoint(position, direction);
      return;
    }

    // For now, emit from random vertex (simplified implementation)
    // Full implementation would sample mesh surface/edges
    const vb = mesh.vertexBuffer;
    const count = vb.vertexCount;
    const index = Math.floor(this.random.next() * count);

    // Get vertex position
    const stride = vb.format.stride / 4; // Convert bytes to float count
    position.set(
      vb.data[index * stride],
      vb.data[index * stride + 1],
      vb.data[index * stride + 2]
    );

    // Get normal if available
    const normalAttr = vb.format.getAttribute(VertexAttributeSemantic.Normal);
    if (useNormals && normalAttr) {
      const normalOffset = normalAttr.offset / 4; // Convert bytes to float count
      direction.set(
        vb.data[index * stride + normalOffset],
        vb.data[index * stride + normalOffset + 1],
        vb.data[index * stride + normalOffset + 2]
      ).normalizeInPlace().scaleInPlace(normalInfluence);
    } else {
      direction.set(0, 1, 0);
    }
  }

  /**
   * Reset emitter state.
   */
  reset(): void {
    this._emissionAccumulator = 0;
    for (const burst of this.bursts) {
      const state = this._burstStates.get(burst);
      if (state) {
        state.cycleCount = 0;
        state.nextTime = burst.time;
      }
    }
  }
}
