# Aura3D vs Three.js Benchmark

This directory is the release proof package for Aura3D.

The benchmark answers one question:

> Can AI coding agents produce better browser 3D apps with Aura3D than with raw Three.js on the same prompts?

`FinalizedPromptPlan.md` is the source of truth. This directory makes that plan executable by filename.

## Files

- `prompts/` contains the frozen 10 benchmark prompts.
- `prompts/manifest.md` freezes prompt order and filenames.
- `rubric.md` defines the frozen scoring rubric.
- `protocol.md` defines the run protocol and anti-drift rules.
- `engine/README.md` defines the non-agent engine parity benchmark.
- `runs/README.md` defines the required output directory structure.
- `scoring/README.md` defines the neutral scoring handoff.
- `assets/README.md` documents the required product-viewer GLB fixture.
- `assets/sneaker.glb` is required before Phase A can exit.
- `results/template.md` is the required results format.

## Release Rule

Internal repo tools can support debugging, but they cannot score this benchmark and cannot decide release readiness. Scoring must be done by a neutral human reviewer or an opposite-vendor model using only the prompt, screenshot, code listing, and captured metrics.

The prompt benchmark measures agent productivity and visual outcomes. The engine benchmark measures whether Aura3D remains competitive with hand-authored Three.js scenes when the agent layer is removed from the comparison.

## Status

Phase A is not complete until every required file above exists and `assets/sneaker.glb` is committed from a clearly licensed source.
