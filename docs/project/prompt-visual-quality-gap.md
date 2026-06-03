# Prompt Visual Quality Gap

Status: historical supporting note.

This document records the old starter-template visual-quality cleanup. It is
not the current release standard. The current benchmark-superiority standard is the neutral Aura3D versus manual renderer code benchmark defined in `docs/project/frozen-benchmark-release-gates.md` and `benchmark/protocol.md`. Scoped SDK/product-context release evidence is tracked in `docs/project/release-tracks.md`.

Generated: 2026-05-29

## Verdict

The approved starter prompt recipes now pass screenshot-level product-quality
review.

`product-viewer`, `cinematic-scene`, `mini-game`, and the deterministic Codex
context self-test now produce screenshots that a human reviewer can identify as
matching their prompts without reading source code. The prompt-fidelity report
records those artifacts as `product-quality-pass`.

The broad prompt-to-visual quality is still not fully proven. The current pass
applies to the approved starter recipes and deterministic Codex dogfood, not to
arbitrary prompts, arbitrary GLB assets, external agents, outside users, or
public deployment environments.

## Root Cause

This is both a runtime/product problem and an evaluation problem.

| Layer | Current State | Gap |
|---|---|---|
| Runtime and templates | Can load assets, create scenes, add lights/effects, capture screenshots, run diagnostics, and produce product-quality starter screenshots for product viewer, cinematic scene, and mini-game recipes. | Needs broader recipe coverage, material fidelity, richer animation helpers, and corpus evidence across arbitrary assets. |
| Agent prompt workflow | Agents can write valid Aura3D code from context and typed assets; the public API includes `PromptPlan` recipe helpers; deterministic Codex dogfood now passes product-quality visual review. | Claude Code, Cursor, Copilot, repair-loop turns, and outside-user agent runs remain unproven. |
| Tests and evidence | Pixel profiles check route-specific visual cues, prompt-fidelity rejects object-plus-symbolic-effect negative fixtures, positive starter screenshots now reach `product-quality-pass`, and the effects/VFX audit now catches no-op/stub/metric-only surfaces while producing a browser contact sheet. | More positive fixtures, broad asset coverage, external deployment, marketing comprehension, beta dogfood, and route-level VFX polish screenshots remain open. |

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

- [x] Product hero recipe with plinth, backdrop, reflection, studio lights,
  orbit camera, and asset auto-framing.
- [x] Cinematic recipe with environment depth, practical lights, wet surfaces,
  believable rain volume, fog/haze, bloom, and camera dolly.
- [x] Mini-game recipe with readable board layout, player state, collectibles,
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
- [x] Broader VFX/postprocess starter/helper audit: production-runtime
  postprocess classes execute pixel kernels, three-compat postprocess can run
  pixel kernels, and particle/cinematic VFX have a browser contact sheet.
- [ ] Route-level premium VFX proof: add screenshots and human review before
  claiming particle, fog, glow, wet reflection, or compatibility VFX as polished
  production systems.

### Prompt Workflow

- [x] Define a prompt contract: subject, assets, style, camera, environment,
  lighting, effects, interaction, and acceptance criteria.
- [x] Add scene recipe selection from prompt intent.
- [x] Add agent-facing examples that show how to move from prompt to recipe
  calls rather than placing random primitives.
- [x] Add repair instructions for low-quality outputs: bad framing, flat
  lighting, missing environment, symbolic effects, tiny subject, or low contrast.
- [x] Record prompt, selected recipe, asset IDs, and visual criteria in each
  generated report.
- [x] Re-run the Codex context-only self-test through `definePromptPlan` and
  `promptPlanToScene`.

### Evaluation

- [x] Previously added a local prompt-fidelity report. That report has now
      been removed from the release gate because the current standard requires
      neutral Aura3D versus manual renderer code benchmark scoring.
- [x] Add a contact-sheet artifact for all release-facing screenshots.
- [x] Add human review fields: `product-quality-pass`,
  `technical-render-pass`, `partial`, `fail`.
- [x] Add negative fixtures for object-plus-symbolic-effect scenes and require
  the new gate to fail them.
- [x] Add positive fixtures that prove three release-facing prompt outputs pass
  `product-quality-pass`.
- [ ] Compare Aura3D prompt output against manual renderer code agent output on the same
  prompts and assets.
- [x] Re-run Codex context-only eval after the visual recipe layer is built.
- [ ] Re-run Claude Code, Cursor, and Copilot context-only evals when available.

## Current Classification

| Artifact Family | Current Classification | Reason |
|---|---|---|
| Starter template screenshots | `product-quality-pass` | The product viewer, cinematic scene, and mini-game screenshots visibly match their prompts and are backed by route-health, screenshot profiles, and prompt-fidelity review. |
| Active public example screenshots | `technical-render-pass` | They prove distinct routes and rendering behavior, not visual quality. |
| Codex dogfood screenshot | `product-quality-pass` | It compiles, runs, uses typed assets, renders through the prompt-plan path, records the compiled prompt-plan report, and now visually reads as a rainy product reveal. |
| External user proof | `not-run` | No outside users have proven prompt-to-visual quality. |

## Stop-Ship Rule

Starter-recipe prompt-to-visual claims may use the three passing starter
screenshots. Do not market Aura3D as broadly solving arbitrary prompt-to-visual
creation until external agents, broader assets, public deployments, marketing
comprehension, and outside users confirm they understand and want the result.
