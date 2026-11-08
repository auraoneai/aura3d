// PRD-02 §6.5 — `ContactShadowPass`: R8 screen-space visibility mask in the
// C-01 `after-opaque` phase. Reads FRAME_RESOURCES.sceneDepthCopy when the
// C-01 prepass is real; with the stub it renders its own camera-space depth
// through PRD 02's DepthPass at half resolution. Ray-marches up to 16 steps
// along the primary shadowed light's view-space direction over `length`
// against linear depth with a `thickness` test and interleaved-gradient-noise
// jitter. The mask is applied inside that light's V_l only (§6.1) through the
// `a3d_prd02_contact_shadow` chunk — never to total colour.

import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { RenderDeviceError, type RenderBuffer, type RenderDevice, type RenderTarget, type RenderShaderProgram, type ShaderSources, type UniformValue } from "../RenderDevice";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { Sampler } from "../Sampler";
import { CONTACT_SHADOW_CHUNK_GLSL } from "../shaders/chunks/contact_shadow.glsl";
import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import type { RenderItem } from "../ForwardPass";
import { DepthPass, type DepthPassOptions } from "../DepthPass";
import { VertexFormat } from "../VertexFormat";
import { clearContactShadowMaskTexture, createContactShadowMaskTarget, setContactShadowMask } from "../forward/contactShadowMaskStore";
import type { DepthConvention } from "../DepthConvention";

export const CONTACT_MASK_BLACKBOARD_KEY = "prd02.contactShadowMask";

export interface ContactShadowOptions {
  readonly length?: number;        // metres, default 0.25
  readonly thickness?: number;     // metres, default 0.05
  readonly steps?: number;         // 8 | 12 | 16, default 12
  readonly intensity?: number;     // default 1
}

export interface ContactShadowPassInput {
  /** Shadowed-light direction in world space (points toward the light). */
  readonly sunDirection: readonly [number, number, number];
  readonly camera: {
    readonly viewMatrix: Float32Array;
    readonly projectionMatrix: Float32Array;
    /**
     * The combined matrix the forward pass rasterizes with. The production renderer's frame camera carries only this
     * (its separate view/projection come through as identity), so the pass works from it when present and falls back
     * to `projectionMatrix * viewMatrix` otherwise.
     */
    readonly viewProjectionMatrix?: Float32Array;
    readonly near: number;
    readonly far: number;
    readonly orthographic?: boolean;
    readonly depth?: DepthConvention;
  };
  /** C-07-IN-2: real scene depth when the C-01 prepass is provided. */
  readonly sceneDepth?: {
    readonly texture: Texture | null;
    readonly available: boolean;
    readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean; readonly depth?: DepthConvention };
  };
  /** Fallback casters for the lane's own half-res depth render (C-01 stub). */
  readonly casters?: readonly RenderItem[];
  readonly depthPassOptions?: Omit<DepthPassOptions, "casters" | "viewProjectionMatrix">;
  readonly options?: ContactShadowOptions;
}

export interface ContactShadowProbe {
  readonly mask: { readonly width: number; readonly height: number; readonly min: number; readonly mean: number; readonly fractionBelow098: number } | null;
  readonly depth: { readonly width: number; readonly height: number; readonly coveredFraction: number; readonly min: number | null; readonly max: number | null } | null;
  readonly error?: string;
}

const MASK_LABEL = "a3d.prd02.contactShadowMask";
const OWN_DEPTH_LABEL = "a3d.prd02.contactDepth";

