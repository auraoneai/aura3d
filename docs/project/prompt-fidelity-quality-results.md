# Prompt Fidelity Quality Results

Generated: 2026-05-28T23:06:13.404Z

## Summary

- Product-quality ready: no
- Release-facing product-quality passes: 0/3
- Contact sheet: `tests/reports/prompt-fidelity/contact-sheet.png`

## Artifact Review

| Artifact | Family | Backend | Prompt Plan | Review Label | Product-Quality Pass | Main Limitation | Next Action |
|---|---|---:|---:|---:|---:|---|---|
| `starter-product-viewer` | `starter-template` | `webgl2` | yes | `technical-render-pass` | no | Starter shows a valid GLB product and studio cues, but not a polished product hero. | Replace starter composition with product-hero recipe using auto-framing, real reflection cards, contact shadows, and stronger material presentation. |
| `starter-cinematic-scene` | `starter-template` | `webgl2` | yes | `technical-render-pass` | no | The scene has rain and lighting cues, but rain can still read as lines. | Build a cinematic recipe with volumetric rain layers, fog, spatial depth, believable reflections, and art-directed camera blocking. |
| `starter-mini-game` | `starter-template` | `webgl2` | yes | `technical-render-pass` | no | The arena is distinct and functional, but still reads as simple props around a robot. | Build a game-arena recipe with HUD, clear state, animated feedback, readable pathing, and interaction proof. |
| `example-typed-asset` | `starter-example` | `n/a` | no | `technical-render-pass` | no | API smoke example, not a release-facing visual demo. | Keep as API evidence or replace with an art-directed typed-asset example. |
| `example-material-lighting` | `starter-example` | `n/a` | no | `technical-render-pass` | no | Useful material cue proof, but not a prompt-generated polished scene. | Move toward a material-studio recipe with environment reflections, labels, and texture previews. |
| `example-camera-path` | `starter-example` | `n/a` | no | `technical-render-pass` | no | Compact route proof, not a cinematic camera-path demo. | Use camera rig presets with visible path staging, keyframes, and before/after framing evidence. |
| `codex-context-self-test` | `agent-context` | `webgl2` | no | `partial` | no | The app compiles, runs, and uses typed assets. | Rerun after visual recipes and prompt-fidelity repair guidance exist. |

## Negative Fixtures

| Fixture | Expected | Actual | Rejected | Reason |
|---|---:|---:|---:|---|
| `single-asset-with-rain-lines` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |
| `primitive-game-board` | `fail` | `fail` | yes | Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar. |

## Current Verdict

The prompt-fidelity audit is working as a guardrail, but the product-quality bar is not met. Current release-facing screenshots remain technical render evidence until at least three prompt outputs pass the product-quality review label.
