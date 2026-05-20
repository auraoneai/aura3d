import type { RenderDevice, RenderDeviceCapability } from "../RenderDevice";

export type CinematicCapabilityStatus = "implemented" | "conditional" | "unsupported";
export type CinematicCapabilityArea = "postprocess" | "camera" | "timeline";

export type CinematicPostProcessEffectId =
  | "bloom"
  | "fxaa"
  | "depth-of-field"
  | "motion-blur"
  | "ambient-occlusion"
  | "outline"
  | "lut"
  | "film-grain"
  | "render-layers-aov";

export type CinematicDiagnosticId =
  | CinematicPostProcessEffectId
  | "cinematic-camera-auto-frame"
  | "cinematic-camera-shot-timeline";

export interface CinematicCapabilityEntry {
  readonly id: CinematicDiagnosticId;
  readonly label: string;
  readonly area: CinematicCapabilityArea;
  readonly status: CinematicCapabilityStatus;
  readonly implementedPass?: string;
  readonly implementation: string;
  readonly rendererOwned: boolean;
  readonly publicPixelKernel: boolean;
  readonly requiredCapabilities: readonly RenderDeviceCapability[];
  readonly requiredInputs: readonly string[];
  readonly evidence: readonly string[];
  readonly limitations: readonly string[];
}

export interface CinematicDiagnosticsBackendInfo {
  readonly backend?: string;
  readonly capabilities?: readonly RenderDeviceCapability[];
  readonly limitations?: readonly string[];
}

export interface CinematicDiagnosticsReport {
  readonly backend: string;
  readonly capabilities: readonly RenderDeviceCapability[];
  readonly postprocess: readonly CinematicCapabilityEntry[];
  readonly camera: readonly CinematicCapabilityEntry[];
  readonly timeline: readonly CinematicCapabilityEntry[];
  readonly summary: {
    readonly implemented: readonly CinematicDiagnosticId[];
    readonly conditional: readonly CinematicDiagnosticId[];
    readonly unsupported: readonly CinematicDiagnosticId[];
  };
  readonly claimGuidance: readonly string[];
}

export type CinematicPostprocessClarityStatus = "clear" | "watch" | "risk";
export type CinematicPostprocessClaritySeverity = "info" | "warning" | "failure";
export type CinematicPostprocessClarityFindingId =
  | "washed-out-tone"
  | "noisy-bloom"
  | "film-grain-noise"
  | "soft-detail"
  | "detail-margin"
  | "conditional-input-missing"
  | "unsupported-pass-request";

export interface CinematicPostprocessClarityFinding {
  readonly id: CinematicPostprocessClarityFindingId;
  readonly severity: CinematicPostprocessClaritySeverity;
  readonly evidence: string;
  readonly mitigation: string;
}

export interface CinematicPostprocessFrameMetrics {
  readonly averageLuma?: number;
  readonly meanLuma?: number;
  readonly localContrast?: number;
  readonly localContrastRatio?: number;
  readonly detailEdgeDensity?: number;
  readonly edgePixelRatio?: number;
  readonly uniqueColorBuckets?: number;
  readonly colorBuckets?: number;
  readonly foregroundCoverage?: number;
}

export interface CinematicPostprocessPipelineDescriptor {
  readonly passNames?: readonly string[];
  readonly targetFormat?: string;
  readonly toneMapping?: {
    readonly exposure?: number;
    readonly whitePoint?: number;
    readonly gamma?: number;
    readonly operator?: string;
  } | false;
  readonly colorGrade?: {
    readonly contrast?: number;
    readonly saturation?: number;
    readonly vibrance?: number;
    readonly vignette?: number;
    readonly sharpening?: number;
  } | boolean | false;
  readonly bloom?: {
    readonly threshold?: number;
    readonly intensity?: number;
    readonly radius?: number;
  } | boolean | false;
  readonly filmGrain?: {
    readonly intensity?: number;
  } | boolean | false;
  readonly fxaa?: {
    readonly edgeThreshold?: number;
    readonly subpixelBlend?: number;
  } | boolean | false;
  readonly depthOfField?: {
    readonly depth?: unknown;
  } | boolean | false;
  readonly motionBlur?: {
    readonly velocity?: unknown;
  } | boolean | false;
  readonly ssao?: {
    readonly depth?: unknown;
  } | boolean | false;
}

export interface CinematicPostprocessClarityInput {
  readonly pipeline?: CinematicPostprocessPipelineDescriptor;
  readonly frameMetrics?: CinematicPostprocessFrameMetrics;
}

