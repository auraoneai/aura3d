/**
 * EventBus - Type-safe publish/subscribe system for engine-level events
 *
 * Provides a centralized event system with type safety, priority-based ordering,
 * automatic memory leak detection, and comprehensive error handling.
 *
 * @example
 * ```typescript
 * // Subscribe to an event
 * const unsubscribe = EventBus.on('engine:start', () => {
 *   console.log('Engine started!');
 * });
 *
 * // Emit an event
 * EventBus.emit('engine:start', undefined);
 *
 * // Unsubscribe
 * unsubscribe();
 * ```
 */

/**
 * Event name to payload type mapping
 * Extend this interface to add custom events throughout the application
 */
export interface EventMap {
  'engine:start': void;
  'engine:stop': void;
  'engine:pause': void;
  'engine:resume': void;
  'scene:load': { sceneName: string };
  'scene:unload': { sceneName: string };
  'asset:loaded': { assetId: string; assetType: string };
  'error:fatal': { error: Error };
}

/**
 * Event handler function type
 */
type EventHandler<T> = (data: T) => void;

/**
 * Internal handler registration with metadata
 */
interface HandlerRegistration<T> {
  handler: EventHandler<T>;
  priority: number;
  once: boolean;
}

/**
 * Options for event subscription
 */
interface SubscriptionOptions {
  /**
   * Handler priority (higher values execute first)
   * @default 0
   */
  priority?: number;
}

/**
 * Type-safe event bus for engine-level communication
 *
 * Features:
 * - Type-safe event registration with TypeScript mapped types
 * - Priority-based handler ordering
 * - One-time event handlers with auto-cleanup
 * - Synchronous event dispatch in registration order
 * - Error isolation (handler errors don't affect other handlers)
 * - Memory leak detection and warnings
 * - Wildcard subscriptions for debugging
 */
export class EventBus {
  /**
   * Storage for event handlers
   * Maps event names to arrays of handler registrations
   */
  private static handlers: Map<string, HandlerRegistration<any>[]> = new Map();

  /**
   * Wildcard handlers that receive all events
   */
  private static wildcardHandlers: Array<{
    handler: (event: string, data: any) => void;
    priority: number;
  }> = [];

  /**
   * Threshold for memory leak warnings
   */
  private static readonly HANDLER_LEAK_THRESHOLD = 100;

