import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { DirectionalLight, PerspectiveCamera } from "@aura3d/scene";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { BaseRenderPass } from "../../../packages/rendering/src/RenderPass";
import { RenderGraph } from "../../../packages/rendering/src/RenderGraph";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { registerFrameContributor, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { contactShadowMask, resolveContactShadowMask } from "../../../packages/rendering/src/forward/contactShadowMaskStore";
import { CONTACT_MASK_SHADER_SOURCES } from "../../../packages/rendering/src/passes/ContactShadowPass";
import { createPrd02ContactShadowsContributor, prd02ContactShadowDiagnostics } from "../../../packages/rendering/src/passes/Prd02ContactShadowsContributor";
import { GENERATED_PBR_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

/** Exercises the real WebGPUDevice submission path with a recorded fake native device, not GPU pixels. */
async function fixture() {
  const textures: { descriptor: { label?: string; format: string }; destroy: ReturnType<typeof vi.fn>; createView(descriptor?: object): unknown }[] = [];
  const modules: { label?: string; code: string }[] = [];
  const layouts: { entries: readonly { binding: number; texture?: { sampleType: string }; sampler?: unknown }[] }[] = [];
  const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
  const writes: { label: string; bytes: Uint8Array }[] = [];
  let failedLabel: string | undefined;
  let lose!: (info: { message: string }) => void;
  const lost = new Promise<{ message: string }>(resolve => { lose = resolve; });
  const native = {
    lost,
    queue: {
      writeBuffer(buffer: { descriptor: { label?: string } }, _offset: number, data: ArrayBufferView) {
        writes.push({ label: buffer.descriptor.label ?? "", bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice() });
      },
      writeTexture() {}, onSubmittedWorkDone: () => Promise.resolve(),
      submit: vi.fn((commands: readonly { label: string }[]) => {
        if (failedLabel && commands.some(command => command.label.includes(failedLabel!))) {
          failedLabel = undefined;
          throw new Error("injected contact submission failure");
        }
      })
    },
    createBuffer: (descriptor: { label?: string }) => ({ descriptor, destroy: vi.fn() }),
    createTexture(descriptor: { label?: string; format: string }) {
      const texture = { descriptor, destroy: vi.fn(), createView: (view?: object) => ({ texture, view }) };
      textures.push(texture); return texture;
    },
    createShaderModule(descriptor: { label?: string; code: string }) { modules.push(descriptor); return descriptor; },
    createSampler: () => ({}),
    createBindGroupLayout(descriptor: typeof layouts[number]) { layouts.push(descriptor); return descriptor; },
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup(group: typeof groups[number]) { groups.push(group); return group; },
    createCommandEncoder: (descriptor: { label: string }) => ({
      beginRenderPass: () => ({
        setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {},
        draw() {}, drawIndexed() {}, end() {}
      }),
      finish: () => ({ label: descriptor.label })
    }),
    destroy() {}
  };
  const canvasContext = { configure() {}, unconfigure() {}, getCurrentTexture: () => native.createTexture({ label: "canvas", format: "bgra8unorm" }) };
  const canvas = { width: 32, height: 24, getContext: (kind: string) => kind === "webgpu" ? canvasContext : null } as unknown as HTMLCanvasElement;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, canvas });
  return { device, native, canvas, textures, modules, layouts, groups, writes, lose, fail: (label: string) => { failedLabel = label; } };
}

const owner = {};
function frame(device: WebGPUDevice, index: number, width = 32, height = 24): FrameContributorContext {
  const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: width / height, near: 0.1, far: 50 });
  camera.transform.setPosition(0, 3, 8);
  camera.updateCameraMatrices();
  const sun = new DirectionalLight("sun");
  sun.castsShadow = true;
  sun.transform.setPosition(2, 4, 2);
  sun.transform.updateWorld(undefined, true);
  const item = { label: "caster", geometry: Geometry.litCube(1), material: new UnlitMaterial(),
    modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  return {
    device, postScopeId: owner, viewId: "main", frameIndex: index, timeSeconds: 0, width, height, rasterViewportIsFull: true,
    camera: { ...camera, viewMatrix: camera.viewMatrix, projectionMatrix: camera.projectionMatrix,
      viewProjectionMatrix: camera.viewProjectionMatrix, position: [0, 3, 8], near: 0.1, far: 50, projection: "perspective" },
    source: { renderItems: [item], collectedLights: [collectLight(sun)], shadow: { prd02Contact: { intensity: 0.7 } } },
    items: [item], tier: QUALITY_TIERS.high,
    flags: createTrustedQrFlags({ A3D_QR_LIGHTING: true }),
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 50, orthographic: false } },
    blackboard: new Map()
  } as unknown as FrameContributorContext;
}

