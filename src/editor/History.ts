/**
 * @fileoverview Undo/redo system with command pattern, history stacking,
 * memory limits, grouping, and serialization support.
 * @module editor/History
 */

import { ICommand } from './commands/Command';

/**
 * History change event
 */
export interface HistoryChangeEvent {
  /** Event type */
  type: 'execute' | 'undo' | 'redo' | 'clear';
  /** Command involved (if applicable) */
  command?: ICommand;
  /** Current history size */
  size: number;
  /** Can undo */
  canUndo: boolean;
  /** Can redo */
  canRedo: boolean;
}

/**
 * Command batch for grouping multiple commands
 */
class CommandBatch implements ICommand {
  public description: string;
  private commands: ICommand[] = [];

  constructor(description: string) {
    this.description = description;
  }

  public addCommand(command: ICommand): void {
    this.commands.push(command);
  }

  public execute(): void {
    this.commands.forEach(cmd => cmd.execute());
  }

  public undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  public canMerge(other: ICommand): boolean {
    return false; // Batches cannot be merged
  }

  public merge(other: ICommand): void {
    // Not supported
  }

  public getSize(): number {
    return this.commands.reduce((sum, cmd) => sum + (cmd.getSize?.() || 1), 0);
  }
}

/**
 * History manager implementing undo/redo with command pattern.
 * Supports command merging, batching, memory limits, and serialization.
 * Implemented as a singleton for global history state.
 *
 * @example
 * ```typescript
 * // Execute a command
 * History.execute(new TransformCommand(entity, { position: new Vector3(10, 0, 0) }));
 *
 * // Undo
 * History.undo();
 *
 * // Redo
 * History.redo();
 *
 * // Batch commands
 * History.beginBatch('Move multiple objects');
 * History.execute(cmd1);
 * History.execute(cmd2);
 * History.endBatch();
 * ```
 */
export class HistoryManager {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private limit: number = 50;
  private maxMemoryMB: number = 100;
  private currentMemoryMB: number = 0;
  private listeners: Map<string, Set<Function>> = new Map();
  private batchStack: CommandBatch[] = [];
  private enabled: boolean = true;

  /**
   * Executes and records a command
   * @param command - Command to execute
   */
  public execute(command: ICommand): void {
    if (!this.enabled) {
      command.execute();
      return;
    }

    // If we're in a batch, add to batch instead
    if (this.batchStack.length > 0) {
      command.execute();
      this.batchStack[this.batchStack.length - 1].addCommand(command);
      return;
    }

    // Try to merge with previous command
    if (this.undoStack.length > 0) {
      const previous = this.undoStack[this.undoStack.length - 1];
      if (previous.canMerge(command)) {
        previous.merge(command);
        command.execute();
        this.emit('execute', this.createEvent('execute', command));
        return;
      }
    }

    // Execute the command
    command.execute();

    // Add to undo stack
    this.undoStack.push(command);

    // Clear redo stack
    this.redoStack = [];

    // Update memory tracking
    this.updateMemory(command);

    // Enforce limits
    this.enforceLimits();

    this.emit('execute', this.createEvent('execute', command));
  }

  /**
   * Undoes the last command
   */
  public undo(): void {
    if (!this.canUndo()) {
      console.warn('Nothing to undo');
      return;
    }

    const command = this.undoStack.pop()!;
    command.undo();
    this.redoStack.push(command);

    this.emit('undo', this.createEvent('undo', command));
  }

  /**
   * Redoes the last undone command
   */
  public redo(): void {
    if (!this.canRedo()) {
      console.warn('Nothing to redo');
      return;
    }

    const command = this.redoStack.pop()!;
    command.execute();
    this.undoStack.push(command);

    this.emit('redo', this.createEvent('redo', command));
  }

