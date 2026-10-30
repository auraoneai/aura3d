# Iron Crown floor detail maps (GU47 IC47-M1)

All files are CC0 1.0 (ambientCG), derived from archives already in this repository (`assets/library/textures/tiling/`);
no generation, no download. Each map was extracted from its archive and re-encoded with `cwebp -q 90 -resize 512 512`
(normal) or `cwebp -q 85 -resize 256 256` (roughness) on 2026-10-30. Only detail maps ship: the venue's floor colour
stays the look row's authored colour (`game/look.ts` `floor`).

| File | Venue | Source archive (sha256) | Source member | Bytes | sha256 |
|---|---|---|---|---|---|
| ic-obsidian-normal.webp | Crown Arena | acg-tiles141.zip (6ee56eba21592b9c02c6ee78dd93c6b585b62a2558d143d53e19457c82379d52) | Tiles141_1K-JPG_NormalGL.jpg | 4316 | 04e486f2d162e3516b50917f5e16f3ed07994129ed9accf7672e14092adf0949 |
| ic-obsidian-roughness.webp | Crown Arena | same | Tiles141_1K-JPG_Roughness.jpg | 6008 | 14b8a61b7c1eb26742fa8c42e83f305e92d1e9625344ad4b9c97b76405b3808d |
| ic-wetconcrete-normal.webp | Neo-Tokyo Rooftop | acg-concrete034.zip (5839d284d94ffb8d2a56df742ec522b13dd311c52dbd42b8fd33f0409ceedb81) | Concrete034_1K-JPG_NormalGL.jpg | 67338 | 2ec7e237313752ffc8108fb6fcc5c411b4e8d013e90d2083eb7a17fc31f877da |
| ic-wetconcrete-roughness.webp | Neo-Tokyo Rooftop | same | Concrete034_1K-JPG_Roughness.jpg | 5722 | f05c9905ddaa235948577e3b0d1938babdb9ddb92e91cdbaf0447cffe927dcb1 |
| ic-grit-normal.webp | Colosseum Ruins | acg-gravel043.zip (bca54835c7c71bea4b4b9f27fbef127d666fa1cf7de16f2b04f0ceb4294e784c) | Gravel043_1K-JPG_NormalGL.jpg | 118970 | 42f9ae85dc2e9f09aeedbf6f76c88a6ef212192d175ff6d0733c8d01319c55fd |
| ic-grit-roughness.webp | Colosseum Ruins | same | Gravel043_1K-JPG_Roughness.jpg | 18182 | 3c4eb18170cc9cd523d10f5a0191249b0a0033ac27518add4e2225208c279b9b |
| ic-slate-normal.webp | Cloudstep Monastery | acg-pavingstones151.zip (dcc3ce0f17ef6f94050d76bfbf64ece41487327f6de3e79d1eef349d4f6b0d7d) | PavingStones151_1K-JPG_NormalGL.jpg | 80106 | f8737eeab1d9bbb530262c6292f38083e5378ad2cf36ee53baa847bb95ff5d79 |
| ic-slate-roughness.webp | Cloudstep Monastery | same | PavingStones151_1K-JPG_Roughness.jpg | 22966 | 337ef489c21029eff36dae5dd9f14d46d14c789196455ce4a6f8aebfa6cb62b3 |

Total 323,608 bytes on disk. GPU: one venue's pair is mounted at a time (512^2 + 256^2 RGBA with mips, about 1.7 MB).
