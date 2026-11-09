/**
 * WebGPU native depth post stages (W4): S4 god rays, S7 camera motion blur and
 * the legacy volumetric-light pass, served from the forward target's own depth
 * attachment (`webgpu/WebGPUDepthEffects.ts`). Covers the option resolution, the
 * renderer route (what reaches `presentLdrPostprocess`) and the device chain.
 */
import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type LdrPostprocessPresentationOptions, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { RendererPostprocessPipeline, webgpuNativeDepthPassesCover } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import { consumePostV2Presented, postSkippedReasons, postStagesRan } from "../../../packages/rendering/src/renderer/postSkipped";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import {
  invertColumnMajor4, resolveWebGPUGodRays, resolveWebGPUMotionBlur, resolveWebGPUVolumetricLight, webgpuGodRaysFragment, webgpuGodRaysUniforms,
  webgpuMotionReconstructFragment, webgpuMotionVelocityUniforms, webgpuVolumetricLightUniforms, type WebGPUDepthEffectCamera
} from "../../../packages/rendering/src/webgpu/WebGPUDepthEffects";

function perspective(fovY: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovY / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

function translation(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function mul(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

function camera(position: [number, number, number] = [0, 2, 10]): WebGPUDepthEffectCamera & { readonly viewMatrix: Float32Array; readonly previousViewProjectionMatrix: Float32Array | null } {
  const projection = perspective(Math.PI / 3, 16 / 9, 0.1, 100);
  const view = translation(-position[0], -position[1], -position[2]);
  const vp = mul(projection, view);
  return {
    projectionMatrix: Float32Array.from(projection), viewMatrix: Float32Array.from(view), viewProjectionMatrix: Float32Array.from(vp),
    previousViewProjectionMatrix: null, near: 0.1, far: 100, projection: "perspective", position,
    depth: { mode: "standard", clipRange: "minus-one-to-one" }
  };
}

describe("WebGPU depth effect option resolution", () => {
  it("places the god-ray light where the WebGL2 S4 stage does and clamps density and medium", () => {
    const cam = camera();
    const god = resolveWebGPUGodRays({ lightWorld: [0, 2, -40], intensity: 0.35, density: 0.01, medium: 4, color: [1, Number.NaN, 0.5], samples: 48 }, cam);
    // Straight ahead of the camera: the frame centre in bottom-left uv, light in front (w > 0).
    expect(god.lightUv[0]).toBeCloseTo(0.5, 6);
    expect(god.lightUv[1]).toBeCloseTo(0.5, 6);
    expect(god.lightClipW).toBeGreaterThan(0);
    expect(god.density).toBe(0.05);
    expect(god.medium).toBe(1);
    expect(god.color).toEqual([1, 0.96, 0.5]);
    expect(god.samples).toBe(48);
    // lightDirection places the light 2·far along it from the camera, like WebGL2: behind the eye gives w < 0 (faded out).
    const behind = resolveWebGPUGodRays({ lightDirection: [0, 0, 1] }, cam);
    expect(behind.lightClipW).toBeCloseTo(-200, 3);
    const uniforms = webgpuGodRaysUniforms(god, 640, 320, 180);
    expect(uniforms.length).toBe(36);
    expect(Array.from(uniforms.slice(16, 20))).toEqual([Math.fround(0.1), 100, 0, 0]);
    expect(uniforms[32]).toBe(1);
    expect(webgpuGodRaysUniforms({ ...god, frameAnchored: true }, 640, 320, 180)[32]).toBe(2);
    expect(uniforms[34]).toBe(180);
  });

  it("folds a static camera's reprojection to the identity and scales the shutter by the frame time", () => {
    const cam = camera();
    const vp = Float32Array.from(cam.viewProjectionMatrix);
    const mb = resolveWebGPUMotionBlur({ shutter: 0.5, samples: 12, tileSize: 20, maxBlurPx: 24 }, { unjittered: vp, previous: vp, jitterClip: [0, 0], frameTime: 1 / 30 }, cam);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    mb.reprojection.forEach((value, index) => expect(value).toBeCloseTo(identity[index]!, 5));
    expect(mb.shutter).toBeCloseTo(0.25, 6);
    expect(mb).toMatchObject({ samples: 12, tileSize: 20, maxBlurPx: 24 });
    const uniforms = webgpuMotionVelocityUniforms(mb, 64, 32);
    expect(uniforms.length).toBe(40);
    expect(Array.from(uniforms.slice(36, 40))).toEqual([0, 0, 64, 32]);
    // A camera that moved one metre right last frame: the reprojection is no longer the identity.
    const moved = Float32Array.from(camera([1, 2, 10]).viewProjectionMatrix);
    const panned = resolveWebGPUMotionBlur({}, { unjittered: vp, previous: moved, jitterClip: [0, 0], frameTime: 1 / 60 }, cam);
    expect(Math.abs(panned.reprojection[12]!)).toBeGreaterThan(0.01);
    expect(panned).toMatchObject({ samples: 12, tileSize: 16, maxBlurPx: 32, shutter: 0.5 });
    expect(() => resolveWebGPUMotionBlur({}, { unjittered: new Float32Array(16), previous: vp, jitterClip: [0, 0], frameTime: 1 / 60 }, cam))
      .toThrow(expect.objectContaining({ code: "TEMPORAL_INVALID_MATRIX" }));
  });

  it("validates legacy volumetric-light options with the CPU kernel's ranges and keeps its bottom-up light rows", () => {
    expect(resolveWebGPUVolumetricLight({})).toMatchObject({ lightPosition: [0.5, 0.18], density: 0.9, decay: 0.96, weight: 0.18, exposure: 0.72, samples: 32, occlusionThreshold: 0.985, dither: false });
    expect(() => resolveWebGPUVolumetricLight({ density: 3 })).toThrow(RangeError);
    expect(() => resolveWebGPUVolumetricLight({ samples: 4.5 })).toThrow(RangeError);
    expect(() => resolveWebGPUVolumetricLight({ lightPosition: [2, 0] })).toThrow(RangeError);
    const uniforms = webgpuVolumetricLightUniforms(resolveWebGPUVolumetricLight({ dither: true }), 101, 51, { mode: "reversed", near: 0.1, far: 100 });
    expect(Array.from(uniforms.slice(0, 2))).toEqual([50, Math.fround(0.18 * 50)]);
    expect(uniforms[11]).toBe(1);
    expect(uniforms[12]).toBe(1);
  });

  it("emits single-sample and multisampled depth variants and inverts matrices in float64", () => {
    expect(webgpuGodRaysFragment(false)).toContain("var depthTex: texture_depth_2d;");
    expect(webgpuGodRaysFragment(true)).toContain("var depthTex: texture_depth_multisampled_2d;");
    expect(webgpuGodRaysFragment(true)).toBe(webgpuGodRaysFragment(true));
    expect(webgpuMotionReconstructFragment(false)).toContain("@group(0) @binding(4) var depthTex");
    const projection = perspective(1, 1.5, 0.5, 50);
    const product = mul(projection, invertColumnMajor4(projection)!);
    product.forEach((value, index) => expect(value).toBeCloseTo(index % 5 === 0 ? 1 : 0, 9));
    expect(invertColumnMajor4(new Array(16).fill(0))).toBeNull();
  });
});

function routeFixture(kind: "webgpu" | "webgl2") {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: kind });
  Object.defineProperty(device, "info", { value: { ...device.info, backend: kind, capabilities: [...device.info.capabilities!, "hdr-render-targets"] } });
  const present = vi.fn((_source: RenderTarget, _options: LdrPostprocessPresentationOptions) => {});
  (device as RenderDevice).presentLdrPostprocess = present;
  const post = new RendererPostprocessPipeline({ device, width: 8, height: 4 } as unknown as RendererHost);
  const target = device.createRenderTarget({ width: 8, height: 4, format: "rgba16f" });
  const scopeId = {}, token = postDiagnostics.begin(scopeId, "main", 3);
  const cam = camera();
  const frame = { source: {}, items: [], scopeId, viewId: "main", frameId: 3, timeSeconds: 1, diagnosticToken: token,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } } };
  const vp = Float32Array.from(cam.viewProjectionMatrix);
  const temporal = { velocity: target, history: target, historyOutput: target, historyValid: true, renderItems: [],
    v2: { jittered: vp, unjittered: vp, previous: vp, linZ: target, linZOutput: target, jitterClip: [0, 0] as const, previousJitterClip: [0, 0] as const,
      frameTime: 1 / 60, depthNear: 0.1, motionSource: "camera" as const, unsupportedMotion: [], reconstruction: "spatial" as const, coverage: { moving: 0, movingWithHistory: 0 } } };
  const v2: RendererPostProcessOptions = {
    v2: true, toneMapping: { operator: "aces" }, bloom: { threshold: 1, intensity: 0.2 }, colorGrade: { contrast: 1.1 },
    temporal: { sceneKey: "s" }, motionBlur: { samples: 8, scale: 0.5, temporal } as never,
    pipeline: { godRays: { samples: 32, decay: 0.94, weight: 0.7, color: [1, 0.9, 0.8], intensity: 0.4, lightDirection: [0, 0.3, -1] },
      motionBlur: { shutter: 0.5, maxBlurPx: 32, samples: 12, tileSize: 16 }, toneMapping: "aces", exposure: 1 },
    cameraFrame: cam as never, postFrameContext: frame as never
  };
  return { device, present, post, target, v2, token, scopeId,
    dispose: () => { postDiagnostics.resetScope(scopeId); target.dispose(); device.dispose(); } };
}

