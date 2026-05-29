# Prompt Fidelity Quality Results

Generated: 2026-05-29T01:10:49.669Z

## Summary

- Product-quality ready: no
- Release-facing product-quality passes: 0/3
- Contact sheet: `tests/reports/prompt-fidelity/contact-sheet.png`

## Artifact Review

| Artifact | Family | Recipe | Asset Refs | Backend | Prompt Plan | Review Label | Product-Quality Pass | Main Limitation | Next Action |
|---|---|---|---|---:|---:|---:|---:|---|---|
| `starter-product-viewer` | `starter-template` | `product-viewer` | `assets.product` | `webgl2` | yes | `technical-render-pass` | no | Starter shows a valid GLB product and studio cues, but not a polished product hero. | Replace starter composition with product-hero recipe using auto-framing, real reflection cards, contact shadows, and stronger material presentation. |
| `starter-cinematic-scene` | `starter-template` | `cinematic-scene` | `assets.hero` | `webgl2` | yes | `technical-render-pass` | no | The scene has rain and lighting cues, but rain can still read as lines. | Build a cinematic recipe with volumetric rain layers, fog, spatial depth, believable reflections, and art-directed camera blocking. |
| `starter-mini-game` | `starter-template` | `mini-game` | `assets.playerModel` | `webgl2` | yes | `technical-render-pass` | no | The arena is distinct and functional, but still reads as simple props around a robot. | Build a game-arena recipe with HUD, clear state, animated feedback, readable pathing, and interaction proof. |
| `example-typed-asset` | `starter-example` | `none-api-example` | `assets.robot` | `n/a` | no | `technical-render-pass` | no | API smoke example, not a release-facing visual demo. | Keep as API evidence or replace with an art-directed typed-asset example. |
| `example-material-lighting` | `starter-example` | `none-api-example` | `none` | `n/a` | no | `technical-render-pass` | no | Useful material cue proof, but not a prompt-generated polished scene. | Move toward a material-studio recipe with environment reflections, labels, and texture previews. |
| `example-camera-path` | `starter-example` | `none-api-example` | `none` | `n/a` | no | `technical-render-pass` | no | Compact route proof, not a cinematic camera-path demo. | Use camera rig presets with visible path staging, keyframes, and before/after framing evidence. |
| `codex-context-self-test` | `agent-context` | `cinematic-scene` | `assets.agentProduct` | `webgl2` | yes | `partial` | no | The app compiles, runs, and uses typed assets. | Apply compiled repair hints, upgrade cinematic recipe depth/effects, then rerun human product-quality review. |

## Repair Guidance

| Artifact | Repair Hints |
|---|---|
| `starter-product-viewer` | Tighten the camera around the product so it fills the hero area without diagnostics carrying the story. Add visible contact shadow, reflection cards, and material highlights that make the product feel staged rather than placed. Add inspection affordances or a visible orbit state before using this as a product-viewer proof. |
| `starter-cinematic-scene` | Layer rain into foreground, subject, and background depth rather than only overlaying long streaks. Increase wet-surface response with reflected practical lights and visible floor bounce around the hero asset. Add stronger alley depth and camera blocking so the screenshot reads as a composed cinematic shot. |
| `starter-mini-game` | Add HUD-like score, health, timer, or objective state that is visible in the screenshot. Make player pathing, hazards, collectibles, and goal affordances readable without reading object names. Add animated feedback markers for collection, damage, boost, or goal progress before product-quality review. |
| `example-typed-asset` | Keep this route as API evidence or rebuild it as a product-hero recipe with typed asset trace. Do not promote it as prompt fidelity until it has prompt, plan, route-health, and product-quality review evidence. |
| `example-material-lighting` | Convert the route to a material-studio prompt plan with asset refs, swatches, and expected visual criteria. Add stronger environment reflections and texture previews before treating it as product-quality proof. |
| `example-camera-path` | Replace marker-only proof with a visible camera rig, path staging, keyframes, and before/after framing evidence. Add prompt-plan trace and visual review before using this as a camera-path product demo. |
| `codex-context-self-test` | Use the compiled prompt-plan repair hints to add scene depth, stronger wet reflection response, and believable rain layers. Keep the label `partial` until a human review can identify the requested rainy product reveal from the screenshot alone. |

## Negative Fixtures

| Fixture | Expected | Actual | Rejected | Reason |
|---|---:|---:|---:|---|
| `single-asset-with-rain-lines` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |
| `primitive-game-board` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |

## Current Verdict

The prompt-fidelity audit is working as a guardrail, but the product-quality bar is not met. Current release-facing screenshots remain technical render evidence until at least three prompt outputs pass the product-quality review label.
