/**
 * @fileoverview Utility consideration with response curves.
 * Implements considerations for utility-based AI decision making.
 * @module ai/planning/Consideration
 */

import { Logger } from '../../core/Logger';

/**
 * Response curve types for considerations.
 */
export enum CurveType {
  /** Linear curve (y = x) */
  LINEAR = 'linear',
  /** Quadratic curve (y = x^2) */
  QUADRATIC = 'quadratic',
  /** Cubic curve (y = x^3) */
  CUBIC = 'cubic',
  /** Inverse curve (y = 1 - x) */
  INVERSE = 'inverse',
  /** Exponential curve (y = e^(k*x)) */
  EXPONENTIAL = 'exponential',
  /** Logistic sigmoid curve */
  LOGISTIC = 'logistic',
  /** Boolean step function */
  BOOLEAN = 'boolean',
  /** Custom curve function */
  CUSTOM = 'custom',
}

/**
 * Response curve parameters.
 */
export interface CurveParams {
  /** Curve type */
  type: CurveType;
  /** Slope/steepness parameter */
  slope?: number;
  /** Exponent for polynomial curves */
  exponent?: number;
  /** Threshold for boolean curves */
  threshold?: number;
  /** X-axis shift */
  xShift?: number;
  /** Y-axis shift */
  yShift?: number;
  /** Y-axis scale */
  yScale?: number;
  /** Custom curve function */
  customFunc?: (x: number) => number;
}

/**
 * Default curve parameters.
 */
export const DefaultCurveParams: CurveParams = {
  type: CurveType.LINEAR,
  slope: 1.0,
  exponent: 2.0,
  threshold: 0.5,
  xShift: 0.0,
  yShift: 0.0,
  yScale: 1.0,
};

/**
 * Consideration for utility-based AI.
 * Evaluates a single factor and applies a response curve.
 *
 * @example
 * ```typescript
 * // Health consideration
 * const healthConsideration = new Consideration('Health');
 * healthConsideration.inputFunc = (context) => {
 *   return context.agent.health / context.agent.maxHealth; // 0-1
 * };
 * healthConsideration.curve = {
 *   type: CurveType.INVERSE, // Lower health = higher utility
 *   yScale: 1.0
 * };
 *
 * // Distance consideration
 * const distanceConsideration = new Consideration('Distance');
 * distanceConsideration.inputFunc = (context) => {
 *   const dist = context.agent.position.distanceTo(context.target.position);
 *   return 1.0 - Math.min(dist / 100.0, 1.0); // 0-1, closer = higher
 * };
 * distanceConsideration.curve = {
 *   type: CurveType.QUADRATIC,
 *   exponent: 2.0
 * };
 *
 * // Evaluate
 * const score = healthConsideration.evaluate(context);
 * ```
 */
export class Consideration {
  /** Consideration name */
  readonly name: string;

  /** Input function (returns 0-1 value) */
  inputFunc?: (context: any) => number;

  /** Response curve parameters */
  curve: CurveParams;

  /** Weight multiplier */
  weight: number;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new consideration.
   *
   * @param name - Consideration name
   * @param curve - Response curve parameters
   * @param weight - Weight multiplier
   */
  constructor(
    name: string,
    curve: CurveParams = DefaultCurveParams,
    weight: number = 1.0
  ) {
    this.name = name;
    this.curve = { ...DefaultCurveParams, ...curve };
    this.weight = weight;
    this.logger = new Logger(`Consideration:${name}`);
  }

  /**
   * Evaluates the consideration.
   *
   * @param context - Evaluation context
   * @returns Utility score (0-1)
   *
   * @example
   * ```typescript
   * const score = consideration.evaluate({
   *   agent: agent,
   *   target: target,
   *   world: worldState
   * });
   * ```
   */
  evaluate(context: any): number {
    if (!this.inputFunc) {
      this.logger.warn(`Consideration ${this.name} has no input function`);
      return 0;
    }

    // Get input value (should be 0-1)
    const input = this.inputFunc(context);
    const clampedInput = Math.max(0, Math.min(1, input));

    // Apply response curve
    const output = this.applyCurve(clampedInput);

    // Apply weight
    return output * this.weight;
  }

  /**
   * Applies the response curve to an input value.
   * @private
   */
  private applyCurve(x: number): number {
    const params = this.curve;

    // Apply x-shift
    let adjustedX = x - (params.xShift || 0);
    adjustedX = Math.max(0, Math.min(1, adjustedX));

    let y = 0;

    switch (params.type) {
      case CurveType.LINEAR:
        y = adjustedX;
        break;

      case CurveType.QUADRATIC:
        y = Math.pow(adjustedX, params.exponent || 2.0);
        break;

      case CurveType.CUBIC:
        y = Math.pow(adjustedX, 3.0);
        break;

      case CurveType.INVERSE:
        y = 1.0 - adjustedX;
        break;

      case CurveType.EXPONENTIAL:
        const k = params.slope || 1.0;
        y = (Math.exp(k * adjustedX) - 1.0) / (Math.exp(k) - 1.0);
        break;

      case CurveType.LOGISTIC:
        const steepness = params.slope || 10.0;
        const midpoint = params.threshold || 0.5;
        y = 1.0 / (1.0 + Math.exp(-steepness * (adjustedX - midpoint)));
        break;

      case CurveType.BOOLEAN:
        y = adjustedX >= (params.threshold || 0.5) ? 1.0 : 0.0;
        break;

      case CurveType.CUSTOM:
        if (params.customFunc) {
          y = params.customFunc(adjustedX);
        } else {
          y = adjustedX;
        }
        break;

      default:
        y = adjustedX;
    }

    // Apply y-scale and y-shift
    y = y * (params.yScale || 1.0) + (params.yShift || 0.0);

    // Clamp to 0-1
    return Math.max(0, Math.min(1, y));
  }

