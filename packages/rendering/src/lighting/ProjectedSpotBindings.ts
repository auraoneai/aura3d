import type { CollectedLight } from "../LightCollector";
import { LightUniforms, MAX_DIRECT_LIGHTS, type PackedLightsWithSelection } from "../LightUniforms";
import type { RenderDevice } from "../RenderDevice";
import { Sampler } from "../Sampler";
import { Texture, getRenderTargetTextureOwner } from "../Texture";
import { TextureBinding } from "../TextureBinding";

/** Authored projection retained on the collected light for the current draw. */
export interface ProjectedSpotImage<TAsset> {
  readonly texture: TAsset;
  readonly offset?: readonly [number, number];
  readonly scale?: readonly [number, number];
  readonly rotation?: number;
}

export type ProjectedSpotLight<TAsset> = CollectedLight & { readonly projectedImage?: ProjectedSpotImage<TAsset> };

/** A view identity must describe the active device frame, not just its number. */
export interface ProjectedSpotFrameIdentity {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly viewId: string | number;
  readonly frameIndex: number;
}

/**
 * Structural interfaces deliberately keep renderer code independent of the
 * asset loader. A resource owns verification, content currentness, and the
 * completion/loss-aware lifetime of the decoded image.
 */
export interface ProjectedSpotFrameLease {
  readonly texture: Texture;
  isCurrent(identity: ProjectedSpotFrameIdentity): boolean;
  /** Call after endFrame; false means the owner must retry after the frame ends. */
  release(): boolean;
}
export interface ProjectedSpotResource<TAsset> {
  matchesAsset(asset: TAsset): boolean;
  acquireFrame(identity: ProjectedSpotFrameIdentity): ProjectedSpotFrameLease | undefined;
}

export type ProjectedSpotUnsupportedReason =
  | "backend-unsupported" | "clustered" | "multiple-projections" | "stale-selection" | "light-not-selected"
  | "unsupported-light" | "invalid-transform" | "frame-unavailable" | "texture-unavailable" | "stale-resource";

export interface ProjectedSpotUniforms {
  readonly u_projectedSpotEnabled: 1;
  readonly u_projectedSpotIndex: number;
  readonly u_projectedSpotMap: TextureBinding;
  readonly u_projectedSpotOffset: readonly [number, number];
  readonly u_projectedSpotScale: readonly [number, number];
  readonly u_projectedSpotRotation: number;
}

export interface ProjectedSpotBindings {
  readonly status: "ready";
  readonly slot: number;
  readonly inputIndex: number;
  readonly uniforms: ProjectedSpotUniforms;
  /** Retain until frame completion; the caller must release after endFrame. */
  readonly lease: ProjectedSpotFrameLease;
  /** Recheck immediately before every draw that consumes these uniforms. */
  isCurrent(identity: ProjectedSpotFrameIdentity): boolean;
}

export type ProjectedSpotBindingsResult = ProjectedSpotBindings | { readonly status: "not-required" }
  | {
      readonly status: "unsupported";
      readonly reason: ProjectedSpotUnsupportedReason;
      readonly detail: string;
      /**
       * Present if admission acquired a lease before inputs became stale.
       * The caller must still queue it for release after endFrame.
       */
      readonly lease?: ProjectedSpotFrameLease;
    };

const unsupported = (reason: ProjectedSpotUnsupportedReason, detail: string, lease?: ProjectedSpotFrameLease): ProjectedSpotBindingsResult =>
  ({ status: "unsupported", reason, detail, ...(lease ? { lease } : {}) });

function sameNumbers(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (!Object.is(left[i], right[i])) return false;
  return true;
}

