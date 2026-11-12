import { type CollectedLight } from "./LightCollector";
import { UniformLayout } from "./UniformLayout";

export const MAX_DIRECT_LIGHTS = 16;

export type DirectLightSelectionStrategy = "intensity-times-relative-luminance";
export type DirectLightSelectionOrder = "input" | "contribution-descending";

export interface DirectLightSelectionEntry {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly kind: CollectedLight["kind"];
  readonly contribution: number;
}

export interface DirectLightSelectionDiagnostics {
  readonly source: "LightUniforms.pack";
  readonly strategy: DirectLightSelectionStrategy;
  readonly order: DirectLightSelectionOrder;
  readonly requestedMaxLights: number;
  readonly maxLights: number;
  readonly capacityClamped: boolean;
  readonly requestedCount: number;
  readonly selectedCount: number;
  readonly droppedCount: number;
  readonly degraded: boolean;
  readonly selected: readonly DirectLightSelectionEntry[];
  readonly dropped: readonly DirectLightSelectionEntry[];
  readonly message: string;
}

export interface PackedLightUniforms {
  readonly lightCount: number;
  readonly data: Float32Array;
  readonly layout: UniformLayout;
  readonly diagnostics: DirectLightSelectionDiagnostics;
}

/** The exact input occurrence assigned to a packed direct-light slot. */
export interface SelectedDirectLight {
  readonly light: CollectedLight;
  readonly inputIndex: number;
}

/** Selection and packed uniforms produced by the same packing pass. */
export interface PackedLightsWithSelection {
  readonly packed: PackedLightUniforms;
  readonly selected: readonly SelectedDirectLight[];
  /** A frozen occurrence snapshot; input light objects themselves are not frozen. */
  readonly inputLights: readonly CollectedLight[];
}

const EMPTY_SELECTED_LIGHTS: readonly SelectedDirectLight[] = Object.freeze([]);
const EMPTY_INPUT_LIGHTS: readonly CollectedLight[] = Object.freeze([]);

/**
 * GU47 eint (E-B handoff EB-3): a collected light as the forward pass packs it on a PRD-02 bridge frame
 * (`forwardShadedLights`). `localShadowSlot` is the first PRD-02 atlas tile of a shadowed spot / point light.
 */
export interface LocalShadowedLight extends CollectedLight {
  readonly localShadowSlot?: number;
}

/**
 * The value packed into the otherwise unused `right.w` (`u_lightData[i * 6 + 4].w`): the light's first local
 * shadow tile + 1, or 0 when it has none (every light outside a bridge frame), so existing data is unchanged.
 */
export function packedLocalShadowSlot(light: CollectedLight): number {
  const slot = (light as LocalShadowedLight).localShadowSlot;
  return slot !== undefined && Number.isInteger(slot) && slot >= 0 ? slot + 1 : 0;
}

export class LightUniforms {
  static readonly floatsPerLight = 24;
  static readonly vec4sPerLight = LightUniforms.floatsPerLight / 4;

  static readonly layout = new UniformLayout([
    { name: "u_lightCount", type: "float" },
    { name: "u_lightData", type: "vec4", arrayLength: MAX_DIRECT_LIGHTS * LightUniforms.vec4sPerLight }
  ]);

  static pack(lights: readonly CollectedLight[], maxLights = MAX_DIRECT_LIGHTS): PackedLightUniforms {
    return LightUniforms.packInternal(lights, maxLights, false).packed;
  }

