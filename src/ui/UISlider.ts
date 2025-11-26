/**
 * @fileoverview Slider/scrollbar UI control with draggable handle.
 * @module ui/UISlider
 */

import { UIElement, UIEventType, UIEvent } from './UIElement';
import { UIImage } from './UIImage';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';

/**
 * Slider orientation
 */
export enum UISliderDirection {
  Horizontal = 'horizontal',
  Vertical = 'vertical'
}

/**
 * Slider/scrollbar control with value range and step increments.
 *
 * @example
 * ```typescript
 * const slider = new UISlider();
 * slider.direction = UISliderDirection.Horizontal;
 * slider.minValue = 0;
 * slider.maxValue = 100;
 * slider.value = 50;
 * slider.onValueChanged((value) => {
 *   console.log('Slider value:', value);
 * });
 * ```
 */
export class UISlider extends UIElement {
  /**
   * Background image/bar
   */
  public background: UIImage;

  /**
   * Fill image (shows progress)
   */
  public fill: UIImage | null;

  /**
   * Handle/thumb image
   */
  public handle: UIImage;

  /**
   * Slider direction
   */
  public direction: UISliderDirection;

  /**
   * Minimum value
   */
  public minValue: number;

  /**
   * Maximum value
   */
  public maxValue: number;

  /**
   * Current value
   */
  protected _value: number;

  /**
   * Step increment (0 = continuous)
   */
  public step: number;

  /**
   * Handle size
   */
  public handleSize: Vector2;

  /**
   * Whether whole number values only
   */
  public wholeNumbers: boolean;

  /**
   * Value change callback
   */
  protected _valueChangedCallback: ((value: number) => void) | null = null;

  /**
   * Whether handle is being dragged
   */
  protected override _isDragging: boolean = false;

  /**
   * Drag offset
   */
  protected _dragOffset: Vector2 = new Vector2();

  /**
   * Creates a new slider.
   *
   * @example
   * ```typescript
   * const volumeSlider = new UISlider();
   * volumeSlider.minValue = 0;
   * volumeSlider.maxValue = 1;
   * volumeSlider.value = 0.8;
   * ```
   */
  constructor() {
    super('UISlider');

    this.size.set(200, 20);
    this.direction = UISliderDirection.Horizontal;
    this.minValue = 0;
    this.maxValue = 1;
    this._value = 0.5;
    this.step = 0;
    this.handleSize = new Vector2(20, 20);
    this.wholeNumbers = false;

    // Create background
    this.background = new UIImage();
    this.background.name = 'Background';
    this.background.size.set(200, 20);
    this.background.backgroundColor = Color.fromHex(0x424242);
    this.addChild(this.background);

    // Create fill
    this.fill = new UIImage();
    this.fill.name = 'Fill';
    this.fill.size.set(100, 20);
    this.fill.backgroundColor = Color.fromHex(0x2196F3);
    this.addChild(this.fill);

    // Create handle
    this.handle = new UIImage();
    this.handle.name = 'Handle';
    this.handle.size.copy(this.handleSize);
    this.handle.backgroundColor = Color.white();
    this.handle.interactive = true;
    this.addChild(this.handle);

    // Setup event listeners
    this.handle.addEventListener(UIEventType.PointerDown, this.handlePointerDown.bind(this));
    this.handle.addEventListener(UIEventType.DragStart, this.handleDragStart.bind(this));
    this.handle.addEventListener(UIEventType.Drag, this.handleDrag.bind(this));
    this.handle.addEventListener(UIEventType.DragEnd, this.handleDragEnd.bind(this));

    // Allow clicking on track to jump
    this.addEventListener(UIEventType.Click, this.handleTrackClick.bind(this));

    this.updateHandle();
  }

  /**
   * Gets the current value.
   */
  get value(): number {
    return this._value;
  }