/** Ensure both the packed bytes and the occurrence-to-slot mapping are live. */
function selectionMatches(lights: readonly CollectedLight[], selection: PackedLightsWithSelection): boolean {
  if (!Array.isArray(lights) || !selection || !selection.packed || !Array.isArray(selection.inputLights) ||
      !Array.isArray(selection.selected) || selection.packed.layout !== LightUniforms.layout ||
      !(selection.packed.data instanceof Float32Array) || selection.inputLights.length !== lights.length ||
      selection.selected.length !== selection.packed.lightCount || selection.selected.length > MAX_DIRECT_LIGHTS) return false;
  for (let i = 0; i < lights.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(lights, i) || selection.inputLights[i] !== lights[i]) return false;
  }
  const limit = selection.packed.diagnostics?.requestedMaxLights;
  if (!Number.isInteger(limit) || limit < 1) return false;
  const fresh = LightUniforms.packWithSelection(lights, limit);
  if (fresh.packed.lightCount !== selection.packed.lightCount || !sameNumbers(fresh.packed.data, selection.packed.data) ||
      fresh.selected.length !== selection.selected.length) return false;
  for (let slot = 0; slot < fresh.selected.length; slot += 1) {
    if (fresh.selected[slot]!.light !== selection.selected[slot]?.light ||
        fresh.selected[slot]!.inputIndex !== selection.selected[slot]?.inputIndex) return false;
  }
  // Packing reads caller-owned lights and can reenter or mutate the source.
  return selection.inputLights.length === lights.length && selection.inputLights.every((light, index) => lights[index] === light);
}

function float32(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.fround(value);
  return Number.isFinite(rounded) && (value === 0 || rounded !== 0) ? rounded : undefined;
}

function vector2(value: readonly number[] | undefined, fallback: readonly [number, number]): readonly [number, number] | undefined {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const x = float32(value[0]), y = float32(value[1]);
  return x === undefined || y === undefined ? undefined : [x, y];
}

function validSpot(light: CollectedLight): boolean {
  if (light.kind !== "spot" || !light.position || !light.direction || light.position.length !== 3 || light.direction.length !== 3) return false;
  const position = Array.from(light.position, float32);
  const direction = Array.from(light.direction, float32);
  if (position.some((v) => v === undefined) || direction.some((v) => v === undefined)) return false;
  const [x, y, z] = direction as number[];
  const length2 = Math.fround(Math.fround(Math.fround(x! * x!) + Math.fround(y! * y!)) + Math.fround(z! * z!));
  const angle = float32(light.spotAngle);
  if (!(length2 > 0) || !Number.isFinite(length2) || angle === undefined || angle <= 0 || angle >= Math.PI / 2) return false;
  const tangent = Math.fround(Math.tan(angle));
  return Number.isFinite(tangent) && tangent > 0;
}

function frameMatches(left: ProjectedSpotFrameIdentity, right: ProjectedSpotFrameIdentity): boolean {
  return left.device === right.device && left.owner === right.owner && left.viewId === right.viewId && left.frameIndex === right.frameIndex;
}

function validFrame(frame: ProjectedSpotFrameIdentity): boolean {
  return !!frame && !!frame.device && !!frame.owner && (typeof frame.owner === "object" || typeof frame.owner === "function") &&
    (typeof frame.viewId === "string" || (typeof frame.viewId === "number" && Number.isFinite(frame.viewId))) &&
    Number.isSafeInteger(frame.frameIndex) && frame.frameIndex >= 0 && !frame.device.disposed && !frame.device.contextLost && !!frame.device.activeFrameToken;
}

function validTexture(texture: Texture): boolean {
  if (!(texture instanceof Texture) || texture.disposed || texture.dimension !== "2d" || texture.format !== "rgba8" ||
      (texture.colorSpace !== "linear" && texture.colorSpace !== "srgb") || texture.flipY || texture.generateMipmaps || texture.dynamic ||
      texture.mipLevelCount !== 1 || texture.mipLevels.length !== 1 || texture.data !== null || texture.source !== null ||
      !texture.usage.includes("sampled") || !texture.usage.includes("copy-dst") || texture.usage.includes("storage") || texture.usage.includes("render-attachment") ||
      getRenderTargetTextureOwner(texture) !== undefined || !Number.isSafeInteger(texture.width) || !Number.isSafeInteger(texture.height) ||
      texture.width < 1 || texture.height < 1) return false;
  const level = texture.getMipLevel(0);
  const bytes = texture.width * texture.height * 4;
  return Number.isSafeInteger(bytes) && !!level && level.width === texture.width && level.height === texture.height &&
    level.data instanceof Uint8Array && level.data.byteLength === bytes;
}

