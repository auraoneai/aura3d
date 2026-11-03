import { AuraAdvancedLightingUnavailableError, type AuraAdvancedIndirectOptions, type AuraAdvancedIndirectSource,
  type AuraLightmapAttachmentOptions, type AuraProbeGridAttachmentOptions, type AuraVoxelAttachmentOptions } from "../../contracts/lighting.js";
import type { NativeBakedLightmapRenderData, NativeLightProbeGridRenderData, VoxelIndirectRenderData } from "@aura3d/rendering/lighting";
import { verifyNativeBakedLightmap } from "../../../../rendering/src/lighting/NativeLightBaking.js";

type ProbeBinding = {
  readonly kind: "probe-grid";
  readonly source: Extract<AuraAdvancedIndirectSource, { kind: "probe-grid" }>;
  readonly options: Required<AuraProbeGridAttachmentOptions>;
};
type VoxelBinding = {
  readonly kind: "voxel";
  readonly source: Extract<AuraAdvancedIndirectSource, { kind: "voxel" }>;
  readonly options: Required<AuraVoxelAttachmentOptions>;
};
export type AdvancedIndirectBinding = ProbeBinding | VoxelBinding;
export interface AdvancedLightmapBinding {
  readonly nodeName: string;
  readonly lightmap: NativeBakedLightmapRenderData;
  readonly options: Required<AuraLightmapAttachmentOptions>;
}

/**
 * Only the real renderer installs this contract. It must reject unsupported
 * devices, drawing paths, material/UV combinations and incompatible features;
 * it is called at attachment and again before a frame consumes the binding.
 */
export interface AdvancedLightingConsumer {
  validateIndirect(binding: AdvancedIndirectBinding): void;
  validateLightmap(binding: AdvancedLightmapBinding): void;
}

export interface AdvancedLightingSnapshot {
  readonly indirect?:
    | { readonly kind: "probe-grid"; readonly data: NativeLightProbeGridRenderData; readonly options: Required<AuraProbeGridAttachmentOptions> }
    | { readonly kind: "voxel"; readonly data: VoxelIndirectRenderData; readonly options: Required<AuraVoxelAttachmentOptions> };
  readonly lightmaps: readonly AdvancedLightmapBinding[];
}

/** A frame's attachment snapshot and a guard for callbacks that run during draw. */
export interface AdvancedLightingSnapshotTicket {
  readonly snapshot: AdvancedLightingSnapshot;
  assertCurrent(): void;
}

interface IndirectRecord { readonly binding: AdvancedIndirectBinding; unsubscribe: () => void; }
interface LightmapRecord { readonly binding: AdvancedLightmapBinding; unsubscribe: () => void; }
interface ConsumerSlot { readonly value: AdvancedLightingConsumer; }
interface InvalidatorSlot { readonly value: () => void; }

/** Runtime-only state owned by one app's node registry. */
export class AdvancedLightingState {
  private invalidator: InvalidatorSlot | undefined;
  private consumer: ConsumerSlot | undefined;
  private indirect: IndirectRecord | undefined;
  private readonly lightmaps = new Map<string, LightmapRecord>();
  private version = 0;
  private disposed = false;

  setInvalidator(invalidator: () => void): () => void {
    this.assertLive();
    if (typeof invalidator !== "function") throw new TypeError("advanced lighting invalidator must be a function");
    const slot = { value: invalidator };
    this.invalidator = slot;
    return () => { if (this.invalidator === slot) this.invalidator = undefined; };
  }

  installConsumer(consumer: AdvancedLightingConsumer): () => void {
    this.assertLive();
    if (!consumer || typeof consumer.validateIndirect !== "function" || typeof consumer.validateLightmap !== "function") {
      throw new TypeError("advanced lighting consumer must validate indirect and lightmap bindings");
    }
    const version = this.version;
    const previous = this.consumer;
    if (this.indirect) consumer.validateIndirect(this.indirect.binding);
    for (const record of this.lightmaps.values()) consumer.validateLightmap(record.binding);
    if (this.version !== version || this.consumer !== previous) throw new Error("Advanced lighting attachments changed while installing a renderer consumer.");
    const slot = { value: consumer };
    this.consumer = slot;
    return () => { if (this.consumer === slot) this.consumer = undefined; };
  }

