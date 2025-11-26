/**
 * Field Probe
 *
 * Interactive probing and interrogation of field data.
 * Supports point queries, path tracking, and data export.
 *
 * @example
 * ```typescript
 * const probe = new FieldProbe(scalarField);
 * const value = probe.probe([5, 5, 5]);
 * probe.startTracking();
 * probe.addPoint([5, 5, 5]);
 * const csv = probe.exportToCSV();
 * ```
 */

import { FieldData, ScalarFieldData, VectorFieldData } from './FieldData';
import { Vector3 } from '../../math/Vector3';

export interface ProbeResult {
    position: Vector3;
    value: number | Vector3;
    gradient?: Vector3;
    timestamp: number;
}

export interface ProbeOptions {
    trackHistory?: boolean;
    maxHistorySize?: number;
    computeGradient?: boolean;
}

/**
 * Field probe for interactive data interrogation
 */
export class FieldProbe {
    private field: FieldData;
    private history: ProbeResult[] = [];
    private options: Required<ProbeOptions>;
    private tracking: boolean = false;

    constructor(field: FieldData, options: ProbeOptions = {}) {
        this.field = field;
        this.options = {
            trackHistory: options.trackHistory ?? true,
            maxHistorySize: options.maxHistorySize ?? 1000,
            computeGradient: options.computeGradient ?? false
        };
    }

    /**
     * Set field to probe
     */
    public setField(field: FieldData): void {
        this.field = field;
        this.clearHistory();
    }

    /**
     * Probe field at position
     */
    public probe(position: Vector3 | [number, number, number]): ProbeResult | null {
        const pos = Array.isArray(position) ? new Vector3(position[0], position[1], position[2]) : position;

        if (!this.field.isValidPosition(pos.x, pos.y, pos.z)) {
            return null;
        }

        let value: number | Vector3;
        let gradient: Vector3 | undefined;

        if (this.field instanceof ScalarFieldData) {
            value = this.field.getInterpolated(pos.x, pos.y, pos.z);

            if (this.options.computeGradient) {
                const [i, j, k] = this.field.worldToIndex(pos.x, pos.y, pos.z);
                gradient = this.field.gradient(
                    Math.round(i),
                    Math.round(j),
                    Math.round(k)
                );
            }
        } else {
            const vectorField = this.field as VectorFieldData;
            value = vectorField.getInterpolated(pos.x, pos.y, pos.z);
        }

        const result: ProbeResult = {
            position: pos.clone(),
            value,
            gradient,
            timestamp: Date.now()
        };

        if (this.tracking && this.options.trackHistory) {
            this.addToHistory(result);
        }

        return result;
    }

    /**
     * Probe along ray
     */
    public probeRay(
        origin: Vector3,
        direction: Vector3,
        maxDistance: number,
        stepSize: number = 0.1
    ): ProbeResult[] {
        const results: ProbeResult[] = [];
        const dir = direction.normalize();
        let distance = 0;

        while (distance <= maxDistance) {
            const position = Vector3.add(origin, Vector3.multiplyScalar(dir, distance));

            if (!this.field.isValidPosition(position.x, position.y, position.z)) {
                break;
            }

            const result = this.probe(position);
            if (result) {
                results.push(result);
            }

            distance += stepSize;
        }

        return results;
    }

    /**
     * Probe along path
     */
    public probePath(path: Vector3[]): ProbeResult[] {
        const results: ProbeResult[] = [];

        for (const position of path) {
            const result = this.probe(position);
            if (result) {
                results.push(result);
            }
        }

        return results;
    }