  /**
   * Clones the consideration.
   *
   * @returns New consideration with copied data
   */
  clone(): Consideration {
    const consideration = new Consideration(this.name, this.curve, this.weight);
    consideration.inputFunc = this.inputFunc;
    return consideration;
  }

  /**
   * Creates a linear consideration.
   *
   * @param name - Consideration name
   * @param inputFunc - Input function
   * @param weight - Weight multiplier
   * @returns New consideration
   *
   * @example
   * ```typescript
   * const ammo = Consideration.linear(
   *   'Ammo',
   *   (ctx) => ctx.agent.ammo / ctx.agent.maxAmmo,
   *   1.0
   * );
   * ```
   */
  static linear(
    name: string,
    inputFunc: (context: any) => number,
    weight: number = 1.0
  ): Consideration {
    const consideration = new Consideration(
      name,
      { type: CurveType.LINEAR },
      weight
    );
    consideration.inputFunc = inputFunc;
    return consideration;
  }

  /**
   * Creates an inverse consideration.
   *
   * @param name - Consideration name
   * @param inputFunc - Input function
   * @param weight - Weight multiplier
   * @returns New consideration
   *
   * @example
   * ```typescript
   * const danger = Consideration.inverse(
   *   'Danger',
   *   (ctx) => ctx.agent.health / ctx.agent.maxHealth,
   *   1.5
   * );
   * ```
   */
  static inverse(
    name: string,
    inputFunc: (context: any) => number,
    weight: number = 1.0
  ): Consideration {
    const consideration = new Consideration(
      name,
      { type: CurveType.INVERSE },
      weight
    );
    consideration.inputFunc = inputFunc;
    return consideration;
  }

  /**
   * Creates a quadratic consideration.
   *
   * @param name - Consideration name
   * @param inputFunc - Input function
   * @param exponent - Curve exponent
   * @param weight - Weight multiplier
   * @returns New consideration
   *
   * @example
   * ```typescript
   * const accuracy = Consideration.quadratic(
   *   'Accuracy',
   *   (ctx) => 1.0 - (ctx.distance / ctx.maxDistance),
   *   2.0,
   *   1.0
   * );
   * ```
   */
  static quadratic(
    name: string,
    inputFunc: (context: any) => number,
    exponent: number = 2.0,
    weight: number = 1.0
  ): Consideration {
    const consideration = new Consideration(
      name,
      { type: CurveType.QUADRATIC, exponent },
      weight
    );
    consideration.inputFunc = inputFunc;
    return consideration;
  }

  /**
   * Creates a logistic consideration.
   *
   * @param name - Consideration name
   * @param inputFunc - Input function
   * @param slope - Curve steepness
   * @param threshold - Midpoint threshold
   * @param weight - Weight multiplier
   * @returns New consideration
   *
   * @example
   * ```typescript
   * const threat = Consideration.logistic(
   *   'Threat',
   *   (ctx) => ctx.enemyStrength / ctx.maxStrength,
   *   10.0,
   *   0.5,
   *   1.0
   * );
   * ```
   */
  static logistic(
    name: string,
    inputFunc: (context: any) => number,
    slope: number = 10.0,
    threshold: number = 0.5,
    weight: number = 1.0
  ): Consideration {
    const consideration = new Consideration(
      name,
      { type: CurveType.LOGISTIC, slope, threshold },
      weight
    );
    consideration.inputFunc = inputFunc;
    return consideration;
  }

  /**
   * Creates a boolean consideration.
   *
   * @param name - Consideration name
   * @param inputFunc - Input function
   * @param threshold - Boolean threshold
   * @param weight - Weight multiplier
   * @returns New consideration
   *
   * @example
   * ```typescript
   * const hasWeapon = Consideration.boolean(
   *   'HasWeapon',
   *   (ctx) => ctx.agent.hasWeapon ? 1.0 : 0.0,
   *   0.5,
   *   1.0
   * );
   * ```
   */
  static boolean(
    name: string,
    inputFunc: (context: any) => number,
    threshold: number = 0.5,
    weight: number = 1.0
  ): Consideration {
    const consideration = new Consideration(
      name,
      { type: CurveType.BOOLEAN, threshold },
      weight
    );
    consideration.inputFunc = inputFunc;
    return consideration;
  }

  /**
   * Creates a custom consideration with a curve function.
   *
   * @param name - Consideration name
   * @param inputFunc - Input function
   * @param curveFunc - Custom curve function
   * @param weight - Weight multiplier
   * @returns New consideration
   *
   * @example
   * ```typescript
   * const custom = Consideration.custom(
   *   'Custom',
   *   (ctx) => ctx.value,
   *   (x) => Math.sin(x * Math.PI), // Custom sine curve
   *   1.0
   * );
   * ```
   */
  static custom(
    name: string,
    inputFunc: (context: any) => number,
    curveFunc: (x: number) => number,
    weight: number = 1.0
  ): Consideration {
    const consideration = new Consideration(
      name,
      { type: CurveType.CUSTOM, customFunc: curveFunc },
      weight
    );
    consideration.inputFunc = inputFunc;
    return consideration;
  }
}
