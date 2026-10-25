# FC play-fix (2026-10-25)

**Verified by unit test:** skin weights. The repair only ever covered the first material primitive. Measured over every primitive, the previous shipped models had 750 (striker) and 869 (keeper) triangles stretched past 2x, with maxima of 120x and 93x. The new models are smoothed over the whole mesh (`tools/aura-fc/skin.mjs` on the merged mesh): 140 and 12 triangles past 2x, maxima 5.2x and 4.2x. `tests/unit/aura-fc-3d/skin-repair.test.ts` now measures every primitive (thresholds: at most 200 past 2x, none past 6x, no triangle dropped); 59 FC and likeness tests pass.

**Verified by model render (CPU rasteriser, not in-game frames):** clean shirt, shorts, socks, boots, hair and a flat face on both models (`athletes-after.png`). Shorts end lower (`shortsHem` 0.33).

**Fixed by code, not yet seen in a frame:**
- shorts, socks and skin are tinted per team by material name (only the shirt was before, so team shorts and socks never applied; skin tone now comes from `skinFor(id)`);
- the referee was a sci-fi security guard model; it is now the player body in a yellow shirt with black shorts and socks;
- the broadcast camera is tighter: eye 9.5 m up and 20 m back at 38 degrees (was 11.5 m, 23.5 m, 40 degrees), same ball-follow and touchline easing.

**Open:** in-game frames of the above were not captured before this push. The camera change especially needs a look (near-side play must stay in frame).

Software GL only. Not GPU evidence.
