import { describe, expect, it } from "vitest";
import { WebGL2StateCache } from "../../../packages/rendering/src/WebGL2StateCache";
import { WebGL2SamplerRegistry } from "../../../packages/rendering/src/webgl2/Samplers";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";
import { WebGL2LegacyPostPipeline } from "../../../packages/rendering/src/webgl2/LegacyPost";
import {
  BLOOM_FUSED_BLUR_TAP_BUDGET,
  DEFAULT_BLOOM_FUSION,
  FUSED_2D_BLOOM_FUSION,
  SEPARABLE_BLOOM_FUSION,
  bloomLevelBlursIn2d,
  resolveBloomFusionConfig
} from "../../../packages/rendering/src/webgl2/BloomFusion";
import { resolveBloomPyramidPlan, resolveBloomPyramidV2Response } from "../../../packages/rendering/src/postprocess/NativeBloomPyramid";
import { BLOOM_FUSIONS, DEFAULT_BLOOM_FUSION_MODE, isBloomFusion } from "../../../packages/rendering/src/contracts/quality";
import { parseBloomFusionOption } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import { applyRenderPathToCanvas, bloomFusionAllowed, configureBloomFusionDevice, isDirectRenderPath, isFusedBloomPasses, resolveAppRenderPath, type BloomFusionDevice } from "../../../packages/engine/src/agent-api/app/renderPath";
import { effects, lights, material, primitives, scene } from "@aura3d/engine";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

/**
 * AuraBloomFusion selection (PRD beat-threejs-2 WP-1, contract 2.1): which config each mode resolves to, how the option and
 * the URL override pick a mode, and how many draws the real pyramid code issues per mode at the benchmark canvas and at the
 * two resize targets (390x844, 1440x900). The pass code runs over a counting GL double; no pixels are involved (the
 * pixel and frame-time proof is tests/browser/bloom-fusion-cost.spec.ts on the remote runner).
 */

type DrawLog = { readonly program: string; readonly width: number; readonly height: number };

function countingPipeline(device: { bloomFusedPasses: boolean; bloomFusion: unknown }) {
  const draws: DrawLog[] = [];
  let program = "none";
  let viewport = [0, 0, 0, 0];
  const known: Record<string, unknown> = {
    TEXTURE0: 33984, TEXTURE_2D: 3553, FRAMEBUFFER: 36160, NO_ERROR: 0, TRIANGLES: 4, COLOR_BUFFER_BIT: 16384,
    useProgram: (value: { name: string } | null) => { program = value?.name ?? "none"; },
    viewport: (_x: number, _y: number, w: number, h: number) => { viewport = [w, h]; },
    drawArrays: () => { draws.push({ program, width: viewport[0]!, height: viewport[1]! }); },
    getParameter: () => null, isEnabled: () => false, getError: () => 0
  };
  const gl = new Proxy(known, { get: (target, property: string) => (property in target ? target[property] : () => null) }) as unknown as WebGL2RenderingContext;
  const host: Record<string, unknown> = {
    gl,
    stateCache: new WebGL2StateCache({ label: "test" }),
    counters: { textureBindCount: 0, nativeEnvironmentBindings: 0, nativeShadowMapBindings: 0, drawCalls: 0, programCompiles: 0, shaderProgramCreateCount: 0, shadowRenderTargetsAllocated: 0, releasedTextureHandles: 0 },
    renderTargets: new Set(), buffers: new Set(), shaders: new Set(),
    activeRenderTarget: null, disposed: false, contextLost: false, errorCheckMode: "frame", device
  };
  host.lifecycle = new WebGL2ContextLifecycle(host as never, { width: 64, height: 64 } as never);
  host.samplers = new WebGL2SamplerRegistry(host as never);
  const post = new WebGL2LegacyPostPipeline(host as never);
  const named = (name: string) => () => ({ name }) as unknown as WebGLProgram;
  const programs = post as unknown as Record<string, unknown>;
  for (const [method, name] of [
    ["ensureBloomDownsampleProgram", "downsample"], ["ensureBloomBrightExtractProgram", "bright"], ["ensureBloomBlurProgram", "blur1d"],
    ["ensureBloomAccumulateProgram", "accumulate"], ["ensureBloomBlur2dProgram", "blur2d"], ["ensureBloomFusedAccumulateProgram", "fused-accumulate"],
    ["ensureBloomPrefilterDownsampleProgram", "prefilter"]
  ] as const) programs[method] = named(name);
  return { post, draws };
}

