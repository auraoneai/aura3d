# Asset provenance: Where the Wind Wanders port

Every model here was generated on 2026-10-23 from an original text prompt (no image-to-3D, no input from the original game's art) with Meshy, called only through Kiro Prism. Ownership and commercial-use terms are those of the AuraOne Meshy account plan at generation time (see `provenance/*.rights.json`); no CC0 or exclusivity claim is made. Task ids are in `provenance/*.meta.json` (signed URLs stripped). Optimised with meshopt (`/tmp/meshy/optimize.mjs`: weld, simplify, textures resized, EXT_meshopt_compression).

| Key | Role | Prompt (own words) | Meshy ops | Final size / verts |
| --- | --- | --- | --- | --- |
| `hero` | traveller (rigged, Idle/Walk/Run) | a lone wanderer in a long hooded travelling cloak with a long trailing scarf, satchel on one hip, sturdy boots, calm friendly stylised storybook character, hand-painted look, warm earthy palette of moss green cloak and cream scarf, standing in a neutral A-pose | text-to-3d preview+refine, remesh 12k, rig, animate (Idle) | 3.97 MB / 18,420 |
| `cottage` | two cottages | a small timber-framed cottage with cream plaster walls, steep terracotta tile roof, a stone chimney, small flower boxes under the windows and ivy on one side | preview+refine | 2.70 MB / 54,012 |
| `pine` | 535 instanced pines | a tall stylised pine tree with layered jagged skirts of deep green needles and a slim brown trunk | preview+refine, remesh 1.2k | 0.95 MB / 2,134 |
| `oak` | 127 instanced round trees | a broad round-crowned old oak tree with a thick gnarled trunk and a full canopy of layered leaf clusters in fresh spring greens | preview+refine, remesh 2.2k | 1.05 MB / 3,515 |
| `shrub` | garden shrubs by the cottages | a rounded flowering garden shrub with dense green leaves and small pink and white blossoms | preview+refine, remesh 1.2k | 0.99 MB / 1,388 |
| `stones` | two standing-stone landmarks | a small circle of three weathered standing stones with moss and lichen, rough grey granite | preview+refine | 1.11 MB / 19,286 |
| `belltower` | the bell frame | a small open timber bell frame on a stone base with a brass bell hanging inside, steep shingled roof, rope pull | preview+refine | 1.64 MB / 31,852 |
| `letter` | the three letters | a cream-coloured sealed envelope with a red wax seal and a faint golden edge, flat paper letter | preview+refine | 0.91 MB / 15,840 |
| `boat` | the epilogue boat | a small wooden rowing boat with a single mast and a cream sail, steel-blue painted hull with cream trim | preview+refine | 1.55 MB / 25,988 |
| `wisp` | companion wisp | a small friendly floating spirit companion, a glowing violet teardrop-shaped wisp with a soft translucent tail and two tiny bright eyes | preview+refine | 0.84 MB / 17,218 |

Also generated but not used: a jetty pier (the procedural jetty is tied to the simulation's walkable gaps), a windmill (the procedural windmill carries the animated sails), a post lantern, and probe animation clips (three run variants, 9 credits).
