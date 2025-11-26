/**
 * Volumetric fog system with density variation
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Fog layer definition
 */
export interface FogLayer {
    /** Layer base height */
    baseHeight: number;

    /** Layer thickness */
    thickness: number;

    /** Layer density [0-1] */
    density: number;

    /** Density falloff exponent */
    falloff: number;
}

/**
 * Fog volume for localized fog
 */
export interface FogVolume {
    /** Volume center position */
    position: Vector3;

    /** Volume radius */
    radius: number;

    /** Volume height */
    height: number;

    /** Fog density [0-1] */
    density: number;

    /** Edge softness [0-1] */
    softness: number;
}

/**
 * Volumetric fog system
 */
export class FogSystem {
    /** Base fog density [0-1] */
    private baseDensity: number;

    /** Fog color */
    private fogColor: Vector3;

    /** Fog start distance */
    private fogStart: number;

    /** Fog end distance */
    private fogEnd: number;

    /** Height fog enabled */
    private heightFogEnabled: boolean;

    /** Height fog layers */
    private heightLayers: FogLayer[];

    /** Localized fog volumes */
    private fogVolumes: FogVolume[];

    /** Noise-based density variation intensity */
    private noiseIntensity: number;

    /** Noise scale */
    private noiseScale: number;

    /** Noise animation speed */
    private noiseSpeed: number;

    /** Wind direction for fog movement */
    private windDirection: Vector3;

    /** Wind speed for fog movement */
    private windSpeed: number;

    /** Time accumulator for animation */
    private timeAccumulator: number;

    /**
     * Creates a new fog system
     */
    constructor() {
        this.baseDensity = 0;
        this.fogColor = new Vector3(0.8, 0.85, 0.9);
        this.fogStart = 10.0;
        this.fogEnd = 1000.0;
        this.heightFogEnabled = false;
        this.heightLayers = [];
        this.fogVolumes = [];
        this.noiseIntensity = 0.2;
        this.noiseScale = 0.01;
        this.noiseSpeed = 0.1;
        this.windDirection = new Vector3(1, 0, 0);
        this.windSpeed = 2.0;
        this.timeAccumulator = 0;
    }

    /**
     * Sets base fog parameters
     * @param density - Fog density [0-1]
     * @param color - Fog color
     * @param start - Fog start distance
     * @param end - Fog end distance
     */
    public setBaseFog(density: number, color: Vector3, start: number, end: number): void {
        this.baseDensity = Math.max(0, Math.min(1, density));
        this.fogColor = color.clone();
        this.fogStart = Math.max(0, start);
        this.fogEnd = Math.max(this.fogStart, end);
    }

    /**
     * Enables height fog with layers
     * @param enabled - Enable height fog
     */
    public setHeightFogEnabled(enabled: boolean): void {
        this.heightFogEnabled = enabled;
    }

    /**
     * Adds a height fog layer
     * @param layer - Fog layer definition
     */
    public addHeightLayer(layer: FogLayer): void {
        this.heightLayers.push({
            baseHeight: layer.baseHeight,
            thickness: layer.thickness,
            density: Math.max(0, Math.min(1, layer.density)),
            falloff: Math.max(0.1, layer.falloff)
        });

        // Sort layers by base height
        this.heightLayers.sort((a, b) => a.baseHeight - b.baseHeight);
    }

    /**
     * Clears all height layers
     */
    public clearHeightLayers(): void {
        this.heightLayers = [];
    }

    /**
     * Adds a localized fog volume
     * @param volume - Fog volume definition
     */
    public addFogVolume(volume: FogVolume): void {
        this.fogVolumes.push({
            position: volume.position.clone(),
            radius: volume.radius,
            height: volume.height,
            density: Math.max(0, Math.min(1, volume.density)),
            softness: Math.max(0, Math.min(1, volume.softness))
        });
    }

