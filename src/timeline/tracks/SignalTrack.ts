/**
 * G3D 5.0 Timeline & Cinematics Module - Signal Track
 *
 * Track for emitting signals at specific times with custom payloads.
 * Supports retroactive signal handling and markers.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig } from '../Clip';

/**
 * Signal marker
 */
export interface SignalMarker {
    /** Marker time */
    time: number;
    /** Signal name */
    signal: string;
    /** Signal payload */
    payload?: any;
    /** Whether signal has been emitted */
    emitted?: boolean;
}

/**
 * Signal asset
 */
export interface SignalAsset {
    /** Signal name */
    name: string;
    /** Signal markers */
    markers: SignalMarker[];
}

/**
 * Signal clip configuration
 */
export interface SignalClipConfig extends ClipConfig<SignalAsset> {
    /** Whether to emit retroactive signals when seeking */
    retroactive?: boolean;
    /** Whether to repeat signals on each pass */
    repeat?: boolean;
}

/**
 * Signal clip
 */
export class SignalClip extends Clip<SignalAsset> {
    /** Whether to emit retroactive signals */
    public retroactive: boolean;

    /** Whether to repeat signals */
    public repeat: boolean;

    /** Emitted signal markers */
    private _emittedMarkers: Set<string>;

    constructor(config: SignalClipConfig) {
        super(config);
        this.retroactive = config.retroactive ?? false;
        this.repeat = config.repeat ?? false;
        this._emittedMarkers = new Set();
    }

    /**
     * Get markers from asset
     */
    public getMarkers(): SignalMarker[] {
        return this.asset?.markers ?? [];
    }

    /**
     * Add a marker
     */
    public addMarker(time: number, signal: string, payload?: any): void {
        if (this.asset) {
            this.asset.markers.push({
                time,
                signal,
                payload,
                emitted: false
            });
            this.asset.markers.sort((a, b) => a.time - b.time);
        }
    }

    /**
     * Check and get signals to emit at current time
     */
    public checkSignals(time: number, deltaTime: number, seeking: boolean): SignalMarker[] {
        const markers = this.getMarkers();
        const toEmit: SignalMarker[] = [];

        const localTime = this.getLocalTime(time);
        if (localTime < 0) {
            return toEmit;
        }

        for (const marker of markers) {
            const markerKey = `${marker.time}_${marker.signal}`;

            // Check if marker should fire
            const shouldFire = this.shouldFireMarker(
                marker,
                localTime,
                deltaTime,
                seeking,
                markerKey
            );

            if (shouldFire) {
                toEmit.push(marker);
                if (!this.repeat) {
                    this._emittedMarkers.add(markerKey);
                }
            }
        }

        return toEmit;
    }

    /**
     * Determine if a marker should fire
     */
    private shouldFireMarker(
        marker: SignalMarker,
        localTime: number,
        deltaTime: number,
        seeking: boolean,
        markerKey: string
    ): boolean {
        // Already emitted and not repeating
        if (!this.repeat && this._emittedMarkers.has(markerKey)) {
            return false;
        }

        // Normal playback - fire if we crossed the marker
        if (!seeking) {
            const previousTime = localTime - deltaTime;
            return previousTime < marker.time && localTime >= marker.time;
        }

        // Seeking - fire retroactive if enabled
        if (this.retroactive) {
            return localTime >= marker.time && !this._emittedMarkers.has(markerKey);
        }

        return false;
    }

    /**
     * Reset emitted markers
     */
    public resetMarkers(): void {
        this._emittedMarkers.clear();
    }
}

/**
 * Signal event
 */
export interface SignalEvent {
    /** Signal name */
    signal: string;
    /** Signal payload */
    payload?: any;
    /** Time signal was emitted */
    time: number;
    /** Source clip ID */
    clipId: string;
    /** Source track ID */
    trackId: string;
}

/**
 * Signal track output
 */
export interface SignalTrackOutput {
    /** Emitted signals */
    signals: SignalEvent[];
}

/**
 * Signal callback
 */
export type SignalCallback = (event: SignalEvent) => void;

/**
 * Signal Track
 *
 * Emits signals at specific times during timeline playback.
 * Can be used to trigger events, animations, or other behaviors.
 */
export class SignalTrack extends Track<SignalClip> {
    /** Signal callbacks */
    private _callbacks: Map<string, SignalCallback[]>;

    /** Last processed time */
    private _lastTime: number;

    /** Whether last update was a seek */
    private _wasSeeking: boolean;

