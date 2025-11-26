/**
 * Rain particle system with splashes and puddles
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Rain particle
 */
interface RainParticle {
    /** Particle position */
    position: Vector3;

    /** Particle velocity */
    velocity: Vector3;

    /** Particle lifetime */
    lifetime: number;

    /** Particle age */
    age: number;
}

/**
 * Rain splash effect
 */
interface RainSplash {
    /** Splash position */
    position: Vector3;

    /** Splash creation time */
    creationTime: number;

    /** Splash radius */
    radius: number;

    /** Splash intensity */
    intensity: number;
}

/**
 * Puddle accumulation data
 */
export interface Puddle {
    /** Puddle center position */
    position: Vector3;

    /** Puddle radius */
    radius: number;

    /** Puddle depth */
    depth: number;

    /** Growth rate */
    growthRate: number;
}

/**
 * Rain particle system with physical simulation
 */
export class RainSystem {
    /** Active rain particles */
    private particles: RainParticle[];

    /** Active splashes */
    private splashes: RainSplash[];

    /** Puddles */
    private puddles: Puddle[];

    /** Rain intensity [0-1] */
    private intensity: number;

    /** Wind velocity */
    private windVelocity: Vector3;

    /** Spawn area bounds */
    private spawnAreaSize: number;

    /** Camera position for particle spawning */
    private cameraPosition: Vector3;

    /** Particle pool for reuse */
    private particlePool: RainParticle[];

    /** Time accumulator */
    private timeAccumulator: number;

    /** Maximum particles */
    private readonly maxParticles: number = 5000;

    /** Particles per second at full intensity */
    private readonly particlesPerSecond: number = 3000;

    /** Splash duration */
    private readonly splashDuration: number = 0.5;

    /** Drop terminal velocity */
    private readonly terminalVelocity: number = 9.0;

    /** Particle spawn height above camera */
    private readonly spawnHeight: number = 20.0;

    /**
     * Creates a new rain system
     */
    constructor() {
        this.particles = [];
        this.splashes = [];
        this.puddles = [];
        this.intensity = 0;
        this.windVelocity = new Vector3(0, 0, 0);
        this.spawnAreaSize = 50.0;
        this.cameraPosition = new Vector3(0, 0, 0);
        this.particlePool = [];
        this.timeAccumulator = 0;
    }

    /**
     * Sets rain intensity
     * @param intensity - Rain intensity [0-1]
     */
    public setIntensity(intensity: number): void {
        this.intensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Sets wind velocity affecting rain
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
     * Updates the rain system
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
                // Create splash
                this.createSplash(particle.position, this.intensity);

                // Recycle particle
                this.particlePool.push(this.particles.splice(i, 1)[0]!);
                continue;
            }

            // Apply gravity and wind
            const gravity = new Vector3(0, -9.81, 0);
            particle.velocity = particle.velocity.add(gravity.multiplyScalar(deltaTime));
            particle.velocity = particle.velocity.add(this.windVelocity.clone().multiplyScalar(deltaTime * 0.5));

            // Clamp to terminal velocity
            const speed = particle.velocity.length();
            if (speed > this.terminalVelocity) {
                particle.velocity = particle.velocity.normalize().multiplyScalar(this.terminalVelocity);
            }

