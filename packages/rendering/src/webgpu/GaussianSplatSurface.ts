import { RenderDeviceError, type RenderTarget } from "../RenderDevice";
import {
  GAUSSIAN_SPLAT_TRANSFER_WGSL,
  type GaussianSplatAlphaAssociation,
  type GaussianSplatColorAdapter,
  type GaussianSplatColorScratch,
  type GaussianSplatTransfer
} from "../GaussianSplatColorComposite";
import type { WebGPUDeviceLike, WebGPURenderPipelineLike, WebGPUTextureLike } from "../WebGPUDevice";
import type { WebGPUResourceInterop } from "./ResourceInterop";

/** Device-owned native surface: the adapter never owns its scene depth. */
export interface WebGPUSplatSurface {
  readonly target: RenderTarget;
  readonly texture: WebGPUTextureLike;
  readonly view: unknown;
  readonly format: "rgba16float" | "rgba32float";
}

/** Scissor rectangle in WebGPU's top-left coordinates, clipped to the target. */
export type WebGPUSplatRegion = readonly [number, number, number, number];

/** Private device operations kept behind the adapter's resource boundary. */
export interface WebGPUSplatSurfaceHost {
  readonly device: WebGPUDeviceLike;
  readonly interop: WebGPUResourceInterop;
  requireScene(target: RenderTarget): WebGPUSplatSurface;
  createScratch(scene: WebGPUSplatSurface): WebGPUSplatSurface;
  prepareScene(scene: WebGPUSplatSurface): void;
  region(scene: WebGPUSplatSurface): WebGPUSplatRegion;
  markWritten(surface: WebGPUSplatSurface): void;
  borrowDepth(scene: WebGPUSplatSurface, scratch: WebGPUSplatSurface, draw: () => void): void;
  recordTransfer(): void;
  onDispose(): void;
}

const VERTEX = `
@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(points[index], 0.0, 1.0);
}`;

class WebGPUSplatScratch implements GaussianSplatColorScratch {
  private retired = false;
  ready = false;
  constructor(
    readonly sceneTarget: RenderTarget,
    readonly surface: WebGPUSplatSurface,
    readonly byteLength: number,
    private readonly forget: (scratch: WebGPUSplatScratch) => void,
    private readonly assertCanDispose: () => void
  ) {}
  get disposed(): boolean { return this.retired || this.surface.target.disposed; }
  dispose(): void {
    if (this.retired) return;
    this.assertCanDispose();
    this.retired = true;
    this.surface.target.dispose();
    this.forget(this);
  }
}

/**
 * Uses exact textureLoad at each output pixel. WebGPU's RGBA32F scratch keeps
 * encoded HDR values unbounded by normalized attachment formats; its blending
 * feature is validated before allocation. The current renderer's multisample
 * texture cannot be sampled per sample, so MSAA is rejected by the host.
 */
export class WebGPUGaussianSplatColorAdapter implements GaussianSplatColorAdapter {
  private readonly scratches = new Set<WebGPUSplatScratch>();
  private readonly pipelines = new Map<string, { readonly pipeline: WebGPURenderPipelineLike; readonly layout: unknown }>();
  private retired = false;
  private drawing = false;

  constructor(private readonly host: WebGPUSplatSurfaceHost) {}

