/**
 * Lane 06 (PRD-06 T0.9a) — clip-map validation for character-driven games.
 *
 * A clip map binds each gameplay state (idle, walk, dash, …) to a real embedded
 * GLB clip on the mounted actor. `validateClipMap` is the contract both lane
 * fixtures and templates call before trusting a map: every required state must
 * be mapped, every mapped clip must exist on the asset, and every declared
 * stand-in surfaces exactly one `FIGHTER_CLIP_STAND_IN` warning so coverage
 * debt stays visible instead of silently passing.
 */

/** One map entry: the embedded clip name, and whether it is a declared stand-in. */
export interface AuraClipMapEntry {
  readonly clip: string;
  readonly standIn?: true;
}

export interface AuraClipMapMissingEntry {
  readonly state: string;
  readonly clip?: string;
}

export interface AuraClipMapValidationReport {
  readonly ok: boolean;
  /** States with no map entry, or mapped to a clip absent from the asset. */
  readonly missing: readonly AuraClipMapMissingEntry[];
  /** One entry per declared `standIn: true`, emitted in map order. */
  readonly standIns: readonly { readonly state: string; readonly clip: string }[];
  readonly diagnostics: readonly string[];
}

export interface AuraClipMapValidationOptions<State extends string> {
  /** Clip names the asset actually embeds (e.g. manifest `metadata.animations`). */
  readonly availableClips: Iterable<string>;
  /** Every gameplay state that must resolve to a clip. */
  readonly requiredStates: readonly State[];
  /** Label for diagnostics (fighter id / asset key). */
  readonly label?: string;
}

/**
 * Error thrown by `validateClipMap` when a required state is unmapped or a
 * mapped clip is absent from the asset. `code` is `FIGHTER_CLIP_MISSING` and
 * `missing` carries the full list (spec T0.9a: "throws FIGHTER_CLIP_MISSING
 * with the list").
 */
export class AuraClipMapMissingError extends Error {
  readonly code = "FIGHTER_CLIP_MISSING";
  readonly missing: readonly AuraClipMapMissingEntry[];
  constructor(missing: readonly AuraClipMapMissingEntry[], label?: string) {
    const rendered = missing
      .map((entry) => (entry.clip ? `${entry.state}→"${entry.clip}"` : entry.state))
      .join(", ");
    super(`FIGHTER_CLIP_MISSING${label ? ` (${label})` : ""}: ${rendered}`);
    this.name = "AuraClipMapMissingError";
    this.missing = missing;
  }
}

/**
 * Validate one fighter's clip map against its asset's embedded clips.
 *
 * - Every `requiredStates` entry must be mapped (unmapped states fail).
 * - Every mapped clip must appear in `availableClips` (absent clips fail).
 * - Each `standIn: true` emits exactly one `FIGHTER_CLIP_STAND_IN` warning and
 *   is counted in the returned report; stand-ins never count as coverage.
 *
 * Throws `AuraClipMapMissingError` when `missing` is non-empty; otherwise
 * returns the report.
 */
export function validateClipMap<State extends string>(
  map: Partial<Record<State, AuraClipMapEntry | string>>,
  options: AuraClipMapValidationOptions<State>
): AuraClipMapValidationReport {
  const available = new Set(options.availableClips);
  const missing: AuraClipMapMissingEntry[] = [];
  const standIns: { readonly state: string; readonly clip: string }[] = [];
  const diagnostics: string[] = [];

  for (const state of options.requiredStates) {
    const raw = map[state];
    const entry: AuraClipMapEntry | undefined =
      typeof raw === "string" ? { clip: raw } : raw;
    if (!entry) {
      missing.push({ state });
      diagnostics.push(`${options.label ?? "fighter"} has no clip mapped for state "${state}".`);
      continue;
    }
    if (!available.has(entry.clip)) {
      missing.push({ state, clip: entry.clip });
      diagnostics.push(`${options.label ?? "fighter"} maps "${state}" to absent clip "${entry.clip}".`);
      continue;
    }
    if (entry.standIn === true) {
      standIns.push({ state, clip: entry.clip });
      const warning = `FIGHTER_CLIP_STAND_IN: ${options.label ?? "fighter"} state "${state}" stands in with "${entry.clip}".`;
      diagnostics.push(warning);
      console.warn(warning);
    }
  }

  if (missing.length > 0) {
    throw new AuraClipMapMissingError(missing, options.label);
  }
  return { ok: true, missing, standIns, diagnostics };
}
