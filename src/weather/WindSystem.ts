/**
 * Wind simulation system
 * Handles global and local wind with gusts and turbulence
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Wind zone definition for localized wind effects
 */
export interface WindZone {
    /** Zone center position */
    position: Vector3;

    /** Zone radius */
    radius: number;

    /** Wind direction in zone */
    direction: Vector3;

    /** Wind speed in zone */
    speed: number;

    /** Turbulence intensity [0-1] */
    turbulence: number;

    /** Falloff exponent */
    falloff: number;
}

/**
 * Wind gust parameters
 */
interface WindGust {
    /** Gust start time */
    startTime: number;

    /** Gust duration */
    duration: number;

    /** Gust intensity multiplier */
    intensity: number;

    /** Gust direction offset */
    directionOffset: Vector3;
}

/**
 * Wind simulation system with global and local effects
 */
export class WindSystem {
    /** Base wind direction */
    private baseDirection: Vector3;

    /** Base wind speed in m/s */
    private baseSpeed: number;

    /** Wind gustiness [0-1] */
    private gustiness: number;

    /** Turbulence intensity [0-1] */
    private turbulence: number;

    /** Active wind zones */
    private windZones: WindZone[];

    /** Active gusts */
    private activeGusts: WindGust[];

    /** Time accumulator for noise */
    private timeAccumulator: number;

    /** Gust timer */
    private gustTimer: number;

    /** Next gust interval */
    private nextGustInterval: number;

    /**
     * Creates a new wind system
     */
    constructor() {
        this.baseDirection = new Vector3(1, 0, 0);
        this.baseSpeed = 3.0;
        this.gustiness = 0.2;
        this.turbulence = 0.1;
        this.windZones = [];
        this.activeGusts = [];
        this.timeAccumulator = 0;
        this.gustTimer = 0;
        this.nextGustInterval = this.randomGustInterval();
    }

    /**
     * Sets base wind parameters
     * @param direction - Wind direction (will be normalized)
     * @param speed - Wind speed in m/s
     * @param gustiness - Gustiness factor [0-1]
     * @param turbulence - Turbulence intensity [0-1]
     */
    public setBaseWind(direction: Vector3, speed: number, gustiness: number, turbulence: number): void {
        this.baseDirection = direction.clone().normalize();
        this.baseSpeed = Math.max(0, speed);
        this.gustiness = Math.max(0, Math.min(1, gustiness));
        this.turbulence = Math.max(0, Math.min(1, turbulence));
    }

    /**
     * Adds a wind zone
     * @param zone - Wind zone definition
     */
    public addWindZone(zone: WindZone): void {
        this.windZones.push({
            position: zone.position.clone(),
            radius: zone.radius,
            direction: zone.direction.clone().normalize(),
            speed: zone.speed,
            turbulence: zone.turbulence,
            falloff: zone.falloff
        });
    }

    /**
     * Removes all wind zones
     */
    public clearWindZones(): void {
        this.windZones = [];
    }

    /**
     * Updates the wind system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.timeAccumulator += deltaTime;
        this.gustTimer += deltaTime;

        // Update gusts
        this.activeGusts = this.activeGusts.filter(gust => {
            const elapsed = this.timeAccumulator - gust.startTime;
            return elapsed < gust.duration;
        });

        // Generate new gusts
        if (this.gustTimer >= this.nextGustInterval && this.gustiness > 0) {
            this.spawnGust();
            this.gustTimer = 0;
            this.nextGustInterval = this.randomGustInterval();
        }
    }

    /**
     * Gets wind velocity at a position
     * @param position - Sample position
     * @returns Wind velocity vector
     */
    public getWindAtPosition(position: Vector3): Vector3 {
        let totalWind = this.getGlobalWind(position);

        // Add local wind zones
        for (const zone of this.windZones) {
            const zoneWind = this.getZoneWind(position, zone);
            totalWind = totalWind.add(zoneWind);
        }

        return totalWind;
    }

