/**
 * G3D 5.0 Timeline & Cinematics Module - Playable Director
 *
 * Controls timeline playback with play, pause, stop, resume, and seeking.
 * Manages playback state and integrates with the timeline system.
 */

import { Timeline, LoopMode, TimelineEventType } from '../Timeline';
import { PlayableGraph } from './PlayableGraph';

/**
 * Playback state
 */
export enum PlaybackState {
    /** Not playing */
    Stopped = 'stopped',
    /** Currently playing */
    Playing = 'playing',
    /** Paused */
    Paused = 'paused'
}

/**
 * Wrap mode (how to handle timeline boundaries)
 */
export enum WrapMode {
    /** Stop at end */
    Once = 'once',
    /** Loop to beginning */
    Loop = 'loop',
    /** Ping-pong between start and end */
    PingPong = 'pingpong',
    /** Hold at end */
    Hold = 'hold'
}

/**
 * Director configuration
 */
export interface DirectorConfig {
    /** Timeline to control */
    timeline: Timeline;
    /** Wrap mode */
    wrapMode?: WrapMode;
    /** Initial time offset */
    initialTime?: number;
    /** Whether to play on start */
    playOnStart?: boolean;
    /** Update mode */
    updateMode?: 'manual' | 'auto';
}

/**
 * Playable Director
 *
 * The main controller for timeline playback. Handles play/pause/stop,
 * time control, and state management.
 */
export class PlayableDirector {
    /** Associated timeline */
    public readonly timeline: Timeline;

    /** Playable graph (optional, for advanced use) */
    public graph: PlayableGraph | null;

    /** Current playback state */
    private _state: PlaybackState;

    /** Wrap mode */
    public wrapMode: WrapMode;

    /** Initial time offset */
    public initialTime: number;

    /** Whether to play on start */
    public playOnStart: boolean;

    /** Update mode */
    public updateMode: 'manual' | 'auto';

    /** Time when playback started */
    private _playbackStartTime: number;

    /** Time offset for pausing/resuming */
    private _timeOffset: number;

    /** Last update time */
    private _lastUpdateTime: number;

    /** Whether director has been initialized */
    private _initialized: boolean;

    /** Event handlers */
    private _eventHandlers: Map<string, ((director: PlayableDirector) => void)[]>;

    constructor(config: DirectorConfig | Timeline) {
        // Handle both config object and timeline-only constructor
        if (config instanceof Timeline) {
            this.timeline = config;
            this.wrapMode = WrapMode.Once;
            this.initialTime = 0;
            this.playOnStart = false;
            this.updateMode = 'manual';
        } else {
            this.timeline = config.timeline;
            this.wrapMode = config.wrapMode ?? WrapMode.Once;
            this.initialTime = config.initialTime ?? 0;
            this.playOnStart = config.playOnStart ?? false;
            this.updateMode = config.updateMode ?? 'manual';
        }

        this.graph = null;
        this._state = PlaybackState.Stopped;
        this._playbackStartTime = 0;
        this._timeOffset = this.initialTime;
        this._lastUpdateTime = 0;
        this._initialized = false;
        this._eventHandlers = new Map();

        // Sync wrap mode with timeline loop mode
        this.syncWrapMode();

        // Listen to timeline events
        this.setupTimelineListeners();
    }

    /**
     * Get current playback state
     */
    public get state(): PlaybackState {
        return this._state;
    }

    /**
     * Get current time
     */
    public get time(): number {
        return this.timeline.time;
    }

    /**
     * Set current time
     */
    public set time(value: number) {
        this.timeline.time = value;
        this._timeOffset = value;
    }

    /**
     * Get duration
     */
    public get duration(): number {
        return this.timeline.duration;
    }

    /**
     * Check if playing
     */
    public get isPlaying(): boolean {
        return this._state === PlaybackState.Playing;
    }

    /**
     * Check if paused
     */
    public get isPaused(): boolean {
        return this._state === PlaybackState.Paused;
    }

    /**
     * Check if stopped
     */
    public get isStopped(): boolean {
        return this._state === PlaybackState.Stopped;
    }

    /**
     * Initialize the director
     */
    public initialize(): void {
        if (this._initialized) {
            return;
        }

        this.timeline.time = this.initialTime;
        this._timeOffset = this.initialTime;
        this._initialized = true;

        if (this.playOnStart) {
            this.play();
        }

        this.emit('initialized');
    }

    /**
     * Start or resume playback
     */
    public play(): void {
        if (!this._initialized) {
            this.initialize();
        }

        if (this._state === PlaybackState.Playing) {
            return;
        }

        const wasPlaying = this._state === PlaybackState.Paused;

        this._state = PlaybackState.Playing;
        this._playbackStartTime = performance.now();
        this._lastUpdateTime = this._playbackStartTime;

        this.timeline.play();

        this.emit(wasPlaying ? 'resumed' : 'played');
    }

