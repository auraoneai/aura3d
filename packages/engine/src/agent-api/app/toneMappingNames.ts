// 5.4 N7 (guessed names): tone-mapping operator spellings.
//
// Agents copy `"aces-filmic"` from Aura3D's own declarations (`AppliedLookReport.toneMapping`,
// `rendererColorManagementPreset`) and three.js constant names (`ACESFilmicToneMapping`). The output pass only knows
// the canonical operator names, so an unknown name used to fail later inside the renderer. Same-meaning spellings now
// map to the canonical operator; anything else throws here, at createAuraApp / app.output.setOutput, with the list.

import type { AuraToneMappingOperator } from "../../contracts/output.js";

export const TONE_MAPPING_OPERATORS: readonly AuraToneMappingOperator[] = ["none", "linear", "reinhard", "aces", "agx", "neutral", "cineon"];

/** Spellings (compared lower-case, without `-`, `_` and spaces) that mean a canonical operator. */
const TONE_MAPPING_ALIASES: Readonly<Record<string, AuraToneMappingOperator>> = {
  acesfilmic: "aces",
  acesfilmictonemapping: "aces",
  filmic: "aces",
  aces: "aces",
  agxtonemapping: "agx",
  agx: "agx",
  reinhardtonemapping: "reinhard",
  reinhard: "reinhard",
  neutraltonemapping: "neutral",
  khronospbrneutral: "neutral",
  pbrneutral: "neutral",
  neutral: "neutral",
  cineontonemapping: "cineon",
  cineon: "cineon",
  lineartonemapping: "linear",
  linear: "linear",
  notonemapping: "none",
  none: "none",
  off: "none"
};

/**
 * The canonical operator for `value`. `undefined` stays `undefined`; a same-meaning spelling maps to its operator;
 * any other value throws a RangeError that lists the valid names.
 */
export function normalizeToneMappingName(value: unknown, where: string): AuraToneMappingOperator | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    if ((TONE_MAPPING_OPERATORS as readonly string[]).includes(value)) return value as AuraToneMappingOperator;
    const alias = TONE_MAPPING_ALIASES[value.toLowerCase().replace(/[-_\s]/g, "")];
    if (alias !== undefined) return alias;
  }
  throw new RangeError(`TONE_MAPPING_UNKNOWN: ${where} toneMapping ${JSON.stringify(value)} is not a tone-mapping operator. ` +
    `Use one of ${TONE_MAPPING_OPERATORS.map((name) => `"${name}"`).join(", ")} (three.js ACESFilmicToneMapping is "aces").`);
}

/** `output` with its `toneMapping` normalised; the same object when nothing changes. */
export function normalizeOutputToneMapping<T extends { readonly toneMapping?: unknown }>(output: T | undefined, where: string): T | undefined {
  if (output === undefined || output === null || typeof output !== "object" || !("toneMapping" in output)) return output;
  const toneMapping = normalizeToneMappingName(output.toneMapping, where);
  return toneMapping === output.toneMapping ? output : { ...output, toneMapping };
}

/** createAuraApp options with `output.toneMapping` and `renderer.output.toneMapping` normalised (same object if unchanged). */
export function normalizeAppToneMapping<O extends { readonly output?: { readonly toneMapping?: unknown }; readonly renderer?: { readonly output?: { readonly toneMapping?: unknown } } }>(options: O): O {
  if (options === undefined || options === null || typeof options !== "object") return options;
  const output = normalizeOutputToneMapping(options.output, "createAuraApp({ output })");
  const rendererOutput = normalizeOutputToneMapping(options.renderer?.output, "createAuraApp({ renderer: { output } })");
  if (output === options.output && rendererOutput === options.renderer?.output) return options;
  return {
    ...options,
    ...(output === options.output ? {} : { output }),
    ...(rendererOutput === options.renderer?.output ? {} : { renderer: { ...options.renderer, output: rendererOutput } })
  };
}
