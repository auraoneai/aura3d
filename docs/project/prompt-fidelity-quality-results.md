# Prompt Fidelity Quality Results

Generated: 2026-05-29T03:50:49.737Z

## Summary

- Product-quality ready: yes
- Release-facing product-quality passes: 4/3
- Contact sheet: `tests/reports/prompt-fidelity/contact-sheet.png`

## Artifact Review

| Artifact | Family | Recipe | Asset Refs | Backend | Prompt Plan | Review Label | Product-Quality Pass | Review Note | Next Action |
|---|---|---|---|---:|---:|---:|---:|---|---|
| `starter-product-viewer` | `starter-template` | `product-viewer` | `assets.product` | `webgl2` | yes | `product-quality-pass` | yes | Current screenshot reads as a staged product viewer: centered GLB product, plinth/contact, softboxes, rim/reflection cues, and orbit affordance are visible. | Keep as release-facing starter prompt evidence and watch for visual regressions in the contact sheet. |
| `starter-cinematic-scene` | `starter-template` | `cinematic-scene` | `assets.hero` | `webgl2` | yes | `product-quality-pass` | yes | Current screenshot reads as a rainy neon hero shot: hero GLB, alley depth, practical lights, wet reflections, rain volume, and floor splash cues are visible. | Keep as release-facing starter prompt evidence and compare against raw Three.js agent output in the baseline round. |
| `starter-mini-game` | `starter-template` | `mini-game` | `assets.playerModel` | `webgl2` | yes | `product-quality-pass` | yes | Current screenshot reads as a collect-and-dodge game arena: typed player GLB, rails, pathing, health pips, collectibles, hazard, laser gate, portal, and glow feedback are visible. | Keep as release-facing starter prompt evidence and expand future tests toward live interaction proof. |
| `example-typed-asset` | `starter-example` | `none-api-example` | `assets.robot` | `n/a` | no | `technical-render-pass` | no | API smoke example, not a release-facing visual demo. | Keep as API evidence or replace with an art-directed typed-asset example. |
| `example-material-lighting` | `starter-example` | `none-api-example` | `none` | `n/a` | no | `technical-render-pass` | no | Useful material cue proof, but not a prompt-generated polished scene. | Move toward a material-studio recipe with environment reflections, labels, and texture previews. |
| `example-camera-path` | `starter-example` | `none-api-example` | `none` | `n/a` | no | `technical-render-pass` | no | Compact route proof, not a cinematic camera-path demo. | Use camera rig presets with visible path staging, keyframes, and before/after framing evidence. |
| `codex-context-self-test` | `agent-context` | `cinematic-scene` | `assets.agentProduct` | `webgl2` | yes | `product-quality-pass` | yes | The app compiles, runs, uses typed assets, and the screenshot reads as a rainy product reveal with alley framing, practical lights, wet floor cues, and layered rain. | Use this as Codex context-only evidence, then run Claude Code, Cursor, and Copilot separately when available. |

## Repair Guidance

| Artifact | Repair Hints |
|---|---|
| `starter-product-viewer` | Preserve the plinth, contact shadow, softbox cards, reflection strips, and subject framing in future recipe changes. Fail this artifact if the product becomes tiny, loses the studio staging, or needs diagnostics text to explain the scene. |
| `starter-cinematic-scene` | Preserve foreground/background alley framing, layered rain, puddle/splash cues, and warm/cool practical contrast. Fail this artifact if rain collapses back to sparse lines or the scene becomes a lone model on a dark floor. |
| `starter-mini-game` | Preserve visible player state, pathing, hazards, collectibles, goal portal, and feedback cues. Fail this artifact if the screenshot returns to a character beside unrelated primitives. |
| `example-typed-asset` | Keep this route as API evidence or rebuild it as a product-hero recipe with typed asset trace. Do not promote it as prompt fidelity until it has prompt, plan, route-health, and product-quality review evidence. |
| `example-material-lighting` | Convert the route to a material-studio prompt plan with asset refs, swatches, and expected visual criteria. Add stronger environment reflections and texture previews before treating it as product-quality proof. |
| `example-camera-path` | Replace marker-only proof with a visible camera rig, path staging, keyframes, and before/after framing evidence. Add prompt-plan trace and visual review before using this as a camera-path product demo. |
| `codex-context-self-test` | Preserve the prompt-plan recipe path, compiled repair hints, typed asset refs, and screenshot profile checks. Fail this artifact if a future self-test bypasses definePromptPlan/promptPlanToScene or loses rainy product-reveal fidelity. |

## Negative Fixtures

| Fixture | Expected | Actual | Rejected | Reason |
|---|---:|---:|---:|---|
| `single-asset-with-rain-lines` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |
| `primitive-game-board` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |

## Current Verdict

The prompt-fidelity audit now has enough release-facing product-quality screenshots for the starter prompt recipes. This does not close external agent, external deployment, wild-asset, marketing comprehension, or outside beta evidence gaps.
