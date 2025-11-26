/**
 * @fileoverview Root UI container with screen-space and world-space rendering modes.
 * Manages the UI hierarchy and event routing.
 * @module ui/UICanvas
 */

import { UIElement, UIEvent, UIEventType } from './UIElement';
import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = new Logger('UICanvas');

/**
 * Canvas render mode
 */
export enum UICanvasMode {
  /** Screen space overlay - rendered on top of everything */
  ScreenSpaceOverlay = 0,
  /** Screen space camera - rendered with camera perspective */
  ScreenSpaceCamera = 1,
  /** World space - positioned in 3D world */
  WorldSpace = 2
}

/**
 * Canvas scaling mode
 */
export enum UIScaleMode {
  /** Constant pixel size - no scaling */
  ConstantPixelSize = 0,
  /** Scale with screen size - maintains aspect ratio */
  ScaleWithScreenSize = 1,
  /** Constant physical size - DPI aware */
  ConstantPhysicalSize = 2
}

/**
 * Root UI container that manages the entire UI hierarchy.
 * Handles rendering, event routing, and screen resolution scaling.
 *
 * @example
 * ```typescript
 * // Create canvas
 * const canvas = new UICanvas(document.getElementById('canvas') as HTMLCanvasElement);
 * canvas.mode = UICanvasMode.ScreenSpaceOverlay;
 * canvas.scaleMode = UIScaleMode.ScaleWithScreenSize;
 * canvas.referenceResolution.set(1920, 1080);
 *
 * // Add UI elements
 * const button = new UIButton();
 * canvas.addChild(button);
 *
 * // Update and render
 * function gameLoop(deltaTime: number) {
 *   canvas.update(deltaTime);
 *   canvas.render();
 * }
 * ```
 */
export class UICanvas extends UIElement {
  /**
   * HTML canvas element
   */
  public readonly htmlCanvas: HTMLCanvasElement;

  /**
   * 2D rendering context
   */
  public readonly context: CanvasRenderingContext2D;

  /**
   * Canvas render mode
   */
  public mode: UICanvasMode;

  /**
   * Scaling mode
   */
  public scaleMode: UIScaleMode;

  /**
   * Reference resolution for scaling
   */
  public referenceResolution: Vector2;

  /**
   * Match width or height when scaling (0 = width, 1 = height, 0.5 = balanced)
   */
  public matchWidthOrHeight: number;

  /**
   * Pixel perfect rendering
   */
  public pixelPerfect: boolean;

  /**
   * Physical DPI (for ConstantPhysicalSize mode)
   */
  public physicalDPI: number;

  /**
   * Sort order for multiple canvases
   */
  public sortOrder: number;

  /**
   * Current scale factor
   */
  protected _scaleFactor: number = 1;

  /**
   * Element currently under pointer
   */
  protected _hoveredElement: UIElement | null = null;

  /**
   * Element that captured the pointer
   */
  protected _capturedElement: UIElement | null = null;

  /**
   * Element with focus
   */
  protected _focusedElement: UIElement | null = null;

  /**
   * Last pointer position
   */
  protected _lastPointerPosition: Vector2 = new Vector2();

  /**
   * Whether canvas has attached event listeners
   */
  protected _eventsAttached: boolean = false;

  /**
   * Bound event handlers
   */
  protected _handlePointerDown = this.handlePointerDown.bind(this);
  protected _handlePointerUp = this.handlePointerUp.bind(this);
  protected _handlePointerMove = this.handlePointerMove.bind(this);
  protected _handlePointerLeave = this.handlePointerLeave.bind(this);
  protected _handleWheel = this.onWheel.bind(this);
  protected _handleResize = this.onResize.bind(this);

