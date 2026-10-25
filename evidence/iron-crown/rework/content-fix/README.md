# Iron Crown: fighter restyle, floor markers, stage text (2026-10-24)

Branch `game-rework`. Frames are remote software WebGL2 (SwiftShader), not real-GPU evidence. Compare sheets show before (left, `evidence/iron-crown/screens/2026-10-24`) and after (right).

## What changed

- **Kenji Arashi** looked like a well-known fighting-game character (white gi, red headband, black belt). His baked texture is recoloured by colour family (`tools/iron-crown-restyle/recolor.mjs`, preset `kenji`): the white gi becomes a deep teal jacket, the red headband and trim fold into dark hair, skin and the black belt are untouched. White cloth went from 52.9% of the atlas to 0.06% and red band pixels from 1.66% to 0%. Shading detail is kept (the recolour maps the cloth brightness ramp, not a flat colour). Geometry, skeleton and the 10 clips are unchanged.
- **Mara Volt** (the other fighter on screen): navy bodysuit to burgundy, blue panels and hair to amber, cyan marks to orange (preset `volt`).
- Both files are new content-hashed GLBs (`ironcrownKenji.a310f427.glb`, `ironcrownVolt.00f3110a.glb`); the old files are removed. `aura.assets.json` and `src/aura-assets.ts` carry the new url, sha256 and size, and each asset has a derivation record in `apps/showcase-iron-crown/aura-evidence/restyle/`.
- **Floor markers:** the fighting kit's debug-style nodes (the left and right camera safe-zone posts, the centre aura beam, and the two start-lane slabs) are dropped in `buildArena`, and the start points are marked with flat emissive rings instead (`player-spawn-*`, `rival-spawn-*`). The pale slab on the left, the floor slabs and the pink beam are gone in the after frames.
- **Stage and fighter text:** display names only, ids unchanged so QA hooks still work. `Bangkok Dock Market` is now `Lantern Dock Market` (chip `Lantern Dock`), `Desert Airbase` is `Dustline Airstrip` (chip `Airstrip`), `Himalayan Monastery` is `Cloudstep Monastery`, the venue lines `Khlong pier` and `Nevada range` are generic, Kenji's archetype `Balanced shoto` is `Balanced all-rounder`, and Volt's bio no longer names Bangkok. Move and fighter names (`Raijin Straight`, `Volt Combination`, `Colossus Drop`, `Avalanche Lance`, `Phantom Parade`, `Crown Decree`) are generic and unchanged.

## Tests

`tests/unit/iron-crown/fighter-restyle.test.ts`: manifest hash, size, url and the restyle record match the shipped file for both fighters, and Kenji's texture has under 2% white and under 0.2% red pixels.

## Not done / caveats

- The recolour is a restyle of Meshy art, not new characters. Kenji is still a martial artist in a loose jacket; a stronger change (different silhouette, hair, headwear) needs a new Meshy generation (no credits were spent).
- The black belt stays black: belt and hair share near-black pixels and cannot be separated by colour.
- The 390 px layout (four-row bar over the arena, truncated health-bar names) is not touched here (`fix-d-ui` owns layout).
- Capture note: the capture server logged three 404s for `/apps/showcase-iron-crown/fonts/whitney-*.woff2` and `fonts.css` in the first pass. Production serves them (200); my staging did not copy the route font folder. Not a product defect.
