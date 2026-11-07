// Beat-three.js WP-S.1 (decision 5): a builder never accepts an option and silently drops it.
//
// Builders run at module scope with no app or compile context, and an existing app that passes a stray key must
// keep building, so the guard does not throw. It records the unread keys on the node (`ignoredOptions`); the
// compiler turns each note into an `option-ignored` degradation (compileScene.ts), which lands in
// `app.diagnostics()` and throws only under strict mode, the same channel unknown node kinds already use.

import type { AuraMaterialSpec, AuraSceneNode } from "./types.js";

/** Keys of `options` that are set (not `undefined`) and not in `valid`. */
export function unreadOptionKeys(options: unknown, valid: readonly string[]): readonly string[] {
  if (options === undefined || options === null || typeof options !== "object" || Array.isArray(options)) return [];
  return Object.keys(options).filter((key) => !valid.includes(key) && (options as Record<string, unknown>)[key] !== undefined);
}

/**
 * E3-06 (guessable API): three.js option names that Aura3D spells differently. Each entry lists the Aura3D names
 * that replace the three.js one, in preference order; `suggestOption` picks the first that the builder reads.
 * The names a builder accepts as an alias never reach this table (they are read, not ignored).
 */
export const THREE_OPTION_HINTS: Readonly<Record<string, readonly string[]>> = {
  castShadow: ["shadow"],
  receiveShadow: ["receiveShadow"],
  metalness: ["metallic"],
  map: ["texture"],
  normalMap: ["normal"],
  aoMap: ["occlusionMap"],
  side: ["doubleSided"],
  fogDensity: ["density"],
  fieldOfView: ["fov"],
  lookat: ["lookAt"],
  colour: ["color"]
};

/** Optimal-string-alignment distance (Levenshtein plus adjacent transposition); option names are short. */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array<number>(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0]![j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[x.length]![y.length]!;
}

/** The valid option that `key` most likely meant: a documented three.js alias first, else the nearest spelling. */
export function suggestOption(key: string, valid: readonly string[]): string | undefined {
  const hinted = THREE_OPTION_HINTS[key]?.find((name) => valid.includes(name));
  if (hinted !== undefined) return hinted;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of valid) {
    const d = editDistance(key, candidate);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(Math.min(key.length, best.length) / 3)) ? best : undefined;
}

export function formatIgnoredOptions(builder: string, unread: readonly string[], valid: readonly string[]): string {
  const didYouMean = unread
    .map((key) => ({ key, suggestion: suggestOption(key, valid) }))
    .filter((entry): entry is { key: string; suggestion: string } => entry.suggestion !== undefined)
    .map((entry) => `"${entry.key}" -> "${entry.suggestion}"`);
  return `OPTION_IGNORED ${builder}: option${unread.length === 1 ? "" : "s"} ${unread.map((key) => `"${key}"`).join(", ")} ` +
    `${unread.length === 1 ? "is" : "are"} not read by this builder, so ${unread.length === 1 ? "it has" : "they have"} no effect. ` +
    `Valid options: ${valid.join(", ")}` +
    (didYouMean.length > 0 ? `. Did you mean ${didYouMean.join(", ")}?` : "");
}

/** `{}` when every key is read, else `{ ignoredOptions: [message] }`; spread it into the node literal. */
export function ignoredOptionsNote(builder: string, options: unknown, valid: readonly string[]): { readonly ignoredOptions?: readonly string[] } {
  const unread = unreadOptionKeys(options, valid);
  return unread.length === 0 ? {} : { ignoredOptions: [formatIgnoredOptions(builder, unread, valid)] };
}

/** Every `OPTION_IGNORED` note carried by `nodes`, with the node that carries it. */
export function ignoredOptionMessages(nodes: readonly AuraSceneNode[]): readonly { readonly node: AuraSceneNode; readonly message: string }[] {
  const found: { node: AuraSceneNode; message: string }[] = [];
  for (const node of nodes) {
    const notes = (node as { readonly ignoredOptions?: readonly string[] }).ignoredOptions;
    if (notes) for (const message of notes) found.push({ node, message });
    // S5-WP19-04: options a builder records but the runtime does not apply (`instances.model`).
    const unapplied = (node as { readonly unappliedOptions?: readonly string[] }).unappliedOptions;
    if (unapplied) for (const message of unapplied) found.push({ node, message });
  }
  return found;
}

