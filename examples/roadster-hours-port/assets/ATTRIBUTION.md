# Roadster Hours port: generated (Meshy) assets

Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism (`/v1/meshy/openapi/`), from original text prompts that describe each object in our own words (no image-to-3D, no reference to any original game's art). Ownership and commercial-use terms are those of the account's Meshy plan at generation time; the assets are **not** CC0 and no exclusivity is claimed (`rights.json` basis per model). Models were remeshed by Meshy to a game triangle budget (traffic vehicles about 3-4k triangles, props 2.5-6k, the hero roadster about 37k), baked by `tools/bake-meshy.mjs` into binary geometry (`assets/meshy/<key>.bin`) plus a 1024 px base-colour JPEG (`assets/meshy/<key>.jpg`, sha256 in `meshy.baked.ts`).

| key | role | prompt | preview task | refine task | triangles | texture |
| --- | --- | --- | --- | --- | --- | --- |
| roadster | player roadster | a sleek two-seat open-top coastal sports roadster, low wide stance, glossy deep teal paint with a cream racing stripe, chrome trim, four wheels, no driver, stylised realistic game vehicle, clean topology | 01a169cd-b349-72d6-b9eb-20d3a1fab578 | 01a169d0-0106-76f3-ad94-5231c4797dd4 | 37236 | roadster.jpg |
| sedan | traffic vehicle | a compact four-door family sedan, soft rounded 1990s styling, pale silver paint, dark tinted windows, four wheels, stylised realistic game vehicle | 01a169ce-b763-76ab-9dd3-7726beaf48ab | 01a169d0-068e-7031-a2e7-7fdef79165d9 | 3554 | sedan.jpg |
| hatch | traffic vehicle | a small three-door hatchback, bright red paint with a white roof, four wheels, stylised realistic game vehicle | 01a169cd-b357-73a0-aa74-88e168974065 | 01a169d1-28b6-7502-8d3b-2155896396e8 | 3012 | hatch.jpg |
| suv | traffic vehicle | a boxy off-road SUV with a roof rack, sage green paint, four wheels, stylised realistic game vehicle | 01a169ce-bcae-70b2-b494-da72dd1de420 | 01a169d0-dfb8-776f-a81e-dd7d2c0247d1 | 3280 | suv.jpg |
| pickup | traffic vehicle | a rugged single-cab pickup truck with an open cargo bed, faded mustard yellow paint, four wheels, stylised realistic game vehicle | 01a169ce-2df9-7593-a84b-c3fecadae9ea | 01a169d2-f64f-71a7-bc5d-24681db0a468 | 3423 | pickup.jpg |
| bus | traffic vehicle | a long city coach bus, cream and orange two-tone paint, large side windows, stylised realistic game vehicle | 01a169ce-9535-730a-a3a1-a4de18a74726 | 01a169d2-ff03-75bb-8a7d-a39a46276f9f | 4287 | bus.jpg |
| boxtruck | traffic vehicle | a white delivery box truck with a blue stripe, separate cab and rectangular cargo box, stylised realistic game vehicle | 01a169d4-be41-70a5-9d18-97a9936ab524 | 01a169d6-d763-7259-a146-aaf9bd6efdc9 | 3526 | boxtruck.jpg |
| lighthouse | scenery | a tall coastal lighthouse tower with red and white stripes, gallery balcony and glass lantern room on a stone base, stylised game prop | 01a169d4-0382-771e-9f12-fc4bc0f260f6 | 01a169d4-b968-7715-9470-9ab7e9d2bb04 | 5956 | lighthouse.jpg |
| villa | scenery | a single small Mediterranean villa, building only, terracotta tile roof, warm cream plaster walls, green wooden shutters, flat bottom edge, no rocks, no terrain, no cliff, no stairs, no base, isolated building, stylised game building | 01a169e7-8106-71b5-99ec-897176fe9409 | 01a169ea-6dcf-754a-92c4-b1b4405d451b | 3086 | villa.jpg |
| townhouse | scenery | a two-storey seaside townhouse with a flat roof and a small balcony, sun-bleached pastel blue plaster walls, stylised game building | 01a169d5-6e58-70ff-b968-1e915e47b766 | 01a169d6-f02f-7433-ad4b-a697fc45ced5 | 2610 | townhouse.jpg |
| palm | scenery | a coastal palm tree with a gently curved trunk and full green fronds, stylised game prop | 01a169db-d76f-74fa-bec2-7fca9f3d9e55 | 01a169e0-2661-729b-9550-a5f95ed1a07a | 4083 | palm.jpg |
| pine | scenery | a tall coastal pine tree with dark green layered foliage, stylised game prop | 01a169d8-b350-75f1-8304-9752db6982bb | 01a169db-401e-7101-90be-300ebd53bd2c | 3808 | pine.jpg |
| boulders | scenery | a cluster of weathered sandstone boulders in warm orange-brown tones, stylised game prop | 01a169e4-ce0f-7559-9046-1af095d825f8 | 01a169e6-7938-76be-9ee2-95eadeaea611 | 2573 | boulders.jpg |

Credits are tracked by the program-wide ledger (`/tmp/meshy/ledger.jsonl`, tag `roadster`); this port's total is recorded in `PORTING-NOTES.md`. The first villa preview (a house on a rock plinth) was rejected and regenerated with a sharper prompt; its task ids are in the same ledger.

## CC0 surface detail (GU47 RH47-10)

| file | source | licence | maps used |
| --- | --- | --- | --- |
| detail/asphalt.jpg | ambientCG Asphalt033, 1K-JPG (https://ambientcg.com/a/Asphalt033) | CC0-1.0 | Color (luminance), NormalGL |
| detail/limestone.jpg | ambientCG Rock063, 1K-JPG (https://ambientcg.com/a/Rock063) | CC0-1.0 | Color (luminance), NormalGL |
| detail/sandstone.jpg | ambientCG Rock064, 1K-JPG (https://ambientcg.com/a/Rock064) | CC0-1.0 | Color (luminance), NormalGL |

Packed to 512 px by `tools/pack-detail.mjs` (R = luminance detail re-centred on 0.5, G/B = normal x/y); sha256 and download urls in `detail/detail.json`. Found with `aura3d assets resolve "<need>" --role texture --dry-run` (ambientCG rung), downloaded at 1K instead of the suggested 2K to stay inside the texture budget.
