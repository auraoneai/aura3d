/**
 * @fileoverview Scrollable container with scrollbars and momentum.
 * @module ui/UIScrollView
 */

import { UIElement, UIEventType, UIEvent } from './UIElement';
import { UISlider, UISliderDirection } from './UISlider';
import { Vector2 } from '../math/Vector2';
import { Rect } from '../math/Rect';
import { Color } from '../math/Color';

/**
 * Scroll direction
 */
export enum UIScrollDirection {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
  Both = 'both'
}

/**
 * Scrollable container with content clipping, scrollbars, and momentum.
 *
 * @example
 * ```typescript
 * const scrollView = new UIScrollView();
 * scrollView.size.set(400, 300);
 * scrollView.contentSize.set(400, 1000); // Tall content
 *
 * // Add content
 * for (let i = 0; i < 20; i++) {
 *   const item = new UIText(`Item ${i}`);
 *   item.position.set(10, i * 30);
 *   scrollView.content.addChild(item);
 * }
 * ```
 */
export class UIScrollView extends UIElement {
  /**
   * Content container
   */
  public content: UIElement;

  /**
   * Content size (scrollable area)
   */
  public contentSize: Vector2;

  /**
   * Scroll direction
   */
  public scrollDirection: UIScrollDirection;

  /**
   * Horizontal scrollbar
   */
  public horizontalScrollbar: UISlider | null = null;

  /**
   * Vertical scrollbar
   */
  public verticalScrollbar: UISlider | null = null;

  /**
   * Whether scrollbars are visible
   */
  public showScrollbars: boolean;

  /**
   * Scrollbar width/height
   */
  public scrollbarSize: number;

  /**
   * Momentum scrolling enabled
   */
  public momentum: boolean;

  /**
   * Momentum damping factor
   */
  public momentumDamping: number;

  /**
   * Elastic bounds (bounce effect)
   */
  public elastic: boolean;

  /**
   * Elastic strength
   */
  public elasticStrength: number;

  /**
   * Current scroll position
   */
  protected _scrollPosition: Vector2;

  /**
   * Scroll velocity for momentum
   */
  protected _scrollVelocity: Vector2;

  /**
   * Last pointer position for momentum calculation
   */
  protected _lastPointerPosition: Vector2 | null = null;

  /**
   * Whether currently scrolling
   */
  protected _isScrolling: boolean = false;

  /**
   * Scroll position history for momentum
   */
  protected _positionHistory: Array<{ pos: Vector2; time: number }> = [];

  /**
   * Creates a new scroll view.
   *
   * @example
   * ```typescript
   * const list = new UIScrollView();
   * list.scrollDirection = UIScrollDirection.Vertical;
   * list.elastic = true;
   * ```
   */
  constructor() {
    super('UIScrollView');

    this.size.set(400, 300);
    this.contentSize = new Vector2(400, 600);
    this.scrollDirection = UIScrollDirection.Vertical;
    this.showScrollbars = true;
    this.scrollbarSize = 10;
    this.momentum = true;
    this.momentumDamping = 0.95;
    this.elastic = true;
    this.elasticStrength = 0.1;
    this.clipChildren = true;

    this._scrollPosition = new Vector2(0, 0);
    this._scrollVelocity = new Vector2(0, 0);

    // Create content container
    this.content = new UIElement('Content');
    this.content.size.copy(this.contentSize);
    this.addChild(this.content);

    // Create scrollbars
    if (this.showScrollbars) {
      this.createScrollbars();
    }

    // Setup event listeners
    this.addEventListener(UIEventType.PointerDown, this.handlePointerDown.bind(this));
    this.addEventListener(UIEventType.DragStart, this.handleDragStart.bind(this));
    this.addEventListener(UIEventType.Drag, this.handleDrag.bind(this));
    this.addEventListener(UIEventType.DragEnd, this.handleDragEnd.bind(this));
  }

  /**
   * Gets the scroll position.
   */
  get scrollPosition(): Readonly<Vector2> {
    return this._scrollPosition;
  }

  /**
   * Sets the scroll position.
   */
  set scrollPosition(pos: Vector2) {
    this.setScrollPosition(pos.x, pos.y);
  }

