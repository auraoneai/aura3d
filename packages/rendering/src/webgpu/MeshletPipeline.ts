import { RenderDeviceError } from "../RenderDevice";
import { DeferredPipeline, NATIVE_SHARED_WGSL, NATIVE_VERTEX_LAYOUT, NativeDrawingOwner, NativeForwardPipeline, prepareNativeDrawing, type NativeDrawingBuffer, type NativeDrawingDiagnostics, type NativeDrawingFrame, type NativeDrawingOptions, type NativeDrawingRenderPipeline, type NativeDrawingScene, type NativeDrawingTexture } from "./DeferredPipeline";

export interface MeshletOptions extends NativeDrawingOptions {
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
  readonly maxDrawsPerFrame?: number;
  readonly frustumCulling?: boolean;
}
export interface NativeMeshlet {
  readonly firstTriangle: number;
  readonly triangleCount: number;
  readonly uniqueVertices: number;
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly skipFrustumCulling: boolean;
}

const DEFER_PIPELINE_CREATION = Symbol("meshlet-pipeline-warmup");
type DeferredMeshletOptions = MeshletOptions & { readonly [DEFER_PIPELINE_CREATION]?: true };
type MeshletGeometry = Pick<NativeDrawingScene, "positions" | "indices" | "triangleNoCull">;

/** Build bounded contiguous meshlets, preserving triangle/material order. */
export function buildMeshlets(scene: NativeDrawingScene, options: Pick<MeshletOptions, "maxVertices" | "maxTriangles"> = {}): readonly NativeMeshlet[] {
  return buildValidatedMeshlets(scene, prepareNativeDrawing(scene).triangleCount, options);
}
function buildValidatedMeshlets(scene: MeshletGeometry, triangleCount: number, options: Pick<MeshletOptions, "maxVertices" | "maxTriangles">): readonly NativeMeshlet[] {
  const maxVertices = options.maxVertices ?? 64;
  const maxTriangles = options.maxTriangles ?? 126;
  if (!Number.isInteger(maxVertices) || maxVertices < 3 || maxVertices > 256) invalid("maxVertices", "must be an integer in [3, 256]");
  if (!Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > 256) invalid("maxTriangles", "must be an integer in [1, 256]");
  const result: NativeMeshlet[] = [];
  let firstTriangle = 0;
  let unique = new Set<number>();
  const flush = (endTriangle: number) => {
    if (endTriangle === firstTriangle) return;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let t = firstTriangle; t < endTriangle; t++) for (let corner = 0; corner < 3; corner++) {
      const vertex = scene.indices?.[t * 3 + corner] ?? t * 3 + corner;
      for (let axis = 0; axis < 3; axis++) { const value = scene.positions[vertex * 3 + axis]!; min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value); }
    }
    const center: [number, number, number] = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
    let radius = 0;
    for (let t = firstTriangle; t < endTriangle; t++) for (let corner = 0; corner < 3; corner++) {
      const vertex = scene.indices?.[t * 3 + corner] ?? t * 3 + corner;
      radius = Math.max(radius, Math.hypot(scene.positions[vertex * 3]! - center[0], scene.positions[vertex * 3 + 1]! - center[1], scene.positions[vertex * 3 + 2]! - center[2]));
    }
    result.push({ firstTriangle, triangleCount: endTriangle - firstTriangle, uniqueVertices: unique.size, center, radius, skipFrustumCulling: scene.triangleNoCull?.subarray(firstTriangle, endTriangle).some(Boolean) ?? false });
    firstTriangle = endTriangle;
    unique = new Set<number>();
  };
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ids = [0, 1, 2].map(corner => scene.indices?.[triangle * 3 + corner] ?? triangle * 3 + corner);
    const proposed = new Set([...unique, ...ids]);
    if (triangle > firstTriangle && (triangle - firstTriangle >= maxTriangles || proposed.size > maxVertices)) flush(triangle);
    ids.forEach(id => unique.add(id));
  }
  flush(triangleCount);
  return result;
}

