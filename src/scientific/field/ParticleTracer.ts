/**
 * Particle Tracer
 *
 * Particle advection in vector fields with trail rendering.
 * Performance optimized for 100k particles @ 60 FPS.
 *
 * @example
 * ```typescript
 * const tracer = new ParticleTracer(vectorField);
 * tracer.seedParticles('uniform', 10000);
 * tracer.update(deltaTime);
 * const particles = tracer.getParticles();
 * ```
 */

import { VectorFieldData } from './FieldData';
import { Vector3 } from '../../math/Vector3';

export type SeedingStrategy = 'uniform' | 'random' | 'surface' | 'points';

export interface ParticleTracerOptions {
    maxParticles?: number;
    trailLength?: number;
    fadeTrails?: boolean;
    respawnOutOfBounds?: boolean;
    integrationMethod?: 'euler' | 'rk2' | 'rk4';
    timeScale?: number;
}

export interface Particle {
    position: Vector3;
    velocity: Vector3;
    age: number;
    trail: Vector3[];
}

/**
 * Particle tracer for vector field visualization
 */
export class ParticleTracer {
    private field: VectorFieldData;
    private particles: Particle[] = [];
    private options: Required<ParticleTracerOptions>;

    constructor(field: VectorFieldData, options: ParticleTracerOptions = {}) {
        this.field = field;
        this.options = {
            maxParticles: options.maxParticles ?? 10000,
            trailLength: options.trailLength ?? 50,
            fadeTrails: options.fadeTrails ?? true,
            respawnOutOfBounds: options.respawnOutOfBounds ?? true,
            integrationMethod: options.integrationMethod ?? 'rk2',
            timeScale: options.timeScale ?? 1.0
        };
    }

    /**
     * Set vector field
     */
    public setField(field: VectorFieldData): void {
        this.field = field;
    }

    /**
     * Seed particles using specified strategy
     */
    public seedParticles(strategy: SeedingStrategy, count: number, data?: Vector3[]): void {
        this.particles = [];
        count = Math.min(count, this.options.maxParticles);

        let positions: Vector3[];

        switch (strategy) {
            case 'uniform':
                positions = this.generateUniformPositions(count);
                break;
            case 'random':
                positions = this.generateRandomPositions(count);
                break;
            case 'surface':
                positions = this.generateSurfacePositions(count);
                break;
            case 'points':
                positions = data || [];
                break;
        }

        for (const position of positions.slice(0, count)) {
            this.particles.push({
                position: position.clone(),
                velocity: this.field.getInterpolated(position.x, position.y, position.z),
                age: 0,
                trail: []
            });
        }
    }