  attachIndirect(source: AuraAdvancedIndirectSource, options?: AuraAdvancedIndirectOptions): () => void {
    this.assertLive();
    const binding = normalizeIndirect(source, options);
    const consumer = this.requireConsumer();
    consumer.value.validateIndirect(binding);
    if (this.requireConsumer() !== consumer) throw new AuraAdvancedLightingUnavailableError();
    const resource = binding.kind === "probe-grid" ? binding.source.grid : binding.source.volume;
    // Check liveness before replacing a previous attachment. This may lazily
    // create the source-owned CPU texture but never allocates a GPU resource.
    resource.renderData();
    if (this.requireConsumer() !== consumer) throw new AuraAdvancedLightingUnavailableError();
    const record: IndirectRecord = { binding, unsubscribe: () => {} };
    let disposedDuringSubscribe = false;
    record.unsubscribe = resource.onChange((event) => {
      if (event.disposed) {
        if (this.indirect === record) {
          this.indirect = undefined;
          record.unsubscribe();
          this.changed();
        } else disposedDuringSubscribe = true;
      } else if (this.indirect === record) this.changed();
    });
    if (disposedDuringSubscribe) {
      record.unsubscribe();
      throw new Error("Cannot attach a disposed advanced lighting resource.");
    }
    try { if (this.requireConsumer() !== consumer) throw new AuraAdvancedLightingUnavailableError(); }
    catch (error) { record.unsubscribe(); throw error; }
    const previous = this.indirect;
    this.indirect = record;
    try { this.changed(); } catch (error) {
      if (this.indirect === record) { this.indirect = previous; this.version += 1; }
      record.unsubscribe();
      throw error;
    }
    previous?.unsubscribe();
    return () => {
      if (this.indirect !== record) return;
      this.indirect = undefined;
      record.unsubscribe();
      this.changed();
    };
  }

  attachLightmap(nodeName: string, lightmap: NativeBakedLightmapRenderData, options: AuraLightmapAttachmentOptions): () => void {
    this.assertLive();
    const binding = normalizeLightmap(nodeName, lightmap, options);
    const consumer = this.requireConsumer();
    consumer.value.validateLightmap(binding);
    if (this.requireConsumer() !== consumer) throw new AuraAdvancedLightingUnavailableError();
    validateLightmapProvenance(binding.lightmap, binding.options);
    const record: LightmapRecord = { binding, unsubscribe: () => {} };
    let disposedDuringSubscribe = false;
    record.unsubscribe = binding.lightmap.texture.onDispose(() => {
      if (this.lightmaps.get(binding.nodeName) === record) {
        this.lightmaps.delete(binding.nodeName);
        record.unsubscribe();
        this.changed();
      } else disposedDuringSubscribe = true;
    });
    if (disposedDuringSubscribe) {
      record.unsubscribe();
      throw new Error("Cannot attach a disposed lightmap texture.");
    }
    try { if (this.requireConsumer() !== consumer) throw new AuraAdvancedLightingUnavailableError(); }
    catch (error) { record.unsubscribe(); throw error; }
    const previous = this.lightmaps.get(binding.nodeName);
    this.lightmaps.set(binding.nodeName, record);
    try { this.changed(); } catch (error) {
      if (this.lightmaps.get(binding.nodeName) === record) {
        if (previous) this.lightmaps.set(binding.nodeName, previous);
        else this.lightmaps.delete(binding.nodeName);
        this.version += 1;
      }
      record.unsubscribe();
      throw error;
    }
    previous?.unsubscribe();
    return () => {
      if (this.lightmaps.get(binding.nodeName) !== record) return;
      this.lightmaps.delete(binding.nodeName);
      record.unsubscribe();
      this.changed();
    };
  }

