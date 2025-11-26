/**
 * Streamline Integrator
 *
 * Computes streamlines in vector fields using Runge-Kutta 4th order integration.
 * Supports forward/backward tracing with adaptive step size and GPU acceleration.
 *
 * @example
 * ```typescript
 * const integrator = new StreamlineIntegrator();
 * const streamline = integrator.trace(vectorField, [5, 5, 5], {
 *   direction: 'both',
 *   maxSteps: 1000,
 *   stepSize: 0.1
 * });
 * ```
 */

import { VectorFieldData } from './FieldData';
import { Vector3 } from '../../math/Vector3';

export type TraceDirection = 'forward' | 'backward' | 'both';

export interface StreamlineOptions {
    direction?: TraceDirection;
    maxSteps?: number;
    stepSize?: number;
    adaptiveStepSize?: boolean;
    minStepSize?: number;
    maxStepSize?: number;
    tolerance?: number;
    maxLength?: number;
    stopAtBoundary?: boolean;
    stopOnLowVelocity?: number;
}

export interface Streamline {
    points: Vector3[];
    velocities: Vector3[];
    length: number;
    steps: number;
}

/**
 * Streamline integrator using RK4
 */
export class StreamlineIntegrator {
    private defaultOptions: Required<StreamlineOptions> = {
        direction: 'forward',
        maxSteps: 1000,
        stepSize: 0.1,
        adaptiveStepSize: true,
        minStepSize: 0.01,
        maxStepSize: 0.5,
        tolerance: 0.001,
        maxLength: 100.0,
        stopAtBoundary: true,
        stopOnLowVelocity: 0.001
    };

    /**
     * Trace streamline from seed point
     */
    public trace(
        field: VectorFieldData,
        seedPoint: [number, number, number] | Vector3,
        options: StreamlineOptions = {}
    ): Streamline {
        const opts = { ...this.defaultOptions, ...options };
        const seed = Array.isArray(seedPoint) ? new Vector3(seedPoint[0], seedPoint[1], seedPoint[2]) : seedPoint;

        let streamline: Streamline;

        switch (opts.direction) {
            case 'forward':
                streamline = this.traceDirection(field, seed, 1, opts);
                break;
            case 'backward':
                streamline = this.traceDirection(field, seed, -1, opts);
                break;
            case 'both':
                const forward = this.traceDirection(field, seed, 1, opts);
                const backward = this.traceDirection(field, seed, -1, opts);

                // Combine (reverse backward, then forward)
                const points = [...backward.points.reverse(), ...forward.points.slice(1)];
                const velocities = [...backward.velocities.reverse(), ...forward.velocities.slice(1)];

                streamline = {
                    points,
                    velocities,
                    length: forward.length + backward.length,
                    steps: forward.steps + backward.steps
                };
                break;
        }

        return streamline;
    }

    /**
     * Trace in specific direction
     */
    private traceDirection(
        field: VectorFieldData,
        start: Vector3,
        direction: number,
        options: Required<StreamlineOptions>
    ): Streamline {
        const points: Vector3[] = [start.clone()];
        const velocities: Vector3[] = [];

        let position = start.clone();
        let totalLength = 0;
        let stepSize = options.stepSize;

        for (let step = 0; step < options.maxSteps; step++) {
            // Get velocity at current position
            const velocity = this.getVelocity(field, position);
            if (!velocity) break; // Outside bounds

            velocities.push(velocity);

            // Check termination conditions
            if (velocity.length() < options.stopOnLowVelocity) {
                break; // Low velocity region
            }

            // Adaptive step size
            if (options.adaptiveStepSize) {
                stepSize = this.computeAdaptiveStep(
                    field,
                    position,
                    velocity,
                    stepSize,
                    options.minStepSize,
                    options.maxStepSize,
                    options.tolerance
                );
            }

            // RK4 integration
            const nextPosition = this.rk4Step(field, position, stepSize * direction);
            if (!nextPosition) break; // Step failed

            // Check boundaries
            if (options.stopAtBoundary && !field.isValidPosition(nextPosition.x, nextPosition.y, nextPosition.z)) {
                break;
            }

            // Update position
            const displacement = Vector3.subtract(nextPosition, position);
            const stepLength = displacement.length();
            totalLength += stepLength;

            position = nextPosition;
            points.push(position.clone());

            // Check max length
            if (totalLength > options.maxLength) {
                break;
            }
        }

        return {
            points,
            velocities,
            length: totalLength,
            steps: points.length - 1
        };
    }

