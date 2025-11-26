/**
 * G3D 5.0 Timeline & Cinematics Module - Camera Track
 *
 * Track for camera animation including position, rotation, FOV, look-at targets,
 * camera shake, and depth of field with smooth interpolation.
 */

import { Track, TrackConfig } from '../Track';
import { Clip, ClipConfig, EasingFunction, Easing } from '../Clip';

/**
 * 3D Vector
 */
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Quaternion rotation
 */
export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

/**
 * Camera keyframe
 */
export interface CameraKeyframe {
    /** Time of keyframe */
    time: number;
    /** Camera position */
    position?: Vector3;
    /** Camera rotation (euler angles or quaternion) */
    rotation?: Vector3 | Quaternion;
    /** Look-at target position */
    lookAt?: Vector3;
    /** Field of view */
    fov?: number;
    /** Depth of field settings */
    depthOfField?: {
        enabled: boolean;
        focusDistance: number;
        aperture: number;
        focalLength?: number;
    };
    /** Camera shake intensity */
    shake?: number;
    /** Easing function to next keyframe */
    easing?: EasingFunction;
}

/**
 * Camera asset
 */
export interface CameraAsset {
    /** Camera name */
    name: string;
    /** Keyframes */
    keyframes: CameraKeyframe[];
    /** Default FOV */
    defaultFov?: number;
}

/**
 * Camera clip configuration
 */
export interface CameraClipConfig extends ClipConfig<CameraAsset> {
    /** Interpolation mode */
    interpolation?: 'linear' | 'smooth' | 'step';
    /** Whether to use look-at */
    useLookAt?: boolean;
    /** Look-at target entity ID */
    lookAtTarget?: string;
}

/**
 * Camera clip
 */
export class CameraClip extends Clip<CameraAsset> {
    /** Interpolation mode */
    public interpolation: 'linear' | 'smooth' | 'step';

    /** Whether to use look-at */
    public useLookAt: boolean;

    /** Look-at target entity ID */
    public lookAtTarget: string | null;

    constructor(config: CameraClipConfig) {
        super(config);
        this.interpolation = config.interpolation ?? 'smooth';
        this.useLookAt = config.useLookAt ?? false;
        this.lookAtTarget = config.lookAtTarget ?? null;
    }

    /**
     * Get keyframes from asset
     */
    public getKeyframes(): CameraKeyframe[] {
        return this.asset?.keyframes ?? [];
    }

    /**
     * Add a keyframe
     */
    public addKeyframe(keyframe: CameraKeyframe): void {
        if (this.asset) {
            this.asset.keyframes.push(keyframe);
            this.asset.keyframes.sort((a, b) => a.time - b.time);
        }
    }
}

/**
 * Camera track output
 */
export interface CameraTrackOutput {
    /** Camera position */
    position: Vector3;
    /** Camera rotation */
    rotation: Vector3 | Quaternion;
    /** Field of view */
    fov: number;
    /** Look-at target */
    lookAt?: Vector3;
    /** Depth of field settings */
    depthOfField?: {
        enabled: boolean;
        focusDistance: number;
        aperture: number;
        focalLength?: number;
    };
    /** Camera shake intensity */
    shake: number;
    /** Shake offset (calculated) */
    shakeOffset?: Vector3;
}

/**
 * Camera Track
 *
 * Animates camera properties over time with smooth interpolation.
 * Supports position, rotation, FOV, look-at, depth of field, and shake.
 */
export class CameraTrack extends Track<CameraClip> {
    /** Default field of view */
    public defaultFov: number;

    /** Shake random seed */
    private _shakeSeed: number;

    /** Shake time accumulator */
    private _shakeTime: number;

    constructor(config: TrackConfig = {}) {
        super('camera', config);
        this.defaultFov = 60;
        this._shakeSeed = Math.random() * 1000;
        this._shakeTime = 0;
    }

    /**
     * Create and add a camera clip
     */
    public addCameraClip(config: CameraClipConfig): CameraClip {
        const clip = new CameraClip(config);
        this.addClip(clip);
        return clip;
    }

    /**
     * Add keyframe to a clip
     */
    public addKeyframe(clipId: string, keyframe: CameraKeyframe): boolean {
        const clip = this.getClip(clipId);
        if (clip) {
            clip.addKeyframe(keyframe);
            return true;
        }
        return false;
    }

