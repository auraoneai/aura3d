// GU47 E-E (WP-5): `effects.outline({ targets })` — only the named nodes' silhouettes get ink.
//
// Design (no ForwardPass edit): after the post chain has written the final image, a cheap mask pass draws ONLY the
// target items through the PRD-02 camera depth program (`DepthPass` with the caster-variant resolver, so skinned,
// instanced and `castShadow` custom-vertex targets keep their real silhouette) into a private depth texture: the target
// mask (1.0 = no target). A fullscreen ink draw then blends the outline colour onto the output on the pixels just
// outside the mask (a ring `width` px wide). With the scene depth bound, a target pixel hidden behind other geometry
// does not count as covered, so only the visible silhouette is inked; without it the ring is drawn x-ray style.
// Scenes whose outline has no `targets` never reach this file: their full-frame luma outline is unchanged.

import type { RenderBuffer, RenderDevice, RenderShaderProgram, RenderTarget, UniformValue } from "../RenderDevice";
import type { RenderItem } from "../ForwardPass";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { Sampler } from "../Sampler";
import { VertexFormat } from "../VertexFormat";
import { DepthPass } from "../DepthPass";
import { createLeanCoreShaderLibrary, type ShaderLibrary } from "../ShaderLibraryCore";
import { prd02DepthFeatures, registerPrd02DepthShader, resolvePrd02ShadowCasterVariant } from "../shadows/Prd02DepthShaderLibrary";
import { QUALITY_TIERS } from "../contracts/quality";
import { rendererQrFlags } from "./FrameGraph";

/** Shader marker of the ink program. */
export const OUTLINE_TARGET_SHADER_MARKER = "@aura3d-shader:gu47_outline_targets";
export const OUTLINE_TARGET_MASK_LABEL = "a3d.gu47.outlineTargetMask";
/** Widest ring the ink shader samples (the compiler clamps `width` to 1..6 px). */
export const OUTLINE_TARGET_MAX_RADIUS = 6;
/** Window-space depth slack for the visibility test (the mask and the forward pass rasterize the same geometry). */
export const OUTLINE_TARGET_DEPTH_BIAS = 2e-4;
/** Mask depth at or above this is "no target" (the mask clears to 1.0). */
export const OUTLINE_TARGET_EMPTY_DEPTH = 0.99999;

/** The ring offsets the shader and the CPU mirror sample, per radius step: 4 axis and 4 diagonal neighbours. */
export const OUTLINE_TARGET_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]
];

/** The renderer's outline options with the GU47 field (`RendererPostProcessOptions.outline`). */
export interface OutlineTargetOptions {
  /** Node names whose silhouettes get ink; when present the full-frame luma outline does not run. */
  readonly targets?: readonly string[];
  readonly color?: readonly [number, number, number, number];
  readonly width?: number;
  readonly opacity?: number;
}

/**
 * The outline's target list, or `null` when the outline is absent or has no `targets` field (today's full-frame
 * outline). An empty list is a targeted outline with nothing to ink.
 */
export function outlineTargetsOf(outline: unknown): readonly string[] | null {
  if (outline === null || typeof outline !== "object") return null;
  const targets = (outline as { readonly targets?: unknown }).targets;
  if (!Array.isArray(targets)) return null;
  return targets.filter((name): name is string => typeof name === "string" && name.length > 0);
}

/**
 * Whether a render item belongs to one of the target nodes. The engine labels scene items
 * `primitive-<i>:<resource>:<node name>` and model meshes `actor-<i>:mesh-<j>:<model id>:<mesh>...` (the model id is
 * the node's runtime id, else its asset id); any other item matches only by its exact label.
 */
export function outlineTargetLabelMatches(label: string | undefined, targets: ReadonlySet<string>): boolean {
  if (!label || targets.size === 0) return false;
  if (targets.has(label)) return true;
  const actor = /^actor-\d+:mesh-\d+:(.*)$/.exec(label);
  if (actor) {
    const rest = actor[1]!;
    for (const target of targets) if (rest === target || rest.startsWith(`${target}:`)) return true;
    return false;
  }
  if (/^primitive-\d+:/.test(label)) {
    for (const target of targets) if (label.endsWith(`:${target}`)) return true;
  }
  return false;
}

/** The items the mask pass draws: only those whose label names a target. */
export function selectOutlineTargetItems(items: Iterable<RenderItem>, targets: readonly string[]): RenderItem[] {
  const set = new Set(targets);
  const out: RenderItem[] = [];
  if (set.size === 0) return out;
  for (const item of items) if (outlineTargetLabelMatches(item.label, set)) out.push(item);
  return out;
}

/**
 * CPU mirror of the ink shader. `covered` is the visible-target mask (row-major, non-zero = a visible target pixel);
 * returns 1 where the shader writes ink: pixels outside the mask with a covered pixel at one of the
 * {@link OUTLINE_TARGET_DIRECTIONS} offsets times 1..`radius`. Out-of-frame samples are not covered.
 */
