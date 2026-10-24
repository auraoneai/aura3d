# Template selection

`npx create-aura3d@latest <dir> --template <name>` scaffolds one of 20 templates (list is `CREATE_AURA3D_TEMPLATES` in `packages/create-aura3d/src/index.ts`). Pick by what you are building, then follow the matching skill. Start from a template, then `sceneKits.*`, then `prefabs.*`; use `primitives.*` last, for set dressing only.

## Scenes and viewers

| Template | Use it for |
| --- | --- |
| `product-viewer` | Product pages, asset viewers, configurators, hero objects (typed asset, plinth, softboxes, orbit). |
| `premium-product-viewer` | A product viewer with the fuller production look and checks. |
| `cinematic-scene` | Prompt-plan cinematic scene: dolly camera, stylised lighting, rain, fog, bloom, timeline. |
| `character-viewer` | Inspecting a rigged character. |
| `asset-inspector` | Inspecting an admitted GLB (bounds, materials, clips). |
| `architecture-interior` | Interiors and architectural walkthrough scenes. |
| `material-authoring` | Material and texture work (`material.*`, PBR maps). |
| `postprocess-scene` | Scenes built around `effects.*` post-processing. |
| `large-scene` | Scenes with many objects (instancing, merge, LOD). |
| `custom-scene` | Blank scene for a custom route (also the landing place for three.js ports). |

The last eight were `three-compat-*` before #700; each old name still scaffolds its template with a deprecation warning until the next minor.

## Games

| Template | Use it for |
| --- | --- |
| `mini-game` | Platformer starter on `game.platformer(...)`: typed asset, keyboard movement, jump, scoring, reset, HUD events. A starter, not proof of production art or game quality. |
| `racing-starter` | Keyboard-playable racing on the public API. |
| `falling-blocks-starter` | Keyboard-playable falling-block game. |
| `fighting-game` | Public game runtime APIs: fighters, hits, rounds. |
| `arena-shooter` | Top-down 60 degree arena shooter on `createGame`: WASD ship, waves. |
| `character-controller` | Input-driven locomotion with the `@aura3d/animation` locomotion kit. |

For games also read `docs/agents/build-playbook.md` (kits, guardrails, assets).

## Animation production (experimental)

`animation-studio` (compact production workspace, skill `aura3d-animation-studio`), `animation-channel`, `prompt-animation-channel` and `episode-builder` are example or experimental pipelines. Do not use them for ordinary scenes.

## Rules for every template route

Template routes may not hide missing engine features behind primitive slop. Object, character, vehicle and world templates get real assets through the CLI, import generated `assets` from `./src/aura-assets` and render with `model(assets.x)`. Primitives are for layout, collision helpers, gauges and minor set dressing. Every public template needs:

- route-health evidence (renderer mode, fallback mode, primary assets, primitive count, claim boundary);
- a desktop and a mobile screenshot checked by pixel analysis;
- source validation: no raw string assets, raw GLB or glTF URLs, `unsafeModelUrl`, `GLTFLoader`, direct `three` imports or CSS and DOM scene effects;
- keyboard or input tests when interactive.

A template without `npm run dev`, `npm run build`, `npm run test`, `tests/route-health.spec.ts` and `tests/screenshot.spec.ts` is `prototype` or `blocked`, never "production-ready".

Prompt-family helpers (`prefabs.particleFountain`, `cityBlock`, `materialSwatches`, `productViewer`, `physicsRamp`, `solarSystem`, `dataBars3D`, `neonTunnel`, `character.lowPolyHumanoid`) and their recipes are in `docs/agents/prompt-to-3d-workflow.md`.

## Evidence descriptor convention

Descriptors passed to `app.evidence({ hud: [...], accessibility: [...] })` (`hudBindings`, `accessibilitySources`, ...) are `as const` arrays: plain mutable literals widen `kind`, `binding` and `feature` to `string` and fail the packed-consumer `tsc` gate (`GameHudBindingDescriptor`, `GameAccessibilitySource`). Omit fields `createGameHudBinding` defaults to `false` (`interactive`, `debugOnly`) unless a binding needs them non-default; keep the descriptor in sync with the canonical binding type.