export interface CinematicPostprocessClarityReport {
  readonly status: CinematicPostprocessClarityStatus;
  readonly score: number;
  readonly activePasses: readonly string[];
  readonly findings: readonly CinematicPostprocessClarityFinding[];
  readonly unsupportedRequested: readonly string[];
  readonly conditionalMissingInputs: readonly string[];
  readonly claimGuidance: readonly string[];
}

export const CINEMATIC_POSTPROCESS_EFFECT_IDS: readonly CinematicPostProcessEffectId[] = [
  "bloom",
  "fxaa",
  "depth-of-field",
  "motion-blur",
  "ambient-occlusion",
  "outline",
  "lut",
  "film-grain",
  "render-layers-aov"
];

export function analyzeCinematicPostprocessClarity(input: CinematicPostprocessClarityInput): CinematicPostprocessClarityReport {
  const pipeline = input.pipeline ?? {};
  const metrics = input.frameMetrics ?? {};
  const activePasses = normalizeActivePasses(pipeline);
  const activePassSet = new Set(activePasses);
  const findings: CinematicPostprocessClarityFinding[] = [];
  const unsupportedRequested: string[] = [];
  const conditionalMissingInputs: string[] = [];
  const averageLuma = metrics.averageLuma ?? metrics.meanLuma;
  const localContrast = metrics.localContrast;
  const localContrastRatio = metrics.localContrastRatio;
  const detailEdgeDensity = metrics.detailEdgeDensity ?? metrics.edgePixelRatio;
  const uniqueColorBuckets = metrics.uniqueColorBuckets ?? metrics.colorBuckets;

  const toneMapping = typeof pipeline.toneMapping === "object" && pipeline.toneMapping !== null ? pipeline.toneMapping : undefined;
  const colorGrade = typeof pipeline.colorGrade === "object" && pipeline.colorGrade !== null ? pipeline.colorGrade : undefined;
  if (
    (averageLuma !== undefined && averageLuma >= 180 && (localContrast === undefined || localContrast < 24))
    || (localContrastRatio !== undefined && localContrastRatio < 0.045 && averageLuma !== undefined && averageLuma >= 150)
    || ((toneMapping?.exposure ?? 1) > 1.55 && (toneMapping?.whitePoint ?? 1) < 1.15)
    || ((colorGrade?.contrast ?? 1) < 0.82 && (colorGrade?.saturation ?? 1) > 1.22)
  ) {
    findings.push({
      id: "washed-out-tone",
      severity: "warning",
      evidence: summarizeMetricEvidence({
        averageLuma,
        localContrast,
        localContrastRatio,
        exposure: toneMapping?.exposure,
        whitePoint: toneMapping?.whitePoint,
        contrast: colorGrade?.contrast,
        saturation: colorGrade?.saturation
      }),
      mitigation: "Lower exposure or saturation, raise whitePoint/contrast, and validate the route with local contrast or histogram evidence."
    });
  }

  const bloom = typeof pipeline.bloom === "object" && pipeline.bloom !== null
    ? pipeline.bloom
    : pipeline.bloom === true || activePassSet.has("bloom")
      ? {}
      : undefined;
  if (bloom) {
    const threshold = bloom.threshold ?? 0.75;
    const intensity = bloom.intensity ?? 0.35;
    const radius = bloom.radius ?? 1;
    if (threshold < 0.48 || intensity > 0.62 || radius > 3) {
      findings.push({
        id: "noisy-bloom",
        severity: intensity > 0.8 || threshold < 0.32 || radius > 5 ? "failure" : "warning",
        evidence: `bloom threshold=${round3(threshold)}, intensity=${round3(intensity)}, radius=${round3(radius)}`,
        mitigation: "Use a higher bloom threshold, lower intensity/radius, or keep bloom opt-in until halo artifacts are bounded by screenshot evidence."
      });
    }
  }

  const filmGrain = typeof pipeline.filmGrain === "object" && pipeline.filmGrain !== null
    ? pipeline.filmGrain
    : pipeline.filmGrain === true || activePassSet.has("film-grain")
      ? {}
      : undefined;
  if (filmGrain) {
    const intensity = filmGrain.intensity ?? 0.08;
    if (intensity >= 0.06) {
      findings.push({
        id: "film-grain-noise",
        severity: intensity > 0.14 ? "failure" : "warning",
        evidence: `filmGrain intensity=${round3(intensity)}`,
        mitigation: "Use film grain only when the route intentionally proves it; keep deterministic default captures grain-free for clarity gates."
      });
    }
  }

  if (
    (detailEdgeDensity !== undefined && detailEdgeDensity < 0.035)
    || (localContrast !== undefined && localContrast < 28 && detailEdgeDensity !== undefined && detailEdgeDensity < 0.045)
    || (uniqueColorBuckets !== undefined && uniqueColorBuckets < 160)
  ) {
    findings.push({
      id: "soft-detail",
      severity: "warning",
      evidence: summarizeMetricEvidence({ detailEdgeDensity, localContrast, uniqueColorBuckets }),
      mitigation: "Add purposeful authored or procedural edges, improve material contrast, and avoid compensating with grain or fake blur."
    });
  } else if (detailEdgeDensity !== undefined && detailEdgeDensity < 0.04) {
    findings.push({
      id: "detail-margin",
      severity: "info",
      evidence: `detailEdgeDensity=${round6(detailEdgeDensity)} is above the 0.035 floor but still close enough to track.`,
      mitigation: "Keep future clarity changes purposeful and rerun screenshot metrics after camera or postprocess changes."
    });
  }

  if (activePassSet.has("depth-of-field") || pipeline.depthOfField) {
    const depthOfField = typeof pipeline.depthOfField === "object" && pipeline.depthOfField !== null ? pipeline.depthOfField : undefined;
    if (!depthOfField?.depth) {
      conditionalMissingInputs.push("depth-of-field:depth");
      findings.push({
        id: "conditional-input-missing",
        severity: "warning",
        evidence: "depth-of-field is requested without a depth texture binding in the pipeline descriptor.",
        mitigation: "Only claim DOF when a real depth input is supplied or renderer-owned depth readback is documented."
      });
    }
  }
  if (activePassSet.has("motion-blur") || pipeline.motionBlur) {
    const motionBlur = typeof pipeline.motionBlur === "object" && pipeline.motionBlur !== null ? pipeline.motionBlur : undefined;
    if (!motionBlur?.velocity) {
      conditionalMissingInputs.push("motion-blur:velocity");
      findings.push({
        id: "conditional-input-missing",
        severity: "warning",
        evidence: "motion-blur is requested without a velocity buffer in the pipeline descriptor.",
        mitigation: "Only claim motion blur when real per-pixel velocity data is supplied; the forward renderer does not generate a velocity AOV."
      });
    }
  }
  if (activePassSet.has("ssao") || activePassSet.has("ambient-occlusion") || pipeline.ssao) {
    const ssao = typeof pipeline.ssao === "object" && pipeline.ssao !== null ? pipeline.ssao : undefined;
    if (!ssao?.depth) {
      conditionalMissingInputs.push("ssao:depth");
      findings.push({
        id: "conditional-input-missing",
        severity: "warning",
        evidence: "SSAO/ambient occlusion is requested without a depth texture binding in the pipeline descriptor.",
        mitigation: "Only claim SSAO when a real depth input is supplied or renderer-owned depth readback is documented."
      });
    }
  }

  for (const unsupported of ["lut", "aov", "render-layers-aov", "render-layer", "object-id-outline"]) {
    if (!activePassSet.has(unsupported)) continue;
    unsupportedRequested.push(unsupported);
  }
  if (unsupportedRequested.length > 0) {
    findings.push({
      id: "unsupported-pass-request",
      severity: "failure",
      evidence: `unsupported requested: ${unsupportedRequested.join(", ")}`,
      mitigation: "Remove unsupported pass claims or add real renderer support before exposing the route as parity evidence."
    });
  }

  const score = clampScore(100 - findings.reduce((total, finding) => total + severityPenalty(finding.severity), 0));
  return {
    status: findings.some((finding) => finding.severity === "failure")
      ? "risk"
      : findings.some((finding) => finding.severity === "warning")
        ? "watch"
        : "clear",
    score,
    activePasses,
    findings,
    unsupportedRequested,
    conditionalMissingInputs,
    claimGuidance: [
      "Use this report to separate image-quality risks from implemented-pass claims.",
      "Noise or washed-out findings should be fixed with bounded post settings or authored visual structure, not fake DOF, motion blur, LUT, or AOV claims.",
      "Conditional input findings mean the pass exists but the current pipeline descriptor did not prove the required depth or velocity input."
    ]
  };
}