  /** Pack uniforms and retain their exact input-to-slot mapping. */
  static packWithSelection(lights: readonly CollectedLight[], maxLights = MAX_DIRECT_LIGHTS): PackedLightsWithSelection {
    for (let i = 0; i < lights.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(lights, i)) throw new TypeError("Light selection does not accept sparse input arrays");
    }
    // Selection, uniform bytes and the occurrence snapshot must use the same
    // array even if a caller-owned light getter mutates the original array.
    return LightUniforms.packInternal([...lights], maxLights, true);
  }

  private static packInternal(lights: readonly CollectedLight[], maxLights: number, retainSelection: boolean): PackedLightsWithSelection {
    if (!Number.isInteger(maxLights) || maxLights <= 0) {
      throw new RangeError("maxLights must be a positive integer");
    }
    const effectiveMaxLights = Math.min(maxLights, MAX_DIRECT_LIGHTS);
    const evaluated = evaluateLights(lights);
    const order: DirectLightSelectionOrder = lights.length > effectiveMaxLights
      ? "contribution-descending"
      : "input";
    const ordered = order === "contribution-descending"
      ? rankLightsByContribution(evaluated)
      : evaluated;
    const selected = ordered.slice(0, effectiveMaxLights);
    const dropped = ordered.slice(effectiveMaxLights);
    const data = new Float32Array(MAX_DIRECT_LIGHTS * LightUniforms.floatsPerLight);
    for (let index = 0; index < selected.length; index += 1) {
      const light = selected[index]!.light;
      const offset = index * LightUniforms.floatsPerLight;
      const forwardShadowSupported = light.castsShadow;
      data[offset] = light.color[0];
      data[offset + 1] = light.color[1];
      data[offset + 2] = light.color[2];
      data[offset + 3] = light.intensity;
      data[offset + 4] = light.position[0];
      data[offset + 5] = light.position[1];
      data[offset + 6] = light.position[2];
      data[offset + 7] = light.range;
      data[offset + 8] = light.direction[0];
      data[offset + 9] = light.direction[1];
      data[offset + 10] = light.direction[2];
      data[offset + 11] = kindToFloat(light.kind);
      data[offset + 12] = light.kind === "rect-area" ? light.width ?? 1 : light.spotAngle;
      data[offset + 13] = light.kind === "rect-area" ? light.height ?? 1 : light.penumbra;
      data[offset + 14] = forwardShadowSupported && light.kind !== "rect-area" ? 1 : 0;
      data[offset + 15] = light.layerMask;
      const right = light.right;
      data[offset + 16] = right ? right[0] : 1;
      data[offset + 17] = right ? right[1] : 0;
      data[offset + 18] = right ? right[2] : 0;
      data[offset + 19] = packedLocalShadowSlot(light);
      // up.w is unused by the legacy layout. Keep one light slot for both
      // faces (or both legacy proxy cones), rather than spending two slots.
      const up = light.up;
      data[offset + 20] = up ? up[0] : 0;
      data[offset + 21] = up ? up[1] : 1;
      data[offset + 22] = up ? up[2] : 0;
      data[offset + 23] = light.twoSided === true ? 1 : 0;
    }
    const selectedEntries = selected.map(selectionEntry);
    const droppedEntries = dropped.map(selectionEntry);
    const droppedCount = droppedEntries.length;
    const degraded = droppedCount > 0;
    const capacityClamped = maxLights > effectiveMaxLights;
    const selectedNames = selectedEntries.map((entry) => entry.sourceName).join(", ");
    const capacityMessage = capacityClamped
      ? ` Requested capacity ${maxLights} was clamped to the interim limit ${effectiveMaxLights}.`
      : "";
    const message = (
      degraded
        ? `Direct-light limit applied: selected ${selectedEntries.length} of ${lights.length} by ${DIRECT_LIGHT_SELECTION_STRATEGY}, dropped ${droppedCount}. Selected: ${selectedNames}.`
        : `Direct-light selection kept all ${selectedEntries.length} requested lights in input order; dropped 0. Contribution scores use ${DIRECT_LIGHT_SELECTION_STRATEGY}. Selected: ${selectedNames || "none"}.`
    ) + capacityMessage;
    const packed: PackedLightUniforms = {
      lightCount: selected.length,
      data,
      layout: LightUniforms.layout,
      diagnostics: {
        source: "LightUniforms.pack",
        strategy: DIRECT_LIGHT_SELECTION_STRATEGY,
        order,
        requestedMaxLights: maxLights,
        maxLights: effectiveMaxLights,
        capacityClamped,
        requestedCount: lights.length,
        selectedCount: selectedEntries.length,
        droppedCount,
        degraded,
        selected: selectedEntries,
        dropped: droppedEntries,
        message
      }
    };
    return {
      packed,
      selected: retainSelection ? Object.freeze(selected.map(({ light, inputIndex }) => Object.freeze({ light, inputIndex }))) : EMPTY_SELECTED_LIGHTS,
      inputLights: retainSelection ? Object.freeze([...lights]) : EMPTY_INPUT_LIGHTS
    };
  }
}

