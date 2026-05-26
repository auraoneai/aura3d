import { RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";
import { ToneMappingPass, type BloomOptions } from "./PostProcessPass";
import { createV4ColorManagementPolicy, type A3DColorManagementPolicy } from "./ColorManagement";
import { createV4ToneMappingPolicy, type V4ToneMappingIntent, type V4ToneMappingPolicy } from "./ToneMapping";

export type V4HdrRenderTargetFormat = "rgba16f" | "rgba32f" | "rgba8";
export type V4HdrPipelineMode = "hdr" | "ldr-fallback";

export interface V4HdrPipelineDescriptor {
  readonly width: number;
  readonly height: number;
  readonly intent?: V4ToneMappingIntent;
  readonly preferredFormat?: Extract<V4HdrRenderTargetFormat, "rgba16f" | "rgba32f">;
  readonly allowLdrFallback?: boolean;
  readonly bloom?: BloomOptions | false;
}

export interface V4HdrPipeline {
  readonly mode: V4HdrPipelineMode;
  readonly format: V4HdrRenderTargetFormat;
  readonly colorTarget: RenderTarget;
  readonly displayTarget: RenderTarget;
  readonly colorManagement: A3DColorManagementPolicy;
  readonly toneMapping: V4ToneMappingPolicy;
  readonly bloom: BloomOptions | false;
  readonly warnings: readonly string[];
}

export function createV4HdrPipeline(device: RenderDevice, descriptor: V4HdrPipelineDescriptor): V4HdrPipeline {
  validateDimensions(descriptor.width, descriptor.height);
  const colorManagement = createV4ColorManagementPolicy({
    outputColorSpace: "srgb",
    allowLdrFallback: descriptor.allowLdrFallback ?? true
  });
  const toneMapping = createV4ToneMappingPolicy(descriptor.intent ?? "product-catalog");
  const capabilities = new Set(device.info.capabilities ?? []);
  const supportsHdr = capabilities.has("hdr-render-targets") || device.kind === "mock";
  const preferredFormat = descriptor.preferredFormat ?? "rgba16f";
  const allowLdrFallback = descriptor.allowLdrFallback ?? true;
  const format: V4HdrRenderTargetFormat = supportsHdr ? preferredFormat : "rgba8";
  if (!supportsHdr && !allowLdrFallback) {
    throw new RenderDeviceError("V4 HDR pipeline requires HDR render targets or an explicit LDR fallback.", "V4_HDR_UNSUPPORTED", {
      backend: device.kind
    });
  }

  const colorTarget = device.createRenderTarget({
    width: descriptor.width,
    height: descriptor.height,
    label: "v4-hdr-color",
    format,
    depth: "texture"
  });
  const displayTarget = device.createRenderTarget({
    width: descriptor.width,
    height: descriptor.height,
    label: "v4-display-color",
    format: "rgba8"
  });

  return {
    mode: supportsHdr ? "hdr" : "ldr-fallback",
    format,
    colorTarget,
    displayTarget,
    colorManagement,
    toneMapping,
    bloom: descriptor.bloom ?? false,
    warnings: supportsHdr
      ? []
      : ["Backend does not expose HDR render targets; using LDR fallback with linear lighting policy and explicit tone mapping."]
  };
}

export function executeV4ToneMapPass(device: RenderDevice, pipeline: V4HdrPipeline): ToneMappingPass {
  const pass = new ToneMappingPass({
    source: pipeline.colorTarget,
    target: pipeline.displayTarget,
    exposure: pipeline.toneMapping.exposure,
    whitePoint: pipeline.toneMapping.whitePoint,
    gamma: pipeline.toneMapping.gamma,
    operator: pipeline.toneMapping.operator,
    inputColorSpace: pipeline.toneMapping.inputColorSpace,
    outputColorSpace: pipeline.toneMapping.outputColorSpace
  });
  pass.execute({ device, width: pipeline.colorTarget.width, height: pipeline.colorTarget.height });
  return pass;
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("V4 HDR pipeline dimensions must be positive integers.");
  }
}
