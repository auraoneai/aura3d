/**
 * Physics material defining friction and restitution properties.
 * Controls how surfaces interact during collisions.
 *
 * @module Physics/PhysicsMaterial
 */

/**
 * Combine modes for material properties when two materials interact.
 * Determines how friction and restitution values are combined.
 */
export enum CombineMode {
  /** Average the two values: (a + b) / 2 */
  Average = 0,

  /** Use the minimum value: min(a, b) */
  Minimum = 1,

  /** Use the maximum value: max(a, b) */
  Maximum = 2,

  /** Multiply the values: a * b */
  Multiply = 3
}

/**
 * Physics material defining surface properties for collision response.
 *
 * Materials control how objects bounce, slide, and interact during collisions.
 * Friction determines sliding resistance, while restitution controls bounciness.
 *
 * @example
 * ```typescript
 * // Create a bouncy rubber material
 * const rubber = new PhysicsMaterial({
 *   staticFriction: 0.8,
 *   dynamicFriction: 0.6,
 *   restitution: 0.9
 * });
 *
 * // Create an icy material
 * const ice = new PhysicsMaterial({
 *   staticFriction: 0.05,
 *   dynamicFriction: 0.03,
 *   restitution: 0.1
 * });
 *
 * // Combine materials
 * const combinedFriction = PhysicsMaterial.combineFriction(
 *   rubber.staticFriction, ice.staticFriction,
 *   rubber.frictionCombine, ice.frictionCombine
 * );
 * ```
 */
export class PhysicsMaterial {
  /**
   * Human-readable material name for debugging.
   */
  name: string;

  /**
   * Static friction coefficient (0-1+).
   * Controls resistance to starting motion.
   * Higher values make objects harder to move from rest.
   * Typical range: 0 (ice) to 1+ (rubber).
   */
  staticFriction: number;

  /**
   * Dynamic/kinetic friction coefficient (0-1+).
   * Controls resistance to ongoing motion.
   * Usually less than static friction.
   * Typical range: 0 (ice) to 1+ (rubber).
   */
  dynamicFriction: number;

  /**
   * Restitution/bounciness coefficient (0-1).
   * Controls energy retention in collisions.
   * 0 = perfectly inelastic (no bounce)
   * 1 = perfectly elastic (full bounce)
   * Values > 1 add energy (generally avoided).
   */
  restitution: number;

  /**
   * How to combine friction values with other materials.
   */
  frictionCombine: CombineMode;

  /**
   * How to combine restitution values with other materials.
   */
  restitutionCombine: CombineMode;

  /**
   * Density in kg/m³ (optional, used for automatic mass calculation).
   * Common values:
   * - Wood: 700
   * - Ice: 917
   * - Concrete: 2400
   * - Steel: 7850
   * - Gold: 19300
   */
  density: number;

  /**
   * Creates a new physics material.
   *
   * @param options - Material configuration
   * @param options.name - Material name (default: "Material")
   * @param options.staticFriction - Static friction coefficient (default: 0.6)
   * @param options.dynamicFriction - Dynamic friction coefficient (default: 0.4)
   * @param options.restitution - Restitution coefficient (default: 0.3)
   * @param options.frictionCombine - Friction combine mode (default: Average)
   * @param options.restitutionCombine - Restitution combine mode (default: Average)
   * @param options.density - Material density in kg/m³ (default: 1000)
   *
   * @example
   * ```typescript
   * const wood = new PhysicsMaterial({
   *   name: 'Wood',
   *   staticFriction: 0.5,
   *   dynamicFriction: 0.3,
   *   restitution: 0.4,
   *   density: 700
   * });
   * ```
   */
  constructor(options: {
    name?: string;
    staticFriction?: number;
    dynamicFriction?: number;
    restitution?: number;
    frictionCombine?: CombineMode;
    restitutionCombine?: CombineMode;
    density?: number;
  } = {}) {
    this.name = options.name ?? 'Material';
    this.staticFriction = options.staticFriction ?? 0.6;
    this.dynamicFriction = options.dynamicFriction ?? 0.4;
    this.restitution = options.restitution ?? 0.3;
    this.frictionCombine = options.frictionCombine ?? CombineMode.Average;
    this.restitutionCombine = options.restitutionCombine ?? CombineMode.Average;
    this.density = options.density ?? 1000;
  }

