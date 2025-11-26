import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

export interface GridCell {
  mass: number;
  velocity: Vector3;
  velocityNew: Vector3;
  force: Vector3;
  active: boolean;
}

export class MPMGrid {
  public readonly resolution: Vector3;
  public readonly cellSize: number;
  public readonly bounds: { min: Vector3; max: Vector3 };
  private cells: GridCell[];
  private activeCells: Set<number>;
  private readonly totalCells: number;

  constructor(
    resolution: Vector3,
    cellSize: number,
    bounds: { min: Vector3; max: Vector3 }
  ) {
    this.resolution = resolution;
    this.cellSize = cellSize;
    this.bounds = bounds;
    this.totalCells = resolution.x * resolution.y * resolution.z;
    this.cells = new Array(this.totalCells);
    this.activeCells = new Set();

    for (let i = 0; i < this.totalCells; i++) {
      this.cells[i] = {
        mass: 0,
        velocity: new Vector3(0, 0, 0),
        velocityNew: new Vector3(0, 0, 0),
        force: new Vector3(0, 0, 0),
        active: false
      };
    }

    Logger.info(
      'MPMGrid',
      `Initialized: ${resolution.x}x${resolution.y}x${resolution.z} cells, ` +
      `cellSize=${cellSize}, totalCells=${this.totalCells}`
    );
  }

  public getCellIndex(i: number, j: number, k: number): number {
    if (
      i < 0 || i >= this.resolution.x ||
      j < 0 || j >= this.resolution.y ||
      k < 0 || k >= this.resolution.z
    ) {
      return -1;
    }
    return i + j * this.resolution.x + k * this.resolution.x * this.resolution.y;
  }

  public getCellIndices(index: number): { i: number; j: number; k: number } {
    const xy = this.resolution.x * this.resolution.y;
    const k = Math.floor(index / xy);
    const remainder = index % xy;
    const j = Math.floor(remainder / this.resolution.x);
    const i = remainder % this.resolution.x;
    return { i, j, k };
  }

  public worldToGrid(worldPos: Vector3): { i: number; j: number; k: number } {
    const localPos = worldPos.sub(this.bounds.min);
    const i = Math.floor(localPos.x / this.cellSize);
    const j = Math.floor(localPos.y / this.cellSize);
    const k = Math.floor(localPos.z / this.cellSize);
    return { i, j, k };
  }

  public gridToWorld(i: number, j: number, k: number): Vector3 {
    return new Vector3(
      this.bounds.min.x + (i + 0.5) * this.cellSize,
      this.bounds.min.y + (j + 0.5) * this.cellSize,
      this.bounds.min.z + (k + 0.5) * this.cellSize
    );
  }

  public getCell(i: number, j: number, k: number): GridCell | null {
    const index = this.getCellIndex(i, j, k);
    if (index < 0) return null;
    return this.cells[index];
  }

  public getCellByIndex(index: number): GridCell {
    return this.cells[index];
  }

  public markCellActive(i: number, j: number, k: number): void {
    const index = this.getCellIndex(i, j, k);
    if (index >= 0) {
      this.activeCells.add(index);
      this.cells[index]!.active = true;
    }
  }

  public clearGrid(): void {
    const activeCellsArray = Array.from(this.activeCells);
    for (const index of activeCellsArray) {
      const cell = this.cells[index]!;
      cell.mass = 0;
      cell.velocity.x = 0;
      cell.velocity.y = 0;
      cell.velocity.z = 0;
      cell.velocityNew.x = 0;
      cell.velocityNew.y = 0;
      cell.velocityNew.z = 0;
      cell.force.x = 0;
      cell.force.y = 0;
      cell.force.z = 0;
      cell.active = false;
    }
    this.activeCells.clear();
  }

  public getActiveCells(): IterableIterator<number> {
    return this.activeCells.values();
  }

  public getActiveCellCount(): number {
    return this.activeCells.size;
  }

  public quadraticBSplineWeight(distance: number): number {
    const absDist = Math.abs(distance);
    if (absDist < 0.5) {
      return 0.75 - absDist * absDist;
    } else if (absDist < 1.5) {
      const d = 1.5 - absDist;
      return 0.5 * d * d;
    }
    return 0;
  }

  public quadraticBSplineGradient(distance: number): number {
    const absDist = Math.abs(distance);
    const sign = distance >= 0 ? 1 : -1;

    if (absDist < 0.5) {
      return -2 * distance;
    } else if (absDist < 1.5) {
      return sign * (absDist - 1.5);
    }
    return 0;
  }

