# Template Selection

- `product-viewer`: product pages, asset viewers, configurators, hero objects.
- `cinematic-scene`: dolly camera, stylized lighting, rain, fog, bloom, timeline.
- `mini-game`: small interactive or game-like scenes with primitives and input.

Prompt-family helpers are available from `prefabs` even when a full template is
not a perfect fit:

- `prefabs.particleFountain(...)` for high-density VFX and fountain prompts.
- `prefabs.cityBlock(...)` for architecture, streets, crosswalks, lit window
  columns, and city scale.
- `prefabs.materialSwatches()` for metal, glass/transmission, rubber, emissive,
  and clearcoat comparison scenes with built-in reflection/contrast cards.
- `prefabs.productStage()` for product plinths, softboxes, contact shadows, and
  three-quarter inspection scenes.
- `prefabs.physicsRamp()` for visible rigid-body ramp/cube demo cues.

All MVP templates include `npm run dev`, `npm run build`, `npm run test`,
`tests/route-health.spec.ts`, and `tests/screenshot.spec.ts`.
