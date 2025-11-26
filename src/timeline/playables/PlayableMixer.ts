/**
 * G3D 5.0 Timeline & Cinematics Module - Playable Mixer
 *
 * Blends multiple playable inputs with weight-based mixing.
 * Supports additive and override blending modes.
 */

import { Playable, PlayableContext, PlayableOutput } from '../Playable';

/**
 * Blend mode for mixing
 */
export enum BlendMode {
    /** Replace/interpolate between values */
    Override = 'override',
    /** Add values together */
    Additive = 'additive',
    /** Multiply values */
    Multiplicative = 'multiplicative'
}

/**
 * Mixer configuration
 */
export interface MixerConfig {
    /** Number of inputs */
    inputCount?: number;
    /** Blend mode */
    blendMode?: BlendMode;
    /** Whether to normalize weights */
    normalizeWeights?: boolean;
}

/**
 * Playable Mixer
 *
 * Combines multiple playable inputs using weighted blending.
 * Supports different blend modes for various use cases.
 */
export class PlayableMixer<T = any> extends Playable<T> {
    /** Blend mode */
    public blendMode: BlendMode;

    /** Whether to normalize weights to sum to 1.0 */
    public normalizeWeights: boolean;

    /** Custom blend function (overrides blend mode) */
    public customBlendFunction: ((inputs: PlayableOutput<T>[], weights: number[]) => T) | null;

    constructor(config: MixerConfig = {}) {
        super(config.inputCount ?? 0);
        this.blendMode = config.blendMode ?? BlendMode.Override;
        this.normalizeWeights = config.normalizeWeights ?? true;
        this.customBlendFunction = null;
    }

    /**
     * Process frame and blend inputs
     */
    public processFrame(context: PlayableContext): PlayableOutput<T> {
        // Prepare all inputs first
        super.prepareFrame(context);

        // Gather inputs
        const inputs: PlayableOutput<T>[] = [];
        const weights: number[] = [];

        for (let i = 0; i < this.inputCount; i++) {
            const input = this.getInput(i);
            if (input) {
                const output = input.processFrame(context);
                if (output.valid) {
                    inputs.push(output);
                    weights.push(this.getInputWeight(i) * output.weight);
                }
            }
        }

        // No valid inputs
        if (inputs.length === 0) {
            return this.createOutput(null as any, 0, false);
        }

        // Single input - no blending needed
        if (inputs.length === 1) {
            return this.createOutput(inputs[0].value, weights[0]);
        }

        // Normalize weights if enabled
        let normalizedWeights = weights;
        if (this.normalizeWeights) {
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);
            if (totalWeight > 0) {
                normalizedWeights = weights.map(w => w / totalWeight);
            }
        }

        // Blend inputs
        let blendedValue: T;

