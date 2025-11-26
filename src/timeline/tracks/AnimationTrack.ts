/**
 * G3D 5.0 Timeline & Cinematics Module - Animation Track
 *
 * Track for playing and blending animation clips on characters/entities.
 * Supports root motion extraction and animation events.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig } from '../Clip';

/**
 * Animation event fired during playback
 */
export interface AnimationEvent {
    /** Event name/identifier */
    name: string;
    /** Time in animation */
    time: number;
    /** Event parameters */
    parameters?: Record<string, any>;
}

/**
 * Animation asset interface
 */
export interface AnimationAsset {
    /** Animation name */
    name: string;
    /** Duration in seconds */
    duration: number;
    /** Frame rate */
    frameRate?: number;
    /** Animation events */
    events?: AnimationEvent[];
    /** Custom data */
    data?: any;
}

/**
 * Animation clip configuration
 */
export interface AnimationClipConfig extends ClipConfig<AnimationAsset> {
    /** Avatar/skeleton binding */
    avatarMask?: string[];
    /** Root motion settings */
    applyRootMotion?: boolean;
    /** Mirror animation */
    mirror?: boolean;
}

/**
 * Animation clip
 */
export class AnimationClip extends Clip<AnimationAsset> {
    /** Avatar mask (bones to apply animation to) */
    public avatarMask: string[] | null;

    /** Whether to apply root motion */
    public applyRootMotion: boolean;

    /** Whether to mirror the animation */
    public mirror: boolean;

    /** Fired animation events */
    private _firedEvents: Set<string>;

    constructor(config: AnimationClipConfig) {
        super(config);
        this.avatarMask = config.avatarMask ?? null;
        this.applyRootMotion = config.applyRootMotion ?? false;
        this.mirror = config.mirror ?? false;
        this._firedEvents = new Set();
    }

    /**
     * Reset fired events
     */
    public resetEvents(): void {
        this._firedEvents.clear();
    }

    /**
     * Check and fire animation events at given time
     */
    public checkEvents(time: number, deltaTime: number): AnimationEvent[] {
        if (!this.asset || !this.asset.events) {
            return [];
        }

        const firedEvents: AnimationEvent[] = [];
        const assetTime = this.getAssetTime(time);

        for (const event of this.asset.events) {
            const eventKey = `${event.name}_${event.time}`;

            // Check if event should fire in this frame
            if (assetTime >= event.time &&
                assetTime - deltaTime < event.time &&
                !this._firedEvents.has(eventKey)) {

                this._firedEvents.add(eventKey);
                firedEvents.push(event);
            }
        }

        return firedEvents;
    }
}

/**
 * Root motion data extracted from animation
 */
export interface RootMotion {
    /** Position delta */
    positionDelta: { x: number; y: number; z: number };
    /** Rotation delta (quaternion or euler) */
    rotationDelta: { x: number; y: number; z: number; w?: number };
}

/**
 * Animation track output
 */
export interface AnimationTrackOutput {
    /** Blended animation pose data */
    pose: any;
    /** Root motion if enabled */
    rootMotion?: RootMotion;
    /** Fired animation events */
    events: AnimationEvent[];
}

/**
 * Animation Track
 *
 * Manages animation clip playback with blending support.
 * Handles avatar binding, root motion, and animation events.
 */
export class AnimationTrack extends Track<AnimationClip> {
    /** Target entity/avatar ID */
    public targetId: string | null;

    /** Avatar mask for this track */
    public avatarMask: string[] | null;

    /** Whether to extract root motion */
    public extractRootMotion: boolean;

    /** Last processed time (for event firing) */
    private _lastTime: number;

    /** Animation event callbacks */
    private _eventCallbacks: Map<string, ((event: AnimationEvent) => void)[]>;

    constructor(config: TrackConfig = {}) {
        super('animation', config);
        this.targetId = null;
        this.avatarMask = null;
        this.extractRootMotion = false;
        this._lastTime = 0;
        this._eventCallbacks = new Map();
    }

    /**
     * Create and add an animation clip
     */
    public addAnimationClip(config: AnimationClipConfig): AnimationClip {
        const clip = new AnimationClip(config);
        this.addClip(clip);
        return clip;
    }

