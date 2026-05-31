# Changelog

Version: 1.0.0

All notable changes for Aura3D are tracked here. This project follows source-controlled release notes until a public package release process is approved.

## 1.0.0

### Current Release

- Aligned public package metadata, API documentation, tutorials, examples, and governance docs on the 1.0.0 release line.
- Kept bounded claim language tied to generated evidence and current readiness reports.
- Added the final proof and go-live inventory for the frozen
  `FinalizedPromptPlan.md` benchmark standard.

### Release Proof Gate

- 1.0.0 is not go-live ready until a full neutral benchmark round passes and
  the release notes cite the passing `benchmark/results/round-N.md`,
  `benchmark/results/round-N-engine.md`, and
  `benchmark/results/round-N-decision.md` files.
- `benchmark/results/round-7.md`,
  `benchmark/results/round-7-engine.md`, and
  `benchmark/results/round-7-decision.md` record the latest complete failed
  round and cannot be used as shipping evidence.

## 0.1.0-alpha.0

### Governance

- Added product studio governance requirements for support, security, contribution, release, migration, compatibility, and claim-guideline documentation.
- Public release language for this version must follow `docs/project/product-studio-claim-registry.md`.
- Strong claims such as production-ready, better than Three.js, Unity/Unreal replacement, full WebGPU support, or PBR parity remain disallowed unless the product studio gates later approve exact scoped wording.

### Release Status

- `0.1.0-alpha.0` is an internal experimental rebuild version.
- A release candidate requires current report JSON files generated from the same release-run ID and a passing final release verifier.