  /**
   * Gets the normalized scroll position (0-1).
   */
  get normalizedScrollPosition(): Vector2 {
    const maxScroll = this.getMaxScrollPosition();
    return new Vector2(
      maxScroll.x > 0 ? this._scrollPosition.x / maxScroll.x : 0,
      maxScroll.y > 0 ? this._scrollPosition.y / maxScroll.y : 0
    );
  }

  /**
   * Creates scrollbars.
   */
  protected createScrollbars(): void {
    if (this.scrollDirection === UIScrollDirection.Horizontal || this.scrollDirection === UIScrollDirection.Both) {
      this.horizontalScrollbar = new UISlider();
      this.horizontalScrollbar.name = 'HorizontalScrollbar';
      this.horizontalScrollbar.direction = UISliderDirection.Horizontal;
      this.horizontalScrollbar.position.set(0, this.size.y - this.scrollbarSize);
      this.horizontalScrollbar.setSize(this.size.x, this.scrollbarSize);
      this.horizontalScrollbar.onValueChanged((value) => {
        const maxScroll = this.getMaxScrollPosition();
        this._scrollPosition.x = value * maxScroll.x;
        this.updateContentPosition();
      });
      this.addChild(this.horizontalScrollbar);
    }

    if (this.scrollDirection === UIScrollDirection.Vertical || this.scrollDirection === UIScrollDirection.Both) {
      this.verticalScrollbar = new UISlider();
      this.verticalScrollbar.name = 'VerticalScrollbar';
      this.verticalScrollbar.direction = UISliderDirection.Vertical;
      this.verticalScrollbar.position.set(this.size.x - this.scrollbarSize, 0);
      this.verticalScrollbar.setSize(this.scrollbarSize, this.size.y);
      this.verticalScrollbar.onValueChanged((value) => {
        const maxScroll = this.getMaxScrollPosition();
        this._scrollPosition.y = value * maxScroll.y;
        this.updateContentPosition();
      });
      this.addChild(this.verticalScrollbar);
    }
  }

  /**
   * Gets the maximum scroll position.
   */
  protected getMaxScrollPosition(): Vector2 {
    return new Vector2(
      Math.max(0, this.contentSize.x - this.size.x),
      Math.max(0, this.contentSize.y - this.size.y)
    );
  }

  /**
   * Sets the scroll position.
   */
  setScrollPosition(x: number, y: number, clamp: boolean = true): void {
    const maxScroll = this.getMaxScrollPosition();

    if (clamp) {
      this._scrollPosition.set(
        Math.max(0, Math.min(maxScroll.x, x)),
        Math.max(0, Math.min(maxScroll.y, y))
      );
    } else {
      this._scrollPosition.set(x, y);
    }

    this.updateContentPosition();
    this.updateScrollbars();
  }

  /**
   * Updates the content position.
   */
  protected updateContentPosition(): void {
    this.content.position.set(-this._scrollPosition.x, -this._scrollPosition.y);
  }

  /**
   * Updates scrollbar values.
   */
  protected updateScrollbars(): void {
    const maxScroll = this.getMaxScrollPosition();

    if (this.horizontalScrollbar && maxScroll.x > 0) {
      this.horizontalScrollbar.normalizedValue = this._scrollPosition.x / maxScroll.x;
    }

    if (this.verticalScrollbar && maxScroll.y > 0) {
      this.verticalScrollbar.normalizedValue = this._scrollPosition.y / maxScroll.y;
    }
  }

  /**
   * Handles pointer down.
   */
  protected handlePointerDown(event: UIEvent): void {
    this._lastPointerPosition = event.localPosition.clone();
    this._scrollVelocity.set(0, 0);
    this._positionHistory = [];
  }

  /**
   * Handles drag start.
   */
  protected handleDragStart(event: UIEvent): void {
    this._isScrolling = true;
  }

  /**
   * Handles drag.
   */
  protected handleDrag(event: UIEvent): void {
    if (!this._isScrolling || !this._lastPointerPosition) {
      return;
    }

    const localPos = event.localPosition;
    const delta = localPos.sub(this._lastPointerPosition);

    // Update scroll position
    if (this.scrollDirection === UIScrollDirection.Horizontal || this.scrollDirection === UIScrollDirection.Both) {
      this.setScrollPosition(this._scrollPosition.x - delta.x, this._scrollPosition.y, false);
    }

    if (this.scrollDirection === UIScrollDirection.Vertical || this.scrollDirection === UIScrollDirection.Both) {
      this.setScrollPosition(this._scrollPosition.x, this._scrollPosition.y - delta.y, false);
    }

    // Store position for momentum calculation
    this._positionHistory.push({
      pos: this._scrollPosition.clone(),
      time: performance.now()
    });

    // Keep only recent history
    if (this._positionHistory.length > 5) {
      this._positionHistory.shift();
    }

    this._lastPointerPosition = localPos;
  }

