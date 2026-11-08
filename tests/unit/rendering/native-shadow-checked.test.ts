import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, PerspectiveCamera, PointLight } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { CascadedShadowMaps, CascadedShadowPass } from "../../../packages/rendering/src/CascadedShadowMaps";
import { DepthPass, type PreparedDepthPlan } from "../../../packages/rendering/src/DepthPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, type DrawCommand, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import type { RenderPassContext } from "../../../packages/rendering/src/RenderPass";
import { ShadowMap } from "../../../packages/rendering/src/ShadowMap";
import { ShadowPass } from "../../../packages/rendering/src/ShadowPass";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { rememberBatchMembers } from "../../../packages/rendering/src/batching/BatchMembers";
import { setRendererQrFlags, withRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { RendererShadowOrchestrator } from "../../../packages/rendering/src/renderer/ShadowOrchestration";
import { Prd02ShadowSystem } from "../../../packages/rendering/src/shadows/ShadowSystem";

const EYE = [7, -3, 11] as const;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FLAGS_OFF = resolveQrFlags({ options: ["none"] });
const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
// Outside strict, WebGPU leaves point casters out of depth with one warning; strict keeps the preflight rejection.
const FLAGS_STRICT = resolveQrFlags({ options: { A3D_QR_LIGHTING: true, A3D_QR_STRICT: true } });

function caster() {
  const graph: ShaderGraphDocument = {
    version: 1, stage: "material",
    nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "eye", op: "input", type: "vec3", name: "cameraPosition" },
      { id: "displaced", op: "add", type: "vec3", inputs: ["position", "eye"] }
    ],
    outputs: { position: "displaced" }
  };
  const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
  const geometry = Geometry.triangle();
  const item = { geometry, material, modelMatrix: IDENTITY, label: "checked-caster", castShadow: true };
  return { material, geometry, item };
}

/** Real WebGPUDevice with native-shaped encoders and a controllable queue, not a GPU. */
async function nativeDevice(renderPipeline = true) {
  let failNext = false;
  const events: string[] = [];
  const native = {
    queue: {
      writeBuffer() {}, writeTexture() {},
      submit() { events.push("submit"); if (failNext) { failNext = false; throw new Error("injected queue failure"); } },
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createShaderModule: ({ code }: { code: string }) => ({ code }),
    createBindGroupLayout: (layout: object) => layout,
    createPipelineLayout: (layout: object) => layout,
    ...(renderPipeline ? { createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }) } : {}),
    createBindGroup: (group: object) => group,
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {}, setViewport() {}, setScissorRect() {},
        draw() { events.push("draw"); }, drawIndexed() { events.push("draw"); }, end() {}
      }),
      copyTextureToTexture() { events.push("copy"); },
      finish: () => ({})
    }),
    destroy() {}
  };
  const nativeShape = native as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => nativeShape }, device: nativeShape });
  return { device, events, rejectNext: () => { failNext = true; } };
}

function mockWebGPU(kind: "mock" | "webgpu" = "webgpu") {
  const device = new MockRenderDevice();
  if (kind === "webgpu") Object.defineProperty(device, "kind", { value: "webgpu" });
  const submit = device.draw.bind(device);
  const attempts: DrawCommand[] = [];
  let failAt = -1;
  Object.defineProperty(device, "drawChecked", { configurable: true, value: (command: DrawCommand) => {
    attempts.push(command);
    if (attempts.length === failAt) throw new Error("injected checked draw failure");
    submit(command);
  } });
  return { device, attempts, rejectAt: (index: number) => { failAt = index; } };
}

