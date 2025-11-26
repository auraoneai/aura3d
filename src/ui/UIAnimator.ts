import { UIElement } from './UIElement';
import { Transitions, UIEasingFunction as EasingFunction } from './styling/Transitions';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIAnimator');

/**
 * Animation types for UI elements.
 */
export enum AnimationType {
  Fade = 'fade',
  Slide = 'slide',
  Scale = 'scale',
  Rotate = 'rotate',
  Custom = 'custom',
}

/**
 * Animation direction for slide animations.
 */
export enum SlideDirection {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

/**
 * UI animation configuration.
 */
export interface UIAnimationConfig {
  /**
   * Animation type.
   */
  type: AnimationType;

  /**
   * Duration in milliseconds.
   */
  duration: number;

  /**
   * Easing function.
   */
  easing: EasingFunction;

  /**
   * Delay before animation starts in milliseconds.
   */
  delay?: number;

  /**
   * Slide direction (for slide animations).
   */
  slideDirection?: SlideDirection;

  /**
   * Target scale value (for scale animations).
   */
  targetScale?: number;

  /**
   * Target rotation in radians (for rotate animations).
   */
  targetRotation?: number;

  /**
   * Custom animation function (for custom animations).
   */
  customFn?: (element: UIElement, progress: number) => void;

  /**
   * Callback when animation completes.
   */
  onComplete?: () => void;
}

/**
 * Represents a running animation.
 */
interface ActiveAnimation {
  element: UIElement;
  config: UIAnimationConfig;
  startTime: number;
  startValues: {
    alpha?: number;
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
  };
}

/**
 * UI animation system for creating smooth transitions and effects.
 * Supports fade, slide, scale, rotate, and custom animations with easing.
 */
export class UIAnimator {
  private static animations: Map<string, ActiveAnimation> = new Map();
  private static animationIdCounter: number = 0;
  private static isRunning: boolean = false;
  private static lastUpdateTime: number = 0;

  /**
   * Fades an element in from transparent to opaque.
   *
   * @param element - Element to animate
   * @param duration - Duration in milliseconds (default: 250)
   * @param easing - Easing function (default: EaseOut)
   * @param onComplete - Callback when animation completes
   * @returns Animation ID
   */
  static fadeIn(
    element: UIElement,
    duration: number = 250,
    easing: EasingFunction = EasingFunction.EaseOut,
    onComplete?: () => void
  ): string {
    return this.animate(element, {
      type: AnimationType.Fade,
      duration,
      easing,
      onComplete,
    });
  }

  /**
   * Fades an element out from opaque to transparent.
   *
   * @param element - Element to animate
   * @param duration - Duration in milliseconds (default: 250)
   * @param easing - Easing function (default: EaseIn)
   * @param onComplete - Callback when animation completes
   * @returns Animation ID
   */
  static fadeOut(
    element: UIElement,
    duration: number = 250,
    easing: EasingFunction = EasingFunction.EaseIn,
    onComplete?: () => void
  ): string {
    return this.animate(element, {
      type: AnimationType.Fade,
      duration,
      easing,
      onComplete,
    });
  }

  /**
   * Slides an element in from a direction.
   *
   * @param element - Element to animate
   * @param direction - Slide direction
   * @param distance - Distance to slide in pixels (default: 100)
   * @param duration - Duration in milliseconds (default: 300)
   * @param easing - Easing function (default: EaseOut)
   * @param onComplete - Callback when animation completes
   * @returns Animation ID
   */
  static slideIn(
    element: UIElement,
    direction: SlideDirection,
    distance: number = 100,
    duration: number = 300,
    easing: EasingFunction = EasingFunction.EaseOut,
    onComplete?: () => void
  ): string {
    return this.animate(element, {
      type: AnimationType.Slide,
      duration,
      easing,
      slideDirection: direction,
      onComplete,
    });
  }

  /**
   * Scales an element from 0 to its normal size.
   *
   * @param element - Element to animate
   * @param duration - Duration in milliseconds (default: 200)
   * @param easing - Easing function (default: EaseOutBack)
   * @param onComplete - Callback when animation completes
   * @returns Animation ID
   */
  static scaleIn(
    element: UIElement,
    duration: number = 200,
    easing: EasingFunction = EasingFunction.EaseOutBack,
    onComplete?: () => void
  ): string {
    return this.animate(element, {
      type: AnimationType.Scale,
      duration,
      easing,
      targetScale: 1,
      onComplete,
    });
  }

  /**
   * Scales an element from its normal size to 0.
   *
   * @param element - Element to animate
   * @param duration - Duration in milliseconds (default: 200)
   * @param easing - Easing function (default: EaseInBack)
   * @param onComplete - Callback when animation completes
   * @returns Animation ID
   */
  static scaleOut(
    element: UIElement,
    duration: number = 200,
    easing: EasingFunction = EasingFunction.EaseInBack,
    onComplete?: () => void
  ): string {
    return this.animate(element, {
      type: AnimationType.Scale,
      duration,
      easing,
      targetScale: 0,
      onComplete,
    });
  }

