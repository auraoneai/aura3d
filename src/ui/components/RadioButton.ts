/**
 * @fileoverview Radio button UI component with group management for mutually exclusive selections.
 * @module ui/components/RadioButton
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { Color } from '../../math/Color';

/**
 * Radio button group manager.
 * Ensures only one radio button in a group is selected at a time.
 */
export class RadioButtonGroup {
  /**
   * Group name
   */
  public readonly name: string;

  /**
   * Radio buttons in this group
   */
  protected _buttons: Set<RadioButton> = new Set();

  /**
   * Currently selected button
   */
  protected _selectedButton: RadioButton | null = null;

  /**
   * Selection change callback
   */
  protected _onSelectionChanged: ((button: RadioButton | null, value: string) => void) | null = null;

  /**
   * Creates a new radio button group.
   *
   * @param name - Group name
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Adds a radio button to this group.
   */
  addButton(button: RadioButton): void {
    this._buttons.add(button);
  }

  /**
   * Removes a radio button from this group.
   */
  removeButton(button: RadioButton): void {
    this._buttons.delete(button);
    if (this._selectedButton === button) {
      this._selectedButton = null;
    }
  }

  /**
   * Selects a button in this group.
   */
  selectButton(button: RadioButton): void {
    if (this._selectedButton === button) {
      return;
    }

    // Deselect previous button
    if (this._selectedButton) {
      this._selectedButton.setSelectedInternal(false);
    }

    this._selectedButton = button;

    if (this._onSelectionChanged) {
      this._onSelectionChanged(button, button.value);
    }
  }

  /**
   * Gets the currently selected button.
   */
  get selectedButton(): RadioButton | null {
    return this._selectedButton;
  }

  /**
   * Gets the value of the selected button.
   */
  get selectedValue(): string {
    return this._selectedButton?.value ?? '';
  }

  /**
   * Sets the selection changed callback.
   */
  onSelectionChanged(callback: (button: RadioButton | null, value: string) => void): this {
    this._onSelectionChanged = callback;
    return this;
  }

  /**
   * Deselects all buttons in the group.
   */
  deselectAll(): void {
    if (this._selectedButton) {
      this._selectedButton.setSelectedInternal(false);
      this._selectedButton = null;
    }
  }
}

/**
 * Radio button with group management for mutually exclusive selections.
 * Only one radio button in a group can be selected at a time.
 *
 * @example
 * ```typescript
 * const group = new RadioButtonGroup('difficulty');
 *
 * const easyRadio = new RadioButton('easy', group);
 * easyRadio.position.set(100, 100);
 *
 * const hardRadio = new RadioButton('hard', group);
 * hardRadio.position.set(100, 130);
 *
 * group.onSelectionChanged((button, value) => {
 *   console.log('Selected difficulty:', value);
 * });
 * ```
 */
export class RadioButton extends UIElement {
  /**
   * Radio button value
   */
  public readonly value: string;

  /**
   * Radio button group
   */
  protected _group: RadioButtonGroup | null;

  /**
   * Whether this radio button is selected
   */
  protected _selected: boolean;

  /**
   * Whether the radio button is interactable
   */
  protected _interactable: boolean;

  /**
   * Circle size (diameter)
   */
  public circleSize: number;

  /**
   * Border width
   */
  public borderWidth: number;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Fill color when selected
   */
  public fillColor: Color;

  /**
   * Background color
   */
  public override backgroundColor: Color;

  /**
   * Disabled color
   */
  public disabledColor: Color;

  /**
   * Inner circle size ratio (relative to circle size)
   */
  public innerCircleRatio: number;

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
   * Whether the radio button is currently being hovered
   */
  protected _isHovered: boolean = false;

