/**
 * @fileoverview Toast notification UI component with auto-dismiss and animations.
 * @module ui/components/Notification
 */

import { UIElement, UIEventType } from '../UIElement';
import { UIText } from '../UIText';
import { Color } from '../../math/Color';

/**
 * Notification type
 */
export enum NotificationType {
  Info = 'info',
  Success = 'success',
  Warning = 'warning',
  Error = 'error'
}

/**
 * Notification position
 */
export enum NotificationPosition {
  TopLeft = 'top-left',
  TopCenter = 'top-center',
  TopRight = 'top-right',
  BottomLeft = 'bottom-left',
  BottomCenter = 'bottom-center',
  BottomRight = 'bottom-right'
}

/**
 * Toast notification with auto-dismiss, animations, and positioning.
 * Provides user feedback for actions and events.
 *
 * @example
 * ```typescript
 * const notification = new Notification('File saved successfully!', NotificationType.Success);
 * notification.show();
 *
 * // Custom duration
 * const warning = new Notification('Warning message', NotificationType.Warning, 5000);
 * warning.position = NotificationPosition.TopRight;
 * warning.show();
 * ```
 */
export class Notification extends UIElement {
  /**
   * Notification message
   */
  protected _message: string;

  /**
   * Notification type
   */
  protected _type: NotificationType;

  /**
   * Auto-dismiss duration in milliseconds (0 = no auto-dismiss)
   */
  public duration: number;

  /**
   * Notification position
   */
  public notificationPosition: NotificationPosition;

  /**
   * Notification width
   */
  public notificationWidth: number;

  /**
   * Notification height
   */
  public notificationHeight: number;

  /**
   * Border radius
   */
  public borderRadius: number;

  /**
   * Padding
   */
  public padding: number;

  /**
   * Whether the notification is currently shown
   */
  protected _isShown: boolean;

  /**
   * Time remaining until auto-dismiss (milliseconds)
   */
  protected _timeRemaining: number;

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
  public animationDuration: number = 0.3;

  /**
   * Text element
   */
  protected _textElement: UIText;

  /**
   * Icon element (optional)
   */
  protected _iconElement: UIText | null = null;

  /**
   * Dismissed callback
   */
  protected _dismissedCallback: (() => void) | null = null;

  /**
   * Default colors for notification types
   */
  protected static readonly TYPE_COLORS: Record<NotificationType, Color> = {
    [NotificationType.Info]: Color.fromHex(0x2196F3),
    [NotificationType.Success]: Color.fromHex(0x4CAF50),
    [NotificationType.Warning]: Color.fromHex(0xFF9800),
    [NotificationType.Error]: Color.fromHex(0xF44336)
  };

  /**
   * Default icons for notification types
   */
  protected static readonly TYPE_ICONS: Record<NotificationType, string> = {
    [NotificationType.Info]: 'ℹ',
    [NotificationType.Success]: '✓',
    [NotificationType.Warning]: '⚠',
    [NotificationType.Error]: '✕'
  };

  /**
   * Creates a new notification.
   *
   * @param message - Notification message
   * @param type - Notification type
   * @param duration - Auto-dismiss duration in milliseconds (default: 3000)
   *
   * @example
   * ```typescript
   * const success = new Notification('Action completed', NotificationType.Success);
   * const error = new Notification('Error occurred', NotificationType.Error, 5000);
   * ```
   */
  constructor(
    message: string,
    type: NotificationType = NotificationType.Info,
    duration: number = 3000
  ) {
    super('Notification');

    this._message = message;
    this._type = type;
    this.duration = duration;
    this._timeRemaining = duration;
    this._isShown = false;
    this.notificationPosition = NotificationPosition.TopRight;
    this.notificationWidth = 300;
    this.notificationHeight = 60;
    this.borderRadius = 4;
    this.padding = 15;

    this.size.set(this.notificationWidth, this.notificationHeight);
    this.visible = false;
    this.interactive = true;
    this.blockPointer = true;

    // Create icon
    this._iconElement = new UIText(Notification.TYPE_ICONS[type]);
    this._iconElement.fontSize = 20;
    this._iconElement.color = Color.white();
    this._iconElement.position.set(this.padding, this.notificationHeight / 2);
    this._iconElement.anchor = 3; // MiddleLeft
    this.addChild(this._iconElement);

    // Create text
    this._textElement = new UIText(message);
    this._textElement.fontSize = 14;
    this._textElement.color = Color.white();
    this._textElement.position.set(this.padding + 30, this.notificationHeight / 2);
    this._textElement.anchor = 3; // MiddleLeft
    this._textElement.autoSize = false;
    this._textElement.size.set(this.notificationWidth - this.padding * 2 - 40, this.notificationHeight);
    this.addChild(this._textElement);

    // Setup click to dismiss
    this.addEventListener(UIEventType.Click, () => this.dismiss());
  }

  /**
   * Gets the notification message.
   */
  get message(): string {
    return this._message;
  }

  /**
   * Sets the notification message.
   */
  set message(val: string) {
    this._message = val;
    this._textElement.text = val;
  }

