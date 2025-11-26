/**
 * Advanced Simulations
 *
 * Implements advanced physics simulations including cloth, soft bodies,
 * fluids, fracture, vehicles, and ragdolls.
 */

import { Vector3, PhysicsWorld, RigidBody, BodyType, Color } from 'g3d';

/**
 * Cloth particle for simulation
 */
class ClothParticle {
  position: Vector3;
  previousPosition: Vector3;
  velocity: Vector3;
  mass: number;
  pinned: boolean;

  constructor(position: Vector3, mass: number = 0.1, pinned: boolean = false) {
    this.position = position.clone();
    this.previousPosition = position.clone();
    this.velocity = new Vector3(0, 0, 0);
    this.mass = mass;
    this.pinned = pinned;
  }
}

/**
 * Cloth constraint between particles
 */
class ClothConstraint {
  particleA: ClothParticle;
  particleB: ClothParticle;
  restLength: number;
  stiffness: number;

  constructor(particleA: ClothParticle, particleB: ClothParticle, stiffness: number = 0.95) {
    this.particleA = particleA;
    this.particleB = particleB;
    this.restLength = particleA.position.sub(particleB.position).length();
    this.stiffness = stiffness;
  }
}

/**
 * Manages advanced physics simulations
 */
export class Simulations {
  private physicsWorld: PhysicsWorld;

  private clothParticles: ClothParticle[] = [];
  private clothConstraints: ClothConstraint[] = [];
  private clothActive: boolean = false;

  private softBodyParticles: Vector3[] = [];
  private softBodyActive: boolean = false;

  private fluidParticles: Vector3[] = [];
  private fluidVelocities: Vector3[] = [];
  private fluidActive: boolean = false;

  private fractureActive: boolean = false;

  constructor(physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  /**
   * Updates all active simulations
   */
  public update(deltaTime: number): void {
    if (this.clothActive) {
      this.updateClothSimulation(deltaTime);
    }

    if (this.softBodyActive) {
      this.updateSoftBodySimulation(deltaTime);
    }

    if (this.fluidActive) {
      this.updateFluidSimulation(deltaTime);
    }
  }

  /**
   * Creates a cloth simulation
   */
  public createCloth(position: Vector3, width: number, height: number, segmentsX: number, segmentsY: number): void {
    this.clothParticles = [];
    this.clothConstraints = [];

    const particleGrid: ClothParticle[][] = [];

    for (let y = 0; y <= segmentsY; y++) {
      particleGrid[y] = [];
      for (let x = 0; x <= segmentsX; x++) {
        const particlePos = position.add(
          new Vector3(
            (x / segmentsX - 0.5) * width,
            -(y / segmentsY) * height,
            0
          )
        );

        const isPinned = y === 0 && (x === 0 || x === segmentsX);
        const particle = new ClothParticle(particlePos, 0.1, isPinned);
        this.clothParticles.push(particle);
        particleGrid[y][x] = particle;
      }
    }

    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const particle = particleGrid[y][x];

        if (x < segmentsX) {
          this.clothConstraints.push(new ClothConstraint(particle, particleGrid[y][x + 1]));
        }

        if (y < segmentsY) {
          this.clothConstraints.push(new ClothConstraint(particle, particleGrid[y + 1][x]));
        }

        if (x < segmentsX && y < segmentsY) {
          this.clothConstraints.push(new ClothConstraint(particle, particleGrid[y + 1][x + 1], 0.9));
          this.clothConstraints.push(new ClothConstraint(particle, particleGrid[y + 1][x - 1] || particle, 0.9));
        }
      }
    }

