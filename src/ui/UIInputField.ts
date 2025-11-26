/**
 * @fileoverview Text input field with cursor, selection, and validation.
 * @module ui/UIInputField
 */

import { UIElement, UIEventType, UIEvent } from './UIElement';
import { UIText, UITextAlign, UITextVerticalAlign } from './UIText';
import { UIImage } from './UIImage';
import { Color } from '../math/Color';

/**
 * Input content type for mobile keyboards
 */
export enum UIInputContentType {
  Standard = 'text',
  Autocorrected = 'text',
  IntegerNumber = 'number',
  DecimalNumber = 'number',
  Alphanumeric = 'text',
  Name = 'text',
  EmailAddress = 'email',
  Password = 'password',
  Pin = 'number'
}

/**
 * Input line type
 */
export enum UIInputLineType {
  SingleLine = 'single',
  MultiLine = 'multi'
}

/**
 * Text input field with cursor, selection, and validation.
 *
 * @example
 * ```typescript
 * const input = new UIInputField();
 * input.placeholder = 'Enter your name...';
 * input.maxLength = 50;
 * input.onValueChanged((value) => {
 *   console.log('Input:', value);
 * });
 * input.onSubmit((value) => {
 *   console.log('Submitted:', value);
 * });
 * ```
 */
export class UIInputField extends UIElement {
  /**
   * Background image
   */
  public background: UIImage;

  /**
   * Text display
   */
  public textDisplay: UIText;

  /**
   * Placeholder text display
   */
  public placeholderDisplay: UIText;

  /**
   * Current text value
   */
  protected _text: string;

  /**
   * Placeholder text
   */
  public placeholder: string;

  /**
   * Input content type
   */
  public contentType: UIInputContentType;

  /**
   * Line type
   */
  public lineType: UIInputLineType;

  /**
   * Character limit (0 = unlimited)
   */
  public maxLength: number;

  /**
   * Read-only mode
   */
  public readOnly: boolean;

  /**
   * Cursor position
   */
  protected _cursorPosition: number;

  /**
   * Selection start
   */
  protected _selectionStart: number;

  /**
   * Selection end
   */
  protected _selectionEnd: number;

  /**
   * Whether field has focus
   */
  protected _isFocused: boolean;

  /**
   * Cursor blink timer
   */
  protected _cursorBlinkTime: number;

  /**
   * Cursor visible state
   */
  protected _cursorVisible: boolean;

  /**
   * Hidden HTML input element for keyboard input
   */
  protected _hiddenInput: HTMLInputElement | null = null;

  /**
   * Value changed callback
   */
  protected _valueChangedCallback: ((value: string) => void) | null = null;

  /**
   * Submit callback
   */
  protected _submitCallback: ((value: string) => void) | null = null;

  /**
   * Validation function
   */
  protected _validationFunction: ((value: string) => boolean) | null = null;

  /**
   * Creates a new input field.
   *
   * @example
   * ```typescript
   * const username = new UIInputField();
   * username.placeholder = 'Username';
   * username.maxLength = 20;
   * ```
   */
  constructor() {
    super('UIInputField');

    this.size.set(200, 40);
    this._text = '';
    this.placeholder = '';
    this.contentType = UIInputContentType.Standard;
    this.lineType = UIInputLineType.SingleLine;
    this.maxLength = 0;
    this.readOnly = false;
    this._cursorPosition = 0;
    this._selectionStart = 0;
    this._selectionEnd = 0;
    this._isFocused = false;
    this._cursorBlinkTime = 0;
    this._cursorVisible = true;

    // Create background
    this.background = new UIImage();
    this.background.name = 'Background';
    this.background.size.copy(this.size);
    this.background.backgroundColor = Color.fromHex(0xFFFFFF);
    this.addChild(this.background);

    // Create text display
    this.textDisplay = new UIText('');
    this.textDisplay.name = 'Text';
    this.textDisplay.position.set(5, 0);
    this.textDisplay.size.set(this.size.x - 10, this.size.y);
    this.textDisplay.color = Color.black();
    this.textDisplay.align = UITextAlign.Left;
    this.textDisplay.verticalAlign = UITextVerticalAlign.Middle;
    this.addChild(this.textDisplay);

    // Create placeholder
    this.placeholderDisplay = new UIText(this.placeholder);
    this.placeholderDisplay.name = 'Placeholder';
    this.placeholderDisplay.position.set(5, 0);
    this.placeholderDisplay.size.set(this.size.x - 10, this.size.y);
    this.placeholderDisplay.color = Color.fromHex(0x888888);
    this.placeholderDisplay.align = UITextAlign.Left;
    this.placeholderDisplay.verticalAlign = UITextVerticalAlign.Middle;
    this.addChild(this.placeholderDisplay);

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
    this.addEventListener(UIEventType.Focus, this.handleFocus.bind(this));
    this.addEventListener(UIEventType.Blur, this.handleBlur.bind(this));
  }

