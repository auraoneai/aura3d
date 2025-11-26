/**
 * G3D 5.0 Timeline & Cinematics Module - Signal Emitter
 *
 * Emits signals from tracks with payload data and timing control.
 * Supports repeat handling and emission tracking.
 */

import { SignalAsset } from './SignalAsset';

/**
 * Emission record
 */
export interface EmissionRecord {
    /** Signal asset */
    signal: SignalAsset;
    /** Payload data */
    payload: any;
    /** Time of emission */
    time: number;
    /** Frame count when emitted */
    frame: number;
}

/**
 * Emitter configuration
 */
export interface EmitterConfig {
    /** Signal asset to emit */
    signal?: SignalAsset;
    /** Emit time */
    emitTime?: number;
    /** Payload data */
    payload?: any;
    /** Whether to repeat emission */
    repeat?: boolean;
    /** Repeat interval (if repeat is true) */
    repeatInterval?: number;
}

/**
 * Signal Emitter
 *
 * Emits signals at specific times with optional payloads.
 * Tracks emission history and supports repeating emissions.
 */
export class SignalEmitter {
    /** Signal asset to emit */
    public signal: SignalAsset | null;

    /** Time to emit signal */
    public emitTime: number;

    /** Payload data */
    public payload: any;

    /** Whether to repeat emission */
    public repeat: boolean;

    /** Repeat interval */
    public repeatInterval: number;

    /** Whether signal has been emitted */
    private _emitted: boolean;

    /** Last emission time */
    private _lastEmitTime: number;

    /** Emission count */
    private _emitCount: number;

    /** Emission history */
    private _emissionHistory: EmissionRecord[];

    /** Max history size */
    private _maxHistorySize: number;

    constructor(config: EmitterConfig = {}) {
        this.signal = config.signal || null;
        this.emitTime = config.emitTime ?? 0;
        this.payload = config.payload;
        this.repeat = config.repeat ?? false;
        this.repeatInterval = config.repeatInterval ?? 1.0;
        this._emitted = false;
        this._lastEmitTime = -Infinity;
        this._emitCount = 0;
        this._emissionHistory = [];
        this._maxHistorySize = 100;
    }

    /**
     * Check if emitted
     */
    public get emitted(): boolean {
        return this._emitted;
    }

    /**
     * Get emission count
     */
    public get emitCount(): number {
        return this._emitCount;
    }

    /**
     * Get last emission time
     */
    public get lastEmitTime(): number {
        return this._lastEmitTime;
    }

    /**
     * Get emission history
     */
    public get emissionHistory(): readonly EmissionRecord[] {
        return this._emissionHistory;
    }

    /**
     * Check if should emit at given time
     *
     * @param currentTime - Current time in seconds
     * @param deltaTime - Delta time since last check
     * @returns True if should emit
     */
    public shouldEmit(currentTime: number, deltaTime: number): boolean {
        // Check if we've crossed the emit time
        const previousTime = currentTime - deltaTime;

        if (!this.repeat) {
            // Single emission
            if (!this._emitted && previousTime < this.emitTime && currentTime >= this.emitTime) {
                return true;
            }
            return false;
        } else {
            // Repeating emission
            if (currentTime < this.emitTime) {
                return false; // Haven't reached first emission yet
            }

            // Calculate how many emissions should have occurred
            const timeSinceFirst = currentTime - this.emitTime;
            const expectedEmissions = Math.floor(timeSinceFirst / this.repeatInterval) + 1;

            // Check if we need to emit
            if (this._emitCount < expectedEmissions) {
                return true;
            }

            return false;
        }
    }

    /**
     * Emit the signal
     *
     * @param time - Current time
     * @param frame - Current frame count
     * @returns Emission record
     */
    public emit(time: number, frame: number = 0): EmissionRecord | null {
        if (!this.signal) {
            return null;
        }

        // Validate payload if schema exists
        if (this.payload && this.signal.schema.parameters.length > 0) {
            const validation = this.signal.validate(this.payload);
            if (!validation.valid) {
                console.warn(`Signal payload validation failed: ${validation.errors.join(', ')}`);
            }
        }

        // Create emission record
        const record: EmissionRecord = {
            signal: this.signal,
            payload: this.payload,
            time,
            frame
        };

        // Update state
        this._emitted = true;
        this._lastEmitTime = time;
        this._emitCount++;

        // Add to history
        this._emissionHistory.push(record);

        // Limit history size
        if (this._emissionHistory.length > this._maxHistorySize) {
            this._emissionHistory.shift();
        }

        return record;
    }

    /**
     * Reset emitter state
     */
    public reset(): void {
        this._emitted = false;
        this._lastEmitTime = -Infinity;
        this._emitCount = 0;
    }

    /**
     * Clear emission history
     */
    public clearHistory(): void {
        this._emissionHistory = [];
    }

    /**
     * Set max history size
     */
    public setMaxHistorySize(size: number): void {
        this._maxHistorySize = Math.max(0, size);
        while (this._emissionHistory.length > this._maxHistorySize) {
            this._emissionHistory.shift();
        }
    }

