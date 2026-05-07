export interface Disposable {
  dispose(): void | Promise<void>;
}

export function isDisposable(value: unknown): value is Disposable {
  return typeof value === "object" && value !== null && "dispose" in value && typeof (value as Disposable).dispose === "function";
}

export class DisposableStack implements Disposable {
  private readonly entries: Disposable[] = [];
  private disposed = false;

  use<T extends Disposable>(resource: T): T {
    if (this.disposed) {
      throw new Error("Cannot add a disposable to an already disposed stack.");
    }
    this.entries.push(resource);
    return resource;
  }

  get size(): number {
    return this.entries.length;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    const errors: unknown[] = [];
    while (this.entries.length > 0) {
      const entry = this.entries.pop();
      if (!entry) continue;
      try {
        await entry.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more disposables failed.");
  }
}
