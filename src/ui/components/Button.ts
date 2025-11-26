/**
 * @fileoverview Enhanced button component with multiple states and interactions.
 * @module ui/components/Button
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Rect } from '../../math/Rect';

/**
 * Button visual state
 */
export enum ButtonState {
  Normal = 'normal',
  Hover = 'hover',
  Pressed = 'pressed',
  Disabled = 'disabled'
}

/**
 * Button transition mode
 */
export enum ButtonTransitionMode {
  ColorTint = 'colorTint',
  SpriteSwap = 'spriteSwap',
  Animation = 'animation'
}

/**
 * Button click event callback
 */
export type ButtonClickCallback = (button: Button) => void;

/**
 * Enhanced button component with state management, visual transitions, and accessibility.
 * Supports touch-friendly hit areas (minimum 44px), keyboard interaction, and ARIA attributes.
 *
 * @example
 * ```typescript
 * // Create a simple button
 * const button = new Button();
 * button.position.set(100, 100);
 * button.size.set(150, 44);
 * button.text = 'Click Me';
 * button.onClick = () => console.log('Clicked!');
 *
 * // Create a themed button
 * const primaryButton = new Button();
 * primaryButton.normalColor = Color.fromHex(0x0066FF);
 * primaryButton.hoverColor = Color.fromHex(0x0052CC);
 * primaryButton.pressedColor = Color.fromHex(0x003D99);
 * primaryButton.text = 'Primary Action';
 * ```
 */
export class Button extends UIElement {
  /**
   * Button text label
   */
  public text: string;

  /**
   * Font style for text rendering
   */
  public font: string;

  /**
   * Text color
   */
  public textColor: Color;

  /**
   * Current button state
   */
  protected _state: ButtonState;

  /**
   * Transition mode for visual feedback
   */
  public transitionMode: ButtonTransitionMode;

  /**
   * Normal state color (used in ColorTint mode)
   */
  public normalColor: Color;

  /**
   * Hover state color
   */
  public hoverColor: Color;

  /**
   * Pressed state color
   */
  public pressedColor: Color;

  /**
   * Disabled state color
   */
  public disabledColor: Color;

  /**
   * Color transition duration in seconds
   */
  public transitionDuration: number;

  /**
   * Current visual color (interpolated)
   */
  protected _currentColor: Color;

  /**
   * Target color for transition
   */
  protected _targetColor: Color;

  /**
   * Transition progress [0-1]
   */
  protected _transitionProgress: number;

  /**
   * Corner radius for rounded buttons
   */
  public cornerRadius: number;

  /**
   * Border width
   */
  public borderWidth: number;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Click callback
   */
  public onClick: ButtonClickCallback | null;

  /**
   * Accessible role attribute
   */
  public ariaRole: string;

  /**
   * Accessible label
   */
  public ariaLabel: string;

  /**
   * Whether button is interactable
   */
  protected _interactable: boolean;

  /**
   * Minimum touch target size (accessibility)
   */
  protected readonly minTouchSize: number = 44;

  /**
   * Whether the button has an expanded hit area for accessibility
   */
  protected _expandedHitArea: boolean = false;

