import { describe, expect, it, vi } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { QR_FLAG_STATES } from "../../../packages/rendering/src/contracts/flags.state";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { QualityGovernor } from "../../../packages/rendering/src/quality/QualityGovernor";
import { AuraQuality } from "../../../packages/rendering/src/quality/QualityController";
import { createRenderScaleController } from "../../../packages/rendering/src/quality/RenderScaleController";
import {
  RUNTIME_QUALITY_LADDER,
  RuntimeQualityGovernor,
  clearRuntimeQualityState,
  ensureRuntimeQualityState
} from "../../../packages/rendering/src/quality/RuntimeQualityGovernor";
import { resolvePostAntiAlias } from "../../../packages/rendering/src/post/PostAntiAlias";
import { collectWarmupFeatures } from "../../../packages/rendering/src/program/ProgramWarmup";
import {
  shadowSystemForDevice,
  shadowSystemStructuralKey
} from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { Prd02ShadowSystem, type ShadowSystemConfigInput } from "../../../packages/rendering/src/shadows/ShadowSystem";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { createRootPostPipeline } from "../../../packages/engine/src/agent-api/postBridge";
import { resolvePostQualityTier } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import { BLOOM_PREFILTER_GLSL } from "../../../packages/rendering/src/post/shaders/bloom.glsl";
import {
  EXPOSURE_ADAPT_GLSL,
  EXPOSURE_LUMA_LOG_GLSL,
  EXPOSURE_MUL_GLSL,
  EXPOSURE_REDUCE_GLSL,
  adaptEv
} from "../../../packages/rendering/src/post/shaders/exposure.glsl";
import { A3D_PRD04_ANISOTROPY } from "../../../packages/rendering/src/shaders/physical/anisotropy.glsl";
import { A3D_PRD04_CLEARCOAT } from "../../../packages/rendering/src/shaders/physical/clearcoat.glsl";
import { A3D_PRD04_SHEEN } from "../../../packages/rendering/src/shaders/physical/sheen.glsl";
import { SSR_TRACE_WGSL, SSR_TRACE_MSAA_WGSL } from "../../../packages/rendering/src/post/shaders/ssr.wgsl";
import { outputFragmentGlsl } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { createOutputWgsl } from "../../../packages/rendering/src/output/ToneMappingOperators.wgsl";
import { parseFogColor } from "../../../packages/rendering/src/atmosphere/HeightFog";
import { Skeleton } from "../../../packages/animation/src/Skeleton";
import type { BoneDescriptor } from "../../../packages/animation/src/Bone";

describe("WP-05 GOV-1: production flag promotion & 60 fps mobile target", () => {
  it("enables A3D_QR_TIERS_GOVERNOR by default while keeping A3D_QR_TIERS dev-gated and respecting kill switches", () => {
    expect(QR_FLAG_STATES.A3D_QR_TIERS).toBe("dev");
    expect(QR_FLAG_STATES.A3D_QR_TIERS_GOVERNOR).toBe("default-on");

    const prod = resolveQrFlags({ env: {} });
    expect(prod.on("A3D_QR_TIERS")).toBe(false);
    expect(prod.on("A3D_QR_TIERS_GOVERNOR")).toBe(true);

    expect(resolveQrFlags({ options: ["none"] }).on("A3D_QR_TIERS_GOVERNOR")).toBe(false);
    expect(resolveQrFlags({ options: ["-tiers"] }).on("A3D_QR_TIERS_GOVERNOR")).toBe(false);
    expect(resolveQrFlags({ options: ["-tiers.governor"] }).on("A3D_QR_TIERS_GOVERNOR")).toBe(false);
    expect(resolveQrFlags({ options: ["tiers"] }).on("A3D_QR_TIERS_GOVERNOR")).toBe(true);
  });

  it("defaults mobile QualityGovernor and AuraQuality to 16.67 ms (60 fps) instead of 33.3 ms", () => {
    const scale = createRenderScaleController({ targetFrameMs: 16.67, minScale: 0.5, initialScale: 0.5 });
    const gov = new QualityGovernor({
      tier: "high",
      mobile: true,
      devicePixelRatio: 1,
      scaleSource: scale
    });
    const steps: string[] = [];
    gov.onStep((s) => steps.push(`${s.direction}:${s.feature}`));
    // 22 ms is > 1.1 * 16.67 ms (over 60 fps budget), whereas under the old 33.3 ms budget it never stepped!
    for (let i = 0; i < 130; i += 1) gov.tick(22, null);
    expect(steps).toEqual(["down:ssr"]);

    const controller = new AuraQuality("auto", undefined, { mobile: true });
    controller.attachProbe({
      backend: "webgl2",
      rendererString: "Apple GPU",
      unmaskedRenderer: "Apple A17 Pro GPU",
      unmaskedVendor: "Apple",
      maxTextureSize: 16384,
      maxSamples: 4,
      floatColorBuffer: true,
      halfFloatColorBuffer: true,
      timerQuery: false,
      parallelShaderCompile: true,
      multiDraw: true,
      devicePixelRatio: 3,
      screen: [393, 852],
      hardwareConcurrency: 6,
      deviceMemoryGB: 8,
      mobile: true
    });
    // Calibrate 30 frames + step render scale to floor + 120 frames at 24 ms (< 33.3 ms, > 16.67 ms)
    for (let i = 0; i < 600; i += 1) controller.tickFrame(24, null);
    expect((controller.renderScale ?? 1)).toBeLessThan(1);
  });
});