            // Update position
            particle.position = particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));

            // Check ground collision (simplified)
            if (particle.position.y <= 0) {
                this.createSplash(particle.position, this.intensity);
                this.particlePool.push(this.particles.splice(i, 1)[0]!);
            }
        }

        // Update splashes
        this.splashes = this.splashes.filter(splash => {
            const age = this.timeAccumulator - splash.creationTime;
            return age < this.splashDuration;
        });

        // Update puddles
        if (this.intensity > 0) {
            this.updatePuddles(deltaTime);
        }
    }

    /**
     * Spawns a new rain particle
     */
    private spawnParticle(): void {
        let particle: RainParticle;

        if (this.particlePool.length > 0) {
            particle = this.particlePool.pop()!;
        } else {
            particle = {
                position: new Vector3(0, 0, 0),
                velocity: new Vector3(0, 0, 0),
                lifetime: 0,
                age: 0
            };
        }

        // Random position in spawn area
        const x = this.cameraPosition.x + (Math.random() - 0.5) * this.spawnAreaSize;
        const y = this.cameraPosition.y + this.spawnHeight;
        const z = this.cameraPosition.z + (Math.random() - 0.5) * this.spawnAreaSize;

        particle.position = new Vector3(x, y, z);
        particle.velocity = new Vector3(0, -5.0, 0);
        particle.velocity = particle.velocity.add(this.windVelocity.clone().multiplyScalar(0.3));
        particle.lifetime = 5.0;
        particle.age = 0;

        this.particles.push(particle);
    }

    /**
     * Creates a splash effect
     * @param position - Splash position
     * @param intensity - Splash intensity
     */
    private createSplash(position: Vector3, intensity: number): void {
        // Limit splash count for performance
        if (this.splashes.length > 500) {
            return;
        }

        const splash: RainSplash = {
            position: position.clone(),
            creationTime: this.timeAccumulator,
            radius: 0.1 + Math.random() * 0.15,
            intensity: intensity * (0.7 + Math.random() * 0.3)
        };

        this.splashes.push(splash);

        // Contribute to puddle formation
        this.contributeToPuddle(position, intensity);
    }

    /**
     * Contributes to puddle formation
     * @param position - Impact position
     * @param intensity - Rain intensity
     */
    private contributeToPuddle(position: Vector3, intensity: number): void {
        const puddleRadius = 2.0;

        // Find nearby puddle
        let nearestPuddle: Puddle | null = null;
        let nearestDistance = Infinity;

        for (const puddle of this.puddles) {
            const distance = position.distanceTo(puddle.position);
            if (distance < puddleRadius && distance < nearestDistance) {
                nearestPuddle = puddle;
                nearestDistance = distance;
            }
        }

        if (nearestPuddle) {
            // Grow existing puddle
            nearestPuddle.growthRate += intensity * 0.0001;
        } else if (this.puddles.length < 100 && Math.random() < intensity * 0.01) {
            // Create new puddle
            this.puddles.push({
                position: position.clone(),
                radius: 0.1,
                depth: 0.001,
                growthRate: intensity * 0.0001
            });
        }
    }

    /**
     * Updates puddles
     * @param deltaTime - Time elapsed in seconds
     */
    private updatePuddles(deltaTime: number): void {
        for (const puddle of this.puddles) {
            puddle.radius += puddle.growthRate * deltaTime * 10;
            puddle.depth += puddle.growthRate * deltaTime * 5;

            // Clamp puddle size
            puddle.radius = Math.min(puddle.radius, 5.0);
            puddle.depth = Math.min(puddle.depth, 0.1);

            // Decay growth rate
            puddle.growthRate *= 0.99;
        }
    }

    /**
     * Drains puddles when rain stops
     * @param deltaTime - Time elapsed in seconds
     * @param drainRate - Drain rate multiplier
     */
    public drainPuddles(deltaTime: number, drainRate: number = 1.0): void {
        for (let i = this.puddles.length - 1; i >= 0; i--) {
            const puddle = this.puddles[i]!;
            puddle.depth -= deltaTime * 0.01 * drainRate;
            puddle.radius -= deltaTime * 0.1 * drainRate;

            if (puddle.depth <= 0 || puddle.radius <= 0) {
                this.puddles.splice(i, 1);
            }
        }
    }

    /**
     * Gets all active particles
     */
    public getParticles(): readonly RainParticle[] {
        return this.particles;
    }

    /**
     * Gets all active splashes
     */
    public getSplashes(): readonly RainSplash[] {
        return this.splashes;
    }

    /**
     * Gets all puddles
     */
    public getPuddles(): readonly Puddle[] {
        return this.puddles;
    }

    /**
     * Clears all particles and effects
     */
    public clear(): void {
        this.particlePool.push(...this.particles);
        this.particles = [];
        this.splashes = [];
    }

    /**
     * Clears all puddles
     */
    public clearPuddles(): void {
        this.puddles = [];
    }

    /**
     * Gets current intensity
     */
    public getIntensity(): number {
        return this.intensity;
    }
}
