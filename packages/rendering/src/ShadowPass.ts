import { Light } from "@aura3d/scene";
import { DepthPass } from "./DepthPass";
import { type ForwardShadowMapOptions, type RenderItem } from "./ForwardPass";
import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { type RenderDeviceDiagnostics, type RenderTarget } from "./RenderDevice";
import { type RenderPassContext } from "./RenderPass";
import { Sampler } from "./Sampler";
import { ShadowMap } from "./ShadowMap";
import { type ShaderLibrary } from "./ShaderLibrary";
import { TextureBinding } from "./TextureBinding";

export interface ShadowPassOptions {
  readonly light: Light | null;
  readonly casters: readonly RenderItem[];
  readonly shadowMap?: ShadowMap;
  readonly shaderLibrary?: ShaderLibrary;
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
}

export interface ShadowPassResult {
  readonly rendered: boolean;
  readonly reason: ShadowPassReason;
  readonly casterCount: number;
  readonly skippedTransparentCasters: number;
  readonly targetBacked: boolean;
  readonly shadowTextureLabel?: string;
  readonly shadowTextureKind?: ShadowTextureKind;
  readonly diagnostics: RenderDeviceDiagnostics;
}

export type ShadowPassReason = "rendered" | "no-light" | "light-disabled" | "not-shadow-casting" | "no-casters" | "no-opaque-casters";
export type ShadowTextureKind = "depth-texture" | "encoded-color-depth";

export class ShadowPass {
  public readonly shadowMap: ShadowMap;
  private lastResult: ShadowPassResult | null = null;
  private renderTarget: RenderTarget | null = null;

  constructor(private readonly options: ShadowPassOptions) {
    this.shadowMap = options.shadowMap ?? new ShadowMap();
  }

  execute(context: RenderPassContext): ShadowPassResult {
    const skipReason = this.getSkipReason();
    if (skipReason) {
      this.lastResult = {
        rendered: false,
        reason: skipReason,
        casterCount: 0,
        skippedTransparentCasters: 0,
        targetBacked: false,
        diagnostics: context.device.getDiagnostics()
      };
      return this.lastResult;
    }

    const opaqueCasters = this.options.casters.filter((caster) => !isTransparentCaster(caster));
    const skippedTransparentCasters = this.options.casters.length - opaqueCasters.length;
    if (opaqueCasters.length === 0) {
      this.lastResult = {
        rendered: false,
        reason: "no-opaque-casters",
        casterCount: 0,
        skippedTransparentCasters,
        targetBacked: false,
        diagnostics: context.device.getDiagnostics()
      };
      return this.lastResult;
    }

    const ownsFrame = context.device.captureState().get("frameActive") === false;
    if (ownsFrame) {
      context.device.beginFrame(context.width, context.height);
    }
    try {
      return this.executeWithinFrame(context, opaqueCasters, skippedTransparentCasters);
    } finally {
      if (ownsFrame) {
        context.device.endFrame();
      }
    }
  }

  private executeWithinFrame(context: RenderPassContext, opaqueCasters: readonly RenderItem[], skippedTransparentCasters: number): ShadowPassResult {
    const target = this.ensureRenderTarget(context);
    context.device.setRenderTarget(target);
    initializeShadowTarget(context, target);
    const depthOptions = this.options.shaderLibrary
      ? { casters: opaqueCasters, shaderLibrary: this.options.shaderLibrary, viewProjectionMatrix: this.options.viewProjectionMatrix }
      : { casters: opaqueCasters, viewProjectionMatrix: this.options.viewProjectionMatrix };
    const pass = new DepthPass(depthOptions);
    pass.execute(context);
    context.device.setRenderTarget(null);
    this.lastResult = {
      rendered: true,
      reason: "rendered",
      casterCount: opaqueCasters.length,
      skippedTransparentCasters,
      targetBacked: true,
      shadowTextureLabel: shadowTextureForTarget(target).label,
      shadowTextureKind: target.depthTexture ? "depth-texture" : "encoded-color-depth",
      diagnostics: context.device.getDiagnostics()
    };
    return this.lastResult;
  }

  getLastResult(): ShadowPassResult | null {
    return this.lastResult;
  }

  getRenderTarget(): RenderTarget | null {
    return this.renderTarget;
  }

  getForwardShadowMap(options: Omit<ForwardShadowMapOptions, "texture" | "bias" | "filterKernel"> & {
    readonly bias?: number;
    readonly filterKernel?: ForwardShadowMapOptions["filterKernel"];
  }): ForwardShadowMapOptions | null {
    if (!this.renderTarget || !this.lastResult?.rendered) {
      return null;
    }
    return {
      ...options,
      bias: options.bias ?? this.shadowMap.bias,
      filterKernel: options.filterKernel ?? this.shadowMap.filterKernel,
      texture: new TextureBinding({
        name: "u_shadowMapTexture",
        texture: shadowTextureForTarget(this.renderTarget),
        sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        required: true
      })
    };
  }

  dispose(): void {
    this.renderTarget?.dispose();
    this.renderTarget = null;
    this.shadowMap.dispose();
  }

  private ensureRenderTarget(context: RenderPassContext): RenderTarget {
    if (this.renderTarget && !this.renderTarget.disposed && this.renderTarget.width === this.shadowMap.size && this.renderTarget.height === this.shadowMap.size) {
      return this.renderTarget;
    }
    this.renderTarget?.dispose();
    this.renderTarget = context.device.createRenderTarget({
      width: this.shadowMap.size,
      height: this.shadowMap.size,
      label: `${this.shadowMap.texture.label}-depth-color`,
      format: "rgba8",
      depth: context.device.info.capabilities?.includes("depth-textures") ? "texture" : true
    });
    return this.renderTarget;
  }

  private getSkipReason(): ShadowPassResult["reason"] | null {
    const light = this.options.light;
    if (!light) {
      return "no-light";
    }
    if (!light.visible) {
      return "light-disabled";
    }
    if (!light.castsShadow) {
      return "not-shadow-casting";
    }
    if (this.options.casters.length === 0) {
      return "no-casters";
    }
    return null;
  }
}

function shadowTextureForTarget(target: RenderTarget) {
  return target.depthTexture ?? target.colorTexture;
}

function initializeShadowTarget(context: RenderPassContext, target: RenderTarget): void {
  context.device.setRenderTarget(target);
  if (context.device.clearRenderTarget) {
    context.device.clearRenderTarget([1, 1, 1, 1]);
  } else {
    context.device.clear([1, 1, 1, 1]);
  }
}

function isTransparentCaster(caster: RenderItem): boolean {
  if (!caster.material) {
    return false;
  }
  const material = getBaseMaterial(caster.material);
  return material.renderState.blend;
}

function getBaseMaterial(material: Material | MaterialInstance): Material {
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}
