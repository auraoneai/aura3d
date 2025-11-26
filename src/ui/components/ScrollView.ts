/**
 * @fileoverview Scroll view component with inertia, scroll bars, and content sizing.
 * @module ui/components/ScrollView
 */

import { UIElement, UIEvent, UIEventType } from '../UIElement';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Rect } from '../../math/Rect';

/**
 * Scroll direction
 */
export enum ScrollDirection {
  Vertical = 'vertical',
  Horizontal = 'horizontal',
  Both = 'both'
}

/**
 * Scrollbar visibility mode
 */
export enum ScrollbarVisibility {
  Auto = 'auto',
  Always = 'always',
  Never = 'never'
}

/**
 * Scroll view component for scrollable content areas.
 * Features smooth scrolling with inertia, customizable scrollbars, and elastic boundaries.
 *
 * @example
 * ```typescript
 * // Create a vertical scroll view
 * const scrollView = new ScrollView();
 * scrollView.position.set(50, 50);
 * scrollView.size.set(300, 400);
 * scrollView.direction = ScrollDirection.Vertical;
 *
 * // Add content
 * const content = new Panel();
 * content.size.set(280, 1000); // Taller than view
 * scrollView.setContent(content);
 *
 * // Customization
 * scrollView.enableInertia = true;
 * scrollView.scrollbarVisibility = ScrollbarVisibility.Auto;
 * scrollView.scrollbarColor = Color.fromHex(0x888888);
 * ```
 */
export class ScrollView extends UIElement {
  /**
   * Scroll direction
   */
  public direction: ScrollDirection;

  /**
   * Content container element
   */
  protected _content: UIElement | null;

  /**
   * Current scroll offset
   */
  protected _scrollOffset: Vector2;

  /**
   * Scroll velocity for inertia
   */
  protected _scrollVelocity: Vector2;

  /**
   * Enable inertia scrolling
   */
  public enableInertia: boolean;

  /**
   * Inertia deceleration rate (0-1)
   */
  public inertiaDeceleration: number;

  /**
   * Enable elastic/bounce effect at boundaries
   */
  public enableElastic: boolean;

  /**
   * Elastic spring stiffness
   */
  public elasticStiffness: number;

  /**
   * Scrollbar visibility
   */
  public scrollbarVisibility: ScrollbarVisibility;

  /**
   * Scrollbar width/height
   */
  public scrollbarSize: number;

  /**
   * Scrollbar color
   */
  public scrollbarColor: Color;

  /**
   * Scrollbar background color
   */
  public scrollbarBackgroundColor: Color;

  /**
   * Scrollbar corner radius
   */
  public scrollbarRadius: number;

  /**
   * Whether scrollbars are currently visible
   */
  protected _scrollbarsVisible: boolean;

  /**
   * Scrollbar fade timer
   */
  protected _scrollbarFadeTime: number;

  /**
   * Scrollbar fade delay
   */
  public scrollbarFadeDelay: number;

  /**
   * Whether currently dragging
   */
  protected override _isDragging: boolean;

  /**
   * Last drag position
   */
  protected _lastDragPos: Vector2 | null;

  /**
   * Drag start time for velocity calculation
   */
  protected _dragStartTime: number;

  /**
   * Recent drag positions for velocity calculation
   */
  protected _dragHistory: Array<{ pos: Vector2; time: number }>;

  /**
   * Padding around content
   */
  public contentPadding: number;