export function outlineTargetInkMask(covered: ArrayLike<number>, width: number, height: number, radius: number): Uint8Array {
  const r = Math.max(1, Math.min(OUTLINE_TARGET_MAX_RADIUS, Math.round(radius)));
  const ink = new Uint8Array(width * height);
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && (covered[y * width + x] ?? 0) !== 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y)) continue;
      search: for (let step = 1; step <= r; step += 1) {
        for (const [dx, dy] of OUTLINE_TARGET_DIRECTIONS) {
          if (at(x + dx * step, y + dy * step)) {
            ink[y * width + x] = 1;
            break search;
          }
        }
      }
    }
  }
  return ink;
}

/**
 * CPU mirror of the shader's visibility test: a pixel is a covered target pixel when the mask depth is below
 * {@link OUTLINE_TARGET_EMPTY_DEPTH} and (with scene depth) not behind the scene surface by more than the bias.
 */
export function outlineTargetCoverage(maskDepth: ArrayLike<number>, sceneDepth?: ArrayLike<number> | null): Uint8Array {
  const out = new Uint8Array(maskDepth.length);
  for (let i = 0; i < maskDepth.length; i += 1) {
    const d = maskDepth[i] ?? 1;
    if (d >= OUTLINE_TARGET_EMPTY_DEPTH) continue;
    if (sceneDepth && d > (sceneDepth[i] ?? 1) + OUTLINE_TARGET_DEPTH_BIAS) continue;
    out[i] = 1;
  }
  return out;
}

