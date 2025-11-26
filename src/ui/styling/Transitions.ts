/**
 * UI easing function types for transitions and animations.
 */
export enum UIEasingFunction {
  Linear = 'linear',
  EaseIn = 'easeIn',
  EaseOut = 'easeOut',
  EaseInOut = 'easeInOut',
  EaseInQuad = 'easeInQuad',
  EaseOutQuad = 'easeOutQuad',
  EaseInOutQuad = 'easeInOutQuad',
  EaseInCubic = 'easeInCubic',
  EaseOutCubic = 'easeOutCubic',
  EaseInOutCubic = 'easeInOutCubic',
  EaseInQuart = 'easeInQuart',
  EaseOutQuart = 'easeOutQuart',
  EaseInOutQuart = 'easeInOutQuart',
  EaseInBack = 'easeInBack',
  EaseOutBack = 'easeOutBack',
  EaseInOutBack = 'easeInOutBack',
  EaseInElastic = 'easeInElastic',
  EaseOutElastic = 'easeOutElastic',
  EaseInOutElastic = 'easeInOutElastic',
}

/**
 * Transition configuration for UI state changes.
 */
export interface TransitionConfig {
  /**
   * Duration in milliseconds.
   */
  duration: number;

  /**
   * Easing function.
   */
  easing: UIEasingFunction;

  /**
   * Delay before transition starts in milliseconds.
   */
  delay?: number;
}

/**
 * Transition presets for common UI animations.
 */
export class Transitions {
  /**
   * Fast transition (150ms).
   */
  fast: TransitionConfig;

  /**
   * Normal transition (250ms).
   */
  normal: TransitionConfig;

  /**
   * Slow transition (400ms).
   */
  slow: TransitionConfig;

  /**
   * Fade transition.
   */
  fade: TransitionConfig;

  /**
   * Slide transition.
   */
  slide: TransitionConfig;

  /**
   * Scale transition.
   */
  scale: TransitionConfig;

  /**
   * Creates a new Transitions instance.
   *
   * @param config - Configuration object
   */
  constructor(config?: {
    fast?: TransitionConfig;
    normal?: TransitionConfig;
    slow?: TransitionConfig;
    fade?: TransitionConfig;
    slide?: TransitionConfig;
    scale?: TransitionConfig;
  }) {
    this.fast = config?.fast ?? {
      duration: 150,
      easing: UIEasingFunction.EaseOut,
    };

    this.normal = config?.normal ?? {
      duration: 250,
      easing: UIEasingFunction.EaseInOut,
    };

    this.slow = config?.slow ?? {
      duration: 400,
      easing: UIEasingFunction.EaseInOut,
    };

    this.fade = config?.fade ?? {
      duration: 200,
      easing: UIEasingFunction.EaseIn,
    };

    this.slide = config?.slide ?? {
      duration: 300,
      easing: UIEasingFunction.EaseOut,
    };

    this.scale = config?.scale ?? {
      duration: 200,
      easing: UIEasingFunction.EaseInOutBack,
    };
  }

  /**
   * Creates a copy of this transitions configuration.
   *
   * @returns A new Transitions instance
   */
  clone(): Transitions {
    return new Transitions({
      fast: { ...this.fast },
      normal: { ...this.normal },
      slow: { ...this.slow },
      fade: { ...this.fade },
      slide: { ...this.slide },
      scale: { ...this.scale },
    });
  }

  /**
   * Creates a default transitions configuration.
   *
   * @returns A Transitions instance
   */
  static createDefault(): Transitions {
    return new Transitions();
  }

  /**
   * Evaluates an easing function at time t.
   *
   * @param easing - Easing function to use
   * @param t - Time value in range [0, 1]
   * @returns Eased value in range [0, 1]
   */
  static evaluate(easing: UIEasingFunction, t: number): number {
    t = Math.max(0, Math.min(1, t));

    switch (easing) {
      case UIEasingFunction.Linear:
        return t;

      case UIEasingFunction.EaseIn:
        return t * t;

      case UIEasingFunction.EaseOut:
        return t * (2 - t);

      case UIEasingFunction.EaseInOut:
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      case UIEasingFunction.EaseInQuad:
        return t * t;

      case UIEasingFunction.EaseOutQuad:
        return t * (2 - t);

      case UIEasingFunction.EaseInOutQuad:
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      case UIEasingFunction.EaseInCubic:
        return t * t * t;

      case UIEasingFunction.EaseOutCubic:
        return (--t) * t * t + 1;

      case UIEasingFunction.EaseInOutCubic:
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

      case UIEasingFunction.EaseInQuart:
        return t * t * t * t;

      case UIEasingFunction.EaseOutQuart:
        return 1 - (--t) * t * t * t;

      case UIEasingFunction.EaseInOutQuart:
        return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;

      case UIEasingFunction.EaseInBack: {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return c3 * t * t * t - c1 * t * t;
      }

      case UIEasingFunction.EaseOutBack: {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      }

      case UIEasingFunction.EaseInOutBack: {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
          ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
          : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
      }

      case UIEasingFunction.EaseInElastic: {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
      }

      case UIEasingFunction.EaseOutElastic: {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
      }

      case UIEasingFunction.EaseInOutElastic: {
        const c5 = (2 * Math.PI) / 4.5;
        return t === 0
          ? 0
          : t === 1
          ? 1
          : t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
      }

      default:
        return t;
    }
  }
}
