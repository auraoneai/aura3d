/**
 * @fileoverview Advanced UI event handling system with pointer enter/exit, focus, and blur.
 * @module ui/UIEventSystem
 */

import { UIElement, UIEvent, UIEventType } from './UIElement';
import { UICanvas } from './UICanvas';
import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIEventSystem');

/**
 * Event propagation mode
 */
export enum EventPropagation {
  /** Event bubbles up through parent hierarchy */
  Bubble = 'bubble',
  /** Event only affects target */
  Direct = 'direct',
  /** Event captures down through children */
  Capture = 'capture'
}

/**
 * Advanced UI event handling system that manages pointer tracking, focus states,
 * and event propagation across the UI hierarchy.
 *
 * @example
 * ```typescript
 * // Create event system
 * const eventSystem = new UIEventSystem(canvas);
 *
 * // Register custom event handler
 * eventSystem.on('customEvent', (event) => {
 *   console.log('Custom event:', event);
 * });
 *
 * // Emit custom event
 * eventSystem.emit('customEvent', { data: 'value' });
 * ```
 */
export class UIEventSystem {
  /**
   * Associated UI canvas
   */
  protected canvas: UICanvas;

  /**
   * Currently focused element
   */
  protected _focusedElement: UIElement | null = null;

  /**
   * Element currently under pointer
   */
  protected _hoveredElement: UIElement | null = null;

  /**
   * Element that captured pointer events
   */
  protected _capturedElement: UIElement | null = null;

  /**
   * Pointer state tracking
   */
  protected _pointerStates: Map<number, {
    position: Vector2;
    element: UIElement | null;
    isDown: boolean;
  }> = new Map();

  /**
   * Custom event listeners
   */
  protected _customListeners: Map<string, Set<(event: any) => void>> = new Map();

  /**
   * Whether to log event dispatches (debug)
   */
  public debugEvents: boolean = false;

  /**
   * Event propagation mode
   */
  public propagationMode: EventPropagation = EventPropagation.Bubble;

  /**
   * Creates a new UI event system.
   *
   * @param canvas - UI canvas to manage events for
   *
   * @example
   * ```typescript
   * const eventSystem = new UIEventSystem(myCanvas);
   * ```
   */
  constructor(canvas: UICanvas) {
    this.canvas = canvas;
  }

  /**
   * Gets the currently focused element.
   */
  get focusedElement(): UIElement | null {
    return this._focusedElement;
  }

  /**
   * Gets the currently hovered element.
   */
  get hoveredElement(): UIElement | null {
    return this._hoveredElement;
  }

  /**
   * Sets focus to an element.
   *
   * @param element - Element to focus, or null to clear focus
   * @param reason - Focus reason for accessibility
   */
  setFocus(element: UIElement | null, reason: string = 'user'): void {
    if (this._focusedElement === element) {
      return;
    }

    // Blur previous element
    if (this._focusedElement) {
      const blurEvent: UIEvent = {
        type: UIEventType.Blur,
        target: this._focusedElement,
        position: new Vector2(),
        localPosition: new Vector2()
      };

      this.dispatchEvent(this._focusedElement, blurEvent);

      if (this.debugEvents) {
        logger.debug(`Focus lost: ${this._focusedElement.name}`);
      }
    }

    this._focusedElement = element;

    // Focus new element
    if (this._focusedElement) {
      const focusEvent: UIEvent = {
        type: UIEventType.Focus,
        target: this._focusedElement,
        position: new Vector2(),
        localPosition: new Vector2()
      };

      this.dispatchEvent(this._focusedElement, focusEvent);

      if (this.debugEvents) {
        logger.debug(`Focus gained: ${this._focusedElement.name} (reason: ${reason})`);
      }
    }
  }

  /**
   * Dispatches an event to an element with optional propagation.
   *
   * @param element - Target element
   * @param event - Event to dispatch
   * @returns True if event was not prevented
   */
  dispatchEvent(element: UIElement, event: UIEvent): boolean {
    if (this.debugEvents) {
      logger.debug(`Dispatching ${event.type} to ${element.name}`);
    }

    // Capture phase (down the tree)
    if (this.propagationMode === EventPropagation.Capture) {
      const ancestors: UIElement[] = [];
      let current = element.parent;
      while (current) {
        ancestors.unshift(current);
        current = current.parent;
      }

      for (const ancestor of ancestors) {
        if (!ancestor.dispatchEvent(event)) {
          return false;
        }
      }
    }

    // Target phase
    const result = element.dispatchEvent(event);

    // Bubble phase (up the tree)
    if (this.propagationMode === EventPropagation.Bubble && result) {
      let current = element.parent;
      while (current) {
        if (!current.dispatchEvent(event)) {
          return false;
        }
        current = current.parent;
      }
    }

    return result;
  }

