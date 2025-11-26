/**
 * Surface wetness simulation and drying system
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Wetness data for a surface region
 */
export interface WetnessRegion {
    /** Region center position */
    position: Vector3;

    /** Region radius */
    radius: number;

    /** Wetness level [0-1] */
    wetness: number;

    /** Porosity [0-1] - affects drying rate */
    porosity: number;

    /** Last update time */
    lastUpdate: number;
}

/**
 * Material wetness properties
 */
export interface WetnessMaterial {
    /** Material identifier */
    id: string;

    /** Absorption rate [0-1] */
    absorption: number;

    /** Drying rate [0-1] */
    dryingRate: number;

    /** Porosity [0-1] */
    porosity: number;

    /** Max wetness level [0-1] */
    maxWetness: number;

    /** Surface roughness [0-1] */
    roughness: number;
}

/**
 * Predefined material wetness properties
 */
export class WetnessMaterials {
    public static readonly CONCRETE: WetnessMaterial = {
        id: 'concrete',
        absorption: 0.6,
        dryingRate: 0.3,
        porosity: 0.4,
        maxWetness: 0.9,
        roughness: 0.6
    };

    public static readonly ASPHALT: WetnessMaterial = {
        id: 'asphalt',
        absorption: 0.5,
        dryingRate: 0.4,
        porosity: 0.3,
        maxWetness: 0.85,
        roughness: 0.5
    };

    public static readonly METAL: WetnessMaterial = {
        id: 'metal',
        absorption: 0.9,
        dryingRate: 0.8,
        porosity: 0.0,
        maxWetness: 1.0,
        roughness: 0.2
    };

    public static readonly WOOD: WetnessMaterial = {
        id: 'wood',
        absorption: 0.7,
        dryingRate: 0.2,
        porosity: 0.6,
        maxWetness: 1.0,
        roughness: 0.7
    };

    public static readonly GRASS: WetnessMaterial = {
        id: 'grass',
        absorption: 0.8,
        dryingRate: 0.5,
        porosity: 0.7,
        maxWetness: 1.0,
        roughness: 0.8
    };

    public static readonly STONE: WetnessMaterial = {
        id: 'stone',
        absorption: 0.5,
        dryingRate: 0.4,
        porosity: 0.3,
        maxWetness: 0.8,
        roughness: 0.5
    };
}

/**
 * Surface wetness simulation system
 */
export class WetnessSystem {
    /** Active wetness regions */
    private regions: WetnessRegion[];

    /** Material definitions */
    private materials: Map<string, WetnessMaterial>;

    /** Default material */
    private defaultMaterial: WetnessMaterial;

    /** Ambient temperature (affects drying) */
    private temperature: number;

    /** Ambient humidity [0-1] (affects drying) */
    private humidity: number;

    /** Wind speed (affects drying) */
    private windSpeed: number;

    /** Sun intensity (affects drying) */
    private sunIntensity: number;

    /** Time accumulator */
    private timeAccumulator: number;

    /** Maximum regions to track */
    private readonly maxRegions: number = 500;

    /**
     * Creates a new wetness system
     */
    constructor() {
        this.regions = [];
        this.materials = new Map();
        this.defaultMaterial = WetnessMaterials.CONCRETE;
        this.temperature = 20.0;
        this.humidity = 0.5;
        this.windSpeed = 2.0;
        this.sunIntensity = 0.8;
        this.timeAccumulator = 0;

        // Register default materials
        this.registerMaterial(WetnessMaterials.CONCRETE);
        this.registerMaterial(WetnessMaterials.ASPHALT);
        this.registerMaterial(WetnessMaterials.METAL);
        this.registerMaterial(WetnessMaterials.WOOD);
        this.registerMaterial(WetnessMaterials.GRASS);
        this.registerMaterial(WetnessMaterials.STONE);
    }

    /**
     * Registers a material definition
     * @param material - Material wetness properties
     */
    public registerMaterial(material: WetnessMaterial): void {
        this.materials.set(material.id, material);
    }

    /**
     * Sets environmental parameters
     * @param temperature - Ambient temperature in Celsius
     * @param humidity - Relative humidity [0-1]
     * @param windSpeed - Wind speed in m/s
     * @param sunIntensity - Sun intensity [0-1]
     */
    public setEnvironment(temperature: number, humidity: number, windSpeed: number, sunIntensity: number): void {
        this.temperature = temperature;
        this.humidity = Math.max(0, Math.min(1, humidity));
        this.windSpeed = Math.max(0, windSpeed);
        this.sunIntensity = Math.max(0, Math.min(1, sunIntensity));
    }

