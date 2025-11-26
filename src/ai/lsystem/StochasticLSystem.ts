import { Logger } from '../../core/Logger';

/**
 * Stochastic production rule with probability.
 */
export interface StochasticRule {
  /** The symbol to match */
  predecessor: string;
  /** The replacement string */
  successor: string;
  /** Probability of this rule being selected (0-1) */
  probability: number;
}

/**
 * Configuration for a stochastic L-system.
 */
export interface StochasticLSystemConfig {
  /** The initial axiom string */
  axiom: string;
  /** Production rules with probabilities */
  rules: StochasticRule[];
  /** Maximum number of iterations to prevent infinite expansion */
  maxIterations?: number;
  /** Random seed for reproducible generation */
  seed?: number;
}

/**
 * Stochastic L-system.
 *
 * A stochastic L-system allows multiple production rules for the same symbol,
 * each with an associated probability. When a symbol is encountered, one of
 * its rules is randomly selected based on the probability distribution.
 *
 * This creates variation and natural-looking results, ideal for modeling
 * plants, trees, and organic structures.
 *
 * @example
 * ```typescript
 * const tree = new StochasticLSystem({
 *   axiom: 'F',
 *   rules: [
 *     { predecessor: 'F', successor: 'F[+F]F[-F]F', probability: 0.5 },
 *     { predecessor: 'F', successor: 'F[+F]F', probability: 0.3 },
 *     { predecessor: 'F', successor: 'F[-F]F', probability: 0.2 }
 *   ]
 * });
 * const result = tree.generate(4);
 * ```
 */
export class StochasticLSystem {
  private axiom: string;
  private ruleMap: Map<string, StochasticRule[]>;
  private maxIterations: number;
  private random: () => number;
  private logger: Logger;

  /**
   * Creates a new stochastic L-system.
   * @param config - The L-system configuration
   */
  constructor(config: StochasticLSystemConfig) {
    this.logger = new Logger('StochasticLSystem');
    this.axiom = config.axiom;
    this.maxIterations = config.maxIterations ?? 10;
    this.ruleMap = new Map();

    // Initialize random number generator
    if (config.seed !== undefined) {
      this.random = this.seededRandom(config.seed);
      this.logger.debug(`Using seeded RNG with seed ${config.seed}`);
    } else {
      this.random = Math.random;
    }

    // Build rule map
    for (const rule of config.rules) {
      if (!this.ruleMap.has(rule.predecessor)) {
        this.ruleMap.set(rule.predecessor, []);
      }
      this.ruleMap.get(rule.predecessor)!.push(rule);
    }

    // Normalize probabilities for each symbol
    this.normalizeProbabilities();

    this.logger.info(`Stochastic L-system created with ${this.ruleMap.size} symbol(s)`);
  }

  /**
   * Creates a seeded pseudo-random number generator.
   * @param seed - The random seed
   * @returns A random function
   */
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      // Linear congruential generator
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Normalizes probabilities for all rule sets to sum to 1.
   */
  private normalizeProbabilities(): void {
    this.ruleMap.forEach((rules, symbol) => {
      const sum = rules.reduce((acc, rule) => acc + rule.probability, 0);

      if (sum === 0) {
        this.logger.warn(`Rules for symbol '${symbol}' have zero total probability, distributing evenly`);
        const evenProb = 1.0 / rules.length;
        rules.forEach(rule => rule.probability = evenProb);
      } else if (Math.abs(sum - 1.0) > 0.001) {
        this.logger.debug(`Normalizing probabilities for symbol '${symbol}' (sum was ${sum})`);
        rules.forEach(rule => rule.probability /= sum);
      }
    });
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
      const rules = this.ruleMap.get(symbol);

      if (rules && rules.length > 0) {
        const selectedRule = this.selectRule(rules);
        result += selectedRule.successor;
      } else {
        result += symbol;
      }
    }

    return result;
  }

  /**
   * Selects a rule based on probability distribution.
   * @param rules - Array of rules to choose from
   * @returns The selected rule
   */
  private selectRule(rules: StochasticRule[]): StochasticRule {
    const rand = this.random();
    let cumulative = 0;

    for (const rule of rules) {
      cumulative += rule.probability;
      if (rand <= cumulative) {
        return rule;
      }
    }

    // Fallback (shouldn't happen if probabilities are normalized)
    return rules[rules.length - 1];
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
  public getRules(): StochasticRule[] {
    const allRules: StochasticRule[] = [];
    this.ruleMap.forEach(rules => {
      allRules.push(...rules);
    });
    return allRules;
  }

  /**
   * Adds a production rule.
   * @param rule - The rule to add
   */
  public addRule(rule: StochasticRule): void {
    if (!this.ruleMap.has(rule.predecessor)) {
      this.ruleMap.set(rule.predecessor, []);
    }
    this.ruleMap.get(rule.predecessor)!.push(rule);
    this.normalizeProbabilities();
    this.logger.debug(`Rule added for symbol '${rule.predecessor}'`);
  }

  /**
   * Removes all rules for a specific symbol.
   * @param predecessor - The symbol to remove rules for
   * @returns True if rules were removed
   */
  public removeRules(predecessor: string): boolean {
    const removed = this.ruleMap.delete(predecessor);
    if (removed) {
      this.logger.debug(`All rules removed for symbol '${predecessor}'`);
    }
    return removed;
  }

  /**
   * Clears all production rules.
   */
  public clearRules(): void {
    this.ruleMap.clear();
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

  /**
   * Reseeds the random number generator.
   * @param seed - The new seed value
   */
  public reseed(seed: number): void {
    this.random = this.seededRandom(seed);
    this.logger.debug(`RNG reseeded with ${seed}`);
  }
}
