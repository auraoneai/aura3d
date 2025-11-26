/**
 * G3D 5.0 Timeline & Cinematics Module - Playable Interface
 *
 * Defines the core interface for playable objects in the timeline system.
 * Playables represent nodes in the playable graph that can process frames
 * and output results.
 */

/**
 * State of a playable during execution
 */
export enum PlayableState {
    /** Playable has not been initialized */
    Uninitialized = 'uninitialized',
    /** Playable is ready but not playing */
    Ready = 'ready',
    /** Playable is currently playing */
    Playing = 'playing',
    /** Playable is paused */
    Paused = 'paused',
    /** Playable has finished */
    Finished = 'finished',
    /** Playable encountered an error */
    Error = 'error'
}

/**
 * Output from a playable node
 */
export interface PlayableOutput<T = any> {
    /** Output value from the playable */
    value: T;
    /** Weight of this output (0-1) */
    weight: number;
    /** Whether this output is valid */
    valid: boolean;
    /** Timestamp of this output */
    timestamp: number;
}

/**
 * Context provided to playables during frame processing
 */
export interface PlayableContext {
    /** Current time in seconds */
    time: number;
    /** Delta time since last frame */
    deltaTime: number;
    /** Frame count */
    frameCount: number;
    /** Playback speed multiplier */
    speed: number;
    /** Whether playing in reverse */
    reverse: boolean;
    /** User data */
    userData?: Record<string, any>;
}

/**
 * Core interface for playable objects
 *
 * Playables are the building blocks of the timeline system. They can
 * represent animations, audio, control sequences, or any time-based behavior.
 */
export interface IPlayable<T = any> {
    /** Unique identifier for this playable */
    readonly id: string;

    /** Current state of the playable */
    readonly state: PlayableState;

    /** Duration of the playable in seconds */
    readonly duration: number;

    /** Number of input connections */
    readonly inputCount: number;

    /** Number of output connections */
    readonly outputCount: number;

    /**
     * Prepare the playable for frame processing
     * Called before ProcessFrame to allow setup
     *
     * @param context - Playable context
     */
    prepareFrame(context: PlayableContext): void;

    /**
     * Process a frame at the given time
     *
     * @param context - Playable context
     * @returns Output from this playable
     */
    processFrame(context: PlayableContext): PlayableOutput<T>;

    /**
     * Get the weight of an input connection
     *
     * @param index - Input index
     * @returns Weight value (0-1)
     */
    getInputWeight(index: number): number;

    /**
     * Set the weight of an input connection
     *
     * @param index - Input index
     * @param weight - Weight value (0-1)
     */
    setInputWeight(index: number, weight: number): void;

    /**
     * Get an input playable
     *
     * @param index - Input index
     * @returns Input playable or null
     */
    getInput(index: number): IPlayable | null;

    /**
     * Set an input playable
     *
     * @param index - Input index
     * @param playable - Input playable
     */
    setInput(index: number, playable: IPlayable): void;

    /**
     * Add an input connection
     *
     * @param playable - Playable to connect
     * @returns Index of the new input
     */
    addInput(playable: IPlayable): number;

    /**
     * Remove an input connection
     *
     * @param index - Input index to remove
     */
    removeInput(index: number): void;

    /**
     * Initialize the playable
     */
    initialize(): void;

    /**
     * Cleanup and release resources
     */
    dispose(): void;

    /**
     * Reset the playable to its initial state
     */
    reset(): void;
}

/**
 * Base implementation of IPlayable
 *
 * Provides common functionality for playable objects.
 */
export abstract class Playable<T = any> implements IPlayable<T> {
    private static nextId = 0;

    public readonly id: string;
    protected _state: PlayableState = PlayableState.Uninitialized;
    protected _duration: number = 0;
    protected _inputs: (IPlayable | null)[] = [];
    protected _inputWeights: number[] = [];

    constructor(inputCount: number = 0, duration: number = 0) {
        this.id = `playable_${Playable.nextId++}`;
        this._duration = duration;

        // Initialize inputs
        for (let i = 0; i < inputCount; i++) {
            this._inputs.push(null);
            this._inputWeights.push(1.0);
        }
    }

    public get state(): PlayableState {
        return this._state;
    }

    public get duration(): number {
        return this._duration;
    }

    public get inputCount(): number {
        return this._inputs.length;
    }

    public get outputCount(): number {
        return 1; // Most playables have single output
    }

    public getInputWeight(index: number): number {
        if (index < 0 || index >= this._inputWeights.length) {
            return 0;
        }
        return this._inputWeights[index];
    }

    public setInputWeight(index: number, weight: number): void {
        if (index >= 0 && index < this._inputWeights.length) {
            this._inputWeights[index] = Math.max(0, Math.min(1, weight));
        }
    }

    public getInput(index: number): IPlayable | null {
        if (index < 0 || index >= this._inputs.length) {
            return null;
        }
        return this._inputs[index];
    }

    public setInput(index: number, playable: IPlayable): void {
        if (index >= 0 && index < this._inputs.length) {
            this._inputs[index] = playable;
        }
    }

    public addInput(playable: IPlayable): number {
        this._inputs.push(playable);
        this._inputWeights.push(1.0);
        return this._inputs.length - 1;
    }

    public removeInput(index: number): void {
        if (index >= 0 && index < this._inputs.length) {
            this._inputs.splice(index, 1);
            this._inputWeights.splice(index, 1);
        }
    }

    public initialize(): void {
        this._state = PlayableState.Ready;
    }

    public dispose(): void {
        this._inputs = [];
        this._inputWeights = [];
        this._state = PlayableState.Finished;
    }

    public reset(): void {
        this._state = PlayableState.Ready;
    }

    /**
     * Prepare for frame processing (can be overridden)
     */
    public prepareFrame(context: PlayableContext): void {
        // Prepare all inputs
        for (const input of this._inputs) {
            if (input) {
                input.prepareFrame(context);
            }
        }
    }

    /**
     * Process a frame (must be implemented by subclasses)
     */
    public abstract processFrame(context: PlayableContext): PlayableOutput<T>;

    /**
     * Create a default output
     */
    protected createOutput(value: T, weight: number = 1.0, valid: boolean = true): PlayableOutput<T> {
        return {
            value,
            weight,
            valid,
            timestamp: performance.now()
        };
    }
}

/**
 * Helper function to create a playable context
 */
export function createPlayableContext(
    time: number,
    deltaTime: number,
    frameCount: number = 0,
    speed: number = 1.0,
    reverse: boolean = false,
    userData?: Record<string, any>
): PlayableContext {
    return {
        time,
        deltaTime,
        frameCount,
        speed,
        reverse,
        userData
    };
}
