/**
 * G3D 5.0 Profiling & Debugging Module
 *
 * Main profiler singleton for the G3D engine.
 * Provides global profiling control, frame timing collection, and sample recording.
 * Designed for minimal overhead (<0.1ms) when disabled.
 *
 * @module Profiling
 */

import { ProfilerSession } from './ProfilerSession';
import { FrameTimer } from './FrameTimer';

/**
 * Profiler configuration options
 */
export interface ProfilerConfig {
    /** Enable profiling on startup */
    enabled?: boolean;
    /** Maximum number of frames to keep in history */
    maxFrameHistory?: number;
    /** Maximum depth for nested markers */
    maxDepth?: number;
    /** Enable GPU profiling (requires WebGL2) */
    enableGPU?: boolean;
    /** Enable memory profiling */
    enableMemory?: boolean;
}

/**
 * Profile scope data
 */
export interface ProfileScope {
    /** Scope name */
    name: string;
    /** Start time in milliseconds */
    startTime: number;
    /** End time in milliseconds */
    endTime: number;
    /** Duration in milliseconds */
    duration: number;
    /** Parent scope index */
    parentIndex: number;
    /** Depth level */
    depth: number;
    /** Category */
    category: string;
    /** Custom metadata */
    metadata?: Record<string, any>;
}

/**
 * Frame profile data
 */
export interface FrameProfile {
    /** Frame number */
    frameNumber: number;
    /** Frame start time */
    startTime: number;
    /** Frame end time */
    endTime: number;
    /** Frame duration */
    duration: number;
    /** All scopes in this frame */
    scopes: ProfileScope[];
    /** Counter values */
    counters: Map<string, number>;
}

/**
 * Global profiler singleton.
 * Manages profiling sessions, frame timing, and sample recording.
 *
 * @example
 * ```typescript
 * // Enable profiling
 * Profiler.enable();
 *
 * // Begin a profile scope
 * Profiler.beginScope('Render');
 * // ... rendering code ...
 * Profiler.endScope('Render');
 *
 * // Get current session
 * const session = Profiler.getSession();
 * ```
 */
export class Profiler {
    private static instance: Profiler | null = null;

    private enabled: boolean = false;
    private recording: boolean = false;
    private currentSession: ProfilerSession | null = null;
    private frameTimer: FrameTimer;
    private config: ProfilerConfig;

    // Current frame data
    private currentFrame: FrameProfile | null = null;
    private currentScopes: ProfileScope[] = [];
    private scopeStack: number[] = [];
    private frameNumber: number = 0;

    // Performance optimization
    private noopFunction = () => {};

    /**
     * Private constructor for singleton pattern
     */
    private constructor(config: ProfilerConfig = {}) {
        this.config = {
            enabled: false,
            maxFrameHistory: 300,
            maxDepth: 32,
            enableGPU: false,
            enableMemory: true,
            ...config
        };

        this.frameTimer = new FrameTimer({
            historySize: this.config.maxFrameHistory || 300
        });

        this.enabled = this.config.enabled || false;
    }

    /**
     * Get the global profiler instance
     */
    public static getInstance(config?: ProfilerConfig): Profiler {
        if (!Profiler.instance) {
            Profiler.instance = new Profiler(config);
        }
        return Profiler.instance;
    }

    /**
     * Enable profiling globally
     */
    public static enable(): void {
        const instance = Profiler.getInstance();
        instance.enabled = true;
    }

    /**
     * Disable profiling globally
     */
    public static disable(): void {
        const instance = Profiler.getInstance();
        instance.enabled = false;
    }

    /**
     * Check if profiling is enabled
     */
    public static isEnabled(): boolean {
        return Profiler.getInstance().enabled;
    }

    /**
     * Start a new profiling session
     */
    public static startSession(name: string = 'Profile Session'): ProfilerSession {
        const instance = Profiler.getInstance();

        instance.currentSession = new ProfilerSession({
            name,
            maxFrames: instance.config.maxFrameHistory
        });

        instance.recording = true;
        instance.frameNumber = 0;
        instance.currentScopes = [];
        instance.scopeStack = [];

        instance.currentSession.start();

        return instance.currentSession;
    }

    /**
     * Stop the current profiling session
     */
    public static stopSession(): ProfilerSession | null {
        const instance = Profiler.getInstance();

        if (instance.currentSession) {
            instance.currentSession.stop();
            instance.recording = false;
        }

        return instance.currentSession;
    }

    /**
     * Get the current profiling session
     */
    public static getSession(): ProfilerSession | null {
        return Profiler.getInstance().currentSession;
    }