    /**
     * Process camera track at given time
     */
    public process(time: number, deltaTime: number): CameraTrackOutput | null {
        if (!this.enabled || this.muted) {
            return null;
        }

        const activeClips = this.getClipsAtTime(time);

        if (activeClips.length === 0) {
            return null;
        }

        // Use highest weighted clip
        const clip = activeClips.sort((a, b) =>
            b.getBlendWeight(time) - a.getBlendWeight(time)
        )[0];

        const localTime = clip.getLocalTime(time);
        const keyframes = clip.getKeyframes();

        if (keyframes.length === 0) {
            return null;
        }

        // Find surrounding keyframes
        const { prev, next, t } = this.findKeyframes(keyframes, localTime);

        // Interpolate camera properties
        const output: CameraTrackOutput = {
            position: this.interpolateVector3(
                prev.position,
                next?.position,
                t,
                clip.interpolation,
                next?.easing
            ),
            rotation: this.interpolateRotation(
                prev.rotation,
                next?.rotation,
                t,
                clip.interpolation,
                next?.easing
            ),
            fov: this.interpolateNumber(
                prev.fov ?? this.defaultFov,
                next?.fov ?? this.defaultFov,
                t,
                clip.interpolation,
                next?.easing
            ),
            shake: this.interpolateNumber(
                prev.shake ?? 0,
                next?.shake ?? 0,
                t,
                clip.interpolation,
                next?.easing
            )
        };

        // Handle look-at
        if (clip.useLookAt) {
            if (next?.lookAt) {
                output.lookAt = this.interpolateVector3(
                    prev.lookAt,
                    next.lookAt,
                    t,
                    clip.interpolation,
                    next.easing
                );
            } else if (prev.lookAt) {
                output.lookAt = prev.lookAt;
            }
        }

        // Handle depth of field
        if (prev.depthOfField || next?.depthOfField) {
            output.depthOfField = this.interpolateDepthOfField(
                prev.depthOfField,
                next?.depthOfField,
                t,
                clip.interpolation,
                next?.easing
            );
        }

        // Calculate shake offset
        if (output.shake > 0) {
            this._shakeTime += deltaTime;
            output.shakeOffset = this.calculateShake(output.shake, this._shakeTime);
        }

        return output;
    }

    /**
     * Find keyframes surrounding a given time
     */
    private findKeyframes(
        keyframes: CameraKeyframe[],
        time: number
    ): { prev: CameraKeyframe; next: CameraKeyframe | null; t: number } {
        // Before first keyframe
        if (time <= keyframes[0].time) {
            return { prev: keyframes[0], next: null, t: 0 };
        }

        // After last keyframe
        if (time >= keyframes[keyframes.length - 1].time) {
            return { prev: keyframes[keyframes.length - 1], next: null, t: 1 };
        }

        // Between keyframes
        for (let i = 0; i < keyframes.length - 1; i++) {
            const prev = keyframes[i];
            const next = keyframes[i + 1];

            if (time >= prev.time && time <= next.time) {
                const t = (time - prev.time) / (next.time - prev.time);
                return { prev, next, t };
            }
        }

        return { prev: keyframes[0], next: null, t: 0 };
    }

    /**
     * Interpolate Vector3
     */
    private interpolateVector3(
        from: Vector3 | undefined,
        to: Vector3 | undefined,
        t: number,
        mode: 'linear' | 'smooth' | 'step',
        easing?: EasingFunction
    ): Vector3 {
        if (!from) {
            return to || { x: 0, y: 0, z: 0 };
        }

        if (!to || mode === 'step') {
            return from;
        }

        // Apply easing
        const easedT = easing ? easing(t) : (mode === 'smooth' ? Easing.easeInOutCubic(t) : t);

        return {
            x: from.x + (to.x - from.x) * easedT,
            y: from.y + (to.y - from.y) * easedT,
            z: from.z + (to.z - from.z) * easedT
        };
    }

    /**
     * Interpolate rotation (euler or quaternion)
     */
    private interpolateRotation(
        from: Vector3 | Quaternion | undefined,
        to: Vector3 | Quaternion | undefined,
        t: number,
        mode: 'linear' | 'smooth' | 'step',
        easing?: EasingFunction
    ): Vector3 | Quaternion {
        if (!from) {
            return to || { x: 0, y: 0, z: 0 };
        }

        if (!to || mode === 'step') {
            return from;
        }

        const easedT = easing ? easing(t) : (mode === 'smooth' ? Easing.easeInOutCubic(t) : t);

        // Check if quaternion
        if ('w' in from && 'w' in to) {
            return this.slerpQuaternion(from as Quaternion, to as Quaternion, easedT);
        }

        // Euler angles
        return this.interpolateVector3(from as Vector3, to as Vector3, t, mode, easing);
    }