  /**
   * Sets the current value.
   */
  set value(val: number) {
    const clamped = Math.max(this.minValue, Math.min(this.maxValue, val));
    let newValue = clamped;

    // Apply step
    if (this.step > 0) {
      const steps = Math.round((newValue - this.minValue) / this.step);
      newValue = this.minValue + steps * this.step;
    }

    // Apply whole numbers
    if (this.wholeNumbers) {
      newValue = Math.round(newValue);
    }

    if (this._value !== newValue) {
      this._value = newValue;
      this.updateHandle();

      if (this._valueChangedCallback) {
        this._valueChangedCallback(this._value);
      }
    }
  }

  /**
   * Gets the normalized value (0-1).
   */
  get normalizedValue(): number {
    const range = this.maxValue - this.minValue;
    if (range === 0) {
      return 0;
    }
    return (this._value - this.minValue) / range;
  }

  /**
   * Sets the normalized value (0-1).
   */
  set normalizedValue(val: number) {
    const range = this.maxValue - this.minValue;
    this.value = this.minValue + val * range;
  }

  /**
   * Updates the handle position based on value.
   */
  protected updateHandle(): void {
    const t = this.normalizedValue;

    if (this.direction === UISliderDirection.Horizontal) {
      const trackWidth = this.size.x - this.handleSize.x;
      this.handle.position.set(trackWidth * t, 0);

      if (this.fill) {
        this.fill.size.set(trackWidth * t + this.handleSize.x * 0.5, this.size.y);
      }
    } else {
      const trackHeight = this.size.y - this.handleSize.y;
      this.handle.position.set(0, trackHeight * (1 - t)); // Invert for bottom-to-top

      if (this.fill) {
        const fillHeight = trackHeight * t + this.handleSize.y * 0.5;
        this.fill.size.set(this.size.x, fillHeight);
        this.fill.position.set(0, this.size.y - fillHeight);
      }
    }
  }

  /**
   * Handles pointer down on handle.
   */
  protected handlePointerDown(event: UIEvent): void {
    // Prepare for drag
    this._dragOffset = event.localPosition.clone();
  }

  /**
   * Handles drag start.
   */
  protected handleDragStart(event: UIEvent): void {
    this._isDragging = true;
  }

  /**
   * Handles drag.
   */
  protected handleDrag(event: UIEvent): void {
    if (!this._isDragging) {
      return;
    }

    const localPos = this.worldToLocal(event.position);

    if (this.direction === UISliderDirection.Horizontal) {
      const trackWidth = this.size.x - this.handleSize.x;
      const handlePos = localPos.x - this._dragOffset.x;
      const t = Math.max(0, Math.min(1, handlePos / trackWidth));
      this.normalizedValue = t;
    } else {
      const trackHeight = this.size.y - this.handleSize.y;
      const handlePos = localPos.y - this._dragOffset.y;
      const t = 1 - Math.max(0, Math.min(1, handlePos / trackHeight));
      this.normalizedValue = t;
    }
  }

  /**
   * Handles drag end.
   */
  protected handleDragEnd(event: UIEvent): void {
    this._isDragging = false;
  }

  /**
   * Handles click on track (jump to position).
   */
  protected handleTrackClick(event: UIEvent): void {
    if (this._isDragging) {
      return;
    }

    const localPos = this.worldToLocal(event.position);

    if (this.direction === UISliderDirection.Horizontal) {
      const t = Math.max(0, Math.min(1, localPos.x / this.size.x));
      this.normalizedValue = t;
    } else {
      const t = 1 - Math.max(0, Math.min(1, localPos.y / this.size.y));
      this.normalizedValue = t;
    }
  }

  /**
   * Sets the value change callback.
   *
   * @param callback - Value change callback
   *
   * @example
   * ```typescript
   * slider.onValueChanged((value) => {
   *   volume = value;
   * });
   * ```
   */
  onValueChanged(callback: (value: number) => void): this {
    this._valueChangedCallback = callback;
    return this;
  }

  /**
   * Sets the value range.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   */
  setRange(min: number, max: number): this {
    this.minValue = min;
    this.maxValue = max;
    this.value = this._value; // Re-clamp current value
    return this;
  }

  /**
   * Sets the slider size.
   */
  setSize(width: number, height: number): this {
    this.size.set(width, height);
    this.background.size.set(width, height);
    this.updateHandle();
    return this;
  }
}
