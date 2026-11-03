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

export function formatIgnoredOptions(builder: string, unread: readonly string[], valid: readonly string[]): string {
  return `OPTION_IGNORED ${builder}: option${unread.length === 1 ? "" : "s"} ${unread.map((key) => `"${key}"`).join(", ")} ` +
    `${unread.length === 1 ? "is" : "are"} not read by this builder, so ${unread.length === 1 ? "it has" : "they have"} no effect. ` +
    `Valid options: ${valid.join(", ")}`;
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
