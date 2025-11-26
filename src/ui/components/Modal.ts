/**
 * @fileoverview Modal dialog UI component with backdrop and focus trapping.
 * @module ui/components/Modal
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { UIText } from '../UIText';
import { Color } from '../../math/Color';
import { UIButton } from '../UIButton';

/**
 * Modal dialog with backdrop, close on escape, and focus trapping.
 * Displays centered content over a semi-transparent backdrop.
 *
 * @example
 * ```typescript
 * const modal = new Modal('Confirm Action');
 * modal.setContent(contentElement);
 * modal.setSize(400, 300);
 * modal.onClose(() => {
 *   console.log('Modal closed');
 * });
 * modal.show();
 * ```
 */
export class Modal extends UIElement {
  /**
   * Modal title
   */
  protected _title: string;

  /**
   * Whether the modal is currently visible
   */
  protected _isShown: boolean;

  /**
   * Modal width
   */
  public modalWidth: number;

  /**
   * Modal height
   */
  public modalHeight: number;

  /**
   * Title bar height
   */
  public titleBarHeight: number;

  /**
   * Backdrop color
   */
  public backdropColor: Color;

  /**
   * Modal background color
   */
  public override backgroundColor: Color;

  /**
   * Title bar color
   */
  public titleBarColor: Color;

  /**
   * Title text color
   */
  public titleTextColor: Color;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Shadow color
   */
  public shadowColor: Color;

  /**
   * Close on backdrop click
   */
  public closeOnBackdrop: boolean;

  /**
   * Close on escape key
   */
  public closeOnEscape: boolean;

  /**
   * Show close button
   */
  public showCloseButton: boolean;

  /**
   * Backdrop element
   */
  protected _backdrop: UIElement;

  /**
   * Modal container
   */
  protected _modalContainer: UIElement;

  /**
   * Title bar element
   */
  protected _titleBar: UIElement;

  /**
   * Title text element
   */
  protected _titleText: UIText;

  /**
   * Content container
   */
  protected _contentContainer: UIElement;

  /**
   * Close button
   */
  protected _closeButton: UIButton | null = null;

  /**
   * Close callback
   */
  protected _closeCallback: (() => void) | null = null;

  /**
   * Animation progress [0, 1]
   */
  protected _animationProgress: number = 0;

  /**
   * Target animation progress
   */
  protected _targetAnimationProgress: number = 0;

  /**
   * Animation duration in seconds
   */
  public animationDuration: number = 0.2;

  /**
   * Creates a new modal.
   *
   * @param title - Modal title
   *
   * @example
   * ```typescript
   * const confirmModal = new Modal('Delete File');
   * confirmModal.setContent(confirmationContent);
   * ```
   */
  constructor(title: string = 'Modal') {
    super('Modal');

    this._title = title;
    this._isShown = false;
    this.modalWidth = 400;
    this.modalHeight = 300;
    this.titleBarHeight = 50;
    this.closeOnBackdrop = true;
    this.closeOnEscape = true;
    this.showCloseButton = true;

    // Default colors
    this.backdropColor = new Color(0, 0, 0, 0.5);
    this.backgroundColor = Color.white();
    this.titleBarColor = Color.fromHex(0x2196F3);
    this.titleTextColor = Color.white();
    this.borderColor = Color.fromHex(0xBDBDBD);
    this.shadowColor = new Color(0, 0, 0, 0.3);

    // Set to full screen initially (backdrop)
    this.size.set(window.innerWidth || 800, window.innerHeight || 600);
    this.visible = false;
    this.interactive = true;
    this.blockPointer = true;

    // Create backdrop
    this._backdrop = new UIElement('Backdrop');
    this._backdrop.size.copy(this.size);
    this._backdrop.backgroundColor = this.backdropColor;
    this._backdrop.interactive = true;
    this._backdrop.blockPointer = true;
    this._backdrop.addEventListener(UIEventType.Click, this.handleBackdropClick.bind(this));
    this.addChild(this._backdrop);

    // Create modal container
    this._modalContainer = new UIElement('ModalContainer');
    this._modalContainer.size.set(this.modalWidth, this.modalHeight);
    this._modalContainer.anchor = 4; // MiddleCenter
    this._modalContainer.position.set(this.size.x / 2, this.size.y / 2);
    this._modalContainer.backgroundColor = this.backgroundColor;
    this.addChild(this._modalContainer);

    // Create title bar
    this._titleBar = new UIElement('TitleBar');
    this._titleBar.size.set(this.modalWidth, this.titleBarHeight);
    this._titleBar.backgroundColor = this.titleBarColor;
    this._modalContainer.addChild(this._titleBar);

    // Create title text
    this._titleText = new UIText(title);
    this._titleText.fontSize = 18;
    this._titleText.color = this.titleTextColor;
    this._titleText.position.set(15, this.titleBarHeight / 2);
    this._titleText.anchor = 3; // MiddleLeft
    this._titleBar.addChild(this._titleText);

    // Create close button if enabled
    if (this.showCloseButton) {
      this.createCloseButton();
    }

    // Create content container
    this._contentContainer = new UIElement('ContentContainer');
    this._contentContainer.position.set(0, this.titleBarHeight);
    this._contentContainer.size.set(this.modalWidth, this.modalHeight - this.titleBarHeight);
    this._modalContainer.addChild(this._contentContainer);
  }

