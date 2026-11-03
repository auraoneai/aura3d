/** A contact mask is a transient product of one renderer, view and frame. */
import type { FrameContributorContext } from "../contracts/frameGraph.js";
import { Sampler } from "../Sampler.js";
import type { Texture } from "../Texture.js";
import { TextureBinding } from "../TextureBinding.js";
import type { RenderDevice, RenderShaderProgram, RenderTarget, UniformValue } from "../RenderDevice.js";
import type { RenderItem } from "../contracts/renderItem.js";

export interface ContactShadowMaskFrame {
  readonly texture: Texture;
  /** Pixel size of the forward target (not the half-resolution mask). */
  readonly width: number;
  readonly height: number;
  readonly strength: number;
  readonly cameraPosition: readonly [number, number, number];
  /** The exact directional light whose direction produced this mask. */
  readonly sourceLight: object;
}

/** The current forward frame. Without an identity a screen-space mask cannot be reused safely. */
export interface ContactShadowMaskScope {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly frame?: FrameContributorContext | undefined;
  /** Actual matrix used by this draw, which may override the frame camera. */
  readonly viewProjectionMatrix?: ArrayLike<number> | undefined;
  /** Actual forward built-ins, when the draw overrides its frame inputs. */
  readonly cameraPosition?: readonly number[] | undefined;
  readonly timeSeconds?: number | undefined;
}

export interface ContactShadowDrawCounters {
  /** Uniform applications, including direct opaque replay; these are not unique final-frame draws. */
  calls: number;
  reflectingDraws: number;
  maskedDraws: number;
}

interface Publication {
  readonly frame: ContactShadowMaskFrame;
  readonly device: RenderDevice;
  readonly generation: number | undefined;
  readonly owner: object;
  readonly viewId: string | number;
  readonly frameIndex: number;
  readonly blackboard: Map<string, unknown>;
  readonly viewProjection: readonly number[];
  readonly timeSeconds: number;
  readonly target?: RenderTarget;
}

interface DeviceState {
  publication: Publication | undefined;
  /** Unscoped legacy records are observable for diagnostics but never bound. */
  diagnosticFrame: ContactShadowMaskFrame | undefined;
  counters: ContactShadowDrawCounters;
}

const states = new WeakMap<object, DeviceState>();
const ownedMaskTargets = new WeakMap<RenderTarget, { readonly device: RenderDevice; readonly generation: number | undefined }>();

/** Internal: create and register atomically; an arbitrary foreign target cannot be registered. */
export function createContactShadowMaskTarget(device: RenderDevice, width: number, height: number): RenderTarget {
  if (device.disposed || device.contextLost) {
    throw new Error("CONTACT_SHADOW_TARGET_OWNER_INVALID");
  }
  const target = device.createRenderTarget({ width, height, format: "rgba8", label: "a3d.prd02.contactShadowMask" });
  ownedMaskTargets.set(target, { device, generation: device.generation });
  return target;
}

function stateFor(device: object): DeviceState {
  let state = states.get(device);
  if (!state) {
    state = { publication: undefined, diagnosticFrame: undefined, counters: { calls: 0, reflectingDraws: 0, maskedDraws: 0 } };
    states.set(device, state);
  }
  return state;
}

export function validContactShadowFrameIdentity(frame: FrameContributorContext): boolean {
  const view = frame.viewId;
  const matrix = frame.rasterViewProjectionMatrix ?? frame.camera?.viewProjectionMatrix;
  return typeof frame.postScopeId === "object" && frame.postScopeId !== null &&
    ((typeof view === "string" && view.length > 0) || (typeof view === "number" && Number.isFinite(view))) &&
    Number.isSafeInteger(frame.frameIndex) && frame.frameIndex >= 0 && Number.isFinite(frame.timeSeconds) &&
    !!frame.camera && frame.camera.position?.length === 3 && frame.camera.position.every(Number.isFinite) &&
    !!matrix && matrix.length === 16 && Array.from(matrix).every(Number.isFinite);
}

/**
 * Clear at the start of every production attempt. A record without a complete
 * context is never eligible for shading, even if its camera and size match.
 */
export function setContactShadowMask(
  device: object,
  frame: ContactShadowMaskFrame | undefined,
  context?: FrameContributorContext,
  target?: RenderTarget
): void {
  const state = stateFor(device);
  state.publication = undefined;
  state.diagnosticFrame = frame;
  state.counters = { calls: 0, reflectingDraws: 0, maskedDraws: 0 };
  if (!frame || !context || !target || context.device !== device || context.rasterViewportIsFull !== true || !validContactShadowFrameIdentity(context)) return;
  const owner = ownedMaskTargets.get(target);
  if (context.device.disposed || context.device.contextLost || frame.texture.disposed ||
      typeof frame.sourceLight !== "object" || frame.sourceLight === null ||
      !Number.isFinite(frame.strength) || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) ||
      frame.width <= 0 || frame.height <= 0 || context.width !== frame.width || context.height !== frame.height ||
      !owner || owner.device !== context.device || owner.generation !== context.device.generation ||
      target.disposed || target.colorTexture !== frame.texture) return;
  state.publication = {
    frame, device: context.device, generation: context.device.generation, owner: context.postScopeId!,
    viewId: context.viewId!, frameIndex: context.frameIndex, blackboard: context.blackboard,
    viewProjection: Array.from(context.rasterViewProjectionMatrix ?? context.camera!.viewProjectionMatrix), timeSeconds: context.timeSeconds, target
  };
}

