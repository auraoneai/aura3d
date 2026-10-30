import { afterEach, describe, expect, it } from "vitest";
import { runV2LdrTail, type PostFrameContextBag } from "../../../../packages/rendering/src/post/v2Stages";
import { beginPostStageTrace, postStagesRan, resetPostSkipped } from "../../../../packages/rendering/src/renderer/postSkipped";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import type { PostPassDescriptor, PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import type { Texture } from "../../../../packages/rendering/src/Texture";

/**
 * GU47 eint, E-E handoff H2: `runV2LdrTail` binds linear depth for `after-tonemap` customs that declare
 * `inputs: ["depth"]` (the default slot of `toon({ inkSource: "depth" | "both", fadeDistance })`). The scene depth
 * from the C-13 frame context is linearised once per tail with the S1 program and bound at unit 1
 * (`u_depthLinear`); without scene depth, or for colour-only customs, nothing changes (the 1x1 blank binds).
 */

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const POST_FLAGS = { on: (name: string) => name === "A3D_QR_POST", any: () => false } as never;
const EMPTY_FLAGS = { on: () => false, any: () => false } as never;
const TEXTURE0 = 33984;

interface DrawRecord {
  readonly fragment: string;
  readonly units: ReadonlyMap<number, unknown>;
  readonly framebuffer: unknown;
  readonly uniforms: ReadonlyMap<string, readonly number[]>;
}

function recordingGl(draws: DrawRecord[]): { gl: WebGL2RenderingContext; textures: unknown[] } {
  const textures: unknown[] = [];
  let unit = 0;
  let framebuffer: unknown = null;
  let program: { shaders: { source?: string }[] } | null = null;
  let units = new Map<number, unknown>();
  let uniforms = new Map<string, readonly number[]>();
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({}) as never,
    createTexture: (() => { const texture = { texture: textures.length }; textures.push(texture); return texture; }) as never,
    createFramebuffer: () => ({}) as never,
    createShader: () => ({}) as never,
    shaderSource: ((shader: { source?: string }, source: string) => { shader.source = source; }) as never,
    createProgram: () => ({ shaders: [] }) as never,
    attachShader: ((prog: { shaders: unknown[] }, shader: unknown) => { prog.shaders.push(shader); }) as never,
    useProgram: ((prog: typeof program) => { program = prog; uniforms = new Map(); }) as never,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    checkFramebufferStatus: () => 0x8cd5,
    activeTexture: ((value: number) => { unit = value - TEXTURE0; }) as never,
    bindTexture: ((_target: number, texture: unknown) => { units.set(unit, texture); }) as never,
    bindFramebuffer: ((_target: number, fb: unknown) => { framebuffer = fb; }) as never,
    getUniformLocation: ((_prog: unknown, name: string) => name) as never,
    uniform1i: ((name: string, value: number) => { uniforms.set(name, [value]); }) as never,
    uniform1f: ((name: string, value: number) => { uniforms.set(name, [value]); }) as never,
    drawArrays: (() => {
      draws.push({ fragment: program?.shaders.map((shader) => shader.source ?? "").join("\n") ?? "", units: new Map(units), framebuffer, uniforms: new Map(uniforms) });
      units = new Map(units);
    }) as never
  };
  const gl = new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      if (prop === "TEXTURE0") return TEXTURE0;
      if (prop === "FRAMEBUFFER_COMPLETE") return 0x8cd5;
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    },
    has: () => true
  }) as unknown as WebGL2RenderingContext;
  return { gl, textures };
}

let seq = 0;
function fakeTarget(format: "rgba8" | "rgba16f" | "rgba32f" = "rgba8"): RenderTarget {
  const id = ++seq;
  return {
    id: `eint-h2-${id}`, label: `eint-h2-${id}`, width: 16, height: 16, sampleCount: 1, needsResolve: false,
    framebuffer: { fb: id }, colorHandle: { color: id }, depthTextureHandle: null,
    colorTexture: { format }, dispose: () => undefined
  } as unknown as RenderTarget;
}

