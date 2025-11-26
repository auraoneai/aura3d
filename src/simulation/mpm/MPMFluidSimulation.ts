import { Vector3 as Vec3 } from '../../math/Vector3';
import { Matrix3 as Mat3 } from '../../math/Matrix3';
import { Logger } from '../../core/Logger';
import { MPMGrid } from './Grid';
import { ParticleBuffer } from './ParticleBuffer';
import {
  MaterialModel,
  MaterialType,
  MaterialParameters,
  createMaterial
} from './MaterialModels';

export interface MPMSimulationConfig {
  gridResolution: Vec3;
  cellSize: number;
  bounds: { min: Vec3; max: Vec3 };
  gravity: Vec3;
  particleCapacity: number;
  dt: number;
  flipRatio: number;
  friction: number;
}

export class MPMFluidSimulation {
  private grid: MPMGrid;
  private particles: ParticleBuffer;
  private materials: Map<number, MaterialModel>;
  private config: MPMSimulationConfig;
  private time: number;
  private useGPU: boolean;

  constructor(config: MPMSimulationConfig, useGPU: boolean = false) {
    this.config = config;
    this.time = 0;
    this.useGPU = useGPU;

    this.grid = new MPMGrid(
      config.gridResolution,
      config.cellSize,
      config.bounds
    );

    this.particles = new ParticleBuffer(config.particleCapacity);
    this.materials = new Map();

    Logger.info(
      'MPMFluidSimulation',
      `Initialized (${useGPU ? 'GPU' : 'CPU'} mode), ` +
      `dt=${config.dt}, flipRatio=${config.flipRatio}`
    );
  }

  public addMaterial(
    typeId: number,
    materialType: MaterialType,
    parameters: MaterialParameters
  ): void {
    const material = createMaterial(materialType, parameters);
    this.materials.set(typeId, material);
    Logger.info('MPMFluidSimulation', `Material ${typeId} (${MaterialType[materialType]}) added`);
  }

  public addParticle(
    position: Vec3,
    velocity: Vec3,
    mass: number,
    volume: number,
    materialType: number
  ): number {
    const particleIndex = this.particles.addParticle({
      position,
      velocity,
      affineVelocity: new Mat3(),
      mass,
      volume,
      deformationGradient: Mat3.identity(),
      deformationGradientPlastic: Mat3.identity(),
      materialType,
      active: true
    });

    return particleIndex;
  }

  public addParticleBox(
    min: Vec3,
    max: Vec3,
    spacing: number,
    velocity: Vec3,
    density: number,
    materialType: number
  ): number {
    let count = 0;
    const particleVolume = spacing * spacing * spacing;
    const particleMass = density * particleVolume;

    for (let x = min.x; x < max.x; x += spacing) {
      for (let y = min.y; y < max.y; y += spacing) {
        for (let z = min.z; z < max.z; z += spacing) {
          const pos = new Vec3(x, y, z);
          const vel = velocity.clone();
          this.addParticle(pos, vel, particleMass, particleVolume, materialType);
          count++;
        }
      }
    }

    Logger.info('MPMFluidSimulation', `Added ${count} particles in box`);
    return count;
  }

  public step(): void {
    if (this.useGPU) {
      this.stepGPU();
    } else {
      this.stepCPU();
    }
    this.time += this.config.dt;
  }

  private stepCPU(): void {
    this.grid.clearGrid();

    this.particleToGrid();

    this.updateGridVelocities();

    this.grid.enforceBoundaryConditions(this.config.friction);

    this.gridToParticle();

    this.advectParticles();

    this.updateDeformationGradients();
  }

  private particleToGrid(): void {
    const particleCount = this.particles.getCount();

    for (let p = 0; p < particleCount; p++) {
      if (!this.particles.isActive(p)) continue;

      const pos = this.particles.getPosition(p);
      const vel = this.particles.getVelocity(p);
      const mass = this.particles.getParticle(p)!.mass;
      const affineVel = this.particles.getAffineVelocity(p);

      const neighbors = this.grid.getNeighborCellIndices(pos);

      for (const { i, j, k } of neighbors) {
        const cell = this.grid.getCell(i, j, k);
        if (!cell) continue;

        const weight = this.grid.interpolateWeight(pos, i, j, k);
        if (weight < 1e-10) continue;

        this.grid.markCellActive(i, j, k);

        const cellPos = this.grid.gridToWorld(i, j, k);
        const dx = Vec3.subtract(cellPos, pos);

        // Multiply matrix by vector: affineVel * dx
        const ae = affineVel.elements;
        const affineContribution = new Vec3(
          ae[0] * dx.x + ae[3] * dx.y + ae[6] * dx.z,
          ae[1] * dx.x + ae[4] * dx.y + ae[7] * dx.z,
          ae[2] * dx.x + ae[5] * dx.y + ae[8] * dx.z
        );
        const weightedVel = Vec3.add(vel, affineContribution);

        cell.mass += weight * mass;
        cell.velocity.x += weight * mass * weightedVel.x;
        cell.velocity.y += weight * mass * weightedVel.y;
        cell.velocity.z += weight * mass * weightedVel.z;
      }
    }

    for (const cellIndex of this.grid.getActiveCells()) {
      const cell = this.grid.getCellByIndex(cellIndex);
      if (cell.mass > 1e-10) {
        cell.velocity.x /= cell.mass;
        cell.velocity.y /= cell.mass;
        cell.velocity.z /= cell.mass;
      }
    }
  }

