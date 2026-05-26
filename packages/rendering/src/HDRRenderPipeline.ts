import { RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";
import { ToneMappingPass, type BloomOptions } from "./PostProcessPass";
import { createExternalParityColorManagementPolicy, type A3DColorManagementPolicy } from "./ColorManagement";
import { createExternalParityToneMappingPolicy, type ExternalParityToneMappingIntent, type ExternalParityToneMappingPolicy } from "./ToneMapping";

export type ExternalParityHdrRenderTargetFormat = "rgba16f" | "rgba32f" | "rgba8";
export type ExternalParityHdrPipelineMode = "hdr" | "ldr-fallback";

export interface ExternalParityHdrPipelineDescriptor {
  readonly width: number;
  readonly height: number;
  readonly intent?: ExternalParityToneMappingIntent;
  readonly preferredFormat?: Extract<ExternalParityHdrRenderTargetFormat, "rgba16f" | "rgba32f">;
  readonly allowLdrFallback?: boolean;
  readonly bloom?: BloomOptions | false;
}

export interface ExternalParityHdrPipeline {
  readonly mode: ExternalParityHdrPipelineMode;
  readonly format: ExternalParityHdrRenderTargetFormat;
  readonly colorTarget: RenderTarget;
  readonly displayTarget: RenderTarget;
  readonly colorManagement: A3DColorManagementPolicy;
  readonly toneMapping: ExternalParityToneMappingPolicy;
  readonly bloom: BloomOptions | false;
  readonly warnings: readonly string[];
}

export function createExternalParityHdrPipeline(device: RenderDevice, descriptor: ExternalParityHdrPipelineDescriptor): ExternalParityHdrPipeline {
  validateDimensions(descriptor.width, descriptor.height);
  const colorManagement = createExternalParityColorManagementPolicy({
    outputColorSpace: "srgb",
    allowLdrFallback: descriptor.allowLdrFallback ?? true
  });
  const toneMapping = createExternalParityToneMappingPolicy(descriptor.intent ?? "product-catalog");
  const capabilities = new Set(device.info.capabilities ?? []);
  const supportsHdr = capabilities.has("hdr-render-targets") || device.kind === "mock";
  const preferredFormat = descriptor.preferredFormat ?? "rgba16f";
  const allowLdrFallback = descriptor.allowLdrFallback ?? true;
  const format: ExternalParityHdrRenderTargetFormat = supportsHdr ? preferredFormat : "rgba8";
  if (!supportsHdr && !allowLdrFallback) {
    throw new RenderDeviceError("ExternalParity HDR pipeline requires HDR render targets or an explicit LDR fallback.", "EXTERNAL_PARITY_HDR_UNSUPPORTED", {
      backend: device.kind
    });
  }

  const colorTarget = device.createRenderTarget({
    width: descriptor.width,
    height: descriptor.height,
    label: "external-parity-hdr-color",
    format,
    depth: "texture"
  });
  const displayTarget = device.createRenderTarget({
    width: descriptor.width,
    height: descriptor.height,
    label: "external-parity-display-color",
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

export function executeExternalParityToneMapPass(device: RenderDevice, pipeline: ExternalParityHdrPipeline): ToneMappingPass {
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
    throw new Error("ExternalParity HDR pipeline dimensions must be positive integers.");
  }
}
