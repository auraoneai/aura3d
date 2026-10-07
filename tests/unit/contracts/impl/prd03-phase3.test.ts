import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd03"; // lane registrations: slots + C-02 chunks
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import {
  rendererQrFlags,
  setRendererQrFlags
} from "../../../../packages/rendering/src/renderer/FrameGraph";
import {
  createRootPostPipeline
} from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/index";
import {
  createRendererPostprocessPasses,
  createRendererPostprocessPlanDiagnostics
} from "../../../../packages/rendering/src/RendererPostprocessPlan";
import {
  RendererPostprocessPipeline
} from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import { shaderChunk, shaderFeaturesFor } from "../../../../packages/rendering/src/contracts/program";
import type { CollectedLight } from "../../../../packages/rendering/src/LightCollector";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";
import type { AuraQualityTierSettings } from "../../../../packages/rendering/src/contracts/quality";

const POST_ON = resolveQrFlags({ options: { A3D_QR_POST: true } });
const FLAGS_OFF = resolveQrFlags({});

afterEach(() => setRendererQrFlags(FLAGS_OFF));

const tier = {
  bloomMipLevels: 3,
  minRenderScale: 1
} as unknown as AuraQualityTierSettings;

function snapshotWith(...nodes: Record<string, unknown>[]): AuraSceneSnapshot {
  return { nodes: nodes.map((node) => ({ kind: "effect", ...node })) } as unknown as AuraSceneSnapshot;
}

function light(partial: Partial<CollectedLight>): CollectedLight {
  return {
    kind: "directional",
    color: [1, 1, 1],
    intensity: 1,
    position: [0, 10, 0],
    direction: [0, -1, 0],
    range: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 0,
    source: null,
    ...partial
  } as unknown as CollectedLight;
}

describe("PRD-03 Phase 3 — §6.9 AO bridge (S2 GTAO)", () => {
  it("ambient-occlusion radius is interpreted in metres on the pipeline bag", () => {
    const { options } = createRootPostPipeline(
      snapshotWith({ effect: "ambient-occlusion", radius: 0.5, intensity: 0.8, postAuthored: ["radius", "intensity"] }),
      { near: 0.1, far: 100, mode: "perspective" },
      undefined,
      tier
    );
    const ao = options.ao as { radius: number; intensity: number };
    expect(ao.radius).toBeCloseTo(0.5, 6);
    expect(ao.intensity).toBeCloseTo(0.8, 6);
  });

  it("contactOcclusion behaves as ambientOcclusion({radius: 0.2, ...authored})", () => {
    const defaults = createRootPostPipeline(
      snapshotWith({ effect: "contact-occlusion" }),
      { near: 0.1, far: 100, mode: "perspective" },
      undefined,
      tier
    ).options.ao as { radius: number };
    expect(defaults.radius).toBeCloseTo(0.2, 6);
    const authored = createRootPostPipeline(
      snapshotWith({ effect: "contact-occlusion", radius: 0.4, postAuthored: ["radius"] }),
      { near: 0.1, far: 100, mode: "perspective" },
      undefined,
      tier
    ).options.ao as { radius: number };
    expect(authored.radius).toBeCloseTo(0.4, 6);
  });

  it("two AO effect nodes throw POST_DUPLICATE_STAGE", () => {
    expect(() =>
      createRootPostPipeline(
        snapshotWith(
          { effect: "ambient-occlusion" },
          { effect: "contact-occlusion" }
        ),
        { near: 0.1, far: 100, mode: "perspective" },
        undefined,
        tier
      )
    ).toThrow(/POST_DUPLICATE_STAGE/);
  });
});

