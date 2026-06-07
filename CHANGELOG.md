# Changelog

Version: 1.0.9

All notable changes for Aura3D are tracked here. Public release claims must stay scoped to the evidence recorded in the matching release-gate documents.

## 1.0.9

### 1.0.9 Highlights

- Published `@aura3d/engine`, `@aura3d/cli`, `@aura3d/asset-index`, and `create-aura3d` at `1.0.9`.
- Added the scoped Aura Clash Arena release path with contextual source names, typed fighter assets, deployed route proof, performance gates, and npm/package-readiness reports.
- Added `TypedGLBActor` production-runtime support as the public source direction for typed, skinned GLB actor evidence.
- Tightened the AI asset-catalog CLI profile flow for fighting-character search, resolve, and validation, including rejection diagnostics for unsuitable candidates.
- Updated public docs, README, `llms.txt`, marketing copy, and deployed routes to use scoped 1.0.9 wording.
- Deprecated older npm versions below 1.0.9 to reduce accidental installs of the broken earlier release line.

### 1.0.9 Release Notes

- Aura3D 1.0.9 is a scoped runtime-foundation release. It is not a Unity replacement, Unreal competitor, Babylon.js parity claim, or mature commercial game-engine claim.
- Aura Clash Arena is a development showcase and browser runtime proof target. It is not yet a flagship-quality fighting game.
- Current published artifact evidence is recorded in `docs/project/release-artifacts.json`.
- Current scoped release gates are recorded in `docs/project/aura3d-109-release-gates.md`.

## 1.0.6 - 1.0.8

### Iteration Notes

- These internal release lines covered the hard reset from failed Aura Clash route attempts to contextual `playable/` source, release-gate tooling, docs-claim scanning, versioned-source-name checks, CLI/catalog profile proof, and deployment proof.
- The detailed gap analysis remains in `docs/project/aura3d-106-game-engine-and-showcase-prd.md` and `docs/project/aura3d-107-prd.md`; not every peer-grade game-engine task in those planning docs is complete.

## 1.0.5

### 1.0.5 Highlights

- Added release evidence for skeletal animation playback, clip restart, clip blending, animation events, and viseme/blendshape synchronization.
- Added editor-runtime timeline, inspector, project serialization, and visual graph bridge evidence for the first 1.0.5 authoring-tools release lane.
- Added visual scripting runtime bridge evidence for deterministic frame, animation-event, combat, camera, and snapshot graph hooks.
- Added strict Aura Clash asset provenance evidence with typed asset names, source paths, CC0 license evidence, sha256 checksums, and no-placeholder validation.
- Added fighting-game, cartoon-channel, and prompt-cartoon-channel starter smoke evidence with browser-generated first-frame screenshots.

### 1.0.5 Release Candidate Notes

- Public package metadata is aligned on `1.0.5` across the workspace package manifests.
- The 1.0.5 readiness report passes with concrete reports and PNG evidence under `tests/reports/aura3d105/`.
- Aura Clash launch screenshots remain optional showcase evidence in the 1.0.5 verifier, not package-release blockers.
- Broad production, marketplace, or engine-superiority claims remain governed by the existing claim registry and external proof policies.

## 1.0.4

### 1.0.4 Highlights

- Added the federated Aura3D asset catalog release track through `@aura3d/asset-index`, the hosted Cloudflare `/search` endpoint, source adapters, semantic ranking seams, license normalization, and refresh/index interfaces.
- Wired the Aura3D CLI asset workflow to the hosted catalog through `assets search` and `assets resolve`, so AI agents can resolve named real-world objects to license-aware, typed GLB/glTF assets instead of primitives or hallucinated URLs.
- Added prompt-plan intent resolution to the public agent API with unresolved intent subjects, resolved asset subjects, resolver injection, subject type guards, and compile-time refusal for unresolved prompt assets.
- Updated `llms.txt` and agent docs with catalog-first, no-three.js, no-`GLTFLoader`, no raw-URL guidance for prompt-to-3D workflows.
- Folded the Aura3D game-runtime and prompt-animation source contracts into the 1.0.4 release line, including frame-loop, input, fighting-game source helpers, runtime evidence, prompt episode, caption, AuraVoice bridge, viseme, and deterministic screenshot metadata APIs.
- Added 1.0.4 release documentation for the catalog worker, D1 index, source adapters, CLI bridge, prompt resolver seam, operational proof gates, and known loose ends.

### 1.0.4 Release Candidate Notes

- Public package metadata is aligned on `1.0.4` across the workspace package manifests.
- Current docs, governance checklists, and public API reference metadata now target the `1.0.4` release line.
- Publication remains blocked until fresh install/build/typecheck/smoke/browser/deployment/catalog proof evidence is generated from this exact source tree.
- Broad competitive or production superiority claims remain blocked unless they cite current, committed, neutral evidence. The catalog and runtime work support the launch story, but do not replace release proof gates.

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
