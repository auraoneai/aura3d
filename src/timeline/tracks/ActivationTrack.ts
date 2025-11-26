/**
 * G3D 5.0 Timeline & Cinematics Module - Activation Track
 *
 * Track for enabling/disabling entities, visibility, physics, and colliders
 * over time in a timeline.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig } from '../Clip';

/**
 * Activation modes
 */
export enum ActivationMode {
    /** Enable entity */
    Enable = 'enable',
    /** Disable entity */
    Disable = 'disable',
    /** Toggle visibility */
    ToggleVisibility = 'togglevisibility',
    /** Toggle physics */
    TogglePhysics = 'togglephysics',
    /** Toggle collider */
    ToggleCollider = 'togglecollider'
}

/**
 * Activation state
 */
export interface ActivationState {
    /** Whether entity is active */
    active: boolean;
    /** Whether entity is visible */
    visible: boolean;
    /** Whether physics is enabled */
    physicsEnabled: boolean;
    /** Whether collider is enabled */
    colliderEnabled: boolean;
}

/**
 * Activation asset (defines what to activate/deactivate)
 */
export interface ActivationAsset {
    /** Target entity ID */
    targetId: string;
    /** Activation mode */
    mode: ActivationMode;
    /** State to set */
    state: Partial<ActivationState>;
}

/**
 * Activation clip configuration
 */
export interface ActivationClipConfig extends ClipConfig<ActivationAsset> {
    /** State at clip start */
    startState?: Partial<ActivationState>;
    /** State at clip end */
    endState?: Partial<ActivationState>;
    /** Whether to restore previous state when clip ends */
    restoreOnEnd?: boolean;
}

/**
 * Activation clip
 */
export class ActivationClip extends Clip<ActivationAsset> {
    /** State at clip start */
    public startState: Partial<ActivationState>;

    /** State at clip end */
    public endState: Partial<ActivationState>;

    /** Whether to restore previous state when clip ends */
    public restoreOnEnd: boolean;

    /** Previous state (saved when clip starts) */
    private _previousState: Partial<ActivationState> | null;

    /** Whether clip has been activated */
    private _isActivated: boolean;

    constructor(config: ActivationClipConfig) {
        super(config);
        this.startState = config.startState ?? { active: true };
        this.endState = config.endState ?? { active: false };
        this.restoreOnEnd = config.restoreOnEnd ?? false;
        this._previousState = null;
        this._isActivated = false;
    }

    /**
     * Mark clip as activated
     */
    public markActivated(previousState?: Partial<ActivationState>): void {
        this._isActivated = true;
        if (previousState && this.restoreOnEnd) {
            this._previousState = { ...previousState };
        }
    }

    /**
     * Mark clip as deactivated
     */
    public markDeactivated(): void {
        this._isActivated = false;
    }

    /**
     * Get state to restore
     */
    public getRestoreState(): Partial<ActivationState> | null {
        return this._previousState;
    }

    /**
     * Check if clip is currently activated
     */
    public isActivated(): boolean {
        return this._isActivated;
    }

    /**
     * Reset activation state
     */
    public reset(): void {
        this._isActivated = false;
        this._previousState = null;
    }
}

/**
 * Activation track output
 */
export interface ActivationTrackOutput {
    /** State changes to apply */
    stateChanges: Array<{
        targetId: string;
        state: Partial<ActivationState>;
        clipId: string;
    }>;
}

/**
 * Activation Track
 *
 * Controls entity activation, visibility, physics, and colliders over time.
 * Can activate/deactivate objects at specific points in the timeline.
 */
export class ActivationTrack extends Track<ActivationClip> {
    /** Default target entity ID */
    public defaultTargetId: string | null;

    /** Previously active clip IDs */
    private _previousActiveClips: Set<string>;

    /** Entity state cache */
    private _stateCache: Map<string, Partial<ActivationState>>;

    constructor(config: TrackConfig = {}) {
        super('activation', config);
        this.defaultTargetId = null;
        this._previousActiveClips = new Set();
        this._stateCache = new Map();
    }

    /**
     * Create and add an activation clip
     */
    public addActivationClip(config: ActivationClipConfig): ActivationClip {
        const clip = new ActivationClip(config);
        this.addClip(clip);
        return clip;
    }

