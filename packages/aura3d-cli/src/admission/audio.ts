/**
 * PRD-05 R-09-1 (request from lane 09) — synthesized-audio release rule.
 *
 * `assets validate --release` fails an `audio` entry whose provenance is
 * synthesized unless its id is on `AUDIO_SYNTH_RELEASE_ALLOWLIST`. The
 * allowlist starts empty: all 178 in-repo synthesized audio entries are
 * `candidate`/`ungraded` today, so admitting one is a deliberate, auditable
 * act (lane 09 owns the entries, lane 05 owns the rule).
 */

import type { AuraCliAssetProvenance } from "../asset-core-types.js";

/** Ids allowed to hold `quality: "release"` with synthesized provenance. */
export const AUDIO_SYNTH_RELEASE_ALLOWLIST: readonly string[] = [];

/**
 * Provenance counts as synthesized when its own fields say the bytes were
 * generated in-repo — `author`/`sourceFamily`/`attribution`/`evidence`
 * mentioning synthesis, or a builder-script source page.
 */
export function isSynthesizedAudioProvenance(provenance: Pick<AuraCliAssetProvenance, "author" | "sourceFamily" | "attribution" | "evidence" | "sourcePage"> | undefined): boolean {
  if (!provenance) return false;
  const blob = [
    provenance.author ?? "",
    provenance.sourceFamily ?? "",
    provenance.attribution ?? "",
    provenance.sourcePage ?? "",
    ...(provenance.evidence ?? []),
  ].join("\n");
  if (/(?:synthesi[sz]ed|synth\b|procedurally generated|deterministic(?:ally)? (?:synth|generated))/i.test(blob)) return true;
  return /(^|\/)apps\/[^/]+\/scripts\/(?:build|blender-build|build-review|register)-[^/]*\.(?:mjs|ts|py)$/i.test(provenance.sourcePage ?? "");
}
