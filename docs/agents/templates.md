# Template Selection

- `product-viewer`: product pages, asset viewers, configurators, hero objects.
- `cinematic-scene`: dolly camera, stylized lighting, rain, fog, bloom, timeline.
- `mini-game`: small interactive or game-like scenes with primitives and input.

Prompt-family helpers are available from `prefabs` even when a full template is
not a perfect fit:

- `prefabs.particleFountain(...)` for high-density VFX and fountain prompts.
- `prefabs.cityBlock(...)` for architecture, streets, sidewalks, crosswalks,
  lit window columns, storefront awnings, street lights, traffic, vehicles, and
  in-frame day/night state markers.
- `prefabs.materialSwatches()` for metal, glass/transmission, rubber, emissive,
  and clearcoat comparison scenes with built-in reflection/contrast cards.
- `prefabs.productStage()` for product plinths, softboxes, contact shadows,
  turntable/orbit cues, fit-to-bounds brackets, reflection cards, and
  three-quarter inspection scenes.
- `prefabs.physicsRamp()` for visible rigid-body ramp/cube demo cues.
- `prefabs.solarSystem({ labels: "attached" })` for six-planet systems with
  orbit paths, sun bloom, starfield depth, and attached readable labels.
- `prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true })` for
  connected primitive walk-cycle placeholders with joint and stride cues.
- `prefabs.dataBars3D({ grid: 6 })` for bar geometry, top caps, axes, labels,
  callout, trend ribbon, bloom, and hover-ready analytics scenes.
- `prefabs.neonTunnel(...)` for octagonal emissive rings, perspective rails,
  reflections, fog, bloom, sparks, particles, and dolly flythrough scenes.

All MVP templates include `npm run dev`, `npm run build`, `npm run test`,
`tests/route-health.spec.ts`, and `tests/screenshot.spec.ts`.
