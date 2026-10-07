/**
 * PRD-03 Phase 5 — cinematic post presets (C-13 real data).
 *
 * §6.8: the seven `AuraPostPreset`s are plain data that expands into `output`
 * plus effect nodes. The bridge merges them under the authored scene: an
 * `output` field the app writes wins over the preset's, and an explicit effect
 * node overrides the preset's same-effect node field by field (via
 * `postAuthored`, CCR-03-3).
 *
 * Presets naming `agx` or `neutral` report `preset-capability-degraded` and
 * expand with `aces` until C-05's operator selection is real (§6.8 note).
 */

import type { AuraEffectNode } from "./nodes/types.js";
import { AuraNodeBuilder } from "./nodes/builder.js";
import type { AuraPostPreset, AuraPostPresetId } from "../contracts/post.js";
import type { AuraOutputOptions } from "../contracts/output.js";

export type { AuraPostPreset, AuraPostPresetId };

/** Preset-declared fields: `postAuthored` carries exactly the table's columns. */
function e(effect: string, fields: Record<string, unknown>): AuraNodeBuilder<AuraEffectNode> {
  return new AuraNodeBuilder<AuraEffectNode>({
    kind: "effect",
    effect,
    postAuthored: Object.keys(fields),
    ...fields
  } as unknown as AuraEffectNode);
}

/**
 * The §6.8 table. `output` columns: operator + exposure. Bloom triple is
 * threshold / knee / intensity. Grade columns map onto the §7.1 allowlisted
 * `color-grade` fields. Notes columns (god rays, DOF, MB off, emissive range)
 * land in `effects`/`emissiveStrengthRange`.
 */
function buildPrd03PostPresets(): Readonly<Record<AuraPostPresetId, AuraPostPreset>> {
  return {
  "product-studio": {
    id: "product-studio",
    output: { toneMapping: "neutral", exposure: 1.0 },
    effects: [
      e("ambient-occlusion", { radius: 0.35 })
    ],
    emissiveStrengthRange: [1, 4]
  },
  "daylight-outdoor": {
    id: "daylight-outdoor",
    output: { toneMapping: "agx", exposure: 1.0 },
    effects: [
      e("bloom", { threshold: 1.5, knee: 0.25, intensity: 0.08 }),
      e("ambient-occlusion", { radius: 0.8 }),
      e("color-grade", { contrast: 1.05, saturation: 1.05 }),
      e("vignette", { intensity: 0.15 })
    ],
    emissiveStrengthRange: [1, 6]
  },
  "neon-night": {
    id: "neon-night",
    output: { toneMapping: "aces", exposure: 1.1 },
    effects: [
      e("bloom", { threshold: 1.0, knee: 0.25, intensity: 0.35 }),
      e("ambient-occlusion", { radius: 0.5 }),
      e("color-grade", { saturation: 1.0 }),
      e("vignette", { intensity: 0.25 }),
      e("film-grain", { intensity: 0.03 }),
      e("chromatic-aberration", { intensity: 0.0015 })
    ],
    emissiveStrengthRange: [3, 8]
  },
  space: {
    id: "space",
    output: { toneMapping: "aces", exposure: 1.2 },
    effects: [
      e("bloom", { threshold: 1.2, knee: 0.2, intensity: 0.25 }),
      e("color-grade", { lift: { r: -0.01, g: -0.01, b: -0.01 } }),
      e("vignette", { intensity: 0.2 }),
      e("film-grain", { intensity: 0.02 })
    ],
    emissiveStrengthRange: [1, 6]
  },
  underwater: {
    id: "underwater",
    output: { toneMapping: "agx", exposure: 0.9 },
    effects: [
      e("bloom", { threshold: 1.0, knee: 0.3, intensity: 0.2 }),
      e("ambient-occlusion", { radius: 0.6 }),
      e("color-grade", { temperature: -15, tint: 5 }),
      e("vignette", { intensity: 0.35 }),
      e("film-grain", { intensity: 0.03 }),
      e("chromatic-aberration", { intensity: 0.002 }),
      e("volumetric-fog", {})
    ],
    emissiveStrengthRange: [1.5, 6]
  },
  "arena-fight": {
    id: "arena-fight",
    output: { toneMapping: "aces", exposure: 1.0 },
    effects: [
      e("bloom", { threshold: 1.2, knee: 0.2, intensity: 0.2 }),
      e("ambient-occlusion", { radius: 0.5 }),
      e("color-grade", { contrast: 1.1 }),
      e("vignette", { intensity: 0.2 })
      // §6.8 note: motion blur off — no motion-blur node is contributed.
    ],
    emissiveStrengthRange: [1.5, 6]
  },
  "cinematic-film": {
    id: "cinematic-film",
    output: { toneMapping: "agx", exposure: 1.0 },
    effects: [
      e("bloom", { threshold: 1.0, knee: 0.25, intensity: 0.15 }),
      e("ambient-occlusion", { radius: 0.6 }),
      e("color-grade", { contrast: 1.05 }),
      e("vignette", { intensity: 0.3 }),
      e("film-grain", { intensity: 0.06 }),
      e("chromatic-aberration", { intensity: 0.002 }),
      e("depth-of-field", {})
    ],
    emissiveStrengthRange: [1, 6]
  }
  };
}

