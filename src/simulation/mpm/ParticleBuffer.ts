import { Vector3 as Vec3 } from '../../math/Vector3';
import { Matrix3 as Mat3 } from '../../math/Matrix3';
import { Logger } from '../../core/Logger';

export interface ParticleData {
  position: Vec3;
  velocity: Vec3;
  affineVelocity: Mat3;
  mass: number;
  volume: number;
  deformationGradient: Mat3;
  deformationGradientPlastic: Mat3;
  materialType: number;
  active: boolean;
}

export class ParticleBuffer {
  private positions: Float32Array;
  private velocities: Float32Array;
  private affineVelocities: Float32Array;
  private masses: Float32Array;
  private volumes: Float32Array;
  private deformationGradients: Float32Array;
  private deformationGradientsPlastic: Float32Array;
  private materialTypes: Uint8Array;
  private activeFlags: Uint8Array;
  private particleCount: number;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.particleCount = 0;

    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.affineVelocities = new Float32Array(capacity * 9);
    this.masses = new Float32Array(capacity);
    this.volumes = new Float32Array(capacity);
    this.deformationGradients = new Float32Array(capacity * 9);
    this.deformationGradientsPlastic = new Float32Array(capacity * 9);
    this.materialTypes = new Uint8Array(capacity);
    this.activeFlags = new Uint8Array(capacity);

    for (let i = 0; i < capacity; i++) {
      const fIdx = i * 9;
      this.deformationGradients[fIdx] = 1;
      this.deformationGradients[fIdx + 4] = 1;
      this.deformationGradients[fIdx + 8] = 1;

      this.deformationGradientsPlastic[fIdx] = 1;
      this.deformationGradientsPlastic[fIdx + 4] = 1;
      this.deformationGradientsPlastic[fIdx + 8] = 1;
    }