/**
 * PRD-02 §6.3/§8 — `AuraLights` std140 packer (u_lightData, 32 lights × 6
 * vec4 = 3KB). Physical units: point/spot candela, directional lux; the
 * shader applies range-window + inverse-power decay (chunk
 * `a3d_prd02_lighting_punctual`). Per-light layout is frozen by the chunk:
 *   [0] position.xyz, w = kind (0 dir, 1 point, 2 spot, 3 rect)
 *   [1] direction.xyz, w = range (0 = infinite)
 *   [2] color.rgb,        w = intensity
 *   [3] spot: cosOuter, cosInner, decay, shadowIndex; rect: x = twoSided
 *   [4] rect: right.xyz, width   (else 0)
 *   [5] rect: up.xyz,    height  (else 0)
 */
export interface AuraLightData {
  readonly kind: "directional" | "point" | "spot" | "rect-area";
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly range: number;
  readonly spotAngle: number;
  readonly penumbra: number;
  readonly decay: number;
  readonly twoSided?: boolean;
  /** Index into the shadow map array (-1/undefined = unshadowed). */
  readonly shadowIndex?: number;
  readonly right?: readonly [number, number, number];
  readonly up?: readonly [number, number, number];
  readonly width?: number;
  readonly height?: number;
  readonly name?: string;
}

export const AURA_LIGHTS_MAX = 32;
export const AURA_LIGHTS_VEC4_PER_LIGHT = 6;

export interface AuraLightsPacked {
  /** AURA_LIGHTS_MAX × 6 vec4 floats; lights past capacity are dropped. */
  readonly data: Float32Array;
  readonly lightCount: number;
  /** Lights considered this frame (C-28 prd02.lightsEvaluated). */
  readonly lightsEvaluated: number;
  /** Lights dropped by the 32-light cap (C-28 prd02.lightsDroppedByCap). */
  readonly lightsDroppedByCap: number;
  readonly droppedNames: readonly string[];
}

function auraLightKind(k: AuraLightData["kind"]): number {
  return k === "directional" ? 0 : k === "point" ? 1 : k === "spot" ? 2 : 3;
}