  createScratch(input: RenderTarget): GaussianSplatColorScratch {
    this.assertAlive();
    const scene = this.host.requireScene(input);
    const byteLength = scene.target.width * scene.target.height * 16;
    if (!Number.isSafeInteger(byteLength)) throw new RenderDeviceError("Gaussian splat scratch size is invalid", "GAUSSIAN_SPLAT_SCRATCH_SIZE_INVALID");
    const surface = this.host.createScratch(scene);
    const scratch = new WebGPUSplatScratch(scene.target, surface, byteLength, (resource) => this.scratches.delete(resource), () => {
      if (this.drawing) throw new RenderDeviceError("Cannot dispose a Gaussian splat surface during its draw", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
    });
    this.scratches.add(scratch);
    return scratch;
  }

  transfer(input: RenderTarget, surface: GaussianSplatColorScratch, toScratch: boolean, direction: GaussianSplatTransfer, association: GaussianSplatAlphaAssociation): void {
    const { scene, scratch } = this.requirePair(input, surface);
    if (direction !== "linear-to-srgb" && direction !== "srgb-to-linear") throw new RenderDeviceError("Invalid Gaussian splat transfer direction", "GAUSSIAN_SPLAT_TRANSFER_INVALID");
    if (association !== "premultiplied" && association !== "independent") throw new RenderDeviceError("Invalid Gaussian splat alpha association", "GAUSSIAN_SPLAT_ALPHA_INVALID");
    this.host.prepareScene(scene);
    const region = this.host.region(scene);
    if (!toScratch && !scratch.ready) throw new RenderDeviceError("Gaussian splat scratch has no initialized backdrop", "GAUSSIAN_SPLAT_SCRATCH_INVALID");
    if (toScratch) scratch.ready = false;
    if (region[2] === 0 || region[3] === 0) {
      if (toScratch) scratch.ready = true;
      return;
    }
    const source = toScratch ? scene : scratch.surface;
    const destination = toScratch ? scratch.surface : scene;
    this.host.interop.assertUsable(source.texture);
    this.host.interop.assertUsable(destination.texture);
    const { pipeline, layout } = this.pipeline(destination.format, direction, association);
    const device = this.host.device;
    if (!device.createBindGroup || !device.createCommandEncoder) throw new RenderDeviceError("WebGPU cannot encode Gaussian splat color transfer", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
    const group = device.createBindGroup({ label: "gaussian-splat-color-transfer", layout, entries: [{ binding: 0, resource: source.view }] });
    const encoder = device.createCommandEncoder({ label: "gaussian-splat-color-transfer" });
    const pass = encoder.beginRenderPass({
      label: "gaussian-splat-color-transfer", colorAttachments: [{ view: destination.view, loadOp: "load", storeOp: "store" }]
    });
    if (!pass.setBindGroup || !pass.setScissorRect) {
      pass.end();
      throw new RenderDeviceError("WebGPU cannot bind or clip Gaussian splat color transfer", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
    }
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.setScissorRect(...region);
    pass.draw(3);
    pass.end();
    this.host.interop.submit([encoder.finish()], [
      { resource: source.texture, mode: "read" },
      { resource: destination.texture, mode: "write" }
    ]);
    this.host.markWritten(destination);
    if (toScratch) scratch.ready = true;
    this.host.recordTransfer();
  }

  drawToScratch(input: RenderTarget, surface: GaussianSplatColorScratch, draw: () => void): void {
    const { scene, scratch } = this.requirePair(input, surface);
    if (!scratch.ready) throw new RenderDeviceError("Gaussian splat scratch has no initialized backdrop", "GAUSSIAN_SPLAT_SCRATCH_INVALID");
    const region = this.host.region(scene);
    if (region[2] === 0 || region[3] === 0) return;
    this.drawing = true;
    try { this.host.borrowDepth(scene, scratch.surface, draw); }
    finally { this.drawing = false; }
  }

  dispose(): void {
    if (this.retired) return;
    if (this.drawing) throw new RenderDeviceError("Cannot dispose a Gaussian splat surface during its draw", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
    this.retired = true;
    for (const scratch of [...this.scratches]) scratch.dispose();
    this.pipelines.clear();
    this.host.onDispose();
  }

  private assertAlive(): void {
    if (this.retired) throw new RenderDeviceError("Gaussian splat adapter is disposed", "GAUSSIAN_SPLAT_ADAPTER_DISPOSED");
  }

  private requirePair(input: RenderTarget, surface: GaussianSplatColorScratch): { scene: WebGPUSplatSurface; scratch: WebGPUSplatScratch } {
    this.assertAlive();
    const scene = this.host.requireScene(input);
    if (!(surface instanceof WebGPUSplatScratch) || !this.scratches.has(surface) || surface.disposed || surface.sceneTarget !== scene.target) {
      throw new RenderDeviceError("Gaussian splat scratch is not live for this scene target", "GAUSSIAN_SPLAT_SCRATCH_INVALID");
    }
    return { scene, scratch: surface };
  }

  private pipeline(format: WebGPUSplatSurface["format"], direction: GaussianSplatTransfer, association: GaussianSplatAlphaAssociation): { readonly pipeline: WebGPURenderPipelineLike; readonly layout: unknown } {
    const key = `${format}:${direction}:${association}`;
    const cached = this.pipelines.get(key);
    if (cached) return cached;
    const device = this.host.device;
    if (!device.createShaderModule || !device.createRenderPipeline || !device.createBindGroupLayout || !device.createPipelineLayout) {
      throw new RenderDeviceError("WebGPU cannot compile Gaussian splat color transfer", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
    }
    // float32 textures do not require the optional float32-filterable feature:
    // explicit unfilterable-float layout and textureLoad use no sampler.
    const layout = device.createBindGroupLayout({ label: "gaussian-splat-color-transfer", entries: [{ binding: 0, visibility: 2, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } }] });
    const pipelineLayout = device.createPipelineLayout({ label: "gaussian-splat-color-transfer", bindGroupLayouts: [layout] });
    const module = device.createShaderModule({ label: "gaussian-splat-color-transfer", code: `${VERTEX}
${GAUSSIAN_SPLAT_TRANSFER_WGSL}
@group(0) @binding(0) var source: texture_2d<f32>;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return a3dSplatTransfer(textureLoad(source, vec2i(position.xy), 0), ${direction === "linear-to-srgb"}, ${association === "premultiplied"});
}` });
    const pipeline = device.createRenderPipeline({
      label: "gaussian-splat-color-transfer", layout: pipelineLayout,
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: 1 }
    });
    const result = { pipeline, layout };
    this.pipelines.set(key, result);
    return result;
  }
}
