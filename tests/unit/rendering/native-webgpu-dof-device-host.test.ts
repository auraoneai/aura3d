import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUBindGroupLayoutDescriptorLike, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import type { DrawCommand, NativeWebGPUDofFrame, NativeWebGPUDofFrameDescriptor, RenderDevice, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import type { DofOptions } from "../../../packages/rendering/src/post/PostGraph";
import { postDiagnostics, type PostDiagnosticToken } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import { postStagesRan } from "../../../packages/rendering/src/renderer/postSkipped";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";

// A native-shaped recording device: these checks do not compile WGSL, run a
// GPU, or make claims about physical pixels and optical quality.
type TextureRecord = { readonly label: string; readonly format: string; destroyed: number; createView(descriptor?: object): ViewRecord; destroy(): void };
type ViewRecord = { readonly texture: TextureRecord; readonly descriptor?: object };
type GroupRecord = { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] };
type PipelineRecord = { readonly descriptor: WebGPURenderPipelineDescriptorLike; getBindGroupLayout(index: number): object };
type PassRecord = { readonly descriptor: WebGPURenderPassDescriptorLike; pipeline?: PipelineRecord; group?: GroupRecord; draws: number };

async function fixture(options: { readonly missingLayout?: boolean; readonly missingFence?: boolean; readonly batching?: boolean } = {}) {
  const textures: TextureRecord[] = [];
  const layouts: WebGPUBindGroupLayoutDescriptorLike[] = [];
  const pipelines: PipelineRecord[] = [];
  const passes: PassRecord[] = [];
  const events: string[] = [];
  const fences: Array<() => void> = [];
  const writes = new Map<object, Uint8Array>();
  let inSubmit = false, onSubmit: ((passes: readonly PassRecord[]) => void) | undefined;
  let onDraw: ((pass: PassRecord) => void) | undefined;
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native = {
    features: new Set<string>(), lost,
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024 },
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        writes.set(buffer, new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer,
          data instanceof ArrayBuffer ? 0 : data.byteOffset, data instanceof ArrayBuffer ? data.byteLength : data.byteLength).slice());
      },
      submit(commands: readonly { readonly passes: readonly PassRecord[] }[]) {
        if (!commands.length) return;
        const submitted = commands.flatMap((command) => command.passes);
        inSubmit = true; events.push("submit-start");
        try { onSubmit?.(submitted); events.push(...submitted.map((pass) => `submitted:${pass.descriptor.label}`)); }
        finally { inSubmit = false; events.push("submit-end"); }
      },
      ...(options.missingFence ? {} : { onSubmittedWorkDone() {
        events.push(inSubmit ? "fence-during-submit" : "fence-after-submit");
        return new Promise<void>((resolve) => fences.push(resolve));
      } })
    },
    createBuffer(descriptor: { readonly label?: string }) { return { label: descriptor.label ?? "", destroy() {} }; },
    createTexture(descriptor: { readonly label?: string; readonly format: string }) {
      const texture: TextureRecord = { label: descriptor.label ?? "", format: descriptor.format, destroyed: 0,
        createView(viewDescriptor) { return { texture, ...(viewDescriptor ? { descriptor: viewDescriptor } : {}) }; },
        destroy() { texture.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike) {
      const pipeline: PipelineRecord = { descriptor, getBindGroupLayout(index) { return { pipeline, index }; } };
      pipelines.push(pipeline); return pipeline;
    },
    ...(options.missingLayout ? {} : {
      createBindGroupLayout(descriptor: WebGPUBindGroupLayoutDescriptorLike) { layouts.push(descriptor); return { descriptor }; },
      createPipelineLayout(descriptor: object) { return { descriptor }; }
    }),
    createBindGroup(group: GroupRecord) { return group; },
    createSampler: () => ({}),
    createCommandEncoder() {
      const encoded: PassRecord[] = [];
      return {
        beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
          const pass: PassRecord = { descriptor, draws: 0 };
          passes.push(pass); encoded.push(pass);
          return {
            setPipeline(pipeline: PipelineRecord) { pass.pipeline = pipeline; },
            setBindGroup(_index: number, group: GroupRecord) { pass.group = group; },
            setVertexBuffer() {}, setBlendConstant() {}, setStencilReference() {}, setViewport() {}, setScissorRect() {},
            draw() { pass.draws += 1; onDraw?.(pass); }, end() {}
          };
        },
        finish: () => ({ passes: encoded })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native, ...(options.batching ? { nativeDrawBatching: true } : {}) });
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, native, textures, layouts, pipelines, passes, events, writes, finishFences, lose,
    onSubmit(callback?: typeof onSubmit) { onSubmit = callback; }, onDraw(callback?: typeof onDraw) { onDraw = callback; },
    async close() { onSubmit = undefined; onDraw = undefined; await finishFences(); if (!device.disposed) device.dispose(); await finishFences(); } };
}