  /** Read committed, current resource data for one renderer frame. */
  snapshot(): AdvancedLightingSnapshot {
    this.assertLive();
    const indirect = this.indirect;
    const maps = [...this.lightmaps.values()];
    if (!indirect && maps.length === 0) return { lightmaps: [] };
    const version = this.version;
    const consumer = this.requireConsumer();
    if (indirect) consumer.value.validateIndirect(indirect.binding);
    for (const record of maps) {
      consumer.value.validateLightmap(record.binding);
      validateLightmapProvenance(record.binding.lightmap, record.binding.options);
    }
    if (this.version !== version || this.consumer !== consumer) throw new Error("Advanced lighting attachments changed while preparing a frame.");
    const source = indirect?.binding;
    const result: AdvancedLightingSnapshot = {
      ...(source?.kind === "probe-grid" ? { indirect: { kind: "probe-grid" as const, data: source.source.grid.renderData(), options: source.options } }
        : source?.kind === "voxel" ? { indirect: { kind: "voxel" as const, data: source.source.volume.renderData(), options: source.options } } : {}),
      lightmaps: maps.map((record) => record.binding)
    };
    if (this.version !== version || this.consumer !== consumer) throw new Error("Advanced lighting attachments changed while preparing a frame.");
    return result;
  }

  /**
   * Capture after resource synchronization. A draw callback can mutate or
   * detach a source after collection; the old packet must never be used then.
   */
  captureSnapshot(): AdvancedLightingSnapshotTicket {
    const snapshot = this.snapshot();
    const version = this.version;
    const consumer = this.consumer;
    const invalidator = this.invalidator;
    return {
      snapshot,
      assertCurrent: () => {
        if (this.disposed || this.version !== version || this.consumer !== consumer || this.invalidator !== invalidator) {
          throw new Error("ADVANCED_LIGHTING_FRAME_STALE: attachments changed while rendering");
        }
      }
    };
  }

  hasIndirect(): boolean { return !this.disposed && this.indirect !== undefined; }
  hasLightmaps(): boolean { return !this.disposed && this.lightmaps.size > 0; }

  /** Scene changes release subscriptions, never the caller's resources. */
  clearScene(): void {
    if (this.disposed || (!this.indirect && this.lightmaps.size === 0)) return;
    this.indirect?.unsubscribe();
    this.indirect = undefined;
    for (const record of this.lightmaps.values()) record.unsubscribe();
    this.lightmaps.clear();
    this.changed();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.indirect?.unsubscribe();
    this.indirect = undefined;
    for (const record of this.lightmaps.values()) record.unsubscribe();
    this.lightmaps.clear();
    this.consumer = undefined;
    this.invalidator = undefined;
    this.version += 1;
  }

  private requireConsumer(): ConsumerSlot {
    this.assertLive();
    if (!this.consumer || !this.invalidator) throw new AuraAdvancedLightingUnavailableError();
    return this.consumer;
  }

  private changed(): void {
    this.version += 1;
    const invalidate = this.invalidator;
    if (!invalidate) return;
    try { invalidate.value(); } catch (error) {
      // A failing scheduler cannot back a usable attachment. Future snapshots
      // fail closed until the app installs a working invalidator again.
      if (this.invalidator === invalidate) this.invalidator = undefined;
      throw error;
    }
  }

  private assertLive(): void { if (this.disposed) throw new Error("Advanced lighting state is disposed."); }
}

function intensity(value: number | undefined): number {
  const result = value ?? 1;
  if (!Number.isFinite(result) || result < 0 || !Number.isFinite(Math.fround(result))) throw new RangeError("lighting intensity must be a finite nonnegative float32 value");
  return result;
}

function normalizeIndirect(source: AuraAdvancedIndirectSource, options: AuraAdvancedIndirectOptions | undefined): AdvancedIndirectBinding {
  if (!source || typeof source !== "object" || (source.kind !== "probe-grid" && source.kind !== "voxel")) throw new TypeError("unknown advanced indirect source");
  if (options !== undefined && (!options || typeof options !== "object")) throw new TypeError("advanced indirect options must be an object");
  const opts = (options ?? {}) as AuraProbeGridAttachmentOptions & AuraVoxelAttachmentOptions;
  const strength = intensity(opts.intensity);
  if (source.kind === "probe-grid") {
    if (opts.maxDistance !== undefined) throw new RangeError("maxDistance is only valid for a voxel source");
    const grid = source.grid;
    if (!grid || typeof grid.renderData !== "function" || typeof grid.onChange !== "function") throw new TypeError("probe grid resource is invalid");
    const outside = opts.outside ?? "null";
    if (outside !== "null" && outside !== "clamp") throw new RangeError("probe-grid outside policy must be null or clamp");
    return { kind: "probe-grid", source: { kind: "probe-grid", grid }, options: Object.freeze({ intensity: strength, outside }) };
  }
  if (opts.outside !== undefined) throw new RangeError("outside is only valid for a probe grid");
  const volume = source.volume;
  if (!volume || typeof volume.renderData !== "function" || typeof volume.onChange !== "function" || !volume.bounds) throw new TypeError("voxel volume resource is invalid");
  const diagonal = Math.hypot(...volume.bounds.max.map((value, axis) => value - volume.bounds.min[axis]!));
  const maxDistance = opts.maxDistance ?? diagonal;
  if (!Number.isFinite(maxDistance) || maxDistance <= 0 || maxDistance > diagonal * 4 || !Number.isFinite(Math.fround(maxDistance)) || Math.fround(maxDistance) <= 0) {
    throw new RangeError("voxel maxDistance must be positive and no more than four volume diagonals in float32");
  }
  return { kind: "voxel", source: { kind: "voxel", volume }, options: Object.freeze({ intensity: strength, maxDistance }) };
}

