import type { Command } from "../Command";

export class SetPropertyCommand<T extends object> implements Command {
  readonly name = "Set Property";
  private readonly before: unknown;

  constructor(
    private readonly target: T,
    private readonly path: readonly string[],
    private readonly after: unknown
  ) {
    if (path.length === 0) {
      throw new Error("Property path cannot be empty");
    }
    this.before = this.read();
  }

  execute(): void {
    this.write(this.after);
  }

  undo(): void {
    this.write(this.before);
  }

  private read(): unknown {
    let cursor: unknown = this.target;
    for (const segment of this.path) {
      if (cursor === null || typeof cursor !== "object" || !(segment in cursor)) {
        throw new Error(`Invalid property path: ${this.path.join(".")}`);
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
  }

  private write(value: unknown): void {
    let cursor: unknown = this.target;
    for (const segment of this.path.slice(0, -1)) {
      if (cursor === null || typeof cursor !== "object" || !(segment in cursor)) {
        throw new Error(`Invalid property path: ${this.path.join(".")}`);
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    (cursor as Record<string, unknown>)[this.path[this.path.length - 1]] = value;
  }
}