/** Draws the bloom pyramid issues for one frame at a canvas size (bloom disabled is the caller's zero). */
function pyramidDraws(width: number, height: number, mode: "unfused" | "separable" | "fused-2d") {
  const device = { bloomFusedPasses: mode !== "unfused", bloomFusion: mode === "unfused" ? DEFAULT_BLOOM_FUSION : resolveBloomFusionConfig(mode) };
  const { post, draws } = countingPipeline(device);
  const plan = resolveBloomPyramidPlan(width, height, "cinematic", true);
  const handle = (id: string) => ({ id }) as never;
  const resources = {
    plan, hdr: true,
    textures: plan.mips.flatMap((_m, i) => [handle(`t${i}a`), handle(`t${i}b`)]),
    framebuffers: plan.mips.flatMap((_m, i) => [handle(`f${i}a`), handle(`f${i}b`)]),
    accumulatorTextureA: handle("accA"), accumulatorFramebufferA: handle("accFA"), accumulatorTextureB: handle("accB"), accumulatorFramebufferB: handle("accFB")
  };
  const staging = { textureA: handle("sA"), framebufferA: handle("sFA"), textureB: handle("sB"), framebufferB: handle("sFB") };
  // The app's bloom runs the v2 stamp (`excess`), whose fixed widening kernels are radii 6/10/14/18/22 at every size.
  const options = { threshold: 0.8, intensity: 1, radius: 4, quality: "cinematic" as const, softKnee: 0.5, shoulder: 1, excess: true as const, spread: 0.6 };
  post.executeNativeBloomPyramidPasses(handle("src"), width, height, resources as never, staging as never, options as never, handle("vao"), true);
  const radii = resolveBloomPyramidV2Response(plan, 0.6).blurRadii;
  return {
    total: draws.length,
    blur2d: draws.filter((d) => d.program === "blur2d").map((d) => `${d.width}x${d.height}`),
    plan, radii, fused: post.lastPyramidFused
  };
}

describe("AuraBloomFusion selection", () => {
  it("names two modes and defaults to separable", () => {
    expect(BLOOM_FUSIONS).toEqual(["separable", "fused-2d"]);
    expect(DEFAULT_BLOOM_FUSION_MODE).toBe("separable");
    expect(isBloomFusion("separable")).toBe(true);
    expect(isBloomFusion("fused-2d")).toBe(true);
    for (const bad of ["fused", "2d", "", null, undefined, 1, {}]) expect(isBloomFusion(bad)).toBe(false);
  });

  it("separable is the shipped variant and fused-2d blurs mips 1..4 in one 2-D pass", () => {
    expect(resolveBloomFusionConfig()).toBe(SEPARABLE_BLOOM_FUSION);
    expect(resolveBloomFusionConfig("separable")).toEqual({ accumulate: true, blur2dFromLevel: 3, extract: true });
    expect(DEFAULT_BLOOM_FUSION).toBe(SEPARABLE_BLOOM_FUSION);
    expect(resolveBloomFusionConfig("fused-2d")).toBe(FUSED_2D_BLOOM_FUSION);
    expect(FUSED_2D_BLOOM_FUSION).toEqual({ accumulate: true, blur2dFromLevel: 1, extract: true });
    // Both keep the folds that remove draws without adding fill.
    expect(SEPARABLE_BLOOM_FUSION.accumulate && SEPARABLE_BLOOM_FUSION.extract).toBe(true);
    expect(Object.isFrozen(SEPARABLE_BLOOM_FUSION) && Object.isFrozen(FUSED_2D_BLOOM_FUSION)).toBe(true);
  });

  it("the option and the URL override pick the mode; the URL wins; typos throw", () => {
    expect(parseBloomFusionOption(undefined, null)).toBe("separable");
    expect(parseBloomFusionOption({}, "")).toBe("separable");
    expect(parseBloomFusionOption({ bloomFusion: "fused-2d" }, null)).toBe("fused-2d");
    expect(parseBloomFusionOption({ bloomFusion: "fused-2d" }, "?aura3d-bloom-fusion=separable")).toBe("separable");
    expect(parseBloomFusionOption(undefined, "?x=1&aura3d-bloom-fusion=fused-2d")).toBe("fused-2d");
    expect(() => parseBloomFusionOption({ bloomFusion: "fused" as never }, null)).toThrow("QUALITY_OPTION_INVALID:renderer.bloomFusion=fused");
    expect(() => parseBloomFusionOption(undefined, "?aura3d-bloom-fusion=2d")).toThrow("QUALITY_OPTION_INVALID:?aura3d-bloom-fusion=2d");
  });

  it("fusion is allowed only under quality auto and cinematic; production never fuses", () => {
    expect(bloomFusionAllowed("auto")).toBe(true);
    expect(bloomFusionAllowed("cinematic")).toBe(true);
    expect(bloomFusionAllowed("production")).toBe(false);
    expect(bloomFusionAllowed("safe-basic")).toBe(false);
  });
});