    constructor(config: TrackConfig = {}) {
        super('signal', config);
        this._callbacks = new Map();
        this._lastTime = 0;
        this._wasSeeking = false;
    }

    /**
     * Create and add a signal clip
     */
    public addSignalClip(config: SignalClipConfig): SignalClip {
        const clip = new SignalClip(config);
        this.addClip(clip);
        return clip;
    }

    /**
     * Add a signal marker to the track (creates a clip if needed)
     */
    public addMarker(time: number, signal: string, payload?: any): void {
        // Find or create clip at this time
        let clip = this.getClipsAtTime(time)[0];

        if (!clip) {
            // Create a new signal clip
            clip = this.addSignalClip({
                startTime: 0,
                duration: Number.MAX_SAFE_INTEGER,
                asset: {
                    name: 'signals',
                    markers: []
                }
            });
        }

        clip.addMarker(time, signal, payload);
    }

    /**
     * Process signal track at given time
     */
    public process(time: number, deltaTime: number): SignalTrackOutput {
        const output: SignalTrackOutput = {
            signals: []
        };

        if (!this.enabled || this.muted) {
            return output;
        }

        // Detect seeking (large time jump)
        const timeDelta = Math.abs(time - this._lastTime);
        const seeking = timeDelta > deltaTime * 2;

        const activeClips = this.getClipsAtTime(time);

        // Check each clip for signals
        for (const clip of activeClips) {
            const markers = clip.checkSignals(time, deltaTime, seeking);

            for (const marker of markers) {
                const event: SignalEvent = {
                    signal: marker.signal,
                    payload: marker.payload,
                    time,
                    clipId: clip.id,
                    trackId: this.id
                };

                output.signals.push(event);
                this.emitSignal(event);
            }
        }

        this._lastTime = time;
        this._wasSeeking = seeking;

        return output;
    }

    /**
     * Register a signal callback
     *
     * @param signal - Signal name (or '*' for all signals)
     * @param callback - Callback function
     */
    public on(signal: string, callback: SignalCallback): void {
        if (!this._callbacks.has(signal)) {
            this._callbacks.set(signal, []);
        }
        this._callbacks.get(signal)!.push(callback);
    }

    /**
     * Unregister a signal callback
     */
    public off(signal: string, callback: SignalCallback): void {
        const callbacks = this._callbacks.get(signal);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit a signal to callbacks
     */
    private emitSignal(event: SignalEvent): void {
        // Fire specific signal callbacks
        const callbacks = this._callbacks.get(event.signal);
        if (callbacks) {
            for (const callback of callbacks) {
                callback(event);
            }
        }

        // Fire wildcard callbacks
        const wildcardCallbacks = this._callbacks.get('*');
        if (wildcardCallbacks) {
            for (const callback of wildcardCallbacks) {
                callback(event);
            }
        }
    }

    /**
     * Clear all callbacks
     */
    public clearCallbacks(): void {
        this._callbacks.clear();
    }

    /**
     * Get all markers in time range
     */
    public getMarkersInRange(startTime: number, endTime: number): SignalMarker[] {
        const markers: SignalMarker[] = [];

        for (const clip of this._clips) {
            for (const marker of clip.getMarkers()) {
                const markerTime = clip.startTime + marker.time;
                if (markerTime >= startTime && markerTime <= endTime) {
                    markers.push({
                        ...marker,
                        time: markerTime
                    });
                }
            }
        }

        return markers.sort((a, b) => a.time - b.time);
    }

    /**
     * Get all signals
     */
    public getAllSignals(): string[] {
        const signals = new Set<string>();

        for (const clip of this._clips) {
            for (const marker of clip.getMarkers()) {
                signals.add(marker.signal);
            }
        }

        return Array.from(signals);
    }

    /**
     * Reset track state
     */
    public reset(): void {
        for (const clip of this._clips) {
            clip.resetMarkers();
        }
        this._lastTime = 0;
        this._wasSeeking = false;
    }

    /**
     * Clone track
     */
    public clone(): SignalTrack {
        const track = new SignalTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        for (const clip of this._clips) {
            track.addClip(clip.clone() as SignalClip);
        }

        return track;
    }
}

/**
 * Helper to create a simple signal marker clip
 */
export function createSignalMarker(
    time: number,
    signal: string,
    payload?: any,
    retroactive: boolean = false
): SignalClipConfig {
    return {
        startTime: 0,
        duration: Number.MAX_SAFE_INTEGER,
        asset: {
            name: signal,
            markers: [{
                time,
                signal,
                payload,
                emitted: false
            }]
        },
        retroactive
    };
}
