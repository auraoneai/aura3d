/**
 * Snow particle system with accumulation on surfaces
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Snow particle
 */
interface SnowParticle {
    /** Particle position */
    position: Vector3;

    /** Particle velocity */
    velocity: Vector3;

    /** Particle rotation */
    rotation: number;

    /** Rotation speed */
    rotationSpeed: number;

    /** Particle size */
    size: number;

    /** Particle lifetime */
    lifetime: number;

    /** Particle age */
    age: number;

    /** Drift phase for wind */
    driftPhase: number;
}

/**
 * Snow accumulation on surface
 */
export interface SnowAccumulation {
    /** Surface position */
    position: Vector3;

    /** Accumulation depth */
    depth: number;

    /** Accumulation radius */
    radius: number;

    /** Surface normal */
    normal: Vector3;

    /** Accumulation rate */
    accumulationRate: number;
}

/**
 * Snow particle system with physical simulation
 */
export class SnowSystem {
    /** Active snow particles */
    private particles: SnowParticle[];

    /** Snow accumulation data */
    private accumulations: SnowAccumulation[];

    /** Snow intensity [0-1] */
    private intensity: number;

    /** Wind velocity */
    private windVelocity: Vector3;

    /** Spawn area bounds */
    private spawnAreaSize: number;

    /** Camera position for particle spawning */
    private cameraPosition: Vector3;

    /** Particle pool for reuse */
    private particlePool: SnowParticle[];

    /** Time accumulator */
    private timeAccumulator: number;

    /** Maximum particles */
    private readonly maxParticles: number = 8000;

    /** Particles per second at full intensity */
    private readonly particlesPerSecond: number = 2000;

    /** Snow terminal velocity */
    private readonly terminalVelocity: number = 1.5;

    /** Particle spawn height above camera */
    private readonly spawnHeight: number = 25.0;

    /** Drift frequency for swaying motion */
    private readonly driftFrequency: number = 0.5;

    /** Drift amplitude */
    private readonly driftAmplitude: number = 0.8;

    /**
     * Creates a new snow system
     */
    constructor() {
        this.particles = [];
        this.accumulations = [];
        this.intensity = 0;
        this.windVelocity = new Vector3(0, 0, 0);
        this.spawnAreaSize = 60.0;
        this.cameraPosition = new Vector3(0, 0, 0);
        this.particlePool = [];
        this.timeAccumulator = 0;
    }