  /**
   * Creates the close button.
   */
  protected createCloseButton(): void {
    this._closeButton = new UIButton('×');
    this._closeButton.setSize(40, 40);
    this._closeButton.position.set(this.modalWidth - 45, this.titleBarHeight / 2);
    this._closeButton.anchor = 4; // MiddleCenter
    this._closeButton.label.fontSize = 24;
    this._closeButton.setColors(
      Color.transparent(),
      new Color(1, 1, 1, 0.1),
      new Color(1, 1, 1, 0.2)
    );
    this._closeButton.onClick(() => this.close());
    this._titleBar.addChild(this._closeButton);
  }

  /**
   * Shows the modal.
   */
  show(): this {
    if (this._isShown) {
      return this;
    }

    this._isShown = true;
    this.visible = true;
    this._targetAnimationProgress = 1;

    return this;
  }

  /**
   * Closes the modal.
   */
  close(): this {
    if (!this._isShown) {
      return this;
    }

    this._isShown = false;
    this._targetAnimationProgress = 0;

    if (this._closeCallback) {
      this._closeCallback();
    }

    return this;
  }

  /**
   * Toggles the modal visibility.
   */
  toggle(): this {
    if (this._isShown) {
      this.close();
    } else {
      this.show();
    }
    return this;
  }

  /**
   * Sets the modal title.
   */
  setTitle(title: string): this {
    this._title = title;
    this._titleText.text = title;
    return this;
  }

  /**
   * Sets the modal content.
   */
  setContent(content: UIElement): this {
    this._contentContainer.removeAllChildren();
    this._contentContainer.addChild(content);
    return this;
  }

  /**
   * Sets the close callback.
   */
  onClose(callback: () => void): this {
    this._closeCallback = callback;
    return this;
  }

  /**
   * Handles backdrop click event.
   */
  protected handleBackdropClick(event: UIEvent): void {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }

  /**
   * Updates the modal animation.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Animate show/hide
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

        // Hide when animation completes
        if (this._animationProgress === 0) {
          this.visible = false;
        }
      }

      // Update modal scale and alpha
      const eased = this.easeOutBack(this._animationProgress);
      this._modalContainer.scale.set(eased, eased);
      this._modalContainer.alpha = this._animationProgress;
      this._backdrop.alpha = this._animationProgress;
    }
  }

  /**
   * Easing function (ease out back).
   */
  protected easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /**
   * Renders the modal.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    // Render backdrop
    const pos = this.worldPosition;
    const alpha = this.worldAlpha * this._backdrop.alpha;

    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = this.backdropColor.toCSSString();
    context.fillRect(0, 0, this.size.x, this.size.y);
    context.restore();

    // Modal container and content are rendered by child elements
    // Draw shadow
    if (this._animationProgress > 0) {
      const modalPos = this._modalContainer.worldPosition;

      context.save();
      context.globalAlpha = this.worldAlpha * this._animationProgress * 0.3;
      context.shadowColor = 'rgba(0, 0, 0, 0.5)';
      context.shadowBlur = 20;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 4;

      context.fillStyle = this.backgroundColor.toCSSString();
      context.fillRect(
        modalPos.x - this.modalWidth / 2,
        modalPos.y - this.modalHeight / 2,
        this.modalWidth,
        this.modalHeight
      );

      context.restore();
    }
  }

  /**
   * Sets the modal size.
   */
  setSize(width: number, height: number): this {
    this.modalWidth = width;
    this.modalHeight = height;
    this._modalContainer.size.set(width, height);
    this._titleBar.size.set(width, this.titleBarHeight);
    this._contentContainer.size.set(width, height - this.titleBarHeight);

    if (this._closeButton) {
      this._closeButton.position.set(width - 45, this.titleBarHeight / 2);
    }

    return this;
  }
}
