/**
 * RAII-style scope markers for automatic timing
 *
 * Provides automatic scope timing that ends when the scope exits,
 * supports nested scopes, and tracks the scope stack.
 */

import { ProfileMarker, ProfileMarkerConfig } from './ProfileMarker';

/**
 * RAII-style scope marker.
 * Automatically ends the timing when the scope exits or dispose() is called.
 *
 * @example
 * ```typescript
 * function render() {
 *   const scope = new ScopeMarker('Render');
 *   // ... code ...
 *   // Automatically ends when scope exits
 * }
 *
 * // Or use with explicit disposal
 * const scope = new ScopeMarker('Update');
 * try {
 *   // ... code ...
 * } finally {
 *   scope.dispose();
 * }
 *
 * // Using with-style pattern
 * using(new ScopeMarker('Physics'), () => {
 *   // ... code ...
 * });
 * ```
 */
export class ScopeMarker {
    private name: string;
    private startTime: number;
    private ended: boolean = false;

    /**
     * Create a new scope marker
     */
    constructor(name: string, config?: Partial<ProfileMarkerConfig>) {
        this.name = name;
        this.startTime = performance.now();

        ProfileMarker.begin(name, config);
    }

    /**
     * Get the marker name
     */
    public getName(): string {
        return this.name;
    }

    /**
     * Get elapsed time since marker started
     */
    public getElapsedTime(): number {
        return performance.now() - this.startTime;
    }

    /**
     * Check if marker has ended
     */
    public hasEnded(): boolean {
        return this.ended;
    }

    /**
     * Manually end the scope (normally called automatically)
     */
    public end(): number {
        if (this.ended) {
            return 0;
        }

        const duration = ProfileMarker.end(this.name);
        this.ended = true;

        return duration;
    }

    /**
     * Dispose the scope marker (ends timing)
     */
    public dispose(): void {
        this.end();
    }

    /**
     * Symbol.dispose for using with 'using' keyword (TC39 proposal)
     */
    [Symbol.dispose](): void {
        this.dispose();
    }
}

/**
 * Helper function for using scope markers with callbacks
 */
export function using<T>(
    marker: ScopeMarker,
    callback: () => T
): T {
    try {
        return callback();
    } finally {
        marker.dispose();
    }
}

/**
 * Helper function for using scope markers with async callbacks
 */
export async function usingAsync<T>(
    marker: ScopeMarker,
    callback: () => Promise<T>
): Promise<T> {
    try {
        return await callback();
    } finally {
        marker.dispose();
    }
}

/**
 * Create and execute a scoped operation
 */
export function scoped<T>(
    name: string,
    callback: () => T,
    config?: Partial<ProfileMarkerConfig>
): T {
    const marker = new ScopeMarker(name, config);
    return using(marker, callback);
}

/**
 * Create and execute a scoped async operation
 */
export async function scopedAsync<T>(
    name: string,
    callback: () => Promise<T>,
    config?: Partial<ProfileMarkerConfig>
): Promise<T> {
    const marker = new ScopeMarker(name, config);
    return usingAsync(marker, callback);
}

/**
 * Nested scope manager for tracking hierarchical scopes
 */
export class ScopeStack {
    private scopes: ScopeMarker[] = [];

    /**
     * Push a new scope onto the stack
     */
    public push(name: string, config?: Partial<ProfileMarkerConfig>): ScopeMarker {
        const marker = new ScopeMarker(name, config);
        this.scopes.push(marker);
        return marker;
    }

    /**
     * Pop the top scope from the stack
     */
    public pop(): number {
        const marker = this.scopes.pop();

        if (!marker) {
            console.warn('ScopeStack: No scope to pop');
            return 0;
        }

        return marker.end();
    }

    /**
     * Get the current scope depth
     */
    public depth(): number {
        return this.scopes.length;
    }

    /**
     * Get the current scope (top of stack)
     */
    public current(): ScopeMarker | null {
        if (this.scopes.length === 0) {
            return null;
        }
        return this.scopes[this.scopes.length - 1];
    }

    /**
     * Get all scopes in the stack
     */
    public getAll(): ReadonlyArray<ScopeMarker> {
        return this.scopes;
    }

    /**
     * Clear all scopes
     */
    public clear(): void {
        // End all scopes in reverse order
        while (this.scopes.length > 0) {
            this.pop();
        }
    }

    /**
     * Dispose the scope stack (ends all scopes)
     */
    public dispose(): void {
        this.clear();
    }
}

/**
 * Global scope stack instance
 */
const globalScopeStack = new ScopeStack();

/**
 * Get the global scope stack
 */
export function getGlobalScopeStack(): ScopeStack {
    return globalScopeStack;
}

/**
 * Begin a scope on the global stack
 */
export function beginScope(name: string, config?: Partial<ProfileMarkerConfig>): ScopeMarker {
    return globalScopeStack.push(name, config);
}

/**
 * End the current scope on the global stack
 */
export function endScope(): number {
    return globalScopeStack.pop();
}

/**
 * Get current scope depth on the global stack
 */
export function getScopeDepth(): number {
    return globalScopeStack.depth();
}
