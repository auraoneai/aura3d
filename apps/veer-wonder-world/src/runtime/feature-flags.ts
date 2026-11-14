// Feature flags (PRD 04 B11, PRD 01 section 8, PRD 03 section 4, PRD 5.5.1 §3).
//
// Optional and future modules are OFF. The microphone modules (P3 voice
// input and sound presence, 04 K01-K02) are locked off: no URL parameter,
// setting or code path in this build can turn them on, so nothing can ever
// trigger a microphone permission prompt.
//
// readFlags(search) adds the few page-load switches QA and parents need
// (diagnostics, audio, reduced motion, renderer backend). It parses them with
// the Aura3D QA kit's readQaParams and never reads a locked flag from the URL.

import { readQaParams } from "@aura3d/engine";
import type { ShowAspect } from "../types.js";

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

/** Requested 3D renderer backend (`"auto"` tries WebGPU first with clean WebGL2 fallback). */
export type RendererBackendPref = "auto" | "webgl2" | "webgpu";

/** Effective flags for one page load. Locked flags are typed `false`. */
export interface WonderFlags extends FeatureFlags {
  /** `?diag=1`: install diagnostics (safety net overlay). */
  readonly diag: boolean;
  /** Recorded audio on; `?audio=0` runs silent (caption timing, AUDIO_UNAVAILABLE path). */
  readonly audio: boolean;
  /** `?reducedMotion=1`: force reduced motion (QA captures); the parent setting still applies too. */
  readonly reducedMotion: boolean;
  /** `?backend=auto|webgl2|webgpu`: renderer preference (default `"auto"`). */
  readonly backend: RendererBackendPref;
  /** `?broadcast=1`: autonomous zero-UI broadcast playback mode (PRD 09 B3.1). */
  readonly broadcast: boolean;
  /** `?aspect=16:9|9:16`: broadcast frame aspect ratio (default `"16:9"`). */
  readonly aspect: ShowAspect;
}

const PAGE_PARAMS = {
  diag: { type: "flag" },
  audio: { type: "string", default: "1" },
  reducedMotion: { type: "flag" },
  backend: { type: "string", default: "auto" },
  broadcast: { type: "flag" },
  aspect: { type: "string", default: "16:9" }
} as const;

const OFF_VALUES: readonly string[] = ["0", "false", "off", "no"];

function switchedOff(value: string): boolean {
  return OFF_VALUES.includes(value.trim().toLowerCase());
}

function parseBackendPref(value: string): RendererBackendPref {
  const normalized = value.trim().toLowerCase();
  if (normalized === "webgl2") return "webgl2";
  if (normalized === "webgpu") return "webgpu";
  return "auto";
}

function parseAspect(value: string): ShowAspect {
  return value.trim() === "9:16" ? "9:16" : "16:9";
}

/**
 * Flags for this page load from a URL search string (`location.search`).
 * Locked flags always come from FEATURE_FLAGS; the result is frozen.
 */
export function readFlags(search: string): WonderFlags {
  const page = readQaParams(PAGE_PARAMS, search);
  return Object.freeze({
    ...FEATURE_FLAGS,
    diag: page.diag,
    audio: !switchedOff(page.audio),
    reducedMotion: page.reducedMotion,
    backend: parseBackendPref(page.backend),
    broadcast: page.broadcast,
    aspect: parseAspect(page.aspect)
  });
}
