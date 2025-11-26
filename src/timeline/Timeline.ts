/**
 * G3D 5.0 Timeline & Cinematics Module - Timeline
 *
 * A timeline is a collection of tracks that can be played back together.
 * Timelines support looping, speed control, and serialization.
 */

import { Track } from './Track';

/**
 * Loop modes for timeline playback
 */
export enum LoopMode {
    /** Play once and stop */
    None = 'none',
    /** Loop from start when reaching end */
    Loop = 'loop',
    /** Reverse direction at ends (bounce) */
    PingPong = 'pingpong'
}

/**
 * Configuration for creating a timeline
 */
export interface TimelineConfig {
    /** Unique identifier */
    id?: string;
    /** Display name */
    name?: string;
    /** Duration in seconds */
    duration?: number;
    /** Loop mode */
    loopMode?: LoopMode;
    /** Playback speed multiplier */
    speed?: number;
    /** Frame rate for timeline (0 = use engine framerate) */
    frameRate?: number;
    /** Custom properties */
    properties?: Record<string, any>;
}

/**
 * Timeline event types
 */
export enum TimelineEventType {
    /** Timeline started playing */
    Started = 'started',
    /** Timeline paused */
    Paused = 'paused',
    /** Timeline stopped */
    Stopped = 'stopped',
    /** Timeline completed */
    Completed = 'completed',
    /** Timeline looped */
    Looped = 'looped',
    /** Time cursor moved */
    TimeChanged = 'timechanged',
    /** Track added */
    TrackAdded = 'trackadded',
    /** Track removed */
    TrackRemoved = 'trackremoved'
}

/**
 * Timeline event
 */
export interface TimelineEvent {
    /** Event type */
    type: TimelineEventType;
    /** Timeline that emitted the event */
    timeline: Timeline;
    /** Event-specific data */
    data?: any;
}

/**
 * Timeline event listener
 */
export type TimelineEventListener = (event: TimelineEvent) => void;

/**
 * Timeline asset
 *
 * A timeline contains tracks that play back in sync. It manages the
 * time cursor, playback state, and track collection.
 */
export class Timeline {
    private static nextId = 0;

    /** Unique identifier */
    public readonly id: string;

    /** Display name */
    public name: string;

    /** Duration in seconds */
    public duration: number;

    /** Loop mode */
    public loopMode: LoopMode;

    /** Playback speed multiplier */
    public speed: number;

    /** Frame rate (0 = use engine framerate) */
    public frameRate: number;

    /** Custom properties */
    public properties: Record<string, any>;

    /** Collection of tracks */
    protected _tracks: Track[];

    /** Current time cursor position */
    protected _time: number;

    /** Whether timeline is playing */
    protected _isPlaying: boolean;

    /** Playback direction (1 = forward, -1 = reverse) */
    protected _direction: number;

    /** Event listeners */
    protected _eventListeners: Map<TimelineEventType, TimelineEventListener[]>;

    /** Last update timestamp for frame independence */
    protected _lastUpdateTime: number;

    constructor(config: TimelineConfig = {}) {
        this.id = config.id || `timeline_${Timeline.nextId++}`;
        this.name = config.name || this.id;
        this.duration = config.duration ?? 10.0;
        this.loopMode = config.loopMode ?? LoopMode.None;
        this.speed = config.speed ?? 1.0;
        this.frameRate = config.frameRate ?? 0;
        this.properties = config.properties ?? {};

        this._tracks = [];
        this._time = 0;
        this._isPlaying = false;
        this._direction = 1;
        this._eventListeners = new Map();
        this._lastUpdateTime = 0;
    }

    /**
     * Get all tracks
     */
    public get tracks(): readonly Track[] {
        return this._tracks;
    }

    /**
     * Get current time
     */
    public get time(): number {
        return this._time;
    }

    /**
     * Set current time
     */
    public set time(value: number) {
        const oldTime = this._time;
        this._time = this.wrapTime(value);

        if (oldTime !== this._time) {
            this.emitEvent(TimelineEventType.TimeChanged, { oldTime, newTime: this._time });
        }
    }

    /**
     * Get normalized time (0-1)
     */
    public get normalizedTime(): number {
        return this.duration > 0 ? this._time / this.duration : 0;
    }

    /**
     * Set normalized time (0-1)
     */
    public set normalizedTime(value: number) {
        this.time = value * this.duration;
    }

    /**
     * Check if timeline is playing
     */
    public get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Get number of tracks
     */
    public get trackCount(): number {
        return this._tracks.length;
    }

    /**
     * Add a track to the timeline
     *
     * @param track - Track to add
     * @returns The added track
     */
    public addTrack(track: Track): Track {
        if (!this._tracks.includes(track)) {
            this._tracks.push(track);
            track.initialize();
            this.emitEvent(TimelineEventType.TrackAdded, { track });
        }
        return track;
    }

    /**
     * Remove a track from the timeline
     *
     * @param track - Track to remove
     * @returns True if track was removed
     */
    public removeTrack(track: Track): boolean {
        const index = this._tracks.indexOf(track);
        if (index !== -1) {
            this._tracks.splice(index, 1);
            track.dispose();
            this.emitEvent(TimelineEventType.TrackRemoved, { track });
            return true;
        }
        return false;
    }

