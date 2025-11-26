/**
 * G3D 5.0 Timeline & Cinematics Module - Clip
 *
 * Represents a timed segment on a track that contains an asset reference
 * and playback properties like easing, blending, and speed.
 */

/**
 * Easing function type for clip transitions
 */
export type EasingFunction = (t: number) => number;

/**
 * Predefined easing functions
 */
export const Easing = {
    linear: (t: number): number => t,

    easeInQuad: (t: number): number => t * t,
    easeOutQuad: (t: number): number => t * (2 - t),
    easeInOutQuad: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

    easeInCubic: (t: number): number => t * t * t,
    easeOutCubic: (t: number): number => (--t) * t * t + 1,
    easeInOutCubic: (t: number): number => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

    easeInQuart: (t: number): number => t * t * t * t,
    easeOutQuart: (t: number): number => 1 - (--t) * t * t * t,
    easeInOutQuart: (t: number): number => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,

    easeInSine: (t: number): number => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t: number): number => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,

    easeInExpo: (t: number): number => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
    easeOutExpo: (t: number): number => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeInOutExpo: (t: number): number => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    }
};

/**
 * Blend mode for overlapping clips
 */
export enum ClipBlendMode {
    /** Replace previous clip */
    Replace = 'replace',
    /** Additive blending */
    Additive = 'additive',
    /** Multiply blending */
    Multiply = 'multiply',
    /** Mix based on weight */
    Mix = 'mix'
}

/**
 * Configuration for creating a clip
 */
export interface ClipConfig<T = any> {
    /** Unique identifier */
    id?: string;
    /** Display name */
    name?: string;
    /** Start time in seconds */
    startTime: number;
    /** Duration in seconds */
    duration: number;
    /** Asset reference */
    asset?: T;
    /** Ease in duration */
    easeInDuration?: number;
    /** Ease out duration */
    easeOutDuration?: number;
    /** Ease in function */
    easeInCurve?: EasingFunction;
    /** Ease out function */
    easeOutCurve?: EasingFunction;
    /** Speed multiplier */
    speedMultiplier?: number;
    /** Blend mode */
    blendMode?: ClipBlendMode;
    /** Clip weight for blending */
    weight?: number;
    /** Offset into the asset */
    clipInOffset?: number;
    /** Custom properties */
    properties?: Record<string, any>;
}

/**
 * Base clip class
 *
 * A clip represents a timed segment on a track that plays back an asset.
 * Clips support easing, blending, and speed control.
 */
export class Clip<T = any> {
    private static nextId = 0;

    /** Unique identifier */
    public readonly id: string;

    /** Display name */
    public name: string;

    /** Start time in seconds on the timeline */
    public startTime: number;

    /** Duration of the clip in seconds */
    public duration: number;

    /** Reference to the asset this clip plays */
    public asset: T | null;

    /** Duration of ease in transition */
    public easeInDuration: number;

    /** Duration of ease out transition */
    public easeOutDuration: number;

    /** Easing function for fade in */
    public easeInCurve: EasingFunction;

    /** Easing function for fade out */
    public easeOutCurve: EasingFunction;

    /** Speed multiplier for playback */
    public speedMultiplier: number;

    /** Blend mode for overlapping clips */
    public blendMode: ClipBlendMode;

    /** Clip weight for blending (0-1) */
    public weight: number;

    /** Offset into the asset to start playback */
    public clipInOffset: number;

    /** Custom properties for clip-specific data */
    public properties: Record<string, any>;

    /** Whether this clip is enabled */
    public enabled: boolean;

    constructor(config: ClipConfig<T>) {
        this.id = config.id || `clip_${Clip.nextId++}`;
        this.name = config.name || this.id;
        this.startTime = config.startTime;
        this.duration = config.duration;
        this.asset = config.asset ?? null;
        this.easeInDuration = config.easeInDuration ?? 0;
        this.easeOutDuration = config.easeOutDuration ?? 0;
        this.easeInCurve = config.easeInCurve ?? Easing.linear;
        this.easeOutCurve = config.easeOutCurve ?? Easing.linear;
        this.speedMultiplier = config.speedMultiplier ?? 1.0;
        this.blendMode = config.blendMode ?? ClipBlendMode.Replace;
        this.weight = config.weight ?? 1.0;
        this.clipInOffset = config.clipInOffset ?? 0;
        this.properties = config.properties ?? {};
        this.enabled = true;
    }

