/**
 * G3D 5.0 Timeline & Cinematics Module - Custom Track
 *
 * Base class for user-defined tracks with custom clip types and processing.
 * Provides hooks for serialization and custom behavior.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig } from '../Clip';

/**
 * Custom clip configuration
 */
export interface CustomClipConfig<T = any> extends ClipConfig<T> {
    /** Custom clip type identifier */
    customType?: string;
    /** Custom data */
    customData?: any;
}

/**
 * Custom clip
 */
export class CustomClip<T = any> extends Clip<T> {
    /** Custom clip type identifier */
    public customType: string;

    /** Custom data storage */
    public customData: any;

    constructor(config: CustomClipConfig<T>) {
        super(config);
        this.customType = config.customType || 'custom';
        this.customData = config.customData || {};
    }

    /**
     * Override to implement custom processing
     */
    public processCustom(time: number, deltaTime: number): any {
        return null;
    }

    /**
     * Override to implement custom serialization
     */
    public serializeCustom(): any {
        return {
            customType: this.customType,
            customData: this.customData
        };
    }

    /**
     * Override to implement custom deserialization
     */
    public deserializeCustom(data: any): void {
        this.customType = data.customType || 'custom';
        this.customData = data.customData || {};
    }

    /**
     * Extended JSON serialization
     */
    public toJSON(): any {
        const json = super.toJSON();
        return {
            ...json,
            ...this.serializeCustom()
        };
    }
}

/**
 * Custom track configuration
 */
export interface CustomTrackConfig extends TrackConfig {
    /** Custom track type identifier */
    customType?: string;
    /** Processing callback */
    processCallback?: (track: CustomTrack, time: number, deltaTime: number) => any;
}

/**
 * Custom Track
 *
 * Extensible track type for implementing custom timeline behaviors.
 * Users can subclass this to create specialized track types.
 */
export class CustomTrack<TClip extends CustomClip = CustomClip> extends Track<TClip> {
    /** Custom track type identifier */
    public customType: string;

    /** Optional processing callback */
    public processCallback: ((track: CustomTrack, time: number, deltaTime: number) => any) | null;

    /** Custom state */
    protected _customState: Map<string, any>;

    constructor(config: CustomTrackConfig = {}) {
        super(config.customType || 'custom', config);
        this.customType = config.customType || 'custom';
        this.processCallback = config.processCallback || null;
        this._customState = new Map();
    }

    /**
     * Create and add a custom clip
     */
    public addCustomClip(config: CustomClipConfig): TClip {
        const clip = new CustomClip(config) as TClip;
        this.addClip(clip);
        return clip;
    }

    /**
     * Process custom track at given time
     *
     * Override this method to implement custom processing logic
     */
    public process(time: number, deltaTime: number): any {
        if (!this.enabled || this.muted) {
            return null;
        }

        // Use callback if provided
        if (this.processCallback) {
            return this.processCallback(this, time, deltaTime);
        }

        // Default processing - call processCustom on active clips
        const activeClips = this.getClipsAtTime(time);
        const results: any[] = [];

        for (const clip of activeClips) {
            const result = clip.processCustom(time, deltaTime);
            if (result !== null) {
                results.push(result);
            }
        }

        return this.combineResults(results);
    }

    /**
     * Combine results from multiple clips
     * Override to implement custom blending logic
     */
    protected combineResults(results: any[]): any {
        if (results.length === 0) {
            return null;
        }
        if (results.length === 1) {
            return results[0];
        }
        return results; // Default: return array of all results
    }

    /**
     * Get custom state value
     */
    public getState<T = any>(key: string): T | undefined {
        return this._customState.get(key);
    }

    /**
     * Set custom state value
     */
    public setState(key: string, value: any): void {
        this._customState.set(key, value);
    }

    /**
     * Clear custom state
     */
    public clearState(): void {
        this._customState.clear();
    }

    /**
     * Override to implement custom initialization
     */
    public initialize(): void {
        super.initialize();
        this.onInitialize();
    }

    /**
     * Hook for custom initialization
     */
    protected onInitialize(): void {
        // Override in subclasses
    }

    /**
     * Override to implement custom disposal
     */
    public dispose(): void {
        this.onDispose();
        this._customState.clear();
        super.dispose();
    }

    /**
     * Hook for custom disposal
     */
    protected onDispose(): void {
        // Override in subclasses
    }

    /**
     * Clone track
     */
    public clone(): CustomTrack<TClip> {
        const track = new CustomTrack<TClip>({
            name: this.name + '_clone',
            customType: this.customType,
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties },
            processCallback: this.processCallback
        });

