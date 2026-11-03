/** Snapshot opaque depth before transparent draws mutate the forward target. */
import { Geometry } from "../Geometry";
import { DEFAULT_RENDER_STATE } from "../Material";
import { RenderDeviceError, type RenderDevice, type RenderShaderProgram, type RenderTarget, type ShaderSources, type UniformValue } from "../RenderDevice";
import { RenderPipeline } from "../RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import type { Texture } from "../Texture";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";

const DEPTH_COPY_VERTEX_GLSL = `#version 300 es
// a3d.scene-depth-copy
layout(location = 0) in vec3 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position.xy * 0.5 + 0.5;
  gl_Position = vec4(a_position, 1.0);
}
`;

const DEPTH_COPY_FRAGMENT_GLSL = `#version 300 es
// a3d.scene-depth-copy
precision highp float;
uniform sampler2D u_depth;
in vec2 v_uv;
void main() {
  gl_FragDepth = texture(u_depth, v_uv).r;
}
`;

const DEPTH_COPY_VERTEX_WGSL = `
// a3d.scene-depth-copy
/* @aura3d-bindings */
@vertex fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(position, 1.0);
}
`;

const DEPTH_COPY_FRAGMENT_WGSL = `
// a3d.scene-depth-copy
/* @aura3d-bindings */
struct DepthCopyOutput {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};
@fragment fn fs_main(@builtin(position) position: vec4<f32>) -> DepthCopyOutput {
  var output: DepthCopyOutput;
  // Both the attachment and the fragment position use WebGPU's top-left
  // origin. Equal-sized targets therefore copy the same integer pixel.
  output.depth = textureLoad(u_depthTexture, vec2<i32>(position.xy), 0);
  output.color = vec4<f32>(0.0);
  return output;
}
`;

const COPY_SHADER: ShaderSources = {
  label: "prd01-scene-depth-copy",
  marker: "a3d.scene-depth-copy",
  vertex: DEPTH_COPY_VERTEX_GLSL,
  fragment: DEPTH_COPY_FRAGMENT_GLSL,
  webgpu: { vertex: DEPTH_COPY_VERTEX_WGSL, fragment: DEPTH_COPY_FRAGMENT_WGSL },
  portableBindings: [{ name: "u_depth", kind: "depth2d", required: true }]
};

const DEPTH_RESOLVE_FRAGMENT_WGSL = `
// a3d.scene-depth-copy
/* @aura3d-bindings */
struct DepthCopyOutput {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};
@fragment fn fs_main(@builtin(position) position: vec4<f32>) -> DepthCopyOutput {
  let pixel = vec2<i32>(position.xy);
  var nearest = textureLoad(u_depthTexture, pixel, 0);
  // Select the nearest surface. Clear samples naturally lose against a
  // covered sample under the negotiated standard or reversed convention.
  for (var sampleIndex: i32 = 1; sampleIndex < 4; sampleIndex += 1) {
    let depth = textureLoad(u_depthTexture, pixel, sampleIndex);
    if (aura.u_reversedDepth != 0u) { nearest = max(nearest, depth); }
    else { nearest = min(nearest, depth); }
  }
  var output: DepthCopyOutput;
  output.depth = nearest;
  output.color = vec4<f32>(0.0);
  return output;
}
`;

const RESOLVE_SHADER: ShaderSources = {
  label: "prd01-scene-depth-resolve",
  marker: "a3d.scene-depth-copy",
  vertex: DEPTH_COPY_VERTEX_GLSL,
  fragment: DEPTH_COPY_FRAGMENT_GLSL,
  webgpu: { vertex: DEPTH_COPY_VERTEX_WGSL, fragment: DEPTH_RESOLVE_FRAGMENT_WGSL },
  portableBindings: [
    { name: "u_depth", kind: "depth2d-multisampled", required: true },
    { name: "u_reversedDepth", kind: "u32", required: true }
  ]
};

/** Always overwrite even when the target retains the previous frame's depth. */
export const DEPTH_COPY_RENDER_STATE = {
  ...DEFAULT_RENDER_STATE,
  blend: false,
  depthTest: true,
  depthCompare: "always" as const,
  depthWrite: true,
  cullMode: "none" as const
};

/** WebGL depth sampling requires a nearest, non-comparison sampler. */
export const DEPTH_TEXTURE_SAMPLER = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

type CopyVariant = "single" | "resolve4x";

interface CachedDraw {
  readonly variant: CopyVariant;
  readonly generation: number | undefined;
  readonly shader: RenderShaderProgram;
  readonly geometry: Geometry;
  readonly pipeline: RenderPipeline;
  unsubscribe?: () => void;
}

// Renderer builds a new graph/pass every frame. Keep one draw per device, not
// one leaked geometry per pass. The device owns the GPU resources and frees
// them on disposal; loss and generation changes retire our cached handles.
const cachedDraws = new WeakMap<RenderDevice, Map<CopyVariant, CachedDraw>>();
const copyOwners = new WeakMap<RenderTarget, { readonly device: RenderDevice; readonly generation: number | undefined }>();