  /**
   * Checks if undo is available
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Checks if redo is available
   */
  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Gets the description of the next undo command
   */
  public getUndoDescription(): string | null {
    if (!this.canUndo()) return null;
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * Gets the description of the next redo command
   */
  public getRedoDescription(): string | null {
    if (!this.canRedo()) return null;
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * Begins a command batch
   * @param description - Batch description
   */
  public beginBatch(description: string): void {
    const batch = new CommandBatch(description);
    this.batchStack.push(batch);
  }

  /**
   * Ends the current command batch
   */
  public endBatch(): void {
    if (this.batchStack.length === 0) {
      console.warn('No batch to end');
      return;
    }

    const batch = this.batchStack.pop()!;

    // If we're still in a nested batch, add to parent
    if (this.batchStack.length > 0) {
      this.batchStack[this.batchStack.length - 1].addCommand(batch);
      return;
    }

    // Add batch to history
    if (batch.getSize() > 0) {
      this.undoStack.push(batch);
      this.redoStack = [];
      this.updateMemory(batch);
      this.enforceLimits();
      this.emit('execute', this.createEvent('execute', batch));
    }
  }

  /**
   * Cancels the current batch without recording
   */
  public cancelBatch(): void {
    if (this.batchStack.length === 0) {
      console.warn('No batch to cancel');
      return;
    }

    this.batchStack.pop();
  }

  /**
   * Clears all history
   */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batchStack = [];
    this.currentMemoryMB = 0;
    this.emit('clear', this.createEvent('clear'));
  }

  /**
   * Gets the current history size
   */
  public size(): number {
    return this.undoStack.length;
  }

  /**
   * Gets the redo stack size
   */
  public redoSize(): number {
    return this.redoStack.length;
  }

  /**
   * Sets the history limit
   * @param limit - Maximum number of commands to keep
   */
  public setLimit(limit: number): void {
    this.limit = Math.max(1, limit);
    this.enforceLimits();
  }

  /**
   * Gets the history limit
   */
  public getLimit(): number {
    return this.limit;
  }

  /**
   * Sets the memory limit in MB
   * @param limitMB - Memory limit
   */
  public setMemoryLimit(limitMB: number): void {
    this.maxMemoryMB = Math.max(1, limitMB);
    this.enforceLimits();
  }

  /**
   * Gets the current memory usage in MB
   */
  public getMemoryUsage(): number {
    return this.currentMemoryMB;
  }

  /**
   * Enables or disables history recording
   * @param enabled - Whether to enable history
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Checks if history is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Updates memory tracking for a command
   */
  private updateMemory(command: ICommand): void {
    // Estimate memory usage (rough approximation)
    const size = command.getSize?.() || 1;
    this.currentMemoryMB += (size * 0.001); // Assume ~1KB per size unit
  }

  /**
   * Enforces history limits
   */
  private enforceLimits(): void {
    // Enforce count limit
    while (this.undoStack.length > this.limit) {
      const removed = this.undoStack.shift()!;
      const size = removed.getSize?.() || 1;
      this.currentMemoryMB -= (size * 0.001);
    }

    // Enforce memory limit
    while (this.currentMemoryMB > this.maxMemoryMB && this.undoStack.length > 0) {
      const removed = this.undoStack.shift()!;
      const size = removed.getSize?.() || 1;
      this.currentMemoryMB -= (size * 0.001);
    }

    this.currentMemoryMB = Math.max(0, this.currentMemoryMB);
  }

  /**
   * Serializes history to JSON
   */
  public serialize(): any {
    return {
      undoStack: this.undoStack.map(cmd => ({
        description: cmd.description,
        // Commands would need to implement their own serialization
      })),
      limit: this.limit,
      maxMemoryMB: this.maxMemoryMB
    };
  }

  /**
   * Deserializes history from JSON
   */
  public deserialize(data: any): void {
    this.clear();
    this.limit = data.limit || this.limit;
    this.maxMemoryMB = data.maxMemoryMB || this.maxMemoryMB;
    // Note: Commands cannot be fully deserialized without more context
    // This would require a command factory system
  }

  /**
   * Creates a history change event
   */
  private createEvent(type: HistoryChangeEvent['type'], command?: ICommand): HistoryChangeEvent {
    return {
      type,
      command,
      size: this.size(),
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };
  }

  /**
   * Registers an event listener
   * @param event - Event name
   * @param callback - Callback function
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregisters an event listener
   * @param event - Event name
   * @param callback - Callback function
   */
  public off(event: string, callback: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emits an event
   * @param event - Event name
   * @param data - Event data
   */
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}

/**
 * Global history manager instance
 */
export const History = new HistoryManager();
