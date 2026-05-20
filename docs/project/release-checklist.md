# Release Checklist

Version: 1.0.0

Use this checklist before tagging any Galileo3D release candidate.

## Preflight

- Confirm the package version matches `CHANGELOG.md`, `docs/project/release-process.md`, `docs/project/compatibility.md`, and `docs/project/release-artifacts.json`.
- Confirm the worktree state is intentional.
- Confirm public claims match `docs/project/claim-guidelines.md`, `docs/project/v9-roadmap-claim-boundary.md`, and the historical `docs/project/v2-claim-registry.md`.
- Confirm known limits are current in `docs/project/known-limits.md`.
- Confirm Three.js-related wording matches `docs/project/v9-roadmap-status.md` and `docs/project/v9-roadmap-parity-matrix.md`.

## Verification

Run:

```sh
pnpm verify:claims
pnpm verify:docs-version
pnpm verify:release
pnpm verify:release:repeat
```

The release is blocked if:

- a final report is missing;
- a final report has a stale release-run ID;
- `tests/reports/clean-checkout.json` has `ok: false`, `git.dirty: true`, or missing clean-checkout reproduction fields;
- `tests/reports/release-repeat.json` does not prove rows 81 and 686 in `hardGateRows`;
- a public claim is unregistered;
- the changelog, support, security, contribution, migration, compatibility, and claim guideline docs do not reference the same package version.
- the package version or release artifacts are missing and the release notes imply a versioned public package release.
- the release notes imply full Three.js parity, production readiness, full WebGPU support, Unity/Unreal replacement, or broad superiority while V9 docs still mark the relevant coverage partial or blocked.

## Release Notes

- Summarize user-visible changes.
- List breaking changes and migration notes.
- Link generated reports by path.
- Keep unsupported behavior in known-limits docs rather than implying support.
