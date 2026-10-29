# Apex Overdrive: Meshy vehicle models (2026-10-23)

Generated through Kiro Prism from original text prompts (never image-to-3D, no original-game names). Admitted in isolated projects with `assets import-meshy` + `validate` (failures: none), then baked by `tools/apex/bake-vehicle.mjs` (long axis z, front toward -z, wheels on y = 0, centred). Rights basis: the AuraOne Meshy account plan terms at generation time (not CC0, no exclusivity claimed), recorded per asset in `provenance/<role>.rights.json`. Credits: 300 (10 models x 30, preview 20 + refine 10).

| Role | File | Meshy refine task | Prompt (prefix; every prompt ends with the common style clause) |
| --- | --- | --- | --- |
| hero | `hero.glb` | `01a16b11-9370-7535-a0de-9a127e60a607` | a sleek low-slung sports roadster with an open cockpit and dark tinted canopy, glossy pearl white body with a thin red racing stripe, wide stance, chunky low-profile tyres, twin rear thruster nozzles,  |
| sedan | `sedan.glb` | `01a16b12-009a-7491-b074-c8fc9895c2bf` | a plain four-door family sedan in pastel teal paint with simple mirrors and lights,  |
| hatch | `hatch.glb` | `01a16b0c-a775-7265-9898-5b8ef5b11935` | a compact three-door hatchback in warm yellow paint,  |
| suv | `suv.glb` | `01a16b0c-7d7c-77a9-bcc0-5ce203bee69d` | a boxy mid-size SUV with roof rails in deep metallic blue paint,  |
| taxi | `taxi.glb` | `01a16b0c-9348-718c-a71e-e7e4ea2a35c7` | a city taxi sedan in bright yellow with a roof sign and a black and white checker stripe,  |
| van | `van.glb` | `01a16b0e-03e4-7046-8171-e7dbd6caf39c` | a small delivery van with a sliding side door, light grey paint with an orange stripe,  |
| pickup | `pickup.glb` | `01a16b0e-27c2-76b9-a077-177e5d63cd6f` | a mid-size pickup truck with an open cargo bed in faded red paint,  |
| boxtruck | `boxtruck.glb` | `01a16b0f-029d-7386-a92b-70bbd3ca7e18` | a medium box delivery truck, cream coloured cargo container with a blue stripe and a dark blue cab,  |
| bus | `bus.glb` | `01a16b0f-8500-722f-a6e8-9f08ea020f5f` | a long city transit bus in two-tone blue and cream with large windows,  |
| carrier | `carrier.glb` | `01a16b0f-e090-770b-b5e5-0235bbdfde25` | a flat-bed car carrier truck with an orange cab, dark grey flatbed and a loading ramp at the rear,  |

Common style clause: `stylised game vehicle, clean readable silhouette, PBR materials, car facing forward, single object, no ground`.

## Far level of detail (2026-10-29)

`lod/<type>.far.glb` are derived from the nine traffic models above by `apps/showcase-roadster-rush/tools/make-far-lod.mjs`: meshoptimizer sloppy simplification to about 10% of the triangles (sedan 53,548 to 4,539; boxtruck 43,690 to 4,009) and textures downscaled to 256 px JPEG. `lod/skycar.far.glb` is made the same way from the sky-lane car `public/aura-assets/roadsterRushSkyCar.295dcba7.glb`, which only this game uses (58,378 to 5,549 triangles). Same rights basis as the source models; no new Meshy credits. The renderer draws traffic and sky cars beyond 90 m with them.
