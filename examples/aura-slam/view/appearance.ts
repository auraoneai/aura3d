/** Cosmetic palette: ids are validated before entering a match; ported from player-appearance.js (same ids, labels, colours). */
export type AppearancePart = "skin" | "shirt" | "pants" | "shoes" | "racket";
export type AppearanceSelection = Record<AppearancePart, string>;
export type AppearanceColors = Record<AppearancePart, string>;
interface Option { readonly id: string; readonly label: string; readonly color: string }

const options = (entries: ReadonlyArray<readonly [string, string, string]>): readonly Option[] =>
  Object.freeze(entries.map(([id, label, color]) => Object.freeze({ id, label, color })));

const skin = options([["light", "Light", "#e4b995"], ["medium", "Medium", "#c9926d"], ["dark", "Dark", "#805039"]]);
const clothing = options([["ivory", "Ivory", "#f3f0dc"], ["forest", "Forest", "#214b3e"], ["clay", "Clay", "#db582f"], ["navy", "Navy", "#25364d"], ["sky", "Sky", "#70b5d3"], ["berry", "Berry", "#933d63"]]);
const racket = options([["graphite", "Graphite", "#1d2927"], ["ivory", "Ivory", "#f3f0dc"], ["clay", "Clay", "#db582f"], ["navy", "Navy", "#25364d"], ["sky", "Sky", "#70b5d3"], ["berry", "Berry", "#933d63"]]);

export const APPEARANCE_GROUPS: Readonly<Record<AppearancePart, readonly Option[]>> = Object.freeze({ skin, shirt: clothing, pants: clothing, shoes: clothing, racket });
export const APPEARANCE_PARTS = Object.freeze(Object.keys(APPEARANCE_GROUPS)) as readonly AppearancePart[];

export function defaultAppearance(side: string = "player"): AppearanceSelection {
  return side === "ai" || side === "rival"
    ? { skin: "dark", shirt: "clay", pants: "navy", shoes: "ivory", racket: "graphite" }
    : { skin: "medium", shirt: "ivory", pants: "forest", shoes: "ivory", racket: "graphite" };
}

export function validateAppearance(value: unknown): AppearanceSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const selection = {} as AppearanceSelection;
  for (const part of APPEARANCE_PARTS) {
    // Saved players from before racket customisation retain their entire kit.
    if (part === "racket" && !Object.hasOwn(record, part)) { selection.racket = "graphite"; continue; }
    if (!Object.hasOwn(record, part) || !APPEARANCE_GROUPS[part].some((option) => option.id === record[part])) return null;
    selection[part] = record[part] as string;
  }
  return selection;
}

export const normalizeAppearance = (value: unknown, side: string = "player"): AppearanceSelection => validateAppearance(value) ?? defaultAppearance(side);

/** Resolve a selection (or the side's default kit) to hex colours: the live game's `TennisAppearance.resolve`. */
export function resolveAppearance(value: unknown, side: string = "player"): AppearanceColors {
  const selection = normalizeAppearance(value, side);
  const out = {} as AppearanceColors;
  for (const part of APPEARANCE_PARTS) out[part] = APPEARANCE_GROUPS[part].find((option) => option.id === selection[part])!.color;
  return out;
}
