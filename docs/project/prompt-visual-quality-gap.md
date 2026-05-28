# Prompt Visual Quality Gap

Generated: 2026-05-28

## Verdict

The current Aura3D screenshots are not product-quality proof.

They prove technical rendering: GLB loading, typed assets, WebGL2 draw calls,
diagnostics, screenshots, route health, and basic visual cues. They do not yet
prove that a prompt produces a visually desirable result.

The current failure mode is clear: a scene can pass because it contains an
imported object plus symbolic effects. Rain can be a set of lines. Cinematic
lighting can be colored bars. A game arena can be primitive shapes around a
robot. That is not enough for the product promise.

## Root Cause

This is both a runtime/product problem and an evaluation problem.

| Layer | Current State | Gap |
|---|---|---|
| Runtime and templates | Can load assets, create scenes, add lights/effects, capture screenshots, and run diagnostics. | Missing enough art-directed presets, visual composition helpers, material fidelity, animation helpers, and believable environment/effect systems. |
| Agent prompt workflow | Agents can write valid Aura3D code from context and typed assets; the public API now includes first-pass `PromptPlan` recipe helpers. | Agents still need to prove they consistently use the prompt-plan path, follow repair guidance, and produce screenshots that meet the prompt. |
| Tests and evidence | Pixel profiles check for route-specific visual cues, and prompt-fidelity reports now reject object-plus-symbolic-effect negative fixtures. | Positive release-facing screenshots still need to reach `product-quality-pass`. |

## Prompt Fidelity Acceptance Bar

A screenshot can be counted as product-quality prompt evidence only if it meets
all of these checks:

- [ ] The image reads as the requested scene without reading the source code.
- [ ] The subject is framed intentionally and is clearly the hero of the scene.
- [ ] Lighting, camera, materials, and environment support the prompt rather
  than appearing as generic decorations.
- [ ] Effects are believable enough for the scene: rain, reflections, glow,
  fog, motion trails, or HUD elements cannot be symbolic marks only.
- [ ] The scene has foreground/background structure, scale, and visual hierarchy.
- [ ] Interactions or state required by the prompt are visible or verifiable.
- [ ] The output is not just one imported object plus symbolic effects.
- [ ] Human review labels it `product-quality-pass`, not only
  `technical-render-pass`.

## Build Checklist

### Runtime Visual Quality

- [ ] Product hero recipe with plinth, backdrop, reflection, studio lights,
  orbit camera, and asset auto-framing.
- [ ] Cinematic recipe with environment depth, practical lights, wet surfaces,
  believable rain volume, fog/haze, bloom, and camera dolly.
- [ ] Mini-game recipe with readable board layout, player state, collectibles,
  hazards, goal, HUD, and animation feedback.
- [ ] Material studio recipe with environment reflections, swatches, labels,
  controlled lights, and texture previews.
- [ ] Asset normalization for scale, origin, bounds, ground alignment, and
  camera distance.
- [ ] Material preservation and fallback reporting for GLB/PBR assets.
- [ ] Contact shadows, reflections, and environment lighting suitable for
  product presentation.
- [ ] Animation helpers for camera movement, idle motion, collection feedback,
  hover/click state, and scene reveals.

### Prompt Workflow

- [x] Define a prompt contract: subject, assets, style, camera, environment,
  lighting, effects, interaction, and acceptance criteria.
- [x] Add scene recipe selection from prompt intent.
- [x] Add agent-facing examples that show how to move from prompt to recipe
  calls rather than placing random primitives.
- [ ] Add repair instructions for low-quality outputs: bad framing, flat
  lighting, missing environment, symbolic effects, tiny subject, or low contrast.
- [ ] Record prompt, selected recipe, asset IDs, and visual criteria in each
  generated report.
- [ ] Re-run the Codex context-only self-test through `definePromptPlan` and
  `promptPlanToScene`.

### Evaluation

- [x] Add `tests/reports/prompt-fidelity-quality.json`.
- [x] Add a contact-sheet artifact for all release-facing screenshots.
- [x] Add human review fields: `product-quality-pass`,
  `technical-render-pass`, `partial`, `fail`.
- [x] Add negative fixtures for object-plus-symbolic-effect scenes and require
  the new gate to fail them.
- [ ] Add positive fixtures that prove three release-facing prompt outputs pass
  `product-quality-pass`.
- [ ] Compare Aura3D prompt output against raw Three.js agent output on the same
  prompts and assets.
- [ ] Re-run Codex context-only eval after the visual recipe layer is built.
- [ ] Re-run Claude Code, Cursor, and Copilot context-only evals when available.

## Current Classification

| Artifact Family | Current Classification | Reason |
|---|---|---|
| Starter template screenshots | `technical-render-pass` | They show real assets and scene cues, but not polished prompt fidelity. |
| Active public example screenshots | `technical-render-pass` | They prove distinct routes and rendering behavior, not visual quality. |
| Codex dogfood screenshot | `partial` | It compiles, runs, uses typed assets, and renders cues, but the visual result still reads as object-plus-symbolic-effect output. |
| External user proof | `not-run` | No outside users have proven prompt-to-visual quality. |

## Stop-Ship Rule

Do not market Aura3D as prompt-to-visual creation until at least three
release-facing prompts produce screenshots that pass the prompt fidelity bar and
outside users confirm they understand and want the result.