    /**
     * Sets snow intensity
     * @param intensity - Snow intensity [0-1]
     */
    public setIntensity(intensity: number): void {
        this.intensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Sets wind velocity affecting snow
     * @param velocity - Wind velocity vector
     */
    public setWind(velocity: Vector3): void {
        this.windVelocity = velocity.clone();
    }

    /**
     * Sets camera position for particle spawning
     * @param position - Camera position
     */
    public setCameraPosition(position: Vector3): void {
        this.cameraPosition = position.clone();
    }

    /**
     * Updates the snow system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.timeAccumulator += deltaTime;

        // Spawn new particles
        if (this.intensity > 0) {
            const spawnCount = Math.floor(this.particlesPerSecond * this.intensity * deltaTime);
            for (let i = 0; i < spawnCount && this.particles.length < this.maxParticles; i++) {
                this.spawnParticle();
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i]!;
            particle.age += deltaTime;

            if (particle.age >= particle.lifetime) {
                // Recycle particle
                this.particlePool.push(this.particles.splice(i, 1)[0]!);
                continue;
            }

            // Apply gravity (slower than rain)
            const gravity = new Vector3(0, -0.3, 0);
            particle.velocity = particle.velocity.add(gravity.multiplyScalar(deltaTime));

            // Apply wind with drift
            const driftX = Math.sin(this.timeAccumulator * this.driftFrequency + particle.driftPhase) * this.driftAmplitude;
            const driftZ = Math.cos(this.timeAccumulator * this.driftFrequency + particle.driftPhase + 1.5) * this.driftAmplitude;
            const drift = new Vector3(driftX, 0, driftZ);

            const windEffect = this.windVelocity.clone().add(drift).multiplyScalar(deltaTime * 0.7);
            particle.velocity = particle.velocity.add(windEffect);

            // Clamp to terminal velocity
            const speed = particle.velocity.length();
            if (speed > this.terminalVelocity) {
                particle.velocity = particle.velocity.normalize().multiplyScalar(this.terminalVelocity);
            }

            // Update rotation
            particle.rotation += particle.rotationSpeed * deltaTime;

            // Update position
            particle.position = particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));

            // Check ground collision
            if (particle.position.y <= 0) {
                this.accumulateSnow(particle.position);
                this.particlePool.push(this.particles.splice(i, 1)[0]!);
            }
        }

        // Update accumulation
        if (this.intensity > 0) {
            this.updateAccumulation(deltaTime);
        }
    }

    /**
     * Spawns a new snow particle
     */
    private spawnParticle(): void {
        let particle: SnowParticle;

        if (this.particlePool.length > 0) {
            particle = this.particlePool.pop()!;
        } else {
            particle = {
                position: new Vector3(0, 0, 0),
                velocity: new Vector3(0, 0, 0),
                rotation: 0,
                rotationSpeed: 0,
                size: 0,
                lifetime: 0,
                age: 0,
                driftPhase: 0
            };
        }

        // Random position in spawn area
        const x = this.cameraPosition.x + (Math.random() - 0.5) * this.spawnAreaSize;
        const y = this.cameraPosition.y + this.spawnHeight;
        const z = this.cameraPosition.z + (Math.random() - 0.5) * this.spawnAreaSize;

        particle.position = new Vector3(x, y, z);
        particle.velocity = new Vector3(
            (Math.random() - 0.5) * 0.2,
            -0.5 - Math.random() * 0.3,
            (Math.random() - 0.5) * 0.2
        );
        particle.velocity = particle.velocity.add(this.windVelocity.clone().multiplyScalar(0.2));
        particle.rotation = Math.random() * Math.PI * 2;
        particle.rotationSpeed = (Math.random() - 0.5) * 2.0;
        particle.size = 0.02 + Math.random() * 0.04;
        particle.lifetime = 8.0 + Math.random() * 4.0;
        particle.age = 0;
        particle.driftPhase = Math.random() * Math.PI * 2;

        this.particles.push(particle);
    }

    /**
     * Accumulates snow at a position
     * @param position - Landing position
     */
    private accumulateSnow(position: Vector3): void {
        const accumulationRadius = 3.0;

        // Find nearby accumulation point
        let nearestAccumulation: SnowAccumulation | null = null;
        let nearestDistance = Infinity;

        for (const accumulation of this.accumulations) {
            const distance = position.distanceTo(accumulation.position);
            if (distance < accumulationRadius && distance < nearestDistance) {
                nearestAccumulation = accumulation;
                nearestDistance = distance;
            }
        }

        if (nearestAccumulation) {
            // Increase existing accumulation
            nearestAccumulation.accumulationRate += this.intensity * 0.0002;
        } else if (this.accumulations.length < 200 && Math.random() < this.intensity * 0.05) {
            // Create new accumulation point
            this.accumulations.push({
                position: position.clone(),
                depth: 0.001,
                radius: 0.2,
                normal: new Vector3(0, 1, 0),
                accumulationRate: this.intensity * 0.0002
            });
        }
    }

    /**
     * Updates snow accumulation
     * @param deltaTime - Time elapsed in seconds
     */
    private updateAccumulation(deltaTime: number): void {
        for (const accumulation of this.accumulations) {
            accumulation.depth += accumulation.accumulationRate * deltaTime * 20;
            accumulation.radius += accumulation.accumulationRate * deltaTime * 5;

            // Clamp accumulation
            accumulation.depth = Math.min(accumulation.depth, 1.0);
            accumulation.radius = Math.min(accumulation.radius, 4.0);

            // Slight decay in accumulation rate
            accumulation.accumulationRate *= 0.995;
        }
    }

    /**
     * Melts snow accumulation
     * @param deltaTime - Time elapsed in seconds
     * @param meltRate - Melt rate multiplier
     */
    public meltSnow(deltaTime: number, meltRate: number = 1.0): void {
        for (let i = this.accumulations.length - 1; i >= 0; i--) {
            const accumulation = this.accumulations[i]!;
            accumulation.depth -= deltaTime * 0.02 * meltRate;

            if (accumulation.depth <= 0) {
                this.accumulations.splice(i, 1);
            }
        }
    }

    /**
     * Gets all active particles
     */
    public getParticles(): readonly SnowParticle[] {
        return this.particles;
    }

    /**
     * Gets all accumulation points
     */
    public getAccumulations(): readonly SnowAccumulation[] {
        return this.accumulations;
    }

    /**
     * Clears all particles
     */
    public clear(): void {
        this.particlePool.push(...this.particles);
        this.particles = [];
    }

    /**
     * Clears all accumulation
     */
    public clearAccumulation(): void {
        this.accumulations = [];
    }

    /**
     * Gets current intensity
     */
    public getIntensity(): number {
        return this.intensity;
    }

    /**
     * Gets total accumulated snow depth at a position
     * @param position - Query position
     * @param radius - Search radius
     * @returns Average snow depth
     */
    public getSnowDepthAt(position: Vector3, radius: number = 1.0): number {
        let totalDepth = 0;
        let count = 0;

        for (const accumulation of this.accumulations) {
            const distance = position.distanceTo(accumulation.position);
            if (distance < radius) {
                const falloff = 1 - distance / radius;
                totalDepth += accumulation.depth * falloff;
                count++;
            }
        }

        return count > 0 ? totalDepth / count : 0;
    }
}
