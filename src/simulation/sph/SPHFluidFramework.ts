import { Vector3 as Vec3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { SPHKernels } from './SPHKernels';
import { SpatialGrid } from './SpatialGrid';

export interface SPHParticle {
  position: Vec3;
  velocity: Vec3;
  force: Vec3;
  density: number;
  pressure: number;
  mass: number;
}

export interface SPHConfig {
  restDensity: number;
  particleMass: number;
  viscosity: number;
  surfaceTension: number;
  stiffness: number;
  smoothingRadius: number;
  gravity: Vec3;
  bounds: { min: Vec3; max: Vec3 };
  maxParticles: number;
  dt: number;
  solver: 'basic' | 'pcisph' | 'dfsph';
  pcisphIterations?: number;
  dfsphIterations?: number;
}

export class SPHFluidFramework {
  private positions: Float32Array;
  private velocities: Float32Array;
  private forces: Float32Array;
  private densities: Float32Array;
  private pressures: Float32Array;
  private masses: Float32Array;
  private predictedPositions: Float32Array;
  private predictedVelocities: Float32Array;
  private particleCount: number;
  private capacity: number;

  private config: SPHConfig;
  private kernels: SPHKernels;
  private spatialGrid: SpatialGrid;
  private time: number;
  private useGPU: boolean;

  constructor(config: SPHConfig, useGPU: boolean = false) {
    this.config = config;
    this.capacity = config.maxParticles;
    this.particleCount = 0;
    this.time = 0;
    this.useGPU = useGPU;

    this.positions = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.forces = new Float32Array(this.capacity * 3);
    this.densities = new Float32Array(this.capacity);
    this.pressures = new Float32Array(this.capacity);
    this.masses = new Float32Array(this.capacity).fill(config.particleMass);
    this.predictedPositions = new Float32Array(this.capacity * 3);
    this.predictedVelocities = new Float32Array(this.capacity * 3);

    this.kernels = new SPHKernels(config.smoothingRadius);
    this.spatialGrid = new SpatialGrid(config.smoothingRadius, config.bounds);

    Logger.info(
      `SPHFluidFramework initialized (${useGPU ? 'GPU' : 'CPU'} mode), ` +
      `solver=${config.solver}, h=${config.smoothingRadius}, ` +
      `restDensity=${config.restDensity}`
    );
  }

  public addParticle(position: Vec3, velocity: Vec3 = new Vec3(0, 0, 0)): number {
    if (this.particleCount >= this.capacity) {
      Logger.warn('SPH particle capacity reached');
      return -1;
    }

    const idx = this.particleCount++;
    const pIdx = idx * 3;

    this.positions[pIdx] = position.x;
    this.positions[pIdx + 1] = position.y;
    this.positions[pIdx + 2] = position.z;

    this.velocities[pIdx] = velocity.x;
    this.velocities[pIdx + 1] = velocity.y;
    this.velocities[pIdx + 2] = velocity.z;

    this.densities[idx] = this.config.restDensity;
    this.pressures[idx] = 0;

    return idx;
  }

  public addParticleBox(
    min: Vec3,
    max: Vec3,
    spacing: number,
    velocity: Vec3 = new Vec3(0, 0, 0)
  ): number {
    let count = 0;

    for (let x = min.x; x < max.x; x += spacing) {
      for (let y = min.y; y < max.y; y += spacing) {
        for (let z = min.z; z < max.z; z += spacing) {
          const pos = new Vec3(x, y, z);
          if (this.addParticle(pos, velocity.clone()) >= 0) {
            count++;
          }
        }
      }
    }

    Logger.info(`Added ${count} SPH particles in box`);
    return count;
  }

  public step(): void {
    if (this.particleCount === 0) return;

    this.spatialGrid.build(this.positions, this.particleCount);

    if (this.config.solver === 'pcisph') {
      this.stepPCISPH();
    } else if (this.config.solver === 'dfsph') {
      this.stepDFSPH();
    } else {
      this.stepBasic();
    }

    this.time += this.config.dt;
  }

  private stepBasic(): void {
    this.computeDensities();

    this.computePressures();

    this.computeForces();

    this.integrate();

    this.enforceBoundaries();
  }

  private stepPCISPH(): void {
    const iterations = this.config.pcisphIterations ?? 3;

    this.computeDensities();

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      this.predictedPositions[pIdx] = this.positions[pIdx];
      this.predictedPositions[pIdx + 1] = this.positions[pIdx + 1];
      this.predictedPositions[pIdx + 2] = this.positions[pIdx + 2];

      this.predictedVelocities[pIdx] = this.velocities[pIdx];
      this.predictedVelocities[pIdx + 1] = this.velocities[pIdx + 1];
      this.predictedVelocities[pIdx + 2] = this.velocities[pIdx + 2];
    }

    for (let iter = 0; iter < iterations; iter++) {
      this.spatialGrid.build(this.predictedPositions, this.particleCount);
      this.computeDensitiesPredicted();
      this.computePressuresPCISPH();
      this.correctVelocitiesPCISPH();
    }

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      this.velocities[pIdx] = this.predictedVelocities[pIdx];
      this.velocities[pIdx + 1] = this.predictedVelocities[pIdx + 1];
      this.velocities[pIdx + 2] = this.predictedVelocities[pIdx + 2];
    }

    this.computeNonPressureForces();

    this.integrate();

    this.enforceBoundaries();
  }

  private stepDFSPH(): void {
    const iterations = this.config.dfsphIterations ?? 5;

    this.computeDensities();

    this.computeNonPressureForces();

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const dt = this.config.dt;

      const fx = this.forces[pIdx];
      const fy = this.forces[pIdx + 1];
      const fz = this.forces[pIdx + 2];

      const mass = this.masses[i];

      this.predictedVelocities[pIdx] = this.velocities[pIdx] + dt * fx / mass;
      this.predictedVelocities[pIdx + 1] = this.velocities[pIdx + 1] + dt * fy / mass;
      this.predictedVelocities[pIdx + 2] = this.velocities[pIdx + 2] + dt * fz / mass;
    }

    for (let iter = 0; iter < iterations; iter++) {
      this.correctDivergenceDFSPH();
    }

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      this.velocities[pIdx] = this.predictedVelocities[pIdx];
      this.velocities[pIdx + 1] = this.predictedVelocities[pIdx + 1];
      this.velocities[pIdx + 2] = this.predictedVelocities[pIdx + 2];
    }

    this.integrate();

    this.enforceBoundaries();

    for (let iter = 0; iter < iterations; iter++) {
      this.correctDensityDFSPH();
    }
  }

  private computeDensities(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const pos = new Vec3(
        this.positions[pIdx],
        this.positions[pIdx + 1],
        this.positions[pIdx + 2]
      );

      let density = 0;
      const neighbors = this.spatialGrid.queryNeighborsForParticle(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const weight = this.kernels.poly6Vector(r);
        density += this.masses[j] * weight;
      }

      this.densities[i] = Math.max(density, this.config.restDensity);
    }
  }

  private computeDensitiesPredicted(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const pos = new Vec3(
        this.predictedPositions[pIdx],
        this.predictedPositions[pIdx + 1],
        this.predictedPositions[pIdx + 2]
      );

      let density = 0;
      const neighbors = this.spatialGrid.queryNeighborsForParticle(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.predictedPositions[nIdx],
          this.predictedPositions[nIdx + 1],
          this.predictedPositions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const weight = this.kernels.poly6Vector(r);
        density += this.masses[j] * weight;
      }

      this.densities[i] = Math.max(density, this.config.restDensity);
    }
  }

  private computePressures(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const densityError = this.densities[i] - this.config.restDensity;
      this.pressures[i] = this.config.stiffness * densityError;
    }
  }

  private computePressuresPCISPH(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const densityError = this.densities[i] - this.config.restDensity;
      this.pressures[i] = Math.max(0, this.config.stiffness * densityError);
    }
  }

  private computeForces(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      this.forces[pIdx] = 0;
      this.forces[pIdx + 1] = 0;
      this.forces[pIdx + 2] = 0;
    }

    this.computePressureForces();
    this.computeViscosityForces();
    this.computeSurfaceTensionForces();

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const mass = this.masses[i];

      this.forces[pIdx] += mass * this.config.gravity.x;
      this.forces[pIdx + 1] += mass * this.config.gravity.y;
      this.forces[pIdx + 2] += mass * this.config.gravity.z;
    }
  }

  private computeNonPressureForces(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      this.forces[pIdx] = 0;
      this.forces[pIdx + 1] = 0;
      this.forces[pIdx + 2] = 0;
    }

    this.computeViscosityForces();
    this.computeSurfaceTensionForces();

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const mass = this.masses[i];

      this.forces[pIdx] += mass * this.config.gravity.x;
      this.forces[pIdx + 1] += mass * this.config.gravity.y;
      this.forces[pIdx + 2] += mass * this.config.gravity.z;
    }
  }

  private computePressureForces(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const pos = new Vec3(
        this.positions[pIdx],
        this.positions[pIdx + 1],
        this.positions[pIdx + 2]
      );

      const neighbors = this.spatialGrid.queryNeighborsExcludingSelf(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.spikyGradient(r);

        const pressureTerm = (this.pressures[i] + this.pressures[j]) / (2 * this.densities[j]);
        const force = Vec3.multiplyScalar(gradW, -this.masses[j] * pressureTerm);

        this.forces[pIdx] += force.x;
        this.forces[pIdx + 1] += force.y;
        this.forces[pIdx + 2] += force.z;
      }
    }
  }

  private computeViscosityForces(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const pos = new Vec3(
        this.positions[pIdx],
        this.positions[pIdx + 1],
        this.positions[pIdx + 2]
      );
      const vel = new Vec3(
        this.velocities[pIdx],
        this.velocities[pIdx + 1],
        this.velocities[pIdx + 2]
      );

      const neighbors = this.spatialGrid.queryNeighborsExcludingSelf(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );
        const nVel = new Vec3(
          this.velocities[nIdx],
          this.velocities[nIdx + 1],
          this.velocities[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const velDiff = Vec3.subtract(nVel, vel);
        const laplacianW = this.kernels.viscosityLaplacianVector(r);

        const viscosityForce = Vec3.multiplyScalar(
          velDiff,
          this.config.viscosity * this.masses[j] * laplacianW / this.densities[j]
        );

        this.forces[pIdx] += viscosityForce.x;
        this.forces[pIdx + 1] += viscosityForce.y;
        this.forces[pIdx + 2] += viscosityForce.z;
      }
    }
  }

  private computeSurfaceTensionForces(): void {
    if (this.config.surfaceTension <= 0) return;

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const pos = new Vec3(
        this.positions[pIdx],
        this.positions[pIdx + 1],
        this.positions[pIdx + 2]
      );

      let normal = new Vec3(0, 0, 0);
      const neighbors = this.spatialGrid.queryNeighborsExcludingSelf(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.poly6Gradient(r);

        const term = Vec3.multiplyScalar(gradW, this.masses[j] / this.densities[j]);
        normal = Vec3.add(normal, term);
      }

      const normalLength = normal.length();
      if (normalLength > 1e-6) {
        const surfaceForce = Vec3.multiplyScalar(normal, -this.config.surfaceTension);
        this.forces[pIdx] += surfaceForce.x;
        this.forces[pIdx + 1] += surfaceForce.y;
        this.forces[pIdx + 2] += surfaceForce.z;
      }
    }
  }

  private correctVelocitiesPCISPH(): void {
    const dt = this.config.dt;

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const pos = new Vec3(
        this.predictedPositions[pIdx],
        this.predictedPositions[pIdx + 1],
        this.predictedPositions[pIdx + 2]
      );

      let pressureAccel = new Vec3(0, 0, 0);
      const neighbors = this.spatialGrid.queryNeighborsExcludingSelf(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.predictedPositions[nIdx],
          this.predictedPositions[nIdx + 1],
          this.predictedPositions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.spikyGradient(r);

        const pressureTerm = (this.pressures[i] + this.pressures[j]) / (2 * this.densities[j]);
        const accel = Vec3.multiplyScalar(gradW, -this.masses[j] * pressureTerm / this.masses[i]);

        pressureAccel = Vec3.add(pressureAccel, accel);
      }

      this.predictedVelocities[pIdx] += dt * pressureAccel.x;
      this.predictedVelocities[pIdx + 1] += dt * pressureAccel.y;
      this.predictedVelocities[pIdx + 2] += dt * pressureAccel.z;

      this.predictedPositions[pIdx] = this.positions[pIdx] + dt * this.predictedVelocities[pIdx];
      this.predictedPositions[pIdx + 1] = this.positions[pIdx + 1] + dt * this.predictedVelocities[pIdx + 1];
      this.predictedPositions[pIdx + 2] = this.positions[pIdx + 2] + dt * this.predictedVelocities[pIdx + 2];
    }
  }

  private correctDivergenceDFSPH(): void {
    const dt = this.config.dt;

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;

      let divergence = 0;
      const neighbors = this.spatialGrid.queryNeighborsExcludingSelf(i, this.config.smoothingRadius);

      for (const j of neighbors) {
        const nIdx = j * 3;
        const pos = new Vec3(
          this.positions[pIdx],
          this.positions[pIdx + 1],
          this.positions[pIdx + 2]
        );
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.spikyGradient(r);

        const velDiff = new Vec3(
          this.predictedVelocities[pIdx] - this.predictedVelocities[nIdx],
          this.predictedVelocities[pIdx + 1] - this.predictedVelocities[nIdx + 1],
          this.predictedVelocities[pIdx + 2] - this.predictedVelocities[nIdx + 2]
        );

        divergence += this.masses[j] * Vec3.dot(velDiff, gradW);
      }

      const alpha = 0.5;
      const correction = -alpha * divergence / this.densities[i];

      for (const j of neighbors) {
        const nIdx = j * 3;
        const pos = new Vec3(
          this.positions[pIdx],
          this.positions[pIdx + 1],
          this.positions[pIdx + 2]
        );
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.spikyGradient(r);

        const velCorrection = Vec3.multiplyScalar(gradW, correction * this.masses[j]);

        this.predictedVelocities[pIdx] += velCorrection.x;
        this.predictedVelocities[pIdx + 1] += velCorrection.y;
        this.predictedVelocities[pIdx + 2] += velCorrection.z;
      }
    }
  }

  private correctDensityDFSPH(): void {
    this.spatialGrid.build(this.positions, this.particleCount);
    this.computeDensities();

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const densityError = this.densities[i] - this.config.restDensity;

      if (Math.abs(densityError) < 1e-3) continue;

      const pos = new Vec3(
        this.positions[pIdx],
        this.positions[pIdx + 1],
        this.positions[pIdx + 2]
      );

      const neighbors = this.spatialGrid.queryNeighborsExcludingSelf(i, this.config.smoothingRadius);

      let gradientSum = 0;
      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.spikyGradient(r);
        gradientSum += this.masses[j] * gradW.lengthSquared();
      }

      if (gradientSum < 1e-10) continue;

      const correction = -densityError / gradientSum;

      for (const j of neighbors) {
        const nIdx = j * 3;
        const nPos = new Vec3(
          this.positions[nIdx],
          this.positions[nIdx + 1],
          this.positions[nIdx + 2]
        );

        const r = Vec3.subtract(pos, nPos);
        const gradW = this.kernels.spikyGradient(r);

        const posCorrection = Vec3.multiplyScalar(gradW, correction * this.masses[j]);

        this.positions[pIdx] += posCorrection.x;
        this.positions[pIdx + 1] += posCorrection.y;
        this.positions[pIdx + 2] += posCorrection.z;
      }
    }
  }

  private integrate(): void {
    const dt = this.config.dt;

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;
      const mass = this.masses[i];

      const ax = this.forces[pIdx] / mass;
      const ay = this.forces[pIdx + 1] / mass;
      const az = this.forces[pIdx + 2] / mass;

      this.velocities[pIdx] += dt * ax;
      this.velocities[pIdx + 1] += dt * ay;
      this.velocities[pIdx + 2] += dt * az;

      this.positions[pIdx] += dt * this.velocities[pIdx];
      this.positions[pIdx + 1] += dt * this.velocities[pIdx + 1];
      this.positions[pIdx + 2] += dt * this.velocities[pIdx + 2];
    }
  }

  private enforceBoundaries(): void {
    const damping = 0.5;
    const eps = 1e-4;

    for (let i = 0; i < this.particleCount; i++) {
      const pIdx = i * 3;

      if (this.positions[pIdx] < this.config.bounds.min.x + eps) {
        this.positions[pIdx] = this.config.bounds.min.x + eps;
        this.velocities[pIdx] *= -damping;
      }
      if (this.positions[pIdx] > this.config.bounds.max.x - eps) {
        this.positions[pIdx] = this.config.bounds.max.x - eps;
        this.velocities[pIdx] *= -damping;
      }

      if (this.positions[pIdx + 1] < this.config.bounds.min.y + eps) {
        this.positions[pIdx + 1] = this.config.bounds.min.y + eps;
        this.velocities[pIdx + 1] *= -damping;
      }
      if (this.positions[pIdx + 1] > this.config.bounds.max.y - eps) {
        this.positions[pIdx + 1] = this.config.bounds.max.y - eps;
        this.velocities[pIdx + 1] *= -damping;
      }

      if (this.positions[pIdx + 2] < this.config.bounds.min.z + eps) {
        this.positions[pIdx + 2] = this.config.bounds.min.z + eps;
        this.velocities[pIdx + 2] *= -damping;
      }
      if (this.positions[pIdx + 2] > this.config.bounds.max.z - eps) {
        this.positions[pIdx + 2] = this.config.bounds.max.z - eps;
        this.velocities[pIdx + 2] *= -damping;
      }
    }
  }

  public getParticleCount(): number {
    return this.particleCount;
  }

  public getPositions(): Float32Array {
    return this.positions;
  }

  public getVelocities(): Float32Array {
    return this.velocities;
  }

  public getDensities(): Float32Array {
    return this.densities;
  }

  public getPressures(): Float32Array {
    return this.pressures;
  }

  public getTime(): number {
    return this.time;
  }

  public reset(): void {
    this.particleCount = 0;
    this.time = 0;
    this.spatialGrid.clear();
    Logger.info('SPHFluidFramework reset');
  }
}
