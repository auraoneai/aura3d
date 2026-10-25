# Links play-fix (2026-10-25)

**Verified by unit test:** the stroke counter. The swing meter reports `committed` on every frame of the downswing, and `commitSwing()` added a stroke each time, so the counter climbed to about 19 per swing. `src/game/strokeCommit.ts` (`commitStroke`) counts one stroke per shot; `tests/unit/aura-links-3d/stroke-commit.test.ts` (2 tests) fails on the old behaviour.

**Verified by model render (CPU rasteriser, not in-game frames):** the golf cart. Its baked atlas was a shard mosaic (skin-toned fragments and noise) with UVs torn across the sheet, so no repaint of the texture could fix it. `tools/links-cart-retexture/retexture-cart.mjs` classifies triangles into body, roof, seat and dark groups with flat colours. `cart-before-after.png` shows both (top: after, bottom: before). Cream body, green roof, dark wheels and chassis. The golfer: clean trousers, hems and shoes, flat face (`cart-and-golfer-after.png`).

**Fixed by code, not yet seen in a frame:** the "golfer bag" was a basketball ball rack (`rooftopBallRackCartMeshy`); it is now a plain green cylinder bag (`game/rig.ts`).

**In-game frames:** remote runs `fixap-*` were started; the first used a context without the app folder (404 pages), the second (`fixap2-*`) is the one that counts. If frames are not in this folder, the run did not return in time.

Software GL only. Not GPU evidence.
