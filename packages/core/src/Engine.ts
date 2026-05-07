import { DisposableStack } from "./Disposable.js";
import { EngineLoop, type FrameContext } from "./EngineLoop.js";
import { resolveEngineConfig, type EngineConfig, type ResolvedEngineConfig } from "./EngineConfig.js";
import { LifecycleError } from "./Errors.js";
import { EventBus } from "./EventBus.js";
import { Diagnostics } from "./Diagnostics.js";
import { Logger } from "./Logger.js";
import { ResourceScope } from "./ResourceScope.js";
import { Scheduler, SystemPhase } from "./Scheduler.js";
import { TaskQueue } from "./TaskQueue.js";

export type EngineState = "created" | "initializing" | "initialized" | "running" | "stopped" | "disposed" | "failed";

export interface EngineEvents {
  stateChanged: { readonly previous: EngineState; readonly current: EngineState };
  frame: FrameContext;
  error: unknown;
}

export interface EnginePlugin {
  readonly id: string;
  init?(engine: Engine): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export class Engine {
  readonly config: ResolvedEngineConfig;
  readonly events = new EventBus<EngineEvents>((error) => this.events.emit("error", error));
  readonly diagnostics = new Diagnostics();
  readonly logger = new Logger();
  readonly scheduler = new Scheduler();
  readonly tasks = new TaskQueue();
  readonly resources = new ResourceScope("engine");

  private readonly plugins: EnginePlugin[] = [];
  private readonly pluginDisposables = new DisposableStack();
  private readonly loop: EngineLoop;
  private stateValue: EngineState = "created";

  constructor(config: EngineConfig = {}) {
    this.config = resolveEngineConfig(config);
    this.loop = new EngineLoop({
      mode: "manual",
      fixedDelta: this.config.fixedDelta,
      maxDelta: this.config.maxDelta,
      maxFixedSteps: this.config.maxFixedSteps,
      timeScale: this.config.timeScale
    }, (context) => this.runFrame(context));
  }

  get state(): EngineState {
    return this.stateValue;
  }

  use(plugin: EnginePlugin): this {
    if (this.stateValue !== "created") throw new LifecycleError("PLUGIN_AFTER_INIT", "Plugins must be registered before init.");
    if (this.plugins.some((existing) => existing.id === plugin.id)) throw new LifecycleError("DUPLICATE_PLUGIN", `Plugin ${plugin.id} already registered.`);
    this.plugins.push(plugin);
    return this;
  }

  async init(): Promise<void> {
    if (this.stateValue === "initialized" || this.stateValue === "running" || this.stateValue === "stopped") return;
    if (this.stateValue !== "created") throw new LifecycleError("INVALID_INIT", `Cannot init engine from ${this.stateValue}.`);
    this.setState("initializing");
    try {
      for (const plugin of this.plugins) {
        await plugin.init?.(this);
        if (plugin.dispose) this.pluginDisposables.use({ dispose: () => plugin.dispose?.() });
      }
      this.setState("initialized");
      if (this.config.autoStart) this.start();
    } catch (error) {
      this.setState("failed");
      await this.pluginDisposables.dispose();
      throw error;
    }
  }

  start(): void {
    if (this.stateValue !== "initialized" && this.stateValue !== "stopped") throw new LifecycleError("START_BEFORE_INIT", "Engine must be initialized before start.");
    this.loop.start();
    this.setState("running");
  }

  stop(): void {
    if (this.stateValue !== "running") return;
    this.loop.stop();
    this.setState("stopped");
  }

  async step(delta: number): Promise<FrameContext> {
    if (this.stateValue === "created") await this.init();
    if (this.stateValue !== "initialized" && this.stateValue !== "running" && this.stateValue !== "stopped") {
      throw new LifecycleError("STEP_INVALID_STATE", `Cannot step engine from ${this.stateValue}.`);
    }
    return this.loop.step(delta);
  }

  async dispose(): Promise<void> {
    if (this.stateValue === "disposed") return;
    if (this.stateValue === "running") this.stop();
    const errors: unknown[] = [];
    try {
      await this.pluginDisposables.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.resources.dispose();
    } catch (error) {
      errors.push(error);
    }
    this.events.clear();
    this.setState("disposed");
    if (errors.length > 0) throw new AggregateError(errors, "Engine disposal failed.");
  }

  private async runFrame(context: FrameContext): Promise<void> {
    this.diagnostics.increment("frames");
    await this.scheduler.runPhase(SystemPhase.Platform);
    await this.scheduler.runPhase(SystemPhase.Tasks);
    await this.tasks.flush();
    for (let step = 0; step < context.fixedSteps; step++) {
      await this.scheduler.runPhase(SystemPhase.Fixed, step);
    }
    await this.scheduler.runPhase(SystemPhase.Update);
    await this.scheduler.runPhase(SystemPhase.Scene);
    await this.scheduler.runPhase(SystemPhase.Render);
    await this.scheduler.runPhase(SystemPhase.Present);
    await this.scheduler.runPhase(SystemPhase.Cleanup);
    this.events.emit("frame", context);
  }

  private setState(next: EngineState): void {
    const previous = this.stateValue;
    this.stateValue = next;
    this.events.emit("stateChanged", Object.freeze({ previous, current: next }));
  }
}