/**
 * Admit exactly one image-bearing spot for the unclustered forward light
 * packet. Callers must provide the same live collected-light occurrences used
 * by packWithSelection and retain *every* returned lease, including the lease
 * on a stale unsupported result, through the frame's end/fence lifecycle.
 * Build once for a light packet and view, then reuse it within that frame;
 * call isCurrent immediately before each draw using its uniforms.
 *
 * Texture samples are RGB multipliers; sRGB decoding, when authored, belongs
 * to the texture format. Alpha and mip levels are not part of this route.
 */
export function buildProjectedSpotBindings<TAsset>(
  lights: readonly ProjectedSpotLight<TAsset>[],
  selection: PackedLightsWithSelection,
  frame: ProjectedSpotFrameIdentity,
  resource: ProjectedSpotResource<TAsset> | undefined,
  options: { readonly clustered?: boolean } = {}
): ProjectedSpotBindingsResult {
  let lease: ProjectedSpotFrameLease | undefined;
  try {
    if (!Array.isArray(lights)) return unsupported("stale-selection", "Direct lights are unavailable");
    const images = lights.map((light) => light?.projectedImage);
    const indices = images.flatMap((image, index) => image === undefined ? [] : [index]);
    if (indices.length === 0) return { status: "not-required" };
    if (options.clustered) return unsupported("clustered", "Clustered projection indexing is not implemented");
    if (indices.length !== 1) return unsupported("multiple-projections", "Only one projected spot is supported per direct-light packet");
    if (frame?.device?.kind !== "webgl2") return unsupported("backend-unsupported", "Projected spot images currently require the WebGL2 shader route");
    if (!selectionMatches(lights, selection)) return unsupported("stale-selection", "Direct-light selection does not match the current light occurrences");
    const inputIndex = indices[0]!;
    const light = lights[inputIndex]!;
    const image = images[inputIndex];
    if (!image || typeof image !== "object" || image.texture === undefined || image.texture === null) {
      return unsupported("invalid-transform", "The projected image or its asset identity is unavailable");
    }
    if (!validSpot(light)) return unsupported("unsupported-light", "Projection requires a finite directed spot and a representable cone angle");
    const slot = selection.selected.findIndex((entry) => entry.inputIndex === inputIndex && entry.light === light);
    if (slot < 0) return unsupported("light-not-selected", "The projected spot is not present in the selected direct-light slots");
    const offsetRef = image.offset, scaleRef = image.scale, rotationValue = image.rotation;
    if ((offsetRef !== undefined && !Array.isArray(offsetRef)) || (scaleRef !== undefined && !Array.isArray(scaleRef))) {
      return unsupported("invalid-transform", "Projection offset and scale must be two-component arrays");
    }
    const offsetSource = offsetRef ? [...offsetRef] : undefined;
    const scaleSource = scaleRef ? [...scaleRef] : undefined;
    const offset = vector2(offsetSource, [0, 0]), scale = vector2(scaleSource, [1, 1]);
    const rotation = float32(rotationValue === undefined ? 0 : rotationValue);
    if (!offset || !scale || scale[0] === 0 || scale[1] === 0 || rotation === undefined) {
      return unsupported("invalid-transform", "Projection offset, nonzero scale, and rotation must fit finite float32 values");
    }
    if (!validFrame(frame)) return unsupported("frame-unavailable", "A live device frame and view identity are required");
    // Capture before calling resource methods, which may synchronously run
    // user-owned hooks. No post-callback snapshot may bless changed inputs.
    const frameSnapshot: ProjectedSpotFrameIdentity = Object.freeze({ device: frame.device, owner: frame.owner, viewId: frame.viewId, frameIndex: frame.frameIndex });
    const source = [...lights];
    const packed = selection.packed.data;
    const packedSnapshot = packed.slice();
    const asset = image.texture;
    const imageResource = resource;
    if (!imageResource || !imageResource.matchesAsset(asset)) return unsupported("texture-unavailable", "The verified image resource does not match the authored asset");
    lease = imageResource.acquireFrame(frameSnapshot);
    if (!lease) return unsupported("texture-unavailable", "The verified image is unavailable for this frame");

    const texture = lease.texture;
    const sampler = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge", maxAnisotropy: 1 });
    const binding = new TextureBinding({ name: "u_projectedSpotMap", texture, sampler, required: true,
      expectedColorSpace: texture.colorSpace, expectedDimension: "2d" });
    const uniforms: ProjectedSpotUniforms = Object.freeze({
      u_projectedSpotEnabled: 1, u_projectedSpotIndex: slot, u_projectedSpotMap: binding,
      u_projectedSpotOffset: Object.freeze([offset[0], offset[1]] as const),
      u_projectedSpotScale: Object.freeze([scale[0], scale[1]] as const), u_projectedSpotRotation: rotation
    });
    const retained = lease;
    const isCurrent = (identity: ProjectedSpotFrameIdentity): boolean => {
      try {
        if (!frameMatches(identity, frameSnapshot) || !validFrame(identity) || identity.device.kind !== "webgl2" || options.clustered ||
            retained.texture !== texture || !imageResource.matchesAsset(asset) || !validTexture(texture) ||
            selection.packed.data !== packed || !sameNumbers(packed, packedSnapshot) || !selectionMatches(lights, selection) ||
            lights.length !== source.length || lights.some((candidate, index) => candidate !== source[index] || candidate.projectedImage !== images[index]) ||
            image.texture !== asset || image.offset !== offsetRef || image.scale !== scaleRef || !Object.is(image.rotation, rotationValue) ||
            (offsetRef !== undefined && (!offsetSource || !sameNumbers(offsetRef, offsetSource))) ||
            (scaleRef !== undefined && (!scaleSource || !sameNumbers(scaleRef, scaleSource))) ||
            !validSpot(light) || selection.selected[slot]?.light !== light || selection.selected[slot]?.inputIndex !== inputIndex ||
            binding.name !== "u_projectedSpotMap" || binding.texture !== texture || binding.sampler !== sampler || !binding.required || !binding.ready ||
            binding.expectedColorSpace !== texture.colorSpace || binding.expectedDimension !== "2d" ||
            !sameNumbers(binding.offset, [0, 0]) || !sameNumbers(binding.scale, [1, 1]) || binding.rotation !== 0 || !binding.validate().ok ||
            sampler.minFilter !== "linear" || sampler.magFilter !== "linear" || sampler.addressU !== "clamp-to-edge" || sampler.addressV !== "clamp-to-edge" ||
            sampler.maxAnisotropy !== 1 || sampler.compare !== undefined || sampler.addressW !== undefined || sampler.mirror) return false;
        // Validate the retained image and its revision at the draw boundary.
        // The resource uses the documented Texture mutation/revision contract.
        return imageResource.matchesAsset(asset) && frameMatches(identity, frameSnapshot) && validFrame(identity) && selectionMatches(lights, selection) &&
          selection.packed.data === packed && sameNumbers(packed, packedSnapshot) && lights.length === source.length &&
          lights.every((candidate, index) => candidate === source[index] && candidate.projectedImage === images[index]) &&
          image.texture === asset && image.offset === offsetRef && image.scale === scaleRef && Object.is(image.rotation, rotationValue) &&
          (offsetRef === undefined || (!!offsetSource && sameNumbers(offsetRef, offsetSource))) &&
          (scaleRef === undefined || (!!scaleSource && sameNumbers(scaleRef, scaleSource))) &&
          retained.texture === texture && retained.isCurrent(identity);
      } catch { return false; }
    };
    if (!isCurrent(frame)) return unsupported("stale-resource", "Projection inputs or their frame lease changed during admission", lease);
    return Object.freeze({ status: "ready", slot, inputIndex, uniforms, lease, isCurrent });
  } catch (error) {
    return unsupported(lease ? "stale-resource" : "stale-selection", error instanceof Error ? error.message : "Projected spot inputs are unavailable", lease);
  }
}
