# Template Selection

- `product-viewer`: product pages, asset viewers, configurators, hero objects.
- `cinematic-scene`: dolly camera, stylized lighting, rain, fog, bloom, timeline.
- `mini-game`: small interactive or game-like scenes with primitives and input.

Prompt-family helpers are available from `prefabs` even when a full template is
not a perfect fit:

- `prefabs.particleFountain(...)` for high-density VFX and fountain prompts.
- `prefabs.cityBlock(...)` for architecture, streets, sidewalks, crosswalks,
  lit window columns, storefront awnings, street lights, traffic, vehicles, and
  in-frame day/night state markers. Real day/night controls must change the
  scene, not just button text.
- `prefabs.materialSwatches()` for metal, glass/transmission, rubber, emissive,
  and clearcoat comparison scenes with built-in reflection/contrast cards.
- `prefabs.productViewer(assets.product)` for typed product plinths, softboxes,
  contact shadows, turntable/orbit cues, and clean three-quarter inspection
  scenes. Use `prefabs.productStage({ style: "inspection" })` when explicit fit
  brackets are required.
- `prefabs.physicsRamp()` for visible rigid-body ramp/cube demo cues.
- `prefabs.solarSystem({ labels: "attached" })` for six-planet systems with
  orbit paths, sun bloom, starfield depth, and attached readable labels.
- `character.lowPolyHumanoid({ showJoints: true, motionTrail: true })` for
  connected primitive walk-cycle placeholders with joint and stride cues. The
  walk clip keeps primitive limbs connected by using whole-body motion.
- `prefabs.dataBars3D({ grid: 6 })` for bar geometry, top caps, axes, labels,
  grounded legend, bloom, and hover-ready analytics scenes. Add DOM title, axis,
  tick, and readout text for benchmark data-viz prompts.
- `prefabs.neonTunnel({ rings: 24 })` for receding emissive rings, wall chords,
  perspective rails, reflections, fog, bloom, sparks, particles, and inside-tube
  dolly flythrough scenes.

All MVP templates include `npm run dev`, `npm run build`, `npm run test`,
`tests/route-health.spec.ts`, and `tests/screenshot.spec.ts`.
