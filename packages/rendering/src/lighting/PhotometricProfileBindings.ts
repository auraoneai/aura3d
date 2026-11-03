import type { CollectedLight, CollectedPhotometricProfile } from "../LightCollector";
import { LightUniforms, MAX_DIRECT_LIGHTS, type PackedLightsWithSelection } from "../LightUniforms";
import { TextureBinding } from "../TextureBinding";
import { PhotometricProfileAtlas, type PhotometricProfileAtlasInput, type PhotometricProfileAtlasOptions, type PhotometricProfileTable } from "./PhotometricProfileAtlas";

export type PhotometricProfileUnsupportedReason =
  | "clustered"
  | "light-capacity"
  | "stale-selection"
  | "visibility-unavailable"
  | "invalid-profile"
  | "unsupported-light";

export interface PhotometricProfileBindingsOptions {
  /** Clustered light indices use a different index space and are not yet admitted. */
  readonly clustered?: boolean;
  /** Device dimensions and reservation limits for this owned atlas. */
  readonly atlas?: PhotometricProfileAtlasOptions;
}

/**
 * A caller-owned, frame-scoped profile resource. The caller must retain this
 * packet until its draws are submitted and dispose it only through the owning
 * renderer's completion/loss lifecycle.
 *
 * Both arrays contain MAX_DIRECT_LIGHTS vec4 rows. Offsets are
 * [verticalOffset, horizontalOffset, candelaOffset, verticalCount]; metadata
 * are [horizontalCount, symmetry, effectiveScale, rotationRadians]. A scalar
 * light has an all-zero pair. A hidden/zero-dimmed measured light retains
 * positive counts and a zero effective scale.
 */
export interface PhotometricProfileBindings {
  readonly status: "ready";
  readonly atlas: PhotometricProfileAtlas;
  readonly binding: TextureBinding;
  readonly offsets: Float32Array;
  readonly meta: Float32Array;
  /** O(light count + profile samples + atlas texels); use at binding boundaries. */
  isCurrent(): boolean;
  dispose(): void;
}

export type PhotometricProfileBindingsResult = PhotometricProfileBindings
  | { readonly status: "not-required" }
  | { readonly status: "unsupported"; readonly reason: PhotometricProfileUnsupportedReason; readonly detail: string };

type CapturedProfile = {
  readonly light: CollectedLight;
  readonly modulation: CollectedPhotometricProfile;
  readonly table: PhotometricProfileTable;
  readonly verticalRef: readonly number[];
  readonly horizontalRef: readonly number[];
  readonly candelaRef: readonly number[];
  readonly vertical: readonly number[];
  readonly horizontal: readonly number[];
  readonly candela: readonly number[];
  readonly format: PhotometricProfileTable["format"];
  readonly photometricType: PhotometricProfileTable["photometricType"];
  readonly symmetry: PhotometricProfileTable["symmetry"];
  readonly scale: number | undefined;
  readonly rotation: number | undefined;
  readonly visible: boolean;
  readonly dimmer: number;
};

const unsupported = (reason: PhotometricProfileUnsupportedReason, detail: string): PhotometricProfileBindingsResult =>
  ({ status: "unsupported", reason, detail });