function scope(context: FrameContributorContext) {
  return { device: context.device, width: context.width, height: context.height, frame: context };
}

describe("native WebGPU contact shadow producer", () => {
  it("binds a produced mask to the casting light at clustered index 16", async () => {
    const f = await fixture();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: true }), f.device);
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = frame(f.device, 1);
    const source = ctx.source as { collectedLights: ReturnType<typeof collectLight>[] };
    const sun = source.collectedLights[0]!;
    const others = Array.from({ length: 16 }, (_, index) => {
      const light = new DirectionalLight(`unshadowed-${index}`); light.castsShadow = false;
      light.transform.updateWorld(undefined, true); return collectLight(light);
    });
    source.collectedLights.splice(0, source.collectedLights.length, ...others, sun);
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const target = f.device.createRenderTarget({ width: 32, height: 24, depth: "texture" });
    try {
      f.device.beginFrame(32, 24);
      contributor.passes!("shadows", ctx)[0]!.execute({ device: f.device, width: 32, height: 24 });
      const mask = resolveContactShadowMask(scope(ctx))!;
      expect(mask.sourceLight).toBe(sun.source);
      f.device.setRenderTarget(target);
      new ForwardPass({ items: [{ label: "cluster-contact-receiver", geometry, material }], lights: source.collectedLights,
        frameContext: ctx, cameraPosition: ctx.camera!.position, cameraViewProjectionMatrix: ctx.camera!.viewProjectionMatrix })
        .execute({ device: f.device, width: 32, height: 24 });
      const packed = f.writes.find(write => write.label === "cluster-contact-receiver-generated-pbr-material")!.bytes;
      const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
      const offset = GENERATED_PBR_MATERIAL_OFFSETS.contactShadow!;
      expect(view.getFloat32(offset + 12, true)).toBe(16);
      expect(f.groups.some(group => group.entries.some(entry => (entry.resource as { texture?: unknown }).texture === f.device.getNativeTexture(mask.texture)))).toBe(true);
      expect(f.native.queue.submit.mock.calls.flatMap(call => call[0]).some(command => command.label.includes("cluster-contact-receiver-encoder"))).toBe(true);
      f.device.endFrame();
    } finally { contributor.dispose?.(); target.dispose(); geometry.dispose(); material.dispose();
      ctx.items[0]!.geometry.dispose(); (ctx.items[0]!.material as UnlitMaterial).dispose(); f.device.dispose(); }
  });

  it("feeds its actual scoped mask into the generated native forward receiver", async () => {
    const f = await fixture();
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_LIGHTING"]);
    setRendererQrFlags(createTrustedQrFlags(Object.fromEntries([...enabled].map(name => [name, true]))), f.device);
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = frame(f.device, 1);
    const source = ctx.source as { collectedLights: ReturnType<typeof collectLight>[] };
    const second = new DirectionalLight("second-sun"); second.castsShadow = true;
    second.transform.setPosition(2, 4, 2); second.transform.updateWorld(undefined, true);
    source.collectedLights.push(collectLight(second));
    const receiverTarget = f.device.createRenderTarget({ width: 32, height: 24, depth: "texture", label: "forward-receiver" });
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    f.device.beginFrame(32, 24);
    contributor.passes!("shadows", ctx)[0]!.execute({ device: f.device, width: 32, height: 24 });
    const mask = resolveContactShadowMask(scope(ctx))!;
    expect(mask.sourceLight).toBe(source.collectedLights[0]!.source);
    f.device.setRenderTarget(receiverTarget);
    new ForwardPass({ items: [{ label: "receiver", geometry, material }], lights: [...source.collectedLights].reverse(),
      cameraViewProjectionMatrix: ctx.camera!.viewProjectionMatrix, frameContext: ctx,
      cameraPosition: [0, 3, 8] }).execute({ device: f.device, width: 32, height: 24 });
    expect(f.native.queue.submit.mock.calls.flatMap(call => call[0]).some(command => command.label.includes("receiver-encoder"))).toBe(true);
    const contactGroup = f.groups.find(group => group.entries.some(entry => entry.binding === 64));
    expect(contactGroup?.entries.some(entry => entry.binding === 63)).toBe(true);
    expect((contactGroup?.entries.find(entry => entry.binding === 64)?.resource as { texture?: unknown }).texture)
      .toBe(f.device.getNativeTexture(mask.texture));
    const packed = f.writes.find(write => write.label === "receiver-generated-pbr-material")!.bytes;
    const contactUniform = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    const offset = GENERATED_PBR_MATERIAL_OFFSETS.contactShadow!;
    expect(contactUniform.getFloat32(offset, true)).toBeCloseTo(0.7);
    expect(contactUniform.getFloat32(offset + 12, true)).toBe(1);
    expect(f.modules.some(module => module.code.includes("f32(index) == material.contactShadow.w") &&
      module.code.includes("textureSampleLevel(u_contactShadowMaskTexture"))).toBe(true);
    f.device.endFrame(); contributor.dispose?.(); geometry.dispose(); material.dispose(); f.device.dispose();
  });

  it("submits checked self-depth and the paired WGSL mask before publishing a scoped texture", async () => {
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = frame(f.device, 1);
    const pass = contributor.passes!("shadows", ctx)[0]!;
    expect(pass.writes).toContain("prd02.contactShadowMask");
    f.device.beginFrame(ctx.width, ctx.height);
    pass.execute({ device: f.device, width: ctx.width, height: ctx.height });
    const commands = f.native.queue.submit.mock.calls.flatMap(call => call[0]);
    expect(commands.map(command => command.label)).toContain("caster:0-encoder");
    expect(commands.some(command => command.label.includes("prd02-contact-shadow-mask-encoder"))).toBe(true);
    const mask = resolveContactShadowMask(scope(ctx));
    expect(mask?.texture).toBe(ctx.blackboard.get("prd02.contactShadowMask"));
    expect(mask).toMatchObject({ width: 32, height: 24, strength: 0.7 });
    expect(mask!.texture.width).toBe(16);
    expect(f.layouts.flatMap(layout => layout.entries).some(entry => entry.texture?.sampleType === "depth")).toBe(true);
    const sourceDepth = f.textures.find(texture => texture.descriptor.label === "a3d.prd02.contactDepth-depth")!;
    expect(f.groups.some(group => group.entries.some(entry =>
      (entry.resource as { texture?: unknown }).texture === sourceDepth &&
      (entry.resource as { view?: unknown }).view !== undefined))).toBe(true);
    const fragment = f.modules.find(module => module.label?.includes("a3d_prd02_contact_mask-fragment"))?.code;
    expect(fragment).toContain("var u_prd02ContactDepthTexture: texture_depth_2d");
    expect(fragment).toContain("textureLoad(u_prd02ContactDepthTexture, pixel, 0)");
    expect(fragment).toContain("1.0 - uv.y * 2.0");
    expect(fragment).toContain("0.5 - ndc.y * 0.5");
    expect(fragment).not.toContain("@aura3d-bindings");
    expect(CONTACT_MASK_SHADER_SOURCES.fragment).toContain("behind > thickness && behind < len * 2.0");
    f.device.endFrame();
    contributor.dispose?.();
    expect(resolveContactShadowMask(scope(ctx))).toBeUndefined();
    f.device.dispose();
  });

  it("revokes prior publication and stops consumers on depth or mask submission failure, then retries", async () => {
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    f.device.beginFrame(32, 24);
    const previousTarget = f.device.createRenderTarget({ width: 32, height: 24, label: "previous" });
    f.device.setRenderTarget(previousTarget);
    const initial = frame(f.device, 1);
    contributor.passes!("shadows", initial)[0]!.execute({ device: f.device, width: 32, height: 24 });
    expect(resolveContactShadowMask(scope(initial))).toBeDefined();
    for (const label of ["caster:0-encoder", "prd02-contact-shadow-mask-encoder"]) {
      const ctx = frame(f.device, label.startsWith("caster") ? 2 : 3);
      ctx.blackboard.set("prd02.contactShadowMask", initial.blackboard.get("prd02.contactShadowMask"));
      const graph = new RenderGraph();
      graph.addPass(contributor.passes!("shadows", ctx)[0]!);
      const consumer = vi.fn();
      class Consumer extends BaseRenderPass {
        constructor() { super("contact-consumer", ["prd02.contactShadowMask"], ["result"]); }
        execute(): void { consumer(); }
      }
      graph.addPass(new Consumer());
      f.fail(label);
      expect(() => graph.execute({ device: f.device, width: 32, height: 24 })).toThrow("injected contact submission failure");
      expect(f.device.getRenderTarget()).toBe(previousTarget);
      expect(ctx.blackboard.has("prd02.contactShadowMask")).toBe(false);
      expect(contactShadowMask(f.device)).toBeUndefined();
      expect(resolveContactShadowMask(scope(initial))).toBeUndefined();
      expect(consumer).not.toHaveBeenCalled();
      graph.execute({ device: f.device, width: 32, height: 24 });
      expect(consumer).toHaveBeenCalledOnce();
      expect(resolveContactShadowMask(scope(ctx))).toBeDefined();
    }
    f.device.endFrame(); contributor.dispose?.(); f.device.dispose();
  });

  it("invalidates old frames on resize and releases the publication on device loss", async () => {
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    f.device.beginFrame(32, 24);
    const first = frame(f.device, 1);
    contributor.passes!("shadows", first)[0]!.execute({ device: f.device, width: 32, height: 24 });
    const oldTexture = resolveContactShadowMask(scope(first))!.texture;
    const second = frame(f.device, 2, 40, 20);
    contributor.passes!("shadows", second)[0]!.execute({ device: f.device, width: 40, height: 20 });
    expect(oldTexture.disposed).toBe(true);
    expect(resolveContactShadowMask(scope(first))).toBeUndefined();
    expect(resolveContactShadowMask(scope(second))?.texture.width).toBe(20);
    f.lose({ message: "device lost" });
    await Promise.resolve(); await Promise.resolve();
    expect(resolveContactShadowMask(scope(second))).toBeUndefined();
    expect(contactShadowMask(f.device)).toBeUndefined();
    expect(prd02ContactShadowDiagnostics().contactShadows).toMatchObject({ passExecuted: false, unavailable: "device-unavailable" });
    contributor.dispose?.(); f.device.dispose();
  });

  it("revokes a resized frame when allocation fails while retaining resources for retry", async () => {
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    f.device.beginFrame(32, 24);
    const first = frame(f.device, 1);
    contributor.passes!("shadows", first)[0]!.execute({ device: f.device, width: 32, height: 24 });
    const oldTexture = resolveContactShadowMask(scope(first))!.texture;
    const resized = frame(f.device, 2, 40, 20);
    const pass = contributor.passes!("shadows", resized)[0]!;
    const create = vi.spyOn(f.device, "createRenderTarget").mockImplementationOnce(() => { throw new Error("allocation failed"); });
    expect(() => pass.execute({ device: f.device, width: 40, height: 20 })).toThrow("allocation failed");
    expect(resolveContactShadowMask(scope(first))).toBeUndefined();
    expect(resized.blackboard.has("prd02.contactShadowMask")).toBe(false);
    expect(oldTexture.disposed).toBe(false);
    create.mockRestore();
    pass.execute({ device: f.device, width: 40, height: 20 });
    expect(oldTexture.disposed).toBe(true);
    expect(resolveContactShadowMask(scope(resized))).toBeDefined();
    f.device.endFrame(); contributor.dispose?.(); f.device.dispose();
  });

  it("requires checked submission and rejects unsupported depth conventions before drawing", async () => {
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    f.device.beginFrame(32, 24);
    const ctx = frame(f.device, 1);
    const pass = contributor.passes!("shadows", ctx)[0]!;
    Object.defineProperty(f.device, "drawChecked", { configurable: true, value: undefined });
    expect(() => pass.execute({ device: f.device, width: 32, height: 24 })).toThrow(/checked draw submission/i);
    expect(resolveContactShadowMask(scope(ctx))).toBeUndefined();
    expect(ctx.blackboard.has("prd02.contactShadowMask")).toBe(false);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    delete (f.device as unknown as { drawChecked?: unknown }).drawChecked;
    const reversed = { ...ctx, camera: { ...ctx.camera!, depth: { requestedMode: "reversed", mode: "reversed", clipRange: "minus-one-to-one", clearValue: 0, compare: "greater-equal", biasSign: -1 } } } as FrameContributorContext;
    expect(() => contributor.passes!("shadows", reversed)[0]!.execute({ device: f.device, width: 32, height: 24 })).toThrow(/standard depth/i);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    pass.execute({ device: f.device, width: 32, height: 24 });
    expect(resolveContactShadowMask(scope(ctx))).toBeDefined();
    f.device.endFrame(); contributor.dispose?.(); f.device.dispose();
  });

  it("reports a mask that becomes invalid between submission and publication and can retry", async () => {
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = frame(f.device, 1);
    const pass = contributor.passes!("shadows", ctx)[0]!;
    f.device.beginFrame(32, 24);
    const original = f.device.drawChecked.bind(f.device);
    const checked = vi.spyOn(f.device, "drawChecked").mockImplementation(command => {
      original(command);
      if (command.label === "prd02-contact-shadow-mask") f.device.getRenderTarget()!.dispose();
    });
    expect(() => pass.execute({ device: f.device, width: 32, height: 24 })).toThrow(/could not be published/i);
    expect(resolveContactShadowMask(scope(ctx))).toBeUndefined();
    expect(ctx.blackboard.has("prd02.contactShadowMask")).toBe(false);
    checked.mockRestore();
    pass.execute({ device: f.device, width: 32, height: 24 });
    expect(resolveContactShadowMask(scope(ctx))).toBeDefined();
    f.device.endFrame(); contributor.dispose?.(); f.device.dispose();
  });
});