  /**
   * Creates a new ScrollView.
   *
   * @example
   * ```typescript
   * const scrollView = new ScrollView();
   * scrollView.size.set(400, 500);
   * ```
   */
  constructor() {
    super('ScrollView');

    this.direction = ScrollDirection.Vertical;
    this._content = null;
    this._scrollOffset = new Vector2(0, 0);
    this._scrollVelocity = new Vector2(0, 0);

    this.enableInertia = true;
    this.inertiaDeceleration = 0.95;
    this.enableElastic = true;
    this.elasticStiffness = 0.2;

    this.scrollbarVisibility = ScrollbarVisibility.Auto;
    this.scrollbarSize = 8;
    this.scrollbarColor = new Color(0.5, 0.5, 0.5, 0.7);
    this.scrollbarBackgroundColor = new Color(0, 0, 0, 0.1);
    this.scrollbarRadius = 4;
    this._scrollbarsVisible = false;
    this._scrollbarFadeTime = 0;
    this.scrollbarFadeDelay = 1.5;

    this._isDragging = false;
    this._lastDragPos = null;
    this._dragStartTime = 0;
    this._dragHistory = [];

    this.contentPadding = 0;

    this.size.set(300, 400);
    this.interactive = true;
    this.blockPointer = true;
    this.clipChildren = true;

    this.setupEventListeners();
  }

  /**
   * Gets the content element.
   */
  get content(): UIElement | null {
    return this._content;
  }

  /**
   * Gets the scroll offset.
   */
  get scrollOffset(): Readonly<Vector2> {
    return this._scrollOffset;
  }

  /**
   * Gets the maximum scroll offset.
   */
  protected getMaxScroll(): Vector2 {
    if (!this._content) {
      return new Vector2(0, 0);
    }

    const viewWidth = this.size.x - this.contentPadding * 2;
    const viewHeight = this.size.y - this.contentPadding * 2;
    const contentWidth = this._content.size.x;
    const contentHeight = this._content.size.y;

    return new Vector2(
      Math.max(0, contentWidth - viewWidth),
      Math.max(0, contentHeight - viewHeight)
    );
  }

  /**
   * Sets up event listeners.
   */
  protected setupEventListeners(): void {
    this.addEventListener(UIEventType.PointerDown, this.handlePointerDown.bind(this));
    this.addEventListener(UIEventType.PointerMove, this.handlePointerMove.bind(this));
    this.addEventListener(UIEventType.PointerUp, this.handlePointerUp.bind(this));
  }

  /**
   * Handles pointer down event.
   */
  protected handlePointerDown(event: UIEvent): void {
    this._isDragging = true;
    this._lastDragPos = event.localPosition.clone();
    this._dragStartTime = Date.now();
    this._dragHistory = [];
    this._scrollVelocity.set(0, 0);
    this.showScrollbars();
  }

  /**
   * Handles pointer move event.
   */
  protected handlePointerMove(event: UIEvent): void {
    if (!this._isDragging || !this._lastDragPos) return;

    const currentPos = event.localPosition;
    const delta = new Vector2(
      currentPos.x - this._lastDragPos.x,
      currentPos.y - this._lastDragPos.y
    );

    // Apply scroll based on direction
    if (this.direction === ScrollDirection.Vertical || this.direction === ScrollDirection.Both) {
      this._scrollOffset.y -= delta.y;
    }
    if (this.direction === ScrollDirection.Horizontal || this.direction === ScrollDirection.Both) {
      this._scrollOffset.x -= delta.x;
    }

    // Constrain scroll
    this.constrainScroll();

    // Track for velocity calculation
    const now = Date.now();
    this._dragHistory.push({ pos: currentPos.clone(), time: now });

    // Keep only recent history (last 100ms)
    while (this._dragHistory.length > 0 && now - this._dragHistory[0].time > 100) {
      this._dragHistory.shift();
    }

    this._lastDragPos = currentPos;
    this.updateContentPosition();
  }

  /**
   * Handles pointer up event.
   */
  protected handlePointerUp(event: UIEvent): void {
    if (!this._isDragging) return;

    // Calculate velocity from drag history
    if (this.enableInertia && this._dragHistory.length >= 2) {
      const first = this._dragHistory[0];
      const last = this._dragHistory[this._dragHistory.length - 1];
      const timeDelta = (last.time - first.time) / 1000;

      if (timeDelta > 0) {
        this._scrollVelocity.set(
          -(last.pos.x - first.pos.x) / timeDelta,
          -(last.pos.y - first.pos.y) / timeDelta
        );

        // Clamp velocity
        const maxVelocity = 3000;
        const speed = this._scrollVelocity.length();
        if (speed > maxVelocity) {
          this._scrollVelocity.scaleInPlace(maxVelocity / speed);
        }
      }
    }

    this._isDragging = false;
    this._lastDragPos = null;
    this._dragHistory = [];
  }

