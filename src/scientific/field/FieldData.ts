/**
 * 3D Field Data Structure
 *
 * Stores scalar and vector field data with spatial indexing and interpolation.
 * Supports both scalar fields (temperature, pressure) and vector fields (velocity, force).
 *
 * @example
 * ```typescript
 * // Create scalar field
 * const temp = new ScalarFieldData(64, 64, 64, [0, 0, 0], [10, 10, 10]);
 * temp.setValue(32, 32, 32, 273.15);
 *
 * // Create vector field
 * const velocity = new VectorFieldData(64, 64, 64, [0, 0, 0], [10, 10, 10]);
 * velocity.setVector(32, 32, 32, [1, 0, 0]);
 * ```
 */

import { Vector3 } from '../../math/Vector3';

/**
 * Base class for 3D field data
 */
export abstract class FieldData {
    /** Grid dimensions (nx, ny, nz) */
    public readonly dimensions: [number, number, number];

    /** Spatial bounds [minX, minY, minZ] */
    public readonly boundsMin: [number, number, number];

    /** Spatial bounds [maxX, maxY, maxZ] */
    public readonly boundsMax: [number, number, number];

    /** Grid spacing (dx, dy, dz) */
    public readonly spacing: [number, number, number];

    /** Field name/identifier */
    public name: string;

    constructor(
        nx: number,
        ny: number,
        nz: number,
        boundsMin: [number, number, number],
        boundsMax: [number, number, number],
        name: string = 'field'
    ) {
        this.dimensions = [nx, ny, nz];
        this.boundsMin = [...boundsMin];
        this.boundsMax = [...boundsMax];
        this.name = name;

        this.spacing = [
            (boundsMax[0] - boundsMin[0]) / Math.max(1, nx - 1),
            (boundsMax[1] - boundsMin[1]) / Math.max(1, ny - 1),
            (boundsMax[2] - boundsMin[2]) / Math.max(1, nz - 1)
        ];
    }

    /**
     * Convert grid indices to world position
     */
    public indexToWorld(i: number, j: number, k: number): [number, number, number] {
        return [
            this.boundsMin[0] + i * this.spacing[0],
            this.boundsMin[1] + j * this.spacing[1],
            this.boundsMin[2] + k * this.spacing[2]
        ];
    }

    /**
     * Convert world position to grid indices (continuous)
     */
    public worldToIndex(x: number, y: number, z: number): [number, number, number] {
        return [
            (x - this.boundsMin[0]) / this.spacing[0],
            (y - this.boundsMin[1]) / this.spacing[1],
            (z - this.boundsMin[2]) / this.spacing[2]
        ];
    }

    /**
     * Check if indices are within bounds
     */
    public isValidIndex(i: number, j: number, k: number): boolean {
        return i >= 0 && i < this.dimensions[0] &&
               j >= 0 && j < this.dimensions[1] &&
               k >= 0 && k < this.dimensions[2];
    }

    /**
     * Check if world position is within bounds
     */
    public isValidPosition(x: number, y: number, z: number): boolean {
        return x >= this.boundsMin[0] && x <= this.boundsMax[0] &&
               y >= this.boundsMin[1] && y <= this.boundsMax[1] &&
               z >= this.boundsMin[2] && z <= this.boundsMax[2];
    }

    /**
     * Get total number of grid points
     */
    public get size(): number {
        return this.dimensions[0] * this.dimensions[1] * this.dimensions[2];
    }
}

/**
 * Scalar field data (temperature, pressure, density, etc.)
 */
export class ScalarFieldData extends FieldData {
    /** Scalar values stored as Float32Array for GPU compatibility */
    public readonly data: Float32Array;

    /** Cached min/max values */
    private _min: number | null = null;
    private _max: number | null = null;

    constructor(
        nx: number,
        ny: number,
        nz: number,
        boundsMin: [number, number, number],
        boundsMax: [number, number, number],
        name: string = 'scalar'
    ) {
        super(nx, ny, nz, boundsMin, boundsMax, name);
        this.data = new Float32Array(this.size);
    }