export function packAuraLightsStd140(lights: readonly AuraLightData[]): AuraLightsPacked {
  const capacity = AURA_LIGHTS_MAX;
  const selected = lights.slice(0, capacity);
  const dropped = lights.slice(capacity);
  const data = new Float32Array(capacity * AURA_LIGHTS_VEC4_PER_LIGHT * 4);
  for (const [index, light] of selected.entries()) {
    const base = index * AURA_LIGHTS_VEC4_PER_LIGHT * 4;
    data[base] = light.position[0]; data[base + 1] = light.position[1]; data[base + 2] = light.position[2];
    data[base + 3] = auraLightKind(light.kind);
    data[base + 4] = light.direction[0]; data[base + 5] = light.direction[1]; data[base + 6] = light.direction[2];
    data[base + 7] = light.range;
    data[base + 8] = light.color[0]; data[base + 9] = light.color[1]; data[base + 10] = light.color[2];
    data[base + 11] = light.intensity;
    const halfOuter = light.spotAngle / 2;
    const halfInner = halfOuter * Math.max(0, 1 - Math.min(1, light.penumbra));
    data[base + 12] = light.kind === "spot" ? Math.cos(halfOuter) : light.kind === "rect-area" && light.twoSided === true ? 1 : 0;
    data[base + 13] = light.kind === "spot" ? Math.cos(halfInner) : 0;
    data[base + 14] = light.decay;
    data[base + 15] = light.shadowIndex ?? -1;
    const right = light.kind === "rect-area" ? light.right ?? [1, 0, 0] : [0, 0, 0];
    const up = light.kind === "rect-area" ? light.up ?? [0, 1, 0] : [0, 0, 0];
    data[base + 16] = right[0]; data[base + 17] = right[1]; data[base + 18] = right[2];
    data[base + 19] = light.kind === "rect-area" ? light.width ?? 1 : 0;
    data[base + 20] = up[0]; data[base + 21] = up[1]; data[base + 22] = up[2];
    data[base + 23] = light.kind === "rect-area" ? light.height ?? 1 : 0;
  }
  return {
    data,
    lightCount: selected.length,
    lightsEvaluated: lights.length,
    lightsDroppedByCap: dropped.length,
    droppedNames: dropped.map((l, i) => l.name ?? `light-${capacity + i}`)
  };
}

/** Ambient irradiance → exit radiance (energy-conserving 1/π, PRD-02 §6.3). */
export function ambientToExitRadiance(
  color: readonly [number, number, number],
  intensity: number
): [number, number, number] {
  const k = Math.max(0, intensity) / Math.PI;
  return [color[0] * k, color[1] * k, color[2] * k];
}

interface RankedLight {
  readonly light: CollectedLight;
  readonly inputIndex: number;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly stableKey: string;
  readonly contribution: number;
}

const DIRECT_LIGHT_SELECTION_STRATEGY = "intensity-times-relative-luminance" as const;
const RELATIVE_LUMINANCE_RED = 0.2126;
const RELATIVE_LUMINANCE_GREEN = 0.7152;
const RELATIVE_LUMINANCE_BLUE = 0.0722;

function evaluateLights(lights: readonly CollectedLight[]): readonly RankedLight[] {
  return lights
    .map((light, inputIndex): RankedLight => ({
      light,
      inputIndex,
      sourceId: lightSourceId(light),
      sourceName: lightSourceName(light),
      stableKey: stableLightKey(light),
      contribution: estimateLightContribution(light)
    }));
}

function rankLightsByContribution(lights: readonly RankedLight[]): readonly RankedLight[] {
  return [...lights].sort((left, right) => {
      const contributionOrder = right.contribution - left.contribution;
      if (contributionOrder !== 0) return contributionOrder;
      const sourceNameOrder = compareText(left.sourceName, right.sourceName);
      if (sourceNameOrder !== 0) return sourceNameOrder;
      const sourceIdOrder = compareText(left.sourceId, right.sourceId);
      if (sourceIdOrder !== 0) return sourceIdOrder;
      const stableKeyOrder = compareText(left.stableKey, right.stableKey);
      if (stableKeyOrder !== 0) return stableKeyOrder;
      return left.inputIndex - right.inputIndex;
  });
}

// Packing has no receiver, camera, or scene-bounds context, so emitted linear-RGB
// luminance is the strongest deterministic contribution estimate available here.
// Per-fragment range, cone, and distance attenuation remains shader-owned.
function estimateLightContribution(light: CollectedLight): number {
  const luminance = (
    finiteNonNegative(light.color[0]) * RELATIVE_LUMINANCE_RED
    + finiteNonNegative(light.color[1]) * RELATIVE_LUMINANCE_GREEN
    + finiteNonNegative(light.color[2]) * RELATIVE_LUMINANCE_BLUE
  );
  const contribution = finiteNonNegative(light.intensity) * luminance;
  return Number.isFinite(contribution) ? contribution : Number.MAX_VALUE;
}