  /**
   * Constrains scroll offset within bounds.
   */
  protected constrainScroll(): void {
    const maxScroll = this.getMaxScroll();

    if (this.enableElastic) {
      // Soft constraint with elastic effect
      if (this._scrollOffset.x < 0) {
        this._scrollOffset.x *= 0.5;
      } else if (this._scrollOffset.x > maxScroll.x) {
        this._scrollOffset.x = maxScroll.x + (this._scrollOffset.x - maxScroll.x) * 0.5;
      }

      if (this._scrollOffset.y < 0) {
        this._scrollOffset.y *= 0.5;
      } else if (this._scrollOffset.y > maxScroll.y) {
        this._scrollOffset.y = maxScroll.y + (this._scrollOffset.y - maxScroll.y) * 0.5;
      }
    } else {
      // Hard constraint
      this._scrollOffset.x = Math.max(0, Math.min(maxScroll.x, this._scrollOffset.x));
      this._scrollOffset.y = Math.max(0, Math.min(maxScroll.y, this._scrollOffset.y));
    }
  }

  /**
   * Updates content position based on scroll offset.
   */
  protected updateContentPosition(): void {
    if (!this._content) return;

    this._content.position.set(
      this.contentPadding - this._scrollOffset.x,
      this.contentPadding - this._scrollOffset.y
    );
  }

  /**
   * Shows scrollbars.
   */
  protected showScrollbars(): void {
    this._scrollbarsVisible = true;
    this._scrollbarFadeTime = 0;
  }

  /**
   * Updates the scroll view.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Apply inertia
    if (!this._isDragging && this.enableInertia) {
      const speed = this._scrollVelocity.length();

      if (speed > 0.1) {
        this._scrollOffset.x += this._scrollVelocity.x * deltaTime;
        this._scrollOffset.y += this._scrollVelocity.y * deltaTime;

        this._scrollVelocity.scaleInPlace(Math.pow(this.inertiaDeceleration, deltaTime * 60));

        this.constrainScroll();
        this.updateContentPosition();
        this.showScrollbars();
      }
    }

    // Apply elastic spring back
    if (this.enableElastic && !this._isDragging) {
      const maxScroll = this.getMaxScroll();
      let needsSpring = false;

      if (this._scrollOffset.x < 0) {
        this._scrollOffset.x += -this._scrollOffset.x * this.elasticStiffness;
        needsSpring = true;
      } else if (this._scrollOffset.x > maxScroll.x) {
        this._scrollOffset.x += (maxScroll.x - this._scrollOffset.x) * this.elasticStiffness;
        needsSpring = true;
      }

      if (this._scrollOffset.y < 0) {
        this._scrollOffset.y += -this._scrollOffset.y * this.elasticStiffness;
        needsSpring = true;
      } else if (this._scrollOffset.y > maxScroll.y) {
        this._scrollOffset.y += (maxScroll.y - this._scrollOffset.y) * this.elasticStiffness;
        needsSpring = true;
      }

      if (needsSpring) {
        this.updateContentPosition();
      }
    }

    // Update scrollbar fade
    if (this._scrollbarsVisible && this.scrollbarVisibility === ScrollbarVisibility.Auto) {
      this._scrollbarFadeTime += deltaTime;
      if (this._scrollbarFadeTime > this.scrollbarFadeDelay) {
        this._scrollbarsVisible = false;
      }
    }
  }

  /**
   * Renders the scroll view scrollbars.
   */
  protected renderScrollbars(context: CanvasRenderingContext2D): void {
    if (this.scrollbarVisibility === ScrollbarVisibility.Never) return;
    if (this.scrollbarVisibility === ScrollbarVisibility.Auto && !this._scrollbarsVisible) return;

    const bounds = this.localBounds;
    const maxScroll = this.getMaxScroll();

    // Vertical scrollbar
    if ((this.direction === ScrollDirection.Vertical || this.direction === ScrollDirection.Both) && maxScroll.y > 0) {
      const trackHeight = bounds.height;
      const thumbHeight = Math.max(20, (bounds.height / (bounds.height + maxScroll.y)) * trackHeight);
      const thumbY = (this._scrollOffset.y / maxScroll.y) * (trackHeight - thumbHeight);

      const x = bounds.x + bounds.width - this.scrollbarSize - 2;
      const y = bounds.y + thumbY;

      // Draw track
      context.fillStyle = this.scrollbarBackgroundColor.toCSSString();
      context.fillRect(x, bounds.y, this.scrollbarSize, trackHeight);

      // Draw thumb
      context.fillStyle = this.scrollbarColor.toCSSString();
      if (this.scrollbarRadius > 0) {
        context.beginPath();
        context.roundRect(x, y, this.scrollbarSize, thumbHeight, this.scrollbarRadius);
        context.fill();
      } else {
        context.fillRect(x, y, this.scrollbarSize, thumbHeight);
      }
    }

    // Horizontal scrollbar
    if ((this.direction === ScrollDirection.Horizontal || this.direction === ScrollDirection.Both) && maxScroll.x > 0) {
      const trackWidth = bounds.width;
      const thumbWidth = Math.max(20, (bounds.width / (bounds.width + maxScroll.x)) * trackWidth);
      const thumbX = (this._scrollOffset.x / maxScroll.x) * (trackWidth - thumbWidth);

      const x = bounds.x + thumbX;
      const y = bounds.y + bounds.height - this.scrollbarSize - 2;

      // Draw track
      context.fillStyle = this.scrollbarBackgroundColor.toCSSString();
      context.fillRect(bounds.x, y, trackWidth, this.scrollbarSize);

      // Draw thumb
      context.fillStyle = this.scrollbarColor.toCSSString();
      if (this.scrollbarRadius > 0) {
        context.beginPath();
        context.roundRect(x, y, thumbWidth, this.scrollbarSize, this.scrollbarRadius);
        context.fill();
      } else {
        context.fillRect(x, y, thumbWidth, this.scrollbarSize);
      }
    }
  }