function perspective(): { readonly projection: Float32Array; readonly inverse: Float32Array } {
  // A perspective camera with near=1 and far=11, using [-1, 1] clip depth.
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
  const inverse = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, -1 / 2.2, 0, 0, -1, 1.2 / 2.2]);
  return { projection, inverse };
}

function createScene(device: WebGPUDevice) {
  const source = device.createRenderTarget({ label: "dof-source", width: 4, height: 4, depth: "texture",
    colorAttachments: [{ format: "rgba16f" }, { format: "rgba8" }] });
  const output = device.createRenderTarget({ label: "dof-output", width: 4, height: 4, format: "rgba8", depth: false });
  const inputColor = device.getNativeTexture(source.colorTexture);
  const inputCoverage = device.getNativeTexture(source.colorTextures![1]!);
  const inputDepth = device.getNativeTexture(source.depthTexture!);
  const matrices = perspective();
  const frameData = new Float32Array(76);
  frameData.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
  frameData.set(matrices.projection, 16); frameData.set(matrices.projection, 32); frameData.set(matrices.projection, 48);
  frameData.set([0, 0, 0, 1], 64); frameData.set([4, 4, 11, 0], 68); frameData.set([1, 0, 0, 0], 72);
  const frameBuffer = device.createBuffer("uniform", frameData.byteLength, frameData);
  const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true });
  const generated = generateProgramImpl(normalizeProgramFeatures({ lighting: "unlit", features: {
    "a3d.nativePrimitive": "triangles", "a3d.depthCoverage": true
  } }), { flags });
  const shader = device.createShaderProgram({ label: "dof-coverage", marker: GENERATED_PROGRAM_MARKER,
    vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
  const vertices = device.createBuffer("vertex", 36, new Float32Array([0, 0, -2, 0.5, 0, -2, 0, 0.5, -2]));
  const command: DrawCommand = { topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, shader,
    uniforms: new Map<string, UniformValue>([["u_baseColor", [0.2, 0.4, 0.6, 1]], ["u_emissiveColor", [0, 0, 0]], ["u_emissiveStrength", 0]]),
    renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "none", blend: false,
      colorAttachments: [undefined, { colorWrite: [true, false, false, false], blendMode: "opaque" }] } };
  const scopeId = {};
  const descriptor: NativeWebGPUDofFrameDescriptor = { source, coverage: { target: source, colorAttachment: 1, encoding: "depth-coverage-red8" },
    projection: { kind: "perspective", mode: "standard", clipRange: "minus-one-to-one", inverseProjection: matrices.inverse,
      nearMeters: 1, farMeters: 11, viewportDepthRange: [0, 1], clearValue: 1 },
    maxGeometryDepthMeters: 12, skyDepthMeters: 20, alpha: "opaque", depthModel: "single-surface", scopeId, viewId: "main", frameId: 17 };
  const renderDevice: RenderDevice = device;
  device.beginFrame(4, 4); device.setRenderTarget(source); device.bindUniformBuffer(frameBuffer, 0);
  return { source, output, inputColor, inputCoverage, inputDepth, command, descriptor, renderDevice, frameBuffer, vertices, shader };
}

function begin(scene: ReturnType<typeof createScene>): NativeWebGPUDofFrame {
  const frame = scene.renderDevice.beginNativeDepthOfFieldFrame!(scene.descriptor);
  scene.renderDevice.clear([0.1, 0.2, 0.3, 1]);
  scene.renderDevice.clearRenderTarget!([0, 0, 0, 0], 1);
  return frame;
}

