import { RenderDeviceError, type RenderDevice, type UniformValue } from "../RenderDevice";
import { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import type { Texture } from "../Texture";
import type { FrameContributorContext } from "../contracts/frameGraph";
import type { RenderItem } from "../contracts/renderItem";
import type { NativeLightProbeGridRenderData, ProbeOutsidePolicy } from "./NativeLightProbeGrid";
import { verifyNativeBakedLightmap, type NativeBakedLightmapRenderData } from "./NativeLightBaking";
import type { VoxelIndirectRenderData } from "./VoxelIndirectLighting";
import { NATIVE_BAKED_LIGHTMAP_FEATURE, NATIVE_LIGHTMAP_UV_FEATURE, NATIVE_PROBE_GRID_FEATURE, NATIVE_VOXEL_INDIRECT_FEATURE } from "../program/ProgramFeatures";

/** Identity supplied by the renderer for a single view of a single frame. */
export type AdvancedLightingFrame = Pick<FrameContributorContext, "device" | "postScopeId" | "viewId" | "frameIndex">;

/** Sources and options belong to the producer; textures are borrowed, never disposed here. */
export type AdvancedLightingSource =
  | { readonly kind: "probe-grid"; readonly data: NativeLightProbeGridRenderData; readonly intensity: number; readonly outside: ProbeOutsidePolicy;
      readonly assertCurrent: () => void; readonly current?: () => NativeLightProbeGridRenderData }
  | { readonly kind: "voxel"; readonly data: VoxelIndirectRenderData; readonly intensity: number; readonly maxDistance: number;
      readonly assertCurrent: () => void; readonly current?: () => VoxelIndirectRenderData }
  | { readonly kind: "lightmap"; readonly data: NativeBakedLightmapRenderData; readonly intensity: number; readonly composition: "replace-diffuse" | "add-indirect";
      readonly assertCurrent: () => void };

export interface AdvancedLightingBinding {
  readonly kind: AdvancedLightingSource["kind"];
  readonly uniforms: Readonly<Record<string, UniformValue>>;
  readonly uvSet?: 0 | 1;
  readonly composition?: "replace-diffuse" | "add-indirect";
}

/** These axes are part of the generated-program cache key, not uniforms. */
export function advancedLightingFeatures(binding: AdvancedLightingBinding): Record<string, string | number | boolean> {
  if (binding.kind === "probe-grid") return { [NATIVE_PROBE_GRID_FEATURE]: true };
  if (binding.kind === "voxel") return { [NATIVE_VOXEL_INDIRECT_FEATURE]: true };
  if (binding.uvSet === undefined || !binding.composition) return fail("Lightmap feature metadata is incomplete");
  return { [NATIVE_BAKED_LIGHTMAP_FEATURE]: binding.composition, [NATIVE_LIGHTMAP_UV_FEATURE]: binding.uvSet };
}

/** Enumerable so normal render-item copies preserve the scoped attachment. */
export const ADVANCED_LIGHTING_BINDING = Symbol.for("@aura3d/rendering/advanced-lighting-bindings");

type TaggedItem = RenderItem & { readonly [ADVANCED_LIGHTING_BINDING]?: Packet };
interface Packet {
  readonly device: RenderDevice;
  readonly generation: number | undefined;
  readonly owner: object;
  readonly viewId: string | number;
  readonly frameIndex: number;
  readonly source: AdvancedLightingSource;
  readonly texture: Texture;
  readonly textureRevision: number;
  readonly lightmapProof?: { readonly data: NativeBakedLightmapRenderData; readonly uvSet: 0 | 1; readonly gutter: number; readonly texelDensity: number };
}

function fail(message: string, code = "ADVANCED_LIGHTING_BINDING_INVALID"): never {
  throw new RenderDeviceError(message, code, {});
}

function frameIdentity(frame: AdvancedLightingFrame): { owner: object; viewId: string | number } {
  if (!frame?.device || !frame.postScopeId || (typeof frame.postScopeId !== "object" && typeof frame.postScopeId !== "function")
      || (typeof frame.viewId !== "string" && (typeof frame.viewId !== "number" || !Number.isFinite(frame.viewId)))
      || !Number.isSafeInteger(frame.frameIndex) || frame.frameIndex < 0
      || frame.device.disposed || frame.device.contextLost) {
    return fail("Advanced lighting needs a live device and a scoped frame/view", "ADVANCED_LIGHTING_FRAME_UNAVAILABLE");
  }
  return { owner: frame.postScopeId, viewId: frame.viewId };
}

function finiteFloat(value: number, label: string, positive = false): number {
  const f = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(f) || (positive ? f <= 0 : f < 0)) return fail(`Invalid advanced lighting ${label}`);
  return f;
}

