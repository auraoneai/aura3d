import { Logger } from '../../core/Logger';
import { DOLSystemConfig, DOLProductionRule } from './DOLSystem';
import { ContextSensitiveRule, ContextSensitiveLSystemConfig } from './ContextSensitiveLSystem';
import { StochasticRule, StochasticLSystemConfig } from './StochasticLSystem';

/**
 * JSON representation of a simple L-system.
 */
export interface LSystemJSON {
  /** System type */
  type: 'dol' | 'context-sensitive' | 'stochastic';
  /** Axiom string */
  axiom: string;
  /** Production rules */
  rules: any[];
  /** Additional parameters */
  params?: Record<string, any>;
}

/**
 * Grammar Parser for L-systems.
 *
 * Parses L-system grammars from various formats:
 * - JSON objects
 * - String format (simple rule syntax)
 * - Custom grammar files
 *
 * Supports multiple L-system types (D0L, context-sensitive, stochastic).
 *
 * @example
 * ```typescript
 * // Parse from JSON
 * const config = LSystemParser.parseJSON({
 *   type: 'dol',
 *   axiom: 'F',
 *   rules: [
 *     { predecessor: 'F', successor: 'F+F-F-F+F' }
 *   ]
 * });
 *
 * // Parse from string
 * const config2 = LSystemParser.parseString(`
 *   axiom: F
 *   F -> F+F-F-F+F
 * `);
 * ```
 */
export class LSystemParser {
  private static logger = new Logger('LSystemParser');

  /**
   * Parses an L-system from a JSON object.
   * @param json - JSON representation
   * @returns L-system configuration
   */
  public static parseJSON(json: LSystemJSON): DOLSystemConfig | ContextSensitiveLSystemConfig | StochasticLSystemConfig {
    this.logger.debug(`Parsing ${json.type} L-system from JSON`);

    switch (json.type) {
      case 'dol':
        return this.parseDOLJSON(json);
      case 'context-sensitive':
        return this.parseContextSensitiveJSON(json);
      case 'stochastic':
        return this.parseStochasticJSON(json);
      default:
        throw new Error(`Unknown L-system type: ${(json as any).type}`);
    }
  }

  /**
   * Parses a D0L-system from JSON.
   * @param json - JSON data
   * @returns D0L configuration
   */
  private static parseDOLJSON(json: LSystemJSON): DOLSystemConfig {
    const rules: DOLProductionRule[] = json.rules.map(r => ({
      predecessor: r.predecessor || r.p,
      successor: r.successor || r.s
    }));

    return {
      axiom: json.axiom,
      rules,
      maxIterations: json.params?.maxIterations
    };
  }

  /**
   * Parses a context-sensitive L-system from JSON.
   * @param json - JSON data
   * @returns Context-sensitive configuration
   */
  private static parseContextSensitiveJSON(json: LSystemJSON): ContextSensitiveLSystemConfig {
    const rules: ContextSensitiveRule[] = json.rules.map(r => ({
      predecessor: r.predecessor || r.p,
      successor: r.successor || r.s,
      leftContext: r.leftContext || r.lc,
      rightContext: r.rightContext || r.rc,
      priority: r.priority
    }));

    return {
      axiom: json.axiom,
      rules,
      maxIterations: json.params?.maxIterations,
      ignoreSymbols: json.params?.ignoreSymbols
    };
  }

  /**
   * Parses a stochastic L-system from JSON.
   * @param json - JSON data
   * @returns Stochastic configuration
   */
  private static parseStochasticJSON(json: LSystemJSON): StochasticLSystemConfig {
    const rules: StochasticRule[] = json.rules.map(r => ({
      predecessor: r.predecessor || r.p,
      successor: r.successor || r.s,
      probability: r.probability || r.prob || 1.0
    }));

    return {
      axiom: json.axiom,
      rules,
      maxIterations: json.params?.maxIterations,
      seed: json.params?.seed
    };
  }

