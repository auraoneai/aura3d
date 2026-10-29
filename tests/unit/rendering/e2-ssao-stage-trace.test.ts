/**
 * Audit lane E2 (ssao:normals): the SSAO an AO scene requests runs as S2 GTAO on the v2 chain from depth alone, and
 * the stage trace now records it, so diagnostics().post.stagesRan proves the pass ran.
 */
import { describe, expect, it } from "vitest";
import { runV2HdrStages } from "../../../packages/rendering/src/post/v2Stages";
import { postStagesRan } from "../../../packages/rendering/src/renderer/postSkipped";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";

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


const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0]);
const CAMERA = { near: 0.1, far: 100, projection: "perspective", projectionMatrix: identity, viewMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), viewProjectionMatrix: identity } as never;

describe("S2 GTAO is the executed SSAO and is traced", () => {
  it("an ao pipeline on a depth-bearing source runs S2 (no normals input) and records it", () => {
    const { gl, draws } = fakeGl();
    const { host } = fakeHost(gl);
    const out = runV2HdrStages(host, fakeTarget("src"), { ...PIPELINE, ao: { radius: 0.35, intensity: 1, directions: 4, steps: 4, halfRes: true, temporal: false } as never }, CAMERA);
    expect(postStagesRan()).toContain("S2:gtao-4x4");
    expect(out.skipped).not.toContain("V2_DEPTH_UNAVAILABLE");
    expect(draws()).toBeGreaterThan(2);
  });

  it("no ao: no S2 entry", () => {
    const { gl } = fakeGl();
    const { host } = fakeHost(gl);
    runV2HdrStages(host, fakeTarget("src"), { ...PIPELINE, chromaticAberration: { intensity: 1 } as never }, CAMERA);
    expect(postStagesRan().some((stage) => stage.startsWith("S2:"))).toBe(false);
  });
});
