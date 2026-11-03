/**
 * A capture belongs to one rendered frame, not to the module or the material.
 * The frame blackboard is shared by its producer and forward draws, while the
 * identity checks prevent a retained context from sampling another view, a
 * restored device's old resources, or a later frame's texture.
 */
import type { FrameContributorContext } from "../contracts/frameGraph.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { RenderDevice, RenderTarget } from "../RenderDevice.js";
import type { RenderPass } from "../RenderPass.js";
import { isTextureBinding } from "../TextureBinding.js";
import type { Texture } from "../Texture.js";

export const TRANSMISSION_BLACKBOARD_KEY = "prd04.transmissionTarget";
const TRANSMISSION_DIAGNOSTICS_KEY = "prd04.transmissionDiagnostics";

// The direct renderer may temporarily bind its linear source only around the
// provider's own synchronous capture pass. A same-named contributor cannot
// inherit this capability; identities are held privately and weakly.
const trustedCapturePasses = new WeakSet<RenderPass>();
const trustedCaptureContracts = new WeakMap<RenderPass, {
  readonly execute: RenderPass["execute"];
  readonly name: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}>();
/** Internal seam for the physical transmission contributor; not a public SDK export. */
export function markTrustedTransmissionCapturePass(pass: RenderPass): void {
  trustedCapturePasses.add(pass);
  trustedCaptureContracts.set(pass, { execute: pass.execute, name: pass.name, reads: [...pass.reads], writes: [...pass.writes] });
}
export function isTrustedTransmissionCapturePass(pass: RenderPass): boolean {
  const contract = trustedCaptureContracts.get(pass);
  return trustedCapturePasses.has(pass) && !!contract && pass.execute === contract.execute &&
    pass.executeAsync === undefined && pass.space === undefined && !pass.allowReadWriteHazards?.length &&
    pass.name === contract.name && pass.reads.length === contract.reads.length && pass.writes.length === contract.writes.length &&
    pass.reads.every((resource, index) => resource === contract.reads[index]) &&
    pass.writes.every((resource, index) => resource === contract.writes[index]);
}

/** Shared selection for frame planning and capture; instance overrides are live. */
export function itemReportsTransmissionLobe(item: RenderItem): boolean {
  const material = item.material;
  if (!material) return false;
  // Diffuse transmission is a backlit diffuse lobe and volume thickness only
  // modifies an existing refractive path. Neither needs a backdrop by itself.
  const factor = material.getParameter("u_transmissionFactor");
  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) return true;
  const texture = material.getParameter("u_transmissionTexture");
  return isTextureBinding(texture) && texture.texture !== null && !texture.texture.disposed &&
    material.getParameter("u_transmissionTextureEnabled") !== 0;
}

/** Values describe the current frame's submitted capture, not GPU completion. */
export interface Prd04TransmissionDiagnostics {
  readonly targetActive: boolean;
  readonly format: "rgba16f" | "rgba32f" | "rgba8" | null;
  readonly mipCount: number;
  readonly scale: number | null;
  readonly sourceCopied: boolean;
  readonly readbacks: number;
  readonly issues: readonly string[];
}

const INACTIVE_DIAGNOSTICS: Prd04TransmissionDiagnostics = {
  targetActive: false, format: null, mipCount: 0, scale: null, sourceCopied: false, readbacks: 0, issues: []
};

export function setPrd04TransmissionDiagnostics(frame: FrameContributorContext, diagnostics: Prd04TransmissionDiagnostics): void {
  frame.blackboard.set(TRANSMISSION_DIAGNOSTICS_KEY, { ...diagnostics, issues: [...diagnostics.issues] });
}

/** Unscoped callers cannot observe another renderer's material diagnostics. */
export function prd04TransmissionDiagnostics(frame?: FrameContributorContext): Prd04TransmissionDiagnostics {
  const result = frame?.blackboard.get(TRANSMISSION_DIAGNOSTICS_KEY) as Prd04TransmissionDiagnostics | undefined;
  const diagnostics = result ?? INACTIVE_DIAGNOSTICS;
  return {
    ...diagnostics,
    ...(diagnostics.targetActive && !capturedTransmissionTarget(frame) ? { targetActive: false, mipCount: 0 } : {}),
    issues: [...diagnostics.issues]
  };
}

export interface CapturedTransmissionTarget {
  readonly texture: Texture;
  readonly width: number;
  readonly height: number;
  /** Number of levels actually allocated and generated for this frame. */
  readonly mipCount: number;
  readonly device: RenderDevice;
  readonly deviceGeneration: number;
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly frameIndex: number;
  readonly target: RenderTarget;
}