function seal(scene: ReturnType<typeof createScene>, frame: NativeWebGPUDofFrame): void {
  scene.renderDevice.draw(scene.command);
  scene.renderDevice.sealNativeDepthOfFieldFrame!(frame);
}

function present(scene: ReturnType<typeof createScene>, frame: NativeWebGPUDofFrame, options: Partial<DofOptions> = {}, diagnosticToken?: PostDiagnosticToken): void {
  scene.renderDevice.presentLdrPostprocess!(scene.source, { outputTarget: scene.output,
    passes: [{ name: "tone-mapping", options: { operator: "reinhard" } }],
    postFrameContext: { scopeId: scene.descriptor.scopeId, viewId: scene.descriptor.viewId, frameId: scene.descriptor.frameId,
      ...(diagnosticToken ? { diagnosticToken } : {}) },
    nativeDepthOfField: { frame, options } });
}

function fragmentEntry(pass: PassRecord): string | undefined { return pass.pipeline?.descriptor.fragment?.entryPoint; }
function binding(pass: PassRecord, index: number): unknown { return pass.group?.entries.find((entry) => entry.binding === index)?.resource; }

describe("native WebGPU depth-of-field device host", () => {
  it("records scoped depth and DoF markers only after their submissions return", async () => {
    const f = await fixture();
    const unrelatedScope = {};
    try {
      const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
      const token = postDiagnostics.begin(scene.descriptor.scopeId, scene.descriptor.viewId, scene.descriptor.frameId);
      const unrelated = postDiagnostics.begin(unrelatedScope, "main", scene.descriptor.frameId);
      const observed: Array<{ readonly entry: string; readonly stages: readonly string[] }> = [];
      f.onSubmit((passes) => {
        for (const pass of passes) {
          const entry = fragmentEntry(pass);
          if (entry === "fs_linear_depth" || entry?.startsWith("fs_dof_")) {
            observed.push({ entry, stages: [...postStagesRan(token)] });
          }
        }
      });
      present(scene, frame, {}, token);
      const depth = observed.filter(({ entry }) => entry === "fs_linear_depth");
      const dof = observed.filter(({ entry }) => entry.startsWith("fs_dof_"));
      expect(depth).toHaveLength(1);
      expect(depth[0]!.stages).not.toContain("S1:depth-prep");
      expect(depth[0]!.stages).not.toContain("S6:dof");
      expect(dof).toHaveLength(6);
      for (const draw of dof) {
        expect(draw.stages).toContain("S1:depth-prep");
        expect(draw.stages).not.toContain("S6:dof");
      }
      expect(postStagesRan(token)).toEqual(["S1:depth-prep", "S6:dof"]);
      expect(postStagesRan(unrelated)).toEqual([]);
      // Submission markers establish ordering only, not rendered pixels.
      scene.source.dispose(); scene.output.dispose();
      postDiagnostics.resetScope(scene.descriptor.scopeId);
    } finally { postDiagnostics.resetScope(unrelatedScope); await f.close(); }
  });

  it("does not record unsubmitted stages when depth or the final DoF submit fails", async () => {
    for (const failureEntry of ["fs_linear_depth", "fs_dof_composite"] as const) {
      const f = await fixture();
      try {
        const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
        const token = postDiagnostics.begin(scene.descriptor.scopeId, scene.descriptor.viewId, scene.descriptor.frameId);
        f.onSubmit((passes) => {
          if (passes.some((pass) => fragmentEntry(pass) === failureEntry)) throw new Error(`injected ${failureEntry} failure`);
        });
        expect(() => present(scene, frame, {}, token)).toThrow(`injected ${failureEntry} failure`);
        expect(postStagesRan(token)).toEqual(failureEntry === "fs_linear_depth" ? [] : ["S1:depth-prep"]);
        expect(f.events).not.toContain(failureEntry === "fs_linear_depth"
          ? "submitted:webgpu-linear-depth-pass" : "submitted:webgpu-dof-composite-pass");
        f.onSubmit(undefined);
        scene.source.dispose(); scene.output.dispose();
        postDiagnostics.resetScope(scene.descriptor.scopeId);
      } finally { await f.close(); }
    }
  });

  it("keeps per-issued submission snapshots distinct when frame identifiers are reused", async () => {
    for (const failureEntry of ["fs_linear_depth", "fs_dof_composite"] as const) {
      const f = await fixture();
      try {
        const scene = createScene(f.device);
        const token = postDiagnostics.begin(scene.descriptor.scopeId, scene.descriptor.viewId, scene.descriptor.frameId);
        const reports = scene.renderDevice as RenderDevice & { getNativeDepthOfFieldFrameSubmission(frame: NativeWebGPUDofFrame):
          Readonly<{ depthSubmitted: boolean; effectSubmitted: boolean }> | undefined };
        const first = begin(scene); seal(scene, first); present(scene, first, {}, token);
        const completed = reports.getNativeDepthOfFieldFrameSubmission(first)!;
        expect(completed).toEqual({ depthSubmitted: true, effectSubmitted: true });
        expect(Object.isFrozen(completed)).toBe(true);
        expect(reports.getNativeDepthOfFieldFrameSubmission({ ...first, isCurrent: () => true })).toBeUndefined();
        scene.renderDevice.cancelNativeDepthOfFieldFrame!(first);
        expect(reports.getNativeDepthOfFieldFrameSubmission(first)).toEqual(completed);
        expect(postStagesRan(token)).toEqual(["S1:depth-prep", "S6:dof"]);

        // The second issue intentionally reuses the exact scope/view/frame ID,
        // whose diagnostic stage list still contains the first submission.
        const second = begin(scene); seal(scene, second);
        expect(second).not.toBe(first);
        f.onSubmit((passes) => {
          if (!passes.some((pass) => fragmentEntry(pass) === failureEntry)) return;
          expect(reports.getNativeDepthOfFieldFrameSubmission(second)).toEqual(
            failureEntry === "fs_linear_depth"
              ? { depthSubmitted: false, effectSubmitted: false }
              : { depthSubmitted: true, effectSubmitted: false }
          );
          throw new Error(`injected ${failureEntry} failure`);
        });
        expect(() => present(scene, second, {}, token)).toThrow(`injected ${failureEntry} failure`);
        f.onSubmit(undefined);
        scene.renderDevice.cancelNativeDepthOfFieldFrame!(second);
        const failed = reports.getNativeDepthOfFieldFrameSubmission(second)!;
        expect(failed).toEqual(failureEntry === "fs_linear_depth"
          ? { depthSubmitted: false, effectSubmitted: false }
          : { depthSubmitted: true, effectSubmitted: false });
        expect(Object.isFrozen(failed)).toBe(true);
        expect(reports.getNativeDepthOfFieldFrameSubmission(first)).toEqual({ depthSubmitted: true, effectSubmitted: true });
        expect(postStagesRan(token)).toEqual(failureEntry === "fs_linear_depth"
          ? ["S1:depth-prep", "S6:dof"] : ["S1:depth-prep", "S6:dof", "S1:depth-prep"]);
        scene.source.dispose(); scene.output.dispose();
        postDiagnostics.resetScope(scene.descriptor.scopeId);
      } finally { await f.close(); }
    }
  });

  it("submits the depth conversion and six effect draws in HDR order with exact native views", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene);
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(false);
      seal(scene, frame);
      expect(scene.renderDevice.canPresentNativeDepthOfField!()).toBe(true);
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(true);
      present(scene, frame);
      const submitted = f.passes.filter((pass) => pass.draws > 0);
      const entries = submitted.map(fragmentEntry);
      const start = entries.indexOf("fs_linear_depth");
      expect(start).toBeGreaterThanOrEqual(0);
      expect(entries.slice(start, start + 9)).toEqual(["fs_linear_depth", "fs_dof_prefilter", "fs_dof_prefilter_coc", "fs_dof_near_tile",
        "fs_dof_gather", "fs_dof_gather_influence", "fs_dof_composite", "fs_tone", "fs_copy"]);
      const linear = submitted[start]!;
      expect((binding(linear, 1) as ViewRecord).texture).toBe(scene.inputDepth);
      expect((binding(linear, 1) as ViewRecord).descriptor).toMatchObject({ aspect: "depth-only" });
      expect((binding(linear, 2) as ViewRecord).texture).toBe(scene.inputCoverage);
      expect(linear.pipeline!.descriptor.fragment!.targets[0]!.format).toBe("rgba32float");
      const linearBuffer = binding(linear, 0) as { readonly buffer: object };
      expect(f.writes.get(linearBuffer.buffer)?.byteLength).toBe(32);
      const linearLayout = f.layouts.find((layout) => layout.entries.some((entry) => entry.binding === 1 && entry.texture?.sampleType === "depth"));
      expect(linearLayout?.entries.find((entry) => entry.binding === 2)?.texture?.sampleType).toBe("float");
      const [prefilter, coc, tile, gather, influence, composite] = submitted.slice(start + 1, start + 7);
      expect((binding(prefilter!, 1) as ViewRecord).texture).toBe(scene.inputColor);
      expect((binding(prefilter!, 2) as ViewRecord).texture).toBe((linear.descriptor.colorAttachments[0]!.view as ViewRecord).texture);
      expect(coc!.group!.entries.map((entry) => entry.binding).sort()).toEqual([0, 1, 2]);
      expect(tile!.group!.entries.map((entry) => entry.binding).sort()).toEqual([1]);
      expect(gather!.group!.entries.map((entry) => entry.binding).sort()).toEqual([1, 2, 3]);
      expect(influence!.group!.entries.map((entry) => entry.binding).sort()).toEqual([1, 2, 3]);
      expect(composite!.group!.entries.map((entry) => entry.binding).sort()).toEqual([1, 2, 3, 4]);
      for (const pass of [gather!, influence!]) {
        expect((pass.pipeline!.descriptor.fragment as unknown as { constants?: Record<string, number> }).constants).toEqual({ DOF_RINGS: 3 });
      }
      expect(submitted[start + 7]!.descriptor.colorAttachments[0]!.view).not.toBe(linear.descriptor.colorAttachments[0]!.view);
      scene.source.dispose(); scene.output.dispose();
      const relevant = f.textures.filter((texture) => texture.label.startsWith("dof-source") || texture.label.startsWith("webgpu-dof-") || texture.label === "webgpu-linear-depth");
      expect(relevant.length).toBeGreaterThan(3);
      expect(relevant.every((texture) => texture.destroyed === 0)).toBe(true);
      await f.finishFences();
      expect(relevant.every((texture) => texture.destroyed === 1)).toBe(true);
    } finally { await f.close(); }
  });

  it("rejects a forged, cancelled, foreign-source or stale frame proof", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
      const forged = { ...frame, isCurrent: () => true };
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(forged, scene.source)).toBe(false);
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.output)).toBe(false);
      expect(() => present(scene, forged)).toThrow();
      scene.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(false);
      expect(() => present(scene, frame)).toThrow();
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("rejects a frame and source belonging to another WebGPU device generation", async () => {
    const first = await fixture(), second = await fixture();
    try {
      const a = createScene(first.device), frame = begin(a); seal(a, frame);
      const b = createScene(second.device);
      expect(b.renderDevice.validateNativeDepthOfFieldFrame!(frame, a.source)).toBe(false);
      expect(b.renderDevice.validateNativeDepthOfFieldFrame!(frame, b.source)).toBe(false);
      expect(() => b.renderDevice.beginNativeDepthOfFieldFrame!({ ...b.descriptor, source: a.source,
        coverage: { target: a.source, colorAttachment: 1, encoding: "depth-coverage-red8" } })).toThrow();
      a.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      a.source.dispose(); a.output.dispose(); b.source.dispose(); b.output.dispose();
    } finally { await first.close(); await second.close(); }
  });

  it("does not seal without the required zero coverage clear", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device);
      const frame = scene.renderDevice.beginNativeDepthOfFieldFrame!(scene.descriptor);
      scene.renderDevice.clear([0.1, 0.2, 0.3, 1]);
      expect(() => scene.renderDevice.clearRenderTarget!([1, 0, 0, 0], 1)).toThrow();
      expect(() => scene.renderDevice.sealNativeDepthOfFieldFrame!(frame)).toThrow();
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(false);
      scene.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("invalidates proof when an attempted scene draw does not write its paired depth", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene);
      expect(() => scene.renderDevice.draw({ ...scene.command, renderState: { ...scene.command.renderState!, depthWrite: false } })).toThrow();
      expect(() => scene.renderDevice.sealNativeDepthOfFieldFrame!(frame)).toThrow();
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(false);
      scene.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("invalidates the sealed proof after a subsequent source clear", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(true);
      try { scene.renderDevice.clear([0, 0, 0, 1]); } catch (error) { expect(error).toBeInstanceOf(Error); }
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(false);
      expect(() => present(scene, frame)).toThrow();
      scene.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("invalidates the frame proof on device loss", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
      f.lose(); await Promise.resolve(); await Promise.resolve();
      expect(scene.renderDevice.validateNativeDepthOfFieldFrame!(frame, scene.source)).toBe(false);
      expect(() => present(scene, frame)).toThrow();
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("snapshots the producer projection instead of trusting later descriptor mutation", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene);
      (scene.descriptor.projection.inverseProjection as Float32Array)[15] = 123;
      seal(scene, frame);
      present(scene, frame);
      const depth = f.passes.find((pass) => fragmentEntry(pass) === "fs_linear_depth")!;
      const uniform = binding(depth, 0) as { readonly buffer: object };
      const written = f.writes.get(uniform.buffer)!;
      const data = new DataView(written.buffer, written.byteOffset, written.byteLength);
      expect(data.getFloat32(0, true)).toBeCloseTo(1, 5);
      expect(data.getFloat32(4, true)).toBeCloseTo(1 / 11, 5);
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("rejects a material changed by a callback before its coverage draw is submitted", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene);
      const before = f.events.filter((event) => event.startsWith("submitted:")).length;
      f.onDraw(() => { (scene.command.uniforms as Map<string, UniformValue>).set("u_baseColor", [0.2, 0.4, 0.6, 0.25]); });
      expect(() => scene.renderDevice.draw(scene.command)).toThrow();
      f.onDraw(undefined);
      expect(f.events.filter((event) => event.startsWith("submitted:"))).toHaveLength(before);
      expect(() => scene.renderDevice.sealNativeDepthOfFieldFrame!(frame)).toThrow();
      scene.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("does not submit a depth conversion after its source is disposed during encoding", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
      f.onDraw((pass) => { if (fragmentEntry(pass) === "fs_linear_depth") scene.source.dispose(); });
      expect(() => present(scene, frame)).toThrow();
      expect(f.events.some((event) => event === "submitted:webgpu-linear-depth-pass")).toBe(false);
      f.onDraw(undefined);
      await f.finishFences();
      expect(f.textures.filter((texture) => texture.label.startsWith("dof-source")).every((texture) => texture.destroyed === 1)).toBe(true);
      scene.output.dispose();
    } finally { await f.close(); }
  });

  it("rejects another attachment or an unsupported optical option before any DoF draw", async () => {
    const f = await fixture();
    try {
      const scene = createScene(f.device);
      expect(() => scene.renderDevice.beginNativeDepthOfFieldFrame!({ ...scene.descriptor,
        coverage: { target: scene.source, colorAttachment: 0, encoding: "depth-coverage-red8" } })).toThrow();
      const frame = begin(scene); seal(scene, frame);
      const before = f.passes.filter((pass) => fragmentEntry(pass) === "fs_linear_depth").length;
      expect(() => present(scene, frame, { halfRes: false })).toThrow();
      expect(f.passes.filter((pass) => fragmentEntry(pass) === "fs_linear_depth")).toHaveLength(before);
      scene.renderDevice.cancelNativeDepthOfFieldFrame!(frame);
      scene.source.dispose(); scene.output.dispose();
    } finally { await f.close(); }
  });

  it("does not advertise the native route without its layouts or a completion fence", async () => {
    for (const options of [{ missingLayout: true }, { missingFence: true }]) {
      const f = await fixture(options);
      try { expect((f.device as RenderDevice).canPresentNativeDepthOfField?.() ?? false).toBe(false); }
      finally { await f.close(); }
    }
  });
});

