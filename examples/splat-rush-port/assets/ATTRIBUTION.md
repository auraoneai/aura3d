# Splat Rush port: asset attribution

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
- `models/*.glb`: generated with Meshy through Kiro Prism from original text prompts (no image input, no reference frames),
  then optimised (meshopt, 1024 px textures; re-encoded on 2026-10-29 to 512 px for the backdrop and 256 px for the pickups, geometry unchanged) and admitted with `aura3d assets import-meshy` / `assets validate --require-license`
  (all `failures: []`). Rights basis (`provenance/*.rights.json`): ownership and commercial-use terms are those of the AuraOne
  Meshy plan at generation time (2026-10-23); not CC0, no exclusivity claimed. Meshy task ids are in `provenance/*.meta.json`.

| File | Role | Prompt (own words) | Refine task id | Size | Verts |
| --- | --- | --- | --- | --- | --- |
| island-tree.glb | backdrop | small floating sky island, chunky cartoon toy style, grassy top with one round puffy tree and two small rocks, rounded cream and lavender stone underside, pastel, glossy | 01a169cf-b3d2-7731-a34a-779acaf22525 | 0.67 MB | 14.3k |
| island-tower.glb | backdrop | floating sky island with a cute round cartoon tower, conical lavender roof, tiny flag, toy style, pastel | 01a169d1-42b2-749d-8fde-528865d8e0bf | 1.2 MB | 23.7k |
| balloon.glb | backdrop | cute cartoon hot air balloon, pastel red/yellow/blue stripes, tiny wicker basket, toy style | 01a169d2-ff73-71a2-bb07-097bc67d0348 | 1.1 MB | 26.1k |
| gem-rainbow.glb | pickup `rainbow` | glossy candy-like faceted star gem, swirling rainbow pastels, small gold ring base | 01a169d6-d72f-77d4-82ad-22104349745f | 0.45 MB | 10.2k |
| gem-shield.glb | pickup `shield` | glossy cyan shield-shaped badge token, rounded white border, small star | 01a169d7-9d78-70b6-9979-7a1d0ce9c008 | 0.42 MB | 9.9k |
| gem-double.glb | pickup `x2` | chunky shiny golden coin token with a bold star emblem on both faces | 01a169d9-538d-7657-ac44-763ebd3d0566 | 0.46 MB | 11.2k |
| gem-switch.glb | pickup `switch` | glossy chunky pastel teal round token with two curved arrows in a swap loop | 01a169da-e9e9-7644-8158-bc3cacba5984 | 0.45 MB | 10.6k |
