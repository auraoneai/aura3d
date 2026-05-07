import type { Command, CommandContext } from "./Command";

export class CommandTransactionError extends Error {
  readonly cause: unknown;
  readonly rollbackErrors: readonly unknown[];

  constructor(cause: unknown, rollbackErrors: readonly unknown[]) {
    super("Command transaction failed and rollback reported errors.");
    this.name = "CommandTransactionError";
    this.cause = cause;
    this.rollbackErrors = rollbackErrors;
  }
}

class CompositeCommand implements Command {
  readonly name: string;

  constructor(private readonly commands: readonly Command[]) {
    this.name = commands.map((command) => command.name).join(", ");
  }

  async execute(context?: CommandContext): Promise<void> {
    await executeCommandsAtomically(this.commands, context);
  }

  async undo(context?: CommandContext): Promise<void> {
    for (const command of [...this.commands].reverse()) {
      await command.undo(context);
    }
  }
}

export class CommandHistory {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  async execute(command: Command, context?: CommandContext): Promise<void> {
    try {
      await command.execute(context);
    } catch (error) {
      await Promise.resolve(command.undo(context)).catch(() => undefined);
      throw error;
    }

    const previous = this.undoStack[this.undoStack.length - 1];
    if (previous?.canMerge?.(command) && previous.merge) {
      this.undoStack[this.undoStack.length - 1] = previous.merge(command);
    } else {
      this.undoStack.push(command);
    }
    this.redoStack.length = 0;
  }

  async executeTransaction(commands: readonly Command[], context?: CommandContext): Promise<void> {
    if (commands.length === 0) {
      return;
    }

    await executeCommandsAtomically(commands, context);

    this.undoStack.push(new CompositeCommand([...commands]));
    this.redoStack.length = 0;
  }

  async undo(context?: CommandContext): Promise<void> {
    const command = this.undoStack.pop();
    if (!command) {
      return;
    }
    try {
      await command.undo(context);
    } catch (error) {
      this.undoStack.push(command);
      throw error;
    }
    this.redoStack.push(command);
  }

  async redo(context?: CommandContext): Promise<void> {
    const command = this.redoStack.pop();
    if (!command) {
      return;
    }
    try {
      await command.execute(context);
    } catch (error) {
      this.redoStack.push(command);
      throw error;
    }
    this.undoStack.push(command);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

async function executeCommandsAtomically(commands: readonly Command[], context?: CommandContext): Promise<void> {
  const executed: Command[] = [];
  try {
    for (const command of commands) {
      await command.execute(context);
      executed.push(command);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const command of executed.reverse()) {
      try {
        await command.undo(context);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new CommandTransactionError(error, rollbackErrors);
    }
    throw error;
  }
}
