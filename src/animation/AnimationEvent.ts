/**
 * Animation event system for triggering callbacks at specific timestamps.
 * Supports frame-accurate event dispatch during animation playback.
 * @module animation/AnimationEvent
 */

/**
 * Function signature for animation event callbacks.
 */
export type AnimationEventCallback = (event: AnimationEvent) => void;

/**
 * Animation event that fires at a specific timestamp.
 * Events are dispatched when animation playback crosses their timestamp.
 *
 * @example
 * ```typescript
 * const footstepEvent = new AnimationEvent({
 *   time: 0.3,
 *   name: 'footstep',
 *   data: { foot: 'left', intensity: 0.8 }
 * });
 *
 * footstepEvent.addListener((event) => {
 *   playSound('footstep.wav', event.data.intensity);
 * });
 * ```
 */
export class AnimationEvent {
  /**
   * Event name/identifier.
   */
  readonly name: string;

  /**
   * Time in seconds when this event fires.
   */
  time: number;

  /**
   * Optional data payload for this event.
   */
  data: any;

  /**
   * Whether this event has been dispatched in current playback cycle.
   */
  private dispatched: boolean;

  /**
   * Registered event listeners.
   */
  private listeners: AnimationEventCallback[];

  /**
   * Creates a new animation event.
   *
   * @param config - Event configuration
   *
   * @example
   * ```typescript
   * const event = new AnimationEvent({
   *   time: 0.5,
   *   name: 'jump',
   *   data: { height: 2.0 }
   * });
   * ```
   */
  constructor(config: {
    time: number;
    name: string;
    data?: any;
  }) {
    this.time = config.time;
    this.name = config.name;
    this.data = config.data;
    this.dispatched = false;
    this.listeners = [];
  }

  /**
   * Adds a listener callback for this event.
   *
   * @param callback - Callback function to invoke when event fires
   * @returns This event for chaining
   *
   * @example
   * ```typescript
   * event.addListener((e) => {
   *   console.log(`Event ${e.name} fired at ${e.time}s`);
   * });
   * ```
   */
  addListener(callback: AnimationEventCallback): this {
    if (!this.listeners.includes(callback)) {
      this.listeners.push(callback);
    }
    return this;
  }

  /**
   * Removes a listener callback.
   *
   * @param callback - Callback to remove
   * @returns True if listener was removed
   *
   * @example
   * ```typescript
   * event.removeListener(myCallback);
   * ```
   */
  removeListener(callback: AnimationEventCallback): boolean {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) {
      this.listeners.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Removes all listeners.
   *
   * @example
   * ```typescript
   * event.clearListeners();
   * ```
   */
  clearListeners(): void {
    this.listeners.length = 0;
  }

  /**
   * Dispatches this event to all registered listeners.
   * Automatically called by animation system.
   *
   * @internal
   */
  dispatch(): void {
    if (this.dispatched) {
      return;
    }

    this.dispatched = true;

    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (error) {
        console.error(`Error in animation event listener for '${this.name}':`, error);
      }
    }
  }

  /**
   * Resets the dispatched flag.
   * Called when animation loops or rewinds.
   *
   * @internal
   */
  reset(): void {
    this.dispatched = false;
  }

  /**
   * Clones this event.
   *
   * @returns Cloned event
   *
   * @example
   * ```typescript
   * const eventCopy = event.clone();
   * ```
   */
  clone(): AnimationEvent {
    const cloned = new AnimationEvent({
      time: this.time,
      name: this.name,
      data: this.data
    });

    for (const listener of this.listeners) {
      cloned.addListener(listener);
    }

    return cloned;
  }
}

/**
 * Timeline for managing animation events.
 * Handles event dispatch during animation playback.
 *
 * @example
 * ```typescript
 * const timeline = new AnimationEventTimeline();
 *
 * timeline.addEvent(new AnimationEvent({
 *   time: 0.3,
 *   name: 'footstep_left'
 * }));
 *
 * timeline.addEvent(new AnimationEvent({
 *   time: 0.7,
 *   name: 'footstep_right'
 * }));
 *
 * // During animation update
 * timeline.update(previousTime, currentTime);
 * ```
 */
export class AnimationEventTimeline {
  /**
   * Events sorted by time.
   */
  private events: AnimationEvent[];

  /**
   * Duration of the animation this timeline belongs to.
   */
  duration: number;

  /**
   * Creates a new event timeline.
   *
   * @param duration - Animation duration in seconds
   *
   * @example
   * ```typescript
   * const timeline = new AnimationEventTimeline(1.5);
   * ```
   */
  constructor(duration: number = 0) {
    this.events = [];
    this.duration = duration;
  }

