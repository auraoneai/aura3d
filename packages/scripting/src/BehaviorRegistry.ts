import type { Behavior } from "./Behavior";

export type BehaviorFactory<T extends Behavior = Behavior> = () => T;

export class BehaviorRegistry {
  private readonly factories = new Map<string, BehaviorFactory>();

  register(type: string, factory: BehaviorFactory): void {
    if (this.factories.has(type)) {
      throw new Error(`Behavior type already registered: ${type}`);
    }
    this.factories.set(type, factory);
  }

  create(type: string): Behavior {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`Unknown behavior type: ${type}`);
    }
    return factory();
  }
}