    /**
     * Remove a track by ID
     *
     * @param trackId - ID of track to remove
     * @returns True if track was removed
     */
    public removeTrackById(trackId: string): boolean {
        const track = this.getTrack(trackId);
        if (track) {
            return this.removeTrack(track);
        }
        return false;
    }

    /**
     * Get a track by ID
     *
     * @param trackId - Track ID
     * @returns Track or null if not found
     */
    public getTrack(trackId: string): Track | null {
        return this._tracks.find(t => t.id === trackId) ?? null;
    }

    /**
     * Get a track by index
     *
     * @param index - Track index
     * @returns Track or null if out of bounds
     */
    public getTrackAt(index: number): Track | null {
        if (index >= 0 && index < this._tracks.length) {
            return this._tracks[index];
        }
        return null;
    }

    /**
     * Get tracks by type
     *
     * @param type - Track type
     * @returns Array of matching tracks
     */
    public getTracksByType(type: string): Track[] {
        return this._tracks.filter(t => t.type === type);
    }

    /**
     * Clear all tracks
     */
    public clearTracks(): void {
        const tracks = [...this._tracks];
        for (const track of tracks) {
            this.removeTrack(track);
        }
    }

    /**
     * Update the timeline
     *
     * @param deltaTime - Time since last update in seconds
     */
    public update(deltaTime: number): void {
        if (!this._isPlaying) {
            return;
        }

        // Apply speed and direction
        const scaledDelta = deltaTime * this.speed * this._direction;
        const newTime = this._time + scaledDelta;

        // Handle looping/boundaries
        this.time = newTime;

        // Process all tracks
        for (const track of this._tracks) {
            if (track.enabled && !track.muted) {
                track.process(this._time, deltaTime);
            }
        }

        // Check for completion
        if (this.loopMode === LoopMode.None) {
            if ((this._direction > 0 && this._time >= this.duration) ||
                (this._direction < 0 && this._time <= 0)) {
                this.stop();
                this.emitEvent(TimelineEventType.Completed);
            }
        }
    }

    /**
     * Start or resume playback
     */
    public play(): void {
        if (!this._isPlaying) {
            this._isPlaying = true;
            this._lastUpdateTime = performance.now();
            this.emitEvent(TimelineEventType.Started);
        }
    }

    /**
     * Pause playback
     */
    public pause(): void {
        if (this._isPlaying) {
            this._isPlaying = false;
            this.emitEvent(TimelineEventType.Paused);
        }
    }

    /**
     * Stop playback and reset to start
     */
    public stop(): void {
        if (this._isPlaying) {
            this._isPlaying = false;
        }
        this._time = 0;
        this._direction = 1;
        this.emitEvent(TimelineEventType.Stopped);
    }

    /**
     * Seek to a specific time
     *
     * @param time - Time in seconds
     */
    public seek(time: number): void {
        this.time = time;
    }

    /**
     * Seek to normalized time
     *
     * @param normalizedTime - Time value 0-1
     */
    public seekNormalized(normalizedTime: number): void {
        this.time = normalizedTime * this.duration;
    }

    /**
     * Wrap time according to loop mode
     */
    protected wrapTime(time: number): number {
        if (time < 0) {
            switch (this.loopMode) {
                case LoopMode.Loop:
                    this.emitEvent(TimelineEventType.Looped);
                    return this.duration + (time % this.duration);
                case LoopMode.PingPong:
                    this._direction = 1;
                    return -time;
                default:
                    return 0;
            }
        } else if (time > this.duration) {
            switch (this.loopMode) {
                case LoopMode.Loop:
                    this.emitEvent(TimelineEventType.Looped);
                    return time % this.duration;
                case LoopMode.PingPong:
                    this._direction = -1;
                    return this.duration - (time - this.duration);
                default:
                    return this.duration;
            }
        }
        return time;
    }

    /**
     * Add event listener
     *
     * @param type - Event type
     * @param listener - Listener function
     */
    public on(type: TimelineEventType, listener: TimelineEventListener): void {
        if (!this._eventListeners.has(type)) {
            this._eventListeners.set(type, []);
        }
        this._eventListeners.get(type)!.push(listener);
    }

    /**
     * Remove event listener
     *
     * @param type - Event type
     * @param listener - Listener function
     */
    public off(type: TimelineEventType, listener: TimelineEventListener): void {
        const listeners = this._eventListeners.get(type);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit an event
     */
    protected emitEvent(type: TimelineEventType, data?: any): void {
        const listeners = this._eventListeners.get(type);
        if (listeners) {
            const event: TimelineEvent = { type, timeline: this, data };
            for (const listener of listeners) {
                listener(event);
            }
        }
    }

    /**
     * Calculate actual duration based on all tracks
     */
    public calculateDuration(): number {
        if (this._tracks.length === 0) {
            return this.duration;
        }
        const maxDuration = Math.max(...this._tracks.map(t => t.getDuration()));
        return Math.max(maxDuration, this.duration);
    }

    /**
     * Serialize timeline to JSON
     */
    public toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            duration: this.duration,
            loopMode: this.loopMode,
            speed: this.speed,
            frameRate: this.frameRate,
            properties: this.properties,
            tracks: this._tracks.map(t => t.toJSON())
        };
    }

    /**
     * Dispose timeline and cleanup
     */
    public dispose(): void {
        this.stop();
        this.clearTracks();
        this._eventListeners.clear();
    }
}