function fakeHost(draws: DrawRecord[], registry: Map<Texture, WebGLTexture>): WebGL2DeviceHost {
  const { gl } = recordingGl(draws);
  return {
    gl,
    device: { createRenderTarget: (options: { format?: string }) => fakeTarget((options?.format ?? "rgba8") as "rgba8") },
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    lifecycle: { bindOutput: () => undefined },
    textureRegistry: { textures: registry },
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
}

function displayPass(id: string, inputs: PostPassDescriptor["inputs"]): PostPassDescriptor {
  return {
    id: `eint.${id}`,
    owner: "prd03",
    flag: "A3D_QR_POST",
    insertAt: "after-tonemap",
    space: "display",
    inputs,
    fragment: { glsl: `uniform float u_marker_${id.replace(/-/g, "_")};\nvoid main() { outColor = texture(u_color, v_uv) + texture(u_depthLinear, v_uv); }` },
    gpuOnly: true
  };
}

function frameContext(depthTexture: Texture | null, linearize = { near: 0.5, far: 400, orthographic: false }): PostFrameContextBag {
  return { source: {}, items: [], sceneDepth: { texture: depthTexture, available: depthTexture !== null, linearize } };
}

afterEach(() => {
  setRendererQrFlags(EMPTY_FLAGS);
  resetPostSkipped();
});

describe("GU47 eint H2: the LDR tail binds linear depth for after-tonemap depth customs", () => {
  const depthTexture = { label: "forward-depth" } as unknown as Texture;
  const depthHandle = { gl: "forward-depth-handle" } as unknown as WebGLTexture;

  function run(passes: readonly PostPassDescriptor[], context: PostFrameContextBag | undefined) {
    setRendererQrFlags(POST_FLAGS);
    beginPostStageTrace();
    const draws: DrawRecord[] = [];
    const host = fakeHost(draws, new Map([[depthTexture, depthHandle]]));
    runV2LdrTail(host, fakeTarget("rgba8"), { ...PIPELINE, customPasses: passes }, undefined, context);
    const linearize = draws.filter((draw) => draw.fragment.includes("linearizeDepth(d, u_near, u_far, u_ortho)"));
    const custom = draws.filter((draw) => draw.fragment.includes("u_marker_"));
    return { draws, linearize, custom };
  }

  it("a depth custom gets the scene depth linearised once, bound at unit 1 (u_depthLinear)", () => {
    const { linearize, custom } = run([displayPass("ink-a", ["color", "depth"]), displayPass("ink-b", ["color", "depth"])], frameContext(depthTexture));
    expect(linearize).toHaveLength(1);
    expect(linearize[0]!.units.get(0)).toBe(depthHandle);
    expect(linearize[0]!.uniforms.get("u_near")).toEqual([0.5]);
    expect(linearize[0]!.uniforms.get("u_far")).toEqual([400]);
    expect(linearize[0]!.uniforms.get("u_ortho")).toEqual([0]);
    expect(custom).toHaveLength(2);
    // Both customs sample the linearised target's colour attachment, not the blank.
    const linZColor = custom[0]!.units.get(1);
    expect(linZColor).toEqual(expect.objectContaining({ color: expect.any(Number) }));
    expect(custom[1]!.units.get(1)).toBe(linZColor);
    expect(custom[0]!.uniforms.get("u_depthLinear")).toEqual([1]);
    expect(postStagesRan()).toContain("S1:depth-prep:after-tonemap");
  });

  it("orthographic cameras linearise with u_ortho 1", () => {
    const { linearize } = run([displayPass("ink-ortho", ["color", "depth"])], frameContext(depthTexture, { near: 1, far: 50, orthographic: true }));
    expect(linearize[0]!.uniforms.get("u_ortho")).toEqual([1]);
  });

  it("without scene depth the custom keeps the 1x1 blank and no linearise draw runs", () => {
    for (const context of [undefined, frameContext(null)]) {
      const { linearize, custom } = run([displayPass("ink-none", ["color", "depth"])], context);
      expect(linearize).toHaveLength(0);
      expect(custom).toHaveLength(1);
      expect(custom[0]!.units.get(1)).not.toEqual(expect.objectContaining({ color: expect.any(Number) }));
    }
  });

  it("colour-only display customs never pay for a depth linearise", () => {
    const { linearize, custom } = run([displayPass("grade", ["color"])], frameContext(depthTexture));
    expect(linearize).toHaveLength(0);
    expect(custom).toHaveLength(1);
    expect(postStagesRan()).not.toContain("S1:depth-prep:after-tonemap");
  });
});