function bounds(min: readonly number[], max: readonly number[]): [Float32Array, Float32Array] {
  if (min.length !== 3 || max.length !== 3) return fail("Advanced lighting bounds require three coordinates");
  const low = new Float32Array([...min, 0]), high = new Float32Array([...max, 0]);
  for (let i = 0; i < 3; i += 1) {
    const extent = Math.fround(high[i]! - low[i]!);
    if (!Number.isFinite(low[i]) || !Number.isFinite(high[i]) || !Number.isFinite(extent) || extent <= 0) {
      return fail("Advanced lighting bounds must have finite positive float32 extents");
    }
  }
  return [low, high];
}

function dimensions(value: readonly number[], max: number): Float32Array {
  if (value.length !== 3 || value.some((n) => !Number.isSafeInteger(n) || n < 1 || n > max)) return fail("Invalid advanced lighting dimensions");
  return new Float32Array([...value, 0]);
}

function textureBinding(name: string, texture: NativeLightProbeGridRenderData["texture"]): TextureBinding {
  if (!texture || texture.disposed || texture.dimension !== "2d" || texture.format !== "rgba32f" || texture.colorSpace !== "linear"
      || !texture.usage.includes("sampled") || texture.mipLevelCount !== 1) return fail("Advanced lighting requires a live, linear rgba32f 2D texture");
  return new TextureBinding({ name, texture, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }), required: true,
    expectedColorSpace: "linear", expectedDimension: "2d" });
}

function sourceUniforms(source: AdvancedLightingSource, deferLightmapContentCheck = false): AdvancedLightingBinding {
  const intensity = finiteFloat(source.intensity, "intensity");
  if (source.kind === "probe-grid") {
    if (source.outside !== "null" && source.outside !== "clamp") return fail("Invalid probe-grid outside policy");
    const { data } = source;
    const [min, max] = bounds(data.min, data.max);
    const grid = dimensions(data.dimensions, 32);
    const texture = textureBinding("u_a3dNativeProbeTexture", data.texture);
    if (data.texture.width !== data.dimensions[0] * 9 || data.texture.height !== data.dimensions[1] * data.dimensions[2]) {
      return fail("Probe-grid texture dimensions do not match its grid");
    }
    return { kind: source.kind, uniforms: { u_a3dNativeProbeTexture: texture, u_a3dNativeProbeMin: min, u_a3dNativeProbeMax: max,
      u_a3dNativeProbeDimensions: grid, u_a3dNativeProbeIntensity: intensity, u_a3dNativeProbeOutside: source.outside === "clamp" ? 1 : 0 } };
  }
  if (source.kind === "voxel") {
    const { data } = source;
    const [min, max] = bounds(data.bounds.min, data.bounds.max);
    const resolution = dimensions(data.resolution, 64);
    const extents: number[] = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const extent = Math.fround(max[axis]! - min[axis]!);
      extents.push(extent);
      const cell = Math.fround(extent / resolution[axis]!);
      if (cell <= 0 || !Number.isFinite(Math.fround(1 / cell)) || Math.fround(cell * 0.5) <= 0) {
        return fail("Voxel cells must remain usable at float32 precision");
      }
    }
    const diagonal = Math.fround(Math.hypot(...extents));
    const maxTraceDistance = Math.fround(diagonal * 4);
    if (!Number.isFinite(diagonal) || !Number.isFinite(maxTraceDistance)) return fail("Voxel bounds exceed the float32 tracing range");
    const texture = textureBinding("u_a3dNativeVoxelTexture", data.texture);
    if (data.levels.length < 1 || data.levels.length > 7 || !Number.isInteger(data.maxConeSteps) || data.maxConeSteps < 1 || data.maxConeSteps > 128
        || ![1, 5, 9].includes(data.hemisphereCones)) return fail("Invalid voxel tracing limits");
    const levels = new Float32Array(28);
    let offset = 0;
    for (let i = 0; i < data.levels.length; i += 1) {
      const level = data.levels[i]!;
      const scale = 2 ** i;
      const expected = data.resolution.map((n) => Math.ceil(n / scale));
      if (level.scale !== scale || level.offset !== offset || level.dimensions.length !== 3
          || level.dimensions.some((n, axis) => n !== expected[axis])) return fail("Invalid voxel pyramid layout");
      levels.set([...level.dimensions, offset], i * 4);
      offset += level.dimensions[0] * level.dimensions[1] * level.dimensions[2];
    }
    const last = data.levels[data.levels.length - 1]!;
    if (last.dimensions.some((n) => n !== 1) || offset > data.texture.width * data.texture.height) return fail("Incomplete voxel pyramid texture");
    const distance = finiteFloat(source.maxDistance, "voxel maximum distance", true);
    if (distance > maxTraceDistance) return fail("Voxel maximum distance exceeds four volume diagonals");
    return { kind: source.kind, uniforms: { u_a3dNativeVoxelTexture: texture, u_a3dNativeVoxelMin: min, u_a3dNativeVoxelMax: max,
      u_a3dNativeVoxelResolution: resolution, u_a3dNativeVoxelLevels: levels,
      u_a3dNativeVoxelConfig: new Float32Array([data.levels.length, data.maxConeSteps, data.hemisphereCones, distance]), u_a3dNativeVoxelIntensity: intensity } };
  }
  if (source.kind !== "lightmap" || (source.composition !== "replace-diffuse" && source.composition !== "add-indirect")) {
    return fail("Invalid advanced lighting source");
  }
  const { data } = source;
  if (data.uvChannel !== 0 && data.uvChannel !== 1) return fail("Lightmaps require UV channel 0 or 1");
  if (!deferLightmapContentCheck) {
    const provenance = verifyNativeBakedLightmap(data);
    if (!provenance) return fail("Lightmap is not an unmodified completed bake", "LIGHTMAP_PROVENANCE_INVALID");
    if (provenance.hasAuthoredLights) return fail("Lightmaps containing authored lights are not supported by this draw path", "LIGHTMAP_CONTAINS_AUTHORED_LIGHTS");
  }
  return { kind: source.kind, uvSet: data.uvChannel, composition: source.composition,
    uniforms: { u_a3dNativeLightmapTexture: textureBinding("u_a3dNativeLightmapTexture", data.texture), u_a3dNativeLightmapIntensity: intensity } };
}