function disposeCachedDraw(device: RenderDevice, cached: CachedDraw): void {
  const draws = cachedDraws.get(device);
  if (draws?.get(cached.variant) === cached) {
    draws.delete(cached.variant);
    if (draws.size === 0) cachedDraws.delete(device);
  }
  cached.unsubscribe?.();
  cached.pipeline.dispose();
  try { cached.geometry.dispose(); } finally { cached.shader.dispose(); }
}

function drawResources(device: RenderDevice, variant: CopyVariant): CachedDraw {
  for (const cached of cachedDraws.get(device)?.values() ?? []) {
    if (cached.generation !== device.generation || cached.shader.disposed) disposeCachedDraw(device, cached);
  }
  const existing = cachedDraws.get(device)?.get(variant);
  if (existing) return existing;

  const source = variant === "resolve4x" ? RESOLVE_SHADER : COPY_SHADER;
  const shader = device.createShaderProgram(source);
  let geometry: Geometry | undefined;
  let pipeline: RenderPipeline | undefined;
  try {
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [-1, -1, 0]);
    vertices.setAttribute(1, "position", [3, -1, 0]);
    vertices.setAttribute(2, "position", [-1, 3, 0]);
    geometry = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
    pipeline = new RenderPipeline({ label: source.label, shader, vertexFormat: vertices.format, topology: geometry.topology, renderState: DEPTH_COPY_RENDER_STATE });
    const cached: CachedDraw = { variant, generation: device.generation, shader, geometry, pipeline };
    let draws = cachedDraws.get(device);
    if (!draws) { draws = new Map(); cachedDraws.set(device, draws); }
    draws.set(variant, cached);
    cached.unsubscribe = device.onDeviceLost?.(() => disposeCachedDraw(device, cached));
    return cached;
  } catch (error) {
    const draws = cachedDraws.get(device);
    if (draws?.get(variant)?.shader === shader) {
      draws.delete(variant);
      if (draws.size === 0) cachedDraws.delete(device);
    }
    pipeline?.dispose();
    try { geometry?.dispose(); } finally { shader.dispose(); }
    throw error;
  }
}

function validateTargets(device: RenderDevice, input: RenderTarget, copy: RenderTarget): { readonly sourceDepth: Texture; readonly variant: CopyVariant; readonly reversed: boolean } {
  const owner = copyOwners.get(copy);
  if (device.disposed || device.contextLost || (owner && (owner.device !== device || owner.generation !== device.generation))) {
    throw new RenderDeviceError("Scene depth copy belongs to an unavailable or different device generation", "SCENE_DEPTH_COPY_DEVICE_UNAVAILABLE");
  }
  const samples = input.sampleCount ?? 1;
  if ((copy.sampleCount ?? 1) !== 1 || (device.kind === "webgpu" && samples !== 1 && samples !== 4)) {
    throw new RenderDeviceError("Scene depth resolve only supports single-sample and WebGPU 4x sources", "MULTISAMPLE_DEPTH_RESOLVE_UNSUPPORTED");
  }
  const variant: CopyVariant = device.kind === "webgpu" && samples === 4 ? "resolve4x" : "single";
  const sourceDepth = variant === "resolve4x" ? input.multisampledDepthTexture : input.depthTexture;
  const copyDepth = copy.depthTexture;
  if (input.disposed || copy.disposed || !sourceDepth || !copyDepth || sourceDepth.disposed || copyDepth.disposed ||
      sourceDepth.format !== "depth24" || copyDepth.format !== "depth24" ||
      sourceDepth.dimension !== "2d" || copyDepth.dimension !== "2d" ||
      (input.dimension ?? "2d") !== "2d" || (copy.dimension ?? "2d") !== "2d" ||
      input === copy || sourceDepth === copyDepth) {
    throw new RenderDeviceError("Scene depth copy requires distinct, live 2D depth attachments", "SCENE_DEPTH_COPY_INVALID_TARGET");
  }
  if (input.width !== copy.width || input.height !== copy.height ||
      sourceDepth.width !== input.width || sourceDepth.height !== input.height ||
      copyDepth.width !== copy.width || copyDepth.height !== copy.height) {
    throw new RenderDeviceError("Scene depth copy source and destination sizes must match", "SCENE_DEPTH_COPY_SIZE_MISMATCH");
  }
  if (device.kind === "webgpu" && (copy.depthOnly || copy.colorTexture.disposed)) {
    throw new RenderDeviceError("WebGPU scene depth copies require a color and depth attachment", "SCENE_DEPTH_COPY_INVALID_TARGET");
  }
  let reversed = false;
  if (variant === "resolve4x") {
    const depth = device.getDepthConvention?.();
    const standard = depth?.mode === "standard" && depth.clearValue === 1 && depth.compare === "less-equal";
    const reverse = depth?.mode === "reversed" && depth.clearValue === 0 && depth.compare === "greater-equal";
    if ((!standard && !reverse) || depth?.clipRange !== "zero-to-one") {
      throw new RenderDeviceError("Multisample scene depth resolve requires a consistent standard or reversed WebGPU depth convention", "SCENE_DEPTH_COPY_DEPTH_CONVENTION_UNSUPPORTED");
    }
    reversed = reverse;
  }
  // WebGL resolves its multisampled depth attachment when changing targets.
  // The mock preserves that route for command-level tests without claiming
  // that it simulates resolved GPU pixels.
  return { sourceDepth, variant, reversed };
}

