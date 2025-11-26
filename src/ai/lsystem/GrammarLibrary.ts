import { DOLSystemConfig } from './DOLSystem';
import { StochasticLSystemConfig } from './StochasticLSystem';
import { Logger } from '../../core/Logger';

/**
 * Library of predefined L-system grammars.
 *
 * Provides ready-to-use grammars for common patterns:
 * - Trees and plants
 * - Fractals (Koch curve, Sierpinski, Dragon curve)
 * - Space-filling curves (Hilbert, Peano)
 * - Natural patterns
 *
 * @example
 * ```typescript
 * const config = GrammarLibrary.getTree('simple');
 * const lsystem = new DOLSystem(config);
 * const result = lsystem.generate(4);
 * ```
 */
export class GrammarLibrary {
  private static logger = new Logger('GrammarLibrary');

  /**
   * Gets a tree grammar by name.
   * @param name - Name of the tree type
   * @returns L-system configuration
   */
  public static getTree(name: string): DOLSystemConfig | null {
    const trees: Record<string, DOLSystemConfig> = {
      simple: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'F[+F]F[-F]F' }
        ]
      },

      binary: {
        axiom: 'X',
        rules: [
          { predecessor: 'X', successor: 'F[+X][-X]FX' },
          { predecessor: 'F', successor: 'FF' }
        ]
      },

      bushy: {
        axiom: 'Y',
        rules: [
          { predecessor: 'Y', successor: 'YFX[+Y][-Y]' },
          { predecessor: 'X', successor: 'X[-FFF][+FFF]FX' }
        ]
      },

      pine: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'F[++F]F[--F]+F[-F]' }
        ]
      },

      willow: {
        axiom: 'X',
        rules: [
          { predecessor: 'X', successor: 'F[+X][-X]FX' },
          { predecessor: 'F', successor: 'FF' }
        ]
      }
    };

    const config = trees[name];
    if (config) {
      this.logger.debug(`Retrieved tree grammar: ${name}`);
      return config;
    }

    this.logger.warn(`Unknown tree grammar: ${name}`);
    return null;
  }

  /**
   * Gets a stochastic tree grammar.
   * @returns Stochastic L-system configuration
   */
  public static getStochasticTree(): StochasticLSystemConfig {
    return {
      axiom: 'F',
      rules: [
        { predecessor: 'F', successor: 'F[+F]F[-F]F', probability: 0.33 },
        { predecessor: 'F', successor: 'F[+F]F[-F][F]', probability: 0.33 },
        { predecessor: 'F', successor: 'F[++F][-F]F', probability: 0.34 }
      ]
    };
  }

  /**
   * Gets a fractal grammar by name.
   * @param name - Name of the fractal type
   * @returns L-system configuration
   */
  public static getFractal(name: string): DOLSystemConfig | null {
    const fractals: Record<string, DOLSystemConfig> = {
      koch: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'F+F-F-F+F' }
        ]
      },

      kochIsland: {
        axiom: 'F+F+F+F',
        rules: [
          { predecessor: 'F', successor: 'F+F-F-FF+F+F-F' }
        ]
      },

      kochSnowflake: {
        axiom: 'F++F++F',
        rules: [
          { predecessor: 'F', successor: 'F-F++F-F' }
        ]
      },

      sierpinskiTriangle: {
        axiom: 'F-G-G',
        rules: [
          { predecessor: 'F', successor: 'F-G+F+G-F' },
          { predecessor: 'G', successor: 'GG' }
        ]
      },

      sierpinskiCarpet: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'FFF[+FFF+FFF+FFF]' }
        ]
      },

      dragonCurve: {
        axiom: 'FX',
        rules: [
          { predecessor: 'X', successor: 'X+YF+' },
          { predecessor: 'Y', successor: '-FX-Y' }
        ]
      },

      hilbertCurve: {
        axiom: 'A',
        rules: [
          { predecessor: 'A', successor: '-BF+AFA+FB-' },
          { predecessor: 'B', successor: '+AF-BFB-FA+' }
        ]
      },

      peanoCurve: {
        axiom: 'X',
        rules: [
          { predecessor: 'X', successor: 'XFYFX+F+YFXFY-F-XFYFX' },
          { predecessor: 'Y', successor: 'YFXFY-F-XFYFX+F+YFXFY' }
        ]
      }
    };

    const config = fractals[name];
    if (config) {
      this.logger.debug(`Retrieved fractal grammar: ${name}`);
      return config;
    }

    this.logger.warn(`Unknown fractal grammar: ${name}`);
    return null;
  }

  /**
   * Gets a plant grammar by name.
   * @param name - Name of the plant type
   * @returns L-system configuration
   */
  public static getPlant(name: string): DOLSystemConfig | null {
    const plants: Record<string, DOLSystemConfig> = {
      algae: {
        axiom: 'A',
        rules: [
          { predecessor: 'A', successor: 'AB' },
          { predecessor: 'B', successor: 'A' }
        ]
      },

      fern: {
        axiom: 'X',
        rules: [
          { predecessor: 'X', successor: 'F[+X]F[-X]+X' },
          { predecessor: 'F', successor: 'FF' }
        ]
      },

      weed: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'F[+F]F[-F][F]' }
        ]
      },

      bush: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]' }
        ]
      },

      grass: {
        axiom: 'F',
        rules: [
          { predecessor: 'F', successor: 'F[+F][-F]F[+F]F' }
        ]
      }
    };

    const config = plants[name];
    if (config) {
      this.logger.debug(`Retrieved plant grammar: ${name}`);
      return config;
    }

    this.logger.warn(`Unknown plant grammar: ${name}`);
    return null;
  }

  /**
   * Gets a 3D tree grammar with pitch and roll.
   * @returns L-system configuration
   */
  public static get3DTree(): DOLSystemConfig {
    return {
      axiom: 'A',
      rules: [
        { predecessor: 'A', successor: 'F[&+A][&-A][^+A][^-A]' },
        { predecessor: 'F', successor: 'FF' }
      ]
    };
  }

  /**
   * Gets a space-filling curve grammar.
   * @param dimension - 2 or 3 for dimension
   * @returns L-system configuration
   */
  public static getSpaceFillingCurve(dimension: number): DOLSystemConfig | null {
    if (dimension === 2) {
      return {
        axiom: 'A',
        rules: [
          { predecessor: 'A', successor: '+BF-AFA-FB+' },
          { predecessor: 'B', successor: '-AF+BFB+FA-' }
        ]
      };
    } else if (dimension === 3) {
      return {
        axiom: 'X',
        rules: [
          { predecessor: 'X', successor: '^<XF^<XFX-F^>>XFX&F+>>XFX-F>X->' }
        ]
      };
    }

    this.logger.warn(`Invalid dimension for space-filling curve: ${dimension}`);
    return null;
  }

  /**
   * Gets all available tree names.
   * @returns Array of tree names
   */
  public static getTreeNames(): string[] {
    return ['simple', 'binary', 'bushy', 'pine', 'willow'];
  }

  /**
   * Gets all available fractal names.
   * @returns Array of fractal names
   */
  public static getFractalNames(): string[] {
    return [
      'koch',
      'kochIsland',
      'kochSnowflake',
      'sierpinskiTriangle',
      'sierpinskiCarpet',
      'dragonCurve',
      'hilbertCurve',
      'peanoCurve'
    ];
  }

  /**
   * Gets all available plant names.
   * @returns Array of plant names
   */
  public static getPlantNames(): string[] {
    return ['algae', 'fern', 'weed', 'bush', 'grass'];
  }

  /**
   * Creates a custom grammar.
   * @param axiom - Starting axiom
   * @param rules - Production rules
   * @returns L-system configuration
   */
  public static createCustom(
    axiom: string,
    rules: { predecessor: string; successor: string }[]
  ): DOLSystemConfig {
    return { axiom, rules };
  }
}