    /**
     * Get linear index from 3D indices
     */
    private getIndex(i: number, j: number, k: number): number {
        return k * this.dimensions[0] * this.dimensions[1] + j * this.dimensions[0] + i;
    }

    /**
     * Get scalar value at grid point
     */
    public getValue(i: number, j: number, k: number): number {
        if (!this.isValidIndex(i, j, k)) {
            return 0;
        }
        return this.data[this.getIndex(i, j, k)];
    }

    /**
     * Set scalar value at grid point
     */
    public setValue(i: number, j: number, k: number, value: number): void {
        if (!this.isValidIndex(i, j, k)) {
            return;
        }
        this.data[this.getIndex(i, j, k)] = value;
        this._min = null;
        this._max = null;
    }

    /**
     * Get trilinearly interpolated value at world position
     */
    public getInterpolated(x: number, y: number, z: number): number {
        const [fi, fj, fk] = this.worldToIndex(x, y, z);

        // Grid cell containing the point
        const i0 = Math.floor(fi);
        const j0 = Math.floor(fj);
        const k0 = Math.floor(fk);

        const i1 = Math.min(i0 + 1, this.dimensions[0] - 1);
        const j1 = Math.min(j0 + 1, this.dimensions[1] - 1);
        const k1 = Math.min(k0 + 1, this.dimensions[2] - 1);

        // Interpolation weights
        const tx = fi - i0;
        const ty = fj - j0;
        const tz = fk - k0;

        // Trilinear interpolation
        const c000 = this.getValue(i0, j0, k0);
        const c100 = this.getValue(i1, j0, k0);
        const c010 = this.getValue(i0, j1, k0);
        const c110 = this.getValue(i1, j1, k0);
        const c001 = this.getValue(i0, j0, k1);
        const c101 = this.getValue(i1, j0, k1);
        const c011 = this.getValue(i0, j1, k1);
        const c111 = this.getValue(i1, j1, k1);

        const c00 = c000 * (1 - tx) + c100 * tx;
        const c01 = c001 * (1 - tx) + c101 * tx;
        const c10 = c010 * (1 - tx) + c110 * tx;
        const c11 = c011 * (1 - tx) + c111 * tx;

        const c0 = c00 * (1 - ty) + c10 * ty;
        const c1 = c01 * (1 - ty) + c11 * ty;

        return c0 * (1 - tz) + c1 * tz;
    }

    /**
     * Compute gradient at grid point using central differences
     */
    public gradient(i: number, j: number, k: number): Vector3 {
        const dx = this.spacing[0];
        const dy = this.spacing[1];
        const dz = this.spacing[2];

        const gradX = (this.getValue(i + 1, j, k) - this.getValue(i - 1, j, k)) / (2 * dx);
        const gradY = (this.getValue(i, j + 1, k) - this.getValue(i, j - 1, k)) / (2 * dy);
        const gradZ = (this.getValue(i, j, k + 1) - this.getValue(i, j, k - 1)) / (2 * dz);

        return new Vector3(gradX, gradY, gradZ);
    }

    /**
     * Get minimum value in field
     */
    public get min(): number {
        if (this._min === null) {
            this._min = Math.min(...Array.from(this.data));
        }
        return this._min;
    }

    /**
     * Get maximum value in field
     */
    public get max(): number {
        if (this._max === null) {
            this._max = Math.max(...Array.from(this.data));
        }
        return this._max;
    }

    /**
     * Fill field with constant value
     */
    public fill(value: number): void {
        this.data.fill(value);
        this._min = value;
        this._max = value;
    }

    /**
     * Apply function to all values
     */
    public map(fn: (value: number, i: number, j: number, k: number) => number): void {
        const [nx, ny, nz] = this.dimensions;
        for (let k = 0; k < nz; k++) {
            for (let j = 0; j < ny; j++) {
                for (let i = 0; i < nx; i++) {
                    const idx = this.getIndex(i, j, k);
                    this.data[idx] = fn(this.data[idx], i, j, k);
                }
            }
        }
        this._min = null;
        this._max = null;
    }
}