        if (this.customBlendFunction) {
            blendedValue = this.customBlendFunction(inputs, normalizedWeights);
        } else {
            blendedValue = this.blend(inputs, normalizedWeights);
        }

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        return this.createOutput(blendedValue, Math.min(1.0, totalWeight));
    }

    /**
     * Blend inputs based on blend mode
     */
    protected blend(inputs: PlayableOutput<T>[], weights: number[]): T {
        switch (this.blendMode) {
            case BlendMode.Additive:
                return this.blendAdditive(inputs, weights);

            case BlendMode.Multiplicative:
                return this.blendMultiplicative(inputs, weights);

            case BlendMode.Override:
            default:
                return this.blendOverride(inputs, weights);
        }
    }

    /**
     * Override blending (weighted interpolation)
     */
    protected blendOverride(inputs: PlayableOutput<T>[], weights: number[]): T {
        const first = inputs[0].value;

        // Check value type and blend accordingly
        if (typeof first === 'number') {
            return this.blendNumbers(inputs as PlayableOutput<number>[], weights) as T;
        }

        if (this.isVector(first)) {
            return this.blendVectors(inputs as PlayableOutput<any>[], weights) as T;
        }

        if (this.isQuaternion(first)) {
            return this.blendQuaternions(inputs as PlayableOutput<any>[], weights) as T;
        }

        // Default: return highest weighted input
        const maxWeightIndex = weights.indexOf(Math.max(...weights));
        return inputs[maxWeightIndex].value;
    }

    /**
     * Additive blending
     */
    protected blendAdditive(inputs: PlayableOutput<T>[], weights: number[]): T {
        const first = inputs[0].value;

        if (typeof first === 'number') {
            let sum = 0;
            for (let i = 0; i < inputs.length; i++) {
                sum += (inputs[i].value as number) * weights[i];
            }
            return sum as T;
        }

        if (this.isVector(first)) {
            const result = { x: 0, y: 0, z: 0 };
            for (let i = 0; i < inputs.length; i++) {
                const v = inputs[i].value as any;
                const w = weights[i];
                result.x += v.x * w;
                result.y += v.y * w;
                result.z += v.z * w;
            }
            return result as T;
        }

        // Default: return first input
        return first;
    }

    /**
     * Multiplicative blending
     */
    protected blendMultiplicative(inputs: PlayableOutput<T>[], weights: number[]): T {
        const first = inputs[0].value;

        if (typeof first === 'number') {
            let product = 1;
            for (let i = 0; i < inputs.length; i++) {
                const value = inputs[i].value as number;
                product *= Math.pow(value, weights[i]);
            }
            return product as T;
        }

        // Default: return first input
        return first;
    }

    /**
     * Blend numeric values
     */
    protected blendNumbers(inputs: PlayableOutput<number>[], weights: number[]): number {
        let result = 0;
        for (let i = 0; i < inputs.length; i++) {
            result += inputs[i].value * weights[i];
        }
        return result;
    }

    /**
     * Blend vectors
     */
    protected blendVectors(inputs: PlayableOutput<any>[], weights: number[]): any {
        const result = { x: 0, y: 0, z: 0 };

        for (let i = 0; i < inputs.length; i++) {
            const v = inputs[i].value;
            const w = weights[i];
            result.x += v.x * w;
            result.y += v.y * w;
            result.z += (v.z ?? 0) * w;
        }

        return result;
    }

    /**
     * Blend quaternions using normalized linear interpolation
     */
    protected blendQuaternions(inputs: PlayableOutput<any>[], weights: number[]): any {
        if (inputs.length === 0) {
            return { x: 0, y: 0, z: 0, w: 1 };
        }

        // Start with first quaternion
        let result = { ...inputs[0].value };
        let resultWeight = weights[0];

        // Blend with remaining quaternions
        for (let i = 1; i < inputs.length; i++) {
            const q = inputs[i].value;
            const w = weights[i];

            // Normalize blend weight
            const t = w / (resultWeight + w);

            // Slerp
            result = this.slerp(result, q, t);
            resultWeight += w;
        }

        return result;
    }

    /**
     * Spherical linear interpolation for quaternions
     */
    private slerp(q1: any, q2: any, t: number): any {
        let dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;

        // Handle negative dot product
        let q2Copy = { ...q2 };
        if (dot < 0) {
            dot = -dot;
            q2Copy = { x: -q2.x, y: -q2.y, z: -q2.z, w: -q2.w };
        }

        // Linear interpolation for close quaternions
        if (dot > 0.9995) {
            return {
                x: q1.x + (q2Copy.x - q1.x) * t,
                y: q1.y + (q2Copy.y - q1.y) * t,
                z: q1.z + (q2Copy.z - q1.z) * t,
                w: q1.w + (q2Copy.w - q1.w) * t
            };
        }

        // Slerp
        const theta = Math.acos(dot);
        const sinTheta = Math.sin(theta);
        const a = Math.sin((1 - t) * theta) / sinTheta;
        const b = Math.sin(t * theta) / sinTheta;

        return {
            x: q1.x * a + q2Copy.x * b,
            y: q1.y * a + q2Copy.y * b,
            z: q1.z * a + q2Copy.z * b,
            w: q1.w * a + q2Copy.w * b
        };
    }

    /**
     * Check if value is a vector
     */
    private isVector(value: any): boolean {
        return value && typeof value === 'object' && 'x' in value && 'y' in value;
    }

    /**
     * Check if value is a quaternion
     */
    private isQuaternion(value: any): boolean {
        return value && typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value && 'w' in value;
    }

    /**
     * Set the blend mode
     */
    public setBlendMode(mode: BlendMode): void {
        this.blendMode = mode;
    }

    /**
     * Add an input and return its index
     */
    public addInput(playable: any, weight: number = 1.0): number {
        const index = super.addInput(playable);
        this.setInputWeight(index, weight);
        return index;
    }
}

/**
 * Create a mixer with specific blend mode
 */
export function createMixer<T = any>(
    inputCount: number,
    blendMode: BlendMode = BlendMode.Override,
    normalizeWeights: boolean = true
): PlayableMixer<T> {
    return new PlayableMixer<T>({
        inputCount,
        blendMode,
        normalizeWeights
    });
}

/**
 * Create an additive mixer
 */
export function createAdditiveMixer<T = any>(inputCount: number = 0): PlayableMixer<T> {
    return createMixer<T>(inputCount, BlendMode.Additive, false);
}

/**
 * Create an override mixer (interpolation)
 */
export function createOverrideMixer<T = any>(inputCount: number = 0): PlayableMixer<T> {
    return createMixer<T>(inputCount, BlendMode.Override, true);
}
