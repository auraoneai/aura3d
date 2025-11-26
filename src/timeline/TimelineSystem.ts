/**
 * G3D 5.0 Timeline & Cinematics Module - Timeline System
 *
 * Global system for managing multiple timelines with master time control.
 * Provides frame rate independence and timeline event coordination.
 */

import { Timeline, TimelineEventType } from './Timeline';

/**
 * System event types
 */
export enum SystemEventType {
    /** Timeline registered */
    TimelineRegistered = 'timelineregistered',
    /** Timeline unregistered */
    TimelineUnregistered = 'timelineunregistered',
    /** Global time scale changed */
    TimeScaleChanged = 'timescalechanged',
    /** System paused */
    SystemPaused = 'systempaused',
    /** System resumed */
    SystemResumed = 'systemresumed'
}

/**
 * System event
 */
export interface SystemEvent {
    type: SystemEventType;
    system: TimelineSystem;
    data?: any;
}

/**
 * System event listener
 */
export type SystemEventListener = (event: SystemEvent) => void;

/**
 * Timeline registration entry
 */
interface TimelineEntry {
    timeline: Timeline;
    autoUpdate: boolean;
    priority: number;
}

/**
 * Timeline System
 *
 * Manages all active timelines in the game. Provides:
 * - Global time control
 * - Frame rate independence
 * - Multiple timeline coordination
 * - Master pause/resume
 */
export class TimelineSystem {
    private static _instance: TimelineSystem | null = null;

    /** Registered timelines */
    private _timelines: Map<string, TimelineEntry>;

    /** Sorted timeline array for efficient updates */
    private _sortedTimelines: TimelineEntry[];

    /** Whether sorting is needed */
    private _needsSort: boolean;

    /** Global time scale multiplier */
    private _timeScale: number;

    /** Whether system is paused */
    private _isPaused: boolean;

    /** Last update timestamp */
    private _lastUpdateTime: number;

    /** Accumulated time for fixed timestep */
    private _accumulatedTime: number;

    /** Fixed timestep in seconds (0 = variable) */
    private _fixedTimestep: number;

    /** Maximum allowed delta time */
    private _maxDeltaTime: number;

    /** Total elapsed time */
    private _totalTime: number;

    /** Frame counter */
    private _frameCount: number;

    /** Event listeners */
    private _eventListeners: Map<SystemEventType, SystemEventListener[]>;

    /** Performance metrics */
    private _metrics: {
        lastUpdateDuration: number;
        averageUpdateDuration: number;
        peakUpdateDuration: number;
        totalUpdates: number;
    };

    private constructor() {
        this._timelines = new Map();
        this._sortedTimelines = [];
        this._needsSort = false;
        this._timeScale = 1.0;
        this._isPaused = false;
        this._lastUpdateTime = 0;
        this._accumulatedTime = 0;
        this._fixedTimestep = 0;
        this._maxDeltaTime = 0.1; // 100ms max
        this._totalTime = 0;
        this._frameCount = 0;
        this._eventListeners = new Map();
        this._metrics = {
            lastUpdateDuration: 0,
            averageUpdateDuration: 0,
            peakUpdateDuration: 0,
            totalUpdates: 0
        };
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): TimelineSystem {
        if (!TimelineSystem._instance) {
            TimelineSystem._instance = new TimelineSystem();
        }
        return TimelineSystem._instance;
    }

    /**
     * Get global time scale
     */
    public get timeScale(): number {
        return this._timeScale;
    }

    /**
     * Set global time scale
     */
    public set timeScale(value: number) {
        const oldScale = this._timeScale;
        this._timeScale = Math.max(0, value);
        if (oldScale !== this._timeScale) {
            this.emitEvent(SystemEventType.TimeScaleChanged, {
                oldScale,
                newScale: this._timeScale
            });
        }
    }

    /**
     * Check if system is paused
     */
    public get isPaused(): boolean {
        return this._isPaused;
    }

    /**
     * Get total elapsed time
     */
    public get totalTime(): number {
        return this._totalTime;
    }

    /**
     * Get frame count
     */
    public get frameCount(): number {
        return this._frameCount;
    }

    /**
     * Get fixed timestep (0 = variable timestep)
     */
    public get fixedTimestep(): number {
        return this._fixedTimestep;
    }

    /**
     * Set fixed timestep
     */
    public set fixedTimestep(value: number) {
        this._fixedTimestep = Math.max(0, value);
    }

    /**
     * Get number of registered timelines
     */
    public get timelineCount(): number {
        return this._timelines.size;
    }

    /**
     * Get performance metrics
     */
    public get metrics() {
        return { ...this._metrics };
    }

    /**
     * Register a timeline with the system
     *
     * @param timeline - Timeline to register
     * @param autoUpdate - Whether to auto-update this timeline
     * @param priority - Update priority (higher = earlier)
     * @returns True if registered successfully
     */
    public register(
        timeline: Timeline,
        autoUpdate: boolean = true,
        priority: number = 0
    ): boolean {
        if (this._timelines.has(timeline.id)) {
            return false;
        }

        const entry: TimelineEntry = {
            timeline,
            autoUpdate,
            priority
        };

        this._timelines.set(timeline.id, entry);
        this._needsSort = true;

        this.emitEvent(SystemEventType.TimelineRegistered, { timeline });

        return true;
    }

    /**
     * Unregister a timeline from the system
     *
     * @param timeline - Timeline to unregister
     * @returns True if unregistered successfully
     */
    public unregister(timeline: Timeline): boolean {
        const entry = this._timelines.get(timeline.id);
        if (!entry) {
            return false;
        }

        this._timelines.delete(timeline.id);
        this._needsSort = true;

        this.emitEvent(SystemEventType.TimelineUnregistered, { timeline });

        return true;
    }

