/**
 * Procedural cloud rendering system
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Cloud layer definition
 */
export interface CloudLayer {
    /** Layer altitude */
    altitude: number;

    /** Layer thickness */
    thickness: number;

    /** Cloud coverage [0-1] */
    coverage: number;

    /** Cloud density [0-1] */
    density: number;

    /** Cloud opacity [0-1] */
    opacity: number;

    /** Cloud speed */
    speed: number;

    /** Wind direction */
    windDirection: Vector3;

    /** Noise scale */
    noiseScale: number;

    /** Cloud type */
    type: CloudType;
}

/**
 * Cloud types
 */
export enum CloudType {
    CIRRUS = 'cirrus',
    CUMULUS = 'cumulus',
    STRATUS = 'stratus',
    CUMULONIMBUS = 'cumulonimbus'
}

/**
 * Cloud billboard for simple rendering
 */
export interface CloudBillboard {
    /** Cloud position */
    position: Vector3;

    /** Cloud size */
    size: Vector3;

    /** Cloud opacity [0-1] */
    opacity: number;

    /** Cloud type */
    type: CloudType;

    /** Texture offset for variety */
    textureOffset: number;
}

/**
 * Procedural cloud system
 */
export class CloudSystem {
    /** Cloud layers */
    private layers: CloudLayer[];

    /** Billboard clouds for distant rendering */
    private billboards: CloudBillboard[];

    /** Time accumulator for animation */
    private timeAccumulator: number;

    /** Billboard spawn radius */
    private billboardRadius: number;

    /** Camera position for billboard positioning */
    private cameraPosition: Vector3;

    /** Maximum billboards */
    private readonly maxBillboards: number = 200;

    /** Billboard respawn threshold */
    private readonly respawnDistance: number = 5000;

    /**
     * Creates a new cloud system
     */
    constructor() {
        this.layers = [];
        this.billboards = [];
        this.timeAccumulator = 0;
        this.billboardRadius = 10000;
        this.cameraPosition = new Vector3(0, 0, 0);
    }

    /**
     * Adds a cloud layer
     * @param layer - Cloud layer definition
     */
    public addLayer(layer: CloudLayer): void {
        this.layers.push({
            altitude: layer.altitude,
            thickness: layer.thickness,
            coverage: Math.max(0, Math.min(1, layer.coverage)),
            density: Math.max(0, Math.min(1, layer.density)),
            opacity: Math.max(0, Math.min(1, layer.opacity)),
            speed: layer.speed,
            windDirection: layer.windDirection.clone().normalize(),
            noiseScale: layer.noiseScale,
            type: layer.type
        });

        // Sort by altitude
        this.layers.sort((a, b) => a.altitude - b.altitude);
    }

    /**
     * Removes all cloud layers
     */
    public clearLayers(): void {
        this.layers = [];
    }

    /**
     * Sets camera position for billboard management
     * @param position - Camera position
     */
    public setCameraPosition(position: Vector3): void {
        this.cameraPosition = position.clone();
    }

    /**
     * Updates the cloud system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.timeAccumulator += deltaTime;

        // Update billboards
        this.updateBillboards();
    }

    /**
     * Updates billboard positions
     */
    private updateBillboards(): void {
        // Remove distant billboards
        this.billboards = this.billboards.filter(billboard => {
            const distance = billboard.position.distanceTo(this.cameraPosition);
            return distance < this.respawnDistance;
        });

        // Spawn new billboards if needed
        while (this.billboards.length < this.maxBillboards) {
            this.spawnBillboard();
        }
    }