    /**
     * Gets global wind with gusts and turbulence
     * @param position - Sample position
     * @returns Global wind velocity
     */
    private getGlobalWind(position: Vector3): Vector3 {
        let direction = this.baseDirection.clone();
        let speed = this.baseSpeed;

        // Apply turbulence
        if (this.turbulence > 0) {
            const turbX = this.noise3D(
                position.x * 0.1,
                position.y * 0.1,
                this.timeAccumulator * 0.5
            );
            const turbY = this.noise3D(
                position.x * 0.1 + 100,
                position.y * 0.1 + 100,
                this.timeAccumulator * 0.5
            );
            const turbZ = this.noise3D(
                position.x * 0.1 + 200,
                position.y * 0.1 + 200,
                this.timeAccumulator * 0.5
            );

            const turbulenceOffset = new Vector3(turbX, turbY, turbZ);
            turbulenceOffset.multiplyScalar(this.turbulence * 0.3);
            direction = direction.add(turbulenceOffset).normalize();
        }

        // Apply gusts
        for (const gust of this.activeGusts) {
            const elapsed = this.timeAccumulator - gust.startTime;
            const t = elapsed / gust.duration;
            const gustEnvelope = Math.sin(t * Math.PI);

            speed += this.baseSpeed * gust.intensity * gustEnvelope * 0.5;
            direction = direction.add(gust.directionOffset.clone().multiplyScalar(gustEnvelope * 0.2)).normalize();
        }

        return direction.multiplyScalar(speed);
    }

    /**
     * Gets wind contribution from a zone
     * @param position - Sample position
     * @param zone - Wind zone
     * @returns Zone wind velocity
     */
    private getZoneWind(position: Vector3, zone: WindZone): Vector3 {
        const offset = position.subtract(zone.position);
        const distance = offset.length();

        if (distance > zone.radius) {
            return new Vector3(0, 0, 0);
        }

        const falloff = Math.pow(1 - distance / zone.radius, zone.falloff);
        let zoneSpeed = zone.speed * falloff;

        // Apply zone turbulence
        if (zone.turbulence > 0) {
            const turb = this.noise3D(
                position.x * 0.2,
                position.z * 0.2,
                this.timeAccumulator * 0.8
            );
            zoneSpeed *= 1 + turb * zone.turbulence * 0.3;
        }

        return zone.direction.clone().multiplyScalar(zoneSpeed);
    }

    /**
     * Spawns a new wind gust
     */
    private spawnGust(): void {
        const gust: WindGust = {
            startTime: this.timeAccumulator,
            duration: 1.5 + Math.random() * 2.5,
            intensity: this.gustiness * (0.5 + Math.random() * 0.5),
            directionOffset: new Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 2
            ).normalize()
        };

        this.activeGusts.push(gust);
    }

    /**
     * Gets random gust interval based on gustiness
     */
    private randomGustInterval(): number {
        const baseInterval = 5.0;
        const variance = 3.0;
        const gustFactor = 1 - this.gustiness * 0.7;
        return (baseInterval + Math.random() * variance) * gustFactor;
    }

    /**
     * Simple 3D noise function (Perlin-like)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param z - Z coordinate
     * @returns Noise value [-1, 1]
     */
    private noise3D(x: number, y: number, z: number): number {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.hash(X) + Y;
        const AA = this.hash(A) + Z;
        const AB = this.hash(A + 1) + Z;
        const B = this.hash(X + 1) + Y;
        const BA = this.hash(B) + Z;
        const BB = this.hash(B + 1) + Z;

        return this.lerp(
            w,
            this.lerp(
                v,
                this.lerp(u, this.grad(this.hash(AA), x, y, z), this.grad(this.hash(BA), x - 1, y, z)),
                this.lerp(u, this.grad(this.hash(AB), x, y - 1, z), this.grad(this.hash(BB), x - 1, y - 1, z))
            ),
            this.lerp(
                v,
                this.lerp(u, this.grad(this.hash(AA + 1), x, y, z - 1), this.grad(this.hash(BA + 1), x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.hash(AB + 1), x, y - 1, z - 1), this.grad(this.hash(BB + 1), x - 1, y - 1, z - 1))
            )
        );
    }

    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private lerp(t: number, a: number, b: number): number {
        return a + t * (b - a);
    }

    private grad(hash: number, x: number, y: number, z: number): number {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    private hash(i: number): number {
        i = (i ^ 61) ^ (i >>> 16);
        i = i + (i << 3);
        i = i ^ (i >>> 4);
        i = i * 0x27d4eb2d;
        i = i ^ (i >>> 15);
        return i & 255;
    }

    /**
     * Gets base wind direction
     */
    public getBaseDirection(): Vector3 {
        return this.baseDirection.clone();
    }

    /**
     * Gets base wind speed
     */
    public getBaseSpeed(): number {
        return this.baseSpeed;
    }

    /**
     * Gets gustiness factor
     */
    public getGustiness(): number {
        return this.gustiness;
    }

    /**
     * Gets turbulence intensity
     */
    public getTurbulence(): number {
        return this.turbulence;
    }
}