/** Attach one source to an item for this frame; another source must never be silently overwritten. */
export function stampAdvancedLightingBinding(item: RenderItem, frame: AdvancedLightingFrame, source: AdvancedLightingSource): RenderItem {
  const identity = frameIdentity(frame);
  if ((item as TaggedItem)[ADVANCED_LIGHTING_BINDING]) return fail("An item cannot receive multiple advanced diffuse sources", "ADVANCED_LIGHTING_SOURCE_CONFLICT");
  if (typeof source.assertCurrent !== "function") return fail("Advanced lighting needs a live attachment ticket");
  source.assertCurrent();
  const binding = sourceUniforms(source);
  const packet: Packet = Object.freeze({ device: frame.device, generation: frame.device.generation, owner: identity.owner, viewId: identity.viewId,
    frameIndex: frame.frameIndex, source, texture: source.data.texture, textureRevision: source.data.texture.revision,
    ...(source.kind === "lightmap" ? { lightmapProof: { data: source.data, uvSet: binding.uvSet!, gutter: source.data.gutter, texelDensity: source.data.texelDensity } } : {}) });
  const tagged: TaggedItem = { ...item, [ADVANCED_LIGHTING_BINDING]: packet };
  return tagged;
}

/** Revalidate identity and live data. A caller deferring the linear lightmap
 * content scan must perform the default full validation before submission. */
export function advancedLightingItemBinding(item: RenderItem, frame?: AdvancedLightingFrame,
  options: { readonly deferLightmapContentCheck?: boolean } = {}): AdvancedLightingBinding | null {
  const packet = (item as TaggedItem)[ADVANCED_LIGHTING_BINDING];
  if (!packet) return null;
  if (!frame) return fail("Advanced lighting frame is unavailable", "ADVANCED_LIGHTING_FRAME_UNAVAILABLE");
  const identity = frameIdentity(frame);
  if (frame.device !== packet.device || frame.device.generation !== packet.generation || identity.owner !== packet.owner
      || identity.viewId !== packet.viewId || frame.frameIndex !== packet.frameIndex) {
    return fail("Advanced lighting binding does not belong to this device, owner, view and frame", "ADVANCED_LIGHTING_FRAME_MISMATCH");
  }
  const source = packet.source;
  source.assertCurrent();
  if (source.kind !== "lightmap" && source.current) {
    const current = source.current();
    if (current.texture !== source.data.texture || current.revision !== source.data.revision) {
      return fail("Advanced lighting resource changed after this frame was prepared", "ADVANCED_LIGHTING_RESOURCE_CHANGED");
    }
  }
  if (source.data.texture !== packet.texture || source.data.texture.revision !== packet.textureRevision) {
    return fail("Advanced lighting texture changed after this frame was prepared", "ADVANCED_LIGHTING_RESOURCE_CHANGED");
  }
  if (options.deferLightmapContentCheck && source.kind === "lightmap") {
    const proof = packet.lightmapProof;
    if (!proof || source.data !== proof.data || source.data.uvChannel !== proof.uvSet || source.data.gutter !== proof.gutter
        || source.data.texelDensity !== proof.texelDensity) return fail("Lightmap certificate changed after this frame was prepared", "LIGHTMAP_PROVENANCE_INVALID");
  }
  return sourceUniforms(source, options.deferLightmapContentCheck === true);
}
