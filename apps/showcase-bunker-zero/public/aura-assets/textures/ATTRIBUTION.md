# Bunker Zero surface textures (GU47 WP-21 BZ-04)

All files are CC0 1.0 (ambientCG, https://ambientcg.com, author ambientCG), taken from the Aura3D curated library zips
`assets/library/textures/tiling/acg-<id>.zip` (entries `acg-<id>` in `aura.library.json`, retrieved 2026-10-07).

| Files | ambientCG set | Library zip sha256 | Derivation |
| --- | --- | --- | --- |
| bz-concrete034-{color,normal}.jpg | Concrete034 | 5839d284d94ffb8d2a56df742ec522b13dd311c52dbd42b8fd33f0409ceedb81 | colour: `Concrete034_1K-JPG_Color.jpg` resized to 512 (`sips -Z 512 -s formatOptions 85`) and each channel scaled in linear light to mean 0.8, JPEG quality 88 (GU47 phase 3); normal: `_NormalGL.jpg` resized to half (`sips -Z 512 -s formatOptions 88`) |
| bz-bricks075a-{color,normal}.jpg | Bricks075A | ebbffc63ae79060d68378cddafd7d6b659bc3e062120785d5927773c51a33214 | same |
| bz-metal046b-{color,normal}.jpg | Metal046B | b4fc855a414f7a1e415af6edaef24c0dc114f7802b3879a3db88e6ba1c97cda0 | same |
| bz-paintedplaster017-{color,normal}.jpg | PaintedPlaster017 | bae0380d82b6ccac8943b4980417cb3c9de5c896218339c108056f1dfb8e886c | same |
| bz-wood096-{color,normal}.jpg | Wood096 | 3aa0d5cddd866f5993c03a1a9bb036c1f7e82695cdf40f765cbea9faf91684ef | same |
| bz-metal049a-{color,normal}.jpg | Metal049A | 4f6a79e535261ab55cc6feefed0037124885720ce7b781fc2efa3fa22792af42 | same |
| bz-tiles141-{color,normal}.jpg | Tiles141 | 6ee56eba21592b9c02c6ee78dd93c6b585b62a2558d143d53e19457c82379d52 | same |
| bz-concrete047a-{color,normal}.jpg | Concrete047A | 94e04bdf80c4fa377f8c736183963cdd911131a26673e2462495e45bf679102f | same |
| bz-metal063-{color,normal}.jpg | Metal063 | cc0a7f83d4bfd6c5d38638d17a0c214a004ccd295b8c554c959537bc278167ed | same |

File sha256, bytes and pixel sizes: `apps/showcase-bunker-zero/src/art/textures.ts` (`BZ_TEXTURE_FILES`), checked by
`tests/unit/bunker-zero/textures.test.ts`.