  /**
   * Gets the text value.
   */
  get text(): string {
    return this._text;
  }

  /**
   * Sets the text value.
   */
  set text(value: string) {
    if (this.maxLength > 0 && value.length > this.maxLength) {
      value = value.substring(0, this.maxLength);
    }

    if (this._validationFunction && !this._validationFunction(value)) {
      return;
    }

    if (this._text !== value) {
      this._text = value;
      this.textDisplay.text = value;
      this.updatePlaceholderVisibility();

      if (this._valueChangedCallback) {
        this._valueChangedCallback(this._text);
      }
    }
  }

  /**
   * Gets whether the field has focus.
   */
  get isFocused(): boolean {
    return this._isFocused;
  }

  /**
   * Updates placeholder visibility.
   */
  protected updatePlaceholderVisibility(): void {
    this.placeholderDisplay.visible = this._text.length === 0;
  }

  /**
   * Creates the hidden input element for keyboard input.
   */
  protected createHiddenInput(): void {
    if (this._hiddenInput) {
      return;
    }

    this._hiddenInput = document.createElement('input');
    this._hiddenInput.type = this.contentType;
    this._hiddenInput.style.position = 'absolute';
    this._hiddenInput.style.left = '-9999px';
    this._hiddenInput.style.top = '-9999px';
    this._hiddenInput.value = this._text;

    if (this.maxLength > 0) {
      this._hiddenInput.maxLength = this.maxLength;
    }

    // Event listeners
    this._hiddenInput.addEventListener('input', () => {
      if (this._hiddenInput) {
        this.text = this._hiddenInput.value;
      }
    });

    this._hiddenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.lineType === UIInputLineType.SingleLine) {
        e.preventDefault();
        this.submit();
      }
    });

    this._hiddenInput.addEventListener('blur', () => {
      this.blur();
    });

    document.body.appendChild(this._hiddenInput);
  }

  /**
   * Removes the hidden input element.
   */
  protected removeHiddenInput(): void {
    if (this._hiddenInput) {
      document.body.removeChild(this._hiddenInput);
      this._hiddenInput = null;
    }
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    if (!this.readOnly) {
      this.focus();
    }
  }

  /**
   * Handles focus event.
   */
  protected handleFocus(event: UIEvent): void {
    this._isFocused = true;
    this._cursorBlinkTime = 0;
    this._cursorVisible = true;

    this.createHiddenInput();
    if (this._hiddenInput) {
      this._hiddenInput.focus();
    }

    // Change background to indicate focus
    this.background.tint = Color.fromHex(0xE3F2FD);
  }

  /**
   * Handles blur event.
   */
  protected handleBlur(event: UIEvent): void {
    this._isFocused = false;
    this._cursorVisible = false;

    this.removeHiddenInput();

    // Reset background
    this.background.tint = Color.white();
  }

  /**
   * Focuses the input field.
   */
  focus(): void {
    // This would typically be called through the canvas setFocus method
  }

  /**
   * Blurs the input field.
   */
  blur(): void {
    this._isFocused = false;
    this.handleBlur({} as UIEvent);
  }

  /**
   * Submits the input value.
   */
  submit(): void {
    if (this._submitCallback) {
      this._submitCallback(this._text);
    }
    this.blur();
  }

  /**
   * Updates cursor blink animation.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    if (this._isFocused) {
      this._cursorBlinkTime += deltaTime;
      if (this._cursorBlinkTime >= 0.5) {
        this._cursorBlinkTime = 0;
        this._cursorVisible = !this._cursorVisible;
      }
    }
  }

  /**
   * Renders the input field.
   */
  override render(context: CanvasRenderingContext2D): void {
    super.render(context);

    // Render cursor
    if (this._isFocused && this._cursorVisible) {
      const bounds = this.textDisplay.localBounds;
      context.save();

      // Measure text up to cursor position
      context.font = `${this.textDisplay.fontStyle} ${this.textDisplay.fontWeight} ${this.textDisplay.fontSize}px ${this.textDisplay.font}`;
      const textBeforeCursor = this._text.substring(0, this._cursorPosition);
      const metrics = context.measureText(textBeforeCursor);

      // Draw cursor line
      context.strokeStyle = Color.black().toCSSString();
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(bounds.x + metrics.width, bounds.y);
      context.lineTo(bounds.x + metrics.width, bounds.y + bounds.height);
      context.stroke();

      context.restore();
    }
  }

  /**
   * Sets the value changed callback.
   */
  onValueChanged(callback: (value: string) => void): this {
    this._valueChangedCallback = callback;
    return this;
  }

  /**
   * Sets the submit callback.
   */
  onSubmit(callback: (value: string) => void): this {
    this._submitCallback = callback;
    return this;
  }

  /**
   * Sets the validation function.
   */
  setValidation(validator: (value: string) => boolean): this {
    this._validationFunction = validator;
    return this;
  }

  /**
   * Destroys the input field.
   */
  override destroy(): void {
    this.removeHiddenInput();
    super.destroy();
  }
}
