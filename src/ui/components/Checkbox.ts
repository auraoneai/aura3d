/**
 * @fileoverview Checkbox UI component with checked, unchecked, and indeterminate states.
 * @module ui/components/Checkbox
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

/**
 * Checkbox state
 */
export enum CheckboxState {
  Unchecked = 'unchecked',
  Checked = 'checked',
  Indeterminate = 'indeterminate'
}

/**
 * Checkbox with support for checked, unchecked, and indeterminate states.
 * Features smooth animations and customizable appearance.
 *
 * @example
 * ```typescript
 * const checkbox = new Checkbox();
 * checkbox.position.set(100, 100);
 * checkbox.checked = true;
 * checkbox.onValueChanged((checked) => {
 *   console.log('Checkbox is:', checked ? 'checked' : 'unchecked');
 * });
 * ```
 */
export class Checkbox extends UIElement {
  /**
   * Current checkbox state
   */
  protected _state: CheckboxState;

  /**
   * Whether the checkbox is interactable
   */
  protected _interactable: boolean;

  /**
   * Box size
   */
  public boxSize: number;

  /**
   * Border width
   */
  public borderWidth: number;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Check color
   */
  public checkColor: Color;

  /**
   * Fill color when checked
   */
  public fillColor: Color;

  /**
   * Background color when unchecked
   */
  public override backgroundColor: Color;

  /**
   * Disabled color
   */
  public disabledColor: Color;

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
  protected _valueChangedCallback: ((checked: boolean, state: CheckboxState) => void) | null = null;

  /**
   * Whether the checkbox is currently being hovered
   */
  protected _isHovered: boolean = false;