describe("native WebGPU depth-of-field device host with draw batching (5.5.1)", () => {
  it("records the depth pass and the six DoF passes into two batch submissions, each reported only after it returns", async () => {
    const f = await fixture({ batching: true });
    try {
      const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
      const token = postDiagnostics.begin(scene.descriptor.scopeId, scene.descriptor.viewId, scene.descriptor.frameId);
      const submissions: Array<{ readonly entries: readonly string[]; readonly stages: readonly string[] }> = [];
      f.onSubmit((passes) => {
        const entries = passes.map(fragmentEntry).filter((entry): entry is string => entry === "fs_linear_depth" || Boolean(entry?.startsWith("fs_dof_")));
        if (entries.length) submissions.push({ entries, stages: [...postStagesRan(token)] });
      });
      present(scene, frame, {}, token);
      expect(submissions).toHaveLength(2);
      expect(submissions[0]).toEqual({ entries: ["fs_linear_depth"], stages: [] });
      expect(submissions[1]!.entries).toHaveLength(6);
      expect(submissions[1]!.stages).toEqual(["S1:depth-prep"]);
      expect(postStagesRan(token)).toEqual(["S1:depth-prep", "S6:dof"]);
      // Every DoF pass still clears and draws once into its own render pass.
      const dofPasses = f.passes.filter((pass) => fragmentEntry(pass)?.startsWith("fs_dof_"));
      expect(dofPasses).toHaveLength(6);
      for (const pass of dofPasses) {
        expect(pass.draws).toBe(1);
        expect(pass.descriptor.colorAttachments[0]).toMatchObject({ loadOp: "clear" });
      }
      scene.source.dispose(); scene.output.dispose();
      postDiagnostics.resetScope(scene.descriptor.scopeId);
    } finally { await f.close(); }
  });

  it("does not record a stage whose batch submission fails, and keeps uniform bytes per pass across frames", async () => {
    for (const failureEntry of ["fs_linear_depth", "fs_dof_composite"] as const) {
      const f = await fixture({ batching: true });
      try {
        const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
        const token = postDiagnostics.begin(scene.descriptor.scopeId, scene.descriptor.viewId, scene.descriptor.frameId);
        f.onSubmit((passes) => {
          if (passes.some((pass) => fragmentEntry(pass) === failureEntry)) throw new Error(`injected ${failureEntry} failure`);
        });
        // The batch holding the failing pass is submitted when the driver releases its intermediates, so the failure can
        // arrive wrapped with that cleanup; either way it is thrown and the stage is not reported.
        let thrown: unknown;
        try { present(scene, frame, {}, token); } catch (error) { thrown = error; }
        const messages = (error: unknown): string[] => error instanceof AggregateError
          ? [error.message, ...error.errors.flatMap(messages)] : [error instanceof Error ? error.message : String(error)];
        expect(messages(thrown)).toContain(`injected ${failureEntry} failure`);
        expect(postStagesRan(token)).toEqual(failureEntry === "fs_linear_depth" ? [] : ["S1:depth-prep"]);
        f.onSubmit(undefined);
        scene.source.dispose(); scene.output.dispose();
        postDiagnostics.resetScope(scene.descriptor.scopeId);
      } finally { await f.close(); }
    }
    // Two frames: each pass's uniform buffer is bound with that frame's bytes (one buffer per pass, rewritten).
    const f = await fixture({ batching: true });
    try {
      for (let frameIndex = 0; frameIndex < 2; frameIndex += 1) {
        const scene = createScene(f.device), frame = begin(scene); seal(scene, frame);
        const uniforms = new Map<object, Uint8Array>();
        f.onSubmit((passes) => {
          for (const pass of passes) {
            const resource = binding(pass, 0) as { buffer?: object } | undefined;
            if (resource?.buffer && fragmentEntry(pass)?.startsWith("fs_dof_")) uniforms.set(resource.buffer, f.writes.get(resource.buffer)!);
          }
        });
        present(scene, frame, { focusDistance: 2 + frameIndex }, undefined);
        expect(uniforms.size).toBeGreaterThan(0);
        for (const bytes of uniforms.values()) expect(bytes).toBeDefined();
        f.onSubmit(undefined);
        scene.renderDevice.endFrame();
        scene.source.dispose(); scene.output.dispose();
        postDiagnostics.resetScope(scene.descriptor.scopeId);
      }
    } finally { await f.close(); }
  });
});