/** Conservative sphere/frustum test using the renderer's OpenGL-style clip depth. */
export function meshletIntersectsFrustum(meshlet: NativeMeshlet, viewProjection: ArrayLike<number>): boolean {
  if (viewProjection.length !== 16 || !Array.from(viewProjection).every(Number.isFinite)) invalid("viewProjection", "must be a finite mat4");
  if (meshlet.skipFrustumCulling) return true;
  const row = (index: number) => [viewProjection[index]!, viewProjection[index + 4]!, viewProjection[index + 8]!, viewProjection[index + 12]!];
  const x = row(0), y = row(1), z = row(2), w = row(3);
  for (const axis of [x, y, z]) for (const sign of [-1, 1]) {
    const plane = w.map((value, index) => value + sign * axis[index]!);
    const length = Math.hypot(plane[0]!, plane[1]!, plane[2]!);
    // A degenerate plane cannot safely cull anything.
    if (length === 0) continue;
    const distance = plane[0]! * meshlet.center[0] + plane[1]! * meshlet.center[1] + plane[2]! * meshlet.center[2] + plane[3]!;
    if (distance < -meshlet.radius * length) return false;
  }
  return true;
}

/**
 * GPU compute culls conservative world-space spheres and writes one indirect
 * draw record per meshlet. Compute and drawing share one command encoder, so
 * WebGPU orders the storage writes before the indirect reads in the render pass.
 */
