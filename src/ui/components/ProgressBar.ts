/**
 * @fileoverview Progress bar UI component with determinate and indeterminate modes.
 * @module ui/components/ProgressBar
 */

import { UIElement } from '../UIElement';
import { Color } from '../../math/Color';

/**
 * Progress bar mode
 */
export enum ProgressBarMode {
  Determinate = 'determinate',
  Indeterminate = 'indeterminate'
}

/**
 * Progress bar with determinate and indeterminate modes.
 * Supports horizontal and vertical orientations, custom colors, and smooth animations.
 *
 * @example
 * ```typescript
 * const progressBar = new ProgressBar();
 * progressBar.position.set(100, 100);
 * progressBar.value = 0.75; // 75%
 *
 * // Indeterminate mode for unknown progress
 * const loadingBar = new ProgressBar();
 * loadingBar.mode = ProgressBarMode.Indeterminate;
 * ```
 */
export class ProgressBar extends UIElement {
  /**
   * Current progress value [0, 1]
   */
  protected _value: number;

  /**
   * Progress bar mode
   */
  protected _mode: ProgressBarMode;

  /**
   * Whether the progress bar is horizontal (true) or vertical (false)
   */
  public horizontal: boolean;

  /**
   * Progress bar width
   */
  public barWidth: number;

  /**
   * Progress bar height
   */
  public barHeight: number;

  /**
   * Background color
   */
  public override backgroundColor: Color;

  /**
   * Fill color
   */
  public fillColor: Color;

  /**
   * Border color (optional)
   */
  public borderColor: Color | null;

  /**
   * Border width
   */
  public borderWidth: number;

  /**
   * Corner radius
   */
  public cornerRadius: number;

  /**
   * Animation speed for value changes
   */
  public animationSpeed: number;

  /**
   * Current animated value [0, 1]
   */
  protected _animatedValue: number;

  /**
   * Indeterminate animation progress [0, 1]
   */
  protected _indeterminateProgress: number;

  /**
   * Indeterminate animation speed
   */
  public indeterminateSpeed: number;

  /**
   * Show percentage text
   */
  public showPercentage: boolean;

  /**
   * Text color
   */
  public textColor: Color;

  /**
   * Creates a new progress bar.
   *
   * @param initialValue - Initial progress value (default: 0)
   * @param mode - Progress bar mode (default: Determinate)
   *
   * @example
   * ```typescript
   * const healthBar = new ProgressBar(1.0);
   * healthBar.fillColor = Color.fromHex(0x4CAF50);
   *
   * const loadingBar = new ProgressBar(0, ProgressBarMode.Indeterminate);
   * ```
   */
  constructor(initialValue: number = 0, mode: ProgressBarMode = ProgressBarMode.Determinate) {
    super('ProgressBar');

    this._value = Math.max(0, Math.min(1, initialValue));
    this._mode = mode;
    this.horizontal = true;
    this.barWidth = 200;
    this.barHeight = 20;
    this.cornerRadius = 4;
    this.borderWidth = 1;
    this.animationSpeed = 2.0;
    this.indeterminateSpeed = 1.0;
    this._animatedValue = this._value;
    this._indeterminateProgress = 0;
    this.showPercentage = false;

    // Default colors
    this.backgroundColor = Color.fromHex(0xE0E0E0);
    this.fillColor = Color.fromHex(0x2196F3);
    this.borderColor = null;
    this.textColor = Color.white();

    this.size.set(this.barWidth, this.barHeight);
    this.interactive = false;
    this.blockPointer = false;
  }

  /**
   * Gets the current progress value.
   */
  get value(): number {
    return this._value;
  }

  /**
   * Sets the progress value.
   */
  set value(val: number) {
    this._value = Math.max(0, Math.min(1, val));
  }

  /**
   * Gets the progress bar mode.
   */
  get mode(): ProgressBarMode {
    return this._mode;
  }

  /**
   * Sets the progress bar mode.
   */
  set mode(val: ProgressBarMode) {
    this._mode = val;
    if (val === ProgressBarMode.Indeterminate) {
      this._indeterminateProgress = 0;
    }
  }

