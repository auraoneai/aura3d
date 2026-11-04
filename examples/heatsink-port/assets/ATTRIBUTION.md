# HEATSINK port: Meshy-generated models (2026-10-23)

All models are generated from original text prompts through the AuraOne Meshy account via Kiro Prism (no image-to-3D, no reference to the original game's assets or names). Rights basis: the account's Meshy plan terms at generation time (see `provenance/<name>.rights.json`); no CC0 or exclusivity claim is made. Optimised with `/tmp/meshy/optimize.mjs` (dedup, weld, simplify, 1024 px textures), admitted with `aura3d assets import-meshy` and checked with `assets validate --require-license` (failures: none).

| File | Prompt | Preview / refine task | Vertices | Size |
| --- | --- | --- | --- | --- |
| `models/drone2.glb` | a compact quad-rotor racing drone seen as a game vehicle: a central copper-orange body with a small dark cabin dome, a dark gunmetal X-shaped frame with four arms, a round motor pod at the end of each arm, no propeller blades, a thin glowing cyan accent strip along the body, two rear thruster nozzles, symmetrical, hard-surface sci-fi, PBR | 01a16a1f-2830-7648-b3fb-1a50d05e1884 / 01a16a1f-dac2-749b-9791-8944a7ba669e | 39,761 | 1.9 MB |
| `models/barrel.glb` | an industrial hazard fuel barrel, rust-orange painted steel with dented dark bands and a glowing orange warning stripe, sci-fi game prop, PBR | 01a169cd-0ba9-77a6-bf29-0c9aad63f332 / 01a169d8-e053-7072-9dde-a2ed7f007d3f | 13,958 | 0.9 MB |
| `models/pickup-shield.glb` | a floating energy cell pickup, glowing cyan crystal octahedron held inside a thin dark metal cage frame, sci-fi game collectible, emissive, PBR | refine 01a169cd-a0f2-75a8-bf15-bd42d6a4179a | 15,306 | 1.1 MB |
| `models/pickup-repair.glb` | a floating repair module pickup, a glowing mint-green crystal core wrapped by a ring of dark metal fins, compact sphere shaped, sci-fi game collectible, emissive, PBR | 01a169e2-d7c3-7440-ac39-82158856bc33 / 01a169e4-77c8-73c2-b7ee-66d7ead4134d | 25,155 | 1.5 MB |
| `models/pylon.glb` | a tall slender sci-fi race gate pylon, dark alloy column with vertical glowing cyan light strips and a pointed cap, PBR | 01a169db-ea10-74ae-b908-f9f5a31f0d10 / 01a169dc-8cae-763c-b675-9e0057287750 | 14,297 | 1.1 MB |
| `models/plant-cap.glb` | an alien bioluminescent mushroom tree, tall dark stalk with a wide glowing teal cap and small hanging tendrils, stylised sci-fi flora, PBR | 01a169cd-52ff-71fe-a680-7078e9e8ce3b / 01a169d2-5a87-763a-9d96-73eddb962526 | 22,566 | 1.4 MB |
| `models/plant-coral.glb` | an alien spiral coral plant, twisting violet branches with glowing cyan tips, stylised sci-fi flora, PBR | refine 01a169ce-9c0a-7409-bea5-666eae36c4e3 | 20,646 | 1.3 MB |
| `models/ruin-monolith.glb` | a broken tall monolith with a cracked top and glowing orange rune lines, weathered dark stone, alien ruins, PBR | 01a169cd-ddfe-7283-9f8b-ebcf09c179d9 / 01a169d9-ddd5-77a5-93c2-0770dfc41657 | 19,628 | 1.2 MB |
| `models/ruin-arch.glb` | a ruined ancient stone arch fragment, weathered dark grey stone with faint glowing cyan glyph lines, alien desert ruins, PBR | 01a169e0-4435-7744-a133-6725941a1601 / 01a169e0-e446-7726-a087-2e5375cd213b | 18,765 | 1.0 MB |

Total about 11.4 MB. The refine texture prompts for drone, barrel, plant-cap and monolith steered the palette (copper/gunmetal/cyan, rust-orange, violet/teal, dark stone/orange runes).

A first drone candidate (sleek wedge hover-craft, preview 01a169cc-5fec-76b4-bd5b-ba1aa13a204a, refine 01a169d0-cdd9-70fa-bc52-c5b46657abeb, 40 credits) was rejected: the design judge noted the original's vehicle is a quad-rotor drone, so it was regenerated; the raw file stays in the ignored `artifacts/meshy/` and is not shipped. The generated rotor blades are static.

## Low-quality set (`models-lite/`, 2026-10-29)

Derived from the files above by `provenance/make-lite.mjs` (glTF-Transform dedup, weld, meshopt simplify, 512 px JPEG maps): same prompts, same rights basis, same bounds (largest bounds change 0.0008 m on the drone). Drone 15,046 triangles (from 55,732), pickup-repair 20,380, plant-cap 14,476, plant-coral 18,750; the rest keep their triangles. 6.4 MB in total against 11 MB. Loaded only at `quality: "low"`.

## GU47 WP-36 (2026-10-31)

- `models/heatsink_port_ionSentryDrone.glb`: the strike sentry (IC-13). Meshy text-to-3d refine task `01a18c0c-f682-7213-86b2-e5932dbd101f` (10 credits), generated 2026-10-30 by the WP-36 pipeline through Kiro Prism from the plan prompt in `docs/prds/game-upgrades-47/lanes/wp36-plan.json` (key `ionSentryDrone`). Simplified 75,644 to 9,076 triangles with 1024 px JPEG maps (glTF-Transform weld, meshopt simplify, textureCompress), then admitted with `aura3d assets import-meshy --into examples/heatsink-port/assets --prefix heatsink-port --name ionSentryDrone --profile prop` (`provenance/heatsink_port_ionSentryDrone.{meta,rights}.json`). Rights are the same Meshy plan terms as above; not CC0, and no exclusivity is claimed.
- `models-lite/heatsink_port_ionSentryDrone.glb`: the same source simplified to 6,004 triangles with 512 px maps, for `quality: "low"`.

## GU47 wave 2 (2026-11-03)

- `models/heatsink_port_ionHeavyDrone.glb`: the heavy strike target (IC-13). Meshy text-to-3d refine task `01a1a4c7-218c-74a5-a439-52fd52c23ae7` (10 credits), generated 2026-11-03 by the WP-36 pipeline through Kiro Prism from an original text prompt (key `ionHeavyDrone`). Simplified 75,712 to 14,998 triangles with 1024 px maps (glTF-Transform weld, meshopt simplify, textureCompress), admitted in isolation with `aura3d assets import-meshy` (`provenance/heatsink_port_ionHeavyDrone.{meta,rights}.json`). The CLI's `vehicle-parts` route blocker (wheel-like geometry) does not apply: the model is a hovering strike target with no wheels, wheel/body separation or collider (hit radius stays `STRIKE.radius.heavy`). Rights are the same Meshy plan terms as above; not CC0, and no exclusivity is claimed.
- `models-lite/heatsink_port_ionHeavyDrone.glb`: the same source at 7,998 triangles with 512 px maps, for `quality: "low"`.