  private updateGridVelocities(): void {
    const dt = this.config.dt;
    const particleCount = this.particles.getCount();

    for (const cellIndex of this.grid.getActiveCells()) {
      const cell = this.grid.getCellByIndex(cellIndex);
      cell.force.set(0, 0, 0);
    }

    for (let p = 0; p < particleCount; p++) {
      if (!this.particles.isActive(p)) continue;

      const pos = this.particles.getPosition(p);
      const F = this.particles.getDeformationGradient(p);
      const Fp = this.particles.getDeformationGradientPlastic(p);
      const volume = this.particles.getParticle(p)!.volume;
      const materialType = this.particles.getMaterialType(p);

      const material = this.materials.get(materialType);
      if (!material) continue;

      const { stress } = material.computeStress(F, Fp, dt);

      const neighbors = this.grid.getNeighborCellIndices(pos);

      for (const { i, j, k } of neighbors) {
        const cell = this.grid.getCell(i, j, k);
        if (!cell || !cell.active) continue;

        const weightGrad = this.grid.interpolateWeightGradient(pos, i, j, k);

        // Multiply matrix by vector: stress * weightGrad
        const se = stress.elements;
        const force = new Vec3(
          se[0] * weightGrad.x + se[3] * weightGrad.y + se[6] * weightGrad.z,
          se[1] * weightGrad.x + se[4] * weightGrad.y + se[7] * weightGrad.z,
          se[2] * weightGrad.x + se[5] * weightGrad.y + se[8] * weightGrad.z
        );

        cell.force.x -= volume * force.x;
        cell.force.y -= volume * force.y;
        cell.force.z -= volume * force.z;
      }
    }

    for (const cellIndex of this.grid.getActiveCells()) {
      const cell = this.grid.getCellByIndex(cellIndex);

      if (cell.mass > 1e-10) {
        const accel = new Vec3(
          cell.force.x / cell.mass,
          cell.force.y / cell.mass,
          cell.force.z / cell.mass
        );

        accel.x += this.config.gravity.x;
        accel.y += this.config.gravity.y;
        accel.z += this.config.gravity.z;

        cell.velocityNew.x = cell.velocity.x + dt * accel.x;
        cell.velocityNew.y = cell.velocity.y + dt * accel.y;
        cell.velocityNew.z = cell.velocity.z + dt * accel.z;
      } else {
        cell.velocityNew.set(0, 0, 0);
      }
    }

    for (const cellIndex of this.grid.getActiveCells()) {
      const cell = this.grid.getCellByIndex(cellIndex);
      cell.velocity.x = cell.velocityNew.x;
      cell.velocity.y = cell.velocityNew.y;
      cell.velocity.z = cell.velocityNew.z;
    }
  }