describe("WebGPU depth stage routing", () => {
  it.each([false, true])("forwards native god rays and motion blur and drops the legacy motion-blur pass (async=%s)", async asynchronous => {
    const f = routeFixture("webgpu");
    try {
      if (asynchronous) await f.post.executePostprocessAsync(f.v2, [f.target]); else f.post.executePostprocess(f.v2, [f.target]);
      expect(f.present).toHaveBeenCalledOnce();
      const sent = f.present.mock.calls[0]![1];
      expect(sent.passes.map(pass => pass.name)).toEqual(["bloom", "tone-mapping", "color-grade"]);
      expect(sent.nativeGodRays).toMatchObject({ samples: 32, intensity: 0.4, decay: 0.94, frameAnchored: false });
      expect(sent.nativeMotionBlur).toMatchObject({ samples: 12, tileSize: 16, maxBlurPx: 32 });
      expect(sent.nativeMotionBlur!.shutter).toBeCloseTo(0.5, 6);
      // The presented S7 frame lets the renderer commit the temporal history (else the previous view never advances).
      expect(consumePostV2Presented(f.scopeId, "main", 3)).toBe(true);
      expect(postStagesRan(f.token).some(stage => /^S1C:reproj-dev=\d\.\d\de-1\d$/.test(stage))).toBe(true);
    } finally { f.dispose(); }
  });

  it("records the motion-blur skip without temporal velocity and still presents", () => {
    const f = routeFixture("webgpu");
    try {
      f.post.executePostprocess({ ...f.v2, motionBlur: { samples: 8, scale: 0.5 } as never }, [f.target]);
      const sent = f.present.mock.calls[0]![1];
      expect(sent.nativeMotionBlur).toBeUndefined();
      expect(sent.passes.map(pass => pass.name)).not.toContain("motion-blur");
      expect(postSkippedReasons(f.token)).toContain("S7_VELOCITY_UNAVAILABLE:webgpu");
    } finally { f.dispose(); }
  });

  it("skips S7 when the tier dropped pipeline motion blur, and runs it from the legacy twin off the v2 route", () => {
    const f = routeFixture("webgpu");
    try {
      const pipeline = { ...(f.v2.pipeline as Record<string, unknown>), motionBlur: undefined };
      f.post.executePostprocess({ ...f.v2, pipeline }, [f.target]);
      expect(f.present.mock.calls[0]![1].nativeMotionBlur).toBeUndefined();
      expect(postSkippedReasons(f.token)).toContain("S7_TIER_DISABLED:webgpu");
      f.present.mockClear();
      f.post.executePostprocess({ ...f.v2, v2: false, pipeline: undefined }, [f.target]);
      expect(f.present.mock.calls[0]![1].nativeMotionBlur).toMatchObject({ samples: 8 });
      expect(f.present.mock.calls[0]![1].nativeMotionBlur!.shutter).toBeCloseTo(0.5, 6);
    } finally { f.dispose(); }
  });

  it("drops legacy volumetric light on WebGPU where WebGL2 skips its kernel (post flag on)", () => {
    const f = routeFixture("webgpu");
    try {
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), f.device);
      f.post.executePostprocess({ toneMapping: { operator: "aces" }, volumetricLight: { samples: 16 }, colorGrade: true, postFrameContext: f.v2.postFrameContext }, [f.target]);
      expect(f.present.mock.calls[0]![1].passes.map(pass => pass.name)).toEqual(["tone-mapping", "color-grade"]);
      expect(postSkippedReasons(f.token)).toContain("WEBGPU_VOLUMETRIC_LIGHT_SKIPPED:post-chain");
    } finally { f.dispose(); }
  });

  it("fuses legacy volumetric light on WebGPU only; WebGL2 keeps its existing route", () => {
    const legacy: RendererPostProcessOptions = { toneMapping: { operator: "aces" }, volumetricLight: { samples: 16 }, colorGrade: true };
    const gpu = routeFixture("webgpu");
    try {
      gpu.post.executePostprocess(legacy, [gpu.target]);
      expect(gpu.present.mock.calls[0]![1].passes.map(pass => pass.name)).toEqual(["tone-mapping", "volumetric-light", "color-grade"]);
    } finally { gpu.dispose(); }
    const gl = routeFixture("webgl2");
    try {
      // WebGL2 never offers volumetric light to the fused present (it is its CPU per-pass kernel).
      try { gl.post.executePostprocess(legacy, [gl.target]); } catch { /* the mock has no CPU readback depth; only the route matters */ }
      expect(gl.present.mock.calls.every(call => !call[1].passes.some(pass => (pass.name as string) === "volumetric-light"))).toBe(true);
    } finally { gl.dispose(); }
  });

  it("names only god rays, motion blur and legacy volumetric light as natively covered depth readers", () => {
    expect(webgpuNativeDepthPassesCover({ volumetricLight: {} })).toBe(true);
    expect(webgpuNativeDepthPassesCover({ v2: true, pipeline: { godRays: {}, motionBlur: {} } })).toBe(true);
    expect(webgpuNativeDepthPassesCover({ v2: true, pipeline: { godRays: {}, ao: {} } })).toBe(false);
    expect(webgpuNativeDepthPassesCover({ volumetricLight: {}, ssao: {} })).toBe(false);
    expect(webgpuNativeDepthPassesCover({ v2: true, pipeline: { motionBlur: {}, antiAliasing: "taa" } })).toBe(false);
  });

  it("still needs the depth texture where volumetric light leaves the native chain (review fixes)", () => {
    // A companion pass outside the fused device chain sends the frame to the per-pass CPU kernel, which reads renderer depth.
    expect(webgpuNativeDepthPassesCover({ toneMapping: {}, volumetricLight: {}, chromaticAberration: true })).toBe(false);
    expect(webgpuNativeDepthPassesCover({ toneMapping: {}, volumetricLight: {}, filmGrain: true })).toBe(false);
    // cpu-deterministic frames never reach the native chain.
    expect(webgpuNativeDepthPassesCover({ volumetricLight: {}, execution: "cpu-deterministic" })).toBe(false);
    expect(webgpuNativeDepthPassesCover({ v2: true, execution: "cpu-deterministic", pipeline: { godRays: {} } })).toBe(false);
  });

  it("keeps caller-depth volumetric light and cpu-deterministic frames off the native WebGPU volumetric pass (review fixes)", () => {
    const depth = { width: 1, height: 1, data: new Float32Array(1) };
    const callerDepth = routeFixture("webgpu");
    try {
      try { callerDepth.post.executePostprocess({ toneMapping: { operator: "aces" }, volumetricLight: { samples: 16, depth } as never }, [callerDepth.target]); } catch { /* mock readback; only the route matters */ }
      expect(callerDepth.present.mock.calls.every(call => !call[1].passes.some(pass => (pass.name as string) === "volumetric-light"))).toBe(true);
    } finally { callerDepth.dispose(); }
    const cpu = routeFixture("webgpu");
    try {
      try { cpu.post.executePostprocess({ execution: "cpu-deterministic", toneMapping: { operator: "aces" }, volumetricLight: { samples: 16 } }, [cpu.target]); } catch { /* mock readback */ }
      expect(cpu.present.mock.calls.every(call => !call[1].passes.some(pass => (pass.name as string) === "volumetric-light"))).toBe(true);
    } finally { cpu.dispose(); }
  });
});