describe("contact-aware renderer program warmup", () => {
  it.each(["sync", "async"] as const)("warms contact variants only for requested casting-sun frames on the %s path", async mode => {
    for (const [requested, castingSun] of [[true, true], [false, true], [true, false]] as const) {
      const device = new MockRenderDevice();
      const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: true });
      const renderer = new Renderer(device, { backend: "mock", width: 32, height: 24, qrFlags: flags as never,
        shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
      const geometry = Geometry.litCube(1), material = new PBRMaterial();
      const sun = new DirectionalLight("warmup-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
      const create = vi.spyOn(device, "createShaderProgram");
      const args = [[{ geometry, material }], castingSun ? [collectLight(sun)] : [], undefined, undefined, undefined, undefined,
        requested ? { prd02Contact: {} } : undefined] as const;
      const methods = renderer as unknown as {
        warmGeneratedProgramsSync(...input: readonly unknown[]): void;
        warmGeneratedPrograms(...input: readonly unknown[]): Promise<void>;
      };
      if (mode === "sync") methods.warmGeneratedProgramsSync(...args);
      else await methods.warmGeneratedPrograms(...args);
      const contactBits = create.mock.calls.map(([source]) => source.generatedProgram?.features.shadows.contact)
        .filter((value): value is boolean => value !== undefined);
      expect(contactBits.length).toBeGreaterThan(0);
      expect(contactBits).toContain(false);
      expect(contactBits.includes(true)).toBe(requested && castingSun);
      renderer.dispose(); geometry.dispose(); material.dispose();
    }
  });
});

describe("public renderer contact route", () => {
  it.each([false, true])("keeps the contact mask when other contributors add passes, strict or not (async=%s)", async asynchronous => {
    const f = await fixture();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: true, A3D_QR_STRICT: true, A3D_QR_CORE_OUTPUT: false });
    const renderer = new Renderer(f.device, { backend: "webgpu", width: 32, height: 24, canvas: f.canvas, qrFlags: flags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const contributor = createPrd02ContactShadowsContributor();
    const unregisterContact = registerFrameContributor(contributor);
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
    const sun = new DirectionalLight("keep-mask-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
    const source = { renderItems: [{ geometry, material }], collectedLights: [collectLight(sun)], shadow: { enabled: false, prd02Contact: {} } };
    const order: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unregisterOther = registerFrameContributor({
      id: "prd02.test-extra-contact-pass", owner: "prd02", flag: "A3D_QR_LIGHTING", phases: ["shadows", "background", "after-opaque"],
      passes: (phase: string) => [new class extends BaseRenderPass { constructor() { super(`extra-${phase}`); } execute() { order.push(`extra-${phase}`); } }()]
    });
    try {
      if (asynchronous) await renderer.renderAsync(source as never, camera as never);
      else renderer.render(source as never, camera as never);
      expect(order).toEqual(expect.arrayContaining(["extra-shadows", "extra-after-opaque"]));
      expect(contactShadowMask(f.device)).toBeDefined();
      expect(warn.mock.calls.some(call => String(call[0]).includes("CONTACT_SHADOW_DEGRADED"))).toBe(false);
      // Contributor passes that run before the producer cannot interleave between its depth draw and the receiver.
      const labels = f.native.queue.submit.mock.calls.flatMap(call => call[0]).map(command => command.label);
      expect(labels.some(label => label.includes("prd02-contact-shadow-mask-encoder"))).toBe(true);
    } finally { warn.mockRestore(); unregisterOther(); unregisterContact(); contributor.dispose?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([[false, true], [true, true], [false, false]] as const)("an unattested producer of the contact mask is rejected in strict mode and degrades otherwise (async=%s, strict=%s)", async (asynchronous, strict) => {
    const f = await fixture();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: true, ...(strict ? { A3D_QR_STRICT: true } : {}), A3D_QR_CORE_OUTPUT: false });
    const renderer = new Renderer(f.device, { backend: "webgpu", width: 32, height: 24, canvas: f.canvas, qrFlags: flags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
    const sun = new DirectionalLight("foreign-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
    const source = { renderItems: [{ geometry, material }], collectedLights: [collectLight(sun)], shadow: { enabled: false } };
    let ran = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unregisterForeign = registerFrameContributor({
      id: "prd02.test-foreign-mask", owner: "prd02", flag: "A3D_QR_LIGHTING", phases: ["shadows"],
      passes: () => [new class extends BaseRenderPass { constructor() { super("foreign-mask-writer", [], ["prd02.contactShadowMask"]); } execute() { ran = true; } }()]
    });
    try {
      if (strict) {
        if (asynchronous) await expect(renderer.renderAsync(source as never, camera as never)).rejects.toThrow(/verified graph passes/);
        else expect(() => renderer.render(source as never, camera as never)).toThrow(/verified graph passes/);
      } else {
        if (asynchronous) await renderer.renderAsync(source as never, camera as never);
        else renderer.render(source as never, camera as never);
        expect(ran).toBe(true);
        expect(contactShadowMask(f.device)).toBeUndefined();
      }
    } finally { warn.mockRestore(); unregisterForeign(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([
    [false, "shadows"], [true, "shadows"],
    [false, "after-opaque"], [true, "after-opaque"], [false, "transparent"], [true, "transparent"]
  ] as const)("contributor mutation in %s=%s is ordered outside the producer-to-receiver interval", async (asynchronous, phase) => {
    const f = await fixture();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: true, A3D_QR_STRICT: true, A3D_QR_CORE_OUTPUT: false });
    const renderer = new Renderer(f.device, { backend: "webgpu", width: 32, height: 24, canvas: f.canvas, qrFlags: flags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const contributor = createPrd02ContactShadowsContributor();
    const unregisterContact = registerFrameContributor(contributor);
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    let invoked = false;
    const mutate = () => { invoked = true; material.setParameter("u_alphaCutoff", 0.5); };
    const adversary = {
      id: "prd02.test-contact-mutation", owner: "prd02", flag: "A3D_QR_LIGHTING", phases: [phase],
      ...(phase === "transparent" ? { transparentItems: () => [{ sortDepth: 0, draw: mutate }] } : {
        passes: () => [new class extends BaseRenderPass {
          constructor() { super(`test-contact-${phase}`, [], []); }
          execute() { mutate(); }
        }()]
      })
    } as const;
    const unregisterMutation = registerFrameContributor(adversary);
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
    const sun = new DirectionalLight("mutation-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
    const source = { renderItems: [{ geometry, material }], collectedLights: [collectLight(sun)], shadow: { enabled: false, prd02Contact: {} } };
    try {
      if (phase === "shadows") {
        // The mutation now lands before the producer draws its depth, so the producer validates the mutated material.
        if (asynchronous) await expect(renderer.renderAsync(source as never, camera as never)).rejects.toThrow(/alpha-tested coverage/);
        else expect(() => renderer.render(source as never, camera as never)).toThrow(/alpha-tested coverage/);
        expect(invoked).toBe(true);
      } else {
        if (asynchronous) await renderer.renderAsync(source as never, camera as never);
        else renderer.render(source as never, camera as never);
        expect(invoked).toBe(true);
        expect(contactShadowMask(f.device)).toBeDefined();
      }
    } finally { unregisterMutation(); unregisterContact(); contributor.dispose?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([[false, false], [true, false], [false, true], [true, true]] as const)("submits the produced mask and receiver in order (async=%s, hdr=%s)", async (asynchronous, hdr) => {
    const f = await fixture();
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_LIGHTING", ...(hdr ? ["A3D_QR_CORE_OUTPUT"] : [])]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map(name => [name, true])), ...(hdr ? {} : { A3D_QR_CORE_OUTPUT: false }) });
    const renderer = new Renderer(f.device, { backend: "webgpu", width: 32, height: 24, canvas: f.canvas,
      qrFlags: flags as never, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const contributor = createPrd02ContactShadowsContributor();
    const unregister = registerFrameContributor(contributor);
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
    const sun = new DirectionalLight("public-sun"); sun.castsShadow = true;
    sun.transform.setPosition(2, 4, 2); sun.transform.updateWorld(undefined, true);
    const source = { renderItems: [{ label: "public-receiver", geometry, material }], collectedLights: [collectLight(sun)],
      shadow: { enabled: false, prd02Contact: { intensity: 0.7 } } };
    try {
      if (asynchronous) await renderer.renderAsync(source as never, camera as never);
      else renderer.render(source as never, camera as never);
      const labels = f.native.queue.submit.mock.calls.flatMap(call => call[0]).map(command => command.label);
      const mask = labels.findIndex(label => label.includes("prd02-contact-shadow-mask-encoder"));
      const receiver = labels.findIndex(label => label.includes("public-receiver-encoder"));
      expect(mask).toBeGreaterThanOrEqual(0);
      expect(receiver).toBeGreaterThan(mask);
      expect(f.groups.some(group => group.entries.some(entry => entry.binding === 64))).toBe(true);
    } finally { unregister(); contributor.dispose?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([[false, "viewport"], [true, "viewport"], [false, "scale"], [true, "scale"]] as const)(
    "rejects unsupported output before submitting a mask (async=%s, reason=%s)", async (asynchronous, reason) => {
      const f = await fixture();
      const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_LIGHTING", ...(reason === "scale" ? ["A3D_QR_CORE_OUTPUT"] : [])]);
      const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map(name => [name, true])), ...(reason === "scale" ? {} : { A3D_QR_CORE_OUTPUT: false }) });
      const renderer = new Renderer(f.device, { backend: "webgpu", width: 32, height: 24, canvas: f.canvas,
        qrFlags: flags as never, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
      if (reason === "scale") renderer.setRenderScaleCeiling(0.5);
      const contributor = createPrd02ContactShadowsContributor();
      const unregister = registerFrameContributor(contributor);
      const geometry = Geometry.litCube(1), material = new PBRMaterial();
      const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
      camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
      const sun = new DirectionalLight("public-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
      const source = { renderItems: [{ label: "public-receiver", geometry, material }], collectedLights: [collectLight(sun)],
        shadow: { enabled: false, prd02Contact: {} } };
      const input = { source, camera, ...(reason === "viewport" ? { viewport: { x: 0, y: 0, width: 16, height: 24 } } : {}) };
      try {
        if (asynchronous) await expect(renderer.renderAsync(input as never)).rejects.toThrow(/verified full raster viewport/i);
        else expect(() => renderer.render(input as never)).toThrow(/verified full raster viewport/i);
        const labels = f.native.queue.submit.mock.calls.flatMap(call => call[0]).map(command => command.label);
        expect(labels.some(label => label.includes("prd02-contact-shadow-mask-encoder"))).toBe(false);
      } finally { unregister(); contributor.dispose?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
    }
  );

  it.each([false, true])("uses the final temporal raster matrix on the renderer route (async=%s)", async asynchronous => {
    const f = await fixture();
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_LIGHTING", "A3D_QR_POST"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map(name => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const history = new TemporalHistory();
    let raster: Float32Array | undefined;
    vi.spyOn(history, "prepare").mockImplementation((_device, _width, _height, items, viewProjection) => {
      raster = new Float32Array(viewProjection!); raster[8] = raster[8]! + 0.025;
      return { renderItems: items, historyValid: false,
        velocity: { disposed: false, width: 32, height: 24 },
        history: { disposed: false, width: 32, height: 24 },
        historyOutput: { disposed: false, width: 32, height: 24 },
        v2: { jittered: raster, previous: null, motionSource: "test", unsupportedMotion: [], coverage: {} } } as never;
    });
    const renderer = new Renderer(f.device, { backend: "webgpu", width: 32, height: 24, canvas: f.canvas,
      qrFlags: flags as never, shaderLibrary: createDefaultShaderLibrary() }, history);
    const post = renderer as unknown as { executePostprocess(...args: unknown[]): void; executePostprocessAsync(...args: unknown[]): Promise<void> };
    vi.spyOn(post, "executePostprocess").mockImplementation(() => undefined);
    vi.spyOn(post, "executePostprocessAsync").mockImplementation(async () => undefined);
    const checked = vi.spyOn(f.device, "drawChecked");
    const contributor = createPrd02ContactShadowsContributor();
    const unregister = registerFrameContributor(contributor);
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
    const sun = new DirectionalLight("temporal-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
    const source = { renderItems: [{ label: "temporal-receiver", geometry, material }], collectedLights: [collectLight(sun)],
      shadow: { enabled: false, prd02Contact: {} },
      postprocess: { execution: "auto", sampleCount: 1, temporal: { sceneKey: "contact" }, taa: { blend: 0.9 } } };
    try {
      if (asynchronous) await renderer.renderAsync(source as never, camera as never);
      else renderer.render(source as never, camera as never);
      const mask = checked.mock.calls.map(call => call[0]).find(command => command.label === "prd02-contact-shadow-mask")!;
      expect(raster).toBeDefined();
      expect(Array.from(mask.uniforms!.get("u_prd02ContactViewProj") as readonly number[])).toEqual(Array.from(raster!));
      expect(f.groups.some(group => group.entries.some(entry => entry.binding === 64))).toBe(true);
    } finally { unregister(); contributor.dispose?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});

describe("graph contact producer integration", () => {
  it("withholds the real mask when an opaque graph participant cannot yet be certified", async () => {
    const { createCustomShaderMaterial } = await import("../../../packages/engine/src/agent-api/compiler/customMaterial");
    const { shaderGraph } = await import("../../../packages/engine/src/agent-api/nodes/shaderGraph");
    const f = await fixture();
    const contributor = createPrd02ContactShadowsContributor();
    const base = frame(f.device, 1);
    const graph = { version: 1 as const, stage: "material" as const, nodes: [
      { id: "rough", op: "constant" as const, type: "f32" as const, value: 0.5 }
    ], outputs: { roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1);
    const receiver = { label: "graph-contact-occluder", geometry, material, receiveShadow: false };
    const ctx = { ...base, items: [base.items[0]!, receiver], flags: createTrustedQrFlags({ A3D_QR_LIGHTING: true, A3D_QR_STRICT: true }) };
    try {
      f.device.beginFrame(32, 24);
      const submissions = f.native.queue.submit.mock.calls.length;
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device: f.device, width: 32, height: 24 })).toThrow(/unverified custom or graph material/);
      expect(f.native.queue.submit.mock.calls).toHaveLength(submissions);
      expect(contactShadowMask(f.device)).toBeUndefined();
      expect(ctx.blackboard.has("prd02.contactShadowMask")).toBe(false);
      f.device.endFrame();
      // Non-strict (the default): a pristine graph that does not move vertices is drawn by the position-only mask depth
      // (lane 511 contact participants), so the mount keeps its contact shadow and no CONTACT_SHADOW_PARTIAL is logged.
      const lenient = { ...ctx, flags: createTrustedQrFlags({ A3D_QR_LIGHTING: true }) };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        f.device.beginFrame(32, 24);
        const lenientSubmissions = f.native.queue.submit.mock.calls.length;
        expect(() => contributor.passes!("shadows", lenient)[0]!.execute({ device: f.device, width: 32, height: 24 })).not.toThrow();
        expect(f.native.queue.submit.mock.calls.length).toBeGreaterThan(lenientSubmissions);
        expect(contactShadowMask(f.device)).toBeDefined();
        expect(warn.mock.calls.some(call => String(call[0]).includes("CONTACT_SHADOW_PARTIAL"))).toBe(false);
        f.device.endFrame();
      } finally { warn.mockRestore(); }
    } finally {
      contributor.dispose?.(); geometry.dispose(); material.dispose();
      base.items[0]!.geometry.dispose(); (base.items[0]!.material as UnlitMaterial).dispose(); f.device.dispose();
    }
  });

});