  /**
   * Creates a new radio button.
   *
   * @param value - Radio button value
   * @param group - Radio button group (optional)
   * @param initialSelected - Initial selected state (default: false)
   *
   * @example
   * ```typescript
   * const group = new RadioButtonGroup('size');
   * const smallRadio = new RadioButton('small', group);
   * const mediumRadio = new RadioButton('medium', group, true); // Initially selected
   * ```
   */
  constructor(value: string, group?: RadioButtonGroup, initialSelected: boolean = false) {
    super('RadioButton');

    this.value = value;
    this._group = group ?? null;
    this._selected = initialSelected;
    this._interactable = true;
    this.circleSize = 20;
    this.borderWidth = 2;
    this.innerCircleRatio = 0.5;
    this.animationDuration = 0.15;
    this._animationProgress = initialSelected ? 1 : 0;
    this._targetAnimationProgress = this._animationProgress;

    // Default colors
    this.borderColor = Color.fromHex(0x757575);
    this.fillColor = Color.fromHex(0x2196F3);
    this.backgroundColor = Color.white();
    this.disabledColor = Color.fromHex(0xE0E0E0);

    this.size.set(this.circleSize, this.circleSize);
    this.interactive = true;
    this.blockPointer = true;

    // Add to group
    if (this._group) {
      this._group.addButton(this);
      if (initialSelected) {
        this._group.selectButton(this);
      }
    }

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
    this.addEventListener(UIEventType.PointerEnter, this.handlePointerEnter.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
  }

  /**
   * Gets whether the radio button is selected.
   */
  get selected(): boolean {
    return this._selected;
  }

  /**
   * Sets whether the radio button is selected.
   */
  set selected(val: boolean) {
    if (val && !this._selected) {
      this.select();
    } else if (!val && this._selected) {
      this.deselect();
    }
  }

  /**
   * Gets whether the radio button is interactable.
   */
  get interactable(): boolean {
    return this._interactable;
  }

  /**
   * Sets whether the radio button is interactable.
   */
  set interactable(val: boolean) {
    this._interactable = val;
    this.interactive = val;
  }

  /**
   * Gets the radio button group.
   */
  get group(): RadioButtonGroup | null {
    return this._group;
  }

  /**
   * Selects this radio button.
   */
  select(): void {
    if (!this._interactable || this._selected) {
      return;
    }

    this._selected = true;
    this._targetAnimationProgress = 1;

    if (this._group) {
      this._group.selectButton(this);
    }
  }

  /**
   * Deselects this radio button.
   */
  deselect(): void {
    if (!this._selected) {
      return;
    }

    this._selected = false;
    this._targetAnimationProgress = 0;
  }

  /**
   * Internal method to set selected state without triggering group logic.
   * Used by RadioButtonGroup.
   */
  setSelectedInternal(selected: boolean): void {
    this._selected = selected;
    this._targetAnimationProgress = selected ? 1 : 0;
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    this.select();
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
   * Updates the radio button animation.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Animate inner circle
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
   * Renders the radio button.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const centerX = pos.x;
    const centerY = pos.y;
    const radius = this.circleSize / 2;

    // Draw background circle
    const bgColor = this._interactable ? this.backgroundColor : this.disabledColor;
    context.fillStyle = bgColor.toCSSString();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    // Draw border
    if (this._interactable) {
      context.strokeStyle = this.borderColor.toCSSString();
      context.lineWidth = this.borderWidth;
      context.stroke();
    }

    // Draw hover effect
    if (this._isHovered && this._interactable) {
      context.fillStyle = 'rgba(0, 0, 0, 0.05)';
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();
    }

    // Draw inner circle when selected
    if (this._animationProgress > 0) {
      const innerRadius = radius * this.innerCircleRatio * this._animationProgress;
      context.fillStyle = this.fillColor.toCSSString();
      context.beginPath();
      context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  /**
   * Sets the radio button colors.
   *
   * @param fill - Fill color when selected
   * @param border - Border color (optional)
   */
  setColors(fill: Color, border?: Color): this {
    this.fillColor = fill.clone();
    if (border) {
      this.borderColor = border.clone();
    }
    return this;
  }

  /**
   * Sets the radio button size.
   *
   * @param size - Circle diameter
   */
  setSize(size: number): this {
    this.circleSize = size;
    this.size.set(size, size);
    return this;
  }

  /**
   * Destroys the radio button and removes it from its group.
   */
  override destroy(): void {
    if (this._group) {
      this._group.removeButton(this);
    }
    super.destroy();
  }
}
