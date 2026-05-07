import type { BehaviorPhase } from "./Behavior";

export interface ScriptContextOptions {
  readonly phase: BehaviorPhase;
  readonly deltaSeconds?: number;
  readonly fixedDeltaSeconds?: number;
  readonly target?: unknown;
  readonly services?: ReadonlyMap<string, unknown>;
}

export class ScriptContext {
  readonly phase: BehaviorPhase;
  readonly deltaSeconds: number;
  readonly fixedDeltaSeconds: number;
  readonly target?: unknown;

  private readonly services: ReadonlyMap<string, unknown>;

  constructor(options: ScriptContextOptions) {
    this.phase = options.phase;
    this.deltaSeconds = options.deltaSeconds ?? 0;
    this.fixedDeltaSeconds = options.fixedDeltaSeconds ?? 0;
    this.target = options.target;
    this.services = options.services ?? new Map();
  }

  getService<T>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`Script service is not available in ${this.phase}: ${name}`);
    }

    return this.services.get(name) as T;
  }
}