async function deviceFixture(sampleCount: 1 | 4) {
  const passes: string[] = [];
  const views: { label: string; descriptor?: unknown }[] = [];
  const groups: { label: string; bindings: number[] }[] = [];
  const modules: string[] = [];
  const native = {
    features: new Set<string>(), lost: new Promise(() => {}),
    queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: ({ label, size }: { label?: string; size: number }) => ({ label, size, destroy: vi.fn() }),
    createTexture({ label }: { label?: string }) {
      const handle = { label: label ?? "", destroy: vi.fn(), createView: (descriptor?: unknown) => { views.push({ label: label ?? "", descriptor }); return { texture: handle, descriptor }; } };
      return handle;
    },
    createSampler: () => ({}),
    createShaderModule: (descriptor: { code: string }) => { modules.push(descriptor.code); return { descriptor }; },
    createBindGroupLayout: (descriptor: unknown) => descriptor,
    createPipelineLayout: (descriptor: unknown) => descriptor,
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup(descriptor: { label?: string; entries: readonly { binding: number }[] }) {
      groups.push({ label: descriptor.label ?? "", bindings: descriptor.entries.map(entry => entry.binding) });
      return {};
    },
    createCommandEncoder: (descriptor?: { label?: string }) => ({
      beginRenderPass: (pass: { label?: string }) => { passes.push(pass.label ?? ""); return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }; },
      finish: () => ({ label: descriptor?.label })
    }),
    pushErrorScope() {}, popErrorScope: () => Promise.resolve(null), destroy: vi.fn()
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  const source = device.createRenderTarget({ width: 16, height: 8, format: "rgba16f", depth: true, sampleCount, label: "forward" });
  const outputTarget = device.createRenderTarget({ width: 16, height: 8, format: "rgba8", depth: false, label: "output" });
  return { device, source, outputTarget, passes, views, groups, modules };
}

