/**
 * G3D 5.0 Timeline & Cinematics Module - Control Track
 *
 * Track for controlling nested timelines, particle systems, prefab
 * instantiation, and other entity manipulations.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig } from '../Clip';
import { Timeline } from '../Timeline';

/**
 * Control types
 */
export enum ControlType {
    /** Control a nested timeline */
    Timeline = 'timeline',
    /** Control a particle system */
    ParticleSystem = 'particlesystem',
    /** Instantiate a prefab */
    Prefab = 'prefab',
    /** Generic entity control */
    Entity = 'entity'
}

/**
 * Control command
 */
export interface ControlCommand {
    /** Command type */
    type: string;
    /** Command parameters */
    parameters?: Record<string, any>;
}

/**
 * Control asset
 */
export interface ControlAsset {
    /** Type of control */
    controlType: ControlType;
    /** Target object reference */
    target: any;
    /** Target ID for serialization */
    targetId?: string;
    /** Control commands */
    commands?: ControlCommand[];
}

/**
 * Control clip configuration
 */
export interface ControlClipConfig extends ClipConfig<ControlAsset> {
    /** Commands to execute on clip start */
    onStart?: ControlCommand[];
    /** Commands to execute on clip end */
    onEnd?: ControlCommand[];
    /** Time offset for controlled timeline */
    timeOffset?: number;
    /** Whether to control time (for nested timelines) */
    controlTime?: boolean;
}

/**
 * Control clip
 */
export class ControlClip extends Clip<ControlAsset> {
    /** Commands to execute on clip start */
    public onStart: ControlCommand[];

    /** Commands to execute on clip end */
    public onEnd: ControlCommand[];

    /** Time offset for controlled timeline */
    public timeOffset: number;

    /** Whether to control time */
    public controlTime: boolean;

    /** Whether clip has started */
    private _hasStarted: boolean;

    /** Whether clip has ended */
    private _hasEnded: boolean;

    /** Controlled object instance */
    private _controlledObject: any;

    constructor(config: ControlClipConfig) {
        super(config);
        this.onStart = config.onStart ?? [];
        this.onEnd = config.onEnd ?? [];
        this.timeOffset = config.timeOffset ?? 0;
        this.controlTime = config.controlTime ?? true;
        this._hasStarted = false;
        this._hasEnded = false;
        this._controlledObject = null;
    }

    /**
     * Mark as started
     */
    public markStarted(controlledObject?: any): void {
        this._hasStarted = true;
        this._hasEnded = false;
        if (controlledObject) {
            this._controlledObject = controlledObject;
        }
    }

    /**
     * Mark as ended
     */
    public markEnded(): void {
        this._hasEnded = true;
    }

    /**
     * Check if started
     */
    public hasStarted(): boolean {
        return this._hasStarted;
    }

    /**
     * Check if ended
     */
    public hasEnded(): boolean {
        return this._hasEnded;
    }

    /**
     * Get controlled object
     */
    public getControlledObject(): any {
        return this._controlledObject;
    }

    /**
     * Reset state
     */
    public reset(): void {
        this._hasStarted = false;
        this._hasEnded = false;
        this._controlledObject = null;
    }
}

/**
 * Control track output
 */
export interface ControlTrackOutput {
    /** Control actions to execute */
    actions: Array<{
        clipId: string;
        type: ControlType;
        target: any;
        action: 'start' | 'update' | 'end';
        time?: number;
        commands?: ControlCommand[];
    }>;
}

/**
 * Control Track
 *
 * Controls other objects like timelines, particle systems, and prefabs.
 * Allows nested timeline playback and synchronized control of complex systems.
 */
export class ControlTrack extends Track<ControlClip> {
    /** Registry of controllable objects */
    private _objectRegistry: Map<string, any>;

    /** Previously active clips */
    private _previousActiveClips: Set<string>;

    constructor(config: TrackConfig = {}) {
        super('control', config);
        this._objectRegistry = new Map();
        this._previousActiveClips = new Set();
    }

    /**
     * Create and add a control clip
     */
    public addControlClip(config: ControlClipConfig): ControlClip {
        const clip = new ControlClip(config);
        this.addClip(clip);
        return clip;
    }

    /**
     * Register a controllable object
     */
    public registerObject(id: string, object: any): void {
        this._objectRegistry.set(id, object);
    }

    /**
     * Unregister a controllable object
     */
    public unregisterObject(id: string): void {
        this._objectRegistry.delete(id);
    }

    /**
     * Get a registered object
     */
    public getObject(id: string): any {
        return this._objectRegistry.get(id);
    }

