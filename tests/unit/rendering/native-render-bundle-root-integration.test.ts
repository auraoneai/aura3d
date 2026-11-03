import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { WebGPUDevice } from "../../../packages/rendering/src/WebGPUDevice";
import { GENERATED_UNLIT_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import type { PostViewHistory } from "../../../packages/rendering/src/post/PostGraph";
import type { WebGPUDeviceLike, WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";

type Buffer = { label: string; bytes: Uint8Array; destroy: ReturnType<typeof vi.fn> };
type Group = { label?: string; entries: readonly { binding: number; resource: { buffer?: Buffer; texture?: object } }[] };
type Op = { name: string; args: readonly unknown[] };
type Bundle = { operations: readonly Op[] };
type Draw = { label: string; indexed: boolean; group?: Group; vertex?: Buffer; count: number; mode: "direct" | "bundle" };

/** A queue-shaped mock: it snapshots buffer contents when a command is submitted. */
function nativeFixture() {
  const events: string[] = [];
  const draws: { label: string; indexed: boolean; count: number; mode: string; color: number[]; vertex0: number | undefined }[] = [];
  const buffers: Buffer[] = [];
  const descriptors: unknown[] = [];
  const afterimageHistory: number[] = [];
  const postPasses: string[] = [];
  let validation = () => Promise.resolve(null as unknown | null);
  let resolveFence: () => void = () => {};
  let fence: Promise<void> = Promise.resolve();
  let lose!: (info: { reason: string }) => void;
  const lost = new Promise<{ reason: string }>(resolve => { lose = resolve; });
  let onSubmit: (() => void) | undefined;
  let throwAfterSubmit = false;
  let throwExecute = false;
  let bundlePass = true;
  let failedPostPass: string | undefined;
  const native = {
    lost,
    features: new Set<string>(),
    limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: Buffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        buffer.bytes.set(bytes, offset);
      },
      writeTexture() {},
      submit(commands: readonly { draws: readonly Draw[] }[]) {
        for (const command of commands) for (const draw of command.draws) {
          if (draw.label.startsWith("webgpu-")) {
            postPasses.push(draw.label);
            if (draw.label === "webgpu-native-effect-0-afterimage-pass") {
              const buffer = draw.group?.entries.find(entry => entry.binding === 4)?.resource.buffer;
              if (!buffer) throw new Error("missing afterimage uniforms");
              afterimageHistory.push(new DataView(buffer.bytes.buffer, buffer.bytes.byteOffset).getUint32(44, true));
            }
            continue;
          }
          const buffer = draw.group?.entries.find(entry => entry.binding === 0)?.resource.buffer;
          if (!buffer) throw new Error("missing generated material buffer");
          const view = new DataView(buffer.bytes.buffer, buffer.bytes.byteOffset, buffer.bytes.byteLength);
          const offset = GENERATED_UNLIT_MATERIAL_OFFSETS.baseColor!;
          const vertex0 = draw.vertex ? new DataView(draw.vertex.bytes.buffer, draw.vertex.bytes.byteOffset).getFloat32(0, true) : undefined;
          draws.push({ ...draw, vertex0, color: [0, 1, 2, 3].map(index => view.getFloat32(offset + index * 4, true)) });
          events.push(`submit:${draw.label}:${draw.mode}`);
        }
        if (commands.length) {
          onSubmit?.();
          if (failedPostPass && commands.some(command => command.draws.some(draw => draw.label === failedPostPass))) {
            failedPostPass = undefined;
            throw new Error("injected post presentation failure");
          }
          if (throwAfterSubmit) throw new Error("queue accepted then failed");
        }
      },
      onSubmittedWorkDone: () => fence
    },
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(() => validation()),
    createRenderBundleEncoder: vi.fn((descriptor: unknown) => {
      descriptors.push(descriptor);
      const operations: Op[] = [];
      const push = (name: string, args: readonly unknown[]) => operations.push({ name, args });
      return {
        setPipeline: (...args: unknown[]) => push("setPipeline", args),
        setVertexBuffer: (...args: unknown[]) => push("setVertexBuffer", args),
        setIndexBuffer: (...args: unknown[]) => push("setIndexBuffer", args),
        setBindGroup: (...args: unknown[]) => push("setBindGroup", args),
        draw: (...args: unknown[]) => push("draw", args),
        drawIndexed: (...args: unknown[]) => push("drawIndexed", args),
        finish: () => ({ operations } satisfies Bundle)
      };
    }),
    createBuffer(descriptor: { label?: string; size: number }) {
      const bytes = new Uint8Array(descriptor.size);
      const buffer = { label: descriptor.label ?? "", bytes, destroy: vi.fn() };
      buffers.push(buffer);
      return buffer;
    },
    createTexture: () => {
      const handle = { createView: () => ({ texture: handle }), destroy() {} };
      return handle;
    },
    createSampler: () => ({}),
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup: (descriptor: Group) => descriptor,
    createCommandEncoder() {
      const recorded: Draw[] = [];
      return {
        copyTextureToBuffer() {},
        beginRenderPass(descriptor: { label?: string }) {
          let group: Group | undefined;
          let vertex: Buffer | undefined;
          let mode: "direct" | "bundle" = "direct";
          const pass = {
            setPipeline() {},
            setVertexBuffer(slot: number, buffer: Buffer) { if (slot === 0) vertex = buffer; },
            setIndexBuffer() {},
            setBindGroup(slot: number, value: Group) { if (slot === 0) group = value; },
            setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) { recorded.push({ label: descriptor.label ?? "", indexed: false, count, mode, group, vertex }); },
            drawIndexed(count: number) { recorded.push({ label: descriptor.label ?? "", indexed: true, count, mode, group, vertex }); },
            executeBundles(bundles: readonly Bundle[]) {
              mode = "bundle";
              for (const bundle of bundles) for (const op of bundle.operations) {
                const method = pass[op.name as keyof typeof pass] as (...args: never[]) => void;
                method.apply(pass, op.args as never[]);
              }
              mode = "direct";
              if (throwExecute) throw new Error("bundle execution failed");
            },
            end() {}
          };
          return bundlePass ? pass : { ...pass, executeBundles: undefined };
        },
        finish: () => ({ draws: recorded })
      };
    },
    destroy: vi.fn()
  };
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "bgra8unorm" } as unknown as WebGPULike;
  const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const canvas = { width: 8, height: 8, getContext: () => context } as unknown as HTMLCanvasElement;
  return {
    native, gpu, canvas, events, draws, buffers, descriptors, afterimageHistory, postPasses,
    setValidation(fn: () => Promise<unknown | null>) { validation = fn; },
    holdFence() { fence = new Promise<void>(resolve => { resolveFence = resolve; }); },
    releaseFence() { resolveFence(); },
    lose() { lose({ reason: "injected" }); },
    onSubmit(fn?: () => void) { onSubmit = fn; },
    throwAfterSubmit(value: boolean) { throwAfterSubmit = value; },
    throwExecute(value: boolean) { throwExecute = value; },
    failPostPass(label: string) { failedPostPass = label; },
    bundlePass(value: boolean) { bundlePass = value; }
  };
}

