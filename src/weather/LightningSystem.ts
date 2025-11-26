/**
 * Lightning bolt generation and flash effects
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Lightning bolt segment
 */
export interface LightningSegment {
    /** Segment start position */
    start: Vector3;

    /** Segment end position */
    end: Vector3;

    /** Segment intensity [0-1] */
    intensity: number;
}

/**
 * Lightning strike
 */
export interface LightningStrike {
    /** Strike origin position */
    origin: Vector3;

    /** Strike target position */
    target: Vector3;

    /** Main bolt segments */
    segments: LightningSegment[];

    /** Branch segments */
    branches: LightningSegment[];

    /** Strike creation time */
    creationTime: number;

    /** Strike duration */
    duration: number;

    /** Strike intensity */
    intensity: number;

    /** Flash brightness */
    flashBrightness: number;

    /** Strike identifier */
    id: number;
}

/**
 * Lightning generation parameters
 */
export interface LightningParams {
    /** Branching probability [0-1] */
    branchProbability?: number;

    /** Maximum branch depth */
    maxBranchDepth?: number;

    /** Segment length variation [0-1] */
    segmentVariation?: number;

    /** Displacement magnitude */
    displacement?: number;

    /** Bolt thickness variation */
    thicknessVariation?: number;
}

/**
 * Lightning bolt generation and flash system
 */
export class LightningSystem {
    /** Active lightning strikes */
    private strikes: LightningStrike[];

    /** Lightning frequency (strikes per minute) */
    private frequency: number;

    /** Time since last strike */
    private timeSinceLastStrike: number;

    /** Next strike timer */
    private nextStrikeTimer: number;

    /** Camera position for strike positioning */
    private cameraPosition: Vector3;

    /** Strike spawn radius around camera */
    private spawnRadius: number;

    /** Strike ID counter */
    private strikeIdCounter: number;

    /** Time accumulator */
    private timeAccumulator: number;

    /** Minimum strike interval */
    private readonly minStrikeInterval: number = 2.0;

    /** Maximum strike distance */
    private readonly maxStrikeDistance: number = 1000.0;

    /** Cloud height */
    private readonly cloudHeight: number = 500.0;

    /**
     * Creates a new lightning system
     */
    constructor() {
        this.strikes = [];
        this.frequency = 0;
        this.timeSinceLastStrike = 0;
        this.nextStrikeTimer = 0;
        this.cameraPosition = new Vector3(0, 0, 0);
        this.spawnRadius = 500.0;
        this.strikeIdCounter = 0;
        this.timeAccumulator = 0;
    }

    /**
     * Sets lightning frequency
     * @param frequency - Strikes per minute
     */
    public setFrequency(frequency: number): void {
        this.frequency = Math.max(0, frequency);
    }

    /**
     * Sets camera position for strike spawning
     * @param position - Camera position
     */
    public setCameraPosition(position: Vector3): void {
        this.cameraPosition = position.clone();
    }

    /**
     * Updates the lightning system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.timeAccumulator += deltaTime;
        this.timeSinceLastStrike += deltaTime;
        this.nextStrikeTimer -= deltaTime;

        // Generate lightning strikes
        if (this.frequency > 0 && this.nextStrikeTimer <= 0 && this.timeSinceLastStrike >= this.minStrikeInterval) {
            if (Math.random() < this.frequency / 60 * deltaTime * 10) {
                this.generateStrike();
                this.timeSinceLastStrike = 0;
                this.nextStrikeTimer = this.getRandomInterval();
            }
        }

        // Update and remove expired strikes
        this.strikes = this.strikes.filter(strike => {
            const age = this.timeAccumulator - strike.creationTime;
            return age < strike.duration;
        });
    }

    /**
     * Generates a lightning strike
     * @param params - Generation parameters
     */
    public generateStrike(params?: LightningParams): void {
        // Random position around camera
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.spawnRadius;
        const x = this.cameraPosition.x + Math.cos(angle) * distance;
        const z = this.cameraPosition.z + Math.sin(angle) * distance;

        const origin = new Vector3(x, this.cloudHeight, z);
        const target = new Vector3(x, 0, z);

        this.createStrikeFromTo(origin, target, params);
    }

    /**
     * Creates a lightning strike from origin to target
     * @param origin - Strike origin
     * @param target - Strike target
     * @param params - Generation parameters
     */
    public createStrikeFromTo(origin: Vector3, target: Vector3, params?: LightningParams): void {
        const defaultParams: Required<LightningParams> = {
            branchProbability: 0.3,
            maxBranchDepth: 3,
            segmentVariation: 0.3,
            displacement: 10.0,
            thicknessVariation: 0.5
        };

        const finalParams = { ...defaultParams, ...params };

        const segments: LightningSegment[] = [];
        const branches: LightningSegment[] = [];

        // Generate main bolt
        this.generateBolt(origin, target, segments, 0.05, finalParams);

        // Generate branches
        this.generateBranches(segments, branches, finalParams, 0);

        const strike: LightningStrike = {
            origin: origin.clone(),
            target: target.clone(),
            segments: segments,
            branches: branches,
            creationTime: this.timeAccumulator,
            duration: 0.15 + Math.random() * 0.1,
            intensity: 0.8 + Math.random() * 0.2,
            flashBrightness: 0.6 + Math.random() * 0.4,
            id: this.strikeIdCounter++
        };

        this.strikes.push(strike);
    }