    /**
     * Pause playback
     */
    public pause(): void {
        if (this._state !== PlaybackState.Playing) {
            return;
        }

        this._state = PlaybackState.Paused;
        this._timeOffset = this.timeline.time;

        this.timeline.pause();

        this.emit('paused');
    }

    /**
     * Stop playback and reset to initial time
     */
    public stop(): void {
        if (this._state === PlaybackState.Stopped) {
            return;
        }

        this._state = PlaybackState.Stopped;
        this._timeOffset = this.initialTime;

        this.timeline.stop();
        this.timeline.time = this.initialTime;

        this.emit('stopped');
    }

    /**
     * Resume playback (alias for play)
     */
    public resume(): void {
        this.play();
    }

    /**
     * Seek to a specific time
     *
     * @param time - Time in seconds
     */
    public seek(time: number): void {
        this._timeOffset = time;
        this.timeline.seek(time);

        this.emit('seeked');
    }

    /**
     * Seek to normalized time (0-1)
     *
     * @param normalizedTime - Time value 0-1
     */
    public seekNormalized(normalizedTime: number): void {
        this.seek(normalizedTime * this.duration);
    }

    /**
     * Step forward by delta time
     *
     * @param deltaTime - Time to step forward
     */
    public step(deltaTime: number): void {
        this.seek(this.time + deltaTime);
    }

    /**
     * Update the director (call this in your game loop if updateMode is 'manual')
     *
     * @param deltaTime - Optional delta time, otherwise calculated from performance.now()
     */
    public update(deltaTime?: number): void {
        if (!this._initialized) {
            this.initialize();
        }

        if (this._state !== PlaybackState.Playing) {
            return;
        }

        // Calculate delta time if not provided
        let dt: number;
        if (deltaTime !== undefined) {
            dt = deltaTime;
        } else {
            const now = performance.now();
            dt = this._lastUpdateTime > 0 ? (now - this._lastUpdateTime) / 1000 : 0;
            this._lastUpdateTime = now;
        }

        // Update timeline
        this.timeline.update(dt);

        // Check for completion based on wrap mode
        this.handleWrapMode();

        this.emit('updated');
    }

    /**
     * Handle wrap mode logic
     */
    private handleWrapMode(): void {
        const time = this.timeline.time;

        if (this.wrapMode === WrapMode.Once) {
            if (time >= this.duration) {
                this.stop();
                this.emit('completed');
            }
        } else if (this.wrapMode === WrapMode.Hold) {
            if (time >= this.duration) {
                this.pause();
                this.timeline.time = this.duration;
                this.emit('completed');
            }
        }
        // Loop and PingPong are handled by timeline's loop mode
    }

    /**
     * Sync wrap mode with timeline loop mode
     */
    private syncWrapMode(): void {
        switch (this.wrapMode) {
            case WrapMode.Loop:
                this.timeline.loopMode = LoopMode.Loop;
                break;
            case WrapMode.PingPong:
                this.timeline.loopMode = LoopMode.PingPong;
                break;
            default:
                this.timeline.loopMode = LoopMode.None;
                break;
        }
    }

    /**
     * Setup timeline event listeners
     */
    private setupTimelineListeners(): void {
        this.timeline.on(TimelineEventType.Completed, () => {
            if (this.wrapMode === WrapMode.Once) {
                this.stop();
            }
        });
    }

    /**
     * Evaluate the timeline at a specific time without affecting playback
     *
     * @param time - Time to evaluate at
     */
    public evaluate(time: number): void {
        const wasPlaying = this.isPlaying;
        const currentTime = this.time;

        this.pause();
        this.seek(time);

        // Process one frame
        this.timeline.update(0);

        // Restore state
        if (wasPlaying) {
            this.seek(currentTime);
            this.play();
        } else {
            this.seek(currentTime);
        }
    }

    /**
     * Add event listener
     *
     * @param event - Event name
     * @param handler - Handler function
     */
    public on(event: string, handler: (director: PlayableDirector) => void): void {
        if (!this._eventHandlers.has(event)) {
            this._eventHandlers.set(event, []);
        }
        this._eventHandlers.get(event)!.push(handler);
    }

    /**
     * Remove event listener
     *
     * @param event - Event name
     * @param handler - Handler function
     */
    public off(event: string, handler: (director: PlayableDirector) => void): void {
        const handlers = this._eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Emit an event
     */
    private emit(event: string): void {
        const handlers = this._eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(this);
            }
        }
    }

    /**
     * Dispose the director
     */
    public dispose(): void {
        this.stop();
        this._eventHandlers.clear();

        if (this.graph) {
            this.graph.dispose();
            this.graph = null;
        }
    }
}