/** Applications since the last publish; replay applications are intentionally included. */
export function contactShadowMaskDrawCounters(device: object): Readonly<ContactShadowDrawCounters> {
  return { ...stateFor(device).counters };
}

/** Latest diagnostic record. For shading use resolveContactShadowMask, which checks identity and liveness. */
export function contactShadowMask(device: object): ContactShadowMaskFrame | undefined {
  const state = states.get(device);
  const publication = state?.publication;
  if (publication && (publication.device.disposed || publication.device.contextLost ||
      publication.device.generation !== publication.generation || publication.frame.texture.disposed || publication.target?.disposed)) {
    setContactShadowMask(device, undefined);
    return undefined;
  }
  return state?.diagnosticFrame;
}

/** Revoke only the producer's own texture, so disposing one contributor cannot clear another. */
export function clearContactShadowMaskTexture(device: object, texture: Texture | null): void {
  if (texture && states.get(device)?.diagnosticFrame?.texture === texture) setContactShadowMask(device, undefined);
}

/** Previous-frame diagnostics apply only to the same renderer view. */
export function contactShadowMaskBelongsToView(context: FrameContributorContext): boolean {
  const publication = states.get(context.device)?.publication;
  return !!publication && publication.owner === context.postScopeId && publication.viewId === context.viewId;
}

/** Single predicate shared by program selection and binding. */
export function resolveContactShadowMask(scope: ContactShadowMaskScope | undefined): ContactShadowMaskFrame | undefined {
  if (!scope?.frame || scope.device !== scope.frame.device || scope.frame.rasterViewportIsFull !== true || !validContactShadowFrameIdentity(scope.frame)) return undefined;
  const publication = states.get(scope.device)?.publication;
  if (!publication) return undefined;
  const frame = scope.frame;
  const mask = publication.frame;
  if (scope.device.disposed || scope.device.contextLost || scope.device.generation !== publication.generation ||
      publication.device !== scope.device || frame.postScopeId !== publication.owner || frame.viewId !== publication.viewId ||
      frame.frameIndex !== publication.frameIndex || frame.blackboard !== publication.blackboard ||
      frame.blackboard.get("prd02.contactShadowMask") !== mask.texture ||
      frame.width !== mask.width || frame.height !== mask.height || scope.width !== mask.width || scope.height !== mask.height ||
      mask.texture.disposed || !(mask.strength > 0) ||
      (publication.target && (publication.target.disposed || publication.target.colorTexture !== mask.texture))) return undefined;
  const matrix = frame.rasterViewProjectionMatrix ?? frame.camera!.viewProjectionMatrix;
  if (!publication.viewProjection.every((value, index) => value === matrix[index])) return undefined;
  const samePosition = (value: readonly number[] | undefined) => !!value && value.length === 3 && mask.cameraPosition.every((entry, index) =>
    Number.isFinite(value[index]) && Math.fround(entry) === Math.fround(value[index]!));
  if (!samePosition(frame.camera!.position) || frame.timeSeconds !== publication.timeSeconds ||
      (scope.cameraPosition && !samePosition(scope.cameraPosition)) ||
      (scope.timeSeconds !== undefined && scope.timeSeconds !== publication.timeSeconds)) return undefined;
  if (scope.viewProjectionMatrix && (scope.viewProjectionMatrix.length !== 16 ||
      // FrameCamera stores f32; a forward override may be the original f64
      // array, but both are packed to f32 before GPU rasterization.
      !publication.viewProjection.every((value, index) => Number.isFinite(scope.viewProjectionMatrix![index]) &&
        Math.fround(value) === Math.fround(scope.viewProjectionMatrix![index]!)))) return undefined;
  return mask;
}

const ABSENT_MASK = new TextureBinding({ name: "u_contactShadowMask", required: false });
const MASK_SAMPLER = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

/** Bind only a live publication for this exact frame; selection uses the same resolver. */
export function applyContactShadowMaskUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  scope?: ContactShadowMaskScope
): void {
  const state = scope ? states.get(scope.device) : undefined;
  if (state) state.counters.calls += 1;
  if (!shader.reflection.uniforms.has("u_contactShadowMask")) return;
  if (state) state.counters.reflectingDraws += 1;
  const frame = item.receiveShadow === false ? undefined : resolveContactShadowMask(scope);
  if (!frame) {
    uniforms.set("u_contactShadowMask", ABSENT_MASK);
    uniforms.set("u_contactShadowMaskStrength", 0);
    uniforms.set("u_contactShadowMaskViewport", [1, 1]);
    return;
  }
  if (state) state.counters.maskedDraws += 1;
  uniforms.set("u_contactShadowMask", new TextureBinding({ name: "u_contactShadowMask", texture: frame.texture, sampler: MASK_SAMPLER }));
  uniforms.set("u_contactShadowMaskStrength", Math.min(1, frame.strength));
  uniforms.set("u_contactShadowMaskViewport", [frame.width, frame.height]);
}