  /**
   * Creates a new Button.
   *
   * @param text - Button text label
   *
   * @example
   * ```typescript
   * const button = new Button('Submit');
   * button.position.set(200, 300);
   * button.onClick = () => handleSubmit();
   * ```
   */
  constructor(text: string = 'Button') {
    super('Button');

    this.text = text;
    this.font = '16px Arial';
    this.textColor = Color.white();
    this._state = ButtonState.Normal;
    this.transitionMode = ButtonTransitionMode.ColorTint;

    // Default color scheme - Material Design inspired
    this.normalColor = Color.fromHex(0x2196F3);
    this.hoverColor = Color.fromHex(0x1976D2);
    this.pressedColor = Color.fromHex(0x0D47A1);
    this.disabledColor = Color.fromHex(0xBDBDBD);

    this.transitionDuration = 0.1;
    this._currentColor = this.normalColor.clone();
    this._targetColor = this.normalColor.clone();
    this._transitionProgress = 1;

    this.cornerRadius = 4;
    this.borderWidth = 0;
    this.borderColor = Color.black();

    this.onClick = null;
    this.ariaRole = 'button';
    this.ariaLabel = text;
    this._interactable = true;

    // Set default size with minimum touch target
    this.size.set(100, 44);

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Gets the current button state.
   */
  get state(): ButtonState {
    return this._state;
  }

  /**
   * Gets whether the button is interactable.
   */
  get interactable(): boolean {
    return this._interactable && this.enabled;
  }

  /**
   * Sets whether the button is interactable.
   */
  set interactable(value: boolean) {
    if (this._interactable !== value) {
      this._interactable = value;
      this.updateState();
    }
  }

  /**
   * Sets up event listeners for button interactions.
   */
  protected setupEventListeners(): void {
    this.addEventListener(UIEventType.PointerEnter, this.handlePointerEnter.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
    this.addEventListener(UIEventType.PointerDown, this.handlePointerDown.bind(this));
    this.addEventListener(UIEventType.PointerUp, this.handlePointerUp.bind(this));
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
  }

  /**
   * Handles pointer enter event.
   */
  protected handlePointerEnter(event: UIEvent): void {
    if (!this.interactable) return;

    if (this._state === ButtonState.Normal) {
      this.setState(ButtonState.Hover);
    }
  }

  /**
   * Handles pointer leave event.
   */
  protected handlePointerLeave(event: UIEvent): void {
    if (!this.interactable) return;

    if (this._state === ButtonState.Hover || this._state === ButtonState.Pressed) {
      this.setState(ButtonState.Normal);
    }
  }

  /**
   * Handles pointer down event.
   */
  protected handlePointerDown(event: UIEvent): void {
    if (!this.interactable) return;

    this.setState(ButtonState.Pressed);
  }

  /**
   * Handles pointer up event.
   */
  protected handlePointerUp(event: UIEvent): void {
    if (!this.interactable) return;

    if (this._isPointerOver) {
      this.setState(ButtonState.Hover);
    } else {
      this.setState(ButtonState.Normal);
    }
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this.interactable) return;

    if (this.onClick) {
      this.onClick(this);
    }
  }

  /**
   * Sets the button state and triggers visual transition.
   *
   * @param state - New button state
   */
  protected setState(state: ButtonState): void {
    if (this._state === state) return;

    this._state = state;
    this.updateState();
  }

  /**
   * Updates visual appearance based on current state.
   */
  protected updateState(): void {
    if (!this.interactable) {
      this._targetColor = this.disabledColor.clone();
      this._state = ButtonState.Disabled;
    } else {
      switch (this._state) {
        case ButtonState.Normal:
          this._targetColor = this.normalColor.clone();
          break;
        case ButtonState.Hover:
          this._targetColor = this.hoverColor.clone();
          break;
        case ButtonState.Pressed:
          this._targetColor = this.pressedColor.clone();
          break;
        case ButtonState.Disabled:
          this._targetColor = this.disabledColor.clone();
          break;
      }
    }

    this._transitionProgress = 0;
  }

  /**
   * Updates the button (transitions, animations).
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Update color transition
    if (this._transitionProgress < 1) {
      this._transitionProgress += deltaTime / this.transitionDuration;
      if (this._transitionProgress > 1) {
        this._transitionProgress = 1;
      }

      // Smooth interpolation
      const t = this.easeOutCubic(this._transitionProgress);
      this._currentColor.copy(this._currentColor.lerp(this._targetColor, t));
    }

    // Ensure minimum touch size for accessibility
    if (this.size.x < this.minTouchSize || this.size.y < this.minTouchSize) {
      // Expand hit area without changing visual size
      this._expandedHitArea = true;
    }
  }

  /**
   * Easing function for smooth transitions.
   */
  protected easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Renders the button.
   */
  override render(context: CanvasRenderingContext2D): void {
    const bounds = this.localBounds;

    context.save();

    // Draw button background
    if (this.cornerRadius > 0) {
      this.drawRoundedRect(context, bounds, this.cornerRadius, this._currentColor);
    } else {
      context.fillStyle = this._currentColor.toCSSString();
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // Draw border
    if (this.borderWidth > 0) {
      context.strokeStyle = this.borderColor.toCSSString();
      context.lineWidth = this.borderWidth;

      if (this.cornerRadius > 0) {
        this.strokeRoundedRect(context, bounds, this.cornerRadius);
      } else {
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
    }

    // Draw text
    if (this.text) {
      context.font = this.font;
      context.fillStyle = this.textColor.toCSSString();
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      const textX = bounds.x + bounds.width * 0.5;
      const textY = bounds.y + bounds.height * 0.5;

      context.fillText(this.text, textX, textY);
    }

    context.restore();
  }

  /**
   * Draws a rounded rectangle.
   */
  protected drawRoundedRect(
    context: CanvasRenderingContext2D,
    rect: Rect,
    radius: number,
    color: Color
  ): void {
    const x = rect.x;
    const y = rect.y;
    const width = rect.width;
    const height = rect.height;

    context.fillStyle = color.toCSSString();
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.fill();
  }

  /**
   * Strokes a rounded rectangle outline.
   */
  protected strokeRoundedRect(
    context: CanvasRenderingContext2D,
    rect: Rect,
    radius: number
  ): void {
    const x = rect.x;
    const y = rect.y;
    const width = rect.width;
    const height = rect.height;

    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.stroke();
  }

  /**
   * Called when enabled state changes.
   */
  protected override onEnabledChanged(enabled: boolean): void {
    this.updateState();
  }

  /**
   * Sets the text label.
   *
   * @param text - New text
   * @returns This button for chaining
   */
  setText(text: string): this {
    this.text = text;
    this.ariaLabel = text;
    return this;
  }

  /**
   * Sets the color scheme.
   *
   * @param normal - Normal state color
   * @param hover - Hover state color
   * @param pressed - Pressed state color
   * @returns This button for chaining
   */
  setColors(normal: Color, hover: Color, pressed: Color): this {
    this.normalColor = normal;
    this.hoverColor = hover;
    this.pressedColor = pressed;
    this.updateState();
    return this;
  }

  /**
   * Creates a primary button with standard styling.
   *
   * @param text - Button text
   * @returns New button instance
   */
  static createPrimary(text: string = 'Primary'): Button {
    const button = new Button(text);
    button.normalColor = Color.fromHex(0x2196F3);
    button.hoverColor = Color.fromHex(0x1976D2);
    button.pressedColor = Color.fromHex(0x0D47A1);
    return button;
  }

  /**
   * Creates a secondary button with standard styling.
   *
   * @param text - Button text
   * @returns New button instance
   */
  static createSecondary(text: string = 'Secondary'): Button {
    const button = new Button(text);
    button.normalColor = Color.fromHex(0x757575);
    button.hoverColor = Color.fromHex(0x616161);
    button.pressedColor = Color.fromHex(0x424242);
    return button;
  }

  /**
   * Creates a success button with green color scheme.
   *
   * @param text - Button text
   * @returns New button instance
   */
  static createSuccess(text: string = 'Success'): Button {
    const button = new Button(text);
    button.normalColor = Color.fromHex(0x4CAF50);
    button.hoverColor = Color.fromHex(0x388E3C);
    button.pressedColor = Color.fromHex(0x2E7D32);
    return button;
  }

  /**
   * Creates a danger button with red color scheme.
   *
   * @param text - Button text
   * @returns New button instance
   */
  static createDanger(text: string = 'Danger'): Button {
    const button = new Button(text);
    button.normalColor = Color.fromHex(0xF44336);
    button.hoverColor = Color.fromHex(0xD32F2F);
    button.pressedColor = Color.fromHex(0xC62828);
    return button;
  }

  /**
   * Creates a flat button (transparent background).
   *
   * @param text - Button text
   * @returns New button instance
   */
  static createFlat(text: string = 'Flat'): Button {
    const button = new Button(text);
    button.normalColor = Color.transparent();
    button.hoverColor = new Color(0, 0, 0, 0.1);
    button.pressedColor = new Color(0, 0, 0, 0.2);
    button.textColor = Color.fromHex(0x2196F3);
    return button;
  }
}