describe("WP-05 GOV-1: RuntimeQualityGovernor hysteresis, warmup, VSync 30 Hz lock & bounce ceiling", () => {
  it("skips first 45 frames / 1.0 s warmup, > 100 ms background stalls, and shader-compile frames", () => {
    const gov = new RuntimeQualityGovernor({ mountTier: "high" });
    let now = 100;
    // 45 heavy frames during warmup -> rung stays 0
    for (let i = 0; i < 45; i += 1) {
      now += 28;
      expect(gov.sample({ nowMs: now, rafDeltaMs: 28, cpuBodyMs: 12, compiledPrograms: 10 }).rung).toBe(0);
    }
    // Background tab stall (450 ms) + 5 resume frames -> ignored
    now += 450;
    expect(gov.sample({ nowMs: now, rafDeltaMs: 450, cpuBodyMs: 25, compiledPrograms: 10 }).rung).toBe(0);
    for (let i = 0; i < 5; i += 1) {
      now += 28;
      expect(gov.sample({ nowMs: now, rafDeltaMs: 28, cpuBodyMs: 14, compiledPrograms: 10 }).rung).toBe(0);
    }
    // Shader compilation spike on every frame -> ignored even past warmup
    let programs = 10;
    for (let i = 0; i < 40; i += 1) {
      now += 28;
      programs += 1;
      expect(gov.sample({ nowMs: now, rafDeltaMs: 28, cpuBodyMs: 18, compiledPrograms: programs }).rung).toBe(0);
    }
  });

  it("holds current rung under iOS Low Power Mode 30 Hz VSync cap (rafDeltaMs ~ 33.3 ms, cpuBodyMs < 5 ms)", () => {
    const gov = new RuntimeQualityGovernor({ mountTier: "high" });
    let now = 0;
    for (let i = 0; i < 50; i += 1) {
      now += 33.33;
      gov.sample({ nowMs: now, rafDeltaMs: 33.33, cpuBodyMs: 1.8 });
    }
    // Feed 180 frames of 30 Hz VSync lock with jitter in [32.8, 33.9] ms and CPU < 3 ms
    for (let i = 0; i < 180; i += 1) {
      const dt = 33.33 + ((i % 5) - 2) * 0.22;
      now += dt;
      const res = gov.sample({ nowMs: now, rafDeltaMs: dt, cpuBodyMs: 2.1 });
      expect(res.rung).toBe(0);
    }
    expect(gov.vsyncLocked30Hz).toBe(true);
    expect(gov.rung).toBe(0);
  });

  it("steps down 1 rung when p75 > 18.5 ms (>= 20/30), respects 1.5 s settle + 8.0 s step-up cooldown, and locks ceiling on bounce", () => {
    const gov = new RuntimeQualityGovernor({ mountTier: "high" });
    let now = 0;
    // Warmup (> 45 frames and > 1000 ms) at healthy 11 ms
    for (let i = 0; i < 65; i += 1) {
      now += 16.67;
      gov.sample({ nowMs: now, rafDeltaMs: 11, cpuBodyMs: 6 });
    }
    expect(gov.rung).toBe(0);

    // 30 sustained heavy frames (24 ms, cpu 12 ms -> not VSync locked) -> steps 0 -> 1
    let steppedDown = false;
    for (let i = 0; i < 35; i += 1) {
      now += 24;
      const r = gov.sample({ nowMs: now, rafDeltaMs: 24, cpuBodyMs: 12 });
      if (r.changed && r.direction === "down") steppedDown = true;
    }
    expect(steppedDown).toBe(true);
    expect(gov.rung).toBe(1);
    expect(RUNTIME_QUALITY_LADDER[gov.rung].renderScale).toBeLessThan(1);

    // Immediate continued overload within < 1.5 s settle cooldown does NOT double-step
    for (let i = 0; i < 35; i += 1) {
      now += 24;
      gov.sample({ nowMs: now, rafDeltaMs: 24, cpuBodyMs: 12 });
    }
    expect(gov.rung).toBe(1);

    // Under-budget frames before 8.0 s step-up cooldown expires do NOT step up
    for (let i = 0; i < 200; i += 1) {
      now += 10;
      gov.sample({ nowMs: now, rafDeltaMs: 10, cpuBodyMs: 4 });
    }
    expect(gov.rung).toBe(1);

    // Advance past 8.0 s cooldown using valid (< 100 ms) fast frames -> steps up 1 -> 0
    for (let i = 0; i < 900; i += 1) {
      now += 11;
      gov.sample({ nowMs: now, rafDeltaMs: 11, cpuBodyMs: 3.5 });
      if (gov.rung === 0) break;
    }
    expect(gov.rung).toBe(0);

    // Bounce: overload again within 12 s of stepping up -> steps down 0 -> 1 AND locks ceiling at rung 1!
    for (let i = 0; i < 80; i += 1) {
      now += 25;
      gov.sample({ nowMs: now, rafDeltaMs: 25, cpuBodyMs: 12 });
      if (gov.rung === 1) break;
    }
    expect(gov.rung).toBe(1);
    expect(gov.effectiveCeilingRung(now + 1000)).toBe(1);
  });
});