// GLSL ES 3.00: WebGL2Device.compileShader passes sources through verbatim,
// so without `#version 300 es` the `in`/`out`/`layout` declarations fail to
// compile and `lighting.contact` scenes never draw (02-S11, azure-gpu run
// 38184694289: "WebGL shader compile failed" on prd02-contact-cube).
const FULLSCREEN_VERT = /* glsl */ `#version 300 es
// @aura3d-shader:prd02_contact_mask
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const MASK_FRAGMENT = /* glsl */ `#version 300 es
// @aura3d-shader:prd02_contact_mask
precision highp float;
in vec2 v_uv;
layout(location = 0) out vec4 o_vis;
${CONTACT_SHADOW_CHUNK_GLSL
  .replace("float sceneZ = texture(u_prd02ContactDepth, uv).r;", "float sceneZ = texture(u_prd02ContactDepth, uv).r;\n  if (a3d_prd02ContactIsSky(sceneZ)) return 1.0;")
  .replace("float blockerZ = texture(u_prd02ContactDepth, suv).r;", "float blockerZ = texture(u_prd02ContactDepth, suv).r;\n    if (a3d_prd02ContactIsSky(blockerZ)) continue;")
  .replace("float a3d_contactShadow(vec2 uv) {", `// Cleared (sky) depth: the far plane is 1 under standard depth and 0 under reversed depth.
bool a3d_prd02ContactIsSky(float z) {
  return u_prd02ContactDepthMode.x > 0.5 ? z <= 0.000001 : z >= 0.999999;
}

float a3d_contactShadow(vec2 uv) {`)}
void main() { o_vis = vec4(a3d_contactShadow(v_uv)); }
`;

// WebGPU attachments, fragment positions and texture coordinates have a top-left
// origin. World reconstruction and projection use the same OpenGL-style camera
// matrix as the depth pass; depth samples are the remapped [0,1] raster values.
const FULLSCREEN_VERT_WGSL = /* wgsl */ `
// @aura3d-shader:prd02_contact_mask
/* @aura3d-bindings */
struct ContactVertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, };
@vertex fn vs_main(@location(0) position: vec2<f32>) -> ContactVertex {
  var out: ContactVertex;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return out;
}
`;

const MASK_FRAGMENT_WGSL = /* wgsl */ `
// @aura3d-shader:prd02_contact_mask
/* @aura3d-bindings */
fn contactDepth(uv: vec2<f32>) -> f32 {
  let size = vec2<f32>(textureDimensions(u_prd02ContactDepthTexture));
  let pixel = vec2<i32>(clamp(uv * size, vec2<f32>(0.0), size - vec2<f32>(1.0)));
  return textureLoad(u_prd02ContactDepthTexture, pixel, 0);
}
fn contactClipZ(z: f32) -> f32 {
  if (aura.u_prd02ContactDepthMode.y > 0.5) { return z; }
  return z * 2.0 - 1.0;
}
fn contactFarZ() -> f32 {
  if (aura.u_prd02ContactDepthMode.x > 0.5) { return 0.0; }
  return 1.0;
}
fn contactIsSky(z: f32) -> bool {
  if (aura.u_prd02ContactDepthMode.x > 0.5) { return z <= 0.000001; }
  return z >= 0.999999;
}
fn contactWorld(uv: vec2<f32>, z: f32) -> vec3<f32> {
  let clip = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, contactClipZ(z), 1.0);
  let world = aura.u_prd02ContactInvViewProj * clip;
  return world.xyz / world.w;
}
fn contactBehind(clip: vec4<f32>, p: vec3<f32>, blocker: vec3<f32>, uv: vec2<f32>) -> f32 {
  if (aura.u_prd02ContactNearFar.z > 0.5) {
    let farZ = contactFarZ();
    let viewDirection = normalize(contactWorld(uv, farZ) - contactWorld(uv, 1.0 - farZ));
    return dot(p - blocker, viewDirection);
  }
  return clip.w - (aura.u_prd02ContactViewProj * vec4<f32>(blocker, 1.0)).w;
}
@fragment fn fs_main(@location(0) uv: vec2<f32>, @builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let sceneZ = contactDepth(uv);
  if (contactIsSky(sceneZ)) { return vec4<f32>(1.0); }
  let pos = contactWorld(uv, sceneZ);
  let rayLength = aura.u_prd02ContactParams.x;
  let thickness = aura.u_prd02ContactParams.y;
  let steps = max(aura.u_prd02ContactParams.z, 1.0);
  let jitter = fract(52.9829189 * fract(0.06711056 * pixel.x + 0.00583715 * pixel.y)) * aura.u_prd02ContactParams.w;
  var occluded = 0.0;
  for (var i = 1; i <= 16; i++) {
    if (f32(i) > steps) { break; }
    let t = (f32(i) - jitter) / steps;
    let p = pos + aura.u_prd02ContactSun * (t * rayLength);
    let clip = aura.u_prd02ContactViewProj * vec4<f32>(p, 1.0);
    if (clip.w <= 0.0) { continue; }
    let ndc = clip.xyz / clip.w;
    let sampleUv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (any(sampleUv < vec2<f32>(0.0)) || any(sampleUv > vec2<f32>(1.0))) { continue; }
    let blockerZ = contactDepth(sampleUv);
    if (contactIsSky(blockerZ)) { continue; }
    let blocker = contactWorld(sampleUv, blockerZ);
    let behind = contactBehind(clip, p, blocker, sampleUv);
    if (behind > thickness && behind < rayLength * 2.0) { occluded = max(occluded, 1.0 - t); }
  }
  return vec4<f32>(1.0 - occluded);
}
`;

/** @internal Paired sources are exposed for offline validation and device tests. */
export const CONTACT_MASK_SHADER_SOURCES: ShaderSources = {
  label: "a3d_prd02_contact_mask", marker: "@aura3d-shader:prd02_contact_mask",
  vertex: FULLSCREEN_VERT, fragment: MASK_FRAGMENT,
  webgpu: { vertex: FULLSCREEN_VERT_WGSL, fragment: MASK_FRAGMENT_WGSL },
  portableBindings: [
    { name: "u_prd02ContactInvViewProj", kind: "mat4" },
    { name: "u_prd02ContactViewProj", kind: "mat4" },
    { name: "u_prd02ContactSun", kind: "vec3" },
    { name: "u_prd02ContactParams", kind: "vec4" },
    { name: "u_prd02ContactNearFar", kind: "vec3" },
    { name: "u_prd02ContactDepthMode", kind: "vec2" },
    { name: "u_prd02ContactDepth", kind: "depth2d", required: true }
  ]
};

export class ContactShadowPass extends BaseRenderPass {
  private mask: RenderTarget | null = null;
  private ownDepth: RenderTarget | null = null;
  private program: RenderShaderProgram | null = null;
  private triBuffer: RenderBuffer | null = null;
  private depthPass: DepthPass | null = null;
  private lastMask: Texture | null = null;
  private lastDepthSource: "scene" | "self" | "none" = "none";
  private executed = false;
  private owner: RenderDevice | null = null;
  private ownerGeneration: number | undefined;
  private unsubscribeLoss: (() => void) | undefined;

  constructor(private input: ContactShadowPassInput) {
    super("prd02-contact-shadows", [MASK_LABEL], [MASK_LABEL]);
    this.configure(input);
  }

  /**
   * Re-point the pass at this frame's camera, light and casters while keeping its
   * render targets and program (WP-4: the contributor reuses one pass per device
   * instead of allocating a mask and depth target every frame).
   */
  configure(input: ContactShadowPassInput): void {
    this.input = input;
    if (!input.sceneDepth?.available && input.casters?.length) {
      this.depthPass = new DepthPass({
        casters: input.casters,
        viewProjectionMatrix: cameraViewProjection(input.camera),
        ...(input.depthPassOptions ?? {}),
      });
    } else {
      this.depthPass = null;
    }
  }

  /**
   * Diagnostics-only readback of the mask and the pass's own depth target (opt-in from the contributor via
   * `globalThis.__A3D_CONTACT_PROBE__`; never on in production). It exists so a remote GPU run can tell "the mask is all
   * ones", "the depth pass drew nothing" and "the consumer never sampled it" apart, which pixel deltas alone cannot.
   */
  probe(device: RenderDevice): ContactShadowProbe {
    const previous = device.getRenderTarget?.() ?? null;
    let mask: ContactShadowProbe["mask"] = null;
    let depth: ContactShadowProbe["depth"] = null;
    try {
      if (this.mask && this.executed) {
        device.setRenderTarget(this.mask);
        const pixels = device.readPixels(0, 0, this.mask.width, this.mask.height);
        let min = 255;
        let sum = 0;
        let below = 0;
        const n = this.mask.width * this.mask.height;
        for (let i = 0; i < n; i += 1) {
          const r = pixels[i * 4]!;
          if (r < min) min = r;
          sum += r;
          if (r < 250) below += 1;
        }
        mask = { width: this.mask.width, height: this.mask.height, min: min / 255, mean: sum / n / 255, fractionBelow098: below / n };
      }
      if (this.ownDepth && device.readDepthPixels) {
        device.setRenderTarget(this.ownDepth);
        const values = device.readDepthPixels(0, 0, this.ownDepth.width, this.ownDepth.height);
        let min = 1;
        let max = 0;
        let covered = 0;
        for (let i = 0; i < values.length; i += 1) {
          const v = values[i]!;
          if (v < 0.9999) {
            covered += 1;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        depth = { width: this.ownDepth.width, height: this.ownDepth.height, coveredFraction: covered / values.length, min: covered ? min : null, max: covered ? max : null };
      }
    } catch (error) {
      return { mask, depth, error: error instanceof Error ? error.message : String(error) };
    } finally {
      device.setRenderTarget(previous);
    }
    return { mask, depth };
  }

  maskTexture(): Texture | null { return this.lastMask; }
  maskTarget(): RenderTarget | null { return this.executed ? this.mask : null; }
  depthSource(): string { return this.lastDepthSource; }
  passExecuted(): boolean { return this.executed; }

  private releaseResources(): void {
    this.lastMask = null;
    this.executed = false;
    this.lastDepthSource = "none";
    const resources = [this.mask, this.ownDepth, this.program, this.triBuffer];
    this.mask = null;
    this.ownDepth = null;
    this.program = null;
    this.triBuffer = null;
    const failures: unknown[] = [];
    for (const resource of resources) {
      if (!resource || resource.disposed) continue;
      try { resource.dispose(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Contact shadow resource disposal failed");
  }

  dispose(): void {
    const owner = this.owner;
    this.unsubscribeLoss?.();
    this.unsubscribeLoss = undefined;
    this.owner = null;
    if (owner) clearContactShadowMaskTexture(owner, this.mask?.colorTexture ?? null);
    this.releaseResources();
  }

  private prepareDevice(device: RenderDevice): void {
    if (device.disposed || device.contextLost) throw new RenderDeviceError("Contact shadow device is unavailable", "CONTACT_SHADOW_DEVICE_UNAVAILABLE");
    if (this.owner !== device || this.ownerGeneration !== device.generation) {
      if (this.owner) clearContactShadowMaskTexture(this.owner, this.mask?.colorTexture ?? null);
      this.unsubscribeLoss?.();
      this.unsubscribeLoss = undefined;
      this.releaseResources();
      this.owner = device;
      this.ownerGeneration = device.generation;
      this.unsubscribeLoss = device.onDeviceLost?.(() => {
        setContactShadowMask(device, undefined);
        this.releaseResources();
      });
    }
  }

  private target(device: RenderDevice, current: RenderTarget | null, width: number, height: number, depth: boolean): RenderTarget {
    if (current && !current.disposed && !current.colorTexture.disposed && current.width === width && current.height === height &&
        (!depth || (current.depthTexture && !current.depthTexture.disposed))) return current;
    const next = depth
      ? device.createRenderTarget({ width, height, format: "rgba8", depth: "texture", label: OWN_DEPTH_LABEL })
      : createContactShadowMaskTarget(device, width, height);
    if (next.disposed || next.colorTexture.disposed || next.width !== width || next.height !== height ||
        next.colorTexture.width !== width || next.colorTexture.height !== height || (next.sampleCount ?? 1) !== 1 ||
        (depth && (!next.depthTexture || next.depthTexture.disposed || next.depthTexture.format !== "depth24" || next.depthTexture.dimension !== "2d"))) {
      next.dispose();
      throw new RenderDeviceError("Contact shadow target has invalid attachments", "CONTACT_SHADOW_TARGET_INVALID");
    }
    try { current?.dispose(); } catch (error) {
      try { next.dispose(); } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Contact shadow target replacement failed");
      }
      throw error;
    }
    return next;
  }

  execute(context: RenderPassContext): void {
    const { device } = context;
    this.lastMask = null;
    this.executed = false;
    this.lastDepthSource = "none";
    this.prepareDevice(device);
    if (!device.getRenderTarget) throw new RenderDeviceError("Contact shadows require target state restoration", "CONTACT_SHADOW_STATE_UNAVAILABLE");
    if (device.kind === "webgpu" && !device.drawChecked) throw new RenderDeviceError("WebGPU contact shadows require checked draw submission", "CONTACT_SHADOW_SUBMISSION_UNAVAILABLE");
    if (![context.width, context.height].every((value) => Number.isSafeInteger(value) && value > 0)) throw new RenderDeviceError("Contact shadow dimensions must be positive integers", "CONTACT_SHADOW_SIZE_INVALID");
    const depthMode = contactShadowDepthMode(this.input.camera.depth);
    const sceneDepthConvention = this.input.sceneDepth?.available ? this.input.sceneDepth.linearize.depth : undefined;
    if (sceneDepthConvention) {
      const sceneMode = contactShadowDepthMode(sceneDepthConvention);
      if (sceneMode[0] !== depthMode[0] || sceneMode[1] !== depthMode[1]) {
        throw new RenderDeviceError("Contact shadow scene depth and camera use different depth conventions", "CONTACT_SHADOW_DEPTH_CONVENTION_UNSUPPORTED");
      }
    }
    const o = this.input.options ?? {};
    if (![o.length ?? 0.25, o.thickness ?? 0.05, o.steps ?? 12, o.intensity ?? 1].every(Number.isFinite) ||
        (o.length ?? 0.25) < 0 || (o.thickness ?? 0.05) < 0 || (o.steps ?? 12) < 1 || (o.intensity ?? 1) < 0 ||
        !this.input.sunDirection.every(Number.isFinite) || Math.hypot(...this.input.sunDirection) === 0) {
      throw new RenderDeviceError("Contact shadow options and light direction must be finite and valid", "CONTACT_SHADOW_INPUT_INVALID");
    }
    const viewProjection = cameraViewProjection(this.input.camera);
    // Resolve the inverse before drawing any caster so a bad camera cannot
    // leave a partly rendered depth frame behind and then publish it.
    const invViewProjection = invertMat4(viewProjection);
    const prevTarget = device.getRenderTarget();
    const w = Math.max(1, Math.floor(context.width / 2));
    const h = Math.max(1, Math.floor(context.height / 2));
    try {
      this.mask = this.target(device, this.mask, w, h, false);
      let depthTex: Texture | null = null;
      if (this.input.sceneDepth?.available && this.input.sceneDepth.texture) {
        depthTex = this.input.sceneDepth.texture;
        this.lastDepthSource = "scene";
      } else if (this.depthPass) {
        this.ownDepth = this.target(device, this.ownDepth, w, h, true);
        device.setRenderTarget(this.ownDepth);
        device.clear([0, 0, 0, 0]);
        this.depthPass.execute({ device, width: w, height: h });
        depthTex = this.ownDepth.depthTexture ?? null;
        this.lastDepthSource = "self";
      }
      if (!depthTex) {
        device.setRenderTarget(this.mask);
        device.clear([1, 1, 1, 1]);
        this.lastMask = this.mask.colorTexture;
        return;
      }
      // WebGL also permits a color texture containing depth in its red channel;
      // WebGPU's depth2d binding specifically requires a depth attachment.
      if (depthTex.disposed || depthTex.dimension !== "2d" || (device.kind === "webgpu" && depthTex.format !== "depth24")) throw new RenderDeviceError("Contact shadows require a live compatible 2D depth texture", "CONTACT_SHADOW_DEPTH_INVALID");
      this.program ??= device.createShaderProgram(CONTACT_MASK_SHADER_SOURCES);
      this.triBuffer ??= device.createBuffer("vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3]));
      const steps = Math.min(16, Math.max(1, o.steps ?? 12));
      const sun = normalize3([this.input.sunDirection[0], this.input.sunDirection[1], this.input.sunDirection[2]]);
      device.setRenderTarget(this.mask);
      const command = {
        label: "prd02-contact-shadow-mask",
        topology: "triangles" as const,
        vertexBuffer: this.triBuffer,
        vertexFormat: new VertexFormat([{ semantic: "position", components: 2, offset: 0 }], 8),
        vertexCount: 3,
        renderState: { depthTest: false, depthWrite: false, cullMode: "none" as const, blend: false, depthCompare: "always" as const },
        shader: this.program,
        uniforms: new Map<string, UniformValue>([
          ["u_prd02ContactDepth", new TextureBinding({
            name: "u_prd02ContactDepth",
            texture: depthTex,
            sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
          })],
          ["u_prd02ContactInvViewProj", invViewProjection],
          ["u_prd02ContactViewProj", viewProjection],
          ["u_prd02ContactSun", sun],
          ["u_prd02ContactParams", [o.length ?? 0.25, o.thickness ?? 0.05, steps, 0.9]],
          ["u_prd02ContactNearFar", [this.input.camera.near, this.input.camera.far, this.input.camera.orthographic ? 1 : 0]],
          ["u_prd02ContactDepthMode", depthMode],
        ])
      };
      if (device.kind === "webgpu") device.drawChecked!(command);
      else device.draw(command);
      this.lastMask = this.mask.colorTexture;
      this.executed = true;
    } catch (error) {
      this.lastMask = null;
      this.executed = false;
      throw error;
    } finally {
      device.setRenderTarget(prevTarget);
    }
  }
}

/**
 * Shader depth mode for the mask: [reversed 0|1, zero-to-one projection 0|1].
 * Standard and reversed depth (in either projection clip range) are supported;
 * the camera matrix the mask unprojects with is the one the depth was
 * rasterized with, so only the stored-depth decoding and the cleared (far)
 * value change. Logarithmic depth is not a projective encoding and is refused.
 * @internal
 */
export function contactShadowDepthMode(convention: Pick<DepthConvention, "mode" | "clipRange"> | undefined): [number, number] {
  if (!convention) return [0, 0];
  if (convention.mode === "logarithmic" || (convention.mode !== "standard" && convention.mode !== "reversed")) {
    throw new RenderDeviceError("Contact shadows require standard or reversed depth", "CONTACT_SHADOW_DEPTH_CONVENTION_UNSUPPORTED");
  }
  if (convention.clipRange !== "minus-one-to-one" && convention.clipRange !== "zero-to-one") {
    throw new RenderDeviceError("Contact shadows require a known depth clip range", "CONTACT_SHADOW_DEPTH_CONVENTION_UNSUPPORTED");
  }
  return [convention.mode === "reversed" ? 1 : 0, convention.clipRange === "zero-to-one" ? 1 : 0];
}

function cameraViewProjection(camera: ContactShadowPassInput["camera"]): Mat4 {
  return (camera.viewProjectionMatrix ?? multiplyMat4(
    camera.projectionMatrix as unknown as Mat4,
    camera.viewMatrix as unknown as Mat4)) as unknown as Mat4;
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