/**
 * Vector field data (velocity, force, electric field, etc.)
 */
export class VectorFieldData extends FieldData {
    /** Vector components stored as separate Float32Arrays */
    public readonly dataX: Float32Array;
    public readonly dataY: Float32Array;
    public readonly dataZ: Float32Array;

    /** Cached magnitude range */
    private _minMag: number | null = null;
    private _maxMag: number | null = null;

    constructor(
        nx: number,
        ny: number,
        nz: number,
        boundsMin: [number, number, number],
        boundsMax: [number, number, number],
        name: string = 'vector'
    ) {
        super(nx, ny, nz, boundsMin, boundsMax, name);
        this.dataX = new Float32Array(this.size);
        this.dataY = new Float32Array(this.size);
        this.dataZ = new Float32Array(this.size);
    }

    /**
     * Get linear index from 3D indices
     */
    private getIndex(i: number, j: number, k: number): number {
        return k * this.dimensions[0] * this.dimensions[1] + j * this.dimensions[0] + i;
    }

    /**
     * Get vector at grid point
     */
    public getVector(i: number, j: number, k: number): Vector3 {
        if (!this.isValidIndex(i, j, k)) {
            return new Vector3(0, 0, 0);
        }
        const idx = this.getIndex(i, j, k);
        return new Vector3(this.dataX[idx], this.dataY[idx], this.dataZ[idx]);
    }

    /**
     * Set vector at grid point
     */
    public setVector(i: number, j: number, k: number, vec: number[] | Vector3): void {
        if (!this.isValidIndex(i, j, k)) {
            return;
        }
        const idx = this.getIndex(i, j, k);
        this.dataX[idx] = Array.isArray(vec) ? vec[0] : vec.x;
        this.dataY[idx] = Array.isArray(vec) ? vec[1] : vec.y;
        this.dataZ[idx] = Array.isArray(vec) ? vec[2] : vec.z;
        this._minMag = null;
        this._maxMag = null;
    }

    /**
     * Get trilinearly interpolated vector at world position
     */
    public getInterpolated(x: number, y: number, z: number): Vector3 {
        const [fi, fj, fk] = this.worldToIndex(x, y, z);

        const i0 = Math.floor(fi);
        const j0 = Math.floor(fj);
        const k0 = Math.floor(fk);

        const i1 = Math.min(i0 + 1, this.dimensions[0] - 1);
        const j1 = Math.min(j0 + 1, this.dimensions[1] - 1);
        const k1 = Math.min(k0 + 1, this.dimensions[2] - 1);

        const tx = fi - i0;
        const ty = fj - j0;
        const tz = fk - k0;

        // Interpolate each component separately
        const interpComponent = (getData: (i: number, j: number, k: number) => number): number => {
            const c000 = getData(i0, j0, k0);
            const c100 = getData(i1, j0, k0);
            const c010 = getData(i0, j1, k0);
            const c110 = getData(i1, j1, k0);
            const c001 = getData(i0, j0, k1);
            const c101 = getData(i1, j0, k1);
            const c011 = getData(i0, j1, k1);
            const c111 = getData(i1, j1, k1);

            const c00 = c000 * (1 - tx) + c100 * tx;
            const c01 = c001 * (1 - tx) + c101 * tx;
            const c10 = c010 * (1 - tx) + c110 * tx;
            const c11 = c011 * (1 - tx) + c111 * tx;

            const c0 = c00 * (1 - ty) + c10 * ty;
            const c1 = c01 * (1 - ty) + c11 * ty;

            return c0 * (1 - tz) + c1 * tz;
        };

        const vx = interpComponent((i, j, k) => {
            const idx = this.getIndex(i, j, k);
            return this.dataX[idx];
        });

        const vy = interpComponent((i, j, k) => {
            const idx = this.getIndex(i, j, k);
            return this.dataY[idx];
        });

        const vz = interpComponent((i, j, k) => {
            const idx = this.getIndex(i, j, k);
            return this.dataZ[idx];
        });

        return new Vector3(vx, vy, vz);
    }