describe("WP-05 Stutter Traps A–C & postBridge dynamic renderScale", () => {
  it("Trap A: resolvePostAntiAlias preserves pinned mount sampleCount across tier downgrades", () => {
    const atMount = resolvePostAntiAlias({
      settings: QUALITY_TIERS.high,
      tier: "high",
      authored: "auto",
      renderPixels: 1280 * 720,
      velocity: { moving: 0, movingWithHistory: 0 },
      pinnedSampleCount: 4
    });
    expect(atMount).toEqual({ mode: "msaa", sampleCount: 4 });

    const downgradedLow = resolvePostAntiAlias({
      settings: QUALITY_TIERS.low,
      tier: "low",
      authored: "auto",
      renderPixels: 960 * 540,
      velocity: { moving: 0, movingWithHistory: 0 },
      pinnedSampleCount: 4
    });
    expect(downgradedLow.sampleCount).toBe(4);
    expect(downgradedLow.mode).toBe("msaa");

    const pinnedSingle = resolvePostAntiAlias({
      settings: QUALITY_TIERS.high,
      tier: "high",
      authored: "auto",
      renderPixels: 1280 * 720,
      velocity: { moving: 0, movingWithHistory: 0 },
      pinnedSampleCount: 1
    });
    expect(pinnedSingle.sampleCount).toBe(1);
  });

  it("Trap B: collectWarmupFeatures pre-warms shadow cascade variants 3 -> 2 -> 1", () => {
    const features = collectWarmupFeatures(
      { materials: [{ lighting: "lit" }], includeDepth: false },
      "high"
    );
    const cascades = new Set(features.map((f) => f.shadows.cascades));
    expect(cascades.has(3)).toBe(true);
    expect(cascades.has(2)).toBe(true);
    expect(cascades.has(1)).toBe(true);
  });

  it("Trap C: shadowSystemStructuralKey excludes mapSize/cascades and invokes ShadowSystem.retune", () => {
    const base: ShadowSystemConfigInput = {
      enabled: true,
      mapSize: 2048,
      cascades: 3,
      maxDistance: 120,
      splitLambda: 0.65,
      filter: "pcf",
      strength: 1,
      bias: 0,
      normalBias: 1.5
    };
    const retuned: ShadowSystemConfigInput = { ...base, mapSize: 1024, cascades: 1 };
    expect(shadowSystemStructuralKey(base)).toBe(shadowSystemStructuralKey(retuned));

    const device = new MockRenderDevice();
    const first = shadowSystemForDevice(device, base);
    const retuneSpy = vi.spyOn(Prd02ShadowSystem.prototype, "retune").mockImplementation(function (this: Prd02ShadowSystem) {});
    const disposeSpy = vi.spyOn(first, "dispose");
    try {
      const second = shadowSystemForDevice(device, retuned);
      expect(retuneSpy).toHaveBeenCalledWith(retuned);
      expect(disposeSpy).not.toHaveBeenCalled();
      expect(second).toBe(first);
    } finally {
      retuneSpy.mockRestore();
      disposeSpy.mockRestore();
    }
  });

  it("postBridge preserves dynamic renderScale (< 1) while keeping full-res default at 1", () => {
    const snapshot = { nodes: [] } as never;
    const canvas = {} as HTMLCanvasElement;
    try {
      const fullRes = createRootPostPipeline(snapshot, undefined, undefined, QUALITY_TIERS.high, [], undefined, canvas);
      expect(fullRes.options.renderScale).toBe(1);

      const state = ensureRuntimeQualityState(canvas);
      state.renderScale = 0.75;
      state.postTier = "low";
      expect(resolvePostQualityTier("auto", canvas)).toBe("low");
      expect(resolvePostQualityTier("ultra", canvas)).toBe("ultra");

      const scaled = createRootPostPipeline(snapshot, undefined, undefined, QUALITY_TIERS.low, [], undefined, canvas);
      expect(scaled.options.renderScale).toBeCloseTo(0.75, 5);
    } finally {
      clearRuntimeQualityState(canvas);
    }
  });
});

