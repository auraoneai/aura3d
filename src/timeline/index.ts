/**
 * G3D 5.0 Timeline & Cinematics Module - Main Exports
 *
 * A complete timeline and cinematics system for game development.
 * Supports multi-track timelines, animation blending, camera control,
 * audio sequencing, and event-driven interactions.
 *
 * @module Timeline
 * @author G3D Engine Team
 * @version 5.0.0
 */

// Core Timeline
export * from './TimelineSystem';
export * from './Timeline';
export * from './Track';
export * from './Clip';
export * from './Playable';

// Track Types
export * from './tracks';

// Playables
export * from './playables';

// Signals
export * from './signals';

// Re-export commonly used types and utilities
import { TimelineSystem } from './TimelineSystem';
import { Timeline, LoopMode, TimelineEventType } from './Timeline';
import { PlayableDirector, PlaybackState, WrapMode } from './playables/PlayableDirector';
import { SignalReceiver, createSignalReceiver } from './signals/SignalReceiver';
import { createSignalAsset, createParameter, ParameterType } from './signals/SignalAsset';
import { AnimationTrack } from './tracks/AnimationTrack';
import { AudioTrack } from './tracks/AudioTrack';
import { ActivationTrack, createEnableClip, createVisibilityClip } from './tracks/ActivationTrack';
import { ControlTrack, createTimelineControlClip, createParticleControlClip } from './tracks/ControlTrack';
import { CameraTrack } from './tracks/CameraTrack';
import { SignalTrack, createSignalMarker } from './tracks/SignalTrack';
import { CustomTrack, NumericValueTrack, ColorTrack } from './tracks/CustomTrack';
import { Easing } from './Clip';

/**
 * Convenience namespace for timeline utilities
 */
export const TimelineUtils = {
    // System
    getSystem: () => TimelineSystem.getInstance(),

    // Track creation helpers
    createAnimationTrack: () => new AnimationTrack(),
    createAudioTrack: () => new AudioTrack(),
    createActivationTrack: () => new ActivationTrack(),
    createControlTrack: () => new ControlTrack(),
    createCameraTrack: () => new CameraTrack(),
    createSignalTrack: () => new SignalTrack(),
    createCustomTrack: () => new CustomTrack(),
    createNumericValueTrack: () => new NumericValueTrack(),
    createColorTrack: () => new ColorTrack(),

    // Clip helpers
    createEnableClip,
    createVisibilityClip,
    createTimelineControlClip,
    createParticleControlClip,
    createSignalMarker,

    // Signal helpers
    createSignalAsset,
    createParameter,
    createSignalReceiver,

    // Easing functions
    Easing,

    // Enums
    LoopMode,
    WrapMode,
    PlaybackState,
    TimelineEventType,
    ParameterType
};

/**
 * Quick start helper to create a complete timeline setup
 */
export function createTimelineSetup(config?: {
    duration?: number;
    loopMode?: LoopMode;
    autoRegister?: boolean;
}) {
    const timeline = new Timeline({
        duration: config?.duration ?? 10,
        loopMode: config?.loopMode ?? LoopMode.None
    });

    const director = new PlayableDirector(timeline);

    if (config?.autoRegister ?? true) {
        const system = TimelineSystem.getInstance();
        system.register(timeline);
    }

    return {
        timeline,
        director,
        system: TimelineSystem.getInstance(),

        // Convenience methods
        addAnimationTrack: () => {
            const track = new AnimationTrack();
            timeline.addTrack(track);
            return track;
        },

        addAudioTrack: () => {
            const track = new AudioTrack();
            timeline.addTrack(track);
            return track;
        },

        addCameraTrack: () => {
            const track = new CameraTrack();
            timeline.addTrack(track);
            return track;
        },

        addSignalTrack: () => {
            const track = new SignalTrack();
            timeline.addTrack(track);
            return track;
        },

        play: () => director.play(),
        pause: () => director.pause(),
        stop: () => director.stop(),
        seek: (time: number) => director.seek(time)
    };
}

/**
 * Default export for convenience
 */
export default {
    TimelineSystem,
    Timeline,
    PlayableDirector,
    TimelineUtils,
    createTimelineSetup
};