  /**
   * Gets the notification type.
   */
  get type(): NotificationType {
    return this._type;
  }

  /**
   * Sets the notification type.
   */
  set type(val: NotificationType) {
    this._type = val;
    if (this._iconElement) {
      this._iconElement.text = Notification.TYPE_ICONS[val];
    }
  }

  /**
   * Shows the notification.
   */
  show(): this {
    if (this._isShown) {
      return this;
    }

    this._isShown = true;
    this.visible = true;
    this._targetAnimationProgress = 1;
    this._timeRemaining = this.duration;

    // Position the notification
    this.updatePosition();

    return this;
  }

  /**
   * Dismisses the notification.
   */
  dismiss(): this {
    if (!this._isShown) {
      return this;
    }

    this._isShown = false;
    this._targetAnimationProgress = 0;

    return this;
  }

  /**
   * Updates the notification position based on screen and positioning.
   */
  protected updatePosition(): void {
    const screenWidth = window.innerWidth || 800;
    const screenHeight = window.innerHeight || 600;
    const margin = 20;

    switch (this.notificationPosition) {
      case NotificationPosition.TopLeft:
        this.position.set(margin, margin);
        break;
      case NotificationPosition.TopCenter:
        this.position.set(screenWidth / 2 - this.notificationWidth / 2, margin);
        break;
      case NotificationPosition.TopRight:
        this.position.set(screenWidth - this.notificationWidth - margin, margin);
        break;
      case NotificationPosition.BottomLeft:
        this.position.set(margin, screenHeight - this.notificationHeight - margin);
        break;
      case NotificationPosition.BottomCenter:
        this.position.set(screenWidth / 2 - this.notificationWidth / 2, screenHeight - this.notificationHeight - margin);
        break;
      case NotificationPosition.BottomRight:
        this.position.set(screenWidth - this.notificationWidth - margin, screenHeight - this.notificationHeight - margin);
        break;
    }
  }

  /**
   * Sets the dismissed callback.
   */
  onDismissed(callback: () => void): this {
    this._dismissedCallback = callback;
    return this;
  }

  /**
   * Updates the notification.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Auto-dismiss countdown
    if (this._isShown && this.duration > 0) {
      this._timeRemaining -= deltaTime * 1000;
      if (this._timeRemaining <= 0) {
        this.dismiss();
      }
    }

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

        // Hide and trigger callback when animation completes
        if (this._animationProgress === 0) {
          this.visible = false;

          if (this._dismissedCallback) {
            this._dismissedCallback();
          }
        }
      }

      // Update alpha
      this.alpha = this._animationProgress;
    }
  }

  /**
   * Renders the notification.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.notificationWidth * this.pivot.x;
    const y = pos.y - this.notificationHeight * this.pivot.y;

    // Get color for notification type
    const bgColor = Notification.TYPE_COLORS[this._type];

    // Draw shadow
    context.shadowColor = 'rgba(0, 0, 0, 0.3)';
    context.shadowBlur = 10;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 2;

    // Draw background
    context.fillStyle = bgColor.toCSSString();
    if (this.borderRadius > 0) {
      context.beginPath();
      context.roundRect(x, y, this.notificationWidth, this.notificationHeight, this.borderRadius);
      context.fill();
    } else {
      context.fillRect(x, y, this.notificationWidth, this.notificationHeight);
    }

    // Draw progress bar if auto-dismissing
    if (this.duration > 0 && this._isShown) {
      const progress = this._timeRemaining / this.duration;
      context.fillStyle = 'rgba(255, 255, 255, 0.3)';
      const progressWidth = this.notificationWidth * progress;

      if (this.borderRadius > 0) {
        context.beginPath();
        context.roundRect(x, y + this.notificationHeight - 4, progressWidth, 4, [0, 0, this.borderRadius, this.borderRadius]);
        context.fill();
      } else {
        context.fillRect(x, y + this.notificationHeight - 4, progressWidth, 4);
      }
    }

    context.restore();
  }

  /**
   * Sets the notification size.
   */
  setSize(width: number, height: number): this {
    this.notificationWidth = width;
    this.notificationHeight = height;
    this.size.set(width, height);

    this._textElement.size.set(width - this.padding * 2 - 40, height);
    this._textElement.position.set(this.padding + 30, height / 2);

    if (this._iconElement) {
      this._iconElement.position.set(this.padding, height / 2);
    }

    return this;
  }

  /**
   * Creates and shows a notification.
   *
   * @param message - Notification message
   * @param type - Notification type
   * @param duration - Auto-dismiss duration in milliseconds
   *
   * @example
   * ```typescript
   * Notification.show('File saved', NotificationType.Success);
   * Notification.show('Error occurred', NotificationType.Error, 5000);
   * ```
   */
  static show(
    message: string,
    type: NotificationType = NotificationType.Info,
    duration: number = 3000
  ): Notification {
    const notification = new Notification(message, type, duration);
    notification.show();
    return notification;
  }
}