  /**
   * Updates the progress bar animation.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    if (this._mode === ProgressBarMode.Determinate) {
      // Animate towards target value
      if (this._animatedValue !== this._value) {
        const diff = this._value - this._animatedValue;
        const delta = Math.sign(diff) * Math.min(Math.abs(diff), deltaTime * this.animationSpeed);
        this._animatedValue += delta;

        // Clamp to target if close enough
        if (Math.abs(this._value - this._animatedValue) < 0.001) {
          this._animatedValue = this._value;
        }
      }
    } else {
      // Animate indeterminate progress
      this._indeterminateProgress += deltaTime * this.indeterminateSpeed;
      if (this._indeterminateProgress > 1) {
        this._indeterminateProgress = 0;
      }
    }
  }

  /**
   * Renders the progress bar.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.barWidth * this.pivot.x;
    const y = pos.y - this.barHeight * this.pivot.y;

    // Draw background
    context.fillStyle = this.backgroundColor.toCSSString();
    if (this.cornerRadius > 0) {
      context.beginPath();
      context.roundRect(x, y, this.barWidth, this.barHeight, this.cornerRadius);
      context.fill();
    } else {
      context.fillRect(x, y, this.barWidth, this.barHeight);
    }

    // Draw fill
    if (this._mode === ProgressBarMode.Determinate) {
      this.renderDeterminate(context, x, y);
    } else {
      this.renderIndeterminate(context, x, y);
    }

    // Draw border
    if (this.borderColor) {
      context.strokeStyle = this.borderColor.toCSSString();
      context.lineWidth = this.borderWidth;
      if (this.cornerRadius > 0) {
        context.beginPath();
        context.roundRect(x, y, this.barWidth, this.barHeight, this.cornerRadius);
        context.stroke();
      } else {
        context.strokeRect(x, y, this.barWidth, this.barHeight);
      }
    }

    // Draw percentage text
    if (this.showPercentage && this._mode === ProgressBarMode.Determinate) {
      const percentage = Math.round(this._animatedValue * 100);
      context.fillStyle = this.textColor.toCSSString();
      context.font = '12px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        `${percentage}%`,
        x + this.barWidth / 2,
        y + this.barHeight / 2
      );
    }

    context.restore();
  }

  /**
   * Renders determinate progress bar.
   */
  protected renderDeterminate(context: CanvasRenderingContext2D, x: number, y: number): void {
    if (this._animatedValue <= 0) {
      return;
    }

    context.fillStyle = this.fillColor.toCSSString();

    if (this.horizontal) {
      const fillWidth = this.barWidth * this._animatedValue;
      if (this.cornerRadius > 0) {
        context.beginPath();
        context.roundRect(x, y, fillWidth, this.barHeight, this.cornerRadius);
        context.fill();
      } else {
        context.fillRect(x, y, fillWidth, this.barHeight);
      }
    } else {
      // Vertical - fill from bottom
      const fillHeight = this.barHeight * this._animatedValue;
      const fillY = y + this.barHeight - fillHeight;
      if (this.cornerRadius > 0) {
        context.beginPath();
        context.roundRect(x, fillY, this.barWidth, fillHeight, this.cornerRadius);
        context.fill();
      } else {
        context.fillRect(x, fillY, this.barWidth, fillHeight);
      }
    }
  }

  /**
   * Renders indeterminate progress bar.
   */
  protected renderIndeterminate(context: CanvasRenderingContext2D, x: number, y: number): void {
    context.fillStyle = this.fillColor.toCSSString();

    if (this.horizontal) {
      // Moving bar animation
      const barLength = this.barWidth * 0.3;
      const position = this._indeterminateProgress * (this.barWidth + barLength) - barLength;

      // Create gradient for smooth edges
      const gradient = context.createLinearGradient(position, 0, position + barLength, 0);
      gradient.addColorStop(0, 'rgba(33, 150, 243, 0)');
      gradient.addColorStop(0.2, this.fillColor.toCSSString());
      gradient.addColorStop(0.8, this.fillColor.toCSSString());
      gradient.addColorStop(1, 'rgba(33, 150, 243, 0)');

      context.fillStyle = gradient;
      if (this.cornerRadius > 0) {
        context.beginPath();
        context.roundRect(position, y, barLength, this.barHeight, this.cornerRadius);
        context.fill();
      } else {
        context.fillRect(position, y, barLength, this.barHeight);
      }
    } else {
      // Vertical moving bar animation
      const barLength = this.barHeight * 0.3;
      const position = this._indeterminateProgress * (this.barHeight + barLength) - barLength;

      const gradient = context.createLinearGradient(0, position, 0, position + barLength);
      gradient.addColorStop(0, 'rgba(33, 150, 243, 0)');
      gradient.addColorStop(0.2, this.fillColor.toCSSString());
      gradient.addColorStop(0.8, this.fillColor.toCSSString());
      gradient.addColorStop(1, 'rgba(33, 150, 243, 0)');

      context.fillStyle = gradient;
      if (this.cornerRadius > 0) {
        context.beginPath();
        context.roundRect(x, position, this.barWidth, barLength, this.cornerRadius);
        context.fill();
      } else {
        context.fillRect(x, position, this.barWidth, barLength);
      }
    }
  }

  /**
   * Sets the progress bar colors.
   *
   * @param fill - Fill color
   * @param background - Background color (optional)
   * @param border - Border color (optional)
   */
  setColors(fill: Color, background?: Color, border?: Color): this {
    this.fillColor = fill.clone();
    if (background) {
      this.backgroundColor = background.clone();
    }
    if (border) {
      this.borderColor = border.clone();
    }
    return this;
  }

  /**
   * Sets the progress bar size.
   *
   * @param width - Bar width
   * @param height - Bar height
   */
  setSize(width: number, height: number): this {
    this.barWidth = width;
    this.barHeight = height;
    this.size.set(width, height);
    return this;
  }

  /**
   * Sets the progress value with optional animation.
   *
   * @param value - Progress value [0, 1]
   * @param immediate - Skip animation if true
   */
  setValue(value: number, immediate: boolean = false): this {
    this._value = Math.max(0, Math.min(1, value));
    if (immediate) {
      this._animatedValue = this._value;
    }
    return this;
  }
}
