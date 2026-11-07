/**
 * PRD-01 §15 Phase 1 (C-06, 01-S5) compiler color bridge. Lane-01 file per
 * PRD-01 §25 / Q-15-7.
 *
 * The `agent-api/colorUtils.ts` helpers always delegate to the single C-06 parser (no flag gate): every CSS form
 * parses (`"orange"`, `"#f80"`, `"rgb(…)"`, `"hsl(…)"`, `oklch(…)`, …). Invalid input throws `AuraColorParseError`
 * with `code: "COLOR_INVALID"` in strict and default paths; it is never replaced by a near-black fallback. The
 * owner policy setters below are kept for API compatibility; `warn` is no longer used.
 */

import { AuraColorParseError, COLOR_INVALID, parseAuraColor, parseAuraColorSrgb } from "../color.js";

export { AuraColorParseError, COLOR_INVALID };

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

function describe(color: unknown): string {
  let display: string;
  try { display = typeof color === "string" ? color : String(color); } catch { display = "[unprintable]"; }
  // Invalid color input is untrusted and may actually be a URL or header.
  // Do not copy credentials, query parameters or arbitrary object state into
  // diagnostics. Ordinary color strings remain actionable.
  return display
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
}

/**
 * An unparseable colour is never replaced by a fallback: it throws `AuraColorParseError`
 * (`code: "COLOR_INVALID"`, naming the value and, when known, where it was used) in strict and default paths alike.
 */
function fail(color: unknown): never {
  throw new AuraColorParseError(describe(color));
}

/** sRGB-encoded RGBA for the sRGB helpers. Always parses (no flag gate); invalid input throws `COLOR_INVALID`. */
export function prd01ColorSrgb(color: unknown): Prd01Rgba {
  try {
    return parseAuraColorSrgb(color as string | number);
  } catch {
    return fail(color);
  }
}

/** Linear-light RGBA for the linear helpers. Always parses; invalid input throws `COLOR_INVALID`. */
export function prd01ColorLinear(color: unknown): Prd01Rgba {
  try {
    return parseAuraColor(color as string | number);
  } catch {
    return fail(color);
  }
}
