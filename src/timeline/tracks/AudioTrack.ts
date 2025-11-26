/**
 * G3D 5.0 Timeline & Cinematics Module - Audio Track
 *
 * Track for scheduling and playing audio clips with volume/pitch control
 * and spatial audio support.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig } from '../Clip';

/**
 * Audio asset interface
 */
export interface AudioAsset {
    /** Audio buffer or source */
    buffer: any;
    /** Duration in seconds */
    duration: number;
    /** Audio name */
    name?: string;
    /** Default volume */
    volume?: number;
    /** Whether audio loops */
    loop?: boolean;
}

/**
 * Audio clip configuration
 */
export interface AudioClipConfig extends ClipConfig<AudioAsset> {
    /** Volume (0-1) */
    volume?: number;
    /** Pitch multiplier */
    pitch?: number;
    /** Volume curve over time */
    volumeCurve?: Array<{ time: number; value: number }>;
    /** Pitch curve over time */
    pitchCurve?: Array<{ time: number; value: number }>;
    /** Spatial audio position */
    spatialPosition?: { x: number; y: number; z: number };
    /** Whether to use spatial audio */
    useSpatialAudio?: boolean;
    /** Fade in duration */
    fadeIn?: number;
    /** Fade out duration */
    fadeOut?: number;
}

/**
 * Audio clip
 */
export class AudioClip extends Clip<AudioAsset> {
    /** Volume (0-1) */
    public volume: number;

    /** Pitch multiplier */
    public pitch: number;

    /** Volume curve */
    public volumeCurve: Array<{ time: number; value: number }>;

    /** Pitch curve */
    public pitchCurve: Array<{ time: number; value: number }>;

    /** Spatial audio position */
    public spatialPosition: { x: number; y: number; z: number } | null;

    /** Whether to use spatial audio */
    public useSpatialAudio: boolean;

    /** Fade in duration */
    public fadeIn: number;

    /** Fade out duration */
    public fadeOut: number;

    /** Active audio source (runtime) */
    public audioSource: any;

    constructor(config: AudioClipConfig) {
        super(config);
        this.volume = config.volume ?? 1.0;
        this.pitch = config.pitch ?? 1.0;
        this.volumeCurve = config.volumeCurve ?? [];
        this.pitchCurve = config.pitchCurve ?? [];
        this.spatialPosition = config.spatialPosition ?? null;
        this.useSpatialAudio = config.useSpatialAudio ?? false;
        this.fadeIn = config.fadeIn ?? 0;
        this.fadeOut = config.fadeOut ?? 0;
        this.audioSource = null;
    }

    /**
     * Evaluate volume at given local time
     */
    public evaluateVolume(localTime: number): number {
        let volume = this.volume;

        // Apply volume curve
        if (this.volumeCurve.length > 0) {
            volume *= this.evaluateCurve(this.volumeCurve, localTime);
        }

        // Apply fade in
        if (this.fadeIn > 0 && localTime < this.fadeIn) {
            volume *= localTime / this.fadeIn;
        }

        // Apply fade out
        const timeFromEnd = this.duration - localTime;
        if (this.fadeOut > 0 && timeFromEnd < this.fadeOut) {
            volume *= timeFromEnd / this.fadeOut;
        }

        return volume;
    }

    /**
     * Evaluate pitch at given local time
     */
    public evaluatePitch(localTime: number): number {
        if (this.pitchCurve.length === 0) {
            return this.pitch;
        }
        return this.pitch * this.evaluateCurve(this.pitchCurve, localTime);
    }

    /**
     * Evaluate a curve at given time
     */
    private evaluateCurve(curve: Array<{ time: number; value: number }>, time: number): number {
        if (curve.length === 0) {
            return 1.0;
        }

        // Before first keyframe
        if (time <= curve[0].time) {
            return curve[0].value;
        }

        // After last keyframe
        if (time >= curve[curve.length - 1].time) {
            return curve[curve.length - 1].value;
        }

        // Find surrounding keyframes and interpolate
        for (let i = 0; i < curve.length - 1; i++) {
            const k1 = curve[i];
            const k2 = curve[i + 1];

            if (time >= k1.time && time <= k2.time) {
                const t = (time - k1.time) / (k2.time - k1.time);
                return k1.value + (k2.value - k1.value) * t;
            }
        }

        return 1.0;
    }
}

/**
 * Audio track output
 */
export interface AudioTrackOutput {
    /** Active audio clips with playback info */
    activeClips: Array<{
        clip: AudioClip;
        localTime: number;
        volume: number;
        pitch: number;
        shouldPlay: boolean;
        shouldStop: boolean;
    }>;
}