    /**
     * Process activation track at given time
     */
    public process(time: number, deltaTime: number): ActivationTrackOutput {
        const output: ActivationTrackOutput = {
            stateChanges: []
        };

        if (!this.enabled || this.muted) {
            return output;
        }

        const activeClips = this.getClipsAtTime(time);
        const activeClipIds = new Set(activeClips.map(c => c.id));

        // Process newly activated clips
        for (const clip of activeClips) {
            if (!this._previousActiveClips.has(clip.id)) {
                // Clip just started
                const targetId = clip.asset?.targetId || this.defaultTargetId;
                if (targetId) {
                    // Save current state if needed
                    const currentState = this._stateCache.get(targetId);
                    clip.markActivated(currentState);

                    // Apply start state
                    output.stateChanges.push({
                        targetId,
                        state: clip.startState,
                        clipId: clip.id
                    });

                    // Update cache
                    this._stateCache.set(targetId, {
                        ...currentState,
                        ...clip.startState
                    });
                }
            }
        }

        // Process deactivated clips
        for (const clipId of this._previousActiveClips) {
            if (!activeClipIds.has(clipId)) {
                // Clip just ended
                const clip = this.getClip(clipId);
                if (clip && clip.isActivated()) {
                    const targetId = clip.asset?.targetId || this.defaultTargetId;
                    if (targetId) {
                        // Determine what state to apply
                        let stateToApply: Partial<ActivationState>;

                        if (clip.restoreOnEnd && clip.getRestoreState()) {
                            // Restore previous state
                            stateToApply = clip.getRestoreState()!;
                        } else {
                            // Apply end state
                            stateToApply = clip.endState;
                        }

                        output.stateChanges.push({
                            targetId,
                            state: stateToApply,
                            clipId: clip.id
                        });

                        // Update cache
                        this._stateCache.set(targetId, {
                            ...this._stateCache.get(targetId),
                            ...stateToApply
                        });

                        clip.markDeactivated();
                    }
                }
            }
        }

        // Update previous active clips
        this._previousActiveClips = activeClipIds;

        return output;
    }

    /**
     * Get current state for a target
     */
    public getState(targetId: string): Partial<ActivationState> | null {
        return this._stateCache.get(targetId) || null;
    }

    /**
     * Set state for a target
     */
    public setState(targetId: string, state: Partial<ActivationState>): void {
        this._stateCache.set(targetId, state);
    }

    /**
     * Clear state cache
     */
    public clearStateCache(): void {
        this._stateCache.clear();
    }

    /**
     * Reset track state
     */
    public reset(): void {
        for (const clip of this._clips) {
            clip.reset();
        }
        this._previousActiveClips.clear();
        this._stateCache.clear();
    }

    /**
     * Clone track
     */
    public clone(): ActivationTrack {
        const track = new ActivationTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        track.defaultTargetId = this.defaultTargetId;

        for (const clip of this._clips) {
            track.addClip(clip.clone() as ActivationClip);
        }

        return track;
    }

    /**
     * Serialize to JSON
     */
    public override toJSON(): any {
        const json = super.toJSON();
        json.defaultTargetId = this.defaultTargetId;
        return json;
    }
}

/**
 * Helper function to create simple enable/disable clip
 */
export function createEnableClip(
    startTime: number,
    duration: number,
    targetId?: string
): ActivationClipConfig {
    return {
        startTime,
        duration,
        asset: targetId ? {
            targetId,
            mode: ActivationMode.Enable,
            state: { active: true }
        } : undefined,
        startState: { active: true },
        endState: { active: false },
        restoreOnEnd: true
    };
}

/**
 * Helper function to create visibility toggle clip
 */
export function createVisibilityClip(
    startTime: number,
    duration: number,
    visible: boolean,
    targetId?: string
): ActivationClipConfig {
    return {
        startTime,
        duration,
        asset: targetId ? {
            targetId,
            mode: ActivationMode.ToggleVisibility,
            state: { visible }
        } : undefined,
        startState: { visible },
        endState: { visible: !visible },
        restoreOnEnd: true
    };
}
