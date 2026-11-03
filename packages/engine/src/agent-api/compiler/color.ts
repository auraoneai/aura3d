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

// The legacy setter remains available for standalone compiler consumers. App
// execution uses an explicitly owned policy instead: creating one app must not
// change the parser (or warning history) of another app.
let installed: InstalledMode | null = null;
const ownedModes = new WeakMap<object, { mode: InstalledMode | null }>();
let activeMode: InstalledMode | null | undefined;

function defaultWarn(warning: Prd01ColorParseWarning): void {
  if (typeof console !== "undefined") console.warn(`[aura3d] ${warning.code}: ${warning.message}`);
}

/** Set an owner's parser policy; the optional ownerless form is a legacy standalone policy. */
export function setPrd01ColorParsing(mode: Prd01ColorParsingMode | null): void;
export function setPrd01ColorParsing(mode: Prd01ColorParsingMode | null, owner: object): () => void;
export function setPrd01ColorParsing(mode: Prd01ColorParsingMode | null, owner?: object): (() => void) | void {
  const next = mode === null
    ? null
    : { strict: mode.strict === true, warn: mode.warn ?? defaultWarn, warned: new Set<string>() };
  if (owner) {
    const registration = { mode: next };
    ownedModes.set(owner, registration);
    return () => {
      if (ownedModes.get(owner) === registration) ownedModes.delete(owner);
    };
  }
  installed = next;
}

/**
 * Run a synchronous compilation step under one owner's policy. The previous
 * policy is restored even on throw and under re-entrant compilation. Never
 * keep this scope open across an await: pass the owner into the next step and
 * enter a fresh scope there instead.
 */
export function withPrd01ColorParsing<T>(owner: object, work: () => T): T {
  const previous = activeMode;
  // Unregistered callers retain the historical standalone policy. An app
  // registers even its disabled (`null`) policy to opt out of that fallback.
  activeMode = ownedModes.get(owner)?.mode ?? (ownedModes.has(owner) ? null : installed);
  try {
    return work();
  } finally {
    activeMode = previous;
  }
}

export function prd01ColorParsingEnabled(): boolean {
  return (activeMode === undefined ? installed : activeMode) !== null;
}

function fail(mode: InstalledMode, color: unknown): null {
  let display: string;
  try { display = typeof color === "string" ? color : String(color); } catch { display = "[unprintable]"; }
  // Invalid color input is untrusted and may actually be a URL or header.
  // Do not copy credentials, query parameters or arbitrary object state into
  // diagnostics. Ordinary color strings remain actionable.
  display = display
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        parsed.username = "";
        parsed.password = "";
        if (parsed.search) parsed.search = "?[redacted]";
        if (parsed.hash) parsed.hash = "#[redacted]";
        return parsed.toString();
      } catch { return "[redacted URL]"; }
    })
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie|password|secret|token|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 128);
  if (mode.strict) throw new AuraColorParseError(display);
  const key = `${typeof color}:${display}`;
  if (!mode.warned.has(key)) {
    if (mode.warned.size >= MAX_WARNED_INPUTS) mode.warned.clear();
    mode.warned.add(key);
    mode.warn({
      code: COLOR_PARSE_FAILED,
      kind: "option-ignored",
      input: typeof color === "number" && Number.isFinite(color) ? color : display,
      message: `Could not parse color ${JSON.stringify(display)}; using the legacy fallback.`,
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
  const mode = activeMode === undefined ? installed : activeMode;
  if (mode === null) return null;
  try {
    return parseAuraColorSrgb(color as string | number);
  } catch {
    return fail(mode, color);
  }
}

/**
 * Linear-light RGBA for the linear helpers. `null` = flag off, or parse failed
 * (already warned) -> the caller runs its legacy body.
 */
export function prd01ColorLinear(color: unknown): Prd01Rgba | null {
  const mode = activeMode === undefined ? installed : activeMode;
  if (mode === null) return null;
  try {
    return parseAuraColor(color as string | number);
  } catch {
    return fail(mode, color);
  }
}
