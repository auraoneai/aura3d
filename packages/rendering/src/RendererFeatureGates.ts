import { type RenderDevice, RenderDeviceError, type RenderDeviceInfo } from "./RenderDevice";

export type RendererFeature =
  | "basic-rendering"
  | "render-targets"
  | "pixel-readback"
  | "postprocess-ldr"
  | "bounded-pbr-materials"
  | "shadow-maps"
  | "contact-shadows"
  | "spot-shadow-maps"
  | "point-shadow-maps"
  | "depth-textures"
  | "hdr-render-targets"
  | "hdr-image-based-lighting"
  | "production-pbr-parity"
  | "gpu-timing"
  | "webgpu-compute";

export interface RendererFeatureStatus {
  readonly feature: RendererFeature;
  readonly supported: boolean;
  readonly reason?: string;
}

export interface RendererFeatureReport {
  readonly backend: RenderDeviceInfo["backend"];
  readonly supported: readonly RendererFeature[];
  readonly blocked: readonly RendererFeatureStatus[];
  readonly statuses: readonly RendererFeatureStatus[];
}

export function createRendererFeatureReport(device: Pick<RenderDevice, "info">): RendererFeatureReport {
  const capabilities = new Set<string>(device.info.capabilities ?? []);
  const statuses: RendererFeatureStatus[] = rendererFeatureCatalog().map((feature) => resolveFeatureStatus(feature, device.info, capabilities));
  return {
    backend: device.info.backend,
    supported: statuses.filter((status) => status.supported).map((status) => status.feature),
    blocked: statuses.filter((status) => !status.supported),
    statuses
  };
}

export function assertRendererFeatures(device: Pick<RenderDevice, "info">, requiredFeatures: readonly RendererFeature[]): RendererFeatureReport {
  const report = createRendererFeatureReport(device);
  const required = new Set(requiredFeatures);
  const missing = report.blocked.filter((status) => required.has(status.feature));
  if (missing.length > 0) {
    throw new RenderDeviceError("Renderer required features are unsupported", "UNSUPPORTED_RENDER_FEATURE", {
      backend: report.backend,
      missing: missing.map((status) => status.feature),
      reasons: Object.fromEntries(missing.map((status) => [status.feature, status.reason ?? "Unsupported by renderer backend."]))
    });
  }
  return report;
}

export function rendererFeatureCatalog(): readonly RendererFeature[] {
  return [
    "basic-rendering",
    "render-targets",
    "pixel-readback",
    "postprocess-ldr",
    "bounded-pbr-materials",
    "shadow-maps",
    "contact-shadows",
    "spot-shadow-maps",
    "point-shadow-maps",
    "depth-textures",
    "hdr-render-targets",
    "hdr-image-based-lighting",
    "production-pbr-parity",
    "gpu-timing",
    "webgpu-compute"
  ];
}

function resolveFeatureStatus(
  feature: RendererFeature,
  info: RenderDeviceInfo,
  capabilities: ReadonlySet<string>
): RendererFeatureStatus {
  if (feature === "basic-rendering") {
    return supportedIf(feature, capabilities.has("buffers") && capabilities.has("draw-validation"), "Backend lacks the buffer/draw contract required for visible rendering.");
  }
  if (feature === "render-targets") {
    return supportedIf(feature, capabilities.has("render-targets"), "Backend does not expose render targets.");
  }
  if (feature === "pixel-readback") {
    return supportedIf(feature, capabilities.has("pixel-readback"), "Backend does not expose pixel readback for visual tests.");
  }
  if (feature === "postprocess-ldr") {
    return supportedIf(
      feature,
      capabilities.has("render-targets") && capabilities.has("pixel-readback") && capabilities.has("postprocess-presentation"),
      "LDR postprocess requires render targets, pixel readback, and a backend presentation path."
    );
  }
  if (feature === "bounded-pbr-materials") {
    return supportedIf(
      feature,
      info.backend === "webgl2" || info.backend === "webgpu" || info.backend === "mock",
      "Backend does not support the bounded material shader path."
    );
  }
  if (feature === "shadow-maps") {
    return supportedIf(feature, capabilities.has("render-targets"), "Shadow maps require render-target-backed shadow passes.");
  }
  if (feature === "contact-shadows") {
    return supportedIf(feature, capabilities.has("contact-shadows"), "This backend does not expose renderer-owned contact-shadow support; callers must use shadow-map features or publish a visible no-contact-shadow limit.");
  }
  if (feature === "spot-shadow-maps") {
    return supportedIf(feature, capabilities.has("spot-shadow-maps"), "Projected spot shadow maps require renderer-owned shadow-map support.");
  }
  if (feature === "point-shadow-maps") {
    return supportedIf(feature, capabilities.has("point-shadow-maps"), "This backend does not expose point-light cubemap or atlas shadow-map support.");
  }
  if (feature === "depth-textures") {
    return supportedIf(
      feature,
      capabilities.has("depth-textures"),
      "Sampleable depth texture plumbing is not exposed by this backend; depth renderbuffers alone are insufficient for depth-aware postprocess."
    );
  }
  if (feature === "hdr-render-targets") {
    return supportedIf(feature, capabilities.has("hdr-render-targets"), "This backend does not expose HDR render targets; callers must use LDR targets or request a backend with float color-buffer support.");
  }
  if (feature === "hdr-image-based-lighting") {
    return supportedIf(feature, capabilities.has("hdr-image-based-lighting"), "This backend does not expose production HDR image-based-lighting resources, irradiance convolution, and specular prefiltering.");
  }
  if (feature === "production-pbr-parity") {
    return supportedIf(
      feature,
      capabilities.has("production-pbr-parity"),
      "Production PBR parity requires an explicit backend/report capability after external reference-scene comparisons pass; local HDR targets, color management, and IBL support alone are not enough."
    );
  }
  if (feature === "gpu-timing") {
    return supportedIf(feature, capabilities.has("gpu-timing"), "GPU timing is unavailable; callers must use CPU timing diagnostics.");
  }
  return supportedIf(
    feature,
    info.backend === "webgpu" && capabilities.has("webgpu-compute"),
    "WebGPU compute is unavailable on this backend or adapter."
  );
}

function supportedIf(feature: RendererFeature, supported: boolean, reason: string): RendererFeatureStatus {
  return supported ? { feature, supported: true } : { feature, supported: false, reason };
}
