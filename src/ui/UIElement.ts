/**
 * @fileoverview Base UI element class with transform, hierarchy, and event handling.
 * Provides the foundation for all UI components in the G3D engine.
 * @module ui/UIElement
 */

import { Vector2 } from '../math/Vector2';
import { Rect } from '../math/Rect';
import { Color } from '../math/Color';

/**
 * Anchor point for positioning relative to parent
 */
export enum UIAnchor {
  TopLeft = 0,
  TopCenter = 1,
  TopRight = 2,
  MiddleLeft = 3,
  MiddleCenter = 4,
  MiddleRight = 5,
  BottomLeft = 6,
  BottomCenter = 7,
  BottomRight = 8,
  // Stretch modes
  StretchTop = 9,
  StretchMiddle = 10,
  StretchBottom = 11,
  StretchLeft = 12,
  StretchCenter = 13,
  StretchRight = 14,
  StretchFull = 15
}

/**
 * UI event types
 */
export enum UIEventType {
  PointerEnter = 'pointerenter',
  PointerLeave = 'pointerleave',
  PointerDown = 'pointerdown',
  PointerUp = 'pointerup',
  PointerMove = 'pointermove',
  Click = 'click',
  DragStart = 'dragstart',
  Drag = 'drag',
  DragEnd = 'dragend',
  Focus = 'focus',
  Blur = 'blur'
}

/**
 * UI event data
 */
export interface UIEvent {
  type: UIEventType;
  target: UIElement;
  position: Vector2;
  localPosition: Vector2;
  button?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  stopPropagation?: () => void;
  preventDefault?: () => void;
}

/**
 * Event listener function type
 */
export type UIEventListener = (event: UIEvent) => void;

/**
 * Base UI element with transform, hierarchy, visibility, and event handling.
 * All UI components inherit from this class.
 *
 * @example
 * ```typescript
 * // Create a simple UI element
 * const element = new UIElement();
 * element.position.set(100, 50);
 * element.size.set(200, 100);
 * element.anchor = UIAnchor.MiddleCenter;
 *
 * // Add child element
 * const child = new UIElement();
 * child.position.set(10, 10);
 * element.addChild(child);
 *
 * // Event handling
 * element.addEventListener(UIEventType.Click, (event) => {
 *   console.log('Element clicked at', event.position);
 * });
 * ```
 */
export class UIElement {
  /**
   * Unique identifier for this element
   */
  public readonly id: string;

  /**
   * Human-readable name for debugging
   */
  public name: string;

  /**
   * Local position relative to parent
   */
  public position: Vector2;

  /**
   * Rotation in radians
   */
  public rotation: number;

  /**
   * Scale factor
   */
  public scale: Vector2;

  /**
   * Pivot point for rotation and scaling (0-1 normalized)
   */
  public pivot: Vector2;

  /**
   * Anchor point for positioning relative to parent
   */
  public anchor: UIAnchor;

  /**
   * Size of the element
   */
  public size: Vector2;

  /**
   * Offset from anchored position
   */
  public offset: Vector2;

  /**
   * Whether this element is visible
   */
  public visible: boolean;

  /**
   * Whether this element can receive input events
   */
  public interactive: boolean;

  /**
   * Whether this element blocks pointer events from reaching elements behind it
   */
  public blockPointer: boolean;

  /**
   * Alpha transparency (0-1)
   */
  public alpha: number;

  /**
   * Background color (optional)
   */
  public backgroundColor: Color | null;

  /**
   * Z-index for render/input ordering (higher values rendered last)
   */
  public zIndex: number;

  /**
   * Whether to clip children to this element's bounds
   */
  public clipChildren: boolean;

  /**
   * Parent element
   */
  protected _parent: UIElement | null = null;

  /**
   * Child elements
   */
  protected _children: UIElement[] = [];

  /**
   * Event listeners
   */
  protected _listeners: Map<UIEventType, Set<UIEventListener>> = new Map();