const FULLSCREEN_VERT = /* glsl */ `#version 300 es
// ${OUTLINE_TARGET_SHADER_MARKER}
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const DIRECTIONS_GLSL = OUTLINE_TARGET_DIRECTIONS.map(([x, y]) => `vec2(${x.toFixed(1)}, ${y.toFixed(1)})`).join(", ");

const INK_FRAGMENT = /* glsl */ `#version 300 es
// ${OUTLINE_TARGET_SHADER_MARKER}
precision highp float;
in vec2 v_uv;
uniform sampler2D u_outlineMask;
uniform sampler2D u_outlineScene;
uniform vec4 u_outlineColor;
uniform vec4 u_outlineParams;
uniform vec2 u_outlineTexel;
layout(location = 0) out vec4 o_color;
const vec2 OUTLINE_DIRS[8] = vec2[8](${DIRECTIONS_GLSL});
bool coveredAt(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return false;
  float d = texture(u_outlineMask, uv).r;
  if (d >= ${OUTLINE_TARGET_EMPTY_DEPTH.toFixed(5)}) return false;
  return u_outlineParams.z < 0.5 || d <= texture(u_outlineScene, uv).r + u_outlineParams.y;
}
void main() {
  if (coveredAt(v_uv)) discard;
  for (int step = 1; step <= ${OUTLINE_TARGET_MAX_RADIUS}; step++) {
    if (float(step) > u_outlineParams.x) break;
    for (int k = 0; k < 8; k++) {
      if (coveredAt(v_uv + OUTLINE_DIRS[k] * float(step) * u_outlineTexel)) {
        o_color = u_outlineColor;
        return;
      }
    }
  }
  discard;
}
`;

/** @internal Ink program sources (GLSL validation in unit tests). */
export const OUTLINE_TARGET_SHADER_SOURCES = { vertex: FULLSCREEN_VERT, fragment: INK_FRAGMENT } as const;

export interface OutlineTargetPassInput {
  /** This frame's render items (the renderer's `postFrameContext.items`). */
  readonly items: readonly RenderItem[];
  readonly targets: readonly string[];
  /** The matrix the forward pass rasterized with. */
  readonly viewProjectionMatrix: Float32Array | readonly number[];
  readonly width: number;
  readonly height: number;
  /** RGBA 0..255 (the compiler's outline colour). Default the compiler default #ff9822. */
  readonly color?: readonly [number, number, number, number];
  /** Ring width in px, 1..6. Default 3. */
  readonly radius?: number;
  /** 0..1. Default 0.9. */
  readonly opacity?: number;
  /** Resolved scene depth of the forward target; enables the visible-silhouette test. */
  readonly sceneDepth?: Texture | null;
  /** Where the ink blends; `null` = the canvas. */
  readonly output: RenderTarget | null;
}

/** What the last targeted outline did (diagnostics and tests). */
export interface OutlineTargetRecord {
  readonly targets: readonly string[];
  /** Labels of the items the mask pass drew, in draw order. */
  readonly maskItems: readonly string[];
  /** True when the ink draw ran (there was at least one target item). */
  readonly inked: boolean;
  readonly occlusion: "scene-depth" | "none";
  readonly radius: number;
}

let lastRecord: OutlineTargetRecord | null = null;

/** The last targeted outline this process ran, or `null`. */
export function lastOutlineTargetRecord(): OutlineTargetRecord | null {
  return lastRecord;
}

/** Test hook. */
export function resetOutlineTargetRecord(): void {
  lastRecord = null;
}

const depthLibraries = new WeakMap<object, ShaderLibrary>();

function depthLibraryFor(device: object): ShaderLibrary {
  let library = depthLibraries.get(device);
  if (!library) {
    library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    depthLibraries.set(device, library);
  }
  return library;
}

const NEAREST = (): Sampler => new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

/** The mask target, the ink program and the fullscreen triangle, kept per device across frames. */
export class OutlineTargetPass {
  private mask: RenderTarget | null = null;
  private program: RenderShaderProgram | null = null;
  private triangle: RenderBuffer | null = null;

  constructor(private readonly device: RenderDevice) {}

  execute(input: OutlineTargetPassInput): OutlineTargetRecord {
    const device = this.device;
    const radius = Math.max(1, Math.min(OUTLINE_TARGET_MAX_RADIUS, Math.round(input.radius ?? 3)));
    const targetItems = selectOutlineTargetItems(input.items, input.targets);
    const sceneDepth = input.sceneDepth ?? null;
    const record: OutlineTargetRecord = {
      targets: [...input.targets],
      maskItems: targetItems.map((item) => item.label ?? "item"),
      inked: targetItems.length > 0,
      occlusion: sceneDepth ? "scene-depth" : "none",
      radius
    };
    lastRecord = record;
    if (targetItems.length === 0) return record;
    const previous = device.getRenderTarget?.() ?? null;
    const width = Math.max(1, Math.floor(input.width));
    const height = Math.max(1, Math.floor(input.height));
    if (!this.mask || this.mask.disposed || this.mask.width !== width || this.mask.height !== height) {
      this.mask?.dispose();
      this.mask = device.createRenderTarget({ width, height, format: "rgba8", depth: "texture", label: OUTLINE_TARGET_MASK_LABEL });
    }
    const context = { device, width, height };
    try {
      device.setRenderTarget(this.mask);
      device.clear([0, 0, 0, 0]);
      const features = prd02DepthFeatures();
      const flags = rendererQrFlags();
      new DepthPass({
        casters: targetItems,
        viewProjectionMatrix: input.viewProjectionMatrix,
        shaderLibrary: depthLibraryFor(device),
        variantResolver: (item: RenderItem) => resolvePrd02ShadowCasterVariant(item, flags, QUALITY_TIERS.high, features),
        depthVariantFeatures: features
      }).execute(context);
      const maskDepth = this.mask.depthTexture;
      if (!maskDepth) return { ...record, inked: false };
      this.program ??= device.createShaderProgram({
        label: "a3d_gu47_outline_targets",
        marker: OUTLINE_TARGET_SHADER_MARKER,
        vertex: FULLSCREEN_VERT,
        fragment: INK_FRAGMENT
      });
      this.triangle ??= device.createBuffer("vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3]));
      const color = input.color ?? [255, 152, 34, 255];
      const opacity = Math.max(0, Math.min(1, input.opacity ?? 0.9)) * ((color[3] ?? 255) / 255);
      device.setRenderTarget(input.output);
      device.draw({
        label: "gu47-outline-targets-ink",
        topology: "triangles",
        vertexBuffer: this.triangle,
        vertexFormat: new VertexFormat([{ semantic: "position", components: 2, offset: 0 }], 8),
        vertexCount: 3,
        renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: true, depthCompare: "always" },
        shader: this.program,
        uniforms: new Map<string, UniformValue>([
          ["u_outlineMask", new TextureBinding({ name: "u_outlineMask", texture: maskDepth, sampler: NEAREST() })],
          ["u_outlineScene", new TextureBinding({ name: "u_outlineScene", texture: sceneDepth ?? maskDepth, sampler: NEAREST() })],
          ["u_outlineColor", [color[0] / 255, color[1] / 255, color[2] / 255, opacity]],
          ["u_outlineParams", [radius, OUTLINE_TARGET_DEPTH_BIAS, sceneDepth ? 1 : 0, 0]],
          ["u_outlineTexel", [1 / width, 1 / height]]
        ])
      });
      return record;
    } finally {
      device.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.mask?.dispose();
    this.mask = null;
    this.triangle?.dispose();
    this.triangle = null;
    this.program = null;
  }
}

const passes = new WeakMap<RenderDevice, OutlineTargetPass>();

/** The per-device pass (one mask target and program per device). */
export function outlineTargetPassFor(device: RenderDevice): OutlineTargetPass {
  let pass = passes.get(device);
  if (!pass) {
    pass = new OutlineTargetPass(device);
    passes.set(device, pass);
  }
  return pass;
}