    /**
     * Interpolate number
     */
    private interpolateNumber(
        from: number,
        to: number,
        t: number,
        mode: 'linear' | 'smooth' | 'step',
        easing?: EasingFunction
    ): number {
        if (mode === 'step') {
            return from;
        }

        const easedT = easing ? easing(t) : (mode === 'smooth' ? Easing.easeInOutCubic(t) : t);
        return from + (to - from) * easedT;
    }

    /**
     * Interpolate depth of field
     */
    private interpolateDepthOfField(
        from: CameraKeyframe['depthOfField'] | undefined,
        to: CameraKeyframe['depthOfField'] | undefined,
        t: number,
        mode: 'linear' | 'smooth' | 'step',
        easing?: EasingFunction
    ): CameraTrackOutput['depthOfField'] {
        if (!from && !to) {
            return undefined;
        }

        if (!to || mode === 'step') {
            return from;
        }

        if (!from) {
            return to;
        }

        const easedT = easing ? easing(t) : (mode === 'smooth' ? Easing.easeInOutCubic(t) : t);

        return {
            enabled: to.enabled,
            focusDistance: from.focusDistance + (to.focusDistance - from.focusDistance) * easedT,
            aperture: from.aperture + (to.aperture - from.aperture) * easedT,
            focalLength: from.focalLength && to.focalLength
                ? from.focalLength + (to.focalLength - from.focalLength) * easedT
                : undefined
        };
    }

    /**
     * Spherical linear interpolation for quaternions
     */
    private slerpQuaternion(from: Quaternion, to: Quaternion, t: number): Quaternion {
        let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;

        // Handle negative dot product
        let to2 = { ...to };
        if (dot < 0) {
            dot = -dot;
            to2 = { x: -to.x, y: -to.y, z: -to.z, w: -to.w };
        }

        // Linear interpolation for very close quaternions
        if (dot > 0.9995) {
            return {
                x: from.x + (to2.x - from.x) * t,
                y: from.y + (to2.y - from.y) * t,
                z: from.z + (to2.z - from.z) * t,
                w: from.w + (to2.w - from.w) * t
            };
        }

        // Slerp
        const theta = Math.acos(dot);
        const sinTheta = Math.sin(theta);
        const a = Math.sin((1 - t) * theta) / sinTheta;
        const b = Math.sin(t * theta) / sinTheta;

        return {
            x: from.x * a + to2.x * b,
            y: from.y * a + to2.y * b,
            z: from.z * a + to2.z * b,
            w: from.w * a + to2.w * b
        };
    }

    /**
     * Calculate procedural camera shake
     */
    private calculateShake(intensity: number, time: number): Vector3 {
        // Use Perlin-like noise for smooth shake
        const seed = this._shakeSeed;
        const frequency = 10;

        return {
            x: (this.noise(time * frequency + seed) * 2 - 1) * intensity,
            y: (this.noise(time * frequency + seed + 100) * 2 - 1) * intensity,
            z: (this.noise(time * frequency + seed + 200) * 2 - 1) * intensity
        };
    }

    /**
     * Simple noise function (simplified Perlin noise)
     */
    private noise(x: number): number {
        const i = Math.floor(x);
        const f = x - i;
        const u = f * f * (3 - 2 * f);

        const a = this.hash(i);
        const b = this.hash(i + 1);

        return a * (1 - u) + b * u;
    }

    /**
     * Hash function for noise
     */
    private hash(x: number): number {
        x = ((x >> 16) ^ x) * 0x45d9f3b;
        x = ((x >> 16) ^ x) * 0x45d9f3b;
        x = (x >> 16) ^ x;
        return (x % 1000) / 1000;
    }

    /**
     * Reset shake
     */
    public resetShake(): void {
        this._shakeTime = 0;
        this._shakeSeed = Math.random() * 1000;
    }

    /**
     * Clone track
     */
    public clone(): CameraTrack {
        const track = new CameraTrack({
            name: this.name + '_clone',
            muted: this.muted,
            locked: this.locked,
            weight: this.weight,
            properties: { ...this.properties }
        });

        track.defaultFov = this.defaultFov;

        for (const clip of this._clips) {
            track.addClip(clip.clone() as CameraClip);
        }

        return track;
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): any {
        const json = super.toJSON();
        json.defaultFov = this.defaultFov;
        return json;
    }
}
