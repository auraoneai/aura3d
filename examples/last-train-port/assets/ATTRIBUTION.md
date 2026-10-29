# Asset attribution

None of these comes from the original game. Three kinds of file ship with this port:

1. Licensed Aura3D catalog assets (windmill, watchtower) and a CC0 sky HDRI.
2. Meshy-generated models (below): original text prompts only (never image-to-3D, never the original's names or art), generated through Kiro Prism on the AuraOne Meshy account on 2026-10-23, optimised with meshopt and 256 to 1024 px textures (the tram was cut from 2048 px and the passengers and townhouses decimated in the 2026-10-29 audit fix D-09), admitted with `aura3d assets import-meshy` in an isolated project and validated (`failures: []`). Rights basis is the account's Meshy plan terms at generation time (`assets/provenance/*.rights.json`); not CC0, no exclusivity claimed. Prompts are summarised here; full task metadata is in `assets/provenance/*.meta.json`.
3. Everything else (islands, ground, track, bushes, stalls, folk, weather) is generated in code.

| File | Source | License |
| --- | --- | --- |
| windmill.glb | Aura3D catalog `gullsiegeWindmillMeshy` (`public/aura-assets/gullsiegeWindmillMeshy.f4ebca18.glb`, Meshy-generated, admitted to the catalog) | licensed for use with the engine |
| tower.glb | Aura3D catalog `gullsiegeWatchtowerMeshy` (`public/aura-assets/gullsiegeWatchtowerMeshy.546ee761.glb`, Meshy-generated, admitted to the catalog) | licensed for use with the engine |
| sky.hdr | Poly Haven `kloppenheim_06_puresky` (1k), `public/hdri/kloppenheim_06_puresky_1k.hdr` | CC0-1.0 |
| meshy/tram.glb | Meshy text-to-3d (preview 01a169cc-e116-74ef-aebc-c2e008f7e650, refine 01a169ce-653a-74a8-9726-6e275c65ff8d): "open-sided vintage seaside tram car, early 1900s European style, cream and deep red livery, rounded arched roof with teal trim and brass rails and headlamps, wooden slat benches visible through the open sides, long and narrow" | Meshy account plan terms at generation time |
| meshy/pax-easy.glb | Meshy text-to-3d (preview 01a169cc-f9c1-74a7-98ee-64556acd16e0, refine 01a169cf-12c5-759a-809a-36a3b5e0f0ce): "relaxed middle-aged traveller in a mustard-yellow jacket and flat cap, sitting pose, full body" | Meshy account plan terms at generation time |
| meshy/pax-sightseer.glb | Meshy text-to-3d (preview 01a169cf-7249-70e1-a6dc-2cd21f5264e0, refine 01a169d0-3181-76a3-85d4-14d841e1f891): "cheerful young tourist in a teal coat with a satchel and a small camera, full body" | Meshy account plan terms at generation time |
| meshy/pax-rushed.glb | Meshy text-to-3d (preview 01a169cf-dda0-76d8-99a3-dde2e09ec6f4, refine 01a169d0-ae2b-7100-a6b9-79998211ee57): "tense commuter in a bright red coat holding a briefcase, full body" | Meshy account plan terms at generation time |
| meshy/pax-sleeper2.glb | Meshy text-to-3d (preview see meta, refine see meta): "drowsy standing passenger in a periwinkle blue sweater and grey trousers, eyes closed, flat cap tipped low, no chair (second attempt; the first showed a chair)" | Meshy account plan terms at generation time |
| meshy/house-cream.glb | Meshy text-to-3d (preview 01a169d0-2126-7597-9983-89134692f123, refine 01a169d1-77a0-721a-9966-9a294ab2d294): "narrow four-storey terraced seaside townhouse, painted cream plaster, green wooden shutters, arched ground-floor door, iron balconies, terracotta tile roof with a chimney" | Meshy account plan terms at generation time |
| meshy/house-ochre.glb | Meshy text-to-3d (preview 01a169d1-36f2-70b6-a9cc-cc87c0ca3fbe, refine 01a169d2-9963-75d3-85fb-0165f3f8d1e1): "narrow four-storey terraced townhouse, warm ochre plaster, blue shutters, shop window with a striped awning, slate roof with a dormer" | Meshy account plan terms at generation time |
| meshy/house-blue.glb | Meshy text-to-3d (preview 01a169d1-b3e0-735b-bf03-a6f824aef952, refine 01a169d3-1be8-731e-b0bb-57e6992bc216): "narrow five-storey terraced townhouse, pale sea-blue plaster, red shutters, wrought iron window boxes, stepped gable top" | Meshy account plan terms at generation time |
| meshy/clock-tower.glb | Meshy text-to-3d (preview 01a169d3-7ccc-77ef-aa8c-ed79b66bedb2, refine 01a169d4-31b2-7442-92b5-0ff6b131c73e): "tall stone town-hall clock tower, four clock faces, arched belfry, pyramid slate roof with a gold weathervane" | Meshy account plan terms at generation time |
| meshy/lighthouse.glb | Meshy text-to-3d (preview 01a169d3-ee50-7666-a0cc-7e0d6dda65e6, refine 01a169d4-7cc1-742a-811c-9d5a3c29d690): "slim coastal lighthouse, red and white bands, round gallery with iron railing, glass lantern room, keeper cottage at the base" | Meshy account plan terms at generation time |
| meshy/crates.glb | Meshy text-to-3d (preview 01a169d4-e36d-70bc-8bed-920278206f45, refine 01a169d5-f860-75db-a8b3-5fce1711409f): "stack of weathered wooden harbour crates and two barrels with iron hoops, coiled rope on top" | Meshy account plan terms at generation time |
| meshy/lamp.glb | Meshy text-to-3d (preview 01a169d5-7e35-7134-a8c7-ba30788da9b2, refine 01a169d6-0545-74b9-a38b-8d48fc3efbff): "cast-iron Victorian street lamp post, dark green, scrolled bracket, glass lantern" | Meshy account plan terms at generation time |

Total about 19 MB.