    /**
     * Get the end time of this clip
     */
    public get endTime(): number {
        return this.startTime + this.duration;
    }

    /**
     * Check if a given time is within this clip's range
     *
     * @param time - Time in seconds
     * @returns True if time is within clip bounds
     */
    public containsTime(time: number): boolean {
        return time >= this.startTime && time < this.endTime;
    }

    /**
     * Get the local time within this clip
     *
     * @param globalTime - Global timeline time
     * @returns Local time within the clip (0 to duration)
     */
    public getLocalTime(globalTime: number): number {
        if (!this.containsTime(globalTime)) {
            return -1;
        }
        return (globalTime - this.startTime) * this.speedMultiplier;
    }

    /**
     * Get the normalized time (0-1) within this clip
     *
     * @param globalTime - Global timeline time
     * @returns Normalized time (0-1)
     */
    public getNormalizedTime(globalTime: number): number {
        const localTime = this.getLocalTime(globalTime);
        if (localTime < 0) {
            return -1;
        }
        return this.duration > 0 ? localTime / this.duration : 0;
    }

    /**
     * Calculate the blend weight at a given time considering easing
     *
     * @param globalTime - Global timeline time
     * @returns Blend weight (0-1)
     */
    public getBlendWeight(globalTime: number): number {
        if (!this.enabled || !this.containsTime(globalTime)) {
            return 0;
        }

        const localTime = globalTime - this.startTime;
        let blendWeight = this.weight;

        // Apply ease in
        if (this.easeInDuration > 0 && localTime < this.easeInDuration) {
            const t = localTime / this.easeInDuration;
            blendWeight *= this.easeInCurve(t);
        }

        // Apply ease out
        const timeFromEnd = this.duration - localTime;
        if (this.easeOutDuration > 0 && timeFromEnd < this.easeOutDuration) {
            const t = timeFromEnd / this.easeOutDuration;
            blendWeight *= this.easeOutCurve(t);
        }

        return blendWeight;
    }

    /**
     * Get the asset time considering offset and speed
     *
     * @param globalTime - Global timeline time
     * @returns Time within the asset
     */
    public getAssetTime(globalTime: number): number {
        const localTime = this.getLocalTime(globalTime);
        if (localTime < 0) {
            return -1;
        }
        return this.clipInOffset + localTime;
    }

    /**
     * Check if this clip overlaps with another clip
     *
     * @param other - Other clip to check
     * @returns True if clips overlap
     */
    public overlaps(other: Clip): boolean {
        return this.startTime < other.endTime && this.endTime > other.startTime;
    }

    /**
     * Clone this clip
     *
     * @returns New clip instance with same properties
     */
    public clone(): Clip<T> {
        return new Clip({
            name: this.name + '_clone',
            startTime: this.startTime,
            duration: this.duration,
            asset: this.asset,
            easeInDuration: this.easeInDuration,
            easeOutDuration: this.easeOutDuration,
            easeInCurve: this.easeInCurve,
            easeOutCurve: this.easeOutCurve,
            speedMultiplier: this.speedMultiplier,
            blendMode: this.blendMode,
            weight: this.weight,
            clipInOffset: this.clipInOffset,
            properties: { ...this.properties }
        });
    }

    /**
     * Serialize clip to JSON
     */
    public toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            startTime: this.startTime,
            duration: this.duration,
            easeInDuration: this.easeInDuration,
            easeOutDuration: this.easeOutDuration,
            speedMultiplier: this.speedMultiplier,
            blendMode: this.blendMode,
            weight: this.weight,
            clipInOffset: this.clipInOffset,
            properties: this.properties,
            enabled: this.enabled
        };
    }

    /**
     * Deserialize clip from JSON
     */
    public static fromJSON<T = any>(data: any, assetResolver?: (id: string) => T | null): Clip<T> {
        const clip = new Clip<T>({
            id: data.id,
            name: data.name,
            startTime: data.startTime,
            duration: data.duration,
            easeInDuration: data.easeInDuration,
            easeOutDuration: data.easeOutDuration,
            speedMultiplier: data.speedMultiplier,
            blendMode: data.blendMode,
            weight: data.weight,
            clipInOffset: data.clipInOffset,
            properties: data.properties
        });

        clip.enabled = data.enabled ?? true;

        // Resolve asset if resolver provided
        if (assetResolver && data.assetId) {
            clip.asset = assetResolver(data.assetId);
        }

        return clip;
    }
}
