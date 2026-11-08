import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer, type CameraLike } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { OutputPass } from "../../../packages/rendering/src/output/OutputPass";
import type { LdrPostprocessPresentationOptions, RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { WebGPUDevice, type WebGPUCanvasConfigurationLike, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";

// The fixture records actual host-side configurations and submitted shader
// descriptors. It does not compile WGSL or establish rendered pixels.
type Mode = "accept" | "reject" | "ignore" | "unobservable" | "stuck-p3" | "foreign-device" | "wrong-format";
type Pipeline = { readonly descriptor: WebGPURenderPipelineDescriptorLike; getBindGroupLayout(index: number): object };
type Pass = { readonly descriptor: WebGPURenderPassDescriptorLike; pipeline?: Pipeline; group?: unknown; draws: number };

async function fixture(mode: Mode = "accept", alphaMode: "opaque" | "premultiplied" = "opaque", deferFences = false) {
  const configured: WebGPUCanvasConfigurationLike[] = [];
  const passes: Pass[] = [];
  const submitted: Pass[] = [];
  const submissionSpaces: Array<{ readonly pass: Pass; readonly colorSpace: "srgb" | "display-p3" | undefined }> = [];
  const writes = new Map<object, Uint8Array>();
  const events: string[] = [];
  const fences: Array<() => void> = [];
  let configuration: WebGPUCanvasConfigurationLike | null = null;
  let onDraw: ((pass: Pass) => void) | undefined;
  let onSubmit: ((passes: readonly Pass[]) => void) | undefined;
  let inSubmit = false;
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        writes.set(buffer, new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer,
          data instanceof ArrayBuffer ? 0 : data.byteOffset, data.byteLength).slice());
      },
      writeTexture() {},
      submit(commands: readonly { readonly passes: readonly Pass[] }[]) {
        const pending = commands.flatMap((command) => command.passes);
        inSubmit = true;
        events.push(`submit-start:${pending.map((pass) => pass.descriptor.label ?? "").join(",")}`);
        try {
          onSubmit?.(pending);
          for (const pass of pending) {
            submitted.push(pass);
            submissionSpaces.push({ pass, colorSpace: configuration?.colorSpace });
          }
        } finally {
          inSubmit = false;
          events.push(`submit-end:${pending.map((pass) => pass.descriptor.label ?? "").join(",")}`);
        }
      },
      onSubmittedWorkDone() {
        events.push(inSubmit ? "fence-during-submit" : "fence-after-submit");
        return deferFences ? new Promise<void>((resolve) => fences.push(resolve)) : Promise.resolve();
      }
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: { readonly label?: string; readonly format?: string; readonly sampleCount?: number }) {
      const texture = { label: descriptor.label, format: descriptor.format, sampleCount: descriptor.sampleCount ?? 1, destroyed: 0,
        createView: () => ({ texture }), destroy() { texture.destroyed += 1; } };
      return texture;
    },
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike): Pipeline {
      return { descriptor, getBindGroupLayout: (index) => ({ index }) };
    },
    createBindGroupLayout: (descriptor: object) => ({ descriptor }),
    createPipelineLayout: (descriptor: object) => ({ descriptor }),
    createBindGroup(descriptor: object) {
      const entries = (descriptor as { readonly entries?: readonly { readonly binding: number; readonly resource: unknown }[] }).entries;
      const resource = entries?.find((item) => item.binding === 0)?.resource as { readonly buffer?: object } | undefined;
      const bytes = resource?.buffer && writes.get(resource.buffer);
      return { descriptor, ...(bytes ? { bytes: bytes.slice() } : {}) };
    },
    createSampler: () => ({}),
    createCommandEncoder() {
      const encoded: Pass[] = [];
      return {
        beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
          const pass: Pass = { descriptor, draws: 0 };
          passes.push(pass); encoded.push(pass);
          return { setPipeline(pipeline: Pipeline) { pass.pipeline = pipeline; }, setBindGroup(_index: number, group: unknown) { pass.group = group; }, setVertexBuffer() {}, setIndexBuffer() {},
            setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw() { pass.draws += 1; onDraw?.(pass); }, drawIndexed() { pass.draws += 1; onDraw?.(pass); }, end() {} };
        },
        finish: () => ({ passes: encoded })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const view = { canvas: true };
  const canvasTexture = { format: "bgra8unorm", usage: 0x10, sampleCount: 1, createView: () => view, destroy() {} };
  const context = {
    configure(value: WebGPUCanvasConfigurationLike) {
      configured.push({ ...value });
      if (value.colorSpace === "display-p3" && mode === "reject") throw new Error("P3 is unavailable");
      if (value.colorSpace === "srgb" && mode === "stuck-p3" && configuration?.colorSpace === "display-p3") return;
      configuration = value.colorSpace === "display-p3" && mode === "ignore" ? { ...value, colorSpace: "srgb" }
        : value.colorSpace === "display-p3" && mode === "foreign-device" ? { ...value, device: {} as WebGPUDeviceLike }
        : value.colorSpace === "display-p3" && mode === "wrong-format" ? { ...value, format: "rgba8unorm" } : value;
    },
    ...(mode === "unobservable" ? {} : { getConfiguration: () => configuration }),
    getCurrentTexture: () => canvasTexture,
    unconfigure() { configuration = null; }
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native,
    canvas: { getContext: () => context } as unknown as HTMLCanvasElement, presentationAlphaMode: alphaMode });
  return { device, native, context, configured, passes, submitted, submissionSpaces, writes, view, events,
    configuration: () => configuration,
    setConfiguration(value: WebGPUCanvasConfigurationLike | null) { configuration = value; },
    onDraw(callback?: (pass: Pass) => void) { onDraw = callback; },
    onSubmit(callback?: (passes: readonly Pass[]) => void) { onSubmit = callback; },
    async finishFences() {
      for (let round = 0; round < 4; round += 1) {
        for (const resolve of fences.splice(0)) resolve();
        await Promise.resolve();
      }
    },
    close() { if (!device.disposed) device.dispose(); } };
}

