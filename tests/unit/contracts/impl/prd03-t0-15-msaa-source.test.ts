import { describe, expect, it } from "vitest";
import { runV2HdrStages } from "../../../../packages/rendering/src/post/v2Stages";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

/**
 * T0-15 (PRD-16 §2.2, FLAG-ON-1): the forward HDR target is multisampled by
 * default, so `runV2HdrStages` must resolve it through
 * `host.resolveMultisampleTarget` before any stage samples its color/depth
 * textures. Before the fix the stages bound the unresolved resolve textures
 * and composited black — the §2.4 bisect arm `$ALL` black frames. These unit
 * cases assert the call ordering; the pixel claim (AO on, sampleCount 4,
 * mean luma > 0.05) is remote-browser evidence only.
 */

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

function fakeGl(): { gl: WebGL2RenderingContext; draws: () => number } {
  let draws = 0;
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({} as never),
    createTexture: () => ({} as never),
    createShader: () => ({} as never),
    createProgram: () => ({} as never),
    getUniformLocation: () => ({} as never),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    drawArrays: () => {
      draws += 1;
      return undefined as never;
    }
  };
  const gl = new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      // GL enum constants read as numbers; anything else is a no-op method.
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    },
    has: () => true
  });
  return { gl: gl as unknown as WebGL2RenderingContext, draws: () => draws };
}

let fakeTargetSeq = 0;
function fakeTarget(label = `t${++fakeTargetSeq}`): RenderTarget {
  return {
    id: label,
    label,
    width: 16,
    height: 16,
    sampleCount: 4,
    needsResolve: true,
    framebuffer: {},
    colorHandle: {},
    depthTextureHandle: {},
    colorTexture: { format: "rgba16f" },
    dispose: () => undefined
  } as unknown as RenderTarget;
}

function fakeHost(gl: WebGL2RenderingContext): {
  host: WebGL2DeviceHost;
  resolved: () => readonly unknown[];
  invalidations: () => number;
} {
  const resolved: unknown[] = [];
  let invalidations = 0;
  const device = {
    createRenderTarget: () => fakeTarget("pooled")
  };
  const host = {
    gl,
    device,
    stateCache: {
      invalidate: () => {
        invalidations += 1;
      }
    },
    resolveMultisampleTarget: (target: unknown) => {
      resolved.push(target);
    },
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
  return { host, resolved: () => resolved, invalidations: () => invalidations };
}

const CAMERA = { near: 0.1, far: 100, projection: "perspective" } as never;

describe("T0-15 runV2HdrStages resolves the MSAA source (FLAG-ON-1)", () => {
  it("calls resolveMultisampleTarget before the depth requirement check", () => {
    const { gl } = fakeGl();
    const { host, resolved } = fakeHost(gl);
    const source = { ...fakeTarget("src"), depthTextureHandle: null };
    // AO wants linZ; the depth-less source still throws, but only AFTER the
    // resolve call — the ordering is what FLAG-ON-1 fixes.
    expect(() =>
      runV2HdrStages(host, source as RenderTarget, { ...PIPELINE, ao: { samples: 4 } as never }, CAMERA)
    ).toThrowError(/WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED|depth texture/);
    expect(resolved()).toEqual([source]);
  });

  it("does not resolve when no HDR stage is enabled (early return)", () => {
    const { gl } = fakeGl();
    const { host, resolved } = fakeHost(gl);
    const source = fakeTarget("src");
    const out = runV2HdrStages(host, source, PIPELINE, CAMERA);
    expect(out.target).toBe(source);
    expect(resolved()).toEqual([]);
  });

  it("resolves the source before the CA HDR stage draws", () => {
    const { gl, draws } = fakeGl();
    const { host, resolved } = fakeHost(gl);
    const source = fakeTarget("src");
    const out = runV2HdrStages(
      host,
      source,
      { ...PIPELINE, chromaticAberration: { intensity: 1 } as never },
      CAMERA
    );
    expect(resolved()).toEqual([source]);
    expect(draws()).toBeGreaterThan(0);
    expect(out.target).not.toBe(source);
  });
});