describe("WP-05 NAN-1: HDR NaN/Inf sanitization in bloom, auto-exposure, and PBR specular lobes", () => {
  it("adaptEv recovers cleanly from NaN/Inf previous state and clamps non-finite target EV", () => {
    const opts = {
      dt: 0.016,
      minEv: -6,
      maxEv: 6,
      speedUp: 1.5,
      speedDown: 1.5,
      compensationEv: 0,
      hasPrev: true
    } as const;
    const recoveredFromNanPrev = adaptEv(Number.NaN, -1.0, opts);
    expect(Number.isFinite(recoveredFromNanPrev)).toBe(true);
    expect(recoveredFromNanPrev).toBeCloseTo(1.0 + Math.log2(0.18), 4);

    const recoveredFromInfPrev = adaptEv(Number.POSITIVE_INFINITY, 0.0, opts);
    expect(Number.isFinite(recoveredFromInfPrev)).toBe(true);

    const recoveredFromNanAvg = adaptEv(0.5, Number.NaN, opts);
    expect(Number.isFinite(recoveredFromNanAvg)).toBe(true);
    expect(recoveredFromNanAvg).toBeGreaterThan(-6);
    expect(recoveredFromNanAvg).toBeLessThan(6);

    const recoveredFromInfAvg = adaptEv(0.5, Number.POSITIVE_INFINITY, opts);
    expect(Number.isFinite(recoveredFromInfAvg)).toBe(true);
  });

  it("sanitizes NaN/Inf/FP16-overflow in bloom prefilter, exposure shaders, and PBR lobes", () => {
    expect(BLOOM_PREFILTER_GLSL).toContain("isnan");
    expect(BLOOM_PREFILTER_GLSL).toContain("isinf");
    expect(BLOOM_PREFILTER_GLSL).toContain("65504.0");

    for (const src of [EXPOSURE_LUMA_LOG_GLSL, EXPOSURE_REDUCE_GLSL, EXPOSURE_ADAPT_GLSL, EXPOSURE_MUL_GLSL]) {
      expect(src).toContain("isnan");
      expect(src).toContain("isinf");
    }

    for (const chunk of [A3D_PRD04_ANISOTROPY, A3D_PRD04_CLEARCOAT, A3D_PRD04_SHEEN]) {
      expect(chunk.glsl).toContain("65504.0");
      expect(chunk.wgsl).toContain("65504.0");
    }
    expect(A3D_PRD04_ANISOTROPY.glsl).toContain("0.002");
    expect(A3D_PRD04_CLEARCOAT.glsl).toContain("0.002");
    expect(A3D_PRD04_SHEEN.glsl).toContain("0.0078125");
  });
});