function normalizeLightmap(nodeName: string, lightmap: NativeBakedLightmapRenderData, options: AuraLightmapAttachmentOptions): AdvancedLightmapBinding {
  if (typeof nodeName !== "string" || !nodeName.trim()) throw new RangeError("lightmap target name must be nonempty");
  if (!lightmap || typeof lightmap !== "object" || !lightmap.texture || lightmap.texture.disposed
    || lightmap.texture.dimension !== "2d" || lightmap.texture.format !== "rgba32f" || lightmap.texture.colorSpace !== "linear"
    || !lightmap.texture.usage.includes("sampled") || typeof lightmap.texture.onDispose !== "function") throw new TypeError("lightmap requires a live sampled linear rgba32f 2D texture");
  if (lightmap.uvChannel !== 0 && lightmap.uvChannel !== 1) throw new RangeError("lightmap UV channel must be 0 or 1");
  if (!Number.isInteger(lightmap.gutter) || lightmap.gutter < 0 || !Number.isFinite(lightmap.texelDensity) || lightmap.texelDensity <= 0) throw new RangeError("lightmap gutter and texel density are invalid");
  if (!options || (options.composition !== "replace-diffuse" && options.composition !== "add-indirect")) throw new RangeError("lightmap composition must be replace-diffuse or add-indirect");
  const provenance = validateLightmapProvenance(lightmap, options);
  return { nodeName, lightmap: Object.freeze({ texture: lightmap.texture, uvChannel: lightmap.uvChannel, gutter: lightmap.gutter, texelDensity: lightmap.texelDensity, provenance }),
    options: Object.freeze({ composition: options.composition, intensity: intensity(options.intensity) }) };
}

function validateLightmapProvenance(lightmap: NativeBakedLightmapRenderData, options: AuraLightmapAttachmentOptions) {
  const provenance = verifyNativeBakedLightmap(lightmap);
  if (!provenance) throw new Error("LIGHTMAP_PROVENANCE_INVALID: attach an unmodified completed native bake output");
  if (options.composition === "add-indirect" && provenance.hasAuthoredLights) {
    throw new Error("LIGHTMAP_CONTAINS_AUTHORED_LIGHTS: add-indirect requires a bake without ambient or direct lights");
  }
  return provenance;
}

const states = new WeakMap<object, AdvancedLightingState>();

export function advancedLightingStateFor(owner: object): AdvancedLightingState {
  let state = states.get(owner);
  if (!state) { state = new AdvancedLightingState(); states.set(owner, state); }
  return state;
}

export function setAdvancedLightingInvalidator(owner: object, invalidator: () => void): () => void {
  return advancedLightingStateFor(owner).setInvalidator(invalidator);
}

export function installAdvancedLightingConsumer(owner: object, consumer: AdvancedLightingConsumer): () => void {
  return advancedLightingStateFor(owner).installConsumer(consumer);
}

export function advancedLightingSnapshot(owner: object): AdvancedLightingSnapshot {
  return states.get(owner)?.snapshot() ?? { lightmaps: [] };
}

export function clearAdvancedLightingScene(owner: object): void { states.get(owner)?.clearScene(); }

export function releaseAdvancedLightingState(owner: object): void {
  states.get(owner)?.dispose();
  states.delete(owner);
}
