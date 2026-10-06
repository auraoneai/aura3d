/**
 * C-08 — frame uniforms and CameraLike (CONTRACTS.md). Provider: PRD 01. Flag: A3D_QR_CORE.
 */

import type { RenderBuffer } from "../RenderDevice";
import type { FrameCamera } from "./frameGraph";

export interface CameraLike {                                     // superset of today's Renderer CameraLike
  readonly viewMatrix?: Float32Array;
  readonly projectionMatrix?: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly position?: readonly [number, number, number];
  readonly near?: number; readonly far?: number; readonly fov?: number; readonly aspect?: number;
  readonly projection?: "perspective" | "orthographic";
}
/** std140 block AuraFrame, binding 0. Field order is frozen. */
export const AURA_FRAME_BLOCK: readonly [
  ["u_view", "mat4"], ["u_projection", "mat4"], ["u_viewProjection", "mat4"], ["u_prevViewProjection", "mat4"],
  ["u_cameraPositionNear", "vec4"], ["u_resolutionFarTime", "vec4"], ["u_exposureFlags", "vec4"]
] = [
  ["u_view", "mat4"], ["u_projection", "mat4"], ["u_viewProjection", "mat4"], ["u_prevViewProjection", "mat4"],
  ["u_cameraPositionNear", "vec4"], ["u_resolutionFarTime", "vec4"], ["u_exposureFlags", "vec4"]
];
/** std140 block AuraLights, binding 1; layout owned by PRD 02 inside this name (C-10). */
export const AURA_LIGHTS_BLOCK_NAME: "AuraLights" = "AuraLights";
export interface FrameUniformsLike { update(camera: FrameCamera, timeSeconds: number, exposure: number, flags: number): void; readonly buffer: RenderBuffer | null; }

/**
 * PR 0a stub: `buffer` is null. Chunks read the legacy uniforms
 * `u_cameraPosition`/`u_viewProjection`, and the ChunkHarness declares both
 * forms. `update` records the latest values so consumers can read them.
 */
class StubFrameUniforms implements FrameUniformsLike {
  public readonly buffer: RenderBuffer | null = null;
  public lastCamera: FrameCamera | null = null;
  public lastTimeSeconds = 0;
  public lastExposure = 1;
  public lastFlags = 0;

  update(camera: FrameCamera, timeSeconds: number, exposure: number, flags: number): void {
    this.lastCamera = camera;
    this.lastTimeSeconds = timeSeconds;
    this.lastExposure = exposure;
    this.lastFlags = flags;
  }
}

export function createStubFrameUniforms(): FrameUniformsLike {
  return new StubFrameUniforms();
}
