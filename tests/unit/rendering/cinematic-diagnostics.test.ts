import { describe, expect, it } from "vitest";
import {
  CINEMATIC_POSTPROCESS_EFFECT_IDS,
  MockRenderDevice,
  analyzeCinematicPostprocessClarity,
  createCinematicDiagnosticsReport,
  type CinematicCapabilityEntry
} from "../../../packages/rendering/src";

describe("cinematic postprocess diagnostics", () => {
  it("reports the advanced-gallery postprocess checklist with honest implemented, conditional, and unsupported states", () => {
    const report = createCinematicDiagnosticsReport(new MockRenderDevice());
    const byId = indexById(report.postprocess);

    expect(report.backend).toBe("mock");
    expect(report.postprocess.map((entry) => entry.id)).toEqual(CINEMATIC_POSTPROCESS_EFFECT_IDS);

    expect(byId.get("bloom")).toMatchObject({
      status: "implemented",
      implementedPass: "bloom",
      rendererOwned: true,
      publicPixelKernel: true
    });
    expect(byId.get("fxaa")).toMatchObject({
      status: "implemented",
      implementedPass: "fxaa",
      rendererOwned: true
    });
    expect(byId.get("film-grain")).toMatchObject({
      status: "implemented",
      implementedPass: "film-grain"
    });
    expect(byId.get("outline")).toMatchObject({
      status: "implemented",
      implementedPass: "outline"
    });

    expect(byId.get("depth-of-field")).toMatchObject({
      status: "conditional",
      implementedPass: "depth-of-field",
      rendererOwned: true
    });
    expect(byId.get("depth-of-field")?.requiredInputs.join(" ")).toContain("DepthTextureBinding");
    expect(byId.get("ambient-occlusion")).toMatchObject({
      status: "conditional",
      implementedPass: "ssao",
      rendererOwned: true
    });
    expect(byId.get("ambient-occlusion")?.limitations.join(" ")).toContain("SSAO only");
    expect(byId.get("motion-blur")).toMatchObject({
      status: "conditional",
      implementedPass: "motion-blur",
      rendererOwned: false
    });
    expect(byId.get("motion-blur")?.requiredInputs.join(" ")).toContain("velocity");
    expect(byId.get("motion-blur")?.limitations.join(" ")).toContain("does not generate a velocity AOV");

    expect(byId.get("lut")).toMatchObject({
      status: "unsupported",
      rendererOwned: false,
      publicPixelKernel: false
    });
    expect(byId.get("lut")?.limitations.join(" ")).toContain("Do not claim LUT parity");
    expect(byId.get("render-layers-aov")).toMatchObject({
      status: "unsupported",
      rendererOwned: false,
      publicPixelKernel: false
    });
    expect(byId.get("render-layers-aov")?.implementation).toContain("No public render layer");

    expect(report.summary.implemented).toEqual(expect.arrayContaining(["bloom", "fxaa", "outline", "film-grain", "cinematic-camera-auto-frame"]));
    expect(report.summary.conditional).toEqual(expect.arrayContaining(["depth-of-field", "motion-blur", "ambient-occlusion"]));
    expect(report.summary.unsupported).toEqual(expect.arrayContaining(["lut", "render-layers-aov", "cinematic-camera-shot-timeline"]));
    expect(report.claimGuidance.join(" ")).toContain("Do not claim LUT");
  });

  it("keeps renderer-owned depth effects conditional when depth textures are missing", () => {
    const report = createCinematicDiagnosticsReport({
      backend: "minimal-postprocess",
      capabilities: ["render-targets", "postprocess-presentation", "pixel-readback"]
    });
    const byId = indexById(report.postprocess);

    expect(byId.get("bloom")?.status).toBe("implemented");
    expect(byId.get("depth-of-field")).toMatchObject({
      status: "conditional",
      rendererOwned: false
    });
    expect(byId.get("depth-of-field")?.limitations.join(" ")).toContain("without depth-textures");
    expect(byId.get("ambient-occlusion")).toMatchObject({
      status: "conditional",
      rendererOwned: false
    });
  });

  it("marks postprocess effects unsupported when the backend lacks the core compositor contract", () => {
    const report = createCinematicDiagnosticsReport({
      backend: "no-readback",
      capabilities: ["render-targets", "postprocess-presentation"]
    });
    const byId = indexById(report.postprocess);

    expect(byId.get("bloom")?.status).toBe("unsupported");
    expect(byId.get("fxaa")?.limitations).toContain("Current CPU/reference postprocess kernels require pixel-readback.");
    expect(byId.get("depth-of-field")?.status).toBe("unsupported");
    expect(byId.get("lut")?.status).toBe("unsupported");
    expect(report.summary.unsupported).toEqual(expect.arrayContaining(["bloom", "fxaa", "depth-of-field", "lut", "render-layers-aov"]));
  });

  it("separates camera framing support from unsupported cinematic shot timelines", () => {
    const report = createCinematicDiagnosticsReport(new MockRenderDevice());

    expect(report.camera).toEqual([
      expect.objectContaining({
        id: "cinematic-camera-auto-frame",
        status: "implemented",
        implementedPass: "computePerspectiveCameraFrame"
      })
    ]);
    expect(report.camera[0]?.limitations.join(" ")).toContain("not a full cinematic shot/timeline editor");
    expect(report.timeline).toEqual([
      expect.objectContaining({
        id: "cinematic-camera-shot-timeline",
        status: "unsupported"
      })
    ]);
    expect(report.timeline[0]?.limitations.join(" ")).toContain("Do not claim cinematic camera timeline support");
  });

  it("classifies the current reactor-style post stack as clear while tracking detail margin", () => {
    const report = analyzeCinematicPostprocessClarity({
      pipeline: {
        passNames: ["tone-mapping", "color-grade", "fxaa"],
        targetFormat: "rgba8",
        toneMapping: { exposure: 1.08, whitePoint: 1.34, operator: "filmic" },
        colorGrade: { contrast: 1.08, saturation: 1.02, vignette: 0.28, sharpening: 0.04 },
        fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.55 },
        bloom: false,
        filmGrain: false
      },
      frameMetrics: {
        averageLuma: 41.328838,
        localContrast: 41.57372,
        detailEdgeDensity: 0.036471,
        uniqueColorBuckets: 559,
        foregroundCoverage: 0.522413
      }
    });

    expect(report.status).toBe("clear");
    expect(report.activePasses).toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(report.findings).toEqual([
      expect.objectContaining({
        id: "detail-margin",
        severity: "info"
      })
    ]);
    expect(report.unsupportedRequested).toEqual([]);
    expect(report.conditionalMissingInputs).toEqual([]);
    expect(report.findings.map((finding) => finding.id)).not.toEqual(expect.arrayContaining(["noisy-bloom", "film-grain-noise", "washed-out-tone"]));
  });

  it("flags noisy bloom, grain, washed-out tone, and soft detail for reusable gallery evidence", () => {
    const report = analyzeCinematicPostprocessClarity({
      pipeline: {
        passNames: ["tone-mapping", "color-grade", "bloom", "film-grain", "fxaa"],
        toneMapping: { exposure: 1.9, whitePoint: 0.92, operator: "aces" },
        colorGrade: { contrast: 0.72, saturation: 1.45 },
        bloom: { threshold: 0.28, intensity: 0.86, radius: 5 },
        filmGrain: { intensity: 0.16 },
        fxaa: true
      },
      frameMetrics: {
        averageLuma: 214,
        localContrast: 14,
        detailEdgeDensity: 0.018,
        uniqueColorBuckets: 86
      }
    });

    expect(report.status).toBe("risk");
    expect(report.score).toBeLessThan(50);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "washed-out-tone", severity: "warning" }),
      expect.objectContaining({ id: "noisy-bloom", severity: "failure" }),
      expect.objectContaining({ id: "film-grain-noise", severity: "failure" }),
      expect.objectContaining({ id: "soft-detail", severity: "warning" })
    ]));
    expect(report.findings.find((finding) => finding.id === "noisy-bloom")?.mitigation).toContain("higher bloom threshold");
  });

  it("does not treat conditional or unsupported pass names as proof without real inputs", () => {
    const report = analyzeCinematicPostprocessClarity({
      pipeline: {
        passNames: ["depth-of-field", "motion-blur", "ssao", "lut", "render-layers-aov"],
        depthOfField: {},
        motionBlur: {},
        ssao: {}
      }
    });

    expect(report.status).toBe("risk");
    expect(report.conditionalMissingInputs).toEqual(["depth-of-field:depth", "motion-blur:velocity", "ssao:depth"]);
    expect(report.unsupportedRequested).toEqual(["lut", "render-layers-aov"]);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "conditional-input-missing", severity: "warning" }),
      expect.objectContaining({ id: "unsupported-pass-request", severity: "failure" })
    ]));
    expect(report.claimGuidance.join(" ")).toContain("did not prove the required depth or velocity input");
  });
});

function indexById(entries: readonly CinematicCapabilityEntry[]): ReadonlyMap<string, CinematicCapabilityEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}