export function createCinematicDiagnosticsReport(input: RenderDevice | CinematicDiagnosticsBackendInfo = {}): CinematicDiagnosticsReport {
  const backendInfo = normalizeBackendInfo(input);
  const capabilities = [...(backendInfo.capabilities ?? [])];
  const capabilitySet = new Set<RenderDeviceCapability>(capabilities);
  const supportsCorePostprocess = hasCorePostprocessCapabilities(capabilitySet);
  const supportsDepthTexture = capabilitySet.has("depth-textures");
  const supportsHdrTargets = capabilitySet.has("hdr-render-targets");
  const supportsFloatReadback = capabilitySet.has("float-readback");

  const postprocess: CinematicCapabilityEntry[] = [
    {
      id: "bloom",
      label: "Bloom",
      area: "postprocess",
      status: supportsCorePostprocess ? "implemented" : "unsupported",
      implementedPass: "bloom",
      implementation: "RendererPostProcessOptions.bloom, BloomPass, bloomPixels, and HDR bloomFloatPixels.",
      rendererOwned: true,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback"],
      requiredInputs: [],
      evidence: [
        "Renderer pass catalog includes bloom.",
        "PostProcessComposer accepts a bloom pass.",
        supportsHdrTargets && supportsFloatReadback
          ? "Backend can run HDR bloom paths with float render-target readback."
          : "LDR bloom is available; HDR bloom needs hdr-render-targets and float-readback."
      ],
      limitations: supportsCorePostprocess
        ? []
        : missingCorePostprocessReasons(capabilitySet)
    },
    {
      id: "fxaa",
      label: "FXAA",
      area: "postprocess",
      status: supportsCorePostprocess ? "implemented" : "unsupported",
      implementedPass: "fxaa",
      implementation: "RendererPostProcessOptions.fxaa, FXAAPass, and fxaaPixels.",
      rendererOwned: true,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback"],
      requiredInputs: [],
      evidence: [
        "Renderer pass catalog includes fxaa.",
        "PostProcessComposer accepts an fxaa pass."
      ],
      limitations: supportsCorePostprocess
        ? []
        : missingCorePostprocessReasons(capabilitySet)
    },
    {
      id: "depth-of-field",
      label: "Depth Of Field",
      area: "postprocess",
      status: supportsCorePostprocess ? "conditional" : "unsupported",
      implementedPass: "depth-of-field",
      implementation: "depthOfFieldPixels with caller-provided depth, or renderer-owned depth when the backend exposes depth textures/readback.",
      rendererOwned: supportsDepthTexture,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback", "depth-textures"],
      requiredInputs: ["DepthTextureBinding or renderer-owned sampleable depth texture."],
      evidence: [
        "Renderer pass catalog includes depth-of-field.",
        "PostProcessComposer accepts a depth-of-field pass with explicit depth options."
      ],
      limitations: [
        ...missingCorePostprocessReasons(capabilitySet),
        ...(supportsDepthTexture ? [] : ["Renderer-owned DOF injection is unavailable without depth-textures; callers may still provide a depth binding to the pixel kernel."]),
        "The renderer does not synthesize fake DOF; depth data is required for a meaningful pass."
      ]
    },
    {
      id: "motion-blur",
      label: "Motion Blur",
      area: "postprocess",
      status: supportsCorePostprocess ? "conditional" : "unsupported",
      implementedPass: "motion-blur",
      implementation: "motionBlurPixels samples along caller-provided velocity vectors.",
      rendererOwned: false,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback"],
      requiredInputs: ["Per-pixel velocity Float32Array with width * height * 2 values."],
      evidence: [
        "Renderer pass catalog includes motion-blur.",
        "PostProcessComposer accepts a motion-blur pass with explicit velocity options."
      ],
      limitations: [
        ...missingCorePostprocessReasons(capabilitySet),
        "The forward renderer does not generate a velocity AOV; callers must supply velocity data."
      ]
    },
    {
      id: "ambient-occlusion",
      label: "Ambient Occlusion",
      area: "postprocess",
      status: supportsCorePostprocess ? "conditional" : "unsupported",
      implementedPass: "ssao",
      implementation: "ssaoPixels implements a bounded screen-space ambient occlusion approximation from depth.",
      rendererOwned: supportsDepthTexture,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback", "depth-textures"],
      requiredInputs: ["DepthTextureBinding or renderer-owned sampleable depth texture."],
      evidence: [
        "Renderer pass catalog includes ssao.",
        "PostProcessComposer accepts an ssao pass with explicit depth options."
      ],
      limitations: [
        ...missingCorePostprocessReasons(capabilitySet),
        ...(supportsDepthTexture ? [] : ["Renderer-owned SSAO injection is unavailable without depth-textures; callers may still provide a depth binding to the pixel kernel."]),
        "This is SSAO only; GTAO, HBAO, baked AO generation, and material occlusion-map authoring are separate features."
      ]
    },
    {
      id: "outline",
      label: "Outline",
      area: "postprocess",
      status: supportsCorePostprocess ? "implemented" : "unsupported",
      implementedPass: "outline",
      implementation: "outlinePixels uses luma Sobel edges with configurable color, width, threshold, and opacity.",
      rendererOwned: true,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback"],
      requiredInputs: [],
      evidence: [
        "Renderer pass catalog includes outline.",
        "PostProcessComposer accepts an outline pass."
      ],
      limitations: [
        ...missingCorePostprocessReasons(capabilitySet),
        "Current outline is image/luma based; object-ID, normal/depth edge, and selected-object outline layers require render layer or AOV support."
      ]
    },
    {
      id: "lut",
      label: "LUT",
      area: "postprocess",
      status: "unsupported",
      implementation: "No 2D or 3D LUT postprocess pass is exposed.",
      rendererOwned: false,
      publicPixelKernel: false,
      requiredCapabilities: [],
      requiredInputs: ["A LUT texture or table would be required by a future pass."],
      evidence: [
        "Tone mapping and color-grade passes exist, but they are parameterized math passes rather than LUT sampling passes."
      ],
      limitations: [
        "Do not claim LUT parity from tone mapping or color-grade controls."
      ]
    },
    {
      id: "film-grain",
      label: "Film Grain",
      area: "postprocess",
      status: supportsCorePostprocess ? "implemented" : "unsupported",
      implementedPass: "film-grain",
      implementation: "filmGrainPixels applies deterministic seeded grain.",
      rendererOwned: true,
      publicPixelKernel: true,
      requiredCapabilities: ["render-targets", "postprocess-presentation", "pixel-readback"],
      requiredInputs: [],
      evidence: [
        "Renderer pass catalog includes film-grain.",
        "PostProcessComposer accepts a film-grain pass."
      ],
      limitations: supportsCorePostprocess
        ? ["Film grain is a deterministic pixel pass, not camera sensor simulation."]
        : missingCorePostprocessReasons(capabilitySet)
    },
    {
      id: "render-layers-aov",
      label: "Render Layers / AOV",
      area: "postprocess",
      status: "unsupported",
      implementation: "No public render layer, AOV, g-buffer, object-ID, normal, material-ID, or velocity render-output contract is exposed.",
      rendererOwned: false,
      publicPixelKernel: false,
      requiredCapabilities: [],
      requiredInputs: ["Future support would need explicit render-output descriptors and pass wiring."],
      evidence: [
        "The renderer exposes a forward color target and optional depth texture for selected depth-aware postprocess passes."
      ],
      limitations: [
        "Do not claim render layers, AOV compositing, object-ID outlines, or renderer-generated velocity motion blur."
      ]
    }
  ];

  const camera: CinematicCapabilityEntry[] = [
    {
      id: "cinematic-camera-auto-frame",
      label: "Cinematic Camera Framing",
      area: "camera",
      status: "implemented",
      implementedPass: "computePerspectiveCameraFrame",
      implementation: "computePerspectiveCameraFrame plus Renderer cameraPolicy='auto-frame' support deterministic fit-to-bounds camera frames.",
      rendererOwned: true,
      publicPixelKernel: false,
      requiredCapabilities: [],
      requiredInputs: ["Bounds, viewport, and optional FOV/yaw/pitch/padding settings."],
      evidence: [
        "CameraFraming.ts exports computePerspectiveCameraFrame.",
        "Renderer resolves cameraFrameBounds/cameraFrameOptions for auto-frame sources."
      ],
      limitations: [
        "This is deterministic camera framing, not a full cinematic shot/timeline editor."
      ]
    }
  ];

  const timeline: CinematicCapabilityEntry[] = [
    {
      id: "cinematic-camera-shot-timeline",
      label: "Cinematic Camera Timeline",
      area: "timeline",
      status: "unsupported",
      implementation: "No renderer-owned shot timeline, keyframed cinematic camera track, or timeline diagnostics report is exposed.",
      rendererOwned: false,
      publicPixelKernel: false,
      requiredCapabilities: [],
      requiredInputs: ["A future feature would need camera keyframes, interpolation policy, clip duration, and sampled-frame diagnostics."],
      evidence: [
        "Renderer.startAnimationLoop runs callbacks, but it is not a timeline system."
      ],
      limitations: [
        "Do not claim cinematic camera timeline support from auto-frame camera helpers or animation-loop callbacks alone."
      ]
    }
  ];

  const allEntries = [...postprocess, ...camera, ...timeline];
  return {
    backend: backendInfo.backend ?? "unknown",
    capabilities,
    postprocess,
    camera,
    timeline,
    summary: {
      implemented: idsWithStatus(allEntries, "implemented"),
      conditional: idsWithStatus(allEntries, "conditional"),
      unsupported: idsWithStatus(allEntries, "unsupported")
    },
    claimGuidance: [
      "Claim bloom, FXAA, outline, film grain, tone mapping, and color grading only as implemented postprocess passes when the backend exposes the required render-target, presentation, and readback capabilities.",
      "Claim DOF and SSAO only when valid depth data is supplied or renderer-owned depth texture readback is available.",
      "Claim motion blur only when a real velocity buffer is supplied; the renderer does not generate velocity AOVs.",
      "Do not claim LUT, render layers/AOV, object-ID outlines, or a cinematic camera shot timeline from the current renderer diagnostics."
    ]
  };
}

