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

export class LightUniforms {
  static readonly floatsPerLight = 24;
  static readonly vec4sPerLight = LightUniforms.floatsPerLight / 4;

  static readonly layout = new UniformLayout([
    { name: "u_lightCount", type: "float" },
    { name: "u_lightData", type: "vec4", arrayLength: MAX_DIRECT_LIGHTS * LightUniforms.vec4sPerLight }
  ]);

  static pack(lights: readonly CollectedLight[], maxLights = MAX_DIRECT_LIGHTS): PackedLightUniforms {
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
    selected.forEach(({ light }, index) => {
      const offset = index * LightUniforms.floatsPerLight;
      const forwardShadowSupported = light.castsShadow;
      data.set([light.color[0], light.color[1], light.color[2], light.intensity], offset);
      data.set([light.position[0], light.position[1], light.position[2], light.range], offset + 4);
      data.set([light.direction[0], light.direction[1], light.direction[2], kindToFloat(light.kind)], offset + 8);
      data.set([
        light.kind === "rect-area" ? light.width ?? 1 : light.spotAngle,
        light.kind === "rect-area" ? light.height ?? 1 : light.penumbra,
        forwardShadowSupported && light.kind !== "rect-area" ? 1 : 0,
        light.layerMask
      ], offset + 12);
      data.set([...(light.right ?? [1, 0, 0]), 0], offset + 16);
      data.set([...(light.up ?? [0, 1, 0]), 0], offset + 20);
    });
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
    return {
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
  }
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
    light.layerMask
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
