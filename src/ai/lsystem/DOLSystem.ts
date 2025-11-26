import { Logger } from '../../core/Logger';

/**
 * Production rule for a deterministic context-free L-system.
 * Maps a single symbol to a replacement string.
 */
export interface DOLProductionRule {
  /** The symbol to match */
  predecessor: string;
  /** The replacement string */
  successor: string;
}

/**
 * Configuration for a D0L-system.
 */
export interface DOLSystemConfig {
  /** The initial axiom string */
  axiom: string;
  /** Production rules */
  rules: DOLProductionRule[];
  /** Maximum number of iterations to prevent infinite expansion */
  maxIterations?: number;
}

/**
 * Deterministic context-free L-system (D0L).
 *
 * A D0L-system is the simplest form of L-system where:
 * - Each symbol has at most one production rule (deterministic)
 * - Rules are applied without considering neighboring symbols (context-free)
 * - All symbols are replaced simultaneously in each iteration
 *
 * @example
 * ```typescript
 * const koch = new DOLSystem({
 *   axiom: 'F',
 *   rules: [
 *     { predecessor: 'F', successor: 'F+F-F-F+F' }
 *   ]
 * });
 * const result = koch.generate(3);
 * ```
 */
export class DOLSystem {
  private axiom: string;
  private rules: Map<string, string>;
  private maxIterations: number;
  private logger: Logger;

  /**
   * Creates a new D0L-system.
   * @param config - The L-system configuration
   */
  constructor(config: DOLSystemConfig) {
    this.logger = new Logger('DOLSystem');
    this.axiom = config.axiom;
    this.rules = new Map();
    this.maxIterations = config.maxIterations ?? 10;

    // Build rule map
    for (const rule of config.rules) {
      if (this.rules.has(rule.predecessor)) {
        this.logger.warn(`Duplicate rule for symbol '${rule.predecessor}', using last definition`);
      }
      this.rules.set(rule.predecessor, rule.successor);
    }

    this.logger.info(`D0L-system created with axiom '${this.axiom}' and ${this.rules.size} rules`);
  }

  /**
   * Generates the L-system string after n iterations.
   * @param iterations - Number of iterations to perform
   * @returns The generated string
   */
  public generate(iterations: number): string {
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

      if (current.length > 1000000) {
        this.logger.warn(`String length exceeded 1M characters at iteration ${i + 1}, stopping`);
        break;
      }
    }

    this.logger.debug(`Generated string of length ${current.length} after ${iterations} iterations`);
    return current;
  }

  /**
   * Performs a single iteration of the L-system.
   * @param input - The input string
   * @returns The result after one iteration
   */
  private iterate(input: string): string {
    let result = '';

    for (let i = 0; i < input.length; i++) {
      const symbol = input[i];
      const replacement = this.rules.get(symbol);

      if (replacement !== undefined) {
        result += replacement;
      } else {
        // If no rule exists, the symbol remains unchanged
        result += symbol;
      }
    }

    return result;
  }

  /**
   * Gets the axiom of this L-system.
   * @returns The axiom string
   */
  public getAxiom(): string {
    return this.axiom;
  }

  /**
   * Sets a new axiom for this L-system.
   * @param axiom - The new axiom string
   */
  public setAxiom(axiom: string): void {
    this.axiom = axiom;
    this.logger.debug(`Axiom changed to '${axiom}'`);
  }

  /**
   * Gets all production rules.
   * @returns Array of production rules
   */
  public getRules(): DOLProductionRule[] {
    const rules: DOLProductionRule[] = [];
    this.rules.forEach((successor, predecessor) => {
      rules.push({ predecessor, successor });
    });
    return rules;
  }

  /**
   * Adds or updates a production rule.
   * @param predecessor - The symbol to match
   * @param successor - The replacement string
   */
  public setRule(predecessor: string, successor: string): void {
    this.rules.set(predecessor, successor);
    this.logger.debug(`Rule set: ${predecessor} -> ${successor}`);
  }

  /**
   * Removes a production rule.
   * @param predecessor - The symbol to remove
   * @returns True if the rule was removed, false if it didn't exist
   */
  public removeRule(predecessor: string): boolean {
    const removed = this.rules.delete(predecessor);
    if (removed) {
      this.logger.debug(`Rule removed for symbol '${predecessor}'`);
    }
    return removed;
  }

  /**
   * Clears all production rules.
   */
  public clearRules(): void {
    this.rules.clear();
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
