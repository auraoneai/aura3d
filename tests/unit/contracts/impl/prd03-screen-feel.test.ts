import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { runV2HdrStages } from "../../../../packages/rendering/src/post/v2Stages";
import { createRendererFrameHooks, setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { frameContributors, registerFrameContributor } from "../../../../packages/rendering/src/contracts/frameGraph";
import { registeredPostPasses, type PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import {
  SCREEN_FEEL_CONSUMED_KEY,
  SCREEN_FEEL_GLSL,
  SCREEN_FEEL_KEY,
  SCREEN_FEEL_PASS_ID,
  readScreenFeelUniforms,
  registerScreenFeelConsumer,
  resetScreenFeelPass,
  screenFeelFrameState,
  type ScreenFeelUniformsLike
} from "../../../../packages/rendering/src/post/ScreenFeelPass";
import type { RenderDevice, RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";

/**
 * #207 / Q-03-1: the C-13 consumer of lane 08's `prd08.screenFeel` uniforms
 * (F-08-5). A stand-in `prd08.screenFeel` contributor publishes the uniforms
 * from `collect` and records the `consumed` value it reads there, exactly
 * like `engine/src/agent-api/feel/extension.ts`. The v2 driver runs over a
 * recording GL so the test sees which uniforms the pass uploaded.
 */

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const POST_FLAGS = { values: {}, on: (name: string) => name === "A3D_QR_POST" || name === "A3D_QR_CAMERA" } as never;
const EMPTY_FLAGS = { values: {}, on: () => false } as never;

/** Recording GL: `getUniformLocation` returns `{ name }`; uploads land in `uploads`. */
function recordingGl(uploads: Map<string, readonly number[]>): WebGL2RenderingContext {
  const record = (loc: { name?: string } | null, ...values: number[]) => {
    if (loc?.name) uploads.set(loc.name, values);
  };
  const fns: Record<string, unknown> = {
    createVertexArray: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createBuffer: () => ({}),
    createShader: () => ({}),
    createProgram: () => ({}),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    checkFramebufferStatus: () => 0x8cd5,
    getUniformLocation: (_prog: unknown, name: string) => ({ name }),
    uniform1f: record,
    uniform2f: record,
    uniform3f: record,
    uniform4f: record
  };
  return new Proxy(fns, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === "FRAMEBUFFER_COMPLETE") return 0x8cd5;
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return () => undefined;
    },
    has: () => true
  }) as unknown as WebGL2RenderingContext;
}

let seq = 0;
function fakeTarget(): RenderTarget {
  return {
    id: `feel-${++seq}`,
    label: `feel-${seq}`,
    width: 16,
    height: 16,
    sampleCount: 1,
    needsResolve: false,
    framebuffer: {},
    colorHandle: {},
    depthTextureHandle: {},
    colorTexture: { format: "rgba16f" },
    dispose: () => undefined
  } as unknown as RenderTarget;
}

function fakeDevice(): RenderDevice {
  return { kind: "webgl2", createRenderTarget: () => fakeTarget() } as unknown as RenderDevice;
}

