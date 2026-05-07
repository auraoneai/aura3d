import { DisposableStack, type Disposable } from "./Disposable.js";

export interface ResourceLeak {
  name: string;
  resourceCount: number;
  childScopes: ResourceLeak[];
}

export class ResourceScope implements Disposable {
  private readonly stack = new DisposableStack();
  private readonly children = new Set<ResourceScope>();
  private disposed = false;

  constructor(readonly name: string) {}

  use<T extends Disposable>(resource: T): T {
    if (this.disposed) throw new Error(`Resource scope ${this.name} is disposed.`);
    return this.stack.use(resource);
  }

  createChild(name: string): ResourceScope {
    if (this.disposed) throw new Error(`Resource scope ${this.name} is disposed.`);
    const child = new ResourceScope(name);
    this.children.add(child);
    return child;
  }

  leakSnapshot(): ResourceLeak {
    return {
      name: this.name,
      resourceCount: this.stack.size,
      childScopes: [...this.children].map((child) => child.leakSnapshot())
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const child of [...this.children].reverse()) {
      try {
        await child.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.children.clear();
    try {
      await this.stack.dispose();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) throw new AggregateError(errors, `Resource scope ${this.name} failed to dispose.`);
  }
}
