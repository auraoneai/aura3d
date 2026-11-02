import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import { invalidateSelectiveBloomFrame, selectiveItemsDecline } from "../../../../packages/rendering/src/ForwardPass";
import { blockingEarlyPass } from "../../../../packages/rendering/src/renderer/SelectiveBloom";
import { registeredPostPasses, type PostInsertAt, type PostPassDescriptor } from "../../../../packages/rendering/src/contracts/post";
import { registerPrd10UnderwaterFeatures } from "../../../../packages/rendering/src/world/water/UnderwaterState";
import { MockRenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../../packages/rendering/src/RenderDevice";
import { ProgramCache, prewarmCapturedSelectiveBloom } from "../../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import {
  BLOOM_WEIGHT_GLSL,
  bloomPrefilterExcess,
  resolveBloomWeight,
  selectiveBloomActive
} from "../../../../packages/rendering/src/postprocess/NativeBloomPyramid";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { postSkippedReasons, resetPostSkipped, setSelectiveBloomSkipped } from "../../../../packages/rendering/src/renderer/postSkipped";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";

/**
 * GU47 E-C WP-3 item 7: per-material `bloom` weight (0..2, default 1) applied
 * by the bloom prefilter. HDR alpha is never the weight (it carries coverage
 * and the S2 indirect-fraction tag). The bridge only forwards a request
 * marker; the renderer writes a separate half-weighted signal attachment when
 * it can verify the whole frame, and otherwise keeps ordinary bloom and
 * reports `POST_SELECTIVE_BLOOM_UNAVAILABLE:<reason>` per frame in
 * `diagnostics().post.skipped`. This proves the weight math, the shader
 * helper, the bridge request and the reporting channel.
 */

describe("bloom weight math", () => {
  it("clamps the material weight to [0, 2] and defaults to 1", () => {
    expect(resolveBloomWeight(undefined)).toBe(1);
    expect(resolveBloomWeight(Number.NaN)).toBe(1);
    expect(resolveBloomWeight(0)).toBe(0);
    expect(resolveBloomWeight(1.5)).toBe(1.5);
    expect(resolveBloomWeight(9)).toBe(2);
    expect(resolveBloomWeight(-1)).toBe(0);
  });

  it("is selective only when a weight differs from 1", () => {
    expect(selectiveBloomActive([])).toBe(false);
    expect(selectiveBloomActive([1, undefined, 1])).toBe(false);
    expect(selectiveBloomActive([1, 0])).toBe(true);
    expect(selectiveBloomActive([3])).toBe(true);
  });

  it("weight 1 reproduces the unweighted prefilter exactly; weight 0 removes the texel", () => {
    const lamp: [number, number, number] = [8, 6, 3];
    const off = bloomPrefilterExcess(lamp, 1, 1, 0.25, false);
    expect(bloomPrefilterExcess(lamp, 1, 1, 0.25, true)).toEqual(off);
    expect(off[0]).toBeGreaterThan(0);
    // A white wall above threshold at weight 0 contributes nothing.
    expect(bloomPrefilterExcess([1.4, 1.4, 1.4], 0, 1, 0.25, true)).toEqual([0, 0, 0]);
    // Weight 2 doubles the excess; the clamp keeps 5 at 2.
    const doubled = bloomPrefilterExcess(lamp, 2, 1, 0.25, true);
    expect(doubled[0]).toBeCloseTo(off[0] * 2, 9);
    expect(bloomPrefilterExcess(lamp, 5, 1, 0.25, true)).toEqual(doubled);
    // Selective off ignores alpha entirely (today's behaviour for any alpha).
    expect(bloomPrefilterExcess(lamp, 0.3, 1, 0.25, false)).toEqual(off);
  });
});

