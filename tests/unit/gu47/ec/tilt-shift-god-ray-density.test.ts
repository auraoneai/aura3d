import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dofTiltShiftUniform, godRayDensity, runV2HdrStages, withDefines } from "../../../../packages/rendering/src/post/v2Stages";
import { DOF_PREFILTER_GLSL } from "../../../../packages/rendering/src/post/shaders/dof.glsl";
import { GODRAYS_GLSL } from "../../../../packages/rendering/src/post/shaders/godrays.glsl";
import { postStagesRan } from "../../../../packages/rendering/src/renderer/postSkipped";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { Prd03PostSurface, createRootPostPipeline, resetRuntimePostOverrides, validatePostEffectNode } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import type { AuraEffectNode } from "../../../../packages/engine/src/agent-api/index";
import { CAMERA, fakeHost, fakeTarget, recordingGl } from "./recordingGl";

/**
 * GU47 E-C WP-3 item 8: DOF `tiltShift { bandCenter, bandWidth, angleDeg }`
 * band mode and volumetricFog `godRayDensity` decoupled from the fog density.
 * The option fields are E-F's (`nodes/effects.ts`); until that merges the
 * nodes carry them as plain fields, which is what E-F's factories will emit.
 */

const BASE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

/** The v2 bag types its stage options as `unknown`; the tests read them loosely. */
const derive = (...nodes: unknown[]): Record<string, any> =>
  createRootPostPipeline({ nodes } as never, { near: 0.1, far: 100 }, undefined, QUALITY_TIERS.high).options;

const dofNode = (extra: Record<string, unknown>) => ({ ...effects.depthOfField({ focusDistance: 4 }).toJSON(), ...extra, postAuthored: ["focusDistance", ...Object.keys(extra)] });
const fogNode = (extra: Record<string, unknown>) => ({ ...effects.volumetricFog({ density: 0.4 }).toJSON(), ...extra });

afterEach(() => resetRuntimePostOverrides());

describe("bridge: tiltShift and godRayDensity", () => {
  it("passes a valid tilt-shift band into pipeline.dof, clamped", () => {
    expect(derive(dofNode({ tiltShift: { bandCenter: 0.55, bandWidth: 0.2, angleDeg: 8 } })).dof?.tiltShift)
      .toEqual({ bandCenter: 0.55, bandWidth: 0.2, angleDeg: 8 });
    expect(derive(dofNode({ tiltShift: { bandCenter: 1.4, bandWidth: -1 } })).dof?.tiltShift).toEqual({ bandCenter: 1, bandWidth: 0 });
    expect(derive(dofNode({ tiltShift: { bandCenter: Number.NaN, bandWidth: 0.2 } })).dof?.tiltShift).toBeUndefined();
    expect(derive(dofNode({})).dof?.tiltShift).toBeUndefined();
  });

  it("godRayDensity drives pipeline.godRays.density; the fog density no longer does", () => {
    expect(derive(fogNode({ godRayDensity: 0.35 })).godRays?.density).toBe(0.35);
    expect(derive(fogNode({ godRayDensity: 4 })).godRays?.density).toBe(1);
    const fogOnly = derive(fogNode({})).godRays!;
    expect(fogOnly).toBeDefined();
    expect("density" in fogOnly).toBe(false);
  });

  it("the new fields pass the v2 field allowlist (no POST_FIELD_UNSUPPORTED)", () => {
    const codes = (node: unknown) => (validatePostEffectNode(node as AuraEffectNode) ?? []).map((d) => d.code);
    expect(codes(dofNode({ tiltShift: { bandCenter: 0.5, bandWidth: 0.3 } }))).not.toContain("POST_FIELD_UNSUPPORTED");
    expect(codes(fogNode({ godRayDensity: 0.5 }))).not.toContain("POST_FIELD_UNSUPPORTED");
  });

  it("app.post.setEffect drives both at runtime (tiltShift as [bandCenter, bandWidth, angleDeg])", () => {
    const post = new Prd03PostSurface({ on: () => true } as never, {} as HTMLCanvasElement);
    post.setEffect("depthOfField", { tiltShift: [0.6, 0.25, -5] });
    post.setEffect("volumetricFog", { godRayDensity: 0.5, density: 0.9 });
    const options = derive(dofNode({}), fogNode({}));
    expect(options.dof?.tiltShift).toEqual({ bandCenter: 0.6, bandWidth: 0.25, angleDeg: -5 });
    expect(options.godRays?.density).toBe(0.5);
  });
});

