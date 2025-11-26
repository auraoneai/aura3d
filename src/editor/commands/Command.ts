/**
 * @fileoverview Base command interface for the undo/redo system.
 * @module editor/commands/Command
 */

/**
 * Command interface for undo/redo system.
 * All editor commands must implement this interface.
 *
 * @example
 * ```typescript
 * class MyCommand implements ICommand {
 *   public description = 'My command';
 *   private oldValue: any;
 *   private newValue: any;
 *
 *   execute() {
 *     // Apply changes
 *   }
 *
 *   undo() {
 *     // Revert changes
 *   }
 *
 *   canMerge(other: ICommand): boolean {
 *     return other instanceof MyCommand;
 *   }
 *
 *   merge(other: ICommand) {
 *     // Merge with other command
 *   }
 * }
 * ```
 */
export interface ICommand {
  /**
   * Human-readable description of the command
   * Used for displaying in undo/redo UI
   */
  description: string;

  /**
   * Executes the command, applying its changes
   */
  execute(): void;

  /**
   * Undoes the command, reverting its changes
   */
  undo(): void;

  /**
   * Checks if this command can be merged with another command.
   * Used for continuous operations like dragging.
   *
   * @param other - Command to check for merge compatibility
   * @returns True if commands can be merged
   */
  canMerge(other: ICommand): boolean;

  /**
   * Merges another command into this one.
   * Only called if canMerge returns true.
   *
   * @param other - Command to merge
   */
  merge(other: ICommand): void;

  /**
   * Validates the command before execution.
   * Optional method for pre-execution validation.
   *
   * @returns True if command is valid and can be executed
   */
  validate?(): boolean;

  /**
   * Gets the approximate memory size of the command.
   * Used for history memory management.
   * Return value in arbitrary units (e.g., number of objects stored).
   *
   * @returns Size estimate
   */
  getSize?(): number;

  /**
   * Serializes the command to JSON.
   * Optional method for command persistence.
   *
   * @returns Serialized command data
   */
  serialize?(): any;

  /**
   * Deserializes the command from JSON.
   * Optional method for command persistence.
   *
   * @param data - Serialized command data
   */
  deserialize?(data: any): void;
}

/**
 * Abstract base class for commands providing common functionality
 */
export abstract class BaseCommand implements ICommand {
  public abstract description: string;

  /**
   * Executes the command
   */
  public abstract execute(): void;

  /**
   * Undoes the command
   */
  public abstract undo(): void;

  /**
   * Default implementation - commands cannot be merged
   */
  public canMerge(other: ICommand): boolean {
    return false;
  }

  /**
   * Default implementation - no merge support
   */
  public merge(other: ICommand): void {
    throw new Error('Command does not support merging');
  }

  /**
   * Default validation - always valid
   */
  public validate(): boolean {
    return true;
  }

  /**
   * Default size - 1 unit
   */
  public getSize(): number {
    return 1;
  }
}