  /**
   * Cached world transform
   */
  protected _worldPosition: Vector2 = new Vector2();
  protected _worldRotation: number = 0;
  protected _worldScale: Vector2 = new Vector2(1, 1);
  protected _worldAlpha: number = 1;
  protected _transformDirty: boolean = true;

  /**
   * Cached bounds
   */
  protected _localBounds: Rect = new Rect();
  protected _worldBounds: Rect = new Rect();
  protected _boundsDirty: boolean = true;

  /**
   * Pointer state
   */
  protected _isPointerOver: boolean = false;
  protected _isPointerDown: boolean = false;
  protected _isDragging: boolean = false;

  /**
   * Drag state
   */
  protected _dragStartPosition: Vector2 | null = null;
  protected _dragThreshold: number = 5;

  /**
   * Whether this element is currently enabled
   */
  protected _enabled: boolean = true;

  /**
   * Static ID counter
   */
  private static _idCounter: number = 0;

  /**
   * Creates a new UI element.
   *
   * @param name - Element name for debugging
   *
   * @example
   * ```typescript
   * const element = new UIElement('MyButton');
   * element.position.set(100, 100);
   * element.size.set(150, 40);
   * ```
   */
  constructor(name: string = 'UIElement') {
    this.id = `ui-${UIElement._idCounter++}`;
    this.name = name;
    this.position = new Vector2(0, 0);
    this.rotation = 0;
    this.scale = new Vector2(1, 1);
    this.pivot = new Vector2(0.5, 0.5);
    this.anchor = UIAnchor.TopLeft;
    this.size = new Vector2(100, 100);
    this.offset = new Vector2(0, 0);
    this.visible = true;
    this.interactive = true;
    this.blockPointer = true;
    this.alpha = 1;
    this.backgroundColor = null;
    this.zIndex = 0;
    this.clipChildren = false;
  }

  /**
   * Gets the parent element.
   *
   * @returns Parent element or null
   */
  get parent(): UIElement | null {
    return this._parent;
  }

  /**
   * Gets child elements.
   *
   * @returns Array of child elements
   */
  get children(): readonly UIElement[] {
    return this._children;
  }

  /**
   * Gets whether this element is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Sets whether this element is enabled.
   */
  set enabled(value: boolean) {
    if (this._enabled !== value) {
      this._enabled = value;
      this.onEnabledChanged(value);
    }
  }

  /**
   * Gets the world position of this element.
   */
  get worldPosition(): Readonly<Vector2> {
    if (this._transformDirty) {
      this.updateTransform();
    }
    return this._worldPosition;
  }

  /**
   * Gets the world rotation of this element.
   */
  get worldRotation(): number {
    if (this._transformDirty) {
      this.updateTransform();
    }
    return this._worldRotation;
  }

  /**
   * Gets the world scale of this element.
   */
  get worldScale(): Readonly<Vector2> {
    if (this._transformDirty) {
      this.updateTransform();
    }
    return this._worldScale;
  }

  /**
   * Gets the world alpha of this element.
   */
  get worldAlpha(): number {
    if (this._transformDirty) {
      this.updateTransform();
    }
    return this._worldAlpha;
  }

  /**
   * Gets the local bounds of this element.
   */
  get localBounds(): Readonly<Rect> {
    if (this._boundsDirty) {
      this.updateBounds();
    }
    return this._localBounds;
  }

  /**
   * Gets the world bounds of this element.
   */
  get worldBounds(): Readonly<Rect> {
    if (this._transformDirty || this._boundsDirty) {
      this.updateBounds();
    }
    return this._worldBounds;
  }

