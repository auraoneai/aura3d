import { Logger } from '../../core/Logger';

/**
 * Production rule for a context-sensitive L-system.
 * Supports left and right context matching.
 */
export interface ContextSensitiveRule {
  /** Left context (symbols that must appear before) */
  leftContext?: string;
  /** The symbol to match */
  predecessor: string;
  /** Right context (symbols that must appear after) */
  rightContext?: string;
  /** The replacement string */
  successor: string;
  /** Priority for rule selection (higher = more specific) */
  priority?: number;
}

/**
 * Configuration for a context-sensitive L-system.
 */
export interface ContextSensitiveLSystemConfig {
  /** The initial axiom string */
  axiom: string;
  /** Production rules with context */
  rules: ContextSensitiveRule[];
  /** Maximum number of iterations to prevent infinite expansion */
  maxIterations?: number;
  /** Ignore symbols (brackets, etc.) when matching context */
  ignoreSymbols?: string[];
}

/**
 * Context-sensitive L-system.
 *
 * A context-sensitive L-system allows production rules to depend on
 * neighboring symbols. Rules can specify left context (symbols before)
 * and right context (symbols after) that must match for the rule to apply.
 *
 * Rules with more specific context (both left and right) take priority
 * over rules with less context, which take priority over context-free rules.
 *
 * @example
 * ```typescript
 * const system = new ContextSensitiveLSystem({
 *   axiom: 'baaaaaaa',
 *   rules: [
 *     { leftContext: 'b', predecessor: 'a', successor: 'b' },
 *     { leftContext: 'a', predecessor: 'a', successor: 'a' }
 *   ]
 * });
 * const result = system.generate(3);
 * ```
 */
export class ContextSensitiveLSystem {
  private axiom: string;
  private rules: ContextSensitiveRule[];
  private maxIterations: number;
  private ignoreSymbols: Set<string>;
  private logger: Logger;

  /**
   * Creates a new context-sensitive L-system.
   * @param config - The L-system configuration
   */
  constructor(config: ContextSensitiveLSystemConfig) {
    this.logger = new Logger('ContextSensitiveLSystem');
    this.axiom = config.axiom;
    this.maxIterations = config.maxIterations ?? 10;
    this.ignoreSymbols = new Set(config.ignoreSymbols ?? ['[', ']', '(', ')']);

    // Sort rules by priority (higher first)
    this.rules = [...config.rules].sort((a, b) => {
      const priorityA = this.calculatePriority(a);
      const priorityB = this.calculatePriority(b);
      return priorityB - priorityA;
    });

    this.logger.info(`Context-sensitive L-system created with ${this.rules.length} rules`);
  }

  /**
   * Calculates the priority of a rule based on context specificity.
   * @param rule - The rule to evaluate
   * @returns Priority value (higher = more specific)
   */
  private calculatePriority(rule: ContextSensitiveRule): number {
    if (rule.priority !== undefined) {
      return rule.priority;
    }

    let priority = 0;
    if (rule.leftContext) priority += rule.leftContext.length * 10;
    if (rule.rightContext) priority += rule.rightContext.length * 10;
    return priority;
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
    const replacements: string[] = [];

    for (let i = 0; i < input.length; i++) {
      const symbol = input[i];
      const rule = this.findMatchingRule(input, i);

      if (rule) {
        replacements.push(rule.successor);
      } else {
        replacements.push(symbol);
      }
    }

    return replacements.join('');
  }

  /**
   * Finds the first matching rule for a symbol at a given position.
   * @param input - The input string
   * @param position - The position of the symbol
   * @returns The matching rule, or null if none found
   */
  private findMatchingRule(input: string, position: number): ContextSensitiveRule | null {
    const symbol = input[position];

    for (const rule of this.rules) {
      if (rule.predecessor !== symbol) {
        continue;
      }

      if (this.matchesContext(input, position, rule)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Checks if a rule's context matches at a given position.
   * @param input - The input string
   * @param position - The position to check
   * @param rule - The rule to match
   * @returns True if context matches
   */
  private matchesContext(input: string, position: number, rule: ContextSensitiveRule): boolean {
    // Check left context
    if (rule.leftContext) {
      const leftStr = this.getLeftContext(input, position, rule.leftContext.length);
      if (leftStr !== rule.leftContext) {
        return false;
      }
    }

    // Check right context
    if (rule.rightContext) {
      const rightStr = this.getRightContext(input, position, rule.rightContext.length);
      if (rightStr !== rule.rightContext) {
        return false;
      }
    }

    return true;
  }

  /**
   * Gets the left context of a symbol, skipping ignored symbols.
   * @param input - The input string
   * @param position - The current position
   * @param length - Number of context symbols to retrieve
   * @returns The left context string
   */
  private getLeftContext(input: string, position: number, length: number): string {
    let context = '';
    let pos = position - 1;

    while (context.length < length && pos >= 0) {
      const symbol = input[pos];
      if (!this.ignoreSymbols.has(symbol)) {
        context = symbol + context;
      }
      pos--;
    }

    return context;
  }

  /**
   * Gets the right context of a symbol, skipping ignored symbols.
   * @param input - The input string
   * @param position - The current position
   * @param length - Number of context symbols to retrieve
   * @returns The right context string
   */
  private getRightContext(input: string, position: number, length: number): string {
    let context = '';
    let pos = position + 1;

    while (context.length < length && pos < input.length) {
      const symbol = input[pos];
      if (!this.ignoreSymbols.has(symbol)) {
        context += symbol;
      }
      pos++;
    }

    return context;
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
  public getRules(): ContextSensitiveRule[] {
    return [...this.rules];
  }

  /**
   * Adds a production rule.
   * @param rule - The rule to add
   */
  public addRule(rule: ContextSensitiveRule): void {
    this.rules.push(rule);
    // Re-sort rules by priority
    this.rules.sort((a, b) => {
      const priorityA = this.calculatePriority(a);
      const priorityB = this.calculatePriority(b);
      return priorityB - priorityA;
    });
    this.logger.debug('Rule added and rules re-sorted');
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