async function rendererFixture() {
  const fixture = nativeFixture();
  const renderer = await Renderer.create({
    backend: "webgpu", canvas: fixture.canvas, webgpu: fixture.gpu, width: 8, height: 8,
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false })
  });
  return { ...fixture, renderer };
}

async function afterimageRendererFixture() {
  const fixture = nativeFixture();
  const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_POST: true });
  const renderer = await Renderer.create({ backend: "webgpu", canvas: fixture.canvas, webgpu: fixture.gpu,
    width: 8, height: 8, qrFlags: flags });
  const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
    renderItems: [], postprocess: { v2: true, toneMapping: { operator: "linear" as const },
      pipeline: { nativeEffects: [{ kind: "afterimage" as const, decay: 0.8 }] } } };
  return { ...fixture, renderer, source, flags, device: renderer.device as WebGPUDevice };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("native bundles through the public Renderer frame", () => {
  it("rejects raw generated WGSL without GLSL reflection instead of silently using passthrough bindings", async () => {
    const f = await rendererFixture();
    const generated = generateProgramImpl(normalizeProgramFeatures({ target: "wgsl", lighting: "unlit" }));
    const createModule = vi.spyOn(f.native, "createShaderModule");
    try {
      expect(() => f.renderer.device.createShaderProgram({
        label: "raw-generated", marker: GENERATED_PROGRAM_MARKER,
        vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor
      })).toThrow(/matching GLSL reflection.*ProgramCache/);
      expect(createModule).not.toHaveBeenCalled();
      // The descriptor plus real GLSL reflection remains a native generated
      // program; it must expose the attributes and uniforms used by draws.
      const reflection = generateProgramImpl({ ...generated.descriptor!.features, target: "glsl300es" });
      const shader = f.renderer.device.createShaderProgram({
        label: "generated-with-reflection", marker: GENERATED_PROGRAM_MARKER,
        vertex: reflection.vertex, fragment: reflection.fragment, generatedProgram: generated.descriptor
      });
      expect(shader.reflection.attributes.get("a_position")).toBe(0);
      expect(shader.reflection.uniforms.has("u_baseColor")).toBe(true);
      expect((shader as unknown as { nativeUniformLayout: string }).nativeUniformLayout).toBe("generated-program-unlit");
      shader.dispose();
    } finally { createModule.mockRestore(); f.renderer.dispose(); }
  });

  it("captures immutable per-draw uniforms, invalidates changed values, and preserves submission order", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    let frame = 0;
    const source = {
      cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [
        { label: "second", geometry, material, renderOrder: 2, onBeforeRender: () => {
          f.events.push("before:second"); material.color = frame ? [0, .5, 0, 1] : [0, 1, 0, 1];
        } },
        { label: "first", geometry, material, renderOrder: 1, onBeforeRender: () => {
          f.events.push("before:first"); material.color = frame ? [.25, 0, 0, 1] : [1, 0, 0, 1];
        } }
      ]
    };
    try {
      f.renderer.render(source);
      expect(f.draws.map(draw => draw.mode)).toEqual(["direct", "direct"]);
      await settle();
      frame = 1;
      f.renderer.render(source);
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalled();
      expect(f.draws.slice(2).map(draw => draw.mode)).toEqual(["direct", "direct"]);
      const firstMaterial = f.buffers.find(buffer => buffer.label === "first-generated-unlit-material")!;
      expect(new DataView(firstMaterial.bytes.buffer).getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.baseColor!, true)).toBe(1);
      await settle();
      f.renderer.render(source);
      expect(f.draws.slice(4).map(draw => draw.mode)).toEqual(["bundle", "bundle"]);
      expect(f.draws.map(draw => draw.color)).toEqual([[1, 0, 0, 1], [0, 1, 0, 1], [.25, 0, 0, 1], [0, .5, 0, 1], [.25, 0, 0, 1], [0, .5, 0, 1]]);
      expect(f.draws.every(draw => draw.indexed && draw.count === 3)).toBe(true);
      expect(f.events).toEqual([
        "before:first", "submit:first-pass:direct", "before:second", "submit:second-pass:direct",
        "before:first", "submit:first-pass:direct", "before:second", "submit:second-pass:direct",
        "before:first", "submit:first-pass:bundle", "before:second", "submit:second-pass:bundle"
      ]);
    } finally {
      f.renderer.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("uses direct draws during pending or failed validation without losing order or retrying the invalid bundle", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    let resolve!: (value: unknown | null) => void;
    f.setValidation(() => new Promise(value => { resolve = value; }));
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "only", geometry, material }] };
    try {
      f.renderer.render(source);
      f.renderer.render(source);
      expect(f.draws.map(draw => draw.mode)).toEqual(["direct", "direct"]);
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
      resolve({ message: "invalid" });
      await settle();
      f.renderer.render(source);
      expect(f.draws.map(draw => draw.mode)).toEqual(["direct", "direct", "direct"]);
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    } finally { f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("invalidates vertex writes before reusing a bundle and supports unindexed triangles", async () => {
    const f = await rendererFixture();
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [-.5, -.5, 0]);
    vertices.setAttribute(1, "position", [.5, -.5, 0]);
    vertices.setAttribute(2, "position", [0, .5, 0]);
    const geometry = new Geometry(vertices, null), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "triangle", geometry, material }] };
    try {
      f.renderer.render(source);
      await settle();
      vertices.setAttribute(0, "position", [-.25, -.5, 0]);
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      expect(f.draws.map(draw => [draw.indexed, draw.mode, draw.vertex0])).toEqual([
        [false, "direct", -.5], [false, "direct", -.25], [false, "bundle", -.25]
      ]);
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalledTimes(2);
    } finally { f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("uses the same device-owned bundle path through renderAsync", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "async", geometry, material }] };
    try {
      await f.renderer.renderAsync(source);
      await settle();
      await f.renderer.renderAsync(source);
      expect(f.draws.map(draw => draw.mode)).toEqual(["direct", "bundle"]);
    } finally { f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("does not capture transparent draws, while preserving their position after opaque bundles", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle();
    const opaque = new UnlitMaterial({ color: [1, 0, 0, 1] });
    const transparent = new UnlitMaterial({ color: [0, 1, 0, .5], renderState: { blendMode: "alpha" } });
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "translucent", geometry, material: transparent }, { label: "opaque", geometry, material: opaque }] };
    try {
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      expect(f.draws.map(draw => [draw.label, draw.mode])).toEqual([
        ["opaque-pass", "direct"], ["translucent-pass", "direct"],
        ["opaque-pass", "bundle"], ["translucent-pass", "direct"]
      ]);
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    } finally { f.renderer.dispose(); geometry.dispose(); opaque.dispose(); transparent.dispose(); }
  });

  it("keeps textured draws and mutable texture revisions on the direct path", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.box();
    const material = new UnlitMaterial();
    const texture = new Texture({ width: 1, height: 1, colorSpace: "srgb",
      data: new Uint8Array([128, 64, 32, 255]), generateMipmaps: false });
    material.setParameter("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture }));
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "textured", geometry, material }] };
    try {
      f.renderer.render(source);
      await settle();
      texture.needsUpdate = true;
      f.renderer.render(source);
      expect(f.draws.map(draw => draw.mode)).toEqual(["direct", "direct"]);
      expect(f.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    } finally { f.renderer.dispose(); geometry.dispose(); material.dispose(); texture.dispose(); }
  });

  it("falls back for lines and instanced draws without capturing per-frame instance buffers", async () => {
    const f = await rendererFixture();
    const line = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    const triangle = Geometry.triangle(), material = new UnlitMaterial();
    const transforms = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, .2, 0, 0, 1
    ]);
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "line", geometry: line, material }, { label: "instances", geometry: triangle, material, instanceTransforms: transforms }] };
    try {
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      expect(f.draws.map(draw => [draw.label, draw.mode])).toEqual([
        ["line-pass", "direct"], ["instances-pass", "direct"],
        ["line-pass", "direct"], ["instances-pass", "direct"]
      ]);
      expect(f.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    } finally { f.renderer.dispose(); line.dispose(); triangle.dispose(); material.dispose(); }
  });

  it("does not capture if the active pass cannot execute bundles", async () => {
    const f = await rendererFixture();
    f.bundlePass(false);
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "only", geometry, material }] };
    try {
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      expect(f.draws.map(draw => draw.mode)).toEqual(["direct", "direct"]);
      expect(f.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    } finally { f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("invalidates changed draw ranges and target attachment compatibility", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const item = { label: "only", geometry, material, drawRange: { start: 0, count: 3 } };
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false }, renderItems: [item] };
    const target = f.renderer.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: true, sampleCount: 4 });
    try {
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      expect(f.draws.at(-1)?.mode).toBe("bundle");
      item.drawRange = { start: 1, count: 2 };
      f.renderer.render(source);
      expect(f.draws.at(-1)).toMatchObject({ mode: "direct", count: 2 });
      await settle();
      f.renderer.render(source);
      expect(f.draws.at(-1)).toMatchObject({ mode: "bundle", count: 2 });
      f.renderer.render({ ...source, renderTarget: target });
      expect(f.draws.at(-1)?.mode).toBe("direct");
      await settle();
      f.renderer.render({ ...source, renderTarget: target });
      expect(f.draws.at(-1)?.mode).toBe("bundle");
      expect(f.descriptors).toContainEqual({ colorFormats: ["rgba16float"], depthStencilFormat: "depth24plus-stencil8", sampleCount: 4 });
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalledTimes(3);
    } finally { target.dispose(); f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("invalidates exposed native buffers rather than reusing an externally mutable binding", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "only", geometry, material }] };
    const device = f.renderer.device as import("../../../packages/rendering/src/WebGPUDevice").WebGPUDevice;
    const spy = vi.spyOn(device, "draw");
    try {
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      expect(f.draws.at(-1)?.mode).toBe("bundle");
      const command = spy.mock.calls[0]![0];
      device.getNativeBuffer(command.vertexBuffer);
      f.renderer.render(source);
      expect(f.draws.at(-1)?.mode).toBe("direct");
      expect(f.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("keeps cached buffers alive through disposal during queue submission until its fence", async () => {
    const f = await rendererFixture();
    f.holdFence();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "only", geometry, material }] };
    try {
      f.renderer.render(source);
      await settle();
      const uniform = f.buffers.find(buffer => buffer.label === "only-generated-unlit-material")!;
      expect(uniform).toBeDefined();
      f.onSubmit(() => {
        f.onSubmit();
        geometry.dispose();
        expect(uniform.destroy).not.toHaveBeenCalled();
      });
      f.renderer.render(source);
      expect(f.draws.at(-1)?.mode).toBe("bundle");
      expect(uniform.destroy).not.toHaveBeenCalled();
      f.releaseFence();
      await settle();
      expect(uniform.destroy).toHaveBeenCalledTimes(1);
    } finally { f.onSubmit(); f.releaseFence(); f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("does not replay an execution or queue failure that could already have affected work", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "only", geometry, material }] };
    try {
      f.renderer.render(source);
      await settle();
      f.throwExecute(true);
      expect(() => f.renderer.render(source)).toThrow("bundle execution failed");
      expect(f.draws).toHaveLength(1);
      f.throwExecute(false);
      f.throwAfterSubmit(true);
      expect(() => f.renderer.render(source)).toThrow("queue accepted then failed");
      expect(f.draws).toHaveLength(2);
    } finally { f.throwExecute(false); f.throwAfterSubmit(false); f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("clears native bundles and refuses further frames when the device is lost", async () => {
    const f = await rendererFixture();
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false },
      renderItems: [{ label: "only", geometry, material }] };
    try {
      f.renderer.render(source);
      await settle();
      f.renderer.render(source);
      const uniform = f.buffers.find(buffer => buffer.label === "only-generated-unlit-material")!;
      f.lose();
      await settle();
      expect(uniform.destroy).toHaveBeenCalledTimes(1);
      expect(() => f.renderer.render(source)).toThrow(/lost|unavailable/i);
      expect(f.draws).toHaveLength(2);
    } finally { f.renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});

