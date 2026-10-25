# Asset attribution

| File | Source | License |
| --- | --- | --- |
| sky.hdr | Poly Haven `kloppenheim_06_puresky` (1k), same file the Last Train port ships | CC0-1.0 |



## Generated models (`assets/models/*.glb`, Meshy text-to-3D through Kiro Prism, 2026-10-23)

Every model comes from an original text prompt written for this port (no image-to-3D, no frames or assets of the original game). Rights basis, from `assets/provenance/<key>.rights.json`: generated through the AuraOne Meshy account via Kiro Prism; ownership and commercial-use terms are those of the account's Meshy plan at generation time; **not CC0, no exclusivity claimed**. `assets/provenance/<key>.meta.json` holds the Meshy task record (signed URLs stripped). Every model was remeshed by Meshy (the `remesh` operation re-bakes clean UVs and textures; locally simplified versions showed texture smearing), then optimised with gltf-transform (dedup, weld, textures to 256-1024 px jpeg, normal maps kept only for the hypercar and the two landmarks, single primitive per model, geometry left unquantised); the five cars are additionally baked to face +z with their lowest point at y = 0 (`tools/crayon-capture/drift-and-deliver-bake-cars.mjs`), admitted with `aura3d assets import-meshy` and checked with `assets validate --require-license` (no failures). The hashes the app pins are in `models.ts` and checked against the files by `tests/unit/drift-and-deliver-port/models.test.ts`.

| key | role | prompt (gist) | Meshy text-to-3D refine task | Meshy remesh task | triangles |
| --- | --- | --- | --- | --- | --- |
| hypercar | player car | sleek black hypercar, low and wide, sharp aerodynamic body, gold accent line, dark rims, no driver | 01a169cd-9ba4 | 01a16a0d-f870 | 39.2k | Repainted 2026-10-25 by `tools/gridlock-car-retexture/retexture.mjs` (flat region materials, geometry untouched; `provenance/hypercar.repaint.json`).
| sedan | traffic | mid-size city sedan, rounded stylised proportions, deep blue | 01a169d1-7716 | 01a16a10-8c9d | 6.9k |
| hatch | traffic | compact red hatchback, short rounded body | 01a169ce-a35e | 01a16a12-3631 | 7.1k |
| van | traffic | boxy yellow city taxi-style minivan, black side stripe | 01a169d2-4957 | 01a16a13-e053 | 7.1k |
| truck | traffic | white delivery box truck, cream cargo box, small cab | 01a169ce-4e26 | 01a16a15-8391 | 8.6k |
| lamp | street furniture | cast iron street lamp, curved arm, warm glass lantern | 01a169d4-210e | 01a16a17-343a | 5.5k |
| signal | street furniture | traffic light on a slim grey pole, three round lamps | 01a169d5-a174 | 01a16a18-9272 | 3.9k |
| tree | street / park tree | rounded leafy tree, short brown trunk, layered canopy | 01a169d8-8fd3 | 01a169e3-8ca7 | 1.8k |
| palm | street / park tree | tall slender coastal palm, curved trunk | 01a169e8-4778 (from the refined palm) | 01a169e8-4778 | 2.7k |
| shelter | street furniture | glass and steel bus shelter, curved roof, bench | 01a169df-46cb | 01a16a1b-9809 | 5.1k |
| hydrant | street furniture | red cast iron fire hydrant with chains | 01a169e0-43dd | 01a16a19-f08a | 4.2k |
| clocktower | landmark | tall stone clock tower, pointed copper green roof, four lit clock faces | 01a169e5-0183 | 01a16a1d-6074 | 19.2k |
| lighthouse | landmark | white and red striped harbour lighthouse on a rocky base | 01a169e6-3970 | 01a16a1f-1dbb | 20.0k |
| watertank | rooftop prop | rooftop wooden water tank on a steel stilt frame, conical lid | 01a169e7-27e0 | 01a16a21-32ca | 5.8k |
| ped (not wired) | rigged walker | friendly stylised city pedestrian, olive jacket, dark jeans, A-pose | 01a169f0-01b4 | 01a169f3-9999 then rig 01a169f4-ee92 | 8.3k |

Generated models total about 16 MB (over the 10 MB new-asset guideline; the port's assets total about 17 MB); the sky HDRI is 1.2 MB. Everything else the port draws is painted or modelled in code (`textures.ts`, `city.ts`, `vehicles.ts` for the `?models=0` fallback); nothing comes from the original game.