function canvasDraws(f: Awaited<ReturnType<typeof fixture>>): Pass[] {
  return f.submitted.filter((pass) => pass.draws > 0 && pass.descriptor.colorAttachments?.[0]?.view === f.view);
}

function fragment(pass: Pass): string {
  return (pass.pipeline?.descriptor.fragment?.module as { readonly code: string } | undefined)?.code ?? "";
}

const options = { toneMapping: "none" as const, exposure: 1, dithering: false, backgroundCoverage: false };

function rendererFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const renderer = new Renderer(f.device, { width: 4, height: 4, shaderLibrary: createDefaultShaderLibrary(),
    clearColor: [0, 0, 0, 1], qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) },
  new TemporalHistory());
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial({ color: [0.2, 0.4, 0.6, 1] });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.2, -1, 0, 0, -2.2, 0]);
  const camera: CameraLike = { viewMatrix: identity, projectionMatrix: projection, viewProjectionMatrix: projection,
    projectionMetadata: { kind: "perspective", near: 1, far: 11, mode: "standard", clipRange: "minus-one-to-one" } };
  const source = { renderItems: [{ geometry, material }], cameraPolicy: "require" as const, frustumCulling: false,
    shadow: { enabled: false } };
  return { renderer, geometry, material, camera, source,
    close() { renderer.dispose(); geometry.dispose(); material.dispose(); } };
}

function entry(pass: Pass): string | undefined { return pass.pipeline?.descriptor.fragment?.entryPoint; }

function expectResolvedSceneToneInput(f: Awaited<ReturnType<typeof fixture>>): void {
  const scene = f.submitted.find((pass) => pass.draws > 0 && pass.descriptor.colorAttachments?.[0]?.resolveTarget);
  expect(scene).toBeDefined();
  const attachment = scene!.descriptor.colorAttachments![0]!;
  expect(attachment.view).not.toBe(attachment.resolveTarget);
  const multisampled = attachment.view as { readonly texture: { readonly sampleCount: number } };
  const resolved = attachment.resolveTarget as { readonly texture: { readonly sampleCount: number } };
  expect(multisampled.texture.sampleCount).toBe(4);
  expect(resolved.texture.sampleCount).toBe(1);
  const tone = f.submitted.find((pass) => pass.draws > 0 && entry(pass) === "fs_tone");
  expect(tone).toBeDefined();
  const group = tone!.group as { readonly descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] } };
  expect(group.descriptor.entries.find((item) => item.binding === 2)?.resource).toBe(attachment.resolveTarget);
}