describe("bridge: pipeline.bloom.selective", () => {
  // The v2 bag types its stage options as `unknown`; the tests read them loosely.
  const result = (...nodes: unknown[]) => createRootPostPipeline({ nodes } as never, undefined, undefined, QUALITY_TIERS.high);
  const derive = (...nodes: unknown[]): Record<string, any> => result(...nodes).options;
  const bloomNode = () => effects.bloom({ intensity: 0.5 }).toJSON();
  const box = (material: Record<string, unknown>) => ({ kind: "primitive", primitive: "box", material });

  // GU47 phase 2 (receipt effects-selective-bloom: the weight-0 wall bloomed by 157): generated
  // programs put the S2 indirect-fraction tag (2 + f_ind) in HDR alpha, which an alpha-weighted
  // prefilter clamps to weight 2 for every opaque pixel. The bridge therefore never stamps
  // `selective`; it forwards a request only, and availability is decided (and reported, below)
  // per frame by the renderer, which alone can verify the target, programs and producers.
  it("a weight other than 1 is forwarded as a request only and never stamps the prefilter's alpha weight", () => {
    const { options, diagnostics } = result(bloomNode(), box({ color: "#fff", bloom: 0 }), box({ color: "#fa0", emissive: "#fa0" }));
    expect((options as Record<string, any>).bloom && "selective" in (options as Record<string, any>).bloom).toBe(false);
    expect((options as Record<string, any>).bloom).toEqual({ ...derive(bloomNode(), box({ color: "#fff" })).bloom, selectiveRequested: true });
    // No compile-time claim either way: the bridge cannot know whether a frame can carry the signal.
    expect(diagnostics.map((d) => d.code)).not.toContain("POST_SELECTIVE_BLOOM_UNAVAILABLE");
    expect(result(bloomNode(), box({ color: "#fff" })).diagnostics.map((d) => d.code)).not.toContain("POST_SELECTIVE_BLOOM_UNAVAILABLE");
  });

  it("a weight on a producer the renderer cannot carry is marked unsupported for the per-frame report", () => {
    const bag = derive(bloomNode(), { kind: "sprite", material: { color: "#fff", bloom: 0 } }).bloom;
    expect(bag).toMatchObject({ selectiveRequested: true, selectiveUnsupportedSource: true });
    expect("selective" in bag).toBe(false);
  });

  it("the renderer's per-frame fallback reason reaches post.skipped for that canvas only", () => {
    resetPostSkipped();
    const first = {};
    const second = {};
    setSelectiveBloomSkipped(first, "frame-contributor");
    setSelectiveBloomSkipped(second, undefined);
    expect(postSkippedReasons(first)).toContain("POST_SELECTIVE_BLOOM_UNAVAILABLE:frame-contributor");
    expect(postSkippedReasons(second).some((reason) => reason.startsWith("POST_SELECTIVE_BLOOM_UNAVAILABLE"))).toBe(false);
    // A later successful frame clears that canvas's reason.
    setSelectiveBloomSkipped(first, undefined);
    expect(postSkippedReasons(first).some((reason) => reason.startsWith("POST_SELECTIVE_BLOOM_UNAVAILABLE"))).toBe(false);
    resetPostSkipped();
  });

  it("the generated forward path's alpha tag would read as weight 2 (why the stamp is withheld)", () => {
    const lamp: [number, number, number] = [8, 6, 3];
    // AO_INDIRECT_FRACTION_TAG (2) + f_ind on an opaque pixel of a weight-0 material.
    expect(bloomPrefilterExcess(lamp, 2.3, 1, 0.25, true)[0]).toBeCloseTo(bloomPrefilterExcess(lamp, 1, 1, 0.25, false)[0] * 2, 9);
  });

  it("leaves the bag unchanged when every weight is 1 (or absent)", () => {
    const base = derive(bloomNode(), box({ color: "#fff" }));
    const ones = derive(bloomNode(), box({ color: "#fff", bloom: 1 }));
    expect(ones).toEqual(base);
    expect(base.bloom && "selective" in base.bloom).toBe(false);
  });

  it("needs a bloom effect to mean anything", () => {
    expect(derive(box({ bloom: 0 })).bloom).toBeUndefined();
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

describe("BLOOM_WEIGHT_GLSL (glslangValidator, when installed)", () => {
  const tool = glslang();
  it.runIf(tool !== null)("compiles inside a prefilter-shaped GLSL ES 3.00 fragment", () => {
    const source = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform float u_threshold;
uniform float u_softKnee;
uniform int u_bloomSelective;
out vec4 outColor;
${BLOOM_WEIGHT_GLSL}
void main() {
  vec4 source = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
  float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
  float knee = max(u_softKnee, 0.0);
  float soft = clamp(luma - u_threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  float excessWeight = max(soft, luma - u_threshold) / max(luma, 1e-5) * auraBloomWeight(source.a, u_bloomSelective);
  outColor = vec4(source.rgb * excessWeight, source.a);
}
`;
    const dir = mkdtempSync(join(tmpdir(), "gu47-ec-bloom-"));
    const file = join(dir, "prefilter.frag");
    writeFileSync(file, source);
    expect(() => execFileSync(tool!, [file], { stdio: "pipe" })).not.toThrow();
  });
});

describe("preflight: conditional early passes and the draw-level pre-decline", () => {
  const pass = (insertAt: PostInsertAt, enabled?: () => boolean) => ({
    id: "test.pass", insertAt, space: insertAt === "after-tonemap" ? "display" : "linear-hdr", inputs: ["color"], fragment: { glsl: "" }, gpuOnly: true,
    ...(enabled ? { enabled } : {})
  }) as unknown as PostPassDescriptor;

  it("a registered pass with an enabled predicate does not block the separate signal; a registered early pass without one does", () => {
    expect(blockingEarlyPass([pass("after-depth", () => false)])).toBeUndefined();
    expect(blockingEarlyPass([pass("before-taa", () => true), pass("after-taa", () => false)])).toBeUndefined();
    const blocking = pass("after-depth");
    expect(blockingEarlyPass([pass("after-depth", () => false), blocking])).toBe(blocking);
    expect(blockingEarlyPass([])).toBeUndefined();
  });

  it("an early pass the caller supplies in pipeline.customPasses blocks even when it carries an enabled predicate", () => {
    const supplied = pass("after-depth", () => false);
    expect(blockingEarlyPass([], [supplied])).toBe(supplied);
    expect(blockingEarlyPass([pass("after-depth", () => false)], [pass("before-tonemap"), supplied])).toBe(supplied);
  });

  it("passes at before-tonemap and after-tonemap never block", () => {
    expect(blockingEarlyPass([pass("before-tonemap"), pass("after-tonemap")], [pass("before-tonemap"), pass("after-tonemap")])).toBeUndefined();
  });

  it("the underwater distortion the engine registers at import is conditional (this is what held the receipt back)", () => {
    const find = () => registeredPostPasses().find((candidate) => candidate.id === "prd10.underwaterDistortion");
    const dispose = find() ? undefined : registerPrd10UnderwaterFeatures();
    try {
      const underwater = find();
      expect(underwater?.insertAt).toBe("after-depth");
      expect(typeof underwater?.enabled).toBe("function");
      expect(blockingEarlyPass([underwater!])).toBeUndefined();
    } finally {
      dispose?.();
    }
  });

  it("selectiveItemsDecline names the first draw that cannot write the signal, before any target is chosen", () => {
    const stock = () => ({ geometry: Geometry.litCube(1), material: new PBRMaterial({ name: "stock" }), modelMatrix: Float32Array.from(identityMat4()), label: "stock" });
    expect(selectiveItemsDecline([])).toBeNull();
    expect(selectiveItemsDecline([stock(), stock()] as never)).toBeNull();
    expect(selectiveItemsDecline([stock(), { ...stock(), instanceTransforms: new Float32Array(16) }] as never)).toBe("draw-producer");
    expect(selectiveItemsDecline([{ ...stock(), skinning: {} }] as never)).toBe("draw-producer");
    expect(selectiveItemsDecline([{ ...stock(), material: new PBRMaterial({ name: "glass", renderState: { blendMode: "alpha" } }) }] as never)).toBe("transparent-or-transmission");
    expect(selectiveItemsDecline([{ ...stock(), material: { name: "custom" } }] as never)).toBe("material-program");
  });

  it("the first invalidation of a frame turns the signal draw buffer off once, and keeps the first reason", () => {
    const calls: boolean[] = [];
    const frame: { enabled: boolean; valid: boolean; invalidReason?: string; setSignalWrite: (enabled: boolean) => void } = {
      enabled: true, valid: true, setSignalWrite: (enabled) => { calls.push(enabled); }
    };
    invalidateSelectiveBloomFrame(frame, "draw-producer");
    invalidateSelectiveBloomFrame(frame, "signal-program-unprepared");
    expect(calls).toEqual([false]);
    expect(frame.valid).toBe(false);
    expect(frame.invalidReason).toBe("draw-producer");
    // a frame without the hook (any scene that never selected the target) is unchanged
    const plain = { valid: true, invalidReason: undefined as string | undefined };
    invalidateSelectiveBloomFrame(plain, "material-program");
    expect(plain).toEqual({ valid: false, invalidReason: "material-program" });
  });
});

describe("captured selective prewarm: the derived twin is memoised on its base entry", () => {
  it("repeat prewarms reuse one derived entry, one derived source object and one twin compile", async () => {
    const device = new MockRenderDevice();
    const compiled: ShaderSources[] = [];
    const compile = (sources: ShaderSources): Promise<RenderShaderProgram> => {
      compiled.push(sources);
      return Promise.resolve(device.createShaderProgram(sources));
    };
    Object.defineProperty(device, "compileAsync", { value: compile });
    // The prewarm authenticates the cache by its exact flags value; with none, no registered feature contributes and
    // this lit forward record is provenance-safe.
    const flags = undefined as unknown as QrFlags;
    const cache = new ProgramCache(device, { parallelCompile: true });
    const base = cache.acquire(normalizeProgramFeatures({ lighting: "lit", pass: "forward", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }));
    await cache.precompile([]);
    expect(base.status).toBe("ready");
    const derived = () => (base as unknown as { selectiveDerived?: { readonly key?: string; readonly sources?: ShaderSources } }).selectiveDerived;
    const first = prewarmCapturedSelectiveBloom(cache, device, flags, compile);
    const memo = derived();
    const second = prewarmCapturedSelectiveBloom(cache, device, flags, compile);
    expect(first.reason).toBeUndefined();
    expect(first.handles).toHaveLength(1);
    expect(second.handles).toHaveLength(1);
    expect(second.handles![0]).toBe(first.handles![0]);
    expect(first.handles![0]!.key).toBe(memo?.key);
    expect(derived()).toBe(memo);
    expect(memo?.sources?.fragment).toContain("a3dBloomSignal");
    // The base compile, then the twin once, from the memoised source object.
    expect(compiled).toHaveLength(2);
    expect(compiled[1]).toBe(memo?.sources);
    cache.dispose();
  });
});