  /**
   * Animates an element with custom configuration.
   *
   * @param element - Element to animate
   * @param config - Animation configuration
   * @returns Animation ID
   */
  static animate(element: UIElement, config: UIAnimationConfig): string {
    const id = `anim_${this.animationIdCounter++}`;

    const animation: ActiveAnimation = {
      element,
      config,
      startTime: Date.now() + (config.delay || 0),
      startValues: this.captureStartValues(element, config),
    };

    this.animations.set(id, animation);

    if (!this.isRunning) {
      this.start();
    }

    logger.debug(`Started animation ${id} of type ${config.type}`);

    return id;
  }

  /**
   * Stops a running animation by ID.
   *
   * @param id - Animation ID to stop
   * @returns True if animation was stopped, false if not found
   */
  static stop(id: string): boolean {
    const stopped = this.animations.delete(id);
    if (stopped) {
      logger.debug(`Stopped animation ${id}`);
    }
    return stopped;
  }

  /**
   * Stops all animations on an element.
   *
   * @param element - Element to stop animations for
   * @returns Number of animations stopped
   */
  static stopAll(element: UIElement): number {
    let count = 0;
    for (const [id, animation] of this.animations.entries()) {
      if (animation.element === element) {
        this.animations.delete(id);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`Stopped ${count} animation(s) on element`);
    }
    return count;
  }

  /**
   * Updates all active animations.
   *
   * @param deltaTime - Time elapsed since last update in milliseconds
   */
  static update(deltaTime: number): void {
    if (this.animations.size === 0) {
      this.isRunning = false;
      return;
    }

    const now = Date.now();
    const completed: string[] = [];

    for (const [id, animation] of this.animations.entries()) {
      if (now < animation.startTime) {
        continue;
      }

      const elapsed = now - animation.startTime;
      const progress = Math.min(elapsed / animation.config.duration, 1);
      const easedProgress = Transitions.evaluate(animation.config.easing, progress);

      this.applyAnimation(animation, easedProgress);

      if (progress >= 1) {
        completed.push(id);
        if (animation.config.onComplete) {
          try {
            animation.config.onComplete();
          } catch (error) {
            logger.error('Error in animation completion callback', error);
          }
        }
      }
    }

    for (const id of completed) {
      this.animations.delete(id);
      logger.debug(`Completed animation ${id}`);
    }
  }

  /**
   * Starts the animation update loop.
   */
  private static start(): void {
    this.isRunning = true;
    this.lastUpdateTime = Date.now();
    logger.debug('Animation system started');
  }

  /**
   * Captures initial values for animation.
   *
   * @param element - Element to capture values from
   * @param config - Animation configuration
   * @returns Start values object
   */
  private static captureStartValues(
    element: UIElement,
    config: UIAnimationConfig
  ): ActiveAnimation['startValues'] {
    const values: ActiveAnimation['startValues'] = {};

    switch (config.type) {
      case AnimationType.Fade:
        values.alpha = element.alpha;
        break;

      case AnimationType.Slide:
        values.x = element.position.x;
        values.y = element.position.y;
        break;

      case AnimationType.Scale:
        values.scaleX = element.scale.x;
        values.scaleY = element.scale.y;
        break;

      case AnimationType.Rotate:
        values.rotation = element.rotation;
        break;
    }

    return values;
  }

  /**
   * Applies animation to element based on progress.
   *
   * @param animation - Animation to apply
   * @param progress - Animation progress [0, 1]
   */
  private static applyAnimation(animation: ActiveAnimation, progress: number): void {
    const { element, config, startValues } = animation;

    switch (config.type) {
      case AnimationType.Fade:
        if (startValues.alpha !== undefined) {
          element.alpha = startValues.alpha + (1 - startValues.alpha) * progress;
        }
        break;

      case AnimationType.Slide:
        if (config.slideDirection && startValues.x !== undefined && startValues.y !== undefined) {
          const distance = 100;
          switch (config.slideDirection) {
            case SlideDirection.Up:
              element.position.y = startValues.y - distance * (1 - progress);
              break;
            case SlideDirection.Down:
              element.position.y = startValues.y + distance * (1 - progress);
              break;
            case SlideDirection.Left:
              element.position.x = startValues.x - distance * (1 - progress);
              break;
            case SlideDirection.Right:
              element.position.x = startValues.x + distance * (1 - progress);
              break;
          }
        }
        break;

      case AnimationType.Scale:
        if (config.targetScale !== undefined && startValues.scaleX !== undefined) {
          const scale = startValues.scaleX + (config.targetScale - startValues.scaleX) * progress;
          element.scale.x = scale;
          element.scale.y = scale;
        }
        break;

      case AnimationType.Rotate:
        if (config.targetRotation !== undefined && startValues.rotation !== undefined) {
          element.rotation = startValues.rotation + (config.targetRotation - startValues.rotation) * progress;
        }
        break;

      case AnimationType.Custom:
        if (config.customFn) {
          config.customFn(element, progress);
        }
        break;
    }
  }

  /**
   * Gets the number of active animations.
   *
   * @returns Active animation count
   */
  static getActiveCount(): number {
    return this.animations.size;
  }

  /**
   * Clears all animations.
   */
  static clear(): void {
    const count = this.animations.size;
    this.animations.clear();
    this.isRunning = false;
    logger.debug(`Cleared ${count} animation(s)`);
  }
}
