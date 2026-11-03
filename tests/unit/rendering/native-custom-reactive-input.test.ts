import { afterEach, describe, expect, it, vi } from "vitest";
import { postEffectBuilders } from "../../../packages/engine/src/agent-api/nodes/effects.post.js";
import { disposeNativePostEffects, runV2HdrStages, runV2LdrTail, type PostFrameContextBag } from "../../../packages/rendering/src/post/v2Stages.js";
import { Texture, claimRenderTargetTextureOwner } from "../../../packages/rendering/src/Texture.js";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice.js";
import type { TemporalGpuBindings } from "../../../packages/rendering/src/TemporalHistory.js";
import type { PostPassDescriptor, PostPipelineOptions } from "../../../packages/rendering/src/contracts/post.js";
import type { FrameCamera } from "../../../packages/rendering/src/contracts/frameGraph.js";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost.js";

const TEXTURE0 = 33984;
const matrix = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const pipeline: PostPipelineOptions = {
  antiAliasing: "off", depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1, toneMapping: "aces", dither: false
};

interface Draw {
  readonly source: string;
  readonly textures: ReadonlyMap<number, unknown>;
  readonly uniforms: ReadonlyMap<string, readonly number[]>;
}

function recordingGl(draws: Draw[]): WebGL2RenderingContext {
  let unit = 0;
  let current: { shaders: { source?: string }[] } | undefined;
  const textures = new Map<number, unknown>();
  let uniforms = new Map<string, readonly number[]>();
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({}), createTexture: () => ({}), createShader: () => ({}),
    createProgram: () => ({ shaders: [] }),
    shaderSource: ((shader: { source?: string }, source: string) => { shader.source = source; }) as never,
    attachShader: ((program: { shaders: unknown[] }, shader: unknown) => { program.shaders.push(shader); }) as never,
    useProgram: ((program: typeof current) => { current = program; uniforms = new Map(); }) as never,
    getShaderParameter: () => true, getProgramParameter: () => true,
    activeTexture: ((texture: number) => { unit = texture - TEXTURE0; }) as never,
    bindTexture: ((_kind: number, handle: unknown) => { textures.set(unit, handle); }) as never,
    getUniformLocation: ((_program: unknown, name: string) => name) as never,
    uniform1i: ((name: string, value: number) => { uniforms.set(name, [value]); }) as never,
    uniform1f: ((name: string, value: number) => { uniforms.set(name, [value]); }) as never,
    drawArrays: (() => {
      draws.push({ source: current?.shaders.map((shader) => shader.source ?? "").join("\n") ?? "", textures: new Map(textures), uniforms: new Map(uniforms) });
    }) as never
  };
  return new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "TEXTURE0") return TEXTURE0;
      if (typeof property === "string" && /^[A-Z][A-Z0-9_]*$/.test(property)) return property.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    }
  }) as unknown as WebGL2RenderingContext;
}

interface FakeTarget extends RenderTarget {
  disposed: boolean;
  colorTexture: Texture;
  colorHandle: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  depthTextureHandle: WebGLTexture | null;
  sampleCount: number;
  dispose: ReturnType<typeof vi.fn>;
}

let targetId = 0;
class FakeDevice {
  readonly kind = "webgl2";
  disposed = false;
  contextLost = false;
  generation = 1;
  activeFrameToken: object | null = {};
  readonly textures = new Map<Texture, WebGLTexture>();
  readonly created: FakeTarget[] = [];
  nextTarget?: FakeTarget;

  createRenderTarget(descriptor: { width: number; height: number; format?: "rgba8" | "rgba16f" | "rgba32f"; sampleCount?: number }): FakeTarget {
    if (this.nextTarget) {
      const target = this.nextTarget;
      this.nextTarget = undefined;
      return target;
    }
    const texture = new Texture({ width: descriptor.width, height: descriptor.height, format: descriptor.format ?? "rgba8", renderAttachment: true });
    const handle = {} as WebGLTexture;
    const id = ++targetId;
    const target: FakeTarget = {
      id, label: `reactive-${id}`, width: descriptor.width, height: descriptor.height,
      disposed: false, colorTexture: texture, colorHandle: handle,
      framebuffer: {} as WebGLFramebuffer, depthTextureHandle: null, sampleCount: descriptor.sampleCount ?? 1,
      dispose: vi.fn(() => { target.disposed = true; texture.dispose(); })
    };
    claimRenderTargetTextureOwner(texture, this);
    this.textures.set(texture, handle);
    this.created.push(target);
    return target;
  }
}

