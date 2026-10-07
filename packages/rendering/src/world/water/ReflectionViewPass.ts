/**
 * PRD-10 §9.1 step 2 / T4.4 — `ReflectionViewPass`. For a water node whose
 * `reflection` tier resolves to `"planar"` (High+), it reflects the camera
 * about the water plane (C-08 `computePlanarMirrorCamera`), applies the
 * Lengyel oblique near clip, and renders the reflection-tagged world items
 * into a half-res RGBA16F target bound by the water fragment as
 * `u_planarReflection`.
 *
 * Skip rules (§9.1): the pass is skipped when the plane is off-screen or the
 * mirror's screen coverage is under 2%, and it never runs on Low.
 */
import type { RenderDevice, RenderShaderProgram, RenderTarget } from "../../RenderDevice.js";
import type { RenderPass, RenderPassContext } from "../../RenderPass.js";
import type { FrameContributorContext } from "../../contracts/frameGraph.js";
import {
  computeObliqueClipProjection,
  computePlanarMirrorCamera,
  computePlanarViewMatrix,
  multiplyPlanarMatrices,
  type Vector3
} from "../../PlanarReflection.js";
import type { Texture } from "../../Texture.js";

export const PLANAR_REFLECTION_KEY = "prd10.water.reflection";

export interface ReflectionRequest {
  /** Water node id + plane height for diagnostics and the shader bind. */
  readonly waterId: string;
  readonly planeY: number;
  /** Approximate water surface half-extent (m) — drives the coverage skip. */
  readonly extent: number;
  readonly layers: readonly string[];
}

export interface ReflectionPlan {
  readonly mirrorViewProjection: Float32Array;
  /** Mirror camera eye — CDLOD selects against this during the re-draw. */
  readonly mirrorEye: readonly [number, number, number];
  readonly coverage: number;
  /** Pass runs only when this is true (§9.1: < 2 % coverage skips). */
  readonly run: boolean;
}

const MIN_COVERAGE = 0.02;

/**
 * Mirror-camera + oblique-clip plan for one frame. Coverage is the ratio of
 * the water plane's projected half-extent to the frustum's far-plane half
 * width — a cheap upper bound; the spec's skip is about the water being a
 * trivial fraction of the frame.
 */
export function planReflection(ctx: FrameContributorContext, request: ReflectionRequest): ReflectionPlan | null {
  const camera = ctx.camera;
  if (!camera) return null;
  const eye: Vector3 = [camera.position[0], camera.position[1], camera.position[2]];
  // Camera basis: view matrix inverse columns give right/up/forward; the look
  // target sits one unit along forward (view-space -z).
  const v = camera.viewMatrix;
  const fwd: Vector3 = [-v[2]!, -v[6]!, -v[10]!];
  const up: Vector3 = [v[1]!, v[5]!, v[9]!];
  const target: Vector3 = [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]];
  const mirror = computePlanarMirrorCamera(eye, target, up, request.planeY);
  const oblique = computeObliqueClipProjection(camera.projectionMatrix, mirror.clipPlane, 0);
  const view = computePlanarViewMatrix(mirror.eye, mirror.target, mirror.up);
  const mirrorViewProjection = multiplyPlanarMatrices(Float32Array.from(oblique.projectionMatrix), view);
  // Screen-space coverage proxy: water half-extent over view half-extent at the
  // plane's distance along the camera forward axis.
  const dist = Math.max(1, Math.abs(eye[1] - request.planeY));
  const tanHalfFov = 1 / Math.max(0.05, Math.abs(camera.projectionMatrix[5] ?? 1));
  const viewHalf = dist * tanHalfFov;
  const coverage = Math.min(1, request.extent / Math.max(viewHalf, 0.01));
  return { mirrorViewProjection, mirrorEye: mirror.eye, coverage, run: coverage >= MIN_COVERAGE };
}

interface DeviceReflectionState {
  target: RenderTarget | null;
  programCache: Map<string, RenderShaderProgram>;
}

const states = new WeakMap<RenderDevice, DeviceReflectionState>();

function stateFor(device: RenderDevice): DeviceReflectionState {
  let s = states.get(device);
  if (!s) {
    s = { target: null, programCache: new Map() };
    states.set(device, s);
  }
  return s;
}

/**
 * The `background` phase pass (order −10 relative to world opaque). Executes
 * `renderWorld` — supplied by `WaterRuntime`, which re-draws the
 * `reflectionLayers`-tagged items through the mirror matrices — into the
 * half-res target and publishes it on the blackboard for the water pass.
 */
export function reflectionViewPass(
  ctx: FrameContributorContext,
  request: ReflectionRequest,
  renderWorld: (device: RenderDevice, mirrorViewProjection: Float32Array, mirrorEye: readonly [number, number, number]) => void
): RenderPass {
  return {
    name: `prd10.reflection.${request.waterId}`,
    reads: [],
    writes: [PLANAR_REFLECTION_KEY],
    execute(rp: RenderPassContext) {
      const device = rp.device;
      const plan = planReflection(ctx, request);
      if (!plan || !plan.run) {
        ctx.blackboard.delete(PLANAR_REFLECTION_KEY);
        return;
      }
      const s = stateFor(device);
      const w = Math.max(1, (rp.width / 2) | 0);
      const h = Math.max(1, (rp.height / 2) | 0);
      const t = s.target as (RenderTarget & { width?: number; height?: number }) | null;
      if (!t || t.width !== w || t.height !== h) {
        s.target?.dispose();
        s.target = device.createRenderTarget({
          width: w, height: h,
          label: PLANAR_REFLECTION_KEY,
          format: "rgba16f",
          depth: "renderbuffer",
          sampleCount: 1
        });
      }
      const target = s.target;
      if (!target) return;
      device.setRenderTarget(target);
      device.clear([0, 0, 0, 1]);
      renderWorld(device, plan.mirrorViewProjection, plan.mirrorEye);
      device.setRenderTarget(null);
      ctx.blackboard.set(PLANAR_REFLECTION_KEY, target.colorTexture as Texture);
    }
  };
}
