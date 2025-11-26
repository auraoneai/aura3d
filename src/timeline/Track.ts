/**
 * G3D 5.0 Timeline & Cinematics Module - Track
 *
 * A track is a container for clips on a timeline. Different track types
 * handle different kinds of assets (animations, audio, etc.).
 */

import { Clip, ClipConfig } from './Clip';

/**
 * Configuration for creating a track
 */
export interface TrackConfig {
    /** Unique identifier */
    id?: string;
    /** Display name */
    name?: string;
    /** Track type identifier */
    type?: string;
    /** Whether track is muted */
    muted?: boolean;
    /** Whether track is locked */
    locked?: boolean;
    /** Track weight for blending */
    weight?: number;
    /** Custom properties */
    properties?: Record<string, any>;
}

/**
 * Base track class
 *
 * Tracks contain clips and provide methods for managing them.
 * Subclasses implement specific behavior for different track types.
 */
export abstract class Track<TClip extends Clip = Clip> {
    private static nextId = 0;

    /** Unique identifier */
    public readonly id: string;

    /** Display name */
    public name: string;

    /** Track type identifier */
    public readonly type: string;

    /** Collection of clips on this track */
    protected _clips: TClip[];

    /** Whether this track is muted */
    public muted: boolean;

    /** Whether this track is locked (cannot be edited) */
    public locked: boolean;

    /** Track weight for blending (0-1) */
    public weight: number;

    /** Custom properties */
    public properties: Record<string, any>;

    /** Whether this track is enabled */
    public enabled: boolean;

    constructor(type: string, config: TrackConfig = {}) {
        this.id = config.id || `track_${Track.nextId++}`;
        this.name = config.name || this.id;
        this.type = type;
        this._clips = [];
        this.muted = config.muted ?? false;
        this.locked = config.locked ?? false;
        this.weight = config.weight ?? 1.0;
        this.properties = config.properties ?? {};
        this.enabled = true;
    }

    /**
     * Get all clips on this track
     */
    public get clips(): readonly TClip[] {
        return this._clips;
    }

    /**
     * Get the number of clips
     */
    public get clipCount(): number {
        return this._clips.length;
    }

    /**
     * Add a clip to this track
     *
     * @param clip - Clip to add
     * @returns The added clip
     */
    public addClip(clip: TClip): TClip {
        if (this.locked) {
            throw new Error(`Cannot add clip to locked track: ${this.name}`);
        }

        this._clips.push(clip);
        this.sortClips();
        return clip;
    }

    /**
     * Remove a clip from this track
     *
     * @param clip - Clip to remove
     * @returns True if clip was removed
     */
    public removeClip(clip: TClip): boolean {
        if (this.locked) {
            throw new Error(`Cannot remove clip from locked track: ${this.name}`);
        }

        const index = this._clips.indexOf(clip);
        if (index !== -1) {
            this._clips.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Remove a clip by ID
     *
     * @param clipId - ID of clip to remove
     * @returns True if clip was removed
     */
    public removeClipById(clipId: string): boolean {
        if (this.locked) {
            throw new Error(`Cannot remove clip from locked track: ${this.name}`);
        }

        const index = this._clips.findIndex(c => c.id === clipId);
        if (index !== -1) {
            this._clips.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get a clip by ID
     *
     * @param clipId - Clip ID
     * @returns Clip or null if not found
     */
    public getClip(clipId: string): TClip | null {
        return this._clips.find(c => c.id === clipId) ?? null;
    }

    /**
     * Get a clip by index
     *
     * @param index - Clip index
     * @returns Clip or null if out of bounds
     */
    public getClipAt(index: number): TClip | null {
        if (index >= 0 && index < this._clips.length) {
            return this._clips[index];
        }
        return null;
    }

    /**
     * Get all clips that are active at a given time
     *
     * @param time - Time in seconds
     * @returns Array of active clips
     */
    public getClipsAtTime(time: number): TClip[] {
        return this._clips.filter(clip => clip.enabled && clip.containsTime(time));
    }

    /**
     * Get all clips within a time range
     *
     * @param startTime - Start time
     * @param endTime - End time
     * @returns Array of clips in range
     */
    public getClipsInRange(startTime: number, endTime: number): TClip[] {
        return this._clips.filter(clip => {
            return clip.enabled &&
                   clip.startTime < endTime &&
                   clip.endTime > startTime;
        });
    }

    /**
     * Clear all clips from this track
     */
    public clearClips(): void {
        if (this.locked) {
            throw new Error(`Cannot clear clips from locked track: ${this.name}`);
        }
        this._clips = [];
    }

    /**
     * Sort clips by start time
     */
    protected sortClips(): void {
        this._clips.sort((a, b) => a.startTime - b.startTime);
    }

    /**
     * Process this track at a given time
     * Subclasses should override to implement specific behavior
     *
     * @param time - Current time
     * @param deltaTime - Delta time since last frame
     * @returns Processing result
     */
    public abstract process(time: number, deltaTime: number): any;

    /**
     * Initialize track (called when added to timeline)
     */
    public initialize(): void {
        // Override in subclasses if needed
    }

    /**
     * Cleanup track resources
     */
    public dispose(): void {
        this._clips = [];
    }

    /**
     * Get the total duration of all clips
     */
    public getDuration(): number {
        if (this._clips.length === 0) {
            return 0;
        }
        return Math.max(...this._clips.map(c => c.endTime));
    }

    /**
     * Check if track has any clips
     */
    public hasClips(): boolean {
        return this._clips.length > 0;
    }

    /**
     * Check if track is active at a given time
     *
     * @param time - Time in seconds
     * @returns True if track has active clips
     */
    public isActiveAtTime(time: number): boolean {
        if (!this.enabled || this.muted) {
            return false;
        }
        return this.getClipsAtTime(time).length > 0;
    }

    /**
     * Clone this track
     */
    public abstract clone(): Track<TClip>;

    /**
     * Serialize track to JSON
     */
    public toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: this.properties,
            enabled: this.enabled,
            clips: this._clips.map(c => c.toJSON())
        };
    }

    /**
     * Deserialize track from JSON (helper for subclasses)
     */
    protected loadFromJSON(data: any): void {
        this.name = data.name;
        this.muted = data.muted ?? false;
        this.locked = data.locked ?? false;
        this.weight = data.weight ?? 1.0;
        this.properties = data.properties ?? {};
        this.enabled = data.enabled ?? true;
    }
}

/**
 * Track registry for creating tracks by type
 */
export class TrackRegistry {
    private static factories = new Map<string, () => Track>();

    /**
     * Register a track type
     *
     * @param type - Track type identifier
     * @param factory - Factory function to create track
     */
    public static register(type: string, factory: () => Track): void {
        this.factories.set(type, factory);
    }

    /**
     * Create a track by type
     *
     * @param type - Track type identifier
     * @returns New track instance or null if type not found
     */
    public static create(type: string): Track | null {
        const factory = this.factories.get(type);
        if (factory) {
            return factory();
        }
        return null;
    }

    /**
     * Check if a track type is registered
     *
     * @param type - Track type identifier
     * @returns True if type is registered
     */
    public static has(type: string): boolean {
        return this.factories.has(type);
    }

    /**
     * Get all registered track types
     */
    public static getTypes(): string[] {
        return Array.from(this.factories.keys());
    }
}