  /**
   * Creates a new UI canvas.
   *
   * @param htmlCanvas - HTML canvas element
   *
   * @example
   * ```typescript
   * const canvas = new UICanvas(document.getElementById('game-canvas') as HTMLCanvasElement);
   * ```
   */
  constructor(htmlCanvas: HTMLCanvasElement) {
    super('UICanvas');

    this.htmlCanvas = htmlCanvas;
    const context = htmlCanvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.context = context;

    this.mode = UICanvasMode.ScreenSpaceOverlay;
    this.scaleMode = UIScaleMode.ScaleWithScreenSize;
    this.referenceResolution = new Vector2(1920, 1080);
    this.matchWidthOrHeight = 0.5;
    this.pixelPerfect = false;
    this.physicalDPI = 96;
    this.sortOrder = 0;

    // Canvas is always at origin with full size
    this.position.set(0, 0);
    this.updateCanvasSize();

    this.attachEvents();

    logger.debug('UICanvas created');
  }

  /**
   * Gets the current scale factor.
   */
  get scaleFactor(): number {
    return this._scaleFactor;
  }

  /**
   * Gets the element with focus.
   */
  get focusedElement(): UIElement | null {
    return this._focusedElement;
  }

  /**
   * Attaches event listeners to the canvas.
   */
  protected attachEvents(): void {
    if (this._eventsAttached) {
      return;
    }

    this.htmlCanvas.addEventListener('pointerdown', this._handlePointerDown);
    this.htmlCanvas.addEventListener('pointerup', this._handlePointerUp);
    this.htmlCanvas.addEventListener('pointermove', this._handlePointerMove);
    this.htmlCanvas.addEventListener('pointerleave', this._handlePointerLeave);
    this.htmlCanvas.addEventListener('wheel', this._handleWheel);
    window.addEventListener('resize', this._handleResize);

    this._eventsAttached = true;
    logger.debug('Events attached');
  }

  /**
   * Detaches event listeners from the canvas.
   */
  protected detachEvents(): void {
    if (!this._eventsAttached) {
      return;
    }

    this.htmlCanvas.removeEventListener('pointerdown', this._handlePointerDown);
    this.htmlCanvas.removeEventListener('pointerup', this._handlePointerUp);
    this.htmlCanvas.removeEventListener('pointermove', this._handlePointerMove);
    this.htmlCanvas.removeEventListener('pointerleave', this._handlePointerLeave);
    this.htmlCanvas.removeEventListener('wheel', this._handleWheel);
    window.removeEventListener('resize', this._handleResize);

    this._eventsAttached = false;
    logger.debug('Events detached');
  }

  /**
   * Updates the canvas size and scale factor.
   */
  protected updateCanvasSize(): void {
    const rect = this.htmlCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Update canvas size
    this.size.set(rect.width, rect.height);

    // Update backing store size for high DPI displays
    if (this.htmlCanvas.width !== rect.width * dpr || this.htmlCanvas.height !== rect.height * dpr) {
      this.htmlCanvas.width = rect.width * dpr;
      this.htmlCanvas.height = rect.height * dpr;
      this.context.scale(dpr, dpr);
    }

    // Calculate scale factor
    this.updateScaleFactor();

    this.markTransformDirty();
  }

  /**
   * Updates the scale factor based on scale mode.
   */
  protected updateScaleFactor(): void {
    switch (this.scaleMode) {
      case UIScaleMode.ConstantPixelSize:
        this._scaleFactor = 1;
        break;

      case UIScaleMode.ScaleWithScreenSize: {
        const widthScale = this.size.x / this.referenceResolution.x;
        const heightScale = this.size.y / this.referenceResolution.y;

        // Lerp between width and height based on matchWidthOrHeight
        this._scaleFactor = widthScale * (1 - this.matchWidthOrHeight) + heightScale * this.matchWidthOrHeight;

        if (this.pixelPerfect) {
          this._scaleFactor = Math.max(1, Math.floor(this._scaleFactor));
        }
        break;
      }

      case UIScaleMode.ConstantPhysicalSize: {
        const systemDPI = window.devicePixelRatio * 96; // Approximate system DPI
        this._scaleFactor = systemDPI / this.physicalDPI;
        break;
      }
    }

    logger.debug(`Scale factor updated: ${this._scaleFactor}`);
  }

  /**
   * Finds the topmost element at a given position.
   *
   * @param position - Position to test
   * @returns Element at position or null
   */
  protected findElementAt(position: Vector2): UIElement | null {
    return this.findElementAtRecursive(this as UIElement, position);
  }

