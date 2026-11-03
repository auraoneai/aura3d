import { RenderDeviceError } from "../RenderDevice";
import { DFG_LUT_SIZE } from "../program/DFGLutData";
import { deferredProbeWgsl, packDeferredProbe } from "./DeferredProbe";
import { PHYSICAL_LIGHTING_WGSL } from "./PhysicalLighting.wgsl";
import { FULLSCREEN_VERTEX, NATIVE_SHARED_WGSL, NATIVE_VERTEX_LAYOUT, NativeDrawingOwner, NativeForwardPipeline, prepareNativeDrawing, type NativeDeferredAttachments, type NativeDrawingBuffer, type NativeDrawingDiagnostics, type NativeDrawingFrame, type NativeDrawingOptions, type NativeDrawingRenderPipeline, type NativeDrawingTexture } from "./DeferredPipeline";

const DEFER_PIPELINE_CREATION = Symbol("visibility-pipeline-warmup");
type DeferredVisibilityOptions = NativeDrawingOptions & { readonly [DEFER_PIPELINE_CREATION]?: true };

/**
 * Rasterizes per-triangle IDs and interpolated normals, then resolves the
 * triangle's material in a fullscreen pass. IDs and storage sizes are checked
 * before any submission; transparent and textured content must use forward.
 */