export class SceneDepthCopyPass extends BaseRenderPass {
  constructor(
    private readonly input: RenderTarget,
    private readonly copy: RenderTarget,
    reads: readonly string[] = ["aura.scene.color.opaque"],
    private readonly onFailure?: () => void
  ) {
    super("prd01.scene-depth-copy", reads, ["aura.scene.depth.copy"]);
  }

  execute(context: RenderPassContext): void {
    try {
      const device = context.device;
      const { sourceDepth, variant, reversed } = validateTargets(device, this.input, this.copy);
      if (!device.getRenderTarget) throw new RenderDeviceError("Scene depth copy requires target state restoration", "SCENE_DEPTH_COPY_STATE_UNAVAILABLE");
      if (device.kind === "webgpu" && !device.drawChecked) throw new RenderDeviceError("WebGPU scene depth copy requires checked draw submission", "SCENE_DEPTH_COPY_SUBMISSION_UNAVAILABLE");
      const previous = device.getRenderTarget();
      const cached = drawResources(device, variant);
      const uniforms = new Map<string, UniformValue>([["u_depth", new TextureBinding({ name: "u_depth", texture: sourceDepth, sampler: DEPTH_TEXTURE_SAMPLER, required: true })]]);
      if (variant === "resolve4x") uniforms.set("u_reversedDepth", reversed ? 1 : 0);
      const command = cached.pipeline.createDrawCommand({
        label: variant === "resolve4x" ? RESOLVE_SHADER.label : COPY_SHADER.label,
        vertexBuffer: cached.geometry.vertexBuffer.upload(device),
        vertexCount: cached.geometry.vertexBuffer.vertexCount,
        uniforms
      });
      try {
        device.setRenderTarget(this.copy);
        if (device.kind === "webgpu") device.drawChecked!(command);
        else device.draw(command);
      } finally {
        device.setRenderTarget(previous);
      }
    } catch (error) {
      // Graph contributors may hold the predeclared target while the graph is
      // assembled; revoke it if the copy cannot complete in this frame.
      try { this.onFailure?.(); } catch (failure) {
        throw new AggregateError([error, failure], "Scene depth copy and publication revocation failed");
      }
      throw error;
    }
  }
}

/** Allocate a single-sample depth snapshot, retaining its creating device and generation. */
export function ensureSceneDepthCopyTarget(device: RenderDevice, current: RenderTarget | null, width: number, height: number): RenderTarget {
  if (device.disposed || device.contextLost) {
    throw new RenderDeviceError("Scene depth copy device is unavailable", "SCENE_DEPTH_COPY_DEVICE_UNAVAILABLE");
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RenderDeviceError("Scene depth copy dimensions must be positive and finite", "INVALID_RENDER_TARGET_SIZE", { width, height });
  }
  const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
  const owner = current ? copyOwners.get(current) : undefined;
  if (current && owner?.device === device && owner.generation === device.generation && !current.disposed &&
      current.depthTexture && !current.depthTexture.disposed && current.depthTexture.format === "depth24" &&
      current.depthTexture.dimension === "2d" && current.depthTexture.width === w && current.depthTexture.height === h &&
      (current.sampleCount ?? 1) === 1 && current.width === w && current.height === h &&
      (device.kind !== "webgpu" || (!current.depthOnly && !current.colorTexture.disposed))) return current;

  const next = device.createRenderTarget(device.kind === "webgpu"
    ? { label: "aura.scene.depth.copy", width: w, height: h, format: "rgba8", depth: "texture", sampleCount: 1 }
    : { label: "aura.scene.depth.copy", width: w, height: h, format: "rgba8", depthOnly: true, sampleCount: 1 });
  if (next.disposed || next.width !== w || next.height !== h || !next.depthTexture || next.depthTexture.disposed ||
      next.depthTexture.format !== "depth24" || next.depthTexture.dimension !== "2d" ||
      next.depthTexture.width !== w || next.depthTexture.height !== h || (next.sampleCount ?? 1) !== 1 ||
      (device.kind === "webgpu" && (next.depthOnly || next.colorTexture.disposed))) {
    next.dispose();
    throw new RenderDeviceError("Scene depth copy target has no live single-sample depth texture", "SCENE_DEPTH_COPY_INVALID_TARGET");
  }
  copyOwners.set(next, { device, generation: device.generation });
  try {
    if (current && owner?.device === device && !current.disposed) current.dispose();
  } catch (error) {
    copyOwners.delete(next);
    try { next.dispose(); } catch (failure) {
      throw new AggregateError([error, failure], "Scene depth target replacement and cleanup failed");
    }
    throw error;
  }
  return next;
}