  /**
   * Adds a child element.
   *
   * @param child - Child element to add
   * @returns The added child
   *
   * @example
   * ```typescript
   * const parent = new UIElement('Parent');
   * const child = new UIElement('Child');
   * parent.addChild(child);
   * ```
   */
  addChild(child: UIElement): UIElement {
    if (child._parent === this) {
      return child;
    }

    if (child._parent) {
      child._parent.removeChild(child);
    }

    this._children.push(child);
    child._parent = this;
    child.markTransformDirty();
    this.onChildAdded(child);

    return child;
  }

  /**
   * Removes a child element.
   *
   * @param child - Child element to remove
   * @returns True if child was removed
   *
   * @example
   * ```typescript
   * parent.removeChild(child);
   * ```
   */
  removeChild(child: UIElement): boolean {
    const index = this._children.indexOf(child);
    if (index === -1) {
      return false;
    }

    this._children.splice(index, 1);
    child._parent = null;
    child.markTransformDirty();
    this.onChildRemoved(child);

    return true;
  }

  /**
   * Removes this element from its parent.
   *
   * @example
   * ```typescript
   * child.removeFromParent();
   * ```
   */
  removeFromParent(): void {
    if (this._parent) {
      this._parent.removeChild(this);
    }
  }

  /**
   * Gets a child by name.
   *
   * @param name - Child name to search for
   * @returns Child element or null
   */
  getChildByName(name: string): UIElement | null {
    return this._children.find(child => child.name === name) ?? null;
  }

  /**
   * Gets a child by ID.
   *
   * @param id - Child ID to search for
   * @returns Child element or null
   */
  getChildById(id: string): UIElement | null {
    return this._children.find(child => child.id === id) ?? null;
  }

  /**
   * Removes all children.
   *
   * @example
   * ```typescript
   * parent.removeAllChildren();
   * ```
   */
  removeAllChildren(): void {
    while (this._children.length > 0) {
      this.removeChild(this._children[0]);
    }
  }

  /**
   * Sorts children by z-index.
   */
  sortChildren(): void {
    this._children.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Adds an event listener.
   *
   * @param type - Event type
   * @param listener - Event listener function
   *
   * @example
   * ```typescript
   * element.addEventListener(UIEventType.Click, (event) => {
   *   console.log('Clicked!');
   * });
   * ```
   */
  addEventListener(type: UIEventType, listener: UIEventListener): void {
    let listeners = this._listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(type, listeners);
    }
    listeners.add(listener);
  }

