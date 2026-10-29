// Punjabi locale pack: a disabled placeholder (PRD 04 C08; PRD 03 section 7).
//
// A Punjabi pack must be written and voiced by native speakers and reviewed
// before it is offered: no machine translation, no word-by-word copies of the
// English lines, and a natural localized script and offline prompt for every
// target concept. Until then this pack stays present, empty and disabled
// (07 B16): the catalog (src/content/catalog.ts) and the parent panel do not
// list it (06 QA-E11).

import type { LocalePack } from "../types.js";

export const PA_STATUS = {
  enabled: false,
  reason: "Native-speaker writing, voicing and review are required before a Punjabi pack is enabled (PRD 04 C08).",
  review: null
} as const;

/** Empty on purpose: no Punjabi content exists yet. */
export const pa: LocalePack = { locale: "pa", lines: {}, strings: {} };