function fakeHost(device: RenderDevice, uploads: Map<string, readonly number[]>): WebGL2DeviceHost {
  return {
    gl: recordingGl(uploads),
    device,
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
}

/** Stand-in for lane 08's `prd08.screenFeel` collect contributor. */
const publisher = {
  uniforms: null as ScreenFeelUniformsLike | null,
  consumedReads: [] as boolean[]
};
const releases: Array<() => void> = [];

beforeAll(() => {
  registerScreenFeelConsumer();
  releases.push(registerFrameContributor({
    id: "prd08.screenFeel",
    owner: "prd08",
    flag: "A3D_QR_CAMERA",
    phases: ["collect"],
    collect(items, ctx) {
      if (publisher.uniforms) ctx.blackboard.set(SCREEN_FEEL_KEY, publisher.uniforms);
      publisher.consumedReads.push(ctx.blackboard.get(SCREEN_FEEL_CONSUMED_KEY) === true);
      return items;
    }
  }));
});

afterEach(() => {
  setRendererQrFlags(EMPTY_FLAGS);
  resetScreenFeelPass();
  publisher.uniforms = null;
  publisher.consumedReads.length = 0;
});

/** One Renderer-shaped frame: collect → post-hdr → v2 HDR stages. */
function frame(device: RenderDevice, uploads: Map<string, readonly number[]>) {
  const hooks = createRendererFrameHooks({ device, width: 16, height: 16, source: [], camera: null });
  hooks.collect([]);
  hooks.runPhase("post-hdr", [], true);
  runV2HdrStages(fakeHost(device, uploads), fakeTarget(), PIPELINE, null);
  return hooks;
}

const HIT: ScreenFeelUniformsLike = { flash: 0.4, chroma: 0.8, radialBlur: 0.5, vignette: 0.3, center: [0.25, -0.5] };

describe("#207 prd03.screenFeel — flag off is unchanged", () => {
  it("the bridge contributor is inactive and the pass is never registered", () => {
    const device = fakeDevice();
    setRendererQrFlags(EMPTY_FLAGS, device);
    expect(frameContributors(EMPTY_FLAGS).map((c) => c.id)).not.toContain(SCREEN_FEEL_PASS_ID);
    publisher.uniforms = HIT;
    const uploads = new Map<string, readonly number[]>();
    const hooks = createRendererFrameHooks({ device, width: 16, height: 16, source: [], camera: null });
    hooks.collect([]);
    hooks.runPhase("post-hdr", [], true);
    expect(registeredPostPasses().map((p) => p.id)).not.toContain(SCREEN_FEEL_PASS_ID);
    expect(hooks.blackboardValue(SCREEN_FEEL_CONSUMED_KEY)).toBeUndefined();
    expect(uploads.size).toBe(0);
  });
});

describe("#207 prd03.screenFeel — flag on consumes prd08.screenFeel", () => {
  it("applies the published uniforms before tonemap and sets consumed on that frame", () => {
    const device = fakeDevice();
    setRendererQrFlags(POST_FLAGS, device);
    setRendererQrFlags(POST_FLAGS);
    publisher.uniforms = HIT;
    const uploads = new Map<string, readonly number[]>();
    const hooks = frame(device, uploads);
    const pass = registeredPostPasses().find((p) => p.id === SCREEN_FEEL_PASS_ID);
    expect(pass?.insertAt).toBe("before-tonemap");
    expect(pass?.space).toBe("linear-hdr");
    expect(uploads.get("u_feelFlash")).toEqual([0.4]);
    expect(uploads.get("u_feelChroma")).toEqual([0.8]);
    expect(uploads.get("u_feelRadialBlur")).toEqual([0.5]);
    expect(uploads.get("u_feelVignette")).toEqual([0.3]);
    expect(uploads.get("u_feelCenter")).toEqual([0.25, -0.5]);
    expect(hooks.blackboardValue(SCREEN_FEEL_CONSUMED_KEY)).toBe(true);
    expect(screenFeelFrameState(device).appliedThisFrame).toBe(true);
  });

  it("lane 08's same-phase consumed read sees true on the frame after an applied frame", () => {
    const device = fakeDevice();
    setRendererQrFlags(POST_FLAGS, device);
    setRendererQrFlags(POST_FLAGS);
    publisher.uniforms = HIT;
    frame(device, new Map());
    frame(device, new Map());
    // Frame 1 had no prior application; frame 2 follows an applied frame.
    expect(publisher.consumedReads).toEqual([false, true]);
  });

  it("all-zero uniforms skip the pass and never claim consumption", () => {
    const device = fakeDevice();
    setRendererQrFlags(POST_FLAGS, device);
    setRendererQrFlags(POST_FLAGS);
    publisher.uniforms = { flash: 0, chroma: 0, radialBlur: 0, vignette: 0, center: [0, 0] };
    const uploads = new Map<string, readonly number[]>();
    const first = frame(device, uploads);
    frame(device, uploads);
    expect(uploads.has("u_feelFlash")).toBe(false);
    expect(first.blackboardValue(SCREEN_FEEL_CONSUMED_KEY)).toBeUndefined();
    expect(publisher.consumedReads).toEqual([false, false]);
    expect(screenFeelFrameState(device).appliedFrames).toBe(0);
  });

  it("Low-tier uniforms (flash + vignette only) upload zero chroma and radial blur", () => {
    const device = fakeDevice();
    setRendererQrFlags(POST_FLAGS, device);
    setRendererQrFlags(POST_FLAGS);
    publisher.uniforms = { flash: 0.6, chroma: 0, radialBlur: 0, vignette: 0.5, center: [0, 0] };
    const uploads = new Map<string, readonly number[]>();
    frame(device, uploads);
    expect(uploads.get("u_feelFlash")).toEqual([0.6]);
    expect(uploads.get("u_feelVignette")).toEqual([0.5]);
    expect(uploads.get("u_feelChroma")).toEqual([0]);
    expect(uploads.get("u_feelRadialBlur")).toEqual([0]);
  });

  it("no publish (A3D_QR_CAMERA off) leaves the pass idle", () => {
    const device = fakeDevice();
    const postOnly = { values: {}, on: (name: string) => name === "A3D_QR_POST" } as never;
    setRendererQrFlags(postOnly, device);
    setRendererQrFlags(postOnly);
    publisher.uniforms = HIT;
    const uploads = new Map<string, readonly number[]>();
    const hooks = frame(device, uploads);
    expect(uploads.has("u_feelFlash")).toBe(false);
    expect(hooks.blackboardValue(SCREEN_FEEL_CONSUMED_KEY)).toBeUndefined();
  });
});

describe("#207 prd03.screenFeel — uniform validation and shader reference", () => {
  it("malformed blackboard values read as no screen feel; values are clamped", () => {
    expect(readScreenFeelUniforms(undefined)).toBeNull();
    expect(readScreenFeelUniforms(3)).toBeNull();
    expect(readScreenFeelUniforms({ flash: -1, chroma: Number.NaN, radialBlur: 2, vignette: 4, center: [1] })).toEqual({
      flash: 0, chroma: 0, radialBlur: 2, vignette: 1, center: [0, 0]
    });
  });

  it("the fragment implements the F-08-5 reference constants", () => {
    expect(SCREEN_FEEL_GLSL).toContain("0.006 * u_feelChroma");
    expect(SCREEN_FEEL_GLSL).toContain("0.012 * u_feelRadialBlur");
    expect(SCREEN_FEEL_GLSL).toContain("1.0 - float(i) / 8.0");
    expect(SCREEN_FEEL_GLSL).toContain("smoothstep(0.35, 0.9, length(uv - 0.5))");
  });
});