function selectionEntry(light: RankedLight): DirectLightSelectionEntry {
  return {
    sourceId: light.sourceId,
    sourceName: light.sourceName,
    kind: light.light.kind,
    contribution: light.contribution
  };
}

function lightSourceId(light: CollectedLight): string {
  const id = light.source.id.trim();
  return id || `anonymous-${light.kind}`;
}

function lightSourceName(light: CollectedLight): string {
  const name = light.source.name.trim();
  return name || lightSourceId(light);
}

function stableLightKey(light: CollectedLight): string {
  return [
    light.kind,
    light.color,
    light.intensity,
    light.position,
    light.direction,
    light.right,
    light.up,
    light.range,
    light.width,
    light.height,
    light.spotAngle,
    light.penumbra,
    light.castsShadow ? 1 : 0,
    light.layerMask,
    light.twoSided === true ? 1 : 0
  ].join("|");
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function kindToFloat(kind: CollectedLight["kind"]): number {
  switch (kind) {
    case "directional":
      return 0;
    case "point":
      return 1;
    case "spot":
      return 2;
    case "rect-area":
      return 3;
  }
}

/** C-31 sink: counters of the most recent pack (null until the flag path runs). */
let auraLightsLastCounters: { lightsEvaluated: number; lightsDroppedByCap: number } | null = null;
/** C-31 §4.2 per-light rows of the most recent pack (one per evaluated light). */
let auraLightsLastLights: readonly AuraLightSummary[] | null = null;

/** §4.2 `collectedLights` row: kind, intensity, range, caster flag (+name when set). */
export interface AuraLightSummary {
  readonly kind: AuraLightData["kind"];
  readonly name?: string;
  readonly intensity: number;
  readonly range: number;
  readonly castsShadow: boolean;
}

/** Read the counters reported by the last `packAuraLightsStd140` call (C-31 `prd02.lighting` section). */
export function auraLightsCounters(): { lightsEvaluated: number; lightsDroppedByCap: number } | null {
  return auraLightsLastCounters;
}

/**
 * T0-27: the forward pass (flag on) records its real capacity counters here so
 * C-31 `lightsDroppedByCap` reflects the uniform/cluster path actually drawn.
 */
export function recordAuraLightsCounters(counters: { lightsEvaluated: number; lightsDroppedByCap: number }): void {
  auraLightsLastCounters = { lightsEvaluated: counters.lightsEvaluated, lightsDroppedByCap: counters.lightsDroppedByCap };
}

/** Read the per-light rows reported by the last `packAuraLightsStd140` call (C-31 §4.2). */
export function auraLightsLastFrame(): readonly AuraLightSummary[] | null {
  return auraLightsLastLights;
}

/**
 * Chunk-facing AuraLights uniform block (PRD-02 §6.3/§8.1): packs the lights
 * and returns `{u_lightData, u_prd02LightCount}` matching the
 * `a3d_prd02_lighting_punctual` chunk declarations. Side effect: records
 * `lightsEvaluated`/`lightsDroppedByCap` into the C-31 sink.
 */
export function auraLightsUniformBlock(
  lights: readonly AuraLightData[]
): { uniforms: Record<string, unknown>; lightCount: number } {
  const packed = packAuraLightsStd140(lights);
  auraLightsLastCounters = {
    lightsEvaluated: packed.lightsEvaluated,
    lightsDroppedByCap: packed.lightsDroppedByCap
  };
  auraLightsLastLights = lights.map((light) => ({
    kind: light.kind,
    ...(light.name !== undefined ? { name: light.name } : {}),
    intensity: light.intensity,
    range: light.range,
    castsShadow: light.shadowIndex !== undefined && light.shadowIndex >= 0
  }));
  return {
    uniforms: {
      u_lightData: packed.data,
      u_prd02LightCount: packed.lightCount
    },
    lightCount: packed.lightCount
  };
}
