/**
 * PRD-10 §9.1 step 5 / T4.3 — `SceneCopyFallback`. In `after-opaque` it writes
 * `prd10.scene.color.copy` / `prd10.scene.depth.copy` so the water fragment
 * can refract/depth-test. When another contributor already published the
 * shared `FRAME_RESOURCES.sceneColorCopy`/`sceneDepthCopy` textures on the
 * blackboard this pass returns empty writes — we read theirs instead.
 *
 * The blit is a fullscreen triangle through the RenderDevice (no canvas
 * copy API exists); each copy is its own rgba8 target — depth copies pack
 * linear depth into RGBA (encode/decode pair in the shader) because the
 * abstract target formats don't include a depth-only texture.
 */
import type { RenderBuffer, RenderDevice, RenderTarget, RenderShaderProgram, UniformValue } from "../../RenderDevice.js";
import type { RenderPass, RenderPassContext } from "../../RenderPass.js";
import { VertexBuffer } from "../../VertexBuffer.js";
import { VertexFormat } from "../../VertexFormat.js";
import { TextureBinding } from "../../TextureBinding.js";
import { Sampler } from "../../Sampler.js";
import type { Texture } from "../../Texture.js";
import { FRAME_RESOURCES, type FrameContributorContext } from "../../contracts/frameGraph.js";

export const SCENE_COPY_COLOR_KEY = "prd10.scene.color.copy";
export const SCENE_COPY_DEPTH_KEY = "prd10.scene.depth.copy";

const COPY_FORMAT = new VertexFormat([{ semantic: "position", components: 2, offset: 0, shaderName: "a_pos" }]);
const COPY_SAMPLER = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

const COPY_VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const COPY_COLOR_FRAG = /* glsl */ `#version 300 es
precision highp float;
// prd10.sceneCopy — RenderDevice shader marker.
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 o_color;
void main() { o_color = texture(u_src, v_uv); }
`;

const COPY_DEPTH_FRAG = /* glsl */ `#version 300 es
precision highp float;
// prd10.sceneCopy — RenderDevice shader marker.
in vec2 v_uv;
uniform highp sampler2D u_src;
uniform vec2 u_depthUnpack;   // near, far — packed to RGBA8 for storage
out vec4 o_color;
void main() {
  float z = texture(u_src, v_uv).r;
  float lin = (2.0 * u_depthUnpack.x * u_depthUnpack.y) / max(u_depthUnpack.y + u_depthUnpack.x - (z * 2.0 - 1.0) * (u_depthUnpack.y - u_depthUnpack.x), 1e-6);
  float n = clamp(lin / u_depthUnpack.y, 0.0, 1.0);
  // pack linear depth into RGBA8 (16.16 fixed-ish: R=high byte, G=low byte)
  float hi = floor(n * 255.0);
  o_color = vec4(hi / 255.0, fract(n * 255.0), 0.0, 1.0);
}
`;

interface DeviceCopyState {
  programColor: RenderShaderProgram | null;
  programDepth: RenderShaderProgram | null;
  vb: RenderBuffer | null;
  colorTarget: RenderTarget | null;
  depthTarget: RenderTarget | null;
}

const states = new WeakMap<RenderDevice, DeviceCopyState>();

function stateFor(device: RenderDevice): DeviceCopyState {
  let s = states.get(device);
  if (!s) {
    s = { programColor: null, programDepth: null, vb: null, colorTarget: null, depthTarget: null };
    states.set(device, s);
  }
  return s;
}

/** Textures the water shader binds; null when this frame had no copy. */
export interface SceneCopyResult {
  readonly color: Texture | null;
  readonly depth: Texture | null;
  /** True when the shared FRAME_RESOURCES copies exist (published elsewhere). */
  readonly shared: boolean;
}

/** Resolve the scene copies the water pass should bind this frame. */
export function sceneCopyTextures(ctx: FrameContributorContext): SceneCopyResult {
  const sharedColor = ctx.blackboard.get(FRAME_RESOURCES.sceneColorCopy) as Texture | undefined;
  const sharedDepth = ctx.blackboard.get(FRAME_RESOURCES.sceneDepthCopy) as Texture | undefined;
  if (sharedColor && sharedDepth) return { color: sharedColor, depth: sharedDepth, shared: true };
  return {
    color: (ctx.blackboard.get(SCENE_COPY_COLOR_KEY) as Texture | undefined) ?? null,
    depth: (ctx.blackboard.get(SCENE_COPY_DEPTH_KEY) as Texture | undefined) ?? null,
    shared: false
  };
}