describe("WebGPU device depth stages", () => {
  it.each([1, 4] as const)("runs god rays then motion blur on the HDR source before bloom and tone (samples=%s)", async sampleCount => {
    const f = await deviceFixture(sampleCount);
    const cam = camera();
    const vp = Float32Array.from(cam.viewProjectionMatrix);
    const scopeId = {}, token = postDiagnostics.begin(scopeId, "main", 1);
    try {
      f.device.presentLdrPostprocess(f.source, {
        passes: [{ name: "tone-mapping", options: { operator: "aces" } }], outputTarget: f.outputTarget,
        nativeGodRays: resolveWebGPUGodRays({ lightDirection: [0, 0.2, -1], intensity: 0.5 }, cam),
        nativeMotionBlur: resolveWebGPUMotionBlur({}, { unjittered: vp, previous: vp, jitterClip: [0, 0], frameTime: 1 / 60 }, cam),
        postFrameContext: { scopeId, viewId: "main", frameId: 1, diagnosticToken: token }
      });
      const ms = sampleCount === 4 ? "-ms" : "";
      expect(f.passes.filter(label => label.startsWith("webgpu-godrays") || label.startsWith("webgpu-motion") || label === "webgpu-tone-pass" || label === "webgpu-post-present-pass")).toEqual([
        `webgpu-godrays${ms}-pass`, "webgpu-godrays-composite-pass", `webgpu-motion-velocity${ms}-pass`, "webgpu-motion-tile-pass", "webgpu-motion-neighbor-pass",
        `webgpu-motion-reconstruct${ms}-pass`, "webgpu-tone-pass", "webgpu-post-present-pass"
      ]);
      // Each stage binds uniform, sampler and its textures; the depth reads come from the forward depth attachment.
      expect(f.groups.find(group => group.label.startsWith("webgpu-godrays") && !group.label.includes("composite"))!.bindings).toEqual([0, 1, 2, 3]);
      expect(f.groups.find(group => group.label.startsWith("webgpu-motion-reconstruct"))!.bindings).toEqual([0, 1, 2, 3, 4]);
      // 5.5.1: both stages bind the one depth-only view of the forward depth attachment (created once per texture).
      expect(f.views.filter(view => view.label === "forward-depth" && (view.descriptor as { aspect?: string } | undefined)?.aspect === "depth-only").length).toBe(1);
      expect(f.modules.some(code => code.includes(sampleCount === 4 ? "texture_depth_multisampled_2d" : "var depthTex: texture_depth_2d"))).toBe(true);
      expect(postStagesRan(token)).toEqual(expect.arrayContaining(["S4:god-rays-32", "S7:motion-blur-12x16"]));
      expect(f.device.captureState().get("nativeDepthStagePasses")).toBe(6);
    } finally { postDiagnostics.resetScope(scopeId); f.device.dispose(); }
  });

  it("runs legacy volumetric light after tone mapping on the display-space frame", async () => {
    const f = await deviceFixture(1);
    try {
      f.device.presentLdrPostprocess(f.source, {
        passes: [{ name: "tone-mapping", options: { operator: "aces" } }, { name: "volumetric-light" as never, options: { samples: 16 } }], outputTarget: f.outputTarget,
        depthRange: { near: 0.1, far: 100 }
      });
      expect(f.passes.filter(label => label.startsWith("webgpu-tone") || label.startsWith("webgpu-volumetric"))).toEqual(["webgpu-tone-pass", "webgpu-volumetric-light-pass"]);
      expect(() => f.device.presentLdrPostprocess(f.source, {
        passes: [{ name: "tone-mapping", options: {} }, { name: "volumetric-light" as never, options: { density: 9 } }], outputTarget: f.outputTarget
      })).toThrow(RangeError);
    } finally { f.device.dispose(); }
  });

  it("refuses a source without a depth attachment instead of reading stale depth", async () => {
    const f = await deviceFixture(1);
    const depthless = f.device.createRenderTarget({ width: 16, height: 8, format: "rgba16f", depth: false, label: "depthless" });
    try {
      expect(() => f.device.presentLdrPostprocess(depthless, {
        passes: [{ name: "tone-mapping", options: {} }], outputTarget: f.outputTarget, nativeGodRays: resolveWebGPUGodRays({}, camera())
      })).toThrow(expect.objectContaining({ code: "WEBGPU_DEPTH_STAGE_DEPTH_UNAVAILABLE" }));
    } finally { f.device.dispose(); }
  });
});
