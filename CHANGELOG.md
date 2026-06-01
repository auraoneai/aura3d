# Changelog

Version: 1.0.0

All notable changes for Aura3D are tracked here. This project follows source-controlled release notes until a public package release process is approved.

## 1.0.0

### Current Release Candidate Notes

- Aligned public package metadata, API documentation, tutorials, examples, and governance docs on the 1.0.0 release line.
- Kept bounded claim language tied to generated evidence and current readiness reports.
- Added the final proof and go-live inventory for the frozen
  `FinalizedPromptPlan.md` benchmark standard.

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
- Strong claims such as production-ready, better than Three.js, Unity/Unreal replacement, full WebGPU support, or PBR parity remain disallowed unless the product studio gates later approve exact scoped wording.

### Release Status

- `0.1.0-alpha.0` is an internal experimental rebuild version.
- A release candidate requires current report JSON files generated from the same release-run ID and a passing final release verifier.