    /**
     * Get time until next emission
     *
     * @param currentTime - Current time
     * @returns Time until next emission, or -1 if no more emissions
     */
    public getTimeUntilNextEmit(currentTime: number): number {
        if (!this.repeat) {
            if (!this._emitted && currentTime < this.emitTime) {
                return this.emitTime - currentTime;
            }
            return -1; // Already emitted or past emit time
        } else {
            if (currentTime < this.emitTime) {
                return this.emitTime - currentTime;
            }

            // Calculate next emission time
            const timeSinceFirst = currentTime - this.emitTime;
            const nextEmissionIndex = Math.floor(timeSinceFirst / this.repeatInterval) + 1;
            const nextEmitTime = this.emitTime + nextEmissionIndex * this.repeatInterval;

            return nextEmitTime - currentTime;
        }
    }

    /**
     * Clone this emitter
     */
    public clone(): SignalEmitter {
        return new SignalEmitter({
            signal: this.signal,
            emitTime: this.emitTime,
            payload: this.payload ? { ...this.payload } : undefined,
            repeat: this.repeat,
            repeatInterval: this.repeatInterval
        });
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): any {
        return {
            signalId: this.signal?.id,
            emitTime: this.emitTime,
            payload: this.payload,
            repeat: this.repeat,
            repeatInterval: this.repeatInterval
        };
    }

    /**
     * Create from JSON
     */
    public static fromJSON(data: any, signalResolver?: (id: string) => SignalAsset | null): SignalEmitter {
        let signal: SignalAsset | null = null;

        if (data.signalId && signalResolver) {
            signal = signalResolver(data.signalId);
        }

        return new SignalEmitter({
            signal,
            emitTime: data.emitTime,
            payload: data.payload,
            repeat: data.repeat,
            repeatInterval: data.repeatInterval
        });
    }
}

/**
 * Signal Emitter Collection
 *
 * Manages multiple signal emitters for a track or timeline.
 */
export class SignalEmitterCollection {
    private _emitters: SignalEmitter[];

    constructor() {
        this._emitters = [];
    }

    /**
     * Get all emitters
     */
    public get emitters(): readonly SignalEmitter[] {
        return this._emitters;
    }

    /**
     * Get emitter count
     */
    public get count(): number {
        return this._emitters.length;
    }

    /**
     * Add an emitter
     */
    public add(emitter: SignalEmitter): void {
        this._emitters.push(emitter);
        this.sort();
    }

    /**
     * Remove an emitter
     */
    public remove(emitter: SignalEmitter): boolean {
        const index = this._emitters.indexOf(emitter);
        if (index !== -1) {
            this._emitters.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get emitter at index
     */
    public get(index: number): SignalEmitter | null {
        return this._emitters[index] || null;
    }

    /**
     * Check emitters at given time and return those that should emit
     *
     * @param currentTime - Current time
     * @param deltaTime - Delta time
     * @returns Array of emitters that should emit
     */
    public checkEmissions(currentTime: number, deltaTime: number): SignalEmitter[] {
        const toEmit: SignalEmitter[] = [];

        for (const emitter of this._emitters) {
            if (emitter.shouldEmit(currentTime, deltaTime)) {
                toEmit.push(emitter);
            }
        }

        return toEmit;
    }

    /**
     * Emit all pending signals
     *
     * @param currentTime - Current time
     * @param deltaTime - Delta time
     * @param frame - Current frame
     * @returns Array of emission records
     */
    public emitPending(currentTime: number, deltaTime: number, frame: number = 0): EmissionRecord[] {
        const records: EmissionRecord[] = [];
        const toEmit = this.checkEmissions(currentTime, deltaTime);

        for (const emitter of toEmit) {
            const record = emitter.emit(currentTime, frame);
            if (record) {
                records.push(record);
            }
        }

        return records;
    }

    /**
     * Reset all emitters
     */
    public reset(): void {
        for (const emitter of this._emitters) {
            emitter.reset();
        }
    }

    /**
     * Clear all emitters
     */
    public clear(): void {
        this._emitters = [];
    }

    /**
     * Sort emitters by emit time
     */
    private sort(): void {
        this._emitters.sort((a, b) => a.emitTime - b.emitTime);
    }

    /**
     * Get emitters in time range
     */
    public getInRange(startTime: number, endTime: number): SignalEmitter[] {
        return this._emitters.filter(e => e.emitTime >= startTime && e.emitTime <= endTime);
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): any {
        return {
            emitters: this._emitters.map(e => e.toJSON())
        };
    }

    /**
     * Create from JSON
     */
    public static fromJSON(data: any, signalResolver?: (id: string) => SignalAsset | null): SignalEmitterCollection {
        const collection = new SignalEmitterCollection();

        if (data.emitters) {
            for (const emitterData of data.emitters) {
                const emitter = SignalEmitter.fromJSON(emitterData, signalResolver);
                collection.add(emitter);
            }
        }

        return collection;
    }
}