function normalizeBackendInfo(input: RenderDevice | CinematicDiagnosticsBackendInfo): CinematicDiagnosticsBackendInfo {
  if (isRenderDevice(input)) {
    return {
      backend: input.info.backend,
      capabilities: input.info.capabilities,
      limitations: input.info.limitations
    };
  }
  return input;
}

function isRenderDevice(input: RenderDevice | CinematicDiagnosticsBackendInfo): input is RenderDevice {
  return typeof (input as RenderDevice).info === "object" && (input as RenderDevice).info !== null;
}

function hasCorePostprocessCapabilities(capabilities: ReadonlySet<RenderDeviceCapability>): boolean {
  return capabilities.has("render-targets")
    && capabilities.has("postprocess-presentation")
    && capabilities.has("pixel-readback");
}

function missingCorePostprocessReasons(capabilities: ReadonlySet<RenderDeviceCapability>): readonly string[] {
  const reasons: string[] = [];
  if (!capabilities.has("render-targets")) reasons.push("Backend lacks render-targets.");
  if (!capabilities.has("postprocess-presentation")) reasons.push("Backend lacks postprocess-presentation.");
  if (!capabilities.has("pixel-readback")) reasons.push("Current CPU/reference postprocess kernels require pixel-readback.");
  return reasons;
}