  /**
   * Creates a new checkbox.
   *
   * @param initialChecked - Initial checked state (default: false)
   *
   * @example
   * ```typescript
   * const agreeCheckbox = new Checkbox(false);
   * agreeCheckbox.onValueChanged((checked) => {
   *   submitButton.interactable = checked;
   * });
   * ```
   */
  constructor(initialChecked: boolean = false) {
    super('Checkbox');

    this._state = initialChecked ? CheckboxState.Checked : CheckboxState.Unchecked;
    this._interactable = true;
    this.boxSize = 20;
    this.borderWidth = 2;
    this.animationDuration = 0.15;
    this._animationProgress = initialChecked ? 1 : 0;
    this._targetAnimationProgress = this._animationProgress;

    // Default colors
    this.borderColor = Color.fromHex(0x757575);
    this.checkColor = Color.white();
    this.fillColor = Color.fromHex(0x2196F3);
    this.backgroundColor = Color.white();
    this.disabledColor = Color.fromHex(0xE0E0E0);

    this.size.set(this.boxSize, this.boxSize);
    this.interactive = true;
    this.blockPointer = true;

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
    this.addEventListener(UIEventType.PointerEnter, this.handlePointerEnter.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
  }

  /**
   * Gets whether the checkbox is checked.
   */
  get checked(): boolean {
    return this._state === CheckboxState.Checked;
  }

  /**
   * Sets whether the checkbox is checked.
   */
  set checked(val: boolean) {
    this.setState(val ? CheckboxState.Checked : CheckboxState.Unchecked);
  }

  /**
   * Gets the current checkbox state.
   */
  get state(): CheckboxState {
    return this._state;
  }

  /**
   * Sets the checkbox state.
   */
  set state(val: CheckboxState) {
    this.setState(val);
  }

  /**
   * Gets whether the checkbox is interactable.
   */
  get interactable(): boolean {
    return this._interactable;
  }

  /**
   * Sets whether the checkbox is interactable.
   */
  set interactable(val: boolean) {
    this._interactable = val;
    this.interactive = val;
  }

  /**
   * Sets the checkbox state.
   */
  protected setState(newState: CheckboxState): void {
    if (this._state === newState) {
      return;
    }

    this._state = newState;
    this._targetAnimationProgress = (newState === CheckboxState.Unchecked) ? 0 : 1;

    if (this._valueChangedCallback) {
      this._valueChangedCallback(this.checked, this._state);
    }
  }

  /**
   * Sets the value change callback.
   *
   * @param callback - Callback function called when value changes
   *
   * @example
   * ```typescript
   * checkbox.onValueChanged((checked, state) => {
   *   console.log('Checkbox state:', state);
   * });
   * ```
   */
  onValueChanged(callback: (checked: boolean, state: CheckboxState) => void): this {
    this._valueChangedCallback = callback;
    return this;
  }

  /**
   * Toggles the checkbox between checked and unchecked.
   */
  toggle(): void {
    this.checked = !this.checked;
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    // Clicking toggles between checked and unchecked
    // Indeterminate state can only be set programmatically
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
   * Updates the checkbox animation.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Animate check mark
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
   * Renders the checkbox.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.boxSize * this.pivot.x;
    const y = pos.y - this.boxSize * this.pivot.y;

    // Determine colors based on state
    const bgColor = this._interactable
      ? this.backgroundColor.lerp(this.fillColor, this._animationProgress)
      : this.disabledColor;

    // Draw background/fill
    context.fillStyle = bgColor.toCSSString();
    context.fillRect(x, y, this.boxSize, this.boxSize);

    // Draw border
    if (this._interactable) {
      context.strokeStyle = this.borderColor.toCSSString();
      context.lineWidth = this.borderWidth;
      context.strokeRect(
        x + this.borderWidth / 2,
        y + this.borderWidth / 2,
        this.boxSize - this.borderWidth,
        this.boxSize - this.borderWidth
      );
    }

    // Draw hover effect
    if (this._isHovered && this._interactable) {
      context.fillStyle = 'rgba(0, 0, 0, 0.05)';
      context.fillRect(x, y, this.boxSize, this.boxSize);
    }

    // Draw check mark or indeterminate bar
    if (this._animationProgress > 0) {
      context.strokeStyle = this.checkColor.toCSSString();
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (this._state === CheckboxState.Indeterminate) {
        // Draw horizontal bar
        const barPadding = this.boxSize * 0.25;
        const barY = y + this.boxSize / 2;
        context.beginPath();
        context.moveTo(x + barPadding, barY);
        context.lineTo(x + this.boxSize - barPadding, barY);
        context.globalAlpha = alpha * this._animationProgress;
        context.stroke();
      } else {
        // Draw check mark
        const padding = this.boxSize * 0.2;
        const checkPoints = [
          { x: x + padding, y: y + this.boxSize / 2 },
          { x: x + this.boxSize * 0.4, y: y + this.boxSize - padding },
          { x: x + this.boxSize - padding, y: y + padding }
        ];

        context.beginPath();
        context.moveTo(checkPoints[0].x, checkPoints[0].y);

        // Animate check mark drawing
        const progress = this._animationProgress;
        if (progress < 0.5) {
          // First segment
          const t = progress * 2;
          const px = checkPoints[0].x + (checkPoints[1].x - checkPoints[0].x) * t;
          const py = checkPoints[0].y + (checkPoints[1].y - checkPoints[0].y) * t;
          context.lineTo(px, py);
        } else {
          // Complete first segment, draw second
          context.lineTo(checkPoints[1].x, checkPoints[1].y);
          const t = (progress - 0.5) * 2;
          const px = checkPoints[1].x + (checkPoints[2].x - checkPoints[1].x) * t;
          const py = checkPoints[1].y + (checkPoints[2].y - checkPoints[1].y) * t;
          context.lineTo(px, py);
        }

        context.stroke();
      }
    }

    context.restore();
  }

  /**
   * Sets the checkbox colors.
   *
   * @param fill - Fill color when checked
   * @param check - Check mark color
   * @param border - Border color (optional)
   */
  setColors(fill: Color, check: Color, border?: Color): this {
    this.fillColor = fill.clone();
    this.checkColor = check.clone();
    if (border) {
      this.borderColor = border.clone();
    }
    return this;
  }

  /**
   * Sets the checkbox size.
   *
   * @param size - Box size
   */
  setSize(size: number): this {
    this.boxSize = size;
    this.size.set(size, size);
    return this;
  }
}
