/**
 * @fileoverview Interactive button UI element with visual states and transitions.
 * @module ui/UIButton
 */

import { UIElement, UIEventType, UIEvent } from './UIElement';
import { UIText } from './UIText';
import { UIImage } from './UIImage';
import { Color } from '../math/Color';

/**
 * Button visual state
 */
export enum UIButtonState {
  Normal = 'normal',
  Hover = 'hover',
  Pressed = 'pressed',
  Disabled = 'disabled'
}

/**
 * Button transition type
 */
export enum UIButtonTransition {
  None = 'none',
  ColorTint = 'color',
  SpriteSwap = 'sprite',
  Animation = 'animation'
}

/**
 * Button state colors
 */
export interface UIButtonColors {
  normal: Color;
  hover: Color;
  pressed: Color;
  disabled: Color;
}

/**
 * Interactive button element with visual feedback and click handling.
 *
 * @example
 * ```typescript
 * const button = new UIButton('Click Me');
 * button.position.set(100, 100);
 * button.size.set(150, 40);
 * button.onClick(() => {
 *   console.log('Button clicked!');
 * });
 *
 * // Customize colors
 * button.colors.normal = Color.fromHex(0x4CAF50);
 * button.colors.hover = Color.fromHex(0x45A049);
 * button.colors.pressed = Color.fromHex(0x3D8B40);
 * ```
 */
export class UIButton extends UIElement {
  /**
   * Background image
   */
  public background: UIImage;

  /**
   * Label text
   */
  public label: UIText;

  /**
   * Current button state
   */
  protected _state: UIButtonState;

  /**
   * Transition type
   */
  public transition: UIButtonTransition;

  /**
   * State colors for ColorTint transition
   */
  public colors: UIButtonColors;

  /**
   * Transition duration in seconds
   */
  public transitionDuration: number;

  /**
   * Whether button is currently interactable
   */
  protected _interactable: boolean;

  /**
   * Click callback
   */
  protected _clickCallback: ((event: UIEvent) => void) | null = null;

  /**
   * Current transition progress
   */
  protected _transitionProgress: number = 0;

  /**
   * Target transition progress
   */
  protected _targetTransitionProgress: number = 0;

  /**
   * Previous state for transition
   */
  protected _previousState: UIButtonState;

  /**
   * Sound effect hooks
   */
  public onHoverSound: (() => void) | null = null;
  public onClickSound: (() => void) | null = null;

