/**
 * @fileoverview Slider component with min/max, step, and value change events.
 * @module ui/components/Slider
 */

import { UIElement, UIEvent, UIEventType } from '../UIElement';
import { Color } from '../../math/Color';
import { Rect } from '../../math/Rect';
import { Vector2 } from '../../math/Vector2';

/**
 * Slider orientation
 */
export enum SliderOrientation {
  Horizontal = 'horizontal',
  Vertical = 'vertical'
}

/**
 * Value change event callback
 */
export type SliderValueChangeCallback = (value: number, slider: Slider) => void;

/**
 * Slider component for selecting numeric values from a range.
 * Supports customizable appearance, step increments, and value constraints.
 *
 * @example
 * ```typescript
 * // Create a horizontal slider
 * const slider = new Slider();
 * slider.position.set(100, 100);
 * slider.size.set(200, 20);
 * slider.min = 0;
 * slider.max = 100;
 * slider.value = 50;
 * slider.onValueChange = (value) => console.log('Value:', value);
 *
 * // Create a vertical volume slider
 * const volumeSlider = new Slider();
 * volumeSlider.orientation = SliderOrientation.Vertical;
 * volumeSlider.size.set(20, 150);
 * volumeSlider.min = 0;
 * volumeSlider.max = 1;
 * volumeSlider.step = 0.1;
 * volumeSlider.value = 0.7;
 * ```
 */
export class Slider extends UIElement {
  /**
   * Minimum value
   */
  public min: number;

  /**
   * Maximum value
   */
  public max: number;

  /**
   * Current value
   */
  protected _value: number;

  /**
   * Step increment (0 = continuous)
   */
  public step: number;

  /**
   * Slider orientation
   */
  public orientation: SliderOrientation;

  /**
   * Track background color
   */
  public trackColor: Color;

  /**
   * Fill color (shows value progress)
   */
  public fillColor: Color;

  /**
   * Handle (thumb) color
   */
  public handleColor: Color;

  /**
   * Handle hover color
   */
  public handleHoverColor: Color;

  /**
   * Handle size
   */
  public handleSize: number;

  /**
   * Track height (for horizontal) or width (for vertical)
   */
  public trackThickness: number;

  /**
   * Track corner radius
   */
  public trackRadius: number;

  /**
   * Handle corner radius
   */
  public handleRadius: number;

  /**
   * Whether to show value label
   */
  public showValueLabel: boolean;

  /**
   * Value label format function
   */
  public formatValue: (value: number) => string;

  /**
   * Value label font
   */
  public labelFont: string;

  /**
   * Value label color
   */
  public labelColor: Color;

  /**
   * Value change callback
   */
  public onValueChange: SliderValueChangeCallback | null;

  /**
   * Whether handle is being dragged
   */
  protected override _isDragging: boolean;

  /**
   * Whether pointer is over handle
   */
  protected _isHandleHovered: boolean;

