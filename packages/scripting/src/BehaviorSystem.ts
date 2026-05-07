import type { Behavior, BehaviorPhase } from "./Behavior";
import type { BehaviorHost } from "./BehaviorHost";
import { ScriptContext } from "./ScriptContext";

export interface BehaviorError {
  readonly phase: BehaviorPhase;
  readonly behavior: Behavior;
  readonly error: unknown;
}

export interface BehaviorSystemUpdateOptions {
  readonly deltaSeconds?: number;
  readonly fixedDeltaSeconds?: number;
}

export class BehaviorSystem {
  readonly errors: BehaviorError[] = [];

  private readonly hosts = new Set<BehaviorHost>();
  private readonly started = new WeakSet<Behavior>();
  private readonly services = new Map<string, unknown>();

  registerHost(host: BehaviorHost): void {
    this.hosts.add(host);
  }

  unregisterHost(host: BehaviorHost): void {
    this.hosts.delete(host);
  }

  setService(name: string, value: unknown): void {
    this.services.set(name, value);
  }

  async fixedUpdate(options: BehaviorSystemUpdateOptions = {}): Promise<void> {
    await this.runPhase("fixed", options);
  }

  async update(options: BehaviorSystemUpdateOptions = {}): Promise<void> {
    await this.runStart(options);
    await this.runPhase("update", options);
  }

  private async runStart(options: BehaviorSystemUpdateOptions): Promise<void> {
    for (const host of [...this.hosts]) {
      if (host.isDestroyed) {
        this.hosts.delete(host);
        continue;
      }

      for (const behavior of host.list()) {
        if (behavior.enabled === false || this.started.has(behavior)) {
          continue;
        }
        this.started.add(behavior);
        await this.invoke("start", behavior, host, options);
      }
    }
  }

  private async runPhase(phase: "fixed" | "update", options: BehaviorSystemUpdateOptions): Promise<void> {
    for (const host of [...this.hosts]) {
      if (host.isDestroyed) {
        this.hosts.delete(host);
        continue;
      }

      for (const behavior of host.list()) {
        if (behavior.enabled === false) {
          continue;
        }
        await this.invoke(phase, behavior, host, options);
      }
    }
  }

  private async invoke(
    phase: BehaviorPhase,
    behavior: Behavior,
    host: BehaviorHost,
    options: BehaviorSystemUpdateOptions
  ): Promise<void> {
    const context = new ScriptContext({
      phase,
      deltaSeconds: options.deltaSeconds,
      fixedDeltaSeconds: options.fixedDeltaSeconds,
      target: host.target,
      services: this.services
    });

    try {
      if (phase === "start") {
        await behavior.onStart?.(context);
      } else if (phase === "fixed") {
        await behavior.onFixedUpdate?.(context);
      } else if (phase === "update") {
        await behavior.onUpdate?.(context);
      }
    } catch (error) {
      this.errors.push({ phase, behavior, error });
    }
  }
}