  /**
   * Renders the scroll view.
   */
  override render(context: CanvasRenderingContext2D): void {
    context.save();
    this.renderScrollbars(context);
    context.restore();
  }

  /**
   * Sets the content element.
   *
   * @param content - Content element
   * @returns This scroll view for chaining
   */
  setContent(content: UIElement): this {
    if (this._content) {
      this.removeChild(this._content);
    }

    this._content = content;
    this.addChild(content);
    this.updateContentPosition();

    return this;
  }

  /**
   * Scrolls to a specific offset.
   *
   * @param x - X offset
   * @param y - Y offset
   * @param animated - Whether to animate the scroll
   * @returns This scroll view for chaining
   */
  scrollTo(x: number, y: number, animated: boolean = false): this {
    if (animated) {
      // Simple animation via velocity
      const targetX = Math.max(0, Math.min(this.getMaxScroll().x, x));
      const targetY = Math.max(0, Math.min(this.getMaxScroll().y, y));

      this._scrollVelocity.set(
        (targetX - this._scrollOffset.x) * 10,
        (targetY - this._scrollOffset.y) * 10
      );
    } else {
      this._scrollOffset.set(x, y);
      this.constrainScroll();
      this.updateContentPosition();
    }

    this.showScrollbars();
    return this;
  }

  /**
   * Scrolls to the top.
   *
   * @param animated - Whether to animate
   * @returns This scroll view for chaining
   */
  scrollToTop(animated: boolean = true): this {
    return this.scrollTo(this._scrollOffset.x, 0, animated);
  }

  /**
   * Scrolls to the bottom.
   *
   * @param animated - Whether to animate
   * @returns This scroll view for chaining
   */
  scrollToBottom(animated: boolean = true): this {
    return this.scrollTo(this._scrollOffset.x, this.getMaxScroll().y, animated);
  }
}