export class VisibilityBufferPipeline extends NativeDrawingOwner {
  private fallback?: NativeForwardPipeline;
  private readonly fallbackReason?: string;
  private geometryPipeline?: NativeDrawingRenderPipeline;
  private resolvePipeline?: NativeDrawingRenderPipeline;
  private physicalGeometry32?: NativeDrawingRenderPipeline;
  private physicalGeometryStencil?: NativeDrawingRenderPipeline;
  private physicalResolve?: NativeDrawingRenderPipeline;
  constructor(device: unknown, options: NativeDrawingOptions) {
    super(device, options);
    const attachments = this.device.limits?.maxColorAttachments ?? 4;
    const bytes = this.device.limits?.maxColorAttachmentBytesPerSample ?? 32;
    const storageBuffers = this.device.limits?.maxStorageBuffersPerShaderStage ?? 8;
    if (attachments < 2 || bytes < 16 || storageBuffers < 2) {
      this.fallbackReason = `visibility requires 2 color attachments, 16 bytes/sample and 2 fragment storage buffers (device: ${attachments}, ${bytes}, ${storageBuffers})`;
      if (!options.allowFallback) throw new RenderDeviceError(this.fallbackReason, "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "limits" });
      if (!(options as DeferredVisibilityOptions)[DEFER_PIPELINE_CREATION]) this.fallback = new NativeForwardPipeline(device, options);
      return;
    }
    if ((options as DeferredVisibilityOptions)[DEFER_PIPELINE_CREATION]) return;
    this.geometryPipeline = this.device.createRenderPipeline(this.geometryDescriptor());
    this.resolvePipeline = this.device.createRenderPipeline(this.resolveDescriptor());
  }
  private geometryDescriptor(): Record<string, unknown> {
    const geometry = this.device.createShaderModule({ code: `${NATIVE_SHARED_WGSL}\nstruct Visibility { @location(0) id: u32, @location(1) normal: vec4<f32> }; @fragment fn visibilityMain(input: Out) -> Visibility { var out: Visibility; out.id = input.triangle + 1u; out.normal = vec4<f32>(input.normal, 1.0); return out; }` });
    return { label: "aura-visibility-geometry", layout: "auto", vertex: { module: geometry, entryPoint: "vertexMain", buffers: NATIVE_VERTEX_LAYOUT }, fragment: { module: geometry, entryPoint: "visibilityMain", targets: [{ format: "r32uint" }, { format: "rgba16float" }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less-equal" } };
  }
  private resolveDescriptor(): Record<string, unknown> {
    const resolve = this.device.createShaderModule({ code: `${NATIVE_SHARED_WGSL}\n@group(0) @binding(2) var<storage, read> triangleMaterials: array<u32>; @group(0) @binding(3) var visibility: texture_2d<u32>; @group(0) @binding(4) var normals: texture_2d<f32>; ${FULLSCREEN_VERTEX}\n@fragment fn resolveMain(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let xy = vec2<i32>(p.xy); let id = textureLoad(visibility, xy, 0).r; if (id == 0u) { return frame.clear; } let material = materials[triangleMaterials[id - 1u]]; let n = textureLoad(normals, xy, 0).xyz; return vec4<f32>(illuminate(material.base.rgb, material.emissive, n, frame.direction.xyz, frame.light.xyz, frame.ambient.xyz), 1.0); }` });
    return { label: "aura-visibility-resolve", layout: "auto", vertex: { module: resolve, entryPoint: "fullscreen" }, fragment: { module: resolve, entryPoint: "resolveMain", targets: [{ format: this.outputFormat }] }, primitive: { topology: "triangle-list" } };
  }
  private physicalGeometryDescriptor(depthFormat: "depth32float" | "depth24plus-stencil8"): Record<string, unknown> {
    // Preserve the deferred geometry pass's normal-derivative roughness AA,
    // evaluated before primitives are mixed in the fullscreen resolve.
    const geometry = this.device.createShaderModule({ label: "aura-visibility-physical-geometry", code: `${NATIVE_SHARED_WGSL}
struct Visibility { @location(0) id: u32, @location(1) normalRoughness: vec4<f32> };
@fragment fn visibilityMain(input: Out) -> Visibility {
  let m = materials[input.material]; let n = normalize(input.normal);
  let grad = max(abs(dpdx(n)), abs(dpdy(n))); let aa = max(grad.x, max(grad.y, grad.z));
  var out: Visibility; out.id = input.triangle + 1u;
  out.normalRoughness = vec4<f32>(input.normal, 1.0 + clamp(m.emissive.w - 3.0 + aa, 0.0525, 1.0));
  return out;
}` });
    return { label: "aura-visibility-physical-geometry", layout: "auto", vertex: { module: geometry, entryPoint: "vertexMain", buffers: NATIVE_VERTEX_LAYOUT }, fragment: { module: geometry, entryPoint: "visibilityMain", targets: [{ format: "r32uint" }, { format: "rgba16float" }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less-equal" } };
  }
  private physicalResolveDescriptor(): Record<string, unknown> {
    const resolve = this.device.createShaderModule({ label: "aura-visibility-physical-probe-resolve", code: visibilityPhysicalResolveWgsl() });
    return { label: "aura-visibility-physical-probe-resolve", layout: "auto", vertex: { module: resolve, entryPoint: "fullscreen" }, fragment: { module: resolve, entryPoint: "resolveMain", targets: [{ format: this.outputFormat }] }, primitive: { topology: "triangle-list" } };
  }
  /** Warm the exact geometry/resolve pipelines or the capability fallback, without a frame. */
  static async createWarmed(device: unknown, options: NativeDrawingOptions, signal?: AbortSignal, shared?: { readonly physical: true }): Promise<VisibilityBufferPipeline> {
    const owner = new VisibilityBufferPipeline(device, { ...options, [DEFER_PIPELINE_CREATION]: true } as DeferredVisibilityOptions);
    try {
      owner.assertWarmupActive(signal);
      if (owner.fallbackReason) {
        owner.fallback = await NativeForwardPipeline.createWarmed(device, options, signal);
      } else {
        owner.geometryPipeline = await owner.warmRenderPipeline(owner.geometryDescriptor(), signal);
        owner.assertWarmupActive(signal);
        owner.resolvePipeline = await owner.warmRenderPipeline(owner.resolveDescriptor(), signal);
        if (shared) {
          owner.assertPhysicalLimits();
          owner.assertWarmupActive(signal);
          owner.physicalGeometry32 = await owner.warmRenderPipeline(owner.physicalGeometryDescriptor("depth32float"), signal);
          owner.assertWarmupActive(signal);
          owner.physicalGeometryStencil = await owner.warmRenderPipeline(owner.physicalGeometryDescriptor("depth24plus-stencil8"), signal);
          owner.assertWarmupActive(signal);
          owner.physicalResolve = await owner.warmRenderPipeline(owner.physicalResolveDescriptor(), signal);
        }
      }
      owner.assertWarmupActive(signal);
      return owner;
    } catch (error) {
      owner.dispose();
      throw error;
    }
  }
  render(frame: NativeDrawingFrame): NativeDrawingDiagnostics {
    this.beginNativeFrame();
    try {
    if (this.fallback) {
      if (frame.deferredAttachments) throw new RenderDeviceError("The native forward fallback cannot preserve shared visibility attachments", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "deferredAttachments" });
      const result = this.fallback.render(frame); return { requested: "visibility", active: "forward", fallbackReason: this.fallbackReason, drawCalls: result.draws, triangles: result.triangles };
    }
    if (frame.deferredAttachments) return this.renderSharedPhysical(frame, frame.deferredAttachments);
    const prepared = prepareNativeDrawing(frame.scene, this.device.limits);
    const buffers = this.createFrameBuffers(frame, prepared);
    const textures: NativeDrawingTexture[] = [];
    const submission = { attempted: false };
    try {
      const make = (format: string, usage: number) => { const texture = this.device.createTexture({ size: [frame.surface.width, frame.surface.height, 1], format, usage }); textures.push(texture); return texture.createView(); };
      const ids = make("r32uint", 0x10 | 0x04);
      const normals = make("rgba16float", 0x10 | 0x04);
      const depth = make("depth32float", 0x10);
      const encoder = this.device.createCommandEncoder({ label: "aura-visibility" });
      const geometry = encoder.beginRenderPass({ colorAttachments: [ids, normals].map(view => ({ view, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" })), depthStencilAttachment: { view: depth, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
      geometry.setPipeline(this.geometryPipeline!);
      // Only the frame uniform is statically used in the visibility raster pass.
      geometry.setBindGroup(0, this.device.createBindGroup({ layout: this.geometryPipeline!.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buffers.uniforms } }] }));
      geometry.setVertexBuffer(0, buffers.vertices);
      if (prepared.triangleCount) geometry.draw(prepared.triangleCount * 3);
      geometry.end();
      const resolve = encoder.beginRenderPass({ colorAttachments: [{ view: frame.surface.view, clearValue: frame.clearColor ?? [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }] });
      resolve.setPipeline(this.resolvePipeline!);
      resolve.setBindGroup(0, this.device.createBindGroup({ layout: this.resolvePipeline!.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: buffers.materials } },
        { binding: 2, resource: { buffer: buffers.triangleMaterials } }, { binding: 3, resource: ids }, { binding: 4, resource: normals }
      ] }));
      resolve.draw(3); resolve.end();
      this.submit(encoder, buffers, textures, submission);
      return { requested: "visibility", active: "visibility", drawCalls: (prepared.triangleCount ? 1 : 0) + 1, triangles: prepared.triangleCount };
    } catch (error) {
      if (submission.attempted) throw this.submissionFailure(error);
      throw this.cleanupFailedFrame(error, [...buffers.all, ...textures], buffers.written);
    }
    } finally { this.endNativeFrame(); }
  }
  private assertPhysicalLimits(): void {
    const limits = this.device.limits;
    // The shared frame is 56 float32s; the packed probe is smaller.
    const frameUniformBytes = 56 * Float32Array.BYTES_PER_ELEMENT;
    if ((limits?.maxStorageBuffersPerShaderStage ?? 8) < 3 ||
        (limits?.maxSampledTexturesPerShaderStage ?? 16) < 4 ||
        (limits?.maxBindingsPerBindGroup ?? 1000) < 10 ||
        (limits?.maxSamplersPerShaderStage ?? 16) < 1 ||
        (limits?.maxUniformBuffersPerShaderStage ?? 12) < 2 ||
        (limits?.maxUniformBufferBindingSize ?? 65_536) < frameUniformBytes ||
        (limits?.maxBufferSize ?? 268_435_456) < frameUniformBytes) {
      throw new RenderDeviceError("Physical visibility drawing exceeds storage, texture, uniform or binding limits", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "physical" });
    }
  }
  private renderSharedPhysical(frame: NativeDrawingFrame, shared: NativeDeferredAttachments): NativeDrawingDiagnostics {
    validateVisibilityAttachments(shared, frame, this.outputFormat);
    this.assertPhysicalLimits();
    const prepared = prepareNativeDrawing(frame.scene, this.device.limits, true);
    // Inspect the prepared snapshot rather than mutable source materials.
    // Its emissive.w is 3 + roughness only for physical materials.
    if (!prepared.usesPhysical || prepared.materials.some((value, index) => index % 8 === 7 && value < 3) || !frame.physical?.probe) {
      throw new RenderDeviceError("Shared visibility requires exclusively physical materials and a global probe", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "physical" });
    }
    const probe = packDeferredProbe(frame.physical.probe, this.device);
    const stencil = shared.depthFormat === "depth24plus-stencil8";
    if (stencil && !this.physicalGeometryStencil) this.physicalGeometryStencil = this.device.createRenderPipeline(this.physicalGeometryDescriptor("depth24plus-stencil8"));
    if (!stencil && !this.physicalGeometry32) this.physicalGeometry32 = this.device.createRenderPipeline(this.physicalGeometryDescriptor("depth32float"));
    if (!this.physicalResolve) this.physicalResolve = this.device.createRenderPipeline(this.physicalResolveDescriptor());
    const geometryPipeline = stencil ? this.physicalGeometryStencil! : this.physicalGeometry32!;
    const resolvePipeline = this.physicalResolve;
    const buffers = this.createFrameBuffers(frame, prepared);
    const owned: (NativeDrawingTexture | NativeDrawingBuffer)[] = [];
    const written: NativeDrawingBuffer[] = [...buffers.written];
    const submission = { attempted: false };
    try {
      const probeBuffer = this.device.createBuffer({ label: "aura-visibility-probe", size: probe.uniforms.byteLength, usage: 0x40 | 0x08 });
      owned.push(probeBuffer); written.push(probeBuffer);
      this.device.queue.writeBuffer(probeBuffer, 0, probe.uniforms);
      const make = (format: string) => {
        const texture = this.device.createTexture({ size: [frame.surface.width, frame.surface.height, 1], format, usage: 0x10 | 0x04 });
        owned.push(texture); return texture.createView();
      };
      const ids = make("r32uint"), normals = make("rgba16float");
      const encoder = this.device.createCommandEncoder({ label: "aura-visibility-physical" });
      const geometry = encoder.beginRenderPass({
        colorAttachments: [ids, normals].map(view => ({ view, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" })),
        depthStencilAttachment: { view: shared.depthAttachmentView, depthClearValue: shared.depthClearValue, depthLoadOp: shared.loadOp, depthStoreOp: "store",
          ...(stencil ? { stencilClearValue: shared.stencilClearValue, stencilLoadOp: shared.loadOp, stencilStoreOp: "store" } : {}) }
      });
      geometry.setPipeline(geometryPipeline);
      geometry.setBindGroup(0, this.device.createBindGroup({ layout: geometryPipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: buffers.materials } }
      ] }));
      geometry.setVertexBuffer(0, buffers.vertices);
      if (prepared.triangleCount) geometry.draw(prepared.triangleCount * 3);
      geometry.end();
      const resolve = encoder.beginRenderPass({ colorAttachments: [{ view: shared.colorView, loadOp: shared.loadOp, clearValue: shared.clearColor, storeOp: "store" }] });
      resolve.setPipeline(resolvePipeline);
      resolve.setBindGroup(0, this.device.createBindGroup({ layout: resolvePipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: buffers.materials } },
        { binding: 2, resource: { buffer: buffers.triangleMaterials } }, { binding: 3, resource: ids },
        { binding: 4, resource: normals }, { binding: 5, resource: shared.depthSampleView },
        { binding: 6, resource: { buffer: buffers.dfg! } }, { binding: 7, resource: { buffer: probeBuffer } },
        { binding: 8, resource: probe.lease.sampler }, { binding: 9, resource: probe.lease.view }
      ] }));
      resolve.draw(3); resolve.end();
      this.submit(encoder, buffers, owned, submission, commands => shared.submit(commands, [probe.lease.resource]));
      return { requested: "visibility", active: "visibility", drawCalls: (prepared.triangleCount ? 1 : 0) + 1, triangles: prepared.triangleCount };
    } catch (error) {
      if (submission.attempted) throw this.submissionFailure(error);
      throw this.cleanupFailedFrame(error, [...buffers.all, ...owned], written);
    }
  }
  override visitNativeRetirementOwners(visit: (owner: NativeDrawingOwner) => void): void {
    super.visitNativeRetirementOwners(visit);
    this.fallback?.visitNativeRetirementOwners(visit);
  }
  protected override disposeOwnedPipelines(first: boolean): void {
    const child = this.fallback;
    if (child && !child.nativeRetirementComplete && (first || child.retirementDestructionErrors.length || child.nativeRetirementFenceFailure)) child.dispose();
  }
  override dispose(): void { super.dispose(); }
}

/** The surface provider owns and fences these views; never destroy them here. */
function validateVisibilityAttachments(shared: NativeDeferredAttachments, frame: NativeDrawingFrame, format: string): void {
  if (!shared.colorView || !shared.depthAttachmentView || !shared.depthSampleView ||
      shared.colorView !== frame.surface.view || shared.width !== frame.surface.width || shared.height !== frame.surface.height ||
      shared.colorFormat !== format || format !== "rgba16float" || shared.sampleCount !== 1 || shared.resolveView !== undefined ||
      (shared.loadOp !== "load" && shared.loadOp !== "clear") || typeof shared.submit !== "function" ||
      (shared.depthFormat !== "depth32float" && shared.depthFormat !== "depth24plus-stencil8") ||
      !shared.clearColor || shared.clearColor.length !== 4 || !shared.clearColor.every(Number.isFinite) ||
      shared.depthClearValue !== 1 || !Number.isInteger(shared.stencilClearValue) || shared.stencilClearValue < 0 || shared.stencilClearValue > 0xffffffff) {
    throw new RenderDeviceError("Shared visibility requires matching single-sample rgba16float color and standard depth attachments", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "deferredAttachments" });
  }
}