  /**
   * Parses an L-system from a string format.
   *
   * String format:
   * ```
   * axiom: F
   * F -> F+F-F-F+F
   * X -> FF
   * ```
   *
   * @param str - String representation
   * @returns L-system configuration
   */
  public static parseString(str: string): DOLSystemConfig {
    this.logger.debug('Parsing L-system from string');

    const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let axiom = '';
    const rules: DOLProductionRule[] = [];

    for (const line of lines) {
      // Skip comments
      if (line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      // Parse axiom
      if (line.toLowerCase().startsWith('axiom:')) {
        axiom = line.substring(6).trim();
        continue;
      }

      // Parse rule
      if (line.includes('->')) {
        const [predecessor, successor] = line.split('->').map(s => s.trim());
        rules.push({ predecessor, successor });
      } else if (line.includes(':')) {
        const [predecessor, successor] = line.split(':').map(s => s.trim());
        rules.push({ predecessor, successor });
      }
    }

    if (!axiom) {
      throw new Error('No axiom specified in grammar string');
    }

    return { axiom, rules };
  }

  /**
   * Parses a context-sensitive L-system from string format.
   *
   * Format:
   * ```
   * axiom: baaaa
   * b < a -> b
   * a < a -> a
   * ```
   *
   * @param str - String representation
   * @returns Context-sensitive configuration
   */
  public static parseContextSensitiveString(str: string): ContextSensitiveLSystemConfig {
    this.logger.debug('Parsing context-sensitive L-system from string');

    const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let axiom = '';
    const rules: ContextSensitiveRule[] = [];

    for (const line of lines) {
      if (line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      if (line.toLowerCase().startsWith('axiom:')) {
        axiom = line.substring(6).trim();
        continue;
      }

      if (line.includes('->')) {
        const [contextPart, successor] = line.split('->').map(s => s.trim());
        const rule = this.parseContextRule(contextPart, successor);
        rules.push(rule);
      }
    }

    if (!axiom) {
      throw new Error('No axiom specified in grammar string');
    }

    return { axiom, rules };
  }

  /**
   * Parses a context rule from a string like "A < B > C".
   * @param contextPart - The context and predecessor part
   * @param successor - The successor string
   * @returns Context-sensitive rule
   */
  private static parseContextRule(contextPart: string, successor: string): ContextSensitiveRule {
    let leftContext: string | undefined;
    let predecessor: string;
    let rightContext: string | undefined;

    // Check for left context
    if (contextPart.includes('<')) {
      const parts = contextPart.split('<').map(s => s.trim());
      leftContext = parts[0];
      contextPart = parts[1]!;
    }

    // Check for right context
    if (contextPart.includes('>')) {
      const parts = contextPart.split('>').map(s => s.trim());
      predecessor = parts[0]!;
      rightContext = parts[1];
    } else {
      predecessor = contextPart.trim();
    }

    return {
      predecessor,
      successor,
      leftContext,
      rightContext
    };
  }

  /**
   * Parses a stochastic L-system from string format.
   *
   * Format:
   * ```
   * axiom: F
   * F -> F[+F]F (0.5)
   * F -> F[-F]F (0.5)
   * ```
   *
   * @param str - String representation
   * @returns Stochastic configuration
   */
  public static parseStochasticString(str: string): StochasticLSystemConfig {
    this.logger.debug('Parsing stochastic L-system from string');

    const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let axiom = '';
    const rules: StochasticRule[] = [];

    for (const line of lines) {
      if (line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      if (line.toLowerCase().startsWith('axiom:')) {
        axiom = line.substring(6).trim();
        continue;
      }

      if (line.includes('->')) {
        const [predecessor, rest] = line.split('->').map(s => s.trim());

        // Extract probability if present
        let successor = rest;
        let probability = 1.0;

        const probMatch = rest.match(/\(([0-9.]+)\)\s*$/);
        if (probMatch) {
          probability = parseFloat(probMatch[1]);
          successor = rest.substring(0, probMatch.index).trim();
        }

        rules.push({ predecessor, successor, probability });
      }
    }

    if (!axiom) {
      throw new Error('No axiom specified in grammar string');
    }

    return { axiom, rules };
  }

  /**
   * Converts an L-system configuration to JSON.
   * @param config - L-system configuration
   * @param type - System type
   * @returns JSON representation
   */
  public static toJSON(
    config: DOLSystemConfig | ContextSensitiveLSystemConfig | StochasticLSystemConfig,
    type: 'dol' | 'context-sensitive' | 'stochastic'
  ): LSystemJSON {
    return {
      type,
      axiom: config.axiom,
      rules: config.rules,
      params: {
        maxIterations: config.maxIterations
      }
    };
  }

  /**
   * Converts a D0L-system configuration to string format.
   * @param config - D0L configuration
   * @returns String representation
   */
  public static toString(config: DOLSystemConfig): string {
    let result = `axiom: ${config.axiom}\n`;

    for (const rule of config.rules) {
      result += `${rule.predecessor} -> ${rule.successor}\n`;
    }

    return result;
  }

  /**
   * Validates an L-system configuration.
   * @param config - Configuration to validate
   * @returns True if valid, throws error otherwise
   */
  public static validate(config: DOLSystemConfig): boolean {
    if (!config.axiom || config.axiom.length === 0) {
      throw new Error('Axiom cannot be empty');
    }

    if (!config.rules || config.rules.length === 0) {
      throw new Error('At least one production rule required');
    }

    for (const rule of config.rules) {
      if (!rule.predecessor || rule.predecessor.length === 0) {
        throw new Error('Rule predecessor cannot be empty');
      }
      if (rule.successor === undefined || rule.successor === null) {
        throw new Error('Rule successor cannot be null/undefined');
      }
    }

    this.logger.debug('L-system configuration validated');
    return true;
  }
}
