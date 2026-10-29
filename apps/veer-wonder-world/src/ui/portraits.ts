// Host portraits for the story menu cards (PRD 04 E02: thumbnails with
// familiar characters). One small picture per host character.
//
// Each portrait is a 256 px WebP crop of the character's front view in the
// remote character sheets (tools/make-portraits.sh; records and licence in
// provenance/portraits.json and src/assets/rights-manifest.ts). The URLs come
// from the generated src/portrait-assets.ts, which sits beside src/main.ts so
// the same module-relative URL works in the Vite build and in the repo dev
// server, and the build bundles each file same-origin with a content hash, like
// the models and the audio. A card whose host has no portrait keeps its
// host-colour badge with the story number (src/ui/episode-menu.ts). A portrait
// is decorative: the card still names its host in text.

import { PORTRAIT_URLS } from "../portrait-assets.js";
import type { CharacterId } from "../types.js";

export const PORTRAITS: Readonly<Partial<Record<CharacterId, string>>> = PORTRAIT_URLS;