    Logger.info('ParticleBuffer', `Initialized with capacity ${capacity}`);
  }

  public addParticle(particle: Partial<ParticleData>): number {
    if (this.particleCount >= this.capacity) {
      Logger.warn('ParticleBuffer', 'At capacity, cannot add more particles');
      return -1;
    }

    const index = this.particleCount++;
    const posIdx = index * 3;
    const matIdx = index * 9;

    if (particle.position) {
      this.positions[posIdx] = particle.position.x;
      this.positions[posIdx + 1] = particle.position.y;
      this.positions[posIdx + 2] = particle.position.z;
    }

    if (particle.velocity) {
      this.velocities[posIdx] = particle.velocity.x;
      this.velocities[posIdx + 1] = particle.velocity.y;
      this.velocities[posIdx + 2] = particle.velocity.z;
    }

    if (particle.affineVelocity) {
      const c = particle.affineVelocity;
      // Store in column-major order matching Matrix3.elements layout
      this.affineVelocities[matIdx] = c.elements[0];
      this.affineVelocities[matIdx + 1] = c.elements[1];
      this.affineVelocities[matIdx + 2] = c.elements[2];
      this.affineVelocities[matIdx + 3] = c.elements[3];
      this.affineVelocities[matIdx + 4] = c.elements[4];
      this.affineVelocities[matIdx + 5] = c.elements[5];
      this.affineVelocities[matIdx + 6] = c.elements[6];
      this.affineVelocities[matIdx + 7] = c.elements[7];
      this.affineVelocities[matIdx + 8] = c.elements[8];
    }

    this.masses[index] = particle.mass ?? 1.0;
    this.volumes[index] = particle.volume ?? 1.0;
    this.materialTypes[index] = particle.materialType ?? 0;
    this.activeFlags[index] = particle.active === false ? 0 : 1;

    if (particle.deformationGradient) {
      const f = particle.deformationGradient;
      this.deformationGradients[matIdx] = f.elements[0];
      this.deformationGradients[matIdx + 1] = f.elements[1];
      this.deformationGradients[matIdx + 2] = f.elements[2];
      this.deformationGradients[matIdx + 3] = f.elements[3];
      this.deformationGradients[matIdx + 4] = f.elements[4];
      this.deformationGradients[matIdx + 5] = f.elements[5];
      this.deformationGradients[matIdx + 6] = f.elements[6];
      this.deformationGradients[matIdx + 7] = f.elements[7];
      this.deformationGradients[matIdx + 8] = f.elements[8];
    }

    if (particle.deformationGradientPlastic) {
      const fp = particle.deformationGradientPlastic;
      this.deformationGradientsPlastic[matIdx] = fp.elements[0];
      this.deformationGradientsPlastic[matIdx + 1] = fp.elements[1];
      this.deformationGradientsPlastic[matIdx + 2] = fp.elements[2];
      this.deformationGradientsPlastic[matIdx + 3] = fp.elements[3];
      this.deformationGradientsPlastic[matIdx + 4] = fp.elements[4];
      this.deformationGradientsPlastic[matIdx + 5] = fp.elements[5];
      this.deformationGradientsPlastic[matIdx + 6] = fp.elements[6];
      this.deformationGradientsPlastic[matIdx + 7] = fp.elements[7];
      this.deformationGradientsPlastic[matIdx + 8] = fp.elements[8];
    }

    return index;
  }

  public getParticle(index: number): ParticleData | null {
    if (index < 0 || index >= this.particleCount) {
      return null;
    }

    const posIdx = index * 3;
    const matIdx = index * 9;

    return {
      position: new Vec3(
        this.positions[posIdx],
        this.positions[posIdx + 1],
        this.positions[posIdx + 2]
      ),
      velocity: new Vec3(
        this.velocities[posIdx],
        this.velocities[posIdx + 1],
        this.velocities[posIdx + 2]
      ),
      affineVelocity: (() => {
        const m = new Mat3();
        m.elements.set(this.affineVelocities.subarray(matIdx, matIdx + 9));
        return m;
      })(),
      mass: this.masses[index],
      volume: this.volumes[index],
      deformationGradient: (() => {
        const m = new Mat3();
        m.elements.set(this.deformationGradients.subarray(matIdx, matIdx + 9));
        return m;
      })(),
      deformationGradientPlastic: (() => {
        const m = new Mat3();
        m.elements.set(this.deformationGradientsPlastic.subarray(matIdx, matIdx + 9));
        return m;
      })(),
      materialType: this.materialTypes[index],
      active: this.activeFlags[index] === 1
    };
  }

  public setPosition(index: number, position: Vec3): void {
    const posIdx = index * 3;
    this.positions[posIdx] = position.x;
    this.positions[posIdx + 1] = position.y;
    this.positions[posIdx + 2] = position.z;
  }

  public getPosition(index: number): Vec3 {
    const posIdx = index * 3;
    return new Vec3(
      this.positions[posIdx],
      this.positions[posIdx + 1],
      this.positions[posIdx + 2]
    );
  }

  public setVelocity(index: number, velocity: Vec3): void {
    const posIdx = index * 3;
    this.velocities[posIdx] = velocity.x;
    this.velocities[posIdx + 1] = velocity.y;
    this.velocities[posIdx + 2] = velocity.z;
  }

  public getVelocity(index: number): Vec3 {
    const posIdx = index * 3;
    return new Vec3(
      this.velocities[posIdx],
      this.velocities[posIdx + 1],
      this.velocities[posIdx + 2]
    );
  }

  public setAffineVelocity(index: number, c: Mat3): void {
    const matIdx = index * 9;
    this.affineVelocities.set(c.elements, matIdx);
  }

  public getAffineVelocity(index: number): Mat3 {
    const matIdx = index * 9;
    const m = new Mat3();
    m.elements.set(this.affineVelocities.subarray(matIdx, matIdx + 9));
    return m;
  }

  public setDeformationGradient(index: number, f: Mat3): void {
    const matIdx = index * 9;
    this.deformationGradients.set(f.elements, matIdx);
  }

  public getDeformationGradient(index: number): Mat3 {
    const matIdx = index * 9;
    const m = new Mat3();
    m.elements.set(this.deformationGradients.subarray(matIdx, matIdx + 9));
    return m;
  }

  public setDeformationGradientPlastic(index: number, fp: Mat3): void {
    const matIdx = index * 9;
    this.deformationGradientsPlastic.set(fp.elements, matIdx);
  }

  public getDeformationGradientPlastic(index: number): Mat3 {
    const matIdx = index * 9;
    const m = new Mat3();
    m.elements.set(this.deformationGradientsPlastic.subarray(matIdx, matIdx + 9));
    return m;
  }

  public getMaterialType(index: number): number {
    return this.materialTypes[index];
  }

  public setMaterialType(index: number, type: number): void {
    this.materialTypes[index] = type;
  }

  public isActive(index: number): boolean {
    return this.activeFlags[index] === 1;
  }

  public setActive(index: number, active: boolean): void {
    this.activeFlags[index] = active ? 1 : 0;
  }

  public getCount(): number {
    return this.particleCount;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public getPositions(): Float32Array {
    return this.positions;
  }

  public getVelocities(): Float32Array {
    return this.velocities;
  }

  public clear(): void {
    this.particleCount = 0;
  }
}
