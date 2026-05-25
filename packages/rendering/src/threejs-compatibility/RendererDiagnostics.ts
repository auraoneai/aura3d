export type V5RendererBackend = "webgl2" | "webgpu" | "mock";
export type V5RendererSupportState = "supported" | "fallback" | "partial" | "unsupported";

export interface V5RendererFeatureStatus {
  readonly feature: string;
  readonly state: V5RendererSupportState;
  readonly detail: string;
}

export interface V5RendererDiagnostics {
  readonly backend: V5RendererBackend;
  readonly features: readonly V5RendererFeatureStatus[];
  readonly cpuTimingAvailable: boolean;
  readonly gpuTimingAvailable: boolean;
  readonly screenshotCapture: boolean;
  readonly resizeHandling: boolean;
  readonly deviceLossHandling: boolean;
  readonly warnings: readonly string[];
}

export const V5_REQUIRED_RENDERER_FEATURES = [
  "perspective-camera",
  "orthographic-camera",
  "environment-capture",
  "directional-light",
  "point-light",
  "spot-light",
  "hemisphere-light",
  "ambient-light",
  "rect-area-light",
  "opaque-material",
  "alpha-test-material",
  "alpha-blend-material",
  "transmissive-material",
  "double-sided-material",
  "multiple-render-targets",
  "depth-textures",
  "hdr-render-targets",
  "webgl2-backend",
  "webgpu-status",
  "render-target-resize",
  "screenshot-capture",
  "timing-diagnostics",
  "device-loss-handling"
] as const;

export function summarizeV5RendererDiagnostics(diagnostics: V5RendererDiagnostics) {
  const missing = V5_REQUIRED_RENDERER_FEATURES.filter((feature) => {
    const status = diagnostics.features.find((item) => item.feature === feature);
    return !status || status.state === "unsupported";
  });
  const partial = diagnostics.features.filter((item) => item.state === "partial" || item.state === "fallback").map((item) => item.feature);
  return {
    backend: diagnostics.backend,
    featureCount: diagnostics.features.length,
    missing,
    partial,
    warningCount: diagnostics.warnings.length,
    canClaimRendererBreadth: missing.length === 0 && diagnostics.screenshotCapture && diagnostics.resizeHandling && diagnostics.deviceLossHandling
  };
}
