/**
 * PRD-01 §15 Phase 1 (C-06, 01-S5) compiler color bridge. Lane-01 file per
 * PRD-01 §25 / Q-15-7.
 *
 * Under `A3D_QR_CORE` the six `agent-api/colorUtils.ts` helpers
 * (`colorToRgba`, `colorToClearColor`, `colorToLinearClearColor`,
 * `colorToLinearRgba`, `colorToLinearRgb`, and `colorToRgb` via
 * `colorToClearColor`) delegate to the single C-06 parser, keeping their
 * output space: sRGB helpers -> `parseAuraColorSrgb`, linear helpers ->
 * `parseAuraColor`. Every CSS form parses (`"orange"`, `"#f80"`,
 * `"rgb(…)"`, `"hsl(…)"`, …) instead of falling back to the silent navy.
 *
 * Invalid input: under `A3D_QR_STRICT` it throws `AuraColorParseError`;
 * otherwise it warns `COLOR_PARSE_FAILED` (C-36 `option-ignored`, once per
 * input) and the helper keeps its legacy fallback.
 *
 * Flag off (no mode installed): every probe returns `null` and the helpers run
 * their verbatim legacy bodies.
 */

import { AuraColorParseError, parseAuraColor, parseAuraColorSrgb } from "../color.js";

export { AuraColorParseError };

export const COLOR_PARSE_FAILED = "COLOR_PARSE_FAILED";

export type Prd01Rgba = readonly [number, number, number, number];

export interface Prd01ColorParseWarning {
  readonly code: typeof COLOR_PARSE_FAILED;
  /** C-36 degradation class. */
  readonly kind: "option-ignored";
  readonly input: unknown;
  readonly message: string;
  readonly ownerPrd: 1;
}

export interface Prd01ColorParsingMode {
  /** `A3D_QR_STRICT`: invalid colors throw `AuraColorParseError`. */
  readonly strict?: boolean;
  /** Warning sink; defaults to `console.warn`. */
  readonly warn?: (warning: Prd01ColorParseWarning) => void;
}

interface InstalledMode {
  readonly strict: boolean;
  readonly warn: (warning: Prd01ColorParseWarning) => void;
  readonly warned: Set<string>;
}

/** Bound on distinct inputs remembered for warn-once (a runaway generator must not grow it forever). */
const MAX_WARNED_INPUTS = 256;

let installed: InstalledMode | null = null;

function defaultWarn(warning: Prd01ColorParseWarning): void {
  if (typeof console !== "undefined") console.warn(`[aura3d] ${warning.code}: ${warning.message}`);
}

/** createAuraApp installs the mode when `A3D_QR_CORE` is on; `null` restores the legacy helpers. */
export function setPrd01ColorParsing(mode: Prd01ColorParsingMode | null): void {
  installed = mode === null
    ? null
    : { strict: mode.strict === true, warn: mode.warn ?? defaultWarn, warned: new Set<string>() };
}

export function prd01ColorParsingEnabled(): boolean {
  return installed !== null;
}

function fail(mode: InstalledMode, color: unknown, error: unknown): null {
  if (mode.strict) throw error instanceof AuraColorParseError ? error : new AuraColorParseError(color);
  const key = `${typeof color}:${String(color)}`;
  if (!mode.warned.has(key)) {
    if (mode.warned.size >= MAX_WARNED_INPUTS) mode.warned.clear();
    mode.warned.add(key);
    mode.warn({
      code: COLOR_PARSE_FAILED,
      kind: "option-ignored",
      input: color,
      message: `Could not parse color ${JSON.stringify(color)}; using the legacy fallback.`,
      ownerPrd: 1
    });
  }
  return null;
}

/**
 * sRGB-encoded RGBA for the sRGB helpers. `null` = flag off, or parse failed
 * (already warned) -> the caller runs its legacy body.
 */
export function prd01ColorSrgb(color: unknown): Prd01Rgba | null {
  const mode = installed;
  if (mode === null) return null;
  try {
    return parseAuraColorSrgb(color as string | number);
  } catch (error) {
    return fail(mode, color, error);
  }
}

/**
 * Linear-light RGBA for the linear helpers. `null` = flag off, or parse failed
 * (already warned) -> the caller runs its legacy body.
 */
export function prd01ColorLinear(color: unknown): Prd01Rgba | null {
  const mode = installed;
  if (mode === null) return null;
  try {
    return parseAuraColor(color as string | number);
  } catch (error) {
    return fail(mode, color, error);
  }
}
