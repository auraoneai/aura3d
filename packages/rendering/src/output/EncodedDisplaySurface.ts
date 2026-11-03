/**
 * Internal provenance for a display-encoded post target.
 *
 * The public Texture color-space contract is deliberately unchanged: a raw
 * RGBA8 target containing P3-encoded values may be used only while its exact
 * post-target lease and P3 canvas scope are live. This module has no runtime
 * dependency on the deferred post graph.
 */

import { RenderDeviceError, type RenderDevice, type RenderTarget } from "../RenderDevice";
import type { Texture } from "../Texture";

export type EncodedDisplayAlphaMode = "opaque" | "straight";
declare const encodedDisplaySurfaceBrand: unique symbol;

/** Opaque, frame-scoped proof; it is not a public texture format. */
export interface EncodedDisplaySurfaceLease {
  readonly [encodedDisplaySurfaceBrand]: true;
}

export interface EncodedDisplaySurfaceInfo {
  readonly colorSpace: "display-p3";
  readonly transfer: "srgb";
  readonly alphaMode: EncodedDisplayAlphaMode;
  readonly width: number;
  readonly height: number;
}

type DisplayDevice = RenderDevice & {
  assertDisplayOutputScope(expected: "display-p3"): void;
  assertEncodedDisplayTarget(target: RenderTarget): void;
};

type NativeTarget = RenderTarget & {
  readonly framebuffer?: unknown;
  readonly drawFramebuffer?: unknown;
  readonly colorHandle?: unknown;
  readonly nativeInvalid?: boolean;
};

interface PostLeaseRegistration {
  readonly lease: object;
  readonly device: RenderDevice;
  readonly target: RenderTarget;
  readonly isLive: () => boolean;
  revoked: boolean;
  issued: boolean;
}

interface SurfaceState {
  readonly registration: PostLeaseRegistration;
  readonly frame: object;
  readonly generation: number;
  readonly texture: Texture;
  readonly framebuffer: unknown;
  readonly drawFramebuffer: unknown;
  readonly colorHandle: unknown;
  readonly canvasAlphaMode: "opaque" | "straight" | "premultiplied";
  readonly scopeAssertion: DisplayDevice["assertDisplayOutputScope"];
  readonly targetAssertion: DisplayDevice["assertEncodedDisplayTarget"];
  readonly info: EncodedDisplaySurfaceInfo;
  validating: boolean;
  writing: boolean;
  written: boolean;
}

const registrations = new WeakMap<object, PostLeaseRegistration>();
const surfaces = new WeakMap<EncodedDisplaySurfaceLease, SurfaceState>();