const captureLeases = new WeakMap<CapturedTransmissionTarget, boolean>();
export function validTransmissionFrameIdentity(frame: FrameContributorContext): boolean {
  const view = frame.viewId;
  return typeof frame.postScopeId === "object" && frame.postScopeId !== null &&
    ((typeof view === "string" && view.length > 0) || (typeof view === "number" && Number.isFinite(view))) &&
    Number.isSafeInteger(frame.frameIndex) && frame.frameIndex >= 0;
}

export function revokeTransmissionCapture(capture: CapturedTransmissionTarget | undefined): void {
  if (capture && typeof capture === "object" && captureLeases.has(capture)) captureLeases.set(capture, false);
}

/** Clear before an attempted capture, including retries on the same blackboard. */
export function clearCapturedTransmissionTarget(frame: FrameContributorContext): void {
  const capture = frame.blackboard.get(TRANSMISSION_BLACKBOARD_KEY) as CapturedTransmissionTarget | undefined;
  revokeTransmissionCapture(capture);
  frame.blackboard.delete(TRANSMISSION_BLACKBOARD_KEY);
}

/** Called only after the base-level copy and every required mip submission. */
export function publishCapturedTransmissionTarget(
  frame: FrameContributorContext,
  target: RenderTarget,
  mipCount: number
): CapturedTransmissionTarget {
  clearCapturedTransmissionTarget(frame);
  const scopeId = frame.postScopeId;
  const viewId = frame.viewId;
  if (!validTransmissionFrameIdentity(frame) || !scopeId || viewId === undefined) {
    throw new Error("TRANSMISSION_FRAME_IDENTITY_REQUIRED");
  }
  if (frame.device.disposed || frame.device.contextLost || target.disposed || target.colorTexture.disposed ||
      !Number.isInteger(mipCount) || mipCount < 1 || target.colorTexture.mipLevelCount !== mipCount ||
      target.width !== target.colorTexture.width || target.height !== target.colorTexture.height) {
    throw new Error("TRANSMISSION_CAPTURE_INVALID");
  }
  const capture: CapturedTransmissionTarget = {
    texture: target.colorTexture,
    width: target.width,
    height: target.height,
    mipCount,
    device: frame.device,
    deviceGeneration: frame.device.generation ?? 0,
    scopeId,
    viewId,
    frameIndex: frame.frameIndex,
    target
  };
  captureLeases.set(capture, true);
  frame.blackboard.set(TRANSMISSION_BLACKBOARD_KEY, capture);
  return capture;
}

/** Return only a live capture from the exact device, owner, view and frame. */
export function capturedTransmissionTarget(frame?: FrameContributorContext): CapturedTransmissionTarget | undefined {
  if (!frame || !validTransmissionFrameIdentity(frame)) return undefined;
  const capture = frame.blackboard.get(TRANSMISSION_BLACKBOARD_KEY) as CapturedTransmissionTarget | undefined;
  if (!capture || typeof capture !== "object" || captureLeases.get(capture) !== true ||
      capture.device !== frame.device || capture.deviceGeneration !== (frame.device.generation ?? 0) ||
      capture.scopeId !== frame.postScopeId || capture.viewId !== frame.viewId || capture.frameIndex !== frame.frameIndex ||
      frame.device.disposed || frame.device.contextLost || capture.target.disposed || capture.texture.disposed ||
      capture.target.colorTexture !== capture.texture || capture.texture.mipLevelCount !== capture.mipCount ||
      capture.target.width !== capture.width || capture.target.height !== capture.height) return undefined;
  return capture;
}

type TransmissionLifecycle = {
  releaseView(device: RenderDevice, scope: object, view: string | number): void;
  releaseScope(device: RenderDevice, scope: object): void;
};

// The renderer may import this small seam without loading optional physical
// shaders. The contributor installs callbacks only when its lane is loaded.
let lifecycle: TransmissionLifecycle | undefined;
export function registerTransmissionLifecycle(callbacks: TransmissionLifecycle): void {
  lifecycle = callbacks;
}
export function releaseTransmissionFrame(frame: FrameContributorContext): void {
  clearCapturedTransmissionTarget(frame);
}
export function releaseTransmissionView(device: RenderDevice, scope: object, view: string | number): void {
  lifecycle?.releaseView(device, scope, view);
}
export function releaseTransmissionScope(device: RenderDevice, scope: object): void {
  lifecycle?.releaseScope(device, scope);
}