  /**
   * Adds an event to the timeline.
   *
   * @param event - Event to add
   * @returns This timeline for chaining
   *
   * @example
   * ```typescript
   * timeline.addEvent(new AnimationEvent({
   *   time: 0.5,
   *   name: 'apex'
   * }));
   * ```
   */
  addEvent(event: AnimationEvent): this {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
    return this;
  }

  /**
   * Removes an event from the timeline.
   *
   * @param event - Event to remove
   * @returns True if event was removed
   *
   * @example
   * ```typescript
   * timeline.removeEvent(footstepEvent);
   * ```
   */
  removeEvent(event: AnimationEvent): boolean {
    const index = this.events.indexOf(event);
    if (index !== -1) {
      this.events.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Removes events by name.
   *
   * @param name - Event name
   * @returns Number of events removed
   *
   * @example
   * ```typescript
   * timeline.removeEventsByName('footstep');
   * ```
   */
  removeEventsByName(name: string): number {
    const initialLength = this.events.length;
    this.events = this.events.filter(e => e.name !== name);
    return initialLength - this.events.length;
  }

  /**
   * Gets all events.
   *
   * @returns Array of events
   *
   * @example
   * ```typescript
   * const allEvents = timeline.getEvents();
   * ```
   */
  getEvents(): ReadonlyArray<AnimationEvent> {
    return this.events;
  }

  /**
   * Gets events by name.
   *
   * @param name - Event name
   * @returns Array of matching events
   *
   * @example
   * ```typescript
   * const footsteps = timeline.getEventsByName('footstep');
   * ```
   */
  getEventsByName(name: string): AnimationEvent[] {
    return this.events.filter(e => e.name === name);
  }

  /**
   * Updates the timeline and dispatches events that occur between prevTime and currTime.
   * Handles looping and time wrapping correctly.
   *
   * @param prevTime - Previous animation time in seconds
   * @param currTime - Current animation time in seconds
   * @param isLooping - Whether animation is looping
   *
   * @example
   * ```typescript
   * // Called during animation update
   * timeline.update(0.2, 0.4, true);
   * ```
   */
  update(prevTime: number, currTime: number, isLooping: boolean = false): void {
    if (this.events.length === 0) {
      return;
    }

    if (prevTime === currTime) {
      return;
    }

    const forward = currTime > prevTime;

    if (forward) {
      if (isLooping && currTime < prevTime) {
        this.dispatchEventsInRange(prevTime, this.duration, forward);
        this.resetAllEvents();
        this.dispatchEventsInRange(0, currTime, forward);
      } else {
        this.dispatchEventsInRange(prevTime, currTime, forward);
      }
    } else {
      if (isLooping && currTime > prevTime) {
        this.dispatchEventsInRange(prevTime, 0, forward);
        this.resetAllEvents();
        this.dispatchEventsInRange(this.duration, currTime, forward);
      } else {
        this.resetEventsInRange(currTime, prevTime);
      }
    }
  }

  /**
   * Resets all events to un-dispatched state.
   *
   * @example
   * ```typescript
   * timeline.reset();
   * ```
   */
  reset(): void {
    for (const event of this.events) {
      event.reset();
    }
  }

  /**
   * Clears all events.
   *
   * @example
   * ```typescript
   * timeline.clear();
   * ```
   */
  clear(): void {
    this.events.length = 0;
  }

  /**
   * Clones this timeline.
   *
   * @returns Cloned timeline
   *
   * @example
   * ```typescript
   * const timelineCopy = timeline.clone();
   * ```
   */
  clone(): AnimationEventTimeline {
    const cloned = new AnimationEventTimeline(this.duration);
    for (const event of this.events) {
      cloned.addEvent(event.clone());
    }
    return cloned;
  }

  /**
   * Dispatches events within a time range.
   *
   * @param startTime - Start time
   * @param endTime - End time
   * @param forward - Whether time is moving forward
   * @private
   */
  private dispatchEventsInRange(startTime: number, endTime: number, forward: boolean): void {
    for (const event of this.events) {
      if (forward) {
        if (event.time > startTime && event.time <= endTime) {
          event.dispatch();
        }
      } else {
        if (event.time >= endTime && event.time < startTime) {
          event.dispatch();
        }
      }
    }
  }

  /**
   * Resets events within a time range.
   *
   * @param startTime - Start time
   * @param endTime - End time
   * @private
   */
  private resetEventsInRange(startTime: number, endTime: number): void {
    for (const event of this.events) {
      if (event.time >= startTime && event.time < endTime) {
        event.reset();
      }
    }
  }

  /**
   * Resets all events to un-dispatched state.
   * @private
   */
  private resetAllEvents(): void {
    for (const event of this.events) {
      event.reset();
    }
  }
}
