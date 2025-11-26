import { Logger } from '../../core/Logger';

/**
 * Behavior action types.
 */
export enum BehaviorActionType {
  SPAWN_ENTITY = 'spawn_entity',
  MOVE = 'move',
  ROTATE = 'rotate',
  SCALE = 'scale',
  EMIT_PARTICLE = 'emit_particle',
  PLAY_SOUND = 'play_sound',
  WAIT = 'wait',
  BRANCH = 'branch',
  MERGE = 'merge',
  CUSTOM = 'custom'
}

/**
 * Behavior action.
 */
export interface BehaviorAction {
  /** Type of action */
  type: BehaviorActionType;
  /** Action parameters */
  params: Record<string, any>;
  /** Timestamp when action should execute */
  timestamp: number;
}

/**
 * Behavior command mapping configuration.
 */
export interface BehaviorCommandMap {
  /** Symbol to match */
  symbol: string;
  /** Action type to generate */
  action: BehaviorActionType;
  /** Parameter mapping function */
  parameterMapper?: (params: number[]) => Record<string, any>;
  /** Duration of this action */
  duration?: number;
}

/**
 * Configuration for behavior interpreter.
 */
export interface BehaviorInterpreterConfig {
  /** Command mappings */
  commandMaps: BehaviorCommandMap[];
  /** Base time unit for actions */
  timeUnit?: number;
}

/**
 * Behavior Interpreter.
 *
 * Interprets L-system strings as sequences of behavior actions.
 * Each symbol can be mapped to game actions like spawning entities,
 * moving objects, playing sounds, etc.
 *
 * This allows L-systems to drive game behavior and procedural events.
 *
 * @example
 * ```typescript
 * const interpreter = new BehaviorInterpreter({
 *   commandMaps: [
 *     {
 *       symbol: 'F',
 *       action: BehaviorActionType.MOVE,
 *       parameterMapper: (p) => ({ distance: p[0] || 1 })
 *     },
 *     {
 *       symbol: 'S',
 *       action: BehaviorActionType.SPAWN_ENTITY,
 *       parameterMapper: (p) => ({ entityType: 'enemy', level: p[0] || 1 })
 *     }
 *   ]
 * });
 * const actions = interpreter.interpret('FFSFF');
 * ```
 */
export class BehaviorInterpreter {
  private commandMap: Map<string, BehaviorCommandMap>;
  private timeUnit: number;
  private logger: Logger;

  /**
   * Creates a new behavior interpreter.
   * @param config - Configuration options
   */
  constructor(config: BehaviorInterpreterConfig) {
    this.logger = new Logger('BehaviorInterpreter');
    this.timeUnit = config.timeUnit ?? 1.0;
    this.commandMap = new Map();

    for (const mapping of config.commandMaps) {
      this.commandMap.set(mapping.symbol, mapping);
    }

    this.logger.info(`Behavior interpreter initialized with ${this.commandMap.size} command mappings`);
  }

  /**
   * Interprets an L-system string and generates behavior actions.
   * @param lstring - The L-system string to interpret
   * @returns Array of behavior actions
   */
  public interpret(lstring: string): BehaviorAction[] {
    const actions: BehaviorAction[] = [];
    let currentTime = 0;
    const branchStack: number[] = [];

    for (let i = 0; i < lstring.length; i++) {
      const symbol = lstring[i];
      const mapping = this.commandMap.get(symbol);

      if (mapping) {
        // Extract parameters if they exist
        const params = this.extractParameters(lstring, i);
        const actionParams = mapping.parameterMapper
          ? mapping.parameterMapper(params.values)
          : {};

        actions.push({
          type: mapping.action,
          params: actionParams,
          timestamp: currentTime
        });

        // Advance time
        const duration = mapping.duration ?? this.timeUnit;
        currentTime += duration;

        // Skip parameter section if present
        i = params.endIndex;
      } else if (symbol === '[') {
        // Branch: push current time
        branchStack.push(currentTime);
      } else if (symbol === ']') {
        // Merge: pop and restore time
        if (branchStack.length > 0) {
          currentTime = branchStack.pop()!;
        } else {
          this.logger.warn('Branch stack underflow: ] without matching [');
        }
      }
    }

    this.logger.debug(`Generated ${actions.length} behavior actions`);
    return actions;
  }

  /**
   * Extracts numeric parameters following a symbol.
   * Supports format like "F(10,20,30)"
   * @param lstring - The L-system string
   * @param startIndex - Index of the symbol
   * @returns Extracted parameters and end index
   */
  private extractParameters(lstring: string, startIndex: number): {
    values: number[];
    endIndex: number;
  } {
    const values: number[] = [];
    let endIndex = startIndex;

    if (startIndex + 1 < lstring.length && lstring[startIndex + 1] === '(') {
      endIndex = startIndex + 2;
      let paramStr = '';

      while (endIndex < lstring.length && lstring[endIndex] !== ')') {
        paramStr += lstring[endIndex];
        endIndex++;
      }

      if (paramStr.length > 0) {
        const parts = paramStr.split(',');
        for (const part of parts) {
          const num = parseFloat(part.trim());
          if (!isNaN(num)) {
            values.push(num);
          }
        }
      }
    }

    return { values, endIndex };
  }

  /**
   * Groups actions by type.
   * @param actions - Array of actions
   * @returns Map of action type to actions
   */
  public groupByType(actions: BehaviorAction[]): Map<BehaviorActionType, BehaviorAction[]> {
    const grouped = new Map<BehaviorActionType, BehaviorAction[]>();

    for (const action of actions) {
      if (!grouped.has(action.type)) {
        grouped.set(action.type, []);
      }
      grouped.get(action.type)!.push(action);
    }

    return grouped;
  }

  /**
   * Sorts actions by timestamp.
   * @param actions - Array of actions
   * @returns Sorted array
   */
  public sortByTime(actions: BehaviorAction[]): BehaviorAction[] {
    return [...actions].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Filters actions by time range.
   * @param actions - Array of actions
   * @param startTime - Start time (inclusive)
   * @param endTime - End time (exclusive)
   * @returns Filtered actions
   */
  public filterByTimeRange(
    actions: BehaviorAction[],
    startTime: number,
    endTime: number
  ): BehaviorAction[] {
    return actions.filter(a => a.timestamp >= startTime && a.timestamp < endTime);
  }

  /**
   * Adds a command mapping.
   * @param mapping - The command mapping to add
   */
  public addCommandMapping(mapping: BehaviorCommandMap): void {
    this.commandMap.set(mapping.symbol, mapping);
    this.logger.debug(`Command mapping added for symbol '${mapping.symbol}'`);
  }

  /**
   * Removes a command mapping.
   * @param symbol - The symbol to remove
   * @returns True if removed
   */
  public removeCommandMapping(symbol: string): boolean {
    const removed = this.commandMap.delete(symbol);
    if (removed) {
      this.logger.debug(`Command mapping removed for symbol '${symbol}'`);
    }
    return removed;
  }

  /**
   * Gets the time unit.
   * @returns Time unit value
   */
  public getTimeUnit(): number {
    return this.timeUnit;
  }

  /**
   * Sets the time unit.
   * @param timeUnit - New time unit
   */
  public setTimeUnit(timeUnit: number): void {
    this.timeUnit = Math.max(0, timeUnit);
  }
}