/**
 * The `after-opaque` pass. Reads the live scene color/depth when the device
 * exposes them (`ctx.sceneDepth.texture`, blackboard `aura.scene.color`),
 * draws the fullscreen copies, and publishes them under `prd10.scene.*`.
 */
export function sceneCopyFallbackPass(ctx: FrameContributorContext): RenderPass {
  return {
    name: "prd10.sceneCopy",
    reads: [FRAME_RESOURCES.sceneColor, FRAME_RESOURCES.sceneDepth],
    writes: [SCENE_COPY_COLOR_KEY, SCENE_COPY_DEPTH_KEY],
    execute(rp: RenderPassContext) {
      const device = rp.device;
      // Another contributor's shared copies win — nothing to do.
      if (ctx.blackboard.get(FRAME_RESOURCES.sceneColorCopy) && ctx.blackboard.get(FRAME_RESOURCES.sceneDepthCopy)) return;
      const depthSrc = ctx.sceneDepth.available ? ctx.sceneDepth.texture : null;
      const colorSrc = (ctx.blackboard.get(FRAME_RESOURCES.sceneColor) as Texture | undefined) ?? null;
      if (!depthSrc && !colorSrc) return; // nothing to copy — water takes the Low path
      const s = stateFor(device);
      const w = rp.width | 0;
      const h = rp.height | 0;
      if (w <= 0 || h <= 0) return;
      s.programColor ??= device.createShaderProgram({
        label: "prd10.sceneCopy.color", marker: "prd10.sceneCopy", vertex: COPY_VERT, fragment: COPY_COLOR_FRAG
      });
      s.programDepth ??= device.createShaderProgram({
        label: "prd10.sceneCopy.depth", marker: "prd10.sceneCopy", vertex: COPY_VERT, fragment: COPY_DEPTH_FRAG
      });
      if (!s.vb) {
        const tri = new VertexBuffer(COPY_FORMAT, 3);
        tri.setAttribute(0, "position", [-1, -1]);
        tri.setAttribute(1, "position", [3, -1]);
        tri.setAttribute(2, "position", [-1, 3]);
        s.vb = device.createBuffer("vertex", tri.byteLength, new Uint8Array(tri.data));
      }
      const rtOk = (t: RenderTarget | null) => t && (t as { width?: number }).width === w && (t as { height?: number }).height === h;
      if (!rtOk(s.colorTarget)) {
        s.colorTarget?.dispose();
        s.colorTarget = device.createRenderTarget({ width: w, height: h, label: SCENE_COPY_COLOR_KEY, format: "rgba8", depth: false });
      }
      if (!rtOk(s.depthTarget)) {
        s.depthTarget?.dispose();
        s.depthTarget = device.createRenderTarget({ width: w, height: h, label: SCENE_COPY_DEPTH_KEY, format: "rgba8", depth: false });
      }
      if (colorSrc && s.colorTarget) {
        device.setRenderTarget(s.colorTarget);
        device.draw({
          label: "prd10.sceneCopy.color",
          topology: "triangles",
          vertexBuffer: s.vb,
          vertexFormat: COPY_FORMAT,
          vertexCount: 3,
          shader: s.programColor,
          uniforms: new Map<string, UniformValue>([["u_src", new TextureBinding({ name: "u_src", texture: colorSrc, sampler: COPY_SAMPLER })]])
        });
        device.setRenderTarget(null);
        ctx.blackboard.set(SCENE_COPY_COLOR_KEY, s.colorTarget.colorTexture);
      }
      if (depthSrc && s.depthTarget) {
        device.setRenderTarget(s.depthTarget);
        device.draw({
          label: "prd10.sceneCopy.depth",
          topology: "triangles",
          vertexBuffer: s.vb,
          vertexFormat: COPY_FORMAT,
          vertexCount: 3,
          shader: s.programDepth,
          uniforms: new Map<string, UniformValue>([
            ["u_src", new TextureBinding({ name: "u_src", texture: depthSrc, sampler: COPY_SAMPLER })],
            ["u_depthUnpack", new Float32Array([ctx.sceneDepth.linearize.near, ctx.sceneDepth.linearize.far])]
          ])
        });
        device.setRenderTarget(null);
        ctx.blackboard.set(SCENE_COPY_DEPTH_KEY, s.depthTarget.colorTexture);
      }
    }
  };
}
