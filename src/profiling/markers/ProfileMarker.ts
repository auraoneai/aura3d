/**
 * Profile markers for named timing sections
 *
 * Provides named timing markers with hierarchical support,
 * color coding, and category tagging.
 */

import { Profiler } from '../Profiler';

/**
 * Marker color for visualization
 */
export enum MarkerColor {
    RED = '#FF4444',
    ORANGE = '#FF8844',
    YELLOW = '#FFCC44',
    GREEN = '#44FF44',
    CYAN = '#44FFFF',
    BLUE = '#4444FF',
    PURPLE = '#FF44FF',
    PINK = '#FF88CC',
    GRAY = '#888888',
    WHITE = '#FFFFFF'
}

/**
 * Marker category
 */
export enum MarkerCategory {
    RENDERING = 'rendering',
    PHYSICS = 'physics',
    ANIMATION = 'animation',
    AI = 'ai',
    AUDIO = 'audio',
    INPUT = 'input',
    NETWORKING = 'networking',
    SCRIPTING = 'scripting',
    UI = 'ui',
    LOADING = 'loading',
    CUSTOM = 'custom'
}

/**
 * Profile marker configuration
 */
export interface ProfileMarkerConfig {
    /** Marker name */
    name: string;
    /** Marker category */
    category?: MarkerCategory | string;
    /** Marker color */
    color?: MarkerColor | string;
    /** Custom metadata */
    metadata?: Record<string, any>;
}

/**
 * Active marker state
 */
interface ActiveMarker {
    name: string;
    category: string;
    color: string;
    startTime: number;
    metadata?: Record<string, any>;
}

/**
 * Profile marker for named timing sections.
 * Supports hierarchical markers, color coding, and category tagging.
 *
 * @example
 * ```typescript
 * // Simple marker
 * ProfileMarker.begin('Render');
 * // ... code ...
 * ProfileMarker.end('Render');
 *
 * // With category and color
 * ProfileMarker.begin('Shadow Pass', {
 *   category: MarkerCategory.RENDERING,
 *   color: MarkerColor.BLUE
 * });
 * // ... code ...
 * ProfileMarker.end('Shadow Pass');
 *
 * // Nested markers
 * ProfileMarker.begin('Frame');
 *   ProfileMarker.begin('Update');
 *   ProfileMarker.end('Update');
 *   ProfileMarker.begin('Render');
 *   ProfileMarker.end('Render');
 * ProfileMarker.end('Frame');
 * ```
 */
export class ProfileMarker {
    private static activeMarkers: Map<string, ActiveMarker> = new Map();
    private static markerStack: string[] = [];

    // Category color mapping
    private static categoryColors: Map<string, string> = new Map([
        [MarkerCategory.RENDERING, MarkerColor.BLUE],
        [MarkerCategory.PHYSICS, MarkerColor.GREEN],
        [MarkerCategory.ANIMATION, MarkerColor.ORANGE],
        [MarkerCategory.AI, MarkerColor.PURPLE],
        [MarkerCategory.AUDIO, MarkerColor.CYAN],
        [MarkerCategory.INPUT, MarkerColor.YELLOW],
        [MarkerCategory.NETWORKING, MarkerColor.PINK],
        [MarkerCategory.SCRIPTING, MarkerColor.RED],
        [MarkerCategory.UI, MarkerColor.WHITE],
        [MarkerCategory.LOADING, MarkerColor.GRAY],
        [MarkerCategory.CUSTOM, MarkerColor.WHITE]
    ]);