interface Harness {
  readonly device: FakeDevice;
  readonly host: WebGL2DeviceHost;
  readonly draws: Draw[];
  readonly source: FakeTarget;
  readonly reactive: FakeTarget;
  readonly temporal: TemporalGpuBindings;
  readonly frame: PostFrameContextBag;
}

const hosts: WebGL2DeviceHost[] = [];
function harness(): Harness {
  const draws: Draw[] = [], device = new FakeDevice();
  const host = {
    gl: recordingGl(draws), device,
    textureRegistry: { textures: device.textures },
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    lifecycle: { bindOutput: () => undefined }, activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
  hosts.push(host);
  const source = device.createRenderTarget({ width: 16, height: 16, format: "rgba16f" });
  const reactive = device.createRenderTarget({ width: 16, height: 16, format: "rgba8" });
  const temporal = {
    velocity: source, history: source, historyOutput: source, historyValid: false, renderItems: [],
    v2: { jittered: matrix(), unjittered: matrix(), previous: matrix(), linZ: source, linZOutput: source,
      jitterClip: [0, 0], previousJitterClip: [0, 0], frameTime: 1 / 60, depthNear: 0.1,
      reactive, motionSource: "object", unsupportedMotion: [], reconstruction: "spatial", coverage: {} }
  } as unknown as TemporalGpuBindings;
  const frame: PostFrameContextBag = {
    source: {}, items: [], scopeId: {}, viewId: "camera-a", frameId: 7, deviceGeneration: 1,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } }
  };
  return { device, host, draws, source, reactive, temporal, frame };
}

function custom(anchor: PostPassDescriptor["insertAt"], overrides: Partial<PostPassDescriptor> = {}): PostPassDescriptor {
  return {
    id: `test.reactive.${anchor}`, owner: "test", flag: "A3D_QR_POST", insertAt: anchor,
    space: anchor === "after-tonemap" ? "display" : "linear-hdr", inputs: ["color", "reactive"],
    fragment: { glsl: "// reactive-marker\nvoid main() { outColor = vec4(texture(u_reactive, v_uv).r); }" },
    gpuOnly: true, ...overrides
  };
}

function run(h: Harness, pass: PostPassDescriptor, options?: { deferBeforeTonemap?: boolean }) {
  return runV2HdrStages(h.host, h.source, { ...pipeline, customPasses: [pass] }, null, h.temporal, h.frame,
    { ...options, retainOutputLease: true });
}

afterEach(() => {
  while (hosts.length) disposeNativePostEffects(hosts.pop()!);
});