describe("renderPath.bloomFusion in diagnostics", () => {
  const plain = () => scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).toJSON();
  const bloomed = () => scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).add(effects.bloom({ intensity: 0.4 })).toJSON();
  const flags = () => resolveQrFlags({});

  it("reports the selected mode under auto and cinematic, off for production and safe-basic", () => {
    const s = bloomed();
    expect(resolveAppRenderPath(s, { scene: s }, flags()).report).toMatchObject({ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" });
    expect(resolveAppRenderPath(s, { scene: s, renderer: { bloomFusion: "fused-2d" } }, flags()).report.bloomFusion).toBe("fused-2d");
    expect(resolveAppRenderPath(s, { scene: s, quality: "cinematic", renderer: { bloomFusion: "fused-2d" } }, flags()).report.bloomFusion).toBe("fused-2d");
    expect(resolveAppRenderPath(s, { scene: s, quality: "production" }, flags()).report).toMatchObject({ quality: "production", bloomFusion: "off" });
    // production ignores the option entirely: same flags object, off.
    const f = flags();
    const production = resolveAppRenderPath(s, { scene: s, quality: "production", renderer: { bloomFusion: "fused-2d" } }, f);
    expect(production.report.bloomFusion).toBe("off");
    expect(production.flags).toBe(f);
    expect(resolveAppRenderPath(s, { scene: s, quality: "safe-basic" }, flags()).report.bloomFusion).toBe("off");
  });

  it("reports off wherever no fused bloom pass can run, whatever the option says", () => {
    const fused = { renderer: { bloomFusion: "fused-2d" as const } };
    // No bloom effect, direct path (no post chain at all).
    const p = plain();
    const direct = resolveAppRenderPath(p, { scene: p, ...fused }, flags());
    expect(direct.report).toMatchObject({ path: "direct", quality: "auto", bloomFusion: "off" });
    expect(direct.direct).toBe(true);
    // No bloom effect on the HDR route (another effect forces the HDR target): still no bloom pass.
    const graded = scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).add(effects.colorGrade({})).toJSON();
    expect(resolveAppRenderPath(graded, { scene: graded, ...fused }, flags()).report).toMatchObject({ path: "hdr-msaa", bloomFusion: "off" });
    // Same scene with bloom added: the mode applies.
    const withBloom = scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).add(effects.colorGrade({})).add(effects.bloom({ intensity: 0.4 })).toJSON();
    expect(resolveAppRenderPath(withBloom, { scene: withBloom, ...fused }, flags()).report).toMatchObject({ path: "hdr-msaa", bloomFusion: "fused-2d" });
    // Legacy LDR route (A3D_QR_CORE off) is not HDR: the pyramid never fuses even with a bloom effect.
    const b = bloomed();
    const legacy = resolveAppRenderPath(b, { scene: b, ...fused }, resolveQrFlags({ url: "http://localhost/?a3d-qr=-core" }));
    expect(legacy.report.reason).toContain("legacy LDR route");
    expect(legacy.report.bloomFusion).toBe("off");
    // Explicit A3D_QR_CORE_OUTPUT keeps the HDR route; with a bloom effect the mode applies, without one it does not.
    const explicit = resolveQrFlags({ options: { A3D_QR_CORE_OUTPUT: true } });
    expect(resolveAppRenderPath(b, { scene: b, ...fused }, explicit).report).toMatchObject({ path: "hdr-msaa", bloomFusion: "fused-2d" });
    expect(resolveAppRenderPath(p, { scene: p, ...fused }, explicit).report).toMatchObject({ path: "hdr-msaa", bloomFusion: "off" });
  });

  it("an invalid mode throws at mount rather than silently running the default", () => {
    const s = bloomed();
    expect(() => resolveAppRenderPath(s, { scene: s, renderer: { bloomFusion: "nope" as never } }, flags())).toThrow("QUALITY_OPTION_INVALID");
  });
});