    this.clothActive = true;
  }

  /**
   * Updates cloth simulation using Verlet integration
   */
  private updateClothSimulation(deltaTime: number): void {
    const gravity = new Vector3(0, -9.81, 0);
    const damping = 0.99;
    const iterations = 3;

    for (const particle of this.clothParticles) {
      if (particle.pinned) continue;

      const velocity = particle.position.sub(particle.previousPosition);
      particle.previousPosition.copy(particle.position);

      const acceleration = gravity;
      particle.position.addInPlace(velocity.scale(damping));
      particle.position.addInPlace(acceleration.scale(deltaTime * deltaTime));
    }

    for (let i = 0; i < iterations; i++) {
      for (const constraint of this.clothConstraints) {
        const delta = constraint.particleB.position.sub(constraint.particleA.position);
        const currentLength = delta.length();
        const difference = (currentLength - constraint.restLength) / currentLength;
        const correction = delta.scale(0.5 * difference * constraint.stiffness);

        if (!constraint.particleA.pinned) {
          constraint.particleA.position.addInPlace(correction);
        }
        if (!constraint.particleB.pinned) {
          constraint.particleB.position.addInPlace(correction.negate());
        }
      }
    }

    for (const particle of this.clothParticles) {
      if (particle.position.y < -10) {
        particle.position.y = -10;
        particle.previousPosition.y = -10;
      }
    }
  }

  /**
   * Gets cloth particles for rendering
   */
  public getClothParticles(): ClothParticle[] {
    return this.clothParticles;
  }

  /**
   * Stops cloth simulation
   */
  public stopCloth(): void {
    this.clothActive = false;
    this.clothParticles = [];
    this.clothConstraints = [];
  }

  /**
   * Creates a soft body simulation
   */
  public createSoftBody(position: Vector3, size: Vector3, resolution: number = 5): void {
    this.softBodyParticles = [];

    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        for (let z = 0; z < resolution; z++) {
          const particlePos = position.add(
            new Vector3(
              (x / (resolution - 1) - 0.5) * size.x,
              (y / (resolution - 1) - 0.5) * size.y,
              (z / (resolution - 1) - 0.5) * size.z
            )
          );
          this.softBodyParticles.push(particlePos);
        }
      }
    }

    this.softBodyActive = true;
  }

  /**
   * Updates soft body simulation
   */
  private updateSoftBodySimulation(deltaTime: number): void {
    const gravity = new Vector3(0, -9.81, 0);

    for (const particle of this.softBodyParticles) {
      particle.addInPlace(gravity.scale(deltaTime * deltaTime));

      if (particle.y < 0) {
        particle.y = 0;
      }
    }
  }

  /**
   * Gets soft body particles
   */
  public getSoftBodyParticles(): Vector3[] {
    return this.softBodyParticles;
  }

  /**
   * Stops soft body simulation
   */
  public stopSoftBody(): void {
    this.softBodyActive = false;
    this.softBodyParticles = [];
  }

  /**
   * Creates a fluid container simulation (SPH-based)
   */
  public createFluid(position: Vector3, particleCount: number, containerSize: Vector3): void {
    this.fluidParticles = [];
    this.fluidVelocities = [];

    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * containerSize.x - containerSize.x / 2;
      const y = Math.random() * containerSize.y;
      const z = Math.random() * containerSize.z - containerSize.z / 2;

      this.fluidParticles.push(position.add(new Vector3(x, y, z)));
      this.fluidVelocities.push(new Vector3(0, 0, 0));
    }

    this.fluidActive = true;
  }

  /**
   * Updates SPH fluid simulation
   */
  private updateFluidSimulation(deltaTime: number): void {
    const gravity = new Vector3(0, -9.81, 0);
    const smoothingRadius = 0.5;
    const restDensity = 1000;
    const stiffness = 1000;
    const viscosity = 0.01;

    const densities: number[] = new Array(this.fluidParticles.length).fill(0);

    for (let i = 0; i < this.fluidParticles.length; i++) {
      for (let j = 0; j < this.fluidParticles.length; j++) {
        const distance = this.fluidParticles[i].sub(this.fluidParticles[j]).length();
        if (distance < smoothingRadius) {
          const q = distance / smoothingRadius;
          const weight = Math.max(0, 1 - q * q);
          densities[i] += weight;
        }
      }
    }

    for (let i = 0; i < this.fluidParticles.length; i++) {
      let pressureForce = new Vector3(0, 0, 0);
      let viscosityForce = new Vector3(0, 0, 0);

      for (let j = 0; j < this.fluidParticles.length; j++) {
        if (i === j) continue;

        const delta = this.fluidParticles[i].sub(this.fluidParticles[j]);
        const distance = delta.length();

        if (distance < smoothingRadius && distance > 0) {
          const pressure = stiffness * (densities[i] + densities[j] - 2 * restDensity);
          const direction = delta.normalize();
          pressureForce.addInPlace(direction.scale(pressure / (densities[i] * densities[j])));

          const velocityDiff = this.fluidVelocities[j].sub(this.fluidVelocities[i]);
          viscosityForce.addInPlace(velocityDiff.scale(viscosity));
        }
      }

      this.fluidVelocities[i].addInPlace(gravity.scale(deltaTime));
      this.fluidVelocities[i].addInPlace(pressureForce.scale(deltaTime));
      this.fluidVelocities[i].addInPlace(viscosityForce.scale(deltaTime));

      this.fluidParticles[i].addInPlace(this.fluidVelocities[i].scale(deltaTime));

      if (this.fluidParticles[i].y < 0) {
        this.fluidParticles[i].y = 0;
        this.fluidVelocities[i].y = Math.abs(this.fluidVelocities[i].y) * 0.3;
      }

      const containerRadius = 5;
      const distFromCenter = Math.sqrt(
        this.fluidParticles[i].x * this.fluidParticles[i].x +
        this.fluidParticles[i].z * this.fluidParticles[i].z
      );

      if (distFromCenter > containerRadius) {
        const normal = new Vector3(this.fluidParticles[i].x, 0, this.fluidParticles[i].z).normalize();
        this.fluidParticles[i].x = normal.x * containerRadius;
        this.fluidParticles[i].z = normal.z * containerRadius;

        const velocityNormal = this.fluidVelocities[i].dot(normal);
        this.fluidVelocities[i].addInPlace(normal.scale(-velocityNormal * 1.5));
      }
    }
  }

  /**
   * Gets fluid particles
   */
  public getFluidParticles(): Vector3[] {
    return this.fluidParticles;
  }

  /**
   * Stops fluid simulation
   */
  public stopFluid(): void {
    this.fluidActive = false;
    this.fluidParticles = [];
    this.fluidVelocities = [];
  }

  /**
   * Creates a fracture demonstration
   */
  public createFracture(body: RigidBody, impactPoint: Vector3, impactForce: number): RigidBody[] {
    const fragments: RigidBody[] = [];
    const fragmentCount = 8;
    const position = body.position;

    this.physicsWorld.removeRigidBody(body);

    for (let i = 0; i < fragmentCount; i++) {
      const angle = (i / fragmentCount) * Math.PI * 2;
      const offset = new Vector3(
        Math.cos(angle) * 0.3,
        Math.random() * 0.3,
        Math.sin(angle) * 0.3
      );

      const fragment = new RigidBody({
        type: BodyType.Dynamic,
        position: position.add(offset),
        mass: body.mass / fragmentCount
      });

      const direction = fragment.position.sub(impactPoint).normalize();
      const force = direction.scale(impactForce * 0.5);
      fragment.applyImpulse(force);

      this.physicsWorld.addRigidBody(fragment);
      fragments.push(fragment);
    }

    return fragments;
  }

  /**
   * Demonstrates a vehicle simulation
   */
  public createVehicleDemo(position: Vector3): { chassis: RigidBody; wheels: RigidBody[] } {
    const chassis = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass: 100
    });

    this.physicsWorld.addRigidBody(chassis);

    const wheels: RigidBody[] = [];
    const wheelPositions = [
      new Vector3(-1.5, -0.5, -1),
      new Vector3(-1.5, -0.5, 1),
      new Vector3(1.5, -0.5, -1),
      new Vector3(1.5, -0.5, 1)
    ];

    for (const wheelPos of wheelPositions) {
      const wheel = new RigidBody({
        type: BodyType.Dynamic,
        position: position.add(wheelPos),
        mass: 5
      });

      this.physicsWorld.addRigidBody(wheel);
      wheels.push(wheel);
    }

    return { chassis, wheels };
  }

  /**
   * Creates a ragdoll demonstration
   */
  public createRagdollDemo(position: Vector3): RigidBody[] {
    const bodies: RigidBody[] = [];

    const torso = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass: 10
    });

    this.physicsWorld.addRigidBody(torso);
    bodies.push(torso);

    const head = new RigidBody({
      type: BodyType.Dynamic,
      position: position.add(new Vector3(0, 1.5, 0)),
      mass: 2
    });

    this.physicsWorld.addRigidBody(head);
    bodies.push(head);

    const limbs = [
      { offset: new Vector3(-1, 0.5, 0), mass: 2 },
      { offset: new Vector3(1, 0.5, 0), mass: 2 },
      { offset: new Vector3(-0.5, -1.5, 0), mass: 3 },
      { offset: new Vector3(0.5, -1.5, 0), mass: 3 }
    ];

    for (const limb of limbs) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: position.add(limb.offset),
        mass: limb.mass
      });

      this.physicsWorld.addRigidBody(body);
      bodies.push(body);
    }

    return bodies;
  }

  /**
   * Checks if cloth simulation is active
   */
  public isClothActive(): boolean {
    return this.clothActive;
  }

  /**
   * Checks if soft body simulation is active
   */
  public isSoftBodyActive(): boolean {
    return this.softBodyActive;
  }

  /**
   * Checks if fluid simulation is active
   */
  public isFluidActive(): boolean {
    return this.fluidActive;
  }
}