    /**
     * Generates a lightning bolt between two points
     * @param start - Start position
     * @param end - End position
     * @param segments - Output segments array
     * @param segmentLength - Target segment length
     * @param params - Generation parameters
     */
    private generateBolt(
        start: Vector3,
        end: Vector3,
        segments: LightningSegment[],
        segmentLength: number,
        params: Required<LightningParams>
    ): void {
        const direction = end.subtract(start);
        const distance = direction.length();
        const numSegments = Math.max(10, Math.floor(distance * segmentLength));

        let currentPos = start.clone();

        for (let i = 0; i < numSegments; i++) {
            const t = (i + 1) / numSegments;
            const targetPos = Vector3.lerp(start, end, t);

            // Add displacement perpendicular to main direction
            const displacement = params.displacement * (1 - t) * (1 - params.segmentVariation + Math.random() * params.segmentVariation);

            const perpendicular1 = new Vector3(
                -direction.z,
                0,
                direction.x
            ).normalize();

            const perpendicular2 = direction.cross(perpendicular1).normalize();

            const offset = perpendicular1.multiplyScalar((Math.random() - 0.5) * displacement)
                .add(perpendicular2.multiplyScalar((Math.random() - 0.5) * displacement));

            const nextPos = targetPos.add(offset);

            segments.push({
                start: currentPos.clone(),
                end: nextPos.clone(),
                intensity: 0.8 + Math.random() * 0.2
            });

            currentPos = nextPos;
        }
    }

    /**
     * Generates branches from main bolt
     * @param mainSegments - Main bolt segments
     * @param branches - Output branches array
     * @param params - Generation parameters
     * @param depth - Current recursion depth
     */
    private generateBranches(
        mainSegments: LightningSegment[],
        branches: LightningSegment[],
        params: Required<LightningParams>,
        depth: number
    ): void {
        if (depth >= params.maxBranchDepth) {
            return;
        }

        for (let i = 0; i < mainSegments.length; i++) {
            if (Math.random() < params.branchProbability) {
                const segment = mainSegments[i]!;
                const branchStart = Vector3.lerp(segment.start, segment.end, Math.random());

                // Random branch direction
                const mainDirection = segment.end.subtract(segment.start).normalize();
                const angle = (Math.random() - 0.5) * Math.PI * 0.5;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                const branchDirection = new Vector3(
                    mainDirection.x * cos - mainDirection.z * sin,
                    mainDirection.y - Math.random() * 0.3,
                    mainDirection.x * sin + mainDirection.z * cos
                ).normalize();

                const branchLength = (Math.random() * 0.3 + 0.2) * 50 / (depth + 1);
                const branchEnd = branchStart.add(branchDirection.multiplyScalar(branchLength));

                const branchSegments: LightningSegment[] = [];
                this.generateBolt(branchStart, branchEnd, branchSegments, 0.1, {
                    ...params,
                    displacement: params.displacement * 0.5
                });

                branches.push(...branchSegments);

                // Recursive branching
                if (Math.random() < 0.3) {
                    this.generateBranches(branchSegments, branches, params, depth + 1);
                }
            }
        }
    }

    /**
     * Gets random strike interval
     */
    private getRandomInterval(): number {
        return this.minStrikeInterval + Math.random() * 3.0;
    }

    /**
     * Gets all active strikes
     */
    public getStrikes(): readonly LightningStrike[] {
        return this.strikes;
    }

    /**
     * Gets flash brightness from all active strikes
     */
    public getFlashBrightness(): number {
        let maxBrightness = 0;

        for (const strike of this.strikes) {
            const age = this.timeAccumulator - strike.creationTime;
            const t = age / strike.duration;

            // Flash envelope: quick rise, slow decay
            let envelope: number;
            if (t < 0.1) {
                envelope = t / 0.1;
            } else {
                envelope = 1 - (t - 0.1) / 0.9;
            }

            const brightness = strike.flashBrightness * envelope * strike.intensity;
            maxBrightness = Math.max(maxBrightness, brightness);
        }

        return maxBrightness;
    }

    /**
     * Clears all active strikes
     */
    public clear(): void {
        this.strikes = [];
    }

    /**
     * Gets current frequency
     */
    public getFrequency(): number {
        return this.frequency;
    }

    /**
     * Manually triggers a lightning strike at a specific position
     * @param position - Strike target position
     * @param params - Generation parameters
     */
    public strikeAt(position: Vector3, params?: LightningParams): void {
        const origin = new Vector3(
            position.x + (Math.random() - 0.5) * 20,
            this.cloudHeight,
            position.z + (Math.random() - 0.5) * 20
        );

        this.createStrikeFromTo(origin, position, params);
        this.timeSinceLastStrike = 0;
    }
}
