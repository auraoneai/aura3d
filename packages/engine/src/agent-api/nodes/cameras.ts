/**
 * threejs-parity L7/SC-01: `cameras.cube` — three's `CubeCamera`.
 *
 * Emits an additive `"cube-camera"` scene node (the same builder-cast pattern
 * `probes.ts` uses for `"probe"`). The production runtime renders the scene
 * into a cube render target once per `updateEvery` frames via
 * `Renderer.renderProbeFace`; the captured cube texture is consumable as an
 * environment map by authored materials (`material.*({ envMap: { cubeCamera } })`
 * → `RenderItem.environmentCube`).
 */

import type { AuraCameraSpec, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "./types.js";
import type { RendererPostProcessOptions } from "@aura3d/rendering";
import { AuraNodeBuilder } from "./builder.js";
import { AuraRuntimeError } from "../compiler/errors.js";
import { STEREO_DEFAULT_EYE_SEPARATION, STEREO_DEFAULT_FOCUS } from "../stereoMath.js";
import { createChaseRig, type ChaseOptions, type ChaseRig } from "./chaseCamera.js";

export type AuraStereoLayout = "side-by-side" | "over-under";

/** Normalized viewport in [0, 1] of the render target, origin bottom-left (three/WebGL convention). */
export interface AuraCameraViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AuraCameraViewSettings {
  /** Stable identity for view-specific temporal and postprocess resources. */
  readonly id?: string;
  /** Overrides applied on top of the scene camera. Unset fields inherit it. */
  readonly camera?: Partial<AuraCameraSpec>;
  /** A normalized target-space clip rectangle; defaults to the viewport. */
  readonly scissor?: AuraCameraViewport;
  /** Inherit the scene's postprocessing when omitted; false disables it for this view. */
  readonly postprocess?: RendererPostProcessOptions | boolean;
}

export interface AuraCameraArrayEntry extends AuraCameraViewSettings {
  readonly viewport: AuraCameraViewport;
}

/** Per-eye overrides; an omitted viewport uses the selected stereo layout. */
export interface AuraStereoViewSettings extends AuraCameraViewSettings {
  readonly viewport?: AuraCameraViewport;
}

export interface AuraCameraArrayOptions {
  readonly name?: string;
  readonly cameras: readonly AuraCameraArrayEntry[];
}

export interface AuraStereoCameraOptions {
  readonly name?: string;
  /** Interocular distance in world units (three default 0.064). */
  readonly eyeSeparation?: number;
  /** Convergence distance (three default 10). */
  readonly focus?: number;
  /** Vertical fov in degrees; defaults to the scene camera's fov. */
  readonly fov?: number;
  /** three's `StereoCamera.aspect` multiplier; defaults to 0.5 side-by-side / 2 over-under so each eye keeps a correct aspect. */
  readonly aspect?: number;
  readonly zoom?: number;
  /** Eye placement: side-by-side (left eye left) or over-under (left eye on top). */
  readonly layout?: AuraStereoLayout;
  /** Independent left and right eye settings, in that order. */
  readonly views?: readonly [AuraStereoViewSettings, AuraStereoViewSettings];
}

export interface AuraCameraArrayNode {
  readonly kind: "camera-array";
  readonly name: string;
  readonly cameras: readonly AuraCameraArrayEntry[];
}

export interface AuraCameraStereoNode {
  readonly kind: "camera-stereo";
  readonly name: string;
  readonly eyeSeparation: number;
  readonly focus: number;
  readonly fov?: number;
  readonly aspect?: number;
  readonly zoom: number;
  readonly layout: AuraStereoLayout;
  readonly views?: readonly [AuraStereoViewSettings, AuraStereoViewSettings];
}

export function isAuraCameraArrayNode(node: { readonly kind: string }): node is AuraCameraArrayNode & AuraSceneNode {
  return node.kind === "camera-array";
}

export function isAuraCameraStereoNode(node: { readonly kind: string }): node is AuraCameraStereoNode & AuraSceneNode {
  return node.kind === "camera-stereo";
}

const positiveFinite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function validateViewport(label: string, viewport: AuraCameraViewport | undefined): void {
  if (!viewport || typeof viewport !== "object") {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} requires a viewport { x, y, width, height }`);
  }
  const { x, y, width, height } = viewport;
  if (![x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} viewport values must be finite numbers`);
  }
  if (width <= 0 || height <= 0) {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} viewport width and height must be positive`);
  }
  if (x < 0 || y < 0 || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} viewport must lie inside the unit square (normalized 0..1, origin bottom-left)`);
  }
}

