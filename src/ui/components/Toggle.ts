/**
 * @fileoverview Toggle switch UI component with on/off states and smooth transitions.
 * @module ui/components/Toggle
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

/**
 * Toggle switch with on/off states, smooth animations, and value change events.
 * Provides a modern switch-style toggle control for boolean settings.
 *
 * @example
 * ```typescript
 * const toggle = new Toggle();
 * toggle.position.set(100, 100);
 * toggle.value = true;
 * toggle.onValueChanged((value) => {
 *   console.log('Toggle is now:', value ? 'ON' : 'OFF');
 * });
 * ```
 */
export class Toggle extends UIElement {
  /**
   * Current toggle value (on/off)
   */
  protected _value: boolean;

  /**
   * Whether the toggle is interactable
   */
  protected _interactable: boolean;

  /**
   * Background track color (off state)
   */
  public trackColorOff: Color;

  /**
   * Background track color (on state)
   */
  public trackColorOn: Color;

  /**
   * Thumb (knob) color
   */
  public thumbColor: Color;

  /**
   * Disabled track color
   */
  public trackColorDisabled: Color;

  /**
   * Track width
   */
  public trackWidth: number;

  /**
   * Track height
   */
  public trackHeight: number;

  /**
   * Thumb size (diameter)
   */
  public thumbSize: number;

  /**
   * Animation duration in seconds
   */
  public animationDuration: number;

  /**
   * Current animation progress [0, 1]
   */
  protected _animationProgress: number;

  /**
   * Target animation progress [0, 1]
   */
  protected _targetAnimationProgress: number;

  /**
   * Value change callback
   */
  protected _valueChangedCallback: ((value: boolean) => void) | null = null;

  /**
   * Whether the toggle is currently being hovered
   */
  protected _isHovered: boolean = false;

  /**
   * Creates a new toggle switch.
   *
   * @param initialValue - Initial toggle state (default: false)
   *
   * @example
   * ```typescript
   * const soundToggle = new Toggle(true);
   * soundToggle.onValueChanged((enabled) => {
   *   audio.setMuted(!enabled);
   * });
   * ```
   */
  constructor(initialValue: boolean = false) {
    super('Toggle');

    this._value = initialValue;
    this._interactable = true;
    this.trackWidth = 50;
    this.trackHeight = 24;
    this.thumbSize = 20;
    this.animationDuration = 0.2;
    this._animationProgress = initialValue ? 1 : 0;
    this._targetAnimationProgress = this._animationProgress;

    // Default colors
    this.trackColorOff = Color.fromHex(0xBDBDBD);
    this.trackColorOn = Color.fromHex(0x4CAF50);
    this.thumbColor = Color.white();
    this.trackColorDisabled = Color.fromHex(0xE0E0E0);

    this.size.set(this.trackWidth, this.trackHeight);
    this.interactive = true;
    this.blockPointer = true;

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
    this.addEventListener(UIEventType.PointerEnter, this.handlePointerEnter.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
  }

  /**
   * Gets the current toggle value.
   */
  get value(): boolean {
    return this._value;
  }

  /**
   * Sets the toggle value.
   */
  set value(val: boolean) {
    if (this._value !== val) {
      this._value = val;
      this._targetAnimationProgress = val ? 1 : 0;

      if (this._valueChangedCallback) {
        this._valueChangedCallback(val);
      }
    }
  }

  /**
   * Gets whether the toggle is interactable.
   */
  get interactable(): boolean {
    return this._interactable;
  }

  /**
   * Sets whether the toggle is interactable.
   */
  set interactable(val: boolean) {
    this._interactable = val;
    this.interactive = val;
  }

  /**
   * Sets the value change callback.
   *
   * @param callback - Callback function called when value changes
   *
   * @example
   * ```typescript
   * toggle.onValueChanged((isOn) => {
   *   console.log('Toggle changed:', isOn);
   * });
   * ```
   */
  onValueChanged(callback: (value: boolean) => void): this {
    this._valueChangedCallback = callback;
    return this;
  }

  /**
   * Toggles the current value.
   */
  toggle(): void {
    this.value = !this._value;
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    this.toggle();
  }

  /**
   * Handles pointer enter event.
   */
  protected handlePointerEnter(event: UIEvent): void {
    this._isHovered = true;
  }

  /**
   * Handles pointer leave event.
   */
  protected handlePointerLeave(event: UIEvent): void {
    this._isHovered = false;
  }

  /**
   * Updates the toggle animation.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Animate thumb position
    if (this._animationProgress !== this._targetAnimationProgress) {
      const speed = deltaTime / this.animationDuration;

      if (this._targetAnimationProgress > this._animationProgress) {
        this._animationProgress = Math.min(
          this._animationProgress + speed,
          this._targetAnimationProgress
        );
      } else {
        this._animationProgress = Math.max(
          this._animationProgress - speed,
          this._targetAnimationProgress
        );
      }
    }
  }

  /**
   * Renders the toggle switch.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    // Calculate colors based on state
    const trackColor = this._interactable
      ? this.trackColorOff.lerp(this.trackColorOn, this._animationProgress)
      : this.trackColorDisabled;

    // Draw track (rounded rectangle)
    const trackX = pos.x - this.trackWidth * this.pivot.x;
    const trackY = pos.y - this.trackHeight * this.pivot.y;
    const radius = this.trackHeight / 2;

    context.fillStyle = trackColor.toCSSString();
    context.beginPath();
    context.roundRect(trackX, trackY, this.trackWidth, this.trackHeight, radius);
    context.fill();

    // Calculate thumb position
    const thumbRadius = this.thumbSize / 2;
    const thumbTravelDistance = this.trackWidth - this.thumbSize;
    const thumbX = trackX + thumbRadius + thumbTravelDistance * this._animationProgress;
    const thumbY = trackY + this.trackHeight / 2;

    // Draw thumb shadow if hovered
    if (this._isHovered && this._interactable) {
      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.beginPath();
      context.arc(thumbX, thumbY + 2, thumbRadius + 2, 0, Math.PI * 2);
      context.fill();
    }

    // Draw thumb
    context.fillStyle = this.thumbColor.toCSSString();
    context.beginPath();
    context.arc(thumbX, thumbY, thumbRadius, 0, Math.PI * 2);
    context.fill();

    // Draw thumb border
    context.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    context.lineWidth = 1;
    context.stroke();

    context.restore();
  }

  /**
   * Sets the toggle colors.
   *
   * @param trackOff - Track color when off
   * @param trackOn - Track color when on
   * @param thumb - Thumb color (optional)
   */
  setColors(trackOff: Color, trackOn: Color, thumb?: Color): this {
    this.trackColorOff = trackOff.clone();
    this.trackColorOn = trackOn.clone();
    if (thumb) {
      this.thumbColor = thumb.clone();
    }
    return this;
  }

  /**
   * Sets the toggle size.
   *
   * @param width - Track width
   * @param height - Track height
   */
  setSize(width: number, height: number): this {
    this.trackWidth = width;
    this.trackHeight = height;
    this.thumbSize = height - 4; // Slightly smaller than track height
    this.size.set(width, height);
    return this;
  }
}