        for (const clip of this._clips) {
            track.addClip(clip.clone() as TClip);
        }

        return track;
    }

    /**
     * Serialize to JSON with custom data
     */
    public toJSON(): any {
        const json = super.toJSON();
        return {
            ...json,
            customType: this.customType,
            customState: Object.fromEntries(this._customState)
        };
    }

    /**
     * Deserialize from JSON
     */
    public static fromJSON(data: any): CustomTrack {
        const track = new CustomTrack({
            id: data.id,
            name: data.name,
            customType: data.customType,
            muted: data.muted,
            locked: data.locked,
            weight: data.weight,
            properties: data.properties
        });

        // Restore custom state
        if (data.customState) {
            for (const [key, value] of Object.entries(data.customState)) {
                track.setState(key, value);
            }
        }

        // Restore clips
        if (data.clips) {
            for (const clipData of data.clips) {
                const clip = new CustomClip(clipData);
                clip.deserializeCustom(clipData);
                track.addClip(clip);
            }
        }

        return track;
    }
}

/**
 * Example: Numeric Value Track
 *
 * A custom track that interpolates numeric values over time.
 */
export class NumericValueTrack extends CustomTrack {
    constructor(config: CustomTrackConfig = {}) {
        super({ ...config, customType: 'numericvalue' });
    }

    /**
     * Process and interpolate numeric values
     */
    public process(time: number, deltaTime: number): number | null {
        const activeClips = this.getClipsAtTime(time);

        if (activeClips.length === 0) {
            return null;
        }

        let totalValue = 0;
        let totalWeight = 0;

        for (const clip of activeClips) {
            const weight = clip.getBlendWeight(time) * this.weight;
            const value = this.evaluateClip(clip, time);

            totalValue += value * weight;
            totalWeight += weight;
        }

        return totalWeight > 0 ? totalValue / totalWeight : 0;
    }

    /**
     * Evaluate a single clip's value
     */
    private evaluateClip(clip: CustomClip, time: number): number {
        // Get value from clip's custom data
        const startValue = clip.customData?.startValue ?? 0;
        const endValue = clip.customData?.endValue ?? 1;

        const normalizedTime = clip.getNormalizedTime(time);
        return startValue + (endValue - startValue) * normalizedTime;
    }

    /**
     * Clone track
     */
    public clone(): NumericValueTrack {
        const track = new NumericValueTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        for (const clip of this._clips) {
            track.addClip(clip.clone());
        }

        return track;
    }
}

/**
 * Example: Color Track
 *
 * A custom track that interpolates colors over time.
 */
export interface Color {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export class ColorTrack extends CustomTrack {
    constructor(config: CustomTrackConfig = {}) {
        super({ ...config, customType: 'color' });
    }

    /**
     * Process and interpolate colors
     */
    public process(time: number, deltaTime: number): Color | null {
        const activeClips = this.getClipsAtTime(time);

        if (activeClips.length === 0) {
            return null;
        }

        let r = 0, g = 0, b = 0, a = 0;
        let totalWeight = 0;

        for (const clip of activeClips) {
            const weight = clip.getBlendWeight(time) * this.weight;
            const color = this.evaluateClip(clip, time);

            r += color.r * weight;
            g += color.g * weight;
            b += color.b * weight;
            a += (color.a ?? 1) * weight;
            totalWeight += weight;
        }

        if (totalWeight === 0) {
            return null;
        }

        return {
            r: r / totalWeight,
            g: g / totalWeight,
            b: b / totalWeight,
            a: a / totalWeight
        };
    }

    /**
     * Evaluate a single clip's color
     */
    private evaluateClip(clip: CustomClip, time: number): Color {
        const startColor: Color = clip.customData?.startColor ?? { r: 0, g: 0, b: 0, a: 1 };
        const endColor: Color = clip.customData?.endColor ?? { r: 1, g: 1, b: 1, a: 1 };

        const t = clip.getNormalizedTime(time);

        return {
            r: startColor.r + (endColor.r - startColor.r) * t,
            g: startColor.g + (endColor.g - startColor.g) * t,
            b: startColor.b + (endColor.b - startColor.b) * t,
            a: (startColor.a ?? 1) + ((endColor.a ?? 1) - (startColor.a ?? 1)) * t
        };
    }

    /**
     * Clone track
     */
    public clone(): ColorTrack {
        const track = new ColorTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        for (const clip of this._clips) {
            track.addClip(clip.clone());
        }

        return track;
    }
}
