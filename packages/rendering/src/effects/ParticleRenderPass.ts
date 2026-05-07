import { BaseRenderPass, type RenderPassContext } from "../RenderPass.js";
import { type GPUParticleBackend } from "./GPUParticleBackend.js";
import { ParticleRenderer, type ParticleDrawTarget, type ParticleRenderBatch, type ParticleRenderOptions } from "./ParticleRenderer.js";
import { type ParticleSystem } from "./ParticleSystem.js";

export type ParticleRenderPassUpdateMode = "none" | "cpu" | "gpu";

export interface ParticleRenderPassUpdateOptions {
  readonly deltaTime: number;
  readonly gpuBackend?: GPUParticleBackend;
  readonly preferGPU?: boolean;
  readonly allowCPUFallback?: boolean;
}

export interface ParticleRenderPassOptions {
  readonly system: ParticleSystem;
  readonly target: ParticleDrawTarget;
  readonly renderer?: ParticleRenderer;
  readonly renderOptions?: ParticleRenderOptions;
  readonly update?: ParticleRenderPassUpdateOptions;
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
}

export class ParticleRenderPass extends BaseRenderPass {
  readonly renderer: ParticleRenderer;
  private lastBatch: ParticleRenderBatch | null = null;
  private lastUpdateMode: ParticleRenderPassUpdateMode = "none";

  constructor(private readonly options: ParticleRenderPassOptions) {
    super("particles", options.reads ?? ["color"], options.writes ?? ["color"], ["color"]);
    this.renderer = options.renderer ?? new ParticleRenderer();
  }

  execute(_context: RenderPassContext): void {
    if (this.requiresAsyncUpdate()) {
      throw new Error("ParticleRenderPass with a supported GPU update backend must run through RenderGraph.executeAsync().");
    }
    this.updateSync();
    this.lastBatch = this.renderer.render(this.options.system, this.options.target, this.options.renderOptions);
  }

  async executeAsync(_context: RenderPassContext): Promise<void> {
    await this.updateAsync();
    this.lastBatch = this.renderer.render(this.options.system, this.options.target, this.options.renderOptions);
  }

  getLastBatch(): ParticleRenderBatch | null {
    if (!this.lastBatch) {
      return null;
    }
    return {
      sprites: this.lastBatch.sprites.map((sprite) => ({
        ...sprite,
        position: { ...sprite.position },
        color: { ...sprite.color }
      })),
      liveCount: this.lastBatch.liveCount,
      uploadedBytes: this.lastBatch.uploadedBytes,
      bounds: this.lastBatch.bounds ? {
        min: { ...this.lastBatch.bounds.min },
        max: { ...this.lastBatch.bounds.max }
      } : null
    };
  }

  getLastUpdateMode(): ParticleRenderPassUpdateMode {
    return this.lastUpdateMode;
  }

  private requiresAsyncUpdate(): boolean {
    const update = this.options.update;
    return Boolean(update?.gpuBackend?.capabilities.supported && (update.preferGPU ?? true));
  }

  private updateSync(): void {
    const update = this.options.update;
    if (!update) {
      this.lastUpdateMode = "none";
      return;
    }
    validateDeltaTime(update.deltaTime);
    if (update.gpuBackend && update.preferGPU !== false && !update.gpuBackend.capabilities.supported && update.allowCPUFallback === false) {
      throw new Error(update.gpuBackend.capabilities.reason ?? "GPU particle backend is unsupported.");
    }
    this.options.system.update(update.deltaTime);
    this.lastUpdateMode = "cpu";
  }

  private async updateAsync(): Promise<void> {
    const update = this.options.update;
    if (!update) {
      this.lastUpdateMode = "none";
      return;
    }
    validateDeltaTime(update.deltaTime);
    const backend = update.gpuBackend;
    if (backend && (update.preferGPU ?? true)) {
      if (backend.capabilities.supported) {
        await this.options.system.updateOnGPU(update.deltaTime, backend);
        this.lastUpdateMode = "gpu";
        return;
      }
      if (update.allowCPUFallback === false) {
        throw new Error(backend.capabilities.reason ?? "GPU particle backend is unsupported.");
      }
    }
    this.options.system.update(update.deltaTime);
    this.lastUpdateMode = "cpu";
  }
}

function validateDeltaTime(deltaTime: number): void {
  if (!Number.isFinite(deltaTime) || deltaTime < 0) {
    throw new RangeError("ParticleRenderPass update deltaTime must be a finite non-negative number.");
  }
}