  /**
   * Creates a new button.
   *
   * @param text - Button label text
   *
   * @example
   * ```typescript
   * const playButton = new UIButton('Play Game');
   * playButton.onClick(() => startGame());
   * ```
   */
  constructor(text: string = 'Button') {
    super('UIButton');

    this.size.set(150, 40);
    this._state = UIButtonState.Normal;
    this._previousState = UIButtonState.Normal;
    this.transition = UIButtonTransition.ColorTint;
    this.transitionDuration = 0.1;
    this._interactable = true;

    // Default colors
    this.colors = {
      normal: Color.fromHex(0x2196F3),
      hover: Color.fromHex(0x1E88E5),
      pressed: Color.fromHex(0x1976D2),
      disabled: Color.fromHex(0x9E9E9E)
    };

    // Create background
    this.background = new UIImage();
    this.background.name = 'Background';
    this.background.size.set(150, 40);
    this.background.anchor = 0; // TopLeft
    this.background.backgroundColor = this.colors.normal.clone();
    this.addChild(this.background);

    // Create label
    this.label = new UIText(text);
    this.label.name = 'Label';
    this.label.anchor = 4; // MiddleCenter
    this.label.fontSize = 16;
    this.label.color = Color.white();
    this.label.autoSize = false;
    this.label.size.set(150, 40);
    this.addChild(this.label);

    // Setup event listeners
    this.addEventListener(UIEventType.PointerEnter, this.handlePointerEnter.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
    this.addEventListener(UIEventType.PointerDown, this.handlePointerDown.bind(this));
    this.addEventListener(UIEventType.PointerUp, this.handlePointerUp.bind(this));
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
  }

  /**
   * Gets the current button state.
   */
  get state(): UIButtonState {
    return this._state;
  }

  /**
   * Gets whether the button is interactable.
   */
  get interactable(): boolean {
    return this._interactable;
  }

  /**
   * Sets whether the button is interactable.
   */
  set interactable(value: boolean) {
    if (this._interactable !== value) {
      this._interactable = value;
      this.interactive = value;

      if (!value) {
        this.setState(UIButtonState.Disabled);
      } else if (this._state === UIButtonState.Disabled) {
        this.setState(UIButtonState.Normal);
      }
    }
  }

  /**
   * Sets the button state.
   */
  protected setState(state: UIButtonState): void {
    if (this._state === state) {
      return;
    }

    this._previousState = this._state;
    this._state = state;
    this._transitionProgress = 0;
    this._targetTransitionProgress = 1;

    this.updateVisualState();
  }

  /**
   * Updates the visual appearance based on state.
   */
  protected updateVisualState(): void {
    if (this.transition === UIButtonTransition.None) {
      this.applyStateImmediate();
      return;
    }

    // Transition will be handled in update loop
  }

  /**
   * Applies state immediately without transition.
   */
  protected applyStateImmediate(): void {
    const color = this.getStateColor(this._state);

    switch (this.transition) {
      case UIButtonTransition.ColorTint:
        this.background.backgroundColor = color.clone();
        break;

      case UIButtonTransition.SpriteSwap:
        // Would swap background image here
        break;

      case UIButtonTransition.Animation:
        // Would trigger animation here
        break;
    }
  }

  /**
   * Gets the color for a given state.
   */
  protected getStateColor(state: UIButtonState): Color {
    switch (state) {
      case UIButtonState.Normal:
        return this.colors.normal;
      case UIButtonState.Hover:
        return this.colors.hover;
      case UIButtonState.Pressed:
        return this.colors.pressed;
      case UIButtonState.Disabled:
        return this.colors.disabled;
    }
  }

  /**
   * Updates transitions.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Update transition
    if (this._transitionProgress < this._targetTransitionProgress) {
      this._transitionProgress += deltaTime / this.transitionDuration;

      if (this._transitionProgress >= this._targetTransitionProgress) {
        this._transitionProgress = this._targetTransitionProgress;
      }

      this.updateTransition();
    }
  }

  /**
   * Updates the transition animation.
   */
  protected updateTransition(): void {
    if (this.transition !== UIButtonTransition.ColorTint) {
      return;
    }

    const t = this.easeTransition(this._transitionProgress);
    const fromColor = this.getStateColor(this._previousState);
    const toColor = this.getStateColor(this._state);

    this.background.backgroundColor = fromColor.lerp(toColor, t);
  }

  /**
   * Eases the transition value.
   */
  protected easeTransition(t: number): number {
    // Ease out cubic
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Handles pointer enter event.
   */
  protected handlePointerEnter(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    if (this._state !== UIButtonState.Pressed) {
      this.setState(UIButtonState.Hover);
    }

    if (this.onHoverSound) {
      this.onHoverSound();
    }
  }

  /**
   * Handles pointer leave event.
   */
  protected handlePointerLeave(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    this.setState(UIButtonState.Normal);
  }

  /**
   * Handles pointer down event.
   */
  protected handlePointerDown(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    this.setState(UIButtonState.Pressed);
  }

  /**
   * Handles pointer up event.
   */
  protected handlePointerUp(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    if (this.containsPoint(event.position)) {
      this.setState(UIButtonState.Hover);
    } else {
      this.setState(UIButtonState.Normal);
    }
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this._interactable) {
      return;
    }

    if (this.onClickSound) {
      this.onClickSound();
    }

    if (this._clickCallback) {
      this._clickCallback(event);
    }
  }

  /**
   * Sets the click callback.
   *
   * @param callback - Click callback function
   *
   * @example
   * ```typescript
   * button.onClick((event) => {
   *   console.log('Button clicked at', event.position);
   * });
   * ```
   */
  onClick(callback: (event: UIEvent) => void): this {
    this._clickCallback = callback;
    return this;
  }

  /**
   * Sets the button text.
   *
   * @param text - Button label text
   */
  setText(text: string): this {
    this.label.text = text;
    return this;
  }

  /**
   * Sets the button colors.
   *
   * @param normal - Normal state color
   * @param hover - Hover state color
   * @param pressed - Pressed state color
   * @param disabled - Disabled state color
   */
  setColors(normal: Color, hover?: Color, pressed?: Color, disabled?: Color): this {
    this.colors.normal = normal.clone();
    this.colors.hover = hover?.clone() ?? normal.scale(0.9);
    this.colors.pressed = pressed?.clone() ?? normal.scale(0.8);
    this.colors.disabled = disabled?.clone() ?? Color.fromHex(0x9E9E9E);

    this.updateVisualState();
    return this;
  }

  /**
   * Sets the button size.
   */
  setSize(width: number, height: number): this {
    this.size.set(width, height);
    this.background.size.set(width, height);
    this.label.size.set(width, height);
    return this;
  }

  /**
   * Creates a primary button (blue theme).
   */
  static createPrimary(text: string): UIButton {
    const button = new UIButton(text);
    button.setColors(
      Color.fromHex(0x2196F3),
      Color.fromHex(0x1E88E5),
      Color.fromHex(0x1976D2)
    );
    return button;
  }

  /**
   * Creates a success button (green theme).
   */
  static createSuccess(text: string): UIButton {
    const button = new UIButton(text);
    button.setColors(
      Color.fromHex(0x4CAF50),
      Color.fromHex(0x45A049),
      Color.fromHex(0x3D8B40)
    );
    return button;
  }

  /**
   * Creates a danger button (red theme).
   */
  static createDanger(text: string): UIButton {
    const button = new UIButton(text);
    button.setColors(
      Color.fromHex(0xF44336),
      Color.fromHex(0xE53935),
      Color.fromHex(0xC62828)
    );
    return button;
  }

  /**
   * Creates a warning button (orange theme).
   */
  static createWarning(text: string): UIButton {
    const button = new UIButton(text);
    button.setColors(
      Color.fromHex(0xFF9800),
      Color.fromHex(0xFB8C00),
      Color.fromHex(0xF57C00)
    );
    return button;
  }
}
