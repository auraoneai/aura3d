import type { Behavior } from "./Behavior";
import { ScriptContext } from "./ScriptContext";

export interface BehaviorHostOptions {
  readonly target?: unknown;
}

export class BehaviorHost {
  readonly target?: unknown;
  private readonly behaviors = new Set<Behavior>();
  private destroyed = false;

  constructor(options: BehaviorHostOptions = {}) {
    this.target = options.target;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  attach(behavior: Behavior): void {
    this.assertAlive();
    this.behaviors.add(behavior);
  }

  detach(behavior: Behavior): boolean {
    return this.behaviors.delete(behavior);
  }

  list(): readonly Behavior[] {
    return [...this.behaviors];
  }

  async destroy(services?: ReadonlyMap<string, unknown>): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const context = new ScriptContext({ phase: "destroy", target: this.target, services });
    for (const behavior of [...this.behaviors]) {
      await behavior.onDestroy?.(context);
    }
    this.behaviors.clear();
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("Cannot attach behavior to a destroyed host");
    }
  }
}