    /**
     * Begin a profile marker
     */
    public static begin(name: string, config?: Partial<ProfileMarkerConfig>): void {
        const category = config?.category || MarkerCategory.CUSTOM;
        const color = config?.color || ProfileMarker.categoryColors.get(category) || MarkerColor.WHITE;

        const marker: ActiveMarker = {
            name,
            category,
            color,
            startTime: performance.now(),
            metadata: config?.metadata
        };

        ProfileMarker.activeMarkers.set(name, marker);
        ProfileMarker.markerStack.push(name);

        // Also register with global profiler
        Profiler.beginScope(name, category);

        if (config?.metadata) {
            for (const [key, value] of Object.entries(config.metadata)) {
                Profiler.addScopeMetadata(key, value);
            }
        }
    }

    /**
     * End a profile marker
     */
    public static end(name: string): number {
        const marker = ProfileMarker.activeMarkers.get(name);

        if (!marker) {
            console.warn(`ProfileMarker: No active marker found for "${name}"`);
            return 0;
        }

        // Check if this is the top of the stack
        if (ProfileMarker.markerStack.length > 0) {
            const topMarker = ProfileMarker.markerStack[ProfileMarker.markerStack.length - 1];
            if (topMarker !== name) {
                console.warn(`ProfileMarker: Marker mismatch. Expected "${topMarker}", got "${name}"`);
            }
            ProfileMarker.markerStack.pop();
        }

        const endTime = performance.now();
        const duration = endTime - marker.startTime;

        ProfileMarker.activeMarkers.delete(name);

        // Also end in global profiler
        Profiler.endScope(name);

        return duration;
    }

    /**
     * Create a scoped marker that automatically ends
     */
    public static scoped(name: string, config?: Partial<ProfileMarkerConfig>): () => void {
        ProfileMarker.begin(name, config);
        return () => ProfileMarker.end(name);
    }

    /**
     * Check if a marker is active
     */
    public static isActive(name: string): boolean {
        return ProfileMarker.activeMarkers.has(name);
    }

    /**
     * Get the current marker stack depth
     */
    public static getStackDepth(): number {
        return ProfileMarker.markerStack.length;
    }

    /**
     * Get the current marker stack
     */
    public static getStack(): ReadonlyArray<string> {
        return ProfileMarker.markerStack;
    }

    /**
     * Get color for a category
     */
    public static getCategoryColor(category: string): string {
        return ProfileMarker.categoryColors.get(category) || MarkerColor.WHITE;
    }

    /**
     * Set color for a category
     */
    public static setCategoryColor(category: string, color: string): void {
        ProfileMarker.categoryColors.set(category, color);
    }

    /**
     * Clear all active markers
     */
    public static clear(): void {
        ProfileMarker.activeMarkers.clear();
        ProfileMarker.markerStack = [];
    }

    /**
     * Measure a function execution
     */
    public static measure<T>(
        name: string,
        fn: () => T,
        config?: Partial<ProfileMarkerConfig>
    ): T {
        ProfileMarker.begin(name, config);
        try {
            return fn();
        } finally {
            ProfileMarker.end(name);
        }
    }

    /**
     * Measure an async function execution
     */
    public static async measureAsync<T>(
        name: string,
        fn: () => Promise<T>,
        config?: Partial<ProfileMarkerConfig>
    ): Promise<T> {
        ProfileMarker.begin(name, config);
        try {
            return await fn();
        } finally {
            ProfileMarker.end(name);
        }
    }
}

/**
 * Decorator for profiling methods
 */
export function ProfileMethod(config?: Partial<ProfileMarkerConfig>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const name = config?.name || `${target.constructor.name}.${propertyKey}`;
            const markerConfig = {
                ...config,
                name
            };

            return ProfileMarker.measure(name, () => originalMethod.apply(this, args), markerConfig);
        };

        return descriptor;
    };
}

/**
 * Decorator for profiling async methods
 */
export function ProfileAsyncMethod(config?: Partial<ProfileMarkerConfig>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const name = config?.name || `${target.constructor.name}.${propertyKey}`;
            const markerConfig = {
                ...config,
                name
            };

            return ProfileMarker.measureAsync(name, () => originalMethod.apply(this, args), markerConfig);
        };

        return descriptor;
    };
}