  /**
   * Recursively finds element at position.
   */
  protected findElementAtRecursive(element: UIElement, position: Vector2): UIElement | null {
    if (!element.visible || !element.enabled) {
      return null;
    }

    // Check children in reverse order (highest z-index first)
    const children = [...element.children].sort((a, b) => b.zIndex - a.zIndex);

    for (const child of children) {
      const found = this.findElementAtRecursive(child, position);
      if (found) {
        return found;
      }
    }

    // Check this element
    if (element.interactive && element.containsPoint(position)) {
      return element;
    }

    return null;
  }

  /**
   * Sets focus to an element.
   *
   * @param element - Element to focus, or null to clear focus
   */
  setFocus(element: UIElement | null): void {
    if (this._focusedElement === element) {
      return;
    }

    // Blur previous element
    if (this._focusedElement) {
      const blurEvent: UIEvent = {
        type: UIEventType.Blur,
        target: this._focusedElement,
        position: this._lastPointerPosition.clone(),
        localPosition: this._focusedElement.worldToLocal(this._lastPointerPosition)
      };
      this._focusedElement.dispatchEvent(blurEvent);
    }

    this._focusedElement = element;

    // Focus new element
    if (this._focusedElement) {
      const focusEvent: UIEvent = {
        type: UIEventType.Focus,
        target: this._focusedElement,
        position: this._lastPointerPosition.clone(),
        localPosition: this._focusedElement.worldToLocal(this._lastPointerPosition)
      };
      this._focusedElement.dispatchEvent(focusEvent);
    }
  }

  /**
   * Handles pointer down event from HTML canvas.
   */
  protected handlePointerDown(event: PointerEvent): void {
    const rect = this.htmlCanvas.getBoundingClientRect();
    const position = new Vector2(event.clientX - rect.left, event.clientY - rect.top);
    this._lastPointerPosition.copy(position);

    const element = this.findElementAt(position);

    if (element) {
      this._capturedElement = element;
      this.setFocus(element);

      const uiEvent: UIEvent = {
        type: UIEventType.PointerDown,
        target: element,
        position: position.clone(),
        localPosition: element.worldToLocal(position),
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      };

      element.dispatchEvent(uiEvent);
      element.onPointerDown(uiEvent);
    } else {
      this.setFocus(null);
    }

    event.preventDefault();
  }

  /**
   * Handles pointer up event from HTML canvas.
   */
  protected handlePointerUp(event: PointerEvent): void {
    const rect = this.htmlCanvas.getBoundingClientRect();
    const position = new Vector2(event.clientX - rect.left, event.clientY - rect.top);
    this._lastPointerPosition.copy(position);

    if (this._capturedElement) {
      const uiEvent: UIEvent = {
        type: UIEventType.PointerUp,
        target: this._capturedElement,
        position: position.clone(),
        localPosition: this._capturedElement.worldToLocal(position),
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      };

      this._capturedElement.dispatchEvent(uiEvent);
      this._capturedElement.onPointerUp(uiEvent);

      // Check for click
      if (this._capturedElement.containsPoint(position)) {
        const clickEvent: UIEvent = {
          ...uiEvent,
          type: UIEventType.Click
        };
        this._capturedElement.dispatchEvent(clickEvent);
      }

      this._capturedElement = null;
    }

    event.preventDefault();
  }