    /**
     * Begin a new frame
     */
    public static beginFrame(): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording) {
            return;
        }

        instance.frameTimer.beginFrame();

        instance.currentFrame = {
            frameNumber: instance.frameNumber++,
            startTime: performance.now(),
            endTime: 0,
            duration: 0,
            scopes: [],
            counters: new Map()
        };

        instance.currentScopes = [];
        instance.scopeStack = [];
    }

    /**
     * End the current frame
     */
    public static endFrame(): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording || !instance.currentFrame) {
            return;
        }

        instance.frameTimer.endFrame();

        instance.currentFrame.endTime = performance.now();
        instance.currentFrame.duration = instance.currentFrame.endTime - instance.currentFrame.startTime;
        instance.currentFrame.scopes = [...instance.currentScopes];

        if (instance.currentSession) {
            instance.currentSession.addFrame(instance.currentFrame);
        }

        instance.currentFrame = null;
    }

    /**
     * Begin a profile scope
     */
    public static beginScope(name: string, category: string = 'default'): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording || !instance.currentFrame) {
            return;
        }

        const depth = instance.scopeStack.length;

        if (depth >= (instance.config.maxDepth || 32)) {
            console.warn(`Profiler: Maximum depth ${instance.config.maxDepth} exceeded`);
            return;
        }

        const parentIndex = instance.scopeStack.length > 0
            ? instance.scopeStack[instance.scopeStack.length - 1]
            : -1;

        const scope: ProfileScope = {
            name,
            startTime: performance.now(),
            endTime: 0,
            duration: 0,
            parentIndex,
            depth,
            category
        };

        const scopeIndex = instance.currentScopes.length;
        instance.currentScopes.push(scope);
        instance.scopeStack.push(scopeIndex);
    }

    /**
     * End a profile scope
     */
    public static endScope(name: string): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording || !instance.currentFrame) {
            return;
        }

        if (instance.scopeStack.length === 0) {
            console.warn(`Profiler: No scope to end for "${name}"`);
            return;
        }

        const scopeIndex = instance.scopeStack.pop()!;
        const scope = instance.currentScopes[scopeIndex];

        if (scope.name !== name) {
            console.warn(`Profiler: Scope mismatch. Expected "${scope.name}", got "${name}"`);
        }

        scope.endTime = performance.now();
        scope.duration = scope.endTime - scope.startTime;
    }

    /**
     * Add metadata to the current scope
     */
    public static addScopeMetadata(key: string, value: any): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording || instance.scopeStack.length === 0) {
            return;
        }

        const scopeIndex = instance.scopeStack[instance.scopeStack.length - 1];
        const scope = instance.currentScopes[scopeIndex];

        if (!scope.metadata) {
            scope.metadata = {};
        }

        scope.metadata[key] = value;
    }

    /**
     * Increment a counter
     */
    public static incrementCounter(name: string, value: number = 1): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording || !instance.currentFrame) {
            return;
        }

        const current = instance.currentFrame.counters.get(name) || 0;
        instance.currentFrame.counters.set(name, current + value);
    }

    /**
     * Set a counter value
     */
    public static setCounter(name: string, value: number): void {
        const instance = Profiler.getInstance();

        if (!instance.enabled || !instance.recording || !instance.currentFrame) {
            return;
        }

        instance.currentFrame.counters.set(name, value);
    }

    /**
     * Get a counter value
     */
    public static getCounter(name: string): number {
        const instance = Profiler.getInstance();

        if (!instance.currentFrame) {
            return 0;
        }

        return instance.currentFrame.counters.get(name) || 0;
    }

    /**
     * Get the frame timer
     */
    public static getFrameTimer(): FrameTimer {
        return Profiler.getInstance().frameTimer;
    }

    /**
     * Get current FPS
     */
    public static getFPS(): number {
        return Profiler.getInstance().frameTimer.getFPS();
    }

    /**
     * Get average frame time
     */
    public static getAverageFrameTime(): number {
        return Profiler.getInstance().frameTimer.getAverageFrameTime();
    }

    /**
     * Reset the profiler
     */
    public static reset(): void {
        const instance = Profiler.getInstance();

        instance.currentSession = null;
        instance.recording = false;
        instance.currentFrame = null;
        instance.currentScopes = [];
        instance.scopeStack = [];
        instance.frameNumber = 0;
        instance.frameTimer.reset();
    }
}

/**
 * Profile scope macro for automatic scope management
 *
 * @example
 * ```typescript
 * function render() {
 *   PROFILE_SCOPE('Render');
 *   // ... code ...
 * }
 * ```
 */
export function PROFILE_SCOPE(name: string, category: string = 'default'): () => void {
    Profiler.beginScope(name, category);
    return () => Profiler.endScope(name);
}

/**
 * Profile function decorator
 *
 * @example
 * ```typescript
 * class Renderer {
 *   @ProfileFunction()
 *   render() {
 *     // ... code ...
 *   }
 * }
 * ```
 */
export function ProfileFunction(category: string = 'default') {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            Profiler.beginScope(`${target.constructor.name}.${propertyKey}`, category);
            try {
                return originalMethod.apply(this, args);
            } finally {
                Profiler.endScope(`${target.constructor.name}.${propertyKey}`);
            }
        };

        return descriptor;
    };
}
