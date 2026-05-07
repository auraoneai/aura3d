import { DirectionalLight, Light } from "@galileo3d/scene";
import { type RenderItem } from "./ForwardPass";
import { type RenderDeviceDiagnostics } from "./RenderDevice";
import { type RenderPassContext } from "./RenderPass";
import { ShadowMap } from "./ShadowMap";
import { ShadowPass, type ShadowPassReason } from "./ShadowPass";
import { type ShaderLibrary } from "./ShaderLibrary";

export interface CascadeSplitOptions {
  readonly cascadeCount: number;
  readonly near: number;
  readonly far: number;
  readonly lambda?: number;
}

export interface CascadeSplit {
  readonly index: number;
  readonly near: number;
  readonly far: number;
}

export interface CascadedShadowMapsOptions extends CascadeSplitOptions {
  readonly size?: number;
  readonly bias?: number;
  readonly label?: string;
}

export interface ShadowCascade {
  readonly index: number;
  readonly split: CascadeSplit;
  readonly shadowMap: ShadowMap;
}

export class CascadedShadowMaps {
  private readonly cascades: readonly ShadowCascade[];

  constructor(options: CascadedShadowMapsOptions) {
    const size = options.size ?? 1024;
    const bias = options.bias ?? 0.001;
    const label = options.label ?? "csm";
    this.cascades = CascadedShadowMaps.computeSplits(options).map((split) => ({
      index: split.index,
      split,
      shadowMap: new ShadowMap({ size, bias, label: `${label}-cascade-${split.index}` })
    }));
  }

  static computeSplits(options: CascadeSplitOptions): readonly CascadeSplit[] {
    const { cascadeCount, near, far, lambda = 0.5 } = options;
    if (!Number.isInteger(cascadeCount) || cascadeCount <= 0) {
      throw new Error("Cascade count must be a positive integer");
    }
    if (near <= 0 || far <= near) {
      throw new Error("Cascade near/far range is invalid");
    }
    if (lambda < 0 || lambda > 1) {
      throw new Error("Cascade lambda must be between 0 and 1");
    }

    const splits: CascadeSplit[] = [];
    let previous = near;
    for (let index = 1; index <= cascadeCount; index += 1) {
      const ratio = index / cascadeCount;
      const logarithmic = near * (far / near) ** ratio;
      const uniform = near + (far - near) * ratio;
      const cascadeFar = index === cascadeCount ? far : lambda * logarithmic + (1 - lambda) * uniform;
      splits.push({
        index: index - 1,
        near: previous,
        far: cascadeFar
      });
      previous = cascadeFar;
    }
    return splits;
  }

  get cascadeCount(): number {
    return this.cascades.length;
  }

  getCascades(): readonly ShadowCascade[] {
    return this.cascades;
  }

  resize(size: number): CascadedShadowMaps {
    const first = this.cascades[0];
    if (!first) {
      throw new Error("Cannot resize cascaded shadow maps without cascades");
    }
    const resized = Object.create(CascadedShadowMaps.prototype) as CascadedShadowMaps;
    Object.assign(resized, {
      cascades: this.cascades.map((cascade) => ({
        index: cascade.index,
        split: cascade.split,
        shadowMap: cascade.shadowMap.resize(size)
      }))
    });
    return resized;
  }

  dispose(): void {
    for (const cascade of this.cascades) {
      cascade.shadowMap.dispose();
    }
  }
}

export interface CascadedShadowPassOptions {
  readonly light: Light | null;
  readonly casters: readonly RenderItem[];
  readonly cascades: CascadedShadowMaps;
  readonly shaderLibrary?: ShaderLibrary;
}

export interface CascadeShadowPassResult {
  readonly index: number;
  readonly split: CascadeSplit;
  readonly rendered: boolean;
  readonly reason: ShadowPassReason;
  readonly casterCount: number;
  readonly skippedTransparentCasters: number;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly shadowMap: ShadowMap;
}

export interface CascadedShadowPassResult {
  readonly rendered: boolean;
  readonly cascades: readonly CascadeShadowPassResult[];
}

export class CascadedShadowPass {
  private lastResult: CascadedShadowPassResult | null = null;

  constructor(private readonly options: CascadedShadowPassOptions) {}

  execute(context: RenderPassContext): CascadedShadowPassResult {
    const cascadeResults = this.options.cascades.getCascades().map((cascade) => {
      const shadowPass = new ShadowPass({
        light: this.options.light,
        casters: this.options.casters,
        shadowMap: cascade.shadowMap,
        ...(this.options.shaderLibrary ? { shaderLibrary: this.options.shaderLibrary } : {})
      });
      const result = shadowPass.execute(context);
      return {
        index: cascade.index,
        split: cascade.split,
        rendered: result.rendered,
        reason: result.reason,
        casterCount: result.casterCount,
        skippedTransparentCasters: result.skippedTransparentCasters,
        diagnostics: result.diagnostics,
        shadowMap: cascade.shadowMap
      };
    });
    this.lastResult = {
      rendered: cascadeResults.length > 0 && cascadeResults.every((cascade) => cascade.rendered),
      cascades: cascadeResults
    };
    return this.lastResult;
  }

  getLastResult(): CascadedShadowPassResult | null {
    return this.lastResult;
  }
}

export function supportsCascadedShadowLight(light: Light | null): light is DirectionalLight {
  return light instanceof DirectionalLight && light.visible && light.castsShadow;
}