    /**
     * Spawns a random cloud billboard
     */
    private spawnBillboard(): void {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.billboardRadius;
        const x = this.cameraPosition.x + Math.cos(angle) * distance;
        const z = this.cameraPosition.z + Math.sin(angle) * distance;

        // Random altitude based on cloud type
        const cloudTypes = Object.values(CloudType);
        const type = cloudTypes[Math.floor(Math.random() * cloudTypes.length)] as CloudType;

        let altitude: number;
        let size: Vector3;

        switch (type) {
            case CloudType.CIRRUS:
                altitude = 8000 + Math.random() * 2000;
                size = new Vector3(
                    300 + Math.random() * 500,
                    50 + Math.random() * 100,
                    200 + Math.random() * 400
                );
                break;
            case CloudType.CUMULUS:
                altitude = 1500 + Math.random() * 1500;
                size = new Vector3(
                    200 + Math.random() * 300,
                    150 + Math.random() * 250,
                    200 + Math.random() * 300
                );
                break;
            case CloudType.STRATUS:
                altitude = 500 + Math.random() * 1000;
                size = new Vector3(
                    400 + Math.random() * 600,
                    80 + Math.random() * 120,
                    400 + Math.random() * 600
                );
                break;
            case CloudType.CUMULONIMBUS:
                altitude = 2000 + Math.random() * 3000;
                size = new Vector3(
                    300 + Math.random() * 400,
                    500 + Math.random() * 1000,
                    300 + Math.random() * 400
                );
                break;
            default:
                altitude = 1000;
                size = new Vector3(200, 150, 200);
        }

        this.billboards.push({
            position: new Vector3(x, altitude, z),
            size: size,
            opacity: 0.6 + Math.random() * 0.4,
            type: type,
            textureOffset: Math.random()
        });
    }

    /**
     * Samples cloud density at a position
     * @param position - Sample position
     * @returns Cloud density [0-1]
     */
    public getCloudDensityAt(position: Vector3): number {
        let totalDensity = 0;

        for (const layer of this.layers) {
            const heightInLayer = position.y - layer.altitude;

            if (heightInLayer >= 0 && heightInLayer <= layer.thickness) {
                // Height falloff within layer
                const heightT = heightInLayer / layer.thickness;
                const heightFalloff = Math.sin(heightT * Math.PI);

                // Animated noise sampling
                const windOffset = layer.windDirection.clone()
                    .multiplyScalar(this.timeAccumulator * layer.speed);

                const samplePos = position.add(windOffset);

                const noise = this.sampleCloudNoise(
                    samplePos.x * layer.noiseScale,
                    samplePos.y * layer.noiseScale,
                    samplePos.z * layer.noiseScale,
                    layer.coverage
                );

                const layerDensity = noise * layer.density * heightFalloff;
                totalDensity += layerDensity;
            }
        }

        return Math.min(1, totalDensity);
    }

    /**
     * Samples cloud noise with coverage
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param z - Z coordinate
     * @param coverage - Cloud coverage [0-1]
     * @returns Noise value [0-1]
     */
    private sampleCloudNoise(x: number, y: number, z: number, coverage: number): number {
        // Multi-octave noise
        let noise = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0;

        for (let i = 0; i < 4; i++) {
            noise += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }

        noise = noise / maxValue;
        noise = (noise + 1) * 0.5;

        // Apply coverage
        const remapped = Math.max(0, noise - (1 - coverage)) / coverage;

        return remapped;
    }

    /**
     * Gets all cloud layers
     */
    public getLayers(): readonly CloudLayer[] {
        return this.layers;
    }

    /**
     * Gets all billboard clouds
     */
    public getBillboards(): readonly CloudBillboard[] {
        return this.billboards;
    }

    /**
     * Sets global cloud coverage for all layers
     * @param coverage - Cloud coverage [0-1]
     */
    public setGlobalCoverage(coverage: number): void {
        const clampedCoverage = Math.max(0, Math.min(1, coverage));
        for (const layer of this.layers) {
            layer.coverage = clampedCoverage;
        }
    }

    /**
     * Sets global cloud opacity for all layers
     * @param opacity - Cloud opacity [0-1]
     */
    public setGlobalOpacity(opacity: number): void {
        const clampedOpacity = Math.max(0, Math.min(1, opacity));
        for (const layer of this.layers) {
            layer.opacity = clampedOpacity;
        }
    }

    /**
     * Sets global cloud density for all layers
     * @param density - Cloud density [0-1]
     */
    public setGlobalDensity(density: number): void {
        const clampedDensity = Math.max(0, Math.min(1, density));
        for (const layer of this.layers) {
            layer.density = clampedDensity;
        }
    }

    /**
     * Simple 3D noise function
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
}