let prd03PostPresetsTable: Readonly<Record<AuraPostPresetId, AuraPostPreset>> | undefined;

const resolvedPrd03PostPresets = () => (prd03PostPresetsTable ??= buildPrd03PostPresets());

/**
 * `effects` entries are `AuraNodeBuilder` instances, so the table cannot be
 * built at module-eval time: an importer can reach this file while
 * `nodes/builder.ts` is still mid-cycle in the leaf-graph SCC (the merge-order
 * TDZ that failed `packages/editor-runtime` tests on PR #357 CI). Deferred
 * construction keeps the same `Record`-shaped surface: `postPresets[id]` and
 * `Object.keys(postPresets)` behave identically, just built on first access.
 */
export const prd03PostPresets: Readonly<Record<AuraPostPresetId, AuraPostPreset>> = new Proxy(
  {} as Record<AuraPostPresetId, AuraPostPreset>,
  {
    get: (_target, prop) =>
      (resolvedPrd03PostPresets() as Record<PropertyKey, unknown>)[prop],
    has: (_target, prop) => prop in resolvedPrd03PostPresets(),
    ownKeys: () => Reflect.ownKeys(resolvedPrd03PostPresets()),
    getOwnPropertyDescriptor: (_target, prop) =>
      Object.getOwnPropertyDescriptor(resolvedPrd03PostPresets(), prop)
  }
);


export interface PostPresetExpansion {
  /** `preset.output` merged under the authored `output` (authored wins per field). */
  readonly output: AuraOutputOptions | undefined;
  /**
   * Effect-node list with preset content merged in: an authored node keeps its
   * position in scene order and picks up preset-declared fields only where it
   * did not author them; preset-only effects append in preset order.
   */
  readonly nodes: readonly AuraEffectNode[];
  /** The preset that expanded (undefined when `output.preset` was absent). */
  readonly preset: AuraPostPreset | undefined;
}

const SHARED_NODE_KEYS = new Set(["kind", "effect", "postAuthored"]);

function authoredKeysOf(node: AuraEffectNode): readonly string[] {
  return node.postAuthored ?? Object.keys(node).filter((key) => !SHARED_NODE_KEYS.has(key));
}

function presetFieldsOf(node: AuraEffectNode): readonly string[] {
  return (node.postAuthored ?? Object.keys(node)).filter((key) => !SHARED_NODE_KEYS.has(key));
}

/**
 * §6.8/`output.preset` expansion. Deterministic: authored node order is
 * preserved; preset-only nodes append in preset order; merged node field order
 * is authored-then-preset.
 */
export function expandPostPreset(
  output: AuraOutputOptions | undefined,
  nodes: readonly AuraEffectNode[]
): PostPresetExpansion {
  const id = output?.preset;
  const preset = id ? prd03PostPresets[id] : undefined;
  if (!preset) return { output, nodes, preset: undefined };

  const presetNodes = preset.effects.map((builder) => builder.toJSON());
  const used = new Set<AuraEffectNode>();
  const merged: AuraEffectNode[] = nodes.map((authored) => {
    const from = presetNodes.find((candidate) => candidate.effect === authored.effect && !used.has(candidate));
    if (!from) return authored;
    used.add(from);
    const authoredKeys = new Set(authoredKeysOf(authored));
    const presetOnly = presetFieldsOf(from).filter((key) => !authoredKeys.has(key));
    const mergedNode: Record<string, unknown> = { ...(from as unknown as Record<string, unknown>), ...(authored as unknown as Record<string, unknown>) };
    for (const key of presetOnly) mergedNode[key] = (from as unknown as Record<string, unknown>)[key];
    mergedNode.postAuthored = [...authoredKeysOf(authored), ...presetOnly];
    return mergedNode as unknown as AuraEffectNode;
  });
  for (const node of presetNodes) if (!used.has(node)) merged.push(node);

  // §6.8: presets naming agx/neutral render aces with a capability-degraded
  // report until C-05's operator selection is real. An authored
  // `output.toneMapping` wins untouched — the degrade is preset-declared only.
  const mergedOutput: AuraOutputOptions = { ...preset.output, ...output,
    ...(output?.toneMapping === undefined && (preset.output.toneMapping === "agx" || preset.output.toneMapping === "neutral")
      ? { toneMapping: "aces" as const } : {}) };
  return { output: mergedOutput, nodes: merged, preset };
}

/** True when the preset's declared operator degrades to aces (C-05 stub). */
export function presetCapabilityDegraded(preset: AuraPostPreset, authoredOperator: string | undefined): boolean {
  return authoredOperator === undefined && (preset.output.toneMapping === "agx" || preset.output.toneMapping === "neutral");
}