    /**
     * Update particles
     */
    public update(deltaTime: number): void {
        const dt = deltaTime * this.options.timeScale;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            // Integrate particle position
            const newPosition = this.integrate(particle.position, dt);

            // Check bounds
            if (!this.field.isValidPosition(newPosition.x, newPosition.y, newPosition.z)) {
                if (this.options.respawnOutOfBounds) {
                    // Respawn particle
                    this.respawnParticle(particle);
                } else {
                    // Remove particle
                    this.particles.splice(i, 1);
                }
                continue;
            }

            // Update trail
            if (this.options.trailLength > 0) {
                particle.trail.push(particle.position.clone());
                if (particle.trail.length > this.options.trailLength) {
                    particle.trail.shift();
                }
            }

            // Update position and velocity
            particle.position = newPosition;
            particle.velocity = this.field.getInterpolated(newPosition.x, newPosition.y, newPosition.z);
            particle.age += deltaTime;
        }
    }

    /**
     * Integrate particle position
     */
    private integrate(position: Vector3, dt: number): Vector3 {
        switch (this.options.integrationMethod) {
            case 'euler':
                return this.eulerStep(position, dt);
            case 'rk2':
                return this.rk2Step(position, dt);
            case 'rk4':
                return this.rk4Step(position, dt);
            default:
                return position;
        }
    }

    /**
     * Euler integration
     */
    private eulerStep(position: Vector3, dt: number): Vector3 {
        const velocity = this.field.getInterpolated(position.x, position.y, position.z);
        return Vector3.add(position, Vector3.multiplyScalar(velocity, dt));
    }

    /**
     * Runge-Kutta 2nd order (midpoint method)
     */
    private rk2Step(position: Vector3, dt: number): Vector3 {
        const k1 = this.field.getInterpolated(position.x, position.y, position.z);
        const midpoint = Vector3.add(position, Vector3.multiplyScalar(k1, dt / 2));
        const k2 = this.field.getInterpolated(midpoint.x, midpoint.y, midpoint.z);
        return Vector3.add(position, Vector3.multiplyScalar(k2, dt));
    }

    /**
     * Runge-Kutta 4th order
     */
    private rk4Step(position: Vector3, dt: number): Vector3 {
        const k1 = this.field.getInterpolated(position.x, position.y, position.z);

        const p2 = Vector3.add(position, Vector3.multiplyScalar(k1, dt / 2));
        const k2 = this.field.getInterpolated(p2.x, p2.y, p2.z);

        const p3 = Vector3.add(position, Vector3.multiplyScalar(k2, dt / 2));
        const k3 = this.field.getInterpolated(p3.x, p3.y, p3.z);

        const p4 = Vector3.add(position, Vector3.multiplyScalar(k3, dt));
        const k4 = this.field.getInterpolated(p4.x, p4.y, p4.z);

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

        return Vector3.add(position, Vector3.multiplyScalar(weighted, dt / 6));
    }

    /**
     * Respawn particle at random position
     */
    private respawnParticle(particle: Particle): void {
        const positions = this.generateRandomPositions(1);
        particle.position = positions[0];
        particle.velocity = this.field.getInterpolated(particle.position.x, particle.position.y, particle.position.z);
        particle.age = 0;
        particle.trail = [];
    }

    /**
     * Generate uniform particle positions
     */
    private generateUniformPositions(count: number): Vector3[] {
        const positions: Vector3[] = [];
        const [minX, minY, minZ] = this.field.boundsMin;
        const [maxX, maxY, maxZ] = this.field.boundsMax;

        const n = Math.ceil(Math.cbrt(count));

        for (let k = 0; k < n && positions.length < count; k++) {
            for (let j = 0; j < n && positions.length < count; j++) {
                for (let i = 0; i < n && positions.length < count; i++) {
                    const x = minX + (maxX - minX) * (i / (n - 1));
                    const y = minY + (maxY - minY) * (j / (n - 1));
                    const z = minZ + (maxZ - minZ) * (k / (n - 1));
                    positions.push(new Vector3(x, y, z));
                }
            }
        }

        return positions;
    }

    /**
     * Generate random particle positions
     */
    private generateRandomPositions(count: number): Vector3[] {
        const positions: Vector3[] = [];
        const [minX, minY, minZ] = this.field.boundsMin;
        const [maxX, maxY, maxZ] = this.field.boundsMax;

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            const z = minZ + Math.random() * (maxZ - minZ);
            positions.push(new Vector3(x, y, z));
        }

        return positions;
    }

    /**
     * Generate positions on field boundary surface
     */
    private generateSurfacePositions(count: number): Vector3[] {
        const positions: Vector3[] = [];
        const [minX, minY, minZ] = this.field.boundsMin;
        const [maxX, maxY, maxZ] = this.field.boundsMax;

        const perFace = Math.ceil(count / 6);

        // 6 faces of bounding box
        const faces = [
            () => new Vector3(minX, minY + Math.random() * (maxY - minY), minZ + Math.random() * (maxZ - minZ)),
            () => new Vector3(maxX, minY + Math.random() * (maxY - minY), minZ + Math.random() * (maxZ - minZ)),
            () => new Vector3(minX + Math.random() * (maxX - minX), minY, minZ + Math.random() * (maxZ - minZ)),
            () => new Vector3(minX + Math.random() * (maxX - minX), maxY, minZ + Math.random() * (maxZ - minZ)),
            () => new Vector3(minX + Math.random() * (maxX - minX), minY + Math.random() * (maxY - minY), minZ),
            () => new Vector3(minX + Math.random() * (maxX - minX), minY + Math.random() * (maxY - minY), maxZ)
        ];

        for (let i = 0; i < count; i++) {
            positions.push(faces[i % 6]());
        }

        return positions;
    }

    /**
     * Get all particles
     */
    public getParticles(): Particle[] {
        return this.particles;
    }

    /**
     * Get particle positions as Float32Array for GPU rendering
     */
    public getPositionsArray(): Float32Array {
        const positions = new Float32Array(this.particles.length * 3);
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i].position;
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
        }
        return positions;
    }

    /**
     * Get particle colors based on velocity magnitude
     */
    public getColorsArray(): Float32Array {
        const colors = new Float32Array(this.particles.length * 3);
        const maxMag = this.field.maxMagnitude;

        for (let i = 0; i < this.particles.length; i++) {
            const mag = this.particles[i].velocity.length();
            const t = maxMag > 0 ? mag / maxMag : 0;

            // Simple heat colormap
            colors[i * 3] = t;
            colors[i * 3 + 1] = t * 0.5;
            colors[i * 3 + 2] = 1 - t;
        }

        return colors;
    }

    /**
     * Get trail data for rendering
     */
    public getTrailsData(): { positions: Float32Array; indices: Uint32Array; count: number } {
        let totalPoints = 0;
        for (const particle of this.particles) {
            totalPoints += particle.trail.length;
        }

        const positions = new Float32Array(totalPoints * 3);
        const indices: number[] = [];

        let posIdx = 0;
        let vertexIdx = 0;

        for (const particle of this.particles) {
            const trailStart = vertexIdx;

            for (const point of particle.trail) {
                positions[posIdx++] = point.x;
                positions[posIdx++] = point.y;
                positions[posIdx++] = point.z;
                vertexIdx++;
            }

            // Create line segments
            for (let i = trailStart; i < vertexIdx - 1; i++) {
                indices.push(i, i + 1);
            }
        }

        return {
            positions,
            indices: new Uint32Array(indices),
            count: indices.length
        };
    }

    /**
     * Clear all particles
     */
    public clear(): void {
        this.particles = [];
    }

    /**
     * Get particle count
     */
    public get count(): number {
        return this.particles.length;
    }

    /**
     * Reset particle ages
     */
    public resetAges(): void {
        for (const particle of this.particles) {
            particle.age = 0;
        }
    }
}
