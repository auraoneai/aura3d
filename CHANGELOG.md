# Changelog

Version: 1.0.0

All notable changes for Aura3D are tracked here. This project follows source-controlled release notes until a public package release process is approved.

## 1.0.0

### 1.0.0 Highlights

- Agent-friendly TypeScript browser 3D SDK for prompt-to-code workflows.
- Scene kits for AI-generated physics, particles, data visualization, material labs, mini-games, cities, humanoids, and typed product viewers.
- Typed GLB/glTF asset workflow through the Aura3D CLI, generated refs, hashed assets, and anti-hallucination rules.
- Vite starter templates for product viewers, cinematic browser 3D scenes, and interactive mini-games.
- Public `@aura3d/engine` API surface for scenes, cameras, lights, materials, effects, interactions, physics, UI, and diagnostics.
- Route-health diagnostics, screenshot evidence, and static deploy checks for browser 3D apps.
- Scoped claim boundaries that separate the SDK/product-context launch path from the unfinished frozen benchmark-superiority proof.

### Current Release Candidate Notes

- Aligned public package metadata, API documentation, tutorials, examples, and governance docs on the 1.0.0 release line.
- Kept bounded claim language tied to generated evidence and current readiness reports.
- Added the final proof and go-live inventory for the frozen
  `UnifiedPRD.md` benchmark standard.


### Scoped SDK/Product-Context Candidate Notes

These notes are scoped to the original AI-agent SDK/product-context launch track only. They do not claim that Aura3D has passed the frozen AI-agent benchmark against manual renderer code.

Completed scoped evidence currently includes:

- Public agent-facing API and typed asset workflow documentation.
- Scene-kit-first guidance in `llms.txt` and agent docs.
- Prompt-plan compile/repair guidance for agent-authored apps.
- Starter template, deployment, screenshot, and diagnostics documentation.
- Fresh Round 50 prompt PNG/contact-sheet artifacts under `benchmark/runs/round-50/`, including 40/40 prompt screenshots and comparison contact sheets.
- Round 50 local visual-QA prompt-matrix smoke preflight, tone proof, engine parity summary, review/scoring packet, release-readiness inventory, user-approval artifact, and scoped owner bypass artifact.
- Benchmark tooling updates for `UnifiedPRD.md` as the single source of truth, scoring handoff docs, prompt-matrix setup, prompt capture, and renderer-proof artifacts.
- Official Round 50 result-file paths exist for handoff and traceability: `benchmark/results/round-50.md`, `benchmark/results/round-50-engine.md`, and `benchmark/results/round-50-decision.md`.

Still not completed for broad launch:

- Neutral-human visual review was owner-skipped for the current move-on workstream; `benchmark/runs/round-50/human-review.json` is not present and the frozen benchmark pass is not proven.
- External prompt score files were owner-skipped for the current move-on workstream; `benchmark/scoring/round-50-scores/*.json` is not present and the frozen benchmark pass is not proven.
- Round 50 decision remains `Decision: pending`, not `Decision: ship`.
- Release-proof guard pass.
- npm publish or public go-live evidence.

### Round 50 Scoped Move-On Boundary

- `benchmark/results/round-50-benchmark-gate-bypass.md` records the owner direction to skip `benchmark/runs/round-50/human-review.json` and `benchmark/scoring/round-50-scores/*.json` for the next workstream.
- This scoped move-on boundary allows package/docs/release-prep work to continue, but it does not support the claim that Aura3D passed the frozen externally scored Aura3D-vs-manual renderer code benchmark.
- Any public launch copy must stay on the scoped SDK/product-context claim unless the skipped neutral-review and external-scoring artifacts are later supplied and the release-proof guard passes.

### Release Proof Gate

- 1.0.0 is not go-live ready until a full neutral benchmark round passes and
  the release notes cite the passing `benchmark/results/round-N.md`,
  `benchmark/results/round-N-engine.md`, and
  `benchmark/results/round-N-decision.md` files.
- `benchmark/results/round-12.md` and
  `benchmark/results/round-12-decision.md` record the latest complete failed
  prompt round and cannot be used as shipping evidence.
- `benchmark/results/round-12-engine.md` records a passing engine benchmark,
  but it is not enough to ship without a passing prompt benchmark.
- Round 13 repair work was committed in `d1a533f`, but explicit human sign-off
  for that benchmark standard is not currently recorded. Round 13 is not a
  passing result and cannot be cited as shipping evidence.

## 0.1.0-alpha.0

### Governance

- Added product studio governance requirements for support, security, contribution, release, migration, compatibility, and claim-guideline documentation.
- Public release language for this version must follow `docs/project/product-studio-claim-registry.md`.
- Strong claims such as production-ready, better than manual renderer code, Unity/Unreal replacement, full WebGPU support, or PBR parity remain disallowed unless the product studio gates later approve exact scoped wording.

### Release Status

- `0.1.0-alpha.0` is an internal experimental rebuild version.
- A release candidate requires current report JSON files generated from the same release-run ID and a passing final release verifier.
