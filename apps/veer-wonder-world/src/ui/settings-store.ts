// Parent settings, stored on this device only (PRD 01 sections 6 and 8, PRD 03
// section 8, PRD 06 QA-E12 and QA-P06).
//
// The stored record is rebuilt field by field from a fixed allow-list, so a
// child name or any other identity field is never read back or written, even
// when the stored text is corrupt or hand-edited. The word list keeps only
// ids from the content word catalog, so it cannot carry free text either.
// Missing, unreadable or corrupt data falls back to the defaults. Nothing
// here leaves the device.

import { isWordId } from "../content/words.js";
import type { ParentSettings, PlayMode, SfxVolume } from "../types.js";

export type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The only storage key the app writes. It names the app, never a child. */
export const SETTINGS_STORAGE_KEY = "wonder-world.parent-settings.v1";

/** Exactly the fields that are ever stored. */
export const PARENT_SETTINGS_FIELDS: readonly (keyof ParentSettings)[] = [
  "mode",
  "music",
  "sound",
  "sfxVolume",
  "captions",
  "reducedMotion",
  "highContrast",
  "locale",
  "waitMs",
  "wordList"
];

/**
 * Locales a parent can pick today: English only. The Punjabi pack
 * (src/localization/pa.ts) stays disabled, and the panel does not list it,
 * until native review (07 B16; 06 QA-E11).
 */
export const AVAILABLE_LOCALES: readonly string[] = ["en"];

export const WAIT_MS_MIN = 3000;
export const WAIT_MS_MAX = 8000;
export const WAIT_MS_DEFAULT = 5000;
/** The wait is chosen in whole seconds. */
export const WAIT_MS_STEP = 1000;

/** PRD 01 section 6 suggests a short list of 3-5 words. */
export const WORD_LIST_MAX = 5;

/** Word ids look like content word ids: "ball", "all-done", "my-turn". */
export const WORD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** A stored record longer than this is not a settings record; it is ignored. */
const MAX_STORED_LENGTH = 4096;

const PLAY_MODES: readonly PlayMode[] = ["play-together", "watch-sing"];
/** The sound-effect levels a grown-up can pick (01 section 9; 07 B20). */
export const SFX_VOLUMES: readonly SfxVolume[] = ["off", "soft", "normal"];

/**
 * The defaults. The two flags are the device's `(prefers-reduced-motion:
 * reduce)` and `(prefers-contrast: more)` preferences: they seed calm motion
 * and high contrast, and a stored parent choice still wins (loadSettings).
 */
export function defaultSettings(prefersReducedMotion = false, prefersMoreContrast = false): ParentSettings {
  return {
    mode: "play-together",
    music: true,
    sound: true,
    sfxVolume: "normal",
    captions: true,
    reducedMotion: prefersReducedMotion,
    highContrast: prefersMoreContrast,
    locale: "en",
    waitMs: WAIT_MS_DEFAULT,
    wordList: []
  };
}

/** Clamps to 3-8 s in whole seconds; non-numbers give the 5 s default. */
export function clampWaitMs(value: number): number {
  if (!Number.isFinite(value)) return WAIT_MS_DEFAULT;
  const stepped = Math.round(value / WAIT_MS_STEP) * WAIT_MS_STEP;
  return Math.min(WAIT_MS_MAX, Math.max(WAIT_MS_MIN, stepped));
}

/** A word id that may be stored: well-formed and listed in the content word catalog (src/content/words.ts). */
export function isStorableWordId(id: string): boolean {
  return WORD_ID_PATTERN.test(id) && isWordId(id);
}

/** Keeps up to five distinct catalog word ids; drops anything else. */
export function sanitizeWordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (!isStorableWordId(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= WORD_LIST_MAX) break;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickBoolean(record: Record<string, unknown>, key: keyof ParentSettings, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

/** Builds a valid ParentSettings from untrusted data, field by field, from the allow-list only. */
export function sanitizeSettings(raw: unknown, defaults: ParentSettings = defaultSettings()): ParentSettings {
  if (!isRecord(raw)) return { ...defaults, wordList: [...defaults.wordList] };
  const modeValue = raw["mode"];
  const localeValue = raw["locale"];
  const waitValue = raw["waitMs"];
  const sfxValue = raw["sfxVolume"];
  return {
    mode: PLAY_MODES.find((mode) => mode === modeValue) ?? defaults.mode,
    music: pickBoolean(raw, "music", defaults.music),
    sound: pickBoolean(raw, "sound", defaults.sound),
    sfxVolume: SFX_VOLUMES.find((level) => level === sfxValue) ?? defaults.sfxVolume,
    captions: pickBoolean(raw, "captions", defaults.captions),
    reducedMotion: pickBoolean(raw, "reducedMotion", defaults.reducedMotion),
    highContrast: pickBoolean(raw, "highContrast", defaults.highContrast),
    locale: typeof localeValue === "string" && AVAILABLE_LOCALES.includes(localeValue) ? localeValue : defaults.locale,
    waitMs: typeof waitValue === "number" ? clampWaitMs(waitValue) : defaults.waitMs,
    wordList: "wordList" in raw ? sanitizeWordList(raw["wordList"]) : [...defaults.wordList]
  };
}

/**
 * Reads settings from storage. `prefersReducedMotion` and `prefersMoreContrast`
 * come from the caller's `(prefers-reduced-motion: reduce)` and
 * `(prefers-contrast: more)` media queries and only seed the defaults: a
 * stored parent choice wins. Returns defaults when storage is null, blocked,
 * empty or corrupt.
 */
export function loadSettings(storage: SettingsStorage | null, prefersReducedMotion = false, prefersMoreContrast = false): ParentSettings {
  const defaults = defaultSettings(prefersReducedMotion, prefersMoreContrast);
  if (!storage) return defaults;
  let text: string | null;
  try {
    text = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return defaults;
  }
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_STORED_LENGTH) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return defaults;
  }
  return sanitizeSettings(parsed, defaults);
}

/**
 * Writes the allow-listed fields only. Returns false when storage is null,
 * blocked or full; the app then keeps the in-memory settings for the session.
 */
export function saveSettings(storage: SettingsStorage | null, settings: ParentSettings): boolean {
  if (!storage) return false;
  const clean = sanitizeSettings(settings, defaultSettings(settings.reducedMotion, settings.highContrast));
  const record: Record<string, unknown> = {};
  for (const field of PARENT_SETTINGS_FIELDS) record[field] = clean[field];
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Removes the stored record. Returns false only when storage is blocked. */
export function clearSettings(storage: SettingsStorage | null): boolean {
  if (!storage) return true;
  try {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** `window.localStorage`, or null where it is missing or blocked (private mode, sandboxed frames). */
export function safeLocalStorage(win: Pick<Window, "localStorage"> | null | undefined): SettingsStorage | null {
  if (!win) return null;
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}