/**
 * S5-WP19-04: `AuraMaterialSpec` fields the `material.pbr` / `material.metal` surface never
 * renders: the `solar-*` shader tags (`shader`, `coreColor`, `rimColor`, `noiseStrength`,
 * `falloff`; metadata read by structural QA only) and the PRD 10 `practical` flag (unwired).
 * The builders record them; a primitive carrying the material reports them as an
 * `option-ignored` degradation (strict mounts throw), never a silent no-op.
 */
export const PBR_UNRENDERED_OPTIONS: readonly string[] = ["shader", "coreColor", "rimColor", "noiseStrength", "falloff", "practical"];
const unrenderedMaterialOptions = new WeakMap<object, readonly string[]>();

export function noteUnrenderedOptions(builder: string, options: AuraMaterialSpec, spec: AuraMaterialSpec): AuraMaterialSpec {
  const unread = PBR_UNRENDERED_OPTIONS.filter((key) => (options as Record<string, unknown>)[key] !== undefined);
  if (unread.length > 0) {
    unrenderedMaterialOptions.set(spec, [`OPTION_IGNORED ${builder}: option${unread.length === 1 ? "" : "s"} ${unread.map((key) => `"${key}"`).join(", ")} ` +
      `${unread.length === 1 ? "is" : "are"} not rendered by this material, so ${unread.length === 1 ? "it has" : "they have"} no effect. ` +
      `Remove ${unread.length === 1 ? "it" : "them"}: the solar shader tags and practical-light scaling are not implemented; use rim: { color, power } for a fresnel rim and emissive / emissiveIntensity for glow`]);
  }
  return spec;
}

/** The OPTION_IGNORED notes `material.pbr` / `material.metal` recorded for `spec` (S5-WP19-04). */
export function materialIgnoredOptions(spec: AuraMaterialSpec | undefined): readonly string[] {
  return (spec && unrenderedMaterialOptions.get(spec)) ?? [];
}

/**
 * E3-06: three.js material options Aura3D does not render. `material.pbr` records a note per key; a primitive carrying
 * the material reports it as an `option-ignored` degradation (never a silent no-op), with the Aura3D spelling to use.
 */
const THREE_MATERIAL_UNSUPPORTED: Readonly<Record<string, string>> = {
  wireframe: "no material wireframe; use geometry.wireframe(source) for a line mesh",
  flatShading: "no flatShading flag; flatten the geometry instead: geometry.computeNormals(geometry.toNonIndexed(source)) gives one normal per face",
  map: "use texture: assets.<key> (a typed texture asset)",
  normalMap: "use normal: assets.<key>",
  aoMap: "use occlusionMap: assets.<key>",
  depthTest: "depthTest is not a material option; use depthWrite or renderOrder",
  transparent: "not needed: Aura3D blends whenever opacity < 1 (or alphaMode: \"blend\"), so set opacity",
  vertexColors: "use geometry colors or instances colors"
};

/**
 * Normalises the three.js aliases on `options` (`side: "double"` to `doubleSided`) and records
 * OPTION_IGNORED notes for guessed names Aura3D does not render. Returns the options the canonical builder reads.
 */
export function normalizeThreeMaterialAliases(builder: string, options: AuraMaterialSpec): { readonly options: AuraMaterialSpec; readonly notes: readonly string[] } {
  const raw = options as Record<string, unknown>;
  const notes: string[] = [];
  const rest: Record<string, unknown> = { ...raw };
  if ("side" in raw) {
    delete rest.side;
    const side = raw.side;
    if ((side === "double" || side === 2) && rest.doubleSided === undefined) rest.doubleSided = true;
    else if (side === "back" || side === 1) notes.push(`OPTION_IGNORED ${builder}: option "side" value "back" has no effect (Aura3D renders front faces; use side: "double" / doubleSided: true for both)`);
  }
  for (const key of Object.keys(THREE_MATERIAL_UNSUPPORTED)) {
    if (raw[key] !== undefined) {
      delete rest[key];
      notes.push(`OPTION_IGNORED ${builder}: option "${key}" is a three.js name with no effect here: ${THREE_MATERIAL_UNSUPPORTED[key]}`);
    }
  }
  return { options: rest as AuraMaterialSpec, notes };
}

/** Attach extra OPTION_IGNORED notes to a material spec (same channel as `noteUnrenderedOptions`). */
export function noteMaterialGuesses(spec: AuraMaterialSpec, notes: readonly string[]): AuraMaterialSpec {
  if (notes.length > 0) unrenderedMaterialOptions.set(spec, [...(unrenderedMaterialOptions.get(spec) ?? []), ...notes]);
  return spec;
}