/**
 * Audio Track
 *
 * Manages audio clip playback with crossfading, volume/pitch control,
 * and spatial audio positioning.
 */
export class AudioTrack extends Track<AudioClip> {
    /** Master volume for this track */
    public masterVolume: number;

    /** Master pitch for this track */
    public masterPitch: number;

    /** Whether to use spatial audio */
    public useSpatialAudio: boolean;

    /** Currently playing clips */
    private _playingClips: Set<string>;

    /** Last processed time */
    private _lastTime: number;

    constructor(config: TrackConfig = {}) {
        super('audio', config);
        this.masterVolume = 1.0;
        this.masterPitch = 1.0;
        this.useSpatialAudio = false;
        this._playingClips = new Set();
        this._lastTime = 0;
    }

    /**
     * Create and add an audio clip
     */
    public addAudioClip(config: AudioClipConfig): AudioClip {
        const clip = new AudioClip(config);
        this.addClip(clip);
        return clip;
    }

    /**
     * Process audio track at given time
     */
    public process(time: number, deltaTime: number): AudioTrackOutput {
        const output: AudioTrackOutput = {
            activeClips: []
        };

        if (!this.enabled || this.muted) {
            // Stop all playing clips
            for (const clipId of this._playingClips) {
                const clip = this.getClip(clipId);
                if (clip) {
                    output.activeClips.push({
                        clip,
                        localTime: 0,
                        volume: 0,
                        pitch: 1,
                        shouldPlay: false,
                        shouldStop: true
                    });
                }
            }
            this._playingClips.clear();
            return output;
        }

        const activeClips = this.getClipsAtTime(time);
        const activeClipIds = new Set(activeClips.map(c => c.id));

        // Process active clips
        for (const clip of activeClips) {
            const localTime = clip.getLocalTime(time);
            const volume = clip.evaluateVolume(localTime) * this.masterVolume * this.weight;
            const pitch = clip.evaluatePitch(localTime) * this.masterPitch;

            const wasPlaying = this._playingClips.has(clip.id);
            const shouldPlay = !wasPlaying;
            const shouldStop = false;

            output.activeClips.push({
                clip,
                localTime,
                volume,
                pitch,
                shouldPlay,
                shouldStop
            });

            if (!wasPlaying) {
                this._playingClips.add(clip.id);
            }
        }

        // Stop clips that are no longer active
        for (const clipId of this._playingClips) {
            if (!activeClipIds.has(clipId)) {
                const clip = this.getClip(clipId);
                if (clip) {
                    output.activeClips.push({
                        clip,
                        localTime: 0,
                        volume: 0,
                        pitch: 1,
                        shouldPlay: false,
                        shouldStop: true
                    });
                }
                this._playingClips.delete(clipId);
            }
        }

        this._lastTime = time;

        return output;
    }

    /**
     * Calculate crossfade between overlapping clips
     */
    public calculateCrossfade(clip1: AudioClip, clip2: AudioClip, time: number): number {
        // If clips don't overlap, no crossfade
        if (!clip1.overlaps(clip2)) {
            return 1.0;
        }

        // Calculate overlap region
        const overlapStart = Math.max(clip1.startTime, clip2.startTime);
        const overlapEnd = Math.min(clip1.endTime, clip2.endTime);
        const overlapDuration = overlapEnd - overlapStart;

        if (overlapDuration <= 0) {
            return 1.0;
        }

        // Calculate crossfade amount based on position in overlap
        const overlapTime = time - overlapStart;
        const crossfade = overlapTime / overlapDuration;

        // Clip1 fades out, clip2 fades in
        return clip1.startTime < clip2.startTime ? 1.0 - crossfade : crossfade;
    }

    /**
     * Stop all playing audio
     */
    public stopAll(): void {
        this._playingClips.clear();
    }

    /**
     * Reset track state
     */
    public reset(): void {
        this.stopAll();
        this._lastTime = 0;
    }

    /**
     * Clone track
     */
    public clone(): AudioTrack {
        const track = new AudioTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        track.masterVolume = this.masterVolume;
        track.masterPitch = this.masterPitch;
        track.useSpatialAudio = this.useSpatialAudio;

        for (const clip of this._clips) {
            track.addClip(clip.clone() as AudioClip);
        }

        return track;
    }

    /**
     * Serialize to JSON
     */
    public override toJSON(): any {
        const json = super.toJSON();
        json.masterVolume = this.masterVolume;
        json.masterPitch = this.masterPitch;
        json.useSpatialAudio = this.useSpatialAudio;
        return json;
    }
}
