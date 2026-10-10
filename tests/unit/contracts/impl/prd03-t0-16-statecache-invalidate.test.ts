import { describe, expect, it } from "vitest";
import { runV2HdrStages, runV2LdrTail } from "../../../../packages/rendering/src/post/v2Stages";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

/**
 * T0-16 (PRD-16 §2.2, FLAG-ON-2): `runV2HdrStages`/`runV2LdrTail` issue raw
 * GL (`draw()`, `bindOut`) that bypasses `host.stateCache`, so its cached
 * program/VAO/FBO/texture state no longer matches the driver — the next
 * cached-state consumer skips re-issuing state the v2 driver mutated
 * (frame-2 black draws in the vignette+SMAA spec). These cases assert the
 * invalidate runs on every exit that touched GL; the two-frame pixel claim
 * is remote-browser evidence only.
 */

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

function fakeGl(): WebGL2RenderingContext {
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({} as never),
    createTexture: () => ({} as never),
    createShader: () => ({} as never),
    createProgram: () => ({} as never),
    getUniformLocation: () => ({} as never),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => ""
  };
  const gl = new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    },
    has: () => true
  });
  return gl as unknown as WebGL2RenderingContext;
}

let fakeTargetSeq = 0;
function fakeTarget(format: "rgba8" | "rgba16f" = "rgba8"): RenderTarget {
  return {
    id: `t${++fakeTargetSeq}`,
    label: `t${fakeTargetSeq}`,
    width: 16,
    height: 16,
    sampleCount: 1,
    needsResolve: false,
    framebuffer: {},
    colorHandle: {},
    depthTextureHandle: null,
    colorTexture: { format },
    dispose: () => undefined
  } as unknown as RenderTarget;
}

function fakeHost(gl: WebGL2RenderingContext): { host: WebGL2DeviceHost; invalidations: () => number } {
  let invalidations = 0;
  const device = { createRenderTarget: () => fakeTarget("rgba8" === "rgba8" ? "rgba8" : "rgba16f") };
  const host = {
    gl,
    device,
    stateCache: {
      invalidate: () => {
        invalidations += 1;
      }
    },
    resolveMultisampleTarget: () => undefined,
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
  return { host, invalidations: () => invalidations };
}

const CAMERA = { near: 0.1, far: 100, projection: "perspective" } as never;

describe("T0-16 v2 stage drivers invalidate the GL state cache (FLAG-ON-2)", () => {
  it("runV2LdrTail fused FXAA path invalidates after the draw", () => {
    const host = fakeHost(fakeGl());
    runV2LdrTail(host.host, fakeTarget(), { ...PIPELINE, antiAliasing: "fxaa" }, undefined);
    expect(host.invalidations()).toBe(1);
  });

  it("runV2LdrTail grade+finalize path invalidates after the draws", () => {
    const host = fakeHost(fakeGl());
    runV2LdrTail(host.host, fakeTarget(), { ...PIPELINE, vignette: { intensity: 0.5 } as never }, undefined);
    expect(host.invalidations()).toBe(1);
  });

  it("runV2HdrStages invalidates after an HDR stage ran", () => {
    const host = fakeHost(fakeGl());
    const source = { ...fakeTarget("rgba16f"), depthTextureHandle: {} };
    runV2HdrStages(host.host, source, { ...PIPELINE, chromaticAberration: { intensity: 1 } as never }, CAMERA);
    expect(host.invalidations()).toBe(1);
  });

  it("runV2HdrStages early return does not invalidate (GL untouched)", () => {
    const host = fakeHost(fakeGl());
    runV2HdrStages(host.host, fakeTarget("rgba16f"), PIPELINE, CAMERA);
    expect(host.invalidations()).toBe(0);
  });
});
