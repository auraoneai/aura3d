# Iron Crown: framed photographic portraits removed from the Crown Arena (2026-10-24)

Branch `game-rework`. Remote software WebGL2 (SwiftShader), 1280x720; not real-GPU evidence.

## Finding

The Crown Arena wall showed framed photographs of people beside the speaker towers. They come from the shared catalog model `billiardsTrophyCabinetMeshy` (placed at x = ±4.3): its baked 1024 px texture atlas holds small framed photographs (faces, a man in a suit) among wood and red shards. `compare-portrait-crops.jpg` (top: before, bottom: after; left and right wall) shows the portraits before and after.

## What was tried, and what shipped

1. A posterising repaint of the atlas (every non-wood pixel snapped to a 5-colour palette) left the portrait shapes readable as a posterised figure with a head, tie and suit. It was rejected and removed (no asset or tool from it is committed).
2. **Shipped:** the Crown Arena no longer loads that model. `buildTrophyCabinets()` in `apps/showcase-iron-crown/src/game/stages.ts` builds both cabinets from instanced primitives: a wood frame, four shelves with gold cups, a gold cornice, and two flat crimson banners with gold borders on each back panel where the photographs hung. Eight draws for both cabinets. No texture, no people, no marks.

`compare-crown-arena.jpg` is the before (left) and after (right) frame. After frames for all six venues are in this folder (`after-stage-*.jpg`).

## Scan of the other Iron Crown stages

Texture sheets for all 30 shared catalog models used by the stages (`tools/likeness-audit/dump-textures.mjs`) plus a rendered frame of every venue (`tests/browser/ic-stage-scan.spec.ts`): only generic signage ("RAMEN" lettering on the Lantern Dock stalls), hazard signs and a small emblem on the aircraft, no photographs, faces or real brand marks readable. The Colosseum busts and the monastery buildings are untextured or flat. The fighters' own Meshy textures include generated (not photographic) faces and are outside this stage scan.

## Guard

`tests/unit/likeness-audit/iron-crown-stage-props.test.ts`: fails if `stages.ts` references the scanned cabinet or stops building the primitive one, or if the old cabinet (by key, hash, file name or bytes) is shipped in `apps/showcase-iron-crown`. Checked: it fails against the previous `stages.ts` and passes on the new one.

## Caveats

- The new cabinets are plainer than the scanned one (no carved detail); the black speaker towers hide most of them from the gameplay camera.
- The shared model still exists in the root catalog for other apps; this change only removes it from Iron Crown. Other users of `billiardsTrophyCabinetMeshy` (the billiards route) were not audited here.
- Unrelated, found while checking hashes: `ironcrownCrown`'s manifest sha256 does not match the shipped file (both `aura.assets.json` and `src/aura-assets.ts`); it predates this work and was left alone.
