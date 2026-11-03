import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import { getRenderTargetTextureOwner } from "../Texture";
import type { WebGL2RenderTarget } from "../WebGL2Device";
import { FRAME_RESOURCES, type FrameContributorContext } from "../contracts/frameGraph";
import { PRD01_FORWARD_TARGET } from "../renderer/FrameGraph";
import type { ScalarVolumeDrawRecord } from "../renderer/ScalarVolumeFrame";
import { webgl2DeviceHost } from "./Counters";

/** The compiled frame owns this assertion and retains its resources until release. */
export interface ScalarVolumeHostFrame {
  readonly deviceGeneration: number;
  assertCurrent(): void;
}

function unsupported(message: string, code: string): never {
  throw new RenderDeviceError(message, code);
}

function sameRect(value: unknown, width: number, height: number): boolean {
  if (!value || typeof value !== "object" || !("length" in value)) return false;
  const rect = value as ArrayLike<number>;
  return rect.length === 4 && rect[0] === 0 && rect[1] === 0 && rect[2] === width && rect[3] === height;
}

/**
 * Submit a root-scene volume on the registered WebGL2 host. The graph must
 * already have completed its distinct opaque-depth copy and bound the linear
 * single-sample forward target. Raw-context standalone draws use a separate
 * contract and never enter this adapter.
 */
export function drawScalarVolumeOnWebGL2(
  context: FrameContributorContext,
  record: ScalarVolumeDrawRecord,
  frame: ScalarVolumeHostFrame
): void {
  const device: RenderDevice = context.device;
  if (!("draw" in record.renderer)) {
    return unsupported("Scalar volume renderer belongs to a different backend", "SCALAR_VOLUME_BACKEND_UNSUPPORTED");
  }
  const renderer = record.renderer;
  const host = webgl2DeviceHost(device);
  if (device.kind !== "webgl2" || !host || host.device !== device) {
    return unsupported("Scalar volume root rendering requires a registered WebGL2 device", "SCALAR_VOLUME_BACKEND_UNSUPPORTED");
  }
  if (device.disposed || device.contextLost || host.disposed || host.contextLost ||
      device.generation === undefined || device.generation !== frame.deviceGeneration) {
    return unsupported("Scalar volume frame device is unavailable or stale", "SCALAR_VOLUME_FRAME_STALE");
  }
  frame.assertCurrent();
  record.frameLease.assertCurrent();
  renderer.assertUsableForDevice(device);
  const camera = context.camera;
  if (!camera || !context.rasterViewProjectionMatrix || context.rasterViewProjectionMatrix.length !== 16 ||
      !context.rasterViewProjectionMatrix.every(Number.isFinite)) {
    return unsupported("Scalar volume rendering requires a finite raster camera", "SCALAR_VOLUME_CAMERA_REQUIRED");
  }
  if (camera.depth?.mode !== "standard" || camera.depth.clipRange !== "minus-one-to-one" ||
      camera.depth.clearValue !== 1 || camera.depth.compare !== "less-equal") {
    return unsupported("Scalar volume rendering requires standard WebGL depth", "SCALAR_VOLUME_DEPTH_UNSUPPORTED");
  }
  if (context.blackboard.get("prd01.outputColorSpace") !== "linear") {
    return unsupported("Scalar volume rendering requires a linear forward target", "SCALAR_VOLUME_COLOR_UNSUPPORTED");
  }
  const target = context.blackboard.get(PRD01_FORWARD_TARGET) as WebGL2RenderTarget | undefined;
  const copy = context.blackboard.get(FRAME_RESOURCES.sceneDepthCopy) as WebGL2RenderTarget | undefined;
  if (!target || !copy || !host.renderTargets.has(target) || !host.renderTargets.has(copy) ||
      target.disposed || target.nativeInvalid || copy.disposed || copy.nativeInvalid || target === copy ||
      host.activeRenderTarget !== target || !device.getRenderTarget || device.getRenderTarget() !== target ||
      target.sampleCount !== 1 || copy.sampleCount !== 1 ||
      target.width !== context.width || target.height !== context.height || copy.width !== target.width || copy.height !== target.height ||
      !target.colorTexture || target.colorTexture.disposed || target.colorTexture.colorSpace !== "linear" ||
      !target.depthTexture || target.depthTexture.disposed || !target.depthTextureHandle ||
      target.depthTexture.dimension !== "2d" || target.depthTexture.format !== "depth24" ||
      target.depthTexture.width !== target.width || target.depthTexture.height !== target.height ||
      !copy.depthTexture || copy.depthTexture.disposed ||
      copy.depthTexture.dimension !== "2d" || copy.depthTexture.format !== "depth24" ||
      copy.depthTexture.width !== target.width || copy.depthTexture.height !== target.height ||
      getRenderTargetTextureOwner(target.depthTexture) !== device || getRenderTargetTextureOwner(copy.depthTexture) !== device ||
      target.depthTexture === copy.depthTexture) {
    return unsupported("Scalar volume rendering requires an owned, matching opaque-depth copy", "SCALAR_VOLUME_DEPTH_COPY_UNAVAILABLE");
  }
  const depthHandle = host.textureRegistry.textures.get(copy.depthTexture);
  if (!depthHandle || depthHandle !== copy.depthTextureHandle || depthHandle === target.depthTextureHandle || depthHandle === target.colorHandle) {
    return unsupported("Scalar volume depth copy has no distinct live native texture", "SCALAR_VOLUME_DEPTH_COPY_UNAVAILABLE");
  }
  const gl = host.gl;
  if (context.rasterViewportIsFull !== true || !sameRect(gl.getParameter(gl.VIEWPORT), target.width, target.height) ||
      gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== target.drawFramebuffer ||
      (gl.isEnabled(gl.SCISSOR_TEST) && !sameRect(gl.getParameter(gl.SCISSOR_BOX), target.width, target.height))) {
    return unsupported("Scalar volume rendering requires the complete target viewport", "SCALAR_VOLUME_VIEWPORT_UNSUPPORTED");
  }

  // Raw GL state is restored even if the volume draw or state restoration
  // throws; invalidate the device cache so subsequent engine draws rebind.
  const flags = [gl.SCISSOR_TEST, gl.STENCIL_TEST, gl.POLYGON_OFFSET_FILL, gl.RASTERIZER_DISCARD,
    gl.SAMPLE_ALPHA_TO_COVERAGE, gl.SAMPLE_COVERAGE];
  const enabled = flags.map((flag) => gl.isEnabled(flag));
  const failures: unknown[] = [];
  try {
    flags.forEach((flag) => gl.disable(flag));
    if (device.disposed || device.contextLost || device.generation !== frame.deviceGeneration) {
      throw new RenderDeviceError("Scalar volume frame became stale before drawing", "SCALAR_VOLUME_FRAME_STALE");
    }
    frame.assertCurrent();
    record.frameLease.assertCurrent();
    renderer.assertUsableForDevice(device);
    renderer.draw({ viewProjectionMatrix: context.rasterViewProjectionMatrix, modelMatrix: record.modelMatrix,
      sceneDepth: depthHandle, mode: record.mode });
  } catch (error) {
    failures.push(error);
  } finally {
    flags.forEach((flag, index) => {
      try { (enabled[index] ? gl.enable : gl.disable).call(gl, flag); }
      catch (error) { failures.push(error); }
    });
    try { host.stateCache.invalidate(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "Scalar volume draw and state restoration failed");
}