    /**
     * Find critical points (gradient = 0 for scalar fields)
     */
    public findCriticalPoints(
        searchRegion?: { min: Vector3; max: Vector3 },
        resolution: number = 10
    ): Vector3[] {
        if (!(this.field instanceof ScalarFieldData)) {
            console.warn('Critical point detection only supported for scalar fields');
            return [];
        }

        const criticalPoints: Vector3[] = [];
        const min = searchRegion?.min ?? new Vector3(...this.field.boundsMin);
        const max = searchRegion?.max ?? new Vector3(...this.field.boundsMax);

        const dx = (max.x - min.x) / resolution;
        const dy = (max.y - min.y) / resolution;
        const dz = (max.z - min.z) / resolution;

        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                for (let k = 0; k <= resolution; k++) {
                    const x = min.x + i * dx;
                    const y = min.y + j * dy;
                    const z = min.z + k * dz;

                    const [gi, gj, gk] = this.field.worldToIndex(x, y, z);
                    const gradient = this.field.gradient(
                        Math.round(gi),
                        Math.round(gj),
                        Math.round(gk)
                    );

                    if (gradient.length() < 0.01) {
                        criticalPoints.push(new Vector3(x, y, z));
                    }
                }
            }
        }

        return criticalPoints;
    }

    /**
     * Start tracking probe history
     */
    public startTracking(): void {
        this.tracking = true;
    }

    /**
     * Stop tracking probe history
     */
    public stopTracking(): void {
        this.tracking = false;
    }

    /**
     * Add point to history
     */
    public addPoint(position: Vector3 | [number, number, number]): void {
        const result = this.probe(position);
        if (result) {
            this.addToHistory(result);
        }
    }

    /**
     * Add result to history
     */
    private addToHistory(result: ProbeResult): void {
        this.history.push(result);

        if (this.history.length > this.options.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * Get probe history
     */
    public getHistory(): ProbeResult[] {
        return this.history;
    }

    /**
     * Clear probe history
     */
    public clearHistory(): void {
        this.history = [];
    }

    /**
     * Get statistics from history
     */
    public getStatistics(): {
        count: number;
        min: number;
        max: number;
        mean: number;
        stdDev: number;
    } | null {
        if (this.history.length === 0) {
            return null;
        }

        const values = this.history.map(r => {
            if (typeof r.value === 'number') {
                return r.value;
            } else {
                return r.value.length();
            }
        });

        const min = Math.min(...values);
        const max = Math.max(...values);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;

        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        return { count: this.history.length, min, max, mean, stdDev };
    }

    /**
     * Export history to CSV
     */
    public exportToCSV(): string {
        if (this.history.length === 0) {
            return '';
        }

        const isScalar = typeof this.history[0].value === 'number';
        const hasGradient = this.history[0].gradient !== undefined;

        // Header
        let csv = 'timestamp,x,y,z,';
        if (isScalar) {
            csv += 'value';
            if (hasGradient) {
                csv += ',grad_x,grad_y,grad_z';
            }
        } else {
            csv += 'vx,vy,vz,magnitude';
        }
        csv += '\n';

        // Data rows
        for (const result of this.history) {
            const pos = result.position;
            csv += `${result.timestamp},${pos.x},${pos.y},${pos.z},`;

            if (typeof result.value === 'number') {
                csv += result.value;
                if (result.gradient) {
                    csv += `,${result.gradient.x},${result.gradient.y},${result.gradient.z}`;
                }
            } else {
                const vec = result.value;
                csv += `${vec.x},${vec.y},${vec.z},${vec.length()}`;
            }

            csv += '\n';
        }

        return csv;
    }

    /**
     * Export history to JSON
     */
    public exportToJSON(): object[] {
        return this.history.map(result => ({
            timestamp: result.timestamp,
            position: {
                x: result.position.x,
                y: result.position.y,
                z: result.position.z
            },
            value: typeof result.value === 'number'
                ? result.value
                : { x: result.value.x, y: result.value.y, z: result.value.z },
            gradient: result.gradient ? {
                x: result.gradient.x,
                y: result.gradient.y,
                z: result.gradient.z
            } : undefined
        }));
    }

    /**
     * Find local maximum near position
     */
    public findLocalMaximum(
        startPosition: Vector3,
        stepSize: number = 0.1,
        maxSteps: number = 100
    ): Vector3 | null {
        if (!(this.field instanceof ScalarFieldData)) {
            console.warn('Local maximum search only supported for scalar fields');
            return null;
        }

        let position = startPosition.clone();
        let currentValue = this.field.getInterpolated(position.x, position.y, position.z);

        for (let step = 0; step < maxSteps; step++) {
            const [i, j, k] = this.field.worldToIndex(position.x, position.y, position.z);
            const gradient = this.field.gradient(Math.round(i), Math.round(j), Math.round(k));

            if (gradient.length() < 0.001) {
                return position; // Found critical point
            }

            // Move in gradient direction
            const nextPosition = Vector3.add(
                position,
                Vector3.multiplyScalar(gradient.normalize(), stepSize)
            );

            if (!this.field.isValidPosition(nextPosition.x, nextPosition.y, nextPosition.z)) {
                return position; // Hit boundary
            }

            const nextValue = this.field.getInterpolated(nextPosition.x, nextPosition.y, nextPosition.z);

            if (nextValue <= currentValue) {
                return position; // Found local maximum
            }

            position = nextPosition;
            currentValue = nextValue;
        }

        return position;
    }

    /**
     * Find local minimum near position
     */
    public findLocalMinimum(
        startPosition: Vector3,
        stepSize: number = 0.1,
        maxSteps: number = 100
    ): Vector3 | null {
        if (!(this.field instanceof ScalarFieldData)) {
            console.warn('Local minimum search only supported for scalar fields');
            return null;
        }

        let position = startPosition.clone();
        let currentValue = this.field.getInterpolated(position.x, position.y, position.z);

        for (let step = 0; step < maxSteps; step++) {
            const [i, j, k] = this.field.worldToIndex(position.x, position.y, position.z);
            const gradient = this.field.gradient(Math.round(i), Math.round(j), Math.round(k));

            if (gradient.length() < 0.001) {
                return position; // Found critical point
            }

            // Move against gradient direction
            const nextPosition = Vector3.add(
                position,
                Vector3.multiplyScalar(gradient.normalize(), -stepSize)
            );

            if (!this.field.isValidPosition(nextPosition.x, nextPosition.y, nextPosition.z)) {
                return position; // Hit boundary
            }

            const nextValue = this.field.getInterpolated(nextPosition.x, nextPosition.y, nextPosition.z);

            if (nextValue >= currentValue) {
                return position; // Found local minimum
            }

            position = nextPosition;
            currentValue = nextValue;
        }

        return position;
    }

    /**
     * Sample field on regular grid
     */
    public sampleGrid(
        resolution: [number, number, number]
    ): { positions: Vector3[]; values: (number | Vector3)[] } {
        const positions: Vector3[] = [];
        const values: (number | Vector3)[] = [];

        const [nx, ny, nz] = resolution;
        const [minX, minY, minZ] = this.field.boundsMin;
        const [maxX, maxY, maxZ] = this.field.boundsMax;

        for (let k = 0; k < nz; k++) {
            for (let j = 0; j < ny; j++) {
                for (let i = 0; i < nx; i++) {
                    const x = minX + (maxX - minX) * (i / (nx - 1));
                    const y = minY + (maxY - minY) * (j / (ny - 1));
                    const z = minZ + (maxZ - minZ) * (k / (nz - 1));

                    const position = new Vector3(x, y, z);
                    const result = this.probe(position);

                    if (result) {
                        positions.push(position);
                        values.push(result.value);
                    }
                }
            }
        }

        return { positions, values };
    }
}
