import { describe, expect, it } from "vitest";
import { MockRenderDevice, type RenderCommandState, type RenderTargetDescriptor, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import {
  accumulateWeightedTransparency, resolveWeightedTransparency, weightedTransparencyIneligibility,
  weightedTransparencyWeight, WeightedTransparency, type WeightedTransparencyRequest
} from "../../../packages/rendering/src/transparency/WeightedTransparency";

const alphaState: RenderCommandState = { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "back", blend: true, blendMode: "alpha" };
const support = { floatBlend: true, depthTexture: true, shaderVariants: true } as const;

function makeRequest(device: MockRenderDevice): WeightedTransparencyRequest<number> {
  const scene = device.createRenderTarget({ width: 8, height: 6, format: "rgba8", depth: "texture" });
  device.beginFrame(8, 6);
  device.setRenderTarget(scene);
  return { viewId: "left", width: 8, height: 6, sceneTarget: scene, opaqueDepth: scene.depthTexture!, depthConvention: "standard", sampleCount: 1, maxFragmentsPerPixel: 2,
    support, items: [1, 2], drawWeighted: () => {}, drawSorted: () => {} };
}

describe("weighted transparency equations", () => {
  it("preserves coverage and is insensitive to submission order", () => {
    const red = { color: [1, 0, 0] as const, alpha: 0.5, depth: 0.2 };
    const blue = { color: [0, 0, 1] as const, alpha: 0.5, depth: 0.8 };
    const accum = accumulateWeightedTransparency([red, blue]);
    const reversed = accumulateWeightedTransparency([blue, red]);
    expect(accum.revealage).toBeCloseTo(0.25, 12);
    expect(accum.color[0]).toBeCloseTo(0.5 * (0.25 + 0.75 * 0.8 ** 3), 12);
    expect(accum.color[2]).toBeCloseTo(0.5 * (0.25 + 0.75 * 0.2 ** 3), 12);
    expect(accum).toEqual(reversed);
    const composite = resolveWeightedTransparency(accum);
    expect(composite[3]).toBeCloseTo(0.75, 12);
    expect(composite[0] + composite[2]).toBeCloseTo(0.75, 12);
    expect(composite[0]).toBeGreaterThan(composite[2]);
    expect(resolveWeightedTransparency(accumulateWeightedTransparency([]))).toEqual([0, 0, 0, 0]);
    const faint = resolveWeightedTransparency(accumulateWeightedTransparency([{ color: [1, 0, 0], alpha: 1e-6, depth: 1 }]));
    expect(faint[0]).toBeCloseTo(1e-6, 12);
    expect(faint[3]).toBeCloseTo(1e-6, 12);
  });

  it("handles premultiplied colors, reversed depth, opaque occlusion and HDR bounds", () => {
    const straight = { color: [0.8, 0.4, 0.2] as const, alpha: 0.25, depth: 0.3, opaqueDepth: 0.4 };
    const premultiplied = { ...straight, color: [0.2, 0.1, 0.05] as const, premultiplied: true };
    expect(accumulateWeightedTransparency([straight])).toEqual(accumulateWeightedTransparency([premultiplied]));
    const occluded = { color: [1, 1, 1] as const, alpha: 1, depth: 0.9, opaqueDepth: 0.4 };
    expect(accumulateWeightedTransparency([straight, occluded])).toEqual(accumulateWeightedTransparency([straight]));
    expect(accumulateWeightedTransparency([{ ...occluded, depth: 0.1, opaqueDepth: 0.6 }], "reversed").alpha).toBe(0);
    expect(weightedTransparencyWeight(0.3)).toBeCloseTo(weightedTransparencyWeight(0.7, "reversed"), 12);
    const hdr = resolveWeightedTransparency(accumulateWeightedTransparency([{ color: [100, -100, 2], alpha: 0.5, depth: 0.5 }]));
    expect(hdr).toEqual([16, -16, 1, 0.5]);
    expect(() => accumulateWeightedTransparency([{ color: [1, 0, 0], alpha: NaN, depth: 0.5 }])).toThrow(/finite/);
    expect(() => weightedTransparencyWeight(1.1)).toThrow(/depth/);
  });

  it("keeps the declared maximum layer bound inside finite half-float range", () => {
    const fragments = Array.from({ length: 1024 }, () => ({ color: [100, -100, 1] as const, alpha: 1, depth: 0 }));
    const total = accumulateWeightedTransparency(fragments);
    expect(total.color).toEqual([32768, -32768, 1024]);
    expect(total.alpha).toBe(1024);
    expect(total.revealage).toBe(0);
    expect(resolveWeightedTransparency(total)).toEqual([32, -32, 1, 1]);
  });

  it("rejects draw states that would change semantics", () => {
    expect(weightedTransparencyIneligibility(alphaState, { depthConvention: "standard" })).toBeUndefined();
    for (const state of [
      { ...alphaState, depthTest: false }, { ...alphaState, depthWrite: true },
      { ...alphaState, blendMode: "additive" as const }, { ...alphaState, stencil: {} },
      { ...alphaState, polygonOffset: { factor: 1, units: 1 } }, { ...alphaState, colorWrite: [true, false, true, true] as const },
      { ...alphaState, alphaToCoverage: true }, { ...alphaState, depthCompareV2: "greater" as const }
    ]) expect(weightedTransparencyIneligibility(state, { depthConvention: "standard" })).toBeTruthy();
    expect(weightedTransparencyIneligibility(alphaState, { depthConvention: "standard", transmission: true })).toMatch(/transmission/);
    expect(weightedTransparencyIneligibility(alphaState, { depthConvention: "standard", renderOrder: 1 })).toMatch(/order/);
    expect(weightedTransparencyIneligibility({ ...alphaState, depthCompareV2: "greater-equal" }, { depthConvention: "reversed" })).toBeUndefined();
  });
});

describe("weighted transparency resource and submission contract", () => {
  it("uses distinct generated material variants with the actual depth bindings", () => {
    const device = new MockRenderDevice();
    const shaders = ["accumulation", "revealage"].map((phase) => {
      const output = generateProgramImpl(normalizeProgramFeatures({ alphaMode: "blend", features: { "a3d.transparency": phase } }));
      const marker = /a3d-generated-program:[0-9a-f]+/.exec(output.vertex)?.[0];
      if (!marker) throw new Error("generated program marker missing");
      const shader = device.createShaderProgram({ label: phase, marker, vertex: output.vertex, fragment: output.fragment });
      expect(shader.reflection.uniforms.has("u_a3dOpaqueDepth")).toBe(true);
      expect(shader.reflection.uniforms.has("u_a3dTransparencyReversedDepth")).toBe(true);
      expect(shader.reflection.uniforms.has("u_a3dTransparencyInputPremultiplied")).toBe(true);
      return { key: output.key, shader };
    });
    expect(shaders[0]!.key).not.toBe(shaders[1]!.key);
    shaders.forEach(({ shader }) => shader.dispose());
    device.dispose();
  });

  it("flushes opaque depth before target switches and binds a depth-only WebGPU view", async () => {
    const views: { label: string; aspect: string | undefined }[] = [];
    const passes: string[] = [];
    const fragments: string[] = [];
    const groups: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }[] = [];
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, writeTexture() {}, submit() {} },
      createBuffer: () => ({ destroy() {} }),
      createShaderModule: ({ code }) => { fragments.push(code); return { code }; },
      createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroup: (descriptor) => { groups.push(descriptor); return {}; },
      createSampler: () => ({}),
      createTexture: ({ label }) => ({
        createView(descriptor) { const view = { label: label ?? "", aspect: descriptor?.aspect }; views.push(view); return view; },
        destroy() {}
      }),
      createCommandEncoder: () => ({
        beginRenderPass(descriptor) {
          passes.push(descriptor.label ?? "");
          return { setPipeline() {}, setViewport() {}, setScissorRect() {}, setVertexBuffer() {}, setBindGroup() {}, draw() {}, end() {} };
        },
        finish() { return {}; }
      })
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native, requireNativeRendering: true });
    const scene = device.createRenderTarget({ width: 8, height: 6, label: "opaque-scene", depth: "texture" });
    const output = device.createShaderProgram({
      label: "depth-consumer", marker: "depth-consumer",
      vertex: "#version 300 es\n// depth-consumer\nin vec3 a_position; void main(){gl_Position=vec4(a_position,1.0);}",
      fragment: "#version 300 es\n// depth-consumer\nprecision highp float; uniform sampler2D u_depth; out vec4 outColor; void main(){outColor=texture(u_depth,vec2(0.5));}",
      portableBindings: [{ name: "u_dummy", kind: "float" }, { name: "u_depth", kind: "depth2d" }],
      webgpu: {
        vertex: "// depth-consumer\n/* @aura3d-bindings */\n@vertex fn main(@location(0) p: vec3<f32>)->@builtin(position) vec4<f32>{return vec4<f32>(p,1.0);}",
        fragment: "// depth-consumer\n/* @aura3d-bindings */\n@fragment fn main(@builtin(position) p: vec4<f32>)->@location(0) vec4<f32>{let d=textureLoad(u_depthTexture,vec2<i32>(p.xy),0);return vec4<f32>(d+aura.u_dummy);}"
      }
    });
    const buffer = device.createBuffer("vertex", 36, new Float32Array(9));
    const pass = new WeightedTransparency(device);
    device.beginFrame(8, 6);
    device.setRenderTarget(scene);
    device.clear([0, 0, 0, 1]); // Deliberately no opaque draw: clear must still precede depth sampling.
    const result = pass.execute({ viewId: "view", width: 8, height: 6, sceneTarget: scene, opaqueDepth: scene.depthTexture!, depthConvention: "standard", sampleCount: 1,
      maxFragmentsPerPixel: 1, support, items: [1], drawSorted() { throw new Error("unexpected fallback"); },
      drawWeighted(_phase, _items, bindings) {
        device.draw({ label: "depth-consumer", topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader: output,
          renderState: { ...alphaState, ...bindings.state }, uniforms: new Map<string, UniformValue>([["u_dummy", 0], ["u_depth", bindings.depth]]) });
      } });
    expect(result.mode).toBe("weighted");
    const clear = passes.indexOf("opaque-scene-native-clear-pass");
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(clear).toBeLessThan(passes.findIndex((label) => label.includes("depth-consumer")));
    const depthViews = views.filter((view) => view.label.includes("opaque-scene-depth") && view.aspect === "depth-only");
    expect(depthViews).toHaveLength(2);
    expect(groups.filter((group) => group.entries.some((entry) => depthViews.includes(entry.resource as typeof depthViews[number])))).toHaveLength(2);
    expect(fragments.some((source) => source.includes("var u_depthTexture: texture_depth_2d;") && source.includes("textureLoad(u_depthTexture"))).toBe(true);
    pass.dispose();
    device.endFrame();
    device.dispose();
  });

  it("initializes separate float targets, binds opaque depth twice, composites, and restores the view", () => {
    const device = new MockRenderDevice();
    const request = makeRequest(device);
    const phaseTargets: string[] = [];
    const pass = new WeightedTransparency(device);
    const result = pass.execute({ ...request, view: { x: 1, y: 1, width: 5, height: 4, scissor: { x: 2, y: 1, width: 3, height: 4 } },
      drawWeighted: (phase, items, bindings) => {
        expect(items).toEqual([1, 2]);
        expect(bindings.depth.texture).toBe(request.opaqueDepth);
        expect(bindings.depth.name).toBe("u_a3dOpaqueDepth");
        expect(bindings.reversedDepth).toBe(0);
        expect(bindings.state).toMatchObject({ blend: true, depthTest: false, depthWrite: false, colorWrite: [true, true, true, true] });
        expect(bindings.state.blendMode).toMatchObject({ color: { src: phase === "accumulation" ? "one" : "zero", dst: phase === "accumulation" ? "one" : "one-minus-src-alpha" } });
        phaseTargets.push(`${phase}:${device.getRenderTarget()!.label}`);
      } });
    expect(result.mode).toBe("weighted");
    if (result.mode !== "weighted") throw new Error("expected weighted result");
    expect(result.accumulation.colorTexture.format).toBe("rgba16f");
    expect(result.revealage.colorTexture.format).toBe("rgba16f");
    expect(phaseTargets).toEqual(["accumulation:scene-weighted-transparency-accumulation", "revealage:scene-weighted-transparency-revealage"]);
    expect(device.drawCommands.map((command) => command.label)).toEqual(["weighted-transparency-clear", "weighted-transparency-clear", "weighted-transparency-composite"]);
    expect(device.drawCommands[0]!.uniforms!.get("u_clear")).toEqual([0, 0, 0, 0]);
    expect(device.drawCommands[1]!.uniforms!.get("u_clear")).toEqual([1, 1, 1, 1]);
    expect(device.drawCommands[2]!.renderState?.blendMode).toBe("premultiplied");
    expect(device.getRenderTarget()).toBe(request.sceneTarget);
    expect(device.getViewportCalls().slice(-3).map((entry) => entry.call)).toEqual(["viewport", "scissor", "scissorTest"]);
    pass.dispose();
    expect(result.accumulation.disposed && result.revealage.disposed).toBe(true);
    expect(request.sceneTarget!.disposed).toBe(false);
    device.endFrame();
    device.dispose();
  });

  it("isolates views, reuses storage, and retires targets on resize and device generation", () => {
    const device = new MockRenderDevice();
    const request = makeRequest(device);
    const pass = new WeightedTransparency(device);
    const first = pass.execute(request);
    const second = pass.execute(request);
    const other = pass.execute({ ...request, viewId: "right" });
    expect(first.mode).toBe("weighted");
    expect(second.mode).toBe("weighted");
    expect(other.mode).toBe("weighted");
    if (first.mode !== "weighted" || second.mode !== "weighted" || other.mode !== "weighted") throw new Error("expected weighted results");
    expect(first.accumulation).toBe(second.accumulation);
    expect(other.accumulation).not.toBe(first.accumulation);
    const resizedScene = device.createRenderTarget({ width: 4, height: 4, depth: "texture" });
    device.setRenderTarget(resizedScene);
    const resized = pass.execute({ ...request, width: 4, height: 4, sceneTarget: resizedScene, opaqueDepth: resizedScene.depthTexture! });
    expect(resized.mode).toBe("weighted");
    expect(first.accumulation.disposed).toBe(true);
    expect(other.accumulation.disposed).toBe(false);
    pass.execute({ ...request, width: 4, height: 4, sceneTarget: resizedScene, opaqueDepth: resizedScene.depthTexture!, deviceGeneration: 2 });
    expect(other.accumulation.disposed).toBe(true);
    if (resized.mode === "weighted") expect(resized.accumulation.disposed).toBe(true);
    pass.releaseView("left");
    pass.dispose();
    device.endFrame();
    device.dispose();
  });

  it("selects sorted fallback before touching the targets for unsafe cases", () => {
    const device = new MockRenderDevice();
    const request = makeRequest(device);
    const pass = new WeightedTransparency(device);
    const fallbacks: string[] = [];
    for (const partial of [
      { sampleCount: 4 }, { depthConvention: "logarithmic" as const }, { opaqueDepth: null },
      { support: { ...support, floatBlend: false } }, { support: { ...support, depthTexture: false } },
      { support: { ...support, shaderVariants: false } }, { ineligibleReason: "transmission" }, { maxFragmentsPerPixel: 1025 }
    ]) {
      const result = pass.execute({ ...request, ...partial, drawWeighted: () => { throw new Error("must not run"); }, drawSorted: (items, reason) => { expect(items).toEqual(request.items); fallbacks.push(reason); } });
      expect(result.mode).toBe("sorted");
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getRenderTarget()).toBe(request.sceneTarget);
    }
    expect(fallbacks).toHaveLength(8);
    pass.dispose();
    device.endFrame();
    device.dispose();
  });

  it("restores the scene and remains reusable after a callback throws", () => {
    const device = new MockRenderDevice();
    const request = makeRequest(device);
    const pass = new WeightedTransparency(device);
    expect(() => pass.execute({ ...request, drawWeighted: () => { throw new Error("draw failed"); } })).toThrow("draw failed");
    expect(device.getRenderTarget()).toBe(request.sceneTarget);
    expect(pass.execute(request).mode).toBe("weighted");
    pass.dispose();
    expect(() => pass.execute(request)).toThrow(/disposed/);
    device.endFrame();
    device.dispose();
  });

  it("prevents reentrant destruction and retires cached targets when the device is lost", () => {
    const device = new MockRenderDevice();
    const request = makeRequest(device);
    const pass = new WeightedTransparency(device);
    let checked = false;
    const result = pass.execute({ ...request, drawWeighted: () => {
      if (checked) return;
      checked = true;
      expect(() => pass.execute(request)).toThrow(/already active/);
      expect(() => pass.releaseView("left")).toThrow(/during/);
      expect(() => pass.dispose()).toThrow(/during/);
    } });
    expect(result.mode).toBe("weighted");
    if (result.mode !== "weighted") throw new Error("expected weighted result");
    device.contextLost = true;
    expect(() => pass.execute(request)).toThrow(/device is unavailable/);
    expect(result.accumulation.disposed && result.revealage.disposed).toBe(true);
    device.contextLost = false;
    const recovered = pass.execute({ ...request, deviceGeneration: 2 });
    expect(recovered.mode).toBe("weighted");
    if (recovered.mode === "weighted") expect(recovered.accumulation).not.toBe(result.accumulation);
    pass.dispose();
    device.endFrame();
    device.dispose();
  });

  it("cleans up a partially created target and falls back on allocation failure", () => {
    const device = new MockRenderDevice();
    const request = makeRequest(device);
    const original = device.createRenderTarget.bind(device);
    let calls = 0;
    let first: ReturnType<typeof original> | undefined;
    device.createRenderTarget = (desc: RenderTargetDescriptor) => {
      if (++calls === 2) throw new Error("out of memory");
      first = original(desc); return first;
    };
    let fallback = "";
    const pass = new WeightedTransparency(device);
    const result = pass.execute({ ...request, drawSorted: (_items, reason) => { fallback = reason; } });
    expect(result.mode).toBe("sorted");
    expect(fallback).toMatch(/out of memory/);
    expect(first?.disposed).toBe(true);
    expect(device.getRenderTarget()).toBe(request.sceneTarget);
    pass.dispose();
    device.endFrame();
    device.dispose();
  });
});
