// Feature flags (PRD 04 B11, PRD 01 section 8, PRD 03 section 4).
//
// Optional and future modules are OFF. The microphone modules (P3 voice
// input and sound presence, 04 K01-K02) are locked off: no URL parameter,
// setting or code path in this build can turn them on, so nothing can ever
// trigger a microphone permission prompt.
//
// readFlags(search) adds the few page-load switches QA and parents need
// (models, diagnostics, audio, reduced motion). It parses them with the
// Aura3D QA kit's readQaParams and never reads a locked flag from the URL.

import { readQaParams } from "@aura3d/engine";

export const FEATURE_FLAGS = Object.freeze({
  /** P3 microphone voice input (04 K01). Locked off. */
  voiceInput: false,
  /** P3 "a sound happened" detector (04 K02). Locked off. */
  soundPresence: false,
  /** Punjabi pack (04 C08): off until native review and voicing. */
  punjabiPack: false,
  /** Private family greeting packs (05 G09): never bundled, off. */
  familyPacks: false,
  /** Optional local parent notes (01 section 1, 03 section 8): off by default. */
  parentNotes: false
} as const);

export type FeatureFlags = typeof FEATURE_FLAGS;

/** Effective flags for one page load. Locked flags are typed `false`. */
export interface WonderFlags extends FeatureFlags {
  /** Load admitted GLBs; `?models=0` forces the primitive stand-ins. */
  readonly models: boolean;
  /** `?diag=1`: install diagnostics (safety net overlay). */
  readonly diag: boolean;
  /** Recorded audio on; `?audio=0` runs silent (caption timing, AUDIO_UNAVAILABLE path). */
  readonly audio: boolean;
  /** `?reducedMotion=1`: force reduced motion (QA captures); the parent setting still applies too. */
  readonly reducedMotion: boolean;
}

const PAGE_PARAMS = {
  models: { type: "string", default: "1" },
  diag: { type: "flag" },
  audio: { type: "string", default: "1" },
  reducedMotion: { type: "flag" }
} as const;

const OFF_VALUES: readonly string[] = ["0", "false", "off", "no"];

function switchedOff(value: string): boolean {
  return OFF_VALUES.includes(value.trim().toLowerCase());
}

/**
 * Flags for this page load from a URL search string (`location.search`).
 * Locked flags always come from FEATURE_FLAGS; the result is frozen.
 */
export function readFlags(search: string): WonderFlags {
  const page = readQaParams(PAGE_PARAMS, search);
  return Object.freeze({
    ...FEATURE_FLAGS,
    models: !switchedOff(page.models),
    diag: page.diag,
    audio: !switchedOff(page.audio),
    reducedMotion: page.reducedMotion
  });
}
