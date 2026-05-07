export interface CommandContext {
  readonly services?: ReadonlyMap<string, unknown>;
}

export interface Command {
  readonly name: string;
  execute(context?: CommandContext): void | Promise<void>;
  undo(context?: CommandContext): void | Promise<void>;
  canMerge?(next: Command): boolean;
  merge?(next: Command): Command;
}
