/**
 * PRD-10 P2 "UnderwaterState post" — the lane-03 v2 post graph must not
 * compile `prd10.underwaterDistortion` while `UNDERWATER_KEY` is false, and
 * the pass body must be a valid §6.12 custom pass (prelude-compatible, has a
 * `main()`), so it compiles once enabled.
 *
 * The fake GL records every `shaderSource` call, so "compiled" means the
 * v2 `program()` cache really built the pass's fragment program.
 */
import { afterEach, describe, expect, it } from "vitest";
import { runV2HdrStages, customPassFragmentSource } from "../../../../packages/rendering/src/post/v2Stages";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { registeredPostPasses, type PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import { resetPostSkipped } from "../../../../packages/rendering/src/renderer/postSkipped";
import {
  registerPrd10UnderwaterFeatures,
  UNDERWATER_DISTORTION_GLSL,
  UNDERWATER_KEY
} from "../../../../packages/rendering/src/world/water/UnderwaterState";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

const PASS_ID = "prd10.underwaterDistortion";
const WORLD_POST_FLAGS = { on: (n: string) => n === "A3D_QR_WORLD" || n === "A3D_QR_POST", any: () => true } as never;
const EMPTY_FLAGS = { on: () => false, any: () => false } as never;
const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

function tracingGl(sources: string[]): WebGL2RenderingContext {
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({}) as never,
    createTexture: () => ({}) as never,
    createFramebuffer: () => ({}) as never,
    createBuffer: () => ({}) as never,
    createShader: () => ({}) as never,
    createProgram: () => ({}) as never,
    shaderSource: ((_s: unknown, src: string) => { sources.push(src); }) as never,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    checkFramebufferStatus: () => 0x8cd5,
    getUniformLocation: () => ({}) as never
  };
  return new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "FRAMEBUFFER_COMPLETE") return 0x8cd5;
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    },
    has: () => true
  }) as unknown as WebGL2RenderingContext;
}

let seq = 0;
function fakeTarget(): RenderTarget {
  return {
    id: `uw-${++seq}`, label: `uw-${seq}`, width: 16, height: 16, sampleCount: 1, needsResolve: false,
    framebuffer: {}, colorHandle: {}, depthTextureHandle: {}, colorTexture: { format: "rgba16f" },
    dispose: () => undefined
  } as unknown as RenderTarget;
}

function fakeHost(sources: string[]): WebGL2DeviceHost {
  return {
    gl: tracingGl(sources),
    device: { createRenderTarget: () => fakeTarget() },
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
}

const compiledDistortion = (sources: readonly string[]): number =>
  sources.filter((s) => s.includes("a3dUnderwaterDistort")).length;

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
  setRendererQrFlags(EMPTY_FLAGS);
  resetPostSkipped();
});

describe("PRD-10 UnderwaterState — prd10.underwaterDistortion in the v2 post graph", () => {
  it("is registered at after-depth in linear-hdr, gated on UNDERWATER_KEY", () => {
    unregister = registerPrd10UnderwaterFeatures();
    const pass = registeredPostPasses().find((p) => p.id === PASS_ID)!;
    expect(pass).toBeDefined();
    expect(pass.insertAt).toBe("after-depth");
    expect(pass.space).toBe("linear-hdr");
    const frame = (value: unknown) => ({ blackboard: new Map([[UNDERWATER_KEY, value]]) }) as never;
    expect(pass.enabled?.(frame(false))).toBe(false);
    expect(pass.enabled?.({ blackboard: new Map() } as never)).toBe(false);
    expect(pass.enabled?.(frame(true))).toBe(true);
  });

  it("world,post: the pass is never compiled while UNDERWATER_KEY is false (frames 1..3)", () => {
    setRendererQrFlags(WORLD_POST_FLAGS);
    unregister = registerPrd10UnderwaterFeatures();
    const sources: string[] = [];
    const host = fakeHost(sources);
    const source = fakeTarget();
    for (let frame = 0; frame < 3; frame++) {
      const out = runV2HdrStages(host, source, PIPELINE, null);
      expect(out.target).toBe(source); // pass-through: no distortion target acquired
    }
    expect(compiledDistortion(sources)).toBe(0);
  });

  it("world,post: once enabled it compiles exactly once (program cache) and renders into a new target", () => {
    setRendererQrFlags(WORLD_POST_FLAGS);
    unregister = registerPrd10UnderwaterFeatures();
    const pass = registeredPostPasses().find((p) => p.id === PASS_ID)!;
    // Bag-supplied override with the same id wins the dedupe in mergedCustomPasses.
    const pipeline = { ...PIPELINE, customPasses: [{ ...pass, enabled: () => true }] };
    const sources: string[] = [];
    const host = fakeHost(sources);
    const source = fakeTarget();
    const a = runV2HdrStages(host, source, pipeline, null);
    runV2HdrStages(host, source, pipeline, null);
    expect(a.target).not.toBe(source);
    expect(compiledDistortion(sources)).toBe(1);
  });

  it("the fragment is a valid §6.12 custom pass: no prelude redeclaration, a main(), reads u_color", () => {
    const strip = (s: string): string => s.replace(/\/\/[^\n]*/g, "");
    const body = strip(UNDERWATER_DISTORTION_GLSL);
    for (const builtin of ["u_color", "u_depthLinear", "u_velocity", "u_texelSize", "u_time", "v_uv", "outColor"]) {
      expect(body, builtin).not.toMatch(new RegExp(`^\\s*(uniform|in|out)\\s+\\w+\\s+${builtin}\\b`, "m"));
    }
    expect(body).toMatch(/void main\(\)\s*\{[^}]*outColor\s*=/);
    expect(body).toContain("texture(u_color");
    expect(body).not.toMatch(/u_scene|u_normals/);
    const full = customPassFragmentSource(UNDERWATER_DISTORTION_GLSL);
    expect(full.match(/uniform float u_time;/g)).toHaveLength(1);
  });
});