describe("PRD-03 Phase 3 — §8.5 god rays (S4)", () => {
  it("volumetric-fog maps to pipeline.godRays honoring authored color", () => {
    const { options } = createRootPostPipeline(
      snapshotWith({ effect: "volumetric-fog", intensity: 0.6, color: [0.5, 0.25, 0.12], postAuthored: ["intensity", "color"] }),
      { near: 0.1, far: 100, mode: "perspective" },
      undefined,
      tier
    );
    const god = options.godRays as { intensity: number; color: { r: number; g: number; b: number } };
    expect(god).toBeDefined();
    expect(god.intensity).toBeCloseTo(0.6, 6);
    // #804020 bridged by rgbField → r dominant.
    expect(god.color.r).toBeGreaterThan(god.color.b);
    expect(god.color.r).toBeGreaterThan(0);
  });

  it("lightDirection comes from the strongest directional light (toward it)", () => {
    const lights = [
      light({ kind: "directional", direction: [0, -1, 0], intensity: 0.4 }),
      light({ kind: "directional", direction: [0, -2, -2], intensity: 2.0 }),
      light({ kind: "point", intensity: 9 })
    ];
    const { options } = createRootPostPipeline(
      snapshotWith({ effect: "volumetric-fog", postAuthored: [] }),
      { near: 0.1, far: 100, mode: "perspective" },
      undefined,
      tier,
      lights
    );
    const dir = (options.godRays as { lightDirection: readonly number[] }).lightDirection;
    // Strongest is direction [0,-2,-2] → toward-light normalized [0, 1/√2, 1/√2].
    expect(dir[0]).toBeCloseTo(0, 6);
    expect(dir[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dir[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe("PRD-03 Phase 3 — new effect factories (§6.9 item)", () => {
  it("effects.vignette emits a vignette node with postAuthored keys", () => {
    const node = (effects.vignette({ intensity: 0.5, smoothness: 1.8 }) as never as { toJSON(): Record<string, unknown> }).toJSON();
    expect(node.effect).toBe("vignette");
    expect(node.intensity).toBe(0.5);
    expect(node.smoothness).toBe(1.8);
    expect(node.postAuthored).toEqual(["intensity", "smoothness"]);
  });

  it("effects.filmGrain / effects.chromaticAberration emit their kinds", () => {
    const grain = (effects.filmGrain({ intensity: 0.08, size: 1.6 }) as never as { toJSON(): Record<string, unknown> }).toJSON();
    expect(grain.effect).toBe("film-grain");
    expect(grain.size).toBe(1.6);
    const ca = (effects.chromaticAberration({ intensity: 0.003 }) as never as { toJSON(): Record<string, unknown> }).toJSON();
    expect(ca.effect).toBe("chromatic-aberration");
  });

  it("the bridge maps all three onto the pipeline bag", () => {
    const { options } = createRootPostPipeline(
      snapshotWith(
        { effect: "vignette", intensity: 0.5, postAuthored: ["intensity"] },
        { effect: "film-grain", intensity: 0.09, postAuthored: ["intensity"] },
        { effect: "chromatic-aberration", intensity: 0.002, postAuthored: ["intensity"] }
      ),
      { near: 0.1, far: 100, mode: "perspective" },
      undefined,
      tier
    );
    expect((options.vignette as { intensity: number }).intensity).toBeCloseTo(0.5, 6);
    expect((options.filmGrain as { intensity: number }).intensity).toBeCloseTo(0.09, 6);
    expect((options.chromaticAberration as { intensity: number }).intensity).toBeCloseTo(0.002, 6);
  });
});

describe("PRD-03 Phase 3 — §6.9 contact-shadow removal + CPU-readback ban", () => {
  it("flag-off keeps the contact-shadow pass; flag-on drops it with POST_PASS_DEPRECATED", () => {
    setRendererQrFlags(FLAGS_OFF);
    const offPasses = createRendererPostprocessPasses({ contactShadow: {} as never });
    expect(offPasses.map((p) => p.name)).toContain("contact-shadow");

    setRendererQrFlags(POST_ON);
    const onPasses = createRendererPostprocessPasses({ contactShadow: {} as never });
    expect(onPasses.map((p) => p.name)).not.toContain("contact-shadow");
    const diagnostics = createRendererPostprocessPlanDiagnostics({ contactShadow: {} as never });
    expect(diagnostics.clarityWarnings.some((w) => w.includes("POST_PASS_DEPRECATED:contact-shadow"))).toBe(true);
  });

  it("flag-on pixel pass throws POSTPROCESS_PASS_NOT_GPU; cpu-deterministic is exempt", () => {
    const device = new MockRenderDevice();
    const host = {
      device,
      width: 8,
      height: 8,
      fusedLdrPostprocessScratch: {},
      frameIndex: 0
    } as never;
    const pipeline = new RendererPostprocessPipeline(host);
    const forward = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });

    setRendererQrFlags(POST_ON);
    let thrown: unknown;
    try {
      pipeline.executePostprocess({ filmGrain: { intensity: 0.05 } as never }, [forward]);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string })?.code).toBe("POSTPROCESS_PASS_NOT_GPU");

    // The deterministic reference path is the explicit opt-out: the assert is
    // skipped, so any failure past it is an unrelated stub limitation — assert
    // only that POSTPROCESS_PASS_NOT_GPU is not raised.
    try {
      pipeline.executePostprocess({ filmGrain: { intensity: 0.05 } as never, execution: "cpu-deterministic" }, [forward]);
    } catch (error) {
      expect(String(error)).not.toContain("POSTPROCESS_PASS_NOT_GPU");
    }
  });
});

describe("PRD-03 Phase 3 — C-02 indirectFraction chunks", () => {
  it("registers both chunks and the feature; ChunkHarness compiles the GLSL", () => {
    const pars = shaderChunk("a3d_prd03_indirectFractionPars");
    const write = shaderChunk("a3d_prd03_indirectFractionWrite");
    expect(pars).toBeDefined();
    expect(write).toBeDefined();
    const built = buildChunkHarnessProgram([pars!, write!]);
    expect(built.fragment).toContain("a3dWriteIndirectFraction");
    expect(built.fragment).toContain("o_color = a3dWriteIndirectFraction(o_color, a3dIndirectRadiance)");
  });

  it("feature selects forward passes, defaults on under A3D_QR_POST, and -post_ao opts out", () => {
    const feature = shaderFeaturesFor(POST_ON).find((f) => f.id === "prd03.indirectFraction");
    expect(feature).toBeDefined();
    const input = (flags: typeof POST_ON, pass: "forward" | "depth" = "forward") => ({
      item: {} as never,
      pass,
      tier: tier,
      flags
    });
    expect(feature!.select(input(POST_ON))).toBe("indirectFraction");
    expect(feature!.select(input(POST_ON, "depth"))).toBeUndefined();
    const aoOff = resolveQrFlags({ options: { A3D_QR_POST: true, A3D_QR_POST_AO: false } });
    expect(feature!.select(input(aoOff))).toBeUndefined();
    expect(rendererQrFlags().on("A3D_QR_POST")).toBe(false); // BASE restored
  });
});
