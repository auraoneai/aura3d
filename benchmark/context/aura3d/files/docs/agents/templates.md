# Template Selection

- `product-viewer`: product pages, asset viewers, configurators, hero objects.
- `cinematic-scene`: dolly camera, stylized lighting, rain, fog, bloom, timeline.
- `mini-game`: small interactive or game-like scenes with primitives and input.

Prompt-family helpers are available from `prefabs` even when a full template is
not a perfect fit:

- `prefabs.particleFountain(...)` for high-density VFX and fountain prompts.
- `prefabs.cityBlock(...)` for architecture, streets, windows, and city scale.
- `prefabs.materialSwatches()` for metal, glass/transmission, rubber, emissive,
  and clearcoat comparison scenes.
- `prefabs.productStage()` for product plinths, softboxes, contact shadows, and
  orbit-ready inspection scenes.
- `prefabs.physicsRamp()` for visible rigid-body ramp/cube demo cues.
- `prefabs.physicsPlayground({ cubes: 50 })` for visible falling-cube/ramp
  playground evidence with contact vectors.
- `prefabs.dataBars3D({ grid: 6 })` for 6x6 animated bar-chart geometry.
- `prefabs.neonTunnel(...)` for emissive tunnel/flythrough scenes.
- `prefabs.miniGolfHole()` for green/obstacle/ball/aim/hole game prompts.
- `prefabs.primitiveHumanoid()` for primitive walk-cycle placeholder scenes.

All MVP templates include `npm run dev`, `npm run build`, `npm run test`,
`tests/route-health.spec.ts`, and `tests/screenshot.spec.ts`.