/**
 * Match the bounded deferred physical/probe resolve, but fetch the material by
 * the rasterized primitive ID. Quantization matches its rgba16float G-buffer.
 */
function visibilityPhysicalResolveWgsl(): string { return `${NATIVE_SHARED_WGSL}
${PHYSICAL_LIGHTING_WGSL}
@group(0) @binding(2) var<storage, read> triangleMaterials: array<u32>;
@group(0) @binding(3) var visibility: texture_2d<u32>;
@group(0) @binding(4) var normals: texture_2d<f32>;
@group(0) @binding(5) var sceneDepth: texture_depth_2d;
@group(0) @binding(6) var<storage, read> dfg: array<vec2<f32>>;
${deferredProbeWgsl({ group: 0, uniformBinding: 7, samplerBinding: 8, textureBinding: 9 })}
${FULLSCREEN_VERTEX}
fn sampleDfg(roughness: f32, ndotv: f32) -> vec2<f32> {
  let p = clamp(vec2<f32>(roughness, ndotv) * ${DFG_LUT_SIZE}.0 - vec2<f32>(0.5), vec2<f32>(0.0), vec2<f32>(${DFG_LUT_SIZE - 1}.0));
  let lo = vec2<u32>(floor(p)); let hi = min(lo + vec2<u32>(1u), vec2<u32>(${DFG_LUT_SIZE - 1}u)); let f = fract(p);
  let a = mix(dfg[lo.y * ${DFG_LUT_SIZE}u + lo.x], dfg[lo.y * ${DFG_LUT_SIZE}u + hi.x], f.x);
  let b = mix(dfg[hi.y * ${DFG_LUT_SIZE}u + lo.x], dfg[hi.y * ${DFG_LUT_SIZE}u + hi.x], f.x);
  return mix(a, b, f.y);
}
@fragment fn resolveMain(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
  let xy = vec2<i32>(p.xy); let id = textureLoad(visibility, xy, 0).r;
  if (id == 0u) { if (frame.viewport.z > 0.5) { discard; } return frame.clear; }
  let m = materials[triangleMaterials[id - 1u]];
  let base = quantizeToF16(m.base); let emissive = quantizeToF16(m.emissive);
  let ndata = textureLoad(normals, xy, 0); let n = normalize(ndata.xyz); let l = frame.direction.xyz;
  let roughness = clamp(ndata.a - 1.0, 0.0525, 1.0); let metallic = clamp(base.a, 0.0, 1.0);
  var material: AuraPhysicalMaterial;
  material.baseColor = base.rgb; material.metalness = metallic; material.roughness = roughness;
  material.ior = 1.5; material.specularIntensity = 1.0; material.specularColorFactor = vec3<f32>(1.0);
  material.diffuseRoughness = 0.0; material.retroreflection = 0.0;
  let ndc = vec3<f32>(p.x / frame.viewport.x * 2.0 - 1.0, 1.0 - p.y / frame.viewport.y * 2.0, textureLoad(sceneDepth, xy, 0) * 2.0 - 1.0);
  let world4 = frame.inverseViewProjection * vec4<f32>(ndc, 1.0); let world = world4.xyz / world4.w;
  let view = normalize(frame.camera.xyz - world);
  var directColor = vec3<f32>(0.0);
  if (any(frame.light.xyz > vec3<f32>(0.0))) {
    let direct = a3dPhysicalDirect(n, view, l, frame.light.xyz, material, sampleDfg(roughness, clamp(dot(n, view), 0.0, 1.0)), sampleDfg(roughness, clamp(dot(n, l), 0.0, 1.0)));
    directColor = direct.diffuse + direct.specular;
  }
  let indirect = a3dDeferredProbeIndirect(n, view, material, sampleDfg(roughness, clamp(dot(n, view), 0.0, 1.0)));
  let ambient = indirect.diffuse + indirect.specular;
  let color = max(directColor + ambient + emissive.rgb, vec3<f32>(0.0));
  var alpha = 1.0;
  if (frame.viewport.w > 0.5) {
    let luma = vec3<f32>(0.2126, 0.7152, 0.0722);
    alpha = 2.0 + clamp(dot(ambient, luma) / max(dot(color, luma), 0.0001), 0.0, 1.0);
  }
  return vec4<f32>(color, alpha);
}`; }