describe("WP-05 §1.2 WebGPU SSR grazing-road second-difference planarity", () => {
  /** Exact CPU mirror of the normalAt() planarity gate in ssr.wgsl.ts. */
  function ssrPlanarityAccepts(params: {
    z: number;
    zxNeg: number;
    zxPos: number;
    zyNeg: number;
    zyPos: number;
    viewportHeight: number;
    fovYRad: number;
  }): boolean {
    const { z, zxNeg, zxPos, zyNeg, zyPos, viewportHeight, fovYRad } = params;
    const proj11 = 1 / Math.tan(fovYRad * 0.5);
    const pixelAngle = 2.0 / Math.max(viewportHeight * Math.abs(proj11), 1.0);
    const grazeScale = Math.max(z * z * pixelAngle, 0.002 * z);
    const ddx = Math.abs((zxPos - z) - (z - zxNeg));
    const ddy = Math.abs((zyPos - z) - (z - zyNeg));
    const stepX = Math.min(Math.abs(zxPos - z), Math.abs(z - zxNeg));
    const stepY = Math.min(Math.abs(zyPos - z), Math.abs(z - zyNeg));
    return !(
      Math.max(ddx, ddy) > 0.08 * z + 16.0 * grazeScale ||
      Math.max(stepX, stepY) > 0.25 * z + 48.0 * grazeScale
    );
  }

  it("accepts a flat wet road from a low chase camera at 16–60 m while rejecting object silhouettes", () => {
    expect(SSR_TRACE_WGSL).toContain("ddx");
    expect(SSR_TRACE_WGSL).toContain("ddy");
    expect(SSR_TRACE_WGSL).toContain("pixelAngle");
    expect(SSR_TRACE_MSAA_WGSL).toContain("pixelAngle");

    // Low chase camera: camera height H = 0.85 m, 60 deg vertical FOV, 540p half-res viewport.
    const H = 0.85;
    const fovYRad = Math.PI / 3;
    const viewportHeight = 540;
    const proj11 = 1 / Math.tan(fovYRad * 0.5);
    const pixelAngle = 2.0 / (viewportHeight * proj11);

    let legacyFirstDiffWouldRejectCount = 0;
    for (const distanceMeters of [16, 25, 40, 60]) {
      const sinTheta = H / distanceMeters;
      const theta0 = Math.asin(sinTheta);
      const zAt = (dTheta: number) => H / Math.sin(Math.max(1e-4, theta0 + dTheta));
      const z = zAt(0);
      const zyNeg = zAt(-pixelAngle);
      const zyPos = zAt(pixelAngle);
      if (Math.max(Math.abs(zyNeg - z), Math.abs(zyPos - z)) > 0.08 * z) {
        legacyFirstDiffWouldRejectCount += 1;
      }
      expect(
        ssrPlanarityAccepts({
          z,
          zxNeg: z,
          zxPos: z,
          zyNeg,
          zyPos,
          viewportHeight,
          fovYRad
        })
      ).toBe(true);
    }
    expect(legacyFirstDiffWouldRejectCount).toBeGreaterThanOrEqual(2);

    // Object silhouette: foreground pillar/car at z = 12 m against road/background at z = 45 m -> rejected!
    expect(
      ssrPlanarityAccepts({
        z: 12,
        zxNeg: 12,
        zxPos: 45,
        zyNeg: 12,
        zyPos: 12.05,
        viewportHeight,
        fovYRad
      })
    ).toBe(false);
  });
});

