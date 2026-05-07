import { DirectionalLight, Light } from "@galileo3d/scene";
import { DepthPass } from "./DepthPass";
import { type RenderItem } from "./ForwardPass";
import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { type RenderDeviceDiagnostics } from "./RenderDevice";
import { type RenderPassContext } from "./RenderPass";
import { ShadowMap } from "./ShadowMap";
import { type ShaderLibrary } from "./ShaderLibrary";

export interface ShadowPassOptions {
  readonly light: Light | null;
  readonly casters: readonly RenderItem[];
  readonly shadowMap?: ShadowMap;
  readonly shaderLibrary?: ShaderLibrary;
}

export interface ShadowPassResult {
  readonly rendered: boolean;
  readonly reason: ShadowPassReason;
  readonly casterCount: number;
  readonly skippedTransparentCasters: number;
  readonly diagnostics: RenderDeviceDiagnostics;
}

export type ShadowPassReason = "rendered" | "no-light" | "light-disabled" | "not-shadow-casting" | "no-casters" | "no-opaque-casters";

export class ShadowPass {
  public readonly shadowMap: ShadowMap;
  private lastResult: ShadowPassResult | null = null;

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
        diagnostics: context.device.getDiagnostics()
      };
      return this.lastResult;
    }

    const depthOptions = this.options.shaderLibrary
      ? { casters: opaqueCasters, shaderLibrary: this.options.shaderLibrary }
      : { casters: opaqueCasters };
    const pass = new DepthPass(depthOptions);
    pass.execute(context);
    this.lastResult = {
      rendered: true,
      reason: "rendered",
      casterCount: opaqueCasters.length,
      skippedTransparentCasters,
      diagnostics: context.device.getDiagnostics()
    };
    return this.lastResult;
  }

  getLastResult(): ShadowPassResult | null {
    return this.lastResult;
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
    if (!(light instanceof DirectionalLight)) {
      return "not-shadow-casting";
    }
    return null;
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