  /**
   * Subscribe to an event
   *
   * @param event - Event name to subscribe to
   * @param handler - Callback function to invoke when event is emitted
   * @param options - Subscription options (priority)
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = EventBus.on('scene:load', (data) => {
   *   console.log(`Loading scene: ${data.sceneName}`);
   * }, { priority: 10 });
   *
   * // Later...
   * unsubscribe();
   * ```
   */
  static on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
    options: SubscriptionOptions = {}
  ): () => void {
    const { priority = 0 } = options;
    const eventName = event as string;

    // Handle wildcard subscriptions
    if (eventName === '*') {
      const wildcardHandler = {
        handler: handler as (event: string, data: any) => void,
        priority,
      };
      this.wildcardHandlers.push(wildcardHandler);
      this.wildcardHandlers.sort((a, b) => b.priority - a.priority);

      return () => {
        const index = this.wildcardHandlers.indexOf(wildcardHandler);
        if (index !== -1) {
          this.wildcardHandlers.splice(index, 1);
        }
      };
    }

    // Get or create handlers array for this event
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }

    const handlersArray = this.handlers.get(eventName)!;

    // Create handler registration
    const registration: HandlerRegistration<EventMap[K]> = {
      handler,
      priority,
      once: false,
    };

    // Insert handler in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < handlersArray.length; i++) {
      if (priority > handlersArray[i].priority) {
        handlersArray.splice(i, 0, registration);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      handlersArray.push(registration);
    }

    // Check for potential memory leaks
    if (handlersArray.length > this.HANDLER_LEAK_THRESHOLD) {
      console.warn(
        `[EventBus] Potential memory leak detected: ${handlersArray.length} handlers registered for event "${eventName}". ` +
        `This may indicate handlers are not being properly cleaned up.`
      );
    }

    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Subscribe to an event for one-time execution
   * Handler automatically unsubscribes after first invocation
   *
   * @param event - Event name to subscribe to
   * @param handler - Callback function to invoke when event is emitted
   * @param options - Subscription options (priority)
   * @returns Unsubscribe function (in case you want to cancel before it fires)
   *
   * @example
   * ```typescript
   * EventBus.once('engine:start', () => {
   *   console.log('Engine started for the first time!');
   * });
   * ```
   */
  static once<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
    options: SubscriptionOptions = {}
  ): () => void {
    const { priority = 0 } = options;
    const eventName = event as string;

    // Get or create handlers array for this event
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }

    const handlersArray = this.handlers.get(eventName)!;

    // Create handler registration with once flag
    const registration: HandlerRegistration<EventMap[K]> = {
      handler,
      priority,
      once: true,
    };

    // Insert handler in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < handlersArray.length; i++) {
      if (priority > handlersArray[i].priority) {
        handlersArray.splice(i, 0, registration);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      handlersArray.push(registration);
    }

    // Check for potential memory leaks
    if (handlersArray.length > this.HANDLER_LEAK_THRESHOLD) {
      console.warn(
        `[EventBus] Potential memory leak detected: ${handlersArray.length} handlers registered for event "${eventName}". ` +
        `This may indicate handlers are not being properly cleaned up.`
      );
    }

    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Emit an event to all subscribed handlers
   * Handlers are called synchronously in priority order (highest priority first)
   * Errors in handlers are caught and logged without affecting other handlers
   *
   * @param event - Event name to emit
   * @param data - Event payload data
   *
   * @example
   * ```typescript
   * EventBus.emit('scene:load', { sceneName: 'MainMenu' });
   * EventBus.emit('engine:start', undefined);
   * ```
   */
  static emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const eventName = event as string;

    // Call wildcard handlers first
    for (const wildcardReg of this.wildcardHandlers) {
      try {
        wildcardReg.handler(eventName, data);
      } catch (error) {
        console.error(
          `[EventBus] Error in wildcard handler for event "${eventName}":`,
          error
        );
      }
    }

    // Get handlers for this specific event
    const handlersArray = this.handlers.get(eventName);
    if (!handlersArray || handlersArray.length === 0) {
      return;
    }

    // Create a copy to avoid issues if handlers modify the array during iteration
    const handlersCopy = [...handlersArray];

    // Track handlers to remove (once handlers)
    const handlersToRemove: HandlerRegistration<EventMap[K]>[] = [];

    // Call each handler in order
    for (const registration of handlersCopy) {
      try {
        registration.handler(data);
      } catch (error) {
        console.error(
          `[EventBus] Error in handler for event "${eventName}":`,
          error
        );
      }

      // Mark once handlers for removal
      if (registration.once) {
        handlersToRemove.push(registration);
      }
    }

    // Remove once handlers
    if (handlersToRemove.length > 0) {
      const currentHandlers = this.handlers.get(eventName);
      if (currentHandlers) {
        for (const handlerToRemove of handlersToRemove) {
          const index = currentHandlers.indexOf(handlerToRemove);
          if (index !== -1) {
            currentHandlers.splice(index, 1);
          }
        }

        // Clean up empty arrays
        if (currentHandlers.length === 0) {
          this.handlers.delete(eventName);
        }
      }
    }
  }

  /**
   * Unsubscribe a specific handler from an event
   *
   * @param event - Event name to unsubscribe from
   * @param handler - Handler function to remove
   *
   * @example
   * ```typescript
   * const myHandler = (data) => console.log(data);
   * EventBus.on('scene:load', myHandler);
   * // Later...
   * EventBus.off('scene:load', myHandler);
   * ```
   */
  static off<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>
  ): void {
    const eventName = event as string;

    // Handle wildcard unsubscribe
    if (eventName === '*') {
      const index = this.wildcardHandlers.findIndex(
        (reg) => reg.handler === handler
      );
      if (index !== -1) {
        this.wildcardHandlers.splice(index, 1);
      }
      return;
    }

    const handlersArray = this.handlers.get(eventName);
    if (!handlersArray) {
      return;
    }

    // Find and remove the handler
    const index = handlersArray.findIndex((reg) => reg.handler === handler);
    if (index !== -1) {
      handlersArray.splice(index, 1);
    }

    // Clean up empty arrays
    if (handlersArray.length === 0) {
      this.handlers.delete(eventName);
    }
  }

  /**
   * Clear all event handlers
   * Useful for cleanup and testing
   *
   * @example
   * ```typescript
   * // Clear all subscriptions
   * EventBus.clear();
   * ```
   */
  static clear(): void {
    this.handlers.clear();
    this.wildcardHandlers = [];
  }

  /**
   * Get the number of handlers registered for a specific event
   * Useful for debugging and testing
   *
   * @param event - Event name to check
   * @returns Number of registered handlers
   *
   * @internal
   */
  static getHandlerCount<K extends keyof EventMap>(event: K): number {
    const eventName = event as string;
    const handlersArray = this.handlers.get(eventName);
    return handlersArray ? handlersArray.length : 0;
  }

  /**
   * Get all registered event names
   * Useful for debugging and introspection
   *
   * @returns Array of event names that have handlers
   *
   * @internal
   */
  static getEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if an event has any handlers registered
   *
   * @param event - Event name to check
   * @returns True if the event has handlers, false otherwise
   *
   * @internal
   */
  static hasHandlers<K extends keyof EventMap>(event: K): boolean {
    const eventName = event as string;
    const handlersArray = this.handlers.get(eventName);
    return handlersArray !== undefined && handlersArray.length > 0;
  }

  /**
   * Get the number of wildcard handlers
   * Useful for debugging and testing
   *
   * @returns Number of registered wildcard handlers
   *
   * @internal
   */
  static getWildcardHandlerCount(): number {
    return this.wildcardHandlers.length;
  }
}