export class MeshletPipeline extends NativeDrawingOwner {
  private forward?: NativeForwardPipeline;
  private readonly sharedDeferred = new Map<1 | 4, DeferredPipeline>();
  private readonly options: MeshletOptions;
  private computePipeline?: NativeDrawingRenderPipeline;
  private drawPipeline?: NativeDrawingRenderPipeline;
  private readonly fallbackReason?: string;
  constructor(device: unknown, options: MeshletOptions) {
    super(device, options);
    const maxDraws = options.maxDrawsPerFrame ?? 65536;
    if (!Number.isInteger(maxDraws) || maxDraws < 1 || maxDraws > 65536) invalid("maxDrawsPerFrame", "must be an integer in [1, 65536]");
    if (options.maxVertices !== undefined && (!Number.isInteger(options.maxVertices) || options.maxVertices < 3 || options.maxVertices > 256)) invalid("maxVertices", "must be an integer in [3, 256]");
    if (options.maxTriangles !== undefined && (!Number.isInteger(options.maxTriangles) || options.maxTriangles < 1 || options.maxTriangles > 256)) invalid("maxTriangles", "must be an integer in [1, 256]");
    this.options = options;
    const encoder = this.device.createCommandEncoder({ label: "aura-meshlet-capability-probe" });
    if (!this.device.createComputePipeline || !encoder.beginComputePass || (this.device.limits?.maxStorageBuffersPerShaderStage ?? 8) < 2) {
      this.fallbackReason = "meshlet drawing requires compute passes and two compute storage buffers";
      if (!options.allowFallback) throw new RenderDeviceError(this.fallbackReason, "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "compute" });
      if (!(options as DeferredMeshletOptions)[DEFER_PIPELINE_CREATION]) this.forward = new NativeForwardPipeline(device, options);
      return;
    }
    if ((options as DeferredMeshletOptions)[DEFER_PIPELINE_CREATION]) return;
    this.forward = new NativeForwardPipeline(device, options);
    this.computePipeline = this.device.createComputePipeline!(this.computeDescriptor());
    this.drawPipeline = this.device.createRenderPipeline(this.drawDescriptor());
  }
  private computeDescriptor(): Record<string, unknown> {
    const cull = this.device.createShaderModule({ label: "aura-meshlet-cull", code: MESHLET_CULL_WGSL });
    return { label: "aura-meshlet-cull", layout: "auto", compute: { module: cull, entryPoint: "cull" } };
  }
  private drawDescriptor(): Record<string, unknown> {
    const draw = this.device.createShaderModule({ label: "aura-meshlet-draw", code: `${NATIVE_SHARED_WGSL}\n@fragment fn fragmentMain(input: Out) -> @location(0) vec4<f32> { let material = materials[input.material]; return vec4<f32>(illuminate(material.base.rgb, material.emissive, input.normal, frame.direction.xyz, frame.light.xyz, frame.ambient.xyz), 1.0); }` });
    return { label: "aura-meshlet-draw", layout: "auto", vertex: { module: draw, entryPoint: "vertexMain", buffers: NATIVE_VERTEX_LAYOUT }, fragment: { module: draw, entryPoint: "fragmentMain", targets: [{ format: this.outputFormat }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less-equal" } };
  }
  /** Warm compute culling and its matching render/fallback pipelines without submission. */
  static async createWarmed(
    device: unknown,
    options: MeshletOptions,
    signal?: AbortSignal,
    sharedDeferred?: { readonly sampleCount: 1 | 4 }
  ): Promise<MeshletPipeline> {
    const owner = new MeshletPipeline(device, { ...options, [DEFER_PIPELINE_CREATION]: true } as DeferredMeshletOptions);
    try {
      owner.assertWarmupActive(signal);
      owner.forward = await NativeForwardPipeline.createWarmed(device, options, signal);
      if (!owner.fallbackReason) {
        owner.assertWarmupActive(signal);
        owner.computePipeline = await owner.warmComputePipeline(owner.computeDescriptor(), signal);
        owner.assertWarmupActive(signal);
        owner.drawPipeline = await owner.warmRenderPipeline(owner.drawDescriptor(), signal);
        if (sharedDeferred) {
          owner.assertWarmupActive(signal);
          let deferred: DeferredPipeline | undefined = await DeferredPipeline.createWarmed(
            device,
            { outputFormat: owner.outputFormat, sampleCount: sharedDeferred.sampleCount, allowFallback: false },
            { signal, sharedPhysical: true }
          );
          try {
            owner.assertWarmupActive(signal);
            owner.sharedDeferred.set(sharedDeferred.sampleCount, deferred);
            deferred = undefined;
          } finally {
            deferred?.dispose();
          }
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
    if (this.fallbackReason) {
      if (frame.deferredAttachments) throw new RenderDeviceError(this.fallbackReason, "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "compute" });
      return this.renderFallback(frame, this.fallbackReason);
    }
    if (frame.deferredAttachments) return this.renderSharedDeferred(frame);
    const prepared = prepareNativeDrawing(frame.scene, this.device.limits);
    let batch: ReturnType<MeshletPipeline["meshletBatch"]>;
    try {
      batch = this.meshletBatch(frame.scene, prepared.triangleCount);
    } catch (error) {
      if (this.options.allowFallback && error instanceof RenderDeviceError && error.code === "NATIVE_DRAW_CAPABILITY_UNAVAILABLE") return this.renderFallback(frame, error.message);
      throw error;
    }
    if (!batch.count) {
      const result = this.forward!.render(frame);
      return { requested: "meshlet", active: "meshlet", drawCalls: result.draws, triangles: 0, submittedMeshlets: 0 };
    }
    const buffers = this.createFrameBuffers(frame, prepared);
    const owned: (NativeDrawingBuffer | NativeDrawingTexture)[] = [];
    const written: NativeDrawingBuffer[] = [...buffers.written];
    const submission = { attempted: false };
    try {
      const bounds = this.device.createBuffer({ label: "aura-meshlet-bounds", size: batch.bounds.byteLength, usage: 0x80 | 0x08 }); owned.push(bounds);
      written.push(bounds);
      this.device.queue.writeBuffer(bounds, 0, batch.bounds);
      const indirect = this.device.createBuffer({ label: "aura-meshlet-indirect", size: batch.count * 16, usage: 0x80 | 0x100 }); owned.push(indirect);
      const depth = this.device.createTexture({ label: "aura-meshlet-depth", size: [frame.surface.width, frame.surface.height, 1], format: "depth32float", usage: 0x10 }); owned.push(depth);
      const encoder = this.device.createCommandEncoder({ label: "aura-meshlet-frame" });
      const compute = encoder.beginComputePass!({ label: "aura-meshlet-culling" });
      compute.setPipeline(this.computePipeline!);
      compute.setBindGroup(0, this.device.createBindGroup({ layout: this.computePipeline!.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: bounds } }, { binding: 2, resource: { buffer: indirect } }] }));
      compute.dispatchWorkgroups(batch.workgroups); compute.end();
      const draw = encoder.beginRenderPass({ colorAttachments: [{ view: frame.surface.view, clearValue: frame.clearColor ?? [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
      if (!draw.drawIndirect) throw new RenderDeviceError("meshlet drawing requires drawIndirect", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "drawIndirect" });
      draw.setPipeline(this.drawPipeline!);
      draw.setBindGroup(0, this.device.createBindGroup({ layout: this.drawPipeline!.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: buffers.materials } }] }));
      draw.setVertexBuffer(0, buffers.vertices);
      for (let i = 0; i < batch.count; i++) draw.drawIndirect(indirect, i * 16);
      draw.end();
      this.submit(encoder, buffers, owned, submission);
      // GPU visibility is not read back synchronously: triangles is the submitted upper bound.
      return { requested: "meshlet", active: "meshlet", drawCalls: batch.count, triangles: prepared.triangleCount, trianglesAreUpperBound: true, computeDispatches: 1, submittedMeshlets: batch.count };
    } catch (error) {
      if (submission.attempted) throw this.submissionFailure(error);
      const failure = this.cleanupFailedFrame(error, [...buffers.all, ...owned], written);
      if (failure !== error) throw failure;
      if (this.options.allowFallback && error instanceof RenderDeviceError && error.code === "NATIVE_DRAW_CAPABILITY_UNAVAILABLE") return this.renderFallback(frame, error.message);
      throw error;
    }
    } finally { this.endNativeFrame(); }
  }
  private meshletBatch(scene: MeshletGeometry, triangleCount: number) {
    const meshlets = buildValidatedMeshlets(scene, triangleCount, this.options);
    const budget = this.options.maxDrawsPerFrame ?? 65536;
    const workgroups = Math.ceil(meshlets.length / 64);
    const maxWorkgroups = this.device.limits?.maxComputeWorkgroupsPerDimension ?? 65535;
    const maxBuffer = this.device.limits?.maxBufferSize ?? 268_435_456;
    const maxStorage = this.device.limits?.maxStorageBufferBindingSize ?? 134_217_728;
    let reason: string | undefined;
    if (meshlets.length > budget) reason = `meshlet submission requires ${meshlets.length} indirect draws, exceeding maxDrawsPerFrame ${budget}`;
    else if (workgroups > maxWorkgroups) reason = `meshlet culling requires ${workgroups} workgroups, exceeding the device limit ${maxWorkgroups}`;
    else if (meshlets.length * 32 > maxStorage || meshlets.length * 16 > maxStorage || meshlets.length * 32 > maxBuffer || meshlets.length * 16 > maxBuffer) reason = "meshlet buffers exceed device storage limits";
    if (reason) throw new RenderDeviceError(reason, "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "meshlets" });
    const packed = new ArrayBuffer(meshlets.length * 32);
    const floats = new Float32Array(packed), integers = new Uint32Array(packed);
    meshlets.forEach((meshlet, index) => {
      const offset = index * 8;
      // Inflation covers float32 upload rounding so a boundary meshlet is not
      // accidentally removed when its original CPU bounds only touch a plane.
      const margin = 1e-6 * Math.max(1, ...meshlet.center.map(Math.abs), meshlet.radius);
      floats.set([...meshlet.center, meshlet.radius + margin], offset);
      integers.set([meshlet.triangleCount * 3, meshlet.firstTriangle * 3, this.options.frustumCulling === false || meshlet.skipFrustumCulling ? 1 : 0, 0], offset + 4);
    });
    return { bounds: new Uint8Array(packed), count: meshlets.length, workgroups, computePipeline: this.computePipeline! };
  }
  private renderSharedDeferred(frame: NativeDrawingFrame): NativeDrawingDiagnostics {
    const sampleCount = frame.deferredAttachments!.sampleCount;
    if (sampleCount !== 1 && sampleCount !== 4) invalid("sampleCount", "must be 1 or 4 for shared deferred attachments");
    let deferred = this.sharedDeferred.get(sampleCount);
    if (!deferred) {
      const candidate = new DeferredPipeline(this.device, { outputFormat: this.outputFormat, sampleCount, allowFallback: false });
      try {
        // Device hooks can reenter or dispose this owner during construction.
        this.assertAlive();
        deferred = this.sharedDeferred.get(sampleCount);
        if (!deferred) {
          deferred = candidate;
          this.sharedDeferred.set(sampleCount, candidate);
        } else candidate.dispose();
      } catch (error) {
        try { candidate.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Meshlet deferred pipeline creation and cleanup failed", { cause: error }); }
        throw error;
      }
    }
    return deferred.renderMeshlets(frame, prepared => {
      // Bound the exact expanded world-space vertices that will be uploaded,
      // rather than rereading mutable source geometry after pipeline creation.
      const positions = new Float32Array(prepared.triangleCount * 9);
      for (let vertex = 0; vertex < prepared.triangleCount * 3; vertex++) {
        positions.set(prepared.vertices.subarray(vertex * 8, vertex * 8 + 3), vertex * 3);
      }
      return this.meshletBatch({ positions, ...(prepared.triangleNoCull ? { triangleNoCull: prepared.triangleNoCull } : {}) }, prepared.triangleCount);
    });
  }
  private renderFallback(frame: NativeDrawingFrame, reason: string): NativeDrawingDiagnostics {
    const result = this.forward!.render(frame);
    return { requested: "meshlet", active: "forward", fallbackReason: reason, drawCalls: result.draws, triangles: result.triangles, submittedMeshlets: 0 };
  }
  override visitNativeRetirementOwners(visit: (owner: NativeDrawingOwner) => void): void {
    super.visitNativeRetirementOwners(visit);
    this.forward?.visitNativeRetirementOwners(visit);
    for (const deferred of this.sharedDeferred.values()) deferred.visitNativeRetirementOwners(visit);
  }
  protected override disposeOwnedPipelines(first: boolean): void {
    const failures: unknown[] = [];
    for (const child of [this.forward, ...this.sharedDeferred.values()]) {
      if (child && !child.nativeRetirementComplete && (first || child.retirementDestructionErrors.length || child.nativeRetirementFenceFailure)) {
        try { child.dispose(); } catch (error) { failures.push(error); }
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Meshlet child pipeline disposal failed", { cause: failures[0] });
  }
  override dispose(): void { super.dispose(); }
}

const MESHLET_CULL_WGSL = `
struct Frame { viewProjection: mat4x4<f32>, direction: vec4<f32>, light: vec4<f32>, ambient: vec4<f32>, clear: vec4<f32> };
struct Bound { sphere: vec4<f32>, draw: vec4<u32> };
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> bounds: array<Bound>;
@group(0) @binding(2) var<storage, read_write> commands: array<vec4<u32>>;
@compute @workgroup_size(64) fn cull(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let i = invocation.x;
  if (i >= arrayLength(&bounds)) { return; }
  let item = bounds[i];
  let m = frame.viewProjection;
  let x = vec4<f32>(m[0].x, m[1].x, m[2].x, m[3].x);
  let y = vec4<f32>(m[0].y, m[1].y, m[2].y, m[3].y);
  let z = vec4<f32>(m[0].z, m[1].z, m[2].z, m[3].z);
  let w = vec4<f32>(m[0].w, m[1].w, m[2].w, m[3].w);
  let planes = array<vec4<f32>, 6>(w-x, w+x, w-y, w+y, w-z, w+z);
  var visible = true;
  if (item.draw.z == 0u) {
    for (var planeIndex = 0u; planeIndex < 6u; planeIndex++) {
      let plane = planes[planeIndex];
      let lengthN = length(plane.xyz);
      let tolerance = 0.00001 * max(1.0, lengthN * (length(item.sphere.xyz) + item.sphere.w));
      if (lengthN > 0.0 && dot(plane.xyz, item.sphere.xyz) + plane.w < -item.sphere.w * lengthN - tolerance) { visible = false; }
    }
  }
  commands[i] = vec4<u32>(item.draw.x, select(0u, 1u, visible), item.draw.y, 0u);
}`;

function invalid(field: string, message: string): never { throw new RenderDeviceError(`Native meshlet ${field} ${message}`, "NATIVE_DRAW_INVALID_INPUT", { field }); }
