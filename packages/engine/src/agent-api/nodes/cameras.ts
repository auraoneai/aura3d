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

import type { AuraSceneNode, AuraTransformSpec, AuraVec3 } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";

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
    } as unknown as AuraSceneNode)
} as const;
