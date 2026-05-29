# Prompt Fidelity Quality Results

Generated: 2026-05-29T06:07:56.070Z

## Summary

- Product-quality ready: yes
- Release-facing product-quality passes: 4/3
- Contact sheet: `tests/reports/prompt-fidelity/contact-sheet.png`
- Before/after contact sheet: `tests/reports/prompt-fidelity/before-after-contact-sheet.png`
- Starter before/after cases: 3/3

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
| `generic-product-on-grid` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |
| `single-asset-with-rain-lines` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |
| `primitive-game-board` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |

## Repair Loop Evidence

| Case | Failed Fixture | Repaired Artifact | Turn Count | Repaired Label | Applied Repair Hints |
|---|---|---|---:|---:|---|
| `generic-product-grid-to-studio-viewer-repair` | `generic-product-on-grid` | `starter-product-viewer` | 1 | `product-quality-pass` | Use a typed product asset reference instead of an unrelated primitive. Add plinth/contact grounding, softbox cards, rim/reflection cues, and product-centered camera framing. Expose an orbit-style viewer affordance and keep diagnostics as verification, not as the visual proof. |
| `symbolic-rain-to-cinematic-repair` | `single-asset-with-rain-lines` | `starter-cinematic-scene` | 1 | `product-quality-pass` | Add foreground, midground, and background alley structure. Replace sparse symbolic lines with layered rain, wet reflection strips, splash cues, fog, and practical lights. Use a tighter dolly camera and visible warm/cool light separation. |
| `primitive-board-to-game-arena-repair` | `primitive-game-board` | `starter-mini-game` | 1 | `product-quality-pass` | Add visible player state and HUD-like health/score cues. Add hazards, collectible coins, a route cue, a goal portal, and interaction feedback. Use a game-board camera with readable arena boundaries. |

## Starter Before/After Evidence

The before screenshots are controlled failure fixtures, not historical screenshots. They make the rejected visual pattern concrete so the after screenshots can be reviewed against the source prompt and corrected failure mode.

| Starter | Source Prompt | Failure Mode Corrected | Before Screenshot | Generated Code Path | After Screenshot | Human Verdict | Review Evidence |
|---|---|---|---|---|---|---:|---|
| `product-viewer` | Product viewer starter with a product centered in a studio setup. | Generic centered object on a grid with no studio staging, no product material cues, and no viewer affordance. | `tests/reports/prompt-fidelity/before-after/starter-product-viewer-before.png` | `packages/create-aura3d/templates/product-viewer/src/main.ts` | `tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png` | `product-quality-pass` | plinth/contact grounding, softbox cards, rim/reflection cues, product-centered camera, orbit affordance |
| `cinematic-scene` | Cinematic rainy hero scene with wet floor, practical lights, and camera dolly. | Single hero object with sparse symbolic rain lines and no alley depth, wet response, fog, practical lights, or camera drama. | `tests/reports/prompt-fidelity/before-after/starter-cinematic-scene-before.png` | `packages/create-aura3d/templates/cinematic-scene/src/main.ts` | `tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png` | `product-quality-pass` | layered rain, wet reflections, alley depth, warm/cool practical lights, dolly-style framing |
| `mini-game` | Mini-game arena with player, collectibles, hazards, goal, and readable game state. | A player marker beside unrelated primitives with no arena route, HUD state, collectible logic, hazards, goal, or feedback cues. | `tests/reports/prompt-fidelity/before-after/starter-mini-game-before.png` | `packages/create-aura3d/templates/mini-game/src/main.ts` | `tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png` | `product-quality-pass` | player state, arena rails, collectibles, hazards, goal portal, feedback glow |

## Current Verdict

The prompt-fidelity audit now has enough release-facing product-quality screenshots for the starter prompt recipes. This does not close external agent, external deployment, wild-asset, marketing comprehension, or outside beta evidence gaps.