    /**
     * Adds wetness at a position
     * @param position - Position to wet
     * @param amount - Wetness amount to add [0-1]
     * @param radius - Affected radius
     * @param materialId - Material identifier
     */
    public addWetness(position: Vector3, amount: number, radius: number = 1.0, materialId: string = 'concrete'): void {
        const material = this.materials.get(materialId) || this.defaultMaterial;

        // Find nearby region
        let nearestRegion: WetnessRegion | null = null;
        let nearestDistance = Infinity;

        for (const region of this.regions) {
            const distance = position.distanceTo(region.position);
            if (distance < radius * 2 && distance < nearestDistance) {
                nearestRegion = region;
                nearestDistance = distance;
            }
        }

        if (nearestRegion) {
            // Add to existing region
            const absorbed = amount * material.absorption;
            nearestRegion.wetness = Math.min(material.maxWetness, nearestRegion.wetness + absorbed);
            nearestRegion.lastUpdate = this.timeAccumulator;
        } else if (this.regions.length < this.maxRegions) {
            // Create new region
            const absorbed = amount * material.absorption;
            this.regions.push({
                position: position.clone(),
                radius: radius,
                wetness: absorbed,
                porosity: material.porosity,
                lastUpdate: this.timeAccumulator
            });
        }
    }

    /**
     * Updates the wetness system
     * @param deltaTime - Time elapsed in seconds
     * @param rainIntensity - Current rain intensity [0-1]
     */
    public update(deltaTime: number, rainIntensity: number = 0): void {
        this.timeAccumulator += deltaTime;

        // Calculate global drying rate
        const baseDryingRate = this.calculateDryingRate();

        // Update regions
        for (let i = this.regions.length - 1; i >= 0; i--) {
            const region = this.regions[i]!;

            // Apply rain if present
            if (rainIntensity > 0) {
                region.wetness = Math.min(1.0, region.wetness + rainIntensity * deltaTime * 0.5);
                region.lastUpdate = this.timeAccumulator;
            }

            // Apply drying
            if (rainIntensity === 0 && region.wetness > 0) {
                const porosityFactor = 1 + region.porosity * 0.5;
                const dryingAmount = baseDryingRate * deltaTime * porosityFactor;
                region.wetness = Math.max(0, region.wetness - dryingAmount);
            }

            // Remove dried regions
            if (region.wetness <= 0.01) {
                this.regions.splice(i, 1);
            }
        }
    }

    /**
     * Calculates environmental drying rate
     * @returns Drying rate per second
     */
    private calculateDryingRate(): number {
        // Base rate
        let rate = 0.05;

        // Temperature effect (higher temp = faster drying)
        const tempFactor = Math.max(0, this.temperature - 10) / 30;
        rate *= 1 + tempFactor;

        // Humidity effect (higher humidity = slower drying)
        const humidityFactor = 1 - this.humidity * 0.7;
        rate *= humidityFactor;

        // Wind effect
        const windFactor = Math.min(2.0, 1 + this.windSpeed * 0.1);
        rate *= windFactor;

        // Sun intensity effect
        const sunFactor = 1 + this.sunIntensity * 0.5;
        rate *= sunFactor;

        return rate;
    }

    /**
     * Gets wetness level at a position
     * @param position - Query position
     * @param radius - Sample radius
     * @returns Wetness level [0-1]
     */
    public getWetnessAt(position: Vector3, radius: number = 0.5): number {
        let maxWetness = 0;

        for (const region of this.regions) {
            const distance = position.distanceTo(region.position);
            const totalRadius = region.radius + radius;

            if (distance < totalRadius) {
                const falloff = 1 - Math.min(1, distance / totalRadius);
                const wetness = region.wetness * falloff;
                maxWetness = Math.max(maxWetness, wetness);
            }
        }

        return maxWetness;
    }

    /**
     * Gets all wetness regions
     */
    public getRegions(): readonly WetnessRegion[] {
        return this.regions;
    }

    /**
     * Clears all wetness
     */
    public clear(): void {
        this.regions = [];
    }

    /**
     * Gets current temperature
     */
    public getTemperature(): number {
        return this.temperature;
    }

    /**
     * Gets current humidity
     */
    public getHumidity(): number {
        return this.humidity;
    }

    /**
     * Instantly dries all surfaces
     */
    public instantDry(): void {
        this.regions = [];
    }

    /**
     * Gets average wetness across all regions
     */
    public getAverageWetness(): number {
        if (this.regions.length === 0) {
            return 0;
        }

        let total = 0;
        for (const region of this.regions) {
            total += region.wetness;
        }

        return total / this.regions.length;
    }
}