  /**
   * Creates a new Slider.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   * @param value - Initial value
   *
   * @example
   * ```typescript
   * const slider = new Slider(0, 100, 50);
   * slider.step = 5;
   * slider.onValueChange = (value) => updateVolume(value);
   * ```
   */
  constructor(min: number = 0, max: number = 100, value: number = 50) {
    super('Slider');

    this.min = min;
    this.max = max;
    this._value = this.clampValue(value);
    this.step = 0;

    this.orientation = SliderOrientation.Horizontal;

    this.trackColor = Color.fromHex(0xE0E0E0);
    this.fillColor = Color.fromHex(0x2196F3);
    this.handleColor = Color.fromHex(0x1976D2);
    this.handleHoverColor = Color.fromHex(0x0D47A1);

    this.handleSize = 20;
    this.trackThickness = 6;
    this.trackRadius = 3;
    this.handleRadius = 10;

    this.showValueLabel = false;
    this.formatValue = (value: number) => value.toFixed(this.step === 0 ? 2 : 0);
    this.labelFont = '12px Arial';
    this.labelColor = Color.fromHex(0x333333);

    this.onValueChange = null;

    this._isDragging = false;
    this._isHandleHovered = false;

    this.size.set(200, 30);
    this.interactive = true;

    this.setupEventListeners();
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
  set value(newValue: number) {
    const clamped = this.clampValue(newValue);
    if (this._value !== clamped) {
      this._value = clamped;
      if (this.onValueChange) {
        this.onValueChange(this._value, this);
      }
    }
  }

  /**
   * Gets the normalized value [0-1].
   */
  get normalizedValue(): number {
    if (this.max === this.min) return 0;
    return (this._value - this.min) / (this.max - this.min);
  }

  /**
   * Sets the normalized value [0-1].
   */
  set normalizedValue(t: number) {
    this.value = this.min + t * (this.max - this.min);
  }

  /**
   * Clamps and steps the value.
   */
  protected clampValue(value: number): number {
    let clamped = Math.max(this.min, Math.min(this.max, value));

    if (this.step > 0) {
      const steps = Math.round((clamped - this.min) / this.step);
      clamped = this.min + steps * this.step;
    }

    return clamped;
  }

  /**
   * Sets up event listeners.
   */
  protected setupEventListeners(): void {
    this.addEventListener(UIEventType.PointerDown, this.handlePointerDown.bind(this));
    this.addEventListener(UIEventType.PointerMove, this.handlePointerMove.bind(this));
    this.addEventListener(UIEventType.PointerUp, this.handlePointerUp.bind(this));
    this.addEventListener(UIEventType.PointerEnter, this.handlePointerEnter.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
  }

  /**
   * Gets the handle rectangle.
   */
  protected getHandleRect(): Rect {
    const bounds = this.localBounds;
    const t = this.normalizedValue;

    if (this.orientation === SliderOrientation.Horizontal) {
      const trackY = bounds.y + (bounds.height - this.trackThickness) * 0.5;
      const handleX = bounds.x + t * (bounds.width - this.handleSize);
      const handleY = bounds.y + (bounds.height - this.handleSize) * 0.5;

      return new Rect(handleX, handleY, this.handleSize, this.handleSize);
    } else {
      const trackX = bounds.x + (bounds.width - this.trackThickness) * 0.5;
      const handleX = bounds.x + (bounds.width - this.handleSize) * 0.5;
      const handleY = bounds.y + bounds.height - this.handleSize - t * (bounds.height - this.handleSize);

      return new Rect(handleX, handleY, this.handleSize, this.handleSize);
    }
  }

  /**
   * Gets value from pointer position.
   */
  protected getValueFromPosition(localPos: Vector2): number {
    const bounds = this.localBounds;

    if (this.orientation === SliderOrientation.Horizontal) {
      const t = (localPos.x - bounds.x) / bounds.width;
      return this.min + t * (this.max - this.min);
    } else {
      const t = 1 - (localPos.y - bounds.y) / bounds.height;
      return this.min + t * (this.max - this.min);
    }
  }

  /**
   * Handles pointer down event.
   */
  protected handlePointerDown(event: UIEvent): void {
    this._isDragging = true;
    this.value = this.getValueFromPosition(event.localPosition);
  }

  /**
   * Handles pointer move event.
   */
  protected handlePointerMove(event: UIEvent): void {
    // Check if pointer is over handle
    const handleRect = this.getHandleRect();
    const worldPos = this.localToWorld(event.localPosition);
    this._isHandleHovered = handleRect.contains(event.localPosition);

    if (this._isDragging) {
      this.value = this.getValueFromPosition(event.localPosition);
    }
  }

  /**
   * Handles pointer up event.
   */
  protected handlePointerUp(event: UIEvent): void {
    this._isDragging = false;
  }

  /**
   * Handles pointer enter event.
   */
  protected handlePointerEnter(event: UIEvent): void {
    // Handled in pointer move
  }

  /**
   * Handles pointer leave event.
   */
  protected handlePointerLeave(event: UIEvent): void {
    this._isHandleHovered = false;
  }

  /**
   * Updates the slider.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
  }

  /**
   * Renders the slider.
   */
  override render(context: CanvasRenderingContext2D): void {
    const bounds = this.localBounds;
    const t = this.normalizedValue;

    context.save();

    if (this.orientation === SliderOrientation.Horizontal) {
      // Horizontal track
      const trackY = bounds.y + (bounds.height - this.trackThickness) * 0.5;
      const trackWidth = bounds.width;

      // Draw track background
      context.fillStyle = this.trackColor.toCSSString();
      if (this.trackRadius > 0) {
        context.beginPath();
        context.roundRect(bounds.x, trackY, trackWidth, this.trackThickness, this.trackRadius);
        context.fill();
      } else {
        context.fillRect(bounds.x, trackY, trackWidth, this.trackThickness);
      }

      // Draw fill
      const fillWidth = t * trackWidth;
      context.fillStyle = this.fillColor.toCSSString();
      if (this.trackRadius > 0) {
        context.beginPath();
        context.roundRect(bounds.x, trackY, fillWidth, this.trackThickness, this.trackRadius);
        context.fill();
      } else {
        context.fillRect(bounds.x, trackY, fillWidth, this.trackThickness);
      }

      // Draw handle
      const handleRect = this.getHandleRect();
      const handleColor = this._isHandleHovered || this._isDragging ? this.handleHoverColor : this.handleColor;
      context.fillStyle = handleColor.toCSSString();

      if (this.handleRadius > 0) {
        context.beginPath();
        context.arc(
          handleRect.x + handleRect.width * 0.5,
          handleRect.y + handleRect.height * 0.5,
          this.handleSize * 0.5,
          0,
          Math.PI * 2
        );
        context.fill();
      } else {
        context.fillRect(handleRect.x, handleRect.y, handleRect.width, handleRect.height);
      }
    } else {
      // Vertical track
      const trackX = bounds.x + (bounds.width - this.trackThickness) * 0.5;
      const trackHeight = bounds.height;

      // Draw track background
      context.fillStyle = this.trackColor.toCSSString();
      if (this.trackRadius > 0) {
        context.beginPath();
        context.roundRect(trackX, bounds.y, this.trackThickness, trackHeight, this.trackRadius);
        context.fill();
      } else {
        context.fillRect(trackX, bounds.y, this.trackThickness, trackHeight);
      }

      // Draw fill (from bottom)
      const fillHeight = t * trackHeight;
      const fillY = bounds.y + trackHeight - fillHeight;
      context.fillStyle = this.fillColor.toCSSString();
      if (this.trackRadius > 0) {
        context.beginPath();
        context.roundRect(trackX, fillY, this.trackThickness, fillHeight, this.trackRadius);
        context.fill();
      } else {
        context.fillRect(trackX, fillY, this.trackThickness, fillHeight);
      }

      // Draw handle
      const handleRect = this.getHandleRect();
      const handleColor = this._isHandleHovered || this._isDragging ? this.handleHoverColor : this.handleColor;
      context.fillStyle = handleColor.toCSSString();

      if (this.handleRadius > 0) {
        context.beginPath();
        context.arc(
          handleRect.x + handleRect.width * 0.5,
          handleRect.y + handleRect.height * 0.5,
          this.handleSize * 0.5,
          0,
          Math.PI * 2
        );
        context.fill();
      } else {
        context.fillRect(handleRect.x, handleRect.y, handleRect.width, handleRect.height);
      }
    }

    // Draw value label
    if (this.showValueLabel) {
      context.font = this.labelFont;
      context.fillStyle = this.labelColor.toCSSString();
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      const label = this.formatValue(this._value);
      const handleRect = this.getHandleRect();
      const labelY = this.orientation === SliderOrientation.Horizontal
        ? handleRect.y - 15
        : handleRect.y + handleRect.height * 0.5;

      context.fillText(label, handleRect.x + handleRect.width * 0.5, labelY);
    }

    context.restore();
  }

  /**
   * Sets the value range.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns This slider for chaining
   */
  setRange(min: number, max: number): this {
    this.min = min;
    this.max = max;
    this.value = this.clampValue(this._value);
    return this;
  }

  /**
   * Creates a percentage slider (0-100).
   *
   * @param value - Initial value
   * @returns New slider instance
   */
  static createPercentage(value: number = 50): Slider {
    const slider = new Slider(0, 100, value);
    slider.step = 1;
    slider.formatValue = (v) => `${Math.round(v)}%`;
    slider.showValueLabel = true;
    return slider;
  }

  /**
   * Creates a volume slider (0-1).
   *
   * @param value - Initial value
   * @returns New slider instance
   */
  static createVolume(value: number = 0.7): Slider {
    const slider = new Slider(0, 1, value);
    slider.step = 0.01;
    slider.formatValue = (v) => `${Math.round(v * 100)}%`;
    slider.orientation = SliderOrientation.Vertical;
    slider.size.set(30, 150);
    return slider;
  }
}