describe("WP-05 VIS-1 Display-P3 tone mapping, N1 HeightFog CSS colors & HOT-1 Skeleton prealloc", () => {
  it("transforms linear Rec.709 into Display-P3 before [0, 1]^3 clamping in both GLSL and WGSL while keeping sRGB exact", () => {
    const glslP3 = outputFragmentGlsl({
      toneMapping: "linear",
      backgroundCoverage: false,
      overlay: false,
      outputColorSpace: "display-p3",
      colorGrade: true
    });
    const glslSrgb = outputFragmentGlsl({
      toneMapping: "linear",
      backgroundCoverage: false,
      overlay: false,
      outputColorSpace: "srgb",
      colorGrade: true
    });
    expect(glslP3).toContain("#define OUTPUT_DISPLAY_P3");
    expect(glslP3).toContain("a3dSceneP3ToSrgb(clamp(a3dSceneSrgbToP3(color), 0.0, 1.0))");
    expect(glslSrgb).not.toContain("#define OUTPUT_DISPLAY_P3");

    const wgslP3 = createOutputWgsl({
      toneMapping: "linear",
      backgroundCoverage: false,
      overlay: false,
      outputColorSpace: "display-p3",
      colorGrade: true
    });
    const wgslSrgb = createOutputWgsl({
      toneMapping: "linear",
      backgroundCoverage: false,
      overlay: false,
      outputColorSpace: "srgb",
      colorGrade: true
    });
    expect(wgslP3.webgpu.fragment).toContain("a3dSceneP3ToSrgb(clamp(a3dSceneSrgbToP3(c), vec3<f32>(0.0), vec3<f32>(1.0)))");
    expect(wgslSrgb.webgpu.fragment).not.toContain("a3dSceneSrgbToP3");

    // Verify Display-P3 primary reach math: pure Display-P3 red in linear Rec.709 is [1.22494, -0.04206, -0.01964].
    // Clamping in P3 preserves [1, 0, 0] in P3, whereas premature Rec.709 [0, 1]^3 clamping capped P3 red at 0.82246!
    const toP3 = (c: readonly [number, number, number]): [number, number, number] => [
      0.8224619687143624 * c[0] + 0.17753803128563794 * c[1],
      0.03319419885096169 * c[0] + 0.9668058011490385 * c[1],
      0.01708263072112004 * c[0] + 0.07239744066396342 * c[1] + 0.9105199286149166 * c[2]
    ];
    const p3RedInRec709 = [1.22494018, -0.04205695, -0.01963755] as const;
    const clampedInP3 = toP3(p3RedInRec709).map((v) => Math.min(1, Math.max(0, v)));
    expect(clampedInP3[0]).toBeCloseTo(1.0, 5);
    expect(clampedInP3[1]).toBeCloseTo(0.0, 5);
    expect(clampedInP3[2]).toBeCloseTo(0.0, 5);
  });

  it("HeightFog parseFogColor parses #rgb, #rrggbbaa, rgb(), hsl(), and named CSS colors without NaN", () => {
    const fallback: [number, number, number] = [0.5, 0.6, 0.7];
    const shortHex = parseFogColor("#f80", fallback);
    const fullHex = parseFogColor("#ff8800", fallback);
    expect(shortHex[0]).toBeCloseTo(fullHex[0], 5);
    expect(shortHex[1]).toBeCloseTo(fullHex[1], 5);
    expect(shortHex[2]).toBeCloseTo(fullHex[2], 5);

    const hexAlpha = parseFogColor("#336699cc", fallback);
    const hex6 = parseFogColor("#336699", fallback);
    expect(hexAlpha).toEqual(hex6);

    const rgbCss = parseFogColor("rgb(51, 102, 153)", fallback);
    expect(rgbCss[0]).toBeCloseTo(hex6[0], 5);
    expect(rgbCss[1]).toBeCloseTo(hex6[1], 5);
    expect(rgbCss[2]).toBeCloseTo(hex6[2], 5);

    const hslCss = parseFogColor("hsl(210, 50%, 40%)", fallback);
    expect(hslCss[0]).toBeCloseTo(hex6[0], 3);
    expect(hslCss[1]).toBeCloseTo(hex6[1], 3);
    expect(hslCss[2]).toBeCloseTo(hex6[2], 3);

    for (const input of ["skyblue", "rgb(100% 50% 0% / 0.8)", "hsl(0.5turn 60% 50%)", "not-a-color", ""]) {
      const parsed = parseFogColor(input, fallback);
      expect(parsed.every((c) => Number.isFinite(c) && c >= 0 && c <= 1)).toBe(true);
    }
  });

  it("Skeleton reuses preallocated Float32Array views and contiguous buffers across frames", () => {
    const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
    const bones: BoneDescriptor[] = [
      { name: "root", parentIndex: -1, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], inverseBindMatrix: ident },
      { name: "spine", parentIndex: 0, translation: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], inverseBindMatrix: ident }
    ];
    const skel = new Skeleton(bones);
    const w1 = skel.worldMatrices();
    const p1 = skel.matrixPalette();
    const pos1 = skel.boneWorldPositions();
    const wb1 = skel.worldMatricesBuffer();
    const pb1 = skel.matrixPaletteBuffer();

    skel.bones[1]!.translation = [0, 2, 0];
    const w2 = skel.worldMatrices();
    const p2 = skel.matrixPalette();
    const pos2 = skel.boneWorldPositions();

    expect(w2).toBe(w1);
    expect(w2[0]).toBe(w1[0]);
    expect(w2[1]).toBe(w1[1]);
    expect(p2).toBe(p1);
    expect(p2[1]).toBe(p1[1]);
    expect(pos2).toBe(pos1);
    expect(pos2[1]).toBe(pos1[1]);
    expect(skel.worldMatricesBuffer()).toBe(wb1);
    expect(skel.matrixPaletteBuffer()).toBe(pb1);
    expect(pos2[1]![1]).toBeCloseTo(2, 5);
  });
});