function unavailable(message: string): never {
  throw new RenderDeviceError(message, "ENCODED_DISPLAY_SURFACE_UNAVAILABLE");
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * PostResources is the only repository caller. It registers an actual explicit
 * acquisition and revokes it when that exact acquisition ends or transfers.
 * This internal module is not exposed through any public package entrypoint.
 */
export function registerEncodedPostLease(
  lease: object,
  device: RenderDevice,
  target: RenderTarget,
  isLive: () => boolean
): () => void {
  if (!isObject(lease) || !isObject(device) || !isObject(target) || typeof isLive !== "function" || registrations.has(lease)) {
    unavailable("Invalid or duplicate post-target lease registration");
  }
  const registration: PostLeaseRegistration = { lease, device, target, isLive, revoked: false, issued: false };
  registrations.set(lease, registration);
  return () => {
    if (registration.revoked) return;
    registration.revoked = true;
    registrations.delete(lease);
  };
}

function validateLease(registration: PostLeaseRegistration): void {
  const { lease, device, target } = registration;
  if (registration.revoked || registrations.get(lease) !== registration || !registration.isLive()
      || (lease as { readonly target?: unknown }).target !== target
      || device.disposed || device.contextLost || target.disposed) {
    unavailable("The encoded display surface lease is no longer live");
  }
}

/** Check lease provenance before choosing the optional P3 route; this performs no canvas negotiation. */
export function isExplicitEncodedPostLease(lease: object, device: RenderDevice): boolean {
  const registration = isObject(lease) ? registrations.get(lease) : undefined;
  if (!registration || registration.device !== device || registration.issued) return false;
  try {
    validateLease(registration);
    return true;
  } catch {
    return false;
  }
}

function validateTarget(target: RenderTarget): asserts target is NativeTarget {
  const native = target as NativeTarget;
  const texture = target.colorTexture;
  if (!texture || texture.disposed || texture.format !== "rgba8" || texture.dimension !== "2d"
      || texture.colorSpace !== "linear" || texture.mipLevelCount !== 1 || texture.layers !== 1 || texture.depth !== 1
      || !Number.isSafeInteger(target.width) || target.width < 1 || !Number.isSafeInteger(target.height) || target.height < 1
      || texture.width !== target.width || texture.height !== target.height
      || (target.dimension ?? "2d") !== "2d" || (target.sampleCount ?? 1) !== 1 || target.depthOnly === true
      || (target.colorTextures !== undefined && (target.colorTextures.length !== 1 || target.colorTextures[0] !== texture))
      || (target.attachmentLayer ?? 0) !== 0 || (target.attachmentMipLevel ?? 0) !== 0
      || native.nativeInvalid !== false || !isObject(native.framebuffer) || !isObject(native.drawFramebuffer)
      || !isObject(native.colorHandle) || native.framebuffer !== native.drawFramebuffer) {
    unavailable("Encoded display output requires a live raw RGBA8 single-sample 2D target");
  }
}

function displayDevice(device: RenderDevice): DisplayDevice {
  const candidate = device as Partial<DisplayDevice>;
  if (device.kind !== "webgl2" || typeof candidate.assertDisplayOutputScope !== "function"
      || typeof candidate.assertEncodedDisplayTarget !== "function") {
    unavailable("Encoded display output requires a verified WebGL display scope");
  }
  return device as DisplayDevice;
}

function assertCurrentCanvas(device: DisplayDevice, alphaMode: SurfaceState["canvasAlphaMode"]): void {
  device.assertDisplayOutputScope("display-p3");
  if (device.getOutputColorSpaceNegotiation?.()?.active !== "display-p3"
      || device.getPresentationAlphaMode?.() !== alphaMode) {
    unavailable("The display canvas color or alpha mode changed");
  }
}

/** Issue one encoded-surface token from a live explicit post-target lease. */
export function issueEncodedDisplaySurface(
  lease: object,
  device: RenderDevice,
  alphaMode: EncodedDisplayAlphaMode
): EncodedDisplaySurfaceLease {
  const registration = isObject(lease) ? registrations.get(lease) : undefined;
  if (!registration || registration.device !== device || registration.issued || (alphaMode !== "opaque" && alphaMode !== "straight")) {
    unavailable("An active explicit post-target lease is required");
  }
  // Reserve issuance before any owner/device hooks: a reentrant attempt must
  // not create two independently writable tokens for the same acquisition.
  registration.issued = true;
  try {
    validateLease(registration);
    const owner = displayDevice(device);
    const frame = owner.activeFrameToken;
    const generation = owner.generation;
    const canvasAlphaMode = owner.getPresentationAlphaMode?.();
    if (!isObject(frame) || !Number.isSafeInteger(generation) || generation! < 0
        || (canvasAlphaMode !== "opaque" && canvasAlphaMode !== "straight" && canvasAlphaMode !== "premultiplied")) {
      unavailable("Encoded display output requires an active verified frame and canvas");
    }
    validateTarget(registration.target);
    const target = registration.target as NativeTarget;
    const texture = target.colorTexture;
    const framebuffer = target.framebuffer;
    const drawFramebuffer = target.drawFramebuffer;
    const colorHandle = target.colorHandle;
    const scopeAssertion = owner.assertDisplayOutputScope;
    const targetAssertion = owner.assertEncodedDisplayTarget;
    assertCurrentCanvas(owner, canvasAlphaMode);
    owner.assertEncodedDisplayTarget(target);
    assertCurrentCanvas(owner, canvasAlphaMode);
    // Either assertion may run user-visible hooks; verify the captured identities
    // again before publishing a capability.
    validateLease(registration);
    validateTarget(target);
    if (owner.activeFrameToken !== frame || owner.generation !== generation
        || owner.assertDisplayOutputScope !== scopeAssertion || owner.assertEncodedDisplayTarget !== targetAssertion
        || target.colorTexture !== texture || target.framebuffer !== framebuffer
        || target.drawFramebuffer !== drawFramebuffer || target.colorHandle !== colorHandle) {
      unavailable("The display target changed during capability issuance");
    }
    const token = Object.freeze(Object.create(null)) as EncodedDisplaySurfaceLease;
    const info: EncodedDisplaySurfaceInfo = Object.freeze({ colorSpace: "display-p3", transfer: "srgb", alphaMode, width: target.width, height: target.height });
    surfaces.set(token, { registration, frame, generation: generation!, texture, framebuffer, drawFramebuffer, colorHandle,
      canvasAlphaMode, scopeAssertion, targetAssertion, info, validating: false, writing: false, written: false });
    return token;
  } catch (error) {
    registration.issued = false;
    throw error;
  }
}

function currentState(surface: EncodedDisplaySurfaceLease, device: RenderDevice, target: RenderTarget): SurfaceState {
  const state = isObject(surface) ? surfaces.get(surface) : undefined;
  if (!state || state.registration.device !== device || state.registration.target !== target) {
    unavailable("Invalid, foreign, or forged encoded display surface");
  }
  if (state.validating) unavailable("The encoded display surface is already being validated");
  state.validating = true;
  try {
    validateLease(state.registration);
    const owner = displayDevice(device);
    if (owner.activeFrameToken !== state.frame || owner.generation !== state.generation
        || owner.assertDisplayOutputScope !== state.scopeAssertion || owner.assertEncodedDisplayTarget !== state.targetAssertion) {
      unavailable("The encoded display surface belongs to another frame or device generation");
    }
    validateTarget(target);
    const native = target as NativeTarget;
    if (native.colorTexture !== state.texture || native.framebuffer !== state.framebuffer
        || native.drawFramebuffer !== state.drawFramebuffer || native.colorHandle !== state.colorHandle
        || native.width !== state.info.width || native.height !== state.info.height) {
      unavailable("The encoded display attachment changed");
    }
    assertCurrentCanvas(owner, state.canvasAlphaMode);
    owner.assertEncodedDisplayTarget(target);
    assertCurrentCanvas(owner, state.canvasAlphaMode);
    // Guard reentrant device hooks in the same way as issuance.
    validateLease(state.registration);
    validateTarget(target);
    if (owner.activeFrameToken !== state.frame || owner.generation !== state.generation
        || owner.assertDisplayOutputScope !== state.scopeAssertion || owner.assertEncodedDisplayTarget !== state.targetAssertion
        || native.colorTexture !== state.texture || native.framebuffer !== state.framebuffer
        || native.drawFramebuffer !== state.drawFramebuffer || native.colorHandle !== state.colorHandle
        || native.width !== state.info.width || native.height !== state.info.height) {
      unavailable("The encoded display surface changed during validation");
    }
    return state;
  } finally {
    state.validating = false;
  }
}

/** Validate current provenance; permitted both before and during its write. */
export function assertEncodedDisplaySurface(
  surface: EncodedDisplaySurfaceLease,
  device: RenderDevice,
  target: RenderTarget,
  expectedAlpha?: EncodedDisplayAlphaMode
): EncodedDisplaySurfaceInfo {
  const state = currentState(surface, device, target);
  if (expectedAlpha !== undefined && expectedAlpha !== state.info.alphaMode) unavailable("Encoded display alpha mode does not match");
  return state.info;
}

/** Invalidate old pixels and reserve the only active write for this token. */
export function beginEncodedDisplaySurfaceWrite(
  surface: EncodedDisplaySurfaceLease,
  device: RenderDevice,
  target: RenderTarget,
  expectedAlpha?: EncodedDisplayAlphaMode
): void {
  const state = currentState(surface, device, target);
  if (expectedAlpha !== undefined && expectedAlpha !== state.info.alphaMode) unavailable("Encoded display alpha mode does not match");
  if (state.writing) unavailable("The encoded display surface already has a writer");
  state.written = false;
  state.writing = true;
}

/** Publish pixels only after the writer and its target restoration succeed. */
export function markEncodedDisplaySurfaceWritten(surface: EncodedDisplaySurfaceLease, device: RenderDevice, target: RenderTarget): void {
  const state = currentState(surface, device, target);
  if (!state.writing) unavailable("The encoded display surface has no active writer");
  state.writing = false;
  state.written = true;
}

/** Failure cleanup is idempotent and never makes the pixels readable. */
export function abortEncodedDisplaySurfaceWrite(surface: EncodedDisplaySurfaceLease): void {
  const state = isObject(surface) ? surfaces.get(surface) : undefined;
  if (!state) return;
  state.writing = false;
  state.written = false;
}

/** Validate that a completed write produced the pixels this lease describes. */
export function assertEncodedDisplaySurfaceWritten(
  surface: EncodedDisplaySurfaceLease,
  device: RenderDevice,
  target: RenderTarget
): EncodedDisplaySurfaceInfo {
  const state = currentState(surface, device, target);
  if (state.writing || !state.written) unavailable("The encoded display surface has not completed a write");
  return state.info;
}