  /**
   * Removes an event listener.
   *
   * @param type - Event type
   * @param listener - Event listener function
   */
  removeEventListener(type: UIEventType, listener: UIEventListener): void {
    const listeners = this._listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Removes all event listeners of a type.
   *
   * @param type - Event type (optional, removes all if not specified)
   */
  removeAllEventListeners(type?: UIEventType): void {
    if (type) {
      this._listeners.delete(type);
    } else {
      this._listeners.clear();
    }
  }

  /**
   * Dispatches an event to this element.
   *
   * @param event - Event to dispatch
   * @returns True if event was not prevented
   */
  dispatchEvent(event: UIEvent): boolean {
    const listeners = this._listeners.get(event.type);
    if (!listeners) {
      return true;
    }

    let prevented = false;
    let stopped = false;

    event.preventDefault = () => { prevented = true; };
    event.stopPropagation = () => { stopped = true; };

    for (const listener of listeners) {
      listener(event);
      if (stopped) {
        break;
      }
    }

    return !prevented;
  }

  /**
   * Converts a world position to local position.
   *
   * @param worldPos - World position
   * @returns Local position
   */
  worldToLocal(worldPos: Vector2): Vector2 {
    const wp = this.worldPosition;
    const ws = this.worldScale;
    const wr = this.worldRotation;

    // Translate to local space
    let localX = worldPos.x - wp.x;
    let localY = worldPos.y - wp.y;

    // Rotate
    if (wr !== 0) {
      const cos = Math.cos(-wr);
      const sin = Math.sin(-wr);
      const x = localX * cos - localY * sin;
      const y = localX * sin + localY * cos;
      localX = x;
      localY = y;
    }

    // Scale
    localX /= ws.x;
    localY /= ws.y;

    return new Vector2(localX, localY);
  }

  /**
   * Converts a local position to world position.
   *
   * @param localPos - Local position
   * @returns World position
   */
  localToWorld(localPos: Vector2): Vector2 {
    const wp = this.worldPosition;
    const ws = this.worldScale;
    const wr = this.worldRotation;

    // Scale
    let worldX = localPos.x * ws.x;
    let worldY = localPos.y * ws.y;

    // Rotate
    if (wr !== 0) {
      const cos = Math.cos(wr);
      const sin = Math.sin(wr);
      const x = worldX * cos - worldY * sin;
      const y = worldX * sin + worldY * cos;
      worldX = x;
      worldY = y;
    }

    // Translate
    worldX += wp.x;
    worldY += wp.y;

    return new Vector2(worldX, worldY);
  }

  /**
   * Checks if a world position is within this element's bounds.
   *
   * @param worldPos - World position to test
   * @returns True if position is inside
   */
  containsPoint(worldPos: Vector2): boolean {
    return this.worldBounds.contains(worldPos);
  }

  /**
   * Marks the transform as dirty.
   */
  markTransformDirty(): void {
    if (this._transformDirty) {
      return;
    }

    this._transformDirty = true;
    this._boundsDirty = true;

    // Mark all children dirty
    for (const child of this._children) {
      child.markTransformDirty();
    }
  }

  /**
   * Updates the world transform.
   */
  protected updateTransform(): void {
    if (!this._transformDirty) {
      return;
    }

    // Get anchor offset
    const anchorOffset = this.getAnchorOffset();

    if (this._parent) {
      const parentPos = this._parent.worldPosition;
      const parentRot = this._parent.worldRotation;
      const parentScale = this._parent.worldScale;

      // Calculate local position with anchor and offset
      const localX = this.position.x + anchorOffset.x + this.offset.x;
      const localY = this.position.y + anchorOffset.y + this.offset.y;

      // Apply parent rotation to local position
      let rotatedX = localX;
      let rotatedY = localY;
      if (parentRot !== 0) {
        const cos = Math.cos(parentRot);
        const sin = Math.sin(parentRot);
        rotatedX = localX * cos - localY * sin;
        rotatedY = localX * sin + localY * cos;
      }

      // World position = parent position + rotated local position * parent scale
      this._worldPosition.set(
        parentPos.x + rotatedX * parentScale.x,
        parentPos.y + rotatedY * parentScale.y
      );

      this._worldRotation = parentRot + this.rotation;
      this._worldScale.set(
        parentScale.x * this.scale.x,
        parentScale.y * this.scale.y
      );
      this._worldAlpha = this._parent.worldAlpha * this.alpha;
    } else {
      // No parent - world transform is local transform
      this._worldPosition.set(
        this.position.x + anchorOffset.x + this.offset.x,
        this.position.y + anchorOffset.y + this.offset.y
      );
      this._worldRotation = this.rotation;
      this._worldScale.copy(this.scale);
      this._worldAlpha = this.alpha;
    }

    this._transformDirty = false;
  }

  /**
   * Gets the anchor offset for this element.
   */
  protected getAnchorOffset(): Vector2 {
    if (!this._parent) {
      return Vector2.zero();
    }

    const parentSize = this._parent.size;
    const offset = new Vector2(0, 0);

    switch (this.anchor) {
      case UIAnchor.TopLeft:
        break;
      case UIAnchor.TopCenter:
        offset.x = parentSize.x * 0.5;
        break;
      case UIAnchor.TopRight:
        offset.x = parentSize.x;
        break;
      case UIAnchor.MiddleLeft:
        offset.y = parentSize.y * 0.5;
        break;
      case UIAnchor.MiddleCenter:
        offset.x = parentSize.x * 0.5;
        offset.y = parentSize.y * 0.5;
        break;
      case UIAnchor.MiddleRight:
        offset.x = parentSize.x;
        offset.y = parentSize.y * 0.5;
        break;
      case UIAnchor.BottomLeft:
        offset.y = parentSize.y;
        break;
      case UIAnchor.BottomCenter:
        offset.x = parentSize.x * 0.5;
        offset.y = parentSize.y;
        break;
      case UIAnchor.BottomRight:
        offset.x = parentSize.x;
        offset.y = parentSize.y;
        break;
    }

    return offset;
  }

  /**
   * Updates the bounds.
   */
  protected updateBounds(): void {
    if (!this._transformDirty && !this._boundsDirty) {
      return;
    }

    if (this._transformDirty) {
      this.updateTransform();
    }

    // Local bounds
    const pivotX = this.size.x * this.pivot.x;
    const pivotY = this.size.y * this.pivot.y;
    this._localBounds.set(-pivotX, -pivotY, this.size.x, this.size.y);

    // World bounds
    const wp = this.worldPosition;
    const ws = this.worldScale;
    const scaledWidth = this.size.x * ws.x;
    const scaledHeight = this.size.y * ws.y;
    const scaledPivotX = pivotX * ws.x;
    const scaledPivotY = pivotY * ws.y;

    this._worldBounds.set(
      wp.x - scaledPivotX,
      wp.y - scaledPivotY,
      scaledWidth,
      scaledHeight
    );

    this._boundsDirty = false;
  }

  /**
   * Called when a child is added.
   */
  protected onChildAdded(child: UIElement): void {
    // Override in subclasses
  }

  /**
   * Called when a child is removed.
   */
  protected onChildRemoved(child: UIElement): void {
    // Override in subclasses
  }

  /**
   * Called when enabled state changes.
   */
  protected onEnabledChanged(enabled: boolean): void {
    // Override in subclasses
  }

  /**
   * Updates the element. Called once per frame.
   *
   * @param deltaTime - Time since last frame
   */
  update(deltaTime: number): void {
    // Override in subclasses
    for (const child of this._children) {
      if (child.visible && child.enabled) {
        child.update(deltaTime);
      }
    }
  }

  /**
   * Renders the element. Called once per frame.
   *
   * @param context - Rendering context
   */
  render(context: CanvasRenderingContext2D): void {
    // Override in subclasses
  }

  /**
   * Handles pointer enter event.
   */
  onPointerEnter(event: UIEvent): void {
    this._isPointerOver = true;
  }

  /**
   * Handles pointer leave event.
   */
  onPointerLeave(event: UIEvent): void {
    this._isPointerOver = false;
    this._isPointerDown = false;
  }

  /**
   * Handles pointer down event.
   */
  onPointerDown(event: UIEvent): void {
    this._isPointerDown = true;
    this._dragStartPosition = event.localPosition.clone();
  }

  /**
   * Handles pointer up event.
   */
  onPointerUp(event: UIEvent): void {
    this._isPointerDown = false;
    if (this._isDragging) {
      this._isDragging = false;
      this.dispatchEvent({
        ...event,
        type: UIEventType.DragEnd
      });
    }
    this._dragStartPosition = null;
  }

  /**
   * Handles pointer move event.
   */
  onPointerMove(event: UIEvent): void {
    if (this._isPointerDown && this._dragStartPosition && !this._isDragging) {
      const distance = Vector2.distance(event.localPosition, this._dragStartPosition);
      if (distance > this._dragThreshold) {
        this._isDragging = true;
        this.dispatchEvent({
          ...event,
          type: UIEventType.DragStart
        });
      }
    }

    if (this._isDragging) {
      this.dispatchEvent({
        ...event,
        type: UIEventType.Drag
      });
    }
  }

  /**
   * Destroys this element and all its children.
   */
  destroy(): void {
    this.removeAllChildren();
    this.removeFromParent();
    this.removeAllEventListeners();
  }
}
