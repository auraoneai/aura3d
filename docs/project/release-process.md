# Release Process

Version: 1.0.0

## Purpose

This document defines the package publishing and semantic-versioning process for A3D/Aura3D. It applies to version `1.0.0` and the current V9 parity-construction docs.

## Versioning Policy

- `1.0.0` is an alpha developer-preview artifact version and must not be described as production-ready.
- Before a stable public release, choose an explicit semver version and update the changelog, migration notes, compatibility matrix, and claim registry together.
- Breaking public API changes require a changelog entry and migration note.
- Strong public claims remain blocked unless `docs/project/claim-guidelines.md`, `docs/project/v9-roadmap-claim-boundary.md`, and the historical `docs/project/v2-claim-registry.md` permit the exact wording.
- V9 parity docs are the current source for Three.js-related release wording. V2 through V8 roadmap docs are historical unless V9 restates their claim.

## Release Candidate Checklist

Run these from a clean checkout:

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
pnpm test:visual
pnpm verify:performance
pnpm verify:demos
pnpm verify:claims
pnpm verify:docs-version
pnpm verify:trace
pnpm verify:release
pnpm verify:release:repeat
```

Required release artifacts:

- `tests/reports/final-release-verification.json`
- `tests/reports/final-requirements-trace.json`
- `tests/reports/final-performance.json`
- `tests/reports/final-demo-validation.json`
- `tests/reports/claim-registry.json`
- `tests/reports/clean-checkout.json`
- `tests/reports/release-repeat.json`
- `CHANGELOG.md`
- `docs/project/security-policy.md`
- `docs/project/support-policy.md`
- `CONTRIBUTING.md`
- `docs/project/v9-roadmap-status.md`
- `docs/project/v9-roadmap-parity-matrix.md`
- `docs/project/v9-roadmap-claim-boundary.md`

For the repeated release hard gate, `tests/reports/release-repeat.json` must include `hardGateRows` with rows 81 and 686 proven. That requires three consecutive successful `pnpm verify:release` runs where each run's clean-checkout report proves `git.dirty: false`.

For independent clean-checkout reproduction, `tests/reports/clean-checkout.json` must show `reproduction.independentMachineOrAgent: true` and include the evidence label/path used by the independent machine or agent. A report from this same dirty workspace is useful blocker evidence only; it does not satisfy the independent reproduction row.

## Publishing Rules

- Do not publish from a dirty worktree.
- Do not publish if any final report has a stale or mismatched release-run ID.
- Do not publish if `pnpm verify:claims` fails.
- Do not publish if release notes contain unregistered public claims.
- Do not publish if release notes imply full Three.js parity, Three.js superiority, complete glTF support, or full WebGPU support while the V9 parity matrix still records partial coverage or blocked claims.
- Do not treat a local `dist/` build or package metadata alignment as a versioned package release.
- The versioned release gate requires `pnpm verify:versioned-release`, which reads `docs/project/release-artifacts.json` and writes `tests/reports/versioned-release.json`.
- Versioned release evidence requires a deliberate non-`0.0.0-rebuild` package version, `private: false`, matching artifact versions, and at least one concrete artifact or publication record.