function sameNumbers(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function finiteFloat(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative finite float32 value`);
  }
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || (value > 0 && rounded === 0)) {
    throw new RangeError(`${label} must be a nonnegative finite float32 value`);
  }
  return rounded === 0 ? 0 : rounded;
}

function exactFloatInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || Math.fround(value) !== value) {
    throw new RangeError("Photometric atlas offsets and counts must be exact float32 integers");
  }
  return value;
}

function validProfiledLight(light: CollectedLight): boolean {
  if (light.kind !== "point" && light.kind !== "spot") return false;
  if (!light.position || !light.direction || !light.color ||
      light.position.length !== 3 || light.direction.length !== 3 || light.color.length !== 3) return false;
  if (![...light.position, ...light.direction, ...light.color].every((value) =>
    typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value)))) return false;
  return light.direction.some((component) => Math.fround(component) !== 0);
}

function captureProfile(light: CollectedLight): CapturedProfile | null {
  const modulation = light.photometricProfile;
  if (modulation === undefined) return null;
  if (!modulation || typeof modulation !== "object") throw new TypeError("Photometric profile is unavailable");
  if (typeof light.photometricVisible !== "boolean") throw new TypeError("Photometric effective visibility is unavailable");
  const table = modulation.profile;
  if (!table || !table.verticalAngles || !table.horizontalAngles || !table.candela) throw new TypeError("Photometric profile table is unavailable");
  const dimmer = light.photometricDimmer === undefined ? 1 : light.photometricDimmer;
  finiteFloat(dimmer, "Photometric dimmer");
  return {
    light, modulation, table,
    verticalRef: table.verticalAngles, horizontalRef: table.horizontalAngles, candelaRef: table.candela,
    vertical: Array.from(table.verticalAngles), horizontal: Array.from(table.horizontalAngles), candela: Array.from(table.candela),
    format: table.format, photometricType: table.photometricType, symmetry: table.symmetry,
    scale: modulation.scale, rotation: modulation.rotation, visible: light.photometricVisible, dimmer
  };
}

function profileStillCurrent(captured: CapturedProfile): boolean {
  const { light, modulation, table } = captured;
  return light.photometricProfile === modulation && modulation.profile === table &&
    table.verticalAngles === captured.verticalRef && table.horizontalAngles === captured.horizontalRef && table.candela === captured.candelaRef &&
    table.format === captured.format && table.photometricType === captured.photometricType && table.symmetry === captured.symmetry &&
    Object.is(modulation.scale, captured.scale) && Object.is(modulation.rotation, captured.rotation) &&
    light.photometricVisible === captured.visible && Object.is(light.photometricDimmer === undefined ? 1 : light.photometricDimmer, captured.dimmer) &&
    sameNumbers(table.verticalAngles, captured.vertical) && sameNumbers(table.horizontalAngles, captured.horizontal) && sameNumbers(table.candela, captured.candela);
}

function selectionMatches(lights: readonly CollectedLight[], selection: PackedLightsWithSelection): boolean {
  if (!Array.isArray(lights) || !selection || !selection.packed || !Array.isArray(selection.selected) || !Array.isArray(selection.inputLights) ||
      selection.inputLights.length !== lights.length || selection.selected.length !== lights.length ||
      selection.packed.lightCount !== lights.length || selection.packed.layout !== LightUniforms.layout ||
      !(selection.packed.data instanceof Float32Array)) return false;
  for (let i = 0; i < lights.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(lights, i) || selection.inputLights[i] !== lights[i] ||
        selection.selected[i]?.inputIndex !== i || selection.selected[i]?.light !== lights[i]) return false;
  }
  const fresh = LightUniforms.pack(lights, selection.packed.diagnostics.requestedMaxLights);
  if (fresh.lightCount !== selection.packed.lightCount || !sameNumbers(fresh.data, selection.packed.data)) return false;
  // A light getter can synchronously mutate the caller's array during packing.
  return selection.inputLights.length === lights.length && selection.inputLights.every((light, index) => lights[index] === light);
}

/**
 * Build profile metadata for the same direct-light packet that will be bound.
 * The caller must pass the exact light array and one `packWithSelection`
 * result. Clustered lights and profiled lists above the direct-light capacity
 * are rejected: their ordering/ranking needs a separate profile-aware path.
 */
export function buildPhotometricProfileBindings(
  lights: readonly CollectedLight[],
  selection: PackedLightsWithSelection,
  options: PhotometricProfileBindingsOptions = {}
): PhotometricProfileBindingsResult {
  let atlas: PhotometricProfileAtlas | undefined;
  try {
    const hasProfiles = lights.some((light) => light?.photometricProfile !== undefined);
    if (!hasProfiles) return { status: "not-required" };
    if (options.clustered) return unsupported("clustered", "Clustered profile indexing is not implemented");
    const maxLights = selection?.packed?.diagnostics?.maxLights;
    if (!Number.isInteger(maxLights) || maxLights! < 1 || maxLights! > MAX_DIRECT_LIGHTS) {
      return unsupported("stale-selection", "Direct-light selection capacity is invalid");
    }
    if (lights.length > maxLights!) return unsupported("light-capacity", "Profiled lights exceed the direct-light capacity");
    if (!selectionMatches(lights, selection)) return unsupported("stale-selection", "Direct-light selection no longer matches its source");

    const captures: CapturedProfile[] = [];
    const inputs: PhotometricProfileAtlasInput[] = [];
    for (let slot = 0; slot < lights.length; slot += 1) {
      const light = selection.selected[slot]!.light;
      if (light.photometricProfile === undefined) continue;
      if (!validProfiledLight(light)) return unsupported("unsupported-light", "Photometric profiles require a finite, directed point or spot light");
      if (typeof light.photometricVisible !== "boolean") return unsupported("visibility-unavailable", "Effective profile visibility is unavailable");
      const captured = captureProfile(light)!;
      captures.push(captured);
      inputs.push({ id: `slot-${slot}`, profile: captured.table, scale: captured.scale, rotation: captured.rotation });
    }
    atlas = new PhotometricProfileAtlas(inputs, options.atlas);
    const offsets = new Float32Array(MAX_DIRECT_LIGHTS * 4);
    const meta = new Float32Array(MAX_DIRECT_LIGHTS * 4);
    for (const entry of atlas.entries) {
      const slot = Number(entry.id.slice(5));
      const captured = captures.find((candidate) => candidate.light === selection.selected[slot]!.light && candidate.modulation === selection.selected[slot]!.light.photometricProfile)!;
      const dimmer = finiteFloat(captured.dimmer, "Photometric dimmer");
      const effectiveScale = captured.visible ? finiteFloat(entry.scale * dimmer, "Photometric effective scale") : 0;
      for (const value of captured.candela) {
        const sample = Math.fround(value);
        const scaled = Math.fround(sample * effectiveScale);
        if (!Number.isFinite(scaled) || (sample > 0 && effectiveScale > 0 && scaled === 0)) {
          throw new RangeError("Photometric effective candela is outside the supported float32 range");
        }
      }
      const base = slot * 4;
      offsets.set([exactFloatInteger(entry.verticalOffset), exactFloatInteger(entry.horizontalOffset), exactFloatInteger(entry.candelaOffset), exactFloatInteger(entry.verticalCount)], base);
      meta.set([exactFloatInteger(entry.horizontalCount), exactFloatInteger(entry.symmetryCode), effectiveScale, entry.rotation], base);
    }
    const binding = new TextureBinding({ name: "u_a3dPhotometricAtlas", texture: atlas.texture, sampler: atlas.sampler, required: true, expectedColorSpace: "linear", expectedDimension: "2d" });
    const offsetSnapshot = offsets.slice();
    const metaSnapshot = meta.slice();
    const packedSnapshot = selection.packed.data.slice();
    const ownAtlas = atlas;
    let disposed = false;
    const packet: PhotometricProfileBindings = {
      status: "ready", atlas: ownAtlas, binding, offsets, meta,
      isCurrent(): boolean {
        if (disposed) return false;
        try {
          return selectionMatches(lights, selection) && sameNumbers(selection.packed.data, packedSnapshot) &&
            lights.every((light) => light.photometricProfile === undefined || captures.some((capture) => capture.light === light && profileStillCurrent(capture))) &&
            captures.every(profileStillCurrent) && sameNumbers(offsets, offsetSnapshot) && sameNumbers(meta, metaSnapshot) &&
            binding.texture === ownAtlas.texture && binding.sampler === ownAtlas.sampler && binding.name === "u_a3dPhotometricAtlas" &&
            binding.required && binding.ready && binding.expectedColorSpace === "linear" && binding.expectedDimension === "2d" &&
            sameNumbers(binding.offset, [0, 0]) && sameNumbers(binding.scale, [1, 1]) && binding.rotation === 0 &&
            binding.validate().ok && ownAtlas.isCurrent();
        } catch {
          return false;
        }
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        ownAtlas.dispose();
      }
    };
    if (!packet.isCurrent()) {
      packet.dispose();
      return unsupported("stale-selection", "Photometric inputs changed while the packet was constructed");
    }
    return Object.freeze(packet);
  } catch (error) {
    atlas?.dispose();
    return unsupported("invalid-profile", error instanceof Error ? error.message : "Invalid photometric profile");
  }
}
