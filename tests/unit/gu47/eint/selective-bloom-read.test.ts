import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WebGL2StateCache } from "../../../../packages/rendering/src/WebGL2StateCache";
import { WebGL2SamplerRegistry } from "../../../../packages/rendering/src/webgl2/Samplers";
import { WebGL2ContextLifecycle } from "../../../../packages/rendering/src/webgl2/ContextLifecycle";
import { BLOOM_BRIGHT_EXTRACT_GLSL, WebGL2LegacyPostPipeline, normalizeNativeBloomOptions } from "../../../../packages/rendering/src/webgl2/LegacyPost";
import { resolveBloomPyramidPlan } from "../../../../packages/rendering/src/postprocess/NativeBloomPyramid";

/**
 * GU47 eint EC-6 (E-C handoff 6, EC-7 live read): the native HDR bloom
 * prefilters multiply the soft-knee excess by the material bloom weight carried
 * in HDR alpha, only when the bridge stamps `selective` (a scene material
 * declares a weight other than 1). Unstamped, `u_bloomSelective` is 0 and the
 * factor is exactly 1.0.
 */

type UniformWrite = { readonly program: string; readonly name: string; readonly value: number };

function countingPipeline() {
  const writes: UniformWrite[] = [];
  const sources: string[] = [];
  let program = "none";
  const known: Record<string, unknown> = {
    TEXTURE0: 33984, TEXTURE_2D: 3553, FRAMEBUFFER: 36160, NO_ERROR: 0, TRIANGLES: 4, COLOR_BUFFER_BIT: 16384,
    useProgram: (value: { name: string } | null) => { program = value?.name ?? "none"; },
    getUniformLocation: (_program: unknown, name: string) => name,
    uniform1i: (location: string, value: number) => { writes.push({ program, name: location, value }); },
    getParameter: () => null, isEnabled: () => false, getError: () => 0
  };
  const gl = new Proxy(known, { get: (target, property: string) => (property in target ? target[property] : () => null) }) as unknown as WebGL2RenderingContext;
  const device = { bloomFusedPasses: true, bloomFusion: { accumulate: true, blur2dFromLevel: 3, extract: true } };
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
  const fields = post as unknown as Record<string, unknown>;
  fields.createFullscreenProgram = (source: string) => {
    sources.push(source);
    return { name: `program-${sources.length}` } as unknown as WebGLProgram;
  };
  return { post, writes, sources };
}

function runPyramid(selective: boolean) {
  const { post, writes } = countingPipeline();
  const plan = resolveBloomPyramidPlan(320, 180, "cinematic", true);
  const handle = (id: string) => ({ id }) as never;
  const resources = {
    plan, hdr: true,
    textures: plan.mips.flatMap((_m, i) => [handle(`t${i}a`), handle(`t${i}b`)]),
    framebuffers: plan.mips.flatMap((_m, i) => [handle(`f${i}a`), handle(`f${i}b`)]),
    accumulatorTextureA: handle("accA"), accumulatorFramebufferA: handle("accFA"), accumulatorTextureB: handle("accB"), accumulatorFramebufferB: handle("accFB")
  };
  const staging = { textureA: handle("sA"), framebufferA: handle("sFA"), textureB: handle("sB"), framebufferB: handle("sFB") };
  const options = {
    ...normalizeNativeBloomOptions({ v2: true, threshold: 1, knee: 0.5, intensity: 1, ...(selective ? { selective: true } : {}) }),
    spread: 0.6
  };
  post.executeNativeBloomPyramidPasses(handle("src"), 320, 180, resources as never, staging as never, options as never, handle("vao"), true);
  return writes.filter((write) => write.name === "u_bloomSelective");
}

describe("GU47 eint EC-6: selective bloom weight read in the native prefilter", () => {
  it("normalize keeps `selective` only on v2 options that ask for it", () => {
    expect(normalizeNativeBloomOptions({ v2: true, threshold: 1, selective: true }).selective).toBe(true);
    expect(normalizeNativeBloomOptions({ v2: true, threshold: 1 })).not.toHaveProperty("selective");
    expect(normalizeNativeBloomOptions({ v2: true, threshold: 1, selective: "yes" })).not.toHaveProperty("selective");
    // Flag-off (legacy gate) never weights by alpha.
    expect(normalizeNativeBloomOptions({ threshold: 0.8, selective: true })).not.toHaveProperty("selective");
  });

  it("the pyramid prefilter writes u_bloomSelective = 1 only when stamped", () => {
    const on = runPyramid(true);
    const off = runPyramid(false);
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((write) => write.value === 1)).toBe(true);
    expect(off.length).toBe(on.length);
    expect(off.every((write) => write.value === 0)).toBe(true);
  });

  it("both HDR prefilter fragments weight the excess by auraBloomWeight(alpha)", () => {
    const { post, sources } = countingPipeline();
    post.ensureBloomPrefilterDownsampleProgram();
    const fused = sources[0]!;
    for (const source of [BLOOM_BRIGHT_EXTRACT_GLSL, fused]) {
      expect(source).toContain("uniform int u_bloomSelective;");
      expect(source).toContain("float auraBloomWeight(float alpha, int selective)");
      expect(source).toContain("max(soft, luma - u_threshold) / max(luma, 1e-5) * auraBloomWeight(source.a, u_bloomSelective)");
    }
  });

  const tool = (() => {
    try {
      execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
      return "glslangValidator";
    } catch {
      return null;
    }
  })();
  it.runIf(tool !== null)("the fused prefilter-downsample fragment compiles with glslangValidator", () => {
    const { post, sources } = countingPipeline();
    post.ensureBloomPrefilterDownsampleProgram();
    const dir = mkdtempSync(join(tmpdir(), "gu47-eint-bloom-prefilter-"));
    const file = join(dir, "bloom_prefilter.frag");
    writeFileSync(file, sources[0]!);
    let log = "";
    try {
      log = execFileSync(tool!, ["-S", "frag", file], { encoding: "utf8" });
    } catch (error) {
      log = String((error as { stdout?: string }).stdout ?? error);
      throw new Error(log);
    }
    expect(log).not.toMatch(/ERROR/);
  });
});
