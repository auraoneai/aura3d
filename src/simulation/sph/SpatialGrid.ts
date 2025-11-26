import { Vector3 as Vec3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

export class SpatialGrid {
  private cellSize: number;
  private grid: Map<number, number[]>;
  private particlePositions: Float32Array;
  private particleCount: number;
  private bounds: { min: Vec3; max: Vec3 };

  constructor(cellSize: number, bounds: { min: Vec3; max: Vec3 }) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.particlePositions = new Float32Array(0);
    this.particleCount = 0;
    this.bounds = bounds;

    Logger.info(
      `SpatialGrid initialized with cellSize=${cellSize}, ` +
      `bounds=[${bounds.min.x},${bounds.min.y},${bounds.min.z}] to ` +
      `[${bounds.max.x},${bounds.max.y},${bounds.max.z}]`
    );
  }

  public build(positions: Float32Array, count: number): void {
    this.particlePositions = positions;
    this.particleCount = count;
    this.grid.clear();

    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      const hash = this.spatialHash(x, y, z);

      if (!this.grid.has(hash)) {
        this.grid.set(hash, []);
      }
      this.grid.get(hash)!.push(i);
    }
  }

  public queryNeighbors(position: Vec3, radius: number): number[] {
    const neighbors: number[] = [];
    const radiusSquared = radius * radius;

    const cellRadius = Math.ceil(radius / this.cellSize);
    const baseCell = this.getCellCoordinates(position.x, position.y, position.z);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const cellX = baseCell.x + dx;
          const cellY = baseCell.y + dy;
          const cellZ = baseCell.z + dz;

          const hash = this.hashCell(cellX, cellY, cellZ);
          const cellParticles = this.grid.get(hash);

          if (cellParticles) {
            for (const particleIdx of cellParticles) {
              const px = this.particlePositions[particleIdx * 3];
              const py = this.particlePositions[particleIdx * 3 + 1];
              const pz = this.particlePositions[particleIdx * 3 + 2];

              const dx = position.x - px;
              const dy = position.y - py;
              const dz = position.z - pz;

              const distSquared = dx * dx + dy * dy + dz * dz;

              if (distSquared <= radiusSquared) {
                neighbors.push(particleIdx);
              }
            }
          }
        }
      }
    }

    return neighbors;
  }

  public queryNeighborsForParticle(particleIndex: number, radius: number): number[] {
    if (particleIndex < 0 || particleIndex >= this.particleCount) {
      return [];
    }

    const px = this.particlePositions[particleIndex * 3];
    const py = this.particlePositions[particleIndex * 3 + 1];
    const pz = this.particlePositions[particleIndex * 3 + 2];

    const position = new Vec3(px, py, pz);
    return this.queryNeighbors(position, radius);
  }

  public queryNeighborsExcludingSelf(particleIndex: number, radius: number): number[] {
    const neighbors = this.queryNeighborsForParticle(particleIndex, radius);
    return neighbors.filter(idx => idx !== particleIndex);
  }

  public queryCell(cellX: number, cellY: number, cellZ: number): number[] {
    const hash = this.hashCell(cellX, cellY, cellZ);
    return this.grid.get(hash) || [];
  }

  public getCellCoordinates(x: number, y: number, z: number): { x: number; y: number; z: number } {
    return {
      x: Math.floor(x / this.cellSize),
      y: Math.floor(y / this.cellSize),
      z: Math.floor(z / this.cellSize)
    };
  }

  private spatialHash(x: number, y: number, z: number): number {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);

    return this.hashCell(cellX, cellY, cellZ);
  }

  private hashCell(cellX: number, cellY: number, cellZ: number): number {
    const p1 = 73856093;
    const p2 = 19349663;
    const p3 = 83492791;

    const hash = ((cellX * p1) ^ (cellY * p2) ^ (cellZ * p3));
    return hash;
  }

  public clear(): void {
    this.grid.clear();
    this.particleCount = 0;
  }

  public getCellSize(): number {
    return this.cellSize;
  }

  public setCellSize(cellSize: number): void {
    this.cellSize = cellSize;
  }

  public getOccupiedCellCount(): number {
    return this.grid.size;
  }

  public getAverageParticlesPerCell(): number {
    if (this.grid.size === 0) return 0;
    return this.particleCount / this.grid.size;
  }

  public getMaxParticlesInCell(): number {
    let max = 0;
    for (const particles of this.grid.values()) {
      max = Math.max(max, particles.length);
    }
    return max;
  }

  public getAllCells(): IterableIterator<[number, number[]]> {
    return this.grid.entries();
  }

  public getBounds(): { min: Vec3; max: Vec3 } {
    return this.bounds;
  }

  public setBounds(bounds: { min: Vec3; max: Vec3 }): void {
    this.bounds = bounds;
  }
}
