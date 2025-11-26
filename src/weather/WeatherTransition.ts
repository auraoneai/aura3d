/**
 * Weather state transition system
 * Handles smooth transitions between weather states
 * @module Weather
 */

import { WeatherState } from './WeatherState';

/**
 * Easing function type
 */
export type EasingFunction = (t: number) => number;

/**
 * Common easing functions
 */
export class Easing {
    /** Linear interpolation */
    public static linear(t: number): number {
        return t;
    }

    /** Smooth step (cubic hermite) */
    public static smoothStep(t: number): number {
        return t * t * (3 - 2 * t);
    }

    /** Smoother step (quintic hermite) */
    public static smootherStep(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /** Ease in quadratic */
    public static easeInQuad(t: number): number {
        return t * t;
    }

    /** Ease out quadratic */
    public static easeOutQuad(t: number): number {
        return t * (2 - t);
    }

    /** Ease in-out quadratic */
    public static easeInOutQuad(t: number): number {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    /** Ease in cubic */
    public static easeInCubic(t: number): number {
        return t * t * t;
    }

    /** Ease out cubic */
    public static easeOutCubic(t: number): number {
        const t1 = t - 1;
        return t1 * t1 * t1 + 1;
    }

    /** Ease in-out cubic */
    public static easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }
}

/**
 * Weather transition state
 */
export class WeatherTransition {
    /** Starting weather state */
    private fromState: WeatherState;

    /** Target weather state */
    private toState: WeatherState;

    /** Current interpolated state */
    private currentState: WeatherState;

    /** Transition duration in seconds */
    private duration: number;

    /** Elapsed time in seconds */
    private elapsed: number;

    /** Easing function */
    private easing: EasingFunction;

    /** Whether transition is active */
    private active: boolean;

    /**
     * Creates a new weather transition
     * @param initialState - Initial weather state
     */
    constructor(initialState: WeatherState) {
        this.fromState = initialState.clone();
        this.toState = initialState.clone();
        this.currentState = initialState.clone();
        this.duration = 0;
        this.elapsed = 0;
        this.easing = Easing.smootherStep;
        this.active = false;
    }

    /**
     * Starts a transition to a new weather state
     * @param targetState - Target weather state
     * @param duration - Transition duration in seconds
     * @param easing - Easing function (default: smootherStep)
     */
    public startTransition(
        targetState: WeatherState,
        duration: number,
        easing: EasingFunction = Easing.smootherStep
    ): void {
        this.fromState = this.currentState.clone();
        this.toState = targetState.clone();
        this.duration = Math.max(0.01, duration);
        this.elapsed = 0;
        this.easing = easing;
        this.active = true;
    }

    /**
     * Updates the transition
     * @param deltaTime - Time elapsed since last update in seconds
     * @returns Current interpolated weather state
     */
    public update(deltaTime: number): WeatherState {
        if (!this.active) {
            return this.currentState;
        }

        this.elapsed += deltaTime;

        if (this.elapsed >= this.duration) {
            this.currentState = this.toState.clone();
            this.active = false;
            return this.currentState;
        }

        const t = Math.min(1, this.elapsed / this.duration);
        const easedT = this.easing(t);

        this.currentState = WeatherState.lerp(this.fromState, this.toState, easedT);
        this.currentState.blendFactor = easedT;

        return this.currentState;
    }

    /**
     * Gets the current weather state
     */
    public getCurrentState(): WeatherState {
        return this.currentState;
    }

    /**
     * Gets the target weather state
     */
    public getTargetState(): WeatherState {
        return this.toState;
    }

    /**
     * Checks if transition is active
     */
    public isActive(): boolean {
        return this.active;
    }

    /**
     * Gets transition progress [0-1]
     */
    public getProgress(): number {
        if (!this.active || this.duration <= 0) {
            return 1;
        }
        return Math.min(1, this.elapsed / this.duration);
    }

    /**
     * Gets remaining transition time in seconds
     */
    public getRemainingTime(): number {
        if (!this.active) {
            return 0;
        }
        return Math.max(0, this.duration - this.elapsed);
    }

    /**
     * Immediately completes the transition
     */
    public complete(): void {
        if (this.active) {
            this.currentState = this.toState.clone();
            this.active = false;
            this.elapsed = this.duration;
        }
    }

    /**
     * Cancels the transition and reverts to from state
     */
    public cancel(): void {
        if (this.active) {
            this.currentState = this.fromState.clone();
            this.active = false;
            this.elapsed = 0;
        }
    }

    /**
     * Sets the current state without transition
     * @param state - New weather state
     */
    public setImmediate(state: WeatherState): void {
        this.fromState = state.clone();
        this.toState = state.clone();
        this.currentState = state.clone();
        this.active = false;
        this.elapsed = 0;
    }
}
