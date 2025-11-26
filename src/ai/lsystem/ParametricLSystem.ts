import { Logger } from '../../core/Logger';

/**
 * Parametric symbol with a name and optional parameters.
 */
export interface ParametricSymbol {
  /** The symbol name */
  symbol: string;
  /** Array of numeric parameters */
  parameters: number[];
}

/**
 * Condition function for parametric rules.
 * @param params - The parameters of the matched symbol
 * @returns True if the condition is satisfied
 */
export type ParametricCondition = (params: number[]) => boolean;

/**
 * Successor function for parametric rules.
 * @param params - The parameters of the matched symbol
 * @returns The replacement symbols
 */
export type ParametricSuccessor = (params: number[]) => ParametricSymbol[];

/**
 * Parametric production rule.
 */
export interface ParametricRule {
  /** The symbol to match */
  predecessor: string;
  /** Condition that must be true for rule to apply */
  condition?: ParametricCondition;
  /** Function that generates successor symbols */
  successor: ParametricSuccessor;
}

/**
 * Configuration for a parametric L-system.
 */
export interface ParametricLSystemConfig {
  /** The initial axiom */
  axiom: ParametricSymbol[];
  /** Production rules */
  rules: ParametricRule[];
  /** Maximum number of iterations to prevent infinite expansion */
  maxIterations?: number;
}

/**
 * Parametric L-system.
 *
 * A parametric L-system extends traditional L-systems by allowing symbols
 * to carry numeric parameters. Production rules can use these parameters
 * in conditions and to compute parameters for successor symbols.
 *
 * This enables modeling of continuous properties like branch thickness,
 * angles, growth rates, and other attributes that vary continuously.
 *
 * @example
 * ```typescript
 * const tree = new ParametricLSystem({
 *   axiom: [{ symbol: 'A', parameters: [1, 10] }], // width, length
 *   rules: [
 *     {
 *       predecessor: 'A',
 *       condition: (p) => p[1] > 1,
 *       successor: (p) => [
 *         { symbol: 'F', parameters: [p[1]] },
 *         { symbol: '[', parameters: [] },
 *         { symbol: '+', parameters: [25] },
 *         { symbol: 'A', parameters: [p[0] * 0.7, p[1] * 0.7] },
 *         { symbol: ']', parameters: [] },
 *         { symbol: 'A', parameters: [p[0] * 0.7, p[1] * 0.7] }
 *       ]
 *     }
 *   ]
 * });
 * ```
 */
export class ParametricLSystem {
  private axiom: ParametricSymbol[];
  private rules: ParametricRule[];
  private maxIterations: number;
  private logger: Logger;

  /**
   * Creates a new parametric L-system.
   * @param config - The L-system configuration
   */
  constructor(config: ParametricLSystemConfig) {
    this.logger = new Logger('ParametricLSystem');
    this.axiom = config.axiom;
    this.rules = config.rules;
    this.maxIterations = config.maxIterations ?? 10;

    this.logger.info(`Parametric L-system created with ${this.rules.length} rules`);
  }

  /**
   * Generates the L-system after n iterations.
   * @param iterations - Number of iterations to perform
   * @returns The generated symbol sequence
   */
  public generate(iterations: number): ParametricSymbol[] {
    if (iterations < 0) {
      this.logger.warn('Negative iterations requested, returning axiom');
      return this.axiom;
    }

    if (iterations > this.maxIterations) {
      this.logger.warn(`Requested ${iterations} iterations exceeds max ${this.maxIterations}, clamping`);
      iterations = this.maxIterations;
    }

    let current = this.axiom;

    for (let i = 0; i < iterations; i++) {
      current = this.iterate(current);

      if (current.length > 100000) {
        this.logger.warn(`Symbol count exceeded 100k at iteration ${i + 1}, stopping`);
        break;
      }
    }

    this.logger.debug(`Generated ${current.length} symbols after ${iterations} iterations`);
    return current;
  }

  /**
   * Performs a single iteration of the L-system.
   * @param input - The input symbol sequence
   * @returns The result after one iteration
   */
  private iterate(input: ParametricSymbol[]): ParametricSymbol[] {
    const result: ParametricSymbol[] = [];

    for (let i = 0; i < input.length; i++) {
      const symbol = input[i]!;
      const rule = this.findMatchingRule(symbol);

      if (rule) {
        const successors = rule.successor(symbol.parameters);
        result.push(...successors);
      } else {
        result.push(symbol);
      }
    }

    return result;
  }

  /**
   * Finds the first matching rule for a parametric symbol.
   * @param symbol - The symbol to match
   * @returns The matching rule, or null if none found
   */
  private findMatchingRule(symbol: ParametricSymbol): ParametricRule | null {
    for (const rule of this.rules) {
      if (rule.predecessor !== symbol.symbol) {
        continue;
      }

      if (rule.condition && !rule.condition(symbol.parameters)) {
        continue;
      }

      return rule;
    }

    return null;
  }

  /**
   * Converts the parametric symbol sequence to a string representation.
   * @param symbols - The symbols to convert
   * @returns String representation
   */
  public toString(symbols: ParametricSymbol[]): string {
    return symbols.map(s => {
      if (s.parameters.length === 0) {
        return s.symbol;
      }
      return `${s.symbol}(${s.parameters.join(',')})`;
    }).join('');
  }

  /**
   * Parses a string into parametric symbols.
   * Supports format like "F(10)A(1,2)[+B(5)]"
   * @param str - The string to parse
   * @returns Array of parametric symbols
   */
  public static parseString(str: string): ParametricSymbol[] {
    const symbols: ParametricSymbol[] = [];
    let i = 0;

    while (i < str.length) {
      const symbol = str[i];
      i++;

      // Check for parameters
      if (i < str.length && str[i] === '(') {
        i++; // skip '('
        let paramStr = '';
        while (i < str.length && str[i] !== ')') {
          paramStr += str[i];
          i++;
        }
        i++; // skip ')'

        const parameters = paramStr.split(',').map(p => parseFloat(p.trim()));
        symbols.push({ symbol, parameters });
      } else {
        symbols.push({ symbol, parameters: [] });
      }
    }

    return symbols;
  }

  /**
   * Gets the axiom of this L-system.
   * @returns The axiom symbol sequence
   */
  public getAxiom(): ParametricSymbol[] {
    return [...this.axiom];
  }

  /**
   * Sets a new axiom for this L-system.
   * @param axiom - The new axiom symbol sequence
   */
  public setAxiom(axiom: ParametricSymbol[]): void {
    this.axiom = axiom;
    this.logger.debug(`Axiom changed`);
  }

  /**
   * Gets all production rules.
   * @returns Array of production rules
   */
  public getRules(): ParametricRule[] {
    return [...this.rules];
  }

  /**
   * Adds a production rule.
   * @param rule - The rule to add
   */
  public addRule(rule: ParametricRule): void {
    this.rules.push(rule);
    this.logger.debug(`Rule added for symbol '${rule.predecessor}'`);
  }

  /**
   * Clears all production rules.
   */
  public clearRules(): void {
    this.rules = [];
    this.logger.debug('All rules cleared');
  }

  /**
   * Gets the maximum number of iterations allowed.
   * @returns The maximum iterations
   */
  public getMaxIterations(): number {
    return this.maxIterations;
  }

  /**
   * Sets the maximum number of iterations allowed.
   * @param max - The new maximum
   */
  public setMaxIterations(max: number): void {
    this.maxIterations = Math.max(1, max);
    this.logger.debug(`Max iterations set to ${this.maxIterations}`);
  }
}
