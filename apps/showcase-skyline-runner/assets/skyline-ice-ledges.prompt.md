# Skyline ice-ledges source record

Generated on 2026-08-29 with the built-in OpenAI image generation tool for
Aura3D's renderer-owned Skyline Runner platform presentation. The retained
transparent variants are:

- `skyline-ice-ledge-long.png` — `sha256-f94d42f8afe014e02184e92eb0dedab0a99ad0156be94a4e0764088ec7e71678`
- `skyline-ice-ledge-medium.png` — `sha256-b7c58d7040b7131de13aca897b6ca808221d6b42a5bc37317f6ec75dab471406`
- `skyline-ice-ledge-compact.png` — `sha256-c3e92bab319a43a4f792eb25f60a6b0d4efa535debda78ac59805645547957d6`

The kit is project-original output and is released by the project under
CC0-1.0. It does not imitate a named game, franchise, character, or artist.
The final sheet was generated on a chroma-green correction field and cropped
into three equal source rows. Deterministic ImageMagick chroma removal
(`-fuzz 18% -transparent #00ff00 -trim`) created the retained alpha PNGs.

## Final kit prompt

```text
Create a clean game-asset sprite sheet on one perfectly uniform flat chroma green background, exact solid RGB #00FF00 edge-to-edge. Arrange exactly THREE separate premium stylized low-poly 3D floating ice-platform island sprites in three equal horizontal rows, one island centered per row, with generous green padding and absolutely no overlap between rows. Every island is viewed straight from the side, extends horizontally, has a broad flat snow-covered traversable top edge, and a substantial irregular dark cobalt faceted rock-and-ice underside with small icicles. Row 1: long sturdy ledge, about 3.5:1 width-to-height. Row 2: medium broken crag ledge, about 2.7:1. Row 3: compact asymmetric stepping island, about 2.2:1. Crisp low-poly facets, deep navy/cobalt rock, icy cyan rim highlights, pale blue-white snow, tiny restrained warm coral mineral accents, polished premium indie side-scroller art, coherent with an arctic relay runner and a cobalt mountain valley. Consistent lighting from upper left and consistent side-view perspective. No characters, no creatures, no objects on top, no trees, no signs, no pickups, no rings, no text, no labels, no borders, no frames, no UI, no shadows cast onto the green, no glow halo, no gradient, no texture or variation in the green background, no watermark.
```

## Chroma correction prompt

```text
Preserve the exact three ice-platform island designs, their positions in three separate horizontal rows, shapes, low-poly facets, snow, icicles, coral mineral accents, scale, lighting, and side-view orientation. Replace every pixel of the dark studio background, gradients, glows, and shadows outside the islands with one perfectly uniform flat chroma green field, exact solid RGB #00FF00 edge-to-edge. No gradient, no texture, no vignette, no checkerboard, no shadow, no halo, no added object, no text, no labels, no frames, no UI, no watermark. Keep the three islands separated in the same three rows with generous green padding.
```