function validateViewSettings(label: string, entry: AuraCameraViewSettings): void {
  if (!entry || typeof entry !== "object") {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} must be a view settings object`);
  }
  if (entry.id !== undefined && (typeof entry.id !== "string" || entry.id.trim().length === 0)) {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} id must be a non-empty string`);
  }
  if (entry.scissor !== undefined) validateViewport(`${label} scissor`, entry.scissor);
  if (entry.postprocess !== undefined && typeof entry.postprocess !== "boolean"
    && (!entry.postprocess || typeof entry.postprocess !== "object" || Array.isArray(entry.postprocess))) {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} postprocess must be a boolean or options object`);
  }
}

function copyViewSettings<T extends AuraCameraViewSettings>(entry: T): T {
  return {
    ...entry,
    ...(entry.camera ? { camera: { ...entry.camera } } : {}),
    ...(entry.scissor ? { scissor: { ...entry.scissor } } : {}),
    ...(entry.postprocess && typeof entry.postprocess === "object" ? { postprocess: { ...entry.postprocess } } : {})
  };
}

function validateUniqueViewIds(views: readonly AuraCameraViewSettings[], label: string): void {
  const ids = views.map((view) => view.id).filter((id): id is string => id !== undefined);
  if (new Set(ids).size !== ids.length) {
    throw new AuraRuntimeError("invalid-camera-spec", `${label} view ids must be unique`);
  }
}

export interface AuraCubeCameraOptions {
  /** Stable name/id — materials reference it via `envMap: { cubeCamera: name }`. */
  readonly name?: string;
  /** Cube face resolution in pixels (default 128). */
  readonly resolution?: number;
  readonly near?: number;
  readonly far?: number;
  /** Render every N frames (default 1 = every frame). */
  readonly updateEvery?: number;
  /** World-space capture origin (default [0, 0, 0]). */
  readonly position?: AuraVec3;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export interface AuraCubeCameraNode extends AuraTransformSpec {
  readonly kind: "cube-camera";
  readonly name?: string;
  readonly resolution: number;
  readonly near: number;
  readonly far: number;
  readonly updateEvery: number;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export function isAuraCubeCameraNode(node: { readonly kind: string }): node is AuraCubeCameraNode & { readonly kind: "cube-camera" } {
  return node.kind === "cube-camera";
}

export const cameras = {
  /**
   * Gameplay chase camera rig (runtime controller, not a scene node): feed it the followed target each frame and apply
   * the returned pose with `app.camera.setPose`. Offset mode places the eye behind and the look target ahead; framed mode
   * (`wantEye`/`wantLook`) only smooths. See `docs/api/camera-rig.md`.
   */
  chase: (options: ChaseOptions = {}): ChaseRig => createChaseRig(options),

  /**
   * three's `new CubeCamera(near, far, renderTarget)` — cube render target via
   * `Renderer.renderProbeFace`; consume the capture through
   * `material.*({ envMap: { cubeCamera: "<name>" } })`.
   */
  cube: (options: AuraCubeCameraOptions = {}) =>
    new AuraNodeBuilder<AuraSceneNode>({
      kind: "cube-camera",
      name: options.name ?? "cube-camera",
      position: options.position ?? [0, 0, 0],
      resolution: options.resolution ?? 128,
      near: options.near ?? 0.1,
      far: options.far ?? 1000,
      updateEvery: options.updateEvery ?? 1,
      ...(options.runtime ? { runtime: options.runtime } : {})
    } as unknown as AuraSceneNode),

  /**
   * three's `ArrayCamera`: the scene renders once per entry into its normalized
   * viewport of the same target. Unlike three, viewports are fractions of the
   * target (the authoring code does not know the canvas size). Each view has
   * its own camera, clip rectangle and optional postprocess override.
   */
  array: (options: AuraCameraArrayOptions) => {
    if (!options || !Array.isArray(options.cameras) || options.cameras.length === 0) {
      throw new AuraRuntimeError("invalid-camera-spec", "cameras.array requires a non-empty `cameras` list");
    }
    options.cameras.forEach((entry, index) => {
      validateViewSettings(`cameras.array cameras[${index}]`, entry);
      validateViewport(`cameras.array cameras[${index}]`, entry.viewport);
    });
    validateUniqueViewIds(options.cameras, "cameras.array");
    return new AuraNodeBuilder<AuraSceneNode>({
      kind: "camera-array",
      name: options.name ?? "camera-array",
      cameras: options.cameras.map((entry) => ({ ...copyViewSettings(entry), viewport: { ...entry.viewport } }))
    } as unknown as AuraSceneNode);
  },

  /**
   * Render a left/right eye pair into the selected viewport layout. Perspective
   * eyes use off-axis projection. Orthographic and isometric eyes have parallel
   * axes and projection shifts that converge on each base camera's plane at
   * `focus`; nearer and farther points have opposing disparity. Optional per-eye
   * settings can intentionally use different projections, viewports, scissors
   * and postprocessing. For the bounded orthographic route, zoom scales the
   * orthographic size; mixed projection types, explicit stereo or per-eye FOV,
   * and depth conventions other than standard minus-one-to-one are rejected.
   */
  stereo: (options: AuraStereoCameraOptions = {}) => {
    const { eyeSeparation = STEREO_DEFAULT_EYE_SEPARATION, focus = STEREO_DEFAULT_FOCUS, zoom = 1 } = options;
    if (!positiveFinite(eyeSeparation)) throw new AuraRuntimeError("invalid-camera-spec", "cameras.stereo eyeSeparation must be a positive finite number");
    if (!positiveFinite(focus)) throw new AuraRuntimeError("invalid-camera-spec", "cameras.stereo focus must be a positive finite number");
    if (!positiveFinite(zoom)) throw new AuraRuntimeError("invalid-camera-spec", "cameras.stereo zoom must be a positive finite number");
    if (options.fov !== undefined && (!positiveFinite(options.fov) || options.fov >= 180)) {
      throw new AuraRuntimeError("invalid-camera-spec", "cameras.stereo fov must be in (0, 180) degrees");
    }
    if (options.aspect !== undefined && !positiveFinite(options.aspect)) {
      throw new AuraRuntimeError("invalid-camera-spec", "cameras.stereo aspect must be a positive finite number");
    }
    if (options.layout !== undefined && options.layout !== "side-by-side" && options.layout !== "over-under") {
      throw new AuraRuntimeError("invalid-camera-spec", `cameras.stereo layout must be "side-by-side" or "over-under"`);
    }
    if (options.views !== undefined) {
      if (!Array.isArray(options.views) || options.views.length !== 2) {
        throw new AuraRuntimeError("invalid-camera-spec", "cameras.stereo views must contain left and right eye settings");
      }
      options.views.forEach((entry, index) => {
        validateViewSettings(`cameras.stereo views[${index}]`, entry);
        if (entry.viewport !== undefined) validateViewport(`cameras.stereo views[${index}]`, entry.viewport);
      });
      validateUniqueViewIds(options.views, "cameras.stereo");
    }
    return new AuraNodeBuilder<AuraSceneNode>({
      kind: "camera-stereo",
      name: options.name ?? "camera-stereo",
      eyeSeparation,
      focus,
      zoom,
      layout: options.layout ?? "side-by-side",
      ...(options.fov !== undefined ? { fov: options.fov } : {}),
      ...(options.aspect !== undefined ? { aspect: options.aspect } : {}),
      ...(options.views ? { views: options.views.map((view) => ({ ...copyViewSettings(view), ...(view.viewport ? { viewport: { ...view.viewport } } : {}) })) } : {})
    } as unknown as AuraSceneNode);
  }
} as const;