function withoutFrameToken(device: MockRenderDevice): MockRenderDevice {
  return new Proxy(device, {
    get(target, key) {
      if (key === "activeFrameToken") return undefined;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

describe("checked WebGPU shadow publication", () => {
  it("keeps legacy unclipped third-party shadows but rejects clipped or packed fallback before clear", () => {
    const f = mockWebGPU();
    const device = withoutFrameToken(f.device);
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    const ordinary = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }) });
    const clipped = new ShadowPass({ light, casters: [{ ...item, globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } }], shadowMap: new ShadowMap({ size: 4 }) });
    const packed = new ShadowPass({ light, casters: [{ ...item, multiDraw: {} } as never], shadowMap: new ShadowMap({ size: 4 }) });
    try {
      device.beginFrame(4, 4);
      expect(ordinary.execute({ device, width: 4, height: 4 }).rendered).toBe(true);
      expect(f.attempts).toHaveLength(1);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(() => clipped.execute({ device, width: 4, height: 4 })).toThrow(/Legacy depth fallback/);
      expect(() => packed.execute({ device, width: 4, height: 4 })).toThrow(/Legacy depth fallback/);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(f.attempts).toHaveLength(1);
      expect(clipped.getLastResult()).toBeNull();
      expect(packed.getLastResult()).toBeNull();
      device.endFrame();
    } finally { ordinary.dispose(); clipped.dispose(); packed.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("rejects an accessor in a no-token fallback before invoking it or clearing", () => {
    const f = mockWebGPU();
    const device = withoutFrameToken(f.device);
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    let calls = 0;
    Object.defineProperty(item, "globalClipping", { get: () => {
      calls += 1;
      return { planes: [[1, 0, 0, 0]], clipShadows: calls > 1 };
    } });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }) });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    try {
      device.beginFrame(4, 4);
      expect(() => pass.execute({ device, width: 4, height: 4 })).toThrow(/Clipping accessors/);
      expect(calls).toBe(0);
      expect(clear).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      device.endFrame();
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it.each(["mock", "webgpu"] as const)("preflights a late unsupported caster before clearing a standalone %s shadow target", (kind) => {
    const f = mockWebGPU(kind);
    const { material, geometry, item } = caster();
    const points = Geometry.points([[0, 0, 0]]);
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    // Clipped points are a supported non-WebGPU shadow caster since the 5.0
    // clipped specialized depth path (ed5a52d58, SpecializedClippedDepth.ts);
    // instanced clipped points stay unsupported on every device.
    const pass = new ShadowPass({ light, shadowMap: new ShadowMap({ size: 4 }), casters: [item, {
      geometry: points, label: "late-clipped-points", instanceTransforms: [...IDENTITY], globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true }
    }] });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    const allocate = vi.spyOn(f.device, "createRenderTarget");
    if (kind === "webgpu") setRendererQrFlags(FLAGS_STRICT, f.device);
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow(kind === "webgpu" ? /WebGPU point depth requires/ : /Clipped point depth does not support/);
      expect(clear).not.toHaveBeenCalled();
      expect(allocate).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      expect(f.device.drawCommands).toHaveLength(0);
      expect(pass.getLastResult()).toBeNull();
      expect(f.device.getRenderTarget()).toBe(previous);
      f.device.endFrame();
    } finally { pass.dispose(); previous.dispose(); points.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("ends a pass-owned frame when preparation rejects a caster", () => {
    const f = mockWebGPU();
    const points = Geometry.points([[0, 0, 0]]);
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const pass = new ShadowPass({ light, casters: [{ geometry: points, globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } }] });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    setRendererQrFlags(FLAGS_STRICT, f.device);
    try {
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow(/WebGPU point depth requires/);
      expect(f.device.activeFrameToken).toBeNull();
      expect(clear).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
    } finally { pass.dispose(); points.dispose(); f.device.dispose(); }
  });

  it("keeps unclipped QR shadows on a no-token device and rejects clipped fallback before clear", () => {
    const f = mockWebGPU();
    const device = withoutFrameToken(f.device);
    const { material, geometry, item } = caster();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 4, cascades: 1, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const frame = { camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
      sun: { direction: [0, -1, -0.2] as const }, casters: [item], flags: FLAGS_ON, tier: QUALITY_TIERS.high };
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    try {
      device.beginFrame(4, 4);
      expect(system.update(frame).cascadeTextures[0]).not.toBeNull();
      expect(clear).toHaveBeenCalledTimes(1);
      expect(f.attempts).toHaveLength(1);
      expect(() => system.update({ ...frame, casters: [{ ...item, globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } }] })).toThrow(/Legacy depth fallback/);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(f.attempts).toHaveLength(1);
      expect(system.cascadeFits()).toEqual([]);
      device.endFrame();
    } finally { system.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("abandons all earlier QR plans when a later target cannot be prepared", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const originalPrepare = DepthPass.prototype.prepare;
    const plans: Array<{ pass: DepthPass; plan: PreparedDepthPlan; context: RenderPassContext }> = [];
    const prepare = vi.spyOn(DepthPass.prototype, "prepare").mockImplementation(function (this: DepthPass, context) {
      if (plans.length === 2) throw new Error("injected plan failure");
      const plan = originalPrepare.call(this, context);
      plans.push({ pass: this, plan, context });
      return plan;
    });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    try {
      f.device.beginFrame(4, 4);
      expect(() => system.update({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
        sun: { direction: [0, -1, -0.2] }, casters: [item],
        localLights: [{ shadowIndex: 0, kind: "point", position: [1, 2, 3], direction: [0, -1, 0], range: 20, size: 64 }],
        flags: FLAGS_ON, tier: QUALITY_TIERS.high })).toThrow("injected plan failure");
      expect(plans).toHaveLength(2);
      for (const { pass, plan, context } of plans) expect(() => pass.validatePrepared(context, plan)).toThrow(/consumed or disposed/);
      expect(clear).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      f.device.endFrame();
    } finally { prepare.mockRestore(); system.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("revalidates earlier QR plans after later preparation changes shared geometry", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const originalPrepare = DepthPass.prototype.prepare;
    let prepared = 0;
    const prepare = vi.spyOn(DepthPass.prototype, "prepare").mockImplementation(function (this: DepthPass, context) {
      prepared += 1;
      if (prepared === 3) geometry.vertexBuffer.setAttribute(0, "position", [0.25, 0, 0]);
      return originalPrepare.call(this, context);
    });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    try {
      f.device.beginFrame(4, 4);
      expect(() => system.update({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
        sun: { direction: [0, -1, -0.2] }, casters: [item],
        localLights: [{ shadowIndex: 0, kind: "point", position: [1, 2, 3], direction: [0, -1, 0], range: 20, size: 64 }],
        flags: FLAGS_ON, tier: QUALITY_TIERS.high })).toThrow(/stale/);
      expect(prepared).toBe(8);
      expect(clear).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      expect(system.cascadeFits()).toEqual([]);
      f.device.endFrame();
    } finally { prepare.mockRestore(); system.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("rejects a plan whose frame changed during target allocation before clearing", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }) });
    const createTarget = f.device.createRenderTarget.bind(f.device);
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = createTarget(descriptor);
      f.device.endFrame();
      f.device.beginFrame(4, 4);
      return target;
    });
    try {
      f.device.beginFrame(4, 4);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow(/stale/);
      expect(clear).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      expect(pass.getLastResult()).toBeNull();
      f.device.endFrame();
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("does not publish when ending a pass-owned frame fails", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }) });
    const end = f.device.endFrame.bind(f.device);
    vi.spyOn(f.device, "endFrame").mockImplementation(() => { end(); throw new Error("injected end-frame failure"); });
    try {
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow("injected end-frame failure");
      expect(pass.getLastResult()).toBeNull();
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
      expect(f.device.activeFrameToken).toBeNull();
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it.each(["mock", "webgpu"] as const)("preflights all QR %s shadow casters before clearing any target", (kind) => {
    const f = mockWebGPU(kind);
    const { material, geometry, item } = caster();
    const points = Geometry.points([[0, 0, 0]]);
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    const allocate = vi.spyOn(f.device, "createRenderTarget");
    if (kind === "webgpu") setRendererQrFlags(FLAGS_STRICT, f.device);
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      expect(() => system.update({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
        sun: { direction: [0, -1, -0.2] }, cameraPosition: EYE,
        casters: [item, { geometry: points, label: "late-clipped-points", instanceTransforms: [...IDENTITY], globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } }],
        localLights: [{ shadowIndex: 0, kind: "point", position: [1, 2, 3], direction: [0, -1, 0], range: 20, size: 64 }],
        flags: kind === "webgpu" ? FLAGS_STRICT : FLAGS_ON, tier: QUALITY_TIERS.high })).toThrow(kind === "webgpu" ? /WebGPU point depth requires/ : /Clipped point depth does not support/);
      expect(clear).not.toHaveBeenCalled();
      expect(allocate).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      expect(f.device.drawCommands).toHaveLength(0);
      expect(system.cascadeFits()).toEqual([]);
      expect(f.device.getRenderTarget()).toBe(previous);
      f.device.endFrame();
    } finally { system.dispose(); previous.dispose(); points.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it.each(["mock", "webgpu"] as const)("keeps one %s clipping snapshot through every QR cascade and atlas tile", (kind) => {
    const f = mockWebGPU(kind);
    const { material, geometry, item } = caster();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const plane: [number, number, number, number] = [1, 0, 0, -1];
    const clearTarget = f.device.clearRenderTarget.bind(f.device);
    vi.spyOn(f.device, "clearRenderTarget").mockImplementation((color) => {
      clearTarget(color);
      plane[3] = -7;
    });
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      system.update({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
        sun: { direction: [0, -1, -0.2] }, cameraPosition: EYE,
        casters: [{ ...item, globalClipping: { planes: [plane], clipShadows: true } }],
        localLights: [{ shadowIndex: 0, kind: "point", position: [1, 2, 3], direction: [0, -1, 0], range: 20, size: 64 }],
        flags: FLAGS_ON, tier: QUALITY_TIERS.high });
      expect(plane[3]).toBe(-7);
      expect(f.device.drawCommands).toHaveLength(8);
      for (const command of f.device.drawCommands) {
        expect(Array.from(command.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, -1]);
      }
      expect(f.device.getRenderTarget()).toBe(previous);
      f.device.endFrame();
    } finally { system.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it.each(["item-global", "item-material", "material-reference", "base-material", "group-planes", "plane-value", "inherited", "batch-member", "array-map"] as const)(
    "rejects side-effecting %s clipping before preparing any QR target", (kind) => {
      const f = mockWebGPU();
      const { material, geometry, item } = caster();
      const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
      const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
      const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
      const plane = [1, 0, 0, -1];
      const planes = [plane];
      const group = { planes, clipShadows: true };
      let calls = 0;
      let source: RenderItem = item;
      if (kind === "item-global" || kind === "batch-member") {
        Object.defineProperty(item, "globalClipping", { get: () => { calls += 1; return group; } });
      } else if (kind === "item-material") {
        Object.defineProperty(item, "materialClipping", { get: () => { calls += 1; return group; } });
      } else if (kind === "material-reference") {
        // Variant selection normally reads this field; the multi-target
        // clipping guard must inspect its descriptor first.
        Object.defineProperty(item, "material", { configurable: true, get: () => { calls += 1; return material; } });
      } else if (kind === "base-material") {
        Object.defineProperty(material, "clipping", { configurable: true, get: () => { calls += 1; return group; } });
      } else if (kind === "group-planes") {
        Object.defineProperty(group, "planes", { get: () => { calls += 1; return planes; } });
        Object.assign(item, { globalClipping: group });
      } else if (kind === "plane-value") {
        Object.defineProperty(plane, "3", { get: () => { calls += 1; return -calls; } });
        Object.assign(item, { globalClipping: group });
      } else if (kind === "inherited") {
        const prototype = { get globalClipping() { calls += 1; return group; } };
        source = Object.assign(Object.create(prototype) as RenderItem, item);
      } else {
        Object.defineProperty(planes, "map", { value: () => { calls += 1; return []; } });
        Object.assign(item, { globalClipping: group });
      }
      if (kind === "batch-member") {
        const batch = { ...item, globalClipping: undefined };
        rememberBatchMembers(batch, [item]);
        source = batch;
        calls = 0; // Spreading the test carrier is not part of shadow preparation.
      }
      const clear = vi.spyOn(f.device, "clearRenderTarget");
      try {
        f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
        expect(() => system.update({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
          sun: { direction: [0, -1, -0.2] }, casters: [source],
          localLights: [{ shadowIndex: 0, kind: "point", position: [1, 2, 3], direction: [0, -1, 0], range: 20, size: 64 }],
          flags: FLAGS_ON, tier: QUALITY_TIERS.high })).toThrow(/Clipping accessors|Custom clipping plane array methods/i);
        expect(calls).toBe(0);
        expect(clear).not.toHaveBeenCalled();
        expect(f.attempts).toHaveLength(0);
        expect(f.device.getRenderTarget()).toBe(previous);
        f.device.endFrame();
      } finally { system.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
    }
  );

  it("rechecks multi-target clipping after later frame inputs have been read", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    let getterCalls = 0;
    try {
      f.device.beginFrame(4, 4);
      expect(() => system.update({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
        sun: { direction: [0, -1, -0.2] }, casters: [item], flags: FLAGS_ON, tier: QUALITY_TIERS.high,
        get cameraPosition() {
          Object.defineProperty(item, "globalClipping", { get: () => { getterCalls += 1; return { planes: [[1, 0, 0, 0]], clipShadows: true }; } });
          return EYE;
        }
      })).toThrow(/Clipping accessors/);
      expect(getterCalls).toBe(0);
      expect(clear).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      f.device.endFrame();
    } finally { system.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("does not publish when the native draw path skips a caster", async () => {
    const f = await nativeDevice(false);
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }), cameraPosition: EYE });
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow(/could not be submitted/);
      expect(pass.getLastResult()).toBeNull();
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
      expect(f.events.filter((event) => event === "draw")).toHaveLength(0);
      expect(f.device.getRenderTarget()).toBe(previous);
      f.device.endFrame();
    } finally { pass.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("invalidates an earlier map on a native queue failure, restores the target, and succeeds on retry", async () => {
    const f = await nativeDevice();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    const pass = new ShadowPass({ light, casters: [item, { ...item, label: "second" }], shadowMap: new ShadowMap({ size: 4 }),
      viewProjectionMatrix: IDENTITY, cameraPosition: EYE, timeSeconds: 12.5 });
    const checked = f.device.drawChecked.bind(f.device);
    const submitted: DrawCommand[] = [];
    vi.spyOn(f.device, "drawChecked").mockImplementation((command) => {
      submitted.push(command);
      if (submitted.length === 4) f.rejectNext();
      checked(command);
    });
    try {
      f.device.beginFrame(4, 4);
      f.device.setRenderTarget(previous);
      expect(pass.execute({ device: f.device, width: 4, height: 4 }).rendered).toBe(true);
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).not.toBeNull();
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow("injected queue failure");
      expect(pass.getLastResult()).toBeNull();
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(pass.execute({ device: f.device, width: 4, height: 4 }).rendered).toBe(true);
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).not.toBeNull();
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(submitted).toHaveLength(6);
      for (const command of submitted) {
        expect(command.uniforms?.get("u_cameraPosition")).toEqual(EYE);
        expect(command.uniforms?.get("u_time")).toBe(12.5);
      }
      const owned = pass.getRenderTarget()!;
      pass.dispose();
      expect(owned.disposed).toBe(true);
      expect(pass.getLastResult()).toBeNull();
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
      f.device.endFrame();
    } finally { pass.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("does not copy or publish a point atlas after a failed face and releases resources for retry", async () => {
    const f = await nativeDevice();
    const { material, geometry, item } = caster();
    const light = new PointLight("point"); light.castsShadow = true; light.range = 20;
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    const pipeline = new RendererShadowOrchestrator({ device: f.device, width: 4, height: 4, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null } as never);
    const checked = f.device.drawChecked.bind(f.device);
    let draws = 0;
    vi.spyOn(f.device, "drawChecked").mockImplementation((command) => {
      draws += 1;
      if (draws === 2) f.rejectNext();
      checked(command);
    });
    const failedTargets: RenderTarget[] = [];
    const failedPasses: ShadowPass[] = [];
    const retryTargets: RenderTarget[] = [];
    const retryPasses: ShadowPass[] = [];
    setRendererQrFlags(FLAGS_OFF, f.device);
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      const run = (ownedTargets: RenderTarget[], ownedShadowPasses: ShadowPass[]) => withRendererQrFlags(f.device, () => pipeline.executeRendererShadowMap({
        shadowOptions: { light, size: 4 }, source: {}, items: [item], lights: [], ownedTargets, ownedShadowPasses, cameraPosition: EYE
      }));
      expect(() => run(failedTargets, failedPasses)).toThrow("injected queue failure");
      expect(f.events.filter((event) => event === "copy")).toHaveLength(1);
      expect(failedTargets).toHaveLength(1);
      expect(failedPasses).toHaveLength(2);
      expect(failedPasses[1]!.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
      expect(f.device.getRenderTarget()).toBe(previous);
      const faces = failedPasses.map((pass) => pass.getRenderTarget()!);
      for (const pass of failedPasses) pass.dispose();
      for (const target of failedTargets) target.dispose();
      expect(faces.every((target) => target.disposed)).toBe(true);
      expect(failedTargets[0]!.disposed).toBe(true);
      expect(run(retryTargets, retryPasses)?.pointLight?.texture.texture).toBe(retryTargets[0]?.colorTexture);
      expect(f.events.filter((event) => event === "copy")).toHaveLength(7);
      expect(retryPasses).toHaveLength(6);
      expect(f.device.getRenderTarget()).toBe(previous);
      f.device.endFrame();
    } finally {
      for (const pass of [...failedPasses, ...retryPasses]) pass.dispose();
      for (const target of [...failedTargets, ...retryTargets]) target.dispose();
      previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose();
    }
  });

  it("cannot expose partial cascades after a checked submission fails", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const cascades = new CascadedShadowMaps({ cascadeCount: 2, near: 0.1, far: 20, size: 4 });
    const pass = new CascadedShadowPass({ light, casters: [item], cascades, cameraPosition: EYE, timeSeconds: 12.5,
      viewProjectionMatrices: [IDENTITY, IDENTITY] });
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      expect(pass.execute({ device: f.device, width: 4, height: 4 }).rendered).toBe(true);
      expect(pass.getForwardShadowMaps({ lightMatrices: [IDENTITY, IDENTITY] })).toHaveLength(2);
      f.rejectAt(4);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow("injected checked draw failure");
      expect(pass.getLastResult()).toBeNull();
      expect(pass.getForwardShadowMaps({ lightMatrices: [IDENTITY, IDENTITY] })).toEqual([]);
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(pass.execute({ device: f.device, width: 4, height: 4 }).rendered).toBe(true);
      expect(pass.getForwardShadowMaps({ lightMatrices: [IDENTITY, IDENTITY] })).toHaveLength(2);
      for (const command of f.attempts) expect(command.uniforms?.get("u_cameraPosition")).toEqual(EYE);
      f.device.endFrame();
    } finally { pass.dispose(); cascades.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("rejects an accessor before standalone legacy cascades clear their first target", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const cascades = new CascadedShadowMaps({ cascadeCount: 2, near: 0.1, far: 20, size: 4 });
    const pass = new CascadedShadowPass({ light, casters: [item], cascades, viewProjectionMatrices: [IDENTITY, IDENTITY] });
    let reads = 0;
    Object.defineProperty(item, "globalClipping", { get: () => { reads += 1; return { planes: [[1, 0, 0, -reads]], clipShadows: true }; } });
    const clear = vi.spyOn(f.device, "clearRenderTarget");
    const allocate = vi.spyOn(f.device, "createRenderTarget");
    try {
      f.device.beginFrame(4, 4);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow(/Clipping accessors/);
      expect(reads).toBe(0);
      expect(clear).not.toHaveBeenCalled();
      expect(allocate).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      expect(pass.getLastResult()).toBeNull();
      expect(pass.getForwardShadowMaps({ lightMatrices: [IDENTITY, IDENTITY] })).toEqual([]);
      f.device.endFrame();
    } finally { pass.dispose(); cascades.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("rejects an accessor before the first legacy point-shadow face or atlas copy", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new PointLight("point"); light.castsShadow = true; light.range = 20;
    const pipeline = new RendererShadowOrchestrator({ device: f.device, width: 4, height: 4, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null } as never);
    const ownedTargets: RenderTarget[] = [], ownedShadowPasses: Array<{ dispose(): void }> = [];
    let reads = 0;
    Object.defineProperty(item, "globalClipping", { get: () => { reads += 1; return { planes: [[1, 0, 0, -reads]], clipShadows: true }; } });
    const clear = vi.spyOn(f.device, "clearRenderTarget"), copy = vi.spyOn(f.device, "copyRenderTargetColorRegion");
    const allocate = vi.spyOn(f.device, "createRenderTarget");
    setRendererQrFlags(FLAGS_OFF, f.device);
    try {
      f.device.beginFrame(4, 4);
      expect(() => withRendererQrFlags(f.device, () => pipeline.executeRendererShadowMap({ shadowOptions: { light, size: 4 },
        source: {}, items: [item], lights: [], ownedTargets, ownedShadowPasses, cameraPosition: EYE }))).toThrow(/Clipping accessors/);
      expect(reads).toBe(0);
      expect(clear).not.toHaveBeenCalled();
      expect(copy).not.toHaveBeenCalled();
      expect(allocate).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(0);
      expect(ownedTargets).toHaveLength(0);
      expect(ownedShadowPasses).toHaveLength(0);
      f.device.endFrame();
    } finally {
      for (const pass of ownedShadowPasses) pass.dispose();
      for (const target of ownedTargets) target.dispose();
      geometry.dispose(); material.dispose(); f.device.dispose();
    }
  });

  it("registers every renderer cascade for disposal before a checked draw can fail", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const camera = new PerspectiveCamera({ near: 0.1, far: 20, fovYRadians: Math.PI / 3, aspect: 1 });
    camera.transform.setPosition(0, 2, 5); camera.updateCameraMatrices();
    const pipeline = new RendererShadowOrchestrator({ device: f.device, width: 4, height: 4, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null } as never);
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    const create = vi.spyOn(f.device, "createRenderTarget");
    const disposeMaps = vi.spyOn(ShadowMap.prototype, "dispose");
    setRendererQrFlags(FLAGS_OFF, f.device);
    try {
      f.device.beginFrame(4, 4);
      f.rejectAt(2);
      expect(() => withRendererQrFlags(f.device, () => pipeline.executeRendererShadowMap({
        shadowOptions: { light, size: 4, cascadeCount: 3 }, source: {}, items: [item], lights: [], camera,
        cameraPosition: EYE, ownedTargets, ownedShadowPasses
      }))).toThrow("injected checked draw failure");
      expect(ownedShadowPasses).toHaveLength(1);
      const allocated = create.mock.results.map((result) => result.value);
      expect(allocated).toHaveLength(2);
      const disposals = allocated.map((target) => vi.spyOn(target, "dispose"));
      for (const pass of ownedShadowPasses) pass.dispose();
      expect(allocated.every((target) => target.disposed)).toBe(true);
      expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
      expect(disposeMaps).toHaveBeenCalledTimes(3);
      expect(new Set(disposeMaps.mock.instances).size).toBe(3);
      f.device.endFrame();
    } finally {
      for (const pass of ownedShadowPasses) pass.dispose();
      disposeMaps.mockRestore(); geometry.dispose(); material.dispose(); f.device.dispose();
    }
  });

  it("invalidates a failed QR atlas frame and checks all cascade and tile draws on retry", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60 }); camera.updateCameraMatrices();
    const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: true });
    const system = new Prd02ShadowSystem(f.device, { enabled: true, mapSize: 4, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const frame = { camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
      cameraPosition: EYE, timeSeconds: 12.5, sun: { direction: [0, -1, -0.2] as const }, casters: [item],
      localLights: [{ shadowIndex: 0, kind: "point" as const, position: [-8, 4, 2] as const, direction: [0, -1, 0] as const, range: 20, size: 64 }],
      flags: FLAGS_ON, tier: QUALITY_TIERS.high };
    try {
      f.device.beginFrame(4, 4); f.device.setRenderTarget(previous);
      f.rejectAt(4);
      expect(() => system.update(frame)).toThrow("injected checked draw failure");
      expect(system.cascadeFits()).toEqual([]);
      expect(system.diagnostics()).toMatchObject({ cascadeCount: 0, tiles: 0, localLights: 0, casterVariants: [] });
      expect(f.device.getRenderTarget()).toBe(previous);
      const uniforms = system.update(frame);
      expect(uniforms.cascadeTextures[0]?.format).toBe("rgba8");
      expect(uniforms.atlasTexture?.format).toBe("rgba8");
      expect(f.attempts).toHaveLength(12);
      for (const command of f.attempts) expect(command.uniforms?.get("u_cameraPosition")).toEqual(EYE);
      expect(f.attempts.every((command) => command.uniforms?.get("u_time") === 12.5)).toBe(true);
      expect(f.device.getRenderTarget()).toBe(previous);
      f.device.endFrame();
    } finally { system.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });

  it("requires native checking and target restoration while keeping the mock/WebGL path unchanged", () => {
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const webgpu = new MockRenderDevice();
    Object.defineProperty(webgpu, "kind", { value: "webgpu" });
    const previous = webgpu.createRenderTarget({ width: 4, height: 4, depth: true });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }) });
    const fallback = new MockRenderDevice();
    const ordinary = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }) });
    const forbidden = vi.fn(() => { throw new Error("unexpected checked draw"); });
    Object.defineProperty(fallback, "drawChecked", { value: forbidden });
    try {
      webgpu.beginFrame(4, 4); webgpu.setRenderTarget(previous);
      expect(() => pass.execute({ device: webgpu, width: 4, height: 4 })).toThrow(/Checked depth submission is unavailable/);
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
      expect(webgpu.getRenderTarget()).toBe(previous);
      Object.defineProperty(webgpu, "getRenderTarget", { configurable: true, value: undefined });
      expect(() => pass.execute({ device: webgpu, width: 4, height: 4 })).toThrow(/state restoration/);
      delete (webgpu as unknown as { getRenderTarget?: unknown }).getRenderTarget;
      webgpu.endFrame();
      fallback.beginFrame(4, 4);
      expect(ordinary.execute({ device: fallback, width: 4, height: 4 }).rendered).toBe(true);
      expect(forbidden).not.toHaveBeenCalled();
      expect(fallback.getRenderTarget()).toBeNull();
      fallback.endFrame();
    } finally { pass.dispose(); ordinary.dispose(); previous.dispose(); geometry.dispose(); material.dispose(); webgpu.dispose(); fallback.dispose(); }
  });

  it("owns a fallback target when a supplied target has the wrong size, including after draw failure", () => {
    const f = mockWebGPU();
    const { material, geometry, item } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const supplied = f.device.createRenderTarget({ width: 2, height: 2, depth: true });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 4 }), renderTarget: supplied });
    try {
      f.device.beginFrame(4, 4);
      f.rejectAt(1);
      expect(() => pass.execute({ device: f.device, width: 4, height: 4 })).toThrow("injected checked draw failure");
      const allocated = pass.getRenderTarget()!;
      expect(allocated).not.toBe(supplied);
      expect(allocated.disposed).toBe(false);
      pass.dispose();
      expect(allocated.disposed).toBe(true);
      expect(supplied.disposed).toBe(false);
      expect(pass.getLastResult()).toBeNull();
      f.device.endFrame();
    } finally { pass.dispose(); supplied.dispose(); geometry.dispose(); material.dispose(); f.device.dispose(); }
  });
});