describe("caller-supplied reactive inputs for WebGL2 HDR custom passes", () => {
  it.each(["after-depth", "before-taa", "after-taa", "before-tonemap"] as const)("binds the actual mask at %s", (anchor) => {
    const h = harness();
    const allocations = h.device.created.length;
    const result = run(h, custom(anchor));
    const draw = h.draws.find((entry) => entry.source.includes("reactive-marker"));
    expect(draw).toBeDefined();
    expect(draw!.textures.get(3)).toBe(h.reactive.colorHandle);
    expect(draw!.uniforms.get("u_reactive")).toEqual([3]);
    expect(draw!.source).toContain("uniform highp sampler2D u_reactive;");
    expect(h.device.created.length - allocations).toBe(1);
    result.outputLease?.release();
    expect(h.reactive.dispose).not.toHaveBeenCalled();
  });

  it("accepts reactive in the public builder and preserves rejection of unknown inputs", () => {
    const pass = postEffectBuilders.shaderPass({ glsl: "void main() {}", inputs: ["color", "reactive"] });
    expect(pass.inputs).toEqual(["color", "reactive"]);
    // 5.0 accepts the depth-reconstructed "normal" input (WP06-01).
    expect(postEffectBuilders.shaderPass({ glsl: "void main() {}", inputs: ["normal"] }).inputs).toEqual(["normal"]);
    expect(() => postEffectBuilders.shaderPass({ glsl: "void main() {}", inputs: ["albedo"] as never })).toThrow(/input/);
  });

  it("leaves existing color-only source and bindings unchanged", () => {
    const h = harness();
    const pass = custom("before-taa", { inputs: ["color"], fragment: { glsl: "// reactive-marker\nuniform sampler2D u_reactive;\nvoid main() { outColor = texture(u_color, v_uv); }" } });
    const result = run(h, pass);
    const draw = h.draws.find((entry) => entry.source.includes("reactive-marker"))!;
    expect(draw.source.match(/uniform (?:highp )?sampler2D u_reactive;/g)).toHaveLength(1);
    expect(draw.uniforms.has("u_reactive")).toBe(false);
    expect(draw.textures.has(3)).toBe(false);
    result.outputLease?.release();
  });

  it("reports a missing mask and leaves a disabled pass untouched", () => {
    const h = harness();
    const temporal = { ...h.temporal, v2: { ...h.temporal.v2!, reactive: undefined } };
    const pass = custom("before-taa");
    const call = (descriptor: PostPassDescriptor) => runV2HdrStages(h.host, h.source, { ...pipeline, customPasses: [descriptor] }, null, temporal, h.frame);
    expect(() => call(pass)).toThrow("POSTPROCESS_INPUT_UNAVAILABLE:test.reactive.before-taa:reactive");
    expect(call({ ...pass, enabled: () => false }).target).toBe(h.source);
    expect(h.draws).toHaveLength(0);
  });

  it("rejects a foreign, mismatched, multisampled, disposed or substituted mask before drawing", () => {
    const foreign = harness(), host = harness();
    const foreignBindings = { ...host.temporal, v2: { ...host.temporal.v2!, reactive: foreign.reactive } };
    const pass = custom("before-taa");
    expect(() => runV2HdrStages(host.host, host.source, { ...pipeline, customPasses: [pass] }, null, foreignBindings, host.frame)).toThrow(/reactive:attachment/);
    for (const mutate of [
      (h: Harness) => { (h.reactive as { width: number }).width = 8; },
      (h: Harness) => { h.reactive.sampleCount = 4; },
      (h: Harness) => { h.reactive.colorTexture.colorSpace = "srgb"; },
      (h: Harness) => { h.reactive.colorTexture.dispose(); },
      (h: Harness) => { h.device.textures.set(h.reactive.colorTexture, {} as WebGLTexture); }
    ]) {
      const h = harness();
      mutate(h);
      expect(() => run(h, pass)).toThrow(/reactive:attachment/);
      expect(h.draws).toHaveLength(0);
      expect(h.reactive.dispose).not.toHaveBeenCalled();
    }
    expect(host.draws).toHaveLength(0);
  });

  it("rejects output feedback even when a different wrapper exposes the same attachment", () => {
    const h = harness();
    const output = h.device.createRenderTarget({ width: 16, height: 16, format: "rgba16f" });
    output.colorTexture = h.reactive.colorTexture;
    h.device.nextTarget = output;
    expect(() => run(h, custom("before-taa"))).toThrow(/reactive:alias/);
    expect(h.draws).toHaveLength(0);
    expect(h.reactive.dispose).not.toHaveBeenCalled();
  });

  it("rechecks disposal and attachment replacement after callbacks before submitting", () => {
    const disposed = harness();
    expect(() => run(disposed, custom("before-taa", { uniforms: () => { disposed.reactive.colorTexture.dispose(); return {}; } }))).toThrow(/reactive:attachment/);
    expect(disposed.draws).toHaveLength(0);
    expect(disposed.reactive.dispose).not.toHaveBeenCalled();
    const changed = harness();
    expect(() => run(changed, custom("before-taa", { enabled: () => { changed.reactive.colorHandle = {} as WebGLTexture; return true; } }))).toThrow(/reactive:attachment/);
    expect(changed.draws).toHaveLength(0);
  });

  it("rejects a changed device frame or view context before the draw", () => {
    const h = harness();
    const pass = custom("before-taa", { uniforms: () => { h.device.activeFrameToken = {}; return {}; } });
    expect(() => run(h, pass)).toThrow(/reactive:stale-frame/);
    expect(h.draws).toHaveLength(0);
    const view = harness();
    const changeView = custom("before-taa", { uniforms: () => { (view.frame as { viewId: string }).viewId = "camera-b"; return {}; } });
    expect(() => run(view, changeView)).toThrow(/reactive:stale-frame/);
    expect(view.draws).toHaveLength(0);
  });

  it("requires an active device frame and never retires the caller's mask", () => {
    const inactive = harness();
    inactive.device.activeFrameToken = null;
    expect(() => run(inactive, custom("before-taa"))).toThrow(/reactive:stale-frame/);
    const h = harness();
    const result = run(h, custom("before-taa"));
    result.outputLease?.release();
    disposeNativePostEffects(h.host);
    expect(h.reactive.dispose).not.toHaveBeenCalled();
    expect(h.reactive.colorTexture.disposed).toBe(false);
  });

  it("holds the borrowed mask for deferred bloom, then rejects a later device frame", () => {
    const h = harness();
    const result = run(h, custom("before-tonemap"), { deferBeforeTonemap: true });
    expect(h.draws).toHaveLength(0);
    result.afterBloom!.run(h.source);
    expect(h.draws[0]!.textures.get(3)).toBe(h.reactive.colorHandle);
    h.device.activeFrameToken = {};
    expect(() => result.afterBloom!.run(h.source)).toThrow(/reactive:stale-frame/);
    result.afterBloom!.release();
    expect(h.reactive.dispose).not.toHaveBeenCalled();
  });

  it("keeps the display-tail input explicitly unavailable", () => {
    const h = harness();
    expect(() => runV2LdrTail(h.host, h.source, { ...pipeline, customPasses: [custom("after-tonemap")] }, undefined, h.frame))
      .toThrow("POSTPROCESS_INPUT_UNAVAILABLE:test.reactive.after-tonemap:reactive");
    expect(h.draws).toHaveLength(0);
  });

  it("passes the caller's mask to both the temporal resolve and a later custom pass", () => {
    const h = harness();
    h.source.depthTextureHandle = {} as WebGLTexture;
    const surface = () => h.device.createRenderTarget({ width: 16, height: 16, format: "rgba16f" });
    const temporal = { ...h.temporal, velocity: surface(), history: surface(), historyOutput: surface(),
      v2: { ...h.temporal.v2!, linZ: surface(), linZOutput: surface() } };
    const camera = { projection: "perspective", near: 0.1, far: 100, projectionMatrix: matrix(), viewMatrix: matrix(),
      viewProjectionMatrix: matrix(), previousViewProjectionMatrix: null, position: [0, 0, 0] } as unknown as FrameCamera;
    const result = runV2HdrStages(h.host, h.source, { ...pipeline, antiAliasing: "taa", customPasses: [custom("after-taa")] }, camera, temporal, h.frame,
      { retainOutputLease: true });
    const resolve = h.draws.find((entry) => entry.source.includes("uniform bool u_hasReactive"));
    const pass = h.draws.find((entry) => entry.source.includes("reactive-marker"));
    expect(resolve!.textures.get(4)).toBe(h.reactive.colorHandle);
    expect(resolve!.uniforms.get("u_hasReactive")).toEqual([1]);
    expect(pass!.textures.get(3)).toBe(h.reactive.colorHandle);
    result.outputLease?.release();
    expect(h.reactive.dispose).not.toHaveBeenCalled();
  });

  it("rejects a temporal depth output that aliases the mask before the depth prepass", () => {
    const h = harness();
    h.source.depthTextureHandle = {} as WebGLTexture;
    const temporal = { ...h.temporal, v2: { ...h.temporal.v2!, linZOutput: h.reactive } };
    const pass = custom("after-taa");
    const camera = { projection: "perspective", near: 0.1, far: 100, projectionMatrix: matrix(), viewMatrix: matrix(),
      viewProjectionMatrix: matrix(), previousViewProjectionMatrix: null, position: [0, 0, 0] } as unknown as FrameCamera;
    expect(() => runV2HdrStages(h.host, h.source, { ...pipeline, antiAliasing: "taa", customPasses: [pass] }, camera, temporal, h.frame))
      .toThrow(/reactive:alias/);
    expect(h.draws).toHaveLength(0);
    expect(h.reactive.dispose).not.toHaveBeenCalled();
  });
});