  public interpolateWeight(
    particlePos: Vector3,
    cellI: number,
    cellJ: number,
    cellK: number
  ): number {
    const cellPos = this.gridToWorld(cellI, cellJ, cellK);
    const dx = (particlePos.x - cellPos.x) / this.cellSize;
    const dy = (particlePos.y - cellPos.y) / this.cellSize;
    const dz = (particlePos.z - cellPos.z) / this.cellSize;

    return (
      this.quadraticBSplineWeight(dx) *
      this.quadraticBSplineWeight(dy) *
      this.quadraticBSplineWeight(dz)
    );
  }

  public interpolateWeightGradient(
    particlePos: Vector3,
    cellI: number,
    cellJ: number,
    cellK: number
  ): Vector3 {
    const cellPos = this.gridToWorld(cellI, cellJ, cellK);
    const dx = (particlePos.x - cellPos.x) / this.cellSize;
    const dy = (particlePos.y - cellPos.y) / this.cellSize;
    const dz = (particlePos.z - cellPos.z) / this.cellSize;

    const wx = this.quadraticBSplineWeight(dx);
    const wy = this.quadraticBSplineWeight(dy);
    const wz = this.quadraticBSplineWeight(dz);
    const dwx = this.quadraticBSplineGradient(dx);
    const dwy = this.quadraticBSplineGradient(dy);
    const dwz = this.quadraticBSplineGradient(dz);

    return new Vector3(
      (dwx * wy * wz) / this.cellSize,
      (wx * dwy * wz) / this.cellSize,
      (wx * wy * dwz) / this.cellSize
    );
  }

  public getNeighborCellIndices(
    particlePos: Vector3
  ): Array<{ i: number; j: number; k: number }> {
    const baseCell = this.worldToGrid(particlePos);
    const neighbors: Array<{ i: number; j: number; k: number }> = [];

    for (let di = -1; di <= 2; di++) {
      for (let dj = -1; dj <= 2; dj++) {
        for (let dk = -1; dk <= 2; dk++) {
          const i = baseCell.i + di;
          const j = baseCell.j + dj;
          const k = baseCell.k + dk;
          if (
            i >= 0 && i < this.resolution.x &&
            j >= 0 && j < this.resolution.y &&
            k >= 0 && k < this.resolution.z
          ) {
            neighbors.push({ i, j, k });
          }
        }
      }
    }

    return neighbors;
  }

  public enforceBoundaryConditions(friction: number = 0.1): void {
    const eps = 1e-6;
    const activeCellsArray = Array.from(this.activeCells);

    for (const index of activeCellsArray) {
      const cell = this.cells[index]!;
      const { i, j, k } = this.getCellIndices(index);
      const cellPos = this.gridToWorld(i, j, k);

      if (cellPos.x < this.bounds.min.x + eps) {
        if (cell.velocity.x < 0) {
          cell.velocity.y *= (1 - friction);
          cell.velocity.z *= (1 - friction);
          cell.velocity.x = 0;
        }
      }
      if (cellPos.x > this.bounds.max.x - eps) {
        if (cell.velocity.x > 0) {
          cell.velocity.y *= (1 - friction);
          cell.velocity.z *= (1 - friction);
          cell.velocity.x = 0;
        }
      }

      if (cellPos.y < this.bounds.min.y + eps) {
        if (cell.velocity.y < 0) {
          cell.velocity.x *= (1 - friction);
          cell.velocity.z *= (1 - friction);
          cell.velocity.y = 0;
        }
      }
      if (cellPos.y > this.bounds.max.y - eps) {
        if (cell.velocity.y > 0) {
          cell.velocity.x *= (1 - friction);
          cell.velocity.z *= (1 - friction);
          cell.velocity.y = 0;
        }
      }

      if (cellPos.z < this.bounds.min.z + eps) {
        if (cell.velocity.z < 0) {
          cell.velocity.x *= (1 - friction);
          cell.velocity.y *= (1 - friction);
          cell.velocity.z = 0;
        }
      }
      if (cellPos.z > this.bounds.max.z - eps) {
        if (cell.velocity.z > 0) {
          cell.velocity.x *= (1 - friction);
          cell.velocity.y *= (1 - friction);
          cell.velocity.z = 0;
        }
      }
    }
  }
}