    /**
     * Get magnitude at grid point
     */
    public getMagnitude(i: number, j: number, k: number): number {
        const vec = this.getVector(i, j, k);
        return vec.length();
    }

    /**
     * Compute curl at grid point using central differences
     */
    public curl(i: number, j: number, k: number): Vector3 {
        const dx = this.spacing[0];
        const dy = this.spacing[1];
        const dz = this.spacing[2];

        const getComp = (i: number, j: number, k: number, comp: 'x' | 'y' | 'z'): number => {
            if (!this.isValidIndex(i, j, k)) return 0;
            const idx = this.getIndex(i, j, k);
            return comp === 'x' ? this.dataX[idx] : comp === 'y' ? this.dataY[idx] : this.dataZ[idx];
        };

        const dVz_dy = (getComp(i, j + 1, k, 'z') - getComp(i, j - 1, k, 'z')) / (2 * dy);
        const dVy_dz = (getComp(i, j, k + 1, 'y') - getComp(i, j, k - 1, 'y')) / (2 * dz);

        const dVx_dz = (getComp(i, j, k + 1, 'x') - getComp(i, j, k - 1, 'x')) / (2 * dz);
        const dVz_dx = (getComp(i + 1, j, k, 'z') - getComp(i - 1, j, k, 'z')) / (2 * dx);

        const dVy_dx = (getComp(i + 1, j, k, 'y') - getComp(i - 1, j, k, 'y')) / (2 * dx);
        const dVx_dy = (getComp(i, j + 1, k, 'x') - getComp(i, j - 1, k, 'x')) / (2 * dy);

        return new Vector3(
            dVz_dy - dVy_dz,
            dVx_dz - dVz_dx,
            dVy_dx - dVx_dy
        );
    }

    /**
     * Compute divergence at grid point
     */
    public divergence(i: number, j: number, k: number): number {
        const dx = this.spacing[0];
        const dy = this.spacing[1];
        const dz = this.spacing[2];

        const getComp = (i: number, j: number, k: number, comp: 'x' | 'y' | 'z'): number => {
            if (!this.isValidIndex(i, j, k)) return 0;
            const idx = this.getIndex(i, j, k);
            return comp === 'x' ? this.dataX[idx] : comp === 'y' ? this.dataY[idx] : this.dataZ[idx];
        };

        const dVx_dx = (getComp(i + 1, j, k, 'x') - getComp(i - 1, j, k, 'x')) / (2 * dx);
        const dVy_dy = (getComp(i, j + 1, k, 'y') - getComp(i, j - 1, k, 'y')) / (2 * dy);
        const dVz_dz = (getComp(i, j, k + 1, 'z') - getComp(i, j, k - 1, 'z')) / (2 * dz);

        return dVx_dx + dVy_dy + dVz_dz;
    }

    /**
     * Get minimum magnitude in field
     */
    public get minMagnitude(): number {
        if (this._minMag === null) {
            this._minMag = Infinity;
            for (let i = 0; i < this.size; i++) {
                const mag = Math.sqrt(
                    this.dataX[i] ** 2 + this.dataY[i] ** 2 + this.dataZ[i] ** 2
                );
                this._minMag = Math.min(this._minMag, mag);
            }
        }
        return this._minMag;
    }

    /**
     * Get maximum magnitude in field
     */
    public get maxMagnitude(): number {
        if (this._maxMag === null) {
            this._maxMag = -Infinity;
            for (let i = 0; i < this.size; i++) {
                const mag = Math.sqrt(
                    this.dataX[i] ** 2 + this.dataY[i] ** 2 + this.dataZ[i] ** 2
                );
                this._maxMag = Math.max(this._maxMag, mag);
            }
        }
        return this._maxMag;
    }

    /**
     * Fill field with constant vector
     */
    public fill(x: number, y: number, z: number): void {
        this.dataX.fill(x);
        this.dataY.fill(y);
        this.dataZ.fill(z);
        const mag = Math.sqrt(x * x + y * y + z * z);
        this._minMag = mag;
        this._maxMag = mag;
    }
}