  /**
   * Updates pointer state and dispatches hover events.
   *
   * @param pointerId - Pointer identifier
   * @param position - World position
   * @param element - Element under pointer
   */
  updatePointerState(
    pointerId: number,
    position: Vector2,
    element: UIElement | null
  ): void {
    let state = this._pointerStates.get(pointerId);

    if (!state) {
      state = {
        position: position.clone(),
        element: null,
        isDown: false
      };
      this._pointerStates.set(pointerId, state);
    }

    // Check for hover state changes
    if (state.element !== element) {
      // Pointer left previous element
      if (state.element) {
        const leaveEvent: UIEvent = {
          type: UIEventType.PointerLeave,
          target: state.element,
          position: position.clone(),
          localPosition: state.element.worldToLocal(position)
        };

        this.dispatchEvent(state.element, leaveEvent);
        state.element.onPointerLeave(leaveEvent);
      }

      // Pointer entered new element
      if (element) {
        const enterEvent: UIEvent = {
          type: UIEventType.PointerEnter,
          target: element,
          position: position.clone(),
          localPosition: element.worldToLocal(position)
        };

        this.dispatchEvent(element, enterEvent);
        element.onPointerEnter(enterEvent);
      }

      state.element = element;
    }

    state.position.copy(position);
  }

  /**
   * Handles pointer down.
   *
   * @param pointerId - Pointer identifier
   * @param position - World position
   * @param element - Element under pointer
   * @param button - Button index
   */
  handlePointerDown(
    pointerId: number,
    position: Vector2,
    element: UIElement | null,
    button: number = 0
  ): void {
    const state = this._pointerStates.get(pointerId);
    if (state) {
      state.isDown = true;
    }

    if (element) {
      this._capturedElement = element;

      const event: UIEvent = {
        type: UIEventType.PointerDown,
        target: element,
        position: position.clone(),
        localPosition: element.worldToLocal(position),
        button
      };

      this.dispatchEvent(element, event);
      element.onPointerDown(event);

      // Auto-focus on click if focusable
      if (element.interactive) {
        this.setFocus(element, 'pointer');
      }
    }
  }

  /**
   * Handles pointer up.
   *
   * @param pointerId - Pointer identifier
   * @param position - World position
   * @param element - Element under pointer
   * @param button - Button index
   */
  handlePointerUp(
    pointerId: number,
    position: Vector2,
    element: UIElement | null,
    button: number = 0
  ): void {
    const state = this._pointerStates.get(pointerId);
    if (state) {
      state.isDown = false;
    }

    const target = this._capturedElement || element;

    if (target) {
      const event: UIEvent = {
        type: UIEventType.PointerUp,
        target: target,
        position: position.clone(),
        localPosition: target.worldToLocal(position),
        button
      };

      this.dispatchEvent(target, event);
      target.onPointerUp(event);

      // Dispatch click if pointer is still over element
      if (element === target && target.containsPoint(position)) {
        const clickEvent: UIEvent = {
          type: UIEventType.Click,
          target: target,
          position: position.clone(),
          localPosition: target.worldToLocal(position),
          button
        };

        this.dispatchEvent(target, clickEvent);
      }
    }

    this._capturedElement = null;
  }

  /**
   * Handles pointer move.
   *
   * @param pointerId - Pointer identifier
   * @param position - World position
   * @param element - Element under pointer
   */
  handlePointerMove(
    pointerId: number,
    position: Vector2,
    element: UIElement | null
  ): void {
    this.updatePointerState(pointerId, position, element);

    const target = this._capturedElement || element;

    if (target) {
      const event: UIEvent = {
        type: UIEventType.PointerMove,
        target: target,
        position: position.clone(),
        localPosition: target.worldToLocal(position)
      };

      this.dispatchEvent(target, event);
      target.onPointerMove(event);
    }
  }

  /**
   * Registers a custom event listener.
   *
   * @param eventName - Event name
   * @param listener - Event listener function
   */
  on(eventName: string, listener: (event: any) => void): void {
    let listeners = this._customListeners.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this._customListeners.set(eventName, listeners);
    }
    listeners.add(listener);
  }

  /**
   * Removes a custom event listener.
   *
   * @param eventName - Event name
   * @param listener - Event listener function
   */
  off(eventName: string, listener: (event: any) => void): void {
    const listeners = this._customListeners.get(eventName);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emits a custom event.
   *
   * @param eventName - Event name
   * @param data - Event data
   */
  emit(eventName: string, data?: any): void {
    const listeners = this._customListeners.get(eventName);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }

  /**
   * Clears all pointer states.
   */
  clearPointerStates(): void {
    this._pointerStates.clear();
    this._capturedElement = null;
  }

  /**
   * Destroys the event system.
   */
  destroy(): void {
    this._pointerStates.clear();
    this._customListeners.clear();
    this._focusedElement = null;
    this._hoveredElement = null;
    this._capturedElement = null;
  }
}