  /**
   * Handles drag end.
   */
  protected handleDragEnd(event: UIEvent): void {
    this._isScrolling = false;
    this._lastPointerPosition = null;

    // Calculate momentum velocity
    if (this.momentum && this._positionHistory.length >= 2) {
      const recent = this._positionHistory[this._positionHistory.length - 1];
      const older = this._positionHistory[0];
      const timeDelta = (recent.time - older.time) / 1000; // Convert to seconds

      if (timeDelta > 0) {
        const posDelta = recent.pos.sub(older.pos);
        this._scrollVelocity = posDelta.scale(1 / timeDelta);
      }
    }

    this._positionHistory = [];
  }

  /**
   * Updates momentum and elastic bounds.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Apply momentum
    if (this.momentum && (Math.abs(this._scrollVelocity.x) > 0.1 || Math.abs(this._scrollVelocity.y) > 0.1)) {
      this._scrollPosition.addInPlace(this._scrollVelocity.scale(deltaTime));
      this._scrollVelocity.scaleInPlace(this.momentumDamping);

      this.updateContentPosition();
      this.updateScrollbars();
    }

    // Apply elastic bounds
    if (this.elastic) {
      const maxScroll = this.getMaxScrollPosition();
      let corrected = false;

      if (this._scrollPosition.x < 0) {
        this._scrollPosition.x += (0 - this._scrollPosition.x) * this.elasticStrength;
        this._scrollVelocity.x *= 0.5;
        corrected = true;
      } else if (this._scrollPosition.x > maxScroll.x) {
        this._scrollPosition.x += (maxScroll.x - this._scrollPosition.x) * this.elasticStrength;
        this._scrollVelocity.x *= 0.5;
        corrected = true;
      }

      if (this._scrollPosition.y < 0) {
        this._scrollPosition.y += (0 - this._scrollPosition.y) * this.elasticStrength;
        this._scrollVelocity.y *= 0.5;
        corrected = true;
      } else if (this._scrollPosition.y > maxScroll.y) {
        this._scrollPosition.y += (maxScroll.y - this._scrollPosition.y) * this.elasticStrength;
        this._scrollVelocity.y *= 0.5;
        corrected = true;
      }

      if (corrected) {
        this.updateContentPosition();
        this.updateScrollbars();
      }
    } else {
      // Clamp without elasticity
      const maxScroll = this.getMaxScrollPosition();
      const clamped = new Vector2(
        Math.max(0, Math.min(maxScroll.x, this._scrollPosition.x)),
        Math.max(0, Math.min(maxScroll.y, this._scrollPosition.y))
      );

      if (!clamped.equals(this._scrollPosition)) {
        this._scrollPosition.copy(clamped);
        this._scrollVelocity.set(0, 0);
        this.updateContentPosition();
        this.updateScrollbars();
      }
    }
  }

  /**
   * Scrolls to make an element visible.
   *
   * @param element - Element to scroll to
   */
  scrollToElement(element: UIElement): void {
    const elementBounds = element.worldBounds;
    const viewBounds = this.worldBounds;

    // Calculate required scroll to make element visible
    let scrollX = this._scrollPosition.x;
    let scrollY = this._scrollPosition.y;

    if (elementBounds.left < viewBounds.left) {
      scrollX -= viewBounds.left - elementBounds.left;
    } else if (elementBounds.right > viewBounds.right) {
      scrollX += elementBounds.right - viewBounds.right;
    }

    if (elementBounds.top < viewBounds.top) {
      scrollY -= viewBounds.top - elementBounds.top;
    } else if (elementBounds.bottom > viewBounds.bottom) {
      scrollY += elementBounds.bottom - viewBounds.bottom;
    }

    this.setScrollPosition(scrollX, scrollY);
  }
}
