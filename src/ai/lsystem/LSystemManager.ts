import { Logger } from '../../core/Logger';
import { DOLSystem, DOLSystemConfig } from './DOLSystem';
import { ContextSensitiveLSystem, ContextSensitiveLSystemConfig } from './ContextSensitiveLSystem';
import { StochasticLSystem, StochasticLSystemConfig } from './StochasticLSystem';
import { ParametricLSystem, ParametricLSystemConfig } from './ParametricLSystem';
import { LSystemParser } from './LSystemParser';
import { GrammarLibrary } from './GrammarLibrary';

/**
 * L-system type discriminator.
 */
export type LSystemType = 'dol' | 'context-sensitive' | 'stochastic' | 'parametric';

/**
 * Union type for all L-system instances.
 */
export type LSystemInstance =
  | DOLSystem
  | ContextSensitiveLSystem
  | StochasticLSystem
  | ParametricLSystem;

/**
 * Registered L-system entry.
 */
export interface RegisteredLSystem {
  /** Unique name/ID */
  name: string;
  /** System type */
  type: LSystemType;
  /** The L-system instance */
  system: LSystemInstance;
  /** Creation timestamp */
  createdAt: number;
  /** Last accessed timestamp */
  lastAccessed: number;
}

/**
 * L-System Manager.
 *
 * Central manager for creating, storing, and retrieving L-systems.
 * Provides a registry for named L-systems and integrates with
 * the grammar library and parser.
 *
 * @example
 * ```typescript
 * const manager = LSystemManager.getInstance();
 *
 * // Create from library
 * manager.createFromLibrary('myTree', 'tree', 'simple');
 *
 * // Create from config
 * manager.createDOL('custom', {
 *   axiom: 'F',
 *   rules: [{ predecessor: 'F', successor: 'FF+F' }]
 * });
 *
 * // Generate
 * const result = manager.generate('myTree', 4);
 * ```
 */
export class LSystemManager {
  private static instance: LSystemManager | null = null;
  private registry: Map<string, RegisteredLSystem>;
  private logger: Logger;

  /**
   * Private constructor for singleton pattern.
   */
  private constructor() {
    this.logger = new Logger('LSystemManager');
    this.registry = new Map();
    this.logger.info('L-System manager initialized');
  }

  /**
   * Gets the singleton instance.
   * @returns The manager instance
   */
  public static getInstance(): LSystemManager {
    if (!LSystemManager.instance) {
      LSystemManager.instance = new LSystemManager();
    }
    return LSystemManager.instance;
  }

  /**
   * Creates and registers a D0L-system.
   * @param name - Unique name for this system
   * @param config - D0L configuration
   * @returns The created system
   */
  public createDOL(name: string, config: DOLSystemConfig): DOLSystem {
    if (this.registry.has(name)) {
      this.logger.warn(`Overwriting existing L-system: ${name}`);
    }

    const system = new DOLSystem(config);
    this.register(name, 'dol', system);
    return system;
  }

  /**
   * Creates and registers a context-sensitive L-system.
   * @param name - Unique name for this system
   * @param config - Context-sensitive configuration
   * @returns The created system
   */
  public createContextSensitive(
    name: string,
    config: ContextSensitiveLSystemConfig
  ): ContextSensitiveLSystem {
    if (this.registry.has(name)) {
      this.logger.warn(`Overwriting existing L-system: ${name}`);
    }

    const system = new ContextSensitiveLSystem(config);
    this.register(name, 'context-sensitive', system);
    return system;
  }

  /**
   * Creates and registers a stochastic L-system.
   * @param name - Unique name for this system
   * @param config - Stochastic configuration
   * @returns The created system
   */
  public createStochastic(
    name: string,
    config: StochasticLSystemConfig
  ): StochasticLSystem {
    if (this.registry.has(name)) {
      this.logger.warn(`Overwriting existing L-system: ${name}`);
    }

    const system = new StochasticLSystem(config);
    this.register(name, 'stochastic', system);
    return system;
  }

  /**
   * Creates and registers a parametric L-system.
   * @param name - Unique name for this system
   * @param config - Parametric configuration
   * @returns The created system
   */
  public createParametric(
    name: string,
    config: ParametricLSystemConfig
  ): ParametricLSystem {
    if (this.registry.has(name)) {
      this.logger.warn(`Overwriting existing L-system: ${name}`);
    }

    const system = new ParametricLSystem(config);
    this.register(name, 'parametric', system);
    return system;
  }