    /**
     * Process control track at given time
     */
    public process(time: number, deltaTime: number): ControlTrackOutput {
        const output: ControlTrackOutput = {
            actions: []
        };

        if (!this.enabled || this.muted) {
            return output;
        }

        const activeClips = this.getClipsAtTime(time);
        const activeClipIds = new Set(activeClips.map(c => c.id));

        // Process newly started clips
        for (const clip of activeClips) {
            if (!clip.hasStarted() || !this._previousActiveClips.has(clip.id)) {
                this.handleClipStart(clip, output);
            } else {
                // Update ongoing clips
                this.handleClipUpdate(clip, time, deltaTime, output);
            }
        }

        // Process ended clips
        for (const clipId of this._previousActiveClips) {
            if (!activeClipIds.has(clipId)) {
                const clip = this.getClip(clipId);
                if (clip && clip.hasStarted() && !clip.hasEnded()) {
                    this.handleClipEnd(clip, output);
                }
            }
        }

        this._previousActiveClips = activeClipIds;

        return output;
    }

    /**
     * Handle clip start
     */
    private handleClipStart(clip: ControlClip, output: ControlTrackOutput): void {
        if (!clip.asset) {
            return;
        }

        // Get or create controlled object
        let target = clip.asset.target;
        if (!target && clip.asset.targetId) {
            target = this._objectRegistry.get(clip.asset.targetId);
        }

        if (!target) {
            // Try to instantiate based on control type
            target = this.instantiateTarget(clip.asset);
        }

        if (!target) {
            return;
        }

        clip.markStarted(target);

        output.actions.push({
            clipId: clip.id,
            type: clip.asset.controlType,
            target,
            action: 'start',
            commands: clip.onStart
        });

        // Execute start commands
        this.executeCommands(target, clip.onStart);
    }

    /**
     * Handle clip update
     */
    private handleClipUpdate(
        clip: ControlClip,
        time: number,
        deltaTime: number,
        output: ControlTrackOutput
    ): void {
        const target = clip.getControlledObject();
        if (!target || !clip.asset) {
            return;
        }

        // Calculate local time for controlled object
        const localTime = clip.getLocalTime(time);
        const controlTime = clip.timeOffset + localTime;

        output.actions.push({
            clipId: clip.id,
            type: clip.asset.controlType,
            target,
            action: 'update',
            time: controlTime
        });

        // Update controlled object based on type
        if (clip.controlTime) {
            if (clip.asset.controlType === ControlType.Timeline && target.seek) {
                target.seek(controlTime);
            }
        }
    }

    /**
     * Handle clip end
     */
    private handleClipEnd(clip: ControlClip, output: ControlTrackOutput): void {
        const target = clip.getControlledObject();
        if (!target || !clip.asset) {
            return;
        }

        clip.markEnded();

        output.actions.push({
            clipId: clip.id,
            type: clip.asset.controlType,
            target,
            action: 'end',
            commands: clip.onEnd
        });

        // Execute end commands
        this.executeCommands(target, clip.onEnd);
    }

    /**
     * Instantiate a target based on control type
     */
    private instantiateTarget(asset: ControlAsset): any {
        switch (asset.controlType) {
            case ControlType.Timeline:
                // Would instantiate a timeline
                return null;

            case ControlType.ParticleSystem:
                // Would instantiate a particle system
                return null;

            case ControlType.Prefab:
                // Would instantiate a prefab
                return null;

            default:
                return null;
        }
    }

    /**
     * Execute control commands
     */
    private executeCommands(target: any, commands: ControlCommand[]): void {
        for (const command of commands) {
            switch (command.type) {
                case 'play':
                    if (target.play) target.play();
                    break;

                case 'pause':
                    if (target.pause) target.pause();
                    break;

                case 'stop':
                    if (target.stop) target.stop();
                    break;

                case 'emit':
                    if (target.emit) target.emit(command.parameters);
                    break;

                case 'setProperty':
                    if (command.parameters?.property && command.parameters?.value !== undefined) {
                        target[command.parameters.property] = command.parameters.value;
                    }
                    break;

                case 'callMethod':
                    if (command.parameters?.method && target[command.parameters.method]) {
                        target[command.parameters.method](...(command.parameters.args || []));
                    }
                    break;
            }
        }
    }

    /**
     * Reset track state
     */
    public reset(): void {
        for (const clip of this._clips) {
            clip.reset();
        }
        this._previousActiveClips.clear();
    }

    /**
     * Clone track
     */
    public clone(): ControlTrack {
        const track = new ControlTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        for (const clip of this._clips) {
            track.addClip(clip.clone() as ControlClip);
        }

        return track;
    }
}

/**
 * Helper to create timeline control clip
 */
export function createTimelineControlClip(
    startTime: number,
    duration: number,
    timeline: Timeline,
    timeOffset: number = 0
): ControlClipConfig {
    return {
        startTime,
        duration,
        asset: {
            controlType: ControlType.Timeline,
            target: timeline,
            targetId: timeline.id
        },
        timeOffset,
        controlTime: true,
        onStart: [{ type: 'play' }],
        onEnd: [{ type: 'stop' }]
    };
}

/**
 * Helper to create particle system control clip
 */
export function createParticleControlClip(
    startTime: number,
    duration: number,
    particleSystem: any
): ControlClipConfig {
    return {
        startTime,
        duration,
        asset: {
            controlType: ControlType.ParticleSystem,
            target: particleSystem
        },
        onStart: [{ type: 'emit' }],
        onEnd: [{ type: 'stop' }]
    };
}
