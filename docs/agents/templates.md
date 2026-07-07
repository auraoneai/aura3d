# Template Selection

Current `create-aura3d` templates: `product-viewer`, `cinematic-scene`,
`mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`,
`animation-channel`, `prompt-animation-channel`, `animation-studio`,
`episode-builder`, `character-controller`, `three-compat-premium-product-viewer`,
`three-compat-architecture-interior`, `three-compat-material-authoring`,
`three-compat-asset-inspector`, `three-compat-character-viewer`,
`three-compat-postprocess-scene`, `three-compat-custom-threejs-migration`, and
`three-compat-large-scene`.

- `product-viewer`: product pages, asset viewers, configurators, hero objects.
- `cinematic-scene`: dolly camera, stylized lighting, rain, fog, bloom, timeline.
- `mini-game`: playable platformer-style starter on the public
  `game.platformer(...)` kit. It proves typed asset import, keyboard movement,
  jump, scoring, reset, HUD/event evidence, and screenshot gates for a starter.
  Do not use it as proof of production art, skinned animation, racing,
  falling-block, or commercial game quality.

Template routes are not allowed to hide missing engine features behind primitive
slop. Object-focused, character-focused, vehicle-focused, and world-focused
templates must acquire real assets through the Aura3D CLI, import generated
`assets` from `./src/aura-assets`, and render with `model(assets.x)`. Primitives
are permitted for layout, collision helpers, gauges, debug panels, or minor set
dressing only.

Every public template needs:

- route-health evidence with claimed renderer mode, fallback mode, primary
  assets, primitive count, and claim boundary;
- one desktop and one mobile screenshot checked by pixel analysis;
- source validation for raw string assets, raw GLB/glTF URLs, `unsafeModelUrl`,
  `GLTFLoader`, direct `three` imports, and CSS/DOM scene effects;
- keyboard/input tests when the template is interactive or game-like.

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
- `character.lowPolyHumanoid({ clip: "benchmark-pose", showJoints: false, motionTrail: false })`
  for the bundled authored neutral-human walk-cycle benchmark default. Enable
  `showJoints: true` only for explicit rig-debug shots, not final screenshots.
- `prefabs.dataBars3D({ grid: 6 })` for bar geometry, top caps, axes, labels,
  grounded legend, bloom, and hover-ready analytics scenes. Add DOM title, axis,
  tick, and readout text for benchmark data-viz prompts.
- `prefabs.neonTunnel({ rings: 24 })` for receding emissive rings, wall chords,
  perspective rails, reflections, fog, bloom, sparks, particles, and inside-tube
  dolly flythrough scenes.

All MVP templates should include `npm run dev`, `npm run build`,
`npm run test`, `tests/route-health.spec.ts`, and `tests/screenshot.spec.ts`.
If a template lacks those checks, classify it as `prototype` or `blocked`; do
not market it as production-ready.