  private gridToParticle(): void {
    const particleCount = this.particles.getCount();
    const flipRatio = this.config.flipRatio;

    for (let p = 0; p < particleCount; p++) {
      if (!this.particles.isActive(p)) continue;

      const pos = this.particles.getPosition(p);
      const velOld = this.particles.getVelocity(p);

      let velPIC = new Vec3(0, 0, 0);
      let velFLIP = velOld.clone();
      let affineVel = new Mat3();

      const neighbors = this.grid.getNeighborCellIndices(pos);

      for (const { i, j, k } of neighbors) {
        const cell = this.grid.getCell(i, j, k);
        if (!cell || !cell.active) continue;

        const weight = this.grid.interpolateWeight(pos, i, j, k);
        if (weight < 1e-10) continue;

        const cellPos = this.grid.gridToWorld(i, j, k);
        const dx = Vec3.subtract(cellPos, pos);

        velPIC.x += weight * cell.velocity.x;
        velPIC.y += weight * cell.velocity.y;
        velPIC.z += weight * cell.velocity.z;

        const dvx = weight * (cell.velocity.x - cell.velocityNew.x);
        const dvy = weight * (cell.velocity.y - cell.velocityNew.y);
        const dvz = weight * (cell.velocity.z - cell.velocityNew.z);

        velFLIP.x -= dvx;
        velFLIP.y -= dvy;
        velFLIP.z -= dvz;

        const outerProduct = new Mat3();
        outerProduct.set(
          cell.velocity.x * dx.x, cell.velocity.x * dx.y, cell.velocity.x * dx.z,
          cell.velocity.y * dx.x, cell.velocity.y * dx.y, cell.velocity.y * dx.z,
          cell.velocity.z * dx.x, cell.velocity.z * dx.y, cell.velocity.z * dx.z
        );

        affineVel = Mat3.add(affineVel, Mat3.multiplyScalar(outerProduct, weight));
      }

      const velNew = new Vec3(
        (1 - flipRatio) * velPIC.x + flipRatio * velFLIP.x,
        (1 - flipRatio) * velPIC.y + flipRatio * velFLIP.y,
        (1 - flipRatio) * velPIC.z + flipRatio * velFLIP.z
      );

      this.particles.setVelocity(p, velNew);
      this.particles.setAffineVelocity(p, affineVel);
    }
  }

  private advectParticles(): void {
    const dt = this.config.dt;
    const particleCount = this.particles.getCount();

    for (let p = 0; p < particleCount; p++) {
      if (!this.particles.isActive(p)) continue;

      const pos = this.particles.getPosition(p);
      const vel = this.particles.getVelocity(p);

      const newPos = new Vec3(
        pos.x + dt * vel.x,
        pos.y + dt * vel.y,
        pos.z + dt * vel.z
      );

      const eps = 1e-4;
      newPos.x = Math.max(this.config.bounds.min.x + eps, Math.min(this.config.bounds.max.x - eps, newPos.x));
      newPos.y = Math.max(this.config.bounds.min.y + eps, Math.min(this.config.bounds.max.y - eps, newPos.y));
      newPos.z = Math.max(this.config.bounds.min.z + eps, Math.min(this.config.bounds.max.z - eps, newPos.z));

      this.particles.setPosition(p, newPos);
    }
  }

  private updateDeformationGradients(): void {
    const dt = this.config.dt;
    const particleCount = this.particles.getCount();

    for (let p = 0; p < particleCount; p++) {
      if (!this.particles.isActive(p)) continue;

      const pos = this.particles.getPosition(p);
      const F = this.particles.getDeformationGradient(p);
      const Fp = this.particles.getDeformationGradientPlastic(p);
      const materialType = this.particles.getMaterialType(p);

      let velocityGrad = new Mat3();
      const neighbors = this.grid.getNeighborCellIndices(pos);

      for (const { i, j, k } of neighbors) {
        const cell = this.grid.getCell(i, j, k);
        if (!cell || !cell.active) continue;

        const weightGrad = this.grid.interpolateWeightGradient(pos, i, j, k);

        const vg = velocityGrad.elements;
        vg[0] += cell.velocity.x * weightGrad.x;  // m00
        vg[3] += cell.velocity.x * weightGrad.y;  // m01
        vg[6] += cell.velocity.x * weightGrad.z;  // m02
        vg[1] += cell.velocity.y * weightGrad.x;  // m10
        vg[4] += cell.velocity.y * weightGrad.y;  // m11
        vg[7] += cell.velocity.y * weightGrad.z;  // m12
        vg[2] += cell.velocity.z * weightGrad.x;  // m20
        vg[5] += cell.velocity.z * weightGrad.y;  // m21
        vg[8] += cell.velocity.z * weightGrad.z;  // m22
      }

      const I = Mat3.identity();
      const dF = Mat3.multiplyScalar(velocityGrad, dt);
      const Fnew = Mat3.multiply(Mat3.add(I, dF), F);

      this.particles.setDeformationGradient(p, Fnew);

      const material = this.materials.get(materialType);
      if (material) {
        const { newFp } = material.computeStress(Fnew, Fp, dt);
        this.particles.setDeformationGradientPlastic(p, newFp);
      }
    }
  }

  private stepGPU(): void {
    Logger.warn('MPMFluidSimulation', 'GPU implementation would use WebGPU compute shaders');
    this.stepCPU();
  }

  public getParticles(): ParticleBuffer {
    return this.particles;
  }

  public getGrid(): MPMGrid {
    return this.grid;
  }

  public getTime(): number {
    return this.time;
  }

  public reset(): void {
    this.particles.clear();
    this.grid.clearGrid();
    this.time = 0;
    Logger.info('MPMFluidSimulation', 'Simulation reset');
  }
}
