// Host portraits for the story menu cards (PRD 04 E02: thumbnails with
// familiar characters). One small picture per host character.
//
// Empty until the portraits are rendered. Then each character maps to a
// module-relative image URL, for example
//   momo: new URL("../assets/portraits/momo.webp", import.meta.url).pathname,
// so the build bundles each file same-origin with a content hash (no public/
// folder, no absolute or remote URL), like the models and the audio. A card
// whose host has no portrait keeps its host-colour badge with the story
// number (src/ui/episode-menu.ts). A portrait is decorative: the card still
// names its host in text.

import type { CharacterId } from "../types.js";

export const PORTRAITS: Readonly<Partial<Record<CharacterId, string>>> = {};