function idsWithStatus(entries: readonly CinematicCapabilityEntry[], status: CinematicCapabilityStatus): readonly CinematicDiagnosticId[] {
  return entries.filter((entry) => entry.status === status).map((entry) => entry.id);
}

function normalizeActivePasses(pipeline: CinematicPostprocessPipelineDescriptor): readonly string[] {
  const names = new Set<string>();
  for (const passName of pipeline.passNames ?? []) {
    if (passName.trim().length > 0) names.add(passName.trim());
  }
  if (pipeline.toneMapping && !names.has("tone-mapping")) names.add("tone-mapping");
  if (pipeline.colorGrade && !names.has("color-grade")) names.add("color-grade");
  if (pipeline.bloom && !names.has("bloom")) names.add("bloom");
  if (pipeline.filmGrain && !names.has("film-grain")) names.add("film-grain");
  if (pipeline.fxaa && !names.has("fxaa")) names.add("fxaa");
  if (pipeline.depthOfField && !names.has("depth-of-field")) names.add("depth-of-field");
  if (pipeline.motionBlur && !names.has("motion-blur")) names.add("motion-blur");
  if (pipeline.ssao && !names.has("ssao")) names.add("ssao");
  return [...names];
}

function summarizeMetricEvidence(metrics: Readonly<Record<string, number | undefined>>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (value === undefined || !Number.isFinite(value)) continue;
    parts.push(`${key}=${Math.abs(value) < 1 ? round6(value) : round3(value)}`);
  }
  return parts.length > 0 ? parts.join(", ") : "No numeric frame metrics supplied.";
}

function severityPenalty(severity: CinematicPostprocessClaritySeverity): number {
  if (severity === "failure") return 34;
  if (severity === "warning") return 16;
  return 3;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round6(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}