describe("WebGPU Display-P3 canvas negotiation", () => {
  it("activates P3 only when the actual opaque canvas confirms the configuration", async () => {
    const f = await fixture();
    try {
      expect(f.configuration()).toMatchObject({ device: f.native, format: "bgra8unorm", alphaMode: "opaque", colorSpace: "srgb" });
      const negotiation = f.device.negotiateOutputColorSpace("display-p3");
      expect(negotiation).toMatchObject({ requested: "display-p3", active: "display-p3" });
      expect(negotiation.supported).toContain("display-p3");
      expect(f.configuration()).toMatchObject({ device: f.native, format: "bgra8unorm", alphaMode: "opaque", colorSpace: "display-p3" });
      expect(f.device.outputColorSpace).toBe("display-p3");
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "display-p3" });

      expect(f.device.negotiateOutputColorSpace("srgb")).toMatchObject({ requested: "srgb", active: "srgb" });
      expect(f.configuration()).toMatchObject({ device: f.native, alphaMode: "opaque", colorSpace: "srgb" });
      expect(f.device.outputColorSpace).toBe("srgb");
    } finally { f.close(); }
  });

  it.each(["reject", "ignore", "unobservable", "foreign-device", "wrong-format"] as const)("reports sRGB fallback when the canvas is %s for P3", async (mode) => {
    const f = await fixture(mode);
    try {
      const result = f.device.negotiateOutputColorSpace("display-p3");
      expect(result).toMatchObject({ requested: "display-p3", active: "srgb", supported: ["srgb"] });
      expect(result.fallbackReason).toEqual(expect.any(String));
      expect(f.device.outputColorSpace).toBe("srgb");
      expect(f.configuration()).toMatchObject({ alphaMode: "opaque", colorSpace: "srgb" });
      expect(f.configured.at(-1)).toMatchObject({ colorSpace: "srgb" });
    } finally { f.close(); }
  });

  it("does not claim P3 for a premultiplied canvas outside the supported route", async () => {
    const f = await fixture("accept", "premultiplied");
    try {
      const result = f.device.negotiateOutputColorSpace("display-p3");
      expect(result).toMatchObject({ requested: "display-p3", active: "srgb", supported: ["srgb"] });
      expect(result.fallbackReason).toEqual(expect.any(String));
      expect(f.configuration()).toMatchObject({ colorSpace: "srgb", alphaMode: "premultiplied" });
    } finally { f.close(); }
  });

  it("rejects an sRGB restore that the context silently leaves in P3", async () => {
    const f = await fixture("stuck-p3");
    try {
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      expect(() => f.device.negotiateOutputColorSpace("srgb")).toThrowError(expect.objectContaining({ code: "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED" }));
      expect(f.configuration()).toMatchObject({ colorSpace: "display-p3" });
      expect(canvasDraws(f)).toHaveLength(0);
    } finally { f.close(); }
  });

  it("does not let a superseded device configure or unconfigure the newer canvas owner", async () => {
    const f = await fixture();
    const otherNative = { ...f.native } as WebGPUDeviceLike;
    const other = await WebGPUDevice.create({ adapter: { requestDevice: async () => otherNative }, device: otherNative,
      canvas: { getContext: () => f.context } as unknown as HTMLCanvasElement });
    try {
      expect(() => f.device.negotiateOutputColorSpace("display-p3")).toThrowError(expect.objectContaining({ code: "WEBGPU_CANVAS_SUPERSEDED" }));
      expect(other.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      f.device.dispose();
      expect(f.configuration()).toMatchObject({ device: otherNative, colorSpace: "display-p3" });
    } finally { if (!other.disposed) other.dispose(); f.close(); }
  });

  it("rejects presentation of an unproven encoded source while P3 is active", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    try {
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      expect(() => f.device.presentRenderTarget(source)).toThrow();
      expect(canvasDraws(f)).toHaveLength(0);
      expect(f.device.captureState().get("canvasSubmissions")).toBe(0);
    } finally { source.dispose(); f.close(); }
  });

  it.each([false, true])("rejects offscreen P3 post output without reconfiguring the canvas (async=%s)", async (asynchronous) => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    const output = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    const runner = new RendererPostprocessPipeline({ device: f.device, width: 4, height: 4 } as unknown as RendererHost);
    const post = { v2: true, toneMapping: { operator: "aces" }, pipeline: { outputColorSpace: "display-p3" } } as const;
    try {
      const count = f.configured.length;
      if (asynchronous) await expect(runner.executePostprocessAsync(post, [source], output)).rejects.toMatchObject({ code: "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED" });
      else expect(() => runner.executePostprocess(post, [source], output)).toThrowError(expect.objectContaining({ code: "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED" }));
      expect(f.configured).toHaveLength(count);
      expect(f.submitted.filter((pass) => pass.draws > 0)).toHaveLength(0);
    } finally { source.dispose(); output.dispose(); f.close(); }
  });
});