  /**
   * Creates an L-system from the grammar library.
   * @param name - Unique name for this system
   * @param category - Category ('tree', 'fractal', 'plant')
   * @param grammarName - Grammar name within category
   * @returns The created system, or null if not found
   */
  public createFromLibrary(
    name: string,
    category: 'tree' | 'fractal' | 'plant',
    grammarName: string
  ): DOLSystem | null {
    let config: DOLSystemConfig | null = null;

    switch (category) {
      case 'tree':
        config = GrammarLibrary.getTree(grammarName);
        break;
      case 'fractal':
        config = GrammarLibrary.getFractal(grammarName);
        break;
      case 'plant':
        config = GrammarLibrary.getPlant(grammarName);
        break;
    }

    if (!config) {
      this.logger.error(`Grammar not found: ${category}/${grammarName}`);
      return null;
    }

    return this.createDOL(name, config);
  }

  /**
   * Creates an L-system from a JSON object.
   * @param name - Unique name for this system
   * @param json - JSON representation
   * @returns The created system
   */
  public createFromJSON(name: string, json: any): LSystemInstance {
    const config = LSystemParser.parseJSON(json);

    switch (json.type) {
      case 'dol':
        return this.createDOL(name, config as DOLSystemConfig);
      case 'context-sensitive':
        return this.createContextSensitive(name, config as ContextSensitiveLSystemConfig);
      case 'stochastic':
        return this.createStochastic(name, config as StochasticLSystemConfig);
      default:
        throw new Error(`Unsupported L-system type: ${json.type}`);
    }
  }

  /**
   * Creates an L-system from a string definition.
   * @param name - Unique name for this system
   * @param str - String representation
   * @returns The created system
   */
  public createFromString(name: string, str: string): DOLSystem {
    const config = LSystemParser.parseString(str);
    return this.createDOL(name, config);
  }

  /**
   * Registers an L-system instance.
   * @param name - Unique name
   * @param type - System type
   * @param system - The system instance
   */
  private register(name: string, type: LSystemType, system: LSystemInstance): void {
    const now = Date.now();
    this.registry.set(name, {
      name,
      type,
      system,
      createdAt: now,
      lastAccessed: now
    });
    this.logger.debug(`Registered L-system: ${name} (${type})`);
  }

  /**
   * Gets a registered L-system by name.
   * @param name - The system name
   * @returns The system instance, or null if not found
   */
  public get(name: string): LSystemInstance | null {
    const entry = this.registry.get(name);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.system;
    }
    this.logger.warn(`L-system not found: ${name}`);
    return null;
  }

  /**
   * Checks if an L-system is registered.
   * @param name - The system name
   * @returns True if registered
   */
  public has(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Removes an L-system from the registry.
   * @param name - The system name
   * @returns True if removed
   */
  public remove(name: string): boolean {
    const removed = this.registry.delete(name);
    if (removed) {
      this.logger.debug(`Removed L-system: ${name}`);
    }
    return removed;
  }

  /**
   * Clears all registered L-systems.
   */
  public clear(): void {
    this.registry.clear();
    this.logger.info('All L-systems cleared');
  }

  /**
   * Gets all registered L-system names.
   * @returns Array of names
   */
  public getNames(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Gets all registered L-systems.
   * @returns Array of registry entries
   */
  public getAll(): RegisteredLSystem[] {
    return Array.from(this.registry.values());
  }

  /**
   * Gets L-systems by type.
   * @param type - System type
   * @returns Array of matching systems
   */
  public getByType(type: LSystemType): RegisteredLSystem[] {
    return this.getAll().filter(entry => entry.type === type);
  }

  /**
   * Generates output from a registered L-system.
   * @param name - The system name
   * @param iterations - Number of iterations
   * @returns Generated string or symbol sequence
   */
  public generate(name: string, iterations: number): string | any[] {
    const system = this.get(name);
    if (!system) {
      throw new Error(`L-system not found: ${name}`);
    }

    if (system instanceof ParametricLSystem) {
      return system.generate(iterations);
    } else {
      return (system as any).generate(iterations);
    }
  }

  /**
   * Gets statistics about the registry.
   * @returns Statistics object
   */
  public getStats(): {
    total: number;
    byType: Record<string, number>;
    oldestAccess: number;
    newestAccess: number;
  } {
    const all = this.getAll();
    const byType: Record<string, number> = {};
    let oldestAccess = Infinity;
    let newestAccess = 0;

    for (const entry of all) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      oldestAccess = Math.min(oldestAccess, entry.lastAccessed);
      newestAccess = Math.max(newestAccess, entry.lastAccessed);
    }

    return {
      total: all.length,
      byType,
      oldestAccess: oldestAccess === Infinity ? 0 : oldestAccess,
      newestAccess
    };
  }
}