describe("native afterimage authored-frame transactions", () => {
  it("retries failed view retirement when the owning scope is released", async () => {
    const f = await afterimageRendererFixture();
    const internals = f.device as unknown as {
      nativeEffectHistory: PostViewHistory<{ id: number }>;
      nativeEffectViews: Map<object, Set<string | number>>;
    };
    const scope = {}, attempts: number[] = [];
    let next = 0, fail = true;
    const release = (target: { id: number }) => {
      attempts.push(target.id);
      if (target.id === 0 && fail) { fail = false; throw new Error("retirement failed"); }
    };
    internals.nativeEffectViews.set(scope, new Set(["left"]));
    const lease = internals.nativeEffectHistory.begin({
      scopeId: scope, viewId: "left", effectIndex: 0, frameId: 1, width: 8, height: 8
    }, () => ({ id: next++ }), release);
    try {
      expect(() => f.device.releaseNativePostEffectView(scope, "left")).toThrow(/release native post view/i);
      expect(() => lease.commit()).toThrow(/stale/i);
      expect(internals.nativeEffectViews.get(scope)?.has("left")).toBe(true);
      f.device.releaseNativePostEffectScope(scope);
      expect(attempts).toEqual([0, 1, 0]);
      expect(internals.nativeEffectViews.has(scope)).toBe(false);
    } finally { f.renderer.dispose(); }
  });

  it.each([false, true])("does not expose a pending write and promotes only after explicit completion (async=%s)", async asynchronous => {
    const f = await afterimageRendererFixture();
    const foreignSource = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    const effect = [{ kind: "afterimage" as const, decay: .8 }];
    const render = async (frameId: number) => {
      if (asynchronous) await f.renderer.renderAsync({ source: f.source, frameId });
      else f.renderer.render({ source: f.source, frameId });
    };
    try {
      await render(1);
      expect(f.afterimageHistory).toEqual([0]);
      expect(() => f.device.executeWebGPUNativeEffects(foreignSource, effect,
        { scopeId: f.renderer.postScopeId(), viewId: "single", frameId: 2 })).toThrow(/another operation|busy/i);
      await render(1);
      expect(f.afterimageHistory).toEqual([0, 0]);
      expect(f.renderer.finishTemporalFrame(1)).toBe(true);
      await render(2);
      expect(f.afterimageHistory).toEqual([0, 0, 1]);
      expect(f.renderer.cancelTemporalFrame(2)).toBe(true);
      await render(3);
      expect(f.afterimageHistory).toEqual([0, 0, 1, 0]);
      expect(f.renderer.finishTemporalFrame(3)).toBe(true);
    } finally { foreignSource.dispose(); f.renderer.dispose(); }
  });

  it.each([false, true])("blocks reentrant same-scope calls and discards after-output and endFrame failures (async=%s)", async asynchronous => {
    const f = await afterimageRendererFixture();
    const foreignSource = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    const effect = [{ kind: "afterimage" as const, decay: .8 }];
    let failAfterOutput = false, blocked = 0;
    const unregister = registerFrameContributor({ id: "prd03.webgpu-afterimage-transaction", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "webgpu-afterimage-transaction", reads: [], writes: [], execute: () => {
          expect(() => f.device.executeWebGPUNativeEffects(foreignSource, effect,
            { scopeId: f.renderer.postScopeId(), viewId: "single", frameId: 999 })).toThrow(/another operation|busy/i);
          blocked++;
          if (failAfterOutput) throw new Error("injected after-output failure");
        }
      }] });
    const render = async () => {
      if (asynchronous) await f.renderer.renderAsync({ source: f.source });
      else f.renderer.render({ source: f.source });
    };
    try {
      await render();
      failAfterOutput = true;
      await expect(render()).rejects.toThrow("injected after-output failure");
      failAfterOutput = false;
      await render();
      expect(f.afterimageHistory).toEqual([0, 1, 0]);
      const end = f.device.endFrame.bind(f.device);
      vi.spyOn(f.device, "endFrame").mockImplementationOnce(() => { end(); throw new Error("injected endFrame failure"); });
      await expect(render()).rejects.toThrow("injected endFrame failure");
      await render();
      expect(f.afterimageHistory).toEqual([0, 1, 0, 1, 0]);
      expect(blocked).toBe(5);
    } finally { unregister(); foreignSource.dispose(); f.renderer.dispose(); }
  });

  it.each([false, true])("does not promote a write when the final presentation submission fails (async=%s)", async asynchronous => {
    const f = await afterimageRendererFixture();
    const render = async () => asynchronous ? f.renderer.renderAsync({ source: f.source }) : f.renderer.render({ source: f.source });
    try {
      await render();
      f.failPostPass("webgpu-post-present-pass");
      await expect(render()).rejects.toThrow("injected post presentation failure");
      await render();
      expect(f.afterimageHistory).toEqual([0, 1, 0]);
    } finally { f.renderer.dispose(); }
  });

  it("rejects forged renderer completion and cancels an asynchronously suspended after-output", async () => {
    const f = await afterimageRendererFixture();
    let enter!: () => void, resume!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const wait = new Promise<void>(resolve => { resume = resolve; });
    let pause = false;
    const unregister = registerFrameContributor({ id: "prd03.async-afterimage-cancel", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "async-afterimage-cancel", reads: [], writes: [], execute: () => {},
        executeAsync: async () => { if (pause) { enter(); await wait; } }
      }] });
    try {
      await f.renderer.renderAsync({ source: f.source });
      pause = true;
      const pending = f.renderer.renderAsync({ source: f.source, frameId: 7 });
      await entered;
      expect(f.afterimageHistory).toEqual([0, 1]);
      const scope = f.renderer.postScopeId();
      expect(() => f.device.finishNativePostAuthoredFrame(scope, 7, true)).toThrow(/renderer-owned|stale/i);
      expect(() => f.device.beginNativePostRendererPass(scope, 7, "single", {} as never)).toThrow(/stale|busy/i);
      expect(f.renderer.cancelTemporalFrame(7)).toBe(true);
      resume();
      await expect(pending).rejects.toThrow(/cancelled|stale/i);
      pause = false;
      await f.renderer.renderAsync({ source: f.source, frameId: 8 });
      expect(f.afterimageHistory).toEqual([0, 1, 0]);
      expect(f.renderer.finishTemporalFrame(8)).toBe(true);
    } finally { resume(); unregister(); f.renderer.dispose(); }
  });

  it("retires a disposed renderer's suspended post transaction without affecting another owner", async () => {
    const f = await afterimageRendererFixture();
    const shaderLibrary = (f.renderer as unknown as { shaderLibrary: ConstructorParameters<typeof Renderer>[1]["shaderLibrary"] }).shaderLibrary;
    const other = new Renderer(f.device, { width: 8, height: 8, shaderLibrary, qrFlags: f.flags }, new TemporalHistory());
    const internals = f.renderer as unknown as { executePostprocessAsync(...args: unknown[]): Promise<void> };
    const original = internals.executePostprocessAsync.bind(internals);
    let enter!: () => void, resume!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const wait = new Promise<void>(resolve => { resume = resolve; });
    try {
      await other.renderAsync({ source: f.source });
      vi.spyOn(internals, "executePostprocessAsync").mockImplementation(async (...args) => {
        await original(...args); enter(); await wait;
      });
      const pending = f.renderer.renderAsync({ source: f.source, frameId: 8 });
      await entered;
      f.renderer.dispose();
      resume();
      await expect(pending).rejects.toThrow(/cancelled|disposed|stale/i);
      await other.renderAsync({ source: f.source });
      expect(f.afterimageHistory).toEqual([0, 0, 1]);
    } finally { resume(); f.renderer.dispose(); other.dispose(); }
  });

  it.each([false, true])("isolates pending frames belonging to two renderers on one device (async=%s)", async asynchronous => {
    const f = await afterimageRendererFixture();
    const shaderLibrary = (f.renderer as unknown as { shaderLibrary: ConstructorParameters<typeof Renderer>[1]["shaderLibrary"] }).shaderLibrary;
    const other = new Renderer(f.device, { width: 8, height: 8, shaderLibrary, qrFlags: f.flags }, new TemporalHistory());
    const render = async (renderer: Renderer, frameId: number) => {
      if (asynchronous) await renderer.renderAsync({ source: f.source, frameId });
      else renderer.render({ source: f.source, frameId });
    };
    try {
      await render(f.renderer, 1);
      await render(other, 1);
      expect(f.afterimageHistory).toEqual([0, 0]);
      expect(f.renderer.finishTemporalFrame(1)).toBe(true);
      expect(other.finishTemporalFrame(1)).toBe(true);
      await render(f.renderer, 2);
      await render(other, 2);
      expect(f.afterimageHistory).toEqual([0, 0, 1, 1]);
      expect(f.renderer.cancelTemporalFrame(2)).toBe(true);
      expect(other.finishTemporalFrame(2)).toBe(true);
      await render(f.renderer, 3);
      await render(other, 3);
      expect(f.afterimageHistory).toEqual([0, 0, 1, 1, 0, 1]);
      expect(f.renderer.finishTemporalFrame(3)).toBe(true);
      expect(other.finishTemporalFrame(3)).toBe(true);
    } finally { other.dispose(); f.renderer.dispose(); }
  });

  it.each([false, true])("isolates pending afterimages on independent devices (async=%s)", async asynchronous => {
    const a = await afterimageRendererFixture(), b = await afterimageRendererFixture();
    const render = async (f: typeof a, frameId: number) => {
      if (asynchronous) await f.renderer.renderAsync({ source: f.source, frameId });
      else f.renderer.render({ source: f.source, frameId });
    };
    try {
      await Promise.all([render(a, 1), render(b, 1)]);
      expect(a.afterimageHistory).toEqual([0]);
      expect(b.afterimageHistory).toEqual([0]);
      expect(a.renderer.cancelTemporalFrame(1)).toBe(true);
      expect(b.renderer.finishTemporalFrame(1)).toBe(true);
      await Promise.all([render(a, 2), render(b, 2)]);
      expect(a.afterimageHistory).toEqual([0, 0]);
      expect(b.afterimageHistory).toEqual([0, 1]);
      expect(a.renderer.finishTemporalFrame(2)).toBe(true);
      expect(b.renderer.finishTemporalFrame(2)).toBe(true);
    } finally { a.renderer.dispose(); b.renderer.dispose(); }
  });
});