describe("S6 tilt-shift band and S4 density uniforms", () => {
  it("dofTiltShiftUniform packs [centre, width, radians, 1] and zeros when absent", () => {
    const [c, w, a, on] = dofTiltShiftUniform({ bandCenter: 0.5, bandWidth: 0.3, angleDeg: 90 });
    expect([c, w, on]).toEqual([0.5, 0.3, 1]);
    expect(a).toBeCloseTo(Math.PI / 2, 9);
    expect(dofTiltShiftUniform(undefined)).toEqual([0, 0, 0, 0]);
  });

  it("godRayDensity clamps to [0.05, 1] and defaults to the full march", () => {
    expect(godRayDensity(undefined)).toBe(1);
    expect(godRayDensity(0.4)).toBe(0.4);
    expect(godRayDensity(0)).toBe(0.05);
    expect(godRayDensity(3)).toBe(1);
  });

  const dof = { focusDistance: 4, fStop: 2.8, focalLengthMm: 50, sensorHeightMm: 24, maxBlurPx: 12, halfRes: true };

  it("writes u_tiltShift into the S6 prefilter and records the band stage", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, dof: { ...dof, tiltShift: { bandCenter: 0.5, bandWidth: 0.2 } } } as never, CAMERA);
    const prefilter = rec.draws.find((d) => d.fragment.includes("u_tiltShift"))!;
    expect(prefilter.uniforms.u_tiltShift).toEqual([0.5, 0.2, 0, 1]);
    expect(postStagesRan()).toContain("S6:dof-tilt-shift-rings3");
  });

  it("keeps the thin-lens path (u_tiltShift.w = 0) without a band", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, dof } as never, CAMERA);
    const prefilter = rec.draws.find((d) => d.fragment.includes("u_tiltShift"))!;
    expect(prefilter.uniforms.u_tiltShift).toEqual([0, 0, 0, 0]);
    expect(postStagesRan()).toContain("S6:dof-rings3");
  });

  it("writes u_density into the S4 march (1 when godRayDensity is not authored)", () => {
    const godRays = { samples: 32, decay: 0.94, weight: 0.7, intensity: 0.7, color: [1, 0.9, 0.8] };
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, godRays: { ...godRays, density: 0.4 } } as never, CAMERA);
    expect(rec.draws.find((d) => d.fragment.includes("u_density"))!.uniforms.u_density).toEqual([0.4]);
    const rec2 = recordingGl();
    runV2HdrStages(fakeHost(rec2.gl), fakeTarget(), { ...BASE, godRays } as never, CAMERA);
    expect(rec2.draws.find((d) => d.fragment.includes("u_density"))!.uniforms.u_density).toEqual([1]);
  });

  // Phase-2 receipt (shaft changed fraction 0): the harness sun pointed down and away from the
  // camera, so its projected point sat behind the eye and the shader's step(0, w) fade zeroed
  // every shaft, whatever the density. An authored world point in view keeps S4 live.
  it("a light behind the camera projects with clip w < 0 (S4 fades it out); an authored point in view does not", () => {
    const godRays = { samples: 32, decay: 0.94, weight: 0.7, intensity: 0.7, color: [1, 0.9, 0.8] };
    const behind = recordingGl();
    runV2HdrStages(fakeHost(behind.gl), fakeTarget(), { ...BASE, godRays: { ...godRays, lightDirection: [0, 0.6, 0.8] } } as never, CAMERA);
    expect(behind.draws.find((d) => d.fragment.includes("u_density"))!.uniforms.u_lightClipW![0]).toBeLessThan(0);
    const inView = recordingGl();
    runV2HdrStages(fakeHost(inView.gl), fakeTarget(), { ...BASE, godRays: { ...godRays, lightDirection: [0, 0.6, 0.8], lightWorld: [0, 1, -20] } } as never, CAMERA);
    const draw = inView.draws.find((d) => d.fragment.includes("u_density"))!;
    expect(draw.uniforms.u_lightClipW![0]).toBeGreaterThan(0);
    expect(draw.uniforms.u_lightUv![0]).toBeCloseTo(0.5, 5);
    expect(draw.uniforms.u_lightUv![1]).toBeCloseTo(0.5, 5);
  });
});

describe("CPU mirror of the band CoC (tiltShiftCocPx)", () => {
  // Same math as DOF_PREFILTER_GLSL::tiltShiftCocPx for a horizontal band.
  const coc = (screenY: number, center: number, width: number, maxBlur: number) => {
    const halfBand = 0.5 * width;
    const ramp = Math.max(0.05, 0.5 - halfBand);
    return Math.min(1, Math.max(0, (Math.abs(screenY - center) - halfBand) / ramp)) * maxBlur;
  };

  it("is sharp inside the band and reaches maxBlur at the ramp end", () => {
    expect(coc(0.5, 0.5, 0.2, 12)).toBe(0);
    expect(coc(0.59, 0.5, 0.2, 12)).toBe(0);
    expect(coc(0.0, 0.5, 0.2, 12)).toBeCloseTo(12, 6);
    expect(coc(1.0, 0.5, 0.2, 12)).toBeCloseTo(12, 6);
    expect(coc(0.8, 0.5, 0.2, 12)).toBeCloseTo(6, 6);
  });

  it("the shader carries the same constants", () => {
    expect(DOF_PREFILTER_GLSL).toContain("float ramp = max(0.05, 0.5 - halfBand);");
    expect(DOF_PREFILTER_GLSL).toContain("if (u_tiltShift.w > 0.5) cocPx = tiltShiftCocPx(base, fullMax + 1);");
  });
});

function glslang(): string | null {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return "glslangValidator";
  } catch {
    return null;
  }
}

describe("GLSL ES 3.00 compile (glslangValidator, when installed)", () => {
  const tool = glslang();
  it.runIf(tool !== null).each([
    ["dof prefilter", DOF_PREFILTER_GLSL],
    ["god rays", withDefines(GODRAYS_GLSL, { AURA_GODRAY_SAMPLES: 32 })]
  ])("%s compiles", (_name, source) => {
    const dir = mkdtempSync(join(tmpdir(), "gu47-ec-glsl-"));
    const file = join(dir, "shader.frag");
    writeFileSync(file, source);
    expect(() => execFileSync(tool!, [file], { stdio: "pipe" })).not.toThrow();
  });
});