    /**
     * Process animation track at given time
     */
    public process(time: number, deltaTime: number): AnimationTrackOutput {
        const output: AnimationTrackOutput = {
            pose: null,
            events: []
        };

        if (!this.enabled || this.muted) {
            return output;
        }

        // Get active clips
        const activeClips = this.getClipsAtTime(time);

        if (activeClips.length === 0) {
            return output;
        }

        // Single clip - no blending needed
        if (activeClips.length === 1) {
            const clip = activeClips[0];
            const weight = clip.getBlendWeight(time) * this.weight;

            output.pose = this.sampleClip(clip, time, weight);

            if (this.extractRootMotion && clip.applyRootMotion) {
                output.rootMotion = this.extractRootMotionFromClip(clip, time, deltaTime);
            }

            // Fire events
            output.events = clip.checkEvents(time, deltaTime);
        } else {
            // Multiple clips - blend them
            output.pose = this.blendClips(activeClips, time, deltaTime);

            // Extract root motion from highest weighted clip with root motion enabled
            if (this.extractRootMotion) {
                const rootMotionClip = activeClips
                    .filter(c => c.applyRootMotion)
                    .sort((a, b) => b.getBlendWeight(time) - a.getBlendWeight(time))[0];

                if (rootMotionClip) {
                    output.rootMotion = this.extractRootMotionFromClip(rootMotionClip, time, deltaTime);
                }
            }

            // Collect events from all active clips
            for (const clip of activeClips) {
                output.events.push(...clip.checkEvents(time, deltaTime));
            }
        }

        // Fire event callbacks
        for (const event of output.events) {
            this.fireEventCallbacks(event);
        }

        this._lastTime = time;

        return output;
    }

    /**
     * Sample a single animation clip
     */
    private sampleClip(clip: AnimationClip, time: number, weight: number): any {
        if (!clip.asset) {
            return null;
        }

        const assetTime = clip.getAssetTime(time);

        // In a real implementation, this would sample the animation data
        // For now, return a simple structure
        return {
            clipId: clip.id,
            animation: clip.asset,
            time: assetTime,
            weight: weight,
            mirror: clip.mirror,
            avatarMask: clip.avatarMask || this.avatarMask
        };
    }

    /**
     * Blend multiple animation clips
     */
    private blendClips(clips: AnimationClip[], time: number, deltaTime: number): any {
        const samples: any[] = [];
        let totalWeight = 0;

        // Sample all clips and calculate total weight
        for (const clip of clips) {
            const weight = clip.getBlendWeight(time) * this.weight;
            if (weight > 0.001) {
                samples.push(this.sampleClip(clip, time, weight));
                totalWeight += weight;
            }
        }

        // Normalize weights
        if (totalWeight > 0) {
            for (const sample of samples) {
                sample.normalizedWeight = sample.weight / totalWeight;
            }
        }

        // Return blended result
        return {
            type: 'blended',
            samples: samples,
            totalWeight: totalWeight
        };
    }

    /**
     * Extract root motion from a clip
     */
    private extractRootMotionFromClip(clip: AnimationClip, time: number, deltaTime: number): RootMotion {
        // In a real implementation, this would calculate the delta from animation data
        // For now, return a placeholder
        return {
            positionDelta: { x: 0, y: 0, z: 0 },
            rotationDelta: { x: 0, y: 0, z: 0, w: 1 }
        };
    }

    /**
     * Register animation event callback
     */
    public onAnimationEvent(eventName: string, callback: (event: AnimationEvent) => void): void {
        if (!this._eventCallbacks.has(eventName)) {
            this._eventCallbacks.set(eventName, []);
        }
        this._eventCallbacks.get(eventName)!.push(callback);
    }

    /**
     * Unregister animation event callback
     */
    public offAnimationEvent(eventName: string, callback: (event: AnimationEvent) => void): void {
        const callbacks = this._eventCallbacks.get(eventName);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Fire event callbacks
     */
    private fireEventCallbacks(event: AnimationEvent): void {
        const callbacks = this._eventCallbacks.get(event.name);
        if (callbacks) {
            for (const callback of callbacks) {
                callback(event);
            }
        }

        // Also fire wildcard callbacks
        const wildcardCallbacks = this._eventCallbacks.get('*');
        if (wildcardCallbacks) {
            for (const callback of wildcardCallbacks) {
                callback(event);
            }
        }
    }

    /**
     * Reset all animation clips
     */
    public reset(): void {
        for (const clip of this._clips) {
            clip.resetEvents();
        }
        this._lastTime = 0;
    }

    /**
     * Clone track
     */
    public clone(): AnimationTrack {
        const track = new AnimationTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        track.targetId = this.targetId;
        track.avatarMask = this.avatarMask ? [...this.avatarMask] : null;
        track.extractRootMotion = this.extractRootMotion;

        for (const clip of this._clips) {
            track.addClip(clip.clone() as AnimationClip);
        }

        return track;
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): any {
        const json = super.toJSON();
        json.targetId = this.targetId;
        json.avatarMask = this.avatarMask;
        json.extractRootMotion = this.extractRootMotion;
        return json;
    }
}
