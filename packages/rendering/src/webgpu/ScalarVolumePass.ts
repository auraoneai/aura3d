import { RenderDeviceError, type RenderDevice, type RenderShaderProgram, type ShaderSources, type UniformValue } from "../RenderDevice";
import { RenderPipeline } from "../RenderPipeline";
import { Sampler } from "../Sampler";
import { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { getRenderTargetTextureOwner } from "../Texture";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import type { WebGPUNativePointViewport } from "../WebGPUDevice";
import { FRAME_RESOURCES, type FrameContributorContext } from "../contracts/frameGraph";
import { PRD01_FORWARD_TARGET } from "../renderer/FrameGraph";
import { installScalarVolumeWebGPUDraw, type ScalarVolumeDrawRecord } from "../renderer/ScalarVolumeFrame";
import type { RenderTarget } from "../RenderDevice";
import { buildVolumeTransferTable, type ScalarVolumeData, type VolumeDimensions, type VolumeFrameLease, type VolumePlane, type VolumeRendererOptions, type VolumeRenderMode, type VolumeSamples, type VolumeTransferStop } from "../VolumeRenderer";

const MAX_VOXELS = 67_108_864;
const DEFAULT_MAX_VOXELS = 16_777_216;
// A deliberately conservative portable 3D extent. Larger textures require an
// explicit device-limit contract rather than assuming every adapter supports them.
const MAX_DIMENSION = 2048;
const MAX_STEPS = 512;
const TRANSFER_SIZE = 256;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const VERTEX_GLSL = `#version 300 es
// a3d.scalar-volume-webgpu
layout(location = 0) in vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }
`;
const FRAGMENT_GLSL = `#version 300 es
// a3d.scalar-volume-webgpu
precision highp float;
uniform mat4 u_mvp;
uniform mat4 u_inverseMvp;
uniform vec3 u_dimensions;
uniform vec2 u_domain;
uniform vec2 u_size;
uniform float u_steps;
uniform float u_density;
uniform float u_planeCount;
uniform vec4 u_planes[8];
uniform float u_sliceAxis;
uniform float u_slicePosition;
uniform sampler3D u_volume;
uniform sampler2D u_transfer;
uniform sampler2D u_depth;
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;
const VERTEX_WGSL = `
// a3d.scalar-volume-webgpu
/* @aura3d-bindings */
@vertex fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(position, 1.0);
}
`;
// Scalar samples use explicit eight-corner textureLoad interpolation so that
// an r32float volume works on devices without float32-filterable. Coordinates,
// depth and blending follow WebGPU's zero-to-one depth convention.
const FRAGMENT_WGSL = `
// a3d.scalar-volume-webgpu
/* @aura3d-bindings */
struct VolumeOutput { @location(0) color: vec4<f32>, @builtin(frag_depth) depth: f32 };
fn permitted(point: vec3<f32>) -> bool {
  for (var i: i32 = 0; i < 8; i += 1) {
    if (f32(i) >= aura.u_planeCount) { break; }
    if (dot(aura.u_planes[i], vec4<f32>(point, 1.0)) < 0.0) { return false; }
  }
  return true;
}
fn scalarAt(point: vec3<f32>) -> f32 {
  let dims = vec3<i32>(aura.u_dimensions);
  let coordinate = clamp(point, vec3<f32>(0.0), vec3<f32>(1.0)) * vec3<f32>(dims - vec3<i32>(1));
  let lo = vec3<i32>(floor(coordinate));
  let hi = min(lo + vec3<i32>(1), dims - vec3<i32>(1));
  let fraction = fract(coordinate);
  let c000 = textureLoad(u_volumeTexture, vec3<i32>(lo.x, lo.y, lo.z), 0).r;
  let c100 = textureLoad(u_volumeTexture, vec3<i32>(hi.x, lo.y, lo.z), 0).r;
  let c010 = textureLoad(u_volumeTexture, vec3<i32>(lo.x, hi.y, lo.z), 0).r;
  let c110 = textureLoad(u_volumeTexture, vec3<i32>(hi.x, hi.y, lo.z), 0).r;
  let c001 = textureLoad(u_volumeTexture, vec3<i32>(lo.x, lo.y, hi.z), 0).r;
  let c101 = textureLoad(u_volumeTexture, vec3<i32>(hi.x, lo.y, hi.z), 0).r;
  let c011 = textureLoad(u_volumeTexture, vec3<i32>(lo.x, hi.y, hi.z), 0).r;
  let c111 = textureLoad(u_volumeTexture, vec3<i32>(hi.x, hi.y, hi.z), 0).r;
  return mix(mix(mix(c000, c100, fraction.x), mix(c010, c110, fraction.x), fraction.y),
             mix(mix(c001, c101, fraction.x), mix(c011, c111, fraction.x), fraction.y), fraction.z);
}
fn colorAt(point: vec3<f32>) -> vec4<f32> {
  let scale = max(max(abs(aura.u_domain.x), abs(aura.u_domain.y)), 1e-30);
  let value = clamp((scalarAt(point) / scale - aura.u_domain.x / scale) /
    (aura.u_domain.y / scale - aura.u_domain.x / scale), 0.0, 1.0);
  return textureSampleLevel(u_transferTexture, u_transferSampler, vec2<f32>((value * 255.0 + 0.5) / 256.0, 0.5), 0.0);
}
@fragment fn fs_main(@builtin(position) fragment: vec4<f32>) -> VolumeOutput {
  let ndc = vec2<f32>(fragment.x * 2.0 / aura.u_size.x - 1.0, 1.0 - fragment.y * 2.0 / aura.u_size.y);
  let nearH = aura.u_inverseMvp * vec4<f32>(ndc, 0.0, 1.0);
  let middleH = aura.u_inverseMvp * vec4<f32>(ndc, 0.5, 1.0);
  // A finite interior point supplies a ray even when the far endpoint is at
  // infinity. Reject invalid homogeneous coordinates before division.
  if (nearH.w == 0.0 || middleH.w == 0.0) { discard; }
  let origin = nearH.xyz / nearH.w;
  let delta = middleH.xyz / middleH.w - origin;
  if (!all(abs(origin) <= vec3<f32>(3e38)) || !all(abs(delta) <= vec3<f32>(3e38))) { discard; }
  let largest = max(abs(delta.x), max(abs(delta.y), abs(delta.z)));
  if (!(largest > 0.0)) { discard; }
  let direction = normalize(delta / largest);
  var first = 0.0;
  var last = 3e38;
  for (var axis: i32 = 0; axis < 3; axis += 1) {
    if (abs(direction[axis]) < 1e-8) {
      if (origin[axis] < 0.0 || origin[axis] > 1.0) { discard; }
    } else {
      let a = -origin[axis] / direction[axis];
      let b = (1.0 - origin[axis]) / direction[axis];
      first = max(first, min(a, b));
      last = min(last, max(a, b));
    }
  }
  let opaqueDepth = textureLoad(u_depthTexture, vec2<i32>(fragment.xy), 0);
  // Clip the ray against z <= opaqueDepth * w in homogeneous coordinates.
  // With clear depth 1 this is the true far plane, including infinite-far
  // cameras. This avoids unprojecting an infinite far point or applying an
  // arbitrary depth epsilon that truncates visible distant geometry.
  let clipOrigin = aura.u_mvp * vec4<f32>(origin, 1.0);
  let clipDirection = aura.u_mvp * vec4<f32>(direction, 0.0);
  if (!all(abs(clipOrigin) <= vec4<f32>(3e38)) || !all(abs(clipDirection) <= vec4<f32>(3e38))) { discard; }
  let planeOrigin = opaqueDepth * clipOrigin.w - clipOrigin.z;
  let planeSlope = opaqueDepth * clipDirection.w - clipDirection.z;
  if (planeSlope < 0.0) { last = min(last, -planeOrigin / planeSlope); }
  else if (planeSlope > 0.0) { first = max(first, -planeOrigin / planeSlope); }
  else if (planeOrigin < 0.0) { discard; }
  if (last < first || aura.u_density <= 0.0) { discard; }
  var result = vec4<f32>(0.0);
  var hit = -1.0;
  if (aura.u_sliceAxis >= 0.0) {
    let axis = i32(aura.u_sliceAxis);
    if (abs(direction[axis]) < 1e-8) { discard; }
    let t = (aura.u_slicePosition - origin[axis]) / direction[axis];
    if (t < first || t > last) { discard; }
    let point = origin + direction * t;
    if (!permitted(point)) { discard; }
    let color = colorAt(point);
    if (color.a <= 0.0) { discard; }
    let alpha = 1.0 - pow(max(1.0 - color.a, 0.0), aura.u_density);
    result = vec4<f32>(color.rgb * alpha, alpha);
    hit = t;
  } else {
    let stepSize = (last - first) / aura.u_steps;
    if (stepSize <= 0.0) { discard; }
    for (var i: i32 = 0; i < 512; i += 1) {
      if (f32(i) >= aura.u_steps || result.a >= 0.995) { break; }
      let t = first + (f32(i) + 0.5) * stepSize;
      let point = origin + direction * t;
      if (!permitted(point)) { continue; }
      let color = colorAt(point);
      let alpha = 1.0 - pow(max(1.0 - color.a, 0.0), stepSize * 128.0 * aura.u_density);
      if (alpha > 0.0 && hit < 0.0) { hit = t; }
      result = vec4<f32>(result.rgb + (1.0 - result.a) * alpha * color.rgb,
        result.a + (1.0 - result.a) * alpha);
    }
  }
  if (hit < 0.0 || result.a <= 0.0) { discard; }
  let clip = aura.u_mvp * vec4<f32>(origin + direction * hit, 1.0);
  var output: VolumeOutput;
  output.color = result;
  output.depth = clamp(clip.z / clip.w, 0.0, 1.0);
  return output;
}
`;

export const WEBGPU_SCALAR_VOLUME_SHADER: ShaderSources = {
  label: "aura-scalar-volume-webgpu", marker: "a3d.scalar-volume-webgpu",
  vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL,
  webgpu: { vertex: VERTEX_WGSL, fragment: FRAGMENT_WGSL },
  portableBindings: [
    { name: "u_mvp", kind: "mat4", required: true },
    { name: "u_inverseMvp", kind: "mat4", required: true },
    { name: "u_dimensions", kind: "vec3", required: true },
    { name: "u_domain", kind: "vec2", required: true },
    { name: "u_size", kind: "vec2", required: true },
    { name: "u_steps", kind: "float", required: true },
    { name: "u_density", kind: "float", required: true },
    { name: "u_planeCount", kind: "float", required: true },
    { name: "u_planes", kind: "vec4", arrayLength: 8, required: true },
    { name: "u_sliceAxis", kind: "float", required: true },
    { name: "u_slicePosition", kind: "float", required: true },
    { name: "u_volume", kind: "texture3d", required: true },
    { name: "u_transfer", kind: "texture2d", required: true },
    { name: "u_depth", kind: "depth2d", required: true }
  ]
};

interface VolumeState {
  readonly volume: Texture;
  readonly transfer: Texture;
  readonly dimensions: VolumeDimensions;
  samples: Float32Array;
  readonly domain: readonly [number, number];
  readonly stops: readonly VolumeTransferStop[];
  refs: number;
  active: boolean;
  released: boolean;
}

export interface WebGPUScalarVolumeDraw {
  /** Aura's standard minus-one-to-one camera projection. */
  readonly viewProjectionMatrix: ArrayLike<number>;
  readonly modelMatrix?: ArrayLike<number>;
  readonly depthTexture: Texture;
  readonly width: number;
  readonly height: number;
  readonly mode?: VolumeRenderMode;
}

/** Verify that sampling never aliases the active target and that raster state
 *  covers exactly the dimensions used to address the copied depth. */
function assertWebGPUVolumeTarget(device: RenderDevice, width: number, height: number, depth: Texture): { assertCurrent(): void } {
  const target = device.getRenderTarget?.();
  const valid = (): boolean => Boolean(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0 &&
    target && !target.disposed && device.getRenderTarget?.() === target && (target.sampleCount ?? 1) === 1 &&
    (target.dimension ?? "2d") === "2d" && target.width === width && target.height === height &&
    target.colorTexture && !target.colorTexture.disposed && target.colorTexture.dimension === "2d" &&
    target.colorTexture.colorSpace === "linear" && (target.colorTexture.format === "rgba8" || target.colorTexture.format === "rgba16f") &&
    getRenderTargetTextureOwner(target.colorTexture) === device &&
    target.depthTexture && !target.depthTexture.disposed && target.depthTexture.dimension === "2d" && target.depthTexture.format === "depth24" &&
    target.depthTexture.width === width && target.depthTexture.height === height && getRenderTargetTextureOwner(target.depthTexture) === device &&
    depth && !depth.disposed && depth.dimension === "2d" && depth.format === "depth24" && depth.width === width && depth.height === height &&
    getRenderTargetTextureOwner(depth) === device && depth !== target.depthTexture && depth !== target.colorTexture);
  if (!valid()) throw new RenderDeviceError("Scalar volume requires an owned, distinct matching opaque depth texture and linear target", "SCALAR_VOLUME_DEPTH_COPY_UNAVAILABLE");
  const viewportDevice = device as RenderDevice & {
    getNativePointViewport?: () => WebGPUNativePointViewport;
    assertNativePointViewport?: (value: WebGPUNativePointViewport) => void;
  };
  if (!viewportDevice.getNativePointViewport || !viewportDevice.assertNativePointViewport) {
    throw new RenderDeviceError("Scalar volume rendering requires verified raster state", "SCALAR_VOLUME_VIEWPORT_UNSUPPORTED");
  }
  const viewport = viewportDevice.getNativePointViewport();
  const full = (value: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): boolean =>
    value.x === 0 && value.y === 0 && value.width === width && value.height === height;
  if (viewport.target !== target || !full(viewport) || (viewport.scissor && !full(viewport.scissor))) {
    throw new RenderDeviceError("Scalar volume rendering requires the complete target viewport", "SCALAR_VOLUME_VIEWPORT_UNSUPPORTED");
  }
  const assertCurrent = (): void => {
    if (!valid()) throw new RenderDeviceError("Scalar volume target or depth became stale", "SCALAR_VOLUME_FRAME_STALE");
    viewportDevice.assertNativePointViewport!(viewport);
  };
  assertCurrent();
  return { assertCurrent };
}

/** Submit an authored scene volume after its opaque depth has been copied. */
export function drawScalarVolumeOnWebGPU(
  context: FrameContributorContext,
  record: ScalarVolumeDrawRecord,
  frame: { readonly deviceGeneration: number; assertCurrent(): void }
): void {
  const device = context.device;
  if (device.kind !== "webgpu" || !("drawWebGPU" in record.renderer)) {
    throw new RenderDeviceError("Scalar volume renderer belongs to a different backend", "SCALAR_VOLUME_BACKEND_UNSUPPORTED");
  }
  if (device.disposed || device.contextLost || device.generation !== frame.deviceGeneration) {
    throw new RenderDeviceError("Scalar volume frame device is unavailable or stale", "SCALAR_VOLUME_FRAME_STALE");
  }
  frame.assertCurrent();
  record.frameLease.assertCurrent();
  record.renderer.assertUsableForDevice(device);
  const camera = context.camera;
  if (!camera || !context.rasterViewProjectionMatrix || context.rasterViewProjectionMatrix.length !== 16 ||
      !context.rasterViewProjectionMatrix.every(Number.isFinite)) {
    throw new RenderDeviceError("Scalar volume rendering requires a finite raster camera", "SCALAR_VOLUME_CAMERA_REQUIRED");
  }
  if (camera.depth?.mode !== "standard" || camera.depth.clipRange !== "minus-one-to-one" ||
      camera.depth.clearValue !== 1 || camera.depth.compare !== "less-equal") {
    throw new RenderDeviceError("Scalar volume rendering requires standard Aura camera depth", "SCALAR_VOLUME_DEPTH_UNSUPPORTED");
  }
  if (context.blackboard.get("prd01.outputColorSpace") !== "linear") {
    throw new RenderDeviceError("Scalar volume rendering requires a linear forward target", "SCALAR_VOLUME_COLOR_UNSUPPORTED");
  }
  const target = context.blackboard.get(PRD01_FORWARD_TARGET) as RenderTarget | undefined;
  const copy = context.blackboard.get(FRAME_RESOURCES.sceneDepthCopy) as RenderTarget | undefined;
  if (!target || !copy || target === copy || copy.disposed || (copy.sampleCount ?? 1) !== 1 ||
      target.width !== context.width || target.height !== context.height || copy.width !== target.width || copy.height !== target.height || !copy.depthTexture) {
    throw new RenderDeviceError("Scalar volume rendering requires an owned, matching opaque-depth copy", "SCALAR_VOLUME_DEPTH_COPY_UNAVAILABLE");
  }
  if (context.rasterViewportIsFull !== true) {
    throw new RenderDeviceError("Scalar volume rendering requires verified full-target raster state", "SCALAR_VOLUME_VIEWPORT_UNSUPPORTED");
  }
  if (device.getRenderTarget?.() !== target) throw new RenderDeviceError("Scalar volume target is no longer active", "SCALAR_VOLUME_FRAME_STALE");
  assertWebGPUVolumeTarget(device, target.width, target.height, copy.depthTexture);
  frame.assertCurrent();
  record.frameLease.assertCurrent();
  record.renderer.drawWebGPU({ viewProjectionMatrix: context.rasterViewProjectionMatrix, modelMatrix: record.modelMatrix,
    depthTexture: copy.depthTexture, width: target.width, height: target.height, mode: record.mode });
}

installScalarVolumeWebGPUDraw(drawScalarVolumeOnWebGPU);

/** WebGPU-owned scalar volume; the caller owns the source arrays and depth. */
export class WebGPUScalarVolumeRenderer {
  private readonly maxVoxels: number;
  private readonly generation: number;
  private readonly vertex: VertexBuffer;
  private readonly shader: RenderShaderProgram;
  private readonly pipeline: RenderPipeline;
  private readonly sampler = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
  private readonly transferSampler = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
  private readonly states = new Set<VolumeState>();
  private current: VolumeState;
  private autoDomain: boolean;
  private autoTransfer: boolean;
  private planes: readonly VolumePlane[];
  private steps: number;
  private density: number;
  private revision = 0;
  private leases = 0;
  private activeDraws = 0;
  private disposed = false;
  private released = false;
  private unsubscribe?: () => void;

  constructor(private readonly device: RenderDevice, options: VolumeRendererOptions) {
    if (device.kind !== "webgpu" || device.disposed || device.contextLost || device.generation === undefined || !device.drawChecked) {
      throw new RenderDeviceError("Scalar volumes require a live WebGPU device with checked submission", "SCALAR_VOLUME_BACKEND_UNSUPPORTED");
    }
    this.generation = device.generation;
    this.maxVoxels = checkedInteger(options.maxVoxels ?? DEFAULT_MAX_VOXELS, MAX_VOXELS, "maxVoxels");
    const source = options.data;
    const dimensions = checkedDimensions(options.dimensions, sampleLength(source), this.maxVoxels);
    const samples = copySamples(source);
    const domain = options.domain ? checkedDomain(options.domain) : sampleDomain(samples);
    const stops = checkedStops(options.transfer ?? defaultStops(domain));
    this.autoDomain = options.domain === undefined;
    this.autoTransfer = options.transfer === undefined;
    this.planes = checkedPlanes(options.clipPlanes ?? []);
    this.steps = checkedInteger(options.sampleCount ?? 128, MAX_STEPS, "sampleCount");
    this.density = checkedDensity(options.density ?? 1);
    this.current = this.makeState(dimensions, samples, domain, stops);
    let vertex: VertexBuffer | undefined;
    let shader: RenderShaderProgram | undefined;
    let pipeline: RenderPipeline | undefined;
    try {
      shader = device.createShaderProgram(WEBGPU_SCALAR_VOLUME_SHADER);
      vertex = new VertexBuffer(VertexFormat.P3, 3);
      vertex.setAttribute(0, "position", [-1, -1, 0]);
      vertex.setAttribute(1, "position", [3, -1, 0]);
      vertex.setAttribute(2, "position", [-1, 3, 0]);
      pipeline = new RenderPipeline({ label: "aura-scalar-volume-webgpu", shader, vertexFormat: vertex.format, topology: "triangles",
        renderState: { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "none", blend: true, blendMode: "premultiplied" } });
      this.vertex = vertex;
      this.shader = shader;
      this.pipeline = pipeline;
      const unsubscribe = device.onDeviceLost?.(() => this.dispose());
      if (this.disposed) unsubscribe?.(); else this.unsubscribe = unsubscribe;
      this.assertUsableForDevice(device);
    } catch (error) {
      const failures: unknown[] = [error];
      try { this.unsubscribe?.(); } catch (cleanup) { failures.push(cleanup); }
      this.unsubscribe = undefined;
      this.current.active = false;
      try { this.releaseState(this.current); } catch (cleanup) { failures.push(cleanup); }
      if (!this.released) {
        for (const resource of [pipeline, vertex, shader]) try { resource?.dispose(); } catch (cleanup) { failures.push(cleanup); }
      }
      if (failures.length > 1) throw new AggregateError(failures, "Scalar volume construction and cleanup failed");
      throw error;
    }
  }

  belongsToDevice(device: RenderDevice): boolean { return this.device === device; }
  assertUsableForDevice(device: RenderDevice): void {
    if (this.disposed || device !== this.device || device.disposed || device.contextLost || device.generation !== this.generation) {
      throw new RenderDeviceError("Scalar volume device or generation is unavailable", "SCALAR_VOLUME_FRAME_STALE");
    }
  }
  acquireFrameLease(device: RenderDevice): VolumeFrameLease {
    this.assertUsableForDevice(device);
    const state = this.current, revision = this.revision;
    state.refs += 1; this.leases += 1;
    let released = false;
    return {
      assertCurrent: () => {
        if (released || this.current !== state || this.revision !== revision) throw new RenderDeviceError("Scalar volume frame lease is stale", "SCALAR_VOLUME_FRAME_STALE");
        this.assertUsableForDevice(device);
      },
      release: () => {
        if (released) return;
        released = true; state.refs -= 1; this.leases -= 1;
        this.retire(state);
      }
    };
  }
  updateData(volume: ScalarVolumeData): void {
    this.assertUsableForDevice(this.device);
    const source = volume.data;
    const dimensions = checkedDimensions(volume.dimensions, sampleLength(source), this.maxVoxels);
    const samples = copySamples(source);
    const domain = this.autoDomain ? sampleDomain(samples) : this.current.domain;
    const stops = this.autoTransfer && this.autoDomain ? defaultStops(domain) : this.current.stops;
    this.replace(dimensions, samples, domain, stops);
  }
  updateTransferFunction(value: readonly VolumeTransferStop[]): void {
    const stops = checkedStops(value);
    this.assertUsableForDevice(this.device);
    const previous = this.current;
    try { this.replace(previous.dimensions, previous.samples, previous.domain, stops); }
    finally { if (this.current !== previous) this.autoTransfer = false; }
  }
  setDomain(value?: readonly [number, number]): void {
    this.assertUsableForDevice(this.device);
    const domain = value ? checkedDomain(value) : sampleDomain(this.current.samples);
    const stops = this.autoTransfer ? defaultStops(domain) : this.current.stops;
    const previous = this.current;
    try { this.replace(previous.dimensions, previous.samples, domain, stops); }
    finally { if (this.current !== previous) this.autoDomain = value === undefined; }
  }
  setClipPlanes(value: readonly VolumePlane[]): void { this.assertUsableForDevice(this.device); this.planes = checkedPlanes(value); this.revision += 1; }
  setSampleCount(value: number): void { this.assertUsableForDevice(this.device); this.steps = checkedInteger(value, MAX_STEPS, "sampleCount"); this.revision += 1; }
  setDensity(value: number): void { this.assertUsableForDevice(this.device); this.density = checkedDensity(value); this.revision += 1; }

  /** Draw into the already bound linear scene target using a distinct opaque-depth copy. */
  drawWebGPU(options: WebGPUScalarVolumeDraw): void {
    this.assertUsableForDevice(this.device);
    const viewport = assertWebGPUVolumeTarget(this.device, options.width, options.height, options.depthTexture);
    const mode = options.mode ?? { type: "raymarch" };
    const axis = mode.type === "raymarch" ? -1 : mode.type === "slice" ? ["x", "y", "z"].indexOf(mode.axis) : -2;
    if (axis < -1 || (mode.type === "slice" && (axis < 0 || !Number.isFinite(mode.position) || mode.position < 0 || mode.position > 1))) {
      throw new RangeError("Scalar volume slice requires an axis and position in [0, 1]");
    }
    const mvp = multiply(matrix(options.viewProjectionMatrix), matrix(options.modelMatrix ?? IDENTITY));
    // Match the existing WebGPU mesh shaders: z_device = (z_camera + w) / 2.
    // The resulting inverse consumes the copied depth texture directly.
    for (let column = 0; column < 4; column++) mvp[column * 4 + 2] = (mvp[column * 4 + 2]! + mvp[column * 4 + 3]!) * 0.5;
    const inverse = invert(mvp);
    const planes = new Float32Array(32);
    this.planes.forEach((plane, index) => planes.set(plane, index * 4));
    const state = this.current, revision = this.revision;
    const uniforms = new Map<string, UniformValue>([
      ["u_mvp", mvp], ["u_inverseMvp", inverse], ["u_dimensions", [...state.dimensions]], ["u_domain", [...state.domain]],
      ["u_size", [options.width, options.height]], ["u_steps", this.steps], ["u_density", this.density],
      ["u_planeCount", this.planes.length], ["u_planes", planes], ["u_sliceAxis", axis],
      ["u_slicePosition", mode.type === "slice" ? mode.position : 0],
      ["u_volume", new TextureBinding({ name: "u_volume", texture: state.volume, sampler: this.sampler, required: true })],
      ["u_transfer", new TextureBinding({ name: "u_transfer", texture: state.transfer, sampler: this.transferSampler, required: true })],
      ["u_depth", new TextureBinding({ name: "u_depth", texture: options.depthTexture, sampler: this.sampler, required: true })]
    ]);
    state.refs += 1;
    this.activeDraws += 1;
    const failures: unknown[] = [];
    try {
      const buffer = this.vertex.upload(this.device);
      this.assertUsableForDevice(this.device);
      if (this.current !== state || this.revision !== revision) throw new RenderDeviceError("Scalar volume changed during draw preparation", "SCALAR_VOLUME_FRAME_STALE");
      viewport.assertCurrent();
      this.device.drawChecked!(this.pipeline.createDrawCommand({ vertexBuffer: buffer, vertexCount: 3, uniforms }));
    } catch (error) {
      failures.push(error);
    } finally {
      state.refs -= 1;
      this.activeDraws -= 1;
      try { this.retire(state); } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Scalar volume draw and retirement failed");
  }
  getDiagnostics(): { readonly backend: "webgpu"; readonly dimensions: VolumeDimensions; readonly voxelCount: number; readonly retainedCpuBytes: number; readonly sampleCount: number; readonly disposed: boolean; readonly contextLost: boolean } {
    const buffers = new Set<ArrayBufferLike>();
    let retainedCpuBytes = 0;
    for (const state of this.states) for (const data of [state.samples, state.volume.data, state.transfer.data]) {
      if (data && !buffers.has(data.buffer)) { buffers.add(data.buffer); retainedCpuBytes += data.buffer.byteLength; }
    }
    return { backend: "webgpu", dimensions: [...this.current.dimensions], voxelCount: this.current.samples.length,
      retainedCpuBytes, sampleCount: this.steps, disposed: this.disposed,
      contextLost: this.device.contextLost || this.device.generation !== this.generation };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const failures: unknown[] = [];
    try { this.unsubscribe?.(); } catch (error) { failures.push(error); }
    this.unsubscribe = undefined;
    this.current.active = false;
    try { this.retire(this.current); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Scalar volume disposal failed");
  }
  private makeState(dimensions: VolumeDimensions, samples: Float32Array, domain: readonly [number, number], stops: readonly VolumeTransferStop[]): VolumeState {
    const volume = new Texture({ width: dimensions[0], height: dimensions[1], depth: dimensions[2], dimension: "3d", format: "r32f", colorSpace: "linear", data: samples, label: "scalar-volume-webgpu-field" });
    try {
      // The shader addresses exactly 256 entries. The device budget may
      // downsample ordinary RGBA textures, so mark this lookup as dynamic;
      // dynamic textures are admitted at their exact size or rejected.
      const transfer = new Texture({ width: TRANSFER_SIZE, height: 1, format: "rgba8", colorSpace: "linear", dynamic: true, generateMipmaps: false,
        data: buildVolumeTransferTable(domain, stops), label: "scalar-volume-webgpu-transfer" });
      const state: VolumeState = { volume, transfer, dimensions: [...dimensions], samples, domain: [...domain], stops, refs: 0, active: true, released: false };
      this.states.add(state); return state;
    } catch (error) {
      try { volume.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Scalar volume allocation and cleanup failed"); }
      throw error;
    }
  }
  private replace(dimensions: VolumeDimensions, samples: Float32Array, domain: readonly [number, number], stops: readonly VolumeTransferStop[]): void {
    const previous = this.current, revision = this.revision;
    const next = this.makeState(dimensions, samples, domain, stops);
    try {
      this.assertUsableForDevice(this.device);
      if (this.current !== previous || this.revision !== revision) throw new RenderDeviceError("Scalar volume changed during replacement", "SCALAR_VOLUME_FRAME_STALE");
    } catch (error) {
      next.active = false;
      try { this.releaseState(next); } catch (cleanup) { throw new AggregateError([error, cleanup], "Scalar volume replacement and cleanup failed"); }
      throw error;
    }
    this.current = next; this.revision += 1; previous.active = false;
    this.releaseState(previous);
  }
  private releaseState(state: VolumeState): void {
    if (state.active || state.refs || state.released) return;
    state.released = true;
    this.states.delete(state);
    state.samples = new Float32Array(0);
    const failures: unknown[] = [];
    try { state.volume.dispose(); } catch (error) { failures.push(error); }
    try { state.transfer.dispose(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Scalar volume texture disposal failed");
  }
  private releaseShared(): void {
    if (!this.disposed || this.leases || this.activeDraws || this.released) return;
    this.released = true;
    const failures: unknown[] = [];
    for (const resource of [this.pipeline, this.vertex, this.shader]) try { resource.dispose(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Scalar volume draw resource disposal failed");
  }
  private retire(state: VolumeState): void {
    const failures: unknown[] = [];
    try { this.releaseState(state); } catch (error) { failures.push(error); }
    try { this.releaseShared(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Scalar volume resource retirement failed");
  }
}

function checkedInteger(value: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new RangeError(`Scalar volume ${name} must be between 1 and ${max}`);
  return value;
}
function checkedDimensions(value: VolumeDimensions, count: number, max: number): VolumeDimensions {
  if (!Array.isArray(value) || value.length !== 3) throw new RangeError("Scalar volume requires three dimensions");
  let total = 1;
  for (const dimension of value) { checkedInteger(dimension, MAX_DIMENSION, "dimension"); total *= dimension; if (!Number.isSafeInteger(total) || total > max) throw new RangeError("Scalar volume voxel budget exceeded"); }
  if (total !== count) throw new RangeError("Scalar volume data length must match dimensions");
  return [value[0], value[1], value[2]];
}
function sampleLength(value: VolumeSamples): number {
  if (!(value instanceof Float32Array || value instanceof Int8Array || value instanceof Uint8Array || value instanceof Int16Array || value instanceof Uint16Array)) throw new TypeError("Unsupported scalar volume sample type");
  return value.length;
}
function copySamples(value: VolumeSamples): Float32Array {
  const result = new Float32Array(value);
  if (!result.every(Number.isFinite)) throw new RangeError("Scalar volume samples must be finite");
  return result;
}
function sampleDomain(value: Float32Array): readonly [number, number] {
  let low = Infinity, high = -Infinity;
  for (const sample of value) { low = Math.min(low, sample); high = Math.max(high, sample); }
  if (low === high) {
    const delta = Math.max(1, Math.abs(low) * 1e-6), a = low - delta, b = high + delta;
    return [Number.isFinite(Math.fround(a)) ? a : low, Number.isFinite(Math.fround(b)) ? b : high];
  }
  return [low, high];
}
function checkedDomain(value: readonly [number, number]): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(Math.fround(value[0])) || !Number.isFinite(Math.fround(value[1])) || !(Math.fround(value[1]) > Math.fround(value[0]))) throw new RangeError("Scalar volume domain requires increasing finite float32 values");
  return [value[0], value[1]];
}
function defaultStops(domain: readonly [number, number]): readonly VolumeTransferStop[] {
  return [{ value: domain[0], color: [0, 0, 0, 0] }, { value: domain[1], color: [1, 1, 1, 0.05] }];
}
function checkedStops(stops: readonly VolumeTransferStop[]): readonly VolumeTransferStop[] {
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 4096) throw new RangeError("Scalar volume transfer requires 2 to 4096 stops");
  let prior = -Infinity;
  return stops.map((stop) => {
    if (!stop || !Number.isFinite(Math.fround(stop.value)) || stop.value <= prior || !Array.isArray(stop.color) || stop.color.length !== 4 || stop.color.some((c: number) => !Number.isFinite(c) || c < 0 || c > 1)) throw new RangeError("Scalar volume transfer stops must be ordered finite RGBA values");
    prior = stop.value; return { value: stop.value, color: [...stop.color] as [number, number, number, number] };
  });
}
function checkedPlanes(planes: readonly VolumePlane[]): readonly VolumePlane[] {
  if (!Array.isArray(planes) || planes.length > 8) throw new RangeError("Scalar volume supports at most eight clip planes");
  return planes.map((plane) => {
    if (!Array.isArray(plane) || plane.length !== 4 || plane.some(x => !Number.isFinite(Math.fround(x))) || (Math.fround(plane[0]) === 0 && Math.fround(plane[1]) === 0 && Math.fround(plane[2]) === 0)) throw new RangeError("Scalar volume clip planes require finite nonzero normals");
    return [plane[0], plane[1], plane[2], plane[3]] as VolumePlane;
  });
}
function checkedDensity(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new RangeError("Scalar volume density is invalid");
  return value;
}
function matrix(value: ArrayLike<number>): Float32Array {
  if (!value || value.length !== 16) throw new RangeError("Scalar volume matrices require 16 finite values");
  const result = Float32Array.from(value);
  if (!result.every(Number.isFinite)) throw new RangeError("Scalar volume matrices require finite float32 values");
  return result;
}
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    let sum = 0; for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
    result[column * 4 + row] = sum;
  }
  if (!result.every(Number.isFinite)) throw new RangeError("Scalar volume matrix product is not finite");
  return result;
}
function invert(input: Float32Array): Float32Array {
  const rows = Array.from({ length: 4 }, (_, row) => Array.from({ length: 8 }, (_, col) => col < 4 ? input[col * 4 + row]! : Number(col - 4 === row)));
  for (let col = 0; col < 4; col++) {
    let pivot = col; for (let row = col + 1; row < 4; row++) if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row;
    if (!Number.isFinite(rows[pivot]![col]) || Math.abs(rows[pivot]![col]!) < 1e-15) throw new RangeError("Scalar volume matrix must be invertible");
    [rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!];
    const scale = rows[col]![col]!; for (let j = 0; j < 8; j++) rows[col]![j]! /= scale;
    for (let row = 0; row < 4; row++) if (row !== col) { const factor = rows[row]![col]!; for (let j = 0; j < 8; j++) rows[row]![j]! -= factor * rows[col]![j]!; }
  }
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) result[col * 4 + row] = rows[row]![col + 4]!;
  if (!result.every(Number.isFinite)) throw new RangeError("Scalar volume inverse matrix is not finite");
  return result;
}