    /**
     * Runge-Kutta 4th order step
     */
    private rk4Step(field: VectorFieldData, position: Vector3, h: number): Vector3 | null {
        // k1 = f(t, y)
        const k1 = this.getVelocity(field, position);
        if (!k1) return null;

        // k2 = f(t + h/2, y + h*k1/2)
        const p2 = Vector3.add(position, Vector3.multiplyScalar(k1, h / 2));
        const k2 = this.getVelocity(field, p2);
        if (!k2) return null;

        // k3 = f(t + h/2, y + h*k2/2)
        const p3 = Vector3.add(position, Vector3.multiplyScalar(k2, h / 2));
        const k3 = this.getVelocity(field, p3);
        if (!k3) return null;

        // k4 = f(t + h, y + h*k3)
        const p4 = Vector3.add(position, Vector3.multiplyScalar(k3, h));
        const k4 = this.getVelocity(field, p4);
        if (!k4) return null;

        // y_{n+1} = y_n + h/6 * (k1 + 2*k2 + 2*k3 + k4)
        const weighted = Vector3.add(
            k1,
            Vector3.add(
                Vector3.multiplyScalar(k2, 2),
                Vector3.add(
                    Vector3.multiplyScalar(k3, 2),
                    k4
                )
            )
        );

        return Vector3.add(position, Vector3.multiplyScalar(weighted, h / 6));
    }

    /**
     * Get interpolated velocity at position
     */
    private getVelocity(field: VectorFieldData, position: Vector3): Vector3 | null {
        if (!field.isValidPosition(position.x, position.y, position.z)) {
            return null;
        }

        return field.getInterpolated(position.x, position.y, position.z);
    }

    /**
     * Compute adaptive step size
     */
    private computeAdaptiveStep(
        field: VectorFieldData,
        position: Vector3,
        velocity: Vector3,
        currentStep: number,
        minStep: number,
        maxStep: number,
        tolerance: number
    ): number {
        // Estimate error by comparing full step with two half steps
        const fullStep = this.rk4Step(field, position, currentStep);
        const halfStep1 = this.rk4Step(field, position, currentStep / 2);

        if (!fullStep || !halfStep1) {
            return minStep;
        }

        const halfStep2 = this.rk4Step(field, halfStep1, currentStep / 2);
        if (!halfStep2) {
            return minStep;
        }

        // Error estimate
        const error = Vector3.subtract(halfStep2, fullStep).length();

        // Adjust step size
        if (error > tolerance) {
            // Reduce step size
            return Math.max(minStep, currentStep * 0.5);
        } else if (error < tolerance * 0.1) {
            // Increase step size
            return Math.min(maxStep, currentStep * 1.5);
        }

        return currentStep;
    }

    /**
     * Trace multiple streamlines from seed points
     */
    public traceMultiple(
        field: VectorFieldData,
        seedPoints: (Vector3 | [number, number, number])[],
        options: StreamlineOptions = {}
    ): Streamline[] {
        return seedPoints.map(seed => this.trace(field, seed, options));
    }