describe("WebGPU Display-P3 final output", () => {
  it("selects exactly one gamut transform and transfer for P3, then selects sRGB on the next frame", async () => {
    const f = await fixture();
    const input = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    const pass = new OutputPass(f.device);
    try {
      for (const colorSpace of ["display-p3", "srgb", "display-p3"] as const) {
        f.device.beginFrame(4, 4);
        pass.execute(input, null, { ...options, outputColorSpace: colorSpace, alphaMode: "opaque" }, "canvas");
        f.device.endFrame();
        expect(f.configuration()).toMatchObject({ colorSpace });
      }
      const draws = canvasDraws(f);
      expect(draws).toHaveLength(3);
      const shader = draws.map(fragment);
      expect(shader[0]).toContain("0.8224619687143624");
      expect(shader[1]).not.toContain("0.8224619687143624");
      expect(shader[2]).toContain("0.8224619687143624");
      for (const source of shader) {
        const main = source.slice(source.indexOf("@fragment fn fs_main"));
        expect(main.match(/a3dOutputGamut\(/g)).toHaveLength(1);
        expect(main.match(/a3dLinearToSrgb\(/g)).toHaveLength(1);
        expect(main).toContain("return vec4<f32>(encoded, 1.0)");
      }
    } finally { pass.dispose(); input.dispose(); f.close(); }
  });

  it("does not submit a P3 output draw if the canvas configuration changes during encoding", async () => {
    const f = await fixture();
    const input = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    const pass = new OutputPass(f.device);
    try {
      f.onDraw((draw) => {
        if (draw.descriptor.colorAttachments?.[0]?.view === f.view) {
          f.setConfiguration({ device: f.native, format: "bgra8unorm", alphaMode: "opaque", colorSpace: "srgb" });
        }
      });
      f.device.beginFrame(4, 4);
      expect(() => pass.execute(input, null, { ...options, outputColorSpace: "display-p3", alphaMode: "opaque" }, "canvas")).toThrow();
      expect(canvasDraws(f)).toHaveLength(0);
      expect(f.device.captureState().get("canvasSubmissions")).toBe(0);
      f.device.endFrame();
    } finally { f.onDraw(); pass.dispose(); input.dispose(); f.close(); }
  });

  it("does not submit a P3 output draw when its distinct coverage texture is disposed during encoding", async () => {
    const f = await fixture();
    const input = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    const coverage = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    const pass = new OutputPass(f.device);
    let disposedDuringDraw = false;
    try {
      f.onDraw((draw) => {
        if (draw.descriptor.colorAttachments?.[0]?.view === f.view) {
          disposedDuringDraw = true;
          coverage.colorTexture.dispose();
        }
      });
      f.device.beginFrame(4, 4);
      expect(() => pass.execute(input, coverage, { ...options, backgroundCoverage: true, outputColorSpace: "display-p3", alphaMode: "opaque" }, "canvas")).toThrow();
      expect(disposedDuringDraw).toBe(true);
      expect(canvasDraws(f)).toHaveLength(0);
      expect(f.device.captureState().get("canvasSubmissions")).toBe(0);
      f.device.endFrame();
    } finally { f.onDraw(); pass.dispose(); input.dispose(); coverage.dispose(); f.close(); }
  });

  it("applies the submitted native tone shader's P3 matrix and transfer to independent reference values", async () => {
    const f = await fixture(), r = rendererFixture(f);
    const post = { ...r.source, postprocess: { v2: true, targetFormat: "rgba16f",
      toneMapping: { operator: "linear", exposure: 1, whitePoint: 1 },
      pipeline: { outputColorSpace: "display-p3" } } } as const;
    try {
      r.renderer.render(post, r.camera);
      const tone = f.submitted.find((pass) => pass.draws > 0 && entry(pass) === "fs_tone")!;
      const shader = fragment(tone);
      const main = shader.slice(shader.indexOf("@fragment fn fs_tone"));
      const gamutIndex = main.indexOf("a3dLinearSrgbToDisplayP3(c)");
      const transferIndex = main.indexOf("if (params.z > 0.5)");
      expect(gamutIndex).toBeGreaterThan(0);
      expect(transferIndex).toBeGreaterThan(gamutIndex);

      // Parse the emitted shader itself rather than calling a shared engine
      // conversion helper. The expected values below were independently
      // computed from the CSS Color 4 D65 XYZ matrices and transfer curve.
      const helper = shader.match(/fn a3dLinearSrgbToDisplayP3\(c:\s*vec3<f32>\)\s*->\s*vec3<f32>\s*\{([^}]*)\}/)?.[1] ?? "";
      const matrix = [...helper.matchAll(/dot\(c,\s*vec3<f32>\(([^)]*)\)\)/g)].map((match) => match[1]!.split(",").map(Number));
      expect(matrix).toHaveLength(3);
      for (const row of matrix) {
        expect(row).toHaveLength(3);
        expect(row.every(Number.isFinite)).toBe(true);
      }
      const encoded = main.match(/select\(\s*([\d.]+)\s*\*\s*pow\(c,\s*vec3<f32>\(1\.0\s*\/\s*([\d.]+)\)\)\s*-\s*vec3<f32>\(([\d.]+)\),\s*c\s*\*\s*([\d.]+),\s*c\s*<=\s*vec3<f32>\(([\d.]+)\)\)/);
      expect(encoded).not.toBeNull();
      const [multiplier, exponent, offset, slope, threshold] = encoded!.slice(1).map(Number);
      expect([multiplier, exponent, offset, slope, threshold]).toEqual([1.055, 2.4, 0.055, 12.92, 0.0031308]);
      const group = tone.group as { readonly bytes: Uint8Array };
      const bytes = group.bytes;
      // Exposure 1, linear operator, transfer enabled, white point 1. This
      // branch preserves extended linear values until after the P3 matrix.
      expect([...new Float32Array(bytes.buffer, bytes.byteOffset, 4)]).toEqual([1, 0, 1, 1]);

      const apply = (rgb: readonly number[]) => {
        const linear = matrix.map((row) => row.reduce((sum, coefficient, index) => sum + coefficient * rgb[index]!, 0));
        const output = linear.map((value) => value <= threshold! ? slope! * value : multiplier! * value ** (1 / exponent!) - offset!);
        return { linear, output };
      };
      const references = [
        { rgb: [0, 0, 0], linear: [0, 0, 0], output: [0, 0, 0] },
        { rgb: [1, 0, 0], linear: [0.822461968714, 0.033194198851, 0.017082630721], output: [0.917487557325, 0.200286807741, 0.138560591211] },
        { rgb: [0, 1, 0], linear: [0.177538031286, 0.966805801149, 0.072397440664], output: [0.458401590191, 0.985264583325, 0.298294707833] },
        { rgb: [0, 0, 1], linear: [0, 0, 0.910519928615], output: [0, 0, 0.959588026676] },
        { rgb: [0.002, 0.002, 0.002], linear: [0.002, 0.002, 0.002], output: [0.02584, 0.02584, 0.02584] },
        { rgb: [0.18, 0.18, 0.18], linear: [0.18, 0.18, 0.18], output: [0.4613561295, 0.4613561295, 0.4613561295] },
        { rgb: [1, 1, 1], linear: [1, 1, 1], output: [1, 1, 1] },
        { rgb: [4, 0.1, 0.01], linear: [3.307601677986, 0.229457375519, 0.084675466237], output: [1.681665970388, 0.516318519493, 0.322124538358] },
        // The input below is a representative result after Reinhard tone
        // mapping an HDR sample, before applying gamut and output transfer.
        { rgb: [0.75, 0.13043478260869565, 0], linear: [0.640003611051, 0.151000753636, 0.022255117475], output: [0.820981907706, 0.424910690231, 0.16111334277] }
      ];
      for (const sample of references) {
        const actual = apply(sample.rgb);
        sample.linear.forEach((value, index) => expect(actual.linear[index]).toBeCloseTo(value, 7));
        sample.output.forEach((value, index) => expect(actual.output[index]).toBeCloseTo(value, 7));
      }
      // Clipping the linear red channel to the sRGB range first would alter
      // the displayed green channel even though that P3 channel is in range.
      expect(apply([4, 0.1, 0.01]).output[1]!).toBeGreaterThan(apply([1, 0.1, 0.01]).output[1]! + 0.1);
    } finally { r.close(); f.close(); }
  });

  it("rejects unsupported P3 native post combinations before submitting any post draw", async () => {
    const f = await fixture();
    const hdr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    const ldr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    const tone = { name: "tone-mapping" as const, options: { operator: "aces" } };
    const defaults = { outputColorSpace: "display-p3", alphaMode: "opaque" } as const;
    const cases: readonly { readonly source: typeof hdr; readonly options: LdrPostprocessPresentationOptions }[] = [
      { source: ldr, options: { passes: [tone], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [tone, tone], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [tone, { name: "fxaa", options: {} }], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [tone, { name: "color-grade", options: {} }], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [tone], nativeEffects: [{ kind: "pixelation", size: 2 }], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [{ name: "tone-mapping", options: { operator: "aces", outputColorSpace: "srgb" } }], toneMappingDefaults: defaults } },
      { source: hdr, options: { passes: [{ name: "tone-mapping", options: { operator: "aces", outputColorSpace: "linear" } }], toneMappingDefaults: defaults } }
    ];
    try {
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      for (const test of cases) {
        expect(() => f.device.presentLdrPostprocess(test.source, test.options)).toThrow();
        expect(f.submitted.filter((pass) => pass.draws > 0)).toHaveLength(0);
      }
      expect(canvasDraws(f)).toHaveLength(0);
    } finally { hdr.dispose(); ldr.dispose(); f.close(); }
  });

  it("uses an explicitly requested 4× scene resolve as the native P3 tone input", async () => {
    const f = await fixture(), r = rendererFixture(f);
    const post = { ...r.source, postprocess: { v2: true, targetFormat: "rgba16f", sampleCount: 4,
      toneMapping: { operator: "aces" }, pipeline: { outputColorSpace: "display-p3" } } } as const;
    try {
      r.renderer.render(post, r.camera);
      expect(f.configuration()).toMatchObject({ colorSpace: "display-p3" });
      expectResolvedSceneToneInput(f);
      expect(canvasDraws(f)).toHaveLength(1);
    } finally { r.close(); f.close(); }
  });

  it("rejects changed or missing multisample resolve resources before post drawing", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false, sampleCount: 4 });
    const foreign = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false, sampleCount: 4 });
    const sourceNative = source as unknown as Record<string, unknown>;
    const foreignNative = foreign as unknown as Record<string, unknown>;
    const keys = ["nativeTexture", "nativeView", "nativeMultisampleTexture", "nativeMultisampleView"] as const;
    const post: LdrPostprocessPresentationOptions = { passes: [{ name: "tone-mapping", options: { operator: "aces" } }],
      toneMappingDefaults: { outputColorSpace: "display-p3", alphaMode: "opaque" } };
    try {
      f.device.beginFrame(4, 4);
      f.device.setRenderTarget(source); f.device.clear([0.2, 0.3, 0.4, 1]); f.device.setRenderTarget(null);
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      for (const key of keys) {
        const original = sourceNative[key];
        expect(original).toBeTruthy();
        expect(foreignNative[key]).toBeTruthy();
        for (const changed of [null, foreignNative[key]]) {
          try {
            sourceNative[key] = changed;
            expect(() => f.device.presentLdrPostprocess(source, post)).toThrow();
            expect(f.submitted.filter((pass) => pass.draws > 0)).toHaveLength(0);
          } finally { sourceNative[key] = original; }
        }
      }
      // The untouched, already-resolved source remains usable after all
      // rejected mutations; the guard must not reject every 4× target.
      f.device.presentLdrPostprocess(source, post);
      expect(f.submitted.filter((pass) => entry(pass) === "fs_tone" && pass.draws > 0)).toHaveLength(1);
      expect(canvasDraws(f)).toHaveLength(1);
      f.device.endFrame();
    } finally { source.dispose(); foreign.dispose(); f.close(); }
  });

  it.each([false, true])("routes a P3 postprocessed frame and restores sRGB for a direct frame (async=%s)", async (asynchronous) => {
    const f = await fixture(), r = rendererFixture(f);
    const present = vi.spyOn(f.device, "presentLdrPostprocess");
    const post = { ...r.source, postprocess: { v2: true, targetFormat: "rgba16f", toneMapping: { operator: "aces" },
      pipeline: { outputColorSpace: "display-p3" } } } as const;
    try {
      if (asynchronous) await r.renderer.renderAsync(post, r.camera); else r.renderer.render(post, r.camera);
      expect(present).toHaveBeenCalledOnce();
      expect(present.mock.calls[0]![1].toneMappingDefaults).toMatchObject({ outputColorSpace: "display-p3" });
      expect(f.configuration()).toMatchObject({ colorSpace: "display-p3" });
      expectResolvedSceneToneInput(f);
      const tone = f.submitted.filter((pass) => pass.draws > 0 && entry(pass) === "fs_tone");
      expect(tone).toHaveLength(1);
      const toneSource = fragment(tone[0]!);
      const gamut = toneSource.indexOf("a3dLinearSrgbToDisplayP3(c)");
      expect(gamut).toBeGreaterThanOrEqual(0);
      expect(toneSource.indexOf("pow(", gamut)).toBeGreaterThan(gamut);
      expect(toneSource.match(/a3dLinearSrgbToDisplayP3\(c\)/g)).toHaveLength(1);
      const firstCanvasDraw = canvasDraws(f).at(-1)!;
      expect(entry(firstCanvasDraw)).toBe("fs_copy");
      expect(fragment(firstCanvasDraw)).not.toContain("a3dLinearSrgbToDisplayP3");
      expect(fragment(firstCanvasDraw)).not.toContain("pow(");
      const group = firstCanvasDraw.group as { readonly bytes: Uint8Array };
      const bytes = group.bytes;
      expect([...new Float32Array(bytes.buffer, bytes.byteOffset, 4)].slice(2)).toEqual([0, 1]);
      expect(f.submissionSpaces.find((item) => item.pass === firstCanvasDraw)?.colorSpace).toBe("display-p3");

      if (asynchronous) await r.renderer.renderAsync(r.source, r.camera); else r.renderer.render(r.source, r.camera);
      expect(f.configuration()).toMatchObject({ colorSpace: "srgb" });
      expect(f.device.getOutputColorSpaceNegotiation().active).toBe("srgb");
      const nextCanvasDraw = canvasDraws(f).at(-1)!;
      expect(nextCanvasDraw).not.toBe(firstCanvasDraw);
      expect(f.submissionSpaces.find((item) => item.pass === nextCanvasDraw)?.colorSpace).toBe("srgb");

      // A no-pass post frame also copies sRGB-encoded output and must not
      // inherit the canvas configuration of an earlier wide-gamut frame.
      if (asynchronous) await r.renderer.renderAsync(post, r.camera); else r.renderer.render(post, r.camera);
      expect(f.configuration()).toMatchObject({ colorSpace: "display-p3" });
      const plainPost = { ...r.source, postprocess: { v2: true, toneMapping: false } } as const;
      const previousSubmissions = f.submitted.length;
      if (asynchronous) await r.renderer.renderAsync(plainPost, r.camera); else r.renderer.render(plainPost, r.camera);
      expect(f.configuration()).toMatchObject({ colorSpace: "srgb" });
      expect(f.submissionSpaces.find((item) => item.pass === canvasDraws(f).at(-1))?.colorSpace).toBe("srgb");
      const frameDraws = f.submitted.slice(previousSubmissions).filter((item) => item.draws > 0);
      const tonePasses = frameDraws.filter((item) => entry(item) === "fs_tone");
      const copyPasses = frameDraws.filter((item) => entry(item) === "fs_copy");
      expect(tonePasses).toHaveLength(1);
      expect(copyPasses).toHaveLength(1);
      expect(frameDraws.indexOf(tonePasses[0]!)).toBeLessThan(frameDraws.indexOf(copyPasses[0]!));
      const toneGroup = tonePasses[0]!.group as { readonly bytes: Uint8Array };
      expect([...new Float32Array(toneGroup.bytes.buffer, toneGroup.bytes.byteOffset, 4)]).toEqual([1, 0, 1, 1]);
      expect(fragment(tonePasses[0]!)).toContain("if (params.z > 0.5)");
      expect(fragment(copyPasses[0]!)).not.toContain("pow(");
      expect(fragment(copyPasses[0]!)).not.toContain("a3dLinearSrgbToDisplayP3");
    } finally { present.mockRestore(); r.close(); f.close(); }
  });

  it("passes the actual sRGB fallback into the post chain when P3 configuration is ignored", async () => {
    const f = await fixture("ignore"), r = rendererFixture(f);
    const present = vi.spyOn(f.device, "presentLdrPostprocess");
    const post = { ...r.source, postprocess: { v2: true, targetFormat: "rgba16f", toneMapping: { operator: "aces" },
      pipeline: { outputColorSpace: "display-p3" } } } as const;
    try {
      r.renderer.render(post, r.camera);
      expect(present).toHaveBeenCalledOnce();
      expect(present.mock.calls[0]![1].toneMappingDefaults).toMatchObject({ outputColorSpace: "srgb" });
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
      expect(f.configuration()).toMatchObject({ colorSpace: "srgb" });
      const tone = f.submitted.find((pass) => pass.draws > 0 && entry(pass) === "fs_tone")!;
      expect(fragment(tone)).not.toContain("a3dLinearSrgbToDisplayP3");
      expect(f.submissionSpaces.find((item) => item.pass === canvasDraws(f).at(-1))?.colorSpace).toBe("srgb");
    } finally { present.mockRestore(); r.close(); f.close(); }
  });

  it("does not submit native P3 post output after canvas reconfiguration during encoding", async () => {
    const f = await fixture(), r = rendererFixture(f);
    const post = { ...r.source, postprocess: { v2: true, targetFormat: "rgba16f", toneMapping: { operator: "aces" },
      pipeline: { outputColorSpace: "display-p3" } } } as const;
    try {
      f.onDraw((draw) => {
        if (draw.descriptor.colorAttachments?.[0]?.view === f.view) {
          f.setConfiguration({ device: f.native, format: "bgra8unorm", alphaMode: "opaque", colorSpace: "srgb" });
        }
      });
      expect(() => r.renderer.render(post, r.camera)).toThrow();
      expect(canvasDraws(f)).toHaveLength(0);
    } finally { f.onDraw(); r.close(); f.close(); }
  });

  it.each([false, true])("encodes linear sRGB before a display-space native effect (async=%s)", async (asynchronous) => {
    const f = await fixture(), r = rendererFixture(f);
    const post = { ...r.source, postprocess: { v2: true, toneMapping: false,
      pipeline: { alphaMode: "opaque", nativeEffects: [{ kind: "pixelation", size: 2 }] } } } as const;
    try {
      if (asynchronous) await r.renderer.renderAsync(post, r.camera); else r.renderer.render(post, r.camera);
      const draws = f.submitted.filter((pass) => pass.draws > 0);
      const tones = draws.filter((pass) => entry(pass) === "fs_tone");
      const effects = draws.filter((pass) => entry(pass) === "nativeEffect");
      const copies = draws.filter((pass) => entry(pass) === "fs_copy");
      expect(tones).toHaveLength(1);
      expect(effects).toHaveLength(1);
      expect(copies.length).toBeGreaterThan(0);
      expect(draws.indexOf(tones[0]!)).toBeLessThan(draws.indexOf(effects[0]!));
      expect(draws.indexOf(effects[0]!)).toBeLessThan(draws.indexOf(copies.at(-1)!));
      const toneGroup = tones[0]!.group as { readonly bytes: Uint8Array };
      expect([...new Float32Array(toneGroup.bytes.buffer, toneGroup.bytes.byteOffset, 4)]).toEqual([1, 0, 1, 1]);
      expect(fragment(tones[0]!)).toContain("if (params.z > 0.5)");
      for (const copy of copies) {
        expect(fragment(copy)).not.toContain("pow(");
        expect(fragment(copy)).not.toContain("a3dLinearSrgbToDisplayP3");
      }
      expect(canvasDraws(f).at(-1)).toBe(copies.at(-1));
      expect(f.configuration()).toMatchObject({ colorSpace: "srgb" });
    } finally { r.close(); f.close(); }
  });

  it.each([
    // A v2 frame's bloom runs the WebGL2 v2 pyramid stages (prefilter, downsample/blur mips, level-0 sum, composite).
    { stage: "webgpu-bloom-v2-prefilter-pass", source: "renderer-forward-color", earlier: [] },
    { stage: "webgpu-bloom-v2-down0-pass", source: "a3d-webgpu-bloom-v2-extract", earlier: ["webgpu-bloom-v2-prefilter-pass"] },
    { stage: "webgpu-bloom-v2-composite-pass", source: "a3d-webgpu-bloom-v2-sum", earlier: ["webgpu-bloom-v2-prefilter-pass", "webgpu-bloom-v2-accumulate-pass"] }
  ])("does not submit a P3 bloom stage when its $source input is disposed during encoding", async ({ stage, source, earlier }) => {
    const f = await fixture(), r = rendererFixture(f);
    const targets: RenderTarget[] = [];
    const create = f.device.createRenderTarget.bind(f.device);
    const created = vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = create(descriptor); targets.push(target); return target;
    });
    const post = { ...r.source, postprocess: { v2: true, targetFormat: "rgba16f", bloom: true,
      toneMapping: { operator: "aces" }, pipeline: { outputColorSpace: "display-p3" } } } as const;
    let attempted: Pass | undefined;
    let victim: RenderTarget | undefined;
    try {
      f.onDraw((draw) => {
        if (draw.descriptor.label !== stage) return;
        attempted = draw;
        victim = targets.find((target) => target.label === source);
        victim?.dispose();
      });
      expect(() => r.renderer.render(post, r.camera)).toThrow();
      expect(attempted).toBeDefined();
      expect(victim?.disposed).toBe(true);
      expect(f.submitted).not.toContain(attempted);
      for (const label of earlier) expect(f.submitted.some((draw) => draw.descriptor.label === label)).toBe(true);
      expect(canvasDraws(f)).toHaveLength(0);
    } finally { f.onDraw(); created.mockRestore(); r.close(); f.close(); }
  });

  it("keeps a P3 bloom source alive through reentrant submission until the completion fence", async () => {
    const f = await fixture("accept", "opaque", true);
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false, sampleCount: 1 });
    let disposedDuringSubmit = false;
    let destroyedDuringSubmit = -1;
    try {
      f.device.beginFrame(4, 4);
      f.device.setRenderTarget(source); f.device.clear([0.2, 0.3, 0.4, 1]); f.device.setRenderTarget(null);
      const nativeSource = f.device.getNativeTexture(source.colorTexture) as unknown as { readonly destroyed: number };
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      f.onSubmit((passes) => {
        if (disposedDuringSubmit || !passes.some((pass) => pass.descriptor.label === "webgpu-bloom-bright-pass")) return;
        disposedDuringSubmit = true;
        source.dispose();
        destroyedDuringSubmit = nativeSource.destroyed;
      });
      const firstEvent = f.events.length;
      expect(() => f.device.presentLdrPostprocess(source, { passes: [
        { name: "bloom", options: { quality: "performance" } }, { name: "tone-mapping", options: { operator: "aces" } }
      ], toneMappingDefaults: { outputColorSpace: "display-p3", alphaMode: "opaque" } })).toThrow();
      expect(disposedDuringSubmit).toBe(true);
      expect(destroyedDuringSubmit).toBe(0);
      expect(f.submitted.some((pass) => pass.descriptor.label === "webgpu-bloom-bright-pass")).toBe(true);
      expect(nativeSource.destroyed).toBe(0);
      const events = f.events.slice(firstEvent);
      const end = events.findIndex((event) => event === "submit-end:webgpu-bloom-bright-pass");
      expect(end).toBeGreaterThanOrEqual(0);
      expect(events).not.toContain("fence-during-submit");
      expect(events.findIndex((event, index) => index > end && event === "fence-after-submit")).toBeGreaterThan(end);
      await f.finishFences();
      expect(nativeSource.destroyed).toBe(1);
      f.device.endFrame();
    } finally { f.onSubmit(); source.dispose(); await f.finishFences(); f.close(); await f.finishFences(); }
  });

  it.each([false, true])("keeps the device-issued DoF frame in the P3 post path (async=%s)", async (asynchronous) => {
    const f = await fixture(), r = rendererFixture(f);
    const present = vi.spyOn(f.device, "presentLdrPostprocess");
    const source = { ...r.source, postprocess: { v2: true, toneMapping: false,
      pipeline: { outputColorSpace: "display-p3", dof: { focusDistance: 3 }, antiAliasing: "off", toneMapping: "none", exposure: 1,
        depthRange: { near: 1, far: 11, projection: "perspective" } } } } as const;
    try {
      const diagnostics = asynchronous ? await r.renderer.renderAsync(source, r.camera) : r.renderer.render(source, r.camera);
      expect(diagnostics.nativeDepthOfField).toEqual({ requested: true, depthPreparation: "submitted", effect: "submitted", pixelValidation: "not-established" });
      expect(present).toHaveBeenCalledOnce();
      expect(present.mock.calls[0]![1]).toMatchObject({ toneMappingDefaults: { outputColorSpace: "display-p3" },
        nativeDepthOfField: { options: { focusDistance: 3 } } });
      const names = f.submitted.filter((pass) => pass.draws > 0).map(entry);
      const depth = names.indexOf("fs_linear_depth");
      expect(depth).toBeGreaterThanOrEqual(0);
      expect(names.slice(depth, depth + 7)).toEqual(["fs_linear_depth", "fs_dof_prefilter", "fs_dof_prefilter_coc", "fs_dof_near_tile",
        "fs_dof_gather", "fs_dof_gather_influence", "fs_dof_composite"]);
      expect(f.configuration()).toMatchObject({ colorSpace: "display-p3" });
      const finalCanvasDraw = canvasDraws(f).at(-1)!;
      expect(f.submissionSpaces.find((item) => item.pass === finalCanvasDraw)?.colorSpace).toBe("display-p3");
    } finally { present.mockRestore(); r.close(); f.close(); }
  });
});