  /**
   * Handles pointer move event from HTML canvas.
   */
  protected handlePointerMove(event: PointerEvent): void {
    const rect = this.htmlCanvas.getBoundingClientRect();
    const position = new Vector2(event.clientX - rect.left, event.clientY - rect.top);
    this._lastPointerPosition.copy(position);

    const element = this._capturedElement || this.findElementAt(position);

    // Handle hover state changes
    if (element !== this._hoveredElement) {
      // Leave previous element
      if (this._hoveredElement) {
        const leaveEvent: UIEvent = {
          type: UIEventType.PointerLeave,
          target: this._hoveredElement,
          position: position.clone(),
          localPosition: this._hoveredElement.worldToLocal(position)
        };
        this._hoveredElement.dispatchEvent(leaveEvent);
        this._hoveredElement.onPointerLeave(leaveEvent);
      }

      this._hoveredElement = element;

      // Enter new element
      if (this._hoveredElement) {
        const enterEvent: UIEvent = {
          type: UIEventType.PointerEnter,
          target: this._hoveredElement,
          position: position.clone(),
          localPosition: this._hoveredElement.worldToLocal(position)
        };
        this._hoveredElement.dispatchEvent(enterEvent);
        this._hoveredElement.onPointerEnter(enterEvent);
      }
    }

    // Handle move on current element
    if (element) {
      const moveEvent: UIEvent = {
        type: UIEventType.PointerMove,
        target: element,
        position: position.clone(),
        localPosition: element.worldToLocal(position),
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      };
      element.dispatchEvent(moveEvent);
      element.onPointerMove(moveEvent);
    }

    event.preventDefault();
  }

  /**
   * Handles pointer leave event from HTML canvas.
   */
  protected handlePointerLeave(event: PointerEvent): void {
    if (this._hoveredElement) {
      const leaveEvent: UIEvent = {
        type: UIEventType.PointerLeave,
        target: this._hoveredElement,
        position: this._lastPointerPosition.clone(),
        localPosition: this._hoveredElement.worldToLocal(this._lastPointerPosition)
      };
      this._hoveredElement.dispatchEvent(leaveEvent);
      this._hoveredElement.onPointerLeave(leaveEvent);
      this._hoveredElement = null;
    }

    this._capturedElement = null;
  }

  /**
   * Handles wheel event.
   */
  protected onWheel(event: WheelEvent): void {
    // Can be used for scroll handling
    event.preventDefault();
  }

  /**
   * Handles window resize event.
   */
  protected onResize(): void {
    this.updateCanvasSize();
  }

  /**
   * Updates the canvas and all children.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
  }

  /**
   * Renders the canvas and all children.
   */
  override render(): void {
    // Clear canvas
    this.context.clearRect(0, 0, this.size.x, this.size.y);

    // Save context state
    this.context.save();

    // Apply canvas-level transforms if needed
    if (this.scaleMode === UIScaleMode.ScaleWithScreenSize) {
      // Center scaled content
      const scaledWidth = this.referenceResolution.x * this._scaleFactor;
      const scaledHeight = this.referenceResolution.y * this._scaleFactor;
      const offsetX = (this.size.x - scaledWidth) * 0.5;
      const offsetY = (this.size.y - scaledHeight) * 0.5;
      this.context.translate(offsetX, offsetY);
      this.context.scale(this._scaleFactor, this._scaleFactor);
    }

    // Render children
    this.renderElement(this as UIElement);

    // Restore context state
    this.context.restore();
  }

  /**
   * Recursively renders an element and its children.
   */
  protected renderElement(element: UIElement): void {
    if (!element.visible) {
      return;
    }

    this.context.save();

    // Apply transform
    const pos = element.worldPosition;
    const scale = element.worldScale;
    const rotation = element.worldRotation;
    const alpha = element.worldAlpha;

    this.context.translate(pos.x, pos.y);
    if (rotation !== 0) {
      this.context.rotate(rotation);
    }
    if (scale.x !== 1 || scale.y !== 1) {
      this.context.scale(scale.x, scale.y);
    }
    this.context.globalAlpha = alpha;

    // Apply clipping if needed
    if (element.clipChildren) {
      const bounds = element.localBounds;
      this.context.beginPath();
      this.context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      this.context.clip();
    }

    // Render background
    if (element.backgroundColor) {
      const bounds = element.localBounds;
      this.context.fillStyle = element.backgroundColor.toCSSString();
      this.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // Render element
    element.render(this.context);

    // Render children sorted by z-index
    const children = [...element.children].sort((a, b) => a.zIndex - b.zIndex);
    for (const child of children) {
      this.renderElement(child);
    }

    this.context.restore();
  }

  /**
   * Destroys the canvas and detaches events.
   */
  override destroy(): void {
    this.detachEvents();
    super.destroy();
    logger.debug('UICanvas destroyed');
  }
}
