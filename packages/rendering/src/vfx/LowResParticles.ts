// PRD-07 P6-T4 — optional half-resolution particle target. Batches flagged
// `lowRes` render into a half-size RGBA8 target, then a single fullscreen
// composite upsamples them — depth-aware bilateral when scene depth is bound,
// plain bilinear otherwise. The path is opt-in: off by default, and it can be
// auto-enabled when measured particle GPU ms exceeds the tier budget.

import type { RenderBuffer, RenderDevice, RenderTarget, RenderTargetDescriptor } from "../RenderDevice";
import type { AuraQualityTierSettings } from "../contracts/quality";
import { QUALITY_TIERS } from "../contracts/quality";
import { TextureBinding } from "../TextureBinding";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import {
  LOWRES_COMPOSITE_SHADER_MARKER,
  lowResCompositeFragmentSource,
  lowResCompositeProgramKey,
  lowResCompositeVertexSource,
  type LowResCompositeDefines
} from "./shaders/lowresComposite.glsl";
import type { ResolvedSceneDepth } from "./SceneDepthAdapter";

/** §6.2 particle GPU budget per tier (ms). Custom tier settings fall back to
 *  matching by `particleBudget`, then to the `high` budget. */
export const PARTICLE_GPU_BUDGET_MS: Record<keyof typeof QUALITY_TIERS | "default", number> = {
  low: 8,
  medium: 6,
  high: 4,
  ultra: 3,
  default: 4
};

export function particleGpuBudgetMs(tier: AuraQualityTierSettings): number {
  for (const name of ["low", "medium", "high", "ultra"] as const) {
    if (QUALITY_TIERS[name] === tier) return PARTICLE_GPU_BUDGET_MS[name];
  }
  const byBudget = (Object.keys(QUALITY_TIERS) as (keyof typeof QUALITY_TIERS)[]).find(
    (name) => QUALITY_TIERS[name].particleBudget === tier.particleBudget
  );
  return PARTICLE_GPU_BUDGET_MS[byBudget ?? "default"];
}

const LOWRES_SCALE = 0.5;

/** EWMA auto-enable policy: on above the budget, off below 75% of it. */
export class LowResAutoBudget {
  private ewma = 0;
  private frames = 0;

  constructor(private readonly hysteresis = 0.75) {}

  /** Feed one measured particle-GPU-ms sample; returns whether low-res is on. */
  note(ms: number, budgetMs: number, enabled: boolean): boolean {
    this.ewma = this.frames === 0 ? ms : this.ewma * 0.8 + ms * 0.2;
    this.frames += 1;
    if (this.frames < 8) return enabled; // don't react to single-frame spikes
    if (!enabled && this.ewma > budgetMs) return true;
    if (enabled && this.ewma < budgetMs * this.hysteresis) return false;
    return enabled;
  }

  reset(): void {
    this.ewma = 0;
    this.frames = 0;
  }
}

export class LowResParticleTarget {
  private target: RenderTarget | null = null;
  private fullscreenBuffer: RenderBuffer | null = null;
  private readonly programs = new Map<string, import("../RenderDevice").RenderShaderProgram>();

  constructor(private readonly device: RenderDevice) {}

  /** Half-res RGBA8 target sized to the frame; recreated on resize. */
  acquire(frameWidth: number, frameHeight: number): RenderTarget {
    const width = Math.max(1, Math.round((Number.isFinite(frameWidth) ? frameWidth : 1) * LOWRES_SCALE));
    const height = Math.max(1, Math.round((Number.isFinite(frameHeight) ? frameHeight : 1) * LOWRES_SCALE));
    if (this.target && this.target.width === width && this.target.height === height) return this.target;
    this.target?.dispose();
    const desc: RenderTargetDescriptor = {
      width,
      height,
      label: "prd07.particles.lowres",
      format: "rgba8",
      // Renderbuffer depth: keeps inter-particle occlusion inside the low-res
      // buffer without paying for a sampleable depth texture.
      depth: "renderbuffer"
    };
    this.target = this.device.createRenderTarget(desc);
    return this.target;
  }

  /** Fullscreen upsample into whichever target is currently bound. */
  composite(depth: ResolvedSceneDepth | null): void {
    if (!this.target) return;
    const bilateral = depth?.available === true && depth.source.texture !== null;
    const defines: LowResCompositeDefines = { bilateral };
    const key = lowResCompositeProgramKey(defines);
    let program = this.programs.get(key);
    if (!program) {
      program = this.device.createShaderProgram({
        label: key,
        vertex: lowResCompositeVertexSource(),
        fragment: lowResCompositeFragmentSource(defines),
        marker: LOWRES_COMPOSITE_SHADER_MARKER
      });
      this.programs.set(key, program);
    }
    if (!this.fullscreenBuffer) {
      this.fullscreenBuffer = fullscreenTriangle().upload(this.device);
    }
    const uniforms = new Map<string, import("../RenderDevice").UniformValue>([
      ["u_lowRes", new TextureBinding({ name: "u_lowRes", texture: this.target.colorTexture })]
    ]);
    if (bilateral && depth?.source.texture) {
      uniforms.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: depth.source.texture }));
      uniforms.set("u_depthLinearize", [depth.source.linearize.near, depth.source.linearize.far, depth.source.linearize.orthographic ? 1 : 0, 0]);
      uniforms.set("u_lowTexel", [1 / this.target.width, 1 / this.target.height]);
      uniforms.set("u_lowSize", [this.target.width, this.target.height]);
      uniforms.set("u_bilateralSharpness", 0.5);
    }
    this.device.draw({
      label: "prd07.particles.lowresComposite",
      topology: "triangles",
      vertexBuffer: this.fullscreenBuffer,
      vertexFormat: FULLSCREEN_FORMAT,
      vertexCount: 3,
      shader: program,
      uniforms,
      renderState: {
        depthTest: false,
        depthWrite: false,
        depthCompare: "always",
        cullMode: "none",
        blend: true,
        blendMode: "premultiplied"
      }
    });
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
    this.fullscreenBuffer?.dispose();
    this.fullscreenBuffer = null;
    for (const program of this.programs.values()) program.dispose?.();
    this.programs.clear();
  }
}

const FULLSCREEN_FORMAT = new VertexFormat([{ semantic: "position", components: 2, offset: 0, shaderName: "a_pos" }], 8);

let tri: VertexBuffer | null = null;
function fullscreenTriangle(): VertexBuffer {
  if (!tri) {
    tri = new VertexBuffer(FULLSCREEN_FORMAT, 3);
    tri.setAttribute(0, "position", [-1, -1]);
    tri.setAttribute(1, "position", [3, -1]);
    tri.setAttribute(2, "position", [-1, 3]);
  }
  return tri;
}