    /**
     * Removes all fog volumes
     */
    public clearFogVolumes(): void {
        this.fogVolumes = [];
    }

    /**
     * Sets noise parameters for density variation
     * @param intensity - Noise intensity [0-1]
     * @param scale - Noise scale
     * @param speed - Animation speed
     */
    public setNoiseParameters(intensity: number, scale: number, speed: number): void {
        this.noiseIntensity = Math.max(0, Math.min(1, intensity));
        this.noiseScale = Math.max(0.001, scale);
        this.noiseSpeed = Math.max(0, speed);
    }

    /**
     * Sets wind parameters for fog movement
     * @param direction - Wind direction
     * @param speed - Wind speed
     */
    public setWind(direction: Vector3, speed: number): void {
        this.windDirection = direction.clone().normalize();
        this.windSpeed = Math.max(0, speed);
    }

    /**
     * Updates the fog system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.timeAccumulator += deltaTime;
    }

    /**
     * Calculates fog density at a position
     * @param position - Sample position
     * @returns Fog density [0-1]
     */
    public getFogDensityAt(position: Vector3): number {
        let density = this.baseDensity;

        // Height fog contribution
        if (this.heightFogEnabled) {
            for (const layer of this.heightLayers) {
                const heightInLayer = position.y - layer.baseHeight;
                if (heightInLayer >= 0 && heightInLayer <= layer.thickness) {
                    const t = heightInLayer / layer.thickness;
                    const falloff = Math.pow(1 - t, layer.falloff);
                    density += layer.density * falloff;
                }
            }
        }

        // Fog volumes contribution
        for (const volume of this.fogVolumes) {
            const horizontalDist = Math.sqrt(
                Math.pow(position.x - volume.position.x, 2) +
                Math.pow(position.z - volume.position.z, 2)
            );
            const verticalDist = Math.abs(position.y - volume.position.y);

            if (horizontalDist < volume.radius && verticalDist < volume.height * 0.5) {
                const horizontalFalloff = 1 - horizontalDist / volume.radius;
                const verticalFalloff = 1 - (verticalDist / (volume.height * 0.5));

                const softFalloff = Math.pow(horizontalFalloff * verticalFalloff, 1 / (volume.softness + 0.5));
                density += volume.density * softFalloff;
            }
        }

        // Apply noise variation
        if (this.noiseIntensity > 0) {
            const windOffset = this.windDirection.clone().multiplyScalar(this.timeAccumulator * this.windSpeed);
            const noisePos = position.add(windOffset);

            const noise = this.noise3D(
                noisePos.x * this.noiseScale,
                noisePos.y * this.noiseScale,
                noisePos.z * this.noiseScale
            );

            density *= 1 + noise * this.noiseIntensity;
        }

        return Math.max(0, Math.min(1, density));
    }

    /**
     * Gets fog color
     */
    public getFogColor(): Vector3 {
        return this.fogColor.clone();
    }

    /**
     * Gets fog start distance
     */
    public getFogStart(): number {
        return this.fogStart;
    }

    /**
     * Gets fog end distance
     */
    public getFogEnd(): number {
        return this.fogEnd;
    }

    /**
     * Gets base density
     */
    public getBaseDensity(): number {
        return this.baseDensity;
    }

    /**
     * Sets base density
     * @param density - Fog density [0-1]
     */
    public setBaseDensity(density: number): void {
        this.baseDensity = Math.max(0, Math.min(1, density));
    }

    /**
     * Sets fog color
     * @param color - Fog color
     */
    public setFogColor(color: Vector3): void {
        this.fogColor = color.clone();
    }

    /**
     * Simple 3D noise function
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
     * Gets all fog volumes
     */
    public getFogVolumes(): readonly FogVolume[] {
        return this.fogVolumes;
    }

    /**
     * Gets all height layers
     */
    public getHeightLayers(): readonly FogLayer[] {
        return this.heightLayers;
    }
}