    /**
     * Unregister timeline by ID
     */
    public unregisterById(timelineId: string): boolean {
        const entry = this._timelines.get(timelineId);
        if (entry) {
            return this.unregister(entry.timeline);
        }
        return false;
    }

    /**
     * Get a registered timeline by ID
     */
    public getTimeline(timelineId: string): Timeline | null {
        const entry = this._timelines.get(timelineId);
        return entry ? entry.timeline : null;
    }

    /**
     * Get all registered timelines
     */
    public getAllTimelines(): Timeline[] {
        return Array.from(this._timelines.values()).map(e => e.timeline);
    }

    /**
     * Check if a timeline is registered
     */
    public hasTimeline(timeline: Timeline): boolean {
        return this._timelines.has(timeline.id);
    }

    /**
     * Set timeline auto-update
     */
    public setAutoUpdate(timeline: Timeline, autoUpdate: boolean): void {
        const entry = this._timelines.get(timeline.id);
        if (entry) {
            entry.autoUpdate = autoUpdate;
        }
    }

    /**
     * Set timeline priority
     */
    public setPriority(timeline: Timeline, priority: number): void {
        const entry = this._timelines.get(timeline.id);
        if (entry) {
            entry.priority = priority;
            this._needsSort = true;
        }
    }

    /**
     * Update all registered timelines
     *
     * @param deltaTime - Time since last update (optional, uses performance.now if not provided)
     */
    public update(deltaTime?: number): void {
        const startTime = performance.now();

        // Calculate delta time
        let dt: number;
        if (deltaTime !== undefined) {
            dt = deltaTime;
        } else {
            const now = performance.now();
            dt = this._lastUpdateTime > 0 ? (now - this._lastUpdateTime) / 1000 : 0;
            this._lastUpdateTime = now;
        }

        // Clamp delta time
        dt = Math.min(dt, this._maxDeltaTime);

        // Apply global time scale and pause
        if (this._isPaused) {
            dt = 0;
        } else {
            dt *= this._timeScale;
        }

        // Sort timelines if needed
        if (this._needsSort) {
            this.sortTimelines();
        }

        // Fixed timestep handling
        if (this._fixedTimestep > 0) {
            this._accumulatedTime += dt;

            while (this._accumulatedTime >= this._fixedTimestep) {
                this.updateTimelines(this._fixedTimestep);
                this._accumulatedTime -= this._fixedTimestep;
                this._frameCount++;
            }
        } else {
            // Variable timestep
            this.updateTimelines(dt);
            this._frameCount++;
        }

        this._totalTime += dt;

        // Update metrics
        const updateDuration = performance.now() - startTime;
        this._metrics.lastUpdateDuration = updateDuration;
        this._metrics.totalUpdates++;
        this._metrics.averageUpdateDuration =
            (this._metrics.averageUpdateDuration * (this._metrics.totalUpdates - 1) + updateDuration) /
            this._metrics.totalUpdates;
        this._metrics.peakUpdateDuration = Math.max(this._metrics.peakUpdateDuration, updateDuration);
    }

    /**
     * Update all timelines with given delta time
     */
    private updateTimelines(deltaTime: number): void {
        for (const entry of this._sortedTimelines) {
            if (entry.autoUpdate) {
                entry.timeline.update(deltaTime);
            }
        }
    }

    /**
     * Sort timelines by priority
     */
    private sortTimelines(): void {
        this._sortedTimelines = Array.from(this._timelines.values());
        this._sortedTimelines.sort((a, b) => b.priority - a.priority);
        this._needsSort = false;
    }

    /**
     * Pause all timeline updates
     */
    public pause(): void {
        if (!this._isPaused) {
            this._isPaused = true;
            this.emitEvent(SystemEventType.SystemPaused);
        }
    }

    /**
     * Resume all timeline updates
     */
    public resume(): void {
        if (this._isPaused) {
            this._isPaused = false;
            this._lastUpdateTime = performance.now();
            this.emitEvent(SystemEventType.SystemResumed);
        }
    }

    /**
     * Stop all timelines
     */
    public stopAll(): void {
        for (const entry of this._timelines.values()) {
            entry.timeline.stop();
        }
    }

    /**
     * Play all timelines
     */
    public playAll(): void {
        for (const entry of this._timelines.values()) {
            entry.timeline.play();
        }
    }

    /**
     * Pause all timelines
     */
    public pauseAll(): void {
        for (const entry of this._timelines.values()) {
            entry.timeline.pause();
        }
    }

    /**
     * Reset system state
     */
    public reset(): void {
        this.stopAll();
        this._totalTime = 0;
        this._frameCount = 0;
        this._accumulatedTime = 0;
        this._lastUpdateTime = 0;
        this._isPaused = false;
    }

    /**
     * Clear all timelines
     */
    public clear(): void {
        const timelines = Array.from(this._timelines.values());
        for (const entry of timelines) {
            this.unregister(entry.timeline);
        }
    }

    /**
     * Add event listener
     */
    public on(type: SystemEventType, listener: SystemEventListener): void {
        if (!this._eventListeners.has(type)) {
            this._eventListeners.set(type, []);
        }
        this._eventListeners.get(type)!.push(listener);
    }

    /**
     * Remove event listener
     */
    public off(type: SystemEventType, listener: SystemEventListener): void {
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
    private emitEvent(type: SystemEventType, data?: any): void {
        const listeners = this._eventListeners.get(type);
        if (listeners) {
            const event: SystemEvent = { type, system: this, data };
            for (const listener of listeners) {
                listener(event);
            }
        }
    }

    /**
     * Dispose system and cleanup
     */
    public dispose(): void {
        this.clear();
        this._eventListeners.clear();
        TimelineSystem._instance = null;
    }
}