describe("engine wiring: the canvas route and the device configuration", () => {
  const bloomed = () => scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).add(effects.bloom({ intensity: 0.4 })).toJSON();
  const mount = (options: Record<string, unknown>) => {
    const s = bloomed();
    const canvas = {};
    const route = resolveAppRenderPath(s, { scene: s, ...options } as never, resolveQrFlags({}));
    applyRenderPathToCanvas(canvas, route);
    const device: BloomFusionDevice = {};
    configureBloomFusionDevice(device, canvas, (options as { renderer?: never }).renderer);
    return { canvas, device, route };
  };

  it("production never gets the fused flag or a fusion config, even when the option asks for fused-2d", () => {
    for (const quality of ["production", "safe-basic"]) {
      const { canvas, device } = mount({ quality, renderer: { bloomFusion: "fused-2d" } });
      expect(isFusedBloomPasses(canvas)).toBe(false);
      expect(device).toEqual({});
      expect(device.bloomFusedPasses).toBeUndefined();
    }
  });

  it("auto and cinematic set the fused flag and the selected config on the device (separable default, fused-2d opt-in)", () => {
    for (const quality of ["auto", "cinematic"]) {
      const sep = mount({ quality });
      expect(isFusedBloomPasses(sep.canvas)).toBe(true);
      expect(sep.device).toEqual({ bloomFusedPasses: true, bloomFusion: SEPARABLE_BLOOM_FUSION });
      const fused = mount({ quality, renderer: { bloomFusion: "fused-2d" } });
      expect(fused.device).toEqual({ bloomFusedPasses: true, bloomFusion: FUSED_2D_BLOOM_FUSION });
    }
  });

  it("a re-mount re-decides: auto then production on the same canvas clears the fused flag", () => {
    const s = bloomed();
    const canvas = {};
    applyRenderPathToCanvas(canvas, resolveAppRenderPath(s, { scene: s }, resolveQrFlags({})));
    expect(isFusedBloomPasses(canvas)).toBe(true);
    applyRenderPathToCanvas(canvas, resolveAppRenderPath(s, { scene: s, quality: "production" }, resolveQrFlags({})));
    expect(isFusedBloomPasses(canvas)).toBe(false);
    expect(isDirectRenderPath(canvas)).toBe(false);
    const device: BloomFusionDevice = {};
    configureBloomFusionDevice(device, canvas, undefined);
    expect(device).toEqual({});
  });

  it("the canvas fusion flag and the report use the same predicate", () => {
    const s = bloomed();
    for (const quality of ["auto", "production", "safe-basic", "cinematic"] as const) {
      const canvas = {};
      const route = resolveAppRenderPath(s, { scene: s, quality }, resolveQrFlags({}));
      applyRenderPathToCanvas(canvas, route);
      expect(isFusedBloomPasses(canvas), quality).toBe(bloomFusionAllowed(quality));
      // With a bloom effect on the HDR route the report is non-off exactly when the canvas flag is set.
      if (route.report.path === "hdr-msaa") expect(route.report.bloomFusion !== "off", quality).toBe(isFusedBloomPasses(canvas));
    }
  });
});