  /**
   * Creates a copy of this material.
   *
   * @returns New material with same properties
   *
   * @example
   * ```typescript
   * const original = PhysicsMaterial.steel();
   * const variant = original.clone();
   * variant.restitution = 0.8; // Modify without affecting original
   * ```
   */
  clone(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: this.name,
      staticFriction: this.staticFriction,
      dynamicFriction: this.dynamicFriction,
      restitution: this.restitution,
      frictionCombine: this.frictionCombine,
      restitutionCombine: this.restitutionCombine,
      density: this.density
    });
  }

  /**
   * Combines two friction values according to combine modes.
   *
   * @param a - First friction value
   * @param b - Second friction value
   * @param modeA - Combine mode for first material
   * @param modeB - Combine mode for second material
   * @returns Combined friction value
   *
   * @example
   * ```typescript
   * const friction = PhysicsMaterial.combineFriction(
   *   0.8, 0.2,
   *   CombineMode.Average, CombineMode.Average
   * ); // Returns 0.5
   * ```
   */
  static combineFriction(
    a: number,
    b: number,
    modeA: CombineMode,
    modeB: CombineMode
  ): number {
    // If modes differ, prefer the more conservative (higher priority) mode
    const mode = modeA === modeB ? modeA : Math.max(modeA, modeB);
    return PhysicsMaterial.combineValues(a, b, mode);
  }

  /**
   * Combines two restitution values according to combine modes.
   *
   * @param a - First restitution value
   * @param b - Second restitution value
   * @param modeA - Combine mode for first material
   * @param modeB - Combine mode for second material
   * @returns Combined restitution value
   *
   * @example
   * ```typescript
   * const restitution = PhysicsMaterial.combineRestitution(
   *   0.9, 0.1,
   *   CombineMode.Maximum, CombineMode.Average
   * ); // Returns 0.9 (Maximum wins)
   * ```
   */
  static combineRestitution(
    a: number,
    b: number,
    modeA: CombineMode,
    modeB: CombineMode
  ): number {
    const mode = modeA === modeB ? modeA : Math.max(modeA, modeB);
    return PhysicsMaterial.combineValues(a, b, mode);
  }

  /**
   * Combines two values according to a combine mode.
   *
   * @param a - First value
   * @param b - Second value
   * @param mode - Combine mode
   * @returns Combined value
   */
  private static combineValues(a: number, b: number, mode: CombineMode): number {
    switch (mode) {
      case CombineMode.Average:
        return (a + b) * 0.5;
      case CombineMode.Minimum:
        return Math.min(a, b);
      case CombineMode.Maximum:
        return Math.max(a, b);
      case CombineMode.Multiply:
        return a * b;
      default:
        return (a + b) * 0.5;
    }
  }

  // ============================================================================
  // Preset Materials
  // ============================================================================

  /**
   * Default material with moderate friction and bounce.
   *
   * @returns New default material
   */
  static default(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Default',
      staticFriction: 0.6,
      dynamicFriction: 0.4,
      restitution: 0.3,
      density: 1000
    });
  }

  /**
   * Ice material with very low friction and minimal bounce.
   *
   * @returns New ice material
   */
  static ice(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Ice',
      staticFriction: 0.05,
      dynamicFriction: 0.03,
      restitution: 0.1,
      density: 917
    });
  }

  /**
   * Rubber material with high friction and high bounce.
   *
   * @returns New rubber material
   */
  static rubber(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Rubber',
      staticFriction: 0.9,
      dynamicFriction: 0.7,
      restitution: 0.85,
      density: 1200
    });
  }

  /**
   * Wood material with moderate friction and low bounce.
   *
   * @returns New wood material
   */
  static wood(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Wood',
      staticFriction: 0.5,
      dynamicFriction: 0.3,
      restitution: 0.4,
      density: 700
    });
  }

  /**
   * Metal material with low friction and low bounce.
   *
   * @returns New metal material
   */
  static metal(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Metal',
      staticFriction: 0.3,
      dynamicFriction: 0.2,
      restitution: 0.2,
      density: 7850
    });
  }

  /**
   * Concrete material with high friction and very low bounce.
   *
   * @returns New concrete material
   */
  static concrete(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Concrete',
      staticFriction: 0.7,
      dynamicFriction: 0.6,
      restitution: 0.1,
      density: 2400
    });
  }

  /**
   * Bouncy material with high restitution (like a ball).
   *
   * @returns New bouncy material
   */
  static bouncy(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Bouncy',
      staticFriction: 0.5,
      dynamicFriction: 0.3,
      restitution: 0.95,
      density: 800
    });
  }

  /**
   * Frictionless material with no resistance (like air hockey).
   *
   * @returns New frictionless material
   */
  static frictionless(): PhysicsMaterial {
    return new PhysicsMaterial({
      name: 'Frictionless',
      staticFriction: 0.0,
      dynamicFriction: 0.0,
      restitution: 0.5,
      density: 1000
    });
  }
}
