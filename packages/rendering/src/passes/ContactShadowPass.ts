// PRD-02 §6.5 — `ContactShadowPass`: R8 screen-space visibility mask in the
// C-01 `after-opaque` phase. Reads FRAME_RESOURCES.sceneDepthCopy when the
// C-01 prepass is real; with the stub it renders its own camera-space depth
// through PRD 02's DepthPass at half resolution. Ray-marches up to 16 steps
// along the primary shadowed light's view-space direction over `length`
// against linear depth with a `thickness` test and interleaved-gradient-noise
// jitter. The mask is applied inside that light's V_l only (§6.1) through the
// `a3d_prd02_contact_shadow` chunk — never to total colour.

import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { RenderBuffer, RenderDevice, RenderTarget, RenderShaderProgram, UniformValue } from "../RenderDevice";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { Sampler } from "../Sampler";
import { CONTACT_SHADOW_CHUNK_GLSL } from "../shaders/chunks/contact_shadow.glsl";
import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import type { RenderItem } from "../ForwardPass";
import { DepthPass, type DepthPassOptions } from "../DepthPass";
import { VertexFormat } from "../VertexFormat";

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
  };
  /** C-07-IN-2: real scene depth when the C-01 prepass is provided. */
  readonly sceneDepth?: {
    readonly texture: Texture | null;
    readonly available: boolean;
    readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean };
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
${CONTACT_SHADOW_CHUNK_GLSL}
void main() { o_vis = vec4(a3d_contactShadow(v_uv)); }
`;

/** @internal Contact-mask program sources (GLSL validation in unit tests). */
export const CONTACT_MASK_SHADER_SOURCES = { vertex: FULLSCREEN_VERT, fragment: MASK_FRAGMENT } as const;

export class ContactShadowPass extends BaseRenderPass {
  private mask: RenderTarget | null = null;
  private ownDepth: RenderTarget | null = null;
  private program: RenderShaderProgram | null = null;
  private triBuffer: RenderBuffer | null = null;
  private depthPass: DepthPass | null = null;
  private lastMask: Texture | null = null;
  private lastDepthSource: "scene" | "self" | "none" = "none";
  private executed = false;

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
  depthSource(): string { return this.lastDepthSource; }
  passExecuted(): boolean { return this.executed; }

  execute(context: RenderPassContext): void {
    const { device } = context;
    const prevTarget = device.getRenderTarget?.() ?? null;
    const w = Math.max(1, Math.floor(context.width / 2));
    const h = Math.max(1, Math.floor(context.height / 2));
    if (!this.mask || this.mask.width !== w || this.mask.height !== h) {
      this.mask?.dispose();
      this.mask = device.createRenderTarget({ width: w, height: h, format: "rgba8", label: MASK_LABEL });
    }
    let depthTex: Texture | null = null;
    if (this.input.sceneDepth?.available && this.input.sceneDepth.texture) {
      depthTex = this.input.sceneDepth.texture;
      this.lastDepthSource = "scene";
    } else if (this.depthPass) {
      if (!this.ownDepth || this.ownDepth.width !== w || this.ownDepth.height !== h) {
        this.ownDepth?.dispose();
        this.ownDepth = device.createRenderTarget({ width: w, height: h, format: "rgba8", depth: "texture", label: OWN_DEPTH_LABEL });
      }
      device.setRenderTarget(this.ownDepth);
      device.clear([0, 0, 0, 0]);
      this.depthPass.execute(context);
      depthTex = this.ownDepth.depthTexture ?? null;
      this.lastDepthSource = "self";
    } else {
      this.lastDepthSource = "none";
    }
    this.lastMask = null;
    this.executed = false;
    if (!depthTex) {
      device.setRenderTarget(this.mask);
      device.clear([1, 1, 1, 1]);
      this.lastMask = this.mask.colorTexture;
      device.setRenderTarget(prevTarget);
      return;
    }
    this.program ??= device.createShaderProgram({
      label: "a3d_prd02_contact_mask",
      marker: "@aura3d-shader:prd02_contact_mask",
      vertex: FULLSCREEN_VERT,
      fragment: MASK_FRAGMENT,
    });
    this.triBuffer ??= device.createBuffer(
      "vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3]));
    const o = this.input.options ?? {};
    const steps = Math.min(16, Math.max(1, o.steps ?? 12));
    const viewProjection = cameraViewProjection(this.input.camera);
    const sun = normalize3([this.input.sunDirection[0], this.input.sunDirection[1], this.input.sunDirection[2]]);
    device.setRenderTarget(this.mask);
    device.draw({
      label: "prd02-contact-shadow-mask",
      topology: "triangles",
      vertexBuffer: this.triBuffer,
      vertexFormat: new VertexFormat([{ semantic: "position", components: 2, offset: 0 }], 8),
      vertexCount: 3,
      renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" },
      shader: this.program,
      uniforms: new Map<string, UniformValue>([
        ["u_prd02ContactDepth", new TextureBinding({
          name: "u_prd02ContactDepth",
          texture: depthTex,
          sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        })],
        ["u_prd02ContactInvViewProj", invertMat4(viewProjection)],
        ["u_prd02ContactViewProj", viewProjection],
        ["u_prd02ContactSun", sun],
        ["u_prd02ContactParams", [o.length ?? 0.25, o.thickness ?? 0.05, steps, 0.9]],
        ["u_prd02ContactNearFar", [this.input.camera.near, this.input.camera.far, this.input.camera.orthographic ? 1 : 0]],
      ]),
    });
    this.lastMask = this.mask.colorTexture;
    this.executed = true;
    device.setRenderTarget(prevTarget);
  }
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