describe("draws per mode, from the real pyramid pass code", () => {
  it("PBR viewer canvas 640x360: unfused 22 pyramid draws, separable 14, fused-2d 12 (production 33 total, separable 25, fused-2d 23)", () => {
    const unfused = pyramidDraws(640, 360, "unfused");
    const separable = pyramidDraws(640, 360, "separable");
    const fused2d = pyramidDraws(640, 360, "fused-2d");
    expect(unfused.total).toBe(22);
    expect(unfused.fused).toBe(false);
    expect(unfused.blur2d).toEqual([]);
    expect(separable.total).toBe(14);
    expect(separable.fused).toBe(true);
    expect(separable.blur2d).toEqual(["40x23", "20x12"]);
    expect(fused2d.total).toBe(12);
    expect(fused2d.blur2d).toEqual(["160x90", "80x45", "40x23", "20x12"]);
    // The viewer's other draws are the same in every mode: production 33 - 22 = 11, so separable 25 and fused-2d 23.
    const rest = 33 - unfused.total;
    expect(rest + separable.total).toBe(25);
    expect(rest + fused2d.total).toBe(23);
  });

  it("2-D passes taken (mip sizes) per canvas and mode are pinned literally, and every one fits the tap budget", () => {
    const pinned: Record<string, readonly string[]> = {
      "640x360 separable": ["40x23", "20x12"],
      "640x360 fused-2d": ["160x90", "80x45", "40x23", "20x12"],
      "390x844 separable": ["25x53", "13x27"],
      "390x844 fused-2d": ["49x106", "25x53", "13x27"],
      "1440x900 separable": ["45x29"],
      "1440x900 fused-2d": ["45x29"]
    };
    for (const [width, height] of [[640, 360], [390, 844], [1440, 900]] as const) {
      for (const mode of ["separable", "fused-2d"] as const) {
        const run = pyramidDraws(width, height, mode);
        expect(run.blur2d, `${width}x${height} ${mode}`).toEqual(pinned[`${width}x${height} ${mode}`]);
        for (const size of run.blur2d) {
          const level = run.plan.mips.findIndex((mip) => `${mip.width}x${mip.height}` === size);
          const taps = (2 * run.radii[level]! + 1) ** 2 * run.plan.mips[level]!.width * run.plan.mips[level]!.height;
          expect(taps, `${width}x${height} ${mode} ${size}`).toBeLessThanOrEqual(BLOOM_FUSED_BLUR_TAP_BUDGET);
        }
      }
    }
  });

  it("the predicate: budget boundary, radius cap and level gate are exact", () => {
    const fusion = SEPARABLE_BLOOM_FUSION;
    // 90x57 at radius 18 is 1369 * 5130 = 7,022,970 fetches: 22,970 over the 7,000,000 budget, so it stays separable.
    expect((2 * 18 + 1) ** 2 * 90 * 57).toBe(7_022_970);
    expect(bloomLevelBlursIn2d(fusion, 3, { width: 90, height: 57 }, 18)).toBe(false);
    expect(bloomLevelBlursIn2d(fusion, 3, { width: 90, height: 56 }, 18)).toBe(true);
    expect(bloomLevelBlursIn2d(fusion, 2, { width: 8, height: 8 }, 2)).toBe(false);
    expect(bloomLevelBlursIn2d(fusion, 3, { width: 4, height: 4 }, 25)).toBe(false);
    expect(bloomLevelBlursIn2d(fusion, 3, { width: 4, height: 4 }, 24)).toBe(true);
    expect(bloomLevelBlursIn2d(FUSED_2D_BLOOM_FUSION, 1, { width: 8, height: 8 }, 2)).toBe(true);
    expect(bloomLevelBlursIn2d(FUSED_2D_BLOOM_FUSION, 0, { width: 8, height: 8 }, 2)).toBe(false);
  });

  it("resize: exact pyramid draws at 640x360, 390x844 and 1440x900; fused-2d falls back per mip where a 2-D pass would exceed the tap budget", () => {
    // [unfused, separable, fused-2d] (pyramid draws; the viewer adds 11 more: production 33, separable 25/25/26). The tap
    // budget is per mip, so a larger canvas keeps fewer 2-D passes. At 1440x900 only the 45x29 mip fits: the 90x57 mip at
    // radius 18 would cost 7.02M fetches against the 7M budget, so separable is one draw over the 640x360 count (15, not 14)
    // and fused-2d degrades to the same chain (mips 1 and 2 would cost 35.7M and 17.1M fetches).
    const expected: Record<string, readonly [number, number, number]> = { "640x360": [22, 14, 12], "390x844": [22, 14, 13], "1440x900": [22, 15, 15] };
    for (const [width, height] of [[640, 360], [390, 844], [1440, 900]] as const) {
      const unfused = pyramidDraws(width, height, "unfused").total;
      const separable = pyramidDraws(width, height, "separable").total;
      const fused2d = pyramidDraws(width, height, "fused-2d").total;
      expect([unfused, separable, fused2d], `${width}x${height}`).toEqual(expected[`${width}x${height}`]);
      expect(separable, `${width}x${height}`).toBeLessThan(unfused);
      expect(fused2d, `${width}x${height}`).toBeLessThanOrEqual(separable);
    }
    const big = pyramidDraws(1440, 900, "fused-2d");
    expect(big.blur2d).toEqual(["45x29"]);
  });

  it("production is unchanged: with fusion off the chain ignores the configured mode and issues the original 22 pyramid draws", () => {
    for (const config of [SEPARABLE_BLOOM_FUSION, FUSED_2D_BLOOM_FUSION]) {
      const { post, draws } = countingPipeline({ bloomFusedPasses: false, bloomFusion: config });
      const plan = resolveBloomPyramidPlan(640, 360, "cinematic", true);
      const handle = (id: string) => ({ id }) as never;
      const resources = {
        plan, hdr: true,
        textures: plan.mips.flatMap((_m, i) => [handle(`t${i}a`), handle(`t${i}b`)]), framebuffers: plan.mips.flatMap((_m, i) => [handle(`f${i}a`), handle(`f${i}b`)]),
        accumulatorTextureA: handle("a"), accumulatorFramebufferA: handle("fa"), accumulatorTextureB: handle("b"), accumulatorFramebufferB: handle("fb")
      };
      post.executeNativeBloomPyramidPasses(handle("s"), 640, 360, resources as never, { textureA: handle("x"), framebufferA: handle("fx"), textureB: handle("y"), framebufferB: handle("fy") } as never,
        { threshold: 0.8, intensity: 1, radius: 4, quality: "cinematic", softKnee: 0.5, shoulder: 1, excess: true, spread: 0.6 } as never, handle("v"), true);
      expect(draws.length).toBe(22);
      expect(draws.some((d) => d.program === "blur2d" || d.program === "prefilter" || d.program === "fused-accumulate")).toBe(false);
      expect(post.lastPyramidFused).toBe(false);
    }
  });

  it("extract folds only when the level-0 mip is an exact half of the source (odd sizes keep the separate extract)", () => {
    // 391x845 gives level 0 of 196x423, not exactly half: bright extract + plain downsample remain.
    const odd = pyramidDraws(391, 845, "separable");
    const even = pyramidDraws(390, 844, "separable");
    expect(odd.total).toBe(even.total + 1);
  });
});
