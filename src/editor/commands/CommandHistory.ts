/**
 * @fileoverview Command history manager for executing, undoing, and redoing commands
 * with batching and event support.
 * @module editor/commands/CommandHistory
 */

import { ICommand } from './Command';

/**
 * History event data
 */
export interface HistoryEvent {
  /** Event type */
  type: 'execute' | 'undo' | 'redo' | 'clear' | 'limit';
  /** Command involved */
  command?: ICommand;
  /** Number of commands in undo stack */
  undoCount: number;
  /** Number of commands in redo stack */
  redoCount: number;
}

/**
 * Command history manager that executes commands and maintains
 * undo/redo stacks with batching and event support.
 *
 * @example
 * ```typescript
 * const history = new CommandHistory(50);
 *
 * // Execute a command
 * history.execute(command);
 *
 * // Undo/redo
 * history.undo();
 * history.redo();
 *
 * // Batch multiple commands
 * history.beginBatch('Batch operation');
 * history.execute(cmd1);
 * history.execute(cmd2);
 * history.endBatch();
 *
 * // Listen for events
 * history.addEventListener('execute', (event) => {
 *   console.log('Command executed:', event.command);
 * });
 * ```
 */
export class CommandHistory {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private limit: number;
  private batchMode: boolean = false;
  private batchCommands: ICommand[] = [];
  private batchDescription: string = '';
  private listeners: Map<string, Set<(event: HistoryEvent) => void>> = new Map();

  /**
   * Creates a new command history manager
   * @param limit - Maximum number of commands to keep in history
   */
  constructor(limit: number = 50) {
    this.limit = Math.max(1, limit);
  }

  /**
   * Executes a command and adds it to the history
   * @param command - Command to execute
   */
  public execute(command: ICommand): void {
    // Validate command
    if (command.validate && !command.validate()) {
      console.warn('Command validation failed:', command.description);
      return;
    }

    // If in batch mode, add to batch
    if (this.batchMode) {
      command.execute();
      this.batchCommands.push(command);
      return;
    }

    // Try to merge with previous command
    if (this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (last.canMerge(command)) {
        last.merge(command);
        command.execute();
        this.notifyListeners('execute', command);
        return;
      }
    }

    // Execute command
    command.execute();

    // Add to undo stack
    this.undoStack.push(command);

    // Clear redo stack
    this.redoStack = [];

    // Enforce limit
    this.enforceLimit();

    this.notifyListeners('execute', command);
  }

  /**
   * Undoes the last command
   * @returns True if undo was successful
   */
  public undo(): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }

    const command = this.undoStack.pop()!;
    command.undo();
    this.redoStack.push(command);

    this.notifyListeners('undo', command);
    return true;
  }

  /**
   * Redoes the last undone command
   * @returns True if redo was successful
   */
  public redo(): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }

    const command = this.redoStack.pop()!;
    command.execute();
    this.undoStack.push(command);

    this.notifyListeners('redo', command);
    return true;
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
    if (this.undoStack.length === 0) {
      return null;
    }
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * Gets the description of the next redo command
   */
  public getRedoDescription(): string | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * Begins a batch of commands that will be grouped as one
   * @param description - Description for the batch
   */
  public beginBatch(description: string): void {
    if (this.batchMode) {
      console.warn('Already in batch mode');
      return;
    }

    this.batchMode = true;
    this.batchCommands = [];
    this.batchDescription = description;
  }

  /**
   * Ends the current batch and adds it to history
   */
  public endBatch(): void {
    if (!this.batchMode) {
      console.warn('Not in batch mode');
      return;
    }

    this.batchMode = false;

    if (this.batchCommands.length === 0) {
      return;
    }

    // Create a composite command
    const batch = new BatchCommand(this.batchDescription, this.batchCommands);
    this.undoStack.push(batch);
    this.redoStack = [];

    this.enforceLimit();
    this.notifyListeners('execute', batch);

    this.batchCommands = [];
    this.batchDescription = '';
  }

  /**
   * Cancels the current batch without adding to history
   */
  public cancelBatch(): void {
    if (!this.batchMode) {
      console.warn('Not in batch mode');
      return;
    }

    // Undo all commands in the batch
    for (let i = this.batchCommands.length - 1; i >= 0; i--) {
      this.batchCommands[i].undo();
    }

    this.batchMode = false;
    this.batchCommands = [];
    this.batchDescription = '';
  }

  /**
   * Clears all history
   */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batchMode = false;
    this.batchCommands = [];
    this.batchDescription = '';

    this.notifyListeners('clear');
  }

  /**
   * Sets the history limit
   * @param limit - New limit
   */
  public setLimit(limit: number): void {
    this.limit = Math.max(1, limit);
    this.enforceLimit();
    this.notifyListeners('limit');
  }

  /**
   * Gets the history limit
   */
  public getLimit(): number {
    return this.limit;
  }

  /**
   * Gets the number of commands in the undo stack
   */
  public getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Gets the number of commands in the redo stack
   */
  public getRedoCount(): number {
    return this.redoStack.length;
  }

  /**
   * Enforces the history limit
   */
  private enforceLimit(): void {
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  /**
   * Adds an event listener
   * @param event - Event type
   * @param callback - Callback function
   */
  public addEventListener(
    event: 'execute' | 'undo' | 'redo' | 'clear' | 'limit',
    callback: (event: HistoryEvent) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Removes an event listener
   * @param event - Event type
   * @param callback - Callback function
   */
  public removeEventListener(
    event: 'execute' | 'undo' | 'redo' | 'clear' | 'limit',
    callback: (event: HistoryEvent) => void
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Notifies event listeners
   */
  private notifyListeners(type: HistoryEvent['type'], command?: ICommand): void {
    const event: HistoryEvent = {
      type,
      command,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
  }
}

/**
 * Batch command that groups multiple commands together
 */
class BatchCommand implements ICommand {
  public description: string;
  private commands: ICommand[];

  constructor(description: string, commands: ICommand[]) {
    this.description = description;
    this.commands = [...commands];
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
    return false;
  }

  public merge(other: ICommand): void {
    throw new Error('Batch commands cannot be merged');
  }

  public getSize(): number {
    return this.commands.reduce((sum, cmd) => sum + (cmd.getSize?.() || 1), 0);
  }
}