    /**
     * Generate uniform seed points in volume
     */
    public generateUniformSeeds(
        field: VectorFieldData,
        countX: number,
        countY: number,
        countZ: number
    ): Vector3[] {
        const seeds: Vector3[] = [];
        const [minX, minY, minZ] = field.boundsMin;
        const [maxX, maxY, maxZ] = field.boundsMax;

        for (let k = 0; k < countZ; k++) {
            for (let j = 0; j < countY; j++) {
                for (let i = 0; i < countX; i++) {
                    const x = minX + (maxX - minX) * (i / (countX - 1));
                    const y = minY + (maxY - minY) * (j / (countY - 1));
                    const z = minZ + (maxZ - minZ) * (k / (countZ - 1));
                    seeds.push(new Vector3(x, y, z));
                }
            }
        }

        return seeds;
    }

    /**
     * Generate random seed points in volume
     */
    public generateRandomSeeds(field: VectorFieldData, count: number): Vector3[] {
        const seeds: Vector3[] = [];
        const [minX, minY, minZ] = field.boundsMin;
        const [maxX, maxY, maxZ] = field.boundsMax;

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            const z = minZ + Math.random() * (maxZ - minZ);
            seeds.push(new Vector3(x, y, z));
        }

        return seeds;
    }

    /**
     * Generate seeds on a plane
     */
    public generatePlaneSeeds(
        origin: Vector3,
        normal: Vector3,
        size: number,
        countU: number,
        countV: number
    ): Vector3[] {
        const seeds: Vector3[] = [];

        // Create orthogonal basis
        const n = normal.normalize();
        const up = Math.abs(n.y) < 0.999 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
        const u = Vector3.cross(up, n).normalize();
        const v = Vector3.cross(n, u).normalize();

        for (let j = 0; j < countV; j++) {
            for (let i = 0; i < countU; i++) {
                const tu = (i / (countU - 1) - 0.5) * size;
                const tv = (j / (countV - 1) - 0.5) * size;

                const seed = Vector3.add(
                    origin,
                    Vector3.add(
                        Vector3.multiplyScalar(u, tu),
                        Vector3.multiplyScalar(v, tv)
                    )
                );

                seeds.push(seed);
            }
        }

        return seeds;
    }

    /**
     * Compute streamline curvature at each point
     */
    public computeCurvature(streamline: Streamline): number[] {
        const curvatures: number[] = [];
        const points = streamline.points;

        for (let i = 1; i < points.length - 1; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];

            // Discrete curvature approximation
            const t1 = Vector3.subtract(p1, p0).normalize();
            const t2 = Vector3.subtract(p2, p1).normalize();
            const dt = Vector3.subtract(t2, t1);
            const ds = Vector3.subtract(p2, p0).length() / 2;

            const curvature = ds > 0 ? dt.length() / ds : 0;
            curvatures.push(curvature);
        }

        // Boundary points
        if (curvatures.length > 0) {
            curvatures.unshift(curvatures[0]);
            curvatures.push(curvatures[curvatures.length - 1]);
        }

        return curvatures;
    }

    /**
     * Resample streamline to uniform spacing
     */
    public resample(streamline: Streamline, spacing: number): Streamline {
        if (streamline.points.length < 2) {
            return streamline;
        }

        const resampled: Vector3[] = [streamline.points[0].clone()];
        const velocities: Vector3[] = [streamline.velocities[0].clone()];

        let accumulated = 0;
        let current = 0;

        for (let i = 1; i < streamline.points.length; i++) {
            const p0 = streamline.points[i - 1];
            const p1 = streamline.points[i];
            const segmentLength = Vector3.subtract(p1, p0).length();

            accumulated += segmentLength;

            while (accumulated >= spacing && current < streamline.length / spacing) {
                const t = 1 - (accumulated - spacing) / segmentLength;
                const point = Vector3.lerp(p0, p1, t);
                const velocity = Vector3.lerp(streamline.velocities[i - 1], streamline.velocities[i], t);

                resampled.push(point);
                velocities.push(velocity);

                accumulated -= spacing;
                current++;
            }
        }

        return {
            points: resampled,
            velocities,
            length: streamline.length,
            steps: resampled.length - 1
        };
    }
}
